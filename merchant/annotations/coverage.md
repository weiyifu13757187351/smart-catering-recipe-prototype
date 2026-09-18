# 页面标注需求映射矩阵

> 仅统计已声明需求 ID 的映射，不证明 PRD 完整性、来源有效性或 DOM 挂载成功。

| 模块 | 来源需求 | 来源位置 | 页面 | 标注Key | 状态 |
| --- | --- | --- | --- | --- | --- |
| merchant-recipe-management | `REQ-01-SOURCE` | ../商户端菜谱管理PRD.md#3. 数据来源 | 菜谱库 | `merchant-recipe-management:list-rules`, `merchant-recipe-management:list-source-col` | 已映射 |
| merchant-recipe-management | `REQ-02-ORG-SCOPE` | ../商户端菜谱管理PRD.md#2. 角色与数据范围 | 菜谱库 | `merchant-recipe-management:hub-rules`, `merchant-recipe-management:list-rules`, `merchant-recipe-management:list-org-note` | 已映射 |
| merchant-recipe-management | `REQ-03-HUB` | ../商户端菜谱管理PRD.md#4. 入口与页面结构 | 菜谱管理工作台 | `merchant-recipe-management:hub-rules`, `merchant-recipe-management:hub-library-entry` | 已映射 |
| merchant-recipe-management | `REQ-04-LIST-FIELD` | ../商户端菜谱管理PRD.md#5.3 列表字段 | 菜谱库 | `merchant-recipe-management:list-rules`, `merchant-recipe-management:list-process-col`, `merchant-recipe-management:list-rows`, `merchant-recipe-management:list-tags-col`, `merchant-recipe-management:list-update-col` | 已映射 |
| merchant-recipe-management | `REQ-05-LIST-FILTER` | ../商户端菜谱管理PRD.md#5.4 筛选项（默认可见） | 菜谱库 | `merchant-recipe-management:list-filters`, `merchant-recipe-management:list-reset` | 已映射 |
| merchant-recipe-management | `REQ-06-LIST-MORE-FILTER` | ../商户端菜谱管理PRD.md#5.5 更多筛选 | 菜谱库 | `merchant-recipe-management:list-more-filters` | 已映射 |
| merchant-recipe-management | `REQ-07-LIST-ACTION` | ../商户端菜谱管理PRD.md#5.6 行操作 | 菜谱库 | `merchant-recipe-management:list-action-col` | 已映射 |
| merchant-recipe-management | `REQ-08-LIST-BUTTON` | ../商户端菜谱管理PRD.md#5.1 页面结构 | 菜谱库 | `merchant-recipe-management:list-rules` | 已映射 |
| merchant-recipe-management | `REQ-09-SYNC-ENTRY` | ../商户端菜谱管理PRD.md#6.1 入口与数量气泡 | 同步租户授权菜谱 | `merchant-recipe-management:list-sync-button` | 已映射 |
| merchant-recipe-management | `REQ-10-SYNC-COND` | ../商户端菜谱管理PRD.md#6.2 可同步条件 | 同步租户授权菜谱 | `merchant-recipe-management:sync-rules`, `merchant-recipe-management:sync-rows` | 已映射 |
| merchant-recipe-management | `REQ-11-SYNC-DRAWER` | ../商户端菜谱管理PRD.md#6.3 同步抽屉 | 同步租户授权菜谱 | `merchant-recipe-management:sync-rules`, `merchant-recipe-management:sync-cancel`, `merchant-recipe-management:sync-category-tree`, `merchant-recipe-management:sync-summary`, `merchant-recipe-management:sync-tools` | 已映射 |
| merchant-recipe-management | `REQ-12-SYNC-RESULT` | ../商户端菜谱管理PRD.md#6.4 同步结果 | 同步租户授权菜谱 | `merchant-recipe-management:sync-confirm` | 已映射 |
| merchant-recipe-management | `REQ-13-SYNC-FAIL` | ../商户端菜谱管理PRD.md#6.5 同步失败与部分成功 | 同步租户授权菜谱 | `merchant-recipe-management:sync-confirm` | 已映射 |
| merchant-recipe-management | `REQ-14-EDITOR` | ../商户端菜谱管理PRD.md#7. 新建与编辑菜谱 | 新建与编辑菜谱 | `merchant-recipe-management:editor-basic-rules`, `merchant-recipe-management:list-create-button` | 已映射 |
| merchant-recipe-management | `REQ-15-EDITOR-BASIC` | ../商户端菜谱管理PRD.md#7.5 基础信息字段 | 新建与编辑菜谱 | `merchant-recipe-management:editor-basic-fields`, `merchant-recipe-management:editor-category-field` | 已映射 |
| merchant-recipe-management | `REQ-16-EDITOR-INGREDIENT` | ../商户端菜谱管理PRD.md#7.6 用料明细 | 新建与编辑菜谱 | `merchant-recipe-management:editor-ingredients-rules`, `merchant-recipe-management:editor-ingredients-fields` | 已映射 |
| merchant-recipe-management | `REQ-17-EDITOR-PROCESS` | ../商户端菜谱管理PRD.md#7.7 加工步骤 | 新建与编辑菜谱 | `merchant-recipe-management:editor-process-rules`, `merchant-recipe-management:editor-process-modes` | 已映射 |
| merchant-recipe-management | `REQ-18-EDITOR-SUBMIT` | ../商户端菜谱管理PRD.md#7.8 提交 | 新建与编辑菜谱 | `merchant-recipe-management:editor-footer` | 已映射 |
| merchant-recipe-management | `REQ-19-DETAIL` | ../商户端菜谱管理PRD.md#8.1 详情结构 | 菜谱详情 | `merchant-recipe-management:detail-current-rules`, `merchant-recipe-management:detail-current-tabs`, `merchant-recipe-management:detail-latest-tabs` | 已映射 |
| merchant-recipe-management | `REQ-20-VERSION-SWITCH` | ../商户端菜谱管理PRD.md#8.2 版本切换 | 菜谱详情 | `merchant-recipe-management:detail-version-switch`, `merchant-recipe-management:list-version-col` | 已映射 |
| merchant-recipe-management | `REQ-21-VERSION-UPDATE` | ../商户端菜谱管理PRD.md#8.3 更新到此版本 | 菜谱详情 | `merchant-recipe-management:detail-latest-rules`, `merchant-recipe-management:detail-update-action` | 已映射 |
| merchant-recipe-management | `REQ-22-CATEGORY` | ../商户端菜谱管理PRD.md#9. 菜谱分类（只读） | 菜谱分类 | `merchant-recipe-management:categories-rules`, `merchant-recipe-management:categories-readonly-note`, `merchant-recipe-management:categories-tree`, `merchant-recipe-management:hub-category-entry` | 已映射 |
| merchant-recipe-management | `REQ-23-CATEGORY-IMPACT` | ../商户端菜谱管理PRD.md#9.4 分类失效对商户端的影响 | 菜谱分类 | `merchant-recipe-management:categories-table`, `merchant-recipe-management:editor-category-field`, `merchant-recipe-management:sync-rows` | 已映射 |
| merchant-recipe-management | `REQ-24-STATUS` | ../商户端菜谱管理PRD.md#10.1 自建菜谱状态 | 状态与权限 | `merchant-recipe-management:editor-footer`, `merchant-recipe-management:list-version-col` | 已映射 |
| merchant-recipe-management | `REQ-25-PERM` | ../商户端菜谱管理PRD.md#10.2 组织菜谱操作权限 | 状态与权限 | `merchant-recipe-management:list-action-col` | 已映射 |
| merchant-recipe-management | `REQ-26-TENANT-IMPACT` | ../商户端菜谱管理PRD.md#10.4 租户侧变化对商户端的影响 | 状态与权限 | `merchant-recipe-management:list-rules` | 已映射 |
| merchant-recipe-management | `REQ-27-EXCEPTION` | ../商户端菜谱管理PRD.md#11. 异常与边界场景 | 异常与边界 | `merchant-recipe-management:list-rows` | 已映射 |
| merchant-recipe-management | `REQ-28-DATA-SOURCE` | ../商户端菜谱管理PRD.md#3.2 原型演示数据来源 | 数据来源 | `merchant-recipe-management:list-rules` | 已映射 |
