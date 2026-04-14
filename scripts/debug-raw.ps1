$url = "https://felicia-project.vercel.app/api/chat"
$secret = "b4d7e36bac038cd0d22c93a1d741159615908f1a87ee8fd3c25dce52c0002a19"
$h = @{ "Content-Type" = "application/json"; "Authorization" = "Bearer $secret" }

# Test 1: simple chat
Write-Host "=== Test 1: simple chat ===" -ForegroundColor Cyan
$body1 = '{"message":"Apa kabar Felicia?","chatType":"utama"}'
try {
    $r1 = Invoke-WebRequest -Uri $url -Method Post -Headers $h -Body $body1 -UseBasicParsing
    Write-Host "Status: $($r1.StatusCode)" -ForegroundColor Green
    Write-Host "RAW:" -ForegroundColor DarkGray
    Write-Host $r1.Content
} catch {
    Write-Host "ERROR: $_" -ForegroundColor Red
}

Write-Host ""

# Test 2: jadwal
Write-Host "=== Test 2: jadwal ===" -ForegroundColor Cyan
$body2 = '{"message":"Jadwal hari ini apa aja?","chatType":"utama"}'
try {
    $r2 = Invoke-WebRequest -Uri $url -Method Post -Headers $h -Body $body2 -UseBasicParsing
    Write-Host "Status: $($r2.StatusCode)" -ForegroundColor Green
    Write-Host "RAW:" -ForegroundColor DarkGray
    Write-Host $r2.Content
} catch {
    Write-Host "ERROR: $_" -ForegroundColor Red
}
