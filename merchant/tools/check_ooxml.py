# -*- coding: utf-8 -*-
"""OOXML 结构合法性检查：子元素顺序 / 表格宽度 / 域 / 字体

Word 对部分元素顺序很严格（错了会报“内容有问题”），这里按 ECMA-376 的
schema 序列检查 tblPr、trPr、tcPr、pPr 的关键子元素顺序。
"""
import re
import sys
import zipfile
from lxml import etree

W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
NS = {"w": W}

SEQ = {
    "tblPr": ["tblStyle", "tblpPr", "tblOverlap", "bidiVisual", "tblStyleRowBandSize",
              "tblStyleColBandSize", "tblW", "jc", "tblCellSpacing", "tblInd", "tblBorders",
              "shd", "tblLayout", "tblCellMar", "tblLook", "tblCaption", "tblDescription",
              "tblPrChange"],
    "trPr": ["cnfStyle", "divId", "gridBefore", "gridAfter", "wBefore", "wAfter", "cantSplit",
             "trHeight", "tblHeader", "tblCellSpacing", "jc", "hidden", "ins", "del", "trPrChange"],
    "tcPr": ["cnfStyle", "tcW", "gridSpan", "hMerge", "vMerge", "tcBorders", "shd", "noWrap",
             "tcMar", "textDirection", "tcFitText", "vAlign", "hideMark", "headers",
             "cellIns", "cellDel", "cellMerge", "tcPrChange"],
    "pPr": ["pStyle", "keepNext", "keepLines", "pageBreakBefore", "framePr", "widowControl",
            "numPr", "suppressLineNumbers", "pBdr", "shd", "tabs", "suppressAutoHyphens",
            "kinsoku", "wordWrap", "overflowPunct", "topLinePunct", "autoSpaceDE",
            "autoSpaceDN", "bidi", "adjustRightInd", "snapToGrid", "spacing", "ind",
            "contextualSpacing", "mirrorIndents", "suppressOverlap", "jc", "textDirection",
            "textAlignment", "textboxTightWrap", "outlineLvl", "divId", "cnfStyle", "rPr",
            "sectPr", "pPrChange"],
}


def check_order(root, tag, label):
    bad = []
    seq = SEQ[tag]
    for el in root.iter("{%s}%s" % (W, tag)):
        idx = []
        for child in el:
            name = etree.QName(child).localname
            if name in seq:
                idx.append((seq.index(name), name))
        order = [i for i, _ in idx]
        if order != sorted(order):
            bad.append((label, [n for _, n in idx]))
    return bad


def check_duplicates(root, tag, label):
    """schema 里 maxOccurs=1 的子元素不允许重复"""
    bad = []
    for el in root.iter("{%s}%s" % (W, tag)):
        seen = {}
        for child in el:
            name = etree.QName(child).localname
            if name not in SEQ[tag]:
                continue
            seen[name] = seen.get(name, 0) + 1
        dup = {k: v for k, v in seen.items() if v > 1}
        if dup:
            bad.append((label, dup))
    return bad


def main(path):
    z = zipfile.ZipFile(path)
    names = z.namelist()
    problems = []

    doc = etree.fromstring(z.read("word/document.xml"))
    for tag in ("tblPr", "trPr", "tcPr", "pPr"):
        problems += check_order(doc, tag, tag)
        problems += check_duplicates(doc, tag, tag + "-dup")

    # 表格宽度是否等于版心 16.8cm（9526 twips）
    widths = []
    for tbl in doc.iter("{%s}tbl" % W):
        tw = tbl.find("{%s}tblPr/{%s}tblW" % (W, W))
        widths.append(int(tw.get("{%s}w" % W)) if tw is not None else None)
    bad_w = [w for w in widths if w is None or abs(w - 9525) > 2]

    # 固定布局
    fixed = sum(1 for tbl in doc.iter("{%s}tbl" % W)
                if (tbl.find("{%s}tblPr/{%s}tblLayout" % (W, W)) is not None
                    and tbl.find("{%s}tblPr/{%s}tblLayout" % (W, W)).get("{%s}type" % W) == "fixed"))

    # 域：TOC + 页码
    xml = z.read("word/document.xml").decode("utf-8")
    footer_xml = "".join(z.read(n).decode("utf-8") for n in names if n.startswith("word/footer"))
    settings = z.read("word/settings.xml").decode("utf-8") if "word/settings.xml" in names else ""
    has_toc = 'TOC \\o' in xml
    has_page = "PAGE" in footer_xml
    has_update = "updateFields" in settings
    bold = len(re.findall(r"<w:b/>", xml))

    print(f"文件: {path}  ({len(z.read('word/document.xml'))/1024:.1f} KB document.xml)")
    print(f"表格数: {len(widths)}  宽度异常: {len(bad_w)}  固定布局: {fixed}/{len(widths)}")
    print(f"目录域 TOC: {has_toc}   页脚页码域: {has_page}   打开自动更新域: {has_update}")
    print(f"粗体 run 数: {bold}")
    print(f"元素顺序问题: {len(problems)}")
    for p in problems[:5]:
        print("   ", p)
    return 0 if (not problems and not bad_w and has_toc and has_page) else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else "商户端采购管理PRD.docx"))
