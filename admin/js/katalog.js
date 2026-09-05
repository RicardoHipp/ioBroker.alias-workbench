import { holeText } from './basis.js';
import { txt } from './sprache.js';
import { einst } from './einstellungen.js';
import './enums.js';

/* Die Vorlagen des Admin - geliehen, nicht kopiert.

   Der Admin bringt 62 Funktions- und 58 Raumvorlagen mit, mehrsprachig
   und mit Icon: „Rollladen", „Steckdose", „Waschmaschine". Sie in unseren
   Adapter zu kopieren waere doppelte Pflege - bei jedem Admin-Update
   altert die Kopie still vor sich hin. Also holen wir sie zur Laufzeit
   aus dem Bundle, in dem sie ohnehin liegen. Wir laufen in derselben
   Herkunft wie der Admin, `fetch` genuegt.

   Der Weg fuehrt ueber drei Vite-Eigenheiten: die Bundles tragen Hashes
   im Namen, der Chunk heisst „Enums", und die Listen stehen darin als
   JSON.parse mit Backticks. Bricht eine davon, bleiben die Listen leer
   und das Feld zeigt nur den Bestand - wie vorher. Kein Fehler, keine
   Meldung, nur weniger Auswahl. Deshalb faengt hier alles ab, was
   schiefgehen kann, ohne ein Wort zu verlieren. */
export var enumVorlagen = { rooms: [], functions: [] };
/* Der Katalog des Admin sollte kommen, kam aber nicht.

   Der Rueckfall auf den Bestand ist mit Absicht still - er soll niemanden
   mit einer Fehlermeldung behelligen, wenn ohnehin alles weiterlaeuft.
   Genau deshalb faellt er aber auch niemandem auf: Ricardos
   Produktivanlage lief wochenlang ohne Katalog, weil Admin 8.0.2 sein
   Bundle anders schreibt als 7.8.23, und das einzige Anzeichen war eine
   Auswahlliste mit zehn statt zweiundsiebzig Eintraegen. Wer nicht weiss,
   dass zweiundsiebzig kommen muessten, sieht zehn und denkt nichts.

   Still bleiben, ja - aber nicht unsichtbar. Wer die Liste aufklappt,
   soll erfahren, dass sie unvollstaendig ist. */
export var katalogFehlt = false;
var enumIkonen = { rooms: {}, functions: {} };   /* Iconname -> Chunkdatei */
export var ikonCache = {};                              /* art:Iconname -> data-URI */
var ikonLaeuft = {};                             /* was gerade geholt wird */
var vorlagenGeholt = false;

/* Welches Icon liegt in welchem Chunk? Der Chunk fuehrt eine Karte
   „../../assets/devices/Amplifier.svg" -> import("./Amplifier-XXXX.js"). */
/* Welche Datei haelt das Bild zu welchem Namen?

   Der Bundler schreibt das als Zuordnung von Pfad auf Nachladefunktion.
   Womit er die Zeichenketten einfasst, wechselt er von Fassung zu
   Fassung: Admin 7.8.23 nahm Anfuehrungszeichen, 8.0.2 Backticks. Wer
   sich auf ein Zeichen festlegt, verliert die Bilder beim naechsten
   Update - lautlos, denn fehlende Bilder sehen aus wie „keine da". */
function ikonMap(quelle, ordner) {
  var re = new RegExp('["\'`]\\.\\./\\.\\./assets/' + ordner +
                      '/([^"\'`]+?)\\.svg["\'`]:\\(\\)=>[\\s\\S]{0,40}?import\\(["\'`]\\./([^"\'`]+?)["\'`]', 'g');
  var map = {}, m;
  while ((m = re.exec(quelle))) { map[m[1]] = m[2]; }
  return map;
}

/* Den Enums-Chunk finden. Sein Name steht nicht in index.html, sondern
   eine Ebene tiefer im bootstrap-Bundle. Gemessen: sechs Dateien, alle
   schon im Browsercache, weil der Admin sie selbst geladen hat. */
function sucheEnumChunk(welle, gesehen, tiefe) {
  if (!welle.length || tiefe > 2) { return Promise.resolve(null); }
  var naechste = [], treffer = null;
  return welle.reduce(function (kette, f) {
    return kette.then(function () {
      if (treffer || gesehen[f]) { return; }
      gesehen[f] = true;
      return holeText('/' + f).then(function (t) {
        var m = t.match(/Enums-[A-Za-z0-9_-]+\.js/);
        if (m) { treffer = m[0]; return; }
        (t.match(/[A-Za-z0-9_.-]+-[A-Za-z0-9_-]{8}\.js/g) || []).forEach(function (x) {
          var q = x.indexOf('assets/') === 0 ? x : 'assets/' + x;
          if (!gesehen[q]) { naechste.push(q); }
        });
      })['catch'](function () { });
    });
  }, Promise.resolve()).then(function () {
    return treffer || sucheEnumChunk(naechste, gesehen, tiefe + 1);
  });
}

/* Woran man eine der beiden Listen erkennt.

   Nicht am Variablennamen und nicht an einer Importzeile - beides
   schreibt der Bundler bei jedem Update neu. Vorher hing die Erkennung
   genau daran (`startsWith("enum.functions")?Le:Se` und
   `import Se from"./Rooms-xxx.js"`). In Admin 7.8.23 stand das so da, in
   8.0.2 nicht mehr: die Funktionsliste heisst dort anders, und die
   Raeume liegen in einer Datei, die nicht importiert wird. Die Werkbank
   fiel still auf den Bestand zurueck - sichtbar erst daran, dass im
   Vorlagenblatt die Funktionsauswahl leer blieb.

   Ein Buchstabe aendert sich, `living_room` nicht. */
var RAUM_MARKE = ['living_room', 'bathroom', 'kitchen', 'bedroom', 'garden'];
var FUNK_MARKE = ['light', 'heating', 'security', 'blinds', 'weather'];

function listenAus(text) {
  var raus = [];
  var re = /JSON\.parse\(`(\[\{[\s\S]*?\}\])`\)/g, m;
  while ((m = re.exec(text))) {
    try {
      var l = JSON.parse(m[1]);
      if (Array.isArray(l) && l.length > 20 && l[0] && l[0]._id && l[0].name) {
        raus.push(l);
      }
    } catch { /* keine Liste, weiter */ }
  }
  return raus;
}

function istListe(liste, marken) {
  var ids = {};
  liste.forEach(function (x) { ids[x._id] = 1; });
  var treffer = 0;
  marken.forEach(function (k) { if (ids[k]) { treffer++; } });
  return treffer >= 2;
}

function ordneListenZu(text) {
  listenAus(text).forEach(function (l) {
    if (!enumVorlagen.rooms.length && istListe(l, RAUM_MARKE)) { enumVorlagen.rooms = l; }
    else if (!enumVorlagen.functions.length && istListe(l, FUNK_MARKE)) { enumVorlagen.functions = l; }
  });
  return enumVorlagen.rooms.length && enumVorlagen.functions.length;
}

export function ladeEnumVorlagen(nachher) {
  if (vorlagenGeholt || !einst('vorlagenVomAdmin')) { return; }
  vorlagenGeholt = true;
  holeText('/index.html').then(function (html) {
    return sucheEnumChunk(html.match(/assets\/[A-Za-z0-9_\-.]+\.js/g) || [], {}, 0);
  }).then(function (chunk) {
    if (!chunk) { throw new Error('kein Enums-Chunk'); }
    return holeText('/assets/' + chunk);
  }).then(function (src) {
    enumIkonen.functions = ikonMap(src, 'devices');
    enumIkonen.rooms = ikonMap(src, 'rooms');
    if (ordneListenZu(src)) { return; }

    /* Fehlt eine, liegt sie in einer der Dateien, die der Chunk nennt.
       Kurze Namen zuerst: die Listen stecken in kleinen Bausteinen, das
       Riesenbuendel des Geraetemanagers waere sonst der erste Griff. */
    var dateien = (src.match(/[A-Za-z0-9_.-]+-[A-Za-z0-9_-]{8}\.js/g) || [])
      .filter(function (x, i, a) { return a.indexOf(x) === i; })
      .sort(function (a, b) { return a.length - b.length; })
      .slice(0, 60);

    return dateien.reduce(function (kette, f) {
      return kette.then(function (fertig) {
        if (fertig) { return true; }
        return holeText('/assets/' + f).then(function (t) {
          /* Ein Buendel von mehreren Megabyte durchsucht man nicht -
             die Listen stehen nie darin, das Durchsuchen kostet nur. */
          if (t.length > 3000000) { return false; }
          return ordneListenZu(t);
        })['catch'](function () { return false; });
      });
    }, Promise.resolve(false));
  })['catch'](function () { /* still bleiben: der Bestand genuegt */ })
    .then(function () {
      if (!enumVorlagen.rooms.length || !enumVorlagen.functions.length) {
        katalogFehlt = true;
      }
      /* Der Aufrufer entscheidet, ob und was neu zu zeichnen ist -
         dieses Modul kennt die Oberflaeche nicht. */
      if (typeof nachher === 'function') { nachher(); }
    });
}

/* Das Icon einer Vorlage. Es steht als fertige data-URI im Chunk - genau
   das Format, das `common.icon` erwartet. Geholt wird erst, wenn jemand
   die Vorlage waehlt; 120 Icons auf Vorrat waeren Verschwendung.

   Kommt es nicht rechtzeitig an, entsteht die Aufzaehlung ohne Icon. Das
   ist kein Schaden, nur ein leeres Kaestchen im Admin. */
/* Wer auf ein Bild wartet, hinterlegt hier seinen Rueckruf. Ohne ihn
   blieb der Platz leer, bis irgendetwas anderes ein Neuzeichnen ausloeste:
   die Zeile mit Raum und Funktion steht sofort, das Bild kommt Sekunden
   spaeter aus dem Buendel des Admin. Genau daran hing R12 - der
   Trockenlauf meldete „Bild wird ergaenzt" nur, wenn man langsam genug
   war (26.08.2026). */
var ikonWarter = {};

export function holeIkon(art, name, fertig) {
  var k = art + ':' + name;
  if (typeof fertig === 'function') { ikonWarter[k] = fertig; }
  if (ikonCache[k] !== undefined || ikonLaeuft[k]) { return; }
  var datei = enumIkonen[art] && enumIkonen[art][name];
  if (!datei) {
    /* „Nicht in der Karte“ und „Karte noch nicht da“ sind zweierlei.

       Der Katalog kommt ueber mehrere Abrufe herein und braucht ein paar
       Sekunden; die Zeile mit Raum und Funktion steht sofort. Wer beim
       ersten Zeichnen nachschlaegt, findet eine leere Karte - und hier
       stand `ikonCache[k] = null` ohne Bedingung. Die Wache oben laesst
       dann nie wieder einen Versuch zu, und das Bild fehlt bis zum
       Neuladen der Seite. Sichtbar wurde es an einem Alias, dessen
       Funktion schon beim Aufschlagen feststand: `Sicherheit` bekam nie
       ein Bild, waehrend dieselbe Funktion von Hand gewaehlt eines
       bekam - von aussen sah das aus wie Zufall.

       Festgehalten wird deshalb nur, wenn der Katalog vorliegt und den
       Namen wirklich nicht kennt. */
    if ((enumVorlagen[art] || []).length) { ikonCache[k] = null; }
    return;
  }

  /* „Laeuft gerade“ und „gibt es nicht“ sind zweierlei.

     Hier stand einmal `ikonCache[k] = null` schon vor dem Laden, damit
     nicht zweimal geholt wird. Damit war der Eintrag aber auch dann auf
     null festgenagelt, wenn das Laden fehlschlug oder die Auswahl
     mittendrin wechselte - und die Wache oben liess nie einen zweiten
     Versuch zu. Das Icon fehlte dann bis zum Neuladen der Seite, und die
     Aufzaehlung entstand ohne. Gefunden beim Raum „Garten“, dessen
     Funktions-Gegenstueck „Steckdose“ sein Icon anstandslos bekam. */
  ikonLaeuft[k] = true;
  holeText('/assets/' + datei).then(function (t) {
    /* Anfuehrungszeichen, Apostroph oder Backtick - dem Bundler ist es
       gleich, uns muss es das auch sein. Admin 7.8.23 schrieb
       `"data:image/svg+xml,..."`, 8.0.2 schreibt dieselbe Zeichenkette
       in Backticks. Wer sich auf ein Zeichen festlegt, verliert beim
       naechsten Update alle Bilder - und zwar lautlos, denn ein
       fehlendes Bild sieht aus wie „gibt es nicht". */
    /* Bis zum **gleichen** Zeichen lesen, mit dem es anfing.

       Ein `[^"'`]+` waere falsch: die data-URI enthaelt selbst
       Apostrophe (`version='1.1'`), und die Klasse bricht am ersten ab -
       herausgekommen sind 36 Zeichen statt 3.400, und die Aufzaehlung
       bekam ein Bild, das keines ist. Der Rueckverweis \1 liest bis zum
       passenden Schlusszeichen und laesst die anderen beiden in Ruhe. */
    var m = t.match(/(["'`])(data:image\/svg\+xml[\s\S]*?)\1/);
    if (m) { ikonCache[k] = m[2]; return; }

    /* Zweite Bauart. Kleine Bilder stehen als data-URI im Chunk, grosse
       liegen als eigene Datei daneben und der Chunk nennt nur ihre
       Adresse. Wer nur die erste Bauart kennt, findet ausgerechnet die
       ausfuehrlichen nicht - Garten, Heizung und Licht gehoeren alle
       dazu. Genau daran blieb ein neu angelegter Raum ohne Bild. */
    var u = t.match(/new URL\((["'`])([^"'`]+\.svg)\1/);
    if (!u) { return; }
    return holeText('/assets/' + u[2]).then(function (svg) {
      ikonCache[k] = 'data:image/svg+xml;base64,' +
                     btoa(unescape(encodeURIComponent(svg)));
    });
  })['catch'](function () { })
    .then(function () {
      delete ikonLaeuft[k];
      /* Nur melden, wenn wirklich ein Bild herauskam - ein Fehlschlag
         soll kein Neuzeichnen ausloesen. */
      var warter = ikonWarter[k];
      delete ikonWarter[k];
      if (warter && ikonCache[k]) { warter(); }
    });
}

/* Waere hier ein Bild nachzutragen? Dieselbe Frage wie beim Objektbau,
   nur vorab - die Abbruchpruefung braucht sie, bevor gebaut wird. */
/* Darf hier ueberhaupt ein Bild nachgetragen werden?

   Drei Schalter, die auf der Einstellungsseite stehen: getrennt fuer
   Raeume und Funktionen, und ein dritter fuer den einzigen Fall, in dem
   ein gefuelltes Feld ueberschrieben wird - der Einrichtungsassistent
   des Admin hinterlaesst dort einen blossen Namen wie „Playroom“, der
   zu keinem Bild fuehrt. */
export function ikonErlaubt(art, o) {
  if (!einst(art === 'rooms' ? 'ikonRaeume' : 'ikonFunktionen')) { return false; }
  var da = o && o.common && o.common.icon;
  if (ikonTaugt(da)) { return false; }          /* schon ein Bild - Finger weg */
  if (da && !einst('ikonErsetzen')) { return false; }
  return true;
}

/* Waere hier ein Bild nachzutragen? Dieselbe Frage wie beim Objektbau,
   nur vorab - die Abbruchpruefung braucht sie, bevor gebaut wird. */
export function ikonNachtrag(id, art, o) {
  if (!o || !ikonErlaubt(art, o)) { return false; }
  var v = vorlageZu(id, art, txt(o.common && o.common.name));
  return !!(v && v.icon && ikonCache[art + ':' + v.icon]);
}

/* Taugt das, was im Icon-Feld steht, ueberhaupt als Bild?

   Die sieben englischen Vorgaberaeume der Erstinstallation fuehren dort
   nur einen Namen: `icon: "Playroom"`. Fruehere Admin-Fassungen haben
   daraus einen Dateipfad gebaut, die heutige nicht mehr - sie zeichnet
   das kaputte Kaestchen. Als Bild zaehlt deshalb nur, was auch auf eines
   zeigt: eine data-URI, ein Pfad oder wenigstens ein Dateiname. */
export function ikonTaugt(v) {
  if (!v || typeof v !== 'string') { return false; }
  return v.indexOf('data:') === 0 || v.indexOf('/') === 0 ||
         v.indexOf('http') === 0 || v.indexOf('.') > -1;
}

/* Welche Vorlage gehoert zu einer vorhandenen Aufzaehlung?

   Erst ueber die Kennung (`enum.rooms.garden` -> `garden`), dann ueber
   den Namen. Das Zweite ist noetig, weil Ricardos Aufzaehlungen von
   hm-rega aus den CCU-Gewerken stammen und deutsche Kennungen tragen:
   `enum.functions.Heizung` waehrend die Vorlage `heating` heisst. Ueber
   den Namen finden sich beide. */
export function vorlageZu(id, art, name) {
  var kurz = id.slice(('enum.' + art + '.').length);
  var liste = enumVorlagen[art] || [];
  var v = null;
  liste.forEach(function (x) { if (!v && x._id === kurz) { v = x; } });
  if (v) { return v; }
  var n = String(name || '').toLowerCase();
  if (!n) { return null; }
  liste.forEach(function (x) {
    if (!v && String(txt(x.name) || '').toLowerCase() === n) { v = x; }
  });
  return v;
}
