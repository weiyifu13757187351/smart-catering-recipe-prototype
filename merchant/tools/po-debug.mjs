/**
 * 直采向导逐步调试：打印每一步 DOM 状态，定位空元素。
 * 前置：本地 4174 服务 + Chrome CDP 9333。
 */
const CDP = 'http://127.0.0.1:9333';
const APP = 'http://127.0.0.1:4174/' + encodeURIComponent('食联网数智餐饮平台-组织及人员.html');
const sleep = ms => new Promise(r => setTimeout(r, ms));

const list = await (await fetch(`${CDP}/json/list`)).json();
const page = list.find(t => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let seq = 0; const waiters = new Map();
ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && waiters.has(m.id)) { waiters.get(m.id)(m); waiters.delete(m.id); } };
const send = (method, params = {}) => new Promise(res => { const id = ++seq; waiters.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
const evaluate = async expr => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) return { __error: r.result.exceptionDetails.exception?.description };
  return r.result?.result?.value;
};

await send('Runtime.enable');
await send('Page.enable');
await send('Network.enable');
await send('Network.clearBrowserCache');
await send('Page.navigate', { url: APP });
await sleep(2500);

const probe = async (label, expr) => console.log(label, JSON.stringify(await evaluate(expr)));

await probe('1 打开列表', `(() => { document.getElementById('poOrderNav').click();
  return { rows: document.querySelectorAll('#purchaseOrderPage .po-table tbody tr').length }; })()`);
await probe('2 点新建', `(() => { document.getElementById('poNewBtn').click();
  return { wayDirect: !!document.getElementById('wayDirect'), drawer: !!document.getElementById('mpMask'), title: document.getElementById('mpDrawerTitle')?.textContent }; })()`);
await probe('3 选直采', `(() => { document.getElementById('wayDirect').click();
  const w = document.getElementById('poWizardPage');
  return { wizardPage: !!w, hidden: w?.hidden, steps: w?.querySelectorAll('.po-step').length,
           supps: w?.querySelectorAll('[data-sup]').length, next: !!w?.querySelector('#wizNext'),
           text: (w?.innerText || '').slice(0, 120) }; })()`);
await probe('4 选供应商', `(() => { const w = document.getElementById('poWizardPage');
  w.querySelector('[data-sup]').click();
  return { on: w.querySelectorAll('.po-supplier.on').length, next: !!w.querySelector('#wizNext') }; })()`);
await probe('5 下一步', `(() => { const w = document.getElementById('poWizardPage');
  w.querySelector('#wizNext').click();
  return { from: !!w.querySelector('#wizFrom'), add: !!w.querySelector('#wizAdd'), days: w.querySelectorAll('[data-day]').length,
           text: (w.innerText || '').slice(0, 160) }; })()`);
await probe('6 开添加商品', `(() => { const w = document.getElementById('poWizardPage');
  w.querySelector('#wizAdd').click();
  const mask = document.getElementById('mpMask');
  return { maskShow: mask?.classList.contains('show'), addBtns: document.querySelectorAll('[data-add]').length,
           title: document.getElementById('mpDrawerTitle')?.textContent }; })()`);
await probe('7 添加一个商品', `(() => { document.querySelector('[data-add]').click();
  const w = document.getElementById('poWizardPage');
  return { qtyInputs: w.querySelectorAll('[data-qty]').length, maskShow: document.getElementById('mpMask')?.classList.contains('show') }; })()`);
await probe('8 填数量', `(() => { const w = document.getElementById('poWizardPage');
  const q = w.querySelector('[data-qty]');
  q.value = '3'; q.dispatchEvent(new Event('change', { bubbles: true }));
  const w2 = document.getElementById('poWizardPage');
  return { rows: w2.querySelectorAll('[data-qty]').length, sumText: w2.querySelector('.po-sum-row')?.innerText,
           next: !!w2.querySelector('#wizNext') }; })()`);
await probe('9 到总览', `(() => { document.getElementById('poWizardPage').querySelector('#wizNext').click();
  const w = document.getElementById('poWizardPage');
  return { ovRows: w.querySelectorAll('.po-ov-row').length, next: !!w.querySelector('#wizNext'), text: (w.innerText||'').slice(0,120) }; })()`);
await probe('10 到收货', `(() => { document.getElementById('poWizardPage').querySelector('#wizNext').click();
  const w = document.getElementById('poWizardPage');
  return { submit: !!w.querySelector('#wizSubmit'), addr: !!w.querySelector('#rcAddr') }; })()`);
await probe('11 提交', `(() => { const before = window.MerchantOrder.list().length;
  document.getElementById('poWizardPage').querySelector('#wizSubmit').click();
  const o = window.MerchantOrder.list().at(-1);
  return { created: window.MerchantOrder.list().length - before, no: o?.no, daily: o?.items[0]?.daily }; })()`);
ws.close();
