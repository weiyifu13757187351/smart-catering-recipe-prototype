/* 商户端 · 采购管理 —— 采购订单（V4.0 两层框架：订单列表 → 订单详情 / 商品明细整页）
   口径见《商户端采购订单管理PRD-V2.0》（V4.0 两层版）：

   【规则】两层：第 1 层「订单列表」→ 第 2 层「订单详情（商品明细整页）」；询价整体下线。
   【规则】订单是**唯一单据**：一张订单 = 一个送达日期 + 一家供应商；一次提交按天生成 N 张订单。
   【规则】数据里没有采购单容器（`S.groups` 已删除），订单号 `PO{送达日}{3 位流水}`。
   【规则】第 1 层：下单方切换 + 5 张订单口径统计卡 + 供应商 / 订单编号 / 来源 / 送达日期（默认今天±15 天）
            + 订单状态平铺页签 + 售后平铺页签 + 11 列订单表。
   【规则】第 2 层：页头（返回 / 编号 / 来源 / 状态 / 摘要 / 「更多信息」默认收起 / 修改订单）
            + 商品明细整页 + 发货记录 + 售后记录 + 状态时间轴；**没有「订单信息」卡片**。
   【规则】验收是**商品行级**动作：每行一个「验收」入口，一次一条留痕，可反复改。
   【规则】「验收完成」是订单级收口：前置=所有行已验收，需电子签名，完成后锁定。
   【规则】商品资质照片由供应商上传，商户端验收详情只读回显，过期标红不阻断。
   【规则】退货从商品行发起；供应商认可后行标记退货、验收量扣减；订单仍是「已完成」；退货只记轮次。

   【原型】无供应商端，订单详情底部提供「供应商模拟」区：确认订单 / 确认发货 / 售后认可或不认可。
   依赖 window.MerchantPlan（esc / toast / drawer / close）与 window.MerchantStalls、window.MerchantScope。 */
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
const md = s => `${pad2(parseISO(s).getMonth() + 1)}-${pad2(parseISO(s).getDate())}`;
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
const rangeText = (from, to) => {
  const n = daysBetween(from, to).length;
  return from === to ? `${md(from)}（1 天）` : `${md(from)} ~ ${md(to)}（${n} 天）`;
};

/* ============================ 2. 快照数据【原型】 ============================
   商品 / SKU / 供应商 / 预报价 与「采购计划」模块保持同一套名称，便于对照演示；
   商品资质（检测报告 / 快检报告）模拟供应商上传，商户端只读。 */
/* [商品编码, 商品名称, 形态, [SKU 编码, SKU 名称, 规格, 单位], 分类, 品牌, 拼音首字母] */
const PRODUCTS = [
  ['P01', '冷鲜鸡胸肉', '毛菜', ['S0101', '冷鲜鸡胸肉 箱装', '10kg/箱', '箱'], '肉禽蛋', '鲜配优选', 'lxjxr'],
  ['P03', '鲜黄瓜', '毛菜', ['S0301', '鲜黄瓜 箱装', '10斤/箱', '箱'], '蔬菜', '绿源', 'xhg'],
  ['P04', '海天生抽', '净菜', ['S0401', '海天生抽 500ml×12', '500ml×12/箱', '箱'], '粮油调味', '海天', 'htsc'],
  ['P06', '冷鲜五花肉', '毛菜', ['S0601', '冷鲜五花肉 箱装', '10kg/箱', '箱'], '肉禽蛋', '鲜配优选', 'lxwhr'],
  ['P07', '山东一级土豆', '毛菜', ['S0701', '山东一级土豆 袋装', '5kg/袋', '袋'], '蔬菜', '绿源', 'sdyjtd'],
  ['P09', '一级大豆油', '净菜', ['S0901', '一级大豆油 5L×4/箱', '5L×4/箱', '箱'], '粮油调味', '金龙鱼', 'yjddy'],
  ['P11', '鲜鸡蛋', '毛菜', ['S1101', '鲜鸡蛋 箱装', '360枚/箱', '箱'], '肉禽蛋', '德青源', 'xjd'],
  ['P17', '鲜小葱', '毛菜', ['S1701', '鲜小葱 箱装', '5斤/箱', '箱'], '蔬菜', '绿源', 'xxc'],
  ['P18', '老南瓜', '毛菜', ['S1801', '老南瓜 箱装', '10kg/箱', '箱'], '蔬菜', '绿源', 'lng'],
  ['P21', '沙瓤番茄', '毛菜', ['S2101', '沙瓤番茄 箱装', '10斤/箱', '箱'], '蔬菜', '绿源', 'srfq'],
  ['P22', '时令蔬菜（当日）', '毛菜', ['S2201', '时令蔬菜 散装', '散装', 'kg'], '蔬菜', '绿源', 'slsc'],
  ['P23', '中筋面粉', '净菜', ['S2301', '中筋面粉 袋装', '25kg/袋', '袋'], '粮油调味', '五得利', 'zjmf'],
  ['P25', '千禧圣女果', '毛菜', ['S2501', '千禧圣女果 箱装', '5斤/箱', '箱'], '蔬菜', '绿源', 'qxsng'],
  ['P26', '腌制鸡丁', '半成品', ['S2601', '腌制鸡丁 真空袋', '2kg/袋', '袋'], '半成品', '鲜配优选', 'yzjd'],
  ['P27', '净菜土豆丝', '半成品', ['S2701', '净菜土豆丝 真空袋', '2.5kg/袋', '袋'], '半成品', '绿源', 'jctds'],
  ['P28', '鲜香菇', '毛菜', ['S2801', '鲜香菇 箱装', '5kg/箱', '箱'], '蔬菜', '绿源', 'xxg']
];
/* 已下架 SKU（原型用固定标记模拟商品上下架状态）：下架不清除供货关系，列表默认隐藏 */
const OFF_SHELF = ['S2201', 'S2501'];
const SKUS = PRODUCTS.map(([code, name, form, sku, category, brand, py]) => ({
  productCode: code, productName: name, form, category, brand, py,
  code: sku[0], name: sku[1], spec: sku[2], unit: sku[3],
  status: OFF_SHELF.includes(sku[0]) ? 'off' : 'on'
}));
const SKU = Object.fromEntries(SKUS.map(s => [s.code, s]));
/* 商品分类（添加商品抽屉的三级分类筛选）：一级 / 二级 / 三级 */
const CAT_PATHS = {
  P01: ['肉禽蛋类', '禽肉类', '鸡产品'],
  P03: ['蔬菜类', '茄果类', '瓜果类'],
  P04: ['粮油调味类', '调味品', '酱油醋'],
  P06: ['肉禽蛋类', '畜肉类', '猪肉'],
  P07: ['蔬菜类', '根茎类', '薯芋类'],
  P09: ['粮油调味类', '食用油', '植物油'],
  P11: ['肉禽蛋类', '蛋品', '鲜蛋'],
  P17: ['蔬菜类', '葱姜蒜类', '叶菜香辛'],
  P18: ['蔬菜类', '茄果类', '瓜果类'],
  P21: ['蔬菜类', '茄果类', '茄类'],
  P22: ['蔬菜类', '叶菜类', '鲜叶菜'],
  P23: ['粮油调味类', '米面', '面粉'],
  P25: ['蔬菜类', '茄果类', '瓜果类'],
  P26: ['半成品类', '腌制半成品', '禽肉腌制'],
  P27: ['半成品类', '净菜半成品', '根茎净菜'],
  P28: ['蔬菜类', '菌菇类', '鲜菌菇']
};
const catPathOf = sk => CAT_PATHS[sk.productCode] || ['未分类', '未分类', '其他'];
/* 由商品路径汇总成三级树；node.codes = 该节点下所有 SKU */
const CAT_TREE = (() => {
  const root = [];
  SKUS.forEach(sk => {
    let level = root;
    catPathOf(sk).forEach(name => {
      let node = level.find(n => n.name === name);
      if (!node) { node = { name, children: [], codes: [] }; level.push(node); }
      node.codes.push(sk.code);
      level = node.children;
    });
  });
  return root;
})();
const findCatNode = (path) => {
  let level = CAT_TREE, node = null;
  for (const name of path || []) {
    node = level.find(n => n.name === name);
    if (!node) return null;
    level = node.children;
  }
  return node;
};
/* 三级分类弹出层（添加商品抽屉与供货关系筛选用同一套）：
   poolCodes = 当前可选 SKU 编码集合（只显示有商品的分类）；sel = 已选路径（任一层都可选中） */
function catPopHtml(sel, poolCodes) {
  const visible = nodes => nodes.filter(n => n.codes.some(c => poolCodes.has(c)));
  const col = (nodes, depth) => `<div class="po-cat-col">${nodes.map(n => {
    const on = sel[depth] === n.name;
    return `<button type="button" class="po-cat-row${on ? ' on' : ''}" data-cat-depth="${depth}" data-cat-name="${esc(n.name)}">
      <span class="po-cat-radio${on ? ' on' : ''}"></span>
      <span class="po-cat-name">${esc(n.name)}</span>
      <span class="po-cat-num">${n.codes.filter(c => poolCodes.has(c)).length}</span>
      ${n.children.length ? '<span class="po-cat-arrow">›</span>' : ''}
    </button>`;
  }).join('')}</div>`;
  const cols = [col(visible(CAT_TREE), 0)];
  const n1 = sel[0] ? findCatNode([sel[0]]) : null;
  if (n1 && visible(n1.children).length) cols.push(col(visible(n1.children), 1));
  const n2 = sel[0] && sel[1] ? findCatNode(sel.slice(0, 2)) : null;
  if (n2 && visible(n2.children).length) cols.push(col(visible(n2.children), 2));
  return {
    visible,
    html: `<div class="po-cat-cols">${cols.join('')}</div>
      <div class="po-cat-foot"><span class="po-sub">${sel.length ? `已选：${sel.join(' / ')}` : '可按一级 / 二级 / 三级任意一层筛选'}</span>
        <button type="button" class="po-btn po-btn-xs" data-cat-clear>全部分类</button></div>`
  };
}
/* 已选分类路径 → 该节点下的 SKU 编码集合（未选返回 null） */
const catSelCodes = sel => {
  if (!sel || !sel.length) return null;
  const node = findCatNode(sel);
  return node ? new Set(node.codes) : null;
};
/* 商品图片：原型用首字色块占位（真实接口下发图片地址） */
const thumbHtml = (name, i) => `<span class="po-thumb po-thumb-${((i % 6) + 6) % 6 + 1}">${esc((name || '?').slice(0, 1))}</span>`;

const SUPPLIERS = [
  { id: 'sup1', name: '上海鲜配供应链有限公司', contact: '王经理 138****6621', shipContact: '王经理 138****6621',
    supplyTypes: ['毛菜', '半成品'],
    quotes: { P01: 128, P03: 65, P06: 220, P07: 26, P11: 96, P17: 58, P18: 48, P21: 72, P22: 55, P25: 120, P26: 46 } },
  { id: 'sup2', name: '江南粮油调味品商行', contact: '李经理 139****3382', shipContact: '李经理 139****3382',
    supplyTypes: ['净菜'],
    quotes: { P04: 58, P09: 184, P23: 96 } },
  { id: 'sup3', name: '城西冷链配送中心', contact: '赵经理 137****9900', shipContact: '赵经理 137****9900',
    supplyTypes: ['毛菜'],
    quotes: { P01: 132, P06: 215 } },
  { id: 'sup5', name: '本地蔬菜合作社', contact: '周姐 135****7742', shipContact: '周姐 135****7742',
    supplyTypes: ['毛菜', '半成品'],
    quotes: { P03: 62, P17: 55, P18: 46, P21: 69, P22: 52, P25: 112, P27: 32 } },
  { id: 'sup6', name: '北郊副食批发部', contact: '陈师傅 133****5510', shipContact: '陈师傅 133****5510',
    supplyTypes: ['毛菜', '净菜'],
    quotes: { P07: 26, P11: 96, P23: 92 } }   /* P07 / P11 与 sup1 同价：用于演示「一键最低价」的平局规则 */
];
/* 供货类型 = 该供应商有预报价商品的出现形态，只有 毛菜 / 净菜 / 半成品 三种 */
const SUPPLY_FORMS = ['毛菜', '净菜', '半成品'];
const supForms = s => SUPPLY_FORMS.filter(f =>
  Object.keys(s.quotes || {}).some(pc => (SKUS.find(k => k.productCode === pc) || {}).form === f));
/* 供应类型：租户端供应商档案字段（毛菜 / 净菜 / 半成品，多选 ≥1）；缺失时回退按预报价推导 */
const supTypes = s => (s && s.supplyTypes && s.supplyTypes.length) ? s.supplyTypes : supForms(s || {});
const supNamePart = id => (supplierOf(id).contact || '').split(' ')[0];
const supPhonePart = id => ((supplierOf(id).contact || '').match(/1[\d*]{6,}/) || [''])[0];
const supplierOf = id => SUPPLIERS.find(s => s.id === id) || { id, name: '（未知供应商）', quotes: {}, shipContact: '' };
/* 参考价：任一供应商的预报价（用于估价，无预报价时兜底） */
const refPriceOf = code => {
  for (const s of SUPPLIERS) { const p = s.quotes[SKU[code].productCode]; if (p != null) return p; }
  return 0;
};
const skuPriceOf = (supId, skuCode) => {
  const s = supplierOf(supId);
  const p = s.quotes && s.quotes[SKU[skuCode].productCode];
  return p == null ? null : p;
};

/* 商品资质照片：供应商侧上传，商户端只读回显（【原型】用占位块模拟照片） */
const CERT_RAW = {
  'sup1:P01': [{ type: '检测报告', title: '冷鲜鸡胸肉 兽药残留检测报告', validTo: addDays(TODAY, 120), at: addDays(TODAY, -20), photos: 2 }],
  'sup1:P03': [{ type: '快检报告', title: '鲜黄瓜 农残快检报告', validTo: addDays(TODAY, 8), at: addDays(TODAY, -6), photos: 1 }],
  'sup1:P21': [{ type: '快检报告', title: '沙瓤番茄 农残快检报告', validTo: addDays(TODAY, -3), at: addDays(TODAY, -33), photos: 1 }],
  'sup5:P03': [{ type: '快检报告', title: '鲜黄瓜 农残快检报告', validTo: addDays(TODAY, 30), at: addDays(TODAY, -10), photos: 1 }],
  'sup5:P17': [{ type: '检测报告', title: '鲜小葱 重金属检测报告', validTo: addDays(TODAY, 200), at: addDays(TODAY, -15), photos: 3 }],
  'sup2:P09': [{ type: '检测报告', title: '一级大豆油 出厂检验报告', validTo: addDays(TODAY, 300), at: addDays(TODAY, -40), photos: 2 }],
  'sup2:P23': [{ type: '检测报告', title: '中筋面粉 出厂检验报告', validTo: addDays(TODAY, 90), at: addDays(TODAY, -25), photos: 1 }]
};
const certsOf = (supId, skuCode) => {
  const pc = SKU[skuCode].productCode;
  return CERT_RAW[`${supId}:${pc}`] || [];
};
const certExpired = c => c.validTo < TODAY;

/* ============================ 3. 状态与常量 ============================ */

const STATUS = {
  wait: { t: '待确认', cls: 'po-t-wait' },
  confirmed: { t: '已确认', cls: 'po-t-confirmed' },
  toReceive: { t: '待验收', cls: 'po-t-receive' },
  accepted: { t: '验收中', cls: 'po-t-accepted' },       /* 订单内已有 ≥1 条行级验收记录，未点验收完成 */
  done: { t: '已完成', cls: 'po-t-done' }
};
const SOURCE = { direct: '直采下单', plan: '采购计划' };
/* 退货原因（V2.0.21）：与「验收差异原因」是两套，互不混用 */
const RETURN_REASONS = [
  '生鲜状态异常', '变质腐败', '存在病虫或异物', '大小/重量不符',
  '加工形态不符', '少发/漏发', '包装破损', '以次充好', '其他'
];
/* 售后原因展示文案：选「其他」时拼上手填内容（V4.5） */
const returnReasonText = r => (r && r.otherReason) ? `其他：${r.otherReason}` : ((r && r.reason) || '—');

/* 当前门店地址（收货地址默认回显，可改） */
const STORE_ADDR = '浦东新区世纪大道 1000 号 · 中央厨房收货口';

/* 门店后厨人员（验收人只能从这里多选，不可手填；接组织人员接口后由门店人员列表下发） */
const KITCHEN_STAFF = [
  { name: '李库管', phone: '136****8891' },
  { name: '王厨师长', phone: '139****2201' },
  { name: '张厨工', phone: '137****3345' },
  { name: '刘面点师', phone: '135****7788' },
  { name: '陈配菜员', phone: '136****9902' },
  { name: '赵洗碗工', phone: '138****4461' },
  { name: '孙切配员', phone: '133****5527' },
  { name: '周蒸煮师', phone: '131****8834' }
];

/* ============================ 4. 内存数据 ============================ */

const S = { orders: [], relations: [], settings: {}, seqOrder: {}, stallId: '' };
let view = { kind: 'list' };                       /* list | order */
let curOrder = null;
let infoOpen = false;                              /* 第 2 层「更多信息」默认收起 */
/* 送达日期默认「今天前后 15 天」：[今天-15, 今天+15] */
let listFilter = { from: addDays(TODAY, -15), to: addDays(TODAY, 15), source: 'all', supplier: 'all', keyword: '', status: 'all', aftersale: 'all' };
let wiz = null;
let sigHook = null;

const orderAmount = o => o.items.reduce((s, i) => s + num(i.qty) * num(i.price), 0);
const orderAcceptedAmount = o => o.items.reduce((s, i) => s + num(i.acceptedQty) * num(i.price), 0);
const orderItemKinds = o => new Set(o.items.map(i => i.skuCode)).size;
const lineAccepted = i => i.acceptedQty != null;
const orderAllLinesAccepted = o => o.items.every(lineAccepted);
const orderAcceptedCount = o => o.items.filter(lineAccepted).length;
const orderProgressText = o => `${orderAcceptedCount(o)}/${o.items.length} 行`;

/* 售后状态：该订单内至少有 1 个商品发起过售后（退货）即为「有」 */
const hasAfterSale = o => (o.returns || []).length > 0;
/* 售后（V2.0.21）：退货 = 商品行级售后单，不影响订单状态（订单仍是已完成） */
const AS_TEXT = { pending: '待供应商确认', agreed: '供应商已认可', rejected: '供应商不认可' };
const asTag = st => `<span class="po-tag ${st === 'pending' ? 'po-tag-warn' : st === 'agreed' ? 'po-tag-ok' : 'po-tag-danger'}">${AS_TEXT[st] || '—'}</span>`;
const rowAftersales = (o, skuCode) => (o.returns || []).filter(r => r.skuCode === skuCode);
const latestAftersale = (o, skuCode) => { const l = rowAftersales(o, skuCode); return l.length ? l[l.length - 1] : null; };
/* L2 售后状态列（V2.0.22）：只有「无 / 有」——该订单内任一商品提交过售后即为「有」；
   售后三态（待供应商确认 / 已认可 / 不认可）只在 L3「售后记录」与「售后详情」里展示 */
const afterSaleCellHtml = o => (o.returns || []).length
  ? '<span class="po-tag po-tag-warn">有</span>'
  : '<span class="po-tag">无</span>';
function nextReturnNo() {
  let used = 0;
  S.orders.forEach(o => (o.returns || []).forEach(r => {
    const n = num(String(r.id || '').slice(-3));
    if (n > used) used = n;
  }));
  return `RT${TODAY.replace(/-/g, '')}${String(used + 1).padStart(3, '0')}`;
}

/* ---------------- 档口 ---------------- */
function stallList() {
  const sc = (window.MerchantScope && window.MerchantScope.current) ? window.MerchantScope.current() : {};
  const orgId = sc.orgId || '';
  const list = (window.MerchantStalls && window.MerchantStalls.listByOrg && orgId)
    ? window.MerchantStalls.listByOrg(orgId) : [];
  if (list.length) return list.map(s => ({ id: s.id, name: s.name }));
  return [{ id: 'stall1', name: '第一食堂档口' }, { id: 'stall2', name: '第二食堂档口' }];
}
function syncStall() {
  const sc = (window.MerchantScope && window.MerchantScope.current) ? window.MerchantScope.current() : {};
  const list = stallList();
  if (!S.stallId) S.stallId = sc.stallId && list.some(s => s.id === sc.stallId) ? sc.stallId : list[0].id;
  if (!list.some(s => s.id === S.stallId)) S.stallId = list[0].id;
  const hit = list.find(s => s.id === S.stallId) || list[0];
  return { id: hit.id, name: hit.name, orgId: sc.orgId || '', orgName: sc.orgName || '', list };
}
/* V4.15：采购订单 / 供货关系管理共用「组织 + 档口」切换器（参照采购计划，但没有「总览」这一层）。
   进入栏目默认选中该组织第一个档口（MerchantScope.ensureDefault 负责兜底） */
function mountPoScope(root) {
  const head = root && root.querySelector ? root.querySelector('.po-head') : null;
  if (!head || !(window.MerchantScope && typeof window.MerchantScope.mount === 'function')) return;
  try { window.MerchantScope.mount(head, { stall: true, stallAll: false }); } catch (e) { /* 切换器不可用时忽略 */ }
}

/* 切换组织 / 档口后：把状态同步成本模块的 S.stallId，并重画当前栏目 */
function onScopeChanged(force) {
  const sc = (window.MerchantScope && window.MerchantScope.current) ? window.MerchantScope.current() : {};
  const list = stallList();
  const next = (sc.stallId && list.some(s => s.id === sc.stallId)) ? sc.stallId : (list[0] ? list[0].id : S.stallId);
  const changed = next !== S.stallId;
  S.stallId = next || S.stallId;
  if (!changed && !force) return;
  curOrder = null;
  /* V4.16：只有用户当前就在采购管理栏目里才重画 / 切页。
     旧逻辑不管在哪个栏目都 showList()，于是用户在「采购计划」「排餐计划」等页面
     里切档口、换组织（首次进入这些页面时切换器挂载也会触发一次范围同步）时，
     会被硬拉到「采购订单」——表现为「第一次点采购计划却跳到采购订单」。 */
  const visible = el => !!(el && !el.hidden);
  const srEl = $('#supplyRelationPage'), listEl = $('#purchaseOrderPage'), wizEl = $('#poWizardPage');
  if (visible(srEl)) { renderSupply(); return; }
  if (!visible(listEl) && !visible(wizEl)) return;
  showList();
}

function switchStall(id) {
  if (!id || id === S.stallId) return;
  S.stallId = id;
  if (window.MerchantScope && typeof window.MerchantScope.setStall === 'function') {
    try { window.MerchantScope.setStall(id); } catch (e) { /* 全局切换器不可用时忽略 */ }
  }
  curOrder = null;
  renderList();
}
/* ============================ 5. 编号与快照 ============================ */

function nextOrderNo(deliveryDate) {
  const d = deliveryDate.replace(/-/g, '');
  S.seqOrder[d] = (S.seqOrder[d] || 0) + 1;
  return `PO${d}${String(S.seqOrder[d]).padStart(3, '0')}`;
}
/* ============================ 6. 演示种子 ============================ */

function mkItem(supId, skuCode, qty, price, extra) {
  const s = SKU[skuCode];
  return Object.assign({
    skuCode, productName: s.productName, form: s.form, spec: s.spec, unit: s.unit, brand: s.brand || '',
    qty, price: price == null ? (skuPriceOf(supId, skuCode) || 0) : price,
    lineNote: '', shippedQty: null, acceptedQty: null, diffReason: '', returnQty: 0, acceptSeq: 0
  }, extra || {});
}

/* 一张订单 = 一个送达日期（数据模型只有订单，不再有采购单容器） */
function mkOrder(cfg, items) {
  const c = Object.assign({
    supplierId: 'sup1', source: 'direct', sourceNo: '',
    stallId: '', stallName: '',
    deliveryDate: TODAY, status: 'wait',
    createdAt: nowStr(), createdBy: '张采购',
    receiver: null, ship: null
  }, cfg || {});
  const sup = supplierOf(c.supplierId);
  const o = {
    no: nextOrderNo(c.deliveryDate),
    stallId: c.stallId, stallName: c.stallName,
    supplierId: c.supplierId, supplierName: c.supplierName || sup.name,
    source: c.source, sourceNo: c.sourceNo,
    deliveryDate: c.deliveryDate, status: c.status,
    createdAt: c.createdAt, createdBy: c.createdBy,
    ship: c.ship || { contact: sup.shipContact || '', phone: '' },
    receiver: c.receiver || { contact: '', phone: '', addr: STORE_ADDR },
    items, shipments: [], accepts: [], acceptance: null, returns: [],
    timeline: [{ at: c.createdAt, text: `订单生成（来源：${SOURCE[c.source]}）` }]
  };
  S.orders.push(o);
  return o;
}

function seed() {
  S.orders = []; S.seqOrder = {};
  const st = syncStall();
  const base = { stallId: st.id, stallName: st.name };
  const rc = (contact, phone) => ({ contact, phone, addr: STORE_ADDR });

  /* A：来源 = 采购计划（CGJH20261024001）· 上海鲜配 · 连续 3 天各 1 张订单 */
  const oA1 = mkOrder(Object.assign({}, base, {
    supplierId: 'sup1', source: 'plan', sourceNo: 'CGJH20261024001',
    deliveryDate: addDays(TODAY, -1), status: 'toReceive', createdAt: '10-24 09:20',
    receiver: rc('李库管', '137****8890')
  }), [
    mkItem('sup1', 'S0101', 12, 128, { shippedQty: 12, lineNote: '去骨' }),
    mkItem('sup1', 'S0301', 8, 65, { shippedQty: 6 }),
    mkItem('sup1', 'S2101', 5, 72, { shippedQty: 5 })
  ]);
  oA1.shipments = [{ at: '10-25 06:40', driver: '王师傅', phone: '138****6621', items: { S0101: 12, S0301: 6, S2101: 5 } }];
  oA1.timeline.push({ at: '10-24 10:05', text: '供应商确认订单' }, { at: '10-25 06:40', text: '供应商确认发货（鲜黄瓜少发 2 箱）' });

  const oA2 = mkOrder(Object.assign({}, base, {
    supplierId: 'sup1', source: 'plan', sourceNo: 'CGJH20261024001',
    deliveryDate: TODAY, status: 'confirmed', createdAt: '10-24 09:20',
    receiver: rc('李库管', '137****8890')
  }), [
    mkItem('sup1', 'S0101', 10, 128),
    mkItem('sup1', 'S0601', 6, 220)
  ]);
  oA2.timeline.push({ at: '10-24 10:05', text: '供应商确认订单' });

  mkOrder(Object.assign({}, base, {
    supplierId: 'sup1', source: 'plan', sourceNo: 'CGJH20261024001',
    deliveryDate: addDays(TODAY, 1), status: 'wait', createdAt: '10-24 09:20',
    receiver: rc('李库管', '137****8890')
  }), [
    mkItem('sup1', 'S0101', 8, 128),
    mkItem('sup1', 'S1101', 4, 96)
  ]);

  /* B：来源 = 直采下单 · 本地蔬菜合作社 · 单日，已验收 2/3 行（行级留痕演示） */
  const oB = mkOrder(Object.assign({}, base, {
    supplierId: 'sup5', source: 'direct', sourceNo: '',
    deliveryDate: TODAY, status: 'accepted', createdAt: '10-25 16:30',
    receiver: rc('周厨师', '136****2210')
  }), [
    mkItem('sup5', 'S0301', 6, 62, { shippedQty: 6, acceptedQty: 6, acceptSeq: 1 }),
    mkItem('sup5', 'S1701', 4, 55, { shippedQty: 4, acceptedQty: 3, diffReason: '少发漏发', acceptSeq: 2 }),
    mkItem('sup5', 'S2501', 2, 112, { shippedQty: 2 })
  ]);
  oB.shipments = [{ at: '10-26 06:10', driver: '周姐', phone: '135****7742', items: { S0301: 6, S1701: 4, S2501: 2 } }];
  oB.accepts = [
    { itemSku: 'S0301', seq: 1, at: '10-26 07:20', by: '李库管', method: 'manual', qty: 6, before: 0, after: 6, diffReason: '', note: '', photos: 1 },
    { itemSku: 'S1701', seq: 1, at: '10-26 07:24', by: '李库管', method: 'manual', qty: 2, before: 0, after: 2, diffReason: '', note: '', photos: 2 },
    { itemSku: 'S1701', seq: 2, at: '10-26 07:41', by: '李库管', method: 'manual', qty: 1, before: 2, after: 3, diffReason: '', note: '', photos: 0 }
  ];
  oB.timeline.push(
    { at: '10-25 17:02', text: '供应商确认订单' },
    { at: '10-26 06:10', text: '供应商确认发货' },
    { at: '10-26 07:20', text: '验收「鲜黄瓜」6 箱' },
    { at: '10-26 07:24', text: '验收「鲜小葱」4 箱' },
    { at: '10-26 07:41', text: '「鲜小葱」验收量改为 3 箱（数量短缺）' }
  );

  /* C：来源 = 直采下单 · 江南粮油调味品商行 · 单日，已完成（含签名） */
  const oC = mkOrder(Object.assign({}, base, {
    supplierId: 'sup2', source: 'direct', sourceNo: '',
    deliveryDate: addDays(TODAY, -2), status: 'done', createdAt: '10-22 14:10',
    receiver: rc('李库管', '137****8890')
  }), [
    mkItem('sup2', 'S0901', 3, 184, { shippedQty: 3, acceptedQty: 3, acceptSeq: 1 }),
    mkItem('sup2', 'S2301', 5, 96, { shippedQty: 5, acceptedQty: 4, diffReason: '少发漏发', acceptSeq: 1 })
  ]);
  oC.shipments = [{ at: '10-24 07:05', driver: '李经理', phone: '139****3382', items: { S0901: 3, S2301: 5 } }];
  oC.accepts = [
    { itemSku: 'S0901', seq: 1, at: '10-24 08:10', by: '李库管', method: 'manual', qty: 3, before: 0, after: 3, diffReason: '', note: '', photos: 1 },
    { itemSku: 'S2301', seq: 1, at: '10-24 08:18', by: '李库管', method: 'manual', qty: 4, before: 0, after: 4, diffReason: '', note: '', photos: 1 }
  ];
  oC.acceptance = { at: '10-24 08:30', by: '李库管', sig: '', photos: 1, diffs: [{ skuCode: 'S2301', name: '中筋面粉', unit: '袋', ship: 5, accepted: 4, gap: 1, reason: '少发漏发', other: '' }] };
  oC.timeline.push(
    { at: '10-22 14:30', text: '供应商确认订单' },
    { at: '10-24 07:05', text: '供应商确认发货' },
    { at: '10-24 08:10', text: '验收「一级大豆油」3 箱' },
    { at: '10-24 08:18', text: '验收「中筋面粉」4 袋（数量短缺）' },
    { at: '10-24 08:30', text: '验收完成并电子签名，订单已完成' }
  );

  /* 供货关系种子（V4.1）：档口 × SKU × 1 家供应商；含已下架 SKU 的保留绑定 */
  S.relations = [];
  const rel = (skuCode, supplierId, source, at) => {
    const sku = SKU[skuCode];
    S.relations.push({
      stallId: st.id, skuCode, productCode: sku.productCode,
      supplierId: supplierId || '',
      source: source || (supplierId ? 'manual' : 'none'),
      priceSnapshot: supplierId ? skuPriceOf(supplierId, skuCode) : null,
      noQuote: !supplierId,
      updatedAt: at || '10-24 09:00', updatedBy: '张采购'
    });
  };
  rel('S0101', 'sup1', 'manual', '10-20 10:12');
  rel('S0301', 'sup5', 'lowest', '10-21 09:30');
  rel('S0601', 'sup3', 'manual', '10-20 10:12');
  rel('S0701', 'sup1', 'lowest', '10-21 09:30');
  rel('S0901', 'sup2', 'manual', '10-20 10:15');
  rel('S1101', 'sup1', 'lowest', '10-22 11:05');
  rel('S2101', 'sup5', 'lowest', '10-21 09:30');
  rel('S2301', 'sup2', 'manual', '10-20 10:15');
  rel('S2601', 'sup1', 'form', '10-23 15:40');
  rel('S2701', 'sup5', 'form', '10-23 15:40');
  rel('S2201', 'sup5', 'manual', '09-18 14:20');   /* 已下架：绑定关系保留 */
}

/* ============================ 7. 页面骨架与导航 ============================ */

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
const wizPage = () => page('#poWizardPage', 'po-page');

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
       <div class="nav-child" id="srNav"><span>供货关系管理</span></div>`);
  }
  seed();
  /* V4.15：任一页切换组织/档口，两个栏目都跟着刷新 */
  if (window.MerchantScope && typeof window.MerchantScope.onStallChange === 'function') {
    window.MerchantScope.onStallChange(() => onScopeChanged(false));
    window.MerchantScope.onChange(() => onScopeChanged(true));
  }
  $('#poOrderNav').addEventListener('click', () => { showList(); });
  $('#srNav').addEventListener('click', () => { showSupplyRelation(); });
}

/* ============================ 8. 第 1 层：订单列表 ============================ */

function showList() {
  view = { kind: 'list' };
  hideAll($('#poOrderNav'));
  breadcrumb('采购订单');
  const p = orderPage(); p.hidden = false;
  renderList();
}

/* 刷新当前视图：在订单详情页就重画详情，否则重画列表 */
const refreshCurrent = () => (view.kind === 'order' ? renderOrder() : renderList());

/* 当前档口的订单（数据结构只有订单：一张订单 = 一个送达日期） */
const myOrders = () => {
  const st = syncStall();
  return S.orders.filter(o => o.stallId === st.id);
};

/* 基础筛选：送达日期 / 来源 / 供应商 / 订单编号（状态、售后页签在它之上再筛） */
function baseFilteredOrders() {
  const kw = (listFilter.keyword || '').trim().toLowerCase();
  return myOrders().filter(o => {
    if (listFilter.from && o.deliveryDate < listFilter.from) return false;
    if (listFilter.to && o.deliveryDate > listFilter.to) return false;
    if (listFilter.source !== 'all' && o.source !== listFilter.source) return false;
    if (listFilter.supplier !== 'all' && o.supplierId !== listFilter.supplier) return false;
    if (kw && !o.no.toLowerCase().includes(kw)) return false;
    return true;
  }).sort(listOrderCompare);
}

/* V4.9 列表排序：先按创建时间倒序（最新提交的订单在最上面），
   同一次提交 = 同一 createdAt，此时把同一家供应商的订单排在一起，再按送达日期升序 */
function listOrderCompare(x, y) {
  if (x.createdAt !== y.createdAt) return x.createdAt < y.createdAt ? 1 : -1;
  if (x.supplierId !== y.supplierId) return x.supplierId < y.supplierId ? -1 : 1;
  if (x.deliveryDate !== y.deliveryDate) return x.deliveryDate < y.deliveryDate ? -1 : 1;
  return x.no < y.no ? 1 : -1;
}

const matchStatus = o => listFilter.status === 'all' || o.status === listFilter.status;
const matchAfterSale = o => listFilter.aftersale === 'all'
  || (listFilter.aftersale === 'has' ? hasAfterSale(o) : !hasAfterSale(o));

const filteredOrders = () => baseFilteredOrders().filter(o => matchStatus(o) && matchAfterSale(o));

function orderTagsHtml(o) {
  const tags = [];
  const shipped = o.items.filter(i => i.shippedQty != null);
  if (shipped.length && shipped.length < o.items.length) tags.push('<span class="po-tag po-tag-warn">部分发货</span>');
  if (o.status === 'done' && o.acceptance) tags.push('<span class="po-tag po-tag-ok">已签名</span>');
  return tags.join('');
}

function orderRowHtml(o) {
  return `<tr>
    <td><span class="po-no po-link" data-order-open="${esc(o.no)}">${esc(o.no)}</span></td>
    <td>${esc(o.supplierName)}</td>
    <td><span class="po-src po-src-${o.source}">${SOURCE[o.source]}</span>${o.sourceNo ? `<span class="po-sub">${esc(o.sourceNo)}</span>` : ''}</td>
    <td>${mdw(o.deliveryDate)}</td>
    <td>${orderItemKinds(o)} 项</td>
    <td class="po-money">${money(orderAmount(o))}</td>
    <td class="po-money">${orderAcceptedCount(o) ? money(orderAcceptedAmount(o)) : '—'}</td>
    <td><span class="po-tag ${STATUS[o.status].cls}">${STATUS[o.status].t}</span>${orderTagsHtml(o)}</td>
    <td>${afterSaleCellHtml(o)}</td>
    <td class="po-sub">${esc(o.createdAt)}</td>
    <td><div class="po-line-ops">
      <button class="po-btn po-btn-xs" data-order-open="${esc(o.no)}">查看</button>
      ${o.status === 'wait' && o.source === 'direct' ? `<button class="po-btn po-btn-xs po-btn-ghost" data-edit-order="${esc(o.no)}">修改</button>` : ''}
      ${o.status === 'wait' ? `<button class="po-btn po-btn-xs po-btn-ghost po-btn-danger" data-del-order="${esc(o.no)}">删除</button>` : ''}
    </div></td>
  </tr>`;
}

function renderList() {
  const p = orderPage();
  const st = syncStall();
  const mine = myOrders();
  /* 统计口径（层 1 卡片）：按当前档口全部订单统计；金额 = 行验收量 × 单价 */
  const acceptedTotal = mine.reduce((x, o) => x + orderAcceptedAmount(o), 0);
  const monthKey = md(TODAY).slice(0, 2);
  const monthOrders = mine.filter(o => o.createdAt.startsWith(monthKey));
  const monthAccepted = monthOrders.reduce((x, o) => x + orderAcceptedAmount(o), 0);
  const toAccept = mine.filter(o => o.status !== 'done').length;

  const base = baseFilteredOrders();          /* 日期/来源/供应商/编号 过滤后的集合：页签计数基于它 */
  const rows = base.filter(o => matchStatus(o) && matchAfterSale(o));
  const supOpts = SUPPLIERS.filter(x => mine.some(o => o.supplierId === x.id))
    .map(x => `<option value="${esc(x.id)}" ${listFilter.supplier === x.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('');

  /* 订单状态页签（平铺，带张数） */
  const statusKeys = ['all', ...Object.keys(STATUS)];
  const statusTabs = statusKeys.map(k => {
    const cnt = k === 'all' ? base.length : base.filter(o => o.status === k).length;
    return `<button class="po-tab po-tab-status ${listFilter.status === k ? 'active' : ''} ${cnt ? '' : 'is-zero'}" data-status-tab="${k}">${k === 'all' ? '全部状态' : STATUS[k].t} <em>${cnt}</em></button>`;
  }).join('');
  /* 售后页签（全部 / 有售后 / 无售后） */
  const asCnt = k => k === 'all' ? base.length : base.filter(o => k === 'has' ? hasAfterSale(o) : !hasAfterSale(o)).length;
  const asTabs = [['all', '全部售后'], ['has', '有售后'], ['none', '无售后']].map(([k, t]) =>
    `<button class="po-tab po-tab-status ${listFilter.aftersale === k ? 'active' : ''} ${asCnt(k) ? '' : 'is-zero'}" data-assale-tab="${k}">${t} <em>${asCnt(k)}</em></button>`
  ).join('');

  p.innerHTML = `
  <div class="po-head">
    <div><h2>采购订单</h2></div>
    <div class="po-head-actions">
      <button class="po-btn po-btn-primary" id="poNewBtn">+ 新建订单</button>
    </div>
  </div>

  <div class="po-stats">
    <div class="po-stat"><span class="po-stat-t">订单总数</span><b>${mine.length}</b></div>
    <div class="po-stat"><span class="po-stat-t">订单验收总金额</span><b>${money(acceptedTotal)}</b></div>
    <div class="po-stat"><span class="po-stat-t">本月订单数</span><b>${monthOrders.length}</b></div>
    <div class="po-stat"><span class="po-stat-t">本月订单验收总金额</span><b>${money(monthAccepted)}</b></div>
    <div class="po-stat"><span class="po-stat-t">待我验收完成订单数</span><b>${toAccept}</b></div>
  </div>

  <div class="po-filters">
    <span class="po-flabel">送达日期</span>
    <input type="date" class="po-input" id="poFrom" value="${listFilter.from}">
    <span class="po-sub">~</span>
    <input type="date" class="po-input" id="poTo" value="${listFilter.to}">
    <label>来源
      <select class="po-select" id="poSrcSel">
        <option value="all">全部来源</option>
        ${Object.entries(SOURCE).map(([k, t]) => `<option value="${k}" ${listFilter.source === k ? 'selected' : ''}>${t}</option>`).join('')}
      </select>
    </label>
    <label>供应商
      <select class="po-select" id="poSupSel"><option value="all">全部供应商</option>${supOpts}</select>
    </label>
    <input class="po-input po-kw" id="poKw" placeholder="订单编号" value="${esc(listFilter.keyword)}">
    <button class="po-btn po-btn-primary" id="poSearchBtn">查询</button>
    <button class="po-btn" id="poResetFilter">重置</button>
  </div>

  <div class="po-filter-tabs">
    <div class="po-tab-row">${statusTabs}</div>
    <div class="po-tab-row">${asTabs}</div>
  </div>

  <div class="po-card">
    ${rows.length ? `<div class="po-table-wrap"><table class="po-table po-order-table">
      <thead><tr>
        <th>订单编号</th><th>供应商</th><th>来源</th><th>送达日期</th><th>品项</th>
        <th class="po-money">订单总金额</th><th class="po-money">验收总金额</th><th>订单状态</th><th>是否有售后</th><th>创建时间</th><th>操作</th>
      </tr></thead>
      <tbody>${rows.map(orderRowHtml).join('')}</tbody>
    </table></div>` : `<div class="po-empty">${mine.length ? '没有符合条件的订单，试试放宽送达日期、换个供应商或改状态页签' : '暂无订单，点右上角「新建订单」开始'}</div>`}
  </div>`;

  $('#poNewBtn').addEventListener('click', () => startWizard());

  $('#poFrom').addEventListener('change', e => { listFilter.from = e.target.value; renderList(); });
  $('#poTo').addEventListener('change', e => { listFilter.to = e.target.value; renderList(); });
  $('#poSrcSel').addEventListener('change', e => { listFilter.source = e.target.value; renderList(); });
  $('#poSupSel').addEventListener('change', e => { listFilter.supplier = e.target.value; renderList(); });
  const doSearch = () => { listFilter.keyword = ($('#poKw') || {}).value || ''; renderList(); };
  $('#poSearchBtn').addEventListener('click', doSearch);
  $('#poKw').addEventListener('keydown', e => { if (e.key !== 'Enter') return; e.preventDefault(); doSearch(); });
  $('#poResetFilter').addEventListener('click', () => {
    listFilter = { from: addDays(TODAY, -15), to: addDays(TODAY, 15), source: 'all', supplier: 'all', keyword: '', status: 'all', aftersale: 'all' };
    renderList();
  });
  $$('[data-status-tab]', p).forEach(b2 => b2.addEventListener('click', () => { listFilter.status = b2.getAttribute('data-status-tab'); renderList(); }));
  $$('[data-assale-tab]', p).forEach(b2 => b2.addEventListener('click', () => { listFilter.aftersale = b2.getAttribute('data-assale-tab'); renderList(); }));
  mountPoScope(p);
  $$('[data-order-open]', p).forEach(el => el.addEventListener('click', () => {
    const o = S.orders.find(x => x.no === el.getAttribute('data-order-open'));
    if (o) showOrder(o);
  }));
  /* V4.10：删除订单（仅「待确认」状态可删，二次确认后从数据里移除，不可恢复） */
  $$('[data-del-order]', p).forEach(el => el.addEventListener('click', () => {
    const no = el.getAttribute('data-del-order');
    const target = S.orders.find(x => x.no === no);
    if (!target) { toast('订单不存在'); return; }
    if (target.status !== 'wait') { toast('只有「待确认」的订单可以删除'); return; }
    poConfirm({
      title: '删除订单',
      text: `是否确认删除订单 ${no}？删除后不可恢复`,
      okText: '删除',
      cancelText: '我再看看',
      onOk: () => {
        const i = S.orders.findIndex(x => x.no === no);
        if (i < 0) { toast('订单不存在'); return; }
        S.orders.splice(i, 1);
        renderList();
        toast(`订单 ${no} 已删除`);
      }
    });
  }));

  $$('[data-edit-order]', p).forEach(el => el.addEventListener('click', () => {
    const o = S.orders.find(x => x.no === el.getAttribute('data-edit-order'));
    if (o) openEditOrder(o);
  }));
}

/* ============================ 9. 第 2 层：订单详情（商品明细整页） ============================ */

function showOrder(o) {
  if (!o) { showList(); return; }
  curOrder = o;
  view = { kind: 'order', no: o.no };
  hideAll($('#poOrderNav'));
  breadcrumb(`采购订单 · 订单 ${o.no}`);
  const p = orderPage(); p.hidden = false;
  renderOrder();
}

function renderOrder() {
  const o = curOrder;
  if (!o) { showList(); return; }
  const p = orderPage();
  const st = STATUS[o.status];
  p.innerHTML = `
  <div class="po-head po-order-head">
    <div>
      <button class="po-btn po-btn-ghost po-btn-xs" id="poBackList">← 返回订单列表</button>
      <h2>${esc(o.no)} <span class="po-src po-src-${o.source}">${SOURCE[o.source]}</span> <span class="po-tag ${st.cls}">${st.t}</span></h2>
      <p class="po-sub">供应商：${esc(o.supplierName)} · 送达日期：${mdw(o.deliveryDate)} · 订单金额：${money(orderAmount(o))} · 验收金额：${orderAcceptedCount(o) ? money(orderAcceptedAmount(o)) : '—'} · 已验收：${orderProgressText(o)}</p>
    </div>
    <div class="po-head-actions">
      <button class="po-btn po-btn-xs" id="poMoreToggle">${infoOpen ? '收起更多信息' : '更多信息'}</button>
      ${o.status === 'wait' && o.source === 'direct' ? '<button class="po-btn po-btn-xs po-btn-ghost" id="poEditBtn">修改订单</button>' : ''}
    </div>
  </div>

  <div class="po-card po-more" id="poMoreCard" ${infoOpen ? '' : 'hidden'}>
    <div class="po-kv-grid">
      <div><label>下单方</label><span>${esc(o.stallName || '')}</span></div>
      <div><label>来源</label><span>${SOURCE[o.source]}</span></div>
      <div><label>来源单号</label><span>${o.sourceNo ? esc(o.sourceNo) : '—（直采下单无来源单）'}</span></div>
      <div><label>创建时间 / 创建人</label><span>${esc(o.createdAt)} · ${esc(o.createdBy || '')}</span></div>
      <div><label>发货联系人</label><span>${esc((o.ship || {}).contact || '—')}${(o.ship || {}).phone ? ' · ' + esc(o.ship.phone) : ''}</span></div>
      <div><label>收货联系人</label><span>${(o.receiver || {}).contact ? esc(o.receiver.contact) + ((o.receiver || {}).phone ? ' · ' + esc(o.receiver.phone) : '') : '—'}</span></div>
      <div class="po-kv-wide"><label>收货地址</label><span>${esc((o.receiver || {}).addr || '—')}</span></div>
    </div>
  </div>

  ${linesBodyHtml(o)}`;

  $('#poBackList').addEventListener('click', showList);
  $('#poMoreToggle').addEventListener('click', () => { infoOpen = !infoOpen; renderOrder(); });
  const eb = $('#poEditBtn');
  if (eb) eb.addEventListener('click', () => openEditOrder(o));
  bindLines(o);
}

/* ============================ 11. 第 3 层：商品明细抽屉 ============================ */

function lineOpsHtml(o, it, idx) {
  /* 规则（V2.0.8）：只有「验收完成」后才可退货；未完成前，行操作只有「验收」「验收详情」 */
  const finished = o.status === 'done';                        /* 验收完成（含签名）后锁定 */
  const canAccept = o.status === 'toReceive' || o.status === 'accepted';
  const shipped = it.shippedQty != null;
  const acceptBtn = finished
    ? ''                                                       /* 已完成：验收量锁定，验收入口消失 */
    : (canAccept
      ? `<button class="po-btn po-btn-xs ${shipped ? 'po-btn-primary' : 'po-btn-disabled'}" ${shipped ? '' : 'disabled title="供应商尚未发货"'} data-line-accept="${it.skuCode}">验收</button>`
      : `<button class="po-btn po-btn-xs po-btn-disabled" disabled>验收</button>`);
  const detailBtn = `<button class="po-btn po-btn-xs po-btn-ghost" data-line-detail="${it.skuCode}">验收详情</button>`;
  /* 售后（V2.0.21）：未发起过 → 退货；已有售后单（含在途 / 已认可 / 不认可）→ 售后详情 */
  const asList = rowAftersales(o, it.skuCode);
  const hasOpenAs = asList.some(r => r.status === 'pending');
  const canReturn = finished && num(it.acceptedQty) > 0 && !hasOpenAs;
  const asBtn = asList.length
    ? `<button class="po-btn po-btn-xs po-btn-ghost" data-line-aftersale="${it.skuCode}">售后详情</button>`
    : (canReturn ? `<button class="po-btn po-btn-xs po-btn-ghost" data-line-return="${it.skuCode}">退货</button>` : '');
  return `<div class="po-line-ops">${acceptBtn}${detailBtn}${asBtn}</div>`;
}

function lineStatusText(o, it) {
  if (o.status === 'done') return '<span class="po-tag po-tag-ok">已锁定</span>';
  if (!lineAccepted(it)) return '<span class="po-tag">未验收</span>';
  return `<span class="po-tag po-tag-ok">已验收</span>${it.acceptSeq > 1 ? `<span class="po-sub">共 ${it.acceptSeq} 批</span>` : '<span class="po-sub">第 1 批</span>'}`;
}

function linesBodyHtml(o) {
  const allAccepted = orderAllLinesAccepted(o);
  const locked = o.status === 'done';
  const rows = o.items.map((it, i) => `<tr>
      <td>${i + 1}</td>
      <td>${esc(it.productName)} <span class="po-sub">${esc(it.form || '')}</span></td>
      <td>${esc(it.unit)}</td>
      <td class="po-sub">${esc(it.spec)}</td>
      <td class="po-money">${money(it.price)}</td>
      <td class="po-money">${money(num(it.qty) * num(it.price))}</td>
      <td class="po-sub">${it.lineNote ? esc(it.lineNote) : '—'}</td>
      <td>${trimQty(it.qty)}</td>
      <td>${it.shippedQty == null ? '—' : trimQty(it.shippedQty)}</td>
      <td>${it.acceptedQty == null ? '—' : `<strong>${trimQty(it.acceptedQty)}</strong>`}${num(it.returnQty) > 0 ? '<span class="po-tag po-tag-warn">有退货</span>' : ''} ${lineStatusText(o, it)}</td>
      <td>${lineOpsHtml(o, it, i)}</td>
    </tr>`).join('');

  /* 发货记录（V2.0.9）：只保留预计发货时间 + 配送员姓名 + 手机号，不再展示发货明细。
     V4.14：待确认 / 已确认等还没有发货记录的状态，不再编造「预计发货时间」，改为空态说明 */
  const hasShip = !!(o.shipments && o.shipments.length);
  const ships = hasShip ? o.shipments.map(s => {
    const hhmm = s && s.at ? (s.at.split(' ')[1] || '06:00') : '06:00';
    const planAt = `${mdw(o.deliveryDate)} ${hhmm}`;
    return `<tr><td class="po-sub">${planAt}</td><td>${s ? esc(s.driver || '—') : '—'}</td>
      <td class="po-sub">${s ? esc(s.phone || '—') : '—'}</td></tr>`;
  }).join('') : '';
  const shipEmpty = o.status === 'wait'
    ? '订单待供应商确认，确认发货后回显预计发货时间与配送员'
    : '供应商尚未发货，发货后回显预计发货时间与配送员';

  /* 验收记录卡片已按 V2.0.9 去掉：行内完整历史统一在「验收详情」抽屉里看 */

  /* 售后记录（V2.0.21）：售后单号 / 商品 / 退货量 / 退货原因 / 售后状态 / 申请时间 */
  const returns = (o.returns || []).slice().reverse().map(r => `<tr><td class="po-no">${esc(r.id)}</td><td>${esc(r.skuName || '')}</td><td>${trimQty(r.qty)}</td>
      <td class="po-sub">${esc(returnReasonText(r))}</td><td class="po-sub">${num(r.photos) ? `${num(r.photos)} 张` : '—'}</td><td>${asTag(r.status)}</td>
      <td class="po-sub">${r.at}</td></tr>`).join('');

  const timeline = (o.timeline || []).slice().reverse().map(t => `<li><b>${t.at}</b><span>${esc(t.text)}</span></li>`).join('');

  const simBtns = [];
  if (o.status === 'wait') simBtns.push(`<button class="po-btn po-btn-xs" data-sim="confirm">确认订单</button>`);
  if (o.status === 'confirmed') simBtns.push(`<button class="po-btn po-btn-xs" data-sim="ship">确认发货</button>`);
  if ((o.returns || []).some(r => r.status === 'pending')) {
    simBtns.push(`<button class="po-btn po-btn-xs" data-sim="return-agree">认可售后</button>`);
    simBtns.push(`<button class="po-btn po-btn-xs po-btn-warn" data-sim="return-reject">不认可售后</button>`);
  }

  return `<div id="poLinesBody">
      ${o.status === 'done' ? `<div class="po-banner po-banner-ok">订单已完成并电子签名（${o.acceptance ? o.acceptance.at + ' · ' + esc(o.acceptance.by) : ''}），全部商品的验收量已锁定。</div>` : ''}
    ${o.status === 'accepted' ? `<div class="po-accept-head">
      <div class="po-sub">已完成 <b>${orderProgressText(o)}</b>验收${allAccepted ? '，可以点右侧「验收完成」并签名收口' : '，全部商品验收后方可点击“验收完成”'}</div>
      <div class="po-head-actions">
        <button class="po-btn po-btn-primary po-btn-xs ${allAccepted && !locked ? '' : 'po-btn-disabled'}" ${allAccepted && !locked ? '' : 'disabled'} id="poFinishBtn">验收完成（签名）</button>
      </div>
    </div>` : ''}
    <div class="po-card po-section">
      <div class="po-section-head"><h3>商品明细<span class="po-sub">行级验收 / 退货 / 售后都在这一层</span></h3></div>
      <div class="po-table-wrap"><table class="po-table po-lines-table">
        <thead><tr>
          <th>#</th><th>商品名称</th><th>单位</th><th>规格</th><th class="po-money">单价</th><th class="po-money">总价</th>
          <th>备注</th><th>下单量</th><th>实际发货量</th><th>实际验收量</th><th>操作</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
    </div>

    <div class="po-section"><h3>发货记录</h3>
      ${hasShip
        ? `<table class="po-table"><thead><tr><th>预计发货时间</th><th>配送员</th><th>手机号</th></tr></thead><tbody>${ships}</tbody></table>`
        : `<div class="po-empty">${shipEmpty}</div>`}
    </div>
    <div class="po-section"><h3>售后记录
      <button class="po-btn po-btn-xs po-btn-ghost po-h3-btn" data-demo="return">模拟售后单</button></h3>
      ${returns ? `<table class="po-table"><thead><tr><th>售后单号</th><th>商品</th><th>退货量</th><th>退货原因</th><th>退货凭证</th><th>售后状态</th><th>申请时间</th></tr></thead><tbody>${returns}</tbody></table>` : '<div class="po-empty">无售后记录</div>'}
    </div>
    <div class="po-section"><h3>状态时间轴</h3><ul class="po-timeline">${timeline}</ul></div>
    <div class="po-sim">
      <b>供应商模拟</b><span class="po-sub">原型专用：代替供应商端推进双泳道</span>
      <div class="po-sim-btns">${simBtns.join('') || '<span class="po-sub">当前状态无可执行的供应商动作</span>'}</div>
    </div>
  </div>`;
}

function bindLines(o) {
  const box = $('#poLinesBody');
  if (!box) return;
  const f = $('#poFinishBtn');
  if (f) f.addEventListener('click', () => openSignature(o));
  $$('[data-line-accept]', box).forEach(b => b.addEventListener('click', () => {
    const it = o.items.find(i => i.skuCode === b.getAttribute('data-line-accept'));
    if (it) openLineAccept(o, it);
  }));
  $$('[data-line-detail]', box).forEach(b => b.addEventListener('click', () => {
    const it = o.items.find(i => i.skuCode === b.getAttribute('data-line-detail'));
    if (it) openLineDetail(o, it);
  }));
  $$('[data-line-return]', box).forEach(b => b.addEventListener('click', () => {
    const it = o.items.find(i => i.skuCode === b.getAttribute('data-line-return'));
    if (it) openLineReturn(o, it);
  }));
  $$('[data-line-aftersale]', box).forEach(b => b.addEventListener('click', () => {
    const it = o.items.find(i => i.skuCode === b.getAttribute('data-line-aftersale'));
    if (it) openAftersaleDetail(o, it);
  }));
  $$('[data-sim]', box).forEach(b => b.addEventListener('click', () => {
    const act = b.getAttribute('data-sim');
    if (act === 'confirm') simConfirm(o);
    else if (act === 'ship') openSupplierShip(o);
    else if (act === 'return-agree') simReturnReply(o, true);
    else if (act === 'return-reject') openAftersaleReject(o);
  }));
  /* 演示用：一键写入一条退货记录（讲解需求时直接出数据，不用手工走供应商退货流程） */
  $$('[data-demo]', box).forEach(b => b.addEventListener('click', () => demoAddReturn(o)));
}

/* ---- 演示辅助：一键写入一条退货记录（讲解需求时用，不写进正式流程） ---- */
function demoAddReturn(o) {
  const line = o.items.find(i => num(i.acceptedQty) > 0) || o.items[0];
  if (!line) { toast('该订单没有可退货的商品行'); return; }
  if ((o.returns || []).some(r => r.status === 'pending')) { toast('已有待供应商确认的售后单，请先处理'); return; }
  o.returns.push({
    id: nextReturnNo(), at: nowStr(),
    skuCode: line.skuCode, skuName: line.productName, qty: 1,
    reason: RETURN_REASONS[1], status: 'pending',
    round: (o.returns || []).filter(r => r.skuCode === line.skuCode).length + 1,
    by: '李库管', rejectReason: '', photos: 1
  });
  o.timeline.push({ at: nowStr(), text: `【演示】写入售后单：${line.productName} 1${line.unit}（待供应商确认）` });
  toast('已模拟一条售后单（待供应商确认）');
  openLines(o);
  refreshCurrent();
}

/* 兼容旧调用：原本打开商品明细抽屉，现在直接进订单详情页
   V4.6 修复：抽屉的「取消 / 关闭」都走这里，必须先关抽屉，否则同一订单只重渲染、
   抽屉会一直留着，看起来像「取消点了没反应」 */
function openLines(o) {
  closeDrawer();
  if (view.kind === 'order' && curOrder === o) { renderOrder(); return; }
  showOrder(o);
}

function rerenderLines(o) {
  const box = $('#poLinesBody');
  if (box) { box.outerHTML = linesBodyHtml(o); bindLines(o); }
  else openLines(o);
  refreshCurrent();
}

/* ==================== 11b. 修改订单（仅直采下单 · 待确认） ==================== */

let editState = null;

function openEditOrder(o) {
  editState = {
    o,
    contact: (o.receiver && o.receiver.contact) || '',
    phone: (o.receiver && o.receiver.phone) || '',
    addr: (o.receiver && o.receiver.addr) || STORE_ADDR,
    items: o.items.map(it => ({
      skuCode: it.skuCode, productName: it.productName, spec: it.spec, unit: it.unit,
      brand: (SKU[it.skuCode] || {}).brand || '',
      price: num(it.price), qty: num(it.qty), lineNote: it.lineNote || ''
    })),
    addCode: ''
  };
  paintEditOrder();
}

function editOrderBodyHtml() {
  const o = editState.o;
  const st = KITCHEN_STAFF.map(x => {
    const v = `${x.name}|${x.phone}`;
    const cur = editState.contact === x.name ? 'selected' : '';
    return `<option value="${esc(v)}" ${cur}>${esc(x.name)} ${esc(x.phone)}</option>`;
  }).join('');
  const rows = editState.items.map((it, i) => `<tr>
      <td class="po-sub">${i + 1}</td>
      <td>${esc(it.productName)}</td>
      <td>${esc(it.unit)}</td>
      <td class="po-sub">${esc(it.spec)}</td>
      <td>${esc(it.brand || '—')}</td>
      <td class="po-money">${money(it.price)}</td>
      <td><input class="po-qty" type="number" min="0" step="0.01" data-edit-qty="${i}" value="${trimQty(it.qty)}"></td>
      <td><input class="po-input po-note-input" data-edit-note="${i}" value="${esc(it.lineNote)}" placeholder="选填"></td>
      <td><button class="po-btn po-btn-xs po-btn-ghost" data-edit-del="${i}">删除</button></td>
    </tr>`).join('');
  const total = editState.items.reduce((s2, it) => s2 + num(it.qty) * num(it.price), 0);
  return `<div class="po-edit-order">
    <div class="po-card po-section">
      <div class="po-section-head"><h3>订单信息</h3></div>
      <div class="po-kv-grid">
        <div><label>订单编号<span class="po-sub">不可修改</span></label><input class="po-input" value="${esc(o.no)}" readonly></div>
        <div><label>采购日期<span class="po-sub">不可修改</span></label><input class="po-input" value="${esc(o.createdAt)}（送达 ${mdw(o.deliveryDate)}）" readonly></div>
        <div class="po-kv-wide"><label>收货人及联系方式 <em>*</em><span class="po-sub">从门店后厨人员中选择</span></label>
          <select class="po-input" id="poEditContact">
            <option value="">请选择收货人</option>
            ${st}
          </select>
        </div>
        <div class="po-kv-wide"><label>收货地址 <em>*</em></label>
          <input class="po-input" id="poEditAddr" value="${esc(editState.addr)}" placeholder="请填写收货地址">
        </div>
      </div>
    </div>

    <div class="po-card po-section">
      <div class="po-section-head">
        <h3>商品清单<span class="po-sub">可新增 / 删除商品、调整下单量与备注</span></h3>
        <span class="po-sub">合计 <b class="po-money" id="poEditTotal">${money(total)}</b></span>
      </div>
      <div class="po-table-wrap"><table class="po-table po-edit-table">
        <thead><tr><th>序号</th><th>商品名称</th><th>单位</th><th>规格</th><th>品牌</th><th class="po-money">单价</th><th>下单量</th><th>备注</th><th></th></tr></thead>
        <tbody>${rows || '<tr><td colspan="9" class="po-sub">还没有商品，点下面「添加商品」从供应商可采商品里选</td></tr>'}</tbody>
      </table></div>
      <div class="po-edit-add">
        <button class="po-btn po-btn-sm po-btn-primary" id="poEditAdd">+ 添加商品</button>
        <span class="po-sub">交互同「新建订单」第 2 步：搜索 / 分类 / 形态筛选后逐个添加，可回显下单量与备注</span>
      </div>
    </div>
  </div>`;
}

function paintEditOrder() {
  const o = editState.o;
  drawer(`修改订单 ${o.no}`,
    `来源：${SOURCE[o.source]} · 送达 ${mdw(o.deliveryDate)} · 仅「待确认」可修改`,
    editOrderBodyHtml(),
    '<button class="po-btn" data-edit-cancel>取消</button><button class="po-btn po-btn-primary" data-edit-save>保存修改</button>',
    true);
  bindEditOrder();
}

function bindEditOrder() {
  const d = '.mp-drawer ';
  $$(d + '[data-edit-qty]').forEach(i => i.addEventListener('input', () => {
    const idx = num(i.getAttribute('data-edit-qty'));
    editState.items[idx].qty = num(i.value);
    const t = $('#poEditTotal');
    if (t) t.textContent = money(editState.items.reduce((s2, it) => s2 + num(it.qty) * num(it.price), 0));
  }));
  $$(d + '[data-edit-note]').forEach(i => i.addEventListener('input', () => {
    editState.items[num(i.getAttribute('data-edit-note'))].lineNote = i.value;
  }));
  $$(d + '[data-edit-del]').forEach(b => b.addEventListener('click', () => {
    const idx = num(b.getAttribute('data-edit-del'));
    const name = editState.items[idx].productName;
    editState.items.splice(idx, 1);
    paintEditOrder();
    toast(`已移除 ${name}`);
  }));
  const add = $('#poEditAdd');
  if (add) add.addEventListener('click', () => openEditSkuPicker());
  const selC = $('#poEditContact');
  if (selC) selC.addEventListener('change', () => {
    const [n, ph] = (selC.value || '').split('|');
    editState.contact = n || '';
    editState.phone = ph || '';
  });
  const addr = $('#poEditAddr');
  if (addr) addr.addEventListener('input', () => { editState.addr = addr.value; });
  const cancel = $('.mp-drawer [data-edit-cancel]');
  if (cancel) cancel.addEventListener('click', closeDrawer);
  const save = $('.mp-drawer [data-edit-save]');
  if (save) save.addEventListener('click', saveEditOrder);
}

/* 修改订单里的「添加商品」：复用向导第 2 步的 picker，只是把商品落到本订单 */
function openEditSkuPicker() {
  const o = editState.o;
  const day = o.deliveryDate;
  pickCtx = {
    day, supplierId: o.supplierId,
    items: editState.items.map(it => ({
      skuCode: it.skuCode, productName: it.productName, price: it.price,
      daily: { [day]: it.qty }, note: { [day]: it.lineNote || '' }
    }))
  };
  openAddSku(pickCtx);
}

/* picker 关闭后把订单商品清单同步回来 */
function syncEditItemsFromCtx(ctx) {
  const day = ctx.day;
  const before = editState.items.length;
  editState.items = ctx.items.map(x => {
    const sk = SKU[x.skuCode];
    const q = num(x.daily[day]);
    return {
      skuCode: x.skuCode, productName: sk.productName, spec: sk.spec, unit: sk.unit, brand: sk.brand,
      price: num(x.price), qty: q > 0 ? q : 1,
      lineNote: (x.note && x.note[day]) || ''
    };
  });
  paintEditOrder();
  if (editState.items.length > before) toast('已添加到订单商品清单');
}

function saveEditOrder() {
  const o = editState.o;
  if (!editState.contact) { toast('请选择收货人'); return; }
  if (!(editState.addr || '').trim()) { toast('请填写收货地址'); return; }
  if (!editState.items.length) { toast('订单至少要保留 1 个商品'); return; }
  const badQty = editState.items.filter(it => num(it.qty) <= 0);
  if (badQty.length) { toast(`${badQty.map(it => it.productName).join('、')} 的下单量需大于 0`); return; }
  const before = orderAmount(o);
  o.items = editState.items.map(it => mkItem(o.supplierId, it.skuCode, num(it.qty), num(it.price), { lineNote: it.lineNote || '' }));
  o.receiver = { contact: editState.contact, phone: editState.phone, addr: editState.addr.trim() };
  o.editSeq = (o.editSeq || 0) + 1;
  o.timeline.push({ at: nowStr(), text: `采购员修改订单（第 ${o.editSeq} 次）：${money(before)} → ${money(orderAmount(o))}` });
  closeDrawer();
  refreshCurrent();
  toast('订单已修改，已同步通知供应商');
}

/* ============================ 12. 行内验收 / 验收详情 / 退货 ============================ */

const ACCEPT_DIFF_REASONS = [
  '生鲜状态异常', '变质腐败', '病虫害或存在异物', '大小/重量不符',
  '加工形态不符', '少发漏发', '包装破损', '送错货', '其他'
];
/* 差异原因展示文案：选「其他」时拼上手填内容（V4.6） */
const acceptDiffText = it => (!it || !it.diffReason) ? '—'
  : (it.diffReason === '其他' ? `其他：${it.diffOtherReason || ''}` : it.diffReason);
/* V4.6：验收量改为「批次累加」——每批记录 qty，累计 = 各批之和 */
const batchQtyOf = a => num(a.qty != null ? a.qty : (a.after != null ? a.after : 0));
const batchesOf = (o, skuCode) => (o.accepts || []).filter(a => a.itemSku === skuCode);
/* V4.22：软删除——删掉的批次**不消失**（置灰保留、操作列显示「已删除」），累计只算未删除的 */
const liveBatchesOf = (o, skuCode) => batchesOf(o, skuCode).filter(a => !a.deleted);
const nextBatchSeq = (o, skuCode) => batchesOf(o, skuCode).reduce((m, a) => Math.max(m, a.seq), 0) + 1;
const sumBatches = (o, skuCode) => liveBatchesOf(o, skuCode).reduce((s, a) => s + batchQtyOf(a), 0);
/* 重算累计与批次数：只累计未删除批次；一条有效批次都不剩时该行回到「未验收」 */
function recomputeAccepts(o, it) {
  const all = batchesOf(o, it.skuCode);
  const live = all.filter(a => !a.deleted);
  let run = 0;
  live.forEach(a => { run += batchQtyOf(a); a.after = run; });
  all.filter(a => a.deleted).forEach(a => { a.after = null; });
  it.acceptedQty = live.length ? run : null;
  it.acceptSeq = live.length;
  return { live, run };
}
/* 软删除任意一批（不再限最新一批）：二次确认 → 打 deleted 标记 → 重算 → 重开当前抽屉 */
function softDeleteBatch(o, it, seq, reopen) {
  const rec = batchesOf(o, it.skuCode).find(a => a.seq === seq);
  if (!rec || rec.deleted) { toast('该批次已删除'); return; }
  const qty = batchQtyOf(rec);
  poConfirm({
    title: '删除验收记录',
    text: `是否删除第 ${seq} 批验收（${trimQty(qty)} ${it.unit}）？删除后该批次会在列表里置灰、标记「已删除」保留，累计验收量相应减少，且不能恢复。`,
    okText: '删除', cancelText: '取消',
    onOk: () => {
      rec.deleted = true;
      rec.deletedAt = nowStr();
      const { run } = recomputeAccepts(o, it);
      if (!(o.accepts || []).some(a => !a.deleted)) o.status = 'toReceive';
      else if (o.status === 'toReceive') o.status = 'accepted';
      o.timeline.push({ at: nowStr(), text: `删除「${it.productName}」第 ${seq} 批验收记录（${trimQty(qty)}${it.unit}），累计验收 ${trimQty(run)}${it.unit}` });
      toast(`已删除第 ${seq} 批验收，累计 ${trimQty(run)}${it.unit}`);
      refreshCurrent();
      reopen();
    }
  });
}
const pendingQtyOf = it => Math.max(0, num(it.shippedQty) - num(it.acceptedQty));
/* 验收完成环节要填差异原因的行：累计验收量 < 实际发货量 */
const diffLinesOf = o => o.items.filter(i => i.shippedQty != null && num(i.acceptedQty) < num(i.shippedQty));
const missingDiffOf = o => diffLinesOf(o).filter(i => !i.diffReason || (i.diffReason === '其他' && !i.diffOtherReason));

/* 行验收弹层（V4.6）：本次验收量累加 + 历史批次可改；差异原因移到「验收完成」环节 */
function openLineAccept(o, it) {
  if (it.shippedQty == null) { toast('供应商尚未发货'); return; }
  const ship = num(it.shippedQty);
  const accepted = num(it.acceptedQty);
  const pending = pendingQtyOf(it);
  const prevRecs = batchesOf(o, it.skuCode);
  const liveRecs = prevRecs.filter(a => !a.deleted);
  const delCount = prevRecs.length - liveRecs.length;
  const lastRec = liveRecs.length ? liveRecs[liveRecs.length - 1] : null;
  const prevPhotos = lastRec ? num(lastRec.photos) : 0;
  const nextSeq = nextBatchSeq(o, it.skuCode);
  const unit = it.unit || '';

  /* V4.22：历史验收每条都能删；删掉的批次不消失，整行置灰、操作列显示「已删除」 */
  const histRows = prevRecs.length ? prevRecs.map(a => `
      <tr data-acc-row="${a.seq}"${a.deleted ? ' class="is-deleted"' : ''}>
        <td>第 ${a.seq} 批</td>
        <td class="po-sub">${a.at}</td>
        <td>${esc(a.by || '李库管')}</td>
        <td><b>${trimQty(batchQtyOf(a))}</b> ${esc(unit)}</td>
        <td class="po-sub">${num(a.photos)} 张</td>
        <td>${a.deleted ? '<span class="po-sub">已删除</span>'
          : `<button class="po-btn po-btn-xs po-btn-ghost po-btn-danger" data-acc-del="${a.seq}">删除</button>`}</td>
      </tr>`).join('')
    : `<tr><td colspan="6"><div class="po-empty">该商品尚未验收，本次为第 1 批</div></td></tr>`;

  drawer(`验收 · ${it.productName}`, `${o.no} · 送达 ${mdw(o.deliveryDate)} · 第 ${nextSeq} 批`,
    `<div class="po-form po-accept-form">
      <table class="po-table po-accept-info">
        <thead><tr><th>商品名称</th><th>规格</th><th>单位</th><th class="po-money">单价</th><th>下单量</th><th>实际发货量</th><th>已验收量</th><th>待验收量</th></tr></thead>
        <tbody><tr>
          <td>${esc(it.productName)}<span class="po-sub">${esc(it.form || '')}</span></td>
          <td class="po-sub">${esc(it.spec)}</td>
          <td>${esc(unit)}</td>
          <td class="po-money">${money(it.price)}</td>
          <td>${trimQty(it.qty)}</td>
          <td><b>${trimQty(it.shippedQty)}</b></td>
          <td id="poCurAccept">${it.acceptedQty != null ? trimQty(accepted) : '未验收'}</td>
          <td>${it.acceptedQty != null ? trimQty(pending) : trimQty(it.shippedQty)}</td>
        </tr></tbody>
      </table>
      <label>本次验收量 <em>*</em>
        <input class="po-input po-qty po-qty-plain" id="poAcceptQty" type="text" inputmode="decimal" autocomplete="off" placeholder="请输入本次验收量">
        <span class="po-sub">填「这一次」的收货量，会累加到已验收量；可分多次验收，差异原因在「验收完成」环节填写</span>
      </label>
      <div class="po-accept-sum" id="poAcceptSum"></div>
      <div class="po-accept-method">验收方式：<b>手动验收</b></div>
      <label>验收照片<span class="po-sub">${prevPhotos > 0 ? `已回填上一批 ${Math.min(prevPhotos, 5)} 张，最多 5 张，可删除` : '非必填，最多 5 张，可删除'}</span>
        <div class="po-photo-row" id="poAcceptPhotos"></div>
        <button class="po-btn po-btn-xs po-btn-ghost" id="poAddPhoto">+ 添加照片</button>
      </label>
      <div class="po-hist">
        <div class="po-hist-head">历史验收<span class="po-sub">共 ${liveRecs.length} 批 · 合计 ${trimQty(accepted)} ${esc(unit)}${delCount ? ` · 已删除 ${delCount} 批` : ''}${prevRecs.length ? '，每条都可删除（删后置灰保留、显示「已删除」）' : ''}</span></div>
        <table class="po-table po-hist-table">
          <thead><tr><th>批次</th><th>时间</th><th>验收人</th><th>本次验收量</th><th>照片</th><th>操作</th></tr></thead>
          <tbody id="poAccHist">${histRows}</tbody>
        </table>
      </div>
    </div>`,
    `<button class="po-btn" data-ac-cancel>取消</button><button class="po-btn po-btn-primary" data-ac-save>保存</button>`);

  const photos = new Array(Math.min(prevPhotos, 5)).fill(1);   /* 回填上一批照片 */
  const renderPhotos = () => {
    $('#poAcceptPhotos').innerHTML = photos.map((_, i) =>
      `<div class="po-photo"><span>验收照片 ${i + 1}<button class="po-photo-del" data-del-photo="${i}" title="删除">×</button></span></div>`).join('');
    const add = $('#poAddPhoto');
    add.disabled = photos.length >= 5;
    add.textContent = photos.length >= 5 ? '已达上限 5 张' : '+ 添加照片';
    $$('[data-del-photo]', $('#poAcceptPhotos')).forEach(b => b.addEventListener('click', e => {
      e.preventDefault(); photos.splice(Number(b.getAttribute('data-del-photo')), 1); renderPhotos();
    }));
  };
  /* 实时回显：本次 + 已验收 = 累计，并提示超发 / 短缺 */
  const syncSum = () => {
    const v = num($('#poAcceptQty').value);
    const box = $('#poAcceptSum');
    if (!v) {
      box.className = 'po-accept-sum';
      box.innerHTML = `已验收 <b>${trimQty(accepted)}</b> ${esc(unit)} · 待验收 <b>${trimQty(pending)}</b> ${esc(unit)}`;
      return;
    }
    const total = accepted + v;
    const over = total - ship;
    box.className = 'po-accept-sum' + (over > 0 ? ' is-over' : (over < 0 ? ' is-short' : ' is-eq'));
    box.innerHTML = `本次 <b>${trimQty(v)}</b> + 已验收 ${trimQty(accepted)} = 累计 <b>${trimQty(total)}</b> ${esc(unit)}`
      + (over > 0 ? ` · 超出实际发货量 ${trimQty(over)} ${esc(unit)}（超发 / 补送）`
        : over < 0 ? ` · 少于实际发货量 ${trimQty(-over)} ${esc(unit)}，验收完成时需填差异原因`
          : ' · 与实际发货量一致');
  };
  renderPhotos();
  syncSum();
  $('#poAcceptQty').addEventListener('input', syncSum);
  $('#poAddPhoto').addEventListener('click', e => {
    e.preventDefault();
    if (photos.length >= 5) { toast('验收照片最多 5 张'); return; }
    photos.push(1); renderPhotos();
  });

  /* V4.22：历史验收的删除（软删除，删后行仍保留、置灰显示「已删除」） */
  $$('[data-acc-del]', $('#poAccHist')).forEach(b => b.addEventListener('click', e => {
    e.preventDefault();
    softDeleteBatch(o, it, Number(b.getAttribute('data-acc-del')), () => openLineAccept(o, it));
  }));

  $('.mp-drawer [data-ac-cancel]').addEventListener('click', () => openLines(o));
  $('.mp-drawer [data-ac-save]').addEventListener('click', () => {
    const raw = ($('#poAcceptQty').value || '').trim();
    const v = Number(raw);
    if (!raw || !isFinite(v)) { toast('请填写本次验收量'); return; }
    if (!(v > 0)) { toast('本次验收量必须大于 0'); return; }
    /* 允许累计超出实际发货量（超发 / 补送），不拦截 */
    const before = accepted;
    const total = accepted + v;
    const seq = nextBatchSeq(o, it.skuCode);
    it.acceptedQty = total;
    it.acceptSeq = liveRecs.length + 1;
    o.accepts.push({
      itemSku: it.skuCode, seq, at: nowStr(), by: '李库管', method: 'manual',
      qty: v, before, after: total, diffReason: '', note: '', photos: photos.length
    });
    if (o.status === 'toReceive') o.status = 'accepted';
    o.timeline.push({ at: nowStr(), text: `验收「${it.productName}」第 ${seq} 批 ${trimQty(v)}${it.unit}，累计验收 ${trimQty(total)}${it.unit}` });
    closeDrawer();
    toast(`「${it.productName}」本次验收 ${trimQty(v)}${it.unit} 已记入（累计 ${trimQty(total)}${it.unit}）`);
    openLines(o);
    refreshCurrent();
  });
}
function openLineDetail(o, it) {
  const history = batchesOf(o, it.skuCode).slice().reverse();
  const certs = certsOf(o.supplierId, it.skuCode);
  const totalAccepted = num(it.acceptedQty);
  const shipQty = it.shippedQty == null ? null : num(it.shippedQty);
  const gap = shipQty == null ? 0 : shipQty - totalAccepted;
  /* 验收照片：只展示「最近一批」的照片 */
  const latestRec = history[0] || null;
  const photoTotal = latestRec ? num(latestRec.photos) : 0;
  const photosHtml = (() => {
    if (!photoTotal) return '<div class="po-empty">该商品尚未上传验收照片</div>';
    const blocks = [];
    for (let i = 1; i <= photoTotal; i++) blocks.push(`<div class="po-photo"><span>验收照片 ${i}</span></div>`);
    return `<div class="po-photo-row po-photo-row-pad">${blocks.join('')}</div>`;
  })();
  const certHtml = certs.length ? certs.map(c => `
      <div class="po-cert ${certExpired(c) ? 'is-expired' : ''}">
        <div class="po-photo"><span>${esc(c.type)}照片 ${c.photos}</span></div>
        <div>
          <b>${esc(c.title)}</b>
          <div class="po-sub">类型：${esc(c.type)} · 有效期至 ${c.validTo}${certExpired(c) ? ' · <span class="po-tag po-tag-warn">已过期</span>' : ''}</div>
          <div class="po-sub">上传：供应商 · ${c.at}</div>
        </div>
      </div>`).join('') : '<div class="po-empty">供应商尚未上传该商品的检测报告</div>';
  /* V4.22：批次记录每条都能删；删掉的批次不消失，整行置灰、操作列显示「已删除」；
     订单已完成（验收量锁定）时不给操作 */
  const canEditBatch = o.status !== 'done';
  const liveHistory = history.filter(a => !a.deleted);
  const histRows = history.length ? history.map(a => {
    const ops = a.deleted
      ? '<td><span class="po-sub">已删除</span></td>'
      : !canEditBatch
        ? '<td><span class="po-sub">—</span></td>'
        : `<td><button class="po-btn po-btn-xs po-btn-ghost" data-dacc-edit="${a.seq}">修改</button>
            <button class="po-btn po-btn-xs po-btn-ghost po-btn-danger" data-dacc-del="${a.seq}">删除</button></td>`;
    return `<tr data-dacc-row="${a.seq}"${a.deleted ? ' class="is-deleted"' : ''}><td>第 ${a.seq} 批</td><td class="po-sub">${a.at}</td><td>${esc(a.by)}</td>
      <td>${a.method === 'scale' ? '电子秤验收' : '手动验收'}</td>
      <td><b>${trimQty(batchQtyOf(a))}</b> ${esc(it.unit)}</td>
      <td class="po-sub">${a.after == null ? '—' : trimQty(a.after)}</td>
      <td>${num(a.photos)} 张</td>${ops}</tr>`;
  }).join('')
    : '<tr><td colspan="8">该商品尚未验收</td></tr>';
  /* 差异原因（V4.6）：验收完成环节统一填，一行一个原因 */
  const diffBlock = it.diffReason
    ? `<div class="po-diff-note"><b>${esc(acceptDiffText(it))}</b>
        <div class="po-sub">实际发货量 ${trimQty(shipQty)} ${esc(it.unit)} · 累计验收量 ${trimQty(totalAccepted)} ${esc(it.unit)} · 差异 ${trimQty(gap)} ${esc(it.unit)} · 验收完成时填写</div></div>`
    : gap > 0
      ? '<div class="po-empty">累计验收量少于实际发货量，差异原因将在「验收完成」时填写</div>'
      : '<div class="po-empty">无差异（累计验收量不少于实际发货量）</div>';
  const sigUrl = o.acceptance && o.acceptance.sig ? `<img class="po-sig-img" src="${o.acceptance.sig}" alt="签字">` : '';
  const sigBlock = o.acceptance
    ? `<div class="po-cert"><div class="po-photo po-photo-sig">${sigUrl || '<span>手写签名</span>'}</div>
        <div><b>验收人员签字</b><div class="po-sub">${esc(o.acceptance.by)} · ${o.acceptance.at}</div></div></div>`
    : '<div class="po-empty">该订单尚未完成验收签名</div>';

  drawer(`验收详情 · ${it.productName}`, `${o.no} · 送达 ${mdw(o.deliveryDate)}`,
    `<div class="po-section">
       <h3>商品信息</h3>
       <table class="po-table po-accept-info">
         <thead><tr><th>商品名称</th><th>品牌</th><th>规格</th><th>单位</th><th class="po-money">单价</th><th>下单量</th><th>实际发货量</th><th>累计验收量</th><th>待验收量</th><th class="po-money">当前验收金额</th></tr></thead>
         <tbody><tr>
           <td>${esc(it.productName)}<span class="po-sub">${esc(it.form || '')}</span></td>
           <td class="po-sub">${esc(it.brand || '—')}</td>
           <td class="po-sub">${esc(it.spec)}</td>
           <td>${esc(it.unit)}</td>
           <td class="po-money">${money(it.price)}</td>
           <td>${trimQty(it.qty)}</td>
           <td>${it.shippedQty == null ? '—' : trimQty(it.shippedQty)}</td>
           <td>${it.acceptedQty == null ? '—' : trimQty(it.acceptedQty)}</td>
           <td>${it.acceptedQty == null ? '—' : trimQty(pendingQtyOf(it))}</td>
           <td class="po-money">${it.acceptedQty == null ? '—' : money(num(it.acceptedQty) * num(it.price))}</td>
         </tr></tbody>
       </table>
     </div>
     ${num(it.returnQty) > 0 ? `<div class="po-banner po-banner-warn">售后回写：该商品已退货 ${trimQty(it.returnQty)} ${esc(it.unit)}，当前累计验收量 ${trimQty(it.acceptedQty)}；原始批次记录保留在下方（不覆盖历史）。</div>` : ''}
     <div class="po-section"><h3>验收批次记录<span class="po-sub">共 ${liveHistory.length} 批 · 累计 ${trimQty(totalAccepted)} ${esc(it.unit)}${history.length - liveHistory.length ? ` · 已删除 ${history.length - liveHistory.length} 批` : ''}${!history.length ? '' : (canEditBatch ? '（可改单批数量；每条都能删除，删后置灰保留）' : '（订单已完成，验收量已锁定）')}</span></h3>
       <table class="po-table"><thead><tr><th>批次</th><th>时间</th><th>验收人</th><th>验收方式</th><th>本批验收量</th><th>累计</th><th>照片</th><th>操作</th></tr></thead>
       <tbody>${histRows}</tbody></table>
     </div>
     <div class="po-section"><h3>差异原因<span class="po-sub">验收完成环节填写</span></h3>${diffBlock}</div>
     <div class="po-section"><h3>验收照片<span class="po-sub">${latestRec ? `最近一批 · 第 ${latestRec.seq} 批 · 共 ${photoTotal} 张` : ''}</span></h3>${photosHtml}</div>
     <div class="po-section"><h3>商品资质照片<span class="po-sub">供应商上传 · 商户端只读回显</span></h3>${certHtml}</div>
     <div class="po-section"><h3>验收人员签字照片</h3>${sigBlock}</div>`,
    `<button class="po-btn" data-ld-close>关闭</button>`, true);
  $('.mp-drawer [data-ld-close]').addEventListener('click', () => openLines(o));

  /* 改某一批的数量：就地改 → 重算累计 → 写时间轴 → 重开验收详情 */
  $$('.mp-drawer [data-dacc-edit]').forEach(b => b.addEventListener('click', e => {
    e.preventDefault();
    const seq = Number(b.getAttribute('data-dacc-edit'));
    const rec = batchesOf(o, it.skuCode).find(a => a.seq === seq);
    const tr = b.closest('tr');
    if (!rec || !tr) return;
    tr.children[4].innerHTML = `<input class="po-input po-qty po-qty-plain" id="poDetailEditQty" type="text" inputmode="decimal" autocomplete="off" value="${trimQty(batchQtyOf(rec))}">`;
    tr.children[7].innerHTML = `<button class="po-btn po-btn-xs po-btn-primary" data-dacc-edit-ok="${seq}">保存</button>
      <button class="po-btn po-btn-xs po-btn-ghost" data-dacc-edit-cancel="1">取消</button>`;
    $('[data-dacc-edit-ok]').addEventListener('click', ev2 => {
      ev2.preventDefault();
      const raw = ($('#poDetailEditQty').value || '').trim();
      const v = Number(raw);
      if (!raw || !isFinite(v)) { toast('请填写验收量'); return; }
      if (!(v > 0)) { toast('验收量必须大于 0'); return; }
      rec.qty = v;
      const { run } = recomputeAccepts(o, it);
      if (o.status === 'toReceive') o.status = 'accepted';
      o.timeline.push({ at: nowStr(), text: `修改「${it.productName}」第 ${seq} 批验收量为 ${trimQty(v)}${it.unit}，累计验收 ${trimQty(run)}${it.unit}` });
      toast(`第 ${seq} 批验收量已改为 ${trimQty(v)}${it.unit}，累计 ${trimQty(run)}${it.unit}`);
      refreshCurrent();
      openLineDetail(o, it);
    });
    $('[data-dacc-edit-cancel]').addEventListener('click', ev2 => { ev2.preventDefault(); openLineDetail(o, it); });
  }));

  /* V4.22：删除（软删除，行保留置灰）→ 重算累计 → 重开验收详情 */
  $$('.mp-drawer [data-dacc-del]').forEach(b => b.addEventListener('click', e => {
    e.preventDefault();
    softDeleteBatch(o, it, Number(b.getAttribute('data-dacc-del')), () => openLineDetail(o, it));
  }));
}


function openLineReturn(o, it) {
  if (o.status !== 'done') { toast('需「验收完成」后才能发起退货'); return; }
  if ((o.returns || []).some(r => r.status === 'pending' && r.skuCode === it.skuCode)) {
    toast('该商品已有待供应商确认的售后单'); return;
  }
  const cap = num(it.acceptedQty);
  drawer(`退货 · ${it.productName}`, `${o.no} · 送达 ${mdw(o.deliveryDate)} · 实际验收 ${trimQty(cap)} ${it.unit}`,
    `<div class="po-form po-accept-form">
      <table class="po-table po-accept-info">
        <thead><tr><th>商品名称</th><th>规格</th><th>单位</th><th class="po-money">单价</th><th>实际验收量</th></tr></thead>
        <tbody><tr>
          <td>${esc(it.productName)}<span class="po-sub">${esc(it.form || '')}</span></td>
          <td class="po-sub">${esc(it.spec)}</td>
          <td>${esc(it.unit)}</td>
          <td class="po-money">${money(it.price)}</td>
          <td><b>${trimQty(cap)}</b> ${esc(it.unit)}</td>
        </tr></tbody>
      </table>
      <label>退货量 <em>*</em>
        <input class="po-input po-qty po-qty-plain" id="poRtQty" type="text" inputmode="decimal" autocomplete="off" placeholder="请输入退货量">
        <span class="po-sub">必填，不可超过实际验收量 ${trimQty(cap)} ${esc(it.unit)}</span>
      </label>
      <label>退货原因 <em>*</em><span class="po-sub">必填，下拉选择 1 个原因</span>
        <select class="po-select" id="poRtReason">
          <option value="">请选择退货原因</option>
          ${RETURN_REASONS.map(r => `<option value="${r}">${r}</option>`).join('')}
        </select>
      </label>
      <div id="poRtOtherWrap" hidden>
        <label>其他原因 <em>*</em><span class="po-sub">选择「其他」时必填，请手动填写具体原因（最多 50 字）</span>
          <input class="po-input" id="poRtOther" type="text" maxlength="50" autocomplete="off" placeholder="请输入具体原因">
        </label>
      </div>
      <label>退货凭证<span class="po-sub">非必填，最多 5 张，可逐张删除（照片 / 检测截图 / 聊天记录均可）</span>
        <div class="po-photo-row" id="poRtPhotos"></div>
        <button class="po-btn po-btn-xs po-btn-ghost" id="poRtAddPhoto">+ 添加照片</button>
      </label>
    </div>`,
    `<button class="po-btn" data-rt-cancel>取消</button><button class="po-btn po-btn-primary" data-rt-ok>提交退货申请</button>`);
  /* 退货凭证：非必填，最多 5 张，可逐张删除（V4.4） */
  const rtPhotos = [];
  const renderRtPhotos = () => {
    $('#poRtPhotos').innerHTML = rtPhotos.map((_, i) =>
      `<div class="po-photo"><span>退货凭证 ${i + 1}<button class="po-photo-del" data-del-rt-photo="${i}" title="删除">×</button></span></div>`).join('');
    const add = $('#poRtAddPhoto');
    add.disabled = rtPhotos.length >= 5;
    add.textContent = rtPhotos.length >= 5 ? '已达上限 5 张' : '+ 添加照片';
    $$('[data-del-rt-photo]', $('#poRtPhotos')).forEach(b => b.addEventListener('click', e => {
      e.preventDefault(); rtPhotos.splice(Number(b.getAttribute('data-del-rt-photo')), 1); renderRtPhotos();
    }));
  };
  /* 「其他」才显示手填原因（V4.5） */
  const syncOther = () => {
    const isOther = $('#poRtReason').value === '其他';
    $('#poRtOtherWrap').hidden = !isOther;
    if (!isOther) $('#poRtOther').value = '';
  };
  $('#poRtReason').addEventListener('change', syncOther);
  syncOther();
  renderRtPhotos();
  $('#poRtAddPhoto').addEventListener('click', e => {
    e.preventDefault();
    if (rtPhotos.length >= 5) { toast('退货凭证最多 5 张'); return; }
    rtPhotos.push(1); renderRtPhotos();
  });
  $('.mp-drawer [data-rt-cancel]').addEventListener('click', () => openLines(o));
  $('.mp-drawer [data-rt-ok]').addEventListener('click', () => {
    const raw = ($('#poRtQty').value || '').trim();
    const q = Number(raw);
    if (!raw || !isFinite(q) || !(q > 0)) { toast('请填写退货量'); return; }
    if (q > cap) { toast(`退货量不能大于实际验收量（${trimQty(cap)}）`); return; }
    const reason = $('#poRtReason').value;
    if (!reason) { toast('请选择退货原因'); return; }
    const otherReason = reason === '其他' ? ($('#poRtOther').value || '').trim() : '';
    if (reason === '其他' && !otherReason) { toast('请填写「其他」的具体原因'); return; }
    const round = (o.returns || []).filter(r => r.skuCode === it.skuCode).length + 1;
    const no = nextReturnNo();
    o.returns.push({
      id: no, at: nowStr(), skuCode: it.skuCode, skuName: it.productName,
      qty: q, reason, otherReason, status: 'pending', round, by: '李库管', rejectReason: '', photos: rtPhotos.length
    });
    /* 只挂售后状态，不改订单状态（订单仍是已完成） */
    o.timeline.push({ at: nowStr(), text: `采购员发起退货申请 ${no}：「${it.productName}」${trimQty(q)}${it.unit}，原因：${returnReasonText({ reason, otherReason })}，等待供应商确认` });
    closeDrawer();
    toast('退货申请已提交，等待供应商确认');
    openLines(o);
    refreshCurrent();
  });
}

/* 售后详情（V2.0.21）：商品信息 + 售后信息 + 售后状态；不认可时可重新发起 */
function openAftersaleDetail(o, it) {
  const list = rowAftersales(o, it.skuCode);
  if (!list.length) { openLineReturn(o, it); return; }
  const latest = list[list.length - 1];
  const canRetry = latest.status === 'rejected';
  const histRows = list.slice().reverse().map(r => `<tr><td class="po-no">${esc(r.id)}</td><td class="po-sub">${r.at}</td>
      <td>${trimQty(r.qty)}</td><td class="po-sub">${esc(returnReasonText(r))}</td><td>${asTag(r.status)}</td>
      <td class="po-sub">${r.rejectReason ? esc(r.rejectReason) : '—'}</td></tr>`).join('');
  const stateBanner = latest.status === 'agreed'
    ? `<div class="po-banner po-banner-ok">供应商已认可：该商品实际验收量已更新为 ${trimQty(it.acceptedQty)} ${esc(it.unit)}，行标「有退货」。</div>`
    : latest.status === 'rejected'
      ? `<div class="po-banner po-banner-warn">供应商不认可：${esc(latest.rejectReason || '未填写理由')}。可修改后重新发起。</div>`
      : '<div class="po-banner">已提交，等待供应商确认；确认前订单状态仍为「已完成」。';
  drawer(`售后详情 · ${it.productName}`, `${o.no} · 送达 ${mdw(o.deliveryDate)} · 售后单 ${esc(latest.id)}`,
    `<div class="po-section"><h3>商品信息</h3>
      <table class="po-table po-accept-info">
        <thead><tr><th>商品名称</th><th>规格</th><th>单位</th><th class="po-money">单价</th><th>原验收量<span class="po-sub">退货前</span></th><th>已退货量</th><th>当前验收量</th></tr></thead>
        <tbody><tr>
          <td>${esc(it.productName)}<span class="po-sub">${esc(it.form || '')}</span></td>
          <td class="po-sub">${esc(it.spec)}</td>
          <td>${esc(it.unit)}</td>
          <td class="po-money">${money(it.price)}</td>
          <td><b>${trimQty(num(it.acceptedQty) + num(it.returnQty))}</b></td>
          <td>${num(it.returnQty) > 0 ? trimQty(it.returnQty) : '—'}</td>
          <td>${it.acceptedQty == null ? '—' : trimQty(it.acceptedQty)}</td>
        </tr></tbody>
      </table>
    </div>
    <div class="po-section"><h3>售后信息<span class="po-sub">本行共 ${list.length} 张售后单</span></h3>
      ${stateBanner}
      <table class="po-table">
        <thead><tr><th>售后单号</th><th>退货量</th><th>退货原因</th><th>申请时间</th><th>售后状态</th></tr></thead>
        <tbody><tr>
          <td class="po-no">${esc(latest.id)}</td>
          <td>${trimQty(latest.qty)} ${esc(it.unit)}</td>
          <td>${esc(returnReasonText(latest))}</td>
          <td class="po-sub">${latest.at} · ${esc(latest.by || '李库管')}</td>
          <td>${asTag(latest.status)}</td>
        </tr></tbody>
      </table>
      <div class="po-section"><h3>退货凭证<span class="po-sub">非必填 · 本次共 ${num(latest.photos)} 张</span></h3>
        ${num(latest.photos)
    ? `<div class="po-photo-row po-photo-row-pad">${Array.from({ length: Math.min(num(latest.photos), 5) }, (_, i) => `<div class="po-photo"><span>退货凭证 ${i + 1}</span></div>`).join('')}</div>`
    : '<div class="po-empty">本次售后未上传退货凭证</div>'}
      </div>
    </div>
    ${list.length > 1 ? `<div class="po-section"><h3>历史售后单</h3>
      <table class="po-table"><thead><tr><th>售后单号</th><th>申请时间</th><th>退货量</th><th>退货原因</th><th>售后状态</th><th>不认可理由</th></tr></thead>
      <tbody>${histRows}</tbody></table></div>` : ''}
`,
    `${canRetry ? '<button class="po-btn po-btn-primary" data-as-retry>重新发起</button>' : ''}<button class="po-btn" data-as-close>关闭</button>`, true);
  $('.mp-drawer [data-as-close]').addEventListener('click', () => openLines(o));
  const retry = $('.mp-drawer [data-as-retry]');
  if (retry) retry.addEventListener('click', () => openLineReturn(o, it));
}
/* ============================ 13. 验收完成 + 电子签名 ============================ */

/* 验收完成（V4.6）：先填差异原因 → 再电子签名 */
function openSignature(o) {
  if (o.status !== 'accepted') { toast('当前状态不可验收完成'); return; }
  const missing = o.items.filter(i => !lineAccepted(i));
  if (missing.length) { toast(`还有 ${missing.length} 个商品未验收，请先完成验收`); return; }
  if (missingDiffOf(o).length) { openFinishDiff(o); return; }
  openSignatureDrawer(o);
}

/* 差异原因确认抽屉：列出「累计验收量 < 实际发货量」的行，逐个填原因 */
function openFinishDiff(o) {
  const diffs = diffLinesOf(o);
  drawer('验收完成 · 差异原因确认', `${o.no} · ${diffs.length} 个商品累计验收量少于实际发货量`,
    `<div class="po-form po-form-wide">
      <div class="po-banner po-banner-warn">以下商品的累计验收量少于实际发货量，请逐个填写差异原因；全部填写后进入电子签名。</div>
      <table class="po-table po-diff-table">
        <thead><tr><th>商品名称</th><th>品牌</th><th>规格</th><th>单位</th><th>实际发货量</th><th>累计验收量</th><th>差异量</th><th>差异原因</th></tr></thead>
        <tbody>${diffs.map(it => {
    const isOther = it.diffReason === '其他';
    return `<tr data-diff-row="${it.skuCode}">
            <td>${esc(it.productName)}<span class="po-sub">${esc(it.form || '')}</span></td>
            <td class="po-sub">${esc(it.brand || '—')}</td>
            <td class="po-sub">${esc(it.spec)}</td>
            <td>${esc(it.unit)}</td>
            <td>${trimQty(it.shippedQty)}</td>
            <td><b>${trimQty(it.acceptedQty)}</b></td>
            <td class="po-diff-gap">${trimQty(num(it.shippedQty) - num(it.acceptedQty))}</td>
            <td>
              <select class="po-select" data-diff-reason="${it.skuCode}">
                <option value="">请选择差异原因</option>
                ${ACCEPT_DIFF_REASONS.map(r => `<option value="${r}" ${it.diffReason === r ? 'selected' : ''}>${r}</option>`).join('')}
              </select>
              <input class="po-input" data-diff-other="${it.skuCode}" type="text" maxlength="50" autocomplete="off"
                placeholder="请输入具体原因（最多 50 字）" value="${esc(it.diffOtherReason || '')}" ${isOther ? '' : 'hidden'}>
            </td></tr>`;
  }).join('')}</tbody>
      </table>
    </div>`,
    `<button class="po-btn" data-diff-cancel>取消</button><button class="po-btn po-btn-primary" data-diff-next>下一步：签名</button>`, true);

  const root = $('.mp-drawer');
  $$('[data-diff-reason]', root).forEach(sel => {
    const code = sel.getAttribute('data-diff-reason');
    const toggle = () => {
      const other = $(`[data-diff-other="${code}"]`, root);
      const isOther = sel.value === '其他';
      if (other) { other.hidden = !isOther; if (!isOther) other.value = ''; }
    };
    sel.addEventListener('change', toggle);
    toggle();
  });
  $('.mp-drawer [data-diff-cancel]').addEventListener('click', () => openLines(o));
  $('.mp-drawer [data-diff-next]').addEventListener('click', () => {
    for (const it of diffs) {
      const sel = $(`[data-diff-reason="${it.skuCode}"]`, root);
      const reason = sel ? sel.value : '';
      if (!reason) { toast(`请选择「${it.productName}」的差异原因`); return; }
      const otherEl = $(`[data-diff-other="${it.skuCode}"]`, root);
      const other = reason === '其他' ? ((otherEl && otherEl.value) || '').trim() : '';
      if (reason === '其他' && !other) { toast(`请填写「${it.productName}」的其他原因`); return; }
      it.diffReason = reason;
      it.diffOtherReason = other;
    }
    openSignatureDrawer(o);
  });
}

function openSignatureDrawer(o) {
  const diffs = diffLinesOf(o);
  /* V4.7：有差异的商品直接列在最上方（不再用横幅摘要 + 二次确认 + kv 汇总） */
  const diffSection = diffs.length ? `
      <div class="po-sig-diff">
        <div class="po-sig-diff-head">
          <span>有差异的商品<b>${diffs.length}</b>个<span class="po-sub">以下商品累计验收量少于实际发货量，差异原因已填写</span></span>
          <button type="button" class="po-btn po-btn-xs po-btn-ghost" data-diff-back>修改差异原因</button>
        </div>
        <table class="po-table po-diff-table">
          <thead><tr><th>商品名称</th><th>品牌</th><th>规格</th><th>单位</th><th>实际发货量</th><th>累计验收量</th><th>差异量</th><th>差异原因</th></tr></thead>
          <tbody>${diffs.map(d => `<tr>
            <td>${esc(d.productName)}<span class="po-sub">${esc(d.form || '')}</span></td>
            <td class="po-sub">${esc(d.brand || '—')}</td>
            <td class="po-sub">${esc(d.spec)}</td>
            <td>${esc(d.unit)}</td>
            <td>${trimQty(d.shippedQty)}</td>
            <td><b>${trimQty(d.acceptedQty)}</b></td>
            <td class="po-diff-gap">${trimQty(num(d.shippedQty) - num(d.acceptedQty))}</td>
            <td class="po-sub">${esc(acceptDiffText(d))}</td>
          </tr>`).join('')}</tbody>
        </table>
      </div>` : '';
  drawer('验收完成 · 电子签名', `${o.no} · 全部 ${o.items.length} 行已验收`,
    `<div class="po-form po-form-wide">
      ${diffSection}
      <div class="po-picker" id="poStaffPicker">
        <label>验收人 <em>*</em><span class="po-sub">从门店后厨人员中选择，可多选（不支持手工输入）</span></label>
        <div class="po-picked" id="poStaffPicked"></div>
        <button type="button" class="po-btn po-btn-xs po-btn-ghost" id="poStaffAdd">+ 添加验收人</button>
        <div class="po-picker-panel" id="poStaffPanel" hidden>
          <div class="po-picker-bar">
            <input class="po-input" id="poStaffSearch" placeholder="搜索姓名 / 手机号" autocomplete="off">
            <span class="po-sub" id="poStaffCount">已选 0 人</span>
          </div>
          <div class="po-picker-table">
            <table class="po-table">
              <thead><tr><th>姓名</th><th>手机号</th><th>选择</th></tr></thead>
              <tbody id="poStaffBody"></tbody>
            </table>
          </div>
          <div class="po-picker-foot">
            <button type="button" class="po-btn po-btn-xs" data-staff-cancel>取消</button>
            <button type="button" class="po-btn po-btn-xs po-btn-primary" data-staff-ok>确定</button>
          </div>
        </div>
      </div>
      <label>手写签名 <em>*</em><span class="po-sub">如多人验收，请在一张签名框内签字</span></label>
      <div class="po-sig-wrap"><canvas id="poSigCanvas" width="560" height="180"></canvas>
        <button class="po-btn po-btn-xs po-btn-ghost" id="poSigClear">清除</button></div>
    </div>`,
    `<button class="po-btn" data-sig-cancel>我再看下</button><button class="po-btn po-btn-primary" data-sig-ok>验收完成</button>`, true);

  const cv = $('#poSigCanvas');
  const ctx = cv.getContext('2d');
  ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.strokeStyle = '#1f2d3d';
  let hasInk = false, drawing = false;
  /* 【原型】给冒烟脚本留的手写模拟钩子 */
  sigHook = {
    ink: () => {
      hasInk = true;
      ctx.beginPath(); ctx.moveTo(60, 120);
      ctx.quadraticCurveTo(140, 40, 220, 110);
      ctx.quadraticCurveTo(300, 170, 400, 78);
      ctx.stroke();
    }
  };
  const pos = e => {
    const r = cv.getBoundingClientRect();
    const t = e.touches ? e.touches[0] : e;
    return { x: (t.clientX - r.left) * (cv.width / r.width), y: (t.clientY - r.top) * (cv.height / r.height) };
  };
  const start = e => { drawing = true; const p = pos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); e.preventDefault(); };
  const move = e => { if (!drawing) return; const p = pos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); hasInk = true; e.preventDefault(); };
  const end = () => { drawing = false; };
  cv.addEventListener('mousedown', start); cv.addEventListener('mousemove', move);
  document.addEventListener('mouseup', end);
  cv.addEventListener('touchstart', start, { passive: false });
  cv.addEventListener('touchmove', move, { passive: false });
  cv.addEventListener('touchend', end);
  $('#poSigClear').addEventListener('click', e => { e.preventDefault(); ctx.clearRect(0, 0, cv.width, cv.height); hasInk = false; });
  /* 验收人：「+ 添加验收人」→ 表格（姓名 / 手机号）搜索多选（不可输入姓名） */
  const pickedStaff = new Set();
  let draftStaff = new Set();
  const renderPicked = () => {
    const box = $('#poStaffPicked');
    box.innerHTML = pickedStaff.size
      ? [...pickedStaff].map(n => `<span class="po-picked-tag">${esc(n)}<button type="button" class="po-picked-del" data-staff-del="${esc(n)}" title="移除">×</button></span>`).join('')
      : '<span class="po-sub">尚未选择验收人</span>';
    $$('[data-staff-del]', box).forEach(b => b.addEventListener('click', e => {
      e.preventDefault(); pickedStaff.delete(b.getAttribute('data-staff-del')); renderPicked();
    }));
  };
  const renderPicker = () => {
    const kw = ($('#poStaffSearch').value || '').trim();
    const list = KITCHEN_STAFF.filter(s => !kw || s.name.includes(kw) || s.phone.includes(kw));
    $('#poStaffBody').innerHTML = list.length ? list.map(s => `
      <tr class="po-staff-row${draftStaff.has(s.name) ? ' is-on' : ''}" data-staff-row="${esc(s.name)}">
        <td>${esc(s.name)}</td><td class="po-sub">${esc(s.phone)}</td>
        <td>${draftStaff.has(s.name) ? '<b class="po-staff-on">已选</b>' : '<span class="po-sub">点击选择</span>'}</td>
      </tr>`).join('')
      : '<tr><td colspan="3"><div class="po-empty">没有匹配的人员</div></td></tr>';
    $$('[data-staff-row]').forEach(tr => tr.addEventListener('click', () => {
      const n = tr.getAttribute('data-staff-row');
      if (draftStaff.has(n)) draftStaff.delete(n); else draftStaff.add(n);
      renderPicker();
    }));
    $('#poStaffCount').textContent = `已选 ${draftStaff.size} 人`;
  };
  $('#poStaffAdd').addEventListener('click', e => {
    e.preventDefault();
    draftStaff = new Set(pickedStaff);
    $('#poStaffSearch').value = '';
    $('#poStaffPanel').hidden = false;
    renderPicker();
    $('#poStaffSearch').focus();
  });
  $('#poStaffSearch').addEventListener('input', renderPicker);
  $('.mp-drawer [data-staff-cancel]').addEventListener('click', e => { e.preventDefault(); $('#poStaffPanel').hidden = true; });
  $('.mp-drawer [data-staff-ok]').addEventListener('click', e => {
    e.preventDefault();
    pickedStaff.clear(); draftStaff.forEach(n => pickedStaff.add(n));
    $('#poStaffPanel').hidden = true;
    renderPicked();
  });
  renderPicked();

  const back = $('.mp-drawer [data-diff-back]');
  if (back) back.addEventListener('click', e => { e.preventDefault(); openFinishDiff(o); });

  $('.mp-drawer [data-sig-cancel]').addEventListener('click', () => openLines(o));
  $('.mp-drawer [data-sig-ok]').addEventListener('click', () => {
    const staff = KITCHEN_STAFF.filter(s => pickedStaff.has(s.name)).map(s => s.name);
    if (!staff.length) { toast('请至少选择 1 名验收人'); return; }
    if (!hasInk) { toast('请先完成电子签名'); return; }
    const diffsNow = diffLinesOf(o).map(d => ({
      skuCode: d.skuCode, name: d.productName, unit: d.unit,
      ship: num(d.shippedQty), accepted: num(d.acceptedQty),
      gap: num(d.shippedQty) - num(d.acceptedQty),
      reason: d.diffReason || '', other: d.diffOtherReason || ''
    }));
    o.acceptance = { at: nowStr(), by: staff.join('、'), staff, sig: cv.toDataURL('image/png'), photos: 1, diffs: diffsNow };
    o.status = 'done';
    o.timeline.push({ at: nowStr(), text: `验收完成并电子签名，订单已完成${diffsNow.length ? `（${diffsNow.length} 个商品有差异）` : '（无差异）'}` });
    closeDrawer();
    toast(`验收完成，已签名，订单 ${o.no} 已完成并锁定`);
    openLines(o);
    refreshCurrent();
  });
}

/* ============================ 14. 供应商模拟 ============================ */

function simConfirm(o) {
  if (o.status !== 'wait') { toast('当前状态无需确认'); return; }
  o.status = 'confirmed';
  o.timeline.push({ at: nowStr(), text: '供应商确认订单' });
  toast('供应商已确认订单');
  rerenderLines(o);
}

function openSupplierShip(o) {
  if (o.status !== 'confirmed') { toast('当前状态不可发货'); return; }
  const rows = o.items.map(it => `<tr>
      <td>${esc(it.productName)}</td><td>${trimQty(it.qty)} ${esc(it.unit)}</td>
      <td><input class="po-input po-qty" data-sq="${it.skuCode}" type="number" min="0" step="0.01" value="${trimQty(it.qty)}"></td>
    </tr>`).join('');
  drawer('供应商确认发货', `${o.no} · 送达 ${mdw(o.deliveryDate)}`,
    `<div class="po-form">
      <table class="po-table"><thead><tr><th>商品</th><th>下单量</th><th>实际发货量</th></tr></thead><tbody>${rows}</tbody></table>
      <div class="po-kv-grid">
        <div><label>配送人</label><input class="po-input" id="poShipDriver" value="${esc(supplierOf(o.supplierId).shipContact || '')}"></div>
        <div><label>配送电话</label><input class="po-input" id="poShipPhone" placeholder="选填"></div>
      </div>
      <p class="po-note">发货一次性提交；少发的部分由供应商线下自行补送，不再二次确认发货。</p>
    </div>`,
    `<button class="po-btn" data-sp-cancel>取消</button><button class="po-btn po-btn-primary" data-sp-ok>确认发货</button>`);
  $('.mp-drawer [data-sp-cancel]').addEventListener('click', () => openLines(o));
  $('.mp-drawer [data-sp-ok]').addEventListener('click', () => {
    const items = {};
    let bad = '';
    o.items.forEach(it => {
      const v = num($(`[data-sq="${it.skuCode}"]`).value);
      if (v > num(it.qty)) { bad = bad || `「${it.productName}」发货量不能大于下单量`; return; }
      it.shippedQty = v;
      items[it.skuCode] = v;
    });
    if (bad) { toast(bad); return; }
    o.shipments.push({ at: nowStr(), driver: $('#poShipDriver').value.trim() || '供应商', phone: $('#poShipPhone').value.trim(), items });
    o.status = 'toReceive';
    o.timeline.push({ at: nowStr(), text: '供应商确认发货' });
    closeDrawer();
    toast('发货已确认，订单进入待验收');
    openLines(o);
    refreshCurrent();
  });
}

function simReturnReply(o, agree) {
  const r = (o.returns || []).find(x => x.status === 'pending');
  if (!r) { toast('没有待供应商确认的售后单'); return; }
  const it = o.items.find(i => i.skuCode === r.skuCode);
  if (agree) {
    r.status = 'agreed';
    if (it) {
      const before = num(it.acceptedQty);
      const after = Math.max(0, before - num(r.qty));
      it.acceptedQty = after;                            /* 回写：实际验收量 = 退货后的量 */
      it.returnQty = num(it.returnQty) + num(r.qty);      /* 累计已退货量（打「有退货」标） */
      o.timeline.push({ at: nowStr(), text: `供应商认可售后 ${r.id}：「${r.skuName}」实际验收量 ${trimQty(before)} → ${trimQty(after)}，行标「有退货」` });
      toast(`供应商已认可，实际验收量已更新为 ${trimQty(after)}`);
    } else {
      toast('供应商已认可');
    }
    /* 订单状态不动（仍为已完成） */
  } else {
    toast('请填写不认可理由');
    return;
  }
  closeDrawer();
  openLines(o);
  refreshCurrent();
}

/* 供应商不认可售后：必须填理由 */
function openAftersaleReject(o) {
  const r = (o.returns || []).find(x => x.status === 'pending');
  if (!r) { toast('没有待供应商确认的售后单'); return; }
  drawer('不认可售后', `${r.id} · ${r.skuName} ${trimQty(r.qty)}`,
    `<div class="po-form">
      <div class="po-banner">不认可后该售后单状态变为「供应商不认可」，下单方可在「售后详情」里看到理由并重新发起。</div>
      <label>不认可理由 <em>*</em><span class="po-sub">必填，下单方可见</span>
        <textarea class="po-input" id="poAsRejectReason" rows="3" placeholder="如：到货时已按标准验收，不存在变质"></textarea>
      </label>
    </div>`,
    `<button class="po-btn" data-as-rj-cancel>取消</button><button class="po-btn po-btn-warn" data-as-rj-ok>确认不认可</button>`);
  $('.mp-drawer [data-as-rj-cancel]').addEventListener('click', () => openLines(o));
  $('.mp-drawer [data-as-rj-ok]').addEventListener('click', () => {
    const reason = ($('#poAsRejectReason').value || '').trim();
    if (!reason) { toast('请填写不认可理由'); return; }
    r.status = 'rejected';
    r.rejectReason = reason;
    o.timeline.push({ at: nowStr(), text: `供应商不认可售后 ${r.id}：${reason}` });
    toast('已提交不认可，下单方可重新发起');
    openLines(o);
    refreshCurrent();
  });
}
/* ============================ 15. 新建向导（直采下单，V4.2 无「选供应商」步） ============================ */

/* ===== V4.2：供应商不再在向导里选，改为取「供货关系管理」里该档口该 SKU 绑定的供应商 ===== */
/* 返回 { supId, supName, price }；未绑定 / 绑定供应商无报价 → null（该商品不参与下单） */
const bindInfoOf = (skuCode) => {
  const r = relationOf(skuCode);
  if (!r || !r.supplierId) return null;
  const price = quoteOfSupplier(r.supplierId, SKU[skuCode]);
  if (price == null) return null;
  return { supId: r.supplierId, supName: supplierOf(r.supplierId).name, price };
};
/* 可下单商品池 = 该档口在售 + 已绑定供应商 + 该供应商有报价 */
const orderPool = () => SKUS.filter(sk => !isOffShelf(sk.code) && bindInfoOf(sk.code));

/* 拆单：一个（送达日期 × 供应商）= 1 张订单 */
function wizGroups() {
  const out = [];
  upcomingDates().forEach(d => {
    const map = new Map();
    wiz.items.forEach(it => {
      const q = num(it.daily[d]);
      if (q <= 0) return;
      const b = bindInfoOf(it.skuCode);
      if (!b) return;
      if (!map.has(b.supId)) map.set(b.supId, { date: d, supId: b.supId, supName: b.supName, items: [] });
      map.get(b.supId).items.push({ it, qty: q });
    });
    out.push(...map.values());
  });
  return out;
}
const wizSupIds = () => [...new Set(wizGroups().map(g => g.supId))];
const wizSupNames = () => wizSupIds().map(id => supplierOf(id).name);

function startWizard() {
  wiz = {
    step: 0, items: [],
    from: addDays(TODAY, 1), to: addDays(TODAY, 1),
    receiver: { contact: '', phone: '', addr: STORE_ADDR },   /* 收货联系人必须从门店后厨人员单选 */
    ship: { contact: '', phone: '' },
    activeDate: '',      /* 第 2 步当前选中的日期页签 */
    excluded: [],        /* 用户单独删除的日期（不生成该天订单） */
    clip: null           /* 复制当天商品清单：{ day, items:[{skuCode, qty, note}] } */
  };
  hideAll($('#poOrderNav'));
  breadcrumb('采购订单 · 新建订单');
  wizPage().hidden = false;
  renderWizard();
}

const wizSteps = () => ['送达日期与数量', '总览', '收货与提交'];

const rangeDates = () => daysBetween(wiz.from, wiz.to);
/* 有效日期 = 区间 − 用户单独删除的日期 */
const demandDates = () => rangeDates().filter(d => !(wiz.excluded || []).includes(d));
const dayHasQty = d => wiz.items.some(it => num(it.daily[d]) > 0);
const upcomingDates = () => demandDates().filter(dayHasQty);
const wizTotal = () => wiz.items.reduce((s, it) => s + demandDates().reduce((x, d) => x + num(it.daily[d]) * num(it.price), 0), 0);

function renderWizard() {
  const p = wizPage();
  const steps = wizSteps();
  const head = `<div class="po-head">
      <div><button class="po-btn po-btn-ghost po-btn-xs" id="wizBack">← 返回采购订单</button>
      <h2>新建订单</h2>
      <p class="po-sub">按送达日期逐日填量；某天都不填则不生成该天订单。</p></div>
    </div>
    <div class="po-steps">${steps.map((t, i) => `<div class="po-step ${i === wiz.step ? 'active' : ''} ${i < wiz.step ? 'done' : ''}"><b>${i + 1}</b><span>${t}</span></div>`).join('')}</div>`;

  let body = '';
  if (wiz.step === 0) body = stepDemandDirect();
  else if (wiz.step === 1) body = stepOverview();
  else if (wiz.step === 2) body = stepReceiver();

  p.innerHTML = head + body;
  $('#wizBack').addEventListener('click', () => { wiz = null; showList(); });
  bindWizard();
}

/* 各步骤的「上一步 / 下一步 / 提交」统一放在卡片标题行右侧 */
function wizHeadActs(o) {
  const c = o || {};
  const parts = [];
  if (c.extra) parts.push(c.extra);
  if (c.prev !== false) parts.push('<button class="po-btn po-btn-sm" id="wizPrev">上一步</button>');
  if (c.next !== false) parts.push(`<button class="po-btn po-btn-sm po-btn-primary" id="${c.submit ? 'wizSubmit' : 'wizNext'}">${c.nextLabel || '下一步'}</button>`);
  return `<div class="po-head-acts">${parts.join('')}</div>`;
}

/* ---------- 2b. 直采下单：按日期页签添加当日商品 ---------- */
function stepDemandDirect() {
  const dates = demandDates();
  const all = rangeDates();
  const rangeBar = `<div class="po-filters">
      <label>起始日<input type="date" class="po-input" id="wizFrom" value="${wiz.from}"></label>
      <label>结束日<input type="date" class="po-input" id="wizTo" value="${wiz.to}"></label>
      <span class="po-sub">区间最长 31 天；每个日期单独下单，某天不填则不生成该天订单</span>
    </div>`;

  if (!orderPool().length) {
    return `<div class="po-card">
      <div class="po-section-head">
        <h3>送达日期与数量</h3>
        ${wizHeadActs({ prev: false, next: false })}
      </div>
      <div class="po-empty">该档口还没有「已绑定供应商且有报价」的商品，无法下单。<br>
        请先到 <b>采购管理 › 供货关系管理</b> 把商品绑定到供应商（单价与供应商都取自这里）。</div>
      <div class="po-empty-acts"><button class="po-btn po-btn-sm po-btn-primary" id="wizGoSupply">去供货关系管理</button></div>
    </div>`;
  }
  if (!dates.length) {
    return `<div class="po-card">
      <div class="po-section-head">
        <h3>送达日期与数量</h3>
        ${wizHeadActs({ extra: all.length ? '<button class="po-btn po-btn-xs" id="wizRestoreDay">恢复已删除的日期</button>' : '', next: false })}
      </div>
      ${rangeBar}
      <div class="po-empty">${all.length ? `区间内 ${all.length} 天已全部删除，点右上角「恢复已删除的日期」或重新选择日期区间` : '请先选择送达日期区间'}</div>
    </div>`;
  }

  if (!dates.includes(wiz.activeDate)) wiz.activeDate = dates[0];
  const day = wiz.activeDate;
  const dayItems = wiz.items.filter(it => it.daily[day] !== undefined);
  const daySum = dayItems.reduce((s, it) => s + num(it.daily[day]) * num(it.price), 0);
  const dayFilled = dayItems.filter(it => num(it.daily[day]) > 0).length;
  const cnt = upcomingDates().length;

  const tabs = dates.map(d => {
    const on = d === day;
    const err = (wiz.errorDates || []).includes(d);
    return `<span class="po-daytab ${on ? 'active' : ''}${err ? ' po-daytab-error' : ''}">
        <button class="po-daytab-main" data-day-tab="${d}">${md(d)}<em>周${WEEK[parseISO(d).getDay()]}</em></button>
        <button class="po-daytab-x" data-day-del="${d}" title="删除这一天（不生成该天订单）">×</button>
      </span>`;
  }).join('');

  const rows = dayItems.map(it => {
    const sk = SKU[it.skuCode];
    const supName = (bindInfoOf(it.skuCode) || {}).supName || '—';
    const lineTotal = num(it.daily[day]) * num(it.price);
    return `<tr>
      <td>${thumbHtml(sk.productName, SKUS.indexOf(sk))}</td>
      <td>${esc(sk.productName)}</td>
      <td>${esc(supName)}</td>
      <td>${esc(sk.unit)}</td>
      <td class="po-sub">${esc(sk.spec)}</td>
      <td>${esc(sk.brand || '—')}</td>
      <td class="po-money">${money(it.price)}</td>
      <td class="po-money" data-day-total="${it.skuCode}">${num(it.daily[day]) > 0 ? money(lineTotal) : '<span class="po-sub">—</span>'}</td>
      <td><span class="po-tag">${esc(sk.form)}</span></td>
      <td><input class="po-qty${(wiz.errorDates || []).includes(day) && num(it.daily[day]) <= 0 ? ' po-qty-error' : ''}" type="number" min="0" step="0.01" data-day-qty="${it.skuCode}" value="${num(it.daily[day]) > 0 ? trimQty(it.daily[day]) : ''}" placeholder="—"></td>
      <td><input class="po-input po-note-input" data-day-note="${it.skuCode}" value="${esc((it.note && it.note[day]) || '')}" placeholder="选填"></td>
      <td><button class="po-btn po-btn-xs po-btn-ghost" data-day-del-line="${it.skuCode}">删除</button></td>
    </tr>`;
  }).join('');

  return `<div class="po-card">
    <div class="po-section-head">
      <h3>送达日期与数量<span class="po-sub">先选日期页签，再往里添加当天要采购的商品</span></h3>
      ${wizHeadActs({
        prev: false,
        extra: wiz.excluded.length ? `<button class="po-btn po-btn-xs" id="wizRestoreDay">恢复已删除的 ${wiz.excluded.length} 天</button>` : '',
        nextLabel: '下一步：总览'
      })}
    </div>
    ${rangeBar}
    <div class="po-daytabs">${tabs}</div>
    <div class="po-daybar">
      <div class="po-daybar-t">
        <b>${md(day)} 周${WEEK[parseISO(day).getDay()]}</b>
        <span class="po-sub">已选 ${dayItems.length} 个商品（已填量 <b id="poDayFilled">${dayFilled}</b> 个） · 当天小计 <b class="po-money" id="poDaySum">${money(daySum)}</b></span>
      </div>
      <div class="po-daybar-acts">
        <button class="po-btn po-btn-sm" id="poDayCopy" title="复制当天商品清单与填量">复制</button>
        <button class="po-btn po-btn-sm" id="poDayPaste" title="把复制的商品清单粘贴到当前日期">粘贴</button>
        <button class="po-btn po-btn-primary po-btn-sm" id="wizAddSku">+ 添加该日商品</button>
      </div>
    </div>
    ${dayItems.length ? `<div class="po-table-wrap"><table class="po-table po-day-table">
        <thead><tr><th>图片</th><th>商品名称</th><th>供应商</th><th>单位</th><th>规格</th><th>品牌</th><th class="po-money">单价</th><th class="po-money">总价</th><th>形态</th><th>采购量</th><th>备注</th><th></th></tr></thead>
        <tbody>${rows}</tbody></table></div>`
      : `<div class="po-empty">${md(day)} 还没有商品，点右上角「+ 添加该日商品」</div>`}
    <div class="po-sum-row">将生成 <b id="poOrdCnt">${wizGroups().length}</b> 张订单：${md(wiz.from)} ~ ${md(wiz.to)} 中 <b id="poDayCnt">${cnt}</b> 天有需求 · 涉及 <b id="poSupCnt">${wizSupIds().length}</b> 家供应商（每家供应商每个送达日期各 1 张）· 合计 <b class="po-money" id="poWizTotal">${money(wizTotal())}</b></div>
  </div>`;
}

function stepOverview() {
  const dates = upcomingDates();
  const rangeDays = Math.max(1, Math.round((parseISO(wiz.to) - parseISO(wiz.from)) / 86400000) + 1);
  const groups = wizGroups();
  /* 有量的商品 → 所属供应商（去重） */
  const supIds = [...new Set(wiz.items
    .filter(it => dates.some(d => num(it.daily[d]) > 0))
    .map(it => (bindInfoOf(it.skuCode) || {}).supId)
    .filter(Boolean))];

  /* 每家供应商：商品行 + 小计 + 该家会生成几张订单（按 1 张订单 = 1 个送达日期） */
  const supGroups = supIds.map(supId => {
    const supName = supplierOf(supId).name;
    const items = wiz.items.filter(it => {
      const b = bindInfoOf(it.skuCode);
      return b && b.supId === supId && dates.reduce((s, d) => s + num(it.daily[d]), 0) > 0;
    });
    const subTotal = items.reduce((s, it) => s + dates.reduce((x, d) => x + num(it.daily[d]) * num(it.price), 0), 0);
    const myDates = groups.filter(g => g.supId === supId).map(g => g.date);
    return { supId, supName, items, subTotal, orderCnt: myDates.length, dates: myDates };
  }).sort((a, b) => b.subTotal - a.subTotal);   /* 金额大的排前面 */

  const cards = supGroups.map(g => {
    const rows = g.items.map(it => {
      const sk = SKU[it.skuCode];
      const total = dates.reduce((s, d) => s + num(it.daily[d]), 0);
      return `<tr><td>${thumbHtml(sk.productName, SKUS.indexOf(sk))}</td>
        <td>${esc(sk.productName)}</td>
        <td>${esc(sk.unit)}</td>
        <td class="po-sub">${esc(sk.spec)}</td>
        <td>${esc(sk.brand || '—')}</td>
        <td><span class="po-tag">${esc(sk.form)}</span></td>
        <td class="po-money">${money(it.price)}</td>
        <td class="po-ov-daily">${dates.filter(d => num(it.daily[d]) > 0).map(d => `${md(d)} <b>${trimQty(it.daily[d])}</b>`).join(' · ') || '—'}</td>
        <td>${trimQty(total)} ${esc(sk.unit)}</td>
        <td class="po-money">${money(total * num(it.price))}</td></tr>`;
    }).join('');
    return `<div class="po-card po-ov-sup" data-ov-sup="${g.supId}">
      <div class="po-ov-sup-head">
        <i class="po-ov-sup-bar"></i>
        <h3>${esc(g.supName)}</h3>
        <span class="po-ov-sup-meta">${g.items.length} 个商品 · ${g.orderCnt} 张订单（${g.dates.map(d => md(d)).join('、')}）</span>
        <span class="po-ov-sup-sum">小计<b>${money(g.subTotal)}</b></span>
      </div>
      <div class="po-table-wrap"><table class="po-table po-ov-table">
        <thead><tr><th>图片</th><th>商品</th><th>单位</th><th>规格</th><th>品牌</th><th>形态</th><th class="po-money">单价</th><th>每日数量</th><th>总数量</th><th class="po-money">金额</th></tr></thead>
        <tbody>${rows}</tbody></table></div>
    </div>`;
  }).join('');

  return `<div class="po-card po-ov-sum">
    <div class="po-section-head">
      <h3>总览<span class="po-sub">供应商取自「供货关系管理」；同一商品只来自 1 家供应商，一个送达日期会按供应商拆成多张订单</span></h3>
      ${wizHeadActs({ nextLabel: '下一步：收货与提交' })}
    </div>
    <div class="po-ov-total">
      <label>合计金额</label>
      <div class="po-ov-total-v">${money(wizTotal())}</div>
    </div>
    <div class="po-ov-stats">
      <div class="po-ov-stat"><label>送达日期区间</label><b>${md(wiz.from)} ~ ${md(wiz.to)}</b><span>共 ${rangeDays} 天</span></div>
      <div class="po-ov-stat"><label>有需求天数</label><b>${dates.length} 天</b><span>${dates.length ? dates.map(d => md(d)).join('、') : '区间内没有填量'}</span></div>
      <div class="po-ov-stat"><label>订单张数</label><b>${groups.length} 张</b><span>每家供应商每个送达日期各 1 张</span></div>
      <div class="po-ov-stat"><label>涉及供应商</label><b>${supGroups.length} 家</b><span>明细见下方各卡片</span></div>
    </div>
    <div class="po-ov-sups">
      <div class="po-ov-chips">
        ${supGroups.length ? supGroups.map(g => `<span class="po-ov-chip" title="${esc(g.supName)}"><b>${esc(g.supName)}</b><i>${g.items.length} 商品 · ${g.orderCnt} 张订单</i></span>`).join('') : '<span class="po-sub">区间内没有填写数量</span>'}
      </div>
    </div>
  </div>
  ${cards || ''}`;
}

/* 收货联系人回显：姓名 手机号（手机号随人员拼接显示） */
const rcDisplay = () => {
  const c = (wiz.receiver.contact || '').trim();
  const ph = (wiz.receiver.phone || '').trim();
  if (!c) return '';
  return ph && !c.includes(ph) ? `${c} ${ph}` : c;
};

function stepReceiver() {
  return `<div class="po-card">
    <div class="po-section-head">
      <h3>收货信息与提交</h3>
      ${wizHeadActs({ nextLabel: '提交下单', submit: true })}
    </div>
    <div class="po-form">
      <div class="po-kv-grid">
        <div class="po-kv-wide">
          <label>收货联系人 <em>*</em><span class="po-sub">从门店后厨人员中选择，只能选 1 人</span></label>
          <div class="po-recv-pick">
            <input class="po-input" id="wizRcContact" value="${esc(rcDisplay())}" readonly placeholder="尚未选择">
            <button type="button" class="po-btn po-btn-sm" id="wizRcPick">${wiz.receiver.contact ? '重选' : '选择'}</button>
            ${wiz.receiver.contact ? '<button type="button" class="po-btn po-btn-sm po-btn-ghost" id="wizRcClear">清除</button>' : ''}
          </div>
        </div>
        <div class="po-kv-wide"><label>收货地址 <em>*</em><span class="po-sub">默认回显门店地址，可修改</span></label><input class="po-input" id="wizRcAddr" value="${esc(wiz.receiver.addr || STORE_ADDR)}" placeholder="请填写收货地址"></div>
      </div>
    </div>
  </div>`;
}

/* 第 4 步：选择收货联系人（门店后厨人员，单选，参考验收人的表格选择方式） */
function openReceiverPicker() {
  const body = `<div class="po-rc-picker">
      <input class="po-input" id="poRcSearch" placeholder="搜索姓名 / 手机号" autocomplete="off">
      <table class="po-table"><thead><tr><th>姓名</th><th>手机号</th><th>操作</th></tr></thead>
        <tbody id="poRcBody"></tbody></table>
    </div>`;
  drawer('选择收货联系人', '从门店后厨人员中选择，只能选 1 人（不支持手工输入）', body,
    '<button class="po-btn" data-rc-cancel>取消</button>', false);

  const paint = () => {
    const kw = ($('#poRcSearch').value || '').trim();
    const list = KITCHEN_STAFF.filter(x => !kw || x.name.includes(kw) || x.phone.includes(kw));
    $('#poRcBody').innerHTML = list.length ? list.map(x => `<tr>
        <td>${esc(x.name)}${x.name === wiz.receiver.contact ? ' <b class="po-staff-on">当前</b>' : ''}</td>
        <td>${esc(x.phone)}</td>
        <td><button type="button" class="po-btn po-btn-xs" data-rc-pick="${esc(x.name)}" data-rc-phone="${esc(x.phone)}">选择</button></td>
      </tr>`).join('') : '<tr><td colspan="3" class="po-sub">没有匹配的人员</td></tr>';
    $$('[data-rc-pick]').forEach(b => b.addEventListener('click', () => {
      wiz.receiver = { contact: b.getAttribute('data-rc-pick'), phone: b.getAttribute('data-rc-phone'), addr: wiz.receiver.addr || STORE_ADDR };
      closeDrawer();
      renderWizard();
      toast(`已选择收货联系人：${b.getAttribute('data-rc-pick')} ${b.getAttribute('data-rc-phone')}`);
    }));
  };
  $('#poRcSearch').addEventListener('input', paint);
  const cancel = $('[data-rc-cancel]'); if (cancel) cancel.addEventListener('click', closeDrawer);
  paint();
  $('#poRcSearch').focus();
}

function bindWizard() {
  const p = wizPage();
  const prev = $('#wizPrev'); if (prev) prev.addEventListener('click', () => { wiz.step = Math.max(0, wiz.step - 1); renderWizard(); });
  const next = $('#wizNext');
  if (next) next.addEventListener('click', () => {
    if (wiz.step === 0) {
      if (!wiz.items.length) { toast('请先添加商品'); return; }
      /* 有商品但采购量没填 / 填 0 → 拦住，并定位到第一个有问题的日期 */
      const blank = demandDates().filter(d => wiz.items.some(it => it.daily[d] !== undefined && num(it.daily[d]) <= 0));
      if (blank.length) {
        wiz.errorDates = blank;
        wiz.activeDate = blank[0];
        renderWizard();
        toast(`当前 ${blank.map(d => md(d) + '日').join('、')} 有未填写采购量的商品，请检查`);
        return;
      }
      wiz.errorDates = [];
      if (!upcomingDates().length) { toast('所选区间内没有填写任何数量'); return; }
    }
    wiz.step = Math.min(wizSteps().length - 1, wiz.step + 1);
    renderWizard();
  });
  const from = $('#wizFrom'), to = $('#wizTo');
  if (from) from.addEventListener('change', e => {
    const v = e.target.value;
    if (!v) return;
    if (v > wiz.to) { toast('起始日不能晚于结束日'); renderWizard(); return; }
    if (daysBetween(v, wiz.to).length > 31) { toast('需求区间最长 31 天，请缩小范围'); renderWizard(); return; }
    wiz.from = v; renderWizard();
  });
  if (to) to.addEventListener('change', e => {
    const v = e.target.value;
    if (!v) return;
    if (v < wiz.from) { toast('起始日不能晚于结束日'); renderWizard(); return; }
    if (daysBetween(wiz.from, v).length > 31) { toast('需求区间最长 31 天，请缩小范围'); renderWizard(); return; }
    wiz.to = v; renderWizard();
  });
  $$('[data-daily]', p).forEach(inp => inp.addEventListener('input', e => {
    const [sku, d] = e.target.getAttribute('data-daily').split(':');
    const it = wiz.items.find(x => x.skuCode === sku);
    if (!it) return;
    it.daily[d] = num(e.target.value);
    const cnt = upcomingDates().length;
    const dc = $('#poDayCnt'), tt = $('#poWizTotal');
    if (dc) dc.textContent = cnt;
    if (tt) tt.textContent = money(wizTotal());
  }));
  $$('[data-del-sku]', p).forEach(b => b.addEventListener('click', () => {
    wiz.items = wiz.items.filter(x => x.skuCode !== b.getAttribute('data-del-sku'));
    renderWizard();
  }));
  /* 日期页签 */
  $$('[data-day-tab]', p).forEach(b => b.addEventListener('click', () => { wiz.activeDate = b.getAttribute('data-day-tab'); renderWizard(); }));
  /* errorDates 保留到用户补齐为止，只在新校验时重置 */
  /* 单独删除某天 → 该天不生成订单 */
  $$('[data-day-del]', p).forEach(b => b.addEventListener('click', () => {
    const d = b.getAttribute('data-day-del');
    const n = wiz.items.filter(it => num(it.daily[d]) > 0).length;
    wiz.excluded = (wiz.excluded || []).concat([d]);
    if (wiz.activeDate === d) wiz.activeDate = '';
    toast(n ? `已删除 ${md(d)}（含 ${n} 个商品），该天不再生成订单` : `已删除 ${md(d)}，该天不再生成订单`);
    renderWizard();
  }));
  const restore = $('#wizRestoreDay');
  if (restore) restore.addEventListener('click', () => { wiz.excluded = []; toast('已恢复全部日期'); renderWizard(); });
  /* 当日采购量 / 备注 */
  const syncSum = () => {
    const cnt = upcomingDates().length;
    const dc = $('#poDayCnt'), tt = $('#poWizTotal');
    if (dc) dc.textContent = cnt;
    if (tt) tt.textContent = money(wizTotal());
    /* V4.2：拆单口径随填量实时刷新（张数 = 日期 × 供应商；涉及供应商 = 有量的商品所属供应商去重） */
    const oc = $('#poOrdCnt'), sc = $('#poSupCnt');
    if (oc) oc.textContent = String(wizGroups().length);
    if (sc) sc.textContent = String(wizSupIds().length);
    const sum = $('#poDaySum');
    if (sum) sum.textContent = money(wiz.items.reduce((x, it) => x + num(it.daily[wiz.activeDate]) * num(it.price), 0));
    const filled = $('#poDayFilled');
    if (filled) filled.textContent = wiz.items.filter(it => it.daily[wiz.activeDate] !== undefined && num(it.daily[wiz.activeDate]) > 0).length;
  };
  /* 行内「总价」= 采购量 × 单价，未填量显示 —（填量、清空、粘贴后都要重算） */
  const syncRowTotal = it => {
    const td = p.querySelector(`[data-day-total="${it.skuCode}"]`);
    if (!td) return;
    const q = num(it.daily[wiz.activeDate]);
    td.innerHTML = q > 0 ? money(q * num(it.price)) : '<span class="po-sub">—</span>';
  };
  $$('[data-day-qty]', p).forEach(inp => {
    const it = wiz.items.find(x => x.skuCode === inp.getAttribute('data-day-qty'));
    if (!it) return;
    inp.addEventListener('input', e => {
      /* 先落状态，再按新值刷新视图（否则总价会用上一手数量） */
      it.daily[wiz.activeDate] = num(e.target.value);
      if (inp.classList.contains('po-qty-error') && num(e.target.value) > 0) {
        inp.classList.remove('po-qty-error');
        wiz.errorDates = (wiz.errorDates || []).filter(d => d !== wiz.activeDate);
      }
      syncRowTotal(it);
      syncSum();
    });
    /* 粘贴 / 失焦也兜一遍：避免只触发 change 时行内总价停在上一个值 */
    inp.addEventListener('change', () => {
      it.daily[wiz.activeDate] = num(inp.value);
      syncRowTotal(it); syncSum();
    });
    inp.addEventListener('paste', () => setTimeout(() => {
      it.daily[wiz.activeDate] = num(inp.value);
      syncRowTotal(it); syncSum();
    }, 0));
  });
  $$('[data-day-note]', p).forEach(inp => inp.addEventListener('input', e => {
    const it = wiz.items.find(x => x.skuCode === e.target.getAttribute('data-day-note'));
    if (!it) return;
    if (!it.note) it.note = {};
    it.note[wiz.activeDate] = e.target.value;
  }));
  $$('[data-day-del-line]', p).forEach(b => b.addEventListener('click', () => {
    const code = b.getAttribute('data-day-del-line');
    const it = wiz.items.find(x => x.skuCode === code);
    if (!it) return;
    delete it.daily[wiz.activeDate];
    if (it.note) delete it.note[wiz.activeDate];
    if (!Object.keys(it.daily).length) wiz.items = wiz.items.filter(x => x.skuCode !== code);
    renderWizard();
  }));
  const rcPick = $('#wizRcPick'); if (rcPick) rcPick.addEventListener('click', openReceiverPicker);
  const rcClear = $('#wizRcClear');
  if (rcClear) rcClear.addEventListener('click', () => {
    wiz.receiver = { contact: '', phone: '', addr: wiz.receiver.addr || STORE_ADDR };
    renderWizard();
  });
  const rcAddr = $('#wizRcAddr');
  if (rcAddr) rcAddr.addEventListener('input', e => { wiz.receiver.addr = e.target.value; });
  const add = $('#wizAddSku'); if (add) add.addEventListener('click', () => openAddSku());
  /* 复制当天商品清单与填量 */
  const copyBtn = $('#poDayCopy');
  if (copyBtn) copyBtn.addEventListener('click', () => {
    const day = wiz.activeDate;
    const picked = wiz.items
      .filter(it => it.daily[day] !== undefined)
      .map(it => ({ skuCode: it.skuCode, qty: num(it.daily[day]), note: (it.note && it.note[day]) || '' }));
    if (!picked.length) { toast(`${md(day)} 还没有商品，先添加再复制`); return; }
    wiz.clip = { day, items: picked };
    toast('复制成功，可前往其他日期点击「粘贴」，粘贴商品清单');
  });
  /* 粘贴到当前日期 */
  const pasteBtn = $('#poDayPaste');
  if (pasteBtn) pasteBtn.addEventListener('click', () => {
    const day = wiz.activeDate;
    if (!wiz.clip) { toast('请先选择日期点击「复制」'); return; }
    if (wiz.clip.day === day) { toast('您复制的为当日商品，请选择其他日期粘贴'); return; }
    let n = 0;
    wiz.clip.items.forEach(c => {
      const sk = SKU[c.skuCode];
      if (!sk) return;
      let it = wiz.items.find(x => x.skuCode === c.skuCode);
      if (!it) {
        it = { skuCode: c.skuCode, productName: sk.productName,
               price: pickUnitPrice(c.skuCode),
               daily: {}, note: {} };
        wiz.items.push(it);
      }
      it.daily[day] = num(c.qty);
      it.note = it.note || {};
      it.note[day] = c.note || '';
      n += 1;
    });
    renderWizard();
    toast('粘贴商品成功，您可继续调整明细');
  });
  const goSupply = $('#wizGoSupply');
  if (goSupply) goSupply.addEventListener('click', () => { wiz = null; showSupplyRelation(); });
  const sub = $('#wizSubmit'); if (sub) sub.addEventListener('click', submitDirect);
}

/* 添加商品抽屉（V2.0.24）：名称 / 拼音首字母搜索 + 分类筛选；列表 单价回显；已添加可取消；右下角「已选 N 种商品」可展开管理 */
let pick = { kw: '', catSel: [], form: 'all', qty: {}, note: {}, openSelected: false, catOpen: false, fuzzyIdx: -1, fuzzyOpen: false,
  applied: { kw: '', catSel: [], form: 'all' } };   /* 只有点「查询」才把 draft 落到 applied */

/* V2.0.42：picker 默认服务向导；传入 pickCtx（修改订单）时改为服务该订单 */
let pickCtx = null;
const pickDay = () => (pickCtx ? pickCtx.day
  : ((wiz && wiz.activeDate && demandDates().includes(wiz.activeDate)) ? wiz.activeDate : (demandDates()[0] || '')));
const pickSupplierId = () => (pickCtx ? pickCtx.supplierId : '');
/* V4.2：向导里单价 = 该 SKU 绑定供应商的报价（供货关系管理）；修改订单仍取该订单供应商报价 */
const pickUnitPrice = code => {
  if (pickCtx) return skuPriceOf(pickCtx.supplierId, code) || refPriceOf(code) || 0;
  const b = bindInfoOf(code);
  return b ? b.price : (refPriceOf(code) || 0);
};
const pickItems = () => (pickCtx ? pickCtx.items : wiz.items);
/* 该商品在这一天是否已添加（已添加的行要回显采购量与备注、输入框锁定） */
const pickAddedItem = code => pickItems().find(x => x.skuCode === code && x.daily[pickDay()] !== undefined);
/* 直采下单：单价取该供应商的预报价，始终展示 */

/* 当前供应商的可采商品池 */
const pickPool = () => {
  if (pickCtx) {   /* 修改订单：仍是该订单供应商有报价的商品 */
    const sup = supplierOf(pickCtx.supplierId);
    const pool = Object.keys(sup.quotes).length
      ? Object.keys(sup.quotes).map(pc => SKUS.find(s => s.productCode === pc))
      : SKUS.slice();
    return pool.filter(Boolean);
  }
  /* 向导：只列该档口已绑定供应商且有报价的在售 SKU（未绑定的不显示） */
  return orderPool().slice();
};

/* 已生效的查询条件（输入框 / 下拉只是 draft，点「查询」才生效） */
const pickApplied = () => pick.applied;

function pickSkuList() {
  const ap = pickApplied();
  const kw = (ap.kw || '').trim().toLowerCase();
  return pickPool().filter(sk => {
    if (!sk) return false;
    if (ap.catSel.length) {
      const p = catPathOf(sk);
      if (!ap.catSel.every((n, i) => p[i] === n)) return false;
    }
    if (ap.form !== 'all' && sk.form !== ap.form) return false;
    if (!kw) return true;
    return sk.productName.toLowerCase().includes(kw) || (sk.py || '').includes(kw);
  });
}

function openAddSku(ctx) {
  pickCtx = (ctx && ctx.items && ctx.day) ? ctx : null;   /* 只接受「修改订单」上下文，忽略事件对象 */
  const sup = pickCtx ? supplierOf(pickCtx.supplierId) : null;
  if (!pickCtx) {
    const dates = demandDates();
    if (!wiz.activeDate || !dates.includes(wiz.activeDate)) wiz.activeDate = dates[0] || '';
  }
  const day = pickDay();
  pick = { kw: '', catSel: [], form: 'all', qty: {}, note: {}, openSelected: false, catOpen: false, fuzzyIdx: -1, fuzzyOpen: false,
    applied: { kw: '', catSel: [], form: 'all' } };
  drawer(pickCtx ? '添加商品' : `添加商品 · ${md(day)} 周${WEEK[parseISO(day).getDay()]}`,
    `${pickCtx ? sup.name + " · 单价取该供应商预报价" : "商品与单价取自「供货关系管理」：只列已绑定供应商且有报价的商品"}；已添加的商品会回显${pickCtx ? '下单量' : '采购量'}与备注并锁定输入`,
    `<div class="po-pick-bar">
      <span class="po-pick-kw-wrap">
        <input class="po-input po-pick-kw" id="poPickKw" placeholder="搜索商品名称或拼音首字母（如 黄瓜 / hg / xhg），↑↓ 选择、回车快速添加">
        <div class="po-pick-fuzzy" id="poPickFuzzy" role="listbox" aria-label="模糊搜索结果" hidden></div>
      </span>
      <span class="po-cat-wrap">
        <button type="button" class="po-cat-btn" id="poPickCatBtn"><span id="poPickCatLabel">请选择商品分类</span><i>▾</i></button>
        <div class="po-cat-pop" id="poCatPop" hidden></div>
      </span>
      <select class="po-select" id="poPickForm">
        <option value="all">全部形态</option>
        ${SUPPLY_FORMS.map(f => `<option value="${f}">${f}</option>`).join('')}
      </select>
      <button class="po-btn po-btn-sm po-btn-primary" id="poPickSearch">查询</button>
      <button class="po-btn po-btn-sm" id="poPickReset">重置</button>
      <span class="po-sub" id="poPickCnt"></span>
    </div>
    <div id="poPickSelected" class="po-pick-selected" hidden></div>
    <div id="poPickList" class="po-pick-list"></div>`,
    `<button class="po-btn" id="poPickToggle">已选 0 种商品</button><button class="po-btn po-btn-primary" data-pick-done>完成</button>`, true);
  /* 输入 / 下拉 / 分类选择只更新草稿条件，必须点「查询」才真正过滤 */
  $('#poPickKw').addEventListener('input', e => {
    pick.kw = e.target.value;
    pick.fuzzyOpen = true;                             /* 只要在输入就展开浮框 */
    pick.fuzzyIdx = pickFuzzyList().length ? 0 : -1;    /* 默认高亮第 1 条，回车即添加 */
    syncSearchBtn();
    renderPickFuzzy();
  });
  /* V4.12：浮框收起后再点（或聚焦）输入框，若仍有内容则重新展开 */
  const reopenFuzzy = () => {
    if (!(pick.kw || '').trim()) return;
    pick.fuzzyOpen = true;
    if (pick.fuzzyIdx < 0) pick.fuzzyIdx = 0;
    renderPickFuzzy();
  };
  $('#poPickKw').addEventListener('focus', reopenFuzzy);
  $('#poPickKw').addEventListener('click', reopenFuzzy);
  /* V4.12：点浮框与输入框以外的区域 → 只收浮框，输入内容保留 */
  document.addEventListener('mousedown', e => {
    const box = $('#poPickFuzzy'), inp = $('#poPickKw');
    if (!box || box.hidden) return;
    if (box.contains(e.target) || (inp && inp.contains(e.target))) return;
    pick.fuzzyOpen = false;
    renderPickFuzzy();
  }, true);
  /* V4.11 键盘快速添加：↑↓ 移动高亮，回车添加当前高亮；浮框收起时回车仍是「查询」 */
  $('#poPickKw').addEventListener('keydown', e => {
    if (e.isComposing) return;                          /* 中文输入法上屏中的回车不触发 */
    const box = $('#poPickFuzzy');
    const open = !!(box && !box.hidden);
    const list = pickFuzzyList();
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!open || !list.length) return;
      e.preventDefault();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      pick.fuzzyIdx = (pick.fuzzyIdx + step + list.length) % list.length;
      renderPickFuzzy();
      const on = $('#poPickFuzzy .po-pick-fuzzy-row.is-on');
      if (on && on.scrollIntoView) on.scrollIntoView({ block: 'nearest' });
      return;
    }
    if (e.key === 'Escape') {
      if (!open) return;
      e.preventDefault();
      pick.fuzzyOpen = false;          /* V4.12：只收起浮框，输入内容保留，再点输入框可重新展开 */
      renderPickFuzzy();
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (open && list.length && pick.fuzzyIdx >= 0) { pickFuzzyAdd(list[pick.fuzzyIdx].code); return; }
      applyPickSearch();
    }
  });
  $('#poPickCatBtn').addEventListener('click', () => { pick.catOpen = !pick.catOpen; renderCatPop(); });
  /* 点面板外收起 */
  document.addEventListener('click', e => {
    const pop = $('#poCatPop'), btn = $('#poPickCatBtn');
    if (!pop || pop.hidden) return;
    if (pop.contains(e.target) || (btn && btn.contains(e.target))) return;
    pick.catOpen = false; renderCatPop();
  }, true);
  $('#poPickForm').addEventListener('change', e => { pick.form = e.target.value; syncSearchBtn(); });
  /* 查询：把草稿条件落成生效条件后重查 */
  $('#poPickSearch').addEventListener('click', () => applyPickSearch());
  /* 重置：清空关键词与全部筛选项 */
  $('#poPickReset').addEventListener('click', () => {
    pick.kw = ''; pick.catSel = []; pick.form = 'all'; pick.catOpen = false;
    pick.applied = { kw: '', catSel: [], form: 'all' };
    const kw = $('#poPickKw'), form = $('#poPickForm');
    if (kw) kw.value = '';
    if (form) form.value = 'all';
    renderCatPop();
    syncSearchBtn();
    renderPick();
    if (kw) kw.focus();
  });
  $('#poPickToggle').addEventListener('click', () => { pick.openSelected = !pick.openSelected; renderPick(); });
  const done = $('[data-pick-done]');
  if (done) done.addEventListener('click', () => {
    const ctx = pickCtx;
    pickCtx = null;
    closeDrawer();
    if (ctx) syncEditItemsFromCtx(ctx); else renderWizard();
  });
  renderCatPop();
  syncSearchBtn();
  renderPick();
  const kwBox = $('#poPickKw');
  if (kwBox) kwBox.focus();
}

/* 三级分类选择器：一级 → 二级 → 三级逐列展开，任一层都可选中（选中即按该层过滤） */
function renderCatPop() {
  const pop = $('#poCatPop'), label = $('#poPickCatLabel');
  if (label) label.textContent = pick.catSel.length ? pick.catSel.join(' / ') : '请选择商品分类';
  if (!pop) return;
  pop.hidden = !pick.catOpen;
  if (!pick.catOpen) return;

  const poolCodes = new Set(pickPool().map(k => k.code));
  const built = catPopHtml(pick.catSel, poolCodes);
  const visible = built.visible;
  pop.innerHTML = built.html;

  $$('[data-cat-name]', pop).forEach(b => b.addEventListener('click', () => {
    const depth = Number(b.getAttribute('data-cat-depth'));
    const name = b.getAttribute('data-cat-name');
    pick.catSel = pick.catSel.slice(0, depth).concat([name]);
    const node = findCatNode(pick.catSel);
    if (!node || !visible(node.children).length) pick.catOpen = false;   /* 无可用下级 → 选中并收起 */
    renderCatPop();
    syncSearchBtn();
  }));
  const clear = $('[data-cat-clear]', pop);
  if (clear) clear.addEventListener('click', () => {
    pick.catSel = []; pick.catOpen = false;
    renderCatPop(); syncSearchBtn();
  });
}

/* 点「查询」或回车：草稿条件生效 */
function applyPickSearch() {
  pick.applied = { kw: pick.kw || '', catSel: (pick.catSel || []).slice(), form: pick.form || 'all' };
  pick.catOpen = false;
  renderCatPop();
  syncSearchBtn();
  renderPick();
}

/* 草稿与已生效条件不一致时，给「查询」按钮加提示圈 */
function syncSearchBtn() {
  const btn = $('#poPickSearch');
  if (!btn) return;
  const ap = pick.applied || { kw: '', catSel: [], form: 'all' };
  const dirty = (pick.kw || '') !== ap.kw
    || (pick.form || 'all') !== ap.form
    || JSON.stringify(pick.catSel || []) !== JSON.stringify(ap.catSel || []);
  btn.classList.toggle('po-btn-dirty', dirty);
  btn.title = dirty ? '筛选条件已改，点「查询」生效' : '';
}

function renderPick() {
  const day = pickDay();
  const list = pickSkuList();
  const rows = list.map(sk => {
    const added = pickAddedItem(sk.code);
    const qty = added
      ? (num(added.daily[day]) > 0 ? trimQty(added.daily[day]) : '')
      : (pick.qty[sk.code] == null ? '' : pick.qty[sk.code]);
    const note = added ? ((added.note && added.note[day]) || '') : (pick.note[sk.code] || '');
    return `<tr${added ? ' class="po-pick-row-on"' : ''}>
      <td>${thumbHtml(sk.productName, SKUS.indexOf(sk))}</td>
      <td>${esc(sk.productName)}</td>
      <td>${esc(sk.unit)}</td>
      <td class="po-sub">${esc(sk.spec)}</td>
      <td>${esc(sk.brand || '—')}</td>
      <td class="po-money">${money(pickUnitPrice(sk.code))}</td>
      <td><span class="po-tag">${esc(sk.form)}</span></td>
      <td><input class="po-qty" type="number" min="0" step="0.01" data-pick-qty="${sk.code}" value="${qty}" placeholder="—"${added ? ' disabled' : ''}></td>
      <td><input class="po-input po-note-input" data-pick-note="${sk.code}" value="${esc(note)}" placeholder="选填"${added ? ' disabled' : ''}></td>
      <td class="po-pick-act">${added
        ? `<span class="po-tag po-tag-ok">已添加</span><button class="po-link-btn" data-unpick-sku="${sk.code}">取消</button>`
        : `<button class="po-btn po-btn-xs" data-add-sku="${sk.code}">添加</button>`}</td>
    </tr>`;
  }).join('');

  const box = $('#poPickList');
  if (!box) return;
  box.innerHTML = rows
    ? `<div class="po-table-wrap"><table class="po-table po-pick-table">
        <thead><tr><th>图片</th><th>名称</th><th>单位</th><th>规格</th><th>品牌</th><th class="po-money">单价</th><th>形态</th><th>采购量</th><th>备注</th><th></th></tr></thead>
        <tbody>${rows}</tbody></table></div>`
    : '<div class="po-empty">没有匹配的商品，换个关键词或分类再试</div>';

  const cnt = $('#poPickCnt');
  if (cnt) cnt.textContent = `共 ${list.length} 个可采商品`;

  /* 已选面板（右下角「已选 N 种商品」展开） */
  const selected = pickItems().filter(it => it.daily[day] !== undefined);
  renderPickFuzzy();
  const selBox = $('#poPickSelected');
  if (selBox) {
    selBox.hidden = !pick.openSelected;
    selBox.innerHTML = pick.openSelected
      ? `<div class="po-pick-sel-head"><b>${md(day)} 已选 ${selected.length} 种商品</b><span class="po-sub">在这里取消添加会同步到外层当日商品列表</span></div>
         ${selected.length ? `<div class="po-table-wrap"><table class="po-table po-pick-table">
            <thead><tr><th>图片</th><th>名称</th><th>单位</th><th>规格</th><th>品牌</th><th class="po-money">单价</th><th>采购量</th><th>备注</th><th></th></tr></thead>
            <tbody>${selected.map(it => {
              const sk = SKU[it.skuCode];
              return `<tr>
                <td>${thumbHtml(sk.productName, SKUS.indexOf(sk))}</td>
                <td>${esc(sk.productName)}</td>
                <td>${esc(sk.unit)}</td>
                <td class="po-sub">${esc(sk.spec)}</td>
                <td>${esc(sk.brand || '—')}</td>
                <td class="po-money">${money(it.price)}</td>
                <td>${num(it.daily[day]) > 0 ? trimQty(it.daily[day]) : '<span class="po-tag po-tag-warn">未填量</span>'}</td>
                <td class="po-sub">${esc((it.note && it.note[day]) || '—')}</td>
                <td><button class="po-btn po-btn-xs po-btn-ghost" data-unpick-sku="${it.skuCode}">取消添加</button></td>
              </tr>`;
            }).join('')}</tbody></table></div>`
          : '<div class="po-empty">这一天还没有添加商品</div>'}`
      : '';
  }
  const toggle = $('#poPickToggle');
  if (toggle) toggle.textContent = `已选 ${selected.length} 种商品 ${pick.openSelected ? '▾' : '▸'}`;

  $$('#poPickList [data-pick-qty]').forEach(inp => inp.addEventListener('input', e => {
    pick.qty[e.target.getAttribute('data-pick-qty')] = e.target.value;
  }));
  $$('#poPickList [data-pick-note]').forEach(inp => inp.addEventListener('input', e => {
    pick.note[e.target.getAttribute('data-pick-note')] = e.target.value;
  }));
  /* V4.13：填了采购量后离开该行 → 自动添加（等同点「添加」）；同一行内从采购量移到备注不算离开，
     没填任何内容则不添加。键盘：在采购量/备注里按回车也直接添加 */
  const rowLeave = e => {
    const code = e.target.getAttribute('data-pick-qty') || e.target.getAttribute('data-pick-note');
    if (!code) return;
    const rt = e.relatedTarget;
    const tr = e.target.closest('tr');
    if (rt && rt.closest && tr && rt.closest('tr') === tr) return;   /* 还在本行（采购量 ↔ 备注） */
    setTimeout(() => autoAddPickRow(code), 0);                        /* 让「添加」按钮的点击先跑完 */
  };
  $$('#poPickList [data-pick-qty], #poPickList [data-pick-note]').forEach(inp => {
    inp.addEventListener('focusout', rowLeave);
    inp.addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      autoAddPickRow(inp.getAttribute('data-pick-qty') || inp.getAttribute('data-pick-note'));
    });
  });
  $$('#poPickList [data-add-sku]').forEach(b => b.addEventListener('click', () => onPickAdd(b.getAttribute('data-add-sku'))));
  $$('.mp-drawer [data-unpick-sku]').forEach(b => b.addEventListener('click', () => onPickCancel(b.getAttribute('data-unpick-sku'))));
}

/* V4.11 模糊浮框：只匹配「商品名称 + 拼音首字母」，与「查询」按钮口径一致 */
function pickFuzzyList() {
  const kw = (pick.kw || '').trim().toLowerCase();
  if (!kw) return [];
  return pickPool().filter(sk => sk && (sk.productName.toLowerCase().includes(kw) || (sk.py || '').includes(kw))).slice(0, 8);
}

function renderPickFuzzy() {
  const box = $('#poPickFuzzy');
  if (!box) return;
  const kw = (pick.kw || '').trim();
  if (!kw || !pick.fuzzyOpen) { box.hidden = true; box.innerHTML = ''; return; }
  const list = pickFuzzyList();
  box.hidden = false;
  if (!list.length) {
    pick.fuzzyIdx = -1;
    box.innerHTML = '<div class="po-pick-fuzzy-empty">没有匹配的商品，可直接点「查询」在列表里筛选</div>';
    return;
  }
  if (pick.fuzzyIdx >= list.length) pick.fuzzyIdx = list.length - 1;
  box.innerHTML = list.map((sk, i) => {
    const added = !!pickAddedItem(sk.code);
    return `<div class="po-pick-fuzzy-row${i === pick.fuzzyIdx ? ' is-on' : ''}${added ? ' is-added' : ''}"
        role="option" aria-selected="${i === pick.fuzzyIdx}" data-fuzzy-sku="${sk.code}">
      <span class="po-pick-fuzzy-name">${esc(sk.productName)}</span>
      <span class="po-pick-fuzzy-meta">${esc(sk.unit)} · ${esc(sk.spec)} · ${esc(sk.brand || '—')}</span>
      <span class="po-pick-fuzzy-price">${money(pickUnitPrice(sk.code))}</span>
      ${added ? '<span class="po-tag po-tag-ok">已添加</span>' : ''}
    </div>`;
  }).join('');
  $$('[data-fuzzy-sku]', box).forEach(row => {
    row.addEventListener('mousedown', e => { e.preventDefault(); pickFuzzyAdd(row.getAttribute('data-fuzzy-sku')); });
    row.addEventListener('mousemove', () => {
      const i = [...box.querySelectorAll('[data-fuzzy-sku]')].indexOf(row);
      if (i >= 0 && i !== pick.fuzzyIdx) { pick.fuzzyIdx = i; renderPickFuzzy(); }
    });
  });
}

/* 回车 / 点击浮框项：已添加 → 只提示；未添加 → 走 onPickAdd（采购量与备注取表格该行已填值） */
function pickFuzzyAdd(code) {
  if (pickAddedItem(code)) { toast('该商品已添加，请勿重复添加'); return; }
  onPickAdd(code, true);
  pick.kw = '';
  pick.fuzzyIdx = -1;
  pick.fuzzyOpen = false;
  const inp = $('#poPickKw');
  if (inp) { inp.value = ''; inp.focus(); }
  syncSearchBtn();
  renderPickFuzzy();
  toast('商品添加成功');
}

/* V4.13：填完采购量离开该行即自动添加；没填量 / 已加过则不动作 */
function autoAddPickRow(code) {
  if (!code) return;
  if (!$('#poPickList')) return;                        /* 抽屉已关，忽略 */
  if (pickAddedItem(code)) return;                      /* 已加过（含刚被「添加」按钮加过）→ 不重复 */
  const qty = num(pick.qty[code]);
  if (!(qty > 0)) return;                               /* 没输入任何内容 → 不自动添加 */
  onPickAdd(code, true);                                /* 采购量与备注都取该行已填值 */
  toast('商品添加成功');
}

function onPickAdd(code, quiet) {
  const day = pickDay();
  const sk = SKU[code];
  const qty = num(pick.qty[code]);
  const note = (pick.note[code] || '').trim();
  let it = pickItems().find(x => x.skuCode === code);
  if (!it) {
    it = { skuCode: code, productName: sk.productName, price: pickUnitPrice(code), daily: {}, note: {} };
    pickItems().push(it);
  }
  if (!it.note) it.note = {};
  it.daily[day] = qty;
  it.note[day] = note;
  delete pick.qty[code];
  delete pick.note[code];
  if (!quiet) toast(`已添加 ${sk.productName}${qty > 0 ? ` ${trimQty(qty)}${sk.unit}` : ''}（${md(day)}）`);
  renderPick();
}

function onPickCancel(code) {
  const day = pickDay();
  const it = pickItems().find(x => x.skuCode === code);
  if (!it) return;
  delete it.daily[day];
  if (it.note) delete it.note[day];
  if (!Object.keys(it.daily).length) {
    const rest = pickItems().filter(x => x.skuCode !== code);
    if (pickCtx) pickCtx.items = rest; else wiz.items = rest;
  }
  toast(`已取消添加 ${SKU[code].productName}（${md(day)}）`);
  renderPick();
}

function submitDirect() {
  const contact = (wiz.receiver.contact || '').trim();
  const phone = (wiz.receiver.phone || '').trim();
  const addr = $('#wizRcAddr').value.trim();
  if (!contact) { toast('请选择收货联系人（门店后厨人员）'); return; }
  if (!addr) { toast('请填写收货地址'); return; }
  const dates = upcomingDates();
  if (!dates.length) { toast('所选区间内没有填写任何数量'); return; }
  const st = syncStall();
  wiz.receiver = { contact, phone, addr };
  /* V4.2：按（送达日期 × 供应商）拆单——一张订单仍只有 1 家供应商 */
  const groups = wizGroups();
  if (!groups.length) { toast('所选区间内没有填写任何数量'); return; }
  const supCnt = new Set(groups.map(g => g.supId)).size;
  /* V4.9：提交前二次确认；点「我再看看」停留在第 3 步，不生成订单 */
  poConfirm({
    title: '提交下单',
    text: '是否确认提交该次采购？',
    okText: '确认',
    cancelText: '我再看看',
    onOk: () => doSubmitDirect(groups, dates.length, supCnt)
  });
}

/* 真正落地：生成订单 → 回到订单列表（新订单按创建时间排在最前，同一供应商相邻） */
function doSubmitDirect(groups, dateCnt, supCnt) {
  const st = syncStall();
  const created = groups.map(g => {
    const items = g.items.map(({ it, qty }) =>
      mkItem(g.supId, it.skuCode, qty, num(it.price), { lineNote: (it.note && it.daily[g.date] !== undefined ? it.note[g.date] : '') || '' }));
    return mkOrder({
      supplierId: g.supId, supplierName: g.supName,
      source: 'direct', sourceNo: '', stallId: st.id, stallName: st.name,
      deliveryDate: g.date, status: 'wait', createdAt: nowStr(), createdBy: '张采购',
      receiver: wiz.receiver,
      ship: { contact: supNamePart(g.supId), phone: supPhonePart(g.supId) }
    }, items);
  });
  wiz = null;
  /* 回到列表并放开筛选，保证刚生成的订单一定可见 */
  const days = created.map(o => o.deliveryDate).slice().sort();
  if (days[0] < listFilter.from) listFilter.from = days[0];
  if (days[days.length - 1] > listFilter.to) listFilter.to = days[days.length - 1];
  listFilter.source = 'all'; listFilter.supplier = 'all'; listFilter.keyword = '';
  listFilter.status = 'all'; listFilter.aftersale = 'all';
  showList();
  toast(`已生成 ${created.length} 张订单（${dateCnt} 个送达日期 × ${supCnt} 家供应商），已按创建时间排在列表最前`);
}

/* ============================ 16b. 供货关系管理（新增栏目） ============================ */

/* 【规则】一条供货关系 = 档口 × 商品 SKU × **1 家**供应商（一对一，重复绑定即覆盖）。
   【规则】只有「状态正常」的 SKU 可新增 / 修改绑定；已下架 SKU 保留绑定、默认隐藏，勾选「包含已下架」后灰态只读。
   【规则】可选供应商必须能供应 SKU 的形态（毛菜 / 净菜 / 半成品），按供应商档案 supplyTypes 判定。
   【规则】一键最低价：有勾选就作用于勾选项，未勾选则作用于当前筛选结果；报价相同优先「最近一次采购过」的供应商，
            没有采购史则取供应商 ID 较小者。
   【规则】该商品没有任何供应商报价时不阻断：下拉显示「该商品暂无供应商报价」，仍可保存（记为暂无报价态）。 */

const REL_SOURCE_CN = { manual: '手工选择', lowest: '一键最低价', form: '按形态批量', none: '暂无报价' };  /* 仅数据留痕（bind_source），列表不展示 */

const srFilter = { kw: '', catSel: [], form: 'all', bind: 'all', supplier: 'all', includeOff: false };
let srCatOpen = false;      /* 分类弹层是否展开 */
let srCatDraft = [];      /* 弹层里的草稿选择，点「查询」才生效 */
let srOutsideBound = false;
const srPage = () => page('#supplyRelationPage', 'po-page sr-page');
const srStall = () => syncStall();
const relationOf = skuCode => S.relations.find(r => r.stallId === srStall().id && r.skuCode === skuCode) || null;
const skuStatus = skuCode => (SKU[skuCode] && SKU[skuCode].status) || 'on';
const isOffShelf = skuCode => skuStatus(skuCode) === 'off';
const bindableSuppliers = sku => SUPPLIERS.filter(s => supTypes(s).includes(sku.form));
const quoteOfSupplier = (supId, sku) => {
  const s = supplierOf(supId);
  const p = s.quotes && s.quotes[sku.productCode];
  return p == null ? null : p;
};
const skuHasQuote = sku => SUPPLIERS.some(s => (s.quotes || {})[sku.productCode] != null);

/* 最近一次采购：该档口该 SKU 的最近一张订单（按创建时间倒序，所有状态都算） */
function lastPurchaseOf(skuCode) {
  const st = srStall();
  const hits = S.orders.filter(o => o.stallId === st.id && (o.items || []).some(i => i.skuCode === skuCode));
  if (!hits.length) return null;
  hits.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : (a.no < b.no ? 1 : -1)));
  const o = hits[0];
  return { no: o.no, date: o.deliveryDate, supplierId: o.supplierId, supplierName: o.supplierName || supplierOf(o.supplierId).name };
}

/* 平局规则：①最近采购过 ②供应商 ID 较小 */
function pickTieSupplier(skuCode, ids) {
  const recent = lastPurchaseOf(skuCode);
  if (recent && ids.includes(recent.supplierId)) return recent.supplierId;
  return ids.slice().sort()[0];
}

/* 最低报价（候选 = 形态匹配 + 有报价） */
function lowestOf(sku) {
  const cands = bindableSuppliers(sku)
    .map(s => ({ supId: s.id, price: quoteOfSupplier(s.id, sku) }))
    .filter(x => x.price != null);
  if (!cands.length) return null;
  const min = Math.min(...cands.map(x => x.price));
  const tie = cands.filter(x => x.price === min).map(x => x.supId);
  return { price: min, tie, supId: pickTieSupplier(sku.code, tie) };
}

function setRelation(skuCode, supplierId, source) {
  const st = srStall();
  const sku = SKU[skuCode];
  let r = S.relations.find(x => x.stallId === st.id && x.skuCode === skuCode);
  if (!r) {
    r = { stallId: st.id, skuCode, productCode: sku.productCode, supplierId: '', source: 'manual', priceSnapshot: null, noQuote: false, updatedAt: '', updatedBy: '' };
    S.relations.push(r);
  }
  r.supplierId = supplierId || '';
  r.source = source || (supplierId ? 'manual' : 'none');
  r.priceSnapshot = supplierId ? quoteOfSupplier(supplierId, sku) : null;
  r.noQuote = !supplierId;
  r.updatedAt = nowStr();
  r.updatedBy = '张采购';
  return r;
}
function unbindRelation(skuCode) {
  const st = srStall();
  const i = S.relations.findIndex(x => x.stallId === st.id && x.skuCode === skuCode);
  if (i >= 0) S.relations.splice(i, 1);
}

/* ===== 列表口径 ===== */
const srAllSkus = () => SKUS.filter(sk => srFilter.includeOff || !isOffShelf(sk.code));
function srFilteredSkus() {
  const kw = (srFilter.kw || '').trim().toLowerCase();
  return srAllSkus().filter(sk => {
    if (srFilter.form !== 'all' && sk.form !== srFilter.form) return false;
    const catCodes = catSelCodes(srFilter.catSel);
    if (catCodes && !catCodes.has(sk.code)) return false;
    if (kw && !`${sk.name} ${sk.code} ${sk.productName}`.toLowerCase().includes(kw)) return false;
    const r = relationOf(sk.code);
    const bound = !!(r && r.supplierId);
    const noQuote = !!(r && !r.supplierId);
    if (srFilter.bind === 'bound' && !bound) return false;
    if (srFilter.bind === 'noquote' && !noQuote) return false;
    if (srFilter.bind === 'unbound' && (bound || noQuote)) return false;
    if (srFilter.supplier !== 'all' && (!r || r.supplierId !== srFilter.supplier)) return false;
    return true;
  });
}
/* 批量作用范围：勾选优先，未勾选则当前筛选结果 */
/* 批量操作的作用范围 = 全部在售商品（不受筛选影响，已下架不参与） */
const srTargets = () => SKUS.filter(sk => !isOffShelf(sk.code));

/* ===== 页面 ===== */
function showSupplyRelation() {
  hideAll($('#srNav'));
  breadcrumb('供货关系管理');
  const p = srPage();
  p.hidden = false;
  renderSupply();
}

function srRowHtml(sk) {
  const r = relationOf(sk.code);
  const off = isOffShelf(sk.code);
  const bound = !!(r && r.supplierId);
  const low = lowestOf(sk);
  const last = lastPurchaseOf(sk.code);
  const supName = bound ? supplierOf(r.supplierId).name : '';
  const supPrice = bound ? (r.priceSnapshot == null ? '<span class="sr-na">该供应商无此商品报价</span>' : money(r.priceSnapshot)) : '';
  const stateTag = off ? '<span class="po-tag po-tag-off">已下架</span>'
    : bound ? '<span class="po-tag po-t-done">已绑定</span>'
    : (r && r.noQuote) ? '<span class="po-tag po-t-wait">暂无报价</span>'
    : '<span class="po-tag po-t-receive">未绑定</span>';
  const supCell = bound
    ? `<b>${esc(supName)}</b>${supPrice ? `<div class="po-sub">报价 ${supPrice}</div>` : ''}`
    : (r && r.noQuote ? '<span class="sr-na">该商品暂无供应商报价</span>' : '<span class="sr-na">未绑定</span>');
  const lowCell = low
    ? `<span class="sr-low">${money(low.price)}</span><div class="po-sub">${esc(supplierOf(low.supId).name)}${low.tie.length > 1 ? ' · 同价' : ''}</div>`
    : '<span class="sr-na">暂无报价</span>';
  const lastCell = last
    ? `${md(last.date)}<div class="po-sub">${esc(last.supplierName)}</div>`
    : '<span class="sr-na">—</span>';
  const ops = off
    ? '<span class="sr-na">只读</span>'
    : `<button class="po-btn po-btn-xs" data-sr-bind="${sk.code}">${bound ? '改绑' : '选择供应商'}</button>
       ${bound ? `<button class="po-btn po-btn-xs po-btn-ghost" data-sr-unbind="${sk.code}">解绑</button>` : ''}`;
  return `<tr class="${off ? 'sr-row-off' : ''}" data-sr-row="${sk.code}">
    <td>${thumbHtml(sk.productName, SKUS.indexOf(sk))}</td>
    <td><b>${esc(sk.productName)}</b><div class="po-sub">${esc(sk.name)}</div></td>
    <td>${esc(sk.code)}</td>
    <td>${esc(sk.unit)}</td>
    <td>${esc(sk.spec)}</td>
    <td><span class="po-tag po-t-plain">${esc(sk.form)}</span></td>
    <td>${esc(catPathOf(sk).join('/'))}</td>
    <td>${supCell}</td>
    <td>${lowCell}</td>
    <td>${lastCell}</td>
    <td>${stateTag}</td>
    <td><div class="po-line-ops">${ops}</div></td>
  </tr>`;
}

function renderSupply() {
  const st = srStall();
  const all = srAllSkus();
  const boundCnt = all.filter(sk => { const r = relationOf(sk.code); return r && r.supplierId; }).length;
  const unboundCnt = all.filter(sk => !relationOf(sk.code)).length;
  const noQuoteSkuCnt = all.filter(sk => !skuHasQuote(sk)).length;
  const supOpts = SUPPLIERS.map(s => `<option value="${esc(s.id)}" ${srFilter.supplier === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('');
  const rows = srFilteredSkus();

  srPage().innerHTML = `
  <div class="po-head">
    <div><h2>供货关系管理</h2></div>
    <div class="po-head-actions">
      <span class="po-sub">按档口把商品 SKU 绑定到 1 家供应商；下架商品不清除绑定</span>
    </div>
  </div>

  <div class="po-stats">
    <div class="po-stat"><span class="po-stat-t">可绑定 SKU 数</span><b>${all.length}</b></div>
    <div class="po-stat"><span class="po-stat-t">已绑定</span><b>${boundCnt}</b></div>
    <div class="po-stat"><span class="po-stat-t">未绑定</span><b>${unboundCnt}</b></div>
    <div class="po-stat"><span class="po-stat-t">无供应商报价 SKU 数</span><b>${noQuoteSkuCnt}</b></div>
  </div>

  <div class="po-filters">
    <input class="po-input po-kw" id="srKw" placeholder="商品名称 / SKU 编码" value="${esc(srFilter.kw)}">
    <span class="po-cat-wrap">
      <button type="button" class="po-cat-btn" id="srCatBtn"><span id="srCatLabel">${srFilter.catSel.length ? esc(srFilter.catSel.join(' / ')) : '请选择商品分类'}</span><i>▾</i></button>
      <div class="po-cat-pop" id="srCatPop" hidden></div>
    </span>
    <label>形态
      <select class="po-select" id="srFormSel">
        <option value="all">全部形态</option>
        ${SUPPLY_FORMS.map(f => `<option value="${f}" ${srFilter.form === f ? 'selected' : ''}>${f}</option>`).join('')}
      </select>
    </label>
    <label>绑定状态
      <select class="po-select" id="srBindSel">
        <option value="all" ${srFilter.bind === 'all' ? 'selected' : ''}>全部</option>
        <option value="bound" ${srFilter.bind === 'bound' ? 'selected' : ''}>已绑定</option>
        <option value="unbound" ${srFilter.bind === 'unbound' ? 'selected' : ''}>未绑定</option>
        <option value="noquote" ${srFilter.bind === 'noquote' ? 'selected' : ''}>暂无报价</option>
      </select>
    </label>
    <label>供应商
      <select class="po-select" id="srSupSel"><option value="all">全部供应商</option>${supOpts}</select>
    </label>
    <label class="sr-inline-check"><input type="checkbox" id="srIncludeOff" ${srFilter.includeOff ? 'checked' : ''}>包含已下架</label>
    <button class="po-btn po-btn-primary" id="srSearchBtn">查询</button>
    <button class="po-btn" id="srResetFilter">重置</button>
  </div>

  <div class="sr-batch-bar">
    <button class="po-btn po-btn-sm po-btn-primary" id="srBatchLowest">一键选择报价最低供应商</button>
    <button class="po-btn po-btn-sm" id="srBatchForm">按形态批量绑定</button>
    <button class="po-btn po-btn-sm po-btn-ghost" id="srBatchUnbind">一键清除供应商</button>
  </div>

  <div class="po-card po-section">
    ${rows.length ? `<div class="po-table-wrap"><table class="po-table sr-table">
      <thead><tr>
        <th>图片</th><th>商品名称</th><th>SKU 编码</th><th>单位</th><th>规格</th><th>形态</th><th>商品分类</th>
        <th>当前供应商</th><th>最低报价</th><th>最近采购</th><th>绑定状态</th><th>操作</th>
      </tr></thead>
      <tbody>${rows.map(srRowHtml).join('')}</tbody>
    </table></div>`
    : `<div class="po-empty">${all.length ? '没有符合条件的商品，试试放宽筛选条件' : '当前档口没有状态正常的商品 SKU'}</div>`}
  </div>`;

  bindSupply();
  mountPoScope(srPage());
  renderSrCatPop();
}

/* 供货关系筛选：商品分类三级弹层（与添加商品抽屉同一套交互） */
function renderSrCatPop() {
  const pop = $('#srCatPop'), label = $('#srCatLabel');
  if (label) label.textContent = srCatDraft.length ? srCatDraft.join(' / ') : '请选择商品分类';
  if (!pop) return;
  pop.hidden = !srCatOpen;
  if (!srCatOpen) return;
  const pool = new Set(srAllSkus().map(sk => sk.code));
  const built = catPopHtml(srCatDraft, pool);
  pop.innerHTML = built.html;
  $$('[data-cat-name]', pop).forEach(b => b.addEventListener('click', ev => {
    ev.stopPropagation();
    const depth = Number(b.getAttribute('data-cat-depth'));
    const name = b.getAttribute('data-cat-name');
    srCatDraft = srCatDraft.slice(0, depth).concat([name]);
    const node = findCatNode(srCatDraft);
    if (!node || !built.visible(node.children).length) srCatOpen = false;   /* 无可用下级 → 选中并收起 */
    renderSrCatPop();
  }));
  const clear = $('[data-cat-clear]', pop);
  if (clear) clear.addEventListener('click', ev => { ev.stopPropagation(); srCatDraft = []; srCatOpen = false; renderSrCatPop(); });
}

function bindSupply() {
  const p = srPage();
  const on = (id, ev, fn) => { const n = $('#' + id, p); if (n) n.addEventListener(ev, fn); };
  on('srSearchBtn', 'click', () => {
    srFilter.kw = $('#srKw', p).value.trim();
    srFilter.catSel = srCatDraft.slice();
    srCatOpen = false;
    srFilter.form = $('#srFormSel', p).value;
    srFilter.bind = $('#srBindSel', p).value;
    srFilter.supplier = $('#srSupSel', p).value;
    srFilter.includeOff = $('#srIncludeOff', p).checked;
    renderSupply();
  });
  on('srKw', 'keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $('#srSearchBtn', p).click(); } });
  on('srResetFilter', 'click', () => {
    srFilter.kw = ''; srFilter.catSel = []; srCatDraft = []; srFilter.form = 'all'; srFilter.bind = 'all'; srFilter.supplier = 'all'; srFilter.includeOff = false; srCatOpen = false;
    renderSupply();
  });
  on('srIncludeOff', 'change', () => { srFilter.includeOff = $('#srIncludeOff', p).checked; renderSupply(); });
  on('srCatBtn', 'click', e => { e.stopPropagation(); srCatOpen = !srCatOpen; renderSrCatPop(); });
  if (!srOutsideBound) {
    srOutsideBound = true;
    document.addEventListener('click', ev => {
      const pop = document.getElementById('srCatPop'), btn = document.getElementById('srCatBtn');
      if (!pop || pop.hidden) return;
      if (pop.contains(ev.target) || (btn && btn.contains(ev.target))) return;
      srCatOpen = false; renderSrCatPop();
    }, true);
  }
  on('srBatchLowest', 'click', () => confirmBatchLowest());
  on('srBatchForm', 'click', () => openFormBatch());
  on('srBatchUnbind', 'click', () => confirmBatchUnbind());
  $$('[data-sr-bind]', p).forEach(b => b.addEventListener('click', () => openBindDrawer(b.getAttribute('data-sr-bind'))));
  $$('[data-sr-unbind]', p).forEach(b => b.addEventListener('click', () => {
    const code = b.getAttribute('data-sr-unbind');
    unbindRelation(code);
    renderSupply();
    toast(`已解绑「${SKU[code].productName}」的供应商`);
  }));
}

/* ===== 单个绑定抽屉 ===== */
function openBindDrawer(skuCode) {
  const sku = SKU[skuCode];
  if (!sku) return;
  const r = relationOf(skuCode);
  const cur = r ? r.supplierId : '';
  const last = lastPurchaseOf(skuCode);
  const cands = bindableSuppliers(sku);
  const anyQuote = cands.some(s => quoteOfSupplier(s.id, sku) != null);
  let picked = cur || (anyQuote ? '' : '__none__');

  const body = () => {
    const infos = [
      ['商品名称', esc(sku.productName) + `<div class="po-sub">${esc(sku.name)}</div>`],
      ['SKU 编码', esc(sku.code)],
      ['形态', `<span class="po-tag po-t-plain">${esc(sku.form)}</span>`],
      ['规格 / 单位', `${esc(sku.spec)} / ${esc(sku.unit)}`],
      ['商品分类', esc(catPathOf(sku).join(' / '))],
      ['最近一次采购', last ? `${md(last.date)} · ${esc(last.supplierName)}` : '<span class="sr-na">—</span>']
    ];
    return `<div class="po-kv-grid sr-bind-info">${infos.map(([k, v]) => `<div><label>${k}</label><span>${v}</span></div>`).join('')}</div>`;
  };

  const options = () => {
    if (!anyQuote) {
      return `<div class="sr-noquote">该商品暂无供应商报价</div>
        <table class="po-table sr-pick-table"><tbody>
          <tr class="sr-pick-row is-picked" data-sr-pick="__none__">
            <td class="sr-pick-radio"><input type="radio" name="srPick" ${picked === '__none__' ? 'checked' : ''}></td>
            <td><b>该商品暂无供应商报价</b><div class="po-sub">仍可保存，保存后该商品记为「暂无报价」，等供应商报价后再改绑</div></td>
          </tr>
        </tbody></table>`;
    }
    return `<table class="po-table sr-pick-table">
      <thead><tr><th></th><th>供应商</th><th>供应类型</th><th>该商品报价</th><th>最近采购</th></tr></thead>
      <tbody>${cands.map(s => {
        const price = quoteOfSupplier(s.id, sku);
        const isLast = last && last.supplierId === s.id;
        /* V4.16：该供应商无此商品报价 → 单选锁定不可选 */
        return `<tr class="sr-pick-row ${picked === s.id ? 'is-picked' : ''}" data-sr-pick="${esc(s.id)}">
          <td class="sr-pick-radio"><input type="radio" name="srPick" ${picked === s.id ? 'checked' : ''}${price == null ? ' disabled' : ''}></td>
          <td><b>${esc(s.name)}</b><div class="po-sub">${esc(s.contact || '')}</div></td>
          <td>${supTypes(s).map(t => `<span class="po-tag po-t-plain">${esc(t)}</span>`).join(' ')}</td>
          <td>${price == null ? '<span class="sr-na">该供应商无此商品报价</span>' : money(price)}</td>
          <td>${isLast ? '<span class="po-tag po-t-done">最近采购</span>' : '<span class="sr-na">—</span>'}</td>
        </tr>`;
      }).join('')}</tbody>
    </table>
    <div class="po-sub sr-pick-tip">只列出能供应「${esc(sku.form)}」的供应商；报价相同时「一键最低价」会优先最近采购过的供应商。</div>`;
  };

  drawer('选择供应商', `${esc(sku.productName)} · 只能选择能供应「${esc(sku.form)}」的供应商`,
    body() + options(),
    `<button class="po-btn" data-sr-cancel>取消</button><button class="po-btn po-btn-primary" data-sr-save>保存</button>`);

  const fullBody = () => body() + options();
  const repaint = () => {
    const w = $('#mpDrawerBody');
    if (!w) return;
    w.innerHTML = fullBody();
    bindPick();
  };
  const bindPick = () => {
    $$('.mp-drawer [data-sr-pick]').forEach(tr => tr.addEventListener('click', e => {
      /* V4.16：无报价的供应商整行锁定，点行也不选中 */
      const rb0 = tr.querySelector('input[name="srPick"]');
      if (rb0 && rb0.disabled) return;
      if (e.target && e.target.tagName === 'INPUT') { picked = tr.getAttribute('data-sr-pick'); return; }
      picked = tr.getAttribute('data-sr-pick');
      repaint();
    }));
  };
  bindPick();

  $('.mp-drawer [data-sr-cancel]').addEventListener('click', e => { e.preventDefault(); closeDrawer(); });
  $('.mp-drawer [data-sr-save]').addEventListener('click', e => {
    e.preventDefault();
    if (!picked) { toast('请选择供应商'); return; }
    if (picked === '__none__') {
      setRelation(skuCode, '', 'none');
      closeDrawer();
      renderSupply();
      toast(`已保存：「${sku.productName}」暂无供应商报价`);
      return;
    }
    setRelation(skuCode, picked, 'manual');
    closeDrawer();
    renderSupply();
    toast(`已绑定「${sku.productName}」→ ${supplierOf(picked).name}`);
  });
}

/* ===== 批量：一键选择报价最低供应商 ===== */
function batchLowest() {
  const targets = srTargets();
  if (!targets.length) { toast('当前没有在售商品'); return; }
  let ok = 0, tie = 0, noQuote = 0;
  targets.forEach(sk => {
    if (isOffShelf(sk.code)) return;
    const low = lowestOf(sk);
    if (!low) { noQuote++; setRelation(sk.code, '', 'none'); return; }
    setRelation(sk.code, low.supId, 'lowest');
    ok++;
    if (low.tie.length > 1) tie++;
  });
  renderSupply();
  const extra = [noQuote ? `跳过 ${noQuote} 个（该商品暂无供应商报价，已记为暂无报价）` : '', tie ? `其中 ${tie} 个存在同价，已按「最近采购 → 供应商 ID 较小」选定` : ''].filter(Boolean);
  toast(`已绑定 ${ok} 个商品的最低报价供应商` + (extra.length ? `，${extra.join('；')}` : ''));
}

/* ===== 批量：按形态绑定到 1 家供应商 ===== */
function openFormBatch() {
  let form = srFilter.form !== 'all' ? srFilter.form : '半成品';
  let supId = '';
  const candsOf = f => SUPPLIERS.filter(s => supTypes(s).includes(f));
  const body = () => `
    <div class="po-form">
      <div class="po-kv-grid">
        <div class="po-kv-wide">
          <label>商品形态 <em>*</em><span class="po-sub">一次只处理一个形态</span></label>
          <select class="po-select" id="srFormPick">
            ${SUPPLY_FORMS.map(f => `<option value="${f}" ${form === f ? 'selected' : ''}>${f}</option>`).join('')}
          </select>
        </div>
        <div class="po-kv-wide">
          <label>供应商 <em>*</em><span class="po-sub" id="srSupSub">只列出能供应「${esc(form)}」的供应商</span></label>
          <select class="po-select" id="srSupPick">
            <option value="">请选择供应商</option>
            ${candsOf(form).map(s => `<option value="${esc(s.id)}" ${supId === s.id ? 'selected' : ''}>${esc(s.name)}（${supTypes(s).join('/')}）</option>`).join('')}
          </select>
        </div>
      </div>
    </div>`;
  const preview = () => {
    const rows = SKUS.filter(sk => sk.form === form && !isOffShelf(sk.code));
    const overwrite = rows.filter(sk => { const r = relationOf(sk.code); return r && r.supplierId && r.supplierId !== supId; }).length;
    return `<div class="sr-preview">将影响 <b>${rows.length}</b> 个「${esc(form)}」商品${overwrite ? `，其中 <b>${overwrite}</b> 个已绑定其它供应商会被覆盖` : ''}${supId ? `；绑定到 <b>${esc(supplierOf(supId).name)}</b>` : ''}</div>`;
  };
  drawer('按形态批量绑定', '选一个形态 + 一家供应商，把当前筛选结果里该形态的商品批量绑过去',
    body() + `<div id="srPreviewWrap">${preview()}</div>`,
    `<button class="po-btn" data-sr-fb-cancel>取消</button><button class="po-btn po-btn-primary" data-sr-fb-ok>确认绑定</button>`);

  const repaintPreview = () => { const w = $('.mp-drawer #srPreviewWrap'); if (w) w.innerHTML = preview(); };
  $('.mp-drawer #srFormPick').addEventListener('change', e => {
    form = e.target.value;
    supId = '';
    const supSel = $('.mp-drawer #srSupPick');
    supSel.innerHTML = `<option value="">请选择供应商</option>` +
      candsOf(form).map(s => `<option value="${esc(s.id)}">${esc(s.name)}（${supTypes(s).join('/')}）</option>`).join('');
    const sub = $('.mp-drawer #srSupSub');
    if (sub) sub.textContent = `只列出能供应「${form}」的供应商`;
    repaintPreview();
  });
  $('.mp-drawer #srSupPick').addEventListener('change', e => { supId = e.target.value; repaintPreview(); });
  $('.mp-drawer [data-sr-fb-cancel]').addEventListener('click', e => { e.preventDefault(); closeDrawer(); });
  $('.mp-drawer [data-sr-fb-ok]').addEventListener('click', e => {
    e.preventDefault();
    if (!supId) { toast('请选择供应商'); return; }
    const rows = SKUS.filter(sk => sk.form === form && !isOffShelf(sk.code));
    if (!rows.length) { toast(`当前没有「${form}」形态的在售商品`); return; }
    rows.forEach(sk => setRelation(sk.code, supId, 'form'));
    closeDrawer();
    renderSupply();
    toast(`已把 ${rows.length} 个「${form}」商品绑定到 ${supplierOf(supId).name}`);
  });
}

/* ===== 批量解绑 ===== */
function batchUnbind() {
  const targets = srTargets().filter(sk => { const r = relationOf(sk.code); return r && r.supplierId; });
  if (!targets.length) { toast('当前没有已绑定供应商的商品'); return; }
  targets.forEach(sk => unbindRelation(sk.code));
  renderSupply();
  toast(`已清除 ${targets.length} 个商品的供应商`);
}

/* ===== 二次确认弹层（原型通用）：确认后才执行 ===== */
function poConfirm({ title, text, okText, cancelText, onOk }) {
  let mask = document.getElementById('poConfirmMask');
  if (!mask) {
    mask = document.createElement('div');
    mask.id = 'poConfirmMask';
    mask.className = 'po-confirm-mask';
    mask.innerHTML = `<div class="po-confirm" role="dialog" aria-modal="true">
      <h3 class="po-confirm-t" id="poConfirmTitle"></h3>
      <p class="po-confirm-x" id="poConfirmText"></p>
      <div class="po-confirm-f">
        <button class="po-btn" id="poConfirmCancel" type="button">取消</button>
        <button class="po-btn po-btn-primary" id="poConfirmOk" type="button">确认</button>
      </div>
    </div>`;
    document.body.appendChild(mask);
  }
  const close = () => { mask.classList.remove('show'); };
  document.getElementById('poConfirmTitle').textContent = title || '操作确认';
  document.getElementById('poConfirmText').textContent = text || '';
  document.getElementById('poConfirmOk').textContent = okText || '确认';
  document.getElementById('poConfirmCancel').textContent = cancelText || '取消';
  const okBtn = document.getElementById('poConfirmOk');
  const cancelBtn = document.getElementById('poConfirmCancel');
  const okNew = okBtn.cloneNode(true); okBtn.replaceWith(okNew);
  const cancelNew = cancelBtn.cloneNode(true); cancelBtn.replaceWith(cancelNew);
  okNew.addEventListener('click', () => { close(); if (typeof onOk === 'function') onOk(); });
  cancelNew.addEventListener('click', () => { close(); toast('已取消'); });
  mask.addEventListener('click', e => { if (e.target === mask) close(); });
  mask.classList.add('show');
  okNew.focus();
}

/* 一键最低价：确认后作用于全部在售商品 */
function confirmBatchLowest() {
  poConfirm({
    title: '一键选择报价最低供应商',
    text: '是否一键选择最低报价供应商，如有商品已绑定供应商，将会做覆盖处理',
    okText: '确认',
    onOk: () => batchLowest()
  });
}

/* 一键清除供应商：确认后清除全部已绑定关系 */
function confirmBatchUnbind() {
  poConfirm({
    title: '一键清除供应商',
    text: '是否一键清除所有已绑定的供应商',
    okText: '确认',
    onOk: () => batchUnbind()
  });
}

/* ============================ 17. 安装与导出 ============================ */

install();
window.MerchantOrder = {
  enter: showList,
  list: () => S.orders.slice(),
  orders: () => S.orders.slice(),
  reset: () => { seed(); showList(); },
  __debug: {
    findOrder: no => S.orders.find(o => o.no === no),
    showList, showOrder,
    openLines, openLineAccept, openLineDetail, openLineReturn, openSignature,
    submitDirect, switchStall,
    inkSignature: () => { if (sigHook) sigHook.ink(); },
    orderAmount, orderAllLinesAccepted, orderAcceptedAmount,
    /* V4.2 下单取供应商：可下单商品池 / 某 SKU 的绑定信息 / 拆单分组 */
    orderPoolIds: () => orderPool().map(sk => sk.code),
    bindInfoOf, wizGroups, diffLinesOf, batchesOf,
  }
};
/* 供货关系管理（V4.1 新栏目） */
window.MerchantSupply = {
  enter: showSupplyRelation,
  relations: () => S.relations.slice(),
  skus: () => SKUS.slice(),
  reset: () => { seed(); showSupplyRelation(); },
  __debug: {
    showSupply: showSupplyRelation,
    relationOf, lowestOf, lastPurchaseOf, pickTieSupplier, bindableSuppliers, skuHasQuote,
    setRelation, unbindRelation, openBindDrawer, batchLowest, openFormBatch, batchUnbind,
    setFilter: (patch) => { Object.assign(srFilter, patch); renderSupply(); },
    filteredSkus: srFilteredSkus, targets: srTargets,
    confirmBatchLowest, confirmBatchUnbind
  }
};
})();
