"""In-memory view of the Flink output topics, shaped for the dashboard."""

from __future__ import annotations

import threading
from collections import defaultdict, deque
from datetime import datetime

HISTORY = 144  # periods kept per series (6 simulated days)
RISK_ORDER = {"OUT_OF_STOCK": 0, "HIGH": 1, "MEDIUM": 2, "OVERSTOCK": 3, "LOW": 4, "WARMING_UP": 5}


def ms(value) -> int | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return int(value.timestamp() * 1000)
    return int(value)


def jsonable(row: dict) -> dict:
    return {k: (ms(v) if isinstance(v, datetime) else v) for k, v in row.items()}


class DemandState:
    def __init__(self, period_ms: int):
        self.period_ms = period_ms
        self.lock = threading.Lock()
        self.version = 0
        self.points: dict[tuple, dict[int, dict]] = defaultdict(dict)
        self.next_forecast: dict[tuple, dict] = {}
        self.risk: dict[tuple, dict] = {}
        self.anomalies: deque = deque(maxlen=40)
        self.explanations: deque = deque(maxlen=25)
        self.promos: dict[str, dict] = {}
        self.promo_history: dict[str, dict] = {}
        self.model = None
        self.counts = defaultdict(int)
        self.agent_recs: deque = deque(maxlen=100)

    def _bump(self, topic: str):
        self.version += 1
        self.counts[topic] += 1

    def touch(self):
        with self.lock:
            self.version += 1

    def on_forecast(self, v: dict):
        key = (v["sku"], v["region"], v["channel"])
        t = ms(v["window_end"])
        with self.lock:
            prev = self.next_forecast.get(key)
            point = {
                "t": t,
                "actual": v["units_sold"],
                "pred": prev["forecast"] if prev and prev["t"] == t else None,
                "lower": prev["lower"] if prev and prev["t"] == t else None,
                "upper": prev["upper"] if prev and prev["t"] == t else None,
                "promo": bool(v.get("promo_active")),
                "views": v.get("views"),
            }
            series = self.points[key]
            series[t] = point
            if len(series) > HISTORY:
                for old in sorted(series)[: len(series) - HISTORY]:
                    del series[old]
            self.next_forecast[key] = {
                "t": t + self.period_ms,
                "forecast": v.get("forecast_next"),
                "lower": v.get("lower_next"),
                "upper": v.get("upper_next"),
                "horizon": v.get("forecast_horizon"),
                "rmse": v.get("rmse"),
            }
            self.model = v.get("model") or self.model
            self._bump("forecast")

    def on_risk(self, v: dict):
        key = (v["sku"], v["region"], v["channel"])
        with self.lock:
            row = jsonable(v)
            self.risk[key] = row
            t = -(-row["window_time"] // self.period_ms) * self.period_ms
            point = self.points[key].get(t)
            if point is not None:
                point["on_hand"] = row.get("on_hand")
            self._bump("risk")

    def on_anomaly(self, v: dict):
        with self.lock:
            self.anomalies.appendleft(jsonable(v))
            self._bump("anomaly")

    def on_explanation(self, v: dict):
        with self.lock:
            self.explanations.appendleft(jsonable(v))
            self._bump("explanation")

    def on_promotion(self, v: dict):
        with self.lock:
            row = jsonable(v)
            if v["status"] == "STARTED":
                self.promos[v["promo_id"]] = row
                self.promo_history[v["promo_id"]] = {
                    k: row[k] for k in ("promo_id", "promo_type", "name", "sku", "region", "discount_pct")
                } | {"start_t": row["event_time"], "end_t": None, "planned_end": row.get("planned_end")}
            else:
                self.promos.pop(v["promo_id"], None)
                if v["promo_id"] in self.promo_history:
                    self.promo_history[v["promo_id"]]["end_t"] = row["event_time"]
            self._bump("promotion")

    def add_agent_rec(self, rec: dict):
        with self.lock:
            self.agent_recs.appendleft(rec)
            self._bump("agent")

    def agent_recommendations(self) -> list:
        with self.lock:
            return list(self.agent_recs)

    # ------------------------------------------------------------- queries

    def _matching(self, sku: str, region: str, channel: str) -> list[tuple]:
        return [k for k in self.points
                if k[0] == sku and region in ("ALL", k[1]) and channel in ("ALL", k[2])]

    def series(self, sku: str, region: str, channel: str) -> dict:
        with self.lock:
            keys = self._matching(sku, region, channel)
            merged: dict[int, dict] = {}
            for k in keys:
                for t, p in self.points[k].items():
                    m = merged.setdefault(t, {"t": t, "actual": 0.0, "pred": None, "lower": None, "upper": None,
                                              "promo": False, "views": 0, "sold_out": 0, "locations": 0})
                    m["actual"] += p["actual"] or 0.0
                    m["promo"] = m["promo"] or p["promo"]
                    m["views"] += p.get("views") or 0
                    m["locations"] += 1
                    m["sold_out"] += 1 if p.get("on_hand") is not None and p["on_hand"] <= 0 else 0
                    for f in ("pred", "lower", "upper"):
                        if p[f] is not None:
                            m[f] = (m[f] or 0.0) + p[f]
            nxt = {"t": None, "forecast": None, "lower": None, "upper": None, "horizon": None}
            for k in keys:
                n = self.next_forecast.get(k)
                if not n or n["forecast"] is None:
                    continue
                nxt["t"] = n["t"]
                for f in ("forecast", "lower", "upper", "horizon"):
                    nxt[f] = (nxt[f] or 0.0) + (n[f] or 0.0)
            pts = [merged[t] for t in sorted(merged)]

        recent = [p for p in pts[-24:] if p["pred"] is not None]
        total_actual = sum(p["actual"] for p in recent)
        wape = sum(abs(p["actual"] - p["pred"]) for p in recent) / total_actual if total_actual else None
        banded = [p for p in recent if p["lower"] is not None and p["upper"] is not None]
        coverage = (sum(1 for p in banded if p["lower"] <= p["actual"] <= p["upper"]) / len(banded)) if banded else None
        return {"points": pts, "next": nxt, "wape": wape, "coverage": coverage, "series_count": len(keys)}

    def snapshot(self, sku: str, region: str, channel: str) -> dict:
        s = self.series(sku, region, channel)
        with self.lock:
            risk = sorted(self.risk.values(), key=lambda r: (RISK_ORDER.get(r.get("risk_level"), 9), r["sku"]))
            return {
                "version": self.version,
                "model": self.model,
                "series": s,
                "risk": risk,
                "anomalies": list(self.anomalies)[:15],
                "explanations": list(self.explanations)[:10],
                "promotions": list(self.promos.values()),
                "promo_periods": [
                    p for p in self.promo_history.values()
                    if p["sku"] == sku and (region == "ALL" or p["region"] in (None, region))
                ],
                "counts": dict(self.counts),
            }
