/* Die Quelle eines Alias austauschen.

   Der Fall: Ein Geraet geht kaputt und wird ersetzt. Der Alias soll
   bleiben, wie er ist - dieselbe Kennung, dieselbe Aufzeichnung in der
   Datenbank, dieselbe Zuordnung zu Raum und Funktion -, nur eben auf das
   neue Geraet zeigen (Ricardos Punkt 17).

   Geaendert wird deshalb so wenig wie moeglich: je Punkt `common.alias.id`
   und am Kanal `native.quelle`. Alles andere bleibt unberuehrt. Das ist
   der ganze Unterschied zum Neu-Anlegen, das den Alias aus der Vorlage
   heraus neu baut und dabei Namen, Rollen und Formeln mitbringt.

   Zugeordnet wird in vier Stufen, absteigend nach Verlaesslichkeit:
     1. gleicher relativer Pfad  (…ABC.1.STATE → …XYZ.1.STATE)
     2. ueber die Vorlage        (der Punkt weiss aus `native.ausZustand`,
                                  aus welcher Zeile er stammt)
     4. ueber den Alias-Punkt    (sein eigener Name und seine eigene
                                  Rolle - nicht die seiner alten Quelle)
     3. ueber Rolle und Namen    (nur als Vorschlag, sichtbar markiert)
   Was nichts findet, bleibt leer - und laesst sich dann entfernen.

   Die Nummern sind die Reihenfolge ihrer Entstehung, nicht die der
   Anwendung: Stufe 4 greift VOR dem Raten, weil sie belegter ist. Die
   drei alten Nummern umzuhaengen haette jeden Pruefpunkt und jede
   gespeicherte Messung ungueltig gemacht, ohne irgendetwas besser zu
   machen. */

import { S } from './zustand.js';
import { $, el } from './basis.js';
import { tr, txt, sprachtext } from './sprache.js';
import { socket } from './verbindung.js';
import { pruefeVorlage, vorschlag } from './vorlagen.js';
import { erkenneEntwurf } from './erkennung.js';
import { aliasQuellen, kindZustaende, holeWerte, auswerten } from './werte.js';
import { holeZweig, indexNeu } from './objekte.js';
import { waehle, knotenDa, rohEntwurf } from './entwurf.js';
import { zeichneErgebnis } from './ergebnis.js';

/* Die Punkte des Alias, die ueberhaupt eine Quelle haben. */
function aliasPunkte(kanal) {
  return S.keysSorted.filter(function (id) {
    if (id.indexOf(kanal + '.') !== 0) { return false; }
    var o = S.objects[id];
    return o && o.type === 'state' && o.common && o.common.alias;
  });
}

/* Woher liest dieser Alias heute? Der Kanal weiss es, wenn er von der
   Werkbank stammt; sonst wird es aus den Punkten abgeleitet - die
   laengste gemeinsame Wurzel aller Lesequellen. */
export function alteQuelle(kanal) {
  var k = S.objects[kanal];
  if (k && k.native && k.native.quelle) { return k.native.quelle; }
  var wurzeln = [];
  aliasPunkte(kanal).forEach(function (id) {
    var q = aliasQuellen(S.objects[id]);
    [q.read, q.write].forEach(function (x) {
      if (!x) { return; }
      /* Der Elternpfad, nicht der Datenpunkt selbst: bei einem Alias mit
         nur einem Punkt waere die „gemeinsame Wurzel" sonst der Punkt,
         und die Zuordnung ueber den relativen Pfad ginge ins Leere -
         sichtbar als „vermutet" an einer Zeile, die sich gar nicht
         aendert (Ricardo, 25.08.2026, an einem zigbee2mqtt-Alias). */
      var e = x.slice(0, x.lastIndexOf('.'));
      if (e.split('.').length > 2 && wurzeln.indexOf(e) === -1) { wurzeln.push(e); }
    });
  });
  if (!wurzeln.length) { return ''; }
  var teile = wurzeln[0].split('.');
  for (var i = 1; i < wurzeln.length; i++) {
    var t2 = wurzeln[i].split('.');
    var n = 0;
    while (n < teile.length && n < t2.length && teile[n] === t2[n]) { n++; }
    teile = teile.slice(0, n);
  }
  return teile.length > 2 ? teile.join('.') : '';
}

/* Stufe 2: Was sagt die Vorlage? Der Punkt merkt sich in
   `native.vorlage`/`native.ausZustand`, aus welcher Zeile er kam. */
function ausVorlage(punktId, neuKanal) {
  var o = S.objects[punktId];
  var nat = (o && o.native) || {};
  if (!nat.vorlage || !nat.ausZustand) { return null; }
  var v = null;
  S.VORLAGEN.forEach(function (x) { if (x.id === nat.vorlage) { v = x; } });
  if (!v) { return null; }
  var zeile = null;
  (v.zustaende || []).forEach(function (z) {
    if (z.name === nat.ausZustand) { zeile = z; }
  });
  if (!zeile) { return null; }
  var mach = function (rel) {
    if (!rel) { return ''; }
    var id = neuKanal + '.' + rel;
    return S.objects[id] ? id : '';
  };
  var r = mach(zeile.lesen);
  if (!r && zeile.lesenSonst) { r = mach(zeile.lesenSonst.punkt); }
  return { read: r, write: mach(zeile.schreiben) };
}

/* Stufe 3: gleicher Punktname irgendwo unter dem neuen Geraet, oder
   gleiche Rolle. Bewusst schwach - deshalb nur als Vorschlag. */
/* Und WORUEBER geraten wurde, wird mitgegeben.

   „vermutet" allein sagt nur, dass die Zuordnung schwach ist - nicht,
   woran sie haengt. Ueber den Namen geraten heisst: irgendein Punkt
   heisst hinten gleich; das kann weit danebenliegen (ein Fensterkontakt
   `…1.STATE` landete so auf `…tele.STATE`, dem Telemetrie-JSON einer
   Tasmota). Ueber die Rolle geraten ist etwas anderes und muss anders
   geprueft werden. Der Tooltip an der Marke sagt es jetzt (Ricardo,
   12.09.2026). */
function geraten(altQuelle, neuKanal) {
  var name = altQuelle.split('.').pop();
  var kandidaten = kindZustaende(neuKanal);
  var treffer = '';
  kandidaten.forEach(function (id) {
    if (!treffer && id.split('.').pop() === name) { treffer = id; }
  });
  if (treffer) { return { id: treffer, ueber: 'name' }; }
  var altO = S.objects[altQuelle];
  var rolle = altO && altO.common && altO.common.role;
  if (rolle) {
    kandidaten.forEach(function (id) {
      var o = S.objects[id];
      if (!treffer && o && o.common && o.common.role === rolle) { treffer = id; }
    });
  }
  return treffer ? { id: treffer, ueber: 'rolle', rolle: rolle } : null;
}

/* Stufe 5: dieselbe Frage wie beim Anklicken im Baum.

   Der Tausch hat lange eigene Wege gesucht - Pfad, gemerkte Vorlage,
   Raten, Alias-Punkt. Dabei stellt er dieselbe Frage, die die Werkbank
   beim Anklicken eines Geraets ohnehin beantwortet: Welcher Punkt DORT
   ist das `ELECTRIC_POWER`? Beim Anlegen entsteht genau diese Zuordnung
   - Musterplatz zu Quellpunkt, samt Formel - und beim Tauschen wurde sie
   bisher nicht gelesen (Ricardo, 13.10.2026: „so wie wenn ich im Baum
   klicke, da wird ja auch versucht zu erkennen oder Vorlage").

   Das ist der Weg, der in BEIDE Richtungen traegt:

   - Zu einem Geraet, das seine Punkte beschriftet (Matter: `role:
     value.power`, `unit: W`), antwortet der Detektor.
   - Zu einem Geraet, das gar nichts beschriftet, antwortet die Vorlage.
     Gemessen am Testsystem an `mqtt-client.0.SmartHome.PC_Jonas`: alle
     zehn Punkte `role: (keine)`, `type: mixed`, der type-detector macht
     daraus `info` - aber `tasmota-steckdose` passt mit Rang 2000020 und
     weiss, dass `stat.POWER` der Melder ist und die Leistung in
     `tele.SENSOR` unter `ENERGY.Power` steht.

   Und die FORMELN kommen mit, weil sie zur Quelle gehoeren und nicht
   zum Alias. Das war der offene Rest vom Vormittag: Beim Tausch von
   Tasmota auf Matter blieb `JSON.parse(val)?.ENERGY?.Power` stehen und
   machte aus Messwerten `null`; auf dem Rueckweg fehlte sie. Jetzt
   bringt jede Richtung ihre eigene mit.

   Gefragt wird ueber den PLATZNAMEN. Was im Alias zu keinem Musterplatz
   gehoert - Handgebautes -, findet auch dieser Weg nicht; solche Punkte
   bleiben uebrig und muessen entschieden werden, wie bisher. */
export function zielKarte(neuKanal) {
  var karte = {};
  if (!neuKanal) { return karte; }
  /* Erst die Vorlage: sie weiss mehr als der Detektor - Formeln, Felder
     in einem JSON, getrennte Lese- und Schreibquellen. */
  var v = null;
  try { v = vorschlag(neuKanal); } catch { v = null; }
  if (v && v.states && v.states.length) {
    v.states.forEach(function (st) {
      if (!st.n || !st.srcR) { return; }
      karte[String(st.n).toLowerCase()] = {
        read: st.srcR, write: st.srcW || '', f: st.f || '', fw: st.fw || '',
        her: 'vorlage', was: v.tplName || (v.vorlage && v.vorlage.id) || ''
      };
    });
    return karte;
  }
  /* Sonst der Detektor am Rohentwurf - er benennt die Plaetze genauso
     (`SET`, `ELECTRIC_POWER`), nur ohne Formeln. */
  var roh = null;
  try { roh = rohEntwurf(neuKanal); } catch { roh = null; }
  if (!roh) { return karte; }
  var erk = [];
  try { erk = erkenneEntwurf(roh, null) || []; } catch { erk = []; }
  /* Die Kennung, die der Detektor nennt, ist KEIN Objekt.

     `abbild` baut ihm ein eigenes Bild des Entwurfs: ein Kanal, alle
     Punkte flach darunter, benannt nach der Alias-Zeile. Aus
     `…Plug.ElectricalSensor-2.ELECTRIC_POWER` wird dort
     `…Plug.ElectricalSensor-2_ELECTRIC_POWER` - mit Unterstrich, weil
     ein Punkt im Namen am Alias eine Unterebene aufmachen wuerde. Wer
     diese Kennung als Quelle einträgt, legt einen Alias an, der ins
     Leere zeigt (gemessen in W30, 13.10.2026).

     Die echte Quelle steht in der Zeile selbst: `srcR`/`srcW`. Also
     ueber den Zeilennamen zurueckrechnen. */
  var zeilen = {};
  (roh.states || []).forEach(function (st) { if (st.n) { zeilen[st.n] = st; } });
  var vor = neuKanal + '.';
  ((erk[0] && erk[0].states) || []).forEach(function (s) {
    if (!s.id || !s.name) { return; }
    var zeile = zeilen[String(s.id).indexOf(vor) === 0 ? String(s.id).slice(vor.length) : ''];
    if (!zeile || !zeile.srcR) { return; }
    karte[String(s.name).toLowerCase()] = {
      read: zeile.srcR,
      /* Schreiben nur, wo der Punkt es zulaesst - ein Melder bekommt
         kein Schreibziel. */
      write: zeile.srcW || '',
      f: zeile.f || '', fw: zeile.fw || '', her: 'detektor', was: erk[0].type || ''
    };
  });
  return karte;
}

/* Stufe 4: der Alias-Punkt selbst - sein Name und seine Rolle.

   Die drei alten Stufen fragen alle, WOHER der Punkt bisher liest. Das
   greift, solange beide Geraete aehnlich gebaut sind, und versagt
   vollstaendig, sobald sie es nicht sind. Gemessen am 13.10.2026 am
   Produktivsystem: eine Tasmota-Steckdose auf eine Matter-Steckdose
   umhaengen ergab 0 von 8 Zuordnungen - bei zwei Geraeten, die dasselbe
   tun.

   Zweimal lag es an der Quelle, nie am Ziel:
   - mqtt-client pflegt keine Rollen (`stat.POWER`, `cmnd.POWER` und
     `tele.SENSOR` haben alle `role: undefined`), damit faellt der
     Rollenvergleich in Stufe 3 ohne einen Treffer aus.
   - Fuenf der acht Punkte lesen aus EINEM Punkt, dem Telemetrie-JSON
     `tele.SENSOR`. Aus ihm laesst sich nichts ableiten; er heisst
     `SENSOR` und traegt die Bedeutung erst in der Formel.

   Dabei steht die Antwort fertig im Alias: `…PC.ELECTRIC_POWER` traegt
   `role: value.power`, und am neuen Geraet liegt
   `…ElectricalSensor-2.ELECTRIC_POWER` mit genau dieser Rolle. Die
   Bedeutung wurde beim Anlegen in den Alias geschrieben - sie beim
   Tauschen nicht wieder zu lesen, war die Luecke.

   Zwei Guetegrade, und beide verlangen Eindeutigkeit:
   - Name UND Rolle gleich, genau einmal -> starker Treffer, gilt wie
     ein Pfadtreffer und bekommt eine Herkunftsmarke.
   - nur die Rolle, und nur wenn sie unter dem neuen Geraet genau einmal
     vorkommt -> Vorschlag wie Stufe 3, sichtbar als „vermutet".
   Zwei Punkte mit `value.power` unter einem Knoten heben sich also auf,
   statt dass einer von beiden gewaehlt wird. */
function ausAliasPunkt(punktId, name, neuKanal) {
  var o = S.objects[punktId];
  var rolle = ((o && o.common) || {}).role || '';
  if (!rolle) { return null; }
  /* Der blosse Punktname, auch wenn der Alias Unterebenen hat. */
  var kurz = String(name).split('.').pop().toLowerCase();
  var mitRolle = [], mitBeidem = [];
  kindZustaende(neuKanal).forEach(function (id) {
    var k = S.objects[id];
    if (!k || !k.common || k.common.role !== rolle) { return; }
    mitRolle.push(id);
    if (id.split('.').pop().toLowerCase() === kurz) { mitBeidem.push(id); }
  });
  if (mitBeidem.length === 1) { return { id: mitBeidem[0], stark: true, rolle: rolle }; }
  if (!mitBeidem.length && mitRolle.length === 1) {
    return { id: mitRolle[0], stark: false, rolle: rolle };
  }
  return null;
}

/* Die gemerkte Vorlage gegen die NEUE Quelle halten.

   Ein Alias merkt sich, aus welcher Vorlage er entstanden ist - am Kanal
   `native.vorlage`, an jedem Punkt zusaetzlich `native.ausZustand`. Die
   Merkung ist stark: „sie bleibt, bis du sie ausdruecklich umstellst",
   und der Reiter wendet sie auch dann an, wenn die Erkennung sie nicht
   mehr findet (dann steht „erzwungen" daneben).

   Beim Tausch auf ein BAUGLEICHES Geraet ist das richtig und soll so
   bleiben. Beim Tausch auf ein anders gebautes Geraet ist es falsch, und
   zwar unsichtbar falsch. Gemessen am 13.10.2026 an Ricardos
   `alias.0.Bastelzimmer.PC`, nach dem Tausch von einer Tasmota-Steckdose
   auf eine Matter-Steckdose:
   - Der Kanal trug weiter `vorlage: tasmota-steckdose`, der Reiter
     meldete „GEMERKT / ERZWUNGEN ✕ cmnd.POWER" und „21 ohne Quelle".
   - Schlimmer sind die FORMELN, die aus derselben Vorlage stammen und an
     den Punkten stehen: `JSON.parse(val)?.ENERGY?.Power ?? null` passte
     zum Telemetrie-JSON einer Tasmota. Matter liefert eine blanke Zahl,
     `JSON.parse(37)` ergibt 37, `37?.ENERGY` ist undefined - und der
     Punkt stand auf `null`. Vier Messwerte waren still leer, ohne
     Fehlermeldung.
   - Und an `SET` blieb die Schreibformel `val ? "ON" : "OFF"` stehen,
     die einen String auf einen boolean-Punkt geschrieben haette.

   Die Formel gehoert zur QUELLE, nicht zum Alias - sie beschreibt, wie
   man aus dieser Bauart einen Wert holt. Wechselt die Bauart, ist sie in
   beide Richtungen falsch (Ricardo: „wenn ich von matter auf mqtt
   wechsle, muessten die ja wieder dazu"). Entschieden wird das nicht
   automatisch: die Werkbank sagt es und bietet es an. */
export function merkungPruefen(kanal, neuKanal) {
  var k = S.objects[kanal];
  var id = k && k.native && k.native.vorlage;
  if (!id || !neuKanal) { return null; }
  var v = null;
  (S.VORLAGEN || []).forEach(function (x) { if (x.id === id) { v = x; } });
  /* Eine Merkung auf eine Vorlage, die es nicht mehr gibt, ist ebenso
     ueberholt wie eine, die nicht mehr passt. */
  if (!v) { return { id: id, name: id, passt: false, fehler: [tr('swap.tplGone')], ersatz: null }; }
  var t = pruefeVorlage(v, neuKanal);
  if (t.passt) { return { id: id, name: sprachtext(v.name), passt: true }; }
  /* Passt eine ANDERE auf die neue Quelle, gehoert sie genannt - dann
     weiss der Nutzer, dass es dort Formeln und Namen zu holen gibt. Die
     Werkbank wendet sie hier nicht an: das ist „Alias aktualisieren",
     ein eigener Weg mit eigener Vorschau. */
  var ersatz = null;
  (S.VORLAGEN || []).forEach(function (x) {
    if (x.id === id) { return; }
    var p = pruefeVorlage(x, neuKanal);
    if (p.passt && (!ersatz || p.punkte > ersatz.punkte)) {
      ersatz = { name: sprachtext(x.name), punkte: p.punkte };
    }
  });
  return { id: id, name: sprachtext(v.name), passt: false,
           fehler: (t.fehler || []).slice(0, 3), ersatz: ersatz };
}

/* Welche Punkte des Alias tragen eine Merkung oder eine Formel? */
export function merkungStellen(kanal) {
  var raus = { kanal: false, punkte: [], formeln: [] };
  var k = S.objects[kanal];
  if (k && k.native && (k.native.vorlage || k.native.vorlageVersion)) { raus.kanal = true; }
  aliasPunkte(kanal).forEach(function (id) {
    var o = S.objects[id];
    var n = (o && o.native) || {};
    var a = (o.common && o.common.alias) || {};
    if (n.vorlage || n.ausZustand) { raus.punkte.push(id); }
    if (a.read || a.write) { raus.formeln.push(id); }
  });
  return raus;
}

/* ================== Einheiten ==================

   Wechselt beim Tausch die Einheit, stimmt danach jeder Wert nicht mehr
   - und zwar unsichtbar. Tasmota liefert `ENERGY.Total` in kWh, Matter
   `CONSUMPTION` in Wh: derselbe Zaehler, Faktor 1000. Der Alias zeigt
   danach 35,4 statt 35380 und niemand merkt es.

   Automatisch umgerechnet wird trotzdem NICHTS. Am 13.10.2026 hat sich
   gezeigt, warum: Matter schreibt an `CURRENT` die Einheit `mA`,
   liefert aber Ampere (0,926 bei 245 W an 228 V). Eine Automatik, die
   der Beschriftung glaubt, haette daraus 926 A gemacht - sie baut den
   Fehler ein, statt ihn zu finden.

   Stattdessen stehen BEIDE WERTE nebeneinander, der der neuen Quelle
   und der des Alias. Daran sieht man in einer Sekunde, ob der Faktor
   stimmt - und beim CURRENT-Fall sofort, dass die Beschriftung luegt,
   weil 0,926 und 0,92 schon gleich sind. Das sagt keine Tabelle. */

/* Faktor zur Basiseinheit. Nur Paare, die eindeutig sind: Temperatur
   fehlt mit Absicht, °C nach °F ist kein Faktor, sondern eine Gerade,
   und eine halb richtige Umrechnung ist schlimmer als keine. */
var EINHEITEN = {
  mA: { b: 'A', f: 0.001 }, A: { b: 'A', f: 1 },
  mV: { b: 'V', f: 0.001 }, V: { b: 'V', f: 1 }, kV: { b: 'V', f: 1000 },
  mW: { b: 'W', f: 0.001 }, W: { b: 'W', f: 1 }, kW: { b: 'W', f: 1000 },
  Wh: { b: 'Wh', f: 1 }, kWh: { b: 'Wh', f: 1000 }, MWh: { b: 'Wh', f: 1000000 },
  Pa: { b: 'Pa', f: 1 }, hPa: { b: 'Pa', f: 100 },
  mbar: { b: 'Pa', f: 100 }, bar: { b: 'Pa', f: 100000 },
  ms: { b: 's', f: 0.001 }, s: { b: 's', f: 1 },
  min: { b: 's', f: 60 }, h: { b: 's', f: 3600 },
  mm: { b: 'm', f: 0.001 }, cm: { b: 'm', f: 0.01 },
  m: { b: 'm', f: 1 }, km: { b: 'm', f: 1000 },
  g: { b: 'g', f: 1 }, kg: { b: 'g', f: 1000 },
  l: { b: 'l', f: 1 }, ml: { b: 'l', f: 0.001 }
};

/* Womit die neue Quelle multipliziert werden muesste, damit der Alias in
   SEINER Einheit bleibt. `null`, wenn die beiden nichts miteinander zu
   tun haben oder eine davon unbekannt ist. */
export function umrechenFaktor(altEinheit, neuEinheit) {
  var a = EINHEITEN[String(altEinheit || '').trim()];
  var n = EINHEITEN[String(neuEinheit || '').trim()];
  if (!a || !n || a.b !== n.b || a.f === n.f) { return null; }
  return n.f / a.f;
}

/* Als Rechenschritt, wie ihn ein Mensch schreiben wuerde: lieber
   `/ 1000` als `* 0.001`. */
export function faktorText(faktor) {
  if (faktor >= 1) { return '* ' + (Math.round(faktor * 1e6) / 1e6); }
  var kehr = 1 / faktor;
  var rund = Math.round(kehr);
  if (Math.abs(kehr - rund) < 1e-9) { return '/ ' + rund; }
  return '* ' + (Math.round(faktor * 1e9) / 1e9);
}

/* Welche Leseformel am Ende dasteht - nach allem, was an dieser Zeile
   entschieden ist.

   EINE Stelle fuer die Anzeige und fuer das Schreiben. Vorher rechnete
   die Zeile nur die Formel der Stufe 5 aus und zeigte „keine", waehrend
   die Umrechnung daneben `(val) / 1000` geschrieben haette - Anzeige und
   Ergebnis liefen auseinander (Ricardo, 13.10.2026). Was dasteht, muss
   das sein, was passiert. */
export function endFormel(zeile) {
  var o = S.objects[zeile.id] || {};
  var alt = ((o.common || {}).alias || {}).read || '';
  /* Stufe 5 bringt die Formel des neuen Geraets mit - auch „keine". */
  var formel = zeile.formelNeu ? (zeile.neuF || '') : alt;
  /* Der Faktor, den der Nutzer gesetzt hat. 1 und leer heissen beide
     „nichts rechnen"; ein ungueltiger Wert ebenso - wer `abc` tippt,
     soll keine kaputte Formel bekommen. */
  var fk = Number(((S.tauschEinheit || {})[zeile.id] || {}).faktor);
  if (zeile.neuR && fk && isFinite(fk) && fk !== 1) {
    formel = '(' + (formel || 'val') + ') ' + faktorText(fk);
  }
  return formel;
}

/* Die Zuordnungstabelle: je Alias-Punkt, was heute gilt und was danach
   gelten soll. `stufe` sagt, wie verlaesslich der Vorschlag ist. */
export function tauschPlan(kanal, neuKanal) {
  var altK = alteQuelle(kanal);
  /* Einmal je Plan, nicht je Zeile: `vorschlag` prueft alle Vorlagen. */
  var karte = zielKarte(neuKanal);
  return aliasPunkte(kanal).map(function (id) {
    var q = aliasQuellen(S.objects[id]);
    var zeile = { id: id, name: id.slice(kanal.length + 1),
                  altR: q.read || '', altW: (q.einfach ? '' : (q.write || '')),
                  einfach: !!q.einfach, neuR: '', neuW: '', stufe: 0 };
    if (!neuKanal) { return zeile; }
    /* 1. gleicher Pfad unterhalb der Quelle.

       Mehrere Versuche, weil die alte Wurzel und der neu gewaehlte Knoten
       nicht auf derselben Ebene liegen muessen: Wer bei einem Alias mit
       einem einzigen Punkt das GERAET waehlt, waehrend die alte Wurzel
       ein KANAL ist, soll trotzdem einen sauberen Treffer bekommen und
       nicht die richtige Ebene raten muessen (Ricardo, 25.08.2026).
       Reihenfolge: erst der volle relative Pfad, dann die letzten beiden
       Glieder (`1.STATE`), zuletzt der blosse Punktname. */
    var suchePfad = function (voll) {
      var versuche = [];
      if (altK && voll.indexOf(altK + '.') === 0) { versuche.push(voll.slice(altK.length + 1)); }
      var tt = voll.split('.');
      if (tt.length > 1) { versuche.push(tt.slice(-2).join('.')); }
      versuche.push(tt[tt.length - 1]);
      for (var i = 0; i < versuche.length; i++) {
        var kand = neuKanal + '.' + versuche[i];
        if (S.objects[kand]) { return kand; }
      }
      return '';
    };
    if (zeile.altR) {
      var trR = suchePfad(zeile.altR);
      if (trR) { zeile.neuR = trR; zeile.stufe = 1; }
    }
    if (zeile.altW) {
      var trW = suchePfad(zeile.altW);
      if (trW) { zeile.neuW = trW; }
    }
    /* 5. wie beim Anklicken im Baum - Vorlage oder Detektor am ZIEL.

       Gleich nach dem Pfadtreffer, denn das ist die belegteste Auskunft,
       die es ueber das neue Geraet gibt. Nur der gleiche relative Pfad
       (Stufe 1) geht noch davor: beim baugleichen Ersatz ist er exakt
       und braucht keine Erkennung. */
    if (!zeile.neuR) {
      var zk = karte[String(zeile.name).split('.').pop().toLowerCase()];
      if (zk && zk.read) {
        /* Der Detektor ist auch nur eine Heuristik: Liegen am Ziel zwei
           Punkte mit derselben Rolle, waehlt er einen davon - gemessen
           in W26, wo ein zweiter `value.power` daneben lag und
           `ELECTRIC_POWER` auf `ELECTRIC_POWER_B` landete. Heisst ein
           Punkt dort GENAU wie der Platz und traegt dessen Rolle, ist er
           gemeint; das ist keine Vermutung mehr.

           Nur gegen den Detektor, nicht gegen die Vorlage: die hat ein
           Mensch geschrieben und weiss es besser als jede Namensregel
           (bei Tasmota heisst kein Punkt `ACTUAL`). */
        var genau = (zk.her === 'detektor') ? ausAliasPunkt(id, zeile.name, neuKanal) : null;
        if (genau && genau.stark && genau.id !== zk.read) {
          var gc = (S.objects[genau.id] || {}).common || {};
          zk = { read: genau.id, write: (gc.write ? genau.id : ''),
                 f: '', fw: '', her: zk.her, was: zk.was };
        }
        zeile.neuR = zk.read;
        /* Ein Schreibziel bekommt nur, wer schreiben soll. Massgeblich
           ist der ALIAS-Punkt, nicht das Ziel: `LOWBAT` ist ein Melder,
           auch wenn der zigbee-Punkt `battery_low` beschreibbar waere
           (gemessen 13.10.2026). */
        var ac5 = (S.objects[id] || {}).common || {};
        zeile.neuW = ac5.write ? (zk.write || '') : '';
        zeile.stufe = 5;
        zeile.zielHer = zk.her;
        zeile.zielWas = zk.was;
        /* Die Formeln gehoeren zur Quelle: die alte beschreibt das alte
           Geraet und ist nach dem Tausch falsch. Leer heisst „keine" -
           auch das ist eine Auskunft (Matter liefert blanke Zahlen). */
        zeile.neuF = zk.f || '';
        zeile.neuFw = zk.fw || '';
        zeile.formelNeu = true;
        if (zk.write && zk.write === zk.read) { zeile.einPunkt = true; }
      }
    }
    /* 2. ueber die Vorlage */
    if (!zeile.neuR) {
      var v = ausVorlage(id, neuKanal);
      if (v && v.read) { zeile.neuR = v.read; zeile.stufe = 2; if (v.write) { zeile.neuW = v.write; } }
    }
    /* 4. ueber den Alias-Punkt - vor dem Raten, weil belegter.

       Das Schreibziel darf hier auf der Lesequelle liegen: Wo ein
       einziger Punkt liest und schreibt, ist das die richtige Form und
       nicht die Falle aus der Regel weiter unten. Verlangt werden drei
       Dinge - ein starker Treffer, ein Alias-Punkt, der ueberhaupt
       schreibt, und ein Ziel, das sich beschreiben laesst. Ein Melder
       wie `ACTUAL` bekommt so nie ein Schreibziel. */
    if (!zeile.neuR) {
      var ap = ausAliasPunkt(id, zeile.name, neuKanal);
      if (ap && ap.stark) {
        zeile.neuR = ap.id;
        zeile.stufe = 4;
        zeile.ausAlias = ap.rolle;
        var ac = (S.objects[id] || {}).common || {};
        var zc = (S.objects[ap.id] || {}).common || {};
        if (ac.write && zc.write) { zeile.neuW = ap.id; zeile.einPunkt = true; }
      } else if (ap) {
        zeile.neuR = ap.id;
        zeile.stufe = 3;
        zeile.geratenUeber = 'aliasRolle';
        zeile.geratenRolle = ap.rolle;
      }
    }
    /* 3. geraten */
    if (!zeile.neuR && zeile.altR) {
      var g = geraten(zeile.altR, neuKanal);
      if (g) {
        zeile.neuR = g.id; zeile.stufe = 3;
        zeile.geratenUeber = g.ueber; zeile.geratenRolle = g.rolle || '';
      }
    }
    if (!zeile.neuW && zeile.altW) {
      var gwT = geraten(zeile.altW, neuKanal);
      var gw = gwT && gwT.id;
      /* Was hier geraten wird, muss ein anderer Punkt sein als die
         Lesequelle. Bei getrennten Quellen heissen Melder und Befehl oft
         gleich - `stat.POWER` und `cmnd.POWER` -, und das Raten greift
         nach dem Namen: aus der Schreibquelle `cmnd.POWER` wurde am
         neuen Geraet `stat.POWER`, also genau der Melder. Der Alias
         haette danach seinen Befehl ins Status-Thema geschickt; das
         Geraet schaltet nicht und die Rueckmeldung ist verfaelscht
         (gemessen 09.09.2026). Lieber kein Treffer als dieser. */
      if (gw && gw !== zeile.neuR) { zeile.neuW = gw; }
    }
    /* Bei getrennten Quellen darf das Schreibziel nie die Lesequelle
       sein - egal, aus welcher der drei Stufen es kam.

       Beim Raten stand diese Regel schon (siehe oben), beim PFADTREFFER
       fehlte sie: `suchePfad` probiert als letzte Form den blossen
       Punktnamen, und `cmnd.POWER` findet so `…Stumm.stat.POWER` - den
       Melder. Sichtbar wird es, wenn man beim Tauschen nicht das Geraet,
       sondern einen Unterknoten waehlt (`…Stumm.stat` statt `…Stumm`):
       dann verschwand der rote Hinweis, der Knopf wurde frei, und
       geschrieben haette der Alias auf seine eigene Lesequelle - genau
       der Fehler, den W20 abschaffen sollte (Ricardo, 12.09.2026).

       Danach steht `neuW` leer, und die Sperre aus W20 greift: der
       Nutzer entscheidet, ob der Punkt entfernt wird.

       Ausgenommen ist nur Stufe 4 mit `einPunkt`: dort ist die Gleichheit
       nicht geraten, sondern gepruefte Absicht - ein Punkt, der liest und
       schreibt. Matter legt die Steckdose so an (`…OnOffPlugInUnit-1.SET`,
       `role: switch`, lesbar und beschreibbar), hm-rpc mit `1.STATE`
       ebenso. Ohne diese Ausnahme meldete die Zeile „kein Schreibziel
       gefunden" an einem Punkt, der genau dafuer da ist. */
    if (!zeile.einfach && !zeile.einPunkt &&
        zeile.neuW && zeile.neuW === zeile.neuR) { zeile.neuW = ''; }
    /* 6. Von Hand gewaehlt - das letzte Wort hat der Mensch.

       Was keine Stufe findet, liess sich bisher nur entfernen oder
       stehenlassen. Das ist zu wenig: Wer weiss, welcher Punkt am neuen
       Geraet gemeint ist, soll ihn benennen koennen (Ricardo,
       13.10.2026, an `info_connection`).

       Die Formel wird dabei NICHT angefasst. Woher sollte die Werkbank
       wissen, wie aus diesem Punkt der Wert wird? Das steht in keiner
       Vorlage und in keiner Rolle - also bleibt stehen, was dasteht, und
       die Zeile sagt, dass es zu pruefen ist. */
    var hand = (S.tauschHand || {})[id];
    if (hand && S.objects[hand]) {
      zeile.neuR = hand;
      zeile.stufe = 6;
      zeile.vonHand = true;
      zeile.formelNeu = false;
      zeile.einPunkt = false;
      var ah = (S.objects[id] || {}).common || {};
      var zh = (S.objects[hand] || {}).common || {};
      /* Schreibziel nur, wenn beide Seiten es hergeben - und dann auf
         denselben Punkt, denn einen zweiten hat niemand benannt. */
      zeile.neuW = (ah.write && zh.write) ? hand : '';
      if (zeile.neuW) { zeile.einPunkt = true; }
      return zeile;
    }

    /* Bei einfacher Quelle gilt die Lesequelle fuer beides - ausser das
       ZIEL verlangt es anders.

       Ob ein Alias-Punkt eine oder zwei Quellen hat, ist keine
       Eigenschaft des Alias, sondern des Geraets, an dem er haengt.
       Matter hat einen Punkt, der liest und schreibt (`SET`); Tasmota
       hat zwei, `stat.POWER` meldet und `cmnd.POWER` befiehlt. Beim
       Tausch von dem einen auf das andere muss die Bauform mitwandern.

       Ohne diese Ausnahme ueberschrieb die Regel genau das, was Stufe 5
       aus der Vorlage geholt hatte: Der Befehl waere auf dem Melder
       gelandet - der Fehler, den W20 und W22 abschaffen (gemessen in
       W30, 13.10.2026). */
    if (zeile.einfach && zeile.neuR && !(zeile.stufe === 5 && zeile.neuW)) {
      zeile.neuW = zeile.neuR;
    }
    return zeile;
  });
}

/* Was der Tausch am Ende schreibt - dieselbe Form wie `baueObjekte`,
   damit der Trockenlauf-Dialog sie unveraendert anzeigen kann. */
export function tauschObjekte(kanal, neuKanal, plan, weg, merkungLoesen) {
  var raus = [];
  var k = S.objects[kanal];
  if (k) {
    var kn = JSON.parse(JSON.stringify(k));
    delete kn.ts; delete kn.from; delete kn.user; delete kn.acl; delete kn._id;
    kn.native = kn.native || {};
    kn.native.quelle = neuKanal;
    /* `geraetetyp` bleibt: der sagt, was das Geraet IST (socket), und das
       aendert sich beim Tausch der Quelle nicht. Weg muss nur, was auf
       die alte Bauart zeigt. */
    if (merkungLoesen) { delete kn.native.vorlage; delete kn.native.vorlageVersion; }
    raus.push({ id: kanal, neu: false, obj: kn });
  }
  plan.forEach(function (z) {
    if (weg[z.id]) { return; }
    if (!z.neuR) { return; }
    var o = S.objects[z.id];
    if (!o) { return; }
    var neu = JSON.parse(JSON.stringify(o));
    delete neu.ts; delete neu.from; delete neu.user; delete neu.acl; delete neu._id;
    var a = neu.common.alias || {};
    if (z.neuW && z.neuW !== z.neuR) { a.id = { read: z.neuR, write: z.neuW }; }
    /* `einPunkt`: Lesen und Schreiben fallen am neuen Geraet auf einen
       Punkt zusammen (Stufe 4). Dann ist die einfache Form richtig -
       die Objektform unten wuerde `write` weglassen und aus einem
       Schalter einen Melder machen. */
    else if (z.einfach || z.einPunkt) { a.id = z.neuR; }
    else {
      /* Getrennte Quellen ohne Schreibtreffer: die Objektform bleibt.

         Eine blosse Zeichenkette heisst fuer den js-controller „lesen
         und schreiben auf dieselbe Kennung". Aus einem Alias, der den
         Zustand liest und den Befehl woanders hinschickt, wurde damit
         einer, der auf den Melder schreibt - und aus einem bewusst nur
         lesenden Punkt bei `common.write: true` sogar ein schreibender.
         Ohne Treffer bleibt `write` einfach weg: dann schreibt der Alias
         nirgendwohin, und das ist die ehrliche Auskunft. */
      a.id = { read: z.neuR };
    }
    /* Kam die Zuordnung vom Ziel (Stufe 5), kommt auch die Formel von
       dort - das ist der Kern der Sache: die Formel beschreibt, wie man
       aus DIESER Bauart einen Wert holt.

       Leer setzen heisst loeschen, und das ist richtig: Matter liefert
       eine blanke Zahl, auf die keine JSON-Formel passt. Umgekehrt
       bringt der Weg zurueck zu Tasmota `JSON.parse(val)?.ENERGY?.Power`
       wieder mit. */
    if (z.formelNeu) {
      if (z.neuFw) { a.write = z.neuFw; } else { delete a.write; }
    }
    /* Die Leseformel kommt aus `endFormel` - derselben Rechnung, die
       die Zeile anzeigt. Zwei Rechenwege waeren zwei Wahrheiten. */
    var endF = endFormel(z);
    if (endF) { a.read = endF; } else { delete a.read; }
    /* Mit der Merkung gehen die Formeln. Sie stammen aus derselben
       Vorlage und beschreiben die alte Bauart; stehen sie weiter da,
       steht der Punkt still auf `null` (siehe `merkungPruefen`). */
    if (merkungLoesen) {
      delete a.read;
      delete a.write;
      neu.native = neu.native || {};
      delete neu.native.vorlage;
      delete neu.native.vorlageVersion;
      delete neu.native.ausZustand;
    }
    /* Die Einheit - was der Nutzer dazu entschieden hat.

       Hier steht nur noch `einheit`: der Wert bleibt roh, die
       Beschriftung zieht nach. Das Umrechnen steckt in `endFormel`
       (oben), damit Anzeige und Ergebnis dieselbe Rechnung benutzen. */
    var eW = (S.tauschEinheit || {})[z.id] || {};
    if (eW.unit !== undefined) {
      if (eW.unit) { neu.common.unit = eW.unit; } else { delete neu.common.unit; }
    }
    neu.common.alias = a;
    raus.push({ id: z.id, neu: false, obj: neu });
  });
  return raus;
}

/* ================== Dialog ================== */

/* Wo koennte die neue Quelle liegen? Alles, worunter Datenpunkte haengen
   und was nicht selbst ein Alias ist. Gefiltert wird ueber den Suchtext,
   sonst waeren es auf einer grossen Anlage Tausende Zeilen. */
var quellenCache = null, quellenStand = -1;

/* Alle Stellen, unter denen Datenpunkte haengen - als Kandidaten fuer
   eine neue Quelle. Nicht ueber `S.objects` filtern: MQTT legt fuer
   Zwischenebenen GAR KEINE Objekte an, das halbe Haus faende sich sonst
   nicht (derselbe Fallstrick wie im Baum, Testplan B24). Gesammelt wird
   deshalb aus den Eltern der Datenpunkte selbst, einmal je Objektstand. */
function quellenListe() {
  if (quellenCache && quellenStand === S.keysSorted.length) { return quellenCache; }
  var da = {};
  S.keysSorted.forEach(function (id) {
    if (id.indexOf('alias.') === 0) { return; }
    var o = S.objects[id];
    if (!o || o.type !== 'state') { return; }
    var p = id.slice(0, id.lastIndexOf('.'));
    if (p.split('.').length > 2) { da[p] = true; }
    /* Eine Ebene hoeher steht bei Homematic das Geraet ueber den Kanaelen. */
    var p2 = p.slice(0, p.lastIndexOf('.'));
    if (p2.split('.').length > 2) { da[p2] = true; }
  });
  quellenCache = Object.keys(da).sort();
  quellenStand = S.keysSorted.length;
  return quellenCache;
}

/* Der Auswahlbaum im Tauschdialog.

   Eine flache Trefferliste war der falsche Weg: Wer eine Quelle sucht,
   ist die Baumstruktur von links gewohnt (Ricardo, 25.08.2026). Gebaut
   wird er hier eigens und nicht mit `zeichneBaum` - der zeichnet fest in
   `#tree`, hängt an `S.baumModus` und ruft beim Klick `waehle()`. Ein
   zweiter Baum mit eigenem Klappzustand und eigenem Klickziel ist
   einfacher als diesen für zwei Aufgaben umzubauen.

   Gezeigt wird nur, was als Quelle taugt: die Eltern von Datenpunkten
   (quellenListe) und die Ebenen darüber als Wegweiser. */

var tOffen = {};

function baumDaten(filter) {
  var liste = quellenListe();
  var such = String(filter || '').trim().toLowerCase();
  if (such) {
    liste = liste.filter(function (id) {
      if (id.toLowerCase().indexOf(such) > -1) { return true; }
      var o = S.objects[id];
      var n = txt(o && o.common && o.common.name) || '';
      return n.toLowerCase().indexOf(such) > -1;
    });
  }
  /* Verschachtelte Karte aus den Kennungen. `_w` merkt sich, ob dieser
     Knoten selbst als Quelle taugt. */
  var wurzel = { kinder: {}, _w: false };
  liste.forEach(function (id) {
    var teile = id.split('.');
    var k = wurzel, pfad = '';
    for (var i = 0; i < teile.length; i++) {
      pfad = pfad ? pfad + '.' + teile[i] : teile[i];
      /* Instanz (adapter.0) als eine Zeile, nicht als zwei. */
      if (i === 0 && teile.length > 1 && /^\d+$/.test(teile[1])) {
        pfad = teile[0] + '.' + teile[1];
        i++;
      }
      if (!k.kinder[pfad]) { k.kinder[pfad] = { kinder: {}, _w: false, id: pfad }; }
      k = k.kinder[pfad];
    }
    k._w = true;
  });
  return wurzel;
}

function zeichneAuswahlbaum(host, filter, beiWahl) {
  host.textContent = '';
  var wurzel = baumDaten(filter);
  var such = String(filter || '').trim().length > 1;

  var male = function (knoten, tiefe, behaelter) {
    Object.keys(knoten.kinder).sort().forEach(function (pfad) {
      var k = knoten.kinder[pfad];
      var kinderNamen = Object.keys(k.kinder);
      var hatKinder = kinderNamen.length > 0;
      /* Bei einer Suche steht alles offen, sonst der gemerkte Zustand. */
      var auf = such ? true : !!tOffen[k.id];
      var zeile = el('div', 'node' + (k._w ? ' pick' : ' grp')
        + (S.tauschNeu === k.id ? ' sel' : ''));
      zeile.style.paddingLeft = (6 + tiefe * 13) + 'px';
      var tw = el('span', 'tw', hatKinder ? (auf ? '▾' : '▸') : '');
      if (hatKinder) {
        tw.addEventListener('click', function (ev) {
          ev.stopPropagation();
          tOffen[k.id] = !auf;
          zeichneAuswahlbaum(host, filter, beiWahl);
        });
      }
      zeile.appendChild(tw);
      /* Die Instanz steht als eine Zeile (`hm-rpc.0`), sonst waere die
         oberste Ebene eine Reihe von Nullen. */
      var teileK = k.id.split('.');
      var kurz = (teileK.length === 2) ? k.id : teileK[teileK.length - 1];
      zeile.appendChild(el('span', 'nm', kurz));
      var o = S.objects[k.id];
      var name = txt(o && o.common && o.common.name) || '';
      if (name && name !== kurz) { zeile.appendChild(el('span', 'zusatz', name)); }
      if (k._w) {
        var n = kindZustaende(k.id).length;
        if (n) { zeile.appendChild(el('span', 'cnt', String(n))); }
        zeile.addEventListener('click', function () { beiWahl(k.id); });
      }
      behaelter.appendChild(zeile);
      if (hatKinder && auf) { male(k, tiefe + 1, behaelter); }
    });
  };
  male(wurzel, 0, host);
  if (!host.childNodes.length) {
    host.appendChild(el('div', 'empty', tr('swap.noDevice')));
  }

  /* Die Liste bleibt stehen, wo sie stand.

     Beim Aufklappen fiel das nicht auf: derselbe Behaelter, nur neu
     gefuellt, und `scrollTop` ueberlebt das. Beim WAEHLEN schon -
     `zeichneTausch` baut den ganzen Dialog neu, der Baum ist danach ein
     anderes Element und faengt bei 0 an. Wer weit unten ein Geraet
     anklickte, sah danach den Anfang der Liste und seinen eben
     gewaehlten Eintrag gar nicht mehr (Ricardo, 12.09.2026, an einer
     Liste mit 42 Zeilen: scrollTop 700 -> 0).

     Gemerkt wird an `S`, nicht am Element: das Element gibt es beim
     naechsten Zeichnen nicht mehr. `block: 'nearest'` schiebt nur, wenn
     die Zeile wirklich draussen ist - sonst springt die Liste bei jedem
     Klick ein Stueck, und das waere die naechste Unruhe. */
  if (S.tauschScroll) { host.scrollTop = S.tauschScroll; }
  var gewaehlteZeile = host.querySelector('.node.sel');
  if (gewaehlteZeile) { gewaehlteZeile.scrollIntoView({ block: 'nearest' }); }
  host.addEventListener('scroll', function () { S.tauschScroll = host.scrollTop; });
}

export function zeigeTausch() {
  /* Wie bei zeigeVerlegen und zeigeLoeschen: an der Quelle ist
     S.current die Quelle, gemeint ist das Ziel des Entwurfs (T1). */
  var ziel = (S.entwurf && (S.entwurf.ziel || S.entwurf.kanal)) || S.current;
  if (!ziel || ziel.indexOf('alias.') !== 0 || !knotenDa(ziel)) { return; }
  S.tauschZiel = ziel;
  S.tauschNeu = '';
  S.tauschWeg = {};
  S.tauschPlan = null;
  S.tauschMerkung = null;
  S.tauschWerte = null;
  S.tauschHand = {};
  S.tauschEinheit = {};
  /* Auch die Suche faengt neu an. Sie blieb sonst stehen, und beim
     naechsten Oeffnen zeigte der Baum „Kein Geraet gefunden" — im
     schlimmsten Fall genau dann, wenn im Feld noch das eben getauschte,
     inzwischen geloeschte Geraet stand (W13, gemessen 26.08.2026). */
  S.tauschFilter = '';
  /* Und die Liste faengt oben an - sonst startet der naechste Tausch
     dort, wo der letzte aufgehoert hat. */
  S.tauschScroll = 0;
  var b = $('#btn-swap-go');
  if (b) { b.hidden = false; b.textContent = tr('swap.now'); }
  zeichneTausch();
  var d = $('#dlg-swap');
  if (d && !d.open) { d.showModal(); }
}

function zeichneTausch() {
  var body = $('#swap-body');
  if (!body) { return; }
  body.textContent = '';
  var kanal = S.tauschZiel;
  var alt = alteQuelle(kanal);

  /* Woher es heute liest - und ob es das noch gibt. */
  var kopf = el('div', 'aside w');
  kopf.style.marginBottom = '11px';
  var z1 = el('div');
  z1.appendChild(el('b', null, tr('swap.from') + ' '));
  z1.appendChild(el('span', 'sn', alt || tr('swap.unknown')));
  /* Den Namen dahinter, wo er mehr sagt als die Kennung.

     `hm-rpc.0.0000DBE9A2B8AF` sagt einem nichts; woran man das Geraet
     erkennt, steht allein im Namen (Ricardo, 06.09.2026). Dieselbe Regel
     wie im Baum: gleicht der Name dem letzten Stueck der Kennung, bringt
     er nichts und bleibt weg.

     Ist das Geraet weg — der Normalfall bei „Geraet kaputt" —, gibt es
     kein Objekt und damit keinen Namen mehr. Dann steht dort wie bisher
     nur die Kennung, und die Zeile darunter sagt, dass es sie nicht mehr
     gibt. */
  var altObj = alt && S.objects[alt];
  var altName = altObj ? txt(altObj.common && altObj.common.name).trim() : '';
  if (altName && altName !== String(alt).split('.').pop()) {
    z1.appendChild(el('span', 'leise', ' ' + altName));
  }
  kopf.appendChild(z1);
  if (alt && !S.objects[alt] && !kindZustaende(alt).length) {
    kopf.appendChild(el('div', 'hint', tr('swap.gone')));
  }
  body.appendChild(kopf);

  /* Das neue Geraet: Filter und darunter der Baum - dieselbe Bedienung
     wie links, statt einer flachen Trefferliste (Ricardo, 25.08.2026). */
  var lab = el('label', 'feld');
  lab.appendChild(el('span', 'feldlabel', tr('swap.to')));
  var feld = el('input', 'tx w');
  feld.type = 'text';
  feld.value = S.tauschFilter || '';
  feld.placeholder = tr('swap.search');
  lab.appendChild(feld);
  body.appendChild(lab);

  var baumHost = el('div', 'tree tauschbaum');
  body.appendChild(baumHost);

  var gewaehlt = function (id) {
    S.tauschNeu = id;
    S.tauschPlan = null;
    S.tauschWeg = {};
    S.tauschWerte = null;
  S.tauschHand = {};
  S.tauschEinheit = {};
    /* Andere Quelle, andere Frage: ob die gemerkte Vorlage passt, haengt
       am Ziel. Die Vorgabe wird in `zeichneTausch` neu gesetzt. */
    S.tauschMerkung = null;
    zeichneTausch();
  };
  zeichneAuswahlbaum(baumHost, S.tauschFilter, gewaehlt);
  feld.addEventListener('input', function () {
    S.tauschFilter = feld.value;
    /* Andere Suche, andere Liste - die alte Scrollhoehe passt nicht mehr
       und zeigte sonst ins Leere. */
    S.tauschScroll = 0;
    baumHost.scrollTop = 0;
    zeichneAuswahlbaum(baumHost, S.tauschFilter, gewaehlt);
  });

  var go = $('#btn-swap-go');
  /* Der Knopf bleibt ueber das Neuzeichnen hinweg dasselbe Element.
     Wer ihn sperrt, setzt deshalb auch den Grund — sonst traegt er den
     des vorher gewaehlten Geraets weiter („Erst entscheiden — LOWBAT,
     UNREACH, WORKING …" an der bisherigen Quelle; Lauf vom 19.09.2026,
     W10). */
  if (!S.tauschNeu) {
    if (go) { go.disabled = true; go.title = tr('swap.pickFirst'); }
    return;
  }
  if (S.tauschNeu === alt) {
    body.appendChild(el('div', 'aside w', tr('swap.same')));
    if (go) { go.disabled = true; go.title = tr('swap.same'); }
    return;
  }

  /* Erst die Werte des neuen Geraets, dann die Zuordnung.

     Stufe 5 fragt dieselbe Erkennung wie der Baum, und die schaut bei
     einem Tasmota in den Rohwert von `tele.SENSOR` hinein: ohne Werte
     faellt die Vorlage durch, und der Tausch zu einem MQTT-Geraet faende
     wieder nichts. Einmal je Ziel - `S.tauschWerte` merkt, welches
     schon geholt ist. */
  if (S.tauschWerte !== S.tauschNeu) {
    var zielPunkte = kindZustaende(S.tauschNeu);
    var fehlt = zielPunkte.some(function (id) { return S.werte[id] === undefined; });
    if (fehlt) {
      S.tauschWerte = S.tauschNeu;
      holeWerte(S.tauschNeu, zielPunkte, function () {
        /* Noch im selben Dialog und am selben Ziel? Sonst ist das
           Ergebnis von gestern. */
        if (S.tauschNeu !== S.tauschWerte) { return; }
        S.tauschPlan = null;
        zeichneTausch();
      });
      body.appendChild(el('div', 'aside w', tr('swap.loadingValues')));
      return;
    }
    S.tauschWerte = S.tauschNeu;
  }

  /* Die Zuordnung, Zeile fuer Zeile. */
  if (!S.tauschPlan) { S.tauschPlan = tauschPlan(kanal, S.tauschNeu); }
  var plan = S.tauschPlan;

  /* Steht die Wahl eine Ebene zu tief?

     Der Baum laesst jeden Knoten waehlen, unter dem Datenpunkte haengen -
     absichtlich, denn welche Ebene beim fremden Adapter das Geraet ist,
     kann die Werkbank nicht wissen; bei einem flachen Adapter ist der
     Kanal die richtige (Kommentar in `tauschPlan`). Bei MQTT sind
     `stat`, `tele` und `cmnd` aber Themenordner, keine Geraete, und wer
     dort landet, bekommt schlechtere Treffer: am RGB-Deckenlicht fanden
     ueber das Geraet alle sieben Punkte ein Ziel, ueber `…Licht.tele`
     nur fuenf - die beiden aus `stat` gar nichts (12.09.2026).

     Verboten wird nichts. Aber die Werkbank kann nachrechnen, was eine
     Ebene hoeher herauskaeme, und es sagen - sonst hakt man zwei Punkte
     zum Entfernen an und opfert seinen Schalter, statt den Knoten
     darueber zu nehmen (Ricardos Frage, 12.09.2026). */
  var eltern = S.tauschNeu.split('.').slice(0, -1).join('.');
  /* Nur eine Hilfestellung - lieber zu selten als zu oft (Ricardo,
     19.09.2026). Deshalb zwei Bedingungen, die beide halten muessen:

     1. Die Wahl ist ein Blatt: alle Datenpunkte darunter haengen direkt
        an ihr, es gibt keine Unterordner. Das trifft `…Licht.tele`,
        `…stat`, `…cmnd` und den Homematic-Kanal `1` - genau die Faelle,
        in denen die Ebene darueber das Geraet ist. Ein Geraet mit
        Unterordnern ist selbst schon die richtige Ebene; darueber liegt
        ein Ordner voller anderer Geraete, und der findet fast immer
        irgendwo passende Namen. Gemessen 19.09.2026: ueber `PC_Jonas`
        fand `mqtt-client.0.SmartHome` 7 von 7 - beim 3D-Drucker, am
        Bastelzimmer_Licht und am RGB-Deckenlicht (W24).
     2. Die bisherige Quelle liegt nicht darunter. Sonst zaehlt die Ebene
        darueber deren eigene Punkte mit: `mqtt.Steckdose` gegen das
        Nachbargeraet `mqtt.Stumm` ergab „7 von 7, hier nur 2", und die 7
        waren die der alten Steckdose (Lauf vom 19.09.2026). */
  var pre = S.tauschNeu + '.';
  var istBlatt = kindZustaende(S.tauschNeu).every(function (id) {
    return id.indexOf(pre) === 0 && id.slice(pre.length).indexOf('.') === -1;
  });
  var altDarunter = !!alt && (alt === eltern || alt.indexOf(eltern + '.') === 0);
  if (eltern.split('.').length > 2 && S.tauschNeu !== alt && istBlatt && !altDarunter) {
    var trefferHier = plan.filter(function (z) { return z.neuR; }).length;
    var planOben = tauschPlan(kanal, eltern);
    var trefferOben = planOben.filter(function (z) { return z.neuR; }).length;
    if (trefferOben > trefferHier) {
      var eb = el('div', 'aside w');
      eb.style.borderLeftColor = 'var(--warn)';
      eb.appendChild(el('b', null, tr('swap.higherLevel',
        eltern, trefferOben, plan.length, trefferHier)));
      var knopf = el('button', 'btn mini wichtig', tr('swap.goHigher'));
      knopf.style.marginTop = '5px';
      knopf.addEventListener('click', function () { gewaehlt(eltern); });
      eb.appendChild(el('div', null, ''));
      eb.appendChild(knopf);
      body.appendChild(eb);
    }
  }
  var k = el('div', 'card');
  k.style.marginTop = '11px';
  var ch = el('div', 'ch');
  ch.appendChild(el('span', 'typ', tr('swap.mapping')));
  var ohne = plan.filter(function (z) { return !z.neuR; }).length;
  ch.appendChild(el('span', 'chip ok', String(plan.length - ohne)));
  if (ohne) { ch.appendChild(el('span', 'chip bad', String(ohne))); }
  k.appendChild(ch);

  plan.forEach(function (z) {
    var r = el('div', 'slot');
    r.style.gridTemplateColumns = '120px 1fr';
    /* Trifft der Vorschlag genau das, was schon dasteht, aendert sich an
       dieser Zeile nichts - dann waere „vermutet" irrefuehrend
       (Ricardo, 25.08.2026). */
    /* Bei einer einfachen Quelle (ein Punkt fuer Lesen und Schreiben)
       fuehrt der Plan `altW` leer und `neuW` gefuellt - geschrieben wird
       am Ende aber in beiden Faellen nur `alias.id = <Punkt>`. Wer die
       beiden trotzdem vergleicht, findet immer einen Unterschied, und die
       Zeile bekam nie „unveraendert", obwohl sich nichts aendert
       (gemessen 26.08.2026 am Dimmer-Alias, dessen ACTUAL schon auf die
       neue Quelle zeigte). */
    var gleich = z.neuR && z.neuR === z.altR
                 && (z.einfach || (z.neuW || '') === (z.altW || ''));
    /* Der Name und seine Marke untereinander, nicht nebeneinander: Die
       Namensspalte ist 120 Pixel breit, und „ERKANNT" hinter einem
       langen Namen wie `ELECTRIC_POWER` lief in die Pfade der Nachbarn
       hinein (Ricardo, 13.10.2026, am Bild zu sehen). Eine Zeile ist
       hier ohnehin immer mindestens zweizeilig. */
    var nm = el('span', 'sn zuname', z.name);
    if (gleich) { nm.appendChild(el('span', 'rat', tr('swap.unchanged'))); }
    else if (z.stufe === 3) {
      /* Die Marke sagt jetzt auch, WORUEBER geraten wurde - ueber den
         blossen Punktnamen oder ueber die Rolle. Das sind zwei sehr
         verschiedene Vermutungen, und sie pruefen sich verschieden. */
      var rm = el('span', 'rat', tr('guess.mark'));
      rm.title = z.geratenUeber === 'aliasRolle'
        ? tr('swap.guessedByAliasRole', z.geratenRolle || '?')
        : z.geratenUeber === 'rolle'
          ? tr('swap.guessedByRole', z.geratenRolle || '?')
          : tr('swap.guessedByName', (z.altR || '').split('.').pop());
      nm.appendChild(rm);
    } else if (z.stufe === 6) {
      var hm2 = el('span', 'rat', tr('swap.byHandMark'));
      hm2.title = tr('swap.byHandHint');
      nm.appendChild(hm2);
    } else if (z.stufe === 5) {
      /* Woher die Zuordnung kommt - aus der Vorlage des neuen Geraets
         oder aus seinen Rollen. Das ist dieselbe Auskunft, die der
         Reiter beim Anklicken gibt, und sie gehoert hierher: wer
         zurueck auf einen Tasmota tauscht, soll sehen, dass die
         Tasmota-Vorlage dahintersteht. */
      var zh = el('span', 'herk', z.zielHer === 'vorlage'
        ? tr('swap.fromTplMark') : tr('swap.fromDetectMark'));
      zh.title = z.zielHer === 'vorlage'
        ? tr('swap.fromTpl', z.zielWas || '?')
        : tr('swap.fromDetect', z.zielWas || '?');
      nm.appendChild(zh);
    } else if (z.stufe === 4) {
      /* Kein „vermutet", aber auch kein stiller Treffer: dass die
         Zuordnung vom Alias-Punkt kommt und nicht vom Pfad, erklaert,
         warum ein Tausch zwischen zwei ganz verschiedenen Adaptern
         ueberhaupt aufgeht - und woran er haengt, wenn er danebenliegt. */
      var hm = el('span', 'herk', tr('swap.fromAliasMark'));
      hm.title = tr('swap.fromAlias', z.name.split('.').pop(), z.ausAlias || '?');
      nm.appendChild(hm);
    }
    r.appendChild(nm);
    var rechts = el('span');
    /* Das Kaestchen „entfernen" - an zwei Stellen gebraucht, deshalb hier.

       Es gab es bisher nur, wenn GAR NICHTS gefunden wurde. Der zweite
       Fall braucht es genauso: Lesequelle gefunden, Schreibziel nicht.
       Ein Punkt mit Schreibrecht ohne Schreibziel laesst sich in ioBroker
       nicht ausdruecken - jede Form, die der js-controller annimmt,
       schreibt irgendwohin, und `{read: X}` ohne `write` lehnt er ab
       („The id is empty", gemessen 12.09.2026). Also entscheidet der
       Nutzer: mitnehmen geht nicht, entfernen schon (Ricardo). */
    var entfernenKaestchen = function () {
      var lb = document.createElement('label');
      lb.style.display = 'flex';
      lb.style.gap = '6px';
      lb.style.alignItems = 'center';
      lb.style.marginTop = '3px';
      lb.style.cursor = 'pointer';
      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = !!S.tauschWeg[z.id];
      cb.addEventListener('change', function () {
        S.tauschWeg[z.id] = cb.checked;
        /* Der Knopf haengt daran - also neu rechnen, nicht erst beim
           naechsten Oeffnen. `zeichneTausch`, nicht `zeigeTausch`: das
           zweite setzt Auswahl, Plan und Haken zurueck und faengt von
           vorn an. */
        zeichneTausch();
      });
      lb.appendChild(cb);
      lb.appendChild(el('span', 'hint', tr('swap.removeIt')));
      return lb;
    };
    /* Einen Punkt des neuen Geraets von Hand benennen.

       Die Liste zeigt die relativen Namen - `1.STATE`, `tele.SENSOR` -,
       weil der volle Pfad an jeder Zeile gleich anfaengt und nur Platz
       kostet. Sortiert wie im Baum. */
    var handAuswahl = function (zeile) {
      var huelle = el('div');
      huelle.style.marginTop = '4px';
      var vor = S.tauschNeu + '.';
      var sel = document.createElement('select');
      sel.className = 'tx';
      sel.style.maxWidth = '100%';
      var leer = document.createElement('option');
      leer.value = '';
      leer.textContent = tr('swap.pickByHand');
      sel.appendChild(leer);
      kindZustaende(S.tauschNeu).forEach(function (pid) {
        var o = document.createElement('option');
        o.value = pid;
        var c = (S.objects[pid] || {}).common || {};
        o.textContent = pid.slice(vor.length) + (c.role ? '  ·  ' + c.role : '') +
          (c.unit ? '  ·  ' + c.unit : '');
        if ((S.tauschHand || {})[zeile.id] === pid) { o.selected = true; }
        sel.appendChild(o);
      });
      sel.addEventListener('change', function () {
        S.tauschHand = S.tauschHand || {};
        if (sel.value) { S.tauschHand[zeile.id] = sel.value; }
        else { delete S.tauschHand[zeile.id]; }
        S.tauschPlan = null;
        zeichneTausch();
      });
      huelle.appendChild(sel);
      return huelle;
    };

    /* Wechselt die Einheit, stehen beide Werte nebeneinander und man
       waehlt, was damit geschehen soll. Vorbelegt ist „nichts aendern" -
       empfohlen wird, aber nicht entschieden. */
    /* Ein Kuerzel neben dem Feld: „so waere es, wenn du der Beschriftung
       glaubst". Ein Klick setzt es ein - entschieden ist damit nichts,
       und genau deshalb steht es neben dem Feld und nicht darin. */
    var vorschlagKnopf = function (feld, wert, danach, beschriftung) {
      var b = el('button', 'btn klein', beschriftung || wert);
      b.title = tr('swap.suggestionHint');
      b.addEventListener('click', function (ev) {
        ev.preventDefault();
        feld.value = wert;
        danach();
      });
      return b;
    };

    /* Einheit und Faktor - beide frei, beide auf dem Ist-Zustand.

       Die erste Fassung bot drei feste Knoepfe: nichts, Einheit des
       Ziels uebernehmen, mit dem bekannten Faktor rechnen. Das greift
       zu kurz, sobald das Ziel GAR KEINE Einheit traegt - und das ist
       kein Randfall, sondern der Normalfall bei einem JSON-Sammelpunkt.
       `tele.SENSOR` hat keine Einheit; die steckt im Feld, nicht im
       Objekt: `ENERGY.Total` IST kWh, `CONSUMPTION` bei Matter IST Wh.
       Dass ioBroker das nicht weiss, macht den Wechsel nicht kleiner -
       er wird dadurch unsichtbar (Ricardo, 13.10.2026).

       Also zwei Felder statt Knoepfe. Wer nichts anfasst, aendert
       nichts; was die Werkbank weiss, steht als Vorschlag daneben. Das
       deckt auch den Fall ab, in dem die Beschriftung LUEGT: Matter
       schreibt an `CURRENT` die Einheit mA und liefert Ampere, der
       angebotene Faktor waere also falsch - und die beiden Werte
       darueber zeigen es. */
    var einheitenWahl = function (zeile) {
      if (!zeile.neuR) { return document.createDocumentFragment(); }
      var altO = S.objects[zeile.id] || {}, neuO = S.objects[zeile.neuR] || {};
      var altE = ((altO.common || {}).unit || '').trim();
      var neuE = ((neuO.common || {}).unit || '').trim();

      /* Verglichen werden die beiden QUELLEN, nicht der Alias mit dem
         Ziel.

         Vorher stand hier `altE === neuE` mit der Einheit des ALIAS auf
         der einen Seite - und damit erschien der Kasten auch beim Tausch
         zwischen zwei gleichartigen Geraeten: Ein Alias in kWh, der aus
         `…PC_Bastelzimmer.tele.SENSOR` liest, sollte auf
         `…PC_Jonas.tele.SENSOR` umziehen. Beide JSON-Punkte tragen keine
         Einheit, es aendert sich also nichts - trotzdem stand da
         „am Alias kWh · neue Quelle: keine" samt Feldern und dem Hinweis
         auf die Aufzeichnung (Ricardo, 14.10.2026).

         Mit dem Vergleich der Quellen verschwindet das von selbst, ohne
         Sonderregel fuer „identisches Geraet": Liefert die neue Quelle
         dasselbe wie die alte, gibt es nichts zu entscheiden. */
      var quellE = '';
      var altQ = zeile.altR && S.objects[zeile.altR];
      if (altQ) { quellE = ((altQ.common || {}).unit || '').trim(); }
      else { quellE = altE; }        /* Quelle weg (W13): dann der Alias */
      if (quellE === neuE) { return document.createDocumentFragment(); }

      S.tauschEinheit = S.tauschEinheit || {};
      var stand = S.tauschEinheit[zeile.id] || {};

      var huelle = el('div');
      huelle.style.marginTop = '5px';
      huelle.style.paddingLeft = '8px';
      huelle.style.borderLeft = '2px solid var(--warn)';
      huelle.appendChild(el('div', 'hint',
        tr('swap.unitChanged', altE || tr('swap.unitNone'), neuE || tr('swap.unitNone'))));

      /* Die beiden Werte - der eigentliche Punkt. Was der Alias heute
         zeigt und was nach dem Tausch dastuende. Beim Rohwert eines
         JSON-Punktes waere die ganze Nachricht unlesbar, deshalb wird
         er durch die neue Formel gereicht. */
      var wertVon = function (id) {
        var w = S.werte[id];
        if (!w || w.val === undefined || w.val === null) { return null; }
        return w.val;
      };
      var wRoh = wertVon(zeile.neuR), wAlt = wertVon(zeile.id);
      if (wAlt !== null) {
        huelle.appendChild(el('div', 'hint',
          tr('swap.unitValOld', String(wAlt), altE || '')));
      }

      var ergebnisZeile = el('div', 'sn');
      ergebnisZeile.style.marginTop = '3px';

      var feldZeile = function (beschriftung, feld, knopf) {
        var zz = el('div');
        zz.style.display = 'flex';
        zz.style.gap = '6px';
        zz.style.alignItems = 'center';
        zz.style.marginTop = '4px';
        zz.appendChild(el('span', 'rx', beschriftung));
        zz.appendChild(feld);
        if (knopf) { zz.appendChild(knopf); }
        return zz;
      };

      var eFeld = document.createElement('input');
      eFeld.className = 'tx';
      eFeld.type = 'text';
      eFeld.style.width = '90px';
      eFeld.value = (stand.unit !== undefined) ? stand.unit : altE;
      var fFeld = document.createElement('input');
      fFeld.className = 'tx';
      fFeld.type = 'text';
      fFeld.style.width = '90px';
      fFeld.value = (stand.faktor !== undefined) ? String(stand.faktor) : '1';

      /* Nur rechnen und die eine Zeile neu schreiben - NICHT den Dialog
         neu zeichnen. Sonst springt der Fokus bei jedem Anschlag aus dem
         Feld, und tippen wird unmoeglich. */
      var frisch = function () {
        var e = eFeld.value.trim();
        var f = fFeld.value.trim();
        S.tauschEinheit[zeile.id] = {
          unit: (e === altE) ? undefined : e,
          faktor: (f === '' || f === '1') ? undefined : f
        };
        S.tauschPlan = null;
        ergebnisZeile.textContent = '';
        var neuPlan = tauschPlan(kanal, S.tauschNeu);
        S.tauschPlan = neuPlan;
        var zz = neuPlan.find(function (x) { return x.id === zeile.id; }) || zeile;
        var fz = endFormel(zz);
        var txtE = (e !== '') ? e : '';
        if (wRoh === null) {
          ergebnisZeile.textContent = tr('swap.unitResult', '—', txtE);
          return;
        }
        var r = auswerten(fz, wRoh);
        ergebnisZeile.textContent = tr('swap.unitResult',
          r.ok ? String(r.val) : (r.txt || '—'), txtE);
        formelNach(fz);
      };
      /* Die Formelzeile derselben Reihe nachziehen. Sie steht ausserhalb
         dieses Kastens, gehoert aber zur selben Entscheidung - bliebe
         sie stehen, zeigte sie eine Formel, die so nicht geschrieben
         wird. Genau der Fehler, den Ricardo vorhin an der Pfeilzeile
         gefunden hat, nur eine Ebene weiter. */
      var formelNach = function (fz) {
        var reihe = huelle.closest ? huelle.closest('.slot') : null;
        var ziel = reihe && reihe.querySelector('.formel-neu span:last-child');
        if (ziel) { ziel.textContent = fz || tr('swap.formulaNone'); }
      };
      eFeld.addEventListener('input', frisch);
      fFeld.addEventListener('input', frisch);

      huelle.appendChild(feldZeile(tr('swap.unitField'), eFeld,
        neuE ? vorschlagKnopf(eFeld, neuE, frisch) : null));
      var faktor = umrechenFaktor(altE, neuE);
      huelle.appendChild(feldZeile(tr('swap.factorField'), fFeld,
        faktor ? vorschlagKnopf(fFeld, String(faktor), frisch, faktorText(faktor)) : null));
      if (!faktor && altE && neuE) {
        huelle.appendChild(el('div', 'hint', tr('swap.unitNoFactor')));
      }
      huelle.appendChild(ergebnisZeile);
      /* Haengt eine Aufzeichnung dran, gehoert der Hinweis dazu - die
         Historie liegt in der alten Einheit. */
      if (altO.common && altO.common.custom && Object.keys(altO.common.custom).length) {
        huelle.appendChild(el('div', 'hint', tr('swap.unitHistWarn')));
      }
      frisch();
      return huelle;
    };

    /* Beschriftet, sonst raet man, welche der beiden Zeilen die neue ist. */
    var paarZeile = function (beschriftung, text, klasse, farbe) {
      var zz = el('div');
      zz.style.display = 'grid';
      zz.style.gridTemplateColumns = '52px 1fr';
      zz.style.alignItems = 'baseline';
      zz.appendChild(el('span', 'rx', beschriftung));
      var w = el('span', klasse, text);
      if (farbe) { w.style.color = farbe; }
      zz.appendChild(w);
      return zz;
    };
    rechts.appendChild(paarZeile(tr('write.diffOld'),
      z.altR + (z.altW && z.altW !== z.altR ? '  →  ' + z.altW : ''), 'zq'));
    if (z.neuR) {
      rechts.appendChild(paarZeile(tr('write.diffNew'),
        z.neuR + (z.neuW && z.neuW !== z.neuR ? '  →  ' + z.neuW : ''),
        'sn', gleich ? 'var(--ink-3)' : 'var(--ok)'));
      /* Von Hand benannt heisst: die Werkbank weiss nichts ueber diesen
         Punkt. Formel, Einheit und Wertebereich bleiben, wie sie am
         Alias stehen - und passen vielleicht nicht mehr. */
      if (z.vonHand) {
        var hw = el('div', 'hint');
        hw.style.color = 'var(--warn)';
        hw.textContent = tr('swap.byHandCheck');
        rechts.appendChild(hw);
        rechts.appendChild(handAuswahl(z));
      }
      /* Lesequelle gefunden, Schreibquelle nicht — das gehoert gesagt.
         Sonst steht nur die neue Lesequelle in Gruen da, und dass der
         Punkt danach nirgendwohin schreibt, merkt man erst am Geraet. */
      rechts.appendChild(einheitenWahl(z));
      /* Wechselt die Formel mit, gehoert das in die Zeile - sie
         entscheidet mit darueber, was am Alias ankommt, und man sieht es
         dem Pfad nicht an. */
      /* Was am Ende dasteht - einschliesslich einer gewaehlten
         Umrechnung. `endFormel` rechnet dasselbe wie `tauschObjekte`. */
      var altF = (S.objects[z.id] && S.objects[z.id].common &&
                  S.objects[z.id].common.alias || {}).read || '';
      var endF = endFormel(z);
      if (altF !== endF) {
        /* Beschriftet wie die Pfade darueber. Vorher stand dort nur ein
           Pfeil zwischen zwei Formeln, und man musste raten, welche die
           neue ist - Ricardo hat zweimal nachgefragt (13.10.2026). */
        var fb = el('div');
        fb.style.marginTop = '3px';
        fb.appendChild(el('div', 'rx', tr('swap.formula')));
        fb.appendChild(paarZeile(tr('write.diffOld'),
          altF || tr('swap.formulaNone'), 'zq'));
        var fneu = paarZeile(tr('write.diffNew'),
          endF || tr('swap.formulaNone'), 'sn');
        /* Markiert, damit die Einheitenfelder sie beim Tippen
           mitschreiben koennen - sie zeichnen den Dialog nicht neu. */
        fneu.classList.add('formel-neu');
        fb.appendChild(fneu);
        rechts.appendChild(fb);
      }
      if (z.altW && z.altW !== z.altR && !z.neuW) {
        var kw = el('div');
        kw.style.color = 'var(--bad)';
        kw.textContent = tr('swap.noWriteMatch');
        rechts.appendChild(kw);
        rechts.appendChild(entfernenKaestchen());
      }
    } else {
      var fehlt = el('div');
      fehlt.style.color = 'var(--bad)';
      fehlt.textContent = tr('swap.noMatch');
      rechts.appendChild(fehlt);
      /* Was nichts findet, laesst sich mit entfernen - sonst bliebe ein
         Punkt zurueck, der ins Leere zeigt (Ricardos Wahl, 25.08.2026). */
      rechts.appendChild(entfernenKaestchen());
      /* Oder von Hand benennen. Wer sein Geraet kennt, weiss oft genau,
         welcher Punkt gemeint ist - die Werkbank kann es nur nicht
         ableiten (Ricardo, 13.10.2026). */
      rechts.appendChild(handAuswahl(z));
    }
    r.appendChild(rechts);
    k.appendChild(r);
  });
  body.appendChild(k);

  /* --- Die gemerkte Vorlage, gegen die neue Quelle gehalten ---

     Nur wenn sie NICHT mehr passt. Beim baugleichen Ersatz steht hier
     nichts, und das ist der haeufigere Fall. */
  var merk = merkungPruefen(kanal, S.tauschNeu);
  if (merk && !merk.passt) {
    var stellen = merkungStellen(kanal);
    if (S.tauschMerkung === null || S.tauschMerkung === undefined) { S.tauschMerkung = true; }
    var mk = el('div', 'aside w');
    mk.style.borderLeftColor = 'var(--warn)';
    mk.appendChild(el('b', null, tr('swap.tplStale', merk.name)));
    (merk.fehler || []).forEach(function (f) { mk.appendChild(el('div', 'hint', f)); });
    /* Die Formeln sind der eigentliche Grund, warum das nicht still
       stehenbleiben darf - sie machen aus Messwerten ein `null`, ohne
       dass irgendwo ein Fehler steht. */
    if (stellen.formeln.length) {
      mk.appendChild(el('div', 'hint', tr('swap.tplFormulas', stellen.formeln.length)));
    }
    if (merk.ersatz) {
      mk.appendChild(el('div', 'hint', tr('swap.tplOther', merk.ersatz.name)));
    }
    var ml = document.createElement('label');
    ml.style.display = 'flex';
    ml.style.gap = '6px';
    ml.style.alignItems = 'center';
    ml.style.marginTop = '7px';
    ml.style.cursor = 'pointer';
    var mcb = document.createElement('input');
    mcb.type = 'checkbox';
    mcb.checked = !!S.tauschMerkung;
    mcb.addEventListener('change', function () { S.tauschMerkung = mcb.checked; zeichneTausch(); });
    ml.appendChild(mcb);
    ml.appendChild(el('span', null, tr('swap.tplDrop',
      stellen.punkte.length + (stellen.kanal ? 1 : 0))));
    mk.appendChild(ml);
    body.appendChild(mk);
  } else {
    S.tauschMerkung = false;
  }

  /* Wo die neue Quelle anders tickt als die alte. Die Formel des Alias
     bleibt beim Tausch stehen - rechnet die alte Quelle 0..100 und die
     neue 0..255, stimmt danach jeder Wert nicht mehr. Das sieht man dem
     Pfad nicht an, also steht es hier (Ricardos Szenario 8). */
  var stolper = [];
  plan.forEach(function (z) {
    if (!z.neuR) { return; }
    var a = S.objects[z.altR], b = S.objects[z.neuR];
    if (!a || !b || !a.common || !b.common) { return; }
    var ca = a.common, cb = b.common;
    var was = [];
    if (ca.type && cb.type && ca.type !== cb.type) {
      was.push(tr('swap.diffType', ca.type, cb.type));
    }
    if ((ca.min !== undefined || ca.max !== undefined ||
         cb.min !== undefined || cb.max !== undefined) &&
        (ca.min !== cb.min || ca.max !== cb.max)) {
      was.push(tr('swap.diffRange',
        (ca.min === undefined ? '?' : ca.min) + '..' + (ca.max === undefined ? '?' : ca.max),
        (cb.min === undefined ? '?' : cb.min) + '..' + (cb.max === undefined ? '?' : cb.max)));
    }
    if ((ca.unit || cb.unit) && ca.unit !== cb.unit) {
      was.push(tr('swap.diffUnit', ca.unit || '—', cb.unit || '—'));
    }
    if (was.length) { stolper.push(z.name + ': ' + was.join(', ')); }
  });
  if (stolper.length) {
    var sw = el('div', 'aside w');
    sw.style.borderLeftColor = 'var(--warn)';
    sw.appendChild(el('b', null, tr('swap.mind')));
    stolper.forEach(function (x) { sw.appendChild(el('div', 'hint', x)); });
    sw.appendChild(el('div', 'hint', tr('swap.mindHint')));
    body.appendChild(sw);
  }

  /* Was gleich bleibt - der eigentliche Grund fuer diesen Weg. */
  body.appendChild(el('div', 'aside w', tr('swap.keeps')));
  if (plan.some(function (z) { return z.stufe === 3; })) {
    body.appendChild(el('div', 'aside', tr('swap.guessHint')));
  }

  /* Punkte, die nicht mitkoennen, halten den Tausch auf - bis der Nutzer
     sagt, was mit ihnen geschehen soll.

     Zwei Faelle, beide mit demselben Ausgang (das Kaestchen daneben):
     gar kein Treffer, oder getrennte Quellen mit Lesetreffer und ohne
     Schreibziel. Frueher lief der Tausch in beiden Faellen los. Der
     zweite endete dabei im Fehler des js-controllers, und weil
     `tauscheAus` Objekt fuer Objekt schrieb, stand der Alias danach
     halb auf der alten und halb auf der neuen Quelle (W20, gemessen
     12.09.2026). Der erste lief still durch und liess den Punkt auf der
     alten Quelle stehen - derselbe Mischzustand, nur ohne Meldung.

     Gesperrt wird mit Begruendung am Knopf, nicht bloss grau: ein
     Knopf, der nicht sagt warum, ist der Fehler aus I32. */
  var offeneStolper = plan.filter(function (z) {
    if (S.tauschWeg[z.id]) { return false; }
    if (!z.neuR) { return true; }
    return !!(z.altW && z.altW !== z.altR && !z.neuW);
  });
  if (go) {
    if (offeneStolper.length) {
      go.disabled = true;
      go.title = tr('swap.blocked', offeneStolper.map(function (z) { return z.name; }).join(', '));
      var sp = el('div', 'aside w');
      sp.style.borderLeftColor = 'var(--bad)';
      sp.appendChild(el('b', null, go.title));
      body.appendChild(sp);
    } else {
      go.disabled = false;
      go.title = '';
    }
  }
}

export function tauscheAus() {
  var kanal = S.tauschZiel, neu = S.tauschNeu;
  if (!kanal || !neu || !S.tauschPlan) { return; }
  var b = $('#btn-swap-go');
  b.disabled = true;
  b.textContent = tr('write.writing');

  var arbeit = tauschObjekte(kanal, neu, S.tauschPlan, S.tauschWeg, !!S.tauschMerkung);
  var loeschen = Object.keys(S.tauschWeg).filter(function (id) { return S.tauschWeg[id]; });
  var fehler = [];

  var fertig = function () {
    var body = $('#swap-body');
    body.textContent = '';
    if (fehler.length) {
      body.appendChild(el('div', 'aside w', fehler.join(' | ')));
      b.disabled = false;
      b.textContent = tr('write.retry');
      return;
    }
    body.appendChild(el('div', 'aside w', tr('swap.done', neu)));
    b.hidden = true;
    holeZweig(neu, function () { waehle(kanal); zeichneErgebnis(); });
  };

  /* Der Kanal kommt zuletzt, und nur, wenn alles davor durchging.

     Er traegt `native.quelle`, und daraus liest der Dialog beim naechsten
     Oeffnen, was „heute" die Quelle ist (`alteQuelle`). Bis 19.09.2026
     ging er zusammen mit den Punkten hinaus, jeder fuer sich. Scheiterte
     ein Punkt, stand der Kanal trotzdem auf dem neuen Geraet: nach
     „Schliessen" nannte der Dialog ABC2 als heutige Quelle, obwohl SET
     noch aus ABC1 las, und ABC2 galt als „dieselbe Quelle wie bisher" —
     der Tausch liess sich nicht mehr zu Ende bringen (Lauf vom
     19.09.2026, W21). Jetzt bleibt der Kanal auf der alten Quelle, bis
     alle Punkte umgeschrieben und alle angehakten geloescht sind; ein
     neuer Tausch auf dasselbe Geraet holt dann nach, was fehlte. */
  var kanalArbeit = arbeit.filter(function (a) { return a.id === kanal; });
  arbeit = arbeit.filter(function (a) { return a.id !== kanal; });

  var kanalZuletzt = function () {
    if (fehler.length || !kanalArbeit.length) { return fertig(); }
    var a = kanalArbeit[0];
    socket.emit('setObject', a.id, a.obj, function (err) {
      if (err) { fehler.push(a.id + ': ' + err); }
      else { S.objects[a.id] = a.obj; }
      fertig();
    });
  };

  var weiter = function () {
    /* Schlug beim Umschreiben etwas fehl, wird nichts geloescht.

       Dieselbe Regel wie beim Verlegen (T11): erst alles Neue, und geht
       dabei etwas schief, bleibt der Rest unberuehrt. Hier fehlte sie -
       `weiter` loeschte auch dann, wenn die Haelfte der Punkte noch auf
       der alten Quelle stand. Zurueck kann die Werkbank nichts nehmen,
       aber sie kann aufhoeren, es schlimmer zu machen: der Nutzer sieht
       die Fehler und drueckt „Noch einmal versuchen", und die schon
       umgeschriebenen Punkte stoeren dabei nicht - sie stehen ja bereits
       richtig (12.09.2026). */
    if (fehler.length) { return fertig(); }
    if (!loeschen.length) { return kanalZuletzt(); }
    var offen2 = loeschen.length;
    loeschen.forEach(function (id) {
      socket.emit('delObject', id, function (err) {
        if (err) { fehler.push(id + ': ' + err); }
        else { delete S.objects[id]; }
        if (--offen2 === 0) { indexNeu(); kanalZuletzt(); }
      });
    });
  };

  var offen = arbeit.length;
  if (!offen) { return weiter(); }
  arbeit.forEach(function (a) {
    socket.emit('setObject', a.id, a.obj, function (err) {
      if (err) { fehler.push(a.id + ': ' + err); }
      else { S.objects[a.id] = a.obj; }
      if (--offen === 0) { weiter(); }
    });
  });
}
