/* Einen Teilbaum als Attrappe ausgeben.

   Zweck ist nicht das Sichern, sondern das Nachbauen: aus der Datei
   entsteht anderswo ein Geraet, das sich wie das Original verhaelt — ohne
   dass das Original da ist. Damit laesst sich eine Vorlage fuer ein
   Geraet bauen, das man nicht besitzt. Wer im Forum schreibt „fuer mein
   Geraet gibt es keine Vorlage", gibt seinen Teilbaum aus und schickt die
   Datei.

   Was mitgeht, steht in einer POSITIVLISTE, nicht in einer Sperrliste.
   Eine Sperrliste („password", „token", …) laesst immer ein Feld durch,
   an das niemand gedacht hat. `native` faellt deshalb vollstaendig weg —
   dort stehen IP-Adressen, Seriennummern und bei manchen Adaptern
   Zugangsdaten, und fuer den Zweck ist davon nichts noetig.

   Siehe plan_export_attrappe.md. */

import { S } from './zustand.js';
import { el } from './basis.js';
import { tr } from './sprache.js';
import { holeWerte } from './werte.js';
import { socket } from './verbindung.js';
import { INSTANZ_ID } from './vorlagen.js';

/* Die Nummer steigt, sobald sich das Format aendert — sonst liesse sich
   eine alte Datei nicht von einer neuen unterscheiden.

   Dass der Wert vom eigenen Block an den Eintrag wanderte (12.10.2026),
   hat sie NICHT erhoeht: zu dem Zeitpunkt war keine Datei im Umlauf, es
   gab das Einlesen noch nicht, und gelesen hat das Format nur der eigene
   Pruefpunkt Z2. Ab jetzt waere derselbe Schritt ein Versionssprung. */
export var FORMAT = 1;

/* Nur diese Felder aus `common` gehen mit.

   `states` MUSS dabei sein: ohne die Werteliste erkennt der
   type-detector die Plaetze mit `statesDefined` nicht, und genau die
   Erkennung will man an der Attrappe pruefen. */
var COMMON_FELDER = ['name', 'role', 'type', 'unit', 'read', 'write', 'min', 'max', 'def', 'states'];

/* Ab wann ist ein Teilbaum zu gross fuer eine Attrappe?

   Gemessen am 12.10.2026 an beiden Systemen. Produktiv, auf Geraeteebene:
   Median 20 Objekte, p90 136, p99 2551 — die Ausreisser sind
   `yr.0.forecastHourly` (3173), `dreame.0.852247104` (2857) und
   `mercedesme.0....` (2551). Am Testsystem: Median 25, p90 63.

   200 liegt deutlich ueber p90, schweigt also bei normalen Geraeten, und
   weit unter den Unfaellen. Bei 100 ginge die Warnung schon bei jedem
   siebten Geraet an — und man gewoehnt sich das Wegklicken an.

   Es ist eine Warnung, keine Sperre: wer 3000 Objekte ausgeben will,
   darf das, er soll es nur nicht aus Versehen tun. (Ricardo hatte am
   12.10.2026 `0_userdata` ausgegeben und wieder eingelesen — 393
   Objekte, darunter eine Attrappe in der Attrappe.) */
export var GROSS_AB = 200;

/* So viele Zeilen zeigt die Vorschau hoechstens. Bei 3000 Zeilen waere
   der Dialog unbrauchbar, und gelesen wuerde er ohnehin nicht. */
var ZEILEN_MAX = 300;

/* Alles unterhalb der Wurzel, die Wurzel eingeschlossen. */
function unterhalb(wurzel) {
  var pre = wurzel + '.';
  return Object.keys(S.objects).filter(function (id) {
    return id === wurzel || id.indexOf(pre) === 0;
  }).sort();
}

/* Die Ebenen zwischen Wurzel und einem Objekt, die selbst kein Objekt
   haben. ioBroker nennt so eine Stufe `virtual`; der Baum zeigt sie als
   „VIR". Sie gehoeren in die Datei, sonst beschriebe sie den Baum
   unvollstaendig — aber sie tragen kein `common`, und beim Einlesen soll
   erkennbar bleiben, dass dort nie ein Objekt stand. */
function virtuelleEbenen(wurzel, ids) {
  var da = {};
  ids.forEach(function (id) { da[id] = 1; });
  var raus = {};
  var tiefe = wurzel.split('.').length;
  ids.forEach(function (id) {
    var teile = id.split('.');
    for (var i = tiefe; i < teile.length; i++) {
      var pfad = teile.slice(0, i).join('.');
      if (!da[pfad] && !raus[pfad]) { raus[pfad] = 1; }
    }
  });
  return Object.keys(raus).sort();
}

function gesiebtesCommon(c) {
  var raus = {};
  COMMON_FELDER.forEach(function (f) {
    if (c && c[f] !== undefined) { raus[f] = JSON.parse(JSON.stringify(c[f])); }
  });
  return raus;
}

/* Der Pfad RELATIV zur Wurzel — der Grund, warum die Attrappe an einem
   anderen Ort dieselben Vorlagen trifft. Die Wurzel selbst bekommt den
   leeren Pfad. */
function relativ(wurzel, id) {
  return id === wurzel ? '' : id.slice(wurzel.length + 1);
}

/* Die beiden Versionen, die in die Datei gehoeren.

   `erzeugtVon` sagt, welche Werkbank die Datei geschrieben hat — wichtig,
   wenn jemand eine Datei schickt und etwas fehlt, das eine neuere Fassung
   mitschreibt.

   `quelle` ist die wichtigere: der Aufbau der Objekte kommt vom
   Quelladapter, und derselbe `tele.SENSOR` sieht unter zwei Fassungen des
   mqtt-Adapters verschieden aus. Aus `wurzel` liest man die Instanz ab,
   ihre Version nicht.

   `system.adapter.*` steht NICHT in S.objects — der Reiter laedt die
   Objekte des Baums, nicht die der Instanzen. Darum ueber den Socket. */
export function holeVersionen(wurzel, fertig) {
  var teile = String(wurzel).split('.');
  var quellInstanz = teile.length > 1 ? teile[0] + '.' + teile[1] : '';
  var raus = { erzeugtVon: null, quelle: null };
  var offen = 2;
  var ab = function () { if (--offen <= 0) { fertig(raus); } };

  socket.emit('getObject', INSTANZ_ID, function (err, o) {
    if (!err && o && o.common) {
      raus.erzeugtVon = { adapter: 'alias-workbench', version: o.common.version };
    }
    ab();
  });
  if (!quellInstanz) { ab(); return; }
  socket.emit('getObject', 'system.adapter.' + quellInstanz, function (err, o) {
    /* Kein Treffer ist kein Fehler: `0_userdata.0` und `alias.0` haben
       keine eigene Instanz in diesem Sinn. */
    if (!err && o && o.common) {
      raus.quelle = { adapter: quellInstanz, version: o.common.version };
    }
    ab();
  });
}

/* Aus dem, was geladen ist, die Datei bauen. Liest nichts nach — die
   Werte muessen vorher in S.werte stehen und die Versionen uebergeben
   sein (siehe `ausgeben`). */
export function sammle(wurzel, versionen) {
  var ids = unterhalb(wurzel);
  var objekte = [];

  virtuelleEbenen(wurzel, ids).forEach(function (id) {
    objekte.push({ pfad: relativ(wurzel, id), virtuell: true });
  });

  /* Der Wert steht AM Eintrag, nicht in einem eigenen Block.

     Getrennt waere es die sauberere Trennung — die Objekte beschreiben
     das Geraet, die Werte sind eine Momentaufnahme. Nur liest diese
     Datei ein Mensch: man bekommt sie geschickt und will bei
     `ENERGY.Power` sofort sehen, was dort steht, statt vierzig Zeilen
     weiter unten nachzuschlagen. Ricardo, 12.10.2026.

     Ein Punkt ohne Wert hat den Schluessel einfach nicht — es gibt ihn,
     er traegt nur gerade nichts. */
  ids.forEach(function (id) {
    var o = S.objects[id] || {};
    var eintrag = {
      pfad: relativ(wurzel, id),
      type: o.type,
      common: gesiebtesCommon(o.common),
    };
    var st = S.werte[id];
    if (st && st.val !== undefined && st.val !== null) { eintrag.wert = st.val; }
    objekte.push(eintrag);
  });
  objekte.sort(function (a, b) { return a.pfad.localeCompare(b.pfad); });

  var v = versionen || {};
  return {
    format: FORMAT,
    wurzel: wurzel,
    erzeugt: new Date().toISOString(),
    erzeugtVon: v.erzeugtVon || null,
    quelle: v.quelle || null,
    nativeEnthalten: false,
    objekte: objekte,
  };
}

/* ================== Auffaelliges in den Werten ==================

   Die Werte werden gebraucht — eine JSON-Quelle wie `tele/SENSOR` ist
   ohne ihren Inhalt nutzlos —, koennen aber eine Adresse oder eine
   Kennung tragen. Hier wird nichts entfernt, nur hervorgehoben: was
   auffaellig ist, entscheidet der Mensch, der die Datei verschickt. */
var MUSTER = [
  { art: 'ip', re: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/ },
  { art: 'mac', re: /\b[0-9A-Fa-f]{2}(?::[0-9A-Fa-f]{2}){5}\b/ },
];

/* Wann ist ein Stueck eine Kennung?

   Gesucht wird in Stuecken ab acht Zeichen aus `[0-9A-Za-z_]`. Der
   Bindestrich gehoert NICHT dazu: sonst waere `HM-LC-Sw1PBU-FM` ein
   Treffer, und eine Geraetebezeichnung ist keine Kennung. So zerfaellt
   sie in kurze Stuecke und faellt durch.

   Ein solches Stueck gilt als Kennung, wenn es
     - Buchstaben UND Ziffern traegt und ziffernlastig ist (ab 40 Prozent), oder
     - sehr lang ist (ab 20 Zeichen) und Ziffern traegt.

   Die Regel entstand in drei Anlaeufen, jeder mit einer Messung:

   1. „ab zwanzig Zeichen": verfehlte `QEQ0695220` und `000A9D899204D8`
      — genau die Seriennummern, um die es geht — und markierte
      `countSystemVariables`, einen Datenpunktnamen.
   2. „Buchstaben UND Ziffern": fing die Seriennummern, markierte aber
      `SetOption59`. Ein Tasmota-Befehl stuende damit in jeder
      Tasmota-Attrappe als Kennung (Ricardo, 12.10.2026 am Bild).
   3. Der Ziffernanteil trennt beides: `SetOption59` hat 18 Prozent,
      `QEQ0695220` 70, `000A9D899204D8` 79. Namen mit angehaengter Nummer
      (`Status11`, `SetOption19`, `POWER1`) bleiben darunter.

   Die zweite Bedingung, die Laenge, holt lange Schluessel herein, die
   nicht ziffernlastig sind — ein Base64-Zeichen hat oft nur ein Drittel
   Ziffern. Ohne Ziffern faellt auch ein langes Stueck durch, sonst waere
   `countSystemVariables` wieder dabei.

   4. Dass die ziffernlastige Haelfte auch Buchstaben verlangt, kam aus
      derselben Messung: `3.89.11.20260919` ist eine Firmware-Version, und
      `20260919` ist zu hundert Prozent Ziffern. Daten, Versionen und
      Zaehler sind reine Ziffern, Kennungen tragen fast immer Buchstaben.

   Aufgegeben wird damit die rein numerische Seriennummer. Die ist von
   einem Zaehler aber auch durch keine Regel zu unterscheiden — dort hilft
   nur, dass die Werte ueberhaupt in der Vorschau stehen. */
var KENNUNG = /[0-9A-Za-z_]{8,}/g;
function istKennung(stueck) {
  var ziffern = (stueck.match(/[0-9]/g) || []).length;
  if (!ziffern) { return false; }
  if (stueck.length >= 20) { return true; }
  return /[A-Za-z]/.test(stueck) && (ziffern / stueck.length) >= 0.4;
}

export function auffaellig(wert) {
  var t = typeof wert === 'string' ? wert : JSON.stringify(wert);
  if (!t) { return []; }
  var raus = MUSTER.filter(function (m) { return m.re.test(t); }).map(function (m) { return m.art; });
  if ((t.match(KENNUNG) || []).some(istKennung)) { raus.push('kennung'); }
  return raus;
}

/* Die Zeilen der Vorschau — dieselbe Quelle fuer den Dialog und fuer den
   Pruefpunkt, damit „was die Vorschau zeigt, steht auch in der Datei"
   nicht zwei Rechenwege hat. */
export function vorschauZeilen(daten) {
  return daten.objekte.map(function (o) {
    var c = o.common || {};
    return {
      pfad: o.pfad,
      type: o.virtuell ? '(ohne Objekt)' : o.type,
      virtuell: !!o.virtuell,
      name: typeof c.name === 'string' ? c.name : (c.name ? JSON.stringify(c.name) : ''),
      rolle: c.role || '',
      datentyp: c.type || '',
      einheit: c.unit || '',
      hatWert: 'wert' in o,
      wert: 'wert' in o ? o.wert : undefined,
      auffaellig: 'wert' in o ? auffaellig(o.wert) : [],
    };
  });
}

/* Kennungen stehen nicht nur in den Werten.

   Gemessen am 12.10.2026 an `hm-rega.0.QEQ0695220`: die Seriennummer
   steht in `wurzel` und in zwoelf `common.name`-Werten, obwohl `native`
   nachweislich fehlt. Das Weglassen von `native` entfernt also keine
   Kennung, die auch im Namen oder im Pfad steht — und davon muss die
   Vorschau sprechen, sonst verspricht sie mehr, als sie halten kann. */
export function auffaelligImGeruest(daten) {
  var raus = [];
  if (auffaellig(daten.wurzel).length) { raus.push({ wo: 'wurzel', text: daten.wurzel }); }
  daten.objekte.forEach(function (o) {
    var c = o.common || {};
    var n = typeof c.name === 'string' ? c.name : (c.name ? JSON.stringify(c.name) : '');
    if (n && auffaellig(n).length) { raus.push({ wo: o.pfad || '(Wurzel)', text: n }); }
  });
  return raus;
}

/* Gleiche Bauweise wie `vAusgeben` im Vorlagenblatt. */
function dateiGeben(daten) {
  var name = String(daten.wurzel).split('.').pop() || 'attrappe';
  var text = JSON.stringify(daten, null, 2) + '\n';
  var a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  a.download = name + '.attrappe.json';
  document.body.appendChild(a);
  a.click();
  setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
}

/* Werte holen, dann ausgeben. `holeWerte` fragt `getForeignStates` fuer
   alles unterhalb ab; die Wurzel selbst kommt als Einzelabfrage dazu,
   weil das Muster `<wurzel>.*` sie nicht einschliesst. */
export function ausgeben(wurzel, fertig) {
  holeWerte(wurzel, [wurzel], function () {
    holeVersionen(wurzel, function (versionen) {
      var daten = sammle(wurzel, versionen);
      dateiGeben(daten);
      if (typeof fertig === 'function') { fertig(daten); }
    });
  });
}

/* Abgewaehlte Werte herausnehmen.

   Der Wert faellt weg, das Objekt bleibt — und `werteAbgewaehlt` sagt,
   dass jemand ihn entfernt hat. Ohne diese Liste saehe ein entfernter
   Wert aus wie ein Punkt, der gerade nichts liefert. */
export function ohneAbgewaehlte(daten, abgewaehlt) {
  var raus = JSON.parse(JSON.stringify(daten));
  var weg = [];
  raus.objekte.forEach(function (o) {
    if (abgewaehlt.indexOf(o.pfad) > -1 && 'wert' in o) { delete o.wert; weg.push(o.pfad); }
  });
  if (weg.length) { raus.werteAbgewaehlt = weg.sort(); }
  return raus;
}

/* ================== Die Vorschau ================== */

export function zeigeVorschau(wurzel, fertig) {
  holeWerte(wurzel, [wurzel], function () {
    holeVersionen(wurzel, function (versionen) {
      var daten = sammle(wurzel, versionen);
      baueVorschau(daten);
      if (typeof fertig === 'function') { fertig(daten); }
    });
  });
}

function baueVorschau(daten) {
  var dlg = document.getElementById('dlg-mock');
  var body = document.getElementById('mock-body');
  var knopf = document.getElementById('btn-mock-go');
  if (!dlg || !body || !knopf) { return; }
  body.textContent = '';

  var zeilen = vorschauZeilen(daten);
  var mitWert = zeilen.filter(function (z) { return z.hatWert; });
  var abgewaehlt = [];

  var kopf = el('div', 'mk-kopf');
  kopf.appendChild(el('div', 'mk-wurzel', daten.wurzel));
  kopf.appendChild(el('div', 'mk-zahlen', tr('mock.counts',
    zeilen.length, mitWert.length,
    (daten.erzeugtVon && daten.erzeugtVon.version) || '?',
    (daten.quelle && (daten.quelle.adapter + ' ' + daten.quelle.version)) || '—')));
  kopf.appendChild(el('div', 'mk-ohne', tr('mock.noNative')));
  body.appendChild(kopf);

  /* Zu gross? Warnen, nicht sperren. */
  if (zeilen.length > GROSS_AB) {
    var gw = el('div', 'mk-warn mk-gross');
    gw.appendChild(el('div', 'mk-warn-kopf', tr('mock.tooBig', zeilen.length, GROSS_AB)));
    gw.appendChild(el('div', null, tr('mock.tooBigHint')));
    body.appendChild(gw);
  }

  /* Was auch ohne `native` mitfaehrt — Pfad und Namen. */
  var geruest = auffaelligImGeruest(daten);
  if (geruest.length) {
    var warn = el('div', 'mk-warn');
    warn.appendChild(el('div', 'mk-warn-kopf', tr('mock.inNames', geruest.length)));
    var ul = el('ul', 'mk-warn-liste');
    geruest.slice(0, 8).forEach(function (g) {
      ul.appendChild(el('li', null, g.wo + ' — ' + g.text));
    });
    warn.appendChild(ul);
    body.appendChild(warn);
  }

  var tab = el('table', 'mk-tab');
  var kz = el('tr');
  [tr('mock.colValue'), tr('mock.colPath'), tr('mock.colType'),
    tr('mock.colRole'), tr('mock.colName')].forEach(function (t) {
    kz.appendChild(el('th', null, t));
  });
  tab.appendChild(kz);

  zeilen.slice(0, ZEILEN_MAX).forEach(function (z) {
    var tz = el('tr', z.virtuell ? 'mk-virt' : '');
    var tdW = el('td', 'mk-wert');
    if (z.hatWert) {
      var lab = el('label');
      var box = el('input');
      box.type = 'checkbox';
      box.checked = true;
      box.addEventListener('change', function () {
        var i = abgewaehlt.indexOf(z.pfad);
        if (box.checked) { if (i > -1) { abgewaehlt.splice(i, 1); } }
        else if (i === -1) { abgewaehlt.push(z.pfad); }
        tz.classList.toggle('mk-aus', !box.checked);
      });
      lab.appendChild(box);
      var wt = el('span', 'mk-wtext', String(z.wert));
      if (z.auffaellig.length) {
        wt.classList.add('auff');
        wt.title = tr('mock.suspicious', z.auffaellig.join(', '));
      }
      lab.appendChild(wt);
      tdW.appendChild(lab);
    }
    tz.appendChild(tdW);
    tz.appendChild(el('td', 'mk-pfad', z.pfad || '·'));
    tz.appendChild(el('td', null, z.type + (z.datentyp ? ' · ' + z.datentyp : '') +
      (z.einheit ? ' ' + z.einheit : '')));
    tz.appendChild(el('td', null, z.rolle));
    tz.appendChild(el('td', 'mk-name', z.name));
    tab.appendChild(tz);
  });
  body.appendChild(tab);
  if (zeilen.length > ZEILEN_MAX) {
    body.appendChild(el('div', 'mk-mehr', tr('mock.more', zeilen.length - ZEILEN_MAX)));
  }

  /* Den Knopf neu setzen, damit kein Zuhoerer eines frueheren Aufrufs
     haengen bleibt und die Datei zweimal schreibt. */
  var neu = knopf.cloneNode(true);
  knopf.parentNode.replaceChild(neu, knopf);
  neu.addEventListener('click', function () {
    dateiGeben(ohneAbgewaehlte(daten, abgewaehlt));
    dlg.close();
  });

  if (!dlg.open) { dlg.showModal(); }
}

/* ================== Das Menue am Baum ==================

   Der Baum hatte bisher nur `click`. Ein eigenes Menue statt des
   Browsermenues, weil dort nichts steht, was hier hilft. */

var offenesMenue = null;

/* Welche Zeile das Menue meint.

   Ein Rechtsklick waehlt nicht aus — das bleibt dem Linksklick. Damit
   stand aber nirgends, von WELCHER Zeile die Attrappe entstehen wuerde,
   wenn man eine andere als die gewaehlte anklickt (Ricardo, 12.10.2026).
   Das ist nicht nur Kosmetik: so erzeugt man die Attrappe vom falschen
   Knoten. Die Marke ist bewusst eine andere als die Auswahl `sel`, sonst
   saehen zwei Zeilen gleich aus. */
var markierteZeile = null;

export function menueZu() {
  if (offenesMenue) { offenesMenue.remove(); offenesMenue = null; }
  if (markierteZeile) { markierteZeile.classList.remove('menueziel'); markierteZeile = null; }
}

function beiKlickDaneben(ev) {
  if (offenesMenue && !offenesMenue.contains(ev.target)) { menueZu(); }
}
document.addEventListener('mousedown', beiKlickDaneben);
document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape') { menueZu(); } });
window.addEventListener('scroll', menueZu, true);
window.addEventListener('resize', menueZu);

export function zeigeMenue(ev, knotenId, zeile) {
  ev.preventDefault();
  menueZu();

  var ziel = zeile || (ev.currentTarget && ev.currentTarget.classList
    && ev.currentTarget.classList.contains('node') ? ev.currentTarget : null);
  if (ziel) { ziel.classList.add('menueziel'); markierteZeile = ziel; }

  var m = el('div', 'baummenue');
  var z = el('div', 'bm-zeile', tr('tree.exportMock'));
  z.title = tr('tree.exportMockHint', knotenId);
  z.addEventListener('click', function () {
    menueZu();
    /* Erst zeigen, dann schreiben — wie ueberall sonst in der Werkbank.
       Hier geht nichts in die Objekte, aber die Datei verlaesst das
       Haus, und was darin steht, soll vorher jemand gesehen haben. */
    zeigeVorschau(knotenId);
  });
  m.appendChild(z);

  /* Einlesen haengt nicht am geklickten Knoten — eine Attrappe entsteht
     immer unter `0_userdata.0.wb-attrappe`. Der Eintrag steht trotzdem
     hier: alles zur Attrappe an einer Stelle, und der Dialog sagt, wo
     sie landet. */
  var zi = el('div', 'bm-zeile', tr('tree.importMock'));
  zi.title = tr('tree.importMockHint', ATTRAPPEN_WURZEL);
  zi.addEventListener('click', function () {
    menueZu();
    var f = document.getElementById('datei-attrappe');
    if (f) { f.click(); }
  });
  m.appendChild(zi);

  /* Erst anhaengen, dann messen: vorher hat das Menue keine Groesse und
     liesse sich nicht am Fensterrand ausrichten. */
  m.style.left = '0px';
  m.style.top = '0px';
  document.body.appendChild(m);
  var r = m.getBoundingClientRect();
  var x = Math.min(ev.clientX, window.innerWidth - r.width - 6);
  var y = Math.min(ev.clientY, window.innerHeight - r.height - 6);
  m.style.left = Math.max(6, x) + 'px';
  m.style.top = Math.max(6, y) + 'px';

  offenesMenue = m;
}

/* ================== Einlesen ==================

   Eingelesen wird NIE an den Originalpfad. Eine Attrappe landet immer
   unter `0_userdata.0.wb-attrappe.<name>`:

   - Der schlimme Fall kommt baulich nicht vor. Ein fremder Export von
     `hm-rpc.0.ABC123` zurueckzuschreiben, wo er herkam, traefe fremde
     Geraete; ein eigener ueberschriebe das Echte. Eine Einstellung
     („Einlesen erlauben") leistet das nicht: wer sie einschaltet, laesst
     sie an, und sie schuetzt nicht vor dem Ueberschreiben.
   - Die Vorlagen greifen trotzdem, weil sie RELATIVE Namen pruefen
     (`stat.POWER`, `1.LEVEL`), nicht die Wurzel. Der Pruefstand zeigt das
     seit Monaten: `wbFake` liegt unter `0_userdata.0.wbfake.mqtt.…`, und
     die mitgelieferten Vorlagen passen unveraendert.

   `0_userdata.0` und nicht `alias-workbench.0`: dort gehoeren vom Nutzer
   angelegte Objekte hin, der Pruefstand benutzt es schon so, und
   `alias-workbench.0` ist ein `meta`-Objekt fuer die Dateiablage.

   Geschrieben wird erst, wenn der Dialog gezeigt hat, was entstehen
   wuerde — dieselbe Zusage wie beim Trockenlauf. Der Trockenlauf des
   Alias selbst passt nicht: er haengt an `S.entwurf` und verlangt, dass
   jedes Objekt unter `alias.` liegt. */

export var ATTRAPPEN_WURZEL = '0_userdata.0.wb-attrappe';

/* Die Datei pruefen, bevor irgendetwas daraus gebaut wird. Gibt null
   zurueck, wenn sie taugt, sonst den Grund. */
export function pruefeDatei(roh) {
  if (!roh || typeof roh !== 'object') { return tr('mockin.badJson'); }
  if (roh.format !== FORMAT) { return tr('mockin.badFormat', String(roh.format), String(FORMAT)); }
  if (!Array.isArray(roh.objekte) || !roh.objekte.length) { return tr('mockin.badObjects'); }
  var schlecht = roh.objekte.filter(function (o) {
    return !o || typeof o !== 'object' || typeof o.pfad !== 'string';
  });
  if (schlecht.length) { return tr('mockin.badEntry', schlecht.length); }
  if (!roh.objekte.some(function (o) { return o.pfad === ''; })) { return tr('mockin.noRoot'); }
  return null;
}

function nameAus(wurzel) {
  var letzt = String(wurzel || '').split('.').pop() || 'attrappe';
  return letzt.replace(/[^\w-]/g, '_');
}

/* Was entstehen wuerde. Virtuelle Ebenen bekommen KEIN Objekt: im
   Original stand dort auch keins, und ioBroker zeigt die Stufe von selbst
   als `VIR` an. */
export function baueAttrappe(daten, name) {
  var basis = ATTRAPPEN_WURZEL + '.' + name;
  return daten.objekte.filter(function (o) { return !o.virtuell; }).map(function (o) {
    var id = o.pfad ? basis + '.' + o.pfad : basis;
    var obj = {
      type: o.type || 'folder',
      common: JSON.parse(JSON.stringify(o.common || {})),
      native: { angelegtVon: 'alias-workbench', attrappeAus: daten.wurzel },
    };
    if (!obj.common.name) { obj.common.name = o.pfad || name; }
    return { id: id, obj: obj, hatWert: 'wert' in o, wert: o.wert, schonDa: !!S.objects[id] };
  });
}

export function schreibeAttrappe(liste, fertig) {
  var offen = liste.length;
  if (!offen) { return fertig(); }
  liste.forEach(function (x) {
    socket.emit('setObject', x.id, x.obj, function () {
      if (!x.hatWert) { if (--offen <= 0) { fertig(); } return; }
      socket.emit('setState', x.id, { val: x.wert, ack: true }, function () {
        if (--offen <= 0) { fertig(); }
      });
    });
  });
}

export function einlesenDatei(datei) {
  var leser = new FileReader();
  leser.onload = function () {
    var roh = null;
    try { roh = JSON.parse(String(leser.result)); } catch { roh = null; }
    var fehler = pruefeDatei(roh);
    zeigeEinlesen(roh, fehler);
  };
  leser.readAsText(datei);
}

function zeigeEinlesen(daten, fehler) {
  var dlg = document.getElementById('dlg-mockin');
  var body = document.getElementById('mockin-body');
  var knopf = document.getElementById('btn-mockin-go');
  if (!dlg || !body || !knopf) { return; }
  body.textContent = '';

  var neuerKnopf = knopf.cloneNode(true);
  knopf.parentNode.replaceChild(neuerKnopf, knopf);

  if (fehler) {
    var f = el('div', 'mk-fehler');
    f.appendChild(el('div', 'mk-warn-kopf', tr('mockin.bad')));
    f.appendChild(el('div', null, fehler));
    body.appendChild(f);
    neuerKnopf.disabled = true;
    if (!dlg.open) { dlg.showModal(); }
    return;
  }
  neuerKnopf.disabled = false;

  var name = nameAus(daten.wurzel);
  var kopf = el('div', 'mk-kopf');
  kopf.appendChild(el('div', 'mk-ohne', tr('mockin.from', daten.wurzel,
    (daten.erzeugtVon && daten.erzeugtVon.version) || '?',
    (daten.quelle && (daten.quelle.adapter + ' ' + daten.quelle.version)) || '—')));

  var zeile = el('div', 'mk-namenszeile');
  zeile.appendChild(el('span', 'mk-lbl', tr('mockin.name')));
  var feld = el('input', 'tx');
  feld.type = 'text';
  feld.value = name;
  zeile.appendChild(feld);
  kopf.appendChild(zeile);
  var zielZeile = el('div', 'mk-wurzel');
  kopf.appendChild(zielZeile);
  body.appendChild(kopf);

  var tab = el('table', 'mk-tab');
  body.appendChild(tab);

  function malen() {
    name = nameAus(feld.value);
    var liste = baueAttrappe(daten, name);
    zielZeile.textContent = ATTRAPPEN_WURZEL + '.' + name;
    kopf.querySelector('.mk-zahlen') && kopf.querySelector('.mk-zahlen').remove();
    kopf.appendChild(el('div', 'mk-zahlen', tr('mockin.counts', liste.length,
      liste.filter(function (x) { return x.hatWert; }).length,
      liste.filter(function (x) { return x.schonDa; }).length)));
    tab.textContent = '';
    var kz = el('tr');
    [tr('mock.colPath'), tr('mock.colType'), tr('mock.colRole'), tr('mock.colValue')]
      .forEach(function (t) { kz.appendChild(el('th', null, t)); });
    tab.appendChild(kz);
    liste.forEach(function (x) {
      var tz = el('tr');
      var tdId = el('td', 'mk-pfad', x.id);
      if (x.schonDa) { tdId.appendChild(el('span', 'mk-schon', ' ' + tr('mockin.exists'))); }
      tz.appendChild(tdId);
      tz.appendChild(el('td', null, (x.obj.type || '') +
        (x.obj.common.type ? ' · ' + x.obj.common.type : '')));
      tz.appendChild(el('td', null, x.obj.common.role || ''));
      tz.appendChild(el('td', 'mk-wert', x.hatWert ? String(x.wert) : ''));
      tab.appendChild(tz);
    });
    return liste;
  }
  var liste = malen();
  feld.addEventListener('input', function () { liste = malen(); });

  neuerKnopf.addEventListener('click', function () {
    neuerKnopf.disabled = true;
    schreibeAttrappe(liste, function () {
      dlg.close();
      /* Der Baum weiss noch nichts von den neuen Objekten. */
      if (typeof window.__wbNachEinlesen === 'function') { window.__wbNachEinlesen(); }
    });
  });

  if (!dlg.open) { dlg.showModal(); }
}

/* Das Dateifeld anmelden. Dasselbe Muster wie beim Vorlagen-Einlesen in
   ergebnis.js: der Wert wird geleert, damit dieselbe Datei erneut geht. */
(function () {
  var f = document.getElementById('datei-attrappe');
  if (!f) { return; }
  f.addEventListener('change', function () {
    var datei = this.files && this.files[0];
    this.value = '';
    if (datei) { einlesenDatei(datei); }
  });
})();
