/* Die aufgeklappte Zeile: Quellen, Formeln, Rolle, Typ, Einheit. */

import { S } from './zustand.js';
import { socket } from './verbindung.js';
import { el } from './basis.js';
import { tr } from './sprache.js';
import { wertVon, jsonFelder, feldAusFormel, feldFormel, feldWert, jsonVon } from './werte.js';
import { musterVon, erkenneEntwurf, platzFuerRolle, typVomPlatz, typenVomPlatz, typPasstZuPlatz } from './erkennung.js';
import { musterName } from './musternamen.js';
import { rollenFeld } from './rollenwahl.js';
import { opt , quellenAuswahl, vorlagenAbweichung, bestandsAbweichung } from './entwurf.js';
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

  /* ---- Die Auswahl der Datenpunkte ---------------------------------

     Im Eintrag stehen die ersten beiden Glieder nicht: eine volle
     Kennung wird hier bis zu 78 Zeichen lang (gemessen am Testsystem,
     Median 36) und passte in kein Feld dieser Spalte. Ein `select`
     kuerzt hinten ab — weg waere also gerade das, was den Punkt
     unterscheidet.

     Nur: ohne den Instanzteil sehen `Solar.Balkon.Einspeisung.Deckel`
     (ein Alias-Punkt) und `SmartHome.Solar_Balkon.tele.SENSOR` (die
     echte Quelle) gleich aus, und wer den ersten waehlt, baut aus
     Versehen einen Alias, der aus einem Alias liest (Ricardo,
     08.09.2026). Deshalb traegt jede Gruppe ihre Instanz als
     Ueberschrift, und `alias.0` steht ganz unten: daraus zu lesen ist
     der Sonderfall, nicht der Regelfall. */
  function quellenIn(sel, ids) {
    var gruppen = {}, folge = [];
    ids.forEach(function (id) {
      var inst = id.split('.').slice(0, 2).join('.');
      if (!gruppen[inst]) { gruppen[inst] = []; folge.push(inst); }
      gruppen[inst].push(id);
    });
    folge.sort(function (a, b) {
      var aa = a.indexOf('alias.') === 0, bb = b.indexOf('alias.') === 0;
      return aa === bb ? 0 : (aa ? 1 : -1);
    });
    folge.forEach(function (inst) {
      var g = document.createElement('optgroup');
      g.label = inst;
      gruppen[inst].forEach(function (id) {
        var o = opt(id, id.split('.').slice(2).join('.'));
        o.title = id;
        g.appendChild(o);
      });
      sel.appendChild(g);
    });
  }

  /* Und weil die Ueberschrift nur im aufgeklappten Zustand zu sehen ist
     — ein `select` zeigt zugeklappt allein den Text seiner Option —,
     steht die volle Kennung als eigene Zeile unter dem Feld. Dieselbe
     Bauart wie „Die Vorlage will hier: …": sie darf umbrechen und hat
     damit keine Breitengrenze. */
  function mitVollId(felder, id) {
    var w = el('div', 'feldstapel');
    w.appendChild(felder);
    var v = el('div', 'vollid');
    if (id) { v.textContent = id; v.title = id; }
    w.appendChild(v);
    return w;
  }

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

    var b = el('button', 'btn winzig abwnimm', '←');
    b.addEventListener('click', function (ev) {
      ev.stopPropagation();
      var v = s.vorlagenWert;
      if (!v) { return; }
      treffer.forEach(function (f) { s[f] = v[f]; });
      /* Uebernehmen ist eine Aenderung wie jede andere — die Zeile traegt
         danach „geaendert". Dass die Marke „weicht von der Vorlage ab"
         dabei nicht verschwindet, sorgt die Zeichenseite: sie haengt
         seit dem 06.09.2026 daran, ob wirklich noch etwas abweicht, und
         nicht mehr an `!geaendert`. Sonst waeren nach der ersten
         Uebernahme die uebrigen Abweichungen unsichtbar. */
      s.geaendert = true;
      rateBehalten(s);
      entwurfAngefasst();
      zeichneErgebnis();
    });
    r.appendChild(b);

    /* Der Wert der Vorlage gehoert HINGESCHRIEBEN, nicht in einen
       Tooltip: der hing an der Zeile, und sobald der Zeiger ueber dem
       Auswahlfeld oder dem Knopf stand, zeigte der Browser deren
       Tooltip. Man musste die getoente Flaeche danebentreffen, um zu
       erfahren, was man da uebernimmt (Ricardo, 06.09.2026). */
    var hin = el('div', 'tplwert');
    treffer.forEach(function (f, i) {
      if (i) { hin.appendChild(document.createTextNode('   ')); }
      var v = abwNach[f].vorlage;
      hin.appendChild(document.createTextNode(
        v ? tr('detail.tplWants', '') : tr('detail.tplWantsEmpty')));
      if (v) { hin.appendChild(el('b', null, String(v))); }
    });
    b.title = tr('detail.takeOne');
    r.appendChild(hin);
  }

  /* Dasselbe gegen den gespeicherten Alias.

     Getrennt von der Vorlagenabweichung, weil es eine andere Aussage ist:
     dort steht, was die Vorlage wollte, hier, was in der Datenbank steht.
     Eine Zeile kann beides tragen — etwa nach einem Musterwechsel, der
     die Rolle anpasst: Die neue Rolle weicht dann vom Alias ab, und je
     nachdem auch von der Vorlage (Ricardo, 06.09.2026). */
  /* `e.ziel || e.kanal` — wie bei den beiden Nachbarn.

     Im Aliasmodus ist `e.ziel` nie gesetzt: Man steht ja schon auf dem
     Alias, das Ziel waehlt man erst im Quellenmodus. Die Marke „weicht vom
     Alias ab" erschien dort also NIE — ausgerechnet dort, wo sie am
     meisten sagt (gemessen 09.09.2026: mit `e.ziel` null Abweichungen, mit
     `e.ziel || e.kanal` eine). */
  var bstListe = bestandsAbweichung(s, e.ziel || e.kanal);
  var bstNach = {};
  bstListe.forEach(function (x) { bstNach[x.feld] = x; });

  function zeigeBestand(r, felder) {
    if (!r) { return; }
    var treffer = felder.filter(function (f) { return bstNach[f]; });
    if (!treffer.length) { return; }
    r.classList.add('bstabw');

    var b2 = el('button', 'btn winzig bstnimm', '⟲');
    b2.title = tr('detail.takeFromAlias');
    b2.addEventListener('click', function (ev) {
      ev.stopPropagation();
      treffer.forEach(function (f) { s[f] = bstNach[f].bestand; });
      /* Zurueckholen ist eine Entscheidung wie das Uebernehmen aus der
         Vorlage — die Zeile traegt danach „geaendert". Die Marke bleibt,
         solange noch etwas abweicht; sie haengt nicht an `geaendert`. */
      s.geaendert = true;
      rateBehalten(s);
      entwurfAngefasst();
      zeichneErgebnis();
    });
    r.appendChild(b2);

    var hin2 = el('div', 'bstwert');
    treffer.forEach(function (f, i) {
      if (i) { hin2.appendChild(document.createTextNode('   ')); }
      var v = bstNach[f].bestand;
      hin2.appendChild(document.createTextNode(
        v ? tr('detail.aliasHas', '') : tr('detail.aliasEmpty')));
      if (v) { hin2.appendChild(el('b', null, String(v))); }
    });
    r.appendChild(hin2);
  }

  /* Beide Auskuenfte an derselben Zeile: erst was die Vorlage will,
     dann was im Alias steht. */
  function zeigeBeide(r, felder) {
    zeigeAbweichung(r, felder);
    zeigeBestand(r, felder);
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
  quellenIn(selR, quellen);
  if (s.srcR && quellen.indexOf(s.srcR) === -1) { selR.appendChild(opt(s.srcR, s.srcR + '   ' + tr('detail.elsewhere'))); }
  selR.appendChild(opt('__frei__', tr('detail.otherObject')));
  selR.value = s.srcR || '';
  if (!s.srcR) { selR.className += ' miss'; }
  selR.addEventListener('click', function (ev) { ev.stopPropagation(); });
  selR.addEventListener('change', function () {
    if (selR.value === '__frei__') { s.frei = true; s.srcR = ''; }
    else { s.frei = false; s.srcR = selR.value; }
    if (s.srcR && !S.werte[s.srcR]) {
      /* Die Kennung festhalten, bevor gefragt wird.

         Der Rueckruf legte den Wert unter der Quelle ab, die BEIM
         EINTREFFEN eingestellt war. Schaltet man in der Zwischenzeit
         weiter, landet der Wert der alten Quelle unter der neuen — und
         da nur geholt wird, was noch fehlt, bleibt es dabei: die neue
         gilt als bekannt (gemessen 09.09.2026). */
      var geholt = s.srcR;
      socket.emit('getState', geholt, function (err, st) {
        if (!err && st) { S.werte[geholt] = st; zeichneErgebnis(); }
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
  zeigeBeide(zeile(tr('detail.readsFrom'), mitVollId(qf, s.srcR)), ['srcR']);

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
  quellenIn(selW, quellen);
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
  zeigeBeide(zeile(tr('detail.writesTo'), mitVollId(wf, s.srcW)), ['srcW']);

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
  zeigeBeide(zeile(tr('detail.formula'), fb), ['f']);

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
    zeigeBeide(zeile(tr('detail.writeFormula'), wb), ['fw']);
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
    /* Die Rolle bestimmt den Platz, und der Platz bestimmt den Typ -
       beides steht im selben Datensatz des type-detector. Wer eine
       Rolle waehlt, bekommt deshalb den passenden Typ gleich mit.
       Wer danach den Typ von Hand aendert, behaelt seine Wahl, bis er
       die Rolle erneut wechselt. */
    beiWahl: function (r) {
      s.role = r;
      var t = typVomPlatz(platzFuerRolle(e.want, r));
      if (t && s.typ !== t) { s.typ = t; }
      neu();
    }
  }));

  var must = e.want && musterVon(e.want);
  if (must) {
    var treffer = platzFuerRolle(e.want, s.role);
    var erlaubt = typenVomPlatz(treffer);
    var hin = el('div', 'sugg');
    if (treffer) {
      hin.appendChild(document.createTextNode(tr('pattern.fitsOn')));
      hin.appendChild(el('b', null, String(treffer.role)));
      hin.appendChild(document.createTextNode(tr('pattern.toSlot', treffer.name, musterName(e.want) || e.want)));
      if (erlaubt.length) {
        hin.appendChild(document.createTextNode(
          tr('pattern.expectsType', erlaubt.join(tr('pattern.typeOr')))));
      }
    } else {
      hin.textContent = tr('pattern.noPlaceLong', musterName(e.want) || e.want);
    }
    rb.appendChild(hin);
    /* Passt der Typ nicht zum Platz, faellt der Punkt aus dem Muster -
       lautlos, denn die Rolle stimmt ja. Genau das ist am 11.09.2026
       an einem Tasmota-Stromzaehler passiert (I33). */
    if (!typPasstZuPlatz(treffer, s.typ)) {
      rb.appendChild(el('div', 'aside w',
        tr('pattern.typeMismatch', treffer.name, erlaubt.join(tr('pattern.typeOr')), s.typ)));
    }
  }
  zeigeBeide(zeile(tr('detail.role'), rb), ['role']);

  /* --- Typ und Anzeige --- */
  var af = el('div', 'fields');

  var selT = el('select', 'tx');
  ['boolean', 'number', 'string', 'mixed'].forEach(function (t) { selT.appendChild(opt(t, t)); });
  selT.value = s.typ || 'number';
  selT.addEventListener('click', function (ev) { ev.stopPropagation(); });
  /* Eine Aenderung von Hand bleibt stehen - bis die Rolle erneut
     gewaehlt wird, dann gilt wieder der Typ des Platzes. */
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

  zeigeBeide(zeile(tr('detail.display'), af), ['typ', 'unit']);

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
