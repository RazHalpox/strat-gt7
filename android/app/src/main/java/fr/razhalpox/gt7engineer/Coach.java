package fr.razhalpox.gt7engineer;

/**
 * Flux du Coach de tour : chaque image de la PS5 (60 par seconde), en version compacte.
 * L'écran /coach.html les reçoit par paquets toutes les 100 ms sur /coach. Même format que gt7_relais.py :
 * [t (ms), x, y, z, vitesse km/h, gaz %, frein %, tour, dernier tour (ms), rapport, drapeaux, régime]
 * drapeaux : 1 = en piste, 2 = pause, 4 = chargement.
 */
public final class Coach {
    private Coach() {}

    private static final int SIZE = 1200;              // 20 s d'avance : un écran en retard rattrape sans trou
    private static final String[] RING = new String[SIZE];
    private static long seq = 0;

    private static String r(double v, double k) {
        if (Double.isNaN(v) || Double.isInfinite(v)) return "0";
        double x = Math.round(v * k) / k;
        return x == Math.rint(x) ? Long.toString((long) x) : Double.toString(x);
    }

    public static void push(Gt7.Frame d, long t) {
        int flags = (d.onTrack ? 1 : 0) | (d.paused ? 2 : 0) | (d.loading ? 4 : 0);
        String s = "[" + t + "," + r(d.x, 100) + "," + r(d.y, 100) + "," + r(d.z, 100) + "," + r(d.speed, 100)
                + "," + r(d.throttle, 10) + "," + r(d.brake, 10) + "," + d.lap + "," + d.lastMs + "," + d.gear
                + "," + flags + "," + r(d.rpm, 1) + "]";
        synchronized (RING) {
            RING[(int) (seq % SIZE)] = s;
            seq++;
        }
    }

    public static long seq() { synchronized (RING) { return seq; } }

    /** Les images arrivées depuis « since » (au plus les 20 dernières secondes). Met à jour since[0]. */
    public static String since(long[] since, String mode) {
        StringBuilder b = new StringBuilder(4096);
        b.append("{\"mode\":\"").append(mode).append("\",\"s\":[");
        synchronized (RING) {
            long from = Math.max(since[0], seq - SIZE);
            for (long i = from; i < seq; i++) {
                if (i > from) b.append(',');
                b.append(RING[(int) (i % SIZE)]);
            }
            since[0] = seq;
        }
        return b.append("]}").toString();
    }
}
