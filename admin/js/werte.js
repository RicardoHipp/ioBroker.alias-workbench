/* Werte und Quellen: nachschlagen, holen, Formeln auswerten, formatieren.

   S.werte ist der Vorrat der zuletzt gesehenen Zustaende; `wertVon`
   rechnet daraus, was eine Entwurfszeile anzeigen wuerde - samt
   Leseformel und Zieltyp. */

import { S } from './zustand.js';
import { socket } from './verbindung.js';
import { tr } from './sprache.js';
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


export function kindZustaende(kanal) {
  var pre = kanal + '.';
  return S.keysSorted.filter(function (k) {
    return k.indexOf(pre) === 0 && S.objects[k] && S.objects[k].type === 'state';
  });
}

export function direkteZustaende(kanal) {
  var pre = kanal + '.';
  return kindZustaende(kanal).filter(function (k) { return k.slice(pre.length).indexOf('.') === -1; });
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

/* ================== Formel und Wert ================== */
export function auswerten(formel, roh) {
  if (roh === undefined || roh === null) { return { ok: false, txt: tr('detail.noValue') }; }
  if (!formel) { return { ok: true, val: roh }; }
  try {
    var v = (new Function('val', 'return (' + formel + ');'))(roh);
    if (v === undefined) { return { ok: false, txt: 'undefined', leer: true }; }
    if (typeof v === 'number' && isNaN(v)) { return { ok: false, txt: 'NaN', leer: true }; }
    return { ok: true, val: v };
  } catch (e) {
    return { ok: false, txt: tr('detail.formulaThrows', e.message), fehler: true };
  }
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
