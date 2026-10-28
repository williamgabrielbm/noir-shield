param([string]$Script='tests/midroll-hidden.mjs')
$ErrorActionPreference='Stop'
$env:NOIR_INSTALLED_CHROME='1'
& (Join-Path $PSScriptRoot 'launch-private-desktop.ps1') -Script $Script
