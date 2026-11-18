"""Demand simulator: turns a vertical profile into clickstream, cart, order, POS,
inventory and promotion events with realistic seasonality, promo lift, launch
spikes, stockouts and batch replenishment."""

from __future__ import annotations

import math
import random
import threading
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone

CHANNELS = ("ONLINE", "STORE")


@dataclass
class Event:
    topic: str
    key: str
    value: dict
    ts_ms: int


def to_dt(ts_ms: int) -> datetime:
    return datetime.fromtimestamp(ts_ms / 1000.0, tz=timezone.utc)


def poisson(lam: float, rng: random.Random) -> int:
    if lam <= 0:
        return 0
    if lam > 30:
        return max(0, int(round(rng.gauss(lam, math.sqrt(lam)))))
    threshold, k, p = math.exp(-lam), 0, 1.0
    while True:
        p *= rng.random()
        if p <= threshold:
            return k
        k += 1


class Simulator:
    def __init__(self, profile: dict, seed: int | None = None):
        self.profile = profile
        self.rng = random.Random(seed)
        self.lock = threading.RLock()

        self.period_ms = int(profile["period"]["seconds"]) * 1000
        self.periods_per_day = int(profile["period"].get("periods_per_day", 24))
        self.daily_curve = profile["daily_curve"]
        self.regions = profile["regions"]
        self.products = {p["sku"]: p for p in profile["products"]}
        self.conversion = profile.get("conversion", {})
        self.lead_time = int(profile.get("replenishment", {}).get("lead_time_periods", 6))
        self.stores_per_region = int(profile.get("stores_per_region", 4))

        self.inventory: dict[tuple[str, str, str], dict] = {}
        for sku, p in self.products.items():
            for r in self.regions:
                for ch in CHANNELS:
                    self.inventory[(sku, r["id"], ch)] = {
                        "on_hand": int(p["initial_stock"][ch]),
                        "on_order": 0,
                        "arrivals": [],  # list of (period_index, qty)
                    }

        self.promos: list[dict] = []
        self.launches: list[dict] = []
        self.pending: list[Event] = []
        self.period_index = 0
        self.last_period_summary: dict = {}

    # ------------------------------------------------------------------ helpers

    def _period_of(self, ts_ms: int) -> int:
        return ts_ms // self.period_ms

    def _hour_of(self, period_index: int) -> int:
        return period_index % self.periods_per_day

    def _matches(self, item: dict, sku: str, region: str) -> bool:
        return item["sku"] == sku and (item["region"] in (None, region))

    def _promo_discount(self, sku: str, region: str) -> tuple[float, str | None]:
        best, promo_id = 0.0, None
        for p in self.promos:
            if self._matches(p, sku, region) and p["discount_pct"] > best:
                best, promo_id = p["discount_pct"], p["promo_id"]
        return best, promo_id

    def _launch_multiplier(self, sku: str, region: str, period_index: int) -> float:
        mult = 1.0
        for l in self.launches:
            if self._matches(l, sku, region) and period_index >= l["start_period"]:
                if l.get("kind") == "PEAK":
                    mult *= l["multiplier"]
                    continue
                age = period_index - l["start_period"]
                mult *= 1.0 + (l["multiplier"] - 1.0) * math.exp(-age / l["decay_periods"])
        return mult

    def _launch_expired(self, l: dict, period_index: int) -> bool:
        if l.get("kind") == "PEAK":
            return period_index >= l["end_period"]
        return period_index - l["start_period"] > 4 * l["decay_periods"]

    def _promotion_event(self, item: dict, promo_type: str, status: str, ts_ms: int) -> Event:
        return Event(
            topic="promotions",
            key=item["sku"],
            value={
                "promo_id": item["promo_id"],
                "promo_type": promo_type,
                "name": item["name"],
                "sku": item["sku"],
                "region": item["region"],
                "discount_pct": float(item.get("discount_pct", 0.0)),
                "status": status,
                "event_time": to_dt(ts_ms),
                "planned_end": to_dt(item["end_period"] * self.period_ms) if "end_period" in item else None,
            },
            ts_ms=ts_ms,
        )

    def _inventory_event(self, sku: str, region: str, channel: str, reason: str, ts_ms: int) -> Event:
        inv = self.inventory[(sku, region, channel)]
        return Event(
            topic="inventory_updates",
            key=f"{sku}|{region}|{channel}",
            value={
                "sku": sku,
                "region": region,
                "channel": channel,
                "on_hand": int(inv["on_hand"]),
                "on_order": int(inv["on_order"]),
                "reason": reason,
                "event_time": to_dt(ts_ms),
            },
            ts_ms=ts_ms,
        )

    def _split_units(self, units: int) -> list[int]:
        lines = []
        while units > 0:
            u = min(units, self.rng.choice((1, 1, 1, 1, 2, 2, 3)))
            lines.append(u)
            units -= u
        return lines

    # ------------------------------------------------------------- control API

    def start_launch(self, sku: str, region: str | None = None, multiplier: float | None = None,
                     decay_periods: float | None = None, now_ms: int | None = None) -> Event:
        cfg = self.profile.get("launch", {})
        with self.lock:
            now_ms = now_ms or int(datetime.now(tz=timezone.utc).timestamp() * 1000)
            product = self.products[sku]
            item = {
                "promo_id": f"LAUNCH-{uuid.uuid4().hex[:6].upper()}",
                "name": f"{cfg.get('label', 'Launch')}: {product['name']}",
                "sku": sku,
                "region": region,
                "discount_pct": 0.0,
                "multiplier": float(multiplier or cfg.get("default_multiplier", 8.0)),
                "decay_periods": float(decay_periods or cfg.get("decay_periods", 5)),
                "start_period": self._period_of(now_ms) + 1,
            }
            self.launches.append(item)
            return self._promotion_event(item, "LAUNCH", "STARTED", now_ms)

    def start_promo(self, sku: str, region: str | None = None, discount_pct: float | None = None,
                    periods: int | None = None, now_ms: int | None = None) -> Event:
        cfg = self.profile.get("promo", {})
        with self.lock:
            now_ms = now_ms or int(datetime.now(tz=timezone.utc).timestamp() * 1000)
            product = self.products[sku]
            discount = float(discount_pct or cfg.get("default_discount_pct", 0.25))
            item = {
                "promo_id": f"PROMO-{uuid.uuid4().hex[:6].upper()}",
                "name": f"{cfg.get('label', 'Promo')}: {int(discount * 100)}% off {product['name']}",
                "sku": sku,
                "region": region,
                "discount_pct": discount,
                "end_period": self._period_of(now_ms) + 1 + int(periods or cfg.get("default_periods", 8)),
            }
            self.promos.append(item)
            return self._promotion_event(item, "PROMO", "STARTED", now_ms)

    def end_promotion(self, promo_id: str, now_ms: int | None = None) -> Event | None:
        """End a promo, launch or peak event early. Returns None if it is not running."""
        with self.lock:
            now_ms = now_ms or int(datetime.now(tz=timezone.utc).timestamp() * 1000)
            for items, kind in ((self.promos, "PROMO"), (self.launches, "LAUNCH")):
                for item in items:
                    if item["promo_id"] == promo_id:
                        items.remove(item)
                        return self._promotion_event(item, item.get("kind", kind), "ENDED", now_ms)
            return None

    def start_peak_event(self, sku: str, region: str | None, name: str, multiplier: float,
                         periods: int, now_ms: int | None = None) -> Event:
        """Sustained demand surge (Black Friday, Cyber Monday, a heatwave...)."""
        with self.lock:
            now_ms = now_ms or int(datetime.now(tz=timezone.utc).timestamp() * 1000)
            start = self._period_of(now_ms) + 1
            item = {
                "promo_id": f"PEAK-{uuid.uuid4().hex[:6].upper()}",
                "kind": "PEAK",
                "name": name,
                "sku": sku,
                "region": region,
                "discount_pct": 0.0,
                "multiplier": float(multiplier),
                "start_period": start,
                "end_period": start + int(periods),
            }
            self.launches.append(item)
            return self._promotion_event(item, "PEAK", "STARTED", now_ms)

    def set_stock(self, sku: str, region: str, channel: str, on_hand: int,
                  now_ms: int | None = None) -> Event:
        """Cycle-count adjustment: set on-hand stock for one location."""
        with self.lock:
            now_ms = now_ms or int(datetime.now(tz=timezone.utc).timestamp() * 1000)
            self.inventory[(sku, region, channel)]["on_hand"] = max(int(on_hand), 0)
            return self._inventory_event(sku, region, channel, "ADJUSTMENT", now_ms)

    def transfer(self, sku: str, from_region: str, to_region: str, channel: str, units: int,
                 transit_periods: int = 1, now_ms: int | None = None) -> tuple[int, list[Event]]:
        """Move stock between regions. Leaves the source now, arrives after transit_periods."""
        with self.lock:
            now_ms = now_ms or int(datetime.now(tz=timezone.utc).timestamp() * 1000)
            src = self.inventory[(sku, from_region, channel)]
            dst = self.inventory[(sku, to_region, channel)]
            units = max(min(int(units), src["on_hand"]), 0)
            if not units:
                return 0, []
            src["on_hand"] -= units
            dst["on_order"] += units
            dst["arrivals"].append((self._period_of(now_ms) + max(int(transit_periods), 1), units, "TRANSFER_IN"))
            return units, [
                self._inventory_event(sku, from_region, channel, "TRANSFER_OUT", now_ms),
                self._inventory_event(sku, to_region, channel, "TRANSFER_IN_TRANSIT", now_ms),
            ]

    def start_peak_scenario(self, now_ms: int | None = None) -> tuple[dict, list[Event]]:
        """Set up the profile's peak-season scenario: surplus in one region, a surge in another."""
        cfg = self.profile["peak_event"]
        sku, surge, surplus = cfg["sku"], cfg["surge_region"], cfg["surplus_region"]
        with self.lock:
            events = []
            for ch in CHANNELS:
                events.append(self.set_stock(sku, surplus, ch, int(cfg["surplus_stock"][ch]), now_ms))
                events.append(self.set_stock(sku, surge, ch, int(cfg["surge_start_stock"][ch]), now_ms))
            events.append(self.start_peak_event(sku, surge, cfg["name"], float(cfg["multiplier"]),
                                                int(cfg["periods"]), now_ms))
            return cfg, events

    def restock(self, sku: str, region: str | None = None, channel: str | None = None,
                units: int | None = None, now_ms: int | None = None) -> list[Event]:
        with self.lock:
            now_ms = now_ms or int(datetime.now(tz=timezone.utc).timestamp() * 1000)
            product = self.products[sku]
            events = []
            for r in self.regions:
                if region and r["id"] != region:
                    continue
                for ch in CHANNELS:
                    if channel and ch != channel:
                        continue
                    qty = int(units or product["reorder_qty"][ch])
                    self.inventory[(sku, r["id"], ch)]["on_hand"] += qty
                    events.append(self._inventory_event(sku, r["id"], ch, "RESTOCK", now_ms))
            return events

    def state(self) -> dict:
        with self.lock:
            return {
                "period_index": self.period_index,
                "active_promos": [
                    {k: v for k, v in p.items() if k in ("promo_id", "name", "sku", "region", "discount_pct")}
                    for p in self.promos
                ],
                "active_launches": [
                    {k: v for k, v in l.items() if k in ("promo_id", "name", "sku", "region", "multiplier")}
                    for l in self.launches
                ],
                "inventory": [
                    {"sku": k[0], "region": k[1], "channel": k[2], "on_hand": v["on_hand"], "on_order": v["on_order"]}
                    for k, v in self.inventory.items()
                ],
                "last_period": self.last_period_summary,
            }

    # --------------------------------------------------------------- simulation

    def generate_period(self, period_start_ms: int) -> list[Event]:
        """Generate all events for one period, sorted by event time."""
        with self.lock:
            period_index = self._period_of(period_start_ms)
            self.period_index = period_index
            hour = self._hour_of(period_index)
            curve = self.daily_curve[hour % len(self.daily_curve)]
            period_end_ms = period_start_ms + self.period_ms
            events: list[Event] = []

            def ts_in_period() -> int:
                return period_start_ms + int(self.rng.random() * (self.period_ms - 2))

            # Expire promos / launches and announce the end.
            for p in [p for p in self.promos if period_index >= p["end_period"]]:
                self.promos.remove(p)
                events.append(self._promotion_event(p, "PROMO", "ENDED", period_start_ms))
            for l in [l for l in self.launches if self._launch_expired(l, period_index)]:
                self.launches.remove(l)
                events.append(self._promotion_event(l, l.get("kind", "LAUNCH"), "ENDED", period_start_ms))

            # Replenishment and transfer arrivals: (period_index, qty, reason).
            for (sku, region, ch), inv in self.inventory.items():
                arrived = [a for a in inv["arrivals"] if a[0] <= period_index]
                for a in arrived:
                    inv["arrivals"].remove(a)
                    inv["on_hand"] += a[1]
                    inv["on_order"] -= a[1]
                for reason in sorted({a[2] if len(a) > 2 else "RESTOCK" for a in arrived}):
                    events.append(self._inventory_event(sku, region, ch, reason, period_start_ms))

            units_total, lost_total = 0, 0
            for sku, product in self.products.items():
                for r in self.regions:
                    region = r["id"]
                    discount, promo_id = self._promo_discount(sku, region)
                    lift = 1.0 + float(product.get("promo_elasticity", 2.0)) * discount
                    launch = self._launch_multiplier(sku, region, period_index)
                    interest = 0.0

                    for ch in CHANNELS:
                        lam = float(product["base_demand"][ch]) * curve * float(r.get("weight", 1.0)) * lift * launch
                        lam *= self.rng.lognormvariate(0.0, 0.12)
                        demand = poisson(lam, self.rng)
                        interest += demand if ch == "ONLINE" else 0.5 * demand

                        inv = self.inventory[(sku, region, ch)]
                        sold = min(demand, inv["on_hand"])
                        inv["on_hand"] -= sold
                        units_total += sold
                        lost_total += demand - sold

                        for units in self._split_units(sold):
                            ts = ts_in_period()
                            if ch == "ONLINE":
                                events.append(Event("orders", f"{sku}|{region}", {
                                    "order_id": uuid.uuid4().hex,
                                    "customer_id": f"C{self.rng.randint(1, 80000):06d}",
                                    "sku": sku,
                                    "region": region,
                                    "device": self.rng.choice(("APP", "APP", "WEB")),
                                    "units": units,
                                    "unit_price": float(product["price"]),
                                    "discount_pct": discount,
                                    "promo_id": promo_id,
                                    "event_time": to_dt(ts),
                                }, ts))
                            else:
                                events.append(Event("pos_sales", f"{sku}|{region}", {
                                    "txn_id": uuid.uuid4().hex,
                                    "store_id": f"{region}-S{self.rng.randint(1, self.stores_per_region):02d}",
                                    "loyalty_id": f"L{self.rng.randint(1, 50000):06d}" if self.rng.random() < 0.6 else None,
                                    "sku": sku,
                                    "region": region,
                                    "units": units,
                                    "unit_price": float(product["price"]),
                                    "discount_pct": discount,
                                    "promo_id": promo_id,
                                    "event_time": to_dt(ts),
                                }, ts))

                        # Batch replenishment once stock falls below the reorder point.
                        if inv["on_hand"] + inv["on_order"] <= int(product["reorder_point"][ch]):
                            qty = int(product["reorder_qty"][ch])
                            inv["on_order"] += qty
                            inv["arrivals"].append((period_index + self.lead_time, qty))

                    # Online browsing signals reflect total interest, even when out of stock.
                    for _ in range(poisson(interest * float(self.conversion.get("views_per_unit", 3.0)), self.rng)):
                        ts = ts_in_period()
                        events.append(Event("clickstream", f"{sku}|{region}", {
                            "event_id": uuid.uuid4().hex,
                            "session_id": uuid.uuid4().hex[:12],
                            "customer_id": f"C{self.rng.randint(1, 80000):06d}",
                            "sku": sku,
                            "region": region,
                            "device": self.rng.choice(("APP", "APP", "WEB")),
                            "action": "VIEW" if self.rng.random() < 0.9 else "WISHLIST",
                            "event_time": to_dt(ts),
                        }, ts))
                    for _ in range(poisson(interest * float(self.conversion.get("cart_adds_per_unit", 1.5)), self.rng)):
                        ts = ts_in_period()
                        events.append(Event("cart_events", f"{sku}|{region}", {
                            "event_id": uuid.uuid4().hex,
                            "cart_id": uuid.uuid4().hex[:12],
                            "customer_id": f"C{self.rng.randint(1, 80000):06d}",
                            "sku": sku,
                            "region": region,
                            "action": "ADD" if self.rng.random() < 0.85 else "REMOVE",
                            "units": self.rng.choice((1, 1, 1, 2)),
                            "event_time": to_dt(ts),
                        }, ts))

            # End-of-period inventory snapshot for every SKU / region / channel.
            for (sku, region, ch) in self.inventory:
                events.append(self._inventory_event(sku, region, ch, "SNAPSHOT", period_end_ms - 1))

            self.last_period_summary = {
                "period_start": period_start_ms,
                "simulated_hour": hour,
                "units_sold": units_total,
                "lost_sales_units": lost_total,
                "events": len(events),
            }
            events.sort(key=lambda e: e.ts_ms)
            return events
