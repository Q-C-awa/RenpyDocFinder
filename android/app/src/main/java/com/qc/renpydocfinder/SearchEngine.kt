package com.qc.renpydocfinder

import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min

/**
 * 搜索内核：与桌面版（assets/app.js）完全一致的匹配与打分逻辑。
 *
 * - 中文：整串命中 > 二元组覆盖 + 子序列紧凑度 > 子序列命中
 * - 英文/代码：整词 > 前缀 > 子串 > trigram Dice 模糊 > 编辑距离纠错
 * - 多词为 AND；用「|」分组为 OR；引号内为短语
 * - 标题命中额外加分；API 词条单独成组参与排序
 */
class SearchEngine(private val pages: List<DocPage>) {

    /** 半开区间 [start, end)，与 JS 版本一致 */
    data class Span(val start: Int, val end: Int)

    class Entry(
        val pi: Int,
        val si: Int,
        val page: DocPage,
        val section: DocSection,
        val text: String,
        val title: String,
        val pageTitle: String,
        val cjk: String,
        val bis: HashSet<String>,
        val words: List<String>,
        val wordSet: HashSet<String>
    )

    class TermEntry(val pi: Int, val page: DocPage, val term: DocTerm)

    class Token(val raw: String, val norm: String, val cjk: Boolean, val isPhrase: Boolean, val cjkChars: String)

    private class Hit(val entry: Entry, val score: Double, val ranges: List<Span>)

    class SectionHit(val section: DocSection, val score: Double, val ranges: List<Span>)
    class PageHit(val page: DocPage, val sections: MutableList<SectionHit>) { var best: Double = 0.0 }
    class TermHit(val entry: TermEntry, val score: Double)
    class Outcome(val terms: List<TermHit>, val pages: List<PageHit>, val millis: Long)
    class Snippet(val text: String, val spans: List<Span>)

    private val entries = ArrayList<Entry>()
    private val termEntries = ArrayList<TermEntry>()
    private val termByName = HashMap<String, TermEntry>()
    private val bySlug = HashMap<String, DocPage>()

    init {
        build()
    }

    fun pageOf(slug: String): DocPage? = bySlug[slug]

    fun pageCount(): Int = pages.size

    fun sectionCount(): Int = entries.size

    fun termCount(): Int = termEntries.size

    private fun build() {
        for ((pi, page) in pages.withIndex()) {
            bySlug[page.slug] = page
            for ((si, section) in page.sections.withIndex()) {
                val secText = normalizeWs(section.text)
                val fullText = normalizeWs(section.title + " " + secText + " " + page.title)
                val lower = fullText.lowercase()
                val cjkBuf = StringBuilder()
                for (ch in lower) if (isCjk(ch)) cjkBuf.append(ch)
                val cjk = cjkBuf.toString()
                val bis = HashSet<String>()
                var i = 0
                while (i + 1 < cjk.length) {
                    bis.add(cjk.substring(i, i + 2))
                    i++
                }
                val words = ArrayList<String>(24)
                val wordSet = HashSet<String>()
                for (m in WORD_RE.findAll(lower)) {
                    val w = m.value
                    if (!wordSet.add(w)) continue
                    words.add(w)
                    for (part in w.split('.')) {
                        if (part.isNotEmpty() && part != w && wordSet.add(part)) words.add(part)
                    }
                }
                entries.add(
                    Entry(
                        pi = pi,
                        si = si,
                        page = page,
                        section = section,
                        text = fullText,
                        title = normalizeWs(section.title),
                        pageTitle = normalizeWs(page.title),
                        cjk = cjk,
                        bis = bis,
                        words = words,
                        wordSet = wordSet
                    )
                )
            }
            for (term in page.terms) {
                val te = TermEntry(pi, page, term)
                termEntries.add(te)
                val key = term.name.lowercase()
                if (!termByName.containsKey(key)) termByName[key] = te
            }
        }
    }

    /* ---------------- 查询解析 ---------------- */

    fun tokenize(query: String): List<Token> {
        val out = ArrayList<Token>(4)
        for (m in QUERY_RE.findAll(query)) {
            val g1 = m.groupValues[1]
            val g2 = m.groupValues[2]
            val raw = when {
                g1.isNotEmpty() -> g1
                g2.isNotEmpty() -> g2
                else -> m.value
            }
            if (raw.isNotEmpty()) out.add(makeToken(raw))
        }
        return out
    }

    fun makeToken(raw: String): Token {
        val norm = raw.lowercase()
        var hasCjk = false
        val buf = StringBuilder()
        for (ch in norm) {
            if (isCjk(ch)) {
                hasCjk = true
                buf.append(ch)
            }
        }
        val isPhrase = norm.trim().contains(' ')
        return Token(raw, norm, hasCjk, isPhrase, if (hasCjk) buf.toString() else "")
    }

    /* ---------------- 打分 ---------------- */

    private fun tokenScoreEntry(entry: Entry, token: Token): Pair<Double, List<Span>>? {
        if (token.isPhrase) {
            val lp = entry.text.lowercase().indexOf(token.norm)
            if (lp == -1) return null
            return Pair(90 - min(lp, 60) * 0.25, listOf(Span(lp, lp + token.norm.length)))
        }
        if (token.cjk) {
            val cs = token.cjkChars
            if (cs.isEmpty()) return null
            if (cs.length == 1) {
                val cnt = countChar(entry.cjk, cs[0])
                if (cnt == 0) return null
                val p1 = entry.cjk.indexOf(cs)
                return Pair(26 + min(cnt, 5) * 3.0, listOf(Span(p1, p1 + 1)))
            }
            val exact = entry.cjk.indexOf(cs)
            if (exact != -1) {
                return Pair(100 - min(exact, 60) * 0.3, listOf(Span(exact, exact + cs.length)))
            }
            val bigrams = ArrayList<String>(cs.length)
            var i = 0
            while (i + 1 < cs.length) {
                bigrams.add(cs.substring(i, i + 2))
                i++
            }
            var hit = 0
            for (bg in bigrams) if (entry.bis.contains(bg)) hit++
            val cover = hit.toDouble() / bigrams.size
            val seq = subseqPositions(entry.cjk, cs)
            if (cover == 1.0 && seq != null) {
                val gap = seq[seq.size - 1] - seq[0] + 1
                val density = cs.length.toDouble() / gap
                val ranges = seq.map { Span(it, it + 1) }
                return Pair(52 + density * 28, ranges)
            }
            if (cover >= 0.5 && seq != null) {
                return Pair(22 + cover * 30, seq.map { Span(it, it + 1) })
            }
            return null
        }
        /* 英文 / 代码标识符 */
        val name = token.norm
        if (name.isEmpty()) return null
        if (entry.wordSet.contains(name)) return Pair(100.0, wordSpans(entry.text, name))

        var bestPrefix: String? = null
        for (wd in entry.words) {
            if (wd.length > name.length && wd.startsWith(name)) {
                if (bestPrefix == null || wd.length < bestPrefix.length) bestPrefix = wd
            }
        }
        if (bestPrefix != null) {
            val score = 52 + min(name.length.toDouble() / max(bestPrefix.length, 1) * 22, 22.0)
            return Pair(score, wordSpans(entry.text, bestPrefix))
        }
        var bestSub: String? = null
        for (wd in entry.words) {
            if (wd.length > name.length && wd.contains(name)) {
                if (bestSub == null || wd.length < bestSub.length) bestSub = wd
            }
        }
        if (bestSub != null) return Pair(44.0, wordSpans(entry.text, bestSub))

        /* trigram Dice 模糊匹配 */
        val tgrams = trigrams(name)
        var bestDice = 0.0
        var bestWord: String? = null
        if (tgrams.isNotEmpty()) {
            val tset = tgrams.toHashSet()
            for (wd in entry.words) {
                if (abs(wd.length - name.length) > 3) continue
                val wtri = trigrams(wd)
                if (wtri.isEmpty()) continue
                val wset = HashSet<String>()
                var common = 0
                for (g in wtri) {
                    if (wset.add(g) && tset.contains(g)) common++
                }
                val dice = (2.0 * common) / (tgrams.size + wset.size)
                if (dice > bestDice) {
                    bestDice = dice
                    bestWord = wd
                }
            }
        }
        if (bestDice >= 0.55 && bestWord != null) {
            return Pair(20 + bestDice * 35, wordSpans(entry.text, bestWord))
        }
        /* 编辑距离纠错 */
        if (name.length >= 3) {
            val maxD = if (name.length >= 6) 2 else 1
            for (wd in entry.words) {
                if (abs(wd.length - name.length) <= maxD && levenshtein(wd, name) <= maxD) {
                    return Pair(18.0, wordSpans(entry.text, wd))
                }
            }
        }
        return null
    }

    private fun tokenScoreTerm(te: TermEntry, token: Token): Double? {
        if (token.cjk || token.isPhrase) return null
        val n = te.term.name.lowercase()
        val q = token.norm
        if (n.isEmpty() || q.isEmpty()) return null
        if (n == q) return 150.0
        if (n.startsWith(q)) return 78 + min(q.length.toDouble() / max(n.length, 1) * 22, 22.0)
        if (n.contains(q)) return 64.0
        val tgrams = trigrams(q)
        val nlist = trigrams(n)
        val nset = nlist.toHashSet()
        if (tgrams.isNotEmpty() && nlist.isNotEmpty()) {
            var common = 0
            for (g in tgrams) if (nset.contains(g)) common++
            val dice = (2.0 * common) / (tgrams.size + nlist.size)
            if (dice >= 0.6) return 30 + dice * 35
        }
        if (q.length >= 4 && levenshtein(n, q) <= 2) return 28.0
        return null
    }

    private fun titleBonus(entry: Entry, token: Token): Double {
        var b = 0.0
        if (token.cjk) {
            val cs = token.cjkChars
            if (cs.isNotEmpty()) {
                if (entry.title.contains(cs)) b += 20
                if (entry.pageTitle.contains(cs)) b += 32
            }
        } else if (!token.isPhrase) {
            val q = token.norm
            if (entry.title.lowercase().contains(q)) b += 20
            if (entry.pageTitle.lowercase().contains(q)) b += 32
        }
        return b
    }

    /** 一组 token 的 AND 匹配（多词必须落在同一分节里） */
    private fun matchGroup(tokens: List<Token>): List<Hit>? {
        if (tokens.isEmpty()) return null
        var matched: HashMap<Entry, Hit>? = null
        for (token in tokens) {
            val cur = HashMap<Entry, Hit>()
            for (entry in entries) {
                val r = tokenScoreEntry(entry, token) ?: continue
                cur[entry] = Hit(entry, r.first, r.second)
            }
            if (cur.isEmpty()) return null
            val prev = matched
            if (prev == null) {
                matched = cur
            } else {
                val inter = HashMap<Entry, Hit>()
                for ((entry, hit) in cur) {
                    val p = prev[entry] ?: continue
                    inter[entry] = Hit(entry, p.score + hit.score, p.ranges + hit.ranges)
                }
                if (inter.isEmpty()) return null
                matched = inter
            }
        }
        val m = matched ?: return null
        val out = ArrayList<Hit>(m.size)
        for (hit in m.values) {
            var bonus = 0.0
            for (token in tokens) bonus += titleBonus(hit.entry, token)
            out.add(Hit(hit.entry, hit.score + bonus, hit.ranges))
        }
        out.sortByDescending { it.score }
        return out
    }

    /* ---------------- 搜索入口 ---------------- */

    fun search(query: String): Outcome {
        val t0 = System.nanoTime()
        val q = query.trim()
        if (q.isEmpty()) return Outcome(emptyList(), emptyList(), 0)
        val groups = q.split('|').map { it.trim() }.filter { it.isNotEmpty() }
        if (groups.isEmpty()) return Outcome(emptyList(), emptyList(), 0)
        val groupTokens = groups.map { tokenize(it) }.filter { it.isNotEmpty() }

        val merged = HashMap<String, Hit>()
        for (tokens in groupTokens) {
            val gr = matchGroup(tokens) ?: continue
            for (item in gr) {
                val id = item.entry.pi.toString() + "_" + item.entry.si
                val prev = merged[id]
                if (prev == null || item.score > prev.score) merged[id] = item
            }
        }
        val entryList = merged.values.sortedByDescending { it.score }

        val termHits = ArrayList<TermHit>()
        if (groupTokens.size == 1 && groupTokens[0].size == 1) {
            val token = groupTokens[0][0]
            val scored = ArrayList<TermHit>()
            val exact = termByName[token.norm]
            if (exact != null) {
                val s = tokenScoreTerm(exact, token)
                if (s != null) scored.add(TermHit(exact, s))
            }
            for (te in termEntries) {
                if (te.term.name.lowercase() == token.norm) continue
                val s = tokenScoreTerm(te, token) ?: continue
                scored.add(TermHit(te, s))
            }
            scored.sortByDescending { it.score }
            for (i in 0 until min(scored.size, 40)) termHits.add(scored[i])
        }

        val pageMap = LinkedHashMap<Int, PageHit>()
        for (e in entryList) {
            val rec = pageMap.getOrPut(e.entry.pi) { PageHit(e.entry.page, ArrayList()) }
            if (rec.sections.size < 3) rec.sections.add(SectionHit(e.entry.section, e.score, e.ranges))
        }
        val pageHits = ArrayList(pageMap.values)
        for (ph in pageHits) ph.best = ph.sections.firstOrNull()?.score ?: 0.0
        pageHits.sortByDescending { it.best }

        val t1 = System.nanoTime()
        return Outcome(termHits, pageHits.take(70), max(1L, (t1 - t0) / 1000000L))
    }

    /* ---------------- 摘要与高亮 ---------------- */

    fun collectSpans(text: String, tokens: List<Token>): List<Span> {
        val spans = ArrayList<Span>(16)
        for (token in tokens) {
            if (token.cjk) {
                val cs = token.cjkChars
                if (cs.isEmpty()) continue
                if (cs.length == 1) {
                    var i = 0
                    while (i < text.length) {
                        val p = text.indexOf(cs, i)
                        if (p == -1) break
                        spans.add(Span(p, p + 1))
                        i = p + 1
                    }
                } else if (text.contains(cs)) {
                    var i = 0
                    while (i < text.length) {
                        val p = text.indexOf(cs, i)
                        if (p == -1) break
                        spans.add(Span(p, p + cs.length))
                        i = p + 1
                    }
                } else {
                    val seq = subseqPositions(text, cs)
                    if (seq != null) for (p in seq) spans.add(Span(p, p + 1))
                }
            } else if (!token.isPhrase) {
                var re: Regex? = null
                try {
                    re = Regex("\\b" + Regex.escape(token.norm) + "\\b", RegexOption.IGNORE_CASE)
                } catch (e: Exception) {
                    re = null
                }
                if (re != null) {
                    for (m in re.findAll(text)) spans.add(Span(m.range.first, m.range.last + 1))
                }
            } else {
                var i = 0
                val lower = text.lowercase()
                val needle = token.norm.lowercase()
                if (needle.isEmpty()) continue
                while (i < text.length) {
                    val p = lower.indexOf(needle, i)
                    if (p == -1) break
                    spans.add(Span(p, p + needle.length))
                    i = p + 1
                }
            }
        }
        spans.sortWith(compareBy({ it.start }, { it.end }))
        val merged = ArrayList<Span>(spans.size)
        for (s in spans) {
            val last = merged.lastOrNull()
            if (last != null && s.start <= last.end + 1) {
                if (s.end > last.end) merged[merged.size - 1] = Span(last.start, s.end)
            } else {
                merged.add(s)
            }
        }
        return merged
    }

    /** 截取包含首个命中的片段，spans 已换算成片段内偏移 */
    fun snippet(rawText: String, tokens: List<Token>): Snippet {
        val text = normalizeWs(rawText)
        val spans = collectSpans(text, tokens)
        if (spans.isEmpty()) {
            val head = if (text.length > 150) text.substring(0, 150) + "…" else text
            return Snippet(head, emptyList())
        }
        val r0 = spans[0]
        var start = max(0, r0.start - 34)
        var end = min(text.length, max(r0.end + 80, start + 60))
        if (start > 0) {
            val sp = text.indexOf(' ', start)
            if (sp != -1 && sp < r0.start) start = sp + 1
        }
        if (end < text.length) {
            val sp2 = text.lastIndexOf(' ', end)
            if (sp2 != -1 && sp2 > r0.end) end = sp2
        }
        val win = text.substring(start, end)
        val out = ArrayList<Span>(spans.size)
        for (s in spans) {
            if (s.end <= start || s.start >= end) continue
            val a = max(s.start, start) - start
            val b = min(s.end, end) - start
            if (b > a) out.add(Span(a, b))
        }
        val prefix = if (start > 0) "…" else ""
        val suffix = if (end < text.length) "…" else ""
        val shift = prefix.length
        val shifted = out.map { Span(it.start + shift, it.end + shift) }
        return Snippet(prefix + win + suffix, shifted)
    }

    /* ---------------- 工具 ---------------- */

    companion object {
        private val WORD_RE = Regex("[a-z0-9_\\u0024]+(?:\\.[a-z0-9_\\u0024]+)*")
        private val QUERY_RE = Regex("\"([^\"]+)\"|'([^']+)'|\\S+")

        /** 结果筛选分组，与桌面版一致 */
        const val FILTER_ALL = "all"
        const val FILTER_API = "api"
        const val FILTER_VAR = "var"
        const val FILTER_LABEL = "label"
        const val FILTER_TEXT = "text"

        fun groupOfKind(kind: String?): String {
            if (kind.isNullOrEmpty()) return FILTER_API
            return when (kind) {
                "var", "data", "define", "default", "envvar", "option" -> FILTER_VAR
                "label" -> FILTER_LABEL
                "api", "function", "class", "method", "attribute", "property", "exception", "enum",
                "transform-property", "style-property", "screen-property", "text-tag", "describe" -> FILTER_API
                else -> FILTER_TEXT
            }
        }

        fun kindLabel(kind: String?): String = when (kind) {
            "function" -> "函数"
            "class" -> "类"
            "method" -> "方法"
            "attribute", "property" -> "属性"
            "var" -> "变量"
            "data" -> "数据"
            "define" -> "定义"
            "default" -> "默认值"
            "label" -> "标签"
            "exception" -> "异常"
            "enum" -> "枚举"
            "transform-property" -> "变换特性"
            "style-property" -> "样式特性"
            "screen-property" -> "界面特性"
            "text-tag" -> "文本标签"
            "envvar" -> "环境变量"
            "option" -> "选项"
            "describe" -> "说明"
            else -> "API"
        }

        fun isCjk(c: Char): Boolean =
            (c in '\u3400'..'\u4dbf') || (c in '\u4e00'..'\u9fff') || (c in '\uf900'..'\ufaff')

        fun normalizeWs(s: String?): String {
            if (s == null || s.isEmpty()) return ""
            val sb = StringBuilder(s.length)
            var space = false
            for (ch in s) {
                if (ch == ' ' || ch == '\t' || ch == '\n' || ch == '\r' || ch.isWhitespace()) {
                    space = true
                } else {
                    if (space && sb.isNotEmpty()) sb.append(' ')
                    space = false
                    sb.append(ch)
                }
            }
            return sb.toString()
        }

        private fun countChar(s: String, c: Char): Int {
            var n = 0
            for (ch in s) if (ch == c) n++
            return n
        }

        private fun wordSpans(text: String, word: String): List<Span> {
            val out = ArrayList<Span>(4)
            if (word.isEmpty()) return out
            val lower = text.lowercase()
            val w = word.lowercase()
            var i = 0
            while (i < lower.length) {
                val p = lower.indexOf(w, i)
                if (p == -1) break
                out.add(Span(p, p + w.length))
                i = p + 1
            }
            return out
        }

        private fun subseqPositions(text: String, needle: String): List<Int>? {
            val pos = ArrayList<Int>(needle.length)
            var ti = 0
            var i = 0
            while (i < text.length && ti < needle.length) {
                if (text[i] == needle[ti]) {
                    pos.add(i)
                    ti++
                }
                i++
            }
            return if (ti == needle.length) pos else null
        }

        private fun trigrams(s: String): List<String> {
            val out = ArrayList<String>(max(0, s.length - 2))
            var i = 0
            while (i + 3 <= s.length) {
                out.add(s.substring(i, i + 3))
                i++
            }
            return out
        }

        private fun levenshtein(a: String, b: String): Int {
            if (a == b) return 0
            val m = a.length
            val n = b.length
            if (m == 0) return n
            if (n == 0) return m
            var prev = IntArray(n + 1) { it }
            var cur = IntArray(n + 1)
            for (i in 1..m) {
                cur[0] = i
                for (j in 1..n) {
                    val cost = if (a[i - 1] == b[j - 1]) 0 else 1
                    cur[j] = minOf(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost)
                }
                val tmp = prev
                prev = cur
                cur = tmp
            }
            return prev[n]
        }
    }
}
