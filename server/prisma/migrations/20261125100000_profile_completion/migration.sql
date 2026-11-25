-- 化妆师注册流程调整：选角色即建档（仅需手机号），「入驻审核」改为「个人信息完善」
-- 1) artist 增加 profile_completed：自动建档为 0（不对外展示），提交资料后置 1
-- 2) 历史 pending / rejected 统一转为 approved（不再做资质审核）
-- 3) 信用分初始值 60 → 0，等级阈值随之下调并重算存量等级

ALTER TABLE `artist`
  ADD COLUMN `profile_completed` BOOLEAN NOT NULL DEFAULT true AFTER `status`;

UPDATE `artist` SET `profile_completed` = true;

UPDATE `artist`
SET `status` = 'approved',
    `reject_reason` = NULL,
    `audit_at` = NULL
WHERE `status` IN ('pending', 'rejected');

ALTER TABLE `credit_score`
  MODIFY `score` INTEGER NOT NULL DEFAULT 0,
  MODIFY `level` VARCHAR(16) NOT NULL DEFAULT '待提升';

UPDATE `credit_score`
SET `level` = CASE
  WHEN `score` >= 80 THEN '优秀'
  WHEN `score` >= 60 THEN '良好'
  WHEN `score` >= 30 THEN '一般'
  ELSE '待提升'
END;
