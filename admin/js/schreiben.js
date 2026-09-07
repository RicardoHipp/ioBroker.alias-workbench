/* Alles, was Objekte anfasst: bauen, pruefen, Trockenlauf, schreiben,
   loeschen, verlegen. Geschrieben wird nur, was der Trockenlauf vorher
   gezeigt hat. */

import { S } from './zustand.js';
import { socket } from './verbindung.js';
import { $, el } from './basis.js';
import { tr, txt } from './sprache.js';
import { enums, ladeEnums } from './enums.js';
import { enumsVon } from './aufzaehlungen.js';
import './katalog.js';
import { holeZweig, indexNeu , nachziehenErledigt } from './objekte.js';
import { zeichneBaum } from './baum.js';
import './werte.js';
import { ausgangName, vorschlag } from './vorlagen.js';
import {
  waehle,
  ordnerUnterAlias,
  gemeinsameKanaele,
  kennungtauglich,
  entwurfFuer,
  aliasFuer,
  knotenDa
} from './entwurf.js';
import { zeichneErgebnis } from './ergebnis.js';

import { uebernehmeBestand , enumAenderungen, setzeZiel } from './zuordnung.js';

import { mqttEinzelnStill } from './mqtt.js';

import { rateBehalten } from './vorschlagen.js';


export var EIGENE_COMMON = ['name', 'role', 'type', 'read', 'write', 'alias', 'unit', 'states'];

export function mitFremdem(id, common) {
  var alt = S.objects[id] && S.objects[id].common;
  if (!alt) { return common; }
  Object.keys(alt).forEach(function (k) {
    if (EIGENE_COMMON.indexOf(k) > -1) { return; }
    if (common[k] !== undefined) { return; }
    common[k] = JSON.parse(JSON.stringify(alt[k]));
  });
  return common;
}

/* Aendert dieses Objekt ueberhaupt etwas?

   Beim Aktualisieren stand an jeder Zeile „ueberschreibt" — auch an den
   neun von zehn, die hinterher Zeichen fuer Zeichen dasselbe enthielten.
   Das las sich, als wuerde ein fertiger Alias bei jedem Durchgang neu
   gebaut, und verdeckte die eine Zeile, in der wirklich etwas passiert.

   Verglichen wird ohne die Felder, die der Controller selbst setzt:
   Zeitstempel, Urheber, Rechte. Und mit sortierten Schluesseln — sonst
   zaehlte eine andere Reihenfolge im JSON schon als Unterschied. */
export function stabil(o) {
  if (o === null || typeof o !== 'object') { return o; }
  if (Array.isArray(o)) { return o.map(stabil); }
  var raus = {};
  Object.keys(o).sort().forEach(function (k) { raus[k] = stabil(o[k]); });
  return raus;
}
/* Zwei Textfassungen zeilenweise gegenueberstellen - wie ein
   Vergleichswerkzeug es tut: links der Bestand, rechts was entstuende,
   gleiche Zeilen auf gleicher Hoehe.

   Erst die laengste gemeinsame Teilfolge (LCS) ueber die Zeilen, dann
   werden Loesch- und Einfuegebloecke an derselben Stelle paarweise
   nebeneinander gelegt - sonst stuende eine geaenderte Zeile zweimal
   untereinander statt einmal daneben. Bei JSON-Bloecken von ein paar
   Dutzend Zeilen ist die Tabelle winzig, das kostet nichts. */
export function zeilenVergleich(altText, neuText) {
  var a = String(altText).split('\n'), b = String(neuText).split('\n');
  var n = a.length, m = b.length, i, j;
  /* Verglichen wird ohne das abschliessende Komma: es haengt nur davon
     ab, ob nach der Zeile noch etwas folgt. Kommt ein Feld dazu, bekaeme
     die Zeile davor sonst ein Komma und stuende als „geaendert“ da,
     obwohl an ihr nichts anders ist. Angezeigt wird die Zeile samt
     Komma - verglichen ohne. */
  var kern = function (z) { return String(z).replace(/,$/, ''); };
  var ak = a.map(kern), bk = b.map(kern);
  var t = [];
  for (i = 0; i <= n; i++) {
    var reihe = [];
    for (j = 0; j <= m; j++) { reihe.push(0); }
    t.push(reihe);
  }
  for (i = n - 1; i >= 0; i--) {
    for (j = m - 1; j >= 0; j--) {
      t[i][j] = (ak[i] === bk[j]) ? t[i + 1][j + 1] + 1
                                  : Math.max(t[i + 1][j], t[i][j + 1]);
    }
  }
  var roh = [];
  i = 0; j = 0;
  while (i < n && j < m) {
    if (ak[i] === bk[j]) { roh.push({ art: 'gleich', l: a[i], r: b[j] }); i++; j++; }
    else if (t[i + 1][j] >= t[i][j + 1]) { roh.push({ art: 'weg', l: a[i] }); i++; }
    else { roh.push({ art: 'dazu', r: b[j] }); j++; }
  }
  while (i < n) { roh.push({ art: 'weg', l: a[i++] }); }
  while (j < m) { roh.push({ art: 'dazu', r: b[j++] }); }

  var raus = [];
  for (var k = 0; k < roh.length; k++) {
    if (roh[k].art !== 'weg') { raus.push(roh[k]); continue; }
    var wegs = [], dazus = [];
    while (k < roh.length && roh[k].art === 'weg') { wegs.push(roh[k].l); k++; }
    while (k < roh.length && roh[k].art === 'dazu') { dazus.push(roh[k].r); k++; }
    k--;
    var viele = Math.max(wegs.length, dazus.length);
    for (var p = 0; p < viele; p++) {
      if (p < wegs.length && p < dazus.length) { raus.push({ art: 'anders', l: wegs[p], r: dazus[p] }); }
      else if (p < wegs.length) { raus.push({ art: 'weg', l: wegs[p] }); }
      else { raus.push({ art: 'dazu', r: dazus[p] }); }
    }
  }
  return raus;
}

/* Ein Objekt als JSON-Text fuer den Vergleich - ohne die Felder, die der
   Controller selbst setzt (sonst haenge der Vergleich an Zeitstempeln).

   `geordnet` sortiert die Schluessel auf beiden Seiten gleich. Das ist
   keine Schoenung: die Reihenfolge in einem JSON-Objekt bedeutet nichts,
   und sie ist auch keine stillschweigende Vorgabe - gemessen an Ricardos
   Anlage schreibt derselbe Admin Alias-Objekte in VIER verschiedenen
   Reihenfolgen (common,native,type / type,common,native /
   native,type,common / common,type,native), javascript.0 in zwei.
   Ohne Ordnen sieht ein Vergleich nach einem Dutzend Unterschieden aus,
   wo zwei sind (Ricardo, 25.08.2026). Wer das Original sehen will,
   schaltet um. */
/* Die Reihenfolge, in der die Doku die Felder auffuehrt - und in der sie
   zusammengehoeren: `read` und `write` nebeneinander, `alias` als groesster
   Block am Ende. Alphabetisch sortiert stuende `read` hinter `name` und
   `write` hinter `unit`, also weit auseinander (Ricardo, 25.08.2026).
   Was hier nicht steht - icon, color, desc, custom -, kommt dahinter,
   alphabetisch. */
var VORRANG = {
  '': ['type', 'common', 'native'],
  common: ['name', 'role', 'type', 'read', 'write', 'unit', 'states', 'alias'],
  'common.alias': ['id', 'read', 'write']
};
function ordne(o, pfad) {
  if (o === null || typeof o !== 'object') { return o; }
  if (Array.isArray(o)) { return o.map(function (x) { return ordne(x, pfad); }); }
  var vor = VORRANG[pfad] || [];
  var raus = {};
  Object.keys(o).sort(function (a, b) {
    var ia = vor.indexOf(a), ib = vor.indexOf(b);
    if (ia > -1 && ib > -1) { return ia - ib; }
    if (ia > -1) { return -1; }
    if (ib > -1) { return 1; }
    return a < b ? -1 : (a > b ? 1 : 0);
  }).forEach(function (k) { raus[k] = ordne(o[k], pfad ? pfad + '.' + k : k); });
  return raus;
}

export function objektText(o, geordnet) {
  if (!o) { return ''; }
  var k = JSON.parse(JSON.stringify(o));
  delete k.ts; delete k.from; delete k.user; delete k.acl; delete k._id;
  return JSON.stringify(geordnet ? ordne(k, '') : k, null, 2);
}

/* Der gespeicherte Stand zu einer Kennung.

   Aufzaehlungen liegen nicht in `S.objects` - die Werkbank haelt sie in
   einem eigenen Vorrat, weil der Admin sie getrennt ausliefert. Der
   Trockenlauf las trotzdem nur `S.objects`, und so blieb die Spalte
   „bisher" bei jeder Aufzaehlung leer: verglichen wurde gegen nichts,
   also stand rechts jede Zeile als neu da - auch die zehn Mitglieder,
   die laengst drin waren (Ricardo, 08.09.2026). */
export function bestandsObjekt(id) {
  if (S.objects[id]) { return S.objects[id]; }
  if (String(id).indexOf('enum.') === 0 && enums[id]) { return enums[id]; }
  return null;
}

export function unveraendert(id, obj) {
  var alt = bestandsObjekt(id);
  if (!alt) { return false; }
  var putz = function (x) {
    var k = JSON.parse(JSON.stringify(x || {}));
    delete k.ts; delete k.from; delete k.user; delete k.acl; delete k._id;
    return stabil(k);
  };
  return JSON.stringify(putz(alt)) === JSON.stringify(putz(obj));
}


/* ================== Objekte bauen, prüfen, schreiben ================== */

/* Aus dem Entwurf die Objekte machen, die entstehen wuerden. */
export function baueObjekte(e) {
  var ziel = e.ziel || e.kanal;
  var raus = [];

  /* Ordner darueber, falls es ihn noch nicht gibt */
  var teile = ziel.split('.');
  /* Jede fehlende Ebene zwischen alias.0 und dem Geraet anlegen. */
  for (var i = 3; i < teile.length; i++) {
    var pfad = teile.slice(0, i).join('.');
    if (!S.objects[pfad]) {
      raus.push({ id: pfad, neu: true, obj: {
        type: 'folder',
        common: mitFremdem(pfad, { name: teile[i - 1] }),
        native: {}
      } });
    }
  }

  /* Der Kanal — hier wird die Vorlage vermerkt, damit ein spaeteres
     Nachziehen weiss, woraus das Geraet entstanden ist. */
  /* Wird der Alias aus sich selbst heraus bearbeitet — Baummodus
     „Aliase" —, darf „quelle" nicht auf ihn selbst zeigen. Vorher
     verschwanden dabei Vorlage, Version und Geraetetyp, und damit die
     ganze Herkunft: das Abzeichen „gemerkt" war weg, die Erkennung
     nahm womoeglich eine andere Vorlage, und ein spaeteres Nachziehen
     der Versionen haette nichts mehr zu greifen. */
  var altN = (S.objects[ziel] && S.objects[ziel].native) || {};
  var ausAlias = (e.kanal.indexOf('alias.') === 0);
  var kanalNative = ausAlias ? JSON.parse(JSON.stringify(altN)) : { quelle: e.kanal };
  if (e.vorlage) {
    kanalNative.vorlage = e.vorlage;
    kanalNative.vorlageVersion = e.vorlageVersion;
    kanalNative.geraetetyp = e.want;
    if (e.want !== e.wantAuto) { kanalNative.musterVonHand = true; }
  }
  /* Einen von Hand vergebenen Kanalnamen nicht durch die Kennung
     ersetzen. */
  var altName = txt(S.objects[ziel] && S.objects[ziel].common && S.objects[ziel].common.name);
  /* Neu angelegt wird ein Kanal — das ist die verbreitete Form und die,
     die dem Objektschema am naechsten kommt. Was es schon gibt, behaelt
     aber seinen Typ: ein Aktualisieren soll nicht nebenbei aus einem
     Ordner einen Kanal machen. Der Aliasmechanismus schaut ohnehin nur
     auf die Datenpunkte, nicht auf ihren Behaelter. */
  var altTyp = S.objects[ziel] && S.objects[ziel].type;
  /* Die Rolle des Kanals ist der Geraetetyp - so haelt es der
     Geraete-Adapter des Admin, und so steht es in Ricardos Anlage:
     115 von 118 Alias-Kanaelen tragen einen Detector-Typ als Rolle
     (socket, blind, light, thermostat ...). Wir setzten sie nie, und
     weil `role` zugleich auf EIGENE_COMMON steht, rettete `mitFremdem`
     eine vorhandene auch nicht herueber - ein Aktualisieren loeschte
     sie also stillschweigend (gefunden 25.08.2026 an
     alias.0.Badezimmer.Rollladen, role „blind"). Ohne gewaehltes
     Muster bleibt die vorhandene stehen. */
  var kanalCommon = { name: altName || teile[teile.length - 1] };
  var altRolle = S.objects[ziel] && S.objects[ziel].common && S.objects[ziel].common.role;
  if (e.want) { kanalCommon.role = e.want; }
  else if (altRolle) { kanalCommon.role = altRolle; }
  raus.push({ id: ziel, neu: !S.objects[ziel], obj: {
    type: (altTyp === 'folder' || altTyp === 'device') ? altTyp : 'channel',
    common: mitFremdem(ziel, kanalCommon),
    native: kanalNative
  } });

  e.states.forEach(function (s) {
    if (!s.on || !s.n || !s.srcR) { return; }
    var id = ziel + '.' + s.n;

    var alias = {};
    if (s.srcW && s.srcW !== s.srcR) { alias.id = { read: s.srcR, write: s.srcW }; }
    else { alias.id = s.srcR; }
    if (s.f)  { alias.read = s.f; }
    if (s.fw && s.srcW) { alias.write = s.fw; }

    var common = {
      name: s.caption || s.n,
      role: s.role,
      type: s.typ || 'mixed',
      read: true,
      write: !!s.srcW,
      alias: alias
    };
    if (s.unit) { common.unit = s.unit; }
    /* Ohne Werteliste erkennt der Detektor den fertigen Alias spaeter
       nicht wieder — dieselbe Bedingung wie im Abbild. */
    if (s.states) { common.states = s.states; }

    var nat = {};
    var altNat = (S.objects[id] && S.objects[id].native)
      ? JSON.parse(JSON.stringify(S.objects[id].native)) : null;
    if (s.nurImAlias && altNat) {
      /* Ein Punkt, den es nur im Alias gibt, behaelt seinen Vermerk —
         sonst schreibt ihn ein Aktualisieren der Vorlage zu, aus der er
         nie kam. */
      nat = altNat;
    } else if (s.manuell) { nat.vonHand = true; }
    else if (e.vorlage) { nat.vorlage = e.vorlage; nat.ausZustand = s.ausVorlage || s.n; }
    else if (altNat) {
      /* Aus dem Aliasmodus heraus gibt es keine Vorlage, und `manuell`
         steht nur beim frischen Hinzufuegen. Ohne diesen Fall schrieb
         ein Aktualisieren `native: {}` ueber jeden Punkt und loeschte
         damit Vorlage, Herkunftsplatz und die Marke `vonHand` — der
         Kanal behielt seine Herkunft, die Punkte verloren sie. */
      nat = altNat;
    }

    raus.push({ id: id, neu: !S.objects[id],
      obj: { type: 'state', common: mitFremdem(id, common), native: nat } });
  });

  /* Zum Schluss die Aufzaehlungen. Sie stehen am Ende, weil sie erst
     dann sinnvoll sind, wenn das Ziel feststeht - und weil der
     Trockenlauf sie so unter den Objekten zeigt, zu denen sie gehoeren. */
  enumAenderungen(e).forEach(function (x) { raus.push(x); });

  return raus;
}

/* Was im Ziel liegt, aber nicht mehr im Entwurf vorkommt.
   „abgewaehlt" = du hast das Haekchen entfernt, also gewollt.
   „nicht im Vorschlag" = existiert nur im Alias, etwa von Hand ergaenzt —
   das wird nicht ungefragt geloescht. */
export function verwaiste(e) {
  var ziel = e.ziel || e.kanal;
  /* Auch ohne Kanalobjekt kann darunter ein Alias liegen - dann gibt es
     dort auch verwaiste Punkte zu finden. */
  if (!knotenDa(ziel)) { return []; }
  var behalten = {};
  e.states.forEach(function (st) {
    if (st.on && st.n) { behalten[ziel + '.' + st.n] = 1; }
  });
  var imEntwurf = {};
  e.states.forEach(function (st) { if (st.n) { imEntwurf[ziel + '.' + st.n] = 1; } });

  var pre = ziel + '.';
  return S.keysSorted.filter(function (k) {
    return k.indexOf(pre) === 0 && S.objects[k] && S.objects[k].type === 'state' && !behalten[k];
  }).map(function (k) {
    var abgewaehlt = !!imEntwurf[k];
    return { id: k, grund: abgewaehlt ? tr('write.deselected') : tr('write.notInProposal'), vorgabe: abgewaehlt };
  });
}

/* Was dem Schreiben im Weg steht. */
export function pruefeSchreiben(e) {
  var probleme = [];
  var an = e.states.filter(function (s) { return s.on; });
  if (!an.length) { probleme.push(tr('write.noneSelected')); }

  var namen = {};
  an.forEach(function (s) {
    if (!s.n) { probleme.push(tr('write.noName')); return; }
    if (namen[s.n]) { probleme.push(tr('write.duplicateName', s.n)); }
    namen[s.n] = 1;

    if (!s.srcR) {
      probleme.push(tr('write.noSourceChosen', s.n));
    } else if (!S.objects[s.srcR]) {
      /* Der teuerste Fehler: der js-controller merkt sich „Quelle fehlt"
         dauerhaft und korrigiert das nie. Nur loeschen und neu anlegen
         hilft. Deshalb hier hart sperren. */
      probleme.push(tr('write.sourceMissing', s.n, s.srcR));
    }

    /* Dasselbe fuer das Schreibziel: die Erkennung darf sich auf einen
       Befehl stuetzen, den das Geraet kennt — geschrieben wird aber erst,
       wenn der Punkt wirklich da ist. Sonst zeigte der Alias auf ein
       Objekt, das es nicht gibt, und der Controller merkt sich auch das
       dauerhaft. */
    if (s.srcW && !S.objects[s.srcW]) {
      probleme.push(tr('write.writeSourceMissing', s.n, s.srcW));
    }
  });
  return probleme;
}

/* Trockenlauf zeigen */

/* Welche Entwuerfe geschrieben werden. Bei mehreren Ausgaengen wahlweise
   nur der gezeigte oder alle — die uebrigen kommen frisch aus der Vorlage,
   Aenderungen von Hand gelten nur fuer den gezeigten Ausgang. */
export function zuSchreiben(alleAusgaenge) {
  /* Je Kanal ein Geraet: fuer jeden steuerbaren Kanal ein eigener
     Entwurf, benannt nach dem Kanal — nicht nach seiner Nummer. Aus
     „Kanal 1" wird `Licht_Bar`, weil das der Name ist, den jemand ihm
     gegeben hat. */
  if (alleAusgaenge && S.entwurf.kanalGeraete && S.entwurf.kanalGeraete.length > 1) {
    /* Ein Ordner fuer das Geraet, darunter je Kanal ein Kanal — dieselbe
       Form, die die Tasmota-Mehrfachvorlage seit jeher erzeugt. */
    var ordner = (S.entwurf.zielOrdner || 'alias.0') + '.' + S.entwurf.zielName;
    var gem = gemeinsameKanaele(S.entwurf.kanal, S.entwurf.kanalGeraete);
    return S.entwurf.kanalGeraete.map(function (k) {
      var v = entwurfFuer(k.id, gem, S.entwurf.gemeinsamMitPlatz);
      if (!v) { return null; }
      v.zielOrdner = ordner;
      v.zielName = k.name;
      v.ziel = ordner + '.' + k.name;
      uebernehmeBestand(v);
      return v;
    }).filter(Boolean);
  }
  if (!alleAusgaenge || !S.entwurf.instanzen || S.entwurf.instanzen.length < 2) { return [S.entwurf]; }
  return S.entwurf.instanzen.map(function (n) {
    if (String(n) === String(S.entwurf.instanz)) { return S.entwurf; }
    var v = vorschlag(S.current, S.entwurf.vorlage, n);
    if (v) {
      v.zielOrdner = S.entwurf.zielOrdner;
      v.zielName = ausgangName(v, n);
      v.ziel = v.zielOrdner + '.' + v.zielName;
    }
    return v;
  }).filter(Boolean);
}

export function zeigeTrockenlauf(alleAusgaenge) {
  if (!S.entwurf) { return; }
  S.trockenAlle = !!alleAusgaenge;
  /* Das Ziel steht sonst erst, wenn zeichneErgebnis gelaufen ist. Wird
     der Trockenlauf aus einem Rueckruf heraus geoeffnet — etwa nachdem
     fehlende Sendepunkte angelegt wurden —, ist der Entwurf frisch und
     hat noch keins. Dann faellt zuSchreiben auf e.kanal zurueck, und das
     ist die Quelle: der Trockenlauf zeigte Objekte unter mqtt-client an. */
  if (S.entwurf) { setzeZiel(S.entwurf); }

  var entwuerfe = zuSchreiben(S.trockenAlle);
  var liste = [];
  var probleme = [];
  entwuerfe.forEach(function (en) {
    baueObjekte(en).forEach(function (o) {
      if (!liste.some(function (x) { return x.id === o.id; })) { liste.push(o); }
    });
    pruefeSchreiben(en).forEach(function (pr) { probleme.push(pr); });
  });

  /* Letzte Sicherung, unabhaengig von allem davor: ein Alias gehoert
     unter alias. — sonst schreibt die Werkbank in fremde Zweige. Die
     Pruefung kostet nichts und faengt jeden Weg ab, auf dem das Ziel
     verlorengeht.

     Eine Ausnahme, und nur diese: Aufzaehlungen. Raum und Funktion stehen
     nicht am Alias, sondern in `enum.rooms.*` und `enum.functions.*` — ohne
     diese Ausnahme liessen sie sich gar nicht setzen. Sie ist eng gefasst:
     nur `enum.`, nur Objekte, die aus `enumAenderungen` stammen und deshalb
     `istEnum` tragen. Alles andere bleibt gesperrt. */
  liste.forEach(function (x) {
    if (x.istEnum) {
      if (x.id.indexOf('enum.rooms.') !== 0 && x.id.indexOf('enum.functions.') !== 0) {
        probleme.push(tr('write.notUnderAlias', x.id));
      }
      return;
    }
    if (x.id.indexOf('alias.') !== 0) {
      probleme.push(tr('write.notUnderAlias', x.id));
    }
  });
  var weg = [];
  entwuerfe.forEach(function (en) {
    verwaiste(en).forEach(function (v) {
      if (!weg.some(function (x) { return x.id === v.id; })) { weg.push(v); }
    });
  });
  S.loeschListe = weg;
  var body = $('#dry-body');
  body.textContent = '';

  var kopf = el('div');
  kopf.style.marginBottom = '11px';
  kopf.style.fontSize = '12.5px';
  kopf.appendChild(el('b', null, tr('app.objectsCount', liste.length)));
  liste.forEach(function (x) { x.gleich = !x.neu && unveraendert(x.id, x.obj); });
  var neu = liste.filter(function (x) { return x.neu; }).length;
  var gleich = liste.filter(function (x) { return x.gleich; }).length;
  kopf.appendChild(document.createTextNode('  —  ' + (gleich
    ? tr('write.summaryTail3', neu, liste.length - neu - gleich, gleich)
    : tr('write.summaryTail', neu, liste.length - neu))));
  /* „uebrig geblieben" hiess in Wahrheit „wird geloescht" — und
     dieselbe rote Zahl stand auch fuer Punkte, die stehenbleiben. Zwei
     gegensaetzliche Faelle unter einer Zahl, ausgerechnet dort, wo
     etwas verschwindet. Jetzt getrennt, und die Zahlen folgen den
     Kaestchen. */
  var wRaus = el('b'), wBleibt = el('span');
  wRaus.style.color = 'var(--bad)';
  wBleibt.style.color = 'var(--ink-3)';
  function zaehlerAuffrischen() {
    var n = S.loeschListe.filter(function (v) { return v.vorgabe; }).length;
    wRaus.textContent = n ? ('  —  ' + tr('write.willRemove', n)) : '';
    var b = S.loeschListe.length - n;
    wBleibt.textContent = b ? ('  —  ' + tr('write.willKeep', b)) : '';
  }
  if (weg.length) { kopf.appendChild(wRaus); kopf.appendChild(wBleibt); }

  /* Der Umschalter fuer die Feldreihenfolge - einmal fuer den ganzen
     Dialog, nicht je Karte: bei acht Objekten legt niemand achtmal um.
     Er erscheint nur, wenn es ueberhaupt etwas zu vergleichen gibt, und
     nur, wenn sich die Reihenfolge irgendwo unterscheidet - sonst
     verspraeche er eine Wirkung, die er nicht hat. */
  var vergleichbar = liste.filter(function (x) { return !x.neu && !x.gleich; });
  var rohAnders = vergleichbar.some(function (x) {
    var b0 = bestandsObjekt(x.id);
    return objektText(b0, false) !== objektText(b0, true)
        || objektText(x.obj, false) !== objektText(x.obj, true);
  });
  if (vergleichbar.length && rohAnders) {
    var um = el('button', 'btn mini leise', S.trockenRoh
      ? tr('write.diffSorted') : tr('write.diffRaw'));
    um.style.marginLeft = '10px';
    um.title = tr('write.diffSortedHint');
    um.addEventListener('click', function () {
      S.trockenRoh = !S.trockenRoh;
      zeigeTrockenlauf(S.trockenAlle);
    });
    kopf.appendChild(um);
  }
  body.appendChild(kopf);

  /* Dieselbe Auskunft wie in der Zielleiste, noch einmal hier - der
     Trockenlauf ist die letzte Stelle vor dem Schreiben, und wer den
     Balken oben ueberliest, soll es spaetestens jetzt sehen: es gibt
     schon einen Alias auf diese Quelle, und der bleibt stehen. */
  var zwQuelle = S.entwurf && S.entwurf.kanal;
  var zwZiel = S.entwurf && (S.entwurf.ziel || S.entwurf.kanal);
  var zwAlt = zwQuelle ? aliasFuer(zwQuelle) : null;
  if (zwAlt && S.objects[zwAlt] && zwAlt !== zwZiel) {
    var zwK = el('div', 'aside w');
    zwK.style.marginBottom = '11px';
    zwK.appendChild(el('b', null, tr('target.twinExists', zwAlt)));
    body.appendChild(zwK);
  }

  if (weg.length) {
    var wk = el('div', 'card');
    wk.style.marginBottom = '11px';
    wk.style.borderColor = 'var(--bad)';
    var wch = el('div', 'ch');
    wch.appendChild(el('span', 'typ', tr('write.remove')));
    wch.appendChild(el('span', 'chip bad', tr('write.removeCount', weg.length)));
    wch.appendChild(el('span', 'chip mut', tr('write.removeHint')));
    wk.appendChild(wch);
    weg.forEach(function (v, i) {
      var r = el('div', 'slot');
      r.style.gridTemplateColumns = '19px 1fr 150px';
      var cbw = el('span');
      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = v.vorgabe;
      cbw.appendChild(cb);
      r.appendChild(cbw);
      r.appendChild(el('span', 'sn', v.id.slice((S.entwurf.ziel || S.entwurf.kanal).length + 1)));
      var g = el('span', 'rx', v.grund);
      if (!v.vorgabe) { g.style.color = 'var(--warn)'; }
      r.appendChild(g);
      cb.addEventListener('change', function () {
        S.loeschListe[i].vorgabe = cb.checked;
        g.style.color = cb.checked ? '' : 'var(--warn)';
        zaehlerAuffrischen();
      });
      wk.appendChild(r);
    });
    body.appendChild(wk);
    zaehlerAuffrischen();
  }

  if (probleme.length) {
    var pw = el('div', 'aside w');
    pw.style.marginBottom = '11px';
    pw.appendChild(el('b', null, tr('write.cannotWrite')));
    var ul = el('ul');
    ul.style.margin = '6px 0 0';
    ul.style.paddingLeft = '18px';
    probleme.forEach(function (t) { ul.appendChild(el('li', null, t)); });
    pw.appendChild(ul);

    /* Was fehlt, laesst sich von hier aus anlegen — sonst muesste man
       den Trockenlauf schliessen, in der Karte nachziehen und von vorn
       anfangen. */
    var fehlend = [];
    entwuerfe.forEach(function (en) {
      en.states.forEach(function (s2) {
        if (s2.on && s2.srcW && !S.objects[s2.srcW] && s2.srcW.indexOf('.cmnd.') > -1 &&
            fehlend.indexOf(s2.srcW) === -1) { fehlend.push(s2.srcW); }
      });
    });
    if (fehlend.length) {
      var kb = el('div');
      kb.style.marginTop = '9px';
      var kn2 = el('button', 'btn', tr('write.createSendPoints', fehlend.length));
      kn2.addEventListener('click', function () {
        kn2.disabled = true;
        kn2.textContent = tr('write.writing');
        var offen2 = fehlend.length;
        fehlend.forEach(function (fid) {
          var t2 = fid.split('.cmnd.');
          mqttEinzelnStill(t2[0], t2[1], function () {
            if (--offen2 === 0) {
              /* Erst den Entwurf neu aufbauen lassen, dann den
                 Trockenlauf noch einmal rechnen. Sofort geoeffnet zeigte
                 er den Rohentwurf, weil die Vorlage noch nicht wieder
                 angewandt war. */
              indexNeu();
              nachziehenErledigt();
              zeichneBaum();
              /* Der Neuaufbau wirft das Ziel weg, das im Feld steht —
                 danach zeigte der Dialog Objekte fuer einen anderen
                 Ordner an als eingegeben, und „Jetzt anlegen" haette
                 sie dort auch angelegt. Also merken und zurueckgeben. */
              var altZiel = S.entwurf
                ? { o: S.entwurf.zielOrdner, n: S.entwurf.zielName } : null;
              if (S.current) {
                waehle(S.current, function () {
                  if (altZiel && S.entwurf) {
                    S.entwurf.zielOrdner = altZiel.o;
                    S.entwurf.zielName = altZiel.n;
                    S.entwurf.angefasst = true;
                    zeichneErgebnis();
                  }
                  zeigeTrockenlauf(S.trockenAlle);
                });
              } else { zeigeTrockenlauf(S.trockenAlle); }
            }
          });
        });
      });
      kb.appendChild(kn2);
      pw.appendChild(kb);
    }
    body.appendChild(pw);
  }

  /* Je Objekt eine Zeile, das JSON erst beim Aufklappen.

     Vorher stand unter jedem Eintrag der ganze JSON-Block. Bei zehn
     Objekten waren das ueber zweihundert Zeilen, durch die man scrollen
     musste, um zu sehen, was ueberhaupt entsteht — und die Frage, die
     der Trockenlauf beantworten soll, ist zuerst „was wird angelegt und
     woher liest es", nicht „wie sieht das Objekt innen aus".

     details/summary statt eigenem Klick-Handler: das klappt von selbst,
     laesst sich mit der Tastatur bedienen und braucht keinen Zustand,
     der ueber das Neuzeichnen gerettet werden muesste. */
  liste.forEach(function (x) {
    var k = el('details', 'card zeile');
    k.style.marginBottom = '5px';

    var ch = document.createElement('summary');
    ch.className = 'ch';
    ch.appendChild(el('span',
      'chip ' + (x.neu ? 'ok' : (x.gleich ? 'mut' : 'warn')),
      x.neu ? tr('write.new') : (x.gleich ? tr('write.unchanged') : tr('write.changes'))));
    ch.appendChild(el('span', 'chip mut', x.obj.type));

    /* Ziel und Quelle untereinander, beide linksbuendig und beschriftet.
       Nebeneinander in eine Zeile passte beides fast nie: allein die
       Ziel-ID ist bei einem Homematic-Geraet mit Namen und Seriennummer
       schon ueber sechzig Zeichen lang, und die Quelle rutschte dann
       rechts an den Rand, wo sie niemand mehr las. */
    var paar = el('span', 'zpaar');
    paar.appendChild(el('span', 'zlabel', tr('write.rowTarget')));
    paar.appendChild(el('span', 'zid', x.id));

    /* Bei einer Aufzaehlung ist die Auskunft eine andere: nicht „woher
       liest der Punkt", sondern „was passiert mit dieser Liste". */
    if (x.istEnum) {
      var was = x.dazu ? tr('enums.addTo') : (x.weg ? tr('enums.removeFrom') : '');
      if (was) {
        paar.appendChild(el('span', 'zlabel', ''));
        paar.appendChild(el('span', 'zq', was));
      }
      /* Ein nachgetragenes Bild ist eine Aenderung an einem fremden
         Objekt. Sie gehoert benannt, nicht nur ins aufgeklappte JSON. */
      if (x.ikonDazu) {
        paar.appendChild(el('span', 'zlabel', ''));
        paar.appendChild(el('span', 'zq', tr('enums.iconAdded')));
      }
    }

    var al = x.obj.common && x.obj.common.alias;
    if (al) {
      var q = (typeof al.id === 'string') ? al.id : (al.id && (al.id.read || al.id.write)) || '';
      /* Liest und schreibt der Punkt an verschiedenen Stellen, steht
         hier die Lesequelle; die ganze Wahrheit zeigt das JSON. */
      var beides = (al.id && typeof al.id === 'object' && al.id.read && al.id.write
                    && al.id.read !== al.id.write);
      if (q) {
        paar.appendChild(el('span', 'zlabel', tr('write.rowSource')));
        paar.appendChild(el('span', 'zq', q + (beides ? ' \u2026' : '')));
      }
    }
    ch.appendChild(paar);
    k.appendChild(ch);

    /* Aendert sich etwas, stehen Bestand und Entwurf nebeneinander -
       Zeile gegen Zeile, wie in einem Vergleichswerkzeug. Sonst genuegt
       das eine JSON (bei „neu" gibt es keinen Vorher-Stand, bei
       „unveraendert" nichts zu vergleichen). */
    if (!x.neu && !x.gleich) {
      var vgl = el('div', 'dvgl');
      vgl.appendChild(el('span', 'dkopf', tr('write.diffOld')));
      vgl.appendChild(el('span', 'dkopf', tr('write.diffNew')));
      zeilenVergleich(objektText(bestandsObjekt(x.id), !S.trockenRoh),
                      objektText(x.obj, !S.trockenRoh))
        .forEach(function (z) {
          vgl.appendChild(el('span', 'dz l ' + z.art, z.l === undefined ? '' : z.l));
          vgl.appendChild(el('span', 'dz r ' + z.art, z.r === undefined ? '' : z.r));
        });
      k.appendChild(vgl);
    } else {
      var pre = el('div', 'raw');
      pre.style.margin = '2px 12px 10px';
      pre.style.whiteSpace = 'pre';
      pre.style.maxHeight = 'none';
      pre.textContent = JSON.stringify(x.obj, null, 2);
      k.appendChild(pre);
    }
    body.appendChild(k);
  });

  var zt = $('#dry-titel');
  if (zt) {
    var zielName = S.entwurf.ziel || S.entwurf.kanal;
    zt.textContent = (knotenDa(zielName) ? tr('write.dryTitleUpdate') : tr('write.dryTitleCreate')) +
      (entwuerfe.length > 1 ? tr('write.dryOutputs', entwuerfe.length) : '');
  }
  /* Beim Oeffnen wieder herstellen: der Dialog wird wiederverwendet, und
     nach einem erfolgreichen Durchgang ist der Knopf ausgeblendet. */
  $('#btn-dry-write').hidden = false;
  $('#btn-dry-write').disabled = probleme.length > 0;
  $('#btn-dry-write').textContent = S.objects[S.entwurf.ziel || S.entwurf.kanal] ? tr('write.nowUpdate') : tr('write.now');
  $('#dlg-dry').showModal();
}

/* Einen Alias wieder loswerden.

   Anlegen und Aktualisieren gab es, Entfernen nicht — und der
   naheliegende Umweg lief ins Leere: haekelt man alle Punkte ab, listet
   der Trockenlauf sie zwar auf, sperrt aber das Schreiben mit „kein
   einziger Datenpunkt ausgewaehlt". Ein einmal angelegter Alias liess
   sich nur ueber die Objektverwaltung entfernen. */

/* Die Geschwister eines Ausgangs: bei einem Mehrfachgeraet tragen alle
   Kanaele dieselbe Quelle. Ohne sie loescht „Alias entfernen" nur einen
   von vier Ausgaengen, und der Rest bleibt verwaist stehen — man glaubt,
   das Geraet sei weg. */
function geschwisterVon(ziel) {
  var o = S.objects[ziel];
  var q = o && o.native && o.native.quelle;
  if (!q) { return []; }
  return S.keysSorted.filter(function (id) {
    if (id === ziel || id.indexOf('alias.') !== 0) { return false; }
    var x = S.objects[id];
    return x && x.type === 'channel' && x.native && x.native.quelle === q;
  });
}

export function zeigeLoeschen() {
  var ziel = (S.entwurf && (S.entwurf.ziel || S.entwurf.kanal)) || S.current;
  if (!ziel || ziel.indexOf('alias.') !== 0 || !knotenDa(ziel)) { return; }
  S.loeschZiel = ziel;
  S.loeschAlleAusgaenge = false;
  zeichneLoeschen();
}

function loeschUmfang() {
  var ziel = S.loeschZiel;
  var wurzeln = [ziel];
  if (S.loeschAlleAusgaenge) { wurzeln = wurzeln.concat(geschwisterVon(ziel)); }
  var alle = [];
  wurzeln.forEach(function (w) {
    alle.push(w);
    S.keysSorted.forEach(function (id) {
      if (id.indexOf(w + '.') === 0 && alle.indexOf(id) === -1) { alle.push(id); }
    });
  });
  return alle;
}

/* Welche selbst angelegten Aufzaehlungen wuerden durch dieses Loeschen
   leer? Ein Ergebnis fuer Dialog und Tat — der Dialog nennt genau das,
   was hinterher geschieht, keine stille Zugabe. Gerechnet gegen die
   Loeschliste, nicht gegen den Speicherstand: ob der Admin seine
   Mitglieder-Austragung schon gemeldet hat, ist Zufall. */
function enumsDieLeerWuerden(alle) {
  var raus = [];
  ['rooms', 'functions'].forEach(function (art) {
    var betroffen = {};
    alle.forEach(function (id) {
      enumsVon(id, art).forEach(function (eid) { betroffen[eid] = true; });
    });
    Object.keys(betroffen).forEach(function (eid) {
      var o = enums[eid];
      if (!o || !o.native || o.native.angelegtVon !== 'alias-workbench') { return; }
      var uebrig = ((o.common && o.common.members) || []).filter(function (m) {
        return alle.indexOf(m) === -1;
      });
      if (!uebrig.length) {
        raus.push({ id: eid, art: art,
                    name: txt((o.common || {}).name) || eid.split('.').pop() });
      }
    });
  });
  return raus;
}

export function zeichneLoeschen() {
  var ziel = S.loeschZiel;
  var body = $('#del-body');
  body.textContent = '';
  var alle = loeschUmfang();

  var kopf = el('div');
  kopf.style.marginBottom = '11px';
  kopf.style.fontSize = '12.5px';
  kopf.appendChild(el('b', null, tr('del.count', alle.length)));
  body.appendChild(kopf);

  var hin = el('div', 'aside w');
  hin.style.marginBottom = '11px';
  hin.textContent = tr('del.hint');
  body.appendChild(hin);

  var gesch = geschwisterVon(ziel);
  if (gesch.length) {
    var gw = el('div', 'aside');
    gw.style.marginBottom = '11px';
    var lab = document.createElement('label');
    lab.style.display = 'flex';
    lab.style.gap = '8px';
    lab.style.alignItems = 'flex-start';
    lab.style.cursor = 'pointer';
    var cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = S.loeschAlleAusgaenge;
    cb.addEventListener('change', function () {
      S.loeschAlleAusgaenge = cb.checked;
      zeichneLoeschen();
    });
    lab.appendChild(cb);
    var txt2 = el('span');
    txt2.appendChild(el('b', null, tr('del.allOutputs', gesch.length + 1)));
    txt2.appendChild(el('div', 'hint', tr('del.allOutputsHint',
      gesch.map(function (x) { return x.split('.').pop(); }).join(', '))));
    lab.appendChild(txt2);
    gw.appendChild(lab);
    body.appendChild(gw);
  }

  var k = el('div', 'card');
  var ch = el('div', 'ch');
  ch.appendChild(el('span', 'typ', tr('del.objects')));
  ch.appendChild(el('span', 'chip bad', String(alle.length)));
  k.appendChild(ch);
  alle.forEach(function (id) {
    var r = el('div', 'slot');
    r.style.gridTemplateColumns = '1fr 90px';
    r.appendChild(el('span', 'sn', id));
    r.appendChild(el('span', 'rx', (S.objects[id] && S.objects[id].type) || ''));
    k.appendChild(r);
  });
  body.appendChild(k);

  /* Mitangelegte Aufzaehlungen, die dadurch leer wuerden, gehen mit —
     und stehen deshalb hier, nicht nur im Nachhinein im Objektbaum. */
  var mitEnums = enumsDieLeerWuerden(alle);
  if (mitEnums.length) {
    var ew = el('div', 'aside');
    ew.style.marginTop = '11px';
    mitEnums.forEach(function (x) {
      ew.appendChild(el('div', null,
        tr(x.art === 'rooms' ? 'del.alsoRoom' : 'del.alsoFunction', x.name)));
    });
    body.appendChild(ew);
  }

  var b = $('#btn-del-go');
  b.disabled = false;
  b.hidden = false;
  b.textContent = tr('del.now');
  if (!$('#dlg-del').open) { $('#dlg-del').showModal(); }
}

export function loescheAlias() {
  if (!S.loeschZiel) { return; }
  var ziel = S.loeschZiel;
  var alle = loeschUmfang();
  /* Kinder vor den Eltern, sonst bleiben Waisen stehen. */
  alle.sort(function (a, b) { return b.length - a.length; });

  /* Vor dem Loeschen bestimmt — danach steht die Mitgliedschaft
     nirgends mehr (die traegt der Admin beim delObject selbst aus).
     Dieselbe Rechnung hat der Dialog gezeigt; hier wird getan, was
     angekuendigt war. */
  var enumsMitzunehmen = enumsDieLeerWuerden(alle).map(function (x) { return x.id; });

  var b = $('#btn-del-go');
  b.disabled = true;
  b.textContent = tr('write.writing');

  var offen = alle.length, fehler = [];
  alle.forEach(function (id) {
    socket.emit('delObject', id, function (err) {
      if (err) { fehler.push(id + ': ' + err); }
      if (--offen === 0) {
        var body = $('#del-body');
        body.textContent = '';
        var m = el('div');
        m.style.fontSize = '13px';
        if (fehler.length) {
          m.appendChild(el('b', null, tr('write.failed', fehler.length)));
        } else {
          m.appendChild(el('b', null, tr('del.done', alle.length)));
        }
        body.appendChild(m);
        alle.forEach(function (x) { delete S.objects[x]; });
        S.keysSorted = Object.keys(S.objects).sort();

        /* Ordner, die dadurch leer geworden sind, mitnehmen — aber nur
           die eigenen Zwischenebenen unterhalb von alias.0, und nur
           solange wirklich nichts mehr darin liegt. Und Aufzaehlungen,
           die die Werkbank selbst angelegt hat und die jetzt leer sind,
           gleich mit. */
        /* Nach dem Erfolg gibt es nichts mehr zu entfernen - der Knopf
           verschwindet, statt ausgegraut neben „Schliessen" zu stehen.
           Nach einem Fehlschlag bleibt er als „Noch einmal". */
        if (fehler.length) {
          b.disabled = false;
          b.textContent = tr('write.retry');
        } else {
          b.hidden = true;
        }
        leereEnumsRaeumen(enumsMitzunehmen, alle, function () {
          leereOrdnerRaeumen(ziel, function () {
            S.loeschZiel = null;
            S.entwurf = null;
            S.current = null;
            zeichneBaum();
            zeichneErgebnis();
          });
        });
      }
    });
  });
}

/* Aufzaehlungen, die die Werkbank selbst angelegt hat (Herkunftsmarke in
   native) und deren letztes Mitglied gerade geloescht wurde, verschwinden
   mit. Fremde und vorbestehende Aufzaehlungen bleiben — dort ist leer
   kein Fehler, sondern ein Zustand, den jemand anders verantwortet.
   Gerechnet wird gegen die eigene Loeschliste, nicht gegen den Stand im
   Speicher: der Admin traegt Mitgliedschaften beim delObject selbst aus,
   und ob seine Meldung schon angekommen ist, ist Zufall. */
function leereEnumsRaeumen(eids, geloescht, fertig) {
  var offen = eids.length;
  if (!offen) { return fertig(); }
  eids.forEach(function (eid) {
    var o = enums[eid];
    var uebrig = ((o && o.common && o.common.members) || []).filter(function (m) {
      return geloescht.indexOf(m) === -1;
    });
    var eigene = !!(o && o.native && o.native.angelegtVon === 'alias-workbench');
    if (!o || uebrig.length || !eigene) {
      if (--offen === 0) { fertig(); }
      return;
    }
    socket.emit('delObject', eid, function () {
      delete enums[eid];
      if (--offen === 0) { fertig(); }
    });
  });
}

/* ================== Einen Alias verlegen ==================

   Verschieben und Umbenennen sind im Objektspeicher dasselbe, und beides
   gibt es dort nicht: Eine Kennung laesst sich nicht aendern. Was hier
   „verlegen“ heisst, ist immer anlegen unter der neuen Kennung und
   loeschen unter der alten. Ob sich dabei der Ordner aendert, der Name
   oder beides, ist nur eine Frage der Felder.

   Das Unangenehme daran ist nicht der Umzug, sondern was zurueckbleibt.
   Eine Messreihe in InfluxDB haengt an der Kennung, nicht am Geraet: Die
   Aufzeichnung wandert mit, die bisherigen Werte bleiben unter der alten
   Kennung liegen und werden nicht mehr ergaenzt. Dasselbe gilt fuer
   jedes Skript und jede Ansicht, die die alte Kennung nennt. Die
   Werkbank kann das nicht reparieren - sie kann es aber benennen, und
   genau das tut der Dialog, bevor irgendetwas geschieht. */


function verlegeUmfang(alt) {
  return S.keysSorted.filter(function (id) {
    return id === alt || id.indexOf(alt + '.') === 0;
  });
}

/* Wer nennt diese Kennung sonst noch?

   Die Skripte des javascript-Adapters lassen sich durchsuchen; sie sind
   der haeufigste Ort, an dem eine Kennung im Klartext steht. vis-
   Ansichten und fremde Adapter kann die Werkbank nicht durchsehen -
   darauf weist der Dialog eigens hin, statt Vollstaendigkeit
   vorzutaeuschen. */
export function sucheInSkripten(kennung, fertig) {
  var treffer = [];
  var fertigMit = function () { fertig(treffer); };
  try {
    socket.emit('getObjectView', 'script', 'javascript',
      { startkey: 'script.js.', endkey: 'script.js.\u9999' }, function (err, doc) {
        if (err || !doc || !doc.rows) { return fertigMit(); }
        doc.rows.forEach(function (r) {
          var o = r.value;
          var q = o && o.common && o.common.source;
          if (!q || q.indexOf(kennung) === -1) { return; }
          var zeilen = String(q).split('\n');
          var stellen = [];
          zeilen.forEach(function (z, i) {
            if (z.indexOf(kennung) > -1) { stellen.push(i + 1); }
          });
          treffer.push({
            id: r.id,
            name: txt((o.common || {}).name) || r.id.split('.').pop(),
            an: !!(o.common && o.common.enabled),
            zeilen: stellen
          });
        });
        fertigMit();
      });
  } catch { fertigMit(); }
}

export function zeigeVerlegen(altVorgabe, zielVorgabe) {
  /* Der Knopf steht auch an der Quelle, sobald es den Alias gibt (T1).
     Dort ist S.current die Quelle, nicht der Alias - gemeint ist immer
     das Ziel des Entwurfs. Genauso haelt es zeigeLoeschen; zeigeTausch
     tat es bis 05.09.2026 nicht, und beide Knoepfe waren an der Quelle
     sichtbar, aber wirkungslos: kein Dialog, keine Meldung.

     Die zwei Vorgaben kommen vom Knopf „stattdessen verlegen" in der
     Zielleiste: dort ist das Ziel des Entwurfs der NEUE Pfad, den es
     noch gar nicht gibt - ohne Vorgabe stiege der Dialog gleich in der
     ersten Zeile wieder aus. Verlegt wird der vorhandene Alias
     (`altVorgabe`), und die Felder stehen schon auf dem, was in der
     Zielleiste getippt wurde (`zielVorgabe`). */
  var alt = (typeof altVorgabe === 'string' && altVorgabe) ||
            (S.entwurf && (S.entwurf.ziel || S.entwurf.kanal)) || S.current;
  if (!alt || alt.indexOf('alias.') !== 0 || !S.objects[alt]) { return; }
  S.verlegeZiel = alt;

  var vorbelegt = (typeof zielVorgabe === 'string' && zielVorgabe &&
                   zielVorgabe.indexOf('alias.') === 0) ? zielVorgabe : alt;
  var teile = vorbelegt.split('.');
  var name0 = teile.pop();
  var ordner0 = teile.join('.');

  var body = $('#move-body');
  body.textContent = '';

  /* --- die beiden Felder --- */
  var bar = el('div', 'zielbar');
  bar.appendChild(el('span', 'zl', tr('target.folder')));

  /* Dasselbe Feld wie beim Anlegen, mit derselben Vorschlagsliste. Ohne
     sie muesste man den Zielordner auswendig wissen und fehlerfrei
     tippen - bei einem Vorgang, der Objekte loescht, die falscheste
     Stelle fuer einen Tippfehler. */
  var wrapO = el('div', 'feldwrap');
  var iO = el('input', 'tx ordnerfeld');
  iO.type = 'text';
  iO.setAttribute('autocomplete', 'off');
  iO.value = ordner0.indexOf('alias.0.') === 0 ? ordner0.slice('alias.0.'.length) : '';
  iO.placeholder = tr('target.folderPlaceholder');
  wrapO.appendChild(iO);

  /* Kreuz zum Leeren - dann liegt der Alias direkt unter alias.0. */
  var xO = el('span', 'feldx');
  xO.title = tr('target.clearField');
  xO.setAttribute('aria-label', tr('target.clearField'));
  xO.addEventListener('mousedown', function (ev) {
    ev.preventDefault();
    iO.value = '';
    malen();
    ordnerMalen(true);
    iO.focus();
  });
  wrapO.appendChild(xO);

  var listeO = el('div', 'vorschlaege');
  listeO.hidden = true;
  wrapO.appendChild(listeO);
  bar.appendChild(wrapO);

  /* Beim Aufklappen die ganze Liste, erst beim Tippen filtern.

     Vorher filterte auch das Aufklappen mit dem Feldinhalt - und der ist
     vorbelegt. Wer den Alias nur umbenennen wollte, sah genau einen
     Eintrag: den Ordner, in dem er ohnehin liegt. Um irgendwohin sonst
     zu verschieben, musste man das Feld erst leeren. Dasselbe hatte das
     Musterfeld schon gelernt: aufklappen zeigt alles, tippen sucht. */
  var ordnerMalen = function (alleZeigen) {
    var such = alleZeigen ? '' : String(iO.value || '').trim().toLowerCase();
    var jetzt = String(iO.value || '').trim();
    var alle = ordnerUnterAlias()
      .map(function (o) { return o.slice('alias.0.'.length); })
      .filter(Boolean)
      .filter(function (o) { return !such || o.toLowerCase().indexOf(such) > -1; });

    listeO.textContent = '';

    /* „kein Ordner“ gehoert dazu: alias.0 selbst ist ein gueltiger Platz,
       steht aber in keiner Ordnerliste. */
    if (!such && jetzt) {
      var z0 = el('div', 'vz');
      z0.appendChild(el('span', null, tr('move.noFolder')));
      z0.addEventListener('mousedown', function (ev) {
        ev.preventDefault();
        iO.value = '';
        listeO.hidden = true;
        malen();
      });
      listeO.appendChild(z0);
    }

    alle.forEach(function (o) {
      var z = el('div', 'vz' + (o === jetzt ? ' gewaehlt' : ''));
      z.appendChild(el('span', null, o));
      z.addEventListener('mousedown', function (ev) {
        ev.preventDefault();
        iO.value = o;
        listeO.hidden = true;
        malen();
      });
      listeO.appendChild(z);
    });

    listeO.hidden = !listeO.childNodes.length;
  };
  iO.addEventListener('focus', function () { ordnerMalen(true); });
  iO.addEventListener('blur', function () {
    setTimeout(function () { listeO.hidden = true; }, 140);
  });
  bar.appendChild(el('span', 'zl', tr('target.name')));
  var iN = el('input', 'tx');
  iN.type = 'text';
  iN.value = name0;
  iN.style.width = '200px';
  bar.appendChild(iN);
  body.appendChild(bar);

  var vorschau = el('div');
  body.appendChild(vorschau);

  var saeubern = function (t) {
    return String(t).trim()
      .replace(/[^\w.\- \u00e4\u00f6\u00fc\u00c4\u00d6\u00dc\u00df]/g, '_')
      .replace(/\s+/g, '_')
      .replace(/\.{2,}/g, '.')
      .replace(/^\.+|\.+$/g, '');
  };
  var neuesZiel = function () {
    /* Zwei verschiedene Regeln, und das mit Absicht: im ORDNER trennen
       Punkte die Unterebenen und muessen bleiben, im NAMEN wuerden sie
       eine neue Ebene aufmachen. Der Name geht deshalb durch dieselbe
       Funktion wie der automatische Vorschlag - vorher hatte dieser
       Dialog seine eigene, und aus „Dimmer Neu, Test." wurde
       `Dimmer_Neu__Test` statt `Dimmer_Neu_Test` (26.08.2026). */
    var o = saeubern(iO.value), n = kennungtauglich(iN.value);
    if (!n) { return ''; }
    return 'alias.0.' + (o ? o + '.' : '') + n;
  };

  var malen = function () {
    vorschau.textContent = '';
    var neu = neuesZiel();
    var b = $('#btn-move-go');

    if (!neu) {
      vorschau.appendChild(el('div', 'aside w', tr('move.needName')));
      b.disabled = true;
      return;
    }
    if (neu === alt) {
      vorschau.appendChild(el('div', 'aside', tr('move.unchanged')));
      b.disabled = true;
      return;
    }
    if (S.objects[neu]) {
      vorschau.appendChild(el('div', 'aside w', tr('move.exists', neu)));
      b.disabled = true;
      return;
    }
    b.disabled = false;

    var umfang = verlegeUmfang(alt);

    /* Quelle und Ziel einmal, nicht je Datenpunkt.

       Hier stand zuerst jedes Objekt mit voller alter und neuer Kennung
       untereinander - acht Zeilen, in denen sich immer nur die ersten
       beiden Glieder unterschieden und die Punktnamen wortgleich
       wiederholt wurden. Was sich aendert, ist der Pfad; was gleich
       bleibt, gehoert in eine Zeile. */
    var k = el('div', 'card');
    var ch = el('div', 'ch');
    ch.appendChild(el('span', 'typ', tr('move.willMove')));
    ch.appendChild(el('span', 'chip ok', String(umfang.length)));
    k.appendChild(ch);

    var vz = el('div', 'slot');
    vz.style.gridTemplateColumns = '52px 1fr';
    vz.appendChild(el('span', 'rx', tr('move.from')));
    vz.appendChild(el('span', 'sn', alt));
    k.appendChild(vz);

    var nz = el('div', 'slot');
    nz.style.gridTemplateColumns = '52px 1fr';
    nz.appendChild(el('span', 'rx', tr('move.to')));
    nz.appendChild(el('span', 'sn', neu));
    k.appendChild(nz);

    var punkte = umfang.filter(function (id) { return id !== alt; })
      .map(function (id) { return id.slice(alt.length + 1); });
    if (punkte.length) {
      var pz = el('div', 'slot');
      pz.style.gridTemplateColumns = '52px 1fr';
      pz.appendChild(el('span', 'rx', tr('move.with')));
      pz.appendChild(el('span', 'sn', punkte.join(', ')));
      k.appendChild(pz);
    }
    /* Fehlende Ordner ueber dem Ziel werden mit angelegt - das steht
       hier, weil nichts still geschehen soll (verlegeAlias tut es). */
    var teileV = neu.split('.'), ordnerNeu = [];
    for (var iV = 3; iV < teileV.length; iV++) {
      var pfadV = teileV.slice(0, iV).join('.');
      if (!S.objects[pfadV]) { ordnerNeu.push(pfadV); }
    }
    if (ordnerNeu.length) {
      var oz = el('div', 'slot');
      oz.style.gridTemplateColumns = '52px 1fr';
      oz.appendChild(el('span', 'rx', tr('move.newFolder')));
      oz.appendChild(el('span', 'sn', ordnerNeu.join(', ')));
      k.appendChild(oz);
    }
    vorschau.appendChild(k);

    /* --- Warnungen --- */
    var mitCustom = umfang.filter(function (id) {
      var c = S.objects[id] && S.objects[id].common;
      return c && c.custom && Object.keys(c.custom).length;
    });
    if (mitCustom.length) {
      var w1 = el('div', 'aside w');
      w1.appendChild(el('b', null, tr('move.warnHistoryHead')));
      w1.appendChild(document.createTextNode(' ' + tr('move.warnHistory')));
      var ul = el('ul');
      mitCustom.forEach(function (id) {
        var adapter = Object.keys(S.objects[id].common.custom).join(', ');
        ul.appendChild(el('li', null, id + '   \u2192 ' + adapter));
      });
      w1.appendChild(ul);
      vorschau.appendChild(w1);
    }

    var w2 = el('div', 'aside');
    w2.appendChild(el('b', null, tr('move.warnRefsHead')));
    w2.appendChild(document.createTextNode(' ' + tr('move.warnRefs')));
    vorschau.appendChild(w2);

    /* Skripte erst suchen, wenn das Ziel steht - sonst sucht sie bei
       jedem Tastendruck. */
    var skriptFeld = el('div');
    vorschau.appendChild(skriptFeld);
    sucheInSkripten(alt, function (treffer) {
      if (neuesZiel() !== neu) { return; }   /* inzwischen weitergetippt */
      skriptFeld.textContent = '';
      if (!treffer.length) {
        skriptFeld.appendChild(el('div', 'aside', tr('move.noScripts')));
        return;
      }
      var w3 = el('div', 'aside w');
      /* Ein Skript ist kein „1 Skripte“. */
      w3.appendChild(el('b', null, treffer.length === 1
        ? tr('move.scriptsHead1')
        : tr('move.scriptsHead', treffer.length)));
      var ul3 = el('ul');
      treffer.forEach(function (t) {
        ul3.appendChild(el('li', null, t.name + (t.an ? '' : ' (' + tr('move.scriptOff') + ')') +
          '  \u2014  ' + (t.zeilen.length === 1
            ? tr('move.scriptLines', t.zeilen[0])
            : tr('move.scriptLinesN', t.zeilen.join(', ')))));
      });
      w3.appendChild(ul3);
      skriptFeld.appendChild(w3);
    });
  };

  /* Den Knopf zuruecksetzen, BEVOR `malen` urteilt.

     Stand das Zuruecksetzen dahinter, hob es das Urteil gleich wieder
     auf: beim Oeffnen steht „nichts zu tun“ da, und der Knopf war
     trotzdem freigegeben. Gedrueckt hat er nichts getan - `verlegeAlias`
     faengt den Fall ab -, aber ein Knopf, der nichts tut, gehoert nicht
     freigegeben. */
  var b0 = $('#btn-move-go');
  b0.hidden = false;
  b0.disabled = false;
  b0.textContent = tr('move.now');

  iO.addEventListener('input', function () { ordnerMalen(false); malen(); });
  iN.addEventListener('input', malen);
  /* Beim Verlassen steht im Feld, was auch geschrieben wird. Die
     Zielleiste haelt es seit dem 26.08.2026 so; hier blieb „Dimmer Neu,
     Test." stehen, waehrend die Vorschau darunter schon
     `Dimmer_Neu_Test` zeigte - dieselbe Lage wie D19, nur umgekehrt
     herum: das Ziel stimmte, das Feld log. Gefunden 05.09.2026 (T19). */
  iN.addEventListener('change', function () {
    var sauber = kennungtauglich(iN.value);
    if (sauber && sauber !== iN.value) { iN.value = sauber; malen(); }
  });
  malen();
  if (!$('#dlg-move').open) { $('#dlg-move').showModal(); }
  setTimeout(function () { iN.focus(); iN.select(); }, 0);

  /* Der Knopf braucht das Ziel beim Druecken, nicht beim Bauen. */
  b0.onclick = function () { verlegeAlias(alt, neuesZiel()); };
}

export function verlegeAlias(alt, neu) {
  if (!alt || !neu || alt === neu) { return; }
  var umfang = verlegeUmfang(alt);
  var b = $('#btn-move-go');
  b.disabled = true;
  b.textContent = tr('write.writing');

  /* Erst alles Neue anlegen. Geht dabei etwas schief, steht der alte
     Alias noch unversehrt da - besser zwei als keiner. */
  /* Fehlende Ebenen ueber dem Ziel zuerst - das Erzeugen legt sie an
     (baueObjekte), das Verlegen liess sie aus: alias.0.Testecke gab es
     nach einem Umzug dorthin nur als Baumknoten, nicht als Objekt
     (Systemtest 25.08.2026). Gleiche Form wie dort: folder. */
  var arbeit = [];
  var teile = neu.split('.');
  for (var i = 3; i < teile.length; i++) {
    var pfad = teile.slice(0, i).join('.');
    if (!S.objects[pfad]) {
      arbeit.push({ id: pfad, obj: {
        type: 'folder',
        common: { name: teile[i - 1] },
        native: {}
      } });
    }
  }
  umfang.forEach(function (id) {
    var o = JSON.parse(JSON.stringify(S.objects[id]));
    o._id = neu + id.slice(alt.length);
    delete o.ts; delete o.from; delete o.user; delete o.acl;
    arbeit.push({ id: o._id, obj: o });
  });
  var offen = arbeit.length, fehler = [];
  arbeit.forEach(function (a) {
    var zielId = a.id;
    var o = a.obj;
    socket.emit('setObject', zielId, o, function (err) {
      if (err) { fehler.push(zielId + ': ' + err); }
      else {
        /* Sofort in den eigenen Bestand, nicht erst wenn das Abo es
           nachtraegt. Das Abo haelt sich zurueck, solange ein Dialog
           offen steht - und der steht hier offen. Ohne diese Zeile kannte
           die Werkbank ihren eben angelegten Alias nicht, `delKnopf`
           blieb aus, und ein zweites Verlegen war nicht moeglich. */
        S.objects[zielId] = o;
      }
      if (--offen === 0) { S.keysSorted = Object.keys(S.objects).sort(); weiter(); }
    });
  });

  function weiter() {
    if (fehler.length) { return melden(fehler); }

    /* Die Aufzaehlungen mitnehmen: alte Kennung raus, neue rein. Nur die
       eigene - alles andere darin gehoert anderen. */
    var enumArbeit = [];
    ['rooms', 'functions'].forEach(function (art) {
      enumsVon(alt, art).forEach(function (eid) {
        var o = JSON.parse(JSON.stringify(enums[eid]));
        var m = (o.common.members || []).filter(function (x) { return x !== alt; });
        if (m.indexOf(neu) === -1) { m.push(neu); m.sort(); }
        o.common.members = m;
        delete o.ts; delete o.from; delete o.user; delete o.acl;
        enumArbeit.push({ id: eid, obj: o });
      });
    });

    var offen2 = enumArbeit.length;
    if (!offen2) { return loeschen(); }
    enumArbeit.forEach(function (a) {
      socket.emit('setObject', a.id, a.obj, function (err) {
        if (err) { fehler.push(a.id + ': ' + err); }
        if (--offen2 === 0) { loeschen(); }
      });
    });
  }

  function loeschen() {
    /* Kinder vor den Eltern, sonst bleiben Waisen stehen. */
    var weg = umfang.slice().sort(function (a, b) { return b.length - a.length; });
    var offen3 = weg.length;
    weg.forEach(function (id) {
      socket.emit('delObject', id, function (err) {
        if (err) { fehler.push(id + ': ' + err); }
        if (--offen3 === 0) {
          weg.forEach(function (x) { delete S.objects[x]; });
          S.keysSorted = Object.keys(S.objects).sort();
          leereOrdnerRaeumen(alt, function () {
            S.current = neu;
            S.entwurf = null;
            S.verlegeZiel = null;
            melden(fehler, neu);
          });
        }
      });
    });
  }

  function melden(f, zielId) {
    var body = $('#move-body');
    body.textContent = '';
    var m = el('div');
    m.style.fontSize = '13px';
    if (f.length) {
      m.appendChild(el('b', null, tr('write.failed', f.length)));
      var ul = el('ul');
      f.forEach(function (x) { ul.appendChild(el('li', null, x)); });
      m.appendChild(ul);
    } else {
      m.appendChild(el('b', null, tr('move.done', zielId)));
    }
    body.appendChild(m);
    /* Nur in diesem Dialog verschwinden lassen - beim naechsten Oeffnen
       baut ihn `zeigeVerlegen` wieder auf. Vorher blieb er dauerhaft
       versteckt, und ein zweites Verlegen ging nicht mehr. */
    b.hidden = true;
    b.disabled = false;
    ladeEnums(function () {
      zeichneBaum();
      /* Den Alias unter der neuen Kennung wieder aufschlagen.

         `current` allein reicht nicht: der Entwurf haengt an der alten
         Kennung und wurde geloescht, also zeichnete `zeichneErgebnis`
         die leere rechte Seite - obwohl der Baum den neuen Knoten schon
         markiert hatte. Wer danach nochmal verlegen wollte, fand keinen
         Knopf und musste den Alias erst wieder anklicken. `waehle` baut
         den Entwurf neu auf, und damit steht auch der Knopf wieder da. */
      if (zielId && S.objects[zielId]) { waehle(zielId); }
      else { zeichneErgebnis(); }
    });
  }
}

export function delKnopf(zeigen) {
  var b = $('#btn-del');
  if (b) { b.hidden = !zeigen; }
  /* Verlegen und Quellentausch gelten fuer dasselbe: einen Alias, den
     es gibt. */
  var m = $('#btn-move');
  if (m) { m.hidden = !zeigen; }
  var t = $('#btn-swap');
  if (t) { t.hidden = !zeigen; }
}

export function leereOrdnerRaeumen(weg, fertig) {
  var teile = weg.split('.');
  var kette = [];
  for (var i = teile.length - 1; i > 2; i--) {
    kette.push(teile.slice(0, i).join('.'));
  }
  var i2 = 0;
  (function weiter() {
    if (i2 >= kette.length) { return fertig(); }
    var pfad = kette[i2++];
    var o = S.objects[pfad];
    var belegt = S.keysSorted.some(function (id) { return id.indexOf(pfad + '.') === 0; });
    if (!o || o.type !== 'folder' || belegt) { return fertig(); }
    socket.emit('delObject', pfad, function () {
      delete S.objects[pfad];
      S.keysSorted = Object.keys(S.objects).sort();
      weiter();
    });
  })();
}

/* Wirklich schreiben — nur aus dem Trockenlauf heraus erreichbar. */

export function schreibeObjekte() {
  if (!S.entwurf) { return; }
  var entwuerfe2 = zuSchreiben(S.trockenAlle);
  var liste = [];
  var schlecht = 0;
  entwuerfe2.forEach(function (en) {
    baueObjekte(en).forEach(function (o) {
      if (!liste.some(function (x) { return x.id === o.id; })) { liste.push(o); }
    });
    schlecht += pruefeSchreiben(en).length;
  });
  if (schlecht) { return; }

  var body = $('#dry-body');
  var offen = liste.length;
  var fehler = [];
  var fertig = 0;

  $('#btn-dry-write').disabled = true;
  $('#btn-dry-write').textContent = tr('write.writing');
  /* Vor dem Schreiben festhalten: danach gibt es das Ziel, und die Frage
     „war das ein Update?" beantwortete sich sonst immer mit ja. */
  var warUpdate = !!S.objects[S.entwurf.ziel || S.entwurf.kanal];

  var loeschen = S.loeschListe.filter(function (v) { return v.vorgabe; });
  offen += loeschen.length;
  loeschen.forEach(function (v) {
    socket.emit('delObject', v.id, function (err) {
      if (err) { fehler.push(v.id + ': ' + err); } else { fertig++; }
      if (--offen === 0) { abschluss(); }
    });
  });

  liste.forEach(function (x) {
    socket.emit('setObject', x.id, x.obj, function (err) {
      if (err) { fehler.push(x.id + ': ' + err); } else { fertig++; }
      if (--offen === 0) { abschluss(); }
    });
  });

  function abschluss() {
    body.textContent = '';
    var m = el('div');
    m.style.fontSize = '13px';
    if (fehler.length) {
      m.appendChild(el('b', null, tr('write.failed', fehler.length)));
      var ul = el('ul');
      fehler.forEach(function (t) { ul.appendChild(el('li', null, t)); });
      m.appendChild(ul);
    } else {
      m.appendChild(el('b', null, loeschen.length
        ? tr('write.doneWithRemoved', fertig, loeschen.length)
        : tr('write.done', fertig)));
      m.appendChild(el('div', null, tr('write.aliasNowAt', S.entwurf.ziel || S.entwurf.kanal)));
    }
    body.appendChild(m);

    /* Der Dialog bleibt nach dem Schreiben stehen, damit man das Ergebnis
       liest. Was dann noch dastand, passte aber nicht mehr: die
       Ueberschrift sprach weiter davon, was entstehen *wuerde*, und der
       Knopf trug wieder „Jetzt anlegen" - deaktiviert, weil das Schreiben
       ihn gesperrt hatte und niemand ihn wieder freigab. Ein Knopf, der
       nichts mehr tun kann, gehoert weg, nicht ausgegraut hin.

       Ging etwas schief, bleibt er stehen und heisst „Noch einmal
       versuchen" - da hat er wieder eine Aufgabe. */
    var zt2 = $('#dry-titel');
    if (fehler.length) {
      if (zt2) { zt2.textContent = tr('write.dryTitleFailed'); }
      $('#btn-dry-write').hidden = false;
      $('#btn-dry-write').disabled = false;
      $('#btn-dry-write').textContent = tr('write.retry');
    } else {
      if (zt2) {
        zt2.textContent = warUpdate ? tr('write.dryTitleDoneUpdate')
                                    : tr('write.dryTitleDoneCreate');
      }
      $('#btn-dry-write').hidden = true;
    }
    S.loeschListe = [];

    /* Die Marke „geaendert“ hat ihre Aufgabe erfuellt.

       Sie sagt „das hast du angefasst, es steht noch nicht so am Alias“.
       Nach dem Schreiben steht es so am Alias — die Marke blieb aber
       stehen, bis man den Reiter neu lud, und behauptete damit eine
       Abweichung, die es nicht mehr gibt. Nur bei Erfolg loeschen: ging
       etwas schief, ist die Aenderung tatsaechlich noch nicht drin. */
    if (!fehler.length && S.entwurf && S.entwurf.states) {
      S.entwurf.states.forEach(function (s) { s.geaendert = false; rateBehalten(s); });
      S.entwurf.rateMeldung = null;
    }

    /* Nur der Aliaszweig, nicht die ganze Datenbank. */
    holeZweig((S.entwurf.ziel || S.entwurf.kanal).split('.').slice(0, 2).join('.') + '.');
  }
}
