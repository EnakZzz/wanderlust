$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "deploy-config.ps1")

$config = Get-DeployConfig
Write-CloudflareConfig -Config $config

Push-Location (Join-Path $config.Repo "apps/server")
try {
  npx wrangler deploy --name $config.WorkerName
  if ($LASTEXITCODE -ne 0) { throw "Cloudflare Worker deploy failed" }
} finally {
  Pop-Location
}
