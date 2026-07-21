$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "deploy-config.ps1")

$config = Get-DeployConfig
Write-CloudflareConfig -Config $config

$repo = Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")
$appJsonPath = Join-Path $repo "apps/mobile/app.json"
$easJsonPath = Join-Path $repo "apps/mobile/eas.json"
$serverWranglerPath = Join-Path $repo "apps/server/wrangler.jsonc"
$readmePath = Join-Path $repo "README.md"

if (-not (Test-Path -LiteralPath $appJsonPath)) {
  throw "Missing Expo app.json"
}
if (-not (Test-Path -LiteralPath $easJsonPath)) {
  throw "Missing EAS config"
}
if (-not (Test-Path -LiteralPath $serverWranglerPath)) {
  throw "Missing Cloudflare Worker config"
}

$app = (Get-Content -LiteralPath $appJsonPath -Raw | ConvertFrom-Json).expo
$eas = Get-Content -LiteralPath $easJsonPath -Raw | ConvertFrom-Json
$server = Get-Content -LiteralPath $serverWranglerPath -Raw | ConvertFrom-Json
$readme = if (Test-Path -LiteralPath $readmePath) { Get-Content -LiteralPath $readmePath -Raw } else { "" }

$failures = New-Object System.Collections.Generic.List[string]

if ($app.name -ne "Wanderlust Planner") { $failures.Add("expo.name must be Wanderlust Planner") }
if ($app.slug -ne "wanderlust-planner") { $failures.Add("expo.slug must be wanderlust-planner") }
if ($app.ios.bundleIdentifier -ne "com.enakzzz.wanderlust") { $failures.Add("ios.bundleIdentifier mismatch") }
if ($app.android.package -ne "com.enakzzz.wanderlust") { $failures.Add("android.package mismatch") }
if (-not $app.ios.infoPlist.NSLocationWhenInUseUsageDescription) { $failures.Add("missing NSLocationWhenInUseUsageDescription") }
if ($app.ios.infoPlist.ITSAppUsesNonExemptEncryption -ne $false) { $failures.Add("ITSAppUsesNonExemptEncryption must be false unless encryption changes") }
if (-not ($app.ios.usesAppleSignIn -eq $true)) { $failures.Add("ios.usesAppleSignIn must be true for Apple/Google/email auth") }
if (-not ($app.plugins -contains "expo-apple-authentication")) { $failures.Add("expo-apple-authentication plugin must be configured") }
if ($app.extra.apiBaseUrl -ne $config.MobileApiBaseUrl) { $failures.Add("mobile extra.apiBaseUrl must point at the configured Cloudflare Pages API") }
if ($server.name -ne $config.WorkerName) { $failures.Add("Cloudflare Worker name mismatch") }
if ($server.d1_databases[0].binding -ne "DB") { $failures.Add("Cloudflare D1 binding DB must be configured") }
if ($server.r2_buckets[0].binding -ne "ATTACHMENTS") { $failures.Add("Cloudflare R2 binding ATTACHMENTS must be configured") }
if (-not $eas.build.production.ios.image) { $failures.Add("EAS production iOS image must be configured") }
if (-not $eas.build.production.android.buildType) { $failures.Add("EAS production Android build type must be configured") }
if ($readme -notmatch "delete account") { $failures.Add("README must document the delete account requirement for review readiness") }
if ($readme -notmatch "privacy policy") { $failures.Add("README must document the privacy policy requirement for review readiness") }

if ($failures.Count -gt 0) {
  throw "Store readiness check failed: $($failures -join '; ')"
}

[PSCustomObject]@{
  AppName = $app.name
  IosBundleIdentifier = $app.ios.bundleIdentifier
  AndroidPackage = $app.android.package
  Version = $app.version
  AppleSignIn = $app.ios.usesAppleSignIn
  ApiBaseUrl = $app.extra.apiBaseUrl
  EasProductionIosImage = $eas.build.production.ios.image
  EasProductionAndroidBuildType = $eas.build.production.android.buildType
}
