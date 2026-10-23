/* ============================================================================
   商户端 · 档口数据（共享数据源）
   ----------------------------------------------------------------------------
   桌面端「档口管理」维护，手机端与排餐/生产计划的「档口切换器」只读消费，
   所以档口数据必须放在两边都能加载的地方（本文件），由页面按需引入：
     - 桌面端：食联网数智餐饮平台-组织及人员.html
     - 手机端：merchant-mobile.html
   数据为内存演示数据，刷新页面恢复初始值（与其它模块一致）。
   ========================================================================== */
(function () {
  if (window.MerchantStalls) return;

  /* gram = 预计人均用餐量（克/人，非必填）：填写后作为排餐计划该餐次「人均用餐量」的默认值 */
  const meal = (name, start, end, gram) => ({ meal: name, start, end, gram: gram == null ? '' : gram });
  const CREATOR = '平台管理员';

  /* 档口 = 某个次级组织下的经营窗口，含经营餐次与各餐次营业时间、负责人 */
  const stalls = [
    {
      id: 'st_1', orgId: 'org_sub_1', name: '一楼面点档口',
      meals: [meal('早餐', '06:30', '09:00', 320)],
      owner: { memberId: 'M20260728001', name: '张晓东', phone: '13812345678', memberType: '食堂员工' },
      creator: CREATOR, createdAt: '2026-10-06 11:05',
    },
    {
      id: 'st_2', orgId: 'org_sub_2', name: '二楼风味档口',
      /* 夜宵刻意不填人均：演示「非必填」时排餐计划回落到原默认口径 */
      meals: [meal('午餐', '11:00', '13:30', 550), meal('晚餐', '17:00', '19:30', 480), meal('夜宵', '20:30', '22:30')],
      owner: { memberId: 'M20260728004', name: '赵敏', phone: '13700002222', memberType: '食堂员工' },
      creator: CREATOR, createdAt: '2026-10-07 16:20',
    },
    {
      id: 'st_3', orgId: 'org_sub_5', name: '教工餐线',
      meals: [
        meal('早餐', '06:30', '09:00', 300), meal('早点', '09:00', '10:30', 180), meal('午餐', '11:00', '13:30', 520),
        meal('午点', '14:00', '16:00', 240), meal('晚餐', '17:00', '19:30', 460), meal('夜宵', '20:30', '22:30', 300),
      ],
      owner: { memberId: 'M20260728007', name: '孙志强', phone: '13600004444', memberType: '食堂员工' },
      creator: CREATOR, createdAt: '2026-10-08 09:30',
    },
  ];

  const clone = s => ({
    id: s.id, orgId: s.orgId, name: s.name,
    meals: (s.meals || []).map(m => ({
      meal: m.meal, start: m.start, end: m.end, gram: m.gram == null ? '' : m.gram,
    })),
    owner: s.owner ? { ...s.owner } : null,
    creator: s.creator, createdAt: s.createdAt,
  });

  window.MerchantStalls = {
    /* 原始数组：桌面端「档口管理」直接增删改这一个数组（不要整体重新赋值） */
    list: stalls,
    all: () => stalls.map(clone),
    listByOrg: orgId => stalls.filter(s => s.orgId === orgId).map(clone),
    get: id => { const s = stalls.find(x => x.id === id); return s ? clone(s) : null; },
    /* 取某组织第一个档口：切换器给计划页选默认值时用 */
    firstOfOrg: orgId => { const s = stalls.find(x => x.orgId === orgId); return s ? clone(s) : null; },
    countOfOrg: orgId => stalls.filter(s => s.orgId === orgId).length,
  };
})();
