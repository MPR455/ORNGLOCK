"""Download the 36 detailed on-call chapters from med-study-rpg.com/oncall/c/
and save each one as Markdown under ./articles/ for personal study.

The chapters are (c) WLK M.D. and are not openly licensed, so ./articles/ is
git-ignored: keep the copies local and do not commit or redistribute them.

Usage:
    python scrape_detailed.py            # all chapters
    python scrape_detailed.py sodium     # only chapters whose slug matches

Standard library only (Python 3.9+).
"""

import html
import json
import re
import sys
import time
import urllib.request
from html.parser import HTMLParser
from pathlib import Path

BASE = "https://med-study-rpg.com"
INDEX_URL = BASE + "/oncall/c/"
OUT_DIR = Path(__file__).resolve().parent / "articles"
USER_AGENT = "Mozilla/5.0 (personal study scraper)"
DELAY_SECONDS = 1.5

# Elements whose whole subtree is interactive UI, not article text.
SKIP_TAGS = {"script", "style", "noscript", "button", "form", "nav", "input",
             "select", "option", "textarea", "label", "output", "fieldset"}
SKIP_CLASSES = {"calc", "ch-jump", "ch-toc", "crumbs"}
VOID_TAGS = {"br", "hr", "img", "input", "meta", "link", "wbr", "source"}


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read().decode("utf-8")


def list_chapters():
    page = fetch(INDEX_URL)
    m = re.search(r'data-chapters="([^"]*)"', page)
    if not m:
        sys.exit("Could not find the chapter list on " + INDEX_URL)
    return json.loads(html.unescape(m.group(1)))


class MarkdownConverter(HTMLParser):
    """Small HTML -> Markdown converter tuned for the chapter page markup."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.out = []
        self.skip_depth = 0
        self.lists = []          # stack of "ul" / "ol" counters
        self.link_href = None
        self.in_cite = False
        self.quote = 0

    def _emit(self, text):
        self.out.append(text)

    def _newline(self, n=1):
        prefix = "> " * self.quote
        self._emit("\n" * n + prefix)

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        classes = set((a.get("class") or "").split())
        if self.skip_depth:
            if tag not in VOID_TAGS:
                self.skip_depth += 1
            return
        if tag in SKIP_TAGS or classes & SKIP_CLASSES or "hidden" in a:
            if tag not in VOID_TAGS:
                self.skip_depth = 1
            return

        if tag in ("h1", "h2", "h3", "h4"):
            self._newline(2)
            self._emit("#" * int(tag[1]) + " ")
        elif tag in ("p", "summary"):
            self._newline(2)
            if tag == "summary":
                self._emit("**")
        elif tag == "blockquote":
            self.quote += 1
            self._newline(2)
        elif tag in ("ul", "ol"):
            self.lists.append(0 if tag == "ol" else None)
            if len(self.lists) == 1:
                self._newline(1)
        elif tag == "li":
            depth = len(self.lists) - 1
            self._newline(1)
            self._emit("  " * max(depth, 0))
            if self.lists and self.lists[-1] is not None:
                self.lists[-1] += 1
                self._emit(f"{self.lists[-1]}. ")
            else:
                self._emit("- ")
        elif tag == "br":
            self._emit("  ")
            self._newline(1)
        elif tag in ("strong", "b"):
            self._emit("**")
        elif tag in ("em", "i"):
            self._emit("*")
        elif tag == "code":
            self._emit("`")
        elif tag == "sup" and "cite" in classes:
            self.in_cite = True
            self._emit("[")
        elif tag == "a":
            href = a.get("href") or ""
            if href.startswith("/"):
                href = BASE + href
            self.link_href = href
            if not self.in_cite:
                self._emit("[")

    def handle_endtag(self, tag):
        if self.skip_depth:
            self.skip_depth -= 1
            return
        if tag in ("h1", "h2", "h3", "h4", "p"):
            self._newline(1)
        elif tag == "summary":
            self._emit("**")
            self._newline(1)
        elif tag == "blockquote":
            self.quote = max(self.quote - 1, 0)
            self._newline(1)
        elif tag in ("ul", "ol"):
            if self.lists:
                self.lists.pop()
            if not self.lists:
                self._newline(1)
        elif tag in ("strong", "b"):
            self._emit("**")
        elif tag in ("em", "i"):
            self._emit("*")
        elif tag == "code":
            self._emit("`")
        elif tag == "sup" and self.in_cite:
            self.in_cite = False
            self._emit("]")
        elif tag == "a":
            if self.in_cite:
                # citation number becomes a link: [[3](url)]
                self.out[-1:] = [f"[{self.out[-1]}]({self.link_href})"] \
                    if self.out and self.out[-1].strip() else self.out[-1:]
            else:
                self._emit(f"]({self.link_href})")
            self.link_href = None

    def handle_data(self, data):
        if self.skip_depth:
            return
        text = re.sub(r"\s+", " ", data)
        if text.strip() or (self.out and not self.out[-1].endswith((" ", "\n"))):
            self._emit(text)

    def handle_comment(self, data):
        pass

    def markdown(self):
        text = "".join(self.out)
        text = re.sub(r"\]\s*\[(?=\[\d)", "][", text)   # tidy adjacent cites
        text = re.sub(r"[ \t]+\n", "\n", text)
        text = re.sub(r"\n(> )?\s*\n(\s*\n)+", "\n\n", text)
        return text.strip() + "\n"


def extract(page, start_marker, end_tag):
    i = page.find(start_marker)
    if i < 0:
        return ""
    j = page.find(end_tag, i)
    return page[i:j + len(end_tag)] if j >= 0 else page[i:]


def to_markdown(fragment):
    conv = MarkdownConverter()
    conv.feed(fragment)
    conv.close()
    return conv.markdown()


def convert_chapter(page, url):
    header = extract(page, '<header class="ch-header', "</header>")
    article = extract(page, '<article class="sheet"', "</article>")
    if not article:
        raise ValueError("no <article class=\"sheet\"> found")
    return (f"<!-- Source: {url} (c) WLK M.D. - personal study copy, "
            f"do not redistribute -->\n\n"
            + to_markdown(header) + "\n" + to_markdown(article))


def main(filters):
    OUT_DIR.mkdir(exist_ok=True)
    chapters = list_chapters()
    print(f"Found {len(chapters)} chapters")
    failures = []
    for ch in chapters:
        slug = ch["url"].strip("/").split("/")[-1]
        if filters and not any(f in slug for f in filters):
            continue
        number = ch["label"].split()[0]
        url = BASE + ch["url"]
        dest = OUT_DIR / f"{number}-{slug}.md"
        try:
            dest.write_text(convert_chapter(fetch(url), url), encoding="utf-8")
            print(f"  saved {dest.name}")
        except Exception as exc:  # keep going; report at the end
            failures.append(slug)
            print(f"  FAILED {slug}: {exc}")
        time.sleep(DELAY_SECONDS)
    if failures:
        sys.exit(f"{len(failures)} chapter(s) failed: {', '.join(failures)}")


if __name__ == "__main__":
    main(sys.argv[1:])
