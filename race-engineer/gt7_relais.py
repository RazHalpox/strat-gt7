# -*- coding: utf-8 -*-
"""
GT7 Race Engineer - programme relais pour PC Windows.

Recoit la telemetrie de Gran Turismo 7 envoyee par la PS5 sur le reseau local,
la dechiffre, et l'envoie en direct au dashboard ouvert sur ton telephone.

Aucune installation a part Python 3 : tout est dans ce fichier.

Lancement :  double-clic sur lancer.bat
Mode demo :  double-clic sur lancer-demo.bat (donnees simulees, sans PS5)
"""
import json
import math
import os
import random
import socket
import struct
import sys
import threading
import time
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler

HTTP_PORT = 8777            # le dashboard s'ouvre sur http://IP-DU-PC:8777
PS5_SEND_PORT = 33739       # port de la PS5 qui recoit le "heartbeat"
LOCAL_RECV_PORT = 33740     # port du PC qui recoit la telemetrie
HERE = os.path.dirname(os.path.abspath(__file__))
WEB_DIR = os.path.join(HERE, "web")
CONFIG = os.path.join(HERE, "config.json")

# --------------------------------------------------------------------------
# Salsa20 (dechiffrement des paquets GT7), en Python pur
# --------------------------------------------------------------------------
GT7_KEY = b"Simulator Interface Packet GT7 ver 0.0"[:32]
MASK = 0xFFFFFFFF


def _rotl(v, c):
    return ((v << c) & MASK) | (v >> (32 - c))


def _salsa20_block(key_words, nonce_words, counter):
    c = (0x61707865, 0x3320646E, 0x79622D32, 0x6B206574)  # "expand 32-byte k"
    s = [c[0], *key_words[:4], c[1], nonce_words[0], nonce_words[1],
         counter & MASK, (counter >> 32) & MASK, c[2], *key_words[4:], c[3]]
    x = s[:]
    for _ in range(10):
        for a, b, cc, d in ((0, 4, 8, 12), (5, 9, 13, 1), (10, 14, 2, 6), (15, 3, 7, 11),
                            (0, 1, 2, 3), (5, 6, 7, 4), (10, 11, 8, 9), (15, 12, 13, 14)):
            x[b] ^= _rotl((x[a] + x[d]) & MASK, 7)
            x[cc] ^= _rotl((x[b] + x[a]) & MASK, 9)
            x[d] ^= _rotl((x[cc] + x[b]) & MASK, 13)
            x[a] ^= _rotl((x[d] + x[cc]) & MASK, 18)
    return struct.pack("<16I", *[(x[i] + s[i]) & MASK for i in range(16)])


def salsa20_xor(key, nonce, data):
    kw = struct.unpack("<8I", key)
    nw = struct.unpack("<2I", nonce)
    out = bytearray(len(data))
    for blk in range((len(data) + 63) // 64):
        ks = _salsa20_block(kw, nw, blk)
        start = blk * 64
        chunk = data[start:start + 64]
        for i, b in enumerate(chunk):
            out[start + i] = b ^ ks[i]
    return bytes(out)


def decrypt_gt7(data):
    if len(data) < 0x128:
        return None
    iv1 = struct.unpack_from("<I", data, 0x40)[0]
    iv2 = iv1 ^ 0xDEADBEAF
    nonce = struct.pack("<II", iv2, iv1)
    dec = salsa20_xor(GT7_KEY, nonce, data)
    if struct.unpack_from("<I", dec, 0)[0] != 0x47375330:  # "G7S0"
        return None
    return dec


def parse_gt7(p):
    f = lambda off: struct.unpack_from("<f", p, off)[0]
    i32 = lambda off: struct.unpack_from("<i", p, off)[0]
    i16 = lambda off: struct.unpack_from("<h", p, off)[0]
    flags = struct.unpack_from("<H", p, 0x8E)[0]
    gear = p[0x90]
    v = f(0x4C)                                   # vitesse de la voiture, m/s
    radius = [f(0xB4), f(0xB8), f(0xBC), f(0xC0)]  # rayon des pneus, m
    wheel = [abs(f(0xA4)), abs(f(0xA8)), abs(f(0xAC)), abs(f(0xB0))]  # rotation des roues, rad/s
    return {
        "x": f(0x04), "z": f(0x0C),
        "slip": wheel_slip(wheel, radius, v),
        "boost": f(0x50) - 1.0,
        "oil_p": f(0x54),
        "pkt": i32(0x70),
        "rpm": f(0x3C),
        "fuel": f(0x44),
        "fuel_cap": f(0x48),
        "speed": f(0x4C) * 3.6,
        "water": f(0x58),
        "oil": f(0x5C),
        "tyres": [f(0x60), f(0x64), f(0x68), f(0x6C)],
        "lap": i16(0x74),
        "total_laps": i16(0x76),
        "best_ms": i32(0x78),
        "last_ms": i32(0x7C),
        "pos": i16(0x84),
        "cars": i16(0x86),
        "rpm_lo": i16(0x88),
        "rpm_hi": i16(0x8A),
        "gear": gear & 0x0F,
        "gear_sug": gear >> 4,
        "throttle": p[0x91] / 2.55,
        "brake": p[0x92] / 2.55,
        "on_track": bool(flags & 1),
        "paused": bool(flags & 2),
        "loading": bool(flags & 4),
        "rev_limit": bool(flags & 32),
        "asm": bool(flags & 1024),
        "tcs": bool(flags & 2048),
        "car": i32(0x124),
    }


def wheel_slip(wheel, radius, v):
    """Glissement de chaque roue en % : negatif = blocage (roue plus lente que la voiture),
    positif = patinage (roue plus rapide). 0 a l'arret ou a tres basse vitesse."""
    out = []
    for w, r in zip(wheel, radius):
        if v < 3 or not (0.1 < r < 1.0):
            out.append(0.0)
        else:
            out.append(round(max(-100.0, min(100.0, (w * r - v) / v * 100)), 1))
    return out


# --------------------------------------------------------------------------
# Etat de la course : tours, conso, arrets
# --------------------------------------------------------------------------
class RaceState:
    def __init__(self):
        self.lock = threading.Lock()
        self.live = {}
        self.laps = []           # historique des tours termines
        self.last_rx = 0.0
        self.mode = "attente"    # attente | live | demo
        self._lap = None
        self._lap_fuel = None
        self._lap_t0 = None
        self._pit = False
        self._prev_fuel = None

    def update(self, d, now=None):
        now = now or time.time()
        with self.lock:
            self.last_rx = now
            lap = d["lap"]
            fuel = d["fuel"]
            # ravitaillement : le carburant remonte
            if self._prev_fuel is not None and fuel > self._prev_fuel + 0.5:
                self._pit = True
            self._prev_fuel = fuel
            if self._lap is None or lap < self._lap:     # nouvelle course
                self.laps = []
                self._lap, self._lap_fuel, self._lap_t0, self._pit = lap, fuel, now, False
            elif lap > self._lap:                          # tour termine
                if self._lap >= 1 and d["last_ms"] > 0:
                    used = None if self._pit else max(0.0, self._lap_fuel - fuel)
                    self.laps.append({"n": self._lap, "ms": d["last_ms"],
                                      "fuel": round(used, 3) if used is not None else None,
                                      "pit": self._pit, "fuel_end": round(fuel, 2)})
                    self.laps = self.laps[-200:]
                self._lap, self._lap_fuel, self._lap_t0, self._pit = lap, fuel, now, False
            cur = int((now - self._lap_t0) * 1000) if self._lap_t0 and not d["paused"] else None
            self.live = dict(d, cur_ms=cur)

    def snapshot(self):
        with self.lock:
            stale = time.time() - self.last_rx > 2.5
            return {"mode": "attente" if stale and self.mode != "demo" else self.mode,
                    "live": self.live, "laps": self.laps, "t": time.time()}


STATE = RaceState()


# --------------------------------------------------------------------------
# Reception PS5
# --------------------------------------------------------------------------
def ps5_loop(ps5_ip):
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    sock.bind(("0.0.0.0", LOCAL_RECV_PORT))
    sock.settimeout(1.0)
    last_hb = 0.0
    warned = False
    while True:
        now = time.time()
        if now - last_hb > 5:      # la PS5 arrete d'envoyer sans heartbeat regulier
            try:
                sock.sendto(b"A", (ps5_ip, PS5_SEND_PORT))
            except OSError as e:
                if not warned:
                    print("  ! Impossible de joindre la PS5 :", e)
                    warned = True
            last_hb = now
        try:
            data, _ = sock.recvfrom(4096)
        except socket.timeout:
            continue
        except OSError:
            time.sleep(0.5)
            continue
        dec = decrypt_gt7(data)
        if not dec:
            continue
        if STATE.mode != "live":
            STATE.mode = "live"
            print("  > Telemetrie GT7 recue. C'est parti !")
        STATE.update(parse_gt7(dec))


def demo_loop():
    """Course simulee : tours de 25 s, conso 2,8 L/tour, arret toutes les 9 tours."""
    STATE.mode = "demo"
    fuel, lap, t_lap, best, pkt, last_ms = 100.0, 1, time.time(), 0, 0, 0
    lap_len = 25.0
    while True:
        now = time.time()
        ph = (now - t_lap) / lap_len
        if ph >= 1:
            ms = int(lap_len * 1000 * random.uniform(4.15, 4.25))   # ~1:45 affiche
            best = ms if not best else min(best, ms)
            lap += 1
            t_lap = now
            if lap % 9 == 0:
                fuel = 100.0
            ph = 0
            last_ms = ms
        fuel = max(0.0, fuel - 2.8 * (0.05 / lap_len))
        x = math.sin(ph * 2 * math.pi * 6)
        speed = 150 + 90 * x
        ang = ph * 2 * math.pi
        posx, posz = 600 * math.cos(ang), 250 * math.sin(ang * 2) * 0.6 + 300 * math.sin(ang)
        lock = -random.uniform(18, 35) if (x < -0.85 and random.random() < 0.35) else -random.uniform(0, 4) if x < -0.6 else 0.0
        spin = random.uniform(16, 30) if (0.1 < x < 0.4 and random.random() < 0.25) else random.uniform(0, 5) if x > 0 else 0.0
        rpm = 5200 + 2300 * x
        pkt += 1
        STATE.update({
            "pkt": pkt, "rpm": rpm, "fuel": fuel, "fuel_cap": 100.0, "speed": speed,
            "water": 88.0, "oil": 102.0,
            "tyres": [78 + 9 * x, 80 + 8 * x, 74 + 6 * x, 75 + 7 * x],
            "lap": lap, "total_laps": 0, "best_ms": best, "last_ms": last_ms,
            "pos": 3, "cars": 16, "rpm_lo": 6800, "rpm_hi": 7600,
            "gear": max(1, min(6, int(speed // 45) + 1)), "gear_sug": 15,
            "throttle": max(0, min(100, 60 + 45 * x)), "brake": max(0, min(100, -80 * x)) if x < -0.6 else 0,
            "on_track": True, "paused": False, "loading": False,
            "rev_limit": rpm > 7400, "asm": False, "tcs": x > 0.9, "car": 0,
            "x": posx, "z": posz,
            "slip": [round(lock, 1), round(lock * 0.8, 1), round(spin * 0.4, 1), round(spin, 1)],
            "boost": max(-0.6, 1.4 * x), "oil_p": 4.5 + x,
        }, now)
        time.sleep(0.05)


# --------------------------------------------------------------------------
# Serveur web : dashboard + flux en direct (Server-Sent Events)
# --------------------------------------------------------------------------
class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=WEB_DIR, **kw)

    def log_message(self, *a):
        pass

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_GET(self):
        if self.path.startswith("/events"):
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.send_header("Connection", "keep-alive")
            self.end_headers()
            try:
                while True:
                    msg = json.dumps(STATE.snapshot(), separators=(",", ":"))
                    self.wfile.write(("data: " + msg + "\n\n").encode("utf-8"))
                    self.wfile.flush()
                    time.sleep(0.1)
            except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError, OSError):
                return
        if self.path in ("/", ""):
            self.path = "/index.html"
        return super().do_GET()


class Server(ThreadingHTTPServer):
    daemon_threads = True

    def handle_error(self, request, client_address):
        # un telephone qui ferme ou recharge la page coupe la connexion : ce n'est pas une erreur
        err = sys.exc_info()[1]
        if isinstance(err, (ConnectionAbortedError, ConnectionResetError, BrokenPipeError, TimeoutError)):
            return
        super().handle_error(request, client_address)


def lan_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("10.255.255.255", 1))
        return s.getsockname()[0]
    except OSError:
        return "127.0.0.1"
    finally:
        s.close()


def ask_ps5_ip():
    cfg = {}
    if os.path.exists(CONFIG):
        try:
            cfg = json.load(open(CONFIG, encoding="utf-8"))
        except (OSError, ValueError):
            cfg = {}
    ip = cfg.get("ps5_ip", "")
    if ip:
        rep = input(f"  Adresse IP de la PS5 [{ip}] (Entree pour garder) : ").strip()
        ip = rep or ip
    else:
        print("  Sur la PS5 : Parametres > Reseau > Etat de la connexion > Adresse IP")
        ip = input("  Adresse IP de la PS5 (ex. 192.168.1.20) : ").strip()
    cfg["ps5_ip"] = ip
    try:
        json.dump(cfg, open(CONFIG, "w", encoding="utf-8"))
    except OSError:
        pass
    return ip


def main():
    demo = "--demo" in sys.argv
    print()
    print("  ==============================================")
    print("   GT7 RACE ENGINEER - relais telemetrie")
    print("  ==============================================")
    if demo:
        print("  Mode DEMO : donnees simulees, pas besoin de la PS5.")
        threading.Thread(target=demo_loop, daemon=True).start()
    else:
        ip = ask_ps5_ip()
        if not ip:
            print("  Pas d'adresse IP : arret.")
            return
        threading.Thread(target=ps5_loop, args=(ip,), daemon=True).start()
    srv = Server(("0.0.0.0", HTTP_PORT), Handler)
    url = f"http://{lan_ip()}:{HTTP_PORT}"
    print()
    print("  Sur ton telephone (meme Wi-Fi que le PC), ouvre :")
    print()
    print("      " + url + "/pilote.html   (ecran pilote, iPad en paysage)")
    print("      " + url + "               (dashboard complet)")
    print()
    print("  Laisse cette fenetre ouverte pendant la course. Ctrl+C pour quitter.")
    if not demo:
        print("  En attente de la telemetrie... (lance une course ou un essai dans GT7)")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\n  Arret.")


if __name__ == "__main__":
    main()
