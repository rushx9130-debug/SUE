$lines = Get-Content 'c:/Users/Gowther/Desktop/tienda-pro-railway/public/panel-admin.html'
$total = $lines.Count
Write-Host "Total lines: $total"
# Output last 30 lines
for ($i = [Math]::Max(0, $total-30); $i -lt $total; $i++) {
    Write-Host "$($i+1): $($lines[$i])"
}

