$ErrorActionPreference = "Stop"

$repo = Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")
$apk = Join-Path $repo "apps/mobile/android/app/build/outputs/apk/release/app-release.apk"
$expectedPackage = "com.enakzzz.wanderlust"
$expectedVersionCode = "1"
$expectedVersionName = "0.1.0"
$aapt = Join-Path $env:LOCALAPPDATA "Android/Sdk/build-tools/36.0.0/aapt2.exe"
$apksigner = Join-Path $env:LOCALAPPDATA "Android/Sdk/build-tools/36.0.0/apksigner.bat"

if (-not (Test-Path -LiteralPath $apk)) {
  throw "APK not found: $apk"
}

if (-not (Test-Path -LiteralPath $aapt)) {
  throw "aapt2 not found: $aapt"
}
if (-not (Test-Path -LiteralPath $apksigner)) {
  throw "apksigner not found: $apksigner"
}

$badging = & $aapt dump badging $apk
$packageLine = $badging | Select-String -Pattern "^package:" | Select-Object -First 1
if (-not $packageLine) {
  throw "Could not read package metadata from APK"
}

$line = $packageLine.ToString()
if ($line -notmatch "name='$expectedPackage'") {
  throw "Unexpected APK package. Expected $expectedPackage. Metadata: $line"
}
if ($line -notmatch "versionCode='$expectedVersionCode'") {
  throw "Unexpected APK versionCode. Expected $expectedVersionCode. Metadata: $line"
}
if ($line -notmatch "versionName='$expectedVersionName'") {
  throw "Unexpected APK versionName. Expected $expectedVersionName. Metadata: $line"
}

$certs = & $apksigner verify --print-certs $apk
if ($LASTEXITCODE -ne 0) {
  throw "APK signature verification failed"
}
$certText = $certs -join "`n"
if ($certText -match "CN=Android Debug") {
  throw "APK is signed with the Android debug certificate. Generate and use a release upload keystore before publishing."
}
$sha256Line = $certs | Select-String -Pattern "Signer #1 certificate SHA-256 digest:" | Select-Object -First 1
if (-not $sha256Line) {
  throw "Could not read APK signing certificate SHA-256 digest"
}

$info = Get-Item -LiteralPath $apk
[PSCustomObject]@{
  Apk = $info.FullName
  Package = $expectedPackage
  VersionCode = $expectedVersionCode
  VersionName = $expectedVersionName
  SigningCertificateSha256 = ($sha256Line.ToString() -replace "^.*digest:\s*", "")
  Bytes = $info.Length
  LastWriteTime = $info.LastWriteTime
}
