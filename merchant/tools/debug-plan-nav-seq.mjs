/**
 * 栏目切换顺序回归：找出「点采购计划却跳到采购订单」的触发序列
 * 用法：CDP=http://127.0.0.1:9454 node tools/debug-plan-nav-seq.mjs
 */
const CDP = process.env.CDP || 'http://127.0.0.1:9454';
const APP = 'http://127.0.0.1:4201/' + encodeURIComponent('食联网数智餐饮平台-组织及人员.html');
const sleep = ms => new Promise(r => setTimeout(r, ms));

const list = await (await fetch(`${CDP}/json/list`)).json();
const ws = new WebSocket(list.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

let seq = 0;
const waiters = new Map();
ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && waiters.has(m.id)) { waiters.get(m.id)(m); waiters.delete(m.id); } };
const send = (method, params = {}) => new Promise(res => { const id = ++seq; waiters.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
const ev = async expression => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) return 'EVAL_ERROR: ' + (r.result.exceptionDetails.exception?.description || '').split('\n')[0];
  return r.result?.result?.value;
};

const state = () => ev(`(()=>{
  const vis=[...document.querySelectorAll('.page-view')].filter(p=>!p.hidden).map(p=>p.id);
  return { vis, bc:(document.querySelector('.breadcrumb')||{}).textContent.replace(/\\s+/g,' ').trim(),
           nav:[...document.querySelectorAll('.nav-child.active')].map(n=>n.textContent.trim()).join('|'),
           vpa:document.body.dataset.vpaView };
})()`);

const click = async id => { await ev(`(()=>{const n=document.querySelector('#${id}'); if(!n) return 'no ${id}'; n.click(); return 'ok';})()`); await sleep(900); };
const reload = async () => { await send('Page.navigate', { url: APP }); await sleep(2600); };

const cases = [
  ['冷启动 → 采购计划',                 async () => { await reload(); await click('purchasePlanNav'); }],
  ['再点一次采购计划',                   async () => { await click('purchasePlanNav'); }],
  ['采购订单 → 采购计划',                async () => { await click('poOrderNav'); await click('purchasePlanNav'); }],
  ['供货关系 → 采购计划',                async () => { await click('srNav'); await click('purchasePlanNav'); }],
  ['采购订单 → 供货关系 → 采购计划',      async () => { await click('poOrderNav'); await click('srNav'); await click('purchasePlanNav'); }],
  ['排餐计划 → 采购计划',                async () => { await click('mealPlanNav'); await click('purchasePlanNav'); }],
  ['热启动（localStorage 有数据）→ 采购计划', async () => { await reload(); await click('purchasePlanNav'); }],
];

console.log('用例'.padEnd(34), '| 可见页面 | 面包屑 | vpaView');
console.log('-'.repeat(110));
let bad = 0;
for (const [name, run] of cases) {
  await run();
  const s = await state();
  const ok = s.vis.length === 1 && s.vis[0] === 'purchasePlanPage';
  if (!ok) bad++;
  console.log(`${(ok ? 'OK  ' : 'FAIL')} ${name.padEnd(30)}| ${s.vis.join(',')} | ${s.bc} | ${s.vpa}`);
}
console.log(bad ? `\n${bad} 个用例异常` : '\n全部用例正常：点采购计划都停在采购计划');
ws.close();
process.exit(0);
