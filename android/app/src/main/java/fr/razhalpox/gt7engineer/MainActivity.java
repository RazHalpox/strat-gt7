package fr.razhalpox.gt7engineer;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.InputType;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.inputmethod.EditorInfo;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.util.Collections;

/** Écran d'accueil : adresse de la PS5, démarrage, mode démo, adresse pour un autre écran. */
public class MainActivity extends Activity {
    private static final int BG = Color.rgb(12, 15, 19), PANEL = Color.rgb(21, 26, 33), PANEL2 = Color.rgb(28, 35, 44),
            FG = Color.rgb(233, 237, 241), MUTED = Color.rgb(142, 153, 165), ACCENT = Color.rgb(232, 56, 79),
            OK = Color.rgb(61, 220, 132), WARN = Color.rgb(255, 200, 51);

    private EditText ipField;
    private TextView status, lanInfo;
    private Button startBtn, demoBtn, openBtn, stopBtn;
    private SharedPreferences prefs;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable tick = new Runnable() {
        @Override public void run() { refresh(); handler.postDelayed(this, 1000); }
    };

    private int dp(float v) {
        return (int) TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics());
    }

    private TextView text(String s, float sp, int color, boolean bold) {
        TextView t = new TextView(this);
        t.setText(s);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        t.setTextColor(color);
        if (bold) t.setTypeface(Typeface.DEFAULT_BOLD);
        return t;
    }

    private GradientDrawable round(int color, int strokeColor) {
        GradientDrawable g = new GradientDrawable();
        g.setColor(color);
        g.setCornerRadius(dp(8));
        if (strokeColor != 0) g.setStroke(dp(1), strokeColor);
        return g;
    }

    private Button button(String s, int bg, int fg) {
        Button b = new Button(this);
        b.setText(s);
        b.setAllCaps(false);
        b.setTextSize(TypedValue.COMPLEX_UNIT_SP, 17);
        b.setTypeface(Typeface.DEFAULT_BOLD);
        b.setTextColor(fg);
        b.setBackground(round(bg, bg == PANEL2 ? Color.rgb(58, 69, 83) : 0));
        b.setStateListAnimator(null);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(54));
        lp.topMargin = dp(10);
        b.setLayoutParams(lp);
        return b;
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        prefs = getSharedPreferences("cfg", MODE_PRIVATE);
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 1);
        }

        ScrollView scroll = new ScrollView(this);
        scroll.setBackgroundColor(BG);
        scroll.setFillViewport(true);
        LinearLayout outer = new LinearLayout(this);
        outer.setGravity(Gravity.CENTER_HORIZONTAL);
        scroll.addView(outer);
        LinearLayout col = new LinearLayout(this);
        col.setOrientation(LinearLayout.VERTICAL);
        col.setPadding(dp(20), dp(28), dp(20), dp(28));
        outer.addView(col, new LinearLayout.LayoutParams(Math.min(dp(520), getResources().getDisplayMetrics().widthPixels), LinearLayout.LayoutParams.WRAP_CONTENT));

        TextView title = text("GT7 Race Engineer", 28, FG, true);
        col.addView(title);
        col.addView(text("v1.3 · appli Android, sans PC", 14, MUTED, false));

        status = text("", 16, MUTED, true);
        status.setPadding(dp(14), dp(12), dp(14), dp(12));
        status.setBackground(round(PANEL, 0));
        LinearLayout.LayoutParams slp = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        slp.topMargin = dp(18);
        col.addView(status, slp);

        TextView ipLbl = text("Adresse IP de la PS5", 15, FG, true);
        ipLbl.setPadding(0, dp(22), 0, dp(6));
        col.addView(ipLbl);
        ipField = new EditText(this);
        ipField.setText(prefs.getString("ip", ""));
        ipField.setHint("Vide = recherche automatique");
        ipField.setHintTextColor(MUTED);
        ipField.setTextColor(FG);
        ipField.setTextSize(TypedValue.COMPLEX_UNIT_SP, 20);
        ipField.setSingleLine(true);
        ipField.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        ipField.setImeOptions(EditorInfo.IME_ACTION_DONE);
        ipField.setPadding(dp(14), dp(12), dp(14), dp(12));
        ipField.setBackground(round(PANEL2, Color.rgb(58, 69, 83)));
        col.addView(ipField, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));
        TextView help = text("Sur la PS5 : Paramètres › Réseau › Afficher l'état de la connexion › Adresse IPv4. "
                + "Laisse vide pour que l'appli cherche la PS5 toute seule (ça ne marche pas avec toutes les box).", 13, MUTED, false);
        help.setPadding(0, dp(6), 0, dp(4));
        col.addView(help);

        startBtn = button("Démarrer", ACCENT, Color.WHITE);
        demoBtn = button("Mode démo (sans PS5)", PANEL2, FG);
        openBtn = button("Ouvrir le dashboard", ACCENT, Color.WHITE);
        stopBtn = button("Arrêter la réception", PANEL2, FG);
        col.addView(startBtn);
        col.addView(demoBtn);
        col.addView(openBtn);
        col.addView(stopBtn);

        startBtn.setOnClickListener(v -> {
            String ip = ipField.getText().toString().trim();
            prefs.edit().putString("ip", ip).apply();
            TelemetryService.start(this, ip, false);
            openDash();
        });
        demoBtn.setOnClickListener(v -> {
            TelemetryService.start(this, "", true);
            openDash();
        });
        openBtn.setOnClickListener(v -> openDash());
        stopBtn.setOnClickListener(v -> { TelemetryService.stop(this); refresh(); });

        lanInfo = text("", 13, MUTED, false);
        lanInfo.setPadding(dp(14), dp(12), dp(14), dp(12));
        lanInfo.setBackground(round(PANEL, 0));
        LinearLayout.LayoutParams llp = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        llp.topMargin = dp(22);
        col.addView(lanInfo, llp);

        TextView foot = text("Le téléphone, la PS5 (et l'iPad) doivent être sur le même Wi-Fi. "
                + "La réception continue écran éteint : arrête-la ici ou depuis la notification.", 12, MUTED, false);
        foot.setPadding(0, dp(14), 0, 0);
        col.addView(foot);

        setContentView(scroll);
        TelemetryService.ensureWeb(this);
    }

    private void openDash() {
        startActivity(new Intent(this, DashActivity.class));
    }

    private static String lanIp() {
        try {
            for (NetworkInterface ni : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                if (!ni.isUp() || ni.isLoopback()) continue;
                for (InetAddress a : Collections.list(ni.getInetAddresses())) {
                    if (a instanceof Inet4Address && a.isSiteLocalAddress()) return a.getHostAddress();
                }
            }
        } catch (Exception ignored) {}
        return null;
    }

    private void refresh() {
        boolean on = TelemetryService.running;
        startBtn.setVisibility(on ? View.GONE : View.VISIBLE);
        demoBtn.setVisibility(on ? View.GONE : View.VISIBLE);
        ipField.setEnabled(!on);
        openBtn.setVisibility(on ? View.VISIBLE : View.GONE);
        stopBtn.setVisibility(on ? View.VISIBLE : View.GONE);

        Engine e = TelemetryService.ENGINE;
        String mode = e.state.mode;
        if (TelemetryService.webError != null) {
            status.setText("● " + TelemetryService.webError); status.setTextColor(ACCENT);
        } else if (!on) {
            status.setText("● Arrêté"); status.setTextColor(MUTED);
        } else if (TelemetryService.demo) {
            status.setText("● Mode démo en cours"); status.setTextColor(WARN);
        } else if (e.error != null) {
            status.setText("● " + e.error); status.setTextColor(ACCENT);
        } else if ("live".equals(mode) && e.state.isFresh()) {
            status.setText("● En direct · PS5 " + (e.ps5Found != null ? e.ps5Found : "")); status.setTextColor(OK);
        } else {
            status.setText(e.ps5Found == null ? "● Recherche de la PS5… lance une course ou un essai dans GT7"
                    : "● PS5 " + e.ps5Found + " · en attente (menu ou pause)");
            status.setTextColor(WARN);
        }

        String ip = lanIp();
        lanInfo.setText(ip == null ? "Connecte le téléphone au Wi-Fi pour recevoir la télémétrie."
                : "Autre écran (iPad, téléphone) sur le même Wi-Fi : ouvre http://" + ip + ":" + WebServer.PORT
                + "/pilote.html pendant que la réception tourne.");
    }

    @Override
    protected void onResume() {
        super.onResume();
        handler.post(tick);
    }

    @Override
    protected void onPause() {
        handler.removeCallbacks(tick);
        super.onPause();
    }
}
