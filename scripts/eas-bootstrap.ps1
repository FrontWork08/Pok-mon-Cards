# Keep PowerShell from turning npm/node stderr warnings into terminating errors.
# Native command failures are checked explicitly through $LASTEXITCODE below.
$ErrorActionPreference = 'Continue'

$SupabaseUrl = 'https://mhddpovueqvvncrforao.supabase.co'
$SupabasePublishableKey = 'sb_publishable_CB-2EJcfJYuApL9BIBpBCQ_DsNb0qNp'
$PokemonTcgApiKey = $null

function Invoke-Eas {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments)

  $PreviousPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    & npx.cmd --yes eas-cli@latest @Arguments
    $ExitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $PreviousPreference
  }

  if ($ExitCode -ne 0) {
    throw "EAS command failed with exit code ${ExitCode}: eas $($Arguments -join ' ')"
  }
}

function Test-EasLogin {
  $PreviousPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    # npm may print harmless deprecation warnings to stderr. Hide them for this probe.
    & npx.cmd --yes eas-cli@latest whoami 1>$null 2>$null
    $ExitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $PreviousPreference
  }
  return ($ExitCode -eq 0)
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
