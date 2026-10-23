"""Download the 36 pocket (速看) on-call chapters from
med-study-rpg.com/oncall/pocket/ and save each one as Markdown under
./articles/ for personal study.

The chapters are (c) WLK M.D. and are not openly licensed, so ./articles/ is
git-ignored: keep the copies local and do not commit or redistribute them.

Usage:
    python scrape_simple.py            # all chapters
    python scrape_simple.py sodium     # only chapters whose slug matches

Reuses the converter in ../detailed/scrape_detailed.py, so keep both folders
together. Standard library only (Python 3.9+).
"""

import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "detailed"))
import scrape_detailed as detailed  # noqa: E402

BASE = detailed.BASE
INDEX_URL = BASE + "/oncall/pocket/"
OUT_DIR = Path(__file__).resolve().parent / "articles"


class PocketConverter(detailed.MarkdownConverter):
    """Adds the pocket pages' flowcharts (nested ftree lists) to the base
    converter: stacked steps get their own bullet, branch conditions are
    italic, alerts get a warning sign, and branch-mode labels go in brackets."""

    def __init__(self):
        super().__init__()
        self.wrappers = []       # closing text for each open div/span
        self.stack_nodes = None  # nodes seen in the current ftree__stack

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        classes = set((a.get("class") or "").split())
        if self.skip_depth or tag not in ("div", "span", "figcaption") \
                or "hidden" in a:
            return super().handle_starttag(tag, attrs)
        if tag == "figcaption":  # repeats the flowchart's summary title
            self.skip_depth = 1
            return
        close = ""
        if "ftree__stack" in classes:
            self.stack_nodes = 0
        elif "ftree__node" in classes:
            if self.stack_nodes is not None:
                if self.stack_nodes:
                    self._newline(1)
                    self._emit("  " * (len(self.lists) - 1) + "- ")
                self.stack_nodes += 1
            if "ftree__node--when" in classes:
                self._emit("*")
                close = "*"
            elif "ftree__node--alert" in classes:
                self._emit("⚠️ ")
        elif "ftree__mode" in classes:
            self._emit("（")
            close = "）"
        self.wrappers.append((classes, close))

    def handle_endtag(self, tag):
        if self.skip_depth or tag not in ("div", "span") or not self.wrappers:
            return super().handle_endtag(tag)
        classes, close = self.wrappers.pop()
        self._emit(close)
        if "ftree__stack" in classes:
            self.stack_nodes = None


def to_markdown(fragment):
    conv = PocketConverter()
    conv.feed(fragment)
    conv.close()
    return conv.markdown()


def convert_chapter(page, url):
    header = detailed.extract(page, '<header class="ch-header', "</header>")
    article = detailed.extract(page, '<article class="sheet', "</article>")
    if not article:
        raise ValueError("no <article class=\"sheet\"> found")
    return (f"<!-- Source: {url} (c) WLK M.D. - personal study copy, "
            f"do not redistribute -->\n\n"
            + to_markdown(header) + "\n" + to_markdown(article))


def main(filters):
    OUT_DIR.mkdir(exist_ok=True)
    detailed.INDEX_URL = INDEX_URL
    chapters = detailed.list_chapters()
    print(f"Found {len(chapters)} chapters")
    failures = []
    for ch in chapters:
        slug = ch["url"].strip("/").split("/")[-1]
        if filters and not any(f in slug for f in filters):
            continue
        number = ch["label"].split()[0]
        url = INDEX_URL + slug + "/"
        dest = OUT_DIR / f"{number}-{slug}.md"
        try:
            dest.write_text(convert_chapter(detailed.fetch(url), url),
                            encoding="utf-8")
            print(f"  saved {dest.name}")
        except Exception as exc:  # keep going; report at the end
            failures.append(slug)
            print(f"  FAILED {slug}: {exc}")
        time.sleep(detailed.DELAY_SECONDS)
    if failures:
        sys.exit(f"{len(failures)} chapter(s) failed: {', '.join(failures)}")


if __name__ == "__main__":
    main(sys.argv[1:])
