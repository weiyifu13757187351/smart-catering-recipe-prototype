(function () {
  function isVisible(el) {
    if (!el) return false;
    if (el.hidden) return false;
    if (el.closest('[hidden]')) return false;
    return el.offsetParent !== null || el.getClientRects().length > 0;
  }

  function visibleDrawer() {
    return Array.from(document.querySelectorAll('aside.um-drawer, .um-drawer')).find(isVisible) || null;
  }

  function activeAttr(root, attr, fallback) {
    const node = root.querySelector('[' + attr + '].active');
    return node ? node.getAttribute(attr) : fallback;
  }

  function resolveView() {
    // 设备操作步骤抽屉叠加在编辑抽屉之上，单独作为一个视图。
    if (isVisible(document.querySelector('.umt-action-drawer'))) {
      return 'recipe-editor-operation';
    }
    // 叠加在最上层的抽屉先判定，避免被底层列表吞掉。
    const drawer = visibleDrawer();
    if (drawer) {
      if (drawer.querySelector('#umSyncRows') || drawer.querySelector('#umSyncConfirm')) {
        return 'recipe-sync';
      }
      if (drawer.querySelector('[data-umt-version]')) {
        return 'recipe-detail-' + activeAttr(drawer, 'data-umt-version', 'current');
      }
      // 新建与编辑使用同一套页签与字段，业务规则一致，因此共用视图。
      if (drawer.querySelector('[data-umt-editor-tab]')) {
        return 'recipe-editor-' + activeAttr(drawer, 'data-umt-editor-tab', 'basic');
      }
      return 'recipe-drawer';
    }

    if (isVisible(document.querySelector('.um-category-layout'))) return 'recipe-categories';
    // 旧版可编辑分类页（若被左侧导航唤起，属于需要单独确认的层级）
    if (isVisible(document.querySelector('#dishCategoryPage .category-layout'))) return 'recipe-categories-legacy';

    if (isVisible(document.querySelector('#umRows'))) return 'recipe-list';
    if (isVisible(document.querySelector('.um-hub-grid'))) return 'recipe-hub';
    return 'other';
  }

  let queued = false;
  function syncView() {
    queued = false;
    const view = resolveView();
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
      attributeFilter: ['class', 'hidden']
    });
    document.addEventListener('click', scheduleSync, true);
    window.addEventListener('popstate', scheduleSync);
    scheduleSync();
  }

  const ready = window.VitaminAnnotations?.ready;
  if (ready && typeof ready.then === 'function') ready.then(start);
  else start();
})();
