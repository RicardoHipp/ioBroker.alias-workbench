/* Die Tasmota-Werkzeuge: Befehlswissen, Sendepunkte, SetOption59.

   Ein Tasmota veroeffentlicht nie nach cmnd - was das Geraet an Befehlen
   kennt, steht in dem, was es sendet. Daraus baut die Werkbank auf
   Wunsch die Sendepunkte. */

import { S } from './zustand.js';
import { socket } from './verbindung.js';
import { $, el, klappZeichen } from './basis.js';
import { tr } from './sprache.js';
import { hatPunkt, jsonVon, kindZustaende } from './werte.js';
import './entwurf.js';
import { zeichneErgebnis } from './ergebnis.js';
import { holeZweig, holeObjekt, uebernimmObjekt } from './objekte.js';

/* ================== MQTT-Geraete ==================
   Ein Tasmota sendet nur nach stat und tele — cmnd ist sein Posteingang,
   dort veroeffentlicht es nie. Ein frisch angelegtes Geraet hat deshalb
   keine cmnd-Punkte, und ohne die greift keine Vorlage und kann kein
   Alias schalten. Was das Geraet an Befehlen kennt, steht aber in dem,
   was es sendet: die JSON-Schluessel in tele/STATE beziehungsweise
   StatusSTS sind die Befehlsnamen. */

var TASMOTA_BEFEHLE = null;        /* Geraetewissen, aus einer Datei */

export function ladeBefehlswissen(fertig) {
  fetch('./geraetewissen/tasmota-befehle.json')
    .then(function (r) { return r.json(); })
    .then(function (j) { TASMOTA_BEFEHLE = j; fertig(); })
    .catch(function () { TASMOTA_BEFEHLE = { befehle: {}, keineBefehle: [] }; fertig(); });
}

/* Die MQTT-Einstellung eines Objekts — sie sitzt je Objekt, nicht an der
   Instanz. Dort steht das Thema und, entscheidend, ob gesendet werden
   darf. */
export function mqttEinstellung(id) {
  var o = S.objects[id];
  if (!o || !o.common) { return null; }
  var cu = o.common.custom || {};
  var k = null;
  Object.keys(cu).forEach(function (x) { if (!k && /^mqtt/.test(x)) { k = x; } });
  if (!k) {
    /* Manche Objekte tragen das Thema nur in native. */
    if (o.native && o.native.topic) { return { instanz: null, topic: o.native.topic, publish: false }; }
    return null;
  }
  return { instanz: k, topic: cu[k].topic || (o.native || {}).topic || '', publish: !!cu[k].publish,
           roh: cu[k] };
}

/* Ist der Kanal ein MQTT-Geraet, und wie heisst sein Thema? Alles aus
   dem Bestand abgelesen — auch die Reihenfolge von Praefix und Thema,
   denn FullTopic ist frei einstellbar. */
export function mqttGeraet(kanal) {
  var kinder = kindZustaende(kanal);
  if (!kinder.length) { return null; }
  var fund = null;
  kinder.forEach(function (id) {
    if (fund) { return; }
    var e = mqttEinstellung(id);
    if (!e || !e.topic) { return; }
    var rel = id.slice(kanal.length + 1).split('.');
    if (rel.length < 2) { return; }
    var praefix = rel[0];                     /* stat | tele | cmnd */
    if (!/^(stat|tele|cmnd)$/i.test(praefix)) { return; }
    var teile = e.topic.split('/');
    var pi = -1;
    teile.forEach(function (t, i) { if (t.toLowerCase() === praefix.toLowerCase()) { pi = i; } });
    if (pi === -1) { return; }
    /* Alles ausser Praefix und dem letzten Stueck ist die Basis. */
    var ohne = teile.slice(0, teile.length - 1);
    ohne.splice(pi, 1);
    fund = {
      instanz: e.instanz,
      basis: ohne.join('/'),
      praefixIndex: pi,
      vorlage: teile.slice(0, teile.length - 1),   /* Muster mit Praefix an Stelle pi */
      beispiel: e.topic
    };
  });
  return fund;
}

/* Das Thema fuer einen bestimmten Punkt bauen, mit der abgelesenen
   Reihenfolge. */
function mqttThema(g, praefix, name) {
  var t = g.vorlage.slice();
  t[g.praefixIndex] = praefix;
  return t.join('/') + '/' + name;
}

/* Welche Befehle kennt das Geraet? Aus dem, was schon da ist. */
export function tasmotaBefehle(kanal) {
  var quellen = ['stat.STATUS11', 'tele.STATE', 'stat.RESULT'];
  var aus = null, woher = null;
  quellen.forEach(function (q) {
    if (aus) { return; }
    var id = hatPunkt(kanal, q);
    if (!id) { return; }
    var j = jsonVon(id);
    if (!j) { return; }
    if (j.StatusSTS) { j = j.StatusSTS; }
    var k = Object.keys(j);
    if (!k.length) { return; }
    aus = j; woher = q;
  });
  if (!aus) { return null; }

  var weg = (TASMOTA_BEFEHLE && TASMOTA_BEFEHLE.keineBefehle) || [];
  var liste = [];
  Object.keys(aus).forEach(function (f) {
    if (weg.indexOf(f) > -1) { return; }
    if (aus[f] !== null && typeof aus[f] === 'object' && !Array.isArray(aus[f])) { return; }
    liste.push({ name: f, wert: aus[f] });
  });
  return { woher: woher, befehle: liste };
}

/* Was das Geraetewissen zu einem Befehl sagt — mit %N% fuer POWER1..n. */
export function befehlsWissen(name) {
  var b = (TASMOTA_BEFEHLE && TASMOTA_BEFEHLE.befehle) || {};
  if (b[name]) { return b[name]; }
  var m = /^([A-Za-z_]+?)(\d{1,2})$/.exec(name);
  if (m && b[m[1] + '%N%']) { return b[m[1] + '%N%']; }
  return null;
}

/* Meldet das Geraet Aenderungen sofort? Das haengt an SetOption59.

   Die Bitmaske aus StatusLOG zu entziffern waere moeglich, ist aber
   versionsabhaengig und fehleranfaellig — eine Pruefung, die luegt, ist
   schlimmer als keine. Deshalb wird das Geraet gefragt: eine leere
   Nutzlast an cmnd/SetOption59 ist eine Abfrage, und die Antwort steht
   danach in stat/RESULT.

   Gemessen: mit SetOption59 ON kam tele/STATE drei Sekunden nach einer
   Scheme-Aenderung — also wirkt es auch fuer Licht-Befehle, nicht nur
   fuer POWER. */
/* Steht die Antwort noch in stat.RESULT, ist sie frisch — dann wird sie
   zugleich gemerkt. Sonst gilt die gemerkte.

   Vorher wurde nur stat.RESULT gelesen, und dort ueberschreibt der
   naechste Befehl die Antwort. Gemessen: nachfragen → „eingeschaltet",
   einmal schalten → wieder „unbekannt", obwohl sich am Geraet nichts
   geaendert hatte. Der Befund war praktisch nie stabil zu sehen. */
export function sofortRueckmeldung(kanal) {
  var id = hatPunkt(kanal, 'stat.RESULT');
  if (id) {
    var j = jsonVon(id);
    if (j && j.SetOption59 !== undefined) {
      var w = String(j.SetOption59).toUpperCase() === 'ON';
      merkeSo59(kanal, w);
      return w;
    }
  }
  var g = gemerktesSo59(kanal);
  return g ? g.wert : null;        /* unbekannt, nicht "aus" */
}

/* Gemerkt wird am cmnd-Punkt selbst — dort, wo die Frage gestellt wurde.
   Kein eigenes Objekt, und beim Aufraeumen verschwindet es mit. */
export function gemerktesSo59(kanal) {
  var id = hatPunkt(kanal, 'cmnd.SetOption59');
  var n = id && S.objects[id] && S.objects[id].native;
  if (!n || n.so59 === undefined) { return null; }
  return { wert: !!n.so59, zeit: n.so59Zeit || 0 };
}

function merkeSo59(kanal, wert) {
  var id = hatPunkt(kanal, 'cmnd.SetOption59');
  if (!id || !S.objects[id]) { return; }
  var n = S.objects[id].native || (S.objects[id].native = {});
  if (n.so59 === wert) { return; }
  n.so59 = wert;
  n.so59Zeit = neueZeit();
  var kopie = JSON.parse(JSON.stringify(S.objects[id]));
  socket.emit('setObject', id, kopie, function () {});
}

/* Zeitstempel ohne Date.now — das Skript laeuft im Browser, hier ist es
   unbedenklich, aber einheitlich an einer Stelle. */
function neueZeit() { return new Date().getTime(); }

function so59Alter(kanal) {
  var g = gemerktesSo59(kanal);
  if (!g || !g.zeit) { return ''; }
  var min = Math.round((neueZeit() - g.zeit) / 60000);
  if (min < 1) { return tr('mq.justAsked'); }
  if (min < 60) { return tr('mq.askedMinutes', min); }
  var std = Math.round(min / 60);
  if (std < 48) { return tr('mq.askedHours', std); }
  return tr('mq.askedDays', Math.round(std / 24));
}

/* Was fehlt dem Geraet an cmnd-Punkten, und welche koennen nicht senden? */
export function mqttLage(kanal) {
  var g = mqttGeraet(kanal);
  if (!g) { return null; }
  var b = tasmotaBefehle(kanal);
  var fehlen = [], stumm = [], da = [];
  if (b) {
    b.befehle.forEach(function (x) {
      var id = hatPunkt(kanal, 'cmnd.' + x.name);
      if (!id) { fehlen.push(x); return; }
      var m = mqttEinstellung(id);
      if (m && !m.publish) { stumm.push({ name: x.name, id: id }); } else { da.push(x.name); }
    });
  }
  /* Auch cmnd-Punkte, die es schon gibt, ohne dass sie im Zustand
     auftauchen — Status etwa. Stumm sind sie genauso. */
  kindZustaende(kanal).forEach(function (id) {
    var rel = id.slice(kanal.length + 1);
    if (rel.indexOf('cmnd.') !== 0) { return; }
    var name = rel.slice(5);
    if (stumm.some(function (x) { return x.name === name; })) { return; }
    if (da.indexOf(name) > -1) { return; }
    var m = mqttEinstellung(id);
    if (m && !m.publish) { stumm.push({ name: name, id: id }); }
  });
  return { geraet: g, befehle: b, fehlen: fehlen, stumm: stumm, da: da,
           sofort: sofortRueckmeldung(kanal) };
}

export function mqttKarte(host, kanal) {
  var l = mqttLage(kanal);
  if (!l) { return; }
  mqttStand = l;
  /* Ohne den Kanal baut der offene Dialog seine IDs aus „undefined" und
     legt die Punkte an einer Stelle an, die es nicht gibt. Der Dialog
     setzte ihn, das Neuzeichnen der Karte nicht — und seit die Werkbank
     auf Objektaenderungen horcht, wird waehrend eines offenen Dialogs
     oft neu gezeichnet. */
  mqttStand.kanal = kanal;

  var k = el('div', 'card');
  k.style.marginBottom = '11px';
  var ch = el('div', 'ch');
  ch.style.cursor = 'pointer';
  ch.appendChild(el('span', 'typ', tr('mq.title')));
  /* Der Basispfad ist eine Angabe, keine Statusmarke - als Chip stand
     er wie „fehlt" daneben und wurde obendrein grossgeschrieben. */
  var th = el('span', 'leise');
  th.textContent = l.geraet.basis;
  th.style.fontFamily = 'var(--mono)';
  th.style.fontSize = '11px';
  ch.appendChild(th);
  if (l.fehlen.length) { ch.appendChild(el('span', 'chip warn', tr('mq.missing', l.fehlen.length))); }
  if (l.stumm.length) { ch.appendChild(el('span', 'chip bad', tr('mq.mute', l.stumm.length))); }
  if (l.sofort === false) { ch.appendChild(el('span', 'chip warn', tr('mq.instantOffShort'))); }
  ch.insertBefore(klappZeichen(mqttAuf), ch.firstChild);
  ch.classList.add('klappbar');
  ch.addEventListener('click', function () { mqttAuf = !mqttAuf; zeichneErgebnis(); });
  k.appendChild(ch);

  if (!mqttAuf) {
    /* Zugeklappt bleibt die Warnung in der Kopfzeile stehen — man
       sieht, dass etwas ist, ohne die ganze Liste vor sich zu haben. */
    host.appendChild(k);
    return;
  }

  var b = el('div');
  b.style.padding = '9px 12px 11px';
  var einl = el('div', 'hint');
  einl.style.marginBottom = '9px';
  einl.textContent = tr('mq.intro');
  b.appendChild(einl);

  if (l.befehle) {
    b.appendChild(el('div', 'hint', tr('mq.commandsFrom', l.befehle.woher)));

    /* Je Befehl eine Zeile mit seinem Zustand. Vorher stand hier eine
       Aufzaehlung und darueber „2 fehlen, 1 kann nicht senden" — man
       sah die Zahlen, aber nicht, welcher Befehl welcher Fall ist. */
    var zustand = {};
    l.fehlen.forEach(function (x) { zustand[x.name] = 'fehlt'; });
    l.stumm.forEach(function (x) { zustand[x.name] = 'stumm'; });
    l.da.forEach(function (n) { zustand[n] = 'da'; });

    var reihen = l.befehle.befehle.map(function (x) { return x.name; });
    /* cmnd-Punkte, die es gibt, ohne im Zustand aufzutauchen — Status
       etwa. Die gehoeren mit in die Liste, sonst fehlt in der Zeile,
       was die Zahl oben mitzaehlt. */
    Object.keys(zustand).forEach(function (n) {
      if (reihen.indexOf(n) === -1) { reihen.push(n); }
    });
    /* Nach Namen, nicht nach Zustand. Sortiert man nach Zustand,
       rutscht jede Zeile beim Anlegen ans Ende — und wer mehrere
       nacheinander anlegt, klickt jedes Mal woanders hin. Welcher Fall
       vorliegt, sagt ohnehin die Spalte daneben. */
    reihen.sort(function (x, y) { return x < y ? -1 : (x > y ? 1 : 0); });

    var tab = el('div');
    tab.style.marginTop = '7px';
    reihen.forEach(function (n) {
      var r = el('div', 'slot');
      /* Feste Spalten: die Pillen fuellen ihre Spalte (alle gleich
         breit, sauber untereinander), die Knopfspalte ist breit genug
         fuer „senden erlauben" in einer Zeile (Ricardo, 25.08.2026). */
      r.style.gridTemplateColumns = '1fr 160px 132px';
      r.style.padding = '3px 0';
      var nm = el('span', 'sn', 'cmnd.' + n);
      nm.style.fontFamily = 'var(--mono)';
      nm.style.fontWeight = '400';
      r.appendChild(nm);
      var z = zustand[n];
      var c = el('span', 'mchip');
      if (z === 'fehlt') { c.appendChild(el('span', 'chip warn', tr('mq.stMissing'))); }
      else if (z === 'stumm') { c.appendChild(el('span', 'chip bad', tr('mq.stMute'))); }
      else { c.appendChild(el('span', 'chip ok', tr('mq.stFine'))); }
      r.appendChild(c);

      /* Handeln, wo es etwas zu tun gibt — je Zeile einzeln, ohne
         Umweg ueber den Sammeldialog. */
      var h = el('span', 'mknopf');
      if (z === 'fehlt') {
        var bn = el('button', 'btn schmal', tr('mq.rowCreate'));
        bn.addEventListener('click', function () { mqttEinzeln(kanal, n, 'neu', bn); });
        h.appendChild(bn);
      } else if (z === 'stumm') {
        var bs2 = el('button', 'btn schmal', tr('mq.rowAllow'));
        bs2.addEventListener('click', function () { mqttEinzeln(kanal, n, 'frei', bs2); });
        h.appendChild(bs2);
      }
      r.appendChild(h);
      tab.appendChild(r);
    });
    b.appendChild(tab);
  } else {
    b.appendChild(el('div', 'hint', tr('mq.nothingYet')));
  }

  var leiste = el('div');
  leiste.style.marginTop = '10px';
  leiste.style.display = 'flex';
  leiste.style.gap = '8px';
  leiste.style.flexWrap = 'wrap';
  leiste.style.alignItems = 'center';

  if (l.fehlen.length || l.stumm.length) {
    var ba = el('button', 'btn primary', tr('mq.fix'));
    ba.addEventListener('click', function () { zeigeMqttDialog(kanal); });
    leiste.appendChild(ba);
  }
  b.appendChild(leiste);

  /* Sofortige Rueckmeldung — Zustand und, wenn noetig, der Schalter. */
  var sk = el('div');
  sk.style.marginTop = '11px';
  sk.style.paddingTop = '10px';
  sk.style.borderTop = '1px solid var(--line)';
  var sz = el('div');
  sz.style.fontSize = '11.5px';
  sz.appendChild(el('b', null, tr('mq.instant') + '  '));
  if (l.sofort === true) {
    sz.appendChild(el('span', 'chip ok', tr('mq.instantOn')));
  } else if (l.sofort === false) {
    sz.appendChild(el('span', 'chip warn', tr('mq.instantOff')));
  } else {
    sz.appendChild(el('span', 'chip mut', tr('mq.instantUnknown')));
  }
  sk.appendChild(sz);
  if (so59Stumm[kanal] && l.sofort === null) {
    var st59 = el('div', 'hint');
    st59.style.marginTop = '4px';
    st59.style.color = 'var(--warn)';
    st59.textContent = tr('mq.askNoAnswer');
    sk.appendChild(st59);
  }

  var sl = el('div');
  sl.style.marginTop = '7px';
  sl.style.display = 'flex';
  sl.style.gap = '8px';
  sl.style.flexWrap = 'wrap';
  if (l.sofort !== true) {
    /* Beide gleich gross - schmal neben normal las sich wie zwei
       verschiedene Schriften (Ricardo, 25.08.2026). */
    var lauf = so59Laeuft[kanal];
    var bp = el('button', 'btn schmal' + (lauf === 'pruefen' ? ' laedt' : ''),
      lauf === 'pruefen' ? tr('mq.instantChecking') : tr('mq.instantCheck'));
    bp.addEventListener('click', function () { so59(kanal, bp, ''); });
    sl.appendChild(bp);
    var be = el('button', 'btn schmal' + (lauf === 'einschalten' ? ' laedt' : ''),
      lauf === 'einschalten' ? tr('mq.instantEnabling') : tr('mq.instantEnable'));
    be.addEventListener('click', function () { so59(kanal, be, '1'); });
    sl.appendChild(be);
    if (lauf) { bp.disabled = true; be.disabled = true; }
  }
  sk.appendChild(sl);
  var hinweis = l.sofort === true ? tr('mq.instantHintOn')
    : (l.sofort === false ? tr('mq.instantHintOff') : tr('mq.instantHintUnknown'));
  /* Woher der Befund stammt, gehoert dazu — sonst weiss niemand, ob er
     von eben ist oder von vorgestern. */
  var alter = (l.sofort === null) ? '' : so59Alter(kanal);
  sk.appendChild(el('div', 'hint', hinweis + (alter ? '  ·  ' + alter : '')));
  b.appendChild(sk);

  /* Nachfragen liefert dasselbe wie tele/STATE — gemessen, Feld fuer
     Feld. Der Knopf erscheint deshalb nur, wenn es etwas zu holen gibt:
     gar nichts gelesen, oder nur stat.RESULT, das meist bloss die
     Antwort auf den letzten Befehl enthaelt und nicht den ganzen
     Zustand. Steht die Liste vollstaendig da, gibt es den Knopf nicht —
     er koennte nichts hinzufuegen. */
  var luecke = !l.befehle || l.befehle.woher === 'stat.RESULT';
  if (luecke) {
    var kasten = el('div');
    kasten.style.marginTop = '11px';
    kasten.style.paddingTop = '10px';
    kasten.style.borderTop = '1px solid var(--line)';
    var bf = el('button', 'btn' + (l.befehle ? '' : ' primary')
      + (abfrageLaeuft[kanal] ? ' laedt' : ''),
      abfrageLaeuft[kanal] ? tr('mq.asking') : tr('mq.ask'));
    if (abfrageLaeuft[kanal]) { bf.disabled = true; }
    bf.addEventListener('click', function () { mqttFragen(kanal, bf); });
    kasten.appendChild(bf);
    var warum = el('div', 'hint');
    warum.style.marginTop = '6px';
    warum.textContent = (l.befehle ? tr('mq.onlyResult') : tr('mq.neverReported')) +
      '  ' + tr('mq.askHint');
    kasten.appendChild(warum);
    if (mqttAbfrage[kanal] !== undefined) {
      var ah = el('div', 'hint');
      ah.style.marginTop = '6px';
      var ab = mqttAbfrage[kanal];
      if (ab && ab.fehler) {
        ah.textContent = tr('mq.askError', ab.fehler);
        ah.style.color = 'var(--bad)';
      } else {
        ah.textContent = ab ? tr('mq.askGotAnswer', ab) : tr('mq.askNoAnswer');
        ah.style.color = ab ? 'var(--ok)' : 'var(--warn)';
      }
      kasten.appendChild(ah);
    }
    b.appendChild(kasten);
  }

  k.appendChild(b);
  host.appendChild(k);
}

var mqttStand = null;
var mqttAuswahl = {};
/* Bleibt ueber das Neuzeichnen hinweg stehen — sonst klappte die Karte
   nach jeder Handlung wieder zu. */
/* Was die letzte Befehlsabfrage ergeben hat, je Geraet. Ohne diese
   Notiz klickte man „Befehle abfragen" und sah hinterher nichts —
   weder Erfolg noch Fehlschlag. */
var mqttAbfrage = {};

/* Ein abgelehntes setObject/setState darf nicht stumm bleiben: vorher
   blieb der Knopf ausgegraut auf „frage nach …“ stehen, und man sah
   weder Erfolg noch Fehlschlag. Der Fehler landet im Abfrage-Vermerk
   der Karte und ueberlebt so auch das Neuzeichnen. */
/* Hat die letzte SetOption59-Nachfrage eine Antwort gebracht? Ohne den
   Merker blieb bei einem stummen Geraet einfach die Marke UNBEKANNT
   stehen, und der Klick sah aus wie ein Klick ins Leere (Ricardos
   RGB-Licht, offline). */
var so59Stumm = {};

/* Laeuft gerade eine Nachfrage? Der Klick sperrt zwar den Knopf, aber
   das Anlegen des Abfragepunkts loest selbst ein Neuzeichnen aus - und
   das baute einen frischen, aktiven Knopf, waehrend die Kette noch
   lief. Erst kam der Knopf wieder, Sekunden spaeter die Antwortzeile:
   genau die Verwirrung. Der Laufzustand haelt je Kanal fest, was
   gedrueckt wurde, und das Zeichnen sperrt entsprechend. */
var so59Laeuft = {};

/* Dasselbe fuer die Status-Abfrage. */
var abfrageLaeuft = {};

function mqttFehlgeschlagen(kanal, err) {
  delete abfrageLaeuft[kanal];
  delete so59Laeuft[kanal];
  mqttAbfrage[kanal] = { fehler: String(err) };
  zeichneErgebnis();
}

/* Ueberlebt das Neuzeichnen — wie bei der MQTT-Karte. */

var mqttAuf = false;

/* Leere Nutzlast fragt nur, "1" schaltet ein. Beides ueber denselben
   Weg, damit es nur eine Stelle gibt, die das Objekt anlegt. */
function so59(kanal, knopf, wert) {
  var g = mqttGeraet(kanal);
  if (!g) { return; }
  so59Laeuft[kanal] = wert ? 'einschalten' : 'pruefen';
  delete so59Stumm[kanal];
  /* Sofort neu zeichnen: erst damit sperren sich BEIDE Knoepfe und die
     alte Antwortzeile verschwindet - vorher passierte das erst mit dem
     naechsten Nachzieher, Sekunden spaeter (Ricardo, 25.08.2026). */
  zeichneErgebnis();
  var thema = mqttThema(g, 'cmnd', 'SetOption59');
  var id = hatPunkt(kanal, 'cmnd.SetOption59') || (kanal + '.cmnd.SetOption59');
  var obj = {
    type: 'state',
    common: { name: 'SetOption59', type: 'mixed', read: true, write: true, role: 'text',
              desc: tr('mq.createdBy'), custom: mqttCustom(g, thema) },
    native: { topic: thema }
  };
  socket.emit('setObject', id, obj, function (err) {
    if (err) { delete so59Laeuft[kanal]; return mqttFehlgeschlagen(kanal, err); }
    setTimeout(function () {
      socket.emit('setState', id, { val: wert, ack: false }, function (err2) {
        if (err2) { delete so59Laeuft[kanal]; return mqttFehlgeschlagen(kanal, err2); }
        setTimeout(function () {
          socket.emit('setState', id, { val: wert, ack: false }, function () {
            setTimeout(function () {
              holeZweig(kanal + '.', function () {
                delete so59Laeuft[kanal];
                so59Stumm[kanal] = (sofortRueckmeldung(kanal) === null);
                zeichneErgebnis();
              });
            }, 4000);
          });
        }, 4000);
      });
    }, 2000);
  });
}

/* Status 11 aktiv anfordern. Eine Abfrage — sie schaltet nichts.
   Antwortet das Geraet nicht, muss das dranstehen: vorher klickte man
   und es passierte sichtbar gar nichts. */
function mqttFragen(kanal, _knopf) {
  var g = mqttGeraet(kanal);
  if (!g) { return; }
  abfrageLaeuft[kanal] = true;
  delete mqttAbfrage[kanal];
  zeichneErgebnis();
  var thema = mqttThema(g, 'cmnd', 'Status');
  var id = kanal + '.cmnd.Status';
  var vorhanden = hatPunkt(kanal, 'cmnd.Status');
  if (vorhanden) { id = vorhanden; }

  var obj = {
    type: 'state',
    common: {
      name: 'Status', type: 'mixed', read: true, write: true, role: 'text',
      desc: tr('mq.createdBy'),
      custom: mqttCustom(g, thema)
    },
    native: { topic: thema }
  };

  socket.emit('setObject', id, obj, function (err) {
    if (err) { return mqttFehlgeschlagen(kanal, err); }
    /* Beim ersten Schreiben nach dem Anlegen legt der mqtt-client nur
       die Antwortobjekte an und verwirft die Werte — gemessen. Deshalb
       zweimal fragen. */
    setTimeout(function () {
      socket.emit('setState', id, { val: '11', ack: false }, function (err2) {
        if (err2) { return mqttFehlgeschlagen(kanal, err2); }
        setTimeout(function () {
          /* Status 5 gleich mit: dort steht die IP, und die fehlt an
             jedem Geraet, das seit dem Einbinden nicht neu gestartet
             ist — tele/INFO2 kommt nur beim Start. */
          socket.emit('setState', id, { val: '5', ack: false }, function () {});
          socket.emit('setState', id, { val: '11', ack: false }, function () {
            setTimeout(function () {
              /* Kam eine Antwort? Nur dann hat die Abfrage etwas
                 gebracht. Ohne diese Rueckmeldung klickte man und sah
                 nichts — weder Erfolg noch Fehlschlag. */
              /* Das Ergebnis gehoert in den Zustand, nicht ins DOM:
                 das Nachladen zeichnet die Karte neu, und ein Hinweis,
                 den man an den Knopf gehaengt hat, waere danach
                 verwaist. */
              holeZweig(kanal + '.', function () {
                delete abfrageLaeuft[kanal];
                var bb = tasmotaBefehle(kanal);
                mqttAbfrage[kanal] = (bb && bb.befehle.length) ? bb.befehle.length : 0;
                zeichneErgebnis();
              });
            }, 5000);
          });
        }, 5000);
      });
    }, 2000);
  });
}

function mqttCustom(g, thema) {
  var c = {};
  var inst = g.instanz || 'mqtt-client.0';
  c[inst] = {
    enabled: true, topic: thema,
    publish: true, pubChangesOnly: false, pubAsObject: false,
    qos: 0, retain: false,
    subscribe: true, subChangesOnly: false, subAsObject: false, subQos: 0,
    setAck: true
  };
  return c;
}

/* Einen einzelnen Punkt anlegen oder ihm das Senden erlauben. Klein
   genug, dass ein Trockenlauf nur im Weg staende — die Zeile sagt ja,
   was passiert. Der Sammeldialog bleibt fuer mehrere auf einmal. */
/* Denselben Punkt anlegen, aber ohne Knopf — fuer den Trockenlauf, der
   mehrere auf einmal nachzieht. */
/* Ohne eigenes Nachladen und ohne Ruecklesen: was gerade geschrieben
   wurde, ist bekannt — es kommt direkt in S.objects. Ueber getObjectView
   zurueckzulesen ist ein Wettlauf: die Sicht hinkt dem frisch
   geschriebenen Objekt einen Wimpernschlag hinterher, und der
   Trockenlauf sperrte weiter wegen eines Punktes, den es laengst gab. */
export function mqttEinzelnStill(kanal, name, fertig) {
  var bau = mqttPunktBauen(kanal, name, 'neu');
  if (!bau) { return fertig && fertig(); }
  socket.emit('setObject', bau.id, bau.obj, function () {
    uebernimmObjekt(bau.id, bau.obj);
    if (fertig) { fertig(); }
  });
}

function mqttPunktBauen(kanal, name, was) {
  var g = mqttGeraet(kanal);
  if (!g) { return null; }
  var id, obj;
  if (was === 'frei') {
    id = hatPunkt(kanal, 'cmnd.' + name);
    var alt0 = S.objects[id];
    if (!alt0) { return null; }
    obj = JSON.parse(JSON.stringify(alt0));
    var cu0 = obj.common.custom || {};
    Object.keys(cu0).forEach(function (i) { if (/^mqtt/.test(i)) { cu0[i].publish = true; } });
    obj.common.custom = cu0;
  } else {
    var w0 = befehlsWissen(name) || {};
    var thema0 = mqttThema(g, 'cmnd', name);
    id = kanal + '.cmnd.' + name;
    var common0 = {
      name: name,
      role: w0.rolle || 'state',
      type: w0.typ || 'mixed',
      read: true, write: true,
      desc: tr('mq.createdBy'),
      custom: mqttCustom(g, thema0)
    };
    if (w0.einheit) { common0.unit = w0.einheit; }
    if (w0.werteliste) { common0.states = w0.werteliste; }
    obj = { type: 'state', common: common0, native: { topic: thema0 } };
  }
  return { id: id, obj: obj };
}

export function mqttEinzeln(kanal, name, was, knopf) {
  var g = mqttGeraet(kanal);
  if (!g) { return; }
  knopf.disabled = true;
  knopf.textContent = tr('mq.rowWorking');

  var id, obj;
  if (was === 'frei') {
    id = hatPunkt(kanal, 'cmnd.' + name);
    var alt = S.objects[id];
    if (!alt) { return; }
    obj = JSON.parse(JSON.stringify(alt));
    var cu = obj.common.custom || {};
    Object.keys(cu).forEach(function (i) { if (/^mqtt/.test(i)) { cu[i].publish = true; } });
    obj.common.custom = cu;
  } else {
    var w = befehlsWissen(name) || {};
    var thema = mqttThema(g, 'cmnd', name);
    id = kanal + '.cmnd.' + name;
    var common = {
      name: name,
      role: w.rolle || 'state',
      type: w.typ || 'mixed',
      read: true, write: true,
      desc: tr('mq.createdBy'),
      custom: mqttCustom(g, thema)
    };
    if (w.einheit) { common.unit = w.einheit; }
    if (w.werteliste) { common.states = w.werteliste; }
    obj = { type: 'state', common: common, native: { topic: thema } };
  }

  socket.emit('setObject', id, obj, function (err) {
    if (err) {
      knopf.disabled = false;
      knopf.textContent = tr('write.retry');
      knopf.title = String(err);
      return;
    }
    holeObjekt(id);
  });
}

export function zeigeMqttDialog(kanal) {
  var l = mqttLage(kanal);
  if (!l) { return; }
  mqttStand = l;
  mqttStand.kanal = kanal;
  mqttAuswahl = {};
  l.fehlen.forEach(function (x) {
    var w = befehlsWissen(x.name);
    /* Vorgehakt nur, was eine Geraetefunktion ist: bekannt, keine
       Dopplung und keine blosse Einstellung des Geraets. */
    mqttAuswahl['neu:' + x.name] = !!w && !w.vorgabeAus && !istDopplung(x.name, l);
  });
  l.stumm.forEach(function (x) { mqttAuswahl['fix:' + x.name] = true; });
  zeichneMqttDialog();
  $('#dlg-mqtt').showModal();
}

/* HSBColor und Channel beschreiben dieselbe Farbe wie Color. Alle drei
   anzulegen ergibt drei Punkte, die sich gegenseitig ueberschreiben. */
function istDopplung(name, l) {
  var w = befehlsWissen(name);
  if (!w || !w.dopplung) { return false; }
  return l.fehlen.some(function (x) { return x.name === w.dopplung; }) ||
         l.da.indexOf(w.dopplung) > -1;
}

function zeichneMqttDialog() {
  var l = mqttStand;
  var body = $('#mqtt-body');
  body.textContent = '';

  var kopf = el('div');
  kopf.style.marginBottom = '11px';
  kopf.style.fontSize = '12.5px';
  kopf.appendChild(el('b', null, l.geraet.basis));
  if (l.befehle) {
    kopf.appendChild(el('div', 'hint', tr('mq.commandsFrom', l.befehle.woher)));
  }
  body.appendChild(kopf);

  if (l.fehlen.length) {
    var nk = el('div', 'card');
    nk.style.marginBottom = '11px';
    var nh = el('div', 'ch');
    nh.appendChild(el('span', 'typ', tr('mq.newPoints')));
    /* Vorher stand hier die Zahl der fehlenden Punkte, angelegt wurden
       aber nur die vorausgewaehlten — „10 Sendepunkte fehlen" ueber
       einem Knopf „Anlegen (4)". */
    var gewaehlt = l.fehlen.filter(function (y) { return mqttAuswahl['neu:' + y.name]; }).length;
    nh.appendChild(el('span', 'chip ' + (gewaehlt ? 'warn' : 'mut'),
      tr('mq.selectedOf', gewaehlt, l.fehlen.length)));
    nk.appendChild(nh);
    l.fehlen.forEach(function (x) {
      var w = befehlsWissen(x.name);
      var r = el('div', 'slot');
      r.style.gridTemplateColumns = '24px 1fr 1.2fr 1fr';
      var cw = el('span');
      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = !!mqttAuswahl['neu:' + x.name];
      cb.addEventListener('change', function () {
        mqttAuswahl['neu:' + x.name] = cb.checked; zeichneMqttDialog();
      });
      cw.appendChild(cb);
      r.appendChild(cw);
      var nm = el('span', 'sn', 'cmnd.' + x.name);
      nm.style.fontFamily = 'var(--mono)';
      r.appendChild(nm);
      r.appendChild(el('span', 'rx', w ? (w.rolle || '—') + (w.einheit ? '  ' + w.einheit : '') : tr('mq.unknownCommand')));
      var wz = el('span', 'rx', w && w.was ? w.was : (tr('mq.nowValue') + ' ' + JSON.stringify(x.wert)));
      if (w && w.dopplung) { wz.appendChild(el('span', 'chip warn', tr('mq.duplicate', w.dopplung))); }
      r.appendChild(wz);
      nk.appendChild(r);
    });
    body.appendChild(nk);
  }

  if (l.stumm.length) {
    var sk = el('div', 'card');
    sk.style.marginBottom = '11px';
    var sh = el('div', 'ch');
    sh.appendChild(el('span', 'typ', tr('mq.repair')));
    sh.appendChild(el('span', 'chip bad', tr('mq.mute', l.stumm.length)));
    sk.appendChild(sh);
    sk.appendChild(el('div', 'hint', tr('mq.repairHint')));
    l.stumm.forEach(function (x) {
      var r = el('div', 'slot');
      r.style.gridTemplateColumns = '24px 1fr';
      var cw = el('span');
      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = !!mqttAuswahl['fix:' + x.name];
      cb.addEventListener('change', function () {
        mqttAuswahl['fix:' + x.name] = cb.checked; zeichneMqttDialog();
      });
      cw.appendChild(cb);
      r.appendChild(cw);
      var nm = el('span', 'sn', 'cmnd.' + x.name);
      nm.style.fontFamily = 'var(--mono)';
      r.appendChild(nm);
      sk.appendChild(r);
    });
    body.appendChild(sk);
  }

  /* Trockenlauf: das fertige Objekt, bevor es entsteht. */
  var liste = mqttZuSchreiben();
  var jk = el('div', 'card');
  var jh = el('div', 'ch');
  jh.appendChild(el('span', 'typ', tr('write.dryTitleCreate')));
  jh.appendChild(el('span', 'chip mut', tr('app.objectsCount', liste.length)));
  jk.appendChild(jh);
  liste.slice(0, 3).forEach(function (x) {
    var pre = el('div', 'raw');
    pre.style.margin = '9px 12px 0';
    pre.style.whiteSpace = 'pre';
    pre.style.maxHeight = 'none';
    pre.textContent = x.id + '\n' + JSON.stringify(x.obj, null, 2);
    jk.appendChild(pre);
  });
  if (liste.length > 3) {
    jk.appendChild(el('div', 'hint', tr('mq.andMore', liste.length - 3)));
  }
  jk.appendChild(el('div', null, ' '));
  body.appendChild(jk);

  var bs = $('#btn-mqtt-write');
  if (bs) {
    bs.disabled = !liste.length;
    bs.textContent = tr('mq.write', liste.length);
  }
}

function mqttZuSchreiben() {
  var l = mqttStand;
  if (!l) { return []; }
  var kanal = l.kanal;
  var raus = [];
  l.fehlen.forEach(function (x) {
    if (!mqttAuswahl['neu:' + x.name]) { return; }
    var w = befehlsWissen(x.name) || {};
    var thema = mqttThema(l.geraet, 'cmnd', x.name);
    var common = {
      name: x.name,
      role: w.rolle || 'state',
      type: w.typ || 'mixed',
      read: true, write: true,
      desc: tr('mq.createdBy'),
      custom: mqttCustom(l.geraet, thema)
    };
    if (w.einheit) { common.unit = w.einheit; }
    if (w.werteliste) { common.states = w.werteliste; }
    raus.push({ id: kanal + '.cmnd.' + x.name, obj: { type: 'state', common: common, native: { topic: thema } }, neu: true });
  });
  l.stumm.forEach(function (x) {
    if (!mqttAuswahl['fix:' + x.name]) { return; }
    var alt = S.objects[x.id];
    if (!alt) { return; }
    var kopie = JSON.parse(JSON.stringify(alt));
    var cu = kopie.common.custom || {};
    Object.keys(cu).forEach(function (i) { if (/^mqtt/.test(i)) { cu[i].publish = true; } });
    kopie.common.custom = cu;
    raus.push({ id: x.id, obj: kopie, neu: false });
  });
  return raus;
}

export function mqttSchreiben() {
  var liste = mqttZuSchreiben();
  if (!liste.length) { return; }
  var b = $('#btn-mqtt-write');
  if (b) { b.disabled = true; b.textContent = tr('write.writing'); }
  var offen = liste.length, fehler = [];
  liste.forEach(function (x) {
    socket.emit('setObject', x.id, x.obj, function (err) {
      if (err) { fehler.push(x.id + ': ' + err); }
      if (--offen === 0) {
        var body = $('#mqtt-body');
        body.textContent = '';
        var m = el('div');
        m.style.fontSize = '13px';
        if (fehler.length) {
          m.appendChild(el('b', null, tr('write.failed', fehler.length)));
          var ul = el('ul');
          fehler.forEach(function (t) { ul.appendChild(el('li', null, t)); });
          m.appendChild(ul);
        } else {
          m.appendChild(el('b', null, tr('mq.done', liste.length)));
          m.appendChild(el('div', 'hint', tr('mq.doneHint')));
        }
        body.appendChild(m);
        if (b) { b.hidden = true; }
        holeZweig((mqttStand && mqttStand.kanal ? mqttStand.kanal + '.' : ''));
      }
    });
  });
}
