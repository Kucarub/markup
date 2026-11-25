# 埋点事件规范（E13-01）

数据源：`event_log` 表。写入分两条通道：

1. **服务端规范事件**（本文件第 1 节）：业务动作成功后由服务端写入，前端无需重复上报，保证「注册/访问/发布/响应/完成」五类关键动作不丢；
2. **客户端自定义事件**（第 2 节）：小程序通过 `utils/track.js` → `POST /api/events` 上报，用于搜索、浏览等辅助分析。

约定：

- 事件名 `^[a-z][a-z0-9_]{2,63}$`，小写字母 / 数字 / 下划线；
- `props` 为 JSON 对象，序列化后不得超过 2000 字符；
- 埋点失败只记服务端告警（`[analytics] 埋点写入失败`），**不向业务主流程抛错**；
- `role` 取值 `artist | customer | admin`，游客事件为 `null`。

## 1. 服务端规范事件（5 类）

| 事件名 | 触发位置 | role | 必要 props | 说明 |
|---|---|---|---|---|
| `user_register` | `POST /api/auth/wx-login` 首次建档 | `null` | `userId`, `channel` | 同一 openid 仅首次登录记一条 |
| `artist_page_view` | `POST /api/artist/{id}/visit` 去重成功后 | `null` | `artistId` | 同设备同日同化妆师只记一次，与 `artist_visit` 一致 |
| `demand_publish` | `POST /api/demands`、后台代发布 | `customer` / `admin` | `demandId`, `city`, `serviceType` | 代发布额外带 `source: "ops"` |
| `demand_response` | `POST /api/demands/{id}/respond`、后台代响应 | `artist` / `admin` | `demandId`, `responseId` | 代响应额外带 `source: "ops"` |
| `order_finish` | `POST /api/service-orders/{id}/finish` 双方确认、7 天自动完成 | `customer` / `artist` / `null` | `orderId` | 自动完成带 `auto: true` |

示例：

```json
{ "event": "demand_publish", "role": "customer", "props": { "demandId": 1024, "city": "上海", "serviceType": "bridal", "source": "customer" } }
```

## 2. 客户端自定义事件

| 事件名 | 触发页面 | 主要 props |
|---|---|---|
| `search_artists` | 搜索列表 | `city`, `styles`, `radiusKm` |
| `artist_card_click` | 搜索 / 需求详情 | `artistId`, `from` |
| `demand_hall_view` | 需求大厅 | `city` |
| `demand_detail_view` | 需求详情 | `demandId`, `isTargeted` |
| `demand_respond` | 需求详情点击响应 | `demandId` |
| `demand_select` | 需求详情择一确认 | `demandId`, `responseId` |

> 注意：`demand_respond` 与 `demand_select` 是前端点击行为；`demand_response` 是服务端写库成功后的结果事件，两者口径不同，统计时以服务端事件为准。

## 3. 每日聚合口径（E13-02，stats_daily）

聚合任务每天 01:00 重算前一日，也支持后台手动重跑（幂等 upsert）。

| 字段 | 口径 |
|---|---|
| `registrations` | 当日新建 `user_auth` 数 |
| `artist_page_uv` | 当日 `artist_visit` 行数（同设备同日同化妆师去重） |
| `demands` | 当日新建需求数，含运营代发布 |
| `responses` | 当日新增响应数 |
| `response_rate` | 当日创建的需求中至少收到 1 条响应的占比（0–1，4 位小数） |
| `service_orders` | 当日新建服务记录数 |
| `completion_rate` | 当日创建的服务记录中状态为 `finished` 的占比（0–1，4 位小数） |
| `retention_d7` | D-7 注册的账号中，D 当日有登录或埋点行为的占比（0–1，4 位小数） |

聚合直接读业务表，不依赖 `event_log` 条数，避免前端漏报导致指标失真；`event_log` 仅用于漏斗与维度分析（`GET /api/admin/stats/events`）。
