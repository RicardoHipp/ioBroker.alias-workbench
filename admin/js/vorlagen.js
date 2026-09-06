/* Die Geraetevorlagen: laden, pruefen, anwenden, vorschlagen.

   Eine Datei je Vorlage unter admin/vorlagen/, eigene in native der
   Instanz. Die Verarbeitung kennt kein einziges Geraet - alles
   Geraetewissen steckt in den Dateien. */

import { S } from './zustand.js';
import { D, $, el } from './basis.js';
import { hatPunkt, jsonVon, feldWert, kindZustaende, feldFormel } from './werte.js';
import { eigenerKanalName, merkeHakenVorgabe } from './entwurf.js';
import { tasmotaBefehle } from './mqtt.js';
import { socket } from './verbindung.js';

import { tr, sprachtext } from './sprache.js';
import { musterVon } from './erkennung.js';

/* Welche Instanz — der Reiter wird mit ?<instanz>&noFooter geladen. */
var INSTANZ = (function () {
  var s = (location.search || '').replace(/^\?/, '').split('&')[0];
  return /^\d+$/.test(s) ? s : '0';
})();
export var INSTANZ_ID = 'system.adapter.alias-workbench.' + INSTANZ;

/* Zieht die Objektzahl in der Kopfzeile nach. Solange setzeMeta noch
   nicht lief, gibt es den Span nicht - dann zeigt setzeMeta die Zahl
   spaeter selbst. */
export function zeigeObjektzahl() {
  var z = $('#meta-objekte');
  if (z) { z.textContent = tr('app.objectsCount', S.keysSorted.length); }
}

export function setzeMeta() {
  var m = $('#meta');
  if (!m) { return; }
  m.textContent = tr('app.detector') + ' ' + (D ? D.version : '?') +
    '  \u00b7  ' + tr('app.patternsCount', D ? Object.keys(D.patterns).length : 0) +
    '  \u00b7  ' + tr('app.templatesCount', S.VORLAGEN.length) +
    '  \u00b7  ';
  /* Die Objektzahl stand frueher rechts unten in der Fussleiste - dort
     fragte man sich, was sie soll (Ricardo, 25.08.2026). Hier oben
     steht sie neben ihresgleichen; ein eigener Span, damit das Abo sie
     nachfuehren kann, ohne die ganze Zeile neu zu bauen. */
  m.appendChild(el('span', null, tr('app.objectsCount', S.keysSorted.length))).id = 'meta-objekte';
  if (S.vorlagenUnvollstaendig) {
    var w = el('span', 'chip bad', tr('tpls.loadFailed'));
    w.style.marginLeft = '8px';
    w.title = tr('tpls.loadFailedHint');
    m.appendChild(w);
  }
}

export function ladeVorlagen(fertig) {
  fetch('./vorlagen/index.json').then(function (r) { return r.json(); }).then(function (ix) {
    var offen = ix.vorlagen.length;
    if (!offen) { return dazu([]); }
    /* Reihenfolge aus index.json festhalten. Vorher entschied bei
       gleichwertigen Vorlagen, welche Datei zufaellig zuerst fertig
       geladen war — dasselbe Geraet wurde mal Lampe, mal Steckdose. */
    var platz = new Array(ix.vorlagen.length);
    ix.vorlagen.forEach(function (datei, i) {
      fetch('./vorlagen/' + datei).then(function (r) { return r.json(); }).then(function (v) {
        v._datei = datei;
        platz[i] = v;
        if (--offen === 0) { dazu(platz.filter(Boolean)); }
      }).catch(function () { if (--offen === 0) { dazu(platz.filter(Boolean)); } });
    });
  }).catch(function () { dazu([]); });

  /* Dazu die selbstgebauten aus der Instanzkonfiguration. Der Paketordner
     wird von `iobroker upload` geleert, native bleibt und steckt im
     Backup. Bei gleicher id gewinnt die eigene — sie steht dann an der
     Stelle der Paketvorlage, damit die Reihenfolge fest bleibt. */
  function dazu(paket) {
    paket.forEach(function (v) { v._quelle = 'paket'; });
    var durch = false;
    var schluss = function (eigene, ueberlauf) {
      if (durch) { return; }
      durch = true;
      S.vorlagenUnvollstaendig = !!ueberlauf;
      var zus = paket.slice();
      (eigene || []).forEach(function (v) {
        if (!v || !v.id) { return; }
        v._quelle = 'benutzer';
        var i = -1;
        zus.forEach(function (p, k) { if (p.id === v.id) { i = k; } });
        if (i > -1) { zus[i] = v; } else { zus.push(v); }
      });
      S.VORLAGEN = zus;
      fertig();
    };
    /* Wenn die Antwort ausbleibt, laeuft die Oberflaeche weiter — aber
       sie behauptet dann nicht, es gaebe keine eigenen Vorlagen. */
    setTimeout(function () { schluss([], true); }, 6000);
    socket.emit('getObject', INSTANZ_ID, function (err, o) {
      schluss((o && o.native && o.native.vorlagen) || []);
    });
  }
}

/* Eine einzelne Vorlage ablegen oder entfernen.

   Zwei Entscheidungen stecken hier drin, beide teuer erkauft:

   Erstens *nicht* extendObject. Das fuehrt Listen feldweise zusammen:
   eine kuerzer gewordene Liste bliebe unveraendert, und schreibt man
   an Platz 0 eine andere Vorlage, verschmelzen beide zu einem Zwitter
   aus neuem Namen und alten Zustaenden. Gemessen, nicht vermutet.

   Zweitens wird nur *ein Eintrag* geaendert, nie die ganze Liste aus
   dem Arbeitsspeicher zurueckgeschrieben. Sonst haenge die Sicherheit
   der gespeicherten Vorlagen daran, dass das Laden beim Seitenaufbau
   geklappt hat — ein Zeitueberlauf haette aus einem Speichervorgang
   ein stilles Loeschen aller anderen Vorlagen gemacht. */
export function aendereVorlagen(id, vorlage, fertig) {
  socket.emit('getObject', INSTANZ_ID, function (err, o) {
    if (err || !o) { return fertig(err || tr('tpls.noInstance', INSTANZ_ID)); }
    o.native = o.native || {};
    var liste = Array.isArray(o.native.vorlagen) ? o.native.vorlagen.slice() : [];
    var i = -1;
    liste.forEach(function (x, n) { if (x && x.id === id) { i = n; } });
    if (vorlage === null) {
      if (i === -1) { return fertig(null); }
      liste.splice(i, 1);
    } else if (i > -1) {
      liste[i] = vorlage;
    } else {
      liste.push(vorlage);
    }
    o.native.vorlagen = liste;
    socket.emit('setObject', INSTANZ_ID, o, function (e2) { fertig(e2 || null); });
  });
}


/* Welche Ausgangsnummern gibt es? Aus dem Bestand gelesen, nicht
   hochgezaehlt — die Ventilinsel hat POWER1, POWER3, POWER4. */
export function instanzenVon(v, kanal) {
  var mf = v.mehrfach;
  if (!mf) { return [null]; }
  var ph = mf.platzhalter || '%N%';
  var erf = (v.erkennung || {}).erforderlich || [];
  var mitPh = erf.filter(function (e) { return e.indexOf(ph) > -1; });

  var kurzNamen = kindZustaende(kanal).map(function (id) { return id.slice(kanal.length + 1); });

  /* Die Nummern der Ausgaenge muessen nicht als eigene Objekte
     dastehen. Eine Tasmota meldet POWER1..POWER4 in tele/STATE, lange
     bevor es stat/POWER1 gibt — das entsteht erst beim ersten
     Schalten. Wer nur nach Objekten sucht, findet an einem frisch
     eingebundenen Mehrfachgeraet keinen einzigen Ausgang und laesst
     die Vorlage ins Leere laufen. */
  var ausJson = [];
  var inh = (v.erkennung || {}).inhalt || {};
  Object.keys(inh).forEach(function (punkt) {
    if (String(inh[punkt]).indexOf(ph) === -1) { return; }
    var id = hatPunkt(kanal, punkt);
    var j = id ? jsonVon(id) : null;
    if (!j) { return; }
    var teile = String(inh[punkt]).split(ph);
    var vor = teile[0].toLowerCase(), nach = (teile[1] || '').toLowerCase();
    var raus = {};
    Object.keys(j).forEach(function (feld) {
      var k = feld.toLowerCase();
      if (k.length <= vor.length + nach.length) { return; }
      if (k.slice(0, vor.length) !== vor) { return; }
      if (nach && k.slice(-nach.length) !== nach) { return; }
      var mitte = nach ? feld.slice(vor.length, feld.length - nach.length) : feld.slice(vor.length);
      if (mitte && /^[A-Za-z0-9_]+$/.test(mitte)) { raus[mitte] = 1; }
    });
    if (Object.keys(raus).length) { ausJson.push(raus); }
  });

  /* Ohne regulaeren Ausdruck: der Platzhalter teilt die Angabe in
     Vorspann und Nachspann, dazwischen steht die Nummer. */
  var mengen = mitPh.map(function (muster) {
    var teile = muster.split(ph);
    var vor = teile[0].toLowerCase(), nach = (teile[1] || '').toLowerCase();
    var raus = {};
    kurzNamen.forEach(function (n) {
      /* Gross- und Kleinschreibung ignorieren: dasselbe Modell meldet
         mal stat.POWER1 und cmnd.power1 — beides ist derselbe Ausgang. */
      var k = n.toLowerCase();
      if (k.length <= vor.length + nach.length) { return; }
      if (k.slice(0, vor.length) !== vor) { return; }
      if (nach && k.slice(-nach.length) !== nach) { return; }
      var mitte = nach ? n.slice(vor.length, n.length - nach.length) : n.slice(vor.length);
      if (mitte && /^[A-Za-z0-9_]+$/.test(mitte)) { raus[mitte] = 1; }
    });
    return raus;
  });

  /* Leere Mengen fliegen raus. Eine Pflichtangabe, zu der es kein
     einziges Objekt gibt, sagt „hier weiss ich nichts" — nicht „hier
     gibt es keine Ausgaenge". Frueher ging genau diese leere Menge in
     den Schnitt ein und machte ihn immer leer: eine Ventilinsel, die
     POWER1..4 in tele/STATE meldet, aber noch keinen cmnd-Punkt hat,
     fand keinen einzigen Ausgang. Das ist derselbe Fall, fuer den die
     Erkennung aus moeglichen Befehlen gebaut wurde. */
  mengen = mengen.concat(ausJson).filter(function (m) {
    return Object.keys(m).length > 0;
  });
  if (!mengen.length) { return [null]; }

  /* nur Nummern, die in allen Pflichtangaben vorkommen */
  var klein = mengen.map(function (m) {
    var k = {};
    Object.keys(m).forEach(function (n) { k[n.toLowerCase()] = n; });
    return k;
  });
  return Object.keys(klein[0]).filter(function (n) {
    return klein.every(function (k) { return k[n]; });
  }).map(function (n) { return klein[0][n]; })
    .sort(function (a, b) { return String(a).localeCompare(String(b), undefined, {numeric: true}); });
}

export function setzeInstanz(text, v, n) {
  if (!v.mehrfach || n === null || n === undefined) { return text; }
  return String(text).split(v.mehrfach.platzhalter || '%N%').join(n);
}

/* Aus welchem Geraet ist dieser Alias gebaut?

   Zwei Wege, und der zweite ist der wichtigere. `native.quelle` steht am
   Kanal, seit die Werkbank ihn schreibt - das ist die verlaessliche
   Auskunft. Einen von Hand gebauten Alias hat aber niemand so vermerkt;
   dort bleibt nur, den Punkten zu folgen: worauf ihre `alias.id` zeigt,
   davon ist das gemeinsame Elternteil die Quelle. */

/* Wie der Ausgang mit der Nummer n heisst.

   Bei Tasmota ist ein Ausgang kein Objekt — POWER1 steht als Feld in
   tele/STATE, und wie er im Haus heisst, weiss nur der Nutzer. Da
   bleibt nur das Muster aus der Vorlage.

   Bei Homematic ist jeder Ausgang ein eigener Kanal und traegt einen
   Namen: der Doppelaktor Licht_Bar_Esstisch hat die Kanaele „Licht_Bar"
   und „Licht_Esstisch". Diesen Namen zu uebernehmen ist der einzige
   Weg, die beiden Aliase spaeter auseinanderzuhalten — „1" und „2"
   sagen nichts. Traegt der Kanal keinen eigenen Namen (Homematic
   schreibt sonst „<Geraet>:<Nr>" hinein, was nichts hinzufuegt), bleibt
   es beim Muster. */
export function ausgangName(e, n) {
  if (e && e.kanal) {
    var eigen = eigenerKanalName(e.kanal + '.' + n);
    if (eigen) { return eigen.replace(/\./g, '_'); }
  }
  if (!e || !e.kanalnameRoh) { return 'POWER' + n; }
  return String(e.kanalnameRoh).split(e.platzhalter || '%N%').join(n);
}

/* Einen cmnd-Punkt gibt es erst, wenn ihn jemand angelegt hat: eine
   Tasmota sendet dorthin nie, das ist ihr Posteingang. Was sie kann,
   steht aber in dem, was sie sendet — die JSON-Schluessel in tele/STATE
   sind die Befehlsnamen.

   Deshalb zaehlt fuer die Erkennung nicht, ob der Punkt schon da ist,
   sondern ob das Geraet den Befehl kennt. Sonst muss man erst Punkte
   anlegen, damit die Vorlage greift, obwohl die Werkbank langst weiss,
   was vor ihr steht.

   Nur fuer cmnd. stat und tele entstehen von selbst, sobald das Geraet
   sendet — dort ist „fehlt" eine echte Aussage. Und nur, wenn das Geraet
   den Befehl wirklich meldet: ein blosser Messpunkt, der ein Relais
   nennt, soll nicht als Steckdose durchgehen. */
export function befehlMoeglich(kanal, pfad) {
  if (String(pfad).indexOf('cmnd.') !== 0) { return false; }
  var name = String(pfad).slice(5).toLowerCase();
  var b = tasmotaBefehle(kanal);
  if (!b) { return false; }
  return b.befehle.some(function (x) { return String(x.name).toLowerCase() === name; });
}

function punktErfuellt(kanal, pfad) {
  return !!hatPunkt(kanal, pfad) || befehlMoeglich(kanal, pfad);
}

/* Passt die Vorlage auf diesen Kanal? Liefert null oder eine Bewertung. */
export function pruefeVorlage(v, kanal, instanz) {
  var erk = v.erkennung || {};
  var gruende = [];
  var fehler = [];

  var inst = instanz;
  if (v.mehrfach && (inst === undefined || inst === null)) {
    var alle = instanzenVon(v, kanal);
    if (!alle.length) {
      return { vorlage: v, passt: false, fehler: [tr('tpl.noOutputs')], instanzen: [] };
    }
    inst = alle[0];
  }
  var auf = function (t) { return setzeInstanz(t, v, inst); };

  /* Punkte, die es nicht geben darf. Das ist der ehrliche Unterschied
     zwischen einer einfachen und einer mehrfachen Steckdose — vorher
     liess sich das nur ueber den Rang erraten. Bewusst zaehlt ein
     nicht vorhandener Punkt *nicht* als Beleg: sonst liesse sich die
     Bewertung mit einer Liste erfundener Ausschluesse aufblasen. */
  var verbotenDa = ((erk.verboten || []).map(auf)).filter(function (e) { return hatPunkt(kanal, e); });
  verbotenDa.forEach(function (e) { fehler.push(tr('tpl.forbiddenThere', e)); });

  var fehlt = (erk.erforderlich || []).map(auf).filter(function (e) { return !punktErfuellt(kanal, e); });
  fehlt.forEach(function (e) { fehler.push(tr('tpl.missingPoint', e)); });
  (erk.erforderlich || []).map(auf).forEach(function (e) {
    if (fehlt.indexOf(e) !== -1) { return; }
    /* Im „Warum" auseinanderhalten, worauf die Erkennung beruht: ein
       vorhandener Punkt ist eine Tatsache, ein moeglicher eine
       Schlussfolgerung. */
    gruende.push(hatPunkt(kanal, e) ? tr('tpl.presentIn', e) : tr('tpl.possibleIn', e));
  });
  var ausgaenge = v.mehrfach ? instanzenVon(v, kanal) : [];
  if (v.mehrfach) {
    gruende.push(tr('tpl.outputsFound', ausgaenge.join(', ')));
  }

  if (erk.inhalt) {
    Object.keys(erk.inhalt).forEach(function (punkt0) {
      /* Auch hier den Platzhalter ersetzen — ein Mehrfachgeraet nennt
         sein Feld POWER%N%, und ohne Ersetzung suchte die Pruefung nach
         einem Feld, das woertlich so heisst. */
      var punkt = auf(punkt0), feld = auf(erk.inhalt[punkt0]);
      var id = hatPunkt(kanal, punkt);
      var j = id ? jsonVon(id) : null;
      if (!id) { fehler.push(tr('tpl.missingPoint', punkt)); }
      else if (!j) { fehler.push(tr('tpl.noJson', punkt)); }
      else if (feldWert(j, feld) === undefined) {
        fehler.push(tr('tpl.withoutField', punkt, feld));
      } else { gruende.push(tr('tpl.contains', punkt, feld)); }
    });
  }

  if (fehler.length) {
    /* Dieselbe Angabe kann aus erforderlich und inhalt kommen — einmal reicht. */
    var einmal = [];
    fehler.forEach(function (x) { if (einmal.indexOf(x) === -1) { einmal.push(x); } });
    return { vorlage: v, passt: false, fehler: einmal };
  }

  /* Bewertung. Zuerst zaehlt, was die Vorlage am Geraet wirklich
     nachgewiesen hat — jeder gefundene Pflichtpunkt, bei mehreren
     Ausgaengen je Ausgang, dazu jede aufgegangene Inhaltspruefung.
     Erst danach der Namenshinweis, und der entscheidet damit wirklich
     nur zwischen gleich gut belegten Vorlagen. Frueher schlug er alles:
     eine selbstgebaute Vorlage verlor gegen eine mitgelieferte, bloss
     weil deren Wort zufaellig im Geraetenamen stand. Die Abstaende sind
     so gross, dass sich die Stufen nie ueberholen koennen. */
  var name = kanal.split('.').pop();
  var belege = (erk.erforderlich || []).length *
               (v.mehrfach ? Math.max(1, ausgaenge.length) : 1) +
               Object.keys(erk.inhalt || {}).length;
  var namenstreffer = !!(erk.namenshinweis && new RegExp(erk.namenshinweis, 'i').test(name));
  if (namenstreffer) { gruende.push(tr('tpl.nameHint', sprachtext(v.name))); }
  var eigen = v._quelle === 'benutzer';
  var punkte = belege * 1000000 +
               (namenstreffer ? 10000 : 0) +
               (eigen ? 1000 : 0) +
               Math.min(v.rang || 0, 999);
  return { vorlage: v, passt: true, punkte: punkte, gruende: gruende, fehler: [],
           belege: belege, namenstreffer: namenstreffer, eigen: eigen,
           instanz: inst, instanzen: ausgaenge };
}

/* Wohin ein Zustand schreibt. Gibt es den Punkt, ist es seine ID; kennt
   das Geraet den Befehl bloss, ist es die ID, die er bekommen wird. */
export function schreibZiel(z, kanal, auf) {
  if (!z.schreiben) { return ''; }
  var pfad = auf(z.schreiben);
  if (z.schreibenAbs || z.absolut) { return S.objects[pfad] ? pfad : ''; }
  var da = hatPunkt(kanal, pfad);
  if (da) { return da; }
  return befehlMoeglich(kanal, pfad) ? (kanal + '.' + pfad) : '';
}

/* Vorlage auf einen Kanal anwenden → Entwurf.

   `auchOhneTreffer` laesst einen Entwurf auch dann entstehen, wenn keine
   einzige Zeile der Vorlage eine Quelle am Geraet findet. Das gilt nur fuer
   die Wahl von Hand: Genau dafuer ist das Auswahlfeld gedacht — „sonst steht
   man bei einem Geraet, das noch nichts gesendet hat, ohne jede Moeglichkeit
   da". Bis 06.09.2026 fiel gerade dieser Fall durch das Sieb unten, und der
   Wechsel scheiterte still (Ricardo). Die automatische Erkennung ruft ohne
   die Fahne auf und bleibt unveraendert — dort waere ein Entwurf ohne eine
   einzige Zeile ein Fehlgriff. */
export function wendeAn(v, kanal, gruende, instanz, auchOhneTreffer) {
  var auf = function (t) { return setzeInstanz(t, v, instanz); };
  var e = { kanal: kanal, states: [], want: v.geraetetyp, wantAuto: v.geraetetyp,
            alleMuster: false, vorschlag: true, roh: false,
            vorlage: v.id, vorlageVersion: v.version, tplName: sprachtext(v.name),
            grund: (gruende || []).slice(), uebersprungen: [],
            instanz: (instanz === undefined ? null : instanz),
            instanzen: v.mehrfach ? instanzenVon(v, kanal) : [],
            /* Wie der Kanal je Ausgang heisst — steht in der Vorlage,
               nicht im Code. `kanalname` gilt fuer den gerade
               bearbeiteten Ausgang, `kanalnameRoh` fuer jeden anderen:
               die Ausgangswahl und die Sammelanlage muessen die Namen
               der *uebrigen* Nummern bilden koennen. Frueher rechneten
               sie die Nummer aus dem fertigen Namen zurueck, und wo das
               nicht ging, stand 'POWER' + Nummer im Code — ein
               Homematic-Doppelaktor bekam so Ausgaenge namens POWER1
               und POWER2, obwohl er kein POWER kennt. */
            kanalname: v.mehrfach ? auf(v.kanalname || 'POWER%N%') : null,
            kanalnameRoh: v.mehrfach ? (v.kanalname || 'POWER%N%') : null,
            platzhalter: v.mehrfach ? (v.mehrfach.platzhalter || '%N%') : null };

  (v.zustaende || []).forEach(function (z) {
    /* Ein absolut gespeicherter Punkt zeigt auf ein festes Objekt und
       wird nicht unter dem Kanal gesucht — etwa ein gemeinsamer
       Sollwert in 0_userdata. */
    var finde = function (pfad) {
      if (!pfad) { return null; }
      if (z.absolut) { return S.objects[pfad] ? pfad : null; }
      return hatPunkt(kanal, auf(pfad));
    };
    /* Ersatzquelle: dasselbe steht oft an zwei Stellen, und welche davon
       ein Geraet gerade fuehrt, weiss man vorher nicht.

       Der Schaltzustand liegt in stat/POWER und in tele/STATE — stat
       entsteht erst beim ersten Schalten. Die IP steht in tele/INFO2,
       das eine Tasmota beim Start retained hinterlegt, und ausserdem in
       der ersten tele/STATE nach dem Boot, danach nicht mehr.

       Geprueft wird deshalb beides, und zwar vollstaendig: Objekt da UND
       Feld drin. Vorher wurde der Ersatz nur genommen, wenn das Objekt
       ganz fehlte — gab es tele.INFO2 ohne die IP darin, fiel der Punkt
       weg, obwohl tele.STATE sie gehabt haette. */
    var wege = [{ punkt: z.lesen, feld: z.feld, leseformel: z.leseformel }];
    /* Ein Ersatzweg, mehrere Ersatzwege oder blosser Punktname — alles
       drei kommt in Vorlagen vor und soll gehen. */
    var sonst = z.lesenSonst;
    if (sonst) {
      (Array.isArray(sonst) ? sonst : [sonst]).forEach(function (x) {
        wege.push(typeof x === 'string'
          ? { punkt: x, feld: z.feld, leseformel: z.leseformel }
          : { punkt: x.punkt, feld: x.feld, leseformel: x.leseformel });
      });
    }

    var quelle = null, feld = null, leseformel = null, gescheitert = [];
    for (var wi = 0; wi < wege.length; wi++) {
      var w = wege[wi];
      var id0 = finde(w.punkt);
      var wo = auf(w.punkt) + (w.feld ? ' · ' + auf(w.feld) : '');
      if (!id0) { gescheitert.push(wo); continue; }
      if (w.feld) {
        var f0 = auf(w.feld);
        var j0 = jsonVon(id0);
        if (!j0 || feldWert(j0, f0) === undefined) { gescheitert.push(wo); continue; }
      }
      quelle = id0; feld = w.feld; leseformel = w.leseformel;
      break;
    }

    if (!quelle) {
      /* Beide Wege nennen, nicht nur den letzten — sonst sucht man an der
         einen Stelle und die Vorlage hatte an zwei geschaut. */
      e.uebersprungen.push(gescheitert.length > 1
        ? tr('tpl.skippedNowhere', z.name, gescheitert.join(tr('tpl.nor')))
        : tr('tpl.skippedSource', z.name, gescheitert[0] || auf(z.lesen)));
      return;
    }

    /* Auch in der Formel steht der Platzhalter — ohne Ersetzung suchte
       der Alias nach einem Feld namens POWER%N%. */
    var formel = leseformel ? auf(leseformel) : '';
    if (feld) {
      feld = auf(feld);
      /* Mit Fragezeichen-Zugriff: `tele.SENSOR` ist ein Sammeltopf, und
         nicht jede Nachricht darin fuehrt jedes Feld. Ohne Schutz wirft
         `JSON.parse(val).ENERGY.Total` bei einer Nachricht ohne ENERGY
         einen Fehler, der Alias liefert nichts und der Controller
         schreibt eine Warnung. Ricardos handgebaute Formel hatte den
         Schutz laengst, unsere nicht (26.08.2026). */
      formel = feldFormel(feld);
    }

    e.states.push({
      n: z.name,
      on: !z.vorgabeAus,
      role: z.rolle || '',
      typ: z.typ || '',
      unit: z.einheit || '',
      wr: !!z.schreiben,
      srcR: quelle,
      /* Kennt das Geraet den Befehl, ist das Ziel bekannt — auch wenn
         der Punkt noch nicht angelegt ist. Sonst waere der Alias stumm,
         obwohl jeder weiss, wohin er schreiben muesste. Ob es den Punkt
         schon gibt, wird beim Zeichnen nachgeschaut, nicht hier vermerkt:
         ein Vermerk veraltet, sobald der Punkt entsteht, und zwingt zum
         Neuaufbau des ganzen Entwurfs — mitsamt allem, was der Nutzer
         bis dahin eingestellt hat. */
      srcW: schreibZiel(z, kanal, auf),
      f: formel,
      fw: z.schreibformel ? auf(z.schreibformel) : '',
      caption: z.beschriftung || '',
      dec: z.nachkommastellen === undefined ? undefined : String(z.nachkommastellen),
      /* Plaetze mit statesDefined — EFFECT etwa — bleiben ohne
         Werteliste leer, egal wie gut Rolle und Typ passen. */
      states: z.werteliste || undefined,
      manuell: false,
      ausVorlage: z.name,
      hinweis: z.hinweis || '',
      /* Alle Lesewege mitnehmen, nicht nur den, der heute gegriffen hat.
         Wer aus diesem Geraet eine Vorlage macht, soll die Ersatzquellen
         behalten — sonst faellt die neue Vorlage bei jedem Geraet um, das
         seine IP an einer anderen Stelle fuehrt. */
      wege: wege.map(function (w) {
        return { punkt: w.punkt, feld: w.feld, formel: w.leseformel };
      })
    });
  });

  return (e.states.length || auchOhneTreffer) ? e : null;
}

/* Beste Vorlage suchen und anwenden. */
export function vorschlag(kanal, vorlagenId, instanz) {
  if (!S.VORLAGEN.length) { return null; }

  var alle = S.VORLAGEN.map(function (v) { return pruefeVorlage(v, kanal, instanz); });
  var treffer = alle.filter(function (t) { return t.passt; });

  var gewaehlt = null;
  if (vorlagenId) {
    /* Von Hand gewaehlt gilt auch, wenn die Erkennung nicht anspringt —
       die Verarbeitung laesst dann weg, wofuer die Quelle fehlt. */
    alle.forEach(function (t) { if (t.vorlage.id === vorlagenId) { gewaehlt = t; } });
  }
  if (!gewaehlt) {
    if (!treffer.length) { return null; }
    treffer.sort(function (a, b) { return b.punkte - a.punkte; });
    gewaehlt = treffer[0];
  }

  var e = wendeAn(gewaehlt.vorlage, kanal, gewaehlt.gruende, gewaehlt.instanz, !!vorlagenId);
  if (!e) { return null; }
  if (!vorlagenId && gewaehlt.passt) {
    var gleichAuf = treffer.filter(function (t) { return t.punkte === gewaehlt.punkte; });
    var ohneHinweis = !gewaehlt.namenstreffer;
    if (gleichAuf.length > 1 || (ohneHinweis && treffer.length > 1)) {
      e.grund.push(tr('tpl.noNameHint', sprachtext(gewaehlt.vorlage.name)));
    }
  }
  if (!gewaehlt.passt) {
    e.erzwungen = true;
    e.grund = e.grund.concat(gewaehlt.fehler.map(function (f) { return tr('tpl.wouldNeed', f); }));
  }
  e.andere = treffer.filter(function (t) { return t.vorlage.id !== gewaehlt.vorlage.id; })
                    .map(function (t) { return t.vorlage; });
  if (vorlagenId) { e.vonHandGewaehlt = true; }
  return merkeHakenVorgabe(e);
}

/* Rollen an ein anderes Muster anpassen — generisch ueber defaultRole,
   nicht je Vorlage ausprogrammiert. */
export function anMusterAnpassen(e, neuTyp) {
  var alt = musterVon(e.want), neu = musterVon(neuTyp);
  if (!alt || !neu) { return; }

  function slotVon(muster, rolle) {
    var s = null;
    muster.states.forEach(function (st) {
      if (s || !st.role) { return; }
      try { if (new RegExp(st.role.source || st.role).test(rolle)) { s = st; } } catch { /* dito: eine kaputte Rolle macht die Vorlage nicht passend */ }
    });
    return s;
  }

  e.states.forEach(function (st) {
    var alterSlot = slotVon(alt, st.role);
    if (!alterSlot) { return; }
    var ziel = null;
    neu.states.forEach(function (n) { if (!ziel && n.name === alterSlot.name) { ziel = n; } });
    if (!ziel && /ACTUAL$/.test(alterSlot.name)) {
      neu.states.forEach(function (n) { if (!ziel && /ACTUAL$/.test(n.name)) { ziel = n; } });
    }
    if (ziel && ziel.defaultRole && ziel.defaultRole !== st.role) {
      st.role = ziel.defaultRole;
      st.n = ziel.name;
    }
  });
  e.want = neuTyp;
}
