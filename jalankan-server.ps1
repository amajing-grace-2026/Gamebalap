# Server lokal sederhana untuk Neon Rush (tanpa perlu install apa pun)
# Cara pakai: klik kanan file ini > "Run with PowerShell", lalu buka http://localhost:8080
param([int]$Port = 8080)
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "Neon Rush berjalan di http://localhost:$Port  (Ctrl+C untuk berhenti)"
$types = @{ '.html'='text/html; charset=utf-8'; '.js'='text/javascript; charset=utf-8'; '.css'='text/css; charset=utf-8';
  '.json'='application/json'; '.png'='image/png'; '.jpg'='image/jpeg'; '.svg'='image/svg+xml'; '.mp3'='audio/mpeg'; '.ogg'='audio/ogg'; '.md'='text/plain; charset=utf-8' }
try {
  while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    try {
      $path = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath.TrimStart('/'))
      if ($path -eq '__shutdown') {
        # dipanggil dari tombol "Keluar Game" → matikan server
        $ctx.Response.StatusCode = 204
        $ctx.Response.Close()
        Write-Host 'Game ditutup dari dalam game. Server berhenti.'
        $listener.Stop()
        break
      }
      if ($path -eq '') { $path = 'index.html' }
      $file = Join-Path $root $path
      $full = [System.IO.Path]::GetFullPath($file)
      if ($full.StartsWith($root) -and (Test-Path $full -PathType Leaf)) {
        $bytes = [System.IO.File]::ReadAllBytes($full)
        $ext = [System.IO.Path]::GetExtension($full).ToLower()
        $ctx.Response.ContentType = if ($types.ContainsKey($ext)) { $types[$ext] } else { 'application/octet-stream' }
        $ctx.Response.Headers.Add('Cache-Control', 'no-cache')
        $ctx.Response.ContentLength64 = $bytes.Length
        $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
      } else {
        $ctx.Response.StatusCode = 404
      }
    } catch { Write-Host "Error: $_" }
    try { $ctx.Response.Close() } catch {}
  }
} finally { $listener.Stop() }
