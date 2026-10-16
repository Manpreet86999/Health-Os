package app.healthos.nativebridge

/** Pre-14 providers may return an empty string, not null, after the final page. */
internal fun nextHealthPage(token: String?, seen: MutableSet<String>): String? {
    val next = token?.takeIf { it.isNotBlank() } ?: return null
    check(seen.add(next)) { "Health Connect repeated a pagination token" }
    return next
}

internal class HealthReadPaused : Exception()
internal class HealthReadThrottled : Exception()
internal fun isHealthQuotaError(error: Throwable): Boolean = generateSequence(error) { it.cause }
    .any { it.message?.let { text -> text.contains("rate limit", true) || text.contains("quota", true) } == true }
