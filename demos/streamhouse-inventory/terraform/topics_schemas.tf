locals {
  # Source topics written by the data generator / explainer, with their Avro
  # schema and data contract (CEL) rules enforced by the producer on write.
  topics = {
    clickstream = {
      schema = "clickstream.avsc"
      rules = [
        { name = "validAction", expr = "message.action in ['VIEW', 'SEARCH', 'WISHLIST']" },
      ]
    }
    cart_events = {
      schema = "cart_events.avsc"
      rules = [
        { name = "unitsPositive", expr = "message.units > 0" },
      ]
    }
    orders = {
      schema = "orders.avsc"
      rules = [
        { name = "unitsPositive", expr = "message.units > 0" },
        { name = "pricePositive", expr = "message.unit_price > 0.0" },
        { name = "discountRange", expr = "message.discount_pct >= 0.0 && message.discount_pct < 1.0" },
      ]
    }
    pos_sales = {
      schema = "pos_sales.avsc"
      rules = [
        { name = "unitsPositive", expr = "message.units > 0" },
        { name = "pricePositive", expr = "message.unit_price > 0.0" },
        { name = "discountRange", expr = "message.discount_pct >= 0.0 && message.discount_pct < 1.0" },
      ]
    }
    inventory_updates = {
      schema = "inventory_updates.avsc"
      rules = [
        { name = "onHandNonNegative", expr = "message.on_hand >= 0" },
      ]
    }
    promotions = {
      schema = "promotions.avsc"
      rules = [
        { name = "discountRange", expr = "message.discount_pct >= 0.0 && message.discount_pct < 1.0" },
      ]
    }
    forecast_explanations = {
      schema = "forecast_explanations.avsc"
      rules  = []
    }
  }
}

resource "confluent_kafka_topic" "source" {
  for_each = local.topics

  kafka_cluster {
    id = confluent_kafka_cluster.main.id
  }
  topic_name       = each.key
  partitions_count = var.topic_partitions
  rest_endpoint    = confluent_kafka_cluster.main.rest_endpoint

  config = {
    "retention.ms" = "604800000"
  }

  credentials {
    key    = confluent_api_key.kafka.id
    secret = confluent_api_key.kafka.secret
  }
}

resource "confluent_schema" "source" {
  for_each = local.topics

  schema_registry_cluster {
    id = data.confluent_schema_registry_cluster.main.id
  }
  rest_endpoint = data.confluent_schema_registry_cluster.main.rest_endpoint
  subject_name  = "${each.key}-value"
  format        = "AVRO"
  schema        = file("${path.module}/../schemas/${each.value.schema}")

  dynamic "ruleset" {
    for_each = length(each.value.rules) > 0 ? [1] : []
    content {
      dynamic "domain_rules" {
        for_each = each.value.rules
        content {
          name       = domain_rules.value.name
          kind       = "CONDITION"
          type       = "CEL"
          mode       = "WRITE"
          expr       = domain_rules.value.expr
          on_failure = "ERROR"
        }
      }
    }
  }

  credentials {
    key    = confluent_api_key.schema_registry.id
    secret = confluent_api_key.schema_registry.secret
  }

  depends_on = [confluent_kafka_topic.source]
}
