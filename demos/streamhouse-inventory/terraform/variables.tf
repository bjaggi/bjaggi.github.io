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
  description = "Prefix used for the environment, cluster, service accounts and keys. Use a customer short name to re-skin, e.g. 'acme-demand'."
  type        = string
  default     = "demand-forecast-demo"
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
  description = "Materialize the demand and forecast topics as Iceberg tables with Tableflow (Confluent-managed storage)."
  type        = bool
  default     = true
}
