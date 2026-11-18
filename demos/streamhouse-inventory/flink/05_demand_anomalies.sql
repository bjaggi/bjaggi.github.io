-- Flag demand that breaks out of the expected range (launch hype, promo lift,
-- stockout-driven drops) with the built-in ML_DETECT_ANOMALIES function.
-- These rows feed the watsonx Granite explainer service.
CREATE TABLE `demand_anomalies` (
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
  window_time,
  units_sold,
  views,
  cart_adds,
  promo_active,
  promo_discount_pct,
  anomaly.forecast_value                                              AS expected_units,
  anomaly.lower_bound                                                 AS lower_bound,
  anomaly.upper_bound                                                 AS upper_bound,
  CASE WHEN units_sold > anomaly.upper_bound THEN 'SPIKE' ELSE 'DROP' END AS direction
FROM (
  SELECT
    *,
    ML_DETECT_ANOMALIES(
      units_sold,
      CAST(window_time AS TIMESTAMP(3)),
      JSON_OBJECT(
        'minTrainingSize'      VALUE 16,
        'maxTrainingSize'      VALUE 256,
        'enableStl'            VALUE false,
        'confidencePercentage' VALUE 99.0
      )
    ) OVER (
      PARTITION BY sku, region, channel
      ORDER BY window_time
      RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) AS anomaly
  FROM `demand_windowed`
)
WHERE anomaly.is_anomaly = TRUE;
