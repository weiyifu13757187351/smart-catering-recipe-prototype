(function () {
  // 运营端「系统管理 / 运营账号管理」视图识别。
  // 原型的页面切换与抽屉都不改 URL，只改 DOM，因此按 DOM 特征解析当前视图，
  // 写入 document.body.dataset.vpaView 供标注运行时按 viewScope 匹配。
  function headText(drawer) {
    return drawer.querySelector(".sys-head h2")?.textContent?.trim() || "";
  }

  var DRAWER_VIEWS = {
    "新增运营角色": "op-role-create",
    "编辑运营角色": "op-role-edit",
    "运营角色详情": "op-role-detail",
    "新增运营账号": "op-account-create",
    "编辑运营账号": "op-account-edit",
    "运营账号详情": "op-account-detail"
  };

  function resolveView() {
    // 0) 登录流程覆盖层（右上角账号菜单「退出」进入）：
    //    登录表单 / 首次登录改密提醒 / 修改密码。覆盖层关闭时按业务页面继续判定。
    var loginFlow = document.getElementById("loginFlow");
    if (loginFlow && !loginFlow.hidden) {
      if (!document.getElementById("changeModal")?.hidden) return "login-change-password";
      if (!document.getElementById("reminderModal")?.hidden) return "login-password-reminder";
      return "login-form";
    }

    // 1) 弹窗：位于最上层，先判定。
    var modal = document.querySelector(".sys-modal-mask .sys-modal");
    if (modal) {
      var modalTitle = modal.querySelector("h3")?.textContent?.trim() || "";
      if (modalTitle.indexOf("重置登录密码") === 0) return "op-account-reset";
      if (modalTitle.indexOf("运营账号创建成功") === 0) return "op-account-created";
      return "op-modal-other";
    }

    // 2) 抽屉：新增 / 编辑 / 查看。
    var drawer = document.querySelector(".sys-overlay .sys-drawer");
    if (drawer) return DRAWER_VIEWS[headText(drawer)] || "op-drawer-other";

    // 3) 系统管理页面：运营角色与权限 / 运营账号。
    var page = document.querySelector(".system-page");
    if (page) {
      var active = document.querySelector("[data-system-page].active")?.dataset.systemPage;
      if (active === "operatorRoles") return "op-role-list";
      if (active === "operatorAccounts") return "op-account-list";
      return "op-other-page";
    }

    // 4) 商品中心 / 授权管理 / 基础数据等本次未标注的页面。
    return "app-other";
  }

  var queued = false;
  function syncView() {
    queued = false;
    var view = resolveView();
    if (document.body.dataset.vpaView === view) return;
    document.body.dataset.vpaView = view;
    window.VitaminAnnotations?.sync();
  }

  function scheduleSync() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(syncView);
  }

  function start() {
    new MutationObserver(scheduleSync).observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "hidden"]
    });
    document.addEventListener("click", scheduleSync, true);
    window.addEventListener("popstate", scheduleSync);
    scheduleSync();
  }

  var ready = window.VitaminAnnotations?.ready;
  if (ready && typeof ready.then === "function") ready.then(start);
  else start();
})();
