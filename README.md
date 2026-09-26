# RenPyDoc Finder

Offline Material Design 3 browser and smart search for Ren'Py documentation:
the original English docs plus the community Chinese translation.

> 中文说明：[README.zh-CN.md](README.zh-CN.md)

## What it is

- Two documentation sets in one local app: English original (113 pages, Ren'Py 8.5.2)
  and Chinese translation (103 pages).
- Layout mirrors the official docs: grouped sidebar, content pane, section chip bar.
- Fully offline: pages, images and the search index are pre-generated into `data/` (~8.7 MB).
- Hand-written Material 3 CSS/JS, zero dependencies (no CDN, no web fonts);
  opening `index.html` directly works.

## Sources and attribution

**Chinese translation** — repository: https://gitee.com/kurororo666/Renpydoc-ranslate
(content used: `source/**/*.rst` and its images; contributors listed there: 逆转咸鱼, 被诅咒的章鱼).
A few figures reference `oshs/game/gui/...` paths; those files are not in the repository, so the app
shows a small placeholder for them.

**English original** — docs: https://www.renpy.org/doc/html/ , engine and documentation sources:
https://github.com/renpy/renpy (refer to that repository for licensing).

**Images** are looked up in this order: `assets/docimg/` → `docs_cache/` → the original doc folders
(`../renpy_cn/source`, `../renpy_en/_images`) → online fallbacks (renpy.org `_images`, and the matching
path in the Ren'Py source repository via jsDelivr / GitHub raw). If none matches, a chip names the
missing file.

**Disclaimer** — this is an unofficial third-party tool, not affiliated with the Ren'Py project or
the translation team. Documentation copyright stays with its authors.

## Features

**Search** — character-level CJK matching (块定义 finds 语句块(block)的定义); typo-tolerant English
(`chracter` → `Character`, `renpy.say` hits the exact API); space = AND, `|` = OR, "quotes" = phrase;
heading-weighted ranking, highlighted snippets, filters; 2991 indexed API terms with English names
merged into the Chinese index; pre-built index with millisecond responses.

**Reading** — original-style sidebar (12 groups, collapsible, current page marked); persistent section
chips that mark the current section; scroll-aware jump highlight that fades and never shifts layout;
Ren'Py/Python syntax highlighting with one-click code copy and click-to-copy inline keywords;
images, admonitions, tables, definition/field lists and line blocks preserved; light and dark themes;
right-click menu (copy / copy code / open link) and selectable text everywhere.

**Maintenance** — startup update check (Gitee commits + renpy.org version); a themed dialog offers to
sync, and the desktop shells download the newest docs **and images**, rebuild and hot-swap.
Shortcuts: `/` or `Ctrl+K` search, `Up`/`Down` select, `Enter` open, `Esc` back, `Alt+E` language,
`Alt+T` theme.

## Quick start

Open `index.html` directly, or serve the folder (`python -m http.server 8080` / `node serve.mjs`).
The app starts on the Chinese translation; the `中文 / EN` control in the top bar switches to the
English original.

## Rebuild the index

    node build/build.mjs
    #   --en-dir <dir>   English HTML  (default ../renpy_en or docs_cache/en)
    #   --zh-dir <dir>   Chinese RST   (default ../renpy_cn/source or docs_cache/zh/source)
    #   --out-dir <dir>  output        (default data)
    #   --chunk-bytes N  chunk size    (default 1400000)

## Update the documentation

    node build/update_docs.mjs     # Gitee clone/pull + renpy.org pages + images, then rebuild
    python build/update_docs.py    # same, Python 3 standard library

Downloads go to `docs_cache/` and never overwrite the original `renpy_en` / `renpy_cn` folders.

## Layout

    index.html          app shell
    assets/             style.css (Material 3), app.js (UI + search), ico/ (window icon)
    data/               meta.js (sidebar structure, update sources) + zh/en chunks + manifest.json
    build/              core.js (parser), build.mjs, update_docs.mjs, update_docs.py
    electron/ python/ src-tauri/   optional desktop shells
    tools/icon.ps1      icon scaling helper

## Data format

    { "slug": "dialogue", "title": "...", "html": "...",
      "sections": [ { "id", "title", "text" } ],      // search index
      "terms":    [ { "id", "name", "kind", "alias" } ]   // API entries (alias: merged from EN)
    }

`meta.js` also carries `nav.zh` / `nav.en` (the sidebar structure) and the chunk list.

## Notes

- Update check fails when opening `index.html` from `file://` (browser CORS); the desktop shells
  perform it in the background.
- The first language switch parses the other index once (a few MB), then switching is instant.
- Ren'Py and Chinese pages are aligned by slug; an `EN` badge in the sidebar means the page has no
  Chinese version and opens the English one.

## License

Application code in this repository: MIT (see `package.json`). Bundled documentation and images are
not covered by it — see their source repositories for their terms.
