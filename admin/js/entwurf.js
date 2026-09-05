/* Der Entwurf: aus einem Kanal wird das, was rechts steht - samt
   Auswahl (waehle), Navigation (springeZu) und der Frage, welcher Alias
   zu welcher Quelle gehoert. */

import { S } from './zustand.js';
import { socket } from './verbindung.js';
import { $ } from './basis.js';
import { txt } from './sprache.js';
import './enums.js';
import { zusatzName, setzeModus, zeichneBaum, merkeKlappstand } from './baum.js';
import { kindZustaende, aliasQuellen, holeWerte } from './werte.js';
import { erkenneEntwurf } from './erkennung.js';
import { vorschlag , pruefeVorlage } from './vorlagen.js';

import { zeichneErgebnis } from './ergebnis.js';

/* Der Name eines Kanals, wenn ihm jemand einen gegeben hat.

   `zusatzName` ist hier zu grosszuegig: hm-rpc benennt jeden Kanal
   schematisch `<Geraet>:<Nummer>` — `Licht_Bar_Esstisch:0`. Das weicht
   zwar von der Kennung `0` ab, sagt aber nichts, was nicht schon
   danebensteht. Ein eigener Name ist erst `Licht_Bar`. */
export function eigenerKanalName(id) {
  var n = zusatzName(id);
  if (!n) { return ''; }
  var nr = String(id).split('.').pop();
  return (n.slice(-(nr.length + 1)) === ':' + nr) ? '' : n;
}

/* Woran man im fertigen Alias erkennt, welcher Kanal gemeint ist.

   Die Kennung bleibt `1_STATE` — sie umzubenennen hiesse, bei jedem
   bestehenden Alias den Punkt zu loeschen und neu anzulegen, und jedes
   Widget und Skript, das darauf zeigt, liefe ins Leere. Die Beschriftung
   dagegen ist frei: sie landet in `common.name`, steht im Objektbrowser
   in der Spalte daneben und bricht nichts.

       1_STATE     Licht_Bar STATE
       2_STATE     Licht_Esstisch STATE

   Bei einem Geraet mit nur einem benannten Kanal — dem Normalfall —
   entsteht keine Beschriftung; dort gibt es nichts zu unterscheiden. */
export function kanalBeschriftung(kanal, kurzName) {
  var t = String(kurzName).split('.');
  if (t.length < 2) { return ''; }
  var kn = eigenerKanalName(kanal + '.' + t[0]);
  if (!kn) { return ''; }
  return kn + ' ' + t.slice(1).join(' ');
}

/* Haken-Schnappschuss fuer den Chip „Standard“: so standen sie, als
   der Entwurf entstand. Zeilen, die erst spaeter dazukommen (Alle-
   Ansicht, von Hand), haben keine Vorgabe und fallen auf „ab“. */
export function merkeHakenVorgabe(e) {
  if (e && e.states) { e.states.forEach(function (s) { s.onVorgabe = s.on; }); }
  return e;
}

export function baueEntwurf(kanal) {
  var istAlias = (kanal.indexOf('alias.') === 0);
  var e = { kanal: kanal, states: [], want: null, wantAuto: null, alleMuster: false };
  kindZustaende(kanal).forEach(function (id) {
    var o = S.objects[id], c = o.common || {}, a = c.alias || {}, q = aliasQuellen(o);
    var kurzName = id.slice(kanal.length + 1);
    e.states.push({
      /* Bei einer Quelle wird aus stat.POWER der Zustand stat_POWER —
         ein Punkt im Namen wuerde sonst eine Unterebene im Alias
         aufmachen statt eines Datenpunkts im Geraet. */
      n: istAlias ? kurzName : kurzName.replace(/\./g, '_'),
      urId: istAlias ? id : undefined,
      on: true,
      /* Die Rolle der Quelle uebernehmen, wenn es eine gibt.

         Frueher blieb sie im Quellenmodus leer — gedacht fuer Tasmota,
         wo `cmnd.POWER` schlicht „text" heisst und die richtige Rolle
         erst aus der Vorlage kommt. Adapter mit gepflegten Rollen
         bestraft das: hm-rpc liefert `level.temperature` fuer
         SET_POINT_TEMPERATURE und `value.temperature` fuer
         ACTUAL_TEMPERATURE, die Werkbank warf beides weg und meldete
         dann „keine Rolle" und „nichts erkannt". Typ und Einheit hat sie
         von jeher uebernommen; die Rolle auszunehmen war nicht zu
         begruenden. Ueberschreiben laesst sie sich weiterhin. */
      role: c.role || '',
      typ: c.type || '',
      unit: c.unit || '',
      /* Ohne die Werteliste bleibt jeder Platz mit statesDefined leer —
         EFFECT etwa. Die Werkbank meldete dann eine Luecke an einem
         Alias, den ihr eigener Detektor tadellos findet. */
      states: c.states || undefined,
      wr: !!c.write,
      /* Ohne common.alias ist der Punkt seine eigene Quelle. Vorher stand
         hier nichts und man musste jede Zeile von Hand zuweisen. */
      srcR: istAlias ? (q.read || '') : id,
      /* Steht in `common.alias.id` ein einzelner Text, gilt er fuer Lesen
         UND Schreiben - dann ist die Schreibquelle dieselbe wie die
         Lesequelle. Hier stand frueher eine leere Zeichenkette, gedacht
         als „muss man sich nicht extra merken". Der Schreibpfad leitet
         daraus aber `write: false` ab und laesst die Schreibformel weg:
         ein Aktualisieren machte aus einem schaltenden Punkt einen
         lesenden ohne Umrechnung (Ricardo, 25.08.2026, an
         alias.0.Badezimmer.Rollladen.CLOSE). Belegt ist das Schreiben
         durch `common.write` oder durch eine vorhandene Schreibformel -
         wer eine hinterlegt hat, wollte schreiben. */
      srcW: istAlias
        ? (q.einfach
            ? ((c.write === true || typeof a.write === 'string') ? (q.write || '') : '')
            : (q.write || ''))
        : (c.write ? id : ''),
      f: (typeof a.read === 'string') ? a.read : '',
      fw: (typeof a.write === 'string') ? a.write : '',
      caption: istAlias ? txt(c.name) : kanalBeschriftung(kanal, kurzName),
      manuell: false
    });
  });
  return merkeHakenVorgabe(e);
}


/* Alle Datenpunkte zeigen, ohne die Vorlage zu verlieren.

   Der Knopf tauschte den Vorlagen-Vorschlag frueher gegen einen
   Rohentwurf aus: alle Punkte da, aber Vorlage, Rollen und Haken weg.
   Wer nur nachsehen wollte, was das Geraet sonst noch hat, stand
   danach ohne Erkennung da und musste zurueckschalten.

   Jetzt liegt beides uebereinander. Grundlage bleibt der Vorschlag mit
   seinen Rollen, Namen und Haken; die Punkte, die er nicht kennt,
   kommen ungehakt dazu. Abgeglichen wird ueber die Quelle, nicht ueber
   den Namen: die Vorlage nennt einen Punkt SET, das Geraet nennt ihn
   1.STATE - derselbe Punkt, zwei Namen. */
/* `vorlagenId` nagelt die Vorlage fest, aus der ein vorhandener Alias
   entstanden ist - dieselbe Regel wie in `waehle`. Ohne sie durfte eine
   spaeter angelegte Vorlage beim Umschalten auf die Alle-Ansicht das
   fertige Geraet still uebernehmen (26.08.2026). */
export function alleUndVorlage(kanal, vorlagenId) {
  var v = vorschlag(kanal, vorlagenId);
  var roh = baueEntwurf(kanal);
  if (!v) { return roh; }

  var bekannt = {};
  (v.states || []).forEach(function (st) {
    if (st.srcR) { bekannt[st.srcR] = true; }
    if (st.srcW) { bekannt[st.srcW] = true; }
  });

  /* Das Rollenwissen der Vorlage: Punkte, die keine eigene Zeile
     tragen, aber eine gepflegte Rolle haben. Ohne das stand an den
     meisten Rohzeilen „keine Rolle" - hm-rpc laesst sie am Geraet
     schlicht leer (Ricardos Heizgruppen-Bild, 25.08.2026). Nur die
     Rohzeilen der Alle-Ansicht werden angereichert; an den sichtbaren
     Vorlagenzeilen und an der Erkennung aendert sich nichts. */
  var vq = null;
  S.VORLAGEN.forEach(function (x) { if (x.id === v.vorlage) { vq = x; } });
  var wissen = (vq && vq.weiterePunkte) || null;
  var wissenRolle = function (rel) {
    if (!wissen) { return ''; }
    if (wissen[rel]) { return wissen[rel]; }
    /* `*.NAME` gilt fuer jeden Kanal: die Wartungspunkte von Homematic
       heissen auf Kanal 0 wie auf Kanal 7 gleich, und welche Kanaele
       ein Geraet hat, weiss die Vorlage nicht. */
    var teile = rel.split('.');
    if (teile.length > 1) {
      var stern = '*.' + teile.slice(1).join('.');
      if (wissen[stern]) { return wissen[stern]; }
    }
    /* Mehrfach-Vorlagen fuehren %N% im Pfad. */
    var inst = v.instanz;
    if (inst !== undefined && inst !== null) {
      var raus = '';
      Object.keys(wissen).forEach(function (k) {
        if (raus || k.indexOf('%N%') === -1) { return; }
        if (k.split('%N%').join(String(inst)) === rel) { raus = wissen[k]; }
      });
      if (raus) { return raus; }
    }
    return '';
  };

  (roh.states || []).forEach(function (st) {
    if (st.srcR && bekannt[st.srcR]) { return; }
    var kopie = JSON.parse(JSON.stringify(st));
    kopie.on = false;
    if (kopie.srcR) {
      var wr = wissenRolle(kopie.srcR.slice(kanal.length + 1));
      if (wr) { kopie.role = wr; }
    }
    /* Nicht aus der Vorlage - beim Aktualisieren soll dieser Punkt
       nicht ihr zugeschrieben werden. `ausAnsicht` haelt fest, dass er
       nur deshalb in der Liste steht, weil gerade alle Datenpunkte
       gezeigt werden; die Abweichungskarte darf ihn dann nicht als
       „abgewaehlt" melden. */
    kopie.ausVorlage = undefined;
    kopie.ausAnsicht = true;
    v.states.push(kopie);
  });
  /* Der Schnappschuss aus baueEntwurf sagt „alles an“ - die Rohkopien
     haben ihn im Gepaeck. Der Standard-Chip soll aber den Zustand
     wiederherstellen, in dem DIESE Ansicht oeffnet: Vorlagenzeilen wie
     die Vorlage, Rohzeilen ab. Also hier neu stempeln. */
  return merkeHakenVorgabe(v);
}

/* Ein Knoten muss kein Objekt sein.

   MQTT legt fuer Zwischenebenen keine Objekte an: unter
   `mqtt-client.0.SmartHome.Bastelzimmer.Bastelzimmer_Decklenlicht_RGB`
   liegen Dutzende Datenpunkte, das Geraet selbst gibt es als Objekt
   aber nicht. Der Baum zeigt es trotzdem, weil er sich aus den
   Kennungen aufbaut. Wer hier auf `objects[...]` prueft, findet den
   halben Bestand nicht - und genau daran fiel der Sprung zur Quelle bei
   jedem Tasmota-Geraet aus. */
export function knotenDa(id) {
  if (!id) { return false; }
  if (S.objects[id]) { return true; }
  return kindZustaende(id).length > 0;
}

export function quelleVon(aliasId) {
  var o = S.objects[aliasId];
  var q = o && o.native && o.native.quelle;
  if (q && knotenDa(q)) { return q; }

  var kandidaten = {};
  kindZustaende(aliasId).forEach(function (id) {
    var qq = aliasQuellen(S.objects[id]);
    [qq.read, qq.write].forEach(function (x) {
      if (!x) { return; }
      var t = String(x).split('.');
      t.pop();
      var eltern = t.join('.');
      if (eltern) { kandidaten[eltern] = (kandidaten[eltern] || 0) + 1; }
    });
  });
  var beste = null, wieOft = 0;
  Object.keys(kandidaten).forEach(function (k) {
    if (kandidaten[k] > wieOft) { beste = k; wieOft = kandidaten[k]; }
  });
  /* Sitzen die Punkte in Unterkanaelen eines Geraets - bei Homematic der
     Normalfall, 0.LOWBAT neben 1.STATE -, liegt die eigentliche Quelle
     eine Ebene hoeher. */
  if (beste && !S.objects[beste]) {
    var t2 = beste.split('.'); t2.pop();
    var hoeher = t2.join('.');
    if (knotenDa(hoeher)) { return hoeher; }
  }
  if (beste && S.objects[beste] && S.objects[beste].type === 'channel') {
    var t3 = beste.split('.'); t3.pop();
    var dev = t3.join('.');
    if (S.objects[dev] && S.objects[dev].type === 'device') { return dev; }
  }
  return knotenDa(beste) ? beste : null;
}

/* Der Sprung selbst: Baummodus umstellen, Filter fallen lassen, waehlen.
   Ohne das Leeren des Filters landet man auf einem Knoten, den der
   Baum gerade ausblendet. */
export function springeZu(id, modus) {
  var q0 = $('#q');
  if (q0) { q0.value = ''; }
  if (S.baumModus !== modus) { setzeModus(modus); }
  waehle(id);
}

/* Was in `common` der Werkbank gehoert - und was nicht.

   Die Werkbank baut `common` beim Schreiben neu auf. Sie ist aber nur
   fuer die Felder zustaendig, die den Alias ausmachen. Alles andere hat
   jemand anderes dort abgelegt, und ein Aktualisieren hat es bisher
   mitgeloescht:

     custom      InfluxDB, History, SQL - die ganze Aufzeichnung
     smartName   Alexa, Google Home
     min, max, def, step
     desc, icon, color

   Am schwersten wiegt `custom`: Wer die Temperatur seines Thermostats
   seit Monaten in InfluxDB schreibt und den Alias einmal aktualisiert,
   verliert die Aufzeichnung, ohne dass ihm irgendwo etwas auffiele.
   Fuer `native` galt derselbe Fehler schon einmal und wurde behoben -
   `common` blieb uebersehen.

   Deshalb: die eigenen Felder setzt die Werkbank, alle uebrigen
   uebernimmt sie unveraendert aus dem, was schon dasteht. Setzt die
   Vorlage eines der eigenen Felder nicht mehr - etwa `unit` -, faellt
   es weg; das ist gewollt, dafuer ist sie zustaendig. */
/* Wo der Alias landen wuerde: alias.0.<Ordner>.<Geraet> */
/* Wohin ein neuer Alias vorgeschlagen wird.

   Frueher immer das letzte Stueck der Kennung — bei einer Homematic also
   `alias.0.NEQ0000000`, und bei einem Kanal davon schlicht `alias.0.1`.
   Wo ein Objekt einen Namen traegt, ist der gemeint. */
/* Ein Name, der als Kennung taugt. Dieselbe Regel wie in den Feldern
   der Zielleiste und des Verlegen-Dialogs - sie stand dort zweimal und
   hier gar nicht: ein Geraetename wie „HM-Schaltaktor, Original" wurde
   zu `HM-Schaltaktor_ Original`, das Komma ersetzt, das Leerzeichen
   stehengelassen (gefunden 26.08.2026 an einem Fake-Geraet).
   Umlaute bleiben, Punkte wuerden eine Unterebene aufmachen. */
export function kennungtauglich(t) {
  return String(t).trim()
    .replace(/[^\w.\- äöüÄÖÜß]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/\./g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function zielId(kanal) {
  var t = kanal.split('.');
  var name = zusatzName(kanal) || t.pop();
  if (zusatzName(kanal)) { t.pop(); }
  var raum = t.length > 2 ? t[t.length - 1] : '';
  name = kennungtauglich(name) || 'Alias';
  return raum ? ('alias.0.' + kennungtauglich(raum) + '.' + name) : ('alias.0.' + name);
}

/* Alle Ordner, die es unter alias.0 schon gibt — als Ablagevorschlag.
   Auch Zweige ohne eigenes Objekt zaehlen, MQTT legt die ja auch nicht an. */
export function ordnerUnterAlias() {
  var m = {};
  S.keysSorted.forEach(function (id) {
    if (id.indexOf('alias.0.') !== 0) { return; }
    var o = S.objects[id];
    if (!o) { return; }
    var teile = id.split('.');
    if (o.type === 'state') { teile = teile.slice(0, -1); }
    /* jede Ebene oberhalb des Geraets ist ein moeglicher Ablageort */
    for (var i = 3; i < teile.length; i++) {
      m[teile.slice(0, i).join('.')] = 1;
    }
  });
  return Object.keys(m).sort();
}

/* ================== Auswahl ================== */
/* Mit „fertig" kann der Aufrufer warten, bis der Entwurf wirklich
   steht: Werte geladen, Vorlage angewendet, Ziel gesetzt. Wer sofort
   nach waehle weiterarbeitet, sieht den Rohentwurf — alle Punkte ohne
   Rollen, und das Ziel noch leer. */
/* Steht der Fokus in einem Feld der rechten Seite, tippt oder waehlt
   dort gerade jemand. Dann darf ihm die Seite nicht unter den Haenden
   weggezogen werden: der Ordnervorschlag verschwand mitten im Klick,
   weil spaet nachgeladene Werte ein zweites Mal zeichnen liessen. */
export function tipptGerade() {
  var a = document.activeElement;
  if (!a || !/^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName)) { return false; }
  return !!(a.closest && a.closest('.respane'));
}

/* Fuer alles, was nachtraeglich zeichnet — spaete Werte, Nachzieher.
   Eine Aenderung, die der Nutzer selbst ausgeloest hat, zeichnet
   weiterhin sofort. */
export function zeichneWennFrei() {
  if (tipptGerade()) { setTimeout(zeichneWennFrei, 400); return; }
  zeichneErgebnis();
}

/* Welche Kanaele eines Geraets ergaeben fuer sich ein Geraet?

   Die Frage ist nicht zu umgehen und nicht sicher zu beantworten. Ein
   Zweifach-Aktor hat zwei Kanaele mit je einem eigenen STATE — das sind
   zwei Lampen. Ein Dimmer hat drei Kanaele mit je einem eigenen LEVEL —
   das ist ein Dimmer, die anderen beiden sind virtuelle Kanaele
   desselben Ausgangs. In den Daten sehen beide Faelle gleich aus.

   Also wird nicht geraten, sondern gefragt: gibt es mehrere solcher
   Kanaele, bietet die Fussleiste beide Wege an — genau wie bei einer
   Tasmota mit mehreren Ausgaengen. Die Zahl steht am Knopf, die
   Entscheidung trifft der Mensch.

   Das Ergebnis wird gemerkt: `zeichneErgebnis` laeuft bei jedem
   eintreffenden Wert, und der Detektor je Kanal ist zu teuer, um ihn
   sekuendlich zu wiederholen. */
var kanalGeraeteCache = {};

export function steuerKanaele(dev) {
  if (!S.objects[dev] || S.objects[dev].type !== 'device') { return []; }
  if (kanalGeraeteCache[dev]) { return kanalGeraeteCache[dev]; }
  var raus = [];
  var pre = dev + '.';
  S.keysSorted.forEach(function (id) {
    if (id.indexOf(pre) !== 0) { return; }
    if (id.slice(pre.length).indexOf('.') !== -1) { return; }   /* nur direkte Kinder */
    if (!S.objects[id] || S.objects[id].type !== 'channel') { return; }
    var e2 = baueEntwurf(id);
    if (!e2.states.length) { return; }
    var f = erkenneEntwurf(e2, null).filter(function (x) { return x.type !== 'info'; });
    if (!f.length) { return; }
    /* Nur zaehlen, was einen Pflichtplatz wirklich besetzt — sonst
       gilt jeder Kanal mit irgendeinem Messwert als Geraet. */
    /* Alles, was der Kanal an Plaetzen belegt — nicht nur die
       Pflichtplaetze. Sonst kaeme beim Zweifach-Aktor der Schalter des
       zweiten Kanals mit, seine Rueckmeldung WORKING aber nicht: ein
       Licht mit Schalter, das andere ohne Statusanzeige. */
    var pflicht = f[0].states.filter(function (st) { return st.id; })
      .map(function (st) { return st.id; });
    if (!f[0].states.some(function (st) { return st.required && st.id; })) { return; }
    raus.push({ id: id, typ: f[0].type, name: eigenerKanalName(id) || id.slice(pre.length),
                pflicht: pflicht });
  });
  kanalGeraeteCache[dev] = raus;
  return raus;
}

/* Ein fertiger Entwurf fuer einen Knoten, so wie ihn `waehle` erzeugen
   wuerde — Vorlage, sonst Rohentwurf mit erkanntem Muster und der
   Vorbelegung „nur was einen Platz hat". Gebraucht wird das, wenn aus
   mehreren Kanaelen auf einmal Aliase entstehen sollen. */
/* Welche Kanaele eines Geraets gehoeren keinem einzelnen Verbraucher,
   sondern allen? Bei Homematic ist das Kanal 0 mit Batterie, Empfang und
   Erreichbarkeit — ein Funkmodul, zwei Lampen. */
export function gemeinsameKanaele(dev, kanalGeraete) {
  var eigen = {};
  (kanalGeraete || []).forEach(function (k) { eigen[k.id] = 1; });
  var pre = dev + '.';
  var raus = [];
  S.keysSorted.forEach(function (id) {
    if (id.indexOf(pre) !== 0) { return; }
    if (id.slice(pre.length).indexOf('.') !== -1) { return; }
    if (!S.objects[id] || S.objects[id].type !== 'channel') { return; }
    if (eigen[id]) { return; }
    if (!kindZustaende(id).length) { return; }
    raus.push(id);
  });
  return raus;
}

export function entwurfFuer(id, gemeinsam, gemAn) {
  var v = vorschlag(id);
  if (v) { return v; }
  var e2 = baueEntwurf(id);
  if (!e2.states.length) { return null; }

  /* Die Wartungsdaten des gemeinsamen Kanals gehoeren in jedes Geraet,
     nicht in eines davon oder in einen Kanal daneben.

     Ein Alias-Punkt ist ein Verweis, kein Wert — zwei Geraete duerfen
     auf dieselbe Quelle zeigen, und der Batteriestand des Funkmoduls
     gilt fuer beide Lampen gleichermassen. Lagerte man ihn in einen
     eigenen `info`-Kanal aus, haette keine der beiden eine
     Batteriewarnung: der Detektor schaut nur innerhalb eines Kanals.
     Genau so macht es die Tasmota-Mehrfachvorlage mit RSSI — jeder der
     vier Ausgaenge bekommt seinen eigenen, alle lesen aus tele/STATE. */
  (gemeinsam || []).forEach(function (gid) {
    kindZustaende(gid).forEach(function (qid) {
      var o = S.objects[qid]; if (!o) { return; }
      var c = o.common || {};
      var kurz = qid.slice(gid.length + 1).replace(/\./g, '_');
      /* Traegt der Kanal selbst schon einen Punkt dieses Namens, den
         gemeinsamen unterscheidbar machen. */
      if (e2.states.some(function (x) { return x.n === kurz; })) {
        kurz = gid.split('.').pop() + '_' + kurz;
      }
      e2.states.push({
        n: kurz, on: false, role: c.role || '', typ: c.type || '',
        unit: c.unit || '', states: c.states || undefined, wr: false,
        srcR: qid, srcW: '', f: '', fw: '', caption: '', manuell: false,
        gemeinsam: true
      });
    });
  });
  var f = erkenneEntwurf(e2, null);
  e2.wantAuto = f.length ? f[0].type : null;
  e2.want = e2.wantAuto;
  var funde = e2.want ? erkenneEntwurf(e2, e2.want) : f;
  var haupt = funde.length ? funde[0] : null;
  var platz = {};
  if (haupt) {
    haupt.states.forEach(function (x) {
      if (x.id) { platz[x.id.slice(id.length + 1)] = x.name; }
    });
  }
  if (Object.keys(platz).length) {
    e2.states.forEach(function (st) { st.on = !!platz[st.n]; });
  }
  /* Zum Schluss die Wartungspunkte, die auf der Geraeteebene einen Platz
     gefunden haben. Warum nicht einfach den Detektor auf dem Kanal
     fragen? Weil er dort nur SET und WORKING zuordnet, obwohl dieselben
     Punkte mit denselben Rollen im Abbild stehen — auf der Geraeteebene
     findet er LOWBAT, UNREACH und RSSI. Die Zuordnung von dort ist die
     belastbare; sie stammt aus demselben Detektor, nur aus dem Lauf, der
     sie sieht. */
  if (gemAn) {
    e2.states.forEach(function (st) {
      if (st.gemeinsam && gemAn[st.srcR]) { st.on = true; }
    });
  }
  return merkeHakenVorgabe(e2);
}

export function waehle(id, fertig) {
  /* Wer links etwas anderes anklickt, will es rechts sehen - auch wenn
     der Fokus noch in einem Feld der rechten Seite steht. `tipptGerade`
     haelt das Neuzeichnen zurueck, damit ein eintreffender Messwert
     niemandem in die Eingabe faehrt; beim Wechsel der Auswahl ist das
     falsch: das Feld gehoert zum alten Geraet und verschwindet ohnehin.

     Ohne diesen Griff stand links das eine Geraet markiert und rechts das
     andere aufgeschlagen - samt Fussleiste. Ein Klick auf „Alias
     entfernen" haette dann den Alias des falschen Geraets getroffen
     (gemessen 26.08.2026: Baum auf hm-rpc.0.000A1D89900003, Kopfzeile
     weiter FK_Badezimmer, bis das Feld den Fokus abgab). */
  if (id !== S.current) {
    var a = document.activeElement;
    if (a && a.blur && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName) &&
        a.closest && a.closest('.respane')) {
      a.blur();
    }
  }
  S.current = id;
  S.openRow = null;
  S.entwurf = baueEntwurf(id);
  /* Bis die Werte da sind und die Vorlage gegriffen hat, steht rechts
     der Rohentwurf — alle Punkte angehakt, ohne Rollen. Auf dem
     Testsystem waren das 130 ms, auf einer grossen Anlage deutlich
     mehr. In dieser Zeit darf der Schreibknopf nicht scharf sein. */
  var bd0 = $('#btn-dry');
  if (bd0) { bd0.disabled = true; }

  /* Alle Ebenen darueber aufklappen, damit die Auswahl im Baum auch
     sichtbar wird — sonst waehlt man rechts etwas aus und links
     passiert nichts. */
  var teile = id.split('.');
  for (var i = 1; i <= teile.length; i++) {
    S.aufgeklappt[teile.slice(0, i).join('.')] = true;
  }
  merkeKlappstand();
  zeichneBaum();

  var sel = document.querySelector('#tree .node.sel');
  if (sel && sel.scrollIntoView) {
    sel.scrollIntoView({ block: 'nearest' });
  }

  if (S.abo) { socket.emit('unsubscribe', S.abo); }
  S.abo = id + '.*';
  socket.emit('subscribe', S.abo);

  /* Erst die Werte, dann der Vorschlag. Die Erkennung schaut in den
     Rohwert von tele.SENSOR hinein — ohne Werte haelt sie ein Geraet
     mit Messung faelschlich fuer eines ohne. */
  var quellen = kindZustaende(id).slice();
  S.entwurf.states.forEach(function (s) {
    if (s.srcR) { quellen.push(s.srcR); }
    if (s.srcW) { quellen.push(s.srcW); }
  });
  /* Vorlagen duerfen aus festen Objekten ausserhalb des Kanals lesen.
     Deren Werte muessen vorliegen, bevor die Vorlage geprueft wird —
     sonst faellt ein JSON-Feld durch, bloss weil noch nichts da war. */
  S.VORLAGEN.forEach(function (v) {
    (v.zustaende || []).forEach(function (z) {
      if (z.absolut && z.lesen && S.objects[z.lesen]) { quellen.push(z.lesen); }
    });
  });

  /* Nicht „fertig" nennen — so hiess der Rueckruf dieser Funktion, und
     die lokale Marke ueberschattete ihn. Der Aufrufer wartete dann
     vergeblich. */
  var werteDa = false;
  holeWerte(id, quellen, function () {
    werteDa = true;
    if (id !== S.current) { return; }

    /* Wer schon Hand angelegt hat, behaelt seinen Entwurf.

       Unten steht ein `entwurf = v` - der Vorschlag ersetzt den
       Rohentwurf vollstaendig. Das ist richtig, solange niemand
       dazwischenkommt. Es kann aber jemand dazwischenkommen: Nach
       150 ms zeichnet der Platzhalter, und `zeichneErgebnis` gibt dabei
       den Trockenlaufknopf frei. Von da an ist die Oberflaeche bedienbar,
       waehrend die Werte noch unterwegs sind. Wer in diesem Fenster einen
       Raum waehlt, einen Namen tippt oder einen Haken setzt, verliert es
       wieder, sobald die Werte eintreffen - ohne jede Meldung.

       Auf dem Testsystem sind das gut 150 ms, an einem langsamen Tag
       waren es 1000. Gefunden, als eine Raumwahl „Garten“ spurlos
       verschwand und der Trockenlauf nur noch die Funktion zeigte.

       Der Preis ist, dass die Vorlage dann nicht mehr greift. Das ist
       die richtige Seite zum Nachgeben: ein nicht angewandter Vorschlag
       faellt auf, eine verschluckte Eingabe nicht. */
    if (S.entwurf && S.entwurf.angefasst) {
      zeichneWennFrei();
      if (typeof fertig === 'function') { fertig(); }
      return;
    }

    if (id.indexOf('alias.') !== 0) {
      /* Gibt es fuer diese Quelle schon einen Alias, bleibt es bei der
         Vorlage, aus der er entstanden ist. Sonst koennte eine spaeter
         angelegte Vorlage ein fertiges Geraet still uebernehmen. */
      var fest = null;
      var vorh = aliasFuer(id);
      if (vorh && S.objects[vorh] && S.objects[vorh].native && S.objects[vorh].native.vorlage) {
        var gid = S.objects[vorh].native.vorlage;
        if (S.VORLAGEN.some(function (x) { return x.id === gid; })) { fest = gid; }
      }
      var v = vorschlag(id, fest);
      if (v) {
        v.ziel = zielId(id);
        if (fest) { v.vonHandGewaehlt = false; v.ausBestand = true; }
        /* Gibt es den Alias schon, gilt sein Stand - in beiden Ansichten
           dasselbe Bild (Ricardo, 25.08.2026). */
        if (vorh && S.objects[vorh]) { bestandVorrang(v, vorh); }
        S.entwurf = v;
      }
    }
    var nach = [];
    S.entwurf.states.forEach(function (s) {
      if (s.srcR && !S.werte[s.srcR]) { nach.push(s.srcR); }
    });
    if (nach.length) { holeWerte(id, nach, function () { zeichneWennFrei(); }); }
    /* Auch dieser Durchgang kommt verzoegert — die Werte muessen erst da
       sein. Wer in der Zwischenzeit schon ins Zielfeld geklickt hat, ist
       schneller als die Oberflaeche; ihm gehoert der Vortritt. */
    zeichneWennFrei();
    if (typeof fertig === 'function') { fertig(); }
  });

  /* Der Rohentwurf — alle Punkte, keine Rollen — ist nur ein Platzhalter,
     bis die Werte da sind und die Vorlage greift. Sofort gezeichnet
     sprang die Liste bei jeder Auswahl sichtbar um. Also erst zeigen,
     wenn das Laden wirklich dauert. */
  if (!werteDa) {
    setTimeout(function () {
      if (!werteDa && id === S.current) { zeichneWennFrei(); }
    }, 150);
  }
}

export function opt(val, text) {
  var o = document.createElement('option');
  o.value = val; o.textContent = text;
  return o;
}

/* Datenpunkte, die als Quelle in Frage kommen: alles unter denselben
   Quellzweigen, aus denen die bisherigen Punkte lesen. */
export function quellenAuswahl(e) {
  var liste = [];
  function dazu(k) {
    if (S.objects[k] && S.objects[k].type === 'state' && liste.indexOf(k) === -1) { liste.push(k); }
  }

  /* 1. Die Punkte des gewaehlten Knotens selbst — bei einer MQTT-Quelle
     ist genau das die Auswahl. Vorher blieb die Liste hier leer und der
     Kasten meldete „keine Quelle bekannt". */
  kindZustaende(e.kanal).forEach(dazu);

  /* 2. Zusaetzlich die Zweige, aus denen bestehende Punkte schon lesen —
     bei einem fertigen Alias liegt die Quelle ja woanders. */
  var wurzeln = {};
  e.states.forEach(function (s) {
    if (!s.srcR) { return; }
    var t = s.srcR.split('.');
    var w = t.slice(0, Math.max(2, t.length - 1));
    wurzeln[w.join('.')] = 1;
    /* Endet die Wurzel auf einer Sparte, gehoert das Geraet darueber
       dazu. Sonst sammelt die Liste nur Geschwister derselben Sparte:
       wer einen Punkt aus tele/STATE liest, bekam ausschliesslich
       tele-Punkte angeboten und konnte kein Schreibziel in cmnd
       waehlen — die acht cmnd-Punkte einer Farblampe fehlten
       vollstaendig. */
    if (w.length > 2 && SPARTEN.indexOf(w[w.length - 1]) > -1) {
      wurzeln[w.slice(0, w.length - 1).join('.')] = 1;
    }
  });
  Object.keys(wurzeln).forEach(function (w) {
    S.keysSorted.forEach(function (k) { if (k.indexOf(w + '.') === 0) { dazu(k); } });
  });

  return liste;
}

/* Welche Geraete liegen unter diesem Knoten? Ein Knoten gilt als Geraet,
   sobald eine Vorlage darauf passt; darunter wird nicht weitergesucht.
   Findet sich keine Vorlage, zaehlt jeder Knoten mit eigenen Zustaenden. */
/* cmnd, stat und tele sind die Sparten eines Tasmota, keine eigenen
   Geraete. Wer sie einzeln zaehlt, macht aus einem NSPanel drei. */
var SPARTEN = ['cmnd', 'stat', 'tele'];

export function geraeteDarunter(wurzel) {
  var pre = wurzel + '.';
  var tiefeWurzel = wurzel.split('.').length;

  var kandidaten = {};
  S.keysSorted.forEach(function (id) {
    if (id.indexOf(pre) !== 0) { return; }
    if (!S.objects[id] || S.objects[id].type !== 'state') { return; }
    var teile = id.split('.');
    for (var i = tiefeWurzel + 1; i < teile.length; i++) {
      kandidaten[teile.slice(0, i).join('.')] = 1;
    }
  });

  var pfade = Object.keys(kandidaten).sort(function (a, b) {
    return a.split('.').length - b.split('.').length || (a < b ? -1 : 1);
  });

  var geraete = [];
  var abgedeckt = [];
  function schonDrin(p) {
    return abgedeckt.some(function (g) { return p === g || p.indexOf(g + '.') === 0; });
  }

  /* Ein Objekt vom Typ `device` ist ein Geraet — was darunter liegt,
     sind seine Kanaele, nicht eigene Geraete. Homematic verteilt einen
     Heizkoerperthermostaten auf zwei davon: Wartung in :0, Funktion in
     :1. Gemessen ueber 39 Geraete findet der Detektor auf der
     Geraeteebene jedes Mal mehr als im besten einzelnen Kanal —
     thermostat 7/13 gegen info 8/12. Wer die Kanaele einzeln zaehlt,
     macht aus einem Thermostaten zwei Halbe. */
  pfade.forEach(function (pfad) {
    if (schonDrin(pfad)) { return; }
    if (!S.objects[pfad] || S.objects[pfad].type !== 'device') { return; }
    var b = null;
    S.VORLAGEN.forEach(function (v) {
      var t = pruefeVorlage(v, pfad);
      if (t.passt && (!b || t.punkte > b.punkte)) { b = t; }
    });
    geraete.push({ id: pfad, vorlage: b ? b.vorlage : null, punkte: b ? b.punkte : 0 });
    abgedeckt.push(pfad);
  });

  pfade.forEach(function (pfad) {
    if (schonDrin(pfad)) { return; }
    if (SPARTEN.indexOf(pfad.split('.').pop()) !== -1) { return; }
    var beste = null;
    S.VORLAGEN.forEach(function (v) {
      var t = pruefeVorlage(v, pfad);
      if (t.passt && (!beste || t.punkte > beste.punkte)) { beste = t; }
    });
    if (beste) {
      geraete.push({ id: pfad, vorlage: beste.vorlage, punkte: beste.punkte });
      abgedeckt.push(pfad);
    }
  });

  /* Reste: Knoten mit eigenen Zustaenden, die keine Vorlage traf */
  pfade.forEach(function (pfad) {
    if (schonDrin(pfad)) { return; }
    if (SPARTEN.indexOf(pfad.split('.').pop()) !== -1) { return; }
    var eigene = S.keysSorted.filter(function (k) {
      if (k.indexOf(pfad + '.') !== 0) { return false; }
      if (!S.objects[k] || S.objects[k].type !== 'state') { return false; }
      var rest = k.slice(pfad.length + 1);
      if (rest.indexOf('.') === -1) { return true; }
      /* Ein Zustand in einer Sparte gehoert dem Geraet darueber. */
      var t = rest.split('.');
      return t.length === 2 && SPARTEN.indexOf(t[0]) !== -1;
    });
    if (eigene.length) {
      geraete.push({ id: pfad, vorlage: null, punkte: 0 });
      abgedeckt.push(pfad);
    }
  });

  geraete.sort(function (a, b) { return a.id < b.id ? -1 : 1; });
  return geraete;
}

/* Gibt es fuer diese Quelle schon einen Alias?

   Zwei Wege, und der zweite ist der wichtigere. Ueber native.quelle
   findet man nur, was die Werkbank selbst angelegt hat. Von Hand
   gebaute Aliase — bei einer gewachsenen Anlage die Mehrheit — tragen
   den Vermerk nicht. Dann wird gesucht, wo es wirklich steht: in den
   Aliasquellen der Datenpunkte.

   Ohne das schlaegt die Werkbank ein freies Ziel vor, meldet „wird neu
   angelegt" und erzeugt beim Klick ein zweites Geraet, waehrend das
   erste verwaist stehenbleibt. Beim Karbonator lag der Alias unter
   alias.0.Strom, vorgeschlagen wurde alias.0.SmartHome. */
export function aliasFuer(quelle) {
  var treffer = null;
  S.keysSorted.forEach(function (id) {
    if (treffer || id.indexOf('alias.') !== 0) { return; }
    var o = S.objects[id];
    if (o && o.native && o.native.quelle === quelle) { treffer = id; }
  });
  if (treffer) { return treffer; }

  /* Welcher Aliaskanal liest oder schreibt am haeufigsten in diesen
     Zweig? Einzelne Punkte koennen anderswohin zeigen — ein
     gemeinsamer Sollwert etwa —, deshalb die Mehrheit und nicht der
     erste Treffer. */
  var zaehler = {}, bester = null, wieviel = 0;
  var pre = quelle + '.';
  S.keysSorted.forEach(function (id) {
    if (id.indexOf('alias.') !== 0) { return; }
    var o = S.objects[id];
    if (!o || o.type !== 'state') { return; }
    var q = aliasQuellen(o);
    var passt = (q.read && q.read.indexOf(pre) === 0) ||
                (q.write && q.write.indexOf(pre) === 0);
    if (!passt) { return; }
    var eltern = id.slice(0, id.lastIndexOf('.'));
    zaehler[eltern] = (zaehler[eltern] || 0) + 1;
    if (zaehler[eltern] > wieviel) { wieviel = zaehler[eltern]; bester = eltern; }
  });
  return bester;
}

/* Was im Alias steht, gilt - auch in der Quellenansicht.

   Bis 0.7.2 zeigte „Alias anlegen" bei einem vorhandenen Alias die Werte
   der VORLAGE, „Alias bearbeiten" dagegen den Bestand. Dieselbe Zeile
   trug also je nach Reiter eine andere Rolle, und ein Aktualisieren tat
   je nach Reiter etwas anderes - an Ricardos PC-Steckdose stand im Alias
   `state`, in der Quellenansicht `sensor.switch` (25.08.2026).

   Jetzt gewinnt der Bestand in beiden Ansichten: Rolle, Typ, Einheit,
   Werteliste, Beschriftung, Formeln, Quellen und Haken kommen aus dem
   Alias, wenn es ihn gibt. Ein Aktualisieren aendert damit von sich aus
   nichts mehr. Was die Vorlage anders will, bleibt sichtbar - je Zeile
   als Vermerk und oben als Knopf „Vorlage anwenden".

   `vorlagenWert` haelt fest, was die Vorlage sagen wuerde; ohne diese
   Kopie koennte der Knopf spaeter nichts mehr anwenden. */
export function bestandVorrang(e, aliasId) {
  if (!e || !e.states || !aliasId) { return e; }
  var kanal = aliasId;
  e.states.forEach(function (s) {
    if (!s.n) { return; }
    var o = S.objects[kanal + '.' + s.n];
    if (!o || !o.common) {
      /* Punkte, die es im Alias nicht gibt, sind auch nicht Teil seines
         Bestands - der Haken der Vorlage darf sie nicht heimlich wieder
         anlegen (Ricardo, 25.08.2026: UNREACH und RSSI standen angehakt,
         obwohl sie im Alias fehlen). Anhaken kann man sie weiterhin, und
         der Chip „Vorlage" holt die Vorgabe der Vorlage zurueck. */
      s.vorlagenWert = { on: s.on, role: s.role, typ: s.typ, unit: s.unit,
                         caption: s.caption, f: s.f, fw: s.fw,
                         srcR: s.srcR, srcW: s.srcW, states: s.states };
      s.on = false;
      return;
    }
    var c = o.common;
    var q = aliasQuellen(o);
    /* Was die Vorlage wollte - fuer den Vergleich und den Knopf. */
    s.vorlagenWert = {
      role: s.role, typ: s.typ, unit: s.unit, caption: s.caption,
      f: s.f, fw: s.fw, srcR: s.srcR, srcW: s.srcW, states: s.states,
      /* Auch der Haken der Vorlage - der Chip „Vorlage" stellt ihn wieder
         her, nachdem der Bestand ihn ueberschrieben hat. */
      on: s.on
    };
    if (c.role !== undefined) { s.role = c.role; }
    if (c.type !== undefined) { s.typ = c.type; }
    s.unit = (c.unit !== undefined) ? c.unit : '';
    s.states = c.states;
    /* Die Beschriftung gehoert dem Nutzer - sie wird auch spaeter vom
       Vorlagen-Abgleich nicht angefasst (Ricardo, 25.08.2026). */
    if (c.name !== undefined) { s.caption = txt(c.name); }
    var a = c.alias || {};
    s.f = (typeof a.read === 'string') ? a.read : '';
    s.fw = (typeof a.write === 'string') ? a.write : '';
    if (q.read) { s.srcR = q.read; }
    s.srcW = q.einfach
      ? ((c.write === true || typeof a.write === 'string') ? (q.write || '') : '')
      : (q.write || '');
    s.on = true;
    s.ausBestand = true;
  });
  /* Punkte, die es im Alias gibt, die Vorlage aber nicht kennt, sind
     schon ueber `alleUndVorlage` bzw. den Bestandsabgleich drin - hier
     wird nur ueberschrieben, was beide kennen. */
  e.bestandGilt = true;
  return e;
}

/* Wo weicht die Vorlage vom Bestand ab? Liefert je Zeile die Felder, die
   „Vorlage anwenden" aendern wuerde - die Beschriftung ausgenommen. */
export function vorlagenAbweichung(s) {
  var v = s && s.vorlagenWert;
  if (!v) { return []; }
  var raus = [];
  var prüf = [['role', 'Rolle'], ['typ', 'Typ'], ['unit', 'Einheit'],
              ['f', 'Leseformel'], ['fw', 'Schreibformel'],
              ['srcR', 'liest aus'], ['srcW', 'schreibt auf']];
  prüf.forEach(function (p) {
    var alt = s[p[0]] || '', neu = v[p[0]] || '';
    if (alt !== neu) { raus.push({ feld: p[0], jetzt: alt, vorlage: neu }); }
  });
  return raus;
}

/* Den Vorlagenstand herstellen - alles ausser der Beschriftung. */
export function vorlageAnwenden(e) {
  if (!e || !e.states) { return; }
  e.states.forEach(function (s) {
    var v = s.vorlagenWert;
    if (!v) { return; }
    /* Nur was wirklich anders wird, bekommt die Marke. Vorher trug jede
       angefasste Zeile „geaendert", auch die, an der sich nichts aenderte:
       am Fensterkontakt standen drei Zeilen als geaendert da, waehrend der
       Trockenlauf daneben „1 unveraendert" zaehlte (26.08.2026). Die Marke
       behauptet sonst eine Abweichung, die es nicht gibt - genau der
       Vorwurf, der schon fuer G21 galt. */
    var anders = vorlagenAbweichung(s).length > 0;
    s.role = v.role; s.typ = v.typ; s.unit = v.unit;
    s.f = v.f; s.fw = v.fw; s.srcR = v.srcR; s.srcW = v.srcW;
    s.states = v.states;
    /* caption bleibt: der Anzeigename gehoert dem Nutzer. */
    if (anders) { s.geaendert = true; }
  });
  e.bestandGilt = false;
  e.angefasst = true;
}
