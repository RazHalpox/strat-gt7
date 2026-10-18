package fr.razhalpox.gt7engineer;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStreamWriter;
import java.io.Writer;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Arrays;
import java.util.Date;
import java.util.Locale;
import java.util.zip.GZIPInputStream;
import java.util.zip.GZIPOutputStream;

/**
 * Enregistre la télémétrie reçue (10 images par seconde, environ 1 Mo par heure de course)
 * pour pouvoir rejouer la course ensuite. Même format que le relais PC : une image JSON par ligne, compressé.
 */
public final class Recorder {
    private static final int KEEP = 10;
    private final File file;
    private Writer out;
    private long t0 = -1, lastT = -1000, lastFlush;

    private Recorder(File f) { file = f; }

    public static File dir(File base) {
        File d = new File(base, "enregistrements");
        if (!d.exists()) d.mkdirs();
        return d;
    }

    /** Les enregistrements, le plus récent d'abord. */
    public static File[] list(File base) {
        File[] fs = dir(base).listFiles((d, n) -> n.endsWith(".jsonl.gz"));
        if (fs == null) return new File[0];
        Arrays.sort(fs, (a, b) -> Long.compare(b.lastModified(), a.lastModified()));
        return fs;
    }

    public static File latest(File base) {
        File[] fs = list(base);
        for (File f : fs) if (f.length() > 200) return f;
        return null;
    }

    public static Recorder create(File base) {
        File[] old = list(base);
        for (int i = KEEP - 1; i < old.length; i++) old[i].delete(); // on garde les 10 derniers
        String name = "course-" + new SimpleDateFormat("yyyyMMdd-HHmmss", Locale.FRANCE).format(new Date()) + ".jsonl.gz";
        return new Recorder(new File(dir(base), name));
    }

    /** Ajoute une image (au plus 10 par seconde). */
    public synchronized void write(Gt7.Frame d, long now) {
        if (t0 < 0) t0 = now;
        long t = now - t0;
        if (t - lastT < 95) return;
        lastT = t;
        try {
            if (out == null) out = new OutputStreamWriter(new GZIPOutputStream(new FileOutputStream(file), 8192, true), StandardCharsets.UTF_8);
            out.write(RaceState.frameJson(d, t));
            out.write('\n');
            if (now - lastFlush > 5000) { out.flush(); lastFlush = now; } // un arrêt brutal de l'appli ne perd que 5 s
        } catch (IOException e) {
            close();
        }
    }

    public synchronized void close() {
        try { if (out != null) out.close(); } catch (IOException ignored) {}
        out = null;
    }

    /** Relit un enregistrement : appelle « sink » pour chaque image au rythme d'origine, accéléré par « speed ». */
    public interface Sink { boolean frame(Gt7.Frame f, long t); }

    public static void replay(File f, double speed, Sink sink) throws IOException {
        try (BufferedReader r = new BufferedReader(new InputStreamReader(new GZIPInputStream(new FileInputStream(f)), StandardCharsets.UTF_8))) {
            String line;
            long prev = -1;
            while (true) {
                try { line = r.readLine(); } catch (IOException e) { break; } // fichier coupé (appli arrêtée) : on s'arrête là
                if (line == null) break;
                if (line.isEmpty()) continue;
                Gt7.Frame fr;
                long t;
                try {
                    JSONObject o = new JSONObject(line);
                    t = o.optLong("t", prev < 0 ? 0 : prev + 100);
                    fr = fromJson(o);
                } catch (Exception e) { continue; }
                if (prev >= 0 && t > prev) {
                    long wait = (long) ((t - prev) / Math.max(0.1, speed));
                    if (wait > 0) {
                        try { Thread.sleep(Math.min(wait, 3000)); } catch (InterruptedException e) { return; }
                    }
                }
                prev = t;
                if (!sink.frame(fr, t)) return;
            }
        }
    }

    private static double[] arr4(JSONArray a) {
        double[] v = new double[4];
        if (a != null) for (int i = 0; i < 4 && i < a.length(); i++) v[i] = a.optDouble(i, 0);
        return v;
    }

    static Gt7.Frame fromJson(JSONObject o) {
        Gt7.Frame f = new Gt7.Frame();
        f.x = o.optDouble("x", 0); f.y = o.optDouble("y", 0); f.z = o.optDouble("z", 0);
        f.slip = arr4(o.optJSONArray("slip")); f.tyres = arr4(o.optJSONArray("tyres"));
        f.boost = o.optDouble("boost", Double.NaN); f.oilP = o.optDouble("oil_p", 0);
        f.pkt = o.optInt("pkt"); f.rpm = o.optDouble("rpm", 0); f.fuel = o.optDouble("fuel", 0); f.fuelCap = o.optDouble("fuel_cap", 100);
        f.speed = o.optDouble("speed", 0); f.water = o.optDouble("water", 0); f.oil = o.optDouble("oil", 0);
        f.lap = o.optInt("lap"); f.totalLaps = o.optInt("total_laps"); f.bestMs = o.optInt("best_ms"); f.lastMs = o.optInt("last_ms");
        f.pos = o.optInt("pos"); f.cars = o.optInt("cars"); f.rpmLo = o.optInt("rpm_lo"); f.rpmHi = o.optInt("rpm_hi");
        f.gear = o.optInt("gear"); f.gearSug = o.optInt("gear_sug"); f.throttle = o.optDouble("throttle", 0); f.brake = o.optDouble("brake", 0);
        f.onTrack = o.optBoolean("on_track", true); f.paused = o.optBoolean("paused"); f.loading = o.optBoolean("loading");
        f.revLimit = o.optBoolean("rev_limit"); f.asm = o.optBoolean("asm"); f.tcs = o.optBoolean("tcs"); f.car = o.optInt("car");
        return f;
    }
}
