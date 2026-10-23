# 页面标注需求映射矩阵

> 仅统计已声明需求 ID 的映射，不证明 PRD 完整性、来源有效性或 DOM 挂载成功。

| 模块 | 来源需求 | 来源位置 | 页面 | 标注Key | 状态 |
| --- | --- | --- | --- | --- | --- |
| tenant-recipe-management | `REQ-01-SCOPE` | ../租户端菜谱管理与授权PRD.md#3. 核心业务原则 | 租户端菜谱管理 | `tenant-recipe-management:hub-scope`, `tenant-recipe-management:auth-select-recipes`, `tenant-recipe-management:list-actions` | 已映射 |
| tenant-recipe-management | `REQ-02-HUB` | ../租户端菜谱管理与授权PRD.md#5. 菜谱管理工作台 | 菜谱管理工作台 | `tenant-recipe-management:hub-scope` | 已映射 |
| tenant-recipe-management | `REQ-03-LIST` | ../租户端菜谱管理与授权PRD.md#6. 菜谱库 | 菜谱库 | `tenant-recipe-management:list-rules` | 已映射 |
| tenant-recipe-management | `REQ-04-LIST-FILTER` | ../租户端菜谱管理与授权PRD.md#6.2 筛选项（默认可见） | 菜谱库 | `tenant-recipe-management:list-filters`, `tenant-recipe-management:list-more-filters` | 已映射 |
| tenant-recipe-management | `REQ-05-LIST-TABLE` | ../租户端菜谱管理与授权PRD.md#6.5 列表字段 | 菜谱库 | `tenant-recipe-management:list-table` | 已映射 |
| tenant-recipe-management | `REQ-06-LIST-ACTION` | ../租户端菜谱管理与授权PRD.md#6.7 行操作 | 菜谱库 | `tenant-recipe-management:list-actions` | 已映射 |
| tenant-recipe-management | `REQ-07-LIST-BATCH` | ../租户端菜谱管理与授权PRD.md#6.8 批量操作 | 菜谱库 | `tenant-recipe-management:list-rules` | 已映射 |
| tenant-recipe-management | `REQ-08-DELIVERY` | ../租户端菜谱管理与授权PRD.md#6.9 下发记录 | 菜谱库 | `tenant-recipe-management:list-rules` | 已映射 |
| tenant-recipe-management | `REQ-09-EDITOR` | ../租户端菜谱管理与授权PRD.md#7. 新建 / 编辑菜谱 | 租户端菜谱编辑 | `tenant-recipe-management:editor-submit`, `tenant-recipe-management:editor-actions` | 已映射 |
| tenant-recipe-management | `REQ-10-EDITOR-BASIC` | ../租户端菜谱管理与授权PRD.md#7.3 基础信息字段 | 租户端菜谱编辑 | `tenant-recipe-management:editor-basic` | 已映射 |
| tenant-recipe-management | `REQ-11-EDITOR-INGREDIENT` | ../租户端菜谱管理与授权PRD.md#7.5 用料明细 | 租户端菜谱编辑 | `tenant-recipe-management:editor-ingredients` | 已映射 |
| tenant-recipe-management | `REQ-12-EDITOR-PROCESS` | ../租户端菜谱管理与授权PRD.md#7.6 加工步骤 | 租户端菜谱编辑 | `tenant-recipe-management:editor-process` | 已映射 |
| tenant-recipe-management | `REQ-13-EDITOR-OPERATION` | ../租户端菜谱管理与授权PRD.md#7.6.5 设备操作步骤编辑抽屉 | 租户端菜谱编辑 | `tenant-recipe-management:editor-operation` | 已映射 |
| tenant-recipe-management | `REQ-14-SUBMIT` | ../租户端菜谱管理与授权PRD.md#7.7 提交校验 | 租户端菜谱编辑 | `tenant-recipe-management:editor-submit`, `tenant-recipe-management:editor-actions` | 已映射 |
| tenant-recipe-management | `REQ-15-DETAIL` | ../租户端菜谱管理与授权PRD.md#8. 菜谱详情 | 菜谱详情 | `tenant-recipe-management:detail-rules`, `tenant-recipe-management:detail-basic`, `tenant-recipe-management:detail-ingredients`, `tenant-recipe-management:detail-nutrition`, `tenant-recipe-management:detail-process` | 已映射 |
| tenant-recipe-management | `REQ-16-VERSION` | ../租户端菜谱管理与授权PRD.md#8.2 版本切换 | 菜谱详情 | `tenant-recipe-management:detail-rules` | 已映射 |
| tenant-recipe-management | `REQ-17-CATEGORY` | ../租户端菜谱管理与授权PRD.md#9. 分类管理 | 分类管理 | `tenant-recipe-management:category-rules`, `tenant-recipe-management:category-table`, `tenant-recipe-management:category-tree` | 已映射 |
| tenant-recipe-management | `REQ-18-DICTIONARY` | ../租户端菜谱管理与授权PRD.md#10. 菜谱标签与字典 | 菜谱标签与字典 | `tenant-recipe-management:dictionary-rules`, `tenant-recipe-management:dictionary-editor`, `tenant-recipe-management:dictionary-filters`, `tenant-recipe-management:dictionary-table`, `tenant-recipe-management:dictionary-types` | 已映射 |
| tenant-recipe-management | `REQ-19-AUTH-LIST` | ../租户端菜谱管理与授权PRD.md#11.1 授权列表页 | 菜谱授权 | `tenant-recipe-management:auth-list-rules`, `tenant-recipe-management:auth-batches` | 已映射 |
| tenant-recipe-management | `REQ-20-AUTH-CREATE` | ../租户端菜谱管理与授权PRD.md#11.2 新建授权（三步向导） | 菜谱授权 | `tenant-recipe-management:auth-create-rules`, `tenant-recipe-management:auth-confirm`, `tenant-recipe-management:auth-preview`, `tenant-recipe-management:auth-select-merchants`, `tenant-recipe-management:auth-select-recipes` | 已映射 |
| tenant-recipe-management | `REQ-21-AUTH-DETAIL` | ../租户端菜谱管理与授权PRD.md#11.3 授权详情 | 菜谱授权 | `tenant-recipe-management:auth-detail-rules`, `tenant-recipe-management:auth-detail` | 已映射 |
| tenant-recipe-management | `REQ-22-EDGE` | ../租户端菜谱管理与授权PRD.md#12. 异常与边界 | 租户端菜谱管理 | `tenant-recipe-management:category-rules`, `tenant-recipe-management:dictionary-rules`, `tenant-recipe-management:auth-batches`, `tenant-recipe-management:auth-detail`, `tenant-recipe-management:detail-nutrition` | 已映射 |
| tenant-recipe-management | `REQ-23-BOUNDARY` | ../租户端菜谱管理与授权PRD.md#14. 第一期不包含 | 租户端菜谱管理 | `tenant-recipe-management:scope-boundary` | 已映射 |
| tenant-recipe-management | `REQ-24-DICT-CODE` | ../租户端菜谱管理与授权PRD.md#10.7 字典编码规则 | 菜谱标签与字典 | `tenant-recipe-management:dictionary-rules` | 已映射 |
| tenant-recipe-management | `REQ-25-DICT-CASCADE` | ../租户端菜谱管理与授权PRD.md#10.6 停用与删除 | 菜谱标签与字典 | `tenant-recipe-management:dictionary-rules`, `tenant-recipe-management:dictionary-table` | 已映射 |
| tenant-recipe-management | `REQ-26-DICT-IMPACT` | ../租户端菜谱管理与授权PRD.md#10.6 停用与删除 | 租户端菜谱管理 | `tenant-recipe-management:dictionary-rules`, `tenant-recipe-management:editor-submit`, `tenant-recipe-management:auth-select-recipes`, `tenant-recipe-management:detail-basic`, `tenant-recipe-management:dictionary-table`, `tenant-recipe-management:editor-basic`, `tenant-recipe-management:list-table` | 已映射 |
| tenant-recipe-management | `REQ-27-V2-PROCESS` | ../租户端菜谱管理-加工步骤与用料明细变更说明PRD.md#3 加工步骤变更 | 租户端菜谱编辑 | `tenant-recipe-management:editor-operation`, `tenant-recipe-management:editor-process` | 已映射 |
| tenant-recipe-management | `REQ-28-V2-INGREDIENT` | ../租户端菜谱管理-加工步骤与用料明细变更说明PRD.md#4 用料明细变更 | 租户端菜谱编辑 | `tenant-recipe-management:detail-ingredients`, `tenant-recipe-management:editor-ingredients`, `tenant-recipe-management:editor-process` | 已映射 |
| tenant-recipe-management | `REQ-29-V2-VALIDATE` | ../租户端菜谱管理-加工步骤与用料明细变更说明PRD.md#5 校验与提交变更 | 租户端菜谱编辑 | `tenant-recipe-management:editor-submit` | 已映射 |
| tenant-recipe-management | `REQ-30-V2-READONLY` | ../租户端菜谱管理-加工步骤与用料明细变更说明PRD.md#7 影响与联动 | 菜谱详情 | `tenant-recipe-management:detail-rules`, `tenant-recipe-management:detail-ingredients`, `tenant-recipe-management:detail-process` | 已映射 |
| tenant-recipe-management | `SUP-01-LIST` | 租户端供应商管理PRD.md#6. 列表页 | 供应商管理 | `tenant-recipe-management:sup-list-rules` | 已映射 |
| tenant-recipe-management | `SUP-02-PRINCIPLE` | 租户端供应商管理PRD.md#1. 背景与目标 | 供应商管理 | `tenant-recipe-management:sup-list-note` | 已映射 |
| tenant-recipe-management | `SUP-03-FILTER` | 租户端供应商管理PRD.md#6. 列表页 | 供应商管理 | `tenant-recipe-management:sup-list-filters` | 已映射 |
| tenant-recipe-management | `SUP-04-ROWS` | 租户端供应商管理PRD.md#6. 列表页 | 供应商管理 | `tenant-recipe-management:sup-list-rows` | 已映射 |
| tenant-recipe-management | `SUP-05-CREATE` | 租户端供应商管理PRD.md#7. 新建供应商 | 新建供应商 | `tenant-recipe-management:sup-create-rules` | 已映射 |
| tenant-recipe-management | `SUP-06-LIC` | 租户端供应商管理PRD.md#5. 关键规则 | 新建供应商 | `tenant-recipe-management:sup-lic` | 已映射 |
| tenant-recipe-management | `SUP-07-ACCOUNT` | 租户端供应商管理PRD.md#5. 关键规则 | 供应商管理 | `tenant-recipe-management:sup-list-rules`, `tenant-recipe-management:sup-account`, `tenant-recipe-management:sup-detail-account`, `tenant-recipe-management:sup-list-rows` | 已映射 |
| tenant-recipe-management | `SUP-08-TYPES` | 租户端供应商管理PRD.md#5. 关键规则 | 供应商管理 | `tenant-recipe-management:sup-types` | 已映射 |
| tenant-recipe-management | `SUP-09-MERCHANTS` | 租户端供应商管理PRD.md#5. 关键规则 | 供应商管理 | `tenant-recipe-management:sup-detail-merchants`, `tenant-recipe-management:sup-merchants` | 已映射 |
| tenant-recipe-management | `SUP-10-DETAIL` | 租户端供应商管理PRD.md#8. 详情抽屉（可编辑性矩阵） | 供应商详情 | `tenant-recipe-management:sup-detail-rules` | 已映射 |
| tenant-recipe-management | `SUP-11-CROSS` | 租户端供应商管理PRD.md#10. 跨租户口径 | 供应商管理 | `tenant-recipe-management:sup-create-rules`, `tenant-recipe-management:sup-detail-rules`, `tenant-recipe-management:sup-list-rules`, `tenant-recipe-management:sup-global`, `tenant-recipe-management:sup-list-note` | 已映射 |
| tenant-recipe-management | `SUP-12-SCOPE` | 租户端供应商管理PRD.md#附录A 与商户端供应商管理的关系 | 供应商管理 | `tenant-recipe-management:sup-global` | 已映射 |
| tenant-recipe-management | `SUP-13-OPEN` | 租户端供应商管理PRD.md#13. 待确认 | 供应商管理 | `tenant-recipe-management:sup-global` | 已映射 |
