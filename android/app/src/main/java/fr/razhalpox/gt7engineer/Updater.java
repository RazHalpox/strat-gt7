package fr.razhalpox.gt7engineer;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.content.pm.PackageInstaller;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * Mise à jour de l'appli depuis GitHub : lit version.json publié avec l'APK,
 * télécharge la nouvelle version et l'installe par-dessus (Android demande juste de confirmer).
 */
public final class Updater {
    private Updater() {}

    static final String BASE = "https://github.com/RazHalpox/strat-gt7/releases/download/android/";
    private static final Handler UI = new Handler(Looper.getMainLooper());
    private static volatile boolean busy;

    public static long installedCode(Context c) {
        try {
            PackageInfo pi = c.getPackageManager().getPackageInfo(c.getPackageName(), 0);
            return Build.VERSION.SDK_INT >= 28 ? pi.getLongVersionCode() : pi.versionCode;
        } catch (Exception e) { return 0; }
    }

    public static String installedName(Context c) {
        try { return c.getPackageManager().getPackageInfo(c.getPackageName(), 0).versionName; }
        catch (Exception e) { return "?"; }
    }

    private static byte[] get(String url, ProgressListener p) throws Exception {
        for (int hop = 0; hop < 5; hop++) {
            HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
            c.setConnectTimeout(10000);
            c.setReadTimeout(30000);
            c.setInstanceFollowRedirects(false);
            c.setRequestProperty("User-Agent", "GT7RaceEngineer");
            int code = c.getResponseCode();
            if (code >= 300 && code < 400) { url = c.getHeaderField("Location"); c.disconnect(); continue; }
            if (code != 200) throw new Exception("HTTP " + code);
            long total = c.getContentLengthLong();
            try (InputStream in = c.getInputStream()) {
                ByteArrayOutputStream bo = new ByteArrayOutputStream(total > 0 ? (int) total : 65536);
                byte[] b = new byte[65536];
                int n;
                long done = 0;
                while ((n = in.read(b)) > 0) {
                    bo.write(b, 0, n);
                    done += n;
                    if (p != null && total > 0) p.on((int) (done * 100 / total));
                }
                return bo.toByteArray();
            }
        }
        throw new Exception("trop de redirections");
    }

    interface ProgressListener { void on(int pct); }

    /** Vérifie en silence au lancement (au plus une fois toutes les 6 heures) et propose la mise à jour si elle existe. */
    public static void autoCheck(Activity a) {
        SharedPreferences sp = a.getSharedPreferences("cfg", Context.MODE_PRIVATE);
        long now = System.currentTimeMillis();
        if (now - sp.getLong("lastUpdateCheck", 0) < 6 * 3600 * 1000L) return;
        sp.edit().putLong("lastUpdateCheck", now).apply();
        check(a, true);
    }

    /** Vérifie s'il y a une nouvelle version. silent = pas de message si tout est à jour ou si GitHub ne répond pas. */
    public static void check(final Activity a, final boolean silent) {
        if (busy) return;
        busy = true;
        new Thread(() -> {
            try {
                JSONObject v = new JSONObject(new String(get(BASE + "version.json?t=" + System.currentTimeMillis(), null), "UTF-8"));
                final long remote = v.optLong("versionCode", 0);
                final String name = v.optString("versionName", "");
                final String notes = v.optString("notes", "");
                final long local = installedCode(a);
                UI.post(() -> {
                    busy = false;
                    if (a.isFinishing()) return;
                    if (remote > local) {
                        new AlertDialog.Builder(a)
                                .setTitle("Mise à jour disponible")
                                .setMessage("Version " + name + " (tu as la " + installedName(a) + ")."
                                        + (notes.isEmpty() ? "" : "\n\n" + notes)
                                        + "\n\nTes réglages et ta stratégie sont gardés.")
                                .setPositiveButton("Installer", (d, w) -> download(a))
                                .setNegativeButton("Plus tard", null)
                                .show();
                    } else if (!silent) {
                        new AlertDialog.Builder(a).setTitle("Appli à jour")
                                .setMessage("Tu as la dernière version (" + installedName(a) + ").")
                                .setPositiveButton("OK", null).show();
                    }
                });
            } catch (Exception e) {
                UI.post(() -> {
                    busy = false;
                    if (!silent && !a.isFinishing()) {
                        new AlertDialog.Builder(a).setTitle("Vérification impossible")
                                .setMessage("GitHub ne répond pas (" + e.getMessage() + "). Vérifie la connexion Internet et réessaie.")
                                .setPositiveButton("OK", null).show();
                    }
                });
            }
        }, "gt7-update-check").start();
    }

    private static void download(final Activity a) {
        // Android 8+ : l'appli doit être autorisée à installer des applis
        if (Build.VERSION.SDK_INT >= 26 && !a.getPackageManager().canRequestPackageInstalls()) {
            new AlertDialog.Builder(a)
                    .setTitle("Une autorisation à donner")
                    .setMessage("Pour s'installer toute seule, l'appli doit avoir le droit d'installer des applis. "
                            + "Active « Autoriser cette source » sur l'écran suivant, reviens, puis touche à nouveau Installer.")
                    .setPositiveButton("Ouvrir le réglage", (d, w) -> a.startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                            Uri.parse("package:" + a.getPackageName()))))
                    .setNegativeButton("Annuler", null)
                    .show();
            return;
        }
        final AlertDialog prog = new AlertDialog.Builder(a).setTitle("Téléchargement…").setMessage("0 %").setCancelable(false).show();
        new Thread(() -> {
            try {
                byte[] apk = get(BASE + "gt7-race-engineer.apk?t=" + System.currentTimeMillis(),
                        pct -> UI.post(() -> prog.setMessage(pct + " %")));
                UI.post(() -> prog.setMessage("Installation…"));
                install(a, apk);
                UI.post(prog::dismiss);
            } catch (Exception e) {
                UI.post(() -> {
                    prog.dismiss();
                    if (!a.isFinishing()) new AlertDialog.Builder(a).setTitle("Mise à jour impossible")
                            .setMessage(e.getMessage() + "\n\nTu peux aussi la télécharger depuis le lien habituel.")
                            .setPositiveButton("OK", null).show();
                });
            }
        }, "gt7-update-download").start();
    }

    private static void install(Context c, byte[] apk) throws Exception {
        PackageInstaller pi = c.getPackageManager().getPackageInstaller();
        PackageInstaller.SessionParams params = new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL);
        params.setAppPackageName(c.getPackageName());
        params.setSize(apk.length);
        int id = pi.createSession(params);
        try (PackageInstaller.Session s = pi.openSession(id)) {
            try (OutputStream out = s.openWrite("gt7-race-engineer.apk", 0, apk.length)) {
                out.write(apk);
                s.fsync(out);
            }
            int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 31 ? PendingIntent.FLAG_MUTABLE : 0);
            PendingIntent pIntent = PendingIntent.getBroadcast(c, id,
                    new Intent(c, InstallReceiver.class).setAction("fr.razhalpox.gt7engineer.INSTALL"), flags);
            s.commit(pIntent.getIntentSender());
        }
    }
}
