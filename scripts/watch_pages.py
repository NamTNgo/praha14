"""Hlídá změny na stránkách městských částí (odkazy na dokumenty + text stránky).
Při změně zapíše watch/issue.md, ze kterého workflow vytvoří GitHub Issue."""
import hashlib, json, re, sys, urllib.request
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent / "watch"
PAGES = {
    "Praha 9 – mobilní sběr nebezpečných odpadů": "https://www.praha9.cz/mobilni-sber-nebezpecnych-odpadu-a-jedlych-oleju-v-r-2026",
    "Praha 9 – odstávky teplé vody": "https://www.praha9.cz/planovane-letni-odstavky-teple-vody-praha-9",
    "Praha 14 – odstávka teplé vody": "https://www.praha14.cz/zivot-na-praze-14/letni-odstavka-teple-vody-v-praze-14/",
    "Praha 14 – odpady": "https://www.praha14.cz/urad-mestske-casti/hledam-informaci/zivotni-prostredi/odpady/",
}
DOC = re.compile(r"\.(pdf|docx?|xlsx?|png|jpe?g|zip)(\?|$)", re.I)


class P(HTMLParser):
    def __init__(self):
        super().__init__()
        self.skip = 0
        self.text, self.files = [], set()

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style", "noscript", "nav", "header", "footer", "svg"):
            self.skip += 1
        a = dict(attrs)
        for k in ("href", "src"):
            v = a.get(k) or ""
            if DOC.search(v):
                self.files.add(v.split("?")[0])

    def handle_endtag(self, tag):
        if tag in ("script", "style", "noscript", "nav", "header", "footer", "svg") and self.skip:
            self.skip -= 1

    def handle_data(self, data):
        if not self.skip and data.strip():
            self.text.append(data.strip())


def digest(html):
    p = P()
    p.feed(html)
    text = re.sub(r"\s+", " ", " ".join(p.text))
    return {"files": sorted(p.files), "text": hashlib.sha256(text.encode()).hexdigest()[:16], "len": len(text)}


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (praha14-odpad watch)"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read().decode("utf-8", "replace")


def main():
    ROOT.mkdir(exist_ok=True)
    sp = ROOT / "state.json"
    state = json.loads(sp.read_text(encoding="utf-8")) if sp.exists() else {}
    changes, errors = [], []
    for name, url in PAGES.items():
        try:
            d = digest(fetch(url))
        except Exception as e:  # noqa: BLE001
            errors.append(f"{name}: {e}")
            continue
        old = state.get(url)
        if old is not None:
            new_files = sorted(set(d["files"]) - set(old["files"]))
            gone = sorted(set(old["files"]) - set(d["files"]))
            if new_files or gone or d["text"] != old["text"]:
                lines = [f"### {name}", url]
                if new_files:
                    lines.append("Nové soubory: " + ", ".join(new_files))
                if gone:
                    lines.append("Odstraněné soubory: " + ", ".join(gone))
                if d["text"] != old["text"]:
                    lines.append("Změnil se text stránky.")
                changes.append("\n".join(lines))
        state[url] = d
    sp.write_text(json.dumps(state, ensure_ascii=False, indent=1), encoding="utf-8")
    issue = ROOT / "issue.md"
    if changes:
        issue.write_text("Na sledovaných stránkách se objevila změna. Zkontroluj, zda vyšel nový harmonogram.\n\n" + "\n\n".join(changes) + "\n", encoding="utf-8")
    elif issue.exists():
        issue.unlink()
    for e in errors:
        print("CHYBA:", e, file=sys.stderr)
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
