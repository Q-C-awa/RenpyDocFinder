package com.qc.renpydocfinder

/** 文档分节（id 与正文里的标题锚点一致） */
data class DocSection(val id: String, val title: String, val text: String)

/** API 词条：函数 / 类 / 变量 / 标签… */
data class DocTerm(val id: String, val name: String, val kind: String, val alias: Boolean)

/** 一页文档（不含正文 HTML，正文按需从 assets 读取） */
data class DocPage(
    val slug: String,
    val title: String,
    val source: String,
    val lang: String,
    val sections: List<DocSection>,
    val terms: List<DocTerm>
)

data class NavItem(val slug: String, val title: String)

data class NavGroup(val caption: String, val items: List<NavItem>)

data class DocMeta(
    val buildId: String,
    val generated: String,
    val zhVersion: String,
    val enVersion: String,
    val zhPages: Int,
    val enPages: Int,
    val zhLabel: String,
    val enLabel: String,
    val navZh: List<NavGroup>,
    val navEn: List<NavGroup>
) {
    fun nav(lang: String): List<NavGroup> = if (lang == "en") navEn else navZh
    fun pages(lang: String): Int = if (lang == "en") enPages else zhPages
    fun version(lang: String): String = if (lang == "en") enVersion else zhVersion
    fun label(lang: String): String = if (lang == "en") enLabel else zhLabel
}
