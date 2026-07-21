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

Remote host alias:

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

Current remote host:

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

Current iOS signing state:

- The remote keychain has a valid `Apple Distribution: QI ZUO (VKQ556327V)` identity.
- The remote host has a matching `Wanderlust Planner App Store` provisioning profile for `com.enakzzz.wanderlust`.
- `xcodeAccountHint` can still be false in SSH diagnostics, but manual distribution signing assets are installed and `npm run verify:ios:signing` is expected to pass.

Current iOS build blocker:

- Xcode 16.2 provides Swift 6.0.x, but `ExpoModulesJSI` currently resolves a Swift package that requires Swift tools 6.2.0.
- Install/select Xcode 26 before expecting `npm run build:ios:remote` to produce an IPA.
- `npm run prepare:ios:remote` can install Xcode 26 after `xcodes` is authenticated on the remote host or `FASTLANE_SESSION` is provided.

If signing assets are rotated, install a valid distribution certificate plus matching provisioning profile, or configure Xcode/App Store Connect credentials for automatic provisioning before expecting a signed IPA suitable for submission.

EAS fallback is configured in `apps/mobile/eas.json`, but it still requires an Expo account plus Apple/Google store credentials before it can produce signed store artifacts.

## Store Review Readiness

- Authentication plan: Apple, Google, and email sign-in. iOS has `usesAppleSignIn` and `expo-apple-authentication` configured.
- Privacy policy requirement: publish a privacy policy URL before App Store / Google Play submission and include data use for account identity, trip content, attachments, location-assisted navigation, AI prompts, billing entitlement status, and diagnostics.
- Delete account requirement: expose an in-app delete account action before submission. The action must remove or anonymize the user profile, revoke shares, remove collaborators, delete private attachments, and cancel local offline copies.
- User-generated content controls: private/public share links can be revoked and can expire; public discovery is intentionally out of scope for the first store build.
