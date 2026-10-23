/* ============================================================================
   车间端（手机）交互
   两条主线：① 生产确认（高频，站在设备旁单手点）② 排餐调整（低频，临时加菜/改人数）
   **一条规则都不在这里实现**：锅数、投料、定格、锁定、开工准入、落盘全部调
   MerchantPlan / MerchantProduction 的导出方法（见 merchant-mobile.html 的说明）。
   ============================================================================ */
(() => {
  const MP = window.MerchantPlan, PR = window.MerchantProduction;
  const $ = s => document.querySelector(s);
  const esc = MP.esc, today = MP.today();
/* 二级分类（与桌面端排餐同口径）：热菜 / 大荤 → 大荤 */
const cat2 = r => String(r?.category || '').split(' / ')[1] || '';
  const state = { tab: 'prod', meal: null, group: 'time', date: today };

  /* ---------------- 小工具 ---------------- */
  const kg = v => MP.fmtKg2(v);
/* 餐次汇总条：人均用餐量改了要就地重画这一块，所以抽成函数 */
const sumHtml = m => `<div class="mb-meal-sum">
          <b>${!m.perMeal ? '待填人均用餐量' : m.countedOutput > 0 ? `预计满足 ${m.feedCount} 人就餐` : '菜品不计入就餐人数统计'}</b>
          <span>人均 ${m.perMeal || '—'} g/人 · 出餐合计 ${kg1(m.output)}</span>
          ${m.skippedCats?.length ? `<span class="mb-skip-note">不含 ${esc(m.skippedCats.join('、'))}（不计入就餐人数）</span>` : ''}
          <span class="mb-tally">${esc(m.tally || '—')}</span>
        </div>`;
/* 餐次级的合计用 1 位小数（与桌面端排餐表的「出餐合计」同一口径），逐菜的用料仍用 2 位 */
const kg1 = v => MP.fmtKg(v);
  const durText = sec => sec >= 3600 ? `${Math.floor(sec / 3600)}小时${Math.round(sec % 3600 / 60)}分` : `${Math.round(sec / 60)}分`;
  const STATUS = { not_started: ['wait', '未开始'], producing: ['live', '生产中'], complete: ['done', '生产完成'] };
  const pill = st => { const [c, t] = STATUS[st] || STATUS.not_started; return `<em class="mb-pill ${c}">${t}</em>`; };
  /* 装载文案：任务上的派生值算的是「菜谱默认设备」（加工步骤第一台）口径；
     开工面板里换了设备要用 potTextFor 现算，不能沿用旧口径的预计算结果 */
  const potTextFor = (t, dev) => {
    const l = MP.potLoadOf(t.recipe, t.inputTotal, dev || t.defaultDevice, t.potCount);
    return l.even ? `${t.potCount} 锅 · 每锅 ${kg(l.tail)}`
      : t.potCount === 1 ? `1 锅 · ${kg(l.tail)}`
        : `${t.potCount} 锅 · ${kg(l.cap)}×${l.fullPots} ＋ 尾锅 ${kg(l.tail)}`;
  };
  const potText = t => potTextFor(t, t.defaultDevice);

  let toastTimer = null;
  function toast(msg) {
    const n = $('#mbToast'); if (!n) return;
    n.textContent = msg; n.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { n.hidden = true; }, 2600);
  }
  function sheet(title, sub, body, foot) {
    $('#mbSheet').innerHTML =
      `<header class="mb-sheet-head"><div><h2>${esc(title)}</h2>${sub ? `<small>${esc(sub)}</small>` : ''}</div>
        <button class="mb-x" id="mbSheetX">关闭</button></header>
       <div class="mb-sheet-body">${body}</div>
       ${foot ? `<div class="mb-sheet-foot">${foot}</div>` : ''}`;
    $('#mbSheetMask').hidden = false;
    $('#mbSheetX').onclick = closeSheet;
  }
  function closeSheet() { $('#mbSheetMask').hidden = true; $('#mbSheet').innerHTML = ''; }
  const orgSheet = () => { $('#mbOrgMask').hidden = false; };

  /* ---------------- 生产：数据 ---------------- */
  /* 车间跟着「该做的顺序」走：生产中排最前、其次未开始（按餐次顺序）、已完成垫底。
     V2 去掉了计划加工时间，所以没有「用系统建议值站位」这一层 —— 时间只在开工那一刻产生。
     桌面端按餐次分段 + 段内按状态分组，那是排程视角；车间要的是操作视角 */
  const statusRank = t => t.status === 'producing' ? 0 : t.status === 'not_started' ? 1 : 2;
  const tasks = () => PR.tasksOf(state.date).sort((a, b) =>
    statusRank(a) - statusRank(b) || (MP.MEALS.indexOf(a.meal) - MP.MEALS.indexOf(b.meal)));
  const findTask = key => tasks().find(t => t.key === key);
  /* 需要人动手的：生产中 → 完成；未开始 → 开始。已完成不动 */
  const liveOf = list => list.find(t => t.status === 'producing');
  const nextOf = list => list.find(t => t.status !== 'complete');

  /* ---------------- 生产：渲染 ---------------- */
  function renderProd() {
    const list = tasks();
    if (!list.length) { $('#mbMain').innerHTML = '<div class="mb-empty">今天这个食堂没有需要设备加工的菜</div>'; return; }
    const live = liveOf(list), next = live || nextOf(list);

    let html = '';
    if (next) {
      html += `<section class="mb-now">
        <div class="mb-now-label">${live ? '正在做' : '接下来做'}</div>
        <div class="mb-now-name">${esc(next.recipe.name)}</div>
        <div class="mb-now-meta">
          <span>${esc(next.meal)}</span>
          <span>${next.potCount} 锅 / 共 ${kg(next.inputTotal)}</span>
          <span>${next.status === 'producing' && next.startedAt != null ? `${MP.hm(next.startedAt)} 开始` : '未开工'}</span>
        </div>
        ${live
          ? '<button class="mb-btn ok" data-act="finish" data-key="' + live.key + '">完成这道菜</button>'
          : '<button class="mb-btn primary" data-act="start" data-key="' + next.key + '">开始生产</button>'}
      </section>`;
    } else {
      html += '<div class="mb-now-empty">今天的任务都做完了 🎉</div>';
    }

    html += `<div class="mb-sec-title">今天全部任务（${list.length}）</div>`;
    html += state.group === 'device' ? byDevice(list) : byTime(list);
    $('#mbMain').innerHTML = html;
  }

  const byTime = list => list.map(taskCard).join('');
  function byDevice(list) {
    const groups = new Map();
    list.forEach(t => { const k = t.defaultDevice || '未指定设备'; (groups.get(k) || groups.set(k, []).get(k)).push(t); });
    return [...groups.entries()].map(([dev, ts]) =>
      `<div class="mb-dev-group"><div class="mb-sec-title">${esc(dev)} · ${ts.length} 道</div><section class="mb-card">${ts.map(taskCard).join('')}</section></div>`
    ).join('');
  }
  function taskCard(t) {
    /* 加工时间是开工那一刻产生的现场记录：未开工没有时间，完成给「开始 / 完成」两个点 */
    const time = t.status === 'not_started' || t.startedAt == null
      ? '<b>—</b><small>未开工</small>'
      : t.finishedAt != null
        ? `<b>${MP.hm(t.startedAt)}</b><small>${MP.hm(t.finishedAt)} 完成</small>`
        : `<b>${MP.hm(t.startedAt)}</b><small>进行中</small>`;
    return `<article class="mb-task">
      <div class="mb-task-time">${time}</div>
      <div class="mb-task-body">
        <h3>${esc(t.recipe.name)} ${pill(t.status)}</h3>
        <p>${esc(t.meal)} · <b>${kg(t.inputTotal)}</b> 入锅${t.status === 'not_started' ? '' : ` · ${esc(t.device)}`}</p>
        <p>${potText(t)} · ${durText(MP.taskDurationSec(t.recipeId, t.potCount))}</p>
        <div class="mb-task-act">
          <button class="mb-btn ghost" data-act="detail" data-key="${t.key}">详情</button>
          ${t.status === 'not_started'
            ? `<button class="mb-btn primary" data-act="start" data-key="${t.key}">开始生产</button>`
            : t.status === 'producing'
              ? `<button class="mb-btn ok" data-act="finish" data-key="${t.key}">完成</button>`
              : '<button class="mb-btn ghost" disabled>已完成</button>'}
        </div>
      </div>
    </article>`;
  }

  /* ---------------- 生产：动作 ---------------- */
  /* 开工：**设备与开工时间都在这一步确定**（V2）。没有「先填计划加工时间」这道前置校验 ——
     时间不再是开工的前置条件，而是开工那一刻的产物 */
  function doStart(t) {
    if (!t) return toast('任务不存在');
    openStartSheet(t);
  }
  function openStartSheet(t) {
    const devs = [...new Set((t.recipe.steps || []).map(s => s.device))];
    const cap = d => `${MP.deviceCapacity(d) || '—'} kg/锅`;
    sheet('开始生产', `${t.meal} · ${t.recipe.name}`, `
      <p class="mb-note" style="margin:0 0 12px">在这一步确定<b>生产设备</b>与<b>开工时间</b>，确认后进入「生产中」。</p>
      <div class="mb-field"><label>生产设备</label>
        <select id="mbStartDev">${devs.map(d => `<option value="${esc(d)}" ${d === t.defaultDevice ? 'selected' : ''}>${esc(d)}</option>`).join('')}</select>
        <div class="mb-hint" id="mbStartCap">容量 ${cap(t.defaultDevice)}</div>
      </div>
      <div class="mb-field"><label>开工时间</label>
        <input type="time" id="mbStartAt" value="${MP.hm(PR.nowMin())}">
        <div class="mb-hint">默认当前时刻，可改</div>
      </div>
      <div class="mb-kv"><span>锅数</span><b>${t.potCount} 锅</b></div>
      <div class="mb-kv"><span>入锅投料</span><b>${kg(t.inputTotal)}</b></div>
      <div class="mb-kv"><span>装载</span><b id="mbStartLoad">${potTextFor(t, t.defaultDevice)}</b></div>`,
      `<button class="mb-btn ghost" data-sheet="close">取消</button>
       <button class="mb-btn primary" id="mbStartOk">确认开始生产</button>`);
    /* 换设备 → 容量与装载跟着现算（不能沿用按默认设备算好的派生值） */
    const sel = $('#mbStartDev');
    sel.onchange = () => {
      $('#mbStartCap').textContent = `容量 ${cap(sel.value)}`;
      $('#mbStartLoad').textContent = potTextFor(t, sel.value);
    };
    $('#mbStartOk').onclick = () => {
      const v = $('#mbStartAt').value.trim();
      if (!v) return toast('请填写开工时间');
      PR.startTask(t, { device: sel.value, at: MP.toMin(v) });   // 与桌面「开始生产」抽屉同一条动作（含落盘）
      closeSheet(); render(); toast(`${t.recipe.name} 已进入生产中`);
    };
  }
  /* 完成确认：完成时间就是「现在的时刻」，所以没有可填的时间字段 */
  function confirmFinish(t) {
    sheet('完成生产', `${t.meal} · ${t.recipe.name}`, `
      <div class="mb-kv"><span>生产设备</span><b>${esc(t.device)}</b></div>
      <div class="mb-kv"><span>开工时间</span><b>${t.startedAt != null ? MP.hm(t.startedAt) : '—'}</b></div>
      <div class="mb-kv"><span>当前时刻</span><b>${MP.hm(PR.nowMin())}</b></div>
      <div class="mb-kv"><span>锅数</span><b>${t.potCount} 锅</b></div>
      <p class="mb-note" style="margin-top:12px">点确认后进入<b>生产完成</b>。完成不可回退；「生产中」当天可以撤销开工。</p>`,
      `<button class="mb-btn ghost" data-sheet="close">取消</button>
       <button class="mb-btn ok" data-sheet="confirm" data-kind="finish" data-key="${t.key}">确认完成</button>`);
  }
  function undoStart(t) {
    sheet('撤销开工', `${t.meal} · ${t.recipe.name}`, `
      <p class="mb-note" style="margin:0">撤销后回到<b>未开始</b>：本次确定的<b>生产设备与开工时间会一并清空</b>，
      可以重新选设备、重新定时间。只有<b>当天</b>的生产中任务可以撤销，「生产完成」不可回退。</p>`,
      `<button class="mb-btn ghost" data-sheet="close">取消</button>
       <button class="mb-btn primary" data-sheet="confirm" data-kind="undo" data-key="${t.key}">确认撤销</button>`);
  }
  /* 详情：用料清单是车间真正要用的东西——要称多少料。只读，没有任何可改项
     （设备与时间在「开始生产」那一步定，详情里不再提供改时间入口） */
  function openDetail(t) {
    const bom = MP.bomUsageOf(t.plan, t.di, t.meal, t.recipeId);
    const steps = (t.recipe.steps || []).map(s =>
      `<div class="mb-kv"><span>${esc(s.stepName || '加工')} · ${esc(MP.effDeviceOf(t.recipe, t.device, s.device))}</span><b>${s.seconds}s × ${t.potCount} 锅</b></div>`).join('');
    const bomRows = bom.length ? bom.map(b =>
      `<tr><td>${esc(b.ingredient)}</td><td>${esc(MP.fmtRawQty(b.qty, b.unit))}</td><td>${esc(b.usageText)}</td></tr>`).join('')
      : '<tr><td colspan="3" style="color:var(--mb-ink-3)">暂无用料数据</td></tr>';
    sheet(t.recipe.name, `${t.meal} · ${t.date}`, `
      <div class="mb-kv"><span>状态</span><b>${(STATUS[t.status] || [])[1]}</b></div>
      <div class="mb-kv"><span>出品量</span><b>${kg(t.output)}</b></div>
      <div class="mb-kv"><span>入锅投料</span><b>${kg(t.inputTotal)}</b></div>
      <div class="mb-kv"><span>生产设备</span><b>${t.status === 'not_started' ? '未开工' : esc(t.device)}</b></div>
      <div class="mb-kv"><span>锅数</span><b>${t.potCount} 锅</b></div>
      <div class="mb-kv"><span>装载</span><b>${potText(t)}</b></div>
      <div class="mb-kv"><span>开工时间</span><b>${t.startedAt != null ? MP.hm(t.startedAt) : '—'}</b></div>
      <div class="mb-kv"><span>完成时间</span><b>${t.finishedAt != null ? MP.hm(t.finishedAt) : '—'}</b></div>
      <div class="mb-sec-title">加工步骤</div>${steps || '<div class="mb-empty">无</div>'}
      <div class="mb-sec-title">用料清单（按本次投料折算）</div>
      <table class="mb-bom"><thead><tr><th>食材</th><th>标准</th><th>本次用量</th></tr></thead><tbody>${bomRows}</tbody></table>
      ${t.status === 'producing' ? '<p class="mb-note" style="margin-top:12px">这道菜正在生产中，用料清单按当前排餐口径实时折算（V2 不做开工定格）。</p>' : ''}`,
      `${t.status === 'not_started' ? '<button class="mb-btn primary" data-act="start" data-key="' + t.key + '">开始生产</button>' : ''}
       ${t.status === 'producing' && t.date === today ? '<button class="mb-btn ghost" data-act="undo" data-key="' + t.key + '">撤销开工</button>' : ''}
       <button class="mb-btn ghost" data-sheet="close">关闭</button>`);
  }

  /* ---------------- 排餐调整 ---------------- */
  function renderMeal() {
    const bad = MP.mobile.begin(state.date);   // 只允许今天，且必须复用桌面同一条校验
    if (bad) { $('#mbMain').innerHTML = `<div class="mb-empty">${esc(bad)}</div>`; return; }
    const v = MP.mobile.view();
    let html = `<div class="mb-note">排餐调整只作用于<b>今天</b>；所有改动都要填原因，保存后进入当日调整记录。每个餐次先填人均用餐量，再逐道菜确认锅数。</div>`;
    v.meals.forEach(m => {
      /* 没排菜的餐次压成一行：手机上三整块空白太占地方 */
      if (!m.dishes.length) {
        html += `<section class="mb-card"><div class="mb-meal-card mb-meal-empty">
          <b>${esc(m.meal)}</b><small>未安排</small>
          <button class="mb-btn ghost" data-act="add" data-meal="${esc(m.meal)}">加菜</button>
        </div></section>`;
        return;
      }
      html += `<section class="mb-card"><div class="mb-meal-card">
        <div class="mb-meal-top">
          <b>${esc(m.meal)}</b>
          <div class="mb-stepper">
            <button data-act="pm-dec" data-meal="${esc(m.meal)}">−</button>
            <input type="number" inputmode="numeric" min="1" max="9999" step="50" value="${m.perMeal || ''}" data-act="pm-in" data-meal="${esc(m.meal)}" placeholder="克/人">
            <button data-act="pm-inc" data-meal="${esc(m.meal)}">＋</button>
          </div>
        </div>
        ${sumHtml(m)}
        ${m.dishes.map(d => `
          <div class="mb-dish">
            <div class="mb-dish-main">
              <b>${esc(d.recipe?.name || d.id)}</b>
              <small>${cat2(d.recipe) ? `<em class="mb-dish-cat">${esc(cat2(d.recipe))}</em>` : ''}${d.pots} 锅 · 出餐 ${kg(d.output)} · 投料 ${kg(d.input)}${d.recipe?.hasDevice ? '' : ' · 纯人工'}</small>
            </div>
            <button class="mb-btn ghost" style="min-height:44px;padding:0 12px;font-size:15px" data-act="dish" data-meal="${esc(m.meal)}" data-id="${d.id}">改</button>
          </div>`).join('')}
        <button class="mb-add" data-act="add" data-meal="${esc(m.meal)}">＋ 加一道菜</button>
      </div></section>`;
    });
    const adjs = MP.mobile.adjustments();
    html += `<div class="mb-sec-title">今日调整记录（${adjs.length}）</div>
      <section class="mb-card"><div class="mb-meal-card ${adjs.length ? 'mb-adjust' : ''}">${adjs.length
        ? adjs.map(a => `<article><time>${esc(a.time)}</time><div><b>${esc(a.meal)} · ${esc(a.type)}</b><p>${esc(a.detail)}</p><small>原因：${esc(a.reason)}</small></div></article>`).join('')
        : '<div class="mb-empty">今天还没有排餐调整</div>'}</div></section>
      <div class="mb-footbar">
        <button class="mb-btn ghost" data-act="meal-cancel">放弃修改</button>
        <button class="mb-btn primary" data-act="meal-save">保存并生效</button>
      </div>`;
    $('#mbMain').innerHTML = html;
  }

  /* 菜谱选择：候选与「是否已加」的规则来自 MP.mobile.candidates() */
  function openPicker(meal, why) {
    const list = MP.mobile.candidates(meal);
    sheet(`加菜 · ${meal}`, `已选原因：${why}`, `
      <input class="mb-search" id="mbPickKw" placeholder="搜索菜名">
      <div id="mbPickList">${pickHtml(list)}</div>`,
      `<button class="mb-btn ghost" data-sheet="close">取消</button>`);
    $('#mbPickKw').oninput = e => {
      const kw = e.target.value.trim();
      $('#mbPickList').innerHTML = pickHtml(list.filter(r => !kw || r.name.includes(kw)));
    };
    const bind = () => document.querySelectorAll('[data-pick]').forEach(b => {
      b.onclick = () => {
        const err = MP.mobile.add(meal, b.dataset.pick, why);
        if (err) return toast(err);
        closeSheet(); renderMeal(); toast('已加入，记得保存');
      };
    });
    bind();
    $('#mbPickList').addEventListener('click', bind);
  }
  const pickHtml = list => list.length
    ? list.map(r => `<button class="mb-list-item" data-pick="${r.id}"><b>${esc(r.name)}</b>
        <small>${r.hasDevice ? '含设备加工' : '纯人工'}</small><span class="mb-pill ${r.hasDevice ? 'wait' : 'done'}">${r.hasDevice ? '设备' : '人工'}</span></button>`).join('')
    : '<div class="mb-empty">没有可加的菜谱了</div>';

  function openDish(meal, id) {
    const d = MP.mobile.view().meals.find(m => m.meal === meal)?.dishes.find(x => x.id === id);
    if (!d) return;
    const r = d.recipe || {};
    sheet(r.name || id, `${meal} · ${d.pots} 锅 · 出餐 ${kg(d.output)}`, `
      ${d.inherited ? `<p class="mb-note inherit">烹饪锅数沿用<b>${esc(d.inheritedFrom)}</b>的填写值（${d.pots} 锅），可直接修改。</p>` : ''}
      <div class="mb-field"><label>烹饪锅数（锅）</label>
        <input type="number" inputmode="numeric" min="1" max="99" step="1" id="mbPots" value="${d.pots}"></div>
      <p class="mb-note">一锅 = 菜谱配置的一锅投料量；改动只影响这道菜的用料与出餐量。改动要连同原因一起保存；删除原因在下一步填。</p>`,
      `<button class="mb-btn ghost" data-act="del" data-meal="${esc(meal)}" data-id="${id}">删除这道菜</button>
       <button class="mb-btn primary" data-act="dish-save" data-meal="${esc(meal)}" data-id="${id}">保存改动</button>`);
  }
  /* 原因必填：桌面走抽屉、手机走这个底部输入，但「必填」这条在 MP.mobile 里也只判一次 */
  function askReason(title, sub, cb) {
    sheet(title, sub, `
      <div class="mb-field"><label>调整原因（必填）</label>
        <textarea id="mbWhy" placeholder="例如：临时来了 40 位客人 / 原料不够改做别的菜"></textarea>
        <div class="mb-hint">保存后可在「今日调整记录」里查到</div></div>`,
      `<button class="mb-btn ghost" data-sheet="close">取消</button>
       <button class="mb-btn primary" id="mbWhyOk">确认</button>`);
    $('#mbWhyOk').onclick = () => {
      const v = $('#mbWhy').value.trim();
      if (!v) return toast('请填写调整原因');
      cb(v);
    };
  }

  /* ---------------- 路由与事件 ---------------- */
  function render() { state.tab === 'prod' ? renderProd() : renderMeal(); }

  /* 头部显示「食堂 · 档口」：计划按档口归属，车间人员得知道自己看的是哪个档口 */
  function syncScopeLabel() {
    const sc = window.MerchantScope?.current() || {};
    const orgName = $('#currentOrganization').textContent.trim();
    $('#mbOrgName').textContent = sc.stallName ? `${orgName} · ${sc.stallName}` : orgName;
  }
  /* 车间端要直接落到某个档口上干活（桌面端计划页默认停在组织层总览，这里不能跟着默认成总览） */
  window.MerchantScope?.ensureDefault?.({ stall: true });
  syncScopeLabel();
  $('#mbDate').textContent = today;
  $('#mbWeekday').textContent = MP.DAYS[MP.dayIndex(today)];

  document.addEventListener('click', e => {
    const tab = e.target.closest('[data-tab]');
    if (tab) {
      state.tab = tab.dataset.tab;
      document.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('is-on', b === tab));
      if (state.tab === 'prod') { MP.mobile.cancel(); }   // 离开排餐页放弃未保存的缓冲，避免串味
      render();
      return;
    }
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act, key = b.dataset.key, meal = b.dataset.meal, id = b.dataset.id;
    const t = key ? findTask(key) : null;
    if (act === 'start') return doStart(t);
    if (act === 'finish') return confirmFinish(t);
    if (act === 'undo') return undoStart(t);
    if (act === 'detail') return openDetail(t);
    if (act === 'pm-inc' || act === 'pm-dec') {
      const inp = document.querySelector(`[data-act="pm-in"][data-meal="${meal}"]`);
      const cur = Number(inp.value) || 0;
      /* 人均用餐量的步长是 50g —— 按 1g 加减在手机上点不出结果 */
      const err = MP.mobile.setPerMeal(meal, Math.max(1, cur + (act === 'pm-inc' ? 50 : -50)));
      if (err) return toast(err);
      return renderMeal();
    }
    if (act === 'add') return askReason(`加菜 · ${meal}`, '今日排餐调整', why => openPicker(meal, why));
    if (act === 'dish') return openDish(meal, id);
    if (act === 'del') return askReason('删除这道菜', `${meal}`, why => {
      const err = MP.mobile.remove(meal, id, why);
      if (err) return toast(err);
      renderMeal(); toast('已删除，记得保存');
    });
    if (act === 'dish-save') {
      const err = MP.mobile.setPots(meal, id, $('#mbPots').value);
      if (err) return toast(err);
      closeSheet(); renderMeal(); toast('已改，记得保存');
      return;
    }
    if (act === 'meal-cancel') { MP.mobile.cancel(); renderMeal(); return toast('已放弃本次修改'); }
    if (act === 'meal-save') {
      const err = MP.mobile.commit();
      if (err) return toast(err);
      renderMeal(); toast('已保存并生效');
      return;
    }
  });

  /* 抽屉里的按钮 */
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-sheet]');
    if (!b) return;
    if (b.dataset.sheet === 'close') return closeSheet();
    const t = findTask(b.dataset.key);
    const kind = b.dataset.kind;
    if (!t) return closeSheet();
    if (kind === 'finish') PR.finishTask(t);
    else if (kind === 'undo') PR.undoStart(t);
    closeSheet(); render();
    toast(kind === 'finish' ? '已标记生产完成' : '已撤销开工');
  });

  /* 边输边算：不改整页，只把这张卡片的汇总条换掉，正在输入的数字框不会被重画顶掉 */
  document.addEventListener('input', e => {
    const inp = e.target.closest('[data-act="pm-in"]');
    if (!inp) return;
    if (MP.mobile.setPerMeal(inp.dataset.meal, inp.value)) return;
    const v = MP.mobile.view().meals.find(x => x.meal === inp.dataset.meal);
    const box = inp.closest('.mb-meal-card')?.querySelector('.mb-meal-sum');
    if (v && box) box.outerHTML = sumHtml(v);
  });

  /* 数字输入：失焦即改（和桌面一样，改动进缓冲，保存才生效） */
  document.addEventListener('change', e => {
    const inp = e.target.closest('[data-act="pm-in"]');
    if (!inp) return;
    const err = MP.mobile.setPerMeal(inp.dataset.meal, inp.value);
    if (err) toast(err);
    renderMeal();
  });

  /* ---------------- 切换食堂 / 档口 ----------------
     车间人员的范围是「本食堂的某个档口」。计划与生产任务都按档口归属，
     所以手机上必须能定位到具体档口：先选食堂，再选该食堂下的档口。
     组织清单与档口清单都来自共享数据源（桌面端维护的那一份），不在这里另写死。 */
  const subs = () => (window.MerchantScope?.subs() || []);
  const stallsOf = (orgId) => (window.MerchantScope?.stallsOf(orgId) || []);
  let pickingOrgId = '';

  function drawOrgSheet(orgId) {
    const cur = window.MerchantScope?.current() || {};
    const openId = orgId || cur.orgId || (subs()[0] || {}).id || '';
    pickingOrgId = openId;
    $('#mbOrgList').innerHTML = subs().map(o =>
      `<button class="mb-list-item" data-org="${esc(o.id)}" data-open="${o.id === openId ? '1' : '0'}"><b>${esc(o.name)}</b>${
        o.id === cur.orgId && !cur.stallId ? '<span class="mb-pill done">当前</span>'
        : o.id === openId ? '<span class="mb-pill">展开档口</span>' : ''}</button>`).join('');
    const list = stallsOf(openId);
    const box = $('#mbStallList');
    box.hidden = false;
    box.innerHTML = `<p class="mb-sheet-note">选择档口（${esc((subs().find(o => o.id === openId) || {}).name || '')}）</p>`
      + (list.length
        ? list.map(s => `<button class="mb-list-item" data-stall="${esc(s.id)}"><b>${esc(s.name)}</b><small>${esc(s.meals.map(m => m.meal).join('、'))}</small>${
            s.id === cur.stallId ? '<span class="mb-pill done">当前</span>' : ''}</button>`).join('')
        : '<p class="mb-sheet-note">该食堂还没有档口，请先在电脑端「档口管理」创建。</p>');
  }

  $('#mbOrgBtn').onclick = () => { $('#mbOrgSheetTitle').textContent = '切换食堂 / 档口'; drawOrgSheet(); orgSheet(); };
  $('#mbOrgClose').onclick = () => { $('#mbOrgMask').hidden = true; };
  $('#mbOrgList').addEventListener('click', e => {
    const b = e.target.closest('[data-org]');
    if (!b) return;
    drawOrgSheet(b.dataset.org);        // 先展开该食堂的档口，再点档口落地
  });
  $('#mbStallList').addEventListener('click', e => {
    const b = e.target.closest('[data-stall]');
    if (!b) return;
    window.MerchantScope?.setStall(b.dataset.stall);   // 组织跟着档口走，模块自行重置（同桌面端）
    $('#mbOrgMask').hidden = true;
    state.meal = null;
    syncScopeLabel();
    render();
  });
  /* 范围变化的总入口：不只是本页弹层改的，别处（桌面端 / 另一个标签页）改了也要跟着走，
     否则标题还停在上一个档口 —— 车间人员会照着错的档口干活 */
  window.MerchantScope?.onChange?.(() => { syncScopeLabel(); state.meal = null; render(); });

  /* 初始化：先把两个桌面模块「激活」一次，让它们建好内部状态与 DOM 挂载点；
     它们画出来的表格被 CSS 隐藏，手机端只用它们的计算与动作 */
  MP.enterMealPlan();
  PR.enter();
  render();
})();
