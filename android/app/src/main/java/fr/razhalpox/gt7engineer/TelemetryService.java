package fr.razhalpox.gt7engineer;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;

import java.io.IOException;

/**
 * Garde la réception de la télémétrie active, même écran éteint ou appli en arrière-plan
 * (utile quand le téléphone sert de relais pour un iPad).
 */
public class TelemetryService extends Service {
    public static final String ACTION_START = "start";
    public static final String ACTION_STOP = "stop";
    private static final String CHANNEL = "telemetrie";

    public static final Engine ENGINE = new Engine();
    private static WebServer web;
    public static volatile boolean running;
    public static volatile boolean demo;
    public static volatile String webError;

    private WifiManager.WifiLock wifiLock;
    private PowerManager.WakeLock wakeLock;

    /** Démarre le serveur des écrans (une seule fois). */
    public static synchronized void ensureWeb(Context ctx) {
        if (web != null) return;
        final Context app = ctx.getApplicationContext();
        WebServer w = new WebServer(path -> app.getAssets().open("web/" + path), ENGINE.state);
        try {
            w.start();
            web = w;
            webError = null;
        } catch (IOException e) {
            webError = "Port " + WebServer.PORT + " occupé : " + e.getMessage();
        }
    }

    public static volatile boolean replay;

    /** Rejoue une course enregistrée (vitesse ×1, ×5, ×20…). */
    public static void startReplay(Context ctx, java.io.File f, double speed) {
        ensureWeb(ctx);
        ENGINE.startReplay(f, speed);
        demo = false;
        replay = true;
        running = true;
        Intent i = new Intent(ctx, TelemetryService.class).setAction(ACTION_START);
        if (Build.VERSION.SDK_INT >= 26) ctx.startForegroundService(i); else ctx.startService(i);
    }

    public static void start(Context ctx, String ip, boolean demoMode) {
        ensureWeb(ctx);
        replay = false;
        ENGINE.recBase = ctx.getApplicationContext().getFilesDir();
        if (demoMode) ENGINE.startDemo(); else ENGINE.startPs5(ip);
        demo = demoMode;
        running = true;
        Intent i = new Intent(ctx, TelemetryService.class).setAction(ACTION_START);
        if (Build.VERSION.SDK_INT >= 26) ctx.startForegroundService(i); else ctx.startService(i);
    }

    public static void stop(Context ctx) {
        ENGINE.stop();
        ENGINE.state.reset("attente");
        running = false;
        replay = false;
        ctx.startService(new Intent(ctx, TelemetryService.class).setAction(ACTION_STOP));
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent != null ? intent.getAction() : null;
        if (ACTION_STOP.equals(action) || !running) {
            ENGINE.stop();
            running = false;
            release();
            if (Build.VERSION.SDK_INT >= 24) stopForeground(STOP_FOREGROUND_REMOVE); else stopForeground(true);
            stopSelf();
            return START_NOT_STICKY;
        }
        Notification n = buildNotification();
        if (Build.VERSION.SDK_INT >= 34) startForeground(1, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
        else startForeground(1, n);
        acquire();
        return START_NOT_STICKY;
    }

    private Notification buildNotification() {
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= 26 && nm.getNotificationChannel(CHANNEL) == null) {
            NotificationChannel ch = new NotificationChannel(CHANNEL, "Télémétrie", NotificationManager.IMPORTANCE_LOW);
            ch.setDescription("Réception de la télémétrie GT7 en cours");
            nm.createNotificationChannel(ch);
        }
        int piFlags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0);
        PendingIntent open = PendingIntent.getActivity(this, 0, new Intent(this, DashActivity.class), piFlags);
        PendingIntent stop = PendingIntent.getService(this, 1,
                new Intent(this, TelemetryService.class).setAction(ACTION_STOP), piFlags);
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, CHANNEL) : new Notification.Builder(this);
        b.setSmallIcon(android.R.drawable.stat_sys_download_done)
                .setContentTitle("GT7 Race Engineer")
                .setContentText(demo ? "Mode démo en cours" : replay ? "Relecture d'une course enregistrée" : "Réception de la télémétrie de la PS5")
                .setContentIntent(open)
                .setOngoing(true)
                .addAction(new Notification.Action.Builder(null, "Arrêter", stop).build());
        return b.build();
    }

    @SuppressWarnings("deprecation")
    private void acquire() {
        if (wifiLock == null) {
            WifiManager wm = (WifiManager) getApplicationContext().getSystemService(Context.WIFI_SERVICE);
            if (wm != null) {
                int mode = Build.VERSION.SDK_INT >= 29 ? WifiManager.WIFI_MODE_FULL_LOW_LATENCY : WifiManager.WIFI_MODE_FULL_HIGH_PERF;
                wifiLock = wm.createWifiLock(mode, "gt7:wifi");
                wifiLock.setReferenceCounted(false);
                wifiLock.acquire();
            }
        }
        if (wakeLock == null) {
            PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
            if (pm != null) {
                wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "gt7:telemetrie");
                wakeLock.setReferenceCounted(false);
                wakeLock.acquire(12 * 60 * 60 * 1000L); // 12 h maximum
            }
        }
    }

    private void release() {
        if (wifiLock != null && wifiLock.isHeld()) wifiLock.release();
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        wifiLock = null;
        wakeLock = null;
    }

    @Override
    public void onDestroy() {
        release();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }
}
