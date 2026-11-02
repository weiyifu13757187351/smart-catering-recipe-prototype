/**
 * 采购订单原型 V4（两层框架：订单列表 → 订单详情/商品明细）冒烟脚本（CDP，无第三方依赖）
 * 前置：本地静态服务跑在 4201，Chrome 以 --remote-debugging-port=9333 启动。
 * 用法：PO_PORT=4201 node tools/po-smoke-v2.mjs
 *
 * 种子数据（seed，全部挂在当前档口）：
 *   PO…A 采购计划·上海鲜配 今天-1 待验收（3 行，已发货）
 *   PO…B 采购计划·上海鲜配 今天   已确认（2 行）
 *   PO…C 采购计划·上海鲜配 今天+1 待确认（2 行）
 *   PO…D 直采下单·本地蔬菜合作社 今天 验收中（3 行，已验收 2 行）
 *   PO…E 直采下单·江南粮油 今天-2 已完成（含电子签名）
 */
const CDP = 'http://127.0.0.1:9333';
const PORT = process.env.PO_PORT || '4201';   /* 源目录预览端口 */
const BASE = process.env.PO_BASE || ('http://127.0.0.1:' + PORT + '/');
const APP = BASE + encodeURIComponent('食联网数智餐饮平台-组织及人员.html');

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function connect() {
  for (let i = 0; i < 40; i++) {
    try {
      const list = await (await fetch(`${CDP}/json/list`)).json();
      const page = list.find(t => t.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch { /* 还没起来 */ }
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
  const msg = JSON.parse(ev.data);
  if (msg.id && waiters.has(msg.id)) { waiters.get(msg.id)(msg); waiters.delete(msg.id); }
  if (msg.method === 'Runtime.exceptionThrown') {
    errors.push('EXCEPTION ' + (msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text));
  }
  if (msg.method === 'Runtime.consoleAPICalled' && ['error'].includes(msg.params.type)) {
    errors.push('ERROR ' + msg.params.args.map(a => a.value ?? a.description ?? '').join(' '));
  }
};
const send = (method, params = {}) => new Promise(res => {
  const id = ++seq;
  waiters.set(id, res);
  ws.send(JSON.stringify({ id, method, params }));
});

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

const dayStr = offset => {
  const d = new Date(); d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/* 列表页工具（注入一次，后续步骤复用） */
const LIST_HELPERS = `
  const P = () => document.getElementById('purchaseOrderPage');
  const rows = () => [...P().querySelectorAll('.po-order-table tbody tr')];
  const cells = tr => [...tr.children].map(td => td.textContent.replace(/\\s+/g, ' ').trim());
  const rowBy = txt => rows().find(r => r.textContent.includes(txt));
  const openBy = txt => { const r = rowBy(txt); if (!r) return false; r.querySelector('[data-order-open]').click(); return true; };
  const detail = () => document.getElementById('poLinesBody');
`;

/* ==================== 1. 导航与第 1 层 ==================== */
await step('导航：采购管理 › 采购订单 直接进订单列表（无页内 tab）', `(() => {
  document.getElementById('poOrderNav').click();
  ${LIST_HELPERS}
  const nav = document.getElementById('poOrderNav');
  return {
    pageShown: !P().hidden,
    title: P().querySelector('h2').textContent.trim(),
    crumbs: document.querySelector('.breadcrumb, .crumb, .mp-breadcrumb')?.textContent.trim() || '',
    hasModTabs: !!P().querySelector('.po-mod-tabs'),
    hasInquiryPage: !!document.getElementById('purchaseInquiryPage'),
    hasGroupPage: !!document.getElementById('purchaseGroupPage'),
    fail: (!nav || P().hidden || P().querySelector('h2').textContent.trim() !== '采购订单'
      || !!P().querySelector('.po-mod-tabs') || !!document.getElementById('purchaseInquiryPage')) ? '层1 结构不符' : ''
  };
})()`);

await step('L1 表格 11 列（含供应商/来源，无采购单编号）+ 5 张订单按送达日期升序', `(() => {
  ${LIST_HELPERS}
  const th = [...P().querySelectorAll('.po-order-table thead th')].map(x => x.textContent.trim());
  const want = ['订单编号','供应商','来源','送达日期','品项','订单总金额','验收总金额','订单状态','是否有售后','创建时间','操作'];
  const dates = rows().map(r => cells(r)[3]);
  const nums = rows().map(r => cells(r)[0]);
  const created = rows().map(r => cells(r)[9]);
  const sups = rows().map(r => cells(r)[1]);
  /* V4.9：创建时间倒序；同一创建时间（同一批提交）内相同供应商必须相邻 */
  let createdDesc = true;
  for (let i = 1; i < created.length; i++) if (created[i] > created[i - 1]) createdDesc = false;
  let sameBatchGrouped = true;
  for (let i = 1; i < sups.length; i++) {
    if (sups[i] !== sups[i - 1] && created[i] === created[i - 1]) {
      /* 同批次里同一供应商若再次出现，说明没聚拢 */
      for (let j = 0; j < i; j++) if (sups[j] === sups[i] && created[j] === created[i]) sameBatchGrouped = false;
    }
  }
  return { th, rowCount: rows().length, dates, nums, created, sups, createdDesc, sameBatchGrouped,
    fail: (JSON.stringify(th) !== JSON.stringify(want) || rows().length !== 5 || th.includes('采购单编号')
      || !createdDesc || !sameBatchGrouped) ? '列/行数/排序不符' : '' };
})()`);

await step('L1 统计卡 5 张（订单口径：总数 / 验收总金额 / 本月数 / 本月验收金额 / 待我验收完成）', `(() => {
  ${LIST_HELPERS}
  const stats = [...P().querySelectorAll('.po-stat')].map(x => x.textContent.replace(/\\s+/g, ' ').trim());
  const titles = [...P().querySelectorAll('.po-stat-t')].map(x => x.textContent.trim());
  const want = ['订单总数','订单验收总金额','本月订单数','本月订单验收总金额','待我验收完成订单数'];
  const orders = window.MerchantOrder.orders();
  const acceptedTotal = orders.reduce((s, o) => s + window.MerchantOrder.__debug.orderAcceptedAmount(o), 0);
  return { stats, titles, acceptedTotal,
    fail: (JSON.stringify(titles) !== JSON.stringify(want) || stats[0].indexOf(String(orders.length)) < 0) ? '统计卡不符' : '' };
})()`);

await step('L1 筛选：送达日期默认「今天前后 15 天」+ 无日期页签 + 来源只剩直采下单/采购计划', `(() => {
  ${LIST_HELPERS}
  const from = P().querySelector('#poFrom').value, to = P().querySelector('#poTo').value;
  const srcOpts = [...P().querySelectorAll('#poSrcSel option')].map(o => o.textContent.trim());
  const dayTabs = !!P().querySelector('.po-daytabs, .po-tabs');
  return { from, to, srcOpts, dayTabs,
    fail: (from !== ${JSON.stringify(dayStr(-15))} || to !== ${JSON.stringify(dayStr(15))} || dayTabs
      || srcOpts.join(',') !== '全部来源,直采下单,采购计划') ? '筛选不符' : '' };
})()`);

await step('L1 订单状态平铺页签（6 个带张数）+ 售后页签 3 个（全部售后/有/无）', `(() => {
  ${LIST_HELPERS}
  const st = [...P().querySelectorAll('[data-status-tab]')].map(x => x.textContent.replace(/\\s+/g, ' ').trim());
  const as = [...P().querySelectorAll('[data-assale-tab]')].map(x => x.textContent.replace(/\\s+/g, ' ').trim());
  const stKeys = [...P().querySelectorAll('[data-status-tab]')].map(x => x.getAttribute('data-status-tab'));
  return { st, as, stKeys,
    fail: (stKeys.join(',') !== 'all,wait,confirmed,toReceive,accepted,done' || as.length !== 3
      || as[0].indexOf('全部售后') !== 0) ? '页签不符' : '' };
})()`);

await step('L1 状态页签筛选：点「已完成」只剩 1 行，点回「全部状态」恢复 5 行', `(() => {
  ${LIST_HELPERS}
  P().querySelector('[data-status-tab="done"]').click();
  const doneRows = rows().length;
  const allDone = rows().every(r => r.textContent.includes('已完成'));
  P().querySelector('[data-status-tab="all"]').click();
  return { doneRows, allDone, backAll: rows().length,
    fail: (doneRows !== 1 || !allDone || rows().length !== 5) ? '状态页签筛选不符' : '' };
})()`);

await step('L1 售后页签筛选：无售后 5 行 / 有售后 0 行', `(() => {
  ${LIST_HELPERS}
  P().querySelector('[data-assale-tab="none"]').click();
  const none = rows().length;
  P().querySelector('[data-assale-tab="has"]').click();
  const has = rows().length;
  const emptyHint = !!P().querySelector('.po-empty');
  P().querySelector('[data-assale-tab="all"]').click();
  return { none, has, emptyHint,
    fail: (none !== 5 || has !== 0 || !emptyHint) ? '售后页签筛选不符' : '' };
})()`);

await step('L1 来源筛选：采购计划 3 行 / 直采下单 2 行', `(() => {
  ${LIST_HELPERS}
  const sel = P().querySelector('#poSrcSel');
  sel.value = 'plan'; sel.dispatchEvent(new Event('change'));
  const plan = rows().length;
  const planOnly = rows().every(r => r.textContent.includes('采购计划'));
  sel.value = 'direct'; sel.dispatchEvent(new Event('change'));
  const direct = rows().length;
  const directOnly = rows().every(r => r.textContent.includes('直采下单'));
  sel.value = 'all'; sel.dispatchEvent(new Event('change'));
  return { plan, planOnly, direct, directOnly,
    fail: (plan !== 3 || !planOnly || direct !== 2 || !directOnly) ? '来源筛选不符' : '' };
})()`);

await step('L1 供应商筛选 + 订单编号查询（点「查询」才生效）+ 重置回默认', `(() => {
  ${LIST_HELPERS}
  const supSel = P().querySelector('#poSupSel');
  const supOpts = [...supSel.options].map(o => o.textContent.trim());
  const target = [...supSel.options].find(o => o.textContent.includes('本地蔬菜'));
  supSel.value = target.value; supSel.dispatchEvent(new Event('change'));
  const bySup = rows().length;
  supSel.value = 'all'; supSel.dispatchEvent(new Event('change'));
  const kw = () => P().querySelector('#poKw');       /* 每次重画后输入框是新的，必须重新取 */
  kw().value = 'PO';                                  /* 只输不点查询 → 不生效 */
  const beforeSearch = rows().length;
  P().querySelector('#poSearchBtn').click();
  const afterSearch = rows().length;
  kw().value = 'ZZZZ';                               /* 点查询后查不到 */
  P().querySelector('#poSearchBtn').click();
  const noHit = rows().length;
  P().querySelector('#poResetFilter').click();
  return { supOpts, bySup, beforeSearch, afterSearch, noHit, afterReset: rows().length,
    kwAfterReset: kw().value,
    fail: (bySup !== 1 || beforeSearch !== 5 || afterSearch !== 5 || noHit !== 0
      || rows().length !== 5 || P().querySelector('#poKw').value !== '') ? '供应商/编号筛选不符' : '' };
})()`);

await step('L1 无询价残留：列表无询价字样、无询价数量入口、debug API 无 inquiries', `(() => {
  ${LIST_HELPERS}
  const text = P().textContent;
  const api = window.MerchantOrder;
  return { hasInqWord: /询价/.test(text), apiKeys: Object.keys(api),
    hasInqApi: typeof api.inquiries === 'function' || typeof api.enterInquiries === 'function',
    fail: (/询价/.test(text) || typeof api.inquiries === 'function' || typeof api.enterInquiries === 'function') ? '仍有询价残留' : '' };
})()`);

/* ==================== 2. 第 2 层：订单详情 ==================== */
await step('L2 打开订单详情：头部含编号/来源/状态 + 供应商·送达·金额·验收金额·已验收', `(() => {
  ${LIST_HELPERS}
  if (!openBy('上海鲜配')) return { fail: '列表里没找到上海鲜配订单' };
  const p = P();
  const h2 = p.querySelector('.po-order-head h2').textContent.replace(/\\s+/g, ' ').trim();
  const sub = p.querySelector('.po-order-head .po-sub').textContent.replace(/\\s+/g, ' ').trim();
  window.__TARGET_NO = h2.split(/\\s+/)[0];    /* 后续验收步骤都用这张订单 */
  return { h2, sub, hasBack: !!p.querySelector('#poBackList'),
    fail: (!/^PO\\d{11}/.test(h2) || !/供应商：/.test(sub) || !/送达日期：/.test(sub) || !/已验收：/.test(sub)) ? '详情头部不符' : '' };
})()`);

await step('L2 无「订单信息」卡片 → 头部「更多信息」默认收起，点开 7 项、再点收起', `(() => {
  const p = document.getElementById('purchaseOrderPage');
  const btn = p.querySelector('#poMoreToggle');
  const card = p.querySelector('#poMoreCard');
  const closedLabel = btn.textContent.trim();
  const hiddenAtFirst = card.hasAttribute('hidden');
  btn.click();
  const card2 = p.querySelector('#poMoreCard');
  const labels = [...card2.querySelectorAll('label')].map(x => x.textContent.trim());
  const openLabel = p.querySelector('#poMoreToggle').textContent.trim();
  const openedText = card2.textContent;
  p.querySelector('#poMoreToggle').click();
  const hiddenAgain = p.querySelector('#poMoreCard').hasAttribute('hidden');
  return { closedLabel, hiddenAtFirst, labels, openLabel, hiddenAgain,
    hasShip: /发货联系人/.test(openedText), hasAddr: /收货地址/.test(openedText),
    fail: (closedLabel !== '更多信息' || !hiddenAtFirst || labels.length !== 7 || !hiddenAgain
      || !/发货联系人/.test(openedText) || !/收货地址/.test(openedText)) ? '更多信息不符' : '' };
})()`);

await step('L2 商品明细 11 列 + 行状态 + 发货量/验收量回显（在页面里而不是抽屉）', `(() => {
  ${LIST_HELPERS}
  const box = detail();
  const th = [...box.querySelectorAll('.po-lines-table thead th')].map(x => x.textContent.trim());
  const trs = [...box.querySelectorAll('.po-lines-table tbody tr')];
  const first = trs[0] ? cells(trs[0]) : [];
  const inDrawer = !!document.querySelector('.mp-drawer');
  return { th, rows: trs.length, first, inDrawer,
    fail: (th.length !== 11 || !th.includes('实际验收量') || inDrawer || trs.length !== 3) ? '商品明细不符' : '' };
})()`);

await step('L2 发货记录 3 列 + 售后记录卡 + 状态时间轴 + 供应商模拟区', `(() => {
  const box = document.getElementById('poLinesBody');
  const heads = [...box.querySelectorAll('.po-section h3')].map(x => x.textContent.replace(/\\s+/g, ' ').trim());
  const shipTh = [...box.querySelectorAll('.po-section')].find(s => s.textContent.includes('发货记录'))
    .querySelectorAll('thead th');
  const simBtns = [...box.querySelectorAll('[data-sim]')].map(b => b.textContent.trim());
  return { heads, shipTh: [...shipTh].map(x => x.textContent.trim()), simBtns,
    hasTimeline: !!box.querySelector('.po-timeline'),
    fail: (!heads.some(h => h.startsWith('商品明细')) || !heads.some(h => h.startsWith('发货记录'))
      || !heads.some(h => h.startsWith('售后记录')) || !heads.some(h => h.startsWith('状态时间轴'))
      || !box.querySelector('.po-timeline')) ? '详情分区不符' : '' };
})()`);

/* ==================== 3. 行级验收 ==================== */
await step('验收弹层：批次累加口径（无差异原因、主按钮为「保存」、历史空态、已验收量/待验收量）', `(() => {
  const box = document.getElementById('poLinesBody');
  box.querySelector('[data-line-accept="S0301"]').click();
  const d = document.querySelector('.mp-drawer');
  const info = d.querySelector('.po-accept-info');
  const res = {
    infoHead: info ? [...info.querySelectorAll('th')].map(x => x.textContent.trim()) : [],
    hasReasonSelect: !!d.querySelector('#poDiffReason'),
    submitLabel: d.querySelector('[data-ac-save]').textContent.trim(),
    qtyValue: document.getElementById('poAcceptQty').value,
    sumText: document.getElementById('poAcceptSum').textContent.replace(/\\s+/g, ' ').trim(),
    histEmpty: /本次为第 1 批/.test(d.textContent),
    hintBatch: /累加/.test(d.textContent)
  };
  /* 「取消」必须真的关掉抽屉（V4.6 修复） */
  d.querySelector('[data-ac-cancel]').click();
  res.cancelCloses = !document.getElementById('mpMask').classList.contains('show');
  document.querySelector('#poLinesBody [data-line-accept="S0301"]').click();   /* 重新打开给后续步骤 */
  res.reopened = !!document.getElementById('poAcceptQty');
  res.fail = (!info || res.hasReasonSelect || res.submitLabel !== '保存'
    || res.qtyValue !== '' || !res.histEmpty || !res.hintBatch
    || res.infoHead.indexOf('已验收量') < 0 || res.infoHead.indexOf('待验收量') < 0
    || res.sumText.indexOf('待验收 6') < 0 || !res.cancelCloses || !res.reopened) ? '验收弹层口径不符' : '';
  return res;
})()`);

await step('点「保存」累加：先验 2 箱 → 累计 2；再验 3 箱 → 累计 5（覆盖改累加）', `(() => {
  const save = v => {
    const q = document.getElementById('poAcceptQty');
    q.value = String(v); q.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('[data-ac-save]').click();
  };
  save(2);
  const o = window.MerchantOrder.__debug.findOrder(window.__TARGET_NO);
  const it1 = o.items.find(i => i.skuCode === 'S0301');
  const b1 = o.accepts.filter(a => a.itemSku === 'S0301');
  const first = { accepted: it1.acceptedQty, seq: it1.acceptSeq, qty: b1[b1.length - 1].qty, batches: b1.length };
  document.querySelector('#poLinesBody [data-line-accept="S0301"]').click();
  const shownAccepted = document.getElementById('poCurAccept').textContent.trim();
  const histRows = document.querySelectorAll('#poAccHist [data-acc-row]').length;
  document.getElementById('poAcceptQty').value = '3';
  document.getElementById('poAcceptQty').dispatchEvent(new Event('input', { bubbles: true }));
  const sumText = document.getElementById('poAcceptSum').textContent.replace(/\\s+/g, ' ').trim();
  save(3);
  const it2 = o.items.find(i => i.skuCode === 'S0301');
  const b2 = o.accepts.filter(a => a.itemSku === 'S0301');
  const second = { accepted: it2.acceptedQty, seq: it2.acceptSeq, qty: b2[b2.length - 1].qty, batches: b2.length };
  return { first, shownAccepted, histRows, sumText, second,
    fail: (first.accepted !== 2 || first.seq !== 1 || first.qty !== 2 || first.batches !== 1
      || shownAccepted !== '2' || histRows !== 1
      || second.accepted !== 5 || second.seq !== 2 || second.qty !== 3 || second.batches !== 2
      || sumText.indexOf('累计 5') < 0) ? '累加口径不符' : '' };
})()`);

await step('累计实时回显：少于发货量提示短缺、超出提示超发（均不拦截）', `(() => {
  document.querySelector('#poLinesBody [data-line-accept="S0301"]').click();
  const q = document.getElementById('poAcceptQty');
  const read = v => {
    q.value = String(v); q.dispatchEvent(new Event('input', { bubbles: true }));
    const el = document.getElementById('poAcceptSum');
    return { text: el.textContent.replace(/\\s+/g, ' ').trim(), cls: el.className };
  };
  const eq = read(1);      /* 5 + 1 = 6 = 发货量 */
  const over = read(3);    /* 5 + 3 = 8 > 6 */
  const short = read(0.5); /* 5 + 0.5 = 5.5 < 6 */
  document.querySelector('[data-ac-cancel]').click();
  return { eq, over, short,
    fail: (eq.text.indexOf('与实际发货量一致') < 0 || eq.cls.indexOf('is-eq') < 0
      || over.text.indexOf('超出实际发货量 2') < 0 || over.cls.indexOf('is-over') < 0
      || short.text.indexOf('少于实际发货量 0.5') < 0 || short.cls.indexOf('is-short') < 0) ? '累计提示不符' : '' };
})()`);

await step('验收弹层历史验收只读（无修改/删除列）→ 改量挪到「验收详情 · 验收批次记录」：第 1 批 2 箱改 3 箱 → 累计 6', `(() => {
  /* ① 验收弹层的历史验收：只有 批次/时间/验收人/本次验收量/照片，没有任何操作按钮 */
  document.querySelector('#poLinesBody [data-line-accept="S0301"]').click();
  const ths = [...document.querySelectorAll('.po-hist-table thead th')].map(x => x.textContent.trim());
  const readOnly = !document.querySelector('#poAccHist [data-acc-edit]')
    && !document.querySelector('#poAccHist [data-acc-del]')
    && document.querySelectorAll('.po-hist-table thead th').length === 5;
  const histRowsAcc = document.querySelectorAll('#poAccHist [data-acc-row]').length;
  document.querySelector('.mp-drawer [data-ac-cancel]').click();
  /* ② 验收详情里改量 */
  document.querySelector('#poLinesBody [data-line-detail="S0301"]').click();
  const dTh = [...document.querySelectorAll('.mp-drawer table.po-table thead th')].map(x => x.textContent.trim());
  document.querySelector('.mp-drawer [data-dacc-edit="1"]').click();
  const inp = document.getElementById('poDetailEditQty');
  const beforeVal = inp ? inp.value : null;
  inp.value = '3';
  document.querySelector('[data-dacc-edit-ok]').click();
  const o = window.MerchantOrder.__debug.findOrder(window.__TARGET_NO);
  const it = o.items.find(i => i.skuCode === 'S0301');
  const b = o.accepts.filter(a => a.itemSku === 'S0301');
  const detailRows = document.querySelectorAll('.mp-drawer [data-dacc-row]').length;
  const acceptedText = document.querySelector('.mp-drawer').textContent;
  document.querySelector('.mp-drawer [data-ld-close]').click();
  return { ths, readOnly, histRowsAcc, dThasOps: dTh.indexOf('操作') >= 0, beforeVal,
    accepted: it.acceptedQty, seq: it.acceptSeq, qty1: b[0].qty, qty2: b[1].qty, batches: b.length,
    detailRows, reopenDetail: /验收详情/.test(acceptedText),
    fail: (ths.join(',') !== '批次,时间,验收人,本次验收量,照片' || !readOnly || histRowsAcc !== 2
      || dTh.indexOf('操作') < 0 || beforeVal !== '2' || it.acceptedQty !== 6 || b.length !== 2
      || b[0].qty !== 3 || detailRows !== 2) ? '批次修改/只读口径不符' : '' };
})()`);

await step('验收详情的批次删除：只有最新一批可删、取消不生效、删后累计回退；验收弹层里没有删除入口', `(() => {
  const rows = () => [...document.querySelectorAll('.mp-drawer [data-dacc-row]')];
  const acc = () => window.MerchantOrder.__debug.findOrder(window.__TARGET_NO).items.find(i => i.skuCode === 'S0301').acceptedQty;
  document.querySelector('#poLinesBody [data-line-detail="S0301"]').click();
  const seqs = rows().map(tr => tr.getAttribute('data-dacc-row'));
  const ops = rows().map(tr => ({ seq: tr.getAttribute('data-dacc-row'),
    hasEdit: !!tr.querySelector('[data-dacc-edit]'),
    delEnabled: !!tr.querySelector('[data-dacc-del]'),
    delLocked: !!tr.querySelector('button[disabled]') }));
  const acc0 = acc();
  /* 取消：什么都不改 */
  document.querySelector('.mp-drawer [data-dacc-del]').click();
  const maskOn = document.getElementById('poConfirmMask').classList.contains('show');
  const askText = (document.querySelector('.po-confirm-x') || { textContent: '' }).textContent.replace(/\\s+/g, ' ').trim();
  document.getElementById('poConfirmCancel').click();
  const afterCancel = { rows: rows().length, acc: acc() };
  /* 确认删除最新一批（第 2 批） */
  document.querySelector('.mp-drawer [data-dacc-del]').click();
  document.getElementById('poConfirmOk').click();
  const o = window.MerchantOrder.__debug.findOrder(window.__TARGET_NO);
  const it = o.items.find(i => i.skuCode === 'S0301');
  const recs = o.accepts.filter(a => a.itemSku === 'S0301');
  const toastTxt = (document.getElementById('toast') || { textContent: '' }).textContent || '';
  const afterDel = { rows: rows().length, seqs: rows().map(tr => tr.getAttribute('data-dacc-row')),
    acc: it.acceptedQty, acceptSeq: it.acceptSeq, recs: recs.length, toast: toastTxt,
    latestDelEnabled: !!document.querySelector('.mp-drawer [data-dacc-row="1"] [data-dacc-del]') };
  document.querySelector('.mp-drawer [data-ld-close]').click();
  /* 恢复现场：再验 3 箱回到 2 批 / 累计 6，并把验收弹层重新打开（后续步骤按原路径走） */
  document.querySelector('#poLinesBody [data-line-accept="S0301"]').click();
  const q2 = document.getElementById('poAcceptQty');
  q2.value = '3'; q2.dispatchEvent(new Event('input', { bubbles: true }));
  document.querySelector('[data-ac-save]').click();
  document.querySelector('#poLinesBody [data-line-accept="S0301"]').click();
  const restored = { rows: document.querySelectorAll('#poAccHist [data-acc-row]').length,
    acc: document.getElementById('poCurAccept').textContent.trim(),
    noDelInAccept: !document.querySelector('#poAccHist [data-acc-del]') };
  const newestSeq = Math.max(...ops.map(x => Number(x.seq)));
  const newestOp = ops.find(x => Number(x.seq) === newestSeq) || {};
  const lockOk = ops.filter(x => Number(x.seq) !== newestSeq)
    .every(x => x.delLocked && !x.delEnabled && x.hasEdit);
  return { seqs, ops, acc0, maskOn, askText, afterCancel, afterDel, restored,
    fail: (!lockOk || !newestOp.delEnabled || !maskOn || askText.indexOf('不能恢复') === -1
      || afterCancel.rows !== 2 || afterCancel.acc !== 6
      || afterDel.rows !== 1 || afterDel.acc !== 3 || afterDel.recs !== 1
      || !afterDel.latestDelEnabled || afterDel.toast.indexOf('已删除第') === -1
      || restored.rows !== 2 || restored.acc !== '6' || !restored.noDelInAccept) ? '批次删除口径不符' : '' };
})()`);

await step('验收照片：非必填（无必填标）、最多 5 张、可删；本次验收量仍必填', `(() => {
  document.querySelector('[data-ac-cancel]').click();
  document.querySelector('#poLinesBody [data-line-accept="S0301"]').click();
  const d = document.querySelector('.mp-drawer');
  const lb = [...d.querySelectorAll('label')].find(l => l.textContent.indexOf('验收照片') === 0);
  const hasStar = !!(lb && lb.querySelector('em'));
  const hint = lb ? lb.querySelector('.po-sub').textContent.trim() : '';
  /* 本次验收量不填 → 拦截 */
  document.querySelector('[data-ac-save]').click();
  const blockedNoQty = document.getElementById('mpMask').classList.contains('show');
  const q = document.getElementById('poAcceptQty');
  q.value = '0'; q.dispatchEvent(new Event('input', { bubbles: true }));
  document.querySelector('[data-ac-save]').click();
  const blockedZero = document.getElementById('mpMask').classList.contains('show');
  /* 加满 5 张 → 上限；删 3 张 → 2 张，保存（本次 1 箱，累计 7） */
  const add = document.getElementById('poAddPhoto');
  add.click(); add.click(); add.click(); add.click(); add.click(); add.click();
  const capped = add.disabled && add.textContent.indexOf('已达上限') >= 0;
  const full = document.querySelectorAll('#poAcceptPhotos .po-photo').length;
  document.querySelector('[data-del-photo="0"]').click();
  document.querySelector('[data-del-photo="0"]').click();
  document.querySelector('[data-del-photo="0"]').click();
  const afterDel = document.querySelectorAll('#poAcceptPhotos .po-photo').length;
  q.value = '1'; q.dispatchEvent(new Event('input', { bubbles: true }));
  document.querySelector('[data-ac-save]').click();
  const o = window.MerchantOrder.__debug.findOrder(window.__TARGET_NO);
  const it = o.items.find(i => i.skuCode === 'S0301');
  const rec = o.accepts.filter(a => a.itemSku === 'S0301').slice(-1)[0];
  return { hasStar, hint, blockedNoQty, blockedZero, capped, full, afterDel,
    accepted: it.acceptedQty, seq: it.acceptSeq, photos: rec.photos,
    fail: (hasStar || hint.indexOf('非必填') < 0 || !blockedNoQty || !blockedZero || !capped
      || full !== 5 || afterDel !== 2 || it.acceptedQty !== 7 || rec.photos !== 2) ? '验收照片/必填不符' : '' };
})()`);

await step('验收详情：批次记录（本批验收量 + 累计）+ 差异原因区 + 照片/资质/签字', `(() => {
  document.querySelector('#poLinesBody [data-line-detail="S0301"]').click();
  const d = document.querySelector('.mp-drawer');
  const t = d.textContent;
  const ths = [...d.querySelectorAll('table.po-table th')].map(x => x.textContent.trim());
  const res = {
    hasBatch: t.indexOf('验收批次记录') >= 0,
    hasBatchQtyCol: ths.indexOf('本批验收量') >= 0 && ths.indexOf('累计') >= 0,
    hasDiffSection: t.indexOf('差异原因') >= 0,
    diffNoGap: t.indexOf('无差异（累计验收量不少于实际发货量）') >= 0,
    hasAcceptPhotos: t.indexOf('验收照片') >= 0, hasCert: t.indexOf('商品资质照片') >= 0,
    hasSign: t.indexOf('验收人员签字照片') >= 0
  };
  d.querySelector('[data-ld-close]').click();
  res.closeWorks = !document.getElementById('mpMask').classList.contains('show');
  document.querySelector('#poLinesBody [data-line-detail="S2101"]').click();
  const d2 = document.querySelector('.mp-drawer');
  const exp = d2.querySelector('.po-cert.is-expired');
  res.expiredLabel = exp ? exp.textContent.indexOf('已过期') >= 0 : false;
  res.pendingDiffHint = d2.textContent.indexOf('差异原因将在「验收完成」时填写') >= 0;
  d2.querySelector('[data-ld-close]').click();
  res.fail = (!res.hasBatch || !res.hasBatchQtyCol || !res.hasDiffSection || !res.diffNoGap
    || !res.hasAcceptPhotos || !res.hasCert || !res.hasSign || !res.expiredLabel
    || !res.closeWorks) ? '验收详情不符' : '';
  return res;
})()`);

await step('已确认（未发货）订单不允许验收', `(() => {
  document.getElementById('poBackList').click();
  const rows = [...document.querySelectorAll('#purchaseOrderPage .po-order-table tbody tr')];
  rows.find(r => r.textContent.includes('已确认')).querySelector('[data-order-open]').click();
  const box = document.getElementById('poLinesBody');
  const acceptBtns = box.querySelectorAll('[data-line-accept]').length;
  const rowText = box.querySelector('.po-lines-table tbody tr').textContent;
  return { acceptBtns, rowText: rowText.replace(/\\s+/g, ' ').trim(),
    fail: (acceptBtns !== 0) ? '已确认订单不应有验收入口' : '' };
})()`);

/* ==================== 4. 验收完成：差异原因确认 + 电子签名 ==================== */
await step('回到被验收的订单：未验完时「验收完成」按钮不可用 + 提示「全部商品验收后方可点击“验收完成”」', `(() => {
  window.MerchantOrder.__debug.showOrder(window.MerchantOrder.__debug.findOrder(window.__TARGET_NO));
  const fin = document.getElementById('poFinishBtn');
  const head = document.querySelector('.po-accept-head .po-sub');
  const headText = head ? head.textContent.replace(/\\s+/g, ' ').trim() : '';
  return { hasBtn: !!fin, disabled: fin ? fin.disabled : null, headText,
    fail: (!fin || !fin.disabled || headText.indexOf('全部商品验收后方可点击“验收完成”') < 0
      || headText.indexOf('后才能收口') >= 0) ? '未验完不应可点验收完成 / 提示文案不符' : '' };
})()`);

await step('补完剩余 2 行（S2101 只验 3/5）→ 「验收完成」先出差异原因确认，逐个必填（含「其他」）', `(() => {
  const accept = (code, qty) => {
    document.querySelector('#poLinesBody [data-line-accept="' + code + '"]').click();
    const q = document.getElementById('poAcceptQty');
    q.value = String(qty); q.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('[data-ac-save]').click();
  };
  accept('S0101', 12); accept('S2101', 3);
  const fin = document.getElementById('poFinishBtn');
  const enabled = fin && !fin.disabled;
  fin.click();
  const d = document.querySelector('.mp-drawer');
  const title = d.querySelector('#mpDrawerTitle') ? d.querySelector('#mpDrawerTitle').textContent : '';
  const rows = d.querySelectorAll('[data-diff-row]').length;
  const gapText = d.querySelector('.po-diff-gap') ? d.querySelector('.po-diff-gap').textContent.trim() : '';
  const hasSigCanvas = !!document.getElementById('poSigCanvas');
  /* V4.8：差异表含「品牌」列 + 抽屉内容全宽（不留右侧空白） */
  const diffThs = [...d.querySelectorAll('.po-diff-table th')].map(x => x.textContent.trim());
  const formMaxW = getComputedStyle(d.querySelector('.po-form')).maxWidth;
  /* 未选原因 → 拦截 */
  d.querySelector('[data-diff-next]').click();
  const blockedNoReason = !!document.querySelector('[data-diff-row]');
  /* 选「其他」→ 出现手填；不填 → 拦截 */
  const sel = d.querySelector('[data-diff-reason="S2101"]');
  sel.value = '其他'; sel.dispatchEvent(new Event('change', { bubbles: true }));
  const otherShown = !d.querySelector('[data-diff-other="S2101"]').hidden;
  d.querySelector('[data-diff-next]').click();
  const blockedNoOther = !!document.querySelector('[data-diff-row]');
  d.querySelector('[data-diff-other="S2101"]').value = '整箱压伤无法入库';
  /* 改成普通原因再进签名 */
  sel.value = '少发漏发'; sel.dispatchEvent(new Event('change', { bubbles: true }));
  const otherHidden = d.querySelector('[data-diff-other="S2101"]').hidden;
  d.querySelector('[data-diff-next]').click();
  const sigShown = !!document.getElementById('poSigCanvas');
  /* V4.7：签名抽屉顶部直接列差异商品表，不再有横幅摘要 / 二次确认 / kv 汇总 */
  const sd = document.querySelector('.mp-drawer .po-sig-diff');
  const sigDiffText = sd ? sd.textContent.replace(/\s+/g, ' ').trim() : '';
  const sigThs = sd ? [...sd.querySelectorAll('th')].map(x => x.textContent.trim()) : [];
  const sigBanners = document.querySelectorAll('.mp-drawer .po-banner').length;
  const hasKv = !!document.querySelector('.mp-drawer .po-kv-grid');
  const hasBack = !!(sd && sd.querySelector('[data-diff-back]'));
  return { enabled, title, rows, gapText, hasSigCanvas, diffThs, formMaxW, blockedNoReason, otherShown, blockedNoOther,
    otherHidden, sigShown, sigDiffText, sigThs, sigBanners, hasKv, hasBack,
    fail: (!enabled || rows !== 1 || gapText !== '2' || hasSigCanvas || !blockedNoReason
      || !otherShown || !blockedNoOther || !otherHidden || !sigShown
      || !sd || sigDiffText.indexOf('少发漏发') < 0 || sigDiffText.indexOf('沙瓤番茄') < 0
      || sigThs.indexOf('差异原因') < 0 || sigThs.indexOf('品牌') < 0 || sigBanners !== 0 || hasKv || !hasBack
      || diffThs.indexOf('品牌') < 0 || formMaxW !== 'none') ? '差异原因确认不符' : '' };
})()`);

await step('签名抽屉：未选验收人 / 未签名拦截 → 签名后订单已完成，差异原因落到收口', `(() => {
  document.querySelector('[data-sig-ok]').click();
  const blockedByPerson = document.getElementById('mpMask').classList.contains('show');
  document.getElementById('poStaffAdd').click();
  const s = document.getElementById('poStaffSearch');
  s.value = '李'; s.dispatchEvent(new Event('input', { bubbles: true }));
  const staffRows = [...document.querySelectorAll('#poStaffBody tr')];
  document.querySelectorAll('#poStaffBody [data-staff-row]')[0].click();
  document.querySelector('[data-staff-ok]').click();
  document.querySelector('[data-sig-ok]').click();
  const blockedByInk = document.getElementById('mpMask').classList.contains('show');
  window.MerchantOrder.__debug.inkSignature();
  document.querySelector('[data-sig-ok]').click();
  const o = window.MerchantOrder.__debug.findOrder(window.__TARGET_NO);
  const acc = o.acceptance || null;
  const diffs = acc && acc.diffs ? acc.diffs : [];
  const banner = document.getElementById('poLinesBody').querySelector('.po-banner-ok');
  return { blockedByPerson, staffRows: staffRows.length, blockedByInk,
    status: o.status, hasSig: !!(acc && acc.sig), diffCount: diffs.length,
    diffReason: diffs[0] && diffs[0].reason, diffGap: diffs[0] && diffs[0].gap,
    bannerShown: !!banner, lockedAccept: document.querySelectorAll('#poLinesBody [data-line-accept]').length,
    fail: (!blockedByPerson || !blockedByInk || o.status !== 'done' || !(acc && acc.sig)
      || diffs.length !== 1 || diffs[0].reason !== '少发漏发' || diffs[0].gap !== 2
      || !banner || document.querySelectorAll('#poLinesBody [data-line-accept]').length !== 0) ? '签名收口不符' : '' };
})()`);

await step('列表回显：该订单状态「已完成」+ 是否有售后「无」+ 验收总金额', `(() => {
  document.getElementById('poBackList').click();
  const rows = [...document.querySelectorAll('#purchaseOrderPage .po-order-table tbody tr')];
  const doneRows = rows.filter(r => r.textContent.includes('已完成'));
  const cell = doneRows.length ? [...doneRows[0].children].map(td => td.textContent.replace(/\\s+/g, ' ').trim()) : [];
  return { doneCount: doneRows.length, cell,
    fail: (doneRows.length !== 2 || cell[8] !== '无') ? '列表回显不符' : '' };
})()`);

/* ==================== 5. 售后（退货） ==================== */
await step('演示按钮写入售后单 → 列表「是否有售后」变「有」', `(() => {
  const rows = [...document.querySelectorAll('#purchaseOrderPage .po-order-table tbody tr')];
  const target = rows.find(r => r.textContent.includes('已完成'));
  target.querySelector('[data-order-open]').click();
  document.querySelector('#poLinesBody [data-demo="return"]').click();
  const after = document.querySelector('#poLinesBody').textContent;
  document.getElementById('poBackList').click();
  document.querySelector('[data-assale-tab="has"]').click();
  const hasRows = [...document.querySelectorAll('#purchaseOrderPage .po-order-table tbody tr')].length;
  document.querySelector('[data-assale-tab="all"]').click();
  return { hasAftersaleRows: hasRows, hasRecord: /RT\\d+/.test(after),
    fail: (hasRows !== 1 || !/RT\\d+/.test(after)) ? '售后回显不符' : '' };
})()`);

await step('退货弹层：实际验收量回显 + 退货量 + 原因下拉；超量/未选原因拦截', `(() => {
  const rows = [...document.querySelectorAll('#purchaseOrderPage .po-order-table tbody tr')];
  rows.find(r => r.textContent.includes('已完成')).querySelector('[data-order-open]').click();
  const box = document.getElementById('poLinesBody');
  const btn = box.querySelector('[data-line-return]');
  const noReturnBtn = !btn;
  if (btn) btn.click();
  const d = document.querySelector('.mp-drawer');
  if (!d) return { noReturnBtn, hadAftersaleBtn: !!box.querySelector('[data-line-aftersale]'),
    fail: '已完成订单应能退货或看售后' };
  const qty = document.getElementById('poRtQty');
  const reasons = [...d.querySelectorAll('#poRtReason option')].map(o => o.textContent.trim());
  qty.value = '9999';
  document.querySelector('[data-rt-ok]').click();
  const blockedOver = !!document.getElementById('poRtQty');
  qty.value = '1';
  document.getElementById('poRtReason').value = '';
  document.querySelector('[data-rt-ok]').click();
  const blockedNoReason = !!document.getElementById('poRtQty');
  /* 退货凭证：非必填、最多 5 张 */
  const rtLabel = [...d.querySelectorAll('label')].find(l => l.textContent.indexOf('退货凭证') === 0);
  const rtHasStar = !!(rtLabel && rtLabel.querySelector('em'));
  const rtAdd = document.getElementById('poRtAddPhoto');
  rtAdd.click(); rtAdd.click(); rtAdd.click(); rtAdd.click(); rtAdd.click(); rtAdd.click();
  const rtCapped = rtAdd.disabled;
  const rtFull = d.querySelectorAll('#poRtPhotos .po-photo').length;
  d.querySelector('[data-del-rt-photo="0"]').click();
  const rtAfterDel = d.querySelectorAll('#poRtPhotos .po-photo').length;
  /* 退货原因「其他」：选中才出现手填，未填拦截（V4.5） */
  const otherOpt = reasons.indexOf('其他') >= 0;
  const sel = document.getElementById('poRtReason');
  const wrapBefore = !document.getElementById('poRtOtherWrap').hidden;
  sel.value = '其他';
  sel.dispatchEvent(new Event('change', { bubbles: true }));
  const wrapAfter = !document.getElementById('poRtOtherWrap').hidden;
  document.querySelector('[data-rt-ok]').click();
  const blockedNoOther = document.getElementById('mpMask').classList.contains('show');
  document.getElementById('poRtOther').value = '包装内发现玻璃碎片';
  /* 校验通过后切回普通原因，后续步骤仍按普通原因提交 */
  sel.value = document.querySelector('#poRtReason option:nth-child(2)').value;
  sel.dispatchEvent(new Event('change', { bubbles: true }));
  const wrapHiddenAgain = document.getElementById('poRtOtherWrap').hidden;
  return { qtyDefault: qty.value, reasons: reasons.length, blockedOver, blockedNoReason,
    otherOpt, wrapBefore, wrapAfter, blockedNoOther, wrapHiddenAgain,
    rtHasStar, rtCapped, rtFull, rtAfterDel, rtHint: rtLabel ? rtLabel.querySelector('.po-sub').textContent.trim() : '',
    fail: (!blockedOver || !blockedNoReason || reasons.length < 8 || rtHasStar || !rtCapped || rtFull !== 5 || rtAfterDel !== 4) ? '退货校验不符' : '' };
})()`);

await step('提交退货申请：带 4 张凭证 → 售后单记录张数，售后记录表与售后详情都回显', `(() => {
  document.getElementById('poRtReason').value = document.querySelector('#poRtReason option:nth-child(2)').value;
  document.querySelector('[data-rt-ok]').click();
  const box = document.getElementById('poLinesBody');   /* 提交后重渲染，必须重新取节点 */
  const doneOrders = window.MerchantOrder.orders().filter(o => o.status === 'done');
  const allReturns = doneOrders.flatMap(o => o.returns || []);
  const withPhotos = allReturns.filter(r => r.photos === 4).length;
  const ths = [...box.querySelectorAll('.po-section table.po-table th')].map(x => x.textContent.trim());
  const hasCol = ths.includes('退货凭证');
  const rowTxt = [...box.querySelectorAll('table.po-table tbody tr')].map(tr => tr.textContent.replace(/\\s+/g, '')).join('|');
  return { hasAftersaleEntry: /售后详情/.test(box.textContent), doneStill: doneOrders.length, hasCol,
    photosSaved: withPhotos === 1, rowShowsPhotos: /4张/.test(rowTxt),
    fail: (!/售后详情/.test(box.textContent) || doneOrders.length !== 2 || !hasCol
      || withPhotos !== 1 || !/4张/.test(rowTxt)) ? '售后申请不符' : '' };
})()`);

await step('供应商不认可：空理由拦截 → 填理由后状态=不认可，验收量不变', `(() => {
  document.querySelector('#poLinesBody [data-sim="return-reject"]').click();
  const box1 = !!document.getElementById('poAsRejectReason');
  document.querySelector('[data-as-rj-ok]').click();
  const kept = !!document.getElementById('poAsRejectReason');
  document.getElementById('poAsRejectReason').value = '到货时已按标准验收，不存在变质';
  document.querySelector('[data-as-rj-ok]').click();
  /* 不认可的售后单：打开「售后详情」看得到理由与「重新发起」 */
  const o = window.MerchantOrder.orders().find(x => (x.returns || []).some(r => r.status === 'rejected'));
  const rejected = o && o.returns.find(r => r.status === 'rejected');
  document.querySelector('#poLinesBody [data-line-aftersale="' + rejected.skuCode + '"]').click();
  const d2 = document.querySelector('.mp-drawer');
  const detailText = d2 ? d2.textContent : '';
  const res = { hasReasonBox: box1, blockedEmpty: kept, status: rejected.status,
    rejectReason: rejected.rejectReason,
    detailShowsReason: /不存在变质/.test(detailText),
    hasRetry: !!(d2 && d2.querySelector('[data-as-retry]')) };
  if (d2) d2.querySelector('[data-ld-close], [data-as-close]')?.click();
  res.fail = (!box1 || !kept || rejected.status !== 'rejected' || !res.detailShowsReason || !res.hasRetry) ? '不认可流程不符' : '';
  return res;
})()`);

await step('重新发起 → 第 2 张售后单；供应商认可 → 验收量扣减、行标「有退货」，订单仍已完成', `(() => {
  const box = document.getElementById('poLinesBody');
  const o0 = window.MerchantOrder.orders().find(x => (x.returns || []).some(r => r.status === 'rejected'));
  const rejected = o0.returns.find(r => r.status === 'rejected');
  box.querySelector('[data-line-aftersale="' + rejected.skuCode + '"]').click();
  const d = document.querySelector('.mp-drawer');
  const retry = d && d.querySelector('[data-as-retry]');
  const hadRetry = !!retry;
  if (retry) retry.click();
  const reopened = !!document.getElementById('poRtQty');
  if (reopened) {
    document.getElementById('poRtQty').value = '1';
    const sel2 = document.getElementById('poRtReason');
    sel2.value = '其他';
    sel2.dispatchEvent(new Event('change', { bubbles: true }));
    document.getElementById('poRtOther').value = '送来的货与样品规格不符';
    document.querySelector('[data-rt-ok]').click();
  }
  const oOther = window.MerchantOrder.orders().find(x => (x.returns || []).some(r => r.otherReason));
  const recOther = oOther && oOther.returns.find(r => r.otherReason);
  const asDetail = (() => {
    const b = document.getElementById('poLinesBody');
    return b ? b.textContent : '';
  })();
  document.querySelector('#poLinesBody [data-sim="return-agree"]').click();
  const o = window.MerchantOrder.orders().find(x => (x.returns || []).some(r => r.status === 'agreed'));
  const line = o && o.items.find(i => (o.returns || []).some(r => r.skuCode === i.skuCode && r.status === 'agreed'));
  return { hadRetry, reopened, agreed: !!o, orderStatus: o && o.status,
    otherReason: recOther && recOther.otherReason, otherReasonRaw: recOther && recOther.reason,
    listShowsOther: /其他：送来的货与样品规格不符/.test(asDetail),
    acceptedQty: line && line.acceptedQty, returnQty: line && line.returnQty,
    rowTag: /有退货/.test(document.getElementById('poLinesBody').textContent),
    fail: (!hadRetry || !reopened || !o || o.status !== 'done'
      || !recOther || recOther.reason !== '其他' || recOther.otherReason !== '送来的货与样品规格不符'
      || !/其他：送来的货与样品规格不符/.test(asDetail)
      || !/有退货/.test(document.getElementById('poLinesBody').textContent)) ? '认可流程不符' : '' };
})()`);

/* ==================== 6. 修改订单入口（仅直采 + 待确认） ==================== */
await step('修改订单入口：种子里没有「直采 + 待确认」订单 → 列表无修改入口', `(() => {
  document.getElementById('poBackList').click();
  const rows = [...document.querySelectorAll('#purchaseOrderPage .po-order-table tbody tr')];
  const withEdit = rows.filter(r => r.querySelector('[data-edit-order]'));
  const labels = withEdit.map(r => [...r.children].map(td => td.textContent.replace(/\\s+/g, ' ').trim()));
  return { rowCount: rows.length, editRows: withEdit.length, labels,
    fail: (withEdit.length !== 0) ? '种子里没有「直采+待确认」订单，此处应无修改入口' : '' };
})()`);

/* ==================== 7. 新建订单向导（直采） ==================== */
await step('新建订单：点「+ 新建订单」直达向导（无模式抽屉）+ 4 步', `(() => {
  document.getElementById('poOrderNav').click();
  document.getElementById('poNewBtn').click();
  const w = document.getElementById('poWizardPage');
  const steps = [...w.querySelectorAll('.po-step')].map(s => s.textContent.replace(/\\s+/g, ' ').trim());
  const drawerOpen = [...document.querySelectorAll('.mp-drawer')].some(d => d.offsetParent !== null && !d.hidden);
  return { pageShown: !w.hidden, title: w.querySelector('h2').textContent.trim(), steps,
    drawerOpen, hasWayCard: !!w.querySelector('.po-way'),
    fail: (w.hidden || w.querySelector('h2').textContent.trim() !== '新建订单' || steps.length !== 3
      || steps[0].indexOf('送达日期与数量') < 0 || !!w.querySelector('.po-sup-card')
      || drawerOpen || !!w.querySelector('.po-way')) ? '向导入口不符' : '' };
})()`);

await step('向导第 1 步直接是「送达日期与数量」：无选供应商步、表头含供应商与总价列', `(() => {
  const w = document.getElementById('poWizardPage');
  const noSupCards = !w.querySelector('.po-sup-card') && !w.querySelector('[data-sup]');
  const pool = (window.MerchantOrder.__debug.orderPoolIds ? window.MerchantOrder.__debug.orderPoolIds() : []);
  const steps = [...w.querySelectorAll('.po-step span')].map(s => s.textContent.trim());
  return { noSupCards, hasFrom: !!document.getElementById('wizFrom'), poolCount: pool.length, steps,
    fail: (!noSupCards || !document.getElementById('wizFrom') || pool.length !== 10
      || steps.length !== 3 || steps[0] !== '送达日期与数量') ? '第 1 步不符' : '' };
})()`);

await step('添加商品抽屉只列「已绑定供应商且有报价」的商品（不显示未绑定的）', `(() => {
  document.getElementById('wizAddSku').click();
  const cnt = document.getElementById('poPickCnt').textContent.trim();
  const names = [...document.querySelectorAll('#poPickList tbody tr')].map(r => r.querySelectorAll('td')[1].textContent.trim());
  const hasUnbound = names.some(n => /海天生抽|鲜小葱|老南瓜|鲜香菇/.test(n));
  const hasBound = names.some(n => /鲜黄瓜|冷鲜鸡胸肉/.test(n));
  document.querySelector('[data-pick-done]').click();
  return { cnt, count: names.length, hasUnbound, hasBound,
    fail: (hasUnbound || !hasBound || names.length === 0) ? '商品池未按供货关系过滤' : '' };
})()`);

await step('日期页签随区间生成 3 天 + 默认停起始日 + 可单独删除', `(() => {
  const w = document.getElementById('poWizardPage');
  const d1 = ${JSON.stringify(dayStr(1))}, d2 = ${JSON.stringify(dayStr(2))}, d3 = ${JSON.stringify(dayStr(3))};
  const f = document.getElementById('wizFrom'); f.value = d1; f.dispatchEvent(new Event('change', { bubbles: true }));
  const t = document.getElementById('wizTo'); t.value = d3; t.dispatchEvent(new Event('change', { bubbles: true }));
  const tabs = [...w.querySelectorAll('[data-day-tab]')].map(b => b.getAttribute('data-day-tab'));
  const active = w.querySelector('.po-daytab.active [data-day-tab]')?.getAttribute('data-day-tab');
  return { tabs, active, deletable: w.querySelectorAll('[data-day-del]').length,
    fail: (tabs.join(',') !== [d1, d2, d3].join(',') || active !== d1) ? '日期页签不符' : '' };
})()`);

await step('添加商品抽屉：按日期加 3 天（黄瓜 5/6/7）+ 当天小计与合计随动（有单价）', `(() => {
  const d1 = ${JSON.stringify(dayStr(1))}, d2 = ${JSON.stringify(dayStr(2))}, d3 = ${JSON.stringify(dayStr(3))};
  const pickTab = d => document.querySelector('#poWizardPage [data-day-tab="' + d + '"]').click();
  const addSku = (kwi, qty) => {
    document.getElementById('wizAddSku').click();
    const k = document.getElementById('poPickKw'); k.value = kwi; k.dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('poPickSearch').click();
    const row = [...document.querySelectorAll('#poPickList tbody tr')].find(r => r.textContent.includes('鲜黄瓜'));
    const q = row.querySelector('[data-pick-qty]');
    q.value = String(qty); q.dispatchEvent(new Event('input', { bubbles: true }));
    row.querySelector('[data-add-sku]').click();
    document.querySelector('[data-pick-done]').click();
  };
  pickTab(d1); addSku('黄瓜', 5);
  pickTab(d2); addSku('黄瓜', 6);
  pickTab(d3); addSku('黄瓜', 7);
  const ths = [...document.querySelectorAll('#poWizardPage .po-day-table th')].map(x => x.textContent.trim());
  const w = document.getElementById('poWizardPage');
  const cells = [...w.querySelectorAll('.po-day-table tbody tr td')].map(x => x.textContent.trim());
  const supCell = cells.includes('本地蔬菜合作社');
  const firstTotal = w.querySelector('[data-day-total]')?.textContent.trim();
  return { ths, hasUnitPrice: ths.includes('单价'), hasTotalCol: ths.includes('总价'), hasSupCol: ths.includes('供应商'),
    supCell, firstTotal, daySum: document.getElementById('poDaySum')?.textContent,
    total: document.getElementById('poWizTotal')?.textContent, dayCnt: document.getElementById('poDayCnt')?.textContent,
    ordCnt: document.getElementById('poOrdCnt')?.textContent,
    fail: (!ths.includes('单价') || !ths.includes('总价') || !ths.includes('供应商') || !supCell
      || firstTotal !== '¥434.00' || document.getElementById('poDaySum')?.textContent !== '¥434.00'\n      || document.getElementById('poWizTotal')?.textContent !== '¥1,116.00') ? '供应商/总价列不符' : '' };
})()`);

await step('填量联动：改量后总价同步 / 清空回到 — / 张数与供应商同步', `(() => {
  const inp = () => document.querySelector('#poWizardPage [data-day-qty]');
  const total = () => document.querySelector('#poWizardPage [data-day-total]').textContent.trim();
  inp().value = '8'; inp().dispatchEvent(new Event('input', { bubbles: true }));
  const t1 = total();
  inp().value = ''; inp().dispatchEvent(new Event('input', { bubbles: true }));
  const t2 = total();
  const ord0 = document.getElementById('poOrdCnt').textContent;
  inp().value = '7'; inp().dispatchEvent(new Event('input', { bubbles: true }));
  const t3 = total();
  const ord1 = document.getElementById('poOrdCnt').textContent;
  const sup1 = document.getElementById('poSupCnt').textContent;
  return { t1, t2, t3, ord0, ord1, sup1,
    fail: (t1 !== '¥496.00' || t2 !== '—' || t3 !== '¥434.00' || ord0 !== '2' || ord1 !== '3' || sup1 !== '1')
      ? '总价/张数未随填量同步' : '' };
})()`);
await step('未填采购量拦截 → 标红 + 提示定位当天；补齐后放行', `(() => {
  const d2 = ${JSON.stringify(dayStr(2))};
  document.querySelector('#poWizardPage [data-day-tab="' + d2 + '"]').click();
  const inp = document.querySelector('#poWizardPage [data-day-qty]');
  const orig = inp.value;
  inp.value = ''; inp.dispatchEvent(new Event('input', { bubbles: true }));
  document.getElementById('wizNext').click();
  const toastEl = [...document.querySelectorAll('body *')].find(n => !n.children.length && n.textContent.includes('有未填写采购量的商品'));
  const errInputs = document.querySelectorAll('#poWizardPage .po-qty-error').length;
  const stillStep2 = !!document.getElementById('wizFrom');
  const red = document.querySelector('#poWizardPage .po-qty-error');
  red.value = orig || '6'; red.dispatchEvent(new Event('input', { bubbles: true }));
  return { toast: toastEl ? toastEl.textContent.trim() : '', errInputs, stillStep2,
    errLeft: document.querySelectorAll('#poWizardPage .po-qty-error').length,
    fail: (!toastEl || !errInputs || !stillStep2) ? '未填量拦截不符' : '' };
})()`);

await step('总览：1 张摘要卡（大数 + 4 个统计块 + 供应商 chip）+ 1 供应商 1 卡片', `(() => {
  document.getElementById('wizNext').click();
  const w = document.getElementById('poWizardPage');
  const stats = [...w.querySelectorAll('.po-ov-stat')].map(d => d.querySelector('label').textContent.trim() + '=' + d.querySelector('b').textContent.trim());
  const chips = [...w.querySelectorAll('.po-ov-chip')].map(x => x.textContent.replace(/\\s+/g, ' ').trim());
  const cards = [...w.querySelectorAll('.po-ov-sup')];
  const head = cards[0]?.querySelector('.po-ov-sup-head')?.textContent.replace(/\\s+/g, ' ').trim();
  const ths = [...w.querySelectorAll('.po-ov-table th')].map(x => x.textContent.trim());
  const text = w.textContent;
  return { stats, chips, cards: cards.length, head, ths,
    total: w.querySelector('.po-ov-total-v')?.textContent.trim(), totalSub: w.querySelector('.po-ov-total-sub')?.textContent.trim(),
    fail: (stats.length !== 4 || !stats.some(x => /涉及供应商=1 家/.test(x)) || !stats.some(x => /订单张数=3 张/.test(x))
      || cards.length !== 1 || !/本地蔬菜合作社/.test(head) || !/1 个商品 · 3 张订单/.test(head) || !/小计/.test(head)
      || chips.length !== 1 || !/本地蔬菜合作社/.test(chips[0]) || !/1 商品 · 3 张/.test(chips[0])
      || ths.includes('供应商') || w.querySelector('.po-group-foot') || /采购单/.test(text)) ? '总览不符' : '' };
})()`);

await step('总览摘要卡：合计金额 = 各行金额之和，金额下方无小字提示', `(() => {
  const w = document.getElementById('poWizardPage');
  const total = w.querySelector('.po-ov-total-v').textContent.trim();
  const rowAmts = [...w.querySelectorAll('.po-ov-table tbody tr')].map(tr => tr.querySelectorAll('td')[9].textContent.trim());
  const noSub = !w.querySelector('.po-ov-total-sub');
  const totalText = w.querySelector('.po-ov-total').textContent.replace(/\\s+/g, ' ').trim();
  return { total, rowAmts, noSub, totalText,
    fail: (total !== '¥1,116.00' || rowAmts.length !== 1 || !noSub || /个商品 · 总数量/.test(totalText)) ? '摘要卡合计不符' : '' };
})()`);

await step('总览：多供应商时按小计金额降序排列卡片', `(() => {
  /* 追加一个高价商品，构造两家供应商 */
  const d1 = ${JSON.stringify(dayStr(1))};
  document.getElementById('wizPrev').click();
  document.querySelector('#poWizardPage [data-day-tab="' + d1 + '"]').click();
  const before = document.querySelectorAll('#poWizardPage .po-day-table tbody tr').length;
  document.getElementById('wizAddSku').click();
  const k = document.getElementById('poPickKw'); k.value = '大豆油'; k.dispatchEvent(new Event('input', { bubbles: true }));
  document.getElementById('poPickSearch').click();
  const row = [...document.querySelectorAll('#poPickList tbody tr')].find(r => r.textContent.includes('一级大豆油'));
  const q = row.querySelector('[data-pick-qty]');
  q.value = '10'; q.dispatchEvent(new Event('input', { bubbles: true }));
  row.querySelector('[data-add-sku]').click();
  document.querySelector('[data-pick-done]').click();
  document.querySelectorAll('#poWizardPage [data-day-tab]').forEach(t => { if (t.classList.contains('active')) t.click(); });
  document.getElementById('wizNext').click();
  const w = document.getElementById('poWizardPage');
  const sups = [...w.querySelectorAll('.po-ov-sup .po-ov-sup-head h3')].map(x => x.textContent.trim());
  const sums = [...w.querySelectorAll('.po-ov-sup-sum b')].map(x => Number(x.textContent.replace(/[^\\d.]/g, '')));
  const cards = w.querySelectorAll('.po-ov-sup').length;
  const chips = w.querySelectorAll('.po-ov-chip').length;
  /* 收尾：删掉刚加的大豆油，回到单供应商，供后续提交步骤复用 */
  document.getElementById('wizPrev').click();
  const del = [...document.querySelectorAll('#poWizardPage [data-day-del-line]')].pop();
  del.click();
  document.getElementById('wizNext').click();
  return { before, sups, sums, cards, chips,
    fail: (cards !== 2 || chips !== 2 || sums[0] < sums[1]) ? '供应商卡片排序不符' : '' };
})()`);

await step('提交：收货人从后厨选 + 二次确认（我再看看停留 / 确认后回列表并生成 3 张订单）', `(() => {
  document.getElementById('wizNext').click();
  const w = document.getElementById('poWizardPage');
  const before = window.MerchantOrder.orders().length;
  const maskOn = () => { const m = document.getElementById('poConfirmMask'); return !!(m && m.classList.contains('show')); };
  document.getElementById('wizSubmit').click();               /* 未选收货人 → 拦截 */
  const blocked = !maskOn() && !!document.getElementById('wizSubmit');
  const pick = w.querySelector('#wizRcPick');
  if (pick) pick.click();
  const rc = document.querySelector('.mp-drawer #poRcBody [data-rc-pick]');
  if (rc) rc.click();
  /* 第一次点提交：只弹确认框，不生成订单 */
  document.getElementById('wizSubmit').click();
  const confirmShown = maskOn();
  const confirmText = document.getElementById('poConfirmText').textContent.trim();
  const confirmTitle = document.getElementById('poConfirmTitle').textContent.trim();
  const okText = document.getElementById('poConfirmOk').textContent.trim();
  const cancelText = document.getElementById('poConfirmCancel').textContent.trim();
  const notCreatedYet = window.MerchantOrder.orders().length === before;
  /* 我再看看 → 停留在第 3 步，不生成 */
  document.getElementById('poConfirmCancel').click();
  const stayOnStep3 = !maskOn() && !!document.getElementById('wizSubmit') && !document.getElementById('purchaseOrderPage').querySelector('#poBackList');
  const stillNotCreated = window.MerchantOrder.orders().length === before;
  /* 再点提交 → 确认 → 生成并回到列表 */
  document.getElementById('wizSubmit').click();
  document.getElementById('poConfirmOk').click();
  const after = window.MerchantOrder.orders().length;
  const p = document.getElementById('purchaseOrderPage');
  const onList = !p.hidden && !!p.querySelector('.po-order-table');
  const firstRows = [...p.querySelectorAll('.po-order-table tbody tr')].slice(0, 3).map(r => r.textContent.replace(/\\s+/g, ' ').trim());
  return { blocked, confirmShown, confirmTitle, confirmText, okText, cancelText, notCreatedYet,
    stayOnStep3, stillNotCreated, created: after - before, onList, firstRows,
    fail: (!blocked || !confirmShown || confirmText !== '是否确认提交该次采购？' || okText !== '确认'
      || cancelText !== '我再看看' || !notCreatedYet || !stayOnStep3 || !stillNotCreated
      || after - before !== 3 || !onList) ? '提交确认/回列表不符' : '' };
})()`);

await step('新订单：回到列表后同批订单排在最前（同供应商相邻）→ 打开最新一张校验详情', `(() => {
  const p = document.getElementById('purchaseOrderPage');
  const rows = [...p.querySelectorAll('.po-order-table tbody tr')];
  const newest = rows[0];
  const newestCreated = newest.children[9].textContent.trim();
  const batch = rows.filter(r => r.children[9].textContent.trim() === newestCreated);
  const batchSups = batch.map(r => r.children[1].textContent.trim());
  let grouped = true;
  for (let i = 1; i < batchSups.length; i++) {
    if (batchSups[i] !== batchSups[i - 1]) for (let j = 0; j < i; j++) if (batchSups[j] === batchSups[i]) grouped = false;
  }
  newest.querySelector('[data-order-open]').click();
  const head = p.querySelector('.po-order-head h2').textContent.replace(/\\s+/g, ' ').trim();
  const hasEdit = !!p.querySelector('#poEditBtn');
  /* V4.14：待确认没有发货记录 → 不出现「预计发货时间」，改用空态说明 */
  const linesBox = document.getElementById('poLinesBody');
  const shipSec = [...linesBox.querySelectorAll('.po-section')].find(s => s.textContent.includes('发货记录'));
  const shipHasTable = !!(shipSec && shipSec.querySelector('thead th'));
  const shipEmptyText = shipSec && shipSec.querySelector('.po-empty') ? shipSec.querySelector('.po-empty').textContent.trim() : '';
  const noPlanTime = !shipHasTable && /待供应商确认/.test(shipEmptyText);
  /* 已确认：同样还没有发货记录（走同一空态分支，文案为「供应商尚未发货…」） */
  const confOrder = window.MerchantOrder.orders().find(x => x.status === 'confirmed');
  const confNoShip = !!confOrder && !(confOrder.shipments || []).length;
  p.querySelector('#poBackList').click();
  const rows2 = [...document.querySelectorAll('#purchaseOrderPage .po-order-table tbody tr')];
  const waitRows = rows2.filter(r => r.textContent.includes('待确认') && r.textContent.includes('直采下单'));
  return { newestCreated, batchSize: batch.length, batchSups, grouped, head, hasEdit, shipHasTable, shipEmptyText, noPlanTime, confNoShip,
    rowCount: rows2.length, waitRows: waitRows.length,
    fail: (!/直采下单/.test(head) || !/待确认/.test(head) || !hasEdit || !grouped || !noPlanTime || !confNoShip
      || batch.length < 3 || waitRows < 3) ? '新订单落位/详情不符' : '' };
})()`);

await step('修改订单（直采待确认）：抽屉可改量与收货人，保存后金额变化并写时间轴', `(() => {
  const rows = [...document.querySelectorAll('#purchaseOrderPage .po-order-table tbody tr')];
  const target = rows.find(r => r.querySelector('[data-edit-order]'));
  if (!target) return { fail: '没有直采待确认订单可以修改' };
  target.querySelector('[data-edit-order]').click();
  const d = document.querySelector('.mp-drawer');
  const hasContact = !!document.getElementById('poEditContact');
  const qty = d.querySelector('[data-edit-qty]');
  const q0 = qty.value;
  qty.value = '9'; qty.dispatchEvent(new Event('input', { bubbles: true }));
  const total = document.getElementById('poEditTotal').textContent.trim();
  document.querySelector('[data-edit-save]').click();
  const o = window.MerchantOrder.orders().find(x => x.timeline.some(t => /采购员修改订单/.test(t.text)));
  return { hasContact, q0, total, edited: !!o,
    fail: (!hasContact || !o) ? '修改订单不符' : '' };
})()`);

await step('混合供应商：同一天绑了 2 家供应商 → 拆成 2 张订单，详情供应商各自正确', `(() => {
  const d1 = ${JSON.stringify(dayStr(1))};
  const back = document.getElementById('poBackList');
  if (back) back.click();
  document.getElementById('poNewBtn').click();
  const w = document.getElementById('poWizardPage');
  const f = document.getElementById('wizFrom'); f.value = d1; f.dispatchEvent(new Event('change', { bubbles: true }));
  const tt = document.getElementById('wizTo'); tt.value = d1; tt.dispatchEvent(new Event('change', { bubbles: true }));
  const addSku = (kwi, name, qty) => {
    document.getElementById('wizAddSku').click();
    const k = document.getElementById('poPickKw'); k.value = kwi; k.dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('poPickSearch').click();
    const row = [...document.querySelectorAll('#poPickList tbody tr')].find(r => r.textContent.includes(name));
    if (!row) { document.querySelector('[data-pick-done]').click(); return false; }
    const q = row.querySelector('[data-pick-qty]');
    q.value = String(qty); q.dispatchEvent(new Event('input', { bubbles: true }));
    row.querySelector('[data-add-sku]').click();
    document.querySelector('[data-pick-done]').click();
    return true;
  };
  const a1 = addSku('黄瓜', '鲜黄瓜', 2);      /* 本地蔬菜合作社（毛菜） */
  const a2 = addSku('大豆油', '一级大豆油', 3); /* 江南粮油（净菜） */
  document.getElementById('wizNext').click();
  const stats = [...w.querySelectorAll('.po-ov-stat')].map(d => d.querySelector('label').textContent.trim() + '=' + d.querySelector('b').textContent.trim());
  const cards = w.querySelectorAll('.po-ov-sup').length;
  const chipText = [...w.querySelectorAll('.po-ov-chip')].map(x => x.textContent.replace(/\\s+/g, ' ').trim());
  document.getElementById('wizNext').click();
  const beforeNos = new Set(window.MerchantOrder.orders().map(o => o.no));
  w.querySelector('#wizRcPick').click();
  const rc = document.querySelector('.mp-drawer #poRcBody [data-rc-pick]');
  if (rc) rc.click();
  document.getElementById('wizSubmit').click();
  document.getElementById('poConfirmOk').click();      /* V4.9：二次确认后才生成 */
  const news = window.MerchantOrder.orders().filter(o => !beforeNos.has(o.no));
  const created = news.length;
  const supNames = news.map(o => o.supplierName);
  const back2 = document.getElementById('poBackList');
  if (back2) back2.click();      /* 回到列表，供后续档口切换步骤使用 */
  return { a1, a2, stats, cards, chipText, created, supNames,
    fail: (!a1 || !a2 || !stats.some(x => /涉及供应商=2 家/.test(x)) || cards !== 2 || chipText.length !== 2 || created !== 2
      || supNames.length !== 2 || new Set(supNames).size !== 2) ? '混合供应商拆单不符' : '' };
})()`);

/* ==================== 8. 档口与收尾 ==================== */
await step('切换器（组织 + 档口，无总览）：切换组织 → 列表按新档口清空 → 切回恢复', `(() => {
  const p = document.getElementById('purchaseOrderPage');
  const bar = p.querySelector('.mp-workspace-head + [data-mos-bar], [data-mos-bar]');
  const orgSel = p.querySelector('[data-mos-org]');
  const stallSel = p.querySelector('[data-mos-stall]');
  const stallOptsText = stallSel ? [...stallSel.options].map(o => o.textContent.trim()) : [];
  const noOverview = !stallOptsText.some(x => x.indexOf('全部档口') >= 0);
  const orgOpts = orgSel ? [...orgSel.options] : [];
  if (!orgSel || orgOpts.length < 2) return { skip: '只有一个次级组织' };
  const hasStallNow = !!stallSel && !!stallSel.value && stallOptsText.length > 0;
  const firstOrg = orgSel.value;
  const firstStall = stallSel ? stallSel.value : '';
  orgSel.value = orgOpts[1].value; orgSel.dispatchEvent(new Event('change'));
  const otherRows = p.querySelectorAll('.po-order-table tbody tr').length;
  const empty = !!p.querySelector('.po-empty');
  const org2 = p.querySelector('[data-mos-org]');
  org2.value = firstOrg; org2.dispatchEvent(new Event('change'));
  const backRows = p.querySelectorAll('.po-order-table tbody tr').length;
  const stallBack = p.querySelector('[data-mos-stall]') ? p.querySelector('[data-mos-stall]').value : '';
  return { barShown: !!bar, orgLabels: [...orgSel.options].map(o => o.textContent.trim()).slice(0, 2),
    stallOptsText, noOverview, hasStallNow, firstStall, stallBack,
    otherRows, empty, backRows,
    fail: (!bar || !noOverview || !hasStallNow || otherRows !== 0 || !empty || backRows < 5
      || stallBack !== firstStall) ? '切换器不符' : '' };
})()`);

await step('列表操作：文案 查看/修改/删除；仅「待确认」有删除，删除走二次确认且可取消', `(() => {
  ${LIST_HELPERS}
  const P_ = P();
  const rowOf = no => [...P_.querySelectorAll('.po-order-table tbody tr')].find(r => cells(r)[0] === no);
  const allRows = rows();
  const waitRow = allRows.find(r => r.textContent.includes('待确认'));
  const doneRow = allRows.find(r => !r.textContent.includes('待确认'));
  const opsText = r => [...r.querySelectorAll('.po-line-ops button')].map(b => b.textContent.trim());
  const waitOps = waitRow ? opsText(waitRow) : [];
  const doneOps = doneRow ? opsText(doneRow) : [];
  const waitNo = waitRow ? cells(waitRow)[0] : '';
  const before = window.MerchantOrder.orders().length;
  /* 删除 → 二次确认 → 我再看看（不删） */
  waitRow.querySelector('[data-del-order]').click();
  const maskOn = () => { const m = document.getElementById('poConfirmMask'); return !!(m && m.classList.contains('show')); };
  const confirmShown = maskOn();
  const confirmText = document.getElementById('poConfirmText').textContent.trim();
  const okText = document.getElementById('poConfirmOk').textContent.trim();
  document.getElementById('poConfirmCancel').click();
  const afterCancel = window.MerchantOrder.orders().length;
  const rowStill = !!rowOf(waitNo);
  /* 再删一次 → 删除 */
  rowOf(waitNo).querySelector('[data-del-order]').click();
  document.getElementById('poConfirmOk').click();
  const afterDel = window.MerchantOrder.orders().length;
  const rowGone = !rowOf(waitNo);
  const listRows = rows().length;
  const toastText = [...document.querySelectorAll('.po-toast, .mp-toast')].map(x => x.textContent).join(' ');
  return { waitOps, doneOps, waitNo, before, confirmShown, confirmText, okText, afterCancel, rowStill,
    afterDel, rowGone, listRows, toastText,
    fail: (waitOps.indexOf('查看') < 0 || waitOps.indexOf('删除') < 0 || doneOps.indexOf('删除') >= 0
      || doneOps.indexOf('查看') < 0 || !confirmShown || !/是否确认删除订单/.test(confirmText)
      || okText !== '删除' || afterCancel !== before || !rowStill
      || afterDel !== before - 1 || !rowGone || listRows !== allRows.length - 1) ? '操作文案/删除不符' : '' };
})()`);

await step('添加商品：浮框模糊搜索 → ↑↓ 选择 → 回车添加（商品添加成功）；重复添加给提示', `(() => {
  document.getElementById('poNewBtn').click();
  document.getElementById('wizAddSku').click();
  const kw = document.getElementById('poPickKw');
  const box = () => document.getElementById('poPickFuzzy');
  const rows = () => [...box().querySelectorAll('[data-fuzzy-sku]')];
  const onIdx = () => rows().findIndex(r => r.classList.contains('is-on'));
  const key = k => kw.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
  const type = v => { kw.value = v; kw.dispatchEvent(new Event('input', { bubbles: true })); };
  const toastText = () => document.getElementById('toast') ? document.getElementById('toast').textContent : '';
  const selText = () => document.getElementById('poPickToggle').textContent.replace(/\s+/g, ' ').trim();
  /* ① 输入 hg：出浮框、命中鲜黄瓜、默认高亮第 1 条 */
  type('hg');
  const panelShown = !box().hidden;
  const hgRows = rows().map(r => r.textContent.replace(/\s+/g, ' ').trim());
  const hasCuke = hgRows.some(x => x.indexOf('鲜黄瓜') >= 0);
  const metaOk = hgRows.some(x => x.indexOf('箱') >= 0 && x.indexOf('10斤/箱') >= 0 && x.indexOf('绿源') >= 0);
  const autoIdx = onIdx();
  /* ② 换多命中关键词 j：↑↓ 移动高亮（首条 → 第 2 条 → 回第 1 条） */
  type('j');
  const jCount = rows().length;
  const jAuto = onIdx();
  key('ArrowDown'); const afterDown = onIdx();
  key('ArrowUp'); const afterUp = onIdx();
  /* ③ 回到 hg，回车添加 */
  type('hg');
  const beforeSel = selText();
  key('Enter');
  const addToast = toastText();
  const toastEl = document.getElementById('toast');
  const toastZ = Number(getComputedStyle(toastEl).zIndex) || 0;
  const maskEl = document.querySelector('.mp-mask');
  const maskZ = maskEl ? (Number(getComputedStyle(maskEl).zIndex) || 0) : 0;
  const toastShown = toastEl.classList.contains('show');
  const afterSel = selText();
  const panelHidden = box().hidden;
  const cleared = kw.value === '';
  const focusBack = document.activeElement === kw;
  /* ④ 再搜 hg：已添加项灰态出现，回车只提示不重复添加 */
  type('hg');
  const addedRow = rows().find(r => r.textContent.indexOf('鲜黄瓜') >= 0);
  const addedGray = !!(addedRow && addedRow.classList.contains('is-added') && addedRow.textContent.indexOf('已添加') >= 0);
  key('Enter');
  const dupToast = toastText();
  const stillOne = selText() === afterSel;
  const keepInput = kw.value === 'hg';
  const keepPanel = !box().hidden;
  /* ⑤ Esc 只收浮框、输入保留；再聚焦输入框重新展开；点外部同样只收浮框 */
  key('Escape');
  const escHidden = box().hidden && kw.value === 'hg';
  kw.dispatchEvent(new Event('focus', { bubbles: true }));
  const reopenOnFocus = !box().hidden;
  kw.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  const outside = document.querySelector('.mp-drawer h2') || document.body;
  outside.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  const closedByOutside = box().hidden && kw.value === 'hg';
  kw.dispatchEvent(new Event('click', { bubbles: true }));
  const reopenOnClick = !box().hidden;
  key('Escape');
  type('zzzz');
  const emptyText = box().textContent.trim();
  key('Escape');
  const zEscKept = kw.value === 'zzzz' && box().hidden;
  document.querySelector('[data-pick-done]').click();
  document.getElementById('wizBack').click();
  const backOnList = !!document.querySelector('#purchaseOrderPage .po-order-table');
  return { panelShown, hgRows, hasCuke, metaOk, autoIdx, jCount, jAuto, afterDown, afterUp, toastZ, maskZ, toastShown,
    beforeSel, addToast, afterSel, panelHidden, cleared, focusBack, addedGray, dupToast, stillOne,
    keepInput, keepPanel, escHidden, reopenOnFocus, closedByOutside, reopenOnClick, emptyText, zEscKept, backOnList,
    fail: (!panelShown || !hasCuke || !metaOk || autoIdx !== 0 || jCount < 3 || jAuto !== 0
      || afterDown !== 1 || afterUp !== 0
      || addToast !== '商品添加成功' || !toastShown || toastZ <= maskZ || !panelHidden || !cleared || !focusBack
      || !/已选 1 种商品/.test(afterSel) || !addedGray
      || dupToast !== '该商品已添加，请勿重复添加' || !stillOne || !keepInput || !keepPanel
      || !escHidden || !reopenOnFocus || !closedByOutside || !reopenOnClick
      || emptyText.indexOf('没有匹配的商品') < 0 || !zEscKept || !backOnList) ? '键盘快速添加不符' : '' };
})()`);

await step('填完采购量离开该行 → 自动添加（无需点「添加」）；没填量则不加', `(async () => {
  document.getElementById('poNewBtn').click();
  document.getElementById('wizAddSku').click();
  const list = () => document.getElementById('poPickList');
  const rowOf = name => [...list().querySelectorAll('tbody tr')].find(r => r.textContent.includes(name));
  const selText = () => document.getElementById('poPickToggle').textContent.replace(/\\s+/g, ' ').trim();
  const toastText = () => document.getElementById('toast') ? document.getElementById('toast').textContent : '';
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const leave = el => el.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: null }));
  const typeQty = (el, v) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); };
  /* ① 采购量 7 → 离开 → 自动添加 */
  const before = selText();
  const q1 = rowOf('山东一级土豆').querySelector('[data-pick-qty]');
  typeQty(q1, '7');
  leave(q1);
  await wait(60);
  const afterAuto = selText();
  const autoToast = toastText();
  const rowAdded = rowOf('山东一级土豆').textContent.includes('已添加');
  /* ② 没填量，只离开 → 不添加 */
  const q2 = rowOf('一级大豆油').querySelector('[data-pick-qty]');
  leave(q2);
  await wait(60);
  const emptyNotAdded = selText() === afterAuto && !rowOf('一级大豆油').textContent.includes('已添加');
  /* ③ 采购量 + 备注：先在采购量里打字，移到备注不算离开；离开整行才添加，且备注带过去 */
  const q3 = rowOf('沙瓤番茄').querySelector('[data-pick-qty]');
  typeQty(q3, '3');
  const n3 = rowOf('沙瓤番茄').querySelector('[data-pick-note]');
  q3.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: n3 }));
  await wait(60);
  const stayWhenToNote = !rowOf('沙瓤番茄').textContent.includes('已添加');
  n3.value = '要新鲜的'; n3.dispatchEvent(new Event('input', { bubbles: true }));
  leave(n3);
  await wait(60);
  const noteAdded = rowOf('沙瓤番茄').textContent.includes('已添加');
  /* ④ 键盘：在采购量里按回车直接添加 */
  const q4 = rowOf('中筋面粉').querySelector('[data-pick-qty]');
  typeQty(q4, '2');
  q4.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await wait(60);
  const enterAdded = rowOf('中筋面粉').textContent.includes('已添加');
  const finalSel = selText();
  document.querySelector('[data-pick-done]').click();
  await wait(120);
  /* 备注随自动添加一起落库：关抽屉后向导表格里能读到 */
  const noteCarriedAfter = [...document.querySelectorAll('input')].some(i => i.value === '要新鲜的');
  document.getElementById('wizBack').click();
  const backOnList = !!document.querySelector('#purchaseOrderPage .po-order-table');
  return { before, afterAuto, autoToast, rowAdded, emptyNotAdded, stayWhenToNote, noteAdded,
    enterAdded, finalSel, noteCarriedAfter, backOnList,
    fail: (!/已选 1 种商品/.test(afterAuto) || autoToast !== '商品添加成功' || !rowAdded || !emptyNotAdded
      || !stayWhenToNote || !noteAdded || !enterAdded || !/已选 3 种商品/.test(finalSel)
      || !noteCarriedAfter
      || !backOnList) ? '自动添加不符' : '' };
})()`);
await step('收尾：无询价残留（DOM / debug API / 数据模型）', `(() => {
  const body = document.body.textContent;
  const dbg = window.MerchantOrder.__debug;
  const keys = Object.keys(dbg);
  const inqKeys = keys.filter(k => /inq/i.test(k));
  const groupsStill = typeof dbg.findGroup === 'function';
  return { inqInDom: /询价单|发起询价|报价截止/.test(body), inqKeys, groupsStill,
    fail: (/询价单|发起询价|报价截止/.test(body) || inqKeys.length || groupsStill) ? '仍有询价/采购单残留' : '' };
})()`);

/* ---------- 汇总 ---------- */
console.log('\n--- 页面错误 ---');
console.log(errors.length ? errors.join('\n') : '无');
const failed = results.filter(r => !r.ok);
console.log(`\n结果：${results.length - failed.length}/${results.length} 通过`);
if (failed.length) {
  console.log('失败步骤：');
  failed.forEach(f => console.log(' - ' + f.name + ' → ' + JSON.stringify(f.value || f.error)));
}
if (errors.length) process.exitCode = 1;
if (failed.length) process.exitCode = 1;
ws.close();
