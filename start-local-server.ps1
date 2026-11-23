param([int]$Port = 8000)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$node = Get-Command node -ErrorAction Stop
Set-Location -LiteralPath $root
& $node.Source (Join-Path $root 'local-server.cjs') $Port
