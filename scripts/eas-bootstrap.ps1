$ErrorActionPreference = 'Stop'

$SupabaseUrl = 'https://mhddpovueqvvncrforao.supabase.co'
$SupabasePublishableKey = 'sb_publishable_CB-2EJcfJYuApL9BIBpBCQ_DsNb0qNp'
$PokemonTcgApiKey = $null

function Invoke-Eas {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments)

  & npx --yes eas-cli@latest @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "EAS command failed: eas $($Arguments -join ' ')"
  }
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

& npx --yes eas-cli@latest whoami *> $null
if ($LASTEXITCODE -ne 0) {
  Write-Host 'Expo login required. Your browser will open now.' -ForegroundColor Yellow
  Invoke-Eas login --browser
}

Write-Host 'Linking or creating the EAS project...' -ForegroundColor Cyan
Invoke-Eas project:init

$Environments = @('development', 'preview', 'production')
foreach ($EnvironmentName in $Environments) {
  Write-Host "Configuring Supabase variables for $EnvironmentName..." -ForegroundColor Cyan
  Invoke-Eas env:set --environment $EnvironmentName --name EXPO_PUBLIC_SUPABASE_URL --value $SupabaseUrl --visibility plaintext
  Invoke-Eas env:set --environment $EnvironmentName --name EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY --value $SupabasePublishableKey --visibility plaintext

  if ($PokemonTcgApiKey) {
    Write-Host "Configuring optional Pokemon TCG API key for $EnvironmentName..." -ForegroundColor Cyan
    Invoke-Eas env:set --environment $EnvironmentName --name EXPO_PUBLIC_POKEMON_TCG_API_KEY --value $PokemonTcgApiKey --visibility sensitive
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
  }
} catch {
  Write-Host 'EAS finished, but the projectId could not be read automatically from app.json.' -ForegroundColor Yellow
}

Write-Host ''
Write-Host 'Core EAS setup complete.' -ForegroundColor Green
Write-Host 'Remote Android push still requires Firebase/FCM credentials before the final beta build.' -ForegroundColor Yellow
