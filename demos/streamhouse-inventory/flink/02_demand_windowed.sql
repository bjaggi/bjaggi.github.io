-- Demand per SKU / region / channel per period. One period = 10 seconds of
-- wall-clock time = one simulated hour (keep in sync with period.seconds in the
-- datagen profile).
CREATE TABLE `demand_windowed` (
  WATERMARK FOR `window_time` AS `window_time` - INTERVAL '1' SECOND
)
DISTRIBUTED BY (sku, region, channel) INTO 3 BUCKETS
WITH (
  'value.fields-include' = 'all'
)
AS
SELECT
  sku,
  region,
  channel,
  window_start,
  window_end,
  window_time,
  CAST(SUM(units_sold) AS DOUBLE)              AS units_sold,
  ROUND(SUM(revenue), 2)                       AS revenue,
  CAST(SUM(`views`) AS BIGINT)                 AS `views`,
  CAST(SUM(cart_adds) AS BIGINT)               AS cart_adds,
  MAX(discount_pct)                            AS promo_discount_pct,
  MAX(discount_pct) > 0                        AS promo_active
FROM TUMBLE(TABLE `demand_signals`, DESCRIPTOR(event_time), INTERVAL '10' SECOND)
GROUP BY sku, region, channel, window_start, window_end, window_time;
