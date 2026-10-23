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

  // 采购计划的抽屉也挂在排餐计划那套 #mpMask 上：按 .pc-* 内容特征判定。
  // 「更换/选择商品」与「添加商品」、「整单比价」与「单行报价」结构相同，只能用抽屉标题区分。
  function resolvePurchaseDrawer() {
    const body = document.querySelector('#mpDrawerBody');
    if (!body) return null;
    if (body.querySelector('#pcCreate')) return 'purchase-new';
    if (body.querySelector('#pcLaunchOk')) return 'purchase-launch';
    if (body.querySelector('#pcAwardOk')) return 'purchase-award';
    if (body.querySelector('#pcBasisOk')) return 'purchase-basis';
    if (body.querySelector('.pc-sku-cards') || body.querySelector('#pcPickBack')) return 'purchase-pick-sku';
    if (body.querySelector('.pc-add-table') || body.querySelector('#pcAddCount')) {
      const title = (document.querySelector('#mpDrawerTitle') || {}).textContent || '';
      return title.indexOf('添加') >= 0 ? 'purchase-add-goods' : 'purchase-pick';
    }
    // 候选商品为空时只给一句说明 + 取消，仍属于「选择商品」
    if (body.querySelector('#pcPickCancel')) return 'purchase-pick';
    if (body.querySelector('#pcCmpOk')) {
      const title2 = (document.querySelector('#mpDrawerTitle') || {}).textContent || '';
      return title2.indexOf('明细') >= 0 ? 'purchase-line-quote' : 'purchase-compare';
    }
    return null;
  }

  function resolveView() {
    // 设备操作步骤抽屉叠加在编辑抽屉之上，单独作为一个视图。
    if (isVisible(document.querySelector('.umt-action-drawer'))) {
      return 'recipe-editor-operation';
    }
    // 档口管理的确认弹窗 / 编辑抽屉叠在列表之上，同样先判定。
    if (isVisible(document.querySelector('#stallDeleteMask'))) {
      return 'stall-delete';
    }
    if (isVisible(document.querySelector('#stallDrawerMask'))) {
      return 'stall-editor';
    }
    // 排餐计划的 7 个抽屉共用 #mpMask：按**内容特征**判定，不用标题
    //（菜品详情的标题是菜名，动态值不能参与匹配）
    if (isVisible(document.querySelector('#mpMask'))) {
      const mask = document.querySelector('#mpMask');
      // 采购计划与排餐计划共用 #mpMask，采购侧特征优先（采购页面才可能打开采购抽屉）
      if (isVisible(document.querySelector('#purchasePlanPage'))) {
        const ppDrawer = resolvePurchaseDrawer();
        if (ppDrawer) return ppDrawer;
      }
      if (mask.querySelector('#mpBomBody')) return 'meal-plan-detail';
      // 两段式选择器：第 1 步选菜谱、第 2 步填锅数，各自成视图（规则块跨两步共用）
      if (mask.querySelector('.mp-recipe-list')) return 'meal-plan-picker-select';
      if (mask.querySelector('.mp-pot-bulk') || mask.querySelector('[data-pot-card]')) return 'meal-plan-picker-pots';
      if (mask.querySelector('.mp-copy-options')) return 'meal-plan-copy';
      if (mask.querySelector('#mpAdjustReason')) return 'meal-plan-adjust';
      if (mask.querySelector('#mpScopeSave')) return 'meal-plan-scope-switch';
      if (mask.querySelector('#mpHistoryClose')) return 'meal-plan-history';
      return 'meal-plan-drawer';
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
    // 采购计划：组织层档口总览 / 列表 / 详情三页签 / 抽屉与弹窗
    const ppPage = document.querySelector('#purchasePlanPage');
    if (isVisible(ppPage)) {
      // 两个独立弹窗先判定（不共用 mpMask）
      if (isVisible(document.querySelector('#pcAwardMask'))) return 'purchase-award-confirm';
      if (isVisible(document.querySelector('#pcOverlapMask'))) return 'purchase-overlap';
      // 页面三态
      if (ppPage.querySelector('.mp-stall-overview')) return 'purchase-overview';
      if (ppPage.querySelector('.pc-tabs')) {
        const on = ppPage.querySelector('.pc-tab.on[data-pc-tab]');
        const t = on ? on.dataset.pcTab : 'clean';
        return t === 'day' ? 'purchase-days' : t === 'inq' ? 'purchase-inquiry' : 'purchase-mapping';
      }
      if (ppPage.querySelector('.pp-filters')) return 'purchase-list';
      return 'purchase-overview';
    }
    // 排餐计划：同一页两种形态 —— 组织层各档口总览 / 档口周排餐表
    const mealPage = document.querySelector('#mealPlanPage');
    if (isVisible(mealPage)) {
      return mealPage.querySelector('.mp-week-section') ? 'meal-plan-week' : 'meal-plan-overview';
    }
    if (isVisible(document.querySelector('#stallPage'))) return 'stall-list';
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
