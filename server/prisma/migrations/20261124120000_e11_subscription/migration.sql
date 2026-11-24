-- E11 订阅消息：授权记录与通知日志状态扩展

-- 1) 订阅授权记录：同一用户同一模板仅一条，拒绝后 7 天内不再提示
CREATE TABLE `subscribe_record` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `user_id` INTEGER NOT NULL,
  `template_key` VARCHAR(32) NOT NULL,
  `status` VARCHAR(16) NOT NULL,
  `prompt_count` INTEGER NOT NULL DEFAULT 0,
  `last_prompt_at` DATETIME(3) NULL,
  `last_rejected_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  UNIQUE INDEX `uniq_user_template`(`user_id`, `template_key`),
  INDEX `subscribe_record_user_id_status_idx`(`user_id`, `status`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `subscribe_record`
  ADD CONSTRAINT `subscribe_record_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `user_auth`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- 2) 通知日志：新增 skipped（未授权/未配置时降级为站内消息）与状态检索索引
ALTER TABLE `notification`
  MODIFY `status` VARCHAR(16) NOT NULL DEFAULT 'pending' COMMENT 'pending | sent | skipped | failed';

CREATE INDEX `notification_status_created_at_idx` ON `notification`(`status`, `created_at`);
