-- Unify e-commerce orders, store POS, clickstream and cart events into one
-- demand-signal stream keyed by SKU / region / channel.
CREATE VIEW `demand_signals` AS
SELECT
  sku,
  region,
  CAST('ONLINE' AS STRING)                      AS channel,
  units                                         AS units_sold,
  units * unit_price * (1 - discount_pct)       AS revenue,
  CAST(0 AS INT)                                AS `views`,
  CAST(0 AS INT)                                AS cart_adds,
  discount_pct,
  event_time
FROM `orders`
UNION ALL
SELECT
  sku,
  region,
  CAST('STORE' AS STRING),
  units,
  units * unit_price * (1 - discount_pct),
  CAST(0 AS INT),
  CAST(0 AS INT),
  discount_pct,
  event_time
FROM `pos_sales`
UNION ALL
SELECT
  sku,
  region,
  CAST('ONLINE' AS STRING),
  CAST(0 AS INT),
  CAST(0.0 AS DOUBLE),
  CAST(1 AS INT),
  CAST(0 AS INT),
  CAST(0.0 AS DOUBLE),
  event_time
FROM `clickstream`
WHERE action = 'VIEW'
UNION ALL
SELECT
  sku,
  region,
  CAST('ONLINE' AS STRING),
  CAST(0 AS INT),
  CAST(0.0 AS DOUBLE),
  CAST(0 AS INT),
  units,
  CAST(0.0 AS DOUBLE),
  event_time
FROM `cart_events`
WHERE action = 'ADD';
