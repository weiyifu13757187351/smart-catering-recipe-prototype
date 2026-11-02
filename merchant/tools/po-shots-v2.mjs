/**
 * 采购订单原型 V4（两层框架）截图脚本（CDP，无第三方依赖）
 * 前置：本地静态服务 4201 + Chrome --remote-debugging-port=9333
 * 用法：node tools/po-shots-v2.mjs   → 输出到 recipe-work/_shots-po/
 */
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const CDP = 'http://127.0.0.1:9333';
const PORT = process.env.PO_PORT || '4201';
const BASE = process.env.PO_BASE || ('http://127.0.0.1:' + PORT + '/');
const APP = BASE + encodeURIComponent('食联网数智餐饮平台-组织及人员.html');
const OUT = process.env.PO_SHOTS || fileURLToPath(new URL('../../_shots-po/', import.meta.url));
const sleep = ms => new Promise(r => setTimeout(r, ms));
if (existsSync(OUT)) rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

async function connect() {
  for (let i = 0; i < 40; i++) {
    try {
      const list = await (await fetch(`${CDP}/json/list`)).json();
      const page = list.find(t => t.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch { /* wait */ }
    await sleep(250);
  }
  throw new Error('连不上 CDP');
}

const ws = new WebSocket(await connect());
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let seq = 0;
const waiters = new Map();
ws.onmessage = ev => {
  const m = JSON.parse(ev.data);
  if (m.id && waiters.has(m.id)) { waiters.get(m.id)(m); waiters.delete(m.id); }
};
const send = (method, params = {}) => new Promise(res => {
  const id = ++seq; waiters.set(id, res); ws.send(JSON.stringify({ id, method, params }));
});
const evaluate = async expr => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'eval error');
  return r.result?.result?.value;
};

await send('Runtime.enable');
await send('Page.enable');
await send('Network.enable');
await send('Network.clearBrowserCache');
await send('Page.navigate', { url: APP });
await sleep(2600);

let shots = 0;
async function shot(name) {
  await sleep(380);
  const r = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${OUT}${name}.png`, Buffer.from(r.result.data, 'base64'));
  shots++;
  console.log('shot ' + name + '.png');
}

const dayStr = off => {
  const d = new Date(); d.setDate(d.getDate() + off);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const md = off => dayStr(off).slice(5).replace('-', '-');

/* ==================== 第 1 层：订单列表 ==================== */
await evaluate(`document.getElementById('poOrderNav').click()`);
await shot('01-订单列表');

/* 滚动到页脚，展示完整表格 */
await evaluate(`window.scrollTo(0, 0)`);
await evaluate(`(() => { const s = document.querySelector('.main') || window; s.scrollTop = 260; })()`);
await sleep(300);
await shot('02-订单列表-滚动到底');
await evaluate(`(() => { const s = document.querySelector('.main') || window; s.scrollTop = 0; })()`);

/* V4.10：待确认订单可删除（二次确认） */
await evaluate(`(() => {
  const r = [...document.querySelectorAll('#purchaseOrderPage .po-order-table tbody tr')].find(x => x.textContent.includes('待确认'));
  if (r) r.querySelector('[data-del-order]').click();
})()`);
await sleep(240);
await shot('02b-订单列表-删除待确认订单（二次确认）');
await evaluate(`(() => { const b = document.getElementById('poConfirmCancel'); if (b) b.click(); })()`);
await sleep(200);

await evaluate(`(() => { const s = document.getElementById('poSrcSel'); s.value = 'direct'; s.dispatchEvent(new Event('change')); })()`);
await shot('03-筛选-来源直采下单');
await evaluate(`(() => { const s = document.getElementById('poSrcSel'); s.value = 'all'; s.dispatchEvent(new Event('change')); })()`);
await sleep(220);

await evaluate(`document.querySelector('[data-status-tab="done"]').click()`);
await shot('04-筛选-订单状态已完成');
await evaluate(`document.querySelector('[data-status-tab="wait"]').click()`);
await shot('05-筛选-订单状态待确认');
await evaluate(`document.querySelector('[data-status-tab="all"]').click()`);
await sleep(220);

await evaluate(`(() => {
  const kw = () => document.getElementById('poKw');
  kw().value = 'PO'; document.getElementById('poSearchBtn').click();
})()`);
await shot('06-筛选-订单编号查询');
await evaluate(`document.getElementById('poResetFilter').click()`);
await sleep(220);

await evaluate(`(() => {
  const kw = () => document.getElementById('poKw');
  kw().value = 'ZZZZ'; document.getElementById('poSearchBtn').click();
})()`);
await shot('07-筛选-空态');
await evaluate(`document.getElementById('poResetFilter').click()`);
await sleep(220);

/* ==================== 第 2 层：订单详情 ==================== */
await evaluate(`(() => {
  const rows = [...document.querySelectorAll('#purchaseOrderPage .po-order-table tbody tr')];
  rows.find(r => r.textContent.includes('待验收')).querySelector('[data-order-open]').click();
})()`);
await shot('08-订单详情-待验收');

await evaluate(`document.getElementById('poMoreToggle').click()`);
await shot('09-订单详情-更多信息展开');
await evaluate(`document.getElementById('poMoreToggle').click()`);
await sleep(200);

/* 验收弹层 */
await evaluate(`document.querySelector('#poLinesBody [data-line-accept="S0301"]').click()`);
await shot('10-验收弹层-本次验收量（批次累加）');
await evaluate(`(() => {
  const q = document.getElementById('poAcceptQty');
  q.value = '3'; q.dispatchEvent(new Event('input', { bubbles: true }));
})()`);
await sleep(200);
await shot('11-验收弹层-累计回显（少于发货量提示差异）');
await evaluate(`(() => {
  const add = document.getElementById('poAddPhoto');
  add.click(); add.click();
  document.querySelector('[data-ac-save]').click();
})()`);
await shot('12-订单详情-第 1 批已验收（3 箱）');
/* V4.19：验收弹层的历史验收只做展示（无操作列） */
await evaluate(`document.querySelector('#poLinesBody [data-line-accept="S0301"]').click()`);
await sleep(280);
await shot('11b-验收弹层-历史验收只读（无修改删除）');
await evaluate(`document.querySelector('.mp-drawer [data-ac-cancel]').click()`);
await sleep(220);
/* V4.19：批次修改 / 删除在「验收详情 › 验收批次记录」；删除只作用于最新一批，二次确认后才生效 */
await evaluate(`document.querySelector('#poLinesBody [data-line-detail="S0301"]').click()`);
await sleep(300);
await shot('11c-验收详情-验收批次记录（可修改、可从最新一批删除）');
await evaluate(`(() => { const b = document.querySelector('.mp-drawer [data-dacc-del]'); if (b) b.click(); })()`);
await sleep(300);
await shot('11d-验收详情-删除最新一批（二次确认）');
await evaluate(`document.getElementById('poConfirmCancel').click()`);
await sleep(220);
await evaluate(`document.querySelector('.mp-drawer [data-ld-close]').click()`);
await sleep(260);

await evaluate(`document.querySelector('#poLinesBody [data-line-accept="S0301"]').click()`);
await evaluate(`(() => {
  const q = document.getElementById('poAcceptQty');
  q.value = '2'; q.dispatchEvent(new Event('input', { bubbles: true }));
})()`);
await sleep(200);
await shot('12b-验收弹层-再验一批（历史批次可见）');
await evaluate(`document.querySelector('[data-ac-save]').click()`);
await shot('12c-订单详情-分批累加后已验收 5 箱');
/* V4.19：改批次数量在「验收详情 › 验收批次记录」里就地改 */
await evaluate(`document.querySelector('#poLinesBody [data-line-detail="S0301"]').click()`);
await sleep(260);
await evaluate(`(() => { const b = document.querySelector('.mp-drawer [data-dacc-edit="1"]'); if (b) b.click(); })()`);
await sleep(240);
await evaluate(`(() => { const i = document.getElementById('poDetailEditQty'); if (i) i.value = '4'; })()`);
await sleep(200);
await shot('13-验收详情-就地修改批次数量');
await evaluate(`(() => { const b = document.querySelector('.mp-drawer [data-dacc-edit-ok]'); if (b) b.click(); })()`);
await sleep(280);
await evaluate(`document.querySelector('.mp-drawer [data-ld-close]').click()`);
await sleep(240);
await shot('14-订单详情-改批次后累计 6 箱');

/* 验收详情 */
await evaluate(`document.querySelector('#poLinesBody [data-line-detail="S0301"]').click()`);
await shot('15-验收详情抽屉-批次记录与差异原因区');
await evaluate(`document.querySelector('.mp-drawer [data-ld-close]').click()`);
await sleep(240);

/* 补完剩余行 → 差异原因确认 → 验收完成 + 签名 */
await evaluate(`(() => {
  const accept = (code, qty) => {
    document.querySelector('#poLinesBody [data-line-accept="' + code + '"]').click();
    const q = document.getElementById('poAcceptQty');
    q.value = String(qty); q.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('[data-ac-save]').click();
  };
  accept('S0101', 12); accept('S2101', 3);
})()`);
await shot('16-订单详情-全部行已验收（S2101 有差异）');
await evaluate(`document.getElementById('poFinishBtn').click()`);
await sleep(240);
await shot('17-验收完成-差异原因确认');
await evaluate(`(() => {
  const sel = document.querySelector('[data-diff-reason="S2101"]');
  sel.value = '其他'; sel.dispatchEvent(new Event('change', { bubbles: true }));
})()`);
await sleep(200);
await shot('17b-验收完成-差异原因选其他需手填');
await evaluate(`(() => {
  const sel = document.querySelector('[data-diff-reason="S2101"]');
  sel.value = '少发漏发'; sel.dispatchEvent(new Event('change', { bubbles: true }));
  document.querySelector('[data-diff-next]').click();
})()`);
await sleep(240);
await shot('18-验收完成-电子签名');
await evaluate(`(() => {
  document.getElementById('poStaffAdd').click();
  const s = document.getElementById('poStaffSearch');
  s.value = '李'; s.dispatchEvent(new Event('input', { bubbles: true }));
  document.querySelectorAll('#poStaffBody [data-staff-row]')[0].click();
  document.querySelector('[data-staff-ok]').click();
  window.MerchantOrder.__debug.inkSignature();
})()`);
await sleep(200);
await shot('19-验收完成-已签名');
await evaluate(`document.querySelector('[data-sig-ok]').click()`);
await shot('20-订单详情-已完成并锁定');

/* ==================== 售后 ==================== */
await evaluate(`document.querySelector('#poLinesBody [data-demo="return"]').click()`);
await shot('21-订单详情-售后记录待确认');
await evaluate(`(() => {
  const btn = document.querySelector('#poLinesBody [data-line-return]');
  if (btn) btn.click();
})()`);
await shot('22-退货弹层');
await evaluate(`(() => {
  const q = document.getElementById('poRtQty');
  if (!q) return;
  q.value = '1';
  const add = document.getElementById('poRtAddPhoto');
  if (add) { add.click(); add.click(); add.click(); }
})()`);
await sleep(200);
await shot('22b-退货弹层-退货凭证（非必填·最多5张）');
await evaluate(`(() => {
  const sel = document.getElementById('poRtReason');
  if (!sel) return;
  sel.value = '其他';
  sel.dispatchEvent(new Event('change', { bubbles: true }));
})()`);
await sleep(200);
await shot('22c-退货弹层-退货原因选其他需手填具体原因');
await evaluate(`(() => {
  const sel = document.getElementById('poRtReason');
  if (!sel) return;
  sel.value = document.querySelector('#poRtReason option:nth-child(2)').value;
  sel.dispatchEvent(new Event('change', { bubbles: true }));
})()`);
await evaluate(`(() => {
  const q = document.getElementById('poRtQty');
  if (!q) return;
  q.value = '9999';
  document.querySelector('[data-rt-ok]').click();
})()`);
await shot('23-退货弹层-超量拦截');
await evaluate(`(() => {
  const q = document.getElementById('poRtQty');
  if (!q) return;
  q.value = '1';
  document.getElementById('poRtReason').value = document.querySelector('#poRtReason option:nth-child(2)').value;
  document.querySelector('[data-rt-ok]').click();
})()`);
await shot('24-订单详情-售后详情入口');

/* 售后详情（不认可 → 重新发起） */
await evaluate(`(() => {
  const b = document.querySelector('#poLinesBody [data-line-aftersale]');
  if (b) b.click();
})()`);
await shot('25-售后详情抽屉');
await evaluate(`(() => { const b = document.querySelector('.mp-drawer [data-as-close]'); if (b) b.click(); })()`);
await sleep(220);
await evaluate(`(() => { const b = document.querySelector('#poLinesBody [data-sim="return-reject"]'); if (b) b.click(); })()`);
await shot('26-售后-供应商不认可');
await evaluate(`(() => {
  const box = document.getElementById('poAsRejectReason');
  if (!box) return;
  box.value = '到货时已按标准验收，不存在变质';
  document.querySelector('[data-as-rj-ok]').click();
})()`);
await shot('27-订单详情-售后被拒可重新发起');

/* 供应商认可 */
await evaluate(`(() => { const b = document.querySelector('#poLinesBody [data-sim="return-agree"]'); if (b) b.click(); })()`);
await shot('28-订单详情-售后已认可扣减验收量');

/* 列表回显售后 */
await evaluate(`document.getElementById('poBackList').click()`);
await evaluate(`document.querySelector('[data-assale-tab="has"]').click()`);
await shot('29-筛选-有售后');
await evaluate(`document.querySelector('[data-assale-tab="all"]').click()`);
await sleep(220);

/* ==================== 新建订单（直采） ==================== */
await evaluate(`document.getElementById('poNewBtn').click()`);
await shot('30-新建订单-第1步送达日期与数量（无选供应商）');
await evaluate(`(() => {
  const d1 = ${JSON.stringify(dayStr(1))}, d3 = ${JSON.stringify(dayStr(3))};
  const f = document.getElementById('wizFrom'); f.value = d1; f.dispatchEvent(new Event('change', { bubbles: true }));
  const t = document.getElementById('wizTo'); t.value = d3; t.dispatchEvent(new Event('change', { bubbles: true }));
})()`);
await shot('31-新建订单-日期页签');
await evaluate(`document.getElementById('wizAddSku').click()`);
await shot('32-添加商品抽屉-只列已绑定供应商的商品');
/* V4.11：键盘快速添加（模糊浮框 → ↑↓ 选择 → 回车） */
await evaluate(`(() => {
  const k = document.getElementById('poPickKw');
  k.value = 'hg'; k.dispatchEvent(new Event('input', { bubbles: true }));
})()`);
await sleep(240);
await shot('32b-添加商品抽屉-输入hg模糊浮框');
await evaluate(`(() => {
  const k = document.getElementById('poPickKw');
  k.value = 'j'; k.dispatchEvent(new Event('input', { bubbles: true }));
  const down = () => k.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
  down(); down();
})()`);
await sleep(240);
await shot('32c-添加商品抽屉-键盘上下键选择高亮');
/* V4.12：点浮框外只收面板、输入保留；再点输入框重新展开 */
await evaluate(`(() => {
  const h = document.querySelector('.mp-drawer h2') || document.body;
  h.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
})()`);
await sleep(220);
await shot('32c2-点浮框外收起（输入内容保留）');
await evaluate(`(() => { const k = document.getElementById('poPickKw'); k.dispatchEvent(new Event('click', { bubbles: true })); })()`);
await sleep(220);
await shot('32c3-再点输入框浮框重新展开');
await evaluate(`(() => {
  const k = document.getElementById('poPickKw');
  k.value = 'hg'; k.dispatchEvent(new Event('input', { bubbles: true }));
  k.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
})()`);
await sleep(240);
await shot('32d-添加商品抽屉-回车添加成功（浮框收起、输入框清空）');
/* V4.13：填完采购量、光标离开该行 → 自动添加（无需点「添加」） */
await evaluate(`(() => {
  const row = [...document.querySelectorAll('#poPickList tbody tr')].find(r => r.textContent.includes('山东一级土豆'));
  const q = row.querySelector('[data-pick-qty]');
  q.value = '6'; q.dispatchEvent(new Event('input', { bubbles: true }));
  q.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: null }));
})()`);
await sleep(280);
await shot('32e-填完采购量离开自动添加（无需点添加）');
await evaluate(`(() => { const b = [...document.querySelectorAll('.mp-drawer [data-unpick-sku]')].find(x => x.getAttribute('data-unpick-sku') === 'S0701'); if (b) b.click(); })()`);
await sleep(200);
/* 撤回这次键盘添加，后续步骤按原有路径走 */
await evaluate(`(() => { const b = document.querySelector('.mp-drawer [data-unpick-sku]'); if (b) b.click(); })()`);
await sleep(200);
await evaluate(`(() => {
  const k = document.getElementById('poPickKw');
  k.value = '黄瓜'; k.dispatchEvent(new Event('input', { bubbles: true }));
  document.getElementById('poPickSearch').click();
  const row = [...document.querySelectorAll('#poPickList tbody tr')].find(r => r.textContent.includes('鲜黄瓜'));
  const q = row.querySelector('[data-pick-qty]');
  q.value = '5'; q.dispatchEvent(new Event('input', { bubbles: true }));
  row.querySelector('[data-add-sku]').click();
})()`);
await shot('33-添加商品抽屉-已添加回显');
await evaluate(`document.querySelector('[data-pick-done]').click()`);
await shot('34-新建订单-已填入当天商品');
await evaluate(`(() => {
  const d2 = ${JSON.stringify(dayStr(2))}, d3 = ${JSON.stringify(dayStr(3))};
  const pickTab = d => document.querySelector('#poWizardPage [data-day-tab="' + d + '"]').click();
  const addSku = (qty) => {
    document.getElementById('wizAddSku').click();
    const k = document.getElementById('poPickKw'); k.value = '黄瓜'; k.dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('poPickSearch').click();
    const row = [...document.querySelectorAll('#poPickList tbody tr')].find(r => r.textContent.includes('鲜黄瓜'));
    const q = row.querySelector('[data-pick-qty]');
    q.value = String(qty); q.dispatchEvent(new Event('input', { bubbles: true }));
    row.querySelector('[data-add-sku]').click();
    document.querySelector('[data-pick-done]').click();
  };
  pickTab(d2); addSku(6);
  pickTab(d3); addSku(7);
})()`);
await shot('35-新建订单-三天填量（单价·总价·小计随动）');
await evaluate(`(() => {
  const d2 = ${JSON.stringify(dayStr(2))};
  document.querySelector('#poWizardPage [data-day-tab="' + d2 + '"]').click();
  const inp = document.querySelector('#poWizardPage [data-day-qty]');
  inp.value = ''; inp.dispatchEvent(new Event('input', { bubbles: true }));
  document.getElementById('wizNext').click();
})()`);
await shot('36-新建订单-未填量拦截');
await evaluate(`(() => {
  const red = document.querySelector('#poWizardPage .po-qty-error');
  red.value = '6'; red.dispatchEvent(new Event('input', { bubbles: true }));
  document.getElementById('wizNext').click();
})()`);
await shot('37-新建订单-总览（供应商列 + 分组小计）');
await evaluate(`document.getElementById('wizNext').click()`);
await shot('38-新建订单-收货与提交');
await evaluate(`(() => {
  document.getElementById('wizRcPick').click();
})()`);
await shot('39-选择收货联系人');
await evaluate(`(() => {
  const b = document.querySelector('.mp-drawer #poRcBody [data-rc-pick]');
  if (b) b.click();
  document.getElementById('wizSubmit').click();
})()`);
await sleep(200);
await shot('39b-提交下单-二次确认');
await evaluate(`document.getElementById('poConfirmOk').click()`);
await shot('40-提交后回到订单列表（按创建时间+同供应商排序）');
/* V4.14：待确认订单没有发货记录 → 不显示「预计发货时间」 */
await evaluate(`(() => {
  const r = document.querySelector('#purchaseOrderPage .po-order-table tbody tr');
  if (r) r.querySelector('[data-order-open]').click();
})()`);
await sleep(320);
await evaluate(`(() => { const s = document.querySelector('.main') || window; s.scrollTop = 560; })()`);
await sleep(280);
await shot('40b-订单详情-待确认（发货记录无预计发货时间）');
await evaluate(`(() => { const s = document.querySelector('.main') || window; s.scrollTop = 0; })()`);
await evaluate(`document.getElementById('poBackList').click()`);
await sleep(260);

/* 修改订单（提交后已在订单列表） */
await evaluate(`(() => {
  const rows = [...document.querySelectorAll('#purchaseOrderPage .po-order-table tbody tr')];
  const r = rows.find(x => x.querySelector('[data-edit-order]'));
  if (r) r.querySelector('[data-edit-order]').click();
})()`);
await shot('41-修改订单抽屉');
await evaluate(`(() => {
  const q = document.querySelector('.mp-drawer [data-edit-qty]');
  if (q) { q.value = '9'; q.dispatchEvent(new Event('input', { bubbles: true })); }
})()`);
await shot('42-修改订单-改量后合计随动');
await evaluate(`document.querySelector('[data-edit-save]').click()`);
await sleep(300);
await shot('43-修改订单-保存后回显');

/* 回到列表总览 */
await evaluate(`document.getElementById('poBackList') && document.getElementById('poBackList').click()`);
await evaluate(`(() => { const s = document.querySelector('.main') || window; s.scrollTop = 0; })()`);
await shot('44-订单列表-全部订单');

/* ==================== 供货关系管理（V4.1 新增栏目） ==================== */
await evaluate(`document.getElementById('srNav').click()`);
await shot('45-供货关系管理-列表');

await evaluate(`(() => { const c = document.getElementById('srIncludeOff'); c.checked = true; c.dispatchEvent(new Event('change')); })()`);
await shot('46-供货关系管理-包含已下架（灰态只读）');
await evaluate(`(() => { const c = document.getElementById('srIncludeOff'); c.checked = false; c.dispatchEvent(new Event('change')); })()`);
await sleep(220);

await evaluate(`document.getElementById('srCatBtn').click()`);
await sleep(320);
await shot('47-供货关系管理-商品分类三级弹层');
await evaluate(`(() => {
  const pop = document.getElementById('srCatPop');
  const veg = [...pop.querySelectorAll('[data-cat-depth="0"]')].find(b => b.textContent.includes('蔬菜类'));
  if (veg) veg.click();
})()`);
await sleep(320);
await shot('48-供货关系管理-商品分类-选中一级后展开二级');
await evaluate(`document.getElementById('srSearchBtn').click()`);
await sleep(260);
await evaluate(`document.getElementById('srResetFilter').click()`);
await sleep(240);

await evaluate(`(() => { const s = document.getElementById('srFormSel'); s.value = '净菜'; s.dispatchEvent(new Event('change')); document.getElementById('srSearchBtn').click(); })()`);
await shot('49-供货关系管理-按形态筛选');
await evaluate(`document.getElementById('srResetFilter').click()`);
await sleep(220);

await evaluate(`document.querySelector('[data-sr-bind="S1701"]').click()`);
await shot('50-供货关系管理-单个绑定抽屉（只列形态匹配供应商）');
await evaluate(`document.querySelector('.mp-drawer [data-sr-cancel]').click()`);
await sleep(200);
await evaluate(`document.querySelector('[data-sr-bind="S0101"]').click()`);
await shot('50b-单个绑定抽屉-无报价供应商单选锁定不可选');
await evaluate(`document.querySelector('.mp-drawer [data-sr-cancel]').click()`);
await sleep(200);

await evaluate(`document.querySelector('.mp-drawer [data-sr-cancel]').click()`);
await sleep(220);

await evaluate(`document.querySelector('[data-sr-bind="S2801"]').click()`);
await shot('51-供货关系管理-抽屉-该商品暂无供应商报价');
await evaluate(`document.querySelector('.mp-drawer [data-sr-cancel]').click()`);
await sleep(220);

await evaluate(`document.getElementById('srBatchLowest').click()`);
await sleep(260);
await shot('52-供货关系管理-一键最低价-二次确认');
await evaluate(`document.getElementById('poConfirmOk').click()`);
await sleep(400);
await shot('53-供货关系管理-一键最低价-执行结果');
await sleep(2100);

await evaluate(`document.getElementById('srBatchForm').click()`);
await shot('54-供货关系管理-按形态批量绑定');
await evaluate(`(() => {
  const d = document.querySelector('.mp-drawer');
  const f = d.querySelector('#srFormPick'); f.value = '半成品'; f.dispatchEvent(new Event('change'));
  const s = d.querySelector('#srSupPick'); s.value = 'sup5'; s.dispatchEvent(new Event('change'));
})()`);
await shot('55-供货关系管理-按形态批量绑定-覆盖提示');
await evaluate(`document.querySelector('.mp-drawer [data-sr-fb-cancel]').click()`);
await sleep(240);

await evaluate(`document.getElementById('srBatchUnbind').click()`);
await sleep(260);
await shot('56-供货关系管理-一键清除供应商-二次确认');
await evaluate(`document.getElementById('poConfirmCancel').click()`);
await sleep(200);

/* ==================== 总览改版（V4.3：1 张摘要卡 + 1 供应商 1 卡片） ==================== */
await evaluate(`(() => {
  document.getElementById('poOrderNav').click();
  document.getElementById('poNewBtn').click();
  const d2 = (() => { const d = new Date(); d.setDate(d.getDate() + 2); const p = n => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); })();
  const to = document.getElementById('wizTo'); to.value = d2; to.dispatchEvent(new Event('change', { bubbles: true }));
  window.__addOv = (kwi, name, qty) => {
    document.getElementById('wizAddSku').click();
    const k = document.getElementById('poPickKw'); k.value = kwi; k.dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('poPickSearch').click();
    const row = [...document.querySelectorAll('#poPickList tbody tr')].find(r => r.textContent.includes(name));
    if (row && qty) { const q = row.querySelector('[data-pick-qty]'); q.value = String(qty); q.dispatchEvent(new Event('input', { bubbles: true })); row.querySelector('[data-add-sku]').click(); }
    document.querySelector('[data-pick-done]').click();
  };
  window.__addOv('黄瓜', '鲜黄瓜', 10);
})()`);
await evaluate(`document.getElementById('wizNext').click()`);
await sleep(2400);
await shot('57-总览-单供应商一张卡');
await evaluate(`(() => {
  document.getElementById('wizPrev').click();
  window.__addOv('鸡胸', '冷鲜鸡胸肉', 10);
  window.__addOv('土豆', '山东一级土豆', 10);
  window.__addOv('五花肉', '冷鲜五花肉', 10);
  document.querySelectorAll('#poWizardPage [data-day-tab]')[1].click();
  window.__addOv('五花肉', '冷鲜五花肉', 50);
  window.__addOv('大豆油', '一级大豆油', 10);
  document.querySelectorAll('#poWizardPage [data-day-tab]')[0].click();
  document.getElementById('wizNext').click();
})()`);
await sleep(2400);
await shot('58-总览-多供应商按小计金额降序');
await evaluate(`document.getElementById('wizBack').click()`);
await sleep(200);
console.log('\n共 ' + shots + ' 张 → ' + OUT);
ws.close();
