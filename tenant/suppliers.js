/* ============================================================
 * 租户端 · 组织经营 › 供应商管理（原型）
 * ------------------------------------------------------------
 * 数据模型（已与业务确认）：
 *   1. 供应商档案全局唯一，身份键 = 统一社会信用代码；
 *   2. 超管账号全局唯一，归「首个开户租户」所有，
 *      其他租户只能回显，不可创建 / 不可重置；
 *   3. 供应类型：毛菜 / 净菜 / 半成品，至少 1 个；
 *   4. 商户绑定：默认全部商户，可切换为指定商户；
 *   5. 商户端采购选择供应商时，只能落在绑定范围内。
 * ============================================================ */

const SUP_TODAY = '2026-08-04';
/* 演示用「当前时刻」：列表的创建时间/更新时间精确到分 */
const SUP_NOW = '2026-08-04 10:26';
const SUP_TENANT = '味来餐饮集团';
const SUP_TOTAL_MERCHANTS = 128;
const SUP_DEFAULT_PWD = 'Slw@000000';

const SUP_TYPES = [
  { key: '毛菜', desc: '未加工蔬菜，商户自行分拣' },
  { key: '净菜', desc: '已分拣清洗，可直接使用' },
  { key: '半成品', desc: '切配腌制预制，简单加工即可' }
];

const SUP_MERCHANTS = [
  { name: '杭州市校园餐饮管理中心', format: 'K12 教育业态', area: '浙江·杭州' },
  { name: '西湖区学校后勤服务中心', format: 'K12 教育业态', area: '浙江·杭州' },
  { name: '南京未来教育服务中心', format: 'K12 教育业态', area: '江苏·南京' },
  { name: '味来·滨江旗舰店', format: '中式正餐', area: '浙江·杭州' },
  { name: '锅里见·星海店', format: '火锅烧烤', area: '浙江·杭州' },
  { name: '青禾茶饮·中心广场店', format: '茶饮烘焙', area: '浙江·杭州' },
  { name: '味来小馆·西湖店', format: '中式正餐', area: '浙江·杭州' },
  { name: '米仓便当·未来城店', format: '快餐简餐', area: '上海·上海' }
];

/* 本租户已建立合作关系的供应商 */
const SUP_ROWS = [
  {
    id: 'SUP001', name: '上海鲜配供应链有限公司', credit: '91310115MA1K3X8L2P',
    foodBiz: 'JY13101150012345', foodProd: '', addr: '上海市浦东新区川沙路 1288 号 3 号库',
    contact: '王振宇', phone: '13866216621',
    lic: { biz: 2, foodBiz: 1, foodProd: 0, contract: 3 },
    types: ['毛菜', '半成品'],
    account: { name: 'shanghaixianpei', tenant: '江南餐饮集团', owner: false, opened: '2025-11-12', reset: '2026-05-20' },
    bindAll: true, merchants: [], status: '合作中', created: '2026-01-18 09:42', updated: '2026-07-28 16:08'
  },
  {
    id: 'SUP002', name: '城西冷链配送中心', credit: '91330106MA2GY7K94T',
    foodBiz: 'JY13301060223456', foodProd: 'SC10133010600789', addr: '浙江省杭州市西湖区文一西路 588 号冷链园 B 座',
    contact: '赵敏', phone: '13788979900',
    lic: { biz: 1, foodBiz: 2, foodProd: 1, contract: 2 },
    types: ['净菜', '半成品'],
    account: { name: 'cxll2026', tenant: SUP_TENANT, owner: true, opened: '2026-02-01', reset: '2026-06-11' },
    bindAll: true, merchants: [], status: '合作中', created: '2026-02-01 10:15', updated: '2026-08-02 09:36'
  },
  {
    id: 'SUP003', name: '本地蔬菜合作社', credit: '91330100MA28T5H63D',
    foodBiz: '', foodProd: '', addr: '浙江省杭州市余杭区良渚街道港南村 12 组',
    contact: '周桂芳', phone: '13588774742',
    lic: { biz: 1, foodBiz: 0, foodProd: 0, contract: 1 },
    types: ['毛菜'],
    account: { name: 'bdscc2026', tenant: SUP_TENANT, owner: true, opened: '2026-03-15', reset: '2026-03-15' },
    bindAll: false, merchants: ['杭州市校园餐饮管理中心', '西湖区学校后勤服务中心', '味来·滨江旗舰店'], status: '合作中', created: '2026-03-15 14:20', updated: '2026-07-19 11:47'
  },
  {
    id: 'SUP004', name: '味鲜源半成品加工厂', credit: '91330206MA2AF7QX1N',
    foodBiz: 'JY13302060034567', foodProd: 'SC10233020600123', addr: '浙江省宁波市北仑区小港街道江南路 266 号',
    contact: '陈立', phone: '13906623388',
    lic: { biz: 2, foodBiz: 1, foodProd: 2, contract: 4 },
    types: ['半成品'],
    account: { name: 'wxy2025', tenant: '江南餐饮集团', owner: false, opened: '2025-09-01', reset: '2026-01-08' },
    bindAll: false, merchants: ['锅里见·星海店', '米仓便当·未来城店'], status: '已解除', created: '2026-02-26 15:05', updated: '2026-06-30 17:22'
  },
  {
    id: 'SUP005', name: '绿源净菜加工中心', credit: '91330109MA2CF8WQ7L',
    foodBiz: 'JY13301090456789', foodProd: 'SC10133010900456', addr: '浙江省杭州市萧山区新街街道工业园 7 号',
    contact: '孙雅琴', phone: '13611885566',
    lic: { biz: 1, foodBiz: 1, foodProd: 1, contract: 6 },
    types: ['净菜'],
    account: { name: 'lyjc2026', tenant: SUP_TENANT, owner: true, opened: '2026-04-08', reset: '2026-04-08' },
    bindAll: true, merchants: [], status: '已解除', created: '2026-04-08 08:55', updated: '2026-08-01 13:14'
  }
];

/* 初始演示数据快照：用于「重置演示数据」，把本次演示中新建/修改的行清掉 */
const SUP_ROWS_SEED = JSON.parse(JSON.stringify(SUP_ROWS));

/* 平台全局档案池：其他租户已建档但本租户尚未合作的供应商（用于演示跨租户分支） */
const SUP_GLOBAL_EXTRA = [
  {
    name: '杭州鲜达农副产品配送有限公司', credit: '91330100MA2H8Q4W7B',
    foodBiz: 'JY13301000567890', foodProd: '', addr: '浙江省杭州市临平区南苑街道迎宾路 66 号 2 号仓',
    contact: '李承志', phone: '13903383382',
    lic: { biz: 2, foodBiz: 2, foodProd: 0, contract: 5 },
    types: ['净菜', '半成品'],
    account: { name: 'hzxdnp', tenant: '江南餐饮集团', owner: false, opened: '2025-11-20', reset: '2026-04-16' }
  }
];

/* ---------- 工具 ---------- */
function supEsc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function supBindCount(row) { return row.bindAll ? SUP_TOTAL_MERCHANTS : (row.merchants || []).length; }
/* 创建/更新时间展示：日期 + 时分，不记录操作人员 */
function supTime(v) {
  if (!v) return '—';
  const parts = String(v).split(' ');
  return `<b class="sup-date">${supEsc(parts[0])}</b>${parts[1] ? `<span class="sub">${supEsc(parts[1])}</span>` : ''}`;
}
function supAllArchives() {
  return SUP_ROWS.concat(SUP_GLOBAL_EXTRA.map((x, i) => Object.assign({ id: 'EXT' + i }, x)));
}
function supInTenant(credit) { return SUP_ROWS.some(r => r.credit.toUpperCase() === String(credit).toUpperCase()); }
function supGlobalHit(credit) {
  const c = String(credit).toUpperCase();
  return supAllArchives().find(r => r.credit.toUpperCase() === c) || null;
}
function supAccountTaken(name, exceptCredit) {
  const n = String(name || '').trim().toLowerCase();
  if (!n) return false;
  return supAllArchives().some(r => r.account && r.account.name.toLowerCase() === n && r.credit !== exceptCredit);
}
function supLicShort(label) {
  return ({ '营业执照': '执照', '食品经营许可证': '经营许可', '食品生产许可证': '生产许可', '合作协议': '协议' })[label] || label.slice(0, 4);
}
function supLicCounts() {
  const out = {};
  document.querySelectorAll('.sup-upload-list').forEach(list => { out[list.dataset.kind] = list.querySelectorAll('.sup-thumb').length; });
  return out;
}

/* ---------- 列表页 ---------- */
function supplierPage() {
  return `<div class="sup-page">
    <div class="page-head">
      <div><h1>供应商管理</h1><p>维护租户合作供应商档案、超管账号、供应类型及商户供货范围</p></div>
      <div class="page-actions"><button class="primary" id="supNew">＋ 新建供应商</button></div>
    </div>
    <div class="sup-note"><i>i</i><div><b>供应商档案按「统一社会信用代码」全局唯一。</b>超管账号归首个开户租户所有；其他租户可创建同一供应商并沿用该账号，但不可重复开户，仅可回显账号信息。「解除合作」仅终止本租户与该供应商的合作关系，不影响其他租户的商户下单。</div></div>
    <div class="table-card">
      <div class="filters">
        <input class="search" id="supSearch" placeholder="⌕  搜索供应商名称 / 信用代码 / 账号"/>
        <select id="supTypeFilter"><option value="">全部供应类型</option>${SUP_TYPES.map(t => `<option value="${t.key}">${t.key}</option>`).join('')}</select>
        <select id="supAccountFilter"><option value="">全部账号归属</option><option value="own">本租户开户</option><option value="other">沿用他租户账号</option></select>
        <select id="supStatusFilter"><option value="">全部合作状态</option><option value="合作中">合作中</option><option value="已解除">已解除</option></select>
        <button class="ghost sup-demo-reset" id="supResetDemo" title="清空本次演示中新建或修改的供应商，恢复为初始 5 条演示数据">重置演示数据</button>
      </div>
      <table>
        <thead><tr><th>供应商信息</th><th>供应类型</th><th>合作商户</th><th>超管账号</th><th>状态</th><th>创建时间</th><th>更新时间</th><th>操作</th></tr></thead>
        <tbody id="supBody">${SUP_ROWS.map((r, i) => supRowHtml(r, i)).join('')}
          <tr class="sup-row-none" hidden><td colspan="8">没有符合条件的供应商</td></tr>
        </tbody>
      </table>
      <div class="pagination">共 ${SUP_ROWS.length} 条　‹　<b>1</b>　›</div>
    </div>
  </div>`;
}

function supRowHtml(r, i) {
  const own = r.account && r.account.owner;
  const terminated = r.status === '已解除';
  return `<tr data-index="${i}" data-key="${supEsc([r.name, r.credit, r.account ? r.account.name : ''].join(' '))}" data-types="${supEsc((r.types || []).join(','))}" data-account="${own ? 'own' : 'other'}" data-status="${r.status}">
    <td><b>${supEsc(r.name)}</b><span class="sub">${supEsc(r.credit)}</span></td>
    <td><div class="sup-chips">${(r.types || []).map(t => `<span class="sup-chip">${supEsc(t)}</span>`).join('')}</div></td>
    <td><b>${supBindCount(r)} 家</b><span class="sub">${r.bindAll ? '全部商户' : '指定商户'}</span></td>
    <td><b>${r.account ? supEsc(r.account.name) : '—'}</b><span class="sup-owner ${own ? '' : 'other'}">${own ? '本租户开通' : supEsc(r.account.tenant) + ' 开通'}</span></td>
    <td><span class="status ${terminated ? 'off' : ''}">${r.status}</span></td>
    <td class="sup-time">${supTime(r.created)}</td>
    <td class="sup-time">${supTime(r.updated)}</td>
    <td class="sup-actions">
      <button class="link-btn sup-link" data-act="view" data-index="${i}">详情</button>
      <button class="link-btn sup-link" data-act="edit" data-index="${i}">编辑</button>
      <button class="link-btn sup-link" data-act="reset" data-index="${i}" ${own ? '' : `disabled title="该账号由${supEsc(r.account.tenant)}开通，本租户不可重置"`}>重置密码</button>
      <button class="link-btn sup-link ${terminated ? '' : 'danger'}" data-act="coop" data-index="${i}" title="${terminated ? '恢复本租户与该供应商的合作，商户可继续选择采购' : '仅解除本租户与该供应商的合作，不影响其他租户'}">${terminated ? '继续合作' : '解除合作'}</button>
    </td>
  </tr>`;
}

/* ---------- 绑定列表事件 ---------- */
function bindSuppliersPage() {
  const apply = () => {
    const kw = ($('#supSearch').value || '').trim().toLowerCase();
    const type = $('#supTypeFilter').value, acc = $('#supAccountFilter').value, st = $('#supStatusFilter').value;
    let shown = 0;
    $$('#supBody tr[data-index]').forEach(tr => {
      const okKw = !kw || (tr.dataset.key || '').toLowerCase().indexOf(kw) >= 0;
      const okType = !type || (tr.dataset.types || '').split(',').indexOf(type) >= 0;
      const okAcc = !acc || tr.dataset.account === acc;
      const okSt = !st || tr.dataset.status === st;
      const ok = okKw && okType && okAcc && okSt;
      tr.hidden = !ok;
      if (ok) shown++;
    });
    const none = $('#supBody .sup-row-none');
    if (none) none.hidden = shown > 0;
  };
  $('#supSearch').oninput = apply;
  $('#supTypeFilter').onchange = apply;
  $('#supAccountFilter').onchange = apply;
  $('#supStatusFilter').onchange = apply;
  $('#supNew').onclick = () => supOpenEditor('create');
  $('#supResetDemo').onclick = supResetDemo;

  $$('#supBody .sup-link').forEach(btn => {
    btn.onclick = () => {
      const row = SUP_ROWS[+btn.dataset.index];
      if (!row) return;
      if (btn.dataset.act === 'view') supOpenDetail(row);
      else if (btn.dataset.act === 'edit') supOpenEditor('edit', row);
      else if (btn.dataset.act === 'reset') supResetPwd(row);
      else if (btn.dataset.act === 'coop') supSwitchCoop(row);
    };
  });
}

/* ---------- 详情 ---------- */
function supOpenDetail(row) {
  const own = row.account && row.account.owner;
  const accBanner = !own ? `<div class="sup-banner" style="margin-top:12px"><i>!</i><div>
      <b>该供应商账号已存在</b>
      <p>该供应商账号已存在（账号 <code>${supEsc(row.account.name)}</code>），请使用该账号登录供应商系统。账号归属租户：<b>${supEsc(row.account.tenant)}</b>，本租户不可创建、不可重置密码。</p>
    </div></div>` : '';
  const termBanner = row.status === '已解除' ? `<div class="sup-banner"><i>!</i><div>
      <b>与「${supEsc(row.name)}」的合作关系已解除</b>
      <p>本租户下的商户不可再选择该供应商进行食材采购；该供应商档案、超管账号及其他租户的合作关系均不受影响。点击列表「继续合作」可恢复。</p>
    </div></div>` : '';
  const mList = row.bindAll
    ? `<div class="sup-field full"><span>供货范围</span><b>全部商户（共 ${SUP_TOTAL_MERCHANTS} 家）</b></div>`
    : (row.merchants || []).map(m => `<div class="sup-field"><span>已绑定商户</span><b>${supEsc(m)}</b></div>`).join('');

  const lic = [['营业执照', row.lic.biz, 2], ['食品经营许可证', row.lic.foodBiz, 2], ['食品生产许可证', row.lic.foodProd, 2], ['合作协议', row.lic.contract, 10]];
  document.body.insertAdjacentHTML('beforeend', `<div class="sup-mask" id="supMask">
    <aside class="sup-drawer narrow">
      <div class="sup-head">
        <div><h2>供应商详情</h2><p>${supEsc(row.name)}　·　编码 ${row.id}</p></div>
        <button class="sup-close">×</button>
      </div>
      <div class="sup-body">
        ${termBanner}
        <section class="sup-section">
          <div class="sup-section-head"><div><h3><i>1</i>基础信息</h3><p>${own ? '供应商档案全局唯一，跨租户共用同一份资料' : '档案全局唯一跨租户共用；联系人与联系方式为本租户维护'}</p></div><span class="status ${row.status === '已解除' ? 'off' : ''}">${row.status}</span></div>
          <div class="sup-dgrid">
            <div class="sup-field"><span>供应商名称</span><b>${supEsc(row.name)}</b></div>
            <div class="sup-field"><span>统一社会信用代码</span><b>${supEsc(row.credit)}</b></div>
            <div class="sup-field"><span>食品经营许可证号</span><b>${supEsc(row.foodBiz || '未填写')}</b></div>
            <div class="sup-field"><span>食品生产许可证号</span><b>${supEsc(row.foodProd || '未填写')}</b></div>
            <div class="sup-field"><span>联系人</span><b>${supEsc(row.contact)}</b></div>
            <div class="sup-field"><span>联系方式</span><b>${supEsc(row.phone)}</b></div>
            <div class="sup-field full"><span>供应商地址</span><b>${supEsc(row.addr || '未填写')}</b></div>
          </div>
        </section>

        <section class="sup-section">
          <div class="sup-section-head"><div><h3><i>2</i>资质证照</h3><p>${own ? '营业执照必传至少 1 张，其余按要求上限上传' : '营业执照与许可证为供应商全局档案；合作协议为本租户独立签署'}</p></div></div>
          <div class="sup-lic-grid">${lic.map(l => `<div class="sup-lic"><b>${l[0]}<em>${l[1]}/${l[2]}</em></b>
            <div class="sup-lic-thumbs">${l[1] ? Array.from({ length: l[1] }).map((x, i) => `<div class="sup-thumb placeholder" title="${l[0]}">${supLicShort(l[0])}${i + 1}</div>`).join('') : '<div class="sup-lic-empty">未上传</div>'}</div>
          </div>`).join('')}</div>
        </section>

        <section class="sup-section">
          <div class="sup-section-head"><div><h3><i>3</i>超管账号</h3><p>账号全局唯一，用于登录供应商系统</p></div>
            <span class="sup-tag ${own ? 'green' : ''}">${own ? '本租户开户' : '他租户开户 · 仅回显'}</span></div>
          <div class="sup-account-card" data-anno="sup-detail-account">
            <div><span>超管账号</span><b>${supEsc(row.account.name)}</b></div>
            <div><span>归属租户</span><b>${supEsc(row.account.tenant)}</b></div>
            <div><span>开户时间</span><b>${supEsc(row.account.opened)}</b></div>
            <div><span>最近重置密码</span><b>${supEsc(row.account.reset)}</b></div>
          </div>
          ${accBanner}
        </section>

        <section class="sup-section">
          <div class="sup-section-head"><div><h3><i>4</i>供应类型</h3><p>决定商户端采购时可按哪些形态选择该供应商</p></div></div>
          <div class="sup-chips">${(row.types || []).map(t => `<span class="sup-chip">${supEsc(t)}</span>`).join('')}</div>
        </section>

        <section class="sup-section" data-anno="sup-detail-merchants">
          <div class="sup-section-head"><div><h3><i>5</i>商户供货范围</h3><p>未绑定的商户在采购业务中选不到该供应商</p></div><span class="sup-tag green">${supBindCount(row)} 家</span></div>
          <div class="sup-dgrid">${mList}</div>
        </section>
      </div>
      <div class="sup-foot">
        <span class="sup-foot-tip">档案更新：${supEsc(row.updated || '—')}</span>
        <button class="ghost sup-close">关闭</button>
        <button class="ghost" id="supDtlEdit">编辑</button>
        <button class="primary" id="supDtlReset" ${own ? '' : 'disabled style="opacity:.45;cursor:not-allowed"'}>重置超管密码</button>
      </div>
    </aside>
  </div>`);
  supBindMaskClose();
  $('#supDtlEdit').onclick = () => { supCloseMask(); supOpenEditor('edit', row); };
  $('#supDtlReset').onclick = () => { if (own) supResetPwd(row); };
}

/* ---------- 新建 / 编辑抽屉 ---------- */
const supEdit = { mode: 'create', row: null, cross: null };

function supOpenEditor(mode, row) {
  supEdit.mode = mode;
  supEdit.row = row || null;
  supEdit.cross = null;
  const r = row || null;
  const isEdit = mode === 'edit';
  const acc = r && r.account ? r.account : null;
  const lockAcct = !!(acc && !acc.owner);

  const uploadBox = (kind, label, tip, max, required, count) => `<div class="sup-upload-box">
      <div class="sup-upload-head"><b>${label}${required ? '<i>*</i>' : ''}</b><small>${tip}</small><em>${count || 0}/${max}</em></div>
      <div class="sup-upload-list" data-kind="${kind}" data-max="${max}">
        ${Array.from({ length: count || 0 }).map((x, i) => `<div class="sup-thumb placeholder"><span style="font-size:10px">${supLicShort(label)}${i + 1}</span><button type="button">×</button></div>`).join('')}
        <label class="sup-tile"><input type="file" accept="image/*" multiple/><span>＋</span><small>上传</small></label>
      </div>
    </div>`;

  document.body.insertAdjacentHTML('beforeend', `<div class="sup-mask" id="supMask">
    <aside class="sup-drawer">
      <div class="sup-head">
        <div><h2 id="supHeadTitle">${isEdit ? '编辑供应商' : '新建供应商'}</h2>
          <p id="supHeadDesc">${isEdit ? '同一供应商档案全局唯一，修改后对其他合作租户同步生效' : '填写基础信息、资质证照、超管账号、供应类型及商户供货范围'}</p></div>
        <button class="sup-close">×</button>
      </div>
      <div class="sup-body">
        <div id="supHitBanner" class="sup-banner hidden"></div>

        <section class="sup-section">
          <div class="sup-section-head"><div><h3><i>1</i>基础信息</h3><p>统一社会信用代码是供应商在平台的全局身份，请先核验</p></div>
            <span class="sup-tag hidden" id="supHitTag">平台已存在</span></div>
          <div class="sup-form">
            <label class="full">统一社会信用代码 <i>*</i>
              <div class="sup-credit-row">
                <input id="supCredit" maxlength="18" placeholder="请输入 18 位统一社会信用代码" value="${isEdit ? supEsc(r.credit) : ''}" ${isEdit ? 'readonly class="locked"' : ''}/>
                <button type="button" class="ghost" id="supVerify" ${isEdit ? 'disabled' : ''}>核验</button>
              </div>
              <small id="supCreditHint">${isEdit ? '信用代码为供应商全局唯一标识，创建后不可修改' : '点击核验自动判断该供应商是否已在平台其他租户建档　·　演示代码：91330100MA2H8Q4W7B'}</small>
            </label>
            <label>供应商名称 <i>*</i><input id="supName" placeholder="请输入供应商全称" value="${isEdit ? supEsc(r.name) : ''}"/></label>
            <label>联系人 <i>*</i><input id="supContact" placeholder="请输入联系人姓名" value="${isEdit ? supEsc(r.contact) : ''}"/><small class="hidden" id="supContactHint"></small></label>
            <label>联系方式 <i>*</i><input id="supPhone" placeholder="请输入手机号" value="${isEdit ? supEsc(r.phone) : ''}"/><small class="hidden" id="supPhoneHint"></small></label>
            <label>食品经营许可证号<input id="supFoodBiz" placeholder="非必填" value="${isEdit ? supEsc(r.foodBiz) : ''}"/></label>
            <label>食品生产许可证号<input id="supFoodProd" placeholder="非必填" value="${isEdit ? supEsc(r.foodProd) : ''}"/></label>
            <label class="full">供应商地址<input id="supAddr" placeholder="请输入省市区及详细地址" value="${isEdit ? supEsc(r.addr) : ''}"/></label>
          </div>
        </section>

        <section class="sup-section" data-anno="sup-lic">
          <div class="sup-section-head"><div><h3><i>2</i>资质证照</h3><p id="supLicDesc">营业执照必传，最多 2 张；其余按上限上传，支持多选与逐张删除</p></div></div>
          <div class="sup-uploads" id="supUploads">
            ${uploadBox('biz', '营业执照', '最多 2 张，必填', 2, true, isEdit ? r.lic.biz : 0)}
            ${uploadBox('foodBiz', '食品经营许可证', '最多 2 张', 2, false, isEdit ? r.lic.foodBiz : 0)}
            ${uploadBox('foodProd', '食品生产许可证', '最多 2 张', 2, false, isEdit ? r.lic.foodProd : 0)}
            ${uploadBox('contract', '合作协议', '最多 10 张', 10, false, isEdit ? r.lic.contract : 0)}
          </div>
          <small id="supUploadNote" class="hidden" style="display:block;margin-top:11px;color:#a5721a;font-size:11px"></small>
        </section>

        <section class="sup-section" data-anno="sup-account">
          <div class="sup-section-head"><div><h3><i>3</i>超管账号</h3><p>账号全局唯一；默认密码 ${SUP_DEFAULT_PWD}，首次登录须修改</p></div>
            <span class="sup-tag ${lockAcct ? '' : 'hidden'}" id="supAccountTag">账号已存在 · 仅回显</span></div>
          <div class="sup-form">
            <label>供应商超管账号 <i>*</i>
              <input id="supAccount" placeholder="请输入账号（如手机号）" value="${acc ? supEsc(acc.name) : ''}" ${isEdit ? 'readonly class="locked"' : ''}/>
              <small id="supAccountHint" class="${lockAcct ? 'err' : ''}">${isEdit ? (lockAcct ? `账号由「${supEsc(acc.tenant)}」开通，本租户不可创建、不可重置` : '账号创建后不可修改，如需变更请联系平台') : '该账号不可与其他供应商账号重复'}</small>
            </label>
            <label>默认密码<input id="supPwd" value="${SUP_DEFAULT_PWD}" readonly/><small>首次登录强制修改密码</small></label>
          </div>
          <span class="sup-badge ${lockAcct ? '' : 'hidden'}" id="supAccountBadge">${lockAcct ? `⚠ 账号已存在（${supEsc(acc.name)}），请使用该账号登录供应商系统` : ''}</span>
        </section>

        <section class="sup-section" data-anno="sup-types">
          <div class="sup-section-head"><div><h3><i>4</i>供应类型</h3><p>至少选择 1 个，决定商户端采购时可按哪些形态选择该供应商</p></div></div>
          <div class="sup-types">${SUP_TYPES.map(t => `<label class="sup-type"><input type="checkbox" data-sup-type value="${t.key}" ${r && (r.types || []).indexOf(t.key) >= 0 ? 'checked' : ''}/><span><b>${t.key}</b><small>${t.desc}</small></span></label>`).join('')}</div>
          <small id="supTypeHint" style="display:block;margin-top:10px;color:#94a0b4;font-size:11px"></small>
        </section>

        <section class="sup-section" data-anno="sup-merchants">
          <div class="sup-section-head"><div><h3><i>5</i>商户供货范围</h3><p>绑定后，商户端采购业务中选择供应商只能从该范围内进行</p></div></div>
          <div class="sup-bind-modes">
            <label class="sup-radio"><input type="radio" name="supBindMode" value="all" ${!r || r.bindAll ? 'checked' : ''}/><span><b>全部商户</b><small>当前租户下全部 ${SUP_TOTAL_MERCHANTS} 家商户均可选择该供应商</small></span></label>
            <label class="sup-radio"><input type="radio" name="supBindMode" value="custom" ${r && !r.bindAll ? 'checked' : ''}/><span><b>指定商户</b><small>仅选中的商户可在采购中选择该供应商</small></span></label>
          </div>
          <div class="sup-mpanel ${r && !r.bindAll ? '' : 'hidden'}" id="supMPanel">
            <div class="sup-mtools">
              <input class="search" id="supMSearch" placeholder="⌕  搜索商户名称"/>
              <button type="button" class="ghost" id="supMAll">全选</button>
              <button type="button" class="ghost" id="supMNone">清空</button>
              <span id="supMCount">已选 0 家</span>
            </div>
            <div class="sup-mlist">${SUP_MERCHANTS.map(m => `<label class="sup-mitem" data-kw="${supEsc(m.name + ' ' + m.format + ' ' + m.area)}"><input type="checkbox" data-sup-m value="${supEsc(m.name)}" ${r && !r.bindAll && (r.merchants || []).indexOf(m.name) >= 0 ? 'checked' : ''}/><span><b>${supEsc(m.name)}</b></span></label>`).join('')}</div>
          </div>
        </section>
      </div>
      <div class="sup-foot">
        <span class="sup-foot-tip" id="supFormErr"></span>
        <button class="ghost sup-close">取消</button>
        <button class="primary" id="supFootPrimary">${isEdit ? '保存修改' : '确认创建'}</button>
      </div>
    </aside>
  </div>`);

  supBindMaskClose();
  supBindUploads();
  supBindMerchants();

  const syncMode = () => {
    const custom = document.querySelector('input[name="supBindMode"]:checked').value === 'custom';
    $('#supMPanel').classList.toggle('hidden', !custom);
  };
  $$('input[name="supBindMode"]').forEach(x => x.onchange = syncMode);
  syncMode();

  $('#supVerify').onclick = supVerify;
  $('#supCredit').oninput = () => { if (supEdit.cross) supUnlockCross(); };

  /* 编辑他租户建档的供应商：档案与证照同样锁定，仅合作协议 / 供应类型 / 商户范围可改 */
  if (isEdit && lockAcct) supLockArchive(r);

  $('#supFootPrimary').onclick = supSubmit;
}

function supVerify() {
  const code = ($('#supCredit').value || '').trim().toUpperCase();
  const hint = $('#supCreditHint');
  if (!/^[0-9A-Z]{18}$/.test(code)) {
    hint.className = 'err';
    hint.textContent = '请输入正确的 18 位统一社会信用代码';
    return showToast('请输入正确的18位统一社会信用代码');
  }
  if (supInTenant(code)) {
    hint.className = 'err';
    hint.textContent = '该供应商已存在于本租户，请勿重复创建';
    return showToast('该供应商已存在于本租户');
  }
  const hit = supGlobalHit(code);
  if (!hit) {
    supUnlockCross();
    hint.className = 'ok';
    hint.textContent = '未查询到该供应商档案，可正常创建并开通超管账号';
    return showToast('核验通过：平台暂无该供应商档案');
  }
  supLockCross(hit);
}

/* 锁定「全局档案」部分：名称/地址/许可证 + 三类证照；
   联系人、联系方式、合作协议按租户独立，默认带出原档案但可修改 */
function supLockArchive(hit) {
  const fill = (id, v) => { const el = $('#' + id); if (!el) return; el.value = v || ''; el.readOnly = true; el.classList.add('locked'); };
  fill('supName', hit.name);
  fill('supFoodBiz', hit.foodBiz);
  fill('supFoodProd', hit.foodProd);
  fill('supAddr', hit.addr);
  const credit = $('#supCredit');
  if (credit) { credit.value = hit.credit; credit.readOnly = true; credit.classList.add('locked'); }
  const verify = $('#supVerify'); if (verify) verify.disabled = true;

  /* 联系人与联系方式：默认带出原档案值，本租户可修改 */
  const setVal = (id, v) => {
    const el = $('#' + id);
    if (!el) return;
    el.value = v || '';
    el.readOnly = false;
    el.classList.remove('locked');
  };
  setVal('supContact', hit.contact);
  setVal('supPhone', hit.phone);
  const cHint = $('#supContactHint');
  if (cHint) { cHint.classList.remove('hidden'); cHint.textContent = '默认带出原档案，可按本租户修改'; }
  const pHint = $('#supPhoneHint');
  if (pHint) { pHint.classList.remove('hidden'); pHint.textContent = '默认带出原档案，可按本租户修改'; }

  const hint = $('#supCreditHint');
  hint.className = 'err';
  hint.textContent = '该供应商已由其他租户建档：名称、地址与证照沿用全局档案，联系人、联系方式可按本租户填写';

  if (hit.account) {
    const acc = $('#supAccount'); if (acc) { acc.value = hit.account.name; acc.readOnly = true; acc.classList.add('locked'); }
    const ah = $('#supAccountHint');
    ah.className = 'err';
    ah.textContent = `账号已由「${hit.account.tenant}」开通，本租户不可创建、不可重置`;
    const tag = $('#supAccountTag'); if (tag) tag.classList.remove('hidden');
    const badge = $('#supAccountBadge');
    badge.classList.remove('hidden');
    badge.textContent = `⚠ 账号已存在（${hit.account.name}），请使用该账号登录供应商系统`;
  }

  $$('#supUploads .sup-upload-list').forEach(list => {
    const kind = list.dataset.kind, max = +list.dataset.max;
    const tile = list.querySelector('.sup-tile');
    const head = list.parentElement.querySelector('.sup-upload-head');
    const counter = head.querySelector('em');
    /* 合作协议是租户与供应商之间的独立文件，不沿用原档案 */
    if (kind === 'contract') {
      tile.classList.remove('disabled');
      counter.textContent = list.querySelectorAll('.sup-thumb').length + '/' + max;
      head.querySelector('small').textContent = `最多 ${max} 张 · 本租户独立签署，不沿用原档案`;
      return;
    }
    list.querySelectorAll('.sup-thumb').forEach(t => t.remove());
    const n = Math.min((hit.lic && hit.lic[kind]) || 0, max);
    for (let i = 0; i < n; i++) {
      const d = document.createElement('div');
      d.className = 'sup-thumb placeholder';
      d.textContent = '原档案';
      list.insertBefore(d, tile);
    }
    tile.classList.add('disabled');
    counter.textContent = n + '/' + max;
  });

  const note = $('#supUploadNote');
  note.classList.remove('hidden');
  note.style.display = 'block';
  note.textContent = '营业执照与许可证沿用该供应商全局档案；合作协议按租户独立签署，请上传本租户自己的协议。';

  const licDesc = $('#supLicDesc');
  if (licDesc) licDesc.textContent = '营业执照与许可证沿用全局档案；合作协议为本租户独立签署，请上传本租户自己的协议';
}

function supLockCross(hit) {
  supEdit.cross = hit;
  const own = hit.account && hit.account.owner;
  $('#supHitTag').classList.remove('hidden');
  $('#supHitTag').textContent = '平台已存在 · 沿用原档案';
  const banner = $('#supHitBanner');
  banner.classList.remove('hidden');
  banner.innerHTML = `<i>!</i><div><b>该供应商在平台已存在${own ? '' : '，且已开通超管账号'}</b>
    <p>供应商档案由其他租户（<b>${supEsc(hit.account ? hit.account.tenant : '其他租户')}</b>）创建，本租户将以「建立合作关系」方式接入：
    名称、地址与证照沿用原档案，不可修改；<b>联系人、联系方式</b>默认带出原档案，可按本租户修改；供应类型与商户供货范围单独设置。</p>
    ${hit.account ? `<p>超管账号：<code>${supEsc(hit.account.name)}</code>　该供应商账号已存在，请使用该账号登录供应商系统。</p>` : ''}</div>`;

  supLockArchive(hit);

  $('#supTypeHint').textContent = '该供应商在平台已有供应类型：' + ((hit.types || []).join(' / ') || '—') + '，可按本租户合作范围调整';
  $$('[data-sup-type]').forEach(x => { x.checked = (hit.types || []).indexOf(x.value) >= 0; });

  $('#supHeadTitle').textContent = '建立供应商合作';
  $('#supHeadDesc').textContent = '该供应商已存在于平台，本次仅建立本租户的合作关系';
  $('#supFootPrimary').textContent = '确认建立合作';
  showToast(`该供应商账号已存在（账号 ${hit.account ? hit.account.name : ''}），请使用该账号登录供应商系统`);
}

function supUnlockCross() {
  if (!supEdit.cross) return;
  supEdit.cross = null;
  $('#supHitBanner').classList.add('hidden');
  $('#supHitTag').classList.add('hidden');
  $('#supHeadTitle').textContent = '新建供应商';
  $('#supHeadDesc').textContent = '填写基础信息、资质证照、超管账号、供应类型及商户供货范围';
  $('#supFootPrimary').textContent = '确认创建';
  $$('#supName,#supContact,#supPhone,#supFoodBiz,#supFoodProd,#supAddr,#supCredit,#supAccount').forEach(el => { el.readOnly = false; el.classList.remove('locked'); });
  $('#supVerify').disabled = false;
  ['supName', 'supContact', 'supPhone', 'supFoodBiz', 'supFoodProd', 'supAddr'].forEach(id => { $('#' + id).value = ''; });
  $('#supAccount').value = '';
  $('#supCreditHint').className = '';
  $('#supCreditHint').textContent = '点击核验自动判断该供应商是否已在平台其他租户建档　·　演示代码：91330100MA2H8Q4W7B';
  $('#supAccountHint').className = '';
  $('#supAccountHint').textContent = '该账号不可与其他供应商账号重复';
  $('#supAccountTag').classList.add('hidden');
  $('#supAccountBadge').classList.add('hidden');
  const ch = $('#supContactHint'); if (ch) ch.classList.add('hidden');
  const ph = $('#supPhoneHint'); if (ph) ph.classList.add('hidden');
  const note = $('#supUploadNote'); note.classList.add('hidden'); note.textContent = '';
  const licDesc = $('#supLicDesc');
  if (licDesc) licDesc.textContent = '营业执照必传，最多 2 张；其余按上限上传，支持多选与逐张删除';
  $$('#supUploads .sup-upload-list').forEach(list => {
    const kind = list.dataset.kind;
    const tile = list.querySelector('.sup-tile');
    const head = list.parentElement.querySelector('.sup-upload-head');
    const counter = head.querySelector('em');
    if (kind === 'contract') {
      // 合作协议属于租户自己的文件，退出合作模式时保留已上传内容
      tile.classList.remove('disabled');
      head.querySelector('small').textContent = '最多 ' + list.dataset.max + ' 张';
      counter.textContent = list.querySelectorAll('.sup-thumb').length + '/' + list.dataset.max;
      return;
    }
    list.querySelectorAll('.sup-thumb').forEach(t => t.remove());
    tile.classList.remove('disabled');
    counter.textContent = '0/' + list.dataset.max;
  });
  $('#supTypeHint').textContent = '';
}

function supBindUploads() {
  $$('.sup-upload-box').forEach(box => {
    const list = box.querySelector('.sup-upload-list');
    const max = +list.dataset.max;
    const tile = list.querySelector('.sup-tile');
    const counter = box.querySelector('.sup-upload-head em');
    const sync = () => {
      const n = list.querySelectorAll('.sup-thumb').length;
      counter.textContent = n + '/' + max;
      tile.classList.toggle('disabled', n >= max);
    };
    tile.querySelector('input').onchange = e => {
      const files = Array.prototype.slice.call(e.target.files || []);
      files.forEach(f => {
        if (list.querySelectorAll('.sup-thumb').length >= max) return;
        const thumb = document.createElement('div');
        thumb.className = 'sup-thumb';
        const img = document.createElement('img');
        img.src = URL.createObjectURL(f);
        const del = document.createElement('button');
        del.type = 'button';
        del.textContent = '×';
        thumb.appendChild(img);
        thumb.appendChild(del);
        list.insertBefore(thumb, tile);
      });
      e.target.value = '';
      sync();
    };
    list.onclick = e => {
      const b = e.target.closest('.sup-thumb button');
      if (b) { b.parentElement.remove(); sync(); }
    };
    sync();
  });
}

function supBindMerchants() {
  const sync = () => {
    const n = $$('[data-sup-m]:checked').length;
    $('#supMCount').textContent = '已选 ' + n + ' 家';
  };
  $$('[data-sup-m]').forEach(x => x.onchange = sync);
  $('#supMSearch').oninput = e => {
    const kw = (e.target.value || '').trim().toLowerCase();
    $$('.sup-mitem').forEach(item => {
      const text = (item.dataset.kw || item.textContent).toLowerCase();
      item.hidden = !!kw && text.indexOf(kw) < 0;
    });
  };
  $('#supMAll').onclick = () => { $$('.sup-mitem:not([hidden]) [data-sup-m]').forEach(x => x.checked = true); sync(); };
  $('#supMNone').onclick = () => { $$('[data-sup-m]').forEach(x => x.checked = false); sync(); };
  sync();
}

/* ---------- 提交 ---------- */
function supSubmit() {
  const err = $('#supFormErr');
  const errs = [];
  const v = id => ($('#' + id).value || '').trim();
  const cross = supEdit.cross;
  const isEdit = supEdit.mode === 'edit';
  const credit = (cross ? cross.credit : v('supCredit')).toUpperCase();

  if (!cross) {
    if (!v('supName')) errs.push('请填写供应商名称');
    if (!/^[0-9A-Z]{18}$/.test(credit)) errs.push('请填写正确的 18 位统一社会信用代码');
    else if (!isEdit && supInTenant(credit)) errs.push('该供应商已存在于本租户，请勿重复创建');
    if (!v('supContact')) errs.push('请填写联系人');
    if (!/^1[3-9]\d{9}$/.test(v('supPhone'))) errs.push('请填写正确的联系人手机号');
    if (!isEdit && !v('supAccount')) errs.push('请填写供应商超管账号');
    if (!isEdit && v('supAccount') && supAccountTaken(v('supAccount'))) errs.push('账号「' + v('supAccount') + '」已被其他供应商使用，请更换');
  } else {
    /* 建立合作时联系人 / 联系方式由本租户填写 */
    if (!v('supContact')) errs.push('请填写联系人');
    if (!/^1[3-9]\d{9}$/.test(v('supPhone'))) errs.push('请填写正确的联系人手机号');
  }

  const lic = supLicCounts();
  if (!cross && !(lic.biz >= 1)) errs.push('请上传营业执照图片（至少 1 张，最多 2 张）');
  const types = Array.from($$('[data-sup-type]:checked'), x => x.value);
  if (!types.length) errs.push('请至少选择 1 个供应类型');
  const bindAll = document.querySelector('input[name="supBindMode"]:checked').value === 'all';
  const merchants = Array.from($$('[data-sup-m]:checked'), x => x.value);
  if (!bindAll && !merchants.length) errs.push('选择「指定商户」时至少绑定 1 家商户');

  if (errs.length) {
    err.className = 'sup-foot-tip err';
    err.textContent = errs.slice(0, 3).join('；') + (errs.length > 3 ? ' 等 ' + errs.length + ' 项' : '');
    showToast(errs[0]);
    return;
  }

  const acc = cross && cross.account
    ? Object.assign({}, cross.account)
    : (isEdit && supEdit.row.account)
      ? Object.assign({}, supEdit.row.account)
      : { name: v('supAccount'), tenant: SUP_TENANT, owner: true, opened: SUP_TODAY, reset: '—' };

  if (isEdit) {
    const row = supEdit.row;
    const ownArchive = !!(row.account && row.account.owner);
    const upd = { types, bindAll, merchants: bindAll ? [] : merchants, updated: SUP_NOW };
    if (ownArchive) {
      Object.assign(upd, {
        name: v('supName') || row.name, foodBiz: v('supFoodBiz'), foodProd: v('supFoodProd'),
        addr: v('supAddr'), contact: v('supContact'), phone: v('supPhone'),
        lic: { biz: lic.biz, foodBiz: lic.foodBiz, foodProd: lic.foodProd, contract: lic.contract }
      });
    } else {
      /* 他租户建档：名称/地址/许可证沿用原档案，联系人、联系方式与合作协议按本租户更新 */
      upd.contact = v('supContact');
      upd.phone = v('supPhone');
      upd.lic = { biz: row.lic.biz, foodBiz: row.lic.foodBiz, foodProd: row.lic.foodProd, contract: lic.contract };
    }
    Object.assign(row, upd);
    supCloseMask();
    render('suppliers');
    return showToast('供应商信息已保存');
  }

  const row = {
    id: 'SUP' + String(SUP_ROWS.length + 1).padStart(3, '0'),
    name: cross ? cross.name : v('supName'),
    credit: cross ? cross.credit : v('supCredit').toUpperCase(),
    foodBiz: cross ? cross.foodBiz : v('supFoodBiz'),
    foodProd: cross ? cross.foodProd : v('supFoodProd'),
    addr: cross ? cross.addr : v('supAddr'),
    contact: v('supContact'),
    phone: v('supPhone'),
    lic: cross
      ? { biz: cross.lic.biz, foodBiz: cross.lic.foodBiz, foodProd: cross.lic.foodProd, contract: lic.contract }
      : { biz: lic.biz, foodBiz: lic.foodBiz, foodProd: lic.foodProd, contract: lic.contract },
    types, bindAll, merchants: bindAll ? [] : merchants,
    account: acc, status: '合作中', created: SUP_NOW, updated: SUP_NOW
  };
  SUP_ROWS.unshift(row);
  supCloseMask();
  render('suppliers');
  showToast(cross ? '已建立与该供应商的合作关系，账号沿用原租户开通的账号' : '供应商创建成功，超管账号已开通');
}

/* ---------- 重置密码 ---------- */
function supResetPwd(row) {
  if (!row.account || !row.account.owner) { showToast('该账号由其他租户开通，本租户不可重置'); return; }
  document.body.insertAdjacentHTML('beforeend', `<div class="sup-dialog-mask" id="supDialog">
    <div class="sup-dialog">
      <h3>重置超管密码</h3>
      <p>将「${supEsc(row.name)}」的超管账号 <code>${supEsc(row.account.name)}</code> 密码重置为初始密码 <code>${SUP_DEFAULT_PWD}</code>？</p>
      <p style="margin-top:8px;color:#a5721a">重置后该账号首次登录须修改密码。</p>
      <div class="sup-dialog-actions"><button class="ghost" id="supDlgCancel">取消</button><button class="primary" id="supDlgOk">确认重置</button></div>
    </div>
  </div>`);
  const close = () => { const d = $('#supDialog'); if (d) d.remove(); };
  $('#supDlgCancel').onclick = close;
  $('#supDialog').onclick = e => { if (e.target.id === 'supDialog') close(); };
  $('#supDlgOk').onclick = () => {
    row.account.reset = SUP_NOW;
    row.updated = SUP_NOW;
    close();
    if ($('#supMask')) supCloseMask();
    render('suppliers');
    showToast('超管密码已重置为 ' + SUP_DEFAULT_PWD + '，请通知供应商首次登录后修改');
  };
}

/* ---------- 重置演示数据（仅原型演示用） ---------- */
function supResetDemo() {
  document.body.insertAdjacentHTML('beforeend', `<div class="sup-dialog-mask" id="supDialog">
    <div class="sup-dialog">
      <h3>重置演示数据</h3>
      <p>将清空本次演示中新建的供应商（如演示时创建的「1231」）以及所有临时修改，恢复为初始的 5 条演示数据。</p>
      <p style="margin-top:8px;color:#a5721a">仅作用于本机当前页面，不写入任何持久化存储；直接刷新页面也是同样的效果。</p>
      <div class="sup-dialog-actions"><button class="ghost" id="supDlgCancel">取消</button><button class="primary" id="supDlgOk">确认重置</button></div>
    </div>
  </div>`);
  const close = () => { const d = $('#supDialog'); if (d) d.remove(); };
  $('#supDlgCancel').onclick = close;
  $('#supDialog').onclick = e => { if (e.target.id === 'supDialog') close(); };
  $('#supDlgOk').onclick = () => {
    SUP_ROWS.splice(0, SUP_ROWS.length, ...JSON.parse(JSON.stringify(SUP_ROWS_SEED)));
    close();
    render('suppliers');
    showToast('演示数据已重置，恢复为初始 ' + SUP_ROWS.length + ' 条');
  };
}

/* ---------- 解除合作 / 继续合作 ----------
 * 只改本租户与该供应商的合作关系：不动供应商档案、不动超管账号、不影响其他租户。
 */
function supSwitchCoop(row) {
  if (row.status !== '已解除') {
    row.status = '已解除';
    row.updated = SUP_NOW;
    render('suppliers');
    return showToast('已解除与该供应商的合作，本租户商户不可再选择其采购');
  }
  row.status = '合作中';
  row.updated = SUP_NOW;
  render('suppliers');
  showToast('已继续合作，本租户商户可继续选择该供应商采购');
}

/* ---------- 关闭 ---------- */
function supCloseMask() {
  const m = $('#supMask');
  if (m) m.remove();
}
function supBindMaskClose() {
  $$('#supMask .sup-close').forEach(b => b.onclick = supCloseMask);
  const m = $('#supMask');
  if (m) m.onclick = e => { if (e.target.id === 'supMask') supCloseMask(); };
  document.onkeydown = e => { if (e.key === 'Escape') supCloseMask(); };
}
