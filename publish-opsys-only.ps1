<#
  原型发布 · 只发运营端（opsys）
  ============================================================
  与 publish.ps1 的区别：
    publish.ps1   三端整体镜像 + 一次性 git add -A 提交，
                  会把发布仓库里其他端遗留的未提交改动一并带上线。
    本脚本        只镜像并提交 opsys/，其他端的改动原样保留、不提交。
  version.json 仍然记录三端信息，未发布的端显示「无改动」。

  怎么用：
    powershell -NoProfile -ExecutionPolicy Bypass -File .\publish-opsys-only.ps1 -Message "提交说明"
#>
[CmdletBinding()]
param(
  [string]$Message
)

$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }

$RepoRoot   = $PSScriptRoot
$SourceBase = Split-Path $RepoRoot -Parent
$SiteUrl    = 'https://weiyifu13757187351.github.io/smart-catering-recipe-prototype/'
$Branch     = 'main'

# 本次只发布这些 key
$PublishKeys = @('opsys')

# 三端源目录（version.json 需要全部三端的信息）
$Sources = [ordered]@{
  'tenant'   = @{ label = '租户端'; path = (Join-Path $SourceBase 'restaurant-saas-tenant-prototype-unified-recipe-annotated') }
  'merchant' = @{ label = '商户端'; path = (Join-Path $SourceBase 'merchant-recipe-annotated') }
  'opsys'    = @{ label = '运营端'; path = 'C:\Users\18024\Documents\ChatGPT\运营端\smart-catering-product-center-prototype-local' }
}

function Write-Step($m)  { Write-Host ""; Write-Host "=== $m ===" -ForegroundColor Cyan }
function Write-Ok($m)    { Write-Host "  [OK] $m" -ForegroundColor Green }
function Write-Note($m)  { Write-Host "  [!] $m" -ForegroundColor Yellow }
function Write-Err($m)   { Write-Host "  [X] $m" -ForegroundColor Red }

function Invoke-Native {
  param([scriptblock]$Command)
  $prev = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try { & $Command } finally { $ErrorActionPreference = $prev }
}

function New-VersionFile {
  param(
    [string]$Label,
    [string]$PublishedAt,
    [hashtable]$SourceAt,
    [hashtable]$Summaries
  )
  $changes = [ordered]@{}
  $version = [ordered]@{
    publishedAt  = $PublishedAt
    publishLabel = $Label
  }
  foreach ($key in $Sources.Keys) {
    $version["${key}SourceAt"] = $SourceAt[$key]
    $s = $Summaries[$key]
    $changes[$key] = [pscustomobject]@{
      modules   = @($s.modules)
      moreCount = $s.moreCount
      fileCount = $s.fileCount
    }
  }
  $version['changes'] = [pscustomobject]$changes
  $version['site']    = $SiteUrl

  $p = Join-Path $RepoRoot 'version.json'
  [System.IO.File]::WriteAllText($p, ([pscustomobject]$version | ConvertTo-Json -Depth 6), (New-Object System.Text.UTF8Encoding($false)))
}

. (Join-Path $RepoRoot 'module-map.ps1')

Write-Host ''
Write-Host '原型发布 · 只发运营端' -ForegroundColor White
Write-Host "发布仓库：$RepoRoot" -ForegroundColor DarkGray

Push-Location $RepoRoot
try {
  Write-Step '0/5 环境检查'
  if (-not (Get-Command git -ErrorAction SilentlyContinue)) { Write-Err '未找到 git'; exit 1 }
  if (-not (Test-Path (Join-Path $RepoRoot '.git'))) { Write-Err "当前目录不是 git 仓库：$RepoRoot"; exit 1 }
  foreach ($key in $PublishKeys) {
    $p = $Sources[$key].path
    if (-not (Test-Path $p)) { Write-Err "找不到 $($Sources[$key].label) 源目录：$p"; exit 1 }
    Write-Ok "本次发布 $($Sources[$key].label)：$p"
  }

  $others = @(Invoke-Native { git diff --name-only -- tenant merchant 2>$null } | Where-Object { $_ -and "$_".Trim() })
  if ($others.Count -gt 0) {
    Write-Note "其他端有 $($others.Count) 个未提交文件，本次【不会】提交它们："
    $others | Select-Object -First 8 | ForEach-Object { Write-Host "      $_" -ForegroundColor DarkYellow }
    if ($others.Count -gt 8) { Write-Host "      …" -ForegroundColor DarkYellow }
  }

  Write-Step '1/5 同步运营端源目录到发布仓库（整体镜像）'
  foreach ($key in $PublishKeys) {
    $src = $Sources[$key].path
    $dst = Join-Path $RepoRoot $key
    Write-Host "  $($Sources[$key].label)：$src" -ForegroundColor DarkGray
    robocopy $src $dst /MIR /XD .github /NFL /NDL /NJH /NJS /NP /R:1 /W:1 | Out-Null
    if ($LASTEXITCODE -ge 8) { Write-Err "同步 $($Sources[$key].label) 失败（robocopy 退出码 $LASTEXITCODE）"; exit 1 }
    Write-Ok "已同步 -> $dst"
  }

  Write-Step '2/5 统计本次发布信息'
  $now = Get-Date -Format 'yyyy-MM-dd HH:mm'
  $SourceAt = @{}
  foreach ($key in $Sources.Keys) {
    $latest = Get-ChildItem $Sources[$key].path -Recurse -File -ErrorAction SilentlyContinue |
              Sort-Object LastWriteTime -Descending | Select-Object -First 1
    $v = '-'
    if ($latest) { $v = $latest.LastWriteTime.ToString('yyyy-MM-dd HH:mm') }
    $SourceAt[$key] = $v
  }
  Write-Ok "发布时刻：$now"
  Write-Ok ("原型最后修改：" + (($Sources.Keys | ForEach-Object { "$($Sources[$_].label) $($SourceAt[$_])" }) -join ' / '))

  Write-Step '3/5 只暂存运营端与 version.json'
  # 先清空暂存区，确保不带入任何其他端的文件（不改工作区内容）
  Invoke-Native { git reset -q } | Out-Null
  foreach ($key in $PublishKeys) { Invoke-Native { git add -- $key } | Out-Null }

  $stagedSite = @(Invoke-Native { git diff --cached --name-only 2>$null } | Where-Object { $_ -and "$_".Trim() })
  if ($stagedSite.Count -eq 0) {
    Write-Note '运营端内容没有变化，无需推送（线上已是最新）。'
    Write-Host ''
    Write-Host "线上地址：$SiteUrl" -ForegroundColor Green
    exit 0
  }

  $Summaries = @{}
  foreach ($key in $Sources.Keys) {
    $prefix = '^' + [regex]::Escape($key) + '/'
    $files  = @($stagedSite | Where-Object { $_ -match $prefix } | ForEach-Object { $_ -replace $prefix, '' })
    $Summaries[$key] = Get-ChangeSummary -Files $files
  }

  if (-not $Message) { $Message = "运营端：更新原型 $now" }
  New-VersionFile -Label $Message -PublishedAt $now -SourceAt $SourceAt -Summaries $Summaries
  Invoke-Native { git add -- version.json } | Out-Null

  $staged = @(Invoke-Native { git diff --cached --name-only 2>$null } | Where-Object { $_ -and "$_".Trim() })
  Write-Host "  本次提交文件数：$($staged.Count)" -ForegroundColor DarkGray
  $staged | ForEach-Object { Write-Host "      $_" -ForegroundColor DarkGray }
  $sum = $Summaries['opsys']
  $more = ''
  if ($sum.moreCount -gt 0) { $more = "，另有 $($sum.moreCount) 个模块" }
  Write-Host "    本次更新（运营端）：$($sum.modules -join '、')$more（$($sum.fileCount) 个文件）" -ForegroundColor DarkGray

  Write-Step '4/5 提交并推送到 GitHub'
  Invoke-Native { git commit -m $Message --quiet } | Out-Null
  if ($LASTEXITCODE -ne 0) { Write-Err '提交失败。'; exit 1 }
  Write-Ok "已提交：$Message"

  Invoke-Native { git push origin $Branch } | Out-Null
  if ($LASTEXITCODE -ne 0) { Write-Err '推送失败：检查网络或 gh auth status'; exit 1 }
  Write-Ok '推送成功'

  Write-Step '5/5 等待线上部署（GitHub Actions）'
  if (Get-Command gh -ErrorAction SilentlyContinue) {
    $runId = $null
    for ($i = 0; $i -lt 6 -and -not $runId; $i++) {
      Start-Sleep -Seconds 4
      $runId = Invoke-Native { gh run list --branch $Branch --limit 1 --json databaseId --jq '.[0].databaseId' 2>$null }
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
      if ($st -and $st.conclusion -eq 'success') { Write-Ok '线上部署完成，已是最新版本' }
      elseif ($st -and $st.conclusion) { Write-Note "部署结束，结论：$($st.conclusion)" }
      else { Write-Note '部署仍在进行，稍后刷新线上地址即可' }
    } else {
      Write-Note '未读取到 Actions 运行状态，稍后直接刷新线上地址即可'
    }
  } else {
    Write-Note '未安装 GitHub CLI，跳过部署状态检查'
  }

  if (Get-Command node -ErrorAction SilentlyContinue) {
    $verifyScript = Join-Path $RepoRoot 'verify-live.mjs'
    if (Test-Path $verifyScript) {
      Write-Host ''
      Write-Host '  正在自检线上资源…' -ForegroundColor DarkGray
      $vout = @(Invoke-Native { node $verifyScript 2>$null })
      $summary = @($vout | Where-Object { "$_".Trim() }) | Select-Object -Last 1
      if ($summary) { Write-Ok "自检：$("$summary".Trim())" }
    }
  }

  Write-Host ''
  Write-Host '完成！线上地址：' -ForegroundColor Green
  Write-Host "  $SiteUrl" -ForegroundColor White
  Write-Host ''
  exit 0
}
finally {
  Pop-Location
}
