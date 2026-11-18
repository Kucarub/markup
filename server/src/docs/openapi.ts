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
    version: '0.3.0',
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
  },
}
