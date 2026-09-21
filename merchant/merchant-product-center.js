/*
 * 商户端「商品中心」原型
 * 二级栏目：运营商品 / SKU中心 / 发布记录 / 品牌库 / 分类库
 * 口径来源：《商户端商品中心 PRD》V1.0
 *   - 私域商品与 SKU 按「组织」隔离，每个组织一套
 *   - 租户授权 → 组织「同步商品」→ 形成组织私域商品与 SKU（商品草稿 / SKU 草稿+启用）
 *   - 同步以 SKU 为单位，商品容器自动带出；私域编码独立，上游编码仅后端保存
 *   - 品牌库、分类库、标准食材均为租户 / 平台只读数据
 */
(()=>{
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const NAV=[['pcNavProduct','运营商品','product'],['pcNavSku','SKU中心','sku'],['pcNavPublish','发布记录','publish'],['pcNavBrand','品牌库','brand'],['pcNavCategory','分类库','category']];
const VIEW_TITLE={product:'运营商品',sku:'SKU中心',publish:'发布记录',brand:'品牌库',category:'分类库'};
const OTHER_PAGES=['#organizationPage','#rolesPage','#adminsPage','#usersPage','#recipePage','#dishCategoryPage','#deviceRecipePage'];
const norm=s=>String(s||'').replace(/\s+/g,' ').trim();

/* ==================== 只读上游数据 ==================== */

// 租户分类库（三级，商户端只读）—— 与租户端一致：平铺节点，带编码、级别、上级
const categoryNodes=[
  {code:'CAT001',name:'蔬菜',level:1,parent:'',note:'蔬菜类运营商品',status:'启用'},
  {code:'CAT002',name:'根茎类',level:2,parent:'蔬菜',note:'根茎类蔬菜',status:'启用'},
  {code:'CAT003',name:'土豆类',level:3,parent:'根茎类',note:'土豆及制品',status:'启用'},
  {code:'CAT004',name:'胡萝卜类',level:3,parent:'根茎类',note:'胡萝卜',status:'启用'},
  {code:'CAT005',name:'山药类',level:3,parent:'根茎类',note:'山药',status:'启用'},
  {code:'CAT006',name:'花菜类',level:2,parent:'蔬菜',note:'花菜类蔬菜',status:'启用'},
  {code:'CAT007',name:'西兰花类',level:3,parent:'花菜类',note:'西兰花',status:'启用'},
  {code:'CAT008',name:'禽蛋',level:1,parent:'',note:'禽蛋类运营商品',status:'启用'},
  {code:'CAT009',name:'蛋类',level:2,parent:'禽蛋',note:'鲜蛋类',status:'启用'},
  {code:'CAT010',name:'鸡蛋类',level:3,parent:'蛋类',note:'鸡蛋',status:'启用'},
  {code:'CAT011',name:'调理半成品',level:1,parent:'',note:'半成品运营商品',status:'启用'},
  {code:'CAT012',name:'菜肴半成品',level:2,parent:'调理半成品',note:'菜肴类半成品',status:'启用'},
  {code:'CAT013',name:'禽类半成品',level:3,parent:'菜肴半成品',note:'禽类半成品',status:'启用'},
  {code:'CAT014',name:'畜类半成品',level:3,parent:'菜肴半成品',note:'畜类半成品',status:'启用'},
  {code:'CAT015',name:'水产半成品',level:3,parent:'菜肴半成品',note:'水产半成品',status:'启用'}
];
const LEVEL_NAME={1:'一级分类',2:'二级分类',3:'三级分类'};
const catPath=(b,m,s)=>`${b} / ${m} / ${s}`;
// 节点完整路径：一级=名称；二级=大类 / 名称；三级=大类 / 中类 / 名称
const catPathOf=n=>n.level===1?n.name:n.level===2?`${n.parent} / ${n.name}`:(()=>{const mid=categoryNodes.find(x=>x.level===2&&x.name===n.parent);return `${mid?mid.parent:'—'} / ${n.parent} / ${n.name}`})();
const CAT3=categoryNodes.filter(n=>n.level===3).map(n=>({name:n.name,small:n.name,code:n.code,status:n.status,path:catPathOf(n)}));
const ALL_CATS=CAT3;
const cat1=()=>categoryNodes.filter(n=>n.level===1&&n.status==='启用');
const cat2=p=>categoryNodes.filter(n=>n.level===2&&n.parent===p&&n.status==='启用');
const cat3=p=>categoryNodes.filter(n=>n.level===3&&n.parent===p&&n.status==='启用');
// 某节点的启用状态：三级需上级中类、大类均启用
const catEnabled=n=>{
  if(n.status!=='启用')return false;
  if(n.level===1)return true;
  const up=categoryNodes.find(x=>x.name===n.parent&&(n.level===2?x.level===1:x.level===2));
  return up?catEnabled(up):false;
};

// 租户品牌库（商户端只读）
const tenantBrands=[
  {name:'味来优选',code:'BR001',linked:8,status:'启用',updated:'2026-09-08'},
  {name:'鲜达',code:'BR002',linked:5,status:'启用',updated:'2026-09-08'},
  {name:'田园记',code:'BR003',linked:0,status:'停用',updated:'2026-09-05'}
];

// 全平台标准食材库（商户端只读）
const standardIngredients=[
  {name:'土豆',code:'SC0001',category:'蔬菜 / 根茎类',unit:'千克 kg',status:'启用'},
  {name:'胡萝卜',code:'SC0002',category:'蔬菜 / 根茎类',unit:'千克 kg',status:'启用'},
  {name:'鸡蛋',code:'SC0003',category:'禽蛋 / 蛋类',unit:'枚',status:'启用'},
  {name:'西兰花',code:'SC0004',category:'蔬菜 / 花菜类',unit:'千克 kg',status:'启用'},
  {name:'干木耳',code:'SC0005',category:'干货 / 菌菇干货',unit:'千克 kg',status:'停用'}
];

// 租户已授权给本商户的 SKU 快照（授权粒度 = SKU）
const tenantSkus=[
  {skuId:'SKU000101',skuCode:'SKU000101',name:'山东一级土豆 5kg装',productId:'SP000001',productCode:'SP000001',productName:'山东一级土豆',productType:'毛菜',category:catPath('蔬菜','根茎类','土豆类'),brand:'味来优选',spec:'5kg/袋',orderUnit:'袋',stockUnit:'千克',version:'V2',batchNo:'PA20260910001',validTo:'2027-12-31',tenant:'市教育餐饮服务中心',batchStatus:'生效中',productStatus:'已上架',skuStatus:'启用'},
  {skuId:'SKU000102',skuCode:'SKU000102',name:'山东一级土豆 10kg装',productId:'SP000001',productCode:'SP000001',productName:'山东一级土豆',productType:'毛菜',category:catPath('蔬菜','根茎类','土豆类'),brand:'味来优选',spec:'10kg/箱',orderUnit:'箱',stockUnit:'千克',version:'V2',batchNo:'PA20260910001',validTo:'2027-12-31',tenant:'市教育餐饮服务中心',batchStatus:'生效中',productStatus:'已上架',skuStatus:'启用'},
  {skuId:'SKU000201',skuCode:'SKU000201',name:'去皮土豆 2.5kg装',productId:'SP000002',productCode:'SP000002',productName:'去皮土豆',productType:'净菜',category:catPath('蔬菜','根茎类','土豆类'),brand:'味来优选',spec:'2.5kg/袋',orderUnit:'袋',stockUnit:'千克',version:'V1',batchNo:'PA20260910001',validTo:'2027-12-31',tenant:'市教育餐饮服务中心',batchStatus:'生效中',productStatus:'已上架',skuStatus:'启用'},
  {skuId:'SKU000301',skuCode:'SKU000301',name:'土豆丝 2mm 1kg装',productId:'SP000003',productCode:'SP000003',productName:'土豆丝 2mm',productType:'净菜',category:catPath('蔬菜','根茎类','土豆类'),brand:'—',spec:'1kg/袋',orderUnit:'袋',stockUnit:'千克',version:'V1',batchNo:'PA20260910001',validTo:'2027-12-31',tenant:'市教育餐饮服务中心',batchStatus:'生效中',productStatus:'草稿',skuStatus:'启用'},
  {skuId:'SKU000401',skuCode:'SKU000401',name:'精品胡萝卜 8kg装',productId:'SP000004',productCode:'SP000004',productName:'精品胡萝卜',productType:'毛菜',category:catPath('蔬菜','根茎类','胡萝卜类'),brand:'田园记',spec:'8kg/箱',orderUnit:'箱',stockUnit:'千克',version:'V1',batchNo:'PA20260910001',validTo:'2027-12-31',tenant:'市教育餐饮服务中心',batchStatus:'生效中',productStatus:'已上架',skuStatus:'启用'},
  {skuId:'SKU000402',skuCode:'SKU000402',name:'精品胡萝卜 12kg装',productId:'SP000004',productCode:'SP000004',productName:'精品胡萝卜',productType:'毛菜',category:catPath('蔬菜','根茎类','胡萝卜类'),brand:'田园记',spec:'12kg/箱',orderUnit:'箱',stockUnit:'千克',version:'V1',batchNo:'PA20260910001',validTo:'2027-12-31',tenant:'市教育餐饮服务中心',batchStatus:'生效中',productStatus:'已上架',skuStatus:'停用'},
  {skuId:'SKU000501',skuCode:'SKU000501',name:'香辣鸡丁 2kg装',productId:'SP000005',productCode:'SP000005',productName:'香辣鸡丁',productType:'半成品',category:catPath('调理半成品','菜肴半成品','禽类半成品'),brand:'味来优选',spec:'2kg/袋',orderUnit:'袋',stockUnit:'千克',version:'V1',batchNo:'PA20260910001',validTo:'2027-12-31',tenant:'市教育餐饮服务中心',batchStatus:'生效中',productStatus:'已上架',skuStatus:'启用'},
  {skuId:'SKU000601',skuCode:'SKU000601',name:'番茄炒蛋料理包 3kg装',productId:'SP000006',productCode:'SP000006',productName:'番茄炒蛋料理包',productType:'半成品',category:catPath('调理半成品','菜肴半成品','禽类半成品'),brand:'鲜达',spec:'3kg/袋',orderUnit:'袋',stockUnit:'千克',version:'V1',batchNo:'PA20260910001',validTo:'2027-12-31',tenant:'市教育餐饮服务中心',batchStatus:'生效中',productStatus:'已上架',skuStatus:'启用'},
  {skuId:'SKU000701',skuCode:'SKU000701',name:'土豆烧牛肉 2kg装',productId:'SP000007',productCode:'SP000007',productName:'土豆烧牛肉',productType:'半成品',category:catPath('调理半成品','菜肴半成品','畜类半成品'),brand:'味来优选',spec:'2kg/袋',orderUnit:'袋',stockUnit:'千克',version:'V1',batchNo:'PA20260906002',validTo:'2026-12-31',tenant:'市教育餐饮服务中心',batchStatus:'已撤销',productStatus:'已上架',skuStatus:'启用'}
];

// 组织私域种子数据
const seedProducts=[
  {code:'P202609001',name:'山东一级土豆',shortName:'一级土豆',type:'毛菜',ingredients:['土豆'],category:catPath('蔬菜','根茎类','土豆类'),brand:'味来优选',origin:'山东',grade:'一级',storage:'常温',measure:'重量',stockUnit:'千克',source:'租户授权',sourceProductId:'SP000001',sourceVersion:'V2',status:'已发布',version:'V1',updated:'2026-09-18 10:30',updatedBy:'食堂商品管理员'},
  {code:'P202609002',name:'去皮土豆',shortName:'去皮土豆',type:'净菜',ingredients:['土豆'],category:catPath('蔬菜','根茎类','土豆类'),brand:'味来优选',origin:'山东',grade:'一级',storage:'冷藏',measure:'重量',stockUnit:'千克',source:'租户授权',sourceProductId:'SP000002',sourceVersion:'V1',status:'草稿',version:'—',updated:'2026-09-18 09:35',updatedBy:'食堂商品管理员'},
  {code:'P202609003',name:'香辣鸡丁（本地版）',shortName:'香辣鸡丁',type:'半成品',ingredients:[],category:catPath('调理半成品','菜肴半成品','禽类半成品'),brand:'—',origin:'—',grade:'—',storage:'冷冻',measure:'重量',stockUnit:'千克',source:'自建',status:'已发布',version:'V2',generateStatus:'生成成功',updated:'2026-09-17 15:20',updatedBy:'食堂商品管理员'},
  {code:'P202609004',name:'土豆丝 2mm（本地切配）',shortName:'土豆丝',type:'净菜',ingredients:['土豆'],category:catPath('蔬菜','根茎类','土豆类'),brand:'鲜达',origin:'山东',grade:'一级',storage:'冷藏',measure:'重量',stockUnit:'千克',source:'自建',status:'草稿',version:'—',updated:'2026-09-16 11:05',updatedBy:'食堂商品管理员'},
  {code:'P202609005',name:'精品胡萝卜',shortName:'精品胡萝卜',type:'毛菜',ingredients:['胡萝卜'],category:catPath('蔬菜','根茎类','胡萝卜类'),brand:'田园记',origin:'河北',grade:'一级',storage:'常温',measure:'重量',stockUnit:'千克',source:'租户授权',sourceProductId:'SP000004',sourceVersion:'V1',status:'已下架',version:'V1',updated:'2026-09-15 14:00',updatedBy:'食堂商品管理员'}
];
const seedSkus=[
  {code:'S202609001',name:'山东一级土豆 5kg装',productCode:'P202609001',spec:'5kg/袋',orderUnit:'袋',stockUnit:'千克',accept:'按箱验收，破损率≤2%',convert:'1袋 = 5千克',source:'租户授权',sourceSkuCode:'SKU000101',sourceVersion:'V1',publishStatus:'已发布',enableStatus:'启用',updated:'2026-09-18 10:30'},
  {code:'S202609002',name:'去皮土豆 2.5kg装',productCode:'P202609002',spec:'2.5kg/袋',orderUnit:'袋',stockUnit:'千克',accept:'按袋验收',convert:'1袋 = 2.5千克',source:'租户授权',sourceSkuCode:'SKU000201',sourceVersion:'V1',publishStatus:'草稿',enableStatus:'启用',updated:'2026-09-18 09:35'},
  {code:'S202609003',name:'香辣鸡丁 2kg装',productCode:'P202609003',spec:'2kg/袋',orderUnit:'袋',stockUnit:'千克',accept:'冷冻到货，中心温度≤-18℃',convert:'1袋 = 2千克',source:'自建',publishStatus:'已发布',enableStatus:'启用',updated:'2026-09-17 15:20'},
  {code:'S202609004',name:'精品胡萝卜 8kg装',productCode:'P202609005',spec:'8kg/箱',orderUnit:'箱',stockUnit:'千克',accept:'按箱验收',convert:'1箱 = 8千克',source:'租户授权',sourceSkuCode:'SKU000401',sourceVersion:'V1',publishStatus:'已发布',enableStatus:'停用',updated:'2026-09-15 14:00'},
  {code:'S202609005',name:'土豆丝 1kg装',productCode:'P202609004',spec:'1kg/袋',orderUnit:'袋',stockUnit:'千克',accept:'按袋验收',convert:'1袋 = 1千克',source:'自建',publishStatus:'草稿',enableStatus:'启用',updated:'2026-09-16 11:05'}
];
// 发布记录：字段与「查看」抽屉对齐租户端（不含「影响授权批次」「影响租户」）
// changes[].fields 带 from 渲染为「修改前 → 修改后」，不带 from 渲染为新增值
const seedRecords=[
  {no:'PUB20260918001',at:'2026-09-18 10:24',by:'食堂商品管理员',product:'山东一级土豆',productCode:'P202609001',type:'内容修改',from:'V1',to:'V2',
   changes:[
     {kind:'商品信息修改',detail:'共 1 个字段发生变化',fields:[{name:'产地',from:'河北',to:'山东寿光'}]},
     {kind:'新增SKU',detail:'共新增 1 个SKU',fields:[],added:['山东一级土豆 10kg装']},
     {kind:'修改SKU',detail:'共修改 1 个SKU',fields:[],skus:[{name:'山东一级土豆 5kg装',fields:[{name:'下单单位',from:'袋',to:'箱'}]}]},
     {kind:'停用SKU',detail:'本次未停用SKU',fields:[],added:[]}
   ]},
  {no:'PUB20260917002',at:'2026-09-17 15:20',by:'食堂商品管理员',product:'香辣鸡丁（本地版）',productCode:'P202609003',type:'内容修改',from:'V1',to:'V2',
   changes:[
     {kind:'商品信息修改',detail:'共 1 个字段发生变化',fields:[{name:'储存方式',from:'冷藏',to:'冷冻'}]},
     {kind:'新增SKU',detail:'本次未新增SKU',fields:[],added:[]},
     {kind:'修改SKU',detail:'本次未修改SKU',fields:[],skus:[]},
     {kind:'停用SKU',detail:'本次未停用SKU',fields:[],added:[]}
   ]},
  {no:'PUB20260916003',at:'2026-09-16 11:05',by:'食堂商品管理员',product:'土豆丝 2mm（本地切配）',productCode:'P202609004',type:'首次发布',from:'—',to:'V1',
   changes:[
     {kind:'商品信息',detail:'首次发布，以下字段为本次新增',fields:[{name:'加工形态',to:'净菜'},{name:'商品分类',to:'蔬菜 / 根茎类 / 土豆类'},{name:'库存基准单位',to:'千克'}]},
     {kind:'新增SKU',detail:'共新增 1 个SKU',fields:[],added:['土豆丝 1kg装']}
   ]}
];

/* ==================== 状态 ==================== */
const products={},skus={},records={},syncedOrgs={};
let view='product',moreFilters=false;
let selected=new Set(),syncView='sku',syncCategory='';
let editor=null;

const org=()=>norm($('#currentOrganization')?.textContent)||'当前组织';
function ensureOrg(){
  const key=org();
  if(!products[key]){
    products[key]=seedProducts.map(x=>({...x,ingredients:[...x.ingredients]}));
    skus[key]=seedSkus.map(x=>({...x}));
    records[key]=seedRecords.map(x=>({...x}));
    syncedOrgs[key]=new Set(seedSkus.filter(s=>s.sourceSkuCode).map(s=>s.sourceSkuCode));
  }
  return key;
}
const isSynced=(key,skuId)=>syncedOrgs[key].has(skuId);
// 可同步范围：授权批次生效中 + 商品已发布且已上架 + SKU启用（其余不进入列表）
const syncable=()=>tenantSkus.filter(s=>s.batchStatus==='生效中'&&s.productStatus==='已上架'&&s.skuStatus==='启用');
const pendingList=key=>syncable().filter(s=>!isSynced(key,s.skuId));

function toast(msg){const n=document.createElement('div');n.className='um-toast';n.textContent=msg;document.body.appendChild(n);setTimeout(()=>n.remove(),2000)}

/* ==================== 页面骨架 ==================== */
function mountNav(){
  if($('#pcNavProduct'))return;
  const sidebar=$('.sidebar');if(!sidebar)return;
  const html=`<div class="nav-parent" id="productCenterParent"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M4 7.5 12 3l8 4.5v9L12 21l-8-4.5z"/><path d="M4 7.5 12 12l8-4.5M12 12v9"/></svg><span>商品中心</span></div>`
    +NAV.map(([id,label])=>`<div class="nav-child" id="${id}"><span>${label}</span></div>`).join('');
  const anchor=$('#planManagementParent');
  if(anchor)anchor.insertAdjacentHTML('beforebegin',html);else sidebar.insertAdjacentHTML('beforeend',html);
  NAV.forEach(([id,,v])=>{
    const el=$('#'+id);
    el.addEventListener('click',e=>{e.stopImmediatePropagation();enter(v)},true);
  });
  // 点击其它模块导航时收起商品中心，避免两个页面同时可见
  document.addEventListener('click',e=>{
    const child=e.target.closest?.('.sidebar .nav-child');
    if(child&&!NAV.some(([id])=>id===child.id))hidePage();
  },true);
}
function makePage(){
  let p=$('#productCenterPage');
  if(!p){
    p=document.createElement('section');
    p.id='productCenterPage';
    p.className='page-view unified-merchant-page';
    p.hidden=true;
    const ref=$('#organizationPage');
    (ref&&ref.parentElement?ref.parentElement:document.body).appendChild(p);
  }
  return p;
}
function hidePage(){const p=$('#productCenterPage');if(p)p.hidden=true;$$('.sidebar .nav-child').forEach(x=>{if(NAV.some(([id])=>id===x.id))x.classList.remove('active')})}
function hideOthers(){
  OTHER_PAGES.forEach(s=>{const x=$(s);if(x)x.hidden=true});
  $$('.sidebar .nav-child').forEach(x=>x.classList.remove('active'));
  NAV.forEach(([id,,v])=>{const el=$('#'+id);if(el)el.classList.toggle('active',v===view)});
}
function enter(v){
  view=v||'product';ensureOrg();hideOthers();
  const p=makePage();p.hidden=false;render();
}
function render(){
  const p=makePage();
  const body=view==='product'?productPage():view==='sku'?skuPage():view==='publish'?publishPage():view==='brand'?brandPage():categoryPage();
  p.innerHTML=body;
  const bc=document.querySelector('.breadcrumb');
  if(bc)bc.innerHTML=`商品中心&nbsp; / &nbsp;<strong id="breadcrumbTitle">${VIEW_TITLE[view]}</strong>`;
  bind();
}

/* ==================== 通用片段 ==================== */
const statusCls=s=>s==='已发布'||s==='启用'||s==='发布成功'?'up':s==='草稿'?'draft':s==='已下架'||s==='停用'?'down':'';
const tag=s=>`<span class="um-status ${statusCls(s)}">${s}</span>`;
const sourceTag=s=>`<span class="um-tag ${s==='租户授权'?'tenant':'self'}">${s}</span>`;
const typeTag=t=>`<span class="um-process ${t==='半成品'?'device':'manual'}">${t}</span>`;
const readonlyNote=t=>`<div class="um-readonly-note" style="margin:0 26px 16px">${t}</div>`;

/* ==================== ① 运营商品 ==================== */
function productPage(){
  const key=ensureOrg(),pend=pendingList(key).length,list=products[key];
  return `<section class="um-card"><div class="um-head"><div><h1>运营商品</h1><p>维护本组织自建及从租户授权同步形成的私域商品</p></div>
  <div class="um-actions"><button class="um-secondary um-sync" id="pcSync">同步商品${pend?`<span class="um-bubble">${pend}</span>`:''}</button><button class="um-primary" id="pcNewProduct">＋ 新建商品</button></div></div>
  <div class="um-org-note">当前组织：<b>${esc(key)}</b>　商品与SKU数据仅属于当前组织；上级组织同步不代表下级组织自动拥有。</div>
  <div class="um-filters">
    <input id="pcKw" placeholder="搜索商品名称或商品编码">
    <select id="pcSource"><option value="">全部来源</option><option>租户授权</option><option>自建</option></select>
    <select id="pcStatus"><option value="">全部状态</option><option>草稿</option><option>已发布</option><option>已下架</option></select>
    <select id="pcType"><option value="">全部形态</option><option>毛菜</option><option>净菜</option><option>半成品</option></select>
    <select id="pcCat"><option value="">全部分类</option>${ALL_CATS.map(c=>`<option>${c.path}</option>`).join('')}</select>
    <button class="um-secondary" id="pcMore">${moreFilters?'收起筛选⌃':'更多筛选⌄'}</button>
    <button class="um-secondary" id="pcReset">重置</button>
  </div>
  ${moreFilters?`<div class="um-more-filters"><label>更新时间（起）<input type="date" id="pcUpFrom"></label><label>更新时间（止）<input type="date" id="pcUpTo"></label><label>SKU数量<select id="pcSkuCount"><option value="">全部</option><option value="has">有SKU</option><option value="none">无SKU</option></select></label><label>标准食材生成状态<select id="pcGen"><option value="">全部</option><option>生成成功</option><option>生成失败</option><option>待生成</option></select></label></div>`:''}
  <div class="um-table-wrap"><table class="um-table"><thead><tr>
    <th>商品信息</th><th>商品形态</th><th>商品分类</th><th>品牌</th><th>SKU</th><th>来源</th><th>状态</th><th>版本</th><th>标准食材生成状态</th><th>更新时间</th><th>操作</th>
  </tr></thead><tbody id="pcProdBody">${list.map(productRow).join('')||`<tr><td colspan="11"><div class="um-empty">暂无符合条件的商品</div></td></tr>`}</tbody></table></div></section>`;
}
function productRow(p,index){
  const key=ensureOrg(),mine=skus[key].filter(s=>s.productCode===p.code);
  const enabled=mine.filter(s=>s.enableStatus==='启用').length;
  // 上游版本变化不在商户端做任何提醒：来源商品同步后即为组织私域对象，不追踪上游最新版本
  return `<tr data-i="${index}" data-kw="${esc((p.name+' '+p.code).toLowerCase())}" data-source="${p.source}" data-status="${p.status}" data-type="${p.type}" data-cat="${esc(p.category)}" data-gen="${esc(p.generateStatus||'')}" data-sku="${mine.length?'has':'none'}" data-updated="${p.updated.slice(0,10)}">
  <td><div class="um-dish"><span class="um-thumb">商品</span><span><b>${esc(p.name)}</b><small>${p.code} · ${esc(p.shortName||'—')}</small></span></div></td>
  <td>${typeTag(p.type)}</td><td>${esc(p.category)}</td><td>${esc(p.brand||'—')}</td>
  <td>${enabled} / ${mine.length}</td>
  <td>${sourceTag(p.source)}</td><td>${tag(p.status)}</td><td><b>${p.version}</b></td>
  <td>${p.type==='半成品'?tag(p.generateStatus||'待生成'):'—'}</td>
  <td><div class="um-update-cell">${esc(p.updatedBy||'—')}<small>${p.updated}</small></div></td>
  <td><div class="um-ops">
    <button class="um-link" data-act="view" data-code="${p.code}">查看</button>
    <button class="um-link" data-act="edit" data-code="${p.code}">编辑</button>
    ${p.status==='已发布'?`<button class="um-link" data-act="off" data-code="${p.code}">下架</button>`:`<button class="um-link" data-act="on" data-code="${p.code}">${p.status==='已下架'?'重新上架':'发布'}</button>`}
    <button class="um-link danger" data-act="del" data-code="${p.code}">删除</button>
  </div></td></tr>`;
}

/* ==================== ② SKU中心 ==================== */
function skuPage(){
  const key=ensureOrg(),list=skus[key],prods=products[key];
  return `<section class="um-card"><div class="um-head"><div><h1>SKU中心</h1><p>维护本组织私域商品的采购、下单与库存 SKU</p></div></div>
  <div class="um-org-note">当前组织：<b>${esc(key)}</b>　SKU 的新增统一在「运营商品 → 编辑 → SKU配置」中完成，本页只做查看与编辑；同步统一由「同步商品」处理。</div>
  <div class="um-filters">
    <input id="pcKw" placeholder="搜索SKU名称、编码或所属商品">
    <select id="pcProd"><option value="">全部商品</option>${prods.map(p=>`<option>${esc(p.name)}</option>`).join('')}</select>
    <select id="pcSource"><option value="">全部来源</option><option>租户授权</option><option>自建</option></select>
    <select id="pcCat"><option value="">全部分类</option>${ALL_CATS.map(c=>`<option>${c.path}</option>`).join('')}</select>
    <select id="pcPub"><option value="">全部发布状态</option><option>草稿</option><option>已发布</option></select>
    <select id="pcEn"><option value="">全部启用状态</option><option>启用</option><option>停用</option></select>
    <button class="um-secondary" id="pcReset">重置</button>
  </div>
  <div class="um-table-wrap"><table class="um-table"><thead><tr>
    <th>SKU信息</th><th>所属商品</th><th>销售规格</th><th>下单单位</th><th>库存基准单位</th><th>来源</th><th>发布状态</th><th>启用状态</th><th>更新时间</th><th>操作</th>
  </tr></thead><tbody id="pcSkuBody">${list.map(skuRow).join('')||`<tr><td colspan="10"><div class="um-empty">暂无符合条件的SKU</div></td></tr>`}</tbody></table></div></section>`;
}
function skuRow(s,index){
  const key=ensureOrg(),p=products[key].find(x=>x.code===s.productCode);
  return `<tr data-i="${index}" data-kw="${esc((s.name+' '+s.code+' '+(p?.name||'')).toLowerCase())}" data-prod="${esc(p?.name||'')}" data-source="${s.source}" data-cat="${esc(p?.category||'')}" data-pub="${s.publishStatus}" data-en="${s.enableStatus}">
  <td><div class="um-dish"><span class="um-thumb">SKU</span><span><b>${esc(s.name)}</b><small>${s.code}</small></span></div></td>
  <td>${esc(p?.name||'—')}</td><td>${esc(s.spec)}</td><td>${esc(s.orderUnit)}</td><td>${esc(s.stockUnit)}</td>
  <td>${sourceTag(s.source)}</td><td>${tag(s.publishStatus)}</td><td>${tag(s.enableStatus)}</td>
  <td><div class="um-update-cell">食堂商品管理员<small>${s.updated}</small></div></td>
  <td><div class="um-ops"><button class="um-link" data-act="view" data-code="${s.code}">查看</button><button class="um-link" data-act="edit" data-code="${s.code}">编辑</button>
  ${s.enableStatus==='启用'?`<button class="um-link danger" data-act="disable" data-code="${s.code}">停用</button>`:`<button class="um-link" data-act="enable" data-code="${s.code}">启用</button>`}</div></td></tr>`;
}

/* ==================== ③ 发布记录 ==================== */
function publishPage(){
  const key=ensureOrg(),list=records[key];
  const people=[...new Set(list.map(r=>r.by))];
  return `<section class="um-card"><div class="um-head"><div><h1>发布记录</h1><p>记录运营商品每次正式发布的历史快照；保存草稿不会产生发布记录</p></div></div>
  <div class="um-org-note">当前组织：<b>${esc(key)}</b>　仅展示本组织私域商品的发布记录，切换组织后随之切换；同步动作不产生发布记录。</div>
  <div class="um-filters">
    <input id="pcKw" placeholder="搜索商品名称或批次号">
    <span class="pc-date-range">发布时间<input type="date" id="pcRecFrom">—<input type="date" id="pcRecTo"></span>
    <select id="pcRecType"><option value="">全部发布类型</option><option>首次发布</option><option>内容修改</option></select>
    <select id="pcRecBy"><option value="">全部发布人</option>${people.map(p=>`<option>${esc(p)}</option>`).join('')}</select>
    <button class="um-secondary" id="pcReset">重置</button>
  </div>
  <div class="um-table-wrap"><table class="um-table" style="min-width:1080px"><thead><tr>
    <th>发布时间</th><th>发布人</th><th>发布商品</th><th>发布类型</th><th>版本变化</th><th>操作</th>
  </tr></thead><tbody id="pcRecBody">${list.map(recordRow).join('')||`<tr><td colspan="6"><div class="um-empty">暂无发布记录</div></td></tr>`}</tbody></table></div></section>`;
}
function recordRow(r,i){
  return `<tr data-i="${i}" data-kw="${esc((r.product+' '+r.productCode+' '+r.no).toLowerCase())}" data-type="${r.type}" data-by="${esc(r.by)}" data-at="${r.at.slice(0,10)}">
  <td><div class="um-update-cell">${esc(r.at)}<small>${r.no}</small></div></td>
  <td>${esc(r.by)}</td>
  <td><div class="um-dish"><span class="um-thumb">商品</span><span><b>${esc(r.product)}</b><small>${r.productCode}</small></span></div></td>
  <td><span class="um-status ${r.type==='首次发布'?'up':'draft'}">${r.type}</span></td>
  <td><b>${r.from} → ${r.to}</b></td>
  <td><div class="um-ops"><button class="um-link" data-act="rec" data-no="${r.no}">查看</button></div></td></tr>`;
}

/* ==================== ④ 品牌库（只读） ==================== */
function brandPage(){
  return `<section class="um-card"><div class="um-head"><div><h1>品牌库</h1><p>品牌由租户统一维护，商户端仅可查看与引用</p></div></div>
  ${readonlyNote('品牌数据来自所属租户，本页不提供新增、编辑、停用或删除操作。')}
  <div class="um-filters"><input id="pcKw" placeholder="搜索品牌名称或编码">
    <select id="pcBrandStatus"><option value="">全部状态</option><option>启用</option><option>停用</option></select>
    <button class="um-secondary" id="pcReset">重置</button></div>
  <div class="um-table-wrap"><table class="um-table" style="min-width:980px"><thead><tr><th>品牌名称</th><th>品牌编码</th><th>关联商品</th><th>状态</th><th>更新时间</th></tr></thead>
  <tbody id="pcBrandBody">${tenantBrands.map(b=>`<tr data-kw="${esc((b.name+' '+b.code).toLowerCase())}" data-status="${b.status}"><td><div class="um-dish"><span class="um-thumb">品牌</span><span><b>${b.name}</b></span></div></td><td>${b.code}</td><td>${b.linked} 个</td><td>${tag(b.status)}</td><td>${b.updated}</td></tr>`).join('')}<tr id="pcBrandEmpty" hidden><td colspan="5"><div class="um-empty">暂无符合条件的品牌</div></td></tr></tbody></table></div></section>`;
}

/* ==================== ⑤ 分类库（只读） ==================== */
function categoryPage(){
  const key=ensureOrg(),list=products[key];
  const rows=categoryNodes.map(n=>{
    const path=catPathOf(n);
    const used=list.filter(p=>p.category===path||p.category.startsWith(path+' / ')).length;
    return `<tr data-kw="${esc((n.name+' '+n.code).toLowerCase())}" data-level="${n.level}" data-status="${n.status}">
      <td><b>${esc(n.name)}</b><small class="pc-sub">${esc(n.note)}</small></td>
      <td>${n.code}</td><td>${LEVEL_NAME[n.level]}</td><td>${esc(n.parent)||'—'}</td>
      <td>${n.level===3?used+' 个':'—'}</td><td>${tag(catEnabled(n)?'启用':'停用')}</td></tr>`;
  }).join('');
  return `<section class="um-card"><div class="um-head"><div><h1>分类库</h1><p>分类由租户统一维护，商户端仅可查看与引用</p></div></div>
  ${readonlyNote('分类数据来自所属租户，本页不提供新增、编辑、停用或删除操作；商品只能选择启用的小类，且其上级中类、大类均为启用。')}
  <div class="um-filters"><input id="pcKw" placeholder="搜索分类名称或编码">
    <select id="pcCatLevel"><option value="">全部分类级别</option><option value="1">一级分类</option><option value="2">二级分类</option><option value="3">三级分类</option></select>
    <select id="pcCatStatus"><option value="">全部状态</option><option>启用</option><option>停用</option></select>
    <button class="um-secondary" id="pcReset">重置</button></div>
  <div class="um-table-wrap"><table class="um-table" style="min-width:1080px"><thead><tr><th>分类名称</th><th>分类编码</th><th>级别</th><th>上级分类</th><th>本组织关联商品</th><th>状态</th></tr></thead>
  <tbody id="pcCatBody">${rows}<tr id="pcCatEmpty" hidden><td colspan="6"><div class="um-empty">暂无符合条件的分类</div></td></tr></tbody></table></div></section>`;
}

/* ==================== 筛选（隐藏行，保留输入焦点） ==================== */
function applyFilters(){
  const v=id=>($('#'+id)?.value||'').trim();
  const kw=v('pcKw').toLowerCase(),source=v('pcSource'),status=v('pcStatus'),type=v('pcType'),cat=v('pcCat');
  if(view==='product'){
    const from=v('pcUpFrom'),to=v('pcUpTo'),skuCount=v('pcSkuCount'),gen=v('pcGen');
    $$('#pcProdBody tr[data-i]').forEach(tr=>{
      const d=tr.dataset;
      let ok=(!kw||d.kw.includes(kw))&&(!source||d.source===source)&&(!status||d.status===status)&&(!type||d.type===type)&&(!cat||d.cat===cat);
      if(ok&&from)ok=d.updated>=from;
      if(ok&&to)ok=d.updated<=to;
      if(ok&&skuCount)ok=d.sku===skuCount;
      if(ok&&gen)ok=d.gen===gen;
      tr.hidden=!ok;
    });
  }else if(view==='sku'){
    const prod=v('pcProd'),pub=v('pcPub'),en=v('pcEn');
    $$('#pcSkuBody tr[data-i]').forEach(tr=>{
      const d=tr.dataset;
      const ok=(!kw||d.kw.includes(kw))&&(!prod||d.prod===prod)&&(!source||d.source===source)&&(!cat||d.cat===cat)&&(!pub||d.pub===pub)&&(!en||d.en===en);
      tr.hidden=!ok;
    });
  }else if(view==='publish'){
    const from=v('pcRecFrom'),to=v('pcRecTo'),type=v('pcRecType'),by=v('pcRecBy');
    $$('#pcRecBody tr[data-i]').forEach(tr=>{
      const d=tr.dataset;
      let ok=(!kw||d.kw.includes(kw))&&(!type||d.type===type)&&(!by||d.by===by);
      if(ok&&from)ok=d.at>=from;
      if(ok&&to)ok=d.at<=to;
      tr.hidden=!ok;
    });
  }else if(view==='brand'){
    const status=v('pcBrandStatus');
    let n=0;
    $$('#pcBrandBody tr').forEach(tr=>{
      if(tr.id==='pcBrandEmpty')return;
      tr.hidden=!((!kw||tr.dataset.kw.includes(kw))&&(!status||tr.dataset.status===status));
      if(!tr.hidden)n++;
    });
    if($('#pcBrandEmpty'))$('#pcBrandEmpty').hidden=n>0;
  }else if(view==='category'){
    const lv=v('pcCatLevel'),status=v('pcCatStatus');
    let n=0;
    $$('#pcCatBody tr').forEach(tr=>{
      if(tr.id==='pcCatEmpty')return;
      tr.hidden=!((!kw||tr.dataset.kw.includes(kw))&&(!lv||tr.dataset.level===lv)&&(!status||tr.dataset.status===status));
      if(!tr.hidden)n++;
    });
    if($('#pcCatEmpty'))$('#pcCatEmpty').hidden=n>0;
  }
}

/* ==================== 抽屉 ==================== */
function ensureDrawer(){
  if($('#pcMask'))return;
  document.body.insertAdjacentHTML('beforeend','<div id="pcMask" class="um-mask"><aside class="um-drawer"><div class="um-drawer-head"><div><h2 id="pcDrawerTitle"></h2><p id="pcDrawerSub"></p></div><button class="um-close" id="pcDrawerClose">×</button></div><div class="um-drawer-body" id="pcDrawerBody"></div><div class="um-drawer-foot" id="pcDrawerFoot"></div></aside></div>');
  $('#pcDrawerClose').onclick=closeDrawer;
  $('#pcMask').addEventListener('click',e=>{if(e.target===$('#pcMask'))closeDrawer()});
}
function openDrawer(title,sub,body,foot){ensureDrawer();$('#pcDrawerTitle').textContent=title;$('#pcDrawerSub').textContent=sub||'';$('#pcDrawerBody').innerHTML=body;$('#pcDrawerFoot').innerHTML=foot||'';$('#pcMask').classList.add('show')}
function closeDrawer(){$('#pcMask')?.classList.remove('show')}
/* 居中弹窗（新建商品的「加工形态 + 关联标准食材」步骤） */
function ensureModal(){
  if($('#pcModal'))return;
  document.body.insertAdjacentHTML('beforeend','<div id="pcModal" class="um-mask pc-modal-mask"><div class="pc-modal"><div class="pc-modal-head"><div><h2 id="pcModalTitle"></h2><p id="pcModalSub"></p></div><button class="um-close" id="pcModalClose">×</button></div><div class="pc-modal-body" id="pcModalBody"></div><div class="pc-modal-foot" id="pcModalFoot"></div></div></div>');
  $('#pcModalClose').onclick=closeModal;
  $('#pcModal').addEventListener('click',e=>{if(e.target===$('#pcModal'))closeModal()});
}
function openModal(t,s,b,f){ensureModal();$('#pcModalTitle').textContent=t;$('#pcModalSub').textContent=s||'';$('#pcModalBody').innerHTML=b;$('#pcModalFoot').innerHTML=f||'';$('#pcModal').classList.add('show')}
function closeModal(){$('#pcModal')?.classList.remove('show')}
/* 变更明细卡片（向导确认步骤与版本差异详情共用） */
function changeCards(changes){
  const diffRow=f=>f.from===undefined
    ?`<div class="pc-diff-row is-add"><span class="pc-diff-name">${esc(f.name)}</span><span class="pc-diff-old">—</span><i>→</i><strong class="pc-diff-new">${esc(f.to)}</strong></div>`
    :`<div class="pc-diff-row"><span class="pc-diff-name">${esc(f.name)}</span><span class="pc-diff-old">${esc(f.from)}</span><i>→</i><strong class="pc-diff-new">${esc(f.to)}</strong></div>`;
  return changes.map((c,i)=>{
    const parts=[
      (c.fields||[]).map(diffRow).join(''),
      (c.added||[]).map(a=>`<div class="pc-added-row">＋ ${esc(a)}</div>`).join(''),
      (c.skus||[]).map(s=>`<div class="pc-sku-diff"><b>${esc(s.name)}</b>${s.fields.map(diffRow).join('')}</div>`).join('')
    ].join('');
    return `<section class="pc-change-card"><header><i>${i+1}</i><div><b>${esc(c.kind)}</b><small>${esc(c.detail)}</small></div></header>${parts||'<div class="pc-change-empty">— 本次无内容 —</div>'}</section>`;
  }).join('');
}

/* ==================== 同步商品 ==================== */
function openSync(){
  const key=ensureOrg();
  selected=new Set();syncView='sku';syncCategory='';
  syncDrawerBody(key);
}
function syncList(key){
  let list=syncable();
  if(syncCategory)list=list.filter(s=>`${s.productType} / ${s.category}`===syncCategory||s.category===syncCategory);
  return list;
}
function syncDrawerBody(key){
  const list=syncList(key);
  const groups=[];
  list.forEach(s=>{
    let g=groups.find(x=>x.productId===s.productId);
    if(!g){g={productId:s.productId,productName:s.productName,productCode:s.productCode,productType:s.productType,category:s.category,skus:[]};groups.push(g)}
    g.skus.push(s);
  });
  const totalSel=selected.size,productsSel=new Set([...selected].map(id=>tenantSkus.find(s=>s.skuId===id)?.productId)).size;
  const blocks=groups.map(g=>{
    const mine=g.skus.filter(s=>!isSynced(key,s.skuId));
    const kw=[g.productName,g.productCode,g.productType,g.category,...g.skus.map(s=>`${s.name} ${s.skuCode} ${s.spec}`)].join(' ').toLowerCase();
    const head=`<div class="pc-sync-group">${esc(g.productName)}<small>${g.productCode} · ${g.productType} · ${esc(g.category)}${syncView==='product'?` · 可同步 ${mine.length} / ${g.skus.length} 个SKU`:''}</small></div>`;
    const inner=syncView==='product'
      ? `<div class="pc-sync-row ${mine.length?'':'is-synced'}"><input type="checkbox" class="pc-prod-check" data-pid="${g.productId}" ${mine.length>0&&mine.every(s=>selected.has(s.skuId))?'checked':''} ${mine.length?'':'disabled'}>
      <div><strong>${esc(g.productName)}</strong><small>勾选本商品将同步其下全部可同步SKU</small></div><div>${mine.map(s=>esc(s.spec)).join('、')||'—'}</div>
      <div>${mine.map(s=>esc(s.orderUnit)).join('、')||'—'}</div><div><span class="um-status draft">${mine[0]?.version||'—'}</span></div><div>${mine.length?'<span class="um-status up">可同步</span>':'<span class="um-status up">已同步</span>'}</div></div>`
      : g.skus.map(s=>{const synced=isSynced(key,s.skuId);return `<div class="pc-sync-row ${synced?'is-synced':''}">
      <input type="checkbox" class="pc-sku-check" value="${s.skuId}" ${synced?'disabled':''} ${selected.has(s.skuId)?'checked':''}>
      <div><strong>${esc(s.name)}</strong><small>${s.skuCode}</small></div>
      <div>${esc(s.spec)}</div><div>${esc(s.orderUnit)} / ${esc(s.stockUnit)}</div>
      <div><strong>${s.batchNo}</strong><small>至 ${s.validTo}</small></div>
      <div>${synced?'<span class="um-status up">已同步</span>':`<span class="um-status draft">上游 ${s.version}</span>`}</div></div>`}).join('');
    return `<div class="pc-sync-block" data-type="${g.productType}" data-kw="${esc(kw)}">${head}${inner}</div>`;
  }).join('');
  const body=`<div class="um-readonly-note">选择租户已授权给当前商户、但尚未同步到当前组织的商品与SKU。同步后形成当前组织自己的商品与SKU。</div>
  <div class="pc-tabs" style="margin-top:16px"><button data-syncview="sku" class="${syncView==='sku'?'active':''}">按SKU</button><button data-syncview="product" class="${syncView==='product'?'active':''}">按商品</button></div>
  <div class="um-sync-layout">
    <aside class="um-category-side"><h3>商品分类</h3>
      <button class="${syncCategory?'':'active'}" data-synccat="">全部商品</button>
      ${ALL_CATS.map(c=>{const n=syncable().filter(s=>s.category===c.path).length;return n?`<button class="${syncCategory===c.path?'active':''}" data-synccat="${esc(c.path)}">${c.small} <small>(${n})</small></button>`:''}).join('')}
    </aside>
    <div>
      <div class="um-sync-tools"><input id="pcSyncKw" placeholder="搜索商品名称、SKU名称或上游编码"><select id="pcSyncType"><option value="">全部形态</option><option>毛菜</option><option>净菜</option><option>半成品</option></select></div>
      <div class="um-select-summary">已选择 <b>${totalSel}</b> 个SKU，涉及 <b>${productsSel}</b> 个商品</div>
      <div class="pc-sync-row head"><span></span><span>SKU信息</span><span>规格</span><span>下单 / 库存单位</span><span>授权批次</span><span>状态</span></div>
      ${blocks||'<div class="pc-sync-empty">暂无可同步数据</div>'}
      <div class="um-readonly-note" style="margin-top:14px">已下架、SKU已停用、授权已撤销以及非「已发布且上架」的商品不进入本列表；已同步的SKU置灰且不可重复同步。</div>
    </div>
  </div>`;
  openDrawer('同步租户授权商品',`当前组织：${org()}`,body,`<button class="um-secondary" id="pcSyncCancel">取消</button><span class="um-spacer"></span><button class="um-primary" id="pcSyncOk" ${totalSel?'':'disabled'}>同步所选商品（${totalSel}）</button>`);
  bindSync(key);
}
function bindSync(key){
  $$('[data-syncview]').forEach(b=>b.onclick=()=>{syncView=b.dataset.syncview;syncDrawerBody(key)});
  $$('[data-synccat]').forEach(b=>b.onclick=()=>{syncCategory=b.dataset.synccat;syncDrawerBody(key)});
  $('#pcSyncCancel').onclick=closeDrawer;
  const filterSync=()=>{
    const kw=($('#pcSyncKw')?.value||'').trim().toLowerCase(),t=$('#pcSyncType')?.value||'';
    $$('#pcDrawerBody .pc-sync-block').forEach(b=>{b.hidden=(!!t&&b.dataset.type!==t)||(!!kw&&!b.dataset.kw.includes(kw))});
  };
  $('#pcSyncKw').oninput=filterSync;
  $('#pcSyncType').onchange=filterSync;
  $$('.pc-sku-check').forEach(c=>c.onchange=()=>{c.checked?selected.add(c.value):selected.delete(c.value);refreshSyncSelection(key)});
  $$('.pc-prod-check').forEach(c=>c.onchange=()=>{
    const pid=c.dataset.pid;
    syncable().filter(s=>s.productId===pid&&!isSynced(key,s.skuId)).forEach(s=>c.checked?selected.add(s.skuId):selected.delete(s.skuId));
    refreshSyncSelection(key);
  });
  $('#pcSyncOk').onclick=()=>doSync(key);
}
function refreshSyncSelection(key){
  const n=selected.size,m=new Set([...selected].map(id=>tenantSkus.find(s=>s.skuId===id)?.productId)).size;
  $('.um-select-summary').innerHTML=`已选择 <b>${n}</b> 个SKU，涉及 <b>${m}</b> 个商品`;
  const ok=$('#pcSyncOk');ok.disabled=!n;ok.textContent=`同步所选商品（${n}）`;
  $$('.pc-prod-check').forEach(c=>{const mine=syncable().filter(s=>s.productId===c.dataset.pid&&!isSynced(key,s.skuId));c.checked=mine.length>0&&mine.every(s=>selected.has(s.skuId))});
}
function doSync(key){
  const picked=[...selected].map(id=>tenantSkus.find(s=>s.skuId===id)).filter(Boolean);
  if(!picked.length)return toast('请至少选择一个SKU');
  let newProducts=0,newSkus=0;const failed=[];
  picked.forEach(s=>{
    // 提交瞬间再次校验
    if(!(s.batchStatus==='生效中'&&s.productStatus==='已上架'&&s.skuStatus==='启用')){failed.push(`${s.name}：源数据已失效`);return}
    if(isSynced(key,s.skuId)){failed.push(`${s.name}：本组织已同步，不可重复同步`);return}
    let p=products[key].find(x=>x.sourceProductId===s.productId);
    if(!p){
      // 同名冲突：不自动追加后缀，要求重新命名
      const clash=products[key].find(x=>x.name===s.productName);
      if(clash){failed.push(`${s.productName}：本组织已存在同名商品，请先重命名`);return}
      p={code:`P${Date.now().toString().slice(-9)}${products[key].length}`,name:s.productName,shortName:s.productName,type:s.productType,ingredients:s.productType==='半成品'?[]:[s.productName.replace(/装$/,'')],category:s.category,brand:s.brand,origin:'—',grade:'—',storage:'—',measure:'重量',stockUnit:s.stockUnit,source:'租户授权',sourceProductId:s.productId,sourceVersion:s.version,status:'草稿',version:'—',generateStatus:s.productType==='半成品'?'待生成':'',updated:'刚刚',updatedBy:'食堂商品管理员'};
      products[key].push(p);newProducts++;
    }
    if(skus[key].some(x=>x.sourceSkuCode===s.skuId)){failed.push(`${s.name}：本组织已同步`);return}
    skus[key].push({code:`S${Date.now().toString().slice(-9)}${skus[key].length}`,name:s.name,productCode:p.code,spec:s.spec,orderUnit:s.orderUnit,stockUnit:s.stockUnit,accept:'按来源规格验收',convert:`1${s.orderUnit} = ${s.spec.replace(/^[\d.]+/,'')||s.stockUnit}`,source:'租户授权',sourceSkuCode:s.skuId,sourceVersion:s.version,publishStatus:'草稿',enableStatus:'启用',updated:'刚刚'});
    syncedOrgs[key].add(s.skuId);newSkus++;
  });
  closeDrawer();
  if(newSkus)toast(`同步完成：新增 ${newProducts} 个商品、${newSkus} 个SKU，均为草稿状态`);
  else if(failed.length)toast(failed[0]);
  if(failed.length&&newSkus)setTimeout(()=>toast(`${failed.length} 个SKU 同步失败：${failed[0]}`),2100);
  render();
}

/* ==================== 商品编辑（对齐租户端：形态弹窗 + 三步向导） ==================== */
const SHAPES=[['毛菜','只能关联一个标准食材'],['净菜','可关联一个或多个标准食材'],['半成品','无需关联标准食材']];
function productBase(){
  return {code:'',name:'',shortName:'',type:'毛菜',ingredients:[],category1:'',category2:'',category3:'',brand:'',image:'',origin:'',grade:'',storage:'常温',measure:'重量',stockUnit:'',source:'自建',status:'草稿',version:'—',generateStatus:'',updated:'刚刚',updatedBy:'食堂商品管理员'};
}
const curCatPath=e=>e.category1&&e.category2&&e.category3?catPath(e.category1,e.category2,e.category3):'';
// 新建：先弹「选择加工形态 + 关联标准食材」，再进入三步向导
function openProductCreate(){
  editor={mode:'new',step:1,draftSkus:[],base:null,baseSkus:[],...productBase()};
  openShapeModal();
}
function openProductEdit(code){
  const key=ensureOrg(),p=products[key].find(x=>x.code===code);
  const parts=String(p.category||'').split(' / ');
  editor={...JSON.parse(JSON.stringify(p)),mode:'edit',step:1,
    ingredients:[...p.ingredients],
    category1:parts[0]||'',category2:parts[1]||'',category3:parts[2]||'',
    draftSkus:JSON.parse(JSON.stringify(skus[key].filter(s=>s.productCode===code))),
    base:JSON.parse(JSON.stringify(p)),baseSkus:JSON.parse(JSON.stringify(skus[key].filter(s=>s.productCode===code)))};
  renderWizard();
}
/* ---------- ① 加工形态与关联标准食材（居中弹窗） ---------- */
function openShapeModal(){
  const e=editor,kw=$('#pcShapeKw')?.value||'',multi=e.type==='净菜';
  const ingBlock=e.type==='半成品'?'':`
    <div class="um-sync-tools"><input id="pcShapeKw" value="${esc(kw)}" placeholder="搜索食材名称、别名或编码"></div>
    <div class="pc-ing-grid">${standardIngredients.map(i=>{
      const on=e.ingredients.includes(i.name),dis=i.status==='停用';
      return `<button type="button" class="pc-ing-card ${on?'active':''}" data-ing="${esc(i.name)}" ${dis?'disabled':''}>
        <i>●</i><span><b>${i.name}</b><small>${i.code} · ${esc(i.category)} · ${esc(i.unit)}</small></span><em>${on?'✓':''}</em></button>`;
    }).join('')}</div>`;
  openModal('新建商品','先确定加工形态，再关联标准食材',`
    <h3 class="pc-modal-step">1. 选择加工形态</h3>
    <div class="pc-shape-grid">${SHAPES.map(([n,d])=>`<button type="button" class="pc-shape-card ${e.type===n?'active':''}" data-shape="${n}"><b>${n}</b><small>${d}</small></button>`).join('')}</div>
    <h3 class="pc-modal-step">2. 关联标准食材${e.type==='半成品'?'':' <em class="pc-picked">已选 '+e.ingredients.length+'</em>'}</h3>
    <p class="pc-modal-hint">${e.type==='半成品'?'半成品无需关联标准食材，发布后由平台侧生成对应标准食材。':e.type==='毛菜'?'请选择一个标准食材：':'请选择一个或多个标准食材：'}</p>
    ${ingBlock}
    <div class="um-readonly-note" style="margin-top:14px">标准食材来自全平台标准食材库，商户端只读，不可新增或编辑。</div>`,
    `<button class="um-secondary" id="pcModalCancel">取消</button><span class="um-spacer"></span><button class="um-primary" id="pcShapeNext">下一步：填写商品信息</button>`);
  $$('#pcModalBody [data-shape]').forEach(b=>b.onclick=()=>{
    e.type=b.dataset.shape;
    if(e.type==='半成品')e.ingredients=[];
    else if(e.type==='毛菜')e.ingredients=e.ingredients.slice(0,1);
    openShapeModal();
  });
  $$('#pcModalBody [data-ing]').forEach(b=>b.onclick=()=>{
    const n=b.dataset.ing;
    if(multi)e.ingredients.includes(n)?e.ingredients=e.ingredients.filter(x=>x!==n):e.ingredients.push(n);
    else e.ingredients=e.ingredients[0]===n?[]:[n];
    if(!e.stockUnit){const i=standardIngredients.find(x=>x.name===n);if(i&&/千克/.test(i.unit))e.stockUnit='千克'}
    openShapeModal();
  });
  if($('#pcShapeKw'))$('#pcShapeKw').oninput=()=>{const k=$('#pcShapeKw').value.trim().toLowerCase();$$('#pcModalBody [data-ing]').forEach(b=>{b.hidden=!!k&&!b.dataset.ing.toLowerCase().includes(k)})};
  $('#pcModalCancel').onclick=()=>{closeModal();editor=null};
  $('#pcShapeNext').onclick=()=>{
    if(e.type!=='半成品'&&!e.ingredients.length)return toast(e.type==='毛菜'?'毛菜需关联 1 个标准食材':'净菜需关联 1 个及以上标准食材');
    closeModal();renderWizard();
  };
}

/* ---------- ② 三步向导 ---------- */
const wizardSteps=e=>e.mode==='edit'&&e.base&&e.base.status==='已发布'?['商品信息','SKU配置','变更确认']:['商品信息','SKU配置','发布确认'];
function renderWizard(){
  const e=editor,steps=wizardSteps(e);
  const bar=`<div class="pc-steps">${steps.map((s,i)=>{
    const n=i+1;
    return `<div class="pc-step ${e.step===n?'active':''} ${e.step>n?'done':''}"><i>${e.step>n?'✓':n}</i><span>${s}</span></div>${i<steps.length-1?'<em class="pc-step-line"></em>':''}`;
  }).join('')}</div>`;
  const sub=e.mode==='new'?`关联食材：${e.type==='半成品'?'无需关联':(e.ingredients.join('、')||'—')}`:`${e.name} · ${e.code}`;
  openDrawer(e.mode==='new'?'新建商品':`编辑商品 · ${e.name}`,sub,
    bar+(e.step===1?stepInfo():e.step===2?stepSku():stepConfirm()),
    `<button class="um-secondary" id="pcCancel">取消</button><span class="um-spacer"></span>`
    +(e.step>1?'<button class="um-secondary" id="pcPrev">上一步</button>':'')
    +(e.mode==='new'&&e.step===1?'<button class="um-secondary" id="pcSaveDraft">保存草稿</button>':'')
    +(e.step<3?'<button class="um-primary" id="pcNext">下一步</button>'
      :`<button class="um-primary" id="pcConfirm">${steps[2]==='变更确认'?'确认变更并生成新版本':'发布并生成新版本'}</button>`));
  bindWizard();
}
function stepInfo(){
  const e=editor,first=standardIngredients.find(x=>x.name===e.ingredients[0]);
  const ingBanner=e.type==='半成品'
    ? `<div class="pc-source-banner"><i>◈</i><div><b>无需关联标准食材</b><small>半成品发布后由平台侧生成对应标准食材，本页仅记录商品信息。</small></div><span class="pc-readonly-tag">仅作来源信息</span></div>`
    : `<div class="pc-source-banner"><i>◈</i><div><b>关联标准食材：${esc(e.ingredients.join('、'))}</b><small>标准食材分类：${esc(first?.category||'—')} · 共 ${e.ingredients.length} 项关联食材</small></div><span class="pc-readonly-tag">仅作来源信息</span></div>`;
  return `${ingBanner}
  <section class="um-section"><h3>商品基础信息 <em class="pc-section-hint">请完善必填项</em></h3><div class="um-edit-grid">
    <label>商品编码<div class="pc-locked-value"><span>${e.code||'保存后系统生成'}</span></div></label>
    <label><span>商品名称 <em class="pc-req">*</em></span><input id="pcName" value="${esc(e.name)}" placeholder="请输入"></label>
    <label>商品简称<input id="pcShort" value="${esc(e.shortName||'')}" placeholder="请输入"></label>
    <label>加工形态<div class="pc-locked-value"><span>${e.type}</span><em class="plain">创建时已确定</em></div></label>
    <label class="full"><span>商品分类 <em class="pc-req">*</em></span><div class="pc-cascade">
      <select id="pcCat1"><option value="">请选择一级分类</option>${cat1().map(c=>`<option ${e.category1===c.name?'selected':''}>${c.name}</option>`).join('')}</select>
      <select id="pcCat2" ${e.category1?'':'disabled'}><option value="">请选择二级分类</option>${cat2(e.category1).map(c=>`<option ${e.category2===c.name?'selected':''}>${c.name}</option>`).join('')}</select>
      <select id="pcCat3" ${e.category2?'':'disabled'}><option value="">请选择三级分类</option>${cat3(e.category2).map(c=>`<option ${e.category3===c.name?'selected':''}>${c.name}</option>`).join('')}</select>
    </div><small class="pc-hint">来自租户分类库，一级、二级仅作目录，必须选择启用的三级分类；保存分类路径快照</small></label>
    <label>品牌<select id="pcBrand"><option value="">不指定</option>${tenantBrands.filter(b=>b.status==='启用').map(b=>`<option ${e.brand===b.name?'selected':''}>${b.name}</option>`).join('')}${e.brand&&!tenantBrands.some(b=>b.name===e.brand&&b.status==='启用')?`<option selected>${esc(e.brand)}</option>`:''}</select><small class="pc-hint">来自租户品牌库，保存名称快照</small></label>
    <label class="full">商品图片<div class="pc-upload" id="pcUpload"><b>＋</b><span>${e.image?'已选择 1 张图片':'上传图片'}</span><small>支持 JPG、PNG、WebP，仅限 1 张</small></div></label>
    <label>产地<input id="pcOrigin" value="${esc(e.origin||'')}" placeholder="请输入"></label>
    <label>等级<input id="pcGrade" value="${esc(e.grade||'')}" placeholder="请输入"></label>
    <label>储存方式<select id="pcStorage">${['常温','冷藏','冷冻'].map(v=>`<option ${e.storage===v?'selected':''}>${v}</option>`).join('')}</select></label>
  </div></section>
  <section class="um-section"><h3>计量属性 <em class="pc-section-hint">请完善必填项</em></h3><div class="um-edit-grid">
    <label><span>计量维度 <em class="pc-req">*</em></span><select id="pcMeasure">${['重量','体积','数量'].map(v=>`<option ${e.measure===v?'selected':''}>${v}</option>`).join('')}</select><small class="pc-hint">默认取关联标准食材维度，允许修改</small></label>
    <label><span>库存基准单位 <em class="pc-req">*</em></span><select id="pcStockUnit"><option value="">请选择</option>${['千克','克','升','毫升','个'].map(v=>`<option ${e.stockUnit===v?'selected':''}>${v}</option>`).join('')}</select><small class="pc-hint">选项随计量维度联动，SKU 统一继承</small></label>
  </div></section>`;
}
function stepSku(){
  const e=editor,list=e.draftSkus;
  const on=list.filter(s=>s.enableStatus==='启用').length,pub=list.filter(s=>s.publishStatus==='已发布').length;
  return `<section class="um-section"><div class="pc-section-head"><div><h3>已配置SKU</h3><p>SKU 是采购、下单与库存的统一身份；商品发布前至少需要 1 个启用且配置完整的 SKU。</p></div><button class="um-primary" type="button" id="pcAddSku">＋ 新增SKU</button></div>
  <div class="pc-metric-row"><span><b>${list.length}</b> 全部SKU</span><span><b>${on}</b> 启用</span><span><b>${list.length-on}</b> 停用</span><span><b>${pub}</b> 已发布</span><em>同一商品的 SKU 统一归集到该商品</em></div>
  <div class="pc-sku-lines"><div class="pc-sku-line head"><span>SKU信息</span><span>销售规格</span><span>下单单位</span><span>换算关系</span><span>发布 / 启用</span><span>操作</span></div>
  ${list.length?list.map((s,i)=>`<div class="pc-sku-line"><div><strong>${esc(s.name)}</strong><small>${esc(s.code||'保存后生成')}</small></div><span>${esc(s.spec||'—')}</span><span>${esc(s.orderUnit||'—')}</span><span>${esc(s.convert||'—')}</span><span>${tag(s.publishStatus)} ${tag(s.enableStatus)}</span>
    <div class="um-ops"><button class="um-link" type="button" data-skuedit="${i}">编辑</button><button class="um-link danger" type="button" data-skudel="${i}">删除</button></div></div>`).join(''):'<div class="pc-sku-line"><span style="grid-column:1/-1;color:#94a3b5">尚未配置SKU；商品发布前至少需要 1 个启用且配置完整的SKU。</span></div>'}
  </div></section>`;
}
function stepConfirm(){
  const e=editor,c=computeChanges(),change=wizardSteps(e)[2]==='变更确认';
  const cards=[[change?'商品信息修改':'商品信息',c.counts.info+' 项'],['新增SKU',c.counts.added+' 个'],['修改SKU',c.counts.modified+' 个'],['停用SKU',c.counts.stopped+' 个']];
  return `<section class="um-section"><div class="pc-confirm-head"><i>↻</i><div><h3>${change?'请确认本次商品变更':'请确认本次商品发布'}</h3><p>${change?'以下内容按变更类型归类展示，请逐项确认。':'首次发布，以下内容将作为正式版本 V1。'}</p></div><span class="pc-version-chip">${change?`${e.version} → ${bump(e.version)}`:'— → V1'}</span></div>
    <div class="pc-metric-cards">${cards.map(([k,v])=>`<div><span>${k}</span><b>${v}</b></div>`).join('')}</div>
    <h3 class="pc-change-title">变更明细</h3>${changeCards(c.changes)}</section>`;
}
function captureWizard(){
  const g=id=>{const el=$('#'+id);return el?el.value.trim():undefined};
  ['pcName:name','pcShort:shortName','pcOrigin:origin','pcGrade:grade','pcStorage:storage','pcMeasure:measure','pcStockUnit:stockUnit','pcBrand:brand','pcCat1:category1','pcCat2:category2','pcCat3:category3'].forEach(m=>{const [id,k]=m.split(':');const v=g(id);if(v!==undefined)editor[k]=v});
}
function validateInfo(){
  captureWizard();
  const e=editor,key=ensureOrg();
  if(!e.name)return '请填写商品名称';
  if(!e.category1||!e.category2||!e.category3)return '请选择商品分类的三级分类';
  if(!e.stockUnit)return '请选择库存基准单位';
  if(products[key].some(p=>p.name===e.name&&p.code!==(e.code||'')))return `本组织已存在同名商品「${e.name}」，请重新命名`;
  return '';
}
// 变更差异：首次发布=全部新增；已发布商品=商品字段差异 + SKU 新增/修改/停用
function computeChanges(){
  const e=editor,first=!(e.base&&e.base.status==='已发布');
  const cur={name:e.name,shortName:e.shortName||'',type:e.type,category:curCatPath(e),brand:e.brand||'',origin:e.origin||'',grade:e.grade||'',storage:e.storage,measure:e.measure,stockUnit:e.stockUnit};
  const F=[['name','商品名称'],['shortName','商品简称'],['type','加工形态'],['category','商品分类'],['brand','品牌'],['origin','产地'],['grade','等级'],['storage','储存方式'],['measure','计量维度'],['stockUnit','库存基准单位']];
  const infoFields=first
    ? F.filter(([k])=>cur[k]).map(([k,n])=>({name:n,to:String(cur[k])}))
    : F.filter(([k])=>String(e.base[k]??'')!==String(cur[k]??'')).map(([k,n])=>({name:n,from:String(e.base[k]??'')||'—',to:String(cur[k]??'')||'—'}));
  const baseByCode=new Map(e.baseSkus.map(s=>[s.code,s]));
  const added=[],modified=[],stopped=[];
  e.draftSkus.forEach(s=>{
    const b=s.code?baseByCode.get(s.code):null;
    if(!b){added.push(s.name||'未命名SKU');return}
    const fields=[['name','SKU名称'],['spec','销售规格'],['orderUnit','下单单位'],['stockUnit','库存基准单位'],['accept','验收规则'],['convert','换算关系']]
      .filter(([k])=>String(b[k]??'')!==String(s[k]??'')).map(([k,n])=>({name:n,from:String(b[k]??'')||'—',to:String(s[k]??'')||'—'}));
    if(fields.length)modified.push({name:s.name,fields});
    if(b.enableStatus==='启用'&&s.enableStatus==='停用')stopped.push(s.name);
  });
  const changes=first
    ? [{kind:'商品信息',detail:'首次发布，以下字段为本次新增',fields:infoFields,added:[]},
       {kind:'新增SKU',detail:added.length?`共新增 ${added.length} 个SKU`:'本次未新增SKU',fields:[],added}]
    : [{kind:'商品信息修改',detail:infoFields.length?`共 ${infoFields.length} 个字段发生变化`:'本次未修改商品信息',fields:infoFields,added:[]},
       {kind:'新增SKU',detail:added.length?`共新增 ${added.length} 个SKU`:'本次未新增SKU',fields:[],added},
       {kind:'修改SKU',detail:modified.length?`共修改 ${modified.length} 个SKU`:'本次未修改SKU',fields:[],skus:modified},
       {kind:'停用SKU',detail:stopped.length?`共停用 ${stopped.length} 个SKU`:'本次未停用SKU',fields:[],added:stopped}];
  return {first,changes,counts:{info:infoFields.length,added:added.length,modified:modified.length,stopped:stopped.length}};
}
function bindWizard(){
  $('#pcCancel').onclick=()=>{closeDrawer();editor=null};
  if($('#pcNext'))$('#pcNext').onclick=()=>{
    if(editor.step===1){const err=validateInfo();if(err)return toast(err)}
    editor.step++;renderWizard();
  };
  if($('#pcPrev'))$('#pcPrev').onclick=()=>{captureWizard();editor.step--;renderWizard()};
  if($('#pcSaveDraft'))$('#pcSaveDraft').onclick=()=>commitProduct(false);
  if($('#pcConfirm'))$('#pcConfirm').onclick=()=>{const err=validateInfo();if(err)return toast(err);commitProduct(true)};
  ['pcCat1','pcCat2','pcCat3'].forEach(id=>{const el=$('#'+id);if(el)el.onchange=()=>{
    captureWizard();
    if(id==='pcCat1'){editor.category2='';editor.category3=''}
    if(id==='pcCat2'){editor.category3=''}
    renderWizard();
  }});
  $$('[data-skuedit]').forEach(b=>b.onclick=()=>openDraftSku(+b.dataset.skuedit));
  $$('[data-skudel]').forEach(b=>b.onclick=()=>{const i=+b.dataset.skudel;
    if(!confirm(`确认删除SKU「${editor.draftSkus[i].name}」？`))return;
    editor.draftSkus.splice(i,1);toast('SKU已删除');renderWizard()});
  if($('#pcAddSku'))$('#pcAddSku').onclick=()=>openDraftSku(null);
}
function commitProduct(publish){
  const err=validateInfo();if(err)return toast(err);
  const key=ensureOrg(),e=editor;
  const ready=e.draftSkus.filter(s=>s.enableStatus==='启用'&&s.name&&s.spec&&s.orderUnit);
  if(publish&&!ready.length)return toast('发布失败：至少需要 1 个启用且配置完整的SKU');
  const existing=e.code?products[key].find(p=>p.code===e.code):null;
  const code=existing?existing.code:`P${Date.now().toString().slice(-9)}`;
  const prev=existing?existing.version:'—';
  const wasPublished=!!(existing&&existing.status==='已发布');
  const ch=computeChanges();
  const target={code,name:e.name,shortName:e.shortName||'',type:e.type,ingredients:[...e.ingredients],category:curCatPath(e),
    brand:e.brand||'',origin:e.origin||'',grade:e.grade||'',storage:e.storage,measure:e.measure,stockUnit:e.stockUnit,
    source:existing?existing.source:'自建',
    sourceProductId:existing?.sourceProductId,sourceVersion:existing?.sourceVersion,
    status:publish||wasPublished?'已发布':'草稿',
    version:publish?(wasPublished?bump(prev):'V1'):(wasPublished?prev:'—'),
    generateStatus:e.type==='半成品'?(publish?'生成成功':(existing?.generateStatus||'待生成')):'',
    updated:'刚刚',updatedBy:'食堂商品管理员'};
  if(existing)Object.assign(existing,target);else products[key].push(target);
  // SKU 以向导内的草稿清单为准整体落地
  const finalSkus=e.draftSkus.map((s,n)=>({...s,
    code:s.code||`S${Date.now().toString().slice(-9)}${n}`,
    productCode:code,
    source:s.source||'自建',
    publishStatus:publish&&ready.includes(s)?'已发布':(s.publishStatus||'草稿'),
    updated:'刚刚'}));
  skus[key]=skus[key].filter(s=>s.productCode!==code).concat(finalSkus);
  if(publish)records[key].unshift({no:recordNo(records[key]),at:nowStr(),by:'食堂商品管理员',product:target.name,productCode:code,
    type:wasPublished?'内容修改':'首次发布',from:wasPublished?prev:'—',to:target.version,changes:ch.changes});
  const msg=publish?`「${target.name}」已发布为 ${target.version}`:(wasPublished?'变更已保存':'商品草稿已保存');
  closeDrawer();editor=null;render();toast(msg);
}
// 向导内的 SKU 表单（idx=null 表示新增）
function openDraftSku(idx){
  const e=editor,isNew=idx===null;
  const s=isNew?{code:'',name:'',spec:'',orderUnit:'袋',stockUnit:e.stockUnit||'',accept:'',convert:'',source:'自建',publishStatus:'草稿',enableStatus:'启用'}:{...e.draftSkus[idx]};
  skuForm(s,{title:isNew?'新增SKU':`编辑SKU · ${s.name}`,sub:`所属商品：${e.name||'未命名'} ${e.code||'（保存后生成）'}`,
    onCancel:()=>renderWizard(),
    onDone:saved=>{
      if(e.draftSkus.some((x,i)=>i!==idx&&x.name===saved.name))return toast('同一商品下已存在同名SKU');
      if(isNew)e.draftSkus.push(saved);else e.draftSkus[idx]=saved;
      toast('SKU已保存');renderWizard();
    }});
}
const bump=v=>/^V(\d+)$/.test(v||'')?`V${Number(v.slice(1))+1}`:'V1';
const pad2=n=>String(n).padStart(2,'0');
const nowStr=()=>{const d=new Date();return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`};
// 发布批次号：PUB + 年月日 + 当日序号（与租户端 PUB20260812001 同构）
const recordNo=list=>{const d=new Date(),day=`${d.getFullYear()}${pad2(d.getMonth()+1)}${pad2(d.getDate())}`;return `PUB${day}${String(list.filter(r=>String(r.no).startsWith('PUB'+day)).length+1).padStart(3,'0')}`};

/* ==================== SKU 表单（向导内新增/编辑 与 SKU中心编辑 共用） ==================== */
function skuForm(sku,opts){
  openDrawer(opts.title,opts.sub,`<section class="um-section"><h3>SKU信息 <em class="pc-section-hint">请完善必填项</em></h3><div class="um-edit-grid">
    <label><span>SKU名称 <em class="pc-req">*</em></span><input id="psName" value="${esc(sku.name)}" placeholder="如：山东一级土豆 5kg装"></label>
    <label><span>销售规格 <em class="pc-req">*</em></span><input id="psSpec" value="${esc(sku.spec)}" placeholder="如：5kg/袋"></label>
    <label><span>下单单位 <em class="pc-req">*</em></span><select id="psOrder">${['件','袋','箱','包','桶'].map(v=>`<option ${sku.orderUnit===v?'selected':''}>${v}</option>`).join('')}</select></label>
    <label>库存基准单位<select id="psStock">${['千克','克','升','毫升','个'].map(v=>`<option ${sku.stockUnit===v?'selected':''}>${v}</option>`).join('')}</select><small class="pc-hint">默认继承商品库存基准单位</small></label>
    <label class="full">验收规则<input id="psAccept" value="${esc(sku.accept||'')}" placeholder="如：按袋下单 · 实际称重验收"></label>
    <label class="full">换算关系<input id="psConvert" value="${esc(sku.convert||'')}" placeholder="如：1袋 = 5千克"></label>
    <label>启用状态<select id="psEnable">${['启用','停用'].map(v=>`<option ${sku.enableStatus===v?'selected':''}>${v}</option>`).join('')}</select></label>
    <label>来源<div class="pc-locked-value"><span>${sku.source}</span><em class="plain">系统判定</em></div></label>
  </div></section>`,`<button class="um-secondary" id="psCancel">取消</button><span class="um-spacer"></span><button class="um-primary" id="psSave">保存</button>`);
  $('#psCancel').onclick=opts.onCancel;
  $('#psSave').onclick=()=>{
    const g=id=>$('#'+id).value.trim();
    const saved={...sku,name:g('psName'),spec:g('psSpec'),orderUnit:$('#psOrder').value,stockUnit:$('#psStock').value,accept:g('psAccept'),convert:g('psConvert'),enableStatus:$('#psEnable').value};
    if(!saved.name||!saved.spec||!saved.orderUnit)return toast('请填写SKU名称、销售规格与下单单位');
    opts.onDone(saved);
  };
}
// SKU中心只能编辑既有 SKU，新增入口统一在「运营商品 → 编辑 → SKU配置」
function openSkuEdit(code){
  const key=ensureOrg(),existing=skus[key].find(s=>s.code===code);
  if(!existing)return;
  const p=products[key].find(x=>x.code===existing.productCode);
  skuForm({...existing},{title:`编辑SKU · ${existing.name}`,sub:`所属商品：${p?.name||'—'} · ${p?.code||''}`,
    onCancel:()=>{closeDrawer();render()},
    onDone:saved=>{
      if(skus[key].some(x=>x.code!==code&&x.productCode===existing.productCode&&x.name===saved.name))return toast('同一商品下已存在同名SKU');
      Object.assign(existing,saved,{updated:'刚刚'});closeDrawer();render();toast('SKU已保存');
    }});
}

/* ==================== 详情 / 记录 ==================== */
function openProductDetail(code){
  const key=ensureOrg(),p=products[key].find(x=>x.code===code),mine=skus[key].filter(s=>s.productCode===code);
  const src=p.source==='租户授权'
    ? `<section class="um-section"><h3>来源追溯</h3><div class="um-readonly-note">上游商品与SKU编码仅在后端保存用于追溯与对账，不在前端展示。</div><div class="um-detail-grid" style="margin-top:12px">
        <div class="um-detail-field"><span>来源类型</span><b>租户授权</b></div>
        <div class="um-detail-field"><span>来源租户</span><b>市教育餐饮服务中心</b></div>
        <div class="um-detail-field"><span>同步时的上游版本</span><b>${p.sourceVersion||'—'}</b></div>
        <div class="um-detail-field"><span>上游版本变化</span><b>不追踪、不提醒</b></div>
        <div class="um-detail-field"><span>授权批次</span><b>PA20260910001</b></div>
        <div class="um-detail-field"><span>授权有效期</span><b>2027-12-31</b></div></div></section>`
    : `<section class="um-section"><h3>来源追溯</h3><div class="um-detail-field"><span>来源类型</span><b>自建</b></div></section>`;
  openDrawer('商品详情',`${p.name} · ${p.code}`,`
    <section class="um-section"><h3>基本信息</h3><div class="um-detail-grid">
      <div class="um-detail-field"><span>商品名称</span><b>${esc(p.name)}</b></div>
      <div class="um-detail-field"><span>商品简称</span><b>${esc(p.shortName||'—')}</b></div>
      <div class="um-detail-field"><span>加工形态</span><b>${p.type}</b></div>
      <div class="um-detail-field"><span>商品分类</span><b>${esc(p.category)}</b></div>
      <div class="um-detail-field"><span>品牌</span><b>${esc(p.brand||'—')}</b></div>
      <div class="um-detail-field"><span>关联标准食材</span><b>${p.type==='半成品'?'半成品无需关联':esc(p.ingredients.join('、')||'—')}</b></div>
      <div class="um-detail-field"><span>产地 / 等级</span><b>${esc(p.origin||'—')} / ${esc(p.grade||'—')}</b></div>
      <div class="um-detail-field"><span>储存方式</span><b>${esc(p.storage||'—')}</b></div>
      <div class="um-detail-field"><span>计量维度</span><b>${esc(p.measure||'—')}</b></div>
      <div class="um-detail-field"><span>库存基准单位</span><b>${esc(p.stockUnit||'—')}</b></div>
      <div class="um-detail-field"><span>状态 / 版本</span><b>${p.status} / ${p.version}</b></div>
      <div class="um-detail-field"><span>标准食材生成状态</span><b>${p.type==='半成品'?(p.generateStatus||'待生成'):'—'}</b></div>
    </div></section>
    <section class="um-section"><h3>SKU（${mine.length}）</h3><div class="pc-sku-lines"><div class="pc-sku-line head"><span>SKU信息</span><span>销售规格</span><span>下单单位</span><span>发布 / 启用</span><span>来源</span></div>
    ${mine.length?mine.map(s=>`<div class="pc-sku-line"><div><strong>${esc(s.name)}</strong><small style="display:block;color:#95a3b3">${s.code}</small></div><span>${esc(s.spec)}</span><span>${esc(s.orderUnit)}</span><span>${tag(s.publishStatus)} ${tag(s.enableStatus)}</span><span>${sourceTag(s.source)}</span></div>`).join(''):'<div class="pc-sku-line"><span style="grid-column:1/-1;color:#94a3b5">暂无SKU</span></div>'}
    </div></section>${src}`,
    `<button class="um-secondary" id="pcDetailClose">关闭</button><span class="um-spacer"></span><button class="um-primary" id="pcDetailEdit">编辑</button>`);
  $('#pcDetailClose').onclick=closeDrawer;
  $('#pcDetailEdit').onclick=()=>openProductEdit(code);
}
function openSkuDetail(code){
  const key=ensureOrg(),s=skus[key].find(x=>x.code===code),p=products[key].find(x=>x.code===s.productCode);
  openDrawer('SKU详情',`${s.name} · ${s.code}`,`<section class="um-section"><h3>SKU信息</h3><div class="um-detail-grid">
    <div class="um-detail-field"><span>所属商品</span><b>${esc(p?.name||'—')}</b></div>
    <div class="um-detail-field"><span>销售规格</span><b>${esc(s.spec)}</b></div>
    <div class="um-detail-field"><span>下单单位</span><b>${esc(s.orderUnit)}</b></div>
    <div class="um-detail-field"><span>库存基准单位</span><b>${esc(s.stockUnit)}</b></div>
    <div class="um-detail-field"><span>验收规则</span><b>${esc(s.accept||'—')}</b></div>
    <div class="um-detail-field"><span>换算关系</span><b>${esc(s.convert||'—')}</b></div>
    <div class="um-detail-field"><span>发布状态</span><b>${s.publishStatus}</b></div>
    <div class="um-detail-field"><span>启用状态</span><b>${s.enableStatus}</b></div>
    <div class="um-detail-field"><span>来源</span><b>${s.source}</b></div>
    <div class="um-detail-field"><span>同步时的上游版本</span><b>${s.sourceVersion||'—'}</b></div>
  </div>${s.source==='租户授权'?'<div class="um-readonly-note" style="margin-top:12px">上游SKU编码仅用于追溯与对账，不在前端展示。</div>':''}</section>`,
    `<button class="um-secondary" id="pcDetailClose">关闭</button>`);
  $('#pcDetailClose').onclick=closeDrawer;
}
function openRecord(no){
  const key=ensureOrg(),r=records[key].find(x=>x.no===no);
  if(!r)return;
  openDrawer('版本差异详情',`${r.product} · ${r.from} → ${r.to}`,`
    <div class="pc-record-summary">
      <div class="um-detail-field"><span>发布时间</span><b>${esc(r.at)}</b></div>
      <div class="um-detail-field"><span>发布人</span><b>${esc(r.by)}</b></div>
      <div class="um-detail-field"><span>发布类型</span><b>${esc(r.type)}</b></div>
      <div class="um-detail-field"><span>发布商品</span><b>${esc(r.product)}（${r.productCode}）</b></div>
    </div>
    <div class="um-readonly-note">${r.type==='首次发布'?'首次发布，展示本次发布的全部内容；保存草稿不产生发布记录。':`仅展示 ${r.from} 与 ${r.to} 之间发生变化的内容。`}</div>
    <h3 class="pc-change-title">变更明细</h3>${changeCards(r.changes)}`,
    `<button class="um-secondary" id="pcDetailClose">关闭</button>`);
  $('#pcDetailClose').onclick=closeDrawer;
}

/* ==================== 绑定 ==================== */
function bind(){
  if(view==='product'){
    $('#pcSync').onclick=openSync;
    $('#pcNewProduct').onclick=openProductCreate;
    $$('#pcProdBody [data-act]').forEach(b=>b.onclick=()=>{
      const key=ensureOrg(),code=b.dataset.code,p=products[key].find(x=>x.code===code);
      if(b.dataset.act==='view')return openProductDetail(code);
      if(b.dataset.act==='edit')return openProductEdit(code);
      if(b.dataset.act==='del'){if(!confirm(`确认删除商品「${p.name}」？仅删除本组织私域数据，不影响租户与其他组织。`))return;products[key]=products[key].filter(x=>x.code!==code);skus[key]=skus[key].filter(s=>s.productCode!==code);toast('商品已删除');render();return}
      if(b.dataset.act==='off'){p.status='已下架';toast('商品已下架');render();return}
      if(b.dataset.act==='on'){const mine=skus[key].filter(s=>s.productCode===code&&s.enableStatus==='启用');
        if(!mine.length)return toast('至少需要 1 个启用的SKU才能发布');
        const first=p.version==='—';
        p.status='已发布';
        if(first){
          // 首次发布才生成发布记录；单纯上下架属状态操作，不生成记录（PRD 8.6 / 9.2）
          p.version='V1';
          records[key].unshift({no:recordNo(records[key]),at:nowStr(),by:'食堂商品管理员',product:p.name,productCode:p.code,
            type:'首次发布',from:'—',to:'V1',
            changes:[{kind:'商品信息',detail:'首次发布，以下字段为本次新增',fields:[{name:'商品名称',to:p.name},{name:'加工形态',to:p.type},{name:'商品分类',to:p.category}],added:[]},
                     {kind:'新增SKU',detail:`共新增 ${mine.length} 个SKU`,fields:[],added:mine.map(s=>s.name)}]});
        }
        skus[key].filter(s=>s.productCode===code).forEach(s=>{if(s.publishStatus==='草稿')s.publishStatus='已发布'});
        toast('商品已发布');render();return}
    });
  }else if(view==='sku'){
    $$('#pcSkuBody [data-act]').forEach(b=>b.onclick=()=>{
      const key=ensureOrg(),s=skus[key].find(x=>x.code===b.dataset.code);
      if(b.dataset.act==='view')return openSkuDetail(s.code);
      if(b.dataset.act==='edit')return openSkuEdit(s.code);
      if(b.dataset.act==='disable'){if(!confirm(`确认停用SKU「${s.name}」？`))return;s.enableStatus='停用';toast('SKU已停用');render();return}
      if(b.dataset.act==='enable'){s.enableStatus='启用';toast('SKU已启用');render()}
    });
  }else if(view==='publish'){
    $$('[data-act="rec"]').forEach(b=>b.onclick=()=>openRecord(b.dataset.no));
  }
  if($('#pcKw'))$('#pcKw').oninput=applyFilters;
  ['pcSource','pcStatus','pcType','pcCat','pcProd','pcPub','pcEn','pcUpFrom','pcUpTo','pcSkuCount','pcGen',
   'pcRecFrom','pcRecTo','pcRecType','pcRecBy','pcBrandStatus','pcCatLevel','pcCatStatus']
    .forEach(id=>{const el=$('#'+id);if(el)el.onchange=applyFilters});
  if($('#pcMore'))$('#pcMore').onclick=()=>{moreFilters=!moreFilters;const vals={};['pcKw','pcSource','pcStatus','pcType','pcCat'].forEach(i=>vals[i]=$('#'+i)?.value||'');render();Object.entries(vals).forEach(([i,v])=>{const el=$('#'+i);if(el)el.value=v});applyFilters()};
  if($('#pcReset'))$('#pcReset').onclick=()=>{render()};
}

/* ==================== 启动 ==================== */
function boot(){mountNav();ensureOrg();}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
window.merchantProductCenter={enter,openSync,state:()=>({products,skus,records,syncedOrgs})};
})();
