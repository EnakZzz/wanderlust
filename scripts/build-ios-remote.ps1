$ErrorActionPreference = "Stop"

$remote = if ($env:IOS_BUILD_HOST) { $env:IOS_BUILD_HOST } else { "ios-build" }
$remoteDir = if ($env:IOS_BUILD_DIR) { $env:IOS_BUILD_DIR } else { "~/wanderlust-trip-planner" }
$localArtifactDir = if ($env:IOS_ARTIFACT_DIR) {
  $env:IOS_ARTIFACT_DIR
} else {
  Join-Path (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")) "artifacts/ios"
}
$remoteIpa = "/tmp/wanderlust-ios-export/WanderlustPlanner.ipa"

$preflightScript = @'
set -e
export PATH=$HOME/.local/node/bin:/usr/local/opt/node@22/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin
export LANG=en_US.UTF-8
export LC_ALL=en_US.UTF-8

for candidate in /Applications/Xcode_26*.app(N) /Applications/Xcode_16*.app(N) /Applications/Xcode_15.4.app(N); do
  if [ -d "$candidate/Contents/Developer" ]; then
    export DEVELOPER_DIR="$candidate/Contents/Developer"
    break
  fi
done

XCODE_VERSION=$(xcodebuild -version | awk "/Xcode/{print \$2}")
XCODE_MAJOR=${XCODE_VERSION%%.*}
XCODE_MINOR_PART=${XCODE_VERSION#*.}
XCODE_MINOR=${XCODE_MINOR_PART%%.*}

if [ "$XCODE_MAJOR" -lt 16 ] || { [ "$XCODE_MAJOR" -eq 16 ] && [ "$XCODE_MINOR" -lt 1 ]; }; then
  echo "iOS build host has Xcode $XCODE_VERSION, but React Native 0.86 requires Xcode >= 16.1." >&2
  echo "Run npm run diagnose:ios:remote for details. Install Xcode 26 on the remote host before producing an App Store-ready IPA." >&2
  exit 12
fi

if [ "${IOS_REQUIRE_XCODE_26:-0}" = "1" ] && [ "$XCODE_MAJOR" -lt 26 ]; then
  echo "This build host has Xcode $XCODE_VERSION. App Store upload mode requires Xcode 26 or later." >&2
  echo "Run npm run prepare:ios:remote with IOS_XCODE_VERSION set when App Store upload signing is ready." >&2
  exit 13
fi
'@

$preflightEncoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($preflightScript))
ssh $remote "printf '%s' '$preflightEncoded' | base64 --decode | zsh"
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

if ($env:IOS_SKIP_SYNC -ne "1") {
  & (Join-Path $PSScriptRoot "sync-ios-remote.ps1") -Remote $remote -RemoteDir $remoteDir
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }
}

& (Join-Path $PSScriptRoot "verify-ios-remote-signing.ps1") -Remote $remote
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

$remoteScript = @'
set -e
export PATH=$HOME/.local/node/bin:/usr/local/opt/node@22/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin
export LANG=en_US.UTF-8
export LC_ALL=en_US.UTF-8

for candidate in /Applications/Xcode_26*.app(N) /Applications/Xcode_16*.app(N) /Applications/Xcode_15.4.app(N); do
  if [ -d "$candidate/Contents/Developer" ]; then
    export DEVELOPER_DIR="$candidate/Contents/Developer"
    break
  fi
done

XCODE_VERSION=$(xcodebuild -version | awk "/Xcode/{print \$2}")
XCODE_MAJOR=${XCODE_VERSION%%.*}
XCODE_MINOR_PART=${XCODE_VERSION#*.}
XCODE_MINOR=${XCODE_MINOR_PART%%.*}

if [ "$XCODE_MAJOR" -lt 16 ] || { [ "$XCODE_MAJOR" -eq 16 ] && [ "$XCODE_MINOR" -lt 1 ]; }; then
  echo "iOS build host has Xcode $XCODE_VERSION, but React Native 0.86 requires Xcode >= 16.1." >&2
  echo "Run npm run diagnose:ios:remote for details. Install Xcode 26 on the remote host before producing an App Store-ready IPA." >&2
  exit 12
fi

if [ "${IOS_REQUIRE_XCODE_26:-0}" = "1" ] && [ "$XCODE_MAJOR" -lt 26 ]; then
  echo "This build host has Xcode $XCODE_VERSION. App Store upload mode requires Xcode 26 or later." >&2
  echo "Run npm run prepare:ios:remote with IOS_XCODE_VERSION set when App Store upload signing is ready." >&2
  exit 13
fi

cd __REMOTE_DIR__
npm ci
npm run test
npm run typecheck --workspaces --if-present
npm run prebuild -w @wanderlust/mobile -- --platform ios
cd apps/mobile/ios
pod install --repo-update
xcodebuild -workspace WanderlustPlanner.xcworkspace -scheme WanderlustPlanner -configuration Release -sdk iphoneos -archivePath build/WanderlustPlanner.xcarchive archive
rm -rf /tmp/wanderlust-ios-export
mkdir -p /tmp/wanderlust-ios-export
cat > /tmp/wanderlust-export-options.plist <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key>
  <string>app-store-connect</string>
  <key>signingStyle</key>
  <string>automatic</string>
  <key>stripSwiftSymbols</key>
  <true/>
  <key>uploadBitcode</key>
  <false/>
  <key>uploadSymbols</key>
  <true/>
</dict>
</plist>
PLIST
xcodebuild -exportArchive -archivePath build/WanderlustPlanner.xcarchive -exportPath /tmp/wanderlust-ios-export -exportOptionsPlist /tmp/wanderlust-export-options.plist
test -f /tmp/wanderlust-ios-export/WanderlustPlanner.ipa
'@

$remoteScript = $remoteScript.Replace("__REMOTE_DIR__", $remoteDir)
$encoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($remoteScript))

ssh $remote "printf '%s' '$encoded' | base64 --decode | zsh"
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

New-Item -ItemType Directory -Path $localArtifactDir -Force | Out-Null
scp "${remote}:$remoteIpa" (Join-Path $localArtifactDir "WanderlustPlanner.ipa")
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

& (Join-Path $PSScriptRoot "verify-ios-ipa.ps1")
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}
