import { readFileSync } from 'node:fs';

/* 用法：node tools/check-prd-tables.mjs [文件...]
   不传参时默认校验 PRD V1.0 与 V2.0 */
const files = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ['商户端采购订单管理PRD-V1.0.md', '商户端采购订单管理PRD-V2.0.md'];

for (const f of files) {
  const lines = readFileSync(f, 'utf8').split(/\r?\n/);
  let inT = false, expect = 0, tables = 0;
  const bad = [];
  lines.forEach((l, i) => {
    const t = l.trim();
    if (!t.startsWith('|')) { inT = false; expect = 0; return; }
    const cells = t.split('|').slice(1, -1).length;
    if (!inT) { inT = true; tables++; expect = cells; return; }
    if (/^\|[\s:|-]+\|$/.test(t)) return;
    if (cells !== expect) bad.push(`${i + 1}: 期望 ${expect} 列，实际 ${cells}`);
  });
  const heads2 = lines.filter(l => /^## /.test(l)).length;
  const heads3 = lines.filter(l => /^### /.test(l)).length;
  /* 重复标题检查 */
  const dup = [];
  const seen = new Map();
  lines.forEach((l, i) => {
    const m = l.match(/^#{2,3} (.+)$/);
    if (!m) return;
    if (seen.has(m[1])) dup.push(`「${m[1]}」L${seen.get(m[1]) + 1} / L${i + 1}`);
    else seen.set(m[1], i);
  });
  console.log(`${f}: 行数 ${lines.length}，章 ${heads2}，节 ${heads3}，表格 ${tables}，表格异常 ${bad.length}${bad.length ? ' → ' + bad.slice(0, 8).join(' / ') : ''}`);
  if (dup.length) console.log(`  重复标题 ${dup.length} 处 → ${dup.slice(0, 5).join(' / ')}`);
  const text = lines.join('\n');
  console.log(`  【规则】${(text.match(/【规则】/g) || []).length} 处；【原型】${(text.match(/【原型】/g) || []).length} 处；【待改造】${(text.match(/【待改造】/g) || []).length} 处`);
}
