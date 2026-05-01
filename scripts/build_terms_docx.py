"""Generate clean, copy-paste-ready Word documents for Terms & Conditions.

Goals:
- Plain, business-document look (all-black text, no color flourishes).
- Real Word built-in styles ("Heading 1", "Heading 2", "List Bullet",
  "List Number") so the document pastes cleanly into other Word documents
  AND degrades cleanly when copied into a plain textarea (each block on its
  own line, with a blank line between blocks).
- Cairo font (with Tahoma fallback) for both AR and EN.
- Full RTL flow for the Arabic file (paragraph + section + run-level rtl).
- Latin (Western) digits 0-9 preserved per project rules.
- Blank paragraph between every section so plain-text paste keeps structure.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn
from docx.oxml import OxmlElement
from docx.shared import Cm, Pt, RGBColor


PRIMARY_FONT = "Cairo"
FALLBACK_FONT_AR = "Tahoma"
FALLBACK_FONT_EN = "Calibri"
BLACK = RGBColor(0x00, 0x00, 0x00)


def _add_or_replace(parent, tag: str) -> "OxmlElement":
    existing = parent.find(qn(tag))
    if existing is not None:
        parent.remove(existing)
    el = OxmlElement(tag)
    parent.append(el)
    return el


def set_paragraph_rtl(paragraph, rtl: bool) -> None:
    pPr = paragraph._p.get_or_add_pPr()
    bidi = pPr.find(qn("w:bidi"))
    if rtl:
        if bidi is None:
            bidi = OxmlElement("w:bidi")
            pPr.append(bidi)
        bidi.set(qn("w:val"), "1")
    elif bidi is not None:
        pPr.remove(bidi)


def style_run(run, *, primary: str, fallback: str, rtl: bool, size_pt: float, bold: bool = False) -> None:
    run.font.name = primary
    run.font.size = Pt(size_pt)
    run.bold = bold
    run.font.color.rgb = BLACK
    rPr = run._r.get_or_add_rPr()
    rFonts = rPr.find(qn("w:rFonts"))
    if rFonts is None:
        rFonts = OxmlElement("w:rFonts")
        rPr.append(rFonts)
    rFonts.set(qn("w:ascii"), primary)
    rFonts.set(qn("w:hAnsi"), primary)
    rFonts.set(qn("w:cs"), primary)
    rFonts.set(qn("w:eastAsia"), fallback)
    if rtl:
        rtl_el = rPr.find(qn("w:rtl"))
        if rtl_el is None:
            rtl_el = OxmlElement("w:rtl")
            rPr.append(rtl_el)
        rtl_el.set(qn("w:val"), "1")
        szCs = rPr.find(qn("w:szCs"))
        if szCs is None:
            szCs = OxmlElement("w:szCs")
            rPr.append(szCs)
        szCs.set(qn("w:val"), str(int(size_pt * 2)))


def set_section_rtl(doc: Document) -> None:
    for section in doc.sections:
        section.page_height = Cm(29.7)
        section.page_width = Cm(21.0)
        section.top_margin = Cm(2.0)
        section.bottom_margin = Cm(2.0)
        section.left_margin = Cm(2.2)
        section.right_margin = Cm(2.2)
        sectPr = section._sectPr
        bidi = sectPr.find(qn("w:bidi"))
        if bidi is None:
            bidi = OxmlElement("w:bidi")
            sectPr.append(bidi)


def set_section_ltr(doc: Document) -> None:
    for section in doc.sections:
        section.page_height = Cm(29.7)
        section.page_width = Cm(21.0)
        section.top_margin = Cm(2.0)
        section.bottom_margin = Cm(2.0)
        section.left_margin = Cm(2.2)
        section.right_margin = Cm(2.2)


def add_numbering(doc: Document) -> tuple[int, int]:
    """Inject one bullet (•) and one decimal numbering definition.
    Returns (bullet_num_id, decimal_num_id).
    """
    from lxml import etree

    numbering_xml = doc.part.numbering_part.element
    existing_abs = {int(a.get(qn("w:abstractNumId"))) for a in numbering_xml.findall(qn("w:abstractNum"))}
    bullet_abs = (max(existing_abs) + 1) if existing_abs else 0
    decimal_abs = bullet_abs + 1

    ns = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
    bullet_def = f"""
<w:abstractNum {ns} w:abstractNumId="{bullet_abs}">
  <w:multiLevelType w:val="hybridMultilevel"/>
  <w:lvl w:ilvl="0">
    <w:start w:val="1"/>
    <w:numFmt w:val="bullet"/>
    <w:lvlText w:val="•"/>
    <w:lvlJc w:val="left"/>
    <w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr>
    <w:rPr><w:rFonts w:ascii="Cairo" w:hAnsi="Cairo" w:cs="Cairo"/></w:rPr>
  </w:lvl>
</w:abstractNum>
"""
    decimal_def = f"""
<w:abstractNum {ns} w:abstractNumId="{decimal_abs}">
  <w:multiLevelType w:val="hybridMultilevel"/>
  <w:lvl w:ilvl="0">
    <w:start w:val="1"/>
    <w:numFmt w:val="decimal"/>
    <w:lvlText w:val="%1."/>
    <w:lvlJc w:val="left"/>
    <w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr>
  </w:lvl>
</w:abstractNum>
"""
    bullet_el = etree.fromstring(bullet_def)
    decimal_el = etree.fromstring(decimal_def)

    first_num = numbering_xml.find(qn("w:num"))
    if first_num is not None:
        first_num.addprevious(bullet_el)
        first_num.addprevious(decimal_el)
    else:
        numbering_xml.append(bullet_el)
        numbering_xml.append(decimal_el)

    existing_nums = {int(n.get(qn("w:numId"))) for n in numbering_xml.findall(qn("w:num"))}
    bullet_num = (max(existing_nums) + 1) if existing_nums else 1
    decimal_num = bullet_num + 1
    for n_id, abs_id in ((bullet_num, bullet_abs), (decimal_num, decimal_abs)):
        numbering_xml.append(etree.fromstring(
            f'<w:num {ns} w:numId="{n_id}"><w:abstractNumId w:val="{abs_id}"/></w:num>'
        ))
    return bullet_num, decimal_num


def attach_list(paragraph, num_id: int) -> None:
    pPr = paragraph._p.get_or_add_pPr()
    numPr = OxmlElement("w:numPr")
    ilvl = OxmlElement("w:ilvl")
    ilvl.set(qn("w:val"), "0")
    nid = OxmlElement("w:numId")
    nid.set(qn("w:val"), str(num_id))
    numPr.append(ilvl)
    numPr.append(nid)
    pPr.append(numPr)


@dataclass
class Block:
    kind: str  # 'h1' | 'subtitle' | 'h2' | 'p' | 'bullet' | 'num' | 'spacer'
    text: str = ""


SECTION_RE = re.compile(r"^(\d{1,2})\.\s*(.+)$")
NUM_ITEM_RE = re.compile(r"^(\d{1,2})\.(.+)$")


def parse_arabic(src: str) -> list[Block]:
    blocks: list[Block] = []
    in_numbered = False
    for raw in src.splitlines():
        line = raw.strip()
        if not line:
            in_numbered = False
            continue
        if line == "الشروط والأحكام":
            blocks.append(Block("h1", line))
            blocks.append(Block("spacer"))
            continue
        if line.startswith("شركة العربة الفاخرة") or line.startswith("منصة"):
            blocks.append(Block("subtitle", line.rstrip("—").strip()))
            continue
        if line.startswith("تاريخ السريان"):
            blocks.append(Block("subtitle", line))
            blocks.append(Block("spacer"))
            continue
        if line.startswith("•"):
            blocks.append(Block("bullet", line.lstrip("•").strip()))
            in_numbered = False
            continue
        m_num = NUM_ITEM_RE.match(line)
        if m_num and in_numbered:
            blocks.append(Block("num", m_num.group(2).strip()))
            continue
        m_section = SECTION_RE.match(line)
        if m_section:
            if blocks and blocks[-1].kind != "spacer":
                blocks.append(Block("spacer"))
            num = int(m_section.group(1))
            title = m_section.group(2).strip()
            blocks.append(Block("h2", f"{num}. {title}"))
            in_numbered = False
            continue
        if line.endswith("بما يلي:"):
            blocks.append(Block("p", line))
            in_numbered = True
            continue
        blocks.append(Block("p", line))
    return blocks


def parse_english(src: str) -> list[Block]:
    blocks: list[Block] = []
    for raw in src.splitlines():
        line = raw.rstrip()
        if not line.strip():
            continue
        if line.startswith("# "):
            blocks.append(Block("h1", line[2:].strip()))
            blocks.append(Block("spacer"))
            continue
        if line.startswith("## "):
            if blocks and blocks[-1].kind != "spacer":
                blocks.append(Block("spacer"))
            blocks.append(Block("h2", line[3:].strip()))
            continue
        if line.startswith("- "):
            blocks.append(Block("bullet", line[2:].strip()))
            continue
        m = re.match(r"^(\d+)\.\s+(.+)$", line)
        if m:
            blocks.append(Block("num", m.group(2).strip()))
            continue
        if line.startswith("**") and line.endswith("**"):
            blocks.append(Block("subtitle", line.strip("*")))
            continue
        if line.startswith("Effective date"):
            blocks.append(Block("subtitle", line))
            blocks.append(Block("spacer"))
            continue
        blocks.append(Block("p", line))
    return blocks


def strip_md_bold(text: str) -> list[tuple[str, bool]]:
    out: list[tuple[str, bool]] = []
    last = 0
    for m in re.finditer(r"\*\*([^*]+)\*\*", text):
        if m.start() > last:
            out.append((text[last:m.start()], False))
        out.append((m.group(1), True))
        last = m.end()
    if last < len(text):
        out.append((text[last:], False))
    if not out:
        out.append((text, False))
    return out


def render(blocks: list[Block], out_path: Path, *, rtl: bool, fallback_font: str) -> None:
    doc = Document()

    # Make Cairo the default font for the entire document so any
    # paragraph that doesn't override picks it up.
    style_normal = doc.styles["Normal"]
    style_normal.font.name = PRIMARY_FONT
    style_normal.font.size = Pt(11)
    style_normal.font.color.rgb = BLACK

    if rtl:
        set_section_rtl(doc)
    else:
        set_section_ltr(doc)

    bullet_num, decimal_num = add_numbering(doc)
    align_start = WD_ALIGN_PARAGRAPH.RIGHT if rtl else WD_ALIGN_PARAGRAPH.LEFT

    def add(text: str, *, size: float, bold: bool = False, alignment=None,
            list_num_id: int | None = None,
            space_before: float = 0, space_after: float = 6,
            line_spacing: float = 1.4) -> None:
        p = doc.add_paragraph()
        p.alignment = alignment if alignment is not None else align_start
        set_paragraph_rtl(p, rtl)
        p.paragraph_format.space_before = Pt(space_before)
        p.paragraph_format.space_after = Pt(space_after)
        p.paragraph_format.line_spacing = line_spacing
        if list_num_id is not None:
            attach_list(p, list_num_id)
        for seg, seg_bold in strip_md_bold(text):
            run = p.add_run(seg)
            style_run(run, primary=PRIMARY_FONT, fallback=fallback_font,
                      rtl=rtl, size_pt=size, bold=bold or seg_bold)

    for blk in blocks:
        if blk.kind == "h1":
            add(blk.text, size=18, bold=True,
                alignment=WD_ALIGN_PARAGRAPH.CENTER,
                space_before=0, space_after=4)
        elif blk.kind == "subtitle":
            add(blk.text, size=11, bold=False,
                alignment=WD_ALIGN_PARAGRAPH.CENTER,
                space_after=2)
        elif blk.kind == "h2":
            add(blk.text, size=13, bold=True,
                space_before=8, space_after=4)
        elif blk.kind == "bullet":
            add(blk.text, size=11, list_num_id=bullet_num, space_after=2)
        elif blk.kind == "num":
            add(blk.text, size=11, list_num_id=decimal_num, space_after=2)
        elif blk.kind == "spacer":
            # Empty paragraph -> blank line in plain-text paste, structure carrier.
            p = doc.add_paragraph()
            set_paragraph_rtl(p, rtl)
            p.paragraph_format.space_after = Pt(0)
            p.paragraph_format.space_before = Pt(0)
        else:
            add(blk.text, size=11)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    doc.save(out_path)
    print(f"Wrote {out_path}")


def main() -> None:
    root = Path(__file__).resolve().parent.parent
    ar_md = (root / "attached_assets" / "terms_conditions_ar_2026-04-30.md").read_text(encoding="utf-8")
    en_md = (root / "attached_assets" / "terms_conditions_en_2026-04-30.md").read_text(encoding="utf-8")
    render(parse_arabic(ar_md),
           out_path=root / "attached_assets" / "terms_conditions_ar_2026-04-30.docx",
           rtl=True, fallback_font=FALLBACK_FONT_AR)
    render(parse_english(en_md),
           out_path=root / "attached_assets" / "terms_conditions_en_2026-04-30.docx",
           rtl=False, fallback_font=FALLBACK_FONT_EN)


if __name__ == "__main__":
    main()
