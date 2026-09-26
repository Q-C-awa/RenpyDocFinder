#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""RenPyDoc Finder — pywebview 桌面外壳（Python 3）

依赖：pip install pywebview
运行：python python/app.py
打包（PyInstaller 示例）：
    pip install pyinstaller
    pyinstaller -w -F --name RenPyDoc python/app.py

更新检测由 Python 侧完成（绕过浏览器 CORS），页面内自动识别
window.pywebview.api.check / open_external。
"""

import json
import os
import re
import shutil
import subprocess
import sys
import urllib.request
import webbrowser

try:
    import webview
except ImportError:
    print("缺少依赖 pywebview，请先执行：pip install pywebview")
    sys.exit(1)

UA = {"User-Agent": "RenPyDoc-Finder/1.0"}
GITEE_API = "https://gitee.com/api/v5/repos/kurororo666/Renpydoc-ranslate/commits?per_page=1"
EN_INDEX = "https://www.renpy.org/doc/html/index.html"
ZH_RAW = "https://gitee.com/kurororo666/Renpydoc-ranslate/raw/master/source/"
ZH_RAW_ROOT = "https://gitee.com/kurororo666/Renpydoc-ranslate/raw/master/"
EN_BASE = "https://www.renpy.org/doc/html/"
SDK_CDN = "https://cdn.jsdelivr.net/gh/renpy/renpy@master/gui/game/"
SDK_RAW = "https://raw.githubusercontent.com/renpy/renpy/master/gui/game/"
USER_DIR = os.path.join(os.path.expanduser("~"), ".renpydoc")


class Api:
    """暴露给页面 JS 的 API。"""

    def _get_text(self, url, timeout=9):
        req = urllib.request.Request(url, headers=UA)
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.read().decode("utf-8", "ignore")

    def check(self):
        zh = None
        en = None
        try:
            j = json.loads(self._get_text(GITEE_API))
            first = j[0] if j else None
            if first:
                zh = {
                    "date": first.get("created_at", ""),
                    "sha": first.get("sha", ""),
                    "url": first.get("html_url", ""),
                }
        except Exception:  # noqa: BLE001
            pass
        try:
            t = self._get_text(EN_INDEX)
            m = re.search(r"([\d]+\.[\d]+(?:\.[\d]+)?)\s+Documentation", t)
            if m:
                en = {"version": m.group(1)}
        except Exception:  # noqa: BLE001
            pass
        if zh is None and en is None:
            raise RuntimeError("网络不可用")
        return {"zh": zh, "en": en}

    def _save_first(self, urls, dest):
        for url in urls:
            try:
                req = urllib.request.Request(url, headers=UA)
                with urllib.request.urlopen(req, timeout=25) as resp:
                    data = resp.read()
                if len(data) < 64:
                    continue
                os.makedirs(os.path.dirname(dest), exist_ok=True)
                with open(dest, "wb") as f:
                    f.write(data)
                return True
            except Exception:  # noqa: BLE001
                continue
        return False

    def _collect_images(self, cache_zh, cache_en):
        """抓取中文 RST 与英文 HTML 中引用到的图片。"""
        items = []
        try:
            for name in os.listdir(cache_zh):
                if not name.endswith(".rst"):
                    continue
                with open(os.path.join(cache_zh, name), "r", encoding="utf-8", errors="ignore") as f:
                    text = f.read()
                for m in re.finditer(r"^\.\.\s+(?:image|figure)::\s*(\S+)", text, re.M):
                    ref = m.group(1)
                    dest = os.path.join(cache_zh, ref)
                    if os.path.exists(dest):
                        continue
                    cands = [
                        ZH_RAW + ref,
                        ZH_RAW_ROOT + ref,
                        SDK_CDN + re.sub(r"^oshs/game/", "", ref),
                        SDK_RAW + re.sub(r"^oshs/game/", "", ref),
                    ]
                    items.append((cands, dest))
        except Exception:  # noqa: BLE001
            pass
        try:
            for name in os.listdir(cache_en):
                if not name.endswith(".html"):
                    continue
                with open(os.path.join(cache_en, name), "r", encoding="utf-8", errors="ignore") as f:
                    text = f.read()
                for m in re.finditer(r"_images/([A-Za-z0-9_./-]+\.(?:png|jpe?g|gif|webp|svg))", text):
                    full = m.group(1)
                    flat = os.path.basename(full)
                    dest = os.path.join(cache_en, flat)
                    if os.path.exists(dest):
                        continue
                    items.append(([EN_BASE + "_images/" + full, EN_BASE + "_images/" + flat], dest))
        except Exception:  # noqa: BLE001
            pass
        ok = 0
        fail = 0
        for cands, dest in items:
            if self._save_first(cands, dest):
                ok += 1
            else:
                fail += 1
        return ok, fail

    def open_external(self, url):
        if isinstance(url, str) and url.startswith("http"):
            webbrowser.open(url)
            return True
        return False

    def _download(self, url, dest):
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        req = urllib.request.Request(url, headers=UA)
        with urllib.request.urlopen(req, timeout=25) as resp:
            data = resp.read()
        with open(dest, "wb") as f:
            f.write(data)

    def sync_docs(self, payload):
        """下载最新中英文文档并重建索引，返回新的数据目录 dataUrl。"""
        from concurrent.futures import ThreadPoolExecutor

        node = shutil.which("node")
        if not node:
            return {
                "ok": False,
                "reason": "no-node",
                "message": "未检测到 Node.js，无法自动重建索引。请安装 Node.js 后重试，"
                           "或手动执行 build/update_docs.mjs 与 node build/build.mjs。",
            }

        here = os.path.dirname(os.path.abspath(__file__))
        app_root = os.path.abspath(os.path.join(here, ".."))
        cache_zh = os.path.join(USER_DIR, "docs_cache", "zh", "source")
        cache_en = os.path.join(USER_DIR, "docs_cache", "en")
        out_dir = os.path.join(USER_DIR, "data")
        build_dir = os.path.join(USER_DIR, "build")
        os.makedirs(cache_zh, exist_ok=True)
        os.makedirs(cache_en, exist_ok=True)
        os.makedirs(build_dir, exist_ok=True)

        try:
            for name in ("core.js", "build.mjs"):
                shutil.copyfile(
                    os.path.join(app_root, "build", name),
                    os.path.join(build_dir, name),
                )
        except Exception as exc:  # noqa: BLE001
            return {"ok": False, "message": "无法复制构建脚本：%s" % exc}

        jobs = []
        for slug in (payload or {}).get("zh", []) or []:
            jobs.append((ZH_RAW + slug + ".rst", os.path.join(cache_zh, slug + ".rst")))
        for slug in (payload or {}).get("en", []) or []:
            jobs.append((EN_BASE + slug + ".html", os.path.join(cache_en, slug + ".html")))
        if not jobs:
            return {"ok": False, "message": "没有可下载的文档清单"}

        ok = 0
        failed = 0
        def fetch(job):
            url, dest = job
            try:
                self._download(url, dest)
                return True
            except Exception:  # noqa: BLE001
                return False

        with ThreadPoolExecutor(max_workers=6) as pool:
            for good in pool.map(fetch, jobs):
                if good:
                    ok += 1
                else:
                    failed += 1
        if ok == 0:
            return {"ok": False, "message": "下载失败，请检查网络后重试"}

        # 文档引用到的图片也一起补齐
        img_ok, img_fail = self._collect_images(cache_zh, cache_en)

        cmd = [
            node,
            os.path.join(build_dir, "build.mjs"),
            "--en-dir", cache_en,
            "--zh-dir", cache_zh,
            "--out-dir", out_dir,
        ]
        try:
            proc = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
        except Exception as exc:  # noqa: BLE001
            return {"ok": False, "message": "索引重建失败：%s" % exc}
        if proc.returncode != 0:
            tail = (proc.stderr or proc.stdout or "")[-300:]
            return {"ok": False, "message": "索引重建失败：%s" % tail}

        data_url = "file:///" + out_dir.replace(os.sep, "/") + "/"
        return {
            "ok": True,
            "dataUrl": data_url,
            "downloaded": ok,
            "failed": failed,
            "images": img_ok,
            "imagesFailed": img_fail,
        }


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    index_html = os.path.abspath(os.path.join(here, "..", "index.html"))
    api = Api()
    win = webview.create_window(
        "Renpy文档查询",
        index_html,
        js_api=api,
        width=1280,
        height=840,
        min_size=(960, 600),
    )
    webview.start()


if __name__ == "__main__":
    main()
