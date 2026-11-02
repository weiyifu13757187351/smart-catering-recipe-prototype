/**
 * 采购管理标注静态一致性校验（本机 CDP 不可用时的兜底）
 * 1) 编译产物里 pm-/sr- 标注数量与视图归属
 * 2) 每个 element 目标选择器必须能在原型 JS/HTML 里找到（防错字）
 * 3) 每个 viewScope 必须被 host-view-adapter.js 真实返回（防视图改名后失联）
 * 4) workspace 的 viewScopeLabels 必须覆盖全部视图
 * 5) ID 不重复、每块都有来源映射
 */
import fs from 'node:fs';

const KIT = 'annotation-kit/annotation.bundle.json';
const ADAPTER = 'annotation-kit/host-view-adapter.js';
const WS = 'annotations/annotation.workspace.json';
const MD = 'annotations/po/merchant-purchase-order.md';
const SRC = ['merchant-purchase-order-v2.js', '食联网数智餐饮平台-组织及人员.html'];

const bundle = JSON.parse(fs.readFileSync(KIT, 'utf8'));
const adapter = fs.readFileSync(ADAPTER, 'utf8');
const workspace = JSON.parse(fs.readFileSync(WS, 'utf8'));
const md = fs.readFileSync(MD, 'utf8');
const src = SRC.map(f => fs.readFileSync(f, 'utf8')).join('\n');

const all = bundle.annotations || bundle.modules?.flatMap(m => m.annotations) || [];
const po = all.filter(a => /^(pm|sr)-/.test(a.id));
const mine = po.length ? po : all;

const views = new Set();
mine.forEach(a => (a.viewScope || []).forEach(v => views.add(v)));

let fail = 0;
const bad = (msg) => { fail++; console.log('FAIL ' + msg); };

// 1) 数量与类型
const byType = mine.reduce((m, a) => (m[a.type] = (m[a.type] || 0) + 1, m), {});
console.log(`标注数 ${mine.length}（${Object.entries(byType).map(([k, v]) => k + '=' + v).join(', ')}），视图 ${views.size} 个`);

// 2) element 选择器可在原型里找到
for (const a of mine) {
  const sel = a.target?.selector;
  if (!sel) continue;
  const token = sel.replace(/^\./, '').replace(/^#/, '');
  if (!src.includes(token)) bad(`选择器无出处 ${a.id} → ${sel}`);
}
console.log(`element 目标校验：${mine.filter(a => a.target?.selector).length} 个`);

// 3) viewScope 必须被适配器识别
for (const v of views) {
  if (!adapter.includes(`'${v}'`)) bad(`适配器未返回该视图 ${v}`);
}

// 4) 标签覆盖
const labels = workspace.runtime.viewScopeLabels || {};
for (const v of views) if (!labels[v]) bad(`缺少视图标签 ${v}`);

// 5) ID 唯一 + 来源引用
const ids = mine.map(a => a.id);
if (new Set(ids).size !== ids.length) bad('标注 ID 重复');
for (const a of mine) {
  if (!a.sourceRefs || !a.sourceRefs.length) bad(`缺 sourceRefs ${a.id}`);
  if (!md.includes(`id=${a.blockId || a.id}`)) bad(`Markdown 缺块 ${a.blockId || a.id}`);
}

// 6) 关键规则抽样：确保核心口径真的进了产物
const text = JSON.stringify(mine);
const musts = [
  ['金额截断不四舍五入', '第 3 位起直接截断'],
  ['统计卡不随筛选联动', '不随筛选联动'],
  ['待我验收=非已完成单数', '状态不是「已完成」的订单数'],
  ['全部售后页签', '全部售后'],
  ['退货只冲减验收金额', '只冲减验收金额'],
  ['验收只能删最新批', '只能从最新一批开始逐条往上删'],
  ['批量不受筛选影响', '不受任何筛选影响'],
  ['未绑定不含暂无报价', '不含「暂无报价」'],
  ['下架不清绑定', '不清除绑定'],
  ['差异枚举 9 项', '病虫害或存在异物'],
];
for (const [name, needle] of musts) if (!text.includes(needle)) bad(`关键口径缺失：${name}`);

console.log(fail ? `\n共 ${fail} 处问题` : '\n全部通过');
process.exit(fail ? 1 : 0);
