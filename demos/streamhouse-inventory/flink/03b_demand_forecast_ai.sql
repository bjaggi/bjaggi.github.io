-- Optional (Early Access): same forecast using AI_FORECAST, a time-series
-- foundation model hosted by Confluent (IBM Granite TTM by default; TimesFM 2.5,
-- FlowState and PatchTST-FM are also available). Output columns match
-- demand_forecast, so the dashboard can switch with FORECAST_TOPIC=demand_forecast_ai.
CREATE TABLE `demand_forecast_ai` (
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
  units_sold,
  revenue,
  `views`,
  cart_adds,
  promo_active,
  promo_discount_pct,
  GREATEST(r.forecast[1].mean, 0.0)                                     AS forecast_next,
  GREATEST(r.forecast[1].q10, 0.0)                                      AS lower_next,
  GREATEST(r.forecast[1].q90, 0.0)                                      AS upper_next,
  GREATEST(COALESCE(r.forecast[1].mean, 0.0), 0.0)
    + GREATEST(COALESCE(r.forecast[2].mean, 0.0), 0.0)
    + GREATEST(COALESCE(r.forecast[3].mean, 0.0), 0.0)
    + GREATEST(COALESCE(r.forecast[4].mean, 0.0), 0.0)
    + GREATEST(COALESCE(r.forecast[5].mean, 0.0), 0.0)
    + GREATEST(COALESCE(r.forecast[6].mean, 0.0), 0.0)                  AS forecast_horizon,
  GREATEST(COALESCE(r.forecast[1].q90, 0.0), 0.0)
    + GREATEST(COALESCE(r.forecast[2].q90, 0.0), 0.0)
    + GREATEST(COALESCE(r.forecast[3].q90, 0.0), 0.0)
    + GREATEST(COALESCE(r.forecast[4].q90, 0.0), 0.0)
    + GREATEST(COALESCE(r.forecast[5].q90, 0.0), 0.0)
    + GREATEST(COALESCE(r.forecast[6].q90, 0.0), 0.0)                   AS upper_horizon,
  CAST(NULL AS DOUBLE)                                                  AS rmse,
  CAST('AI_FORECAST (IBM Granite TTM)' AS STRING)                       AS model
FROM (
  SELECT
    *,
    AI_FORECAST(
      units_sold,
      CAST(window_time AS TIMESTAMP(3)),
      JSON_OBJECT(
        'model'          VALUE 'ttm',
        'horizon'        VALUE 6,
        'minContextSize' VALUE 24,
        'maxContextSize' VALUE 512
      )
    ) OVER (
      PARTITION BY sku, region, channel
      ORDER BY window_time
      RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) AS r
  FROM `demand_windowed`
);
