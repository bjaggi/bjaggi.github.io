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
      ', suggested_units=', CAST(h.suggested_replenishment_units AS STRING)
    ),
    CONCAT(h.sku, '|', h.region, '|', h.channel)
  )
) AS agent
WHERE h.risk_level IN ('OUT_OF_STOCK', 'HIGH', 'OVERSTOCK')
