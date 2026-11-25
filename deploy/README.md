# 部署手册（2 vCPU / 2 GiB / 40 GiB / 不限流量）

单机部署形态：**MySQL 容器 + API 容器 + 宿主机 Nginx**，admin 静态文件由宿主机 Nginx 托管，图片走 OSS 直连。

```
公网 80/443 → 宿主机 Nginx ─┬─ /            → /var/www/wechat-admin（admin dist）
                            └─ /api/*, /api-docs → 127.0.0.1:3000（api 容器）
api 容器 ── db 容器（3306 仅 compose 内网）
api 容器 ── OSS（读取签名直连，上传经服务器转发）
```

内存预算：系统 300M + dockerd 120M + MySQL 300M + Node 230M + Nginx 30M ≈ **980M**，余量 1G。
磁盘预算：系统 5G + 镜像 1.5G + MySQL 数据 3–6G + 日志 0.5G ≈ **12G / 36G 可用**。

---

## 一、服务器初始化（Ubuntu 24.04 LTS）

```bash
# 1. 基础软件
sudo apt update && sudo apt install -y nginx curl ca-certificates

# 2. 2G swap（防止偶发 OOM）
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
echo 'vm.swappiness=10' | sudo tee -a /etc/sysctl.conf && sudo sysctl -p

# 3. journald 限额（40G 系统盘不要被日志吃掉）
sudo sed -i 's/^#\?SystemMaxUse=.*/SystemMaxUse=200M/' /etc/systemd/journald.conf
sudo systemctl restart systemd-journald

# 4. Docker（用阿里云镜像源；装完把日志上限写进 daemon.json）
curl -fsSL https://get.docker.com | sudo sh -s -- --mirror Aliyun
sudo tee /etc/docker/daemon.json >/dev/null <<'EOF'
{
  "log-driver": "json-file",
  "log-opts": { "max-size": "10m", "max-file": "2" }
}
EOF
sudo systemctl restart docker && sudo systemctl enable docker

# 5. 目录
sudo mkdir -p /opt/wechat /srv/wechat/mysql /srv/wechat/storage /var/www/wechat-admin
sudo chown -R $USER:$USER /opt/wechat /srv/wechat
```

安全组只放行 **22 / 80 / 443**。3306 与 3000 都不对外（compose 里 3000 只绑 127.0.0.1）。

---

## 二、构建镜像（在本地做，服务器只 pull）

```bash
docker build -t wechat-markup-api:1.0.1 ./server
docker save wechat-markup-api:1.0.1 -o api-1.0.1.tar
scp -i .\make-up.pem .\api-1.0.1.tar root@106.15.8.132:/tmp/

```

```bash
cd /opt/wechat/deploy
sudo docker load -i /tmp/api-1.0.1.tar
sudo docker compose ps                 # 先确认 db 是 Up (healthy)
sudo docker compose up -d db           # 若 db 没起来，先单独拉起
# 用新镜像跑迁移（旧镜像里没有新迁移文件，必须换镜像后再跑）
sudo docker compose run --rm api npx prisma migrate deploy
# .env 里把 IMAGE 改成 wechat-markup-api:1.0.1 后
sudo docker compose up -d api
curl http://127.0.0.1:3000/api/ping
```

```bash
systemctl systemctl reload nginx 重启 Nginx 配置生效
```



## 三、部署

```bash
# 1. 上传部署目录
scp -r deploy/ user@server:/opt/wechat/

# 2. 配置环境变量（务必改 JWT_SECRET / DB_ROOT_PASSWORD，且两者密码保持一致）
cd /opt/wechat/deploy
cp .env.example .env && chmod 600 .env
vi .env

# 3. 拉取镜像并启动 MySQL
docker compose pull
docker compose up -d db
docker compose ps

# 4. 初始化/升级表结构（一次性容器执行）
docker compose run --rm api npx prisma migrate deploy

# 5. 启动 API
docker compose up -d api
curl http://127.0.0.1:3000/api/ping
```

首次部署后需要建管理员账号：本地执行 `npm run prisma:seed`（指向线上库）或按现有方式手工插入。

---

## 四、admin 静态站点

```bash
# 本地构建（VITE_API_BASE 留空，与 API 同域）
cd admin && npm run build

# 上传
rsync -avz --delete dist/ user@server:/var/www/wechat-admin/
```

```bash
# 服务器：启用站点
sudo cp /opt/wechat/deploy/nginx.conf /etc/nginx/conf.d/wechat-markup.conf
sudo vi /etc/nginx/conf.d/wechat-markup.conf   # 把 your.domain 换成实际域名
sudo nginx -t && sudo systemctl reload nginx

# HTTPS（证书自动注入 443 与续期任务）
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your.domain
```

访问 `https://your.domain/` 即是后台登录页。

---

## 五、日常更新

```bash
cd /opt/wechat/deploy
docker compose pull api
docker compose run --rm api npx prisma migrate deploy   # 有新迁移时执行
docker compose up -d api
docker compose ps
```

回滚：把 `.env` 里的 `IMAGE` 改成上一个版本号，`docker compose up -d api`。

admin 有改动时重新构建并 `rsync` 到 `/var/www/wechat-admin`。

---

## 六、备份（不占系统盘）

```bash
chmod +x /opt/wechat/deploy/scripts/backup.sh
# 安装 ossutil 并配置 AccessKey 后，加入 crontab：
# 0 3 * * * /opt/wechat/deploy/scripts/backup.sh >> /srv/wechat/backup.log 2>&1
```

脚本把 `mysqldump` 压缩后推到 OSS，本地保留最近 1 份。

---

## 七、资源维护

```bash
# 每周清一次旧镜像与悬空层（保留 7 天内的）
docker image prune -af --filter "until=168h"
docker builder prune -af

# 磁盘 / 内存观测
df -h /        && free -m && docker stats --no-stream
```

`docker stats` 里 api 常驻约 230M、db 约 300M 属正常；api 长期贴近 512M 上限说明有内存泄漏，需要排查。

---

## 八、小程序与域名

- `miniprogram/config/env.js` 的 `baseURL` 改为 `https://your.domain`
- 小程序后台「服务器域名」需加入 `https://your.domain`（request / uploadFile / downloadFile）
- 配置 OSS 后，图片地址是 `https://<bucket>.oss-cn-xxx.aliyuncs.com/...`，需把该域名加入 **downloadFile 合法域名**
- OSS Bucket 保持**私有**权限（默认），不要开公共读：读取全靠 15 分钟签名地址，上传经服务器转发
- admin 的 `VITE_API_BASE` 留空即可，同域请求

---

## 九、常见问题

| 现象 | 原因 / 处理 |
|---|---|
| api 容器反复重启 | 看 `docker compose logs api`；多为 `.env` 缺 `JWT_SECRET` / `DATABASE_URL` 格式错 |
| 上传 413 | 检查 Nginx `client_max_body_size`（默认 8m）与 `MAX_UPLOAD_MB` |
| 图片地址仍是 `/api/files/raw?...` | `OSS_BUCKET/REGION/ACCESS_KEY_ID/ACCESS_KEY_SECRET` 四个变量不全，未切到 OSS |
| 后台登录后立刻退出 | `JWT_SECRET` 每次重建容器都变过；固定写入 `.env` 即可 |
| 签名地址 http 而非 https | 确认 Nginx 传了 `X-Forwarded-Proto`，服务端已开启 `trust proxy` |
| 磁盘涨得快 | `docker image prune -af`；检查 MySQL binlog（已限制 3 天）与 `/srv/wechat` 备份残留 |
