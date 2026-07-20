$ErrorActionPreference = "Stop"

$repo = Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")
$ipa = if ($env:IOS_IPA_PATH) {
  $env:IOS_IPA_PATH
} else {
  Join-Path $repo "artifacts/ios/WanderlustPlanner.ipa"
}

$expectedBundleId = "com.happyelements.wanderlust"
$expectedVersion = "0.1.0"
$expectedBuild = "1"

if (-not (Test-Path -LiteralPath $ipa)) {
  throw "IPA not found: $ipa"
}

$temp = Join-Path ([IO.Path]::GetTempPath()) ("wanderlust-ipa-" + [Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $temp | Out-Null
try {
  $zip = Join-Path $temp "app.zip"
  Copy-Item -LiteralPath $ipa -Destination $zip
  Expand-Archive -LiteralPath $zip -DestinationPath $temp -Force

  $appDir = Get-ChildItem -LiteralPath (Join-Path $temp "Payload") -Filter "*.app" -Directory | Select-Object -First 1
  if (-not $appDir) {
    throw "IPA does not contain a Payload/*.app bundle"
  }

  $plist = Join-Path $appDir.FullName "Info.plist"
  if (-not (Test-Path -LiteralPath $plist)) {
    throw "IPA app bundle is missing Info.plist"
  }

  $python = @"
import json
import plistlib
import sys

with open(sys.argv[1], "rb") as f:
    data = plistlib.load(f)

print(json.dumps({
    "bundleId": data.get("CFBundleIdentifier"),
    "version": data.get("CFBundleShortVersionString"),
    "build": data.get("CFBundleVersion"),
}))
"@
  $metadataJson = $python | python - $plist
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to parse IPA Info.plist"
  }

  $metadata = $metadataJson | ConvertFrom-Json
  $bundleId = $metadata.bundleId
  $version = $metadata.version
  $build = $metadata.build

  if ($bundleId -ne $expectedBundleId) {
    throw "Unexpected IPA bundle id. Expected $expectedBundleId, got $bundleId"
  }
  if ($version -ne $expectedVersion) {
    throw "Unexpected IPA version. Expected $expectedVersion, got $version"
  }
  if ($build -ne $expectedBuild) {
    throw "Unexpected IPA build. Expected $expectedBuild, got $build"
  }

  $info = Get-Item -LiteralPath $ipa
  [PSCustomObject]@{
    Ipa = $info.FullName
    BundleIdentifier = $bundleId
    Version = $version
    Build = $build
    Bytes = $info.Length
    LastWriteTime = $info.LastWriteTime
  }
}
finally {
  Remove-Item -LiteralPath $temp -Recurse -Force -ErrorAction SilentlyContinue
}
