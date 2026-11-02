/**
 * 单张证据图：第 2 步按日期「复制 / 粘贴」商品清单（CDP）
 * 用法（Chrome 已在 9333 起）：$env:PO_PORT='4201'; node tools/po-shot-copypaste.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const CDP = 'http://127.0.0.1:9333';
const PORT = process.env.PO_PORT || '4201';
const BASE = process.env.PO_BASE || ('http://127.0.0.1:' + PORT + '/');
const APP = BASE + encodeURIComponent('食联网数智餐饮平台-组织及人员.html');
const OUT = fileURLToPath(new URL('./shots-v2/', import.meta.url));
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
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && waiters.has(m.id)) { waiters.get(m.id)(m); waiters.delete(m.id); } };
const send = (method, params = {}) => new Promise(res => { const id = ++seq; waiters.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
const evaluate = async expr => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text);
  return r.result?.result?.value;
};

await send('Runtime.enable');
await send('Page.enable');
await send('Page.navigate', { url: APP });
await sleep(2600);
mkdirSync(OUT, { recursive: true });

const state = await evaluate(`(() => {
  const dayStr = o => { const d = new Date(); d.setDate(d.getDate() + o); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const d1 = dayStr(1), d2 = dayStr(2);
  document.getElementById('poOrderNav').click();
  document.getElementById('poNewBtn').click();
  document.querySelector('.mp-drawer [data-way="direct"]').click();
  document.querySelector('#poWizardPage .po-sup-card').click();
  document.getElementById('wizNext').click();
  const t = document.getElementById('wizTo'); t.value = d2; t.dispatchEvent(new Event('change', { bubbles: true }));
  const f = document.getElementById('wizFrom'); f.value = d1; f.dispatchEvent(new Event('change', { bubbles: true }));
  const addOn = (day, kwi, name, qty, note) => {
    document.querySelector('#poWizardPage [data-day-tab="' + day + '"]').click();
    document.getElementById('wizAddSku').click();
    const k = document.getElementById('poPickKw'); k.value = kwi; k.dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('poPickSearch').click();
    const row = [...document.querySelectorAll('#poPickList tbody tr')].find(r => r.textContent.includes(name));
    const q = row.querySelector('[data-pick-qty]'); q.value = String(qty); q.dispatchEvent(new Event('input', { bubbles: true }));
    if (note) { const nb = row.querySelector('[data-pick-note]'); nb.value = note; nb.dispatchEvent(new Event('input', { bubbles: true })); }
    row.querySelector('[data-add-sku]').click();
    document.querySelector('[data-pick-done]').click();
  };
  addOn(d1, '黄瓜', '鲜黄瓜', 5, '切段');
  addOn(d1, '鸡蛋', '鲜鸡蛋', 3);
  addOn(d1, '小葱', '鲜小葱', 2, '要嫩的');
  /* 复制第 1 天 → 切到第 2 天粘贴 */
  document.getElementById('poDayCopy').click();
  document.querySelector('#poWizardPage [data-day-tab="' + d2 + '"]').click();
  document.getElementById('poDayPaste').click();
  return { day: d2, rows: document.querySelectorAll('#poWizardPage .po-day-table tbody tr').length,
           qty: [...document.querySelectorAll('#poWizardPage [data-day-qty]')].map(i => i.value),
           toast: (document.querySelector('.toast') || {}).textContent || '' };
})()`);

await sleep(500);
const r = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync(`${OUT}10f-按日期复制粘贴.png`, Buffer.from(r.result.data, 'base64'));
console.log('shot 10f-按日期复制粘贴.png', JSON.stringify(state));
ws.close();
