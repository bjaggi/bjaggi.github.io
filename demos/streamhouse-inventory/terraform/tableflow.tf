locals {
  # Topics created by the Flink pipeline that are materialized as Iceberg tables.
  tableflow_topics = var.enable_tableflow && var.deploy_flink_statements ? toset([
    "demand_windowed",
    "demand_forecast",
    "stockout_risk",
  ]) : toset([])

  tableflow_catalog_uri = "https://tableflow.${var.region}.${lower(var.cloud)}.confluent.cloud/iceberg/catalog/organizations/${data.confluent_organization.main.id}/environments/${local.environment_id}"
}

resource "confluent_tableflow_topic" "derived" {
  for_each = local.tableflow_topics

  environment {
    id = local.environment_id
  }
  kafka_cluster {
    id = confluent_kafka_cluster.main.id
  }
  display_name  = each.key
  table_formats = ["ICEBERG"]

  managed_storage {}

  credentials {
    key    = confluent_api_key.tableflow.id
    secret = confluent_api_key.tableflow.secret
  }

  # The topics are created by the CTAS statements, so Tableflow can only be
  # enabled after those statements are running.
  depends_on = [
    confluent_flink_statement.demand_windowed,
    confluent_flink_statement.demand_forecast,
    confluent_flink_statement.stockout_risk,
  ]
}
