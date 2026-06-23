"""
strip_dark_classes.py — One-shot eradication of every `dark:` Tailwind variant.

Run from the omnis-ui project root:

    python scripts/strip_dark_classes.py

Behaviour
---------
- Walks app/, components/, hooks/, lib/, src/, utils/.
- Skips node_modules, .next, dist, .git, .venv, scripts/.
- Strips every occurrence of `dark:<token>` from .tsx / .ts / .jsx / .js / .css
  source files, preserving surrounding whitespace cleanly AND respecting
  string-literal boundaries (single quote, double quote, backtick).
- Idempotent: running it twice is a no-op.

The token character class `[^\\s"'`]+` halts at any whitespace OR string
delimiter, which prevents the destructive bug where greedy `\\S+` would gobble
the closing quote of a className string.
"""
from __future__ import annotations

import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
TARGETS = ("app", "components", "hooks", "lib", "src", "utils")
EXTS = {".tsx", ".ts", ".jsx", ".js", ".css"}
SKIP_DIRS = {"node_modules", ".next", "dist", ".git", ".venv", "scripts"}

# Token char class — anything that isn't whitespace OR a string delimiter.
# Tailwind class tokens never legitimately contain ", ', or `.
TOKEN = r"[^\s\"'`]+"

PATTERNS = [
    # ` dark:foo` — strip leading whitespace + token (preserves surrounding spacing)
    re.compile(rf"[ \t]+dark:{TOKEN}"),
    # `dark:foo ` — strip token + trailing whitespace (handles start-of-string case)
    re.compile(rf"dark:{TOKEN}[ \t]+"),
    # `dark:foo`  — bare token (start AND end of string, e.g. `"dark:foo"`)
    re.compile(rf"dark:{TOKEN}"),
]


def strip(text: str) -> str:
    for pat in PATTERNS:
        text = pat.sub("", text)
    return text


def main() -> int:
    changed = 0
    for tgt in TARGETS:
        base = ROOT / tgt
        if not base.exists():
            continue
        for path in base.rglob("*"):
            if not path.is_file():
                continue
            if path.suffix not in EXTS:
                continue
            if any(part in SKIP_DIRS for part in path.parts):
                continue
            original = path.read_text(encoding="utf-8")
            updated = strip(original)
            if updated != original:
                path.write_text(updated, encoding="utf-8")
                changed += 1
                print(f"  stripped: {path.relative_to(ROOT)}")
    print(f"\nDone. {changed} file(s) modified.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
