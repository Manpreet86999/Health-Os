package app.healthos.nativebridge

import org.junit.Assert.*
import org.junit.Test

class HealthPaginationTest {
    @Test fun nullAndEmptyAndBlankTerminatePagination() {
        assertNull(nextHealthPage(null, mutableSetOf()))
        assertNull(nextHealthPage("", mutableSetOf()))
        assertNull(nextHealthPage("  ", mutableSetOf()))
    }
    @Test fun validPagesContinueAndRepeatedCursorFails() {
        val seen = mutableSetOf<String>()
        assertEquals("page-two", nextHealthPage("page-two", seen))
        assertEquals("page-three", nextHealthPage("page-three", seen))
        assertNull(nextHealthPage("", seen))
        try { nextHealthPage("page-two", seen); fail("Repeated page must stop") } catch (expected: IllegalStateException) { }
    }
    @Test fun quotaDetectionFollowsWrappedCausesWithoutMisclassifyingOtherErrors() {
        assertTrue(isHealthQuotaError(Exception("wrapped", Exception("Rate limited request quota exceeded"))))
        assertFalse(isHealthQuotaError(Exception("provider is unavailable")))
    }
}
