param(
  [string]$ApiUrl = "https://felicia-project.vercel.app/api/import-memory",
  [string]$ApiSecret = "",
  [string]$SeedFile = "./data/felicia-memory-seed.json"
)

if ([string]::IsNullOrWhiteSpace($ApiSecret)) {
  Write-Error "ApiSecret wajib diisi. Contoh: .\scripts\import-memory-seed.ps1 -ApiSecret 'xxx'"
  exit 1
}

if (-not (Test-Path $SeedFile)) {
  Write-Error "Seed file tidak ditemukan: $SeedFile"
  exit 1
}

$raw = Get-Content -Path $SeedFile -Raw
try {
  $null = $raw | ConvertFrom-Json
} catch {
  Write-Error "Isi JSON tidak valid di file: $SeedFile"
  exit 1
}

$response = Invoke-RestMethod -Uri $ApiUrl -Method Post -Headers @{
  Authorization = "Bearer $ApiSecret"
  "Content-Type" = "application/json"
} -Body $raw

$response | ConvertTo-Json -Depth 8
