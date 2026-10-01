package com.qc.renpydocfinder

import org.json.JSONArray
import java.net.HttpURLConnection
import java.net.URL

/** 文档更新检测：与桌面版使用相同的数据源 */
object UpdateChecker {

    const val ZH_REPO = "https://gitee.com/kurororo666/Renpydoc-ranslate"
    const val EN_DOCS = "https://www.renpy.org/doc/html/"
    private const val GITEE_API =
        "https://gitee.com/api/v5/repos/kurororo666/Renpydoc-ranslate/commits?per_page=1"
    private const val EN_INDEX = "https://www.renpy.org/doc/html/index.html"

    data class Result(
        val zhDate: String,
        val zhSha: String,
        val enVersion: String,
        val error: String
    ) {
        val ok: Boolean get() = error.isEmpty() && (zhDate.isNotEmpty() || enVersion.isNotEmpty())
    }

    fun check(): Result {
        var zhDate = ""
        var zhSha = ""
        var enVersion = ""
        var error = ""
        try {
            val text = get(GITEE_API)
            val arr = JSONArray(text)
            if (arr.length() > 0) {
                val first = arr.optJSONObject(0)
                if (first != null) {
                    zhDate = first.optString("created_at", "")
                    zhSha = first.optString("sha", "")
                }
            }
        } catch (e: Exception) {
            error = e.message ?: "网络不可用"
        }
        try {
            val html = get(EN_INDEX)
            val m = Regex("([\\d]+\\.[\\d]+(?:\\.[\\d]+)?)\\s+Documentation").find(html)
            if (m != null) enVersion = m.groupValues[1]
        } catch (e: Exception) {
            if (error.isEmpty()) error = e.message ?: "网络不可用"
        }
        if (zhDate.isEmpty() && enVersion.isEmpty() && error.isEmpty()) error = "网络不可用"
        return Result(zhDate, zhSha, enVersion, error)
    }

    private fun get(url: String): String {
        val conn = (URL(url).openConnection() as HttpURLConnection)
        conn.connectTimeout = 9000
        conn.readTimeout = 12000
        conn.setRequestProperty("User-Agent", "RenPyDoc-Finder-Android/1.0")
        return try {
            conn.inputStream.use { it.readBytes().toString(Charsets.UTF_8) }
        } finally {
            conn.disconnect()
        }
    }
}
