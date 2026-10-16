package app.healthos.nativebridge

import android.app.Activity
import android.graphics.Color
import android.os.Bundle
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView

class HealthPrivacyActivity : Activity() {
    override fun onCreate(state: Bundle?) {
        super.onCreate(state)
        val layout = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(56, 88, 56, 56); setBackgroundColor(Color.rgb(8, 11, 9)) }
        layout.addView(TextView(this).apply { text = "Health OS · Health Connect"; textSize = 25f; setTextColor(Color.rgb(183, 255, 57)) })
        layout.addView(TextView(this).apply {
            text = "\nHealth OS reads only the categories you allow: steps, sleep, heart rate, resting heart rate, HRV, oxygen saturation, weight and active calories.\n\nReadings are stored with their source in your current Health OS account on this device and use your existing account sync. Background reads are optional and run only if your provider supports them and you grant permission.\n\nHealth OS does not write or change records in Health Connect. You can revoke access at any time in Health Connect settings. Disconnect stops future reads; previously imported Health OS history remains until you delete it. AI sharing follows the app’s existing consent controls.\n"
            textSize = 17f; setTextColor(Color.rgb(225, 234, 224))
        })
        layout.addView(Button(this).apply { text = "Return to Health OS"; setOnClickListener { finish() } })
        setContentView(layout)
    }
}
