/* ============================================================================
   商户端 · 档口管理（一级「档口管理」/ 二级「档口列表」）
   ----------------------------------------------------------------------------
   - 档口 = 某个「次级组织」下的经营窗口，含经营餐次与各餐次营业时间
   - 组织下拉实时读取外壳的 organizations[0].children（type === 'sub'）：
     在「组织及成员」里新增/删除次级组织后，本页下拉会自动跟着变
   - 数据为内存演示数据，刷新页面恢复初始值（与「组织及成员」页一致）
   - 本页不参与排餐/生产计划的取数：档口目前只是一份主数据
   ========================================================================== */
(() => {
  if (document.getElementById('stallListNav')) return;

  const $ = id => document.getElementById(id);
  const $$ = sel => [...document.querySelectorAll(sel)];
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const say = msg => { if (typeof toast === 'function') toast(msg); };
  const showMask = id => { const el = $(id); if (el) el.classList.add('show'); };
  const hideMask = id => { const el = $(id); if (el) el.classList.remove('show'); };

  const CREATOR = '平台管理员';
  const MEALS = ['早餐', '早点', '午餐', '午点', '晚餐', '夜宵'];
  /* 只有在拿不到外壳组织数据时才用的兜底示例（正常情况用不上） */
  const FALLBACK_SUBS = [
    { id: 'org_sub_1', name: '东校区第一食堂' },
    { id: 'org_sub_2', name: '东校区第二食堂' },
    { id: 'org_sub_3', name: '北校区食堂' },
    { id: 'org_sub_4', name: '教职工档口' },
    { id: 'org_sub_5', name: '市教育局机关食堂' },
  ];

  /* 次级组织：取不到组织数据返回 null（用兜底），取到但没有次级组织返回 [] */
  const liveSubs = () => {
    if (typeof organizations === 'undefined' || !Array.isArray(organizations)) return null;
    const top = organizations.find(o => o.type === 'top');
    if (!top) return null;
    return (top.children || []).filter(o => o.type === 'sub').map(o => ({ id: o.id, name: o.name }));
  };
  const subOrgs = () => liveSubs() ?? FALLBACK_SUBS;
  const orgName = id => subOrgs().find(o => o.id === id)?.name || '—';

  /* 负责人：实时读外壳「组织及成员」页的 people（一个成员可挂多个组织，取所选组织及其下级组织） */
  const memberOrgIds = id => (typeof descendants === 'function' ? descendants(id) : [id]);
  const membersOf = orgId => {
    if (!orgId || typeof people === 'undefined' || !Array.isArray(people)) return [];
    const ids = memberOrgIds(orgId);
    return people.filter(p => (p.orgIds || []).some(x => ids.includes(x)));
  };
  const memberKey = p => p.memberId || String(p.id);
  const memberText = p => `${p.name}（${p.memberType || '成员'}）${p.phone || ''}`;
  const ownerOf = s => (s.owner && s.owner.name ? s.owner : null);

  const nowText = () => {
    const d = new Date(), p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  };

  /* ---------------------------------------------------------------- 演示数据 */
  /* 档口数据改由共享数据源提供（merchant-stall-data.js）：手机端与排餐/生产计划的
     「档口切换器」要读同一份档口，所以本页只维护这一个数组（增删改都在原地做，
     不要整体重新赋值，否则共享引用会断）。 */
  const stalls = (window.MerchantStalls && window.MerchantStalls.list) || [];

  let keyword = '';
  let orgFilter = '';            // 所属组织筛选：'' = 全部组织（点「查询」才生效）
  let editingId = null;
  let draftMeals = [];          // 抽屉里已勾选的餐次及时间 [{meal,start,end}]
  let draftOwnerId = '';        // 抽屉里选中的负责人 memberId

  /* ------------------------------------------------------------ 侧边栏与页面 */
  const PAGE = `
  <section class="card stall-card">
    <div class="stall-head">
      <div><h1>档口列表</h1><p>维护各次级组织下的经营档口，记录经营餐次与营业时间</p></div>
      <button class="primary" id="stallAdd">+ 新增档口</button>
    </div>
    <div class="filters stall-filters">
      <select id="stallOrgFilter" title="按所属组织筛选"></select>
      <input id="stallNameFilter" maxlength="30" placeholder="档口名称">
      <button id="stallSearch" class="secondary">查询</button>
      <button id="stallReset" class="secondary">重置</button>
    </div>
    <div class="table-wrap">
      <table class="stall-table">
        <thead><tr><th style="width:20%">所属组织</th><th style="width:16%">档口名称</th><th>经营餐次</th><th style="width:19%">负责人及联系方式</th><th style="width:17%">创建时间</th><th style="width:120px">操作</th></tr></thead>
        <tbody id="stallBody"></tbody>
      </table>
      <div id="stallEmpty" class="empty" hidden></div>
    </div>
  </section>`;

  const DRAWERS = `
  <div id="stallDrawerMask" class="modal-mask side-drawer-mask">
    <div class="modal">
      <h3 id="stallDrawerTitle">新增档口</h3>
      <p class="stall-drawer-sub">档口挂在某个次级组织下；经营餐次可多选，每个餐次单独设置营业时间与预计人均用餐量。</p>
      <div class="drawer-form-grid" id="stallFormBody"></div>
      <div class="modal-foot">
        <button class="cancel" id="stallCancel">取消</button>
        <button class="confirm" id="stallSave">保存</button>
      </div>
    </div>
  </div>
  <div id="stallDeleteMask" class="modal-mask">
    <div class="modal">
      <h3>删除档口</h3>
      <p id="stallDeleteText">确认删除该档口吗？</p>
      <div class="modal-foot">
        <button class="cancel" id="stallDeleteCancel">取消</button>
        <button id="stallDeleteConfirm" class="danger-confirm">确认删除</button>
      </div>
    </div>
  </div>`;

  /* 本页要隐藏的其它页（新增页面时记得同步其它模块的清单） */
  const OTHER_PAGES = ['organizationPage', 'rolesPage', 'adminsPage', 'usersPage', 'recipePage',
    'dishCategoryPage', 'deviceRecipePage', 'productCenterPage', 'mealPlanPage', 'productionPlanPage'];

  /* 组织下拉的选项：与抽屉里「所属组织」同一份数据源；组织被删掉时回到「全部组织」 */
  function renderOrgFilter() {
    const sel = $('stallOrgFilter');
    if (!sel) return;
    const orgs = subOrgs();
    if (orgFilter && !orgs.some(o => o.id === orgFilter)) orgFilter = '';
    sel.innerHTML = '<option value="">全部组织</option>' + orgs.map(o => `<option value="${o.id}">${esc(o.name)}</option>`).join('');
    sel.value = orgFilter;
  }

  function enter() {
    document.querySelectorAll('.page-view').forEach(x => { x.hidden = true }); OTHER_PAGES.forEach(id => { const el = $(id); if (el) el.hidden = true; });
    $('stallPage').hidden = false;
    $$('.nav-child').forEach(n => n.classList.toggle('active', n === $('stallListNav')));
    const bc = document.querySelector('.breadcrumb');
    if (bc) bc.innerHTML = '档口管理&nbsp; / &nbsp;<strong id="breadcrumbTitle">档口列表</strong>';
    renderOrgFilter();
    renderList();
  }

  /* ------------------------------------------------------------------ 列表 */
  const orderedMeals = list => list.slice().sort((a, b) => MEALS.indexOf(a.meal) - MEALS.indexOf(b.meal));
  const mealsCell = s => orderedMeals(s.meals).map(m => `<span class="stall-meal-chip">${m.meal} ${m.start}–${m.end}</span>`).join('');

  function renderList() {
    const kw = keyword.trim();
    const rows = stalls
      .filter(s => (!kw || s.name.includes(kw)) && (!orgFilter || s.orgId === orgFilter))
      .slice()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    $('stallBody').innerHTML = rows.map(s => `
      <tr>
        <td>${esc(orgName(s.orgId))}</td>
        <td><b class="stall-name">${esc(s.name)}</b></td>
        <td><div class="stall-meal-chips">${mealsCell(s)}</div></td>
        <td>${(() => { const o = ownerOf(s); return o
          ? `<b class="stall-owner">${esc(o.name)}</b><span class="stall-owner-phone">${esc(o.phone || '—')}</span>`
          : '<span class="stall-owner-empty">—</span>'; })()}</td>
        <td>${esc(s.creator)} · ${esc(s.createdAt)}</td>
        <td><div class="ops">
          <button class="link edit-stall" data-id="${s.id}">编辑</button>
          <button class="link danger delete-stall" data-id="${s.id}">删除</button>
        </div></td>
      </tr>`).join('');

    const noSubs = subOrgs().length === 0;
    const orgEmpty = !!orgFilter && !stalls.some(s => s.orgId === orgFilter);
    const empty = $('stallEmpty');
    empty.textContent = noSubs ? '当前商户还没有次级组织，请先到「组织及成员」创建次级组织'
      : stalls.length === 0 ? '暂无档口，点击「+ 新增档口」创建'
        : orgEmpty ? `「${orgName(orgFilter)}」下暂无档口，可点击「+ 新增档口」创建`
          : '没有匹配的档口，换个档口名称或组织再查';
    empty.hidden = rows.length > 0;
    $('stallAdd').disabled = noSubs;
    $('stallAdd').title = noSubs ? '请先创建次级组织' : '';
  }

  /* ------------------------------------------------------------------ 抽屉 */
  const orderedDraft = () => orderedMeals(draftMeals);

  function syncDraftTimes() {
    $$('.stall-time-row.is-conflict').forEach(r => r.classList.remove('is-conflict'));
    $$('#stallMealTimes input[data-bound]').forEach(inp => {
      const row = draftMeals.find(d => d.meal === inp.dataset.meal);
      if (!row) return;
      if (inp.dataset.bound === 'gram') {
        /* 预计人均用餐量：选填，空串表示不设置（排餐计划就回落到原默认口径） */
        const v = inp.value.trim();
        row.gram = v === '' ? '' : Number(v);
      } else {
        row[inp.dataset.bound] = inp.value;
      }
    });
  }

  function renderTimeRows() {
    draftMeals = orderedDraft();
    const box = $('stallMealTimes');
    box.innerHTML = draftMeals.length
      ? draftMeals.map(d => `<div class="stall-time-row" data-meal="${d.meal}">
          <b>${d.meal}</b>
          <input type="time" data-meal="${d.meal}" data-bound="start" value="${d.start}">
          <span>至</span>
          <input type="time" data-meal="${d.meal}" data-bound="end" value="${d.end}">
          <span class="stall-gram-wrap">
            <input class="stall-gram" type="number" min="1" max="9999" step="1" data-meal="${d.meal}" data-bound="gram"
                   value="${d.gram === '' || d.gram == null ? '' : d.gram}" placeholder="预计人均用餐量"
                   title="预计人均用餐量（克/人，非必填）：填写后作为排餐计划该餐次人均用餐量的默认值">
            <span class="stall-gram-unit">克/人</span>
          </span>
        </div>`).join('')
      : '<p class="stall-times-empty">尚未选择餐次，勾选后在此填写各餐次营业时间</p>';
    $$('#stallMealTimes input[data-bound]').forEach(inp => {
      inp.oninput = syncDraftTimes;
      inp.onchange = syncDraftTimes;
    });
  }

  function openDrawer(stall) {
    editingId = stall ? stall.id : null;
    draftOwnerId = stall && stall.owner ? (stall.owner.memberId || '') : '';
    draftMeals = stall ? stall.meals.map(m => ({ ...m })) : [];
    $('stallDrawerTitle').textContent = stall ? '编辑档口' : '新增档口';

    const options = subOrgs().map(o => `<option value="${o.id}" ${stall && stall.orgId === o.id ? 'selected' : ''}>${esc(o.name)}</option>`).join('');
    $('stallFormBody').innerHTML = `
      <div><label>组织选择 <span class="required">*</span></label>
        <select id="stallOrg"><option value="">请选择次级组织</option>${options}</select></div>
      <div><label>档口名称 <span class="required">*</span></label>
        <input id="stallName" maxlength="30" placeholder="请输入档口名称" value="${esc(stall ? stall.name : '')}"></div>
      <div class="drawer-full"><label>负责人及联系方式 <span class="required">*</span></label>
        <select id="stallOwner"></select>
        <p class="stall-owner-hint" id="stallOwnerHint"></p></div>
      <div class="drawer-full"><label>经营餐次 <span class="required">*</span></label>
        <div class="meal-grid stall-meals">${MEALS.map(m => `<label><input type="checkbox" data-meal="${m}" ${draftMeals.some(d => d.meal === m) ? 'checked' : ''}>${m}</label>`).join('')}</div>
        <div class="stall-meal-times" id="stallMealTimes"></div>
        <p class="stall-rule">同一档口内各餐次营业时间不可重叠；首尾相接可以（如早餐 09:00 结束、早点 09:00 开始）。预计人均用餐量选填（克/人）：填写后，排餐计划里该餐次的人均用餐量默认引用此值。</p>
      </div>`;

    $('stallOrg').onchange = () => {
      const had = draftOwnerId;
      renderOwnerOptions();
      if (had && !draftOwnerId) say('已切换组织，请重新选择负责人');
    };
    $('stallOwner').onchange = () => { draftOwnerId = $('stallOwner').value; renderOwnerHint(); };
    renderOwnerOptions();

    $$('#stallFormBody input[type="checkbox"][data-meal]').forEach(cb => {
      cb.onchange = () => {
        syncDraftTimes();
        const m = cb.dataset.meal;
        if (cb.checked) { if (!draftMeals.some(d => d.meal === m)) draftMeals.push({ meal: m, start: '', end: '', gram: '' }); }
        else draftMeals = draftMeals.filter(d => d.meal !== m);
        renderTimeRows();
      };
    });
    renderTimeRows();
    showMask('stallDrawerMask');
  }

  /* ------------------------------------------------------------------ 校验 */
  /* 两个餐次的时间区间是否重叠；首尾相接（09:00 结束 / 09:00 开始）不算重叠 */
  const overlap = (a, b) => a.start < b.end && b.start < a.end;

  function markConflict(meals) {
    $$('.stall-time-row.is-conflict').forEach(r => r.classList.remove('is-conflict'));
    meals.forEach(m => {
      const row = document.querySelector(`.stall-time-row[data-meal="${m}"]`);
      if (row) row.classList.add('is-conflict');
    });
  }

  function validate() {
    const orgId = $('stallOrg').value;
    const name = $('stallName').value.trim();
    if (!orgId) return '请选择所属组织';
    if (!name) return '请输入档口名称';
    if (stalls.some(s => s.id !== editingId && s.orgId === orgId && s.name === name)) return '该组织下已存在同名档口';
    if (!membersOf(orgId).length) return '该组织暂无成员，请先到「组织及成员」添加后再选负责人';
    /* 必须能在**当前组织**的成员里取到人：光判「非空」不够 ——
       组织被程序化改动（或成员后来被移出该组织）时，下拉里会留着上一份组织的人，
       校验能过、保存时却解析不到人，档口就会存成没有负责人的一行 */
    if (!membersOf(orgId).some(p => memberKey(p) === $('stallOwner').value)) return '请选择负责人';
    syncDraftTimes();
    if (!draftMeals.length) return '请至少选择 1 个经营餐次';
    const list = orderedDraft();
    for (const d of list) {
      if (!d.start || !d.end) return `请填写${d.meal}的营业开始/结束时间`;
      if (d.end <= d.start) return `${d.meal}的结束时间需晚于开始时间`;
    }
    /* 预计人均用餐量：非必填；填了就必须是 1–9999 的克数（与排餐计划同一口径） */
    for (const d of list) {
      const g = d.gram;
      if (g === '' || g == null) continue;
      if (!Number.isFinite(g) || g <= 0) { markConflict([d.meal]); return `${d.meal}的预计人均用餐量需为大于 0 的数字`; }
      if (g > 9999) { markConflict([d.meal]); return `${d.meal}的预计人均用餐量不能超过 9999 克`; }
    }
    /* 餐次之间不允许时间重叠；相接（上一个到点即下一个开始）放行 */
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        if (overlap(list[i], list[j])) {
          markConflict([list[i].meal, list[j].meal]);
          return `${list[i].meal}与${list[j].meal}的营业时间重叠（${list[j].start}–${list[j].end}），请调整`;
        }
      }
    }
    return null;
  }

  /* 抽屉里的负责人下拉：候选跟着「组织选择」走 */
  function renderOwnerOptions() {
    const orgId = $('stallOrg').value;
    const sel = $('stallOwner');
    const list = membersOf(orgId);
    if (!orgId) {
      sel.disabled = true;
      sel.innerHTML = '<option value="">请先选择组织</option>';
    } else if (!list.length) {
      sel.disabled = true;
      sel.innerHTML = '<option value="">该组织暂无成员</option>';
    } else {
      sel.disabled = false;
      sel.innerHTML = '<option value="">请选择负责人</option>'
        + list.map(p => `<option value="${esc(memberKey(p))}">${esc(memberText(p))}</option>`).join('');
    }
    const hit = list.some(p => memberKey(p) === draftOwnerId);
    sel.value = hit ? draftOwnerId : '';
    if (!hit) draftOwnerId = '';
    renderOwnerHint();
  }

  /* 字段下方默认不留小字（下拉选项里已带姓名与手机号）；只有该组织没有成员时才提示去哪加人 */
  function renderOwnerHint() {
    const orgId = $('stallOrg').value;
    const hint = $('stallOwnerHint');
    const empty = !!orgId && !membersOf(orgId).length;
    hint.hidden = !empty;
    hint.textContent = empty ? '该组织暂无成员，请先到「组织及成员」添加后再选负责人' : '';
  }

  /* 抽屉里的负责人下拉：候选跟着「组织选择」走 */
  function renderOwnerOptions() {
    const orgId = $('stallOrg').value;
    const sel = $('stallOwner');
    const list = membersOf(orgId);
    if (!orgId) {
      sel.disabled = true;
      sel.innerHTML = '<option value="">请先选择组织</option>';
    } else if (!list.length) {
      sel.disabled = true;
      sel.innerHTML = '<option value="">该组织暂无成员</option>';
    } else {
      sel.disabled = false;
      sel.innerHTML = '<option value="">请选择负责人</option>'
        + list.map(p => `<option value="${esc(memberKey(p))}">${esc(memberText(p))}</option>`).join('');
    }
    const hit = list.some(p => memberKey(p) === draftOwnerId);
    sel.value = hit ? draftOwnerId : '';
    if (!hit) draftOwnerId = '';
    renderOwnerHint();
  }

  function renderOwnerHint() {
    const orgId = $('stallOrg').value;
    const hint = $('stallOwnerHint');
    const empty = !!orgId && !membersOf(orgId).length;
    hint.hidden = !empty;
    hint.textContent = empty ? '该组织暂无成员，请先到「组织及成员」添加后再选负责人' : '';
  }

  function save() {
    const err = validate();
    if (err) return say(err);
    const orgId = $('stallOrg').value;
    const name = $('stallName').value.trim();
    const meals = orderedDraft().map(d => ({
      meal: d.meal, start: d.start, end: d.end,
      gram: d.gram === '' || d.gram == null ? '' : Number(d.gram),
    }));
    const picked = membersOf(orgId).find(p => memberKey(p) === $('stallOwner').value);
    const owner = picked
      ? { memberId: memberKey(picked), name: picked.name, phone: picked.phone || '', memberType: picked.memberType || '' }
      : null;

    if (editingId) {
      const row = stalls.find(s => s.id === editingId);
      if (row) Object.assign(row, { orgId, name, meals, owner });
      say('档口信息已保存');
    } else {
      stalls.unshift({ id: `st_${Date.now()}`, orgId, name, meals, owner, creator: CREATOR, createdAt: nowText() });
      say('档口创建成功');
    }
    hideMask('stallDrawerMask');
    renderList();
  }

  /* ------------------------------------------------------------------ 事件 */
  function bind() {
    $('stallAdd').onclick = () => {
      if (subOrgs().length === 0) return say('请先到「组织及成员」创建次级组织');
      openDrawer(null);
    };
    /* 组织下拉与名称一起提交：只在点「查询」（或名称框回车）时生效 */
    const applyFilter = () => {
      keyword = $('stallNameFilter').value;
      orgFilter = $('stallOrgFilter') ? $('stallOrgFilter').value : '';
      renderList();
    };
    $('stallSearch').onclick = applyFilter;
    $('stallReset').onclick = () => {
      $('stallNameFilter').value = ''; keyword = '';
      orgFilter = ''; if ($('stallOrgFilter')) $('stallOrgFilter').value = '';
      renderList();
    };
    $('stallNameFilter').oninput = e => { if (!e.target.value) { keyword = ''; renderList(); } };
    $('stallNameFilter').onkeydown = e => { if (e.key === 'Enter') applyFilter(); };

    $('stallBody').onclick = e => {
      const edit = e.target.closest('.edit-stall');
      const del = e.target.closest('.delete-stall');
      if (edit) return openDrawer(stalls.find(s => s.id === edit.dataset.id));
      if (del) {
        const row = stalls.find(s => s.id === del.dataset.id);
        if (!row) return;
        $('stallDeleteText').textContent = `确认删除档口「${row.name}」吗？删除后不可恢复。`;
        $('stallDeleteConfirm').dataset.id = row.id;
        showMask('stallDeleteMask');
      }
    };

    $('stallCancel').onclick = () => hideMask('stallDrawerMask');
    $('stallSave').onclick = save;
    $('stallDrawerMask').onclick = e => { if (e.target === $('stallDrawerMask')) hideMask('stallDrawerMask'); };
    $('stallDeleteCancel').onclick = () => hideMask('stallDeleteMask');
    $('stallDeleteConfirm').onclick = () => {
      const id = $('stallDeleteConfirm').dataset.id;
      stalls.splice(0, stalls.length, ...stalls.filter(s => s.id !== id));   // 原地改，保住共享引用
      hideMask('stallDeleteMask');
      renderList();
      say('档口已删除');
    };
  }

  function install() {
    const sidebar = document.querySelector('.sidebar');
    const main = document.querySelector('.main');
    if (!sidebar || !main) return;

    sidebar.insertAdjacentHTML('beforeend', `
      <div class="nav-parent" id="stallParent"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M4 9h16v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z"/><path d="M3 9l1.6-4.2A1 1 0 0 1 5.5 4h13a1 1 0 0 1 .9.8L21 9"/><path d="M9 20v-6h6v6"/></svg><span>档口管理</span></div>
      <div class="nav-child" id="stallListNav"><span>档口列表</span></div>`);

    const page = document.createElement('div');
    page.id = 'stallPage';
    page.className = 'page-view';
    page.hidden = true;
    page.innerHTML = PAGE;
    main.appendChild(page);
    document.body.insertAdjacentHTML('beforeend', DRAWERS);

    $('stallListNav').onclick = e => { e.stopImmediatePropagation(); enter(); };
    bind();
  }

  install();
})();
