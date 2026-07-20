param(
  [string]$Remote = $(if ($env:IOS_BUILD_HOST) { $env:IOS_BUILD_HOST } else { "ios-build" }),
  [string]$BundleIdentifier = $(if ($env:IOS_BUNDLE_IDENTIFIER) { $env:IOS_BUNDLE_IDENTIFIER } else { "com.happyelements.wanderlust" })
)

$ErrorActionPreference = "Stop"

$remoteScript = @'
set -e
export PATH=/usr/local/opt/node@22/bin:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin

bundle_id="__BUNDLE_IDENTIFIER__"
profiles_dir="$HOME/Library/MobileDevice/Provisioning Profiles"

echo "bundleIdentifier=$bundle_id"
echo "codesigningIdentities:"
security find-identity -v -p codesigning 2>/dev/null || true

valid_distribution_count=$(security find-identity -v -p codesigning 2>/dev/null | grep -E '"(Apple Distribution|iPhone Distribution):' | grep -v 'CSSMERR_TP_CERT_REVOKED' | wc -l | tr -d ' ')
profile_count=0
matching_profile_count=0

if [ -d "$profiles_dir" ]; then
  profile_count=$(find "$profiles_dir" -maxdepth 1 -type f | wc -l | tr -d ' ')
  while IFS= read -r profile; do
    plist=$(security cms -D -i "$profile" 2>/dev/null || true)
    [ -n "$plist" ] || continue
    app_identifier=$(printf '%s' "$plist" | plutil -extract Entitlements.application-identifier raw -o - - 2>/dev/null || true)
    profile_name=$(printf '%s' "$plist" | plutil -extract Name raw -o - - 2>/dev/null || basename "$profile")
    team_prefix="${app_identifier%%.*}"
    matched_bundle="${app_identifier#${team_prefix}.}"
    if [ "$matched_bundle" = "$bundle_id" ]; then
      matching_profile_count=$((matching_profile_count + 1))
      echo "matchingProfile=$profile_name"
    fi
  done < <(find "$profiles_dir" -maxdepth 1 -type f)
fi

xcode_account_hint="false"
if defaults read com.apple.dt.Xcode DVTDeveloperAccountManager 2>/dev/null | grep -q Account; then
  xcode_account_hint="true"
fi

asc_api_key_hint="false"
if [ -n "$ASC_KEY_ID" ] && [ -n "$ASC_ISSUER_ID" ] && [ -n "$ASC_KEY_PATH" ] && [ -f "$ASC_KEY_PATH" ]; then
  asc_api_key_hint="true"
fi

echo "validDistributionIdentities=$valid_distribution_count"
echo "installedProvisioningProfiles=$profile_count"
echo "matchingProvisioningProfiles=$matching_profile_count"
echo "xcodeAccountHint=$xcode_account_hint"
echo "appStoreConnectApiKeyHint=$asc_api_key_hint"

if [ "$valid_distribution_count" -lt 1 ]; then
  echo "No valid Apple/iPhone Distribution signing identity is available in the remote keychain." >&2
  exit 31
fi

if [ "$matching_profile_count" -lt 1 ] && [ "$xcode_account_hint" != "true" ] && [ "$asc_api_key_hint" != "true" ]; then
  echo "No provisioning profile for $bundle_id and no detectable automatic provisioning credentials are available." >&2
  echo "Install a matching App Store provisioning profile, sign in to Xcode with a developer account, or configure ASC_KEY_ID/ASC_ISSUER_ID/ASC_KEY_PATH." >&2
  exit 32
fi
'@

$remoteScript = $remoteScript.Replace("__BUNDLE_IDENTIFIER__", $BundleIdentifier)
$encoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($remoteScript))
ssh $Remote "printf '%s' '$encoded' | base64 --decode | zsh"
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}
