-- Rolling demand forecast per SKU / region / channel with confidence bounds,
-- using the built-in ARIMA-based ML_FORECAST function. Every closed window
-- re-forecasts the next 6 periods (6 simulated hours).
CREATE TABLE `demand_forecast` (
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
  GREATEST(fc[1].forecast_value, 0.0)                                   AS forecast_next,
  GREATEST(fc[1].lower_bound, 0.0)                                      AS lower_next,
  GREATEST(fc[1].upper_bound, 0.0)                                      AS upper_next,
  GREATEST(COALESCE(fc[1].forecast_value, 0.0), 0.0)
    + GREATEST(COALESCE(fc[2].forecast_value, 0.0), 0.0)
    + GREATEST(COALESCE(fc[3].forecast_value, 0.0), 0.0)
    + GREATEST(COALESCE(fc[4].forecast_value, 0.0), 0.0)
    + GREATEST(COALESCE(fc[5].forecast_value, 0.0), 0.0)
    + GREATEST(COALESCE(fc[6].forecast_value, 0.0), 0.0)                AS forecast_horizon,
  GREATEST(COALESCE(fc[1].upper_bound, 0.0), 0.0)
    + GREATEST(COALESCE(fc[2].upper_bound, 0.0), 0.0)
    + GREATEST(COALESCE(fc[3].upper_bound, 0.0), 0.0)
    + GREATEST(COALESCE(fc[4].upper_bound, 0.0), 0.0)
    + GREATEST(COALESCE(fc[5].upper_bound, 0.0), 0.0)
    + GREATEST(COALESCE(fc[6].upper_bound, 0.0), 0.0)                   AS upper_horizon,
  fc[1].rmse                                                            AS rmse,
  typical_rate,
  CAST('ML_FORECAST (ARIMA)' AS STRING)                                 AS model
FROM (
  SELECT
    *,
    ML_FORECAST(
      units_sold,
      CAST(window_time AS TIMESTAMP(3)),
      JSON_OBJECT(
        'horizon'         VALUE 6,
        'minTrainingSize' VALUE 16,
        'maxTrainingSize' VALUE 256,
        'enableStl'       VALUE false
      )
    ) OVER (
      PARTITION BY sku, region, channel
      ORDER BY window_time
      RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) AS fc
  FROM (
    -- Average sales per period over the last simulated day: the overstock check uses
    -- this so quiet night hours don't make every location look overstocked.
    SELECT
      *,
      AVG(CAST(units_sold AS DOUBLE)) OVER (
        PARTITION BY sku, region, channel
        ORDER BY window_time
        ROWS BETWEEN 23 PRECEDING AND CURRENT ROW
      ) AS typical_rate
    FROM `demand_windowed`
  )
);
