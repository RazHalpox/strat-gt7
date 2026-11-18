"""
SimRaceDash pour PC Windows : l'appli complète.

- Une fenêtre SimRaceDash (accueil) : adresse de la PS5, Démarrer, mode démo, adresse pour l'iPad,
  boutons pour ouvrir Pilote, Complet et Stratégie dans leur propre fenêtre.
- Le même serveur que le relais (gt7_relais.py) : les écrans du téléphone et de l'iPad s'y connectent.
- Compilée en SimRaceDash.exe (PyInstaller) : aucun besoin d'installer Python.

Lancement en développement :  python simracedash_pc.py
Vérification automatique :     python simracedash_pc.py --selftest
"""
import json
import os
import sys
import threading
import time
import urllib.request
import webbrowser
from urllib.parse import urlparse, parse_qs

import gt7_relais as R

APP_VERSION = "3.0"          # remplacé à la compilation par la version publiée (3.0.N)
VERSION_URL = "https://github.com/RazHalpox/strat-gt7/releases/download/v3/version.json"
SETUP_URL = "https://github.com/RazHalpox/strat-gt7/releases/download/v3/SimRaceDash-Setup.exe"

# ---- dossiers : écrans dans l'appli, réglages et enregistrements dans le profil de l'utilisateur ----
FROZEN = getattr(sys, "frozen", False)
BASE = getattr(sys, "_MEIPASS", os.path.dirname(os.path.abspath(__file__)))
R.WEB_DIR = os.path.join(BASE, "web")
DATA = os.path.join(os.environ.get("APPDATA") or os.path.expanduser("~"), "SimRaceDash") if FROZEN else os.path.dirname(os.path.abspath(__file__))
os.makedirs(DATA, exist_ok=True)
R.CONFIG = os.path.join(DATA, "config.json")
R.REC_DIR = os.path.join(DATA, "enregistrements")


def load_cfg():
    try:
        return json.load(open(R.CONFIG, encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def save_cfg(cfg):
    try:
        json.dump(cfg, open(R.CONFIG, "w", encoding="utf-8"))
    except OSError:
        pass


# ---- réception de la télémétrie : une seule source à la fois (PS5 ou démo) ----
class Source:
    def __init__(self):
        self.lock = threading.Lock()
        self.stop_ev = None
        self.kind = None      # None | "ps5" | "demo"
        self.ip = ""

    def start(self, kind, ip=""):
        with self.lock:
            self._stop()
            R.STATE = R.RaceState()           # nouvelle course : état remis à zéro
            ev = threading.Event()
            target = (lambda: R.ps5_loop(ip, ev)) if kind == "ps5" else (lambda: R.demo_loop(ev))
            threading.Thread(target=self._run, args=(target,), daemon=True).start()
            self.stop_ev, self.kind, self.ip = ev, kind, ip

    @staticmethod
    def _run(target):
        try:
            target()
        except OSError as e:      # port déjà pris (relais ou autre appli ouverte)
            R.STATE.mode = "attente"
            SOURCE.error = "Réception impossible : " + str(e)

    def _stop(self):
        if self.stop_ev:
            self.stop_ev.set()
            time.sleep(1.2)       # la boucle PS5 vérifie l'arrêt toutes les secondes
        self.stop_ev, self.kind = None, None
        R.REC.close()

    def stop(self):
        with self.lock:
            self._stop()
            R.STATE = R.RaceState()

    error = ""


SOURCE = Source()
UPDATE = {"latest": None}


def check_update():
    """Compare avec la dernière version publiée (silencieux si pas de réseau)."""
    try:
        with urllib.request.urlopen(VERSION_URL, timeout=8) as f:
            v = json.loads(f.read().decode("utf-8"))
        UPDATE["latest"] = v.get("versionName")
    except Exception:
        pass


def newer(a, b):
    try:
        return [int(x) for x in a.split(".")] > [int(x) for x in b.split(".")]
    except (AttributeError, ValueError):
        return False


# ---- fenêtres ----
WEBVIEW = None
try:
    import webview  # pywebview : fenêtres natives (Edge WebView2 sous Windows)
    WEBVIEW = webview
    try:
        webview.settings["ALLOW_DOWNLOADS"] = True   # téléchargements depuis les écrans (secours)
    except Exception:
        pass
except Exception:
    WEBVIEW = None

TITLES = {"pilote.html": "Pilote", "index.html": "Complet", "strategie.html": "Stratégie", "reglages.html": "Réglages"}


def open_page(page, full=False):
    url = f"http://127.0.0.1:{R.HTTP_PORT}/{page}"
    if WEBVIEW and WEBVIEW.windows:
        WEBVIEW.create_window("SimRaceDash · " + TITLES.get(page, page), url, width=1280, height=800,
                              min_size=(480, 360), fullscreen=full, background_color="#0B0C0F")
    else:
        webbrowser.open(url)


# ---- serveur : celui du relais + les commandes de l'accueil (/api/...) ----
class Handler(R.Handler):
    def do_GET(self):
        u = urlparse(self.path)
        if u.path == "/api/status":
            st = R.STATE
            age = time.time() - st.last_rx if st.last_rx else None
            latest = UPDATE["latest"]
            return self._json({
                "kind": SOURCE.kind, "ip": SOURCE.ip or load_cfg().get("ps5_ip", ""), "mode": st.mode,
                "receiving": bool(age is not None and age < 3), "error": SOURCE.error,
                "lan": f"http://{R.lan_ip()}:{R.HTTP_PORT}", "version": APP_VERSION,
                "update": latest if latest and newer(latest, APP_VERSION) else None,
                "setup": SETUP_URL, "native": bool(WEBVIEW),
            })
        if self.path in ("/", "") and self.client_address[0] in ("127.0.0.1", "::1"):
            self.path = "/accueil.html"   # sur ce PC : l'accueil ; sur le téléphone : le dashboard complet, comme avant
        return super().do_GET()

    def do_POST(self):
        u = urlparse(self.path)
        if not u.path.startswith("/api/"):
            return super().do_POST()
        # commandes réservées à ce PC (pas aux téléphones du Wi-Fi)
        if self.client_address[0] not in ("127.0.0.1", "::1"):
            self.send_error(403)
            return
        try:
            n = int(self.headers.get("Content-Length", "0") or 0)
            d = json.loads(self.rfile.read(n).decode("utf-8")) if n else {}
        except (ValueError, UnicodeDecodeError):
            d = {}
        SOURCE.error = ""
        if u.path == "/api/start":
            ip = str(d.get("ip", "")).strip()
            if not ip:
                return self._json({"ok": False, "msg": "Entre l'adresse IP de la PS5."})
            cfg = load_cfg(); cfg["ps5_ip"] = ip; save_cfg(cfg)
            SOURCE.start("ps5", ip)
        elif u.path == "/api/demo":
            SOURCE.start("demo")
        elif u.path == "/api/stop":
            SOURCE.stop()
        elif u.path == "/api/open":
            page = str(d.get("page", "pilote.html"))
            if page not in TITLES:
                return self._json({"ok": False})
            open_page(page, bool(d.get("full")))
        elif u.path == "/api/folder":
            try:
                os.makedirs(R.REC_DIR, exist_ok=True)
                os.startfile(R.REC_DIR)  # Windows : ouvre le dossier des enregistrements
            except (AttributeError, OSError):
                pass
        elif u.path == "/api/update":
            webbrowser.open(SETUP_URL)
        elif u.path == "/api/save":
            # export d'un fichier (carnet en CSV) : enregistré dans Téléchargements, l'explorateur s'ouvre dessus
            name = os.path.basename(str(d.get("name") or "export.csv")).replace("..", "") or "export.csv"
            folder = os.path.join(os.path.expanduser("~"), "Downloads")
            try:
                os.makedirs(folder, exist_ok=True)
                path = os.path.join(folder, name)
                with open(path, "w", encoding="utf-8", newline="") as f:
                    f.write(str(d.get("text", "")))
                try:
                    import subprocess
                    subprocess.Popen(["explorer", "/select,", path])
                except OSError:
                    pass
            except OSError as e:
                return self._json({"ok": False, "msg": str(e)})
            return self._json({"ok": True, "path": path})
        elif u.path == "/api/quit":
            threading.Timer(0.5, lambda: os._exit(0)).start()   # sans fenêtre (mode navigateur) : bouton Quitter
        else:
            self.send_error(404)
            return
        return self._json({"ok": True})


def serve():
    srv = R.Server(("0.0.0.0", R.HTTP_PORT), Handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


def selftest():
    """Démarre le serveur, vérifie les pages et le mode démo, puis quitte (utilisé par la compilation)."""
    srv = serve()
    base = f"http://127.0.0.1:{R.HTTP_PORT}"
    for p in ("/accueil.html", "/pilote.html", "/strategie.html", "/index.html", "/reglages.html", "/api/status"):
        with urllib.request.urlopen(base + p, timeout=5) as f:
            assert f.status == 200, p
    req = urllib.request.Request(base + "/api/demo", data=b"{}", method="POST")
    urllib.request.urlopen(req, timeout=5).read()
    time.sleep(1.5)
    st = json.loads(urllib.request.urlopen(base + "/api/status", timeout=5).read())
    assert st["mode"] == "demo" and st["receiving"], st
    urllib.request.urlopen(urllib.request.Request(base + "/api/stop", data=b"{}", method="POST"), timeout=5).read()
    srv.shutdown()
    print("SELFTEST OK", APP_VERSION)


def home_geometry():
    """Taille de la fenêtre d'accueil : assez haute pour tout voir sans défiler, sans dépasser l'écran (barre des tâches comprise)."""
    w, h = 580, 1075
    try:
        import ctypes
        from ctypes import wintypes
        r = wintypes.RECT()
        ctypes.windll.user32.SystemParametersInfoW(0x30, 0, ctypes.byref(r), 0)   # zone de travail (sans la barre des tâches)
        try:
            scale = ctypes.windll.user32.GetDpiForSystem() / 96.0                 # zoom de Windows (125 %, 150 %…)
        except Exception:
            scale = 1.0
        aw, ah = (r.right - r.left) / scale, (r.bottom - r.top) / scale
        h = int(min(h, ah - 16))
        return w, h, int(r.left / scale + (aw - w) / 2), int(r.top / scale + (ah - h) / 2)
    except Exception:
        return w, 900, None, None


def main():
    if "--selftest" in sys.argv:
        # pas de fenêtre d'erreur (elle bloquerait la compilation automatique) : un code de sortie et un journal
        try:
            selftest()
            code = 0
        except Exception as e:
            code = 1
            try:
                open(os.path.join(DATA, "selftest.log"), "w", encoding="utf-8").write(repr(e))
            except OSError:
                pass
        os._exit(code)
    try:
        serve()
    except OSError:
        # le port est déjà pris : SimRaceDash tourne déjà, on ouvre simplement une fenêtre de plus
        if not WEBVIEW:
            webbrowser.open(f"http://127.0.0.1:{R.HTTP_PORT}/accueil.html")
            return
    threading.Thread(target=check_update, daemon=True).start()
    url = f"http://127.0.0.1:{R.HTTP_PORT}/accueil.html"
    if WEBVIEW:
        try:
            w, h, x, y = home_geometry()
            WEBVIEW.create_window("SimRaceDash", url, width=w, height=h, x=x, y=y, min_size=(420, 560), background_color="#000002")
            WEBVIEW.start(gui="edgechromium")   # quand la dernière fenêtre est fermée, l'appli s'arrête
        except Exception:
            # moteur d'affichage Edge (WebView2) absent : on passe par le navigateur
            globals()["WEBVIEW"] = None
            webbrowser.open(url)
            try:
                while True:
                    time.sleep(1)
            except KeyboardInterrupt:
                pass
    else:
        webbrowser.open(url)
        print("SimRaceDash tourne. Ferme cette fenêtre pour arrêter.")
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            pass
    SOURCE.stop()


if __name__ == "__main__":
    main()
