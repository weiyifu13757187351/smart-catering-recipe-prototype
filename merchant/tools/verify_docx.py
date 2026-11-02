# -*- coding: utf-8 -*-
"""校验 docx 与 md 的结构一致性"""
import re
from pathlib import Path
from docx import Document

md = Path("商户端采购管理PRD.md").read_text(encoding="utf-8").splitlines()

# md 侧统计
md_tables = 0
i = 0
while i < len(md):
    s = md[i].strip()
    if s.startswith("|") and i + 1 < len(md) and re.fullmatch(r"\|[\s:\-|]+\|", md[i + 1].strip()):
        j = i + 2
        while j < len(md) and md[j].strip().startswith("|"):
            j += 1
        md_tables += 1
        i = j
        continue
    i += 1
md_heads = [l.strip() for l in md if re.match(r"^#{2,5}\s", l.strip())]

doc = Document("商户端采购管理PRD.docx")
heads = [p.text.strip() for p in doc.paragraphs if p.style.name.startswith("Heading")]

print(f"md 表格数 = {md_tables}    docx 表格数 = {len(doc.tables)}")
print(f"md 2-5级标题 = {len(md_heads)}   docx 标题 = {len(heads)}")
print(f"docx 段落数 = {len(doc.paragraphs)}")

miss = [h for h in md_heads if h.lstrip('# ').strip() not in [x.strip() for x in heads]]
print("标题丢失:", miss if miss else "无")

# 表格完整性：行数比对
def md_rows():
    out = []
    i = 0
    while i < len(md):
        s = md[i].strip()
        if s.startswith("|") and i + 1 < len(md) and re.fullmatch(r"\|[\s:\-|]+\|", md[i + 1].strip()):
            n = 1
            j = i + 2
            while j < len(md) and md[j].strip().startswith("|"):
                n += 1
                j += 1
            out.append(n)
            i = j
            continue
        i += 1
    return out

mrr = md_rows()
drr = [len(t.rows) for t in doc.tables]
bad = [(k, a, b) for k, (a, b) in enumerate(zip(mrr, drr)) if a != b]
print("行数不一致的表:", bad if bad else "无")

# 残留管道符（说明表格没被当成表格）
stray = []
for t in doc.tables:
    for r in t.rows:
        for c in r.cells:
            if "|" in c.text:
                stray.append(c.text[:30])
for p in doc.paragraphs:
    if p.text.strip().startswith("|") or p.text.strip().endswith("|"):
        stray.append(p.text[:50])
print("管道符残留:", stray[:5] if stray else "无")

# 空表格检查
empty_heads = [t.rows[0].cells[0].text for t in doc.tables if not t.rows[0].cells[0].text.strip()]
print("表头为空:", empty_heads if empty_heads else "无")

# 抽查几个关键内容
full = "\n".join(p.text for p in doc.paragraphs) + "\n" + "\n".join(
    c.text for t in doc.tables for r in t.rows for c in r.cells)
for key in ["CG + 送达日期", "截断", "2.9.4a", "冲减验收金额", "供货关系管理", "验收人"]:
    print(f"  含「{key}」: {'是' if key in full else '否'}")
print("总字符数:", len(full))
