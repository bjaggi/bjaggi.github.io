-- Sample only. Not deployed by the demo Terraform.
-- Reads stockout_risk, the Flink table behind the inventory.health topic.
-- The Streaming Agent decides. The result is inserted into a different table,
-- ai_recommendations, the Flink table behind the ai.recommendations topic.
--
-- Replace the connection name with a model connection in your environment.
-- Register find_spare_stock and supplier_timing with CREATE FUNCTION before
-- the CREATE TOOL statements. Those functions are the lookups in the
-- architecture page. They are not in this repo.

CREATE CONNECTION `inventory_model_connection`
WITH (
  'type' = 'openai',
  'endpoint' = 'https://api.openai.com/v1/chat/completions',
  'api-key' = '<your-api-key>'
);

CREATE MODEL `inventory_llm`
INPUT (`message` STRING)
OUTPUT (`response` STRING)
WITH (
  'provider' = 'openai',
  'openai.model_version' = 'gpt-4o',
  'openai.connection' = 'inventory_model_connection',
  'task' = 'text_generation'
);

CREATE TOOL `find_spare_stock`
USING FUNCTION `find_spare_stock`
WITH (
  'type' = 'function',
  'description' = 'For one sku and channel, return other regions, their on-hand and forecast, and how many units each can give after keeping its own cover.'
);

CREATE TOOL `supplier_timing`
USING FUNCTION `supplier_timing`
WITH (
  'type' = 'function',
  'description' = 'Return the supplier lead time and the units already on order for one sku, region, and channel.'
);

CREATE AGENT `inventory_agent`
USING MODEL `inventory_llm`
USING PROMPT 'You are the inventory agent for one product, region, and channel. Read the health row in the message. Call find_spare_stock and supplier_timing before you decide. Return one line only: TRANSFER from-region to-region units, or MARKDOWN region discount, or ESCALATE. Use TRANSFER when another region can spare units after keeping its own cover. The unit count is the smaller of what this location needs and what the donor can spare. Use ESCALATE when no region can spare stock and a supplier order would arrive after the stock-out. Use MARKDOWN when this location is overstocked and no other region is short. Do not invent a transfer. Do not move stock.'
USING TOOLS `find_spare_stock`, `supplier_timing`
COMMENT 'Reads one inventory health row and returns one stock decision.'
WITH (
  'max_iterations' = '5'
);

CREATE TABLE `ai_recommendations` (
  `sku` STRING,
  `region` STRING,
  `channel` STRING,
  `window_time` TIMESTAMP(3),
  `decision` STRING
) DISTRIBUTED BY (`sku`, `region`, `channel`) INTO 3 BUCKETS
WITH (
  'changelog.mode' = 'append',
  'value.fields-include' = 'all'
);

-- Healthy rows do not wake the model. The decision is written to
-- ai_recommendations, not back onto stockout_risk.
INSERT INTO `ai_recommendations`
SELECT
  h.sku,
  h.region,
  h.channel,
  h.window_time,
  agent.response AS decision
FROM `stockout_risk` AS h,
LATERAL TABLE(
  AI_RUN_AGENT(
    'inventory_agent',
    CONCAT(
      'sku=', h.sku,
      ', region=', h.region,
      ', channel=', h.channel,
      ', on_hand=', CAST(h.on_hand AS STRING),
      ', on_order=', CAST(h.on_order AS STRING),
      ', forecast_next=', CAST(h.forecast_next AS STRING),
      ', periods_of_cover=', CAST(h.periods_of_cover AS STRING),
      ', risk=', h.risk_level,
      ', promo_active=', CAST(h.promo_active AS STRING)
    ),
    CONCAT(h.sku, '|', h.region, '|', h.channel)
  )
) AS agent
WHERE h.risk_level IN ('OUT_OF_STOCK', 'HIGH', 'MEDIUM', 'OVERSTOCK');
