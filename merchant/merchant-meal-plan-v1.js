/* 商户端 · 计划管理 —— 排餐计划 V2
   计算口径见《商户端计划管理PRD》V1.0：
     出品量   = 就餐人数 × 人均配量
     投料总量 = 出品量 ÷ 出餐成品系数
     食材用量 = 投料总量 × (菜谱投料量 ÷ Σ菜谱投料量)
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
        steps 设备加工步骤（设备 + 单锅时长秒 + 单锅标准产能 kg + 是否主加工）
        steps 为空 => 纯人工菜，不进生产计划 */

const dishArt = (name, index) => `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${['#f5a85f','#dc6f55','#f0c76b','#65b7a4','#80b96a'][index % 5]}"/><stop offset="1" stop-color="#fff1d8"/></linearGradient></defs><rect width="320" height="240" rx="18" fill="url(#g)"/><ellipse cx="160" cy="128" rx="108" ry="76" fill="#fff" opacity=".92"/><ellipse cx="160" cy="128" rx="82" ry="52" fill="#f4d089"/><circle cx="130" cy="112" r="18" fill="#d9583b"/><circle cx="180" cy="139" r="22" fill="#74a953"/><circle cx="190" cy="103" r="14" fill="#f0a13a"/><text x="160" y="218" text-anchor="middle" font-family="Microsoft YaHei,sans-serif" font-size="25" font-weight="700" fill="#59432d">${name}</text></svg>`)}`;

const RAW = {
  CP001: [ '宫保鸡丁', '热菜 / 小荤', 'V3',
    [['鸡胸肉', 30, '已切配', '切丁'], ['花生米', 8, '原始', '—'], ['黄瓜', 10, '已切配', '切丁'], ['调味料', 2, '已调制', '—']],
    [['预热炒锅', '智谷 A8', 60, 12, false], ['主料炒制', '智谷 A8', 180, 12, true], ['酱汁投放', '智谷 A8', 20, 12, false]] ],
  CP002: [ '红烧肉', '热菜 / 大荤', 'V4',
    [['五花肉', 32, '已切配', '切块'], ['土豆', 12, '已切配', '滚刀块'], ['调味料', 6, '已调制', '—']],
    [['煸炒上色', '优特 UT-C16', 240, 15, true], ['焖煮收汁', '优特 UT-C16', 600, 15, false]] ],
  CP003: [ '番茄炒蛋', '热菜 / 半荤半素', 'V2',
    [['番茄', 20, '已切配', '切块'], ['鸡蛋', 15, '原始', '—'], ['调味料', 3, '已调制', '—']], [] ],
  CP004: [ '紫菜蛋花汤', '汤粥 / 汤类', 'V2',
    [['紫菜', 1.5, '原始', '—'], ['鸡蛋', 6, '原始', '—'], ['调味料', 1.5, '已调制', '—']],
    [['批量煮制', '智谷 ZG-T30', 420, 30, true]] ],
  CP005: [ '清炒时蔬', '热菜 / 素菜', 'V5',
    [['时令蔬菜', 25, '已切配', '切段'], ['调味料', 1.5, '已调制', '—']], [] ],
  CP006: [ '葱油拌面', '主食 / 面食', 'V1',
    [['面条', 22, '原始', '—'], ['葱油', 3, '已预制', '—'], ['调味料', 1, '已调制', '—']],
    [['煮面', '优特 UT-P40', 150, 10, true], ['拌制', '优特 UT-P40', 60, 10, false]] ],
  CP007: [ '小米南瓜粥', '汤粥 / 粥类', 'V1',
    [['小米', 8, '原始', '—'], ['南瓜', 10, '已切配', '切块'], ['饮用水', 30, '原始', '—']],
    [['熬煮', '智谷 ZG-T30', 1800, 25, true]] ],
  CP008: [ '鸡蛋饼', '主食 / 点心', 'V2',
    [['面粉', 12, '原始', '—'], ['鸡蛋', 8, '原始', '—'], ['调味料', 1, '已调制', '—']], [] ],
  CP009: [ '土豆烧牛肉', '热菜 / 大荤', 'V3',
    [['牛肉', 28, '已切配', '切块'], ['土豆', 18, '已切配', '滚刀块'], ['调味料', 4, '已调制', '—']],
    [['焯水', '优特 UT-P40', 120, 14, false], ['烧制', '优特 UT-P40', 900, 14, true]] ],
  CP010: [ '水果拼盘', '其他 / 水果', 'V1',
    [['时令水果', 20, '已切配', '切块']], [] ]
};

const recipes = Object.entries(RAW).map(([id, r], i) => {
  const [name, category, version, bom, steps] = r;
  const bomRows = bom.map(([ingredient, qty, inputState, cut]) => ({ ingredient, qty, inputState, cut }));
  const stepRows = steps.map(([stepName, device, seconds, capacity, isMain]) => ({ stepName, device, seconds, capacity, isMain }));
  return {
    id, name, category, version, bom: bomRows, steps: stepRows,
    image: dishArt(name, i),
    device: steps.length ? [...new Set(steps.map(s => s.device))].join('、') : '—',
    hasDevice: stepRows.length > 0,
    bomTotal: bomRows.reduce((s, b) => s + b.qty, 0)
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
const hm = min => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(Math.round(min % 60)).padStart(2, '0')}`;
const toMin = t => { const [h, m] = String(t).split(':').map(Number); return h * 60 + m; };
const fmtKg = v => `${(Math.round(v * 10) / 10).toFixed(1).replace(/\.0$/, '')}kg`;

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
      const c0 = r.category.split(' / ')[0];
      p.details[`${d}|${m}|${id}`] = {
        perPerson: DEFAULT_PER_PERSON[c0] ?? 0.15,
        yieldCoef: r.yieldDefault,
        yieldOverridden: false,
        yieldCustom: r.yieldDefault,
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
    if (d?.perPerson) memoWrite('perPerson', id, d.perPerson, src);
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
/* 单锅标准产能取「主加工设备步骤」 */
const mainStep = r => r.steps.find(s => s.isMain) || r.steps[0] || null;
const potCountOf = (p, d, m, id) => {
  const r = findRecipe(id); const ms = r && mainStep(r);
  if (!ms || !ms.capacity) return 1;
  return Math.max(1, Math.ceil(inputTotalKg(p, d, m, id) / ms.capacity));
};
const taskDurationSec = (id, potCount) => {
  const r = findRecipe(id); if (!r) return 0;
  return r.steps.reduce((s, x) => s + potCount * x.seconds, 0);
};

/* 首次进入某菜：带入记忆值 */
function ensureDetail(p, d, m, id) {
  const key = `${d}|${m}|${id}`;
  if (p.details[key]) return p.details[key];
  const r = findRecipe(id);
  const memP = memoRead('perPerson', id);
  const memY = memoRead('yieldCoef', id);
  p.details[key] = {
    perPerson: memP ? memP.value : '',
    yieldCoef: memY ? memY.value : (r?.yieldDefault ?? 90),
    yieldOverridden: !!memY,
    yieldCustom: r?.yieldDefault ?? 90,   // 菜谱标准出餐成品系数 r0
    memo: memP ? memP.source : '',
    memoAt: memP ? memP.at : ''
  };
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
  current = clone(buffers[week] || saved(week) || makePlan(week));
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
      <span>生产锅数 = ⌈投料总量 ÷ 单锅标准产能⌉</span>
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
    ? `<div class="mp-headcount edit"><span>就餐</span><input type="number" min="1" step="1" data-headcount="${i}|${m}" value="${hc?.value ?? ''}" placeholder="人数"><i>人</i>${hc?.memo ? `<em title="沿用上次：${esc(hc.memo)}">沿用${esc(hc.memo)}</em>` : ''}</div>`
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
    i < 0 ? ps.push(clone(p)) : ps[i] = clone(p);
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

  /* 用料换算行随三输入实时重算 */
  const bomRows = input => r.bom.map(b => {
    const q = input ? input * (b.qty / r.bomTotal) : 0;
    return `<tr><td>${esc(b.ingredient)}</td><td>${b.qty}kg</td><td>${Math.round(b.qty / r.bomTotal * 1000) / 10}%</td><td><b>${q ? fmtKg(q) : '—'}</b></td><td>${esc(b.inputState)} · ${esc(b.cut)}</td></tr>`;
  }).join('');

  /* 预计锅数取主加工步骤的单锅产能，随投料量实时重算 */
  const capKg = mainStep(r)?.capacity;
  const potHint = input => r.steps.length
    ? `预计锅数 <b>${capKg && input ? Math.max(1, Math.ceil(input / capKg)) : 1}</b> 锅`
    : '纯人工菜谱，不进入生产计划';

  const stepRows = r.steps.length
    ? r.steps.map(s => `<tr><td>${esc(s.stepName)}</td><td>${esc(s.device)}</td><td>${s.seconds}s</td><td>${s.capacity}kg/锅${s.isMain ? ' <b class="mp-main-tag">主加工</b>' : ''}</td></tr>`).join('')
    : '<tr><td colspan="4" class="mp-dim">纯人工菜谱，不进入生产计划</td></tr>';

  drawer(`${r.name}`, `${DAYS[d]} · ${m}　${st === 'producing' ? '生产中 · 已锁定' : st === 'complete' ? '生产完成 · 已锁定' : '未开始'}`,
    `${locked ? '<div class="mp-lock-note">该菜已开工，不能在排餐计划中修改或删除。如需调整请在生产计划中线下处理后重新排餐。</div>' : ''}
    <div class="mp-detail-grid">
      <label class="mp-field"><span>就餐人数</span><input type="number" min="1" value="${hc}" disabled><i>人</i></label>
      <label class="mp-field"><span>人均配量 <b>*</b></span><input id="mpPerPerson" type="number" min="0.001" step="0.001" value="${det.perPerson || ''}" placeholder="请输入人均配量" ${locked ? 'disabled' : ''}><i>kg/人</i></label>
      <label class="mp-field"><span>出餐成品系数 <b>*</b></span><input id="mpYield" type="number" min="1" max="100" step="1" value="${det.yieldCoef || ''}" ${locked ? 'disabled' : ''}><i>%</i>
        <button type="button" class="mp-inline-btn" id="mpYieldReset" ${locked ? 'disabled' : ''}>恢复菜谱默认</button></label>
      <label class="mp-field"><span>出品量（可编辑）</span><input id="mpOutput" type="number" min="0" step="0.1" value="${out ? Math.round(out * 10) / 10 : ''}" ${locked ? 'disabled' : ''}><i>kg</i></label>
    </div>
    ${locked ? '' : det.memo ? `<div class="mp-memo-note">人均配量沿用 <b>${esc(det.memo)}</b> 的记录值${det.memoAt ? `（${esc(det.memoAt)}）` : ''}，可直接修改覆盖。</div>` : '<div class="mp-memo-note first">尚无历史记录：保存后将记住本次人均配量，下次排此菜时自动代入。</div>'}
    <div class="mp-derive-row">
      <div><span>出品量</span><b id="mpOutView">${out ? fmtKg(out) : '—'}</b></div><i>=</i>
      <div><span>人数 × 人均配量</span><b id="mpFormula1">${hc} × ${det.perPerson || 0}</b></div>
    </div>
    <div class="mp-derive-row">
      <div><span>入锅投料总量</span><b id="mpInpView">${inp ? fmtKg(inp) : '—'}</b></div><i>=</i>
      <div><span>出品量 ÷ 出餐成品系数</span><b id="mpFormula2">${det.yieldCoef ? det.yieldCoef + '%' : '—'}</b></div>
    </div>
    <div class="mp-detail-section"><h4>用料换算</h4>
      <table class="mp-mini-table"><thead><tr><th>标准食材</th><th>菜谱投料</th><th>占比</th><th>本次用量</th><th>投料状态</th></tr></thead><tbody id="mpBomBody">${bomRows(inp)}</tbody></table></div>
    <div class="mp-detail-section"><h4>设备加工步骤　<span class="mp-pot-hint" id="mpPotHint">${potHint(inp)}</span></h4>
      <table class="mp-mini-table"><thead><tr><th>步骤</th><th>设备</th><th>单锅时长</th><th>单锅产能</th></tr></thead><tbody>${stepRows}</tbody></table></div>`,
    `<button class="mp-secondary" id="mpDetailClose">关闭</button><span class="mp-spacer"></span>
     ${locked ? '' : `<button class="mp-danger" id="mpDetailRemove">删除此菜</button><button class="mp-secondary" id="mpDetailReplace">替换菜谱</button><button class="mp-primary" id="mpDetailSave">确定</button>`}`,
    true);

  $('#mpDetailClose').onclick = close;
  if (!locked) {
    /* 三个输入任一变化：派生数字、公式行、用料换算、锅数提示全部同步重算 */
    const paint = (o, y) => {
      const input = y ? o / (y / 100) : 0;
      $('#mpOutView').textContent = o ? fmtKg(o) : '—';
      $('#mpInpView').textContent = input ? fmtKg(input) : '—';
      $('#mpFormula1').textContent = `${hc} × ${Number($('#mpPerPerson').value) || 0}`;
      $('#mpFormula2').textContent = y ? `${y}%` : '—';
      $('#mpBomBody').innerHTML = bomRows(input);
      $('#mpPotHint').innerHTML = potHint(input);
      if (document.activeElement !== $('#mpOutput')) $('#mpOutput').value = o ? String(Math.round(o * 10) / 10) : '';
    };
    const sync = () => paint(hc * (Number($('#mpPerPerson').value) || 0), Number($('#mpYield').value) || 0);

    $('#mpPerPerson').oninput = sync;
    $('#mpYield').oninput = () => { det.yieldOverridden = true; sync(); };
    /* 出品量可直接编辑 —— 反算人均配量 */
    $('#mpOutput').oninput = () => {
      const o = Number($('#mpOutput').value) || 0;
      if (!hc) { toast('请先填写就餐人数'); return; }
      $('#mpPerPerson').value = o ? String(Math.round((o / hc) * 10000) / 10000) : '';
      paint(o, Number($('#mpYield').value) || 0);
    };
    $('#mpYieldReset').onclick = () => { det.yieldOverridden = false; $('#mpYield').value = det.yieldCustom; sync(); };
    $('#mpDetailSave').onclick = () => {
      const pp = Number($('#mpPerPerson').value) || 0, y = Number($('#mpYield').value) || 0;
      if (!pp) return toast('请输入人均配量');
      if (!y || y > 100) return toast('出餐成品系数取值应大于 0 且不超过 100%');
      det.perPerson = pp; det.yieldCoef = y; det.memo = '';
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
  const makers = [...new Set(recipes.flatMap(r => r.hasDevice ? r.steps.map(s => s.device.split(' ')[0]) : []))];

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
      const okMk = !mk || (mk === 'none' ? !r.hasDevice : r.steps.some(s => s.device.startsWith(mk + ' ')));
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
  MEALS, DAYS, OPEN_TIME, BUFFER_MIN, recipes, findRecipe,
  today, add, monday, dayIndex, hm, toMin, fmt, fmtKg, esc, clone,
  org, allowed, plans, saved, overrides,
  headcountOf, detailOf, statusOf, lockedOf, outputKg, inputTotalKg, potCountOf, taskDurationSec, mainStep,
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
