/* Freie Plaetze vorschlagen - ein Versuch, kein Wissen.

   Setzt nur Rollen im Entwurf; entscheiden laesst es den Detektor. */

import { musterVon, erkenneEntwurf } from './erkennung.js';

/* ================== Plaetze raten ==================

   Ein Geraet, das kein Muster trifft, ist nicht unbedingt ein
   unbekanntes Geraet - oft fehlt nur eine Rolle. Ricardos Klimaanlage
   (midea) bringt alles mit, was `airCondition` verlangt, aber
   `control.operationalMode` traegt die Rolle `switch` statt
   `level.mode.airconditioner`. `MODE` ist der einzige Pflichtplatz des
   Musters - also passt nichts, und weil die Erkennung Alles-oder-nichts
   ist, fallen auch die drei Plaetze weg, die sehr wohl gepasst haetten.

   Wichtig fuer das Verstaendnis: die Rolle steht am **Alias**-Punkt,
   nicht an der Quelle. Am Geraet aendert das Raten nichts. Es setzt nur
   Rollen im Entwurf - entscheiden laesst es weiter den Detektor. Passt
   die Vermutung, bestaetigt er sie und vergibt die Platznamen selbst;
   passt sie nicht, faellt sie durch und man sieht es sofort. Deshalb
   gibt es hier keinen zweiten Erkennungsweg neben dem bestehenden.

   Geraten wird nur auf Knopfdruck. Bei der automatischen Erkennung
   nicht - sonst wuesste man nie mehr, was gemessen und was vermutet
   ist. */

/* Woerter eines Namens: camelCase getrennt, Trenner weg, klein.
   `control_operationalMode` -> ['control','operational','mode'] */
function wortListe(t) {
  return String(t || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_.\-]+/g, ' ')
    .toLowerCase().trim().split(/\s+/).filter(Boolean);
}

/* Wortbruecken zwischen den Platznamen des Detektors und dem, was
   Adapter tatsaechlich schreiben. Die Platznamen sind ioBroker-Jargon,
   die Adapternamen englische Produktwoerter - dazwischen fehlt sonst
   die Bruecke.

   Das ist die einzige gepflegte Liste, und sie enthaelt mit Absicht
   **kein Geraetewissen**, nur Wortgleichungen. Eine Geraeteliste
   altert mit jedem Adapter; Woerter tun das nicht.

   Verglichen wird als Wortanfang, damit „operation" auch
   „operational" trifft. Umkehrungen bleiben draussen: `reachable` ist
   nicht `UNREACH`, und wer das raet, dreht einem Nutzer die
   Ausfallmeldung um. */
var WORTBRUECKE = {
  SET: ['target', 'soll', 'setpoint'],
  SET_HEATING: ['heating', 'heiz'],
  SET_COOLING: ['cooling', 'kuehl'],
  ACTUAL: ['indoor', 'current', 'measured', 'room', 'inside', 'ist'],
  MODE: ['operation', 'betrieb'],
  WORKING_MODE: ['operation', 'betrieb'],
  SPEED: ['fan', 'luefter'],
  SPEED_LEVEL: ['fan', 'speed'],
  POWER: ['onoff', 'ein'],
  BOOST: ['turbo', 'boost'],
  SWING: ['schwenk'],
  HUMIDITY: ['humid', 'feuchte'],
  UNREACH: ['unreach', 'offline'],
  LOWBAT: ['lowbat', 'lowbattery'],
  ERROR: ['error', 'fault', 'fehler', 'stoerung'],
  MAINTAIN: ['maintenance', 'wartung'],
  RSSI: ['rssi'],
  BATTERY: ['battery', 'batterie'],
  CONSUMPTION: ['consumption', 'verbrauch', 'energy'],
  CURRENT: ['strom'],
  VOLTAGE: ['voltage', 'spannung'],
  FREQUENCY: ['frequency', 'frequenz'],
  WORKING: ['working', 'busy'],
  DIRECTION: ['direction', 'richtung']
};

function bruecken(platzName) {
  var b = WORTBRUECKE[platzName] || [];
  return b.concat(wortListe(platzName));
}

/* Vorsilben, die Adapter zum Trennen von Stellen und Melden benutzen.
   midea schreibt `control.X` und `status.X`, Tasmota `cmnd` und `stat`. */
var VORSILBE = /^(control|status|cmnd|cmd|stat|state|set|get|soll|ist|steuerung)$/;

function kernWoerter(name) {
  var w = wortListe(name);
  if (w.length > 1 && VORSILBE.test(w[0])) { w = w.slice(1); }
  return w;
}

/* Der eigentliche Rateschritt. Gibt zurueck, wie viele Plaetze belegt
   wurden - null heisst: es gab nichts zu holen. */
/* Der nicht veraendernde Vorbau des Ratens: was ist frei, was kaeme in
   Frage? Geteilt zwischen dem Raten selbst und der Frage, ob der Knopf
   ueberhaupt etwas anzubieten haette. */
function rateLage(e) {
  var mu = musterVon(e.want);
  if (!mu) { return null; }

  /* 1. Was schon belegt ist, bleibt unangetastet - in beide
        Richtungen: weder der Platz noch die Zeile. */
  var fund = erkenneEntwurf(e, e.want);
  var platzBelegt = {}, zeileBelegt = {};
  if (fund.length) {
    fund[0].states.forEach(function (x) {
      if (!x.id) { return; }
      platzBelegt[x.name] = true;
      zeileBelegt[x.id.slice(e.kanal.length + 1)] = true;
    });
  }
  var namenDa = {};
  e.states.forEach(function (st) { namenDa[st.n] = true; });

  var freiePlaetze = [];
  var gesehen = {};
  mu.states.forEach(function (pl) {
    if (!pl.name || !pl.defaultRole) { return; }
    if (platzBelegt[pl.name] || gesehen[pl.name]) { return; }
    gesehen[pl.name] = true;
    freiePlaetze.push(pl);
  });
  if (!freiePlaetze.length) { return null; }

  /* Ein Quellpunkt gehoert an genau eine Stelle.

     Gezaehlt wird ueber die Quelle, nicht ueber den Zeilennamen. Wer als
     Schreib- oder Lesequelle in einer Zeile mit Platz steckt, ist
     vergeben - auch wenn seine eigene Zeile unangehakt danebensteht.
     Genau das fehlte: nach dem Speichern und Wiedereinlesen sah
     `status.operationalMode` frei aus, obwohl es die Lesequelle von MODE
     ist, und wanderte beim naechsten Vorschlag auf WORKING_MODE - den
     Leseplatz zum selben Modus. Jeder Durchgang legte einen drauf, und
     ueber Alias und zurueck sogar zwei.

     Zeilen ohne Platz bleiben Kandidaten, auch wenn sie angehakt sind -
     wer „alle" gewaehlt hat, soll trotzdem Vorschlaege bekommen. */
  var quelleBelegt = {};
  e.states.forEach(function (st) {
    if (!zeileBelegt[st.n]) { return; }
    if (st.srcR) { quelleBelegt[st.srcR] = true; }
    if (st.srcW) { quelleBelegt[st.srcW] = true; }
  });

  var freieZeilen = e.states.filter(function (st) {
    if (!st.n || !st.srcR || zeileBelegt[st.n]) { return false; }
    if (quelleBelegt[st.srcR]) { return false; }
    if (st.srcW && quelleBelegt[st.srcW]) { return false; }
    return true;
  });
  if (!freieZeilen.length) { return null; }
  return { mu: mu, namenDa: namenDa, freiePlaetze: freiePlaetze,
           freieZeilen: freieZeilen };
}

/* Gibt es ueberhaupt etwas, das der Knopf vorschlagen koennte? Die
   komplette Rechnung, nur ohne anzuwenden - eine grobe Vorpruefung
   liess den Knopf stehen, obwohl die Schwelle hinterher alles verwarf
   (Ricardos Thermostat: 3 Zeilen, 22 freie Plaetze, nichts passt).
   Der Preis ist ein zusaetzlicher Bewertungslauf je Zeichnen; die
   teuren Erkennungslaeufe macht das Zeichnen ohnehin mehrfach. */
export function rateMoeglich(e) {
  return ratePlaetze(e, true) > 0;
}

export function ratePlaetze(e, trocken) {
  var lage = rateLage(e);
  if (!lage) { return 0; }
  var mu = lage.mu, namenDa = lage.namenDa;
  var freiePlaetze = lage.freiePlaetze, freieZeilen = lage.freieZeilen;

  /* 2. Stellen und Melden zusammenfuehren.

        Bleibt nach dem Abstreifen der Vorsilbe derselbe Name uebrig und
        ist einer schreibbar, der andere nicht, gehoeren sie zusammen:
        geschrieben wird auf den einen, gelesen aus dem anderen. Das ist
        keine Eigenheit von midea - Tasmota macht es mit cmnd und stat
        genauso, und die Trennung „liest aus / schreibt auf" gibt es in
        der Werkbank ohnehin. */
  var gruppen = {};
  freieZeilen.forEach(function (st) {
    var k = kernWoerter(st.n).join('');
    if (!k) { return; }
    (gruppen[k] = gruppen[k] || []).push(st);
  });
  var partnerVon = {};
  var stillgelegt = {};
  Object.keys(gruppen).forEach(function (k) {
    var g = gruppen[k];
    if (g.length !== 2) { return; }
    var schreibt = g.filter(function (x) { return !!x.srcW; });
    var meldet = g.filter(function (x) { return !x.srcW; });
    if (schreibt.length !== 1 || meldet.length !== 1) { return; }
    partnerVon[schreibt[0].n] = meldet[0];
    stillgelegt[meldet[0].n] = true;
  });
  var kandidaten = freieZeilen.filter(function (st) { return !stillgelegt[st.n]; });

  /* 3. Wie haeufig ist ein Wort auf diesem Geraet?

        „mode" steht bei der Klimaanlage in ecoMode, operationalMode,
        swingMode, turboMode, childSleepMode und timerMode. Ein Wort,
        das fast ueberall steht, unterscheidet nichts - es zaehlt also
        weniger als eines, das nur einmal vorkommt. Das erspart eine
        Tabelle voller Sonderfaelle. */
  var haeufig = {};
  kandidaten.forEach(function (st) {
    var w = {};
    kernWoerter(st.n).forEach(function (x) { w[x] = 1; });
    Object.keys(w).forEach(function (x) { haeufig[x] = (haeufig[x] || 0) + 1; });
  });

  /* Welche Woerter gehoeren einem *anderen* Platz? Wer `swingMode`
     heisst, ist der Schwenk und nicht der Betriebsmodus - auch wenn
     „mode" darin steht. */
  var fremdWort = {};
  freiePlaetze.forEach(function (pl) {
    bruecken(pl.name).forEach(function (b) {
      (fremdWort[b] = fremdWort[b] || {})[pl.name] = true;
    });
  });

  function typPasst(pl, st) {
    if (!pl.type || !st.typ) { return true; }
    var t = Array.isArray(pl.type) ? pl.type : [pl.type];
    return t.indexOf(st.typ) > -1;
  }

  function punkte(pl, st) {
    /* Was unmoeglich ist, kommt gar nicht erst in die Bewertung. */
    if (pl.write === true && !st.srcW && !partnerVon[st.n]) { return -1; }
    if (!typPasst(pl, st)) { return -1; }

    var w = kernWoerter(st.n);
    var wSet = {};
    w.forEach(function (x) { wSet[x] = 1; });
    var pw = wortListe(pl.name);
    var punkt = 0, beleg = false;

    /* Gemeinsame Woerter, gewichtet nach Seltenheit. */
    pw.forEach(function (x) {
      if (!wSet[x]) { return; }
      beleg = true;
      punkt += Math.round(40 / Math.max(1, haeufig[x] || 1));
    });
    if (pw.join('') === w.join('')) { punkt += 45; beleg = true; }

    /* Wortbruecken, als Wortanfang verglichen.

       Eine Bruecke, die schon im Platznamen steht, zaehlt nicht noch
       einmal - sonst gewinnt der Platz mit dem laengeren Namen. Genau
       daran bekam die Klimaanlage `SPEED_LEVEL` statt `SPEED`: „speed"
       zaehlte dort als Namenswort **und** als Bruecke. */
    (WORTBRUECKE[pl.name] || []).forEach(function (b) {
      if (pw.indexOf(b) > -1) { return; }
      if (w.some(function (x) { return x.indexOf(b) === 0 || b.indexOf(x) === 0; })) {
        punkt += 30; beleg = true;
      }
    });

    /* Traegt der Name das Kennwort eines anderen Platzes, gehoert er
       wahrscheinlich dorthin - aber nur, wenn dieses Wort ueberhaupt
       etwas unterscheidet.

       Die Strafe wird nach derselben Seltenheitsregel gewichtet wie die
       Belohnung. „swing" steht bei der Klimaanlage nur an einem Punkt,
       also spricht es deutlich gegen jeden anderen Platz. „mode" steht
       an sechsen; wer daraus eine volle Strafe macht, wirft
       `turboMode` aus BOOST heraus, obwohl „turbo" eindeutig ist. */
    w.forEach(function (x) {
      var andere = fremdWort[x];
      if (!andere) { return; }
      if (Object.keys(andere).some(function (n) { return n !== pl.name; }) && !andere[pl.name]) {
        punkt -= Math.round(35 / Math.max(1, haeufig[x] || 1));
      }
    });

    /* Eine Werteliste ist ein starkes Zeichen fuer einen Modusplatz -
       und ihr Fehlen ein ebenso starkes dagegen. */
    var modus = /mode|swing/.test(pl.defaultRole || '');
    if (modus && st.states) { punkt += 25; }
    if (modus && !st.states) { punkt -= 15; }

    /* Einheit und Typ bestaetigen, mehr nicht. */
    if (/temperature/.test(pl.defaultRole || '') && st.unit === '\u00b0C') { punkt += 15; }
    if (/humidity/.test(pl.defaultRole || '') && st.unit === '%') { punkt += 15; }
    if (pl.type && st.typ && typPasst(pl, st)) { punkt += 8; }

    /* Rollenfamilie: auch eine falsche Rolle traegt Auskunft. */
    var fam = String(pl.defaultRole || '').split('.')[0];
    if (fam && String(st.role || '').split('.')[0] === fam) { punkt += 8; }

    /* Die Schreibrichtung entscheidet, wo Gleichstand herrscht.

       `airCondition` hat zu jedem Modus zwei Plaetze: MODE stellt
       (`level.mode.airconditioner`), WORKING_MODE meldet nur
       (`value.mode.airconditioner`). Nach Namen und Werteliste sind
       beide gleich gut - der Unterschied ist, ob der Punkt etwas
       stellen kann. Ohne diese Regel entschied die Reihenfolge im
       Muster, und die Klimaanlage bekam den Melder statt des
       Stellglieds. */
    var kannStellen = !!(st.srcW || partnerVon[st.n]);
    if (pl.write === true && kannStellen) { punkt += 12; }
    if (pl.write === false && !kannStellen) { punkt += 6; }
    if (pl.write === false && kannStellen) { punkt -= 6; }

    /* Ohne einen Namensbeleg wird nicht geraten. Typ, Einheit und
       Rollenfamilie allein passen auf zu vieles. */
    return beleg ? punkt : -1;
  }

  /* 4. Alle Paare bewerten, das beste zuerst nehmen. */
  var SCHWELLE = 30;
  var paare = [];
  freiePlaetze.forEach(function (pl) {
    kandidaten.forEach(function (st, i) {
      var pkt = punkte(pl, st);
      /* Die Zeile wird ueber ihre Stelle gemerkt, nicht ueber ihren
         Namen - den benennt das Zuordnen ja selbst um. Vorher stand
         hier `zeileWeg[pa.st.n]`, und weil die Zeile nach dem ersten
         Treffer schon MODE hiess, kannte der Schutz sie beim zweiten
         Durchgang nicht wieder: derselbe Punkt bekam MODE und gleich
         darauf WORKING_MODE, und am Ende blieb der Leseplatz stehen. */
      if (pkt >= SCHWELLE) { paare.push({ pl: pl, st: st, nr: i, pkt: pkt }); }
    });
  });
  paare.sort(function (a, b) { return b.pkt - a.pkt; });

  var platzWeg = {}, zeileWeg = {}, gesetzt = 0;
  paare.forEach(function (pa) {
    if (platzWeg[pa.pl.name] || zeileWeg[pa.nr]) { return; }
    /* Traegt schon eine andere Zeile diesen Namen, waere der Alias
       doppelt belegt. Dann lieber nichts. */
    if (namenDa[pa.pl.name] && pa.st.n !== pa.pl.name) { return; }
    platzWeg[pa.pl.name] = true;
    zeileWeg[pa.nr] = true;
    gesetzt++;
    /* Im Trockenlauf zaehlt nur, was vergeben wuerde - namenDa gehoert
       zur lokalen Lage und muss mitziehen, damit die Doppelnamen-Regel
       genauso greift wie beim echten Lauf. */
    if (trocken) { namenDa[pa.pl.name] = true; return; }

    var st = pa.st, partner = partnerVon[st.n];
    st.ratenVorher = { n: st.n, role: st.role, on: st.on, srcR: st.srcR };
    st.n = pa.pl.name;
    st.role = pa.pl.defaultRole;
    st.on = true;
    st.geraten = true;
    namenDa[pa.pl.name] = true;
    if (partner) {
      /* Schreiben auf den Stellpunkt, lesen vom Melder. */
      st.ratenVorher.partner = { n: partner.n, on: partner.on };
      st.srcR = partner.srcR;
      partner.on = false;
      st.geratenPartner = partner.n;
    }
  });
  return gesetzt;
}

/* Eine einzelne Vermutung zuruecknehmen. */
export function rateZurueckEine(e, st) {
  if (!st.geraten || !st.ratenVorher) { return false; }
  var v = st.ratenVorher;
  if (v.partner) {
    e.states.forEach(function (x) {
      if (x.n === v.partner.n) { x.on = v.partner.on; }
    });
  }
  st.n = v.n; st.role = v.role; st.on = v.on; st.srcR = v.srcR;
  delete st.geraten; delete st.ratenVorher; delete st.geratenPartner;
  return true;
}

/* Alles zuruecknehmen, was noch die Marke traegt. Bestaetigtes und von
   Hand Geaendertes bleibt stehen - dort ist die Marke schon gefallen. */
export function rateZurueck(e) {
  var weg = 0;
  e.states.slice().forEach(function (st) {
    if (rateZurueckEine(e, st)) { weg++; }
  });
  return weg;
}

export function rateBehalten(st) {
  delete st.geraten; delete st.ratenVorher; delete st.geratenPartner;
}

export function rateAnzahl(e) {
  return e && e.states ? e.states.filter(function (s) { return s.geraten; }).length : 0;
}
