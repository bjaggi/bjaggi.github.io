"""Run the demand data generator.

    python -m datagen.main --profile apparel_drops
    python -m datagen.main --profile grocery --backfill 96
    python -m datagen.main --dry-run          # no Kafka, print per-period summary
"""

from __future__ import annotations

import argparse
import logging
import threading
import time
from collections import Counter

import uvicorn

from common.config import load_profile, profile_name

from .simulator import Simulator

log = logging.getLogger("datagen")


class DryRunProducer:
    def __init__(self):
        self.sent = Counter()

    def produce(self, event):
        self.sent[event.topic] += 1
        return None

    def flush(self, timeout=0):
        pass

    def stats(self):
        return {"sent": dict(self.sent), "rejected_by_data_contract": {}, "delivery_errors": 0}


def now_ms() -> int:
    return int(time.time() * 1000)


def start_control_api(sim, producer, port: int):
    from .control_api import create_app

    server = uvicorn.Server(uvicorn.Config(create_app(sim, producer), host="0.0.0.0", port=port, log_level="warning"))
    threading.Thread(target=server.run, daemon=True, name="control-api").start()
    log.info("Control API listening on http://localhost:%d (POST /launch, /promo, /restock, /bad-record)", port)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--profile", default=profile_name(), help="Profile in datagen/profiles (default: $PROFILE or apparel_drops)")
    parser.add_argument("--backfill", type=int, default=72,
                        help="Periods of history to emit at startup so forecasts are warm (default 72 = 3 simulated days)")
    parser.add_argument("--api-port", type=int, default=8001)
    parser.add_argument("--seed", type=int, default=None)
    parser.add_argument("--dry-run", action="store_true", help="Do not connect to Kafka")
    parser.add_argument("--periods", type=int, default=0, help="Stop after N live periods (0 = run forever)")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    profile = load_profile(args.profile)
    sim = Simulator(profile, seed=args.seed)

    if args.dry_run:
        producer = DryRunProducer()
    else:
        from .producer import DemoProducer

        producer = DemoProducer()

    start_control_api(sim, producer, args.api_port)

    period_ms = sim.period_ms
    current = now_ms() - now_ms() % period_ms

    if args.backfill > 0:
        log.info("Backfilling %d periods of history for profile '%s'...", args.backfill, profile["id"])
        for i in range(args.backfill, 0, -1):
            for ev in sim.generate_period(current - i * period_ms):
                producer.produce(ev)
            if i % 12 == 0:
                producer.flush()
                log.info("  backfill: %d periods left (%s)", i, sim.last_period_summary)
        producer.flush()
        log.info("Backfill complete. Streaming live (1 period = %ds = 1 simulated %s).",
                 profile["period"]["seconds"], profile["period"].get("label", "hour"))

    live = 0
    while True:
        events = sim.generate_period(current)
        for ev in events:
            while ev.ts_ms > now_ms():
                time.sleep(min((ev.ts_ms - now_ms()) / 1000.0, 0.5))
            producer.produce(ev)
        producer.flush(5)
        s = sim.last_period_summary
        log.info("period hour=%02d units_sold=%d lost_sales=%d events=%d | promos=%d launches=%d | %s",
                 s["simulated_hour"], s["units_sold"], s["lost_sales_units"], s["events"],
                 len(sim.promos), len(sim.launches), producer.stats()["rejected_by_data_contract"] or "")
        current += period_ms
        live += 1
        if args.periods and live >= args.periods:
            break


if __name__ == "__main__":
    main()
