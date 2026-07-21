$ErrorActionPreference = "Stop"

$repo = Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")
$mobile = Join-Path $repo "apps/mobile"
$android = Join-Path $mobile "android"
. (Join-Path $PSScriptRoot "android-signing.ps1")

function Invoke-Checked {
  param(
    [Parameter(Mandatory = $true)]
    [string]$File,
    [string[]]$Arguments = @()
  )

  & $File @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Command failed with exit code ${LASTEXITCODE}: $File $($Arguments -join ' ')"
  }
}

function Stop-AndroidGradleDaemon {
  $gradlew = Join-Path $android "gradlew.bat"
  if (Test-Path -LiteralPath $gradlew) {
    Push-Location $android
    try {
      & .\gradlew.bat --stop
      $global:LASTEXITCODE = 0
    }
    finally {
      Pop-Location
    }
  }

  Get-CimInstance Win32_Process |
    Where-Object { $_.CommandLine -match "org\.gradle\.launcher\.daemon\.bootstrap\.GradleDaemon|KotlinCompileDaemon" } |
    ForEach-Object {
      Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
    }
}

Push-Location $repo
try {
  Invoke-Checked "npm" @("test")
  Invoke-Checked "npm" @("run", "typecheck", "--workspaces", "--if-present")
  Invoke-Checked "npm" @("run", "verify:store")
  Invoke-Checked "npm" @("run", "build", "-w", "@wanderlust/web")
  Stop-AndroidGradleDaemon
  Invoke-Checked "npm" @("run", "prebuild", "-w", "@wanderlust/mobile")
  Enable-AndroidReleaseSigning -MobileDirectory $mobile
  $gradleProperties = Join-Path $mobile "android/gradle.properties"
  $content = Get-Content -LiteralPath $gradleProperties -Raw
  $content = $content -replace "org\.gradle\.jvmargs=.*", "org.gradle.jvmargs=-Xmx4096m -XX:MaxMetaspaceSize=1024m -Dfile.encoding=UTF-8"
  if ($content -match "org\.gradle\.daemon=") {
    $content = $content -replace "org\.gradle\.daemon=.*", "org.gradle.daemon=false"
  } else {
    $content = $content.TrimEnd() + "`r`norg.gradle.daemon=false`r`n"
  }
  Set-Content -LiteralPath $gradleProperties -Value $content -NoNewline
}
finally {
  Pop-Location
}

Push-Location $android
try {
  $env:NODE_ENV = "production"
  Invoke-Checked ".\gradlew.bat" @("bundleRelease")
}
finally {
  Pop-Location
}

Invoke-Checked "powershell" @("-ExecutionPolicy", "Bypass", "-File", (Join-Path $PSScriptRoot "verify-android-aab.ps1"))
