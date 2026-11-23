-- Optional, for live discussion only (not deployed by Terraform).
-- Hopping window variant: a rolling "last 6 periods" demand view that slides
-- every period, useful for smoothing noisy SKUs before forecasting.
SELECT
  sku,
  region,
  channel,
  window_start,
  window_end,
  SUM(units_sold)                                   AS units_last_6_periods,
  SUM(`views`)                                      AS views_last_6_periods,
  CAST(SUM(units_sold) AS DOUBLE) / NULLIF(SUM(`views`), 0) AS view_to_unit_conversion
FROM HOP(TABLE `demand_signals`, DESCRIPTOR(event_time), INTERVAL '10' SECOND, INTERVAL '60' SECOND)
GROUP BY sku, region, channel, window_start, window_end;
