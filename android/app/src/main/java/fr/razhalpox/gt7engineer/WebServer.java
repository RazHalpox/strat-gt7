package fr.razhalpox.gt7engineer;

import java.io.BufferedReader;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;

/** Petit serveur web : sert les écrans (Pilote, Complet, Stratégie, Réglages) et le flux en direct /events. */
public final class WebServer {
    public static final int PORT = 8777;

    /** D'où viennent les fichiers des écrans (les assets de l'appli, ou un dossier pour les tests). */
    public interface Files {
        InputStream open(String path) throws IOException;
    }

    /** Ajouté dans chaque page : la voix de l'ingénieur passe par la synthèse vocale d'Android. */
    static final String TTS_SHIM = "<script>(function(){if(!window.AndroidTTS)return;"
            + "function U(t){this.text=t;this.rate=1;this.lang='fr-FR';this.voice=null}"
            + "var S={speak:function(u){try{AndroidTTS.speak(String(u.text),+u.rate||1)}catch(e){}},"
            + "cancel:function(){try{AndroidTTS.cancel()}catch(e){}},getVoices:function(){return[]},"
            + "speaking:false,pending:false,paused:false,onvoiceschanged:null,addEventListener:function(){},removeEventListener:function(){}};"
            + "try{Object.defineProperty(window,'SpeechSynthesisUtterance',{value:U,configurable:true,writable:true})}catch(e){window.SpeechSynthesisUtterance=U}"
            + "try{Object.defineProperty(window,'speechSynthesis',{value:S,configurable:true,writable:true})}catch(e){}"
            + "})();</script>";

    /** Stratégie partagée entre les écrans (téléphone, iPad, PC) : la dernière version de chaque clé gagne. */
    static final class Shared {
        private static final java.util.List<String> KEYS = java.util.Arrays.asList("gt7-endu-v1", "gt7-plan", "gt7-saved", "gt7-pitack", "gt7-races", "gt7-races-del");
        private final java.util.Map<String, Object[]> items = new java.util.HashMap<>(); // clé -> {valeur, date, n°}
        private long seq = 0;

        synchronized long seq() { return seq; }

        synchronized String get(long since) {
            try {
                org.json.JSONObject it = new org.json.JSONObject();
                for (java.util.Map.Entry<String, Object[]> e : items.entrySet()) {
                    Object[] v = e.getValue();
                    if ((Long) v[2] > since) it.put(e.getKey(), new org.json.JSONObject().put("v", v[0]).put("t", (Double) v[1]));
                }
                return new org.json.JSONObject().put("seq", seq).put("items", it).toString();
            } catch (org.json.JSONException e) {
                return "{\"seq\":" + seq + ",\"items\":{}}";
            }
        }

        synchronized boolean put(String body) {
            try {
                org.json.JSONObject d = new org.json.JSONObject(body);
                String k = d.optString("k", ""), v = d.has("v") && d.get("v") instanceof String ? d.getString("v") : null;
                double t = d.optDouble("t", Double.NaN);
                if (!KEYS.contains(k) || v == null || Double.isNaN(t)) return false;
                Object[] cur = items.get(k);
                if (cur != null && (Double) cur[1] > t) return false;
                if (cur != null && cur[0].equals(v) && (Double) cur[1] == t) return true;
                items.put(k, new Object[]{v, t, ++seq});
                return true;
            } catch (org.json.JSONException e) {
                return false;
            }
        }
    }

    static final Shared SHARED = new Shared();

    private final Files files;
    private final RaceState state;
    private volatile boolean running;
    private ServerSocket server;

    public WebServer(Files files, RaceState state) {
        this.files = files;
        this.state = state;
    }

    public synchronized void start() throws IOException {
        if (running) return;
        ServerSocket s = new ServerSocket();
        s.setReuseAddress(true);
        s.bind(new InetSocketAddress(PORT));
        server = s;
        running = true;
        Thread t = new Thread(() -> {
            while (running) {
                try {
                    final Socket c = s.accept();
                    Thread h = new Thread(() -> handle(c), "gt7-http");
                    h.setDaemon(true);
                    h.start();
                } catch (IOException e) {
                    if (!running) return;
                }
            }
        }, "gt7-web");
        t.setDaemon(true);
        t.start();
    }

    public synchronized void stop() {
        running = false;
        try { if (server != null) server.close(); } catch (IOException ignored) {}
        server = null;
    }

    private static String type(String p) {
        if (p.endsWith(".html")) return "text/html; charset=utf-8";
        if (p.endsWith(".js")) return "text/javascript; charset=utf-8";
        if (p.endsWith(".css")) return "text/css; charset=utf-8";
        if (p.endsWith(".png")) return "image/png";
        if (p.endsWith(".svg")) return "image/svg+xml";
        if (p.endsWith(".woff")) return "font/woff";
        if (p.endsWith(".woff2")) return "font/woff2";
        if (p.endsWith(".txt")) return "text/plain; charset=utf-8";
        if (p.endsWith(".json") || p.endsWith(".webmanifest")) return "application/manifest+json";
        return "application/octet-stream";
    }

    private void handle(Socket c) {
        try (Socket sock = c) {
            sock.setSoTimeout(15000);
            BufferedReader in = new BufferedReader(new InputStreamReader(sock.getInputStream(), StandardCharsets.ISO_8859_1));
            String line = in.readLine();
            if (line == null) return;
            String h;
            int contentLength = 0;
            while ((h = in.readLine()) != null && !h.isEmpty()) {
                int c2 = h.indexOf(':');
                if (c2 > 0 && h.substring(0, c2).trim().equalsIgnoreCase("Content-Length")) {
                    try { contentLength = Integer.parseInt(h.substring(c2 + 1).trim()); } catch (NumberFormatException ignored) {}
                }
            }
            String[] parts = line.split(" ");
            if (parts.length < 2) return;
            String method = parts[0];
            String path = parts[1];
            int q = path.indexOf('?');
            String query = q >= 0 ? path.substring(q + 1) : "";
            if (q >= 0) path = path.substring(0, q);
            path = URLDecoder.decode(path, "UTF-8");
            OutputStream out = sock.getOutputStream();
            if (path.equals("/events")) {
                sock.setSoTimeout(0);
                out.write(("HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nCache-Control: no-store\r\n"
                        + "Connection: keep-alive\r\nAccess-Control-Allow-Origin: *\r\n\r\n").getBytes(StandardCharsets.UTF_8));
                out.flush();
                while (running) {
                    out.write(("data: " + state.snapshotJson() + "\n\n").getBytes(StandardCharsets.UTF_8));
                    out.flush();
                    Thread.sleep(100);
                }
                return;
            }
            if (path.equals("/sync")) {
                String json;
                if ("POST".equals(method)) {
                    boolean ok = false;
                    if (contentLength > 0 && contentLength <= 4_000_000) {
                        char[] buf = new char[contentLength];
                        int got = 0, n;
                        while (got < contentLength && (n = in.read(buf, got, contentLength - got)) > 0) got += n;
                        byte[] raw = new String(buf, 0, got).getBytes(StandardCharsets.ISO_8859_1);
                        ok = SHARED.put(new String(raw, StandardCharsets.UTF_8));
                    }
                    json = "{\"ok\":" + ok + ",\"seq\":" + SHARED.seq() + "}";
                } else {
                    long since = 0;
                    for (String kv : query.split("&")) if (kv.startsWith("since=")) try { since = Long.parseLong(kv.substring(6)); } catch (NumberFormatException ignored) {}
                    json = SHARED.get(since);
                }
                send(out, 200, "application/json; charset=utf-8", json.getBytes(StandardCharsets.UTF_8), method);
                return;
            }
            if (path.equals("/") || path.isEmpty()) path = "/index.html";
            if (path.contains("..")) { send(out, 404, "text/plain", "introuvable".getBytes(StandardCharsets.UTF_8), method); return; }
            byte[] body;
            try (InputStream f = files.open(path.substring(1))) {
                ByteArrayOutputStream bo = new ByteArrayOutputStream();
                byte[] b = new byte[16384];
                int n;
                while ((n = f.read(b)) > 0) bo.write(b, 0, n);
                body = bo.toByteArray();
            } catch (IOException e) {
                send(out, 404, "text/plain; charset=utf-8", "introuvable".getBytes(StandardCharsets.UTF_8), method);
                return;
            }
            String t = type(path);
            if (t.startsWith("text/html")) {
                String html = new String(body, StandardCharsets.UTF_8);
                int i = html.indexOf("<head>");
                html = i >= 0 ? html.substring(0, i + 6) + TTS_SHIM + html.substring(i + 6) : TTS_SHIM + html;
                body = html.getBytes(StandardCharsets.UTF_8);
            }
            send(out, 200, t, body, method);
        } catch (Exception ignored) {
            // un écran qui se ferme ou se recharge coupe la connexion : ce n'est pas une erreur
        }
    }

    private static void send(OutputStream out, int code, String type, byte[] body, String method) throws IOException {
        String head = "HTTP/1.1 " + code + (code == 200 ? " OK" : " Not Found") + "\r\nContent-Type: " + type
                + "\r\nContent-Length: " + body.length + "\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n";
        out.write(head.getBytes(StandardCharsets.UTF_8));
        if (!"HEAD".equals(method)) out.write(body);
        out.flush();
    }
}
