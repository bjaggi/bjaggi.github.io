data "confluent_organization" "main" {}

resource "confluent_environment" "demo" {
  display_name = var.prefix

  stream_governance {
    package = var.stream_governance_package
  }
}

resource "confluent_kafka_cluster" "main" {
  display_name = "${var.prefix}-cluster"
  availability = "SINGLE_ZONE"
  cloud        = var.cloud
  region       = var.region
  standard {}

  environment {
    id = confluent_environment.demo.id
  }
}

data "confluent_schema_registry_cluster" "main" {
  environment {
    id = confluent_environment.demo.id
  }

  depends_on = [confluent_kafka_cluster.main]
}

# ---------------------------------------------------------------------------
# Service accounts
#   app-manager       : owns all API keys used by Terraform, the data generator,
#                       the dashboard and the explainer.
#   statements-runner : principal that the Flink statements run as.
# ---------------------------------------------------------------------------

resource "confluent_service_account" "app_manager" {
  display_name = "${var.prefix}-app-manager"
  description  = "Manages the demand forecasting demo environment"
}

resource "confluent_service_account" "statements_runner" {
  display_name = "${var.prefix}-statements-runner"
  description  = "Runs the demand forecasting Flink statements"
}

resource "confluent_role_binding" "app_manager_env_admin" {
  principal   = "User:${confluent_service_account.app_manager.id}"
  role_name   = "EnvironmentAdmin"
  crn_pattern = confluent_environment.demo.resource_name
}

resource "confluent_role_binding" "statements_runner_env_admin" {
  principal   = "User:${confluent_service_account.statements_runner.id}"
  role_name   = "EnvironmentAdmin"
  crn_pattern = confluent_environment.demo.resource_name
}

resource "confluent_role_binding" "app_manager_assigner" {
  principal   = "User:${confluent_service_account.app_manager.id}"
  role_name   = "Assigner"
  crn_pattern = "${data.confluent_organization.main.resource_name}/service-account=${confluent_service_account.statements_runner.id}"
}

# ---------------------------------------------------------------------------
# API keys
# ---------------------------------------------------------------------------

resource "confluent_api_key" "kafka" {
  display_name = "${var.prefix}-kafka-key"
  description  = "Kafka API key owned by app-manager"

  owner {
    id          = confluent_service_account.app_manager.id
    api_version = confluent_service_account.app_manager.api_version
    kind        = confluent_service_account.app_manager.kind
  }

  managed_resource {
    id          = confluent_kafka_cluster.main.id
    api_version = confluent_kafka_cluster.main.api_version
    kind        = confluent_kafka_cluster.main.kind

    environment {
      id = confluent_environment.demo.id
    }
  }

  depends_on = [confluent_role_binding.app_manager_env_admin]
}

resource "confluent_api_key" "schema_registry" {
  display_name = "${var.prefix}-sr-key"
  description  = "Schema Registry API key owned by app-manager"

  owner {
    id          = confluent_service_account.app_manager.id
    api_version = confluent_service_account.app_manager.api_version
    kind        = confluent_service_account.app_manager.kind
  }

  managed_resource {
    id          = data.confluent_schema_registry_cluster.main.id
    api_version = data.confluent_schema_registry_cluster.main.api_version
    kind        = data.confluent_schema_registry_cluster.main.kind

    environment {
      id = confluent_environment.demo.id
    }
  }

  depends_on = [confluent_role_binding.app_manager_env_admin]
}

data "confluent_flink_region" "main" {
  cloud  = var.cloud
  region = var.region
}

resource "confluent_api_key" "flink" {
  display_name = "${var.prefix}-flink-key"
  description  = "Flink API key owned by app-manager"

  owner {
    id          = confluent_service_account.app_manager.id
    api_version = confluent_service_account.app_manager.api_version
    kind        = confluent_service_account.app_manager.kind
  }

  managed_resource {
    id          = data.confluent_flink_region.main.id
    api_version = data.confluent_flink_region.main.api_version
    kind        = data.confluent_flink_region.main.kind

    environment {
      id = confluent_environment.demo.id
    }
  }

  depends_on = [
    confluent_role_binding.app_manager_env_admin,
    confluent_role_binding.app_manager_assigner,
  ]
}

resource "confluent_api_key" "tableflow" {
  display_name = "${var.prefix}-tableflow-key"
  description  = "Tableflow API key owned by app-manager (also used as Iceberg REST catalog credentials)"

  owner {
    id          = confluent_service_account.app_manager.id
    api_version = confluent_service_account.app_manager.api_version
    kind        = confluent_service_account.app_manager.kind
  }

  managed_resource {
    id          = "tableflow"
    api_version = "tableflow/v1"
    kind        = "Tableflow"

    environment {
      id = confluent_environment.demo.id
    }
  }

  depends_on = [confluent_role_binding.app_manager_env_admin]
}

resource "confluent_flink_compute_pool" "main" {
  display_name = "${var.prefix}-pool"
  cloud        = var.cloud
  region       = var.region
  max_cfu      = var.flink_max_cfu

  environment {
    id = confluent_environment.demo.id
  }

  depends_on = [
    confluent_role_binding.statements_runner_env_admin,
    confluent_role_binding.app_manager_assigner,
    confluent_api_key.flink,
  ]
}
