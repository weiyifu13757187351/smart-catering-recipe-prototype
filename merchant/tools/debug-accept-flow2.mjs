const CDP = process.env.CDP || 'http://127.0.0.1:9467';
const APP = 'http://127.0.0.1:4201/' + encodeURIComponent('食联网数智餐饮平台-组织及人员.html');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const list = await (await fetch(`${CDP}/json/list`)).json();
const ws = new WebSocket(list.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let seq = 0; const w = new Map(); const errs = [];
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && w.has(m.id)) { w.get(m.id)(m); w.delete(m.id); }
  if (m.method === 'Runtime.exceptionThrown') errs.push((m.params.exceptionDetails.exception?.description || '').split('\n')[0]); };
const send = (m2, p = {}) => new Promise(res => { const id = ++seq; w.set(id, res); ws.send(JSON.stringify({ id, method: m2, params: p })); });
const ev = async x => { const r = await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true });
  return r.result?.exceptionDetails ? 'EVAL_ERROR ' + (r.result.exceptionDetails.exception?.description || '').split('\n')[0] : r.result?.result?.value; };
const click = async (sel, ms2 = 900) => { const ok = await ev(`(()=>{const n=document.querySelector('${sel}'); if(n){n.click(); return true;} return false;})()`); await sleep(ms2); return ok; };
const toast = () => ev(`(()=>{const t=document.querySelector('.toast, #toast, .mp-toast'); return t?t.textContent.trim():'';})()`);

await send('Runtime.enable'); await send('Page.enable');
await send('Page.navigate', { url: APP });
await sleep(4200);
await click('#poOrderNav', 1000);
await ev(`(()=>{const r=[...document.querySelectorAll('[data-order-open]')].find(x=>x.closest('tr').textContent.includes('验收中')); if(r) r.click();})()`);
await sleep(1000);

const orderNo = await ev(`document.querySelector('[data-order-open]') ? '' : ''`);
const st = await ev(`(()=>{const o = window.MerchantOrder.__debug.findOrder(document.querySelector('.po-head h2, .po-head').textContent.match(/PO\\d+/)?.[0] || '');
  if(!o) return 'no-order';
  return o.items.map(i=>({sku:i.skuCode, qty:i.qty, shipped:i.shippedQty, acc:i.acceptedQty})); })()`);
console.log('订单行长这样 =', JSON.stringify(st));

// 用 debug API 的 showOrder 打开（保证拿到订单对象）
const dbg = await ev(`(()=>{ const D=window.MerchantOrder.__debug; const nos = D && D.showList ? null : null;
  const all = window.MerchantOrder.list(); const o = all.find(x=>x.status==='acc'); return o ? {no:o.no, items:o.items.map(i=>({sku:i.skuCode, qty:i.qty, shipped:i.shippedQty, acc:i.acceptedQty}))} : null; })()`);
console.log('验收中订单 =', JSON.stringify(dbg));

const first = dbg && dbg.items.find(i => Number(i.acc||0) < Number(i.shipped||0));
console.log('需要补验收的行 =', JSON.stringify(first));

if (first) {
  await click(`[data-line-accept="${first.sku}"]`, 900);
  console.log('抽屉 view =', await ev('document.body.dataset.vpaView'), '| 待补齐 =', await ev(`(()=>{const s=document.querySelector('.po-accept-sum'); return s?s.textContent.replace(/\\s+/g,' ').trim():'';})()`));
  const need = Number(first.shipped||0) - Number(first.acc||0);
  await ev(`(()=>{const q=document.querySelector('#poAcceptQty'); q.value='${need}'; q.dispatchEvent(new Event('input',{bubbles:true})); q.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await sleep(400);
  console.log('填 ' + need + ' 后汇总 =', await ev(`(()=>{const s=document.querySelector('.po-accept-sum'); return s?s.textContent.replace(/\\s+/g,' ').trim():'';})()`));
  await click('[data-ac-save]', 1400);
  console.log('保存后 toast =', await toast());
  console.log('保存后 view =', await ev('document.body.dataset.vpaView'));
  const after = await ev(`(()=>{const o=window.MerchantOrder.list().find(x=>x.no==='${dbg.no}'); return o?{status:o.status, items:o.items.map(i=>i.skuCode+':'+i.acceptedQty)}:null;})()`);
  console.log('保存后订单 =', JSON.stringify(after));
  console.log('验收完成 disabled =', await ev(`(()=>{const b=document.querySelector('#poFinishBtn'); return b?b.disabled:'no-btn';})()`));
}
console.log('异常 =', errs.length ? errs.slice(0,4).join(' | ') : '（无）');
ws.close(); process.exit(0);
