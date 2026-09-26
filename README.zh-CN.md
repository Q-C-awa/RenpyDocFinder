# RenPyDoc Finder — Ren'Py 文档查询助手

Ren'Py 文档的离线浏览与智能搜索工具：收录**英文原版文档**与**社区中文翻译**，
界面与原版文档一致，纯本地数据、可完全离线使用。

> English README: [README.md](README.md)

## 是什么

- 一个应用里放两套文档：英文原版（113 页，Ren'Py 8.5.2）与中文翻译（103 页）。
- 布局照搬原版：左侧分组目录、右侧正文、正文上方章节快捷栏。
- 完全离线：页面、图片、搜索索引都预生成在 `data/`（约 8.7 MB）。
- 手写 Material Design 3 样式，零外部依赖（无 CDN、无在线字体），双击 `index.html` 即可用。

## 来源与致谢

**中文翻译** —— 仓库：https://gitee.com/kurororo666/Renpydoc-ranslate
（使用其 `source/**/*.rst` 与旁边图片；该仓库列出的贡献者：逆转咸鱼、被诅咒的章鱼）。
译文里少量插图引用了 `oshs/game/gui/...` 路径，这些文件不在仓库中，
应用会为它们显示占位提示。

**英文原版** —— 在线文档：https://www.renpy.org/doc/html/ ；引擎与文档源码：
https://github.com/renpy/renpy （许可条款见该仓库）。

**图片查找顺序**：`assets/docimg/` → `docs_cache/` → 原始文档目录（`../renpy_cn/source`、
`../renpy_en/_images`）→ 在线兜底（renpy.org 的 `_images`，以及 Ren'Py 源码仓库中对应路径，走 jsDelivr /
GitHub raw）。都找不到时页面会显示一条提示说明缺哪个文件。

**免责声明**：本项目是第三方非官方工具，与 Ren'Py 官方项目及中文翻译团队无隶属关系；
文档与图片的版权归原作者所有。

## 功能

**搜索** —— 中文字符级匹配（「块定义」可命中「语句块(block)的定义」）；英文模糊容错
（`chracter` → `Character`，`renpy.say` 命中 API）；空格 = AND，`|` = OR，"引号" = 精确短语；
标题加权排序、命中高亮、结果筛选；已索引 2991 条 API 词条并把英文名并入中文索引；预建索引、毫秒响应。

**阅读** —— 原版式侧边目录（12 组、可折叠、当前页高亮）；章节快捷栏常驻并标记当前章节；
跳转带自动淡出的定位高亮（不影响排版）；代码块 Ren'Py / Python 语法高亮，一键复制、内联关键词点击复制；
图片、提示框、表格、定义列表/字段列表、行块按原文结构呈现；浅色/深色主题；右键菜单与全文可选中复制。

**维护** —— 启动检测更新（Gitee 提交 + renpy.org 版本号）；发现更新时弹出跟随主题的对话框询问是否同步，
桌面版会下载最新文档**及图片**、重建索引并热切换。快捷键：`/` 或 `Ctrl+K` 搜索、`↑`/`↓` 选择、
`Enter` 打开、`Esc` 返回、`Alt+E` 切换语言、`Alt+T` 切换主题。

## 快速开始

直接双击 `index.html`；需要本地服务器时用 `python -m http.server 8080` 或 `node serve.mjs`。
应用默认进入中文翻译版，顶栏 `中文 / EN` 可切到英文原版。

## 重建索引

    node build/build.mjs
    #   --en-dir <目录>   英文 HTML（默认 ../renpy_en 或 docs_cache/en）
    #   --zh-dir <目录>   中文 RST（默认 ../renpy_cn/source 或 docs_cache/zh/source）
    #   --out-dir <目录>  输出目录（默认 data）
    #   --chunk-bytes N   分块字节数（默认 1400000）

## 更新文档

    node build/update_docs.mjs     # Gitee 克隆/拉取 + renpy.org 页面 + 图片，然后重建索引
    python build/update_docs.py    # 同上，Python 3 标准库实现

下载缓存在 `docs_cache/`，不会覆盖原有的 `renpy_en` / `renpy_cn`。

## 目录结构

    index.html          应用入口
    assets/             style.css（Material 3）、app.js（界面 + 搜索）、ico/（窗口图标）
    data/               meta.js（侧边目录结构、更新源）+ zh/en 分块 + manifest.json
    build/              core.js（解析器）、build.mjs、update_docs.mjs、update_docs.py
    electron/ python/ src-tauri/   可选的桌面外壳
    tools/icon.ps1      图标缩放工具

## 数据结构

    { "slug": "dialogue", "title": "...", "html": "...",
      "sections": [ { "id", "title", "text" } ],      // 搜索用分节
      "terms":    [ { "id", "name", "kind", "alias" } ]   // API 词条（alias 为英文并入）
    }

`meta.js` 里另有 `nav.zh` / `nav.en`（侧边目录结构）与分块清单。

## 说明

- 直接以 `file://` 打开时更新检测会因浏览器跨域限制失败，桌面外壳可在后台完成。
- 首次切换语言需要解析另一语言索引（数 MB），之后切换即时。
- 中英页面按 slug 对齐；侧边目录带 `EN` 角标表示该页暂无中文版，点击打开英文原版。

## 许可

程序代码：MIT（见 `package.json`）。内置的文档正文与图片不在该许可范围内，其条款见各自来源仓库。
