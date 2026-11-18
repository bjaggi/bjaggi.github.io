-- Latest inventory position per SKU / region / channel as a versioned (upsert)
-- table, so forecasts can be joined to the stock level as of their window time.
CREATE TABLE `inventory_latest` (
  PRIMARY KEY (sku, region, channel) NOT ENFORCED,
  WATERMARK FOR `event_time` AS `event_time` - INTERVAL '5' SECOND
)
DISTRIBUTED BY (sku, region, channel) INTO 3 BUCKETS
WITH (
  'changelog.mode' = 'upsert',
  'value.fields-include' = 'all'
)
AS
SELECT
  sku,
  region,
  channel,
  on_hand,
  on_order,
  reason,
  event_time
FROM `inventory_updates`;
