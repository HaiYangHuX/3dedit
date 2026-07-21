param(
  [Parameter(Mandatory = $true)]
  [string]$LanIp
)

$root = Split-Path -Parent $PSScriptRoot
$node = 'C:\Users\15515\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
$tsx = Join-Path $root 'node_modules\.pnpm\tsx@4.21.0\node_modules\tsx\dist\cli.mjs'
$vite = (Get-ChildItem (Join-Path $root 'node_modules\.pnpm\vite@7.3.6_*\node_modules\vite\bin\vite.js')).FullName

$env:DATABASE_URL = 'postgresql://digital_twin:digital_twin@localhost:5432/digital_twin'
$env:REDIS_URL = 'redis://localhost:6379'
$env:MINIO_PORT = '9000'
$env:MINIO_ACCESS_KEY = 'digital-twin'
$env:MINIO_SECRET_KEY = 'digital-twin-secret'
$env:MINIO_USE_SSL = 'false'
$env:MINIO_BUCKET = 'assets'
$env:API_PUBLIC_BASE_URL = "http://${LanIp}:3100/api"
$env:VITE_API_BASE_URL = "http://${LanIp}:3100/api"

$env:MINIO_ENDPOINT = $LanIp
Start-Process -FilePath $node -ArgumentList @($tsx, 'watch', 'src/main.ts') `
  -WorkingDirectory (Join-Path $root 'apps\api-server') -WindowStyle Hidden `
  -RedirectStandardOutput (Join-Path $root 'api.log') `
  -RedirectStandardError (Join-Path $root 'api.err.log')

$env:MINIO_ENDPOINT = 'localhost'
Start-Process -FilePath $node -ArgumentList @($tsx, 'watch', 'src/main.ts') `
  -WorkingDirectory (Join-Path $root 'apps\asset-worker') -WindowStyle Hidden `
  -RedirectStandardOutput (Join-Path $root 'worker.log') `
  -RedirectStandardError (Join-Path $root 'worker.err.log')

Start-Process -FilePath $node -ArgumentList @($vite, '--host', '0.0.0.0', '--port', '5173') `
  -WorkingDirectory (Join-Path $root 'apps\editor-web') -WindowStyle Hidden `
  -RedirectStandardOutput (Join-Path $root 'editor.log') `
  -RedirectStandardError (Join-Path $root 'editor.err.log')

Start-Process -FilePath $node -ArgumentList @($vite, '--host', '0.0.0.0', '--port', '5174') `
  -WorkingDirectory (Join-Path $root 'apps\runtime-web') -WindowStyle Hidden `
  -RedirectStandardOutput (Join-Path $root 'runtime.log') `
  -RedirectStandardError (Join-Path $root 'runtime.err.log')

Write-Host "Editor: http://${LanIp}:5173"
Write-Host "Runtime: http://${LanIp}:5174"
Write-Host "API docs: http://${LanIp}:3100/api/docs"
Write-Host "MinIO: http://${LanIp}:9001"
