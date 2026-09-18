<#
  原型改动 → 中文模块名 映射表
  ============================================================
  用途：发布的入口页会显示「本次更新」小结，把本次改动的文件名翻译成模块名。
  维护：在 $ModuleRules 里加一行即可。按顺序匹配，命中第一条就停，
        所以「具体的规则要放在宽泛的规则前面」。
        Pattern 是正则，匹配对象是「去掉 tenant/ 或 merchant/ 前缀后的相对路径」（小写）。
        Label = $null 表示该文件不参与小结（忽略）。
        没有命中任何规则的文件，会直接显示它自己的文件名。
#>
$ModuleRules = @(
  # ---- 忽略项（不是原型内容） ----
  @{ Pattern = '(^|/)\.';                                  Label = $null }
  @{ Pattern = '^_anno-verify';                            Label = $null }
  @{ Pattern = 'readme|\.ps1$|\.bat$|使用说明';             Label = $null }
  @{ Pattern = '_next|/chunks?/|/static/';                 Label = '前端构建产物' }

  # ---- 标注与文档 ----
  @{ Pattern = 'annotation';                               Label = '业务标注' }
  @{ Pattern = 'prd\.md$';                                 Label = 'PRD 文档' }

  # ---- 统一菜谱 ----
  @{ Pattern = 'unified-recipe-editor';                    Label = '统一菜谱编辑' }
  @{ Pattern = 'unified-recipe-list';                      Label = '统一菜谱列表' }
  @{ Pattern = 'merchant-unified-detail';                  Label = '统一菜谱详情' }
  @{ Pattern = 'merchant-unified-recipe';                  Label = '统一菜谱' }
  @{ Pattern = 'unified-recipe';                           Label = '统一菜谱' }

  # ---- 菜谱 ----
  @{ Pattern = 'dish-library';                             Label = '菜谱库' }
  @{ Pattern = 'dishes-detail';                            Label = '菜谱详情' }
  @{ Pattern = 'dishes';                                   Label = '菜谱列表' }
  @{ Pattern = 'dish-version';                             Label = '菜谱版本' }
  @{ Pattern = 'dish-authorization';                       Label = '菜谱授权' }
  @{ Pattern = 'tenant-recipe-auth';                       Label = '菜谱授权' }
  @{ Pattern = 'merchant-recipe-readonly';                 Label = '菜谱只读查看' }
  @{ Pattern = 'merchant-recipe-center';                   Label = '菜谱中心' }
  @{ Pattern = 'recipe-center-hubs';                       Label = '菜谱工作台' }
  @{ Pattern = 'recipe-center';                            Label = '菜谱中心' }

  # ---- 设备 ----
  @{ Pattern = 'merchant-device-recipe';                   Label = '设备菜谱' }
  @{ Pattern = 'device-recipes';                           Label = '设备菜谱' }
  @{ Pattern = 'merchant-native-device-editor';            Label = '设备编辑器' }
  @{ Pattern = 'merchant-device-list';                     Label = '设备列表' }
  @{ Pattern = 'merchant-device-status';                   Label = '设备状态' }
  @{ Pattern = 'merchant-device-update';                   Label = '设备更新' }
  @{ Pattern = 'tenant-device-dictionary';                 Label = '菜谱标签与字典' }
  @{ Pattern = 'device-dictionary';                        Label = '菜谱标签与字典' }
  @{ Pattern = 'tenant-device-center';                     Label = '租户设备中心' }
  @{ Pattern = 'tenant-device';                            Label = '租户设备' }
  @{ Pattern = 'device-center';                            Label = '设备中心' }

  # ---- 组织 / 权限 / 其他 ----
  @{ Pattern = 'merchant-meal-plan';                       Label = '餐次计划' }
  @{ Pattern = 'product-reference';                        Label = '商品中心引用' }
  @{ Pattern = 'product-center';                           Label = '商品中心' }
  @{ Pattern = 'roles';                                    Label = '角色权限' }
  @{ Pattern = 'level-attributes';                         Label = '组织层级' }
  @{ Pattern = 'merchant-credit';                          Label = '商户额度' }
  @{ Pattern = 'merchant-ops';                             Label = '商户运营' }
  @{ Pattern = 'formats';                                  Label = '业态模板' }
  @{ Pattern = 'editor';                                   Label = '菜谱编辑' }
  @{ Pattern = 'styles';                                   Label = '全局样式' }
  @{ Pattern = '组织及人员';                                Label = '组织及人员' }
  @{ Pattern = '登录页';                                    Label = '登录页' }
  @{ Pattern = 'index\.html';                              Label = '入口页' }
  @{ Pattern = '^app\.';                                   Label = '应用框架' }
)

<#
  把一批文件路径归纳成「本次更新」小结。
  返回：modules（模块名列表，最多 $MaxModules 个）、moreCount（未展示的模块数）、fileCount（文件数）
#>
function Get-ChangeSummary {
  param(
    [string[]]$Files,
    [int]$MaxModules = 6
  )
  $counts = @{}                                                    # 模块名 -> 文件数
  $order  = New-Object System.Collections.Generic.List[string]     # 首次出现顺序（并列时排序用）
  $fileCount = 0
  foreach ($f in $Files) {
    if (-not $f) { continue }
    $path = "$f".ToLower().Trim()
    if (-not $path) { continue }
    $fileCount++

    $label = $null
    $matched = $false
    foreach ($rule in $ModuleRules) {
      if ($path -match $rule.Pattern) { $label = $rule.Label; $matched = $true; break }
    }
    if (-not $matched) { $label = ($path -replace '^.*/', '' -replace '\.[a-z0-9]+$', '') }
    if ($null -eq $label) { continue }              # 显式忽略
    if ($counts.ContainsKey($label)) { $counts[$label] = $counts[$label] + 1 }
    else { $counts[$label] = 1; $order.Add($label) }
  }

  # 改动文件多的模块排前面（并列时保持首次出现顺序）
  $all = @($order | Sort-Object -Property @{ Expression = { $counts[$_] }; Descending = $true },
                                          @{ Expression = { $order.IndexOf($_) }; Descending = $false })
  $shown = @($all | Select-Object -First $MaxModules)
  [pscustomobject]@{
    modules   = $shown
    moreCount = [Math]::Max(0, $all.Count - $shown.Count)
    fileCount = $fileCount
  }
}
