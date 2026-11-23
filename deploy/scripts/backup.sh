#!/usr/bin/env bash
# MySQL 逻辑备份 → 压缩 → 直接推 OSS（不占系统盘）
# 依赖：docker compose、ossutil（https://help.aliyun.com/zh/oss/developer-reference/ossutil）
# 用法：BACKUP_BUCKET=xxx-backup ./backup.sh
set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo "[backup] 缺少 .env" >&2
  exit 1
fi

# shellcheck disable=SC1091
set -a && . ./.env && set +a

if [ -z "${BACKUP_BUCKET:-}" ]; then
  echo "[backup] 请设置 BACKUP_BUCKET（OSS Bucket 名）" >&2
  exit 1
fi

STAMP=$(date +%F-%H%M)
DUMP="/tmp/wechat-markup-${STAMP}.sql.gz"

echo "[backup] dump ${DB_NAME:-wechat_markup} -> ${DUMP}"
docker compose exec -T db \
  mysqldump -uroot -p"${DB_ROOT_PASSWORD}" \
  --single-transaction --quick --no-tablespaces \
  "${DB_NAME:-wechat_markup}" | gzip > "${DUMP}"

echo "[backup] upload oss://${BACKUP_BUCKET}/db/$(basename "${DUMP}")"
ossutil cp -f "${DUMP}" "oss://${BACKUP_BUCKET}/db/$(basename "${DUMP}")"

rm -f "${DUMP}"
echo "[backup] done"
