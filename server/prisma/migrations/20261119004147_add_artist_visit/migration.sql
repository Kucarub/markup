-- CreateTable
CREATE TABLE `artist_visit` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `artist_id` INTEGER NOT NULL,
    `device_hash` VARCHAR(64) NOT NULL,
    `visit_date` DATE NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `artist_visit_visit_date_idx`(`visit_date`),
    UNIQUE INDEX `uniq_artist_device_day`(`artist_id`, `device_hash`, `visit_date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `artist_visit` ADD CONSTRAINT `artist_visit_artist_id_fkey` FOREIGN KEY (`artist_id`) REFERENCES `artist`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
