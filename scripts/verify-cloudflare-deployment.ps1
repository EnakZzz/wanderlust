$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "deploy-config.ps1")

$config = Get-DeployConfig
Write-CloudflareConfig -Config $config

$repo = Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")
$server = Join-Path $repo "apps/server"
$wrangler = Join-Path $server "wrangler.jsonc"
$appJson = Join-Path $repo "apps/mobile/app.json"

if (-not (Test-Path -LiteralPath $wrangler)) { throw "Missing server wrangler config" }
if (-not (Test-Path -LiteralPath $appJson)) { throw "Missing mobile app.json" }

$serverConfig = Get-Content -LiteralPath $wrangler -Raw | ConvertFrom-Json
$mobileConfig = (Get-Content -LiteralPath $appJson -Raw | ConvertFrom-Json).expo
$failures = New-Object System.Collections.Generic.List[string]

if ($serverConfig.name -ne $config.WorkerName) { $failures.Add("Worker name mismatch") }
if ($serverConfig.vars.APP_PUBLIC_URL -ne $config.AppPublicUrl) { $failures.Add("APP_PUBLIC_URL mismatch") }
if ($serverConfig.d1_databases[0].binding -ne "DB") { $failures.Add("D1 binding must be DB") }
if ($serverConfig.d1_databases[0].database_name -ne $config.D1DatabaseName) { $failures.Add("D1 database_name mismatch") }
if ($serverConfig.d1_databases[0].database_id -ne $config.D1DatabaseId) { $failures.Add("D1 database_id mismatch") }
if ($serverConfig.r2_buckets[0].binding -ne "ATTACHMENTS") { $failures.Add("R2 binding must be ATTACHMENTS") }
if ($serverConfig.r2_buckets[0].bucket_name -ne $config.R2BucketName) { $failures.Add("R2 bucket mismatch") }
if ($mobileConfig.extra.apiBaseUrl -ne $config.MobileApiBaseUrl) { $failures.Add("Mobile apiBaseUrl mismatch") }

if ($failures.Count -gt 0) {
  throw "Cloudflare deployment check failed: $($failures -join '; ')"
}

$deployments = & npx wrangler deployments list --name $config.WorkerName
if ($LASTEXITCODE -ne 0) { throw "Could not list Worker deployments" }
if (($deployments -join "`n") -notmatch "Version") { throw "Worker deployment list did not include a deployed version" }

$d1 = & npx wrangler d1 execute $config.D1DatabaseName --remote --command "SELECT name FROM sqlite_master WHERE type='table' AND name='trips'"
if ($LASTEXITCODE -ne 0) { throw "Could not query remote D1" }
if (($d1 -join "`n") -notmatch '"name": "trips"') { throw "Remote D1 trips table not found" }

$r2 = & npx wrangler r2 bucket list
if ($LASTEXITCODE -ne 0) { throw "Could not list R2 buckets" }
if (($r2 -join "`n") -notmatch $config.R2BucketName) { throw "R2 bucket not found" }

[PSCustomObject]@{
  Worker = $config.WorkerName
  ApiBaseUrl = $config.MobileApiBaseUrl
  D1 = $config.D1DatabaseName
  R2 = $config.R2BucketName
  MobileApiConfigured = $true
}
