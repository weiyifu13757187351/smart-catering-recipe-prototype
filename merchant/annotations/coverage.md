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
| merchant-recipe-management | `REQ-09-SYNC-ENTRY` | ../商户端菜谱管理PRD.md#6.1 入口与数量气泡 | 同步租户授权菜谱 | `merchant-recipe-management:sync-sku-gate`, `merchant-recipe-management:list-sync-button` | 已映射 |
| merchant-recipe-management | `REQ-10-SYNC-COND` | ../商户端菜谱管理PRD.md#6.2 可同步条件 | 同步租户授权菜谱 | `merchant-recipe-management:sync-rules`, `merchant-recipe-management:sync-sku-gate`, `merchant-recipe-management:sync-rows` | 已映射 |
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
| merchant-recipe-management | `REQ-26-TENANT-IMPACT` | ../商户端菜谱管理PRD.md#10.4 租户侧变化对商户端的影响 | 状态与权限 | `merchant-recipe-management:detail-current-rules`, `merchant-recipe-management:editor-basic-rules`, `merchant-recipe-management:list-rules`, `merchant-recipe-management:sync-rules`, `merchant-recipe-management:editor-basic-fields`, `merchant-recipe-management:editor-footer`, `merchant-recipe-management:list-tags-col`, `merchant-recipe-management:sync-category-tree`, `merchant-recipe-management:sync-rows`, `merchant-recipe-management:sync-summary` | 已映射 |
| merchant-recipe-management | `REQ-27-EXCEPTION` | ../商户端菜谱管理PRD.md#11. 异常与边界场景 | 异常与边界 | `merchant-recipe-management:list-rows` | 已映射 |
| merchant-recipe-management | `REQ-28-DATA-SOURCE` | ../商户端菜谱管理PRD.md#3.2 原型演示数据来源 | 数据来源 | `merchant-recipe-management:list-rules` | 已映射 |
| merchant-recipe-management | `REQ-29-EDITOR-OPERATION` | ../商户端菜谱管理PRD.md#7.7.1 设备操作步骤编辑抽屉 | 新建与编辑菜谱 | `merchant-recipe-management:editor-operation` | 已映射 |
| merchant-recipe-management | `REQ-30-SKU-GATE` | ../商户端菜谱管理PRD.md#6.3.1 SKU 商品前置校验 | 同步租户授权菜谱 | `merchant-recipe-management:sync-rules`, `merchant-recipe-management:sync-sku-gate`, `merchant-recipe-management:list-sync-button`, `merchant-recipe-management:sync-confirm`, `merchant-recipe-management:sync-rows`, `merchant-recipe-management:sync-summary` | 已映射 |
| merchant-stall-management | `STALL-01-PAGE` | 商户端档口列表与组织切换器PRD.md#5.1 入口与布局 | 档口列表 | `merchant-stall-management:stall-list-rules`, `merchant-stall-management:stall-list-add` | 已映射 |
| merchant-stall-management | `STALL-02-LIST-FIELD` | 商户端档口列表与组织切换器PRD.md#5.2 列表字段 | 档口列表 | `merchant-stall-management:stall-list-table` | 已映射 |
| merchant-stall-management | `STALL-03-SORT` | 商户端档口列表与组织切换器PRD.md#5.3 排序与分页 | 档口列表 | `merchant-stall-management:stall-list-rules` | 已映射 |
| merchant-stall-management | `STALL-04-EMPTY` | 商户端档口列表与组织切换器PRD.md#5.4 空态 | 档口列表 | `merchant-stall-management:stall-list-empty` | 已映射 |
| merchant-stall-management | `STALL-05-QUERY` | 商户端档口列表与组织切换器PRD.md#6 查询与重置 | 档口列表 | `merchant-stall-management:stall-list-filter` | 已映射 |
| merchant-stall-management | `STALL-06-FORM` | 商户端档口列表与组织切换器PRD.md#7.2 字段与校验 | 新增与编辑档口 | `merchant-stall-management:stall-editor-rules`, `merchant-stall-management:stall-editor-field` | 已映射 |
| merchant-stall-management | `STALL-07-MEAL` | 商户端档口列表与组织切换器PRD.md#7.3 经营餐次与营业时间规则 | 新增与编辑档口 | `merchant-stall-management:stall-editor-meals` | 已映射 |
| merchant-stall-management | `STALL-08-GRAM` | 商户端档口列表与组织切换器PRD.md#7.4 预计人均用餐量 | 新增与编辑档口 | `merchant-stall-management:stall-data-downstream`, `merchant-stall-management:stall-editor-meals` | 已映射 |
| merchant-stall-management | `STALL-09-SAVE` | 商户端档口列表与组织切换器PRD.md#7.5 保存后置 | 新增与编辑档口 | `merchant-stall-management:stall-editor-rules`, `merchant-stall-management:stall-editor-actions` | 已映射 |
| merchant-stall-management | `STALL-10-DELETE` | 商户端档口列表与组织切换器PRD.md#8 删除档口 | 删除档口确认 | `merchant-stall-management:stall-delete-rules`, `merchant-stall-management:stall-list-ops` | 已映射 |
| merchant-stall-management | `STALL-11-DATA` | 商户端档口列表与组织切换器PRD.md#4.2 档口字段 | 档口列表 | `merchant-stall-management:stall-editor-field`, `merchant-stall-management:stall-list-table` | 已映射 |
| merchant-stall-management | `STALL-12-CONDUCT` | 商户端档口列表与组织切换器PRD.md#4.3 变动传导 | 档口列表 | `merchant-stall-management:stall-delete-rules`, `merchant-stall-management:stall-data-downstream`, `merchant-stall-management:stall-editor-owner`, `merchant-stall-management:stall-list-table` | 已映射 |
| merchant-stall-management | `STALL-13-VALID` | 商户端档口列表与组织切换器PRD.md#13.1 校验清单 | 新增与编辑档口 | `merchant-stall-management:stall-editor-rules`, `merchant-stall-management:stall-editor-meals` | 已映射 |
| merchant-stall-management | `STALL-14-EXCEPTION` | 商户端档口列表与组织切换器PRD.md#12 异常与边界 | 档口列表 | `merchant-stall-management:stall-editor-rules`, `merchant-stall-management:stall-list-rules` | 已映射 |
| merchant-stall-management | `STALL-15-DECISION` | 商户端档口列表与组织切换器PRD.md#3.4 已确认决策 | 档口列表 | `merchant-stall-management:stall-delete-rules`, `merchant-stall-management:stall-list-rules`, `merchant-stall-management:stall-data-downstream`, `merchant-stall-management:stall-editor-owner` | 已映射 |
| merchant-stall-management | `STALL-16-DIFF` | 商户端档口列表与组织切换器PRD.md#13.4 原型差异（研发需调整） | 新增与编辑档口 | `merchant-stall-management:stall-editor-rules`, `merchant-stall-management:stall-editor-meals` | 已映射 |
| merchant-meal-plan | `MEAL-01-GOAL` | 商户端排餐计划PRD.md#1 背景与目标 | 排餐计划 | `merchant-meal-plan:meal-plan-overview-rules`, `merchant-meal-plan:meal-plan-week-rules` | 已映射 |
| merchant-meal-plan | `MEAL-02-SCENE` | 商户端排餐计划PRD.md#2 角色与场景 | 排餐计划 | `merchant-meal-plan:meal-plan-overview-rules`, `merchant-meal-plan:meal-plan-week-rules` | 已映射 |
| merchant-meal-plan | `MEAL-03-TERM` | 商户端排餐计划PRD.md#3.1 术语 | 排餐计划 | `merchant-meal-plan:meal-plan-detail-grid`, `merchant-meal-plan:meal-plan-week-calc` | 已映射 |
| merchant-meal-plan | `MEAL-03-CALC` | 商户端排餐计划PRD.md#3.2 计算口径 | 排餐计划 | `merchant-meal-plan:meal-plan-detail-derive`, `merchant-meal-plan:meal-plan-week-calc`, `merchant-meal-plan:meal-plan-detail-bom` | 已映射 |
| merchant-meal-plan | `MEAL-04-DEP` | 商户端排餐计划PRD.md#4 前置依赖 | 排餐计划 | `merchant-meal-plan:meal-plan-overview-card`, `merchant-meal-plan:meal-plan-week-mealhead` | 已映射 |
| merchant-meal-plan | `MEAL-05-1-SCOPE` | 商户端排餐计划PRD.md#5.1 页面结构（两级范围） | 排餐计划 | `merchant-meal-plan:meal-plan-overview-rules`, `merchant-meal-plan:meal-plan-scope-switch-rules`, `merchant-meal-plan:meal-plan-overview-card`, `merchant-meal-plan:meal-plan-week-scope` | 已映射 |
| merchant-meal-plan | `MEAL-05-2-WEEK` | 商户端排餐计划PRD.md#5.2 周与时间控制 | 周排餐表 | `merchant-meal-plan:meal-plan-week-rules`, `merchant-meal-plan:meal-plan-week-toolbar` | 已映射 |
| merchant-meal-plan | `MEAL-05-3-TABLE` | 商户端排餐计划PRD.md#5.3 周排餐表 | 周排餐表 | `merchant-meal-plan:meal-plan-week-dayhead`, `merchant-meal-plan:meal-plan-week-mealhead`, `merchant-meal-plan:meal-plan-week-permeal`, `merchant-meal-plan:meal-plan-week-feed`, `merchant-meal-plan:meal-plan-week-dish`, `merchant-meal-plan:meal-plan-week-summary`, `merchant-meal-plan:meal-plan-week-add` | 已映射 |
| merchant-meal-plan | `MEAL-05-4-DETAIL` | 商户端排餐计划PRD.md#5.4 菜品详情抽屉 | 菜品详情 | `merchant-meal-plan:meal-plan-detail-rules`, `merchant-meal-plan:meal-plan-detail-grid`, `merchant-meal-plan:meal-plan-detail-basis`, `merchant-meal-plan:meal-plan-detail-derive`, `merchant-meal-plan:meal-plan-detail-bom` | 已映射 |
| merchant-meal-plan | `MEAL-05-5-PICKER` | 商户端排餐计划PRD.md#5.5 加菜 / 换菜（两段式抽屉） | 添加与替换菜谱 | `merchant-meal-plan:meal-plan-picker-rules`, `merchant-meal-plan:meal-plan-picker-filter`, `merchant-meal-plan:meal-plan-picker-list`, `merchant-meal-plan:meal-plan-picker-pots`, `merchant-meal-plan:meal-plan-week-add` | 已映射 |
| merchant-meal-plan | `MEAL-05-6-GROUP` | 商户端排餐计划PRD.md#5.6 分类聚合排序（口径唯一） | 周排餐表 | `merchant-meal-plan:meal-plan-week-dish` | 已映射 |
| merchant-meal-plan | `MEAL-05-7-DEFAULT` | 商户端排餐计划PRD.md#5.7 默认值取数链（人均用餐量） | 周排餐表 | `merchant-meal-plan:meal-plan-picker-rules`, `merchant-meal-plan:meal-plan-week-permeal` | 已映射 |
| merchant-meal-plan | `MEAL-05-8-CATSKIP` | 商户端排餐计划PRD.md#5.8 就餐人数统计口径（分类开关） | 周排餐表 | `merchant-meal-plan:meal-plan-week-catskip`, `merchant-meal-plan:meal-plan-week-feed`, `merchant-meal-plan:meal-plan-week-summary` | 已映射 |
| merchant-meal-plan | `MEAL-05-9-DAY` | 商户端排餐计划PRD.md#5.9 日期管理 | 周排餐表 | `merchant-meal-plan:meal-plan-week-rules`, `merchant-meal-plan:meal-plan-week-dayhead` | 已映射 |
| merchant-meal-plan | `MEAL-05-10-COPY` | 商户端排餐计划PRD.md#5.10 复制排餐 | 复制排餐 | `merchant-meal-plan:meal-plan-copy-rules`, `merchant-meal-plan:meal-plan-week-toolbar` | 已映射 |
| merchant-meal-plan | `MEAL-05-11-SAVE` | 商户端排餐计划PRD.md#5.11 保存与生效 | 周排餐表 | `merchant-meal-plan:meal-plan-detail-rules`, `merchant-meal-plan:meal-plan-scope-switch-rules`, `merchant-meal-plan:meal-plan-week-rules`, `merchant-meal-plan:meal-plan-week-scope` | 已映射 |
| merchant-meal-plan | `MEAL-05-12-ADJUST` | 商户端排餐计划PRD.md#5.12 当日排餐调整与变更记录 | 当日调整记录 | `merchant-meal-plan:meal-plan-adjust-rules`, `merchant-meal-plan:meal-plan-history-rules`, `merchant-meal-plan:meal-plan-week-dish` | 已映射 |
| merchant-meal-plan | `MEAL-06-RULES` | 商户端排餐计划PRD.md#6 规则汇总表 | 周排餐表 | `merchant-meal-plan:meal-plan-week-rules` | 已映射 |
| merchant-meal-plan | `MEAL-07-BOUND` | 商户端排餐计划PRD.md#7 计划间边界 | 排餐计划 | `merchant-meal-plan:meal-plan-overview-rules`, `merchant-meal-plan:meal-plan-scope-switch-rules`, `merchant-meal-plan:meal-plan-detail-basis` | 已映射 |
| merchant-meal-plan | `MEAL-08-EDGE` | 商户端排餐计划PRD.md#8 异常与边界 | 周排餐表 | `merchant-meal-plan:meal-plan-overview-rules`, `merchant-meal-plan:meal-plan-week-catskip`, `merchant-meal-plan:meal-plan-week-mealhead`, `merchant-meal-plan:meal-plan-week-permeal` | 已映射 |
| merchant-purchase-plan | `PLAN-03-CARD` | 商户端采购计划PRD-V3.0.md#3.2 档口卡片 | 采购计划总览 | `merchant-purchase-plan:pp-overview-card` | 已映射 |
| merchant-purchase-plan | `PLAN-03-SWITCH` | 商户端采购计划PRD-V3.0.md#3.3 切换动作与结果 | 采购计划总览 | `merchant-purchase-plan:pp-overview-rules`, `merchant-purchase-plan:pp-list-filters` | 已映射 |
| merchant-purchase-plan | `PLAN-04-LIST` | 商户端采购计划PRD-V3.0.md#4.3 表格列 | 采购计划列表 | `merchant-purchase-plan:pp-list-filters`, `merchant-purchase-plan:pp-list-table` | 已映射 |
| merchant-purchase-plan | `PLAN-04-DEL` | 商户端采购计划PRD-V3.0.md#4.5 删除计划 | 采购计划列表 | `merchant-purchase-plan:pp-list-rules` | 已映射 |
| merchant-purchase-plan | `PLAN-05-NEW` | 商户端采购计划PRD-V3.0.md#5.1 入口与填写项 | 新建采购计划 | `merchant-purchase-plan:pp-list-new`, `merchant-purchase-plan:pp-new-body` | 已映射 |
| merchant-purchase-plan | `PLAN-05-CHECK` | 商户端采购计划PRD-V3.0.md#5.2 校验 | 新建采购计划 | `merchant-purchase-plan:pp-new-rules` | 已映射 |
| merchant-purchase-plan | `PLAN-05-PREVIEW` | 商户端采购计划PRD-V3.0.md#5.3 范围预览 | 新建采购计划 | `merchant-purchase-plan:pp-new-rules`, `merchant-purchase-plan:pp-list-new` | 已映射 |
| merchant-purchase-plan | `PLAN-05-OVERLAP` | 商户端采购计划PRD-V3.0.md#5.4 重复与交集 | 新建采购计划 | `merchant-purchase-plan:pp-new-rules`, `merchant-purchase-plan:pp-overlap` | 已映射 |
| merchant-purchase-plan | `PLAN-05-SEQ` | 商户端采购计划PRD-V3.0.md#5.5 同期第 X 份 | 采购计划列表 | `merchant-purchase-plan:pp-list-rules`, `merchant-purchase-plan:pp-overlap`, `merchant-purchase-plan:pp-list-table` | 已映射 |
| merchant-purchase-plan | `PLAN-06-HEAD` | 商户端采购计划PRD-V3.0.md#6.1 页头与统计 | 采购计划详情 | `merchant-purchase-plan:pp-mapping-head` | 已映射 |
| merchant-purchase-plan | `PLAN-06-STATE` | 商户端采购计划PRD-V3.0.md#6.2.2 状态对交互的影响 | 采购计划详情 | `merchant-purchase-plan:pp-award-rules`, `merchant-purchase-plan:pp-inquiry-rules`, `merchant-purchase-plan:pp-launch-rules`, `merchant-purchase-plan:pp-list-rules`, `merchant-purchase-plan:pp-mapping-rules`, `merchant-purchase-plan:pp-mapping-tabs`, `merchant-purchase-plan:pp-list-table` | 已映射 |
| merchant-purchase-plan | `PLAN-06-MAPPING` | 商户端采购计划PRD-V3.0.md#6.3.3 候选商品规则 | 商品映射 | `merchant-purchase-plan:pp-mapping-rules`, `merchant-purchase-plan:pp-pick-rules`, `merchant-purchase-plan:pp-mapping-table` | 已映射 |
| merchant-purchase-plan | `PLAN-06-PICK` | 商户端采购计划PRD-V3.0.md#6.3.4 选商品抽屉 | 选商品 | `merchant-purchase-plan:pp-pick-rules`, `merchant-purchase-plan:pp-add-goods-body`, `merchant-purchase-plan:pp-pick-body`, `merchant-purchase-plan:pp-mapping-table` | 已映射 |
| merchant-purchase-plan | `PLAN-06-BASIS` | 商户端采购计划PRD-V3.0.md#6.3.1 这是什么 | 用料依据 | `merchant-purchase-plan:pp-basis-body` | 已映射 |
| merchant-purchase-plan | `PLAN-06-IGNORE` | 商户端采购计划PRD-V3.0.md#6.3.6 整段忽略是新增按钮 | 商品映射 | `merchant-purchase-plan:pp-mapping-rules`, `merchant-purchase-plan:pp-days-ignored`, `merchant-purchase-plan:pp-mapping-table` | 已映射 |
| merchant-purchase-plan | `PLAN-06-REGEN` | 商户端采购计划PRD-V3.0.md#6.3.7 重新生成 | 商品映射 | `merchant-purchase-plan:pp-mapping-rules` | 已映射 |
| merchant-purchase-plan | `PLAN-06-DAYS` | 商户端采购计划PRD-V3.0.md#6.4.3 按天覆盖与填量规则 | 采购明细 | `merchant-purchase-plan:pp-days-rules`, `merchant-purchase-plan:pp-add-goods-body`, `merchant-purchase-plan:pp-basis-body`, `merchant-purchase-plan:pp-days-bar`, `merchant-purchase-plan:pp-days-table`, `merchant-purchase-plan:pp-days-ignored` | 已映射 |
| merchant-purchase-plan | `PLAN-06-LAUNCH` | 商户端采购计划PRD-V3.0.md#6.5.1 发起询价 | 发起询价 | `merchant-purchase-plan:pp-inquiry-rules`, `merchant-purchase-plan:pp-launch-rules`, `merchant-purchase-plan:pp-launch-body`, `merchant-purchase-plan:pp-pick-body` | 已映射 |
| merchant-purchase-plan | `PLAN-06-INQ` | 商户端采购计划PRD-V3.0.md#6.5.2 询价单内容 | 询价单 | `merchant-purchase-plan:pp-inquiry-rules`, `merchant-purchase-plan:pp-inquiry-head`, `merchant-purchase-plan:pp-inquiry-summary`, `merchant-purchase-plan:pp-inquiry-board` | 已映射 |
| merchant-purchase-plan | `PLAN-06-CMP` | 商户端采购计划PRD-V3.0.md#6.5.3 报价比较 | 报价比较 | `merchant-purchase-plan:pp-compare-rules`, `merchant-purchase-plan:pp-inquiry-head`, `merchant-purchase-plan:pp-line-quote-body`, `merchant-purchase-plan:pp-inquiry-board` | 已映射 |
| merchant-purchase-plan | `PLAN-06-AWARD` | 商户端采购计划PRD-V3.0.md#6.5.4 定标 | 定标 | `merchant-purchase-plan:pp-award-rules`, `merchant-purchase-plan:pp-award-confirm`, `merchant-purchase-plan:pp-award-body` | 已映射 |
| merchant-purchase-plan | `PLAN-07-COPY` | 商户端采购计划PRD-V3.0.md#7 文案与提示汇总 | 采购计划详情 | `merchant-purchase-plan:pp-award-rules`, `merchant-purchase-plan:pp-compare-rules`, `merchant-purchase-plan:pp-launch-rules`, `merchant-purchase-plan:pp-award-confirm`, `merchant-purchase-plan:pp-mapping-head`, `merchant-purchase-plan:pp-new-body` | 已映射 |
| merchant-purchase-plan | `PLAN-08-EDGE` | 商户端采购计划PRD-V3.0.md#8.2 边界与异常 | 采购计划详情 | `merchant-purchase-plan:pp-days-rules`, `merchant-purchase-plan:pp-inquiry-rules`, `merchant-purchase-plan:pp-mapping-rules`, `merchant-purchase-plan:pp-overview-rules` | 已映射 |
| merchant-purchase-mgmt | `PM-01-POSITION` | 商户端采购管理PRD.md#2.1 定位与结构 | 采购订单 | `merchant-purchase-mgmt:pm-list-rules` | 已映射 |
| merchant-purchase-mgmt | `PM-02-STATE` | 商户端采购管理PRD.md#2.2 状态模型 | 采购订单 | `merchant-purchase-mgmt:pm-global-rules` | 已映射 |
| merchant-purchase-mgmt | `PM-02-OPS` | 商户端采购管理PRD.md#2.3 状态 × 下单方可操作 | 采购订单 | `merchant-purchase-mgmt:pm-global-rules` | 已映射 |
| merchant-purchase-mgmt | `PM-04-STATS` | 商户端采购管理PRD.md#2.4.1 统计卡 | 订单列表 | `merchant-purchase-mgmt:pm-list-stats` | 已映射 |
| merchant-purchase-mgmt | `PM-04-FILTER` | 商户端采购管理PRD.md#2.4.2 筛选条 | 订单列表 | `merchant-purchase-mgmt:pm-list-filters` | 已映射 |
| merchant-purchase-mgmt | `PM-04-TABS` | 商户端采购管理PRD.md#2.4.3 两组页签 | 订单列表 | `merchant-purchase-mgmt:pm-list-tabs` | 已映射 |
| merchant-purchase-mgmt | `PM-04-TABLE` | 商户端采购管理PRD.md#2.4.4 订单表格 | 订单列表 | `merchant-purchase-mgmt:pm-list-rules`, `merchant-purchase-mgmt:pm-list-table` | 已映射 |
| merchant-purchase-mgmt | `PM-04-OPS` | 商户端采购管理PRD.md#2.4.5 行操作 | 订单列表 | `merchant-purchase-mgmt:pm-list-table` | 已映射 |
| merchant-purchase-mgmt | `PM-05-HEAD` | 商户端采购管理PRD.md#2.5.1 页头 | 订单详情 | `merchant-purchase-mgmt:pm-detail-rules` | 已映射 |
| merchant-purchase-mgmt | `PM-05-LINES` | 商户端采购管理PRD.md#2.5.4 商品明细 | 订单详情 | `merchant-purchase-mgmt:pm-detail-lines` | 已映射 |
| merchant-purchase-mgmt | `PM-05-OPS` | 商户端采购管理PRD.md#2.5.5 行操作 | 订单详情 | `merchant-purchase-mgmt:pm-detail-lines` | 已映射 |
| merchant-purchase-mgmt | `PM-05-FINISH` | 商户端采购管理PRD.md#2.5.3 状态提示条 | 订单详情 | `merchant-purchase-mgmt:pm-detail-rules`, `merchant-purchase-mgmt:pm-detail-accept-head` | 已映射 |
| merchant-purchase-mgmt | `PM-06-POOL` | 商户端采购管理PRD.md#2.6.1 入口与商品池 | 新建订单 | `merchant-purchase-mgmt:pm-wiz-days`, `merchant-purchase-mgmt:pm-add-sku` | 已映射 |
| merchant-purchase-mgmt | `PM-06-DAYS` | 商户端采购管理PRD.md#2.6.2 第 1 步 | 新建订单 | `merchant-purchase-mgmt:pm-wiz-days`, `merchant-purchase-mgmt:pm-wiz-days-filters` | 已映射 |
| merchant-purchase-mgmt | `PM-06-SKU` | 商户端采购管理PRD.md#2.6.3 添加商品抽屉 | 添加商品 | `merchant-purchase-mgmt:pm-add-sku`, `merchant-purchase-mgmt:pm-add-sku-bar` | 已映射 |
| merchant-purchase-mgmt | `PM-06-OVERVIEW` | 商户端采购管理PRD.md#2.6.4 第 2 步 · 总览 | 新建订单 | `merchant-purchase-mgmt:pm-wiz-overview`, `merchant-purchase-mgmt:pm-wiz-overview-stats` | 已映射 |
| merchant-purchase-mgmt | `PM-06-RECV` | 商户端采购管理PRD.md#2.6.5 第 3 步 · 收货与提交 | 新建订单 | `merchant-purchase-mgmt:pm-wiz-receiver`, `merchant-purchase-mgmt:pm-receiver-pick` | 已映射 |
| merchant-purchase-mgmt | `PM-08-ACCEPT` | 商户端采购管理PRD.md#2.8.2 验收弹层字段 | 行级验收 | `merchant-purchase-mgmt:pm-accept`, `merchant-purchase-mgmt:pm-accept-sum` | 已映射 |
| merchant-purchase-mgmt | `PM-08-DETAIL` | 商户端采购管理PRD.md#2.8.5 验收详情 | 验收详情 | `merchant-purchase-mgmt:pm-accept-detail` | 已映射 |
| merchant-purchase-mgmt | `PM-08-DIFF` | 商户端采购管理PRD.md#2.8.7 验收完成 | 验收完成 | `merchant-purchase-mgmt:pm-finish-diff`, `merchant-purchase-mgmt:pm-sign` | 已映射 |
| merchant-purchase-mgmt | `PM-09-RETURN` | 商户端采购管理PRD.md#2.9.2 退货弹层字段 | 退货 | `merchant-purchase-mgmt:pm-return` | 已映射 |
| merchant-purchase-mgmt | `PM-09-AS` | 商户端采购管理PRD.md#2.9.4 售后三态与流转 | 售后详情 | `merchant-purchase-mgmt:pm-as-detail` | 已映射 |
| merchant-purchase-mgmt | `PM-09-DEDUCT` | 商户端采购管理PRD.md#2.9.4a 金额冲减规则 | 售后详情 | `merchant-purchase-mgmt:pm-as-detail` | 已映射 |
| merchant-purchase-mgmt | `SR-03-PAGE` | 商户端采购管理PRD.md#3.3 页面结构 | 供货关系管理 | `merchant-purchase-mgmt:sr-rules`, `merchant-purchase-mgmt:sr-filters` | 已映射 |
| merchant-purchase-mgmt | `SR-03-STATS` | 商户端采购管理PRD.md#3.3.1 统计卡 | 供货关系管理 | `merchant-purchase-mgmt:sr-stats` | 已映射 |
| merchant-purchase-mgmt | `SR-03-BIND` | 商户端采购管理PRD.md#3.4 单个绑定 | 供货关系管理 | `merchant-purchase-mgmt:sr-bind` | 已映射 |
| merchant-purchase-mgmt | `SR-03-TABLE` | 商户端采购管理PRD.md#3.3.4 表格 | 供货关系管理 | `merchant-purchase-mgmt:sr-bind`, `merchant-purchase-mgmt:sr-table` | 已映射 |
| merchant-purchase-mgmt | `SR-05-BATCH` | 商户端采购管理PRD.md#3.5 批量三动作 | 供货关系管理 | `merchant-purchase-mgmt:sr-batch-form`, `merchant-purchase-mgmt:sr-batch` | 已映射 |
| merchant-purchase-mgmt | `SR-06-OFFSHELF` | 商户端采购管理PRD.md#3.6 与上下架的交互 | 供货关系管理 | `merchant-purchase-mgmt:sr-table` | 已映射 |
| merchant-purchase-mgmt | `AMOUNT` | 商户端采购管理PRD.md#4 价格与金额 | 采购管理 | `merchant-purchase-mgmt:pm-global-rules` | 已映射 |
| merchant-purchase-mgmt | `EDGE` | 商户端采购管理PRD.md#5 边界与异常 | 采购管理 | `merchant-purchase-mgmt:pm-global-rules` | 已映射 |
