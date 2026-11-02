/**
 * 采购管理标注冒烟（CDP，无第三方依赖）
 * 前置：本地静态服务 4201；Chrome 以 --remote-debugging-port=9333 启动。
 * 用法：node tools/anno-smoke-po.mjs
 *
 * 覆盖视图：po-list → po-detail → po-accept → po-accept-detail → po-finish-diff / po-sign
 *            → po-return → po-as-detail → sr-list → sr-bind → sr-batch-form
 */
import fs from 'node:fs';

const CDP = process.env.CDP || 'http://127.0.0.1:9333';
const PORT = process.env.PO_PORT || '4201';
const BASE = process.env.PO_BASE || `http://127.0.0.1:${PORT}/`;
const APP = BASE + encodeURIComponent('食联网数智餐饮平台-组织及人员.html');
const OUT = process.env.SHOT_DIR || '_shots-anno';

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function connect() {
  for (let i = 0; i < 40; i++) {
    try {
      const list = await (await fetch(`${CDP}/json/list`)).json();
      const page = list.find(t => t.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch { /* 还没起来 */ }
    await sleep(250);
  }
  throw new Error('CDP 未就绪');
}

let ws, seq = 0;
const pending = new Map();

function send(method, params = {}) {
  const id = ++seq;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((res, rej) => {
    pending.set(id, { res, rej });
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); rej(new Error(method + ' timeout')); } }, 20000);
  });
}

async function evalJs(expression) {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails.exception?.description || r.exceptionDetails));
  return r.result.value;
}

async function shot(name) {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  fs.mkdirSync(OUT, { recursive: true });
  const p = `${OUT}/${name}.png`;
  fs.writeFileSync(p, Buffer.from(r.data, 'base64'));
  return p;
}

const report = [];
function log(...a) { console.log(...a); report.push(a.join(' ')); }

async function openView(label, expectView, action) {
  if (action) await evalJs(action);
  await sleep(700);
  const d = await evalJs(`(async()=>{ await window.VitaminAnnotations.ready;
    const d = window.VitaminAnnotations.diagnostics();
    return { view: document.body.dataset.vpaView, current: d.current||null,
      visible: (d.annotations||[]).filter(a=>a.state==='visible').length,
      readable: (d.annotations||[]).filter(a=>a.state==='visible'||a.state==='readable').length,
      hidden: (d.annotations||[]).filter(a=>a.state==='hidden').length,
      missingTarget: (d.annotations||[]).filter(a=>a.state==='missing-target').map(a=>a.moduleName||a.id),
      missingView: (d.annotations||[]).filter(a=>a.state==='missing-view').map(a=>a.moduleName||a.id),
      ambiguous: (d.annotations||[]).filter(a=>a.state==='ambiguous').map(a=>a.moduleName||a.id),
      badges: document.querySelectorAll('[class*=anno-badge],[id*=anno-badge]').length };
  })()`);
  const ok = expectView ? d.view === expectView : true;
  log(`${ok ? 'OK  ' : 'FAIL'} ${label} → view=${d.view}${expectView && !ok ? ` (期望 ${expectView})` : ''}  visible=${d.visible} hidden=${d.hidden} missingTarget=${JSON.stringify(d.missingTarget)} missingView=${JSON.stringify(d.missingView)} ambiguous=${JSON.stringify(d.ambiguous)}`);
  return d;
}

(async () => {
  const url = await connect();
  ws = new WebSocket(url);
  await new Promise(r => ws.addEventListener('open', r));
  ws.addEventListener('message', ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const { res, rej } = pending.get(m.id); pending.delete(m.id);
      m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result);
    }
  });

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Page.navigate', { url: APP });
  await sleep(2500);
  log('== 打开原型 ==');

  // 采购订单列表
  await openView('采购订单列表', 'po-list', `document.querySelector('#poOrderNav').click()`);
  await shot('01-po-list');

  // 订单详情（选一张「验收中」的单：PO-A4 直采）
  await openView('订单详情（验收中）', 'po-detail',
    `(()=>{const rows=[...document.querySelectorAll('[data-order-open]')];
      const t=rows.find(r=>{const tr=r.closest('tr');return tr&&tr.textContent.includes('验收中');});
      (t||rows[0]).click();})()`);
  await shot('02-po-detail');

  // 行级验收抽屉
  await openView('行级验收抽屉', 'po-accept', `document.querySelector('[data-line-accept]').click()`);
  await shot('03-po-accept');
  await evalJs(`document.querySelector('[data-ac-cancel]').click()`);
  await sleep(500);

  // 验收详情
  await openView('验收详情抽屉', 'po-accept-detail', `document.querySelector('[data-line-detail]').click()`);
  await shot('04-po-accept-detail');
  await evalJs(`document.querySelector('[data-dacc-close]')?.click(); document.querySelector('.mp-close')?.click()`);
  await sleep(500);

  // 验收完成（差异原因 / 签名）
  const hasFinish = await evalJs(`!!document.querySelector('#poFinishBtn.enabled, #poFinishBtn:not([disabled])')`);
  if (hasFinish) {
    await openView('验收完成 · 差异原因 or 签名', 'po-finish-diff', `document.querySelector('#poFinishBtn').click()`);
    await shot('05-po-finish-diff');
    const isDiff = await evalJs(`!!document.querySelector('[data-diff-reason]')`);
    if (isDiff) {
      await evalJs(`(()=>{const btns=[...document.querySelectorAll('[data-diff-reason]')];
        btns.forEach(b=>{b.value='其他';b.dispatchEvent(new Event('change',{bubbles:true}));});
        document.querySelectorAll('[data-diff-other]').forEach(i=>{i.value='原型标注测试';});})()`);
      await openView('验收完成 · 电子签名', 'po-sign', `document.querySelector('[data-diff-next]').click()`);
      await shot('06-po-sign');
    }
    await evalJs(`document.querySelector('.mp-close')?.click()`);
    await sleep(400);
  } else {
    log('SKIP 验收完成（当前订单不是「验收中」或未全部验收）');
  }

  // 已完成订单上的退货 / 售后详情
  await evalJs(`document.querySelector('#poBackList').click()`);
  await sleep(600);
  await openView('订单详情（已完成）', 'po-detail',
    `(()=>{const rows=[...document.querySelectorAll('[data-order-open]')];
      const t=rows.find(r=>{const tr=r.closest('tr');return tr&&tr.textContent.includes('已完成');});
      (t||rows[0]).click();})()`);
  const hasReturn = await evalJs(`!!document.querySelector('[data-line-return]')`);
  if (hasReturn) {
    await openView('发起退货', 'po-return', `document.querySelector('[data-line-return]').click()`);
    await shot('07-po-return');
    await evalJs(`document.querySelector('[data-rt-cancel]').click()`);
    await sleep(400);
  } else { log('SKIP 发起退货（该单无可退行）'); }

  const hasAs = await evalJs(`!!document.querySelector('[data-line-aftersale]')`);
  if (hasAs) {
    await openView('售后详情', 'po-as-detail', `document.querySelector('[data-line-aftersale]').click()`);
    await shot('08-po-as-detail');
    await evalJs(`document.querySelector('[data-as-close]')?.click()`);
    await sleep(400);
  } else { log('SKIP 售后详情（该单无售后记录）'); }

  // 供货关系管理
  await openView('供货关系管理', 'sr-list', `document.querySelector('#srNav').click()`);
  await shot('09-sr-list');

  await openView('选择供应商抽屉', 'sr-bind', `document.querySelector('[data-sr-bind]').click()`);
  await shot('10-sr-bind');
  await evalJs(`document.querySelector('[data-sr-cancel]').click()`);
  await sleep(400);

  await openView('按形态批量绑定', 'sr-batch-form', `document.querySelector('#srBatchForm').click()`);
  await shot('11-sr-batch-form');
  await evalJs(`document.querySelector('[data-sr-fb-cancel]').click()`);
  await sleep(400);

  // 回到列表做一次刷新一致性检查
  await evalJs(`document.querySelector('#poOrderNav').click()`);
  await sleep(600);
  const finalView = await evalJs(`document.body.dataset.vpaView`);
  log(`== 结束，当前视图 ${finalView} ==`);

  fs.writeFileSync(`${OUT}/report.txt`, report.join('\n'), 'utf8');
  ws.close();
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
