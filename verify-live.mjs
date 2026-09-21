/**
 * 线上原型自检：抓取入口页，请求其引用的全部 JS/CSS，报告非 200 资源。
 * 用法：node verify-live.mjs
 */
const BASE = 'https://weiyifu13757187351.github.io/smart-catering-recipe-prototype';
const PAGES = [
  '/index.html',
  '/tenant/index.html',
  '/merchant/index.html',
  '/merchant/' + encodeURIComponent('食联网数智餐饮平台-组织及人员.html'),
  '/opsys/index.html',
];

const attrRe = /(?:src|href)\s*=\s*["']([^"']+)["']/gi;

async function get(url) {
  const res = await fetch(url, { redirect: 'follow', headers: { 'cache-control': 'no-cache' } });
  const body = res.ok ? await res.text() : '';
  return { status: res.status, body };
}

const targets = new Map(); // url -> 引用的来源页
for (const page of PAGES) {
  const url = BASE + page;
  const { status, body } = await get(url);
  console.log(`${status === 200 ? 'OK  ' : 'FAIL'}  ${status}  ${page}`);
  if (status !== 200) continue;
  for (const m of body.matchAll(attrRe)) {
    const raw = m[1].trim();
    if (!raw || raw.startsWith('data:') || raw.startsWith('#') || /^https?:/i.test(raw) || raw.startsWith('mailto:')) continue;
    try {
      const abs = new URL(raw, url);
      if (abs.origin !== new URL(BASE).origin) continue;
      abs.hash = '';
      const key = abs.origin + abs.pathname;
      if (!targets.has(key)) targets.set(key, []);
      targets.get(key).push(page);
    } catch { /* 忽略无法解析的引用 */ }
  }
}

console.log(`\n共发现 ${targets.size} 个站内资源，开始逐个检查…`);
const bad = [];
const urls = [...targets.keys()].sort();
for (const u of urls) {
  let status = 0;
  try {
    const res = await fetch(u, { method: 'GET', redirect: 'follow' });
    status = res.status;
  } catch (e) { status = 'ERR'; }
  const short = u.replace(BASE, '');
  console.log(`${status === 200 ? 'OK  ' : 'FAIL'}  ${status}  ${short}`);
  if (status !== 200) bad.push({ u: short, status, from: [...new Set(targets.get(u))].join(', ') });
}

if (bad.length === 0) {
  console.log(`\n全部 ${urls.length} 个资源均返回 200 ✔  线上原型可用。`);
} else {
  console.log(`\n有 ${bad.length} 个资源不可用：`);
  for (const b of bad) console.log(`  ${b.status}  ${b.u}\n        被引用自：${b.from}`);
  process.exitCode = 1;
}
