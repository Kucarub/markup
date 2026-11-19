-- CreateTable
CREATE TABLE `service_order` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `demand_id` INTEGER NOT NULL,
    `customer_id` INTEGER NOT NULL,
    `artist_id` INTEGER NOT NULL,
    `service_date` DATE NOT NULL,
    `service_type` VARCHAR(16) NOT NULL,
    `headcount` INTEGER NOT NULL DEFAULT 1,
    `city` VARCHAR(32) NOT NULL,
    `district` VARCHAR(32) NOT NULL,
    `remark` TEXT NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'pending',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `service_order_demand_id_key`(`demand_id`),
    INDEX `service_order_artist_id_status_idx`(`artist_id`, `status`),
    INDEX `service_order_customer_id_status_idx`(`customer_id`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `service_order` ADD CONSTRAINT `service_order_demand_id_fkey` FOREIGN KEY (`demand_id`) REFERENCES `demand`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `service_order` ADD CONSTRAINT `service_order_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `customer`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `service_order` ADD CONSTRAINT `service_order_artist_id_fkey` FOREIGN KEY (`artist_id`) REFERENCES `artist`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
