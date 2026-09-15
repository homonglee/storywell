param([ValidateSet('status','verify','deploy')][string]$Action = 'status')
$ErrorActionPreference = 'Stop'
$projectDirectory = Split-Path -Parent $PSScriptRoot
Push-Location -LiteralPath $projectDirectory
try {
    $pythonCommand = Get-Command python -ErrorAction Stop
    & $pythonCommand.Source (Join-Path $PSScriptRoot 'deploy_sites.py') $Action
    if ($LASTEXITCODE -ne 0) { throw ('StoryWell command failed: ' + $Action) }
} finally { Pop-Location }
