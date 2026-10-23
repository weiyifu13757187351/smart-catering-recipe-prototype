/* ============================================================================
   商户端 · 基础信息 › 供应商管理（只读）
   ----------------------------------------------------------------------------
   - 列表来源：租户端「组织经营 › 供应商管理」里把该供应商绑定到本商户，
     且合作状态为「合作中」时，供应商才会出现在这里
   - 本页只读：不提供新增 / 编辑 / 解除合作，也不带组织切换器
   - 商户与供应商之间的合作协议属于租户与供应商的商务文件，商户端不展示
   - 数据为内存演示数据，刷新页面恢复初始值
   ========================================================================== */
(() => {
  'use strict';
  if (document.getElementById('merchantSupplierNav')) return;

  const $ = id => document.getElementById(id);
  const $$ = sel => [...document.querySelectorAll(sel)];
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const say = msg => { if (typeof toast === 'function') toast(msg); };

  /* 供应类型：与租户端「供应类型」字典一致 */
  const TYPES = [
    { name: '毛菜', desc: '未加工蔬菜，商户自行分拣' },
    { name: '净菜', desc: '已分拣清洗，可直接使用' },
    { name: '半成品', desc: '切配腌制预制，简单加工即可' },
  ];
  const typeDesc = n => (TYPES.find(t => t.name === n) || {}).desc || '';

  /* 当前登录商户（登录页选择后写入 sessionStorage） */
  const FALLBACK_MERCHANT = '第一实验学校';
  const merchantName = () => {
    try { return sessionStorage.getItem('selectedMerchant') || FALLBACK_MERCHANT; } catch (e) { return FALLBACK_MERCHANT; }
  };

  /* ------------------------------------------------------------ 演示数据
     与租户端「供应商管理」里的合作供应商保持同名同码，便于两端对照；
     租户端把合作状态置为「已解除」的供应商不会下发给商户，所以这里没有它。 */
  const SUPPLIERS = [
    {
      id: 'SUP001', name: '上海鲜配供应链有限公司', credit: '91310115MA1K3X8L2P',
      contact: '王经理', phone: '13866216621', addr: '上海市浦东新区川沙路 2888 号 6 号冷链库',
      types: ['毛菜', '半成品'], scopeAll: true, merchants: [],
      foodBizNo: 'JY13101150012345', foodProdNo: '',
      biz: 2, foodBiz: 2, foodProd: 0,
      tenant: '味来餐饮集团', updated: '2026-08-02',
    },
    {
      id: 'SUP002', name: '城西冷链配送中心', credit: '91330106MA2GY7K94T',
      contact: '赵经理', phone: '13788979900', addr: '浙江省杭州市西湖区留和路 18 号冷链园区 B2',
      types: ['净菜', '半成品'], scopeAll: true, merchants: [],
      foodBizNo: 'JY13301060023456', foodProdNo: 'SC10333010600118',
      biz: 2, foodBiz: 1, foodProd: 1,
      tenant: '味来餐饮集团', updated: '2026-07-28',
    },
    {
      id: 'SUP003', name: '本地蔬菜合作社', credit: '91330100MA28T5H63D',
      contact: '周桂芳', phone: '13588774742', addr: '浙江省杭州市余杭区良渚街道蔬菜基地 3 号',
      types: ['毛菜'], scopeAll: false, merchants: ['第一实验学校', '阳光职工餐厅', '城市学院餐饮中心'],
      foodBizNo: '', foodProdNo: '',
      biz: 1, foodBiz: 0, foodProd: 0,
      tenant: '味来餐饮集团', updated: '2026-07-19',
    },
    {
      id: 'SUP005', name: '绿源净菜加工中心', credit: '91330109MA2CF8WQ7L',
      contact: '孙雅琴', phone: '13611885566', addr: '浙江省杭州市萧山区新街街道工业园 7 号',
      types: ['净菜'], scopeAll: true, merchants: [],
      foodBizNo: 'JY13301090456789', foodProdNo: 'SC10133010900456',
      biz: 1, foodBiz: 1, foodProd: 1,
      tenant: '味来餐饮集团', updated: '2026-08-01',
    },
  ];

  /* 其它业务页 id：切换菜单时一并隐藏（各模块页面本身是 .page-view，这里只做兜底） */
  const OTHER_PAGES = ['organizationPage', 'rolesPage', 'adminsPage', 'usersPage', 'recipePage',
    'dishCategoryPage', 'deviceRecipePage', 'productCenterPage', 'mealPlanPage', 'productionPlanPage',
    'purchasePlanPage', 'stallPage'];

  let keyword = '';
  let typeFilter = '';

  /* ---------------------------------------------------------------- 列表页 */
  const PAGE = `
  <section class="card msup-card">
    <div class="msup-head">
      <div><h1>供应商管理</h1><p>本商户可选择的食材供应商，由租户管理员按商户绑定统一配置</p></div>
      <span class="msup-readonly">仅查看</span>
    </div>
    <div class="msup-note"><i>i</i><div>以下供应商由租户管理员在「组织经营 › 供应商管理」中配置并绑定到本商户。如需调整可选择的供应商范围，请联系租户管理员。</div></div>
    <div class="filters msup-filters">
      <input id="msupKeyword" maxlength="40" placeholder="供应商名称 / 统一社会信用代码">
      <select id="msupType">${['<option value="">全部供应类型</option>', ...TYPES.map(t => `<option value="${esc(t.name)}">${esc(t.name)}</option>`)].join('')}</select>
      <button id="msupSearch" class="secondary">查询</button>
      <button id="msupReset" class="secondary">重置</button>
    </div>
    <div class="table-wrap">
      <table class="msup-table">
        <thead><tr>
          <th style="width:27%">供应商信息</th>
          <th style="width:16%">供应类型</th>
          <th style="width:18%">联系人及联系方式</th>
          <th style="width:14%">供货商户范围</th>
          <th style="width:12%">更新时间</th>
          <th style="width:88px">操作</th>
        </tr></thead>
        <tbody id="msupBody"></tbody>
      </table>
      <div id="msupEmpty" class="empty" hidden></div>
    </div>
  </section>`;

  /* -------------------------------------------------------------- 详情抽屉 */
  const DRAWER = `
  <div id="msupMask" class="modal-mask side-drawer-mask">
    <div class="modal msup-drawer">
      <div class="msup-d-head">
        <div><h3>供应商详情</h3><p id="msupDSub"></p></div>
        <span class="msup-d-badge">合作中</span>
      </div>
      <div id="msupDBody" class="msup-d-body"></div>
      <div class="modal-foot">
        <span class="msup-d-foot-note">信息由租户管理员维护，商户端只读</span>
        <button class="cancel" id="msupDClose">关闭</button>
      </div>
    </div>
  </div>`;

  /* ------------------------------------------------------------------ 渲染 */
  const scopeText = s => s.scopeAll ? '全部商户' : `指定 ${s.merchants.length} 家`;

  function rowsOf() {
    const kw = keyword.trim().toLowerCase();
    return SUPPLIERS.filter(s => {
      const okKw = !kw || (s.name + ' ' + s.credit).toLowerCase().indexOf(kw) >= 0;
      const okType = !typeFilter || s.types.indexOf(typeFilter) >= 0;
      return okKw && okType;
    });
  }

  function renderList() {
    const body = $('msupBody');
    const empty = $('msupEmpty');
    if (!body || !empty) return;
    const list = rowsOf();
    body.innerHTML = list.map(s => {
      const idx = SUPPLIERS.indexOf(s);
      return `<tr data-sup="${idx}">
        <td><span class="msup-name">${esc(s.name)}</span><span class="msup-sub">${esc(s.credit)}</span></td>
        <td><div class="msup-chips">${s.types.map(t => `<span class="msup-chip">${esc(t)}</span>`).join('')}</div></td>
        <td><span class="msup-contact">${esc(s.contact)}</span><span class="msup-sub">${esc(s.phone)}</span></td>
        <td><span class="msup-scope${s.scopeAll ? '' : ' part'}">${esc(scopeText(s))}</span></td>
        <td>${esc(s.updated)}</td>
        <td><button class="link" data-view="${idx}">查看详情</button></td>
      </tr>`;
    }).join('');

    empty.hidden = list.length > 0;
    if (!list.length) {
      empty.textContent = SUPPLIERS.length
        ? '没有符合条件的供应商，可调整关键词或供应类型后重试'
        : '暂无可选择的供应商，请联系租户管理员在「组织经营 › 供应商管理」中为本商户绑定供应商';
    }

    $$('#msupBody [data-view]').forEach(btn => {
      btn.onclick = () => openDetail(SUPPLIERS[+btn.dataset.view]);
    });
  }

  /* ---------------------------------------------------------------- 详情 */
  const field = (label, value, full) => `<div class="msup-field${full ? ' full' : ''}"><span>${esc(label)}</span><b>${esc(value || '未填写')}</b></div>`;

  function licBlock(title, short, no, count, max) {
    const tiles = Array.from({ length: count }, (_, i) => `<div class="msup-lic-tile">${esc(short)}${i + 1}</div>`).join('');
    return `<div class="msup-lic">
      <div class="msup-lic-head"><b>${esc(title)}</b><em>${count}/${max}</em></div>
      ${no ? `<p class="msup-lic-no">证号 ${esc(no)}</p>` : ''}
      <div class="msup-lic-tiles">${tiles || '<span class="msup-lic-none">未上传</span>'}</div>
    </div>`;
  }

  function openDetail(s) {
    const me = merchantName();
    const mine = s.scopeAll || s.merchants.indexOf(me) >= 0;
    $('msupDSub').textContent = `${s.name} · ${s.credit}`;
    $('msupDBody').innerHTML = `
      <section class="msup-section">
        <h4>基础信息</h4>
        <div class="msup-dgrid">
          ${field('供应商名称', s.name)}
          ${field('统一社会信用代码', s.credit)}
          ${field('联系人', s.contact)}
          ${field('联系方式', s.phone)}
          ${field('供应商地址', s.addr, true)}
        </div>
      </section>
      <section class="msup-section">
        <h4>资质证照 <em>用于食安索证索票</em></h4>
        <div class="msup-lic-grid">
          ${licBlock('营业执照', '执照', '', s.biz, 2)}
          ${licBlock('食品经营许可证', '经营许可', s.foodBizNo, s.foodBiz, 2)}
          ${licBlock('食品生产许可证', '生产许可', s.foodProdNo, s.foodProd, 2)}
        </div>
        <p class="msup-hint">证照沿用供应商在平台的统一档案，由建档租户上传并维护。</p>
      </section>
      <section class="msup-section">
        <h4>供货能力</h4>
        <div class="msup-type-list">
          ${s.types.map(t => `<div class="msup-type"><b>${esc(t)}</b><span>${esc(typeDesc(t))}</span></div>`).join('')}
        </div>
      </section>
      <section class="msup-section">
        <h4>供货范围</h4>
        ${s.scopeAll
          ? `<p class="msup-scope-line">该供应商向租户下<b>全部商户</b>供货，本商户在范围内。</p>`
          : `<p class="msup-scope-line">该供应商仅向以下 <b>${s.merchants.length}</b> 家商户供货：</p>
             <div class="msup-merchants">${s.merchants.map(m => `<span class="msup-merchant${m === me ? ' mine' : ''}">${esc(m)}${m === me ? '<i>本商户</i>' : ''}</span>`).join('')}</div>`}
        ${mine ? '' : '<p class="msup-hint warn">本商户不在该供应商的供货范围内。</p>'}
      </section>`;

    $('msupMask').classList.add('show');
    $('msupDClose').onclick = closeDetail;
    $('msupMask').onclick = e => { if (e.target.id === 'msupMask') closeDetail(); };
    document.addEventListener('keydown', escClose);
  }

  function escClose(e) { if (e.key === 'Escape') closeDetail(); }
  function closeDetail() {
    $('msupMask').classList.remove('show');
    document.removeEventListener('keydown', escClose);
  }

  /* -------------------------------------------------------- 页面切换与安装 */
  function enter() {
    $$('.page-view').forEach(x => { x.hidden = true; });
    OTHER_PAGES.forEach(id => { const el = $(id); if (el) el.hidden = true; });
    $('merchantSupplierPage').hidden = false;
    $$('.nav-child').forEach(n => n.classList.toggle('active', n === $('merchantSupplierNav')));
    const bc = document.querySelector('.breadcrumb');
    if (bc) bc.innerHTML = '基础信息&nbsp; / &nbsp;<strong id="breadcrumbTitle">供应商管理</strong>';
    renderList();
  }

  function leave() {
    const page = $('merchantSupplierPage');
    if (page) page.hidden = true;
    const nav = $('merchantSupplierNav');
    if (nav) nav.classList.remove('active');
  }

  function install() {
    const sidebar = document.querySelector('.sidebar');
    const main = document.querySelector('.main');
    if (!sidebar || !main) return;

    /* 挂在「基础信息」分组下、紧随「组织及成员」 */
    const orgNav = sidebar.querySelector('.nav-child[data-page="organization"]');
    const navHtml = '<div class="nav-child" id="merchantSupplierNav" data-parent="基础信息"><span>供应商管理</span></div>';
    if (orgNav) orgNav.insertAdjacentHTML('afterend', navHtml);
    else sidebar.insertAdjacentHTML('beforeend', navHtml);

    const page = document.createElement('div');
    page.id = 'merchantSupplierPage';
    page.className = 'page-view';
    page.hidden = true;
    page.innerHTML = PAGE;
    main.appendChild(page);

    document.body.insertAdjacentHTML('beforeend', DRAWER);

    $('merchantSupplierNav').onclick = e => { e.stopImmediatePropagation(); enter(); };

    /* 点其它菜单项时收起本页（本页 nav 没有 data-page，外壳的切换逻辑管不到它） */
    document.addEventListener('click', e => {
      const nav = e.target && e.target.closest ? e.target.closest('.nav-child') : null;
      if (nav && nav.id !== 'merchantSupplierNav') leave();
    }, true);

    $('msupSearch').onclick = () => {
      keyword = $('msupKeyword').value;
      typeFilter = $('msupType').value;
      renderList();
    };
    $('msupReset').onclick = () => {
      $('msupKeyword').value = '';
      $('msupType').value = '';
      keyword = ''; typeFilter = '';
      renderList();
    };
    $('msupKeyword').onkeydown = e => { if (e.key === 'Enter') $('msupSearch').click(); };

    renderList();
  }

  install();
})();
