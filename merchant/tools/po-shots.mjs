/**
 * 采购订单原型截图：CDP 抓取关键界面 PNG，便于视觉检查。
 * 前置：本地 4174 服务 + Chrome CDP 9333。输出到 tools/shots/。
 */
import { mkdirSync, writeFileSync } from 'node:fs';

const CDP = 'http://127.0.0.1:9333';
const APP = 'http://127.0.0.1:4174/' + encodeURIComponent('食联网数智餐饮平台-组织及人员.html');
const OUT = new URL('./shots/', import.meta.url);
mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));

const list = await (await fetch(`${CDP}/json/list`)).json();
const target = list.find(t => t.type === 'page');
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let seq = 0; const waiters = new Map();
ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && waiters.has(m.id)) { waiters.get(m.id)(m); waiters.delete(m.id); } };
const send = (method, params = {}) => new Promise(res => { const id = ++seq; waiters.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
const evaluate = async expr => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;

await send('Runtime.enable');
await send('Page.enable');
await send('Network.enable');
await send('Network.clearBrowserCache');
await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: APP });
await sleep(2500);

async function shot(name, height = 1000) {
  await send('Emulation.setDeviceMetricsOverride', { width: 1600, height, deviceScaleFactor: 1, mobile: false });
  await sleep(320);
  const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  const file = new URL(`./${name}.png`, OUT);
  writeFileSync(file, Buffer.from(r.result.data, 'base64'));
  console.log(`shot ${name}.png`);
}

await evaluate(`document.getElementById('poOrderNav').click()`);
await shot('01-订单列表', 1180);

await evaluate(`document.querySelector('#purchaseOrderPage [data-open-order]').click()`);
await shot('02-订单详情', 2500);

await evaluate(`(() => { window.MerchantOrder.enter();
  const o = window.MerchantOrder.list().find(x => x.status === 'toReceive') || window.MerchantOrder.list().find(x => x.accepts.length);
  window.MerchantOrder.__debug.openAccept(o.id); })()`);
await shot('03-验收抽屉', 1050);

await evaluate(`(() => { document.getElementById('accCancel')?.click();
  document.getElementById('poInquiryNav').click();
  document.querySelector('#purchaseInquiryPage [data-open-inq]').click(); })()`);
await shot('04-询价单详情', 1900);

await evaluate(`(() => { document.getElementById('inqLowest')?.click(); })()`);
await shot('05-比价定标', 1200);

await evaluate(`(() => { document.getElementById('poOrderNav').click();
  document.getElementById('poNewBtn').click();
  document.getElementById('wayDirect').click();
  const w = document.getElementById('poWizardPage');
  w.querySelector('[data-sup]').click();
  w.querySelector('#wizNext').click();
  w.querySelector('#wizAdd').click();
  document.querySelector('.mp-drawer [data-add]').click();
  const q = w.querySelector('[data-qty]');
  q.value = '4'; q.dispatchEvent(new Event('change', { bubbles: true }));
  w.querySelector('#wizFrom').value = '2026-10-27';
  w.querySelector('#wizFrom').dispatchEvent(new Event('change', { bubbles: true })); })()`);
await shot('06-新建向导-需求', 1150);

await evaluate(`(() => { const w = document.getElementById('poWizardPage');
  w.querySelector('#wizTo').value = '2026-10-30';
  w.querySelector('#wizTo').dispatchEvent(new Event('change', { bubbles: true }));
  const days = w.querySelectorAll('[data-day]');
  days[2]?.click();
  const q = w.querySelector('[data-qty]'); q.value = '6'; q.dispatchEvent(new Event('change', { bubbles: true })); })()`);
await shot('07-多日需求', 1150);

await evaluate(`(() => { const w = document.getElementById('poWizardPage');
  w.querySelector('#wizNext').click(); })()`);
await shot('08-总览', 1100);

await evaluate(`(() => { window.MerchantOrder.enter();
  const o = window.MerchantOrder.list().find(x => x.status === 'wait');
  const live = window.MerchantOrder.__debug.findOrder(o.id);
  live.manualConfirm = true;
  window.MerchantOrder.__debug.simAction('modify', live);
  const dw = document.querySelector('.mp-drawer');
  const ip = dw.querySelector('[data-f="price"]');
  ip.value = String(Number(ip.value) + 3);
  dw.querySelector('#simSubmit').click();
  document.querySelector('[data-act="cmp"]').click(); })()`);
await shot('09-变更对比', 1050);

await evaluate(`(() => { document.getElementById('cmpReject')?.click();
  window.MerchantOrder.enter();
  const o = window.MerchantOrder.list().find(x => x.accepts.length && x.status !== 'done') ||
            window.MerchantOrder.list().find(x => x.accepts.length);
  window.MerchantOrder.__debug.openAccept(o.id); })()`);
await shot('10-验收记录与历史', 1100);

await evaluate(`(() => { document.getElementById('accCancel')?.click();
  window.MerchantOrder.__debug.openSignature(() => {});
  const cv = document.getElementById('poSig');
  const pts = [[60,110],[110,70],[150,120],[200,80],[250,115],[300,90]];
  cv.dispatchEvent(new PointerEvent('pointerdown', { clientX: pts[0][0], clientY: pts[0][1], bubbles: true, pointerId: 1 }));
  pts.slice(1).forEach(([x, y]) => cv.dispatchEvent(new PointerEvent('pointermove', { clientX: x, clientY: y, bubbles: true, pointerId: 1 })));
  cv.dispatchEvent(new PointerEvent('pointerup', { clientX: 300, clientY: 90, bubbles: true, pointerId: 1 })); })()`);
await shot('11-电子签名', 700);

await evaluate(`(() => { document.getElementById('poSigCancel')?.click();
  window.MerchantOrder.enter();
  const o = window.MerchantOrder.list().find(x => x.status === 'accepted' && x.accepts.length);
  window.MerchantOrder.__debug.openReturn(o.id); })()`);
await shot('12-退货', 900);

ws.close();
