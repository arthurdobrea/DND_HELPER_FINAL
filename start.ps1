# Запуск в Docker с IP этого компа в сети: по нему страница «Подключение» рисует QR для телефонов.
# Свежая веб-сборка игрока; при любой ошибке — предупреждение, запуск идёт дальше.
& "$PSScriptRoot/update-player.ps1"
$route = Get-NetRoute -DestinationPrefix 0.0.0.0/0 | Sort-Object RouteMetric | Select-Object -First 1
$env:LAN_IP = (Get-NetIPAddress -AddressFamily IPv4 -InterfaceIndex $route.InterfaceIndex | Select-Object -First 1).IPAddress
Write-Host "LAN_IP = $env:LAN_IP"
docker compose up -d --build @args
