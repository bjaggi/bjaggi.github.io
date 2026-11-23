"""Live demand forecasting dashboard.

    uvicorn dashboard.app:app --port 8000
    DASHBOARD_DEMO_DATA=1 uvicorn dashboard.app:app --port 8000   # offline, synthetic data
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import threading
import time
from pathlib import Path

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles

from common.config import consumer_conf, load_profile, schema_registry_conf

from .agent import InventoryAgent
from .state import DemandState, ms

log = logging.getLogger("dashboard")
STATIC = Path(__file__).parent / "static"

PROFILE = load_profile()
PERIOD_MS = int(PROFILE["period"]["seconds"]) * 1000
FORECAST_TOPIC = os.getenv("FORECAST_TOPIC", "demand_forecast")
DATAGEN_URL = os.getenv("DATAGEN_URL", "http://localhost:8001")

state = DemandState(PERIOD_MS)
DEMO_MODE = bool(os.getenv("DASHBOARD_DEMO_DATA"))
SCENARIO: dict = {}


def execute(action: str, body: dict) -> dict:
    """Run a control action against the simulator (offline) or the data generator (live)."""
    if DEMO_MODE:
        from .demo_data import trigger as local_trigger

        return local_trigger(action, body)
    resp = httpx.post(f"{DATAGEN_URL}/{action}", json=body, timeout=15.0)
    resp.raise_for_status()
    return resp.json()


agent = InventoryAgent(PROFILE, state, execute)
app = FastAPI(title="Real-time demand and inventory management dashboard")
app.mount("/static", StaticFiles(directory=STATIC), name="static")


def streaming_recommendation(v: dict) -> dict | None:
    """Turn one Flink streaming-agent line into a dashboard recommendation."""
    raw = (v.get("decision") or "").strip()
    if not raw:
        return None
    parts = raw.splitlines()[0].split()
    if not parts:
        return None
    action = parts[0].upper().strip(".,")
    if action not in ("ORDER", "MARKDOWN", "TRANSFER"):
        return None
    sku, region, channel = v.get("sku"), v.get("region"), v.get("channel")
    when = ms(v.get("window_time")) or int(time.time() * 1000)
    product = next((p for p in PROFILE["products"] if p["sku"] == sku), {})
    units, from_region, to_region, discount = 0, None, region, 0.0
    try:
        if action == "ORDER" and len(parts) >= 3:
            to_region, units = parts[1], int(float(parts[2]))
        elif action == "MARKDOWN" and len(parts) >= 3:
            to_region, discount = parts[1], float(parts[2])
        elif action == "TRANSFER" and len(parts) >= 4:
            from_region, to_region, units = parts[1], parts[2], int(float(parts[3]))
        else:
            return None
    except ValueError:
        return None
    return {
        "id": f"{sku}-{region}-{channel}-{when}",
        "t": when,
        "decided_t": when,
        "status": "AUTO",
        "action": action,
        "kind": "OVERSTOCK" if action == "MARKDOWN" else "STOCKOUT",
        "sku": sku,
        "product": product.get("name") or sku,
        "channel": channel,
        "region": region,
        "from_region": from_region,
        "to_region": to_region,
        "units": units,
        "executed_units": units,
        "max_units": max(units, 1),
        "price": float(product.get("price") or 0),
        "rate": 1,
        "dest_on_hand": 0,
        "discount_pct": discount,
        "periods": 8,
        "detected": raw.splitlines()[0],
        "found": "Decision from the Flink streaming agent inventory_agent.",
        "proposal_text": raw.splitlines()[0],
        "result": raw.splitlines()[0],
        "decided_by": "Flink streaming agent",
    }


@app.middleware("http")
async def no_cache(request, call_next):
    response = await call_next(request)
    if request.url.path == "/" or request.url.path.startswith("/static"):
        response.headers["Cache-Control"] = "no-cache"
    return response


def consume_forever():
    from confluent_kafka import Consumer
    from confluent_kafka.schema_registry import SchemaRegistryClient
    from confluent_kafka.schema_registry.avro import AvroDeserializer
    from confluent_kafka.serialization import MessageField, SerializationContext

    handlers = {
        FORECAST_TOPIC: state.on_forecast,
        "stockout_risk": state.on_risk,
        "demand_anomalies": state.on_anomaly,
        "forecast_explanations": state.on_explanation,
        "promotions": state.on_promotion,
    }
    deserializer = AvroDeserializer(SchemaRegistryClient(schema_registry_conf()))
    consumer = Consumer(consumer_conf("demand-dashboard"))
    consumer.subscribe(list(handlers))
    log.info("Dashboard consuming %s", ", ".join(handlers))
    while True:
        msg = consumer.poll(0.5)
        if msg is None:
            continue
        if msg.error():
            log.debug("consumer error: %s", msg.error())
            continue
        try:
            value = deserializer(msg.value(), SerializationContext(msg.topic(), MessageField.VALUE))
            if value is not None:
                handlers[msg.topic()](value)
        except Exception:
            log.exception("Failed to process message from %s", msg.topic())


def consume_agent_forever():
    """Read ai_recommendations, written by the Flink streaming agent."""
    from confluent_kafka import Consumer
    from confluent_kafka.schema_registry import SchemaRegistryClient
    from confluent_kafka.schema_registry.avro import AvroDeserializer
    from confluent_kafka.serialization import MessageField, SerializationContext

    while True:
        consumer = None
        try:
            deserializer = AvroDeserializer(SchemaRegistryClient(schema_registry_conf()))
            consumer = Consumer(consumer_conf("demand-dashboard-agent"))
            consumer.subscribe(["ai_recommendations"])
            log.info("Dashboard consuming ai_recommendations from the streaming agent")
            while True:
                msg = consumer.poll(1.0)
                if msg is None:
                    continue
                if msg.error():
                    log.debug("agent consumer: %s", msg.error())
                    continue
                value = deserializer(msg.value(), SerializationContext(msg.topic(), MessageField.VALUE))
                rec = streaming_recommendation(value) if value else None
                if rec:
                    state.add_agent_rec(rec)
        except Exception:
            log.exception("Streaming agent consumer stopped; retrying in 15s")
            time.sleep(15)
        finally:
            if consumer is not None:
                consumer.close()


@app.on_event("startup")
def start_background():
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    if os.getenv("DASHBOARD_DEMO_DATA"):
        from .demo_data import run_synthetic

        threading.Thread(target=run_synthetic, args=(state, PROFILE), daemon=True).start()
    else:
        threading.Thread(target=consume_forever, daemon=True, name="consumer").start()
        threading.Thread(target=consume_agent_forever, daemon=True, name="agent-consumer").start()
    threading.Thread(target=agent.run_forever, daemon=True, name="agent").start()


@app.get("/")
def index():
    return FileResponse(STATIC / "index.html")


@app.get("/api/profile")
def profile():
    return {
        "brand": PROFILE["brand"],
        "period": PROFILE["period"],
        "products": [{"sku": p["sku"], "name": p["name"], "category": p.get("category"),
                      "hero_launch": bool(p.get("hero_launch"))} for p in PROFILE["products"]],
        "regions": PROFILE["regions"],
        "channels": PROFILE.get("channels", {}),
        "launch": PROFILE.get("launch", {}),
        "promo": PROFILE.get("promo", {}),
        "lead_time_periods": int(PROFILE.get("replenishment", {}).get("lead_time_periods", 6)),
        "peak_event": PROFILE.get("peak_event"),
        "prices": {p["sku"]: p.get("price", 0.0) for p in PROFILE["products"]},
        "forecast_topic": FORECAST_TOPIC,
    }


def full_snapshot(sku: str, region: str, channel: str) -> dict:
    view = agent.snapshot()
    streaming = state.agent_recommendations()
    if streaming:
        seen = {r.get("id") for r in streaming}
        extra = [r for r in view["recommendations"] if r.get("id") not in seen]
        view["recommendations"] = streaming + extra
    return state.snapshot(sku, region, channel) | {"agent": view, "scenario": SCENARIO or None}


@app.get("/api/snapshot")
def snapshot(sku: str, region: str = "ALL", channel: str = "ALL"):
    return full_snapshot(sku, region, channel)


@app.post("/api/agent/{mode}")
def agent_mode(mode: str):
    if mode not in ("on", "off"):
        raise HTTPException(404, "Use /api/agent/on or /api/agent/off")
    agent.set_enabled(mode == "on")
    return {"enabled": agent.enabled}


@app.post("/api/agent/approval/{mode}")
async def approval_mode(mode: str):
    if mode not in ("on", "off"):
        raise HTTPException(404, "Use /api/agent/approval/on or /api/agent/approval/off")
    await asyncio.to_thread(agent.set_require_approval, mode == "on")
    return {"require_approval": agent.require_approval}


@app.post("/api/agent/proposals/{pid}/{decision}")
async def decide(pid: str, decision: str, body: dict | None = None):
    body = body or {}
    approver = str(body.get("approver") or "planner")[:40]
    try:
        if decision == "approve":
            result = await asyncio.to_thread(agent.approve, pid, body.get("units"), approver)
        elif decision == "reject":
            result = await asyncio.to_thread(agent.reject, pid, approver)
        else:
            raise HTTPException(404, "Use approve or reject")
    except KeyError:
        raise HTTPException(404, "This request is no longer pending (it may have been resolved already)")
    except RuntimeError as e:
        raise HTTPException(409, str(e))
    return {"decision": result}


@app.post("/api/demo/peak")
async def demo_peak(agent_on: bool = True):
    if not PROFILE.get("peak_event"):
        raise HTTPException(404, "This profile has no peak_event scenario")
    try:
        res = await asyncio.to_thread(execute, "scenario/peak", {})
    except httpx.HTTPError as e:
        raise HTTPException(502, f"Data generator control API not reachable at {DATAGEN_URL}: {e}")
    SCENARIO.clear()
    SCENARIO.update(PROFILE["peak_event"] | {"promo_id": res.get("started"), "started_t": int(time.time() * 1000)})
    agent.set_enabled(agent_on)
    return {"scenario": SCENARIO, "agent": agent.enabled}


@app.post("/api/demo/stop")
async def demo_stop():
    if SCENARIO.get("promo_id"):
        try:
            await asyncio.to_thread(execute, "end", {"promo_id": SCENARIO["promo_id"]})
        except httpx.HTTPError:
            pass
    SCENARIO.clear()
    state.touch()
    return {"scenario": None}


@app.get("/api/stream")
async def stream(sku: str, region: str = "ALL", channel: str = "ALL"):
    async def events():
        last = -1
        while True:
            if state.version != last:
                last = state.version
                yield f"data: {json.dumps(full_snapshot(sku, region, channel), default=str)}\n\n"
            else:
                yield ": keepalive\n\n"
            await asyncio.sleep(1.0)

    return StreamingResponse(events(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@app.post("/api/trigger/{action}")
async def trigger(action: str, body: dict | None = None):
    if action not in ("launch", "promo", "end", "restock", "bad-record"):
        raise HTTPException(404, f"Unknown action {action}")
    if os.getenv("DASHBOARD_DEMO_DATA"):
        from .demo_data import trigger as local_trigger

        return local_trigger(action, body or {})
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(f"{DATAGEN_URL}/{action}", json=body or {})
        return resp.json()
    except httpx.HTTPError as e:
        raise HTTPException(502, f"Data generator control API not reachable at {DATAGEN_URL}: {e}")


@app.get("/api/datagen")
async def datagen_state():
    if os.getenv("DASHBOARD_DEMO_DATA"):
        from .demo_data import SIM

        return {"producer": {"sent": {"simulated": SIM.get("events", 0)}, "rejected_by_data_contract": {}}}
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{DATAGEN_URL}/state")
        data = resp.json()
        return {"producer": data.get("producer"), "last_period": data.get("last_period")}
    except httpx.HTTPError:
        return {"producer": None, "last_period": None}
