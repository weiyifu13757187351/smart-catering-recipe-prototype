/**
 * 线上角标抽查：采购订单 / 供货关系两个栏目是否各自挂上标注
 * 用法：CDP=... APP_URL=... node tools/verify-live-badges.mjs
 */
const CDP = process.env.CDP || 'http://127.0.0.1:9477';
const APP = process.env.APP_URL || 'http://127.0.0.1:4201/' + encodeURIComponent('食联网数智餐饮平台-组织及人员.html');
const sleep = ms => new Promise(r => setTimeout(r, ms));

const list = await (await fetch(`${CDP}/json/list`)).json();
const ws = new WebSocket(list.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

let seq = 0; const w = new Map();
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && w.has(m.id)) { w.get(m.id)(m); w.delete(m.id); } };
const send = (m2, p = {}) => new Promise(res => { const id = ++seq; w.set(id, res); ws.send(JSON.stringify({ id, method: m2, params: p })); });
const ev = async x => {
  const r = await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) return null;
  return r.result?.result?.value;
};

const QUERY = `(()=>{ const d = window.VitaminAnnotations.diagnostics();
  const mine = d.annotations.filter(a => a.key.startsWith('merchant-purchase-mgmt:'));
  const by = {}; mine.forEach(a => { by[a.status] = (by[a.status] || 0) + 1; });
  return { view: document.body.dataset.vpaView, by, missing: mine.filter(a => /missing/.test(a.status)).length }; })()`;

await send('Runtime.enable'); await send('Page.enable');
await send('Page.navigate', { url: APP });

const t0 = Date.now();
let ready = false;
while (Date.now() - t0 < 90000) {
  if (await ev(`typeof window.MerchantOrder === 'object' && !!document.querySelector('#poOrderNav') && !!window.VitaminAnnotations`) === true) { ready = true; break; }
  await sleep(1200);
}
console.log(`页面就绪：${ready}（${Math.round((Date.now() - t0) / 1000)}s）`);

async function snap(label, navSel, wantView, wantBadges) {
  await ev(`document.querySelector('${navSel}').click()`);
  let d = null;
  for (let i = 0; i < 15 && !d; i++) { await sleep(1000); d = await ev(QUERY); }
  if (!d) { console.log(`FAIL ${label}：取不到 diagnostics`); return false; }
  const ok = d.view === wantView && (d.by.visible || 0) === wantBadges && !d.missing;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label} → view=${d.view} 角标=${d.by.visible || 0}/${wantBadges} 可读=${d.by.readable || 0} missing=${d.missing}`);
  return ok;
}

const a = await snap('采购订单列表', '#poOrderNav', 'po-list', 4);
const b = await snap('供货关系管理', '#srNav', 'sr-list', 4);
console.log(a && b ? '\n线上角标抽查通过' : '\n线上角标抽查不符预期');
ws.close();
process.exit(a && b ? 0 : 1);
