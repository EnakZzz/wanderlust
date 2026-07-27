$ErrorActionPreference = "Stop"

$repo = Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")
$aab = Join-Path $repo "apps/mobile/android/app/build/outputs/bundle/release/app-release.aab"
$expectedPackage = "com.enakzzz.wanderlust"
$expectedVersionCode = "1"
$expectedVersionName = "0.1.0"
$bundletoolVersion = "1.18.1"
$bundletoolRoot = if ($env:LOCALAPPDATA) {
  Join-Path $env:LOCALAPPDATA "Wanderlust/bundletool"
} elseif ($env:RUNNER_TEMP) {
  Join-Path $env:RUNNER_TEMP "wanderlust-bundletool"
} else {
  Join-Path ([Environment]::GetFolderPath("UserProfile")) ".cache/wanderlust/bundletool"
}
$bundletool = Join-Path $bundletoolRoot "bundletool-all-$bundletoolVersion.jar"

if (-not (Test-Path -LiteralPath $aab)) {
  throw "AAB not found: $aab"
}
if (-not (Test-Path -LiteralPath $bundletool)) {
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $bundletool) | Out-Null
  Invoke-WebRequest -Uri "https://github.com/google/bundletool/releases/download/$bundletoolVersion/bundletool-all-$bundletoolVersion.jar" -OutFile $bundletool
}

$manifest = & java -jar $bundletool dump manifest --bundle=$aab
if ($LASTEXITCODE -ne 0) {
  throw "bundletool failed to read AAB manifest"
}

$manifestText = $manifest -join "`n"
$package = [regex]::Match($manifestText, 'package="([^"]+)"').Groups[1].Value
$versionCode = [regex]::Match($manifestText, 'android:versionCode="([^"]+)"').Groups[1].Value
$versionName = [regex]::Match($manifestText, 'android:versionName="([^"]+)"').Groups[1].Value

if ($package -ne $expectedPackage) {
  throw "Unexpected AAB package. Expected $expectedPackage, got $package"
}
if ($versionCode -ne $expectedVersionCode) {
  throw "Unexpected AAB versionCode. Expected $expectedVersionCode, got $versionCode"
}
if ($versionName -ne $expectedVersionName) {
  throw "Unexpected AAB versionName. Expected $expectedVersionName, got $versionName"
}

$info = Get-Item -LiteralPath $aab
[PSCustomObject]@{
  Aab = $info.FullName
  Package = $package
  VersionCode = $versionCode
  VersionName = $versionName
  Bytes = $info.Length
  LastWriteTime = $info.LastWriteTime
}
