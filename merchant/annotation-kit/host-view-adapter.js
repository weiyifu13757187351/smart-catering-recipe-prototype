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

  // 采购管理（采购订单 + 供货关系管理）的抽屉同样挂在 #mpMask 上，按内容特征判定。
  // 订单详情里的「验收 / 验收详情 / 差异原因 / 签名 / 退货 / 售后详情」共用同一套 po-form 结构，
  // 只能靠各自的专属控件区分；验收详情用 .po-cert（商品资质 + 签字区）兜底。
  function resolvePurchaseMgmtDrawer() {
    /* 抽屉分 body + foot 两段，取消/关闭按钮在 foot 里，所以要在整个 .mp-drawer 上找特征 */
    const drawer = document.querySelector('.mp-drawer');
    if (!drawer) return null;
    const q = sel => drawer.querySelector(sel);
    if (q('#poAcceptQty')) return 'po-accept';
    if (q('#poSigCanvas')) return 'po-sign';
    if (q('[data-diff-reason]')) return 'po-finish-diff';
    if (q('#poRtQty')) return 'po-return';
    if (q('[data-as-close]')) return 'po-as-detail';
    if (q('#poPickKw')) return 'po-add-sku';
    if (q('#poRcSearch')) return 'po-receiver-pick';
    if (q('.po-cert') || q('[data-dacc-edit]')) return 'po-accept-detail';
    if (q('[data-sr-pick]')) return 'sr-bind';
    if (q('#srFormPick')) return 'sr-batch-form';
    return null;
  }

  function purchaseMgmtPageVisible() {
    return isVisible(document.querySelector('#purchaseOrderPage'))
      || isVisible(document.querySelector('#poWizardPage'))
      || isVisible(document.querySelector('#supplyRelationPage'));
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
      // 采购管理（采购订单 / 供货关系）优先：它们的抽屉也挂在 #mpMask 上
      if (purchaseMgmtPageVisible()) {
        const poDrawer = resolvePurchaseMgmtDrawer();
        if (poDrawer) return poDrawer;
      }
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
    // 采购管理 · 采购订单：列表（5 张统计卡 + 两组页签）→ 详情（商品明细整页）
    const poPage = document.querySelector('#purchaseOrderPage');
    if (isVisible(poPage)) {
      return poPage.querySelector('#poBackList') ? 'po-detail' : 'po-list';
    }
    // 采购管理 · 新建订单向导：送达日期与数量 / 总览 / 收货与提交 三步各自成视图
    const wizPage = document.querySelector('#poWizardPage');
    if (isVisible(wizPage)) {
      if (wizPage.querySelector('#wizRcAddr') || wizPage.querySelector('#wizRcPick')) return 'po-wizard-receiver';
      if (wizPage.querySelector('.po-ov-stats')) return 'po-wizard-overview';
      return 'po-wizard-days';
    }
    // 采购管理 · 供货关系管理（单层页面）
    if (isVisible(document.querySelector('#supplyRelationPage'))) return 'sr-list';
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
