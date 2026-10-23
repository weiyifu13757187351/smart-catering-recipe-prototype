/* ============================================================================
   租户端菜谱管理 · 用料流改造（V3）
   ----------------------------------------------------------------------------
   事实前提：运营人员是「边写加工步骤，才知道用料和用多少」的。
   所以本层把「用料明细」从主数据降级为加工步骤的派生汇总：

   1. 页签顺序 → 1 基础信息 / 2 加工步骤 / 3 用料明细（在 unified-recipe-editor-v2.js 里改）
   2. 人工处理的「关联用料」不再勾选用料明细，改为自行添加：
      每条 = 标准食材 或 商品SKU（该 SKU 所属商品关联的标准食材），用量手工输入，单位固定「克」
   3. 设备操作步骤的「投料明细」同样自行添加（共用同一个选择器）
   4. 用料明细 = 按名称去重（标准食材按食材、商品按 SKU）+ 跨步骤汇总用量，
      并列出「该用料在哪些步骤各用了多少」

   本文件在 unified-recipe-list-v2.js 之后加载，通过覆盖既有全局函数接入：
   ingredientHtml / syncDishDetails / bindDetailEditor / detailContent
   ========================================================================== */
(function () {
  const $ = (id) => document.getElementById(id);
  const $$ = (sel, root) => [...(root || document).querySelectorAll(sel)];
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const MAX_AMOUNT = 9999.99;

  /* ------------------------------------------------------------------ 基础 */
  const norm = (e) => (typeof e === 'string' ? { kind: 'food', name: e, food: e, amount: '' } : (e || {}));
  const kindOf = (e) => { const x = norm(e); return x.kind || (x.sku ? 'sku' : 'food'); };
  const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
  const fmt = (v) => { if (v === '' || v == null) return ''; const n = Number(v); return isFinite(n) ? String(Math.round(n * 100) / 100) : ''; };
  const typeTag = (kind) => (kind === 'sku' ? '<em class="rif-tag sku">商品</em>' : kind === 'liquid' ? '<em class="rif-tag liquid">液体</em>' : kind === 'powder' ? '<em class="rif-tag powder">粉末</em>' : kind === 'dish' ? '' : '<em class="rif-tag food">标准食材</em>');
  const keyOf = (e) => { const x = norm(e), k = kindOf(x); return k === 'sku' ? `sku:${x.sku || x.name}` : (k === 'liquid' || k === 'powder') ? `${k}:${x.name || x.food}` : `food:${x.food || x.name}`; };

  /* 数据源：标准食材沿用菜谱模块的食材库；商品/SKU 直接读商品中心那一份演示数据 */
  const foodList = () => (typeof detailFoods !== 'undefined' && Array.isArray(detailFoods)) ? detailFoods : [];
  const productList = () => (typeof pcProducts !== 'undefined' && Array.isArray(pcProducts)) ? pcProducts : [];
  const skuList = () => (typeof pcSkus !== 'undefined' && Array.isArray(pcSkus)) ? pcSkus : [];
  /* 与商品中心口径一致：只有「已发布 + 启用」的 SKU 可被菜谱引用 */
  const availableSkus = () => skuList().filter((x) => x[4] === '已发布' && x[5] === '启用').map((x) => ({
    name: x[0], code: x[1], product: x[2], spec: x[3],
    food: (productList().find((p) => p[0] === x[2]) || [])[2] || '',
  }));

  /* -------------------------------------------------------------- 汇总规则 */
  /* 设备加工步骤的用料在「投料明细」里维护：步骤自带的关联用料不显示、也不参与汇总 */
  const visibleAssoc = (step) => ((step && step.mode === 'device') ? [] : ((step && step.assoc) || []));
  window.recipeVisibleAssoc = visibleAssoc;

  /* 步骤是否计入烹饪投料：默认计入；关掉后整步用料只作加工过程记录（预处理、腌制、清洗等） */
  const countsInCooking = (step) => !step || step.cook !== false;
  window.recipeStepCountsIn = countsInCooking;

  function aggregateIngredients(steps) {
    const map = new Map();
    const push = (raw, stepIndex, stepType, counted) => {
      const e = norm(raw);
      const kind = kindOf(e);
      if (kind === 'dish') return;
      const name = e.name || e.food || '';
      if (!name) return;
      const key = keyOf(e);
      if (!map.has(key)) {
        map.set(key, { key, kind, name, food: e.food || '', sku: e.sku || '', product: e.product || '', spec: e.spec || '', total: 0, excluded: 0, uses: [] });
      }
      const row = map.get(key), amount = round2(e.amount);
      /* total = 计入烹饪投料的量（备料/排产口径）；excluded = 只作加工过程记录的量 */
      if (counted) row.total = round2(row.total + amount);
      else row.excluded = round2(row.excluded + amount);
      const use = row.uses.find((u) => u.stepIndex === stepIndex);
      if (use) use.amount = round2(use.amount + amount);
      else row.uses.push({ stepIndex, stepType, amount, counted });
    };
    (steps || []).forEach((s, i) => {
      const type = (s && s.type) || `第${i + 1}步`;
      const counted = countsInCooking(s);
      visibleAssoc(s).forEach((e) => push(e, i, type, counted));
      ((s && s.deviceConfigs) || []).forEach((c) => ((c && c.actions) || []).forEach((a) => ((a && a.materials) || []).forEach((mat) => push(mat, i, type, counted))));
    });
    return [...map.values()];
  }
  window.recipeAggregateIngredients = aggregateIngredients;
  /* 老模块（dishes-detail 的 initialIngredients）按裸标识符调用，需同时挂成全局名 */
  window.aggregateIngredients = aggregateIngredients;

  /* 用量是否合法：必填、>0、≤9999.99、最多两位小数 */
  function collectBadAmount(steps) {
    const list = steps || (typeof editSteps !== 'undefined' ? editSteps : []);
    for (let i = 0; i < list.length; i++) {
      const s = list[i] || {};
      const groups = [[...visibleAssoc(s)]];
      (s.deviceConfigs || []).forEach((c) => (c.actions || []).forEach((a) => groups.push([...(a.materials || [])])));
      for (const arr of groups) {
        for (const raw of arr) {
          const e = norm(raw);
          if (kindOf(e) === 'dish') continue;
          const name = e.name || e.food || '用料';
          const value = String(e.amount == null ? '' : e.amount).trim();
          if (!value) return { stepIndex: i, name, msg: `请填写「${name}」的用量（克）` };
          const n = Number(value);
          if (!isFinite(n) || n <= 0) return { stepIndex: i, name, msg: `「${name}」的用量需大于 0` };
          if (n > MAX_AMOUNT) return { stepIndex: i, name, msg: `「${name}」的用量不能超过 ${MAX_AMOUNT} 克` };
          if (!/^\d+(\.\d{1,2})?$/.test(value)) return { stepIndex: i, name, msg: `「${name}」的用量最多保留两位小数` };
        }
      }
    }
    return null;
  }
  window.collectBadAmount = collectBadAmount;

  /* -------------------------------------------------------- 用料明细派生表 */
  /* 烹饪投料（计入）= 备料与投料口径；过程用料（不计入）= 预处理/腌制/清洗等只作过程记录 */
  const usesOf = (r, counted) => (r.uses || []).filter((u) => !!u.counted === counted);
  const cookRows = (rows) => rows.filter((r) => usesOf(r, true).length);
  const processRows = (rows) => rows.filter((r) => usesOf(r, false).length);
  const sumAmount = (rows, field) => round2(rows.reduce((n, r) => n + (Number(r[field]) || 0), 0));

  /* 同一用料登记在多步时，说明投料量到底按哪几处算 */
  function dupNote(r) {
    const all = (r.uses || []).slice().sort((a, b) => a.stepIndex - b.stepIndex);
    if (all.length < 2) return '';
    const counted = all.filter((u) => u.counted).length;
    const detail = all.map((u) => `${esc(u.stepType)} ${fmt(u.amount)}${u.counted ? '' : '（不计入）'}`).join(' + ');
    return `<div class="rif-dup">同一用料登记在 ${all.length} 个步骤：${detail}；投料量按其中计入的 ${counted} 处计 ${fmt(r.total)} 克</div>`;
  }

  function rowsTableHtml(rows, counted) {
    return `<div class="rif-table-wrap"><table class="rif-table">
      <thead><tr><th style="width:34%">用料名称</th><th style="width:20%">${counted ? '投料量（克）' : '用量（克）'}</th><th>${counted ? '使用步骤（计入）' : '所在步骤（不计入）'}</th></tr></thead>
      <tbody>${rows.map((r) => `<tr>
        <td><b>${esc(r.name)}</b>${typeTag(r.kind)}${r.kind === 'sku' ? `<small class="rif-sub">关联标准食材：${esc(r.food || '—')}${r.spec ? `<span class="rif-spec"> · 规格：${esc(r.spec)}</span>` : ''}</small>` : ''}</td>
        <td class="rif-total"><b>${fmt(counted ? r.total : r.excluded)}</b></td>
        <td><div class="rif-uses">${usesOf(r, counted).slice().sort((a, b) => a.stepIndex - b.stepIndex).map((u) => `<span class="rif-use${counted ? '' : ' off'}"><i>${u.stepIndex + 1}</i>${esc(u.stepType)}<b>${fmt(u.amount)}克</b></span>`).join('')}</div>${counted ? dupNote(r) : ''}</td>
      </tr>`).join('')}</tbody></table></div>`;
  }

  function ingredientTableHtml(rows) {
    const list = rows || [];
    if (!list.length) return '<div class="rif-table-empty">暂无用料：请到「加工步骤」里添加关联用料或设备投料明细</div>';
    const cook = cookRows(list), proc = processRows(list);
    const cookSum = sumAmount(cook, 'total'), procSum = sumAmount(proc, 'excluded');
    const dup = cook.filter((r) => (r.uses || []).length > 1).length;
    const balance = `<div class="rif-balance">
      <span class="rif-balance-item cook">烹饪投料（计入）<b>${cook.length} 项</b><em>${fmt(cookSum)} 克</em></span>
      ${proc.length ? `<span class="rif-balance-item proc">过程用料（不计入投料）<b>${proc.length} 项</b><em>${fmt(procSum)} 克</em></span>` : ''}
    </div>`;
    const hint = dup ? `<div class="rif-dup-hint">有 ${dup} 项用料在多个步骤重复登记；投料量只按「计入烹饪投料」的步骤计算，请看下方说明。</div>` : '';
    const cookBlock = `<section class="rif-cook-block">
      <header><b>烹饪投料（计入）</b><span>备料、排产与投料都以这一份为准</span></header>
      ${cook.length ? rowsTableHtml(cook, true) : '<div class="rif-table-empty">当前没有计入烹饪投料的用料：请到「加工步骤」把需要投料的步骤打开「计入烹饪投料」。</div>'}
    </section>`;
    const procBlock = proc.length ? `<details class="rif-proc-block">
      <summary>过程用料（不计入投料）<b>${proc.length} 项 · ${fmt(procSum)} 克</b></summary>
      <p class="rif-note">仅用于记录加工过程（预处理、腌制、清洗等重复登记或非投料用料），不计入投料量、备料量与就餐人数测算。</p>
      ${rowsTableHtml(proc, false)}
    </details>` : '';
    return `<div class="rif-split">${balance}${hint}${cookBlock}${procBlock}</div>`;
  }
  window.ingredientTableHtml = ingredientTableHtml;
  /* 供菜谱编辑向导（页签项数、提交校验）读的口径：烹饪投料 / 过程用料 各几项 */
  window.recipeIngredientCounts = function (steps) {
    const rows = aggregateIngredients(steps || (typeof editSteps !== 'undefined' ? editSteps : []));
    return { cook: cookRows(rows).length, process: processRows(rows).length };
  };

  /* 覆盖：用料明细表格（编辑态页签 + 只读详情 + 版本对比共用） */
  ingredientHtml = function () {
    return ingredientTableHtml(aggregateIngredients(typeof editSteps !== 'undefined' ? editSteps : []));
  };

  /* ------------------------------------------------- 人工处理：关联用料 */
  function assocRowHtml(raw, i, readonly) {
    const e = norm(raw);
    const kind = kindOf(e);
    return `<div class="rif-assoc-row" data-assoc-row data-index="${i}" data-kind="${kind}" data-name="${esc(e.name || e.food)}" data-food="${esc(e.food || '')}" data-sku="${esc(e.sku || '')}" data-product="${esc(e.product || '')}" data-spec="${esc(e.spec || '')}">
      <span class="rif-name"><b>${esc(e.name || e.food)}</b>${typeTag(kind)}${kind === 'sku' ? `<small>关联标准食材：${esc(e.food || '—')}</small>${e.spec ? `<small class="rif-spec">规格：${esc(e.spec)}</small>` : ''}` : ''}</span>
      <span class="rif-amount"><input type="number" min="0" max="${MAX_AMOUNT}" step="0.01" data-assoc-amount placeholder="请输入用量" value="${esc(e.amount)}" ${readonly ? 'disabled' : ''}><i>克</i></span>
      ${readonly ? '' : `<button type="button" class="rif-del" data-assoc-remove="${i}" title="移除">×</button>`}
    </div>`;
  }

  function assocBlockHtml(step, stepIndex, readonly) {
    if (step && step.mode === 'device') return '';   /* 设备加工：用料在「投料明细」里维护 */
    const list = (step && step.assoc) || [];
    return `<div class="full rif-assoc">
      <div class="rif-assoc-head">
        <span>关联用料</span>
        ${readonly ? '' : `<button type="button" class="ghost rif-add" data-add-assoc="${stepIndex}">＋ 添加用料</button>`}
      </div>
      <div class="rif-assoc-list">${list.length ? list.map((e, i) => assocRowHtml(e, i, readonly)).join('') : '<p class="rif-empty">未添加用料：点击「＋ 添加用料」选择标准食材或商品SKU，并填写用量（克）</p>'}</div>
    </div>`;
  }
  window.assocBlockHtml = assocBlockHtml;

  /* --------------------------------------------- 设备加工：投料明细行 */
  /* 液体 / 粉末动作：可投料清单由三方接口返回的固定值，用户只能从中勾选，不能自行添加食材 */
  const THIRD_PARTY_FEEDS = {
    liquid: ['水淀粉', '水', '花生油', '陈醋', '白醋', '生抽', '老抽', '辣鲜露'],
    powder: ['盐', '白糖', '味精', '鸡精', '白胡椒粉', '五香粉', '花椒粉', '辣椒粉', '淀粉', '小苏打'],
  };
  window.recipeThirdPartyFeeds = THIRD_PARTY_FEEDS;
  const isThirdPartyFeed = (a) => !!a && (a.feed === 'liquid' || a.feed === 'powder');
  const thirdPartyOptions = (a) => (isThirdPartyFeed(a) ? THIRD_PARTY_FEEDS[a.feed] : []);
  const feedKindName = (feed) => (feed === 'liquid' ? '液体' : feed === 'powder' ? '粉末' : '投料');

  /* 投料明细的标题区（v1 的设备操作抽屉调用；液体/粉末没有「＋ 添加投料」，也不显示说明小字） */
  function feedHeadHtml(a) {
    if (isThirdPartyFeed(a)) {
      return '<div class="uo-material-head"><b>投料明细</b></div>';
    }
    return `<div class="uo-material-head"><b>投料明细</b><span>支持标准食材或商品SKU；用量单位固定「克」，需手工填写</span><button type="button" class="ghost rif-uo-add" id="uoAddMaterial">＋ 添加投料</button></div>`;
  }
  window.feedHeadHtml = feedHeadHtml;

  /* 行内「搜索名称后选择」的下拉选择器 */
  function thirdPartySelectorHtml(a) {
    const label = feedKindName(a.feed);
    return `<div class="rif-tp-select">
      <div class="rif-tp-field">
        <input type="text" id="uoFeedSearch" class="rif-tp-input" placeholder="搜索${label}名称后选择" autocomplete="off">
        <span class="rif-tp-arrow">⌄</span>
      </div>
      <div class="rif-tp-options" id="uoFeedOptions" hidden></div>
    </div>`;
  }

  function feedMaterialRowsHtml(a) {
    const list = (a && a.materials) || [];
    if (isThirdPartyFeed(a)) {
      return thirdPartySelectorHtml(a) + (list.length
        ? list.map((raw, i) => {
          const e = norm(raw), kind = kindOf(e);
          return `<div class="rif-uo-row rif-tp-row" data-uo-material-row data-index="${i}" data-kind="${kind}" data-name="${esc(e.name || e.food)}" data-food="" data-sku="" data-product="" data-spec="">
            <span><b>${esc(e.name || e.food)}</b>${typeTag(kind)}</span>
            <input type="number" min="0" max="${MAX_AMOUNT}" step="0.01" data-uo-material-amount="${i}" value="${esc(e.amount)}" placeholder="请输入用量"><em>克</em>
            <button type="button" class="rif-del" data-uo-material-remove="${i}" title="移除">×</button>
          </div>`;
        }).join('')
        : '<div class="rif-tp-empty">尚未选择用料：请在上方搜索名称后选择</div>');
    }
    if (!list.length) return '<div class="uo-material-empty">未添加投料：点击「＋ 添加投料」选择标准食材或商品SKU</div>';
    return list.map((raw, i) => {
      const e = norm(raw), kind = kindOf(e);
      return `<div class="rif-uo-row" data-uo-material-row data-index="${i}" data-kind="${kind}" data-name="${esc(e.name || e.food)}" data-food="${esc(e.food || '')}" data-sku="${esc(e.sku || '')}" data-product="${esc(e.product || '')}" data-spec="${esc(e.spec || '')}">
        <span><b>${esc(e.name || e.food)}</b>${typeTag(kind)}<small>${kind === 'sku' ? `关联标准食材：${esc(e.food || '—')}` : '用量单位为克'}</small></span>
        <input type="number" min="0" max="${MAX_AMOUNT}" step="0.01" data-uo-material-amount="${i}" value="${esc(e.amount)}" placeholder="请输入用量"><em>克</em>
        <button type="button" class="rif-del" data-uo-material-remove="${i}" title="移除">×</button>
      </div>`;
    }).join('');
  }
  window.feedMaterialRowsHtml = feedMaterialRowsHtml;

  function syncFeedMaterialAmounts(a) {
    ((a && a.materials) || []).forEach((e, i) => {
      const inp = document.querySelector(`[data-uo-material-amount="${i}"]`);
      if (inp) e.amount = inp.value;
    });
  }
  window.syncFeedMaterialAmounts = syncFeedMaterialAmounts;

  /* 设备操作步骤抽屉里投料明细的交互（由 unified-recipe-v1.js 在渲染后调用） */
  window.bindFeedMaterials = function (a, renderFeed) {
    const add = document.getElementById('uoAddMaterial');
    if (add) add.onclick = () => {
      syncFeedMaterialAmounts(a);
      openIngredientPicker({
        exclude: new Set(((a && a.materials) || []).map(keyOf)),
        onPick: (entry) => {
          a.materials = a.materials || [];
          a.materials.push(entry);
          renderFeed();
          document.querySelector(`[data-uo-material-amount="${a.materials.length - 1}"]`)?.focus();
          showToast(`已添加投料：${entry.name}`);
        },
      });
    };
    $$('[data-uo-material-remove]').forEach((b) => b.onclick = () => {
      syncFeedMaterialAmounts(a);
      a.materials.splice(Number(b.dataset.uoMaterialRemove), 1);
      renderFeed();
      showToast('已移除该投料');
    });
    $$('[data-uo-material-amount]').forEach((inp) => {
      inp.oninput = () => syncFeedMaterialAmounts(a);
      /* 液体/粉末：用量按两位小数回显 */
      if (isThirdPartyFeed(a)) inp.onblur = () => {
        const i = Number(inp.dataset.uoMaterialAmount), e = (a.materials || [])[i];
        if (!e) return;
        const v = String(inp.value).trim();
        if (v === '') { e.amount = ''; return; }
        const n = Number(v);
        if (!isFinite(n)) return;
        e.amount = n.toFixed(2);
        inp.value = e.amount;
      };
    });

    /* 液体 / 粉末：只能从三方接口返回的固定清单里选择（可多选），列表随输入过滤 */
    const search = document.getElementById('uoFeedSearch'), options = document.getElementById('uoFeedOptions');
    if (search && options) {
      const renderOptions = () => {
        const kw = search.value.trim().toLowerCase();
        const chosen = new Set(((a && a.materials) || []).map((x) => x.name || x.food || ''));
        const rest = thirdPartyOptions(a).filter((n) => !chosen.has(n) && (!kw || n.toLowerCase().includes(kw)));
        options.innerHTML = rest.length
          ? rest.map((n) => `<button type="button" class="rif-tp-option" data-tp-pick="${esc(n)}">${esc(n)}</button>`).join('')
          : `<div class="rif-tp-none">${kw ? '清单中没有匹配名称（清单由三方接口提供，不能自行添加）' : '清单中的用料都已选择'}</div>`;
        options.hidden = false;
        $$('[data-tp-pick]', options).forEach((b) => b.onclick = () => {
          syncFeedMaterialAmounts(a);
          a.materials = a.materials || [];
          a.materials.push({ kind: a.feed, name: b.dataset.tpPick, food: '', sku: '', product: '', spec: '', amount: '' });
          renderFeed();
          /* 选择后回到搜索框并保持清单展开，方便连续多选；用量在各行里填写 */
          document.getElementById('uoFeedSearch')?.focus();
          showToast(`已添加${feedKindName(a.feed)}：${b.dataset.tpPick}`);
        });
      };
      search.onfocus = renderOptions;
      search.oninput = renderOptions;
      search.onblur = () => setTimeout(() => {
        if (document.getElementById('uoFeedSearch') !== search) return;   // 已重新渲染，交给新的输入框
        const host = document.getElementById('uoFeedOptions');
        if (host) host.hidden = true;
      }, 160);
      search.onkeydown = (e) => { if (e.key === 'Escape') { options.hidden = true; } if (e.key === 'Enter') { e.preventDefault(); $$('[data-tp-pick]', options)[0]?.click(); } };
    }
  };

  /* ------------------------------------------------------------ 选择器 */
  let pickerCtx = null;

  const pickerHtml = () => `<div class="rif-picker-mask" id="rifPickerMask">
    <div class="rif-picker">
      <header class="rif-picker-head"><div><h3>选择用料</h3><p>可选平台标准食材（${foodList().length} 项），或标准食材关联商品下的商品SKU（${availableSkus().length} 个已发布且启用的 SKU）；用量统一按「克」手工填写</p></div><button id="rifPickerClose">×</button></header>
      <div class="rif-tabs">
        <button type="button" data-rif-tab="food" class="active">标准食材</button>
        <button type="button" data-rif-tab="sku">商品SKU</button>
      </div>
      <div class="rif-search">
        <input id="rifKeyword" placeholder="搜索名称、别名">
        <select id="rifCategory"><option value="">全部分类</option></select>
      </div>
      <div class="rif-list" id="rifList"></div>
      <footer class="rif-picker-foot"><span>已添加到本步骤的用料不可重复选择</span><button type="button" class="ghost" id="rifPickerCancel">取消</button></footer>
    </div>
  </div>`;

  function renderPickerList() {
    if (!pickerCtx) return;
    const kw = pickerCtx.keyword.trim().toLowerCase();
    const box = $('rifList');
    if (!box) return;
    let rows = [];
    if (pickerCtx.tab === 'food') {
      rows = foodList()
        .filter((x) => !pickerCtx.category || x.category === pickerCtx.category)
        .filter((x) => !kw || `${x.name}${x.alias || ''}`.toLowerCase().includes(kw))
        .map((x) => ({
          key: `food:${x.name}`, kind: 'food', name: x.name, food: x.name, sku: '', product: '', spec: '',
          title: x.name, sub: x.alias ? `别名：${x.alias}` : '', meta: `${x.category || ''}`,
        }));
    } else {
      rows = availableSkus()
        .filter((x) => !kw || x.name.toLowerCase().includes(kw))
        .map((x) => ({
          key: `sku:${x.code}`, kind: 'sku', name: x.name, food: x.food, sku: x.code, product: x.product, spec: x.spec,
          title: x.name, sub: `所属商品：${x.product}`, meta: x.food ? `关联标准食材：${x.food}` : '未关联标准食材',
        }));
    }
    box.innerHTML = rows.length ? rows.map((r) => {
      const disabled = pickerCtx.exclude.has(r.key);
      return `<button type="button" class="rif-row ${disabled ? 'is-disabled' : ''}" data-rif-pick="${esc(r.key)}" ${disabled ? 'disabled' : ''}>
        <span><b>${esc(r.title)}</b><small>${esc(r.sub)}</small>${r.spec ? `<small class="rif-row-spec">规格：${esc(r.spec)}</small>` : ''}</span><em>${esc(r.meta)}</em>${disabled ? '<i class="rif-picked">本步骤已添加</i>' : '<i class="rif-go">选择</i>'}
      </button>`;
    }).join('') : `<p class="rif-list-empty">${pickerCtx.tab === 'food' ? '没有匹配的标准食材' : '没有匹配的商品SKU（仅显示已发布且启用的 SKU）'}</p>`;
  }

  function bindPicker() {
    const mask = $('rifPickerMask');
    if (!mask || mask.dataset.bound === '1') return;
    mask.dataset.bound = '1';
    $$('[data-rif-tab]', mask).forEach((b) => b.onclick = () => {
      pickerCtx.tab = b.dataset.rifTab;
      $$('[data-rif-tab]', mask).forEach((x) => x.classList.toggle('active', x === b));
      const cat = $('rifCategory');
      cat.hidden = pickerCtx.tab !== 'food';
      renderPickerList();
    });
    $('rifKeyword').oninput = (e) => { pickerCtx.keyword = e.target.value; renderPickerList(); };
    $('rifCategory').onchange = (e) => { pickerCtx.category = e.target.value; renderPickerList(); };
    $('rifPickerClose').onclick = closeIngredientPicker;
    $('rifPickerCancel').onclick = closeIngredientPicker;
    mask.onclick = (e) => { if (e.target === mask) closeIngredientPicker(); };
    $('rifList').onclick = (e) => {
      const btn = e.target.closest('[data-rif-pick]');
      if (!btn || btn.disabled) return;
      const key = btn.dataset.rifPick;
      const isFood = key.startsWith('food:');
      const name = key.slice(isFood ? 5 : 4);
      const entry = isFood
        ? (() => { const f = foodList().find((x) => x.name === name) || { name }; return { kind: 'food', name: f.name, food: f.name, sku: '', product: '', spec: '', amount: '' }; })()
        : (() => { const s = availableSkus().find((x) => x.code === name) || { name, code: name }; return { kind: 'sku', name: s.name, food: s.food || '', sku: s.code, product: s.product || '', spec: s.spec || '', amount: '' }; })();
      const done = pickerCtx.onPick;
      closeIngredientPicker();
      done(entry);
    };
  }

  function closeIngredientPicker() {
    const mask = $('rifPickerMask');
    if (mask) mask.classList.remove('show');
    pickerCtx = null;
  }

  function openIngredientPicker(ctx) {
    if (!$('rifPickerMask')) document.body.insertAdjacentHTML('beforeend', pickerHtml());
    bindPicker();
    pickerCtx = { tab: 'food', keyword: '', category: '', exclude: ctx.exclude || new Set(), onPick: ctx.onPick };
    const cat = $('rifCategory');
    if (cat && cat.options.length <= 1) {
      [...new Set(foodList().map((x) => x.category).filter(Boolean))].forEach((c) => cat.insertAdjacentHTML('beforeend', `<option>${esc(c)}</option>`));
    }
    $('rifKeyword').value = '';
    if (cat) { cat.value = ''; cat.hidden = false; }
    $$('[data-rif-tab]').forEach((x) => x.classList.toggle('active', x.dataset.rifTab === 'food'));
    renderPickerList();
    $('rifPickerMask').classList.add('show');
    setTimeout(() => $('rifKeyword')?.focus(), 0);
  }
  window.openRecipeIngredientPicker = openIngredientPicker;

  /* ------------------------------------------- 关联用料行的交互绑定 */
  function bindAssocUI() {
    $$('[data-add-assoc]').forEach((btn) => btn.onclick = () => {
      const card = btn.closest('.process-card');
      const si = Number(card?.dataset.stepIndex ?? 0);
      syncDishDetails();
      const step = editSteps[si];
      if (!step) return;
      openIngredientPicker({
        exclude: new Set((step.assoc || []).map(keyOf)),
        onPick: (entry) => {
          step.assoc = step.assoc || [];
          step.assoc.push(entry);
          redrawDetail();
          const rows = $$('.process-card .rif-assoc-row');
          rows[rows.length - 1]?.querySelector('[data-assoc-amount]')?.focus();
          showToast(`已添加用料：${entry.name}，请填写用量（克）`);
        },
      });
    });
    $$('[data-assoc-remove]').forEach((btn) => btn.onclick = () => {
      const card = btn.closest('.process-card');
      const si = Number(card?.dataset.stepIndex ?? 0);
      syncDishDetails();
      editSteps[si]?.assoc?.splice(Number(btn.dataset.assocRemove), 1);
      redrawDetail();
      showToast('已移除该用料');
    });
    $$('[data-assoc-amount]').forEach((inp) => inp.oninput = () => {
      const card = inp.closest('.process-card');
      const si = Number(card?.dataset.stepIndex ?? 0);
      const row = inp.closest('[data-assoc-row]');
      const idx = Number(row?.dataset.index ?? 0);
      const step = editSteps[si];
      if (step && step.assoc && step.assoc[idx]) step.assoc[idx].amount = inp.value;
    });
  }

  /* ------------------------------------- 覆盖：编辑态的数据同步 */
  const prevSyncDishDetails = syncDishDetails;
  syncDishDetails = function () {
    const keepAssoc = (typeof editSteps !== 'undefined' ? editSteps : []).map((s) => (s && s.assoc) || []);
    prevSyncDishDetails();
    if (!document.getElementById('unifiedRecipeEditorRoot')) return;   // 非编辑态交给原逻辑
    const card = document.querySelector('.recipe-process-workspace .process-card');
    if (card) {
      const si = Number(card.dataset.stepIndex ?? 0);
      const step = editSteps[si];
      const cookBox = card.querySelector('[data-step-cook]');
      if (step && cookBox) step.cook = cookBox.checked;   /* 步骤级：是否计入烹饪投料 */
      if (step && card.querySelector('.rif-assoc')) {
        step.assoc = $$('[data-assoc-row]', card).map((row) => ({
          kind: row.dataset.kind || 'food',
          name: row.dataset.name || '',
          food: row.dataset.food || '',
          sku: row.dataset.sku || '',
          product: row.dataset.product || '',
          spec: row.dataset.spec || '',
          amount: row.querySelector('[data-assoc-amount]')?.value ?? '',
        }));
      } else if (step) {
        /* 设备加工步骤没有关联用料块（用料在「投料明细」里），保留原数据，切回人工处理时可恢复 */
        step.assoc = keepAssoc[si] || step.assoc || [];
      }
    }
    /* 用料明细始终由加工步骤派生 */
    editIngredients = aggregateIngredients(editSteps);
  };

  /* ------------------------------------- 覆盖：绑定时补上新 UI 的事件 */
  const prevBindDetailEditor = bindDetailEditor;
  bindDetailEditor = function () {
    prevBindDetailEditor();
    bindAssocUI();
  };

  /* ------------------------------------- 旧结构兜底迁移（旧草稿/旧菜谱） */
  window.recipeMigrateLegacyIngredients = function (legacy, steps) {
    const list = (legacy || []).filter((x) => x && x.role && x.food);
    if (!list.length || !steps?.length) return;
    const hasMaterial = steps.some((s) => (s.assoc || []).length
      || (s.deviceConfigs || []).some((c) => (c.actions || []).some((a) => (a.materials || []).length)));
    if (hasMaterial) return;
    steps[0].assoc = list.map((x) => ({
      kind: 'food', name: x.food, food: x.food, sku: '', product: '', spec: '',
      amount: x.unit === '克' ? String(x.amount || '') : '',
    }));
    if (typeof showToast === 'function') showToast('已把原有用料明细迁移到第 1 步的关联用料');
  };

  /* ------------------------------- 只读详情：加工步骤（带用量） */
  const modelName = (id) => {
    const models = (typeof window.recipeModels !== 'undefined' && window.recipeModels) || [];
    const hit = models.find((m) => m.id === id) || models.find((m) => `${m.vendor}·${m.name}` === id || m.name === id);
    return hit ? `${hit.vendor} · ${hit.name}` : id;
  };
  const feedLabel = (a) => {
    if (typeof window.recipeFeedLabel === 'function') return window.recipeFeedLabel(a);
    return ({ fire: '火力', solid: '投料', liquid: '液体', powder: '粉末' })[a?.feed] || '操作设备';
  };

  function readOnlyStepsHtml(steps) {
    const list = steps || [];
    if (!list.length) return '<p class="rif-empty">暂无加工步骤</p>';
    return list.map((s, i) => `<div class="rif-ro-step">
      <header><i>${i + 1}</i><b>${esc(s.type || '')}</b><em class="process-mode-tag ${s.mode === 'device' ? 'device' : 'manual'}">${s.mode === 'device' ? '设备加工' : '人工处理'}</em>${countsInCooking(s) ? '' : '<em class="rif-cook-flag">不计入投料</em>'}</header>
      ${visibleAssoc(s).length ? `<div class="rif-ro-assoc"><b>关联用料：</b>${visibleAssoc(s).map((e) => `<span class="rif-ro-item"><b>${esc(norm(e).name || norm(e).food)}</b>${typeTag(kindOf(e))}<em>${fmt(norm(e).amount) || '—'} 克</em></span>`).join('')}</div>` : ''}
      ${s.requirement ? `<p><b>操作要求：</b>${esc(s.requirement)}</p>` : ''}
      ${s.standard ? `<p><b>完成标准：</b>${esc(s.standard)}</p>` : ''}
      ${s.attention ? `<p><b>注意事项：</b>${esc(s.attention)}</p>` : ''}
      ${(s.deviceConfigs || []).length ? `<div class="rif-ro-device"><p><b>适配设备：</b>${s.deviceConfigs.map((c) => esc(modelName(c.modelId))).join('、')}</p>
        ${(s.deviceConfigs[0].actions || []).length ? `<div class="rif-ro-actions">${s.deviceConfigs[0].actions.map((a, ai) => `<div class="rif-ro-action"><i>${ai + 1}</i><b>${esc(feedLabel(a))}</b><span>${esc(a.duration || 0)}S</span>${(a.materials || []).length ? `<small>投料：${a.materials.map((m) => `${esc(norm(m).name || norm(m).food)} ${fmt(norm(m).amount)}克`).join('、')}</small>` : ''}</div>`).join('')}</div>` : '<p class="rif-empty">该设备型号下暂无操作步骤</p>'}</div>` : ''}
    </div>`).join('');
  }
  window.recipeReadOnlyStepsHtml = readOnlyStepsHtml;

  /* 覆盖：旧详情/版本对比的正文（把用料明细挪到加工步骤之后，并换成派生表） */
  const prevDetailContent = detailContent;
  detailContent = function (d, readonly, standard) {
    const html = prevDetailContent(d, readonly, standard);
    const basicStart = html.indexOf('<div class="dish-form-section"><h4>一、基本信息</h4>');
    const ingStart = html.indexOf('<div class="dish-form-section"><div class="editable-list-head"><h4>二、用料明细');
    const nutritionStart = html.indexOf('<div class="dish-form-section"><h4>四、营养预览</h4>');
    if (basicStart < 0 || ingStart < 0 || nutritionStart < 0) return html;
    const banner = html.slice(0, basicStart);
    const basic = html.slice(basicStart, ingStart);
    const nutrition = html.slice(nutritionStart);
    const steps = (typeof editSteps !== 'undefined' && editSteps.length) ? editSteps : [];
    return `${banner}${basic}
      <div class="dish-form-section"><h4>二、加工步骤</h4><div class="rif-ro-steps">${readOnlyStepsHtml(steps)}</div></div>
      <div class="dish-form-section"><h4>三、用料明细</h4><p class="rif-note">用料明细由加工步骤自动汇总，不可在此增删；用量单位统一为「克」。只有打开「计入烹饪投料」的步骤计入投料量，其余步骤的用料列为「过程用料」仅作过程记录。</p>${ingredientTableHtml(aggregateIngredients(steps))}</div>
      ${nutrition}`;
  };

  /* ------------------------------- 菜谱详情页（列表模块）专用渲染 */
  const DETAIL_STEPS = () => ([
    {
      type: '预处理', mode: 'manual', cook: false, requirement: '食材清洗后按菜谱要求切配。', standard: '大小均匀', attention: '沥干备用',
      assoc: [{ kind: 'food', name: '鸡胸肉', food: '鸡胸肉', amount: '800' }],
    },
    {
      type: '炒制', mode: 'device', requirement: '', standard: '', attention: '',
      assoc: [],
      deviceConfigs: [{
        modelId: 'ZG-A8',
        actions: [
          { duration: '20', power: '5KW', direction: '顺时针', speed: '慢速', position: '低位', feed: 'fire', materials: [] },
          { duration: '15', power: '5KW', direction: '顺时针', speed: '慢速', position: '低位', feed: 'solid', feedMethod: 'auto', box: '1', materials: [{ kind: 'food', name: '鸡胸肉', food: '鸡胸肉', amount: '800' }, { kind: 'sku', name: '海天生抽 500ml×12', food: '生抽', sku: 'SKU000601', product: '海天生抽', spec: '500ml×12', amount: '120' }] },
        ],
      }],
    },
  ]);

  /* 「最新授权版本」与当前版本的差异：演示用的同一份数据里调整一处设备投料量，
     用料明细与加工步骤都基于这份数据派生，保证两个页签口径一致。 */
  const detailStepsFor = (latest) => {
    const steps = DETAIL_STEPS();
    if (latest && steps[1]?.deviceConfigs?.[0]?.actions?.[1]?.materials?.[0]) steps[1].deviceConfigs[0].actions[1].materials[0].amount = '1000';
    return steps;
  };

  window.recipeDetailIngredientHtml = function (latest) {
    const rows = aggregateIngredients(detailStepsFor(latest));
    const cook = cookRows(rows).length, proc = processRows(rows).length;
    return `<section class="device-detail-section"><div class="device-detail-section-head"><h3>用料明细</h3><span>烹饪投料 ${cook} 项${proc ? ` · 过程用料 ${proc} 项` : ''}</span></div>
      <p class="rif-note">用料明细由加工步骤自动汇总；用量单位统一为「克」。只有打开「计入烹饪投料」的步骤计入投料量。</p>${ingredientTableHtml(rows)}</section>`;
  };

  window.recipeDetailProcessHtml = function (d, latest) {
    const steps = detailStepsFor(latest);
    const devices = (d && d.devices && d.devices.length) ? d.devices : ['智谷·智能炒菜机器人 A8'];
    return `<div class="device-detail-process">${steps.map((s, i) => `<section class="device-detail-process-step">
      <header><i>${i + 1}</i><div><b>${esc(s.type)}</b><span>第${i + 1}步</span></div><em class="process-mode-tag ${s.mode === 'device' ? 'device' : 'manual'}">${s.mode === 'device' ? '设备加工' : '人工处理'}</em>${countsInCooking(s) ? '' : '<em class="rif-cook-flag">不计入投料</em>'}</header>
      ${s.mode === 'device'
        ? `<div class="unified-detail-device-config"><h4>适配设备型号</h4>${devices.map((x, di) => `<button class="${di ? '' : 'active'}">${esc(x)}</button>`).join('')}
            <div class="rif-ro-actions">${s.deviceConfigs[0].actions.map((a, ai) => `<div class="rif-ro-action"><i>${ai + 1}</i><b>${esc(feedLabel(a))}</b><span>${esc(a.duration)}S</span>${(a.materials || []).length ? `<small>投料：${a.materials.map((m) => `${esc(norm(m).name)} ${fmt(norm(m).amount)}克`).join('、')}</small>` : ''}</div>`).join('')}</div></div>`
        : `<div class="device-detail-manual">${(s.assoc || []).length ? `<p><b>关联用料：</b>${s.assoc.map((e) => `${esc(norm(e).name)} ${fmt(norm(e).amount)}克`).join('、')}</p>` : ''}<p><b>操作要求：</b>${esc(s.requirement || '—')}</p><p><b>完成标准：</b>${esc(s.standard || '—')}</p><p><b>注意事项：</b>${esc(s.attention || '—')}</p></div>`}
    </section>`).join('')}</div>`;
  };
})();
