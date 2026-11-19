-- DropForeignKey
ALTER TABLE `invitation` DROP FOREIGN KEY `invitation_artist_id_fkey`;

-- DropForeignKey
ALTER TABLE `invitation` DROP FOREIGN KEY `invitation_merchant_id_fkey`;

-- DropForeignKey
ALTER TABLE `merchant` DROP FOREIGN KEY `merchant_user_id_fkey`;

-- DropForeignKey
ALTER TABLE `trade_order` DROP FOREIGN KEY `trade_order_artist_id_fkey`;

-- DropForeignKey
ALTER TABLE `trade_order` DROP FOREIGN KEY `trade_order_invitation_id_fkey`;

-- DropForeignKey
ALTER TABLE `trade_order` DROP FOREIGN KEY `trade_order_merchant_id_fkey`;

-- DropTable
DROP TABLE `invitation`;

-- DropTable
DROP TABLE `merchant`;

-- DropTable
DROP TABLE `trade_order`;

-- CreateTable
CREATE TABLE `customer` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `nickname` VARCHAR(32) NULL,
    `city` VARCHAR(32) NULL,
    `district` VARCHAR(32) NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'active',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `customer_user_id_key`(`user_id`),
    INDEX `customer_city_idx`(`city`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `demand` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `customer_id` INTEGER NOT NULL,
    `target_artist_id` INTEGER NULL,
    `city` VARCHAR(32) NOT NULL,
    `district` VARCHAR(32) NOT NULL,
    `service_date` DATE NOT NULL,
    `service_type` VARCHAR(16) NOT NULL,
    `headcount` INTEGER NOT NULL DEFAULT 1,
    `budget_min` INTEGER NOT NULL,
    `budget_max` INTEGER NOT NULL,
    `style_prefs` JSON NULL,
    `remark` TEXT NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'pending',
    `source` VARCHAR(8) NOT NULL DEFAULT 'customer',
    `expire_at` DATETIME(3) NULL,
    `closed_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `demand_status_city_service_date_idx`(`status`, `city`, `service_date`),
    INDEX `demand_customer_id_status_idx`(`customer_id`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `demand_response` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `demand_id` INTEGER NOT NULL,
    `artist_id` INTEGER NOT NULL,
    `note` VARCHAR(255) NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'pending',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `demand_response_artist_id_status_idx`(`artist_id`, `status`),
    UNIQUE INDEX `uniq_demand_artist`(`demand_id`, `artist_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `customer` ADD CONSTRAINT `customer_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `user_auth`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `demand` ADD CONSTRAINT `demand_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `customer`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `demand` ADD CONSTRAINT `demand_target_artist_id_fkey` FOREIGN KEY (`target_artist_id`) REFERENCES `artist`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `demand_response` ADD CONSTRAINT `demand_response_demand_id_fkey` FOREIGN KEY (`demand_id`) REFERENCES `demand`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `demand_response` ADD CONSTRAINT `demand_response_artist_id_fkey` FOREIGN KEY (`artist_id`) REFERENCES `artist`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
