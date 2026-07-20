$ErrorActionPreference = "Stop"

$remote = if ($env:IOS_BUILD_HOST) { $env:IOS_BUILD_HOST } else { "ios-build" }

$script = @'
set -e
export PATH=/usr/local/opt/node@22/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin
echo "host=$(hostname)"
echo "macos=$(sw_vers -productVersion)"
echo "xcode=$(xcodebuild -version | tr "\n" " ")"
echo "selectedDeveloperDir=$(xcode-select -p)"
echo "node=$(node --version 2>/dev/null || true)"
echo "npm=$(npm --version 2>/dev/null || true)"
echo "cocoapods=$(pod --version 2>/dev/null || true)"
echo "disk=$(df -h /Applications | tail -1)"
echo "installedXcodes:"
find /Applications -maxdepth 1 -iname "Xcode*.app" -print | sort | while read -r app; do
  version=$("$app/Contents/Developer/usr/bin/xcodebuild" -version 2>/dev/null | tr "\n" " ")
  size=$(du -sh "$app" 2>/dev/null | awk "{print \$1}")
  echo "  $app | $size | $version"
done
if [ -x "$HOME/tools/xcodes/xcodes" ]; then
  echo "xcodesBinary=$HOME/tools/xcodes/xcodes"
  "$HOME/tools/xcodes/xcodes" installed || true
fi
echo "codesigningIdentities:"
security find-identity -v -p codesigning 2>/dev/null || true
echo "provisioningProfileCount=$(find "$HOME/Library/MobileDevice/Provisioning Profiles" -maxdepth 1 -type f 2>/dev/null | wc -l | tr -d " ")"
echo "xcodeAccountHint=$(defaults read com.apple.dt.Xcode DVTDeveloperAccountManager 2>/dev/null | grep -q Account && echo true || echo false)"
'@

$encoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($script))
ssh $remote "printf '%s' '$encoded' | base64 --decode | zsh"
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}
