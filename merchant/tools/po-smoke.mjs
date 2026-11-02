/**
 * 采购订单原型冒烟脚本（CDP，无第三方依赖）
 * 前置：本地静态服务跑在 4174，Chrome 以 --remote-debugging-port=9333 启动。
 * 用法：node tools/po-smoke.mjs
 */
const CDP = 'http://127.0.0.1:9333';
const APP = 'http://127.0.0.1:4174/' + encodeURIComponent('食联网数智餐饮平台-组织及人员.html');

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

const wsUrl = await connect();
const ws = new WebSocket(wsUrl);
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
  if (msg.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(msg.params.type)) {
    errors.push(`${msg.params.type.toUpperCase()} ` + msg.params.args.map(a => a.value ?? a.description ?? '').join(' '));
  }
};
const send = (method, params = {}) => new Promise(res => {
  const id = ++seq;
  waiters.set(id, res);
  ws.send(JSON.stringify({ id, method, params }));
});

async function evaluate(expression) {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) {
    throw new Error(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text);
  }
  return r.result?.result?.value;
}

await send('Runtime.enable');
await send('Page.enable');
await send('Network.enable');
await send('Network.clearBrowserCache');
await send('Page.navigate', { url: APP });
await sleep(2500);

const results = [];
const step = async (name, expression) => {
  try {
    const value = await evaluate(expression);
    results.push({ name, ok: true, value });
    console.log(`OK   ${name} → ${JSON.stringify(value)}`);
  } catch (e) {
    results.push({ name, ok: false, error: String(e.message || e) });
    console.log(`FAIL ${name} → ${String(e.message || e)}`);
  }
};

await step('导航注入（采购管理 / 采购订单 / 询价单）', `(() => {
  const items = [...document.querySelectorAll('.nav-child')].map(n => n.textContent.trim());
  return { hasParent: !!document.getElementById('purchaseMgmtParent'), items };
})()`);

await step('进入采购订单列表', `(() => {
  document.getElementById('poOrderNav').click();
  const page = document.getElementById('purchaseOrderPage');
  return { visible: !page.hidden, rows: page.querySelectorAll('.po-table tbody tr').length,
           stats: [...page.querySelectorAll('.po-stat b')].map(b => b.textContent.trim()).slice(0,3) };
})()`);

await step('打开第一张订单详情', `(() => {
  const btn = document.querySelector('#purchaseOrderPage [data-open-order]');
  btn.click();
  const page = document.getElementById('purchaseOrderPage');
  const heads = [...page.querySelectorAll('.po-section > header h3')].map(h => h.textContent.trim());
  return { heads, hasDaily: page.innerHTML.includes('每日需求') };
})()`);

await step('待验收订单可打开验收抽屉', `(() => {
  window.MerchantOrder.enter();
  const o = window.MerchantOrder.list().find(x => x.status === 'toReceive');
  window.MerchantOrder.__debug.openAccept(o.id);
  const t = document.getElementById('mpDrawerTitle')?.textContent || '';
  const method = document.querySelector('.po-method label.on')?.textContent.trim() || '';
  const scaleDisabled = document.querySelector('.po-method label.off') ? true : false;
  return { title: t, method, scaleDisabled, rows: document.querySelectorAll('[data-accept]').length };
})()`);

await step('少收必须填差异原因（保存被拦）', `(() => {
  const o = window.MerchantOrder.list().find(x => x.status === 'toReceive');
  window.MerchantOrder.__debug.openAccept(o.id);
  const input = document.querySelector('[data-accept]');
  input.value = String(Math.max(0, Number(input.value) - 1));
  input.dispatchEvent(new Event('input', { bubbles: true }));
  const before = window.MerchantOrder.list().find(x => x.id === o.id).accepts.length;
  document.getElementById('accSave').click();
  const after = window.MerchantOrder.list().find(x => x.id === o.id).accepts.length;
  return { blocked: after === before, toast: document.getElementById('toast')?.textContent || '' };
})()`);

await step('保存验收量（填原因后留痕）', `(() => {
  const o = window.MerchantOrder.list().find(x => x.status === 'toReceive');
  const inp = document.querySelector('[data-accept]');
  const sel = document.querySelector('[data-reason="' + inp.dataset.accept + '"]');
  sel.value = '数量短缺';
  sel.dispatchEvent(new Event('change', { bubbles: true }));
  document.getElementById('accSave').click();
  const after = window.MerchantOrder.list().find(x => x.id === o.id);
  return { status: after.status, acceptCount: after.accepts.length, changeNo: after.accepts.at(-1)?.changeNo, method: after.accepts.at(-1)?.method };
})()`);

await step('超量验收被阻断', `(() => {
  const o = window.MerchantOrder.list().find(x => x.status === 'accepted');
  window.MerchantOrder.__debug.openAccept(o.id);
  const inputs = [...document.querySelectorAll('[data-accept]')];
  const it = o.items[0];
  const inp = inputs.find(i => i.dataset.accept === it.skuCode);
  inp.value = String(Number(it.shippedQty) + 5);
  inp.dispatchEvent(new Event('input', { bubbles: true }));
  document.getElementById('accSave').click();
  const same = window.MerchantOrder.list().find(x => x.id === o.id);
  return { acceptCountUnchanged: same.accepts.length === o.accepts.length, toast: document.getElementById('toast')?.textContent || '' };
})()`);

await step('验收完成缺签名被阻断', `(() => {
  const o = window.MerchantOrder.list().find(x => x.status === 'accepted');
  window.MerchantOrder.__debug.openAccept(o.id);
  document.getElementById('accFinish').click();
  const sig = document.getElementById('poSig');
  return { sigOpened: !!sig, okBtn: !!document.getElementById('poSigOk') };
})()`);

await step('签名后验收完成并锁定', `(() => {
  const cv = document.getElementById('poSig');
  const ctx = cv.getContext('2d');
  ctx.strokeStyle = '#123';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(30, 60); ctx.lineTo(120, 120); ctx.stroke();
  cv.dispatchEvent(new PointerEvent('pointerdown', { clientX: 40, clientY: 70, bubbles: true, pointerId: 1 }));
  cv.dispatchEvent(new PointerEvent('pointermove', { clientX: 150, clientY: 130, bubbles: true, pointerId: 1 }));
  document.getElementById('poSigOk').click();
  const o = window.MerchantOrder.list().find(x => x.status === 'done');
  return { done: !!o, final: o?.accepts.at(-1)?.final, hasSig: !!(o?.accepts.at(-1)?.sig || '').startsWith('data:image') };
})()`);

await step('询价单列表', `(() => {
  document.getElementById('poInquiryNav').click();
  const page = document.getElementById('purchaseInquiryPage');
  return { visible: !page.hidden, rows: page.querySelectorAll('.po-table tbody tr').length };
})()`);

await step('询价单详情 → 一键最低价 → 定标自动生单', `(() => {
  const before = window.MerchantOrder.list().length;
  document.querySelector('#purchaseInquiryPage [data-open-inq]').click();
  document.getElementById('inqLowest').click();
  const estText = [...document.querySelectorAll('.po-award-bar .po-note')].map(e => e.textContent).join('|');
  document.getElementById('inqAward').click();
  const after = window.MerchantOrder.list().length;
  const inq = window.MerchantOrder.inquiries()[0];
  return { created: after - before, status: inq.status, generated: inq.generatedOrders.length, estText: estText.slice(0, 60) };
})()`);

await step('新建直采向导（方式选择 → 供应商 → 需求区间）', `(() => {
  document.getElementById('poOrderNav').click();
  document.getElementById('poNewBtn').click();
  const way = !!document.getElementById('wayDirect');
  document.getElementById('wayDirect').click();
  const wiz = document.getElementById('poWizardPage');
  const step1 = wiz.textContent.includes('选择供应商');
  wiz.querySelector('[data-sup]').click();
  wiz.querySelector('#wizNext').click();
  const step2 = !!wiz.querySelector('#wizFrom');
  wiz.querySelector('#wizAdd').click();
  document.querySelector('.mp-drawer [data-add]').click();
  const qty = wiz.querySelector('[data-qty]');
  qty.value = '3';
  qty.dispatchEvent(new Event('change', { bubbles: true }));
  return { way, step1, step2, rowsAfterAdd: wiz.querySelectorAll('[data-qty]').length,
           sum: wiz.querySelector('.po-sum-row')?.innerText.replace(/\\s+/g, ' ') };
})()`);

await step('直采提交生成订单', `(() => {
  const wiz = document.getElementById('poWizardPage');
  wiz.querySelector('#wizNext').click();               /* → 总览 */
  const ov = wiz.querySelectorAll('.po-ov-row').length;
  wiz.querySelector('#wizNext').click();               /* → 收货与提交 */
  const before = window.MerchantOrder.list().length;
  wiz.querySelector('#wizSubmit').click();
  const after = window.MerchantOrder.list().length;
  const o = window.MerchantOrder.list().at(-1);
  return { overviewRows: ov, created: after - before, no: o?.no, source: o?.source, status: o?.status,
           daily: o?.items[0]?.daily, detailShown: !!document.querySelector('.po-detail-head') };
})()`);

await step('档口开关开启 → 新建订单快照为「需手动确认」', `(() => {
  window.MerchantOrder.enter();
  document.getElementById('poAcceptSwitchBtn').click();
  const switchOn = document.getElementById('poSwitchBox').checked;
  document.getElementById('poNewBtn').click();
  document.getElementById('wayDirect').click();
  const wiz = document.getElementById('poWizardPage');
  wiz.querySelector('[data-sup]').click();
  wiz.querySelector('#wizNext').click();
  wiz.querySelector('#wizAdd').click();
  document.querySelector('.mp-drawer [data-add]').click();
  const q = wiz.querySelector('[data-qty]');
  q.value = '2';
  q.dispatchEvent(new Event('change', { bubbles: true }));
  wiz.querySelector('#wizNext').click();
  wiz.querySelector('#wizNext').click();
  wiz.querySelector('#wizSubmit').click();
  const o = window.MerchantOrder.list().at(-1);
  return { switchOn, no: o.no, manualConfirm: o.manualConfirm, status: o.status };
})()`);

await step('改单进入待确认且不立即生效', `(() => {
  const o = window.MerchantOrder.list().at(-1);
  const qtyBefore = o.items[0].qty;
  window.MerchantOrder.__debug.simAction('modify', o);
  const dw = document.querySelector('.mp-drawer');
  const inp = dw.querySelector('[data-f="qty"]');
  inp.value = String(Number(inp.value) + 1);
  dw.querySelector('#simSubmit').click();
  const after = window.MerchantOrder.list().at(-1);
  return { pending: after.changes.at(-1).status, itemsNotApplied: after.items[0].qty === qtyBefore,
           banner: !!document.querySelector('.po-banner'), tag: document.querySelector('.po-tag.warn')?.textContent };
})()`);

await step('打回 → 再改 → 同意（生效版本切换）', `(() => {
  const o = window.MerchantOrder.list().at(-1);
  document.querySelector('[data-act="reject"]').click();
  const needReason = !!document.getElementById('rejectReason');
  document.getElementById('rjSubmit').click();
  const blocked = window.MerchantOrder.list().at(-1).changes.at(-1).status === 'pending';
  document.getElementById('rejectReason').value = '单价偏高，请按协议价重报';
  document.getElementById('rjSubmit').click();
  const rejected = window.MerchantOrder.list().at(-1).changes.at(-1).status;
  window.MerchantOrder.__debug.simAction('modify', o);
  const dw = document.querySelector('.mp-drawer');
  const price = dw.querySelector('[data-f="price"]');
  price.value = String(Number(price.value) + 1);
  dw.querySelector('#simSubmit').click();
  const again = window.MerchantOrder.list().at(-1);
  const newPending = again.changes.at(-1).status;
  document.querySelector('[data-act="cmp"]').click();
  const cmpOpened = !!document.querySelector('.mp-drawer .po-cmp');
  const summary = document.querySelector('.mp-drawer .po-note')?.textContent || '';
  document.getElementById('cmpApprove').click();
  const fin = window.MerchantOrder.list().at(-1);
  return { needReason, blocked, rejected, newPending, cmpOpened,
           summaryHasDiff: /改数量|改价/.test(summary),
           approved: fin.changes.at(-1).status,
           appliedPrice: fin.items[0].price === again.changes.at(-1).after[0].price };
})()`);

await step('退货：提交 → 供应商同意 → 明细标记退货', `(() => {
  const o = window.MerchantOrder.list().find(x => x.status === 'accepted' && x.accepts.length);
  window.MerchantOrder.__debug.openReturn(o.id);
  const box = document.querySelector('.mp-drawer [data-pick]');
  box.click();
  document.getElementById('retSubmit').click();
  const mid = window.MerchantOrder.list().find(x => x.id === o.id);
  const pending = mid.returns.at(-1).status;
  window.MerchantOrder.__debug.simAction('agreeReturn', mid);
  const done = window.MerchantOrder.list().find(x => x.id === o.id);
  return { pending, afterAgree: done.returns.at(-1).status, orderStatus: done.status,
           returnQtyMarked: done.items.some(i => i.returnQty > 0) };
})()`);

await step('变更：供应商改单（开关关→自动确认）', `(() => {
  window.MerchantOrder.enter();
  const o = window.MerchantOrder.list().find(x => x.status === 'wait' || x.status === 'confirmed');
  window.MerchantOrder.__debug.simAction('modify', o);
  const inp = document.querySelector('tr[data-sku] [data-f="qty"]');
  inp.value = String(Math.max(1, Number(inp.value) - 1));
  document.getElementById('simSubmit').click();
  const after = window.MerchantOrder.list().find(x => x.id === o.id);
  return { changes: after.changes.length, lastStatus: after.changes.at(-1).status };
})()`);

const fatal = errors.filter(e => !/favicon|Failed to load resource/i.test(e));
console.log('\n--- 控制台异常 ---');
console.log(fatal.length ? fatal.slice(0, 12).join('\n') : '（无）');

const failed = results.filter(r => !r.ok);
console.log(`\n通过 ${results.length - failed.length}/${results.length} 步；控制台异常 ${fatal.length} 条`);
ws.close();
process.exitCode = failed.length || fatal.length ? 1 : 0;
