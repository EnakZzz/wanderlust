param(
  [string]$Remote = $(if ($env:IOS_BUILD_HOST) { $env:IOS_BUILD_HOST } else { "ios-build" }),
  [string]$RemoteDir = $(if ($env:IOS_BUILD_DIR) { $env:IOS_BUILD_DIR } else { "~/wanderlust-trip-planner" })
)

$ErrorActionPreference = "Stop"

$repo = Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")
$archive = Join-Path ([IO.Path]::GetTempPath()) ("wanderlust-src-" + [Guid]::NewGuid().ToString("N") + ".tar")
$remoteArchive = "/tmp/wanderlust-src.tar"

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

Push-Location $repo
try {
  Invoke-Checked "tar" @(
    "-cf", $archive,
    "--exclude", "node_modules",
    "--exclude", "apps/web/.next",
    "--exclude", "apps/mobile/android",
    "--exclude", "apps/mobile/ios",
    "--exclude", "apps/mobile/.expo",
    "--exclude", "apps/mobile/dist",
    "--exclude", "apps/mobile/web-build",
    "--exclude", "artifacts",
    "--exclude", "*.tsbuildinfo",
    "package.json",
    "package-lock.json",
    "README.md",
    "apps",
    "packages",
    "scripts"
  )

  Invoke-Checked "scp" @($archive, "${Remote}:$remoteArchive")
}
finally {
  Pop-Location
  Remove-Item -LiteralPath $archive -Force -ErrorAction SilentlyContinue
}

$remoteScript = @'
set -e
export PATH=$HOME/.local/node/bin:/usr/local/opt/node@22/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin

remote_dir="__REMOTE_DIR__"
archive="__REMOTE_ARCHIVE__"
stamp=$(date +%Y%m%d%H%M%S)
tmp_dir="$HOME/wanderlust-trip-planner.incoming.$stamp"
backup_dir="$HOME/wanderlust-trip-planner.backup.$stamp"

case "$remote_dir" in
  \~/*) remote_dir="$HOME/${remote_dir#\~/}" ;;
  \~) remote_dir="$HOME" ;;
esac

case "$remote_dir" in
  "$HOME"/*) ;;
  *) echo "Refusing to replace remote dir outside HOME: $remote_dir" >&2; exit 30 ;;
esac

rm -rf "$tmp_dir"
mkdir -p "$tmp_dir"
tar -xf "$archive" -C "$tmp_dir"
cd "$tmp_dir"
npm ci
npm run typecheck --workspaces --if-present
npm run test

if [ -d "$remote_dir" ]; then
  mv "$remote_dir" "$backup_dir"
fi
mv "$tmp_dir" "$remote_dir"
rm -f "$archive"

echo "remoteDir=$remote_dir"
echo "backupDir=$backup_dir"
echo "syncedPackage=$(node -p 'require("./package.json").version')"
'@

$remoteScript = $remoteScript.Replace("__REMOTE_DIR__", $RemoteDir)
$remoteScript = $remoteScript.Replace("__REMOTE_ARCHIVE__", $remoteArchive)
$encoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($remoteScript))

ssh $Remote "printf '%s' '$encoded' | base64 --decode | zsh"
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}
