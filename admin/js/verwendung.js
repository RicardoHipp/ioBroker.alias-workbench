/* Wer nennt diese Kennung sonst noch?

   Ein Adapter kann eine fremde Kennung nicht kennen, ohne sie irgendwo
   hingeschrieben zu haben. Dafuer gibt es vier Ablagen: ein eigenes
   Objekt, eine Datei, eine Aufzaehlung, oder `common.custom` am Punkt
   selbst. Alle vier sieht dieser Kasten nach.

   Gemessen am produktiven System (23584 Objekte der vier geladenen
   Arten, 10,1 MB): Alias-Kennungen nennen dort ausschliesslich die
   javascript-Skripte, zwei matter-Bridges, `enum.functions` und
   `enum.rooms` - dazu die vis-Ansichten im Dateibaum (71 Aliase in
   `vis.0`, 38 in `vis-2.0`). Es sind also nicht hundert Adapter,
   sondern eine Handvoll Orte.

   Was draussen bleibt, und warum:

   * Adapter-Oberflaechen (`*.admin`, Widgetsaetze, Icon-Pakete). Das
     sind 160 der 177 MB Text im Dateibaum, auf jedem ioBroker dieselben
     - und sie enthalten Beispiele, die wie echte Daten aussehen
     (`alias.0.Floor.Room.MotionSensor` in `javascript.admin`). Ohne
     diese Grenze faende die Werkbank ihre eigenen hochgeladenen
     Quelldateien als Verwender ihrer selbst. Gesucht wird deshalb nur
     in Ordnern, die auf `.<Zahl>` enden - dort liegt, was der Nutzer
     selbst gebaut hat (bei Ricardo 66 Dateien, 15 MB).
   * Zustandswerte. `energiefluss-erweitert.0.configuration` ist ein
     Datenpunkt, dessen *Wert* ein JSON voller Kennungen ist; im Objekt
     steht davon nichts. Dafuer muesste man Werte lesen - ein eigener
     Griff, bewusst noch nicht getan.
   * Zusammengebaute Kennungen (`'alias.0.' + raum + '.Licht'`) und
     Wildcard-Abos. Die findet keine Textsuche, und der Kasten sagt das.

   Bewusst kein Urteil: dass die Quelle noch irgendwo genannt wird, ist
   kein Fehler. Ein Skript, das sie beschreibt, gehoert genau dorthin.
   Gemessen: von 376 Aliasen mit Quelle wurde bei 61 die Quelle in einem
   Skript weiter direkt genannt, und ein guter Teil davon zu Recht. Eine
   Textsuche kann lesend und schreibend nicht unterscheiden - deshalb
   steht hier eine Liste zum Nachsehen und keine Warnung. */

import { S } from './zustand.js';
import { socket } from './verbindung.js';
import { el } from './basis.js';
import { tr, txt } from './sprache.js';
import { enums } from './enums.js';

/* --- Skripte ---------------------------------------------------------

   Einmal holen und behalten. Der Verlegen-Dialog suchte bisher bei jedem
   Neuzeichnen neu - bei 67 Skripten ist das jedes Mal dieselbe Antwort.
   Der Vorrat gilt fuer die Sitzung; „neu einlesen" am Kasten wirft ihn
   weg. */
var skriptVorrat = null;

function holeSkripte(fertig) {
  if (skriptVorrat) { return fertig(skriptVorrat); }
  var fertigMit = function (rows) {
    skriptVorrat = rows;
    fertig(skriptVorrat);
  };
  try {
    socket.emit('getObjectView', 'script', 'javascript',
      { startkey: 'script.js.', endkey: 'script.js.香' }, function (err, doc) {
        if (err || !doc || !doc.rows) { return fertigMit([]); }
        fertigMit(doc.rows.map(function (r) {
          var o = r.value || {};
          return {
            id: r.id,
            name: txt((o.common || {}).name) || String(r.id).split('.').pop(),
            an: !!(o.common && o.common.enabled),
            quelle: String((o.common || {}).source || '')
          };
        }));
      });
  } catch { fertigMit([]); }
}

/* Die Auswertung ohne Rueckruf - der Vorrat liegt dann schon da. */
function trefferFuer(kennung) {
  var treffer = [];
  (skriptVorrat || []).forEach(function (s) {
    if (!kennung || s.quelle.indexOf(kennung) === -1) { return; }
    var stellen = [];
    s.quelle.split('\n').forEach(function (z, i) {
      if (z.indexOf(kennung) > -1) { stellen.push(i + 1); }
    });
    treffer.push({ id: s.id, name: s.name, an: s.an, zeilen: stellen });
  });
  return treffer;
}

/* Alle Skripte, in deren Quelltext die Kennung im Klartext steht. */
export function sucheInSkripten(kennung, fertig) {
  if (!kennung) { return fertig([]); }
  holeSkripte(function () { fertig(trefferFuer(kennung)); });
}

/* Mehrere Kennungen auf einmal - der Loeschdialog nimmt beim Haken
   „alle Ausgaenge" mehrere Wurzeln mit. Ein Skript, das zwei davon
   nennt, soll trotzdem einmal in der Liste stehen. */
export function sucheInSkriptenMehrere(kennungen, fertig) {
  holeSkripte(function () {
    var nach = {};
    (kennungen || []).forEach(function (k) {
      trefferFuer(k).forEach(function (t) {
        var v = nach[t.id];
        if (!v) { nach[t.id] = { id: t.id, name: t.name, an: t.an, zeilen: t.zeilen.slice() }; return; }
        t.zeilen.forEach(function (z) { if (v.zeilen.indexOf(z) === -1) { v.zeilen.push(z); } });
      });
    });
    fertig(Object.keys(nach).map(function (k) {
      nach[k].zeilen.sort(function (a, b) { return a - b; });
      return nach[k];
    }));
  });
}

function gehoertZu(id, praefix) {
  return id === praefix || id.indexOf(praefix + '.') === 0;
}

/* --- Objekte und Dateien ---------------------------------------------

   Beide liefern dasselbe: „an dieser Stelle steht diese Kennung". Also
   ein gemeinsamer Index, gebaut aus kennungsartigen Zeichenketten.

   Der Ausdruck endet von selbst an der ersten Nicht-Kennungsstelle -
   damit ist der Treffer hinten verankert. Ohne das faende die Suche
   nach `hm-rpc.2.NEQ1660737` auch ein `…NEQ16607370`. */
var KENNUNG = /[A-Za-z0-9_-]+\.\d+\.[A-Za-z0-9_.\-À-ɏ]+/g;

/* token -> [{ art, id, name, ort, pfad }] */
var fundIndex = null;

function tokenAus(text, eintrag, ziel) {
  var t;
  KENNUNG.lastIndex = 0;
  while ((t = KENNUNG.exec(text)) !== null) {
    var k = t[0];
    var liste = ziel.get(k);
    if (!liste) { liste = []; ziel.set(k, liste); }
    if (liste.indexOf(eintrag) === -1) { liste.push(eintrag); }
  }
}

/* Die Objekte liegen schon im Speicher - `ladeObjekte` holt device,
   channel, folder und state samt `native`. Das matter-Objekt, das seine
   Bridge-Mitglieder auffuehrt, ist ein `channel` und damit von Anfang an
   dabei. Es kostet also keinen neuen Zugriff, nur einen Durchlauf. */
function objekteIndizieren(ziel) {
  Object.keys(S.objects).forEach(function (id) {
    /* Die Diagnosepunkte einer Instanz (`system.adapter.mqtt-client.0.cpu`)
       nennen nie eine fremde Kennung - sie tragen nur eine, die wie eine
       aussieht. */
    if (id.indexOf('system.adapter.') === 0) { return; }
    var o = S.objects[id];
    var text;
    try { text = JSON.stringify(o); } catch { return; }
    tokenAus(text, {
      art: 'obj',
      id: id,
      name: txt((o.common || {}).name) || id.split('.').pop()
    }, ziel);
  });
}

/* Dateien, die nie eine Kennung tragen - und wenn doch, dann als Bild. */
var BINAER = /\.(png|jpe?g|gif|bmp|ico|webp|mp3|mp4|wav|ogg|woff2?|ttf|eot|otf|zip|gz|tgz|7z|pdf)$/i;
var MAX_DATEI = 8 * 1024 * 1024;

function lies(ort, pfad) {
  return new Promise(function (fertig) {
    try {
      socket.emit('readFile', ort, pfad, function (err, daten) {
        fertig((!err && typeof daten === 'string') ? daten : null);
      });
    } catch { fertig(null); }
  });
}

function liesOrdner(ort, pfad) {
  return new Promise(function (fertig) {
    try {
      socket.emit('readDir', ort, pfad, function (err, liste) {
        fertig((!err && Array.isArray(liste)) ? liste : []);
      });
    } catch { fertig([]); }
  });
}

/* Nur Instanzordner: `vis.0`, `vis-2.0`, `web.0`, `0_userdata.0` … Was
   nicht auf `.<Zahl>` endet, ist Lieferbestandteil eines Adapters -
   siehe der Kopf dieser Datei. */
var INSTANZ = /^[A-Za-z0-9_-]+\.\d+$/;

async function dateienIndizieren(ziel) {
  var wurzel = await liesOrdner('', '');
  var orte = wurzel.filter(function (x) {
    return x && x.isDir && INSTANZ.test(x.file);
  }).map(function (x) { return x.file; });

  for (var i = 0; i < orte.length; i++) {
    var ort = orte[i];
    var offen = [''];
    var dateien = [];
    while (offen.length) {
      var hier = offen.shift();
      var liste = await liesOrdner(ort, hier);
      liste.forEach(function (x) {
        if (!x || !x.file) { return; }
        var p = hier ? hier + '/' + x.file : x.file;
        if (x.isDir) { offen.push(p); return; }
        if (BINAER.test(p)) { return; }
        if (x.stats && x.stats.size > MAX_DATEI) { return; }
        dateien.push(p);
      });
    }
    /* In kleinen Buendeln lesen: nacheinander dauert bei 66 Dateien
       spuerbar, alle auf einmal ueberfaehrt den Socket. */
    for (var j = 0; j < dateien.length; j += 4) {
      var teil = dateien.slice(j, j + 4);
      var inhalte = await Promise.all(teil.map(function (p) { return lies(ort, p); }));
      inhalte.forEach(function (text, k) {
        if (text) { tokenAus(text, { art: 'datei', ort: ort, pfad: teil[k] }, ziel); }
      });
    }
  }
}

function holeFundorte(fertig) {
  if (fundIndex) { return fertig(fundIndex); }
  var ziel = new Map();
  objekteIndizieren(ziel);
  var schluss = function () { fundIndex = ziel; fertig(fundIndex); };
  dateienIndizieren(ziel).then(schluss, schluss);
}

/* Fundstellen zu einem Praefix - ohne den Punkt selbst, ohne alles
   unter ihm, und ohne die Aliase: die stehen in einer eigenen Zeile. */
function fundstellen(praefix, art) {
  if (!praefix || !fundIndex) { return []; }
  var raus = [];
  var gesehen = {};
  fundIndex.forEach(function (liste, token) {
    if (!gehoertZu(token, praefix)) { return; }
    liste.forEach(function (e) {
      if (e.art !== art) { return; }
      if (art === 'obj') {
        if (e.id.indexOf('alias.') === 0) { return; }
        if (gehoertZu(e.id, praefix) || gehoertZu(praefix, e.id)) { return; }
      }
      var schluessel = art === 'obj' ? e.id : e.ort + '/' + e.pfad;
      if (gesehen[schluessel]) { return; }
      gesehen[schluessel] = true;
      raus.push(e);
    });
  });
  return raus;
}

/* --- Was ohne Suche schon dasteht ------------------------------------ */

/* Aufzaehlungen, die den Punkt oder einen darunter als Mitglied fuehren. */
function aufzaehlungenMit(praefix) {
  if (!praefix) { return []; }
  return Object.keys(enums).filter(function (k) {
    return ((enums[k].common || {}).members || []).some(function (m) {
      return gehoertZu(m, praefix);
    });
  }).map(function (k) {
    return { id: k, name: txt((enums[k].common || {}).name) || k.split('.').pop() };
  });
}

/* Was am Punkt selbst haengt: Aufzeichnung (history, influxdb, sql),
   Smart-Namen (iot, alexa). Das steht im Objekt und ist deshalb gratis. */
function customAn(praefix) {
  if (!praefix) { return []; }
  var raus = [];
  Object.keys(S.objects).forEach(function (id) {
    if (!gehoertZu(id, praefix)) { return; }
    var c = (S.objects[id].common || {}).custom;
    if (!c) { return; }
    var adapter = Object.keys(c);
    if (adapter.length) { raus.push({ id: id, adapter: adapter.join(', ') }); }
  });
  return raus;
}

/* Weitere Aliase, die aus derselben Quelle lesen oder in sie schreiben. */
function aliaseAuf(quelle, ausser) {
  if (!quelle) { return []; }
  var kanaele = {};
  Object.keys(S.objects).forEach(function (id) {
    if (id.indexOf('alias.') !== 0) { return; }
    var a = ((S.objects[id].common || {}).alias || {}).id;
    if (!a) { return; }
    var ziele = (typeof a === 'string') ? [a] : [a.read, a.write];
    if (!ziele.some(function (z) { return z && gehoertZu(z, quelle); })) { return; }
    var kanal = id.split('.').slice(0, -1).join('.');
    if (ausser && gehoertZu(kanal, ausser)) { return; }
    kanaele[kanal] = true;
  });
  return Object.keys(kanaele);
}

/* --- Anzeige --------------------------------------------------------- */

/* Der Ordner, in dem das Skript liegt: aus script.js.common.Raum.Name
   bleibt „Raum". Bei 67 Skripten sagt der blosse Name oft nicht genug -
   „Licht" gibt es dreimal, in drei Raeumen. */
function skriptOrdner(id) {
  return String(id).split('.').slice(3, -1).join(' / ');
}

export function skriptListe(treffer) {
  var ul = el('ul');
  treffer.forEach(function (t) {
    var li = el('li');
    var ordner = skriptOrdner(t.id);
    if (ordner) { li.appendChild(el('span', 'ord', ordner + ' / ')); }
    li.appendChild(el('span', 'id', t.name));
    li.appendChild(document.createTextNode(
      (t.an ? '' : ' (' + tr('move.scriptOff') + ')') + '  —  ' +
      (t.zeilen.length === 1
        ? tr('move.scriptLines', t.zeilen[0])
        : tr('move.scriptLinesN', t.zeilen.join(', ')))));
    ul.appendChild(li);
  });
  return ul;
}

function zweiteilig(treffer, vorn, hinten) {
  var ul = el('ul');
  treffer.forEach(function (t) {
    var li = el('li');
    li.appendChild(el('span', 'id', vorn(t)));
    li.appendChild(document.createTextNode('  —  '));
    li.appendChild(el('span', 'ord', hinten(t)));
    ul.appendChild(li);
  });
  return ul;
}

/* Was zuletzt nachgesehen wurde. `zeichneErgebnis` baut die Ansicht bei
   jeder Aenderung neu auf - ohne dieses Gedaechtnis waere das Ergebnis
   nach dem ersten Hakenklick wieder weg und der Knopf stuende erneut da. */
var zuletzt = { id: null, daten: null };

function sammle(alias, quelle) {
  return {
    alias: {
      id: alias,
      skripte: trefferFuer(alias),
      enums: aufzaehlungenMit(alias),
      objekte: fundstellen(alias, 'obj'),
      dateien: fundstellen(alias, 'datei'),
      custom: customAn(alias)
    },
    quelle: quelle ? {
      id: quelle,
      skripte: trefferFuer(quelle),
      enums: aufzaehlungenMit(quelle),
      objekte: fundstellen(quelle, 'obj'),
      dateien: fundstellen(quelle, 'datei'),
      aliase: aliaseAuf(quelle, alias)
    } : null
  };
}

function kennungen(liste) {
  var w = document.createElement('div');
  liste.forEach(function (x, i) {
    if (i) { w.appendChild(document.createTextNode(', ')); }
    w.appendChild(el('span', 'id', x));
  });
  return w;
}

function zeile(wo, was, inhalt) {
  var r = el('div', 'vwzeile');
  r.appendChild(el('div', 'k', was));
  r.appendChild(inhalt || el('div', 'leer', tr('use.none')));
  wo.appendChild(r);
}

function nennungen(wo, teil, kopf) {
  var k = el('div', 'vwkopf');
  k.appendChild(el('span', 't', kopf));
  k.appendChild(el('span', 'id', teil.id));
  wo.appendChild(k);

  zeile(wo, tr('use.scripts'), teil.skripte.length ? skriptListe(teil.skripte) : null);
  zeile(wo, tr('use.files'), teil.dateien.length
    ? zweiteilig(teil.dateien, function (t) { return t.ort; }, function (t) { return t.pfad; })
    : null);
  zeile(wo, tr('use.objects'), teil.objekte.length
    ? zweiteilig(teil.objekte, function (t) { return t.name; }, function (t) { return t.id; })
    : null);
  zeile(wo, tr('use.enums'), teil.enums.length
    ? el('div', null, teil.enums.map(function (x) { return x.name; }).join(', '))
    : null);
  if (teil.custom) {
    zeile(wo, tr('use.custom'), teil.custom.length
      ? el('div', null, teil.custom.map(function (x) {
        return x.id.split('.').pop() + ' → ' + x.adapter;
      }).join(', '))
      : null);
  }
  if (teil.aliase) {
    zeile(wo, tr('use.otherAliases'), teil.aliase.length ? kennungen(teil.aliase) : null);
  }
}

export function baueVerwendungKarte(host, alias, quelle) {
  if (!alias) { return; }

  var k = el('div', 'card');
  var kopf = el('div', 'ch');
  kopf.appendChild(el('span', 'typ', tr('use.head')));
  var knopf = el('button', 'btn');
  knopf.style.fontSize = '11.5px';
  kopf.appendChild(knopf);
  k.appendChild(kopf);

  var koerper = el('div');
  k.appendChild(koerper);
  host.appendChild(k);

  var hinweis = function (text, warnen) {
    var w = el('div', 'vwnote');
    w.appendChild(el('div', warnen ? 'aside w' : 'aside', text));
    koerper.appendChild(w);
  };

  var malen = function (daten) {
    koerper.textContent = '';
    nennungen(koerper, daten.alias, tr('use.aliasHead'));
    if (daten.quelle) {
      nennungen(koerper, daten.quelle, tr('use.sourceHead'));
      hinweis(tr('use.sourceHint'), true);
    }
    hinweis(tr('use.limits'), false);
    knopf.textContent = tr('use.again');
    knopf.disabled = false;
  };

  var nachsehen = function () {
    knopf.disabled = true;
    knopf.textContent = tr('use.searching');
    holeSkripte(function () {
      holeFundorte(function () {
        zuletzt = { id: alias, daten: sammle(alias, quelle) };
        malen(zuletzt.daten);
      });
    });
  };

  /* Nur der zweite Druck liest neu ein.

     Der Vorrat gilt fuer die ganze Sitzung und fuer jeden Alias - wer
     nach dem Nachsehen zum naechsten Alias wechselt, soll die 15 MB
     nicht noch einmal holen. Gemessen am Produktivsystem: der erste
     Lauf 1,6 s, jeder weitere aus dem Vorrat. Erst „neu einlesen" am
     schon gefuellten Kasten wirft ihn weg. */
  knopf.addEventListener('click', function () {
    if (zuletzt.id === alias && zuletzt.daten) {
      skriptVorrat = null;
      fundIndex = null;
    }
    nachsehen();
  });

  if (zuletzt.id === alias && zuletzt.daten) {
    malen(zuletzt.daten);
  } else {
    knopf.textContent = tr('use.look');
    hinweis(tr('use.lookHint'), false);
  }
}
