/* 登录流程：右上角账号菜单「退出」→ 登录校验 → 首次登录改密提醒 → 修改密码。
   规则来源：运营端-系统管理运营账号与权限-PRD.md §5.3 / §7 / §10.3
   这部分是登录侧原型交互，与运营端业务页面相互独立。 */
(() => {
  const INITIAL_PASSWORD = 'slw@000000';

  // 演示账号，与「运营账号」页面演示数据一一对应（id 对应 accounts 数组）。
  const DEMO_ACCOUNTS = [
    { id: 3, name: '陈晨', mobile: '13800138003', password: INITIAL_PASSWORD, role: '授权管理员', status: '正常', reminder: '待提醒' },
    { id: 2, name: '周雨', mobile: '13800138002', password: INITIAL_PASSWORD, role: '商品运营', status: '正常', reminder: '已处理' },
    { id: 4, name: '王蕾', mobile: '13800138004', password: INITIAL_PASSWORD, role: '商品运营', status: '停用', reminder: '已处理' }
  ];
  const DEFAULT_ACCOUNT = DEMO_ACCOUNTS[1];              // 默认登录账号：周雨
  const PASSWORD_RULE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,20}$/;

  let session = DEFAULT_ACCOUNT;                          // 当前登录账号
  let reminderPending = false;                            // 当前登录账号是否待提醒
  let overlayOpen = false;                                // 登录覆盖层是否展开

  const el = (id) => document.getElementById(id);

  /* ---------- 覆盖层 DOM ---------- */
  function overlayHTML() {
    return `
<div class="login-shell">
  <section class="brand-panel">
    <div class="brand-logo"><span>食</span><div><b>数智餐饮运营管理平台</b><small>业务运营端</small></div></div>
    <div class="brand-copy">
      <h1>运营端登录</h1>
      <p>手机号为唯一登录账号。新账号初始密码由管理员创建账号时生成，首次登录会提醒一次修改密码。</p>
    </div>
    <div class="brand-foot">食链云 · 数智餐饮运营管理平台</div>
  </section>
  <section class="login-panel">
    <div class="login-card">
      <h2>账号登录</h2>
      <p class="panel-sub">演示数据：点击下方账号填入，或手动输入验证失败提示</p>
      <form id="loginForm" autocomplete="off" novalidate>
        <label class="field"><span>登录手机号</span><input id="loginMobile" placeholder="请输入11位手机号码"></label>
        <label class="field"><span>登录密码</span><input id="loginPassword" type="password" placeholder="请输入登录密码"></label>
        <p class="form-error" id="loginError"></p>
        <button type="submit" class="primary" id="loginSubmit">登 录</button>
      </form>
      <div class="demo-switch">
        <b>演示账号（点击填入登录框）</b>
        ${DEMO_ACCOUNTS.map((a) => `<button type="button" class="demo-account${a.status === '停用' ? ' off' : ''}" data-mobile="${a.mobile}"><span>${a.name}</span><em>${a.mobile}</em><small>${a.status === '停用' ? '停用 · 登录被拒' : a.reminder === '待提醒' ? '正常 · 首次登录待提醒' : '正常 · 登录不再提醒'}</small></button>`).join('')}
        <p class="demo-tip">也可以手动改成未注册的手机号或错误的密码，验证登录失败提示。</p>
      </div>
    </div>
  </section>
</div>

<div class="mask" id="reminderModal" hidden>
  <div class="modal" role="dialog" aria-modal="true" aria-labelledby="reminderTitle">
    <button type="button" class="modal-close" id="reminderClose" aria-label="关闭">×</button>
    <div class="modal-icon">!</div>
    <h3 id="reminderTitle">密码修改提醒</h3>
    <p>您当前正在使用初始密码 <code>${INITIAL_PASSWORD}</code>，为了账号安全，建议立即修改。</p>
    <div class="modal-actions">
      <button type="button" class="ghost" id="reminderLater">暂不修改</button>
      <button type="button" class="primary" id="reminderNow">立即修改</button>
    </div>
  </div>
</div>

<div class="mask" id="changeModal" hidden>
  <div class="modal" role="dialog" aria-modal="true" aria-labelledby="changeTitle">
    <button type="button" class="modal-close" id="changeClose" aria-label="关闭">×</button>
    <div class="modal-icon">改</div>
    <h3 id="changeTitle">修改密码</h3>
    <label class="field"><span>原密码</span><input id="oldPassword" type="password" placeholder="请输入当前登录密码"></label>
    <label class="field"><span>新密码</span><input id="newPassword" type="password" placeholder="8-20个字符，含大小写字母、数字和特殊字符"></label>
    <label class="field"><span>确认新密码</span><input id="confirmPassword" type="password" placeholder="请再次输入新密码"></label>
    <p class="form-error" id="changeError"></p>
    <div class="modal-actions">
      <button type="button" class="ghost" id="changeCancel">取消</button>
      <button type="button" class="primary" id="changeSubmit">确认修改</button>
    </div>
  </div>
</div>`;
  }

  /* ---------- 覆盖层挂载 ---------- */
  let overlayBound = false;

  function ensureOverlay() {
    let host = el('loginFlow');
    if (!host) {
      host = document.createElement('div');
      host.id = 'loginFlow';
      host.innerHTML = overlayHTML();
      document.body.append(host);
      bindLoginFlow();
      resetLoginForm();
      overlayBound = true;
    }
    host.hidden = !overlayOpen;
    return host;
  }

  function showOverlay() { overlayOpen = true; ensureOverlay(); }
  function hideOverlay() { overlayOpen = false; ensureOverlay(); }

  /* ---------- 右上角账号菜单 ---------- */
  function accountPickerHTML() {
    return `<div class="account-picker" id="accountPicker">
  <button type="button" class="account-trigger" id="accountTrigger">
    <span class="avatar" id="accountAvatar"></span>
    <span><b id="accountName"></b><small id="accountRole"></small></span>
    <span class="account-caret">⌄</span>
  </button>
  <div class="account-menu" id="accountMenu" hidden>
    <div class="account-menu-head"><b id="menuName"></b><small id="menuMobile"></small></div>
    <button type="button" class="account-menu-item" id="logoutBtn">退出登录</button>
    <p class="account-menu-tip">退出后可用其它演示账号登录，查看登录校验与首次登录改密提醒。</p>
  </div>
</div>`;
  }

  function ensurePicker() {
    if (el('accountPicker')) return true;
    const actions = document.querySelector('.top-actions');
    if (!actions) return false;
    const avatar = actions.querySelector('.avatar');
    if (!avatar) return false;
    // 用可点击的账号菜单替换原来的「头像 / 姓名 / 箭头」静态结构
    const nameBox = avatar.nextElementSibling;
    const caret = nameBox && nameBox.nextElementSibling;
    if (caret && caret.tagName === 'SPAN') caret.remove();
    if (nameBox) nameBox.remove();
    avatar.remove();
    actions.insertAdjacentHTML('beforeend', accountPickerHTML());
    bindPicker();
    renderSession();
    return true;
  }

  function bindPicker() {
    const menu = el('accountMenu');
    el('accountTrigger').addEventListener('click', (event) => {
      event.stopPropagation();
      menu.hidden = !menu.hidden;
    });
    el('logoutBtn').addEventListener('click', () => {
      menu.hidden = true;
      resetLoginForm();
      showOverlay();
      el('loginMobile').focus();
    });
  }

  function renderSession() {
    const set = (id, text) => { const node = el(id); if (node) node.textContent = text; };
    set('accountAvatar', session.name.slice(0, 1));
    set('accountName', session.name);
    set('accountRole', session.role);
    set('menuName', session.name);
    set('menuMobile', session.mobile);
    // 同步「运营账号」列表里的「当前登录账号」标识
    window.__sysSession?.setCurrentAccount(session.id);
  }

  function appToast(msg) {
    document.querySelectorAll('.sys-toast').forEach((node) => node.remove());
    const node = document.createElement('div');
    node.className = 'sys-toast';
    node.textContent = '✓ ' + msg;
    document.body.append(node);
    setTimeout(() => node.remove(), 2400);
  }

  /* ---------- 登录流程 ---------- */
  function setError(id, msg) { const node = el(id); if (node) node.textContent = msg || ''; }

  function resetLoginForm() {
    el('loginMobile').value = DEFAULT_ACCOUNT.mobile;
    el('loginPassword').value = INITIAL_PASSWORD;
    el('oldPassword').value = INITIAL_PASSWORD;
    el('newPassword').value = '';
    el('confirmPassword').value = '';
    setError('loginError', '');
    setError('changeError', '');
    reminderPending = false;
  }

  function enterApp(message) {
    hideOverlay();
    el('reminderModal').hidden = true;
    el('changeModal').hidden = true;
    renderSession();
    if (message) appToast(message);
  }

  function bindLoginFlow() {
    el('loginForm').addEventListener('submit', (event) => {
      event.preventDefault();
      const mobile = el('loginMobile').value.trim();
      const password = el('loginPassword').value;
      if (!/^1\d{10}$/.test(mobile)) { setError('loginError', '请输入正确的11位手机号码'); return; }
      if (!password) { setError('loginError', '请输入登录密码'); return; }

      // 不区分「手机号未注册」和「密码错误」，统一提示，避免暴露账号是否存在。
      const account = DEMO_ACCOUNTS.find((a) => a.mobile === mobile);
      if (!account || account.password !== password) { setError('loginError', '手机号或密码错误'); return; }
      // 停用状态在凭据校验通过后才暴露。
      if (account.status === '停用') { setError('loginError', '该账号已被停用，请联系管理员'); return; }

      setError('loginError', '');
      session = account;
      reminderPending = account.reminder === '待提醒';
      if (reminderPending) {
        el('reminderModal').hidden = false;
      } else {
        enterApp(`登录成功，本次登录无需修改密码提醒`);
      }
    });

    // 演示账号快捷填入
    document.querySelectorAll('#loginFlow .demo-account').forEach((btn) => {
      btn.addEventListener('click', () => {
        const account = DEMO_ACCOUNTS.find((a) => a.mobile === btn.dataset.mobile);
        el('loginMobile').value = account.mobile;
        el('loginPassword').value = account.password;
        setError('loginError', '');
      });
    });

    el('reminderNow').addEventListener('click', () => {
      el('reminderModal').hidden = true;
      el('changeModal').hidden = false;
      el('newPassword').focus();
    });

    // 暂不修改 / 右上角关闭：效果一致，且提醒只消费一次
    const postpone = () => {
      reminderPending = false;
      enterApp('已按「暂不修改」进入运营端，后续登录不再提醒');
    };
    el('reminderLater').addEventListener('click', postpone);
    el('reminderClose').addEventListener('click', postpone);

    const closeChange = () => { el('changeModal').hidden = true; setError('changeError', ''); };
    el('changeCancel').addEventListener('click', closeChange);
    el('changeClose').addEventListener('click', closeChange);

    el('changeSubmit').addEventListener('click', () => {
      const current = el('oldPassword').value;
      const next = el('newPassword').value;
      const again = el('confirmPassword').value;
      if (!current) { setError('changeError', '请输入原密码'); return; }
      if (current !== INITIAL_PASSWORD) { setError('changeError', '原密码不正确'); return; }
      if (!next) { setError('changeError', '请输入新密码'); return; }
      if (next === current) { setError('changeError', '新密码不能与原密码相同'); return; }
      if (!PASSWORD_RULE.test(next)) { setError('changeError', '密码需为8-20个字符，且包含大小写字母、数字和特殊字符'); return; }
      if (next !== again) { setError('changeError', '两次输入的新密码不一致'); return; }
      setError('changeError', '');
      reminderPending = false;
      enterApp('密码修改成功，后续登录不再提醒');
    });
  }

  /* ---------- 启动 ---------- */
  function bindGlobal() {
    document.addEventListener('click', (event) => {
      const menu = el('accountMenu');
      if (menu && !menu.hidden && !event.target.closest('#accountPicker')) menu.hidden = true;
    });
    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      const menu = el('accountMenu');
      if (menu) menu.hidden = true;
    });
  }

  // 宿主页面的头部结构可能在脚本执行后才渲染完成，因此持续补齐覆盖层与账号菜单。
  function watch() {
    new MutationObserver(() => {
      if (!el('accountPicker')) ensurePicker();
      if (!el('loginFlow')) ensureOverlay();
    }).observe(document.body, { childList: true, subtree: true });
  }

  function boot() {
    ensureOverlay();
    if (!ensurePicker()) { setTimeout(boot, 150); return; }
    bindGlobal();
    watch();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
