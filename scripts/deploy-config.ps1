$ErrorActionPreference = "Stop"

function Get-DeployConfig {
  $repo = Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")
  $localConfig = Join-Path $repo ".deploy.local.ps1"

  if (-not (Test-Path -LiteralPath $localConfig)) {
    throw "Missing .deploy.local.ps1. Copy .deploy.local.example.ps1 to .deploy.local.ps1 and fill Cloudflare values."
  }

  . $localConfig

  if (-not $DeployConfig) {
    throw ".deploy.local.ps1 must define `$DeployConfig."
  }

  $requiredKeys = @(
    "PagesProjectName",
    "WorkerName",
    "AppPublicUrl",
    "MobileApiBaseUrl",
    "D1DatabaseName",
    "D1DatabaseId",
    "R2BucketName"
  )

  foreach ($key in $requiredKeys) {
    if (-not $DeployConfig.ContainsKey($key) -or [string]::IsNullOrWhiteSpace([string]$DeployConfig[$key])) {
      throw "Missing DeployConfig.$key in .deploy.local.ps1"
    }
  }

  return [PSCustomObject]@{
    Repo = $repo
    PagesProjectName = [string]$DeployConfig.PagesProjectName
    WorkerName = [string]$DeployConfig.WorkerName
    AppPublicUrl = ([string]$DeployConfig.AppPublicUrl).TrimEnd("/")
    MobileApiBaseUrl = ([string]$DeployConfig.MobileApiBaseUrl).TrimEnd("/")
    D1DatabaseName = [string]$DeployConfig.D1DatabaseName
    D1DatabaseId = [string]$DeployConfig.D1DatabaseId
    R2BucketName = [string]$DeployConfig.R2BucketName
  }
}

function Write-CloudflareConfig {
  param([Parameter(Mandatory = $true)] $Config)

  $webWrangler = Join-Path $Config.Repo "apps/web/wrangler.toml"
  $serverWrangler = Join-Path $Config.Repo "apps/server/wrangler.jsonc"

  @"
name = "$($Config.PagesProjectName)"
compatibility_date = "2026-07-19"
pages_build_output_dir = "out"

[[d1_databases]]
binding = "DB"
database_name = "$($Config.D1DatabaseName)"
database_id = "$($Config.D1DatabaseId)"
"@ | Set-Content -LiteralPath $webWrangler -NoNewline

  @{
    '$schema' = "node_modules/wrangler/config-schema.json"
    name = $Config.WorkerName
    main = "src/worker.ts"
    compatibility_date = "2026-07-19"
    vars = @{
      APP_PUBLIC_URL = $Config.AppPublicUrl
    }
    d1_databases = @(
      @{
        binding = "DB"
        database_name = $Config.D1DatabaseName
        database_id = $Config.D1DatabaseId
      }
    )
    r2_buckets = @(
      @{
        binding = "ATTACHMENTS"
        bucket_name = $Config.R2BucketName
      }
    )
  } | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $serverWrangler -NoNewline
}
