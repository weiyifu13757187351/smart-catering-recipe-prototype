const CDP = process.env.CDP || 'http://127.0.0.1:9466';
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
const click = async (sel, ms2 = 800) => { const ok = await ev(`(()=>{const n=document.querySelector('${sel}'); if(n){n.click(); return true;} return false;})()`); await sleep(ms2); return ok; };

await send('Runtime.enable'); await send('Page.enable');
await send('Page.navigate', { url: APP });
await sleep(4200);

await click('#poOrderNav', 1000);
await ev(`(()=>{const r=[...document.querySelectorAll('[data-order-open]')].find(x=>x.closest('tr').textContent.includes('验收中')); if(r) r.click();})()`);
await sleep(1000);
console.log('订单详情 view =', await ev('document.body.dataset.vpaView'));
console.log('商品行数 =', await ev(`document.querySelectorAll('.po-lines-table tbody tr').length`));
console.log('可验收行 =', await ev(`[...document.querySelectorAll('[data-line-accept]')].map(b=>b.getAttribute('data-line-accept')).join(',')`));
console.log('验收完成按钮 disabled =', await ev(`(()=>{const b=document.querySelector('#poFinishBtn'); return b ? b.disabled : 'no-btn';})()`));

// 打开第一行验收，看看输入与保存按钮
await click('[data-line-accept]', 900);
console.log('\n抽屉 view =', await ev('document.body.dataset.vpaView'));
console.log('qty input attrs =', await ev(`(()=>{const q=document.querySelector('#poAcceptQty'); if(!q) return 'none'; return JSON.stringify({id:q.id, value:q.value, max:q.max, placeholder:q.placeholder, type:q.type});})()`));
console.log('保存按钮 =', await ev(`[...document.querySelectorAll('.mp-drawer button')].map(b=>(b.getAttribute('data-ac-save')!==null?'[ac-save]':'')+b.textContent.trim()).join(' | ')`));
console.log('汇总文案 =', await ev(`(()=>{const s=document.querySelector('.po-accept-sum'); return s?s.textContent.replace(/\\s+/g,' ').trim():'none';})()`));

// 正确填法：逐字符派发 input 事件
await ev(`(()=>{const q=document.querySelector('#poAcceptQty'); q.value=''; q.dispatchEvent(new Event('input',{bubbles:true})); q.value='20'; q.dispatchEvent(new Event('input',{bubbles:true})); q.dispatchEvent(new Event('change',{bubbles:true}));})()`);
await sleep(500);
console.log('填 20 后汇总 =', await ev(`(()=>{const s=document.querySelector('.po-accept-sum'); return s?s.textContent.replace(/\\s+/g,' ').trim():'none';})()`));
await click('[data-ac-save]', 1200);
console.log('保存后 view =', await ev('document.body.dataset.vpaView'));
const no = await ev(`(()=>{const t=document.querySelector('.po-head h2, .po-head'); return t?t.textContent.replace(/\\s+/g,' ').trim().slice(0,60):'';})()`);
console.log('页头 =', no);
console.log('剩余可验收行 =', await ev(`[...document.querySelectorAll('[data-line-accept]')].length`));
console.log('验收完成 disabled =', await ev(`(()=>{const b=document.querySelector('#poFinishBtn'); return b ? b.disabled : 'no-btn';})()`));
console.log('提示条 =', await ev(`(()=>{const h=document.querySelector('.po-accept-head'); return h?h.textContent.replace(/\\s+/g,' ').trim():'none';})()`));
ws.close(); process.exit(0);
