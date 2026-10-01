package com.qc.renpydocfinder

import android.content.Context
import androidx.appcompat.app.AppCompatDelegate

/** 语言与主题等偏好设置（与桌面版各自独立存储） */
class Prefs(context: Context) {

    private val sp = context.applicationContext.getSharedPreferences("renpydoc", Context.MODE_PRIVATE)

    var lang: String
        get() = if (sp.getString(KEY_LANG, "zh") == "en") "en" else "zh"
        set(value) = sp.edit().putString(KEY_LANG, if (value == "en") "en" else "zh").apply()

    var theme: String
        get() = sp.getString(KEY_THEME, THEME_LIGHT) ?: THEME_LIGHT
        set(value) = sp.edit().putString(KEY_THEME, value).apply()

    var lastCheck: Long
        get() = sp.getLong(KEY_LAST_CHECK, 0L)
        set(value) = sp.edit().putLong(KEY_LAST_CHECK, value).apply()

    fun applyTheme() {
        AppCompatDelegate.setDefaultNightMode(nightMode())
    }

    /** 当前主题偏好对应的夜间模式 */
    fun nightMode(): Int = when (theme) {
        THEME_LIGHT -> AppCompatDelegate.MODE_NIGHT_NO
        THEME_DARK -> AppCompatDelegate.MODE_NIGHT_YES
        else -> AppCompatDelegate.MODE_NIGHT_FOLLOW_SYSTEM
    }

    companion object {
        private const val KEY_LANG = "lang"
        private const val KEY_THEME = "theme"
        private const val KEY_LAST_CHECK = "lastCheck"

        const val THEME_AUTO = "auto"
        const val THEME_LIGHT = "light"
        const val THEME_DARK = "dark"
    }
}
