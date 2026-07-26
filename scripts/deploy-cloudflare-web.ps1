$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "deploy-config.ps1")

$config = Get-DeployConfig
Write-CloudflareConfig -Config $config

Push-Location (Join-Path $config.Repo "apps/web")
try {
  npm run build
  if ($LASTEXITCODE -ne 0) { throw "Web build failed" }

  npx wrangler pages deploy out --project-name $config.PagesProjectName --branch main
  if ($LASTEXITCODE -ne 0) { throw "Cloudflare Pages deploy failed" }
} finally {
  Pop-Location
}
