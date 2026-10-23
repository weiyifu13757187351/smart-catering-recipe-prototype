/* 商户端 · 计划管理 —— 生产计划 V3（逐台设备开工）
   口径见《商户端生产计划PRD》：
     - 只按排餐计划派生「含设备加工」的菜，作为**当日执行清单**；纯人工菜不进生产计划
     - 一道菜可能跨多台设备（菜谱加工步骤里每一步各自挂设备）：**每台设备独立开工、独立完成**，
       一台设备一条现场记录，撤销开工也只作用于那一台
     - 列表：「菜品 / 出品量 / 入锅投料总量 / 锅数」是整道菜共用的数据（合并单元格），
       「生产设备 / 加工时间 / 状态 / 操作」**按设备分行**展示，操作逐台独立
     - 统计与筛选按「道」算：一道菜的状态 = 它各台设备的聚合
       （全未开始 → 未开始；全完成 → 生产完成；其余 → 生产中）
     - **不做排程**：没有计划加工时间预排、没有灰字建议值、没有一键铺满、
       没有设备时间轴、没有排期冲突 / 超时检测、没有设备筛选
     - 设备来自菜谱加工步骤，本页**不让用户选设备**（开工只确定时间）
     - 本页只维护现场那一份记录：每台设备的状态 / 开工时间 / 完成时间，存在自己的 key 上，
       不回写排餐计划的任何字段
     - 锅数、出品量、入锅投料总量全部读排餐口径；已开工的设备同样跟随排餐刷新（不做开工定格）
   依赖 window.MerchantPlan（merchant-meal-plan-v1.js） */
(() => {
'use strict';

const MP = window.MerchantPlan;
if (!MP) return;
const { OPEN_TIME, esc, findRecipe, today, add, dayIndex,
        hm, toMin, hideAll, toast, drawer, close, outputKg, inputTotalKg, potsOf } = MP;

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const STATUS_LABEL = { not_started: '未开始', producing: '生产中', complete: '生产完成' };

let date = today(), filter = { meal: '', status: '' };
/* 当前范围令牌 = 组织 + 档口。组织层（没选档口）时 scopeKey() 都是空串，
   只看档口的话「组织层里换组织」会被判成没变化，总览会停在上一份数据上 */
const scopeToken = () => `${(window.MerchantScope && window.MerchantScope.current() ? window.MerchantScope.current().orgId : '') || MP.org() || ''}|${MP.scopeKey() || ''}`;
let activeScope = scopeToken();

/* 生产计划自己的现场记录（按档口分片）：
     { devices: { '设备机型': { status, startedAt, finishedAt } } }
   V3 从「一道菜一条记录」改成「一台设备一条记录」—— 一道菜跨多台设备时，
   状态与时间不再是一个整体的字段。键也从 v2 升到 v3：v2 的 {status, device, startedAt}
   若被读成新结构，会造出「同一道菜的每台设备都继承了那道菜的状态」这种假数据 */
const STORE = 'pp:task:v3';
const storeKey = () => `${STORE}:${MP.scopeKey() || 'org'}`;
function records() {
  try { return JSON.parse(localStorage.getItem(storeKey()) || '{}') || {}; } catch { return {}; }
}
function persistRecords(all) { try { localStorage.setItem(storeKey(), JSON.stringify(all)); } catch { /* 忽略 */ } }
function recordOf(key) { return records()[key] || {}; }
function devRecordsOf(key) { return recordOf(key).devices || {}; }
/* 只改一台设备的那条记录：同菜其它设备的状态与时间原样保留 */
function patchDevice(key, device, patch) {
  const all = records();
  const rec = all[key] || {};
  rec.devices = Object.assign({}, rec.devices);
  rec.devices[device] = Object.assign({}, rec.devices[device], patch);
  all[key] = rec;
  persistRecords(all);
}

const nowMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };

/* ============================ 1. 任务派生 ============================ */

const taskKey = (d, m, id) => `${d}|${m}|${id}`;

/* 原型示例数据（**相对今天**，任何时候打开都有「生产中 / 已完成 / 多设备只开了一台」的画面）：
   - CP002 午餐：单设备菜，生产中
   - CP001 午餐：单设备菜，昨天生产完成（顺带演示跨天回看）
   - CP009 午餐：**多设备菜**，只开了第一台（焯水），另一台（烧制）还没开工 —— 演示逐台开工
   设备与时间是开工的产物，只补状态会造出「生产中却没有开工时间」这种产品上不可能出现的画面 */
const DEMO_DONE = [
  { off: 0,  meal: '午餐', id: 'CP002', devices: { '优特 UT-C16': { status: 'producing', startedAt: 11 * 60 + 40 } } },
  { off: -1, meal: '午餐', id: 'CP001', devices: { '智谷 A8': { status: 'complete', startedAt: 10 * 60 + 20, finishedAt: 11 * 60 + 5 } } },
  { off: 0,  meal: '午餐', id: 'CP009', devices: { '智谷 ZG-T30': { status: 'producing', startedAt: 10 * 60 + 30 } } }
];
let demoReady = false;
function ensureDemo() {
  if (demoReady) return;
  demoReady = true;                                  // 先置位：下面会回调 tasksOf，别递归
  const w = MP.plans()[0]; if (!w) return;
  const base = MP.dayIndex(today());
  DEMO_DONE.forEach(x => {
    const di = base + x.off;
    if (di < 0 || di > 6) return;                     // 跨周就不种，别把状态写到别的周上
    const d = MP.add(w.start, di), key = taskKey(d, x.meal, x.id);
    if (recordOf(key).devices) return;                 // 用户已经动过就不碰
    Object.keys(x.devices).forEach(dev => patchDevice(key, dev, x.devices[dev]));
  });
}

function planOf(d) { return MP.plans().find(p => d >= p.start && d <= add(p.start, 6)) || null; }

/* 一道菜的设备清单：菜谱加工步骤里去重后的设备（保持步骤先后顺序） */
const devicesOf = r => [...new Set((r.steps || []).map(s => s.device).filter(Boolean))];
const stepsOfDevice = (r, dev) => (r.steps || []).filter(s => s.device === dev);
const stepNamesOf = (r, dev) => stepsOfDevice(r, dev).map(s => s.stepName).filter(Boolean).join('、');

/* 菜级聚合状态（统计条与筛选按「道」算）：
   全未开始 → 未开始；全完成 → 生产完成；其余（部分开工 / 部分完成）→ 生产中。
   设备名与开工 / 完成时间取一台代表值，供手机端这条「单设备视图」继续可用 */
function aggregate(devs) {
  const started = devs.filter(d => d.status !== 'not_started');
  const producing = devs.filter(d => d.status === 'producing');
  const allDone = devs.length > 0 && devs.every(d => d.status === 'complete');
  const cur = producing[0] || started[0] || devs[0] || null;
  const ats = devs.map(d => d.startedAt).filter(v => v != null);
  const fins = devs.map(d => d.finishedAt).filter(v => v != null);
  return {
    status: allDone ? 'complete' : (started.length ? 'producing' : 'not_started'),
    device: cur ? cur.device : '',
    startedAt: ats.length ? Math.min(...ats) : null,
    finishedAt: allDone && fins.length ? Math.max(...fins) : null
  };
}

function tasksOf(d) {
  ensureDemo();
  const plan = planOf(d);
  if (!plan) return [];
  const di = dayIndex(d), out = [];
  MP.meals().forEach(m => {
    (plan.schedule?.[di]?.[m] || []).forEach(id => {
      const r = findRecipe(id);
      if (!r?.hasDevice) return;                       // 只考虑设备加工的菜，纯人工菜不进生产计划
      const key = taskKey(d, m, id);
      const rec = devRecordsOf(key);
      const outKg = outputKg(plan, di, m, id);
      const W = inputTotalKg(plan, di, m, id);
      /* 锅数与用量完全由排餐计划决定，这里只读不算 */
      const potCount = Math.max(1, Number(potsOf(plan, di, m, id)) || 1);
      /* 每台设备一条现场记录：状态与时间各自独立；加工时间只算这台设备自己的步骤 */
      const devs = devicesOf(r).map(dev => {
        const s = rec[dev] || {};
        return {
          device: dev,
          stepNames: stepNamesOf(r, dev),
          status: s.status || 'not_started',
          startedAt: s.startedAt ?? null,
          finishedAt: s.finishedAt ?? null,
          durationSec: MP.deviceDurationSec(id, dev, potCount)
        };
      });
      const agg = aggregate(devs);
      out.push({
        key, date: d, plan, di, meal: m, recipeId: id, recipe: r,
        output: outKg,
        inputTotal: W,
        potCount,
        devs,                                          // 按设备分行展示的数据
        defaultDevice: devs[0]?.device || '',           // 菜谱加工步骤的第一台设备（手机端仍用它分组）
        device: agg.device,                             // 菜级聚合：代表设备
        status: agg.status,                             // 菜级聚合状态（统计 / 筛选口径）
        startedAt: agg.startedAt,
        finishedAt: agg.finishedAt,
        durationSec: MP.taskDurationSec(id, potCount)   // 整道菜合计（全部设备 × 锅数）
      });
    });
  });
  return out;
}

const durText = sec => sec >= 3600 ? `${Math.floor(sec / 3600)}h${Math.round((sec % 3600) / 60)}m`
                    : sec >= 60 ? `${Math.round(sec / 60)}m` : `${sec}s`;
const fmtKg2 = MP.fmtKg2;

/* ============================ 2. 状态流转 ============================ */
/* 动作层只有这一处实现，桌面与手机端共用 —— 绝不在页面里各写一份。
   startDevice / finishDevice / undoDevice 一次只动**一台设备**；
   startTask / finishTask / undoStart 是手机端（单设备视图）用的入口：
   带了 device 就只动那一台，没带就作用于这道菜当前「生产中」的设备 */

function startDevice(t, device, at) {
  if (!t || !device) return;
  patchDevice(t.key, device, {
    status: 'producing',
    startedAt: at != null ? at : nowMin(),
    finishedAt: null
  });
}
function finishDevice(t, device, at) {
  if (!t || !device) return;
  patchDevice(t.key, device, { status: 'complete', finishedAt: at != null ? at : nowMin() });
}
/* 撤销开工：这台设备回到「未开始」，并把开工时定下的时间**一并清空** ——
   留着时间就是一个「未开始却有开工时间」的脏状态。同菜其它设备不受影响 */
function undoDevice(t, device) {
  if (!t || !device) return;
  patchDevice(t.key, device, { status: 'not_started', startedAt: null, finishedAt: null });
}

const producingDevices = t => (t?.devs || []).filter(d => d.status === 'producing').map(d => d.device);

function startTask(t, opt = {}) {
  const dev = opt.device || t?.defaultDevice;
  startDevice(t, dev, opt.at);
}
function finishTask(t, opt = {}) {
  const list = opt.device ? [opt.device] : producingDevices(t);
  list.forEach(d => finishDevice(t, d, opt.at));
}
function undoStart(t, opt = {}) {
  const list = opt.device ? [opt.device] : producingDevices(t);
  list.forEach(d => undoDevice(t, d));
}

/* ============================ 3. 页面 ============================ */

function page() {
  let p = $('#productionPlanPage');
  if (!p) { p = document.createElement('div'); p.id = 'productionPlanPage'; p.className = 'page-view pp-page'; p.hidden = true; $('.main').appendChild(p); }
  return p;
}

function enter() {
  hideAll($('#productionPlanNav'));
  page().hidden = false;
  /* 范围（组织/档口）变了：筛选条件跟着作废，否则会拿旧档口的餐次筛新档口的任务 */
  const k = scopeToken();
  if (k !== activeScope) { activeScope = k; filter = { meal: '', status: '' }; }
  render();
}

/* 组织层：生产任务同样只挂在档口上，这里给该组织各档口的入口与当天任务概览 */
function stallOverview() {
  const list = (window.MerchantStalls && window.MerchantScope) ? window.MerchantStalls.listByOrg(window.MerchantScope.current().orgId) : [];
  const di = MP.dayIndex(date), wk = MP.monday(date);
  const cards = list.map(s => {
    const p = MP.savedPlanOf(s.id, wk);
    let count = 0;
    MP.meals().forEach(m => (p?.schedule?.[di]?.[m] || []).forEach(id => { if (MP.isDeviceRecipe(id)) count++; }));
    const owner = s.owner && s.owner.name ? `${s.owner.name}${s.owner.phone ? ' · ' + s.owner.phone : ''}` : '未指定负责人';
    return `<div class="mp-so-card" data-so-stall="${esc(s.id)}">
      <h4>${esc(s.name)}</h4>
      <p class="mp-so-owner">负责人：${esc(owner)}</p>
      <div class="mp-so-meals">${s.meals.map(m => `<span>${esc(m.meal)} ${esc(m.start)}–${esc(m.end)}</span>`).join('')}</div>
      <div class="mp-so-foot">${count ? `<b>${date} 待生产 ${count} 道</b>` : `<b>${date} 无设备菜任务</b>`}<span class="mp-so-enter">进入生产计划 ›</span></div>
    </div>`;
  }).join('');
  page().innerHTML = `
  <section class="mp-card mp-workspace pp-workspace">
    <div class="mp-workspace-head">
      <div><h1>生产计划</h1><p>由排餐计划自动派生，只包含含设备加工的菜；生产任务按档口归属，先选档口再看任务</p></div>
    </div>
    <div class="mp-week-toolbar">
      <button class="mp-week-nav" id="ppPrev">‹&nbsp; 前一天</button>
      <label class="pp-date-picker"><span>▣</span><input id="ppDate" type="date" value="${date}"></label>
      <button class="mp-week-nav" id="ppNext">后一天&nbsp; ›</button>
      ${date !== today() ? '<button class="mp-week-back" id="ppToday">↻&nbsp; 回到今天</button>' : ''}
    </div>
    <div class="mp-section mp-stall-overview">
      <div class="mp-section-head"><div class="mp-week-heading"><h2>${esc(MP.org() || '当前组织')}的档口</h2><span class="mp-so-tip">${date} 生产任务概览</span></div></div>
      ${list.length ? `<div class="mp-so-grid">${cards}</div>` : '<p class="mp-so-empty">暂无档口，请先创建档口</p>'}
    </div>
  </section>`;
  const bc = $('.breadcrumb'); if (bc) bc.innerHTML = '计划管理&nbsp; / &nbsp;<strong>生产计划</strong>';
  bind();
  mountScope();
  $$('[data-so-stall]').forEach(card => card.onclick = () => window.MerchantScope?.setStall(card.dataset.soStall));
}

/* 标题行下面的组织/档口切换器（与排餐计划同一个，切了这边也切）。
   和排餐一致：默认停在组织层「全部档口（总览）」，选了具体档口才进去 */
function mountScope() {
  const head = page().querySelector('.mp-workspace-head');
  if (head) window.MerchantScope?.mount(head, { stall: true, defaultAll: true });
}

/* 列表顺序：餐次分段（餐次信息由分隔行承载），段内「生产中 → 未开始 → 生产完成」。
   状态用**菜级聚合**：部分设备开工的菜算「生产中」，和统计卡口径一致。
   （sort 稳定，所以同组的相对顺序 = 排餐顺序） */
const statusRank = t => t.status === 'producing' ? 0 : t.status === 'not_started' ? 1 : 2;
const rowOrder = (a, b) => statusRank(a) - statusRank(b);

function render() {
  if (!MP.scopeKey()) return stallOverview();
  const all = tasksOf(date);
  const rows = all.filter(t =>
    (!filter.meal || t.meal === filter.meal) &&
    (!filter.status || t.status === filter.status));
  const counts = { not_started: 0, producing: 0, complete: 0 };
  all.forEach(t => counts[t.status]++);
  const openTime = [...new Set(all.map(t => t.meal))];

  page().innerHTML = `
  <section class="mp-card mp-workspace pp-workspace">
    <div class="mp-workspace-head">
      <div><h1>生产计划</h1><p>按排餐计划派生当日要加工的菜（只含设备加工）；一道菜跨多台设备时，<b>每台设备各自开工与完成</b>，本页的现场记录不回写排餐计划</p></div>
    </div>
    <div class="mp-week-toolbar">
      <button class="mp-week-nav" id="ppPrev">‹&nbsp; 前一天</button>
      <label class="pp-date-picker"><span>▣</span><input id="ppDate" type="date" value="${date}"></label>
      <button class="mp-week-nav" id="ppNext">后一天&nbsp; ›</button>
      ${date !== today() ? '<button class="mp-week-back" id="ppToday">↻&nbsp; 回到今天</button>' : ''}
    </div>

    <div class="pp-stats">
      <div><span>当日任务</span><b>${all.length}</b><i>道</i></div>
      <div><span>未开始</span><b>${counts.not_started}</b><i>道</i></div>
      <div><span>生产中</span><b class="on">${counts.producing}</b><i>道</i></div>
      <div><span>生产完成</span><b class="done">${counts.complete}</b><i>道</i></div>
    </div>

    <div class="pp-filters">
      <select id="ppFilterMeal"><option value="">全部餐次</option>${MP.meals().map(m => `<option ${filter.meal === m ? 'selected' : ''}>${m}</option>`).join('')}</select>
      <select id="ppFilterStatus"><option value="">全部状态</option>${Object.entries(STATUS_LABEL).map(([k, v]) => `<option value="${k}" ${filter.status === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
      <span class="pp-filter-note">已筛选 ${rows.length} / ${all.length} 道</span>
      <span class="mp-spacer"></span>
      <span class="pp-note">开餐时间：${openTime.length ? openTime.map(m => `${m} ${OPEN_TIME[m]}`).join('　') : '—'}</span>
    </div>

    ${all.length ? taskTable(rows) : emptyState()}
  </section>`;

  /* 面包屑属于桌面端外壳；手机端没有它，但不能因此让渲染中断（手机端复用的是本模块的逻辑） */
  const bc = $('.breadcrumb'); if (bc) bc.innerHTML = '计划管理&nbsp; / &nbsp;<strong>生产计划</strong>';
  bind();
  mountScope();
}

const emptyState = () => `<div class="mp-empty pp-empty">
  <b>当日暂无设备加工任务</b>
  <p>生产计划只包含菜谱中含设备加工步骤的菜。纯人工菜不进生产计划，但仍会进入后续的采购计划。</p></div>`;

/* ---------------------------- 任务表 ---------------------------- */
/* 8 列：菜品 / 出品量 / 入锅投料总量 / 锅数 / 生产设备 / 加工时间 / 状态 / 操作。
   前 4 列是**整道菜共用**的数据，用 rowspan 合并；后 4 列**按设备分行** ——
   一台设备的开工不影响同一道菜的其它设备，所以时间、状态、操作都挂在设备行上。
   统计与筛选仍按「道」算（菜级聚合状态）。 */
function taskTable(rows) {
  if (!rows.length) return '<div class="mp-empty">没有符合筛选条件的任务</div>';
  const COLS = 8;
  const body = MP.meals().flatMap(m => {
    const g = rows.filter(t => t.meal === m).sort(rowOrder);
    if (!g.length) return [];
    const done = g.filter(t => t.status === 'complete').length;
    const sep = `<tr class="pp-meal-sep"><td colspan="${COLS}">
      <b>${m}</b><span>开餐 ${OPEN_TIME[m]}</span><span>${g.length} 道</span>
      <em>${done ? `已完成 ${done} 道` : ''}</em></td></tr>`;
    return [sep, ...g.map(rowHtml)];
  }).join('');
  return `<div class="pp-table-wrap"><table class="pp-table">
    <thead><tr><th>菜品</th><th>出品量</th><th>入锅投料总量</th><th>锅数</th><th>生产设备</th><th>加工时间</th><th>状态</th><th>操作</th></tr></thead>
    <tbody>${body}</tbody></table></div>`;
}

/* 一台设备的加工时间：开工那一刻才有值，开工前显示 `—`；完成后给「开始 — 完成 · 时长」 */
function devTimeCell(d) {
  if (d.status === 'not_started' || d.startedAt == null) return '<span class="mp-dim">—</span>';
  return (d.status === 'producing' || d.finishedAt == null)
    ? `<b>${hm(d.startedAt)}</b> 开始`
    : `<b>${hm(d.startedAt)}</b> — <b>${hm(d.finishedAt)}</b><span class="pp-time-end">· ${durText(Math.max(0, d.finishedAt - d.startedAt) * 60)}</span>`;
}

function rowHtml(t) {
  const n = t.devs.length;
  const bind = d => `${t.key}|${d.device}`;
  /* 整道菜共用的 4 列：只在第一台设备那一行出现，纵向合并 n 行 */
  const shared = `
    <td class="pp-shared" rowspan="${n}"><div class="pp-dish"><img src="${t.recipe.image}" alt=""><div><b>${esc(t.recipe.name)}</b><small>${t.recipeId} · ${t.recipe.version}</small></div></div></td>
    <td class="pp-shared" rowspan="${n}">${t.output ? fmtKg2(t.output) : '<span class="mp-dim">未设出品量</span>'}</td>
    <td class="pp-shared" rowspan="${n}">${t.inputTotal ? fmtKg2(t.inputTotal) : '—'}</td>
    <td class="pp-shared" rowspan="${n}" title="锅数在排餐计划里确定，本页只读">${t.potCount} 锅</td>`;
  return t.devs.map((d, i) => `<tr data-meal="${t.meal}" data-key="${t.key}" data-dev="${esc(d.device)}"${i ? ' class="pp-dev-more"' : ''}>
    ${i === 0 ? shared : ''}
    <td class="pp-dev-cell">${esc(d.device)}${n > 1 ? `<em class="pp-dev-idx">第 ${i + 1} 台</em>` : ''}${d.stepNames ? `<small>${esc(d.stepNames)} · ${durText(d.durationSec)}</small>` : ''}</td>
    <td class="pp-time-cell">${devTimeCell(d)}</td>
    <td><span class="pp-status st-${d.status}">${STATUS_LABEL[d.status]}</span></td>
    <td><div class="pp-actions">
      ${d.status === 'not_started' ? `<button class="primary" data-start="${esc(bind(d))}" title="只开工这一台设备">开始生产</button>` : ''}
      ${d.status === 'producing' ? `<button class="primary" data-finish="${esc(bind(d))}" title="只完成这一台设备">完成</button>` : ''}
      ${d.status === 'producing' && t.date === today() ? `<button data-undo="${esc(bind(d))}" title="当天可撤销：这台设备回到未开始，可重新确定开工时间">撤销开工</button>` : ''}
      ${d.status === 'complete' ? '<button disabled>已完成</button>' : ''}
    </div></td>
  </tr>`).join('');
}

/* ============================ 4. 交互 ============================ */

function bind() {
  $('#ppPrev').onclick = () => { date = add(date, -1); render(); };
  $('#ppNext').onclick = () => { date = add(date, 1); render(); };
  if ($('#ppToday')) $('#ppToday').onclick = () => { date = today(); render(); };
  $('#ppDate').onchange = e => { date = e.target.value || today(); render(); };
  ['Meal', 'Status'].forEach(k => {
    const el = $(`#ppFilter${k}`);
    if (!el) return;                       /* 组织层总览没有筛选条 */
    el.onchange = () => { filter[k.toLowerCase()] = el.value; render(); };
  });
  /* 按钮携带「任务键 + 设备」：任务键本身含 `|`，所以从**最后一个** `|` 切分 */
  $$('button[data-start]').forEach(x => x.onclick = () => { const b = target(x.dataset.start); if (b) openStart(b.t, b.d.device); });
  $$('[data-finish]').forEach(x => x.onclick = () => { const b = target(x.dataset.finish); if (b) openFinish(b.t, b.d.device); });
  $$('[data-undo]').forEach(x => x.onclick = () => { const b = target(x.dataset.undo); if (b) openUndo(b.t, b.d.device); });
}

const findTask = key => tasksOf(date).find(t => t.key === key);
const target = raw => {
  const i = raw.lastIndexOf('|');
  if (i < 0) return null;
  const t = findTask(raw.slice(0, i));
  if (!t) return null;
  const dev = raw.slice(i + 1);
  const d = t.devs.find(x => x.device === dev) || t.devs[0];
  return d ? { t, d } : null;
};

/* 「开始生产」：**只开工列表里点的那一台设备**，开工时间在这一步确定。
   这道菜还有哪些设备、各自什么状态，在抽屉里**固定回显**（不再提供设备下拉） */
function openStart(t, device) {
  if (!t) return;
  const sel = device || t.devs[0]?.device || '';
  const defTime = hm(nowMin());
  const rows = t.devs.map(d => {
    const cap = MP.deviceCapacity(d.device);
    const meta = `${d.stepNames || '加工'} · 容量 ${cap ? cap + 'kg/锅' : '—'} · × ${t.potCount} 锅 = ${durText(d.durationSec)}`;
    return d.device === sel
      ? `<div class="pp-dev-row focus">
          <div class="pp-dev-info"><b>${esc(d.device)}</b><span>${esc(meta)}</span></div>
          <label class="pp-dev-time"><span>开工时间</span><input id="ppStartAt" type="time" value="${defTime}"><i>默认当前时刻，可改</i></label>
        </div>`
      : `<div class="pp-dev-row">
          <div class="pp-dev-info"><b>${esc(d.device)}</b><span>${esc(meta)}</span></div>
          <div class="pp-dev-read">${devStateText(d)}</div>
        </div>`;
  }).join('');
  drawer('开始生产', `${t.meal} · ${t.recipe.name}`, `
    <div class="pp-adjust-note">在<b>这一步</b>确定这台设备的<b>开工时间</b>；点确认即进入「生产中」，<b>不设单独的确认步骤</b>。</div>
    <div class="pp-dev-list">${rows}</div>
    <p class="pp-table-note">这道菜共 <b>${t.devs.length}</b> 台设备，各自独立开工与完成：本次只记录 <b>${esc(sel)}</b> 的开工时间${t.devs.length > 1 ? '，其余设备请在列表里点它那一行的「开始生产」' : ''}。</p>
    <div class="pp-adjust-calc two">
      <div><span>入锅投料总量</span><b>${t.inputTotal ? fmtKg2(t.inputTotal) : '—'}</b></div>
      <div><span>预计总时长（全设备合计）</span><b>${durText(t.durationSec)}</b></div>
    </div>`,
    `<button class="mp-secondary" id="ppStartCancel">取消</button><span class="mp-spacer"></span>
     <button class="mp-primary" id="ppStartOk">确认开始生产</button>`);
  $('#ppStartCancel').onclick = close;
  $('#ppStartOk').onclick = () => {
    const v = $('#ppStartAt').value;
    if (!v) return toast('请填写开工时间');
    startDevice(t, sel, toMin(v));
    close(); render();
    toast(`${t.recipe.name} · ${sel} 已进入生产中`);
  };
}

/* 设备当前状态的一句话回显（抽屉里那些「本次不涉及」的设备用） */
const devStateText = d => d.status === 'not_started' ? '未开始 · 本次不涉及'
  : d.status === 'producing' ? `生产中 · ${hm(d.startedAt)} 开始`
  : `生产完成 · ${hm(d.startedAt)} — ${hm(d.finishedAt)}`;

/* 「完成」：只完成被点的那台设备，同菜其它设备的状态与时间不受影响 */
function openFinish(t, device) {
  if (!t) return;
  const d = t.devs.find(x => x.device === device) || t.devs[0];
  if (!d) return;
  const end = nowMin();
  const spent = d.startedAt != null && end > d.startedAt ? durText((end - d.startedAt) * 60) : '—';
  drawer('完成生产', `${t.meal} · ${t.recipe.name}`, `
    <div class="pp-confirm-note">
      <p>确认后<b>这台设备</b>进入<b>生产完成</b>，不可回退到「生产中」。</p>
      <p class="mp-dim">误操作只能线下处理；「生产中」当天可以撤销开工。</p>
    </div>
    <div class="pp-adjust-calc">
      <div><span>生产设备</span><b>${esc(d.device)}</b></div>
      <div><span>开工时间</span><b>${d.startedAt != null ? hm(d.startedAt) : '—'}</b></div>
      <div><span>当前时刻</span><b>${hm(end)}</b></div>
      <div><span>已进行</span><b>${spent}</b></div>
    </div>
    ${t.devs.length > 1 ? `<p class="pp-table-note">这道菜共 <b>${t.devs.length}</b> 台设备，本次只完成 <b>${esc(d.device)}</b>；其余设备的状态与时间不变。</p>` : ''}`,
    `<button class="mp-secondary" id="ppFinishCancel">取消</button><span class="mp-spacer"></span>
     <button class="mp-primary" id="ppFinishOk">确认完成</button>`);
  $('#ppFinishCancel').onclick = close;
  $('#ppFinishOk').onclick = () => {
    finishDevice(t, d.device); close(); render();
    toast(`${t.recipe.name} · ${d.device} 生产完成`);
  };
}

/* 撤销开工：只对**当天**的「生产中」设备开放。这台设备回到未开始 → 可重新确定开工时间 */
function openUndo(t, device) {
  if (!t) return;
  const d = t.devs.find(x => x.device === device) || t.devs[0];
  if (!d) return;
  drawer('撤销开工', `${t.meal} · ${t.recipe.name}`, `
    <div class="pp-confirm-note">
      <p><b>${esc(d.device)}</b> 回到<b>未开始</b>：这台设备本次确定的<b>开工时间会一并清空</b>，可以重新定时间。</p>
      <p class="mp-dim">只对当天的设备开放；已「生产完成」的不可回退。</p>
    </div>
    <div class="pp-adjust-calc two">
      <div><span>生产设备</span><b>${esc(d.device)}</b></div>
      <div><span>开工时间</span><b>${d.startedAt != null ? hm(d.startedAt) : '—'}</b></div>
    </div>
    ${t.devs.length > 1 ? `<p class="pp-table-note">这道菜共 <b>${t.devs.length}</b> 台设备，本次只撤销 <b>${esc(d.device)}</b>；其余设备不受影响。</p>` : ''}`,
    `<button class="mp-secondary" id="ppUndoCancel">取消</button><span class="mp-spacer"></span>
     <button class="mp-primary" id="ppUndoOk">确认撤销开工</button>`);
  $('#ppUndoCancel').onclick = close;
  $('#ppUndoOk').onclick = () => {
    undoDevice(t, d.device); close(); render();
    toast(`${t.recipe.name} · ${d.device} 已撤销开工`);
  };
}

/* ============================ 5. 安装 ============================ */

/* 动作层是公共的：手机端（车间）也走同一套规则，绝不能各写一份 ——
   状态流转、设备与时间的记录口径必须只有一处实现 */
window.MerchantProduction = {
  enter, tasksOf, render, taskKey, nowMin, STATUS_LABEL,
  startTask, finishTask, undoStart,
  startDevice, finishDevice, undoDevice
};
/* 排餐保存后，若生产计划正在显示则同步刷新 */
})();
