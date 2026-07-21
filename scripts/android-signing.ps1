$ErrorActionPreference = "Stop"

function Import-AndroidSigningConfig {
  $repo = Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")
  $localConfig = Join-Path $repo ".android-signing.local.ps1"
  if (Test-Path -LiteralPath $localConfig) {
    . $localConfig
  }
}

function Get-AndroidSigningConfig {
  Import-AndroidSigningConfig

  $required = @(
    "WANDERLUST_ANDROID_UPLOAD_STORE_FILE",
    "WANDERLUST_ANDROID_UPLOAD_STORE_PASSWORD",
    "WANDERLUST_ANDROID_UPLOAD_KEY_ALIAS",
    "WANDERLUST_ANDROID_UPLOAD_KEY_PASSWORD"
  )

  foreach ($name in $required) {
    if (-not [Environment]::GetEnvironmentVariable($name, "Process")) {
      return $null
    }
  }

  $storeFile = [Environment]::GetEnvironmentVariable("WANDERLUST_ANDROID_UPLOAD_STORE_FILE", "Process")
  if (-not (Test-Path -LiteralPath $storeFile)) {
    throw "Android upload keystore not found: $storeFile"
  }

  [PSCustomObject]@{
    StoreFile = (Resolve-Path -LiteralPath $storeFile).Path.Replace("\", "/")
    StorePassword = [Environment]::GetEnvironmentVariable("WANDERLUST_ANDROID_UPLOAD_STORE_PASSWORD", "Process")
    KeyAlias = [Environment]::GetEnvironmentVariable("WANDERLUST_ANDROID_UPLOAD_KEY_ALIAS", "Process")
    KeyPassword = [Environment]::GetEnvironmentVariable("WANDERLUST_ANDROID_UPLOAD_KEY_PASSWORD", "Process")
  }
}

function Enable-AndroidReleaseSigning {
  param(
    [Parameter(Mandatory = $true)]
    [string]$MobileDirectory
  )

  $config = Get-AndroidSigningConfig
  if (-not $config) {
    Write-Host "Android release signing config not found. Release build will keep Expo's generated debug signing."
    return
  }

  $android = Join-Path $MobileDirectory "android"
  $gradleProperties = Join-Path $android "gradle.properties"
  $buildGradle = Join-Path $android "app/build.gradle"
  if (-not (Test-Path -LiteralPath $gradleProperties)) { throw "Missing Gradle properties: $gradleProperties" }
  if (-not (Test-Path -LiteralPath $buildGradle)) { throw "Missing Android build.gradle: $buildGradle" }

  Set-GradleProperty $gradleProperties "WANDERLUST_UPLOAD_STORE_FILE" $config.StoreFile
  Set-GradleProperty $gradleProperties "WANDERLUST_UPLOAD_STORE_PASSWORD" $config.StorePassword
  Set-GradleProperty $gradleProperties "WANDERLUST_UPLOAD_KEY_ALIAS" $config.KeyAlias
  Set-GradleProperty $gradleProperties "WANDERLUST_UPLOAD_KEY_PASSWORD" $config.KeyPassword

  $content = Get-Content -LiteralPath $buildGradle -Raw
  if ($content -notmatch "WANDERLUST_UPLOAD_STORE_FILE") {
    $debugBlock = @"
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
"@
    $releaseBlock = @"
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
        release {
            storeFile file(WANDERLUST_UPLOAD_STORE_FILE)
            storePassword WANDERLUST_UPLOAD_STORE_PASSWORD
            keyAlias WANDERLUST_UPLOAD_KEY_ALIAS
            keyPassword WANDERLUST_UPLOAD_KEY_PASSWORD
        }
"@
    $content = $content.Replace($debugBlock, $releaseBlock)
  }

  $content = [regex]::Replace($content, "(release\s*\{[\s\S]*?)signingConfig signingConfigs\.debug", '$1signingConfig signingConfigs.release', 1)
  Set-Content -LiteralPath $buildGradle -Value $content -NoNewline
  Write-Host "Android release signing enabled with upload key alias '$($config.KeyAlias)'."
}

function Set-GradleProperty {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path,
    [Parameter(Mandatory = $true)]
    [string]$Name,
    [Parameter(Mandatory = $true)]
    [string]$Value
  )

  $escaped = $Value.Replace("\", "\\")
  $content = Get-Content -LiteralPath $Path -Raw
  if ($content -match "(?m)^$([regex]::Escape($Name))=") {
    $content = [regex]::Replace($content, "(?m)^$([regex]::Escape($Name))=.*$", "$Name=$escaped")
  } else {
    $content = $content.TrimEnd() + "`r`n$Name=$escaped`r`n"
  }
  Set-Content -LiteralPath $Path -Value $content -NoNewline
}
