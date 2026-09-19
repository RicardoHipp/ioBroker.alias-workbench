/* Werte und Quellen: nachschlagen, holen, Formeln auswerten, formatieren.

   S.werte ist der Vorrat der zuletzt gesehenen Zustaende; `wertVon`
   rechnet daraus, was eine Entwurfszeile anzeigen wuerde - samt
   Leseformel und Zieltyp. */

import { S } from './zustand.js';
import { socket } from './verbindung.js';
import { tr, txt } from './sprache.js';
import './entwurf.js';

/* Direkt nachschlagen — die Vorlagen nennen den Pfad ja vollstaendig
   ("stat.POWER"). Vorher lief das ueber alle Objekte, was beim Pruefen
   ganzer Ordner unbezahlbar wird. */
/* MQTT uebernimmt die Schreibweise des Themas. Dasselbe Geraetemodell
   meldet mal cmnd.POWER1, mal cmnd.power1 — deshalb erst genau suchen,
   dann ohne Ruecksicht auf Gross- und Kleinschreibung. */
export function kleinKarte(kanal) {
  if (S.kleinIndex[kanal]) { return S.kleinIndex[kanal]; }
  var karte = {};
  var pre = kanal + '.';
  S.keysSorted.forEach(function (k) {
    if (k.indexOf(pre) !== 0) { return; }
    if (!S.objects[k] || S.objects[k].type !== 'state') { return; }
    karte[k.slice(pre.length).toLowerCase()] = k;
  });
  S.kleinIndex[kanal] = karte;
  return karte;
}

export function hatPunkt(kanal, endung) {
  var id = kanal + '.' + endung;
  if (S.objects[id] && S.objects[id].type === 'state') { return id; }
  var treffer = kleinKarte(kanal)[String(endung).toLowerCase()];
  return treffer || null;
}

export function jsonVon(id) {
  var st = S.werte[id];
  if (!st || typeof st.val !== 'string') { return null; }
  try { return JSON.parse(st.val); } catch { return null; }
}

export function feldWert(obj, pfad) {
  var t = pfadTeile(pfad);
  var x = obj;
  for (var i = 0; i < t.length; i++) {
    if (x === null || x === undefined || typeof x !== 'object') { return undefined; }
    x = x[t[i]];
  }
  return x;
}


/* Alle Kennungen mit diesem Vorspann — ohne die Gesamtliste zu lesen.

   `S.keysSorted` ist sortiert, die gesuchten Eintraege liegen also am
   Stueck. Vorher ging jeder dieser Aufrufe die ganze Liste durch:
   24.786 Vergleiche fuer zehn Treffer, rund zwanzigmal je Neuzeichnen,
   und bei laufenden Werten alle 700 ms (gemessen am Produktivsystem
   10.09.2026: Alias 51,9 ms, Quelle 15,8 ms je Zeichnen).

   Die Binaersuche findet den Anfang in ~15 Schritten, danach wird nur
   noch der Bereich selbst gelesen. */
export function mitVorspann(pre) {
  var liste = S.keysSorted;
  var lo = 0, hi = liste.length;
  while (lo < hi) {
    var m = (lo + hi) >> 1;
    if (liste[m] < pre) { lo = m + 1; } else { hi = m; }
  }
  var raus = [];
  for (var i = lo; i < liste.length && liste[i].indexOf(pre) === 0; i++) {
    raus.push(liste[i]);
  }
  return raus;
}

/* Wie der Baum: POWER2 vor POWER10.

   `keysSorted` MUSS byteweise sortiert bleiben - die Binaersuche in
   `mitVorspann` haengt daran. Fuer die Anzeige ist das die falsche
   Ordnung: an einer Mehrfachsteckdose stand `POWER10` vor `POWER2`,
   waehrend der Baum daneben richtig zaehlte (er nimmt `Intl.Collator`
   mit `numeric: true`). Also wird hier nachsortiert, wo die Liste
   entsteht - je Kanal ein paar Dutzend Eintraege, nicht der
   Gesamtindex (gemessen 12.09.2026). */
var ZEILEN_VERGLEICH = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

export function kindZustaende(kanal) {
  var pre = kanal + '.';
  return mitVorspann(pre).filter(function (k) {
    return S.objects[k] && S.objects[k].type === 'state';
  }).sort(function (a, b) {
    return ZEILEN_VERGLEICH.compare(a.slice(pre.length), b.slice(pre.length));
  });
}

export function direkteZustaende(kanal) {
  var pre = kanal + '.';
  return kindZustaende(kanal).filter(function (k) { return k.slice(pre.length).indexOf('.') === -1; });
}

/* Wohin schreibt dieser Aliaspunkt?

   Fuenfmal woertlich gleich ausprogrammiert gewesen — dreimal in
   `entwurf.js`, zweimal in `zuordnung.js` —, und die Kommentare an zwei
   dieser Stellen dokumentieren je einen Fehler, der genau daraus
   entstanden ist: einmal wurde aus einem schaltenden Punkt ein lesender
   ohne Umrechnung, einmal verloren OPEN, SET und pct ihre Schreibquelle,
   weil dort `q.einfach ? '' : …` stand und `common.write` gar nicht
   angesehen wurde.

   Die Regel selbst: Bei getrennten Quellen (`alias.id.read`/`.write`)
   gilt, was unter `write` steht. Bei einer schlichten `alias.id` zeigen
   Lesen und Schreiben auf denselben Punkt — geschrieben wird dorthin
   aber nur, wenn der Alias das auch sagt: durch `common.write` oder
   durch eine hinterlegte Schreibformel. Wer eine Schreibformel
   hinterlegt hat, wollte schreiben. */
export function schreibQuelle(o) {
  var c = (o && o.common) || {};
  var a = c.alias || {};
  var q = aliasQuellen(o);
  if (!q.einfach) { return q.write || ''; }
  return (c.write === true || typeof a.write === 'string') ? (q.write || '') : '';
}

/* Aus einem Alias-Objekt die Felder einer Entwurfszeile.

   Dieselbe Umrechnung stand fuenfmal ausprogrammiert - dreimal in
   `entwurf.js`, zweimal in `zuordnung.js` -, jedes Mal mit derselben
   Schreibquellenregel und leicht anderem Drumherum. Die Kommentare an
   jenen Stellen dokumentieren vier Fehler, die genau daraus entstanden
   sind: eine verlorene Schreibquelle am Rollladen, ein schaltender Punkt
   der zum lesenden wurde, eine fehlende Beschriftung an Solar.Netz und
   eine Abweichung, die die Werkbank selbst erzeugt hatte (Y5).

   Was hier steht, ist die ABLEITUNG - nicht, was damit geschieht. Die
   eine Stelle vergleicht nur, die zweite legt eine Zeile an, die beiden
   anderen ueberschreiben eine bestehende; das bleibt bei den Aufrufern.

   `baueEntwurf` ruft sie bewusst NICHT: die Funktion baut Zeilen fuer
   zwei Faelle, Alias und rohe Quelle, und drei der Felder haengen dort
   an dieser Unterscheidung. Sie mit Schaltern hereinzuholen waere
   schlechter als zwei ehrliche Stellen.

   Die Beschriftung folgt der Regel „leer, wenn sie dem Zeilennamen
   gleicht" - so halten es `vomAliasUebernehmen` und der Zweig, der neue
   Zeilen anlegt. `bestandVorrang` will sie anders (uebernehmen, sobald
   `common.name` gesetzt ist) und behaelt dafuer eine eigene Zeile.

   Und `role`/`typ` bleiben bei den beiden Stellen, die eine BESTEHENDE
   Zeile ueberschreiben (`bestandVorrang`, `vomAliasUebernehmen`), an
   ihrer `!== undefined`-Frage: dort steht schon der Vorlagenwert, und
   ein Alias, der gar keine Rolle nennt, soll ihn behalten statt ihn
   gegen den Leerstring zu tauschen, den diese Funktion liefert. Wer das
   wegraeumt, nimmt jedem vorlagenbasierten Alias seine Rollen. */
export function zeileAusAlias(o, zeilenname) {
  var c = (o && o.common) || {};
  var a = c.alias || {};
  var q = aliasQuellen(o);
  var nm = txt(c.name);
  return {
    role: c.role || '',
    typ: c.type || '',
    unit: c.unit || '',
    states: c.states || undefined,
    wr: !!c.write,
    /* Ein Taster meldet nichts, und der Alias sagt es mit `read: false`.
       Die Kennung steht trotzdem in `alias.id` — ioBroker verlangt sie —,
       aber als Lesequelle gilt sie nicht: sonst zeigte „Alias bearbeiten"
       eine Quelle, die „Alias anlegen" nie eingetragen hat, und beim
       naechsten Aktualisieren kippte `read` still auf `true` zurueck. */
    /* Seit 19.09.2026 auch beim Taster: `read: false` am Alias haengt an
       der Rolle, nicht an einer fehlenden Lesequelle (`knopfZeile`). Ein
       alter Taster-Alias mit einfacher `alias.id` liest also aus seinem
       Schreibziel - genau das, was ioBroker mit ihm ohnehin tut. */
    srcR: q.read || '',
    srcW: schreibQuelle(o),
    f: (typeof a.read === 'string') ? a.read : '',
    fw: (typeof a.write === 'string') ? a.write : '',
    caption: (nm && nm !== zeilenname) ? nm : ''
  };
}

export function aliasQuellen(obj) {
  var a = obj && obj.common && obj.common.alias;
  if (!a) { return {}; }
  if (typeof a.id === 'string') { return { read: a.id, write: a.id, einfach: true }; }
  if (a.id && typeof a.id === 'object') { return { read: a.id.read, write: a.id.write }; }
  return {};
}

/* Der Admin-Socket kennt kein getForeignState. getForeignStates(muster)
   und getState(id) funktionieren. */
export function holeWerte(kanal, extraIds, fertig) {
  var eindeutig = {};
  (extraIds || []).forEach(function (i) { if (i) { eindeutig[i] = 1; } });
  var liste = Object.keys(eindeutig);
  var offen = 1 + liste.length;
  var ab = function () { if (--offen <= 0) { fertig(); } };

  socket.emit('getForeignStates', kanal + '.*', function (err, res) {
    if (!err && res) { Object.keys(res).forEach(function (k) { if (res[k]) { S.werte[k] = res[k]; } }); }
    ab();
  });
  liste.forEach(function (id) {
    socket.emit('getState', id, function (err, st) {
      if (!err && st) { S.werte[id] = st; }
      ab();
    });
  });
}

/* Nur diese Kennungen, ohne den Rundumschlag ueber einen Kanal.

   Gebraucht dort, wo Zeilen erst spaeter dazukommen und ihre Quelle
   ausserhalb des angeklickten Knotens liegt - dann ist der Kanal
   laengst abgefragt, und ein zweites `getForeignStates` darauf braechte
   nichts als Last. */
export function holeEinzelne(ids, fertig) {
  var eindeutig = {};
  (ids || []).forEach(function (i) { if (i) { eindeutig[i] = 1; } });
  var liste = Object.keys(eindeutig);
  if (!liste.length) { if (typeof fertig === 'function') { fertig(false); } return; }
  var offen = liste.length, etwas = false;
  liste.forEach(function (id) {
    socket.emit('getState', id, function (err, st) {
      if (!err && st) { S.werte[id] = st; etwas = true; }
      if (--offen <= 0 && typeof fertig === 'function') { fertig(etwas); }
    });
  });
}

/* ================== Formel und Wert ================== */

/* Leseformeln sind fremder Code, der hier laeuft.

   Sie stehen in `common.alias.read` jedes Alias und in `leseformel`
   jeder Vorlage, und sie werden je Zeile bei JEDEM Zeichnen ausgefuehrt
   — ungefragt, nicht auf Knopfdruck. Das ist keine neue
   Rechteausweitung: Wer `common.alias.read` schreiben darf, hat
   dieselbe Formel schon im js-controller laufen. Es ist aber ein
   zusaetzlicher Ausfuehrungsort, und einer ohne Grenzen: `try/catch`
   faengt nur Ausnahmen, kein `while(true){}`.

   Zwei Schranken, beide billig:

   1. Gemerkt wird je (Formel, Rohwert). Dieselbe Formel auf demselben
      Wert laeuft genau einmal — und genau das ist der Regelfall, wenn
      alle 700 ms neu gezeichnet wird, ohne dass sich etwas geaendert
      hat.
   2. Wer einmal zu lange gebraucht hat, laeuft nicht wieder. Die Zeile
      sagt dann, warum. Den Reiter kann man damit noch einmal
      einfrieren, aber nicht dauerhaft — und nach dem Neuladen steht
      die Sperre wieder. */
var GEDULD_MS = 250;
var formelCache = new Map();
var formelGesperrt = {};

function cacheSchluessel(formel, roh) {
  var t = typeof roh;
  if (t === 'string') { return roh.length > 300 ? null : ('s:' + formel + '\u0000' + roh); }
  if (t === 'number' || t === 'boolean') { return t.charAt(0) + ':' + formel + '\u0000' + roh; }
  return null;
}

export function auswerten(formel, roh) {
  if (roh === undefined || roh === null) { return { ok: false, txt: tr('detail.noValue') }; }
  if (!formel) { return { ok: true, val: roh }; }
  if (formelGesperrt[formel]) {
    return { ok: false, txt: tr('detail.formulaTooSlow', formelGesperrt[formel]), fehler: true };
  }
  var sch = cacheSchluessel(formel, roh);
  if (sch !== null) {
    var da = formelCache.get(sch);
    if (da !== undefined) { return da; }
  }
  var raus;
  var t0 = performance.now();
  try {
    var v = (new Function('val', 'return (' + formel + ');'))(roh);
    if (v === undefined) { raus = { ok: false, txt: 'undefined', leer: true }; }
    else if (typeof v === 'number' && isNaN(v)) { raus = { ok: false, txt: 'NaN', leer: true }; }
    else { raus = { ok: true, val: v }; }
  } catch (e) {
    raus = { ok: false, txt: tr('detail.formulaThrows', e.message), fehler: true };
  }
  var gedauert = performance.now() - t0;
  if (gedauert > GEDULD_MS) {
    formelGesperrt[formel] = Math.round(gedauert);
    console.warn('[alias-workbench] Formula blocked after ' + Math.round(gedauert) + ' ms: ' + formel);
    return { ok: false, txt: tr('detail.formulaTooSlow', Math.round(gedauert)), fehler: true };
  }
  if (sch !== null) {
    /* Nicht unbegrenzt wachsen lassen: bei laufenden Werten entsteht je
       neuem Rohwert ein Eintrag. Zweitausend reichen fuer ein Zeichnen
       um ein Vielfaches; darueber wird der aelteste verworfen. */
    if (formelCache.size >= 2000) {
      var ersteR = formelCache.keys().next();
      if (!ersteR.done) { formelCache.delete(ersteR.value); }
    }
    formelCache.set(sch, raus);
  }
  return raus;
}

var JA   = ['ON', 'TRUE', 'YES', 'JA', '1'];
var NEIN = ['OFF', 'FALSE', 'NO', 'NEIN', '0'];

export function alsZieltyp(v, typ) {
  if (typ === 'boolean' && typeof v === 'string') {
    var t = v.trim().toUpperCase();
    if (JA.indexOf(t) > -1)   { return { val: true,  gewandelt: true }; }
    if (NEIN.indexOf(t) > -1) { return { val: false, gewandelt: true }; }
  }
  if (typ === 'number' && typeof v === 'string' && v.trim() !== '' && !isNaN(Number(v))) {
    return { val: Number(v), gewandelt: true };
  }
  return { val: v, gewandelt: false };
}

export function wertVon(s) {
  var st = S.werte[s.srcR];
  var roh = st ? st.val : undefined;
  var aus = auswerten(s.f, roh);
  if (aus.ok) {
    var um = alsZieltyp(aus.val, s.typ);
    aus.val = um.val;
    aus.gewandelt = um.gewandelt;
  }
  aus.roh = roh;
  return aus;
}

export function fmt(s) {
  var a = wertVon(s);
  if (!a.ok) { return '—'; }
  var v = a.val;
  if (typeof v === 'boolean') { return v ? 'an' : 'aus'; }
  if (typeof v === 'number') {
    var t = (s.dec === undefined || s.dec === '') ? String(v) : Number(v).toFixed(Number(s.dec));
    return t.replace('.', ',') + (s.unit ? ' ' + s.unit : '');
  }
  if (typeof v === 'object') { return JSON.stringify(v).slice(0, 30); }
  return String(v).slice(0, 30) + (s.unit ? ' ' + s.unit : '');
}

/* Steckt in der Formel nichts als ein ausgepacktes JSON-Feld? Dann ist
   es eines — sonst ist es eine Formel und bleibt eine.

   `(.+)` nahm frueher alles bis zum Zeilenende mit. Aus
   `JSON.parse(val).POWER === "ON"` wurde damit das „Feld"
   `POWER === "ON"`; eine daraus abgeleitete Vorlage trug den Vergleich
   im Feldnamen, und die Feldauswahl im Detail zeigte ihn als Eintrag. */
/* Seit 26.08.2026 schreibt die Werkbank den Zugriff abgesichert:
   `JSON.parse(val)?.ENERGY?.Power ?? null`. Beide Schreibweisen muessen
   als Feldzugriff durchgehen - sonst zeigt die Feldauswahl an einem
   Punkt, den die Werkbank selbst gebaut hat, „eigene Formel". */
/* ---- Feldpfade: Anfang (die Vorpruefung schneidet diesen Block heraus) ---- */

/* Ein Schluessel darf nur dann hinter den Punkt, wenn er ein gueltiger
   JS-Bezeichner ist. Sonst entsteht kein Zugriff, sondern etwas anderes:
   aus `?.DS18B20-1` wird die Rechnung `?.DS18B20 - 1?.…` (ergibt NaN),
   aus `?./dev/shm` und `?.1111740` wird ein Syntaxfehler. Gemessen an
   einem Frigate-Telegramm: von 233 angebotenen Feldern liessen sich so
   nur 27 benutzen. Deshalb Klammern, wo der Name keiner ist. */
var NAME_OK = /^[A-Za-z_$][\w$]*$/;

function feldSegment(name) {
  if (NAME_OK.test(name)) { return '?.' + name; }
  return "?.['" + String(name).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "']";
}

/* Ein Wegstueck ist entweder `?.name` oder `?.['name']` — die zweite
   Form auch mit doppelten Anfuehrungszeichen, falls sie jemand von Hand
   so geschrieben hat. */
var FELDTEIL = "\\??\\.(?:[A-Za-z_$][\\w$]*|\\[(?:'(?:[^'\\\\]|\\\\.)*'|\"(?:[^\"\\\\]|\\\\.)*\")\\])";
var FELDPFAD = new RegExp('^JSON\\.parse\\(val\\)((?:' + FELDTEIL + ')+)(?:\\s*\\?\\?\\s*null)?$');
var FELDSTUECK = new RegExp(FELDTEIL, 'g');

/* Der Feldpfad als Text und zurueck (X12, 19.09.2026).

   Gewoehnlich sind die Stuecke durch Punkte getrennt: `ENERGY.Power`,
   `service.storage./dev/shm.free`. Das bleibt zeichengleich - so stehen
   die Pfade in gespeicherten Vorlagen, und die sollen weiter gelten.
   Nur ein Schluessel, der SELBST einen Punkt enthaelt, steht in Klammern
   ohne Punkt davor: `cpu_usages['frigate.full_system'].cpu`. Vorher
   wurde er an jedem Punkt zerteilt, die Formel suchte
   `?.frigate?.full_system` und ergab null. Frigate hat so einen
   Schluessel in `stats`. Ein Stueck, das mit `[` anfaengt, kommt aus
   demselben Grund in Klammern. */
export function pfadAus(teile) {
  var raus = '';
  teile.forEach(function (t, n) {
    t = String(t);
    if (t.indexOf('.') > -1 || t.charAt(0) === '[') {
      raus += "['" + t.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "']";
    } else {
      raus += (n ? '.' : '') + t;
    }
  });
  return raus;
}

export function pfadTeile(pfad) {
  var s = String(pfad || ''), teile = [], i = 0;
  while (i < s.length) {
    if (s.charAt(i) === '.') { i++; continue; }
    if (s.slice(i, i + 2) === "['") {
      var j = i + 2, t = '';
      while (j < s.length && !(s.charAt(j) === "'" && s.charAt(j + 1) === ']')) {
        if (s.charAt(j) === '\\' && j + 1 < s.length) { j++; }
        t += s.charAt(j); j++;
      }
      teile.push(t); i = j + 2; continue;
    }
    var k = i;
    while (k < s.length && s.charAt(k) !== '.' && s.slice(k, k + 2) !== "['") { k++; }
    teile.push(s.slice(i, k)); i = k;
  }
  return teile;
}

export function feldAusFormel(f) {
  var m = FELDPFAD.exec(f || '');
  if (!m) { return ''; }
  var teile = [];
  var t;
  FELDSTUECK.lastIndex = 0;
  while ((t = FELDSTUECK.exec(m[1])) !== null) {
    var s = t[0].slice(t[0].indexOf('.') + 1);
    if (s.charAt(0) === '[') {
      /* Nur die Fluchtzeichen zurueckdrehen, die feldSegment setzt. */
      s = s.slice(2, -2).replace(/\\(.)/g, '$1');
    }
    teile.push(s);
  }
  /* Ein Punkt im Schluessel selbst kommt seit X12 in Klammern zurueck
     (`pfadAus`); vorher hiess das hier „eigene Formel". */
  return pfadAus(teile);
}

/* Der abgesicherte Zugriff auf ein JSON-Feld. An einer Stelle, damit die
   Vorlagen-Abkuerzung und die Feldauswahl im Detail dasselbe bauen. */
export function feldFormel(feld) {
  if (!feld) { return ''; }
  return 'JSON.parse(val)' + pfadTeile(feld).map(feldSegment).join('') + ' ?? null';
}

/* ---- Feldpfade: Ende ---- */

export function jsonFelder(id) {
  var st = S.werte[id];
  if (!st || typeof st.val !== 'string') { return null; }
  var o;
  try { o = JSON.parse(st.val); } catch { return null; }
  if (!o || typeof o !== 'object') { return null; }
  var raus = [];
  (function geh(x, weg, tiefe) {
    if (tiefe > 3) { return; }
    Object.keys(x).forEach(function (k) {
      var w = weg.concat([k]);
      if (x[k] && typeof x[k] === 'object' && !Array.isArray(x[k])) { geh(x[k], w, tiefe + 1); }
      else { raus.push(pfadAus(w)); }
    });
  })(o, [], 0);
  return raus;
}


/* Ist das Objekt ein Taster - ein Punkt ohne Zustand?

   `read: false` allein reicht nicht (siehe `zielKann`). Dazu muss er
   schreibbar sein und sich als Tastendruck ausweisen: Homematic ueber
   `native.TYPE: ACTION`, alle anderen ueber eine Rolle `button…`. Die
   eine Stelle fuer diese Frage - der Entwurf fragt sie auch. */
export function istTaster(o) {
  var c = (o && o.common) || {};
  var nat = (o && o.native) || {};
  return c.read === false && !!c.write &&
    (nat.TYPE === 'ACTION' || /^button/.test(String(c.role || '')));
}

/* Wird der Alias-Datenpunkt ein Knopf?

   Die eine Regel fuer `common.read` am Alias (Ricardo, 19.09.2026): Rolle
   `button…` UND ein Schreibziel -> Knopf, `read: false`. Alles andere
   `read: true`. So steht es in der Rollenliste von ioBroker: „Buttons
   (booleans, write-only) … common.write=true, common.read=false"; der
   Tastensensor (`button.press`, `button.long` ohne Schreiben) liest.

   Nicht aus der Quelle abgeleitet: deren `read` setzt jeder Adapter
   anders. hm-rpc schreibt `read: false` an `BOOST_MODE`, einen Schalter,
   der seinen Zustand meldet - uebernommen, zeichneten vis, Alexa und
   matter den Boost als Knopf. Und nicht aus einer fehlenden Lesequelle:
   gemessen am Testsystem liest ein Alias mit `read: false` trotzdem aus
   seiner Lesequelle, jeder Druck kommt an. */
export function knopfZeile(s) {
  return !!(s && s.srcW && /^button/.test(String(s.role || '')));
}

/* ---- Was das Ziel kann ---------------------------------------------

   Die Werkbank schreibt auf fremde Punkte und liest aus fremden Punkten.
   Ob die koennen, was von ihnen verlangt wird, stand nirgends: weder
   `common.read` noch `common.write` noch der Typ des Ziels wurden je
   angesehen (Ricardo, 15.09.2026).

   Drei Arten, wie es auseinandergeht, alle drei still:

     `formelBlind`  Die Schreibformel liefert Text, das Ziel nimmt keinen.
                    Der js-controller rechnet ihn auf den Zieltyp zurueck,
                    die Formel war umsonst. Aus `"ON"` wird wieder `true`.
     `nichtSchreibbar`  Das Ziel traegt `write: false`. ioBroker laesst den
                    Schreibvorgang trotzdem durch — gemessen —, der Adapter
                    dahinter reicht ihn aber nicht ans Geraet weiter.
                    Ein stiller Blindgaenger.
   Bis 19.09.2026 stand an dritter Stelle `meldetNichts`: jede Lesequelle
   mit `read: false` bekam die Marke „aendert sich nie". Gemessen am
   Produktivsystem traf das 1371 Punkte, 620 davon keine Taster, und 76
   dieser 620 hatten ihren Wert in den letzten 30 Tagen geaendert -
   `BOOST_MODE` an den Heizungen etwa. hm-rpc setzt `read: false`, sobald
   der Wert nicht *abfragbar* ist (OPERATIONS ohne Bit 1); gemeldet wird er
   trotzdem. Aus dem Feld allein laesst sich nicht ablesen, ob ein Punkt
   lebt, und wer der Marke folgte, nahm eine funktionierende Lesequelle
   heraus (Ricardo).

   Gibt eine Liste zurueck, nicht ein Urteil — wer sie anzeigt, entscheidet
   ueber die Schaerfe. */
export function zielKann(s) {
  var raus = [];
  if (!s) { return raus; }

  if (s.srcW) {
    var w = S.objects[s.srcW];
    var wc = (w && w.common) || null;
    if (wc) {
      if (wc.write === false) { raus.push({ art: 'nichtSchreibbar', punkt: s.srcW }); }
      /* Anfuehrungszeichen im Ausdruck sind der Beleg, dass die Formel Text
         liefert; ohne sie rechnet sie mit Zahlen oder Wahrheitswerten und
         passt zum Ziel. */
      if (s.fw && /['"`]/.test(s.fw) && (wc.type === 'boolean' || wc.type === 'number')) {
        raus.push({ art: 'formelBlind', punkt: s.srcW, typ: wc.type });
      }
    }
  }

  return raus;
}
