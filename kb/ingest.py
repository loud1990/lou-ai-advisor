#!/usr/bin/env python3
"""Knowledge-base ingestion pipeline for the Civ 7 AI Advisor.

Reads Sid Meier's Civilization VII Civilopedia text (the in-game encyclopedia)
from the installed game files, turns each pedia page into a knowledge document,
and indexes everything in a SQLite FTS5 full-text store for fast retrieval.

FTS5 keeps the pipeline dependency-free and fully offline (no embedding API),
while still giving ranked BM25 retrieval that's plenty for grounding advisors.

Usage:
  python ingest.py build                       # (re)build kb.sqlite
  python ingest.py query "found a city" -k 5   # test retrieval
  python ingest.py stats                        # show counts by section
"""
import argparse
import glob
import os
import re
import sqlite3
import sys
import xml.etree.ElementTree as ET

GAME_DIR = (
    "/home/lou/.steam/debian-installation/steamapps/common/"
    "Sid Meier's Civilization VII"
)
KB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "kb.sqlite")

# section label keyed off the source filename
SECTION_FROM_FILE = {
    "ages": "Ages",
    "concepts": "Concepts",
    "constructibles": "Buildings & Improvements",
    "features": "Map Features",
    "leaders": "Leaders",
    "resources": "Resources",
    "terrain": "Terrain",
    "units": "Units",
    "victories": "Victories",
    "antiquity": "Age: Antiquity",
    "exploration": "Age: Exploration",
    "modern": "Age: Modern",
}

TAG_RE = re.compile(r"\[[^\]]*\]")  # [N], [B], [LINK_...], [ICON_...] etc.


def clean(text: str) -> str:
    text = text.replace("[N]", "\n").replace("[n]", "\n")
    text = TAG_RE.sub("", text)
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def section_for(path: str) -> str:
    name = os.path.basename(path).lower()
    for key, label in SECTION_FROM_FILE.items():
        if key in name:
            return label
    return "General"


def find_sources():
    """All Civilopedia text XML files across base + age + DLC modules."""
    pats = [
        os.path.join(GAME_DIR, "Base/modules/**/text/en_us/*ivilopedia*Text.xml"),
        os.path.join(GAME_DIR, "DLC/**/text/en_us/*ivilopedia*Text.xml"),
    ]
    files = []
    for p in pats:
        files.extend(glob.glob(p, recursive=True))
    return sorted(set(files))


def parse_rows(path):
    """Return {tag: text} for a localization XML file."""
    out = {}
    try:
        tree = ET.parse(path)
    except ET.ParseError as e:
        print(f"  ! parse error {path}: {e}", file=sys.stderr)
        return out
    for row in tree.iter("Row"):
        tag = row.get("Tag")
        if not tag:
            continue
        txt = row.findtext("Text")
        if txt:
            out[tag] = txt
    return out


PAGE_RE = re.compile(r"^LOC_PEDIA_PAGE_(.+?)_(TITLE|CHAPTER.*|SUBTITLE)$")


def build_pages(rows):
    """Group pedia rows into pages keyed by their page id.

    Tags look like LOC_PEDIA_PAGE_<PAGEID>_TITLE and
    LOC_PEDIA_PAGE_<PAGEID>_CHAPTER_CONTENT_PARA_<n>.
    """
    pages = {}
    for tag, txt in rows.items():
        m = PAGE_RE.match(tag)
        if not m:
            continue
        pageid, kind = m.group(1), m.group(2)
        page = pages.setdefault(pageid, {"title": None, "paras": []})
        if kind == "TITLE":
            page["title"] = clean(txt)
        else:
            page["paras"].append((tag, clean(txt)))
    return pages


def natural_key(s):
    return [int(t) if t.isdigit() else t for t in re.split(r"(\d+)", s)]


def build():
    sources = find_sources()
    if not sources:
        print("No Civilopedia sources found. Is the game installed?", file=sys.stderr)
        sys.exit(1)
    if os.path.exists(KB_PATH):
        os.remove(KB_PATH)
    db = sqlite3.connect(KB_PATH)
    db.execute(
        "CREATE VIRTUAL TABLE docs USING fts5("
        "section, title, body, pageid UNINDEXED, source UNINDEXED, "
        "tokenize='porter unicode61')"
    )
    n_docs = 0
    for path in sources:
        section = section_for(path)
        rows = parse_rows(path)
        pages = build_pages(rows)
        for pageid, page in pages.items():
            title = page["title"] or pageid.replace("_", " ").title()
            paras = sorted(page["paras"], key=lambda kv: natural_key(kv[0]))
            body = "\n\n".join(p for _, p in paras if p)
            if not body:
                continue
            db.execute(
                "INSERT INTO docs(section, title, body, pageid, source) "
                "VALUES (?,?,?,?,?)",
                (section, title, body, pageid, os.path.basename(path)),
            )
            n_docs += 1
    db.commit()
    print(f"Indexed {n_docs} knowledge documents from {len(sources)} sources -> {KB_PATH}")
    db.close()


def ingest_curated():
    """Index curated local markdown docs (e.g. benchmarks.md) into the existing
    kb without rebuilding from game files. Each top-level '## ' section becomes
    one document in the 'Benchmarks' section. Idempotent: clears prior curated
    docs first so it can be re-run after editing the markdown."""
    here = os.path.dirname(os.path.abspath(__file__))
    md_files = sorted(glob.glob(os.path.join(here, "*.md")))
    if not md_files:
        print("No curated .md files found.", file=sys.stderr)
        return
    if not os.path.exists(KB_PATH):
        print("kb.sqlite missing; run `build` first.", file=sys.stderr)
        sys.exit(1)
    db = sqlite3.connect(KB_PATH)
    db.execute("DELETE FROM docs WHERE section = 'Benchmarks'")
    n = 0
    for path in md_files:
        with open(path, encoding="utf-8") as fh:
            text = fh.read()
        src = os.path.basename(path)
        # split on level-2 headers, keep the header as the doc title
        parts = re.split(r"^##\s+(.+)$", text, flags=re.MULTILINE)
        # parts = [preamble, title1, body1, title2, body2, ...]
        for i in range(1, len(parts), 2):
            title = parts[i].strip()
            body = parts[i + 1].strip() if i + 1 < len(parts) else ""
            if not body:
                continue
            db.execute(
                "INSERT INTO docs(section, title, body, pageid, source) "
                "VALUES (?,?,?,?,?)",
                ("Benchmarks", title, body, f"{src}#{i // 2}", src),
            )
            n += 1
    db.commit()
    db.close()
    print(f"Indexed {n} curated benchmark docs from {len(md_files)} file(s).")


def query(text, k=5, section=None):
    db = sqlite3.connect(KB_PATH)
    db.row_factory = sqlite3.Row
    # sanitize query into an FTS OR-match of terms (robust to punctuation)
    terms = re.findall(r"[A-Za-z0-9]+", text)
    if not terms:
        return []
    match = " OR ".join(terms)
    sql = (
        "SELECT section, title, body, bm25(docs) AS score FROM docs "
        "WHERE docs MATCH ? "
    )
    args = [match]
    if section:
        sql += "AND section = ? "
        args.append(section)
    sql += "ORDER BY score LIMIT ?"
    args.append(k)
    rows = db.execute(sql, args).fetchall()
    db.close()
    return [dict(r) for r in rows]


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("build")
    q = sub.add_parser("query")
    q.add_argument("text")
    q.add_argument("-k", type=int, default=5)
    q.add_argument("--section", default=None)
    sub.add_parser("stats")
    sub.add_parser("curate")
    args = ap.parse_args()

    if args.cmd == "build":
        build()
    elif args.cmd == "curate":
        ingest_curated()
    elif args.cmd == "query":
        for r in query(args.text, args.k, args.section):
            print(f"[{r['section']}] {r['title']}  (score {r['score']:.2f})")
            snippet = r["body"][:300].replace("\n", " ")
            print(f"    {snippet}...")
    elif args.cmd == "stats":
        db = sqlite3.connect(KB_PATH)
        for section, n in db.execute(
            "SELECT section, COUNT(*) FROM docs GROUP BY section ORDER BY 2 DESC"
        ):
            print(f"{n:5d}  {section}")
        total = db.execute("SELECT COUNT(*) FROM docs").fetchone()[0]
        print(f"{total:5d}  TOTAL")
        db.close()


if __name__ == "__main__":
    main()
