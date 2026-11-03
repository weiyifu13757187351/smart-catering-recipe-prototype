/**
 * 线上发布结果核对（走 GitHub API，Pages CDN 被墙时也能验）
 * 1) main 分支最新提交就是我这次发布的提交
 * 2) 提交里的文件内容与本地源目录一致（逐文件比对）
 * 3) 标注产物里确实带 31 条采购管理标注 / 新适配器 / 采购订单模块的修复
 * 用法：node tools/verify-live-po-anno-api.mjs
 */
import fs from 'node:fs';

const OWNER = 'weiyifu13757187351';
const REPO = 'smart-catering-recipe-prototype';
const API = `https://api.github.com/repos/${OWNER}/${REPO}`;
const FILES = [
  ['version.json', '../原型线上发布/version.json'],
  ['merchant/annotation-kit/annotation.bundle.inline.js', 'annotation-kit/annotation.bundle.inline.js'],
  ['merchant/annotation-kit/host-view-adapter.js', 'annotation-kit/host-view-adapter.js'],
  ['merchant/merchant-purchase-order-v2.js', 'merchant-purchase-order-v2.js'],
  ['merchant/annotations/po/merchant-purchase-order.md', 'annotations/po/merchant-purchase-order.md'],
  ['merchant/annotations/po/annotation.config.json', 'annotations/po/annotation.config.json'],
];

const norm = s => String(s).replace(/\r\n/g, '\n');
const get = async (url, asText = true) => {
  for (let i = 1; i <= 3; i++) {
    try {
      const r = await fetch(url, { headers: { 'user-agent': 'dsh-verify', accept: 'application/vnd.github+json' } });
      if (!r.ok) return { status: r.status, body: await r.text() };
      return { status: r.status, body: asText ? await r.text() : await r.json() };
    } catch (e) {
      if (i === 3) throw e;
      await new Promise(res => setTimeout(res, 1500));
    }
  }
};

let fail = 0;
const check = (name, ok, extra = '') => { if (!ok) fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`); };

const commit = (await get(`${API}/commits/main`, false)).body;
console.log(`main 最新提交：${String(commit.sha).slice(0, 7)}  ${new Date(commit.commit.committer.date).toLocaleString('zh-CN')}`);
console.log(`提交说明：${commit.commit.message.split('\n')[0]}`);
check('最新提交说明含本次修复', /切换组织|采购订单|标注/.test(commit.commit.message));

for (const [remote, local] of FILES) {
  const enc = remote.split('/').map(p => encodeURIComponent(p)).join('/');
  const res = await get(`${API}/contents/${enc}?ref=${commit.sha}`, false);
  if (res.status !== 200) { check(`github 上存在 ${remote}`, false, `HTTP ${res.status}`); continue; }
  const content = norm(Buffer.from(res.body.content, 'base64').toString('utf8'));
  const mine = norm(fs.readFileSync(local, 'utf8'));
  check(`${remote} 与本地一致`, content === mine, content === mine ? `(${content.length} 字符)` : `线上 ${content.length} vs 本地 ${mine.length}`);
}

const ver = JSON.parse(norm(fs.readFileSync('../原型线上发布/version.json', 'utf8')));
check('本地 version.json 是本次发布', /^2026-11-02 16:3/.test(ver.publishedAt), ver.publishedAt);

const bundle = norm(fs.readFileSync('annotation-kit/annotation.bundle.inline.js', 'utf8'));
const ids = new Set((bundle.match(/\\?"id\\?"\s*:\s*\\?"(?:pm|sr)-[a-z0-9-]+/g) || []).map(s => s.replace(/[\\"]/g, '').replace(/id\s*:\s*/, '')));
check('产物含 31 条采购管理标注', ids.size >= 31, String(ids.size) + ' 条');

const adapter = norm(fs.readFileSync('annotation-kit/host-view-adapter.js', 'utf8'));
check('适配器在整抽屉上找特征（售后详情修复）', adapter.includes("document.querySelector('.mp-drawer')"));
const po = norm(fs.readFileSync('merchant-purchase-order-v2.js', 'utf8'));
check('采购订单模块含栏目守卫修复', po.includes('V4.16') && po.includes('if (!visible(listEl) && !visible(wizEl)) return;'));

const pages = await get(`${API}/pages/builds/latest`, false).catch(() => ({ status: 0 }));
if (pages.status === 200) {
  check(`Pages 构建状态 ${pages.body.status}`, pages.body.status === 'built', new Date(pages.body.updated_at).toLocaleString('zh-CN'));
} else {
  console.log(`SKIP  Pages 构建状态（API 返回 ${pages.status}，需要权限）`);
}

console.log(fail ? `\n${fail} 项不符` : '\n线上发布内容核对通过');
process.exit(fail ? 1 : 0);


