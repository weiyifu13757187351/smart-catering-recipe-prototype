# 食联网数智餐饮平台商户端（本地原型）

本目录是线上商户端原型的本地高保真副本，保留原有页面视觉、示例数据与前端交互。

## 启动方式

双击：

```text
双击启动商户端原型.bat
```

或在本目录打开 PowerShell，运行：

```powershell
./start-prototype.ps1
```

浏览器访问：

```text
http://localhost:4174/
```

停止服务时，在 PowerShell 窗口按 `Ctrl+C`。

## 页面入口

- 登录页：`http://localhost:4174/`
- 组织及人员：`http://localhost:4174/食联网数智餐饮平台-组织及人员.html`

## 已包含功能

- 用户登录、商户选择、找回密码。
- 组织切换、组织档案与成员维护。
- 角色管理、管理员设置、账户菜单。
- 按组织维护统一菜谱库，菜谱来源分为“租户授权”和“自建”。
- 从租户授权范围选择并同步菜谱到当前组织。
- 租户菜谱分类只读查看，创建和编辑时使用租户统一字典。
- 纯人工及含设备加工菜谱的新建、编辑、上下架、复制和删除。
- 在菜谱详情中查看当前版本和最新授权版本，并主动确认更新。
- 基础信息 › 供应商管理：只读查看本商户可采购的供应商（由租户端按商户绑定下发），含供应类型、联系人、资质证照与供货范围详情。
- 基础信息 › 档口管理：档口的增删改查、负责人、经营餐次与营业时间。
- 商品中心：商品/SKU 维护、分类、加工形态，以及「关联标准食材」——采购计划选商品就依赖这个关联关系。
- 计划管理 › 排餐计划：组织层档口总览 + 档口周排餐表（排餐是采购计划的上游输入）。
- 计划管理 › 生产计划：按排餐派生生产任务。
- 计划管理 › 采购计划：选档口 → 采购计划列表 → 新建 → 详情三页签（商品映射 / 采购明细 / 询价单，含比价与定标）。

## 业务标注

页面内已接入只读标注（`annotation-kit/`），打开任意已标注页面后：

- 右上角工具栏可见「本页规则」：当前视图相关的准入、校验、口径与后果；「全部页面」可按模块浏览与下载。
- 页面上的数字角标对应具体区域（表格、抽屉、弹窗等）的规则说明。
- 只显示**当前视图**的规则：切页签、开关抽屉，角标内容会跟着变。

已标注模块（共 116 条，编译产物 `annotation-kit/annotation.bundle.json`）：

| 模块 | 标注源 | 条数 |
| --- | --- | --- |
| 菜谱管理 | `annotations/merchant-recipe-management.md` | 44 |
| 档口管理 | `annotations/stall/merchant-stall-management.md` | 13 |
| 排餐计划 | `annotations/plan/merchant-meal-plan.md` | 27 |
| 采购计划 | `annotations/purchase/merchant-purchase-plan.md` | 32 |

标注内容以各模块 PRD 为事实源（采购计划对应 `商户端采购计划PRD-V3.0.md`）。改完标注 Markdown 后重新编译：

```powershell
python ./tools/annotation/compile_annotations.py ./annotations/annotation.workspace.json --check --check-sources
python ./tools/annotation/compile_annotations.py ./annotations/annotation.workspace.json
python ./tools/annotation/check_annotation_assets.py ./annotation-kit
```

不要手改 `annotation.bundle.json` / `annotation.bundle.inline.js`（编译产物），也不要手改 `annotation-kit/runtime.js`（运行时）。

## 说明

- 原型为纯前端静态应用，无需安装依赖。
- 数据为演示数据，刷新页面后恢复初始状态。
- 推荐通过本地 HTTP 服务访问，避免浏览器对本地文件会话和跳转的限制。
