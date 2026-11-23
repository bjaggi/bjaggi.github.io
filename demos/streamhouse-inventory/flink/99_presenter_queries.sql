-- Ad-hoc queries to run live in the Flink SQL workspace during the demo.
-- Run one at a time (highlight + Run). None of these are deployed by Terraform.

-- 1. Raw signals arriving from apps, web and stores.
SELECT * FROM `orders`;
SELECT * FROM `pos_sales`;

-- 2. Demand per SKU / region / channel per period.
SELECT sku, region, channel, window_end, units_sold, `views`, cart_adds, promo_active
FROM `demand_windowed`;

-- 3. Forecast vs actual with confidence bounds for the hero SKU.
SELECT window_end, region, channel, units_sold, forecast_next, lower_next, upper_next, rmse
FROM `demand_forecast`
WHERE sku = 'LIFE-RETRO-HI';

-- 4. What is about to stock out (or is overstocked and heading for markdown)?
SELECT sku, region, channel, on_hand, forecast_horizon, periods_of_cover, risk_level, suggested_replenishment_units
FROM `stockout_risk`
WHERE risk_level IN ('OUT_OF_STOCK', 'HIGH', 'OVERSTOCK');

-- 5. Anomalies detected by ML_DETECT_ANOMALIES (launch spikes, promo lift).
SELECT * FROM `demand_anomalies`;

-- 6. Granite explanations written back to Kafka by the explainer service.
SELECT sku, region, channel, headline, recommended_action, model FROM `forecast_explanations`;

-- 7. Promo lift: average units per period with and without an active promo.
SELECT sku, promo_active, AVG(units_sold) AS avg_units, COUNT(*) AS periods
FROM `demand_windowed`
GROUP BY sku, promo_active;
