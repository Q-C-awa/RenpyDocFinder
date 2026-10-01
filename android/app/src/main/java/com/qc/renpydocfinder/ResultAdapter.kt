package com.qc.renpydocfinder

import android.graphics.Typeface
import android.text.Spannable
import android.text.SpannableString
import android.text.style.BackgroundColorSpan
import android.text.style.StyleSpan
import android.view.LayoutInflater
import android.view.ViewGroup
import androidx.recyclerview.widget.RecyclerView
import com.qc.renpydocfinder.databinding.ItemResultBinding
import kotlin.math.min
import kotlin.math.roundToInt

/** 结果行：API 词条命中 或 正文章节命中 */
sealed class ResultRow {
    data class Term(val page: DocPage, val term: DocTerm, val score: Double) : ResultRow()
    data class Section(
        val page: DocPage,
        val section: DocSection,
        val score: Double,
        val snippet: SearchEngine.Snippet
    ) : ResultRow()
}

class ResultAdapter(private val onClick: (ResultRow) -> Unit) :
    RecyclerView.Adapter<ResultAdapter.Holder>() {

    private val rows = ArrayList<ResultRow>()

    fun submit(list: List<ResultRow>) {
        rows.clear()
        rows.addAll(list)
        notifyDataSetChanged()
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): Holder {
        val binding = ItemResultBinding.inflate(LayoutInflater.from(parent.context), parent, false)
        return Holder(binding)
    }

    override fun getItemCount(): Int = rows.size

    override fun onBindViewHolder(holder: Holder, position: Int) {
        holder.bind(rows[position])
    }

    inner class Holder(private val b: ItemResultBinding) : RecyclerView.ViewHolder(b.root) {

        fun bind(row: ResultRow) {
            val ctx = b.root.context
            when (row) {
                is ResultRow.Term -> {
                    val aliasSuffix = if (row.term.alias) " · EN" else ""
                    b.kindBadge.text = SearchEngine.kindLabel(row.term.kind) + aliasSuffix
                    b.kindBadge.backgroundTintList = android.content.res.ColorStateList.valueOf(
                        androidx.core.content.ContextCompat.getColor(
                            ctx,
                            when (SearchEngine.groupOfKind(row.term.kind)) {
                                SearchEngine.FILTER_VAR -> R.color.badge_var
                                SearchEngine.FILTER_LABEL -> R.color.badge_label
                                else -> R.color.badge_api
                            }
                        )
                    )
                    b.titleText.text = row.term.name
                    b.titleText.typeface = Typeface.MONOSPACE
                    b.breadText.text = row.page.title + " › " + (if (row.term.id.isNotEmpty()) row.term.id else row.term.name)
                    b.snipText.visibility = android.view.View.GONE
                    b.footLeft.text = "API 词条命中"
                    b.footRight.text = "查看定义"
                }
                is ResultRow.Section -> {
                    b.kindBadge.text = "章节"
                    b.kindBadge.backgroundTintList = android.content.res.ColorStateList.valueOf(
                        androidx.core.content.ContextCompat.getColor(ctx, R.color.badge_page)
                    )
                    b.titleText.text = row.page.title
                    b.titleText.typeface = Typeface.DEFAULT_BOLD
                    b.breadText.text = row.page.title + " › " + row.section.title
                    b.snipText.visibility = android.view.View.VISIBLE
                    b.snipText.text = highlight(ctx, row.snippet)
                    b.footLeft.text = "相关度 " + min(99, row.score.roundToInt())
                    b.footRight.text = "查看"
                }
            }
            b.root.setOnClickListener { onClick(row) }
        }
    }

    private fun highlight(ctx: android.content.Context, snippet: SearchEngine.Snippet): CharSequence {
        val cs = SpannableString(snippet.text)
        val mark = androidx.core.content.ContextCompat.getColor(ctx, R.color.md_mark)
        for (span in snippet.spans) {
            if (span.start < 0 || span.end > cs.length || span.end <= span.start) continue
            cs.setSpan(
                BackgroundColorSpan(mark), span.start, span.end,
                Spannable.SPAN_EXCLUSIVE_EXCLUSIVE
            )
            cs.setSpan(
                StyleSpan(Typeface.BOLD), span.start, span.end,
                Spannable.SPAN_EXCLUSIVE_EXCLUSIVE
            )
        }
        return cs
    }
}
