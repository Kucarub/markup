-- CreateTable
CREATE TABLE `user_auth` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `openid` VARCHAR(64) NOT NULL,
    `unionid` VARCHAR(64) NULL,
    `phone_cipher` VARCHAR(255) NULL,
    `role` VARCHAR(16) NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'active',
    `nickname` VARCHAR(64) NULL,
    `avatar_url` VARCHAR(512) NULL,
    `last_login_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `user_auth_openid_key`(`openid`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `artist` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `name` VARCHAR(32) NOT NULL,
    `city` VARCHAR(32) NOT NULL,
    `district` VARCHAR(32) NULL,
    `years` INTEGER NOT NULL DEFAULT 0,
    `styles` JSON NULL,
    `intro` TEXT NULL,
    `id_card_cipher` VARCHAR(255) NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'pending',
    `reject_reason` VARCHAR(255) NULL,
    `lat` DOUBLE NULL,
    `lng` DOUBLE NULL,
    `audit_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `artist_user_id_key`(`user_id`),
    INDEX `artist_status_city_idx`(`status`, `city`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `artist_portfolio` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `artist_id` INTEGER NOT NULL,
    `type` VARCHAR(16) NOT NULL DEFAULT 'image',
    `url` VARCHAR(1024) NOT NULL,
    `cover_url` VARCHAR(1024) NULL,
    `watermark_url` VARCHAR(1024) NULL,
    `title` VARCHAR(64) NOT NULL,
    `styles` JSON NULL,
    `sort` INTEGER NOT NULL DEFAULT 0,
    `status` VARCHAR(16) NOT NULL DEFAULT 'pending',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `artist_portfolio_artist_id_sort_idx`(`artist_id`, `sort`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `artist_schedule` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `artist_id` INTEGER NOT NULL,
    `date` DATE NOT NULL,
    `state` VARCHAR(16) NOT NULL DEFAULT 'available',
    `order_id` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `artist_schedule_date_state_idx`(`date`, `state`),
    UNIQUE INDEX `uniq_artist_date`(`artist_id`, `date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `merchant` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `shop_name` VARCHAR(64) NOT NULL,
    `type` VARCHAR(16) NULL,
    `address` VARCHAR(255) NULL,
    `lat` DOUBLE NULL,
    `lng` DOUBLE NULL,
    `license_cipher` VARCHAR(255) NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'pending',
    `reject_reason` VARCHAR(255) NULL,
    `audit_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `merchant_user_id_key`(`user_id`),
    INDEX `merchant_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `invitation` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `merchant_id` INTEGER NOT NULL,
    `artist_id` INTEGER NOT NULL,
    `service_type` VARCHAR(16) NOT NULL,
    `service_date` DATE NOT NULL,
    `address` VARCHAR(255) NOT NULL,
    `headcount` INTEGER NOT NULL DEFAULT 1,
    `budget_min` INTEGER NOT NULL,
    `budget_max` INTEGER NOT NULL,
    `remark` TEXT NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'pending',
    `decline_reason` VARCHAR(255) NULL,
    `source` VARCHAR(8) NOT NULL DEFAULT 'user',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `invitation_artist_id_status_idx`(`artist_id`, `status`),
    INDEX `invitation_merchant_id_status_idx`(`merchant_id`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `trade_order` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `invitation_id` INTEGER NOT NULL,
    `artist_id` INTEGER NOT NULL,
    `merchant_id` INTEGER NOT NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'pending',
    `artist_confirmed` BOOLEAN NOT NULL DEFAULT false,
    `merchant_confirmed` BOOLEAN NOT NULL DEFAULT false,
    `finish_time` DATETIME(3) NULL,
    `cancel_reason` VARCHAR(255) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `trade_order_invitation_id_key`(`invitation_id`),
    INDEX `trade_order_status_idx`(`status`),
    INDEX `trade_order_artist_id_status_idx`(`artist_id`, `status`),
    INDEX `trade_order_merchant_id_status_idx`(`merchant_id`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `audit_log` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `target_type` VARCHAR(16) NOT NULL,
    `target_id` INTEGER NOT NULL,
    `action` VARCHAR(16) NOT NULL,
    `reason` VARCHAR(255) NULL,
    `operator_id` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `audit_log_target_type_target_id_idx`(`target_type`, `target_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `admin_user` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `username` VARCHAR(32) NOT NULL,
    `password_hash` VARCHAR(128) NOT NULL,
    `role` VARCHAR(16) NOT NULL DEFAULT 'admin',
    `status` VARCHAR(16) NOT NULL DEFAULT 'active',
    `fail_count` INTEGER NOT NULL DEFAULT 0,
    `locked_until` DATETIME(3) NULL,
    `last_login_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `admin_user_username_key`(`username`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `notification` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `type` VARCHAR(32) NOT NULL,
    `payload` JSON NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'pending',
    `sent_at` DATETIME(3) NULL,
    `fail_reason` VARCHAR(255) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `notification_user_id_created_at_idx`(`user_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `report` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `target_type` VARCHAR(16) NOT NULL,
    `target_id` INTEGER NOT NULL,
    `reason` VARCHAR(255) NOT NULL,
    `reporter_id` INTEGER NOT NULL,
    `date` DATE NOT NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'pending',
    `handle_operator` INTEGER NULL,
    `handle_result` VARCHAR(255) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `report_status_idx`(`status`),
    UNIQUE INDEX `uniq_reporter_target_date`(`reporter_id`, `target_type`, `target_id`, `date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `event_log` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NULL,
    `role` VARCHAR(16) NULL,
    `event` VARCHAR(64) NOT NULL,
    `props` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `event_log_event_created_at_idx`(`event`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `stats_daily` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `date` DATE NOT NULL,
    `registrations` INTEGER NOT NULL DEFAULT 0,
    `artist_page_uv` INTEGER NOT NULL DEFAULT 0,
    `invitations` INTEGER NOT NULL DEFAULT 0,
    `matches` INTEGER NOT NULL DEFAULT 0,
    `match_rate` DOUBLE NOT NULL DEFAULT 0,
    `retention_d7` DOUBLE NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `stats_daily_date_key`(`date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `file_object` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NULL,
    `scene` VARCHAR(16) NOT NULL,
    `bucket` VARCHAR(64) NOT NULL,
    `object_key` VARCHAR(180) NOT NULL,
    `url` VARCHAR(1024) NULL,
    `size` INTEGER NOT NULL DEFAULT 0,
    `mime_type` VARCHAR(64) NOT NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'pending',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `file_object_object_key_key`(`object_key`),
    INDEX `file_object_user_id_created_at_idx`(`user_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `dict_item` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `type` VARCHAR(32) NOT NULL,
    `code` VARCHAR(64) NOT NULL,
    `label` VARCHAR(64) NOT NULL,
    `sort` INTEGER NOT NULL DEFAULT 0,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `dict_item_type_sort_idx`(`type`, `sort`),
    UNIQUE INDEX `dict_item_type_code_key`(`type`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `artist` ADD CONSTRAINT `artist_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `user_auth`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `artist_portfolio` ADD CONSTRAINT `artist_portfolio_artist_id_fkey` FOREIGN KEY (`artist_id`) REFERENCES `artist`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `artist_schedule` ADD CONSTRAINT `artist_schedule_artist_id_fkey` FOREIGN KEY (`artist_id`) REFERENCES `artist`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `merchant` ADD CONSTRAINT `merchant_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `user_auth`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `invitation` ADD CONSTRAINT `invitation_merchant_id_fkey` FOREIGN KEY (`merchant_id`) REFERENCES `merchant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `invitation` ADD CONSTRAINT `invitation_artist_id_fkey` FOREIGN KEY (`artist_id`) REFERENCES `artist`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `trade_order` ADD CONSTRAINT `trade_order_invitation_id_fkey` FOREIGN KEY (`invitation_id`) REFERENCES `invitation`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `trade_order` ADD CONSTRAINT `trade_order_artist_id_fkey` FOREIGN KEY (`artist_id`) REFERENCES `artist`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `trade_order` ADD CONSTRAINT `trade_order_merchant_id_fkey` FOREIGN KEY (`merchant_id`) REFERENCES `merchant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `audit_log` ADD CONSTRAINT `audit_log_operator_id_fkey` FOREIGN KEY (`operator_id`) REFERENCES `admin_user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `notification` ADD CONSTRAINT `notification_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `user_auth`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `report` ADD CONSTRAINT `report_reporter_id_fkey` FOREIGN KEY (`reporter_id`) REFERENCES `user_auth`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
