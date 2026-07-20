$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "deploy-config.ps1")

$config = Get-DeployConfig
Write-CloudflareConfig -Config $config

npx wrangler d1 migrations apply $config.D1DatabaseName --remote --cwd (Join-Path $config.Repo "apps/server")
if ($LASTEXITCODE -ne 0) { throw "D1 migration failed" }
