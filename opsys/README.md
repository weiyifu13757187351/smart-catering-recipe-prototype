# 食链云标准食材库业务运营端（本地原型）

本目录是线上原型的本地可运行副本，保留原有视觉样式、菜单、列表、抽屉、弹窗和业务交互。

## 启动方式

推荐直接双击：

```text
双击启动原型.bat
```

启动后会自动打开浏览器。也可以在本目录打开 PowerShell，运行：

```powershell
./启动原型.ps1
```

浏览器访问：

```text
http://localhost:4173/
```

停止服务时，在 PowerShell 窗口按 `Ctrl+C`。

## 可直接访问的页面

- 标准食材：`http://localhost:4173/?page=ingredients`
- 运营商品：`http://localhost:4173/?page=products`
- SKU中心：`http://localhost:4173/?page=skus`
- 发布记录：`http://localhost:4173/?page=publish`
- 商品授权：`http://localhost:4173/?page=authorization`
- 菜品授权：`http://localhost:4173/?page=dishAuthorization`
- 品牌库：`http://localhost:4173/?page=brands`
- 分类库：`http://localhost:4173/?page=categories`

## 说明

- 原型为纯前端静态应用，不需要安装依赖。
- 数据为演示数据，页面刷新后会恢复初始状态。
- 请通过本地 HTTP 服务访问，不建议直接双击 `index.html`。
