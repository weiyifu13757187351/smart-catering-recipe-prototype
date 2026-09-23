/* 商户端 · 计划管理 —— 生产计划 V1
   计算口径见《商户端计划管理PRD》V1.0：
     - 只派生「含设备加工」的菜；纯人工菜不进生产计划
     - 锅数 = ⌈入锅投料总量 ÷ 设备额定容量⌉，一道菜一个锅数，作用于该菜全部设备步骤
       单锅产能挂在设备型号主数据上，生产人员选设备时即可看到上限；换设备只建议新锅数，不自动覆盖人工值
     - 状态只有 2 个：生产中（开火前点确认）、生产完成（结束后点完成）
     - 派生值自动刷新，人工调整值永不自动覆盖
   依赖 window.MerchantPlan（merchant-meal-plan-v1.js） */
(() => {
'use strict';

const MP = window.MerchantPlan;
if (!MP) return;
const { MEALS, DAYS, OPEN_TIME, BUFFER_MIN, esc, findRecipe, today, add, dayIndex,
        hm, toMin, hideAll, toast, drawer, close, overrides, outputKg, inputTotalKg, mainStep } = MP;

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const EARLIEST = 5 * 60;            // 当天最早可开工 05:00
const STATUS_LABEL = { not_started: '未开始', producing: '生产中', complete: '生产完成' };

let date = today(), view = 'tasks', filter = { meal: '', device: '', status: '' };

/* ============================ 1. 任务派生 ============================ */

const taskKey = (d, m, id) => `${d}|${m}|${id}`;

function planOf(d) { return MP.plans().find(p => d >= p.start && d <= add(p.start, 6)) || null; }

function tasksOf(d) {
  const plan = planOf(d);
  if (!plan) return [];
  const di = dayIndex(d), out = [];
  MEALS.forEach(m => {
    (plan.schedule?.[di]?.[m] || []).forEach(id => {
      const r = findRecipe(id);
      if (!r?.hasDevice) return;                       // 只考虑设备加工的菜
      const key = taskKey(d, m, id);
      const ov = overrides()[key] || {};
      /* 主加工设备先定，锅数再按它算 —— 否则换了设备锅数还留在旧产能上 */
      const origDev = mainStep(r)?.device || r.steps[0]?.device || '';
      const mainDev = ov.mainDevice || origDev;
      const outKg = outputKg(plan, di, m, id);
      const W = inputTotalKg(plan, di, m, id);
      const autoPots = MP.potCountFor(r, W, mainDev);
      const potCount = ov.potCountOverridden ? ov.potCount : autoPots;
      /* 人工锅数是在某个设备容量下定的；容量后来变了就标出来，但不覆盖人工值 */
      const capNow = MP.deviceCapacity(mainDev);
      const sourceChanged = !!ov.potCountOverridden && ov.capAtOverride != null && ov.capAtOverride !== capNow;
      out.push({
        key, date: d, plan, di, meal: m, recipeId: id, recipe: r,
        output: outKg,
        inputTotal: W,
        autoPots, potCount, potCountOverridden: !!ov.potCountOverridden,
        mainDevice: mainDev, sequence: ov.sequence || 0,
        status: ov.status || 'not_started',
        adjusted: !!ov.adjusted, sourceChanged,
        startOverride: ov.startOverride ?? null,
        devices: MP.effDevices(r, mainDev),
        /* 每锅投料量：均分。由 锅数 = ⌈W ÷ C⌉ 可证 恒 ≤ 设备额定容量 */
        perPot: potCount ? W / potCount : 0
      });
    });
  });
  return out;
}

/* 计算每个任务的设备操作块（锅数已展开）。换了主加工设备，原本挂在原主设备上的步骤要跟着挪过去 */
function opsOf(t) {
  return t.recipe.steps.map(s => ({
    device: MP.effDeviceOf(t.recipe, t.mainDevice, s.device),
    stepName: s.stepName, isMain: s.isMain,
    seconds: t.potCount * s.seconds
  }));
}
const totalSec = t => t.recipe.steps.reduce((s, x) => s + t.potCount * x.seconds, 0);
const durText = sec => sec >= 3600 ? `${Math.floor(sec / 3600)}h${Math.round((sec % 3600) / 60)}m`
                    : sec >= 60 ? `${Math.round(sec / 60)}m` : `${sec}s`;

/* ============================ 2. 排程 ============================ */
/* 按开餐时间倒推，逐设备串行：设备上的前一道菜必须在本道菜之前结束 */

function scheduleAll(list) {
  MP.MEALS.forEach(m => {
    const group = list.filter(t => t.meal === m);
    if (!group.length) return;
    const open = toMin(OPEN_TIME[m] || '12:00'), deadline = open - BUFFER_MIN;
    const devFree = {};

    group.sort((a, b) => (a.sequence || 999) - (b.sequence || 999) || totalSec(b) - totalSec(a));

    group.forEach(t => {
      const ops = opsOf(t);
      /* 时间刻度统一用「分钟」：ops[].seconds 是秒，参与排程前必须 ÷60 */
      let end = t.startOverride != null ? t.startOverride + totalSec(t) / 60 : deadline;
      if (t.startOverride == null) {
        for (let i = ops.length - 1; i >= 0; i--) {
          end = Math.min(end, devFree[ops[i].device] ?? deadline);
          ops[i].end = end; ops[i].start = end - ops[i].seconds / 60;
          end = ops[i].start;
        }
      } else {
        let cur = t.startOverride;
        ops.forEach(o => { o.start = cur; o.end = cur + o.seconds / 60; cur = o.end; });
      }
      t.ops = ops;
      t.startMin = ops[0].start;
      t.endMin = ops[ops.length - 1].end;
      ops.forEach(o => { devFree[o.device] = Math.min(devFree[o.device] ?? deadline, o.start); });
    });
  });

  /* 冲突检测：同设备时间块重叠，或排期早于最早开工时间 */
  list.forEach(t => { t.conflict = false; t.overrun = false; });
  const byDevice = {};
  list.forEach(t => t.ops.forEach(o => (byDevice[o.device] ||= []).push({ t, s: o.start, e: o.end })));
  Object.values(byDevice).forEach(blocks => {
    blocks.sort((a, b) => a.s - b.s);
    for (let i = 1; i < blocks.length; i++) {
      if (blocks[i].s < blocks[i - 1].e) { blocks[i].t.conflict = true; blocks[i - 1].t.conflict = true; }
    }
  });
  list.forEach(t => {
    if (t.startMin < EARLIEST) t.conflict = true;
    if (t.endMin > toMin(OPEN_TIME[t.meal] || '12:00') - BUFFER_MIN) t.overrun = true;
  });
  return list;
}

/* ============================ 3. 状态流转 ============================ */

/* 状态写回排餐计划的 statuses，供排餐页只读徽标展示 */
function setStatus(t, status) {
  const key = taskKey(t.date, t.meal, t.recipeId);
  (overrides()[key] ||= {}).status = status;
  t.plan.statuses ||= {};
  const pk = `${t.di}|${t.meal}|${t.recipeId}`;
  if (status === 'not_started') delete t.plan.statuses[pk];
  else t.plan.statuses[pk] = status;
  MP.refresh();
}

function setOverride(t, patch) {
  const key = taskKey(t.date, t.meal, t.recipeId);
  const ov = (overrides()[key] ||= {});
  ov.status ||= t.status;
  Object.assign(ov, patch, { adjusted: true });
  render();
  MP.refresh();
}

/* ============================ 4. 页面 ============================ */

function page() {
  let p = $('#productionPlanPage');
  if (!p) { p = document.createElement('div'); p.id = 'productionPlanPage'; p.className = 'page-view pp-page'; p.hidden = true; $('.main').appendChild(p); }
  return p;
}

function enter() {
  hideAll($('#productionPlanNav'));
  page().hidden = false;
  if (!MP.allowed()) {
    page().innerHTML = '<section class="mp-card mp-gate"><i>产</i><h2>请选择食堂或档口</h2><p>生产计划仅开放给食堂和档口。<br>请通过左上角“切换组织”选择实际供餐组织后继续。</p></section>';
    $('.breadcrumb').innerHTML = '计划管理&nbsp; / &nbsp;<strong>生产计划</strong>';
    return;
  }
  render();
}

function render() {
  const all = tasksOf(date);
  const seq = scheduleAll(all);
  const devices = [...new Set(all.flatMap(t => t.ops.map(o => o.device)))].sort();
  const rows = all.filter(t =>
    (!filter.meal || t.meal === filter.meal) &&
    (!filter.device || t.ops.some(o => o.device === filter.device)) &&
    (!filter.status || t.status === filter.status));

  const conflicts = all.filter(t => t.conflict).length;
  const counts = { not_started: 0, producing: 0, complete: 0 };
  all.forEach(t => counts[t.status]++);
  const openTime = [...new Set(all.map(t => t.meal))];

  page().innerHTML = `
  <section class="mp-card mp-workspace pp-workspace">
    <div class="mp-workspace-head">
      <div><h1>生产计划</h1><p>由排餐计划自动派生，只包含含设备加工的菜；现场调整不回写排餐计划</p></div>
    </div>
    <div class="mp-week-toolbar">
      <button class="mp-week-nav" id="ppPrev">‹&nbsp; 前一天</button>
      <label class="pp-date-picker"><span>▣</span><input id="ppDate" type="date" value="${date}"></label>
      <button class="mp-week-nav" id="ppNext">后一天&nbsp; ›</button>
      ${date !== today() ? '<button class="mp-week-back" id="ppToday">↻&nbsp; 回到今天</button>' : ''}
      <div class="pp-view-switch">
        <button class="${view === 'tasks' ? 'active' : ''}" data-view="tasks">任务视图</button>
        <button class="${view === 'timeline' ? 'active' : ''}" data-view="timeline">设备时间轴</button>
      </div>
      <span class="mp-spacer"></span>
      <button class="mp-secondary" id="ppResetSeq">一键按推荐顺序重排</button>
    </div>

    <div class="pp-stats">
      <div><span>当日任务</span><b>${all.length}</b><i>道</i></div>
      <div><span>未开始</span><b>${counts.not_started}</b><i>道</i></div>
      <div><span>生产中</span><b class="on">${counts.producing}</b><i>道</i></div>
      <div><span>生产完成</span><b class="done">${counts.complete}</b><i>道</i></div>
      <div><span>占用设备</span><b>${devices.length}</b><i>台</i></div>
      <div class="${conflicts ? 'warn' : ''}"><span>排期冲突</span><b>${conflicts}</b><i>处</i></div>
    </div>

    <div class="pp-filters">
      <select id="ppFilterMeal"><option value="">全部餐次</option>${MEALS.map(m => `<option ${filter.meal === m ? 'selected' : ''}>${m}</option>`).join('')}</select>
      <select id="ppFilterDevice"><option value="">全部设备</option>${devices.map(d => `<option ${filter.device === d ? 'selected' : ''}>${esc(d)}</option>`).join('')}</select>
      <select id="ppFilterStatus"><option value="">全部状态</option>${Object.entries(STATUS_LABEL).map(([k, v]) => `<option value="${k}" ${filter.status === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
      <span class="pp-filter-note">已筛选 ${rows.length} / ${all.length} 道</span>
      <span class="mp-spacer"></span>
      <span class="pp-note">开餐时间：${openTime.length ? openTime.map(m => `${m} ${OPEN_TIME[m]}`).join('　') : '—'}　出品缓冲 ${BUFFER_MIN} 分钟</span>
    </div>

    ${all.length ? (view === 'tasks' ? taskTable(rows) : timeline(rows, [...new Set(rows.flatMap(t => t.ops.map(o => o.device)))].sort())) : emptyState()}
  </section>`;

  $('.breadcrumb').innerHTML = '计划管理&nbsp; / &nbsp;<strong>生产计划</strong>';
  bind();
}

const emptyState = () => `<div class="mp-empty pp-empty">
  <b>当日暂无设备加工任务</b>
  <p>生产计划只包含菜谱中含设备加工步骤的菜。纯人工菜不进生产计划，但仍会进入后续的采购计划。</p></div>`;

/* ---------------------------- 任务视图 ---------------------------- */

function taskTable(rows) {
  if (!rows.length) return '<div class="mp-empty">没有符合筛选条件的任务</div>';
  return `<div class="pp-table-wrap"><table class="pp-table">
    <thead><tr><th>餐次</th><th>菜品</th><th>出品量</th><th>入锅投料总量</th><th>主加工设备</th><th>锅数</th><th>每锅投料</th><th>单锅时长</th><th>预计总时长</th><th>计划加工时间</th><th>顺序</th><th>状态</th><th>操作</th></tr></thead>
    <tbody>${rows.map(t => {
      const ms = mainStep(t.recipe);
      const locked = t.status !== 'not_started';
      return `<tr class="${t.conflict ? 'conflict' : ''}">
        <td>${t.meal}</td>
        <td><div class="pp-dish"><img src="${t.recipe.image}" alt=""><div><b>${esc(t.recipe.name)}</b><small>${t.recipeId} · ${t.recipe.version}</small></div></div></td>
        <td>${t.output ? MP.fmtKg2(t.output) : '<span class="mp-dim">未设出品量</span>'}</td>
        <td>${t.inputTotal ? MP.fmtKg2(t.inputTotal) : '—'}</td>
        <td>${esc(t.mainDevice)}${t.mainDevice !== ms?.device ? '<em class="pp-tag warn">已改</em>' : ''}</td>
        <td>${t.potCount} 锅${t.potCountOverridden ? '<em class="pp-tag">已调整</em>' : ''}${t.sourceChanged ? '<em class="pp-tag warn" title="该锅数是在旧设备容量下人工设定的">来源已变更</em>' : ''}</td>
        <td><b>${t.perPot ? MP.fmtKg2(t.perPot) : '—'}</b></td>
        <td>${ms ? ms.seconds + 's' : '—'}</td>
        <td>${durText(totalSec(t))}</td>
        <td><b>${hm(t.startMin)}</b> — ${hm(t.endMin)}${t.conflict ? '<em class="pp-tag danger">冲突</em>' : ''}${t.overrun ? '<em class="pp-tag danger">超时</em>' : ''}</td>
        <td>${t.sequence || '自动'}</td>
        <td><span class="pp-status st-${t.status}">${STATUS_LABEL[t.status]}</span></td>
        <td><div class="pp-actions">
          ${locked ? '<button disabled title="已开工，不能调整">调整</button>' : `<button data-adjust="${t.key}">调整</button>`}
          ${t.status === 'not_started' ? `<button class="primary" data-start="${t.key}">开始生产</button>` : ''}
          ${t.status === 'producing' ? `<button class="primary" data-finish="${t.key}">完成</button>` : ''}
          ${t.status === 'complete' ? '<button disabled>已完成</button>' : ''}
        </div></td>
      </tr>`;
    }).join('')}</tbody></table></div>`;
}

/* ---------------------------- 设备时间轴 ---------------------------- */

function timeline(all, devices) {
  if (!all.length) return emptyState();
  const openMax = Math.max(...all.map(t => toMin(OPEN_TIME[t.meal] || '12:00')));
  const from = EARLIEST, to = openMax;
  const span = to - from || 1;
  const ticks = [];
  for (let m = Math.ceil(from / 30) * 30; m <= to; m += 30) ticks.push(m);

  const lanes = devices.map(dev => {
    const blocks = [];
    all.forEach(t => t.ops.filter(o => o.device === dev).forEach(o => blocks.push({ t, o })));
    return `<div class="pp-lane">
      <div class="pp-lane-name">${esc(dev)}</div>
      <div class="pp-lane-track">
        ${ticks.map(m => `<i class="pp-grid" style="left:${(m - from) / span * 100}%"></i>`).join('')}
        <i class="pp-open" style="left:${(openMax - from) / span * 100}%" title="最晚开餐时间"></i>
        ${blocks.map(({ t, o }) => `<div class="pp-block st-${t.status} ${t.conflict ? 'conflict' : ''} ${o.isMain ? 'main' : ''}"
            style="left:${(o.start - from) / span * 100}%;width:${Math.max(1.5, o.seconds / 60 / span * 100)}%"
            title="${esc(t.recipe.name)} · ${esc(o.stepName)}　${hm(o.start)}-${hm(o.end)}　${t.potCount}锅${o.isMain ? '　主加工' : ''}">
            <b>${esc(t.recipe.name)}</b><small>${t.potCount}锅 · ${durText(o.seconds)}</small>
          </div>`).join('')}
      </div></div>`;
  }).join('');

  return `<div class="pp-timeline">
    <div class="pp-axis"><div class="pp-lane-name"></div><div class="pp-lane-track">
      ${ticks.map(m => `<span style="left:${(m - from) / span * 100}%">${hm(m)}</span>`).join('')}
    </div></div>
    ${lanes}
    <div class="pp-legend">
      <span><i class="sw st-not_started"></i>未开始</span>
      <span><i class="sw st-producing"></i>生产中</span>
      <span><i class="sw st-complete"></i>生产完成</span>
      <span><i class="sw conflict"></i>冲突（同设备时间重叠或早于 ${hm(EARLIEST)}）</span>
      <span>竖线为最晚开餐时间，已扣除 ${BUFFER_MIN} 分钟出品缓冲</span>
    </div>
  </div>`;
}

/* ============================ 5. 交互 ============================ */

function bind() {
  $('#ppPrev').onclick = () => { date = add(date, -1); render(); };
  $('#ppNext').onclick = () => { date = add(date, 1); render(); };
  if ($('#ppToday')) $('#ppToday').onclick = () => { date = today(); render(); };
  $('#ppDate').onchange = e => { date = e.target.value || today(); render(); };
  $$('[data-view]').forEach(x => x.onclick = () => { view = x.dataset.view; render(); });
  $('#ppResetSeq').onclick = () => {
    const ov = overrides();
    Object.keys(ov).forEach(k => { if (k.startsWith(date + '|')) { delete ov[k].sequence; delete ov[k].startOverride; ov[k].adjusted = true; } });
    render(); toast('已按推荐顺序重排');
  };
  ['Meal', 'Device', 'Status'].forEach(k => {
    const el = $(`#ppFilter${k}`);
    el.onchange = () => { filter[k.toLowerCase()] = el.value; render(); };
  });

  $$('[data-adjust]').forEach(x => x.onclick = () => openAdjust(findTask(x.dataset.adjust)));
  $$('[data-start]').forEach(x => x.onclick = () => confirmStart(findTask(x.dataset.start)));
  $$('[data-finish]').forEach(x => x.onclick = () => confirmFinish(findTask(x.dataset.finish)));
}

const findTask = key => scheduleAll(tasksOf(date)).find(t => t.key === key);

function openAdjust(t) {
  if (!t) return;
  const devs = [...new Set(t.recipe.steps.map(s => s.device))];
  /* 建议锅数与自动锅数共用同一个 helper：锅数要取所有占用设备里最大的那个，
     只按主加工设备产能算会漏掉非主步骤所在的设备（焯水在小设备上时那一锅装不下） */
  const potSuggest = dev => MP.potCountFor(t.recipe, t.inputTotal, dev);
  const capOf = dev => MP.deviceCapacity(dev) || '—';
  const capHint = dev => '本任务设备：' + MP.effDevices(t.recipe, dev)
    .map(d => `${esc(d)} ${capOf(d)}kg/锅`).join('　');
  const stepsBody = pots => t.recipe.steps.map(s =>
    `<tr><td>${esc(s.stepName)}${s.isMain ? ' <b class="mp-main-tag">主加工</b>' : ''}</td>` +
    `<td>${esc(MP.effDeviceOf(t.recipe, $('#ppAdjDevice')?.value || t.mainDevice, s.device))}</td>` +
    `<td>${s.seconds}s</td><td><b>${durText(pots * s.seconds)}</b></td></tr>`).join('');
  const usage = MP.bomUsageOf(t.plan, t.di, t.meal, t.recipeId);
  /* 每锅投料 = 总量 ÷ 锅数（均分）。锅数 = ⌈W ÷ C⌉ 保证均分后每锅都不超额定容量 */
  const perPot = (v, unit, pots) => (pots > 0 && v ? MP.fmtQty(v / pots, unit) : '—');
  const bomBody = pots => usage.map(u =>
    `<tr><td>${esc(u.ingredient)}</td><td>${u.usageText}</td><td><b>${perPot(u.usage, u.unit, pots)}</b></td></tr>`).join('');

  drawer('调整生产任务', `${t.meal} · ${t.recipe.name}`, `
    <div class="pp-adjust-note">现场调整只写生产计划，<b>不回写排餐计划</b>。派生值（出品量、入锅投料总量）会随排餐自动刷新，此处的人工调整值不会被覆盖。</div>
    <div class="mp-detail-grid">
      <label class="mp-field"><span>出品量（排餐派生）</span><input value="${t.output ? MP.fmtKg2(t.output) : '—'}" disabled></label>
      <label class="mp-field"><span>入锅投料总量（排餐派生）</span><input value="${t.inputTotal ? MP.fmtKg2(t.inputTotal) : '—'}" disabled></label>
      <label class="mp-field"><span>主加工设备</span>
        <select id="ppAdjDevice">${devs.map(d => `<option ${d === t.mainDevice ? 'selected' : ''}>${esc(d)}</option>`).join('')}</select>
        <i id="ppAdjCap">${capHint(t.mainDevice)}</i></label>
      <label class="mp-field"><span>锅数</span><input id="ppAdjPots" type="number" min="1" step="1" value="${t.potCount}"><i>锅</i>
        <button type="button" class="mp-inline-btn" id="ppAdjPotsAuto">按产能自动算（${t.autoPots} 锅）</button></label>
      <label class="mp-field"><span>加工顺序</span><input id="ppAdjSeq" type="number" min="0" step="1" value="${t.sequence || ''}" placeholder="留空为自动"><i>序号</i></label>
      <label class="mp-field"><span>计划开始时间</span><input id="ppAdjStart" type="time" value="${t.startOverride != null ? hm(t.startOverride) : ''}" placeholder="留空为自动倒推"></label>
    </div>
    <div class="pp-adjust-calc">
      <div><span>入锅投料总量</span><b>${t.inputTotal ? MP.fmtKg2(t.inputTotal) : '—'}</b></div>
      <div><span>当前锅数</span><b id="ppAdjPotsCell">${t.potCount} 锅</b></div>
      <div><span>每锅投料量</span><b id="ppAdjPerPot">${t.perPot ? MP.fmtKg2(t.perPot) : '—'}</b></div>
      <div><span>预计总时长</span><b id="ppAdjDur">${durText(totalSec(t))}</b></div>
      <div><span>自动排定时间</span><b>${hm(t.startMin)} — ${hm(t.endMin)}</b></div>
    </div>
    <div class="mp-detail-section"><h4>本任务用料　<span class="mp-pot-hint">每锅 = 总量 ÷ 锅数（均分）</span></h4>
      <table class="mp-mini-table"><thead><tr><th>食材</th><th>本任务总量</th><th>每锅投料</th></tr></thead>
      <tbody id="ppBomPerPot">${bomBody(t.potCount)}</tbody></table></div>
    <div class="mp-detail-section"><h4>设备加工步骤</h4>
      <table class="mp-mini-table"><thead><tr><th>步骤</th><th>设备</th><th>单锅时长</th><th>本任务占用</th></tr></thead>
      <tbody id="ppAdjStepsBody">${stepsBody(t.potCount)}</tbody></table></div>`,
    `<button class="mp-secondary" id="ppAdjCancel">取消</button><span class="mp-spacer"></span>
     <button class="mp-primary" id="ppAdjSave">保存调整</button>`);

  /* 锅数一变，每锅投料、本任务占用、总时长一起重算 */
  const syncPots = pots => {
    const p = Math.max(1, pots || 1);
    $('#ppAdjPotsCell').textContent = `${p} 锅`;
    $('#ppAdjPerPot').textContent = t.inputTotal ? MP.fmtKg2(t.inputTotal / p) : '—';
    $('#ppAdjDur').textContent = durText(t.recipe.steps.reduce((s, x) => s + p * x.seconds, 0));
    $('#ppBomPerPot').innerHTML = bomBody(p);
    $('#ppAdjStepsBody').innerHTML = stepsBody(p);
  };
  $('#ppAdjPots').oninput = () => syncPots(Number($('#ppAdjPots').value));
  /* 换设备 → 立刻显示新设备的产能上限与建议锅数（不自动覆盖人工锅数），
     步骤表里的设备也跟着挪，否则标签说换了、表里还是旧设备 */
  $('#ppAdjDevice').onchange = () => {
    const dev = $('#ppAdjDevice').value;
    $('#ppAdjCap').textContent = capHint(dev);
    $('#ppAdjPotsAuto').textContent = `按新设备建议锅数为 ${potSuggest(dev)}`;
    syncPots(Number($('#ppAdjPots').value));
  };
  $('#ppAdjPotsAuto').onclick = () => {
    $('#ppAdjPots').value = potSuggest($('#ppAdjDevice').value);
    syncPots(Number($('#ppAdjPots').value));
  };
  $('#ppAdjCancel').onclick = close;
  $('#ppAdjSave').onclick = () => {
    const pots = Number($('#ppAdjPots').value) || 1;
    if (pots < 1) return toast('锅数必须为大于 0 的整数');
    const seq = Number($('#ppAdjSeq').value) || 0;
    const st = $('#ppAdjStart').value;
    const dev = $('#ppAdjDevice').value;
    setOverride(t, {
      mainDevice: dev,
      potCount: pots,
      potCountOverridden: pots !== potSuggest(dev),
      /* 记下当时选中的设备容量，将来容量变更时可标「来源已变更」 */
      capAtOverride: MP.deviceCapacity(dev),
      sequence: seq || undefined,
      startOverride: st ? toMin(st) : undefined
    });
    close(); toast('任务已调整，排餐计划不受影响');
  };
}

function confirmStart(t) {
  if (!t) return;
  drawer('开始生产', `${t.meal} · ${t.recipe.name}`, `
    <div class="pp-confirm-note">
      <p>点「开始生产」即视为已确认设备与锅数，<b>不设单独的确认步骤</b>。</p>
      <p>进入<b>生产中</b>后，该菜在排餐计划中将被锁定，不能修改、替换或删除；本任务也不能再调整设备与锅数。</p>
    </div>
    <div class="pp-adjust-calc">
      <div><span>主加工设备</span><b>${esc(t.mainDevice)}</b></div>
      <div><span>锅数</span><b>${t.potCount} 锅</b></div>
      <div><span>每锅投料量</span><b>${t.perPot ? MP.fmtKg2(t.perPot) : '—'}</b></div>
      <div><span>计划加工时间</span><b>${hm(t.startMin)} — ${hm(t.endMin)}</b></div>
      <div><span>入锅投料总量</span><b>${t.inputTotal ? MP.fmtKg2(t.inputTotal) : '—'}</b></div>
    </div>`,
    `<button class="mp-secondary" id="ppStartCancel">取消</button><span class="mp-spacer"></span><button class="mp-primary" id="ppStartOk">确认开始生产</button>`);
  $('#ppStartCancel').onclick = close;
  $('#ppStartOk').onclick = () => { setStatus(t, 'producing'); close(); render(); toast(`${t.recipe.name} 已进入生产中，排餐计划中该菜已锁定`); };
}

function confirmFinish(t) {
  if (!t) return;
  drawer('完成生产', `${t.meal} · ${t.recipe.name}`, `
    <div class="pp-confirm-note">
      <p>确认该菜已出锅？完成后状态变为<b>生产完成</b>，该菜在排餐计划中永久锁定，不可修改或删除。</p>
      <p class="mp-dim">生产状态不可回退，如误操作请线下处理。</p>
    </div>`,
    `<button class="mp-secondary" id="ppFinishCancel">取消</button><span class="mp-spacer"></span><button class="mp-primary" id="ppFinishOk">确认完成</button>`);
  $('#ppFinishCancel').onclick = close;
  $('#ppFinishOk').onclick = () => { setStatus(t, 'complete'); close(); render(); toast(`${t.recipe.name} 生产完成`); };
}

/* ============================ 6. 安装 ============================ */

window.MerchantProduction = { enter, tasksOf, scheduleAll, render, setView: v => { view = v; } };
/* 排餐保存后，若生产计划正在显示则同步刷新 */
MP.onSave(() => { const p = $('#productionPlanPage'); if (p && !p.hidden) render(); });
})();
