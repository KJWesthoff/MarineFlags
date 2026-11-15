#!/usr/bin/env python3
"""Build src/data/codebook.json from the International Code of Signals (Pub. 102,
1969 edition, revised 2020 - a public domain US government publication).

Usage:
    pdftotext -layout Pub102.pdf pub102.txt
    python3 tools/build_codebook.py pub102.txt src/data/codebook.json

Manual fixes go in tools/codebook_corrections.json ({"CODE": "corrected meaning"},
null removes an entry); they are applied last.
"""
import json
import re
import sys
from pathlib import Path

SECTIONS = {
    1: "Distress – Emergency",
    2: "Casualties – Damages",
    3: "Aids to Navigation – Navigation – Hydrography",
    4: "Maneuvers",
    5: "Miscellaneous",
    6: "Meteorology – Weather",
    7: "Routing of Ships",
    8: "Communications",
    9: "International Health Regulations",
}

GENERAL_RE = re.compile(r"^\s*([*•·]*)\s*([A-Z]{2})\s?([0-9]{1,2})?\s{2,}(\S.*)$")
MEDICAL_RE = re.compile(r"^\s*([*•·]*)\s*(M[A-Z]{2})\s?([0-9]{1,2})?\s{2,}(\S.*)$")
HEADER_RE = re.compile(r"CHAPTER\s+\d|^\s*Code\s+Meaning|^\s*Cross\s*$|^\s*Reference\s*$|^\s*\d{1,3}\s*$")
SECTION_RE = re.compile(r"^\s*SECTION\s+(\d+)\s*[:.]")
XREF_RE = re.compile(r"(\.\s){6,}")


def build_vocab(path):
    """Hyphenated compounds used in the book, to tell them from line-break hyphens."""
    text = Path(path).read_text(errors="replace")
    return {w.lower() for w in re.findall(r"[A-Za-z]+-[A-Za-z]+", text)}


def clean(lines, vocab):
    text = ""
    for line in lines:
        line = line.strip()
        if text.endswith("-") and line:
            head = re.findall(r"[A-Za-z]+-$", text)
            tail = re.match(r"[a-z]+", line)
            if head and tail and (head[0] + tail.group(0)).lower() not in vocab:
                text = text[:-1] + line
            else:
                text += line
        else:
            text += (" " if text else "") + line
    text = re.sub(r"\s*(\.\s?){3,}", "… ", text)
    text = re.sub(r"\s+", " ", text).strip()
    text = re.sub(r"\s+([,;:?!)])", r"\1", text)
    return text


def parse(lines, start, end, entry_re, medical, vocab):
    entries = {}
    order = []
    section = None
    block = []

    def flush():
        nonlocal block
        if block:
            m = entry_re.match(block[0])
            block = block[: next((i for i, l in enumerate(block) if XREF_RE.search(l)), len(block))] if m and not XREF_RE.search(block[0]) else []
            if m and block:
                star, code, num, first = m.groups()
                if num:
                    code = f"{code} {int(num)}"
                meaning = clean([first] + block[1:], vocab)
                if len(meaning) > 3 and code not in entries:
                    entries[code] = {
                        "code": code,
                        "meaning": meaning,
                        "section": "Medical" if medical else section,
                    }
                    if star:
                        entries[code]["procedural"] = True
                    order.append(code)
        block = []

    for raw in lines[start:end]:
        line = raw.rstrip()
        sm = SECTION_RE.search(line)
        if sm and not medical:
            section = SECTIONS.get(int(sm.group(1)), section)
        if not line.strip() or HEADER_RE.search(line) or sm:
            flush()
            continue
        if entry_re.match(line) and block:
            flush()
        block.append(line)
    flush()
    return entries, order


def find(lines, pattern, after=0):
    rx = re.compile(pattern)
    for i in range(after, len(lines)):
        if rx.search(lines[i]):
            return i
    raise SystemExit(f"marker not found: {pattern}")


def main():
    layout, out = sys.argv[1:3]
    lines = Path(layout).read_text(errors="replace").splitlines()
    vocab = build_vocab(layout)

    g_start = find(lines, r"^\s*SECTION 1: DISTRESS.EMERGENCY\s*$")
    g_end = find(lines, r"^\s*SECTION 10: TABLES OF COMPLEMENTS\s*$", g_start)
    m_start = find(lines, r"^\s*CHAPTER 3\s*$", g_end)
    m_start = find(lines, r"^\s*CHAPTER 3\s*$", m_start + 1)
    m_end = find(lines, r"SECTION 4: TABLES OF COMPLEMENTS\s*$", m_start)

    general, g_order = parse(lines, g_start, g_end, GENERAL_RE, False, vocab)
    medical, m_order = parse(lines, m_start, m_end, MEDICAL_RE, True, vocab)

    entries = {**general, **medical}
    corrections = Path(__file__).with_name("codebook_corrections.json")
    if corrections.exists():
        for code, meaning in json.loads(corrections.read_text()).items():
            if meaning is None:
                entries.pop(code, None)
            elif code in entries:
                entries[code]["meaning"] = meaning
            else:
                entries[code] = {"code": code, "meaning": meaning,
                                 "section": "Medical" if len(code.split()[0]) == 3 else None}

    def sort_key(code):
        parts = code.split()
        return (len(parts[0]), parts[0], int(parts[1]) if len(parts) > 1 else -1)

    result = [entries[c] for c in sorted(entries, key=sort_key)]
    Path(out).write_text(json.dumps(result, ensure_ascii=False, indent=1) + "\n")

    # Report: codes that break alphabetical order are likely OCR misreads.
    def out_of_order(order):
        bad, prev = [], None
        for code in order:
            if prev and sort_key(code) < sort_key(prev):
                bad.append(f"{prev} -> {code}")
            prev = code
        return bad

    print(f"general: {len(general)}  medical: {len(medical)}  total: {len(result)}", file=sys.stderr)
    print("out of order (general):", out_of_order(g_order), file=sys.stderr)
    print("out of order (medical):", out_of_order(m_order), file=sys.stderr)


if __name__ == "__main__":
    main()
