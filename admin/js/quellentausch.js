/* Die Quelle eines Alias austauschen.

   Der Fall: Ein Geraet geht kaputt und wird ersetzt. Der Alias soll
   bleiben, wie er ist - dieselbe Kennung, dieselbe Aufzeichnung in der
   Datenbank, dieselbe Zuordnung zu Raum und Funktion -, nur eben auf das
   neue Geraet zeigen (Ricardos Punkt 17).

   Geaendert wird deshalb so wenig wie moeglich: je Punkt `common.alias.id`
   und am Kanal `native.quelle`. Alles andere bleibt unberuehrt. Das ist
   der ganze Unterschied zum Neu-Anlegen, das den Alias aus der Vorlage
   heraus neu baut und dabei Namen, Rollen und Formeln mitbringt.

   Zugeordnet wird in drei Stufen, absteigend nach Verlaesslichkeit:
     1. gleicher relativer Pfad  (…ABC.1.STATE → …XYZ.1.STATE)
     2. ueber die Vorlage        (der Punkt weiss aus `native.ausZustand`,
                                  aus welcher Zeile er stammt)
     3. ueber Rolle und Namen    (nur als Vorschlag, sichtbar markiert)
   Was nichts findet, bleibt leer - und laesst sich dann entfernen. */

import { S } from './zustand.js';
import { $, el } from './basis.js';
import { tr, txt } from './sprache.js';
import { socket } from './verbindung.js';
import { aliasQuellen, kindZustaende } from './werte.js';
import { holeZweig, indexNeu } from './objekte.js';
import { waehle, knotenDa } from './entwurf.js';
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
function geraten(altQuelle, neuKanal) {
  var name = altQuelle.split('.').pop();
  var kandidaten = kindZustaende(neuKanal);
  var treffer = '';
  kandidaten.forEach(function (id) {
    if (!treffer && id.split('.').pop() === name) { treffer = id; }
  });
  if (treffer) { return treffer; }
  var altO = S.objects[altQuelle];
  var rolle = altO && altO.common && altO.common.role;
  if (rolle) {
    kandidaten.forEach(function (id) {
      var o = S.objects[id];
      if (!treffer && o && o.common && o.common.role === rolle) { treffer = id; }
    });
  }
  return treffer;
}

/* Die Zuordnungstabelle: je Alias-Punkt, was heute gilt und was danach
   gelten soll. `stufe` sagt, wie verlaesslich der Vorschlag ist. */
export function tauschPlan(kanal, neuKanal) {
  var altK = alteQuelle(kanal);
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
    /* 2. ueber die Vorlage */
    if (!zeile.neuR) {
      var v = ausVorlage(id, neuKanal);
      if (v && v.read) { zeile.neuR = v.read; zeile.stufe = 2; if (v.write) { zeile.neuW = v.write; } }
    }
    /* 3. geraten */
    if (!zeile.neuR && zeile.altR) {
      var g = geraten(zeile.altR, neuKanal);
      if (g) { zeile.neuR = g; zeile.stufe = 3; }
    }
    if (!zeile.neuW && zeile.altW) {
      var gw = geraten(zeile.altW, neuKanal);
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
    /* Bei einfacher Quelle gilt die Lesequelle fuer beides. */
    if (zeile.einfach && zeile.neuR) { zeile.neuW = zeile.neuR; }
    return zeile;
  });
}

/* Was der Tausch am Ende schreibt - dieselbe Form wie `baueObjekte`,
   damit der Trockenlauf-Dialog sie unveraendert anzeigen kann. */
export function tauschObjekte(kanal, neuKanal, plan, weg) {
  var raus = [];
  var k = S.objects[kanal];
  if (k) {
    var kn = JSON.parse(JSON.stringify(k));
    delete kn.ts; delete kn.from; delete kn.user; delete kn.acl; delete kn._id;
    kn.native = kn.native || {};
    kn.native.quelle = neuKanal;
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
    else if (z.einfach) { a.id = z.neuR; }
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
  /* Auch die Suche faengt neu an. Sie blieb sonst stehen, und beim
     naechsten Oeffnen zeigte der Baum „Kein Geraet gefunden" — im
     schlimmsten Fall genau dann, wenn im Feld noch das eben getauschte,
     inzwischen geloeschte Geraet stand (W13, gemessen 26.08.2026). */
  S.tauschFilter = '';
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
    zeichneTausch();
  };
  zeichneAuswahlbaum(baumHost, S.tauschFilter, gewaehlt);
  feld.addEventListener('input', function () {
    S.tauschFilter = feld.value;
    zeichneAuswahlbaum(baumHost, S.tauschFilter, gewaehlt);
  });

  var go = $('#btn-swap-go');
  if (!S.tauschNeu) { if (go) { go.disabled = true; } return; }
  if (S.tauschNeu === alt) {
    body.appendChild(el('div', 'aside w', tr('swap.same')));
    if (go) { go.disabled = true; }
    return;
  }

  /* Die Zuordnung, Zeile fuer Zeile. */
  if (!S.tauschPlan) { S.tauschPlan = tauschPlan(kanal, S.tauschNeu); }
  var plan = S.tauschPlan;
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
    var nm = el('span', 'sn', z.name);
    if (gleich) { nm.appendChild(el('span', 'rat', tr('swap.unchanged'))); }
    else if (z.stufe === 3) { nm.appendChild(el('span', 'rat', tr('guess.mark'))); }
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
      /* Lesequelle gefunden, Schreibquelle nicht — das gehoert gesagt.
         Sonst steht nur die neue Lesequelle in Gruen da, und dass der
         Punkt danach nirgendwohin schreibt, merkt man erst am Geraet. */
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
    }
    r.appendChild(rechts);
    k.appendChild(r);
  });
  body.appendChild(k);

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

  var arbeit = tauschObjekte(kanal, neu, S.tauschPlan, S.tauschWeg);
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
    if (!loeschen.length) { return fertig(); }
    var offen2 = loeschen.length;
    loeschen.forEach(function (id) {
      socket.emit('delObject', id, function (err) {
        if (err) { fehler.push(id + ': ' + err); }
        else { delete S.objects[id]; }
        if (--offen2 === 0) { indexNeu(); fertig(); }
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

/* Der Knopf gilt fuer dasselbe wie Verlegen und Entfernen: einen Alias,
   den es gibt. */
export function tauschKnopf(zeigen) {
  var b = $('#btn-swap');
  if (b) { b.hidden = !zeigen; }
}
