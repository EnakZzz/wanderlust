$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "deploy-config.ps1")

$config = Get-DeployConfig
$url = $config.AppPublicUrl.TrimEnd("/") + "/auth/config"
$response = Invoke-RestMethod -Uri $url -Method Get

if (-not $response.providers.google.configured) {
  throw "Google OAuth is not configured on Cloudflare Pages."
}
if (-not $response.providers.apple.configured) {
  throw "Apple OAuth is not configured on Cloudflare Pages. Configure APPLE_OAUTH_CLIENT_ID and APPLE_OAUTH_CLIENT_SECRET."
}

[PSCustomObject]@{
  Url = $url
  Google = $response.providers.google.configured
  Apple = $response.providers.apple.configured
}
