# 化妆师作品集 + 接单门户

单城市试点的化妆师作品集与接单撮合平台，包含三端：

| 目录 | 端 | 技术栈 |
|---|---|---|
| `miniprogram/` | 微信小程序（化妆师 M / 商家 B 双角色） | 原生小程序（WXML/WXSS/JS）+ 分包 |
| `server/` | 服务端 API | Node 20 + TypeScript + Express 4 + Prisma 5 + MySQL 8 + Redis |
| `admin/` | 运营后台（O 端） | Vue 3 + Vite + Element Plus + Pinia |

产品需求见 [PRD](化妆师作品集接单门户-PRD-V1.md)，开发任务与排期见 [任务拆解 V1.1](化妆师作品集接单门户-任务拆解-V1.md)。

## 环境要求

- Node.js >= 20（推荐 20.19.x）
- npm >= 10
- MySQL 8（本地默认 `127.0.0.1:3306`）
- Redis 6+（本地默认 `127.0.0.1:6379`）
- 微信开发者工具（导入 `miniprogram/` 目录）

## 快速开始

### 1. 安装依赖

```bash
npm install            # 根目录：ESLint / Prettier
npm --prefix server install
npm --prefix admin install
```

### 2. 启动服务端

```bash
cd server
cp .env.example .env   # Windows: copy .env.example .env
npm run dev
```

> Prisma 模型与迁移在 E2-01 落地，届时再执行 `npm run prisma:generate` / `npm run prisma:migrate`。
> E1 阶段 `/api/ping` 不依赖 MySQL / Redis，未启动这两个服务也能返回。

验证：

```bash
curl http://localhost:3000/api/ping
# {"code":0,"message":"ok","data":{"service":"wechat-markup-api", ...}}
```

### 3. 启动运营后台

```bash
cd admin
npm run dev            # http://localhost:5173
```

开发环境通过 Vite 代理把 `/api`、`/admin` 转发到 `http://localhost:3000`，无需配置跨域。

### 4. 小程序

微信开发者工具 → 导入项目 → 选择 `miniprogram/` 目录，AppID 使用测试号（`project.config.json` 中为 `touristappid`）。
真机/体验版需把 `miniprogram/project.config.json` 的 `appid` 换成正式 AppID（E1-08）。

## 常用脚本

| 位置 | 命令 | 说明 |
|---|---|---|
| 根目录 | `npm run lint` | 三端统一 ESLint 检查 |
| 根目录 | `npm run lint:fix` | 自动修复可修复项 |
| 根目录 | `npm run format` | Prettier 格式化 |
| `server/` | `npm run dev` | tsx watch 热启动 |
| `server/` | `npm run build` | tsc 编译到 `dist/` |
| `server/` | `npm run prisma:generate` | 生成 Prisma Client |
| `server/` | `npm run prisma:migrate` | 开发环境迁移（E2-01 起） |
| `admin/` | `npm run dev` | Vite 开发服务器 |
| `admin/` | `npm run build` | 生产构建 |
| `admin/` | `npm run typecheck` | vue-tsc 类型检查 |

## 目录约定

```
wechat_markup/
├─ miniprogram/
│  ├─ app.js / app.json / app.wxss
│  ├─ config/env.js            # dev / trial / release 三套域名
│  ├─ utils/request.js         # 统一请求封装（token 注入、统一 toast）
│  ├─ styles/tokens.wxss       # 设计 token（色彩/字号/间距/圆角）
│  ├─ pages/                   # 主包：启动分流、TabBar 页、登录、订单、设置
│  ├─ pkg-artist/              # 分包：化妆师端页面
│  └─ pkg-merchant/            # 分包：商家端页面
├─ server/
│  ├─ prisma/schema.prisma
│  ├─ src/app.ts               # Express 实例与中间件装配
│  ├─ src/index.ts             # 进程入口（端口、优雅退出）
│  ├─ src/config/env.ts        # 环境变量校验（zod）
│  ├─ src/lib/                 # prisma / redis 客户端
│  ├─ src/middlewares/         # 异常处理、请求日志
│  ├─ src/routes/              # 路由注册
│  └─ src/utils/               # 统一响应体、业务异常
└─ admin/
   ├─ src/router/              # 路由表 + 登录守卫
   ├─ src/stores/              # Pinia
   ├─ src/api/request.ts       # axios 封装（token、统一错误）
   ├─ src/layouts/             # 后台框架布局
   ├─ src/views/               # 页面
   └─ src/styles/              # tokens.scss + 全局样式
```

分页路径与页面清单以任务拆解「附录 A」为准；接口以「附录 B」为准。

## 分支与提交规范

### 分支

- `main`：可发布分支，只接受来自 `develop` 的合并。
- `develop`：日常集成分支。
- `feature/<任务ID>-<简述>`：功能分支，例如 `feature/E3-01-wx-login`。
- `fix/<简述>`：缺陷修复分支。

单人开发时也保持该流程：每个任务一个分支，自测通过后合并回 `develop`，里程碑节点把 `develop` 合入 `main` 并打 tag（如 `v0.1.0`）。

### 提交信息（Conventional Commits）

```
<type>(<scope>): <简述>

type: feat | fix | docs | style | refactor | perf | test | chore | build
scope: miniprogram | server | admin | root
```

示例：

- `feat(server): 新增 /api/ping 统一响应骨架`
- `feat(miniprogram): 初始化分包与请求封装`
- `fix(admin): 未登录访问 /dashboard 未跳转登录页`

约定：一次提交只做一件事；提交前本地通过 `npm run lint`；涉及接口变更需同步更新附录 B。

## 统一响应体

所有接口返回：

```json
{ "code": 0, "message": "ok", "data": {}, "traceId": "可选" }
```

- `code = 0` 表示成功，非 0 为业务错误码（`400xx` 参数、`401xx` 鉴权、`403xx` 权限、`5xxxx` 系统）。
- HTTP 状态码同时表达语义：参数错误 400、未登录 401、无权限 403、不存在 404、系统错误 500。

## 配置说明

- 服务端配置从 `server/.env` 读取，字段见 `server/.env.example`，启动时由 zod 校验。
- 后台配置从 `admin/.env.*` 读取，生产环境需配置 `VITE_API_BASE`。
- 小程序域名在 `miniprogram/config/env.js` 中按 `envVersion` 自动切换。
- 任何密钥、AppSecret、模板 ID 不得提交到仓库，`.env` 已在 `.gitignore` 中忽略。
