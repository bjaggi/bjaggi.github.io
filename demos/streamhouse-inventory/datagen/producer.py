"""Avro producer that enforces the Schema Registry data contracts (CEL rules)
attached to each topic's latest schema version."""

from __future__ import annotations

import logging
import threading
from collections import Counter

from confluent_kafka import Producer
from confluent_kafka.schema_registry import SchemaRegistryClient, topic_subject_name_strategy
from confluent_kafka.schema_registry.avro import AvroSerializer
from confluent_kafka.schema_registry.rules.cel.cel_executor import CelExecutor
from confluent_kafka.serialization import MessageField, SerializationContext, SerializationError

from common.config import ROOT, kafka_conf, schema_registry_conf

from .simulator import Event

log = logging.getLogger("datagen.producer")

SOURCE_TOPICS = ("clickstream", "cart_events", "orders", "pos_sales", "inventory_updates", "promotions")


class DemoProducer:
    def __init__(self, topics=SOURCE_TOPICS):
        CelExecutor.register()
        self.sr = SchemaRegistryClient(schema_registry_conf())
        self.serializers = {
            topic: AvroSerializer(
                self.sr,
                (ROOT / "schemas" / f"{topic}.avsc").read_text(),
                conf={
                    "auto.register.schemas": False,
                    "use.latest.version": True,
                    "subject.name.strategy": topic_subject_name_strategy,
                },
            )
            for topic in topics
        }
        self.producer = Producer(kafka_conf(**{
            "linger.ms": 50,
            "compression.type": "lz4",
            "client.id": "demand-demo-datagen",
        }))
        self.sent = Counter()
        self.rejected = Counter()
        self.delivery_errors = 0
        self._lock = threading.Lock()

    def _on_delivery(self, err, msg):
        if err is not None:
            with self._lock:
                self.delivery_errors += 1
            log.error("Delivery failed for %s: %s", msg.topic(), err)

    def produce(self, event: Event) -> str | None:
        """Serialize and produce one event. Returns an error message if the data contract rejected it."""
        try:
            value = self.serializers[event.topic](
                event.value, SerializationContext(event.topic, MessageField.VALUE)
            )
        except SerializationError as e:
            with self._lock:
                self.rejected[event.topic] += 1
            detail = f"{event.topic}-value data contract violated ({type(e).__name__}{': ' + str(e) if str(e) else ''})"
            log.warning("Rejected record: %s", detail)
            return detail

        while True:
            try:
                self.producer.produce(
                    event.topic,
                    key=event.key.encode(),
                    value=value,
                    timestamp=event.ts_ms,
                    on_delivery=self._on_delivery,
                )
                break
            except BufferError:
                self.producer.poll(0.1)
        self.producer.poll(0)
        with self._lock:
            self.sent[event.topic] += 1
        return None

    def flush(self, timeout: float = 30.0):
        self.producer.flush(timeout)

    def stats(self) -> dict:
        with self._lock:
            return {
                "sent": dict(self.sent),
                "rejected_by_data_contract": dict(self.rejected),
                "delivery_errors": self.delivery_errors,
            }
