locals {
  flink_dir = "${path.module}/../flink"

  flink_properties = {
    "sql.current-catalog"  = local.environment_display_name
    "sql.current-database" = confluent_kafka_cluster.main.display_name
    "sql.local-time-zone"  = "UTC"
  }

  watermark_statements = {
    for idx, stmt in split(";", file("${local.flink_dir}/00_source_watermarks.sql")) :
    tostring(idx) => "${trimspace(stmt)};" if length(trimspace(stmt)) > 0
  }
}

resource "confluent_flink_statement" "watermarks" {
  for_each = var.deploy_flink_statements ? local.watermark_statements : {}

  organization {
    id = data.confluent_organization.main.id
  }
  environment {
    id = local.environment_id
  }
  compute_pool {
    id = confluent_flink_compute_pool.main.id
  }
  principal {
    id = confluent_service_account.statements_runner.id
  }
  statement     = each.value
  properties    = local.flink_properties
  stopped       = false
  rest_endpoint = data.confluent_flink_region.main.rest_endpoint
  credentials {
    key    = confluent_api_key.flink.id
    secret = confluent_api_key.flink.secret
  }

  depends_on = [confluent_schema.source]
}

resource "confluent_flink_statement" "demand_signals" {
  count = var.deploy_flink_statements ? 1 : 0

  organization {
    id = data.confluent_organization.main.id
  }
  environment {
    id = local.environment_id
  }
  compute_pool {
    id = confluent_flink_compute_pool.main.id
  }
  principal {
    id = confluent_service_account.statements_runner.id
  }
  statement     = file("${local.flink_dir}/01_demand_signals.sql")
  properties    = local.flink_properties
  stopped       = false
  rest_endpoint = data.confluent_flink_region.main.rest_endpoint
  credentials {
    key    = confluent_api_key.flink.id
    secret = confluent_api_key.flink.secret
  }

  depends_on = [confluent_flink_statement.watermarks]
}

resource "confluent_flink_statement" "demand_windowed" {
  count = var.deploy_flink_statements ? 1 : 0

  organization {
    id = data.confluent_organization.main.id
  }
  environment {
    id = local.environment_id
  }
  compute_pool {
    id = confluent_flink_compute_pool.main.id
  }
  principal {
    id = confluent_service_account.statements_runner.id
  }
  statement     = file("${local.flink_dir}/02_demand_windowed.sql")
  properties    = local.flink_properties
  stopped       = false
  rest_endpoint = data.confluent_flink_region.main.rest_endpoint
  credentials {
    key    = confluent_api_key.flink.id
    secret = confluent_api_key.flink.secret
  }

  depends_on = [confluent_flink_statement.demand_signals]
}

resource "confluent_flink_statement" "demand_forecast" {
  count = var.deploy_flink_statements ? 1 : 0

  organization {
    id = data.confluent_organization.main.id
  }
  environment {
    id = local.environment_id
  }
  compute_pool {
    id = confluent_flink_compute_pool.main.id
  }
  principal {
    id = confluent_service_account.statements_runner.id
  }
  statement     = file("${local.flink_dir}/03_demand_forecast.sql")
  properties    = local.flink_properties
  stopped       = false
  rest_endpoint = data.confluent_flink_region.main.rest_endpoint
  credentials {
    key    = confluent_api_key.flink.id
    secret = confluent_api_key.flink.secret
  }

  depends_on = [confluent_flink_statement.demand_windowed]
}

resource "confluent_flink_statement" "demand_forecast_ai" {
  count = var.deploy_flink_statements && var.enable_ai_forecast ? 1 : 0

  organization {
    id = data.confluent_organization.main.id
  }
  environment {
    id = local.environment_id
  }
  compute_pool {
    id = confluent_flink_compute_pool.main.id
  }
  principal {
    id = confluent_service_account.statements_runner.id
  }
  statement     = file("${local.flink_dir}/03b_demand_forecast_ai.sql")
  properties    = local.flink_properties
  stopped       = false
  rest_endpoint = data.confluent_flink_region.main.rest_endpoint
  credentials {
    key    = confluent_api_key.flink.id
    secret = confluent_api_key.flink.secret
  }

  depends_on = [confluent_flink_statement.demand_windowed]
}

resource "confluent_flink_statement" "inventory_latest" {
  count = var.deploy_flink_statements ? 1 : 0

  organization {
    id = data.confluent_organization.main.id
  }
  environment {
    id = local.environment_id
  }
  compute_pool {
    id = confluent_flink_compute_pool.main.id
  }
  principal {
    id = confluent_service_account.statements_runner.id
  }
  statement     = file("${local.flink_dir}/04a_inventory_latest.sql")
  properties    = local.flink_properties
  stopped       = false
  rest_endpoint = data.confluent_flink_region.main.rest_endpoint
  credentials {
    key    = confluent_api_key.flink.id
    secret = confluent_api_key.flink.secret
  }

  depends_on = [confluent_flink_statement.watermarks]
}

resource "confluent_flink_statement" "stockout_risk" {
  count = var.deploy_flink_statements ? 1 : 0

  organization {
    id = data.confluent_organization.main.id
  }
  environment {
    id = local.environment_id
  }
  compute_pool {
    id = confluent_flink_compute_pool.main.id
  }
  principal {
    id = confluent_service_account.statements_runner.id
  }
  statement     = file("${local.flink_dir}/04b_stockout_risk.sql")
  properties    = local.flink_properties
  stopped       = false
  rest_endpoint = data.confluent_flink_region.main.rest_endpoint
  credentials {
    key    = confluent_api_key.flink.id
    secret = confluent_api_key.flink.secret
  }

  depends_on = [
    confluent_flink_statement.demand_forecast,
    confluent_flink_statement.inventory_latest,
  ]
}

resource "confluent_flink_statement" "demand_anomalies" {
  count = var.deploy_flink_statements ? 1 : 0

  organization {
    id = data.confluent_organization.main.id
  }
  environment {
    id = local.environment_id
  }
  compute_pool {
    id = confluent_flink_compute_pool.main.id
  }
  principal {
    id = confluent_service_account.statements_runner.id
  }
  statement     = file("${local.flink_dir}/05_demand_anomalies.sql")
  properties    = local.flink_properties
  stopped       = false
  rest_endpoint = data.confluent_flink_region.main.rest_endpoint
  credentials {
    key    = confluent_api_key.flink.id
    secret = confluent_api_key.flink.secret
  }

  depends_on = [confluent_flink_statement.demand_windowed]
}
