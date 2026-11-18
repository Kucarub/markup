import { Router } from 'express'
import { openApiDocument } from './openapi'

export const docsRouter = Router()

/** 原始 OpenAPI JSON，便于导入 Apifox / Postman */
docsRouter.get('/api-docs/openapi.json', (_req, res) => {
  res.json(openApiDocument)
})

const html = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>妆集 API 文档</title>
    <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
    <style>
      body { margin: 0; background: #fafafa; }
      .fallback { padding: 24px; font-family: -apple-system, "PingFang SC", sans-serif; color: #4a4a4a; }
      .fallback a { color: #b4566e; }
    </style>
  </head>
  <body>
    <div id="swagger-ui"></div>
    <div class="fallback">
      若页面空白（离线环境无法加载 CDN），可直接访问
      <a href="./api-docs/openapi.json">openapi.json</a>。
    </div>
    <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
    <script>
      window.ui = SwaggerUIBundle({
        url: './api-docs/openapi.json',
        dom_id: '#swagger-ui',
        docExpansion: 'list',
        defaultModelsExpandDepth: 0,
      })
    </script>
  </body>
</html>`

docsRouter.get('/api-docs', (_req, res) => {
  res.type('html').send(html)
})
