/* 商户端 · 采购管理 —— 采购订单 / 询价单（原型）
   口径见《商户端采购订单管理设计方案-讨论稿》V1.5（评审通过）与《商户端采购订单管理PRD-V1.0》：

   【规则】三个下单来源，结构同构：A 采购计划定标转单、B 独立询价、C 直采（不询价）。
   【规则】订单带「需求区间 + 每日需求」：行数量 = 区间内每日数量之和，合计不可手改。
   【规则】按供应商拆单：档口 + 供应商 + 来源单号 = 一张订单；一供应商一单。
   【规则】定标提交即**自动生单**，不设「生成订单」二次入口。
   【规则】7 态：待确认 → 已确认 → 待验收 → 已验收 → 已完成；分支「已取消」「退货中」。
   【规则】变更不单开单据：作为订单版本记录；开关在**档口级**，开=需手动确认、关=自动确认，
           下单时把开关值快照到订单（manualConfirm）。
   【规则】签收严格逐单验收，不做按供应商/按天的聚合批次。
   【规则】双数量：供应商一次性填**实际发货量**；商户填**实际验收量**（≤ 实际发货量），
           可反复修改，**每次修改留一条验收量变更记录**（含验收方式：手动 / 电子秤）。
   【规则】只有点「验收完成」才收口：**必须电子签名**，完成后订单锁定、验收量不可再改。

   【原型】没有供应商端，故在详情页提供「供应商模拟」区：确认订单 / 修改订单 / 确认发货 /
           同意退货 / 退回退货单 / 报价；档口「采购设置」开关也可在本页切换演示。
   依赖 window.MerchantPlan（esc / toast / drawer / close / hideAll）与
        window.MerchantStalls、window.MerchantScope（档口与范围）。 */
(() => {
'use strict';

const MP = window.MerchantPlan || {};
const esc = MP.esc || (v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

function toast(msg) {
  if (typeof MP.toast === 'function') { MP.toast(msg); return; }
  const n = document.createElement('div');
  n.className = 'um-toast'; n.textContent = msg;
  document.body.appendChild(n);
  setTimeout(() => n.remove(), 1800);
}
/* 复用排餐计划那套抽屉（.mp-mask / .mp-drawer 样式已随 merchant-meal-plan-v1.css 加载） */
function drawer(title, sub, body, foot, wide = false) {
  if (typeof MP.drawer === 'function') { MP.drawer(title, sub, body, foot, wide); return; }
  toast(title);
}
const closeDrawer = () => { if (typeof MP.close === 'function') MP.close(); };

/* ============================ 1. 基础工具 ============================ */

const pad2 = n => String(n).padStart(2, '0');
const iso = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const parseISO = s => { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, (m || 1) - 1, d || 1); };
const addDays = (s, n) => { const d = parseISO(s); d.setDate(d.getDate() + n); return iso(d); };
const TODAY = iso(new Date());
const WEEK = ['日', '一', '二', '三', '四', '五', '六'];
const md = s => `${pad2(parseISO(s).getMonth())}-${pad2(parseISO(s).getDate())}`;
const mdw = s => `${md(s)} 周${WEEK[parseISO(s).getDay()]}`;
const nowStr = () => { const d = new Date(); return `${md(iso(d))} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };
const daysBetween = (from, to) => {
  const list = []; let cur = from; let guard = 0;
  while (cur <= to && guard++ < 400) { list.push(cur); cur = addDays(cur, 1); }
  return list;
};
const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const trimQty = v => { const n = num(v); return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100); };
const money = v => `¥${num(v).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const uid = p => `${p}${Date.now().toString(36).slice(-5)}${Math.random().toString(36).slice(2, 5)}`;
const orderNo = seq => `PO${TODAY.replace(/-/g, '')}${String(seq).padStart(3, '0')}`;
const inqNo = seq => `XJ${TODAY.replace(/-/g, '')}${String(seq).padStart(3, '0')}`;

/* ============================ 2. 快照数据【原型】 ============================
   商品 / SKU / 供应商 / 预报价 与「采购计划」模块保持同一套名称，便于对照演示；
   正式版读商品中心（已发布 SKU）与采购管理 › 预报价。 */
const PRODUCTS = [
  ['P01', '冷鲜鸡胸肉', '毛菜', ['S0101', '冷鲜鸡胸肉 箱装', '毛菜 / 整箱', '箱']],
  ['P03', '鲜黄瓜', '毛菜', ['S0301', '鲜黄瓜 箱装', '毛菜 / 整箱', '箱']],
  ['P04', '海天生抽', '净菜', ['S0401', '海天生抽 500ml×12', '500ml×12/箱', '箱']],
  ['P06', '冷鲜五花肉', '毛菜', ['S0601', '冷鲜五花肉 箱装', '毛菜 / 整箱', '箱']],
  ['P07', '山东一级土豆', '毛菜', ['S0701', '山东一级土豆 袋装', '5kg/袋', '袋']],
  ['P09', '一级大豆油', '净菜', ['S0901', '一级大豆油 5L×4/箱', '5L×4/箱', '箱']],
  ['P11', '鲜鸡蛋', '毛菜', ['S1101', '鲜鸡蛋 箱装', '整箱', '箱']],
  ['P17', '鲜小葱', '毛菜', ['S1701', '鲜小葱 箱装', '毛菜 / 整箱', '箱']],
  ['P18', '老南瓜', '毛菜', ['S1801', '老南瓜 箱装', '毛菜 / 整箱', '箱']],
  ['P21', '沙瓤番茄', '毛菜', ['S2101', '沙瓤番茄 箱装', '毛菜 / 整箱', '箱']],
  ['P22', '时令蔬菜（当日）', '毛菜', ['S2201', '时令蔬菜 箱装', '毛菜 / 整箱', '箱']],
  ['P23', '中筋面粉', '净菜', ['S2301', '中筋面粉 袋装', '25kg/袋', '袋']],
  ['P25', '千禧圣女果', '毛菜', ['S2501', '千禧圣女果 箱装', '毛菜 / 整箱', '箱']]
];
const SKUS = PRODUCTS.map(([code, name, form, sku]) => ({
  productCode: code, productName: name, form,
  code: sku[0], name: sku[1], spec: sku[2], unit: sku[3]
}));
const SKU = Object.fromEntries(SKUS.map(s => [s.code, s]));

const SUPPLIERS = [
  { id: 'sup1', name: '上海鲜配供应链有限公司', contact: '王经理 138****6621', types: ['毛菜', '肉禽蛋'],
    quotes: { P01: 128, P03: 65, P06: 220, P07: 26, P11: 96, P17: 58, P18: 48, P21: 72, P22: 55, P25: 120 } },
  { id: 'sup2', name: '江南粮油调味品商行', contact: '李经理 139****3382', types: ['净菜', '粮油调味'],
    quotes: { P04: 58, P09: 184, P23: 96 } },
  { id: 'sup3', name: '城西冷链配送中心', contact: '赵经理 137****9900', types: ['毛菜', '冷链'],
    quotes: { P01: 132, P06: 215 } },
  { id: 'sup5', name: '本地蔬菜合作社', contact: '周姐 135****7742', types: ['毛菜', '蔬菜'],
    quotes: { P03: 62, P17: 55, P18: 46, P21: 69, P22: 52, P25: 112 } },
  { id: 'sup6', name: '北郊副食批发部', contact: '陈师傅 133****5510', types: ['净菜', '干货'],
    quotes: { P07: 28, P11: 99, P23: 92 } }
];
const supplierOf = id => SUPPLIERS.find(s => s.id === id) || { id, name: '（未知供应商）', quotes: {} };
const skuPriceOf = (supId, skuCode) => {
  const s = supplierOf(supId);
  const p = s.quotes && s.quotes[SKU[skuCode].productCode];
  return p == null ? null : p;
};

/* ============================ 3. 内存数据 + 演示种子 ============================ */

const S = { orders: [], inquiries: [], settings: {}, seqOrder: 1, seqInq: 1 };
let view = { kind: 'list' };          /* list | detail | inqList | inqDetail */
let listFilter = { status: 'all', keyword: '', source: 'all' };
let wiz = null;                        /* 新建向导状态 */

const stallNow = () => {
  const sc = window.MerchantScope && window.MerchantScope.current ? window.MerchantScope.current() : {};
  const stalls = (window.MerchantStalls && window.MerchantStalls.listByOrg && sc.orgId)
    ? window.MerchantStalls.listByOrg(sc.orgId) : [];
  const hit = stalls.find(s => s.id === sc.stallId) || stalls[0];
  return { id: (hit && hit.id) || 'stall1', name: (hit && hit.name) || '第一食堂档口', orgId: sc.orgId || '', orgName: sc.orgName || '' };
};

/* 档口范围同步：切换器换档口时，把演示数据整体挂到新档口下（原型只有一个使用者） */
function syncStall() {
  const st = stallNow();
  if (!S.stall) { S.stall = st; return st; }
  if (S.stall.id !== st.id) {
    [S.orders, S.inquiries].forEach(arr => arr.forEach(x => {
      if (x.stallId === S.stall.id) { x.stallId = st.id; x.stallName = st.name; }
    }));
    if (S.settings[S.stall.id]) S.settings[st.id] = S.settings[S.stall.id];
    S.stall = st;
  }
  return st;
}

const manualConfirmOn = stallId => !!(S.settings[stallId] && S.settings[stallId].manualConfirm);

const STATUS = {
  wait: { label: '待确认', cls: 'wait' },
  confirmed: { label: '已确认', cls: 'confirm' },
  toReceive: { label: '待验收', cls: 'receive' },
  accepted: { label: '已验收', cls: 'accepted' },
  returning: { label: '退货中', cls: 'returning' },
  done: { label: '已完成', cls: 'done' },
  canceled: { label: '已取消', cls: 'cancel' }
};
const SOURCE = { plan: '来源：计划', inquiry: '来源：询价', direct: '来源：直采' };

function itemOfOrder(skuCode, qty, price, dailyDates) {
  const s = SKU[skuCode];
  return {
    skuCode, productName: s.productName, form: s.form, spec: s.spec, unit: s.unit,
    qty, price, daily: dailyDates, shippedQty: null, receivedQty: null,
    diffReason: '', returnIntent: false, returnQty: 0
  };
}
const sumDaily = daily => (daily || []).reduce((a, d) => a + num(d.qty), 0);
const amountOf = o => (o.items || []).reduce((a, it) => a + num(it.qty) * num(it.price), 0);
const receivedAmountOf = o => (o.items || []).reduce((a, it) => a + num(it.receivedQty) * num(it.price), 0);
const shippedAmountOf = o => (o.items || []).reduce((a, it) => a + num(it.shippedQty) * num(it.price), 0);

function daysDemo(from, plan) {
  /* plan: [每天数量]，返回 [{date,qty}]，跳过 0 */
  const out = [];
  (plan || []).forEach((q, i) => { if (num(q) > 0) out.push({ date: addDays(from, i), qty: num(q) }); });
  return out;
}

function seed() {
  const st = stallNow();
  S.stall = st;
  S.settings[st.id] = { manualConfirm: S.settings[st.id] ? S.settings[st.id].manualConfirm : false };
  const d0 = addDays(TODAY, 1);

  /* ① 直采 · 待确认 */
  const A = {
    id: 'ordA', no: orderNo(1), stallId: st.id, stallName: st.name,
    supplierId: 'sup5', supplierName: supplierOf('sup5').name,
    source: 'direct', sourceNo: '', status: 'wait', manualConfirm: false,
    createdAt: `${md(TODAY)} 09:12`, range: { from: d0, to: d0 }, slot: '07:00-09:00',
    receiver: { addr: '浦东新区世纪大道 1000 号 · 中央厨房收货口', contact: '张伟', phone: '138****8866' },
    items: [
      itemOfOrder('S0301', 6, 62, daysDemo(d0, [6])),
      itemOfOrder('S2101', 4, 69, daysDemo(d0, [4]))
    ],
    changes: [], shipments: [], accepts: [], returns: [],
    timeline: [{ at: `${md(TODAY)} 09:12`, text: '采购员 张伟 创建订单（直采）' }]
  };
  /* ② 计划定标转单 · 待验收（已发货，含部分发货） */
  const from2 = addDays(TODAY, 1);
  const B = {
    id: 'ordB', no: orderNo(2), stallId: st.id, stallName: st.name,
    supplierId: 'sup1', supplierName: supplierOf('sup1').name,
    source: 'plan', sourceNo: 'CGJH20261023001', status: 'toReceive', manualConfirm: false,
    createdAt: `${md(TODAY)} 08:40`, range: { from: from2, to: addDays(from2, 2) }, slot: '07:00-09:00',
    receiver: { addr: '浦东新区世纪大道 1000 号 · 中央厨房收货口', contact: '张伟', phone: '138****8866' },
    items: [
      itemOfOrder('S0101', 12, 128, daysDemo(from2, [4, 5, 3])),
      itemOfOrder('S0601', 3, 220, daysDemo(from2, [1, 1, 1])),
      itemOfOrder('S1801', 5, 48, daysDemo(from2, [2, 2, 1]))
    ],
    changes: [], accepts: [], returns: [],
    shipments: [{ at: `${md(from2)} 06:30`, driver: '刘师傅', phone: '136****2201', eta: `${md(from2)} 07:20`,
      items: { S0101: 12, S0601: 3, S1801: 4 } }],
    timeline: [
      { at: `${md(TODAY)} 08:40`, text: '采购计划 CGJH20261023001 定标，自动生成订单' },
      { at: `${md(from2)} 06:30`, text: '供应商确认发货（实发 19 项 · 老南瓜少发 1 箱）' }
    ]
  };
  B.items[0].shippedQty = 12; B.items[1].shippedQty = 3; B.items[2].shippedQty = 4;

  /* ③ 独立询价定标转单 · 已验收（部分验收 + 已改过验收量） */
  const from3 = TODAY;
  const C = {
    id: 'ordC', no: orderNo(3), stallId: st.id, stallName: st.name,
    supplierId: 'sup2', supplierName: supplierOf('sup2').name,
    source: 'inquiry', sourceNo: 'XJ20261022001', status: 'accepted', manualConfirm: false,
    createdAt: `${md(addDays(TODAY, -1))} 15:20`, range: { from: from3, to: from3 }, slot: '07:00-09:00',
    receiver: { addr: '浦东新区世纪大道 1000 号 · 中央厨房收货口', contact: '张伟', phone: '138****8866' },
    items: [
      itemOfOrder('S0401', 8, 58, daysDemo(from3, [8])),
      itemOfOrder('S2301', 10, 96, daysDemo(from3, [10])),
      itemOfOrder('S0901', 4, 184, daysDemo(from3, [4]))
    ],
    changes: [], returns: [],
    shipments: [{ at: `${md(from3)} 06:40`, driver: '孙师傅', phone: '137****3312', eta: `${md(from3)} 07:10`,
      items: { S0401: 8, S2301: 10, S0901: 4 } }],
    accepts: [
      { at: `${md(from3)} 07:30`, by: '李库管', method: 'manual', changeNo: 1, note: '到货首点',
        items: [{ skuCode: 'S0401', before: 0, after: 8, diffReason: '' }, { skuCode: 'S2301', before: 0, after: 8, diffReason: '数量短缺' }, { skuCode: 'S0901', before: 0, after: 4, diffReason: '' }] },
      { at: `${md(from3)} 09:05`, by: '李库管', method: 'manual', changeNo: 2, note: '面粉补送 2 袋',
        items: [{ skuCode: 'S2301', before: 8, after: 10, diffReason: '' }] }
    ],
    timeline: [
      { at: `${md(addDays(TODAY, -1))} 15:20`, text: '询价单 XJ20261022001 定标，自动生成订单' },
      { at: `${md(from3)} 06:40`, text: '供应商确认发货' },
      { at: `${md(from3)} 07:30`, text: '李库管 保存验收量（手动验收，第一次）' },
      { at: `${md(from3)} 09:05`, text: '李库管 修改验收量（面粉 8 → 10）' }
    ]
  };
  C.items[0].shippedQty = 8; C.items[0].receivedQty = 8;
  C.items[1].shippedQty = 10; C.items[1].receivedQty = 10;
  C.items[2].shippedQty = 4; C.items[2].receivedQty = 4;

  S.orders.push(A, B, C);
  S.seqOrder = 4;

  /* 询价单（询价中，两家已报、一家待报） */
  const inqFrom = addDays(TODAY, 2);
  const inq = {
    id: 'inqX', no: inqNo(1), stallId: st.id, stallName: st.name, source: 'inquiry',
    range: { from: inqFrom, to: addDays(inqFrom, 1) },
    deadline: `${md(addDays(TODAY, 1))} 12:00`, status: 'inquiring',
    createdAt: `${md(TODAY)} 10:05`,
    items: [
      { skuCode: 'S0101', qty: 9, daily: daysDemo(inqFrom, [5, 4]) },
      { skuCode: 'S0601', qty: 2, daily: daysDemo(inqFrom, [1, 1]) }
    ],
    suppliers: [
      { id: 'sup1', name: supplierOf('sup1').name, status: 'quoted',
        quotes: { S0101: { price: 126, at: `${md(TODAY)} 11:20` }, S0601: { price: 218, at: `${md(TODAY)} 11:20` } } },
      { id: 'sup3', name: supplierOf('sup3').name, status: 'quoted',
        quotes: { S0101: { price: 130, at: `${md(TODAY)} 11:48` } } },
      { id: 'sup5', name: supplierOf('sup5').name, status: 'pending', quotes: {} }
    ],
    awards: {}, generatedOrders: []
  };
  S.inquiries.push(inq);
  S.seqInq = 2;
}

/* ============================ 4. 页面骨架与导航 ============================ */

const PAGES = ['#purchaseOrderPage', '#purchaseInquiryPage'];
function page(id, cls) {
  let p = $(id);
  if (!p) {
    p = document.createElement('div');
    p.id = id.slice(1);
    p.className = `page-view ${cls}`;
    p.hidden = true;
    $('.main').appendChild(p);
  }
  return p;
}
const orderPage = () => page('#purchaseOrderPage', 'po-page');
const inqPage = () => page('#purchaseInquiryPage', 'po-page');

function hideAll(nav) {
  $$('.page-view').forEach(x => { x.hidden = true; });
  $$('.nav-child').forEach(x => x.classList.toggle('active', x === nav));
}
const breadcrumb = txt => { const bc = $('.breadcrumb'); if (bc) bc.innerHTML = `采购管理&nbsp; / &nbsp;<strong>${txt}</strong>`; };

function install() {
  if ($('#poOrderNav')) return;
  const sidebar = $('.sidebar');
  if (sidebar) {
    sidebar.insertAdjacentHTML('beforeend',
      `<div class="nav-parent" id="purchaseMgmtParent"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M4 6h3l2 10h9l3-8H7"/><circle cx="9" cy="19" r="1.4"/><circle cx="17" cy="19" r="1.4"/></svg><span>采购管理</span></div>
       <div class="nav-child" id="poOrderNav"><span>采购订单</span></div>
       <div class="nav-child" id="poInquiryNav"><span>询价单</span></div>`);
  }
  seed();
  $('#poOrderNav').addEventListener('click', () => { showList(); });
  $('#poInquiryNav').addEventListener('click', () => { showInquiryList(); });
}

/* ============================ 5. 列表页 ============================ */

function showList() {
  view = { kind: 'list' };
  hideAll($('#poOrderNav'));
  breadcrumb('采购订单');
  const p = orderPage(); p.hidden = false;
  renderList();
}

function myOrders() {
  const st = syncStall();
  return S.orders.filter(o => o.stallId === st.id);
}

function statusCounts(list) {
  const c = { all: list.length };
  Object.keys(STATUS).forEach(k => { c[k] = list.filter(o => o.status === k).length; });
  return c;
}

function renderList() {
  const p = orderPage();
  const st = syncStall();
  const all = myOrders();
  const counts = statusCounts(all);
  const todo = all.filter(o => o.status === 'wait' && hasPendingChange(o) === false).length
    + all.filter(o => hasPendingChange(o)).length
    + all.filter(o => o.status === 'toReceive' || o.status === 'accepted').length;

  let list = all.slice();
  if (listFilter.status !== 'all') list = list.filter(o => o.status === listFilter.status);
  if (listFilter.source !== 'all') list = list.filter(o => o.source === listFilter.source);
  if (listFilter.keyword) {
    const kw = listFilter.keyword.trim().toLowerCase();
    list = list.filter(o => (o.no + o.supplierName + (o.sourceNo || '') + o.items.map(i => i.productName).join(''))
      .toLowerCase().includes(kw));
  }
  list.sort((a, b) => (a.range.from < b.range.from ? 1 : a.range.from > b.range.from ? -1 : (a.no < b.no ? 1 : -1)));

  const totalAmount = all.filter(o => o.status !== 'canceled').reduce((a, o) => a + amountOf(o), 0);
  const monthAmount = all.filter(o => o.createdAt.startsWith(md(TODAY).slice(0, 2)) && o.status !== 'canceled')
    .reduce((a, o) => a + amountOf(o), 0);

  const tabs = [['all', '全部'], ['wait', '待确认'], ['confirmed', '已确认'], ['toReceive', '待验收'],
    ['accepted', '已验收'], ['returning', '退货中'], ['done', '已完成'], ['canceled', '已取消']];

  p.innerHTML = `
    <div class="po-head">
      <div>
        <h1>采购订单</h1>
        <p>承接采购计划定标与独立询价产生的正式订单，也可以直采下单。按供应商拆单，一供应商一单；
           订单带需求区间与每日需求，验收严格逐单。</p>
      </div>
      <div class="po-head-actions">
        <button class="po-btn" id="poAcceptSwitchBtn">${manualConfirmOn(st.id) ? '变更需手动确认：开' : '变更需手动确认：关'}</button>
        <button class="po-btn primary" id="poNewBtn">+ 新建采购订单</button>
      </div>
    </div>

    <div class="po-scope">
      <span>当前档口 <b>${esc(st.name)}</b></span>
      <span class="po-tag soft">下单方配置</span>
      <div class="po-switch">
        <label class="po-sig-check">
          <input type="checkbox" id="poSwitchBox" ${manualConfirmOn(st.id) ? 'checked' : ''}>
          修改订单需下单方手动确认（档口级设置，下单时快照）
        </label>
      </div>
    </div>

    <div class="po-stats">
      <div class="po-stat"><span>本档口订单</span><b>${all.length}<i>张</i></b></div>
      <div class="po-stat"><span>待我处理</span><b class="${todo ? 'hl' : ''}">${todo}<i>张</i></b></div>
      <div class="po-stat"><span>订单金额（未取消）</span><b>${money(totalAmount)}</b></div>
      <div class="po-stat"><span>本月下单</span><b>${money(monthAmount)}</b></div>
      <div class="po-stat warn"><span>待验收（含部分验收）</span><b>${counts.toReceive + counts.accepted}<i>张</i></b></div>
    </div>

    <div class="po-toolbar">
      <div class="po-seg" id="poStatusSeg">
        ${tabs.map(([k, label]) => `<button data-status="${k}" class="${listFilter.status === k ? 'on' : ''}">${label}<b>${counts[k] || 0}</b></button>`).join('')}
      </div>
      <select class="po-select" id="poSourceSel">
        ${[['all', '全部来源'], ['plan', '来源：计划'], ['inquiry', '来源：询价'], ['direct', '来源：直采']]
          .map(([k, l]) => `<option value="${k}" ${listFilter.source === k ? 'selected' : ''}>${l}</option>`).join('')}
      </select>
      <input class="po-input" id="poKeyword" placeholder="搜索订单号 / 供应商 / 商品" value="${esc(listFilter.keyword)}">
      <div class="po-grow"></div>
      <span class="po-note">共 ${list.length} 张</span>
    </div>

    <div class="po-card">
      ${list.length ? `<table class="po-table">
        <thead><tr>
          <th style="width:190px">订单号</th><th>供应商 / 档口</th><th style="width:150px">需求区间</th>
          <th style="width:96px">品项</th><th class="num" style="width:120px">订单金额</th>
          <th style="width:150px">状态</th><th style="width:110px">创建时间</th><th style="width:150px">操作</th>
        </tr></thead>
        <tbody>${list.map(rowHtml).join('')}</tbody>
      </table>` : `<div class="po-empty"><b>暂无采购订单</b>当前筛选下没有订单，换个状态看看，或新建一张。</div>`}
    </div>
  `;

  $$('#poStatusSeg button', p).forEach(b => b.onclick = () => { listFilter.status = b.dataset.status; renderList(); });
  $('#poKeyword', p).oninput = e => { listFilter.keyword = e.target.value; renderList(); const el = $('#poKeyword', p); if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } };
  $('#poSourceSel', p).onchange = e => { listFilter.source = e.target.value; renderList(); };
  $('#poSwitchBox', p).onchange = e => {
    S.settings[st.id] = { manualConfirm: e.target.checked };
    toast(e.target.checked ? '已开启：供应商改单需你手动确认（只影响之后生成的订单）' : '已关闭：供应商改单自动确认生效');
    renderList();
  };
  $('#poAcceptSwitchBtn', p).onclick = () => $('#poSwitchBox', p).click();
  $('#poNewBtn', p).onclick = openWayChooser;
  $$('[data-open-order]', p).forEach(el => el.onclick = () => showDetail(el.dataset.openOrder));
  $$('[data-quick-accept]', p).forEach(el => el.onclick = ev => { ev.stopPropagation(); openAccept(el.dataset.quickAccept); });
}

function hasPendingChange(o) {
  return (o.changes || []).some(c => c.status === 'pending');
}

function rowHtml(o) {
  const tags = [];
  if (hasPendingChange(o)) tags.push('<i class="po-tag warn">变更待确认</i>');
  const lastChange = (o.changes || [])[o.changes.length - 1];
  if (lastChange && lastChange.status === 'auto') tags.push('<i class="po-tag soft">变更已自动确认</i>');
  if (partialShipped(o)) tags.push('<i class="po-tag soft">部分发货</i>');
  if (partialAccepted(o)) tags.push('<i class="po-tag soft">部分验收</i>');
  if ((o.returns || []).length) tags.push('<i class="po-tag soft">有退货</i>');

  const st = STATUS[o.status] || { label: o.status, cls: 'soft' };
  const canAccept = o.status === 'toReceive' || o.status === 'accepted';
  return `<tr data-open-order="${o.id}">
    <td>
      <span class="po-no" data-open-order="${o.id}">${esc(o.no)}</span>
      <span class="po-sub"><i class="po-tag src">${SOURCE[o.source]}</i>${o.sourceNo && o.source !== 'direct' ? ` · ${esc(o.sourceNo)}` : ''}</span>
    </td>
    <td><b>${esc(o.supplierName)}</b><span class="po-sub">${esc(o.stallName)}</span></td>
    <td>${md(o.range.from)} ~ ${md(o.range.to)}<span class="po-sub">${daysBetween(o.range.from, o.range.to).length} 天</span></td>
    <td>${o.items.length} 项</td>
    <td class="num">${money(amountOf(o))}</td>
    <td><span class="po-tag ${st.cls}">${st.label}</span>${tags.join('')}</td>
    <td>${esc(o.createdAt)}</td>
    <td>
      <button class="po-btn link" data-open-order="${o.id}">详情</button>
      ${canAccept ? `<button class="po-btn link" data-quick-accept="${o.id}">验收</button>` : ''}
    </td>
  </tr>`;
}

const partialShipped = o => o.items.some(it => num(it.shippedQty) < num(it.qty));
const partialAccepted = o => o.items.some(it => num(it.receivedQty) < num(it.shippedQty));

/* ============================ 6. 详情页 ============================ */

const findOrder = id => S.orders.find(o => o.id === id);
const verOf = o => 1 + (o.changes || []).filter(c => c.status === 'approved' || c.status === 'auto').length;
const pendingChange = o => (o.changes || []).find(c => c.status === 'pending') || null;
const acceptCount = o => (o.accepts || []).length;
const acceptChangeNo = o => (o.accepts || []).reduce((m, a) => Math.max(m, a.changeNo || 0), 0);

function showDetail(id) {
  const o = findOrder(id);
  if (!o) { showList(); return; }
  view = { kind: 'detail', id };
  hideAll($('#poOrderNav'));
  breadcrumb('采购订单');
  const p = orderPage(); p.hidden = false;
  renderDetail(o);
}

function renderDetail(o) {
  const p = orderPage();
  const st = STATUS[o.status] || { label: o.status, cls: 'soft' };
  const pc = pendingChange(o);
  const days = daysBetween(o.range.from, o.range.to);
  const shipped = o.items.some(it => it.shippedQty != null);
  const tags = [
    hasPendingChange(o) ? '<i class="po-tag warn">变更待确认</i>' : '',
    partialShipped(o) && shipped ? '<i class="po-tag soft">部分发货</i>' : '',
    partialAccepted(o) && acceptCount(o) ? '<i class="po-tag soft">部分验收</i>' : '',
    (o.returns || []).length ? '<i class="po-tag soft">有退货</i>' : ''
  ].filter(Boolean).join('');
  const done = o.status === 'done' || o.status === 'canceled';

  const acts = [];
  if (o.status === 'wait') acts.push(`<button class="po-btn" data-act="withdraw">撤回订单</button>`);
  if (pc) {
    acts.push(`<button class="po-btn" data-act="cmp">查看变更</button>`);
    acts.push(`<button class="po-btn danger" data-act="reject">打回</button>`);
    acts.push(`<button class="po-btn primary" data-act="approve">同意变更</button>`);
  }
  if (o.status === 'toReceive' || o.status === 'accepted') {
    acts.push(`<button class="po-btn primary" data-act="accept">验收 / 改验收量</button>`);
  }
  if (o.status === 'accepted') acts.push(`<button class="po-btn" data-act="finish">验收完成（签名）</button>`);
  if (o.status === 'accepted' || o.status === 'returning') acts.push(`<button class="po-btn" data-act="return">发起退货</button>`);
  acts.push(`<button class="po-btn" data-act="back">返回列表</button>`);

  const lastChange = (o.changes || []).slice(-1)[0];
  const banner = pc
    ? `<div class="po-banner"><b>供应商于 ${esc(pc.at)} 修改了订单（V${pc.ver}），等待你确认。</b>
         <span>变更只影响对账与配送口径；确认后当前生效版本切换为 V${pc.ver}。</span>
         <button class="po-btn sm" data-act="cmp">查看对比</button></div>`
    : (o.status === 'canceled'
      ? `<div class="po-banner gray">该订单已撤回并取消，快照保留，可基于来源单号重新下单。</div>`
      : (o.status === 'done'
        ? `<div class="po-banner blue">订单已完成：验收量已锁定（签名留存），验收量与变更历史只读。</div>`
        : (lastChange && lastChange.status === 'auto'
          ? `<div class="po-banner gray">该订单已自动确认变更，当前为 V${verOf(o)}（按本单下单时的开关快照处理）。</div>`
          : (manualConfirmOn(o.stallId) ? `<div class="po-banner gray">本档口已开启「修改订单需手动确认」：供应商改单后需你确认才生效。</div>` : ''))));

  p.innerHTML = `
    <div class="po-detail-head">
      <div>
        <h2>${esc(o.no)} <span class="po-tag ${st.cls}">${st.label}</span>${tags}</h2>
        <div class="po-meta">
          ${esc(o.supplierName)}<i>|</i>${esc(o.stallName)}<i>|</i>
          ${md(o.range.from)} ~ ${md(o.range.to)}（${days.length} 天）<i>|</i>
          <i class="po-tag src">${SOURCE[o.source]}</i>${o.sourceNo && o.source !== 'direct' ? ` ${esc(o.sourceNo)}` : ''}
          <i>|</i>当前生效 V${verOf(o)}<i>|</i>${esc(o.createdAt)}
        </div>
      </div>
      <div class="po-actions">${acts.join('')}</div>
    </div>
    ${banner}

    <div class="po-section">
      <header><h3>订单信息</h3><div class="po-grow"></div>
        <span class="po-tag soft">${o.manualConfirm ? '下单时：变更需手动确认' : '下单时：变更自动确认'}</span></header>
      <div class="po-body">
        <div class="po-kv">
          <div><span>需求区间</span><b>${md(o.range.from)} ~ ${md(o.range.to)}（${days.length} 天）</b></div>
          <div><span>到货时段</span><b>${esc(o.slot)}</b></div>
          <div><span>收货联系人</span><b>${esc(o.receiver.contact)} · ${esc(o.receiver.phone)}</b></div>
          <div><span>订单金额</span><b>${money(amountOf(o))}</b></div>
          <div class="wide"><span>收货地址</span><b>${esc(o.receiver.addr)}</b></div>
          <div><span>已验收金额</span><b>${acceptCount(o) ? money(receivedAmountOf(o)) : '—'}</b></div>
          <div><span>验收修改次数</span><b>${acceptChangeNo(o) || '—'}</b></div>
        </div>
      </div>
    </div>

    <div class="po-section">
      <header><h3>采购明细</h3><div class="po-grow"></div>
        <span class="po-note">行数量 = 需求区间内每日数量之和（只读）</span></header>
      <div class="po-body flush">
        <table class="po-grid-table">
          <thead><tr>
            <th>商品 / SKU</th><th class="num">订单量</th><th class="num">单价</th><th class="num">金额</th>
            <th class="num">实际发货量</th><th class="num">实际验收量</th><th>差异</th><th>退货</th>
          </tr></thead>
          <tbody>${o.items.map(it => itemRowHtml(o, it)).join('')}</tbody>
        </table>
      </div>
    </div>

    ${changeSection(o)}
    ${shipSection(o)}
    ${acceptSection(o)}
    ${returnSection(o)}
    ${timelineSection(o)}
    ${simSection(o)}
  `;

  $$('[data-act]', p).forEach(b => b.onclick = () => {
    const a = b.dataset.act;
    if (a === 'back') return showList();
    if (a === 'withdraw') return withdrawOrder(o);
    if (a === 'cmp') return openCompare(o);
    if (a === 'approve') return decideChange(o, true);
    if (a === 'reject') return openRejectDrawer(o);
    if (a === 'accept') return openAccept(o.id);
    if (a === 'finish') return openAccept(o.id, true);
    if (a === 'return') return openReturn(o.id);
  });
  $$('[data-sim]', p).forEach(b => b.onclick = () => simAction(b.dataset.sim, o));
  $$('[data-open-cmp]', p).forEach(b => b.onclick = () => openCompare(o));
}

function itemRowHtml(o, it) {
  const ship = it.shippedQty, recv = it.receivedQty;
  const noShip = ship == null;
  const dShort = num(it.qty) - num(ship);
  const dLost = num(ship) - num(recv);
  const diff = noShip ? '<span class="po-diff ok">—</span>'
    : [
      dShort > 0 ? `<span class="po-diff bad">未发 ${trimQty(dShort)}</span>` : '',
      (recv != null && dLost > 0) ? `<span class="po-diff bad">未收 ${trimQty(dLost)}</span>` : ''
    ].filter(Boolean).join(' ') || '<span class="po-diff ok">—</span>';
  return `<tr>
    <td>
      <b>${esc(it.productName)}</b> <span class="po-tag soft">${esc(it.form)}</span>
      <span class="po-sub">${esc(it.spec)} · 下单单位 ${esc(it.unit)}</span>
      <div class="po-daily">每日需求：${(it.daily || []).map(d => `${md(d.date)} <em>${trimQty(d.qty)}</em>`).join(' · ') || '—'}</div>
    </td>
    <td class="num">${trimQty(it.qty)} ${esc(it.unit)}</td>
    <td class="num">${money(it.price)}</td>
    <td class="num">${money(num(it.qty) * num(it.price))}</td>
    <td class="num">${noShip ? '—' : `${trimQty(ship)} ${esc(it.unit)}`}</td>
    <td class="num">${recv == null ? '—' : `${trimQty(recv)} ${esc(it.unit)}`}</td>
    <td>${diff}</td>
    <td>${num(it.returnQty) > 0 ? `${trimQty(it.returnQty)} ${esc(it.unit)}` : '—'}</td>
  </tr>`;
}

/* 变动摘要：改量 / 改价 / 增行 / 删行 + 金额变化（PRD §9.2 口径） */
function diffSummary(c) {
  const before = c.before || [];
  const after = c.after || [];
  const beforeMap = {};
  before.forEach(x => { beforeMap[x.skuCode] = x; });
  const afterCodes = new Set(after.map(x => x.skuCode));
  let qty = 0, price = 0, added = 0, removed = 0;
  after.forEach(x => {
    const b = beforeMap[x.skuCode];
    if (!b) { added++; return; }
    if (num(b.qty) !== num(x.qty)) qty++;
    if (num(b.price) !== num(x.price)) price++;
  });
  before.forEach(b => { if (!afterCodes.has(b.skuCode)) removed++; });
  const parts = [];
  if (qty) parts.push(`${qty} 行改数量`);
  if (price) parts.push(`${price} 行改价`);
  if (removed) parts.push(`删除 ${removed} 行`);
  if (added) parts.push(`新增 ${added} 行`);
  const delta = num(c.afterAmount) - num(c.beforeAmount);
  const moneyTxt = delta === 0 ? '金额不变' : `金额 ${delta > 0 ? '+' : '−'}${money(Math.abs(delta))}`;
  return `${parts.length ? parts.join('、') : '数量单价无变化'}；${moneyTxt}`;
}

function changeSection(o) {
  const rows = (o.changes || []).map(c => {
    const label = { pending: '待确认', approved: '已同意', rejected: '已打回', auto: '已自动确认' }[c.status] || c.status;
    const cls = { pending: 'warn', approved: 'accepted', rejected: 'cancel', auto: 'soft' }[c.status] || 'soft';
    const delta = num(c.afterAmount) - num(c.beforeAmount);
    return `<tr class="${c.status === 'pending' ? 'po-cmp-change' : ''}">
      <td>V${c.ver}</td><td>${esc(c.at)}</td><td>${esc(c.by)}</td>
      <td>${esc(diffSummary(c))}</td>
      <td><i class="po-tag ${cls}">${label}</i>
        ${c.status === 'rejected' && c.rejectReason ? `<span class="po-sub">打回原因：${esc(c.rejectReason)}</span>` : ''}</td>
      <td>${delta === 0 ? '金额不变' : `${delta > 0 ? '+' : '−'}${money(Math.abs(delta))}`}</td>
      <td>${esc(c.reason || '—')}</td>
      <td><button class="po-btn link" data-open-cmp="1">对比</button>
        ${c.status === 'pending' ? '<span class="po-note">待处理</span>' : ''}</td>
    </tr>`;
  }).join('');
  return `<div class="po-section">
    <header><h3>变更记录</h3><div class="po-grow"></div>
      <span class="po-note">变更不单开单据，作为订单版本记录；同一时刻只允许 1 条在途</span></header>
    <div class="po-body flush">
      ${rows ? `<table class="po-table"><thead><tr>
        <th style="width:66px">版本</th><th style="width:108px">时间</th><th style="width:132px">发起方</th>
        <th>变动摘要</th><th style="width:150px">确认方式</th><th style="width:120px">金额变化</th>
        <th style="width:130px">变更原因</th><th style="width:96px">操作</th>
      </tr></thead><tbody>${rows}</tbody></table>`
        : `<div class="po-empty" style="padding:26px">暂未发生变更</div>`}
    </div>
  </div>`;
}

function shipSection(o) {
  const rows = (o.shipments || []).map(s => `<tr>
    <td>${esc(s.at)}</td>
    <td>${o.items.map(it => `<span class="po-sub" style="margin:0">${esc(it.productName)} <b>${trimQty(num((s.items || {})[it.skuCode]))}</b> ${esc(it.unit)}</span>`).join('')}</td>
    <td>${esc(s.driver || '—')} ${esc(s.phone || '')}</td>
    <td>${esc(s.eta || '—')}</td>
  </tr>`).join('');
  return `<div class="po-section">
    <header><h3>发货记录</h3><div class="po-grow"></div>
      <span class="po-note">供应商一次性发货；补送为线下处理，系统只记一次发货</span></header>
    <div class="po-body flush">
      ${rows ? `<table class="po-table"><thead><tr>
        <th style="width:110px">发货时间</th><th>本次实发</th><th style="width:190px">配送人 / 电话</th><th style="width:130px">预计送达</th>
      </tr></thead><tbody>${rows}</tbody></table>` : `<div class="po-empty" style="padding:26px">供应商尚未发货</div>`}
    </div>
  </div>`;
}

function acceptSection(o) {
  const list = (o.accepts || []).slice().reverse();
  const rows = list.map(a => {
    const changed = (a.items || []).filter(x => num(x.before) !== num(x.after));
    return `<tr>
      <td>第 ${a.changeNo} 次</td>
      <td>${esc(a.at)}</td>
      <td>${esc(a.by)}</td>
      <td><span class="po-tag method">${a.method === 'scale' ? '电子秤验收' : '手动验收'}</span></td>
      <td>${changed.length
        ? changed.map(x => `${esc(SKU[x.skuCode].productName)} <span class="po-cmp"><em class="old">${trimQty(x.before)}</em><span class="arrow">→</span><em class="new">${trimQty(x.after)}</em></span>`).join('；')
        : '验收量未变化'}</td>
      <td>${esc(a.note || '—')}</td>
      <td>${a.final ? `<span class="po-tag accepted">验收完成 · 已签名</span>` : '—'}</td>
    </tr>`;
  }).join('');
  return `<div class="po-section">
    <header><h3>验收记录（验收量变更历史）</h3><div class="po-grow"></div>
      <span class="po-note">每次修改留一条记录并固化验收方式；验收完成后锁定</span></header>
    <div class="po-body flush">
      ${rows ? `<table class="po-table"><thead><tr>
        <th style="width:90px">轮次</th><th style="width:110px">时间</th><th style="width:90px">操作人</th>
        <th style="width:110px">验收方式</th><th>改前 → 改后</th><th style="width:140px">修改说明</th><th style="width:150px">签名</th>
      </tr></thead><tbody>${rows}</tbody></table>` : `<div class="po-empty" style="padding:26px">尚未验收</div>`}
    </div>
  </div>`;
}

function returnSection(o) {
  const rows = (o.returns || []).map(r => {
    const label = { pending: '待供应商确认', confirmed: '供应商已同意', rejected: '供应商已退回', returned: '已完成退货' }[r.status] || r.status;
    const cls = { pending: 'wait', confirmed: 'accepted', rejected: 'warn', returned: 'done' }[r.status] || 'soft';
    return `<tr>
      <td>${esc(r.id)}</td><td>${esc(r.at)}</td>
      <td>${r.items.map(x => `${esc(SKU[x.skuCode].productName)} × ${trimQty(x.qty)}`).join('；')}</td>
      <td><i class="po-tag ${cls}">${label}</i></td>
      <td>${r.round > 1 ? `第 ${r.round} 轮` : '—'}</td>
      <td>${esc(r.supplierReply || '—')}</td>
    </tr>`;
  }).join('');
  return `<div class="po-section">
    <header><h3>退货记录</h3><div class="po-grow"></div>
      <span class="po-note">退货不影响订单金额；同一行同一时刻只允许一张在途退货单</span></header>
    <div class="po-body flush">
      ${rows ? `<table class="po-table"><thead><tr>
        <th style="width:130px">退货单号</th><th style="width:110px">时间</th><th>退货明细</th>
        <th style="width:130px">状态</th><th style="width:80px">轮次</th><th>供应商说明</th>
      </tr></thead><tbody>${rows}</tbody></table>` : `<div class="po-empty" style="padding:26px">暂无退货</div>`}
    </div>
  </div>`;
}

function timelineSection(o) {
  const rows = (o.timeline || []).slice().reverse()
    .map(t => `<div class="po-tl"><b>${esc(t.text)}</b><span>${esc(t.at)}</span></div>`).join('');
  return `<div class="po-section">
    <header><h3>状态时间轴</h3></header>
    <div class="po-timeline">${rows || '<div class="po-tl">—</div>'}</div>
  </div>`;
}

function simSection(o) {
  const list = [];
  if (o.status === 'wait') list.push(['confirm', '模拟：供应商确认订单']);
  if (['wait', 'confirmed', 'toReceive'].includes(o.status)) list.push(['modify', '模拟：供应商修改订单']);
  if (o.status === 'confirmed') list.push(['ship', '模拟：供应商确认发货（填发货量）']);
  const pendingReturn = (o.returns || []).find(r => r.status === 'pending');
  if (pendingReturn) { list.push(['agreeReturn', '模拟：供应商同意退货']); list.push(['rejectReturn', '模拟：供应商退回退货单']); }
  return `<div class="po-sim">
    <h5>供应商侧模拟（仅演示用，正式版由供应商端操作）</h5>
    <div class="po-sim-actions">
      ${list.length ? list.map(([k, label]) => `<button class="po-btn sm" data-sim="${k}">${label}</button>`).join('')
        : '<span class="po-note">当前状态没有可模拟的供应商动作</span>'}
    </div>
  </div>`;
}

/* ---------- 变更：对比 / 同意 / 打回 ---------- */

function openCompare(o) {
  const c = pendingChange(o);
  if (!c) {
    toast('当前没有在途变更');
    return;
  }
  const rows = c.after.map((a, i) => {
    const b = c.before[i] || {};
    const cell = (x, y, fmt) => (String(x) === String(y)
      ? `<span>${fmt(x)}</span>`
      : `<span class="old">${fmt(x)}</span><span class="arrow">→</span><span class="new">${fmt(y)}</span>`);
    return `<tr>
      <td>${esc(a.productName)}</td>
      <td class="num">${cell(b.qty, a.qty, trimQty)}</td>
      <td class="num">${cell(b.price, a.price, money)}</td>
      <td class="num">${cell(money(num(b.qty) * num(b.price)), money(num(a.qty) * num(a.price)), x => x)}</td>
      <td>${cell((b.daily || []).map(d => `${md(d.date)}:${trimQty(d.qty)}`).join(' '),
        (a.daily || []).map(d => `${md(d.date)}:${trimQty(d.qty)}`).join(' '), x => esc(x))}</td>
    </tr>`;
  }).join('');
  drawer(`变更对比 · V${c.ver - 1} → V${c.ver}`,
    `${o.no} · 供应商 ${c.at} 提交 · ${c.reason || '未填写原因'}`,
    `<p class="po-note" style="margin-bottom:10px">变动摘要：${esc(diffSummary(c))}；变更原因：${esc(c.reason || '未填写')}</p>
     <table class="po-cmp"><thead><tr>
      <th>商品</th><th class="num">数量</th><th class="num">单价</th><th class="num">金额</th><th>每日需求</th>
    </tr></thead><tbody>${rows}</tbody>
    <tfoot><tr><td><b>合计</b></td><td></td><td></td>
      <td class="num"><span class="old">${money(c.beforeAmount)}</span><span class="arrow">→</span><span class="new">${money(c.afterAmount)}</span></td>
      <td></td></tr></tfoot></table>
    <p class="po-note" style="margin-top:12px">确认后：当前生效版本切换为 V${c.ver}，变更记录留痕；打回需填原因，供应商可修改后重新提交（累计最多 3 轮，打回不占版本号）。</p>`,
    `<button class="po-btn" data-close="1">关闭</button>
     <button class="po-btn danger" id="cmpReject">打回重改</button>
     <button class="po-btn primary" id="cmpApprove">同意变更</button>`, true);
  $('#cmpApprove').onclick = () => { closeDrawer(); decideChange(o, true); };
  $('#cmpReject').onclick = () => { closeDrawer(); openRejectDrawer(o); };
  const cBtn = $('.mp-drawer-foot [data-close]');
  if (cBtn) cBtn.onclick = closeDrawer;
}

/* 打回：原因必填（PRD §9.3） */
function openRejectDrawer(o) {
  const c = pendingChange(o);
  if (!c) return;
  const round = c.round || 1;
  drawer('打回变更', `${o.no} · V${c.ver} · 第 ${round} 轮打回（累计最多 3 轮）`,
    `<p class="po-note">打回后订单保持上一版本，供应商可修改后重新提交；打回原因会同步给供应商。</p>
     <div class="po-form" style="margin-top:12px">
       <label>打回原因</label>
       <textarea id="rejectReason" placeholder="必填，如：单价高于本月协议价，请按 ¥62 重报"></textarea>
     </div>`,
    `<button class="po-btn" id="rjCancel">取消</button><button class="po-btn danger" id="rjSubmit">确认打回</button>`);
  $('#rjCancel').onclick = closeDrawer;
  $('#rjSubmit').onclick = () => {
    const reason = $('#rejectReason').value.trim();
    if (!reason) { toast('请填写打回原因'); return; }
    closeDrawer();
    decideChange(o, false, reason);
  };
}

function decideChange(o, pass, rejectReason) {
  const c = pendingChange(o);
  if (!c) return;
  if (pass) {
    o.items = c.after;
    c.status = 'approved';
    o.timeline.push({ at: nowStr(), text: `采购员同意变更，生效版本 V${c.ver}` });
    toast(`已同意变更，当前生效 V${c.ver}`);
  } else {
    c.status = 'rejected';
    c.rejectReason = rejectReason || '';
    c.round = (c.round || 1) + 1;
    o.timeline.push({ at: nowStr(), text: `采购员打回变更（第 ${c.round - 1} 轮）：${rejectReason || ''}` });
    toast('已打回，供应商可修改后重新提交');
  }
  renderDetail(o);
}

/* ---------- 撤回 ---------- */

function withdrawOrder(o) {
  if (o.status !== 'wait') { toast('只有待确认的订单可以撤回'); return; }
  const pc = pendingChange(o);
  if (pc) { pc.status = 'rejected'; }
  o.status = 'canceled';
  o.timeline.push({ at: nowStr(), text: '采购员撤回订单，订单已取消' });
  toast('订单已撤回并取消，快照保留');
  renderDetail(o);
}

/* ---------- 供应商模拟动作 ---------- */

function simAction(kind, o) {
  const sup = supplierOf(o.supplierId);
  if (kind === 'confirm') {
    o.status = 'confirmed';
    o.timeline.push({ at: nowStr(), text: `供应商 ${sup.name} 确认订单` });
    toast('供应商已确认订单');
    return renderDetail(o);
  }
  if (kind === 'modify') return openSupplierModify(o);
  if (kind === 'ship') return openSupplierShip(o);
  if (kind === 'agreeReturn') {
    const r = (o.returns || []).find(x => x.status === 'pending');
    if (!r) return;
    r.status = 'confirmed';
    r.items.forEach(x => {
      const it = o.items.find(i => i.skuCode === x.skuCode);
      if (it) it.returnQty = num(it.returnQty) + num(x.qty);
    });
    o.status = 'done';
    o.timeline.push({ at: nowStr(), text: `供应商同意退货（${r.id}），明细已标记退货` });
    toast('供应商已同意退货，订单收口为已完成');
    return renderDetail(o);
  }
  if (kind === 'rejectReturn') {
    const r = (o.returns || []).find(x => x.status === 'pending');
    if (!r) return;
    r.status = 'rejected';
    r.round = (r.round || 1) + 1;
    r.supplierReply = '已送出，不予退回，可协商补差价';
    o.timeline.push({ at: nowStr(), text: `供应商退回退货单（${r.id}），待采购员修改后重新提交` });
    toast('供应商已退回退货单，可修改后重新提交');
    return renderDetail(o);
  }
}

function openSupplierModify(o) {
  const rows = o.items.map(it => `<tr data-sku="${it.skuCode}">
    <td><b>${esc(it.productName)}</b><span class="po-sub">${esc(it.spec)} · ${trimQty(it.qty)} ${esc(it.unit)}</span></td>
    <td class="num"><input class="po-qty" data-f="qty" value="${trimQty(it.qty)}" inputmode="decimal"></td>
    <td class="num"><input class="po-qty" data-f="price" value="${trimQty(it.price)}" inputmode="decimal"></td>
  </tr>`).join('');
  drawer('模拟供应商修改订单', `${o.no} · ${o.supplierName}`,
    `<p class="po-note">供应商改数量或单价（如实发不足、临时涨价）。提交后按该订单下单时的开关快照处理：
      ${o.manualConfirm ? '本单为「需手动确认」，变更会进入待确认' : '本单为「自动确认」，变更立即生效'}。</p>
     <table class="po-grid-table"><thead><tr><th>商品</th><th class="num">数量</th><th class="num">单价</th></tr></thead>
     <tbody>${rows}</tbody></table>
     <div class="po-form" style="margin-top:14px">
       <label>修改原因</label><input class="po-input" id="simReason" placeholder="如：今日到货不足 2 箱" style="width:100%">
     </div>`,
    `<button class="po-btn" id="simCancel">取消</button><button class="po-btn primary" id="simSubmit">提交修改</button>`, true);

  $('#simCancel').onclick = closeDrawer;
  $('#simSubmit').onclick = () => {
    const after = o.items.map(it => {
      const tr = $(`tr[data-sku="${it.skuCode}"]`);
      const qty = num($('[data-f="qty"]', tr).value);
      const price = num($('[data-f="price"]', tr).value);
      if (qty <= 0) return null;
      return { ...it, qty, price, daily: rebalanceDaily(it.daily, qty) };
    }).filter(Boolean);
    if (!after.length) { toast('至少要保留一行且数量大于 0'); return; }
    const reason = $('#simReason').value.trim();
    const ver = verOf(o) + 1;
    const change = {
      ver, at: nowStr(), by: `供应商（${o.supplierName}）`,
      mode: o.manualConfirm ? 'manual' : 'auto',
      status: o.manualConfirm ? 'pending' : 'auto',
      reason, round: 1,
      before: JSON.parse(JSON.stringify(o.items)),
      after,
      beforeAmount: amountOf(o),
      afterAmount: after.reduce((a, x) => a + num(x.qty) * num(x.price), 0)
    };
    o.changes.push(change);
    if (change.status === 'auto') {
      o.items = after;
      o.timeline.push({ at: nowStr(), text: `供应商修改订单，按开关快照自动确认，生效版本 V${ver}` });
      toast(`供应商已修改订单（V${ver}），已自动确认`);
    } else {
      o.timeline.push({ at: nowStr(), text: `供应商提交修改，等待采购员确认（V${ver}）` });
      toast('供应商已提交修改，等待你确认');
    }
    closeDrawer();
    renderDetail(o);
  };
}

/* 改数量后把每日需求按比例折算（原型简化：最后一天吸收差额） */
function rebalanceDaily(daily, qty) {
  const list = (daily || []).map(d => ({ ...d }));
  if (!list.length) return [{ date: TODAY, qty }];
  const total = sumDaily(list);
  if (total === qty) return list;
  if (!total) { list[0].qty = qty; return list; }
  let acc = 0;
  list.forEach((d, i) => {
    if (i === list.length - 1) { d.qty = Math.max(0, Math.round((qty - acc) * 100) / 100); return; }
    d.qty = Math.round(d.qty * qty / total * 100) / 100;
    acc += d.qty;
  });
  return list.filter(d => num(d.qty) > 0);
}

function openSupplierShip(o) {
  const rows = o.items.map(it => `<tr data-sku="${it.skuCode}">
    <td><b>${esc(it.productName)}</b><span class="po-sub">订单量 ${trimQty(it.qty)} ${esc(it.unit)}</span></td>
    <td class="num"><input class="po-qty" data-f="ship" value="${trimQty(it.qty)}" inputmode="decimal"> ${esc(it.unit)}</td>
  </tr>`).join('');
  drawer('模拟供应商确认发货', `${o.no} · 一次性发货，填完即锁定`,
    `<p class="po-note">实际发货量可以小于订单量（部分发货）。发货后补送在线下处理，系统不记录补送。</p>
     <table class="po-grid-table"><thead><tr><th>商品</th><th class="num">实际发货量</th></tr></thead><tbody>${rows}</tbody></table>
     <div class="po-form" style="margin-top:14px">
       <label>配送人</label><input class="po-input" id="shipDriver" value="刘师傅" style="width:100%">
       <label>联系电话</label><input class="po-input" id="shipPhone" value="136****2201" style="width:100%">
       <label>预计送达</label><input class="po-input" id="shipEta" value="${md(o.range.from)} 07:00-09:00" style="width:100%">
     </div>`,
    `<button class="po-btn" id="shipCancel">取消</button><button class="po-btn primary" id="shipSubmit">确认发货</button>`);

  $('#shipCancel').onclick = closeDrawer;
  $('#shipSubmit').onclick = () => {
    const items = {};
    let bad = false;
    o.items.forEach(it => {
      const tr = $(`tr[data-sku="${it.skuCode}"]`);
      const v = num($('[data-f="ship"]', tr).value);
      if (v < 0 || v > num(it.qty)) { bad = true; return; }
      items[it.skuCode] = v;
      it.shippedQty = v;
    });
    if (bad) { toast('实际发货量不能大于订单量'); return; }
    o.shipments.push({
      at: nowStr(), driver: $('#shipDriver').value.trim(), phone: $('#shipPhone').value.trim(),
      eta: $('#shipEta').value.trim(), items
    });
    o.status = 'toReceive';
    o.timeline.push({ at: nowStr(), text: `供应商确认发货（实发 ${Object.values(items).reduce((a, b) => a + num(b), 0)} 项）` });
    closeDrawer();
    toast('已发货，订单进入待验收');
    renderDetail(o);
  };
}

/* ============================ 7. 新建订单向导 ============================ */

const MAX_DAYS = 31;
const wizPage = () => page('#poWizardPage', 'po-page');

function openWayChooser() {
  drawer('新建采购订单', '选择下单方式：直采不经过比价，询价要先向供应商询价再定标',
    `<div class="po-way">
      <div class="po-way-card" id="wayDirect">
        <div class="po-way-ico">⚡</div>
        <h4>直采下单</h4>
        <p>已有确定的供应商，直接按需求下单，不经过比价。<br>
           适合长期合作、价格已谈妥的供应商；默认单日到货，也可改成区间按天填。</p>
      </div>
      <div class="po-way-card" id="wayInquiry">
        <div class="po-way-ico">📋</div>
        <h4>询价下单</h4>
        <p>先按天填好需求，向多家供应商询价，收到报价再定标下单。<br>
           适合临时采购、需要比价的情况；定标后自动生成订单。</p>
      </div>
    </div>`,
    `<button class="po-btn" id="wayCancel">取消</button>`);
  $('#wayCancel').onclick = closeDrawer;
  $('#wayDirect').onclick = () => { closeDrawer(); startWizard('direct'); };
  $('#wayInquiry').onclick = () => { closeDrawer(); startWizard('inquiry'); };
}

function startWizard(mode) {
  const st = stallNow();
  const from = addDays(TODAY, 1);
  wiz = {
    mode, step: mode === 'direct' ? 1 : 1,
    supplierId: '', from, to: from, activeDay: from,
    items: [],                       /* [{skuCode, price, daily:{date:qty}}] */
    inquiry: { deadline: `${md(addDays(TODAY, 1))} 12:00`, supplierIds: SUPPLIERS.map(s => s.id) },
    receiver: { addr: '浦东新区世纪大道 1000 号 · 中央厨房收货口', contact: '张伟', phone: '138****8866', slot: '07:00-09:00', note: '' },
    stallId: st.id
  };
  view = { kind: 'wizard' };
  hideAll($('#poOrderNav'));
  breadcrumb('采购订单 · 新建');
  wizPage().hidden = false;
  renderWizard();
}

function wizDays() { return daysBetween(wiz.from, wiz.to); }
function wizItemOf(skuCode) { return wiz.items.find(i => i.skuCode === skuCode) || null; }
function wizQtyOn(skuCode, date) { const it = wizItemOf(skuCode); return it && it.daily[date] ? num(it.daily[date]) : 0; }
function wizRowTotal(it) { return Object.values(it.daily).reduce((a, b) => a + num(b), 0); }
function wizTotal() { return wiz.items.reduce((a, it) => a + wizRowTotal(it) * num(it.price), 0); }
function wizQtySum() { return wiz.items.reduce((a, it) => a + wizRowTotal(it), 0); }

function stepBar(stepLabels, active) {
  return `<div class="po-steps">${stepLabels.map((l, i) => `
    ${i ? '<span class="sep">›</span>' : ''}
    <div class="po-step ${i + 1 === active ? 'on' : (i + 1 < active ? 'done' : '')}">
      <i>${i + 1 < active ? '✓' : i + 1}</i>${l}
    </div>`).join('')}</div>`;
}

function renderWizard() {
  const p = wizPage();
  const direct = wiz.mode === 'direct';
  const labels = direct
    ? ['选择供应商', '需求区间与逐日填量', '总览', '收货与提交']
    : ['需求区间与逐日填量', '总览', '发起询价'];
  const head = `<div class="po-head">
      <div><h1>${direct ? '直采下单' : '询价下单'}</h1>
      <p>${direct ? '一供应商一单，提交后订单进入待确认并推送给供应商。'
        : '先按天填好需求 → 总览 → 发起询价；供应商按商品报价，比价后定标，定标即自动生成订单。'}</p></div>
      <div class="po-head-actions"><button class="po-btn" id="wizQuit">退出</button></div>
    </div>${stepBar(labels, wiz.step)}`;

  let body = '';
  if (direct && wiz.step === 1) body = stepSupplier();
  else if ((direct && wiz.step === 2) || (!direct && wiz.step === 1)) body = stepDemand();
  else if ((direct && wiz.step === 3) || (!direct && wiz.step === 2)) body = stepOverview();
  else if (direct && wiz.step === 4) body = stepReceiver();
  else body = stepLaunchInquiry();

  p.innerHTML = head + body;
  $('#wizQuit', p).onclick = () => { if (confirm('退出后本次填写的内容不会保存，确定退出？')) showList(); };

  if (direct && wiz.step === 1) {
    $$('[data-sup]', p).forEach(el => el.onclick = () => {
      wiz.supplierId = el.dataset.sup;
      renderWizard();
    });
    const next = $('#wizNext', p);
    if (next) next.onclick = () => {
      if (!wiz.supplierId) { toast('请先选择供应商'); return; }
      wiz.step = 2; renderWizard();
    };
  }

  if (body.includes('id="poDays"')) bindDemandStep();
  if ((direct && wiz.step === 3) || (!direct && wiz.step === 2)) bindOverviewStep();
  if (direct && wiz.step === 4) bindReceiverStep();
  if (!direct && wiz.step === 3) bindLaunchStep();
}

/* ---- 总览：上一步 / 下一步 ---- */
function bindOverviewStep() {
  const p = wizPage();
  const back = $('#wizBack', p);
  if (back) back.onclick = () => { wiz.step -= 1; renderWizard(); };
  const next = $('#wizNext', p);
  if (next) next.onclick = () => { wiz.step += 1; renderWizard(); };
}

/* ---- ① 选择供应商（直采） ---- */
function stepSupplier() {
  const cards = SUPPLIERS.map(s => `
    <div class="po-supplier ${wiz.supplierId === s.id ? 'on' : ''}" data-sup="${s.id}">
      ${wiz.supplierId === s.id ? '<span class="po-hit">✓</span>' : ''}
      <h5>${esc(s.name)}</h5>
      <p>${esc(s.contact)}</p>
      <p style="margin-top:6px">${s.types.map(t => `<i class="po-tag soft">${esc(t)}</i>`).join('')}</p>
      <p style="margin-top:6px">${Object.keys(s.quotes || {}).length} 个商品有预报价</p>
    </div>`).join('');
  return `<div class="po-section">
      <header><h3>选择供应商</h3><div class="po-grow"></div>
        <span class="po-note">只能一个供应商一张单；要下给另一家请再建一单</span></header>
      <div class="po-body"><div class="po-suppliers">${cards}</div></div>
      <div class="po-award-bar">
        <span class="po-note">选中供应商后，直采单价默认带出该供应商的预报价，可手工覆盖。</span>
        <div class="po-grow" style="flex:1"></div>
        <button class="po-btn primary" id="wizNext">下一步：填需求</button>
      </div>
    </div>`;
}

/* ---- ② 需求区间 + 逐日填量 ---- */
function stepDemand() {
  const days = wizDays();
  if (!days.includes(wiz.activeDay)) wiz.activeDay = days[0];
  const sup = wiz.supplierId ? supplierOf(wiz.supplierId) : null;

  const dayTabs = days.map(d => {
    const missing = wiz.items.filter(it => !num(it.daily[d])).length;
    return `<div class="po-day ${d === wiz.activeDay ? 'on' : ''}" data-day="${d}">
      <b>${md(d)}</b>周${WEEK[parseISO(d).getDay()]}${missing ? '<span class="dot"></span>' : '<span class="dot hide"></span>'}
    </div>`;
  }).join('');

    const rows = wiz.items.map(it => {
    const s = SKU[it.skuCode];
    const q = wizQtyOn(it.skuCode, wiz.activeDay);
    const pre = wiz.mode === 'direct' ? skuPriceOf(wiz.supplierId, it.skuCode) : null;
    const priceCell = wiz.mode === 'direct'
      ? `<input class="po-qty" data-price="${it.skuCode}" value="${trimQty(it.price)}" inputmode="decimal">
         ${pre != null && num(pre) === num(it.price) ? '<i class="po-tag soft">预报价</i>' : (pre != null ? '<i class="po-tag warn">改价</i>' : '<i class="po-tag soft">手填</i>')}`
      : `<span class="po-price">${pre != null ? money(pre) : '按商品报价'}</span>`;
    return `<tr data-sku="${it.skuCode}">
      <td><b>${esc(it.productName)}</b> <span class="po-tag soft">${esc(s.form)}</span>
        <span class="po-sub">${esc(s.spec)} · 下单单位 ${esc(s.unit)}</span></td>
      <td class="num"><input class="po-qty" data-qty="${it.skuCode}" value="${q ? trimQty(q) : ''}"
        inputmode="decimal" placeholder="这天不买可留空"> ${esc(s.unit)}</td>
      <td class="num">${priceCell}</td>
      <td class="num">${money(q * num(it.price))}</td>
      <td><button class="po-btn link" data-del="${it.skuCode}">删除</button></td>
    </tr>`;
  }).join('');

  const sumQty = wiz.items.reduce((a, it) => a + wizQtyOn(it.skuCode, wiz.activeDay), 0);
  const sumMoney = wiz.items.reduce((a, it) => a + wizQtyOn(it.skuCode, wiz.activeDay) * num(it.price), 0);

  const back = wiz.mode === 'direct'
    ? `<button class="po-btn" id="wizBack">上一步</button>` : '';
  return `<div class="po-section">
      <header><h3>需求区间与逐日填量</h3><div class="po-grow"></div>
        <span class="po-note">区间最长 ${MAX_DAYS} 天；只填每天的量，合计由系统汇总</span></header>
      <div class="po-body">
        <div class="po-range">
          <label>需求日期</label>
          <input type="date" id="wizFrom" value="${wiz.from}">
          <span>~</span>
          <input type="date" id="wizTo" value="${wiz.to}">
          <span class="po-note">共 ${days.length} 天</span>
          <span class="po-hint">${wiz.mode === 'direct' ? `供应商：${esc(sup ? sup.name : '未选择')}` : '供应商按商品报价，先填需求再发起询价'}</span>
        </div>
        <div class="po-days" id="poDays">${dayTabs}</div>
        <table class="po-grid-table">
          <thead><tr>
            <th>商品</th><th class="num" style="width:140px">${md(wiz.activeDay)} 当天数量</th>
            <th class="num" style="width:150px">单价</th><th class="num" style="width:110px">金额</th><th style="width:60px"></th>
          </tr></thead>
          <tbody>${rows || `<tr><td colspan="5"><div class="po-empty" style="padding:26px">这一天还没有商品。点右下角「添加商品」补一行。</div></td></tr>`}</tbody>
          <tfoot><tr class="po-sum-row">
            <td>当天合计</td><td class="num">${trimQty(sumQty)}</td><td></td>
            <td class="num">${money(sumMoney)}</td><td></td>
          </tr></tfoot>
        </table>
      </div>
      <div class="po-award-bar">
        ${back}
        <button class="po-btn" id="wizAdd">+ 添加商品</button>
        <div style="flex:1"></div>
        <span class="po-note">区间合计 ${trimQty(wizQtySum())} 项 · ${money(wizTotal())}</span>
        <button class="po-btn primary" id="wizNext">下一步：总览</button>
      </div>
    </div>`;
}

function bindDemandStep() {
  const p = wizPage();
  const redraw = () => renderWizard();

  $('#wizFrom', p).onchange = e => {
    const v = e.target.value;
    if (!v) return;
    if (v > wiz.to) { toast('起始日不能晚于结束日'); redraw(); return; }
    if (daysBetween(v, wiz.to).length > MAX_DAYS) { toast(`需求区间最长 ${MAX_DAYS} 天，请缩小范围`); redraw(); return; }
    wiz.from = v;
    if (!wizDays().includes(wiz.activeDay)) wiz.activeDay = v;
    redraw();
  };
  $('#wizTo', p).onchange = e => {
    const v = e.target.value;
    if (!v) return;
    if (v < wiz.from) { toast('结束日不能早于起始日'); redraw(); return; }
    if (daysBetween(wiz.from, v).length > MAX_DAYS) { toast(`需求区间最长 ${MAX_DAYS} 天，请缩小范围`); redraw(); return; }
    wiz.to = v;
    redraw();
  };
  $$('[data-day]', p).forEach(el => el.onclick = () => { wiz.activeDay = el.dataset.day; redraw(); });
  $$('[data-qty]', p).forEach(el => el.onchange = () => {
    const sku = el.dataset.qty;
    const it = wizItemOf(sku);
    if (!it) return;
    const raw = String(el.value).trim();
    if (raw === '') { delete it.daily[wiz.activeDay]; redraw(); return; }
    const v = num(el.value);
    if (!(v > 0)) { toast(`「${SKU[sku].productName}」数量需大于 0（这天不买请留空）`); redraw(); return; }
    it.daily[wiz.activeDay] = v;
    redraw();
  });
  $$('[data-price]', p).forEach(el => el.onchange = () => {
    const it = wizItemOf(el.dataset.price);
    if (!it) return;
    const v = num(el.value);
    if (v <= 0) { toast('单价必须大于 0'); redraw(); return; }
    it.price = v;
    redraw();
  });
  $$('[data-del]', p).forEach(el => el.onclick = () => {
    wiz.items = wiz.items.filter(x => x.skuCode !== el.dataset.del);
    redraw();
  });
  $('#wizAdd', p).onclick = openAddSku;
  const back = $('#wizBack', p);
  if (back) back.onclick = () => { wiz.step = 1; redraw(); };
  $('#wizNext', p).onclick = () => {
    if (!wiz.items.length) { toast('先添加要采购的商品'); return; }
    const empty = wiz.items.filter(it => wizRowTotal(it) <= 0);
    if (empty.length) {
      toast(`「${empty[0].productName}」在这几天都没有填数量`);
      wiz.activeDay = wizDays()[0];
      redraw();
      return;
    }
    wiz.step = wiz.step + 1;
    redraw();
  };
}

function openAddSku() {
  const used = new Set(wiz.items.map(i => i.skuCode));
  const rows = SKUS.map(s => `<tr>
      <td><b>${esc(s.productName)}</b> <span class="po-tag soft">${esc(s.form)}</span>
        <span class="po-sub">${esc(s.spec)} · 下单单位 ${esc(s.unit)}</span></td>
      <td class="num">${wiz.mode === 'direct' ? (skuPriceOf(wiz.supplierId, s.code) != null ? money(skuPriceOf(wiz.supplierId, s.code)) : '无预报价') : '待报价'}</td>
      <td class="num">${used.has(s.code) ? '<i class="po-tag soft">已添加</i>' : `<button class="po-btn sm" data-add="${s.code}">添加</button>`}</td>
    </tr>`).join('');
  drawer('添加商品', `${md(wiz.activeDay)} · 只列出已发布且在供的商品`,
    `<table class="po-grid-table"><thead><tr><th>商品</th><th class="num">参考价</th><th class="num">操作</th></tr></thead>
     <tbody>${rows}</tbody></table>`,
    `<button class="po-btn" id="addClose">完成</button>`, true);
  $('#addClose').onclick = () => { closeDrawer(); renderWizard(); };
  $$('[data-add]', $('.mp-drawer')).forEach(b => b.onclick = () => {
    const code = b.dataset.add;
    if (wizItemOf(code)) { toast('该商品已在本单中'); return; }
    const pre = wiz.mode === 'direct' ? skuPriceOf(wiz.supplierId, code) : null;
    wiz.items.push({ skuCode: code, productName: SKU[code].productName, price: pre != null ? pre : 0, daily: {} });
    toast(`已添加 ${SKU[code].productName}，请填写 ${md(wiz.activeDay)} 的数量`);
    closeDrawer();
    renderWizard();
  });
}

/* ---- ③ 总览 ---- */
function stepOverview() {
  const days = wizDays();
  const rows = wiz.items.map(it => {
    const total = wizRowTotal(it);
    return `<div class="po-ov-row">
      <div class="po-ov-name">${esc(it.productName)} <span class="po-tag soft">${esc(SKU[it.skuCode].form)}</span>
        <span class="po-sub">${esc(SKU[it.skuCode].spec)}</span></div>
      <div class="num">${trimQty(total)} ${esc(it.unit)}</div>
      <div class="num">${wiz.mode === 'direct' ? money(it.price) : '待报价'}</div>
      <div class="num">${wiz.mode === 'direct' ? money(total * num(it.price)) : '—'}</div>
      <div class="po-ov-daily">每日需求：${days.map(d => `${md(d)} <em>${trimQty(wizQtyOn(it.skuCode, d))}</em>`).join(' · ')}</div>
    </div>`;
  }).join('');
  const back = `<button class="po-btn" id="wizBack">上一步：改单天数量</button>`;
  const next = wiz.mode === 'direct'
    ? `<button class="po-btn primary" id="wizNext">下一步：收货与提交</button>`
    : `<button class="po-btn primary" id="wizNext">下一步：发起询价</button>`;
  return `<div class="po-section">
      <header><h3>总览</h3><div class="po-grow"></div>
        <span class="po-note">合计 = 各天之和（只读）；点「上一步」可回到单天改量</span></header>
      <div class="po-body">
        <div class="po-overview">${rows}</div>
        <div class="po-ov-total">
          <span>需求区间 <b>${md(wiz.from)} ~ ${md(wiz.to)}</b>（${days.length} 天）</span>
          <span>商品 <b>${wiz.items.length}</b> 个</span>
          <span>区间合计 <b>${trimQty(wizQtySum())}</b> 项</span>
          ${wiz.mode === 'direct' ? `<span>预估金额 <b>${money(wizTotal())}</b></span>` : ''}
        </div>
      </div>
      <div class="po-award-bar">${back}<div style="flex:1"></div>${next}</div>
    </div>`;
}

/* ---- ④ 收货与提交（直采） ---- */
function stepReceiver() {
  const r = wiz.receiver;
  return `<div class="po-section">
      <header><h3>收货信息与提交</h3></header>
      <div class="po-body">
        <div class="po-form">
          <label>收货地址</label><input class="po-input" id="rcAddr" value="${esc(r.addr)}">
          <label>联系人</label><input class="po-input" id="rcContact" value="${esc(r.contact)}">
          <label>联系电话</label><input class="po-input" id="rcPhone" value="${esc(r.phone)}">
          <label>到货时段</label>
          <select class="po-select" id="rcSlot">
            ${['06:00-08:00', '07:00-09:00', '09:00-11:00', '14:00-16:00'].map(s => `<option ${r.slot === s ? 'selected' : ''}>${s}</option>`).join('')}
          </select>
          <label>备注</label><textarea id="rcNote" placeholder="选填，给供应商的说明">${esc(r.note || '')}</textarea>
        </div>
      </div>
      <div class="po-award-bar">
        <button class="po-btn" id="wizBack">上一步</button>
        <div style="flex:1"></div>
        <span class="po-note">${wiz.items.length} 项 · 区间合计 ${trimQty(wizQtySum())} · 合计 ${money(wizTotal())}</span>
        <button class="po-btn primary" id="wizSubmit">提交订单</button>
      </div>
    </div>`;
}

function bindReceiverStep() {
  const p = wizPage();
  $('#wizBack', p).onclick = () => { wiz.step = 3; renderWizard(); };
  $('#wizSubmit', p).onclick = () => {
    const r = wiz.receiver;
    r.addr = $('#rcAddr', p).value.trim();
    r.contact = $('#rcContact', p).value.trim();
    r.phone = $('#rcPhone', p).value.trim();
    r.slot = $('#rcSlot', p).value;
    r.note = $('#rcNote', p).value.trim();
    if (!r.addr || !r.contact || !r.phone) { toast('请填写收货信息（地址、联系人、电话）'); return; }
    const st = stallNow();
    const sup = supplierOf(wiz.supplierId);
    const order = {
      id: uid('ord'), no: orderNo(S.seqOrder++), stallId: st.id, stallName: st.name,
      supplierId: sup.id, supplierName: sup.name,
      source: 'direct', sourceNo: '', status: 'wait',
      manualConfirm: manualConfirmOn(st.id),
      createdAt: nowStr(), range: { from: wiz.from, to: wiz.to }, slot: r.slot,
      receiver: { addr: r.addr, contact: r.contact, phone: r.phone },
      items: wiz.items.map(it => ({
        skuCode: it.skuCode, productName: SKU[it.skuCode].productName, form: SKU[it.skuCode].form,
        spec: SKU[it.skuCode].spec, unit: SKU[it.skuCode].unit,
        qty: wizRowTotal(it), price: it.price,
        daily: Object.keys(it.daily).sort().map(d => ({ date: d, qty: num(it.daily[d]) })),
        shippedQty: null, receivedQty: null, diffReason: '', returnIntent: false, returnQty: 0
      })),
      changes: [], shipments: [], accepts: [], returns: [],
      timeline: [{ at: nowStr(), text: '采购员创建订单（直采）' }]
    };
    S.orders.push(order);
    wiz = null;
    toast(`已下单：${order.no}，进入待确认`);
    showDetail(order.id);
  };
}

/* ---- 询价：③ 发起询价 ---- */
function stepLaunchInquiry() {
  return `<div class="po-section">
      <header><h3>发起询价</h3></header>
      <div class="po-body">
        <div class="po-form">
          <label>报价截止</label><input class="po-input" id="inqDeadline" value="${esc(wiz.inquiry.deadline)}" style="width:220px">
          <label>受邀供应商</label>
          <div style="display:flex;flex-wrap:wrap;gap:8px">
            ${SUPPLIERS.map(s => `<label class="po-sig-check"><input type="checkbox" data-inv="${s.id}"
              ${wiz.inquiry.supplierIds.includes(s.id) ? 'checked' : ''}> ${esc(s.name)}</label>`).join('')}
          </div>
        </div>
        <p class="po-note" style="margin-top:12px">供应商在询价单里看到「总览 + 每日明细」，按商品逐个填单价并确认；
          已报数量会显示为「已报 K/N 项」。比价只是把矩阵摊开看，不做推荐。</p>
      </div>
      <div class="po-award-bar">
        <button class="po-btn" id="wizBack">上一步</button>
        <div style="flex:1"></div>
        <span class="po-note">${wiz.items.length} 个商品 · 区间 ${md(wiz.from)} ~ ${md(wiz.to)}</span>
        <button class="po-btn primary" id="wizSubmit">发起询价</button>
      </div>
    </div>`;
}

function bindLaunchStep() {
  const p = wizPage();
  $('#wizBack', p).onclick = () => { wiz.step = 2; renderWizard(); };
  $$('[data-inv]', p).forEach(el => el.onchange = () => {
    const id = el.dataset.inv;
    if (el.checked) { if (!wiz.inquiry.supplierIds.includes(id)) wiz.inquiry.supplierIds.push(id); }
    else wiz.inquiry.supplierIds = wiz.inquiry.supplierIds.filter(x => x !== id);
  });
  $('#wizSubmit', p).onclick = () => {
    wiz.inquiry.deadline = $('#inqDeadline', p).value.trim();
    if (!wiz.inquiry.supplierIds.length) { toast('至少邀请 1 家供应商'); return; }
    if (!wiz.inquiry.deadline) { toast('请填写报价截止时间'); return; }
    const st = stallNow();
    const inq = {
      id: uid('inq'), no: inqNo(S.seqInq++), stallId: st.id, stallName: st.name, source: 'inquiry',
      range: { from: wiz.from, to: wiz.to }, deadline: wiz.inquiry.deadline, status: 'inquiring',
      createdAt: nowStr(),
      items: wiz.items.map(it => ({
        skuCode: it.skuCode,
        qty: wizRowTotal(it),
        daily: Object.keys(it.daily).sort().map(d => ({ date: d, qty: num(it.daily[d]) }))
      })),
      suppliers: wiz.inquiry.supplierIds.map(id => ({ id, name: supplierOf(id).name, status: 'pending', quotes: {} })),
      awards: {}, generatedOrders: []
    };
    S.inquiries.push(inq);
    wiz = null;
    toast(`询价单 ${inq.no} 已发出，等待供应商报价`);
    showInquiryDetail(inq.id);
  };
}

/* ============================ 8. 询价单（列表 + 详情 + 定标生单） ============================ */

const findInq = id => S.inquiries.find(x => x.id === id);
const INQ_STATUS = {
  inquiring: { label: '询价中', cls: 'confirm' },
  closed: { label: '已截止', cls: 'soft' },
  awarded: { label: '已定标', cls: 'accepted' },
  failed: { label: '已流标', cls: 'cancel' }
};

function showInquiryList() {
  view = { kind: 'inqList' };
  hideAll($('#poInquiryNav'));
  breadcrumb('询价单');
  const p = inqPage(); p.hidden = false;
  renderInquiryList();
}

function renderInquiryList() {
  const p = inqPage();
  const st = stallNow();
  const list = S.inquiries.filter(x => x.stallId === st.id)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  const quoted = s => Object.keys((s.quotes || {})).length;

  p.innerHTML = `
    <div class="po-head">
      <div><h1>询价单</h1>
        <p>采购计划产生的询价单与独立询价单统一在这里看。供应商按商品逐个报价，比价后定标，<b>定标即自动生成订单</b>。</p></div>
      <div class="po-head-actions"><button class="po-btn primary" id="inqNewBtn">+ 新建询价</button></div>
    </div>
    <div class="po-card">
      ${list.length ? `<table class="po-table"><thead><tr>
        <th style="width:180px">询价单号</th><th>来源 / 档口</th><th style="width:150px">需求区间</th>
        <th style="width:90px">商品</th><th style="width:160px">报价进度</th><th style="width:130px">截止</th>
        <th style="width:130px">状态</th><th style="width:90px">操作</th>
      </tr></thead><tbody>
        ${list.map(x => {
          const s = INQ_STATUS[x.status] || { label: x.status, cls: 'soft' };
          const done = x.suppliers.filter(v => v.status === 'quoted').length;
          return `<tr>
            <td><span class="po-no" data-open-inq="${x.id}">${esc(x.no)}</span>
              <span class="po-sub">${esc(x.createdAt)}</span></td>
            <td><i class="po-tag src">${SOURCE[x.source]}</i><span class="po-sub">${esc(x.stallName)}</span></td>
            <td>${md(x.range.from)} ~ ${md(x.range.to)}<span class="po-sub">${daysBetween(x.range.from, x.range.to).length} 天</span></td>
            <td>${x.items.length} 项</td>
            <td>${x.suppliers.length} 家受邀 · 已报 ${done} 家
              <span class="po-sub">${x.items.map(it => {
                const got = x.suppliers.filter(v => (v.quotes || {})[it.skuCode]).length;
                return `${esc(SKU[it.skuCode].productName)} ${got}/${x.suppliers.length}`;
              }).join(' · ')}</span></td>
            <td>${esc(x.deadline)}</td>
            <td><span class="po-tag ${s.cls}">${s.label}</span>
              ${x.generatedOrders && x.generatedOrders.length ? `<i class="po-tag soft">已转 ${x.generatedOrders.length} 单</i>` : ''}</td>
            <td><button class="po-btn link" data-open-inq="${x.id}">详情</button></td>
          </tr>`;
        }).join('')}
      </tbody></table>` : `<div class="po-empty"><b>暂无询价单</b>可以从这里新建询价，或在采购计划里发起询价。</div>`}
    </div>
  `;
  $('#inqNewBtn', p).onclick = () => startWizard('inquiry');
  $$('[data-open-inq]', p).forEach(el => el.onclick = () => showInquiryDetail(el.dataset.openInq));
}

function showInquiryDetail(id) {
  const x = findInq(id);
  if (!x) { showInquiryList(); return; }
  view = { kind: 'inqDetail', id };
  hideAll($('#poInquiryNav'));
  breadcrumb('询价单');
  const p = inqPage(); p.hidden = false;
  renderInquiryDetail(x);
}

function renderInquiryDetail(x) {
  const p = inqPage();
  const s = INQ_STATUS[x.status] || { label: x.status, cls: 'soft' };
  const days = daysBetween(x.range.from, x.range.to);
  const canAward = x.status === 'inquiring' || x.status === 'closed';

  /* 每行的最低价（只高亮，不给推荐） */
  const lowOf = skuCode => {
    const prices = x.suppliers.map(v => ({ id: v.id, p: (v.quotes || {})[skuCode] }))
      .filter(o => o.p && num(o.p.price) > 0)
      .map(o => num(o.p.price));
    return prices.length ? Math.min(...prices) : null;
  };

  const matrixRows = x.items.map(it => {
    const low = lowOf(it.skuCode);
    const cells = x.suppliers.map(v => {
      const q = (v.quotes || {})[it.skuCode];
      if (!q) return '<td class="none">未报价</td>';
      const picked = (x.awards[it.skuCode] || {}).supplierId === v.id;
      if (picked) return `<td class="low">${money(q.price)} <i class="po-tag accepted">已定标</i></td>`;
      return `<td class="${num(q.price) === low ? 'low' : ''}">${money(q.price)}</td>`;
    }).join('');
    const pick = canAward
      ? `<td><select class="po-select" data-award="${it.skuCode}" style="height:28px">
           <option value="">选择供应商</option>
           ${x.suppliers.filter(v => (v.quotes || {})[it.skuCode]).map(v =>
             `<option value="${v.id}" ${(x.awards[it.skuCode] || {}).supplierId === v.id ? 'selected' : ''}>${esc(v.name)}</option>`).join('')}
         </select></td>` : `<td>${esc(awardName(x, it.skuCode))}</td>`;
    return `<tr data-row="${it.skuCode}">
      <td><b>${esc(SKU[it.skuCode].productName)}</b>
        <span class="po-sub">合计 ${trimQty(it.qty)} ${esc(SKU[it.skuCode].unit)} ·
          ${(it.daily || []).map(d => `${md(d.date)} ${trimQty(d.qty)}`).join(' · ')}</span></td>
      ${cells}${pick}
    </tr>`;
  }).join('');

  const awarded = Object.keys(x.awards || {}).length;
  const est = Object.keys(x.awards || {}).reduce((a, sku) => {
    const it = x.items.find(i => i.skuCode === sku);
    const aw = x.awards[sku];
    return a + (it ? num(it.qty) * num(aw.price) : 0);
  }, 0);

  const board = x.suppliers.map(v => {
    const got = Object.keys(v.quotes || {}).length;
    const total = x.items.length;
    const cls = v.status === 'quoted' ? 'quoted' : (v.status === 'timeout' ? 'timeout' : '');
    const label = v.status === 'quoted' ? '已报价' : (v.status === 'timeout' ? '超时未报价' : '待报价');
    return `<div class="po-board-card ${cls}">
      <h5>${esc(v.name)}</h5>
      <p>${label} · 已报 ${got}/${total} 项</p>
      <div class="po-progress"><i style="width:${total ? Math.round(got / total * 100) : 0}%"></i></div>
    </div>`;
  }).join('');

  p.innerHTML = `
    <div class="po-detail-head">
      <div>
        <h2>${esc(x.no)} <span class="po-tag ${s.cls}">${s.label}</span>
          ${x.generatedOrders && x.generatedOrders.length ? `<i class="po-tag soft">已转 ${x.generatedOrders.length} 单</i>` : ''}</h2>
        <div class="po-meta">
          <i class="po-tag src">${SOURCE[x.source]}</i> ${esc(x.stallName)}<i>|</i>
          ${md(x.range.from)} ~ ${md(x.range.to)}（${days.length} 天）<i>|</i>截止 ${esc(x.deadline)}
        </div>
      </div>
      <div class="po-actions"><button class="po-btn" id="inqBack">返回询价单列表</button></div>
    </div>

    <div class="po-section">
      <header><h3>需求明细（总览 + 每日）</h3><div class="po-grow"></div>
        <span class="po-note">供应商看到的就是这份需求：合计数量 + 每日明细，按商品报价</span></header>
      <div class="po-body flush">
        <table class="po-grid-table"><thead><tr>
          <th>商品</th><th class="num" style="width:120px">合计数量</th><th>每日需求</th>
        </tr></thead><tbody>
          ${x.items.map(it => `<tr>
            <td><b>${esc(SKU[it.skuCode].productName)}</b> <span class="po-tag soft">${esc(SKU[it.skuCode].form)}</span>
              <span class="po-sub">${esc(SKU[it.skuCode].spec)}</span></td>
            <td class="num">${trimQty(it.qty)} ${esc(SKU[it.skuCode].unit)}</td>
            <td>${(it.daily || []).map(d => `${md(d.date)} <em>${trimQty(d.qty)}</em>`).join(' · ')}</td>
          </tr>`).join('')}
        </tbody></table>
      </div>
    </div>

    <div class="po-section">
      <header><h3>供应商报价进度</h3></header>
      <div class="po-body"><div class="po-board">${board}</div></div>
    </div>

    <div class="po-section">
      <header><h3>报价比较与定标</h3><div class="po-grow"></div>
        <span class="po-note">最低价仅高亮，不排序、不推荐；逐商品选供应商</span></header>
      <div class="po-body flush">
        <table class="po-matrix">
          <thead><tr>
            <th>商品</th>
            ${x.suppliers.map(v => `<th>${esc(v.name)}</th>`).join('')}
            <th style="width:170px">${canAward ? '定标' : '定标结果'}</th>
          </tr></thead>
          <tbody>${matrixRows}</tbody>
        </table>
      </div>
      ${canAward ? `<div class="po-award-bar">
        <button class="po-btn" id="inqLowest">一键选择价格最低的供应商</button>
        <div style="flex:1"></div>
        <span class="po-note">已选 ${awarded}/${x.items.length} · 预估总价 ${money(est)}</span>
        <button class="po-btn primary" id="inqAward">确认定标（自动生单）</button>
      </div>` : `<div class="po-award-bar">
        <span class="po-note">${x.status === 'awarded'
          ? `已定标并自动生成 ${x.generatedOrders.length} 张订单`
          : '询价单已流标，不生成订单'}</span>
        <div style="flex:1"></div>
        ${x.generatedOrders && x.generatedOrders.length ? '<button class="po-btn" id="inqGoOrders">查看订单</button>' : ''}
      </div>`}
    </div>

    <div class="po-sim">
      <h5>供应商侧模拟（仅演示用）</h5>
      <div class="po-sim-actions">
        <button class="po-btn sm" id="simQuote" ${canAward ? '' : 'disabled'}>模拟：供应商按商品报价</button>
        <button class="po-btn sm" id="simTimeout" ${canAward ? '' : 'disabled'}>模拟：到点未报（超时）</button>
      </div>
    </div>
  `;

  $('#inqBack', p).onclick = () => showInquiryList();
  $$('[data-award]', p).forEach(sel => sel.onchange = () => {
    const sku = sel.dataset.award;
    const supId = sel.value;
    if (!supId) { delete x.awards[sku]; }
    else {
      const v = x.suppliers.find(s2 => s2.id === supId);
      x.awards[sku] = { supplierId: supId, price: num((v.quotes || {})[sku].price) };
    }
    renderInquiryDetail(x);
  });
  const lowBtn = $('#inqLowest', p);
  if (lowBtn) lowBtn.onclick = () => {
    x.items.forEach(it => {
      const cands = x.suppliers.filter(v => (v.quotes || {})[it.skuCode])
        .sort((a, b) => num(a.quotes[it.skuCode].price) - num(b.quotes[it.skuCode].price));
      if (cands.length) x.awards[it.skuCode] = { supplierId: cands[0].id, price: num(cands[0].quotes[it.skuCode].price) };
    });
    toast('已按每个商品的最低价选择供应商');
    renderInquiryDetail(x);
  };
  const awardBtn = $('#inqAward', p);
  if (awardBtn) awardBtn.onclick = () => doAward(x);
  const goBtn = $('#inqGoOrders', p);
  if (goBtn) goBtn.onclick = () => showList();
  const qBtn = $('#simQuote', p);
  if (qBtn) qBtn.onclick = () => openSimQuote(x);
  const tBtn = $('#simTimeout', p);
  if (tBtn) tBtn.onclick = () => {
    x.suppliers.filter(v => v.status === 'pending').forEach(v => { v.status = 'timeout'; });
    toast('未报价的供应商已置为超时未报价');
    renderInquiryDetail(x);
  };
}

function awardName(x, skuCode) {
  const aw = x.awards[skuCode];
  if (!aw) return '未成交';
  const v = x.suppliers.find(s => s.id === aw.supplierId);
  return `${v ? v.name : ''} · ${money(aw.price)}`;
}

function openSimQuote(x) {
  const pend = x.suppliers.filter(v => v.status !== 'quoted');
  const who = pend.length ? pend[0] : x.suppliers[0];
  const rows = x.items.map(it => {
    const pre = skuPriceOf(who.id, it.skuCode);
    const cur = (who.quotes || {})[it.skuCode];
    return `<tr data-sku="${it.skuCode}">
      <td><b>${esc(SKU[it.skuCode].productName)}</b>
        <span class="po-sub">合计 ${trimQty(it.qty)} ${esc(SKU[it.skuCode].unit)}</span></td>
      <td class="num"><input class="po-qty" data-f="price" value="${cur ? trimQty(cur.price) : (pre != null ? trimQty(pre) : '')}"
        placeholder="填单价" inputmode="decimal"></td>
    </tr>`;
  }).join('');
  drawer('模拟供应商报价', `${x.no} · ${who.name}`,
    `<p class="po-note">供应商看到总览与每日明细，按商品逐个填单价并确认；可以只报部分商品，未报的进不了比价。</p>
     <table class="po-grid-table"><thead><tr><th>商品</th><th class="num">单价（元 / 下单单位）</th></tr></thead>
     <tbody>${rows}</tbody></table>`,
    `<button class="po-btn" id="qCancel">取消</button><button class="po-btn primary" id="qSubmit">确认报价</button>`, true);
  $('#qCancel').onclick = closeDrawer;
  $('#qSubmit').onclick = () => {
    let n = 0;
    x.items.forEach(it => {
      const tr = $(`tr[data-sku="${it.skuCode}"]`);
      const v = num($('[data-f="price"]', tr).value);
      if (v > 0) { who.quotes[it.skuCode] = { price: v, at: nowStr() }; n++; }
    });
    if (!n) { toast('至少填一个商品的报价'); return; }
    who.status = 'quoted';
    closeDrawer();
    toast(`${who.name} 已报价 ${n}/${x.items.length} 项`);
    renderInquiryDetail(x);
  };
}

function doAward(x) {
  const picked = x.items.filter(it => x.awards[it.skuCode]);
  if (!picked.length) { toast('请至少为一个商品选择供应商'); return; }
  const groups = {};
  picked.forEach(it => {
    const supId = x.awards[it.skuCode].supplierId;
    (groups[supId] = groups[supId] || []).push(it);
  });
  const st = stallNow();
  const created = [];
  Object.keys(groups).forEach(supId => {
    const sup = supplierOf(supId);
    const items = groups[supId].map(it => ({
      skuCode: it.skuCode, productName: SKU[it.skuCode].productName, form: SKU[it.skuCode].form,
      spec: SKU[it.skuCode].spec, unit: SKU[it.skuCode].unit,
      qty: it.qty, price: num(x.awards[it.skuCode].price), daily: it.daily,
      shippedQty: null, receivedQty: null, diffReason: '', returnIntent: false, returnQty: 0
    }));
    const order = {
      id: uid('ord'), no: orderNo(S.seqOrder++), stallId: st.id, stallName: st.name,
      supplierId: sup.id, supplierName: sup.name,
      source: x.source === 'plan' ? 'plan' : 'inquiry', sourceNo: x.no, status: 'wait',
      manualConfirm: manualConfirmOn(st.id),
      createdAt: nowStr(), range: { from: x.range.from, to: x.range.to }, slot: '07:00-09:00',
      receiver: { addr: '浦东新区世纪大道 1000 号 · 中央厨房收货口', contact: '张伟', phone: '138****8866' },
      items, changes: [], shipments: [], accepts: [], returns: [],
      timeline: [{ at: nowStr(), text: `询价单 ${x.no} 定标，自动生成订单` }]
    };
    S.orders.push(order);
    created.push(order);
  });
  x.status = 'awarded';
  x.generatedOrders = created.map(o => o.no);
  const stMap = (S.settings[st.id] || {});
  toast(`定标成功，已自动生成 ${created.length} 张订单`);
  renderInquiryDetail(x);
}

/* ============================ 9. 验收（保存验收量 / 验收完成 + 电子签名） ============================ */

let acceptDraft = null;

function openAccept(orderId, jumpToFinish = false) {
  const o = findOrder(orderId);
  if (!o) return;
  if (o.status === 'done') { toast('订单已完成，验收量已锁定'); return; }
  if (o.items.every(it => it.shippedQty == null)) { toast('供应商还未发货，暂不能验收'); return; }
  acceptDraft = {
    o, jumpToFinish,
    method: 'manual',
    rows: o.items.map(it => ({
      skuCode: it.skuCode,
      value: it.receivedQty == null ? num(it.shippedQty) : num(it.receivedQty),
      reason: it.diffReason || ''
    }))
  };
  renderAcceptDrawer();
}

function renderAcceptDrawer() {
  const { o, rows, method } = acceptDraft;
  const head = `<div class="po-accept-head">
      <div><b>${esc(o.no)}</b> <span class="po-note">${esc(o.supplierName)} · ${md(o.range.from)} ~ ${md(o.range.to)}</span></div>
      <div class="po-grow"></div>
      <div class="po-method">
        <label class="${method === 'manual' ? 'on' : ''}" data-method="manual"><input type="radio" name="poMethod" ${method === 'manual' ? 'checked' : ''}>手动验收</label>
        <label class="off" data-method="scale" title="电子秤验收需对接设备，本期暂未开放"><input type="radio" name="poMethod" disabled>电子秤验收
          <i class="po-tag reserved">预留</i></label>
      </div>
    </div>`;

  const body = rows.map(r => {
    const it = o.items.find(i => i.skuCode === r.skuCode);
    const ship = num(it.shippedQty);
    const lost = ship - num(r.value);
    const short = num(it.qty) - ship;
    const bad = num(r.value) > ship;
    return `<tr data-sku="${r.skuCode}">
      <td><b>${esc(it.productName)}</b><span class="po-sub">${esc(it.spec)} · ${esc(it.unit)}</span></td>
      <td class="num">${trimQty(it.qty)}</td>
      <td class="num">${trimQty(ship)}</td>
      <td class="num"><input class="po-qty ${bad ? 'bad' : ''}" data-accept="${r.skuCode}" value="${trimQty(r.value)}" inputmode="decimal"></td>
      <td>${[
        short > 0 ? `<span class="po-diff bad">未发 ${trimQty(short)}</span>` : '',
        lost > 0 ? `<span class="po-diff bad">未收 ${trimQty(lost)}</span>` : '',
        (short <= 0 && lost <= 0) ? '<span class="po-diff ok">—</span>' : ''
      ].filter(Boolean).join(' ')}</td>
      <td>
        <select class="po-select" data-reason="${r.skuCode}" style="height:28px;width:130px" ${lost > 0 ? '' : 'disabled'}>
          <option value="">选择原因</option>
          ${['数量短缺', '质量问题', '规格不符', '临期', '其他'].map(v => `<option ${r.reason === v ? 'selected' : ''}>${v}</option>`).join('')}
        </select>
      </td>
    </tr>`;
  }).join('');

  const history = (o.accepts || []).slice().reverse().map(a => {
    const changed = (a.items || []).filter(x => num(x.before) !== num(x.after));
    return `<div class="po-his-row">
      <div>${esc(a.at)}</div>
      <div class="po-his-what">第 ${a.changeNo} 次 · ${a.method === 'scale' ? '电子秤验收' : '手动验收'} ·
        ${changed.length ? changed.map(x => `${esc(SKU[x.skuCode].productName)} <em>${trimQty(x.before)}→${trimQty(x.after)}</em>`).join('；') : '无变化'}
        ${a.final ? '<i class="po-tag accepted">验收完成 · 已签名</i>' : ''}</div>
      <div>${esc(a.by)}</div>
    </div>`;
  }).join('');

  drawer('验收 / 修改验收量', `${o.no} · 已修改 ${acceptChangeNo(o)} 次`,
    `${head}
     <table class="po-grid-table"><thead><tr>
       <th>商品</th><th class="num">订单量</th><th class="num">实际发货量</th>
       <th class="num" style="width:110px">实际验收量</th><th>差异</th><th style="width:140px">差异原因</th>
     </tr></thead><tbody>${body}</tbody></table>
     <div class="po-form" style="margin-top:12px">
       <label>修改说明</label><input class="po-input" id="accNote" placeholder="选填，如：面粉补送 2 袋" style="width:100%">
     </div>
     <p class="po-note" style="margin-top:10px">实际验收量不能大于实际发货量；每次保存都会生成一条「验收量变更记录」并固化验收方式。
       补送为线下处理，到货后回到这里把数量往上改即可。完成验收需电子签名，完成后锁定。</p>
     ${history ? `<h5 style="margin:16px 0 6px;color:#4d688c;font-size:12.5px">验收量变更历史</h5><div class="po-history">${history}</div>` : ''}`,
    `<button class="po-btn" id="accCancel">取消</button>
     <button class="po-btn" id="accSave">保存验收量</button>
     <button class="po-btn primary" id="accFinish">验收完成（签名）</button>`, true);

  const dw = $('.mp-drawer');
  $$('[data-method]', dw).forEach(el => el.onclick = () => {
    if (el.dataset.method === 'scale') { toast('电子秤验收需对接设备，本期暂未开放'); return; }
    acceptDraft.method = 'manual';
    renderAcceptDrawer();
  });
  $$('[data-accept]', dw).forEach(inp => inp.oninput = () => {
    const r = acceptDraft.rows.find(x => x.skuCode === inp.dataset.accept);
    r.value = Math.max(0, num(inp.value));
    const it = o.items.find(i => i.skuCode === r.skuCode);
    inp.classList.toggle('bad', num(r.value) > num(it.shippedQty));
    const sel = $(`[data-reason="${r.skuCode}"]`);
    if (sel) sel.disabled = !(num(it.shippedQty) - num(r.value) > 0);
  });
  $$('[data-reason]', dw).forEach(sel => sel.onchange = () => {
    const r = acceptDraft.rows.find(x => x.skuCode === sel.dataset.reason);
    r.reason = sel.value;
  });
  $('#accCancel').onclick = () => { acceptDraft = null; closeDrawer(); };
  $('#accSave').onclick = () => saveAccept(false);
  $('#accFinish').onclick = () => saveAccept(true);
}

function collectAcceptRows() {
  const { o, rows } = acceptDraft;
  const bad = rows.find(r => {
    const it = o.items.find(i => i.skuCode === r.skuCode);
    return num(r.value) > num(it.shippedQty);
  });
  if (bad) return { error: `实际验收量不能大于实际发货量（${trimQty(o.items.find(i => i.skuCode === bad.skuCode).shippedQty)}）` };
  const needReason = rows.find(r => {
    const it = o.items.find(i => i.skuCode === r.skuCode);
    return num(it.shippedQty) - num(r.value) > 0 && !r.reason;
  });
  if (needReason) return { error: `「${SKU[needReason.skuCode].productName}」存在少收，请选择差异原因` };
  return { ok: true };
}

function saveAccept(finish) {
  const { o, rows, method } = acceptDraft;
  const chk = collectAcceptRows();
  if (chk.error) { toast(chk.error); return; }

  if (finish) {
    if (!acceptCount(o)) { toast('请先保存验收量'); return; }
    if (acceptDraft.savedThisTime === false) { /* 继续，用已有记录 */ }
    return openSignature(sig => {
      const rec = {
        at: nowStr(), by: '李库管', method, changeNo: acceptChangeNo(o) + 1,
        note: ($('#accNote') ? $('#accNote').value.trim() : '') || '验收完成',
        items: rows.map(r => {
          const it = o.items.find(i => i.skuCode === r.skuCode);
          return { skuCode: r.skuCode, before: it.receivedQty == null ? 0 : num(it.receivedQty), after: num(r.value), diffReason: r.reason };
        }),
        final: true, sig, signedBy: '李库管'
      };
      o.accepts.push(rec);
      rows.forEach(r => {
        const it = o.items.find(i => i.skuCode === r.skuCode);
        it.receivedQty = num(r.value);
        it.diffReason = r.reason || '';
      });
      o.status = 'done';
      o.timeline.push({ at: nowStr(), text: '李库管 验收完成并电子签名，订单已完成（验收量锁定）' });
      acceptDraft = null;
      closeDrawer();
      toast(`验收完成，已签名，订单 ${o.no} 已完成并锁定`);
      renderDetail(o);
    });
  }

  /* 保存验收量：与上次值比较，有变化才留痕 */
  const changed = rows.filter(r => {
    const it = o.items.find(i => i.skuCode === r.skuCode);
    return num(r.value) !== (it.receivedQty == null ? -1 : num(it.receivedQty));
  });
  if (!changed.length) { toast('验收量没有变化'); return; }

  const note = $('#accNote') ? $('#accNote').value.trim() : '';
  const rec = {
    at: nowStr(), by: '李库管', method, changeNo: acceptChangeNo(o) + 1, note,
    items: rows.map(r => {
      const it = o.items.find(i => i.skuCode === r.skuCode);
      return { skuCode: r.skuCode, before: it.receivedQty == null ? 0 : num(it.receivedQty), after: num(r.value), diffReason: r.reason };
    }),
    final: false, sig: null, signedBy: ''
  };
  o.accepts.push(rec);
  rows.forEach(r => {
    const it = o.items.find(i => i.skuCode === r.skuCode);
    it.receivedQty = num(r.value);
    it.diffReason = r.reason || '';
  });
  if (o.status === 'toReceive') o.status = 'accepted';
  o.timeline.push({ at: nowStr(), text: `李库管 ${acceptCount(o) > 1 ? '修改' : '保存'}验收量（手动验收，第 ${rec.changeNo} 次）` });
  acceptDraft = null;
  closeDrawer();
  toast(`验收量已保存（第 ${rec.changeNo} 次修改），差异 ${changed.filter(x => { const it = o.items.find(i => i.skuCode === x.skuCode); return num(it.shippedQty) - num(x.value) > 0; }).length} 行`);
  renderDetail(o);
}

/* ---------- 电子签名板 ---------- */
function openSignature(onDone) {
  drawer('电子签名', '验收完成必须签名：签名图 + 签名人 + 时间写入验收单（PC 手写板）',
    `<div class="po-sig-wrap">
       <canvas class="po-sig" id="poSig"></canvas>
       <div class="po-sig-hint">请验收人 <b>李库管</b> 在框内手写签名；移动端与电子秤端后续接入同款组件。</div>
       <div class="po-sig-actions"><button class="po-btn sm" id="poSigClear">清除重写</button></div>
     </div>`,
    `<button class="po-btn" id="poSigCancel">取消</button>
     <button class="po-btn primary" id="poSigOk">确认签名并完成验收</button>`);

  const cv = $('#poSig');
  const ctx = cv.getContext('2d');
  const rect = cv.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  cv.width = Math.round(rect.width * dpr);
  cv.height = Math.round(rect.height * dpr);
  ctx.scale(dpr, dpr);
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#1b3a6b';
  let ink = false, drawing = false;
  const posOf = e => {
    const r = cv.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  cv.addEventListener('pointerdown', e => { drawing = true; cv.setPointerCapture(e.pointerId); const p = posOf(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); });
  cv.addEventListener('pointermove', e => {
    if (!drawing) return;
    const p = posOf(e);
    ctx.lineTo(p.x, p.y); ctx.stroke();
    ink = true;
  });
  cv.addEventListener('pointerup', () => { drawing = false; });
  $('#poSigClear').onclick = () => { ctx.clearRect(0, 0, cv.width, cv.height); ink = false; };
  $('#poSigCancel').onclick = closeDrawer;
  $('#poSigOk').onclick = () => {
    if (!ink) { toast('请先完成电子签名'); return; }
    const data = cv.toDataURL('image/png');
    closeDrawer();
    onDone(data);
  };
}

/* ============================ 10. 退货 ============================ */

function openReturn(orderId) {
  const o = findOrder(orderId);
  if (!o) return;
  if (o.status === 'done') { toast('订单已完成，不能再发起退货'); return; }
  const inflight = (o.returns || []).find(r => r.status === 'pending');
  if (inflight) { toast('该订单还有在途退货单，等供应商处理完再发起'); return; }

  const rows = o.items.filter(it => num(it.receivedQty) > 0).map(it => {
    const can = num(it.receivedQty) - num(it.returnQty);
    return `<tr data-sku="${it.skuCode}">
      <td><label class="po-sig-check"><input type="checkbox" data-pick="${it.skuCode}" ${can > 0 ? '' : 'disabled'}>
        <b>${esc(it.productName)}</b></label>
        <span class="po-sub">已验收 ${trimQty(it.receivedQty)} ${esc(it.unit)} · 可退 ${trimQty(can)}</span></td>
      <td class="num"><input class="po-qty" data-rq="${it.skuCode}" value="${can > 0 ? trimQty(can) : ''}" inputmode="decimal" ${can > 0 ? '' : 'disabled'}></td>
      <td><select class="po-select" data-rr="${it.skuCode}" style="height:28px;width:120px">
        ${['质量问题', '数量短缺', '规格不符', '临期', '其他'].map(v => `<option>${v}</option>`).join('')}
      </select></td>
    </tr>`;
  }).join('');

  if (!rows) { toast('没有可退的行（还没有验收量）'); return; }

  drawer('发起退货', `${o.no} · ${o.supplierName}`,
    `<p class="po-note">可退数量 ≤ 该行实际验收量；同一行同一时刻只允许一张在途退货单。退货不冲减订单金额。</p>
     <table class="po-grid-table"><thead><tr><th>商品</th><th class="num" style="width:120px">退货数量</th><th style="width:130px">原因</th></tr></thead>
     <tbody>${rows}</tbody></table>`,
    `<button class="po-btn" id="retCancel">取消</button><button class="po-btn primary" id="retSubmit">提交退货单</button>`, true);

  $('#retCancel').onclick = closeDrawer;
  $('#retSubmit').onclick = () => {
    const items = [];
    o.items.forEach(it => {
      const box = $(`[data-pick="${it.skuCode}"]`);
      if (!box || !box.checked) return;
      const q = num($(`[data-rq="${it.skuCode}"]`).value);
      const can = num(it.receivedQty) - num(it.returnQty);
      if (q <= 0) return;
      if (q > can) { items.push({ bad: it.productName }); return; }
      items.push({ skuCode: it.skuCode, qty: q, reason: $(`[data-rr="${it.skuCode}"]`).value });
    });
    if (!items.length) { toast('请勾选要退的商品并填数量'); return; }
    const bad = items.find(x => x.bad);
    if (bad) { toast(`「${bad.bad}」的退货数量不能大于可退数量`); return; }
    o.returns.push({
      id: `TH${o.no.slice(2)}${String((o.returns || []).length + 1).padStart(2, '0')}`,
      at: nowStr(), items, status: 'pending', round: 1, supplierReply: ''
    });
    o.status = 'returning';
    o.timeline.push({ at: nowStr(), text: `采购员发起退货单（${items.length} 行）` });
    closeDrawer();
    toast('退货单已提交，等待供应商确认');
    renderDetail(o);
  };
}

/* ============================ 11. 安装 ============================ */

install();
window.MerchantOrder = {
  enter: showList,
  enterInquiries: showInquiryList,
  list: () => S.orders.slice(),
  inquiries: () => S.inquiries.slice(),
  reset: () => { S.orders = []; S.inquiries = []; S.settings = {}; S.seqOrder = 1; S.seqInq = 1; seed(); showList(); },
  __debug: { findOrder, findInq, openAccept, openReturn, openSignature, doAward, simAction, saveAccept }
};
})();
