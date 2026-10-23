(()=>{
  const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)],esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const categories=[['热菜',['大荤','小荤','半荤半素','素菜']],['汤粥',['汤类','粥类']],['主食',['米饭','面食','点心']],['其他',['水果']]];
  /* ===== 就餐人数测算口径：哪些二级分类不计入「预计满足 N 人就餐」 =====
     商户级一份，缺省全部计入；排餐计划模块读同一个 localStorage 键。 */
  const CAT_SKIP_KEY='mp:catskip:v1';
  const catSkipState=()=>{try{const raw=JSON.parse(localStorage.getItem(CAT_SKIP_KEY)||'{}');return new Set(Array.isArray(raw?.excluded)?raw.excluded.filter(Boolean):[])}catch(e){return new Set()}};
  const saveCatSkip=set=>{localStorage.setItem(CAT_SKIP_KEY,JSON.stringify({excluded:[...set],updatedAt:new Date().toTimeString().slice(0,5)}));window.MerchantPlan?.catPolicy?.refresh?.()};
  /* ===== 查看（菜谱详情）数据模型 =====
     种子菜谱原来只描述列表字段，详情里的用料/加工步骤没有落点，只能给所有菜谱套同一份常量。
     这里按菜谱各配一份 detail：用料挂在步骤上（kind+name 做去重键），设备步骤的投料挂在
     deviceConfigs[].actions[].materials —— 一个步骤可挂多台设备、每台设备一份动作时间轴，不压平。 */
  const ing=(kind,name,amount,unit,role,state,cut,spec,note,extra)=>({kind,name,amount,unit:unit||'克',role,state:state||'原料',cut:cut||'无需切配',spec:spec||'',note:note||'',...(extra||{})});
  const food=(...a)=>ing('food',...a),liquid=(...a)=>ing('liquid',...a);
  /* SKU 用料：带「上游 SKU 编码 sku」与「所属商品 product」——同步菜谱时用它校验该 SKU 是否已同步到当前组织私域库 */
  const sku=(name,amount,unit,role,state,cut,spec,note,skuCode,product)=>ing('sku',name,amount,unit,role,state,cut,spec,note,{sku:skuCode||'',product:product||''});
  /* 设备动作：action=动作名（火力/投料/液体/粉末），detail=参数文本（锅设置/料盒等），materials=投料明细（单位统一「克」） */
  const act=(duration,action,detail,materials,extra)=>({duration,action,detail:detail||'—',materials:materials||[],...(extra||{})});
  const dev=(vendor,model,actions)=>({vendor,model,actions});
  /* 示例用料沿用商户端原有三条（鸡胸肉 800 克 / 花生米 150 克 / 生抽 180 毫升），改成挂在具体步骤上，可被多条菜谱复用 */
  const detailSeed={
    '宫保鸡丁':{foreign:3,province:'四川',yield:100,cuisine:'川菜',intro:'鸡肉鲜嫩、酸甜微辣，适合规模化餐饮制作。',steps:[
      {type:'预处理',mode:'manual',cook:false,requirement:'食材清洗后按菜谱要求完成切配。',standard:'大小均匀',attention:'沥干备用',assoc:[food('鸡胸肉','800','克','主料','净料','切丁','约2cm见方','沥干备用'),food('花生米','150','克','辅料','原料','无需切配','','熟花生米')]},
      {type:'炒制',mode:'device',requirement:'',standard:'',attention:'',assoc:[],deviceConfigs:[dev('智谷','智能炒菜机器人 A8',[act(20,'火力','5KW · 顺时针 · 慢速 · 低位'),act(15,'投料','料盒1 · 自动投料',[food('鸡胸肉','800','克','主料','净料','切丁','约2cm见方','沥干备用'),liquid('生抽','180','毫升','调味料','原料','无需切配','','提鲜调味'),sku('海天生抽 500ml×12','120','克','调味料','原料','无需切配','500ml×12','关联标准食材：生抽','SKU000601','海天生抽')])]),dev('优特','智能炒菜机器人 UT-C16',[act(30,'火力','4KW · 逆时针 · 中速 · 中位')])]},
      {type:'装盘',mode:'manual',requirement:'出锅装盘，撒上熟花生米即可出餐。',standard:'盘面均匀、无多余汤汁',attention:'趁热出餐',assoc:[]}
    ]},
    '红烧肉':{foreign:5,province:'浙江',yield:100,cuisine:'浙菜',intro:'肥而不腻、色泽红亮，适合团餐批量炖制。',steps:[
      {type:'预处理',mode:'manual',cook:false,requirement:'五花肉切块后冷水下锅焯水。',standard:'块形均匀',attention:'撇净浮沫',assoc:[food('五花肉','1200','克','主料','净料','切块','约3cm见方','焯水后沥干'),food('生姜','30','克','辅料','原料','切片','','去腥'),sku('精品胡萝卜 12kg装','150','克','辅料','净料','切块','12kg/箱','关联标准食材：胡萝卜；该SKU已停用','SKU000402','精品胡萝卜')]},
      {type:'炖制',mode:'device',requirement:'',standard:'',attention:'',assoc:[],deviceConfigs:[dev('优特','智能炒菜机器人 UT-C16',[act(60,'火力','5KW · 顺时针 · 慢速 · 低位'),act(900,'液体','料盒2 · 自动投料',[liquid('生抽','120','毫升','调味料','原料','无需切配','','上色提鲜'),liquid('清水','800','毫升','辅料','原料','无需切配','','炖制用汤')])])]},
      {type:'装盘',mode:'manual',requirement:'收汁后装盘。',standard:'汤汁挂勺',attention:'趁热出餐',assoc:[]}
    ]},
    '番茄炒蛋':{foreign:2,province:'全国',yield:100,cuisine:'家常菜',intro:'酸甜可口、出餐快，是校园餐的高频菜品。',steps:[
      {type:'预处理',mode:'manual',cook:false,requirement:'番茄去蒂切块，鸡蛋打散备用。',standard:'块形均匀',attention:'蛋液打散后静置 5 分钟',assoc:[food('番茄','300','克','辅料','净料','切块','约3cm滚刀块','去皮'),food('鸡蛋','200','克','主料','原料','打碎','','打散备用')]},
      {type:'炒制',mode:'manual',requirement:'热锅下油，先炒蛋再下番茄翻炒均匀。',standard:'蛋块蓬松、番茄出汁',attention:'全程中火，避免炒糊',assoc:[food('番茄','300','克','辅料','净料','切块','约3cm滚刀块','去皮'),food('鸡蛋','200','克','主料','原料','打碎','','打散备用'),liquid('花生油','30','毫升','调味料','原料','无需切配','','热锅用油')]},
      {type:'装盘',mode:'manual',requirement:'装盘后即可出餐。',standard:'',attention:'',assoc:[]}
    ]},
    '紫菜蛋花汤':{foreign:1,province:'全国',yield:100,cuisine:'家常菜',intro:'清爽低脂的佐餐汤品，适合大批量出餐。',steps:[
      {type:'预处理',mode:'manual',cook:false,requirement:'紫菜泡发洗净，鸡蛋打散备用。',standard:'紫菜无沙',attention:'紫菜需反复冲洗',assoc:[food('紫菜','20','克','主料','原料','无需切配','','泡发后洗净'),food('鸡蛋','100','克','辅料','原料','打碎','','打散备用')]},
      {type:'煮制',mode:'device',requirement:'',standard:'',attention:'',assoc:[],deviceConfigs:[dev('智谷','智能汤锅 ZG-T30',[act(300,'火力','7KW · 顺时针 · 中速 · 高位'),act(60,'粉末','料盒3 · 自动投料',[food('食盐','3','克','调味料','原料','无需切配','','少盐配方')])])]},
      {type:'装盘',mode:'manual',requirement:'撒入蛋液后搅散，装碗出餐。',standard:'蛋花均匀',attention:'关火后淋入蛋液',assoc:[food('葱花','10','克','辅料','原料','切碎','','点缀')]}
    ]},
    '清炒时蔬':{foreign:0,province:'全国',yield:100,cuisine:'家常菜',intro:'当季蔬菜快炒，保留脆嫩口感。',steps:[
      {type:'预处理',mode:'manual',cook:false,requirement:'蔬菜择洗干净后切段。',standard:'长短一致',attention:'沥干水分再下锅',assoc:[food('时令蔬菜','400','克','主料','净料','切段','约5cm长段','洗净沥干'),sku('精品胡萝卜 8kg装','80','克','辅料','净料','切片','8kg/箱','关联标准食材：胡萝卜；已同步到本组织私域库','SKU000401','精品胡萝卜')]},
      {type:'炒制',mode:'manual',requirement:'热锅下油，大火快炒至断生。',standard:'色泽翠绿、口感脆嫩',attention:'控制在 2 分钟内',assoc:[food('时令蔬菜','400','克','主料','净料','切段','约5cm长段','洗净沥干'),liquid('花生油','20','毫升','调味料','原料','无需切配','','快炒用油'),food('食盐','2','克','调味料','原料','无需切配','','少盐配方')]},
      {type:'装盘',mode:'manual',requirement:'装盘出餐。',standard:'',attention:'',assoc:[]}
    ]},
    '葱油拌面':{foreign:1,province:'全国',yield:100,cuisine:'苏菜',intro:'葱香浓郁、出餐快，适合面食档口。',steps:[
      {type:'预处理',mode:'manual',cook:false,requirement:'小葱切段，面条抖散备用。',standard:'葱段均匀',attention:'面条需现煮现拌',assoc:[food('小葱','80','克','辅料','原料','切段','约4cm长段','')]},
      {type:'煮制',mode:'device',requirement:'',standard:'',attention:'',assoc:[],deviceConfigs:[dev('优特','万能蒸烤箱 UT-P40',[act(360,'火力','4KW · 间断 · 中速 · 中位'),act(30,'液体','料盒1 · 自动投料',[liquid('葱油','60','毫升','调味料','原料','无需切配','','增香')])])]},
      {type:'装盘',mode:'manual',requirement:'面条拌入葱油与生抽后装碗。',standard:'每碗面量一致',attention:'趁热拌开',assoc:[food('面条','1000','克','主料','原料','无需切配','','按份装碗'),liquid('生抽','90','毫升','调味料','原料','无需切配','','调味'),sku('海天生抽 500ml×12','90','克','调味料','原料','无需切配','500ml×12','关联标准食材：生抽','SKU000601','海天生抽')]}
    ]},
    /* 演示「字段缺失」：外语菜谱名/省份/成品系数/菜系/简介与一条投料量都留空，渲染层统一显示「—」 */
    '紫菜鸡蛋汤（少盐版）':{steps:[
      {type:'预处理',mode:'manual',cook:false,requirement:'紫菜泡发，鸡蛋打散。',standard:'紫菜无沙',attention:'紫菜需反复冲洗',assoc:[food('紫菜','20','克','主料','原料','无需切配','','泡发后洗净'),food('鸡蛋','100','克','辅料','原料','打碎','','打散备用')]},
      {type:'煮制',mode:'manual',requirement:'水沸后下紫菜，淋入蛋液后调味。',standard:'蛋花均匀',attention:'不加味精',assoc:[food('紫菜','20','克','主料','原料','无需切配','','泡发后洗净'),food('鸡蛋','100','克','辅料','原料','打碎','','打散备用'),food('食盐','1.5','克','调味料','原料','无需切配','','少盐配方')]},
      {type:'装盘',mode:'manual',requirement:'装碗出餐。',standard:'',attention:'',assoc:[food('葱花','','克','辅料','原料','切碎','','用量待确认（演示字段缺失）')]}
    ]},
    '土豆烧牛肉':{foreign:2,province:'山东',yield:100,cuisine:'鲁菜',intro:'牛肉软烂、土豆入味，适合团餐大锅炖制。',steps:[
      {type:'预处理',mode:'manual',cook:false,requirement:'牛腩切块焯水，土豆去皮切滚刀块。',standard:'块形均匀',attention:'牛腩需冷水下锅',assoc:[food('牛腩','600','克','主料','净料','切块','约3cm见方','焯水后沥干'),food('土豆','500','克','辅料','净料','切块','约3cm滚刀块','去皮')]},
      {type:'炖制',mode:'device',requirement:'',standard:'',attention:'',assoc:[],deviceConfigs:[dev('优特','万能蒸烤箱 UT-P40',[act(600,'火力','6KW · 顺时针 · 慢速 · 低位'),act(120,'投料','料盒1 · 自动投料',[food('牛腩','600','克','主料','净料','切块','约3cm见方','焯水后沥干'),food('土豆','500','克','辅料','净料','切块','约3cm滚刀块','去皮')])])]},
      {type:'装盘',mode:'manual',requirement:'收汁后按份装盘。',standard:'每份牛肉不少于 60 克',attention:'',assoc:[]}
    ]},
    '清炒时蔬（本地版）':{foreign:0,province:'广东',yield:100,cuisine:'粤菜',intro:'本地当季蔬菜快炒，少油少盐。',steps:[
      {type:'预处理',mode:'manual',cook:false,requirement:'蔬菜择洗干净后切段。',standard:'长短一致',attention:'沥干水分再下锅',assoc:[food('时令蔬菜','400','克','主料','净料','切段','约5cm长段','洗净沥干')]},
      {type:'炒制',mode:'manual',requirement:'热锅下油，大火快炒至断生。',standard:'色泽翠绿、口感脆嫩',attention:'控制在 2 分钟内',assoc:[food('时令蔬菜','400','克','主料','净料','切段','约5cm长段','洗净沥干'),liquid('花生油','20','毫升','调味料','原料','无需切配','','快炒用油'),food('食盐','2','克','调味料','原料','无需切配','','少盐配方')]},
      {type:'装盘',mode:'manual',requirement:'装盘出餐。',standard:'',attention:'',assoc:[]}
    ]}
  };

  const authorized=[
    {id:'TZ001',code:'ZC202609001',name:'宫保鸡丁',alias:'宫爆鸡丁',category:'热菜 / 小荤',cooking:'炒',process:'含设备加工',devices:'智谷·智能炒菜机器人 A8 等2种',version:'V3',ingredients:8,tags:['动物性蛋白','高蛋白','学生'],updated:'2026-09-14 10:30'},
    {id:'TZ002',code:'ZC202609002',name:'红烧肉',alias:'东坡肉',category:'热菜 / 大荤',cooking:'炖',process:'含设备加工',devices:'优特·智能炒菜机器人 UT-C16',version:'V4',ingredients:10,tags:['动物性蛋白','团餐'],updated:'2026-09-14 09:20'},
    {id:'TZ003',code:'ZC202609003',name:'番茄炒蛋',alias:'西红柿炒蛋',category:'热菜 / 半荤半素',cooking:'炒',process:'纯人工',devices:'—',version:'V2',ingredients:4,tags:['学生','校园餐'],updated:'2026-09-13 16:10'},
    {id:'TZ004',code:'ZC202609004',name:'紫菜蛋花汤',alias:'紫菜鸡蛋汤',category:'汤粥 / 汤类',cooking:'煮',process:'含设备加工',devices:'智谷·智能汤锅 ZG-T30',version:'V2',ingredients:5,tags:['低脂','校园餐'],updated:'2026-09-12 14:20'},
    {id:'TZ005',code:'ZC202609005',name:'清炒时蔬',alias:'时令蔬菜',category:'热菜 / 素菜',cooking:'炒',process:'纯人工',devices:'—',version:'V5',ingredients:5,tags:['植物性蛋白','低脂'],updated:'2026-09-11 09:45'},
    {id:'TZ006',code:'ZC202609006',name:'葱油拌面',alias:'葱油面',category:'主食 / 面食',cooking:'煮',process:'含设备加工',devices:'优特·万能蒸烤箱 UT-P40',version:'V1',ingredients:6,tags:['团餐'],updated:'2026-09-10 11:30'}
  ];
  authorized.forEach(x=>{if(detailSeed[x.name])x.detail=detailSeed[x.name]});   /* 租户授权菜谱同样带详情种子：同步后「查看」即为真实数据 */
  const seed=[
    {...authorized[0],localId:'CP202609001',source:'租户授权',status:'已上架',newVersion:true,localVersion:'V2',updatedBy:'食堂菜谱管理员'},
    {...authorized[2],localId:'CP202609002',source:'租户授权',status:'已下架',localVersion:'V2',updatedBy:'食堂菜谱管理员'},
    {localId:'CP202609003',detail:detailSeed['紫菜鸡蛋汤（少盐版）'],name:'紫菜鸡蛋汤（少盐版）',alias:'少盐紫菜汤',category:'汤粥 / 汤类',cooking:'煮',process:'纯人工',devices:'—',version:'V1',localVersion:'V1',ingredients:5,tags:['低脂','学生'],source:'自建',status:'草稿',updated:'2026-09-14 09:35',updatedBy:'食堂菜谱管理员'},
    {localId:'CP202609004',detail:detailSeed['土豆烧牛肉'],name:'土豆烧牛肉',alias:'牛肉炖土豆',category:'热菜 / 大荤',cooking:'炖',process:'含设备加工',devices:'优特·万能蒸烤箱 UT-P40',version:'V3',localVersion:'V3',ingredients:7,tags:['动物性蛋白','团餐'],source:'自建',status:'已上架',updated:'2026-09-13 15:20',updatedBy:'食堂菜谱管理员'},
    {localId:'CP202609005',detail:detailSeed['清炒时蔬（本地版）'],name:'清炒时蔬（本地版）',alias:'时令蔬菜',category:'热菜 / 素菜',cooking:'炒',process:'纯人工',devices:'—',version:'V2',localVersion:'V2',ingredients:4,tags:['植物性蛋白','低脂'],source:'自建',status:'已下架',updated:'2026-09-12 13:40',updatedBy:'食堂菜谱管理员'}
  ];
  const stores={},synced={};let currentView='hub',more=false,selected=new Set(),syncCategory='';let maskClose=true;   /* 遮罩点击关闭：查看抽屉对齐租户端不响应，编辑/同步抽屉保持原样 */
  // 标签/字典失效（租户端删除或停用）后：相关字段不再展示该值，全部失效时显示「-」；编辑提交时提示存在未完成的内容；不影响商户同步。
  const dictState=()=>window.merchantTenantDictState||{isRemoved:()=>false,tagCount:t=>(t||[]).length,tagsText:t=>(t||[]).join('、')||'-',dictText:(t,n)=>n||'-'};
  const tagsText=t=>dictState().tagsText(t);
  const tagCount=t=>dictState().tagCount(t);
  const dictText=(type,value)=>dictState().dictText(type,value);
  const tagGroups=[['辅助疾病治疗',['癌症','肿瘤','骨质疏松','营养缺乏']],['菜品营养功能',['动物性蛋白','植物性蛋白','高嘌呤','高胆固醇']],['适用场景',['学生','团餐','校园餐']]];
  const tagGroupList=()=>tagGroups.map(g=>[g[0],g[1].filter(x=>!dictState().isRemoved('tags',x))]).filter(g=>g[1].length);
  const dictRemoved=()=>{const st=dictState(),s=editorState;if(!s||!s.src)return [];const out=(s.src.tags||[]).filter(x=>st.isRemoved('tags',x)).map(x=>`菜谱标签「${x}」`);if(s.src.cooking&&st.isRemoved('cooking',s.src.cooking))out.push(`烹饪分类「${s.src.cooking}」`);if(s.src.province&&st.isRemoved('province',s.src.province))out.push(`菜谱省份「${s.src.province}」`);if(s.src.cuisine&&st.isRemoved('cuisine',s.src.cuisine))out.push(`菜系分类「${s.src.cuisine}」`);if(catDisabled.some(x=>x[0]===s.src.cat1&&x[1]===s.src.cat2))out.push(`菜谱分类「${s.src.cat1} / ${s.src.cat2}」`);return out};
  const invalidNote=()=>{const list=dictRemoved();return list.length?`<div class="umt-invalid-note">该菜谱原使用的 ${list.join('、')} 已被租户停用或删除，请重新选择有效内容。未完善前提交会提示「存在未完成的必填内容」。</div>`:''};
  const org=()=>$('#currentOrganization')?.textContent.trim()||'当前组织';
  function ensureOrg(){const key=org();if(!stores[key]){stores[key]=seed.map(x=>({...x,tags:[...x.tags]}));synced[key]=new Set(stores[key].filter(x=>x.id).map(x=>x.id))}return key}
  function toast(msg){const n=document.createElement('div');n.className='um-toast';n.textContent=msg;document.body.appendChild(n);setTimeout(()=>n.remove(),1800)}
  function hidePages(){document.querySelectorAll('.page-view').forEach(x=>{x.hidden=true});$$('.nav-child').forEach(x=>x.classList.toggle('active',x===$('#recipeNav')))}
  function page(){return $('#recipePage')}
  function enter(){hidePages();page().hidden=false;render()}
  function hub(){return `<section class="um-card um-hub"><div class="um-head" style="padding:0"><div><h1>菜谱管理</h1><p>管理当前组织的菜谱库，查看租户统一维护的菜谱分类</p></div></div><div class="um-hub-banner"><div><h2>组织菜谱工作台</h2><p>租户授权菜谱可按组织选择同步；同步后形成当前组织自己的菜谱。</p></div><i>◇</i></div><div class="um-hub-grid"><button class="um-hub-entry" data-um-view="library"><i>▤</i><span><b>菜谱库</b><small>维护租户授权同步及自建菜谱</small></span><em>进入管理 →</em></button><button class="um-hub-entry" data-um-view="categories"><i>▦</i><span><b>菜谱分类</b><small>查看租户统一维护的一级、二级分类</small></span><em>进入查看 →</em></button></div></section>`}
  function listPage(){const key=ensureOrg(),pending=syncableList().length;return `<section class="um-card"><div class="um-head"><div><button class="um-secondary um-back" data-um-view="hub">← 返回菜谱管理</button><h1>菜谱库</h1><p>管理当前组织同步及自建的菜谱</p></div><div class="um-actions"><button class="um-secondary um-sync" id="umSync">同步菜谱${pending?`<span class="um-bubble">${pending}</span>`:''}</button><button class="um-primary" id="umCreate">＋ 新建菜谱</button></div></div><div class="um-org-note">当前组织：<b>${esc(key)}</b>　菜谱数据仅属于当前组织；切换组织后将展示对应组织的菜谱库。</div><div class="um-filters"><input id="umKeyword" placeholder="搜索菜谱名称、别名或编号"><select id="umSource"><option value="">全部来源</option><option>租户授权</option><option>自建</option></select><select id="umStatus"><option value="">全部状态</option><option>草稿</option><option>已上架</option><option>已下架</option></select><select id="umCategory"><option value="">全部菜谱分类</option>${categories.flatMap(x=>x[1].map(y=>`<option>${x[0]} / ${y}</option>`)).join('')}</select><select id="umProcess"><option value="">全部加工方式</option><option>纯人工</option><option>含设备加工</option></select><button class="um-secondary" id="umMore">${more?'收起筛选⌃':'更多筛选⌄'}</button><button class="um-secondary" id="umReset">重置</button></div>${more?`<div class="um-more-filters"><label>烹饪分类<select><option>全部烹饪分类</option><option>炒</option><option>炖</option><option>煮</option></select></label><label>菜系分类<select><option>全部菜系</option><option>川菜</option><option>家常菜</option></select></label><label>菜谱标签<select id="umTag"><option value="">全部标签</option>${tagGroupList().flatMap(g=>g[1]).map(x=>`<option>${x}</option>`).join('')}</select></label><label>设备厂家<select><option>全部厂家</option><option>智谷</option><option>优特</option></select></label></div>`:''}<div class="um-table-wrap"><table class="um-table"><thead><tr><th>菜谱信息</th><th>菜谱分类</th><th>来源</th><th>加工方式</th><th>适配设备</th><th>用料</th><th>菜谱标签</th><th>版本 / 状态</th><th>更新信息</th><th>操作</th></tr></thead><tbody id="umRows"></tbody></table><div class="um-empty" id="umEmpty" hidden>暂无符合条件的菜谱</div></div></section>`}
  function rows(){const key=ensureOrg();return stores[key].map((d,i)=>`<tr data-i="${i}" data-key="${esc(`${d.name} ${d.alias||''} ${d.localId}`.toLowerCase())}" data-source="${d.source}" data-status="${d.status}" data-category="${d.category}" data-process="${d.process}" data-tags="${esc(tagsText(d.tags))}"><td><div class="um-dish"><span class="um-thumb">菜谱</span><span><b>${esc(d.name)}${d.newVersion?'<em class="um-version-alert">有新版本</em>':''}</b><small>${d.localId} · ${esc(d.alias||'—')}</small></span></div></td><td>${d.category}</td><td><span class="um-tag ${d.source==='租户授权'?'tenant':'self'}">${d.source}</span></td><td><span class="um-process ${d.process==='含设备加工'?'device':'manual'}">${d.process}</span></td><td>${d.devices}</td><td>${d.ingredients}项</td><td><span class="um-label-count" title="${esc(tagsText(d.tags))}">${tagCount(d.tags)?tagCount(d.tags)+'个':'-'}</span></td><td><b>${d.localVersion}</b><small style="display:block;margin-top:5px"><span class="um-status ${d.status==='已上架'?'up':d.status==='草稿'?'draft':'down'}">${d.status}</span></small></td><td class="um-update-cell">${d.updatedBy}<small>${d.updated}</small></td><td><div class="um-ops"><button class="um-link" data-act="view">查看</button><button class="um-link" data-act="edit">编辑</button><button class="um-link" data-act="toggle">${d.status==='已上架'?'下架':'上架'}</button><button class="um-link danger" data-act="delete">删除</button></div></td></tr>`).join('')}
  function categoriesPage(){ensureOrg();const skip=catSkipState();
    const kids=p=>(categories.find(c=>c[0]===p)?.[1]||[]);
    const rows=categories.flatMap(x=>[[x[0],'一级分类','—'],...x[1].map(y=>[y,'二级分类',x[0]])]);
    return `<section class="um-card um-category-layout"><aside class="um-category-tree"><button class="um-secondary um-back" data-um-view="hub">← 返回菜谱管理</button><h3>租户菜谱分类</h3>${categories.map(x=>`<div class="um-category-parent">▾ ${x[0]}</div>${x[1].map(y=>`<div class="um-category-child">${y}${skip.has(y)?'<em class="um-cat-off">不计入人数</em>':''}</div>`).join('')}`).join('')}</aside><main class="um-category-main"><h1>菜谱分类</h1><div class="um-readonly-note">菜谱分类由租户统一维护，不可新增、编辑、删除或排序；<b>商户可设置哪些分类计入就餐人数测算</b>——关闭后，该分类的菜谱在排餐计划里不计入「预计满足 N 人就餐」（出餐量、荤素统计、生产计划均不受影响）。</div><table><thead><tr><th>分类名称</th><th>层级</th><th>上级分类</th><th>状态</th><th>最近更新</th><th>计入就餐人数</th></tr></thead><tbody>${rows.map(x=>{const second=x[1]==='二级分类';const on=!skip.has(x[0]);const ctrl=second?`<button class="um-switch ${on?'on':''}" data-catskip="${x[0]}" aria-pressed="${on}" title="${on?'点击关闭：该分类的菜谱不计入排餐计划的人数测算':'点击开启：该分类的菜谱重新计入人数测算'}"><i></i><span>${on?'计入':'不计入'}</span></button>`:(()=>{const list=kids(x[0]);const k=list.filter(y=>!skip.has(y)).length;return `<span class="um-cat-sum ${k===list.length?'all':k===0?'none':''}">${k}/${list.length} 计入</span>`})();return `<tr><td><b>${x[0]}</b></td><td>${x[1]}</td><td>${x[2]}</td><td><span class="um-status up">启用</span></td><td>2026-09-14 10:30</td><td>${ctrl}</td></tr>`}).join('')}</tbody></table><p class="um-cat-foot">当前不计入就餐人数：<b>${skip.size?[...skip].join('、'):'无（全部分类都计入）'}</b></p></main></section>`}
  function render(){ensureOrg();page().className='page-view unified-merchant-page';page().innerHTML=currentView==='hub'?hub():currentView==='categories'?categoriesPage():listPage();$('.breadcrumb').innerHTML=`菜谱中心&nbsp; / &nbsp;<strong>${currentView==='hub'?'菜谱管理':currentView==='library'?'菜谱库':'菜谱分类'}</strong>`;bind();if(currentView==='library'){renderRows();bindFilters()}mountScope()}
  /* 菜谱中心按「次级组织」定位：标题行右侧挂统一的范围切换器 */
  function mountScope(){const head=page().querySelector('.um-head');if(head)window.MerchantScope?.mount(head,{stall:false})}
  function renderRows(){const body=$('#umRows');if(body)body.innerHTML=rows()}
  function bind(){$$('[data-um-view]').forEach(b=>b.onclick=()=>{currentView=b.dataset.umView;render()});
    $$('[data-catskip]').forEach(b=>b.onclick=()=>{const set=catSkipState();const name=b.dataset.catskip;const off=set.has(name);off?set.delete(name):set.add(name);saveCatSkip(set);render();toast(off?`已恢复：${name} 计入就餐人数统计`:`已关闭：${name} 不计入就餐人数统计，排餐计划里不再计入人数`)});if($('#umSync'))$('#umSync').onclick=openSync;if($('#umCreate'))$('#umCreate').onclick=()=>openEdit(null)}
  function bindFilters(){const filter=()=>{const get=id=>$(id)?.value||'',kw=get('#umKeyword').trim().toLowerCase(),source=get('#umSource'),status=get('#umStatus'),category=get('#umCategory'),process=get('#umProcess'),tag=get('#umTag');let n=0;$$('#umRows tr').forEach(r=>{r.hidden=!((!kw||r.dataset.key.includes(kw))&&(!source||r.dataset.source===source)&&(!status||r.dataset.status===status)&&(!category||r.dataset.category===category)&&(!process||r.dataset.process===process)&&(!tag||r.dataset.tags.includes(tag)));if(!r.hidden)n++});$('#umEmpty').hidden=n>0};['#umKeyword','#umSource','#umStatus','#umCategory','#umProcess','#umTag'].forEach(id=>{const x=$(id);if(x)x.addEventListener(id==='#umKeyword'?'input':'change',filter)});$('#umMore').onclick=()=>{more=!more;render()};$('#umReset').onclick=()=>{more=false;render()};$('#umRows').onclick=e=>{const b=e.target.closest('[data-act]');if(!b)return;const i=+b.closest('tr').dataset.i,d=stores[ensureOrg()][i],act=b.dataset.act;if(act==='view')openDetail(d);if(act==='edit')openEdit(d);if(act==='toggle'){d.status=d.status==='已上架'?'已下架':'已上架';d.updated='刚刚';render()}if(act==='delete'&&confirm(`确认删除“${d.name}”吗？删除后可在授权有效时重新同步。`)){stores[ensureOrg()].splice(i,1);if(d.id)synced[ensureOrg()].delete(d.id);render();toast('菜谱已删除')}if(act==='update'){d.newVersion=false;d.localVersion=d.version;d.updated='刚刚';render();toast('已更新至租户最新版本')}}}
  function ensureDrawer(){if($('#umMask'))return;document.body.insertAdjacentHTML('beforeend','<div class="um-mask" id="umMask"><aside class="um-drawer"><div class="um-drawer-head"><div><h2 id="umDrawerTitle"></h2><p id="umDrawerSub"></p></div><button class="um-close" id="umClose">×</button></div><div class="um-drawer-body" id="umDrawerBody"></div><div class="um-drawer-foot" id="umDrawerFoot"></div></aside></div>');$('#umClose').onclick=closeDrawer;$('#umMask').onclick=e=>{if(maskClose&&e.target.id==='umMask')closeDrawer()}}
  function drawer(title,sub,body,foot=''){ensureDrawer();$('#umDrawerTitle').textContent=title;$('#umDrawerSub').textContent=sub;$('#umDrawerBody').innerHTML=body;$('#umDrawerFoot').innerHTML=foot;$('#umMask').classList.add('show')}
  function closeDrawer(){$('#umMask').classList.remove('show');maskClose=true}
  function openDetail(d){drawer('菜谱详情',`${d.localId} · ${d.name}`,`<section class="um-section"><h3>基础信息</h3><div class="um-detail-grid">${[['菜谱名称',d.name],['菜谱别名',d.alias],['菜谱分类',d.category],['来源',d.source],['加工方式',d.process],['适配设备',d.devices],['当前版本',d.localVersion],['使用状态',d.status]].map(x=>`<div class="um-detail-field"><span>${x[0]}</span><b>${x[1]}</b></div>`).join('')}</div></section><section class="um-section"><h3>菜谱标签</h3><p>${d.tags.map(x=>`<span class="um-tag self">${x}</span>`).join(' ')}</p></section><section class="um-section"><h3>用料明细</h3><p>共 ${d.ingredients} 项标准食材，用料单位与参数字典由租户统一维护。</p></section><section class="um-section"><h3>加工步骤</h3><p>${d.process==='含设备加工'?'包含人工处理和设备加工步骤，可按适配设备查看操作参数。':'当前菜谱全部为人工处理步骤。'}</p></section>`,`<span class="um-spacer"></span><button class="um-primary" id="umDetailClose">关闭</button>`);$('#umDetailClose').onclick=closeDrawer}
  function openEdit(d){const fresh=!d,item=d||{name:'',alias:'',category:'',process:'纯人工',tags:[]};drawer(fresh?'新建菜谱':'编辑菜谱',`${esc(org())} · ${fresh?'创建组织自建菜谱':'修改后仅影响当前组织'}`,`<section class="um-section"><h3>基础信息</h3><div class="um-edit-grid"><label>菜谱名称<input id="umeName" value="${esc(item.name)}"></label><label>别名<input id="umeAlias" value="${esc(item.alias||'')}"></label><label>菜谱分类<select id="umeCategory"><option value="">请选择租户菜谱分类</option>${categories.flatMap(x=>x[1].map(y=>{const v=x[0]+' / '+y;return `<option ${v===item.category?'selected':''}>${v}</option>`})).join('')}</select></label><label>加工方式<select id="umeProcess"><option ${item.process==='纯人工'?'selected':''}>纯人工</option><option ${item.process==='含设备加工'?'selected':''}>含设备加工</option></select></label><label class="full">菜谱标签<input id="umeTags" value="${esc(item.tags.join('、'))}" placeholder="使用租户标签，多个标签用顿号分隔"></label></div></section><div class="um-readonly-note">菜谱分类、标签和设备参数字典均使用租户维护的数据；商户不能新增或修改字典项。</div>`,`<button class="um-secondary" id="umeCancel">取消</button><span class="um-spacer"></span><button class="um-primary" id="umeSave">${fresh?'保存草稿':'保存修改'}</button>`);$('#umeCancel').onclick=closeDrawer;$('#umeSave').onclick=()=>{const name=$('#umeName').value.trim(),category=$('#umeCategory').value;if(!name||!category)return toast('请填写菜谱名称并选择菜谱分类');const data={name,alias:$('#umeAlias').value.trim(),category,process:$('#umeProcess').value,tags:$('#umeTags').value.split('、').map(x=>x.trim()).filter(Boolean),devices:$('#umeProcess').value==='含设备加工'?'智谷·智能炒菜机器人 A8':'—',ingredients:d?.ingredients||1,updated:'刚刚',updatedBy:'食堂菜谱管理员'};if(d)Object.assign(d,data);else stores[ensureOrg()].unshift({...data,localId:`CP${Date.now().toString().slice(-9)}`,source:'自建',status:'草稿',localVersion:'V1'});closeDrawer();render();toast(fresh?'菜谱草稿已创建':'菜谱修改已保存')}}
  /* ===== 同步菜谱前置校验：菜谱用料里的「SKU商品」必须先同步到当前组织私域库 =====
     租户端菜谱的用料可以引用商品SKU（步骤关联用料 / 设备投料明细，kind==='sku'）。
     这些 SKU 未同步到当前组织私域库时，菜谱暂不允许同步 —— 否则落地后用料指向私域库里不存在的商品。
     判定按「当前组织」口径（与商品中心私域库一致）：SKU 以上游编码匹配，编码缺失时按 SKU 名称匹配。 */
  function skuRefsOf(steps){
    const out=[],seen=new Set();
    const push=e=>{if(!e||e.kind!=='sku')return;const k=`${e.sku||''}|${e.name||''}`;if(seen.has(k))return;seen.add(k);out.push({name:e.name||'',code:e.sku||'',product:e.product||'',spec:e.spec||'',food:e.food||''})};
    (steps||[]).forEach(s=>{(s.assoc||[]).forEach(push);(s.deviceConfigs||[]).forEach(c=>(c.actions||[]).forEach(a=>(a.materials||[]).forEach(push)))});
    return out;
  }
  /* 逐条授权菜谱评估用料里的 SKU：synced=已同步 / pending=未同步但可同步 / unavailable=当前不可同步
     行内提示只给「所属商品 + 规格」，不显示上游 SKU 编码（编码仅用于匹配）；菜谱数据缺失时回落到上游 SKU 池字段 */
  function skuGate(){
    const api=window.merchantProductCenter,info=api&&typeof api.skuSyncInfo==='function'?api.skuSyncInfo():null;
    const blocked=new Map();
    if(info)available().forEach(x=>{
      const items=skuRefsOf(x.detail&&x.detail.steps).map(r=>{
        const up=r.code?info.upstreamSku(r.code):info.upstreamSkuByName(r.name);
        const shown={...r,product:r.product||(up&&up.productName)||'',spec:r.spec||(up&&up.spec)||''};
        if(!up)return {...shown,state:'unavailable',reason:'该SKU商品未授权给本商户'};
        if(info.isSynced(up.skuId))return {...shown,state:'synced',reason:''};
        if(!info.isSyncable(up.skuId))return {...shown,state:'unavailable',reason:info.unsyncReason(up.skuId)};
        return {...shown,state:'pending',reason:'尚未同步到本组织私域库'};
      });
      const bad=items.filter(i=>i.state!=='synced');
      if(bad.length)blocked.set(x.id,bad);
    });
    return {
      isBlocked:id=>blocked.has(id),
      itemsOf:id=>blocked.get(id)||[]
    };
  }
  /* 允许同步的菜谱（在「授权 + 未同步」基础上，再排除用料含未就绪 SKU 的菜谱） */
  const syncableList=()=>{const g=skuGate();return available().filter(x=>!g.isBlocked(x.id))};
  const blockedReason=items=>items.map(i=>[i.name,i.product?`所属商品：${i.product}`:'',i.spec?`规格：${i.spec}`:'',i.reason].filter(Boolean).join('｜')).join('；');
  const skuGateTip=items=>items.some(i=>i.state==='pending')?'请先到「商品中心 → 同步商品」完成同步':'请联系租户处理';
  function openSync(){selected.clear();syncCategory='';drawSync()}
  function available(){return authorized.filter(x=>!synced[ensureOrg()].has(x.id))}
  /* 抽屉内不再放 SKU 汇总提示条（占篇幅），SKU 未就绪只在对应菜谱行内提示 */
  function drawSync(){drawer('同步租户授权菜谱',`当前组织：${org()}`,`<div class="um-readonly-note" style="margin-bottom:14px">选择租户已授权给当前商户、但尚未同步到当前组织的菜谱。同步后形成当前组织自己的菜谱。</div><div class="um-sync-layout"><aside class="um-category-side"><h3>租户菜谱分类</h3><button class="${syncCategory?'':'active'}" data-sync-cat="">全部菜谱</button>${categories.map(x=>`<button data-sync-cat="${x[0]}">▾ ${x[0]}</button>${x[1].map(y=>`<button data-sync-cat="${x[0]} / ${y}">　${y}</button>`).join('')}`).join('')}</aside><section><div class="um-sync-tools"><input id="umSyncKeyword" placeholder="搜索菜谱名称、别名或编号"><select id="umSyncProcess"><option value="">全部加工方式</option><option>纯人工</option><option>含设备加工</option></select><select id="umSyncDevice"><option value="">全部设备厂家</option><option>智谷</option><option>优特</option></select></div><div class="um-select-summary">可同步 <b>${syncableList().length}</b> 个，已选择 <b id="umSelectedCount">${selected.size}</b> 个</div><div class="um-sync-row head"><span><input id="umSyncAll" type="checkbox"></span><span>菜谱信息</span><span>菜谱分类</span><span>加工方式</span><span>适配设备</span><span>版本</span></div><div id="umSyncRows"></div></section></div>`,`<button class="um-secondary" id="umSyncCancel">取消</button><span class="um-spacer"></span><button class="um-primary" id="umSyncConfirm" ${selected.size?'':'disabled'}>同步所选菜谱（${selected.size}）</button>`);bindSync();renderSyncRows()}
  function renderSyncRows(){const kw=$('#umSyncKeyword')?.value.trim().toLowerCase()||'',process=$('#umSyncProcess')?.value||'',vendor=$('#umSyncDevice')?.value||'',gate=skuGate(),rows=available().filter(x=>(!syncCategory||(syncCategory.includes(' / ')?x.category===syncCategory:x.category.startsWith(syncCategory+' / ')))&&(!kw||`${x.name} ${x.alias} ${x.code}`.toLowerCase().includes(kw))&&(!process||x.process===process)&&(!vendor||x.devices.includes(vendor)));rows.forEach(x=>{if(gate.isBlocked(x.id))selected.delete(x.id)});$('#umSyncRows').innerHTML=rows.map(x=>{const blocked=gate.isBlocked(x.id),items=blocked?gate.itemsOf(x.id):[];return `<label class="um-sync-row${blocked?' is-blocked':''}"><span><input type="checkbox" data-sync-id="${x.id}" ${selected.has(x.id)?'checked':''} ${blocked?'disabled':''}></span><span><strong>${x.name}</strong><small>${x.code} · ${x.alias}</small><small style="display:block;color:#8b97a9">菜谱标签：${esc(tagsText(x.tags))}</small></span><span>${x.category}</span><span>${x.process}</span><span>${x.devices}</span><span>${x.version}</span>${blocked?`<span class="um-sync-block">用料含未就绪的SKU商品：${esc(blockedReason(items))} —— ${esc(skuGateTip(items))}</span>`:''}</label>`}).join('')||'<div class="um-empty">暂无符合条件的可同步菜谱</div>';const selectable=rows.filter(x=>!gate.isBlocked(x.id));$('#umSelectedCount').textContent=selected.size;$('#umSyncConfirm').disabled=!selected.size;$('#umSyncConfirm').textContent=`同步所选菜谱（${selected.size}）`;$('#umSyncAll').checked=!!selectable.length&&selectable.every(x=>selected.has(x.id));$$('[data-sync-id]').forEach(x=>x.onchange=()=>{x.checked?selected.add(x.dataset.syncId):selected.delete(x.dataset.syncId);renderSyncRows()});$('#umSyncAll').onchange=e=>{selectable.forEach(x=>e.target.checked?selected.add(x.id):selected.delete(x.id));renderSyncRows()}}
  function bindSync(){$$('[data-sync-cat]').forEach(x=>x.onclick=()=>{syncCategory=x.dataset.syncCat;$$('[data-sync-cat]').forEach(y=>y.classList.toggle('active',y===x));renderSyncRows()});['#umSyncKeyword','#umSyncProcess','#umSyncDevice'].forEach(id=>$(id).addEventListener(id==='#umSyncKeyword'?'input':'change',renderSyncRows));$('#umSyncCancel').onclick=closeDrawer;
    /* 提交时二次校验：抽屉打开期间 SKU 同步状态可能变化，仍有未就绪 SKU 的菜谱一律不落地 */
    $('#umSyncConfirm').onclick=()=>{const gate=skuGate(),picked=authorized.filter(x=>selected.has(x.id)),refused=picked.filter(x=>gate.isBlocked(x.id));selected=new Set(picked.filter(x=>!gate.isBlocked(x.id)).map(x=>x.id));if(refused.length){const items=refused.flatMap(x=>gate.itemsOf(x.id));renderSyncRows();toast(`「${refused[0].name}」等 ${refused.length} 个菜谱用料里的 SKU 商品未就绪，${skuGateTip(items)}`);return}const items=picked;if(!items.length)return;items.forEach(x=>{stores[ensureOrg()].unshift({...x,localId:`CP${Date.now().toString().slice(-8)}${Math.floor(Math.random()*9)}`,source:'租户授权',status:'已下架',localVersion:x.version,updatedBy:'同步操作人',tags:[...x.tags]});synced[ensureOrg()].add(x.id)});closeDrawer();render();toast(`已同步 ${items.length} 个菜谱到${org()}，状态为已下架`)}}
  let editorState=null;
  /* ===== 阶段 2：新建 / 编辑 对齐租户端 =====
     数据模型与「查看」统一到菜谱对象自身：editorState.steps 即 detailOf(d).steps 的深拷贝，
     保存时写回 d.detail.steps —— 列表与「查看」立刻看到新值，detailSeed 只作为种子来源。 */
  const ingredientSeed=()=>[{role:'主料',food:'鸡胸肉',amount:'800',unit:'克',state:'净料',cut:'切丁',spec:'约2cm见方',note:'沥干备用'},{role:'辅料',food:'花生米',amount:'150',unit:'克',state:'原料',cut:'无需切配',spec:'—',note:'熟花生米'},{role:'调味料',food:'生抽',amount:'180',unit:'毫升',state:'原料',cut:'无需切配',spec:'—',note:'提鲜调味'}];
  const stepSeed=()=>[{type:'预处理',mode:'manual',requirement:'食材清洗后按菜谱要求完成切配。',standard:'大小均匀',attention:'沥干备用',models:[]},{type:'炒制',mode:'device',requirement:'',standard:'',attention:'',models:[{vendor:'智谷',model:'智能炒菜机器人 A8',actions:[{duration:20,action:'火力',detail:'5KW · 顺时针 · 慢速 · 低位'}]}]}];
  /* 示例用料库（「选择用料」弹窗与设备投料明细的数据源）：沿用商户端原三条，另加 1 项 SKU 形态示例
     （阶段 1 的 detailSeed 里已有同类行：海天生抽 500ml×12 / 关联标准食材：生抽） */
  const ingredientCatalog=()=>[
    ing('food','鸡胸肉','800','克','主料','净料','切丁','约2cm见方','沥干备用'),
    ing('food','花生米','150','克','辅料','原料','无需切配','','熟花生米'),
    ing('liquid','生抽','180','毫升','调味料','原料','无需切配','','提鲜调味'),
    sku('海天生抽 500ml×12','120','克','调味料','原料','无需切配','500ml×12','关联标准食材：生抽','SKU000601','海天生抽')];
  const copyOf=v=>JSON.parse(JSON.stringify(v));
  /* 设备型号目录：料盒数量由型号决定（对齐租户端 ZG-A8/ZG-C20/UT-C16=8、ZG-T30=6、UT-P40=4） */
  const deviceCatalog=[{vendor:'智谷',model:'智能炒菜机器人 A8',boxes:8},{vendor:'优特',model:'智能炒菜机器人 UT-C16',boxes:8},{vendor:'智谷',model:'智能汤锅 ZG-T30',boxes:6},{vendor:'优特',model:'万能蒸烤箱 UT-P40',boxes:4}];
  const deviceVendors=()=>[...new Set(deviceCatalog.map(x=>x.vendor))];
  const deviceModelsOf=v=>deviceCatalog.filter(x=>x.vendor===v);
  const deviceBoxes=(v,m)=>{const d=deviceCatalog.find(x=>x.vendor===v&&x.model===m);return d?d.boxes:4};
  const COOKING_OPTIONS=['炒','炖','蒸','煮','烤'];
  const PROVINCE_OPTIONS=['全国','四川','山东','广东','江苏','浙江'];
  const CUISINE_OPTIONS=['川菜','鲁菜','粤菜','苏菜','浙菜'];
  const PROCESS_TYPES=['预处理','腌制','焯水','炖制','炒制','蒸制','煮制','装盘'];
  const PROCESS_NAMES={'预处理':[['去皮切配','食材清洗后去皮，按菜谱要求切成指定规格。'],['清洗切配','食材清洗干净，按菜谱要求完成切配，大小均匀。']],'腌制':[['上浆腌制','加入调味料抓匀后静置腌制至入味。']],'焯水':[['快速焯水','水沸后放入食材，焯至断生后捞出沥水。']],'炖制':[['小火炖制','加入调味料后小火炖制至肉质软烂、汤汁浓稠。']],'炒制':[['高温快炒','热锅后投料，保持高温快速翻炒至成熟。']],'蒸制':[['上汽蒸制','上汽后放入蒸制至熟透，取出沥去汤汁。']],'煮制':[['沸水煮制','水沸后下锅煮制至成熟，注意控制时间。']],'装盘':[['装盘出餐','按份装盘，保持盘面均匀后出餐。']]};
  const LANGUAGES=['英文','法语','繁体中文','日语','韩语','越南语','西班牙语','德语','泰语','葡萄牙语'];
  const POT_POWER=['3KW','4KW','5KW','6KW','7KW'],POT_DIRECTION=['顺时针','逆时针','间歇'],POT_SPEED=['慢速','中速','快速'],POT_POSITION=['低位','中位','高位'];
  const FEED_LIQUID=['水淀粉','水','花生油','陈醋','白醋','生抽','老抽','辣鲜露'];
  const FEED_POWDER=['盐','白糖','味精','鸡精','白胡椒粉','五香粉','花椒粉','辣椒粉','淀粉','小苏打'];
  /* 已删除 / 已停用的二级分类不可选（对齐租户端分类管理口径：热菜/半荤半素已删除、主食/点心已停用） */
  const catDisabled=[['热菜','半荤半素'],['主食','点心']];
  const catSelectable=()=>categories.map(x=>[x[0],x[1].filter(y=>!catDisabled.some(d=>d[0]===x[0]&&d[1]===y))]).filter(x=>x[1].length);
  const catKids=p=>((catSelectable().find(x=>x[0]===p)||[p,[]])[1]||[]);
  const withCurrent=(list,cur)=>{const out=[...list];if(cur&&!out.includes(cur))out.unshift(cur);return out};
  const stepCounted=s=>!s||s.cook!==false;
  /* 新建菜谱的初始步骤：沿用商户端示例用料；「计入烹饪投料」默认开 */
  const newSteps=()=>[
    {type:'预处理',mode:'manual',cook:true,processName:'',requirement:'食材清洗后按菜谱要求完成切配。',standard:'大小均匀',attention:'沥干备用',assoc:[ing('food','鸡胸肉','800','克','主料','净料','切丁','约2cm见方','沥干备用'),ing('food','花生米','150','克','辅料','原料','无需切配','','熟花生米')],deviceConfigs:[]},
    {type:'炒制',mode:'manual',cook:true,processName:'',requirement:'热锅下油，下主料翻炒均匀后调味出锅。',standard:'色泽均匀、口味稳定',attention:'注意控制火候',assoc:[ing('liquid','生抽','180','毫升','调味料','原料','无需切配','','提鲜调味')],deviceConfigs:[]}];
  const editorStep=()=>editorState.steps[editorState.activeStep];
  /* 当前查看/编辑的设备型号页签（历史菜谱可能挂多台设备，按型号切换，不隐藏也不丢） */
  const activeCfg=s=>{const list=(s&&s.deviceConfigs)||[];return list[Math.min(editorState.deviceTab||0,Math.max(list.length-1,0))]};
  const activeCfgIndex=s=>{const list=(s&&s.deviceConfigs)||[];return Math.min(editorState.deviceTab||0,Math.max(list.length-1,0))};
  /* 步骤投料（人工步骤取关联对象，设备步骤取设备投料明细）：用量校验用 */
  const stepMaterials=s=>{const list=s&&s.mode==='device'?[]:(s.assoc||[]);const out=[...list];((s&&s.deviceConfigs)||[]).forEach(c=>(c.actions||[]).forEach(a=>(a.materials||[]).forEach(m=>out.push(m))));return out};
  /* 投料量 4 条细则文案照抄租户端 _audit/tenant-new.md §6.5（collectBadAmount） */
  function collectBadAmount(steps){for(const s of steps||[])for(const e of stepMaterials(s)){if(!e||!e.name)continue;const raw=String(e.amount==null?'':e.amount).trim();if(raw==='')return '请填写「'+e.name+'」的用量（克）';const n=Number(raw);if(!isFinite(n)||n<=0)return '「'+e.name+'」的用量需大于 0';if(n>9999.99)return '「'+e.name+'」的用量不能超过 9999.99 克';if(Math.round(n*100)/100!==n)return '「'+e.name+'」的用量最多保留两位小数'}return ''}
  const actionLabel=a=>{const n=a.action||'操作';const extra=n==='投料'?'（'+(a.feedMethod==='manual'?'手动':'自动')+'）':'';const box=n==='投料'&&a.feedMethod!=='manual'&&a.box?' · 料盒'+a.box:'';return n+extra+box};
  const actionStart=(list,i)=>num2((list||[]).slice(0,i).reduce((n,a)=>n+(Number(a.duration)||0),0));
  const actionPot=a=>a.detail||[a.power,a.direction,a.speed,a.position].filter(Boolean).join(' · ')||DASH;
  function tenantStyleEditor(d){
    maskClose=true;
    const detail=d?detailOf(d):{steps:[]};
    const parts=(d&&d.category?d.category:'热菜 / 大荤').split(' / ');
    const cat1=parts[0]||'热菜',cat2=parts[1]||'大荤';
    /* 外语菜谱名：种子只存了「已配语种数」（detail.foreign），没有逐语种文本；
       编辑态按前 N 个语种回填菜谱名占位，保证「已配语种 N/10」与查看一致，保存时不会把这项数据丢掉 */
    const foreignNames=Object.assign({},detail.foreignNames||{});
    if(!Object.keys(foreignNames).length){const fn=Math.min(Number(detail.foreign)||0,LANGUAGES.length);for(let i=0;i<fn;i++)foreignNames[LANGUAGES[i]]=d?(d.name||''):''}
    /* 编辑预填真实数据：字段全部取自该菜谱自身（detail + 列表字段），不再用 ingredientSeed()/stepSeed() 常量；
       图片按阶段 2 口径给预置占位图，避免复制租户端「图片必填但种子无图 → 首次提交必然失败」的缺陷 */
    const base=d?{
      image:detail.image||'placeholder',
      name:d.name||'',alias:d.alias||'',
      foreign:foreignNames,
      cooking:dictState().isRemoved('cooking',d.cooking||'炒')?'':(d.cooking||'炒'),
      province:(detail.province&&!dictState().isRemoved('province',detail.province))?detail.province:'全国',
      yield:detail.yield==null?'100':String(detail.yield),
      cat1,cat2,
      cuisine:(detail.cuisine&&!dictState().isRemoved('cuisine',detail.cuisine))?detail.cuisine:'川菜',
      intro:detail.intro||'',
      tags:(d.tags?[...d.tags]:['动物性蛋白']).filter(x=>!dictState().isRemoved('tags',x))
    }:{image:'placeholder',name:'',alias:'',foreign:{},cooking:'炒',province:'全国',yield:'100',cat1:'热菜',cat2:'大荤',cuisine:'川菜',intro:'',tags:['动物性蛋白']};
    editorState={source:d,deviceTab:0,src:{tags:d?[...(d.tags||[])]:[],cooking:d?.cooking||'',province:detail.province||'',cuisine:detail.cuisine||'',cat1,cat2},tab:'basic',activeStep:0,errs:new Set(),pendingVendor:'',base,steps:(detail.steps&&detail.steps.length?detail.steps:newSteps())};
    if(!cat1||!cat2){editorState.base.cat1='热菜';editorState.base.cat2='大荤'}
    drawer(d?'编辑菜谱':'新建菜谱','菜谱中心 · '+org()+' · 组织私域数据','','<button class="um-secondary" id="umtCancel">取消</button><span class="um-spacer"></span><button class="um-secondary" id="umtDraft">保存草稿</button><button class="um-primary" id="umtSubmit">提交</button>');
    $('#umMask .um-drawer').classList.add('tenant-wide');
    $('#umtCancel').onclick=closeDrawer;
    $('#umtDraft').onclick=()=>saveTenantEditor(true);
    $('#umtSubmit').onclick=()=>saveTenantEditor(false);
    drawTenantEditor();
  }
  /* 页签顺序跟租户端代码：1 基础信息 / 2 加工步骤 / 3 用料明细 */
  function editorTabs(){const errs=editorState.errs||new Set();return '<div class="umt-editor-tabs">'+[['basic','1 基础信息'],['process','2 加工步骤'],['ingredients','3 用料明细']].map(x=>'<button class="'+(editorState.tab===x[0]?'active':'')+(errs.has(x[0])?' has-error':'')+'" data-umt-editor-tab="'+x[0]+'">'+x[1]+(errs.has(x[0])?'<i>!</i>':'')+'</button>').join('')+'</div>'}
  function editorBasic(){
    const b=editorState.base,kids=withCurrent(catKids(b.cat1),b.cat2),lv2=kids.length?kids:[b.cat2];
    const count=Object.values(b.foreign||{}).filter(Boolean).length;
    const groups=tagGroupList(),known=new Set(groups.flatMap(g=>g[1]));
    /* 不在租户标签分组里的既有标签（如「高蛋白」）单独成组，避免切页签被静默丢弃 —— 不复制租户端该缺陷 */
    const extraTags=b.tags.filter(x=>!known.has(x));
    const opt=(v,cur)=>'<option'+(v===cur?' selected':'')+'>'+esc(v)+'</option>';
    return '<section class="umt-editor-section">'+invalidNote()
      +'<div class="umt-basic-layout"><label class="umt-image" data-umt-image-state="'+(b.image?(b.image==='placeholder'?'placeholder':'uploaded'):'empty')+'"><span><i>*</i> 图片</span><div class="'+(b.image?'has-image':'')+'">'+(b.image?'<b>菜谱图片</b><small>'+(b.image==='placeholder'?'已使用预置占位图，点击更换':'已上传，点击更换')+'</small>':'<b>＋</b><small>上传1张图片</small>')+'<input type="file" id="umtImage" accept="image/png,image/jpeg,image/webp"></div></label>'
      +'<div class="umt-basic-fields" data-umt-base-fields="image,name,alias,foreign,cooking,province,yield,category,cuisine,intro,tags">'
      +'<label><i>*</i> 菜谱名称<input data-umt-base="name" value="'+esc(b.name)+'" placeholder="请输入菜谱名称"></label>'
      +'<label><i>*</i> 别名<input data-umt-base="alias" value="'+esc(b.alias)+'" placeholder="请输入菜谱别名"></label>'
      +'<label>外语菜谱名<button type="button" class="umt-language" id="umtLanguage">已配语种 '+count+'/10 <em>设置 ›</em></button></label>'
      +'<label><i>*</i> 烹饪分类<select data-umt-base="cooking">'+withCurrent(COOKING_OPTIONS.filter(x=>!dictState().isRemoved('cooking',x)),b.cooking).map(v=>opt(v,b.cooking)).join('')+'</select></label>'
      +'<label><i>*</i> 菜谱省份<select data-umt-base="province">'+withCurrent(PROVINCE_OPTIONS.filter(x=>!dictState().isRemoved('province',x)),b.province).map(v=>opt(v,b.province)).join('')+'</select></label>'
      +'<label><i>*</i> 出餐成品系数<div class="umt-percent"><input data-umt-base="yield" type="number" min="0.01" max="999.99" step="0.01" value="'+esc(b.yield)+'" placeholder="请输入出餐成品系数"><span>%</span></div><small>0.01–999.99，最多两位小数</small></label>'
      +'<label><i>*</i> 菜谱分类<div class="umt-category-cascade"><select id="umtCat1">'+catSelectable().map(x=>'<option'+(x[0]===b.cat1?' selected':'')+'>'+esc(x[0])+'</option>').join('')+'</select><span>›</span><select id="umtCat2">'+lv2.map(v=>opt(v,b.cat2)).join('')+'</select></div><small>来自分类管理，请先选择一级分类，再选择二级分类；停用项不可选</small></label>'
      +'<label><i>*</i> 菜系分类<select data-umt-base="cuisine">'+withCurrent(CUISINE_OPTIONS.filter(x=>!dictState().isRemoved('cuisine',x)),b.cuisine).map(v=>opt(v,b.cuisine)).join('')+'</select></label>'
      +'<label class="full">菜品简介<textarea data-umt-base="intro" placeholder="请输入菜品简介">'+esc(b.intro)+'</textarea></label>'
      +'</div></div>'
      +'<div class="umt-tag-picker"><h3><i>*</i> 菜品标签 <small>来自租户字典，可多选，只能选择二级标签</small></h3>'
      +tagGroupList().map((g,gi)=>'<section><h4>'+esc(g[0])+'</h4><div>'+g[1].map(x=>'<label><input type="checkbox" data-umt-tag data-umt-tag-group="'+gi+'" value="'+esc(x)+'"'+(b.tags.includes(x)?' checked':'')+'> '+esc(x)+'</label>').join('')+'</div></section>').join('')
      +(extraTags.length?'<section data-umt-tag-extra><h4>该菜谱其他标签</h4><div>'+extraTags.map(x=>'<label><input type="checkbox" data-umt-tag value="'+esc(x)+'"'+(b.tags.includes(x)?' checked':'')+'> '+esc(x)+'</label>').join('')+'</div></section>':'')
      +'<p class="umt-tag-note" data-umt-tag-count>已选 '+b.tags.length+' 个标签（至少选择 1 个）</p></div></section>';
  }
  /* 用料明细页签：只读派生（复用第 1 阶段的 ingRows/usesOf/sumOf 汇总，页面内无任何输入控件） */
  function editorIngredients(){return '<section class="umt-editor-section" id="umtDerivedIngredients">'+derivedIngredients(editorState.steps)+'</section>'}
  function stepDeviceHtml(s){
    const list=s.deviceConfigs||[],locked=list.length>0,pending=editorState.pendingVendor||'',models=deviceModelsOf(pending);
    const k=activeCfgIndex(s),cfg=list[k],acts=(cfg&&cfg.actions)||[];
    return '<section class="umt-device-model full" data-umt-device-block><div class="umt-section-head"><div><h3>适配设备型号 <i>*</i></h3><p>'+(locked?'每个加工步骤仅可关联一台设备；如需更换，请先删除下方已添加的设备。'+(list.length>1?'':'')+'':'每个加工步骤仅可关联一台设备，选择厂家与型号后点击「添加型号」。')+'</p></div></div>'
      +'<div class="umt-device-add'+(locked?' is-locked':'')+'"><select id="umtVendor"'+(locked?' disabled':'')+'><option value="">请选择设备厂家</option>'+deviceVendors().map(v=>'<option'+(v===pending?' selected':'')+'>'+esc(v)+'</option>').join('')+'</select><span>›</span><select id="umtModel"'+(locked||!pending?' disabled':'')+'>'+(pending?models.map(m=>'<option>'+esc(m.model)+'</option>').join(''):'<option value="">请先选择设备厂家</option>')+'</select><button class="um-primary" id="umtAddModel"'+(locked?' disabled':'')+'>＋ 添加型号</button></div>'
      +(locked?'<div class="umt-model-tabs">'+list.map((c,i)=>'<button type="button" class="'+(i===k?'active':'')+'" data-umt-model-tab="'+i+'">'+esc(c.vendor)+' · '+esc(c.model)+'<small>'+((c.actions||[]).length)+'步 · 料盒 '+deviceBoxes(c.vendor,c.model)+' 个</small><i data-umt-remove-model="'+i+'" title="删除该型号">×</i></button>').join('')+'</div>'
        +'<div class="umt-device-summary"><div><span>工艺类型</span><b>'+esc(s.type||'—')+'</b></div><div><span>关联设备</span><b>'+esc(cfg.vendor)+' · '+esc(cfg.model)+'</b></div><div><span>设备操作步骤</span><b>'+acts.length+'步</b></div></div>'
        +'<div class="umt-timeline-head"><div><h3>设备操作时间轴</h3><p>拖动步骤可调整执行顺序，起始时间将自动重新计算。</p></div><button class="um-primary" id="umtAddAction">＋ 添加设备操作步骤</button></div>'
        +'<div class="umt-timeline">'+(acts.length?acts.map((a,ai)=>'<article data-umt-action-row="'+ai+'" draggable="true"><i>'+(ai+1)+'</i><div><b>'+esc(actionLabel(a))+'</b><span>'+clock(actionStart(acts,ai))+' · 所需时间 '+esc(a.duration)+'S</span><p>锅设置：'+esc(actionPot(a))+'</p>'+((a.materials||[]).length?'<p>投料：'+a.materials.map(m=>esc(m.name)+' '+(hasAmt(m.amount)?fmtNum(m.amount)+esc(m.unit||'克'):DASH)).join('、')+'</p>':'')+(a.note?'<p>备注：'+esc(a.note)+'</p>':'')+'</div><div class="umt-action-ops"><button type="button" data-umt-action-insert="'+ai+'|before">在此前添加</button><button type="button" data-umt-action-edit="'+ai+'">编辑此步骤</button><button type="button" data-umt-action-insert="'+ai+'|after">在此后添加</button><button type="button" data-umt-action-remove="'+ai+'">删除</button></div></article>').join(''):'<div class="um-empty">暂无设备操作步骤：点击「添加设备操作步骤」配置第1步</div>')+'</div>'
        :'<div class="um-empty">请先选择设备厂家和设备型号，并点击「添加型号」。</div>')+'</section>';
  }
  function editorProcess(){
    const steps=editorState.steps,i=Math.min(editorState.activeStep,Math.max(steps.length-1,0)),s=steps[i];
    if(!s)return '<section class="umt-editor-section">暂无加工步骤</section>';
    const dev=s.mode==='device',names=PROCESS_NAMES[s.type]||[],off=s.cook===false;
    const nav='<aside class="umt-process-nav"><h3>加工流程（'+steps.length+'步）</h3><div class="umt-step-list">'+steps.map((x,si)=>'<div class="umt-step-item'+(si===i?' active':'')+'" data-umt-step="'+si+'" draggable="true"><span class="umt-step-grip">☷</span><i>'+(si+1)+'</i><span class="umt-step-meta"><b>'+esc(x.type||'第'+(si+1)+'步')+'</b><em class="umt-mode '+(x.mode==='device'?'device':'manual')+'">'+(x.mode==='device'?'设备加工':'人工处理')+'</em>'+(x.cook===false?'<em class="umt-step-off">不计入投料</em>':'')+'</span><button type="button" class="umt-step-remove" data-umt-remove-step="'+si+'"'+(steps.length<=1?' disabled':'')+' title="'+(steps.length<=1?'至少保留一个加工流程':'删除第'+(si+1)+'步')+'">×</button></div>').join('')+'</div><button class="umt-add-step" id="umtAddStep">＋ 新增加工流程</button></aside>';
    const head='<header><h3>制作步骤 '+(i+1)+' · '+esc(s.type||'')+'</h3><div class="umt-step-tools"><label class="umt-cook-switch'+(off?' off':'')+'" title="关掉后，本步的用料只记录加工过程，不计入投料量与备料量"><input type="checkbox" data-umt-step-cook'+(off?'':' checked')+'><span class="umt-cook-track"><i></i></span>计入烹饪投料</label>'+(off?'<span class="umt-step-off-flag">不计入投料</span>':'')+'<button type="button" id="umtStepUp"'+(i===0?' disabled':'')+'>↑ 上移</button><button type="button" id="umtStepDown"'+(i===steps.length-1?' disabled':'')+'>↓ 下移</button><span class="umt-mode-switch"><button type="button" class="'+(dev?'':'active')+'" data-umt-mode="manual">人工处理</button><button type="button" class="'+(dev?'active':'')+'" data-umt-mode="device">设备加工</button></span></div></header>';
    const typeSel='<label>工艺类型<select data-umt-step-field="type">'+PROCESS_TYPES.map(t=>'<option'+(t===s.type?' selected':'')+'>'+esc(t)+'</option>').join('')+'</select></label>';
    const manual=typeSel
      +'<label>工艺名称（选填）<select data-umt-step-field="processName"><option value="">请选择工艺名称（选填）</option>'+names.map(p=>'<option value="'+esc(p[0])+'"'+(p[0]===s.processName?' selected':'')+'>'+esc(p[0])+'</option>').join('')+'</select>'+(names.length?'<small>选择后自动把处理步骤写入「操作要求」</small>':'<small>该工艺类型暂无可用工艺名称</small>')+'</label>'
      +'<div class="full umt-assoc"><div class="umt-assoc-head"><span>关联用料</span><button type="button" class="um-secondary umt-inline-btn" id="umtAddAssoc">＋ 添加用料</button></div><div class="umt-assoc-list">'+((s.assoc||[]).length?(s.assoc||[]).map((e,ai)=>'<div class="umt-assoc-row" data-umt-assoc="'+i+'|'+ai+'"><span><b>'+esc(e.name)+'</b><em class="umt-assoc-tag '+(e.kind||'food')+'">'+(e.kind==='sku'?'商品':e.kind==='liquid'?'液体':e.kind==='powder'?'粉末':'标准食材')+'</em></span><input type="number" min="0" max="9999.99" step="0.01" placeholder="请输入用量" data-umt-assoc-amount="'+i+'|'+ai+'" value="'+esc(e.amount)+'"><i>'+esc(e.unit||'克')+'</i><button type="button" data-umt-assoc-remove="'+i+'|'+ai+'">×</button></div>').join(''):'<div class="umt-assoc-empty">未添加用料：点击「＋ 添加用料」选择标准食材或商品SKU，并填写用量</div>')+'</div></div>'
      +'<label class="full">操作要求<textarea data-umt-step-field="requirement">'+esc(s.requirement)+'</textarea></label>'
      +'<label>完成标准<input data-umt-step-field="standard" value="'+esc(s.standard)+'"></label>'
      +'<label>注意事项<input data-umt-step-field="attention" value="'+esc(s.attention)+'"></label>';
    const body=dev?(typeSel+stepDeviceHtml(s)):manual;
    return '<div class="umt-process-layout">'+nav+'<section class="umt-process-editor" data-umt-step-card="'+i+'">'+head+(off?'<div class="umt-step-off-note">本步不计入烹饪投料：用料只记录加工过程，不计入投料量与备料量，保存后列在「用料明细 → 过程用料」里。</div>':'')+'<div class="umt-step-fields'+((dev||off)?' has-state':'')+'"'+(off?' style="opacity:.62"':'')+'>'+body+'</div></section></div>';
  }
  /* 把当前页签的 DOM 值回写 editorState（只回写本次渲染出来的控件，避免切页签把标签等静默清空）；
     步骤字段回写到「当前渲染出来的那一步」（卡片自带 data-umt-step-card），
     避免先改 activeStep 再重渲染时把上一步的 DOM 值写进新选中的步骤 */
  function syncEditor(){const s=editorState;if(!s)return;
    if($('[data-umt-base]'))$$('[data-umt-base]').forEach(x=>s.base[x.dataset.umtBase]=x.value);
    if($('#umtCat1')&&$('#umtCat2')){s.base.cat1=$('#umtCat1').value;s.base.cat2=$('#umtCat2').value}
    if($$('[data-umt-tag]').length)s.base.tags=$$('[data-umt-tag]:checked').map(x=>x.value);
    if($('[data-umt-assoc-amount]'))$$('[data-umt-assoc-amount]').forEach(x=>{const p=x.dataset.umtAssocAmount.split('|').map(Number),st=s.steps[p[0]];if(st&&st.assoc&&st.assoc[p[1]])st.assoc[p[1]].amount=x.value});
    const card=$('[data-umt-step-card]');if(!card)return;
    const st=s.steps[+card.dataset.umtStepCard];if(!st)return;
    [...card.querySelectorAll('[data-umt-step-field]')].forEach(x=>{const k=x.dataset.umtStepField;
      if(k==='processName'){st.processName=x.value;const hit=(PROCESS_NAMES[st.type]||[]).find(p=>p[0]===x.value);if(hit)st.requirement=hit[1]}
      else st[k]=x.value});
    const ck=card.querySelector('[data-umt-step-cook]');if(ck)st.cook=ck.checked;
  }
  function moveStep(delta){const i=editorState.activeStep,j=i+delta;if(j<0||j>=editorState.steps.length)return;syncEditor();const m=editorState.steps.splice(i,1)[0];editorState.steps.splice(j,0,m);editorState.activeStep=j;drawTenantEditor(true);toast('加工流程顺序已更新')}
  function drawTenantEditor(noSync){if(!noSync)syncEditor();
    $('#umDrawerBody').innerHTML='<div class="umt-editor-root">'+editorTabs()+'<div class="umt-editor-content">'+(editorState.tab==='basic'?editorBasic():editorState.tab==='ingredients'?editorIngredients():editorProcess())+'</div></div>';
    $$('[data-umt-editor-tab]').forEach(x=>x.onclick=()=>{syncEditor();editorState.tab=x.dataset.umtEditorTab;drawTenantEditor(true)});
    if($('#umtImage'))$('#umtImage').onchange=()=>{syncEditor();editorState.base.image='uploaded';drawTenantEditor(true);toast('菜谱图片已更新')};
    if($('#umtCat1'))$('#umtCat1').onchange=e=>{syncEditor();editorState.base.cat1=e.target.value;editorState.base.cat2=catKids(e.target.value)[0]||editorState.base.cat2;drawTenantEditor(true)};
    if($('#umtCat2'))$('#umtCat2').onchange=()=>{syncEditor();drawTenantEditor(true)};
    if($('#umtLanguage'))$('#umtLanguage').onclick=openLanguageEditor;
    $$('[data-umt-tag]').forEach(x=>x.onchange=()=>{syncEditor();const n=$('[data-umt-tag-count]');if(n)n.textContent='已选 '+editorState.base.tags.length+' 个标签（至少选择 1 个）'});
    /* ---- 加工步骤 ---- */
    $$('[data-umt-step]').forEach(x=>{
      x.onclick=e=>{if(e.target.closest('[data-umt-remove-step]'))return;syncEditor();editorState.activeStep=+x.dataset.umtStep;drawTenantEditor(true)};
      x.ondragstart=e=>{e.dataTransfer.setData('text/recipe-step',x.dataset.umtStep);e.dataTransfer.effectAllowed='move'};
      x.ondragover=e=>e.preventDefault();
      x.ondrop=e=>{e.preventDefault();const from=+e.dataTransfer.getData('text/recipe-step'),to=+x.dataset.umtStep;if(!isFinite(from)||from===to)return;syncEditor();const m=editorState.steps.splice(from,1)[0];editorState.steps.splice(to,0,m);editorState.activeStep=to;drawTenantEditor(true);toast('加工流程顺序已更新')}});
    $$('[data-umt-remove-step]').forEach(x=>x.onclick=e=>{e.stopPropagation();if(editorState.steps.length<=1)return toast('至少保留一个加工流程');syncEditor();editorState.steps.splice(+x.dataset.umtRemoveStep,1);editorState.activeStep=Math.min(editorState.activeStep,editorState.steps.length-1);drawTenantEditor(true);toast('加工流程已删除，序号已自动更新')});
    if($('#umtAddStep'))$('#umtAddStep').onclick=()=>{syncEditor();editorState.steps.push({type:'预处理',mode:'manual',cook:true,processName:'',requirement:'',standard:'',attention:'',assoc:[],deviceConfigs:[]});editorState.activeStep=editorState.steps.length-1;drawTenantEditor(true);toast('已新增加工流程')};
    if($('#umtStepUp'))$('#umtStepUp').onclick=()=>moveStep(-1);
    if($('#umtStepDown'))$('#umtStepDown').onclick=()=>moveStep(1);
    if($('[data-umt-step-cook]'))$('[data-umt-step-cook]').onchange=e=>{const s=editorStep();s.cook=e.target.checked;drawTenantEditor();toast(e.target.checked?'第'+(editorState.activeStep+1)+'步已计入烹饪投料':'第'+(editorState.activeStep+1)+'步改为过程步骤：用料不计入投料量')};
    $$('[data-umt-step-field]').forEach(x=>{if(x.dataset.umtStepField==='type')x.onchange=()=>{syncEditor();const s=editorStep();if(!(PROCESS_NAMES[s.type]||[]).some(p=>p[0]===s.processName))s.processName='';drawTenantEditor()}});
    $$('[data-umt-mode]').forEach(x=>x.onclick=()=>{syncEditor();const s=editorStep(),to=x.dataset.umtMode;if(s.mode===to)return;
      if(to==='manual'&&(s.deviceConfigs||[]).length){const m=s.deviceConfigs[0];if(!confirm('切换为人工处理后，「'+m.vendor+' · '+m.model+'」及 '+((m.actions||[]).length)+' 个设备操作步骤将不再展示（配置保留，切回设备加工可继续使用），是否继续？'))return}
      s.mode=to;drawTenantEditor();toast(to==='device'?'已切换为设备加工':'已切换为人工处理')});
    if($('#umtAddAssoc'))$('#umtAddAssoc').onclick=()=>openIngredientPicker(editorState.activeStep);
    $$('[data-umt-assoc-remove]').forEach(x=>x.onclick=()=>{const p=x.dataset.umtAssocRemove.split('|').map(Number);syncEditor();editorState.steps[p[0]].assoc.splice(p[1],1);drawTenantEditor();toast('已移除该用料')});
    $$('[data-umt-assoc-amount]').forEach(x=>x.oninput=()=>{const p=x.dataset.umtAssocAmount.split('|').map(Number),st=editorState.steps[p[0]];if(st&&st.assoc&&st.assoc[p[1]])st.assoc[p[1]].amount=x.value});
    if($('#umtVendor'))$('#umtVendor').onchange=e=>{syncEditor();editorState.pendingVendor=e.target.value;drawTenantEditor(true)};
    if($('#umtAddModel'))$('#umtAddModel').onclick=()=>{syncEditor();const s=editorStep();if((s.deviceConfigs||[]).length)return toast('每个加工步骤仅可关联一台设备，如需更换请先删除已添加的设备');const vendor=$('#umtVendor')?$('#umtVendor').value:'',model=$('#umtModel')?$('#umtModel').value:'';if(!vendor||!model)return toast('请先选择设备厂家和设备型号');s.deviceConfigs=[{vendor,model,actions:[]}];editorState.pendingVendor='';editorState.deviceTab=0;drawTenantEditor(true);toast('设备型号已添加，请继续配置设备操作步骤')};
    $$('[data-umt-model-tab]').forEach(x=>x.onclick=e=>{if(e.target.closest('[data-umt-remove-model]'))return;syncEditor();editorState.deviceTab=+x.dataset.umtModelTab;drawTenantEditor(true)});
    $$('[data-umt-remove-model]').forEach(x=>x.onclick=e=>{e.stopPropagation();const s=editorStep(),k=+x.dataset.umtRemoveModel,m=(s.deviceConfigs||[])[k];if(!m)return;const n=(m.actions||[]).length;if(n&&!confirm('删除“'+m.vendor+' · '+m.model+'”后，该型号下的 '+n+' 个设备操作步骤将一并删除，是否继续？'))return;syncEditor();s.deviceConfigs.splice(k,1);editorState.deviceTab=Math.max(0,k-1);drawTenantEditor(true);toast('设备型号已删除')});
    if($('#umtAddAction'))$('#umtAddAction').onclick=()=>openActionEditor({index:null,insert:null});
    $$('[data-umt-action-edit]').forEach(x=>x.onclick=()=>openActionEditor({index:+x.dataset.umtActionEdit,insert:null}));
    $$('[data-umt-action-insert]').forEach(x=>x.onclick=()=>{const p=x.dataset.umtActionInsert.split('|');openActionEditor({index:null,insert:+p[0]+(p[1]==='after'?1:0)})});
    $$('[data-umt-action-remove]').forEach(x=>x.onclick=()=>{const s=editorStep(),cfg=activeCfg(s),i=+x.dataset.umtActionRemove;if(!cfg)return;if(!confirm('确认删除第 '+(i+1)+' 个设备操作步骤吗？'))return;cfg.actions.splice(i,1);drawTenantEditor();toast('设备操作步骤已删除，起始时间已重新计算')});
    $$('[data-umt-action-row]').forEach(x=>{
      x.ondragstart=e=>{e.dataTransfer.setData('text/recipe-action',x.dataset.umtActionRow);e.dataTransfer.effectAllowed='move'};
      x.ondragover=e=>e.preventDefault();
      x.ondrop=e=>{e.preventDefault();const cfg=activeCfg(editorStep());if(!cfg)return;const from=+e.dataTransfer.getData('text/recipe-action'),to=+x.dataset.umtActionRow;if(!isFinite(from)||from===to)return;const m=cfg.actions.splice(from,1)[0];cfg.actions.splice(to,0,m);drawTenantEditor();toast('设备操作步骤顺序已更新')}});
  }
  /* 外语菜谱名：10 语种弹窗（选填） */
  function openLanguageEditor(){
    const cur=editorState.base.foreign||{};
    document.body.insertAdjacentHTML('beforeend','<div class="um-mask show" id="umtLangMask"><aside class="umt-action-drawer umt-lang-drawer"><div class="um-drawer-head"><div><h2>配置外语菜谱名</h2><p>选填，最多可配置 10 个语种；种子数据只记录了语种数量，已按菜谱名回填，可自行修改</p></div><button class="um-close" id="umtLangClose">×</button></div><div class="um-drawer-body"><div class="umt-lang-list">'+LANGUAGES.map((l,i)=>'<label><span>'+esc(l)+'</span><input data-umt-lang="'+i+'" value="'+esc(cur[l]||'')+'" placeholder="选填"></label>').join('')+'</div></div><div class="um-drawer-foot"><button class="um-secondary" id="umtLangCancel">取消</button><span class="um-spacer"></span><button class="um-primary" id="umtLangSave">保存</button></div></aside></div>');
    const close=()=>{const m=$('#umtLangMask');if(m)m.remove()};
    $('#umtLangClose').onclick=close;$('#umtLangCancel').onclick=close;
    $('#umtLangMask').onclick=e=>{if(e.target.id==='umtLangMask')close()};
    $('#umtLangSave').onclick=()=>{const next={};$$('[data-umt-lang]').forEach(x=>{const v=x.value.trim();if(v)next[LANGUAGES[+x.dataset.umtLang]]=v});editorState.base.foreign=next;close();drawTenantEditor();toast('外语菜谱名已保存，已配语种 '+Object.keys(next).length+'/10')};
  }
  /* 选择用料：入口在步骤内（关联用料）；本步骤已添加过的项置灰不可重复选择 */
  function openIngredientPicker(si){
    const st=editorState.steps[si];if(!st)return;const catalog=ingredientCatalog();
    document.body.insertAdjacentHTML('beforeend','<div class="um-mask show" id="umtPickerMask"><aside class="umt-action-drawer umt-picker-drawer"><div class="um-drawer-head"><div><h2>选择用料</h2><p>可选商户示例用料 '+catalog.length+' 项（标准食材 / 液体 / 商品SKU）；用量按示例单位手工填写</p></div><button class="um-close" id="umtPickerClose">×</button></div><div class="um-drawer-body"><div class="umt-picker-list">'+catalog.map((x,i)=>{const has=(st.assoc||[]).some(a=>a.name===x.name&&(a.kind||'food')===(x.kind||'food'));return '<label class="umt-picker-row'+(has?' is-disabled':'')+'"><input type="checkbox" data-umt-pick="'+i+'"'+(has?' disabled checked':'')+'><span><b>'+esc(x.name)+'</b><small>'+esc(x.role||'')+' · 示例用量 '+esc(x.amount)+esc(x.unit||'克')+(x.spec?' · 规格 '+esc(x.spec):'')+'</small></span>'+(has?'<em>本步骤已添加</em>':'')+'</label>'}).join('')+'</div><p class="umt-picker-foot">已添加到本步骤的用料不可重复选择</p></div><div class="um-drawer-foot"><button class="um-secondary" id="umtPickerCancel">取消</button><span class="um-spacer"></span><button class="um-primary" id="umtPickerOk">确定</button></div></aside></div>');
    const close=()=>{const m=$('#umtPickerMask');if(m)m.remove()};
    $('#umtPickerClose').onclick=close;$('#umtPickerCancel').onclick=close;
    $('#umtPickerMask').onclick=e=>{if(e.target.id==='umtPickerMask')close()};
    $('#umtPickerOk').onclick=()=>{const pick=$$('[data-umt-pick]').filter(x=>x.checked&&!x.disabled).map(x=>catalog[+x.dataset.umtPick]);if(!pick.length){close();return toast('未选择任何用料')}st.assoc=st.assoc||[];pick.forEach(x=>st.assoc.push(copyOf(x)));close();drawTenantEditor();toast('已添加用料：'+pick.map(x=>x.name).join('、')+'，请填写用量（克）')};
  }
  /* 设备操作步骤编辑抽屉：锅设置 4 个下拉（功率/搅拌方向/搅拌速度/角度）；料盒编号按型号料盒数生成「料盒1…N」 */
  function openActionEditor(opt){
    const o=opt||{},s=editorStep(),cfg=activeCfg(s);if(!cfg)return toast('请先添加设备型号');
    const acts=cfg.actions||[],editing=o.index!=null?acts[o.index]:null,boxes=deviceBoxes(cfg.vendor,cfg.model);
    const st={duration:editing?String(editing.duration):'20',feed:editing?(editing.action==='火力'?'fire':editing.action==='投料'?'solid':editing.action==='液体'?'liquid':'powder'):'fire',power:editing&&editing.power?editing.power:'5KW',direction:editing&&editing.direction?editing.direction:'顺时针',speed:editing&&editing.speed?editing.speed:'慢速',position:editing&&editing.position?editing.position:'低位',feedMethod:editing&&editing.feedMethod?editing.feedMethod:'auto',box:editing&&editing.box?String(editing.box):'1',note:editing&&editing.note?editing.note:'',materials:(editing&&editing.materials?copyOf(editing.materials):[])};
    const title=editing?'编辑设备操作步骤':(o.insert!=null?'在第 '+(o.insert+1)+' 步之前插入':'添加设备操作步骤');
    const listFor=feed=>feed==='liquid'?FEED_LIQUID.map(n=>ing('liquid',n,'','克','调味料','原料','无需切配','','三方接口清单')):feed==='powder'?FEED_POWDER.map(n=>ing('powder',n,'','克','调味料','原料','无需切配','','三方接口清单')):ingredientCatalog();
    document.body.insertAdjacentHTML('beforeend','<div class="um-mask show" id="umtActionMask"><aside class="umt-action-drawer" id="umtActionDrawer"><div class="um-drawer-head"><div><h2>'+esc(title)+'</h2><p>'+esc(cfg.vendor)+' · '+esc(cfg.model)+'　配置设备能力</p></div><button class="um-close" id="umtActionClose">×</button></div><div class="um-drawer-body"><div class="umt-action-form">'
      +'<label>所需时间 <i class="req">*</i><div class="umt-percent"><input id="umtDuration" type="number" value="'+esc(st.duration)+'" placeholder="请输入所需时长（整数），不能为0"><span>S</span></div></label>'
      +'<label>锅设置 <i class="req">*</i><div class="umt-pot-settings" id="umtPotSettings">'
      +'<select data-umt-pot="power">'+POT_POWER.map(x=>'<option'+(x===st.power?' selected':'')+'>'+x+'</option>').join('')+'</select>'
      +'<select data-umt-pot="direction">'+POT_DIRECTION.map(x=>'<option'+(x===st.direction?' selected':'')+'>'+x+'</option>').join('')+'</select>'
      +'<select data-umt-pot="speed">'+POT_SPEED.map(x=>'<option'+(x===st.speed?' selected':'')+'>'+x+'</option>').join('')+'</select>'
      +'<select data-umt-pot="position">'+POT_POSITION.map(x=>'<option'+(x===st.position?' selected':'')+'>'+x+'</option>').join('')+'</select></div></label>'
      +'<label>动作 <i class="req">*</i><div class="umt-action-tabs">'+[['fire','火力'],['solid','投料'],['liquid','液体'],['powder','粉末']].map(x=>'<button type="button" class="'+(st.feed===x[0]?'active':'')+'" data-umt-action-type="'+x[0]+'">'+x[1]+'</button>').join('')+'</div></label>'
      +'<div id="umtFeedFields"></div>'
      +'<label>备注<textarea id="umtActionNote" placeholder="请输入设备操作备注">'+esc(st.note)+'</textarea></label>'
      +'</div></div><div class="um-drawer-foot"><button class="um-secondary" id="umtActionCancel">取消</button><span class="um-spacer"></span><button class="um-secondary" id="umtActionReset">重置</button><button class="um-primary" id="umtActionSave">提交</button></div></aside></div>');
    const close=()=>{const m=$('#umtActionMask');if(m)m.remove()};
    const syncMats=()=>$$('[data-umt-material-amount]').forEach(x=>{const m=st.materials.find(y=>y.name===x.dataset.umtMaterialAmount);if(m)m.amount=x.value});
    const potSync=()=>$$('[data-umt-pot]').forEach(x=>{st[x.dataset.umtPot]=x.value});
    const renderFeed=()=>{const host=$('#umtFeedFields');if(!host)return;syncMats();potSync();
      if(st.feed==='fire'){host.innerHTML='<p class="umt-feed-note">「火力」动作不投料，投料明细不适用。</p>';return}
      const list=listFor(st.feed),third=st.feed==='liquid'||st.feed==='powder';
      host.innerHTML='<div class="umt-feed-head"><b>投料明细</b><span>'+(third?'液体/粉末清单由三方接口提供，不能自行添加；用量单位统一按「克」填写':'可选择商户示例用料与商品SKU；用量按示例单位填写')+'</span></div>'
        +(st.feed==='solid'?'<div class="feed-method"><span>投料方式</span><label><input type="radio" name="umtFeedMethod" value="auto"'+(st.feedMethod==='auto'?' checked':'')+'> 自动投料</label><label><input type="radio" name="umtFeedMethod" value="manual"'+(st.feedMethod==='manual'?' checked':'')+'> 手动投料</label></div>'+(st.feedMethod==='auto'?'<label class="umt-box-label">料盒编号<select id="umtBox">'+Array.from({length:boxes},(_,i)=>'<option value="'+(i+1)+'"'+(String(i+1)===String(st.box)?' selected':'')+'>料盒'+(i+1)+'</option>').join('')+'</select></label>':'<p class="umt-feed-note">手动投料不选择料盒编号。</p>'):'')
        +'<div class="device-material-selector">'+list.map(x=>{const sel=st.materials.find(y=>y.name===x.name);return '<label class="device-material-row'+(sel?' selected':'')+'"><input type="checkbox" data-umt-material="'+esc(x.name)+'"'+(sel?' checked':'')+'><span><b>'+esc(x.name)+'</b><small>'+(third?'三方清单项':'示例用量 '+esc(x.amount)+esc(x.unit||'克'))+'</small></span>'+(sel?'<input type="number" data-umt-material-amount="'+esc(x.name)+'" value="'+esc(sel.amount)+'" placeholder="请输入用量（克）"><em>克</em>':'')+'</label>'}).join('')+'</div>';
      $$('[name="umtFeedMethod"]',host).forEach(x=>x.onchange=()=>{st.feedMethod=x.value;renderFeed()});
      $$('[data-umt-material]',host).forEach(x=>x.onchange=()=>{const name=x.dataset.umtMaterial,src=list.find(y=>y.name===name);st.materials=st.materials.filter(y=>y.name!==name);if(x.checked)st.materials.push(third?ing(st.feed==='liquid'?'liquid':'powder',name,'','克','调味料','原料','无需切配','','三方接口清单'):copyOf(src));renderFeed()});
      $$('[data-umt-material-amount]',host).forEach(x=>x.oninput=()=>{const m=st.materials.find(y=>y.name===x.dataset.umtMaterialAmount);if(m)m.amount=x.value})};
    $$('[data-umt-action-type]').forEach(b=>b.onclick=()=>{st.feed=st.feed===b.dataset.umtActionType?'':b.dataset.umtActionType;if(st.feed==='fire')st.materials=[];$$('[data-umt-action-type]').forEach(y=>y.classList.toggle('active',y.dataset.umtActionType===st.feed));renderFeed()});
    renderFeed();
    $('#umtActionClose').onclick=close;$('#umtActionCancel').onclick=close;
    $('#umtActionMask').onclick=e=>{if(e.target.id==='umtActionMask')close()};
    $('#umtActionReset').onclick=()=>{st.duration='20';st.feed='fire';st.power='5KW';st.direction='顺时针';st.speed='慢速';st.position='低位';st.feedMethod='auto';st.box='1';st.note='';st.materials=[];syncMats();close();openActionEditor(opt)};
    $('#umtActionSave').onclick=()=>{syncMats();potSync();
      const dur=Number($('#umtDuration').value);if(!dur||!Number.isInteger(dur)||dur<=0)return toast('请输入所需时长（整数），不能为0');
      if(!st.power||!st.direction||!st.speed||!st.position)return toast('请完整选择锅设置');
      if(!st.feed)return toast('请选择动作');
      if(st.feed!=='fire'){const miss=st.materials.find(x=>!(Number(x.amount)>0));if(miss)return toast('请填写「'+miss.name+'」的投料量（克）')}
      const label=st.feed==='fire'?'火力':st.feed==='solid'?'投料':st.feed==='liquid'?'液体':'粉末';
      const rec={duration:dur,action:label,detail:st.power+' · '+st.direction+' · '+st.speed+' · '+st.position,power:st.power,direction:st.direction,speed:st.speed,position:st.position,feedMethod:st.feedMethod,box:st.feed==='solid'&&st.feedMethod==='auto'?($('#umtBox')?$('#umtBox').value:st.box):'',note:$('#umtActionNote')?$('#umtActionNote').value:'',materials:st.feed==='fire'?[]:copyOf(st.materials)};
      if(editing)acts[o.index]=rec;else acts.splice(o.insert!=null?o.insert:acts.length,0,rec);
      close();drawTenantEditor();toast(editing?'设备操作步骤已修改':'设备操作步骤已添加')};
  }
  /* 校验顺序：基础信息 → 加工步骤（设备型号缺失 / 无投料 / 投料量非法）；「用料明细」页签不出现错误角标 */
  function validateAll(){
    const s=editorState,b=s.base,steps=s.steps,errs=new Set();let first='',msg='',pri=9;
    const put=(m,p)=>{if(p<pri){msg=m;pri=p}};
    const rate=Number(b.yield);
    if(!b.image||!b.name.trim()||!b.alias.trim()||!b.cooking||!b.province||!b.cat1||!b.cat2||!b.cuisine||!b.tags.length||!isFinite(rate)||rate<0.01||rate>999.99){errs.add('basic');first='basic';put('存在未完成的必填内容，请完善后提交',1)}
    const badStep=!steps.length||steps.some(x=>x.mode==='device'&&(!(x.deviceConfigs||[]).length||x.deviceConfigs.some(c=>!(c.actions||[]).length)));
    if(badStep){errs.add('process');if(!first)first='process';put('存在未完成的必填内容，请完善后提交',1)}
    const made=ingRows(steps).filter(r=>usesOf(r,true).length).length,badAmt=collectBadAmount(steps);
    if(!made){errs.add('process');if(!first)first='process';put((steps.length&&steps.every(x=>x.cook===false))?'当前所有步骤都设为「不计入投料」，投料量为 0；请至少保留一个「计入烹饪投料」的步骤':'请在加工步骤中添加用料（可添加标准食材或商品SKU）',(steps.length&&steps.every(x=>x.cook===false))?2:3)}
    if(badAmt){errs.add('process');if(!first)first='process';put(badAmt,4)}
    s.errs=errs;
    if(!errs.size)return true;
    s.tab=first||'process';
    drawTenantEditor();
    setTimeout(()=>{const el=$('.umt-editor-content input:not([type=checkbox]),.umt-editor-content select,.umt-editor-content textarea');if(el)el.focus()},0);
    toast(msg||'存在未完成的必填内容，请完善后提交');
    return false;
  }
  /* 保存/提交：新建 → localId CP+时间戳 / source 自建 / status 草稿|已上架 / localVersion V1；
     编辑 → 保留原 status 与 localVersion（版本不自增），只回写已知业务字段 + detail */
  function saveTenantEditor(draft){
    syncEditor();
    /* 保存草稿完全不校验（租户端口径），提交走全量校验 */
    if(!draft&&!validateAll())return;
    const b=editorState.base,steps=editorState.steps,d=editorState.source;
    const rows=ingRows(steps),devs=steps.filter(x=>x.mode==='device').flatMap(x=>(x.deviceConfigs||[]).map(c=>c.vendor+'·'+c.model));
    const detail={foreign:Object.values(b.foreign||{}).filter(Boolean).length,foreignNames:Object.assign({},b.foreign),province:b.province,yield:num2(b.yield),cuisine:b.cuisine,intro:b.intro,image:b.image,steps:copyOf(steps)};
    const data={name:b.name.trim(),alias:b.alias.trim(),category:b.cat1+' / '+b.cat2,cooking:b.cooking,tags:[...b.tags],
      process:steps.some(x=>x.mode==='device')?'含设备加工':'纯人工',
      devices:devs.length?(devs.length>1?devs[0]+' 等'+devs.length+'种':devs[0]):'—',
      ingredients:rows.length,detail,updated:'刚刚',updatedBy:'食堂菜谱管理员'};
    if(d)Object.assign(d,data);
    else stores[ensureOrg()].unshift(Object.assign({},data,{localId:'CP'+Date.now().toString().slice(-9),source:'自建',status:draft?'草稿':'已上架',localVersion:'V1'}));
    closeDrawer();render();toast(d?(draft?'菜谱草稿已保存':'菜谱修改已提交'):(draft?'菜谱草稿已保存':'菜谱已提交'));
  }
  /* ===== 查看（菜谱详情）渲染辅助 =====
     详情是只读派生视图：用料明细由各步骤的关联用料汇总，营养预览由这份汇总派生；
     全部按所选菜谱对象真实渲染，字段缺就交给 dash() 统一显示全角「—」。 */
  const DASH='—';
  const dash=v=>{const t=String(v??'').trim();return !t||t==='-'?DASH:t};
  const num2=v=>Math.round((Number(v)||0)*100)/100;
  const fmtNum=v=>{const n=Number(v);return !isFinite(n)?DASH:String(Math.round(n*100)/100)};
  const clock=sec=>`00:${String(Math.floor((Number(sec)||0)/60)).padStart(2,'0')}:${String((Number(sec)||0)%60).padStart(2,'0')}`;
  /* 投料量判空：''/null/非数字都算缺失 → 显示「—」，否则显示「数值 单位」 */
  const hasAmt=v=>String(v??'').trim()!==''&&isFinite(Number(v));
  const detailOf=d=>JSON.parse(JSON.stringify(d.detail||detailSeed[d.name]||{steps:[]}));
  /* 「最新授权版本」= 同一份数据的另一版本快照（多一个语种、成品系数随新工艺调整、投料量按新配方、多一条设备动作），不是写死的常量串 */
  const latestOf=m=>{const x=JSON.parse(JSON.stringify(m));
    if(x.foreign!=null)x.foreign=Math.min(10,x.foreign+1);
    if(x.yield!=null)x.yield=num2(x.yield-2);
    if(x.intro)x.intro=`${x.intro}（最新授权版本按新配方调整）`;
    for(const st of x.steps||[]){const c=(st.deviceConfigs||[])[0];if(!c)continue;const a=(c.actions||[]).find(y=>(y.materials||[]).length);if(!a)continue;
      a.materials.forEach(m2=>{if(hasAmt(m2.amount))m2.amount=String(num2(Number(m2.amount)+200))});
      c.actions.push(act(10,'投料','料盒1 · 自动投料',[],{feedMethod:'自动'}));break}
    return x};
  /* 用料汇总：同名（kind+name）跨步骤求和；cook===false 的步骤只进「过程用料（不计入）」 */
  const ingRows=steps=>{const map=new Map();
    (steps||[]).forEach((s,si)=>{const counted=s.cook!==false,type=s.type||`第${si+1}步`;
      const push=e=>{if(!e||!e.name)return;const key=`${e.kind||'food'}:${e.name}`;
        if(!map.has(key))map.set(key,{key,kind:e.kind||'food',name:e.name,unit:e.unit||'克',role:e.role,state:e.state,cut:e.cut,spec:e.spec,note:e.note,total:0,totalOk:false,excluded:0,excludedOk:false,uses:[]});
        const r=map.get(key),ok=hasAmt(e.amount),amt=ok?num2(e.amount):0;
        if(counted){r.total=num2(r.total+amt);r.totalOk=r.totalOk||ok}else{r.excluded=num2(r.excluded+amt);r.excludedOk=r.excludedOk||ok}
        const u=r.uses.find(x=>x.si===si);if(u){u.amount=num2(u.amount+amt);u.ok=u.ok||ok}else r.uses.push({si,type,amount:amt,ok,counted})};
      (s.mode==='device'?[]:(s.assoc||[])).forEach(push);   /* 设备步骤的用料只在投料明细里维护，不重复计入 */
      (s.mode==='device'?(s.deviceConfigs||[]):[]).forEach(c=>(c.actions||[]).forEach(a=>(a.materials||[]).forEach(push)))});
    return [...map.values()]};
  const usesOf=(r,counted)=>r.uses.filter(u=>u.counted===counted);
  const sumOf=(rows,f,ok)=>num2(rows.reduce((n,r)=>n+(r[ok]?Number(r[f])||0:0),0));
  /* 营养预览：PRD 未定义计算公式，这里按「用料汇总」派生一组演示值 —— 同一菜谱稳定，不同菜谱/不同版本不同 */
  const nutritionOf=(rows,seedStr)=>{const g=num2(rows.reduce((n,r)=>n+r.total+r.excluded,0))||1;
    const h=(()=>{let x=7;for(let i=0;i<seedStr.length;i++)x=(x*31+seedStr.charCodeAt(i))>>>0;return x})();
    const j=(i,lo,hi,dec)=>{const v=lo+((h>>>((i*4)%24))%1000)/1000*(hi-lo);return Number(v.toFixed(dec==null?2:dec))};
    const e=Number((g*1.42+j(0,40,160,0)).toFixed(0)),p=num2(g*0.052+j(1,1,6)),f=num2(g*0.058+j(2,1,8)),c=num2(g*0.081+j(3,1,9));
    return {core:[e,p,f,c],groups:[
      ['核心营养',[['能量',e,'kcal'],['蛋白质',p,'g'],['脂肪',f,'g'],['碳水化合物',c,'g'],['粗纤维',num2(g*0.006+j(4,0.2,2)),'g'],['胆固醇',num2(g*0.03+j(5,1,20),1),'mg']]],
      ['脂肪酸',[['单不饱和脂肪酸',num2(f*0.42+j(6,0.5,3)),'g'],['多不饱和脂肪酸',num2(f*0.38+j(7,0.5,3)),'g'],['饱和脂肪酸占比',num2(28+j(8,0,18),1),'%'],['反式脂肪酸',num2(j(9,0,0.3)),'g']]],
      ['矿物质',[['钙',num2(g*0.012+j(10,2,40),1),'mg'],['镁',num2(g*0.004+j(11,1,12),1),'mg'],['钠',num2(g*0.02+j(12,1,9),1),'mg'],['钾',num2(g*0.01+j(13,1,9),1),'mg'],['磷',num2(g*0.014+j(14,3,30),1),'mg'],['铁',num2(g*0.004+j(15,0.5,5),1),'mg']]],
      ['维生素',[['维生素A',num2(j(16,0,60),1),'μg'],['维生素C',num2(j(17,0,12),1),'mg'],['维生素D',num2(j(18,0,3)),'μg'],['维生素E',num2(j(19,5,45)),'mg'],['维生素K',num2(j(20,0,3)),'μg'],['维生素B1',num2(j(21,0,1)),'mg']]]]};
  };
  /* 用料明细的只读派生渲染：查看页签与编辑页签共用同一份实现（复用第 1 阶段的 ingRows/usesOf/sumOf） */
  const derivedIngredients=steps=>{const rows=ingRows(steps),cook=rows.filter(r=>usesOf(r,true).length),proc=rows.filter(r=>usesOf(r,false).length),cookSum=sumOf(cook,'total','totalOk'),procSum=sumOf(proc,'excluded','excludedOk'),dup=cook.filter(r=>r.uses.length>1).length;
      const table=(list,counted)=>`<table class="umt-detail-table"><thead><tr><th>用料角色</th><th>标准食材</th><th>投料量</th><th>投料状态</th><th>切配方式</th><th>切配规格</th><th>说明</th></tr></thead><tbody>${list.map(r=>{const a=counted?{v:r.total,ok:r.totalOk}:{v:r.excluded,ok:r.excludedOk},n=usesOf(r,counted).length;
        return `<tr><td>${esc(dash(r.role))}</td><td><b>${esc(r.name)}</b>${r.kind==='sku'?'<em class="umt-kind sku">商品</em>':r.kind==='liquid'?'<em class="umt-kind liquid">液体</em>':''}</td><td>${a.ok?`${fmtNum(a.v)} ${esc(r.unit)}`:DASH}</td><td>${esc(dash(r.state))}</td><td>${esc(dash(r.cut))}</td><td>${esc(dash(r.spec))}</td><td>${esc(dash(r.note))}</td></tr>${r.uses.length>1?`<tr class="umt-dup-row"><td colspan="7">同一用料登记在 ${r.uses.length} 个步骤：${usesOf(r,counted).slice().sort((x,y)=>x.si-y.si).map(u=>`${esc(u.type)} ${fmtNum(u.amount)}${esc(r.unit)}${u.counted?'':'（不计入）'}`).join(' + ')}；投料量按其中计入的 ${n} 处计 ${fmtNum(r.total)} ${esc(r.unit)}</td></tr>`:''}`}).join('')}</tbody></table>`;
      const head=`<div class="umt-section-head"><h3>用料明细</h3><span>共 ${rows.length} 项</span></div>`;
      const note=`<p class="umt-derive-note">用料明细由加工步骤自动汇总（只读）：同名用料跨步骤合并，只有打开「计入烹饪投料」的步骤累加投料量，其余步骤的用料列为「过程用料」（合计按「克」累加）。</p>`;
      const balance=`<div class="umt-balance"><span class="cook">烹饪投料（计入）<b>${cook.length} 项</b><em>${fmtNum(cookSum)} 克</em></span>${proc.length?`<span class="proc">过程用料（不计入投料）<b>${proc.length} 项</b><em>${fmtNum(procSum)} 克</em></span>`:''}</div>`;
      if(!rows.length)return `${head}${note}<div class="umt-table-empty">暂无用料：请到该菜谱的「加工步骤」里登记关联用料或设备投料明细。</div>`;
      return `${head}${note}${balance}${dup?`<div class="umt-dup-hint">有 ${dup} 项用料在多个步骤重复登记；投料量只按「计入烹饪投料」的步骤计算，请看下方说明。</div>`:''}<section class="umt-cook-block"><header><b>烹饪投料（计入）</b><span>备料、排产与投料都以这一份为准</span></header>${cook.length?table(cook,true):'<div class="umt-table-empty">当前没有计入烹饪投料的用料。</div>'}</section>${proc.length?`<details class="umt-proc-block"><summary>过程用料（不计入投料）<b>${proc.length} 项 · ${fmtNum(procSum)} 克</b></summary><p class="umt-derive-note">仅用于记录加工过程（预处理、腌制、清洗等），不计入投料量。</p>${table(proc,false)}</details>`:''}`};


  function tenantStyleDetailV2(d){
    let versionMode='current',contentTab='basic',modelSel={};   /* modelSel 按步骤记录当前查看的设备型号下标 */
    const model=detailOf(d),latestModel=latestOf(model),latestVersion=d.version||'V3',hasLatest=d.source==='租户授权'&&d.newVersion;
    function basic(latest){const m=latest?latestModel:model;const fields=[['菜谱名称',d.name],['别名',d.alias],['外语菜谱名',m.foreign==null?'':`${m.foreign}/10`],['烹饪分类',dictText('cooking',d.cooking)],['菜谱省份',m.province],['出餐成品系数',m.yield==null?'':`${fmtNum(m.yield)}%`],['菜谱分类',d.category],['菜系分类',m.cuisine],['菜谱标签',tagsText(d.tags)]];return `<section class="umt-detail-identity"><span>菜</span><div><h3>${esc(d.name)}</h3><p>${esc(d.localId)} · ${latest?`最新授权版本 ${esc(latestVersion)}`:esc(dash(d.localVersion))}</p></div><em class="um-status ${d.status==='已上架'?'up':d.status==='草稿'?'draft':'down'}">${esc(d.status)}</em></section><section class="um-section"><h3>基础信息</h3><div class="um-detail-grid">${fields.map(x=>`<div class="um-detail-field"><span>${x[0]}</span><b>${esc(dash(x[1]))}</b></div>`).join('')}<div class="um-detail-field full"><span>菜谱简介</span><b>${esc(dash(m.intro))}</b></div></div></section>`}
    function ingredient(latest){return `<section class="um-section">${derivedIngredients((latest?latestModel:model).steps)}</section>`}
    function process(latest){const steps=(latest?latestModel:model).steps;if(!steps.length)return '<div class="umt-detail-process"><div class="umt-table-empty">该菜谱暂无加工步骤。</div></div>';
      const timeline=c=>{if(!c||!(c.actions||[]).length)return '<div class="umt-table-empty">该型号尚无设备操作步骤。</div>';let t=0;
        return (c.actions||[]).map((a,i)=>{const st=t;t+=Number(a.duration)||0;return `<article><i>${i+1}</i><div><b>${esc(a.action||'操作')}</b><span>${clock(st)} · ${esc(a.duration)}秒</span><p>${esc(dash(a.detail))}</p>${(a.materials||[]).length?`<p>投料：${a.materials.map(m=>`${esc(m.name)} ${hasAmt(m.amount)?fmtNum(m.amount)+esc(m.unit||'克'):DASH}`).join('、')}</p>`:''}</div></article>`}).join('')};
      return `<div class="umt-detail-process">${steps.map((s,si)=>{const isDev=s.mode==='device',cfgs=s.deviceConfigs||[],mi=Math.min(modelSel[si]||0,Math.max(cfgs.length-1,0)),cfg=cfgs[mi];
        return `<section class="umt-process-card"><header><i>${si+1}</i><div><b>${esc(s.type||`第${si+1}步`)}</b><span>第${si+1}步</span></div><em class="umt-mode ${isDev?'device':'manual'}">${isDev?'设备加工':'人工处理'}</em>${s.cook===false?'<em class="umt-cook-flag">不计入投料</em>':''}</header>${isDev?`<div class="umt-model-box"><h4>适配设备型号</h4>${cfgs.length?`<div class="umt-model-tabs">${cfgs.map((c,ci)=>`<button class="${mi===ci?'active':''}" data-umt-v2-model="${si}|${ci}">${esc(c.vendor)} · ${esc(c.model)}<small>${(c.actions||[]).length}步</small></button>`).join('')}</div><div class="umt-timeline">${timeline(cfg)}</div>`:'<div class="umt-table-empty">该步骤尚未配置适配设备型号。</div>'}</div>`:`<div class="umt-manual-detail"><p class="full"><b>关联对象：</b>${(s.assoc||[]).length?s.assoc.map(e=>`${esc(e.name)} ${hasAmt(e.amount)?fmtNum(e.amount)+esc(e.unit||'克'):DASH}`).join('、'):DASH}</p><p><b>操作要求：</b>${esc(dash(s.requirement))}</p><p><b>完成标准：</b>${esc(dash(s.standard))}</p><p><b>注意事项：</b>${esc(dash(s.attention))}</p></div>`}</section>`}).join('')}</div>`}
    function nutrition(){const rows=ingRows(model.steps);if(!rows.length)return `<div class="umt-nutrition" data-umt-nutrition="none"><section><div><h3>营养预览</h3><p>根据当前菜谱用料及用量，由营养获取接口返回。</p></div><span class="umt-nut-off">● 未获取营养数据<small>该菜谱尚未登记用料，暂无可用于计算的用量</small></span></section><div class="umt-nutrition-core">${[['能量','kcal'],['蛋白质','g'],['脂肪','g'],['碳水化合物','g']].map(x=>`<div><span>${x[0]}</span><b>${DASH} ${x[1]}</b></div>`).join('')}</div><section class="um-section"><h3>核心营养</h3><div class="umt-nutrition-grid">${['能量','蛋白质','脂肪','碳水化合物','粗纤维','胆固醇'].map(x=>`<div><span>${x}</span><b>${DASH}</b></div>`).join('')}</div></section></div>`;const n=nutritionOf(rows,`${d.name}|${(d.tags||[]).join(',')}`),core=[['能量',n.core[0],'kcal'],['蛋白质',n.core[1],'g'],['脂肪',n.core[2],'g'],['碳水化合物',n.core[3],'g']];return `<div class="umt-nutrition"><section><div><h3>营养预览</h3><p>根据当前菜谱用料及用量，由营养获取接口返回。</p></div><span>● 营养数据获取成功<small>最近获取：${esc(d.updated||DASH)}</small></span></section><div class="umt-nutrition-core">${core.map(x=>`<div><span>${x[0]}</span><b>${x[1]} ${x[2]}</b></div>`).join('')}</div>${n.groups.map(g=>`<section class="um-section"><h3>${g[0]}</h3><div class="umt-nutrition-grid">${g[1].map(x=>`<div><span>${x[0]}</span><b>${x[1]} ${x[2]}</b></div>`).join('')}</div></section>`).join('')}</div>`}
    function draw(){const latest=versionMode==='latest';if(latest&&contentTab==='nutrition')contentTab='basic';
      /* 页签顺序对齐租户端：1 基础信息 / 2 加工步骤 / 3 用料明细 / 4 营养预览（「最新授权版本」不含营养预览） */
      const tabs=[['basic','1 基础信息'],['process','2 加工步骤'],['ingredients','3 用料明细'],...latest?[]:[['nutrition','4 营养预览']]];
      $('#umDrawerBody').innerHTML=`${hasLatest?`<div class="umt-version-tabs"><button class="${latest?'':'active'}" data-umt-version="current">当前版本</button><button class="${latest?'active':''}" data-umt-version="latest">最新授权版本 <span>NEW</span></button></div>`:''}<div class="umt-detail-tabs">${tabs.map(x=>`<button class="${contentTab===x[0]?'active':''}" data-umt-detail-tab="${x[0]}">${x[1]}</button>`).join('')}</div><div class="umt-detail-content">${contentTab==='basic'?basic(latest):contentTab==='process'?process(latest):contentTab==='ingredients'?ingredient(latest):nutrition()}</div>`;
      /* 没有「更新到此版本」按钮的菜谱（自建 / 无新版本）原来在这里取 null.hidden 抛错，导致下面几行绑定不执行、详情页签点不动 —— 先判空 */
      const upd=$('#umtUpdateVersion');if(upd)upd.hidden=!latest;const ed=$('#umtDetailEdit');if(ed)ed.hidden=latest;   /* 租户端 draw(): eb.hidden=latest —— 「最新授权版本」态下与「更新到此版本」互斥 */$$('[data-umt-version]').forEach(x=>x.onclick=()=>{versionMode=x.dataset.umtVersion;contentTab='basic';draw()});$$('[data-umt-detail-tab]').forEach(x=>x.onclick=()=>{contentTab=x.dataset.umtDetailTab;draw()});$$('[data-umt-v2-model]').forEach(x=>x.onclick=()=>{const p=x.dataset.umtV2Model.split('|');modelSel[p[0]]=+p[1];draw()})}
    maskClose=false;   /* 查看抽屉对齐租户端：不响应遮罩点击关闭，只认头部 × 与底部「关闭」 */
    drawer('菜谱详情',`${esc(d.localId)} · ${esc(d.name)}`,'',`<span class="um-spacer"></span><button class="um-secondary" id="umtDetailClose">关闭</button><button class="um-primary" id="umtDetailEdit">编辑菜谱</button>${hasLatest?`<button class="um-primary" id="umtUpdateVersion" hidden>更新到此版本</button>`:''}`);
    $('#umMask .um-drawer').classList.add('tenant-wide','tenant-detail');   /* 详情宽度按租户端 min(1180px,96vw)；编辑/同步抽屉仍走 .tenant-wide */
    $('#umtDetailClose').onclick=closeDrawer;
    /* 与租户端 $('#editUnifiedRecipe').onclick=()=>{close();openTenantDishEditor(d)} 等价：
       关掉查看抽屉 → 复用既有编辑入口；openEdit 只 add('tenant-wide')，这里顺手摘掉查看态的 tenant-detail 标记，
       使编辑抽屉的 class 与「列表行内点编辑」完全一致（closeDrawer() 只隐藏遮罩、不清 class） */
    $('#umtDetailEdit').onclick=()=>{closeDrawer();$('#umMask .um-drawer').classList.remove('tenant-detail');openEdit(d)};
    if(hasLatest)$('#umtUpdateVersion').onclick=()=>{if(d.status==='已上架'&&!confirm('该菜谱当前已上架，更新后新内容将立即生效。确认更新到最新授权版本吗？'))return;d.newVersion=false;d.localVersion=latestVersion;d.updated='刚刚';closeDrawer();render();toast('菜谱已更新至最新授权版本')};
    draw()
  }
  openDetail=tenantStyleDetailV2;openEdit=tenantStyleEditor;
  /* 排餐计划的「去设置」用：直接落到菜谱分类页 */
  window.MerchantRecipeView={categories(){currentView='categories';enter()}};
  const oldNav=$('#recipeNav');if(oldNav){const nav=oldNav.cloneNode(true);oldNav.replaceWith(nav);nav.querySelector('span').textContent='菜谱管理';nav.addEventListener('click',e=>{e.stopImmediatePropagation();currentView='hub';enter()},true)}
  const deviceNav=$('#deviceRecipeNav');if(deviceNav)deviceNav.style.display='none';const categoryNav=$('#dishCategoryNav');if(categoryNav)categoryNav.style.display='none';
  const observer=new MutationObserver(()=>{const pg=page();if(pg&&!pg.hidden&&currentView!=='hub')render()});if($('#currentOrganization'))observer.observe($('#currentOrganization'),{childList:true,characterData:true,subtree:true});
})();
