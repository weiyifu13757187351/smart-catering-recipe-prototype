/* ============================================================================
   商户端 · 组织 / 档口 切换器（四页共用）
   ----------------------------------------------------------------------------
   口径（2026-10 确认）：
     - 菜谱中心、商品中心：按「次级组织」定位（只有组织下拉）
     - 排餐计划、生产计划：按「次级组织下的档口」定位（组织 + 档口两级联动）
       计划只挂在档口上；选到「组织」这一层 = 该组织下各档口的总览入口
     - 首次进入业务功能默认第一个次级组织；计划页默认第一个组织下第一个档口
     - 状态全局共享：任一页切换，其它页跟着变（刷新回到默认）
   状态源沿用外壳隐藏节点 #currentOrganization（四个老模块都在读它的文本），
   另加 #currentStall 承载档口（手机端同样结构）。
   本文件不依赖 jQuery/框架；档口数据来自 merchant-stall-data.js。
   ========================================================================== */
(function () {
  if (window.MerchantScope) return;

  const $ = id => document.getElementById(id);
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* 次级组织：桌面端实时读外壳 organizations；手机端没有 organizations，用同一份兜底清单 */
  const FALLBACK_SUBS = [
    { id: 'org_sub_1', name: '东校区第一食堂' },
    { id: 'org_sub_2', name: '东校区第二食堂' },
    { id: 'org_sub_3', name: '北校区食堂' },
    { id: 'org_sub_4', name: '教职工档口' },
    { id: 'org_sub_5', name: '市教育局机关食堂' },
  ];
  const subs = () => {
    try {
      if (typeof organizations !== 'undefined' && Array.isArray(organizations)) {
        const top = organizations.find(o => o.type === 'top');
        const list = ((top && top.children) || []).filter(o => o.type === 'sub').map(o => ({ id: o.id, name: o.name }));
        if (list.length) return list;
      }
    } catch (e) { /* 手机端：走兜底 */ }
    return FALLBACK_SUBS;
  };
  const stallsOf = orgId => (window.MerchantStalls && orgId ? window.MerchantStalls.listByOrg(orgId) : []);
  const stallById = id => (window.MerchantStalls && id ? window.MerchantStalls.get(id) : null);

  const state = { orgId: '', orgName: '', stallId: '', stallName: '' };
  const listeners = new Set();
  const stallListeners = new Set();

  const orgNode = () => $('currentOrganization');
  const stallNode = () => $('currentStall');

  /* 从隐藏状态节点回读（手机端/桌面端互相切换时以节点为准） */
  function readNodes() {
    const o = orgNode();
    if (o) {
      const found = subs().find(s => s.name === (o.textContent || '').trim());
      state.orgId = (o.dataset && o.dataset.orgId) || (found ? found.id : '');
      state.orgName = found ? found.name : (o.textContent || '').trim();
    }
    const st = stallNode();
    if (st) {
      const id = (st.dataset && st.dataset.stallId) || '';
      const hit = id ? stallById(id) : null;
      state.stallId = hit ? hit.id : '';
      state.stallName = hit ? hit.name : '';
      /* 节点上已有档口 = 已经有人定过范围了，别再套默认值 */
      if (hit) stallMode = 'one';
    }
    return state;
  }

  function writeNodes() {
    const o = orgNode();
    if (o) {
      /* 值没变就不写：无害的重复赋值也会触发各模块挂在节点上的 MutationObserver */
      if (state.orgName && o.textContent !== state.orgName) o.textContent = state.orgName;
      if (o.dataset && o.dataset.orgId !== (state.orgId || '')) o.dataset.orgId = state.orgId || '';
    }
    const st = stallNode();
    if (st) {
      if (st.textContent !== (state.stallName || '')) st.textContent = state.stallName || '';
      if (st.dataset && st.dataset.stallId !== (state.stallId || '')) st.dataset.stallId = state.stallId || '';
    }
  }

  const snapshot = () => ({ orgId: state.orgId, orgName: state.orgName, stallId: state.stallId, stallName: state.stallName });

  /* 切换前的拦截（计划页用它接住「未保存的排餐」）：任一守卫返回 false 就整体放弃这次切换，
     控件显示回滚到当前状态，由守卫自己弹「保存后切换」。 */
  const beforeFns = new Set();
  const runBefore = intent => {
    let ok = true;
    beforeFns.forEach(fn => { try { if (fn(intent) === false) ok = false; } catch (e) { /* 守卫异常不阻断 */ } });
    return ok;
  };

  function emit(scope) {
    listeners.forEach(fn => { try { fn(snapshot()); } catch (e) { /* 单个订阅方出错不影响其它 */ } });
    if (scope === 'stall' || scope === 'all') stallListeners.forEach(fn => { try { fn(snapshot()); } catch (e) { /* 同上 */ } });
  }

  /* 默认范围：第一个次级组织；计划页再往下取该组织第一个档口。
     `stallMode`：'one' = 定位到某档口；'all' = 用户显式选了「全部档口（总览）」；
     'none' = 当前组织没有档口；'' = 还没定过。只有用户自己选的总览才拦着默认值，
     重新挂载/换页面时不会被默认值悄悄拉回某个档口。 */
  let stallMode = '';

  function ensureDefault(opts) {
    const o = opts || {};
    readNodes();
    const list = subs();
    if (!list.length) { state.orgId = ''; state.orgName = ''; state.stallId = ''; state.stallName = ''; stallMode = 'none'; writeNodes(); return snapshot(); }
    if (!list.some(s => s.id === state.orgId)) {
      state.orgId = list[0].id;
      state.orgName = list[0].name;
      state.stallId = '';
      state.stallName = '';
      if (stallMode !== 'all') stallMode = '';
    }
    if (o.stall && stallMode !== 'all') {
      /* 计划页默认停在组织层总览（各档口入口本来就是计划页的落点），
         用户在页面里点进某个档口（stallMode='one'）之后就不再被默认值拉回来 */
      if (o.defaultAll && stallMode !== 'one') {
        state.stallId = '';
        state.stallName = '';
        stallMode = 'all';
      } else {
        const stalls = stallsOf(state.orgId);
        const keep = stalls.some(s => s.id === state.stallId);
        if (!keep) {
          state.stallId = stalls.length ? stalls[0].id : '';
          state.stallName = stalls.length ? stalls[0].name : '';
        }
        stallMode = state.stallId ? 'one' : 'none';
      }
    }
    writeNodes();
    return snapshot();
  }

  /* 只选到组织层：档口清空（= 该组织各档口总览） */
  function setOrg(orgId, opts) {
    const o = opts || {};
    readNodes();
    const hit = subs().find(s => s.id === orgId);
    if (!hit) return snapshot();
    const changed = state.orgId !== orgId;
    state.orgId = hit.id;
    state.orgName = hit.name;
    if (o.stall === false) {
      /* 菜谱/商品这类没有档口维度的页面：档口数据不该跟着串组织 */
      const stalls = stallsOf(orgId);
      if (!stalls.some(s => s.id === state.stallId)) {
        state.stallId = '';
        state.stallName = '';
        stallMode = 'none';
      }
    } else if (stallMode === 'all') {
      /* 用户显式选了「全部档口（总览）」：换组织仍留在总览上（新组织没档口就是空态），
         不要把人悄悄塞进新组织的某个档口 —— 他只是想看看另一家的总览 */
      state.stallId = '';
      state.stallName = '';
    } else {
      /* 计划页：切组织落到该组织第一个档口（没档口的组织退回总览/空态） */
      const stalls = stallsOf(orgId);
      const keep = stalls.some(s => s.id === state.stallId);
      state.stallId = keep ? state.stallId : (stalls.length ? stalls[0].id : '');
      state.stallName = keep ? state.stallName : (stalls.length ? stalls[0].name : '');
      stallMode = state.stallId ? 'one' : 'none';
    }
    writeNodes();
    if (changed) emit('all'); else emit('stall');
    return snapshot();
  }

  function setStall(stallId) {
    readNodes();
    const hit = stallById(stallId);
    if (!hit) return snapshot();
    if (state.stallId === hit.id && state.orgId === hit.orgId && stallMode === 'one') return snapshot();
    state.stallId = hit.id;
    state.stallName = hit.name;
    state.orgId = hit.orgId;
    state.orgName = (subs().find(s => s.id === hit.orgId) || {}).name || state.orgName;
    stallMode = 'one';
    writeNodes();
    emit('stall');
    return snapshot();
  }

  /* 计划页：从档口回到「该组织各档口总览」 */
  function clearStall() {
    readNodes();
    if (!state.stallId && stallMode === 'all') return snapshot();
    state.stallId = '';
    state.stallName = '';
    stallMode = 'all';
    writeNodes();
    emit('stall');
    return snapshot();
  }

  /* --------------------------------------------------------------- 控件渲染 */
  const barHtml = (o) => {
    const sc = snapshot();
    const lock = o.locked ? ' disabled' : '';
    const orgOptions = subs().map(s => `<option value="${esc(s.id)}" ${s.id === sc.orgId ? 'selected' : ''}>${esc(s.name)}</option>`).join('');
    const stalls = stallsOf(sc.orgId);
    const stallOptions = o.stall
      ? `<option value="" ${!sc.stallId ? 'selected' : ''}>全部档口（总览）</option>`
        + stalls.map(s => `<option value="${esc(s.id)}" ${s.id === sc.stallId ? 'selected' : ''}>${esc(s.name)}</option>`).join('')
      : '';
    return `<div class="mos-bar" data-mos-bar${o.locked ? ' data-mos-locked="1"' : ''}>
      <span class="mos-field"><i>组织</i><select data-mos-org ${subs().length ? '' : 'disabled'}${lock}>${orgOptions || '<option value="">暂无次级组织</option>'}</select></span>
      ${o.stall ? `<span class="mos-field"><i>档口</i><select data-mos-stall ${stalls.length ? '' : 'disabled'}${lock}>${stallOptions || '<option value="">该组织暂无档口</option>'}</select></span>` : ''}
      ${o.stall && !stalls.length ? '<button type="button" class="mos-link" data-mos-goto-stall>去建档口</button>' : ''}
      ${o.locked ? `<em class="mos-lock" title="${esc(o.lockHint || '当前状态下不可切换范围')}">${esc(o.lockHint || '编辑中不可切换')}</em>` : ''}
    </div>`;
  };

  function bindBar(bar, opts) {
    /* 锁定态（如排餐计划的编辑模式）：下拉是 disabled，也不接任何切换事件 */
    const orgSel = bar.querySelector('[data-mos-org]');
    if (orgSel) orgSel.onchange = () => {
      if (opts.locked) { refreshAll(); return; }
      /* 切组织：计划页跟着落到新组织第一个档口，菜谱/商品页只切组织 */
      if (!runBefore({ kind: 'org', orgId: orgSel.value, stall: !!opts.stall })) { refreshAll(); return; }
      setOrg(orgSel.value, { stall: !!opts.stall });
      refreshAll();
    };
    const stallSel = bar.querySelector('[data-mos-stall]');
    if (stallSel) stallSel.onchange = () => {
      if (opts.locked) { refreshAll(); return; }
      const intent = stallSel.value ? { kind: 'stall', stallId: stallSel.value } : { kind: 'clear' };
      if (!runBefore(intent)) { refreshAll(); return; }
      if (stallSel.value) setStall(stallSel.value); else clearStall();
      refreshAll();
    };
    const goto = bar.querySelector('[data-mos-goto-stall]');
    if (goto) goto.onclick = () => {
      if (opts.locked) return;
      const nav = $('stallListNav');
      if (nav) { nav.click(); toast?.('该组织还没有档口，请先在「档口管理」创建'); }
      else toast?.('请先到「档口管理」为当前组织创建档口');
    };
  }

  const mounts = new Map();   // hostEl -> opts

  /* 切换条挂在标题行**下面**，自己占一行 —— 标题行右侧是页面原有的功能按钮
     （菜谱库的「同步菜谱/新建菜谱」、排餐的「编辑」…），不能被切换器挤到中间去 */
  function barOf(host) {
    const sib = host && host.nextElementSibling;
    return sib && sib.matches && sib.matches('[data-mos-bar]') ? sib : null;
  }

  const modeOf = (o) => `${o.stall ? '1' : '0'}${o.locked ? 'L' : ''}`;

  function mount(host, opts) {
    if (!host) return;
    const o = opts || {};
    ensureDefault(o);
    const html = barHtml(o);
    const existing = barOf(host);
    if (existing && existing.dataset.mosMode === modeOf(o)) {
      existing.outerHTML = html;
    } else {
      if (existing) existing.remove();
      host.insertAdjacentHTML('afterend', html);
    }
    const bar = barOf(host);
    if (bar) { bar.dataset.mosMode = modeOf(o); bindBar(bar, o); }
    mounts.set(host, o);
  }

  function refreshAll() {
    mounts.forEach((o, host) => {
      if (!host.isConnected) { mounts.delete(host); return; }
      const bar = barOf(host);
      if (!bar) return;
      const tmp = document.createElement('div');
      tmp.innerHTML = barHtml(o);
      const next = tmp.firstElementChild;
      next.dataset.mosMode = modeOf(o);
      bar.replaceWith(next);
      bindBar(next, o);
    });
  }

  window.MerchantScope = {
    subs, stallsOf, ensureDefault, setOrg, setStall, clearStall, mount, refreshAll,
    current: snapshot,
    onChange: fn => { listeners.add(fn); return () => listeners.delete(fn); },
    onStallChange: fn => { stallListeners.add(fn); return () => stallListeners.delete(fn); },
    /* 切换前守卫：返回 false 拦下这次切换（未保存内容交给守卫自己处理） */
    onBefore: fn => { beforeFns.add(fn); return () => beforeFns.delete(fn); },
  };

  /* 首次进入只定到「次级组织」这一层：计划页往下是总览还是具体档口，由各页 mount 时声明
     （排餐/生产 = 组织层总览，见 opts.defaultAll）。必须在各业务模块 install() 之前写实
     状态源 —— 模块渲染时就读它，晚一步首帧会先画错再跳一下。
     手机端要落到档口干活，由 merchant-mobile.js 自己调 ensureDefault({stall:true})。 */
  ensureDefault({ stall: false });
})();
