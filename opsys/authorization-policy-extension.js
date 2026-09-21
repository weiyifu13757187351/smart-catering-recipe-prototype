(()=>{
  function enforceRecipeAuthorizationPolicy(){
    const title=document.querySelector('.content .page-head h1');
    if(title?.textContent.trim()!=='菜谱授权')return;
    document.querySelectorAll('.content .card button.danger-link').forEach(button=>{
      if(button.textContent.trim()==='撤销')button.remove();
    });
  }
  const start=()=>{
    enforceRecipeAuthorizationPolicy();
    new MutationObserver(enforceRecipeAuthorizationPolicy).observe(document.body,{childList:true,subtree:true});
  };
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',start):start();
})();
