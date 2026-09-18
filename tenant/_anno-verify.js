/* 标注挂载验证驱动（仅用于本地 headless 校验，不是原型业务代码）
 * 用法：在 _anno-verify.html?case=<case> 中加载。
 * 结果写入 #__verify，通过 CDP 读取。
 */
(function () {
  var params = new URLSearchParams(location.search);
  var kase = params.get('case') || 'list';
  var steps = [];

  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function out(s) {
    var el = document.getElementById('__verify');
    if (!el) {
      el = document.createElement('pre');
      el.id = '__verify';
      el.style.cssText = 'position:fixed;left:0;bottom:0;z-index:2147483647;font-size:9px;max-height:40vh;overflow:auto';
      document.body.appendChild(el);
    }
    el.textContent = s;
  }
  function q(sel) { return document.querySelector(sel); }

  async function login() {
    var lv = q('#loginView'), av = q('#appView');
    if (lv) lv.classList.add('hidden');
    if (av) av.classList.remove('hidden');
    await sleep(120);
  }

  async function nav(fn, label) {
    try { fn(); steps.push(label + ':ok'); }
    catch (e) { steps.push(label + ':ERR(' + (e && e.message) + ')'); }
    await sleep(240);
  }

  function setVal(sel, val) {
    var el = q(sel);
    if (!el) throw new Error('no-target:' + sel);
    el.value = val;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  async function openDishes() {
    await nav(function () { render('dishes'); }, 'list');
  }
  async function openDetailTab(tab) {
    await nav(function () { render('dishes'); }, 'list');
    await nav(function () { q('.dish-view').click(); }, 'detail');
    if (tab && tab !== 'basic') {
      await nav(function () { q('#unifiedDetailTabs [data-detail-content="' + tab + '"]').click(); }, 'tab-' + tab);
    }
  }
  async function openEditor(kind, tab) {
    await openDishes();
    await nav(function () { q(kind === 'create' ? '#createDish' : '.dish-edit').click(); }, kind);
    if (tab && tab !== 'basic') {
      await nav(function () { q('#dishDrawerMask [data-recipe-tab="' + tab + '"]').click(); }, 'tab-' + tab);
    }
  }
  async function openDictionaryEditor() {
    await nav(function () {
      window.renderRecipeDictionary && window.renderRecipeDictionary({
        title: '菜谱标签与字典',
        desc: '统一维护菜谱标签、烹饪分类、菜系、工艺参数、单位、范围和适用设备型号。',
        fromDeviceHub: false,
        fromRecipeHub: true
      });
    }, 'dictionary');
    await nav(function () { q('#addDictionaryItem').click(); }, 'openDictionaryEditor');
  }
  async function openAuthCreate(want) {
    await nav(function () { render('dishAuthorization'); }, 'authList');
    await nav(function () { q('#newUnifiedAuth').click(); }, 'openAuth');
    for (var i = 1; i < want; i++) {
      await nav(function () {
        var cbs = document.querySelectorAll('#unifiedAuthBody input[type=checkbox]');
        for (var k = 0; k < cbs.length; k++) { if (!cbs[k].disabled) { cbs[k].click(); break; } }
      }, 'pick' + i);
      await nav(function () { q('#nextUnifiedAuth').click(); }, 'next' + i);
    }
  }

  async function run() {
    try {
      if (typeof window.render !== 'function') { out('VERIFY_ERR=render-not-defined'); return; }
      await login();

      if (kase === 'hub') {
        await nav(function () { render('standardRecipes'); }, 'hub');
      } else if (kase === 'list') {
        await openDishes();
      } else if (kase === 'list-more') {
        await openDishes();
        await nav(function () { q('#toggleMoreDishFilters').click(); }, 'moreFilters');
      } else if (kase === 'create' || kase === 'create-i' || kase === 'create-p') {
        await openEditor('create', kase === 'create-i' ? 'ingredients' : kase === 'create-p' ? 'process' : 'basic');
      } else if (kase === 'edit' || kase === 'edit-i' || kase === 'edit-p') {
        await openEditor('edit', kase === 'edit-i' ? 'ingredients' : kase === 'edit-p' ? 'process' : 'basic');
      } else if (kase === 'operation') {
        await openEditor('create', 'process');
        await nav(function () { q('#dishDrawerMask [data-unified-mode="device"]').click(); }, 'modeDevice');
        await nav(function () { setVal('#dishDrawerMask [data-device-vendor]', '智谷'); }, 'pickVendor');
        await nav(function () { setVal('#dishDrawerMask [data-device-model]', 'ZG-A8'); }, 'pickModel');
        await nav(function () { q('#dishDrawerMask [data-add-device-model]').click(); }, 'addModel');
        await nav(function () { q('#dishDrawerMask [data-unified-op-open]').click(); }, 'openOperation');
      } else if (kase === 'detail' || kase === 'detail-i' || kase === 'detail-p' || kase === 'detail-n') {
        await openDetailTab(kase === 'detail-i' ? 'ingredients' : kase === 'detail-p' ? 'process' : kase === 'detail-n' ? 'nutrition' : 'basic');
      } else if (kase === 'categories') {
        await nav(function () { render('dishCategories'); }, 'categories');
      } else if (kase === 'dictionary') {
        await nav(function () {
          window.renderRecipeDictionary && window.renderRecipeDictionary({
            title: '菜谱标签与字典',
            desc: '统一维护菜谱标签、烹饪分类、菜系、工艺参数、单位、范围和适用设备型号。',
            fromDeviceHub: false,
            fromRecipeHub: true
          });
        }, 'dictionary');
      } else if (kase === 'dictionary-editor') {
        await openDictionaryEditor();
      } else if (kase === 'auth-list') {
        await nav(function () { render('dishAuthorization'); }, 'authList');
      } else if (kase === 'auth-detail') {
        await nav(function () { render('dishAuthorization'); }, 'authList');
        await nav(function () { q('[data-unified-auth-detail]').click(); }, 'authDetail');
      } else if (kase === 'auth-preview') {
        await nav(function () { render('dishAuthorization'); }, 'authList');
        await nav(function () { q('#newUnifiedAuth').click(); }, 'openAuth');
        await nav(function () { q('[data-auth-recipe-view]').click(); }, 'authPreview');
      } else if (/^auth-create-[123]$/.test(kase)) {
        await openAuthCreate(Number(kase.slice(-1)));
      } else {
        out('VERIFY_ERR=unknown-case:' + kase);
        return;
      }

      await sleep(420);
      if (!window.VitaminAnnotations) { out('VERIFY_ERR=no-VitaminAnnotations'); return; }
      await window.VitaminAnnotations.ready;
      await sleep(760);

      var diag = window.VitaminAnnotations.diagnostics();
      var summary = { kase: kase, view: document.body.dataset.vpaView, steps: steps, diag: diag };
      out('VERIFY_JSON=' + JSON.stringify(summary));
    } catch (e) {
      out('VERIFY_ERR=' + (e && e.message) + ' steps=' + steps.join(','));
    }
  }

  window.addEventListener('load', function () { setTimeout(run, 60); });
})();
