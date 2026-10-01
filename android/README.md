# RenpyDoc Finder 手机版（Android）

原生安卓界面（Material 3）：MaterialToolbar 顶栏（品牌 + 搜索 + 原文）、左侧抽屉目录、
搜索结果卡片列表、文档页（WebView 渲染正文 + 章节芯片条）、底部状态栏。
搜索内核与电脑版一致（`SearchEngine.kt` 是电脑版 `assets/app.js` 搜索算法的移植）。

## 界面结构

```
[☰] Ren'Py 文档助手 / RenpyDoc Finder        ← 顶栏（品牌两行）
[ 🔍 搜索函数 / 变量 / 标签 / 正文  × ] [原文]
全部 · API条目 · 变量 · 标签 · 正文            ← 结果筛选（仅搜索时出现）
────────────────────────────────────────
文档页：  [←] [中文] 标题
        章节芯片条（可横滑，自动跟随当前章节）
        WebView 正文（代码高亮 / 点击复制 / 图片 / 内链）
结果页： 共 N 条结果 · X ms · 中文索引 + 结果卡片
────────────────────────────────────────
中文 103 页   英文 113 页 · v8.5.4      更新状态   ← 底部状态栏
```

侧边抽屉（`.nav_header`）从上到下：

```
文档目录                            [N 项]
[ 中文 | EN ]                         ← 语言切换（滑块动画）
[ 🌙 深色 ]                           ← 主题：点一下切深浅色
[ ⟳ 检查文档更新 ] + 状态文字
起步 / 进阶 / … （电脑版原版分组与条目）
打开中文文档仓库 / 打开英文官方文档        ← 电脑版侧边栏底部链接
```

## 顶部状态栏那条

状态栏区域用**主题底色**：浅色 `#FEF7FF`、深色 `#141218`（即 MD3 的 surface，
和文档正文区域同色，不再是一条割裂的"占位条"）。
- Android 15+ 强制边到边时：根布局背景（`surfaceColor()`）+ 系统栏内边距；
- Android 14 及以下：`android:statusBarColor = @color/md_surface`。
两条路径颜色一致，并随 App 深浅色主题切换（状态栏图标颜色同步切换）。

## 文档数据

`app/src/main/assets/docs/`（由 `package_bat/安卓-生成数据.bat` 生成）：
`meta.json` + `index-zh/en.ndjson` + `home-zh/en.html` + `html/<lang>/<slug>.html`。
生成脚本读取电脑版 `data/`，保证与电脑版同源。

## 构建

Android Studio 打开 `renpy-doc-app/android` → Sync → Run，或：

```
gradlew.bat assembleDebug
gradlew.bat assembleRelease
```

## 备注

- 启动图标用电脑版自己的 `assets/ico/window-icon.png`（构建时由 `syncBrandIcon` 拷入）。
- 更新检测只提示版本差异；手机版数据在安装包内，同步最新文档需要重新跑打包脚本再重新构建。
- 崩溃会写 `filesDir/crash.log`，下次启动弹窗显示堆栈，便于定位闪退。
- `app/build.gradle.kts` 里保留了 `syncWebAssets` 任务（把电脑版网页 UI 打进 APK 的整屏 WebView 方案），
  默认不启用；需要那个方案时，把 `assets.srcDir(webAssetsDir...)` 那行取消注释即可。

## 常见问题

**AAR metadata 校验失败**（androidx.core 1.19+ 要求 compileSdk 37 / AGP 9.1）
：本工程是 AGP 8.13.2 + compileSdk 36，`gradle/libs.versions.toml` 里 coreKtx 锁 1.13.1，
material 锁 1.11.0（1.13+ 引入 `<macro>` 资源，AGP 8.13.2 的 aapt2 不支持，会报
"Can not extract resource from ParsedResource"），并在 `app/build.gradle.kts` 用
`resolutionStrategy.force` 锁死。以后整体升到 AGP 9.1+ / compileSdk 37 再一起调高。

**Sync 成功但首页空白**：说明还没生成文档数据，先跑 `package_bat/安卓-生成数据.bat`。
