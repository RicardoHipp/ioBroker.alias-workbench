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
  var t = pfad.split('.');
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

export function kindZustaende(kanal) {
  var pre = kanal + '.';
  return mitVorspann(pre).filter(function (k) {
    return S.objects[k] && S.objects[k].type === 'state';
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
    console.warn('[alias-workbench] Formel gesperrt nach ' + Math.round(gedauert) + ' ms: ' + formel);
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
var FELDPFAD = /^JSON\.parse\(val\)\??\.([A-Za-z_$][\w$]*(?:\??\.[A-Za-z_$][\w$]*)*)(?:\s*\?\?\s*null)?$/;

export function feldAusFormel(f) {
  var m = FELDPFAD.exec(f || '');
  /* Der Feldname selbst traegt keine Fragezeichen. */
  return m ? m[1].split('?.').join('.') : '';
}

/* Der abgesicherte Zugriff auf ein JSON-Feld. An einer Stelle, damit die
   Vorlagen-Abkuerzung und die Feldauswahl im Detail dasselbe bauen. */
export function feldFormel(feld) {
  if (!feld) { return ''; }
  return 'JSON.parse(val)?.' + String(feld).split('.').join('?.') + ' ?? null';
}

export function jsonFelder(id) {
  var st = S.werte[id];
  if (!st || typeof st.val !== 'string') { return null; }
  var o;
  try { o = JSON.parse(st.val); } catch { return null; }
  if (!o || typeof o !== 'object') { return null; }
  var raus = [];
  (function geh(x, pfad, tiefe) {
    if (tiefe > 3) { return; }
    Object.keys(x).forEach(function (k) {
      var p = pfad ? pfad + '.' + k : k;
      if (x[k] && typeof x[k] === 'object' && !Array.isArray(x[k])) { geh(x[k], p, tiefe + 1); }
      else { raus.push(p); }
    });
  })(o, '', 0);
  return raus;
}
