package com.qc.renpydocfinder

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader

/**
 * 文档数据仓库：读取 assets/docs 下由 tools/build_docs.mjs 打包出来的数据。
 *
 * - meta.json           元信息 + 侧边目录结构
 * - index-zh/en.ndjson  索引层：每行一页（标题 / 分节 / 词条），供搜索使用
 * - home-zh/en.html     首页正文
 * - html/<lang>/<slug>.html  文章正文，按需读取
 */
class DocRepository(private val context: Context) {

    private val pageCache = HashMap<String, String>()

    fun hasData(): Boolean = assetExists("docs/meta.json")

    fun loadMeta(): DocMeta? {
        val text = readAssetText("docs/meta.json") ?: return null
        val o = JSONObject(text)
        val zh = o.optJSONObject("docZh") ?: JSONObject()
        val en = o.optJSONObject("docEn") ?: JSONObject()
        val nav = o.optJSONObject("nav") ?: JSONObject()
        return DocMeta(
            buildId = o.optString("buildId", ""),
            generated = o.optString("generated", ""),
            zhVersion = zh.optString("version", ""),
            enVersion = en.optString("version", ""),
            zhPages = zh.optInt("pages", 0),
            enPages = en.optInt("pages", 0),
            zhLabel = zh.optString("label", "中文翻译"),
            enLabel = en.optString("label", "英文原版"),
            navZh = parseNav(nav.optJSONObject("zh")),
            navEn = parseNav(nav.optJSONObject("en"))
        )
    }

    private fun parseNav(o: JSONObject?): List<NavGroup> {
        if (o == null) return emptyList()
        val out = ArrayList<NavGroup>()
        val groups = o.optJSONArray("groups")
        if (groups != null) {
            for (i in 0 until groups.length()) {
                val g = groups.optJSONObject(i) ?: continue
                val items = parseItems(g.optJSONArray("items"))
                if (items.isNotEmpty()) out.add(NavGroup(g.optString("caption", ""), items))
            }
        }
        val extras = parseItems(o.optJSONArray("extras"))
        if (extras.isNotEmpty()) out.add(NavGroup("索引与样例", extras))
        return out
    }

    private fun parseItems(arr: JSONArray?): List<NavItem> {
        if (arr == null) return emptyList()
        val out = ArrayList<NavItem>(arr.length())
        for (i in 0 until arr.length()) {
            val it = arr.optJSONObject(i) ?: continue
            val slug = it.optString("slug", "")
            if (slug.isEmpty()) continue
            out.add(NavItem(slug, it.optString("title", slug)))
        }
        return out
    }

    /** 首页正文（内联在 assets 中，读取极快） */
    fun loadHomeHtml(lang: String): String =
        readAssetText("docs/home-$lang.html") ?: ""

    /** 文章正文，按页读取并缓存 */
    fun loadPageHtml(lang: String, slug: String): String? {
        val key = lang + "/" + slug
        pageCache[key]?.let { return it }
        val text = readAssetText("docs/html/$lang/$slug.html") ?: return null
        pageCache[key] = text
        return text
    }

    /** 索引层：逐行解析 NDJSON，回调返回 0..1 的进度 */
    fun loadIndex(lang: String, onProgress: (Float) -> Unit): List<DocPage> {
        val path = "docs/index-$lang.ndjson"
        val pages = ArrayList<DocPage>(256)
        val input = try {
            context.assets.open(path)
        } catch (e: Exception) {
            return pages
        }
        BufferedReader(InputStreamReader(input, Charsets.UTF_8), 1 shl 16).use { reader ->
            var line = reader.readLine()
            var count = 0
            while (line != null) {
                if (line.isNotEmpty()) {
                    try {
                        pages.add(parsePage(JSONObject(line), lang))
                    } catch (e: Exception) {
                        // 单行坏了不影响整体
                    }
                }
                count++
                if (count % 8 == 0) onProgress(0f)
                line = reader.readLine()
            }
        }
        return pages
    }

    private fun parsePage(o: JSONObject, lang: String): DocPage {
        val sections = ArrayList<DocSection>()
        val secArr = o.optJSONArray("sections")
        if (secArr != null) {
            for (i in 0 until secArr.length()) {
                val s = secArr.optJSONObject(i) ?: continue
                sections.add(
                    DocSection(
                        id = s.optString("id", ""),
                        title = s.optString("title", ""),
                        text = s.optString("text", "")
                    )
                )
            }
        }
        val terms = ArrayList<DocTerm>()
        val termArr = o.optJSONArray("terms")
        if (termArr != null) {
            for (i in 0 until termArr.length()) {
                val t = termArr.optJSONObject(i) ?: continue
                val name = t.optString("name", "")
                if (name.isEmpty()) continue
                terms.add(
                    DocTerm(
                        id = t.optString("id", ""),
                        name = name,
                        kind = t.optString("kind", "api"),
                        alias = t.optBoolean("alias", false)
                    )
                )
            }
        }
        return DocPage(
            slug = o.optString("slug", ""),
            title = o.optString("title", ""),
            source = o.optString("source", ""),
            lang = lang,
            sections = sections,
            terms = terms
        )
    }

    private fun assetExists(path: String): Boolean = try {
        context.assets.open(path).use { true }
    } catch (e: Exception) {
        false
    }

    private fun readAssetText(path: String): String? = try {
        context.assets.open(path).use { input ->
            input.readBytes().toString(Charsets.UTF_8)
        }
    } catch (e: Exception) {
        null
    }
}
