/* 商户端 · 计划管理 —— 排餐计划 V3
   计算口径（V3：按锅数正推用量，再反算这个餐次能满足多少人）：
     每锅基准投料 Q = 菜谱 BOM 的「一锅」量（克）——纯人工菜与含设备菜同一口径，都按一锅填写
     投料用量总量   = Q × 锅数
     出餐成品总量   = 投料用量总量 × 出餐成品系数
     人均用餐量     = 每个「星期几 × 餐次」格子填写（克/人）
     预计就餐人数   = 该餐次所有菜的出餐成品总量合计 ÷ 人均用餐量
     每行用量       = 该行投料 × k，k = 锅数
   V3 起排餐与生产计划**不联动**：排餐不读写生产状态/现场调整，锅数在排餐侧确定，
   生产计划只按已保存的排餐派生（见 merchant-production-plan-v1.js）。
   本模块同时向它暴露共享数据层 window.MerchantPlan */
(() => {
'use strict';

const $   = (s, r = document) => r.querySelector(s);
const $$  = (s, r = document) => [...r.querySelectorAll(s)];
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
const clone = v => JSON.parse(JSON.stringify(v));

/* ============================ 1. 常量 ============================ */

const MEALS = ['早餐', '早点', '午餐', '午点', '晚餐', '夜宵'];
const DAYS  = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
const OPEN_TIME  = { 早餐: '06:30', 早点: '09:30', 午餐: '11:30', 午点: '15:00', 晚餐: '17:30', 夜宵: '21:00' };

const PAGES = ['#organizationPage', '#rolesPage', '#adminsPage', '#usersPage', '#recipePage',
               '#dishCategoryPage', '#deviceRecipePage', '#productCenterPage', '#mealPlanPage', '#productionPlanPage',
               '#purchasePlanPage', '#stallPage'];

/* ============================ 2. 菜谱主数据 ============================ */
/* 字段：bom 用料明细（用料角色 + 标准食材 + 投料量 + 单位 + 投料状态 + 切配方式 + 选项）
        第 7 项 opts 对应租户端菜谱 v2.0 的两个新口径：
          { sku: 'SKU 编码' }  该用料**直挂商品 SKU**（采购计划直接回显，不让采购员再选商品）
          { include: false }   该用料属「过程用料（不计入投料）」—— 采购计划**不取**
        没有 opts = 标准食材 + 计入投料（默认口径）
        steps 设备加工步骤（设备型号 + 单锅时长秒；单锅产能挂在设备型号主数据上）
        steps 为空 => 纯人工菜，不进生产计划 */

const dishArt = (name, index) => `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${['#f5a85f','#dc6f55','#f0c76b','#65b7a4','#80b96a'][index % 5]}"/><stop offset="1" stop-color="#fff1d8"/></linearGradient></defs><rect width="320" height="240" rx="18" fill="url(#g)"/><ellipse cx="160" cy="128" rx="108" ry="76" fill="#fff" opacity=".92"/><ellipse cx="160" cy="128" rx="82" ry="52" fill="#f4d089"/><circle cx="130" cy="112" r="18" fill="#d9583b"/><circle cx="180" cy="139" r="22" fill="#74a953"/><circle cx="190" cy="103" r="14" fill="#f0a13a"/><text x="160" y="218" text-anchor="middle" font-family="Microsoft YaHei,sans-serif" font-size="25" font-weight="700" fill="#59432d">${name}</text></svg>`)}`;

/* 设备主数据：单锅产能（额定容量）挂在设备型号上，不挂在菜谱上 */
/* —— 设备型号主数据：厂家 + 型号 拼成唯一标识，capacity 为该型号的额定容量（kg/锅）—— */
const DEVICE_MODELS = [
  { maker: '智谷', model: 'A8',     capacity: 12 },
  { maker: '智谷', model: 'ZG-T30', capacity: 30 },
  { maker: '优特', model: 'UT-C16', capacity: 15 },
  { maker: '优特', model: 'UT-P40', capacity: 14 }
];
const deviceLabel = (maker, model) => `${maker} ${model}`;            // 厂家 + 型号
const DEVICES = Object.fromEntries(DEVICE_MODELS.map(d => [deviceLabel(d.maker, d.model), d.capacity]));
const deviceCapacity = d => DEVICES[d] ?? 0;
const deviceOf = label => DEVICE_MODELS.find(d => deviceLabel(d.maker, d.model) === label) || null;
const deviceMaker = label => (deviceOf(label) || {}).maker || String(label).split(' ')[0];
const deviceModel = label => (deviceOf(label) || {}).model || String(label).split(' ').slice(1).join(' ');

/* 用料单位折算：克/千克为质量，毫升/升按 1 g/ml 折算；个/只/条/份/适量折不了，不进合计但照常按倍数放大 */
const GRAM = { g: 1, kg: 1000, ml: 1, L: 1000 };
const toGram = (qty, unit) => (GRAM[unit] != null ? qty * GRAM[unit] : null);

/* 用料角色 / 食材 / 数量 / 单位 / 投料状态 / 切配 */
const RAW = {
  /* —— 含设备加工：用料按「一批」配置，单位统一 g —— */
  /* 「腌制用盐」「焯水用料酒」是典型的过程用料：同一道菜里与投料重复登记，
     计入投料就会把采购量抬高，所以标 include:false（v2.0 口径） */
  CP001: [ '宫保鸡丁', '热菜 / 小荤', 'V3',
    [['主料', '鸡胸肉', 7200, 'g', '已切配', '切丁'],
     ['主料', '花生米', 1800, 'g', '原始', '—'],
     ['辅料', '黄瓜', 2400, 'g', '已切配', '切丁'],
     ['调料', '生抽', 400, 'g', '已调制', '—', { sku: 'SKU000601' }],
     ['调料', '香油', 200, 'g', '已调制', '—'],
     ['调料', '食盐', 50, 'g', '原始', '—', { include: false }]],
    [['预热炒锅', '智谷 A8', 60], ['主料炒制', '智谷 A8', 180], ['酱汁投放', '智谷 A8', 20]] ],
  CP002: [ '红烧肉', '热菜 / 大荤', 'V4',
    [['主料', '五花肉', 9000, 'g', '已切配', '切块'],
     ['主料', '土豆', 3600, 'g', '已切配', '滚刀块'],
     ['调料', '生抽', 1200, 'g', '已调制', '—', { sku: 'SKU000601' }],
     ['调料', '冰糖', 900, 'g', '已调制', '—', { sku: 'SKU000801' }],
     ['调料', '料酒', 300, 'g', '已调制', '—'],
     ['调料', '料酒', 300, 'g', '原始', '—', { include: false }]],
    [['煸炒上色', '优特 UT-C16', 240], ['焖煮收汁', '优特 UT-C16', 600]] ],
  CP004: [ '紫菜蛋花汤', '汤粥 / 汤类', 'V2',
    [['辅料', '饮用水', 22000, 'g', '原始', '—'],
     ['主料', '鸡蛋', 6000, 'g', '原始', '—'],
     ['主料', '紫菜', 1500, 'g', '原始', '—'],
     ['调料', '食盐', 400, 'g', '已调制', '—'],
     ['调料', '香油', 100, 'g', '已调制', '—']],
    [['批量煮制', '智谷 ZG-T30', 420]] ],
  CP006: [ '葱油拌面', '主食 / 面食', 'V1',
    [['主料', '面条', 9000, 'g', '原始', '—'],
     ['调料', '生抽', 2100, 'g', '已调制', '—', { sku: 'SKU000601' }],
     ['主料', '葱油', 1400, 'g', '已预制', '—'],
     ['调料', '白糖', 800, 'g', '已调制', '—'],
     ['辅料', '小葱', 700, 'g', '已切配', '切段']],
    [['煮面', '优特 UT-P40', 150], ['拌制', '优特 UT-P40', 60]] ],
  CP007: [ '小米南瓜粥', '汤粥 / 粥类', 'V1',
    [['辅料', '饮用水', 21000, 'g', '原始', '—'],
     ['主料', '南瓜', 4800, 'g', '已切配', '切块'],
     ['主料', '小米', 4000, 'g', '原始', '—'],
     ['调料', '冰糖', 200, 'g', '已调制', '—', { sku: 'SKU000801' }]],
    [['熬煮', '智谷 ZG-T30', 1800]] ],
  CP009: [ '土豆烧牛肉', '热菜 / 大荤', 'V3',
    [['主料', '牛肉', 7000, 'g', '已切配', '切块'],
     ['主料', '土豆', 4500, 'g', '已切配', '滚刀块'],
     ['调料', '生抽', 1400, 'g', '已调制', '—', { sku: 'SKU000601' }],
     ['调料', '料酒', 700, 'g', '已调制', '—'],
     ['调料', '食盐', 400, 'g', '已调制', '—'],
     ['调料', '料酒', 200, 'g', '原始', '—', { include: false }]],
    [['焯水', '智谷 ZG-T30', 120], ['烧制', '优特 UT-P40', 900]] ],

  /* —— 纯人工：用料同样按「一锅」配置，与含设备菜同一口径（一锅量决定出餐成品量）——
     一锅约 5.7–7.0kg（大锅菜），排餐里「锅数」就是做几锅 */
  CP003: [ '番茄炒蛋', '热菜 / 半荤半素', 'V2',
    [['主料', '番茄', 4000, 'g', '已切配', '切块'],
     ['主料', '鸡蛋', 2600, 'g', '原始', '—'],
     ['调料', '食用油', 300, 'ml', '原始', '—', { sku: 'SKU000901' }],
     ['调料', '食盐', 80, 'g', '已调制', '—']], [] ],
  CP005: [ '清炒时蔬', '热菜 / 素菜', 'V5',
    [['主料', '时令蔬菜', 6000, 'g', '已切配', '切段'],
     ['调料', '食用油', 400, 'ml', '原始', '—', { sku: 'SKU000901' }],
     ['调料', '食盐', 100, 'g', '已调制', '—']], [] ],
  CP008: [ '鸡蛋饼', '主食 / 点心', 'V2',
    [['主料', '面粉', 3000, 'g', '原始', '—'],
     ['主料', '鸡蛋', 2400, 'g', '原始', '—'],
     ['调料', '食用油', 250, 'ml', '原始', '—', { sku: 'SKU000901' }],
     ['调料', '食盐', 60, 'g', '已调制', '—']], [] ],
  CP010: [ '水果拼盘', '其他 / 水果', 'V1',
    [['主料', '哈密瓜', 4000, 'g', '已切配', '切块'],
     ['主料', '圣女果', 3000, 'g', '已切配', '对半切']], [] ]
};

const recipes = Object.entries(RAW).map(([id, r], i) => {
  const [name, category, version, bom, steps] = r;
  const bomRows = bom.map(([role, ingredient, qty, unit, inputState, cut, opt]) =>
    ({ role, ingredient, qty, unit, inputState, cut, ...(opt || {}) }));
  const stepRows = steps.map(([stepName, device, seconds]) => ({ stepName, device, seconds }));
  const q = bomRows.reduce((s, b) => s + (toGram(b.qty, b.unit) ?? 0), 0);
  return {
    id, name, category, version, bom: bomRows, steps: stepRows,
    image: dishArt(name, i),
    device: stepRows.length ? [...new Set(stepRows.map(s => s.device))].join('、') : '—',
    hasDevice: stepRows.length > 0,
    capacity: stepRows.length ? deviceCapacity(stepRows[0].device) : 0,
    batchGram: q,                                   // 一锅基准投料量 Q（克），只算能折成质量的行
    hasUnmeasurable: bomRows.some(b => toGram(b.qty, b.unit) === null)
  };
});

const findRecipe = id => recipes.find(r => r.id === id);

/* 菜谱标准出餐成品系数 r0（原型模拟值），仅作为排餐时的默认值 */
const YIELD_DEFAULT = { CP001: 88, CP002: 82, CP003: 92, CP004: 95, CP005: 90, CP006: 93, CP007: 96, CP008: 91, CP009: 84, CP010: 98 };
recipes.forEach(r => { r.yieldDefault = YIELD_DEFAULT[r.id] || 90; });

/* ============================ 3. 日期工具 ============================ */

const ld = d => { const x = new Date(d); x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0, 10); };
const today = () => ld(new Date());
const add = (d, n) => { const x = new Date(d + 'T00:00:00'); x.setDate(x.getDate() + n); return ld(x); };
const monday = d => { const x = new Date(d + 'T00:00:00'), n = (x.getDay() + 6) % 7; x.setDate(x.getDate() - n); return ld(x); };
const dayIndex = d => (new Date(d + 'T00:00:00').getDay() + 6) % 7;
const range = d => `${d} - ${add(d, 6)}`;
const fmt = d => d.slice(5).replace('-', '/');
/* 分钟 → HH:MM。**先取整**：排程算出来的分钟数会带浮点尘埃
   （例：17:00 可能存成 1019.9999999999999），不取整就会打出「16:60」这种非法时间，
   而它会被写进 <input type="time"> 的 value，浏览器直接判为无效 */
const hm = min => {
  const m = Math.round(min);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};
const toMin = t => { const [h, m] = String(t).split(':').map(Number); return h * 60 + m; };
const fmtKg = v => `${(Math.round(v * 10) / 10).toFixed(1).replace(/\.0$/, '')}kg`;
/* 用料数量显示：内部一律按原单位保留，只在展示时进位（≥1000g → kg，≥1000ml → L） */
const trimNum = v => String(Math.round(v * 100) / 100);
const fmtQty = (qty, unit) => {
  const n = Math.round(qty * 100) / 100;
  if (unit === 'g' || unit === 'kg') { const g = unit === 'g' ? n : n * 1000; return g >= 1000 ? `${trimNum(g / 1000)} kg` : `${trimNum(g)} g`; }
  if (unit === 'ml' || unit === 'L') { const ml = unit === 'ml' ? n : n * 1000; return ml >= 1000 ? `${trimNum(ml / 1000)} L` : `${trimNum(ml)} ml`; }
  return `${trimNum(n)} ${unit}`;
};
/* 菜谱原值显示：按菜谱配置的单位原样展示，不做进位 —— 设备菜的用料单位统一为 g，就必须显示成 g */
const fmtRawQty = (qty, unit) => `${trimNum(qty)} ${unit}`;
/* 本次用量统一显示（PC 端）：一律折成质量后给双单位 `{克数}g（{千克数}kg）`。
   不再按 1000g 分档 —— 同一列里「9 kg」与「300 g」混排，核对用量的人得来回换算。
   计数单位（个/只/条/份/适量）没有质量口径，保持原单位显示。
   手机端（merchant-mobile.js）暂用旧口径 usageText，待其单独同步后再切到本函数。 */
const fmtUsageQty = (qty, unit) => {
  const gram = toGram(qty, unit);
  if (gram === null) return `${trimNum(qty)} ${unit}`;
  const g = Math.round(gram * 100) / 100;
  const kg = Math.round((g / 1000) * 100) / 100;
  return `${trimNum(g)}g（${trimNum(kg)}kg）`;
};
/* 入锅投料总量：展示精度与用料行（2 位）对齐，避免「把本次用量列加起来比它多 0.01」 */
const fmtKg2 = v => `${(Math.round(v * 100) / 100).toFixed(2).replace(/\.?0+$/, '')}kg`;
/* 人均配量统一收敛到 3 位小数（0.001 kg = 1 g）—— 录入、存储、展示同一口径，所见即所存 */

const weekValue = d => {
  const x = new Date(monday(d) + 'T00:00:00'), j = new Date(x.getFullYear(), 0, 4),
        f = new Date(monday(ld(j)) + 'T00:00:00'), w = Math.round((x - f) / 604800000) + 1;
  return `${x.getFullYear()}-W${String(w).padStart(2, '0')}`;
};
const fromWeek = v => {
  const [y, w] = v.replace('W', '').split('-').map(Number), j = new Date(y, 0, 4), f = new Date(monday(ld(j)) + 'T00:00:00');
  f.setDate(f.getDate() + (w - 1) * 7); return ld(f);
};

/* ============================ 4. 计划存储 ============================ */

const org = () => $('#currentOrganization')?.textContent.trim() || '';

/* 计划只挂在**档口**上：档口 id 就是计划分片键（组织由档口带出来）。
   切换器把当前范围写在 #currentStall 上，手机端同结构；本模块只读不算。 */
const stallId = () => (window.MerchantScope?.current().stallId) || $('#currentStall')?.dataset.stallId || '';
const stall = () => (window.MerchantStalls && stallId() ? window.MerchantStalls.get(stallId()) : null);
/* 可排餐次 = 该档口在「档口管理」里配的经营餐次（切到档口后收敛）；没选档口时给全量，只有总览用得到 */
const meals = () => { const s = stall(); return s && s.meals.length ? s.meals.map(m => m.meal) : MEALS.slice(); };

/* 档口在「档口管理」里为该餐次配的「预计人均用餐量」（克/人）—— 排餐计划这一格默认值的来源。
   选填项：没配、配成非正数时返回 null，调用方回落到原有默认口径（沿用上周 / 内置演示值）。 */
const stallMealGram = m => {
  const s = stall();
  const hit = s && Array.isArray(s.meals) ? s.meals.find(x => x.meal === m) : null;
  const g = Number(hit && hit.gram);
  return Number.isFinite(g) && g > 0 ? g : null;
};
const scopeKey = () => stallId();

/* 范围令牌 = 组织 + 档口。组织层（没选档口）时 scopeKey() 都是空串，
   只看档口的话「组织层里换组织」会被判成没变化 —— 页面会停在上一份数据上（标题和卡片还是旧组织） */
const scopeToken = () => `${(window.MerchantScope && window.MerchantScope.current() ? window.MerchantScope.current().orgId : '') || org() || ''}|${scopeKey()}`;

const blank = () => Object.fromEntries(DAYS.map((_, i) => [i, Object.fromEntries(MEALS.map(m => [m, []]))]));

/* 原型示例排餐（按星期几给菜）。刻意压这几件事：
   ① 每个餐次 1–4 道，不再是「一餐一道」，用来验证待排排序 / 时间轴多块并存；
   ② 同一餐次里有两道菜抢同一台设备 —— 周三午餐的 CP009（焯水）与 CP004 都在智谷 ZG-T30；
   ③ 设备菜与纯人工菜混排，且**周五晚餐全是人工菜**（生产计划应为 0 道，验证过滤）；
   ④ 周三午餐含 CP002（种子里的「生产中」）与 CP001（周二午餐「生产完成」），两端的示例状态都指向真实存在的菜。 */
const SEED_WEEK = [
  { 早餐: ['CP007', 'CP008'],                        早点: ['CP008', 'CP007'], 午餐: ['CP001', 'CP009', 'CP005', 'CP002'], 午点: ['CP010', 'CP008'], 晚餐: ['CP006', 'CP004', 'CP003'], 夜宵: ['CP006', 'CP004'] },
  { 早餐: ['CP007', 'CP010'],                        早点: ['CP007', 'CP008'], 午餐: ['CP001', 'CP002', 'CP005'],           午点: ['CP008', 'CP010'], 晚餐: ['CP009', 'CP006', 'CP003'], 夜宵: ['CP004', 'CP006'] },
  { 早餐: ['CP007', 'CP006', 'CP008'],               早点: ['CP008', 'CP010'], 午餐: ['CP002', 'CP001', 'CP009', 'CP004', 'CP005'], 午点: ['CP010', 'CP007'], 晚餐: ['CP004', 'CP006', 'CP003'], 夜宵: ['CP006', 'CP004'] },
  { 早餐: ['CP007', 'CP008'],                        早点: ['CP007', 'CP008'], 午餐: ['CP009', 'CP002', 'CP004', 'CP005'], 午点: ['CP008', 'CP010'], 晚餐: ['CP001', 'CP006', 'CP003'], 夜宵: ['CP004', 'CP006'] },
  { 早餐: ['CP007', 'CP010'],                        早点: ['CP008', 'CP007'], 午餐: ['CP001', 'CP002', 'CP005'],           午点: ['CP010', 'CP008'], 晚餐: ['CP003', 'CP008', 'CP010'], 夜宵: ['CP006', 'CP004'] },
];

const seed = () => {
  const s = blank();
  /* 只排该档口的经营餐次：档口只管早餐，就不会种出一份带午餐/晚餐的计划，
     否则那些菜在周排餐表上看不见、却会流进生产计划 */
  const allow = meals();
  SEED_WEEK.forEach((day, i) => MEALS.forEach(m => { if (day[m] && allow.includes(m)) s[i][m] = day[m].slice(); }));
  return s;
};

/* 人均用餐量（克/人）：一餐吃多少克，按餐次给演示默认值。
   取代了 V2 的「就餐人数」——V3 里人数是算出来的结果，不是输入 */
const DEFAULT_MEAL_GRAM = { 早餐: 300, 早点: 200, 午餐: 500, 午点: 250, 晚餐: 450, 夜宵: 300 };
/* 种子锅数参照的「这一餐大约供多少人」，只为让演示数字落在合理区间 */
const SEED_TARGET_PEOPLE = { 早餐: 120, 早点: 40, 午餐: 300, 午点: 60, 晚餐: 260, 夜宵: 40 };

/* 出餐成品系数：只读，取菜谱标准值（V3 起不再逐格手改，避免同一道菜在不同格子口径不一） */
const yieldOf = id => (findRecipe(id)?.yieldDefault ?? 90);
/* 一锅出餐成品量（kg）= 一锅基准投料 Q × 出餐成品系数（菜谱标准值，只读） */
const potOutputKg = id => { const r = findRecipe(id); return r ? (batchGram(r) * yieldOf(id)) / 100 / 1000 : 0; };
/* 种子锅数 = 这道菜要承担的成品量 ÷ 一锅成品量（收敛到 1–9 锅） */
const seedPots = (id, m, n) => {
  const per = (SEED_TARGET_PEOPLE[m] || 100) * (DEFAULT_MEAL_GRAM[m] || 400) / 1000 / Math.max(1, n);
  return Math.max(1, Math.min(9, Math.round(per / (potOutputKg(id) || 1)) || 1));
};

const makePlan = (start, schedule = blank()) => {
  const p = { id: `PC${start.replaceAll('-', '')}`, start, activeDays: [0, 1, 2, 3, 4, 5, 6], schedule,
              perMeal: {}, pots: {}, adjustments: {}, updated: '' };
  Object.keys(schedule).forEach(d => MEALS.forEach(m => {
    const ids = schedule[d][m] || [];
    if (!ids.length) return;
    /* 人均用餐量的默认值：优先取档口配置，否则用内置演示默认值（都不打角标） */
    const sg = stallMealGram(m);
    p.perMeal[`${d}|${m}`] = sg
      ? { gram: sg, memo: '', src: 'stall' }
      : { gram: DEFAULT_MEAL_GRAM[m] || 400, memo: '' };
    ids.forEach(id => { if (findRecipe(id)) p.pots[`${d}|${m}|${id}`] = seedPots(id, m, ids.length); });
  }));
  return p;
};

/* ============================ 4b. 本地存储（原型的「服务端」） ============================
   原型是纯静态页、没有后端，但「电脑上提前排好餐、车间用手机看今天的排餐」要求两端看到**同一份数据** ——
   所以排餐计划落 localStorage：同一浏览器同源即可共享
   （演示时开两个标签，一个桌面宽、一个手机宽，数据就是通的），将来换成服务端只需换这一层。
   生产状态与现场调整从 V3 起归生产计划自己存（本模块不再读写），两边只有「已保存的排餐」这一份共享数据。
   STORE_V 进 key：种子或结构一变，旧的本地数据自动失效，不会让上一版计划伪装成本轮的 bug。 */
const STORE_V = 'v4';   /* v4：人均用餐量默认值改为优先引用档口配置（v3 是按锅数正推用量），旧本地数据自动失效 */
const lsGet = k => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 配额满/隐私模式：忽略 */ } };
const planKey = (k, start) => `mp:plan:${STORE_V}:${k}:${start}`;

const stores = {};
/* 每周一份、按周起始日分别存 —— 否则跨周（周日排下周的餐、周一再看本周）会把改动整片丢掉 */
function loadOrSeedPlan(o, start, isCurrent) {
  const saved = lsGet(planKey(o, start));
  if (saved && saved.schedule && saved.start) return saved;
  const p = makePlan(start, seed());
  p.activeDays = [0, 1, 2, 3, 4];
  if (isCurrent) {
    p.updated = '2026-09-16 09:30';
    p.adjustments = { 2: [{ time: '10:15', meal: '午餐', type: '新增', detail: '清炒时蔬', reason: '临时增加配菜', operator: '张晓东' }] };
  } else {
    p.updated = start === add(monday(today()), -7) ? '2026-09-12 16:20' : '2026-09-05 15:40';
  }
  /* 种子当场落盘：组织层总览与手机端都按 store 读这一档口/这一周的计划，
     只放在内存里的话，明明排了餐的档口在总览里会显示成「本周未排餐」 */
  if (o) lsSet(planKey(o, start), p);
  return p;
}
function plans() {
  const k = scopeKey();
  if (!k) return [];                       /* 组织层 = 各档口总览，自己不是一份计划数据 */
  if (!stores[k]) {
    const m = monday(today());
    stores[k] = [0, -7, -14].map(off => loadOrSeedPlan(k, add(m, off), off === 0));
  }
  return stores[k];
}
/* 落盘：只在排餐这一份数据上写（生产状态/现场调整由生产计划自己那套 key 管） */
const persistPlans = () => { const k = scopeKey(); if (!k) return; (stores[k] || []).forEach(p => lsSet(planKey(k, p.start), p)); };
const persist = () => persistPlans();

let week = monday(today()), edit = false, current = null, buffers = {}, activeOrg = org(), activeScope = scopeToken(), switchBypass = false;

/* ============================ 5. 沿用（查上周同一格） ============================

   口径：**上周同星期几 + 同餐次 + 同菜**。
   人均用餐量：本周四午餐还没填过 → 带出上周四午餐的值（同星期几 + 同餐次）。
   锅数：只当**兜底**用 —— 桌面端新增菜谱一律从 1 锅起（复制过来删掉再加也不带回上周的锅数），
   只有手机端新增、以及给历史数据补锅数（ensurePots）才回查上周同格。

   为什么不再另存一套「记忆表」：这两个值本来就躺在上一周那份计划里（按周分片落盘），
   再按「组织 × 菜谱」「组织 × 餐次」存一份，等于同一件事记两遍；一旦保存时全量回写，
   来源日期就会飘到用户根本没碰过的那一格。直接查上周那份计划，简单、可解释、无状态。

   找不到（上周那格没这道菜，或者有但值为空）→ 不带入、不提示，锅数落 1 锅。 */

const prevWeekOf = p => plans().find(x => x.start === add(p.start, -7)) || null;
const inheritedPerMeal = (p, d, m) => {
  const x = prevWeekOf(p)?.perMeal?.[`${d}|${m}`];
  return x && x.gram ? x.gram : null;
};
const inheritedPots = (p, d, m, id) => {
  const n = prevWeekOf(p)?.pots?.[`${d}|${m}|${id}`];
  return n ? n : null;
};
const inheritedLabel = (d, m) => `上周${DAYS[d].replace('周', '')} ${m}`;   // 上周四 午餐

/* ============================ 6. 计算口径 ============================ */

/* 锅数 / 人均用餐量：都在排餐侧确定，直接决定用量 —— 不存在「先定人数再反推」的路径 */
const potsOf      = (p, d, m, id) => p?.pots?.[`${d}|${m}|${id}`] || 0;
const perMealOf   = (p, d, m) => p?.perMeal?.[`${d}|${m}`]?.gram || 0;

/* 投料用量总量（kg）= 一锅基准投料 Q × 锅数（每行用量 = 该行投料 × 锅数，见 usageOf） */
const inputTotalKg = (p, d, m, id) => { const r = findRecipe(id); return r ? (batchGram(r) * potsOf(p, d, m, id)) / 1000 : 0; };
/* 出餐成品总量（kg）= 投料用量总量 × 出餐成品系数（只读跟随菜谱） */
const outputKg = (p, d, m, id) => inputTotalKg(p, d, m, id) * yieldOf(id) / 100;
/* 一个餐次（某天某一餐）的成品合计与预计就餐人数 —— 需求 5 的两个数 */
const mealOutputKg = (p, d, m) => (p?.schedule?.[d]?.[m] || []).reduce((s, id) => s + outputKg(p, +d, m, id), 0);

/* ===== 就餐人数测算口径 =====
   汤粥米面这类菜不该算进「这个餐次能满足多少人吃」。开关放在「菜谱管理 → 菜谱分类」页，
   按二级分类逐项设置，商户级一份，缺省全部计入（没配过 = 全开）。
   口径只作用于「预计满足 N 人就餐」：出餐合计、荤素统计、锅数、生产计划都不受影响。 */
const CAT_SKIP_KEY = 'mp:catskip:v1';
const catSecond = id => (findRecipe(id)?.category || '').split(' / ')[1] || '';
/* 同分类聚合（排餐规则）：格子里的菜按固定分类顺序排在一起 ——
   荤类（大荤 → 小荤 → 半荤半素）→ 素菜 → 汤类/粥类/面食/点心/水果 → 其它二级分类 → 未分类。
   组内保持原有先后（先加的仍在同组前面）；其它二级分类之间按首次出现顺序。
   加菜/换菜、打开页面（切周/切范围）、复制排餐都走这一处，口径只有一份。 */
const CAT_ORDER = ['大荤', '小荤', '半荤半素', '素菜', '汤类', '粥类', '面食', '点心', '水果'];
function groupByCategory(ids) {
  const list = (ids || []).slice();
  const firstSeen = new Map();
  list.forEach(id => { const sec = catSecond(id); if (!firstSeen.has(sec)) firstSeen.set(sec, firstSeen.size); });
  const last = CAT_ORDER.length + firstSeen.size + 1;          /* 没有二级分类的排最后 */
  return list
    .map((id, i) => {
      const sec = catSecond(id), fixed = CAT_ORDER.indexOf(sec);
      const rank = fixed >= 0 ? fixed : (sec ? CAT_ORDER.length + firstSeen.get(sec) : last);
      return { id, i, rank };
    })
    .sort((a, b) => a.rank - b.rank || a.i - b.i)
    .map(x => x.id);
}
let skipCache = null;                                   /* 每次进页面重读一次，切页回来即时生效 */
function readCatSkip() {
  try {
    const raw = JSON.parse(localStorage.getItem(CAT_SKIP_KEY) || '{}');
    return new Set(Array.isArray(raw?.excluded) ? raw.excluded.filter(Boolean) : []);
  } catch (e) { return new Set(); }
}
const skipCats = () => (skipCache ||= readCatSkip());
const refreshCatPolicy = () => { skipCache = null; };
/* ===== 历史定格 =====
   规则：开关只影响**今日及未来**的日期。每个日期在保存时把当时的开关状态记进 catSkipDates，
   日期一旦进入历史，就按当时记下的口径算 —— 之后无论怎么拨开关，历史排餐的就餐人数都不变。
   没记录过的日期（种子数据、开启本功能之前保存的计划）按「全部分类都计入」处理。 */
const frozenCats = (p, date) => new Set(Array.isArray(p?.catSkipDates?.[date]) ? p.catSkipDates[date] : []);
const skipForDate = (p, date) => (!p || !date ? skipCats() : date < today() ? frozenCats(p, date) : skipCats());
const skipFor = (p, d) => skipForDate(p, add(p?.start || week, +d));
/* 保存时给「今日及未来」的日期打上当前口径；过去的日期保持原样不动 */
function freezeCats(p) {
  const list = [...skipCats()];
  (p.catSkipDates ||= {});
  for (let i = 0; i < 7; i++) { const dt = add(p.start, i); if (dt >= today()) p.catSkipDates[dt] = list; }
}
/* 只累加「计入统计」的菜；全被排除时自然为 0 */
const countedOutputKg = (p, d, m) => {
  const skip = skipFor(p, d);
  return (p?.schedule?.[d]?.[m] || []).reduce((s, id) => s + (skip.has(catSecond(id)) ? 0 : outputKg(p, +d, m, id)), 0);
};
const feedCountOf = (p, d, m) => { const g = perMealOf(p, d, m); return g > 0 ? Math.floor(countedOutputKg(p, d, m) * 1000 / g) : 0; };
/* 这一格的菜里被排除掉的二级分类（回显用） */
function skippedInMeal(p, d, m) {
  const skip = skipFor(p, d), out = [];
  (p?.schedule?.[d]?.[m] || []).forEach(id => {
    const sec = catSecond(id);
    if (!sec || !skip.has(sec)) return;
    const x = out.find(o => o.name === sec);
    x ? x.n++ : out.push({ name: sec, n: 1 });
  });
  return out;
}
/* 人数那一行的三种状态统一在这里出：格子里和「边输边算」共用同一份文案 */
/* 别处（桌面菜谱分类页）改了开关：其它页签/手机端重读一次，正在看的表立即重画 */
window.addEventListener('storage', e => {
  if (e.key !== CAT_SKIP_KEY) return;
  refreshCatPolicy();
  const pg = $('#mealPlanPage');
  if (pg && !pg.hidden) render();
});

function feedState(p, d, m) {
  if (!perMealOf(p, d, m)) return { text: '待填人均用餐量', cls: ' todo' };
  if (countedOutputKg(p, d, m) <= 0) return { text: '本餐次菜品不计入就餐人数统计', cls: ' excluded' };
  return { text: `预计满足 ${feedCountOf(p, d, m)} 人就餐`, cls: '' };
}

/* 菜谱分类统计（需求 7）：荤 = 大荤/小荤/半荤半素，素 = 素菜，其余（汤类/粥类/面食/点心/水果…）按二级分类单列。
   统计的是「这个餐次这一天的菜」，跟着格子里的菜谱实时变 */
const MEAT_CATS = ['大荤', '小荤', '半荤半素'];
function catTally(p, d, m) {
  const out = [];
  const add = name => { const x = out.find(o => o.name === name); x ? x.n++ : out.push({ name, n: 1 }); };
  (p?.schedule?.[d]?.[m] || []).forEach(id => {
    const second = (findRecipe(id)?.category || '').split(' / ')[1] || '';
    if (!second) return;
    add(MEAT_CATS.includes(second) ? '荤' : second === '素菜' ? '素' : second);
  });
  /* 荤、素排最前，其余按出现顺序，读起来跟「荤 2 · 素 1 · 汤类 1」一致 */
  const rank = n => (n === '荤' ? 0 : n === '素' ? 1 : 2);
  return out.sort((a, b) => rank(a.name) - rank(b.name)).map(o => `${o.name} ${o.n}`).join(' · ');
}
/* 单锅产能取设备型号主数据上的额定容量，菜谱本身不维护产能 */
/* 换设备 = 把原本挂在「菜谱默认设备（步骤第一台）」上的步骤整体挪到新设备上。
   下面的两个 helper 是这套挪动的唯一实现，排餐与手机端共用，避免两处口径分叉 */
const effDeviceOf = (r, deviceOverride, dev) => {
  const orig = r.steps[0]?.device || '';
  return (deviceOverride && deviceOverride !== orig && dev === orig) ? deviceOverride : dev;
};
const effDevices = (r, deviceOverride) => [...new Set(r.steps.map(s => effDeviceOf(r, deviceOverride, s.device)))];
/* 锅数 = ⌈W ÷ 设备额定容量⌉。一道菜可能跨多台设备，每台都得装得下 —— 取所有设备的锅数最大值。
   只看一台设备的产能会漏掉其它步骤：焯水落在小设备上时那一锅装不下 */
const potCountFor = (r, inputKg, deviceOverride) => {
  if (!r || !inputKg) return 1;
  const caps = effDevices(r, deviceOverride).map(deviceCapacity).filter(Boolean);
  return caps.length ? Math.max(1, ...caps.map(c => Math.ceil(inputKg / c))) : 1;
};

/* 装载口径：前几锅装满、尾锅装余量 —— 不是均分。
   后厨不会把一批料平均摊到每锅：菜谱 BOM 是「一批」的量，均分会让每锅都要按
   非整数倍折算整张 BOM（宫保鸡丁 10.91kg ÷ 一批 12kg = 0.909 倍），没法执行。
   装满取「最小占用设备的额定容量」：同一份料要走完所有步骤，得让每台都装得下。
   由 锅数 = max⌈W÷C⌉ = ⌈W÷Cmin⌉ 可证 尾锅量 = W −(锅数−1)×Cmin ∈ (0, Cmin]，恒不为负也不超上限。
   尾锅量**不预先取整**：一旦取整，「满锅量 × 满锅数 ＋ 尾锅量 = W」就不再精确成立，
   逐行每锅投料也跟着偏。展示层按 2 位收即可。
   人为主观多开锅（锅数 > 最少锅数）时「装满」会把后面几锅留空 → 尾锅变负数，
   这种情况退回均分（每锅 = W ÷ 锅数），并用 even 标出来。 */
const potLoadOf = (r, inputKg, deviceOverride, potsOverride) => {
  const caps = r ? effDevices(r, deviceOverride).map(deviceCapacity).filter(Boolean) : [];
  const cap = caps.length ? Math.min(...caps) : 0;
  const minPots = cap && inputKg ? Math.max(1, Math.ceil(inputKg / cap)) : 1;
  const pots = potsOverride || potCountFor(r, inputKg, deviceOverride);
  const even = pots > minPots;
  const fullPots = even ? 0 : Math.max(0, pots - 1);
  const tail = even
    ? (pots ? (inputKg || 0) / pots : 0)
    : (cap ? inputKg - fullPots * cap : (inputKg || 0));
  return {
    pots, cap, minPots, even, fullPots, tail,
    overCap: !even && !!cap && tail > cap + 1e-9     // 人工把锅数改小到一锅装不下
  };
};

/* 用料换算的通用口径：Q = 基准批次量（能折成质量的行之和，单位克）；k = 本次要几份配方 */
const batchGram = r => r?.batchGram || 0;
const factorOf = (r, inputKg) => { const Q = batchGram(r); return Q > 0 && inputKg > 0 ? (inputKg * 1000) / Q : 0; };
const usageOf = (r, inputKg) => {
  const Q = batchGram(r), k = factorOf(r, inputKg);
  return r.bom.map(b => {
    const gram = toGram(b.qty, b.unit);
    return {
      role: b.role, ingredient: b.ingredient, qty: b.qty, unit: b.unit, gram,
      counted: gram !== null,                                   // 是否计入基准批次量
      ratio: gram !== null && Q ? gram / Q : null,
      usage: k ? b.qty * k : 0,
      usageText: k ? fmtQty(b.qty * k, b.unit) : '—',                 // 旧口径：≥1000g 进位成 kg（手机端仍在用）
      usageTextDual: k ? fmtUsageQty(b.qty * k, b.unit) : '—',        // 新口径：统一 g + kg 双单位（PC 端本次用量列）
      inputState: b.inputState, cut: b.cut
    };
  });
};
const taskDurationSec = (id, potCount) => {
  const r = findRecipe(id); if (!r) return 0;
  return r.steps.reduce((s, x) => s + potCount * x.seconds, 0);
};
/* 单台设备的加工时长：只算挂在这台设备上的步骤（一道菜跨多台设备时，
   生产计划要按设备分行给出各自的时长，合计才是 taskDurationSec） */
const deviceDurationSec = (id, device, potCount) => {
  const r = findRecipe(id); if (!r) return 0;
  return r.steps.filter(x => x.device === device).reduce((s, x) => s + potCount * x.seconds, 0);
};

/* 首次进入某菜（本周这一格还没有锅数）：查**上周同一格**的锅数。
   找不到就落 1 锅 —— 锅数是必填的用量驱动项，不能留空（留空的话这道菜用量为 0，
   出餐成品总量与预计人数都会被它带偏） */
function ensurePots(p, d, m, id) {
  (p.pots ||= {});
  const key = `${d}|${m}|${id}`;
  if (p.pots[key]) return p.pots[key];
  const n = inheritedPots(p, d, m, id) || 1;
  p.pots[key] = n;
  return n;
}

/* ============================ 7. 页面骨架 ============================ */

function page(id, cls) {
  let p = $(id);
  if (!p) { p = document.createElement('div'); p.id = id.slice(1); p.className = `page-view ${cls}`; p.hidden = true; $('.main').appendChild(p); }
  return p;
}
const mealPage = () => page('#mealPlanPage', 'mp-page');
/* 以 DOM 为准隐藏所有页面视图 —— 别依赖手写页面清单：
   清单一旦漏项（新加的采购计划页就漏过），上个页面的内容会残留在新页面下面。 */
const hideAllPages = () => { $$('.page-view').forEach(x => { x.hidden = true; }); };
const hideAll = nav => {
  PAGES.forEach(s => { const x = $(s); if (x) x.hidden = true; });
  hideAllPages();
  $$('.nav-child').forEach(x => x.classList.toggle('active', x === nav));
};
const saved = w => plans().find(p => p.start === w);
const historical = () => week < monday(today());
const dirty = () => Object.keys(buffers).length > 0;
function load(w) {
  week = monday(w);
  const live = saved(week);
  current = clone(buffers[week] || live || makePlan(week));
  current.perMeal ||= {}; current.pots ||= {}; current.adjustments ||= {};
  /* 每一格按同分类聚合重排一次：种子数据、旧存档、上周复制过来的都能一进来就对齐新规则 */
  Object.values(current.schedule || {}).forEach(byMeal => Object.keys(byMeal || {}).forEach(m => { byMeal[m] = groupByCategory(byMeal[m]); }));
}
function mark() { current.updated = ''; buffers[week] = clone(current); }
/* 范围（组织/档口）变了：丢掉未保存缓冲，但**保留正在看的这一周** ——
   在组织层翻到下一周、点卡片「进入排餐」时，时间上应该接着停在那一周，而不是被拉回本周 */
function reset() { activeOrg = org(); activeScope = scopeToken(); edit = false; buffers = {}; current = null; }

/* ============================ 8. 共享抽屉 / 提示 ============================ */

function mask() {
  if ($('#mpMask')) return;
  document.body.insertAdjacentHTML('beforeend',
    '<div class="mp-mask" id="mpMask"><aside class="mp-drawer"><div class="mp-drawer-head"><div><h2 id="mpDrawerTitle"></h2><p id="mpDrawerSub"></p></div><button class="mp-close" id="mpClose">×</button></div><div class="mp-drawer-body" id="mpDrawerBody"></div><div class="mp-drawer-foot" id="mpDrawerFoot"></div></aside></div>');
  $('#mpClose').onclick = close;
  $('#mpMask').onclick = e => { if (e.target.id === 'mpMask') close(); };
}
function drawer(title, sub, body, foot, wide = false) {
  mask();
  $('#mpDrawerTitle').textContent = title; $('#mpDrawerSub').textContent = sub;
  $('#mpDrawerBody').innerHTML = body; $('#mpDrawerFoot').innerHTML = foot;
  $('#mpMask .mp-drawer').classList.toggle('wide', wide);
  $('#mpMask').classList.add('show');
}
const close = () => $('#mpMask')?.classList.remove('show');
function toast(msg) {
  const o = $('#toast');
  if (o) { o.textContent = msg; o.classList.add('show'); setTimeout(() => o.classList.remove('show'), 1800); return; }
  const n = document.createElement('div');
  n.className = 'um-toast'; n.textContent = msg; document.body.appendChild(n);
  setTimeout(() => n.remove(), 1800);
}

/* ============================ 9. 排餐计划渲染 ============================ */

function enter() {
  hideAll($('#mealPlanNav')); mealPage().hidden = false;
  refreshCatPolicy();                               /* 分类开关可能在菜谱管理页被改过 */
  if (activeScope !== scopeToken()) reset();        /* 范围变了（组织/档口）：丢掉缓冲，正在看的周保持不变 */
  if (scopeKey()) load(week);                       /* 组织层没有计划可加载，走各档口总览 */
  render();
}

function render() {
  workspace();
}

/* 组织层：不是一份计划，而是「该组织各档口」的入口 —— 计划只挂在档口上 */
function stallOverview() {
  const list = (window.MerchantStalls && window.MerchantScope) ? window.MerchantStalls.listByOrg(window.MerchantScope.current().orgId) : [];
  /* 卡片上的排餐数、以及下面的「本周/该周」措辞，都跟着正在看的那一周走
     （在组织层翻到下一周时，卡片统计的也应该是下一周，别再说「本周」） */
  const cards = list.map(s => {
    const saved0 = lsGet(planKey(s.id, week));
    const count = saved0 ? Object.values(saved0.schedule || {}).reduce((n, byMeal) => n + Object.values(byMeal).flat().length, 0) : 0;
    const owner = s.owner && s.owner.name ? `${s.owner.name}${s.owner.phone ? ' · ' + s.owner.phone : ''}` : '未指定负责人';
    return `<div class="mp-so-card" data-so-stall="${esc(s.id)}">
      <h4>${esc(s.name)}</h4>
      <p class="mp-so-owner">负责人：${esc(owner)}</p>
      <div class="mp-so-meals">${s.meals.map(m => `<span>${esc(m.meal)} ${esc(m.start)}–${esc(m.end)}</span>`).join('')}</div>
      <div class="mp-so-foot">${count ? `<b>已排 ${count} 道菜</b>` : '<b>未排餐</b>'}<span class="mp-so-enter">进入排餐 ›</span></div>
    </div>`;
  }).join('');
  const sp = saved(week), changed = !!buffers[week];
  mealPage().innerHTML = `
  <section class="mp-card mp-workspace">
    <div class="mp-workspace-head">
      <div><h1>排餐计划</h1><p>排餐按档口进行：先选档口，再安排该档口各餐次的菜谱与出品量</p></div>
    </div>
    <div class="mp-week-toolbar">
      <button class="mp-week-nav" id="mpPrev">‹&nbsp; 上一周</button>
      <label class="mp-week-picker" title="选择周"><span>▣</span><b>${range(week)}</b><input id="mpWeekPicker" type="week" value="${weekValue(week)}"></label>
      <button class="mp-week-nav" id="mpNext">下一周&nbsp; ›</button>
      ${week !== monday(today()) ? '<button class="mp-week-back" id="mpToday">↻&nbsp; 回到本周</button>' : ''}
    </div>
    <div class="mp-week-meta">${changed ? '有未保存修改' : sp?.updated ? `已保存 · 最近更新：${sp.updated}` : '当前为组织层 · 选择档口后排餐'}</div>
    <div class="mp-section mp-stall-overview">
      <div class="mp-section-head"><div class="mp-week-heading"><h2>${esc(org() || '当前组织')}的档口</h2><span class="mp-so-tip">排餐情况</span></div></div>
      ${list.length ? `<div class="mp-so-grid">${cards}</div>` : '<p class="mp-so-empty">暂无档口，请先创建档口</p>'}
    </div>
  </section>`;
  const bc = $('.breadcrumb'); if (bc) bc.innerHTML = '计划管理&nbsp; / &nbsp;<strong>排餐计划</strong>';
  bind();
  bindWeekFixed();
  mountScope();
  $$('[data-so-stall]').forEach(card => card.onclick = () => window.MerchantScope?.setStall(card.dataset.soStall));
}

/* 标题行下面的组织/档口切换器（四个业务页统一样式）。
   默认停在「全部档口（总览）」：排餐计划是组织层的各档口入口，进来先看这一周各档口排了没有，
   要改哪一家再从卡片「进入排餐 ›」或切换器选进去（选了之后就不会被默认值拉回总览）。
   编辑模式下范围锁定：正在改的这一档口/这一周不能被切走 —— 切了就会有「改的是 A、看的是 B」的错觉 */
function mountScope() {
  const head = mealPage().querySelector('.mp-workspace-head');
  if (head) window.MerchantScope?.mount(head, { stall: true, defaultAll: true, locked: !!edit, lockHint: edit ? '编辑中，保存或取消后可切换' : '' });
}

function workspace() {
  if (!scopeKey()) return stallOverview();          /* 组织层：各档口总览，不排餐 */
  const p = current || load(week), old = historical();
  const removed = DAYS.map((n, i) => !p.activeDays.includes(i) ? `<button class="mp-restore-chip" data-restore-day="${i}">＋ 恢复${n}</button>` : '').join('');
  const sp = saved(week), changed = !!buffers[week];

  mealPage().innerHTML = `
  <section class="mp-card mp-workspace">
    <div class="mp-workspace-head">
      <div><h1>排餐计划</h1><p>按自然周安排每天各餐次的菜谱与锅数，并测算可满足的就餐人数</p></div>
      <div class="mp-mode-actions">${edit
        ? '<button class="mp-secondary" id="mpCancelEdit">取消</button><button class="mp-primary" id="mpSave">保存</button>'
        : `<button class="mp-primary" id="mpEdit" ${old ? 'disabled' : ''}>编辑</button>`}</div>
    </div>
    <div class="mp-week-toolbar">
      <button class="mp-week-nav" id="mpPrev">‹&nbsp; 上一周</button>
      <label class="mp-week-picker" title="选择周"><span>▣</span><b>${range(week)}</b><input id="mpWeekPicker" type="week" value="${weekValue(week)}"></label>
      <button class="mp-week-nav" id="mpNext">下一周&nbsp; ›</button>
      ${week !== monday(today()) ? '<button class="mp-week-back" id="mpToday">↻&nbsp; 回到本周</button>' : ''}
      ${edit && !old ? '<button class="mp-secondary mp-copy" id="mpCopy">复制排餐</button>' : ''}
    </div>
    <div class="mp-week-meta">${old ? '历史周 · 仅支持查看' : changed ? '有未保存修改' : sp?.updated ? `已保存 · 最近更新：${sp.updated}` : '暂未排餐'}</div>
    <div class="mp-calc-note">
      <b>计算口径</b>
      <span>出餐成品总量 = 一锅基准投料 × 锅数 × 出餐成品系数</span><i>→</i>
      <span>预计就餐人数 = 该餐次成品合计 ÷ 人均用餐量</span><i>→</i>
      <span>每行用量 = 菜谱投料 × 锅数</span>
    </div>
    ${catSkipNote(p) ? `<div class="mp-cat-skip"><b>统计口径</b><span>${catSkipNote(p)}</span><button class="mp-cat-skip-go" id="mpCatSkipGo">去设置</button></div>` : ''}
    <div class="mp-section mp-week-section">
      <div class="mp-section-head">
        <div class="mp-week-heading"><h2>周排餐表</h2></div>
        ${edit && !old && removed ? `<div class="mp-removed-days"><span>未排日期</span>${removed}</div>` : ''}
      </div>
      ${table(p)}
    </div>
  </section>`;
  /* 面包屑属于桌面端外壳；手机端没有它，但不能因此让渲染中断（手机端复用的是本模块的逻辑） */
  const bc = $('.breadcrumb'); if (bc) bc.innerHTML = '计划管理&nbsp; / &nbsp;<strong>排餐计划</strong>';
  bind();
  bindWeekFixed();
  mountScope();
}

function historyIcon(p, i) {
  const r = p.adjustments?.[i] || [];
  return `<span class="mp-history-wrap"><button class="mp-history-button ${r.length ? 'has-record' : ''}" data-history-day="${i}">◷</button>
    <div class="mp-history-popover"><b>当日调整记录</b>${r.length
      ? r.map(x => `<p><strong>${x.time}　${x.meal}</strong><span>${x.type}：${esc(x.detail)}</span><small>${esc(x.reason)} · ${esc(x.operator)}</small></p>`).join('')
      : '<em>当日暂无调整记录</em>'}</div></span>`;
}

/* 表头行：表格本体和「冻结表头」共用同一份 markup —— 列宽一致，调整记录 / 删除当天这些按钮在浮层里同样可点 */
function headRow(p) {
  const can = edit && !historical();
  return `<tr><th>餐次</th>${p.activeDays.map(i => {
    const d = add(p.start, i);
    return `<th><div class="mp-day-head"><div class="mp-day-title">${historyIcon(p, i)}<b>${DAYS[i]}（${fmt(d)}）</b>${d === today() ? '<span class="mp-today-tag">今日</span>' : ''}</div>
      <div class="mp-day-tools">${can && d > today() ? `<button class="mp-day-remove" data-remove-day="${i}">×</button>` : ''}</div></div></th>`;
  }).join('')}</tr>`;
}

function table(p) {
  return `<div class="mp-week-wrap"><table class="mp-week"><thead>${headRow(p)}</thead><tbody>${meals().map(m => `<tr><th class="mp-meal-head">${m}<small>${OPEN_TIME[m]} 开餐</small></th>${p.activeDays.map(i => cell(p, i, m)).join('')}</tr>`).join('')}</tbody></table></div>
    <div class="mp-week-fixed" id="mpWeekFixed" hidden><div class="mp-week-fixed-scroll"><table class="mp-week"><thead>${headRow(p)}</thead></table></div></div>`;
}

/* 冻结表头（页面滚动时浮在窗口顶部）：表格本体还在视野里、且表头已滚出画面时才显示，
   位置与宽度按表格外框实时对齐，横向位移跟随 .mp-week-wrap 的 scrollLeft */
function syncWeekFixed() {
  const fixed = $('#mpWeekFixed');
  if (!fixed) return;
  const wrap = $('.mp-week-wrap'), real = $('.mp-week-wrap .mp-week');
  if (!wrap || !real || !real.tHead || !wrap.getClientRects().length) { fixed.hidden = true; return; }
  const wr = wrap.getBoundingClientRect(), head = real.tHead.getBoundingClientRect();
  const h = head.height || 42;
  if (!(wr.top < 0 && wr.bottom > h)) { fixed.hidden = true; return; }   /* 表头还没滚出去，或整张表已滚出视野 */
  fixed.hidden = false;
  fixed.style.left = `${wr.left + wrap.clientLeft}px`;
  fixed.style.width = `${wrap.clientWidth}px`;
  const box = fixed.firstElementChild;
  if (box) { box.style.height = `${h}px`; box.scrollLeft = wrap.scrollLeft; }
}

function bindWeekFixed() {
  /* 滚动监听只挂一次（capture 才能收到表格自身横向滚动的 scroll 事件） */
  if (!window.__mpWeekFixedBound) {
    window.__mpWeekFixedBound = true;
    window.addEventListener('scroll', syncWeekFixed, true);
    window.addEventListener('resize', syncWeekFixed);
  }
  syncWeekFixed();
}

function cell(p, i, m) {
  const d = add(p.start, i), past = d < today();
  const can = edit && !historical() && !past;
  const ids = p.schedule[i][m] || [];
  const pm = p.perMeal[`${i}|${m}`];
  const out = mealOutputKg(p, i, m);
  const tally = catTally(p, i, m);

  /* 人均用餐量：需求 3 的输入项（顶掉 V2 的就餐人数），随格子走 */
  const perMeal = can
    ? `<div class="mp-headcount edit"><span>人均</span><input type="number" min="1" max="9999" step="1" data-permeal="${i}|${m}" value="${pm?.gram ?? ''}" placeholder="用餐量"><i>g/人</i>${pm?.memo ? `<em title="沿用上次：${esc(pm.memo)}">沿用${esc(pm.memo)}</em>` : ''}</div>`
    : `<div class="mp-headcount">${pm?.gram ? `<span>人均</span><b>${pm.gram}</b><i>g/人</i>` : '<span class="mp-dim">未填人均用餐量</span>'}</div>`;

  /* 需求 5 的两个派生数：先给「这个餐次能满足多少人吃」（紧贴人均用餐量输入），
     成品合计是账目口径，落到菜谱下面、分类统计上面。
     人数只按「计入就餐人数」的分类算：全被排除时给「不计入统计」，不是 0 人 */
  const fs = feedState(p, i, m);
  const derived = out ? `<div class="mp-meal-derived${fs.cls}"><b>${fs.text}</b></div>` : '';

  /* 出餐合计：放在菜品列表之后 —— 先看这一餐做了什么，再看这餐一共出多少成品 */
  const outputLine = out ? `<div class="mp-meal-output">出餐合计：${fmtKg(out)}</div>` : '';

  const chips = ids.map(id => {
    const r = findRecipe(id);
    const pots = potsOf(p, i, m, id), o = outputKg(p, i, m, id);
    return `<div class="mp-dish-chip" data-detail="${i}|${m}|${id}">
      <span class="mp-dish-name">${esc(r?.name || id)}</span>
      <span class="mp-dish-meta">${catSecond(id) ? `<em class="mp-dish-cat">${esc(catSecond(id))}</em>` : ''}${pots} 锅 · 出餐 ${fmtKg(o)}</span>
      ${can ? `<button data-remove-dish="${i}|${m}|${id}" title="删除">×</button>` : ''}
    </div>`;
  }).join('');

  /* 需求 7：这个餐次的荤素结构，一眼看出搭配 */
  const cats = ids.length
    ? `<div class="mp-cat-tally" title="本餐次菜谱分类统计">${tally || '—'}</div>`
    : '<div class="mp-cat-tally empty">未排餐</div>';

  return `<td><div class="mp-cell ${past ? 'locked' : ''}">${perMeal}${derived}${chips}${outputLine}${cats}${can ? `<button class="mp-add-dish" data-add-dish="${i}|${m}">＋ 添加菜谱</button>` : ''}</div></td>`;
}

function bind() {
  $('#mpPrev').onclick = () => go(add(week, -7));
  $('#mpNext').onclick = () => go(add(week, 7));
  if ($('#mpToday')) $('#mpToday').onclick = () => go(monday(today()));
  $('#mpWeekPicker').onchange = e => go(fromWeek(e.target.value));
  const goCat = $('#mpCatSkipGo');
  if (goCat) goCat.onclick = () => {
    const open = window.MerchantRecipeView?.categories;
    if (open && $('#recipeNav')) { $('#recipeNav').click(); open(); }
    else toast('请到「菜谱管理 → 菜谱分类」调整计入就餐人数的分类');
  };
  $$('[data-history-day]').forEach(x => x.onclick = () => openHistory(+x.dataset.historyDay));

  /* 只读模式下也要能点开菜品详情（只读抽屉，见 openDetail）——只读判定只看
     「非编辑模式 / 历史周 / 过去日期」这三项（openDetail 里的 ro）：排餐侧不持有生产状态，
     所以「已开工」不再是只读条件（V2 生产计划做减法后核对过，见 PRD 4.6） */
  $$('[data-detail]').forEach(x => x.onclick = e => { if (e.target.closest('[data-remove-dish]')) return; openDetail(x.dataset.detail); });

  if (!edit) { const e = $('#mpEdit'); if (e) e.onclick = () => { edit = true; workspace(); }; return; }
  $('#mpCancelEdit').onclick = cancel;
  $('#mpSave').onclick = () => save(true);
  if (historical()) return;

  $('#mpCopy').onclick = openCopy;
  $$('[data-remove-day]').forEach(x => x.onclick = () => removeDay(+x.dataset.removeDay));
  $$('[data-restore-day]').forEach(x => x.onclick = () => { current.activeDays.push(+x.dataset.restoreDay); current.activeDays.sort(); mark(); workspace(); });
  $$('[data-permeal]').forEach(x => x.oninput = () => {
    const k = x.dataset.permeal, [d, m] = k.split('|');
    /* 手机端没有这一格，桌面端输入时也清掉来源标记（沿用）：值一旦由人改写，
       来源就不再成立，角标要立刻消失，不能等到整格重绘 */
    current.perMeal[k] = { gram: Number(x.value) || 0, memo: '', src: '' };
    const em = x.parentElement && x.parentElement.querySelector('em');
    if (em) em.remove();
    mark();
    paintFeed(x.closest('.mp-cell'), current, +d, m);
  });
  $$('[data-add-dish]').forEach(x => x.onclick = () => picker(x.dataset.addDish));
  $$('[data-remove-dish]').forEach(x => x.onclick = e => { e.stopPropagation(); removeDish(x.dataset.removeDish); });
}

const go = w => { load(w); workspace(); };

function cancel() { if (dirty() && !confirm('取消后将放弃本次所有修改，是否继续？')) return; buffers = {}; edit = false; load(week); workspace(); }

function commit() {
  const ps = plans(), stamp = new Date().toLocaleString('zh-CN', { hour12: false }).replaceAll('/', '-');
  Object.values(buffers).forEach(p => {
    p.status = 'active'; p.updated = stamp;
    freezeCats(p);                    /* 定格：今日及未来这一版计划用哪套开关口径 */
    /* 「沿用」是首次添加时的一次性提示：保存后这一格就是确定值了，再点编辑不该再提示 */
    Object.values(p.perMeal || {}).forEach(x => { if (x.memo) x.memo = ''; });
    const i = ps.findIndex(x => x.start === p.start);
    if (i < 0) ps.push(clone(p));
    else ps[i] = clone(p);
  });
  buffers = {};
  persistPlans();                                                   // 保存即落盘：手机那侧才看得到
}

function save(show) {
  if (!dirty()) { edit = false; load(week); workspace(); if (show) toast('当前没有需要保存的修改'); return; }
  const bad = validate();
  if (bad) { toast(bad); return; }
  commit(); edit = false; load(week); workspace();
  if (show) toast('排餐计划已保存并立即生效');
}

function validate() {
  for (const [di, meals] of Object.entries(current.schedule)) {
    for (const [m, ids] of Object.entries(meals)) {
      if (!ids.length) continue;
      if (di < 0 || di > 6) continue;                       // 只校验本周七个格子
      if (!perMealOf(current, di, m)) return `${DAYS[di]} ${m} 请填写人均用餐量`;
      for (const id of ids) {
        const n = Number(potsOf(current, di, m, id));
        if (!Number.isFinite(n) || n < 1) return `${findRecipe(id)?.name || id} 请填写烹饪锅数（至少 1 锅）`;
        if (n > 99) return `${findRecipe(id)?.name || id} 烹饪锅数不能超过 99 锅`;
      }
    }
  }
  return '';
}

/* 表格上方的口径行：只讲「今日及未来」用哪套开关；历史日期按保存当时的口径，不随设置变。
   只要当前有分类被关、或这份计划的历史日期里定格过分类，都要提示一句。 */
function catSkipNote(p) {
  const live = [...skipCats()];
  const frozen = [...new Set(Object.values(p?.catSkipDates || {}).flat())];
  if (!live.length && !frozen.length) return '';
  const head = live.length ? `今日及未来不计入就餐人数：<b>${live.join('、')}</b>` : '当前全部分类都计入就餐人数';
  return `${head}　·　过去的日期按保存当时的开关口径，不随当前设置变化`;
}

/* ============================ 10. 菜品详情抽屉 ============================ */

function openDetail(key) {
  const [d, m, id] = key.split('|'), r = findRecipe(id);
  const y = yieldOf(id), Q = batchGram(r);
  const pots0 = Math.max(1, Number(potsOf(current, d, m, id)) || 1);
  const calc = pots => { const inp = Q * pots / 1000; return { inp, out: inp * y / 100 }; };
  /* 只读态：非编辑模式、过去日期。点了能看到口径与用料，但没有输入框、没有「确定 / 删除 / 替换」 */
  const ro = !edit || historical() || add(current.start, +d) < today();
  /* 适用设备：菜谱步骤里出现过的设备（去重）；纯人工菜没有设备 */
  const devs = [...new Set(r.steps.map(s => s.device))];
  /* 一锅量 vs 设备额定容量：一锅装不下就得现场拆锅，这里只提示不拦（口径仍是「一锅 = 菜谱一锅量」） */
  const cap = Math.min(...[...devs.map(deviceCapacity).filter(Boolean), Infinity]);
  const overCap = Number.isFinite(cap) && Q / 1000 > cap + 1e-9;

  /* 用料换算：本次用量 = 菜谱一锅投料 × 锅数（一锅基准 Q = 菜谱 BOM 的量，纯人工与设备菜同口径） */
  const basis = '一锅投料';
  const bomRows = input => usageOf(r, input).map(u => `<tr>
      <td><b>${esc(u.ingredient)}</b></td>
      <td>${fmtRawQty(u.qty, u.unit)}</td>
      <td>${u.ratio != null ? `${Math.round(u.ratio * 1000) / 10}%` : '<span class="mp-dim" title="计数单位不进合计">—</span>'}</td>
      <td><b>${u.usageTextDual}</b></td></tr>`).join('');
  const kHint = pots => `本次用量 = ${basis} × <b>${pots}</b> 锅`;

  /* 字段：菜谱分类、出餐成品系数（只读跟随菜谱）、烹饪锅数（唯一输入） */
  const fields = ro
    ? `<label class="mp-field"><span>菜谱分类</span><b class="mp-ro-value">${esc(r.category)}</b></label>
      <label class="mp-field"><span>出餐成品系数</span><b class="mp-ro-value">${y} %</b></label>
      <label class="mp-field"><span>烹饪锅数</span><b class="mp-ro-value">${pots0} 锅</b></label>`
    : `<label class="mp-field"><span>菜谱分类</span><b class="mp-ro-value">${esc(r.category)}</b></label>
      <label class="mp-field"><span>出餐成品系数</span><b class="mp-ro-value">${y} %</b><i>跟随菜谱</i></label>
      <label class="mp-field"><span>烹饪锅数 <b>*</b></span><input id="mpPots" type="number" min="1" max="99" step="1" value="${pots0}"><i>锅</i></label>`;

  drawer(`${r.name}`, `${DAYS[d]} · ${m}${ro ? '　·　只读' : ''}`,
    `<div class="mp-detail-grid">${fields}</div>
    <div class="mp-dish-basis"><em class="mp-tag ${r.hasDevice ? 'device' : 'manual'}">${r.hasDevice ? '含设备加工' : '纯人工'}</em>
      <span>用料明细按「一锅」配置：一锅基准投料 <b>${fmtQty(Q, 'g')}</b>；适用设备 ${devs.length ? devs.map(esc).join('、') : '无（纯人工）'}</span></div>
    ${overCap ? `<div class="mp-memo-note first">⚠ 一锅 ${fmtKg2(Q / 1000)} 超过最小设备额定容量 ${cap} kg，一锅装不下，现场需拆成多锅处理。</div>` : ''}
    ${skipFor(current, +d).has(catSecond(id)) ? `<div class="mp-memo-note${overCap ? '' : ' first'}">该菜属「${esc(catSecond(id))}」，当前<b>不计入就餐人数统计</b>：改锅数只影响出餐量与生产，不会改变这一格的「预计满足 N 人就餐」。</div>` : ''}
    ${!ro && current.potsMemo?.[key] ? `<div class="mp-memo-note">烹饪锅数沿用<b>${esc(current.potsMemo[key])}</b>的填写值：<b>${pots0}</b> 锅，可直接修改覆盖。</div>` : ''}
    <div class="mp-derive-row">
      <div><span>投料用量总量</span><b id="mpInpView">${fmtKg2(calc(pots0).inp)}</b></div><i>=</i>
      <div><span>一锅基准投料 × 锅数</span><b id="mpFormula1">${fmtQty(Q, 'g')} × ${pots0}</b></div>
    </div>
    <div class="mp-derive-row">
      <div><span>出餐成品总量</span><b id="mpOutView">${fmtKg2(calc(pots0).out)}</b></div><i>=</i>
      <div><span>投料用量总量 × 出餐成品系数</span><b id="mpFormula2">${fmtKg2(calc(pots0).inp)} × ${y}%</b></div>
    </div>
    <div class="mp-detail-section"><h4>用料用量明细　<span class="mp-pot-hint" id="mpKHint">${kHint(pots0)}</span></h4>
      <table class="mp-mini-table"><thead><tr><th>用料</th><th>${basis}</th><th>占比</th><th>本次用量</th></tr></thead><tbody id="mpBomBody">${bomRows(calc(pots0).inp)}</tbody></table>
      <p class="mp-table-note">${basis}合计 <b>${fmtQty(Q, 'g')}</b>，每行本次用量 = 该行投料 × 锅数；「${basis}」列按菜谱原单位展示，「本次用量」列统一折算为 g 与 kg 双单位。整条链路与设备无关，设备只决定这道菜上什么机器。${r.hasUnmeasurable ? '<br><b>⚠ 有行走计数单位（个/只等），不计入合计，但仍按锅数放大。</b>' : ''}</p></div>`,
    `<button class="mp-secondary" id="mpDetailClose">关闭</button>${ro ? '' : `<span class="mp-spacer"></span>
     <button class="mp-danger" id="mpDetailRemove">删除此菜</button><button class="mp-secondary" id="mpDetailReplace">替换菜谱</button><button class="mp-primary" id="mpDetailSave">确定</button>`}`,
    true);

  $('#mpDetailClose').onclick = close;
  if (!ro) {
    /* 锅数一变：投料用量总量、出餐成品总量、公式行、用料明细、提示全部同步重算 */
    const paint = pots => {
      const v = calc(pots);
      $('#mpInpView').textContent = fmtKg2(v.inp);
      $('#mpOutView').textContent = fmtKg2(v.out);
      $('#mpFormula1').textContent = `${fmtQty(Q, 'g')} × ${pots}`;
      $('#mpFormula2').textContent = `${fmtKg2(v.inp)} × ${y}%`;
      $('#mpBomBody').innerHTML = bomRows(v.inp);
      $('#mpKHint').innerHTML = kHint(pots);
    };
    const sync = () => { const n = Math.floor(Number($('#mpPots').value) || 0); if (n >= 1) paint(Math.min(99, n)); };
    $('#mpPots').oninput = sync;
    /* 失焦时把输入收敛成整数锅 —— 界面上看到的数就是参与计算的数 */
    $('#mpPots').onblur = () => {
      const v = Math.max(1, Math.min(99, Math.floor(Number($('#mpPots').value) || 0) || 1));
      $('#mpPots').value = String(v); paint(v);
    };
    $('#mpDetailSave').onclick = () => {
      const n = Math.floor(Number($('#mpPots').value) || 0);
      if (n < 1) return toast('请输入烹饪锅数（至少 1 锅）');
      if (n > 99) return toast('烹饪锅数不能超过 99 锅');
      (current.pots ||= {})[key] = n;
      if (current.potsMemo) delete current.potsMemo[key];
      mark(); close(); workspace(); toast('已更新，保存后生效');
    };
    $('#mpDetailReplace').onclick = () => { close(); picker(`${d}|${m}`, id); };
    $('#mpDetailRemove').onclick = () => { close(); removeDish(key); };
  }
}

/* 边输边算：人均用餐量一改，这一格的「预计满足 N 人就餐」立刻跟着变。
   只改文案节点、不动表格结构 —— 整表重画会把光标和输入法状态一起丢掉。 */
function paintFeed(cell, p, d, m) {
  const box = cell?.querySelector('.mp-meal-derived');
  if (!box) return;
  const fs = feedState(p, d, m);
  box.classList.toggle('todo', fs.cls === ' todo');
  box.classList.toggle('excluded', fs.cls === ' excluded');
  const b = box.querySelector('b');
  if (b) b.textContent = fs.text;
}

/* ============================ 11. 菜谱选择器 ============================
   两段式：第 1 步选菜谱 → 第 2 步填锅数。
   为什么要有第 2 步：锅数是这一格用量与成品量的驱动项，加菜时就得定下来，
   否则加 5 道菜要回格子里逐个开抽屉改 5 次。
   两步共用同一个抽屉（只换 body/foot），筛选与勾选留在内存里，来回改不丢。 */

function picker(key, replace = '') {
  const [d, m] = key.split('|'), single = !!replace;
  const selected = new Set(single ? [replace] : []);
  const used = new Set((current.schedule[d][m] || []).filter(x => x !== replace));
  const cats = [...new Set(recipes.map(r => r.category))];
  const makers = [...new Set(recipes.flatMap(r => r.hasDevice ? r.steps.map(s => deviceMaker(s.device)) : []))];
  const potValue = {};                 /* id -> 输入框里的原样字符串；undefined = 还没碰过，用默认值 */
  let bulkN = 1, step = 1;

  /* 默认锅数：替换菜沿用「被替换那道菜」当前的锅数（换菜不换量）；
     新增菜一律落 1 锅 —— 不回查上周同格，复制过来的菜删掉再加也不会莫名带回上周的锅数 */
  const defPots = id => single ? (Number(current.pots[`${d}|${m}|${replace}`]) || 1) : 1;
  const potOf = id => (potValue[id] === undefined ? defPots(id) : potValue[id]);
  const potNum = id => Math.round(Number(potOf(id)) || 0);

  /* ---------------- 第 1 步：选择菜谱 ---------------- */
  const nextLabel = () => `下一步：填写锅数${single ? '' : `（已选 ${selected.size} 道）`}`;
  const bodyStep1 = () => `<div class="mp-recipe-tools">
      <input id="mpRecipeKeyword" placeholder="搜索菜谱名称">
      <select id="mpRecipeCategory"><option value="">全部分类</option>${cats.map(x => `<option>${x}</option>`).join('')}</select>
      <select id="mpRecipeMaker"><option value="">全部设备厂家</option>${makers.map(x => `<option>${x}</option>`).join('')}<option value="none">纯人工（无设备）</option></select>
     </div>
     <div class="mp-recipe-table-head"><span></span><span>图片</span><span>菜谱名称</span><span>分类</span><span>适用设备</span><span>加工方式</span></div>
     <div class="mp-recipe-list" id="mpRecipeList"></div>`;
  const footStep1 = () => `<button class="mp-secondary" id="mpRecipeCancel">取消</button><span class="mp-spacer"></span><button class="mp-primary" id="mpRecipeNext"${selected.size ? '' : ' disabled'}>${nextLabel()}</button>`;

  const drawList = () => {
    const kw = $('#mpRecipeKeyword').value.trim(), c = $('#mpRecipeCategory').value, mk = $('#mpRecipeMaker').value;
    $('#mpRecipeList').innerHTML = recipes.filter(r => {
      const okKw = !kw || r.name.includes(kw);
      const okCat = !c || r.category === c;
      const okMk = !mk || (mk === 'none' ? !r.hasDevice : r.steps.some(s => deviceMaker(s.device) === mk));
      return okKw && okCat && okMk;
    }).map(r => {
      const disabled = used.has(r.id);
      return `<label class="mp-recipe-item ${selected.has(r.id) ? 'selected' : ''} ${disabled ? 'used' : ''}">
        <input type="${single ? 'radio' : 'checkbox'}" name="choice" value="${r.id}" ${selected.has(r.id) ? 'checked' : ''} ${disabled ? 'disabled' : ''}>
        <span class="mp-recipe-thumb-wrap"><img src="${r.image}" alt="${esc(r.name)}"></span>
        <span><b>${r.name}</b><small>${r.id} · ${r.version}${disabled ? ' · 已添加' : ''}</small></span>
        <span>${r.category}</span><span>${r.device}</span>
        <span><em class="mp-tag ${r.hasDevice ? 'device' : 'manual'}">${r.hasDevice ? '含设备加工' : '纯人工'}</em></span>
      </label>`;
    }).join('') || '<div class="mp-empty">暂无符合条件的菜谱</div>';

    $$('#mpRecipeList input').forEach(x => x.onchange = () => {
      if (single) selected.clear();
      x.checked ? selected.add(x.value) : selected.delete(x.value);
      $$('#mpRecipeList .mp-recipe-item').forEach(i => i.classList.toggle('selected', i.querySelector('input').checked));
      const btn = $('#mpRecipeNext');
      if (btn) { btn.disabled = !selected.size; btn.textContent = nextLabel(); }
    });
  };

  const goStep2 = () => {
    const ids = [...selected];
    if (!ids.length) return toast('请至少选择一道菜谱');
    if (single && ids[0] === replace) return toast('请选择要替换成的菜谱');
    ids.forEach(id => { if (potValue[id] === undefined) potValue[id] = String(defPots(id)); });
    step = 2; paint();
  };

  /* ---------------- 第 2 步：填写锅数 ---------------- */
  const calcOf = id => {
    const r = findRecipe(id) || {}, y = yieldOf(id), Q = batchGram(r), n = Number(potOf(id)) || 0;
    const inp = Q * n / 1000;
    return { Q, y, n, inp, out: inp * y / 100 };
  };
  const totalOf = () => [...selected].reduce((t, id) => {
    const c = calcOf(id);
    return { inp: t.inp + c.inp, out: t.out + c.out };
  }, { inp: 0, out: 0 });

  const cardOf = id => {
    const r = findRecipe(id) || {}, c = calcOf(id);
    const devs = [...new Set((r.steps || []).map(x => x.device))];
    const cap = Math.min(...[...devs.map(deviceCapacity).filter(Boolean), Infinity]);
    /* 一锅装不下才是真问题（一锅 = 菜谱一锅量）；锅数多只是会拆锅，不提示 */
    const overCap = Number.isFinite(cap) && c.Q / 1000 > cap + 1e-9;
    return `<div class="mp-pot-card" data-pot-card="${id}">
      <div class="mp-pot-head">
        <b>${esc(r.name || id)}</b>
        <em class="mp-tag ${r.hasDevice ? 'device' : 'manual'}">${r.hasDevice ? '含设备加工' : '纯人工'}</em>
        ${skipFor(current, +d).has(catSecond(id)) ? '<em class="mp-tag skip">不计入就餐人数</em>' : ''}
        <span>${esc(r.category || '')}${devs.length ? ` · ${devs.map(esc).join('、')}` : ' · 无设备'}</span>
      </div>
      <div class="mp-pot-row">
        <label class="mp-pot-input">烹饪锅数 <b>*</b>
          <button type="button" class="mp-pot-step" data-pot-step="${id}|-1">−</button>
          <input type="number" min="1" max="99" step="1" data-pot-input="${id}" value="${potValue[id] ?? ''}">
          <button type="button" class="mp-pot-step" data-pot-step="${id}|1">＋</button><i>锅</i>
        </label>
      </div>
      <div class="mp-pot-derive">
        <span>一锅基准投料 <b>${fmtQty(c.Q, 'g')}</b></span>
        <span>出餐成品系数 <b>${c.y}%</b></span>
        <span>投料用量总量 <b data-pot-inp="${id}">${fmtKg2(c.inp)}</b></span>
        <span>出餐成品总量 <b data-pot-out="${id}">${fmtKg2(c.out)}</b></span>
      </div>
      ${overCap ? `<div class="mp-pot-warn">⚠ 一锅 ${fmtKg2(c.Q / 1000)} 超过额定容量 ${cap} kg/锅，一锅装不下，生产时会拆成多锅。</div>` : ''}
    </div>`;
  };

  const bodyStep2 = () => {
    const t = totalOf();
    return `<div class="mp-pot-bulk">
        <span>统一锅数</span>
        <input id="mpPotBulk" type="number" min="1" max="99" step="1" value="${bulkN}">
        <button class="mp-secondary" id="mpPotBulkApply">应用到全部</button>
        <span class="mp-pot-total">本次 <b>${selected.size}</b> 道 · 投料合计 <b id="mpPotTotalInp">${fmtKg2(t.inp)}</b> · 出餐合计 <b id="mpPotTotalOut">${fmtKg2(t.out)}</b></span>
      </div>
      <div class="mp-pot-tip">投料用量总量 = 一锅基准投料 × 锅数；出餐成品总量 = 投料用量总量 × 出餐成品系数。确认后仍要点页面上的「保存」才生效。</div>
      ${[...selected].map(cardOf).join('')}`;
  };
  const footStep2 = () => `<button class="mp-secondary" id="mpRecipeBack">上一步</button><span class="mp-spacer"></span><button class="mp-primary" id="mpRecipeConfirm">${single ? '确认替换' : `确认添加（${selected.size} 道）`}</button>`;

  /* 改一道菜的锅数：只重画这一行与合计，不重画整屏（重画会把输入光标顶掉） */
  const paintPot = id => {
    const card = document.querySelector(`[data-pot-card="${id}"]`);
    const c = calcOf(id);
    if (card) {
      const a = card.querySelector('[data-pot-inp]'), b = card.querySelector('[data-pot-out]');
      if (a) a.textContent = fmtKg2(c.inp);
      if (b) b.textContent = fmtKg2(c.out);
    }
    const t = totalOf(), ti = $('#mpPotTotalInp'), to = $('#mpPotTotalOut');
    if (ti) ti.textContent = fmtKg2(t.inp);
    if (to) to.textContent = fmtKg2(t.out);
  };

  const confirmStep2 = () => {
    const ids = [...selected];
    if (!ids.length) return toast('请至少选择一道菜谱');
    for (const id of ids) {
      const n = potNum(id), name = findRecipe(id)?.name || id;
      if (n < 1) return toast(`${name} 请填写烹饪锅数（至少 1 锅）`);
      if (n > 99) return toast(`${name} 烹饪锅数不能超过 99 锅`);
    }
    applyAdd(d, m, ids, single, replace, undefined, ids.map(potNum));
    close(); workspace();
    toast(single ? '已替换并确认锅数，保存后生效' : `已加入 ${ids.length} 道菜并确认锅数，保存后生效`);
  };

  const bindStep1 = () => {
    $('#mpRecipeKeyword').oninput = drawList;
    $('#mpRecipeCategory').onchange = drawList;
    $('#mpRecipeMaker').onchange = drawList;
    $('#mpRecipeCancel').onclick = close;
    $('#mpRecipeNext').onclick = goStep2;
  };
  const bindStep2 = () => {
    $$('[data-pot-input]').forEach(x => x.oninput = () => { potValue[x.dataset.potInput] = x.value; paintPot(x.dataset.potInput); });
    $$('[data-pot-step]').forEach(b => b.onclick = () => {
      const [id, delta] = b.dataset.potStep.split('|');
      const nx = Math.min(99, Math.max(1, potNum(id) + Number(delta)));
      potValue[id] = String(nx);
      const inp = document.querySelector(`[data-pot-input="${id}"]`);
      if (inp) inp.value = nx;
      paintPot(id);
    });
    const bi = $('#mpPotBulk');
    if (bi) bi.oninput = () => { bulkN = bi.value; };
    $('#mpPotBulkApply').onclick = () => {
      const n = Math.round(Number(bi.value));
      if (!Number.isFinite(n) || n < 1) return toast('请填写统一锅数（至少 1 锅）');
      if (n > 99) return toast('烹饪锅数不能超过 99 锅');
      bulkN = n;
      [...selected].forEach(id => { potValue[id] = String(n); });
      paint();                       /* 批量动作整屏重画，光标本就不在输入框里 */
      toast(`已把 ${selected.size} 道菜的锅数统一为 ${n} 锅`);
    };
    $('#mpRecipeBack').onclick = () => { step = 1; paint(); };
    $('#mpRecipeConfirm').onclick = confirmStep2;
  };

  const paint = () => {
    $('#mpDrawerTitle').textContent = single ? '替换菜谱' : '添加菜谱';
    $('#mpDrawerSub').textContent = `${DAYS[d]} · ${m}　·　${step === 1 ? '第 1 步：选择菜谱' : '第 2 步：填写锅数'}`;
    if (step === 1) {
      $('#mpDrawerBody').innerHTML = bodyStep1();
      $('#mpDrawerFoot').innerHTML = footStep1();
      bindStep1(); drawList();
    } else {
      $('#mpDrawerBody').innerHTML = bodyStep2();
      $('#mpDrawerFoot').innerHTML = footStep2();
      bindStep2();
    }
  };

  drawer(single ? '替换菜谱' : '添加菜谱', `${DAYS[d]} · ${m}`, '', '', true);
  step = 1;
  paint();
}

/* ============================ 12. 复制 / 删除 / 调整记录 ============================ */

function openCopy() {
  const opts = plans().filter(p => p.start !== week).sort((a, b) => b.start.localeCompare(a.start));
  drawer('复制排餐', `复制到 ${range(week)}`,
    `<div class="mp-copy-options">
      <label><input type="radio" name="mpCopySource" value="${add(week, -7)}" checked><span><b>复制上周</b><small>${range(add(week, -7))}</small></span></label>
      <label><input type="radio" name="mpCopySource" value="${add(week, -14)}"><span><b>复制上上周</b><small>${range(add(week, -14))}</small></span></label>
      <label><input type="radio" name="mpCopySource" value="custom"><span><b>自选周</b><small>选择当前组织已保存的排餐</small></span></label>
      <select id="mpCopyCustom" disabled><option value="">请选择来源周</option>${opts.map(p => `<option value="${p.start}">${range(p.start)}</option>`).join('')}</select>
     </div>
     <div class="mp-copy-tip">复制将覆盖目标日期原有排餐，带入各餐次的人均用餐量与每道菜的锅数，<b>不复制</b>当日调整记录。</div>`,
    `<button class="mp-secondary" id="mpCopyCancel">取消</button><span class="mp-spacer"></span><button class="mp-primary" id="mpCopyConfirm">确认复制</button>`);
  $$('input[name="mpCopySource"]').forEach(x => x.onchange = () => $('#mpCopyCustom').disabled = x.value !== 'custom');
  $('#mpCopyCancel').onclick = close;
  $('#mpCopyConfirm').onclick = copyPlan;
}

function copyPlan() {
  let src = $('input[name="mpCopySource"]:checked').value;
  if (src === 'custom') src = $('#mpCopyCustom').value;
  if (!src) return toast('请选择来源周');
  const p = saved(src);
  if (!p) return toast('所选来源周暂无已保存的排餐');
  const first = week === monday(today()) ? dayIndex(today()) + 1 : 0;
  for (let i = first; i < 7; i++) {
    const copied = clone(p.schedule[i] || blank()[i]);
    MEALS.forEach(m => { copied[m] = groupByCategory(copied[m]); });
    current.schedule[i] = copied;
    MEALS.forEach(m => {
      const k = `${i}|${m}`;
      if (p.perMeal?.[k]) current.perMeal[k] = clone(p.perMeal[k]);
      (p.schedule[i][m] || []).forEach(id => {
        const pk = `${k}|${id}`;
        current.pots[pk] = p.pots?.[pk] || 1;
      });
    });
    const active = p.activeDays.includes(i);
    current.activeDays = current.activeDays.filter(x => x !== i);
    if (active) current.activeDays.push(i);
  }
  current.activeDays.sort();
  current.adjustments = {};
  current.potsMemo = {};
  mark(); close(); workspace(); toast('排餐已复制，请保存后生效');
}

/* 真正落地一次删除（不含确认与原因询问） */
function applyRemove(v, why) {
  const [d, m, id] = v.split('|');
  const date = add(current.start, +d);
  current.schedule[d][m] = current.schedule[d][m].filter(x => x !== id);
  delete current.pots[v];
  if (current.potsMemo) delete current.potsMemo[v];
  if (date === today()) record(+d, m, '删除', findRecipe(id)?.name || id, why);
  mark();
}
function removeDish(v) {
  const [d, m, id] = v.split('|');
  const date = add(current.start, +d);
  const name = findRecipe(id)?.name || id;
  const apply = why => { applyRemove(v, why); close(); workspace(); };
  date === today() ? reason('删除菜谱', apply) : (confirm(`确认删除“${name}”吗？`) && apply(''));
}

/* 真正落地一次加菜 / 换菜（不含确认与原因询问）。why 有值才记调整记录 ——
   桌面原来的加菜不记，保持原样；手机端必填原因，走同一条落地逻辑。
   potList：两段式第二步让用户逐道确认过的锅数。桌面端一定会传（新增默认 1 锅、替换默认被替换那道菜的锅数）；
   没传（手机端新增）才回查上周同格兜底 */
function applyAdd(d, m, ids, single, replace, why, potList) {
  const before = current.schedule[d][m] || [];
  const oldKey = `${d}|${m}|${replace}`;
  const oldPots = single ? Number(current.pots[oldKey]) || 0 : 0;   /* 换菜不换量：先记下被替换那道菜的锅数 */
  if (single) current.schedule[d][m] = groupByCategory(before.map(x => x === replace ? ids[0] : x));
  else current.schedule[d][m] = groupByCategory([...before, ...ids]);
  /* 锅数优先级：用户在第二步填的 > 替换前那道菜的 > （手机端）沿用上周同一格 > 1 锅
     桌面端第二步给过默认值，就不再回查上周，也就不会挂「沿用」标记 */
  (current.potsMemo ||= {});
  ids.forEach((id, i) => {
    const k = `${d}|${m}|${id}`;
    const inh = potList ? 0 : (Number(inheritedPots(current, +d, m, id)) || 0);
    const n = Number(potList?.[i]) || oldPots || inh || 1;
    current.pots[k] = n;
    if (inh && inh === n) current.potsMemo[k] = inheritedLabel(+d, m);
    else delete current.potsMemo[k];
  });
  /* 替换掉的旧菜，锅数一并清掉，别在存储里留孤儿键 */
  if (single && replace && replace !== ids[0]) {
    delete current.pots[oldKey];
    if (current.potsMemo) delete current.potsMemo[oldKey];
  }
  /* 人均用餐量：这一格还没填过就带默认值 —— 优先档口配置，其次沿用上周同一餐次 */
  const mk = `${d}|${m}`;
  if (!current.perMeal[mk]?.gram) {
    const sg = stallMealGram(m);
    const g = sg ?? inheritedPerMeal(current, +d, m);
    current.perMeal[mk] = sg
      ? { gram: sg, memo: '', src: 'stall' }
      : { gram: g ?? '', memo: g ? inheritedLabel(+d, m) : '' };
  }
  if (why != null && add(current.start, +d) === today()) {
    ids.forEach(id => record(+d, m, single ? '替换' : '新增', findRecipe(id)?.name || id, why));
  }
  mark();
}

function removeDay(i) {
  if (current.activeDays.length <= 1) return toast('每周至少保留一个排餐日期，当前日期不能移除；如当天不排餐，可将各餐次菜谱留空。');
  const n = Object.values(current.schedule[i]).flat().length;
  if (n && !confirm(`${DAYS[i]}已安排${n}道菜，移除当天后这些内容将被清空，是否继续？`)) return;
  current.activeDays = current.activeDays.filter(x => x !== i);
  current.schedule[i] = Object.fromEntries(MEALS.map(m => [m, []]));
  mark(); workspace();
}

function reason(action, done) {
  drawer(action, `${today()} · 今日排餐调整`,
    '<div class="mp-adjust-tip">今日排餐调整需要记录原因，保存后可通过日期旁的记录图标查看。</div><div class="mp-adjust-form" style="margin-top:16px"><label><span>调整原因（必填）</span><textarea id="mpAdjustReason" placeholder="请输入调整原因"></textarea></label></div>',
    '<button class="mp-secondary" id="mpReasonCancel">取消</button><span class="mp-spacer"></span><button class="mp-primary" id="mpReasonSave">确认</button>');
  $('#mpReasonCancel').onclick = close;
  $('#mpReasonSave').onclick = () => { const v = $('#mpAdjustReason').value.trim(); if (!v) return toast('请填写调整原因'); done(v); };
}

function record(d, m, type, detail, why) {
  (current.adjustments ||= {}); (current.adjustments[d] ||= []);
  current.adjustments[d].push({ time: new Date().toTimeString().slice(0, 5), meal: m, type, detail, reason: why, operator: '平台管理员' });
}

/* ============================ 12c. 手机端（车间）接口 ============================
   车间没有电脑，排餐调整与生产确认都在手机页上做。手机页**不重新实现任何规则**，
   只调这里和 MerchantProduction 的动作：编辑缓冲、校验、原因记录、落盘、锁定与定格判定全部复用。
   全部返回「错误文案或 null」，不弹 toast / confirm —— 反馈形式交给手机页自己决定。 */
const mobile = {
  today,
  /* 只允许改今天：与桌面「过去的日期只读」同一条口径 */
  begin(date = today()) {
    if (date !== today()) return '只能调整今天的排餐';
    week = monday(date); load(week); edit = true;
    return validateToday();
  },
  /* 今日各餐次的口径：读的是**编辑缓冲**，所以未保存的改动立刻可见 */
  view() {
    const di = dayIndex(today());
    return {
      di, meals: meals().map(m => ({
        meal: m,
        perMeal: perMealOf(current, di, m),          // 人均用餐量（克/人）
        perMealInheritedFrom: current?.perMeal?.[`${di}|${m}`]?.memo || '',
        output: mealOutputKg(current, di, m),        // 该餐次出餐成品合计（kg，物理口径）
        countedOutput: countedOutputKg(current, di, m),  // 计入就餐人数的那部分成品合计
        feedCount: feedCountOf(current, di, m),      // 预计满足就餐人数（只算计入分类）
        skippedCats: skippedInMeal(current, di, m).map(x => x.name),  // 本餐次被排除的分类
        tally: catTally(current, di, m),             // 荤素统计
        dishes: (current?.schedule?.[di]?.[m] || []).map(id => ({
          id, recipe: findRecipe(id),
          output: outputKg(current, di, m, id),
          input: inputTotalKg(current, di, m, id),
          pots: potsOf(current, di, m, id),
          yieldCoef: yieldOf(id),
          /* 「沿用上周同格」的首次提示：手机端也要显示，来源文案一并带出去 */
          inherited: !!current?.potsMemo?.[`${di}|${m}|${id}`],
          inheritedFrom: current?.potsMemo?.[`${di}|${m}|${id}`] || '',
          removable: true,
        })),
      })),
    };
  },
  /* 候选菜谱：排除本餐次已加的（与桌面 picker 同一条规则） */
  candidates(meal) {
    const di = dayIndex(today());
    const used = new Set(current?.schedule?.[di]?.[meal] || []);
    return recipes.filter(r => !used.has(r.id));
  },
  /* 人均用餐量（克/人）：需求 3 的输入项 */
  setPerMeal(meal, v) {
    const di = dayIndex(today());
    const n = Math.round(Number(v));
    if (!Number.isFinite(n) || n <= 0) return '请填写人均用餐量（克/人）';
    if (n > 9999) return '人均用餐量不能超过 9999 克';
    (current.perMeal[`${di}|${meal}`] ||= {}).gram = n;
    (current.perMeal[`${di}|${meal}`] ||= {}).memo = '';
    mark();
    return null;
  },
  /* 锅数：需求 6，用量与成品量的驱动项 */
  setPots(meal, id, v) {
    const di = dayIndex(today());
    const n = Math.floor(Number(v));
    if (!Number.isFinite(n) || n < 1) return '请输入烹饪锅数（至少 1 锅）';
    if (n > 99) return '烹饪锅数不能超过 99 锅';
    (current.pots ||= {})[`${di}|${meal}|${id}`] = n;
    if (current.potsMemo) delete current.potsMemo[`${di}|${meal}|${id}`];
    mark();
    return null;
  },
  /* 加菜 / 删菜：原因必填（车间改动都会进当日调整记录） */
  add(meal, id, why) {
    if (!String(why || '').trim()) return '请填写调整原因';
    const di = dayIndex(today());
    if ((current.schedule[di][meal] || []).includes(id)) return '这道菜已经在本餐次里了';
    applyAdd(di, meal, [id], false, '', String(why).trim());
    return null;
  },
  remove(meal, id, why) {
    if (!String(why || '').trim()) return '请填写调整原因';
    const di = dayIndex(today());
    applyRemove(`${di}|${meal}|${id}`, String(why).trim());
    return null;
  },
  adjustments() { return current?.adjustments?.[dayIndex(today())] || []; },
  /* 保存：走的是与桌面完全相同的校验与提交 */
  commit() {
    const bad = validate();
    if (bad) return bad;
    commit(); edit = false;
    return null;
  },
  cancel() { buffers = {}; load(week); edit = false; return null; },
};
function validateToday() {
  if (!current) return '排餐数据未就绪';
  if (!(current.activeDays || []).includes(dayIndex(today()))) return '今天不在排餐日期内';
  return null;
}

function openHistory(d) {
  const rows = current.adjustments?.[d] || [];
  drawer('当日调整记录', `${DAYS[d]} · ${add(current.start, d)}`,
    rows.length ? `<div class="mp-history-list">${rows.map(x => `<article><time>${x.time}</time><div><b>${x.meal} · ${x.type}</b><p>${esc(x.detail)}</p><small>原因：${esc(x.reason)}　操作人：${esc(x.operator)}</small></div></article>`).join('')}</div>` : '<div class="mp-empty">当日暂无排餐调整记录</div>',
    '<span class="mp-spacer"></span><button class="mp-primary" id="mpHistoryClose">关闭</button>');
  $('#mpHistoryClose').onclick = close;
}

/* ============================ 13. 切页 / 组织切换拦截 ============================ */

/* 切换范围（组织 / 档口）前的同一道拦截：保存后切，校验不过就不切、也不丢改动。
   切换动作由 merchant-org-scope-switcher.js 统一发起（onBefore 返回 false 即拦下）。
   生产计划不再有「先保存再切」的拦截 —— V3 起两边不联动，切过去只是看另一份派生视图 */
function scopeConfirm(next) {
  drawer('切换范围', '当前排餐还有未保存的修改',
    '<div class="mp-org-switch-tip">保存后将切换到所选范围；如需继续编辑，请取消切换。</div>',
    '<button class="mp-secondary" id="mpScopeCancel">取消切换</button><span class="mp-spacer"></span><button class="mp-primary" id="mpScopeSave">保存后切换</button>');
  $('#mpScopeCancel').onclick = close;
  $('#mpScopeSave').onclick = () => {
    const bad = validate();
    if (bad) return toast(bad);           // 与切页一致：校验不过不提交，也不切
    commit(); edit = false; close();
    switchBypass = true;                  // 保存后由本模块自己放行这次切换
    if (!next) return;
    if (next.kind === 'stall' && next.stallId) window.MerchantScope?.setStall(next.stallId);
    else if (next.kind === 'clear') window.MerchantScope?.clearStall();
    else if (next.orgId) window.MerchantScope?.setOrg(next.orgId, { stall: next.stall !== false });
  };
}

/* ============================ 14. 对外暴露 ============================ */

window.MerchantPlan = {
  MEALS, DAYS, OPEN_TIME, recipes, findRecipe, DEVICES, DEVICE_MODELS, deviceCapacity,
  deviceLabel, deviceMaker, deviceModel,
  today, add, monday, dayIndex, hm, toMin, fmt, fmtKg, fmtKg2, fmtQty, fmtRawQty, fmtUsageQty, trimNum, esc, clone,
  org, plans, saved,
  /* 计划按档口分片：切换器与生产计划都要用（stallId 为空 = 组织层总览） */
  stallId, stall, meals, scopeKey,
  /* 按任意档口取「已保存」的计划（不改变当前范围）：生产计划的组织层总览用它统计各档口任务 */
  savedPlanOf: (k, w) => (k ? lsGet(planKey(k, w)) : null),
  /* 下游（生产/采购）要读「已保存的排餐」，但新浏览器里排餐可能一次都没保存过 ——
     这时按同一份种子规则落一份再返回，否则下游永远是空的。已保存的一律原样返回，不覆盖。 */
  ensureWeekPlan: (k, w) => {
    if (!k) return null;
    const saved = lsGet(planKey(k, w));
    if (saved) return saved;
    const p = makePlan(w, seed());
    p.activeDays = [0, 1, 2, 3, 4];
    lsSet(planKey(k, w), p);
    return p;
  },
  /* V3 计算口径：锅数与人均用餐量是输入，投料/成品/预计人数是派生 */
  /* 就餐人数测算口径：分类开关由菜谱分类页写，这里只读；外面可查可刷新 */
  catPolicy: { excluded: () => [...skipCats()], isExcluded: name => skipCats().has(name), refresh: refreshCatPolicy },
  countedOutputKg, skippedInMeal, feedState, skipFor, skipForDate, frozenCats,
  potsOf, perMealOf, outputKg, inputTotalKg, mealOutputKg, feedCountOf, catTally, yieldOf, potOutputKg,
  /* 沿用的取数口（首次建锅数时查上周同一格），导出便于回归测试 */
  ensurePots, inheritedPerMeal, inheritedPots, inheritedLabel, prevWeekOf,
  /* 落盘：只在排餐这一份数据上写（生产状态/现场调整由生产计划自己那套 key 管） */
  persist, persistPlans,
  effDevices, effDeviceOf, potCountFor, potLoadOf, taskDurationSec, deviceDurationSec,
  toGram, batchGram, factorOf, usageOf,
  /* 用料换算结果（采购计划的输入）：每行含 食材/原单位/是否计入基准量/占比/本次用量 */
  bomUsageOf: (p, d, m, id) => usageOf(findRecipe(id), inputTotalKg(p, d, m, id)),
  isDeviceRecipe: id => !!findRecipe(id)?.hasDevice,
  hideAll, hideAllPages, mealPage, toast, drawer, close,
  enterMealPlan: enter,
  save,                       // 手机端的排餐调整页也走这一个保存入口（落盘、校验都在里面）
  mobile,                     // 手机端（车间）的排餐调整接口
  openDetail: key => openDetail(key),
  refresh: () => { if (!mealPage().hidden) { load(week); render(); } },
};

/* ============================ 15. 安装 ============================ */

function install() {
  if ($('#mealPlanNav')) return;
  /* 手机端页面没有侧边栏、也没有这两个导航项 —— 那边的入口由手机页自己画，
     但「切换组织时重置」这部分逻辑两端都要，所以下面只把侧边栏那段包起来，不是整个 install 返回 */
  const sidebar = $('.sidebar');
  if (sidebar) {
    sidebar.insertAdjacentHTML('beforeend',
      `<div class="nav-parent" id="planManagementParent"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M5 4h14v16H5zM8 2v4M16 2v4M8 10h8M8 14h5"/></svg><span>计划管理</span></div>
       <div class="nav-child" id="mealPlanNav"><span>排餐计划</span></div>
       <div class="nav-child" id="productionPlanNav"><span>生产计划</span></div>
       <div class="nav-child" id="purchasePlanNav"><span>采购计划</span></div>`);
    $('#mealPlanNav').onclick = e => { e.stopImmediatePropagation(); enter(); };
    /* 生产计划是独立页面：点进去不再做「先保存排餐」的拦截（V3 起两边不联动） */
    $('#productionPlanNav').onclick = e => {
      e.stopImmediatePropagation();
      if (!window.MerchantProduction) return toast('生产计划模块未加载');
      window.MerchantProduction.enter();
    };
    /* 采购计划同样是独立页面；询价单不单独开菜单，是它详情页里的第二个页签 */
    $('#purchasePlanNav').onclick = e => {
      e.stopImmediatePropagation();
      if (!window.MerchantPurchase) return toast('采购计划模块未加载');
      window.MerchantPurchase.enter();
    };
  }
  /* 范围（组织/档口）变了：本模块自行重置并重载。
     切换器是唯一的发起方（onBefore 里做未保存拦截），所以这里不再自己观察 DOM。 */
  const onScopeChanged = () => {
    if (scopeToken() === activeScope) return;
    reset();
    if (!mealPage().hidden) { if (scopeKey()) load(week); render(); }
    if ($('#productionPlanPage') && !$('#productionPlanPage').hidden) window.MerchantProduction?.enter();
    if ($('#purchasePlanPage') && !$('#purchasePlanPage').hidden) window.MerchantPurchase?.enter();
  };
  if (window.MerchantScope) {
    window.MerchantScope.onChange(onScopeChanged);
    window.MerchantScope.onBefore(next => {
      if (switchBypass) { switchBypass = false; return true; }
      if (mealPage().hidden || !dirty()) return true;
      scopeConfirm(next);
      return false;
    });
  } else {
    const orgEl = $('#currentOrganization');
    if (orgEl) new MutationObserver(onScopeChanged).observe(orgEl, { childList: true, characterData: true, subtree: true });
  }
}

install();
})();
