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

Web 的 AI 功能使用 Cloudflare Pages Functions 的 Workers AI binding，`scripts/deploy-config.ps1` 会在 `apps/web/wrangler.toml` 中生成：

```toml
[ai]
binding = "AI"
```

默认文本模型在代码中配置，临时切换模型时用 Cloudflare Pages 环境变量 `WORKERS_AI_TEXT_MODEL`，不要把模型实验参数硬编码进部署脚本。

## Cloudflare Deploy

正式生产部署已经改为 GitHub Actions：推送到 `main` 后由 `.github/workflows/deploy-cloudflare-web.yml` 构建并发布 Cloudflare Pages 到 `https://wanderlust-web.pages.dev/`。本地 `npm run deploy:web` 仅作为手动兜底和诊断流程。

正常发布流程：

```powershell
git push origin main
```

推送到 `main` 后，GitHub Actions 会自动执行 typecheck、test、D1 migrations、Web build、Cloudflare Pages production deploy 和生产域名验证。除非 GitHub Actions 故障、Cloudflare 权限排查或需要紧急手动修复，否则不要在本地跑部署命令作为常规发布方式。

GitHub 仓库 `EnakZzz/wanderlust` 需要配置这些 Actions Secrets：

- `CLOUDFLARE_API_TOKEN`: Cloudflare API token，至少允许目标账号的 Pages deploy 权限。
- `CLOUDFLARE_ACCOUNT_ID`: Cloudflare Account ID。
- `CLOUDFLARE_PAGES_PROJECT_NAME`: Cloudflare Pages 项目名，当前为 `wanderlust-web`。
- `CLOUDFLARE_WORKER_NAME`: Cloudflare Worker 名，用于生成 server wrangler 配置并执行 D1 migrations。
- `CLOUDFLARE_D1_DATABASE_NAME`: D1 数据库名。
- `CLOUDFLARE_D1_DATABASE_ID`: D1 数据库 id。
- `CLOUDFLARE_R2_BUCKET_NAME`: R2 bucket 名。
- `GOOGLE_MAPS_API_KEY`: Google Maps / Places API key，CI 会同步到 Cloudflare Pages secret。
- `SESSION_SECRET`: 会话签名密钥，CI 会同步到 Cloudflare Pages secret。
- `GOOGLE_OAUTH_CLIENT_ID`: Google OAuth client id，CI 会同步到 Cloudflare Pages secret。
- `GOOGLE_OAUTH_CLIENT_SECRET`: Google OAuth client secret，CI 会同步到 Cloudflare Pages secret。
- `APPLE_OAUTH_CLIENT_ID`: Apple Service ID，CI 会同步到 Cloudflare Pages secret。
- `APPLE_OAUTH_CLIENT_SECRET`: Apple client-secret JWT，CI 会同步到 Cloudflare Pages secret。
- `AGENT_API_TOKENS`: 本地 agent token JSON，CI 会同步到 Cloudflare Pages secret。

可选 GitHub Actions Variables：

- `APP_PUBLIC_URL`: Web/Pages 的公开 URL；不配置时默认为 `https://wanderlust-web.pages.dev`。
- `WORKERS_AI_TEXT_MODEL`: 临时切换 Workers AI 文本模型；不配置时使用代码默认模型。

GitHub Actions 会在发布前把非空运行时 secret 写入 Cloudflare Pages secrets。不要把这些值写入 `.deploy.local.ps1` 以外的可提交文件，也不要写入 `wrangler.toml [vars]`。

本地手动部署前先确认 Wrangler 已登录：

```powershell
npx wrangler whoami
```

首次部署或有 D1 migration 时，本地手动执行：

```powershell
npm run migrate:server
```

部署 Web 到 Cloudflare Pages：

```powershell
npm run deploy:web
```

正式发布一律部署到主域名 `https://wanderlust-web.pages.dev/`。GitHub Actions 会显式使用 `--branch main` 发布。如果临时手动发布，也必须显式使用生产分支：

```powershell
Push-Location apps/web
npm run build
npx wrangler pages deploy out --project-name wanderlust-web --branch main
Pop-Location
```

发布后用 `Invoke-WebRequest https://wanderlust-web.pages.dev/` 或浏览器确认主域名已返回最新页面，不以 `*.wanderlust-web.pages.dev` 的预览/alias 地址作为正式发布完成标准。

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
npx wrangler pages secret put GOOGLE_MAPS_API_KEY --project-name <PagesProjectName>
npx wrangler pages secret put SESSION_SECRET --project-name <PagesProjectName>
```

Apple 登录后续接入时也按同样方式配置 Apple 相关 secret。

```powershell
npx wrangler pages secret put APPLE_OAUTH_CLIENT_ID --project-name <PagesProjectName>
npx wrangler pages secret put APPLE_OAUTH_CLIENT_SECRET --project-name <PagesProjectName>
```

`APPLE_OAUTH_CLIENT_ID` 是 Apple Developer 的 Sign in with Apple Service ID，不是 iOS Bundle ID。`APPLE_OAUTH_CLIENT_SECRET` 是用 Apple private key 生成的 client-secret JWT。配置后运行：

```powershell
npm run verify:auth
```

## Android GitHub Actions

Android release APK 由 GitHub Actions 构建：`.github/workflows/build-android-apk.yml`。推送到 `main` 且改动涉及移动端、共享包、Web build 依赖或 Android 构建脚本时会自动触发，也可以在 GitHub Actions 页面手动运行 `Build Android APK`。

构建完成后，在 workflow run 的 Artifacts 中下载：

```text
wanderlust-release-apk
```

artifact 内的 APK 路径：

```text
apps/mobile/android/app/build/outputs/apk/release/app-release.apk
```

GitHub 仓库 `EnakZzz/wanderlust` 需要配置这些 Android Actions Secrets：

- `ANDROID_UPLOAD_KEYSTORE_BASE64`: Android upload keystore 文件的 base64 内容。
- `ANDROID_UPLOAD_STORE_PASSWORD`: keystore store password。
- `ANDROID_UPLOAD_KEY_ALIAS`: upload key alias。
- `ANDROID_UPLOAD_KEY_PASSWORD`: upload key password。

本地仍使用 `.android-signing.local.ps1` 和 `.local/android/` 下的 keystore；这些文件已忽略，不提交。CI 会从 GitHub Secrets 还原 keystore 到临时 `.local/android/wanderlust-upload.keystore`，再复用 `npm run build:android:apk` 构建和 `verify-android-apk.ps1` 校验。正常下载测试包优先使用 GitHub Actions artifact，本地构建只作为诊断或离线打包兜底。

## Local Agent API

本地 Codex/agent 可以用主域名 API 直接读写路书，不需要浏览器 Cookie。正式接口一律走：

```text
https://wanderlust-web.pages.dev/
```

Cloudflare Pages secret 使用 `AGENT_API_TOKENS`，值是 JSON 数组，不提交到仓库：

```json
[
  {
    "token": "wl_agent_xxx",
    "ownerId": "google:103988743076222203305",
    "name": "Local Codex"
  }
]
```

`ownerId` 决定写入哪个账号空间。要写入当前 Google 账号，使用 D1 `users.id` 的值，例如 `google:103988743076222203305`；要让 agent 写入独立空间，可使用类似 `agent:codex` 的 ownerId。

本机 token 放在 `.local/agent-api.local.ps1`，该目录已忽略，不提交。格式：

```powershell
$AgentApi = @{
  BaseUrl = "https://wanderlust-web.pages.dev"
  Token = "wl_agent_xxx"
  OwnerId = "google:103988743076222203305"
}
```

本地 agent 操作网站接口的标准流程：

1. 先加载本地 token 配置：

```powershell
. .\.local\agent-api.local.ps1
```

2. 优先使用脚本调用接口。脚本会自动读取 `.local/agent-api.local.ps1` 并添加 `Authorization: Bearer <token>`：

```powershell
.\scripts\invoke-agent-api.ps1 -Method GET -Path /api/trips
.\scripts\invoke-agent-api.ps1 -Method POST -Path /api/ai/import -BodyFile .\artifacts\ai-import.json
.\scripts\invoke-agent-api.ps1 -Method PUT -Path /api/trips/<tripId> -BodyFile .\artifacts\trip.json
```

3. 直接调用 HTTP API 时，必须带 Bearer token：

```powershell
. .\.local\agent-api.local.ps1
$headers = @{ Authorization = "Bearer $($AgentApi.Token)" }
Invoke-WebRequest "$($AgentApi.BaseUrl)/api/trips" -Headers $headers -UseBasicParsing
```

常用接口：

```powershell
# 读取当前账号路书列表
.\scripts\invoke-agent-api.ps1 -Method GET -Path /api/trips

# 读取单个路书
.\scripts\invoke-agent-api.ps1 -Method GET -Path /api/trips/<tripId>

# 创建路书，Body 必须是完整 Trip JSON 或兼容草稿字段
.\scripts\invoke-agent-api.ps1 -Method POST -Path /api/trips -BodyFile .\artifacts\trip.json

# 更新路书
.\scripts\invoke-agent-api.ps1 -Method PUT -Path /api/trips/<tripId> -BodyFile .\artifacts\trip.json

# 删除路书
.\scripts\invoke-agent-api.ps1 -Method DELETE -Path /api/trips/<tripId>

# 把文本材料转换成 AI 路书草稿
.\scripts\invoke-agent-api.ps1 -Method POST -Path /api/ai/import -BodyFile .\artifacts\ai-import.json

# 把截图 data URL 识别成可导入文本
.\scripts\invoke-agent-api.ps1 -Method POST -Path /api/ai/ocr -BodyFile .\artifacts\ai-ocr.json
```

`/api/ai/import` 的请求示例：

```json
{
  "trip": {
    "title": "埃及红海路书",
    "destination": "埃及：开罗 / 沙姆沙伊赫",
    "startDate": "2026-10-01",
    "endDate": "2026-10-09",
    "timezone": "Africa/Cairo"
  },
  "text": "粘贴订单、邮件、截图 OCR 后的行程文本"
}
```

`/api/ai/ocr` 的请求示例：

```json
{
  "images": [
    {
      "name": "flight.png",
      "type": "image/png",
      "dataUrl": "data:image/png;base64,..."
    }
  ]
}
```
