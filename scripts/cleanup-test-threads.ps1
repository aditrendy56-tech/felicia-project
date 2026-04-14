$BASE_URL = "https://felicia-project.vercel.app"
$API_SECRET = "b4d7e36bac038cd0d22c93a1d741159615908f1a87ee8fd3c25dce52c0002a19"
$headers = @{ "Content-Type" = "application/json"; "Authorization" = "Bearer $API_SECRET" }

$ids = @(
  "cc760a15-618b-4bf3-8a4c-ad27f15a7ff2",
  "d30daf35-4b99-4450-8dfb-2a20dfd3413a"
)

foreach ($id in $ids) {
  $body = @{ action = "delete_thread"; threadId = $id } | ConvertTo-Json -Compress
  try {
    $res = Invoke-WebRequest -Uri "$BASE_URL/api/chat" -Method Post -Headers $headers -Body $body -UseBasicParsing
    $json = $res.Content | ConvertFrom-Json
    Write-Host "Deleted $id => $($json.deleted)"
  } catch {
    Write-Host "Failed $id => $($_.Exception.Message)"
  }
}

$listBody = @{ action = "list_threads"; chatType = "utama" } | ConvertTo-Json -Compress
$listRes = Invoke-WebRequest -Uri "$BASE_URL/api/chat" -Method Post -Headers $headers -Body $listBody -UseBasicParsing
$listJson = $listRes.Content | ConvertFrom-Json

Write-Host "Remaining utama threads: $($listJson.threads.Count)"
$listJson.threads | Select-Object id, title, created_at | Format-Table
