/**
 * 复现「第一次点采购计划却跳到采购订单」并抓调用栈
 * 用法：CDP=http://127.0.0.1:9453 node tools/debug-plan-nav.mjs
 */
const CDP = process.env.CDP || 'http://127.0.0.1:9453';
const sleep = ms => new Promise(r => setTimeout(r, ms));

const list = await (await fetch(`${CDP}/json/list`)).json();
const page = list.find(t => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

let seq = 0;
const waiters = new Map();
ws.onmessage = ev => {
  const m = JSON.parse(ev.data);
  if (m.id && waiters.has(m.id)) { waiters.get(m.id)(m); waiters.delete(m.id); }
};
const send = (method, params = {}) => new Promise(res => { const id = ++seq; waiters.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
const evaluate = async expression => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'eval error');
  return r.result?.result?.value;
};

await send('Runtime.enable');
await send('Page.enable');
const APP = 'http://127.0.0.1:4201/' + encodeURIComponent('食联网数智餐饮平台-组织及人员.html');
await send('Page.navigate', { url: APP });
await sleep(3000);

console.log('加载完成，body.dataset.vpaView =', await evaluate('document.body.dataset.vpaView'));
console.log('初始可见页面 =', await evaluate(`[...document.querySelectorAll('.page-view')].filter(p=>!p.hidden).map(p=>p.id)`));

// 埋点：记录所有 .page-view 的 hidden 变化与调用栈
await evaluate(`
  (() => {
    window.__hiddenLog = [];
    const d = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'hidden');
    Object.defineProperty(HTMLElement.prototype, 'hidden', {
      configurable: true,
      get: d.get,
      set(v) {
        try {
          if (this.classList && this.classList.contains('page-view')) {
            window.__hiddenLog.push((v ? 'HIDE ' : 'SHOW ') + this.id + ' << ' +
              (new Error().stack || '').split('\\n').slice(1, 5).map(s => s.trim()).join(' << '));
          }
        } catch (e) {}
        return d.set.call(this, v);
      }
    });
    return 'instrumented';
  })()
`);

// 第一次点「采购计划」
await evaluate(`document.querySelector('#purchasePlanNav').click()`);
await sleep(1200);

console.log('\n=== 点击采购计划后 ===');
console.log('可见页面 =', await evaluate(`[...document.querySelectorAll('.page-view')].filter(p=>!p.hidden).map(p=>p.id)`));
console.log('面包屑 =', await evaluate(`document.querySelector('.breadcrumb').textContent.trim()`));
console.log('导航高亮 =', await evaluate(`[...document.querySelectorAll('.nav-child.active')].map(n=>n.textContent.trim())`));
console.log('vpaView =', await evaluate('document.body.dataset.vpaView'));
console.log('\n=== hidden 变化调用栈 ===');
const log = await evaluate('window.__hiddenLog.slice(0, 12)');
(log || []).forEach(l => console.log(' -', l));

ws.close();
process.exit(0);
