-- E12 运营后台：代响应来源标记（artist | ops），用于列表标记与统计
ALTER TABLE `demand_response`
  ADD COLUMN `source` VARCHAR(8) NOT NULL DEFAULT 'artist' COMMENT 'artist | ops' AFTER `status`;

CREATE INDEX `demand_response_source_created_at_idx` ON `demand_response`(`source`, `created_at`);
