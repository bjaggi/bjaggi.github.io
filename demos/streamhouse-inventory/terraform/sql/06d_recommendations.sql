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
)
