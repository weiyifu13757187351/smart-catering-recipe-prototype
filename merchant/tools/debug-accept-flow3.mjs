const CDP = process.env.CDP || 'http://127.0.0.1:9469';
const APP = 'http://127.0.0.1:4201/' + encodeURIComponent('食联网数智餐饮平台-组织及人员.html');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const list = await (await fetch(`${CDP}/json/list`)).json();
const ws = new WebSocket(list.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let seq = 0; const w = new Map();
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && w.has(m.id)) { w.get(m.id)(m); w.delete(m.id); } };
const send = (m2, p = {}) => new Promise(res => { const id = ++seq; w.set(id, res); ws.send(JSON.stringify({ id, method: m2, params: p })); });
const ev = async x => { const r = await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true });
  return r.result?.exceptionDetails ? 'EVAL_ERROR ' + (r.result.exceptionDetails.exception?.description || '').split('\n')[0] : r.result?.result?.value; };

await send('Runtime.enable'); await send('Page.enable');
await send('Page.navigate', { url: APP });
await sleep(4200);
await ev(`document.querySelector('#poOrderNav').click()`); await sleep(900);
await ev(`(()=>{const r=[...document.querySelectorAll('[data-order-open]')].find(x=>x.closest('tr').textContent.includes('验收中')); if(r) r.click();})()`);
await sleep(900);

const state = () => ev(`(()=>{const o=window.MerchantOrder.list().find(x=>document.body.querySelector('.po-head')&&document.body.querySelector('.po-head').textContent.includes(x.no));
  const head=document.body.querySelector('.po-head').textContent.replace(/\\s+/g,' ').trim().slice(0,40);
  const rows=[...document.querySelectorAll('.po-lines-table tbody tr')].map(tr=>tr.children[1].textContent.trim()+':'+tr.children[9].textContent.trim());
  return {head, rows, finishDisabled:(document.querySelector('#poFinishBtn')||{}).disabled, view:document.body.dataset.vpaView};})()`);
const toast = () => ev(`(()=>{const t=document.querySelector('.toast.show, .toast'); return t?t.textContent.trim():'';})()`);

console.log('初始 =', JSON.stringify(await state()));

// 逐个未满行补验收
for (const sku of ['S1701', 'S2501']) {
  const opened = await ev(`(()=>{const b=document.querySelector('[data-line-accept="${sku}"]'); if(!b) return false; b.click(); return true;})()`);
  await sleep(900);
  console.log(`\n[${sku}] 打开验收抽屉 = ${opened} view=${await ev('document.body.dataset.vpaView')}`);
  if (!opened) continue;
  const info = await ev(`(()=>{const s=document.querySelector('.po-accept-sum'); return s?s.textContent.replace(/\\s+/g,' ').trim():'';})()`);
  console.log('  汇总 =', info);
  // 取「待验收」数量（把 1 补满、或故意少 1）
  const pending = Number((info.match(/待验收\s*([\d.]+)/) || [])[1] || 1);
  const qty = sku === 'S2501' && pending >= 2 ? pending - 1 : pending;
  await ev(`(()=>{const q=document.querySelector('#poAcceptQty'); q.value='${qty}'; q.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await sleep(300);
  console.log('  填入 =', qty, '| 回显 =', await ev(`(()=>{const s=document.querySelector('.po-accept-sum'); return s?s.textContent.replace(/\\s+/g,' ').trim():'';})()`));
  await ev(`document.querySelector('[data-ac-save]').click()`);
  await sleep(1200);
  console.log('  toast =', await toast(), '| view =', await ev('document.body.dataset.vpaView'));
  console.log('  保存后 =', JSON.stringify(await state()));
}

// 验收完成 → 差异 → 签名
await ev(`(()=>{const b=document.querySelector('#poFinishBtn'); if(b && !b.disabled) b.click();})()`);
await sleep(1200);
console.log('\n点验收完成后 view =', await ev('document.body.dataset.vpaView'));
console.log('差异抽屉里有 select =', await ev(`document.querySelectorAll('[data-diff-reason]').length`));
const opts = await ev(`(()=>{const s=document.querySelector('[data-diff-reason]'); return s?[...s.options].map(o=>o.value+':'+o.textContent).join('|'):'none';})()`);
console.log('差异原因选项 =', opts);
ws.close(); process.exit(0);
