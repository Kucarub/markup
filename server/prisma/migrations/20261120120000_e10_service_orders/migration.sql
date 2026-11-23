-- E10 服务记录状态机与双方确认、双向评价、信用分

-- 1) 服务记录：发起方、确认与完工确认、取消信息
ALTER TABLE `service_order`
  ADD COLUMN `initiator_role` VARCHAR(16) NOT NULL DEFAULT 'customer' AFTER `status`,
  ADD COLUMN `confirmed_at` DATETIME(3) NULL AFTER `initiator_role`,
  ADD COLUMN `artist_confirmed` BOOLEAN NOT NULL DEFAULT false AFTER `confirmed_at`,
  ADD COLUMN `customer_confirmed` BOOLEAN NOT NULL DEFAULT false AFTER `artist_confirmed`,
  ADD COLUMN `finish_request_by` VARCHAR(16) NULL AFTER `customer_confirmed`,
  ADD COLUMN `finish_request_at` DATETIME(3) NULL AFTER `finish_request_by`,
  ADD COLUMN `finish_time` DATETIME(3) NULL AFTER `finish_request_at`,
  ADD COLUMN `cancel_reason` VARCHAR(255) NULL AFTER `finish_time`,
  ADD COLUMN `cancel_by` VARCHAR(16) NULL AFTER `cancel_reason`,
  ADD COLUMN `cancelled_at` DATETIME(3) NULL AFTER `cancel_by`;

CREATE INDEX `service_order_status_finish_request_at_idx`
  ON `service_order`(`status`, `finish_request_at`);

-- 2) 双向评价：一单一评（同一服务记录同一方仅一次）
CREATE TABLE `review` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `service_order_id` INTEGER NOT NULL,
  `from_user_id` INTEGER NOT NULL,
  `from_role` VARCHAR(16) NOT NULL,
  `to_user_id` INTEGER NOT NULL,
  `to_role` VARCHAR(16) NOT NULL,
  `rating` INTEGER NOT NULL,
  `tags` JSON NULL,
  `content` VARCHAR(500) NULL,
  `status` VARCHAR(16) NOT NULL DEFAULT 'visible',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  UNIQUE INDEX `uniq_order_from_user`(`service_order_id`, `from_user_id`),
  INDEX `review_to_user_id_status_idx`(`to_user_id`, `status`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `review`
  ADD CONSTRAINT `review_service_order_id_fkey` FOREIGN KEY (`service_order_id`) REFERENCES `service_order`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `review_from_user_id_fkey` FOREIGN KEY (`from_user_id`) REFERENCES `user_auth`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `review_to_user_id_fkey` FOREIGN KEY (`to_user_id`) REFERENCES `user_auth`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- 3) 信用分：初始 60，完成 +2 / 取消 -5
CREATE TABLE `credit_score` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `user_id` INTEGER NOT NULL,
  `role` VARCHAR(16) NOT NULL,
  `score` INTEGER NOT NULL DEFAULT 60,
  `level` VARCHAR(16) NOT NULL DEFAULT '一般',
  `events` JSON NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  UNIQUE INDEX `credit_score_user_id_key`(`user_id`),
  INDEX `credit_score_score_idx`(`score`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `credit_score`
  ADD CONSTRAINT `credit_score_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `user_auth`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
