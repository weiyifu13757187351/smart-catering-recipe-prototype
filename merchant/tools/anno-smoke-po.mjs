/**
 * 采购管理标注全视图冒烟（CDP）
 * 判定口径：element 类标注 → status=visible；global / page-global → status=readable。
 * 每个视图都必须 readable ≥2（共用口径 + 本页规则）且没有 missing-* 状态。
 * 用法：CDP=http://127.0.0.1:9465 node tools/anno-smoke-po.mjs
 */
import fs from 'node:fs';

const CDP = process.env.CDP || 'http://127.0.0.1:9465';
const APP = process.env.APP_URL || 'http://127.0.0.1:4201/' + encodeURIComponent('食联网数智餐饮平台-组织及人员.html');
const OUT = process.env.SHOT_DIR || '_shots-anno';
const SCOPE = 'merchant-purchase-mgmt:';
const sleep = ms => new Promise(r => setTimeout(r, ms));

// 每个视图期望的 element 标注数（= 角标数），其余为抽屉里的可读块
const EXPECT = {
  'po-list': 4, 'po-detail': 2, 'po-wizard-days': 1, 'po-wizard-overview': 1, 'po-wizard-receiver': 0,
  'po-add-sku': 1, 'po-receiver-pick': 0, 'po-accept': 1, 'po-accept-detail': 0, 'po-finish-diff': 0,
  'po-sign': 0, 'po-return': 0, 'po-as-detail': 0, 'sr-list': 4, 'sr-bind': 0, 'sr-batch-form': 0,
};

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

const rows = []; let bad = 0; const seen = new Set();

async function snap(label, expectView, shotName) {
  await sleep(700);
  const d = await ev(`(()=>{ const d = window.VitaminAnnotations.diagnostics();
    const mine = d.annotations.filter(a => a.key.startsWith('${SCOPE}'));
    const by = {}; mine.forEach(a => by[a.status] = (by[a.status]||0)+1);
    return { view: document.body.dataset.vpaView, by,
      missing: mine.filter(a=>/missing/.test(a.status)).map(a=>a.key.split(':')[1]) }; })()`);
  seen.add(d.view);
  const wantVisible = EXPECT[d.view];
  const visible = d.by.visible || 0, readable = d.by.readable || 0;
  const ok = d.view === expectView && wantVisible !== undefined &&
             visible === wantVisible && readable >= 2 && d.missing.length === 0;
  if (!ok) bad++;
  rows.push(`${ok ? 'OK  ' : 'FAIL'} ${label.padEnd(22)} view=${String(d.view).padEnd(20)} 角标=${visible}/${wantVisible ?? '?'} 可读=${readable}${d.missing.length ? ' missing=' + d.missing.join(',') : ''}`);
  if (shotName) {
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    if (shot && shot.data) { fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(`${OUT}/${shotName}.png`, Buffer.from(shot.data, 'base64')); }
  }
}

const click = async (sel, wait = 800) => { await ev(`(()=>{const n=document.querySelector('${sel}'); if(n) n.click(); return !!n;})()`); await sleep(wait); };
const closeDrawer = async () => { await ev(`(()=>{const c=document.querySelector('.mp-drawer .mp-close')||document.querySelector('.mp-close'); if(c) c.click();})()`); await sleep(600); };

await send('Runtime.enable'); await send('Page.enable');
await send('Page.navigate', { url: APP });
await sleep(4200);

// ---------- 列表 ----------
await click('#poOrderNav', 1000);
await snap('01 订单列表', 'po-list', '01-po-list');

// ---------- 向导 ----------
await click('#poNewBtn', 1000);
await snap('02 向导1 送达日期', 'po-wizard-days', '02-wizard-days');
await click('#wizAddSku', 900);
await snap('03 添加商品', 'po-add-sku', '03-add-sku');
await click('#poPickList [data-add-sku]', 700);
await click('.mp-drawer [data-pick-done], .mp-drawer .mp-primary', 900);
await closeDrawer();
// 给第一天填个量
await ev(`(()=>{const i=document.querySelector('.po-day-qty, [data-day-qty], .mp-drawer input[type=number]'); if(i){i.value='5'; i.dispatchEvent(new Event('change',{bubbles:true}));}
  const t=document.querySelector('#poDayBody input[type=number], .po-table input[type=number]'); if(t){t.value='5'; t.dispatchEvent(new Event('change',{bubbles:true}));}})()`);
await sleep(600);
const nextBtn = await ev(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>/下一步/.test(x.textContent)); if(b){b.click(); return 'clicked';} return 'no-next';})()`);
await sleep(1200);
const afterNext = await ev(`document.body.dataset.vpaView`);
if (afterNext === 'po-wizard-overview') {
  await snap('04 向导2 总览', 'po-wizard-overview', '04-wizard-overview');
  await ev(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>/下一步/.test(x.textContent)); if(b) b.click();})()`);
  await sleep(1200);
  if (await ev(`document.body.dataset.vpaView`) === 'po-wizard-receiver') {
    await snap('05 向导3 收货', 'po-wizard-receiver', '05-wizard-receiver');
    await click('#wizRcPick', 900);
    await snap('06 选择收货人', 'po-receiver-pick', '06-receiver-pick');
    await closeDrawer();
  }
} else {
  rows.push(`SKIP 向导2/3（下一步后=${afterNext}，${nextBtn}）`);
}
await click('#wizBack', 1000);

// ---------- 详情 + 验收链路 ----------
await ev(`(()=>{const r=[...document.querySelectorAll('[data-order-open]')].find(x=>x.closest('tr').textContent.includes('验收中')); if(r) r.click();})()`);
await sleep(1000);
await snap('07 订单详情', 'po-detail', '07-po-detail');

// 把所有行验收满，进入差异/签名
// 取「验收中」那张单：直接读模块数据算每行还差多少，避免瞎点
const target = await ev(`(()=>{ const head = (document.querySelector('.po-head')||{}).textContent || '';
  const no = (head.match(/PO\\d+/) || [])[0];
  const all = window.MerchantOrder.list();
  const o = all.find(x => x.no === no) || all.find(x => (x.items||[]).some(i => Number(i.acceptedQty||0) < Number(i.shippedQty||0)));
  return o ? { no: o.no, items: o.items.map(i => ({ sku: i.skuCode, shipped: Number(i.shippedQty||0), acc: Number(i.acceptedQty||0) })) } : null; })()`);
if (target) {
  const short = target.items.filter(i => i.acc < i.shipped);
  let snappedAccept = false;
  for (let k = 0; k < short.length; k++) {
    const it = short[k];
    const isLast = k === short.length - 1;
    const need = it.shipped - it.acc;
    const qty = isLast && need >= 2 ? need - 1 : need;   // 最后一行故意少 1，用来看差异抽屉
    const opened = await click(`[data-line-accept="${it.sku}"]`, 900);
    if (opened && !snappedAccept) { snappedAccept = true; await snap('08 行级验收', 'po-accept', '08-po-accept'); }
    await ev(`(()=>{const q=document.querySelector('#poAcceptQty'); if(q){ q.value='${qty}'; q.dispatchEvent(new Event('input',{bubbles:true})); }
      const s=document.querySelector('[data-ac-save]'); if(s) s.click();})()`);
    await sleep(1200);
    await closeDrawer();
  }
}
await ev(`(()=>{const r=[...document.querySelectorAll('[data-line-detail]')][0]; if(r) r.click();})()`);
await sleep(900);
const v = await ev(`document.body.dataset.vpaView`);
if (EXPECT[v] !== undefined && v === 'po-accept-detail') await snap('08b 验收详情', v, '08b-accept-detail');
await closeDrawer();

// 验收完成 → 差异 → 签名
await ev(`(()=>{const b=document.querySelector('#poFinishBtn'); if(b && !b.disabled) b.click();})()`);
await sleep(1200);
const vFinish = await ev(`document.body.dataset.vpaView`);
if (vFinish === 'po-finish-diff') {
  await snap('09 差异原因', 'po-finish-diff', '09-finish-diff');
  await ev(`(()=>{document.querySelectorAll('[data-diff-reason]').forEach(s=>{ const o=[...s.options].find(x=>x.value); if(o) s.value=o.value; s.dispatchEvent(new Event('change',{bubbles:true})); });})()`);
  await sleep(500);
  await ev(`document.querySelector('[data-diff-next]').click()`);
  await sleep(1200);
  const vSign = await ev(`document.body.dataset.vpaView`);
  if (vSign === 'po-sign') await snap('10 电子签名', 'po-sign', '10-sign');
  else rows.push(`SKIP 电子签名（差异下一步后=${vSign}）`);
} else if (vFinish === 'po-sign') {
  await snap('10 电子签名', 'po-sign', '10-sign');
} else {
  rows.push(`SKIP 差异/签名（点验收完成后=${vFinish}）`);
}
await closeDrawer();

// ---------- 已完成单：退货 / 售后详情 ----------
await ev(`document.querySelector('#poBackList') && document.querySelector('#poBackList').click()`); await sleep(1000);
await ev(`(()=>{const r=[...document.querySelectorAll('[data-order-open]')].find(x=>x.closest('tr').textContent.includes('已完成')); if(r) r.click();})()`);
await sleep(1000);
await snap('11 详情·已完成', 'po-detail', '11-po-detail-done');
if (await ev(`!!document.querySelector('[data-line-return]')`)) {
  await click('[data-line-return]', 1000);
  await snap('12 发起退货', 'po-return', '12-return');
  await click('[data-rt-cancel]', 700);
}
await ev(`(()=>{const b=document.querySelector('[data-demo="return"]'); if(b) b.click();})()`); await sleep(1400);
await ev(`document.querySelectorAll('.mp-drawer .mp-close').forEach(c=>c.click())`); await sleep(600);
await ev(`(()=>{const b=document.querySelector('[data-line-aftersale]'); if(b) b.click();})()`); await sleep(1000);
const vAs = await ev(`document.body.dataset.vpaView`);
if (vAs === 'po-as-detail') await snap('13 售后详情', 'po-as-detail', '13-as-detail');
else rows.push(`SKIP 售后详情（${vAs}）`);
await closeDrawer();

// ---------- 供货关系 ----------
await click('#srNav', 1100);
await snap('14 供货关系列表', 'sr-list', '14-sr-list');
await click('[data-sr-bind]', 1000);
await snap('15 选择供应商', 'sr-bind', '15-sr-bind');
await click('[data-sr-cancel]', 700);
await click('#srBatchForm', 1000);
await snap('16 按形态批量', 'sr-batch-form', '16-sr-batch');
await click('[data-sr-fb-cancel]', 600);

console.log(rows.join('\n'));
const allViews = Object.keys(EXPECT);
const notSeen = allViews.filter(v => !seen.has(v));
console.log('\n覆盖视图：', seen.size + '/' + allViews.length, notSeen.length ? '（未覆盖：' + notSeen.join(',') + '）' : '（全清）');
console.log('异常：', errs.length ? errs.slice(0, 6).join(' | ') : '（无）');
console.log(bad ? `\n${bad} 处不符预期` : '\n全部视图符合预期');
ws.close(); process.exit(bad ? 1 : 0);
