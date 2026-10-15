package fr.razhalpox.gt7engineer;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;

/** Déchiffrement (Salsa20) et lecture des paquets de télémétrie de GT7. Même logique que gt7_relais.py. */
public final class Gt7 {
    private Gt7() {}

    private static final int[] KEY = new int[8];
    static {
        byte[] k = "Simulator Interface Packet GT7 ver 0.0".getBytes(StandardCharsets.US_ASCII);
        ByteBuffer b = ByteBuffer.wrap(k, 0, 32).order(ByteOrder.LITTLE_ENDIAN);
        for (int i = 0; i < 8; i++) KEY[i] = b.getInt();
    }

    private static int rotl(int v, int c) { return (v << c) | (v >>> (32 - c)); }

    private static void block(int n0, int n1, long counter, byte[] out) {
        int[] s = {0x61707865, KEY[0], KEY[1], KEY[2], KEY[3], 0x3320646E, n0, n1,
                (int) counter, (int) (counter >>> 32), 0x79622D32, KEY[4], KEY[5], KEY[6], KEY[7], 0x6B206574};
        int[] x = s.clone();
        int[][] q = {{0, 4, 8, 12}, {5, 9, 13, 1}, {10, 14, 2, 6}, {15, 3, 7, 11},
                {0, 1, 2, 3}, {5, 6, 7, 4}, {10, 11, 8, 9}, {15, 12, 13, 14}};
        for (int r = 0; r < 10; r++) {
            for (int[] t : q) {
                int a = t[0], b = t[1], c = t[2], d = t[3];
                x[b] ^= rotl(x[a] + x[d], 7);
                x[c] ^= rotl(x[b] + x[a], 9);
                x[d] ^= rotl(x[c] + x[b], 13);
                x[a] ^= rotl(x[d] + x[c], 18);
            }
        }
        for (int i = 0; i < 16; i++) {
            int v = x[i] + s[i];
            out[i * 4] = (byte) v; out[i * 4 + 1] = (byte) (v >>> 8);
            out[i * 4 + 2] = (byte) (v >>> 16); out[i * 4 + 3] = (byte) (v >>> 24);
        }
    }

    /** XOR Salsa20 : sert à chiffrer comme à déchiffrer. */
    public static byte[] salsa20(int n0, int n1, byte[] data, int len) {
        byte[] out = new byte[len];
        byte[] ks = new byte[64];
        for (int blk = 0; blk * 64 < len; blk++) {
            block(n0, n1, blk, ks);
            int start = blk * 64;
            for (int i = 0; i < 64 && start + i < len; i++) out[start + i] = (byte) (data[start + i] ^ ks[i]);
        }
        return out;
    }

    /** Renvoie le paquet déchiffré, ou null si ce n'est pas un paquet GT7. */
    public static ByteBuffer decrypt(byte[] data, int len) {
        if (len < 0x128) return null;
        ByteBuffer in = ByteBuffer.wrap(data, 0, len).order(ByteOrder.LITTLE_ENDIAN);
        int iv1 = in.getInt(0x40);
        int iv2 = iv1 ^ 0xDEADBEAF;
        byte[] dec = salsa20(iv2, iv1, data, len);
        ByteBuffer p = ByteBuffer.wrap(dec).order(ByteOrder.LITTLE_ENDIAN);
        if (p.getInt(0) != 0x47375330) return null; // "G7S0"
        return p;
    }

    /** Une image de la télémétrie, au même format que le relais Python. */
    public static final class Frame {
        public double x, z, boost, oilP, rpm, fuel, fuelCap, speed, water, oil, throttle, brake;
        public double[] tyres = new double[4], slip = new double[4];
        public int pkt, lap, totalLaps, bestMs, lastMs, pos, cars, rpmLo, rpmHi, gear, gearSug, car;
        public boolean onTrack, paused, loading, revLimit, asm, tcs;
    }

    public static Frame parse(ByteBuffer p) {
        Frame f = new Frame();
        double v = p.getFloat(0x4C);
        f.x = p.getFloat(0x04); f.z = p.getFloat(0x0C);
        for (int i = 0; i < 4; i++) {
            double w = Math.abs(p.getFloat(0xA4 + i * 4));
            double r = p.getFloat(0xB4 + i * 4);
            f.slip[i] = (v < 3 || !(r > 0.1 && r < 1.0)) ? 0.0
                    : Math.round(Math.max(-100, Math.min(100, (w * r - v) / v * 100)) * 10) / 10.0;
            f.tyres[i] = p.getFloat(0x60 + i * 4);
        }
        f.boost = p.getFloat(0x50) - 1.0;
        f.oilP = p.getFloat(0x54);
        f.pkt = p.getInt(0x70);
        f.rpm = p.getFloat(0x3C);
        f.fuel = p.getFloat(0x44);
        f.fuelCap = p.getFloat(0x48);
        f.speed = v * 3.6;
        f.water = p.getFloat(0x58);
        f.oil = p.getFloat(0x5C);
        f.lap = p.getShort(0x74);
        f.totalLaps = p.getShort(0x76);
        f.bestMs = p.getInt(0x78);
        f.lastMs = p.getInt(0x7C);
        f.pos = p.getShort(0x84);
        f.cars = p.getShort(0x86);
        f.rpmLo = p.getShort(0x88);
        f.rpmHi = p.getShort(0x8A);
        int flags = p.getShort(0x8E) & 0xFFFF;
        int gear = p.get(0x90) & 0xFF;
        f.gear = gear & 0x0F;
        f.gearSug = gear >> 4;
        f.throttle = (p.get(0x91) & 0xFF) / 2.55;
        f.brake = (p.get(0x92) & 0xFF) / 2.55;
        f.onTrack = (flags & 1) != 0;
        f.paused = (flags & 2) != 0;
        f.loading = (flags & 4) != 0;
        f.revLimit = (flags & 32) != 0;
        f.asm = (flags & 1024) != 0;
        f.tcs = (flags & 2048) != 0;
        f.car = p.getInt(0x124);
        return f;
    }
}
