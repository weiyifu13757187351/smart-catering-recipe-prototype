(function(){
  const previousDishEditor=dishEditor,previousSync=syncDishDetails;
  let activeTab='basic',activeStep=0,tabErrors=new Set(),editorOpen=false;
  // 编辑态草稿缓存：保存后再次进入编辑可回显上次维护的真实内容。
  const editorCache=new Map();
  const recipeCategories={热菜:['大荤','小荤','素菜'],主食:['米饭类','面食类','点心类'],汤粥:['家常汤','荤汤','素汤','粥品']};
  // 菜谱分类取自分类管理：已停用、已删除的分类不可再选择。
  const categoryOptions=()=>{const src=(typeof tenantCategories!=='undefined'&&tenantCategories.length)?tenantCategories.map(p=>({name:p.name,children:[...p.children]})):Object.entries(recipeCategories).map(([name,children])=>({name,children}));return src.filter(p=>typeof categoryMeta==='undefined'||categoryMeta[`${p.name}/`]?.status==='启用').map(p=>({name:p.name,children:p.children.filter(c=>typeof categoryMeta==='undefined'||categoryMeta[`${p.name}/${c}`]?.status==='启用')})).filter(p=>p.children.length)};
  let base={image:'',name:'',alias:'',foreign:{},cooking:'炒',province:'全国',yieldRate:'100',categoryLevel1:'热菜',categoryLevel2:'大荤',cuisine:'川菜',intro:'',tags:['动物性蛋白']};
  const esc2=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const labelGroups=[['辅助疾病治疗',['癌症','肿瘤','骨质疏松','营养缺乏']],['菜品营养功能',['动物性蛋白','植物性蛋白','高嘌呤','高胆固醇']]];

  function syncBase(){if(activeTab!=='basic')return;$$('[data-recipe-base]').forEach(x=>base[x.dataset.recipeBase]=x.value);base.tags=[...$$('[data-recipe-tag]:checked')].map(x=>x.value)}
  syncDishDetails=function(){
    if(!editorOpen)return previousSync();
    syncBase();
    if(activeTab==='ingredients')editIngredients=[...$$('.ingredient-card')].map((c,i)=>({...editIngredients[i],...Object.fromEntries([...c.querySelectorAll('[data-ing]')].map(x=>[x.dataset.ing,x.value]))}));
    if(activeTab==='process'){
      const c=$('.recipe-process-workspace .process-card');if(!c)return;
      const old=editSteps[activeStep]||{};
      editSteps[activeStep]={...old,...Object.fromEntries([...c.querySelectorAll('[data-step]')].map(x=>[x.dataset.step,x.value])),assoc:[...c.querySelectorAll('[data-assoc]:checked')].map(x=>x.dataset.assoc)};
    }
  };

  function tabs(){return `<div class="device-config-tabs recipe-editor-tabs">${[['basic','1 基础信息'],['ingredients','2 用料明细'],['process','3 加工步骤']].map(([id,name])=>`<button type="button" data-recipe-tab="${id}" class="${activeTab===id?'active':''} ${tabErrors.has(id)?'has-error':''}">${name}${tabErrors.has(id)?'<i>!</i>':''}</button>`).join('')}</div>`}
  function basicTab(){const count=Object.values(base.foreign||{}).filter(Boolean).length,cats=categoryOptions(),seconds=(cats.find(x=>x.name===base.categoryLevel1)?.children)||cats[0]?.children||[];return `<section class="device-basic-section"><div class="device-basic-grid-v2"><div class="device-image-field"><span><i>*</i> 图片</span><label class="device-image-upload ${base.image?'has-image':''}">${base.image?`<img src="${base.image}" alt="菜谱图片">`:'<b>＋</b><small>上传1张图片</small>'}<input id="recipeBaseImage" type="file" accept="image/png,image/jpeg,image/webp"></label></div><div class="device-basic-fields"><label><i>*</i> 菜谱名称<input data-recipe-base="name" value="${esc2(base.name)}" placeholder="请输入菜谱名称"></label><label><i>*</i> 别名<input data-recipe-base="alias" value="${esc2(base.alias)}" placeholder="请输入菜谱别名"></label><label>外语菜谱名<button type="button" class="language-config-button" id="openRecipeLanguages">已配语种 ${count}/10 <em>设置 ›</em></button></label><label><i>*</i> 烹饪分类<select data-recipe-base="cooking">${['炒','炖','蒸','煮','烤'].map(x=>`<option ${x===base.cooking?'selected':''}>${x}</option>`).join('')}</select></label><label><i>*</i> 菜谱省份<select data-recipe-base="province">${['全国','四川','山东','广东','江苏','浙江'].map(x=>`<option ${x===base.province?'selected':''}>${x}</option>`).join('')}</select></label><label><i>*</i> 出餐成品系数<div class="percent-input"><input data-recipe-base="yieldRate" type="number" min="0.01" max="999.99" step="0.01" value="${esc2(base.yieldRate)}"><span>%</span></div></label><label><i>*</i> 菜谱分类<div class="recipe-category-cascade"><select data-recipe-base="categoryLevel1" id="recipeCategoryLevel1">${cats.map(x=>`<option ${x.name===base.categoryLevel1?'selected':''}>${x.name}</option>`).join('')}</select><span>›</span><select data-recipe-base="categoryLevel2" id="recipeCategoryLevel2">${seconds.map(x=>`<option ${x===base.categoryLevel2?'selected':''}>${x}</option>`).join('')}</select></div><small>来自分类管理，请先选择一级分类，再选择二级分类</small></label><label><i>*</i> 菜系分类<select data-recipe-base="cuisine">${['川菜','鲁菜','粤菜','苏菜','浙菜'].map(x=>`<option ${x===base.cuisine?'selected':''}>${x}</option>`).join('')}</select></label><label class="full">菜品简介<textarea data-recipe-base="intro" placeholder="请输入菜品简介">${esc2(base.intro)}</textarea></label></div></div><div class="base-tag-picker"><h3><i>*</i> 菜品标签 <small>可多选，只能选择二级标签</small></h3>${labelGroups.map(([group,items])=>`<section><h4>${group}</h4><div>${items.map(x=>`<label><input type="checkbox" data-recipe-tag value="${x}" ${base.tags.includes(x)?'checked':''}> ${x}</label>`).join('')}</div></section>`).join('')}</div></section>`}
  function ingredientTab(){return `<section class="device-ingredient-section expanded"><div class="device-ingredient-head"><div><h3>用料明细 <span>${editIngredients.length}项</span></h3></div><button type="button" class="ghost" id="addIngredientDetail">＋ 添加用料</button></div><div id="ingredientDetailList">${ingredientHtml(false)}</div></section>`}
  function selectedStepHtml(){const wrap=document.createElement('div');wrap.innerHTML=stepHtml(false);const card=wrap.children[activeStep];if(!card)return '';if(editSteps[activeStep]?.mode==='device'){card.classList.add('device-minimal-fields');card.querySelector('[data-assoc]')?.closest('.full')?.remove();card.querySelector('[data-process-picker]')?.closest('label')?.remove();const remove=s=>card.querySelector(s)?.closest('label')?.remove();remove('[data-step="requirement"]');remove('[data-step="standard"]');remove('[data-step="attention"]')}return card.outerHTML}
  function processTab(){return `<div class="process-layout recipe-process-workspace"><aside class="process-nav"><h3>加工流程（${editSteps.length}步）</h3><div class="process-step-list">${editSteps.map((raw,i)=>{const x=raw||{},actions=(x.deviceConfigs||[]).reduce((n,c)=>n+(c.actions?.length||0),0);return `<button type="button" draggable="true" class="${i===activeStep?'active':''}" data-recipe-step="${i}"><span class="process-drag-handle">☷</span><i>${i+1}</i><b>${esc2(x.type||'预处理')}</b><span class="process-mode-tag ${x.mode==='device'?'device':'manual'}">${x.mode==='device'?'设备加工':'人工处理'}</span>${x.mode==='device'?`<em>${actions}个设备操作步骤</em>`:''}<span class="process-delete-icon" data-recipe-step-delete="${i}">×</span></button>`}).join('')}</div><button type="button" class="process-add-step" id="addRecipeProcess">＋ 新增加工流程</button></aside><section class="process-editor"><div class="recipe-current-step">${selectedStepHtml()}</div></section></div>`}
  function renderEditor(){const root=$('#unifiedRecipeEditorRoot');if(!root)return;root.innerHTML=`${tabs()}<div class="device-tab-content">${activeTab==='basic'?basicTab():activeTab==='ingredients'?ingredientTab():processTab()}</div>`;bindEditor()}

  function bindLanguages(){syncBase();const languages=['英文','法语','繁体中文','日语','韩语','越南语','西班牙语','德语','泰语','葡萄牙语'];document.body.insertAdjacentHTML('beforeend',`<div class="language-dialog-mask" id="unifiedLanguageDialog"><div class="language-dialog"><div class="language-dialog-head"><h3>配置外语菜谱名</h3><button id="closeUnifiedLanguage">×</button></div><div class="language-list">${languages.map(x=>`<label>${x}<input data-unified-language="${x}" value="${esc2(base.foreign[x]||'')}" placeholder="选填"></label>`).join('')}</div><div class="language-dialog-foot"><button class="ghost" id="cancelUnifiedLanguage">取消</button><button class="primary" id="saveUnifiedLanguage">保存</button></div></div></div>`);const close=()=>$('#unifiedLanguageDialog')?.remove();$('#closeUnifiedLanguage').onclick=close;$('#cancelUnifiedLanguage').onclick=close;$('#saveUnifiedLanguage').onclick=()=>{$$('[data-unified-language]').forEach(x=>base.foreign[x.dataset.unifiedLanguage]=x.value.trim());close();renderEditor()}}
  function bindProcessNav(){
    $$('[data-recipe-step]').forEach(b=>{b.onclick=e=>{if(e.target.closest('[data-recipe-step-delete]'))return;syncDishDetails();activeStep=+b.dataset.recipeStep;renderEditor()};b.ondragstart=e=>e.dataTransfer.setData('text/recipe-step',b.dataset.recipeStep);b.ondragover=e=>e.preventDefault();b.ondrop=e=>{e.preventDefault();syncDishDetails();const from=+e.dataTransfer.getData('text/recipe-step'),to=+b.dataset.recipeStep;if(from===to)return;const selected=editSteps[activeStep],[moved]=editSteps.splice(from,1);editSteps.splice(to,0,moved);activeStep=editSteps.indexOf(selected);renderEditor();showToast('加工流程顺序已更新')}});
    $$('[data-recipe-step-delete]').forEach(x=>x.onclick=e=>{e.stopPropagation();const i=+x.dataset.recipeStepDelete;if(editSteps.length<=1)return showToast('至少保留一个加工流程');syncDishDetails();if(!confirm(`确认删除第 ${i+1} 步“${editSteps[i].type}”吗？该步骤下的设备型号和操作步骤也将一并删除。`))return;editSteps.splice(i,1);activeStep=Math.min(activeStep,editSteps.length-1);renderEditor();showToast('加工流程已删除，序号已自动更新')});
    $('#addRecipeProcess').onclick=()=>{syncDishDetails();editSteps.push({type:'预处理',mode:'manual',processId:'',processName:'',assoc:[],requirement:'',standard:'',attention:'',deviceConfigs:[]});activeStep=editSteps.length-1;renderEditor();showToast('已新增加工流程')};
  }
  function bindEditor(){
    $$('[data-recipe-tab]').forEach(b=>b.onclick=()=>{syncDishDetails();activeTab=b.dataset.recipeTab;renderEditor()});
    if(activeTab==='basic'){$('#openRecipeLanguages').onclick=bindLanguages;$('#recipeBaseImage').onchange=e=>{const file=e.target.files?.[0];if(!file)return;base.image=URL.createObjectURL(file);renderEditor()};$('#recipeCategoryLevel1').onchange=e=>{syncBase();base.categoryLevel1=e.target.value;base.categoryLevel2=(categoryOptions().find(x=>x.name===base.categoryLevel1)?.children||[''])[0];renderEditor()}}
    if(activeTab==='ingredients')bindDetailEditor();
    if(activeTab==='process'){bindDetailEditor();bindProcessNav()}
  }
  redrawDetail=function(){if(editorOpen)renderEditor();else{if($('#ingredientDetailList'))$('#ingredientDetailList').innerHTML=ingredientHtml(false);if($('#stepDetailList'))$('#stepDetailList').innerHTML=stepHtml(false);bindDetailEditor()}};

  function validateAll(){
    syncDishDetails();tabErrors.clear();let first='';
    const rate=Number(base.yieldRate),baseMissing=!base.image||!base.name.trim()||!base.alias.trim()||!base.cooking||!base.province||!base.categoryLevel1||!base.categoryLevel2||!base.cuisine||!base.tags.length||!Number.isFinite(rate)||rate<.01||rate>999.99;
    if(baseMissing){tabErrors.add('basic');first='basic'}
    const badIngredient=!editIngredients.length||editIngredients.some(x=>!x.food||!x.amount||Number(x.amount)<=0||!x.role||!x.unit||!x.state||!x.cut);
    if(badIngredient){tabErrors.add('ingredients');if(!first)first='ingredients'}
    const badStep=!editSteps.length||editSteps.some(s=>s.mode==='device'&&(!s.deviceConfigs?.length||s.deviceConfigs.some(c=>!c.actions?.length)));
    if(badStep){tabErrors.add('process');if(!first)first='process'}
    if(!first)return true;activeTab=first;if(first==='process'){const bad=editSteps.findIndex(s=>s.mode==='device'&&(!s.deviceConfigs?.length||s.deviceConfigs.some(c=>!c.actions?.length)));activeStep=Math.max(0,bad)}renderEditor();setTimeout(()=>$('.device-tab-content input:not([type="checkbox"]),.device-tab-content select,.device-tab-content textarea')?.focus(),0);showToast('存在未完成的必填内容，请完善后提交');return false;
  }
  dishEditor=function(d=null,readonly=false){
    if(readonly)return previousDishEditor(d,true);
    editorOpen=true;activeTab='basic';activeStep=0;tabErrors.clear();
    const cats=categoryOptions(),catNames=cats.map(x=>x.name),categoryParts=(d?.category||'热菜 / 大荤').split(' / '),categoryLevel1=catNames.includes(categoryParts[0])?categoryParts[0]:(catNames[0]||''),catLevel2=(cats.find(x=>x.name===categoryLevel1)?.children)||[''],categoryLevel2=catLevel2.includes(categoryParts[1])?categoryParts[1]:(catLevel2[0]||'');
    const saved=d?editorCache.get(d.id):null;
    base={image:'',name:d?.name||'',alias:d?.alias||'',foreign:{},cooking:d?.cooking||'炒',province:d?.province||'全国',yieldRate:'100',categoryLevel1,categoryLevel2,cuisine:d?.cuisine||'川菜',intro:'',tags:['动物性蛋白'],...(saved?.base||{})};
    // 编辑态回显已保存内容；含设备加工的菜谱保留设备加工模式与已选设备型号，不再一律重置为人工处理。
    const seedSteps=()=>{const steps=initialSteps().map(x=>({...x,mode:'manual',processId:'',processName:'',deviceConfigs:[]}));const models=[...new Set(d?.devices||[])];if(d&&d.process==='含设备加工'&&models.length)steps[0]={...steps[0],mode:'device',deviceConfigs:models.map(m=>({modelId:m,actions:[]})),activeModelId:models[0]};return steps};
    editIngredients=saved?JSON.parse(JSON.stringify(saved.ingredients)):initialIngredients();
    editSteps=saved?JSON.parse(JSON.stringify(saved.steps)):seedSteps();
    dishDrawer(d?'编辑菜谱':'新建菜谱','<div id="unifiedRecipeEditorRoot" class="unified-recipe-editor-root"></div>','保存草稿');
    const draft=$('#dishDrawerSave');draft.className='ghost';draft.insertAdjacentHTML('afterend','<button id="dishDrawerSubmit" class="primary">提交</button>');
    $$('.dish-drawer-close').forEach(b=>b.addEventListener('click',()=>editorOpen=false));
    const remember=()=>{if(d)editorCache.set(d.id,{base:{...base},ingredients:JSON.parse(JSON.stringify(editIngredients)),steps:JSON.parse(JSON.stringify(editSteps))})};
    draft.onclick=()=>{syncDishDetails();remember();editorOpen=false;$('#dishDrawerMask').remove();showToast('菜谱草稿已保存')};
    $('#dishDrawerSubmit').onclick=()=>{if(!validateAll())return;syncDishDetails();remember();editorOpen=false;$('#dishDrawerMask').remove();showToast(d?'菜谱修改已提交':'菜谱已提交')};
    renderEditor();
  };
})();
