/* Der Baum links: Klappstand, Expertenmodus, Aufbau, Modi.

   Der Klappstand liegt im localStorage des Browsers - er ist Ansichts-
   sache, keine Konfiguration. Der Expertenmodus folgt woertlich der Regel
   des Objektbrowsers im Admin. */

import { S } from './zustand.js';
import { $, el } from './basis.js';
import { tr, txt, expertenVorgabe } from './sprache.js';
import './enums.js';
import { mitNachfrage, aboLoesen } from './entwurf.js';
import { zeichneErgebnis } from './ergebnis.js';
import { zeichneVorlagenListe } from './vorlagenblatt.js';

var KLAPP_SCHLUESSEL = 'alias-workbench.baum';


(function ladeKlappstand() {
  try {
    var roh = window.localStorage.getItem(KLAPP_SCHLUESSEL);
    if (!roh) { return; }
    var d = JSON.parse(roh);
    if (d && typeof d === 'object') {
      S.aufgeklappt = d.knoten || {};
      S.alleKlapp = (d.alle === true || d.alle === false) ? d.alle : null;
    }
  } catch { /* kaputter oder gesperrter Speicher: dann eben Vorgabe */ }
})();

export function merkeKlappstand() {
  try {
    window.localStorage.setItem(KLAPP_SCHLUESSEL,
      JSON.stringify({ knoten: S.aufgeklappt, alle: S.alleKlapp }));
  } catch { /* privater Modus oder voll - nicht der Rede wert */ }
}

/* ================== Expertenmodus ==================
   Der Admin fuehrt ihn zweistufig: der Schalter oben rechts gilt nur fuer
   diese Browsersitzung und steht im sessionStorage, darunter liegt die
   dauerhafte Vorgabe in system.config. Genau diese Reihenfolge steht auch
   im Admin-Bundle:

     const f = sessionStorage.getItem("App.expertMode");
     expertMode = f ? f === "true" : !!systemConfig.common.expertMode;

   Der Reiter laeuft im iframe derselben Herkunft, liest also denselben
   Speicher — und bekommt beim Umschalten ein storage-Ereignis, ohne dass
   ihn jemand neu laden muss. */

export function experte() {
  var f = null;
  try { f = window.sessionStorage.getItem('App.expertMode'); } catch { /* gesperrt */ }
  return f ? (f === 'true') : expertenVorgabe;
}

/* Was nur Experten sehen. Woertlich dieselbe Regel wie im Objektbrowser
   des Admin, damit die Werkbank nicht ihre eigene Wahrheit pflegt. Das
   letzte Stueck ist das nuetzlichste: ein Adapter kann einen Punkt selbst
   als Expertensache markieren — Zugangstoken etwa tun das. */
export function nurFuerExperten(id, o) {
  if (id === 'system' || id.indexOf('system.') === 0) { return true; }
  if (id === 'enum' || id.indexOf('enum.') === 0) { return true; }
  if (id.indexOf('_design/') === 0) { return true; }
  if (id.slice(-6) === '.admin') { return true; }
  return !!(o && o.common && o.common.expert);
}

window.addEventListener('storage', function (e) {
  if (e.key !== 'App.expertMode') { return; }
  /* Steht die Auswahl in einem Zweig, den es gleich nicht mehr gibt, muss
     sie weg — sonst zeigt die rechte Seite ein Geraet, das links fehlt. */
  if (S.current && !experte() && nurFuerExperten(S.current, S.objects[S.current])) {
    S.current = null; aboLoesen();
    S.entwurf = null;
  }
  zeichneBaum();
  zeichneErgebnis();
});

/* Der Name eines Objekts — aber nur, wenn er mehr sagt als die ID.

   Bei Adaptern, die Seriennummern als Kennung nehmen, steht im Baum
   sonst nichts Lesbares: `000A1D89900002` ist HK_Bastelzimmer,
   `AFDCMSTESFOHWVAXIDNBDQQROIYQ` ist „Ricardo (Self)". Gemessen am
   Produktivsystem sagt bei 1575 von 2532 Behaeltern der Name mehr als
   die Kennung; bei 569 ist er dasselbe Wort, bei 388 gibt es keinen.
   Die letzten beiden Faelle bleiben so kurz wie bisher. */

export function zusatzName(id) {
  var o = S.objects[id];
  if (!o) { return ''; }
  var n = txt(o.common && o.common.name).trim();
  if (!n) { return ''; }
  return (n === String(id).split('.').pop()) ? '' : n;
}


function baueBaum() {
  var wurzel = { kinder: {}, id: '', name: '' };
  var alles = experte();
  S.keysSorted.forEach(function (id) {
    var o = S.objects[id];
    /* Der Index darf einen Takt hinterherhinken - das Abo traegt aus und
       raeumt erst mit seinem Zeitgeber auf. Ein fehlendes Objekt ist
       hier kein Grund, den ganzen Baum abzubrechen. */
    if (!o) { return; }
    /* Gefiltert wird beim Bauen, nicht beim Zeichnen: sonst zaehlte ein
       Ordner Zustaende mit, die niemand sieht. Die Quellenauswahl im
       Detailfenster bleibt bewusst ungefiltert — ein Alias, der aus
       system.adapter.…alive liest, muss bearbeitbar bleiben. */
    if (!alles && nurFuerExperten(id, o)) { return; }
    var teile = id.split('.');
    var k = wurzel;
    var pfad = '';
    for (var i = 0; i < teile.length; i++) {
      pfad = pfad ? (pfad + '.' + teile[i]) : teile[i];
      if (!k.kinder[teile[i]]) {
        k.kinder[teile[i]] = { kinder: {}, id: pfad, name: teile[i] };
      }
      k = k.kinder[teile[i]];
    }
    k.obj = o;
    k.art = o.type;
  });
  return wurzel;
}

function zaehleZustaende(k, eltern) {
  k._eltern = eltern || null;
  var n = (k.art === 'state') ? 1 : 0;
  var tiefe = -1;
  Object.keys(k.kinder).forEach(function (name) {
    var kind = k.kinder[name];
    n += zaehleZustaende(kind, k);
    if (kind._zust) {
      var t = kind._tiefe + 1;
      if (t > tiefe) { tiefe = t; }
    }
  });
  k._zust = n;
  k._tiefe = tiefe < 0 ? 0 : tiefe;
  k._hatTypen = false;
  Object.keys(k.kinder).forEach(function (name) {
    var kind = k.kinder[name];
    if (kind.art === 'channel' || kind.art === 'device' || kind._hatTypen) { k._hatTypen = true; }
  });
  return n;
}


/* Ist dieser Knoten aufgeklappt?

   Stand frueher mitten im Zeichnen einer Zeile — und damit erst,
   nachdem der ganze Teilbaum schon als DOM entstanden war. Fuer
   „zugeklapptes gar nicht erst zeichnen" muss die Antwort vorher da
   sein, also hier. */
function klappStand(k, tiefe) {
  if ((($('#q') || {}).value || '').trim()) { return true; }
  var vorgabe = (S.alleKlapp === null) ? (tiefe <= 1) : S.alleKlapp;
  /* Im Aliasbaum gibt es unterhalb der Wurzel nur eigene Ordner - ganz
     zugeklappt bliebe eine einzige Zeile `alias` uebrig, und jeder Weg
     begaenne mit zwei Pflichtklicks. Bis `alias.0` bleibt deshalb offen.
     Das steht hier und nicht im Zuklapp-Knopf: sonst gilt es nur, wenn
     man IM Aliasmodus zuklappt - wer in den Quellen zuklappt und dann
     herueberwechselt, fand den Baum zu weit zu (Ricardo, 25.08.2026).
     Einzeln zuklappen darf man sie weiterhin, `S.aufgeklappt` gewinnt. */
  if (S.baumModus === 'aliase' && (k.id === 'alias' || k.id === 'alias.0')) {
    vorgabe = true;
  }
  return S.aufgeklappt[k.id] !== undefined ? S.aufgeklappt[k.id] : vorgabe;
}

/* Ein Vergleicher fuer den ganzen Baum. `localeCompare` mit
   Optionsobjekt baut bei jedem Aufruf einen neuen — bei 24.800 Elementen
   sind das je Sortierlauf zehntausende. */
var VERGLEICH = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

export function zeichneBaum() {
  if (S.baumModus === 'vorlagen') { return zeichneVorlagenListe(); }
  S.baum = baueBaum();
  zaehleZustaende(S.baum, null);

  /* alias.0 ist unser Ergebnis, keine Quelle — deshalb getrennte Sicht. */
  var wurzel = { kinder: {}, id: '', name: '', _zust: 1, _tiefe: 9 };
  Object.keys(S.baum.kinder).forEach(function (n) {
    var istAlias = (n === 'alias');
    if ((S.baumModus === 'aliase') === istAlias) { wurzel.kinder[n] = S.baum.kinder[n]; }
  });
  S.baum = wurzel;
  var host = $('#tree');
  host.textContent = '';
  var filter = ($('#q').value || '').trim().toLowerCase();
  var ul = renderKinder(S.baum, filter, 0);
  if (!ul.childNodes.length) {
    host.appendChild(el('div', 'empty', tr('tree.nothingFound')));
  } else {
    host.appendChild(ul);
  }
}

/* Waehlbar ist alles, unter dem irgendwo Zustaende liegen — nicht nur
   direkt darunter. MQTT legt fuer Zwischenebenen gar keine Objekte an:
   unter …SmartHome.Karbonator existieren nur tele.LWT, tele.SENSOR und
   tele.STATE, aber weder „Karbonator" noch „tele" selbst. Wer nur direkte
   Kinder zaehlt, kann das Geraet nie auswaehlen. */

/* Was ist ein Geraet? Erst die Typen fragen, die ioBroker selbst pflegt —
   channel und device sind Geraete, folder ist es nie. Das gilt fuer
   hm-rpc, shelly, alexa2, dreame und alle anderen ohne Sonderfall.
   Nur wo gar kein Objekt existiert (MQTT legt fuer Zwischenebenen keins
   an), muss geraten werden: dann der oberste Knoten, unter dem die
   Datenpunkte hoechstens zwei Ebenen tief liegen. */
/* Liegen unmittelbar unter diesem Knoten Datenpunkte? Dann ist er ein
   Geraet, egal was in seinem Typ steht. */
export function hatDirekteZustaende(k) {
  return Object.keys(k.kinder).some(function (n) {
    return k.kinder[n].art === 'state';
  });
}

export function istWaehlbar(k) {
  if (!k._zust) { return false; }
  /* Ein `state`, unter dem eigene Datenpunkte liegen, ist ein Behaelter -
     auch wenn er nach Datenmodell keiner sein darf.

     Der Velux-Adapter legt jedes Modul so an: `velux.0.home.<id>` ist
     `type: state` mit `role: indicator` und traegt siebzehn Datenpunkte
     unter sich, darunter `current_position` und `target_position`. Das
     ist ein Rollladen, kein Messwert. Von 28 Knoten mit Kindern in dem
     Zweig sind 27 auf diese Weise gebaut - Raeume, Module, Zeitplaene.
     Richtig waere `device`, `channel` oder `folder`; das ist ein Fehler
     des Adapters, aber er steht in Ricardos Anlage und die Werkbank kam
     an kein einziges Velux-Geraet heran.

     Dieselbe Ausnahme gilt seit laengerem fuer `folder` (siehe unten).
     Die Regel ist in beiden Faellen dieselbe: liegen direkte Datenpunkte
     darunter, ist es ein Geraet; liegen keine darunter, ist es ein Blatt.
     Ein gewoehnlicher Messwert bleibt damit unwaehlbar wie bisher. */
  if (k.art === 'state') { return hatDirekteZustaende(k); }
  if (k.art === 'channel' || k.art === 'device') { return true; }
  /* Ein Ordner mit eigenen Datenpunkten ist ein Geraet, das jemand als
     Ordner angelegt hat — der Alias-Manager tut das, Skripte tun es, der
     Admin selbst tut es. Der type-detector sieht das genauso; in seinem
     Quelltext steht woertlich „a state needs to be in a channel, device,
     folder or such", und `folder` steht dort in einem Zweig mit den
     beiden anderen. Die Werkbank war hier strenger als das Werkzeug,
     auf dem sie aufbaut: acht Geraete einer gewachsenen Anlage liessen
     sich nicht anfassen.

     Ordner, unter denen nur weitere Ordner oder Kanaele liegen, bleiben
     aussen vor — das sind Wegweiser, keine Geraete. */
  if (k.art === 'folder') { return hatDirekteZustaende(k); }
  if (k.art === 'meta') { return false; }
  if (k.art) { return false; }
  /* Notbehelf nur dort, wo im ganzen Zweig keine Typen gepflegt sind.
     Wo es getypte Kanäle gibt, sollen die das Gerät sein. */
  if (k._hatTypen) { return false; }
  /* Aber niemals die Wurzel selbst.

     `mqtt-client` und `mqtt-client.0` sind kein Geraet, sondern der
     Adapter und seine Instanz. Waehlbar waren sie trotzdem, sobald im
     Zweig keine Typen gepflegt sind — und die Auswahl abonniert
     `<id>.*` und holt die Werte des ganzen Namensraums (am Testsystem
     322 Objekte, in einer gewachsenen Anlage ein Vielfaches). Aufklappen
     ja, auswaehlen nein.

     Gemeint ist die STELLE im Baum, nicht `_tiefe`: Das ist die Hoehe
     des Teilbaums UNTER dem Knoten, nicht seine Position darin. In
     0.9.6 stand hier `k._tiefe <= 1`, und das schloss am Testsystem 131
     Knoten aus — genau einen davon zu Recht. Die anderen 130 waren
     Sparten wie `…Decklenlicht_RGB.cmnd` und Ordner wie `iot.0.smart`,
     also Knoten, deren Datenpunkte direkt darunter liegen (gefunden
     10.09.2026 beim Nachmessen von B23). */
  if (k.id.split('.').length <= 2) { return false; }
  /* Sonst: alles waehlbar. Was ein Geraet ist, weiss nur der Mensch —
     bei Duneweaver ist es der Knoten darueber, bei Tasmota der darunter.
     Statt zu sperren wird geraten (siehe wohlGeraet) und gewarnt. */
  return true;
}

/* Sieht dieser Knoten wie ein einzelnes Geraet aus? Nur ein Hinweis. */
export function wohlGeraet(k) {
  if (k.art === 'channel' || k.art === 'device') { return true; }
  /* `state` nach derselben Regel wie `folder` - sonst waere der Knoten
     waehlbar und bekaeme im selben Atemzug den Hinweis, er sei wohl
     kein Geraet. */
  if (k.art === 'folder' || k.art === 'state') { return hatDirekteZustaende(k); }
  if (k.art) { return false; }
  return k._tiefe <= 2 && (!k._eltern || k._eltern._tiefe > 2);
}

function renderKinder(knoten, filter, tiefe) {
  var ul = el('ul');
  /* Sortiert wird nach dem, was dasteht — sonst steht die Liste in einer
     Ordnung, die niemand sieht: bei hm-rpc nach Seriennummer, wo doch
     FK_* und HK_* beieinander gehoeren. `numeric` dazu, damit POWER2 vor
     POWER10 kommt. Einmal rechnen, nicht bei jedem Vergleich. */
  var reihen = Object.keys(knoten.kinder).map(function (n) {
    var kk = knoten.kinder[n];
    return { k: kk, zus: zusatzName(kk.id) };
  });
  /* Behaelter vor Blaettern, wie im Windows-Explorer: erst, was sich
     aufklappen laesst, darunter die Zeilen ohne eigenes Innenleben.
     Massgeblich ist, was der Baum ZEIGT, nicht die Datenlage - ein
     Ordner, unter dem nur verborgene Datenpunkte liegen (ActivePage
     mit drei states), traegt keinen Pfeil und gehoert nach unten.
     Dieselbe Regel wie beim Zeichnen der Kinder, eine Ebene tiefer. */
  function klappbar(k) {
    return Object.keys(k.kinder).some(function (n) {
      var c = k.kinder[n];
      return c._zust && !(c.art === 'state' && !Object.keys(c.kinder).length);
    });
  }
  /* Einmal je Reihe, nicht bei jedem Vergleich.

     `klappbar` laeuft ueber alle Enkel, und ein Sortiervergleich ruft es
     zweimal — bei n Reihen also 2·n·log(n) Enkel-Schleifen statt n.
     Dasselbe gilt fuer `localeCompare` mit Optionsobjekt: Das baut je
     Aufruf einen neuen Vergleicher. Ein `Intl.Collator` tut dasselbe
     einmal. */
  reihen.forEach(function (r) { r.kl = klappbar(r.k) ? 0 : 1; r.txt = String(r.zus || r.k.name); });
  reihen.sort(function (a, b) {
    if (a.kl !== b.kl) { return a.kl - b.kl; }
    return VERGLEICH.compare(a.txt, b.txt);
  });

  reihen.forEach(function (reihe) {
    var k = reihe.k;
    /* Leere Knoten ausgrauen statt weglassen.

       Ein Kanal ohne Datenpunkte gibt keinen Alias her - deshalb blieb
       er bisher ganz weg. Nur sieht das nicht nach „leer" aus, sondern
       nach „gibt es nicht": Ricardos Heizungsgruppen standen im Admin
       mit sieben Kanaelen, in der Werkbank mit zweien, und es sah wie
       ein Anzeigefehler aus, waehrend in Wahrheit hm-rpc die
       Datenpunkte nicht angelegt hatte (08.09.2026). Wer den Bestand
       sucht, soll die Luecke sehen.

       Nur echte Objekte, keine blossen Kennungsknoten: `channel`,
       `device`, `folder`. Waehlbar sind sie nicht (`istWaehlbar` steigt
       bei `_zust === 0` aus), also fuehrt auch kein Klick ins Leere.
       Produktiv sind das 194 Zeilen zu 3432 - gut sechs Prozent. */
    var leer = !k._zust;
    if (leer && k.art !== 'channel' && k.art !== 'device' && k.art !== 'folder') { return; }
    /* Zustaende zeigt die rechte Seite, nicht der Baum - es sei denn,
       unter dem Zustand liegt noch etwas. Dann ist er ein Behaelter und
       muss sichtbar sein, sonst hilft es nichts, dass `istWaehlbar` ihn
       zulaesst.

       Gefragt wird nach Kindern **jeder Art**, nicht nach direkten
       Datenpunkten. Der Unterschied ist gross: `mqtt-client.0.SmartHome`
       ist ein `state` und traegt 804 Objekte unter sich - aber kein
       einziges direkt, denn MQTT legt fuer Zwischenebenen gar keine
       Objekte an. Die erste Fassung fragte nach direkten Datenpunkten
       und liess damit den ganzen Zweig verschwinden. Sichtbarkeit und
       Waehlbarkeit sind zwei Fragen: sichtbar ist, was Kinder hat;
       waehlbar erst, was eigene Datenpunkte hat (siehe `istWaehlbar`). */
    if (k.art === 'state' && tiefe > 0 && !Object.keys(k.kinder).length) { return; }

    /* Der Filter sucht auch im Namen. Wer „Badezimmer" tippt, meint
       FK_Badezimmer — und nicht die Seriennummer, die er nicht kennt. */
    /* Beim Filtern zaehlen leere Knoten nicht als Treffer - sonst
       findet die Suche Zeilen, mit denen sich nichts anfangen laesst. */
    var passt = !filter
      ? true
      : (!leer && (k.id.toLowerCase().indexOf(filter) !== -1 ||
                   (reihe.zus && reihe.zus.toLowerCase().indexOf(filter) !== -1)));
    /* Zugeklappte Knoten gar nicht erst zeichnen.

       Vorher entstand IMMER der ganze Teilbaum als DOM — auch der eines
       zugeklappten Knotens, der gleich darauf weggeworfen wurde. Bei
       einer gewachsenen Anlage ist das der ganz ueberwiegende Teil der
       Arbeit.

       Zwei Ausnahmen, in denen der Teilbaum gebraucht wird: beim Filtern
       (ein Treffer weiter unten macht den Elternknoten sichtbar) und
       wenn der Knoten aufgeklappt ist. Sonst genuegt die Frage, OB es
       zeigbare Kinder gibt — und die beantwortet `klappbar` ohne DOM. */
    var aufJetzt = klappStand(k, tiefe);
    var brauchtKinder = !!filter || aufJetzt;
    var kinderUl = brauchtKinder ? renderKinder(k, filter, tiefe + 1) : null;
    var kinderPassen = kinderUl ? kinderUl.childNodes.length > 0 : klappbar(k);
    if (!passt && !kinderPassen) { return; }

    var li = el('li');
    var waehlbar = istWaehlbar(k);
    var d = el('div', 'node' + (waehlbar ? ' pick' : ' grp') + (leer ? ' leer' : '') +
      (k.id === S.current ? ' sel' : ''));

    var hatKinder = kinderPassen;
    var auf = aufJetzt;
    var tw = el('span', 'tw', hatKinder ? (auf ? '▾' : '▸') : '');
    if (hatKinder) {
      tw.addEventListener('click', function (e) {
        e.stopPropagation();
        S.aufgeklappt[k.id] = !auf;
        merkeKlappstand();
        zeichneBaum();
      });
    }
    d.appendChild(tw);
    var kk = el('span', 'kind', k.art ? k.art.slice(0, 3) : '·');
    if (!k.art) { kk.title = tr('tree.noObjectHint'); }
    d.appendChild(kk);
    d.appendChild(el('span', 'idstueck', k.name));
    if (reihe.zus) {
      var nm2 = el('span', 'nam', reihe.zus);
      d.appendChild(nm2);
      d.title = k.id + '  ·  ' + reihe.zus;
    }
    /* Der Hinweis kommt hinter den Zusatznamen, nicht davor - sonst
       ueberschreibt ihn die Zeile darueber wieder. */
    if (leer) { d.title = (d.title ? d.title + '  ·  ' : '') + tr('tree.emptyNode'); }
    if (waehlbar) {
      if (wohlGeraet(k)) {
        var pk = el('span', 'geraetepunkt', '●');
        pk.title = tr('tree.looksLikeDevice');
        d.appendChild(pk);
      }
      d.appendChild(el('span', 'cnt', k._zust + ''));
    }

    if (waehlbar) {
      d.tabIndex = 0;
      d.setAttribute('role', 'button');
      /* Erst fragen, dann wechseln — solange am aktuellen Entwurf etwas
         offen ist. Vorher fielen Aenderungen bei einem Klick ins Leere,
         ohne ein Wort (Ricardo, 06.09.2026): Rolle geaendert, im Baum
         weitergeklickt, alles weg.

         Die Frage haengt an `angefasst`, nicht an `geaendert` einer
         einzelnen Zeile: Auch Raum, Funktion, Ordner und Name gehoeren
         dazu, und die stehen nicht in den Zeilen. Geschrieben wird
         dadurch nichts — es geht nur darum, dass niemand etwas verliert,
         ohne gefragt zu werden. */
      var go = function () { mitNachfrage(k.id); };
      d.addEventListener('click', go);
      d.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); }
      });
    }
    li.appendChild(d);
    if (hatKinder && auf && kinderUl) { li.appendChild(kinderUl); }
    ul.appendChild(li);
  });
  return ul;
}

/* Entprellt, nicht bei jedem Anschlag.

   Der Baum wurde bei JEDEM Tastendruck komplett neu gebaut. Am
   Produktivsystem mit 24.786 Objekten gemessen (10.09.2026): 236 ms je
   Anschlag, acht Anschlaege 1,9 Sekunden — die Eingabe hinkte sichtbar
   hinterher. 180 ms sind kurz genug, dass es nach dem Tippen sofort
   dasteht, und lang genug, dass eine fluessig getippte Folge nur einmal
   zeichnet. */
var suchTimer = null;
$('#q').addEventListener('input', function () {
  if (suchTimer) { clearTimeout(suchTimer); }
  suchTimer = setTimeout(function () { suchTimer = null; zeichneBaum(); }, 180);
});

/* Alles auf, alles zu. Die einzeln gemerkten Knoten fallen dabei weg -
   sonst bliebe ein Zweig zu, den man eben ausdruecklich zugeklappt hat,
   und „alles auf" waere gelogen. */
function klappeAlle(auf) {
  S.aufgeklappt = {};
  S.alleKlapp = auf;
  merkeKlappstand();
  zeichneBaum();
  /* Verschwindet die Auswahl beim Zuklappen aus dem Baum, muss sie weg -
     sonst steht rechts ein Geraet, das links nicht mehr zu sehen ist
     (Ricardo, 25.08.2026). Dieselbe Regel wie beim Moduswechsel und beim
     Abschalten des Expertenmodus. Geprueft wird an der gezeichneten
     Liste, nicht an der Datenlage: sichtbar ist, was im Baum steht. */
  if (S.current && !auf && !imBaumSichtbar()) {
    S.current = null; aboLoesen();
    S.entwurf = null;
    S.openRow = null;
    zeichneErgebnis();
  }
}

/* Steht die Auswahl gerade als Zeile im Baum? Die gewaehlte Zeile traegt
   `sel` - gibt es keine, ist sie zugeklappt und damit unsichtbar. */
function imBaumSichtbar() {
  var baum = $('#tree');
  return !baum || !!baum.querySelector('.node.sel');
}
var bAuf = $('#btn-auf'), bZu = $('#btn-zu');
if (bAuf) { bAuf.addEventListener('click', function () { klappeAlle(true); }); }
if (bZu) { bZu.addEventListener('click', function () { klappeAlle(false); }); }


export function setzeModus(m) {
  S.baumModus = m;

  /* Was im neuen Baum nicht vorkommt, darf rechts nicht stehenbleiben.

     Vorher blieb `current` beim Wechsel unangetastet: Wer in den Quellen
     einen Ordner gewaehlt hatte und auf „Aliase“ klickte, sah links den
     Aliasbaum und rechts weiter den Ordner - eine Auswahl, die es in
     diesem Baum gar nicht gibt, samt Knoepfen, die auf sie zeigen.
     Umgekehrt genauso.

     Der Vorlagenbaum ist ausgenommen: er hat eine eigene Ansicht, und
     wer von dort zurueckwechselt, findet seine Auswahl wieder vor. */
  if (m === 'quellen' && S.current && S.current.indexOf('alias.') === 0) {
    S.current = null; aboLoesen(); S.entwurf = null; S.openRow = null;
  }
  if (m === 'aliase' && S.current && S.current.indexOf('alias.') !== 0) {
    S.current = null; aboLoesen(); S.entwurf = null; S.openRow = null;
  }
  /* Beim Moduswechsel den Filter fallen lassen und die Geraeteknoepfe
     zurueckholen. Sonst stand man im Vorlagenbaum vor „nichts gefunden"
     und sah nicht, dass noch ein Suchwort von vorhin wirkte. */
  if (m !== S.baumModusVorher) {
    var q0 = $('#q');
    if (q0) { q0.value = ''; }
  }
  S.baumModusVorher = m;
  if (m !== 'vorlagen') {
    ['#btn-dry', '#btn-tpl', '#btn-checks'].forEach(function (w) {
      var b = $(w);
      if (!b) { return; }
      /* „Als Vorlage speichern" gehoert zum Anlegen, nicht zum
         Bearbeiten — im Aliasmodus bleibt er weg (Ricardo, 05.09.2026). */
      b.hidden = (w === '#btn-tpl' && m === 'aliase');
    });
  }
  $('#m-quellen').className = (m === 'quellen') ? 'an' : '';
  $('#m-aliase').className = (m === 'aliase') ? 'an' : '';
  $('#m-vorlagen').className = (m === 'vorlagen') ? 'an' : '';
  var lbl = document.querySelector('.respane .panehead .lbl');
  if (lbl) { lbl.textContent = (m === 'vorlagen') ? tr('tv.paneHead') : tr('result.header'); }
  var ein = document.querySelector('#btn-einlesen');
  if (ein) { ein.hidden = (m !== 'vorlagen'); }
  zeichneBaum();
  zeichneErgebnis();
}

$('#m-quellen').addEventListener('click', function () { setzeModus('quellen'); });
$('#m-aliase').addEventListener('click', function () { setzeModus('aliase'); });
$('#m-vorlagen').addEventListener('click', function () { setzeModus('vorlagen'); });
