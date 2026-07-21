param(
  [string]$LanIp
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

if (-not $LanIp) {
  $network = Get-NetIPConfiguration | Where-Object {
    $_.IPv4DefaultGateway -and $_.NetAdapter.Status -eq 'Up' -and
    $_.InterfaceAlias -notmatch 'FlClash|Loopback|vEthernet|Docker'
  } | Select-Object -First 1
  $LanIp = $network.IPv4Address.IPAddress
}

if (-not $LanIp) {
  throw 'No LAN IPv4 address found. Use -LanIp to specify one.'
}

$dockerCommand = Get-Command docker.exe -ErrorAction SilentlyContinue
$docker = if ($dockerCommand) {
  $dockerCommand.Source
} else {
  'C:\Program Files\Docker\Docker\resources\bin\docker.exe'
}
if (-not (Test-Path $docker)) {
  throw 'Docker was not found. Install and start Docker Desktop first.'
}

$nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
$node = if ($nodeCommand) {
  $nodeCommand.Source
} else {
  'C:\Users\15515\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
}
if (-not (Test-Path $node)) {
  throw 'Node.js was not found.'
}

Write-Host '[1/5] Checking Docker...'
$savedErrorPreference = $ErrorActionPreference
$ErrorActionPreference = 'SilentlyContinue'
& $docker info --format '{{.ServerVersion}}' 2>$null | Out-Null
$dockerExitCode = $LASTEXITCODE
$ErrorActionPreference = $savedErrorPreference
if ($dockerExitCode -ne 0) {
  $dockerDesktop = 'C:\Program Files\Docker\Docker\Docker Desktop.exe'
  if (-not (Test-Path $dockerDesktop)) {
    throw 'Docker Desktop is installed but its engine is not running.'
  }

  Write-Host 'Docker engine is offline. Starting Docker Desktop...'
  Start-Process -FilePath $dockerDesktop -WindowStyle Hidden
  $ready = $false
  for ($attempt = 0; $attempt -lt 30; $attempt++) {
    Start-Sleep -Seconds 2
    $ErrorActionPreference = 'SilentlyContinue'
    & $docker info --format '{{.ServerVersion}}' 2>$null | Out-Null
    $dockerExitCode = $LASTEXITCODE
    $ErrorActionPreference = $savedErrorPreference
    if ($dockerExitCode -eq 0) {
      $ready = $true
      break
    }
  }
  if (-not $ready) {
    throw 'Docker engine did not become ready within 60 seconds.'
  }
}

Write-Host '[2/5] Starting PostgreSQL, Redis and MinIO...'
Push-Location $root
try {
  & $docker compose up -d --pull never
  if ($LASTEXITCODE -ne 0) { throw 'Docker services failed to start.' }

  Write-Host '[3/5] Applying database migrations...'
  $env:DATABASE_URL = 'postgresql://digital_twin:digital_twin@localhost:5432/digital_twin'
  $prisma = Join-Path $root 'apps\api-server\node_modules\.bin\prisma.CMD'
  $schema = Join-Path $root 'apps\api-server\prisma\schema.prisma'
  & $prisma migrate deploy --schema $schema
  if ($LASTEXITCODE -ne 0) { throw 'Database migration failed.' }

  Write-Host '[4/5] Checking development ports...'
  $occupiedPorts = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
    Where-Object { $_.LocalPort -in 3100, 5173, 5174 }
  if ($occupiedPorts) {
    $running = $false
    try {
      $editor = Invoke-WebRequest "http://${LanIp}:5173" -UseBasicParsing -TimeoutSec 5
      $runtime = Invoke-WebRequest "http://${LanIp}:5174" -UseBasicParsing -TimeoutSec 5
      $health = Invoke-RestMethod "http://${LanIp}:3100/api/health" -TimeoutSec 5
      $running = $editor.StatusCode -eq 200 -and
        $runtime.StatusCode -eq 200 -and
        $health.status -eq 'ok'
    } catch {
      $running = $false
    }

    if ($running) {
      Write-Host ''
      Write-Host 'Project is already running.' -ForegroundColor Green
      Write-Host 'Local addresses:' -ForegroundColor Cyan
      Write-Host '  Editor:   http://localhost:5173'
      Write-Host '  Runtime:  http://localhost:5174'
      Write-Host '  API docs: http://localhost:3100/api/docs'
      Write-Host '  MinIO:    http://localhost:9001'
      Write-Host 'LAN addresses:' -ForegroundColor Cyan
      Write-Host "  Editor:   http://${LanIp}:5173"
      Write-Host "  Runtime:  http://${LanIp}:5174"
      Write-Host "  API docs: http://${LanIp}:3100/api/docs"
      Write-Host "  MinIO:    http://${LanIp}:9001"
      return
    }

    $foreignProcess = $false
    foreach ($connection in $occupiedPorts) {
      $process = Get-CimInstance Win32_Process -Filter "ProcessId=$($connection.OwningProcess)"
      if ($process.CommandLine -notlike "*$root*") {
        $foreignProcess = $true
      }
    }
    if ($foreignProcess) {
      $portList = ($occupiedPorts.LocalPort | Sort-Object -Unique) -join ', '
      throw "Ports ${portList} are occupied by another application."
    }

    Write-Host 'Restarting old project processes with the current LAN IP...'
    $projectNodes = Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object {
      $_.CommandLine -like "*$root*" -and (
        $_.CommandLine -like '*vite.js*' -or
        $_.CommandLine -like '*tsx*cli.mjs*watch*src/main.ts*' -or
        $_.CommandLine -like '*tsx*loader.mjs*src/main.ts*'
      )
    }
    $projectNodes | ForEach-Object {
      Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
    }
    Start-Sleep -Seconds 2
  }

  Write-Host '[5/5] Starting API, worker and web apps...'
  & (Join-Path $PSScriptRoot 'start-lan.ps1') -LanIp $LanIp
  Write-Host 'Waiting for the API health check...'
  $health = $null
  for ($attempt = 1; $attempt -le 30; $attempt++) {
    try {
      $health = Invoke-RestMethod 'http://127.0.0.1:3100/api/health' -TimeoutSec 2
      if ($health.status -eq 'ok') { break }
    } catch {
      $health = $null
    }
    Start-Sleep -Seconds 2
  }

  if (-not $health -or $health.status -ne 'ok') {
    Write-Host ''
    Write-Host 'API startup log:' -ForegroundColor Yellow
    Get-Content (Join-Path $root 'api.log') -Tail 20 -ErrorAction SilentlyContinue
    Get-Content (Join-Path $root 'api.err.log') -Tail 20 -ErrorAction SilentlyContinue
    throw 'API did not become healthy within 60 seconds.'
  }

  Write-Host ''
  Write-Host 'Project started successfully.' -ForegroundColor Green
  Write-Host 'Local addresses:' -ForegroundColor Cyan
  Write-Host '  Editor:   http://localhost:5173'
  Write-Host '  Runtime:  http://localhost:5174'
  Write-Host '  API docs: http://localhost:3100/api/docs'
  Write-Host '  MinIO:    http://localhost:9001'
  Write-Host 'LAN addresses:' -ForegroundColor Cyan
  Write-Host "  Editor:   http://${LanIp}:5173"
  Write-Host "  Runtime:  http://${LanIp}:5174"
  Write-Host "  API docs: http://${LanIp}:3100/api/docs"
  Write-Host "  MinIO:    http://${LanIp}:9001"
} finally {
  Pop-Location
}
