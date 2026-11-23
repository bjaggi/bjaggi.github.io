"""Inventory rebalancing agent.

Runs round the clock inside the dashboard process. Every period it reads the
latest `stockout_risk` rows (forecast joined with inventory in Flink), finds
locations that will sell out before a supplier order could arrive, and moves
spare stock from another region of the same channel. Transfers are executed
through the data generator, so they show up as `inventory_updates` events
(TRANSFER_OUT / TRANSFER_IN_TRANSIT / TRANSFER_IN) and flow back through Flink.
"""

from __future__ import annotations

import logging
import math
import statistics
import threading
import time
import uuid
from collections import deque
from typing import Callable

log = logging.getLogger("agent")


class InventoryAgent:
    def __init__(self, profile: dict, state, execute: Callable[[str, dict], dict],
                 trigger_cover: float = 6.0, target_cover: float = 12.0, donor_keep_cover: float = 24.0,
                 transit_periods: int = 1, min_units: int = 5, overstock_cover: float = 120.0,
                 overstock_keep_cover: float = 48.0, markdown_pct: float = 0.2, markdown_periods: int = 8):
        self.profile = profile
        self.state = state
        self.execute = execute
        self.period_ms = int(profile["period"]["seconds"]) * 1000
        self.label = profile["period"].get("label", "period")
        self.lead_time = int(profile.get("replenishment", {}).get("lead_time_periods", 6))
        self.products = {p["sku"]: p for p in profile["products"]}
        self.regions = {r["id"]: r["name"] for r in profile["regions"]}
        self.channels = {k: v.get("name", k) for k, v in profile.get("channels", {}).items()}
        self.trigger_cover = trigger_cover
        self.target_cover = target_cover
        self.donor_keep_cover = donor_keep_cover
        self.transit_periods = transit_periods
        self.min_units = min_units
        self.overstock_cover = overstock_cover
        self.overstock_keep_cover = overstock_keep_cover
        self.markdown_pct = markdown_pct
        self.markdown_periods = markdown_periods

        self.enabled = False
        self.require_approval = True
        self.pending: dict[str, dict] = {}
        self.rejected_until: dict[tuple, int] = {}
        self.lock = threading.Lock()
        self.decisions: deque = deque(maxlen=40)
        self.history: deque = deque(maxlen=100)
        self.in_transit: list[dict] = []
        self.escalated: dict[tuple, int] = {}
        self.stats = {"transfers": 0, "units_moved": 0, "value_moved": 0.0, "checks": 0, "ticks": 0}
        self.last_window = None
        self.enabled_at = None

    # ------------------------------------------------------------ control

    def set_enabled(self, on: bool):
        with self.lock:
            if on and not self.enabled:
                self.enabled_at = int(time.time() * 1000)
            self.enabled = on
        self.state.touch()

    def snapshot(self) -> dict:
        with self.lock:
            now = int(time.time() * 1000)
            return {
                "enabled": self.enabled,
                "enabled_at": self.enabled_at,
                "require_approval": self.require_approval,
                "pending": sorted(({k: v for k, v in p.items() if k != "key"} for p in self.pending.values()),
                                  key=lambda p: p["t"]),
                "recommendations": sorted(
                    [{k: v for k, v in p.items() if k != "key"} | {"status": "PENDING"} for p in self.pending.values()]
                    + list(self.history),
                    key=lambda p: -p["t"]),
                "monitored": len(self.state.risk),
                "decisions": list(self.decisions)[:15],
                "in_transit": [t for t in self.in_transit if t["arrive_t"] > now - self.period_ms],
                "stats": dict(self.stats),
                "policy": {
                    "trigger_cover": self.trigger_cover,
                    "target_cover": self.target_cover,
                    "donor_keep_cover": self.donor_keep_cover,
                    "transit_periods": self.transit_periods,
                    "supplier_lead_time": self.lead_time,
                },
            }

    def run_forever(self):
        while True:
            try:
                self.tick()
            except Exception:
                log.exception("agent tick failed")
            time.sleep(1.0)

    # ------------------------------------------------------------ decisions

    def _normal_rate(self, key: tuple) -> float | None:
        with self.state.lock:
            pts = self.state.points.get(key) or {}
            vals = [p["actual"] for p in list(pts.values())[-48:] if p.get("actual") is not None]
        return statistics.median(vals) if len(vals) >= 6 else None

    def _loc(self, region: str, channel: str) -> str:
        return f"{self.regions.get(region, region)} {self.channels.get(channel, channel)}"

    def tick(self):
        if not self.enabled:
            return
        with self.state.lock:
            rows = [dict(r) for r in self.state.risk.values()]
        if not rows:
            return
        window = max(r["window_time"] for r in rows)
        if window == self.last_window:
            return
        self.last_window = window
        now = int(time.time() * 1000)
        P = self.label

        with self.lock:
            self.in_transit = [t for t in self.in_transit if t["arrive_t"] > now - self.period_ms]
            self.stats["ticks"] += 1
            self.stats["checks"] += len(rows)
            transit_to = {}
            for t in self.in_transit:
                k = (t["sku"], t["to_region"], t["channel"])
                transit_to[k] = transit_to.get(k, 0) + t["units"]

        by_sku_channel: dict[tuple, list[dict]] = {}
        for r in rows:
            by_sku_channel.setdefault((r["sku"], r["channel"]), []).append(r)

        acted = False
        needed: set[tuple] = set()
        busy: set[tuple] = set()
        for r in sorted(rows, key=lambda x: (x.get("periods_of_cover") or 1e9)):
            key = (r["sku"], r["region"], r["channel"])
            rate = max(r.get("forecast_next") or 0.0, r.get("units_sold") or 0.0)
            if rate < 1.0:
                continue
            incoming = transit_to.get(key, 0)
            cover = (r["on_hand"] + incoming) / rate
            # a waiting request is only withdrawn once cover is clearly back to normal
            waiting = any(p["key"] == key for p in self.pending.values())
            if cover >= self.trigger_cover * (1.5 if waiting else 1.0) or incoming:
                continue
            need = math.ceil(self.target_cover * rate - r["on_hand"])
            donors = []
            for d in by_sku_channel.get((r["sku"], r["channel"]), []):
                if d["region"] == r["region"]:
                    continue
                drate = max(d.get("forecast_next") or 0.0, d.get("units_sold") or 0.0, 0.5)
                surplus = int(d["on_hand"] - self.donor_keep_cover * drate)
                donors.append((surplus, drate, d))
            donors.sort(key=lambda x: -x[0])
            product = self.products.get(r["sku"], {})
            name = product.get("name", r["sku"])
            normal = self._normal_rate(key)
            surge = f" ({rate / normal:.1f}x its normal {normal:.0f}/{P})" if normal and rate > 1.5 * normal else ""
            sells_out = r["on_hand"] / rate
            detect = (f"{self._loc(r['region'], r['channel'])} is selling {rate:.0f} units/{P}{surge} with "
                      f"{r['on_hand']} on hand: sells out in {sells_out:.1f} {P}s. A supplier order takes "
                      f"{self.lead_time} {P}s, too late.")

            if donors and donors[0][0] >= self.min_units:
                surplus, drate, d = donors[0]
                units = max(min(need, surplus), self.min_units)
                plan = {
                    "key": key, "t": now, "kind": "STOCKOUT", "action": "TRANSFER",
                    "sku": r["sku"], "product": name, "channel": r["channel"],
                    "from_region": d["region"], "to_region": r["region"], "units": units, "max_units": surplus,
                    "rate": rate, "dest_on_hand": r["on_hand"], "price": float(product.get("price", 0.0)),
                    "detected": detect,
                    "found": (f"{self._loc(d['region'], d['channel'])} has {d['on_hand']} units, "
                              f"{d['on_hand'] / drate:.0f} {P}s of cover. It keeps {self.donor_keep_cover:.0f} {P}s "
                              f"for its own shoppers, so {surplus} are spare."),
                    "before_cover": round(sells_out, 1),
                }
                busy.add((r["sku"], r["channel"]))
                if self._propose_or_execute(plan, needed):
                    transit_to[key] = units if not self.require_approval else 0
                    acted = True
            else:
                last = self.escalated.get(key)
                if last is not None and last >= self.stats["ticks"] - 6:
                    continue
                self.escalated[key] = self.stats["ticks"]
                units = max(need, self.min_units)
                plan = {
                    "key": key, "t": now, "kind": "STOCKOUT", "action": "ORDER",
                    "sku": r["sku"], "product": name, "channel": r["channel"],
                    "to_region": r["region"], "units": units, "max_units": units,
                    "rate": rate, "dest_on_hand": r["on_hand"], "price": float(product.get("price", 0.0)),
                    "detected": detect,
                    "found": ("Every other region needs its stock for its own forecast, so none can spare "
                              f"{self.min_units} units without dropping under {self.donor_keep_cover:.0f} {P}s of cover."),
                    "before_cover": round(sells_out, 1),
                }
                if self._propose_or_execute(plan, needed):
                    acted = True
        acted |= self._overstock_pass(rows, by_sku_channel, transit_to, needed, busy, now)
        with self.lock:
            for pid in [pid for pid, p in self.pending.items() if p["key"] not in needed]:
                self._record(self.pending.pop(pid), "WITHDRAWN",
                             result="Stock or demand changed, so the agent withdrew it. Nothing was moved.")
                acted = True
        if acted:
            self.state.touch()

    def _overstock_pass(self, rows, by_sku_channel, transit_to, needed, busy, now) -> bool:
        """Propose moving or marking down stock that will sit unsold for weeks."""
        P = self.label
        acted, seen_skus = False, set()
        overstock_pending = sum(1 for p in self.pending.values() if p["kind"] == "OVERSTOCK")
        for r in sorted(rows, key=lambda x: -x["on_hand"] / max(self._normal_rate((x["sku"], x["region"], x["channel"])) or 1e9, 0.5)):
            # typical hourly sales, so quiet night hours don't look like overstock
            typical = r.get("typical_rate") or self._normal_rate((r["sku"], r["region"], r["channel"]))
            if typical is None:
                continue
            rate = max(typical, r.get("forecast_next") or 0.0, 0.5)
            cover = r["on_hand"] / rate
            key = ("OVER", r["sku"], r["region"], r["channel"])
            has_pending = any(p["key"] == key for p in self.pending.values())
            # a waiting request is only withdrawn once cover is clearly back to normal
            threshold = self.overstock_cover * (0.75 if has_pending else 1.0)
            if cover <= threshold or r["sku"] in seen_skus or (r["sku"], r["channel"]) in busy:
                continue
            if not has_pending and (overstock_pending >= 2 or self.rejected_until.get(key, -1) > self.stats["ticks"]):
                continue
            excess = int(r["on_hand"] - self.overstock_keep_cover * rate)
            if excess < self.min_units:
                continue
            seen_skus.add(r["sku"])
            product = self.products.get(r["sku"], {})
            name = product.get("name", r["sku"])
            detect = (f"{self._loc(r['region'], r['channel'])} holds {r['on_hand']} units but typically sells "
                      f"{rate:.1f}/{P}: {cover:.0f} {P}s{f' ({cover / 24:.1f} days)' if P == 'hour' else ''} of stock. Cash is tied up and the item risks a "
                      f"deep markdown later.")
            dests = []
            for d in by_sku_channel.get((r["sku"], r["channel"]), []):
                if d["region"] == r["region"]:
                    continue
                drate = max(d.get("forecast_next") or 0.0, d.get("units_sold") or 0.0, 0.5)
                dk = (d["sku"], d["region"], d["channel"])
                dests.append(((d["on_hand"] + transit_to.get(dk, 0)) / drate, drate, d))
            dests.sort(key=lambda x: x[0])
            base = {"key": key, "t": now, "kind": "OVERSTOCK", "sku": r["sku"], "product": name,
                    "channel": r["channel"], "price": float(product.get("price", 0.0)), "detected": detect}
            current = next((p["action"] for p in self.pending.values() if p["key"] == key), None)
            move_below = self.overstock_keep_cover * {"TRANSFER": 1.25, "MARKDOWN": 0.75}.get(current, 1.0)
            if dests and dests[0][0] < move_below:
                dcover, drate, d = dests[0]
                units = max(min(excess, math.ceil(self.overstock_keep_cover * drate - d["on_hand"])), self.min_units)
                plan = base | {
                    "action": "TRANSFER", "from_region": r["region"], "to_region": d["region"],
                    "units": units, "max_units": excess, "rate": drate, "dest_on_hand": d["on_hand"],
                    "before_cover": round(dcover, 1),
                    "found": (f"{self._loc(d['region'], d['channel'])} sells {drate:.0f}/{P} and has only "
                              f"{dcover:.0f} {P}s of stock, so the extra units will sell faster there."),
                }
            else:
                with self.state.lock:
                    promo_running = any(p["sku"] == r["sku"] and p.get("region") in (None, r["region"])
                                        for p in self.state.promos.values())
                if promo_running:
                    continue
                plan = base | {
                    "action": "MARKDOWN", "region": r["region"], "discount_pct": self.markdown_pct,
                    "periods": self.markdown_periods, "units": 0, "max_units": 0,
                    "found": "No other region needs more of it, so moving it would not help.",
                }
            if self._propose_or_execute(plan, needed):
                acted = True
                overstock_pending += 0 if has_pending else 1
        return acted

    def _propose_or_execute(self, plan: dict, needed: set) -> bool:
        """Execute right away in autonomous mode, otherwise queue (or refresh) an approval request."""
        if not self.require_approval:
            plan = plan | {"id": uuid.uuid4().hex[:8], "proposal_text": self._proposal_text(plan, plan["units"])}
            decision = self._execute_plan(plan, plan["units"])
            if decision:
                with self.lock:
                    self._record(plan, "AUTO", by="agent (autonomous)", decision=decision)
            return decision is not None
        needed.add(plan["key"])
        with self.lock:
            existing = next((p for p in self.pending.values() if p["key"] == plan["key"]), None)
            if existing and existing["action"] != plan["action"]:
                self._record(self.pending.pop(existing["id"]), "WITHDRAWN",
                             result="Replaced by a different recommendation for the same location.")
                existing = None
            if existing:
                existing.update({k: v for k, v in plan.items() if k not in ("t", "units")})
                existing["proposal_text"] = self._proposal_text(existing, existing["units"])
                return False
            if self.rejected_until.get(plan["key"], -1) > self.stats["ticks"]:
                return False
            pid = uuid.uuid4().hex[:8]
            self.pending[pid] = plan | {"id": pid, "proposal_text": self._proposal_text(plan, plan["units"])}
        log.info("proposed %s %s for %s", plan["kind"], plan["action"], plan["sku"])
        return True

    # ------------------------------------------------------------ execution and approvals

    def _record(self, plan: dict, status: str, by: str | None = None, decision: dict | None = None,
                result: str | None = None):
        """Append a resolved recommendation to the trail. Caller holds self.lock."""
        self.history.appendleft({k: v for k, v in plan.items() if k != "key"} | {
            "status": status, "decided_by": by, "decided_t": int(time.time() * 1000),
            "result": result or (decision or {}).get("headline"),
            "executed_units": (decision or {}).get("units"),
        })

    def _proposal_text(self, plan: dict, units: int) -> str:
        P = self.label
        if plan["action"] == "MARKDOWN":
            return (f"Start a {plan['discount_pct'] * 100:.0f}% markdown on {plan['product']} in "
                    f"{self.regions.get(plan['region'])} for {plan['periods']} {P}s to sell down the excess "
                    f"while it still sells at a good price.")
        if plan["action"] == "ORDER":
            return (f"Order {units} units of {plan['product']} from the warehouse for "
                    f"{self._loc(plan['to_region'], plan['channel'])}. No other region can spare stock. "
                    f"The order takes {self.lead_time} {P}s.")
        return (f"Move {units} units from {self._loc(plan['from_region'], plan['channel'])} to "
                f"{self._loc(plan['to_region'], plan['channel'])}, arriving in {self.transit_periods} {P}. "
                f"That lifts {self.regions.get(plan['to_region'])} to about "
                f"{(plan['dest_on_hand'] + units) / plan['rate']:.0f} {P}s of cover.")

    def _execute_plan(self, plan: dict, units: int, approved_by: str | None = None) -> dict | None:
        if plan["action"] == "MARKDOWN":
            decision = self._execute_markdown(plan, approved_by)
        elif plan["action"] == "ORDER":
            decision = self._execute_order(plan, units, approved_by)
        else:
            decision = self._execute_transfer(plan, units, approved_by)
        if decision and plan["kind"] == "OVERSTOCK":
            with self.lock:
                self.rejected_until[plan["key"]] = self.stats["ticks"] + 12
        return decision

    def _execute_transfer(self, plan: dict, units: int, approved_by: str | None) -> dict | None:
        body = {"sku": plan["sku"], "from_region": plan["from_region"], "to_region": plan["to_region"],
                "channel": plan["channel"], "units": int(units), "transit_periods": self.transit_periods}
        try:
            res = self.execute("transfer", body)
        except Exception as e:  # keep the agent alive if the control API is down
            log.warning("transfer failed: %s", e)
            return None
        moved = int(res.get("moved") or 0)
        if not moved:
            return None
        now = int(time.time() * 1000)
        P = self.label
        decision = {
            "id": uuid.uuid4().hex[:8], "t": now, "action": "TRANSFER",
            "sku": plan["sku"], "product": plan["product"], "channel": plan["channel"],
            "from_region": plan["from_region"], "to_region": plan["to_region"], "units": moved,
            "approved_by": approved_by,
            "headline": f"Moved {moved} units of {plan['product']}: {self.regions.get(plan['from_region'])} → "
                        f"{self.regions.get(plan['to_region'])} ({self.channels.get(plan['channel'], plan['channel'])})",
            "detected": plan["detected"],
            "found": plan["found"],
            "action_text": (f"{'Approved by ' + approved_by + '. ' if approved_by else ''}Transfer {moved} units, "
                            f"arriving in {self.transit_periods} {P}. That lifts "
                            f"{self.regions.get(plan['to_region'])} to about "
                            f"{(plan['dest_on_hand'] + moved) / plan['rate']:.0f} {P}s of cover."),
            "before_cover": plan["before_cover"],
            "after_cover": round((plan["dest_on_hand"] + moved) / plan["rate"], 1),
        }
        with self.lock:
            self.in_transit.append({**body, "units": moved, "t": now,
                                    "arrive_t": now + self.transit_periods * self.period_ms})
            self.decisions.appendleft(decision)
            self.stats["transfers"] += 1
            self.stats["units_moved"] += moved
            self.stats["value_moved"] += moved * plan["price"]
        log.info(decision["headline"])
        return decision

    def _execute_order(self, plan: dict, units: int, approved_by: str | None) -> dict | None:
        body = {"sku": plan["sku"], "region": plan["to_region"], "channel": plan["channel"], "units": int(units)}
        try:
            res = self.execute("restock", body)
        except Exception as e:
            log.warning("order failed: %s", e)
            return None
        if not res.get("restocked"):
            return None
        now = int(time.time() * 1000)
        P = self.label
        decision = {
            "id": uuid.uuid4().hex[:8], "t": now, "action": "ORDER",
            "sku": plan["sku"], "product": plan["product"], "channel": plan["channel"],
            "to_region": plan["to_region"], "units": int(units), "approved_by": approved_by,
            "headline": f"Ordered {int(units)} units of {plan['product']} for "
                        f"{self.regions.get(plan['to_region'])} ({self.channels.get(plan['channel'], plan['channel'])})",
            "detected": plan["detected"],
            "found": plan["found"],
            "action_text": (f"{'Approved by ' + approved_by + '. ' if approved_by else ''}"
                            f"Warehouse order for {int(units)} units. Supplier lead time is {self.lead_time} {P}s."),
            "before_cover": plan["before_cover"],
        }
        with self.lock:
            self.in_transit.append({
                "sku": plan["sku"], "to_region": plan["to_region"], "channel": plan["channel"],
                "units": int(units), "t": now, "arrive_t": now + self.lead_time * self.period_ms,
            })
            self.decisions.appendleft(decision)
            self.stats["orders"] = self.stats.get("orders", 0) + 1
        log.info(decision["headline"])
        return decision

    def _execute_markdown(self, plan: dict, approved_by: str | None) -> dict | None:
        body = {"sku": plan["sku"], "region": plan["region"], "discount_pct": plan["discount_pct"],
                "periods": plan["periods"]}
        try:
            res = self.execute("promo", body)
        except Exception as e:
            log.warning("markdown failed: %s", e)
            return None
        decision = {
            "id": uuid.uuid4().hex[:8], "t": int(time.time() * 1000), "action": "MARKDOWN",
            "sku": plan["sku"], "product": plan["product"], "channel": plan["channel"],
            "to_region": plan["region"], "units": 0, "approved_by": approved_by,
            "headline": f"Started {plan['discount_pct'] * 100:.0f}% markdown on {plan['product']} in "
                        f"{self.regions.get(plan['region'])}",
            "detected": plan["detected"],
            "found": plan["found"],
            "action_text": (f"{'Approved by ' + approved_by + '. ' if approved_by else ''}"
                            f"{res.get('name', 'Markdown')} runs for {plan['periods']} {self.label}s."),
        }
        with self.lock:
            self.decisions.appendleft(decision)
            self.stats["markdowns"] = self.stats.get("markdowns", 0) + 1
        return decision

    def set_require_approval(self, on: bool):
        with self.lock:
            self.require_approval = on
            if not self.enabled:
                self.enabled = True
                self.enabled_at = int(time.time() * 1000)
            pending = list(self.pending.values()) if not on else []
            if not on:
                self.pending.clear()
        for p in pending:
            decision = self._execute_plan(p, p["units"], approved_by="auto-approve")
            with self.lock:
                self._record(p, "AUTO" if decision else "FAILED", by="auto-approve", decision=decision,
                             result=None if decision else "Could not be executed.")
        self.state.touch()

    def approve(self, pid: str, units: int | None = None, approver: str = "planner") -> dict:
        with self.lock:
            plan = self.pending.pop(pid, None)
        if plan is None:
            raise KeyError(pid)
        units = max(1, min(int(units or plan["units"]), max(plan["max_units"], 1)))
        decision = self._execute_plan(plan, units, approved_by=approver)
        with self.lock:
            self._record(plan, "APPROVED" if decision else "FAILED", by=approver, decision=decision,
                         result=None if decision else "Approved, but could not be executed (source stock changed).")
        self.state.touch()
        if decision is None:
            raise RuntimeError("The transfer could not be executed (source stock may have changed)")
        return decision

    def reject(self, pid: str, approver: str = "planner") -> dict:
        with self.lock:
            plan = self.pending.pop(pid, None)
            if plan is None:
                raise KeyError(pid)
            self.rejected_until[plan["key"]] = self.stats["ticks"] + 6
            if plan["action"] == "MARKDOWN":
                what = f"{plan['discount_pct'] * 100:.0f}% markdown on {plan['product']} in {self.regions.get(plan['region'])}"
            else:
                what = f"move {plan['units']} units of {plan['product']} to {self.regions.get(plan['to_region'])}"
            decision = {
                "id": uuid.uuid4().hex[:8], "t": int(time.time() * 1000), "action": "REJECTED",
                "sku": plan["sku"], "product": plan["product"], "channel": plan["channel"],
                "from_region": plan.get("from_region"), "to_region": plan.get("to_region", plan.get("region")),
                "units": 0,
                "headline": f"Rejected: {what}",
                "detected": plan["detected"],
                "found": plan["found"],
                "action_text": f"Rejected by {approver}. The agent won't propose this again for 6 {self.label}s.",
            }
            self.decisions.appendleft(decision)
            self._record(plan, "REJECTED", by=approver, result="Nothing was moved.")
        self.state.touch()
        return decision
