"""Query the Tableflow Iceberg tables with DuckDB.

Tableflow continuously materializes the demand_windowed, demand_forecast and
stockout_risk topics as Iceberg tables. This script reads them through the
Tableflow Iceberg REST catalog (PyIceberg, vended credentials) and answers the
questions from the use-case card with plain SQL in DuckDB:

  1. Forecast accuracy (MAPE / WAPE / band coverage) per SKU-region-channel
  2. Streaming forecast vs a "stale batch" baseline (same hour yesterday)
  3. Promo lift per SKU
  4. Stockout / overstock exposure
  5. Export a feature table for model retraining (Parquet)

    python -m analytics.query_iceberg
    python -m analytics.query_iceberg --offline     # synthetic data, no cloud
"""

from __future__ import annotations

import argparse
import os
from pathlib import Path

import duckdb

from common.config import ROOT, require

OUT_DIR = ROOT / "analytics" / "out"
TABLES = ("demand_windowed", "demand_forecast", "stockout_risk")

QUERIES = {
    "Forecast accuracy by SKU / region / channel (one-step-ahead, last 6 simulated days)": """
        WITH scored AS (
          SELECT sku, region, channel, window_end, units_sold AS actual,
                 LAG(forecast_next) OVER w AS predicted,
                 LAG(lower_next)    OVER w AS lower_b,
                 LAG(upper_next)    OVER w AS upper_b
          FROM demand_forecast
          WINDOW w AS (PARTITION BY sku, region, channel ORDER BY window_end)
        )
        SELECT sku, region, channel,
               COUNT(*)                                                         AS periods,
               ROUND(100 * AVG(ABS(actual - predicted) / actual) FILTER (WHERE actual > 0), 1) AS mape_pct,
               ROUND(100 * SUM(ABS(actual - predicted)) / NULLIF(SUM(actual), 0), 1)          AS wape_pct,
               ROUND(100 * AVG(CASE WHEN actual BETWEEN lower_b AND upper_b THEN 1 ELSE 0 END), 1) AS band_coverage_pct
        FROM scored
        WHERE predicted IS NOT NULL
        GROUP BY ALL
        ORDER BY wape_pct DESC
        LIMIT 15
    """,
    "Streaming forecast vs stale batch baseline (WAPE, lower is better)": """
        WITH scored AS (
          SELECT sku, units_sold AS actual,
                 LAG(forecast_next) OVER w           AS streaming_forecast,
                 LAG(units_sold, {periods_per_day}) OVER w AS batch_forecast
          FROM demand_forecast
          WINDOW w AS (PARTITION BY sku, region, channel ORDER BY window_end)
        )
        SELECT sku,
               ROUND(100 * SUM(ABS(actual - streaming_forecast)) / NULLIF(SUM(actual), 0), 1) AS streaming_wape_pct,
               ROUND(100 * SUM(ABS(actual - batch_forecast))     / NULLIF(SUM(actual), 0), 1) AS batch_wape_pct,
               ROUND(100 * (1 - SUM(ABS(actual - streaming_forecast)) / NULLIF(SUM(ABS(actual - batch_forecast)), 0)), 1)
                                                                                                AS error_reduction_pct
        FROM scored
        WHERE streaming_forecast IS NOT NULL AND batch_forecast IS NOT NULL
        GROUP BY sku
        ORDER BY error_reduction_pct DESC
    """,
    "Promo lift per SKU (units per period, promo vs no promo)": """
        SELECT sku,
               ROUND(AVG(units_sold) FILTER (WHERE NOT promo_active), 2)  AS avg_units_no_promo,
               ROUND(AVG(units_sold) FILTER (WHERE promo_active), 2)      AS avg_units_promo,
               ROUND(100 * (AVG(units_sold) FILTER (WHERE promo_active)
                            / NULLIF(AVG(units_sold) FILTER (WHERE NOT promo_active), 0) - 1), 1) AS lift_pct,
               COUNT(*) FILTER (WHERE promo_active)                      AS promo_periods
        FROM demand_windowed
        GROUP BY sku
        ORDER BY lift_pct DESC NULLS LAST
    """,
    "Stockout and overstock exposure (share of periods per risk level)": """
        SELECT sku,
               ROUND(100 * AVG(CASE WHEN risk_level = 'OUT_OF_STOCK' THEN 1 ELSE 0 END), 1) AS out_of_stock_pct,
               ROUND(100 * AVG(CASE WHEN risk_level = 'HIGH' THEN 1 ELSE 0 END), 1)         AS high_risk_pct,
               ROUND(100 * AVG(CASE WHEN risk_level = 'OVERSTOCK' THEN 1 ELSE 0 END), 1)    AS overstock_pct,
               SUM(suggested_replenishment_units)                                          AS total_suggested_units
        FROM stockout_risk
        GROUP BY sku
        ORDER BY out_of_stock_pct DESC, high_risk_pct DESC
    """,
}

TRAINING_SET = """
    SELECT sku, region, channel, window_end,
           EXTRACT(hour FROM window_end)                             AS wall_clock_hour,
           units_sold, views, cart_adds, promo_active, promo_discount_pct,
           LAG(units_sold, 1)  OVER w                                AS units_lag_1,
           LAG(units_sold, 6)  OVER w                                AS units_lag_6,
           LAG(units_sold, {periods_per_day}) OVER w                 AS units_lag_1d,
           AVG(units_sold) OVER (w ROWS BETWEEN 6 PRECEDING AND 1 PRECEDING) AS units_avg_6,
           forecast_next                                             AS streaming_forecast_next,
           LEAD(units_sold) OVER w                                   AS label_units_next
    FROM demand_forecast
    WINDOW w AS (PARTITION BY sku, region, channel ORDER BY window_end)
"""


def load_from_tableflow(con: duckdb.DuckDBPyConnection):
    from pyiceberg.catalog import load_catalog

    catalog = load_catalog(
        "tableflow",
        **{
            "type": "rest",
            "uri": require("TABLEFLOW_CATALOG_URI"),
            "credential": f"{require('TABLEFLOW_API_KEY')}:{require('TABLEFLOW_API_SECRET')}",
            "s3.region": os.getenv("CLOUD_REGION", "us-east-1"),
        },
    )
    namespace = require("KAFKA_CLUSTER_ID")
    print(f"Tableflow catalog namespaces: {catalog.list_namespaces()}")
    for name in TABLES:
        table = catalog.load_table((namespace, name))
        arrow = table.scan().to_arrow()
        con.register(name, arrow)
        print(f"  loaded {namespace}.{name}: {arrow.num_rows:,} rows, snapshot {table.current_snapshot().snapshot_id if table.current_snapshot() else '-'}")


def load_offline(con: duckdb.DuckDBPyConnection, profile_name: str | None):
    """Synthetic tables from the local simulator + exponential smoothing, for trying the SQL without a cloud environment."""
    import time
    from collections import defaultdict
    from datetime import datetime, timezone

    import pyarrow as pa

    from common.config import load_profile
    from datagen.simulator import Simulator

    sim = Simulator(load_profile(profile_name), seed=3)
    period_ms = sim.period_ms
    now = int(time.time() * 1000)
    start = now - now % period_ms - 144 * period_ms
    hero = next((p["sku"] for p in sim.profile["products"] if p.get("hero_launch")), sim.profile["products"][0]["sku"])
    promo_sku = sim.profile["products"][0]["sku"]
    rows, risk_rows, level = [], [], {}
    for i in range(144):
        t = start + i * period_ms
        if i == 100:
            sim.start_launch(hero, now_ms=t)
        if i in (40, 110):
            sim.start_promo(promo_sku, now_ms=t)
        units, views, promo = defaultdict(float), defaultdict(int), defaultdict(float)
        for ev in sim.generate_period(t):
            v = ev.value
            if ev.topic in ("orders", "pos_sales"):
                k = (v["sku"], v["region"], "ONLINE" if ev.topic == "orders" else "STORE")
                units[k] += v["units"]
                promo[k] = max(promo[k], v["discount_pct"])
            elif ev.topic == "clickstream":
                views[(v["sku"], v["region"], "ONLINE")] += 1
        we = datetime.fromtimestamp((t + period_ms) / 1000, tz=timezone.utc)
        for k, inv in sim.inventory.items():
            a = units.get(k, 0.0)
            lvl = a if k not in level else 0.35 * a + 0.65 * level[k]
            level[k] = lvl
            rows.append({"sku": k[0], "region": k[1], "channel": k[2], "window_end": we, "units_sold": a,
                         "views": views.get(k, 0), "cart_adds": 0, "promo_active": promo[k] > 0,
                         "promo_discount_pct": promo[k], "forecast_next": lvl,
                         "lower_next": max(lvl - 2 * lvl ** 0.5 - 1, 0), "upper_next": lvl + 2 * lvl ** 0.5 + 1})
            oh = inv["on_hand"]
            risk_rows.append({"sku": k[0], "risk_level": "OUT_OF_STOCK" if oh <= 0 else "HIGH" if oh < 6 * lvl else
                              "OVERSTOCK" if lvl > 0 and oh / lvl > 120 else "LOW",
                              "suggested_replenishment_units": max(int(6 * lvl) - oh, 0)})
    forecast = pa.Table.from_pylist(rows)
    con.register("demand_forecast", forecast)
    con.register("demand_windowed", forecast)
    con.register("stockout_risk", pa.Table.from_pylist(risk_rows))
    print(f"  offline mode: {forecast.num_rows:,} synthetic rows")


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--offline", action="store_true", help="Use synthetic data instead of Tableflow")
    parser.add_argument("--profile", default=None)
    parser.add_argument("--no-export", action="store_true")
    args = parser.parse_args()

    from common.config import load_profile

    periods_per_day = int(load_profile(args.profile)["period"].get("periods_per_day", 24))
    con = duckdb.connect()
    if args.offline:
        load_offline(con, args.profile)
    else:
        load_from_tableflow(con)

    for title, sql in QUERIES.items():
        print(f"\n=== {title} ===")
        print(con.sql(sql.format(periods_per_day=periods_per_day)))

    if not args.no_export:
        OUT_DIR.mkdir(parents=True, exist_ok=True)
        path = OUT_DIR / "training_set.parquet"
        con.sql(TRAINING_SET.format(periods_per_day=periods_per_day)).write_parquet(str(path))
        print(f"\nExported retraining feature table to {path.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
