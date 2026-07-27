---
name: docx
description: Convert between Markdown and DOCX — docx→md for reading Word documents; md→docx for generating Word documents (and PDF downstream).
argument-hint: "<path-to-file> [output-path]"
---

Convert between `.docx` and `.md` in either direction.

## Usage

### DOCX → Markdown

```bash
python3 .claude/skills/docx/script/docx_to_md.py <input.docx> [output.md]
```

- If no output path is given, the Markdown is printed to stdout.
- If an output path is given, the result is written to that file.

### Markdown → DOCX

```bash
python3 .claude/skills/docx/script/md_to_docx.py <input.md> [output.docx]
```

- If no output path is given, the docx is written next to the input (same stem, `.docx` extension).
- The generated docx can be opened in Word / Google Docs / LibreOffice and exported to PDF.

## What it preserves

### docx → md
- Headings (mapped to `#`, `##`, etc.)
- Bold, italic, bold+italic
- Bulleted and numbered lists (with nesting)
- Tables (converted to Markdown tables)

### md → docx
- Headings (H1–H6) — styled for a clean client-facing look
- Paragraphs with bold, italic, inline code
- Bulleted and numbered lists (multi-level supported)
- Code fences (Consolas, light grey background)
- Horizontal rules
- Blockquotes (indented, italic)
- Tables (with header row)

## When to use

- **docx → md**: when the user shares a `.docx` and you need to read, summarise, or file its content into notes.
- **md → docx**: when the user wants a printable / PDF-ready version of a Markdown doc (announcements, reports, specs). Open the docx in Word or Google Docs and export to PDF.

## Dependencies

### docx → md
- `python-docx` (`pip3 install python-docx`)

### md → docx
- `markdown-it-py` (`pip3 install markdown-it-py`; also available as the `python3-markdown-it` system package on Debian/Ubuntu).
- No `python-docx` required — the converter writes OOXML directly using stdlib `zipfile` + `xml.etree`.

## Notes

- md → docx does **not** embed images yet — image references are skipped. If images are needed, open the docx in Word and insert manually, or extend the script.
- Generated docx files use Calibri for body text and Consolas for code. Tweak `STYLES` in `md_to_docx.py` if a different brand look is wanted.
