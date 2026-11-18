"""HTTP control plane for the presenter: trigger launches, promos, restocks and
bad records while the demo is running. The dashboard calls these endpoints."""

from __future__ import annotations

import time
import uuid

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .simulator import Event, Simulator, to_dt


class LaunchRequest(BaseModel):
    sku: str | None = None
    region: str | None = None
    multiplier: float | None = None
    decay_periods: float | None = None


class PromoRequest(BaseModel):
    sku: str
    region: str | None = None
    discount_pct: float | None = None
    periods: int | None = None


class EndRequest(BaseModel):
    promo_id: str


class TransferRequest(BaseModel):
    sku: str
    from_region: str
    to_region: str
    channel: str
    units: int
    transit_periods: int = 1


class RestockRequest(BaseModel):
    sku: str
    region: str | None = None
    channel: str | None = None
    units: int | None = None


def create_app(sim: Simulator, producer) -> FastAPI:
    app = FastAPI(title="Demand demo data generator control API")
    app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

    def check_sku(sku: str):
        if sku not in sim.products:
            raise HTTPException(404, f"Unknown sku {sku}. Known: {list(sim.products)}")

    def emit(events: list[Event]) -> list[str]:
        errors = [e for e in (producer.produce(ev) for ev in events) if e]
        producer.flush(5)
        return errors

    @app.get("/state")
    def state():
        return {"profile": sim.profile["id"], **sim.state(), "producer": producer.stats()}

    @app.post("/launch")
    def launch(req: LaunchRequest):
        sku = req.sku or next(
            (p["sku"] for p in sim.profile["products"] if p.get("hero_launch")),
            sim.profile["products"][0]["sku"],
        )
        check_sku(sku)
        ev = sim.start_launch(sku, req.region, req.multiplier, req.decay_periods)
        return {"started": ev.value["promo_id"], "name": ev.value["name"], "errors": emit([ev])}

    @app.post("/promo")
    def promo(req: PromoRequest):
        check_sku(req.sku)
        ev = sim.start_promo(req.sku, req.region, req.discount_pct, req.periods)
        return {"started": ev.value["promo_id"], "name": ev.value["name"], "errors": emit([ev])}

    @app.post("/end")
    def end(req: EndRequest):
        ev = sim.end_promotion(req.promo_id)
        if ev is None:
            raise HTTPException(404, f"{req.promo_id} is not running")
        return {"ended": req.promo_id, "name": ev.value["name"], "errors": emit([ev])}

    @app.post("/transfer")
    def transfer(req: TransferRequest):
        check_sku(req.sku)
        moved, events = sim.transfer(req.sku, req.from_region, req.to_region, req.channel,
                                     req.units, req.transit_periods)
        return {"moved": moved, "errors": emit(events)}

    @app.post("/scenario/peak")
    def peak_scenario():
        if "peak_event" not in sim.profile:
            raise HTTPException(404, "This profile has no peak_event scenario")
        cfg, events = sim.start_peak_scenario()
        peak = events[-1].value
        return {"started": peak["promo_id"], "name": peak["name"], "scenario": cfg, "errors": emit(events)}

    @app.post("/restock")
    def restock(req: RestockRequest):
        check_sku(req.sku)
        events = sim.restock(req.sku, req.region, req.channel, req.units)
        return {"restocked": len(events), "errors": emit(events)}

    @app.post("/bad-record")
    def bad_record():
        """Send an order that violates the data contract (units must be > 0)."""
        now_ms = int(time.time() * 1000)
        product = sim.profile["products"][0]
        ev = Event("orders", f"{product['sku']}|BAD", {
            "order_id": uuid.uuid4().hex,
            "customer_id": "C000000",
            "sku": product["sku"],
            "region": sim.regions[0]["id"],
            "device": "WEB",
            "units": -5,
            "unit_price": float(product["price"]),
            "discount_pct": 0.0,
            "promo_id": None,
            "event_time": to_dt(now_ms),
        }, now_ms)
        error = producer.produce(ev)
        return {
            "accepted": error is None,
            "message": "Rejected by Schema Registry data contract rule" if error else "Accepted (rules not enforced?)",
            "detail": error,
        }

    return app
