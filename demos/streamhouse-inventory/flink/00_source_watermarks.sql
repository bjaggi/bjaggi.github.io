ALTER TABLE `orders` MODIFY WATERMARK FOR `event_time` AS `event_time` - INTERVAL '5' SECOND;
ALTER TABLE `pos_sales` MODIFY WATERMARK FOR `event_time` AS `event_time` - INTERVAL '5' SECOND;
ALTER TABLE `clickstream` MODIFY WATERMARK FOR `event_time` AS `event_time` - INTERVAL '5' SECOND;
ALTER TABLE `cart_events` MODIFY WATERMARK FOR `event_time` AS `event_time` - INTERVAL '5' SECOND;
ALTER TABLE `inventory_updates` MODIFY WATERMARK FOR `event_time` AS `event_time` - INTERVAL '5' SECOND;
