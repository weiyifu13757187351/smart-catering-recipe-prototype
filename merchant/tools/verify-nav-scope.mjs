/**
 * 栏目/范围切换回归：任何栏目里切换组织或档口，都不许把用户挤到「采购订单」
 * 用法：CDP=http://127.0.0.1:9460 node tools/verify-nav-scope.mjs
 */
const CDP = process.env.CDP || 'http://127.0.0.1:9460';
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
const visIds = () => ev(`[...document.querySelectorAll('.page-view')].filter(p=>!p.hidden).map(p=>p.id).join(',')`);
const click = async id => { await ev(`document.querySelector('#${id}').click()`); await sleep(900); };
const waitReady = async (limit = 60000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < limit) {
    const ready = await ev(`typeof window.MerchantOrder === 'object' && typeof window.MerchantScope === 'object' && !!document.querySelector('#purchasePlanNav') && !!document.querySelector('#poOrderNav')`);
    if (ready === true) return true;
    await sleep(1000);
  }
  return false;
};
const reload = async () => {
  await send('Page.navigate', { url: APP });
  await sleep(Number(process.env.LOAD_WAIT || 3800));
  return waitReady();
};

await send('Runtime.enable'); await send('Page.enable');
await reload();

const org = await ev(`window.MerchantScope.current().orgId`);
const stall = await ev(`(window.MerchantScope.stallsOf('${org}')||[]).map(s=>s.id)[0]`);

const cases = [
  ['采购计划 → 切档口', 'purchasePlanNav', `window.MerchantScope.setStall('${stall}')`, 'purchasePlanPage'],
  ['采购计划 → 换组织', 'purchasePlanNav', `window.MerchantScope.setOrg('${org}', { stall: true })`, 'purchasePlanPage'],
  ['排餐计划 → 切档口', 'mealPlanNav', `window.MerchantScope.setStall('${stall}')`, 'mealPlanPage'],
  ['采购订单 → 切档口', 'poOrderNav', `window.MerchantScope.setStall('${stall}')`, 'purchaseOrderPage'],
  ['供货关系 → 切档口', 'srNav', `window.MerchantScope.setStall('${stall}')`, 'supplyRelationPage'],
  ['采购订单 → 采购计划', 'purchasePlanNav', null, 'purchasePlanPage'],
];

let bad = 0;
console.log('用例'.padEnd(26), '| 期望页面 | 实际可见 | 结论');
console.log('-'.repeat(92));
for (const [name, nav, scopeExpr, expect] of cases) {
  await ev(`document.querySelector('#${nav}').click()`); await sleep(900);
  if (scopeExpr) { await ev(scopeExpr); await sleep(1100); }
  const got = await visIds();
  const ok = got === expect;
  if (!ok) bad++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name.padEnd(22)}| ${expect.padEnd(20)}| ${got.padEnd(24)}| ${ok ? '通过' : '异常'}`);
}

// 采购订单列表本身是否仍随档口刷新（不能修过头）
await ev(`document.querySelector('#poOrderNav').click()`); await sleep(900);
const beforeRows = await ev(`document.querySelectorAll('.po-order-table tbody tr').length`);
await ev(`window.MerchantScope.setStall('${stall}')`); await sleep(1000);
const afterRows = await ev(`document.querySelectorAll('.po-order-table tbody tr').length`);
const stillList = await visIds();
console.log(`\n采购订单列表仍可渲染：可见=${stillList} 行数 ${beforeRows} → ${afterRows}`);

console.log('\n异常：', errs.length ? errs.slice(0, 5).join(' | ') : '（无）');
console.log(bad ? `\n${bad} 个用例异常` : '\n全部通过：切换范围不再跳栏目');
ws.close(); process.exit(bad ? 1 : 0);


