# 服务端镜像：多阶段构建，最终镜像只保留运行产物 + Prisma CLI（迁移用）
# 构建在本地或 ACR 完成，服务器只 pull（2C2G 上不跑 docker build）
# 用法：docker build -t wechat-markup-api:latest .

# ---- 构建期网络参数：默认值已适配国内网络，可整体覆盖 ----
# 基础镜像：Docker Hub 不可达时改用 public.ecr.aws/docker/library/node:20-slim
#   docker build --build-arg NODE_IMAGE=public.ecr.aws/docker/library/node:20-slim ...
ARG NODE_IMAGE=node:20-slim
# npm 源：registry.npmjs.org 在容器内易 ECONNRESET
ARG NPM_REGISTRY=https://registry.npmmirror.com
# Debian 源：deb.debian.org 拉包常卡住数分钟
ARG APT_MIRROR=mirrors.aliyun.com

FROM ${NODE_IMAGE} AS build
ARG NPM_REGISTRY

# Prisma 引擎二进制走国内镜像，避免 binaries.prisma.sh 超时
ENV PRISMA_ENGINES_MIRROR=https://registry.npmmirror.com/-/binary/prisma

WORKDIR /app

RUN npm config set registry "${NPM_REGISTRY}" \
    && npm config set fetch-retries 8 \
    && npm config set fetch-retry-mintimeout 10000 \
    && npm config set fetch-retry-maxtimeout 120000 \
    && npm config set fetch-timeout 600000 \
    && npm config set maxsockets 3

COPY package*.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund

COPY prisma ./prisma
RUN npx prisma generate

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM ${NODE_IMAGE} AS runtime
ARG NPM_REGISTRY
ARG APT_MIRROR

ENV NODE_ENV=production \
    TZ=Asia/Shanghai \
    NODE_OPTIONS=--max-old-space-size=256 \
    PRISMA_ENGINES_MIRROR=https://registry.npmmirror.com/-/binary/prisma

WORKDIR /app

# Prisma 引擎依赖 OpenSSL，且 slim 镜像未带 ca-certificates
RUN sed -i "s|deb.debian.org|${APT_MIRROR}|g" /etc/apt/sources.list.d/debian.sources \
    && apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN npm config set registry "${NPM_REGISTRY}" \
    && npm config set fetch-retries 8 \
    && npm config set fetch-retry-mintimeout 10000 \
    && npm config set fetch-retry-maxtimeout 120000 \
    && npm config set fetch-timeout 600000 \
    && npm config set maxsockets 3

COPY package*.json ./
# 生产依赖 + Prisma CLI（供 docker compose run --rm api npx prisma migrate deploy）
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev --no-audit --no-fund \
    && npm install --no-save --no-package-lock prisma@5.22.0 --no-audit --no-fund

COPY prisma ./prisma
RUN npx prisma generate

COPY --from=build /app/dist ./dist

# 本地存储模式（未配置 OSS）时的落盘目录，通过数据卷挂载持久化
RUN mkdir -p /app/storage

EXPOSE 3000
CMD ["node", "dist/index.js"]
