# Wanderlust

Wanderlust is a private-deploy-friendly travel planning platform with a web editor and mobile app. It is built for planning trips, managing itinerary items, storing travel attachments, and keeping routebooks available across web and mobile.

## What is included

- `apps/web`: Next.js routebook editor and PWA shell.
- `apps/mobile`: Expo React Native iOS / Android app shell.
- `apps/server`: Cloudflare Workers API using D1 for routebooks and R2 for attachments.
- `packages/domain`: Shared itinerary schema, sorting, date, and navigation helpers.

## Validation

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

GitHub Actions builds the release APK in the `Build Android APK` workflow and uploads the `wanderlust-release-apk` artifact. After a successful build, it also updates the `android-latest` prerelease with a QR code for download.

## Deployment model

The web app is deployed through GitHub Actions and publishes to Cloudflare Pages after pushes to `main`.

Secrets, D1/R2 resource names, and OAuth configuration stay in GitHub Secrets or Cloudflare environment variables. They are not stored in the repository.

## Platform notes

- Android signing uses locally ignored files.
- iOS build details and host-specific signing notes are kept out of the public README.
- Private deployment notes live under `.local/private/` and are ignored by git.

## Product notes

- Apple, Google, and email sign-in are supported.
- Routebooks support private and shared travel planning flows.
- Public discovery is intentionally out of scope for the first release.

