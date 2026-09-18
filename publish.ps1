<#
  食联网数智餐饮平台 · 原型一键发布
  ============================================================
  做什么：
    1) 把两个原型「源目录」的内容整体同步到本发布仓库的 tenant\、merchant\
    2) 生成线上版本信息 version.json（入口页会显示版本时间）
    3) 提交并推送到 GitHub，GitHub Actions 自动部署到 GitHub Pages（线上链接固定不变）

  怎么用：
    双击同目录下的  一键发布.bat
    或在本目录执行：powershell -NoProfile -ExecutionPolicy Bypass -File .\publish.ps1

  参数：
    -Force     忽略「发布仓库副本被直接改过」的提醒，强制以源目录为准
    -Message   自定义提交说明，例如：-Message "更新租户端加工步骤"

  重要：
    原型请修改「源目录」（见下方 $Sources），不要直接改本目录的 tenant\、merchant\，
    这两个目录每次发布会按源目录内容整体覆盖（多余文件会被删除）。
#>
[CmdletBinding()]
param(
  [switch]$Force,
  [string]$Message
)

$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }

$RepoRoot   = $PSScriptRoot
$SourceBase = Split-Path $RepoRoot -Parent
$SiteUrl    = 'https://weiyifu13757187351.github.io/smart-catering-recipe-prototype/'
$Branch     = 'main'

# ============ 原型源目录（搬家时只改这里） ============
$Sources = [ordered]@{
  'tenant'   = @{ label = '租户端'; path = (Join-Path $SourceBase 'restaurant-saas-tenant-prototype-unified-recipe-annotated') }
  'merchant' = @{ label = '商户端'; path = (Join-Path $SourceBase 'merchant-recipe-annotated') }
}

function Write-Step($m)  { Write-Host ""; Write-Host "=== $m ===" -ForegroundColor Cyan }
function Write-Ok($m)    { Write-Host "  [OK] $m" -ForegroundColor Green }
function Write-Note($m)  { Write-Host "  [!] $m" -ForegroundColor Yellow }
function Write-Err($m)   { Write-Host "  [X] $m" -ForegroundColor Red }

# git / gh 等外部命令：临时放开 ErrorActionPreference，
# 否则 Windows PowerShell 5.1 会把外部命令的 stderr 直接当成终止错误。
function Invoke-Native {
  param([scriptblock]$Command)
  $prev = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try { & $Command } finally { $ErrorActionPreference = $prev }
}

Write-Host ''
Write-Host '食联网数智餐饮平台 · 原型一键发布' -ForegroundColor White
Write-Host "发布仓库：$RepoRoot" -ForegroundColor DarkGray

Write-Step '0/5 环境检查'
if (-not (Get-Command git -ErrorAction SilentlyContinue)) { Write-Err '未找到 git，请先安装 Git for Windows。'; exit 1 }
if (-not (Test-Path (Join-Path $RepoRoot '.git'))) { Write-Err "当前目录不是 git 仓库：$RepoRoot"; exit 1 }
Push-Location $RepoRoot
try {
  foreach ($key in $Sources.Keys) {
    $p = $Sources[$key].path
    if (-not (Test-Path $p)) { Write-Err "找不到 $($Sources[$key].label) 源目录：$p"; exit 1 }
    Write-Ok "$($Sources[$key].label) 源目录：$p"
  }

  Write-Step '1/5 检查发布仓库副本是否被直接改动'
  $dirty = @()
  $dirty += @(Invoke-Native { git diff --name-only -- tenant merchant 2>$null })
  $dirty += @(Invoke-Native { git diff --cached --name-only -- tenant merchant 2>$null })
  $dirty = @($dirty | Where-Object { $_ -and "$_".Trim() } | Select-Object -Unique)
  if ($dirty.Count -gt 0) {
    Write-Note '发布仓库里的站点文件有未提交的改动（可能是有人直接改了 tenant\ 或 merchant\）：'
    $dirty | ForEach-Object { Write-Host "      $_" -ForegroundColor DarkYellow }
    if (-not $Force) {
      Write-Note '继续发布会用源目录的内容覆盖以上改动。'
      Write-Note '确认可以覆盖：重新运行并加上 -Force；否则请先把改动合并回源目录。'
      exit 2
    }
    Write-Note '已指定 -Force，将按源目录内容整体覆盖。'
  } else {
    Write-Ok '发布仓库副本干净，可以安全同步'
  }

  Write-Step '2/5 同步源目录到发布仓库（整体镜像）'
  foreach ($key in $Sources.Keys) {
    $src = $Sources[$key].path
    $dst = Join-Path $RepoRoot $key
    Write-Host "  $($Sources[$key].label)：$src" -ForegroundColor DarkGray
    robocopy $src $dst /MIR /XD .github /NFL /NDL /NJH /NJS /NP /R:1 /W:1 | Out-Null
    if ($LASTEXITCODE -ge 8) { Write-Err "同步 $($Sources[$key].label) 失败（robocopy 退出码 $LASTEXITCODE）"; exit 1 }
    Write-Ok "已同步 -> $dst"
  }

  Write-Step '3/5 生成线上版本信息'
  $now    = Get-Date -Format 'yyyy-MM-dd HH:mm'
  $commit = (Invoke-Native { git rev-parse --short HEAD 2>$null } | Select-Object -First 1)
  if (-not $commit) { $commit = 'initial' }
  $tenantAt = '-'; $merchantAt = '-'
  foreach ($key in $Sources.Keys) {
    $latest = Get-ChildItem $Sources[$key].path -Recurse -File -ErrorAction SilentlyContinue |
              Sort-Object LastWriteTime -Descending | Select-Object -First 1
    $v = '-'
    if ($latest) { $v = $latest.LastWriteTime.ToString('yyyy-MM-dd HH:mm') }
    if ($key -eq 'tenant') { $tenantAt = $v } else { $merchantAt = $v }
  }
  $version = [pscustomobject]@{
    publishedAt      = $now
    commit           = $commit
    tenantSourceAt   = $tenantAt
    merchantSourceAt = $merchantAt
    site             = $SiteUrl
  }
  $verPath = Join-Path $RepoRoot 'version.json'
  [System.IO.File]::WriteAllText($verPath, ($version | ConvertTo-Json -Depth 3), (New-Object System.Text.UTF8Encoding($false)))
  Write-Ok "version.json：$now / $commit"

  Write-Step '4/5 提交并推送到 GitHub'
  Invoke-Native { git add -A } | Out-Null
  $staged = @(Invoke-Native { git diff --cached --name-only 2>$null } | Where-Object { $_ -and "$_".Trim() })
  if ($staged.Count -eq 0) {
    Write-Note '站点内容没有变化，无需推送（线上已是最新）。'
    Write-Host ''
    Write-Host "线上地址：$SiteUrl" -ForegroundColor Green
    exit 0
  }
  Write-Host "  本次变更文件数：$($staged.Count)" -ForegroundColor DarkGray
  if (-not $Message) { $Message = "更新原型 $now" }
  $commitMessage = $Message
  Invoke-Native { git commit -m $commitMessage --quiet } | Out-Null
  if ($LASTEXITCODE -ne 0) { Write-Err '提交失败。'; exit 1 }
  Write-Ok "已提交：$commitMessage"
  $branch = $Branch
  Invoke-Native { git push origin $branch } | Out-Null
  if ($LASTEXITCODE -ne 0) {
    Write-Err '推送失败：请检查网络，或执行 gh auth status 确认 GitHub 登录状态。'
    exit 1
  }
  Write-Ok '推送成功'

  Write-Step '5/5 等待线上部署（GitHub Actions）'
  if (Get-Command gh -ErrorAction SilentlyContinue) {
    $runId = $null
    for ($i = 0; $i -lt 6 -and -not $runId; $i++) {
      Start-Sleep -Seconds 4
      $runId = Invoke-Native { gh run list --branch $branch --limit 1 --json databaseId --jq '.[0].databaseId' 2>$null }
      $runId = "$runId".Trim()
      if ($runId -eq 'null' -or $runId -eq '') { $runId = $null }
    }
    if ($runId) {
      $st = $null
      for ($i = 0; $i -lt 60; $i++) {
        try {
          $raw = Invoke-Native { gh run view $runId --json status,conclusion 2>$null }
          if ($raw) { $st = ($raw | ConvertFrom-Json) }
        } catch { $st = $null }
        if ($st -and $st.status -eq 'completed') { break }
        Start-Sleep -Seconds 5
      }
      if ($st -and $st.conclusion -eq 'success') {
        Write-Ok '线上部署完成，已是最新版本'
      } elseif ($st -and $st.conclusion) {
        Write-Note "部署结束，结论：$($st.conclusion)（排查：gh run view $runId --log-failed）"
      } else {
        Write-Note '部署仍在进行，稍后刷新线上地址即可'
      }
    } else {
      Write-Note '未读取到 Actions 运行状态，稍后直接刷新线上地址即可'
    }
  } else {
    Write-Note '未安装 GitHub CLI，跳过部署状态检查（约 30 秒后刷新线上地址即可）'
  }

  Write-Host ''
  Write-Host '完成！线上地址（固定不变，可直接发给别人）：' -ForegroundColor Green
  Write-Host "  $SiteUrl" -ForegroundColor White
  Write-Host '提示：若别人仍看到旧内容，让其按 Ctrl + F5 强制刷新。' -ForegroundColor DarkGray
  Write-Host ''
}
finally {
  Pop-Location
}
