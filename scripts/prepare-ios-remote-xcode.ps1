param(
  [string]$Remote = $(if ($env:IOS_BUILD_HOST) { $env:IOS_BUILD_HOST } else { "ios-build" }),
  [string]$XcodeVersion = $(if ($env:IOS_XCODE_VERSION) { $env:IOS_XCODE_VERSION } else { "26.6" }),
  [int]$MinimumFreeGiB = $(if ($env:IOS_XCODE_MIN_FREE_GIB) { [int]$env:IOS_XCODE_MIN_FREE_GIB } else { 70 }),
  [switch]$Install,
  [switch]$Select
)

$ErrorActionPreference = "Stop"

$remoteScript = @'
set -e
export PATH=/usr/local/opt/node@22/bin:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin

required_version="__XCODE_VERSION__"
minimum_free_gib="__MINIMUM_FREE_GIB__"
install_requested="__INSTALL_REQUESTED__"
select_requested="__SELECT_REQUESTED__"
xcodes_bin="$HOME/tools/xcodes/xcodes"
target_app="/Applications/Xcode_${required_version}.app"

echo "host=$(hostname)"
echo "macos=$(sw_vers -productVersion)"
echo "selectedDeveloperDir=$(xcode-select -p 2>/dev/null || true)"
echo "selectedXcode=$(xcodebuild -version 2>/dev/null | tr '\n' ' ')"
echo "disk=$(df -g /Applications | tail -1)"

if [ ! -x "$xcodes_bin" ]; then
  echo "missingXcodesBinary=$xcodes_bin" >&2
  exit 20
fi

free_gib=$(df -g /Applications | awk 'NR==2 { print $4 }')
if [ -z "$free_gib" ]; then
  echo "Could not determine free disk space for /Applications." >&2
  exit 21
fi

echo "installedXcodes:"
find /Applications -maxdepth 1 -iname "Xcode*.app" -print | sort | while read -r app; do
  version=$("$app/Contents/Developer/usr/bin/xcodebuild" -version 2>/dev/null | tr '\n' ' ')
  size=$(du -sh "$app" 2>/dev/null | awk '{print $1}')
  echo "  $app | $size | $version"
done

if [ -d "$target_app" ]; then
  echo "targetXcode=installed:$target_app"
  if [ "$select_requested" = "true" ]; then
    "$xcodes_bin" select "$required_version"
    echo "selectedXcodeAfter=$("$target_app/Contents/Developer/usr/bin/xcodebuild" -version | tr '\n' ' ')"
  fi
  exit 0
fi

has_keychain_auth="false"
if security find-generic-password -s Xcodes >/dev/null 2>&1; then
  has_keychain_auth="true"
fi
has_fastlane_session="false"
if [ -n "$FASTLANE_SESSION" ]; then
  has_fastlane_session="true"
fi

echo "targetXcode=missing:$target_app"
echo "freeGiB=$free_gib"
echo "minimumFreeGiB=$minimum_free_gib"
echo "xcodesKeychainAuth=$has_keychain_auth"
echo "fastlaneSessionPresent=$has_fastlane_session"

if [ "$free_gib" -lt "$minimum_free_gib" ]; then
  echo "Not enough free disk space for Xcode $required_version. Need at least ${minimum_free_gib}GiB free on /Applications, found ${free_gib}GiB." >&2
  echo "Existing Xcode installs can be reviewed with: npm run diagnose:ios:remote" >&2
  exit 22
fi

if [ "$has_keychain_auth" != "true" ] && [ "$has_fastlane_session" != "true" ]; then
  echo "No xcodes keychain credential or FASTLANE_SESSION is available for Apple Developer downloads." >&2
  echo "Sign in on the remote host with xcodes, or set FASTLANE_SESSION and rerun with -Install." >&2
  exit 23
fi

if [ "$install_requested" != "true" ]; then
  echo "Ready to install Xcode $required_version. Rerun this script with -Install to download and install it." >&2
  exit 24
fi

install_args=(install "$required_version" --experimental-unxip --empty-trash)
if [ "$has_fastlane_session" = "true" ]; then
  install_args+=(--use-fastlane-auth)
fi
if [ "$select_requested" = "true" ]; then
  install_args+=(--select)
fi

"$xcodes_bin" "${install_args[@]}"
test -d "$target_app"
echo "installedXcode=$("$target_app/Contents/Developer/usr/bin/xcodebuild" -version | tr '\n' ' ')"
'@

$remoteScript = $remoteScript.Replace("__XCODE_VERSION__", $XcodeVersion)
$remoteScript = $remoteScript.Replace("__MINIMUM_FREE_GIB__", $MinimumFreeGiB.ToString())
$remoteScript = $remoteScript.Replace("__INSTALL_REQUESTED__", $(if ($Install) { "true" } else { "false" }))
$remoteScript = $remoteScript.Replace("__SELECT_REQUESTED__", $(if ($Select) { "true" } else { "false" }))
$encoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($remoteScript))

ssh $Remote "printf '%s' '$encoded' | base64 --decode | zsh"
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}
