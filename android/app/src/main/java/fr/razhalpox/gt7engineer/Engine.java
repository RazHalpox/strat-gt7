package fr.razhalpox.gt7engineer;

import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.SocketTimeoutException;
import java.io.File;
import java.nio.ByteBuffer;
import java.util.Random;

/** Réception de la télémétrie PS5 (ou course simulée) et mise à jour de l'état de course. */
public final class Engine {
    public static final int PS5_SEND_PORT = 33739;  // port de la PS5 qui reçoit le « heartbeat »
    public static final int LOCAL_RECV_PORT = 33740; // port où la PS5 envoie la télémétrie

    public final RaceState state = new RaceState();
    private volatile boolean running;
    private Thread thread;
    private DatagramSocket sock;
    /** Adresse de la PS5 trouvée (utile quand on la cherche automatiquement). */
    public volatile String ps5Found = null;
    public volatile String error = null;
    /** Dossier des enregistrements (null = pas d'enregistrement). */
    public volatile File recBase = null;
    private Recorder rec;
    /** Relecture en cours : vitesse (1, 5, 20…) et fin atteinte. */
    public volatile double replaySpeed = 0;
    public volatile boolean replayDone = false;

    public synchronized void startPs5(final String ip) {
        stop();
        state.reset("attente");
        running = true;
        thread = new Thread(() -> ps5Loop(ip), "gt7-ps5");
        thread.setDaemon(true);
        thread.start();
    }

    public synchronized void startDemo() {
        stop();
        state.reset("demo");
        running = true;
        thread = new Thread(this::demoLoop, "gt7-demo");
        thread.setDaemon(true);
        thread.start();
    }

    /** Rejoue une course enregistrée comme si elle arrivait de la PS5. */
    public synchronized void startReplay(final File f, final double speed) {
        stop();
        state.reset("replay");
        running = true;
        replaySpeed = speed;
        replayDone = false;
        error = null;
        thread = new Thread(() -> {
            final long start = System.currentTimeMillis();
            try {
                Recorder.replay(f, speed, (fr, t) -> {
                    if (!running) return false;
                    state.mode = "replay";
                    state.update(fr, start + t); // l'heure de la course enregistrée, pour les chronos
                    return true;
                });
            } catch (Exception e) {
                error = "Relecture impossible : " + e.getMessage();
            }
            replayDone = true;
        }, "gt7-replay");
        thread.setDaemon(true);
        thread.start();
    }

    public synchronized void stop() {
        running = false;
        replaySpeed = 0;
        if (rec != null) { rec.close(); rec = null; }
        if (sock != null) sock.close();
        if (thread != null) thread.interrupt();
        thread = null;
        sock = null;
    }

    private void ps5Loop(String ip) {
        ps5Found = null;
        error = null;
        boolean auto = ip == null || ip.trim().isEmpty();
        try {
            DatagramSocket s = new DatagramSocket(null);
            s.setReuseAddress(true);
            s.setBroadcast(true);
            s.bind(new InetSocketAddress(LOCAL_RECV_PORT));
            s.setSoTimeout(1000);
            sock = s;
            InetAddress target = auto ? InetAddress.getByName("255.255.255.255") : InetAddress.getByName(ip.trim());
            byte[] hb = {'A'};
            byte[] buf = new byte[4096];
            long lastHb = 0;
            while (running) {
                long now = System.currentTimeMillis();
                if (now - lastHb > (ps5Found == null ? 2000 : 5000)) { // sans heartbeat régulier, la PS5 arrête d'envoyer
                    try {
                        s.send(new DatagramPacket(hb, 1, target, PS5_SEND_PORT));
                        error = null;
                    } catch (Exception e) {
                        error = "PS5 injoignable : " + e.getMessage();
                    }
                    lastHb = now;
                }
                DatagramPacket pk = new DatagramPacket(buf, buf.length);
                try {
                    s.receive(pk);
                } catch (SocketTimeoutException e) {
                    continue;
                }
                ByteBuffer dec = Gt7.decrypt(pk.getData(), pk.getLength());
                if (dec == null) continue;
                if (ps5Found == null) {
                    ps5Found = pk.getAddress().getHostAddress();
                    if (auto) target = pk.getAddress(); // ensuite, on parle directement à la PS5
                }
                state.mode = "live";
                Gt7.Frame fr = Gt7.parse(dec);
                long t = System.currentTimeMillis();
                state.update(fr, t);
                if (recBase != null) {
                    if (rec == null) rec = Recorder.create(recBase);
                    rec.write(fr, t);
                }
            }
        } catch (Exception e) {
            if (running) error = "Réception impossible : " + e.getMessage();
        }
    }

    /** Course simulée : tours de 25 s, conso 2,8 L/tour, arrêt tous les 9 tours. */
    private void demoLoop() {
        Random rnd = new Random();
        double fuel = 100.0, lapLen = 25.0;
        int lap = 1, best = 0, pkt = 0, lastMs = 0;
        long tLap = System.currentTimeMillis();
        while (running) {
            long now = System.currentTimeMillis();
            double ph = (now - tLap) / 1000.0 / lapLen;
            if (ph >= 1) {
                int ms = (int) (lapLen * 1000 * (4.15 + rnd.nextDouble() * 0.1)); // ~1:45 affiché
                best = best == 0 ? ms : Math.min(best, ms);
                lap++;
                tLap = now;
                if (lap % 9 == 0) fuel = 100.0;
                ph = 0;
                lastMs = ms;
            }
            fuel = Math.max(0.0, fuel - 2.8 * (0.05 / lapLen));
            double x = Math.sin(ph * 2 * Math.PI * 6);
            double speed = 150 + 90 * x;
            double ang = ph * 2 * Math.PI;
            double lock = (x < -0.85 && rnd.nextDouble() < 0.35) ? -(18 + rnd.nextDouble() * 17) : x < -0.6 ? -rnd.nextDouble() * 4 : 0.0;
            double spin = (x > 0.1 && x < 0.4 && rnd.nextDouble() < 0.25) ? 16 + rnd.nextDouble() * 14 : x > 0 ? rnd.nextDouble() * 5 : 0.0;
            double rpm = 5200 + 2300 * x;
            Gt7.Frame f = new Gt7.Frame();
            f.pkt = ++pkt; f.rpm = rpm; f.fuel = fuel; f.fuelCap = 100.0; f.speed = speed;
            f.water = 88.0; f.oil = 102.0;
            f.tyres = new double[]{78 + 9 * x, 80 + 8 * x, 74 + 6 * x, 75 + 7 * x};
            f.lap = lap; f.totalLaps = 0; f.bestMs = best; f.lastMs = lastMs;
            f.pos = 3; f.cars = 16; f.rpmLo = 6800; f.rpmHi = 7600;
            f.gear = Math.max(1, Math.min(6, (int) (speed / 45) + 1)); f.gearSug = 15;
            f.throttle = Math.max(0, Math.min(100, 60 + 45 * x));
            f.brake = x < -0.6 ? Math.max(0, Math.min(100, -80 * x)) : 0;
            f.onTrack = true; f.revLimit = rpm > 7400; f.tcs = x > 0.9;
            f.y = 6 * Math.sin(ang * 3); f.x = 600 * Math.cos(ang); f.z = 250 * Math.sin(ang * 2) * 0.6 + 300 * Math.sin(ang);
            f.slip = new double[]{r1(lock), r1(lock * 0.8), r1(spin * 0.4), r1(spin)};
            f.boost = Math.max(-0.6, 1.4 * x); f.oilP = 4.5 + x;
            state.update(f, now);
            try { Thread.sleep(50); } catch (InterruptedException e) { return; }
        }
    }

    private static double r1(double v) { return Math.round(v * 10) / 10.0; }
}
