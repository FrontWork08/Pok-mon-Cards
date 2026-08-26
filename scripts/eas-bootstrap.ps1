# Pokemon Cards EAS bootstrap for Windows PowerShell.
# Native command failures are checked explicitly with $LASTEXITCODE.
$ErrorActionPreference = 'Continue'

$SupabaseUrl = 'https://mhddpovueqvvncrforao.supabase.co'
$SupabasePublishableKey = 'sb_publishable_CB-2EJcfJYuApL9BIBpBCQ_DsNb0qNp'
$PokemonTcgApiKey = $null

function Ensure-EasCli {
  $Existing = Get-Command eas.cmd -ErrorAction SilentlyContinue
  if ($Existing) {
    Write-Host "Using installed EAS CLI: $($Existing.Source)" -ForegroundColor Green
    return
  }

  Write-Host 'EAS CLI is not installed globally. Installing it once...' -ForegroundColor Yellow
  Write-Host 'Cleaning npm cache first to avoid the corrupted npx cache seen previously...' -ForegroundColor Cyan
  & npm.cmd cache clean --force
  if ($LASTEXITCODE -ne 0) {
    throw "npm cache clean failed with exit code $LASTEXITCODE"
  }

  Write-Host 'Installing eas-cli globally. npm deprecation warnings can be ignored.' -ForegroundColor Cyan
  & npm.cmd install --global eas-cli@latest --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) {
    throw "Global eas-cli installation failed with exit code $LASTEXITCODE"
  }

  $Installed = Get-Command eas.cmd -ErrorAction SilentlyContinue
  if (-not $Installed) {
    throw 'eas.cmd was installed but is not available in PATH. Close/reopen the terminal and run the script again.'
  }

  Write-Host "EAS CLI installed: $($Installed.Source)" -ForegroundColor Green
}

function Invoke-Eas {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments)

  & eas.cmd @Arguments
  $ExitCode = $LASTEXITCODE
  if ($ExitCode -ne 0) {
    throw "EAS command failed with exit code ${ExitCode}: eas $($Arguments -join ' ')"
  }
}

function Test-EasLogin {
  & eas.cmd whoami 1>$null 2>$null
  return ($LASTEXITCODE -eq 0)
}

# Reuse the optional local Pokemon TCG key without ever committing .env.
if (Test-Path '.env') {
  $PokemonKeyLine = Get-Content '.env' | Where-Object { $_ -match '^\s*EXPO_PUBLIC_POKEMON_TCG_API_KEY\s*=' } | Select-Object -First 1
  if ($PokemonKeyLine) {
    $PokemonTcgApiKey = ($PokemonKeyLine -split '=', 2)[1].Trim().Trim('"').Trim("'")
  }
}

Write-Host ''
Write-Host '=== Pokemon Cards - EAS bootstrap ===' -ForegroundColor Cyan
Write-Host 'This script links the app to Expo/EAS and configures build environments.'
Write-Host ''

Ensure-EasCli

Write-Host 'EAS CLI version:' -ForegroundColor Cyan
Invoke-Eas --version

if (-not (Test-EasLogin)) {
  Write-Host 'Expo login required. Your browser will open now.' -ForegroundColor Yellow
  Invoke-Eas login --browser
}

Write-Host 'Expo account authenticated.' -ForegroundColor Green
Write-Host 'Linking or creating the EAS project...' -ForegroundColor Cyan
Invoke-Eas project:init

$Environments = @('development', 'preview', 'production')
foreach ($EnvironmentName in $Environments) {
  Write-Host "Configuring Supabase variables for $EnvironmentName..." -ForegroundColor Cyan
  Invoke-Eas env:set $EnvironmentName --name EXPO_PUBLIC_SUPABASE_URL --value $SupabaseUrl --visibility plaintext --non-interactive
  Invoke-Eas env:set $EnvironmentName --name EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY --value $SupabasePublishableKey --visibility plaintext --non-interactive

  if ($PokemonTcgApiKey) {
    Write-Host "Configuring optional Pokemon TCG API key for $EnvironmentName..." -ForegroundColor Cyan
    Invoke-Eas env:set $EnvironmentName --name EXPO_PUBLIC_POKEMON_TCG_API_KEY --value $PokemonTcgApiKey --visibility sensitive --non-interactive
  }
}

Write-Host 'Checking linked project...' -ForegroundColor Cyan
Invoke-Eas project:info

Write-Host 'Preparing Android signing credentials for the preview APK...' -ForegroundColor Cyan
Invoke-Eas credentials:configure-build --platform android --profile preview

try {
  $AppConfig = Get-Content -Raw -Path 'app.json' | ConvertFrom-Json
  $ProjectId = $AppConfig.expo.extra.eas.projectId
  if ($ProjectId) {
    Write-Host ''
    Write-Host "EAS project linked successfully. projectId: $ProjectId" -ForegroundColor Green
    Write-Host 'app.json was updated locally by EAS. Keep this change; it must be committed to GitHub.' -ForegroundColor Yellow
  } else {
    Write-Host 'EAS finished, but app.json does not contain extra.eas.projectId yet.' -ForegroundColor Yellow
  }
} catch {
  Write-Host 'EAS finished, but the projectId could not be read automatically from app.json.' -ForegroundColor Yellow
}

Write-Host ''
Write-Host 'Core EAS setup complete.' -ForegroundColor Green
Write-Host 'Remote Android push still requires Firebase/FCM credentials before the final beta build.' -ForegroundColor Yellow
