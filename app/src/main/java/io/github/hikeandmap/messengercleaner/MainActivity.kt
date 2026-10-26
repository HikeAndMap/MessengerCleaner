package io.github.hikeandmap.messengercleaner

import android.annotation.SuppressLint
import android.os.Bundle
import android.os.SystemClock
import android.view.KeyEvent
import android.view.MotionEvent
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import androidx.activity.ComponentActivity

/**
 * Loads facebook.com/messages in a WebView. You log in and open a chat by hand,
 * then tap "Unsend all": assets/unsend.js is injected. It loads the whole history, then walks
 * from the oldest message to the newest and unsends your own messages for everyone.
 */
class MainActivity : ComponentActivity() {
    private lateinit var web: WebView
    private lateinit var status: TextView

    /** Speed presets cycled by the button: label to pause factor (higher = faster, riskier). */
    private val speeds = listOf("Careful" to 1.0, "Normal" to 1.5, "Fast" to 2.0)
    private var speedIndex = 2

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        web = WebView(this).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            // Desktop UA: the mobile site has no per-message menu to automate.
            settings.userAgentString =
                "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) " +
                    "Chrome/126.0.0.0 Safari/537.36"
            settings.useWideViewPort = true
            settings.loadWithOverviewMode = true
            settings.setSupportZoom(true)
            settings.builtInZoomControls = true
            settings.displayZoomControls = false
            webViewClient = WebViewClient()
            webChromeClient = WebChromeClient()
            addJavascriptInterface(Bridge(), "Android")
            loadUrl("https://www.facebook.com/messages/")
        }

        status = TextView(this).apply {
            text = "Log in, open a chat, then tap Unsend all."
            setPadding(16, 8, 16, 8)
        }
        val start = Button(this).apply {
            text = "Unsend all"
            setOnClickListener {
                web.evaluateJavascript(
                    loadScript() + "\nwindow.__mc.setSpeed(${speeds[speedIndex].second});\nwindow.__mc.start();", null,
                )
            }
        }
        val speed = Button(this).apply {
            text = "Speed: ${speeds[speedIndex].first}"
            setOnClickListener {
                speedIndex = (speedIndex + 1) % speeds.size
                text = "Speed: ${speeds[speedIndex].first}"
            }
        }
        val stop = Button(this).apply {
            text = "Stop"
            setOnClickListener { web.evaluateJavascript("window.__mc && window.__mc.stop();", null) }
        }
        val bar = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            addView(start, LinearLayout.LayoutParams(0, -2, 1.2f))
            addView(speed, LinearLayout.LayoutParams(0, -2, 1.2f))
            addView(stop, LinearLayout.LayoutParams(0, -2, 0.8f))
        }
        setContentView(LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            addView(web, LinearLayout.LayoutParams(-1, 0, 1f))
            addView(status)
            addView(bar)
        })
    }

    private fun loadScript() = assets.open("unsend.js").bufferedReader().use { it.readText() }

    inner class Bridge {
        @JavascriptInterface
        fun report(msg: String) {
            runOnUiThread { status.text = msg }
        }

        @JavascriptInterface
        fun viewSize(): String = "${web.width},${web.height}"

        /** Real touch tap at (x, y) in WebView pixels; Facebook ignores script-made clicks on some buttons. */
        @JavascriptInterface
        fun tap(x: Double, y: Double) {
            runOnUiThread {
                val down = SystemClock.uptimeMillis()
                val d = MotionEvent.obtain(down, down, MotionEvent.ACTION_DOWN, x.toFloat(), y.toFloat(), 0)
                web.dispatchTouchEvent(d)
                d.recycle()
                web.postDelayed({
                    val u = MotionEvent.obtain(down, SystemClock.uptimeMillis(), MotionEvent.ACTION_UP, x.toFloat(), y.toFloat(), 0)
                    web.dispatchTouchEvent(u)
                    u.recycle()
                }, 60)
            }
        }

        @JavascriptInterface
        fun escape() {
            runOnUiThread {
                web.dispatchKeyEvent(KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_ESCAPE))
                web.dispatchKeyEvent(KeyEvent(KeyEvent.ACTION_UP, KeyEvent.KEYCODE_ESCAPE))
            }
        }
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (web.canGoBack()) web.goBack() else super.onBackPressed()
    }
}
