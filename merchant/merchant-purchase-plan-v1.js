/* 商户端 · 计划管理 —— 采购计划 V2（含询价单 / 报价比较）
   口径见《商户端采购计划PRD》V1.2 与《商户端采购计划设计方案-讨论稿》V1.5：

   【规则】上游是排餐计划：选一段任意周期区间，框定这些天要做的菜（v2 起不再有「餐次」概念，恒取该档口全部餐次）。
   【规则】用料取「烹饪投料（计入）」与「过程用料」两类，过程用料（include:false）同样计入采购；
           单位恒为克（与租户端菜谱 v2.0 一致），采购侧不做任何克→箱/袋/桶换算。
   【规则】数据分两层：
             items（材料层 = 采购清单）：一行 = 一个映射目标，只决定「这个用料买哪个商品」；
             daily（按天覆盖层）        ：{ 日期: { itemKey: { skuCode?, qty } } }，只在明细页按天填量。
           —— 清单管「买什么」，明细管「哪天、买多少」。
   【规则】预计采购量按天填，**每天每行的量都必填**（没有「留空=这天不买」，不买请用「忽略」）；
           发起询价时按「生效商品 SKU」合并，同一天被覆盖成
           另一个 SKU 会拆成两行，每行带 byDate 按天需求。
   【规则】一份采购计划同一时刻只能有 1 份在途询价单；已有询价单时再发起必须阻断。
   【规则】询价单状态：草稿 → 询价中 → 已截止 → 已定标。**发起后不可撤回**：
           询价中、已截止、已定标三个阶段都不能撤回；已定标为终态。
   【规则】截止时间不可延长，超时不会自动解除锁；到点未报价的供应商不会补报。
   【规则】报价比较只是把「询价行 × 受邀供应商」的价格矩阵摊开看，不做推荐、不做定标。

   【原型】商品库、供应商与预报价都是本文件内置的快照 —— 正式版前者读「商品中心」，
           后者读「采购管理 → 预报价」。原型没有供应商端，故提供「模拟回价」按钮演示报价回收。
   依赖 window.MerchantPlan（merchant-meal-plan-v1.js） */
(() => {
'use strict';

const MP = window.MerchantPlan;
if (!MP) return;
const { esc, toast, drawer, close, hideAll, findRecipe, today, add, monday, dayIndex,
        toGram, potsOf, savedPlanOf, meals } = MP;

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

/* ============================ 1. 商品库快照【原型】 ============================
   正式版：读「商品中心 → 本组织私域商品（已发布 + 启用）」。
   原型里商品中心只有 5 个种子商品、覆盖不到排餐用料，而采购计划必须能演示
   「同一标准食材有多个可选商品」「不同商品规格不同下单单位」，故内置一份目录快照。
   SKU 编码 SKU000601/801/901 与菜谱用料里直挂 SKU 的那几行对齐。

   【注意】这里**只有商品自身的规格与下单单位**，不含"每箱多少千克"这类换算基数 ——
   实际业务里包装重量并不固定（散装/冰衣/毛净差异），系统换算出来的是错的，
   所以采购计划不做任何克→箱/袋的折算，只把克数摆出来，由采购员自己判断买多少。 */
const CATALOG_RAW = [
  /* [商品编码, 商品名, [一级分类, 二级分类, 三级分类], 加工形态, [关联标准食材], [SKU: 编码, 名称, 规格, 下单单位]] */
  ['P01', '冷鲜鸡胸肉', ['生鲜食材', '肉禽', '冷鲜肉'], '毛菜', ['鸡胸肉'], [['S0101', '冷鲜鸡胸肉 箱装', '毛菜 / 整箱', '箱']]],
  ['P02', '生花生米', ['包装食品', '干货', '坚果豆类'], '净菜', ['花生米'], [['S0201', '生花生米 袋装', '5kg/袋', '袋']]],
  ['P03', '鲜黄瓜', ['生鲜食材', '蔬菜', '瓜茄类'], '毛菜', ['黄瓜'], [['S0301', '鲜黄瓜 箱装', '毛菜 / 整箱', '箱']]],
  ['P04', '海天生抽', ['粮油调味', '调味品', '酱油醋'], '净菜', ['生抽'], [
    ['SKU000601', '海天生抽 500ml×12', '500ml×12/箱', '箱'],
    ['S0402', '海天生抽 1.9L×6', '1.9L×6/箱', '箱']]],
  ['P05', '小磨香油', ['粮油调味', '调味品', '调味油'], '净菜', ['香油'], [['S0501', '小磨香油 桶装', '5L/桶', '桶']]],
  ['P06', '冷鲜五花肉', ['生鲜食材', '肉禽', '冷鲜肉'], '毛菜', ['五花肉'], [['S0601', '冷鲜五花肉 箱装', '毛菜 / 整箱', '箱']]],
  ['P07', '山东一级土豆', ['生鲜食材', '蔬菜', '根茎类'], '毛菜', ['土豆'], [
    ['S0701', '山东一级土豆 袋装', '5kg/袋', '袋'],
    ['S0702', '山东一级土豆 箱装', '10kg/箱', '箱']]],
  ['P08', '单晶冰糖', ['粮油调味', '调味品', '食糖'], '净菜', ['冰糖'], [['SKU000801', '单晶冰糖 袋装', '5kg/袋', '袋']]],
  ['P09', '一级大豆油', ['粮油调味', '粮油', '食用油'], '净菜', ['食用油'], [['SKU000901', '一级大豆油 5L×4/箱', '5L×4/箱', '箱']]],
  /* 饮用水：同一食材两个商品，演示「自采用料也要采购员选商品」 */
  ['P10', '饮用水（自来水）', ['包装食品', '饮品', '饮用水'], '净菜', ['饮用水'], [['S1001', '自来水（按吨计）', '1 吨', '吨']]],
  ['P11', '鲜鸡蛋', ['生鲜食材', '蛋品', '鲜蛋'], '毛菜', ['鸡蛋'], [['S1101', '鲜鸡蛋 箱装', '整箱', '箱']]],
  ['P12', '干紫菜', ['包装食品', '干货', '海产干货'], '净菜', ['紫菜'], [['S1201', '干紫菜 袋装', '2kg/袋', '袋']]],
  ['P13', '精制食盐', ['粮油调味', '调味品', '食盐'], '净菜', ['食盐'], [['S1301', '精制食盐 袋装', '20kg/袋', '袋']]],
  ['P14', '鲜切面', ['包装食品', '米面制品', '鲜切面'], '半成品', ['面条'], [['S1401', '鲜切面 箱装', '整箱', '箱']]],
  ['P15', '葱油（自制）', ['包装食品', '半成品', '自制调料'], '半成品', ['葱油'], [['S1501', '葱油 桶装', '5kg/桶', '桶']]],
  ['P16', '白砂糖', ['粮油调味', '调味品', '食糖'], '净菜', ['白糖'], [['S1601', '白砂糖 袋装', '10kg/袋', '袋']]],
  ['P17', '鲜小葱', ['生鲜食材', '蔬菜', '叶菜类'], '毛菜', ['小葱'], [['S1701', '鲜小葱 箱装', '毛菜 / 整箱', '箱']]],
  ['P18', '老南瓜', ['生鲜食材', '蔬菜', '瓜茄类'], '毛菜', ['南瓜'], [['S1801', '老南瓜 箱装', '毛菜 / 整箱', '箱']]],
  ['P19', '黄小米', ['粮油调味', '粮油', '杂粮'], '净菜', ['小米'], [['S1901', '黄小米 袋装', '10kg/袋', '袋']]],
  ['P20', '冷鲜牛腩', ['生鲜食材', '肉禽', '冷鲜肉'], '毛菜', ['牛肉'], [['S2001', '冷鲜牛腩 箱装', '毛菜 / 整箱', '箱']]],
  ['P21', '沙瓤番茄', ['生鲜食材', '蔬菜', '瓜茄类'], '毛菜', ['番茄'], [['S2101', '沙瓤番茄 箱装', '毛菜 / 整箱', '箱']]],
  ['P22', '时令蔬菜（当日）', ['生鲜食材', '蔬菜', '叶菜类'], '毛菜', ['时令蔬菜'], [['S2201', '时令蔬菜 箱装', '毛菜 / 整箱', '箱']]],
  ['P23', '中筋面粉', ['粮油调味', '粮油', '面粉'], '净菜', ['面粉'], [['S2301', '中筋面粉 袋装', '25kg/袋', '袋']]],
  ['P24', '新疆哈密瓜', ['生鲜食材', '水果', '瓜果类'], '毛菜', ['哈密瓜'], [['S2401', '新疆哈密瓜 箱装', '毛菜 / 整箱', '箱']]],
  ['P25', '千禧圣女果', ['生鲜食材', '水果', '浆果类'], '毛菜', ['圣女果'], [['S2501', '千禧圣女果 箱装', '毛菜 / 整箱', '箱']]],
  ['P26', '绍兴料酒', ['粮油调味', '调味品', '料酒'], '净菜', ['料酒'], [['S2601', '绍兴料酒 500ml×12', '500ml×12/箱', '箱']]],
  ['P27', '农夫山泉桶装水', ['包装食品', '饮品', '包装水'], '净菜', ['饮用水'], [['S2701', '农夫山泉 550ml×24', '550ml×24/箱', '箱']]],
  /* P28–P30 只为「演示未映射」存在：这 3 个食材 seed 排餐里没有用到，
     所以它们在每份采购计划里都保持「待选择」状态，用来演示采购员现场选商品。
     正式版删掉这三行与下面的 DEMO_UNMAPPED 即可。 */
  ['P28', '东北干木耳', ['包装食品', '干货', '食用菌'], '净菜', ['木耳'], [['S2801', '东北干木耳 袋装', '2kg/袋', '袋']]],
  ['P29', '龙口粉丝', ['包装食品', '干货', '淀粉制品'], '净菜', ['粉丝'], [
    ['S2901', '龙口粉丝 袋装', '5kg/袋', '袋'],
    ['S2902', '龙口粉丝 箱装', '10kg/箱', '箱']]],
  ['P30', '鲜腐竹', ['包装食品', '豆制品', '豆制品'], '净菜', ['腐竹'], [['S3001', '鲜腐竹 箱装', '毛菜 / 整箱', '箱']]]
];

const PRODUCTS = CATALOG_RAW.map(([code, name, cats, form, ings, skus]) => ({
  code, name, cats, cat: cats.join(' > '), form, ingredients: ings,
  skus: skus.map(([sc, sn, spec, unit]) => ({ code: sc, name: sn, spec, orderUnit: unit, productCode: code }))
}));
const PRODUCT_INDEX = Object.fromEntries(PRODUCTS.map(p => [p.code, p]));
const SKU_INDEX = {};
PRODUCTS.forEach(p => p.skus.forEach(s => { SKU_INDEX[s.code] = { product: p, sku: s }; }));

const productsOfIngredient = ing => PRODUCTS.filter(p => p.ingredients.includes(ing));
/* 换商品时的候选：先按标准食材找关联商品，找不到（手工行 / 直挂行）就放开到全部商品 */
const candidatesOf = item => {
  const byIng = productsOfIngredient(item.ingName);
  return byIng.length ? byIng : PRODUCTS;
};
const skuNameOf = code => (SKU_INDEX[code] ? SKU_INDEX[code].product.name : '');
const skuOf = code => SKU_INDEX[code] || null;
/* 商品的加工形态（毛菜 / 净菜 / 半成品）——采购侧判断"到手是什么状态"的唯一依据。
   跟在商品名后面输出，样式与「添加商品」抽屉里的形态标签同一套。 */
const formTagOf = hit => (hit && hit.product && hit.product.form
  ? `<span class="pc-form-tag sm f-${esc(hit.product.form)}">${esc(hit.product.form)}</span>`
  : '');
/* 询价单行是发起那一刻的快照：优先用行上冻结的 form；
   老数据（早期没有存 form 的单据）回查商品库，查不到就不显示。 */
const formTagOfLine = l => (l && l.form
  ? `<span class="pc-form-tag sm f-${esc(l.form)}">${esc(l.form)}</span>`
  : formTagOf(skuOf((l || {}).skuCode)));

/* 这一行是怎么来的：菜谱直挂（无需选商品）/ 手工添加。
   采购明细、已忽略表、商品映射三处共用一套标签，措辞保持与「商品映射」分组一致。 */
const kindTagOf = it => (it.source === 'manual'
  ? '<i class="mp-tag manual">手工添加</i>'
  : it.source === 'sku'
    ? '<i class="pc-tag-kind muted">菜谱直挂</i>'
    : '');

/* ============================ 2. 供应商与预报价【原型】 ============================
   quotes: 商品编码 → { price, unit }。unit 是预报价对应的下单单位，
   与询价行单位不一致时不带出默认值。 */
const SUPPLIERS = [
  { id: 'sup1', name: '上海鲜配供应链有限公司', contact: '王经理 138****6621', tags: ['生鲜', '肉禽蛋'],
    quotes: { P01: { price: 128, unit: '箱' }, P03: { price: 65, unit: '箱' }, P06: { price: 220, unit: '箱' },
              P07: { price: 26, unit: '袋' }, P11: { price: 96, unit: '箱' }, P17: { price: 58, unit: '箱' },
              P18: { price: 48, unit: '箱' }, P21: { price: 72, unit: '箱' }, P22: { price: 55, unit: '箱' },
              P24: { price: 60, unit: '箱' }, P25: { price: 120, unit: '箱' } } },
  { id: 'sup2', name: '江南粮油调味品商行', contact: '李经理 139****3382', tags: ['粮油', '调味'],
    quotes: { P02: { price: 52, unit: '袋' }, P04: { price: 58, unit: '箱' }, P05: { price: 95, unit: '桶' },
              P08: { price: 32, unit: '袋' }, P09: { price: 184, unit: '箱' }, P12: { price: 46, unit: '袋' },
              P13: { price: 36, unit: '袋' }, P14: { price: 48, unit: '箱' }, P16: { price: 48, unit: '袋' },
              P19: { price: 56, unit: '袋' }, P23: { price: 96, unit: '袋' }, P26: { price: 42, unit: '箱' } } },
  { id: 'sup3', name: '城西冷链配送中心', contact: '赵经理 137****9900', tags: ['冷链', '肉禽'],
    quotes: { P01: { price: 132, unit: '箱' }, P06: { price: 215, unit: '箱' },
              P15: { price: 38, unit: '桶' }, P20: { price: 450, unit: '箱' } } },
  { id: 'sup4', name: '清源饮用水配送', contact: '孙师傅 136****1188', tags: ['饮用水'],
    quotes: { P10: { price: 0.005, unit: '吨' }, P27: { price: 26, unit: '箱' } } },
  { id: 'sup5', name: '本地蔬菜合作社', contact: '周姐 135****7742', tags: ['蔬菜'],
    quotes: { P03: { price: 62, unit: '箱' }, P17: { price: 55, unit: '箱' }, P18: { price: 46, unit: '箱' },
              P21: { price: 69, unit: '箱' }, P22: { price: 52, unit: '箱' }, P25: { price: 112, unit: '箱' } } }
];
const supplierOf = id => SUPPLIERS.find(s => s.id === id);

/* ============================ 3. 落盘（v2） ============================ */
const PLAN_PREFIX = 'pp:plan:v2';       // pp:plan:v2:{档口}:{from}:{to}
const INQ_PREFIX  = 'pp:inq:v2';        // pp:inq:v2:{档口}:{planId}
const MAP_PREFIX  = 'pp:ingmap:v1';     // pp:ingmap:v1:{档口} → { 标准食材: SKU编码 }（全局映射记忆）

const lsGet = k => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 配额满：忽略 */ } };
const lsDel = k => { try { localStorage.removeItem(k); } catch { /* 忽略 */ } };

/* v1 的 key 带「餐次」段、数据模型也不兼容 —— 上线时清掉，避免脏数据被当成本版本读出来 */
(function purgeLegacy() {
  const kill = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && (k.startsWith('pp:plan:v1:') || k.startsWith('pp:inq:v1:'))) kill.push(k);
    }
  } catch { /* 忽略 */ }
  kill.forEach(lsDel);
})();

const pad2 = n => String(n).padStart(2, '0');
const nowStr = () => { const d = new Date(); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };
const dtLocal = ts => { const d = new Date(ts); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };
const toTs = v => new Date(String(v).replace(' ', 'T')).getTime();
const mdOf = d => String(d).slice(5);
const WEEK_CN = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const wdOf = d => WEEK_CN[new Date(d + 'T00:00:00').getDay()];

const planIdOf = (from, to) => `${from}~${to}`;
/* 同一区间允许建多份计划：id 形如 `2026-10-22~2026-10-23` / `…#2` / `…#3`。
   落盘 key 沿用 v2 老格式（段是 from:to），重复区间只在末尾加 `:#序号`，
   这样已经存在的老计划不用迁移也照样读得出来。 */
const planKeyOf = p => `${PLAN_PREFIX}:${p.stallId}:${p.from}:${p.to}${p.seq > 1 ? `:#${p.seq}` : ''}`;

function savePlan(plan) { lsSet(planKeyOf(plan), plan); }
function listPlans(stallId) {
  const pre = `${PLAN_PREFIX}:${stallId}:`, out = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(pre)) { const p = lsGet(k); if (p && p.stallId === stallId) out.push(p); }
    }
  } catch { /* 忽略 */ }
  return out.sort((a, b) => (b.updated || '').localeCompare(a.updated || '') || b.from.localeCompare(a.from));
}
const ingMapOf = stallId => lsGet(`${MAP_PREFIX}:${stallId}`) || {};
function rememberIngredient(stallId, ing, skuCode) {
  const m = ingMapOf(stallId); m[ing] = skuCode; lsSet(`${MAP_PREFIX}:${stallId}`, m);
}
const inqKeyOf = (stallId, planId) => `${INQ_PREFIX}:${stallId}:${planId}`;
/* 已撤回已从产品里去掉：老数据里残留的 withdrawn 单直接过滤掉，不参与任何展示 */
const inqsOf = (stallId, planId) => (lsGet(inqKeyOf(stallId, planId)) || []).filter(q => q && q.status !== 'withdrawn');
const saveInqs = (stallId, planId, list) => lsSet(inqKeyOf(stallId, planId), list);

/* ============================ 4. 取数与派生 ============================ */
const datesBetween = (from, to) => {
  const out = []; let d = from, guard = 0;
  while (d <= to && guard++ < 400) { out.push(d); d = add(d, 1); }
  return out;
};
const daySpan = (from, to) => Math.round((toTs(to) - toTs(from)) / 86400000) + 1;

/* v2：采购计划不再有餐次概念，一律取该档口全部餐次 */
const allMeals = () => { const m = meals(); return (m && m.length) ? m : ['午餐']; };

/* 读某档口某周的排餐：优先已保存的，没有就按同样种子规则落一份（否则新浏览器里下游全空） */
const weekPlanOf = (stallId, weekStart) =>
  (MP.ensureWeekPlan ? MP.ensureWeekPlan(stallId, weekStart) : savedPlanOf(stallId, weekStart));

/* 区间预览：命中多少天 / 多少天无排餐 / 菜品数 */
function previewOf(stallId, from, to) {
  const ms = allMeals();
  let hit = 0, blank = 0, dishes = 0;
  const days = datesBetween(from, to).map(d => {
    const wk = monday(d), di = dayIndex(d), p = weekPlanOf(stallId, wk);
    const active = !!(p && (p.activeDays || []).includes(di));
    let n = 0;
    if (active) ms.forEach(m => { n += (p.schedule?.[di]?.[m] || []).length; });
    if (n > 0) { hit++; dishes += n; } else blank++;
    return { date: d, count: n, active };
  });
  return { hit, blank, dishes, days };
}

/* 用料派生（材料层）：「烹饪投料（计入）」与「过程用料」均计入；单位恒为克；按合并键汇总。
   返回的 item 只带「系统派生的部分」——skuCode 是直挂商品的初值，ing 行由 buildItems 补。 */
function deriveItems(plan) {
  const ms = allMeals();
  const agg = new Map();
  datesBetween(plan.from, plan.to).forEach(d => {
    const wk = monday(d), di = dayIndex(d), p = savedPlanOf(plan.stallId, wk) || weekPlanOf(plan.stallId, wk);
    if (!p || !(p.activeDays || []).includes(di)) return;
    ms.forEach(m => {
      (p.schedule?.[di]?.[m] || []).forEach(id => {
        const r = findRecipe(id); if (!r) return;
        const pot = potsOf(p, di, m, id); if (!pot) return;
        (r.bom || []).forEach(b => {
          // 过程用料（include:false）同样计入用量 —— V3.x 口径：两类均计入
          const g = (toGram(b.qty, b.unit) ?? 0) * pot;
          if (!g) return;
          const bound = !!b.sku;
          const key = bound ? `sku:${b.sku}` : `ing:${b.ingredient}`;
          let it = agg.get(key);
          if (!it) {
            it = { key, source: bound ? 'sku' : 'ing', ingName: b.ingredient, skuCode: bound ? b.sku : '', ignored: false, basis: [] };
            agg.set(key, it);
          }
          it.basis.push({ date: d, meal: m, recipe: r.name, pots: pot, gram: g });
        });
      });
    });
  });
  return [...agg.values()];
}

/* 把派生的材料行与「用户已选商品 / 忽略标记」合并 —— 重算永不动用户的选择 */
/* —— 演示数据：在计划里「今天（或今天之后最近的一天）」放 1 条从未映射过商品的标准食材 ——
   原型里 seed 排餐的用料基本都能被记忆映射到商品，看不到「待选择」这个状态。
   这里挑的是「排餐里没出现、也没有任何映射记忆」的标准食材，打开就是未映射，
   用来演示采购员现场选商品的流程；选完商品后与真实行完全一样。
   计划区间不含今天及以后就不造，正式版删掉本段即可。 */
const DEMO_GRAM = 2400;                       /* 演示行的用量（克） */
const demoDatesOf = plan => {
  const day = datesBetween(plan.from, plan.to).find(d => d >= today());
  return day ? [day] : [];
};

function demoItemsOf(plan, taken, takenNames, keepNames) {
  const dates = demoDatesOf(plan);
  if (!dates.length) return [];
  const real = [];
  (plan.items || []).forEach(it => (it.basis || []).forEach(b => { if (b.gram > 0) real.push(b); }));
  const memory = ingMapOf(plan.stallId);
  const keep = new Set(keepNames || []);
  /* 候选：目录里确实有商品可选的食材，且本计划里没有同名用料。
     注意要按「用料名」排重 —— 直挂商品的行 key 是 sku:xxx，只比 key 会漏掉。
     优先挑「从没映射过」的；万一全都被映射过了（演示时来回选过很多次），
     就退一步挑一条本计划里没有的，照样置成未映射 —— 不能因为挑不到就整行不出现。
     keepNames = 已经是演示行的食材：已经被选了商品也要留住，否则用户选的商品白选。 */
  const base = [...new Set(PRODUCTS.flatMap(p => p.ingredients))]
    .filter(x => !takenNames.has(x) && !taken.has('ing:' + x));
  const never = base.filter(x => !memory[x] || keep.has(x));
  const pool = never.length ? never : base;
  return pool.slice(0, 1).map(ing => {
    /* 依据借用当天的餐次，菜品名写作「临时加采」—— 不把假用量挂到真实菜品上 */
    const basis = dates.map(date => {
      const src = real.find(b => b.date === date) || {};
      return { date, meal: src.meal || '', recipe: '临时加采', pots: 1, gram: DEMO_GRAM };
    });
    /* 演示行就是要「待选择」：一律不带映射（重建/重算时会把已选好的商品带回来） */
    return { key: 'ing:' + ing, source: 'ing', ingName: ing, demo: true, skuCode: '', basis };
  });
}

/* 【原型】打开已保存的计划时补齐演示行。
   关键：口径没变就一行都不动 —— 否则每次渲染都会把演示行重建一遍，
   用户刚选好的商品会被抹回「待选择」。只有缺失或口径变了（旧版每天都有）才重建。 */
function ensureDemoItems(plan) {
  const before = plan.items || [];
  const kept = before.filter(i => i.demo !== true);
  const curDemos = before.filter(i => i.demo === true);
  const want = demoItemsOf(plan, new Set(kept.map(i => i.key)), new Set(kept.map(i => i.ingName)),
    curDemos.map(i => i.ingName));

  const datesOf = it => [...new Set((it.basis || []).map(b => b.date))].sort().join(',');
  const sameSpec = curDemos.length === want.length && want.every(w => {
    const c = curDemos.find(x => x.key === w.key);
    return !!c && datesOf(c) === datesOf(w);
  });
  if (sameSpec) return false;           /* 口径一致：保持原样，已选商品/填写内容都不动 */

  /* 重建时把同 key 演示行已经选好的商品带过去，别让用户白选一次 */
  const prev = new Map(curDemos.map(i => [i.key, i]));
  want.forEach(w => { const old = prev.get(w.key); if (old && old.skuCode) w.skuCode = old.skuCode; });
  plan.items = kept.concat(want);
  savePlan(plan);       /* 不动 plan.updated：打开页面不该刷新「更新时间」 */
  return true;
}

function buildItems(plan) {
  const derived = deriveItems(plan);
  const prev = new Map((plan.items || []).map(i => [i.key, i]));
  const memory = ingMapOf(plan.stallId);
  const items = derived.map(d => {
    const old = prev.get(d.key) || {};
    const skuCode = d.source === 'sku' ? d.skuCode : (old.skuCode || memory[d.ingName] || '');
    return { key: d.key, source: d.source, ingName: d.ingName, skuCode: skuCode || '', basis: d.basis };
  });
  /* 手工加的行没有排餐依据，永远保留在末尾 */
  (plan.items || []).filter(i => i.source === 'manual').forEach(i => items.push({ ...i, basis: [] }));
  /* 【原型】演示行：在「明天/后天」两天各放几条从未映射过的标准食材 */
  demoItemsOf(plan, new Set(items.map(i => i.key)), new Set(items.map(i => i.ingName)),
    (plan.items || []).filter(i => i.demo === true).map(i => i.ingName)).forEach(d => {
    /* 重算也要保住已经选好的商品：先看映射记忆，再看这一行原来的值 */
    const old = prev.get(d.key);
    items.push({ ...d, skuCode: d.skuCode || (old && old.skuCode) || '' });
  });
  return items;
}

const itemGram = it => (it.basis || []).reduce((s, b) => s + b.gram, 0);
const itemOf = (plan, key) => (plan.items || []).find(i => i.key === key) || null;

/* —— 按天口径（单一入口，别在别处重算） —— */
const cellOf = (plan, key, date) => ((plan.daily || {})[date] || {})[key] || null;
const gramOfDay = (item, date) => (item.basis || []).reduce((s, b) => (b.date === date ? s + b.gram : s), 0);
const skuOfDay = (plan, item, date) => {
  const c = cellOf(plan, item.key, date);
  return (c && c.skuCode) || item.skuCode || '';
};
/* 「忽略」是按天的：只影响当天，qty 归零但保留原值，恢复即回来 */
const ignoredOfDay = (plan, item, date) => {
  const c = cellOf(plan, item.key, date);
  return !!(c && c.ignored);
};
const qtyOfDay = (plan, item, date) => {
  const c = cellOf(plan, item.key, date);
  if (!c || c.ignored) return 0;
  return c.qty != null ? (Number(c.qty) || 0) : 0;
};
function ensureCell(plan, key, date) {
  plan.daily = plan.daily || {};
  plan.daily[date] = plan.daily[date] || {};
  plan.daily[date][key] = plan.daily[date][key] || {};
  return plan.daily[date][key];
}
/* 有排餐用料的天 + 有手工行的天（无排餐的天不出日期页签） */
function daysOf(plan) {
  const set = new Set();
  (plan.items || []).forEach(it => {
    if (it.source === 'manual') return;
    (it.basis || []).forEach(b => { if (b.gram > 0) set.add(b.date); });
  });
  const manualKeys = new Set((plan.items || []).filter(i => i.source === 'manual').map(i => i.key));
  Object.keys(plan.daily || {}).forEach(d => {
    if (Object.keys(plan.daily[d] || {}).some(k => manualKeys.has(k))) set.add(d);
  });
  return [...set].sort();
}
/* 当天是否真的用到这一行（手工行看有没有单元格，其他看当天克数）。
   **凡是"逐天 × 逐行"的汇总都必须先过这一关** —— 只判断"是否被忽略"是不够的：
   某个材料只在 10-19 用到，在 10-19 被忽略后，10-20 这天它既没被忽略也不该出现，
   漏掉这一关就会凭空把它映射到的商品算进询价范围，报出"没填量"。 */
const presentOf = (plan, item, date) =>
  item.source === 'manual' ? !!cellOf(plan, item.key, date) : gramOfDay(item, date) > 0;
/* 当天要展示/计入的材料行：真的用到，且当天没被忽略 */
function dayItemsOf(plan, date) {
  return (plan.items || [])
    .filter(it => presentOf(plan, it, date) && !ignoredOfDay(plan, it, date))
    .sort((a, b) => gramOfDay(b, date) - gramOfDay(a, date));
}
/* 当天被忽略的材料行（显示在当天表格下方，可逐行恢复） */
function ignoredDayItemsOf(plan, date) {
  return (plan.items || [])
    .filter(it => presentOf(plan, it, date) && ignoredOfDay(plan, it, date))
    .sort((a, b) => gramOfDay(b, date) - gramOfDay(a, date));
}
/* 某个 SKU 在所有天、所有映射到它的材料行上的采购量之和 */
function totalQtyOf(plan, skuCode) {
  let n = 0;
  daysOf(plan).forEach(d => dayItemsOf(plan, d).forEach(it => {
    if (skuOfDay(plan, it, d) !== skuCode) return;
    n += qtyOfDay(plan, it, d);
  }));
  return Math.round(n * 100) / 100;
}
/* 某个 SKU 的按天需求，只含有量的天 */
function byDateOf(plan, skuCode) {
  const out = [];
  daysOf(plan).forEach(d => {
    let qty = 0, gram = 0;
    dayItemsOf(plan, d).forEach(it => {
      if (skuOfDay(plan, it, d) !== skuCode) return;
      qty += qtyOfDay(plan, it, d);
      gram += gramOfDay(it, d);
    });
    if (qty > 0) out.push({ date: d, qty: Math.round(qty * 100) / 100, gram });
  });
  return out.sort((a, b) => a.date.localeCompare(b.date));
}
/* 哪些天被单独指定成了别的 SKU（只在「当天真的用到」的天里算） */
const exceptionDaysOf = (plan, item) => daysOf(plan).filter(d => {
  if (!presentOf(plan, item, d)) return false;
  const c = cellOf(plan, item.key, d);
  return !!(c && c.skuCode && c.skuCode !== item.skuCode);
});
const hasException = (plan, item) => exceptionDaysOf(plan, item).length > 0;
/* 发起询价时真正会出现在询价单上的商品：
   只算「当天真的用到、且当天没被忽略」的行 —— 见 presentOf 上的说明 */
function effectiveSkuCodes(plan) {
  const set = new Set();
  daysOf(plan).forEach(d => dayItemsOf(plan, d).forEach(it => {
    const s = skuOfDay(plan, it, d);
    if (s) set.add(s);
  }));
  return [...set];
}

const sigOf = items => items.filter(i => i.source !== 'manual').map(i => `${i.key}=${Math.round(itemGram(i))}`).join('|');

/* 重新生成：重算材料层，顺手清掉指向已消失材料的按天填量 */
function pruneDaily(plan) {
  const keys = new Set((plan.items || []).map(i => i.key));
  const daily = plan.daily || {};
  Object.keys(daily).forEach(d => {
    Object.keys(daily[d] || {}).forEach(k => { if (!keys.has(k)) delete daily[d][k]; });
    if (!Object.keys(daily[d] || {}).length) delete daily[d];
  });
  plan.daily = daily;
}
function regenerate(plan, quiet) {
  plan.items = buildItems(plan);
  pruneDaily(plan);
  plan.sig = sigOf(plan.items);
  plan.updated = nowStr();
  savePlan(plan);
  if (!quiet) toast('已按当前排餐重新生成商品映射');
}

/* —— 状态机 —— */
const INQ_STATUS = { draft: '草稿', inquiry: '询价中', closed: '已截止', awarded: '已定标', failed: '已流标' };
const effStatus = inq => {
  if (!inq) return 'draft';
  if (inq.status === 'inquiry' && Date.now() >= toTs(inq.reply_deadline)) return 'closed';
  return inq.status;
};
/* 在途 = 报价还没结束（询价中 / 已截止）。已定标、已流标都是终态，不算在途 */
const INFLIGHT = ['inquiry', 'closed'];
/* 锁定 = 已经发过询价单，两个页签都只读（含两个终态） */
const LOCKED = ['inquiry', 'closed', 'awarded', 'failed'];
const latestInq = plan => (inqsOf(plan.stallId, plan.id) || []).slice().sort((a, b) => b.ver - a.ver)[0] || null;
const inflightOf = plan => { const q = latestInq(plan); return q && INFLIGHT.includes(effStatus(q)) ? q : null; };
const lockedInqOf = plan => { const q = latestInq(plan); return q && LOCKED.includes(effStatus(q)) ? q : null; };
function planStatusOf(plan) {
  const q = latestInq(plan);
  if (!q) return { code: 'draft', label: '草稿', cls: 'draft' };
  const s = effStatus(q);
  return { code: s, label: INQ_STATUS[s] || s, cls: s };
}

const fmtMoney = v => `¥${(Math.round(v * 100) / 100).toFixed(2)}`;
const fmtGram = g => {
  const v = Math.round(g * 100) / 100;
  return Number.isInteger(v) ? String(v) : v.toFixed(2);
};
const fmtQty = q => { const v = Math.round(Number(q) * 100) / 100; return Number.isInteger(v) ? String(v) : v.toFixed(2); };

/* ============================ 5. 页面骨架 ============================ */
let view = 'list';            // list | detail
let tab = 'clean';            // clean（商品映射）| day（采购明细）| inq（询价单）
let activeDay = '';           // 采购明细页签里当前选中的日期
let cur = null;               // { plan }
let listFilter = 'all';
let activeScope = '';
const scopeToken = () => `${(window.MerchantScope && window.MerchantScope.current() ? window.MerchantScope.current().orgId : '') || MP.org() || ''}|${MP.scopeKey() || ''}`;

function page() {
  let p = $('#purchasePlanPage');
  if (!p) {
    p = document.createElement('div');
    p.id = 'purchasePlanPage';
    p.className = 'page-view pp-page pc-page';
    p.hidden = true;
    $('.main').appendChild(p);
  }
  return p;
}

function enter() {
  hideAll($('#purchasePlanNav'));
  page().hidden = false;
  const k = scopeToken();
  if (k !== activeScope) { activeScope = k; cur = null; view = 'list'; tab = 'clean'; activeDay = ''; }
  const bc = $('.breadcrumb');
  if (bc) bc.innerHTML = '计划管理&nbsp; / &nbsp;<strong>采购计划</strong>';
  render();
}

function render() {
  if (!MP.scopeKey()) return stallOverview();
  if (view === 'detail' && cur && cur.plan) return detailView();
  view = 'list';
  listView();
}

/* 组织层：采购计划只挂在档口上，这里给该组织各档口的入口 */
function stallOverview() {
  const list = (window.MerchantStalls && window.MerchantScope)
    ? window.MerchantStalls.listByOrg(window.MerchantScope.current().orgId) : [];
  const cards = list.map(s => {
    const ps = listPlans(s.id);
    const flight = ps.filter(p => inflightOf(p)).length;
    const owner = s.owner && s.owner.name ? `${s.owner.name}${s.owner.phone ? ' · ' + s.owner.phone : ''}` : '未指定负责人';
    return `<div class="mp-so-card" data-pc-stall="${esc(s.id)}">
      <h4>${esc(s.name)}</h4>
      <p class="mp-so-owner">负责人：${esc(owner)}</p>
      <div class="mp-so-meals">${(s.meals || []).map(m => `<span>${esc(m.meal)} ${esc(m.start)}–${esc(m.end)}</span>`).join('')}</div>
      <div class="mp-so-foot">${ps.length ? `<b>${ps.length} 份采购计划${flight ? ` · ${flight} 份询价在途` : ''}</b>` : '<b>暂无采购计划</b>'}<span class="mp-so-enter">进入采购计划 ›</span></div>
    </div>`;
  }).join('');
  page().innerHTML = `
  <section class="mp-card mp-workspace pp-workspace">
    <div class="mp-workspace-head">
      <div><h1>采购计划</h1><p>由排餐计划自动派生这些天的用料；采购计划只挂在档口上，先选档口再看清单</p></div>
    </div>
    <div class="mp-section mp-stall-overview">
      <div class="mp-section-head"><div class="mp-week-heading"><h2>${esc(MP.org() || '当前组织')}的档口</h2><span class="mp-so-tip">采购计划概览</span></div></div>
      ${list.length ? `<div class="mp-so-grid">${cards}</div>` : '<p class="mp-so-empty">暂无档口，请先创建档口</p>'}
    </div>
  </section>`;
  mountScope();
  $$('[data-pc-stall]').forEach(c => c.onclick = () => window.MerchantScope?.setStall(c.dataset.pcStall));
}

function mountScope() {
  const head = page().querySelector('.mp-workspace-head');
  if (head) window.MerchantScope?.mount(head, { stall: true, defaultAll: true });
}

/* ============================ 6. 列表页 ============================ */
function listView() {
  const stallId = MP.scopeKey();
  const all = listPlans(stallId);
  const rows = all.filter(p => listFilter === 'all' || planStatusOf(p).code === listFilter);
  const chip = (v, label) => `<button class="pc-chip ${listFilter === v ? 'on' : ''}" data-pc-filter="${v}">${label}</button>`;

  page().innerHTML = `
  <section class="mp-card mp-workspace pp-workspace">
    <div class="mp-workspace-head">
      <div><h1>采购计划</h1><p>按「档口 × 周期区间」各一份计划；同一档口的多份计划可以区间重叠，互不覆盖</p></div>
    </div>
    <div class="pc-actions"><button class="mp-primary" id="pcNew">＋ 新建采购计划</button></div>
    <div class="pp-filters">
      ${chip('all', `全部 ${all.length}`)}
      ${chip('draft', '草稿')}${chip('inquiry', '询价中')}${chip('closed', '已截止')}
      ${chip('awarded', '已定标')}${chip('failed', '已流标')}
      <span class="mp-spacer"></span>
      <span class="pp-note">当前档口：${esc((MP.stall() || {}).name || '—')}</span>
    </div>
    ${rows.length ? planTable(rows) : `<div class="mp-empty pp-empty"><b>暂无采购计划</b><p>点击右上角「新建采购计划」，选一段周期区间即可由排餐计划自动生成商品映射。</p></div>`}
  </section>`;
  mountScope();
  $('#pcNew') && ($('#pcNew').onclick = openNewDrawer);
  $$('[data-pc-filter]').forEach(b => b.onclick = () => { listFilter = b.dataset.pcFilter; render(); });
  $$('[data-pc-open]').forEach(b => b.onclick = () => {
    cur = { plan: listPlans(stallId).find(p => p.id === b.dataset.pcOpen) };
    view = 'detail'; tab = 'clean'; activeDay = ''; render();
  });
  $$('[data-pc-del]').forEach(b => b.onclick = () => {
    const p = all.find(x => x.id === b.dataset.pcDel); if (!p) return;
    if (lockedInqOf(p)) {
      const q = lockedInqOf(p);
      const st = effStatus(q);
      return toast(st === 'failed' ? '已流标的采购计划不能删除' : st === 'awarded' ? '已定标的采购计划不能删除' : '已发起询价，采购计划不能删除');
    }
    if (!confirm(`确认删除采购计划「${p.from} ~ ${p.to}」？`)) return;
    lsDel(planKeyOf(p));
    lsDel(inqKeyOf(p.stallId, p.id));
    toast('已删除'); render();
  });
}

function planTable(rows) {
  return `<div class="pp-table-wrap"><table class="pp-table pc-table">
    <thead><tr><th>需求周期</th><th>状态</th><th>当前询价单</th><th>明细行</th><th>更新时间</th><th class="pc-op">操作</th></tr></thead>
    <tbody>${rows.map(p => {
      const st = planStatusOf(p);
      const q = latestInq(p);
      const inqCell = q
        ? `<span class="pc-inq-no">${esc(q.id)}</span>${INFLIGHT.includes(st.code) ? `<em class="pc-deadline">截止 ${esc(q.reply_deadline)}</em>` : ''}`
        : '<span class="pc-dim">尚未发起</span>';
      const live = p.items || [];
      return `<tr>
        <td><b>${esc(p.from)}</b> ~ <b>${esc(p.to)}</b><i class="pc-days">${daySpan(p.from, p.to)} 天</i>${p.seq > 1 ? `<i class="pc-dup">同期第 ${p.seq} 份</i>` : ''}</td>
        <td><span class="pc-status ${st.cls}">${esc(st.label)}</span></td>
        <td>${inqCell}</td>
        <td>${live.length} 行</td>
        <td class="pc-dim">${esc(p.updated || '—')}</td>
        <td class="pc-op"><button class="mp-secondary" data-pc-open="${esc(p.id)}">查看</button>${
        /* 只有草稿能删：一旦发起过询价（询价中/已截止/已定标）就不再给删除入口，
           避免出现「点了才发现不能删」的死入口 */
        st.code === 'draft' ? `<button class="pc-link danger" data-pc-del="${esc(p.id)}">删除</button>` : ''}</td>
      </tr>`;
    }).join('')}</tbody></table></div>`;
}

/* ============================ 7. 新建计划 ============================ */
function openNewDrawer() {
  const wkStart = monday(today());
  const draft = { from: wkStart, to: add(wkStart, 6) };
  const body = () => `
    <div class="mp-detail-grid">
      <label class="mp-field"><span>需求起始日 <b>*</b></span><input id="pcFrom" type="date" value="${draft.from}"></label>
      <label class="mp-field"><span>需求结束日 <b>*</b></span><input id="pcTo" type="date" value="${draft.to}"></label>
    </div>
  `;

  drawer('新建采购计划', '选周期区间，系统按排餐计划汇总用料（克）', body(),
    `<button class="mp-secondary" id="pcCancel">取消</button><span class="mp-spacer"></span>
     <button class="mp-primary" id="pcCreate">创建并生成商品映射</button>`, true);

  $('#pcFrom').onchange = e => { draft.from = e.target.value; };
  $('#pcTo').onchange = e => { draft.to = e.target.value; };
  $('#pcCancel').onclick = close;
  $('#pcCreate').onclick = () => {
    if (!draft.from || !draft.to) return toast('请填写需求周期');
    if (draft.from > draft.to) return toast('起始日不能晚于结束日');
    if (daySpan(draft.from, draft.to) > 31) return toast('周期最长 31 天，请缩小范围');
    /* 不拦人：区间有交集只做一次强提醒，确认后照建不误 */
    const clashes = overlappedPlans(draft.from, draft.to);
    if (clashes.length) {
      openOverlapDialog(draft, clashes, () => createPlan(draft));
      return;
    }
    createPlan(draft);
  };
}

/* 与本区间有交集（含完全重复）的计划，按开始日排序 */
function overlappedPlans(from, to) {
  return listPlans(MP.scopeKey())
    .filter(p => p.from <= to && from <= p.to)
    .sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to));
}

/* 强提醒：已有相似时间的计划，是否继续 */
function openOverlapDialog(draft, clashes, onOk) {
  const stallName = (MP.stall() || {}).name || '当前档口';
  const stText = st => (planStatusOf(st) || {}).label || '';
  const sameCount = clashes.filter(p => p.from === draft.from && p.to === draft.to).length;
  const lines = clashes.map(p => {
    const q = latestInq(p);
    const st = planStatusOf(p);
    return `<li>
      <b>${esc(p.from)} ~ ${esc(p.to)}</b><i class="pc-ov-days">${daySpan(p.from, p.to)} 天</i>
      <em class="pc-ov-status">${esc(st.label)}</em>
      ${q ? `<span class="pc-ov-inq">${esc(q.id)}</span>` : '<span class="pc-ov-inq dim">未发起询价</span>'}
    </li>`;
  }).join('');

  document.body.insertAdjacentHTML('beforeend', `<div class="modal-mask show" id="pcOverlapMask">
    <div class="modal pc-overlap-modal">
      <div class="pc-ov-head"><i>!</i><div>
        <h3>已有相似时间的采购计划</h3>
        <p>${esc(stallName)} 在 <b>${esc(draft.from)} ~ ${esc(draft.to)}</b> 这段需求周期已有 <b>${clashes.length}</b> 份采购计划${sameCount ? `（其中 ${sameCount} 份区间完全相同）` : '（区间存在交集）'}：</p>
      </div></div>
      <ul class="pc-ov-list">${lines}</ul>
      <p class="pc-ov-note">同一档口的多份计划可以同时存在，互不覆盖：各自独立询价、独立定标，重叠天数不会自动合并或作废已定标结果。若只是想改已有计划，建议直接打开它编辑。</p>
      <div class="modal-foot">
        <button class="cancel" id="pcOvCancel">否，先看看已有的</button>
        <button class="confirm" id="pcOvOk">是，仍要新建</button>
      </div>
    </div>
  </div>`);

  const box = $('#pcOverlapMask');
  const shut = () => { if (box) box.remove(); };
  $('#pcOvCancel').onclick = shut;
  box.onclick = e => { if (e.target === box) shut(); };
  $('#pcOvOk').onclick = () => { shut(); onOk(); };
}

function createPlan(draft) {
  const stallId = MP.scopeKey();
  const all = listPlans(stallId);
  /* 同一区间允许多份：区间标识重复时追加 #2 / #3 */
  const base = planIdOf(draft.from, draft.to);
  let id = base, n = 1;
  while (all.some(p => p.id === id)) { n += 1; id = `${base}#${n}`; }
  const plan = {
    id, seq: n, stallId, from: draft.from, to: draft.to,
    items: [], daily: {}, supplierIds: [], sig: '', createdAt: nowStr(), updated: nowStr()
  };
  regenerate(plan, true);
  close();
  cur = { plan }; view = 'detail'; tab = 'clean'; activeDay = '';
  toast(n > 1
    ? `已新建同期第 ${n} 份计划，商品映射已生成（与原计划互不覆盖）`
    : '商品映射已生成，先选商品，再到「采购明细」按天填预计采购量');
  render();
}

/* ============================ 8. 详情页（三个并列页签） ============================ */
function detailView() {
  const plan = cur.plan;
  plan.items = plan.items || [];
  plan.daily = plan.daily || {};
  ensureDemoItems(plan);          /* 【原型】老计划补上 3 条演示行，不必重建 */
  const st = planStatusOf(plan);
  const locked = !!lockedInqOf(plan);

  page().innerHTML = `
  <section class="mp-card mp-workspace pp-workspace">
    <div class="mp-workspace-head">
      <div>
        <button class="pc-back" id="pcBack">‹ 返回列表</button>
        <h1>${esc(plan.from)} ~ ${esc(plan.to)} <span class="pc-status ${st.cls}">${esc(st.label)}</span>${plan.seq > 1 ? `<i class="pc-dup">同期第 ${plan.seq} 份</i>` : ''}</h1>
        <p>${daySpan(plan.from, plan.to)} 天　·　档口：${esc((MP.stall() || {}).name || '—')}　·　全部餐次</p>
      </div>
    </div>
    <div class="pc-detail-bar">
      <span class="pc-detail-note">${(() => {
        const live = plan.items || [];
        const skus = effectiveSkuCodes(plan);
        const mapped = live.filter(i => i.source !== 'ing' || i.skuCode).length;
        return `${live.length} 项用料　·　${skus.length} 个商品　·　已映射 ${mapped}/${live.length}`;
      })()}</span>
      <span class="mp-spacer"></span>
      ${locked
        ? `<button class="mp-primary" disabled>发起询价</button>`
        : `<button class="mp-primary" id="pcLaunchTop">发起询价</button>`}
    </div>
    <div class="pc-tabs">
      <button class="pc-tab ${tab === 'clean' ? 'on' : ''}" data-pc-tab="clean">商品映射<i class="pc-q" data-tip="这里你可以决定「这个用料买哪个商品」，一次决定作用于所有日期（「采购明细」也可按天微调）；具体哪天买多少，到「采购明细」按天填写。">?</i></button>
      <button class="pc-tab ${tab === 'day' ? 'on' : ''}" data-pc-tab="day">采购明细<i class="pc-q" data-tip="这里你可以调整当天要采购的商品和填写预计采购量，全部填写好后，您点击右上角「发起询价」按钮，选择供应商发起询价">?</i></button>
      <button class="pc-tab ${tab === 'inq' ? 'on' : ''}" data-pc-tab="inq">询价单${latestInq(plan) ? '' : '（未发起）'}</button>
    </div>
    ${tab === 'day' ? dayTabView(plan, { locked })
      : tab === 'inq' ? inqTab(plan)
        : cleanListView(plan, { locked })}
  </section>`;
  mountScope();
  bindDetail(plan, locked);
}

/* —— 页签一「商品映射」：只做映射，不填量 —— */
function cleanListView(plan, { locked }) {
  const items = plan.items || [];   /* 忽略是按天的，这里不参与 —— 商品映射只管"买哪个商品" */
  /* 标准食材排在前面，直挂/手工排在后面；组内按合计克数倒序 */
  const byGram = (a, b) => itemGram(b) - itemGram(a);
  const ings = items.filter(i => i.source === 'ing').sort(byGram);
  const bound = items.filter(i => i.source === 'sku' || i.source === 'manual').sort(byGram);
  const unmapped = ings.filter(i => !i.skuCode).length;
  const q = lockedInqOf(plan);

  const basisBtn = it => `<button class="pc-link" data-basis="${esc(it.key)}">依据</button>`;

  const ingRows = ings.map(it => {
    const hit = it.skuCode ? skuOf(it.skuCode) : null;
    const exc = exceptionDaysOf(plan, it).length;
    const nameCell = `<b>${esc(it.ingName)}</b><i class="pc-tag-kind">标准食材</i>${exc ? `<i class="pc-tag-exc">${exc} 天已单独指定</i>` : ''}`;
    const curCell = hit
      ? `<b>${esc(hit.product.name)}${formTagOf(hit)}</b><i class="pc-sku-name">${esc(hit.sku.spec)} · 下单单位 ${esc(hit.sku.orderUnit)}</i>`
      : '<span class="pc-warn-text">待选择</span>';
    const pick = locked ? '' : (hit
      ? `<button class="pc-link" data-pick="${esc(it.key)}">更换</button>`
      : `<button class="pc-link" data-pick="${esc(it.key)}">选择商品</button>`);
    return `<tr>
      <td>${nameCell}</td>
      <td class="pc-num pc-gram">${fmtGram(itemGram(it))}</td>
      <td>${curCell}</td>
      <td class="pc-op">${pick}${basisBtn(it)}</td>
    </tr>`;
  }).join('');

  const boundRows = bound.map(it => {
    const hit = it.skuCode ? skuOf(it.skuCode) : null;
    const name = hit ? hit.product.name : (it.ingName || '—');
    const kind = it.source === 'manual'
      ? '<i class="mp-tag manual">手工添加</i>'
      : '<i class="pc-tag-kind muted">菜谱直挂</i>';
    const curCell = hit
      ? `<b>${esc(hit.sku.spec)}</b><i class="pc-sku-name">下单单位 ${esc(hit.sku.orderUnit)}</i>`
      : '<span class="pc-dim">—</span>';
    return `<tr>
      <td><b>${esc(name)}${formTagOf(hit)}</b>${kind}</td>
      <td class="pc-num pc-gram">${it.source === 'manual' ? '<span class="pc-dim">—</span>' : fmtGram(itemGram(it))}</td>
      <td>${curCell}</td>
      <td class="pc-op">${basisBtn(it)}${(it.source === 'manual' && !locked) ? `<button class="pc-link danger" data-delitem="${esc(it.key)}">删除</button>` : ''}</td>
    </tr>`;
  }).join('');

  const divider = `<tr class="pc-group-row"><td colspan="4">
    <b>菜谱直挂商品</b><span>菜谱用料已直接绑定 SKU，采购侧无需选择；手工添加的行也归在这里</span>
    <i>${bound.length} 项</i></td></tr>`;

  return `
    ${locked ? `<div class="mp-lock-note pc-lock-note">${q
      ? (effStatus(q) === 'failed'
        ? `本计划已流标「${esc(q.id)}」，本页锁定为只读（终态）。`
        : effStatus(q) === 'awarded'
          ? `本计划已定标「${esc(q.id)}」，本页锁定为只读（终态）。`
          : `询价单「${esc(q.id)}」已发起，本页锁定为只读。`)
      : '本页已锁定为只读。'}</div>` : ''}

    <div class="pc-card">
      <div class="pc-card-head">
        <h3>用料 → 商品映射</h3>
        ${unmapped
          ? `<span class="pc-count warn">${unmapped} 项待映射</span>`
          : '<span class="pc-count ok">已全部映射</span>'}
        <span class="pc-count">${ings.length} 标准食材 · ${bound.length} 直挂</span>
      </div>
      ${items.length ? `<div class="pp-table-wrap"><table class="pp-table pc-table">
        <thead><tr><th>用料 / 商品</th><th class="pc-num">合计克数</th><th>当前商品 / 规格</th><th class="pc-op">操作</th></tr></thead>
        <tbody>${ingRows}${bound.length ? divider + boundRows : ''}</tbody></table></div>`
        : '<p class="pc-empty-line">这段区间没有可用用料。</p>'}
    </div>
  `;
}

/* —— 页签二「采购明细」：按天改映射 + 填量 —— */
function dayTabView(plan, { locked }) {
  const q = lockedInqOf(plan);   /* 锁定原因：已定标 / 已流标 / 已发起询价（都不可撤回） */
  const days = daysOf(plan);
  if (!days.length) {
    return `<div class="mp-empty pp-empty"><b>这段区间没有可用用料</b>
      <p>可能区间内没有排餐，或排餐未保存。请返回列表重新创建采购计划。</p></div>`;
  }
  if (!days.includes(activeDay)) activeDay = days.includes(today()) ? today() : days[0];
  const d = activeDay;
  const list = dayItemsOf(plan, d);
  const ignored = ignoredDayItemsOf(plan, d);
  const dayGram = list.reduce((s, it) => s + gramOfDay(it, d), 0);
  /* 「已填」只算有商品的行走：未映射的行没有输入框，不能算进必填口径 */
  const needRows = list.filter(it => skuOfDay(plan, it, d));
  const filled = needRows.filter(it => qtyOfDay(plan, it, d) > 0).length;

  /* 填量是按天做的：tab 上标出这一天还有几项已映射的商品没填量，
     否则用户在 10-20 填完就以为全部完成，发起时被"其他天没填"拦住 */
  const tabs = days.map(x => {
    const open = dayItemsOf(plan, x).filter(it => skuOfDay(plan, it, x) && !(qtyOfDay(plan, it, x) > 0)).length;
    return `<button class="pc-day-tab ${x === d ? 'on' : ''}" data-pc-day="${x}">${mdOf(x)} ${wdOf(x)}${open
      ? `<i class="pc-day-dot" title="${open} 项还没填预计采购量">${open}</i>` : ''}</button>`;
  }).join('');

  const rows = list.map(it => {
    const skuCode = skuOfDay(plan, it, d);
    const hit = skuCode ? skuOf(skuCode) : null;
    const c = cellOf(plan, it.key, d);
    const override = !!(c && c.skuCode && c.skuCode !== it.skuCode);
    const qty = qtyOfDay(plan, it, d);
    /* 菜谱直挂：采购的就是那个 SKU，不再有独立的「用料名」——
       当日用料与映射商品都显示商品名（规格/下单单位也取这个商品） */
    const bound = it.source === 'sku';
    const showName = bound && hit ? hit.product.name : it.ingName;
    const nameCell = hit
      ? `<b>${esc(hit.product.name)}${formTagOf(hit)}</b>${kindTagOf(it)}${override ? '<i class="pc-tag-day">当日指定</i>' : ''}`
      : `<b class="pc-warn-text">${esc(it.ingName)}</b><i class="pc-tag-map">待映射</i>`;
    const acts = [];
    acts.push(`<button class="pc-link" data-basis="${esc(it.key)}">依据</button>`);
    if (!locked) {
      /* 直挂行的商品是菜谱绑死的，采购侧不给「更换商品」，只能忽略 */
      if (!bound) {
        acts.push(`<button class="pc-link" data-daypick="${esc(it.key)}">更换商品（仅当天）</button>`);
        if (override) acts.push(`<button class="pc-link" data-reset="${esc(it.key)}">恢复默认</button>`);
      }
      acts.push(`<button class="pc-link danger" data-ignore="${esc(it.key)}" data-date="${esc(d)}">忽略（仅当天）</button>`);
    }
    const gram = gramOfDay(it, d);
    return `<tr>
      <td class="pc-gram pc-gram-cell">${it.source === 'manual'
        ? '<span class="pc-dim">—</span>'
        : `<i class="pc-gram-name">${esc(showName)}</i><b>${fmtGram(gram)}</b>`}</td>
      <td>${nameCell}</td>
      <td class="pc-dim">${hit ? esc(hit.sku.spec) : '—'}</td>
      <td class="pc-dim">${hit ? esc(hit.sku.orderUnit) : '—'}</td>
      <td class="pc-num">${locked
        ? `<b>${qty > 0 ? fmtQty(qty) : '—'}</b>`
        : `<input class="pc-qty" data-qty="${esc(it.key)}" data-date="${esc(d)}" type="number" min="0" step="0.01"
             value="${qty > 0 ? fmtQty(qty) : ''}" placeholder="必填" ${hit ? '' : 'disabled'}>`}</td>
      <td class="pc-op">${acts.join('')}</td>
    </tr>`;
  }).join('');

  return `
    ${locked ? `<div class="mp-lock-note pc-lock-note">${q && effStatus(q) === 'failed' ? '本计划已流标，本页锁定为只读（终态）。' : q && effStatus(q) === 'awarded' ? '本计划已定标，本页锁定为只读（终态）。' : '询价单已发起，本页锁定为只读。'}</div>` : ''}
    <div class="pc-day-bar">
      <div class="pc-day-tabs">${tabs}</div>
      <button class="mp-secondary pc-add-goods" id="pcAddRow" ${locked ? 'disabled' : ''}>＋ 添加商品</button>
    </div>
    <div class="pp-table-wrap"><table class="pp-table pc-table pc-day-table">
      <thead><tr>
        <th class="pc-gram-cell">当日用料（克）</th><th>映射商品</th><th>规格</th><th>下单单位</th>
        <th class="pc-num">预计采购量 <b class="pc-req">*</b></th>
        <th class="pc-op">操作</th>
      </tr></thead>
      <tbody>${rows || `<tr><td colspan="6" class="pc-empty-line">${ignored.length
        ? '这一天的用料都被忽略了，可在下方恢复。'
        : '这一天没有用料。可以点右上角「添加商品」补一行。'}</td></tr>`}</tbody>
      <tfoot><tr>
        <td class="pc-gram pc-gram-cell"><i class="pc-gram-name">当日合计</i><b>${fmtGram(dayGram)}</b></td>
        <td colspan="3"></td>
        <td class="pc-num${filled < needRows.length ? ' pc-foot-warn' : ''}">已填 ${filled}/${needRows.length} 项</td>
        <td></td>
      </tr></tfoot>
    </table></div>

    ${ignored.length ? `<div class="pc-day-ignored">
      <div class="pc-day-ignored-head">
        <b>当日已忽略</b>
        <span>${ignored.length} 项　只影响 ${mdOf(d)}，其他日期照常采购</span>
      </div>
      <div class="pp-table-wrap"><table class="pp-table pc-table pc-day-table">
        <thead><tr><th class="pc-gram-cell">当日用料（克）</th><th>映射商品</th><th>规格</th>
          <th>下单单位</th><th class="pc-num">预计采购量</th><th class="pc-op">操作</th></tr></thead>
        <tbody>${ignored.map(it => {
          const skuCode = skuOfDay(plan, it, d);
          const hit = skuCode ? skuOf(skuCode) : null;
          return `<tr>
            <td class="pc-gram pc-gram-cell"><i class="pc-gram-name">${esc(it.source === 'sku' && hit ? hit.product.name : it.ingName)}</i><b>${fmtGram(gramOfDay(it, d))}</b></td>
            <td>${hit ? `<b>${esc(hit.product.name)}${formTagOf(hit)}</b>${kindTagOf(it)}` : `<b class="pc-warn-text">${esc(it.ingName)}</b><i class="pc-tag-map">待映射</i>`}</td>
            <td class="pc-dim">${hit ? esc(hit.sku.spec) : '—'}</td>
            <td class="pc-dim">${hit ? esc(hit.sku.orderUnit) : '—'}</td>
            <td class="pc-num pc-dim">不计入</td>
            <td class="pc-op">${locked ? '<span class="pc-dim">只读</span>'
              : `<button class="pc-link" data-unignore="${esc(it.key)}" data-date="${esc(d)}">恢复当天采购</button>`}</td>
          </tr>`;
        }).join('')}</tbody></table></div>
    </div>` : ''}
    `;
}

/* —— 页签三「询价单」 —— */
function inqTab(plan) {
  const all = inqsOf(plan.stallId, plan.id).slice().sort((a, b) => b.ver - a.ver);
  const top = all[0];
  if (!top) {
    return `<div class="mp-empty pp-empty">
      <b>尚未发起询价</b>
      <p>先到「商品映射」把商品选好，再到「采购明细」按天填好预计采购量，然后点「发起询价」。<br>
      发起后本计划会被锁定，同一时刻只能有 1 份在途询价单。</p>
      <button class="mp-primary" id="pcGoClean">前往商品映射</button></div>`;
  }
  const st = effStatus(top);
  const board = top.suppliers.map(s => {
    const label = { pending: '待报价', quoted: '已报价', timeout: '超时未报价', void: '已作废' }[s.status] || s.status;
    const cls = { pending: 'pending', quoted: 'quoted', timeout: 'timeout', void: 'void' }[s.status] || 'pending';
    return `<div class="pc-sup-card ${cls}"><b>${esc(s.name)}</b><i>${esc(label)}</i>${s.quotedAt ? `<em>${esc(s.quotedAt)}</em>` : ''}</div>`;
  }).join('');
  const left = toTs(top.reply_deadline) - Date.now();
  const leftText = st === 'inquiry'
    ? (left > 0 ? `剩余 ${Math.floor(left / 3600000)} 小时 ${Math.floor((left % 3600000) / 60000)} 分` : '已到截止时间')
    : '—';
  const quoted = top.suppliers.filter(s => s.status === 'quoted').length;

  const lineRows = top.lines.map(l => {
    const got = top.suppliers.filter(s => s.quotes && s.quotes[l.skuCode]).length;
    const byDate = (l.byDate || []).map(x => `${mdOf(x.date)} ${fmtQty(x.qty)}${esc(l.orderUnit)}`).join(' · ');
    /* 定标后在这一行标出最终供应商，否则定标结果在列表里看不到 */
    const awardId = (top.awards || {})[l.skuCode];
    const awardSup = awardId ? (top.suppliers.find(s => s.id === awardId) || {}).name : '';
    return `<tr>
      <td><b>${esc(l.name)}</b>${formTagOfLine(l)}${awardSup ? `<i class="pc-award-tag">已定标 · ${esc(awardSup)}</i>` : ''}${byDate ? `<i class="pc-byday">按天需求：${byDate}</i>` : ''}</td>
      <td class="pc-dim">${esc(l.spec)}</td>
      <td class="pc-dim">${esc(l.orderUnit)}</td>
      <td class="pc-num"><b>${fmtQty(l.qty)}</b></td>
      <td>${got ? `<button class="pc-link pc-ref-link" data-line-quote="${esc(l.skuCode)}">${got} 家已报</button>` : '<span class="pc-dim">尚无报价</span>'}</td>
    </tr>`;
  }).join('');

  return `
    <div class="pc-inq-head">
      <div class="pc-inq-title">
        <h3>${esc(top.id)} <span class="pc-status ${st}">${esc(INQ_STATUS[st] || st)}</span></h3>
        <p>发起：${esc(top.createdAt)}　·　截止：<b>${esc(top.reply_deadline)}</b>　·　${esc(leftText)}</p>
      </div>
      <div class="pc-inq-acts">
        <button class="mp-secondary" id="pcCompare">报价比较</button>
        ${INFLIGHT.includes(st) ? `<button class="mp-secondary" id="pcSim">模拟供应商回价</button>` : ''}
        ${st === 'closed' || st === 'inquiry' ? `<button class="mp-primary" id="pcAward">定标</button>` : ''}
      </div>
    </div>
    <div class="pc-inq-summary">
      <div><span>受邀</span><b>${top.suppliers.length}</b><i>家</i></div>
      <div><span>已报价</span><b>${quoted}</b><i>家</i></div>
      <div><span>超时未报</span><b>${top.suppliers.filter(s => s.status === 'timeout').length}</b><i>家</i></div>
      <div><span>询价行</span><b>${top.lines.length}</b><i>行</i></div>
    </div>
    <div class="pc-sup-board">${board}</div>
    <div class="pp-table-wrap"><table class="pp-table pc-table">
      <thead><tr><th>商品</th><th>规格</th><th>下单单位</th><th class="pc-num">询价数量</th><th>报价回收</th></tr></thead>
      <tbody>${lineRows}</tbody></table></div>`;
}

/* ============================ 9. 报价比较 ============================ */
/* 价格矩阵：行 = 询价行，列 = 受邀供应商。只摊开看，不给推荐结论。 */
function compareHtml(plan, inq, onlySku) {
  if (!inq) return '<div class="mp-empty pp-empty"><b>还没有询价单</b><p>请先发起询价单，再比较报价。</p></div>';
  const st = effStatus(inq);
  const passed = Date.now() >= toTs(inq.reply_deadline);
  const sups = inq.suppliers || [];
  /* onlySku：只摊开这一行（询价单页签里点「N 家已报」进来的），矩阵形状不变 */
  const lines = onlySku ? inq.lines.filter(l => l.skuCode === onlySku) : inq.lines;

  const head = sups.map(s => {
    const quotedN = lines.filter(l => s.quotes && s.quotes[l.skuCode] && s.quotes[l.skuCode].price != null).length;
    return `<th><span class="pc-cmp-sup"><b>${esc(s.name)}</b>
      <i>${s.status === 'timeout' ? '超时未报价' : s.status === 'void' ? '已作废' : s.status === 'quoted' ? '已报价' : '待报价'}
      　已报 ${quotedN}/${lines.length} 项</i></span></th>`;
  }).join('');

  const body = lines.map(l => {
    const prices = sups.map(s => {
      const q = s.quotes && s.quotes[l.skuCode];
      return q && q.price != null ? Number(q.price) : null;
    });
    const valid = prices.filter(p => p != null);
    const low = valid.length ? Math.min(...valid) : null;
    const cells = sups.map((s, i) => {
      const p = prices[i];
      if (p == null) return '<td class="pc-price pc-none">-</td>';
      const isLow = low != null && p === low;
      return `<td class="pc-price ${isLow ? 'pc-low' : ''}">${fmtMoney(p)}</td>`;
    }).join('');
    return `<tr>
      <td><b>${esc(l.name)}</b>${formTagOfLine(l)}</td>
      <td class="pc-dim">${esc(l.spec)}</td>
      <td class="pc-dim">${esc(l.orderUnit)}</td>
      <td class="pc-num"><b>${fmtQty(l.qty)}</b> <i class="pc-unit">${esc(l.orderUnit)}</i></td>
      ${cells}
    </tr>`;
  }).join('');

  const none = (passed && sups.every(s => s.status !== 'quoted'));
  /* 单行视图下：这一行一家都没报时给一句话，别让用户对着一排「-」猜 */
  const lineBare = onlySku && lines.length > 0 && lines.every(l =>
    sups.every(s => !(s.quotes && s.quotes[l.skuCode] && s.quotes[l.skuCode].price != null)));
  return `
    <div class="pc-cmp-head">
      <b>${esc(inq.id)}</b>
      <span class="pc-status ${st}">${esc(INQ_STATUS[st] || st)}</span>
      <em>截止 ${esc(inq.reply_deadline)}　·　${sups.length} 家受邀</em>
    </div>
    <div class="pp-table-wrap"><table class="pp-table pc-table pc-cmp">
      <thead><tr>
        <th>商品</th><th>规格</th><th>下单单位</th><th class="pc-num">合计数量</th>
        ${head}
      </tr></thead>
      <tbody>${body}</tbody>
    </table></div>
    ${lineBare ? '<p class="pc-warn">这一行目前没有任何报价。超时未报价的供应商不会补报；需要重来时请另建一份同期采购计划重新发起。</p>' : ''}
    ${!onlySku && none ? '<p class="pc-warn">本轮所有供应商都没有提交报价（超时未报价）。需要重来时请另建一份同期采购计划重新发起。</p>' : ''}
    <p class="pc-hint">绿色高亮 = 该商品本轮最低价（同价并列高亮）。<b>仅展示，不做推荐结论</b> —— 比价与定标不在本期范围。</p>`;
}

/* —— 单行报价：从询价单明细点「N 家已报」进来，只摊开这一行 —— */
function openLineQuoteDrawer(plan, skuCode) {
  const inq = latestInq(plan);
  if (!inq) return toast('还没有询价单');
  const line = (inq.lines || []).find(l => l.skuCode === skuCode);
  if (!line) return toast('这一行已不在询价单里');
  const byDate = (line.byDate || []).map(x => `${mdOf(x.date)} ${fmtQty(x.qty)}${line.orderUnit}`).join(' · ');
  drawer('报价明细', `${line.name}　${fmtQty(line.qty)} ${line.orderUnit}${byDate ? `　·　按天需求：${byDate}` : ''}`,
    compareHtml(plan, inq, skuCode),
    `<button class="mp-primary" id="pcCmpOk">关闭</button>`, true);
  $('#pcCmpOk').onclick = close;
}

/* —— 依据：这一行的用量具体来自哪几天、哪几餐、哪道菜 —— */
function basisHtml(plan, key, focusDate) {
  const it = itemOf(plan, key);
  if (!it) return '';
  const basis = (it.basis || []).slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const perDate = new Map();
  basis.forEach(b => perDate.set(b.date, (perDate.get(b.date) || 0) + b.gram));
  const rows = basis.length ? basis.map(b => `<tr class="${focusDate && b.date === focusDate ? 'pc-basis-on' : ''}">
      <td><b>${esc(b.date)}</b><i class="pc-sku-name">${esc(wdOf(b.date))}</i></td>
      <td>${esc(b.meal)}</td>
      <td>${esc(b.recipe)}</td>
      <td class="pc-num">${b.pots}</td>
      <td class="pc-num"><b>${fmtGram(b.gram)}</b></td>
      <td class="pc-num pc-dim">${fmtGram(perDate.get(b.date))}</td>
    </tr>`).join('')
    : '<tr><td colspan="6" class="pc-empty-line">这一行没有排餐依据（手工添加的行）。</td></tr>';
  return `<div class="mp-mini-table-wrap"><table class="mp-mini-table">
      <thead><tr><th>日期</th><th>餐次</th><th>菜品</th><th class="pc-num">锅数</th><th class="pc-num">用量（克）</th><th class="pc-num">当日合计</th></tr></thead>
      <tbody>${rows}</tbody></table></div>
     <p class="pc-hint">【口径】用量 = 该用料行的「投料量（克）」× 锅数，<b>「烹饪投料（计入）」与「过程用料」均计入</b>。
     ${focusDate ? `<br>当前查看的 <b>${esc(focusDate)}</b> 已高亮。` : ''}
     系统不做克→箱/袋的折算，买多少、按什么规格买，由采购员依据克数判断。</p>`;
}

function openBasisDrawer(plan, key, focusDate) {
  const it = itemOf(plan, key);
  if (!it) return;
  const hit = it.skuCode ? skuOf(it.skuCode) : null;
  const sub = `${it.ingName}　合计 ${fmtGram(itemGram(it))} 克${hit ? `　·　${hit.product.name}（${hit.sku.spec}）` : ''}`;
  drawer('用料依据', sub, basisHtml(plan, key, focusDate),
    `<button class="mp-primary" id="pcBasisOk">知道了</button>`, true);
  $('#pcBasisOk').onclick = close;
}

function openCompareDrawer(plan) {
  const inq = latestInq(plan);
  if (!inq) return toast('请先发起询价单，再比较报价');
  drawer('报价比较', `${plan.from} ~ ${plan.to}　本轮报价矩阵`, compareHtml(plan, inq),
    `<button class="mp-primary" id="pcCmpOk">关闭</button>`, true);
  $('#pcCmpOk').onclick = close;
}

/* ============================ 10. 动作 ============================ */
function bindDetail(plan, locked) {
  $('#pcBack').onclick = () => { view = 'list'; cur = null; render(); };
  $$('[data-pc-tab]').forEach(b => b.onclick = () => { tab = b.dataset.pcTab; render(); });
  $$('[data-pc-day]').forEach(b => b.onclick = () => { activeDay = b.dataset.pcDay; render(); });

  /* 顶部操作栏：报价比较只在「询价单」页签里出现，避免两处入口 */
  const cmpInq = $('#pcCompare'); if (cmpInq) cmpInq.onclick = () => openCompareDrawer(plan);
  const launchTop = $('#pcLaunchTop'); if (launchTop) launchTop.onclick = () => openLaunchDrawer(plan);

  /* 「依据」两个页签都有，锁定态也可看（纯只读） */
  $$('[data-basis]').forEach(b => b.onclick = () => openBasisDrawer(plan, b.dataset.basis, tab === 'day' ? activeDay : ''));

  if (locked) { afterInqBind(plan); return; }

  $$('[data-pick]').forEach(b => b.onclick = () => openPickDrawer(plan, b.dataset.pick, ''));
  $$('[data-daypick]').forEach(b => b.onclick = () => openPickDrawer(plan, b.dataset.daypick, activeDay));
  $$('[data-reset]').forEach(b => b.onclick = () => {
    const c = cellOf(plan, b.dataset.reset, activeDay);
    if (c) delete c.skuCode;
    plan.updated = nowStr(); savePlan(plan); render(); toast('已恢复为全局商品');
  });
  $$('[data-delitem]').forEach(b => b.onclick = () => {
    const key = b.dataset.delitem;
    plan.items = plan.items.filter(i => i.key !== key);
    pruneDaily(plan); plan.updated = nowStr(); savePlan(plan); render(); toast('已删除该手工行');
  });
  $$('[data-qty]').forEach(inp => {
    inp.oninput = () => {
      const key = inp.dataset.qty, date = inp.dataset.date;
      if (!itemOf(plan, key)) return;
      const v = inp.value.trim();
      ensureCell(plan, key, date).qty = v === '' ? 0 : Math.max(0, Number(v) || 0);
      plan.updated = nowStr(); savePlan(plan);
      /* 只刷新表尾的「已填 N/M」—— 当日克数合计不随填写变化。
         表尾 td 顺序：0 合计标签（colspan=3）/ 1 克数 / 2 已填 / 3 空 */
      const foot = page().querySelector('.pc-day-table tfoot');
      const cells = foot ? foot.querySelectorAll('td') : [];
      if (cells[2]) {
        const rows = dayItemsOf(plan, date).filter(it => skuOfDay(plan, it, date));
        const got = rows.filter(it => qtyOfDay(plan, it, date) > 0).length;
        cells[2].innerHTML = `已填 ${got}/${rows.length} 项`;
        cells[2].classList.toggle('pc-foot-warn', got < rows.length);
      }
    };
  });
  /* 忽略只作用于当天：写当天单元格，不动全局商品映射，也不影响其他日期 */
  $$('[data-ignore]').forEach(b => b.onclick = () => {
    const item = itemOf(plan, b.dataset.ignore); if (!item) return;
    const date = b.dataset.date || activeDay;
    ensureCell(plan, item.key, date).ignored = true;
    plan.updated = nowStr(); savePlan(plan);
    toast(`已忽略「${item.ingName}」，仅 ${mdOf(date)} 不采购；可在当天下方恢复`);
    render();
  });
  $$('[data-unignore]').forEach(b => b.onclick = () => {
    const item = itemOf(plan, b.dataset.unignore); if (!item) return;
    const date = b.dataset.date || activeDay;
    const c = cellOf(plan, item.key, date);
    if (c) { delete c.ignored; if (c.skuCode == null && c.qty == null) delete plan.daily[date][item.key]; }
    plan.updated = nowStr(); savePlan(plan);
    toast(`已恢复「${item.ingName}」在 ${mdOf(date)} 的采购`); render();
  });
  const addRow = $('#pcAddRow'); if (addRow) addRow.onclick = () => openAddRowDrawer(plan, activeDay);
  afterInqBind(plan);
}

function afterInqBind(plan) {
  const sim = $('#pcSim'); if (sim) sim.onclick = () => simulateQuotes(plan);
  const aw = $('#pcAward'); if (aw) aw.onclick = () => openAwardDrawer(plan);
  const go = $('#pcGoClean'); if (go) go.onclick = () => { tab = 'clean'; render(); };
  /* 明细行右侧「N 家已报」→ 只看这一行的报价矩阵 */
  $$('[data-line-quote]').forEach(b => b.onclick = () => openLineQuoteDrawer(plan, b.dataset.lineQuote));
}

/* —— 商品 → SKU 两步选择器 ——
   添加商品与更换商品共用这一套：第一步按 名称 / 加工形态 / 分类 筛商品，
   第二步点 SKU 卡片即时生效（不再有「确定」按钮，少一次点击也少一处状态）。 */
const FORM_OPTIONS = ['毛菜', '净菜', '半成品'];
/* 没有真实商品图，用首字/单位字生成与编码稳定对应的色块，避免出现"演示"字样 */
const toneOf = s => [...String(s)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 7);
const thumbOf = (txt, seed, big) =>
  `<span class="pc-thumb${big ? ' lg' : ''}" style="--h:${toneOf(seed)}">${esc(txt)}</span>`;

function openPicker(cfg, state) {
  const st = Object.assign({ step: 'list', q: '', form: '', cat: '', prod: '' }, state || {});
  const pool = cfg.pool || PRODUCTS;
  /* 分类树只从候选里长出来：更换商品时只列这个食材相关的品类 */
  const catTree = (() => {
    const map = new Map();
    pool.forEach(p => {
      if (!map.has(p.cats[0])) map.set(p.cats[0], new Set());
      map.get(p.cats[0]).add(p.cats[1]);
    });
    return [...map.entries()].map(([top, subs]) => [top, [...subs]]);
  })();
  const matchOf = p => (!st.q || p.name.includes(st.q))
    && (!st.form || p.form === st.form)
    && (!st.cat || p.cats[1] === st.cat);

  const listHtml = () => {
    const hit = pool.filter(matchOf);
    if (!hit.length) {
      return { n: 0, html: '<tr><td colspan="6" class="pc-empty-line">没有符合条件的商品，换个关键词或清掉筛选试试。</td></tr>' };
    }
    return {
      n: hit.length,
      html: hit.map(p => `<tr>
        <td>${thumbOf(p.name.slice(0, 1), p.code)}</td>
        <td><b>${esc(p.name)}</b><i class="pc-sku-name">${esc(p.code)}</i></td>
        <td class="pc-cat-path">${p.cats.map((c, k) =>
          (k ? '<i class="pc-cat-sep">&gt;</i>' : '') + esc(c)).join('')}</td>
        <td><span class="pc-form-tag f-${esc(p.form)}">${esc(p.form)}</span></td>
        <td class="pc-num">${p.skus.length}</td>
        <td class="pc-op"><button class="pc-link" data-pick-prod="${esc(p.code)}">选择</button></td>
      </tr>`).join('')
    };
  };

  /* 候选为空：只留一句说明和取消，不给空筛选（更换商品时可能遇到） */
  if (!pool.length) {
    drawer(cfg.title, cfg.sub,
      `<p class="pc-warn">${esc(cfg.emptyText || '没有可选商品。')}</p>`,
      `<button class="mp-secondary" id="pcPickCancel">取消</button>`, true);
    $('#pcPickCancel').onclick = close;
    return;
  }

  /* —— 第二步：SKU 卡片 —— */
  if (st.step === 'sku') {
    const p = PRODUCT_INDEX[st.prod];
    if (!p) return openPicker(cfg, Object.assign({}, st, { step: 'list' }));
    const cards = p.skus.map(s => {
      const on = cfg.curSku === s.code;
      return `<button class="pc-sku-card${on ? ' on' : ''}" data-pick-sku="${esc(s.code)}">
        ${thumbOf(s.orderUnit, s.code, true)}
        <span class="pc-sku-card-main">
          <b>${esc(s.name)}${on ? '<i class="pc-sku-cur">当前</i>' : ''}</b>
          <span class="pc-sku-card-meta"><em>采购规格</em>${esc(s.spec)}</span>
          <span class="pc-sku-card-meta"><em>下单单位</em>${esc(s.orderUnit)}</span>
        </span>
      </button>`;
    }).join('');

    drawer(cfg.title, cfg.sub,
      `<button class="pc-link pc-add-back" id="pcPickBack">← 返回商品列表</button>
       <div class="pc-add-prod">
         ${thumbOf(p.name.slice(0, 1), p.code)}
         <div><b>${esc(p.name)}</b>
           <span class="pc-add-prod-meta">${esc(p.cat)} · ${esc(p.form)} · ${p.skus.length} 个 SKU</span></div>
       </div>
       <p class="pc-pick-note">${esc(cfg.skuNote || '选一个 SKU。')}</p>
       <div class="pc-sku-cards">${cards}</div>`,
      `<button class="mp-secondary" id="pcPickBack2">返回商品列表</button><span class="mp-spacer"></span>
       <button class="mp-secondary" id="pcPickCancel">取消</button>`, true);

    const back = () => openPicker(cfg, Object.assign({}, st, { step: 'list' }));
    $('#pcPickBack').onclick = back;
    $('#pcPickBack2').onclick = back;
    $('#pcPickCancel').onclick = close;
    $$('[data-pick-sku]').forEach(b => (b.onclick = () => cfg.onPick(b.dataset.pickSku)));
    return;
  }

  /* —— 第一步：筛选 + 商品列表 —— */
  const first = listHtml();
  const opts = (arr, cur) => arr.map(v =>
    `<option value="${esc(v)}"${v === cur ? ' selected' : ''}>${esc(v)}</option>`).join('');

  drawer(cfg.title, cfg.sub,
    `<div class="pc-add-filter">
       <input class="pc-add-search" id="pcAddQ" placeholder="搜索商品名称" value="${esc(st.q)}">
       <select id="pcAddForm"><option value="">全部形态</option>${opts(FORM_OPTIONS, st.form)}</select>
       <select id="pcAddCat"><option value="">全部分类</option>${catTree.map(([top, subs]) =>
         `<optgroup label="${esc(top)}">${subs.map(v =>
           `<option value="${esc(v)}"${v === st.cat ? ' selected' : ''}>${esc(v)}</option>`).join('')}</optgroup>`).join('')}</select>
       <span class="pc-add-count" id="pcAddCount">共 ${first.n} 个商品</span>
     </div>
     <div class="pp-table-wrap"><table class="pp-table pc-table pc-add-table">
       <thead><tr><th>商品图片</th><th>商品名称</th><th>分类</th><th>加工形态</th>
         <th class="pc-num">SKU 数</th><th class="pc-op">操作</th></tr></thead>
       <tbody id="pcAddList">${first.html}</tbody>
     </table></div>
     ${cfg.note ? `<p class="pc-hint">${cfg.note}</p>` : ''}`,
    `<button class="mp-secondary" id="pcPickCancel">取消</button>`, true);

  const paint = () => {
    const r = listHtml();
    const box = $('#pcAddList'); if (box) box.innerHTML = r.html;
    const cnt = $('#pcAddCount'); if (cnt) cnt.textContent = `共 ${r.n} 个商品`;
  };
  const qEl = $('#pcAddQ'); if (qEl) qEl.oninput = () => { st.q = qEl.value.trim(); paint(); };
  const fEl = $('#pcAddForm'); if (fEl) fEl.onchange = () => { st.form = fEl.value; paint(); };
  const cEl = $('#pcAddCat'); if (cEl) cEl.onchange = () => { st.cat = cEl.value; paint(); };
  const cancel = $('#pcPickCancel'); if (cancel) cancel.onclick = close;

  /* 列表会被重绘，按钮用事件委托，否则筛一次就点不动 */
  const listBox = $('#pcAddList');
  if (listBox) listBox.onclick = e => {
    const b = e.target && e.target.closest ? e.target.closest('[data-pick-prod]') : null;
    if (!b) return;
    openPicker(cfg, Object.assign({}, st, { step: 'sku', prod: b.dataset.pickProd }));
  };
}

/* —— 添加商品：只存在于当天的手工行 —— */
function openAddRowDrawer(plan, date, state) {
  openPicker({
    title: '添加商品',
    sub: `加到 ${date}（没有排餐依据，当日用料为空）`,
    skuNote: `选一个 SKU 加进 ${date}。加完回到列表填「预计采购量」（必填）。`,
    note: '【规则】手工添加的商品只存在于这一天，并随本计划一起进入询价单；系统不提供克→箱/袋的折算。',
    onPick: skuCode => {
      const hit = skuOf(skuCode);
      if (!hit) return toast('该 SKU 已失效');
      const key = `manual:${skuCode}:${Date.now()}`;
      plan.items = plan.items || [];
      plan.items.push({ key, source: 'manual', ingName: skuNameOf(skuCode), skuCode, basis: [] });
      ensureCell(plan, key, date);            /* 先把空单元格建出来，列表里才会出现这一行 */
      plan.updated = nowStr(); savePlan(plan);
      close(); render();
      toast(`已添加「${hit.product.name}」，在列表里填预计采购量`);
    }
  }, state);
}

/* —— 更换商品：date 为空 = 改全局映射；给了日期 = 只改那一天 —— */
function openPickDrawer(plan, key, date, state) {
  const item = itemOf(plan, key); if (!item) return;
  const curSku = date ? skuOfDay(plan, item, date) : item.skuCode;
  openPicker({
    title: date ? `更换商品（仅 ${date}）` : '更换商品',
    sub: `${item.ingName}　合计用料 ${fmtGram(itemGram(item))} 克`,
    pool: candidatesOf(item),
    curSku,
    emptyText: '商品库中没有可用商品。可去商品中心创建，或直接忽略该行。',
    skuNote: curSku ? '带「当前」的是这一行现在用的 SKU；换成别的会立即生效。' : '选一个 SKU，选完立即生效。',
    note: `【规则】候选范围是本组织私域商品（已发布 + 启用）。${date
      ? `本次只改 <b>${esc(date)}</b> 这一天，其余天仍用全局商品；可在明细页点「恢复默认」改回。`
      : '选一次会按「档口 × 标准食材」记住，下次自动带出。'}系统<b>不提供克→箱/袋的折算</b>，买多少由采购员依据克数自行判断。`,
    onPick: skuCode => {
      const hit = skuOf(skuCode);
      if (!hit) return toast('该 SKU 已失效');
      if (date) {
        ensureCell(plan, key, date).skuCode = skuCode;
      } else {
        item.skuCode = skuCode;
        if (item.source === 'ing') rememberIngredient(plan.stallId, item.ingName, skuCode);
      }
      plan.updated = nowStr(); savePlan(plan);
      close(); render();
      toast(date ? `已把 ${date} 换成「${hit.product.name}」` : `已换成「${hit.product.name}」`);
    }
  }, state);
}

/* —— 发起询价的前置校验（单独成函数，方便自测） —— */
function launchErrors(plan) {
  /* 只校验"至少要有一天真买"的材料：某天被忽略不算，天天都被忽略才算不参与 */
  const items = (plan.items || []).filter(i => {
    const ds = daysOf(plan).filter(d => i.source === 'manual' ? !!cellOf(plan, i.key, d) : gramOfDay(i, d) > 0);
    return ds.length ? ds.some(d => !ignoredOfDay(plan, i, d)) : true;
  });
  const errs = [];
  if (!items.length) errs.push('没有可采购的用料，无法发起询价');
  const unmapped = items.filter(i => i.source === 'ing' && !i.skuCode);
  if (unmapped.length) errs.push(`还有 ${unmapped.length} 项标准食材未选择商品：${unmapped.slice(0, 5).map(i => i.ingName).join('、')}${unmapped.length > 5 ? ' 等' : ''}`);
  const skus = effectiveSkuCodes(plan);
  /* 预计采购量必填：每天每一条有商品的行都要有量，缺一天都不让发起。
     不买的那天请用「忽略（仅当天）」，而不是留空 —— 留空和"忘了填"系统分不出来。 */
  const allDays = daysOf(plan);
  const need = [];
  allDays.forEach(d => {
    dayItemsOf(plan, d).forEach(it => {
      const sku = skuOfDay(plan, it, d);
      if (!sku) return;                                  /* 未选商品的已在上一条报过 */
      if (!(qtyOfDay(plan, it, d) > 0)) need.push({ date: d, sku, name: skuNameOf(sku) || sku });
    });
  });
  if (need.length) {
    const missDays = [...new Set(need.map(x => x.date))].sort();
    const head = need.slice(0, 5).map(x => `${mdOf(x.date)} ${x.name}`).join('、');
    errs.push(`预计采购量为必填：还有 ${need.length} 项没填（${head}${need.length > 5 ? ' 等' : ''}），涉及 ${missDays.length} 天`);
  }
  if (!skus.length) errs.push('没有任何可询价的商品');
  /* 注意：**不校验供应商**。「选哪几家」是发起抽屉里的输入项，抽屉每开一次才求值一次，
     若把它算进 launchErrors，首次发起时按钮会先被置灰、勾选后又不会重新求值，等于永远发不出去。
     供应商的选择在 #pcLaunchOk 的回调里校验。 */
  return errs;
}

function openLaunchDrawer(plan) {
  const errs = launchErrors(plan);
  const supIds = plan.supplierIds || [];
  const skus = effectiveSkuCodes(plan);
  const def = dtLocal(Date.now() + 24 * 3600 * 1000);

  /* 供应商只剩「选不选」，不再显示覆盖率 —— 能不能收到报价是发起后才知道的事 */
  const supList = SUPPLIERS.map(s => {
    const on = supIds.includes(s.id);
    return `<label class="pc-sup-line ${on ? 'on' : ''}">
      <input type="checkbox" name="pcSup" value="${esc(s.id)}" ${on ? 'checked' : ''}>
      <span>${esc(s.name)}</span>
    </label>`;
  }).join('');

  drawer('发起询价', `${plan.from} ~ ${plan.to}　共 ${skus.length} 个商品`,
    `${errs.length ? `<div class="mp-lock-note">${errs.map(e => `· ${esc(e)}`).join('<br>')}</div>` : ''}
     <label class="mp-field"><span>报价截止时间 <b>*</b></span><input id="pcDeadline" type="datetime-local" min="${dtLocal(Date.now() + 3600 * 1000)}" value="${def}"></label>
     <p class="pc-hint">报价截止时间规则：必须选择当前时间 1 小时以后的时间，以便给予供应商报价缓冲时间。</p>
     <div class="mp-detail-section"><h4>受邀供应商</h4><div class="pc-sup-list">${supList}</div></div>`,
    `<button class="mp-secondary" id="pcLaunchCancel">取消</button><span class="mp-spacer"></span>
     <button class="mp-primary" id="pcLaunchOk" ${errs.length ? 'disabled' : ''}>确认发起</button>`, true);

  $('#pcLaunchCancel').onclick = close;
  $('#pcLaunchOk').onclick = () => {
    const deadline = $('#pcDeadline').value;
    if (!deadline) return toast('请填写报价截止时间');
    /* 规则：至少给供应商留 1 小时缓冲，早于这个时间的截止时间没有意义 */
    if (toTs(deadline) < Date.now() + 3600 * 1000) return toast('报价截止时间需晚于当前时间 1 小时');
    const ids = $$('input[name="pcSup"]:checked').map(i => i.value);
    if (!ids.length) return toast('请至少选择 1 家供应商');
    launchInquiry(plan, ids, deadline.replace('T', ' '));
  };
}

function launchInquiry(plan, supIds, deadline) {
  /* 唯一询价锁：同一份采购计划只允许 1 份询价单（含已定标/已流标的终态），且发出后不可撤回 */
  if (lockedInqOf(plan)) { close(); return toast('该计划已有询价单，不能再发起'); }
  const list = inqsOf(plan.stallId, plan.id);
  const ver = list.reduce((m, x) => Math.max(m, x.ver || 0), 0) + 1;

  /* 按「生效商品 SKU」合并；同一天被覆盖成另一个 SKU 时自然拆成两行 */
  const lines = effectiveSkuCodes(plan)
    .map(code => {
      const hit = skuOf(code); if (!hit) return null;
      const qty = totalQtyOf(plan, code);
      if (!(qty > 0)) return null;
      return {
        skuCode: code, productCode: hit.product.code, name: hit.sku.name,
        form: hit.product.form,
        spec: hit.sku.spec, orderUnit: hit.sku.orderUnit,
        qty, gram: byDateOf(plan, code).reduce((s, x) => s + (x.gram || 0), 0),
        byDate: byDateOf(plan, code)
      };
    })
    .filter(Boolean);

  const d = new Date();
  const inq = {
    id: `INQ${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}${pad2(list.length + 1)}`,
    ver, planId: plan.id, stallId: plan.stallId, status: 'inquiry',
    createdAt: nowStr(), reply_deadline: deadline,
    lines,
    suppliers: supIds.map(id => ({ id, name: (supplierOf(id) || {}).name || id, status: 'pending', quotes: {} }))
  };
  list.push(inq);
  saveInqs(plan.stallId, plan.id, list);
  plan.supplierIds = supIds; plan.updated = nowStr(); savePlan(plan);
  close(); tab = 'inq';
  toast(`询价单 ${inq.id} 已发起，已通知 ${supIds.length} 家供应商`);
  render();
}

/* 【原型】模拟供应商回价：演示"报全 / 报一半 / 完全不报"三种覆盖率 */
function simulateQuotes(plan) {
  const list = inqsOf(plan.stallId, plan.id);
  const inq = list.slice().sort((a, b) => b.ver - a.ver)[0];
  if (!inq || !INFLIGHT.includes(effStatus(inq))) return toast('当前没有在途询价单');
  const ratios = [0.9, 0.55, 0.3, 0, 0];
  inq.suppliers.forEach((s, i) => {
    if (s.status !== 'pending') return;
    const n = Math.floor(inq.lines.length * (ratios[i] ?? 0));
    if (!n) { s.status = 'timeout'; return; }
    inq.lines.slice(0, n).forEach(l => {
      const q = (supplierOf(s.id) || {}).quotes?.[l.productCode];
      const base = q && q.unit === l.orderUnit ? q.price : Number((l.qty * 1.2 + 5).toFixed(2));
      s.quotes[l.skuCode] = { price: Number((base * (1 + (i % 2 ? 0.04 : -0.03))).toFixed(2)), available: true };
    });
    s.status = 'quoted'; s.quotedAt = nowStr();
  });
  saveInqs(plan.stallId, plan.id, list);
  toast('已模拟回收本轮报价（覆盖率高/中/低/无 各一家）');
  render();
}

/* —— 定标：按商品挑最终配送供应商 ——
   有报价的商品排前面（可选供应商），没有任何报价的商品统一沉到下面（不参与定标）。
   参考单价 / 预估总价在没选供应商时显示「-」，选完按该供应商的报价回显。 */
function openAwardDrawer(plan) {
  const list = inqsOf(plan.stallId, plan.id);
  const inq = list.slice().sort((a, b) => b.ver - a.ver)[0];
  if (!inq) return toast('还没有询价单');

  const sups = inq.suppliers || [];
  const priceOf = (l, supId) => {
    const s = sups.find(x => x.id === supId);
    const q = s && s.quotes && s.quotes[l.skuCode];
    return q && q.price != null ? Number(q.price) : null;
  };
  const quotedOf = l => sups.filter(s => priceOf(l, s.id) != null);
  const withQ = inq.lines.filter(l => quotedOf(l).length);
  const bare = inq.lines.filter(l => !quotedOf(l).length);
  /* 0 家报价也允许进定标：全部商品落在「无供应商报价」分组，提交后按流标处理 */

  /* skuCode → supplierId；已有的定标结果带上，便于复查 */
  const pick = Object.assign({}, inq.awards || {});

  const totalOf = () => withQ.reduce((n, l) => {
    const p = pick[l.skuCode] ? priceOf(l, pick[l.skuCode]) : null;
    return n + (p != null ? p * (Number(l.qty) || 0) : 0);
  }, 0);
  const pickedN = () => withQ.filter(l => pick[l.skuCode]).length;

  const selOf = l => {
    const opts = quotedOf(l).map(s => {
      const p = priceOf(l, s.id);
      const on = pick[l.skuCode] === s.id;
      return `<option value="${esc(s.id)}"${on ? ' selected' : ''}>${esc(s.name)}　${fmtMoney(p)}</option>`;
    }).join('');
    return `<select class="pc-award-sel" data-award-sku="${esc(l.skuCode)}">
      <option value="">请选择供应商</option>${opts}</select>`;
  };

  const cellsOf = (l, hasQ) => {
    const supId = pick[l.skuCode];
    const price = hasQ && supId ? priceOf(l, supId) : null;
    const qty = Number(l.qty) || 0;
    const amount = price != null ? price * qty : null;
    return `<td class="pc-dim">${esc(l.spec)}</td>
      <td class="pc-dim">${esc(l.orderUnit)}</td>
      <td class="pc-num"><b>${fmtQty(l.qty)}</b> <i class="pc-unit">${esc(l.orderUnit)}</i></td>
      <td class="pc-num pc-price">${price != null ? fmtMoney(price) : '<span class="pc-dim">-</span>'}</td>
      <td class="pc-num pc-price">${amount != null ? fmtMoney(amount) : '<span class="pc-dim">-</span>'}</td>
      <td class="pc-op">${hasQ ? selOf(l) : '<span class="pc-dim">无可选供应商</span>'}</td>`;
  };

  const bodyHtml = () => {
    const rowsQ = withQ.map(l => `<tr data-award-row="${esc(l.skuCode)}">
      <td><b>${esc(l.name)}</b>${formTagOfLine(l)}</td>${cellsOf(l, true)}</tr>`).join('');
    const rowsB = bare.map(l => `<tr class="pc-award-bare">
      <td><b>${esc(l.name)}</b>${formTagOfLine(l)}</td>${cellsOf(l, false)}</tr>`).join('');
    return `${rowsQ}${bare.length ? `<tr class="pc-group-row"><td colspan="7">
        <b>无供应商报价</b><span>${bare.length} 个商品本轮没有任何供应商报价，不参与定标</span></td></tr>${rowsB}` : ''}`;
  };

  const sumText = () =>
    `已选 ${pickedN()}/${withQ.length} 个商品　·　预估总价 ${fmtMoney(totalOf())}`;

  drawer('定标', `${inq.id}　${sups.filter(s => s.status === 'quoted').length} 家报价　·　${inq.lines.length} 个商品`,
    `<div class="pc-award-bar">
       <button class="mp-primary" id="pcPickLowest">一键选择价格最低的供应商</button>
       <button class="mp-secondary" id="pcClearAward">清空供应商</button>
       <span class="mp-spacer"></span>
       <span class="pc-award-sum" id="pcAwardSum">${sumText()}</span>
     </div>
     <div class="pp-table-wrap"><table class="pp-table pc-table pc-award-table">
       <thead><tr><th>商品</th><th>规格</th><th>下单单位</th><th class="pc-num">采购量</th>
         <th class="pc-num">参考单价（元）</th><th class="pc-num">预估总价（元）</th><th class="pc-op">操作</th></tr></thead>
       <tbody id="pcAwardBody">${bodyHtml()}</tbody>
     </table></div>
     <p class="pc-hint">【规则】参考单价 = 该供应商本轮报的价格；预估总价 = 采购量 × 参考单价。
     只对有报价的商品定标，一家都没报的商品不会出现在可选项里；
     <b>未选择供应商的商品视为不采购</b>（不会进入正式订单），因此一个供应商都不选也能提交定标；
     <b>定标后即为终态，不可修改</b>。</p>`,
    `<button class="mp-secondary" id="pcAwardCancel">取消</button><span class="mp-spacer"></span>
     <button class="mp-primary" id="pcAwardOk">确认定标</button>`, true);

  const box = $('#pcAwardBody');
  const paint = () => {
    if (box) box.innerHTML = bodyHtml();
    const sum = $('#pcAwardSum'); if (sum) sum.textContent = sumText();
  };

  /* 下拉是每次重绘出来的，用事件委托绑在 tbody 上 */
  if (box) box.onchange = e => {
    const sel = e.target && e.target.closest ? e.target.closest('[data-award-sku]') : null;
    if (!sel) return;
    if (sel.value) pick[sel.dataset.awardSku] = sel.value;
    else delete pick[sel.dataset.awardSku];
    paint();
  };

  $('#pcPickLowest').onclick = () => {
    withQ.forEach(l => {
      let best = null, bestPrice = null;
      quotedOf(l).forEach(s => {
        const p = priceOf(l, s.id);
        if (bestPrice == null || p < bestPrice) { best = s.id; bestPrice = p; }
      });
      if (best) pick[l.skuCode] = best;
    });
    paint();
    toast(`已按最低价选好 ${pickedN()} 个商品，可再逐个调整`);
  };

  /* 清空：所有商品回到「请选择供应商」，价格两列一起回到 - */
  $('#pcClearAward').onclick = () => {
    const had = pickedN();
    Object.keys(pick).forEach(k => delete pick[k]);
    paint();
    toast(had ? `已清空 ${had} 个商品的供应商` : '当前还没有选择供应商');
  };

  $('#pcAwardCancel').onclick = close;

  /* 提交前按「无报价 / 未选供应商」两种情况给强提醒；两种都没有就直接提交。
     若一个商品都没选上，就不存在「其他商品」，尾句换成「不会生成正式订单」。 */
  const askAward = () => {
    const bareN = bare.length;                       // 本轮无人报价的商品
    const unpickedN = withQ.length - pickedN();      // 有报价但没选供应商的商品
    if (!bareN && !unpickedN) return doAward();
    const nothing = pickedN() === 0;                 // 全部定不上 → 一张订单都生成不了

    const span = n => `<b>${n}</b> 个商品`;
    const head = bareN && unpickedN
      ? `当前定标有 ${span(bareN)}无供应商报价，有 ${span(unpickedN)}未选择供应商，`
      : bareN
        ? `当前定标有 ${span(bareN)}无供应商报价，`
        : `当前定标有 ${span(unpickedN)}未选择供应商，`;
    const tail = nothing
      ? '本轮没有任何商品可以定标，提交后将会按流标处理，是否确认？'
      : bareN && unpickedN
        ? '这些商品均不采购，其他商品将锁定定标结果（本期不生成订单），是否确认？'
        : bareN
          ? '无法采购，其他商品将锁定定标结果（本期不生成订单），是否确认？'
          : '将视为不采购，其他商品将锁定定标结果（本期不生成订单），是否确认？';
    const msg = head + tail;

    document.body.insertAdjacentHTML('beforeend', `<div class="modal-mask show" id="pcAwardMask">
      <div class="modal pc-overlap-modal">
        <div class="pc-ov-head"><i>!</i><div>
          <h3>${nothing ? '本次定标没有可采购的商品' : '定标结果需要你确认'}</h3>
          <p>${msg}</p>
        </div></div>
        <div class="modal-foot">
          <button class="cancel" id="pcAwardBack">我再看看</button>
          <button class="confirm" id="pcAwardYes">确认</button>
        </div>
      </div>
    </div>`);
    const m = $('#pcAwardMask');
    const shut = () => { if (m) m.remove(); };
    $('#pcAwardBack').onclick = shut;
    m.onclick = e => { if (e.target === m) shut(); };
    $('#pcAwardYes').onclick = () => { shut(); doAward(); };
  };

  const doAward = () => {
    const won = pickedN();
    inq.awards = pick;
    /* 0 个商品成交 = 流标：本轮询价作废，计划进「已流标」终态 */
    inq.status = won ? 'awarded' : 'failed';
    inq.awardedAt = nowStr();
    if (!won) inq.failedAt = inq.awardedAt;
    saveInqs(plan.stallId, plan.id, list);
    close();
    toast(won
      ? `已定标：${won} 个商品　预估总价 ${fmtMoney(totalOf())}`
      : `本轮无成交商品，询价单 ${inq.id} 已流标（本期不生成订单）`);
    render();
  };

  $('#pcAwardOk').onclick = askAward;
}


/* ============================ 11. 导出 & 启动 ============================ */
window.MerchantPurchase = {
  enter, render,
  previewOf, listPlans, effStatus, latestInq, inflightOf, lockedInqOf, planStatusOf,
  /* 派生口径（对外只读，供自测/联调核对） */
  deriveRows: deriveItems, deriveItems, buildItems,
  gramOfDay, skuOfDay, qtyOfDay, totalQtyOf, byDateOf, hasException, exceptionDaysOf, daysOf, dayItemsOf,
  compareHtml, launchErrors,
  /* 自测钩子（仅原型联调使用，不参与业务） */
  __debug: { page, listView, detailView, cleanListView, dayTabView, inqTab, createPlan, regenerate,
             basisHtml, openBasisDrawer, compareHtml, openAddRowDrawer, openPickDrawer, openPicker, openNewDrawer, previewOf, launchInquiry, openLaunchDrawer, openCompareDrawer, openLineQuoteDrawer, simulateQuotes, openAwardDrawer,
             savePlan, inqsOf, saveInqs, savePlanKey: savePlan, weekPlanOf, ensureCell, cellOf, ignoredOfDay, ignoredDayItemsOf, effectiveSkuCodes,
             /* 日期 tab 的选中态是模块内的，联调时可读写 */
             getActiveDay: () => activeDay, setActiveDay: d => { activeDay = d; },
             PRODUCTS, SKU_INDEX, SUPPLIERS, itemsOf: plan => plan.items || [] },
  /* 测试/联调用：清掉本模块的三份数据（不动排餐计划） */
  resetAll: () => {
    const kill = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && (k.startsWith(PLAN_PREFIX) || k.startsWith(INQ_PREFIX) || k.startsWith(MAP_PREFIX))) kill.push(k);
    }
    kill.forEach(lsDel);
    toast('采购计划数据已重置');
    render();
  },
  /* 【演示/联调】把某个标准食材恢复成「未关联商品」：映射记忆 + 计划行 + 按天覆盖三处一起清。
     只改数据不改口径，之后在「商品映射」里重新选商品即可（选完会写回映射记忆）。
     用法：MerchantPurchase.unmap('南瓜') */
  unmap: (ingName) => {
    const name = String(ingName || '').trim();
    const stallId = MP.scopeKey();
    if (!stallId) { toast('请先选择档口'); return null; }
    if (!name) { toast('请给出标准食材名，例如 MerchantPurchase.unmap(\'南瓜\')'); return null; }
    const mapKey = `${MAP_PREFIX}:${stallId}`;
    const map = lsGet(mapKey) || {};
    const before = map[name] || '';
    delete map[name];
    lsSet(mapKey, map);
    let rows = 0, cells = 0, plans = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || k.indexOf(`${PLAN_PREFIX}:${stallId}:`) !== 0) continue;
      const p = lsGet(k);
      if (!p || !p.items) continue;
      plans++;
      p.items.forEach(it => { if (it.key === `ing:${name}` && it.skuCode) { it.skuCode = ''; rows++; } });
      Object.keys(p.daily || {}).forEach(d => {
        const c = (p.daily[d] || {})[`ing:${name}`];
        if (c && c.skuCode) { delete c.skuCode; cells++; }
      });
      lsSet(k, p);
    }
    /* 当前正打开的计划重新读一遍，页面立刻反映（不用手动刷新） */
    if (cur && cur.plan) {
      const fresh = listPlans(cur.plan.stallId).find(p => p.id === cur.plan.id);
      if (fresh) cur.plan = fresh;
    }
    toast(before
      ? `「${name}」已恢复为未关联商品（清空 ${rows} 个计划行、${cells} 处按天覆盖）`
      : `「${name}」本来就没有映射记录（检查了 ${plans} 份计划）`);
    render();
    return { ingName: name, before, rows, cells, plans };
  }
};
})();
