#!/usr/bin/env python3
"""Convert a DOCX file to Markdown, preserving headings, lists, bold/italic, and tables."""

import sys
import re
from pathlib import Path
from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH


def run_to_md(run):
    text = run.text
    if not text:
        return ""
    if run.bold and run.italic:
        return f"***{text}***"
    if run.bold:
        return f"**{text}**"
    if run.italic:
        return f"*{text}*"
    return text


def paragraph_to_md(para):
    text = "".join(run_to_md(r) for r in para.runs)
    if not text.strip():
        return ""

    style = para.style.name.lower() if para.style else ""

    # Headings
    if style.startswith("heading"):
        match = re.search(r"\d+", style)
        level = int(match.group()) if match else 1
        return f"{'#' * level} {text}"

    # List items
    numPr = para._element.find(
        ".//{http://schemas.openxmlformats.org/wordprocessingml/2006/main}numPr"
    )
    if numPr is not None or "list" in style:
        ilvl_el = para._element.find(
            ".//{http://schemas.openxmlformats.org/wordprocessingml/2006/main}ilvl"
        )
        indent = int(ilvl_el.get("{http://schemas.openxmlformats.org/wordprocessingml/2006/main}val", "0")) if ilvl_el is not None else 0
        prefix = "  " * indent + "- "
        return f"{prefix}{text}"

    return text


def table_to_md(table):
    rows = []
    for row in table.rows:
        cells = [cell.text.strip().replace("\n", " ") for cell in row.cells]
        rows.append(cells)

    if not rows:
        return ""

    lines = []
    # Header
    lines.append("| " + " | ".join(rows[0]) + " |")
    lines.append("| " + " | ".join("---" for _ in rows[0]) + " |")
    for row in rows[1:]:
        # Pad row if fewer cells than header
        while len(row) < len(rows[0]):
            row.append("")
        lines.append("| " + " | ".join(row) + " |")

    return "\n".join(lines)


def convert(docx_path, output_path=None):
    doc = Document(docx_path)
    parts = []

    for element in doc.element.body:
        tag = element.tag.split("}")[-1]

        if tag == "p":
            from docx.text.paragraph import Paragraph
            para = Paragraph(element, doc)
            md = paragraph_to_md(para)
            parts.append(md)

        elif tag == "tbl":
            from docx.table import Table
            table = Table(element, doc)
            parts.append(table_to_md(table))

    result = "\n\n".join(p for p in parts if p is not None)
    # Collapse excessive blank lines
    result = re.sub(r"\n{3,}", "\n\n", result)

    if output_path:
        Path(output_path).write_text(result, encoding="utf-8")
        print(f"Written to {output_path}")
    else:
        print(result)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: docx_to_md.py <input.docx> [output.md]", file=sys.stderr)
        sys.exit(1)
    convert(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else None)
