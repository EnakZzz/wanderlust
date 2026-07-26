param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("GET", "POST", "PUT", "DELETE")]
  [string]$Method,

  [Parameter(Mandatory = $true)]
  [string]$Path,

  [string]$BodyJson,
  [string]$BodyFile
)

$ErrorActionPreference = "Stop"

$repo = Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")
$agentConfigPath = Join-Path $repo ".local/agent-api.local.ps1"

if (-not (Test-Path -LiteralPath $agentConfigPath)) {
  throw "Missing .local/agent-api.local.ps1. Configure AGENT_API_TOKENS first and store the local token in that file."
}

. $agentConfigPath

if (-not $AgentApi -or [string]::IsNullOrWhiteSpace([string]$AgentApi.BaseUrl) -or [string]::IsNullOrWhiteSpace([string]$AgentApi.Token)) {
  throw ".local/agent-api.local.ps1 must define `$AgentApi.BaseUrl and `$AgentApi.Token."
}

if ($BodyJson -and $BodyFile) {
  throw "Use either -BodyJson or -BodyFile, not both."
}

$baseUrl = ([string]$AgentApi.BaseUrl).TrimEnd("/")
$normalizedPath = if ($Path.StartsWith("/")) { $Path } else { "/$Path" }
$headers = @{
  Authorization = "Bearer $($AgentApi.Token)"
}

$request = @{
  Uri = "$baseUrl$normalizedPath"
  Method = $Method
  Headers = $headers
  UseBasicParsing = $true
  SkipHttpErrorCheck = $true
}

if ($BodyFile) {
  $request.Body = Get-Content -LiteralPath $BodyFile -Raw
  $request.ContentType = "application/json"
} elseif ($BodyJson) {
  $request.Body = $BodyJson
  $request.ContentType = "application/json"
}

$response = Invoke-WebRequest @request
if ($response.StatusCode -lt 200 -or $response.StatusCode -ge 300) {
  throw "Agent API request failed with HTTP $($response.StatusCode): $($response.Content)"
}

$response.Content
