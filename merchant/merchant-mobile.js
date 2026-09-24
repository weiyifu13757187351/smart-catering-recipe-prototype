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
  const state = { tab: 'prod', meal: null, group: 'time', date: today };

  /* ---------------- 小工具 ---------------- */
  const kg = v => MP.fmtKg2(v);
  const durText = sec => sec >= 3600 ? `${Math.floor(sec / 3600)}小时${Math.round(sec % 3600 / 60)}分` : `${Math.round(sec / 60)}分`;
  const STATUS = { not_started: ['wait', '未开始'], producing: ['live', '生产中'], complete: ['done', '生产完成'] };
  const pill = st => { const [c, t] = STATUS[st] || STATUS.not_started; return `<em class="mb-pill ${c}">${t}</em>`; };
  const potText = t => t.loadEven
    ? `${t.potCount} 锅 · 每锅 ${kg(t.tailKg)}`
    : t.potCount === 1 ? `1 锅 · ${kg(t.tailKg)}`
      : `${t.potCount} 锅 · ${kg(t.capPerPot)}×${t.fullPots} ＋ 尾锅 ${kg(t.tailKg)}`;

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
  /* 车间是跟着时间走的，所以按「计划加工时间」升序（没排时间的用系统建议值站位，排最后）；
     桌面端的任务顺序是按餐次分段 + 已排在前，那是排程视角，不是操作视角 */
  const effTime = t => t.startMin ?? t.suggestStart ?? 1e9;
  const tasks = () => PR.scheduleAll(PR.tasksOf(state.date)).sort((a, b) => effTime(a) - effTime(b));
  const findTask = key => tasks().find(t => t.key === key);
  /* 需要人动手的：生产中 → 完成；未开始且已排时间 → 开始。已完成不动 */
  const liveOf = list => list.find(t => t.status === 'producing');
  const nextOf = list => list.filter(t => t.status !== 'complete')
    .sort((a, b) => (a.startMin ?? 1e9) - (b.startMin ?? 1e9))[0];

  /* ---------------- 生产：渲染 ---------------- */
  function renderProd() {
    const list = tasks();
    if (!list.length) { $('#mbMain').innerHTML = '<div class="mb-empty">今天这个食堂没有需要设备加工的菜</div>'; return; }
    const live = liveOf(list), next = live || nextOf(list);
    const pending = list.filter(t => t.status === 'not_started' && t.startMin == null).length;

    let html = '';
    if (next) {
      html += `<section class="mb-now">
        <div class="mb-now-label">${live ? '正在做' : '接下来做'}</div>
        <div class="mb-now-name">${esc(next.recipe.name)}</div>
        <div class="mb-now-meta">
          <span>${esc(next.meal)}</span>
          <span>${esc(next.mainDevice)}</span>
          <span>${next.potCount} 锅 / 共 ${kg(next.inputTotal)}</span>
          <span>${next.startMin == null ? '未排时间' : `${MP.hm(next.startMin)}–${MP.hm(next.endMin)}`}</span>
        </div>
        ${live
          ? '<button class="mb-btn ok" data-act="finish" data-key="' + live.key + '">完成这道菜</button>'
          : '<button class="mb-btn primary" data-act="start" data-key="' + next.key + '">开始生产</button>'}
      </section>`;
    } else {
      html += '<div class="mb-now-empty">今天的任务都做完了 🎉</div>';
    }
    if (pending) html += `<div class="mb-note">还有 ${pending} 道菜没排计划加工时间，点进卡片填上才能开工。</div>`;

    html += `<div class="mb-sec-title">今天全部任务（${list.length}）</div>`;
    html += state.group === 'device' ? byDevice(list) : byTime(list);
    $('#mbMain').innerHTML = html;
  }

  const byTime = list => list.map(taskCard).join('');
  function byDevice(list) {
    const groups = new Map();
    list.forEach(t => { const k = t.mainDevice || '未指定设备'; (groups.get(k) || groups.set(k, []).get(k)).push(t); });
    return [...groups.entries()].map(([dev, ts]) =>
      `<div class="mb-dev-group"><div class="mb-sec-title">${esc(dev)} · ${ts.length} 道</div><section class="mb-card">${ts.map(taskCard).join('')}</section></div>`
    ).join('');
  }
  function taskCard(t) {
    const time = t.startMin == null
      ? (t.suggestStart != null ? `<b>—</b><small>建议 ${MP.hm(t.suggestStart)}</small>` : '<b>—</b><small>待排</small>')
      : `<b>${MP.hm(t.startMin)}</b><small>${MP.hm(t.endMin)}</small>`;
    return `<article class="mb-task">
      <div class="mb-task-time">${time}</div>
      <div class="mb-task-body">
        <h3>${esc(t.recipe.name)} ${pill(t.status)}</h3>
        <p>${esc(t.meal)} · <b>${kg(t.inputTotal)}</b> 入锅 · ${esc(t.mainDevice)}</p>
        <p>${potText(t)} · ${durText(MP.taskDurationSec(t.recipeId, t.potCount))}${t.frozen ? ' · 按开工时定格' : ''}</p>
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
  function doStart(t) {
    if (!t) return toast('任务不存在');
    const blocked = PR.startBlock(t);          // 没填计划加工时间不许开工（与桌面同一条判定）
    if (blocked) return openTimeSheet(t, blocked);
    confirmPanel(t, 'start');
  }
  function confirmPanel(t, kind) {
    const isStart = kind === 'start';
    sheet(isStart ? '开始生产' : '完成生产', `${t.meal} · ${t.recipe.name}`, `
      <div class="mb-kv"><span>主加工设备</span><b>${esc(t.mainDevice)}</b></div>
      <div class="mb-kv"><span>锅数</span><b>${t.potCount} 锅</b></div>
      <div class="mb-kv"><span>入锅投料</span><b>${kg(t.inputTotal)}</b></div>
      <div class="mb-kv"><span>计划加工</span><b>${t.startMin == null ? '未排' : `${MP.hm(t.startMin)}–${MP.hm(t.endMin)}`}</b></div>
      <p class="mb-note" style="margin-top:12px">${isStart
        ? '点确认后进入<b>生产中</b>：这道菜在排餐计划里会被锁定，用量按此刻口径定格（之后改就餐人数不再牵动它）。'
        : '点确认后进入<b>生产完成</b>。完成不可回退；「生产中」当天可以撤销开工。'}</p>`,
      `<button class="mb-btn ghost" data-sheet="close">取消</button>
       <button class="mb-btn ${isStart ? 'primary' : 'ok'}" data-sheet="confirm" data-kind="${kind}" data-key="${t.key}">确认</button>`);
  }
  function openTimeSheet(t, why) {
    const sug = t.suggestStart != null ? MP.hm(t.suggestStart) : '';
    sheet('填写计划加工时间', `${t.meal} · ${t.recipe.name}`, `
      <p class="mb-note" style="color:var(--mb-warn);margin:0 0 12px">${esc(why || '')}</p>
      <div class="mb-field"><label>计划加工时间</label>
        <input type="time" id="mbTimeIn" value="${t.plannedStart != null ? MP.hm(t.plannedStart) : ''}">
        ${sug ? `<div class="mb-hint">按开餐时间倒推的建议值是 ${sug}</div>` : ''}
      </div>
      <div class="mb-times">${sug ? `<button class="mb-btn ghost" id="mbUseSug">用建议 ${sug}</button>` : ''}</div>`,
      `<button class="mb-btn ghost" data-sheet="close">取消</button>
       <button class="mb-btn primary" id="mbTimeOk">保存</button>`);
    const inp = $('#mbTimeIn');
    if ($('#mbUseSug')) $('#mbUseSug').onclick = () => { inp.value = sug; };
    $('#mbTimeOk').onclick = () => {
      const v = inp.value.trim();
      if (!v) return toast('请填写计划加工时间');
      PR.setOverride(t, { plannedStart: MP.toMin(v) });   // 与桌面「调整」抽屉同一条动作（含落盘）
      closeSheet(); render(); toast(`已排定 ${v}`);
    };
  }
  function undoStart(t) {
    sheet('撤销开工', `${t.meal} · ${t.recipe.name}`, `
      <p class="mb-note" style="margin:0">撤销后回到<b>未开始</b>：排餐计划同步解锁，用量恢复跟随排餐实时口径。
      只有<b>当天</b>的生产中任务可以撤销，「生产完成」不可回退。</p>`,
      `<button class="mb-btn ghost" data-sheet="close">取消</button>
       <button class="mb-btn primary" data-sheet="confirm" data-kind="undo" data-key="${t.key}">确认撤销</button>`);
  }
  /* 详情：用料清单是车间真正要用的东西——要称多少料 */
  function openDetail(t) {
    const bom = MP.bomUsageOf(t.plan, t.di, t.meal, t.recipeId);
    const steps = (t.recipe.steps || []).map(s =>
      `<div class="mb-kv"><span>${esc(s.stepName || '加工')} · ${esc(MP.effDeviceOf(t.recipe, t.mainDevice, s.device))}${s.isMain ? '（主加工）' : ''}</span><b>${s.seconds}s × ${t.potCount} 锅</b></div>`).join('');
    const bomRows = bom.length ? bom.map(b =>
      `<tr><td>${esc(b.ingredient)}</td><td>${esc(MP.fmtRawQty(b.qty, b.unit))}</td><td>${esc(b.usageText)}</td></tr>`).join('')
      : '<tr><td colspan="3" style="color:var(--mb-ink-3)">暂无用料数据</td></tr>';
    sheet(t.recipe.name, `${t.meal} · ${t.date}`, `
      <div class="mb-kv"><span>状态</span><b>${(STATUS[t.status] || [])[1]}</b></div>
      <div class="mb-kv"><span>出品量</span><b>${kg(t.output)}</b></div>
      <div class="mb-kv"><span>入锅投料</span><b>${kg(t.inputTotal)}</b></div>
      <div class="mb-kv"><span>主加工设备</span><b>${esc(t.mainDevice)}</b></div>
      <div class="mb-kv"><span>锅数</span><b>${t.potCount} 锅</b></div>
      <div class="mb-kv"><span>装载</span><b>${potText(t)}</b></div>
      <div class="mb-kv"><span>计划加工</span><b>${t.startMin == null ? '未排' : `${MP.hm(t.startMin)}–${MP.hm(t.endMin)}`}</b></div>
      <div class="mb-sec-title">加工步骤</div>${steps || '<div class="mb-empty">无</div>'}
      <div class="mb-sec-title">用料清单（按本次投料折算）</div>
      <table class="mb-bom"><thead><tr><th>食材</th><th>标准</th><th>本次用量</th></tr></thead><tbody>${bomRows}</tbody></table>
      ${t.frozen ? '<p class="mb-note" style="margin-top:12px">这道菜已开工，用量按开工那一刻定格；排餐后来改就餐人数不会牵动它。</p>' : ''}`,
      `${t.status === 'not_started' ? '<button class="mb-btn ghost" data-act="time" data-key="' + t.key + '">改计划时间</button>' : ''}
       ${t.status === 'producing' && t.date === today ? '<button class="mb-btn ghost" data-act="undo" data-key="' + t.key + '">撤销开工</button>' : ''}
       <button class="mb-btn ghost" data-sheet="close">关闭</button>`);
  }

  /* ---------------- 排餐调整 ---------------- */
  function renderMeal() {
    const bad = MP.mobile.begin(state.date);   // 只允许今天，且必须复用桌面同一条校验
    if (bad) { $('#mbMain').innerHTML = `<div class="mb-empty">${esc(bad)}</div>`; return; }
    const v = MP.mobile.view();
    let html = `<div class="mb-note">排餐调整只作用于<b>今天</b>；所有改动都要填原因，保存后进入当日调整记录。已开工的菜不能改也不能删。</div>`;
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
            <button data-act="hc-dec" data-meal="${esc(m.meal)}">−</button>
            <input type="number" inputmode="numeric" min="1" max="9999" value="${m.headcount || ''}" data-act="hc-in" data-meal="${esc(m.meal)}" placeholder="人数">
            <button data-act="hc-inc" data-meal="${esc(m.meal)}">＋</button>
          </div>
        </div>
        ${m.dishes.map(d => `
          <div class="mb-dish">
            <div class="mb-dish-main">
              <b>${esc(d.recipe?.name || d.id)}</b>
              <small>${kg(d.output)} · 投料 ${kg(d.input)}${d.recipe?.hasDevice ? '' : ' · 纯人工'}</small>
            </div>
            ${d.locked ? '<em class="mb-pill live">已锁定</em>' : ''}
            <button class="mb-btn ghost" style="min-height:44px;padding:0 12px;font-size:15px" data-act="dish" data-meal="${esc(m.meal)}" data-id="${d.id}">${d.locked ? '查看' : '改'}</button>
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
    if (d.locked) {
      return sheet(r.name || id, `${meal} · 已锁定`, `
        <p class="mb-note" style="margin:0">这道菜${d.status === 'producing' ? '正在生产' : '已生产完成'}，
        排餐计划里不能修改或删除。需要变动请在生产计划里先撤销开工（仅当天可撤销）。</p>`,
        '<button class="mb-btn ghost" data-sheet="close">关闭</button>');
    }
    sheet(r.name || id, `${meal} · ${kg(d.output)} · 投料 ${kg(d.input)}`, `
      ${r.hasDevice ? `<div class="mb-field"><label>人均配量（kg/人）</label>
        <input type="number" inputmode="decimal" step="0.001" min="0.001" id="mbPP" value="${d.perPerson || ''}"></div>` : ''}
      ${r.hasDevice ? `<div class="mb-field"><label>出餐成品系数（%）</label>
        <input type="number" inputmode="decimal" id="mbYC" value="${d.yieldCoef || ''}"></div>` : ''}
      ${r.hasDevice ? '' : '<p class="mb-note">纯人工菜不参与设备生产，按份数口径计算。</p>'}
      <p class="mb-note">改动要连同原因一起保存；删除原因在下一步填。</p>`,
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

  $('#mbOrgName').textContent = $('#currentOrganization').textContent.trim();
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
    if (act === 'finish') return confirmPanel(t, 'finish');
    if (act === 'undo') return undoStart(t);
    if (act === 'detail') return openDetail(t);
    if (act === 'time') return openTimeSheet(t, '');
    if (act === 'hc-inc' || act === 'hc-dec') {
      const inp = document.querySelector(`[data-act="hc-in"][data-meal="${meal}"]`);
      const cur = Number(inp.value) || 0;
      const err = MP.mobile.setHeadcount(meal, Math.max(1, cur + (act === 'hc-inc' ? 1 : -1)));
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
      const pp = $('#mbPP'), yc = $('#mbYC');
      if (pp) { const err = MP.mobile.setPerPerson(meal, id, pp.value); if (err) return toast(err); }
      if (yc) { const err = MP.mobile.setYield(meal, id, yc.value); if (err) return toast(err); }
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
    if (kind === 'start') PR.setStatus(t, 'producing');
    else if (kind === 'finish') PR.setStatus(t, 'complete');
    else if (kind === 'undo') PR.setStatus(t, 'not_started');
    closeSheet(); render();
    toast(kind === 'start' ? '已开始生产，排餐已锁定' : kind === 'finish' ? '已标记生产完成' : '已撤销开工，排餐已解锁');
  });

  /* 数字输入：失焦即改（和桌面一样，改动进缓冲，保存才生效） */
  document.addEventListener('change', e => {
    const inp = e.target.closest('[data-act="hc-in"]');
    if (!inp) return;
    const err = MP.mobile.setHeadcount(inp.dataset.meal, inp.value);
    if (err) toast(err);
    renderMeal();
  });

  /* ---------------- 切换食堂 ---------------- */
  const ORGS = ['东校区第一食堂', '东校区第二食堂', '市教育局机关食堂'];
  $('#mbOrgBtn').onclick = () => {
    $('#mbOrgList').innerHTML = ORGS.map(o =>
      `<button class="mb-list-item" data-org="${esc(o)}"><b>${esc(o)}</b>${o === $('#currentOrganization').textContent.trim() ? '<span class="mb-pill done">当前</span>' : ''}</button>`).join('');
    orgSheet();
  };
  $('#mbOrgClose').onclick = () => { $('#mbOrgMask').hidden = true; };
  $('#mbOrgList').addEventListener('click', e => {
    const b = e.target.closest('[data-org]');
    if (!b) return;
    $('#currentOrganization').textContent = b.dataset.org;   // 模块监听它的变化并自行重置（同桌面端）
    $('#mbOrgName').textContent = b.dataset.org;
    $('#mbOrgMask').hidden = true;
    state.meal = null;
    render();
  });

  /* 初始化：先把两个桌面模块「激活」一次，让它们建好内部状态与 DOM 挂载点；
     它们画出来的表格被 CSS 隐藏，手机端只用它们的计算与动作 */
  MP.enterMealPlan();
  PR.enter();
  render();
})();
