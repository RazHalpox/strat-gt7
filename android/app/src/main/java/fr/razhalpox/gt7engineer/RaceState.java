package fr.razhalpox.gt7engineer;

import java.util.ArrayList;
import java.util.List;

/** État de la course : dernière image de télémétrie, tours terminés, conso, arrêts. */
public final class RaceState {
    private static final class Lap {
        int n, ms; Double fuel; boolean pit; double fuelEnd;
    }

    private Gt7.Frame live;
    private Long curMs;
    private final List<Lap> laps = new ArrayList<>();
    private long lastRx;
    public volatile String mode = "attente"; // attente | live | demo
    private Integer lap;
    private double lapFuel;
    private long lapT0;
    private boolean pit;
    private Double prevFuel;
    private boolean moved;       // la voiture a roulé depuis le début du tour
    private long stillSince = -1; // arrêtée depuis (arrêt au stand sans essence)
    private double minFuel = Double.NaN; // plus bas niveau de carburant du tour en cours

    public synchronized void reset(String newMode) {
        live = null; curMs = null; laps.clear(); lastRx = 0; lap = null; prevFuel = null; pit = false;
        moved = false; stillSince = -1; minFuel = Double.NaN;
        mode = newMode;
    }

    public synchronized void update(Gt7.Frame d, long now) {
        lastRx = System.currentTimeMillis(); // horloge réelle (en relecture, « now » est l'heure de la course enregistrée)
        // ravitaillement : le carburant remonte (GT7 remplit petit à petit : on compare au plus bas du tour)
        if (prevFuel != null && d.fuel > prevFuel + 0.5) pit = true;
        if (!Double.isNaN(minFuel) && d.fuel > minFuel + 0.5) pit = true;
        minFuel = Double.isNaN(minFuel) ? d.fuel : Math.min(minFuel, d.fuel);
        prevFuel = d.fuel;
        // arrêt au stand sans essence (pneus seuls) : voiture immobile plus de 3 s après avoir roulé
        if (d.speed > 30) moved = true;
        if (moved && d.speed < 1 && d.onTrack && !d.paused && !d.loading) {
            if (stillSince < 0) stillSince = now;
            else if (now - stillSince >= 3000) pit = true;
        } else stillSince = -1;
        if (d.lap <= 0 && lap != null && lap >= 1) {
            // tour 0 en pleine course (chargement, menu) : on garde l'historique
        } else if (lap == null || d.lap < lap) {          // nouvelle course
            laps.clear();
            lap = d.lap; lapFuel = d.fuel; lapT0 = now; pit = false;
            moved = false; stillSince = -1; minFuel = d.fuel;
        } else if (d.lap > lap) {                           // tour terminé
            if (lap >= 1 && d.lastMs > 0) {
                Lap l = new Lap();
                l.n = lap; l.ms = d.lastMs; l.pit = pit;
                l.fuel = pit ? null : Math.round(Math.max(0.0, lapFuel - d.fuel) * 1000) / 1000.0;
                l.fuelEnd = Math.round(d.fuel * 100) / 100.0;
                laps.add(l);
                while (laps.size() > 200) laps.remove(0);
            }
            lap = d.lap; lapFuel = d.fuel; lapT0 = now; pit = false;
            moved = d.speed > 30; stillSince = -1; minFuel = d.fuel;
        }
        curMs = (lapT0 > 0 && !d.paused) ? (now - lapT0) : null;
        live = d;
    }

    /** Télémétrie reçue il y a moins de 2,5 s. */
    public synchronized boolean isFresh() { return System.currentTimeMillis() - lastRx <= 2500; }

    static void num(StringBuilder b, double v) {
        if (Double.isNaN(v) || Double.isInfinite(v)) b.append("null"); else b.append(v);
    }

    static void arr(StringBuilder b, double[] a) {
        b.append('[');
        for (int i = 0; i < a.length; i++) { if (i > 0) b.append(','); num(b, a[i]); }
        b.append(']');
    }

    /** Champs d'une image de télémétrie, au même format que le relais Python (sans l'accolade de fin). */
    static void frameFields(StringBuilder b, Gt7.Frame d) {
        b.append("{\"x\":"); num(b, d.x);
        b.append(",\"z\":"); num(b, d.z);
        b.append(",\"slip\":"); arr(b, d.slip);
        b.append(",\"boost\":"); num(b, d.boost);
        b.append(",\"oil_p\":"); num(b, d.oilP);
        b.append(",\"pkt\":").append(d.pkt);
        b.append(",\"rpm\":"); num(b, d.rpm);
        b.append(",\"fuel\":"); num(b, d.fuel);
        b.append(",\"fuel_cap\":"); num(b, d.fuelCap);
        b.append(",\"speed\":"); num(b, d.speed);
        b.append(",\"water\":"); num(b, d.water);
        b.append(",\"oil\":"); num(b, d.oil);
        b.append(",\"tyres\":"); arr(b, d.tyres);
        b.append(",\"lap\":").append(d.lap);
        b.append(",\"total_laps\":").append(d.totalLaps);
        b.append(",\"best_ms\":").append(d.bestMs);
        b.append(",\"last_ms\":").append(d.lastMs);
        b.append(",\"pos\":").append(d.pos);
        b.append(",\"cars\":").append(d.cars);
        b.append(",\"rpm_lo\":").append(d.rpmLo);
        b.append(",\"rpm_hi\":").append(d.rpmHi);
        b.append(",\"gear\":").append(d.gear);
        b.append(",\"gear_sug\":").append(d.gearSug);
        b.append(",\"throttle\":"); num(b, d.throttle);
        b.append(",\"brake\":"); num(b, d.brake);
        b.append(",\"on_track\":").append(d.onTrack);
        b.append(",\"paused\":").append(d.paused);
        b.append(",\"loading\":").append(d.loading);
        b.append(",\"rev_limit\":").append(d.revLimit);
        b.append(",\"asm\":").append(d.asm);
        b.append(",\"tcs\":").append(d.tcs);
        b.append(",\"car\":").append(d.car);
    }

    /** Une image complète en JSON (enregistrement des courses). */
    static String frameJson(Gt7.Frame d, long t) {
        StringBuilder b = new StringBuilder(700);
        frameFields(b, d);
        b.append(",\"t\":").append(t).append('}');
        return b.toString();
    }

    /** Même JSON que le relais Python, envoyé 10 fois par seconde aux écrans. */
    public synchronized String snapshotJson() {
        long now = System.currentTimeMillis();
        boolean stale = now - lastRx > 2500;
        String m = stale && !"demo".equals(mode) && !"replay".equals(mode) ? "attente" : mode;
        StringBuilder b = new StringBuilder(4096);
        b.append("{\"mode\":\"").append(m).append("\",\"live\":");
        Gt7.Frame d = live;
        if (d == null) b.append("{}");
        else {
            frameFields(b, d);
            b.append(",\"cur_ms\":").append(curMs == null ? "null" : curMs.toString());
            b.append('}');
        }
        b.append(",\"laps\":[");
        for (int i = 0; i < laps.size(); i++) {
            Lap l = laps.get(i);
            if (i > 0) b.append(',');
            b.append("{\"n\":").append(l.n).append(",\"ms\":").append(l.ms).append(",\"fuel\":");
            if (l.fuel == null) b.append("null"); else num(b, l.fuel);
            b.append(",\"pit\":").append(l.pit).append(",\"fuel_end\":"); num(b, l.fuelEnd);
            b.append('}');
        }
        b.append("],\"t\":").append(now / 1000.0).append('}');
        return b.toString();
    }
}
