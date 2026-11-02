# -*- coding: utf-8 -*-
"""把 商户端采购管理PRD.md 转成排版规整的 .docx

特性：
- # → 文档标题；## / ### / #### / ##### → 标题 1~4 级（带中文字体、深色、段前段后）
- markdown 管道表格 → 真实 Word 表格（Table Grid、表头底纹+加粗+跨页重复、9pt）
- **粗体** / `代码` 内联样式；- 列表；1. 有序项；> 引用块
- A4 版心、页脚页码、自动目录（打开时更新域）
"""
import re
import sys
from pathlib import Path

from docx import Document
from docx.enum.section import WD_SECTION
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor

CN_FONT = "等线"
CN_HEAD_FONT = "微软雅黑"
MONO_FONT = "Consolas"

# A4 21cm - 左右页边距 2.2 / 2.0 = 16.8cm 版心
TEXT_WIDTH_CM = 16.8

BOLD_RE = re.compile(r"(\*\*[^*]+\*\*|`[^`]+`)")


# ---------- 底层工具 ----------
def set_run_font(run, name=CN_FONT, size=None, bold=None, color=None):
    run.font.name = name
    rpr = run._element.get_or_add_rPr()
    rfonts = rpr.find(qn("w:rFonts"))
    if rfonts is None:
        rfonts = OxmlElement("w:rFonts")
        rpr.append(rfonts)
    rfonts.set(qn("w:ascii"), name)
    rfonts.set(qn("w:hAnsi"), name)
    rfonts.set(qn("w:eastAsia"), name)
    if size is not None:
        run.font.size = Pt(size)
    if bold is not None:
        run.bold = bold
    if color is not None:
        run.font.color.rgb = color


def add_runs(par, text, size=None, bold=False, color=None, mono_size_delta=-0.5):
    """把带 **粗体** / `代码` 的文本写进段落"""
    for chunk in BOLD_RE.split(text):
        if not chunk:
            continue
        if chunk.startswith("**") and chunk.endswith("**") and len(chunk) > 4:
            r = par.add_run(chunk[2:-2])
            set_run_font(r, CN_FONT, size, True, color)
        elif chunk.startswith("`") and chunk.endswith("`") and len(chunk) > 2:
            r = par.add_run(chunk[1:-1])
            set_run_font(r, MONO_FONT, (size + mono_size_delta) if size else 9,
                         bold, RGBColor(0xC0, 0x39, 0x2B))
        else:
            r = par.add_run(chunk)
            set_run_font(r, CN_FONT, size, bold, color)


def shade(cell, hex_fill):
    tcpr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:val"), "clear")
    shd.set(qn("w:color"), "auto")
    shd.set(qn("w:fill"), hex_fill)
    # tcPr 子元素有固定顺序，shd 要插在 tcBorders 之后、noWrap 之前
    tcpr.insert_element_before(shd, "w:noWrap", "w:tcMar", "w:textDirection",
                               "w:tcFitText", "w:vAlign", "w:hideMark")


def repeat_header(row):
    trpr = row._tr.get_or_add_trPr()
    el = OxmlElement("w:tblHeader")
    el.set(qn("w:val"), "true")
    trpr.append(el)  # tblHeader 在 cantSplit 之后，作为最后一个子元素是合法的


def cant_split(row):
    trpr = row._tr.get_or_add_trPr()
    el = OxmlElement("w:cantSplit")
    el.set(qn("w:val"), "true")
    trpr.insert_element_before(el, "w:trHeight", "w:tblHeader", "w:tblCellSpacing",
                               "w:jc", "w:hidden")


def add_field(par, instr):
    r = par.add_run()
    fc = OxmlElement("w:fldChar"); fc.set(qn("w:fldCharType"), "begin")
    r._element.append(fc)
    r2 = par.add_run()
    it = OxmlElement("w:instrText"); it.set(qn("xml:space"), "preserve"); it.text = instr
    r2._element.append(it)
    r3 = par.add_run()
    fc2 = OxmlElement("w:fldChar"); fc2.set(qn("w:fldCharType"), "separate")
    r3._element.append(fc2)
    r4 = par.add_run("1")
    r5 = par.add_run()
    fc3 = OxmlElement("w:fldChar"); fc3.set(qn("w:fldCharType"), "end")
    r5._element.append(fc3)
    for rr in (r, r2, r3, r4, r5):
        set_run_font(rr, CN_FONT, 9, False, RGBColor(0x88, 0x88, 0x88))


def force_update_fields(doc):
    settings = doc.settings.element
    el = OxmlElement("w:updateFields")
    el.set(qn("w:val"), "true")
    settings.append(el)


# ---------- 样式基线 ----------
def build_styles(doc):
    normal = doc.styles["Normal"]
    normal.font.name = CN_FONT
    normal.font.size = Pt(10.5)
    normal.element.rPr.rFonts.set(qn("w:eastAsia"), CN_FONT)
    normal.paragraph_format.space_after = Pt(3)
    normal.paragraph_format.line_spacing = 1.25

    specs = {"Title": (22, True), "Heading 1": (16, True),
             "Heading 2": (13.5, True), "Heading 3": (11.5, True), "Heading 4": (10.5, True)}
    for name, (size, bold) in specs.items():
        st = doc.styles[name]
        st.font.name = CN_HEAD_FONT
        st.font.size = Pt(size)
        st.font.bold = bold
        st.font.color.rgb = RGBColor(0x1F, 0x36, 0x5D)
        st.element.rPr.rFonts.set(qn("w:eastAsia"), CN_HEAD_FONT)
        pf = st.paragraph_format
        pf.space_before = Pt(14 if name != "Title" else 0)
        pf.space_after = Pt(6 if name != "Title" else 4)
        pf.keep_with_next = True


# ---------- 解析 ----------
def is_sep(line):
    s = line.strip()
    return bool(re.fullmatch(r"\|[\s:\-|]+\|", s)) and "-" in s


def split_row(line):
    s = line.strip()
    if s.startswith("|"):
        s = s[1:]
    if s.endswith("|"):
        s = s[:-1]
    return [c.strip() for c in s.split("|")]


def add_table(doc, rows):
    header, body = rows[0], rows[1:]
    ncols = len(header)
    table = doc.add_table(rows=1, cols=ncols)
    table.style = "Table Grid"
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = False

    # 字号：列越多越小，避免挤压
    fs = 9 if ncols <= 6 else (8.5 if ncols <= 9 else 8)

    # 列宽：按各列最长内容加权，最小 1.1cm，合计正好等于版心宽度
    total_w = TEXT_WIDTH_CM
    weights = []
    for c in range(ncols):
        longest = max([len(header[c])] + [len(r[c]) if c < len(r) else 0 for r in body])
        weights.append(max(longest, 4))
    wsum = sum(weights)
    widths = [max(total_w * w / wsum, 1.1) for w in weights]
    scale = total_w / sum(widths)
    widths = [w * scale for w in widths]

    tblpr = table._tbl.tblPr
    # 复用 python-docx 建表时已有的 tblW（schema 只允许一个），没有才插入到 jc / tblLayout 之前
    tw = tblpr.find(qn("w:tblW"))
    if tw is None:
        tw = OxmlElement("w:tblW")
        tblpr.insert_element_before(
            tw, "w:jc", "w:tblCellSpacing", "w:tblInd", "w:tblBorders", "w:shd", "w:tblLayout",
            "w:tblCellMar", "w:tblLook", "w:tblCaption", "w:tblDescription", "w:tblPrChange")
    tw.set(qn("w:type"), "dxa")
    tw.set(qn("w:w"), str(int(total_w * 567)))

    hdr = table.rows[0]
    repeat_header(hdr)
    cant_split(hdr)
    for i, txt in enumerate(header):
        cell = hdr.cells[i]
        cell.width = Cm(widths[i])
        cell.text = ""
        p = cell.paragraphs[0]
        p.paragraph_format.space_after = Pt(1)
        add_runs(p, txt, size=fs, bold=True, color=RGBColor(0x1F, 0x36, 0x5D))
        shade(cell, "EDF1F7")

    for row in body:
        tr = table.add_row()
        cant_split(tr)
        for i in range(ncols):
            txt = row[i] if i < len(row) else ""
            cell = tr.cells[i]
            cell.width = Cm(widths[i])
            cell.text = ""
            p = cell.paragraphs[0]
            p.paragraph_format.space_after = Pt(1)
            p.paragraph_format.line_spacing = 1.1
            add_runs(p, txt, size=fs)

    # 表后留白
    doc.add_paragraph().paragraph_format.space_after = Pt(2)
    return table


def convert(md_path: Path, docx_path: Path):
    lines = md_path.read_text(encoding="utf-8").splitlines()
    doc = Document()
    build_styles(doc)

    sec = doc.sections[0]
    sec.page_width, sec.page_height = Cm(21), Cm(29.7)
    sec.top_margin = Cm(2.2); sec.bottom_margin = Cm(2.0)
    sec.left_margin = Cm(2.2); sec.right_margin = Cm(2.0)

    # 页脚页码
    footer_p = sec.footer.paragraphs[0]
    footer_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = footer_p.add_run("商户端 · 采购管理 PRD　|　")
    set_run_font(r, CN_FONT, 9, False, RGBColor(0x88, 0x88, 0x88))
    add_field(footer_p, "PAGE")

    i = 0
    toc_inserted = False
    while i < len(lines):
        line = lines[i]
        stripped = line.strip()

        if not stripped:
            i += 1
            continue

        # 分隔线
        if re.fullmatch(r"-{3,}", stripped):
            i += 1
            continue

        # 标题
        m = re.match(r"^(#{1,5})\s+(.*)$", stripped)
        if m:
            level = len(m.group(1))
            text = m.group(2).strip()
            if level == 1:
                p = doc.add_paragraph(style="Title")
                p.alignment = WD_ALIGN_PARAGRAPH.CENTER
                add_runs(p, text, size=22, bold=True, color=RGBColor(0x1F, 0x36, 0x5D))
                i += 1
                continue
            h = doc.add_heading(level=level - 1)
            add_runs(h, text)
            # 首个二级标题前插入目录
            if level == 2 and not toc_inserted:
                toc_inserted = True
                tp = doc.add_paragraph()
                tr = tp.add_run("目　录")
                set_run_font(tr, CN_HEAD_FONT, 14, True, RGBColor(0x1F, 0x36, 0x5D))
                tp.paragraph_format.space_before = Pt(10)
                tpar = doc.add_paragraph()
                add_field(tpar, r'TOC \o "1-3" \h \z \u')
                doc.add_page_break()
            i += 1
            continue

        # 表格
        if stripped.startswith("|") and i + 1 < len(lines) and is_sep(lines[i + 1]):
            rows = [split_row(stripped)]
            j = i + 2
            while j < len(lines) and lines[j].strip().startswith("|"):
                rows.append(split_row(lines[j]))
                j += 1
            add_table(doc, rows)
            i = j
            continue

        # 引用
        if stripped.startswith(">"):
            buf = []
            while i < len(lines) and lines[i].strip().startswith(">"):
                buf.append(lines[i].strip().lstrip(">").strip())
                i += 1
            for b in [x for x in buf if x]:
                p = doc.add_paragraph()
                p.paragraph_format.left_indent = Cm(0.5)
                p.paragraph_format.space_after = Pt(2)
                add_runs(p, b, size=10, color=RGBColor(0x44, 0x4A, 0x55))
            continue

        # 列表
        m = re.match(r"^(\s*)-\s+(.*)$", line)
        if m:
            indent = len(m.group(1))
            style = "List Bullet 2" if indent >= 2 else "List Bullet"
            p = doc.add_paragraph(style=style)
            p.paragraph_format.space_after = Pt(2)
            add_runs(p, m.group(2))
            i += 1
            continue

        # 有序项：保留原编号文本
        m = re.match(r"^(\s*)(\d+)\.\s+(.*)$", line)
        if m:
            p = doc.add_paragraph()
            p.paragraph_format.left_indent = Cm(0.6)
            p.paragraph_format.first_line_indent = Cm(-0.6)
            p.paragraph_format.space_after = Pt(2)
            add_runs(p, f"{m.group(2)}. {m.group(3)}")
            i += 1
            continue

        # 普通段落
        p = doc.add_paragraph()
        add_runs(p, stripped)
        i += 1

    force_update_fields(doc)
    doc.save(str(docx_path))
    return docx_path


if __name__ == "__main__":
    src = Path(sys.argv[1] if len(sys.argv) > 1 else "商户端采购管理PRD.md")
    dst = Path(sys.argv[2] if len(sys.argv) > 2 else src.with_suffix(".docx"))
    out = convert(src, dst)
    print(f"OK -> {out}  ({out.stat().st_size/1024:.1f} KB)")
