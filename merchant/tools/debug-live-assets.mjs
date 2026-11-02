/**
 * 线上页面体检：脚本/样式是否 404，导航项是否存在，点采购计划会发生什么
 * 用法：CDP=http://127.0.0.1:9456 node tools/debug-live-assets.mjs
 */
const CDP = process.env.CDP || 'http://127.0.0.1:9456';
const APP = 'https://weiyifu13757187351.github.io/smart-catering-recipe-prototype/merchant/' +
  encodeURIComponent('食联网数智餐饮平台-组织及人员.html');
const sleep = ms => new Promise(r => setTimeout(r, ms));

const list = await (await fetch(`${CDP}/json/list`)).json();
const ws = new WebSocket(list.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

let seq = 0; const waiters = new Map(); const netFail = []; const errors = [];
ws.onmessage = e => {
  const m = JSON.parse(e.data);
  if (m.id && waiters.has(m.id)) { waiters.get(m.id)(m); waiters.delete(m.id); }
  if (m.method === 'Network.responseReceived' && m.params.response.status >= 400) netFail.push(`${m.params.response.status} ${m.params.response.url.split('/').pop()}`);
  if (m.method === 'Runtime.exceptionThrown') errors.push('EXC ' + (m.params.exceptionDetails.exception?.description || '').split('\n')[0]);
};
const send = (method, params = {}) => new Promise(res => { const id = ++seq; waiters.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
const ev = async x => {
  const r = await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) return 'EVAL_ERROR: ' + (r.result.exceptionDetails.exception?.description || '').split('\n')[0];
  return r.result?.result?.value;
};

await send('Runtime.enable'); await send('Network.enable'); await send('Page.enable');
await send('Page.navigate', { url: APP });
await sleep(6000);

console.log('title =', await ev('document.title'));
console.log('href  =', await ev('location.href'));
console.log('脚本数 =', await ev('document.scripts.length'));
console.log('脚本 src =', await ev(`[...document.scripts].map(s=>s.src.replace(location.origin+'/','')).join('\\n')`));
console.log('\n4xx/5xx 资源：', netFail.length ? netFail.join('\n') : '（无）');
console.log('\n导航项 =', await ev(`[...document.querySelectorAll('.nav-child')].map(n=>n.id||n.textContent.trim()).join(' | ')`));
console.log('计划管理菜单存在 =', await ev(`!!document.querySelector('#purchasePlanNav')`));
console.log('MerchantPurchase 模块 =', await ev(`typeof window.MerchantPurchase`));
console.log('MerchantScope =', await ev(`typeof window.MerchantScope`));

const before = await ev(`[...document.querySelectorAll('.page-view')].filter(p=>!p.hidden).map(p=>p.id).join(',')`);
await ev(`(()=>{const n=document.querySelector('#purchasePlanNav'); if(!n) return 'NO_NAV'; n.click(); return 'clicked';})()`);
await sleep(1500);
const after = await ev(`[...document.querySelectorAll('.page-view')].filter(p=>!p.hidden).map(p=>p.id).join(',')`);
console.log(`\n点采购计划前可见 = ${before}\n点采购计划后可见 = ${after}`);
console.log('面包屑 =', await ev(`document.querySelector('.breadcrumb').textContent.replace(/\\s+/g,' ').trim()`));
console.log('\n异常 =', errors.length ? errors.slice(0, 8).join('\n') : '（无）');
ws.close(); process.exit(0);
