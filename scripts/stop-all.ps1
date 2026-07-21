$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

Write-Host '[1/2] Stopping API, worker and web apps...'
$projectNodes = Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object {
  $_.CommandLine -like "*$root*" -and (
    $_.CommandLine -like '*vite.js*' -or
    $_.CommandLine -like '*tsx*cli.mjs*watch*src/main.ts*' -or
    $_.CommandLine -like '*tsx*loader.mjs*src/main.ts*'
  )
}

if ($projectNodes) {
  $projectNodes | ForEach-Object {
    Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
  }
  Write-Host "Stopped $($projectNodes.Count) project process(es)."
} else {
  Write-Host 'No running project processes were found.'
}

Write-Host '[2/2] Stopping project Docker containers...'
$dockerCommand = Get-Command docker.exe -ErrorAction SilentlyContinue
$docker = if ($dockerCommand) {
  $dockerCommand.Source
} else {
  'C:\Program Files\Docker\Docker\resources\bin\docker.exe'
}

if (Test-Path $docker) {
  Push-Location $root
  try {
    $savedErrorPreference = $ErrorActionPreference
    $ErrorActionPreference = 'SilentlyContinue'
    & $docker info --format '{{.ServerVersion}}' 2>$null | Out-Null
    $dockerReady = $LASTEXITCODE -eq 0
    $ErrorActionPreference = $savedErrorPreference
    if ($dockerReady) {
      & $docker compose stop
      if ($LASTEXITCODE -ne 0) { throw 'Failed to stop Docker containers.' }
    } else {
      Write-Host 'Docker engine is not running; containers are already unavailable.'
    }
  } finally {
    Pop-Location
  }
}

Write-Host ''
Write-Host 'Project stopped successfully.' -ForegroundColor Green
Write-Host 'Database and MinIO data have been preserved.'
