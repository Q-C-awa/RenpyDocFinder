# RenPyDoc Finder — Ren'Py 文档智能查询助手（中文版）

基于工作目录中的原版英文文档（renpy_en）与人工翻译的中文文档（renpy_cn/source，源仓库
https://gitee.com/kurororo666/Renpydoc-ranslate ）构建的离线文档查询软件。

界面布局与原版 Ren'Py 文档保持一致：左侧是原版分组目录（起步 / Ren'Py语言 / 定制化Ren'Py …），
支持点击分组折叠、展开，点击条目快速跳转；右侧是文档正文。顶部是升级后的智能搜索框。
UI 使用 Google Material Design 3 风格（手写样式、零外部依赖），支持深浅色主题与流畅动效。

## 功能一览

- 原版式左侧目录：12 个原版分组 + 索引/脚本样例，支持折叠、展开、当前页高亮
- 智能搜索（升级自原版关键词搜索）：
  - 中文字符级匹配：例如「块定义」能命中「语句块(block)的定义」
  - 英文模糊容错：例如「chracter」能命中 Character、「renpy.say」精确命中 API
  - 多词 AND：空格分隔；竖线 | 表示 OR；引号 "..." 精确短语
  - 标题加权、相关度排序、命中高亮、结果分类筛选（全部 / API 条目 / 变量 / 标签 / 正文）
  - 预建索引，毫秒级响应，结果页显示耗时
- 代码块 Ren'Py / Python 语法高亮（语言定义参考 vscode-language-renpy 与 vscode-python），
  代码块自动去缩进并左移；右上角复制按钮一键复制整段代码，点击正文中的内联关键词(code)也可复制；
  全文均可选中复制（含 pywebview 桌面窗口）
- 启动时自动检测文档更新（Gitee 提交 + Ren'Py 官网版本号），发现更新红点提示
- 完全离线可用；数据总量约 8.7 MB；打包为桌面应用后体积小、占用低
- 支持三种语言打包：Electron（Node/JS）、pywebview（Python）、Tauri 2（Rust）

## 目录结构

    renpy-doc-app/
    ├─ index.html            # 应用入口（可直接双击打开）
    ├─ assets/
    │  ├─ style.css          # Material Design 3 样式
    │  ├─ app.js             # 界面与搜索逻辑
    │  └─ logo.svg           # 应用图标源文件
    ├─ data/                 # 预生成的离线数据（可随时重建）
    │  ├─ meta.js            # 元数据 + 侧边目录结构 + 更新源配置
    │  ├─ zh.chunk.*.js      # 中文 103 页
    │  ├─ en.chunk.*.js      # 英文 113 页
    │  └─ manifest.json      # 人可读的构建清单
    ├─ build/
    │  ├─ core.js            # 无依赖解析器（EN HTML / CN RST -> 精简 HTML + 分节 + API 词条 + 导航）
    │  ├─ build.mjs          # Node 构建脚本（零依赖）
    │  ├─ update_docs.mjs    # Node 文档更新脚本
    │  └─ update_docs.py     # Python 文档更新脚本
    ├─ electron/             # Electron 外壳（main.js + preload.js）
    ├─ python/app.py         # pywebview 外壳
    ├─ src-tauri/            # Tauri 2 外壳模板
    ├─ package.json          # Electron 依赖与打包配置
    └─ docs_cache/           # （运行更新脚本后生成）最新文档缓存

## 快速开始

方式一（最简单）：直接双击打开 index.html。数据以内联脚本形式加载，无需服务器。
方式二（本地服务器，可选）：

    cd renpy-doc-app
    python -m http.server 8080
    # 或 node serve.mjs
    # 浏览器打开 http://127.0.0.1:8080

## 使用说明

- 搜索：顶部搜索框输入即搜；快捷键 / 或 Ctrl+K 聚焦搜索；↑↓ 选择结果；Enter 打开；Esc 返回/清空
- 目录：左侧分组点击标题可折叠；点击条目打开页面；移动端点击左上角菜单按钮呼出目录
- 语言：右上角「中文 / EN」切换全局语言；文章页「EN/中文」按钮切换当前页对照；「原文」打开在线源页面
- 主题：右上角太阳/月亮按钮切换深浅色（Alt+T）
- 更新检测：右上角刷新按钮手动检查；启动后 30 分钟内不重复自动检查；
  状态栏实时显示结果，发现更新时红点 + 提示条，可直接跳转 Gitee 仓库

## 重建索引（构建软件）

解析器（build/core.js）是纯函数、无依赖，数据格式为纯 JSON 分块，
因此可以用任意语言重写构建脚本；官方提供 Node 版本：

    cd renpy-doc-app
    node build/build.mjs
    # 可选参数：
    #   --en-dir <目录>  英文 HTML 目录（默认 ../renpy_en 或 docs_cache/en）
    #   --zh-dir <目录>  中文 RST 目录（默认 ../renpy_cn/source 或 docs_cache/zh/source）
    #   --out-dir <目录> 输出目录（默认 data）
    #   --chunk-bytes N  单个数据分块字节数（默认 1400000）

构建输出：中文 103 页、英文 113 页、1282 条英文 API 词条并入中文索引、约 8.7 MB 数据。

## 更新文档

软件运行时只负责「检测」更新；真正更新文档 + 重建索引使用以下脚本：

Node 版（自动下载 + 自动重建）：

    cd renpy-doc-app
    node build/update_docs.mjs

Python 版（自动下载，随后手动重建）：

    cd renpy-doc-app
    python build/update_docs.py
    node build/build.mjs

更新逻辑：
- 中文：git 浅克隆/拉取 https://gitee.com/kurororo666/Renpydoc-ranslate 到 docs_cache/zh
- 英文：按本地文件清单从 https://www.renpy.org/doc/html/ 逐页下载到 docs_cache/en
- 构建脚本优先使用 docs_cache/ 中的最新文档，不会覆盖你原有的 renpy_en / renpy_cn 目录

## 打包为桌面应用（三种语言可选）

### 0. 打包卡住怎么办（先看这里）

electron-builder 默认要从 GitHub 下载 Electron 运行时、NSIS、winCodeSign 等二进制，
国内网络下会长时间卡住（没有任何输出）。三种解决办法，任选其一：

1. **用免下载版（最稳，推荐）**：双击 package_bat\打包-免下载文件夹版.bat
   它完全绕开 electron-builder，直接把 node_modules\electron\dist 运行时 + 应用文件
   组装成 dist\RenPyDoc\RenPyDoc.exe（保留 dll，可直接拷贝运行），不下载任何额外二进制。
2. 用脚本里已内置的国内镜像：其余 .bat 已设置
   npm_config_registry=https://registry.npmmirror.com、
   ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/、
   ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/，
   并通过 --config.electronDist=node_modules/electron/dist 直接复用本地运行时。
3. 手动准备离线缓存：把对应版本的 electron-vXX-win32-x64.zip 放进 D:\electron-cache，
   把 nsis / winCodeSign 解压包放进 D:\electron-builder-cache（版本需与 electron-builder 要求一致）。

注意：安装 Electron 时版本要与 package.json 中一致（脚本固定 electron@33.2.0），
版本不一致会导致 electron-builder 重新下载而卡住。

### 1. 一键打包脚本（推荐）

工作目录下提供了双击即可运行的批处理脚本（会使用本机 Electron 缓存
D:\electron-cache 与 D:\electron-builder-cache，避免重复下载）：

- 打包-正确图标文件夹版.bat → dist\win-unpacked\RenpyDocFinder.exe（exe 图标 = assets/ico/window-icon.gif 转换出的
  256×256 PNG，脚本会自动把 GIF 转成 PNG 再打包；不需要 NSIS，一般不卡）
  名称口径：exe 文件名 RenpyDocFinder.exe，窗口标题与任务管理器显示名 Renpy文档查询
- 打包-免下载文件夹版.bat → dist\RenPyDoc\RenPyDoc.exe（完全不走 electron-builder，最稳；
  但它只是重命名 electron.exe，exe 图标仍是 Electron 默认，窗口/任务栏图标仍是你的图标）
- 打包-便携文件夹.bat    → dist\win-unpacked\RenPyDoc.exe（保留 dll，整个文件夹可直接拷贝运行）
- 打包-安装程序.bat      → dist\RenPyDoc-Setup.exe（NSIS 安装包）
- 打包-单文件便携exe.bat → dist\RenPyDoc-Portable.exe（单文件，首次启动稍慢）
- 打包-Python文件夹版.bat → dist-py\RenPyDoc\RenPyDoc.exe（pywebview + PyInstaller onedir，保留 dll）

脚本位置：所有 .bat 都集中在 package_bat\ 目录（脚本会自动定位到项目根目录，双击哪个都能跑）：
- 打包-正确图标文件夹版.bat / 打包-便携文件夹.bat / 打包-安装程序.bat / 打包-单文件便携exe.bat（Electron）
- 打包-免下载文件夹版.bat（不走 electron-builder，最稳，exe 图标为 Electron 默认）
- 打包-Python文件夹版.bat（pywebview + PyInstaller）
- 复制文档图片.bat（把文档图片汇集到 assets/docimg，离线/打包用）
- 生成图标PNG.bat（由 gif 生成 256×256 PNG 图标）
- 检查图标.bat（图标诊断 + 导出 exe 图标预览）
- 重建索引.bat（node build/build.mjs）
- 更新文档.bat（node build/update_docs.mjs，更新文档并重建）
项目根目录与旧的 package\ 目录里保留的是同名「转发脚本」，只是为了兼容旧的点击习惯，可自行删除。

文档图片：
- 中文文档的图片来自 renpy_cn/source（30 张）与 docs_cache/zh/source；英文来自 renpy_en/_images（9 张）与 docs_cache/en
- 应用会在运行时按顺序探测：assets/docimg/ → docs_cache/ → 原始文档目录，命中即显示
- 想把这些图片固化进程序（离线/打包用），双击 复制文档图片.bat 一次性汇集到 assets/docimg/
- 打包脚本（打包-正确图标文件夹版.bat / 打包-免下载文件夹版.bat）会自动执行这一步
- 文档里引用了但仓库本身没附带的图，会显示为「图片未随文档附带：<路径>」的占位条，而不是静默消失
- 缺图的补齐途径（应用会按顺序自动尝试）：
  1) assets/docimg/、docs_cache/、../renpy_cn/source、../renpy_en/_images（本地）
  2) 跨语言同名兜底：例如 gui/borders1.png 在英文 _images 里，中文页也能显示
  3) 在线兜底：renpy.org 官方 _images、Ren'Py 源码仓库的 GUI 模板图
     （jsDelivr / GitHub raw 的 gui/game/... 路径）、Gitee 仓库原始文件
- 想让图片全部离线可用：双击 package_bat\更新文档.bat（会按引用抓取中英文图片并重建索引），
  或 package_bat\复制文档图片.bat（只汇集本地已有图片）

图标说明（重要）：
- 脚本**优先使用 assets/ico/window-icon.png，绝不会覆盖它**；只有 PNG 缺失时才尝试 ico / gif
- build-res/icon.png 是脚本按 256×256 生成的「打包用副本」，你的原图不受影响
- 想确认当前用的到底是哪张图，双击 package_bat\检查图标.bat，会打印图标源、原始尺寸和 build-res/icon.png 尺寸

其他注意：
- 界面图标（标签页 / 应用内品牌图标）：直接使用 assets/ico/window-icon.gif
- 窗口图标与 exe 图标：Electron 不支持 GIF，打包脚本会用 PowerShell(System.Drawing)
  把 GIF 转成 256×256 的 assets/ico/window-icon.png 与 build-res/icon.png 再使用
- 也可单独双击 package_bat\生成图标PNG.bat 手动完成这次转换（改完 GIF 后运行一次即可）

### 1. Electron（Node / JavaScript）

    cd renpy-doc-app
    npm install
    npm start          # 直接运行
    npm run dist       # 打包 Windows 安装版 + 便携版（输出到 dist/）

本机已有 Electron 缓存，安装依赖与打包时建议显式指定缓存目录，避免重复下载：

    set ELECTRON_CACHE=D:\electron-cache
    set ELECTRON_BUILDER_CACHE=D:\electron-builder-cache
    npm run dist

Electron 主进程自带更新检测（绕过浏览器 CORS），并接管外部链接打开。

### 2. pywebview（Python）

    pip install pywebview
    python python/app.py

打包为独立 exe（PyInstaller）：

    pip install pyinstaller
    pyinstaller -w -F --name RenPyDoc python/app.py

Python 侧 Api 类提供更新检测与外部链接打开。

### 3. Tauri 2（Rust）

    # 需要 Rust 工具链
    cd renpy-doc-app
    npm install -g @tauri-apps/cli        # 或使用 cargo install tauri-cli
    生成图标PNG.bat                                       # 先由 GIF 生成 256x256 PNG
    npx @tauri-apps/cli icon assets/ico/window-icon.png   # 首次构建前生成图标
    npx tauri dev                          # 开发运行
    npx tauri build                        # 打包（输出到 src-tauri/target/release/bundle）

更新检测通过 tauri-plugin-http（capabilities/default.json 中已配置
gitee.com / api.gitee.com / www.renpy.org 的访问白名单）。

## 应用内同步更新（检测到更新时弹窗询问）

启动检查发现新版本时，应用会弹出主题同步的 Material 对话框询问「是否立即同步更新」：

- 立即同步（桌面版）：Electron / pywebview 外壳会下载最新中文 RST 与英文 HTML，
  调用内置的 build/build.mjs 重建索引到用户目录，然后自动切换到新数据并刷新界面
  - Electron：%APPDATA%\RenPyDoc\data
  - pywebview：~/.renpydoc/data
  下次启动会自动优先加载这份已同步的数据
- 立即同步（浏览器模式）：浏览器无法重建索引，会打开 Gitee 仓库并提示手动执行
  node build/update_docs.mjs 与 node build/build.mjs
- 查看提交 / 稍后：跳转提交详情或关闭对话框

## 数据结构（便于用任意语言二次构建）

每个页面对象：

    {
      "slug": "dialogue",                 // 页面标识（与文件名一致，中英对齐）
      "title": "对话(dialogue)和旁白",
      "html": "<h1 id=...>…</h1>…",       // 精简后的正文（可离线渲染）
      "sections": [ { "id", "title", "text" } ],  // 搜索用分节
      "terms":    [ { "id", "name", "kind", "alias" } ] // API 词条（alias=true 为英文并入词条）
    }

meta.js 中包含 nav.zh / nav.en（原版侧边目录），数据分块声明在 chunks 字段。
解析器 build/core.js 覆盖：Sphinx HTML5（EN）与 reStructuredText（CN）的
标题、段落、列表、代码块、表格、admonition、function/class/var 等指令、
:ref: / :doc: / :file: 等角色，并做中英页面按 slug 对齐。

## 常见问题

- 直接打开 index.html（file://）时更新检测可能因浏览器 CORS 限制失败：属正常现象，
  状态栏会显示离线提示；使用 Electron / pywebview 外壳即可获得后台检测能力。
- 切换语言第一次点击 EN 时会加载英文索引（约 5 MB，本地秒级完成），之后即时切换。
- 侧边目录中带 EN 角标的条目表示该页暂无中文翻译，点击自动打开英文原版。
- 若修改了 renpy_en / renpy_cn 源文档，请重新运行构建脚本，打开应用即生效。
