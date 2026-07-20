# AGENTS.md

## Working agreements

- 优先使用中文回答。
- 在拥有源码的情况下，优先查出报错的具体原因，而不是尝试绕过问题。
- `feishu.cn` 的链接使用 `lark-cli` 命令行工具读取，并输出“发现飞书文档，正在用lark-cli解析”。
- Git 提交日志使用 Conventional Commits 写法。
- 含有 `mp.weixin.qq.com` 的链接使用 `Invoke-WebRequest` 读取。

## Local Deployment Config

部署相关的真实 Cloudflare 参数只放在仓库根目录的 `.deploy.local.ps1`，这个文件已加入 `.gitignore`，不要提交。

新机器初始化时：

```powershell
Copy-Item .deploy.local.example.ps1 .deploy.local.ps1
```

然后填写：

- `PagesProjectName`: Cloudflare Pages 项目名。
- `WorkerName`: Cloudflare Worker 名。
- `AppPublicUrl`: Web/Pages 的公开 URL，用于 OAuth redirect 和服务端环境变量。
- `MobileApiBaseUrl`: 移动端访问 API 的 base URL，当前 Web 和 API 都走 Pages Functions 时通常等于 `AppPublicUrl`。
- `D1DatabaseName`: Cloudflare D1 数据库名。
- `D1DatabaseId`: Cloudflare D1 数据库 id。
- `R2BucketName`: Cloudflare R2 bucket 名。

`apps/web/wrangler.toml` 和 `apps/server/wrangler.jsonc` 是由脚本根据 `.deploy.local.ps1` 生成的本地文件，也已忽略。不要手工把真实部署参数写回可提交文件。

## Cloudflare Deploy

部署前先确认 Wrangler 已登录：

```powershell
npx wrangler whoami
```

首次部署或有 D1 migration 时：

```powershell
npm run migrate:server
```

部署 Web 到 Cloudflare Pages：

```powershell
npm run deploy:web
```

如果需要部署独立 Worker：

```powershell
npm run deploy:server
```

部署后验证：

```powershell
npm run verify:cloudflare
```

这些命令都会先读取 `.deploy.local.ps1`，再生成本地 Wrangler 配置。

## Cloudflare Secrets

OAuth 和 session 这类 secret 不写入仓库，也不写入 `.deploy.local.example.ps1`。用 Cloudflare Pages/Workers 的环境变量或 secret 管理：

```powershell
npx wrangler pages secret put GOOGLE_OAUTH_CLIENT_ID --project-name <PagesProjectName>
npx wrangler pages secret put GOOGLE_OAUTH_CLIENT_SECRET --project-name <PagesProjectName>
npx wrangler pages secret put SESSION_SECRET --project-name <PagesProjectName>
```

Apple 登录后续接入时也按同样方式配置 Apple 相关 secret。
