$ErrorActionPreference = "Stop"

$repo = Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")
$apk = Join-Path $repo "apps/mobile/android/app/build/outputs/apk/release/app-release.apk"
$expectedPackage = "com.enakzzz.wanderlust"
$expectedVersionCode = "1"
$expectedVersionName = "0.1.0"

function Get-AndroidSdkRoot {
  foreach ($name in @("ANDROID_HOME", "ANDROID_SDK_ROOT")) {
    $value = [Environment]::GetEnvironmentVariable($name)
    if (-not [string]::IsNullOrWhiteSpace($value) -and (Test-Path -LiteralPath $value)) {
      return $value
    }
  }
  if ($env:LOCALAPPDATA) {
    $localSdk = Join-Path $env:LOCALAPPDATA "Android/Sdk"
    if (Test-Path -LiteralPath $localSdk) { return $localSdk }
  }
  throw "Android SDK root not found. Set ANDROID_HOME or ANDROID_SDK_ROOT."
}

function Get-AndroidBuildTool {
  param([Parameter(Mandatory = $true)] [string] $BaseName)

  $sdk = Get-AndroidSdkRoot
  $buildTools = Join-Path $sdk "build-tools"
  if (-not (Test-Path -LiteralPath $buildTools)) {
    throw "Android build-tools directory not found: $buildTools"
  }

  $versions = Get-ChildItem -LiteralPath $buildTools -Directory |
    Sort-Object -Property Name -Descending
  foreach ($version in $versions) {
    foreach ($candidate in @(
      (Join-Path $version.FullName $BaseName),
      (Join-Path $version.FullName "$BaseName.exe"),
      (Join-Path $version.FullName "$BaseName.bat")
    )) {
      if (Test-Path -LiteralPath $candidate) {
        return $candidate
      }
    }
  }

  throw "Android build tool '$BaseName' not found under $buildTools"
}

$aapt = Get-AndroidBuildTool "aapt2"
$apksigner = Get-AndroidBuildTool "apksigner"

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
