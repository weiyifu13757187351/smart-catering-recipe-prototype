(function () {
  function activeText(selector) {
    return document.querySelector(selector)?.textContent?.trim() || "";
  }

  function resolveView() {
    // 叠加在最上层的抽屉先判定，避免被底层页面视图吞掉。
    if (document.querySelector("#unifiedOperationMask")) return "editor-operation";
    if (document.querySelector("#dictionaryModal")) return "recipe-dictionary-editor";

    if (document.querySelector("#unifiedAuthPreview")) return "recipe-auth-preview";
    if (document.querySelector("#unifiedAuthDetail")) return "recipe-auth-detail";

    if (document.querySelector("#unifiedAuthModal")) {
      const steps = Array.from(document.querySelectorAll("#unifiedAuthSteps .auth-step"));
      const active = steps.findIndex((step) => step.classList.contains("active"));
      return `recipe-auth-create-${Math.max(1, active + 1)}`;
    }

    if (document.querySelector("#unifiedRecipeDetail")) {
      const tab = document.querySelector("#unifiedDetailTabs [data-detail-content].active")?.dataset.detailContent || "basic";
      return `recipe-detail-${tab}`;
    }

    if (document.querySelector("#dishDrawerMask .unified-recipe-editor-root")) {
      const tab = document.querySelector("#dishDrawerMask [data-recipe-tab].active")?.dataset.recipeTab || "basic";
      const title = activeText("#dishDrawerMask .modal-head h3");
      const mode = title.includes("新建") ? "create" : "edit";
      return `recipe-${mode}-${tab}`;
    }

    const content = document.querySelector("#content");
    if (!content) return "other";
    if (content.querySelector(".dictionary-page")) return "recipe-dictionary";
    if (content.querySelector(".category-layout-v2")) return "recipe-categories";
    if (content.querySelector(".unified-recipe-list-page")) return "recipe-list";
    if (content.querySelector(".unified-auth-page")) return "recipe-auth-list";
    if (content.querySelector(".recipe-hub-page") && document.querySelector('#nav [data-page="standardRecipes"].active')) return "recipe-hub";
    return "other";
  }

  let queued = false;
  function syncView() {
    queued = false;
    const view = resolveView();
    if (document.body.dataset.vpaView === view) return;
    document.body.dataset.vpaView = view;
    window.VitaminAnnotations?.sync();
  }

  function scheduleSync() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(syncView);
  }

  function start() {
    new MutationObserver(scheduleSync).observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "hidden"]
    });
    document.addEventListener("click", scheduleSync, true);
    window.addEventListener("popstate", scheduleSync);
    scheduleSync();
  }

  const ready = window.VitaminAnnotations?.ready;
  if (ready && typeof ready.then === "function") ready.then(start);
  else start();
})();
