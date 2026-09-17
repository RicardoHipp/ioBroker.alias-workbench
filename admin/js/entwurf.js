/* Der Entwurf: aus einem Kanal wird das, was rechts steht - samt
   Auswahl (waehle), Navigation (springeZu) und der Frage, welcher Alias
   zu welcher Quelle gehoert. */

import { S } from './zustand.js';
import { socket } from './verbindung.js';
import { $ } from './basis.js';
import { txt, tr } from './sprache.js';
import './enums.js';
import { zusatzName, setzeModus, zeichneBaum, merkeKlappstand } from './baum.js';
import { kindZustaende, aliasQuellen, holeWerte,
  mitVorspann, schreibQuelle, zeileAusAlias
} from './werte.js';
import { erkenneEntwurf } from './erkennung.js';
import { vorschlag , pruefeVorlage, zeigeAbozahl, setzeInstanz } from './vorlagen.js';

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

/* Was von `common.name` als Beschriftung uebrig bleibt.

   Gleicht der Name dem Zeilennamen, ist er keine eigene Beschriftung,
   sondern die Vorgabe - dann bleibt das Feld leer. Dieselbe Regel gilt
   in `zeileAusAlias` (werte.js) und damit an allen vier Stellen, die
   eine Zeile aus einem Alias-Objekt bauen. */
function beschriftungAus(name, zeilenname) {
  var nm = txt(name);
  return (nm && nm !== zeilenname) ? nm : '';
}

export function baueEntwurf(kanal) {
  var istAlias = (kanal.indexOf('alias.') === 0);
  var e = { kanal: kanal, states: [], want: null, wantAuto: null, alleMuster: false };
  kindZustaende(kanal).forEach(function (id) {
    var o = S.objects[id], c = o.common || {}, a = c.alias || {}, q = aliasQuellen(o);
    var kurzName = id.slice(kanal.length + 1);
    /* Ein Knopfdruck hat keinen Zustand — sonst hat auch ein
       nur-schreibender Punkt einen.

       `read: false` allein reicht als Merkmal nicht. Homematic vergibt es
       fuer beides: fuer `OLD_LEVEL` und `RAMP_STOP` (Gerätebeschreibung
       `TYPE: ACTION` — ein Tastendruck) ebenso wie fuer `ON_TIME` und
       `RAMP_TIME` (`TYPE: FLOAT` — eine Vorgabe fuer den naechsten
       Schaltbefehl, die stehen bleibt). Nur beim ersten ist eine
       Lesequelle sinnlos.

       Nachgemessen am 17.09.2026: einen Alias auf `1.ON_TIME` gelegt, die
       QUELLE direkt auf 30 gesetzt — der Alias zeigte 30. `read: false`
       sperrt das Lesen also nicht, es sagt nur, dass von allein nichts
       kommt. Wer den Wert setzt, will ihn auch sehen. */
    var nat = o.native || {};
    var istTaster = (c.read === false && !!c.write) &&
      (nat.TYPE === 'ACTION' || /^button/.test(String(c.role || '')));
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
         hier nichts und man musste jede Zeile von Hand zuweisen.

         Ein Taster hat keine Lesequelle, obwohl `alias.id` eine Kennung
         nennt: ioBroker verlangt sie, `common.read: false` sagt, dass dort
         nichts abzuholen ist (K23). Dieselbe Ablesung wie in
         `zeileAusAlias` — sonst zeigte „Alias bearbeiten" eine Quelle,
         die „Alias anlegen" nie eingetragen hat. */
      /* An der Quelle ist der Punkt seine eigene Lesequelle — ausser er
         sagt selbst, dass dort nichts ankommt.

         `read: false` heisst nicht „gesperrt": lesen kann den Punkt
         jeder, er liegt in der Datenbank. Es heisst, dass nie eine
         Aktualisierung eintrifft. Was drinsteht, ist der Wert, den
         zuletzt jemand hineingeschrieben hat — meist der Anfangswert
         beim Adapterstart. Ein Alias, der daraus liest, zeigt fuer immer
         diesen einen Wert und sieht dabei aus wie ein Messwert.

         Bei Homematic steht es in der Geraetebeschreibung: `OPERATIONS`
         ist eine Bitmaske (1 lesen, 2 schreiben, 4 meldet von selbst),
         und `2.OLD_LEVEL` traegt 2 bei `TYPE: ACTION` — ein Knopfdruck,
         kein Zustand. Am Wohnzimmer_Dimmer sind das 15 von 43 Zeilen,
         jede davon las und schrieb bisher auf denselben Befehlspunkt
         (Ricardo, 17.09.2026).

         Ist der Punkt beschreibbar, wird daraus also ein Taster: keine
         Lesequelle, nur ein Schreibziel. Genau die Form, die K23/K26 am
         Rollladen-STOP beschreiben — der Alias bekommt `read: false`,
         und vis, Alexa und matter zeichnen einen Knopf statt eines
         Schalters, der ewig auf „aus" steht. Kann der Punkt auch nicht
         schreiben, bleibt er, wie er ist: dann ist die fehlende Meldung
         wirklich ein Mangel, und die Marke sagt es. */
      srcR: istAlias ? ((c.read === false && q.einfach) ? '' : (q.read || ''))
                     : (istTaster ? '' : id),
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
      srcW: istAlias ? schreibQuelle(o) : (c.write ? id : ''),
      f: (typeof a.read === 'string') ? a.read : '',
      fw: (typeof a.write === 'string') ? a.write : '',
      /* Dieselbe Regel wie ueberall sonst: „leer, wenn sie dem
         Zeilennamen gleicht".

         Hier stand `istAlias ? txt(c.name) : …` ohne diese Pruefung.
         Folge: Wo `common.name` dem Punktnamen gleicht - bei fast jedem
         Alias, den die Werkbank selbst angelegt hat -, zeigte „Alias
         bearbeiten" den Namen und „Alias anlegen" ein leeres Feld.
         Derselbe Alias, zwei Ansichten, zwei Antworten (U21, gemessen
         12.09.2026). Geschrieben wurde in beiden Faellen dasselbe; zu
         sehen war es trotzdem. */
      caption: istAlias ? beschriftungAus(c.name, kurzName)
                        : kanalBeschriftung(kanal, kurzName),
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
export function alleUndVorlage(kanal, vorlagenId, instanz) {
  var v = vorschlag(kanal, vorlagenId, instanz);
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

/* Aus welchen Knoten liest dieser Alias, und wie oft aus jedem?

   Dieselbe Zaehlung wie in `quelleVon` - nur dass die dort das Ergebnis
   auf einen Sieger eindampft. Fuer die Anzeige zaehlt aber gerade das,
   was dabei verlorengeht: dass es mehr als einen gibt. Ricardos
   `alias.0.Solar.Netz` liest drei Punkte aus `0_userdata` und zwei aus
   `mqtt-client`; der Sprungknopf fuehrte zur Mehrheit und sagte kein
   Wort ueber den Rest (Ricardo, 08.09.2026).

   Absteigend nach Anzahl, bei Gleichstand alphabetisch - sonst
   wechselte die Reihenfolge bei jedem Neuzeichnen. */
/* Zu welcher Quelle des Alias gehoert der Knoten, an dem ich stehe?

   Die Antwort ist nicht „die Mehrheit", sondern „die hier". Sie traegt
   zwei Dinge: den Rueckweg zum Alias (er gehoert an jede Quelle, nicht
   nur an die groesste) und den Bezugspunkt der Zeilenmarken - markiert
   wird, was NICHT von hier kommt (Ricardo, 08.09.2026).

   Getroffen wird ein Eintrag der Verteilung auf drei Weisen: genau er,
   ein Knoten unter ihm (`…Stromzaehler.stat` unter der zusammengefassten
   Sparte) oder sein unmittelbarer Elternknoten - dort steht man am
   Geraet, waehrend die Quelle eine Ebene tiefer liegt. Nur eine Ebene:
   sonst bekaeme `mqtt-client.0.SmartHome` den Knopf und jede Ebene
   darueber gleich mit. */
export function quelleHier(aliasId, knoten) {
  if (!aliasId || !knoten) { return null; }
  var treffer = null;
  quellenVerteilung(aliasId).forEach(function (q) {
    if (treffer) { return; }
    if (q.id === knoten) { treffer = q.id; return; }
    if (knoten.indexOf(q.id + '.') === 0) { treffer = q.id; return; }
    var t = q.id.split('.');
    t.pop();
    if (t.join('.') === knoten) { treffer = q.id; }
  });
  return treffer;
}

export function quellenVerteilung(aliasId) {
  var zaehler = {};
  kindZustaende(aliasId).forEach(function (id) {
    var q = aliasQuellen(S.objects[id]);
    /* Einmal je DATENPUNKT, nicht je Quellangabe. `quelleVon` zaehlt
       Lese- und Schreibquelle getrennt - fuer den Mehrheitsentscheid
       gleichgueltig, fuer eine Anzeige nicht: an einem Alias mit fuenf
       Punkten stand „6 und 4" statt „3 und 2". Wo Lesen und Schreiben
       auseinandergehen, zaehlt die Lesequelle: aus ihr kommt der Wert,
       den man sieht. */
    var x = q.read || q.write;
    if (!x) { return; }
    var t = String(x).split('.');
    t.pop();
    var eltern = t.join('.');
    if (eltern) { zaehler[eltern] = (zaehler[eltern] || 0) + 1; }
  });
  var sortiere = function (liste) {
    return liste.sort(function (a, b) { return (b.n - a.n) || (a.id < b.id ? -1 : 1); });
  };
  var liste = sortiere(Object.keys(zaehler).map(function (k) { return { id: k, n: zaehler[k] }; }));

  /* Sparten desselben Geraets sind keine zweite Quelle.

     Ein Tasmota-Alias liest aus `…Licht.stat` und `…Licht.tele` - das
     sind zwei Knoten, aber ein Geraet, und „2 Quellen" waere dort
     schlicht falsch. Alles, was unterhalb der Hauptquelle liegt, zaehlt
     deshalb zu ihr. Uebrig bleiben nur eigene Zweige - bei Ricardos
     `alias.0.Solar.Netz` `0_userdata` und `mqtt-client` (08.09.2026). */
  var haupt = quelleVon(aliasId);
  if (!haupt) { return liste; }
  var raus = [], hauptN = 0;
  liste.forEach(function (q) {
    if (q.id === haupt || q.id.indexOf(haupt + '.') === 0) { hauptN += q.n; return; }
    raus.push(q);
  });
  if (hauptN) { raus.push({ id: haupt, n: hauptN }); }

  /* Dasselbe noch einmal unter den Nebenquellen.

     Der Schritt darueber fasst nur gegen die HAUPTquelle zusammen. Bei
     `alias.0.Solar.Balkon.Einspeisung` liegen aber zwei der Nebenquellen
     ebenfalls beieinander - `…Solar_Balkon.stat` und `…Solar_Balkon.tele`
     sind ein Tasmota, und es standen „4 Quellen" statt drei (Ricardo,
     08.09.2026).

     Zusammengefasst wird nur, was wirklich zusammengehoert: mehrere
     Knoten unter demselben Elternknoten, und das auch nur, wenn sie
     blosse Kennungsebenen ohne eigenes Objekt sind (so legt MQTT seine
     Sparten an) oder ihr Elternknoten ein `device` ist (so liegen die
     Kanaele bei Homematic). Zwei `channel` in einem Ordner - etwa
     `0_userdata.0.Solar.Netz` und `…Solar.Balkon` - bleiben getrennt:
     das sind zwei Geraete, keine zwei Sparten. */
  var nachEltern = {};
  raus.forEach(function (q) {
    var t = q.id.split('.');
    t.pop();
    var eltern = t.join('.');
    (nachEltern[eltern] = nachEltern[eltern] || []).push(q);
  });
  var zusammen = [];
  Object.keys(nachEltern).forEach(function (eltern) {
    var gruppe = nachEltern[eltern];
    var ohneObjekt = gruppe.every(function (q) { return !S.objects[q.id]; });
    var elternGeraet = !!(S.objects[eltern] && S.objects[eltern].type === 'device');
    if (gruppe.length < 2 || !eltern || (!ohneObjekt && !elternGeraet)) {
      zusammen = zusammen.concat(gruppe);
      return;
    }
    var summe = 0;
    gruppe.forEach(function (q) { summe += q.n; });
    zusammen.push({ id: eltern, n: summe });
  });
  return sortiere(zusammen);
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

/* Vor dem Wechsel fragen, wenn am Entwurf etwas offen ist.

   Drei Wege wechseln die Auswahl auf Wunsch des Nutzers, und alle drei
   gehen hier durch: der Klick im Baum, „zur Quelle →" / „zum Alias →"
   und die Zeilen der Ordneruebersicht. Vorher fielen Aenderungen dabei
   ins Leere, ohne ein Wort (Ricardo, 06.09.2026).

   Nicht hier durch gehen die Wechsel, die die Werkbank selbst ausloest:
   nach dem Schreiben, nach dem Verlegen, nach dem Quellentausch. Dort
   ist der Entwurf gerade geschrieben worden, es gibt nichts zu retten.
   Ebenso wenig der Knopf „zuruecksetzen" — der WILL verwerfen, und wer
   ihn drueckt, hat die Frage schon beantwortet.

   Sie haengt an `angefasst`, nicht an `geaendert` einer einzelnen Zeile:
   Raum, Funktion, Ordner und Name gehoeren genauso dazu und stehen in
   keiner Zeile. */
export function mitNachfrage(id, dann) {
  var lauf = function () { if (dann) { dann(); } else { waehle(id); } };
  var e = S.entwurf;
  if (!e || !e.angefasst || id === S.current) { lauf(); return; }

  var dlg = $('#dlg-leave');
  if (!dlg) { lauf(); return; }              /* aeltere Fassung: nicht blockieren */

  var was = (e.ziel || e.kanal || S.current || '').split('.').slice(-2).join('.');
  $('#leave-titel').textContent = tr('leave.title');
  $('#leave-body').textContent = tr('leave.body', was);

  var bleib = $('#btn-leave-stay');
  var weiter = $('#btn-leave-go');
  bleib.textContent = tr('leave.stay');
  weiter.textContent = tr('leave.discard');

  /* Bei jedem Aufruf neu verkabeln — sonst haengt der Handler des
     vorigen Aufrufs mit dem alten Ziel daran. */
  bleib.onclick = function () { dlg.close(); };
  weiter.onclick = function () { dlg.close(); lauf(); };
  dlg.showModal();
}

/* Der Sprung selbst: Baummodus umstellen, Filter fallen lassen, waehlen.
   Ohne das Leeren des Filters landet man auf einem Knoten, den der
   Baum gerade ausblendet. */
export function springeZu(id, modus) {
  mitNachfrage(id, function () {
    var q0 = $('#q');
    if (q0) { q0.value = ''; }
    if (S.baumModus !== modus) { setzeModus(modus); }
    waehle(id);
  });
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
    /* Auch Informationskanaele zaehlen mit (Ricardo, 17.09.2026).

       Vorher fielen sie hier heraus — und damit sagte der Knopf am
       Geschirrspueler „3 Stueck", waehrend im Baum daneben sechs Kanaele
       standen. Wer `general` einzeln anklickt, bekommt laengst einen
       Entwurf („Information ✓ 7/14 belegt") und kann ihn anlegen; nur
       der Sammelweg liess ihn aus. Zwei Wege, zwei Antworten am selben
       Geraet.

       Der Zweck dieses Wegs ist, die Struktur der Quelle abzubilden —
       dann gehoert jeder Kanal hinein, der fuer sich einen Entwurf
       ergibt, und nicht nur der, den der Detektor fuer ein Geraet haelt.
       Nebenbei faellt damit das Verteilen der „gemeinsamen" Kanaele in
       den meisten Faellen weg: was einen eigenen Ordner bekommt, muss
       nicht mehr in jeden anderen hineinkopiert werden (produktiv
       gemessen: beim Maeher wanderten 206 Rohdatenpunkte in jeden der
       vier Entwuerfe, beim Shelly SHEM-3 galten die drei Emeter-Phasen
       als „gemeinsam" statt als eigene Kanaele). */
    var alle = erkenneEntwurf(e2, null);
    if (!alle.length) { return; }
    /* Ein Kanal, der ein Geraet ergibt, wird danach benannt; nur wenn er
       nichts als Information hergibt, gilt der info-Fund. */
    var f = alle.filter(function (x) { return x.type !== 'info'; });
    if (!f.length) { f = alle; }
    /* Nur zaehlen, was einen Pflichtplatz wirklich besetzt — sonst
       gilt jeder Kanal mit irgendeinem Messwert als Geraet. */
    /* Alles, was der Kanal an Plaetzen belegt — nicht nur die
       Pflichtplaetze. Sonst kaeme beim Zweifach-Aktor der Schalter des
       zweiten Kanals mit, seine Rueckmeldung WORKING aber nicht: ein
       Licht mit Schalter, das andere ohne Statusanzeige. */
    var pflicht = f[0].states.filter(function (st) { return st.id; })
      .map(function (st) { return st.id; });
    if (!f[0].states.some(function (st) { return st.required && st.id; })) { return; }
    /* `name` ist der Anzeigename und darf alles enthalten, was ein Mensch
       hinschreibt. `kennung` ist, was als Objekt-ID taugt — dieselbe
       Saeuberung wie ueberall sonst (T19). Getrennt, weil beides
       gebraucht wird: die Liste zeigt den Namen, das Ziel nimmt die
       Kennung. */
    var kn = eigenerKanalName(id);
    raus.push({ id: id, typ: f[0].type, name: kn || id.slice(pre.length),
                kennung: kennungtauglich(kn || '') || id.slice(pre.length),
                pflicht: pflicht });
  });
  kanalGeraeteCache[dev] = raus;
  return raus;
}

/* Welche Unterordner entstehen, wenn die Struktur der Quelle abgebildet
   wird — und zwar nach den HAKEN, nicht nach einer Vermutung.

   Bis 17.09.2026 baute dieser Weg je Kanal einen frischen Entwurf und
   hakte an, was das Muster des Kanals hergab. Damit entstand, was
   niemand ausgewaehlt hatte: am `MISCHKANAL` bekam der Wartungskanal
   `LOW_BAT`, `RSSI_DEVICE` und `UNREACH`, obwohl oben nur `UNREACH`
   angehakt war. Umgekehrt fiel weg, was jemand von Hand angehakt hatte —
   der Entwurf wurde ja gar nicht gelesen (Ricardo, 17.09.2026).

   Jetzt gilt: was angehakt ist, bestimmt beides — welche Ordner es gibt
   und was darin steht. Ein Kanal ohne angehakte Zeile kommt nicht vor.
   Zeilen, deren Quelle direkt am Geraet haengt oder von woanders kommt,
   bleiben im Behaelter selbst (`eigen`). */
export function kanalGruppen(e) {
  if (!e || !e.kanal || e.kanal.indexOf('alias.') === 0) { return []; }
  var basis = e.kanal + '.';
  var gruppen = [], nach = {}, eigen = [];
  (e.states || []).forEach(function (st) {
    if (!st.on || !st.n) { return; }
    var quelle = st.srcR || st.srcW || '';
    var rest = (quelle.indexOf(basis) === 0) ? quelle.slice(basis.length) : '';
    var p = rest.indexOf('.');
    /* Ohne Punkt liegt der Punkt direkt am Geraet; ohne `rest` liest die
       Zeile von woanders. Beides gehoert in den Behaelter, nicht in einen
       erfundenen Unterordner. */
    if (!rest || p < 0) { eigen.push(st); return; }
    var kid = e.kanal + '.' + rest.slice(0, p);
    if (!S.objects[kid]) { eigen.push(st); return; }
    if (!nach[kid]) {
      var kn = eigenerKanalName(kid);
      var kurz = rest.slice(0, p);
      nach[kid] = { id: kid, kurz: kurz, name: kn || kurz,
                    kennung: kennungtauglich(kn || '') || kurz, zeilen: [] };
      gruppen.push(nach[kid]);
    }
    nach[kid].zeilen.push(st);
  });
  if (eigen.length) {
    gruppen.unshift({ id: e.kanal, kurz: '', name: '', kennung: '',
                      eigen: true, zeilen: eigen });
  }
  return gruppen;
}

/* Der Entwurf ohne jede Vorlage — alle Punkte des Geraets, alle
   angehakt, dazu das erkannte Muster als Anhaltspunkt.

   Gebraucht fuer „— keine Vorlage —" in der Vorlagenwahl. Bis zum
   17.09.2026 liess sich eine erkannte Vorlage nicht abwaehlen: der erste
   Eintrag der Liste war eine blosse Ueberschrift, sein Wert leer, und der
   Zweig stieg bei leerem Wert sofort aus. Wechseln ging, weglassen nicht
   (Ricardo).

   Zuerst hakte dieser Weg an, was im erkannten Muster einen Platz hat.
   Das ging an zwei GLEICHARTIGEN Kanaelen schief: am `hm.ZWEIKANAL`
   nahm der Detektor einen der beiden Ausgaenge — und zwar den zweiten —,
   `Licht_Esstisch` stand angehakt da und `Licht_Bar` leer. Welcher es
   wird, ist Zufall, und danach zu raten ist nicht die Aufgabe eines
   Entwurfs OHNE Vorlage. Wer sie abwaehlt, will die Punkte selbst
   aussuchen; also stehen alle da (Ricardo, 17.09.2026). */
export function rohEntwurf(id) {
  var e2 = baueEntwurf(id);
  if (!e2.states.length) { return null; }
  var f = erkenneEntwurf(e2, null);
  e2.wantAuto = f.length ? f[0].type : null;
  e2.want = e2.wantAuto;
  return merkeHakenVorgabe(e2);
}

/* Wohin die Unterordner kommen — der Behaelter fuer das Geraet.

   Beim ersten Mal ist das schlicht `zielOrdner` plus Geraetename. Nach
   dem Aufteilen gibt es aber mehrere Aliase zu derselben Quelle, je Kanal
   einen, und `aliasFuer` liefert einen davon — den mit den meisten
   Punkten. Der Behaelter waere dann dieser Unterordner, und der zweite
   Druck haengte alles eine Ebene tiefer: aus
   `alias.0.Geschirrspueler.Befehle` wurde
   `alias.0.Geschirrspueler.Allgemeine_Informationen.Befehle`, beim
   dritten Druck noch eine Ebene tiefer (17.09.2026).

   Woran man es erkennt: das gefundene Ziel fuehrt in `native.quelle`
   einen KANAL der Quelle, nicht das Geraet. Dann ist es selbst ein
   Unterordner aus einem frueheren Durchgang, und der Behaelter ist sein
   Elternknoten. */
export function aufteilBehaelter(e) {
  var ordner = (e.zielOrdner || 'alias.0') + '.' + e.zielName;
  var ziel = e.ziel;
  if (!ziel) { return ordner; }
  var q = ((S.objects[ziel] && S.objects[ziel].native) || {}).quelle;
  if (q && e.kanal && q.indexOf(e.kanal + '.') === 0) {
    var p = ziel.lastIndexOf('.');
    if (p > 0) { return ziel.slice(0, p); }
  }
  return ordner;
}

/* Aus einer Gruppe wird ein Entwurf: dieselben Zeilen, nur auf den Kanal
   bezogen benannt. Was jemand an einer Zeile geaendert hat — Rolle, Typ,
   Einheit, Formel, Beschriftung — wandert unveraendert mit; es waere
   sonderbar, eine Handeingabe beim Aufteilen wegzuwerfen. */
export function teilEntwurf(e, g) {
  var v = { kanal: g.id, states: [], want: null, wantAuto: null,
            alleMuster: false, raum: e.raum, funktion: e.funktion };
  g.zeilen.forEach(function (st) {
    var k = JSON.parse(JSON.stringify(st));
    /* Der Name wird auf den Kanal bezogen: aus `commands_BSH_…` wird im
       Kanal `Befehle` schlicht `BSH_…`. Gekuerzt wird ueber die Quelle —
       und bei einem Taster ist das die SCHREIBquelle, denn `srcR` ist
       dort leer. Ohne diesen Zusatz behielt genau diese Zeile ihren
       langen Namen: `…Befehle.commands_BSH_Common_Command_StopProgram`
       neben `…Allgemeine_Informationen.brand` (17.09.2026). */
    var quelle = st.srcR || st.srcW || '';
    if (!g.eigen && quelle && quelle.indexOf(g.id + '.') === 0) {
      k.n = quelle.slice(g.id.length + 1).replace(/\./g, '_');
    }
    k.on = true;
    v.states.push(k);
  });
  var f = erkenneEntwurf(v, null);
  v.wantAuto = f.length ? f[0].type : null;
  v.want = v.wantAuto;
  return merkeHakenVorgabe(v);
}

/* Alle laufenden Abos abmelden.

   Stand nur in `waehle` — und damit meldete kein einziger der Wege ab,
   die die Auswahl fallen lassen: der Moduswechsel, das Zuklappen eines
   Zweigs, das Abschalten des Expertenmodus, das Loeschen eines Alias.
   Danach lief ein Abo auf ein Geraet, das rechts gar nicht mehr steht,
   der Zaehler in der Kopfleiste behauptete „ein Abo", und `S.werte`
   fuellte sich weiter (gemessen 09.09.2026). */
export function aboLoesen() {
  (S.abo || []).forEach(function (m) { socket.emit('unsubscribe', m); });
  S.abo = [];
  zeigeAbozahl();
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

  /* Abonniert wird, was auch angezeigt wird.

     Bisher nur `<knoten>.*`. An einer Quelle stimmt das - die Werte in
     der Liste kommen von dort. Am Alias nicht: dort stehen die Werte der
     QUELLEN, und die bekamen kein Ereignis. Die Zahlen wurden einmal
     beim Auswaehlen geholt und standen dann still; an
     `alias.0.Solar.Balkon.Energie`, wo sich im Sekundentakt etwas
     aendert, fiel es auf (Ricardo, 08.09.2026).

     Deshalb am Alias zusaetzlich seine Quellen - `quellenVerteilung`
     weiss ja, welche das sind. Und deshalb eine Liste: sonst bliebe
     beim naechsten Wechsel die Haelfte abonniert und die Werkbank
     bekaeme mit der Zeit Ereignisse fuer das halbe System. Die Zahl der
     laufenden Abos steht in der Kopfleiste - dort sieht man sofort, ob
     sich etwas ansammelt. */
  aboLoesen();
  var muster = [id + '.*'];
  if (id.indexOf('alias.') === 0) {
    /* Aus den Quellen, nicht aus der Anzeige-Verteilung.

       `quellenVerteilung` fasst zusammen, was die rechte Seite als
       „Quellen" zeigt — dafuer bildet sie den ELTERNknoten jeder
       Quelle. Bei einem flachen MQTT-Geraet ist das der halbe Adapter:
       gemessen 09.09.2026 wurde daraus `mqtt-client.0.*` mit 322
       Objekten, an einem einzigen Alias. Und `S.werte` wird nie
       geleert, das sammelt sich also.

       Abonniert wird deshalb der Kanal jeder wirklich gelesenen Quelle.
       Wo die Quellen ohnehin gebuendelt liegen, bleibt es bei einem
       Muster; wo nicht, sind es ein paar mehr — aber jedes davon eng. */
    var kanaele = [];
    kindZustaende(id).forEach(function (kid) {
      var q = aliasQuellen(S.objects[kid]);
      [q.read, q.write].forEach(function (x) {
        if (!x) { return; }
        var t = String(x).split('.');
        t.pop();
        var kn = t.join('.');
        if (kn && kanaele.indexOf(kn) === -1) { kanaele.push(kn); }
      });
    });
    /* Ein schmaler Kanal wird als Muster abonniert, ein breiter nicht.

       Bei einem flachen Geraet IST der Kanal der breite Knoten: Die
       Quelle `mqtt-client.0.SmartHome.Lavalampe_POWER` liegt direkt
       unter `SmartHome`, und `SmartHome.*` sind 320 Objekte. Ab dieser
       Schwelle werden die Quellen einzeln abonniert — ein paar Abos
       mehr, dafuer genau die, deren Werte auch angezeigt werden. */
    var SCHWELLE = 30;
    var wieBreit = function (knoten) {
      var n = 0;
      S.keysSorted.forEach(function (k0) { if (k0.indexOf(knoten + '.') === 0) { n++; } });
      return n;
    };
    var drinSchon = function (was) {
      return muster.some(function (m0) {
        var p0 = m0.slice(-2) === '.*' ? m0.slice(0, -2) : m0;
        return was === p0 || was.indexOf(p0 + '.') === 0;
      });
    };

    /* Sparten desselben Geraets zu einem Muster zusammenfassen.

       Ein Tasmota-Alias liest aus `…Licht.stat`, `…Licht.tele` und
       `…Licht.cmnd` — drei Kanaele, ein Geraet, und in der Kopfleiste
       gehoert dort „ein Abo" zu stehen, nicht drei. Zusammengefasst wird
       aber nur, wo wirklich MEHRERE Kanaele unter demselben Knoten
       haengen: Sonst waere aus `…Garten.Weihnachten_aussen` schlicht
       `…Garten` geworden — breiter als noetig, ohne dass etwas
       zusammenfaellt. */
    for (var runde = 0; runde < 4; runde++) {
      var unter = {};
      kanaele.forEach(function (kn) {
        var t = kn.split('.');
        if (t.length <= 3) { return; }
        var ob = t.slice(0, -1).join('.');
        (unter[ob] = unter[ob] || []).push(kn);
      });
      var geaendert = false;
      Object.keys(unter).forEach(function (ob) {
        if (unter[ob].length < 2 || wieBreit(ob) > SCHWELLE) { return; }
        kanaele = kanaele.filter(function (kn) { return unter[ob].indexOf(kn) === -1; });
        if (kanaele.indexOf(ob) === -1) { kanaele.push(ob); }
        geaendert = true;
      });
      if (!geaendert) { break; }
    }

    /* Ein schmaler Kanal wird als Muster abonniert, ein breiter nicht.

       Bei einem flachen Geraet IST der Kanal der breite Knoten: Die
       Quelle `mqtt-client.0.SmartHome.Lavalampe_POWER` liegt direkt
       unter `SmartHome`, und `SmartHome.*` sind 320 Objekte (gemessen
       09.09.2026; vorher wurde daraus sogar `mqtt-client.0.*` mit 322).
       Ab dieser Schwelle werden die Quellen einzeln abonniert — ein paar
       Abos mehr, dafuer genau die, deren Werte auch angezeigt werden. */
    kanaele.forEach(function (kn) {
      if (drinSchon(kn)) { return; }
      if (wieBreit(kn) > SCHWELLE) { return; }
      muster.push(kn + '.*');
    });
    /* Was jetzt noch von keinem Muster gedeckt ist, kommt einzeln. */
    kindZustaende(id).forEach(function (kid) {
      var q = aliasQuellen(S.objects[kid]);
      [q.read, q.write].forEach(function (x) {
        if (x && !drinSchon(x) && muster.indexOf(x) === -1) { muster.push(x); }
      });
    });
  }
  S.abo = muster;
  muster.forEach(function (m) { socket.emit('subscribe', m); });
  zeigeAbozahl();

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
    if (id !== S.current) {
      /* Der Knoten hat gewechselt, waehrend die Werte unterwegs waren.
         Am Entwurf ist hier nichts mehr zu tun — der Rueckruf muss aber
         trotzdem kommen. Sonst bleibt `so59Laeuft` oder `abfrageLaeuft`
         fuer immer gesetzt (der Knopf steht dauerhaft auf „laeuft"), und
         der Trockenlauf nach dem Anlegen fehlender Sendepunkte geht nie
         auf. Zwoelf Sekunden Wartezeit bei einer SetOption59-Abfrage
         sind reichlich Gelegenheit dafuer (09.09.2026). */
      if (typeof fertig === 'function') { fertig(); }
      return;
    }

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
        /* An einem Mehrfachgeraet zaehlt der Alias DIESES Ausgangs,
           nicht der mit den meisten Punkten (C13). */
        var vorhA = aliasFuer(id, ausgangsQuellen(v)) || (v.instanz === null || v.instanz === undefined ? vorh : null);
        if (vorhA && S.objects[vorhA]) { bestandVorrang(v, vorhA); }
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
/* Rueckwaertskarte Quelle -> Alias, einmal je Indexstand.

   `aliasFuer` lief zweimal ueber alle Kennungen — und wird je
   Neuzeichnen mehrfach gerufen. Die Karte entsteht bei der ersten Frage
   nach einem Indexwechsel und beantwortet alle weiteren aus dem
   Gedaechtnis. Erkannt wird der Wechsel an Laenge und erster Kennung;
   `indexNeu()` sortiert ohnehin bei jeder Aenderung neu. */
var alsQuelleKarte = null, alsQuelleStand = '';
function alsQuelleKarten() {
  var stand = S.keysSorted.length + '|' + (S.keysSorted[0] || '');
  if (alsQuelleKarte && alsQuelleStand === stand) { return alsQuelleKarte; }
  var fest = {}, zweig = {};
  mitVorspann('alias.').forEach(function (id) {
    var o = S.objects[id];
    if (!o) { return; }
    if (o.native && o.native.quelle && fest[o.native.quelle] === undefined) {
      fest[o.native.quelle] = id;
    }
    if (o.type !== 'state') { return; }
    var q = aliasQuellen(o);
    [q.read, q.write].forEach(function (x) {
      if (!x) { return; }
      var kanal = id.split('.').slice(0, -1).join('.');
      (zweig[x] = zweig[x] || []).push(kanal);
    });
  });
  alsQuelleKarte = { fest: fest, zweig: zweig };
  alsQuelleStand = stand;
  return alsQuelleKarte;
}

/* Welche Quellen gehoeren zu genau diesem Ausgang?

   An einem Mehrfachgeraet ist "der Alias dieses Geraets" keine
   beantwortbare Frage - es gibt je Ausgang einen, dazu oft einen fuer
   die gemeinsame Messung. Beantwortbar ist nur: welcher gehoert zu dem
   Ausgang, der gerade gewaehlt ist.

   Geraten wird dabei nichts an Namen herum. Gefragt wird die Vorlage:
   welche ihrer Pfade tragen den Platzhalter? Genau die unterscheiden die
   Ausgaenge (bei `tasmota-mehrfach` `stat.POWER%N%` und `cmnd.POWER%N%`),
   alles andere (`tele.SENSOR`, `tele.LWT`) ist allen gemeinsam. Damit
   faellt auch die Falle aus I31 weg: `tele.INFO2` traegt zwar eine Zwei,
   aber keinen Platzhalter - es gehoert zu keinem Ausgang.

   Fuer Ausgang 1 kommt das blanke `cmnd.POWER` dazu. Bei Tasmota ist
   POWER ohne Nummer ein Zweitname fuer POWER1 - am 16.09.2026 an der
   Steckdosenleiste nachgemessen: eine Abfrage an `cmnd/POWER` wird mit
   `{"POWER1":"ON"}` beantwortet, und `stat/POWER` gibt es nicht. Ein
   Alias, der so gebaut wurde, schaltet wirklich Ausgang 1 und gehoert
   dorthin. */
export function ausgangsQuellen(e) {
  if (!e || e.instanz === null || e.instanz === undefined || !e.kanal) { return null; }
  var v = null;
  S.VORLAGEN.forEach(function (x) { if (x.id === e.vorlage) { v = x; } });
  if (!v || !v.mehrfach) { return null; }
  var platz = (v.mehrfach && v.mehrfach.platzhalter) || '%N%';
  var raus = [];
  var dazu = function (p) {
    if (!p) { return; }
    var voll = e.kanal + '.' + p;
    if (raus.indexOf(voll) === -1) { raus.push(voll); }
  };
  (v.zustaende || []).forEach(function (z) {
    [z.lesen, z.schreiben].forEach(function (p) {
      if (!p || String(p).indexOf(platz) === -1) { return; }
      dazu(setzeInstanz(p, v, e.instanz));
      if (String(e.instanz) === '1') { dazu(String(p).split(platz).join('')); }
    });
  });
  return raus.length ? raus : null;
}

/* Mit `ausgang` - der Liste aus `ausgangsQuellen` - fragt sie enger: nur
   ein Alias, der wirklich aus einer dieser Quellen liest oder in eine
   schreibt, gehoert zu diesem Ausgang. Ohne das Argument, und das sind
   alle anderen sieben Aufrufer, bleibt sie Zeile fuer Zeile wie sie war.

   Die Mehrheitsregel unten ist an einem Geraet mit einem Ausgang richtig
   und an einem Mehrfachgeraet die falsche Frage: An Ricardos
   Steckdosenleiste gewann `Verbrauch` mit sechs Punkten aus
   `tele.SENSOR` gegen `RF1000` mit zwei Punkten aus `stat.POWER1`, und
   der Entwurf fuer Ausgang 1 uebernahm dessen Haken. Im Musterfeld stand
   danach "✕ SET fehlt" an einem Geraet mit funktionierendem SET
   (C13, produktiv gemessen 16.09.2026).

   Auch die Abkuerzung ueber `native.quelle` faellt in diesem Fall weg:
   die zeigt auf das GERAET, nicht auf den Ausgang. */
export function aliasFuer(quelle, ausgang) {
  if (ausgang && ausgang.length) {
    var karteA = alsQuelleKarten();
    var zaehlA = {}, bestA = null, vielA = 0;
    ausgang.forEach(function (q0) {
      (karteA.zweig[q0] || []).forEach(function (kanal) {
        zaehlA[kanal] = (zaehlA[kanal] || 0) + 1;
        if (zaehlA[kanal] > vielA) { vielA = zaehlA[kanal]; bestA = kanal; }
      });
    });
    return bestA;
  }
  var karte = alsQuelleKarten();
  var treffer = karte.fest[quelle] || null;
  if (treffer) { return treffer; }

  /* Welcher Aliaskanal liest oder schreibt am haeufigsten in diesen
     Zweig? Einzelne Punkte koennen anderswohin zeigen — ein
     gemeinsamer Sollwert etwa —, deshalb die Mehrheit und nicht der
     erste Treffer. */
  var zaehler = {}, bester = null, wieviel = 0;
  var pre = quelle + '.';
  /* Aus der Karte: welche Aliaskanaele lesen oder schreiben in diesen
     Zweig? Die Quellen stehen dort als volle Kennung, gesucht ist alles
     darunter — also die Kennungen des Zweigs abklappern statt aller
     Aliase. */
  var karte2 = alsQuelleKarten();
  var kanaele = [];
  Object.keys(karte2.zweig).forEach(function (q0) {
    if (q0.indexOf(pre) !== 0) { return; }
    karte2.zweig[q0].forEach(function (kanal) { kanaele.push(kanal); });
  });
  kanaele.forEach(function (kanal) {
    zaehler[kanal] = (zaehler[kanal] || 0) + 1;
    if (zaehler[kanal] > wieviel) { wieviel = zaehler[kanal]; bester = kanal; }
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
  /* `vorlagenWert` heisst, was es heisst: was die VORLAGE sagen wuerde.
     Ist keine in Kraft — abgewaehlt oder nie gefunden —, gibt es nichts,
     wovon etwas abweichen koennte, und die Kopie darf nicht entstehen.

     Bis zum 17.09.2026 wurde sie unbesehen gesetzt, und dann log die
     Zeile: an `hm-rpc.2.NEQ1660737` nach „keine Vorlage" stand an SET
     „weicht von der Vorlage ab" und darunter „Die Vorlage will hier:
     switch" — waehrend im Alias `switch.light` steht, was auf das Muster
     `light` sogar passt. Verglichen wurde in Wahrheit gegen den
     Rohentwurf, also gegen die blanke Rolle des Quellpunkts, und als
     abweichend markiert ausgerechnet der bessere Wert. Dasselbe an einem
     Geraet, zu dem NIE eine Vorlage gefunden wurde (nachgestellt an
     `echt.Warmwasser`): auch dort erschien die Marke. Ricardo: „es gibt
     ja gar keine Vorlage mehr, man kann hoechstens vom Muster
     abweichen." */
  var mitVorlage = !!(e.vorschlag && e.vorlage);
  e.states.forEach(function (s) {
    if (!s.n) { return; }
    var o = S.objects[kanal + '.' + s.n];
    if (!o || !o.common) {
      /* Punkte, die es im Alias nicht gibt, sind auch nicht Teil seines
         Bestands - der Haken der Vorlage darf sie nicht heimlich wieder
         anlegen (Ricardo, 25.08.2026: UNREACH und RSSI standen angehakt,
         obwohl sie im Alias fehlen). Anhaken kann man sie weiterhin, und
         der Chip „Vorlage" holt die Vorgabe der Vorlage zurueck. */
      if (mitVorlage) {
        s.vorlagenWert = { on: s.on, role: s.role, typ: s.typ, unit: s.unit,
                           caption: s.caption, f: s.f, fw: s.fw,
                           srcR: s.srcR, srcW: s.srcW, states: s.states };
      }
      s.on = false;
      return;
    }
    var c = o.common;
    var q = aliasQuellen(o);
    /* Was die Vorlage wollte - fuer den Vergleich und den Knopf. */
    if (mitVorlage) {
      s.vorlagenWert = {
        role: s.role, typ: s.typ, unit: s.unit, caption: s.caption,
        f: s.f, fw: s.fw, srcR: s.srcR, srcW: s.srcW, states: s.states,
        /* Auch der Haken der Vorlage - der Chip „Vorlage" stellt ihn wieder
           her, nachdem der Bestand ihn ueberschrieben hat. */
        on: s.on
      };
    }
    var ist = zeileAusAlias(o, s.n);
    /* Rolle und Typ NUR, wenn sie im Alias ueberhaupt stehen.

       `zeileAusAlias` liefert an dieser Stelle `''` - fuer die anderen
       drei Aufrufer richtig, hier nicht: ein Alias ohne eigene Rolle
       soll die der Vorlage behalten, statt sie gegen einen Leerstring zu
       tauschen. Das ist der eine Unterschied, der beim Zusammenlegen der
       fuenf Stellen erhalten bleiben musste (Y5) - wer ihn wegraeumt,
       nimmt jedem vorlagenbasierten Alias seine Rollen. */
    if (c.role !== undefined) { s.role = c.role; }
    if (c.type !== undefined) { s.typ = c.type; }
    s.unit = ist.unit;
    s.states = c.states;
    /* Die Beschriftung gehoert dem Nutzer - sie wird auch spaeter vom
       Vorlagen-Abgleich nicht angefasst (Ricardo, 25.08.2026).

       Seit dem 12.09.2026 gilt hier dieselbe Regel wie ueberall sonst:
       gleicht sie dem Zeilennamen, bleibt das Feld leer. Vorher stand
       hier `if (c.name !== undefined) s.caption = txt(c.name)` - und
       weil `vomAliasUebernehmen` danach laeuft und verwirft, hing es
       an der Reihenfolge, welche der beiden Antworten man zu sehen
       bekam (U21). */
    if (c.name !== undefined) { s.caption = ist.caption; }
    s.f = ist.f;
    s.fw = ist.fw;
    /* `ist.srcR`, nicht `q.read`: bei einem Taster laesst
       `zeileAusAlias` die Lesequelle bewusst leer, obwohl `alias.id` eine
       Kennung nennt (K23). Die Wache auf `q.read` bleibt — sie verhindert,
       dass ein Alias ohne Quellangabe die vorhandene ueberschreibt. */
    if (q.read) { s.srcR = ist.srcR; }
    s.srcW = ist.srcW;
    s.on = true;
    s.ausBestand = true;
  });
  /* Punkte, die es im Alias gibt, die Vorlage aber nicht kennt, sind
     schon ueber `alleUndVorlage` bzw. den Bestandsabgleich drin - hier
     wird nur ueberschrieben, was beide kennen. */
  e.bestandGilt = true;
  return e;
}

/* Wo weicht der Entwurf vom gespeicherten Alias ab?

   Das ist die Gegenrichtung zu `vorlagenAbweichung`: Dort wird gegen das
   verglichen, was die Vorlage will, hier gegen das, was schon in der
   Datenbank steht.

   Der Fall, fuer den es gebaut ist: Wer das Muster oder die Vorlage
   wechselt, bekommt die Rollen automatisch angepasst — `switch.light`
   passt auf kein socket-SET, also baut die Werkbank sie um. Das ist
   richtig so, nur sah man an der Zeile nicht, dass damit etwas anderes
   geschrieben wuerde als bisher dasteht. Sichtbar war es allein an den
   Sammelchips oben und im Trockenlauf (Ricardo, 06.09.2026).

   Verglichen wird gegen das Objekt, nicht gegen eine Kopie: Nach einem
   Vorlagenwechsel traegt die Zeile den Vorlagenstand, und `vorlagenWert`
   haelt genau denselben — eine Kopie brachte hier also nichts. */
export function bestandsAbweichung(s, aliasId) {
  if (!s || !s.n || !s.on || !aliasId) { return []; }
  var o = S.objects[aliasId + '.' + s.n];
  if (!o || !o.common) { return []; }
  var ist = zeileAusAlias(o, s.n);
  var raus = [];
  ['role', 'typ', 'unit', 'f', 'fw', 'srcR', 'srcW'].forEach(function (k) {
    var jetzt = s[k] || '';
    if (jetzt !== ist[k]) { raus.push({ feld: k, jetzt: jetzt, bestand: ist[k] }); }
  });
  return raus;
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
