const CDP = process.env.CDP || 'http://127.0.0.1:9457';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const list = await (await fetch(`${CDP}/json/list`)).json();
const ws = new WebSocket(list.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let seq = 0; const w = new Map(); const fails = [];
ws.onmessage = e => { const m = JSON.parse(e.data);
  if (m.id && w.has(m.id)) { w.get(m.id)(m); w.delete(m.id); }
  if (m.method === 'Network.responseReceived' && m.params.response.status >= 400) fails.push(m.params.response.status + ' ' + decodeURIComponent(m.params.response.url.split('/').pop()));
  if (m.method === 'Network.loadingFailed') fails.push('FAILED ' + decodeURIComponent((m.params.url || '').split('/').pop() || '') + ' ' + m.params.errorText);
};
const send = (method, params = {}) => new Promise(res => { const id = ++seq; w.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
const ev = async x => { const r = await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true });
  return r.result?.exceptionDetails ? 'EVAL_ERROR ' + (r.result.exceptionDetails.exception?.description || '').split('\n')[0] : r.result?.result?.value; };

await send('Runtime.enable'); await send('Network.enable'); await send('Page.enable');
const url = 'https://weiyifu13757187351.github.io/smart-catering-recipe-prototype/merchant/食联网数智餐饮平台-组织及人员.html';
await send('Page.navigate', { url });
for (const t of [3, 6, 10, 15]) {
  await sleep(t === 3 ? 3000 : (t === 6 ? 3000 : (t === 10 ? 4000 : 5000)));
  console.log(`t=${t}s readyState=${await ev('document.readyState')} scripts=${await ev('document.scripts.length')} srcScripts=${await ev(`[...document.scripts].filter(s=>s.src).length`)} htmlLen=${await ev('document.documentElement.outerHTML.length')} nav=${await ev(`[...document.querySelectorAll('.nav-child')].map(n=>n.id||n.textContent.trim()).join('|')`)}`);
}
console.log('\nMerchantScope:', await ev('typeof window.MerchantScope'), '| MerchantPurchase:', await ev('typeof window.MerchantPurchase'), '| MerchantOrder:', await ev('typeof window.MerchantOrder'));
console.log('失败资源:', fails.length ? fails.slice(0, 10).join('\n') : '（无）');
const r = await ev(`(()=>{const n=document.querySelector('#purchasePlanNav'); if(!n) return 'NO_NAV'; n.click(); return 'clicked';})()`);
await sleep(1500);
console.log('点击结果:', r, '| 可见:', await ev(`[...document.querySelectorAll('.page-view')].filter(p=>!p.hidden).map(p=>p.id).join(',')`), '| 面包屑:', await ev(`document.querySelector('.breadcrumb').textContent.replace(/\\s+/g,' ').trim()`));
ws.close(); process.exit(0);
