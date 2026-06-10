[CmdletBinding()]
param(
  [int]$Port = 0,
  [switch]$NoBrowser,
  [switch]$NoBuild
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $Root

$ServerProcess = $null

function Test-PortFree {
  param([int]$CandidatePort)

  $listener = $null
  try {
    $listener = [System.Net.Sockets.TcpListener]::new(
      [System.Net.IPAddress]::Parse('127.0.0.1'),
      $CandidatePort
    )
    $listener.Start()
    return $true
  } catch {
    return $false
  } finally {
    if ($listener) {
      $listener.Stop()
    }
  }
}

function Get-FreePort {
  param([int[]]$CandidatePorts)

  foreach ($candidate in $CandidatePorts) {
    if (Test-PortFree -CandidatePort $candidate) {
      return $candidate
    }
  }

  throw "No free Lavern API port found in: $($CandidatePorts -join ', ')"
}

function Stop-ProcessTree {
  param([int]$ProcessId)

  if (-not $ProcessId) {
    return
  }

  try {
    $children = Get-CimInstance Win32_Process -Filter "ParentProcessId = $ProcessId" -ErrorAction SilentlyContinue
    foreach ($child in $children) {
      Stop-ProcessTree -ProcessId $child.ProcessId
    }
    Stop-Process -Id $ProcessId -Force -ErrorAction SilentlyContinue
  } catch {
    # Best effort cleanup during console close or Ctrl+C.
  }
}

function Wait-ForUrl {
  param(
    [string]$Url,
    [int]$Seconds = 45
  )

  $deadline = (Get-Date).AddSeconds($Seconds)
  while ((Get-Date) -lt $deadline) {
    try {
      $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2
      if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
        return $true
      }
    } catch {
      Start-Sleep -Milliseconds 500
    }
  }

  return $false
}

function Invoke-CheckedCommand {
  param(
    [string]$Command,
    [string]$WorkingDirectory
  )

  Push-Location -LiteralPath $WorkingDirectory
  try {
    cmd.exe /d /s /c $Command
    if ($LASTEXITCODE -ne 0) {
      throw "Command failed with exit code ${LASTEXITCODE}: $Command"
    }
  } finally {
    Pop-Location
  }
}

function Test-EmbeddedDashboardBuild {
  $indexPath = Join-Path $Root 'viz\dist\index.html'
  if (-not (Test-Path -LiteralPath $indexPath)) {
    return $false
  }

  $html = Get-Content -LiteralPath $indexPath -Raw
  return $html -match 'src="/dashboard/assets/' -and $html -match 'href="/dashboard/assets/'
}

function Build-EmbeddedDashboard {
  $previousBasePath = $env:VITE_BASE_PATH
  try {
    $env:VITE_BASE_PATH = '/dashboard/'
    Invoke-CheckedCommand -Command 'npm run build' -WorkingDirectory (Join-Path $Root 'viz')
  } finally {
    if ($null -eq $previousBasePath) {
      Remove-Item Env:\VITE_BASE_PATH -ErrorAction SilentlyContinue
    } else {
      $env:VITE_BASE_PATH = $previousBasePath
    }
  }
}

function Start-LavernServer {
  param([int]$ListenPort)

  $envVars = [System.Collections.IDictionary]@{
    LAVERN_APP_URL = "http://127.0.0.1:$ListenPort/dashboard/"
    SHEM_CORS_ORIGINS = "http://localhost:$ListenPort,http://127.0.0.1:$ListenPort"
  }

  $psi = [System.Diagnostics.ProcessStartInfo]::new()
  $psi.FileName = 'cmd.exe'
  $psi.Arguments = "/d /s /c `"npm run serve -- --port $ListenPort`""
  $psi.WorkingDirectory = $Root
  $psi.UseShellExecute = $false
  $psi.CreateNoWindow = $false

  foreach ($key in $envVars.Keys) {
    $psi.Environment[$key] = $envVars[$key]
  }

  $process = [System.Diagnostics.Process]::Start($psi)
  if (-not $process) {
    throw 'Failed to start Lavern.'
  }

  return $process
}

try {
  if (-not $NoBuild -and -not (Test-EmbeddedDashboardBuild)) {
    Write-Host ''
    Write-Host 'Dashboard build missing or not configured for /dashboard/. Building it once...'
    Build-EmbeddedDashboard
  }

  if (-not (Test-EmbeddedDashboardBuild)) {
    throw 'Dashboard build is missing or not configured for /dashboard/. Start again without -NoBuild so it can be rebuilt.'
  }

  if ($Port -le 0) {
    $Port = Get-FreePort -CandidatePorts (3000..3010)
  } elseif (-not (Test-PortFree -CandidatePort $Port)) {
    throw "Port $Port is already in use."
  }

  $AppUrl = "http://127.0.0.1:$Port/dashboard/"

  Write-Host ''
  Write-Host 'Starting Lavern...'
  Write-Host "Dashboard: $AppUrl"
  Write-Host ''
  Write-Host 'Leave this window open while you use the app.'
  Write-Host 'Press Ctrl+C or close this window to shut Lavern down.'
  Write-Host ''

  $ServerProcess = Start-LavernServer -ListenPort $Port

  if (Wait-ForUrl -Url $AppUrl -Seconds 45) {
    if (-not $NoBrowser) {
      Start-Process $AppUrl
    }
  } else {
    Write-Host "Lavern is still starting. Open $AppUrl when it is ready."
  }

  while ($ServerProcess -and -not $ServerProcess.HasExited) {
    Start-Sleep -Seconds 1
    $ServerProcess.Refresh()
  }
} finally {
  if ($ServerProcess -and -not $ServerProcess.HasExited) {
    Write-Host ''
    Write-Host 'Stopping Lavern...'
    Stop-ProcessTree -ProcessId $ServerProcess.Id
  }
}
