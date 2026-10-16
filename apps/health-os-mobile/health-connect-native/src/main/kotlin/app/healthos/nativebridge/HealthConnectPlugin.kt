package app.healthos.nativebridge

import android.app.Activity
import android.app.job.JobInfo
import android.app.job.JobScheduler
import android.content.ComponentName
import android.content.Intent
import android.net.Uri
import androidx.activity.result.ActivityResult
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.HealthConnectFeatures
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.*
import androidx.health.connect.client.request.AggregateRequest
import androidx.health.connect.client.request.AggregateGroupByPeriodRequest
import androidx.health.connect.client.aggregate.AggregateMetric
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import kotlinx.coroutines.*
import org.json.JSONArray
import org.json.JSONObject
import java.time.*
import kotlin.reflect.KClass

internal const val PROVIDER = "com.google.android.apps.healthdata"
internal const val JOB_ID = 71102
internal val readPermissions = setOf(
    HealthPermission.getReadPermission(StepsRecord::class),
    HealthPermission.getReadPermission(SleepSessionRecord::class),
    HealthPermission.getReadPermission(HeartRateVariabilityRmssdRecord::class),
    HealthPermission.getReadPermission(RestingHeartRateRecord::class),
    HealthPermission.getReadPermission(HeartRateRecord::class),
    HealthPermission.getReadPermission(OxygenSaturationRecord::class),
    HealthPermission.getReadPermission(WeightRecord::class),
    HealthPermission.getReadPermission(ActiveCaloriesBurnedRecord::class)
)
internal fun backgroundAvailable(client: HealthConnectClient) = client.features.getFeatureStatus(
    HealthConnectFeatures.FEATURE_READ_HEALTH_DATA_IN_BACKGROUND
) == HealthConnectFeatures.FEATURE_STATUS_AVAILABLE

@CapacitorPlugin(name = "HealthConnect")
class HealthConnectPlugin : Plugin() {
    private val jobs = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private fun run(call: PluginCall, action: suspend () -> JSONObject) {
        jobs.launch {
            try { val result = action(); withContext(Dispatchers.Main) { call.resolve(JSObject(result.toString())) } }
            catch (e: HealthReadPaused) { withContext(Dispatchers.Main) { call.reject("Health Connect will refresh when you return to Health OS.", "READ_PAUSED") } }
            catch (e: HealthReadThrottled) { withContext(Dispatchers.Main) { call.reject("Health Connect is temporarily limiting reads. Your saved readings remain available; sync will retry automatically.", "RATE_LIMITED") } }
            catch (e: SecurityException) { withContext(Dispatchers.Main) { call.reject("Health Connect permission changed. Review access and reconnect.", "PERMISSION_REVOKED") } }
            catch (e: Exception) { withContext(Dispatchers.Main) { call.reject("Health Connect could not complete this read. Please retry.", "HEALTH_CONNECT_READ_FAILED", e) } }
        }
    }
    private fun client() = HealthConnectClient.getOrCreate(context, PROVIDER)
    private suspend fun state(): JSONObject {
        val sdk = HealthConnectClient.getSdkStatus(context, PROVIDER)
        val state = JSONObject().put("sdkStatus", sdk).put("available", sdk == HealthConnectClient.SDK_AVAILABLE)
        if (sdk != HealthConnectClient.SDK_AVAILABLE) return state.put("permissions", JSONArray()).put("backgroundAvailable", false)
        val hc = client(); val granted = hc.permissionController.getGrantedPermissions()
        return state.put("permissions", JSONArray(granted.toList())).put("requestedPermissions", JSONArray(readPermissions.toList()))
            .put("backgroundAvailable", backgroundAvailable(hc))
            .put("backgroundGranted", HealthPermission.PERMISSION_READ_HEALTH_DATA_IN_BACKGROUND in granted)
            .put("retryAfter", context.getSharedPreferences("health-connect", 0).getLong("retryAfter", 0))
    }
    @PluginMethod fun status(call: PluginCall) = run(call) { state() }
    @PluginMethod fun connect(call: PluginCall) {
        if (HealthConnectClient.getSdkStatus(context, PROVIDER) != HealthConnectClient.SDK_AVAILABLE) {
            call.reject("Install or update Health Connect first.", "PROVIDER_UNAVAILABLE"); return
        }
        val permissions = readPermissions.toMutableSet()
        if (call.getBoolean("background", false) == true && backgroundAvailable(client())) permissions.add(HealthPermission.PERMISSION_READ_HEALTH_DATA_IN_BACKGROUND)
        val intent = PermissionController.createRequestPermissionResultContract(PROVIDER).createIntent(context, permissions)
        activity.runOnUiThread { startActivityForResult(call, intent, "permissionResult") }
    }
    @ActivityCallback private fun permissionResult(call: PluginCall?, result: ActivityResult) { if (call != null) run(call) { state() } }
    @PluginMethod fun read(call: PluginCall) = run(call) {
        val prefs = context.getSharedPreferences("health-connect", 0)
        if (prefs.getLong("retryAfter", 0) > System.currentTimeMillis()) throw HealthReadThrottled()
        val days = (call.getInt("days", 1) ?: 1).coerceIn(1, 28)
        try {
            readSnapshot(client(), days).also { prefs.edit().remove("retryAfter").remove("quotaFailures").apply() }
        } catch (e: HealthReadThrottled) {
            val failures = (prefs.getInt("quotaFailures", 0) + 1).coerceAtMost(4)
            val delay = (120000L * (1L shl (failures - 1))).coerceAtMost(900000L)
            prefs.edit().putInt("quotaFailures", failures).putLong("retryAfter", System.currentTimeMillis() + delay).apply()
            throw e
        }
    }
    @PluginMethod fun configure(call: PluginCall) = run(call) {
        val owner = call.getString("owner", "") ?: ""
        require(owner.matches(Regex("[a-f0-9]{64}"))) { "Account scope required" }
        val prefs = context.getSharedPreferences("health-connect", 0)
        if (prefs.getString("owner", "") != owner) HealthCache.clear(context)
        prefs.edit().putString("owner", owner).putBoolean("enabled", true).apply()
        val hc = client(); val granted = hc.permissionController.getGrantedPermissions()
        val scheduler = context.getSystemService(JobScheduler::class.java)
        if (backgroundAvailable(hc) && HealthPermission.PERMISSION_READ_HEALTH_DATA_IN_BACKGROUND in granted && readPermissions.any { it in granted }) {
            if (scheduler.getPendingJob(JOB_ID) == null) scheduler.schedule(JobInfo.Builder(JOB_ID, ComponentName(context, HealthConnectJob::class.java)).setPeriodic(15 * 60 * 1000L).setPersisted(true).build())
        } else scheduler.cancel(JOB_ID)
        state()
    }
    @PluginMethod fun cached(call: PluginCall) = run(call) {
        val owner = call.getString("owner", "") ?: ""
        val prefs = context.getSharedPreferences("health-connect", 0)
        if (!prefs.getBoolean("enabled", false) || prefs.getString("owner", "") != owner) JSONObject()
        else HealthCache.read(context, owner) ?: JSONObject()
    }
    @PluginMethod fun pause(call: PluginCall) = run(call) {
        val prefs = context.getSharedPreferences("health-connect", 0)
        if (prefs.getString("owner", "") == call.getString("owner", "")) {
            context.getSystemService(JobScheduler::class.java).cancel(JOB_ID)
            prefs.edit().clear().apply(); HealthCache.clear(context)
        }
        JSONObject()
    }
    @PluginMethod fun disconnect(call: PluginCall) = run(call) {
        context.getSystemService(JobScheduler::class.java).cancel(JOB_ID)
        context.getSharedPreferences("health-connect", 0).edit().clear().apply()
        HealthCache.clear(context)
        if (HealthConnectClient.getSdkStatus(context, PROVIDER) == HealthConnectClient.SDK_AVAILABLE) client().permissionController.revokeAllPermissions()
        state()
    }
    @PluginMethod fun openSettings(call: PluginCall) {
        try {
            val intent = if (HealthConnectClient.getSdkStatus(context, PROVIDER) == HealthConnectClient.SDK_AVAILABLE)
                HealthConnectClient.getHealthConnectManageDataIntent(context, PROVIDER)
            else Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=$PROVIDER"))
            activity.startActivity(intent); call.resolve()
        } catch (e: Exception) { call.reject("Health Connect settings are unavailable.") }
    }
    override fun handleOnDestroy() { jobs.cancel() }
}

/** Local-calendar days (including DST), provider deduplication and actual measurement units. */
internal suspend fun readSnapshot(hc: HealthConnectClient, days: Int): JSONObject {
    val granted = hc.permissionController.getGrantedPermissions()
    val backgroundAllowed = HealthPermission.PERMISSION_READ_HEALTH_DATA_IN_BACKGROUND in granted
    fun checkReadState() {
        if (backgroundAllowed) return
        val process = android.app.ActivityManager.RunningAppProcessInfo()
        android.app.ActivityManager.getMyMemoryState(process)
        if (process.importance > android.app.ActivityManager.RunningAppProcessInfo.IMPORTANCE_VISIBLE) throw HealthReadPaused()
    }
    checkReadState()
    val now = Instant.now(); val zone = ZoneId.systemDefault(); val today = now.atZone(zone).toLocalDate()
    val from = today.minusDays(days.toLong() - 1).atStartOfDay(zone).toInstant()
    val values = JSONArray(); val coverage = JSONArray(); val errors = JSONArray()
    fun permitted(type: KClass<out Record>) = HealthPermission.getReadPermission(type) in granted
    fun add(metric: String, value: Number, unit: String, time: Instant, source: String, id: String, extra: JSONObject = JSONObject()) {
        if (!value.toDouble().isFinite()) return
        values.put(JSONObject().put("metric", metric).put("value", value).put("unit", unit).put("timestamp", time.toString()).put("origin", source).put("sourceId", id).put("metadata", extra))
    }
    suspend fun safe(metric: String, block: suspend () -> Unit) {
        try { checkReadState(); block(); coverage.put(metric) } catch (e: SecurityException) { checkReadState(); throw e }
        catch (e: Exception) {
            if (e is CancellationException || e is HealthReadPaused || e is HealthReadThrottled) throw e
            checkReadState()
            if (isHealthQuotaError(e)) throw HealthReadThrottled()
            android.util.Log.e("HealthOSHealthConnect", "Read failed for $metric (${e.javaClass.simpleName})", e)
            errors.put(metric)
        }
    }
    suspend fun <T : Record> pages(type: KClass<T>, start: Instant = from, consume: (List<T>) -> Unit) {
        var token: String? = null; val seen = mutableSetOf<String>()
        do {
            checkReadState()
            val page = hc.readRecords(ReadRecordsRequest(type, TimeRangeFilter.between(start, now), pageToken = token))
            consume(page.records); token = nextHealthPage(page.pageToken, seen)
        } while (token != null)
    }
    suspend fun <T : Record> records(type: KClass<T>, start: Instant = from): List<T> {
        val result = mutableListOf<T>()
        pages(type, start) { result.addAll(it) }
        return result
    }
    val dailyMetrics = mutableSetOf<AggregateMetric<*>>()
    if (permitted(StepsRecord::class)) dailyMetrics.add(StepsRecord.COUNT_TOTAL)
    if (permitted(ActiveCaloriesBurnedRecord::class)) dailyMetrics.add(ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL)
    if (dailyMetrics.isNotEmpty()) safe("Daily totals") {
        val buckets = hc.aggregateGroupByPeriod(AggregateGroupByPeriodRequest(dailyMetrics,
            TimeRangeFilter.between(from.atZone(zone).toLocalDateTime(), now.atZone(zone).toLocalDateTime()), Period.ofDays(1)))
        for (bucket in buckets) {
            val day = bucket.startTime.toLocalDate(); val end = minOf(bucket.endTime.atZone(zone).toInstant(), now)
            val aggregate = bucket.result
            if (StepsRecord.COUNT_TOTAL in dailyMetrics) aggregate[StepsRecord.COUNT_TOTAL]?.let { total ->
                add("Steps", total, "steps", end.minusNanos(1), "Health Connect", "steps:$day", JSONObject().put("day", day.toString()).put("aggregation", "deduplicated daily total").put("origins", aggregate.dataOrigins.map { it.packageName }.sorted().joinToString(",")).put("zone", zone.id))
            }
            if (ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL in dailyMetrics) aggregate[ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL]?.let {
                add("Active Calories", it.inKilocalories, "kcal", end.minusNanos(1), "Health Connect", "active-calories:$day", JSONObject().put("day", day.toString()).put("aggregation", "provider daily total"))
            }
        }
        if (permitted(StepsRecord::class)) coverage.put("Steps")
        if (permitted(ActiveCaloriesBurnedRecord::class)) coverage.put("Active Calories")
    }
    if (permitted(SleepSessionRecord::class)) safe("Sleep") {
        val sleep = records(SleepSessionRecord::class, from.minus(Duration.ofHours(24)))
            .filter { !it.endTime.isAfter(now) && !it.endTime.isBefore(from) }
            .groupBy { it.endTime.atZone(zone).toLocalDate() }
        for ((day, sessions) in sleep) {
            val main = sessions.maxByOrNull { Duration.between(it.startTime, it.endTime).seconds } ?: continue
            val aggregate = hc.aggregate(AggregateRequest(setOf(SleepSessionRecord.SLEEP_DURATION_TOTAL), TimeRangeFilter.between(main.startTime, main.endTime)))
            aggregate[SleepSessionRecord.SLEEP_DURATION_TOTAL]?.let { duration ->
                val hours = duration.toMillis() / 3600000.0
                if (hours in 0.0..24.0) add("Sleep", hours, "h", main.endTime, "Health Connect", "sleep:$day", JSONObject().put("startTime", main.startTime.toString()).put("sessionId", main.metadata.id).put("aggregation", "main completed sleep session").put("origins", aggregate.dataOrigins.map { it.packageName }.sorted().joinToString(",")))
            }
        }
    }
    if (permitted(HeartRateVariabilityRmssdRecord::class)) safe("HRV") { records(HeartRateVariabilityRmssdRecord::class).groupBy { it.time.atZone(zone).toLocalDate() }.forEach { (_, rows) -> rows.maxByOrNull { it.time }?.let { add("HRV", it.heartRateVariabilityMillis, "ms", it.time, it.metadata.dataOrigin.packageName, it.metadata.id, JSONObject().put("method", "RMSSD")) } } }
    if (permitted(RestingHeartRateRecord::class)) safe("Resting HR") { records(RestingHeartRateRecord::class).groupBy { it.time.atZone(zone).toLocalDate() }.forEach { (_, rows) -> rows.maxByOrNull { it.time }?.let { add("Resting HR", it.beatsPerMinute, "bpm", it.time, it.metadata.dataOrigin.packageName, it.metadata.id) } } }
    if (permitted(WeightRecord::class)) safe("Weight") { records(WeightRecord::class).groupBy { it.time.atZone(zone).toLocalDate() }.forEach { (_, rows) -> rows.maxByOrNull { it.time }?.let { add("Weight", it.weight.inKilograms, "kg", it.time, it.metadata.dataOrigin.packageName, it.metadata.id) } } }
    if (permitted(OxygenSaturationRecord::class)) safe("Oxygen") { records(OxygenSaturationRecord::class).groupBy { it.time.atZone(zone).toLocalDate() }.forEach { (_, rows) -> rows.maxByOrNull { it.time }?.let { add("Oxygen", it.percentage.value, "%", it.time, it.metadata.dataOrigin.packageName, it.metadata.id) } } }
    if (permitted(HeartRateRecord::class)) safe("Heart Rate") {
        val latest = mutableMapOf<LocalDate, Pair<HeartRateRecord, HeartRateRecord.Sample>>()
        pages(HeartRateRecord::class) { page ->
            for (record in page) for (sample in record.samples) {
                val day = sample.time.atZone(zone).toLocalDate()
                if (latest[day]?.second?.time?.isBefore(sample.time) != false) latest[day] = record to sample
            }
        }
        latest.values.forEach { (record, sample) -> add("Heart Rate", sample.beatsPerMinute, "bpm", sample.time, record.metadata.dataOrigin.packageName, record.metadata.id) }
    }
    // No missing/null value becomes a fabricated zero. Successful coverage permits removal of stale provider rows.
    return JSONObject().put("values", values).put("coverage", coverage).put("errors", errors).put("from", from.toString()).put("to", now.toString()).put("syncedAt", now.toString()).put("zone", zone.id).put("permissions", JSONArray(granted.toList()))
}
