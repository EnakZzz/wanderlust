# 随身路书

随身路书是一个支持私有部署的旅游规划平台，包含网页编辑器和移动端应用。它用于规划行程、管理路书项目、保存旅行附件，并让路书在 Web 和移动端保持一致。

## 包含内容

- `apps/web`：Next.js 路书编辑器和 PWA 外壳。
- `apps/mobile`：Expo React Native iOS / Android 应用外壳。
- `apps/server`：Cloudflare Workers API，使用 D1 存路书，R2 存附件。
- `packages/domain`：共享的行程 schema、排序、日期和导航工具。

## 验证

```powershell
npm test
npm run typecheck --workspaces --if-present
npm run build -w @wanderlust/web
npm run build:android:apk
```

Android 发布 APK 输出：

```text
apps/mobile/android/app/build/outputs/apk/release/app-release.apk
```

GitHub Actions 会在 `Build Android APK` workflow 中构建 release APK，并上传 `wanderlust-release-apk` artifact 供下载。构建成功后还会更新 `android-latest` prerelease，release notes 内带二维码，扫码可下载最新 Android APK。

## 部署方式

Web 通过 GitHub Actions 部署到 Cloudflare Pages，推送到 `main` 后会自动发布。

密钥、D1/R2 资源名和 OAuth 配置都放在 GitHub Secrets 或 Cloudflare 环境变量中，不写入仓库。

## 平台说明

- Android 签名使用本地忽略文件。
- iOS 构建细节和主机信息不放在公开 README 中。
- 私有部署说明放在 `.local/private/`，并由 git 忽略。

## 产品说明

- 支持 Apple、Google 和邮箱登录。
- 路书支持私有和分享两种旅行规划流程。
- 首个版本不做公开发现。
