/* 商户端 · 计划管理 —— 排餐计划 V2
   计算口径见《商户端计划管理PRD》V1.0：
     出品量   = 就餐人数 × 人均配量
     投料总量 = 出品量 ÷ 出餐成品系数
     倍数 k   = 投料总量 ÷ 基准批次量 Q   （纯人工菜 Q = 一份；含设备菜 Q = 一批）
     每行用量 = 该行投料 × k              （整条链路与设备无关，锅数归生产计划）
   本模块同时向 merchant-production-plan-v1.js 暴露共享数据层 window.MerchantPlan */
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
const BUFFER_MIN = 15;              // 出品静置缓冲

const PAGES = ['#organizationPage', '#rolesPage', '#adminsPage', '#usersPage', '#recipePage',
               '#dishCategoryPage', '#deviceRecipePage', '#mealPlanPage', '#productionPlanPage'];

/* ============================ 2. 菜谱主数据 ============================ */
/* 字段：bom 用料明细（标准食材 + 投料量 kg + 投料状态 + 切配方式）
        bom  用料明细（用料角色 + 标准食材 + 投料量 + 单位 + 投料状态 + 切配方式；纯人工=一份，含设备=一批）
        steps 设备加工步骤（设备型号 + 单锅时长秒 + 是否主加工；单锅产能挂在设备型号主数据上）
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

/* 用料角色 / 食材 / 数量 / 单位 / 投料状态 / 切配 / 是否自采（自采不参与采购） */
const RAW = {
  /* —— 含设备加工：用料按「一批」配置，单位统一 g —— */
  CP001: [ '宫保鸡丁', '热菜 / 小荤', 'V3',
    [['主料', '鸡胸肉', 7200, 'g', '已切配', '切丁'],
     ['主料', '花生米', 1800, 'g', '原始', '—'],
     ['辅料', '黄瓜', 2400, 'g', '已切配', '切丁'],
     ['调料', '生抽', 400, 'g', '已调制', '—'],
     ['调料', '香油', 200, 'g', '已调制', '—']],
    [['预热炒锅', '智谷 A8', 60, false], ['主料炒制', '智谷 A8', 180, true], ['酱汁投放', '智谷 A8', 20, false]] ],
  CP002: [ '红烧肉', '热菜 / 大荤', 'V4',
    [['主料', '五花肉', 9000, 'g', '已切配', '切块'],
     ['主料', '土豆', 3600, 'g', '已切配', '滚刀块'],
     ['调料', '生抽', 1200, 'g', '已调制', '—'],
     ['调料', '冰糖', 900, 'g', '已调制', '—'],
     ['调料', '料酒', 300, 'g', '已调制', '—']],
    [['煸炒上色', '优特 UT-C16', 240, true], ['焖煮收汁', '优特 UT-C16', 600, false]] ],
  CP004: [ '紫菜蛋花汤', '汤粥 / 汤类', 'V2',
    [['辅料', '饮用水', 22000, 'g', '原始', '—', true],
     ['主料', '鸡蛋', 6000, 'g', '原始', '—'],
     ['主料', '紫菜', 1500, 'g', '原始', '—'],
     ['调料', '食盐', 400, 'g', '已调制', '—'],
     ['调料', '香油', 100, 'g', '已调制', '—']],
    [['批量煮制', '智谷 ZG-T30', 420, true]] ],
  CP006: [ '葱油拌面', '主食 / 面食', 'V1',
    [['主料', '面条', 9000, 'g', '原始', '—'],
     ['调料', '生抽', 2100, 'g', '已调制', '—'],
     ['主料', '葱油', 1400, 'g', '已预制', '—'],
     ['调料', '白糖', 800, 'g', '已调制', '—'],
     ['辅料', '小葱', 700, 'g', '已切配', '切段']],
    [['煮面', '优特 UT-P40', 150, true], ['拌制', '优特 UT-P40', 60, false]] ],
  CP007: [ '小米南瓜粥', '汤粥 / 粥类', 'V1',
    [['辅料', '饮用水', 21000, 'g', '原始', '—', true],
     ['主料', '南瓜', 4800, 'g', '已切配', '切块'],
     ['主料', '小米', 4000, 'g', '原始', '—'],
     ['调料', '冰糖', 200, 'g', '已调制', '—']],
    [['熬煮', '智谷 ZG-T30', 1800, true]] ],
  CP009: [ '土豆烧牛肉', '热菜 / 大荤', 'V3',
    [['主料', '牛肉', 7000, 'g', '已切配', '切块'],
     ['主料', '土豆', 4500, 'g', '已切配', '滚刀块'],
     ['调料', '生抽', 1400, 'g', '已调制', '—'],
     ['调料', '料酒', 700, 'g', '已调制', '—'],
     ['调料', '食盐', 400, 'g', '已调制', '—']],
    [['焯水', '智谷 ZG-T30', 120, false], ['烧制', '优特 UT-P40', 900, true]] ],

  /* —— 纯人工：用料按「一份」配置 —— */
  CP003: [ '番茄炒蛋', '热菜 / 半荤半素', 'V2',
    [['主料', '番茄', 120, 'g', '已切配', '切块'],
     ['主料', '鸡蛋', 80, 'g', '原始', '—'],
     ['调料', '食用油', 8, 'ml', '原始', '—'],
     ['调料', '食盐', 3, 'g', '已调制', '—']], [] ],
  CP005: [ '清炒时蔬', '热菜 / 素菜', 'V5',
    [['主料', '时令蔬菜', 150, 'g', '已切配', '切段'],
     ['调料', '食用油', 8, 'ml', '原始', '—'],
     ['调料', '食盐', 3, 'g', '已调制', '—']], [] ],
  CP008: [ '鸡蛋饼', '主食 / 点心', 'V2',
    [['主料', '面粉', 60, 'g', '原始', '—'],
     ['主料', '鸡蛋', 50, 'g', '原始', '—'],
     ['调料', '食用油', 5, 'ml', '原始', '—'],
     ['调料', '食盐', 1, 'g', '已调制', '—']], [] ],
  CP010: [ '水果拼盘', '其他 / 水果', 'V1',
    [['主料', '哈密瓜', 100, 'g', '已切配', '切块'],
     ['主料', '圣女果', 80, 'g', '已切配', '对半切']], [] ]
};

const recipes = Object.entries(RAW).map(([id, r], i) => {
  const [name, category, version, bom, steps] = r;
  const bomRows = bom.map(([role, ingredient, qty, unit, inputState, cut, selfSupply]) =>
    ({ role, ingredient, qty, unit, inputState, cut, selfSupply: !!selfSupply }));
  const stepRows = steps.map(([stepName, device, seconds, isMain]) => ({ stepName, device, seconds, isMain }));
  const q = bomRows.reduce((s, b) => s + (toGram(b.qty, b.unit) ?? 0), 0);
  return {
    id, name, category, version, bom: bomRows, steps: stepRows,
    image: dishArt(name, i),
    device: stepRows.length ? [...new Set(stepRows.map(s => s.device))].join('、') : '—',
    hasDevice: stepRows.length > 0,
    capacity: stepRows.length ? deviceCapacity(mainStepDevice(stepRows)) : 0,
    batchGram: q,                                   // 基准批次量 Q（克），只算能折成质量的行
    hasUnmeasurable: bomRows.some(b => toGram(b.qty, b.unit) === null)
  };
});

function mainStepDevice(steps) { return (steps.find(s => s.isMain) || steps[0] || {}).device || ''; }

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
const hm = min => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(Math.round(min % 60)).padStart(2, '0')}`;
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
/* 入锅投料总量：展示精度与用料行（2 位）对齐，避免「把本次用量列加起来比它多 0.01」 */
const fmtKg2 = v => `${(Math.round(v * 100) / 100).toFixed(2).replace(/\.?0+$/, '')}kg`;
/* 人均配量统一收敛到 3 位小数（0.001 kg = 1 g）—— 录入、存储、展示同一口径，所见即所存 */
const round3 = v => Math.round(v * 1000) / 1000;

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
const allowed = () => /(食堂|档口)$/.test(org());

const blank = () => Object.fromEntries(DAYS.map((_, i) => [i, Object.fromEntries(MEALS.map(m => [m, []]))]));

const seed = () => {
  const s = blank();
  [['早餐', 'CP007,CP008'], ['午餐', 'CP002,CP005,CP004'], ['晚餐', 'CP006,CP005']].forEach(([m, v]) => s[0][m] = v.split(','));
  s[1]['早餐'] = ['CP007', 'CP008']; s[1]['午餐'] = ['CP001', 'CP005']; s[1]['晚餐'] = ['CP009', 'CP004'];
  s[2]['早餐'] = ['CP007', 'CP008']; s[2]['午餐'] = ['CP002', 'CP005']; s[2]['晚餐'] = ['CP003', 'CP004'];
  s[3]['早餐'] = ['CP007', 'CP008']; s[3]['午餐'] = ['CP003', 'CP005', 'CP004']; s[3]['晚餐'] = ['CP006', 'CP005'];
  s[4]['早餐'] = ['CP007', 'CP008']; s[4]['午餐'] = ['CP009', 'CP005']; s[4]['晚餐'] = ['CP003', 'CP004'];
  return s;
};

const DEFAULT_HEADCOUNT = { 早餐: 120, 早点: 40, 午餐: 300, 午点: 60, 晚餐: 260, 夜宵: 40 };
const DEFAULT_PER_PERSON = { 汤粥: 0.3, 主食: 0.15, 热菜: 0.16, 其他: 0.15 };

const makePlan = (start, schedule = blank()) => {
  const p = { id: `PC${start.replaceAll('-', '')}`, start, activeDays: [0, 1, 2, 3, 4, 5, 6], schedule,
              headcounts: {}, details: {}, statuses: {}, adjustments: {}, updated: '' };
  Object.keys(schedule).forEach(d => MEALS.forEach(m => {
    const ids = schedule[d][m] || [];
    if (!ids.length) return;
    p.headcounts[`${d}|${m}`] = { value: DEFAULT_HEADCOUNT[m] || 100, memo: '' };
    ids.forEach(id => {
      const r = findRecipe(id); if (!r) return;
      const c0 = r.category.split(' / ')[0], y = r.yieldDefault;
      /* 已有的历史计划：纯人工菜按菜谱派生，含设备菜代表「之前人工填过」 */
      p.details[`${d}|${m}|${id}`] = {
        perPerson: r.hasDevice ? (DEFAULT_PER_PERSON[c0] ?? 0.15) : derivedPerPerson(r, y),
        perPersonFrom: r.hasDevice ? 'manual' : 'recipe',
        yieldCoef: y,
        yieldOverridden: false,
        yieldCustom: y,
        memo: '', memoAt: ''
      };
    });
  }));
  return p;
};

const stores = {};
function plans() {
  const k = org();
  if (!stores[k]) {
    const m = monday(today());
    const p = makePlan(m, seed()), p1 = makePlan(add(m, -7), seed()), p2 = makePlan(add(m, -14), seed());
    p.activeDays = p1.activeDays = p2.activeDays = [0, 1, 2, 3, 4];
    p.updated = '2026-09-16 09:30'; p1.updated = '2026-09-12 16:20'; p2.updated = '2026-09-05 15:40';
    p.statuses = { '2|午餐|CP002': 'producing', '1|午餐|CP001': 'complete' };
    p.adjustments = { 2: [{ time: '10:15', meal: '午餐', type: '新增', detail: '清炒时蔬', reason: '临时增加配菜', operator: '张晓东' }] };
    stores[k] = [p, p1, p2];
  }
  return stores[k];
}

const taskOverrides = {};
const overrides = () => (taskOverrides[org()] ||= {});

let week = monday(today()), edit = false, current = null, buffers = {}, activeOrg = org(), switchBypass = false;

/* ============================ 5. 记忆表 ============================ */

/* 粒度：人数 => 组织 × 餐次；人均配量 / 出餐成品系数 => 组织 × 菜谱 */
const memoStore = k => { try { return JSON.parse(localStorage.getItem(`mp:mem:${k}`) || '{}'); } catch { return {}; } };
const memoRead = (kind, key) => memoStore(org())[kind]?.[key] || null;
const memoWrite = (kind, key, value, source) => {
  const all = memoStore(org());
  (all[kind] ||= {})[key] = { value, source, at: new Date().toLocaleString('zh-CN', { hour12: false }) };
  try { localStorage.setItem(`mp:mem:${org()}`, JSON.stringify(all)); } catch { /* 忽略 */ }
};
/* 保存时才写记忆，取消编辑不写 */
const memoCommit = p => {
  Object.entries(p.headcounts).forEach(([k, v]) => {
    const [d, m] = k.split('|');
    if (v?.value) memoWrite('headcount', m, v.value, `${fmt(add(p.start, +d))} ${m}`);
  });
  Object.entries(p.details).forEach(([k, d]) => {
    const [di, m, id] = k.split('|');
    const src = `${fmt(add(p.start, +di))} ${m}`;
    if (d?.perPerson && d.perPersonFrom !== 'recipe') memoWrite('perPerson', id, d.perPerson, src);
    if (d?.yieldOverridden && d?.yieldCoef) memoWrite('yieldCoef', id, d.yieldCoef, src);
  });
};

/* ============================ 6. 计算口径 ============================ */

const headcountOf = (p, d, m) => p.headcounts[`${d}|${m}`]?.value || 0;
const detailOf    = (p, d, m, id) => p.details[`${d}|${m}|${id}`] || null;
const statusOf    = (p, d, m, id) => p.statuses[`${d}|${m}|${id}`] || '';
const lockedOf    = (p, d, m, id) => ['producing', 'complete'].includes(statusOf(p, d, m, id));

const outputKg = (p, d, m, id) => {
  const det = detailOf(p, d, m, id);
  return det ? headcountOf(p, d, m) * det.perPerson : 0;
};
const inputTotalKg = (p, d, m, id) => {
  const det = detailOf(p, d, m, id);
  if (!det || !det.yieldCoef) return 0;
  return outputKg(p, d, m, id) / (det.yieldCoef / 100);
};
/* 单锅产能取设备型号主数据上的额定容量，菜谱本身不维护产能 */
const mainStep = r => r.steps.find(s => s.isMain) || r.steps[0] || null;
/* 换主加工设备 = 把原本挂在「原主设备」上的步骤整体挪到新设备上（生产计划的人工调整）。
   下面的两个 helper 是这套挪动的唯一实现，排餐和生产计划共用，避免两处口径分叉 */
const effDeviceOf = (r, deviceOverride, dev) => {
  const orig = mainStep(r)?.device || r.steps[0]?.device || '';
  return (deviceOverride && deviceOverride !== orig && dev === orig) ? deviceOverride : dev;
};
const effDevices = (r, deviceOverride) => [...new Set(r.steps.map(s => effDeviceOf(r, deviceOverride, s.device)))];
/* 锅数 = ⌈W ÷ 设备额定容量⌉。一道菜可能跨多台设备，每台都得装得下 —— 取所有设备的锅数最大值。
   只按「主加工步骤」的产能算会漏掉非主步骤：焯水在小设备上时那一锅装不下 */
const potCountFor = (r, inputKg, deviceOverride) => {
  if (!r || !inputKg) return 1;
  const caps = effDevices(r, deviceOverride).map(deviceCapacity).filter(Boolean);
  return caps.length ? Math.max(1, ...caps.map(c => Math.ceil(inputKg / c))) : 1;
};
const potCountOf = (p, d, m, id) => potCountFor(findRecipe(id), inputTotalKg(p, d, m, id));

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
      usageText: k ? fmtQty(b.qty * k, b.unit) : '—',
      inputState: b.inputState, cut: b.cut, selfSupply: b.selfSupply
    };
  });
};
/* 纯人工菜：基准是「一份」，所以人均配量可以直接从菜谱派生 = Q × 出餐成品系数
   截到 3 位小数（0.001 kg = 1 g）—— 派生值与用户手输走同一口径，界面所见即所存。
   代价：倍数不再正好等于就餐人数（116 g × 91% = 105.56 g → 0.106 kg → k = 120.5） */
const derivedPerPerson = (r, yieldCoef) => {
  const Q = batchGram(r);
  return Q && yieldCoef ? round3((Q * (yieldCoef / 100)) / 1000) : 0;
};
const taskDurationSec = (id, potCount) => {
  const r = findRecipe(id); if (!r) return 0;
  return r.steps.reduce((s, x) => s + potCount * x.seconds, 0);
};

/* 首次进入某菜：纯人工菜按「每份投料 × 出餐成品系数」派生人均配量；含设备菜带入记忆值，无记忆则留空必填 */
function ensureDetail(p, d, m, id) {
  const key = `${d}|${m}|${id}`;
  if (p.details[key]) return p.details[key];
  const r = findRecipe(id);
  const memP = memoRead('perPerson', id);
  const memY = memoRead('yieldCoef', id);
  const yieldCoef = memY ? memY.value : (r?.yieldDefault ?? 90);
  const det = {
    perPerson: '', perPersonFrom: 'manual',
    yieldCoef,
    yieldOverridden: !!memY,
    yieldCustom: r?.yieldDefault ?? 90,   // 菜谱标准出餐成品系数 r0
    memo: memP ? memP.source : '',
    memoAt: memP ? memP.at : ''
  };
  if (memP) {                      // 人工覆盖过的值优先，不被菜谱刷新
    det.perPerson = memP.value; det.perPersonFrom = 'memory';
  } else if (r && !r.hasDevice) {  // 纯人工菜：一份的料 × 出餐成品系数 = 每人出品量
    det.perPerson = derivedPerPerson(r, yieldCoef);
    det.perPersonFrom = 'recipe';
  }
  p.details[key] = det;
  return p.details[key];
}

/* ============================ 7. 页面骨架 ============================ */

function page(id, cls) {
  let p = $(id);
  if (!p) { p = document.createElement('div'); p.id = id.slice(1); p.className = `page-view ${cls}`; p.hidden = true; $('.main').appendChild(p); }
  return p;
}
const mealPage = () => page('#mealPlanPage', 'mp-page');
const hideAll = nav => {
  PAGES.forEach(s => { const x = $(s); if (x) x.hidden = true; });
  $$('.nav-child').forEach(x => x.classList.toggle('active', x === nav));
};
const saved = w => plans().find(p => p.start === w);
const historical = () => week < monday(today());
const dirty = () => Object.keys(buffers).length > 0;
function load(w) {
  week = monday(w);
  const live = saved(week);                     // store 实体：生产计划的状态直接写在这里
  current = clone(buffers[week] || live || makePlan(week));
  /* statuses 归生产计划所有。排餐的未保存缓冲里没有它，
     如果照搬缓冲，刚在生产计划点的「开始生产」会被无声覆盖掉 */
  if (live) current.statuses = clone(live.statuses || {});
  current.headcounts ||= {}; current.details ||= {}; current.statuses ||= {}; current.adjustments ||= {};
}
function mark() { current.updated = ''; buffers[week] = clone(current); }
function reset() { activeOrg = org(); week = monday(today()); edit = false; buffers = {}; current = null; }

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

function enter() { hideAll($('#mealPlanNav')); mealPage().hidden = false; if (activeOrg !== org()) reset(); load(week); render(); }

function render() {
  if (!allowed()) {
    mealPage().innerHTML = '<section class="mp-card mp-gate"><i>周</i><h2>请选择食堂或档口</h2><p>排餐计划仅开放给食堂和档口。<br>请通过左上角“切换组织”选择实际供餐组织后继续。</p></section>';
    $('.breadcrumb').innerHTML = '计划管理&nbsp; / &nbsp;<strong>排餐计划</strong>';
    return;
  }
  workspace();
}

function workspace() {
  const p = current || load(week), old = historical();
  const removed = DAYS.map((n, i) => !p.activeDays.includes(i) ? `<button class="mp-restore-chip" data-restore-day="${i}">＋ 恢复${n}</button>` : '').join('');
  const sp = saved(week), changed = !!buffers[week];

  mealPage().innerHTML = `
  <section class="mp-card mp-workspace">
    <div class="mp-workspace-head">
      <div><h1>排餐计划</h1><p>按自然周安排每天各餐次的菜谱，并确定出品量</p></div>
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
    <div class="mp-week-meta">${old ? '历史周 · 仅支持查看' : changed ? '有未保存修改' : sp?.updated ? `已保存 · 最近更新：${sp.updated}` : '本周暂未排餐'}</div>
    <div class="mp-calc-note">
      <b>计算口径</b>
      <span>出品量 = 就餐人数 × 人均配量</span><i>→</i>
      <span>入锅投料总量 = 出品量 ÷ 出餐成品系数</span><i>→</i>
      <span>每行用量 = 基准投料 × 倍数（倍数 = 投料总量 ÷ 基准批次量）</span>
    </div>
    <div class="mp-section mp-week-section">
      <div class="mp-section-head">
        <div class="mp-week-heading"><h2>周排餐表</h2>
          <div class="mp-production-legend"><span>生产状态</span><i class="producing"></i>生产中<i class="complete"></i>生产完成<i class="none"></i>未开始</div>
        </div>
        ${edit && !old && removed ? `<div class="mp-removed-days"><span>未排日期</span>${removed}</div>` : ''}
      </div>
      ${table(p)}
    </div>
  </section>`;
  $('.breadcrumb').innerHTML = '计划管理&nbsp; / &nbsp;<strong>排餐计划</strong>';
  bind();
}

function historyIcon(p, i) {
  const r = p.adjustments?.[i] || [];
  return `<span class="mp-history-wrap"><button class="mp-history-button ${r.length ? 'has-record' : ''}" data-history-day="${i}">◷</button>
    <div class="mp-history-popover"><b>当日调整记录</b>${r.length
      ? r.map(x => `<p><strong>${x.time}　${x.meal}</strong><span>${x.type}：${esc(x.detail)}</span><small>${esc(x.reason)} · ${esc(x.operator)}</small></p>`).join('')
      : '<em>当日暂无调整记录</em>'}</div></span>`;
}

function table(p) {
  const can = edit && !historical();
  return `<div class="mp-week-wrap"><table class="mp-week"><thead><tr><th>餐次</th>${p.activeDays.map(i => {
    const d = add(p.start, i);
    return `<th><div class="mp-day-head"><div class="mp-day-title">${historyIcon(p, i)}<b>${DAYS[i]}${d === today() ? '<span class="mp-today-tag">今日</span>' : ''}</b></div>
      <span>${fmt(d)}</span><div class="mp-day-tools">${can && d > today() ? `<button class="mp-day-remove" data-remove-day="${i}">×</button>` : ''}</div></div></th>`;
  }).join('')}</tr></thead><tbody>${MEALS.map(m => `<tr><th class="mp-meal-head">${m}<small>${OPEN_TIME[m]} 开餐</small></th>${p.activeDays.map(i => cell(p, i, m)).join('')}</tr>`).join('')}</tbody></table></div>`;
}

function cell(p, i, m) {
  const d = add(p.start, i), past = d < today();
  const can = edit && !historical() && !past;
  const ids = p.schedule[i][m] || [];
  const hc = p.headcounts[`${i}|${m}`];

  const headcount = can
    ? `<div class="mp-headcount edit"><span>就餐</span><input type="number" min="1" max="9999" step="1" data-headcount="${i}|${m}" value="${hc?.value ?? ''}" placeholder="人数"><i>人</i>${hc?.memo ? `<em title="沿用上次：${esc(hc.memo)}">沿用${esc(hc.memo)}</em>` : ''}</div>`
    : `<div class="mp-headcount">${hc?.value ? `<span>就餐</span><b>${hc.value}</b><i>人</i>` : '<span class="mp-dim">未填人数</span>'}</div>`;

  const chips = ids.map(id => {
    const r = findRecipe(id), st = statusOf(p, i, m, id);
    const out = outputKg(p, i, m, id), inp = inputTotalKg(p, i, m, id);
    const locked = ['producing', 'complete'].includes(st);
    return `<div class="mp-dish-chip ${st ? 'prod-' + st : ''} ${locked ? 'blocked' : ''}"
      data-tip="${st === 'producing' ? '生产中 · 已锁定' : st === 'complete' ? '生产完成 · 已锁定' : '未开始 · 可修改'}"
      ${can ? `data-detail="${i}|${m}|${id}"` : ''}>
      <span class="mp-dish-name">${esc(r?.name || id)}</span>
      <span class="mp-dish-meta">${out ? fmtKg(out) : '未设出品量'}${inp ? ` · 投料 ${fmtKg(inp)}` : ''}</span>
      ${can && !locked ? `<button data-remove-dish="${i}|${m}|${id}" title="删除">×</button>` : ''}
    </div>`;
  }).join('');

  return `<td><div class="mp-cell ${past ? 'locked' : ''}">${headcount}${chips}${can ? `<button class="mp-add-dish" data-add-dish="${i}|${m}">＋ 添加菜谱</button>` : ''}</div></td>`;
}

function bind() {
  $('#mpPrev').onclick = () => go(add(week, -7));
  $('#mpNext').onclick = () => go(add(week, 7));
  if ($('#mpToday')) $('#mpToday').onclick = () => go(monday(today()));
  $('#mpWeekPicker').onchange = e => go(fromWeek(e.target.value));
  $$('[data-history-day]').forEach(x => x.onclick = () => openHistory(+x.dataset.historyDay));

  if (!edit) { $('#mpEdit').onclick = () => { edit = true; workspace(); }; return; }
  $('#mpCancelEdit').onclick = cancel;
  $('#mpSave').onclick = () => save(true);
  if (historical()) return;

  $('#mpCopy').onclick = openCopy;
  $$('[data-remove-day]').forEach(x => x.onclick = () => removeDay(+x.dataset.removeDay));
  $$('[data-restore-day]').forEach(x => x.onclick = () => { current.activeDays.push(+x.dataset.restoreDay); current.activeDays.sort(); mark(); workspace(); });
  $$('[data-headcount]').forEach(x => x.oninput = () => {
    const k = x.dataset.headcount;
    current.headcounts[k] = { value: Number(x.value) || 0, memo: '' };
    mark();
  });
  $$('[data-add-dish]').forEach(x => x.onclick = () => picker(x.dataset.addDish));
  $$('[data-detail]').forEach(x => x.onclick = e => { if (e.target.closest('[data-remove-dish]')) return; openDetail(x.dataset.detail); });
  $$('[data-remove-dish]').forEach(x => x.onclick = e => { e.stopPropagation(); removeDish(x.dataset.removeDish); });
}

const go = w => { load(w); workspace(); };

function cancel() { if (dirty() && !confirm('取消后将放弃本次所有修改，是否继续？')) return; buffers = {}; edit = false; load(week); workspace(); }

const saveHooks = [];
function commit() {
  const ps = plans(), stamp = new Date().toLocaleString('zh-CN', { hour12: false }).replaceAll('/', '-');
  Object.values(buffers).forEach(p => {
    p.status = 'active'; p.updated = stamp;
    const i = ps.findIndex(x => x.start === p.start);
    if (i < 0) ps.push(clone(p));
    /* 排餐从不修改 statuses，保存时把生产计划写的状态原样带回去，别被缓冲里的旧值覆盖 */
    else { p.statuses = ps[i].statuses || {}; ps[i] = clone(p); }
    memoCommit(p);           // 保存时才写记忆
  });
  buffers = {};
  saveHooks.forEach(f => { try { f(); } catch { /* 忽略 */ } });   // 通知生产计划刷新
}

function save(show) {
  if (!dirty()) { edit = false; load(week); workspace(); if (show) toast('当前没有需要保存的修改'); return; }
  const bad = validate();
  if (bad) { toast(bad); return; }
  commit(); edit = false; load(week); workspace();
  if (show) toast('排餐计划已保存并立即生效');
}

function validate() {
  for (const [k, hc] of Object.entries(current.headcounts)) {
    const [di, m] = k.split('|');
    if ((current.schedule[di][m] || []).length && !hc.value) return `${DAYS[di]} ${m} 请填写就餐人数`;
  }
  for (const [di, meals] of Object.entries(current.schedule)) {
    for (const [m, ids] of Object.entries(meals)) {
      if (!ids.length) continue;
      if (!current.headcounts[`${di}|${m}`]?.value) return `${DAYS[di]} ${m} 请填写就餐人数`;
      for (const id of ids) {
        const det = current.details[`${di}|${m}|${id}`];
        if (!det || !det.perPerson) return `${findRecipe(id)?.name || id} 请填写人均配量`;
        if (!det.yieldCoef || det.yieldCoef <= 0 || det.yieldCoef > 100) return `${findRecipe(id)?.name || id} 出餐成品系数应大于 0 且不超过 100%`;
      }
    }
  }
  return '';
}

/* ============================ 10. 菜品详情抽屉 ============================ */

function openDetail(key) {
  const [d, m, id] = key.split('|'), r = findRecipe(id);
  const det = ensureDetail(current, d, m, id);
  const hc = headcountOf(current, d, m);
  const out = hc * (Number(det.perPerson) || 0);
  const inp = det.yieldCoef ? out / (det.yieldCoef / 100) : 0;
  const st = statusOf(current, d, m, id);
  const locked = ['producing', 'complete'].includes(st);

  /* 用料换算：本次用量 = 菜谱投料 × k。整条链路与设备无关 —— 排餐这边不出现设备、锅数、时间 */
  const basis = r.hasDevice ? '菜谱投料' : '每份投料';
  const bomRows = input => usageOf(r, input).map(u => `<tr>
      <td><em class="mp-role ${u.role === '主料' ? 'main' : u.role === '辅料' ? 'side' : 'season'}">${esc(u.role)}</em></td>
      <td><b>${esc(u.ingredient)}</b>${u.selfSupply ? ' <em class="mp-tag self">自采</em>' : ''}<small>${esc(u.inputState)} · ${esc(u.cut)}</small></td>
      <td>${fmtRawQty(u.qty, u.unit)}</td>
      <td>${u.ratio != null ? `${Math.round(u.ratio * 1000) / 10}%` : '<span class="mp-dim" title="计数单位不进合计">—</span>'}</td>
      <td><b>${u.usageText}</b></td></tr>`).join('');
  const kHint = input => {
    const k = factorOf(r, input);
    return k ? `本次用量 = ${basis} × <b>${trimNum(k)}</b>` : `本次用量 = ${basis} × —`;
  };
  /* 人均配量默认值来源：纯人工=菜谱派生（菜谱改了自动刷新）；含设备=记忆代入 / 首次手填 */
  const memoNote = () => {
    if (locked) return '';
    if (det.perPersonFrom === 'recipe') return `<div class="mp-memo-note derived">人均配量按菜谱派生：${fmtQty(batchGram(r), 'g')} × 出餐成品系数 ${det.yieldCoef}% = <b>${det.perPerson}</b> kg/人，可直接修改。</div>`;
    if (det.perPersonFrom === 'memory') return `<div class="mp-memo-note">人均配量沿用 <b>${esc(det.memo)}</b> 的记录值${det.memoAt ? `（${esc(det.memoAt)}）` : ''}，可直接修改覆盖。</div>`;
    if (!det.perPerson) return '<div class="mp-memo-note first">该菜含设备加工，无法从菜谱推算人均配量，请填写；保存后下次排此菜自动代入。</div>';
    return '';
  };

  drawer(`${r.name}`, `${DAYS[d]} · ${m}　${st === 'producing' ? '生产中 · 已锁定' : st === 'complete' ? '生产完成 · 已锁定' : '未开始'}`,
    `${locked ? '<div class="mp-lock-note">该菜已开工，不能在排餐计划中修改或删除。如需调整请在生产计划中线下处理后重新排餐。</div>' : ''}
    <div class="mp-detail-grid">
      <label class="mp-field"><span>就餐人数</span><input type="number" min="1" max="9999" value="${hc}" disabled><i>人</i></label>
      <label class="mp-field"><span>人均配量 <b>*</b></span><input id="mpPerPerson" type="number" min="0.001" step="0.001" value="${det.perPerson || ''}" placeholder="请输入人均配量" ${locked ? 'disabled' : ''}><i>kg/人</i></label>
      <label class="mp-field"><span>出餐成品系数 <b>*</b></span><input id="mpYield" type="number" min="1" max="100" step="1" value="${det.yieldCoef || ''}" ${locked ? 'disabled' : ''}><i>%</i>
        <button type="button" class="mp-inline-btn" id="mpYieldReset" ${locked ? 'disabled' : ''}>恢复菜谱默认</button></label>
    </div>
    ${locked ? '' : '<div class="mp-dish-basis"><em class="mp-tag ' + (r.hasDevice ? 'device' : 'manual') + '">' + (r.hasDevice ? '含设备加工' : '纯人工') + '</em><span>用料明细按「' + (r.hasDevice ? '一次投料' : '一份') + '」配置</span></div>'}
    <div id="mpMemoNote">${memoNote()}</div>
    <div class="mp-derive-row">
      <div><span>出品量</span><b id="mpOutView">${out ? fmtKg2(out) : '—'}</b></div><i>=</i>
      <div><span>人数 × 人均配量</span><b id="mpFormula1">${hc} × ${det.perPerson || 0}</b></div>
    </div>
    <div class="mp-derive-row">
      <div><span>入锅投料总量</span><b id="mpInpView">${inp ? fmtKg2(inp) : '—'}</b></div><i>=</i>
      <div><span>出品量 ÷ 出餐成品系数</span><b id="mpFormula2">${det.yieldCoef ? `${trimNum(out)} ÷ ${det.yieldCoef}%` : '—'}</b></div>
    </div>
    <div class="mp-detail-section"><h4>用料换算　<span class="mp-pot-hint" id="mpKHint">${kHint(inp)}</span></h4>
      <table class="mp-mini-table"><thead><tr><th>用料角色</th><th>标准食材</th><th>${basis}</th><th>占比</th><th>本次用量</th></tr></thead><tbody id="mpBomBody">${bomRows(inp)}</tbody></table>
      <p class="mp-table-note">${basis}合计 <b>${fmtQty(batchGram(r), 'g')}</b>，每行本次用量 = 该行投料 × 倍数，单位保持菜谱原单位。${r.hasDevice
        ? '菜谱投料 = 菜谱一次的投料量，<b>与设备无关</b>；实际分几锅由生产计划按所选设备产能决定。'
        : '一份是一人份，本次用量按就餐人数等比放大。'}${r.hasUnmeasurable ? '<br><b>⚠ 有行走计数单位（个/只等），不计入合计，但仍按倍数放大。</b>' : ''}</p></div>`,
    `<button class="mp-secondary" id="mpDetailClose">关闭</button><span class="mp-spacer"></span>
     ${locked ? '' : `<button class="mp-danger" id="mpDetailRemove">删除此菜</button><button class="mp-secondary" id="mpDetailReplace">替换菜谱</button><button class="mp-primary" id="mpDetailSave">确定</button>`}`,
    true);

  $('#mpDetailClose').onclick = close;
  if (!locked) {
    /* 两个输入任一变化：派生数字、公式行、用料换算、倍数提示、来源提示全部同步重算。
       出品量是只读派生值，不存在反算路径 */
    const ppNow = () => round3(Number($('#mpPerPerson').value) || 0);
    const paint = (o, y) => {
      const input = y ? o / (y / 100) : 0;
      $('#mpOutView').textContent = o ? fmtKg2(o) : '—';
      $('#mpInpView').textContent = input ? fmtKg2(input) : '—';
      $('#mpFormula1').textContent = `${hc} × ${ppNow()}`;
      /* 公式行要把两个操作数都回显出来，只回显系数会让人看不出被除数是多少 */
      $('#mpFormula2').textContent = y ? `${trimNum(o)} ÷ ${y}%` : '—';
      $('#mpBomBody').innerHTML = bomRows(input);
      $('#mpKHint').innerHTML = kHint(input);
      $('#mpMemoNote').innerHTML = memoNote();
    };
    const sync = () => paint(hc * ppNow(), Number($('#mpYield').value) || 0);
    /* 派生来源→人工值：改过之后不再被菜谱刷新 */
    const toManual = () => { det.perPersonFrom = 'manual'; det.memo = ''; };

    $('#mpPerPerson').oninput = () => { toManual(); sync(); };
    /* 失焦时把输入值收敛到 3 位小数，界面上看到的数就是实际参与计算的数 */
    $('#mpPerPerson').onblur = () => {
      const v = ppNow();
      $('#mpPerPerson').value = v ? String(v) : '';
      sync();
    };
    /* 出餐成品系数：来源是「菜谱派生」的人均配量跟着一起算，人工值不动 */
    $('#mpYield').oninput = () => {
      det.yieldOverridden = true;
      const y = Number($('#mpYield').value) || 0;
      if (det.perPersonFrom === 'recipe') {
        det.perPerson = derivedPerPerson(r, y);
        $('#mpPerPerson').value = det.perPerson ? String(det.perPerson) : '';
      }
      sync();
    };
    $('#mpYieldReset').onclick = () => {
      det.yieldOverridden = false;
      $('#mpYield').value = det.yieldCustom;
      if (det.perPersonFrom === 'recipe') {
        det.perPerson = derivedPerPerson(r, det.yieldCustom);
        $('#mpPerPerson').value = det.perPerson ? String(det.perPerson) : '';
      }
      sync();
    };
    $('#mpDetailSave').onclick = () => {
      const pp = ppNow(), y = Number($('#mpYield').value) || 0;
      if (!pp) return toast('请输入人均配量');
      if (!y || y > 100) return toast('出餐成品系数取值应大于 0 且不超过 100%');
      det.perPerson = pp; det.yieldCoef = y;
      if (det.perPersonFrom !== 'recipe') det.memo = '';   // 人工值才清掉来源标记
      mark(); close(); workspace(); toast('已更新，保存后生效');
    };
    $('#mpDetailReplace').onclick = () => { close(); picker(`${d}|${m}`, id); };
    $('#mpDetailRemove').onclick = () => { close(); removeDish(key); };
  }
}

/* ============================ 11. 菜谱选择器 ============================ */

function picker(key, replace = '') {
  const [d, m] = key.split('|'), single = !!replace;
  const selected = new Set(single ? [replace] : []);
  const used = new Set((current.schedule[d][m] || []).filter(x => x !== replace));
  const cats = [...new Set(recipes.map(r => r.category))];
  const makers = [...new Set(recipes.flatMap(r => r.hasDevice ? r.steps.map(s => deviceMaker(s.device)) : []))];

  drawer(single ? '替换菜谱' : '添加菜谱', `${DAYS[d]} · ${m}`,
    `<div class="mp-recipe-tools">
      <input id="mpRecipeKeyword" placeholder="搜索菜谱名称">
      <select id="mpRecipeCategory"><option value="">全部分类</option>${cats.map(x => `<option>${x}</option>`).join('')}</select>
      <select id="mpRecipeMaker"><option value="">全部设备厂家</option>${makers.map(x => `<option>${x}</option>`).join('')}<option value="none">纯人工（无设备）</option></select>
     </div>
     <div class="mp-recipe-table-head"><span></span><span>图片</span><span>菜谱名称</span><span>分类</span><span>适用设备</span><span>加工方式</span></div>
     <div class="mp-recipe-list" id="mpRecipeList"></div>`,
    `<button class="mp-secondary" id="mpRecipeCancel">取消</button><span class="mp-spacer"></span><button class="mp-primary" id="mpRecipeConfirm">${single ? '确认替换' : '加入所选菜谱'}</button>`, true);

  const draw = () => {
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
    });
  };
  $('#mpRecipeKeyword').oninput = draw;
  $('#mpRecipeCategory').onchange = draw;
  $('#mpRecipeMaker').onchange = draw;
  $('#mpRecipeCancel').onclick = close;
  $('#mpRecipeConfirm').onclick = () => {
    const ids = [...selected];
    if (!ids.length) return toast('请至少选择一道菜谱');
    if (single) current.schedule[d][m] = (current.schedule[d][m] || []).map(x => x === replace ? ids[0] : x);
    else current.schedule[d][m] = [...(current.schedule[d][m] || []), ...ids];
    ids.forEach(id => ensureDetail(current, d, m, id));
    if (!current.headcounts[`${d}|${m}`]?.value) {
      const mem = memoRead('headcount', m);
      current.headcounts[`${d}|${m}`] = { value: mem ? mem.value : '', memo: mem ? mem.source : '' };
    }
    mark(); close(); workspace();
    if (!single) toast('已加入，请补全人均配量后保存');
  };
  draw();
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
     <div class="mp-copy-tip">复制将覆盖目标日期原有排餐，带入人数、人均配量与出餐成品系数，<b>不复制</b>调整记录与生产状态，<b>不写入</b>记忆。</div>`,
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
    current.schedule[i] = clone(p.schedule[i] || blank()[i]);
    MEALS.forEach(m => {
      const k = `${i}|${m}`, sk = `${i}|${m}`;
      if (p.headcounts[sk]) current.headcounts[k] = clone(p.headcounts[sk]);
      (p.schedule[i][m] || []).forEach(id => {
        const dk = `${sk}|${id}`;
        if (p.details[dk]) current.details[`${k}|${id}`] = clone(p.details[dk]);
      });
    });
    const active = p.activeDays.includes(i);
    current.activeDays = current.activeDays.filter(x => x !== i);
    if (active) current.activeDays.push(i);
  }
  current.activeDays.sort();
  current.adjustments = {}; current.statuses = {};
  mark(); close(); workspace(); toast('排餐已复制，请保存后生效');
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

function removeDish(v) {
  const [d, m, id] = v.split('|');
  const st = statusOf(current, d, m, id);
  const date = add(current.start, +d);
  const name = findRecipe(id)?.name || id;
  if (['producing', 'complete'].includes(st)) return toast(`该菜${st === 'producing' ? '正在生产' : '已生产完成'}，不能修改或删除`);
  const r = findRecipe(id);
  if (st === '' && r?.hasDevice && date >= today()) {
    if (!confirm('该菜已进入生产计划，删除后生产准备需重新安排，是否继续？')) return;
  }
  const apply = why => {
    current.schedule[d][m] = current.schedule[d][m].filter(x => x !== id);
    delete current.statuses[v]; delete current.details[v];
    if (date === today()) record(+d, m, '删除', name, why);
    mark(); close(); workspace();
  };
  date === today() ? reason('删除菜谱', apply) : (confirm(`确认删除“${name}”吗？`) && apply(''));
}

function openHistory(d) {
  const rows = current.adjustments?.[d] || [];
  drawer('当日调整记录', `${DAYS[d]} · ${add(current.start, d)}`,
    rows.length ? `<div class="mp-history-list">${rows.map(x => `<article><time>${x.time}</time><div><b>${x.meal} · ${x.type}</b><p>${esc(x.detail)}</p><small>原因：${esc(x.reason)}　操作人：${esc(x.operator)}</small></div></article>`).join('')}</div>` : '<div class="mp-empty">当日暂无排餐调整记录</div>',
    '<span class="mp-spacer"></span><button class="mp-primary" id="mpHistoryClose">关闭</button>');
  $('#mpHistoryClose').onclick = close;
}

/* ============================ 13. 组织切换拦截 ============================ */

function orgConfirm(button) {
  drawer('切换组织', '当前排餐还有未保存的修改',
    '<div class="mp-org-switch-tip">保存后将切换至所选组织；如需继续编辑，请取消切换。</div>',
    '<button class="mp-secondary" id="mpOrgCancel">取消切换</button><span class="mp-spacer"></span><button class="mp-primary" id="mpOrgSave">保存后切换</button>');
  $('#mpOrgCancel').onclick = close;
  $('#mpOrgSave').onclick = () => { commit(); edit = false; switchBypass = true; close(); button.click(); };
}

/* ============================ 14. 对外暴露 ============================ */

window.MerchantPlan = {
  MEALS, DAYS, OPEN_TIME, BUFFER_MIN, recipes, findRecipe, DEVICES, DEVICE_MODELS, deviceCapacity,
  deviceLabel, deviceMaker, deviceModel,
  today, add, monday, dayIndex, hm, toMin, fmt, fmtKg, fmtKg2, fmtQty, fmtRawQty, trimNum, esc, clone,
  org, allowed, plans, saved, overrides,
  headcountOf, detailOf, statusOf, lockedOf, outputKg, inputTotalKg, potCountOf, potCountFor,
  effDevices, effDeviceOf, taskDurationSec, mainStep,
  toGram, batchGram, factorOf, derivedPerPerson, usageOf,
  /* 用料换算结果（采购计划的输入）：每行含 食材/原单位/是否计入基准量/占比/本次用量 */
  bomUsageOf: (p, d, m, id) => usageOf(findRecipe(id), inputTotalKg(p, d, m, id)),
  isDeviceRecipe: id => !!findRecipe(id)?.hasDevice,
  hideAll, mealPage, toast, drawer, close,
  enterMealPlan: enter,
  openDetail: key => openDetail(key),
  refresh: () => { if (!mealPage().hidden) { load(week); render(); } },
  onSave: fn => { saveHooks.push(fn); }
};

/* ============================ 15. 安装 ============================ */

function install() {
  if ($('#mealPlanNav')) return;
  $('.sidebar').insertAdjacentHTML('beforeend',
    `<div class="nav-parent" id="planManagementParent"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M5 4h14v16H5zM8 2v4M16 2v4M8 10h8M8 14h5"/></svg><span>计划管理</span></div>
     <div class="nav-child" id="mealPlanNav"><span>排餐计划</span></div>
     <div class="nav-child" id="productionPlanNav"><span>生产计划</span></div>`);
  $('#mealPlanNav').onclick = e => { e.stopImmediatePropagation(); enter(); };
  $('#productionPlanNav').onclick = e => {
    e.stopImmediatePropagation();
    window.MerchantProduction ? window.MerchantProduction.enter() : toast('生产计划模块未加载');
  };
  $('#drawerList')?.addEventListener('click', e => {
    const b = e.target.closest('[data-select-org]');
    if (!b) return;
    if (switchBypass) { switchBypass = false; return; }
    if (!mealPage().hidden && dirty()) { e.preventDefault(); e.stopImmediatePropagation(); orgConfirm(b); }
  }, true);
  new MutationObserver(() => {
    if (org() === activeOrg) return;
    reset();
    if (!mealPage().hidden) { load(week); render(); }
    if ($('#productionPlanPage') && !$('#productionPlanPage').hidden) window.MerchantProduction?.enter();
  }).observe($('#currentOrganization'), { childList: true, characterData: true, subtree: true });
}

install();
})();
