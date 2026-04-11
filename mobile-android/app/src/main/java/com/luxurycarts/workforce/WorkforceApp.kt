package com.luxurycarts.workforce

import android.app.Application
import com.luxurycarts.workforce.data.AppDatabase
import com.luxurycarts.workforce.services.NtpTimeService
import com.luxurycarts.workforce.services.SessionManager

class WorkforceApp : Application() {

    lateinit var database: AppDatabase
        private set

    lateinit var sessionManager: SessionManager
        private set

    lateinit var ntpTimeService: NtpTimeService
        private set

    override fun onCreate() {
        super.onCreate()
        instance = this
        database = AppDatabase.getInstance(this)
        sessionManager = SessionManager(this)
        ntpTimeService = NtpTimeService(this)
    }

    companion object {
        lateinit var instance: WorkforceApp
            private set
    }
}
