/* Die aufgeklappte Zeile: Quellen, Formeln, Rolle, Typ, Einheit. */

import { S } from './zustand.js';
import { socket } from './verbindung.js';
import { el } from './basis.js';
import { tr } from './sprache.js';
import { wertVon, jsonFelder, feldAusFormel, feldFormel, feldWert, jsonVon } from './werte.js';
import { musterVon, erkenneEntwurf } from './erkennung.js';
import { musterName } from './musternamen.js';
import { rollenFeld } from './rollenwahl.js';
import { opt , quellenAuswahl, vorlagenAbweichung } from './entwurf.js';
import { zeichneErgebnis, entwurfAngefasst } from './ergebnis.js';

import { rateBehalten } from './vorschlagen.js';
import { dtZeile } from './vorlagenblatt.js';
import './mqtt.js';



/* ================== Aufgeklappte Zeile: hier wird bearbeitet ================== */
export function detailZeile(e, s, idx) {
  var d = el('div', 'detail');
  var quellen = quellenAuswahl(e);

  function zeile(k, inhalt, cls) { return dtZeile(d, k, inhalt, cls); }

  /* Wer die Zeile anfasst, hat entschieden - die Vermutung ist damit
     keine mehr und faellt beim Zuruecknehmen nicht mehr weg. */
  function neu() { s.geaendert = true; rateBehalten(s); entwurfAngefasst(); zeichneErgebnis(); }

  /* ---- Wo die Vorlage etwas anderes will --------------------------

     Die zugeklappte Zeile sagt nur, DASS etwas abweicht. Welches Feld,
     steht hier: die betroffene Zeile wird getoent, ihr Tooltip nennt den
     Wert der Vorlage, und ein Knopf daneben uebernimmt genau diesen
     einen Wert (Ricardo, 06.09.2026).

     Vorher gab es die Uebernahme nur als Sammelaktion ueber der Liste —
     alles oder nichts. Wer eine Rolle angleichen wollte, ohne die
     Formeln mitzunehmen, musste tippen.

     `geaendert` wird dabei ABSICHTLICH nicht gesetzt: Sonst faellt die
     Marke an der Zeile weg (sie haengt an `!s.geaendert`), und die
     restlichen Abweichungen waeren unsichtbar. Wer alle uebernimmt,
     dessen Marke verschwindet von selbst — dann weicht ja nichts mehr
     ab. */
  var abwListe = vorlagenAbweichung(s);
  var abwNach = {};
  abwListe.forEach(function (x) { abwNach[x.feld] = x; });

  function zeigeAbweichung(r, felder) {
    if (!r) { return; }
    var treffer = felder.filter(function (f) { return abwNach[f]; });
    if (!treffer.length) { return; }
    r.classList.add('abw');
    r.title = treffer.map(function (f) {
      var v = abwNach[f].vorlage;
      return v ? tr('detail.tplWants', v) : tr('detail.tplWantsEmpty');
    }).join(String.fromCharCode(10));

    var b = el('button', 'btn winzig abwnimm', '←');
    b.title = tr('detail.takeOne');
    b.addEventListener('click', function (ev) {
      ev.stopPropagation();
      var v = s.vorlagenWert;
      if (!v) { return; }
      treffer.forEach(function (f) { s[f] = v[f]; });
      rateBehalten(s);
      entwurfAngefasst();
      zeichneErgebnis();
    });
    r.appendChild(b);
  }

  /* --- Name, nur bei selbst angelegten --- */
  if (s.manuell) {
    var iN = el('input', 'tx w');
    iN.type = 'text';
    iN.value = s.n;
    iN.placeholder = tr('detail.namePlaceholder');
    if (!s.n) { iN.className += ' miss'; }
    iN.addEventListener('click', function (ev) { ev.stopPropagation(); });
    iN.addEventListener('change', function () {
      s.n = iN.value.trim().toUpperCase().replace(/\s+/g, '_');
      neu();
    });
    zeile(tr('detail.name'), iN);
  } else if (s.urId) {
    zeile(tr('detail.objectId'), s.urId);
  } else {
    zeile(tr('detail.willBecome'), (e.ziel || e.kanal) + '.' + s.n);
  }

  /* --- Quelle lesen + JSON-Feld --- */
  var qf = el('div', 'fields');

  var selR = el('select', 'tx');
  selR.style.width = '260px';
  selR.appendChild(opt('', quellen.length ? tr('detail.pickOne') : tr('detail.noSource')));
  quellen.forEach(function (id) { selR.appendChild(opt(id, id.split('.').slice(2).join('.'))); });
  if (s.srcR && quellen.indexOf(s.srcR) === -1) { selR.appendChild(opt(s.srcR, s.srcR + '   ' + tr('detail.elsewhere'))); }
  selR.appendChild(opt('__frei__', tr('detail.otherObject')));
  selR.value = s.srcR || '';
  if (!s.srcR) { selR.className += ' miss'; }
  selR.addEventListener('click', function (ev) { ev.stopPropagation(); });
  selR.addEventListener('change', function () {
    if (selR.value === '__frei__') { s.frei = true; s.srcR = ''; }
    else { s.frei = false; s.srcR = selR.value; }
    if (s.srcR && !S.werte[s.srcR]) {
      socket.emit('getState', s.srcR, function (err, st) {
        if (!err && st) { S.werte[s.srcR] = st; zeichneErgebnis(); }
      });
    }
    neu();
  });
  var lR = el('label', 'fld');
  lR.appendChild(el('span', null, tr('detail.datapoint')));
  lR.appendChild(selR);
  qf.appendChild(lR);

  var felder = s.srcR ? jsonFelder(s.srcR) : null;
  if (felder && felder.length) {
    var selF = el('select', 'tx');
    selF.style.width = '180px';
    selF.appendChild(opt('', tr('detail.ownFormula')));
    felder.forEach(function (f) { selF.appendChild(opt(f, f)); });
    selF.value = feldAusFormel(s.f);
    selF.addEventListener('click', function (ev) { ev.stopPropagation(); });
    selF.addEventListener('change', function () {
      s.f = feldFormel(selF.value);
      /* Den Typ nur vorschlagen, wenn keiner feststeht. Vorher stand
         hier hart `number` — nach der Wahl von POWER („ON") oder
         Wifi.SSId stand der Punkt auf Zahl, und ein Platz, den das
         Muster als boolean fuehrt, verlor seine Vorgabe: aus
         switch.light + number wird kein Geraet mehr. */
      if (selF.value && !s.typ) {
        var j = jsonVon(s.srcR);
        var w = j ? feldWert(j, selF.value) : undefined;
        if (typeof w === 'boolean') { s.typ = 'boolean'; }
        else if (typeof w === 'number') { s.typ = 'number'; }
        else if (typeof w === 'string') { s.typ = 'string'; }
      }
      neu();
    });
    var lF = el('label', 'fld');
    lF.appendChild(el('span', null, tr('detail.jsonField')));
    lF.appendChild(selF);
    qf.appendChild(lF);
  }
  zeigeAbweichung(zeile(tr('detail.readsFrom'), qf), ['srcR']);

  if (s.frei) {
    var iFrei = el('input', 'tx w');
    iFrei.type = 'text';
    iFrei.value = s.srcR || '';
    iFrei.placeholder = '0_userdata.0.…';
    iFrei.addEventListener('click', function (ev) { ev.stopPropagation(); });
    iFrei.addEventListener('change', function () { s.srcR = iFrei.value.trim(); neu(); });
    zeile('Objekt-ID', iFrei);
  }

  /* --- Quelle schreiben --- */
  var wf = el('div', 'fields');
  var selW = el('select', 'tx');
  selW.style.width = '260px';
  /* Leer heisst „schreibt nicht" - und muss auch so heissen. Frueher
     stand hier „dieselbe wie lesen", also das Gegenteil dessen, was
     passierte (Ricardo, 25.08.2026). Wer wirklich auf die Lesequelle
     schreiben will, nimmt den zweiten Eintrag; der traegt den Lesepunkt
     ein, damit im Feld steht, worauf es hinausgeht. */
  selW.appendChild(opt('', tr('detail.noWrite')));
  if (s.srcR && s.srcW !== s.srcR) { selW.appendChild(opt('=lesen', tr('detail.sameAsRead'))); }
  quellen.forEach(function (id) { selW.appendChild(opt(id, id.split('.').slice(2).join('.'))); });
  if (s.srcW && quellen.indexOf(s.srcW) === -1) { selW.appendChild(opt(s.srcW, s.srcW)); }
  selW.value = s.srcW || '';
  selW.addEventListener('click', function (ev) { ev.stopPropagation(); });
  selW.addEventListener('change', function () {
    s.srcW = (selW.value === '=lesen') ? (s.srcR || '') : selW.value;
    neu();
  });
  var lW = el('label', 'fld');
  lW.appendChild(el('span', null, 'Datenpunkt'));
  lW.appendChild(selW);
  wf.appendChild(lW);
  /* Der Hinweis gilt nur, wenn die beiden Quellen wirklich
     auseinandergehen - bei gleicher Quelle ist nichts getrennt. */
  if (s.srcW && s.srcW !== s.srcR) {
    wf.appendChild(el('div', 'sugg', tr('detail.separateHint')));
  }
  zeigeAbweichung(zeile(tr('detail.writesTo'), wf), ['srcW']);

  /* --- Leseformel --- */
  var fb = el('div');
  var iF = el('input', 'tx w');
  iF.type = 'text';
  iF.value = s.f || '';
  iF.placeholder = tr('detail.formulaPlaceholder');
  iF.addEventListener('click', function (ev) { ev.stopPropagation(); });
  iF.addEventListener('change', function () { s.f = iF.value.trim(); neu(); });
  fb.appendChild(iF);
  /* Der Hinweis gilt nur fuer Schaltpunkte. Bei einem Spannungswert
     stand er auch — und ergab dort keinen Sinn. */
  if ((s.typ || '') === 'boolean') {
    fb.appendChild(el('div', 'sugg', tr('detail.formulaHint')));
  }
  zeigeAbweichung(zeile(tr('detail.formula'), fb), ['f']);

  if (s.srcW) {
    var wb = el('div');
    var iW = el('input', 'tx w');
    iW.type = 'text';
    iW.value = s.fw || '';
    iW.placeholder = tr('detail.writeFormulaPlaceholder');
    iW.addEventListener('click', function (ev) { ev.stopPropagation(); });
    iW.addEventListener('change', function () { s.fw = iW.value.trim(); neu(); });
    wb.appendChild(iW);
    wb.appendChild(el('div', 'sugg', tr('detail.writeFormulaHint')));
    zeigeAbweichung(zeile(tr('detail.writeFormula'), wb), ['fw']);
  }

  /* --- Rolle, mit Begründung --- */
  var rb = el('div');
  /* Welcher Platz ist schon vergeben, und von welcher Zeile? Das steht
     als Vermerk am Gruppenkopf der Rollenliste. */
  var belegtVon = {};
  if (e.want) {
    var fundR = erkenneEntwurf(e, e.want);
    if (fundR.length) {
      fundR[0].states.forEach(function (x) {
        if (x.id) { belegtVon[x.name] = x.id.slice(e.kanal.length + 1); }
      });
    }
  }
  rb.appendChild(rollenFeld({
    wert: s.role,
    muster: e.want,
    belegtVon: belegtVon,
    breite: '300px',
    beiWahl: function (r) { s.role = r; neu(); }
  }));

  var must = e.want && musterVon(e.want);
  if (must) {
    var treffer = null;
    must.states.forEach(function (p) {
      if (!treffer && p.role && new RegExp(p.role.source ? p.role.source : p.role).test(s.role)) { treffer = p; }
    });
    var hin = el('div', 'sugg');
    if (treffer) {
      hin.appendChild(document.createTextNode(tr('pattern.fitsOn')));
      hin.appendChild(el('b', null, String(treffer.role)));
      hin.appendChild(document.createTextNode(tr('pattern.toSlot', treffer.name, musterName(e.want) || e.want)));
    } else {
      hin.textContent = tr('pattern.noPlaceLong', musterName(e.want) || e.want);
    }
    rb.appendChild(hin);
  }
  zeigeAbweichung(zeile(tr('detail.role'), rb), ['role']);

  /* --- Typ und Anzeige --- */
  var af = el('div', 'fields');

  var selT = el('select', 'tx');
  ['boolean', 'number', 'string', 'mixed'].forEach(function (t) { selT.appendChild(opt(t, t)); });
  selT.value = s.typ || 'number';
  selT.addEventListener('click', function (ev) { ev.stopPropagation(); });
  selT.addEventListener('change', function () { s.typ = selT.value; neu(); });
  var lT = el('label', 'fld');
  lT.appendChild(el('span', null, tr('detail.type')));
  lT.appendChild(selT);
  af.appendChild(lT);

  var iU = el('input', 'tx');
  iU.type = 'text';
  iU.style.width = '70px';
  iU.value = s.unit || '';
  iU.placeholder = '—';
  iU.addEventListener('click', function (ev) { ev.stopPropagation(); });
  iU.addEventListener('input', function () { s.unit = iU.value; s.geaendert = true; });
  iU.addEventListener('change', function () { neu(); });
  var lU = el('label', 'fld');
  lU.appendChild(el('span', null, tr('detail.unit')));
  lU.appendChild(iU);
  af.appendChild(lU);

  var selD = el('select', 'tx');
  [['', tr('detail.asDelivered')], ['0', '0'], ['1', '1'], ['2', '2'], ['3', '3']].forEach(function (o) {
    selD.appendChild(opt(o[0], o[1]));
  });
  selD.value = (s.dec === undefined ? '' : s.dec);
  selD.addEventListener('click', function (ev) { ev.stopPropagation(); });
  selD.addEventListener('change', function () { s.dec = selD.value; neu(); });
  var lD = el('label', 'fld');
  lD.appendChild(el('span', null, tr('detail.decimals')));
  lD.appendChild(selD);
  af.appendChild(lD);

  var iC = el('input', 'tx');
  iC.type = 'text';
  iC.style.width = '150px';
  iC.value = s.caption || '';
  iC.placeholder = s.n;
  iC.addEventListener('click', function (ev) { ev.stopPropagation(); });
  iC.addEventListener('input', function () { s.caption = iC.value; s.geaendert = true; });
  /* Was das Feld tut, stand nirgends - man tippte und sah keine
     Wirkung. Der Wert wird der Anzeigename des Punkts (common.name)
     und erscheint als Zusatz in der Zeile darueber. */
  iC.title = tr('detail.captionHint');
  var lC = el('label', 'fld');
  lC.appendChild(el('span', null, tr('detail.caption')));
  lC.appendChild(iC);
  lC.appendChild(el('span', 'sugg', tr('detail.captionHint')));
  af.appendChild(lC);

  zeigeAbweichung(zeile(tr('detail.display'), af), ['typ', 'unit']);

  /* --- Rohwert und Ergebnis --- */
  var a = wertVon(s);
  zeile(tr('detail.rawValue'), a.roh === undefined ? tr('detail.rawNothing')
    : (typeof a.roh === 'object' ? JSON.stringify(a.roh) : String(a.roh)), 'raw');

  if (s.srcR && !S.objects[s.srcR]) {
    var wbox = el('div');
    wbox.appendChild(el('span', 'chip bad', tr('detail.sourceGone')));
    zeile(tr('detail.attention'), wbox);
  }

  var box = el('div');
  var rv = el('span', 'res', a.ok
    ? (typeof a.val === 'object' ? JSON.stringify(a.val) : String(a.val)) + (s.unit ? ' ' + s.unit : '')
    : a.txt);
  if (!a.ok) { rv.style.color = 'var(--bad)'; }
  box.appendChild(rv);
  box.appendChild(document.createTextNode('  '));
  if (a.ok) {
    var t = typeof a.val;
    var passt = !s.typ || s.typ === t || s.typ === 'mixed';
    box.appendChild(el('span', 'chip ' + (passt ? 'ok' : 'warn'),
      (passt ? '✓ ' : '≠ ') + (t === 'number' ? 'Zahl' : (t === 'boolean' ? 'boolean' : t))));
    if (a.gewandelt) {
      box.appendChild(document.createTextNode('  '));
      box.appendChild(el('span', 'chip mut', tr('detail.converted')));
    }
    if (!passt) {
      box.appendChild(document.createTextNode('  '));
      box.appendChild(el('span', 'chip warn', tr('detail.expects', s.typ)));
    }
    var ist = s.urId ? S.werte[s.urId] : null;
    if (ist && ist.val !== undefined && ist.val !== null) {
      var gleich = String(ist.val) === String(a.val);
      box.appendChild(document.createTextNode('  '));
      box.appendChild(el('span', 'chip ' + (gleich ? 'ok' : 'warn'),
        gleich ? tr('detail.matchesState') : tr('detail.stateSays', String(ist.val))));
    }
  } else if (a.fehler) {
    box.appendChild(el('span', 'chip bad', tr('detail.formulaBroken')));
  } else {
    box.appendChild(el('span', 'chip bad', tr('detail.yieldsNothing')));
  }
  zeile(tr('detail.yields'), box);

  if (s.manuell) {
    var db = el('div');
    var del = el('button', 'btn', tr('detail.removePoint'));
    del.style.fontSize = '11.5px';
    del.style.borderColor = 'var(--bad)';
    del.style.color = 'var(--bad)';
    del.addEventListener('click', function (ev) {
      ev.stopPropagation();
      e.states.splice(idx, 1);
      S.openRow = null;
      zeichneErgebnis();
    });
    db.appendChild(del);
    zeile('', db);
  }

  return d;
}
