(()=>{
  const INITIAL_PASSWORD='slw@000000';
  const roles=[
    {id:1,name:'超级管理员',desc:'拥有运营端全部功能和全部数据权限',scope:'all',status:'启用',users:1,builtin:true,permissions:['全部功能']},
    {id:2,name:'商品运营',desc:'维护运营商品、SKU及基础数据',scope:'own',status:'启用',users:3,permissions:['标准食材-查看','运营商品-查看','运营商品-新增','运营商品-编辑','运营商品-发布','SKU中心-查看','SKU中心-编辑','品牌库-查看','品牌库-新增','品牌库-编辑','分类库-查看','分类库-新增','分类库-编辑']},
    {id:3,name:'授权管理员',desc:'负责商品授权和菜谱授权',scope:'all',status:'启用',users:2,permissions:['商品授权-查看','商品授权-新建','商品授权-撤销','菜谱授权-查看','菜谱授权-新建','菜谱授权-撤销','发布记录-查看']},
    {id:4,name:'运营查看员',desc:'仅查看运营业务数据',scope:'own',status:'停用',users:0,permissions:['标准食材-查看','运营商品-查看','SKU中心-查看','发布记录-查看']}
  ];
  // 超级管理员账号固定存在，参与角色「关联账号」统计，但不在运营账号列表中展示。
  const accounts=[
    {id:1,name:'林晓峰',mobile:'13800138001',roleId:1,status:'正常',lastLogin:'2026-09-20 09:18',creator:'系统',created:'2026-06-01 10:00',reminder:'已处理',remark:'运营负责人'},
    {id:2,name:'周雨',mobile:'13800138002',roleId:2,status:'正常',lastLogin:'2026-09-19 16:42',creator:'林晓峰',created:'2026-08-05 11:20',reminder:'已处理',remark:''},
    {id:3,name:'陈晨',mobile:'13800138003',roleId:3,status:'正常',lastLogin:'2026-09-18 14:06',creator:'林晓峰',created:'2026-08-18 09:35',reminder:'待提醒',remark:'负责租户授权'},
    {id:4,name:'王蕾',mobile:'13800138004',roleId:2,status:'停用',lastLogin:'2026-09-02 10:11',creator:'林晓峰',created:'2026-08-22 15:10',reminder:'已处理',remark:''}
  ];
  const permissionGroups={
    '商品中心':{
      '标准食材':['查看'],
      '运营商品':['查看','新增','编辑','发布','下架'],
      'SKU中心':['查看','编辑','停用'],
      '发布记录':['查看']
    },
    '授权管理':{
      '商品授权':['查看','新建','撤销'],
      '菜谱授权':['查看','新建','撤销']
    },
    '基础数据':{
      '品牌库':['查看','新增','编辑','删除'],
      '分类库':['查看','新增','编辑','删除']
    },
    '系统管理':{
      '运营角色与权限':['查看','维护'],
      '运营账号':['查看','新增','编辑','启停','重置密码']
    }
  };
  const allPermissions=()=>Object.values(permissionGroups).flatMap(menus=>Object.entries(menus).flatMap(([menu,actions])=>actions.map(action=>`${menu}-${action}`)));
  // 当前登录的普通运营账号：默认周雨，登录流程登录成功后同步更新。
  // PRD 10.3：普通运营账号不能停用自己的账号。
  let CURRENT_ACCOUNT_ID=2;
  let current='',modal=null;
  // 供登录流程同步当前登录账号，列表里的「当前登录账号」标识随之变化。
  window.__sysSession={setCurrentAccount(id){const next=Number(id);if(next===CURRENT_ACCOUNT_ID)return;CURRENT_ACCOUNT_ID=next;render()}};
  // 筛选草稿（输入/选择后不立即过滤）与已应用条件（点击“搜索”后才生效）。
  const roleQuery={keyword:'',status:'全部状态'};
  const roleApplied={keyword:'',status:'全部状态'};
  const accountQuery={keyword:'',role:'全部角色',status:'全部状态'};
  const accountApplied={keyword:'',role:'全部角色',status:'全部状态'};
  const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const roleById=id=>roles.find(r=>r.id===Number(id));
  const accountsForRole=id=>accounts.filter(a=>a.roleId===Number(id));
  const toast=msg=>{document.querySelector('.sys-toast')?.remove();const el=document.createElement('div');el.className='sys-toast';el.textContent='✓ '+msg;document.body.append(el);setTimeout(()=>el.remove(),2200)};

  function install(){
    const nav=document.querySelector('.sidebar nav');
    if(!nav||document.querySelector('.system-nav-section'))return setTimeout(install,80);
    nav.insertAdjacentHTML('beforeend',`<div class="system-nav-section"><p>系统管理</p><div class="system-nav-subtitle">租户管理</div><button data-system-page="tenantRoles"><span>租户角色与权限</span></button><button data-system-page="tenants"><span>租户管理</span></button><div class="system-nav-subtitle">运营账号管理</div><button data-system-page="operatorRoles"><span>运营角色与权限</span></button><button data-system-page="operatorAccounts"><span>运营账号</span></button></div>`);
    nav.addEventListener('click',e=>{const btn=e.target.closest('[data-system-page]');if(btn){e.preventDefault();openPage(btn.dataset.systemPage)}else if(e.target.closest('button'))closeSystemPage()});
    const requested=new URLSearchParams(location.search).get('page');
    if(['tenantRoles','tenants','operatorRoles','operatorAccounts'].includes(requested))openPage(requested,false);
  }
  function closeSystemPage(){
    document.querySelector('.system-page')?.remove();document.querySelector('main>.content')?.removeAttribute('hidden');
    document.querySelectorAll('[data-system-page]').forEach(b=>b.classList.remove('active'));current='';
  }
  function openPage(page,push=true){
    current=page;document.querySelector('main>.content')?.setAttribute('hidden','');
    let host=document.querySelector('.system-page');if(!host){host=document.createElement('section');host.className='system-page';document.querySelector('main').append(host)}
    document.querySelectorAll('.sidebar nav button').forEach(b=>b.classList.remove('active'));
    document.querySelector(`[data-system-page="${page}"]`)?.classList.add('active');
    const title={tenantRoles:'租户角色与权限',tenants:'租户管理',operatorRoles:'运营角色与权限',operatorAccounts:'运营账号'}[page];
    const crumb=document.querySelector('.crumb');if(crumb)crumb.innerHTML=`系统管理 <span>/</span> ${title}`;
    if(push)history.replaceState({},'',`?page=${page}`);render();
  }
  function render(){
    const host=document.querySelector('.system-page');if(!host)return;
    if(current==='operatorRoles')renderRoles(host);else if(current==='operatorAccounts')renderAccounts(host);else renderPlaceholder(host,current);
  }
  function renderPlaceholder(host,page){
    const title=page==='tenantRoles'?'租户角色与权限':'租户管理';
    host.innerHTML=`<div class="page-head"><div><h1>${title}</h1><p>租户账号体系相关功能入口。</p></div></div><div class="system-placeholder"><i>✓</i><h2>${title}</h2><p>该功能已经开发完成，本次运营端原型仅展示菜单入口，不重复设计页面。</p></div>`;
  }
  function renderRoles(host){
    const keyword=roleApplied.keyword.trim();
    const list=roles.filter(r=>(!keyword||(r.name+r.desc).includes(keyword))&&(roleApplied.status==='全部状态'||r.status===roleApplied.status));
    host.innerHTML=`<div class="page-head"><div><h1>运营角色与权限</h1><p>配置运营端子账号的功能权限和可操作数据范围。</p></div><button class="primary" data-action="new-role">＋ 新增运营角色</button></div>
    <div class="card"><div class="filters"><div class="search"><span>⌕</span><input id="role-search" placeholder="搜索角色名称或说明" value="${esc(roleQuery.keyword)}"></div><select id="role-status">${['全部状态','启用','停用'].map(s=>`<option ${roleQuery.status===s?'selected':''}>${s}</option>`).join('')}</select><button class="primary" data-action="search-role">搜索</button><button class="ghost" data-action="reset-role-filter">重置</button></div>
    <table class="system-table"><thead><tr><th>角色名称</th><th>角色说明</th><th>功能权限</th><th>数据权限</th><th>关联账号</th><th>状态</th><th>操作</th></tr></thead><tbody>${list.map(r=>`<tr><td><b>${esc(r.name)}</b>${r.builtin?'<small class="sub">系统内置角色</small>':''}</td><td>${esc(r.desc)}</td><td><a>${r.permissions[0]==='全部功能'?'全部功能':r.permissions.length+' 项权限'}</a></td><td><span class="system-scope ${r.scope==='all'?'all':''}">${r.scope==='all'?'全部数据':'仅本人创建'}</span></td><td>${accountsForRole(r.id).length} 个账号</td><td><span class="badge ${r.status==='启用'?'green':'gray'}">${r.status}</span></td><td class="sku-row-actions"><button data-action="view-role" data-id="${r.id}">查看</button>${r.builtin?'':`<button data-action="edit-role" data-id="${r.id}">编辑</button><button data-action="toggle-role" data-id="${r.id}" class="${r.status==='启用'?'danger-link':''}">${r.status==='启用'?'停用':'启用'}</button><button data-action="delete-role" data-id="${r.id}" class="danger-link">删除</button>`}</td></tr>`).join('')}</tbody></table></div>`;
    bindHost(host);
  }
  function renderAccounts(host){
    const keyword=accountApplied.keyword.trim();
    const list=accounts.filter(a=>a.id!==1).filter(a=>{const r=roleById(a.roleId);return(!keyword||(a.name+a.mobile+(r?.name||'')).includes(keyword))&&(accountApplied.role==='全部角色'||r?.name===accountApplied.role)&&(accountApplied.status==='全部状态'||a.status===accountApplied.status)});
    const roleChoices=['全部角色',...roles.filter(r=>r.status==='启用'&&!r.builtin).map(r=>r.name)];
    host.innerHTML=`<div class="page-head"><div><h1>运营账号</h1><p>开设运营端子账号，并通过单一角色分配功能权限和数据权限。</p></div><button class="primary" data-action="new-account">＋ 新增运营账号</button></div>
    <div class="notice blue-notice"><b>登录规则</b><span>手机号为唯一登录账号；新账号初始密码统一为 ${INITIAL_PASSWORD}，首次登录仅提醒一次修改密码。</span></div>
    <div class="card"><div class="filters"><div class="search"><span>⌕</span><input id="account-search" placeholder="搜索姓名、手机号或角色" value="${esc(accountQuery.keyword)}"></div><select id="account-role">${roleChoices.map(o=>`<option ${accountQuery.role===o?'selected':''}>${esc(o)}</option>`).join('')}</select><select id="account-status">${['全部状态','正常','停用'].map(o=>`<option ${accountQuery.status===o?'selected':''}>${o}</option>`).join('')}</select><button class="primary" data-action="search-account">搜索</button><button class="ghost" data-action="reset-account-filter">重置</button></div>
    <table class="system-table"><thead><tr><th>运营人员</th><th>登录手机号</th><th>所属角色</th><th>数据权限</th><th>账号状态</th><th>最后登录</th><th>创建信息</th><th>操作</th></tr></thead><tbody>${list.map(a=>{const r=roleById(a.roleId);const self=a.id===CURRENT_ACCOUNT_ID;return`<tr><td><b>${esc(a.name)}</b>${self?'<span class="badge blue">当前登录账号</span>':''}</td><td>${a.mobile}</td><td><a>${esc(r?.name||'—')}</a></td><td><span class="system-scope ${r?.scope==='all'?'all':''}">${r?.scope==='all'?'全部数据':'仅本人创建'}</span></td><td><span class="badge ${a.status==='正常'?'green':'gray'}">${a.status}</span></td><td>${a.lastLogin||'从未登录'}</td><td>${a.creator}<small class="sub">${a.created}</small></td><td class="sku-row-actions"><button data-action="view-account" data-id="${a.id}">查看</button><button data-action="edit-account" data-id="${a.id}">编辑</button><button data-action="reset-password" data-id="${a.id}">重置密码</button>${self?'':`<button data-action="toggle-account" data-id="${a.id}" class="${a.status==='正常'?'danger-link':''}">${a.status==='正常'?'停用':'启用'}</button>`}</td></tr>`}).join('')}</tbody></table></div>`;
    bindHost(host);
  }
  function bindHost(host){
    host.querySelector('#role-search')?.addEventListener('input',e=>{roleQuery.keyword=e.target.value});
    host.querySelector('#role-status')?.addEventListener('change',e=>{roleQuery.status=e.target.value});
    host.querySelector('#account-search')?.addEventListener('input',e=>{accountQuery.keyword=e.target.value});
    host.querySelector('#account-role')?.addEventListener('change',e=>{accountQuery.role=e.target.value});
    host.querySelector('#account-status')?.addEventListener('change',e=>{accountQuery.status=e.target.value});
    host.onclick=e=>{const el=e.target.closest('[data-action]');if(!el)return;action(el.dataset.action,Number(el.dataset.id||0))};
  }
  function action(type,id){
    if(type==='new-role')return roleDrawer();if(type==='view-role')return roleDetail(roleById(id));if(type==='edit-role'){const r=roleById(id);if(r?.builtin)return toast('系统内置角色不可编辑');return roleDrawer(r)}
    if(type==='toggle-role'){const r=roleById(id);r.status=r.status==='启用'?'停用':'启用';toast(`角色已${r.status}`);return render()}
    if(type==='delete-role'){const r=roleById(id),linked=accountsForRole(id);if(linked.length)return toast(`该角色已关联${linked.length}个账号，不能删除`);roles.splice(roles.indexOf(r),1);toast('角色已删除');return render()}
    if(type==='search-role'){roleApplied.keyword=roleQuery.keyword;roleApplied.status=roleQuery.status;return render()}
    if(type==='reset-role-filter'){Object.assign(roleQuery,{keyword:'',status:'全部状态'});Object.assign(roleApplied,roleQuery);return render()}
    if(type==='new-account')return accountDrawer();if(type==='view-account')return accountDetail(accounts.find(a=>a.id===id));if(type==='edit-account')return accountDrawer(accounts.find(a=>a.id===id));
    if(type==='toggle-account'){if(id===CURRENT_ACCOUNT_ID)return toast('不能停用自己的账号');const a=accounts.find(a=>a.id===id);a.status=a.status==='正常'?'停用':'正常';toast(`账号已${a.status==='正常'?'启用':'停用'}`);return render()}
    if(type==='reset-password')return confirmReset(accounts.find(a=>a.id===id));
    if(type==='search-account'){accountApplied.keyword=accountQuery.keyword;accountApplied.role=accountQuery.role;accountApplied.status=accountQuery.status;return render()}
    if(type==='reset-account-filter'){Object.assign(accountQuery,{keyword:'',role:'全部角色',status:'全部状态'});Object.assign(accountApplied,accountQuery);return render()}
  }
  function shell(title,subtitle,body,footer='',wide=false){
    modal=document.createElement('div');modal.className='sys-overlay';modal.innerHTML=`<div class="sys-drawer ${wide?'wide':''}"><div class="sys-head"><div><h2>${title}</h2><p>${subtitle}</p></div><button data-close>×</button></div><div class="sys-body">${body}</div><div class="sys-foot">${footer||'<button class="secondary" data-close>关闭</button>'}</div></div>`;document.body.append(modal);modal.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>{modal.remove();modal=null});return modal;
  }
  function roleDrawer(role){
    const editing=!!role,selected=new Set(role?.permissions?.includes('全部功能')?allPermissions():(role?.permissions||[]));
    const body=`<div class="sys-section"><h3>角色信息</h3><div class="sys-form-grid"><label class="sys-field"><span><i>*</i> 角色名称</span><input id="sys-role-name" value="${esc(role?.name||'') }" placeholder="请输入角色名称"></label><label class="sys-field"><span>状态</span><select id="sys-role-status"><option ${role?.status!=='停用'?'selected':''}>启用</option><option ${role?.status==='停用'?'selected':''}>停用</option></select></label><label class="sys-field full"><span>角色说明</span><textarea id="sys-role-desc" placeholder="描述角色职责和适用人员">${esc(role?.desc||'')}</textarea></label></div></div>
    <div class="sys-section"><h3>数据权限</h3><div class="sys-radio-list"><label class="sys-radio-card"><input type="radio" name="scope" value="all" ${role?.scope==='all'?'checked':''}><span><b>全部数据</b><small>可查询和操作所有运营人员创建的数据</small></span></label><label class="sys-radio-card"><input type="radio" name="scope" value="own" ${role?.scope!=='all'?'checked':''}><span><b>仅本人创建</b><small>仅可查询和操作当前账号自己创建的数据</small></span></label></div></div>
    <div class="sys-section"><h3>功能权限</h3><div class="permission-tree">${Object.entries(permissionGroups).map(([group,menus])=>`<div class="permission-root"><label class="permission-root-row"><input type="checkbox" data-perm-root><b>${group}</b><small>${Object.keys(menus).length} 个页面</small></label><div class="permission-branches">${Object.entries(menus).map(([menu,actions])=>`<div class="permission-branch"><label class="permission-menu-row"><input type="checkbox" data-perm-menu><span>${menu}</span></label><div class="permission-actions">${actions.map(action=>{const permission=`${menu}-${action}`;return`<label><input type="checkbox" name="permission" value="${esc(permission)}" ${selected.has(permission)?'checked':''}><span>${action}</span></label>`}).join('')}</div></div>`).join('')}</div></div>`).join('')}</div></div>`;
    const el=shell(editing?'编辑运营角色':'新增运营角色',editing?`${role.name} · 修改后立即影响关联账号`:'配置功能权限和数据权限',body,'<button class="secondary" data-close>取消</button><button class="primary" id="save-role">保存</button>',true);
    const syncPermissionTree=()=>{
      el.querySelectorAll('.permission-branch').forEach(branch=>{const menu=branch.querySelector('[data-perm-menu]'),items=[...branch.querySelectorAll('[name="permission"]')],checked=items.filter(i=>i.checked).length;menu.checked=checked===items.length;menu.indeterminate=checked>0&&checked<items.length});
      el.querySelectorAll('.permission-root').forEach(root=>{const parent=root.querySelector('[data-perm-root]'),items=[...root.querySelectorAll('[name="permission"]')],checked=items.filter(i=>i.checked).length;parent.checked=checked===items.length;parent.indeterminate=checked>0&&checked<items.length});
    };
    el.querySelectorAll('[data-perm-root]').forEach(box=>box.onchange=()=>{box.closest('.permission-root').querySelectorAll('[name="permission"]').forEach(i=>i.checked=box.checked);syncPermissionTree()});
    el.querySelectorAll('[data-perm-menu]').forEach(box=>box.onchange=()=>{box.closest('.permission-branch').querySelectorAll('[name="permission"]').forEach(i=>i.checked=box.checked);syncPermissionTree()});
    el.querySelectorAll('[name="permission"]').forEach(box=>box.onchange=syncPermissionTree);syncPermissionTree();
    el.querySelector('#save-role').onclick=()=>{const name=el.querySelector('#sys-role-name').value.trim();if(!name)return toast('请输入角色名称');const permissions=[...el.querySelectorAll('[name="permission"]:checked')].map(i=>i.value);if(!permissions.length)return toast('请至少选择一项功能权限');const data={name,desc:el.querySelector('#sys-role-desc').value.trim(),status:el.querySelector('#sys-role-status').value,scope:el.querySelector('[name="scope"]:checked').value,permissions};if(editing)Object.assign(role,data);else roles.push({id:Date.now(),...data,users:0});el.remove();modal=null;toast(editing?'角色已保存':'角色创建成功');render()};
  }
  function roleDetail(role){
    const linked=accountsForRole(role.id);
    shell('运营角色详情',role.name,`<div class="sys-section"><h3>基本信息</h3><div class="sys-detail-grid"><div><span>角色名称</span><b>${esc(role.name)}</b></div><div><span>状态</span><b>${role.status}</b></div><div><span>数据权限</span><b>${role.scope==='all'?'全部数据':'仅本人创建'}</b></div><div><span>关联账号</span><b>${linked.length} 个</b></div><div style="grid-column:1/-1"><span>角色说明</span><b>${esc(role.desc)}</b></div></div></div><div class="sys-section"><h3>关联账号（${linked.length}）</h3>${linked.length?`<div class="sys-linked-accounts">${linked.map(account=>`<div><span><b>${esc(account.name)}</b><small>${account.mobile}</small></span><em class="badge ${account.status==='正常'?'green':'gray'}">${account.status}</em></div>`).join('')}</div>`:'<div class="sys-empty">暂无关联账号</div>'}</div><div class="sys-section"><h3>功能权限</h3><div class="sys-tag-list">${role.permissions.map(p=>`<span>${esc(p)}</span>`).join('')}</div></div>`);
  }
  function accountDrawer(account){
    const editing=!!account;const body=`<div class="sys-section"><h3>账号信息</h3><div class="sys-form-grid"><label class="sys-field"><span><i>*</i> 姓名</span><input id="sys-account-name" value="${esc(account?.name||'')}" placeholder="请输入运营人员姓名"></label><label class="sys-field"><span><i>*</i> 手机号码</span><input id="sys-account-mobile" value="${esc(account?.mobile||'')}" maxlength="11" placeholder="请输入11位手机号码" ${editing?'disabled':''}></label><label class="sys-field"><span><i>*</i> 所属角色</span><select id="sys-account-role"><option value="">请选择角色</option>${roles.filter(r=>r.status==='启用'&&!r.builtin).map(r=>`<option value="${r.id}" ${account?.roleId===r.id?'selected':''}>${esc(r.name)} · ${r.scope==='all'?'全部数据':'仅本人创建'}</option>`).join('')}</select></label><label class="sys-field"><span>账号状态</span><select id="sys-account-status"><option ${account?.status!=='停用'?'selected':''}>正常</option><option ${account?.status==='停用'?'selected':''}>停用</option></select></label><label class="sys-field full"><span>备注</span><textarea id="sys-account-remark" placeholder="选填">${esc(account?.remark||'')}</textarea></label></div></div>${editing?'':`<div class="first-login-note"><b>ⓘ</b><span>账号创建后，登录手机号为账号，初始密码为 <b>${INITIAL_PASSWORD}</b>。首次登录将弹窗提醒修改密码，用户可关闭且后续不再提醒。</span></div>`}`;
    const el=shell(editing?'编辑运营账号':'新增运营账号',editing?`${account.mobile} · 登录手机号创建后不可修改`:'一个账号只能绑定一个角色',body,'<button class="secondary" data-close>取消</button><button class="primary" id="save-account">保存</button>');
    el.querySelector('#save-account').onclick=()=>{const name=el.querySelector('#sys-account-name').value.trim(),mobile=el.querySelector('#sys-account-mobile').value.trim(),roleId=Number(el.querySelector('#sys-account-role').value);if(!name)return toast('请输入姓名');if(!editing&&!/^1\d{10}$/.test(mobile))return toast('请输入正确的11位手机号码');if(!editing&&accounts.some(a=>a.mobile===mobile))return toast('该手机号码已存在');if(!roleId)return toast('请选择所属角色');const data={name,mobile:editing?account.mobile:mobile,roleId,status:el.querySelector('#sys-account-status').value,remark:el.querySelector('#sys-account-remark').value.trim()};if(editing)Object.assign(account,data);else{accounts.push({id:Date.now(),...data,lastLogin:'',creator:'林晓峰',created:'2026-09-20 10:30',reminder:'待提醒'});roleById(roleId).users++;}el.remove();modal=null;render();editing?toast('账号信息已保存'):creationSuccess(name,mobile)};
  }
  function accountDetail(account){const role=roleById(account.roleId);shell('运营账号详情',`${account.name} · ${account.mobile}`,`<div class="sys-section"><h3>账号信息</h3><div class="sys-detail-grid"><div><span>姓名</span><b>${esc(account.name)}</b></div><div><span>登录手机号</span><b>${account.mobile}</b></div><div><span>账号状态</span><b>${account.status}</b></div><div><span>所属角色</span><b>${esc(role?.name||'—')}</b></div><div><span>数据权限</span><b>${role?.scope==='all'?'全部数据':'仅本人创建'}</b></div><div><span>最后登录</span><b>${account.lastLogin||'从未登录'}</b></div><div><span>创建信息</span><b>${account.creator} · ${account.created}</b></div></div></div><div class="sys-section"><h3>功能权限</h3><div class="sys-tag-list">${(role?.permissions||[]).map(p=>`<span>${esc(p)}</span>`).join('')}</div></div><div class="first-login-note"><b>ⓘ</b><span>账号权限全部继承自单一角色。数据权限为“仅本人创建”时，同时限制查看、编辑、删除、发布、撤销和导出。</span></div>`)}
  function confirmReset(account){const mask=document.createElement('div');mask.className='sys-modal-mask';mask.innerHTML=`<div class="sys-modal"><div class="icon">↻</div><h3>重置登录密码</h3><p>确认将 ${esc(account.name)}（${account.mobile}）的密码重置为默认密码？</p><div class="sys-password">${INITIAL_PASSWORD}</div><p>重置后，该账号下次登录会再次提醒一次修改密码。</p><div class="sys-modal-actions"><button class="secondary" data-cancel>取消</button><button class="primary" data-confirm>确认重置</button></div></div>`;document.body.append(mask);mask.querySelector('[data-cancel]').onclick=()=>mask.remove();mask.querySelector('[data-confirm]').onclick=()=>{account.reminder='待提醒';mask.remove();toast('密码已重置');render()};}
  function creationSuccess(name,mobile){const mask=document.createElement('div');mask.className='sys-modal-mask';mask.innerHTML=`<div class="sys-modal"><div class="icon">✓</div><h3>运营账号创建成功</h3><p>${esc(name)} · ${mobile}</p><div class="sys-password">${INITIAL_PASSWORD}</div><p>请将手机号和初始密码安全告知用户。首次登录仅提醒一次修改密码。</p><div class="sys-modal-actions"><button class="primary" data-confirm>我知道了</button></div></div>`;document.body.append(mask);mask.querySelector('[data-confirm]').onclick=()=>mask.remove();}
  setTimeout(install,600);
})();
