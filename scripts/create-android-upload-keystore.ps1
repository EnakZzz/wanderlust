$ErrorActionPreference = "Stop"

$repo = Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")
$localConfig = Join-Path $repo ".android-signing.local.ps1"
$keystore = Join-Path $repo ".local/android/wanderlust-upload.keystore"
$alias = "wanderlust-upload"

if (Test-Path -LiteralPath $localConfig) {
  throw "Android signing config already exists: $localConfig"
}
if (Test-Path -LiteralPath $keystore) {
  throw "Android upload keystore already exists: $keystore"
}

$keytool = Get-Command keytool -ErrorAction Stop
$passwordBytes = New-Object byte[] 24
$rng = [Security.Cryptography.RandomNumberGenerator]::Create()
try {
  $rng.GetBytes($passwordBytes)
}
finally {
  $rng.Dispose()
}
$password = [Convert]::ToBase64String($passwordBytes).TrimEnd("=")

New-Item -ItemType Directory -Force -Path (Split-Path -Parent $keystore) | Out-Null
& $keytool.Source -genkeypair `
  -v `
  -storetype PKCS12 `
  -keystore $keystore `
  -alias $alias `
  -keyalg RSA `
  -keysize 2048 `
  -validity 10000 `
  -storepass $password `
  -keypass $password `
  -dname "CN=Wanderlust Planner, OU=EnakZzz, O=EnakZzz, L=Shanghai, ST=Shanghai, C=CN"

if ($LASTEXITCODE -ne 0) {
  throw "keytool failed to generate Android upload keystore"
}

$keystorePath = (Resolve-Path -LiteralPath $keystore).Path.Replace("\", "/")
$config = @"
`$env:WANDERLUST_ANDROID_UPLOAD_STORE_FILE = "$keystorePath"
`$env:WANDERLUST_ANDROID_UPLOAD_STORE_PASSWORD = "$password"
`$env:WANDERLUST_ANDROID_UPLOAD_KEY_ALIAS = "$alias"
`$env:WANDERLUST_ANDROID_UPLOAD_KEY_PASSWORD = "$password"
"@
Set-Content -LiteralPath $localConfig -Value $config -NoNewline

[PSCustomObject]@{
  Keystore = $keystorePath
  Alias = $alias
  LocalConfig = $localConfig
}
