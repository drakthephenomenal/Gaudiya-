$port = 8000
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$port/")
$listener.Start()

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  Radha Naam Jap App - Local Dev Server   " -ForegroundColor Yellow
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Running at: http://localhost:$port/" -ForegroundColor Green
Write-Host "Press Ctrl+C to stop the server." -ForegroundColor Gray
Write-Host ""

# Automatically open the browser
Start-Process "http://localhost:$port/"

try {
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response
        
        $localPath = $request.Url.LocalPath
        if ($localPath -eq "/") { $localPath = "/index.html" }
        
        # Remove leading slash for Join-Path
        if ($localPath.StartsWith("/")) {
            $localPath = $localPath.Substring(1)
        }
        
        $filePath = Join-Path $PWD $localPath
        
        if (Test-Path $filePath -PathType Leaf) {
            $ext = [System.IO.Path]::GetExtension($filePath).ToLower()
            $contentType = "application/octet-stream"
            
            switch ($ext) {
                ".html" { $contentType = "text/html; charset=utf-8" }
                ".css"  { $contentType = "text/css; charset=utf-8" }
                ".js"   { $contentType = "application/javascript; charset=utf-8" }
                ".json" { $contentType = "application/json; charset=utf-8" }
                ".png"  { $contentType = "image/png" }
                ".jpg"  { $contentType = "image/jpeg" }
                ".jpeg" { $contentType = "image/jpeg" }
                ".ico"  { $contentType = "image/x-icon" }
                ".svg"  { $contentType = "image/svg+xml; charset=utf-8" }
                ".woff" { $contentType = "font/woff" }
                ".woff2"{ $contentType = "font/woff2" }
                ".ttf"  { $contentType = "font/ttf" }
                ".mp3"  { $contentType = "audio/mpeg" }
            }
            
            $response.ContentType = $contentType
            try {
                $content = [System.IO.File]::ReadAllBytes($filePath)
                $response.ContentLength64 = $content.Length
                $response.OutputStream.Write($content, 0, $content.Length)
                $response.StatusCode = 200
                Write-Host "200 OK  " -ForegroundColor Green -NoNewline
                Write-Host $request.Url.LocalPath
            } catch {
                $response.StatusCode = 500
                Write-Host "500 ERR " -ForegroundColor Red -NoNewline
                Write-Host $request.Url.LocalPath
            }
        } else {
            $response.StatusCode = 404
            Write-Host "404 NOT " -ForegroundColor Yellow -NoNewline
            Write-Host $request.Url.LocalPath
        }
        $response.Close()
    }
} finally {
    $listener.Stop()
}
