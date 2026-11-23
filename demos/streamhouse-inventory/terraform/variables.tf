variable "confluent_cloud_api_key" {
  description = "Confluent Cloud API key (Cloud resource management, OrganizationAdmin). Can also be set via TF_VAR_confluent_cloud_api_key."
  type        = string
  sensitive   = true
}

variable "confluent_cloud_api_secret" {
  description = "Confluent Cloud API secret."
  type        = string
  sensitive   = true
}

variable "prefix" {
  description = "Prefix used for a new environment, the cluster, service accounts and keys. Ignored as an environment name when environment_id is set."
  type        = string
  default     = "streamhouse-inventory"
}

variable "environment_id" {
  description = "Existing Confluent Cloud environment to deploy the demo into. Leave empty to create a new environment named from prefix. An existing environment must already have Stream Governance Advanced, because the mock producer enforces schema rules."
  type        = string
  default     = ""
}

variable "cloud" {
  description = "Cloud provider for Kafka, Flink and Tableflow."
  type        = string
  default     = "AWS"
}

variable "region" {
  description = "Cloud region for Kafka, Flink and Tableflow."
  type        = string
  default     = "us-east-1"
}

variable "stream_governance_package" {
  description = "ADVANCED is required for data contract rules and tags."
  type        = string
  default     = "ADVANCED"
}

variable "topic_partitions" {
  description = "Partitions for source topics. Kept small so event-time watermarks advance quickly in a demo."
  type        = number
  default     = 3
}

variable "flink_max_cfu" {
  description = "Max CFUs for the Flink compute pool."
  type        = number
  default     = 10
}

variable "deploy_flink_statements" {
  description = "Deploy the Flink SQL pipeline from ../flink. Set to false if you want to paste the SQL live in the Flink workspace instead."
  type        = bool
  default     = true
}

variable "enable_ai_forecast" {
  description = "Also deploy the AI_FORECAST (IBM Granite TTM, Early Access) variant. Requires the org to be enrolled in the AI_FORECAST Early Access Program."
  type        = bool
  default     = false
}

variable "enable_tableflow" {
  description = "Materialize demand_windowed, demand_forecast, and stockout_risk as Iceberg tables. Leave false for the first apply. Turn it on after `make gen` has been running and those Flink tables exist."
  type        = bool
  default     = false
}
