const productReferencePages={standardIngredients:'ingredients',tenantProducts:'products',tenantSkus:'skus',productPublish:'publish',brandLibrary:'brands',productCategories:'categories',productAuthorization:'authorization'};
tenantProductCenterPage=function(page){return `<iframe class="product-reference-frame" src="./product-center-app/index.html?v=20260922-1&page=${productReferencePages[page]}"></iframe>`};
bindTenantProductCenter=function(page){
  const frame=$('.product-reference-frame');
  const apply=()=>{
    const doc=frame.contentDocument;
    if(!doc?.body)return;
    let style=doc.querySelector('#tenant-frame-style');
    if(!style){style=doc.createElement('style');style.id='tenant-frame-style';doc.head.appendChild(style)}
    style.textContent='.sidebar,.topbar{display:none!important}.main{width:100%!important;margin-left:0!important}.content{padding:24px 28px 40px!important;max-width:none!important}.app-shell{min-height:auto!important}.trade-stock-flow .acceptance-node{min-width:190px}.trade-stock-flow .acceptance-node .linked-acceptance-rule{grid-column:1/-1;width:100%;box-sizing:border-box;white-space:nowrap}.trade-stock-flow .acceptance-node .acceptance-help{grid-column:1/-1}';
    if(page==='tenantProducts'){
      if(frame._acceptanceDocument!==doc){frame._acceptanceObserver?.disconnect();if(frame._acceptanceTimer)clearInterval(frame._acceptanceTimer);frame._acceptanceObserver=null;frame._acceptanceTimer=null;frame._acceptanceDocument=doc}
      const linkAcceptance=()=>{
        doc.querySelectorAll('.trade-stock-flow').forEach(flow=>{
          const nodes=flow.querySelectorAll(':scope > .flow-node'),orderNode=nodes[0],acceptanceNode=nodes[1],orderSelect=orderNode?.querySelector('select');
          if(!orderSelect||!acceptanceNode)return;
          const unit=orderSelect.selectedOptions[0]?.textContent.trim()||orderSelect.value,value=`按${unit}验收`,linked=acceptanceNode.querySelector('.linked-acceptance-rule');
          if(!linked||linked.dataset.unit!==unit)acceptanceNode.innerHTML=`<span>② 验收规则</span><div class="locked-input linked-acceptance-rule" data-unit="${unit}">${value}<em>跟随下单单位</em></div><small class="acceptance-help">与下单单位保持一致，不可单独修改</small>`;
          flow.parentElement?.querySelector('.acceptance-note')?.remove();
          if(!orderSelect.dataset.acceptanceLinked){orderSelect.dataset.acceptanceLinked='1';orderSelect.addEventListener('change',()=>setTimeout(linkAcceptance))}
        })
      };
      linkAcceptance();
      if(!frame._acceptanceObserver){frame._acceptanceObserver=new frame.contentWindow.MutationObserver(()=>frame.contentWindow.requestAnimationFrame(linkAcceptance));frame._acceptanceObserver.observe(doc.body,{childList:true,subtree:true})}
      if(!frame._acceptanceTimer)frame._acceptanceTimer=setInterval(()=>{if(!frame.isConnected)return clearInterval(frame._acceptanceTimer);linkAcceptance()},500);
    }
    if(page!=='productAuthorization')return;
    const adapt=()=>{const walker=doc.createTreeWalker(doc.body,NodeFilter.SHOW_TEXT);let node;while(node=walker.nextNode()){const value=node.nodeValue.replaceAll('授权给多个租户','授权给多个商户').replaceAll('授权租户','授权商户').replaceAll('全部租户','全部商户').replaceAll('个租户','家商户').replaceAll('租户已复制到私有库的数据不受影响','商户端接收逻辑本期暂不处理');if(value!==node.nodeValue)node.nodeValue=value}};
    adapt();
    if(!frame._tenantObserver){frame._tenantObserver=new frame.contentWindow.MutationObserver(adapt);frame._tenantObserver.observe(doc.body,{childList:true,subtree:true})}
  };
  frame.onload=apply;
  apply();
  setTimeout(apply,200);
  setTimeout(apply,1000);
};
