/**
 * 复现「在采购计划里发生一次范围切换（setStall）就被挤到采购订单」
 * 用法：CDP=http://127.0.0.1:9459 node tools/repro-scope-hijack.mjs
 */
const CDP = process.env.CDP || 'http://127.0.0.1:9459';
const APP = process.env.APP_URL || 'http://127.0.0.1:4201/' + encodeURIComponent('食联网数智餐饮平台-组织及人员.html');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const list = await (await fetch(`${CDP}/json/list`)).json();
const ws = new WebSocket(list.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let seq = 0; const w = new Map();
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && w.has(m.id)) { w.get(m.id)(m); w.delete(m.id); } };
const send = (method, params = {}) => new Promise(res => { const id = ++seq; w.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
const ev = async x => { const r = await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true });
  return r.result?.exceptionDetails ? 'EVAL_ERROR ' + (r.result.exceptionDetails.exception?.description || '').split('\n')[0] : r.result?.result?.value; };
const vis = () => ev(`[...document.querySelectorAll('.page-view')].filter(p=>!p.hidden).map(p=>p.id).join(',') + ' || ' + document.querySelector('.breadcrumb').textContent.replace(/\\s+/g,' ').trim()`);

await send('Runtime.enable'); await send('Page.enable');
await send('Page.navigate', { url: APP });
await sleep(4000);

console.log('初始：            ', await vis());
await ev(`document.querySelector('#purchasePlanNav').click()`); await sleep(1000);
console.log('点采购计划后：     ', await vis());

const stalls = await ev(`(()=>{const s=window.MerchantScope; if(!s) return null; const org=s.current().orgId; return {org, stalls:(s.stallsOf(org)||[]).map(x=>x.id+':'+x.name)};})()`);
console.log('当前范围：         ', JSON.stringify(stalls));

const target = stalls && stalls.stalls.length ? stalls.stalls[0].split(':')[0] : null;
if (target) {
  console.log(`\n模拟在采购计划页发生范围切换 setStall(${target}) …`);
  await ev(`window.MerchantScope.setStall('${target}')`);
  await sleep(1200);
  console.log('切换后可见页面：   ', await vis());
}

// 再试一次 clearStall / setOrg
const org = stalls && stalls.org;
if (org) {
  await ev(`document.querySelector('#purchasePlanNav').click()`); await sleep(800);
  console.log('\n回到采购计划：     ', await vis());
  await ev(`window.MerchantScope.setOrg('${org}', { stall: true })`);
  await sleep(1200);
  console.log('setOrg 后可见：    ', await vis());
}
ws.close(); process.exit(0);
