"""Offline mode (DASHBOARD_DEMO_DATA=1): drive the dashboard from the local
simulator with a simple exponential-smoothing forecast instead of Kafka/Flink.
Useful for rehearsing the talk track or UI work without a Confluent Cloud
environment. Not a substitute for the real pipeline."""

from __future__ import annotations

import math
import time
from collections import defaultdict, deque
from datetime import datetime, timezone

from datagen.simulator import Simulator
from explainer.main import Explainer

SIM: dict = {}


def run_synthetic(state, profile: dict, backfill: int = 72):
    sim = Simulator(profile, seed=7)
    explainer = Explainer(profile, cooldown_s=30, max_age_s=1e9)
    SIM["sim"] = sim
    SIM["state"] = state
    period_ms = sim.period_ms
    level: dict[tuple, float] = {}
    resid: dict[tuple, float] = defaultdict(lambda: 1.0)
    recent: dict[tuple, deque] = defaultdict(lambda: deque(maxlen=24))
    alpha = 0.35

    def step(start_ms: int):
        events = sim.generate_period(start_ms)
        SIM["events"] = SIM.get("events", 0) + len(events)
        units: dict[tuple, float] = defaultdict(float)
        views: dict[tuple, int] = defaultdict(int)
        promo: dict[tuple, float] = defaultdict(float)
        for ev in events:
            v = ev.value
            if ev.topic in ("orders", "pos_sales"):
                key = (v["sku"], v["region"], "ONLINE" if ev.topic == "orders" else "STORE")
                units[key] += v["units"]
                promo[key] = max(promo[key], v["discount_pct"])
            elif ev.topic == "clickstream":
                views[(v["sku"], v["region"], "ONLINE")] += 1
            elif ev.topic == "promotions":
                state.on_promotion(v)

        window_end = datetime.fromtimestamp((start_ms + period_ms) / 1000, tz=timezone.utc)
        anomalies = []
        for (sku, region, ch), inv in sim.inventory.items():
            key = (sku, region, ch)
            actual = units.get(key, 0.0)
            prev = level.get(key)
            if prev is not None:
                band = 2.6 * math.sqrt(resid[key])
                if actual - prev > max(1.5 * band, 8.0) and actual > prev * 3.0:
                    anomalies.append({"sku": sku, "region": region, "channel": ch, "window_time": window_end,
                                      "units_sold": actual, "views": views.get(key, 0), "cart_adds": 0,
                                      "promo_active": promo[key] > 0, "promo_discount_pct": promo[key],
                                      "expected_units": prev, "lower_bound": max(prev - band, 0),
                                      "upper_bound": prev + band, "direction": "SPIKE"})
                resid[key] = 0.8 * resid[key] + 0.2 * (actual - prev) ** 2
            lvl = actual if prev is None else alpha * actual + (1 - alpha) * prev
            level[key] = lvl
            band = 1.96 * math.sqrt(resid[key])
            state.on_forecast({
                "sku": sku, "region": region, "channel": ch, "window_end": window_end,
                "units_sold": actual, "views": views.get(key, 0), "promo_active": promo[key] > 0,
                "forecast_next": lvl, "lower_next": max(lvl - band, 0), "upper_next": lvl + band,
                "forecast_horizon": lvl * 6, "rmse": math.sqrt(resid[key]),
                "model": "offline demo mode (exponential smoothing)",
            })
            horizon, upper_h = lvl * 6, (lvl + band) * 6
            on_hand = inv["on_hand"]
            recent[key].append(actual)
            typical = sum(recent[key]) / len(recent[key])
            risk = ("OUT_OF_STOCK" if on_hand <= 0 else "HIGH" if on_hand < horizon else
                    "MEDIUM" if on_hand < upper_h else
                    "OVERSTOCK" if on_hand / max(typical, lvl, 0.5) > 120 else "LOW")
            state.on_risk({"sku": sku, "region": region, "channel": ch, "window_time": window_end,
                           "units_sold": actual, "forecast_next": lvl, "forecast_horizon": horizon,
                           "upper_horizon": upper_h, "typical_rate": typical, "promo_active": promo[key] > 0,
                           "on_hand": on_hand, "on_order": inv["on_order"],
                           "periods_of_cover": round(on_hand / lvl, 1) if lvl > 0 else None,
                           "risk_level": risk,
                           "suggested_replenishment_units": max(int(math.ceil(upper_h)) - on_hand - inv["on_order"], 0)})
            explainer.on_risk({"sku": sku, "region": region, "channel": ch, "on_hand": on_hand,
                               "periods_of_cover": round(on_hand / lvl, 1) if lvl > 0 else None, "risk_level": risk})
        for p in state.promos.values():
            explainer.on_promotion(p | {"status": "STARTED"})
        explainer.active_promos = {k: v for k, v in explainer.active_promos.items() if k in state.promos}
        for a in anomalies:
            state.on_anomaly(a)
            explainer.on_anomaly(a)
        for rows in explainer.ready_groups(settle_s=0):
            state.on_explanation(explainer.explain(rows))

    now = int(time.time() * 1000)
    current = now - now % period_ms
    for i in range(backfill, 0, -1):
        step(current - i * period_ms)
    while True:
        while int(time.time() * 1000) < current + period_ms:
            time.sleep(0.2)
        step(current)
        current += period_ms


def trigger(action: str, body: dict) -> dict:
    sim: Simulator = SIM["sim"]
    if action == "launch":
        sku = body.get("sku") or next((p["sku"] for p in sim.profile["products"] if p.get("hero_launch")),
                                      sim.profile["products"][0]["sku"])
        ev = sim.start_launch(sku, body.get("region"))
        SIM["state"].on_promotion(ev.value)
        return {"started": ev.value["promo_id"], "name": ev.value["name"], "errors": []}
    if action == "promo":
        ev = sim.start_promo(body["sku"], body.get("region"), body.get("discount_pct"), body.get("periods"))
        SIM["state"].on_promotion(ev.value)
        return {"started": ev.value["promo_id"], "name": ev.value["name"], "errors": []}
    if action == "end":
        ev = sim.end_promotion(body["promo_id"])
        if ev is None:
            return {"ended": None, "errors": [f"{body['promo_id']} is not running"]}
        SIM["state"].on_promotion(ev.value)
        return {"ended": ev.value["promo_id"], "name": ev.value["name"], "errors": []}
    if action == "transfer":
        moved, _ = sim.transfer(body["sku"], body["from_region"], body["to_region"], body["channel"],
                                body["units"], body.get("transit_periods", 1))
        return {"moved": moved, "errors": []}
    if action == "scenario/peak":
        cfg, events = sim.start_peak_scenario()
        peak = events[-1].value
        SIM["state"].on_promotion(peak)
        return {"started": peak["promo_id"], "name": peak["name"], "scenario": cfg, "errors": []}
    if action == "restock":
        events = sim.restock(body["sku"], body.get("region"), body.get("channel"), body.get("units"))
        return {"restocked": len(events), "errors": []}
    return {"accepted": False, "message": "Rejected by Schema Registry data contract rule (simulated in offline mode)",
            "detail": "orders-value rule unitsPositive: message.units > 0"}
