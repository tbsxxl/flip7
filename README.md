# Flip 7 – Punktezähler

Offline-fähiger Punktezähler für das Kartenspiel **Flip 7**: Karten antippen, fertig. Bust (doppelte Zahl),
×2, +Modifier und der Flip-7-Bonus (+15) werden automatisch gerechnet.

Läuft als statische Seite auf **Cloudflare Workers** (Static Assets, kein Server-Code) und lässt sich als App installieren.

## Funktionen

- Spieler & Ziel (150 / 200 / 300 / eigenes) direkt auf der Startseite festlegen, Sitzreihenfolge per Ziehen,
  Namen aus früheren Spielen als Vorschläge
- Eintragen der Reihe nach: „Weiter" springt zur nächsten Person, bei der letzten heißt der Knopf „Runde beenden";
  nach Bust / Flip 7 geht es automatisch weiter (abschaltbar)
- Bust mit einem Tipp direkt auf der Spielerkarte
- Geber-Anzeige, wandert jede Runde weiter
- Karten-Eingabe mit echten Kartenfarben, Live-Vorschau, Direktpunkte
- Vergangene Runden im Verlauf antippen und korrigieren
- Zwei- bzw. dreispaltiges Layout auf Tablet und im Querformat
- Live-Ranking, Führungsanzeige, Fortschrittsbalken
- Verlauf je Runde + Statistik (Ø, beste Runde, Bust-Quote, Flip 7s)
- Rückgängig für jede Aktion (bleibt auch nach Neuladen erhalten)
- Spielende: höchste Punktzahl gewinnt, Gleichstand wird erkannt, Revanche mit gleichen Spielern
- Hell / Dunkel / Auto, kompakte Ansicht, hoher Kontrast, Bildschirm anlassen, Vibration
- Offline dank Service Worker; alter Spielstand der Vorversion wird übernommen

## Aufbau

```
public/            statische Seite (index.html, styles.css, app.js, rules.js, sw.js, manifest, icons, _headers)
test/              Tests der Punkteregeln (node test/rules.test.mjs)
wrangler.jsonc     Cloudflare-Konfiguration
```

## Lokal starten

```bash
npm install
npm run dev        # http://localhost:8787
npm run check      # Syntax-Check + Regel-Tests
```

## Deployen (ohne lokale Installation)

1. Im [Cloudflare-Dashboard](https://dash.cloudflare.com) → **Workers & Pages** → **Create application** → **Import a repository**.
2. GitHub verbinden und `tbsxxl/flip7` auswählen.
3. Einstellungen übernehmen (Cloudflare erkennt `wrangler.jsonc`; Deploy-Befehl `npx wrangler deploy`) → **Deploy**.

Danach deployt Cloudflare bei jedem Push auf den Produktions-Branch automatisch.
Die URL lautet `https://flip7.<dein-account>.workers.dev`; eigene Domain unter Worker → Settings → Domains & Routes.
