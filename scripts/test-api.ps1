$BASE_URL   = "https://felicia-project.vercel.app"
$API_SECRET = "b4d7e36bac038cd0d22c93a1d741159615908f1a87ee8fd3c25dce52c0002a19"

$headers = @{
  "Content-Type"  = "application/json"
  "Authorization" = "Bearer $API_SECRET"
}

function Call-API($body) {
  $json = $body | ConvertTo-Json -Compress
  Write-Host "  → Sending: $json" -ForegroundColor DarkGray
  try {
    $res = Invoke-WebRequest `
      -Uri "$BASE_URL/api/chat" `
      -Method Post `
      -Headers $headers `
      -Body $json `
      -MaximumRedirection 5 `
      -UseBasicParsing
    Write-Host "  ← HTTP $($res.StatusCode)" -ForegroundColor DarkGray
    return $res.Content | ConvertFrom-Json
  } catch {
    $code = $_.Exception.Response.StatusCode.value__
    # baca response body dari error
    try {
      $stream = $_.Exception.Response.GetResponseStream()
      $reader = New-Object System.IO.StreamReader($stream)
      $errBody = $reader.ReadToEnd()
    } catch { $errBody = "(tidak bisa baca body)" }
    Write-Host "ERROR $code" -ForegroundColor Red
    Write-Host "  Body: $errBody" -ForegroundColor Red
    return $null
  }
}

# ── 1. List threads (utama) ──────────────────────────────────
Write-Host "`n=== 1. list_threads ===" -ForegroundColor Cyan
$list = Call-API @{ action = "list_threads"; chatType = "utama" }
$list | ConvertTo-Json -Depth 5

# ── 2. Create thread ─────────────────────────────────────────
Write-Host "`n=== 2. create_thread ===" -ForegroundColor Cyan
$created = Call-API @{ action = "create_thread"; chatType = "utama"; title = "API Test $(Get-Date -Format 'HH:mm')" }
$created | ConvertTo-Json -Depth 5
$threadId = $created.thread.id
Write-Host "Thread ID: $threadId" -ForegroundColor Yellow

if (-not $threadId) {
  Write-Host "create_thread gagal, stop." -ForegroundColor Red
  exit 1
}

# ── 3. Send message ──────────────────────────────────────────
Write-Host "`n=== 3. send message ===" -ForegroundColor Cyan
$msg = Call-API @{ message = "Halo Felicia, ini test dari PowerShell"; chatType = "utama"; threadId = $threadId }
$msg | ConvertTo-Json -Depth 5

# ── 4. Get messages ──────────────────────────────────────────
Write-Host "`n=== 4. get_messages ===" -ForegroundColor Cyan
$msgs = Call-API @{ action = "get_messages"; threadId = $threadId }
$msgs.messages | Select-Object role, content, created_at | Format-Table -Wrap

# ── 5. Delete thread (cleanup) ───────────────────────────────
Write-Host "`n=== 5. delete_thread (cleanup) ===" -ForegroundColor Cyan
$del = Call-API @{ action = "delete_thread"; threadId = $threadId }
$del | ConvertTo-Json -Depth 5

Write-Host "`nDone!" -ForegroundColor Green
