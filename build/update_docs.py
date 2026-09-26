#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""RenPyDoc Finder — 文档更新脚本（Python 3，仅标准库）

用法：
    python update_docs.py             # 更新文档 + 图片
    python update_docs.py --no-build  # 与 --no-build 等价的说明输出

中文：git 克隆/拉取 gitee 仓库，并按 RST 里的 .. image:: / .. figure:: 抓取图片；
      SDK GUI 模板图（oshs/game/...）从 Ren'Py 源码仓库（jsDelivr / GitHub raw）补齐。
英文：按本地清单下载 HTML，并按 _images/ 引用抓取官方图片。
"""

import os
import re
import subprocess
import sys
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
APP_ROOT = os.path.abspath(os.path.join(HERE, ".."))
CACHE_ROOT = os.path.join(APP_ROOT, "docs_cache")

GITEE_REPO = "https://gitee.com/kurororo666/Renpydoc-ranslate.git"
GITEE_RAW = "https://gitee.com/kurororo666/Renpydoc-ranslate/raw/master/"
EN_BASE = "https://www.renpy.org/doc/html/"
SDK_CDN = "https://cdn.jsdelivr.net/gh/renpy/renpy@master/gui/game/"
SDK_RAW = "https://raw.githubusercontent.com/renpy/renpy/master/gui/game/"
UA = {"User-Agent": "RenPyDoc-Finder/1.0"}


def log(msg):
    print(msg, flush=True)


def fetch(url, timeout=25):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read()


def save_from_candidates(cands, dest):
    for url in cands:
        try:
            data = fetch(url)
            if len(data) < 64:
                continue
            os.makedirs(os.path.dirname(dest), exist_ok=True)
            with open(dest, "wb") as f:
                f.write(data)
            return url
        except Exception:  # noqa: BLE001
            continue
    return None


def extract_image_refs(text):
    out = []
    for m in re.finditer(r"^\.\.\s+(?:image|figure)::\s*(\S+)", text, re.M):
        if m.group(1) not in out:
            out.append(m.group(1))
    return out


def update_zh():
    target = os.path.join(CACHE_ROOT, "zh")
    if os.path.isdir(os.path.join(target, ".git")):
        log("[中文] 拉取最新提交…")
        try:
            subprocess.run(["git", "-C", target, "pull", "--ff-only", "--depth", "1"], check=True)
        except Exception:  # noqa: BLE001
            log("[中文] pull 失败，继续使用现有副本")
    else:
        log("[中文] 首次克隆仓库（浅克隆）…")
        os.makedirs(CACHE_ROOT, exist_ok=True)
        subprocess.run(["git", "clone", "--depth", "1", GITEE_REPO, target], check=True)
    try:
        head = subprocess.run(
            ["git", "-C", target, "log", "-1", "--format=%h %ci"],
            check=True, capture_output=True, text=True,
        ).stdout.strip()
        log("[中文] 当前提交：" + head)
    except Exception:  # noqa: BLE001
        pass

    src = os.path.join(target, "source")
    if not os.path.isdir(src):
        return
    refs = []
    for name in os.listdir(src):
        if not name.endswith(".rst"):
            continue
        try:
            with open(os.path.join(src, name), "r", encoding="utf-8", errors="ignore") as f:
                for r in extract_image_refs(f.read()):
                    if r not in refs:
                        refs.append(r)
        except Exception:  # noqa: BLE001
            continue
    if not refs:
        return
    log("[中文图片] 引用 %d 个，开始抓取…" % len(refs))
    ok = 0
    fail = 0
    for ref in refs:
        dest = os.path.join(src, ref)
        if os.path.exists(dest):
            ok += 1
            continue
        no_oshs = re.sub(r"^oshs/game/", "", ref)
        cands = [
            GITEE_RAW + "source/" + ref,
            GITEE_RAW + ref,
            SDK_CDN + no_oshs,
            SDK_RAW + no_oshs,
        ]
        if save_from_candidates(cands, dest):
            ok += 1
        else:
            fail += 1
    log("[中文图片] 完成：成功 %d，失败 %d" % (ok, fail))


def update_en():
    target = os.path.join(CACHE_ROOT, "en")
    os.makedirs(target, exist_ok=True)
    src_dir = target if os.listdir(target) else os.path.abspath(os.path.join(APP_ROOT, "..", "renpy_en"))
    if not os.path.isdir(src_dir):
        log("[英文] 找不到本地英文文档目录，无法确定下载清单。")
        return
    names = sorted(f for f in os.listdir(src_dir) if f.endswith(".html"))
    log("[英文] 待更新页面 %d 个（源：%s）" % (len(names), src_dir))

    def one(name):
        try:
            data = fetch(EN_BASE + name)
            with open(os.path.join(target, name), "wb") as f:
                f.write(data)
            return True
        except Exception:  # noqa: BLE001
            return False

    ok = 0
    fail = 0
    with ThreadPoolExecutor(max_workers=6) as pool:
        for good in pool.map(one, names):
            if good:
                ok += 1
            else:
                fail += 1
    log("[英文] 页面下载完成：成功 %d，失败 %d" % (ok, fail))

    img_names = []
    for name in os.listdir(target):
        if not name.endswith(".html"):
            continue
        try:
            with open(os.path.join(target, name), "r", encoding="utf-8", errors="ignore") as f:
                text = f.read()
        except Exception:  # noqa: BLE001
            continue
        for m in re.finditer(r"_images/([A-Za-z0-9_./-]+\.(?:png|jpe?g|gif|webp|svg))", text):
            if m.group(1) not in img_names:
                img_names.append(m.group(1))
    if img_names:
        log("[英文图片] 引用 %d 个，开始抓取…" % len(img_names))
        iok = 0
        ifail = 0
        for name in img_names:
            flat = os.path.basename(name)
            dest = os.path.join(target, flat)
            if os.path.exists(dest):
                iok += 1
                continue
            if save_from_candidates([EN_BASE + "_images/" + name, EN_BASE + "_images/" + flat], dest):
                iok += 1
            else:
                ifail += 1
        log("[英文图片] 完成：成功 %d，失败 %d" % (iok, ifail))


def main():
    log("== RenPyDoc 文档更新 ==")
    update_zh()
    update_en()
    log("== 完成 ==")
    log("请运行构建脚本重建索引：node build/build.mjs")
    log("（构建脚本会优先使用 docs_cache/ 中的最新文档与图片）")


if __name__ == "__main__":
    main()
