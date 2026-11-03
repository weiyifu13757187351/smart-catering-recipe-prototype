const SITE = 'https://weiyifu13757187351.github.io/smart-catering-recipe-prototype';
const bust = '?cb=' + Date.now();
const checks = [];

async function get(url) {
  const r = await fetch(url, { headers: { 'cache-control': 'no-cache' } });
  return { status: r.status, text: await r.text() };
}

// 1) 版本文件
const ver = await get(`${SITE}/version.json${bust}`);
checks.push(['version.json 200', ver.status === 200]);
let v = {};
try { v = JSON.parse(ver.text); } catch { }
checks.push([`version.json publishedAt=${v.publishedAt}`, /^2026-11-02/.test(v.publishedAt || '')]);
checks.push([`version.json 提交说明含「采购管理」`, String(v.publishLabel || '').includes('采购管理')]);

// 2) 入口 HTML 资源版本号
const html = await get(`${SITE}/merchant/${encodeURIComponent('食联网数智餐饮平台-组织及人员.html')}${bust}`);
checks.push(['商户端 HTML 200', html.status === 200]);
checks.push(['HTML 引用最新资源版本号', /20261102-po-mgmt-\d/.test(html.text)]);
checks.push(['bundle 含验收完成提示条兜底', bundle.text.includes('po-banner-ok')]);
checks.push(['adapter 在整抽屉上找特征', adapter.text.includes('.mp-drawer')]);

// 3) 线上 bundle 内容
const bundle = await get(`${SITE}/merchant/annotation-kit/annotation.bundle.inline.js${bust}`);
checks.push(['bundle 200', bundle.status === 200]);
for (const k of ['采购管理共用口径', '只冲减验收金额', '第 3 位起直接截断', '病虫害或存在异物', 'sr-batch-form', 'po-as-detail']) {
  checks.push([`bundle 含「${k}」`, bundle.text.includes(k)]);
}
// 4) 标注数量（inline bundle 里的引号是转义过的，两种都要认）
const ids = new Set((bundle.text.match(/\\?"id\\?"\s*:\s*\\?"(?:pm|sr)-[a-z0-9-]+/g) || [])
  .map(s => s.replace(/[\\"]/g, '').replace(/id\s*:\s*/, '')));
checks.push([`线上 bundle 采购管理标注 ${ids.size} 条（期望 ≥31）`, ids.size >= 31]);

// 5) 适配器已更新
const adapter = await get(`${SITE}/merchant/annotation-kit/host-view-adapter.js${bust}`);
checks.push(['host-view-adapter 含 po-list/sr-list', adapter.text.includes("'po-list'") && adapter.text.includes("'sr-list'")]);
checks.push(['adapter 200', adapter.status === 200]);

let fail = 0;
for (const [name, ok] of checks) { if (!ok) fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); }
console.log(fail ? `\n${fail} 项失败` : '\n线上校验全部通过');
process.exit(fail ? 1 : 0);

