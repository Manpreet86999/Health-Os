package app.healthos.nativebridge

import android.app.job.JobParameters
import android.app.job.JobService
import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.permission.HealthPermission
import kotlinx.coroutines.*
import org.json.JSONObject
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** The OS schedules reads; no foreground polling or sensitive auth tokens in a service. */
class HealthConnectJob : JobService() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var running: Job? = null
    override fun onStartJob(params: JobParameters): Boolean {
        running = scope.launch {
            var retry = false
            try {
                val prefs = getSharedPreferences("health-connect", 0); val owner = prefs.getString("owner", "")
                if (prefs.getBoolean("enabled", false) && !owner.isNullOrEmpty() && HealthConnectClient.getSdkStatus(this@HealthConnectJob, PROVIDER) == HealthConnectClient.SDK_AVAILABLE) {
                    val hc = HealthConnectClient.getOrCreate(this@HealthConnectJob, PROVIDER)
                    if (backgroundAvailable(hc) && HealthPermission.PERMISSION_READ_HEALTH_DATA_IN_BACKGROUND in hc.permissionController.getGrantedPermissions()) {
                        val data = readSnapshot(hc, 2)
                        // Account switches/disconnects cannot publish an in-flight result into another scope.
                        if (prefs.getBoolean("enabled", false) && prefs.getString("owner", "") == owner) {
                            HealthCache.write(this@HealthConnectJob, owner, data)
                            android.util.Log.i("HealthOSHealthConnect", "Background read completed: ${data.getJSONArray("values").length()} readings, ${data.getJSONArray("errors").length()} category errors")
                        }
                    }
                }
            } catch (e: SecurityException) { HealthCache.clear(this@HealthConnectJob) }
            catch (e: Exception) { retry = true }
            withContext(Dispatchers.Main) { jobFinished(params, retry) }
        }
        return true
    }
    override fun onStopJob(params: JobParameters): Boolean { running?.cancel(); return true }
    override fun onDestroy() { scope.cancel(); super.onDestroy() }
}

internal object HealthCache {
    private const val ALIAS = "health-os-health-connect-cache"
    @Synchronized private fun key(): SecretKey {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (store.getKey(ALIAS, null) as? SecretKey)?.let { return it }
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply {
            init(KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build())
        }.generateKey()
    }
    fun write(context: Context, owner: String, data: JSONObject) {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.ENCRYPT_MODE, key()) }
        val encrypted = cipher.doFinal(JSONObject().put("owner", owner).put("snapshot", data).toString().toByteArray(Charsets.UTF_8))
        context.getSharedPreferences("health-connect-cache", 0).edit().putString("data", Base64.encodeToString(cipher.iv + encrypted, Base64.NO_WRAP)).commit()
    }
    fun read(context: Context, owner: String): JSONObject? {
        val raw = context.getSharedPreferences("health-connect-cache", 0).getString("data", null) ?: return null
        return try {
            val bytes = Base64.decode(raw, Base64.NO_WRAP)
            val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, bytes.copyOfRange(0, 12))) }
            val decoded = JSONObject(String(cipher.doFinal(bytes.copyOfRange(12, bytes.size)), Charsets.UTF_8))
            if (decoded.optString("owner") == owner) decoded.getJSONObject("snapshot") else null
        } catch (e: Exception) { clear(context); null }
    }
    fun clear(context: Context) { context.getSharedPreferences("health-connect-cache", 0).edit().clear().commit() }
}
