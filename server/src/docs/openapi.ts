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
    version: '0.4.0',
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
          role: { type: 'string', nullable: true, enum: ['artist', 'merchant'] },
          needRoleSelect: { type: 'boolean', description: '未选角色时为 true，前端跳角色选择页' },
          phoneBound: { type: 'boolean' },
          phoneMasked: { type: 'string', example: '138****8000' },
          nickname: { type: 'string', nullable: true },
          avatarUrl: { type: 'string', nullable: true },
          profileId: { type: 'integer', nullable: true, description: 'artist.id / merchant.id' },
          profileStatus: {
            type: 'string',
            enum: ['none', 'pending', 'approved', 'rejected', 'disabled'],
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
          status: { type: 'string', enum: ['pending', 'approved', 'rejected', 'disabled'] },
          rejectReason: { type: 'string', nullable: true },
          auditAt: { type: 'string', format: 'date-time', nullable: true },
          submittedAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
          works: { type: 'array', items: { $ref: '#/components/schemas/ArtistWork' } },
          keyChanged: { type: 'boolean', description: '仅 PUT 返回：关键字段变更并回退待审核' },
        },
      },
      ArtistApplyRequest: {
        type: 'object',
        required: ['name', 'city', 'years', 'styles', 'idCard', 'works', 'agreed'],
        properties: {
          name: { type: 'string', example: '林小满' },
          city: { type: 'string', example: '上海' },
          district: { type: 'string', nullable: true },
          years: { type: 'integer', example: 5 },
          styles: {
            type: 'array',
            minItems: 1,
            maxItems: 3,
            items: { type: 'string', example: 'fresh' },
          },
          intro: { type: 'string', maxLength: 500 },
          idCard: { type: 'string', description: '18 位身份证号；PUT 时可不传表示不修改' },
          works: {
            type: 'array',
            minItems: 1,
            description: '≥6 张图片或 ≥1 个视频，fileId 来自 /api/upload/sign',
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
        summary: '当前登录态（数据库资料 + 入驻状态）',
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
        summary: '绑定 / 切换角色（artist | merchant），重签 token',
        security: bearer,
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['role'],
                properties: { role: { type: 'string', enum: ['artist', 'merchant'] } },
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
    '/api/auth/phone': {
      post: {
        tags: ['登录态'],
        summary: '手机号快速验证（getPhoneNumber code 换手机号，加密落库）',
        security: bearer,
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['code'],
                properties: { code: { type: 'string', description: 'getPhoneNumber 返回的 code' } },
              },
            },
          },
        },
        responses: {
          200: {
            description: '绑定结果',
            content: {
              'application/json': {
                example: { phoneBound: true, phoneMasked: '138****8000' },
              },
            },
          },
          400: errorResponse,
          401: errorResponse,
        },
      },
    },
    '/api/artist/apply': {
      post: {
        tags: ['入驻'],
        summary: '提交化妆师入驻（作品需先完成上传，初始状态 pending）',
        security: bearer,
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/ArtistApplyRequest' } },
          },
        },
        responses: {
          200: {
            description: '入驻资料详情',
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
        tags: ['入驻'],
        summary: '我的入驻资料与审核状态（未提交返回 data=null）',
        security: bearer,
        responses: {
          200: {
            description: '入驻资料详情',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ArtistDetail' } },
            },
          },
          401: errorResponse,
          403: errorResponse,
        },
      },
      put: {
        tags: ['入驻'],
        summary: '修改入驻资料（关键字段变更回退 pending，仅改简介不重审）',
        security: bearer,
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/ArtistApplyRequest' } },
          },
        },
        responses: {
          200: {
            description: '入驻资料详情 + keyChanged',
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
        summary: '化妆师公开主页（未通过审核对外 404，本人 / 管理员可预览）',
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
  },
}
