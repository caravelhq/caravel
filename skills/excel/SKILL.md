---
name: excel
description: Read Excel workbooks and output sheets as Markdown tables or CSV.
argument-hint: "<path-to-file.xlsx> [--sheet NAME] [--columns A,B,J] [--filter COL=VALUE] [--csv]"
---

Read an Excel file and output its contents as Markdown tables (default) or CSV.

## Usage

```bash
python3 .claude/skills/excel/script/excel_read.py <file.xlsx> [options]
```

### Options

| Flag | Description |
|---|---|
| `--sheet NAME` | Read only this sheet (default: all sheets) |
| `--columns A,B,J` | Only include these columns (letter or 1-based index) |
| `--filter COL=VALUE` | Only show rows where column COL contains VALUE (case-insensitive) |
| `--csv` | Output as CSV instead of Markdown table |

### Examples

```bash
# Read all sheets
python3 .claude/skills/excel/script/excel_read.py data.xlsx

# Read a specific sheet, selected columns
python3 .claude/skills/excel/script/excel_read.py data.xlsx --sheet "Summary" --columns A,B,F

# Filter rows where Status contains "Open"
python3 .claude/skills/excel/script/excel_read.py data.xlsx --filter Status=Open

# Export as CSV
python3 .claude/skills/excel/script/excel_read.py data.xlsx --sheet "Costs" --csv
```

## When to use

- When the user shares or references an `.xlsx` file and you need to read its contents
- When extracting data from spreadsheets for analysis, summaries, or filing into notes
- When comparing spreadsheet data with other sources (issue trackers, project files, etc.)

## Dependencies

Requires `openpyxl`:
```bash
pip3 install openpyxl
```
