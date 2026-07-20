# Wanderlust Planner

Web-first trip planning with an Expo mobile app for offline routebook use.

## Apps

- `apps/web`: Next.js editor/PWA shell.
- `apps/mobile`: Expo React Native iOS/Android app shell.
- `apps/server`: Cloudflare Workers API with D1 routebook storage and R2 attachment storage.
- `packages/domain`: shared trip schemas, sorting, date, and navigation helpers.

## Verification

```powershell
npm test
npm run typecheck --workspaces --if-present
npm run build -w @wanderlust/web
npm run build:android:apk
```

Android release APK output:

```text
apps/mobile/android/app/build/outputs/apk/release/app-release.apk
```

## Cloudflare Deployment

Deployment resource names and ids are local machine config. Copy `.deploy.local.example.ps1` to `.deploy.local.ps1`, fill Cloudflare values, and keep the local file uncommitted.

Deploy commands:

```powershell
npm run migrate:server
npm run deploy:server
npm run deploy:web
```

See `AGENTS.md` for the full deployment workflow and required Cloudflare secrets.

## iOS Build Host

Remote host:

```powershell
ssh ios-build
```

The iOS build script is:

```powershell
npm run build:ios:remote
```

Diagnostic command:

```powershell
npm run diagnose:ios:remote
```

Signing diagnostic command:

```powershell
npm run verify:ios:signing
```

Current blockers:

- `ios-build` has Xcode 15.4 as its newest usable Xcode. React Native 0.86 requires Xcode >= 16.1, and App Store uploads after 2026-04-28 require Xcode 26 or later.
- The remote keychain has a valid `iPhone Distribution: Happy Elements Technology (Beijing) Limited` identity, but no provisioning profile currently matches `com.happyelements.wanderlust`.
- No detectable Xcode account or App Store Connect API key is configured for automatic provisioning.

Upgrade the remote build host to Xcode 26, then install a matching App Store provisioning profile or configure automatic provisioning credentials before expecting an IPA suitable for App Store submission.

EAS fallback is configured in `apps/mobile/eas.json`, but it still requires an Expo account plus Apple/Google store credentials before it can produce signed store artifacts.

## Store Review Readiness

- Authentication plan: Apple, Google, and email sign-in. iOS has `usesAppleSignIn` and `expo-apple-authentication` configured.
- Privacy policy requirement: publish a privacy policy URL before App Store / Google Play submission and include data use for account identity, trip content, attachments, location-assisted navigation, AI prompts, billing entitlement status, and diagnostics.
- Delete account requirement: expose an in-app delete account action before submission. The action must remove or anonymize the user profile, revoke shares, remove collaborators, delete private attachments, and cancel local offline copies.
- User-generated content controls: private/public share links can be revoked and can expire; public discovery is intentionally out of scope for the first store build.
