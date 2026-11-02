/**
 * 线上复现：点「采购计划」是否跳到「采购订单」，并收集控制台异常
 * 用法：CDP=http://127.0.0.1:9455 node tools/debug-plan-nav-live.mjs
 */
const CDP = process.env.CDP || 'http://127.0.0.1:9455';
const APP = process.env.APP_URL ||
  'https://weiyifu13757187351.github.io/smart-catering-recipe-prototype/merchant/' +
  encodeURIComponent('食联网数智餐饮平台-组织及人员.html');
const sleep = ms => new Promise(r => setTimeout(r, ms));

const list = await (await fetch(`${CDP}/json/list`)).json();
const ws = new WebSocket(list.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

let seq = 0;
const waiters = new Map();
const errors = [];
ws.onmessage = e => {
  const m = JSON.parse(e.data);
  if (m.id && waiters.has(m.id)) { waiters.get(m.id)(m); waiters.delete(m.id); }
  if (m.method === 'Runtime.exceptionThrown') errors.push('EXCEPTION ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text || '').split('\n')[0]);
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push('CONSOLE ' + m.params.args.map(a => a.value ?? a.description ?? '').join(' '));
  if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') errors.push('LOG ' + m.params.entry.text);
};
const send = (method, params = {}) => new Promise(res => { const id = ++seq; waiters.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
const ev = async expression => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) return 'EVAL_ERROR: ' + (r.result.exceptionDetails.exception?.description || '').split('\n')[0];
  return r.result?.result?.value;
};

await send('Runtime.enable');
await send('Log.enable');
await send('Page.enable');
console.log('打开线上：', APP);
await send('Page.navigate', { url: APP });
await sleep(5000);

console.log('已加载资源版本：', await ev(`[...document.scripts].filter(s=>/annotation|purchase-order|meal-plan|scope/.test(s.src)).map(s=>s.src.split('/').pop()).join(' , ')`));
console.log('初始可见页面：', await ev(`[...document.querySelectorAll('.page-view')].filter(p=>!p.hidden).map(p=>p.id)`));

// 埋点：记录 scope 事件与 page-view 显隐
await ev(`
  (() => {
    window.__log = [];
    const S = window.MerchantScope;
    if (S) {
      ['setOrg','setStall','clearStall'].forEach(k => {
        const o = S[k];
        S[k] = (...a) => { window.__log.push('CALL ' + k + '(' + a.join(',') + ')'); const r = o.apply(S, a); window.__log.push('DONE ' + k); return r; };
      });
    }
    const d = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'hidden');
    Object.defineProperty(HTMLElement.prototype, 'hidden', {
      configurable: true, get: d.get,
      set(v) { try { if (this.classList && this.classList.contains('page-view')) window.__log.push((v?'HIDE ':'SHOW ')+this.id+' | '+(new Error().stack||'').split('\\n')[2].trim()); } catch(e){} return d.set.call(this, v); }
    });
    return 'ok';
  })()
`);

await ev(`document.querySelector('#purchasePlanNav').click()`);
await sleep(1500);
const s1 = await ev(`(()=>({vis:[...document.querySelectorAll('.page-view')].filter(p=>!p.hidden).map(p=>p.id),bc:document.querySelector('.breadcrumb').textContent.replace(/\\s+/g,' ').trim(),vpa:document.body.dataset.vpaView}))()`);
console.log('\n点采购计划后：', JSON.stringify(s1, null, 1));

await sleep(2500);
const s2 = await ev(`(()=>({vis:[...document.querySelectorAll('.page-view')].filter(p=>!p.hidden).map(p=>p.id),bc:document.querySelector('.breadcrumb').textContent.replace(/\\s+/g,' ').trim(),vpa:document.body.dataset.vpaView}))()`);
console.log('再等 2.5s 后：', JSON.stringify(s2, null, 1));

console.log('\n=== 事件日志 ===');
(await ev('window.__log.slice(0,25)') || []).forEach(l => console.log(' -', l));
console.log('\n=== 控制台异常 ===');
console.log(errors.length ? errors.slice(0, 12).join('\n') : '（无）');
ws.close();
process.exit(0);
