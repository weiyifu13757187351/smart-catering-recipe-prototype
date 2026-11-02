/**
 * 用真实鼠标事件点「采购计划」，检查是否被挤到采购订单
 * 用法：CDP=http://127.0.0.1:9458 node tools/debug-real-click.mjs
 */
const CDP = process.env.CDP || 'http://127.0.0.1:9458';
const APP = process.env.APP_URL || 'http://127.0.0.1:4201/' + encodeURIComponent('食联网数智餐饮平台-组织及人员.html');
const sleep = ms => new Promise(r => setTimeout(r, ms));

const list = await (await fetch(`${CDP}/json/list`)).json();
const ws = new WebSocket(list.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let seq = 0; const w = new Map(); const errs = [];
ws.onmessage = e => { const m = JSON.parse(e.data);
  if (m.id && w.has(m.id)) { w.get(m.id)(m); w.delete(m.id); }
  if (m.method === 'Runtime.exceptionThrown') errs.push((m.params.exceptionDetails.exception?.description || '').split('\n')[0]);
};
const send = (method, params = {}) => new Promise(res => { const id = ++seq; w.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
const ev = async x => { const r = await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true });
  return r.result?.exceptionDetails ? 'EVAL_ERROR ' + (r.result.exceptionDetails.exception?.description || '').split('\n')[0] : r.result?.result?.value; };

await send('Runtime.enable'); await send('Page.enable');
await send('Page.navigate', { url: APP });
await sleep(4000);

const vis = () => ev(`[...document.querySelectorAll('.page-view')].filter(p=>!p.hidden).map(p=>p.id).join(',') + ' || ' + document.querySelector('.breadcrumb').textContent.replace(/\\s+/g,' ').trim()`);
console.log('初始：', await vis());

async function realClick(sel) {
  const box = await ev(`(()=>{const n=document.querySelector('${sel}'); if(!n) return null; const r=n.getBoundingClientRect(); return {x:r.left+r.width/2, y:r.top+r.height/2};})()`);
  if (!box) return 'NO_TARGET ' + sel;
  for (const type of ['mousePressed', 'mouseReleased']) {
    await send('Input.dispatchMouseEvent', { type, x: box.x, y: box.y, button: 'left', clickCount: 1 });
  }
  return `clicked ${sel} @${Math.round(box.x)},${Math.round(box.y)}`;
}

console.log(await realClick('#purchasePlanNav'));
await sleep(1200);
console.log('点采购计划后：', await vis());

// 再补一次真实点击序列：采购订单 → 采购计划
console.log(await realClick('#poOrderNav'));
await sleep(1000);
console.log('点采购订单后：', await vis());
console.log(await realClick('#purchasePlanNav'));
await sleep(2000);
console.log('再点采购计划后（等 2s）：', await vis());

console.log('异常：', errs.length ? errs.slice(0, 5).join(' | ') : '（无）');
ws.close(); process.exit(0);
