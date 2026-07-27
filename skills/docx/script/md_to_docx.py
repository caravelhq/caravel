#!/usr/bin/env python3
"""Convert a Markdown file to DOCX.

Uses markdown-it-py to parse Markdown, then assembles a minimal OOXML
docx using only the Python standard library (zipfile + xml.etree).
No python-docx dependency.

Supports: headings (h1-h6), paragraphs, bold, italic, inline code,
bulleted lists, numbered lists (single level), code fences, blockquotes,
horizontal rules, and simple tables.
"""

import sys
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from xml.sax.saxutils import escape

from markdown_it import MarkdownIt

W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"


def el(tag, attrs=None, *children):
    """Build an XML element string with the w: namespace prefix."""
    attr_str = ""
    if attrs:
        attr_str = "".join(f' w:{k}="{escape(str(v), {chr(34): "&quot;"})}"' for k, v in attrs.items())
    if not children:
        return f"<w:{tag}{attr_str}/>"
    inner = "".join(children)
    return f"<w:{tag}{attr_str}>{inner}</w:{tag}>"


def run(text, bold=False, italic=False, code=False):
    """Build a text run with optional formatting."""
    rpr_parts = []
    if bold:
        rpr_parts.append("<w:b/>")
    if italic:
        rpr_parts.append("<w:i/>")
    if code:
        rpr_parts.append('<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/>')
    rpr = f"<w:rPr>{''.join(rpr_parts)}</w:rPr>" if rpr_parts else ""
    # xml:space="preserve" so leading/trailing spaces survive
    txt = f'<w:t xml:space="preserve">{escape(text)}</w:t>'
    return f"<w:r>{rpr}{txt}</w:r>"


def paragraph(runs, style=None, numId=None, ilvl=0):
    """Wrap runs in a paragraph with optional style and list numbering."""
    ppr_parts = []
    if style:
        ppr_parts.append(f'<w:pStyle w:val="{style}"/>')
    if numId is not None:
        ppr_parts.append(
            f'<w:numPr><w:ilvl w:val="{ilvl}"/><w:numId w:val="{numId}"/></w:numPr>'
        )
    ppr = f"<w:pPr>{''.join(ppr_parts)}</w:pPr>" if ppr_parts else ""
    return f"<w:p>{ppr}{''.join(runs)}</w:p>"


def hr_paragraph():
    """A paragraph with a bottom border — renders as a horizontal rule."""
    ppr = (
        "<w:pPr>"
        '<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="auto"/></w:pBdr>'
        "</w:pPr>"
    )
    return f"<w:p>{ppr}</w:p>"


def collect_inlines(children):
    """Walk inline token children, emit list of run XML strings.

    markdown-it emits open/close pairs for strong, em, code_inline; text
    tokens carry the content. We track bold/italic state as we walk.
    """
    runs = []
    bold = False
    italic = False
    for tok in children or []:
        t = tok.type
        if t == "strong_open":
            bold = True
        elif t == "strong_close":
            bold = False
        elif t == "em_open":
            italic = True
        elif t == "em_close":
            italic = False
        elif t == "code_inline":
            runs.append(run(tok.content, bold=bold, italic=italic, code=True))
        elif t == "text":
            if tok.content:
                runs.append(run(tok.content, bold=bold, italic=italic))
        elif t == "softbreak":
            runs.append(run(" "))
        elif t == "hardbreak":
            runs.append("<w:r><w:br/></w:r>")
        elif t == "link_open":
            # Render link text inline; drop URL formatting for simplicity
            pass
        elif t == "link_close":
            pass
        # Ignore image tokens etc — not supported in this minimal pass
    return runs


def tokens_to_body(tokens):
    """Walk markdown-it token stream, emit list of docx block XML strings."""
    body = []
    i = 0
    # List state: stack of (kind, numId) where kind is "bullet" or "ordered"
    list_stack = []

    while i < len(tokens):
        tok = tokens[i]
        t = tok.type

        if t == "heading_open":
            level = int(tok.tag[1])
            # The next token is the inline content
            inline = tokens[i + 1]
            runs = collect_inlines(inline.children)
            body.append(paragraph(runs, style=f"Heading{level}"))
            i += 3  # heading_open, inline, heading_close
            continue

        if t == "paragraph_open":
            inline = tokens[i + 1]
            runs = collect_inlines(inline.children)
            # If we're inside a list, tag with the current numId
            if list_stack:
                kind, num_id = list_stack[-1]
                ilvl = len(list_stack) - 1
                body.append(paragraph(runs, style="ListParagraph", numId=num_id, ilvl=ilvl))
            else:
                body.append(paragraph(runs))
            i += 3
            continue

        if t == "bullet_list_open":
            list_stack.append(("bullet", 1))
            i += 1
            continue

        if t == "ordered_list_open":
            list_stack.append(("ordered", 2))
            i += 1
            continue

        if t in ("bullet_list_close", "ordered_list_close"):
            if list_stack:
                list_stack.pop()
            i += 1
            continue

        if t in ("list_item_open", "list_item_close"):
            i += 1
            continue

        if t == "fence" or t == "code_block":
            # One paragraph per line, Consolas
            for line in tok.content.rstrip("\n").split("\n"):
                body.append(paragraph([run(line, code=True)], style="CodeBlock"))
            i += 1
            continue

        if t == "hr":
            body.append(hr_paragraph())
            i += 1
            continue

        if t == "blockquote_open":
            # Find matching close; render inner paragraphs with Quote style
            depth = 1
            j = i + 1
            inner_tokens = []
            while j < len(tokens) and depth > 0:
                if tokens[j].type == "blockquote_open":
                    depth += 1
                elif tokens[j].type == "blockquote_close":
                    depth -= 1
                    if depth == 0:
                        break
                inner_tokens.append(tokens[j])
                j += 1
            # Render inner, then re-style to Quote
            inner_body = tokens_to_body(inner_tokens)
            for blk in inner_body:
                # crude: replace pStyle if present, else inject one
                if "<w:pStyle" in blk:
                    blk = blk.replace(
                        blk[blk.index("<w:pStyle"):blk.index("/>", blk.index("<w:pStyle")) + 2],
                        '<w:pStyle w:val="Quote"/>',
                    )
                else:
                    blk = blk.replace("<w:p>", '<w:p><w:pPr><w:pStyle w:val="Quote"/></w:pPr>', 1)
                body.append(blk)
            i = j + 1
            continue

        if t == "table_open":
            # Collect rows until table_close
            rows = []
            j = i + 1
            current_row = None
            in_header = False
            while j < len(tokens) and tokens[j].type != "table_close":
                tt = tokens[j].type
                if tt == "thead_open":
                    in_header = True
                elif tt == "thead_close":
                    in_header = False
                elif tt == "tr_open":
                    current_row = {"cells": [], "header": in_header}
                elif tt == "tr_close":
                    if current_row:
                        rows.append(current_row)
                    current_row = None
                elif tt in ("th_open", "td_open"):
                    # Next inline token has the cell content
                    inline = tokens[j + 1]
                    runs = collect_inlines(inline.children)
                    if current_row is not None:
                        current_row["cells"].append(runs)
                    j += 2  # skip inline + close
                j += 1
            body.append(build_table(rows))
            i = j + 1
            continue

        # Unknown token — skip
        i += 1

    return body


def build_table(rows):
    """Assemble a simple OOXML table from a list of row dicts."""
    if not rows:
        return ""
    # Table properties — table grid matching column count
    col_count = max(len(r["cells"]) for r in rows)
    grid = "".join('<w:gridCol w:w="2000"/>' for _ in range(col_count))
    tbl_pr = (
        "<w:tblPr>"
        '<w:tblStyle w:val="TableGrid"/>'
        '<w:tblW w:w="0" w:type="auto"/>'
        "</w:tblPr>"
    )
    tbl_grid = f"<w:tblGrid>{grid}</w:tblGrid>"

    body = []
    for r in rows:
        cells_xml = []
        for cell_runs in r["cells"]:
            # Style header rows bold
            if r["header"]:
                cell_runs = [
                    run_xml.replace(
                        "<w:rPr>", "<w:rPr><w:b/>", 1
                    ) if "<w:rPr>" in run_xml else run_xml.replace(
                        "<w:r>", "<w:r><w:rPr><w:b/></w:rPr>", 1
                    )
                    for run_xml in cell_runs
                ]
            cell_para = paragraph(cell_runs) if cell_runs else "<w:p/>"
            tc_pr = '<w:tcPr><w:tcW w:w="2000" w:type="dxa"/></w:tcPr>'
            cells_xml.append(f"<w:tc>{tc_pr}{cell_para}</w:tc>")
        # Pad short rows
        while len(cells_xml) < col_count:
            cells_xml.append(f'<w:tc><w:tcPr><w:tcW w:w="2000" w:type="dxa"/></w:tcPr><w:p/></w:tc>')
        body.append(f"<w:tr>{''.join(cells_xml)}</w:tr>")

    return f"<w:tbl>{tbl_pr}{tbl_grid}{''.join(body)}</w:tbl>"


# ---------- DOCX file parts ----------

CONTENT_TYPES = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>
"""

PKG_RELS = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>
"""

DOC_RELS = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>
</Relationships>
"""

STYLES = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="22"/></w:rPr></w:rPrDefault>
    <w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
  <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="360" w:after="120"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:b/><w:sz w:val="36"/><w:color w:val="1F3864"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="280" w:after="100"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:sz w:val="28"/><w:color w:val="2E74B5"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="80"/><w:outlineLvl w:val="2"/></w:pPr><w:rPr><w:b/><w:sz w:val="24"/><w:color w:val="2E74B5"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading4"><w:name w:val="heading 4"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="200" w:after="60"/><w:outlineLvl w:val="3"/></w:pPr><w:rPr><w:b/><w:i/><w:sz w:val="22"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading5"><w:name w:val="heading 5"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:rPr><w:b/><w:sz w:val="22"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading6"><w:name w:val="heading 6"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:rPr><w:i/><w:sz w:val="22"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:pPr><w:ind w:left="720"/><w:contextualSpacing/></w:pPr></w:style>
  <w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:basedOn w:val="Normal"/><w:pPr><w:ind w:left="720"/></w:pPr><w:rPr><w:i/><w:color w:val="404040"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="CodeBlock"><w:name w:val="Code Block"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="0"/><w:shd w:val="clear" w:color="auto" w:fill="F2F2F2"/></w:pPr><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/><w:sz w:val="20"/></w:rPr></w:style>
  <w:style w:type="table" w:styleId="TableGrid"><w:name w:val="Table Grid"/><w:basedOn w:val="TableNormal"/><w:tblPr><w:tblBorders><w:top w:val="single" w:sz="4" w:color="auto"/><w:left w:val="single" w:sz="4" w:color="auto"/><w:bottom w:val="single" w:sz="4" w:color="auto"/><w:right w:val="single" w:sz="4" w:color="auto"/><w:insideH w:val="single" w:sz="4" w:color="auto"/><w:insideV w:val="single" w:sz="4" w:color="auto"/></w:tblBorders></w:tblPr></w:style>
  <w:style w:type="table" w:styleId="TableNormal" w:default="1"><w:name w:val="Normal Table"/></w:style>
</w:styles>
"""

NUMBERING = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:abstractNum w:abstractNumId="0">
    <w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr></w:lvl>
    <w:lvl w:ilvl="1"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="◦"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="1440" w:hanging="360"/></w:pPr></w:lvl>
    <w:lvl w:ilvl="2"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="▪"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="2160" w:hanging="360"/></w:pPr></w:lvl>
  </w:abstractNum>
  <w:abstractNum w:abstractNumId="1">
    <w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr></w:lvl>
    <w:lvl w:ilvl="1"><w:start w:val="1"/><w:numFmt w:val="lowerLetter"/><w:lvlText w:val="%2."/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="1440" w:hanging="360"/></w:pPr></w:lvl>
    <w:lvl w:ilvl="2"><w:start w:val="1"/><w:numFmt w:val="lowerRoman"/><w:lvlText w:val="%3."/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="2160" w:hanging="360"/></w:pPr></w:lvl>
  </w:abstractNum>
  <w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>
  <w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num>
</w:numbering>
"""

APP_XML = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">
  <Application>md-to-docx</Application>
</Properties>
"""


def core_xml(title):
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    return f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"
  xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>{escape(title)}</dc:title>
  <dc:creator>md-to-docx</dc:creator>
  <cp:lastModifiedBy>md-to-docx</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">{now}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">{now}</dcterms:modified>
</cp:coreProperties>
"""


def document_xml(body_xml):
    return f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="{W}" xmlns:r="{R}">
  <w:body>{body_xml}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr></w:body>
</w:document>
"""


def convert(md_path, output_path=None):
    src = Path(md_path).read_text(encoding="utf-8")
    md = MarkdownIt("commonmark", {"html": False}).enable("table").enable("strikethrough")
    tokens = md.parse(src)
    body_blocks = tokens_to_body(tokens)
    body_xml = "".join(body_blocks)

    if output_path is None:
        output_path = Path(md_path).with_suffix(".docx")
    output_path = Path(output_path)

    title = Path(md_path).stem.replace("_", " ").replace("-", " ")

    with zipfile.ZipFile(output_path, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", CONTENT_TYPES)
        z.writestr("_rels/.rels", PKG_RELS)
        z.writestr("word/_rels/document.xml.rels", DOC_RELS)
        z.writestr("word/document.xml", document_xml(body_xml))
        z.writestr("word/styles.xml", STYLES)
        z.writestr("word/numbering.xml", NUMBERING)
        z.writestr("docProps/app.xml", APP_XML)
        z.writestr("docProps/core.xml", core_xml(title))

    print(f"Written to {output_path}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: md_to_docx.py <input.md> [output.docx]", file=sys.stderr)
        sys.exit(1)
    convert(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else None)
