/* Was wir uns aus dem Admin holen, einmal ablegen statt jedes Mal suchen.

   Zwei Stellen zapfen den Admin an: der Aufzaehlungskatalog
   (katalog.js, 58 Raeume und 62 Funktionen mit Namen und Bildern) und
   die Musternamen (musternamen.js, „socket" -> „Steckdose"). Beide
   suchen in denselben Buendeln, und seit Admin 8.0.x steht beides sogar
   in derselben Datei — einem Sammelmodul von 7,9 MB.

   Gemessen am 07.10.2026: ohne Ablage wurden davon bei **jedem** Oeffnen
   des Reiters 1 727 KB uebertragen und 854 ms gewartet, fuer zusammen
   rund 550 KB Nutzlast. Darum liegt das Ergebnis danach hier.

   Wann wird neu geholt? Wenn der Admin seine Buendel neu schreibt. Als
   Stempel dienen die Dateinamen aus `index.html` — sie tragen einen
   Hash und wechseln bei jeder Aenderung. Die Versionsnummer taugt dafuer
   nicht: ein Zwischenbau traegt dieselbe.

   Warum der Dateibereich und nicht etwas anderes: die Adapter-
   konfiguration wird bei jedem Start und bei jedem Oeffnen der
   Einstellungen gelesen und ist heute 26 KB gross; ein Datenpunkt liegt
   auf dem Produktivsystem in Redis, also im Arbeitsspeicher; der
   Browserspeicher haengt am einzelnen Geraet. */

import { socket } from './verbindung.js';

var ORT = 'alias-workbench.0';
var DATEI = 'katalog.json';

/* Den Dateibereich gibt es nur zu einem Objekt vom Typ `meta`. Adapter
   mit Dienstteil bekommen es vom js-controller; die Werkbank ist
   `onlyWWW`, also gibt es keines — `writeFile` antwortet dann mit
   „alias-workbench.0 is not an object of type meta".

   `alias-workbench.admin` waere der falsche Platz: dorthin schreibt
   `iobroker upload` die Oberflaechendateien und raeumt dabei alles
   andere weg. Fuer neue Installationen steht das Objekt zusaetzlich in
   io-package.json. */
function bereit() {
  return new Promise(function (fertig) {
    try {
      socket.emit('getObject', ORT, function (err, o) {
        if (o && o.type === 'meta') { return fertig(true); }
        socket.emit('setObject', ORT, {
          type: 'meta',
          common: { name: 'Alias-Werkbank — Ablage', type: 'meta.user' },
          native: {}
        }, function (fehler) { fertig(!fehler); });
      });
    } catch { fertig(false); }
    setTimeout(function () { fertig(false); }, 8000);
  });
}

/* Woran man erkennt, dass der Admin seine Buendel neu geschrieben hat. */
export function stempelAus(html) {
  return (html.match(/assets\/[A-Za-z0-9_\-.]+\.js/g) || []).slice().sort().join(' ');
}

/* Einmal gelesen reicht fuer die ganze Sitzung: beide Leser fragen beim
   Laden kurz hintereinander, und ein zweiter Abruf ueber die Leitung
   braucht es dafuer nicht. */
var gelesen = null;

export function leseAblage() {
  if (gelesen) { return gelesen; }
  gelesen = new Promise(function (fertig) {
    try {
      socket.emit('readFile', ORT, DATEI, function (err, daten) {
        if (err || typeof daten !== 'string') { return fertig(null); }
        try { fertig(JSON.parse(daten)); } catch { fertig(null); }
      });
    } catch { fertig(null); }
    setTimeout(function () { fertig(null); }, 12000);
  });
  return gelesen;
}

/* Den eigenen Teil dazulegen, ohne den des anderen zu verlieren.

   Katalog und Musternamen schreiben unabhaengig voneinander. Wer stur
   seine eigene Fassung hinlegt, loescht dem anderen den Abschnitt —
   also vorher lesen, zusammenfuehren, dann schreiben. Stimmt der
   Stempel nicht mehr, faengt die Datei von vorn an: was zum alten
   Buendel gehoerte, gilt nicht mehr. */
export function ergaenzeAblage(stempel, teil) {
  return leseAblage().then(function (alt) {
    var neu = (alt && alt.stempel === stempel) ? alt : { stempel: stempel };
    Object.keys(teil).forEach(function (k) { neu[k] = teil[k]; });
    gelesen = Promise.resolve(neu);
    return bereit().then(function (da) {
      if (!da) { return null; }
      var text = JSON.stringify(neu);
      return new Promise(function (fertig) {
        var erledigt = false;
        var einmal = function () { if (!erledigt) { erledigt = true; fertig(); } };
        try {
          /* `writeFile64` ist der heutige Weg, `writeFile` der alte.
             Welcher antwortet, entscheidet die Admin-Fassung. */
          var b64 = btoa(unescape(encodeURIComponent(text)));
          socket.emit('writeFile64', ORT, DATEI, b64, function (err) {
            if (!err) { return einmal(); }
            try {
              socket.emit('writeFile', ORT, DATEI, text, function () { einmal(); });
            } catch { einmal(); }
          });
        } catch { einmal(); }
        /* Antwortet gar nichts, ist das kein Grund zu warten — die Daten
           stehen ja schon, nur die Abkuerzung fuers naechste Mal fehlt. */
        setTimeout(einmal, 8000);
      });
    });
  })['catch'](function () { return null; });
}
