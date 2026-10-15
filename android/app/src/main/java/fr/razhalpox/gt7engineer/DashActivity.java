package fr.razhalpox.gt7engineer;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.graphics.Color;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.speech.tts.TextToSpeech;
import android.view.View;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.util.Locale;

/** Les écrans du Race Engineer (Pilote, Complet, Stratégie, Réglages), en plein écran. */
public class DashActivity extends Activity {
    public static final String EXTRA_PAGE = "page";
    private WebView web;
    private TextToSpeech tts;
    private boolean ttsReady;
    private final Handler handler = new Handler(Looper.getMainLooper());

    /** La voix de l'ingénieur : appelée par les pages à la place de la synthèse vocale du navigateur. */
    public class Voice {
        @JavascriptInterface
        public void speak(String text, float rate) {
            if (tts == null || !ttsReady) return;
            tts.setSpeechRate(Math.max(0.5f, Math.min(2f, rate)));
            tts.speak(text, TextToSpeech.QUEUE_ADD, null, "gt7-" + System.nanoTime());
        }

        @JavascriptInterface
        public void cancel() {
            if (tts != null) tts.stop();
        }
    }

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        TelemetryService.ensureWeb(this);

        tts = new TextToSpeech(this, status -> {
            if (status == TextToSpeech.SUCCESS) {
                int r = tts.setLanguage(Locale.FRANCE);
                if (r == TextToSpeech.LANG_MISSING_DATA || r == TextToSpeech.LANG_NOT_SUPPORTED) tts.setLanguage(Locale.FRENCH);
                ttsReady = true;
            }
        });

        web = new WebView(this);
        web.setBackgroundColor(Color.rgb(12, 15, 19));
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setCacheMode(WebSettings.LOAD_NO_CACHE);
        s.setTextZoom(100); // la taille de police du téléphone ne doit pas déformer les écrans
        web.addJavascriptInterface(new Voice(), "AndroidTTS");
        web.setWebViewClient(new WebViewClient() {
            @Override
            public void onReceivedError(WebView view, WebResourceRequest req, WebResourceError err) {
                // serveur pas encore prêt : on réessaie
                if (req.isForMainFrame()) handler.postDelayed(view::reload, 700);
            }
        });
        setContentView(web);
        String page = getIntent().getStringExtra(EXTRA_PAGE);
        web.loadUrl("http://127.0.0.1:" + WebServer.PORT + "/" + (page != null ? page : "pilote.html"));
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) immersive();
    }

    @SuppressWarnings("deprecation")
    private void immersive() {
        View d = getWindow().getDecorView();
        d.setSystemUiVisibility(View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN);
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) web.onResume();
    }

    @Override
    protected void onPause() {
        if (web != null) web.onPause();
        super.onPause();
    }

    @SuppressWarnings("deprecation")
    @Override
    public void onBackPressed() {
        finish(); // retour à l'écran d'accueil ; la réception continue
    }

    @Override
    protected void onDestroy() {
        if (tts != null) tts.shutdown();
        if (web != null) {
            web.loadUrl("about:blank");
            web.destroy();
        }
        super.onDestroy();
    }
}
