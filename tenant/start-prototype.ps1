$ErrorActionPreference = 'Stop'
$prototypeRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $prototypeRoot

$port = 4175
Write-Host '食联网数智餐饮平台租户端本地原型已启动：' -ForegroundColor Green
Write-Host ("http://127.0.0.1:{0}/index.html" -f $port) -ForegroundColor Cyan
Write-Host '演示账号 admin / 密码 123456' -ForegroundColor Yellow
Write-Host '按 Ctrl+C 停止服务。' -ForegroundColor DarkGray

if (Get-Command python -ErrorAction SilentlyContinue) {
    python -m http.server $port --bind 127.0.0.1
} elseif (Get-Command py -ErrorAction SilentlyContinue) {
    py -m http.server $port --bind 127.0.0.1
} else {
    throw '未找到 Python。请安装 Python 3，或使用任意静态文件服务器打开本目录。'
}