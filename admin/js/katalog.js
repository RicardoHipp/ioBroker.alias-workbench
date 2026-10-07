import { el, holeText } from './basis.js';
import { leseAblage, ergaenzeAblage, stempelAus } from './ablage.js';
import { tr, txt, alleTexte } from './sprache.js';
import { einst } from './einstellungen.js';
import './enums.js';

/* Die Vorlagen des Admin - geliehen, nicht kopiert.

   Der Admin bringt 62 Funktions- und 58 Raumvorlagen mit, mehrsprachig
   und mit Icon: „Rollladen", „Steckdose", „Waschmaschine". Sie in unseren
   Adapter zu kopieren waere doppelte Pflege - bei jedem Admin-Update
   altert die Kopie still vor sich hin. Also holen wir sie zur Laufzeit
   aus dem Bundle, in dem sie ohnehin liegen. Wir laufen in derselben
   Herkunft wie der Admin, `fetch` genuegt.

   Der Weg haengt am Bauwerkzeug des Admin, und das wechselt: bis 7.8.23
   lagen die Listen als JSON.parse mit Rueckstrichen in einem „Enums"-
   Chunk, seit 8.0.x als gewoehnliches JavaScript in einem Riesenmodul.
   Beide Bauarten werden gelesen, das Ergebnis liegt danach im
   Dateibereich. Bricht trotzdem etwas, bleiben die Listen leer
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

/* ---------------- Die zweite Bauart: alles in einem Riesenmodul ----------------

   Admin 8.0.14 hat sein Bündel auf „Module Federation" umgestellt. Der
   Inhalt ist derselbe geblieben — gemessen am 07.10.2026: dieselben 58
   Räume und 62 Funktionen, Kennung für Kennung identisch, dieselben 120
   Bilder —, aber er steckt jetzt in **einer** Datei von 7,9 MB statt in
   vielen kleinen. Zwei Dinge haben uns daran gehindert, ihn zu finden:

   * Die Zeile `if (t.length > 3000000) return false;` übersprang genau
     diese Datei. Unter 7.8.23 lag der Katalog in einem Bündel von
     2 843 653 Bytes — fünf Prozent unter der Grenze. Es hat nie sicher
     funktioniert, es ist bloß nie angestoßen.
   * Die Listen stehen nicht mehr als JSON-Text in Rückstrichen, sondern
     als gewöhnliches JavaScript: Schlüssel ohne Anführungszeichen,
     Zeichenketten in Rückstrichen. `JSON.parse` greift da nicht.

   Darum liest die Werkbank jetzt beide Bauarten. Und weil 7,9 MB bei
   jedem Öffnen des Reiters unzumutbar wären, wird das Ergebnis im
   Dateibereich des Adapters abgelegt und erst wieder geholt, wenn der
   Admin seine Bündel neu schreibt. */

/* Eine Liste der Form `[{_id:`x`,name:{…},icon:`y.svg`}]`.

   Kein `eval` und kein `new Function`: beides hieße, fremden Text
   auszuführen, und der Gewinn wäre keiner. Die Einträge haben eine feste
   Form, und in Namen kommen keine Rückstriche vor. */
function eintraegeAus(roh) {
  var raus = [];
  var re = /\{_id:`([^`]*)`,name:\{([\s\S]*?)\},icon:`([^`]*)`\}/g, m;
  while ((m = re.exec(roh))) {
    var name = {}, p = /(?:([A-Za-z0-9_$]+)|"([^"]+)"):`([^`]*)`/g, n;
    while ((n = p.exec(m[2]))) { name[n[1] || n[2]] = n[3]; }
    raus.push({ _id: m[1], name: name, icon: m[3].replace(/\.svg$/, '') });
  }
  return raus;
}

/* Von `pos` an die eckige Klammer ausbalancieren. */
function klammerAb(text, pos) {
  var tiefe = 0;
  for (var j = pos; j < text.length; j += 1) {
    if (text[j] === '[') { tiefe += 1; }
    else if (text[j] === ']') { tiefe -= 1; if (!tiefe) { return text.slice(pos, j + 1); } }
  }
  return null;
}

/* Die Bildkarte zu einer Liste: `{Anteroom:`PHN2…`, "Alarm Systems":`…`}`.

   Gesucht wird über einen Bildnamen aus der Liste selbst — der
   Variablenname wechselt bei jedem Bau des Admin, der Name „Storeroom"
   nicht. Rückwärts bis zur öffnenden Klammer zu laufen ist hier sicher:
   base64 enthält keine geschweiften Klammern. */
function ikonKarte(text, probe) {
  var stelle = text.indexOf(probe + ':`');
  if (stelle === -1) { stelle = text.indexOf('"' + probe + '":`'); }
  if (stelle === -1) { return null; }
  var auf = text.lastIndexOf('{', stelle);
  if (auf === -1) { return null; }
  var tiefe = 0, zu = -1;
  for (var j = auf; j < text.length; j += 1) {
    if (text[j] === '{') { tiefe += 1; }
    else if (text[j] === '}') { tiefe -= 1; if (!tiefe) { zu = j; break; } }
  }
  if (zu === -1) { return null; }
  var roh = text.slice(auf, zu + 1), karte = {};
  var re = /(?:([A-Za-z0-9_$]+)|"([^"]+)"):`([A-Za-z0-9+/=]{40,})`/g, m;
  while ((m = re.exec(roh))) { karte[m[1] || m[2]] = m[3]; }
  return Object.keys(karte).length ? karte : null;
}

/* Beide Listen und beide Bildkarten aus dem Riesenmodul. */
function ausRiesenmodul(text) {
  var gefunden = { rooms: null, functions: null };
  var pos = 0;
  for (;;) {
    var i = text.indexOf('[{_id:`', pos);
    if (i === -1) { break; }
    pos = i + 7;
    var roh = klammerAb(text, i);
    if (!roh) { continue; }
    var liste = eintraegeAus(roh);
    if (liste.length < 20) { continue; }
    if (!gefunden.rooms && istListe(liste, RAUM_MARKE)) { gefunden.rooms = liste; }
    else if (!gefunden.functions && istListe(liste, FUNK_MARKE)) { gefunden.functions = liste; }
    if (gefunden.rooms && gefunden.functions) { break; }
  }
  if (!gefunden.rooms || !gefunden.functions) { return null; }
  return {
    rooms: gefunden.rooms,
    functions: gefunden.functions,
    ikonen: {
      rooms: ikonKarte(text, gefunden.rooms[0].icon) || {},
      functions: ikonKarte(text, gefunden.functions[0].icon) || {}
    }
  };
}

/* ---------------- Der Hinweis, solange geholt wird ----------------

   7,9 MB dauern beim ersten Mal ein paar Sekunden. Ohne ein Wort dazu
   wirkt das wie ein Hänger. Danach nie wieder, bis der Admin sich
   ändert — und auch das gehört in den Hinweis, sonst fragt man sich
   beim nächsten Mal, warum es plötzlich schnell geht. */
function laedtAn() {
  if (document.getElementById('katalog-laedt')) { return; }
  var k = el('div', 'katalog-laedt');
  k.id = 'katalog-laedt';
  k.appendChild(el('div', 'kl-kopf', tr('catalog.loadingTitle')));
  k.appendChild(el('div', 'kl-text', tr('catalog.loadingText')));
  document.body.appendChild(k);
}

function laedtAus() {
  var k = document.getElementById('katalog-laedt');
  if (k && k.parentNode) { k.parentNode.removeChild(k); }
}

/* Was aus der Ablage oder frisch kam, in die Arbeitsvariablen. */
function uebernehmen(satz) {
  enumVorlagen.rooms = satz.rooms || [];
  enumVorlagen.functions = satz.functions || [];
  if (satz.ikonDateien) {
    enumIkonen.rooms = satz.ikonDateien.rooms || {};
    enumIkonen.functions = satz.ikonDateien.functions || {};
  }
  /* Fertige Bilder gleich in den Vorrat — bei der zweiten Bauart liegen
     sie im selben Modul und müssen nicht einzeln nachgeholt werden. */
  ['rooms', 'functions'].forEach(function (art) {
    var karte = (satz.ikonen && satz.ikonen[art]) || {};
    Object.keys(karte).forEach(function (name) {
      ikonCache[art + ':' + name] = 'data:image/svg+xml;base64,' + karte[name];
    });
  });
}

export function ladeEnumVorlagen(nachher) {
  if (vorlagenGeholt || !einst('vorlagenVomAdmin')) { return; }
  vorlagenGeholt = true;

  var stempel = null;

  function abschluss() {
    laedtAus();
    if (!enumVorlagen.rooms.length || !enumVorlagen.functions.length) {
      katalogFehlt = true;
    }
    /* Der Aufrufer entscheidet, ob und was neu zu zeichnen ist -
       dieses Modul kennt die Oberflaeche nicht. */
    if (typeof nachher === 'function') { nachher(); }
  }

  /* Erste Bauart: der Enums-Chunk mit JSON.parse in Rueckstrichen. */
  function ersterWeg() {
    return holeText('/index.html').then(function (html) {
      return sucheEnumChunk(html.match(/assets\/[A-Za-z0-9_\-.]+\.js/g) || [], {}, 0);
    }).then(function (chunk) {
      if (!chunk) { return false; }
      return holeText('/assets/' + chunk).then(function (src) {
        enumIkonen.functions = ikonMap(src, 'devices');
        enumIkonen.rooms = ikonMap(src, 'rooms');
        if (ordneListenZu(src)) { return true; }

        /* Fehlt eine, liegt sie in einer der Dateien, die der Chunk
           nennt. Kurze Namen zuerst: die Listen stecken in kleinen
           Bausteinen. Ohne diese Nachsuche fand Admin 7.8.23 am
           07.10.2026 nur die 62 Funktionen und keinen einzigen Raum —
           die Raumliste liegt dort in einer eigenen Datei. */
        var dateien = (src.match(/[A-Za-z0-9_.-]+-[A-Za-z0-9_-]{8}\.js/g) || [])
          .filter(function (x, i, a) { return a.indexOf(x) === i; })
          .sort(function (a, b) { return a.length - b.length; })
          .slice(0, 60);

        return dateien.reduce(function (kette, f) {
          return kette.then(function (fertig) {
            if (fertig) { return true; }
            return holeText('/assets/' + f).then(function (t) {
              return ordneListenZu(t);
            })['catch'](function () { return false; });
          });
        }, Promise.resolve(false));
      });
    })['catch'](function () { return false; });
  }

  /* Zweite Bauart: das Riesenmodul. Groesse ist jetzt kein Ausschluss
     mehr, aber die Reihenfolge bleibt: kleine Dateien zuerst, das
     Riesenmodul zuletzt, und nach dem ersten Treffer ist Schluss. */
  function zweiterWeg() {
    return holeText('/index.html').then(function (html) {
      var dateien = (html.match(/assets\/[A-Za-z0-9_\-.]+\.js/g) || [])
        .filter(function (x, i, a) { return a.indexOf(x) === i; });
      var geholt = 0, treffer = null;
      return dateien.reduce(function (kette, f) {
        return kette.then(function () {
          if (treffer || geholt > 25000000) { return; }
          return holeText('/' + f).then(function (t) {
            geholt += t.length;
            var satz = ausRiesenmodul(t);
            if (satz) { treffer = satz; }
          })['catch'](function () { });
        });
      }, Promise.resolve()).then(function () { return treffer; });
    })['catch'](function () { return null; });
  }

  holeText('/index.html').then(function (html) {
    stempel = stempelAus(html);
    return leseAblage();
  }).then(function (abgelegt) {
    if (abgelegt && abgelegt.stempel === stempel &&
        (abgelegt.rooms || []).length && (abgelegt.functions || []).length) {
      uebernehmen(abgelegt);
      return null;
    }
    /* Jetzt wird wirklich geholt - und erst jetzt sagen wir es. */
    laedtAn();
    return ersterWeg().then(function (ging) {
      if (ging) {
        return { rooms: enumVorlagen.rooms, functions: enumVorlagen.functions,
          ikonDateien: { rooms: enumIkonen.rooms, functions: enumIkonen.functions } };
      }
      return zweiterWeg().then(function (satz) {
        if (!satz) { return null; }
        uebernehmen(satz);
        return satz;
      });
    });
  }).then(function (zumAblegen) {
    if (!zumAblegen) { return null; }
    return ergaenzeAblage(stempel, zumAblegen);
  })['catch'](function () { /* still bleiben: der Bestand genuegt */ })
    .then(abschluss);
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
  var n = String(name || '').trim().toLowerCase();
  if (!n) { return null; }
  /* Alle Sprachfassungen, nicht nur die eingestellte.

     Im Bestand steht, was jemand getippt hat — „Light" etwa, waehrend
     die Vorlage auf einem deutschen Admin „Licht" heisst. Verglichen
     wurde aber nur die eine Fassung, und ohne Treffer entsteht beim
     naechsten Schreiben ein Doppelgaenger `enum.functions.light` neben
     der vorhandenen Funktion (gefunden 09.09.2026). Der Vergleich war
     schon immer unabhaengig von Gross- und Kleinschreibung; was fehlte,
     waren die anderen Sprachen. */
  liste.forEach(function (x) {
    if (!v && alleTexte(x.name).indexOf(n) !== -1) { v = x; }
  });
  return v;
}
