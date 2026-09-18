function versionedDishView(d){
  editIngredients=initialIngredients();
  editSteps=initialSteps();
  dishDrawer('查看菜谱',`<div class="version-tabs"><button class="active" data-version-tab="current">当前版本</button><button data-version-tab="new">最新授权版本 <span class="version-tag">NEW</span></button></div><div id="versionDetailContent"></div>`,'');
  const draw=mode=>{
    if(mode==='current'){
      $('#versionDetailContent').innerHTML=detailContent(d,true,false);
      return;
    }
    const upstream={...d,code:d.code.replace('ZC','BZ')};
    $('#versionDetailContent').innerHTML=`<div class="version-summary"><b>运营端再次授权了新版本 V2.1</b><span>再次授权时间：2026-08-26</span></div>${detailContent(upstream,true,false)}<div class="version-update-box"><button id="updateDishNow" class="primary">更新至授权版本</button><p>确认后更新基础信息、用料明细、烹饪工艺及制作步骤和营养预览，并保留租户分类。</p></div>`;
    $('#updateDishNow').onclick=()=>{
      if(!confirm('是否确认更新？'))return;
      d.newVersion=false;
      $('#dishDrawerMask').remove();
      showToast('菜谱已更新至最新授权版本');
      render('dishes');
    };
  };
  draw('current');
  $$('[data-version-tab]').forEach(b=>b.onclick=()=>{
    $$('[data-version-tab]').forEach(x=>x.classList.toggle('active',x===b));
    draw(b.dataset.versionTab);
  });
}
