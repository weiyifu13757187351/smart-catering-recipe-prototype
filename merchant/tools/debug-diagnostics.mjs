const CDP = process.env.CDP || 'http://127.0.0.1:9462';
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
await sleep(4000);
await ev(`document.querySelector('#poOrderNav').click()`);
await sleep(1200);

console.log('API keys =', await ev(`Object.keys(window.VitaminAnnotations || {})`));
const d = await ev(`JSON.stringify(window.VitaminAnnotations.diagnostics(), null, 1).slice(0, 1200)`);
console.log('diagnostics =', d);
console.log('\nvpaView =', await ev(`document.body.dataset.vpaView`));
console.log('badge 元素数 =', await ev(`document.querySelectorAll('[class*="anno"], [data-anno-badge]').length`));
console.log('toolbar 存在 =', await ev(`!!document.querySelector('.va-toolbar, #vaToolbar, [class*="toolbar"]')`));
ws.close(); process.exit(0);
