/**
 * 供货关系管理冒烟脚本（CDP，无第三方依赖）
 * 前置：本地静态服务跑在 4201，Chrome 以 --remote-debugging-port=9333 启动。
 * 用法：PO_PORT=4201 node tools/po-supply-smoke.mjs
 *
 * 种子：16 个 SKU（S2201 / S2501 已下架；S2801 无任何供应商报价）
 *       11 条供货关系（含已下架的 S2201 → 本地蔬菜合作社）
 */
const CDP = 'http://127.0.0.1:9333';
const PORT = process.env.PO_PORT || '4201';
const BASE = process.env.PO_BASE || ('http://127.0.0.1:' + PORT + '/');
const APP = BASE + encodeURIComponent('食联网数智餐饮平台-组织及人员.html');
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function connect() {
  for (let i = 0; i < 40; i++) {
    try {
      const list = await (await fetch(`${CDP}/json/list`)).json();
      const page = list.find(t => t.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch { /* 等 Chrome 起来 */ }
    await sleep(250);
  }
  throw new Error('连不上 CDP');
}

const ws = new WebSocket(await connect());
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let seq = 0;
const waiters = new Map();
const errors = [];
ws.onmessage = ev => {
  const m = JSON.parse(ev.data);
  if (m.id && waiters.has(m.id)) { waiters.get(m.id)(m); waiters.delete(m.id); }
  if (m.method === 'Runtime.exceptionThrown') errors.push('EXCEPTION ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push('ERROR ' + m.params.args.map(a => a.value ?? a.description ?? '').join(' '));
};
const send = (method, params = {}) => new Promise(res => { const id = ++seq; waiters.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
async function evaluate(expression) {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text);
  return r.result?.result?.value;
}

await send('Runtime.enable');
await send('Page.enable');
await send('Network.enable');
await send('Network.clearBrowserCache');
await send('Page.navigate', { url: APP });
await sleep(2600);

const results = [];
const step = async (name, expression) => {
  try {
    const value = await evaluate(expression);
    const ok = !(value && value.fail);
    results.push({ name, ok, value });
    console.log(`${ok ? 'OK  ' : 'FAIL'} ${name} → ${JSON.stringify(value)}`);
  } catch (e) {
    results.push({ name, ok: false, error: String(e.message || e) });
    console.log(`FAIL ${name} → ${String(e.message || e)}`);
  }
};

const HELPERS = `
  const P = () => document.getElementById('supplyRelationPage');
  const rows = () => [...P().querySelectorAll('.sr-table tbody tr')];
  const cells = tr => [...tr.children].map(td => td.textContent.replace(/\\s+/g, ' ').trim());
  const rowOf = code => rows().find(r => r.getAttribute('data-sr-row') === code);
  const stats = () => [...P().querySelectorAll('.po-stat')].map(x => x.textContent.replace(/\\s+/g, ' ').trim());
  const API = window.MerchantSupply.__debug;
`;

/* ==================== 1. 入口与页面骨架 ==================== */
await step('菜单新增「供货关系管理」，点击进入独立页面（面包屑正确）', `(() => {
  const nav = document.getElementById('srNav');
  if (!nav) return { fail: '菜单项不存在' };
  const label = nav.textContent.trim();
  const orderNav = document.getElementById('poOrderNav');
  nav.click();
  ${HELPERS}
  const bc = document.querySelector('.breadcrumb').textContent.replace(/\\s+/g, ' ').trim();
  return { label, orderNavStill: !!orderNav, shown: !P().hidden, hiddenOrderPage: !!document.getElementById('purchaseOrderPage') && document.getElementById('purchaseOrderPage').hidden, bc,
    fail: (label !== '供货关系管理' || P().hidden || bc.indexOf('供货关系管理') < 0 || !orderNav) ? '入口不符' : '' };
})()`);

await step('统计卡 4 张（无「暂无报价」卡）：可绑定 14 / 已绑定 10 / 未绑定 4 / 无报价 SKU 1', `(() => {
  ${HELPERS}
  const s = stats();
  return { stats: s, fail: (s.length !== 4 || s[0].indexOf('14') < 0 || s[1].indexOf('10') < 0
    || s[2].indexOf('4') < 0 || !/无供应商报价 SKU 数1/.test(s[3])) ? '统计卡不符' : '' };
})()`);

await step('默认隐藏已下架 SKU：表格 14 行，且没有 S2201 / S2501', `(() => {
  ${HELPERS}
  const codes = rows().map(r => r.getAttribute('data-sr-row'));
  return { count: rows().length, hasOff: codes.includes('S2201') || codes.includes('S2501'),
    fail: (rows().length !== 14 || codes.includes('S2201') || codes.includes('S2501')) ? '默认应隐藏已下架' : '' };
})()`);

await step('勾选「包含已下架」→ 16 行；下架行灰态只读（无勾选框、操作只读）', `(() => {
  ${HELPERS}
  const box = () => document.getElementById('srIncludeOff');
  box().checked = true; box().dispatchEvent(new Event('change'));
  const offRow = rowOf('S2201');
  const res = { count: rows().length, hasOffRow: !!offRow,
    isGrey: offRow ? offRow.classList.contains('sr-row-off') : false,
    noCheckboxAtAll: !document.querySelector('[data-sr-check], #srCheckAll'),
    opsReadonly: offRow ? /只读/.test(offRow.textContent) : false,
    keepsBinding: offRow ? /本地蔬菜合作社/.test(offRow.textContent) : false };
  box().checked = false; box().dispatchEvent(new Event('change'));
  res.backToNormal = rows().length;
  res.fail = (!res.hasOffRow || !res.isGrey || !res.noCheckboxAtAll || !res.opsReadonly || !res.keepsBinding || res.backToNormal !== 14) ? '已下架展示不符（绑定关系应保留）' : '';
  return res;
})()`);

/* ==================== 2. 筛选 ==================== */
await step('商品分类列显示三级（蔬菜类/茄果类/瓜果类）', `(() => {
  ${HELPERS}
  const c = cells(rowOf('S0301'));
  const c2 = cells(rowOf('S0101'));
  return { s0301: c[6], s0101: c2[6],
    fail: (c[6] !== '蔬菜类/茄果类/瓜果类' || c2[6] !== '肉禽蛋类/禽肉类/鸡产品') ? '分类三级不符' : '' };
})()`);

await step('筛选形态=净菜 → 3 行（S0401 / S0901 / S2301）', `(() => {
  ${HELPERS}
  const f = document.getElementById('srFormSel');
  f.value = '净菜'; f.dispatchEvent(new Event('change'));
  document.getElementById('srSearchBtn').click();
  const codes = rows().map(r => r.getAttribute('data-sr-row')).sort();
  const ok = JSON.stringify(codes) === JSON.stringify(['S0401', 'S0901', 'S2301']);
  document.getElementById('srResetFilter').click();
  return { codes, ok, fail: ok ? '' : '形态筛选不符' };
})()`);

await step('筛选绑定状态=未绑定 → 4 行（含无报价的 S2801：暂无任何关系记录）', `(() => {
  ${HELPERS}
  const b = document.getElementById('srBindSel');
  b.value = 'unbound'; b.dispatchEvent(new Event('change'));
  document.getElementById('srSearchBtn').click();
  const codes = rows().map(r => r.getAttribute('data-sr-row')).sort();
  const ok = JSON.stringify(codes) === JSON.stringify(['S0401', 'S1701', 'S1801', 'S2801']);
  document.getElementById('srResetFilter').click();
  return { codes, ok, fail: ok ? '' : '绑定状态筛选不符' };
})()`);

await step('关键词 + 供应商筛选可用，重置回 14 行', `(() => {
  ${HELPERS}
  const kw = document.getElementById('srKw');
  kw.value = '香菇'; document.getElementById('srSearchBtn').click();
  const byKw = rows().map(r => r.getAttribute('data-sr-row'));
  document.getElementById('srResetFilter').click();
  const supSel = document.getElementById('srSupSel');
  supSel.value = 'sup2'; supSel.dispatchEvent(new Event('change'));
  document.getElementById('srSearchBtn').click();
  const bySup = rows().map(r => r.getAttribute('data-sr-row')).sort();
  document.getElementById('srResetFilter').click();
  return { byKw, bySup, afterReset: rows().length,
    fail: (byKw.length !== 1 || byKw[0] !== 'S2801'
      || JSON.stringify(bySup) !== JSON.stringify(['S0901', 'S2301']) || rows().length !== 14) ? '关键词/供应商筛选不符' : '' };
})()`);

/* ==================== 2b. 商品分类三级弹层 ==================== */
await step('「商品分类」改成三级弹层：点开显示 4 个一级分类，选「蔬菜类」点查询 → 6 行', `(() => {
  ${HELPERS}
  const btn = document.getElementById('srCatBtn');
  const label0 = document.getElementById('srCatLabel').textContent.trim();
  btn.click();
  const pop = document.getElementById('srCatPop');
  const open = !pop.hidden;
  const cols = pop.querySelectorAll('.po-cat-col').length;
  const l1 = [...pop.querySelectorAll('[data-cat-depth="0"]')].map(b => b.querySelector('.po-cat-name').textContent.trim());
  const veg = [...pop.querySelectorAll('[data-cat-depth="0"]')].find(b => b.textContent.includes('蔬菜类'));
  veg.click();
  const label1 = document.getElementById('srCatLabel').textContent.trim();
  const cols2 = pop.hidden ? 0 : pop.querySelectorAll('.po-cat-col').length;
  document.getElementById('srSearchBtn').click();
  const codes = rows().map(r => r.getAttribute('data-sr-row')).sort();
  const ok = JSON.stringify(codes) === JSON.stringify(['S0301', 'S0701', 'S1701', 'S1801', 'S2101', 'S2801']);
  return { label0, open, cols, l1, label1, cols2, codes, ok,
    fail: (label0 !== '请选择商品分类' || !open || cols !== 1 || l1.length !== 4
      || label1 !== '蔬菜类' || cols2 !== 2 || !ok) ? '商品分类弹层不符' : '' };
})()`);

await step('分类再选二级「茄果类」→ 3 行（瓜果类 + 茄类）；点「全部分类」+ 重置恢复 14 行', `(() => {
  ${HELPERS}
  document.getElementById('srCatBtn').click();
  const pop = document.getElementById('srCatPop');
  const l2 = [...pop.querySelectorAll('[data-cat-depth="1"]')].find(b => b.textContent.includes('茄果类'));
  const hasL2 = !!l2;
  if (l2) l2.click();
  document.getElementById('srSearchBtn').click();
  const codes = rows().map(r => r.getAttribute('data-sr-row')).sort();
  const ok2 = JSON.stringify(codes) === JSON.stringify(['S0301', 'S1801', 'S2101']);
  document.getElementById('srCatBtn').click();
  const clear = document.querySelector('#srCatPop [data-cat-clear]');
  if (clear) clear.click();
  const labelAfterClear = document.getElementById('srCatLabel').textContent.trim();
  document.getElementById('srSearchBtn').click();
  const back = rows().length;
  document.getElementById('srResetFilter').click();
  return { hasL2, codes, ok2, labelAfterClear, back, afterReset: rows().length,
    fail: (!hasL2 || !ok2 || labelAfterClear !== '请选择商品分类' || back !== 14 || rows().length !== 14) ? '分类二级/清空不符' : '' };
})()`);

/* ==================== 3. 单个绑定（形态校验） ==================== */
await step('单个绑定 S1701（毛菜）：下拉只列能供毛菜的 4 家，不含净菜供应商「江南粮油」', `(() => {
  ${HELPERS}
  document.querySelector('[data-sr-bind="S1701"]').click();
  const d = document.querySelector('.mp-drawer');
  const names = [...d.querySelectorAll('[data-sr-pick]')].map(tr => tr.getAttribute('data-sr-pick'));
  const text = d.textContent;
  return { picks: names, hasJiangnan: /江南粮油/.test(text), hasLocal: /本地蔬菜合作社/.test(text),
    fail: (names.length !== 4 || /江南粮油/.test(text) || !/本地蔬菜合作社/.test(text)) ? '形态校验不符（净菜供应商不应出现）' : '' };
})()`);

await step('抽屉里选「本地蔬菜合作社」（最低价 55）→ 保存后回显来源=手工选择', `(() => {
  ${HELPERS}
  const d = document.querySelector('.mp-drawer');
  const row = d.querySelector('[data-sr-pick="sup5"]');
  row.click();
  d.querySelector('[data-sr-save]').click();
  const r = API.relationOf('S1701');
  const cell = cells(rowOf('S1701'));
  return { supplierId: r && r.supplierId, source: r && r.source, price: r && r.priceSnapshot,
    supplierCell: cell[7], stateCell: cell[10],
    fail: (!r || r.supplierId !== 'sup5' || r.priceSnapshot !== 55 || cell[10] !== '已绑定') ? '单个绑定不符' : '' };
})()`);

await step('无报价供应商的单选锁定：有报价的可选、无报价的 disabled 且点行不选中（S0101）', `(() => {
  ${HELPERS}
  document.querySelector('[data-sr-bind="S0101"]').click();
  const d0 = document.querySelector('.mp-drawer');
  const info = [...d0.querySelectorAll('[data-sr-pick]')].map(tr => {
    const rb = tr.querySelector('input[name="srPick"]');
    return { id: tr.getAttribute("data-sr-pick"), noQuote: /该供应商无此商品报价/.test(tr.textContent),
      disabled: !!rb && rb.disabled, picked: tr.classList.contains("is-picked") };
  });
  const noQuoteRows = info.filter(x => x.noQuote), quoteRows = info.filter(x => !x.noQuote);
  const lockOk = noQuoteRows.length > 0 && noQuoteRows.every(x => x.disabled);
  const openOk = quoteRows.length > 0 && quoteRows.every(x => !x.disabled);
  const before = info.filter(x => x.picked).map(x => x.id);
  document.querySelector('.mp-drawer [data-sr-pick="' + noQuoteRows[0].id + '"]').click();
  const afterClick = [...document.querySelectorAll(".mp-drawer [data-sr-pick].is-picked")].map(tr => tr.getAttribute("data-sr-pick"));
  document.querySelector('.mp-drawer [data-sr-pick="' + quoteRows[quoteRows.length - 1].id + '"]').click();
  const afterOk = [...document.querySelectorAll(".mp-drawer [data-sr-pick].is-picked")].map(tr => tr.getAttribute("data-sr-pick"));
  document.querySelector('.mp-drawer [data-sr-cancel]').click();
  return { info, lockOk, openOk, before, afterClick, afterOk,
    fail: (!lockOk || !openOk || String(before) !== String(afterClick)
      || String(afterOk) !== String(quoteRows[quoteRows.length - 1].id)) ? '无报价单选未锁定' : '' };
})()`);
await step('无报价商品 S2801：抽屉显示「该商品暂无供应商报价」且只有一个可选项，保存成功', `(() => {
  ${HELPERS}
  document.querySelector('[data-sr-bind="S2801"]').click();
  const d = document.querySelector('.mp-drawer');
  const picks = [...d.querySelectorAll('[data-sr-pick]')].map(tr => tr.getAttribute('data-sr-pick'));
  const banner = d.querySelector('.sr-noquote') ? d.querySelector('.sr-noquote').textContent.trim() : '';
  d.querySelector('[data-sr-save]').click();
  const r = API.relationOf('S2801');
  const cell = cells(rowOf('S2801'));
  return { picks, banner, noQuote: r && r.noQuote, supplierId: r && r.supplierId, stateCell: cell[10],
    fail: (picks.length !== 1 || picks[0] !== '__none__' || banner !== '该商品暂无供应商报价'
      || !r || !r.noQuote || r.supplierId !== '' || cell[10] !== '暂无报价') ? '无报价保存不符' : '' };
})()`);

/* ==================== 4. 一键最低价 ==================== */
await step('一键最低价（全部在售商品）：中筋面粉 S2301 由 sup2 切到更低的 sup6，S0301 保持最低的 sup5', `(() => {
  ${HELPERS}
  document.getElementById('srBatchLowest').click();
  document.getElementById('poConfirmOk').click();
  const s2301 = API.relationOf('S2301'), s0301 = API.relationOf('S0301');
  const statsAfter = stats();
  return { s2301: { sup: s2301.supplierId, price: s2301.priceSnapshot, src: s2301.source },
    s0301: { sup: s0301.supplierId, price: s0301.priceSnapshot },
    statsAfter,
    fail: (s2301.supplierId !== 'sup6' || s0301.supplierId !== 'sup5' || s2301.source !== 'lowest') ? '最低价选择不符' : '' };
})()`);

await step('平局规则①：S1101 与 sup1 / sup6 同为 96 → 优先「最近一次采购过」的 sup1', `(() => {
  ${HELPERS}
  const low = API.lowestOf(window.MerchantSupply.skus().find(s => s.code === 'S1101'));
  const last = API.lastPurchaseOf('S1101');
  const r = API.relationOf('S1101');
  return { tie: low.tie, picked: low.supId, lastSup: last && last.supplierId, relation: r.supplierId,
    fail: (low.tie.length !== 2 || low.supId !== 'sup1' || !last || last.supplierId !== 'sup1' || r.supplierId !== 'sup1') ? '平局①不符' : '' };
})()`);

await step('平局规则②：S0701 与 sup1 / sup6 同为 26 且无采购史 → 取供应商 ID 较小的 sup1', `(() => {
  ${HELPERS}
  const low = API.lowestOf(window.MerchantSupply.skus().find(s => s.code === 'S0701'));
  const last = API.lastPurchaseOf('S0701');
  const r = API.relationOf('S0701');
  return { tie: low.tie, picked: low.supId, last: last, relation: r.supplierId,
    fail: (low.tie.length !== 2 || low.supId !== 'sup1' || last !== null || r.supplierId !== 'sup1') ? '平局②不符' : '' };
})()`);

await step('一键最低价后：已绑定 13 + 暂无报价 1（S2801），未绑定清零', `(() => {
  ${HELPERS}
  const s = stats();
  const unboundRows = rows().filter(r => cells(r)[10] === '未绑定').length;
  const noQuoteRec = API.relationOf('S2801');
  const bar = document.querySelector('.sr-batch-bar');
  const rightAligned = getComputedStyle(bar).justifyContent === 'flex-end';
  const noScopeText = !bar.querySelector('.sr-batch-scope') && bar.textContent.indexOf('作用范围') < 0;
  return { stats: s, unboundRows, noQuote: !!(noQuoteRec && noQuoteRec.noQuote), rightAligned, noScopeText,
    fail: (s.length !== 4 || s[1].indexOf('13') < 0 || s[2].indexOf('0') < 0 || unboundRows !== 0
      || !(noQuoteRec && noQuoteRec.noQuote) || !rightAligned || !noScopeText) ? '统计/批量条不符' : '' };
})()`);

await step('一键最低价先弹二次确认：取消不生效，确认后覆盖全部在售商品', `(() => {
  ${HELPERS}
  API.setRelation('S0401', 'sup5', 'manual');        /* 先人工绑成非最低，便于观察覆盖 */
  document.getElementById('srBatchLowest').click();
  const mask = document.getElementById('poConfirmMask');
  const shown = !!mask && mask.classList.contains('show');
  const title = shown ? document.getElementById('poConfirmTitle').textContent.trim() : '';
  const text = shown ? document.getElementById('poConfirmText').textContent.trim() : '';
  document.getElementById('poConfirmCancel').click();
  const afterCancel = API.relationOf('S0401').supplierId;
  const closed = !document.getElementById('poConfirmMask').classList.contains('show');
  document.getElementById('srBatchLowest').click();
  document.getElementById('poConfirmOk').click();
  const afterOk = API.relationOf('S0401');
  const boundCount = window.MerchantSupply.skus().filter(s => {
    const r = API.relationOf(s.code);
    return !!(r && r.supplierId);
  }).length;
  return { shown, title, text, afterCancel, closed, s0401: { sup: afterOk.supplierId, src: afterOk.source }, boundCount,
    fail: (!shown || title !== '一键选择报价最低供应商' || text !== '是否一键选择最低报价供应商，如有商品已绑定供应商，将会做覆盖处理'
      || afterCancel !== 'sup5' || !closed || afterOk.supplierId !== 'sup2' || afterOk.source !== 'lowest'
      || boundCount !== 14) ? /* 13 个在售 + 已下架 S2201 的绑定仍保留 */ '二次确认 / 全部商品口径不符' : '' };
})()`);

/* ==================== 5. 按形态批量绑定 ==================== */
await step('按形态批量绑定：半成品 + 本地蔬菜合作社 → 2 个商品全部改绑，且给出覆盖提示', `(() => {
  ${HELPERS}
  document.getElementById('srBatchForm').click();
  const d = document.querySelector('.mp-drawer');
  const formSel = d.querySelector('#srFormPick');
  formSel.value = '半成品'; formSel.dispatchEvent(new Event('change'));
  const supSel = d.querySelector('#srSupPick');
  const supOpts = [...supSel.options].map(o => o.textContent.trim());
  supSel.value = 'sup5'; supSel.dispatchEvent(new Event('change'));
  const preview = d.querySelector('.sr-preview').textContent.replace(/\\s+/g, ' ').trim();
  d.querySelector('[data-sr-fb-ok]').click();
  const a = API.relationOf('S2601'), b = API.relationOf('S2701');
  return { supOpts, preview, s2601: { sup: a.supplierId, src: a.source }, s2701: b.supplierId,
    fail: (!supSel || a.supplierId !== 'sup5' || a.source !== 'form' || b.supplierId !== 'sup5'
      || !/将影响 2 个/.test(preview) || !/会被覆盖/.test(preview)) ? '按形态批量不符' : '' };
})()`);

await step('按形态批量的供应商候选按形态过滤：选「净菜」只剩能供净菜的 2 家', `(() => {
  ${HELPERS}
  document.getElementById('srBatchForm').click();
  const d = document.querySelector('.mp-drawer');
  const formSel = d.querySelector('#srFormPick');
  formSel.value = '净菜'; formSel.dispatchEvent(new Event('change'));
  const opts = [...d.querySelectorAll('#srSupPick option')].map(o => o.textContent.trim()).filter(t => t !== '请选择供应商');
  const names = opts.map(t => t.split('（')[0]);
  d.querySelector('[data-sr-fb-cancel]').click();
  return { names, fail: (names.length !== 2 || !names.includes('江南粮油调味品商行') || !names.includes('北郊副食批发部')) ? '形态候选不符' : '' };
})()`);

/* ==================== 6. 批量解绑与档口 ==================== */
await step('「一键清除供应商」先弹二次确认：取消不生效，确认后清空全部已绑定（已下架 S2201 的绑定保留）', `(() => {
  ${HELPERS}
  const before = window.MerchantSupply.relations().filter(r => r.supplierId).length;
  const btnText = document.getElementById('srBatchUnbind').textContent.trim();
  document.getElementById('srBatchUnbind').click();
  const mask = document.getElementById('poConfirmMask');
  const shown = !!mask && mask.classList.contains('show');
  const title = shown ? document.getElementById('poConfirmTitle').textContent.trim() : '';
  const text = shown ? document.getElementById('poConfirmText').textContent.trim() : '';
  document.getElementById('poConfirmCancel').click();
  const afterCancel = window.MerchantSupply.relations().filter(r => r.supplierId).length;
  document.getElementById('srBatchUnbind').click();
  document.getElementById('poConfirmOk').click();
  const left = window.MerchantSupply.relations().filter(r => r.supplierId).map(r => r.skuCode);
  const s = stats();
  return { btnText, shown, title, text, before, afterCancel, left, stats: s,
    fail: (btnText !== '一键清除供应商' || !shown || title !== '一键清除供应商'
      || text !== '是否一键清除所有已绑定的供应商' || afterCancel !== before
      || JSON.stringify(left) !== JSON.stringify(['S2201']) || s[1].indexOf('0') < 0
      || s[2].indexOf('13') < 0 || !(API.relationOf('S2801') && API.relationOf('S2801').noQuote)) ? '一键清除不符' : '' };
})()`);

await step('解绑后关系表仍保留「暂无报价」记录（保存过的无报价态不被解绑清掉）', `(() => {
  ${HELPERS}
  const r = API.relationOf('S2801');
  return { exists: !!r, noQuote: r && r.noQuote,
    fail: (!r || !r.noQuote) ? '无报价记录被误删' : '' };
})()`);

await step('供货关系按档口隔离：关系记录的 stallId 全部等于当前下单方', `(() => {
  ${HELPERS}
  const page = document.getElementById('srPage') || document.querySelector('#purchaseOrderPage');
  const stallSel = document.querySelector('[data-mos-stall]');
  const cur = (stallSel && stallSel.value) || (window.MerchantScope ? (window.MerchantScope.current() || {}).stallId : '');
  const rels = window.MerchantSupply.relations();
  const bad = rels.filter(r => r.stallId !== cur).length;
  const opts = stallSel ? [...stallSel.options].map(o => o.textContent.trim()) : [];
  const noOverview = !opts.some(x => x.indexOf('全部档口') >= 0);
  return { stall: cur, stallOpts: opts, noOverview, records: rels.length, badStall: bad,
    fail: (bad !== 0 || !opts.length || !noOverview) ? '档口隔离不符' : '' };
})()`);

await step('收尾：供货关系 API 就绪（enter / relations / skus / reset）', `(() => {
  const api = window.MerchantSupply;
  const keys = Object.keys(api);
  return { keys,
    fail: (typeof api.enter !== 'function' || typeof api.relations !== 'function'
      || typeof api.skus !== 'function' || typeof api.reset !== 'function') ? 'API 缺失' : '' };
})()`);

/* ---------- 汇总 ---------- */
console.log('\n--- 页面错误 ---');
console.log(errors.length ? errors.join('\n') : '无');
const failed = results.filter(r => !r.ok);
console.log(`\n结果：${results.length - failed.length}/${results.length} 通过`);
if (failed.length) { console.log('失败步骤：'); failed.forEach(f => console.log(' - ' + f.name + ' → ' + JSON.stringify(f.value || f.error))); }
if (errors.length || failed.length) process.exitCode = 1;
ws.close();
