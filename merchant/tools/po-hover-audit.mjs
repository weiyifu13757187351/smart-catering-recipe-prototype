/* 采购订单 / 询价单 —— 交互元素「可见性」巡检（hover / 常态对比度）
   用法：PO_PORT=4201 node tools/po-hover-audit.mjs   （需 Chrome --remote-debugging-port=9333）
   原理：用 CDP CSS.forcePseudoState 强制 :hover，再读 getComputedStyle，算文字色 vs 背景色对比度，
        对每个可点击元素取「最坏情况」对比度，低于阈值即判定为「悬浮后看不见」。 */
const PORT = process.env.PO_PORT || '4201';
const BASE = process.env.PO_BASE || ('http://127.0.0.1:' + PORT + '/');
const APP = BASE + encodeURIComponent('食联网数智餐饮平台-组织及人员.html');
const CDP = 'http://127.0.0.1:9333';
const THRESHOLD = 2.2;                                  /* WCAG 大字也至少 3.0，低于 2.2 基本看不见 */
const sleep = ms => new Promise(r => setTimeout(r, ms));

const targets = await (await fetch(CDP + '/json/list')).json();
const ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise(r => ws.onopen = r);
let id = 0; const waiters = new Map();
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && waiters.has(m.id)) { waiters.get(m.id)(m); waiters.delete(m.id); } };
const send = (method, params = {}) => new Promise(res => { const i = ++id; waiters.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async expr => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  const d = r.result?.exceptionDetails;
  if (d) throw new Error(d.exception?.description || d.text);
  return r.result?.result?.value;
};

await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable');
await send('DOM.enable'); await send('CSS.enable');
await send('Network.clearBrowserCache');
const go = async url => { await send('Page.navigate', { url }); await sleep(2600); };

/* ---------- 页面内注入：对比度计算 ---------- */
const INJECT = `(() => {
  const parse = s => {
    const m = String(s).match(/rgba?\\(([^)]+)\\)/);
    if (!m) return null;
    const p = m[1].split(',').map(x => parseFloat(x));
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const lum = c => {
    const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); };
    return .2126 * f(c.r) + .7152 * f(c.g) + .0722 * f(c.b);
  };
  const ratio = (a, b) => { const l1 = lum(a), l2 = lum(b); const hi = Math.max(l1, l2), lo = Math.min(l1, l2); return (hi + .05) / (lo + .05); };
  window.__poCandidates = el => {
    const cs = getComputedStyle(el);
    const fg = parse(cs.color);
    const out = [];
    const bg = parse(cs.backgroundColor);
    if (bg && bg.a > 0.55) out.push(bg);
    if (cs.backgroundImage && cs.backgroundImage !== 'none') {
      (cs.backgroundImage.match(/rgba?\\([^)]+\\)/g) || []).forEach(x => { const c = parse(x); if (c && c.a > 0.55) out.push(c); });
    }
    if (!out.length) out.push({ r: 255, g: 255, b: 255, a: 1 });
    return { fg, bgs: out, color: cs.color, background: cs.backgroundColor, image: cs.backgroundImage.slice(0, 60) };
  };
  window.__poWorst = el => {
    const { fg, bgs } = window.__poCandidates(el);
    if (!fg) return 99;
    return Math.min(...bgs.map(b => ratio(fg, b)));
  };
  return true;
})()`;

/* ---------- 页内收集：所有「看起来可点」的元素 ---------- */
const COLLECT = `(() => {
  const sel = 'button, a, [role="button"], .po-link, .po-tab, .po-date-chip, .po-way-card, .po-btn, .mp-close, .mp-x, .po-drawer-close, .po-sim-btns button, [data-cmp-pass], [data-cmp-reject], [data-finish], [data-compare], [data-cancel], [data-del-sku], [data-add-sku]';
  const els = [...document.querySelectorAll(sel)].filter(el => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 4 && r.height > 4 && cs.visibility !== 'hidden' && cs.display !== 'none' && !el.disabled && !el.classList.contains('po-btn-disabled');
  });
  return els.map((el, i) => {
    el.setAttribute('data-audit', String(i));
    const cs = getComputedStyle(el);
    return {
      i,
      tag: el.tagName.toLowerCase(),
      cls: el.className && String(el.className).slice(0, 70),
      text: (el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 24),
      normal: Math.round(window.__poWorst(el) * 100) / 100,
      color: cs.color, background: cs.backgroundColor
    };
  });
})()`;

const HOVER_OK = `(() => { const el = document.querySelector('[data-audit="' + __IDX__ + '"]'); if (!el) return null;
  const cs = getComputedStyle(el);
  return { hover: Math.round(window.__poWorst(el) * 100) / 100, color: cs.color, background: cs.backgroundColor, image: cs.backgroundImage.slice(0, 70) };
})()`;

let failures = [], checked = 0, skipped = 0, stateLog = [];
async function auditState(label) {
  await ev(INJECT);
  const items = await ev(COLLECT);
  if (!items.length) { stateLog.push([label, 0]); return; }
  const root = (await send('DOM.getDocument', { depth: -1 })).result.root;
  const nodeIds = (await send('DOM.querySelectorAll', { nodeId: root.nodeId, selector: '[data-audit]' })).result.nodeIds;
  stateLog.push([label, items.length]);
  for (const it of items) {
    const nodeId = nodeIds[it.i];
    if (!nodeId) { skipped++; continue; }
    await send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: ['hover'] });
    const h = await ev(HOVER_OK.replace('__IDX__', it.i));
    await send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: [] });
    checked++;
    if (!h) continue;
    const worst = Math.min(it.normal, h.hover);
    if (worst < THRESHOLD) {
      failures.push({ state: label, text: it.text || '(无文字)', cls: it.cls,
        normal: it.normal, hover: h.hover,
        normalColor: it.color, normalBg: it.background,
        hoverColor: h.color, hoverBg: h.background, hoverImg: h.image });
    }
  }
}

/* ---------- 走遍模块页面 ---------- */
await go(APP);
await ev(`document.querySelector('#poOrderNav').click()`); await sleep(600);
await auditState('第1层 订单列表');

/* 状态页签 / 售后页签 */
for (const [attr, val, label] of [['data-status-tab', 'done', '状态页签-已完成'], ['data-assale-tab', 'has', '售后页签-有售后']]) {
  await ev(`(() => { const b = document.querySelector('[${attr}="${val}"]'); if (b) b.click(); })()`); await sleep(400);
  await auditState('第1层 ' + label);
}
await ev(`(() => { document.querySelector('[data-status-tab="all"]').click(); document.querySelector('[data-assale-tab="all"]').click(); })()`); await sleep(400);

/* 第 2 层：打开第一张订单 */
await ev(`(() => { const r = document.querySelector('#purchaseOrderPage .po-order-table tbody tr [data-order-open]'); if (r) r.click(); })()`); await sleep(700);
await auditState('第2层 订单详情');
await ev(`(() => { const b = document.getElementById('poMoreToggle'); if (b) b.click(); })()`); await sleep(350);
await auditState('第2层 更多信息展开');

/* 抽屉：验收 / 验收详情 / 退货 / 售后 */
for (const [act, label] of [['data-line-accept', '验收弹层'], ['data-line-detail', '验收详情抽屉'], ['data-line-return', '退货抽屉'], ['data-line-aftersale', '售后详情抽屉']]) {
  const opened = await ev(`(() => { const b = document.querySelector('#poLinesBody [${act}]'); if (!b) return false; b.click(); return true; })()`);
  await sleep(500);
  if (opened) {
    await auditState(label);
    await ev(`(() => { const b = document.querySelector('.mp-drawer [data-close], .mp-drawer [data-ld-close], .mp-drawer [data-ac-cancel], .mp-drawer [data-rt-cancel], .mp-drawer [data-as-close], .mp-drawer .po-drawer-close'); if (b) b.click(); })()`);
    await sleep(400);
  }
}

/* 新建订单向导四步 */
await ev(`(() => { document.querySelectorAll('.mp-mask').forEach(x => x.remove()); document.querySelector('#poOrderNav').click(); })()`); await sleep(500);
await ev(`document.querySelector('#poNewBtn').click()`); await sleep(500);
await auditState('新建订单 第1步 选供应商');
await ev(`(() => { const w = document.getElementById('poWizardPage'); const c = w.querySelector('.po-sup-card'); if (c) c.click(); const n = document.getElementById('wizNext'); if (n) n.click(); })()`); await sleep(500);
await auditState('新建订单 第2步 送达日期与数量');
await ev(`document.getElementById('wizAddSku').click()`); await sleep(500);
await auditState('新建订单 添加商品抽屉');
await ev(`(() => { const b = document.querySelector('[data-pick-done]'); if (b) b.click(); })()`); await sleep(400);
await ev(`(() => { const n = document.getElementById('wizNext'); if (n) n.click(); })()`); await sleep(500);
await auditState('新建订单 第3步 总览');
await ev(`(() => { const n = document.getElementById('wizNext'); if (n) n.click(); })()`); await sleep(500);
await auditState('新建订单 第4步 收货与提交');

/* 已完成订单的详情（含锁定状态、售后记录） */
await ev(`(() => { document.querySelectorAll('.mp-mask').forEach(x => x.remove()); document.querySelector('#poOrderNav').click(); })()`);
await sleep(600);
await ev(`(() => { document.querySelector('[data-status-tab="done"]').click(); })()`); await sleep(400);
const openedDone = await ev(`(() => { const r = document.querySelector('#purchaseOrderPage .po-order-table tbody tr [data-order-open]'); if (!r) return false; r.click(); return true; })()`);
await sleep(700);
if (openedDone) {
  await auditState('第2层 订单详情（已完成）');
  await ev(`(() => { const b = document.getElementById('poMoreToggle'); if (b) b.click(); })()`); await sleep(350);
  await auditState('第2层 更多信息（已完成）');
}
/* 供货关系管理（V4.1 新增栏目） */
await ev(`(() => { document.querySelectorAll('.mp-mask').forEach(x => x.remove()); document.querySelector('#srNav').click(); })()`); await sleep(600);
await auditState('供货关系 列表');
await ev(`(() => { const c = document.getElementById('srIncludeOff'); if (c) { c.checked = true; c.dispatchEvent(new Event('change')); } })()`); await sleep(450);
await auditState('供货关系 包含已下架');
await ev(`(() => { const c = document.getElementById('srIncludeOff'); if (c) { c.checked = false; c.dispatchEvent(new Event('change')); } })()`); await sleep(400);
await ev(`(() => { const cb = document.querySelector('[data-sr-check="S0101"]'); if (cb) cb.click(); })()`); await sleep(400);
await auditState('供货关系 勾选后批量条');
await ev(`(() => { const b = document.getElementById('srClearSel'); if (b) b.click(); })()`); await sleep(350);

for (const [sku, label] of [['S1701', '单绑抽屉（形态匹配）'], ['S2801', '单绑抽屉（暂无报价）']]) {
  const opened = await ev(`(() => { const b = document.querySelector('[data-sr-bind="${sku}"]'); if (!b) return false; b.click(); return true; })()`);
  await sleep(500);
  if (opened) {
    await auditState('供货关系 ' + label);
    await ev(`(() => { const b = document.querySelector('.mp-drawer [data-sr-cancel]'); if (b) b.click(); })()`);
    await sleep(400);
  }
}
await ev(`document.querySelector('#srBatchForm').click()`); await sleep(500);
await auditState('供货关系 按形态批量绑定');
await ev(`(() => { const b = document.querySelector('.mp-drawer [data-sr-fb-cancel]'); if (b) b.click(); })()`);
await sleep(300);

ws.close();

/* ---------- 报告 ---------- */
console.log('\n各页面覆盖情况：');
stateLog.forEach(([s, n]) => console.log('  · ' + s + '：' + n + ' 个可点元素'));
console.log(`\n巡检元素 ${checked} 个（跳过 ${skipped}），阈值 < ${THRESHOLD} 视为「悬浮/常态看不清」：`);
if (!failures.length) console.log('  未发现对比度问题 ✅');
else {
  const byState = {};
  failures.forEach(f => { (byState[f.state] = byState[f.state] || []).push(f); });
  for (const [state, list] of Object.entries(byState)) {
    console.log(`\n[${state}] ${list.length} 处`);
    list.forEach(f => console.log(`  · 「${f.text}」 ${f.cls}\n      常态 ${f.normal} (${f.normalColor} on ${f.normalBg}) | hover ${f.hover} (${f.hoverColor} on ${f.hoverBg} ${f.hoverImg})`));
  }
}
process.exit(failures.length ? 1 : 0);
