-- E9 定向预约与接单中心
-- 1) 档期占用字段统一命名：order_id → service_order_id（指向 service_order.id）
ALTER TABLE `artist_schedule` CHANGE COLUMN `order_id` `service_order_id` INTEGER NULL;

-- 2) 定向预约被婉拒时记录原因与时间
ALTER TABLE `demand` ADD COLUMN `decline_reason` VARCHAR(255) NULL,
    ADD COLUMN `declined_at` DATETIME(3) NULL;

-- 3) 接单中心按目标化妆师 + 状态查询
CREATE INDEX `demand_target_artist_id_status_idx` ON `demand`(`target_artist_id`, `status`);
