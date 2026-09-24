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
const { MEALS, DAYS, OPEN_TIME, esc, findRecipe, today, add, dayIndex,
        hm, toMin, hideAll, toast, drawer, close, overrides, outputKg, inputTotalKg, mainStep } = MP;

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const EARLIEST = 5 * 60;            // 当天最早可开工 05:00
const STATUS_LABEL = { not_started: '未开始', producing: '生产中', complete: '生产完成' };

let date = today(), view = 'tasks', filter = { meal: '', device: '', status: '' };

/* ============================ 1. 任务派生 ============================ */

const taskKey = (d, m, id) => `${d}|${m}|${id}`;

/* 原型示例数据：种子里「已开工 / 已完成」的两道菜，只在排餐侧写了状态徽标，生产计划侧读不到，
   于是排餐显示「生产中」而生产计划显示「未开始」。这里把它补成真正的生产计划记录。
   **必须连带计划加工时间一起补** —— 新规则下「没填计划加工时间不许开工」，
   只补状态会造出产品上不可能出现的状态（已开工、却还显示「待排」且输入框是灰的）。 */
const DEMO_DONE = [
  { di: 2, meal: '午餐', id: 'CP002', status: 'producing' },
  { di: 1, meal: '午餐', id: 'CP001', status: 'complete' },
];
let demoReady = false;
function ensureDemo() {
  if (demoReady) return;
  demoReady = true;                                  // 先置位：下面会回调 tasksOf，别递归
  const w = MP.plans()[0]; if (!w) return;
  const ov = overrides();
  DEMO_DONE.forEach(x => {
    const d = MP.add(w.start, x.di), key = taskKey(d, x.meal, x.id);
    if ((ov[key] || {}).status) return;               // 用户已经动过就不碰
    const t = scheduleAll(tasksOf(d)).find(z => z.key === key);
    const o = (ov[key] ||= {});
    o.status = x.status;
    if (t) o.plannedStart = t.suggestStart;           // 已经在做的菜，计划时间本来就该有
  });
  MP.persist();                                       // 示例状态也落盘，免得刷新后计划与现场调整不同步
}

/* 任务是否「待排」：未填计划加工时间**且还没开工**。已开工的谈不上待排 */
const isPending = t => t.startMin == null && t.status === 'not_started';

function planOf(d) { return MP.plans().find(p => d >= p.start && d <= add(p.start, 6)) || null; }

function tasksOf(d) {
  ensureDemo();
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
      /* 装载：前几锅装满、尾锅装余量（口径实现在 MP.potLoadOf，与排餐共用）。
         人工改过锅数时按人工值摊，装满量仍取当前设备容量 */
      const load = MP.potLoadOf(r, W, mainDev, potCount);
      out.push({
        key, date: d, plan, di, meal: m, recipeId: id, recipe: r,
        output: outKg,
        inputTotal: W,
        autoPots, potCount, potCountOverridden: !!ov.potCountOverridden,
        mainDevice: mainDev,
        status: ov.status || plan.statuses?.[key] || 'not_started',
        adjusted: !!ov.adjusted, sourceChanged,
        /* 已开工 → 用量按开工那一刻定格（快照存在 override 上，排餐侧的 outputKg / inputTotalKg 会读它） */
        frozen: !!ov.frozen,
        /* 计划加工时间：**默认为空**，由生产人员自己填（排餐不预填）。
           为空时不许开工；suggestStart 是系统按开餐时间倒推的建议值，只用于灰字提示与「一键铺满」 */
        plannedStart: ov.plannedStart ?? null,
        devices: MP.effDevices(r, mainDev),
        /* 满锅投料量（= 最小占用设备的额定容量）/ 满锅数量 / 尾锅投料量。
           关系：满锅量 × 满锅数 ＋ 尾锅量 = W；未人工改锅数时保证 0 < 尾锅量 ≤ 满锅量。
           多开锅（loadEven）时没有「满锅/尾锅」之分，每锅都是 tailKg */
        capPerPot: load.even ? 0 : load.cap,
        fullPots: load.fullPots, tailKg: load.tail,
        loadEven: load.even, minPots: load.minPots, overCap: load.overCap
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
/* 「每锅投料」的文案：前几锅装满 + 尾锅余量。
   只有一锅时**没有**「满锅 / 尾锅」之分 —— 整批就是一锅，直接给投料量
   （写成「尾锅 25kg」会让人以为前面还有几锅，可锅数就是 1）。
   多开锅时没有尾锅可言，退回均分并标出来 */
const loadText = t => {
  if (!t.potCount || !t.inputTotal) return '—';
  if (t.loadEven) {
    return `每锅 <b>${MP.fmtKg2(t.tailKg)}</b>` +
      '<em class="pp-tag" title="锅数多于产能所需，按「装满」会把后面几锅留空，故按均分">均分</em>';
  }
  if (!t.capPerPot) return `<b>${MP.fmtKg2(t.inputTotal)}</b>`;
  const warn = t.overCap
    ? '<em class="pp-tag danger" title="锅数少于产能所需，这一锅超过设备额定容量">超上限</em>' : '';
  return t.fullPots === 0
    ? `<b>${MP.fmtKg2(t.tailKg)}</b>${warn}`
    : `<b>${MP.fmtKg2(t.capPerPot)}</b> × ${t.fullPots} ＋ 尾锅 <b>${MP.fmtKg2(t.tailKg)}</b>${warn}`;
};

/* ============================ 2. 排程 ============================ */
/* 按开餐时间倒推，逐设备串行：设备上的前一道菜必须在本道菜之前结束 */

/* 列表顺序：**已填时间的按时间升序在前，未填的按总时长从长到短聚在后面**（标「待排」）。
   未填的本来就没有加工顺序可言，所以不能让它们插在已填的中间 —— 否则「列表顺序 = 加工顺序」不成立，
   而且排到一半时看不出还剩几道没排。并列时再按菜谱号，保证顺序稳定可复现 */
const listOrder = (a, b) => {
  const na = a.startMin == null, nb = b.startMin == null;
  if (na !== nb) return na ? 1 : -1;
  if (!na) return (a.startMin - b.startMin) || a.recipeId.localeCompare(b.recipeId);
  return (totalSec(b) - totalSec(a)) || a.recipeId.localeCompare(b.recipeId);
};

/* 排程处理顺序。倒推排程下「先处理的任务拿到开餐时间那个槽」，
   所以这个顺序不是列表顺序，而是它的**反着**：
     1. **已填时间的先占位** —— 它是硬约束，若后处理会被算出来的建议值挤成**假冲突**；
     2. 未填的按「总时长从短到长」—— 倒推下最短的先拿到开餐那个槽，即最短的压轴出锅，
        配合默认的最长优先，自然满足「长菜先做、短菜临开餐做」 */
const processOrder = (a, b) => {
  const pa = a.plannedStart != null, pb = b.plannedStart != null;
  if (pa !== pb) return pa ? -1 : 1;
  if (pa) return a.plannedStart - b.plannedStart;
  return totalSec(a) - totalSec(b);
};

/* 排程：为**所有**任务算出建议时间（已填的先占位，未填的围绕它倒推），
   但只有已填的任务才落到 startMin / endMin —— 未填的只是「建议」，不构成计划 */
function scheduleAll(list) {
  MP.MEALS.forEach(m => {
    const group = list.filter(t => t.meal === m);
    if (!group.length) return;
    const open = toMin(OPEN_TIME[m] || '12:00'), deadline = open;
    const devFree = {};

    group.sort(processOrder);

    group.forEach(t => {
      const ops = opsOf(t);
      /* 时间刻度统一用「分钟」：ops[].seconds 是秒，参与排程前必须 ÷60 */
      const dur = ops.map(o => o.seconds / 60);
      const total = dur.reduce((s, x) => s + x, 0);
      let end;
      if (t.plannedStart != null) {
        /* 人工填的计划加工时间是**硬约束**，排程不许挪动它；放不下就交给冲突检测标红（只提示不阻断） */
        end = t.plannedStart + total;
      } else {
        /* 倒推求「任务结束时刻」：尽量晚（不晚于开餐时间），且每一步都要满足「该步结束 ≤ 该设备空闲时刻」。
           按「步结束相对任务结束的偏移」整体换算 —— 逐步 Math.min 会把任务从内部撕开
           （曾出现「焯水 12:52 就结束了、烧制 16:30 才开始」，任务内裂开 3.5 小时） */
        end = deadline;
        let off = 0;
        for (let i = ops.length - 1; i >= 0; i--) {
          end = Math.min(end, (devFree[ops[i].device] ?? deadline) + off);
          off += dur[i];
        }
      }
      /* 结束时刻定了之后正着铺满，保证任务内部连续（预计总时长 = 实际跨度）。
         已填计划时间时**直接从 plannedStart 起铺**，不能用 `end − total` 反推 ——
         浮点误差会让 startMin 变成 1019.9999999999999（实际是 17:00），
         后果是 hm() 打出「16:60」这种非法时间、时间轴的 floor 还会退一格到 16:30 */
      let cur = t.plannedStart != null ? t.plannedStart : end - total;
      ops.forEach((o, i) => { o.start = cur; o.end = cur + dur[i]; cur = o.end; });
      t.ops = ops;
      t.suggestStart = ops[0].start;
      if (t.plannedStart != null) {
        t.startMin = ops[0].start;
        t.endMin = ops[ops.length - 1].end;
      } else {
        t.startMin = null;                     // 未填 = 没有计划时间，不能开工
        t.endMin = null;
      }
      ops.forEach(o => { devFree[o.device] = Math.min(devFree[o.device] ?? deadline, o.start); });
    });
  });

  /* 冲突 / 超时检测：只对**已填时间**的任务做 —— 未填的没有承诺时间，谈不上冲突。
     已填的先占位，所以建议值不会与已填的撞；真正会撞的是人工填错的两道菜 */
  list.forEach(t => { t.conflict = false; t.overrun = false; });
  const committed = list.filter(t => t.startMin != null);
  const byDevice = {};
  committed.forEach(t => t.ops.forEach(o => (byDevice[o.device] ||= []).push({ t, s: o.start, e: o.end })));
  Object.values(byDevice).forEach(blocks => {
    blocks.sort((a, b) => a.s - b.s);
    for (let i = 1; i < blocks.length; i++) {
      if (blocks[i].s < blocks[i - 1].e) { blocks[i].t.conflict = true; blocks[i - 1].t.conflict = true; }
    }
  });
  committed.forEach(t => {
    if (t.startMin < EARLIEST) t.conflict = true;
    if (t.endMin > toMin(OPEN_TIME[t.meal] || '12:00')) t.overrun = true;
  });
  return list;
}

/* ============================ 3. 状态流转 ============================ */

/* 开工的准入判定：桌面按钮与手机端（车间）共用同一条 —— 没填计划加工时间不许开工 */
function startBlock(t) {
  if (!t) return '任务不存在';
  if (t.startMin == null) return '请先填写计划加工时间，再开始生产';
  return null;
}

/* 状态写回排餐计划的 statuses，供排餐页只读徽标展示 */
function setStatus(t, status) {
  const key = taskKey(t.date, t.meal, t.recipeId);
  const ov = (overrides()[key] ||= {});
  ov.status = status;
  /* 开工即定格：把这道菜此刻的用量口径冻住（出品量 / 入锅投料总量 / 锅数 / 主加工设备）。
     之后排餐再改就餐人数或人均配量，已经在做的菜不跟着变 —— 真实后厨语义：
     已经下锅的量不会因为后来改了人数而变。排餐侧的 outputKg / inputTotalKg 会读这份快照。
     撤销开工（回到 not_started）时解冻，恢复成跟随排餐实时口径 */
  if (status === 'producing') {
    ov.frozen = { output: t.output, inputTotal: t.inputTotal, potCount: t.potCount, mainDevice: t.mainDevice };
  } else if (status === 'not_started') {
    delete ov.frozen;
  }
  t.plan.statuses ||= {};
  const pk = `${t.di}|${t.meal}|${t.recipeId}`;
  if (status === 'not_started') delete t.plan.statuses[pk];
  else t.plan.statuses[pk] = status;
  MP.persist();          // 状态与定格快照要落盘，否则手机那侧看不到、刷新就丢
  MP.refresh();
}

function setOverride(t, patch) {
  const key = taskKey(t.date, t.meal, t.recipeId);
  const ov = (overrides()[key] ||= {});
  ov.status ||= t.status;
  Object.assign(ov, patch, { adjusted: true });
  MP.persist();          // 现场调整（设备/锅数/计划时间）同样要落盘
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
    /* 面包屑属于桌面端外壳；手机端没有它，但不能因此让渲染中断（手机端复用的是本模块的逻辑） */
  const bc = $('.breadcrumb'); if (bc) bc.innerHTML = '计划管理&nbsp; / &nbsp;<strong>生产计划</strong>';
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
  /* 时间轴只画已填时间的；待排的只报数量 */
  const committedRows = rows.filter(t => t.startMin != null);
  const pendingRows = rows.filter(isPending);

  /* 排期冲突只在「已填计划加工时间」的任务之间才有意义。一道都没填时显示「—」而不是 0，
     否则那个 0 会被误读成「已排好、没问题」。
     口径必须和横轴一致 —— 都按**筛选后**的集合算。否则筛到晚餐时会报「冲突 3 处」，
     而画面上（只画了筛选后的块）一处都看不到。被筛选隐藏的处数另给提示，别让它悄悄消失。 */
  const pendingCount = all.filter(isPending).length;
  const conflicts = rows.filter(t => t.conflict).length;
  const hiddenConflicts = all.filter(t => t.conflict).length - conflicts;
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
      ${pendingCount ? `<button class="mp-secondary" id="ppFillAll" title="按开餐时间倒推，把未填的计划加工时间补齐">按开餐时间自动排程（待排 ${pendingCount} 道）</button>` : ''}
    </div>

    <div class="pp-stats">
      <div><span>当日任务</span><b>${all.length}</b><i>道</i></div>
      <div><span>未开始</span><b>${counts.not_started}</b><i>道</i></div>
      <div><span>生产中</span><b class="on">${counts.producing}</b><i>道</i></div>
      <div><span>生产完成</span><b class="done">${counts.complete}</b><i>道</i></div>
      <div class="${pendingCount ? 'warn' : ''}"><span>待排</span><b>${pendingCount}</b><i>道</i></div>
      <div class="${conflicts ? 'warn' : ''}"${hiddenConflicts ? ` title="另有 ${hiddenConflicts} 处冲突被当前筛选隐藏"` : ''}><span>排期冲突</span><b>${all.length - pendingCount ? conflicts : '—'}</b><i>${all.length - pendingCount ? '处' : ''}</i>${hiddenConflicts ? `<em class="pp-hide-hint">+${hiddenConflicts} 被筛选隐藏</em>` : ''}</div>
    </div>

    <div class="pp-filters">
      <select id="ppFilterMeal"><option value="">全部餐次</option>${MEALS.map(m => `<option ${filter.meal === m ? 'selected' : ''}>${m}</option>`).join('')}</select>
      <select id="ppFilterDevice"><option value="">全部设备</option>${devices.map(d => `<option ${filter.device === d ? 'selected' : ''}>${esc(d)}</option>`).join('')}</select>
      <select id="ppFilterStatus"><option value="">全部状态</option>${Object.entries(STATUS_LABEL).map(([k, v]) => `<option value="${k}" ${filter.status === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
      <span class="pp-filter-note">已筛选 ${rows.length} / ${all.length} 道</span>
      <span class="mp-spacer"></span>
      <span class="pp-note">开餐时间：${openTime.length ? openTime.map(m => `${m} ${OPEN_TIME[m]}`).join('　') : '—'}</span>
    </div>

    ${all.length ? (view === 'tasks'
      ? taskTable(rows)
      : timeline(committedRows,
          [...new Set(committedRows.flatMap(t => t.ops.map(o => o.device)))].sort(),
          pendingRows.length)) : emptyState()}
  </section>`;

  /* 面包屑属于桌面端外壳；手机端没有它，但不能因此让渲染中断（手机端复用的是本模块的逻辑） */
  const bc = $('.breadcrumb'); if (bc) bc.innerHTML = '计划管理&nbsp; / &nbsp;<strong>生产计划</strong>';
  bind();
}

const emptyState = () => `<div class="mp-empty pp-empty">
  <b>当日暂无设备加工任务</b>
  <p>生产计划只包含菜谱中含设备加工步骤的菜。纯人工菜不进生产计划，但仍会进入后续的采购计划。</p></div>`;

/* ---------------------------- 任务视图 ---------------------------- */
/* 列表顺序：已填计划加工时间的按时间升序在前，未填的按时长倒序聚在后面标「待排」。
   按餐次分段。加工顺序不单独维护 —— 「第几个做」的最终含义就是「几点开始做」 */
function taskTable(rows) {
  if (!rows.length) return '<div class="mp-empty">没有符合筛选条件的任务</div>';
  const COLS = 11;   // 与 thead / 行的列数一致
  const body = MEALS.flatMap(m => {
    const g = rows.filter(t => t.meal === m).sort(listOrder);
    if (!g.length) return [];
    const groupLocked = g.some(t => t.status !== 'not_started');
    const pending = g.filter(isPending).length;
    const sep = `<tr class="pp-meal-sep${groupLocked ? ' locked' : ''}"><td colspan="${COLS}">
      <b>${m}</b><span>开餐 ${OPEN_TIME[m]}</span><span>${g.length} 道</span>
      <em>${pending ? `待排 ${pending} 道` : ''}</em></td></tr>`;
    return [sep, ...g.map(t => {
      const ms = mainStep(t.recipe);
      const locked = t.status !== 'not_started';
      const filled = t.startMin != null;
      return `<tr class="${t.conflict ? 'conflict' : ''}" data-meal="${m}" data-key="${t.key}">
        <td><div class="pp-dish"><img src="${t.recipe.image}" alt=""><div><b>${esc(t.recipe.name)}</b><small>${t.recipeId} · ${t.recipe.version}</small></div></div></td>
        <td>${t.output ? MP.fmtKg2(t.output) : '<span class="mp-dim">未设出品量</span>'}</td>
        <td>${t.inputTotal ? MP.fmtKg2(t.inputTotal) : '—'}</td>
        <td>${esc(t.mainDevice)}${t.mainDevice !== ms?.device ? '<em class="pp-tag warn">已改</em>' : ''}</td>
        <td>${t.potCount} 锅${t.potCountOverridden ? '<em class="pp-tag">已调整</em>' : ''}${t.sourceChanged ? '<em class="pp-tag warn" title="该锅数是在旧设备容量下人工设定的">来源已变更</em>' : ''}</td>
        <td>${loadText(t)}${t.frozen ? '<em class="pp-tag" title="已开工，用量按开工那一刻定格；排餐后来改就餐人数不会牵动这道菜">按开工时定格</em>' : ''}</td>
        <td>${ms ? ms.seconds + 's' : '—'}</td>
        <td>${durText(totalSec(t))}</td>
        <td class="pp-time">
          <input type="time" class="pp-time-in${filled ? ' pinned' : ''}" data-time="${t.key}"
            value="${filled ? hm(t.startMin) : ''}"
            ${locked ? 'disabled' : ''}
            title="${locked ? '已开工，不可调整' : (filled ? '已填计划加工时间；点 × 清除' : '请填写计划加工时间才能开始生产')}">
          ${filled ? `<span class="pp-time-end">— ${hm(t.endMin)}</span>${locked ? ''
                     : `<button class="pp-time-clear" data-clearstart="${t.key}" title="清除计划加工时间">×</button>`}`
                   : isPending(t) ? `<em class="pp-suggest" data-suggest="${t.key}" title="点击采用系统建议时间">建议 ${hm(t.suggestStart)}</em><em class="pp-tag warn">待排</em>`
                                  : '<span class="mp-dim">—</span>'}
          ${t.conflict ? '<em class="pp-tag danger">冲突</em>' : ''}${t.overrun ? '<em class="pp-tag danger">超时</em>' : ''}
        </td>
        <td><span class="pp-status st-${t.status}">${STATUS_LABEL[t.status]}</span></td>
        <td><div class="pp-actions">
          ${locked ? '<button disabled title="已开工，不能调整">调整</button>' : `<button data-adjust="${t.key}">调整</button>`}
          ${t.status === 'not_started' ? `<button class="primary" data-start="${t.key}">开始生产</button>` : ''}
          ${t.status === 'producing' ? `<button class="primary" data-finish="${t.key}">完成</button>` : ''}
          ${t.status === 'producing' && t.date === today() ? `<button data-undostart="${t.key}" title="当天可撤销：回到未开始，排餐计划同步解锁">撤销开工</button>` : ''}
          ${t.status === 'complete' ? '<button disabled>已完成</button>' : ''}
        </div></td>
      </tr>`;
    })];
  }).join('');
  return `<div class="pp-table-wrap"><table class="pp-table">
    <thead><tr><th>菜品</th><th>出品量</th><th>入锅投料总量</th><th>主加工设备</th><th>锅数</th><th>每锅投料</th><th>单锅时长</th><th>预计总时长</th><th>计划加工时间<small class="pp-th-note">改开始时间即调序</small></th><th>状态</th><th>操作</th></tr></thead>
    <tbody>${body}</tbody></table></div>`;
}

/* ---------------------------- 设备时间轴 ---------------------------- */
/* 时间轴画的是**已确定的计划**，所以只画已填计划加工时间的任务；
   未填的没有时间，画不出来，改用顶部提示条给出待排数量（不去轨道上画虚线块，避免与实块混淆） */

function timeline(committed, devices, pending) {
  const bar = pending ? `<div class="pp-pending-bar">
    <i>⏱</i><b>待排 ${pending} 道</b><span>这些任务还没填计划加工时间，填好（或点「按开餐时间自动排程」）后会出现在时间轴上。</span>
  </div>` : '';
  if (!committed.length) return `<div class="pp-timeline">${bar}<div class="mp-empty">
    <b>还没有已排的任务</b>
    <p>设备时间轴画的是已确定的计划。先填写计划加工时间，或点上方「按开餐时间自动排程」，这里就会显示时间块。</p></div></div>`;
  /* 横轴范围跟着「已排的任务」自适应，而不是恒定 05:00 起。
     写死 05:00 的后果：筛到晚餐时轴是 05:00—17:30（750 分钟），任务只占最后 21 分钟，
     97% 是空白、块被压成几十像素连菜名都放不下。
     下界 = 最早开工向下取整到半小时，上界 = max(最晚开餐, 最晚结束) 向上取整到半小时
     （上界要盖住「最晚结束」，否则超时任务会被画出轴外）。
     只留半小时对齐这一层 —— 再额外垫「开餐前 1 小时」会让空白重新吃掉三分之二，
     而刻度本身（17:00 / 17:30）已经给了开餐参照。 */
  const openMax = Math.max(...committed.map(t => toMin(OPEN_TIME[t.meal] || '12:00')));
  const from = Math.floor(Math.min(...committed.map(t => t.startMin)) / 30) * 30;
  const to = Math.max(Math.ceil(Math.max(openMax, ...committed.map(t => t.endMin)) / 30) * 30, from + 30);
  const span = to - from || 1;
  const ticks = [];
  for (let m = Math.ceil(from / 30) * 30; m <= to; m += 30) ticks.push(m);

  /* 块窄到放不下菜名时，标签改挂到块外侧（块内只留色带），否则只能显示成一两个字。
     阈值按「占轴长的比例」算 —— 轴会自适应，所以同一个绝对时长在不同筛选下宽窄不同。
     挂左边还是右边看块的位置：太靠左就挂右边，免得标签顶出轨道被裁掉。 */
  const NARROW = 0.06;
  const lanes = devices.map(dev => {
    /* 一台设备上同一个任务的若干步骤**合并成一个块**：各步骤本来就是连续的（排程保证「任务内部连续」）。
       不合并的话，宫保鸡丁在智谷 A8 上的 3 个步骤会画成 3 个各自只有几十像素的小块，
       每块都重复印一遍菜名，根本读不出来。步骤名挪到 tooltip 里逐个列出 */
    const blocks = [];
    committed.forEach(t => {
      const seg = t.ops.filter(o => o.device === dev);
      if (!seg.length) return;
      blocks.push({
        t, isMain: seg.some(o => o.isMain), steps: seg.map(o => o.stepName),
        s: Math.min(...seg.map(o => o.start)), e: Math.max(...seg.map(o => o.end))
      });
    });
    return `<div class="pp-lane">
      <div class="pp-lane-name">${esc(dev)}</div>
      <div class="pp-lane-track">
        ${ticks.map(m => `<i class="pp-grid" style="left:${(m - from) / span * 100}%"></i>`).join('')}
        <i class="pp-open" style="left:${(openMax - from) / span * 100}%" title="最晚开餐时间"></i>
        ${blocks.map(b => {
          const left = (b.s - from) / span, w = (b.e - b.s) / span;
          const narrow = w < NARROW;
          return `<div class="pp-block st-${b.t.status} ${b.t.conflict ? 'conflict' : ''} ${b.isMain ? 'main' : ''}${narrow ? ' narrow' : ''}"
            style="left:${left * 100}%;width:${Math.max(0.35, w * 100)}%"
            title="${esc(b.t.recipe.name)} · ${esc(b.steps.join(' → '))}　${hm(b.s)}-${hm(b.e)}　${b.t.potCount}锅${b.isMain ? '　主加工' : ''}">
            <b${narrow ? ` class="tag-${left < 0.18 ? 'right' : 'left'}"` : ''}>${esc(b.t.recipe.name)}</b><small>${b.t.potCount}锅 · ${durText((b.e - b.s) * 60)}</small>
          </div>`;
        }).join('')}
      </div></div>`;
  }).join('');

  return `<div class="pp-timeline">
    ${bar}
    <div class="pp-axis"><div class="pp-lane-name"></div><div class="pp-lane-track">
      ${ticks.map((m, i) => `<span class="${i === 0 ? 'first' : i === ticks.length - 1 ? 'last' : ''}" style="left:${(m - from) / span * 100}%">${hm(m)}</span>`).join('')}
    </div></div>
    ${lanes}
    <div class="pp-legend">
      <span><i class="sw st-not_started"></i>未开始</span>
      <span><i class="sw st-producing"></i>生产中</span>
      <span><i class="sw st-complete"></i>生产完成</span>
      <span><i class="sw conflict"></i>冲突（同设备时间重叠或早于 ${hm(EARLIEST)}）</span>
      <span>竖线为最晚开餐时间</span>
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
  /* 计划加工时间**默认为空**，由生产人员自己填。填了才算「已排」，未填的不许开工。
     已开工的任务输入框是 disabled，绑不上 */
  $$('.pp-time-in').forEach(x => {
    x.onchange = () => {
      /* 取值必须用 data-time —— 输入框挂的是 data-time，data-start 是「开始生产」按钮的属性。
         这里曾经写成 x.dataset.start → undefined → findTask 返回 undefined → 直接 return，
         手填计划加工时间**完全不生效**（不落记录、不清「待排」、开工永远提示「请先填写计划加工时间」） */
      const t = findTask(x.dataset.time);
      if (!t) return;
      const v = x.value;
      setOverride(t, { plannedStart: v ? toMin(v) : null });
      toast(v ? `计划加工时间已填 ${v}` : '已清除，返回待排');
    };
  });
  $$('[data-clearstart]').forEach(x => x.onclick = () => {
    const t = findTask(x.dataset.clearstart);
    if (t) { setOverride(t, { plannedStart: null }); toast('已清除，返回待排'); }
  });
  /* 灰字建议值：点一下就直接采用（不想自己算，又不想全天都铺满时用） */
  $$('[data-suggest]').forEach(x => x.onclick = () => {
    const t = findTask(x.dataset.suggest);
    if (!t) return;
    setOverride(t, { plannedStart: t.suggestStart });
    toast(`已采用建议时间 ${hm(t.suggestStart)}`);
  });
  /* 一键铺满：按开餐时间倒推，把**所有未填的**补齐。只填空的，已填的一律不动 */
  if ($('#ppFillAll')) $('#ppFillAll').onclick = () => {
    const ov = overrides(), tasks = tasksOf(date);
    const todo = tasks.filter(t => t.plannedStart == null && t.status === 'not_started');
    if (!todo.length) return toast('没有待排的任务');
    scheduleAll(tasks);                    // 已填的先占位，未填的围绕它们倒推
    todo.forEach(t => { const o = (ov[t.key] ||= {}); o.status ||= t.status; o.plannedStart = t.suggestStart; o.adjusted = true; });
    render();
    MP.refresh();
    toast(`已按开餐时间排好 ${todo.length} 道`);
  };
  ['Meal', 'Device', 'Status'].forEach(k => {
    const el = $(`#ppFilter${k}`);
    el.onchange = () => { filter[k.toLowerCase()] = el.value; render(); };
  });

  $$('[data-adjust]').forEach(x => x.onclick = () => openAdjust(findTask(x.dataset.adjust)));
  /* 开工硬校验：没填计划加工时间不允许开工，也不打开确认抽屉 —— 先聚焦到那个输入框。
     注意选择器**只能**匹配「开始生产」按钮：时间输入框曾经也叫 data-start，
     结果点时间框（本意是改时间）会走这里 —— 已填时弹出开工确认抽屉、未填时挨一句「请先填写计划加工时间」 */
  $$('button[data-start]').forEach(x => x.onclick = () => {
    const t = findTask(x.dataset.start);
    if (!t) return;
    if (startBlock(t)) {
      toast('请先填写计划加工时间，再开始生产');
      const inp = $(`.pp-time-in[data-time="${t.key}"]`);
      if (inp) { inp.focus(); inp.classList.add('need-fill'); setTimeout(() => inp.classList.remove('need-fill'), 1600); }
      return;
    }
    confirmStart(t);
  });
  $$('[data-finish]').forEach(x => x.onclick = () => confirmFinish(findTask(x.dataset.finish)));
  $$('[data-undostart]').forEach(x => x.onclick = () => confirmUndoStart(findTask(x.dataset.undostart)));
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
  const stepsBody = (pots, dev) => t.recipe.steps.map(s =>
    `<tr><td>${esc(s.stepName)}${s.isMain ? ' <b class="mp-main-tag">主加工</b>' : ''}</td>` +
    `<td>${esc(MP.effDeviceOf(t.recipe, dev || t.mainDevice, s.device))}</td>` +
    `<td>${s.seconds}s</td><td><b>${durText(pots * s.seconds)}</b></td></tr>`).join('');
  const usage = MP.bomUsageOf(t.plan, t.di, t.meal, t.recipeId);
  /* 设备一律**显式传进来**：打开抽屉时设备就是该任务的主加工设备，不能读 DOM ——
     此刻新抽屉的 select 还没写进去，`$('#ppAdjDevice').value` 拿到的是上一道菜留下的旧 select，
     派生投料量就按上一道菜的设备算了。实测：先看小米南瓜粥（ZG-T30）再开宫保鸡丁（智谷 A8），
     宫保鸡丁被按 30kg/锅 算成「均分 11.82kg」，而同一行的设备提示写着「智谷 A8 12kg/锅」。
     只有 `syncPots`（抽屉已存在、用户刚改了锅数或设备）才读 DOM。 */
  const devNow = () => $('#ppAdjDevice')?.value || t.mainDevice;
  const loadFor = (pots, dev) => MP.potLoadOf(t.recipe, t.inputTotal, dev || t.mainDevice, Math.max(1, pots || 1));
  /* 每锅投料 = 该行总量 × 该锅的量 ÷ 入锅投料总量，与「满锅量 × 满锅数 ＋ 尾锅量 = W」同口径 */
  const loadCell = (v, unit, kg, W) => (W > 0 && v && kg > 0 ? MP.fmtQty(v * kg / W, unit) : '—');
  const L0 = loadFor(t.potCount);
  /* 单锅任务没有「满锅 / 尾锅」之分：整批就是一锅，直接给投料量。
     抽屉里那三个地方（投料量字段、用料表表头、用料表尾锅列）必须和任务表同一口径，
     否则点进来又会看到「尾锅 25kg」 */
  const onePot = L => !L.even && L.pots === 1;
  const capLabel = L => (L.even ? '每锅投料量' : onePot(L) ? '投料量' : '满锅投料量');
  const capValue = L => (!t.inputTotal ? '—'
    : (L.even || onePot(L)) ? MP.fmtKg2(L.tail) : (L.fullPots ? MP.fmtKg2(L.cap) : '—'));
  const tailHidden = L => L.even || onePot(L);
  const bomHead = L => (L.even ? '每锅投料' : onePot(L) ? '投料量' : '满锅投料');
  const bomHint = L => (L.even ? '锅数多于产能所需，已改为均分：每锅 = 总量 ÷ 锅数'
    : onePot(L) ? '只有一锅，整批一次投料，没有满锅 / 尾锅之分'
    : '满锅 = 装到设备上限；尾锅 = 总量 − 满锅量 × 满锅数');
  const bomBody = (pots, dev) => {
    const L = loadFor(pots, dev);
    return usage.map(u => {
      /* 单锅 / 均分都没有「满锅 / 尾锅」之分，每格都是这一锅的实际投料，尾锅位留空 */
      const flat = L.even || onePot(L);
      const a = flat ? loadCell(u.usage, u.unit, L.tail, t.inputTotal)
                     : loadCell(u.usage, u.unit, L.fullPots ? L.cap : 0, t.inputTotal);
      const b = flat ? '—' : loadCell(u.usage, u.unit, L.tail, t.inputTotal);
      return `<tr><td>${esc(u.ingredient)}</td><td>${u.usageText}</td><td><b>${a}</b></td><td>${b}</td></tr>`;
    }).join('');
  };

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
      <label class="mp-field"><span>计划加工时间</span><input id="ppAdjStart" type="time" value="${t.plannedStart != null ? hm(t.plannedStart) : ''}"><i>默认为空，必须填了才能开始生产；系统建议 ${hm(t.suggestStart)}（任务表可一键采用）</i></label>
    </div>
    <div class="pp-adjust-calc">
      <div><span>入锅投料总量</span><b>${t.inputTotal ? MP.fmtKg2(t.inputTotal) : '—'}</b></div>
      <div><span>当前锅数</span><b id="ppAdjPotsCell">${t.potCount} 锅</b></div>
      <div><span id="ppAdjCapLabel">${capLabel(L0)}</span><b id="ppAdjCapCell">${capValue(L0)}</b></div>
      <div id="ppAdjTailBox"${tailHidden(L0) ? ' hidden' : ''}><span>尾锅投料量</span><b id="ppAdjTail">${!t.inputTotal || tailHidden(L0) ? '—' : MP.fmtKg2(L0.tail)}</b></div>
      <div><span>预计总时长</span><b id="ppAdjDur">${durText(totalSec(t))}</b></div>
      <div><span>自动排定时间</span><b>${t.startMin != null ? `${hm(t.startMin)} — ${hm(t.endMin)}` : '尚未排定'}</b></div>
    </div>
    <div class="mp-detail-section"><h4>本任务用料　<span class="mp-pot-hint" id="ppBomHint">${bomHint(L0)}</span></h4>
      <table class="mp-mini-table"><thead><tr><th>食材</th><th>本任务总量</th><th id="ppBomHeadA">${bomHead(L0)}</th><th>尾锅投料</th></tr></thead>
      <tbody id="ppBomPerPot">${bomBody(t.potCount)}</tbody></table></div>
    <div class="mp-detail-section"><h4>设备加工步骤</h4>
      <table class="mp-mini-table"><thead><tr><th>步骤</th><th>设备</th><th>单锅时长</th><th>本任务占用</th></tr></thead>
      <tbody id="ppAdjStepsBody">${stepsBody(t.potCount)}</tbody></table></div>`,
    `<button class="mp-secondary" id="ppAdjCancel">取消</button><span class="mp-spacer"></span>
     <button class="mp-primary" id="ppAdjSave">保存调整</button>`);

  /* 锅数一变（或换了设备），满锅/尾锅投料、本任务占用、总时长一起重算。
     这里才读 DOM —— 抽屉已经在了，用户刚改的就是它 */
  const syncPots = pots => {
    const p = Math.max(1, pots || 1);
    const dev = devNow();
    const L = loadFor(p, dev);
    $('#ppAdjPotsCell').textContent = `${p} 锅`;
    $('#ppAdjCapLabel').textContent = capLabel(L);
    $('#ppAdjCapCell').textContent = capValue(L);
    $('#ppAdjTailBox').hidden = tailHidden(L);
    $('#ppAdjTail').textContent = !t.inputTotal || tailHidden(L) ? '—' : MP.fmtKg2(L.tail);
    $('#ppBomHeadA').textContent = bomHead(L);
    $('#ppBomHint').textContent = bomHint(L);
    $('#ppAdjDur').textContent = durText(t.recipe.steps.reduce((s, x) => s + p * x.seconds, 0));
    $('#ppBomPerPot').innerHTML = bomBody(p, dev);
    $('#ppAdjStepsBody').innerHTML = stepsBody(p, dev);
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
    const st = $('#ppAdjStart').value;
    const dev = $('#ppAdjDevice').value;
    setOverride(t, {
      mainDevice: dev,
      potCount: pots,
      potCountOverridden: pots !== potSuggest(dev),
      /* 记下当时选中的设备容量，将来容量变更时可标「来源已变更」 */
      capAtOverride: MP.deviceCapacity(dev),
      /* 加工顺序不在这里改（已不单独维护）：列表按计划开始时间自动排序 */
      plannedStart: st ? toMin(st) : null
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
      <p>同时<b>用量按此刻口径定格</b>：之后排餐再改就餐人数或人均配量，这道菜的出品量与投料量都不会跟着变。</p>
    </div>
    <div class="pp-adjust-calc">
      <div><span>主加工设备</span><b>${esc(t.mainDevice)}</b></div>
      <div><span>锅数</span><b>${t.potCount} 锅</b></div>
      <div><span>投料分配</span><b>${loadText(t)}</b></div>
      <div><span>计划加工时间</span><b>${hm(t.startMin)} — ${hm(t.endMin)}</b></div>
      <div><span>入锅投料总量</span><b>${t.inputTotal ? MP.fmtKg2(t.inputTotal) : '—'}</b></div>
    </div>`,
    `<button class="mp-secondary" id="ppStartCancel">取消</button><span class="mp-spacer"></span><button class="mp-primary" id="ppStartOk">确认开始生产</button>`);
  $('#ppStartCancel').onclick = close;
  $('#ppStartOk').onclick = () => { setStatus(t, 'producing'); close(); render(); toast(`${t.recipe.name} 已进入生产中，排餐计划中该菜已锁定`); };
}

/* 撤销开工：只对**当天**的「生产中」任务开放。回到未开始 → 排餐同步解锁（状态归排餐只读徽标读的那份），
   并解冻用量快照，让这道菜重新跟随排餐的实时口径。已完成的不可回退。 */
function confirmUndoStart(t) {
  if (!t) return;
  drawer('撤销开工', `${t.meal} · ${t.recipe.name}`, `
    <div class="pp-confirm-note">
      <p>该菜回到<b>未开始</b>：排餐计划中同步解锁，可以再次修改、替换或删除。</p>
      <p>开工时定格的用量快照会被清除，出品量与投料量重新跟随排餐的当前口径。</p>
      <p class="mp-dim">只对当天的任务开放；已「生产完成」的不可回退。</p>
    </div>
    <div class="pp-adjust-calc">
      <div><span>主加工设备</span><b>${esc(t.mainDevice)}</b></div>
      <div><span>锅数</span><b>${t.potCount} 锅</b></div>
      <div><span>计划加工时间</span><b>${hm(t.startMin)} — ${hm(t.endMin)}</b></div>
    </div>`,
    `<button class="mp-secondary" id="ppUndoCancel">取消</button><span class="mp-spacer"></span><button class="mp-primary" id="ppUndoOk">确认撤销开工</button>`);
  $('#ppUndoCancel').onclick = close;
  $('#ppUndoOk').onclick = () => { setStatus(t, 'not_started'); close(); render(); toast(`${t.recipe.name} 已撤销开工，排餐计划中已解锁`); };
}

function confirmFinish(t) {
  if (!t) return;
  drawer('完成生产', `${t.meal} · ${t.recipe.name}`, `
    <div class="pp-confirm-note">
      <p>确认该菜已出锅？完成后状态变为<b>生产完成</b>，该菜在排餐计划中永久锁定，不可修改或删除。</p>
      <p class="mp-dim">「生产完成」不可回退（只有「生产中」当天可以撤销开工），如误操作请线下处理。</p>
    </div>`,
    `<button class="mp-secondary" id="ppFinishCancel">取消</button><span class="mp-spacer"></span><button class="mp-primary" id="ppFinishOk">确认完成</button>`);
  $('#ppFinishCancel').onclick = close;
  $('#ppFinishOk').onclick = () => { setStatus(t, 'complete'); close(); render(); toast(`${t.recipe.name} 生产完成`); };
}

/* ============================ 6. 安装 ============================ */

/* setStatus / setOverride 是「动作层」：手机端（车间）也要用同一套规则改状态和现场调整，
   绝不能各写一份 —— 这个模块的每一条规则（锅数、定格、锁定、落盘）都必须只有一处实现 */
window.MerchantProduction = { enter, tasksOf, scheduleAll, render, setStatus, setOverride, taskKey, startBlock, setView: v => { view = v; } };
/* 排餐保存后，若生产计划正在显示则同步刷新 */
MP.onSave(() => { const p = $('#productionPlanPage'); if (p && !p.hidden) render(); });
})();
