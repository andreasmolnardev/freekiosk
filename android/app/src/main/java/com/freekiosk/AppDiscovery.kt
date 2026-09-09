package com.freekiosk

import android.content.Context
import android.content.pm.PackageManager

/** Shared catalogue of user-launchable Android applications. */
object AppDiscovery {
    data class AppInfo(val packageName: String, val appName: String)

    fun getApps(context: Context): List<AppInfo> {
        val pm = context.packageManager
        return pm.getInstalledApplications(PackageManager.GET_META_DATA)
            .mapNotNull { appInfo ->
                if (pm.getLaunchIntentForPackage(appInfo.packageName) == null) return@mapNotNull null
                val label = pm.getApplicationLabel(appInfo).toString().trim()
                if (label.isEmpty()) null else AppInfo(appInfo.packageName, label)
            }
            .sortedWith(compareBy(String.CASE_INSENSITIVE_ORDER) { it.appName })
    }
}
