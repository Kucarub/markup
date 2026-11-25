-- E13-02：stats_daily 对齐 PRD 第 1 章指标口径
-- invitations -> demands（客户需求发布数）
-- matches     -> service_orders（服务记录数）
-- match_rate  -> completion_rate（服务完成率）
-- 新增 responses（响应数）、response_rate（需求响应率）
ALTER TABLE `stats_daily`
  CHANGE COLUMN `invitations` `demands` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `responses` INTEGER NOT NULL DEFAULT 0 AFTER `demands`,
  ADD COLUMN `response_rate` DOUBLE NOT NULL DEFAULT 0 AFTER `responses`,
  CHANGE COLUMN `matches` `service_orders` INTEGER NOT NULL DEFAULT 0,
  CHANGE COLUMN `match_rate` `completion_rate` DOUBLE NOT NULL DEFAULT 0;
