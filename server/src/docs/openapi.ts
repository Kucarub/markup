/**
 * OpenAPI 3.0 文档（E2-08）。
 * 手写而非从注解生成：接口量小、零额外依赖，先保证文档可用再考虑自动化。
 */

const bearer = [{ bearerAuth: [] }]

const errorResponse = {
  description: '统一错误响应',
  content: {
    'application/json': {
      schema: { $ref: '#/components/schemas/ApiError' },
      example: { code: 40100, message: '登录已失效，请重新登录', data: null, traceId: 'uuid' },
    },
  },
}

export const openApiDocument = {
  openapi: '3.0.3',
  info: {
    title: '妆集 API（化妆师作品集 + 接单门户）',
    version: '0.10.0',
    description: [
      '统一响应体：`{ code, message, data, traceId }`，`code === 0` 表示成功。',
      '错误码：40001 参数校验 / 40100 未登录 / 40101 登录过期 / 40300 无权限 / 40400 不存在 / 40900 冲突 / 41301 文件过大 / 41500 类型不支持 / 42301 账号锁定 / 50000 服务异常。',
      '分页响应统一为 `{ total, list, page, size }`。',
    ].join('\n\n'),
  },
  servers: [{ url: 'http://127.0.0.1:3000', description: '本地开发' }],
  tags: [
    { name: '基础' },
    { name: '登录态' },
    { name: '入驻' },
    { name: '资料' },
    { name: '客户' },
    { name: '需求' },
    { name: '服务记录' },
    { name: '评价' },
    { name: '通知' },
    { name: '搜索' },
    { name: '埋点' },
    { name: '后台' },
    { name: '上传' },
  ],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    },
    schemas: {
      ApiError: {
        type: 'object',
        properties: {
          code: { type: 'integer', example: 40100 },
          message: { type: 'string' },
          data: { nullable: true },
          traceId: { type: 'string' },
        },
      },
      Pagination: {
        type: 'object',
        properties: {
          total: { type: 'integer', example: 42 },
          page: { type: 'integer', example: 1 },
          size: { type: 'integer', example: 20 },
          list: { type: 'array', items: { type: 'object' } },
        },
      },
      TokenPair: {
        type: 'object',
        properties: {
          accessToken: { type: 'string' },
          refreshToken: { type: 'string' },
          expiresIn: { type: 'string', example: '7d' },
        },
      },
      UserProfile: {
        type: 'object',
        properties: {
          userId: { type: 'integer' },
          role: { type: 'string', nullable: true, enum: ['artist', 'customer'] },
          needRoleSelect: { type: 'boolean', description: '未选角色时为 true，前端跳角色选择页' },
          nickname: { type: 'string', nullable: true },
          avatarUrl: { type: 'string', nullable: true },
          profileId: { type: 'integer', nullable: true, description: 'artist.id / customer.id' },
          profileStatus: {
            type: 'string',
            description: 'none=未建档 / approved=正常 / disabled=停用；选角色即建档，不再有 pending、rejected',
            enum: ['none', 'approved', 'disabled'],
          },
          profileCompleted: {
            type: 'boolean',
            description: '化妆师是否已完善个人信息（未完善仍可正常使用全部功能，仅不进入搜索与公开主页）',
          },
          rejectReason: { type: 'string', nullable: true },
        },
      },
      WxSession: {
        allOf: [
          { $ref: '#/components/schemas/TokenPair' },
          { $ref: '#/components/schemas/UserProfile' },
        ],
      },
      AdminInfo: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          username: { type: 'string' },
          role: { type: 'string', enum: ['super', 'admin', 'auditor'] },
        },
      },
      UploadSign: {
        type: 'object',
        properties: {
          fileId: { type: 'integer' },
          objectKey: { type: 'string' },
          uploadPath: { type: 'string' },
          uploadUrl: { type: 'string' },
          method: { type: 'string', example: 'PUT' },
          headers: { type: 'object', additionalProperties: { type: 'string' } },
          expiresIn: { type: 'integer', example: 900 },
        },
      },
      FileSign: {
        type: 'object',
        properties: {
          fileId: { type: 'integer' },
          objectKey: { type: 'string' },
          path: { type: 'string' },
          url: { type: 'string' },
          expiresIn: { type: 'integer' },
        },
      },
      ArtistWork: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          fileId: { type: 'integer', nullable: true },
          type: { type: 'string', enum: ['image', 'video'] },
          title: { type: 'string' },
          styles: { type: 'array', items: { type: 'string' } },
          path: { type: 'string', description: '私有桶签名地址，15 分钟有效' },
        },
      },
      ArtistDetail: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          name: { type: 'string' },
          city: { type: 'string' },
          district: { type: 'string', nullable: true },
          years: { type: 'integer' },
          styles: { type: 'array', items: { type: 'string' } },
          intro: { type: 'string', nullable: true },
          idCardMasked: { type: 'string', example: '310***********1234' },
          status: { type: 'string', enum: ['approved', 'disabled'], description: '选角色即建档，pending / rejected 仅历史数据' },
          profileCompleted: { type: 'boolean', description: '是否已完善个人信息' },
          credit: {
            type: 'object',
            properties: {
              score: { type: 'integer', example: 0, description: '信用分（初始 0 分）' },
              level: { type: 'string', example: '待提升' },
            },
          },
          rejectReason: { type: 'string', nullable: true },
          auditAt: { type: 'string', format: 'date-time', nullable: true },
          submittedAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
          works: { type: 'array', items: { $ref: '#/components/schemas/ArtistWork' } },
          keyChanged: { type: 'boolean', description: '仅 PUT 返回：关键字段是否有变更（不再回退审核状态）' },
        },
      },
      ArtistApplyRequest: {
        type: 'object',
        description: '仅 name、city 必填；其余选填，可先完善基础资料后再补充作品与实名信息',
        required: ['name', 'city', 'agreed'],
        properties: {
          name: { type: 'string', example: '林小满' },
          city: { type: 'string', example: '上海' },
          district: { type: 'string', nullable: true },
          years: { type: 'integer', example: 5, description: '选填，0–60' },
          styles: {
            type: 'array',
            maxItems: 3,
            description: '选填，最多 3 个',
            items: { type: 'string', example: 'fresh' },
          },
          intro: { type: 'string', maxLength: 500 },
          idCard: { type: 'string', description: '选填，18 位身份证号；PUT 时可不传表示不修改' },
          works: {
            type: 'array',
            maxItems: 9,
            description: '选填，最多 9 个；fileId 来自 /api/upload/sign',
            items: {
              type: 'object',
              required: ['fileId'],
              properties: {
                fileId: { type: 'integer' },
                title: { type: 'string' },
                styles: { type: 'array', items: { type: 'string' } },
              },
            },
          },
          agreed: { type: 'boolean', example: true },
        },
      },
      CustomerProfile: {
        type: 'object',
        properties: {
          id: { type: 'integer', description: 'customer.id' },
          nickname: { type: 'string', nullable: true },
          city: { type: 'string', nullable: true },
          district: { type: 'string', nullable: true },
          status: { type: 'string', enum: ['active', 'disabled'] },
        },
      },
      Demand: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          city: { type: 'string', example: '上海' },
          district: { type: 'string', example: '静安区' },
          serviceDate: { type: 'string', example: '2026-12-01' },
          serviceType: { type: 'string', enum: ['bridal', 'daily', 'event', 'photo'] },
          headcount: { type: 'integer', example: 1 },
          budgetMin: { type: 'integer', example: 800 },
          budgetMax: { type: 'integer', example: 1500 },
          stylePrefs: { type: 'array', items: { type: 'string' } },
          remark: { type: 'string', nullable: true },
          status: { type: 'string', enum: ['pending', 'selected', 'closed'] },
          statusLabel: {
            type: 'string',
            enum: ['待响应', '已响应', '已选定', '已关闭', '已被婉拒'],
          },
          source: { type: 'string', enum: ['customer', 'ops'] },
          targetArtistId: { type: 'integer', nullable: true, description: '定向预约的目标化妆师' },
          responseCount: { type: 'integer', description: '化妆师响应数，「已响应」由该值派生' },
          expireAt: { type: 'string', format: 'date-time', nullable: true },
          closedAt: { type: 'string', format: 'date-time', nullable: true },
          declineReason: { type: 'string', nullable: true, description: '定向预约被婉拒的原因（E9-05）' },
          declinedAt: { type: 'string', format: 'date-time', nullable: true },
          createdAt: { type: 'string', format: 'date-time' },
          duplicated: { type: 'boolean', description: '仅 POST 返回：命中 5 分钟幂等窗口' },
          isTargeted: { type: 'boolean', description: '仅需求大厅返回：是否定向预约' },
          myResponseId: { type: 'integer', nullable: true, description: '仅需求大厅返回：本人响应 ID' },
          myResponseStatus: {
            type: 'string',
            nullable: true,
            enum: ['pending', 'selected', 'rejected', 'withdrawn'],
            description: '仅需求大厅返回：本人响应状态',
          },
        },
      },
      DemandRequest: {
        type: 'object',
        required: ['city', 'district', 'serviceDate', 'serviceType', 'headcount', 'budgetMin', 'budgetMax'],
        properties: {
          city: { type: 'string', example: '上海' },
          district: { type: 'string', example: '静安区' },
          serviceDate: { type: 'string', example: '2026-12-01', description: '不早于今天，最多未来 180 天' },
          serviceType: { type: 'string', enum: ['bridal', 'daily', 'event', 'photo'] },
          headcount: { type: 'integer', minimum: 1, maximum: 50, example: 1 },
          budgetMin: { type: 'integer', minimum: 0, example: 800 },
          budgetMax: { type: 'integer', minimum: 0, example: 1500 },
          stylePrefs: { type: 'array', maxItems: 5, items: { type: 'string', example: 'fresh' } },
          remark: { type: 'string', maxLength: 500 },
          targetArtistId: { type: 'integer', description: '定向预约时指定已通过审核的化妆师' },
        },
      },
      DemandResponseItem: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          demandId: { type: 'integer' },
          status: { type: 'string', enum: ['pending', 'selected', 'rejected', 'withdrawn'] },
          note: { type: 'string', nullable: true, description: '一句说明' },
          createdAt: { type: 'string', format: 'date-time' },
          artist: { $ref: '#/components/schemas/ArtistCard' },
        },
      },
      ArtistCard: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          name: { type: 'string' },
          city: { type: 'string' },
          district: { type: 'string', nullable: true },
          years: { type: 'integer' },
          styles: { type: 'array', items: { type: 'string' } },
          intro: { type: 'string', nullable: true },
          avatarUrl: { type: 'string', nullable: true },
          coverPath: { type: 'string', nullable: true, description: '作品首图签名路径，15 分钟有效' },
          worksTotal: { type: 'integer' },
          distanceKm: {
            type: 'number',
            nullable: true,
            description: '仅找化妆师列表返回；未传经纬度或化妆师未设置坐标时为 null',
          },
          nextAvailableDate: { type: 'string', nullable: true, example: '2026-12-01' },
        },
      },
      ServiceOrder: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          demandId: { type: 'integer' },
          serviceDate: { type: 'string', example: '2026-12-01' },
          serviceType: { type: 'string', enum: ['bridal', 'daily', 'event', 'photo'] },
          headcount: { type: 'integer' },
          city: { type: 'string' },
          district: { type: 'string' },
          remark: { type: 'string', nullable: true },
          status: { type: 'string', enum: ['pending', 'confirmed', 'finished', 'cancelled'] },
          statusLabel: { type: 'string', example: '待确认' },
          tone: { type: 'string', enum: ['warning', 'brand', 'success', 'neutral'] },
          initiatorRole: {
            type: 'string',
            enum: ['customer', 'artist'],
            description: '服务记录发起方：客户择一 / 化妆师接受定向预约',
          },
          artistName: { type: 'string', nullable: true },
          customerName: { type: 'string', nullable: true },
          artistConfirmed: { type: 'boolean', description: '化妆师是否已确认完成' },
          customerConfirmed: { type: 'boolean', description: '客户是否已确认完成' },
          finishState: {
            type: 'string',
            enum: ['none', 'requestable', 'confirmable', 'waiting'],
            description: '当前视角的完工确认按钮态',
          },
          canConfirm: { type: 'boolean' },
          canCancel: { type: 'boolean' },
          canReview: { type: 'boolean' },
          confirmedAt: { type: 'string', format: 'date-time', nullable: true },
          finishRequestBy: { type: 'string', enum: ['artist', 'customer'], nullable: true },
          finishRequestAt: { type: 'string', format: 'date-time', nullable: true },
          autoFinishAt: {
            type: 'string',
            format: 'date-time',
            nullable: true,
            description: '发起完工确认后 7 天自动完成的时间点',
          },
          finishTime: { type: 'string', format: 'date-time', nullable: true },
          cancelReason: { type: 'string', nullable: true },
          cancelBy: { type: 'string', enum: ['artist', 'customer'], nullable: true },
          cancelByLabel: { type: 'string', nullable: true, example: '客户取消' },
          cancelledAt: { type: 'string', format: 'date-time', nullable: true },
          myReview: { $ref: '#/components/schemas/OrderReview' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      OrderReview: {
        type: 'object',
        nullable: true,
        properties: {
          id: { type: 'integer' },
          rating: { type: 'integer', minimum: 1, maximum: 5 },
          tags: { type: 'array', items: { type: 'string' } },
          content: { type: 'string', nullable: true },
          status: { type: 'string', enum: ['visible', 'pending', 'hidden'] },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      ReviewItem: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          serviceOrderId: { type: 'integer' },
          rating: { type: 'integer', minimum: 1, maximum: 5 },
          tags: { type: 'array', items: { type: 'string' } },
          content: { type: 'string', nullable: true },
          fromRole: { type: 'string', enum: ['artist', 'customer'] },
          fromRoleLabel: { type: 'string' },
          fromName: { type: 'string' },
          fromAvatar: { type: 'string', nullable: true },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      Credit: {
        type: 'object',
        properties: {
          userId: { type: 'integer' },
          role: { type: 'string', enum: ['artist', 'customer'] },
          score: { type: 'integer', example: 0, description: '初始 0 分，完成 +2 / 取消 -5，0–100 夹紧' },
          level: { type: 'string', example: '待提升', description: '≥80 优秀 / ≥60 良好 / ≥30 一般 / else 待提升' },
          initial: { type: 'boolean', description: '尚未建档时返回初始分' },
        },
      },
      SubscribeTemplate: {
        type: 'object',
        description: '订阅消息模板与当前用户的授权状态（E11-01）',
        properties: {
          key: { type: 'string', enum: ['invitation', 'result'] },
          title: { type: 'string', example: '预约与响应通知' },
          description: { type: 'string' },
          templateId: { type: 'string', nullable: true, description: '服务端配置的微信模板 ID' },
          configured: { type: 'boolean', description: '是否已配置模板 ID' },
          accepted: { type: 'boolean', description: '用户是否已授权' },
          shouldPrompt: {
            type: 'boolean',
            description: '是否应弹窗引导；主动拒绝后 7 天内为 false',
          },
          lastPromptAt: { type: 'string', format: 'date-time', nullable: true },
          lastRejectedAt: { type: 'string', format: 'date-time', nullable: true },
        },
      },
      NotificationItem: {
        type: 'object',
        description: '站内消息 / 订阅消息发送记录（E11-02）',
        properties: {
          id: { type: 'integer' },
          type: {
            type: 'string',
            example: 'demand_response',
            description:
              'demand_targeted | demand_response | demand_accepted | order_confirmed | order_finish_requested | order_finished | order_cancelled | order_auto_finished',
          },
          title: { type: 'string' },
          content: { type: 'string' },
          page: { type: 'string', description: '点击跳转的小程序页面路径' },
          status: {
            type: 'string',
            enum: ['pending', 'sent', 'skipped', 'failed'],
            description: 'skipped 表示未授权 / 未配置，已降级为站内消息',
          },
          failReason: { type: 'string', nullable: true },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      Inbox: {
        type: 'object',
        properties: {
          unread: { type: 'integer', description: '待处理定向预约数，用作角标' },
          pending: { type: 'array', items: { $ref: '#/components/schemas/Demand' } },
          handled: {
            type: 'array',
            items: {
              allOf: [
                { $ref: '#/components/schemas/Demand' },
                {
                  type: 'object',
                  properties: {
                    handledStatus: { type: 'string', enum: ['accepted', 'declined'] },
                  },
                },
              ],
            },
          },
          responses: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'integer' },
                status: { type: 'string', enum: ['selected', 'rejected', 'withdrawn'] },
                note: { type: 'string', nullable: true },
                createdAt: { type: 'string', format: 'date-time' },
                demand: { $ref: '#/components/schemas/Demand' },
              },
            },
          },
          orders: { type: 'array', items: { $ref: '#/components/schemas/ServiceOrder' } },
        },
      },
      DemandDetail: {
        allOf: [
          { $ref: '#/components/schemas/Demand' },
          {
            type: 'object',
            properties: {
              customer: {
                type: 'object',
                properties: {
                  nickname: { type: 'string' },
                  city: { type: 'string', nullable: true },
                  district: { type: 'string', nullable: true },
                },
              },
              expired: { type: 'boolean' },
              isOwner: { type: 'boolean' },
              isTargeted: { type: 'boolean', description: '是否为定向预约（E9）' },
              targetArtist: {
                type: 'object',
                nullable: true,
                description: '被预约的化妆师（定向预约时有值）',
                properties: {
                  id: { type: 'integer' },
                  name: { type: 'string' },
                },
              },
              canRespond: { type: 'boolean' },
              respondBlockedReason: { type: 'string', nullable: true },
              canSelect: { type: 'boolean', description: '需求所属客户在有响应时可择一确认' },
              myResponse: { $ref: '#/components/schemas/DemandResponseItem' },
            },
          },
        ],
      },
      Page: {
        type: 'object',
        properties: {
          total: { type: 'integer', example: 42 },
          page: { type: 'integer', example: 1 },
          size: { type: 'integer', example: 20 },
        },
      },
      EventRequest: {
        type: 'object',
        required: ['event'],
        properties: {
          event: {
            type: 'string',
            example: 'search_artists',
            description: '小写字母 / 数字 / 下划线，3–64 位',
          },
          props: {
            type: 'object',
            additionalProperties: true,
            example: { city: '上海', styles: ['fresh'], radiusKm: 5, resultCount: 12 },
          },
        },
      },
    },
  },
  paths: {
    '/api/ping': {
      get: {
        tags: ['基础'],
        summary: '健康检查',
        responses: {
          200: {
            description: '服务信息',
            content: {
              'application/json': {
                example: {
                  code: 0,
                  message: 'ok',
                  data: { service: 'wechat-markup-api', version: '0.2.0' },
                },
              },
            },
          },
        },
      },
    },
    '/api/auth/refresh': {
      post: {
        tags: ['登录态'],
        summary: '刷新 access token',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['refreshToken'],
                properties: { refreshToken: { type: 'string' } },
              },
            },
          },
        },
        responses: {
          200: {
            description: '新的 token 对',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/TokenPair' } } },
          },
          401: errorResponse,
          403: errorResponse,
        },
      },
    },
    '/api/auth/wx-login': {
      post: {
        tags: ['登录态'],
        summary: '微信登录（code2session，首次自动建号）',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['code'],
                properties: {
                  code: { type: 'string', description: 'wx.login 返回的 code' },
                  nickname: { type: 'string' },
                  avatarUrl: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: 'token 对 + 登录态资料',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/WxSession' } } },
          },
          400: errorResponse,
        },
      },
    },
    '/api/auth/me': {
      get: {
        tags: ['登录态'],
        summary: '当前登录态（数据库资料 + 资料完善状态）',
        security: bearer,
        responses: {
          200: {
            description: '登录态资料',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/UserProfile' } } },
          },
          401: errorResponse,
        },
      },
    },
    '/api/auth/role': {
      post: {
        tags: ['登录态'],
        summary: '绑定 / 切换角色（artist | customer），重签 token',
        security: bearer,
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['role'],
                properties: { role: { type: 'string', enum: ['artist', 'customer'] } },
              },
            },
          },
        },
        responses: {
          200: {
            description: '新的 token 对 + 登录态资料',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/WxSession' } } },
          },
          400: errorResponse,
          401: errorResponse,
        },
      },
    },
    '/api/artist/apply': {
      post: {
        tags: ['资料'],
        summary: '提交个人信息（提交即生效，同时建档信用分，初始 0 分）',
        security: bearer,
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/ArtistApplyRequest' } },
          },
        },
        responses: {
          200: {
            description: '个人信息详情',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ArtistDetail' } },
            },
          },
          400: errorResponse,
          401: errorResponse,
          403: errorResponse,
          409: errorResponse,
        },
      },
    },
    '/api/artist/me': {
      get: {
        tags: ['资料'],
        summary: '我的个人信息与信用分（未建档返回 data=null）',
        security: bearer,
        responses: {
          200: {
            description: '个人信息详情',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ArtistDetail' } },
            },
          },
          401: errorResponse,
          403: errorResponse,
        },
      },
      put: {
        tags: ['资料'],
        summary: '修改个人信息（提交即生效，不回退状态、不触发审核）',
        security: bearer,
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/ArtistApplyRequest' } },
          },
        },
        responses: {
          200: {
            description: '个人信息详情 + keyChanged',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ArtistDetail' } },
            },
          },
          400: errorResponse,
          401: errorResponse,
          403: errorResponse,
          404: errorResponse,
        },
      },
    },
    '/api/customer/me': {
      get: {
        tags: ['客户'],
        summary: '我的客户资料（首次调用自动建档；客户免资质审核）',
        security: bearer,
        responses: {
          200: {
            description: '客户资料',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/CustomerProfile' } } },
          },
          401: errorResponse,
          403: errorResponse,
        },
      },
      put: {
        tags: ['客户'],
        summary: '修改客户资料（昵称 / 城市 / 区域）',
        security: bearer,
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  nickname: { type: 'string', maxLength: 32 },
                  city: { type: 'string', maxLength: 32 },
                  district: { type: 'string', maxLength: 32 },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: '更新后的客户资料',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/CustomerProfile' } } },
          },
          400: errorResponse,
          401: errorResponse,
          403: errorResponse,
        },
      },
    },
    '/api/demands': {
      post: {
        tags: ['需求'],
        summary: '发布需求（5 分钟同内容幂等，每日上限 5 条）',
        security: bearer,
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/DemandRequest' } },
          },
        },
        responses: {
          200: {
            description: '创建结果（duplicated=true 表示命中幂等窗口）',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Demand' } } },
          },
          400: errorResponse,
          401: errorResponse,
          403: errorResponse,
          429: { description: '每日发布条数超限（code=42900）' },
        },
      },
      get: {
        tags: ['需求'],
        summary: '需求列表：scope=mine 我的需求（四态筛选）/ scope=hall 需求大厅',
        security: bearer,
        parameters: [
          { name: 'scope', in: 'query', schema: { type: 'string', enum: ['mine', 'hall'], default: 'mine' } },
          {
            name: 'status',
            in: 'query',
            schema: { type: 'string', enum: ['pending', 'responded', 'selected', 'closed'] },
            description: '仅 scope=mine 有效；pending 待响应 / responded 已响应',
          },
          { name: 'city', in: 'query', schema: { type: 'string' }, description: '仅 scope=hall 有效' },
          {
            name: 'serviceType',
            in: 'query',
            schema: { type: 'string', enum: ['bridal', 'daily', 'event', 'photo'] },
            description: '仅 scope=hall 有效',
          },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'size', in: 'query', schema: { type: 'integer', default: 20, maximum: 100 } },
        ],
        responses: {
          200: {
            description: '分页列表（需求大厅仅返回 pending 且未过期，按服务日期升序）',
            content: {
              'application/json': {
                allOf: [
                  { $ref: '#/components/schemas/Pagination' },
                  { type: 'object', properties: { list: { type: 'array', items: { $ref: '#/components/schemas/Demand' } } } },
                ],
              },
            },
          },
          400: errorResponse,
          401: errorResponse,
          403: errorResponse,
        },
      },
    },
    '/api/demands/{id}': {
      get: {
        tags: ['需求'],
        summary: '需求详情（游客/客户/化妆师/管理员四视角；不可见统一 404）',
        description:
          '客户仅可见自己的需求；化妆师仅可见待响应、未过期、且非定向他人的需求；管理员全可见。',
        security: [{}, ...bearer],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: {
          200: {
            description: '需求详情 + 当前登录态可执行动作',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/DemandDetail' } } },
          },
          404: errorResponse,
        },
      },
      put: {
        tags: ['需求'],
        summary: '编辑需求（仅待响应可改，重算过期时间）',
        security: bearer,
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/DemandRequest' } },
          },
        },
        responses: {
          200: {
            description: '更新后的需求',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Demand' } } },
          },
          400: errorResponse,
          401: errorResponse,
          403: errorResponse,
          404: errorResponse,
          409: errorResponse,
        },
      },
    },
    '/api/demands/{id}/close': {
      put: {
        tags: ['需求'],
        summary: '主动关闭需求（关闭后不再进入需求大厅、不可再被响应）',
        security: bearer,
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: {
          200: {
            description: '已关闭的需求',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Demand' } } },
          },
          401: errorResponse,
          403: errorResponse,
          404: errorResponse,
          409: errorResponse,
        },
      },
    },
    '/api/demands/{id}/respond': {
      post: {
        tags: ['需求'],
        summary: '响应需求（化妆师角色即可响应，停用账号除外；同人同需求只能一条）',
        security: bearer,
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: {
          required: false,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: { note: { type: 'string', maxLength: 255, description: '一句说明' } },
              },
            },
          },
        },
        responses: {
          200: {
            description: '响应结果（status 初始为 pending）',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/DemandResponseItem' },
                    { type: 'object', properties: { responseCount: { type: 'integer' } } },
                  ],
                },
              },
            },
          },
          401: errorResponse,
          403: errorResponse,
          404: errorResponse,
          409: { description: '已响应 / 已选定 / 已关闭 / 已过期（code=40900）' },
        },
      },
    },
    '/api/demands/{id}/responses': {
      get: {
        tags: ['需求'],
        summary: '响应者列表（仅需求所属客户；按响应时间升序）',
        security: bearer,
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: {
          200: {
            description: '响应列表 + 已选中响应 ID',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    total: { type: 'integer' },
                    selectedResponseId: { type: 'integer', nullable: true },
                    list: { type: 'array', items: { $ref: '#/components/schemas/DemandResponseItem' } },
                  },
                },
              },
            },
          },
          401: errorResponse,
          403: errorResponse,
          404: errorResponse,
        },
      },
    },
    '/api/demands/{id}/select': {
      post: {
        tags: ['需求'],
        summary: '择一确认（需求置 selected、其余响应置 rejected、生成待确认服务记录）',
        security: bearer,
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['responseId'],
                properties: { responseId: { type: 'integer', description: '要确认的响应 ID' } },
              },
            },
          },
        },
        responses: {
          200: {
            description: '确认结果',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    demand: { $ref: '#/components/schemas/Demand' },
                    responseId: { type: 'integer' },
                    serviceOrder: {
                      type: 'object',
                      properties: {
                        id: { type: 'integer' },
                        status: { type: 'string', enum: ['pending'] },
                      },
                    },
                  },
                },
              },
            },
          },
          400: errorResponse,
          401: errorResponse,
          403: errorResponse,
          404: errorResponse,
          409: { description: '重复择一 / 需求已处理 / 响应已处理 / 已过期（code=40900）' },
        },
      },
    },
    '/api/demands/{id}/accept': {
      post: {
        tags: ['需求'],
        summary: '接受定向预约（E9-05）：生成待确认服务记录并占用档期',
        security: bearer,
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: {
          200: {
            description: '接受结果：需求已选定 + 服务记录待确认 + 档期变已排',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    demand: { $ref: '#/components/schemas/Demand' },
                    serviceOrder: { $ref: '#/components/schemas/ServiceOrder' },
                  },
                },
              },
            },
          },
          401: errorResponse,
          403: { description: '非目标化妆师 / 未通过审核（code=40300）' },
          404: errorResponse,
          409: { description: '需求已处理 / 已过期 / 档期冲突（code=40900）' },
        },
      },
    },
    '/api/demands/{id}/decline': {
      post: {
        tags: ['需求'],
        summary: '婉拒定向预约（E9-05）：原因必填，需求置已关闭',
        security: bearer,
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['reason'],
                properties: {
                  reason: { type: 'string', maxLength: 255, example: '该日已有档期，建议换一天' },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: '婉拒后的需求（status=closed，含 declineReason）',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Demand' } } },
          },
          400: errorResponse,
          401: errorResponse,
          403: errorResponse,
          404: errorResponse,
          409: errorResponse,
        },
      },
    },
    '/api/demands/{id}/alternatives': {
      get: {
        tags: ['需求'],
        summary: '婉拒后备选推荐（E9-06）：同城、同风格、同日期可接的 3 人',
        security: bearer,
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: {
          200: {
            description: '备选化妆师卡片',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    total: { type: 'integer' },
                    list: { type: 'array', items: { $ref: '#/components/schemas/ArtistCard' } },
                  },
                },
              },
            },
          },
          401: errorResponse,
          403: errorResponse,
          404: errorResponse,
          409: { description: '需求未被婉拒（code=40900）' },
        },
      },
    },
    '/api/inbox': {
      get: {
        tags: ['需求'],
        summary: '化妆师接单中心（E9-04）：待处理 / 已处理 / 我的响应 / 服务记录',
        security: bearer,
        responses: {
          200: {
            description: '接单中心聚合数据，unread 为角标数',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Inbox' } } },
          },
          401: errorResponse,
          403: errorResponse,
        },
      },
    },
    '/api/search/artists': {
      get: {
        tags: ['搜索'],
        summary: '找化妆师（城市/区域/风格/档期日期/半径/年限筛选，仅返回已完善个人信息者）',
        parameters: [
          { name: 'city', in: 'query', schema: { type: 'string' }, example: '上海' },
          { name: 'district', in: 'query', schema: { type: 'string' } },
          {
            name: 'styles',
            in: 'query',
            schema: { type: 'string' },
            description: '风格 code，逗号分隔，命中任一即匹配',
            example: 'fresh,retro',
          },
          {
            name: 'date',
            in: 'query',
            schema: { type: 'string', example: '2026-12-01' },
            description: '指定日期时只返回该日 state=available 的化妆师',
          },
          {
            name: 'radiusKm',
            in: 'query',
            schema: { type: 'integer', enum: [3, 5, 10] },
            description: '需同时传 lat/lng，按球面距离过滤',
          },
          { name: 'yearsMin', in: 'query', schema: { type: 'integer', minimum: 0, maximum: 60 } },
          { name: 'lat', in: 'query', schema: { type: 'number' } },
          { name: 'lng', in: 'query', schema: { type: 'number' } },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'size', in: 'query', schema: { type: 'integer', default: 20, maximum: 100 } },
        ],
        responses: {
          200: {
            description: '分页列表（按距离升序 → 年限降序；无坐标时按年限降序）',
            content: {
              'application/json': {
                allOf: [
                  { $ref: '#/components/schemas/Pagination' },
                  {
                    type: 'object',
                    properties: { list: { type: 'array', items: { $ref: '#/components/schemas/ArtistCard' } } },
                  },
                ],
              },
            },
          },
          400: errorResponse,
        },
      },
    },
    '/api/events': {
      post: {
        tags: ['埋点'],
        summary: '埋点上报（未登录也可上报；失败不阻塞主流程）',
        security: [{}, ...bearer],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/EventRequest' } } },
        },
        responses: {
          200: {
            description: '落库结果',
            content: {
              'application/json': {
                schema: { type: 'object', properties: { id: { type: 'integer' } } },
              },
            },
          },
          400: errorResponse,
        },
      },
    },
    '/api/admin/stats/events': {
      get: {
        tags: ['后台'],
        summary: '埋点统计（按事件汇总；传 event + key 时按属性维度分组）',
        security: bearer,
        parameters: [
          { name: 'event', in: 'query', schema: { type: 'string' }, example: 'search_artists' },
          { name: 'key', in: 'query', schema: { type: 'string' }, example: 'city' },
          { name: 'from', in: 'query', schema: { type: 'string', example: '2026-11-01' } },
          { name: 'to', in: 'query', schema: { type: 'string', example: '2026-11-19' } },
        ],
        responses: {
          200: {
            description: '事件统计结果',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    from: { type: 'string' },
                    to: { type: 'string' },
                    total: { type: 'integer' },
                    byEvent: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: { event: { type: 'string' }, count: { type: 'integer' } },
                      },
                    },
                    dimension: {
                      type: 'object',
                      nullable: true,
                      properties: {
                        key: { type: 'string' },
                        values: {
                          type: 'array',
                          items: {
                            type: 'object',
                            properties: { value: { type: 'string' }, count: { type: 'integer' } },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          400: errorResponse,
          403: errorResponse,
        },
      },
    },
    '/api/admin/stats/dashboard': {
      get: {
        tags: ['后台'],
        summary: '数据看板（E13-03）：6 个核心指标 + 按日趋势 + 运营待办计数',
        description:
          '指标口径与 PRD 第 1 章一致；比率均为 0–1 的小数（responseRate / completionRate / retentionD7）。' +
          '区间含当天时先实时聚合今天；缺失日期补 0；单次最多 90 天。',
        security: bearer,
        parameters: [
          {
            name: 'from',
            in: 'query',
            schema: { type: 'string', example: '2026-11-12' },
            description: '开始日期 YYYY-MM-DD，默认 to - 13 天',
          },
          {
            name: 'to',
            in: 'query',
            schema: { type: 'string', example: '2026-11-25' },
            description: '结束日期 YYYY-MM-DD，默认今天',
          },
        ],
        responses: {
          200: {
            description: '看板数据',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    from: { type: 'string' },
                    to: { type: 'string' },
                    days: { type: 'integer' },
                    totals: {
                      type: 'object',
                      description: '区间汇总；比率按分母加权',
                      properties: {
                        registrations: { type: 'integer' },
                        artistPageUv: { type: 'integer' },
                        demands: { type: 'integer' },
                        responses: { type: 'integer' },
                        responseRate: { type: 'number', example: 0.6667 },
                        serviceOrders: { type: 'integer' },
                        completionRate: { type: 'number', example: 0.5 },
                        retentionD7: { type: 'number', example: 0.25 },
                      },
                    },
                    series: {
                      type: 'array',
                      description: '逐日指标，日期升序，缺失日期补 0',
                      items: {
                        type: 'object',
                        properties: {
                          date: { type: 'string', example: '2026-11-25' },
                          registrations: { type: 'integer' },
                          artistPageUv: { type: 'integer' },
                          demands: { type: 'integer' },
                          responses: { type: 'integer' },
                          responseRate: { type: 'number' },
                          serviceOrders: { type: 'integer' },
                          completionRate: { type: 'number' },
                          retentionD7: { type: 'number' },
                        },
                      },
                    },
                    counts: {
                      type: 'object',
                      description: '运营待办计数（全量，不受时间区间影响）',
                      properties: {
                        pendingArtists: { type: 'integer' },
                        disabledUsers: { type: 'integer' },
                        pendingOrders: { type: 'integer' },
                        finishedOrders: { type: 'integer' },
                      },
                    },
                  },
                },
              },
            },
          },
          400: errorResponse,
          401: errorResponse,
          403: errorResponse,
        },
      },
    },
    '/api/admin/stats/aggregate': {
      post: {
        tags: ['后台'],
        summary: '手动重跑每日聚合（E13-02）：单日或区间，幂等',
        description:
          '`date` 与 `from/to` 互斥；区间最多 90 天；不可聚合未来日期。重跑同一天结果一致。仅 super / admin 可调用。',
        security: bearer,
        requestBody: {
          required: false,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  date: { type: 'string', example: '2026-11-24' },
                  from: { type: 'string', example: '2026-11-18' },
                  to: { type: 'string', example: '2026-11-24' },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: '聚合结果',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    days: { type: 'integer' },
                    rows: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          date: { type: 'string' },
                          registrations: { type: 'integer' },
                          artistPageUv: { type: 'integer' },
                          demands: { type: 'integer' },
                          responses: { type: 'integer' },
                          responseRate: { type: 'number' },
                          serviceOrders: { type: 'integer' },
                          completionRate: { type: 'number' },
                          retentionD7: { type: 'number' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          400: errorResponse,
          401: errorResponse,
          403: errorResponse,
        },
      },
    },
    '/api/admin/audits/artists/{id}/approve': {
      post: {
        tags: ['后台'],
        summary: '审核通过化妆师（仅 pending 可操作，写 audit_log）',
        security: bearer,
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: {
          200: { description: '审核结果', content: { 'application/json': { example: { id: 1, status: 'approved', auditAt: '2026-11-19T08:00:00.000Z' } } } },
          401: errorResponse,
          403: errorResponse,
          404: errorResponse,
          409: errorResponse,
        },
      },
    },
    '/api/admin/audits/artists/{id}/reject': {
      post: {
        tags: ['后台'],
        summary: '审核驳回化妆师（驳回原因必填，写 audit_log）',
        security: bearer,
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['reason'],
                properties: { reason: { type: 'string', example: '作品数量不足，请补充 6 张以上' } },
              },
            },
          },
        },
        responses: {
          200: { description: '审核结果' },
          400: errorResponse,
          401: errorResponse,
          403: errorResponse,
          404: errorResponse,
          409: errorResponse,
        },
      },
    },
    '/api/admin/auth/login': {
      post: {
        tags: ['后台'],
        summary: '后台账号登录（连续 5 次失败锁定 10 分钟）',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['username', 'password'],
                properties: {
                  username: { type: 'string', example: 'admin' },
                  password: { type: 'string', example: 'Admin@123456' },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: 'token 对 + 账号信息',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/TokenPair' },
                    {
                      type: 'object',
                      properties: { admin: { $ref: '#/components/schemas/AdminInfo' } },
                    },
                  ],
                },
              },
            },
          },
          401: errorResponse,
          403: errorResponse,
          423: errorResponse,
        },
      },
    },
    '/api/admin/auth/me': {
      get: {
        tags: ['后台'],
        summary: '后台当前账号',
        security: bearer,
        responses: { 200: { description: '账号信息' }, 401: errorResponse, 403: errorResponse },
      },
    },
    '/api/admin/audits/artists': {
      get: {
        tags: ['后台'],
        summary: '化妆师审核列表（E12-02）：状态筛选 / 关键字 / 分页，待审核默认置顶',
        security: bearer,
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'size', in: 'query', schema: { type: 'integer', default: 20 } },
          {
            name: 'status',
            in: 'query',
            schema: { type: 'string', enum: ['pending', 'approved', 'rejected', 'disabled'] },
          },
          { name: 'keyword', in: 'query', schema: { type: 'string' }, example: '林小满' },
          { name: 'city', in: 'query', schema: { type: 'string' }, example: '上海' },
        ],
        responses: {
          200: {
            description: '分页结果 + counts{all,pending,approved,rejected,disabled}',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Pagination' } } },
          },
          401: errorResponse,
          403: errorResponse,
        },
      },
    },
    '/api/admin/audits/artists/export': {
      get: {
        tags: ['后台'],
        summary: '导出化妆师审核列表 xlsx（E12-10，最多 2000 条，中文不乱码）',
        security: bearer,
        parameters: [
          { name: 'status', in: 'query', schema: { type: 'string' } },
          { name: 'keyword', in: 'query', schema: { type: 'string' } },
        ],
        responses: {
          200: {
            description: 'xlsx 二进制',
            content: {
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': {
                schema: { type: 'string', format: 'binary' },
              },
            },
          },
          401: errorResponse,
          403: errorResponse,
        },
      },
    },
    '/api/admin/artists/options': {
      get: {
        tags: ['后台'],
        summary: '已通过审核化妆师下拉（E12-07 代响应选人）',
        security: bearer,
        parameters: [{ name: 'keyword', in: 'query', schema: { type: 'string' } }],
        responses: { 200: { description: 'list[]' }, 401: errorResponse, 403: errorResponse },
      },
    },
    '/api/admin/audits/artists/{id}': {
      get: {
        tags: ['后台'],
        summary: '化妆师审核详情（E12-03）：脱敏身份证 / 作品预览 / 操作流水',
        security: bearer,
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: {
          200: { description: '详情' },
          401: errorResponse,
          403: errorResponse,
          404: errorResponse,
        },
      },
    },
    '/api/admin/audits/artists/{id}/reveal': {
      post: {
        tags: ['后台'],
        summary: '解密查看身份证明文（E12-03）：写 audit_log(action=reveal) 留痕',
        security: bearer,
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: {
          200: { description: 'idCard 明文' },
          401: errorResponse,
          403: errorResponse,
          404: errorResponse,
        },
      },
    },
    '/api/admin/audits/artists/batch': {
      post: {
        tags: ['后台'],
        summary: '批量通过 / 驳回（E12-10）：逐条独立事务，返回成功与失败明细',
        security: bearer,
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['ids', 'action'],
                properties: {
                  ids: { type: 'array', items: { type: 'integer' }, maxItems: 50 },
                  action: { type: 'string', enum: ['approve', 'reject'] },
                  reason: { type: 'string', description: '驳回时必填（≥2 字）' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'success[] / failed[] / total' },
          400: errorResponse,
          401: errorResponse,
          403: errorResponse,
        },
      },
    },
    '/api/admin/users': {
      get: {
        tags: ['后台'],
        summary: '用户列表（E12-04）：化妆师 / 客户统一视图，按角色与状态筛选',
        security: bearer,
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'size', in: 'query', schema: { type: 'integer', default: 20 } },
          { name: 'role', in: 'query', schema: { type: 'string', enum: ['artist', 'customer'] } },
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['active', 'disabled'] } },
          { name: 'keyword', in: 'query', schema: { type: 'string' } },
        ],
        responses: {
          200: { description: '分页结果 + counts{all,artist,customer,disabled}' },
          401: errorResponse,
          403: errorResponse,
        },
      },
    },
    '/api/admin/customers/options': {
      get: {
        tags: ['后台'],
        summary: '客户下拉（E12-07 代发布选人）',
        security: bearer,
        parameters: [{ name: 'keyword', in: 'query', schema: { type: 'string' } }],
        responses: { 200: { description: 'list[]' }, 401: errorResponse, 403: errorResponse },
      },
    },
    '/api/admin/users/{id}/status': {
      post: {
        tags: ['后台'],
        summary: '封禁 / 解封（E12-04）：同步 artist / customer 档案并写 audit_log',
        security: bearer,
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['status'],
                properties: {
                  status: { type: 'string', enum: ['active', 'disabled'] },
                  reason: { type: 'string', description: '封禁时必填（≥2 字）' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: '结果' },
          400: errorResponse,
          401: errorResponse,
          403: errorResponse,
          404: errorResponse,
        },
      },
    },
    '/api/admin/demands': {
      get: {
        tags: ['后台'],
        summary: '需求列表（E12-05）：状态 / 城市 / 类型 / 来源 / 时间 / 关键字',
        security: bearer,
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'size', in: 'query', schema: { type: 'integer', default: 20 } },
          { name: 'status', in: 'query', schema: { type: 'string' } },
          { name: 'city', in: 'query', schema: { type: 'string' } },
          { name: 'serviceType', in: 'query', schema: { type: 'string' } },
          { name: 'source', in: 'query', schema: { type: 'string', enum: ['customer', 'ops'] } },
          { name: 'from', in: 'query', schema: { type: 'string', example: '2026-11-01' } },
          { name: 'to', in: 'query', schema: { type: 'string', example: '2026-11-24' } },
          { name: 'keyword', in: 'query', schema: { type: 'string' } },
        ],
        responses: { 200: { description: '分页结果 + counts' }, 401: errorResponse, 403: errorResponse },
      },
      post: {
        tags: ['后台'],
        summary: '运营代发布需求（E12-07）：source=ops，可指定客户与定向化妆师',
        security: bearer,
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: [
                  'customerId',
                  'city',
                  'district',
                  'serviceDate',
                  'serviceType',
                  'headcount',
                  'budgetMin',
                  'budgetMax',
                ],
                properties: {
                  customerId: { type: 'integer', description: '需求所属客户 id（须为正常状态）' },
                  city: { type: 'string' },
                  district: { type: 'string' },
                  serviceDate: { type: 'string', example: '2026-12-06', description: '不得早于今天，最多未来 180 天' },
                  serviceType: { type: 'string', enum: ['bridal', 'daily', 'event', 'photo'] },
                  headcount: { type: 'integer', minimum: 1, maximum: 50 },
                  budgetMin: { type: 'integer', minimum: 0, maximum: 100000 },
                  budgetMax: { type: 'integer', minimum: 0, maximum: 100000, description: '需 ≥ budgetMin' },
                  stylePrefs: { type: 'array', items: { type: 'string' }, description: '最多 5 个风格' },
                  remark: { type: 'string', description: '备注，最多 500 字' },
                  targetArtistId: { type: 'integer', description: '可选：定向预约，须为已通过且当日可接的化妆师' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: '创建结果（source=ops）' },
          400: errorResponse,
          401: errorResponse,
          403: errorResponse,
        },
      },
    },
    '/api/admin/demands/{id}': {
      get: {
        tags: ['后台'],
        summary: '需求详情（E12-05）：响应列表（含 source）/ 最终选定者 / 服务记录',
        security: bearer,
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: {
          200: { description: '详情' },
          401: errorResponse,
          403: errorResponse,
          404: errorResponse,
        },
      },
    },
    '/api/admin/demands/{id}/responses': {
      post: {
        tags: ['后台'],
        summary: '运营代响应（E12-07）：写 demand_response.source=ops',
        security: bearer,
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['artistId'],
                properties: {
                  artistId: { type: 'integer' },
                  price: { type: 'integer' },
                  message: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: '结果' },
          400: errorResponse,
          401: errorResponse,
          403: errorResponse,
          404: errorResponse,
          409: errorResponse,
        },
      },
    },
    '/api/admin/service-orders': {
      get: {
        tags: ['后台'],
        summary: '服务记录列表（E12-06）：状态 / 城市 / 类型 / 时间 / 关键字',
        security: bearer,
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'size', in: 'query', schema: { type: 'integer', default: 20 } },
          { name: 'status', in: 'query', schema: { type: 'string' } },
          { name: 'city', in: 'query', schema: { type: 'string' } },
          { name: 'serviceType', in: 'query', schema: { type: 'string' } },
          { name: 'from', in: 'query', schema: { type: 'string', example: '2026-11-01' } },
          { name: 'to', in: 'query', schema: { type: 'string', example: '2026-11-24' } },
          { name: 'keyword', in: 'query', schema: { type: 'string' } },
        ],
        responses: { 200: { description: '分页结果 + counts' }, 401: errorResponse, 403: errorResponse },
      },
    },
    '/api/admin/service-orders/{id}': {
      get: {
        tags: ['后台'],
        summary: '服务记录完整链路（E12-06）：需求 → 响应 → 服务记录 → 评价',
        security: bearer,
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: {
          200: { description: '链路详情' },
          401: errorResponse,
          403: errorResponse,
          404: errorResponse,
        },
      },
    },
    '/api/admin/portfolios': {
      get: {
        tags: ['后台'],
        summary: '作品列表（E12-08）：状态 / 化妆师 / 关键字筛选',
        security: bearer,
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'size', in: 'query', schema: { type: 'integer', default: 20 } },
          { name: 'status', in: 'query', schema: { type: 'string' } },
          { name: 'artistId', in: 'query', schema: { type: 'integer' } },
          { name: 'keyword', in: 'query', schema: { type: 'string' } },
        ],
        responses: {
          200: { description: '分页结果 + counts{all,pending,online,offline,rejected}' },
          401: errorResponse,
          403: errorResponse,
        },
      },
    },
    '/api/admin/portfolios/{id}/status': {
      post: {
        tags: ['后台'],
        summary: '作品违规下架 / 恢复（E12-08）：写 audit_log',
        security: bearer,
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['action'],
                properties: {
                  action: { type: 'string', enum: ['offline', 'restore'] },
                  reason: { type: 'string', description: '下架时必填（≥2 字）' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: '结果' },
          400: errorResponse,
          401: errorResponse,
          403: errorResponse,
          404: errorResponse,
          409: errorResponse,
        },
      },
    },
    '/api/admin/reports': {
      get: {
        tags: ['后台'],
        summary: '举报列表（E14-04）：状态 / 对象类型 / 关键字筛选 + 状态计数',
        security: bearer,
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'size', in: 'query', schema: { type: 'integer', default: 20 } },
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['pending', 'handled', 'rejected'] } },
          { name: 'targetType', in: 'query', schema: { type: 'string', enum: ['portfolio', 'artist'] } },
          { name: 'keyword', in: 'query', schema: { type: 'string' } },
        ],
        responses: {
          200: { description: '分页结果 + counts{all,pending,handled,rejected}' },
          401: errorResponse,
          403: errorResponse,
        },
      },
    },
    '/api/admin/reports/{id}/handle': {
      post: {
        tags: ['后台'],
        summary: '举报处理（E14-04）：dismiss 未成立 / offline 下架作品 / ban 封禁账号，结果回显给举报人',
        security: bearer,
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['action'],
                properties: {
                  action: { type: 'string', enum: ['dismiss', 'offline', 'ban'] },
                  note: { type: 'string', description: '处理备注（≤255 字）' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: '结果（status + handleResult）' },
          400: errorResponse,
          401: errorResponse,
          403: errorResponse,
          404: errorResponse,
          409: errorResponse,
        },
      },
    },
    '/api/reports': {
      post: {
        tags: ['小程序'],
        summary: '提交举报（E14-03）：作品 / 化妆师，同一对象 24 小时内限 1 次',
        security: bearer,
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['targetType', 'targetId', 'reason'],
                properties: {
                  targetType: { type: 'string', enum: ['portfolio', 'artist'] },
                  targetId: { type: 'integer' },
                  reason: { type: 'string', enum: ['porn', 'fraud', 'copyright', 'inappropriate', 'other'] },
                  detail: { type: 'string', description: '补充说明（≤200 字，可选）' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: '举报已受理' },
          400: errorResponse,
          401: errorResponse,
          404: errorResponse,
          409: errorResponse,
        },
      },
    },
    '/api/reports/mine': {
      get: {
        tags: ['小程序'],
        summary: '我的举报记录（E14-03/E14-04）：含处理状态与结果',
        security: bearer,
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'size', in: 'query', schema: { type: 'integer', default: 20 } },
        ],
        responses: { 200: { description: '分页结果' }, 401: errorResponse },
      },
    },
    '/api/wechat/callback': {
      get: {
        tags: ['回调'],
        summary: '微信消息推送 URL 校验（E14-01）：回显 echostr',
        responses: { 200: { description: 'echostr 原文' } },
      },
      post: {
        tags: ['回调'],
        summary: '内容安全检测结果回调（E14-01）：media_check_async 异步结果，pass → 作品上线 / 违规 → 驳回',
        responses: { 200: { description: 'success' }, 400: errorResponse },
      },
    },
    '/api/admin/audit-logs': {
      get: {
        tags: ['后台'],
        summary: '审核日志（E12-09）：只读，targetType / action / 时间 / 关键字',
        security: bearer,
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'size', in: 'query', schema: { type: 'integer', default: 20 } },
          {
            name: 'targetType',
            in: 'query',
            schema: { type: 'string', enum: ['artist', 'portfolio', 'user', 'report'] },
          },
          { name: 'action', in: 'query', schema: { type: 'string' } },
          { name: 'from', in: 'query', schema: { type: 'string', example: '2026-11-01' } },
          { name: 'to', in: 'query', schema: { type: 'string', example: '2026-11-24' } },
          { name: 'keyword', in: 'query', schema: { type: 'string' } },
        ],
        responses: {
          200: { description: '分页结果 + counts + operator{id,username,role}' },
          401: errorResponse,
          403: errorResponse,
        },
      },
    },
    '/api/upload/sign': {
      post: {
        tags: ['上传'],
        summary: '获取私有文件直传签名（15 分钟有效）',
        security: bearer,
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['scene', 'fileName', 'mimeType', 'size'],
                properties: {
                  scene: {
                    type: 'string',
                    enum: ['portfolio', 'avatar', 'license', 'id_card', 'report'],
                  },
                  fileName: { type: 'string', example: 'work-01.jpg' },
                  mimeType: { type: 'string', example: 'image/jpeg' },
                  size: { type: 'integer', example: 320000, description: '字节，<= 5MB' },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: '签名与上传地址',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/UploadSign' } } },
          },
          400: errorResponse,
          401: errorResponse,
          413: errorResponse,
          415: errorResponse,
        },
      },
    },
    '/api/files/upload': {
      put: {
        tags: ['上传'],
        summary: '按签名直传（服务端不做登录校验，仅验签）',
        parameters: [
          { name: 'key', in: 'query', required: true, schema: { type: 'string' } },
          { name: 'exp', in: 'query', required: true, schema: { type: 'integer' } },
          { name: 'sig', in: 'query', required: true, schema: { type: 'string' } },
        ],
        requestBody: {
          required: true,
          content: { 'application/octet-stream': { schema: { type: 'string', format: 'binary' } } },
        },
        responses: { 200: { description: '上传成功' }, 403: errorResponse, 413: errorResponse },
      },
    },
    '/api/files/sign': {
      get: {
        tags: ['上传'],
        summary: '换取私有文件读取签名',
        security: bearer,
        parameters: [{ name: 'fileId', in: 'query', required: true, schema: { type: 'integer' } }],
        responses: {
          200: {
            description: '签名地址',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/FileSign' } } },
          },
          401: errorResponse,
          403: errorResponse,
          404: errorResponse,
        },
      },
    },
    '/api/files/raw': {
      get: {
        tags: ['上传'],
        summary: '读取私有文件（必须携带签名，无签名 403）',
        parameters: [
          { name: 'key', in: 'query', required: true, schema: { type: 'string' } },
          { name: 'exp', in: 'query', required: true, schema: { type: 'integer' } },
          { name: 'sig', in: 'query', required: true, schema: { type: 'string' } },
        ],
        responses: {
          200: { description: '文件二进制' },
          403: errorResponse,
          404: errorResponse,
        },
      },
    },
    '/api/artist/{id}': {
      get: {
        tags: ['主页'],
        summary: '化妆师公开主页（未完善个人信息对外 404，本人 / 管理员可预览）',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: {
          200: {
            description: '主页资料 + 未来 14 天档期摘要',
            content: {
              'application/json': {
                example: {
                  id: 1,
                  name: '林小满',
                  city: '上海',
                  district: '浦东新区',
                  years: 5,
                  styles: ['fresh', 'bridal'],
                  intro: '五年新娘跟妆经验',
                  avatarUrl: null,
                  status: 'approved',
                  worksTotal: 6,
                  coverPath: '/api/files/raw?key=portfolio/1/xx.jpg&exp=1763600000&sig=xxx',
                  schedule: {
                    days: [{ date: '2026-11-19', state: 'available' }],
                    availableDays: 5,
                    nextAvailableDate: '2026-11-20',
                  },
                },
              },
            },
          },
          404: errorResponse,
        },
      },
    },
    '/api/artist/{id}/visit': {
      post: {
        tags: ['主页'],
        summary: '主页 UV 上报（同设备同自然日只计 1 次，deviceId 仅存 SHA-256）',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['deviceId'],
                properties: { deviceId: { type: 'string', minLength: 8, example: 'dev-1763600000000-abcd1234' } },
              },
            },
          },
        },
        responses: {
          200: {
            description: '去重结果与当日累计 UV',
            content: { 'application/json': { example: { deduped: false, uv: 12 } } },
          },
          400: errorResponse,
          404: errorResponse,
        },
      },
    },
    '/api/artist/{id}/qrcode': {
      get: {
        tags: ['主页'],
        summary: '生成小程序码（scene=artist_{id}，直达 pages/artist/detail/index）',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: {
          200: { description: 'PNG 图片', content: { 'image/png': { schema: { type: 'string', format: 'binary' } } } },
          404: errorResponse,
          500: errorResponse,
        },
      },
    },
    '/api/artist/{id}/portfolios': {
      get: {
        tags: ['作品'],
        summary: '作品列表（分页，sort 升序；非 approved 仅本人 / 管理员可见）',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'size', in: 'query', schema: { type: 'integer', default: 20, maximum: 100 } },
        ],
        responses: {
          200: {
            description: '分页列表 + 图片 / 视频数量统计',
            content: {
              'application/json': {
                example: {
                  list: [
                    {
                      id: 1,
                      fileId: 10,
                      type: 'image',
                      title: '森系新娘跟妆',
                      styles: ['fresh'],
                      sort: 0,
                      status: 'pending',
                      path: '/api/files/raw?key=portfolio/1/xx.jpg&exp=1763600000&sig=xxx',
                    },
                  ],
                  total: 6,
                  page: 1,
                  size: 20,
                  counts: { image: 6, video: 0, minImages: 6 },
                },
              },
            },
          },
          404: errorResponse,
        },
      },
    },
    '/api/portfolio': {
      post: {
        tags: ['作品'],
        summary: '新增作品（追加到列表末尾，status=pending）',
        security: bearer,
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['fileId'],
                properties: {
                  fileId: { type: 'integer', description: '已完成上传的作品文件 id' },
                  title: { type: 'string', maxLength: 64, example: '森系新娘跟妆' },
                  styles: { type: 'array', maxItems: 8, items: { type: 'string' } },
                },
              },
            },
          },
        },
        responses: {
          200: { description: '新作品' },
          400: errorResponse,
          401: errorResponse,
          403: errorResponse,
          404: errorResponse,
        },
      },
    },
    '/api/portfolio/{id}': {
      put: {
        tags: ['作品'],
        summary: '编辑作品（标题 / 风格）或上移下移（move=up|down 交换 sort）',
        security: bearer,
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  title: { type: 'string', maxLength: 64 },
                  styles: { type: 'array', maxItems: 8, items: { type: 'string' } },
                  move: { type: 'string', enum: ['up', 'down'] },
                },
              },
            },
          },
        },
        responses: {
          200: { description: '更新后的作品，或 { moved: false } 表示已到边界' },
          400: errorResponse,
          401: errorResponse,
          404: errorResponse,
        },
      },
      delete: {
        tags: ['作品'],
        summary: '删除作品（删除后重排 sort 为连续序号）',
        security: bearer,
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: {
          200: {
            description: '删除结果与剩余数量',
            content: { 'application/json': { example: { deleted: true, total: 5 } } },
          },
          401: errorResponse,
          404: errorResponse,
        },
      },
    },
    '/api/schedule': {
      get: {
        tags: ['档期'],
        summary: '按月查询档期（整月返回，无记录为 none）',
        security: bearer,
        parameters: [
          {
            name: 'month',
            in: 'query',
            schema: { type: 'string', pattern: '^\\d{4}-\\d{2}$', example: '2026-11' },
          },
        ],
        responses: {
          200: {
            description: '整月档期 + 汇总 + 可设置窗口',
            content: {
              'application/json': {
                example: {
                  month: '2026-11',
                  days: [{ date: '2026-11-19', weekday: 4, state: 'available', isPast: false }],
                  summary: { available: 12, booked: 3, rest: 5, none: 10 },
                  settable: { minDate: '2026-11-19', maxDate: '2027-05-18' },
                },
              },
            },
          },
          401: errorResponse,
          403: errorResponse,
          404: errorResponse,
        },
      },
      put: {
        tags: ['档期'],
        summary: '单日档期设置（available / rest / none，booked 由订单占用）',
        security: bearer,
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['date', 'state'],
                properties: {
                  date: { type: 'string', example: '2026-11-20' },
                  state: { type: 'string', enum: ['available', 'rest', 'none'] },
                },
              },
            },
          },
        },
        responses: {
          200: { description: '设置结果' },
          400: errorResponse,
          401: errorResponse,
          403: errorResponse,
          404: errorResponse,
          409: { description: '该日已被订单占用，不可手工修改' },
        },
      },
    },
    '/api/schedule/batch': {
      put: {
        tags: ['档期'],
        summary: '批量设置（日期数组或日期段 + 星期组合，已占用日期自动跳过）',
        security: bearer,
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['state'],
                properties: {
                  state: { type: 'string', enum: ['available', 'rest'] },
                  dates: { type: 'array', maxItems: 92, items: { type: 'string' } },
                  startDate: { type: 'string', example: '2026-11-20' },
                  endDate: { type: 'string', example: '2026-12-20' },
                  weekdays: {
                    type: 'array',
                    items: { type: 'integer', minimum: 0, maximum: 6 },
                    description: '0 = 周日；不传表示每天都选',
                  },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: '更新与跳过数量',
            content: { 'application/json': { example: { updated: 20, skipped: 2 } } },
          },
          400: errorResponse,
          401: errorResponse,
          403: errorResponse,
          404: errorResponse,
        },
      },
    },
    '/api/admin/stats/artist-uv': {
      get: {
        tags: ['后台'],
        summary: '按日期查询主页 UV（默认今天，含 UV 最高的 Top 20 化妆师）',
        security: bearer,
        parameters: [
          {
            name: 'date',
            in: 'query',
            schema: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', example: '2026-11-19' },
          },
        ],
        responses: {
          200: {
            description: '日期、总 UV 与 Top 榜单',
            content: {
              'application/json': {
                example: {
                  date: '2026-11-19',
                  totalUv: 86,
                  statsUv: 86,
                  topArtists: [{ artistId: 1, name: '林小满', city: '上海', uv: 12 }],
                },
              },
            },
          },
          400: errorResponse,
          401: errorResponse,
          403: errorResponse,
        },
      },
    },
    '/api/service-orders': {
      get: {
        tags: ['服务记录'],
        summary: '我的服务记录列表（客户 / 化妆师共用，四态筛选 + 各状态计数）',
        security: bearer,
        parameters: [
          {
            name: 'status',
            in: 'query',
            schema: { type: 'string', enum: ['pending', 'confirmed', 'finished', 'cancelled'] },
          },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'size', in: 'query', schema: { type: 'integer', default: 20, maximum: 100 } },
        ],
        responses: {
          200: {
            description: '分页列表 + counts（all / 四态）',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/Page' },
                    {
                      type: 'object',
                      properties: {
                        list: {
                          type: 'array',
                          items: { $ref: '#/components/schemas/ServiceOrder' },
                        },
                        counts: {
                          type: 'object',
                          properties: {
                            all: { type: 'integer' },
                            pending: { type: 'integer' },
                            confirmed: { type: 'integer' },
                            finished: { type: 'integer' },
                            cancelled: { type: 'integer' },
                          },
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
          401: errorResponse,
          403: errorResponse,
        },
      },
    },
    '/api/service-orders/{id}': {
      get: {
        tags: ['服务记录'],
        summary: '服务记录详情（当事人可见，含双方确认状态与按钮态）',
        security: bearer,
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: {
          200: {
            description: '服务记录详情',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ServiceOrder' },
              },
            },
          },
          401: errorResponse,
          403: errorResponse,
          404: errorResponse,
        },
      },
    },
    '/api/service-orders/{id}/confirm': {
      post: {
        tags: ['服务记录'],
        summary: '确认接单（待确认 → 已确认，仅非发起方）',
        security: bearer,
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: {
          200: {
            description: '更新后的服务记录',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ServiceOrder' } } },
          },
          401: errorResponse,
          403: errorResponse,
          404: errorResponse,
          409: errorResponse,
        },
      },
    },
    '/api/service-orders/{id}/finish': {
      post: {
        tags: ['服务记录'],
        summary: '完工确认（任一方发起 → 对方确认闭单；发起后 7 天自动完成）',
        security: bearer,
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: {
          200: {
            description: '更新后的服务记录（finishState 标识等待 / 已完成）',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ServiceOrder' } } },
          },
          401: errorResponse,
          403: errorResponse,
          404: errorResponse,
          409: errorResponse,
        },
      },
    },
    '/api/service-orders/{id}/cancel': {
      post: {
        tags: ['服务记录'],
        summary: '取消服务记录（原因必填，同事务释放档期，取消方信用 -5）',
        security: bearer,
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['reason'],
                properties: { reason: { type: 'string', maxLength: 255, example: '临时有事，无法前往' } },
              },
            },
          },
        },
        responses: {
          200: {
            description: '更新后的服务记录',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ServiceOrder' } } },
          },
          400: errorResponse,
          401: errorResponse,
          403: errorResponse,
          404: errorResponse,
          409: errorResponse,
        },
      },
    },
    '/api/reviews': {
      post: {
        tags: ['评价'],
        summary: '提交评价（仅已完成记录、一单一评；命中敏感词先待审）',
        security: bearer,
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['serviceOrderId', 'rating'],
                properties: {
                  serviceOrderId: { type: 'integer' },
                  rating: { type: 'integer', minimum: 1, maximum: 5 },
                  tags: { type: 'array', maxItems: 6, items: { type: 'string' } },
                  content: { type: 'string', maxLength: 500 },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: '评价状态（visible 立即展示 / pending 待审核）',
            content: {
              'application/json': {
                example: { id: 1, status: 'visible', visible: true, message: '评价已发布' },
              },
            },
          },
          400: errorResponse,
          401: errorResponse,
          403: errorResponse,
          404: errorResponse,
          409: errorResponse,
        },
      },
      get: {
        tags: ['评价'],
        summary: '评价列表（按 artistId / userId / serviceOrderId 查询，仅展示可见评价）',
        parameters: [
          { name: 'artistId', in: 'query', schema: { type: 'integer' } },
          { name: 'userId', in: 'query', schema: { type: 'integer' } },
          { name: 'serviceOrderId', in: 'query', schema: { type: 'integer' } },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'size', in: 'query', schema: { type: 'integer', default: 20, maximum: 100 } },
        ],
        responses: {
          200: {
            description: '分页列表 + 平均分',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/Page' },
                    {
                      type: 'object',
                      properties: {
                        list: {
                          type: 'array',
                          items: { $ref: '#/components/schemas/ReviewItem' },
                        },
                        avgRating: { type: 'number', nullable: true },
                      },
                    },
                  ],
                },
              },
            },
          },
          400: errorResponse,
          404: errorResponse,
        },
      },
    },
    '/api/credit/{userId}': {
      get: {
        tags: ['评价'],
        summary: '信用分与等级（公开只读）',
        parameters: [{ name: 'userId', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: {
          200: {
            description: '信用分',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Credit' } } },
          },
          404: errorResponse,
        },
      },
    },
    '/api/subscriptions': {
      get: {
        tags: ['通知'],
        summary: '订阅授权概览（E11-01）：模板配置与当前用户授权状态',
        security: bearer,
        responses: {
          200: {
            description: '模板列表；shouldPrompt=false 表示已授权或 7 天静默期内',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    templates: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/SubscribeTemplate' },
                    },
                  },
                },
              },
            },
          },
          401: errorResponse,
        },
      },
      post: {
        tags: ['通知'],
        summary: '回写小程序订阅授权结果（E11-01）：拒绝后 7 天内不再弹窗',
        security: bearer,
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['results'],
                properties: {
                  results: {
                    type: 'array',
                    minItems: 1,
                    maxItems: 2,
                    items: {
                      type: 'object',
                      required: ['key', 'status'],
                      properties: {
                        key: { type: 'string', enum: ['invitation', 'result'] },
                        status: { type: 'string', enum: ['accepted', 'rejected'] },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: '回写后的授权概览',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    templates: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/SubscribeTemplate' },
                    },
                  },
                },
              },
            },
          },
          400: errorResponse,
          401: errorResponse,
        },
      },
    },
    '/api/notifications': {
      get: {
        tags: ['通知'],
        summary: '站内消息列表（E11-02 降级通道，分页 + 各状态计数）',
        security: bearer,
        parameters: [
          {
            name: 'status',
            in: 'query',
            schema: { type: 'string', enum: ['pending', 'sent', 'skipped', 'failed'] },
          },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'size', in: 'query', schema: { type: 'integer', default: 20, maximum: 100 } },
        ],
        responses: {
          200: {
            description: '分页列表 + counts（all / 四态）',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/Page' },
                    {
                      type: 'object',
                      properties: {
                        list: {
                          type: 'array',
                          items: { $ref: '#/components/schemas/NotificationItem' },
                        },
                        counts: {
                          type: 'object',
                          properties: {
                            all: { type: 'integer' },
                            pending: { type: 'integer' },
                            sent: { type: 'integer' },
                            skipped: { type: 'integer' },
                            failed: { type: 'integer' },
                          },
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
          401: errorResponse,
        },
      },
    },
  },
}
