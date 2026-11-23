CREATE MODEL `inventory_llm`
INPUT (`prompt` STRING)
OUTPUT (`response` STRING)
WITH (
  'provider' = 'confluent',
  'task' = 'text_generation',
  'confluent.model' = 'MANAGED_MODEL_NAME'
)
