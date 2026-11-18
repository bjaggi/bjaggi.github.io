"""Explain demand anomalies for merchandisers with IBM watsonx.ai (Granite).

Consumes `demand_anomalies` (ML_DETECT_ANOMALIES output), keeps context from
`promotions` and `stockout_risk`, and writes natural-language explanations to
`forecast_explanations`. Falls back to a deterministic template if watsonx
credentials are not configured, so the demo never breaks.

    python -m explainer.main
    python -m explainer.main --selftest      # no Kafka; one synthetic anomaly
    python -m explainer.main --list-models   # Granite chat models in your region
"""

from __future__ import annotations

import argparse
import json
import logging
import time
import uuid
from datetime import datetime, timezone

from common.config import ROOT, consumer_conf, kafka_conf, load_profile, profile_name, schema_registry_conf

from .watsonx import WatsonxClient

log = logging.getLogger("explainer")

SYSTEM_PROMPT = """You are a demand planning analyst for {brand} ({vertical}).
You explain real-time demand forecast shifts to merchandisers and planners.
Be concise, concrete and business-focused. Use the numbers you are given; do not invent data.
Respond ONLY with a JSON object with these keys:
  "headline": one line, max 12 words,
  "explanation": 2-3 sentences on what changed and the most likely driver,
  "recommended_action": one specific action (replenishment, allocation across regions/channels, pricing, or marketing)."""


def ms(value) -> int:
    if isinstance(value, datetime):
        return int(value.timestamp() * 1000)
    return int(value)


class Explainer:
    def __init__(self, profile: dict, cooldown_s: float, max_age_s: float):
        self.profile = profile
        self.products = {p["sku"]: p for p in profile["products"]}
        self.regions = {r["id"]: r["name"] for r in profile["regions"]}
        self.channels = profile.get("channels", {})
        self.cooldown_s = cooldown_s
        self.max_age_s = max_age_s
        self.wx = WatsonxClient()
        self.active_promos: dict[str, dict] = {}
        self.latest_risk: dict[tuple, dict] = {}
        self.last_explained: dict[tuple, float] = {}
        self.pending: dict[tuple, dict] = {}

    # ---------------------------------------------------------------- state

    def on_promotion(self, v: dict):
        if v["status"] == "STARTED":
            self.active_promos[v["promo_id"]] = v
        else:
            self.active_promos.pop(v["promo_id"], None)

    def on_risk(self, v: dict):
        self.latest_risk[(v["sku"], v["region"], v["channel"])] = v

    def on_anomaly(self, v: dict):
        age = time.time() - ms(v["window_time"]) / 1000.0
        if age > self.max_age_s:
            return
        key = (v["sku"], ms(v["window_time"]), v["direction"])
        group = self.pending.setdefault(key, {"first_seen": time.time(), "rows": []})
        group["rows"].append(v)

    def ready_groups(self, settle_s: float = 3.0) -> list[list[dict]]:
        now = time.time()
        ready = [k for k, g in self.pending.items() if now - g["first_seen"] >= settle_s]
        out = []
        for k in ready:
            rows = self.pending.pop(k)["rows"]
            cooldown_key = (k[0], k[2])
            if now - self.last_explained.get(cooldown_key, 0) < self.cooldown_s:
                continue
            self.last_explained[cooldown_key] = now
            out.append(rows)
        return out

    # -------------------------------------------------------------- explain

    def build_context(self, rows: list[dict]) -> dict:
        sku = rows[0]["sku"]
        product = self.products.get(sku, {"name": sku, "category": "", "price": 0})
        promos = [p for p in self.active_promos.values()
                  if p["sku"] == sku and (p.get("region") is None or p["region"] in {r["region"] for r in rows})]
        locations = []
        for r in rows:
            risk = self.latest_risk.get((sku, r["region"], r["channel"]), {})
            locations.append({
                "region": self.regions.get(r["region"], r["region"]),
                "channel": self.channels.get(r["channel"], {}).get("name", r["channel"]),
                "actual_units": round(r["units_sold"], 1),
                "expected_units": None if r.get("expected_units") is None else round(r["expected_units"], 1),
                "expected_range": [None if r.get("lower_bound") is None else round(r["lower_bound"], 1),
                                   None if r.get("upper_bound") is None else round(r["upper_bound"], 1)],
                "product_views": r.get("views"),
                "cart_adds": r.get("cart_adds"),
                "promo_discount_pct": r.get("promo_discount_pct"),
                "on_hand": risk.get("on_hand"),
                "periods_of_cover": risk.get("periods_of_cover"),
                "stockout_risk": risk.get("risk_level"),
            })
        period = self.profile["period"].get("label", "hour")
        return {
            "product": {"sku": sku, "name": product["name"], "category": product.get("category"), "price": product.get("price")},
            "direction": rows[0]["direction"],
            "period_unit": f"one simulated {period}",
            "active_promotions_or_launches": [
                {"type": p["promo_type"], "name": p["name"], "discount_pct": p["discount_pct"]} for p in promos
            ],
            "locations": locations,
        }

    def template(self, ctx: dict) -> dict:
        p, locs = ctx["product"], ctx["locations"]
        worst = max(locs, key=lambda l: abs((l["actual_units"] or 0) - (l["expected_units"] or 0)))
        driver = (ctx["active_promotions_or_launches"][0]["name"] if ctx["active_promotions_or_launches"]
                  else "an unplanned shift in shopper demand")
        at_risk = [l for l in locs if l.get("stockout_risk") in ("HIGH", "OUT_OF_STOCK")]
        if ctx["direction"] == "SPIKE":
            headline = f"{p['name']} demand spiking above forecast"
            action = (f"Expedite replenishment to {', '.join(l['region'] + ' ' + l['channel'] for l in at_risk)}."
                      if at_risk else "Rebalance allocation toward the spiking regions and monitor cover.")
        else:
            headline = f"{p['name']} demand dropping below forecast"
            action = ("Check for stockouts or availability issues before considering a markdown."
                      if at_risk else "Consider targeted marketing or a promotion to recover demand.")
        return {
            "headline": headline,
            "explanation": (f"{worst['region']} {worst['channel']} sold {worst['actual_units']} units vs "
                            f"{worst['expected_units']} expected per period, outside the forecast range "
                            f"{worst['expected_range']}. Likely driver: {driver}."),
            "recommended_action": action,
        }

    def explain(self, rows: list[dict]) -> dict:
        ctx = self.build_context(rows)
        model = "template (watsonx not configured)"
        result = None
        if self.wx.configured:
            try:
                brand = self.profile["brand"]
                result = self.wx.chat_json(
                    SYSTEM_PROMPT.format(brand=brand["name"], vertical=brand.get("vertical", "retail")),
                    "Explain this demand anomaly:\n" + json.dumps(ctx, indent=2, default=str),
                )
                model = f"watsonx.ai {self.wx.model_id}"
            except Exception as e:  # keep the demo running if the LLM call fails
                log.warning("watsonx call failed, using template: %s", e)
        result = result or self.template(ctx)
        regions = sorted({r["region"] for r in rows})
        channels = sorted({r["channel"] for r in rows})
        return {
            "explanation_id": uuid.uuid4().hex,
            "sku": ctx["product"]["sku"],
            "region": ",".join(regions),
            "channel": ",".join(channels),
            "direction": ctx["direction"],
            "actual_units": float(sum(r["units_sold"] for r in rows)),
            "expected_units": float(sum(r["expected_units"] or 0 for r in rows)),
            "headline": str(result.get("headline", ""))[:200],
            "explanation": str(result.get("explanation", "")),
            "recommended_action": str(result.get("recommended_action", "")),
            "model": model,
            "event_time": datetime.now(tz=timezone.utc),
        }


def selftest(explainer: Explainer):
    sku = explainer.profile["products"][1]["sku"]
    region = explainer.profile["regions"][0]["id"]
    now = datetime.now(tz=timezone.utc)
    explainer.on_promotion({"promo_id": "LAUNCH-TEST", "promo_type": "LAUNCH", "status": "STARTED",
                            "name": f"{explainer.profile['launch']['label']}: test", "sku": sku,
                            "region": None, "discount_pct": 0.0})
    explainer.on_risk({"sku": sku, "region": region, "channel": "ONLINE", "on_hand": 22,
                       "periods_of_cover": 0.9, "risk_level": "HIGH"})
    rows = [{"sku": sku, "region": region, "channel": "ONLINE", "window_time": now, "units_sold": 41.0,
             "views": 260, "cart_adds": 95, "promo_active": False, "promo_discount_pct": 0.0,
             "expected_units": 5.2, "lower_bound": 1.0, "upper_bound": 9.8, "direction": "SPIKE"}]
    print(json.dumps(explainer.explain(rows), indent=2, default=str))


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--profile", default=profile_name())
    parser.add_argument("--cooldown", type=float, default=60.0, help="Seconds between explanations for the same SKU/direction")
    parser.add_argument("--max-age", type=float, default=180.0, help="Ignore anomalies older than this many seconds (e.g. backfill)")
    parser.add_argument("--selftest", action="store_true")
    parser.add_argument("--list-models", action="store_true")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    explainer = Explainer(load_profile(args.profile), args.cooldown, args.max_age)

    if args.list_models:
        print("\n".join(explainer.wx.list_chat_models()))
        return
    if args.selftest:
        selftest(explainer)
        return

    from confluent_kafka import Consumer, Producer
    from confluent_kafka.schema_registry import SchemaRegistryClient, topic_subject_name_strategy
    from confluent_kafka.schema_registry.avro import AvroDeserializer, AvroSerializer
    from confluent_kafka.serialization import MessageField, SerializationContext

    sr = SchemaRegistryClient(schema_registry_conf())
    deserializer = AvroDeserializer(sr)
    serializer = AvroSerializer(
        sr,
        (ROOT / "schemas" / "forecast_explanations.avsc").read_text(),
        conf={"auto.register.schemas": False, "use.latest.version": True,
              "subject.name.strategy": topic_subject_name_strategy},
    )
    consumer = Consumer(consumer_conf("demand-explainer"))
    consumer.subscribe(["promotions", "stockout_risk", "demand_anomalies"])
    producer = Producer(kafka_conf(**{"client.id": "demand-demo-explainer"}))

    log.info("Explainer running (%s). Waiting for anomalies...",
             f"watsonx model {explainer.wx.model_id}" if explainer.wx.configured else "template mode, set WATSONX_* to use Granite")
    try:
        while True:
            msg = consumer.poll(0.5)
            if msg is not None and not msg.error():
                v = deserializer(msg.value(), SerializationContext(msg.topic(), MessageField.VALUE))
                if v is not None:
                    {"promotions": explainer.on_promotion,
                     "stockout_risk": explainer.on_risk,
                     "demand_anomalies": explainer.on_anomaly}[msg.topic()](v)
            elif msg is not None and msg.error():
                log.debug("consumer error: %s", msg.error())

            for rows in explainer.ready_groups():
                out = explainer.explain(rows)
                producer.produce(
                    "forecast_explanations",
                    key=out["sku"].encode(),
                    value=serializer(out, SerializationContext("forecast_explanations", MessageField.VALUE)),
                )
                producer.poll(0)
                log.info("[%s] %s | %s -> %s", out["model"], out["sku"], out["headline"], out["recommended_action"])
    except KeyboardInterrupt:
        pass
    finally:
        producer.flush(5)
        consumer.close()


if __name__ == "__main__":
    main()
