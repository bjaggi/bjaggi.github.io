-- Compare forecast demand with the inventory position at the same point in
-- time (event-time temporal join) to flag stockout and overstock risk.
CREATE TABLE `stockout_risk` (
  WATERMARK FOR `window_time` AS `window_time` - INTERVAL '1' SECOND
)
DISTRIBUTED BY (sku, region, channel) INTO 3 BUCKETS
WITH (
  'value.fields-include' = 'all'
)
AS
SELECT
  f.sku,
  f.region,
  f.channel,
  f.window_time,
  f.units_sold,
  f.forecast_next,
  f.forecast_horizon,
  f.upper_horizon,
  f.typical_rate,
  f.promo_active,
  i.on_hand,
  i.on_order,
  CASE
    WHEN f.forecast_next IS NULL OR f.forecast_next <= 0 THEN CAST(NULL AS DOUBLE)
    ELSE ROUND(CAST(i.on_hand AS DOUBLE) / f.forecast_next, 1)
  END AS periods_of_cover,
  CASE
    WHEN i.on_hand <= 0                                         THEN 'OUT_OF_STOCK'
    WHEN f.forecast_next IS NULL                                THEN 'WARMING_UP'
    WHEN i.on_hand < f.forecast_horizon                         THEN 'HIGH'
    WHEN i.on_hand < f.upper_horizon                            THEN 'MEDIUM'
    WHEN CAST(i.on_hand AS DOUBLE)
         / GREATEST(f.typical_rate, f.forecast_next, 0.5) > 120 THEN 'OVERSTOCK'
    ELSE 'LOW'
  END AS risk_level,
  GREATEST(CAST(CEIL(f.upper_horizon) AS INT) - i.on_hand - i.on_order, 0) AS suggested_replenishment_units
FROM `demand_forecast` AS f
JOIN `inventory_latest` FOR SYSTEM_TIME AS OF f.window_time AS i
  ON f.sku = i.sku
 AND f.region = i.region
 AND f.channel = i.channel;
