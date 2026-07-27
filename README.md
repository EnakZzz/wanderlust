# 随身路书

离线优先的旅行路书，配有网页规划器和 Expo 移动端，适合路上使用。

## 应用

- `apps/web`: Next.js 编辑器 / PWA 外壳。
- `apps/mobile`: Expo React Native iOS / Android 应用外壳。
- `apps/server`: Cloudflare Workers API，使用 D1 存路书，R2 存附件。
- `packages/domain`: 共享的行程 schema、排序、日期和导航工具。

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

GitHub Actions 会在 `Build Android APK` workflow 中构建 release APK，并上传 `wanderlust-release-apk` artifact 供下载。所需 GitHub Secrets 见 `AGENTS.md`。

## Android 发布签名

Android Play upload signing uses local ignored files. 在新构建机器上：

```powershell
Copy-Item .android-signing.local.example.ps1 .android-signing.local.ps1
```

填写 keystore 路径、store password、key alias 和 key password。要在这台机器上生成新的本地上传 keystore：

```powershell
npm run create:android:keystore
```

生成的 keystore 存在 `.local/android/` 下，密钥配置存在 `.android-signing.local.ps1`；两者都已忽略。`npm run build:android:apk`、`npm run build:android:aab` 和 `npm run build:android:release` 会在 `expo prebuild` 后注入这个签名配置，然后 `verify-android-apk.ps1` 会拒绝调试签名的 APK。

## Cloudflare 部署

生产 Web 部署由 GitHub Actions 执行：推送到 `main` 后，`.github/workflows/deploy-cloudflare-web.yml` 会同步 Cloudflare Pages secrets、执行 D1 migrations、构建 `apps/web` 并发布到 Cloudflare Pages 主域名。

GitHub Actions 需要在仓库 Secrets 中配置 Cloudflare 部署凭据、D1/R2 资源名和运行时密钥。完整清单见 `AGENTS.md`。

本地手动部署仍然可用。部署资源名和 ID 都是本机配置。把 `.deploy.local.example.ps1` 复制为 `.deploy.local.ps1`，填写 Cloudflare 值，并保持本地文件不提交。

部署命令：

```powershell
npm run migrate:server
npm run deploy:server
npm run deploy:web
```

完整部署流程和所需 Cloudflare 密钥请见 `AGENTS.md`。

部署后可检查 OAuth 状态：

```powershell
npm run verify:auth
```

Google 登录需要在 Cloudflare Pages 上配置 `GOOGLE_OAUTH_CLIENT_ID`、`GOOGLE_OAUTH_CLIENT_SECRET` 和 `SESSION_SECRET`。Apple 登录还需要 `APPLE_OAUTH_CLIENT_ID` 和 `APPLE_OAUTH_CLIENT_SECRET`；Apple secret 必须是用 Apple Developer private key、Team ID、Key ID、Service ID 和过期时间生成的 Sign in with Apple client-secret JWT。

## iOS 构建主机

远程主机别名：

```powershell
ssh ios-build
```

iOS 构建脚本：

```powershell
npm run build:ios:remote
```

诊断命令：

```powershell
npm run diagnose:ios:remote
```

签名诊断命令：

```powershell
npm run verify:ios:signing
```

当前远程主机：

- `ios-build` points to `happyelement@10.160.102.177` on this machine.
- Hostname: `LX-0101000065`
- macOS: 15.0.1
- Current selected Xcode: 16.2
- Node 22 is installed under `~/.local/node` on the remote host.
- Homebrew CocoaPods 1.17.0 is installed under `/opt/homebrew/bin/pod`.
- Homebrew xcodes 2.0.3 is installed under `/opt/homebrew/bin/xcodes`.
- Apple Developer Team ID: `VKQ556327V`
- Bundle ID: `com.enakzzz.wanderlust`
- App Store Connect App ID: `6792964279`

当前 iOS 签名状态：

- The remote keychain has a valid `Apple Distribution: QI ZUO (VKQ556327V)` identity.
- The remote host has a matching `Wanderlust Planner App Store` provisioning profile for `com.enakzzz.wanderlust`.
- `xcodeAccountHint` can still be false in SSH diagnostics, but manual distribution signing assets are installed and `npm run verify:ios:signing` is expected to pass.

当前 iOS 构建阻塞：

- Xcode 16.2 provides Swift 6.0.x, but `ExpoModulesJSI` currently resolves a Swift package that requires Swift tools 6.2.0.
- Install/select Xcode 26 before expecting `npm run build:ios:remote` to produce an IPA.
- `npm run prepare:ios:remote` can install Xcode 26 after `xcodes` is authenticated on the remote host or `FASTLANE_SESSION` is provided.

当前 Apple 登录阻塞：

- Cloudflare can expose Apple login as soon as `APPLE_OAUTH_CLIENT_ID` and `APPLE_OAUTH_CLIENT_SECRET` are configured for the Pages project.
- Apple Developer must have a Sign in with Apple-enabled Service ID whose return URL is `https://wanderlust-web.pages.dev/auth/apple/callback`.
- The native app bundle id remains `com.enakzzz.wanderlust`; the web OAuth Service ID should be a separate identifier such as `com.enakzzz.wanderlust.web`.

If signing assets are rotated, install a valid distribution certificate plus matching provisioning profile, or configure Xcode/App Store Connect credentials for automatic provisioning before expecting a signed IPA suitable for submission.

EAS fallback is configured in `apps/mobile/eas.json`, but it still requires an Expo account plus Apple/Google store credentials before it can produce signed store artifacts.

## 商店审核准备

- 认证方案：Apple、Google 和邮箱登录。iOS 已配置 `usesAppleSignIn` 和 `expo-apple-authentication`。
- 隐私政策要求：在提交 App Store / Google Play 前发布 privacy policy URL，并说明账户身份、行程内容、附件、基于定位的导航、AI 提示、计费权益状态和诊断信息的数据用途。
- 删除账号要求：在提交前提供应用内 delete account 操作。该操作必须删除或匿名化用户资料、撤销分享、移除协作者、删除私有附件，并清除本地离线副本。
- 用户生成内容控制：私有/公开分享链接都可撤销并可过期；公开发现功能在首个商店版本中有意不做。
