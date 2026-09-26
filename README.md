# RenPyDoc Finder

An offline, Material Design 3 documentation browser and smart search app for **Ren'Py**,
built from the original English documentation and the community Chinese translation.

> 中文说明：[`README.zh-CN.md`](README.zh-CN.md) — 中文版说明文档

---

## What this is

- A local viewer + search engine over two documentation sets:
  - the **English original** (Sphinx HTML mirror, 113 pages, Ren'Py 8.5.2)
  - the **Chinese translation** (`renpy_cn/source`, 103 pages, from the Gitee repo below)
- Layout mirrors the official docs: a grouped sidebar (Getting Started, The Ren'Py Language, ...),
  the document body on the right, and a collapsible/expandable table of contents.
- Fully offline: all page content, images and the search index are pre-generated into `data/`
  (about 8.7 MB total). No network access is required to read or search.
- The UI is hand-written Material Design 3 CSS/JS with zero external dependencies
  (no CDN, no web fonts), so it also works when opened directly from disk with `file://`.

## Documentation sources and attribution

This project ships **documentation written by others**. All credit for the texts and images
belongs to their authors:

### Chinese translation (source repository)

- Repository: **https://gitee.com/kurororo666/Renpydoc-ranslate**
- Content used: `source/**/*.rst` (plus the images stored next to them) — 103 pages
- Contributors (as listed by that repository): 逆转咸鱼, 被诅咒的章鱼
- Build method used by that repository: copy its files over the Sphinx sources of the Ren'Py
  project, replace `build.sh` with `build_zh.sh`, then run it.
- Note: a few figures in the translation reference the translator's local Sphinx output path
  (`oshs/game/gui/...`). Those PNG files are **not** part of the repository; the app shows a
  placeholder chip for them and tries the online fallbacks described below.

### English original (Ren'Py project)

- Online documentation: **https://www.renpy.org/doc/html/**
- Engine and documentation sources: **https://github.com/renpy/renpy**
- Ren'Py is created by Tom Rothamel and contributors, and is distributed under the MIT license
  (see the `LICENSE.txt` in the engine repository). "Ren'Py" is a trademark of Tom Rothamel.
- Content used: the HTML mirror under `renpy_en/` (113 pages) and its `_images/` folder.

### Images

Page images are resolved at runtime, in this order:

1. `assets/docimg/` (collected by `package_bat/复制文档图片.bat`, used by packaged builds)
2. `docs_cache/` (downloaded by the update scripts)
3. the original documentation folders (`../renpy_cn/source`, `../renpy_en/_images`)
4. online fallbacks: `renpy.org/doc/html/_images/...`, and the Ren'Py SDK GUI template images
   (`gui/game/gui/...`) through jsDelivr or GitHub raw

If none of them has the file, the app shows a dashed chip saying which file is missing instead of
silently dropping the figure.

### Disclaimer

This is an **unofficial, third-party tool**. It is not affiliated with, endorsed by, or supported
by the Ren'Py project or by the translation team. Documentation copyright and license remain with
the original authors; only the viewer/search code in this repository is licensed as stated at the
bottom of this file.

## Features

**Smart search (replaces the original keyword search)**

- Character-level CJK matching: searching 块定义 finds 语句块(block)的定义
- Typo-tolerant English matching: `chracter` finds `Character`; `renpy.say` hits the exact API term
- Boolean queries: space = AND, `|` = OR, "quotes" = exact phrase
- Ranking with title/heading weights, highlighted snippets, and result filters
  (all / API entries / variables / labels / body text)
- 2991 indexed API terms (functions, classes, variables, style/screen/transform properties,
  text tags, environment variables), including English terms merged into the Chinese index
- Pre-built index, millisecond response times, elapsed time shown in the result bar

**Reading experience**

- Original-style sidebar with 12 groups, collapsible, current page highlighted
- Section chip bar that stays visible, marks the section you are in, and jumps with a
  scroll-aware highlight (fades out on its own, never shifts layout)
- Ren'Py / Python syntax highlighting in code blocks, automatic de-indentation,
  one-click copy button per code block, click-to-copy on inline keywords
- Documentation images, admonitions, tables, definition/field lists and line blocks preserved
- Light and dark Material 3 themes; code blocks use a light background in light mode
- Right-click context menu with copy / copy code / copy keyword / select all / open link
  (this also makes copying work inside the pywebview desktop window)
- Text is selectable everywhere, including in the desktop shells

**Maintenance**

- Update check on startup (Gitee commits + the version string on renpy.org), red dot in the top bar
- When an update is found, a themed dialog asks whether to sync; the desktop shells download the
  newest docs (RST/HTML **and the referenced images**), rebuild the index and hot-swap to it
- Keyboard shortcuts: `/` or `Ctrl+K` focus search, `Up`/`Down` select, `Enter` open,
  `Esc` back, `Alt+E` switch language, `Alt+T` switch theme

## Requirements

- To **use**: any modern browser (open `index.html`), or a packaged desktop build
- To **rebuild the index / update the docs**: Node.js 18+
- To package: Node.js (Electron), Python 3 (pywebview) or Rust (Tauri 2)

## Quick start

1. Open `index.html` directly (works from `file://`), or serve the folder:

       cd renpy-doc-app
       python -m http.server 8080     # or: node serve.mjs

2. Search with the box in the top bar; browse with the sidebar.
3. Switch between the Chinese translation and the English original with the 中文 / EN control
   (the app starts with the Chinese translation; one click shows the English original).

## Rebuilding the search index

`build/core.js` is a dependency-free parser (Sphinx HTML5 and reStructuredText).
`build/build.mjs` turns the documentation trees into the JSON chunks used by the app:

    node build/build.mjs
    # options:
    #   --en-dir <dir>    English HTML dir   (default ../renpy_en or docs_cache/en)
    #   --zh-dir <dir>    Chinese RST dir    (default ../renpy_cn/source or docs_cache/zh/source)
    #   --out-dir <dir>   output dir         (default data)
    #   --chunk-bytes N   bytes per chunk    (default 1400000)

Current output: 103 Chinese pages, 113 English pages, 2991 API terms, ~8.7 MB of data.

## Updating the documentation

An update is detected by the app; the actual download + rebuild is a script:

    node build/update_docs.mjs      # Gitee clone/pull + renpy.org pages + referenced images, then rebuild
    python build/update_docs.py     # same, Python 3, standard library only

Downloads are cached in `docs_cache/` and never overwrite your original `renpy_en` / `renpy_cn`.

## Packaging (Windows)

All batch scripts live in **`package_bat/`** (run them by double-clicking; they locate the project
root automatically):

| Script | Result |
| --- | --- |
| `打包-正确图标文件夹版.bat` | `dist/win-unpacked/RenpyDocFinder.exe` — recommended, correct icon and name |
| `打包-安装程序.bat` | `dist/RenpyDocFinder-Setup.exe` (NSIS installer) |
| `打包-单文件便携exe.bat` | `dist/RenpyDocFinder-Portable.exe` (single file) |
| `打包-免下载文件夹版.bat` | `dist/RenpyDocFinder/RenpyDocFinder.exe` — never downloads anything; icon and Task Manager name stay Electron defaults |
| `打包-Python文件夹版.bat` | `dist-py/RenpyDocFinder/RenpyDocFinder.exe` (pywebview + PyInstaller onedir) |
| `检查.bat` | icon readability/size, `build-res/icon.png` state, every built exe with its build time and Windows display name |
| `清理与关闭.bat` | closes all instances and deletes `dist/`, `dist-py/`, `build-py/` |
| `更新文档.bat` | updates docs + images and rebuilds the index |
| `重建索引.bat` | `node build/build.mjs` |
| `复制文档图片.bat` | collects documentation images into `assets/docimg/` |
| `生成图标PNG.bat` | converts `assets/ico/window-icon.gif` into a 256x256 PNG |
| `调试.bat` | menu: run from source with logging, or run the packaged build and dump its logs |
| `说明.txt` | quick reference for all of the above |

Notes:

- Electron caches are used when present: `D:\electron-cache`, `D:\electron-builder-cache`
  (the scripts set `ELECTRON_CACHE` / `ELECTRON_BUILDER_CACHE`), and npm/PyPI mirrors are preset.
- Before packaging, the scripts kill any running instance and retry cleaning the output folder.
  If `dist/win-unpacked` is still locked (`EBUSY`), the build goes to `dist/build-<random>` and the
  final `BUILD RESULT` block prints the real path — launch **that** exe, not an older copy.
- Naming: the exe is `RenpyDocFinder.exe`, the window title is `Renpy文档查询`, and the same string
  is written into the exe version info, so Task Manager shows it as `Renpy文档查询`.
- If the app was pinned to the taskbar before, unpin and pin it again (a shortcut keeps its own name).

## Project layout

    renpy-doc-app/
    |- index.html            app shell (open this directly)
    |- assets/
    |   |- style.css         Material Design 3 stylesheet
    |   |- app.js            UI + search engine + image resolver + viewer
    |   |- logo.svg          icon source
    |   \- ico/              window-icon.* (png/gif/ico) used for the window and the exe
    |- data/                 pre-generated offline data
    |   |- meta.js           metadata, sidebar structure (nav.zh / nav.en), update sources
    |   |- zh.chunk.*.js     Chinese pages (3 chunks)
    |   |- en.chunk.*.js     English pages (4 chunks)
    |   \- manifest.json     human-readable build manifest
    |- build/
    |   |- core.js           dependency-free parser (EN HTML / CN RST -> clean HTML + sections + terms + nav)
    |   |- build.mjs         Node builder (no dependencies)
    |   |- update_docs.mjs   Node updater (docs + images)
    |   \- update_docs.py    Python updater
    |- electron/             Electron shell (main.js, preload.js)
    |- python/app.py         pywebview shell
    |- src-tauri/            Tauri 2 template
    |- tools/icon.ps1        icon scaling / exe icon preview helper
    |- package_bat/          all Windows batch scripts
    \- docs_cache/           (created by the updaters) newest docs + images

## Data format

Each page object:

    {
      "slug": "dialogue",                 // page id, identical for the EN and CN page
      "title": "对话(dialogue)和旁白",
      "html": "<h1 id=...>...</h1>...",   // cleaned body, rendered offline
      "sections": [ { "id", "title", "text" } ],   // used by the search index
      "terms":    [ { "id", "name", "kind", "alias" } ]  // API entries (alias=true: merged from EN)
    }

`meta.js` also carries `nav.zh` / `nav.en` (the original sidebar structure) and `chunks`.
The parser covers headings, paragraphs, lists, definition/field lists, line blocks, code blocks,
tables, admonitions, `function`/`class`/`var`/`style-property`/`screen-property`/`transform-property`
and other directives, the `:ref:` / `:doc:` / `:file:` roles and images, and aligns the EN and CN
pages by slug.

## Troubleshooting

- **Update check fails when opening `index.html`** — browsers block cross-origin requests from
  `file://`. The status bar shows an offline hint; the Electron / pywebview shells do the check in
  the background instead.
- **Packaging stops with `EBUSY: resource busy or locked`** — an older build is still running.
  Close it (or run `package_bat/清理与关闭.bat`) and package again.
- **Task Manager shows several entries / an old name** — those are old exe copies. Run
  `package_bat/清理与关闭.bat`, rebuild once, and launch only the path printed in `BUILD RESULT`.
- **A figure says it is not shipped with the docs** — see "Images" above; run
  `package_bat/更新文档.bat` (online) to fetch it, or copy the file into `assets/docimg/`.
- **First language switch is slow** — the other language index (a few MB) is parsed locally once,
  then switching is instant.

## License

The viewer/search application code in this repository is released under the MIT license
(see `package.json`). The bundled documentation and images are **not** covered by it: they remain
the property of the Ren'Py project and of the Chinese translation contributors, under their own
terms.
