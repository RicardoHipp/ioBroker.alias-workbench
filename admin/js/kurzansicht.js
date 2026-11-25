/* Die Kurzansicht rechts (0.15).

   Rueckmeldung aus dem Forum, mehrfach: der erste Eindruck erschlaegt -
   Vorlagenkasten, Musterwahl, MQTT-Karte, zwanzig Zeilen mit Rollen und
   Formeln, alles auf einmal. Gebraucht wird davon im Normalfall nichts:
   Die Werkbank stellt Vorlage, Rollen, Formeln, Name, Raum und Funktion
   selbst ein, und wenn sie passen, ist der Alias mit einem Klick fertig.

   Die Kurzansicht baut deshalb NICHTS neu. Sie blendet die Teile der
   heutigen Ansicht aus, die man nur zum Nachbessern braucht (Klasse
   `nur-detail`), und setzt eine Karte dazu: als was das Geraet erkannt
   wurde, eine Ampel aus den Pruefungen und eine Vorschau, wie der Alias
   danach im Objekt-Explorer aussieht. Kopf, Raum, Funktion, Ablageort
   und Name bleiben - das sind dieselben Felder wie in der Detailansicht,
   keine zweite Ausfuehrung davon. Geschrieben wird ueber denselben Knopf
   unten in der Leiste (Ricardo, 25.11.2026).

   Mit welcher Ansicht ein Geraet aufgeht, sagt die Einstellung
   `startView` der Instanz: `short` (Vorgabe) - jedes Geraet geht kurz
   auf, der Umschalter gilt nur bis zum naechsten; `detail` - immer
   ausfuehrlich; `remember` - die zuletzt gewaehlte, gemerkt im
   localStorage des Browsers wie der Klappstand des Baums (Ricardo,
   25.11.2026: „die Kurzansicht soll beim Wechsel immer angezeigt
   werden"). */

import { S } from './zustand.js';
import { $, el } from './basis.js';
import { tr, txt } from './sprache.js';
import { enums } from './enums.js';
import { fmt } from './werte.js';
import { musterName } from './musternamen.js';
import { vorlageMitId } from './vorlagenblatt.js';
import { pruefErgebnisse } from './pruefungen.js';
import { rateAnzahl } from './vorschlagen.js';
import { mqttBefunde, mqttAufklappen } from './mqtt.js';
import { zeichneErgebnis } from './ergebnis.js';
import { baueObjekte, verwaiste, unveraendert, pruefeSchreiben } from './schreiben.js';
import { knotenDa } from './entwurf.js';
import { einstWert } from './einstellungen.js';

var ANSICHT_SCHLUESSEL = 'alias-workbench.ansicht';

var ansicht = 'kurz';

/* Die Ansicht, mit der ein frisch gewaehltes Geraet aufgeht. */
function startAnsicht() {
  var w = einstWert('startView');
  if (w === 'detail') { return 'detail'; }
  if (w === 'remember') {
    try {
      if (window.localStorage.getItem(ANSICHT_SCHLUESSEL) === 'detail') { return 'detail'; }
    } catch { /* gesperrter Speicher: dann eben kurz */ }
  }
  return 'kurz';
}

/* Gerufen bei jedem Zeichnen; nur ein ANDERES Geraet setzt die Ansicht
   zurueck. Neu gezeichnet wird auch bei jedem eintreffenden Wert und
   nach dem Sprung aus der Ampel - da soll die Wahl stehen bleiben. */
var letzterKnoten = null;
export function ansichtFuer(knoten) {
  if (knoten === letzterKnoten) { return; }
  letzterKnoten = knoten;
  ansicht = startAnsicht();
  wendeAnsichtAn();
}

export function istKurz() { return ansicht === 'kurz'; }

/* Umschalten zeichnet nichts neu - beide Haelften stehen schon im
   Dokument, es wechselt nur, welche sichtbar ist. Ein Neuzeichnen
   wuerde ein offenes Detail oder den Fokus im Feld verlieren. */
export function setzeAnsicht(a) {
  ansicht = (a === 'detail') ? 'detail' : 'kurz';
  try { window.localStorage.setItem(ANSICHT_SCHLUESSEL, ansicht); } catch { /* privat oder voll */ }
  wendeAnsichtAn();
}

export function wendeAnsichtAn() {
  document.body.classList.toggle('ansicht-kurz', ansicht === 'kurz');
  var bk = $('#btn-ansicht-kurz'), bd = $('#btn-ansicht-detail');
  if (bk) { bk.classList.toggle('an', ansicht === 'kurz'); bk.setAttribute('aria-pressed', String(ansicht === 'kurz')); }
  if (bd) { bd.classList.toggle('an', ansicht === 'detail'); bd.setAttribute('aria-pressed', String(ansicht === 'detail')); }
}

/* Der Umschalter steht nur, wo es etwas umzuschalten gibt: an einem
   Entwurf. Nicht im leeren Zustand, nicht an der Ordneruebersicht und
   nicht im Vorlagen-Reiter. */
export function zeigeUmschalter(ja) {
  var u = $('#ansicht');
  if (u) { u.hidden = !ja; }
  /* Nur mit Entwurf stehen Anlegen und Pruefungen in der Karte - sonst
     bleibt die Leiste unten, wie sie ist. */
  document.body.classList.toggle('mit-entwurf', !!ja);
}

/* Der Hinweis am Umschalter: wo sich einstellen laesst, womit ein Geraet
   aufgeht (Q15). Kein `title` - den zeichnet das Betriebssystem als eine
   lange Zeile, und am rechten Rand ragte er aus dem Fenster (Ricardo,
   25.11.2026). Eigenes Kaestchen: mehrzeilig, unter dem Umschalter,
   rechtsbuendig, und nie ausserhalb des Fensters. */
function verkabeleHinweis(gruppe) {
  var tipp = el('div', 'ktipp');
  tipp.id = 'ansicht-tipp';
  tipp.setAttribute('role', 'tooltip');
  tipp.hidden = true;
  document.body.appendChild(tipp);
  gruppe.setAttribute('aria-describedby', tipp.id);
  var timer = null;
  var zeige = function () {
    clearTimeout(timer);
    timer = setTimeout(function () {
      tipp.textContent = tr('short.viewTip');
      tipp.hidden = false;
      var r = gruppe.getBoundingClientRect();
      var b = tipp.offsetWidth, h = tipp.offsetHeight;
      var x = Math.max(8, Math.min(r.right - b, window.innerWidth - b - 8));
      var y = r.bottom + 8;
      if (y + h > window.innerHeight - 8) { y = Math.max(8, r.top - h - 8); }
      tipp.style.left = x + 'px';
      tipp.style.top = y + 'px';
    }, 350);
  };
  var weg = function () { clearTimeout(timer); tipp.hidden = true; };
  gruppe.addEventListener('mouseenter', zeige);
  gruppe.addEventListener('mouseleave', weg);
  gruppe.addEventListener('focusin', zeige);
  gruppe.addEventListener('focusout', weg);
  gruppe.addEventListener('click', weg);
}

function verkabeln() {
  var bk = $('#btn-ansicht-kurz'), bd = $('#btn-ansicht-detail');
  if (bk) { bk.addEventListener('click', function () { setzeAnsicht('kurz'); }); }
  if (bd) { bd.addEventListener('click', function () { setzeAnsicht('detail'); }); }
  var gr = $('#ansicht');
  if (gr) { verkabeleHinweis(gr); }
  wendeAnsichtAn();
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', verkabeln);
} else {
  verkabeln();
}

/* Alles, was `host` ab `ab` an Kindern bekommen hat, gehoert zur
   Detailansicht. */
export function markiereDetail(host, ab) {
  for (var i = ab; i < host.children.length; i++) {
    host.children[i].classList.add('nur-detail');
  }
}

function enumName(id, objs) {
  if (!id) { return ''; }
  var o = null;
  objs.forEach(function (x) { if (x.istEnum && x.id === id) { o = x.obj; } });
  if (!o) { o = enums[id]; }
  var n = o && o.common ? txt(o.common.name) : '';
  return n || id.split('.').pop();
}

/* --- Wohin ein Befund in der Detailansicht fuehrt ---

   „In der Detailansicht ansehen" schaltete nur um; dann suchte man den
   Bereich selbst (Ricardo, 25.11.2026). Jetzt geht es dorthin, wo man
   etwas tun kann, und der Bereich ist aufgeklappt:
     MQTT-Befunde, „publish" und „Rueckmeldung"  → die MQTT-Karte, denn
       dort werden Sendepunkte angelegt, repariert und SetOption59
       gestellt;
     alles, was einzelne Zeilen nennt             → die erste Zeile,
       aufgeklappt;
     der Rest (Muster, Sperren)                   → nach oben, zum
       Vorlagenkasten. */
function zielVon(c) {
  if (c.feld) { return { feld: c.feld }; }
  if (c.mqtt || c.t === tr('check.publish') || c.t === tr('check.feedback')) { return { mqtt: true }; }
  if (c.zeilen && c.zeilen.length) { return { zeile: c.zeilen[0] }; }
  return { oben: true };
}

function springe(e, ziel) {
  /* Raum und Funktion stehen in beiden Ansichten - hinein, nicht umschalten. */
  if (ziel.feld) {
    var f = document.querySelector('#res .enumfeld[data-feld="' + ziel.feld + '"]');
    if (f) { f.scrollIntoView({ block: 'center' }); f.focus(); }
    return;
  }
  if (ziel.mqtt) { mqttAufklappen(); }
  if (ziel.zeile) {
    S.openRow = null;
    e.states.forEach(function (s, i) { if (S.openRow === null && s.n === ziel.zeile) { S.openRow = i; } });
  }
  setzeAnsicht('detail');
  zeichneErgebnis();
  var hin = ziel.mqtt ? $('#res .mqttkarte')
    : (ziel.zeile ? document.querySelector('#res .erow[data-zeile="' + String(ziel.zeile).replace(/"/g, '\\"') + '"]') : null);
  var scroller = $('.resscroll');
  if (hin) {
    hin.scrollIntoView({ block: 'center' });
    hin.classList.add('kblitz');
    setTimeout(function () { hin.classList.remove('kblitz'); }, 1600);
  } else if (scroller) {
    scroller.scrollTop = 0;
  }
}

/* --- Ampel --- */
function baueAmpel(e, haupt, pflichtFehlt) {
  var sperren = pruefeSchreiben(e);
  var offen = rateAnzahl(e);
  if (offen) { sperren.push(tr('guess.locked', offen)); }
  var items = pruefErgebnisse(e, haupt, pflichtFehlt);
  /* Dazu, was die MQTT-Karte im Kopf meldet - offline, Sendepunkte
     fehlen, verzoegerte Rueckmeldung. Meldet die Pruefung „publish" schon
     fehlende oder stumme Sendepunkte dieses Alias, sagen `fehlen`/`stumm`
     der Karte dasselbe noch einmal; dann bleiben sie weg. */
  var publishSchlecht = items.some(function (c) { return c.t === tr('check.publish') && c.s === 'bad'; });
  mqttBefunde(e.kanal).forEach(function (b) {
    if (publishSchlecht && (b.art === 'fehlen' || b.art === 'stumm')) { return; }
    if (b.art === 'sofort' && items.some(function (c) { return c.t === tr('check.feedback') && c.s === 'warn'; })) { return; }
    items.push({ s: b.s, t: tr('mq.title'), d: b.t, mqtt: true });
  });
  /* Kein Raum, keine Funktion: ein Hinweis, kein Fehler - gesperrt wird
     nichts, ein Stromzaehler gehoert eben keinem Raum. */
  if (!e.raum) { items.push({ s: 'warn', t: tr('short.noRoom'), d: tr('short.noRoomWhy'), feld: 'raum' }); }
  if (!e.funktion) { items.push({ s: 'warn', t: tr('short.noFunction'), d: tr('short.noFunctionWhy'), feld: 'funktion' }); }
  var schlecht = items.filter(function (c) { return c.s === 'bad'; });
  var warn = items.filter(function (c) { return c.s === 'warn'; });

  var stufe = (sperren.length || schlecht.length) ? 'bad' : (warn.length ? 'warn' : 'ok');
  var k = el('div', 'kampel ' + stufe);
  k.appendChild(el('span', 'kpunkt'));
  var txtTeil = el('div');
  txtTeil.appendChild(el('b', null, stufe === 'ok' ? tr('short.allGood')
    : (stufe === 'warn' ? tr('short.worksWithHints') : tr('short.needsAttention'))));
  if (stufe === 'ok') {
    txtTeil.appendChild(document.createTextNode(' ' + tr('short.allGoodText')));
  } else {
    var ul = el('ul');
    var erstesZiel = null;
    var eintrag = function (text, ziel) {
      var li = el('li', ziel ? 'kspringt' : null, text);
      if (ziel) {
        if (!ziel.feld) { li.title = tr('short.showInDetail'); }
        li.addEventListener('click', function () { springe(e, ziel); });
        /* Raum/Funktion stehen schon da - der Link darunter fuehrt in
           die Detailansicht, also zum ersten Befund, der dort liegt. */
        if (!erstesZiel && !ziel.feld) { erstesZiel = ziel; }
      }
      ul.appendChild(li);
    };
    sperren.forEach(function (t) { eintrag(t, { oben: true }); });
    schlecht.concat(warn).forEach(function (c) { eintrag(c.t + ': ' + c.d, zielVon(c)); });
    txtTeil.appendChild(ul);
    if (erstesZiel) {
      var weiter = el('button', 'klink', tr('short.showInDetail'));
      weiter.type = 'button';
      weiter.addEventListener('click', function () { springe(e, erstesZiel); });
      txtTeil.appendChild(weiter);
    }
  }
  k.appendChild(txtTeil);
  return k;
}

/* --- Vorschau wie im Objekt-Explorer --- */
function baueVorschau(e) {
  var ziel = e.ziel || e.kanal;
  var objs;
  try { objs = baueObjekte(e); } catch { return null; }
  var weg = [];
  try { weg = verwaiste(e).filter(function (x) { return x.vorgabe; }); } catch { weg = []; }

  var nachId = {};
  objs.forEach(function (x) { if (!x.istEnum) { nachId[x.id] = x; } });
  var zeileVon = {};
  e.states.forEach(function (s) { if (s.n) { zeileVon[ziel + '.' + s.n] = s; } });

  var reihen = [];
  var teile = String(ziel).split('.');
  /* Die Ebenen darueber - die vorhandenen grau, als Orientierung. */
  for (var i = 2; i < teile.length; i++) {
    var pfad = teile.slice(0, i).join('.');
    var x0 = nachId[pfad];
    var o0 = S.objects[pfad];
    reihen.push({ id: pfad, tiefe: i - 2, art: (x0 ? x0.obj.type : (o0 && o0.type)) || 'folder',
      name: txt(x0 ? x0.obj.common.name : (o0 && o0.common && o0.common.name)),
      stand: x0 ? 'neu' : 'bestand' });
  }
  var kx = nachId[ziel];
  /* Raum und Funktion stehen nicht am Kanal, sondern in den
     Aufzaehlungen - wechselt einer, ist der Kanal trotzdem „geaendert",
     sonst stuende der Knopf aktiv da und die Legende sagte „0 geaendert". */
  var enumWechsel = objs.some(function (x) { return x.istEnum && (x.dazu || x.weg); });
  if (kx) {
    reihen.push({ id: ziel, tiefe: teile.length - 2, art: kx.obj.type, name: txt(kx.obj.common.name),
      rolle: kx.obj.common.role || '', raum: enumName(e.raum, objs), funktion: enumName(e.funktion, objs),
      stand: kx.neu ? 'neu' : ((unveraendert(kx.id, kx.obj) && !enumWechsel) ? 'gleich' : 'geaendert') });
  }
  objs.forEach(function (x) {
    if (x.istEnum || x.obj.type !== 'state') { return; }
    var s = zeileVon[x.id];
    reihen.push({ id: x.id, tiefe: teile.length - 1, art: 'state', name: txt(x.obj.common.name),
      rolle: x.obj.common.role || '', wert: s ? fmt(s) : '',
      stand: x.neu ? 'neu' : (unveraendert(x.id, x.obj) ? 'gleich' : 'geaendert') });
  });
  weg.forEach(function (w) {
    var o = S.objects[w.id] || {};
    reihen.push({ id: w.id, tiefe: teile.length - 1, art: 'state', name: txt(o.common && o.common.name),
      rolle: (o.common && o.common.role) || '', stand: 'weg' });
  });

  var box = el('div', 'kvorschau');
  box.appendChild(el('div', 'kvkopf', tr('short.previewHead')));
  var tab = el('div', 'kvtab');
  var kopf = el('div', 'kvzeile kvcap');
  [tr('short.colId'), tr('short.colName'), tr('short.colRole'), tr('short.colRoom'),
    tr('short.colFunction'), tr('short.colValue')].forEach(function (t) { kopf.appendChild(el('span', null, t)); });
  tab.appendChild(kopf);
  reihen.forEach(function (r) {
    var z = el('div', 'kvzeile ' + r.stand);
    var idz = el('span', 'kvid');
    idz.style.paddingLeft = (r.tiefe * 14) + 'px';
    idz.appendChild(el('span', 'kvart', String(r.art || '').slice(0, 3)));
    /* Die Wurzel heisst mit Instanz, wie im Objekt-Explorer - „0" allein
       sagt nichts. */
    idz.appendChild(document.createTextNode(r.tiefe === 0 ? r.id : r.id.split('.').pop()));
    idz.title = r.id;
    z.appendChild(idz);
    z.appendChild(el('span', 'kvname', r.name || ''));
    z.appendChild(el('span', 'kvrolle', r.rolle || ''));
    z.appendChild(el('span', null, r.raum || ''));
    z.appendChild(el('span', null, r.funktion || ''));
    z.appendChild(el('span', 'kvwert', r.wert || ''));
    tab.appendChild(z);
  });
  box.appendChild(tab);
  var neu = reihen.filter(function (r) { return r.stand === 'neu'; }).length;
  var geaendert = reihen.filter(function (r) { return r.stand === 'geaendert'; }).length;
  box.appendChild(el('div', 'kvlegende', tr('short.legend', neu, geaendert, weg.length)));
  return box;
}

/* Die Karte der Kurzansicht. */
export function baueKurzkarte(e, haupt, pflichtFehlt) {
  var karte = el('div', 'card kurzkarte nur-kurz');

  var erk = el('div', 'kerkannt' + (haupt ? '' : ' ohne'));
  var links = el('div');
  var tpl = e.vorlage ? vorlageMitId(e.vorlage) : null;
  var muster = e.want ? (musterName(e.want) || e.want) : '';
  if (haupt) {
    links.appendChild(el('div', 'kgross', tr('short.recognized', tpl ? txt(tpl.name) : muster)));
    var anz = e.states.filter(function (s) { return s.on && s.n; }).length;
    links.appendChild(el('div', 'kklein', tr('short.seenAs', muster, anz)));
  } else {
    links.appendChild(el('div', 'kgross', tr('short.notRecognized')));
    links.appendChild(el('div', 'kklein', tr('short.notRecognizedHint')));
  }
  erk.appendChild(links);
  /* Mehrere Ausgaenge (Mehrfachvorlage): die Ausgangswahl auch hier. Sie
     ist nur ein zweiter Griff auf das Feld im Vorlagenkasten - gewaehlt
     wird dort, mit derselben Frage nach dem Bestand (C13). Ohne sie sah
     man in der Kurzansicht nur Ausgang 1 (Ricardo, 25.11.2026). */
  var original = document.querySelector('#res .ausgangwahl');
  if (e.instanzen && e.instanzen.length > 1 && original) {
    var la = el('label', 'kausgang');
    la.appendChild(el('span', null, tr('tpl.output')));
    var sel = el('select', 'tx');
    [].forEach.call(original.options, function (o) {
      var k = el('option', null, o.textContent);
      k.value = o.value;
      if (o.selected) { k.selected = true; }
      sel.appendChild(k);
    });
    sel.addEventListener('change', function () {
      original.value = sel.value;
      original.dispatchEvent(new Event('change', { bubbles: true }));
    });
    la.appendChild(sel);
    erk.appendChild(la);
  }
  var aendern = el('button', 'klink', tr('short.change'));
  aendern.type = 'button';
  aendern.addEventListener('click', function () { setzeAnsicht('detail'); });
  erk.appendChild(aendern);
  karte.appendChild(erk);

  karte.appendChild(baueAmpel(e, haupt, pflichtFehlt));
  var v = baueVorschau(e);
  if (v) { karte.appendChild(v); }
  karte.appendChild(baueKnoepfe(e));
  return karte;
}

/* Wuerde „Alias aktualisieren" ueberhaupt etwas aendern?

   Am fertigen Alias, an dem nichts anders ist, stand der grosse blaue
   Knopf trotzdem da - und verunsicherte eher (Ricardo, 25.11.2026).
   Gefragt wird dieselbe Rechnung wie Vorschau und Trockenlauf:
   neue oder geaenderte Objekte, Aufzaehlungen (`enumAenderungen` liefert
   nur, was sich aendert - Mitglied rein oder raus, ein nachgetragenes
   Bild) und vorgewaehlt wegfallende Punkte. Im Zweifel ja: ein
   Rechenfehler soll den Knopf nicht sperren. */
function wuerdeAendern(e) {
  var objs;
  try { objs = baueObjekte(e); } catch { return true; }
  if (objs.some(function (x) { return x.istEnum || x.neu || !unveraendert(x.id, x.obj); })) { return true; }
  try { return verwaiste(e).some(function (w) { return w.vorgabe; }); } catch { return true; }
}

/* Die Knoepfe unter der Vorschau (Ricardo, 25.11.2026): gross, dort, wo
   man nach dem Lesen ist. Sie tun nichts Eigenes - sie druecken die Knoepfe
   der Leiste unten, die in der Kurzansicht dafuer ausgeblendet sind.
   Beschriftung, Sperre und Hinweis kommen von dort; `setzeKnoepfe` hat sie
   gerade eben gesetzt. */
function spiegel(quelle, klasse, mitChip) {
  var b = el('button', 'btn ' + klasse);
  b.type = 'button';
  /* Ohne die drei Punkte der Leiste („Alias erzeugen …") - in der Karte
     will Ricardo sie nicht (25.11.2026). */
  b.textContent = (mitChip ? quelle.childNodes[0].nodeValue : quelle.textContent)
    .replace(/\s*(…|\.\.\.)\s*$/, '').trim();
  b.disabled = quelle.disabled;
  if (quelle.title) { b.title = quelle.title; }
  if (mitChip) {
    var c = $('#checkchip');
    if (c && c.textContent) { b.appendChild(document.createTextNode(' ')); b.appendChild(el('span', c.className, c.textContent)); }
  }
  b.addEventListener('click', function () { quelle.click(); });
  return b;
}

function baueKnoepfe(e) {
  var leiste = el('div', 'kknoepfe');
  var bd = $('#btn-dry'), ba = $('#btn-dry-alle'), bc = $('#btn-checks');
  if (bd) {
    var kb = spiegel(bd, 'primary kgross');
    leiste.appendChild(kb);
    /* Nur am bestehenden Alias - beim Anlegen entsteht ja immer etwas. */
    if (!kb.disabled && knotenDa(e.ziel || e.kanal) && !wuerdeAendern(e)) {
      kb.disabled = true;
      kb.title = tr('short.noChanges');
      leiste.appendChild(el('span', 'kleer', tr('short.noChanges')));
    }
  }
  if (ba && !ba.hidden) { leiste.appendChild(spiegel(ba, 'primary kgross')); }
  if (bc) { leiste.appendChild(spiegel(bc, 'kgross', true)); }
  var mehr = el('button', 'btn kgross kmehr', tr('short.needMore'));
  mehr.type = 'button';
  mehr.addEventListener('click', function () { setzeAnsicht('detail'); });
  leiste.appendChild(mehr);
  return leiste;
}

/* Hat die Leiste unten in der Kurzansicht noch etwas zu tragen? Anlegen und
   Pruefungen stehen dann in der Karte; uebrig bleiben im Aliasmodus
   Verlegen, Quelle tauschen und Entfernen. Ohne die faellt die Leiste weg. */
export function leisteFrisch() {
  var fb = document.querySelector('.footbar');
  if (!fb) { return; }
  var rest = ['#btn-move', '#btn-swap', '#btn-del'].some(function (w) {
    var b = $(w);
    return b && !b.hidden;
  });
  fb.classList.toggle('nur-kern', !rest);
}
