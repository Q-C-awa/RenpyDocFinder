# RenPyDoc Finder — Ren'Py 文档查询助手（中文说明）

Ren'Py 文档的离线浏览与智能查询工具：同时收录**英文原版文档**与**社区中文翻译**，
界面与原版文档一致（左侧分组目录 + 右侧正文），只读本地数据、可完全离线使用。

> English README: [`README.md`](README.md) — 默认英文说明

---

## 这是什么

- 把两套文档整合成一个本地应用：
  - **英文原版**：Sphinx HTML 镜像，113 页，Ren'Py 8.5.2
  - **中文翻译**：`renpy_cn/source`，103 页，来自下面的 Gitee 仓库
- 布局照搬原版：左侧 12 个分组目录（起步 / Ren'Py语言 / 定制化Ren'Py …），可折叠、当前页高亮；
  右侧正文；正文上方是章节快捷栏。
- 完全离线：页面内容、图片、搜索索引都预生成在 `data/` 里（约 8.7 MB），不联网即可浏览与搜索。
- 手写 Material Design 3 样式，**零外部依赖**（无 CDN、无在线字体），直接双击 `index.html` 也能用。

## 文档来源与致谢（重要声明）

本项目内置的文档正文与插图**均为他人成果**，版权与署名归原作者：

### 中文翻译（源仓库）

- 仓库地址：**https://gitee.com/kurororo666/Renpydoc-ranslate**
- 使用内容：`source/**/*.rst` 及其旁边的图片，共 103 页
- 贡献者（该仓库 README 所列）：逆转咸鱼、被诅咒的章鱼
- 该仓库的生成方式：把本项目的文件替换 Ren'Py 项目 sphinx 目录下的同名文件，
  再把 `build.sh` 换成 `build_zh.sh` 后运行。
- 注意：译文中有少量插图引用的是译者本地 Sphinx 的**构建输出路径**（`oshs/game/gui/...`），
  这些 PNG 并不在仓库里。应用会为它们显示占位提示，并尝试下面列出的在线兜底来源。

### 英文原版（Ren'Py 官方项目）

- 在线文档：**https://www.renpy.org/doc/html/**
- 引擎与文档源码仓库：**https://github.com/renpy/renpy**
- Ren'Py 由 Tom Rothamel 与贡献者开发，按 MIT 许可发布（见引擎仓库中的 `LICENSE.txt`）；
  “Ren'Py” 是 Tom Rothamel 的商标。
- 使用内容：`renpy_en/` 下的 HTML 镜像（113 页）及其 `_images/` 图片目录。

### 图片的查找顺序

1. `assets/docimg/`（由 `package_bat/复制文档图片.bat` 汇集，打包版使用）
2. `docs_cache/`（由更新脚本下载）
3. 原始文档目录（`../renpy_cn/source`、`../renpy_en/_images`）
4. 在线兜底：`renpy.org/doc/html/_images/...`，以及 Ren'Py SDK 的 GUI 模板图
   （`gui/game/gui/...`，走 jsDelivr 或 GitHub raw）

四处都没有该文件时，页面会显示一条虚线提示条说明缺少哪个文件，而不是静默消失。

### 免责声明

本工具是**第三方非官方工具**，与 Ren'Py 官方项目、中文翻译团队均无隶属或背书关系。
文档与图片的版权、许可归原作者所有；本仓库仅对浏览/搜索程序代码按文末许可授权。

## 功能一览

**智能搜索（替代原版关键词搜索）**

- 中文字符级匹配：搜「块定义」能命中「语句块(block)的定义」
- 英文模糊容错：`chracter` 命中 `Character`；`renpy.say` 精确命中 API 词条
- 多词查询：空格 = AND，`|` = OR，"引号" = 精确短语
- 标题/小标题加权排序、命中高亮、结果分类筛选（全部 / API 条目 / 变量 / 标签 / 正文）
- 已索引 2991 条 API 词条（函数、类、变量、样式/界面/变换特性、文本标签、环境变量…），
  英文 API 名也并入中文索引，中文界面可直接搜英文名
- 预建索引，毫秒级响应，结果栏显示耗时

**阅读体验**

- 原版式侧边目录：12 个分组，可折叠，当前页高亮
- 章节快捷栏常驻，标记你当前所在的章节；跳转带定位高亮（自动淡出、不影响排版）
- 代码块 Ren'Py / Python 语法高亮、自动去缩进、右上角一键复制，内联关键词点击即可复制
- 文档图片、提示框（admonition）、表格、定义列表/字段列表、行块均按原文结构呈现
- 浅色 / 深色 Material 3 主题；浅色模式下代码块为浅底深字
- 右键快捷菜单：复制选中 / 复制整段代码 / 复制关键词 / 全选正文 / 打开链接
  （pywebview 窗口里也能正常复制）
- 全文可选中复制，桌面外壳同样有效

**维护**

- 启动自动检测更新（Gitee 提交 + renpy.org 版本号），发现更新时顶栏出现红点
- 发现更新会弹出**跟随主题**的对话框询问是否同步；桌面版会下载最新文档（RST/HTML **及引用到的图片**）
  并重建索引、热切换到新数据
- 快捷键：`/` 或 `Ctrl+K` 聚焦搜索，`↑`/`↓` 选择，`Enter` 打开，`Esc` 返回，
  `Alt+E` 切换语言，`Alt+T` 切换主题

## 运行环境

- 使用：任意现代浏览器（直接打开 `index.html`），或打包后的桌面版
- 重建索引 / 更新文档：Node.js 18+（也可用 Python 3 跑更新脚本）
- 打包：Node.js（Electron）、Python 3（pywebview）或 Rust（Tauri 2）

## 快速开始

1. 直接双击 `index.html`（`file://` 可用）；需要本地服务器时：

       cd renpy-doc-app
       python -m http.server 8080     # 或：node serve.mjs

2. 顶栏搜索框搜索，左侧目录浏览。
3. 顶栏 `中文 / EN` 按钮切换中英文档（当前默认进入中文翻译版，点一下即切到英文原版）。

## 重建索引

`build/core.js` 是无依赖解析器（Sphinx HTML5 与 reStructuredText），
`build/build.mjs` 把文档树转成应用使用的 JSON 分块：

    node build/build.mjs
    # 可选参数：
    #   --en-dir <目录>   英文 HTML 目录（默认 ../renpy_en 或 docs_cache/en）
    #   --zh-dir <目录>   中文 RST 目录（默认 ../renpy_cn/source 或 docs_cache/zh/source）
    #   --out-dir <目录>  输出目录（默认 data）
    #   --chunk-bytes N   单个分块字节数（默认 1400000）

当前输出：中文 103 页、英文 113 页、API 词条 2991 条、数据约 8.7 MB。

## 更新文档

应用只负责「检测」，真正下载与重建由脚本完成：

    node build/update_docs.mjs      # Gitee 克隆/拉取 + renpy.org 页面 + 引用图片，然后重建索引
    python build/update_docs.py     # 同上，Python 3 标准库实现

下载缓存在 `docs_cache/`，不会覆盖你原有的 `renpy_en` / `renpy_cn`。

## 打包（Windows）

所有批处理脚本都在 **`package_bat/`**（双击运行，会自动定位项目根目录）：

| 脚本 | 产物 |
| --- | --- |
| `打包-正确图标文件夹版.bat` | `dist/win-unpacked/RenpyDocFinder.exe`（推荐，图标与名称正确） |
| `打包-安装程序.bat` | `dist/RenpyDocFinder-Setup.exe`（NSIS 安装包） |
| `打包-单文件便携exe.bat` | `dist/RenpyDocFinder-Portable.exe`（单文件） |
| `打包-免下载文件夹版.bat` | `dist/RenpyDocFinder/RenpyDocFinder.exe`（不走 electron-builder；图标与任务管理器名称为 Electron 默认） |
| `打包-Python文件夹版.bat` | `dist-py/RenpyDocFinder/RenpyDocFinder.exe`（pywebview + PyInstaller onedir） |
| `检查.bat` | 图标可读性与尺寸、`build-res/icon.png` 状态、所有已构建 exe 的构建时间与 Windows 显示名 |
| `清理与关闭.bat` | 关闭所有实例并删除 `dist/`、`dist-py/`、`build-py/` |
| `更新文档.bat` | 更新文档与图片并重建索引 |
| `重建索引.bat` | `node build/build.mjs` |
| `复制文档图片.bat` | 把文档图片汇集到 `assets/docimg/` |
| `生成图标PNG.bat` | 由 `assets/ico/window-icon.gif` 生成 256×256 PNG |
| `调试.bat` | 菜单：源码模式带日志启动 / 运行打包产物并导出日志 |
| `说明.txt` | 以上脚本的速查说明 |

说明：

- 存在本机 Electron 缓存时会直接使用：`D:\electron-cache`、`D:\electron-builder-cache`
  （脚本已设置 `ELECTRON_CACHE` / `ELECTRON_BUILDER_CACHE`），npm 与 PyPI 也已预置国内镜像。
- 打包前脚本会结束正在运行的实例并重试清理输出目录；若 `dist/win-unpacked` 仍被占用（EBUSY），
  产物会改到 `dist/build-<随机数>`，结束时 `BUILD RESULT` 会打印真实路径——**请启动它打印的那个 exe**，
  不要启动旧的残留副本。
- 命名口径：exe 文件名为 `RenpyDocFinder.exe`，窗口标题为 `Renpy文档查询`，
  同一字符串会写入 exe 版本信息，因此任务管理器显示 `Renpy文档查询`。
- 之前固定过任务栏图标的，需要先取消固定再重新固定（旧快捷方式自带旧名字）。

## 目录结构

    renpy-doc-app/
    |- index.html            应用入口（可直接双击打开）
    |- assets/
    |   |- style.css         Material Design 3 样式
    |   |- app.js            界面 + 搜索引擎 + 图片解析 + 查看器
    |   |- logo.svg          图标源文件
    |   \- ico/              窗口图标与 exe 图标源（png/gif/ico）
    |- data/                 预生成的离线数据
    |   |- meta.js           元数据 + 侧边目录结构（nav.zh / nav.en）+ 更新源
    |   |- zh.chunk.*.js     中文页面（3 个分块）
    |   |- en.chunk.*.js     英文页面（4 个分块）
    |   \- manifest.json     人可读的构建清单
    |- build/
    |   |- core.js           无依赖解析器（EN HTML / CN RST -> 精简 HTML + 分节 + 词条 + 导航）
    |   |- build.mjs         Node 构建脚本（零依赖）
    |   |- update_docs.mjs   Node 更新脚本（文档 + 图片）
    |   \- update_docs.py    Python 更新脚本
    |- electron/             Electron 外壳（main.js、preload.js）
    |- python/app.py         pywebview 外壳
    |- src-tauri/            Tauri 2 模板
    |- tools/icon.ps1        图标缩放与 exe 图标预览工具
    |- package_bat/          全部 Windows 批处理脚本
    \- docs_cache/           （更新脚本生成）最新文档与图片缓存

## 数据结构

每个页面对象：

    {
      "slug": "dialogue",                 // 页面标识，中英同页一致
      "title": "对话(dialogue)和旁白",
      "html": "<h1 id=...>...</h1>...",   // 精简后的正文，可离线渲染
      "sections": [ { "id", "title", "text" } ],   // 搜索用分节
      "terms":    [ { "id", "name", "kind", "alias" } ]  // API 词条（alias=true 表示由英文并入）
    }

`meta.js` 里还有 `nav.zh` / `nav.en`（原版侧边目录）与 `chunks` 分块声明。
解析器覆盖：标题、段落、列表、定义列表/字段列表、行块、代码块、表格、admonition、
`function`/`class`/`var`/`style-property`/`screen-property`/`transform-property` 等指令，
`:ref:` / `:doc:` / `:file:` 等角色与图片，并按 slug 对齐中英页面。

## 常见问题

- **直接打开 `index.html` 时更新检测失败**：浏览器禁止 `file://` 跨域请求，属正常现象；
  状态栏会提示离线，改用 Electron / pywebview 外壳即可后台检测。
- **打包报 `EBUSY: resource busy or locked`**：旧的打包产物还在运行，关闭它
  （或运行 `package_bat/清理与关闭.bat`）后重新打包。
- **任务管理器/任务栏出现多个条目或旧名字**：那是历史遗留的旧 exe 副本。
  跑一次 `package_bat/清理与关闭.bat`，重新打包，只启动 `BUILD RESULT` 打印的那个 exe。
- **某张图提示未随文档附带**：见上文「图片的查找顺序」；联网时运行 `package_bat/更新文档.bat` 抓取，
  或把图片放进 `assets/docimg/`。
- **首次切换语言略慢**：另一语言的索引（数 MB）在本地解析一次，之后切换即时完成。

## 许可

本仓库的浏览/搜索程序代码按 MIT 许可发布（见 `package.json`）。
内置的文档正文与图片**不在该许可范围内**，其版权归 Ren'Py 官方项目与中文翻译贡献者所有，
遵循各自的授权条款。
