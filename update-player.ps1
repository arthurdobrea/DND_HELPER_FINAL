# Свежая веб-сборка приложения игрока (DnD Tracker) в data/player. Берётся из релиза latest репозитория игрока (нужен gh с доступом).
# Любая ошибка (нет gh, нет сети, репозиторий недоступен) — только предупреждение: прежняя сборка остаётся, сервер запускается как обычно.
param([string]$Repo = "Stason1o/dnd-tracker")
$ErrorActionPreference = "Stop"
try {
    $tmp = Join-Path $env:TEMP "player-web-$([guid]::NewGuid())"
    New-Item -ItemType Directory $tmp | Out-Null
    gh release download latest -R $Repo -p player-web.zip -D $tmp --clobber
    if ($LASTEXITCODE -ne 0) { throw "gh release download: код $LASTEXITCODE" }
    Expand-Archive (Join-Path $tmp "player-web.zip") -DestinationPath (Join-Path $tmp "x") -Force
    # Копируем только после того, как всё скачано и распаковано: оборванная загрузка не портит data/player.
    $dest = Join-Path $PSScriptRoot "data/player"
    New-Item -ItemType Directory -Force $dest | Out-Null
    Copy-Item (Join-Path $tmp "x/*") $dest -Recurse -Force
    Write-Host "Веб-сборка игрока обновлена: $dest"
} catch {
    Write-Warning "Веб-сборку игрока обновить не удалось ($($_.Exception.Message)). Остаётся прежняя, сервер запускается как обычно."
} finally {
    if ($tmp -and (Test-Path $tmp)) { Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue }
}
exit 0
