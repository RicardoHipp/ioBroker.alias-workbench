<img src="admin/alias-workbench.png" width="80" align="right" alt="Symbol">

# ioBroker.alias-workbench

Erstellt komfortabel Aliase — Geräte, die vis, Alexa und der Geräte-Adapter
verstehen. Vorlagen erledigen die Arbeit: mitgeliefert für Homematic und
Tasmota, selbst gebaut für jedes weitere Gerät. Bei Tasmota prüft sie
zusätzlich den Weg zum Gerät: fehlende Sendepunkte, abgeschaltetes `publish`,
verzögerte Rückmeldung.

*(This is the German version. The English one is in [README.md](README.md).)*

---

## Warum

Ein Alias ist schnell angelegt und sieht danach immer gut aus. Ob er etwas
taugt, entscheidet sich an Dingen, die man **nicht sieht**:

- ob die **Rollen** so gewählt sind, dass der type-detector ein Gerät erkennt
- ob die **Quelle** überhaupt existiert und einen Wert trägt
- ob die **Leseformel** eine Zahl liefert oder `undefined`
- ob der **Schreibweg** funktioniert

Ein Werkzeug, das nur Datenpunkte verknüpft, hilft bei keinem dieser vier
Punkte. Dieser Adapter zeigt alle vier, **während** du baust — nicht Stunden
später im Protokoll.

## Was er kann

![Die Werkbank mit einem gewählten Gerät](https://raw.githubusercontent.com/RicardoHipp/ioBroker.alias-workbench/main/docs/01-device.png)

*Eine Tasmota-Steckdose im Baum gewählt: was der Detektor daraus macht, welche Vorlage gewonnen hat, und jeder Datenpunkt mit dem Wert, den er gerade liefert.*

**Der Detektorbericht rechnet mit.** Der echte `@iobroker/type-detector` läuft
gegen einen Entwurf deines Alias, während du ihn bearbeitest. Änderst du eine
Rolle, ändert sich der Bericht mit — du siehst sofort, ob ein Gerät entstanden
ist oder ein Haufen loser Werte, welche Musterplätze belegt sind und welche noch
frei.

**Werte, wie sie gerade sind.** Jeder Datenpunkt zeigt, was seine Leseformel
*in diesem Moment* zurückgibt, daneben den Rohwert der Quelle. Eine Formel, die
`undefined` liefert oder wirft, sieht man, bevor irgendetwas geschrieben wird.

![Ein aufgeklappter Datenpunkt](https://raw.githubusercontent.com/RicardoHipp/ioBroker.alias-workbench/main/docs/03-datapoint.png)

*Eine Zeile aufgeklappt: woraus sie liest, welches Feld im JSON, die Leseformel, die Rolle — und der Musterplatz, den diese Rolle füllt.*

**JSON wird ausgepackt, ohne dass du eine Formel schreibst.** Viele Geräte
liefern ihre Messwerte nicht als einzelne Datenpunkte, sondern als ein
einziges JSON — bei Tasmota etwa alles in `tele/SENSOR`. Erkennt die Werkbank
in einer Quelle gültiges JSON, zerlegt sie es und bietet seine Felder in einer
Auswahlliste an: `ENERGY.Power`, `ENERGY.Total`, `Wifi.Signal`. Ein Klick
darauf genügt, die passende Formel entsteht von selbst — und zwar in der
abgesicherten Form:

```js
JSON.parse(val)?.ENERGY?.Power ?? null
```

Das `?.` ist kein Schmuck. `tele/SENSOR` ist ein Sammeltopf, in dem je nach
Gerät und Nachricht mal dieses und mal jenes Feld steht; der blanke Zugriff
`JSON.parse(val).ENERGY.Power` scheitert, sobald `ENERGY` einmal fehlt — der
Alias liefert dann gar nichts mehr und der Controller schreibt eine Warnung
ins Protokoll. Mit `?.` kommt in diesem Fall schlicht `null` heraus. Ist das
Feld `0`, steht auch `0` da und nicht „kein Wert": `??` greift nur bei
`null` und `undefined`.

Der Weg geht in beide Richtungen. Steht in einer Zeile bereits eine Formel,
liest die Werkbank sie zurück und zeigt in der Auswahl das gemeinte Feld statt
„eigene Formel" — auch bei der blanken Schreibweise ohne `?.`. Nur was
wirklich mehr tut als ein Feldzugriff (`JSON.parse(val)?.POWER === "ON"`),
bleibt eine eigene Formel und wird nicht angetastet. Und was du selbst
geschrieben hast, bleibt stehen: Weicht deine Formel von der ab, die die
Vorlage vorschlägt, sagt die Zeile das — geändert wird sie erst, wenn du es
verlangst.

**Rolle, Raum und Funktion werden gleich mit gepflegt.** Ein Alias ist mehr
als ein Bündel Datenpunkte, und die Werkbank hält die drei Dinge in Ordnung,
an denen ein Gerät im ioBroker als Gerät erkennbar wird:

- **Die Rollen der Punkte** kommen aus der Vorlage oder aus dem Muster und
  passen sich mit, wenn du das Muster wechselst — `switch.light` passt auf
  kein `socket`-SET. Die Rollenwahl ist nach Musterplätzen gruppiert und
  zeigt, welcher Platz dadurch belegt würde und ob er noch frei ist. Kennt ein
  Platz mehrere zulässige Schreibweisen, stehen alle zur Wahl: `LOWBAT` nimmt
  `indicator.lowbat` genauso wie `indicator.maintenance.lowbat` — was die
  eigene Hardware schreibt, ist also dabei. Veraltete Schreibweisen bleiben
  draußen.
- **Die Rolle des Kanals** ist der Gerätetyp selbst (`light`, `blind`,
  `thermostat`), so wie der Geräte-Adapter des Admin es hält — daran erkennen
  ihn andere Adapter wieder.
- **Raum und Funktion** stehen nicht am Objekt, sondern in `enum.rooms.*` und
  `enum.functions.*`. Die Werkbank schlägt beide vor — den Raum aus der
  Quelle, ihrem Namen oder dem Zielordner, die Funktion aus der Vorlage oder
  dem erkannten Gerätetyp —, trägt den Alias beim Schreiben dort ein und
  wieder aus, wenn du die Zuordnung änderst. Verlegst du den Alias, wandert
  die Zuordnung mit; fremde Mitglieder derselben Aufzählung bleiben dabei
  unberührt.
- **Und ihre Bilder.** Der Admin bringt für Räume und Funktionen fertige
  Vorlagen mit Symbol mit. Fehlt einer vorhandenen Aufzählung das Bild — aus
  einer Homematic-Zentrale gespiegelte tragen nie eines —, trägt die Werkbank
  es nach. Neben dem Feld siehst du vorher, was passieren wird. Siehe
  [Raum und Funktion](#raum-und-funktion).

Nichts davon geschieht im Verborgenen: Jede dieser Änderungen steht im
Trockenlauf, bevor irgendetwas geschrieben wird — auch die an den
Aufzählungen, die ja fremde Objekte sind.

**Vorlagen.** Eine Vorlage beschreibt, wie aus einer Gerätequelle ein fertiges
Aliasgerät wird. Vorlagen sind schlichte JSON-Dateien, eine je Vorlage — siehe
[Vorlagenformat](#vorlagenformat). Sechzehn liegen bei: vier für Tasmota, ein
reiner Messpunkt und elf für Homematic — siehe
[Was die mitgelieferten Vorlagen abdecken](#was-die-mitgelieferten-vorlagen-abdecken).

**Eigene Vorlagen.** Bau ein Gerät — von Hand oder indem du eine mitgelieferte
Vorlage abwandelst — und sichere es als eigene Vorlage. Was sich ableiten lässt,
wird abgeleitet; was sich nicht ableiten lässt, wird gefragt. Bevor etwas
gespeichert wird, läuft ein Probelauf der neuen Vorlage gegen jedes Gerät im
System und zeigt, welche sie trifft, welche Vorlage dort gewinnt und welche
Geräte den Besitzer wechseln würden. Siehe
[Eigene Vorlagen sichern](#eigene-vorlagen-sichern).

**Tasmota und MQTT.** Ein Tasmota-Gerät hängt über den MQTT-Adapter als Satz
roher Themen in ioBroker: `cmnd/`, `stat/`, `tele/` — kein Gerät, nur
Datenpunkte. Die Werkbank baut daraus nicht nur den Alias, sondern prüft auch
den Weg dorthin:

- **Fehlende Sendepunkte.** Ein `cmnd.POWER`, das es nicht gibt, wird auf
  Knopfdruck angelegt — mit dem richtigen Thema und der passenden Rolle.
- **Stumme Punkte.** Es gibt sie, aber sie dürfen nicht senden: `publish` steht
  aus. Ein Alias, der darüber schaltet, tut nichts, ohne dass man es ihm
  ansieht. Die Werkbank zeigt es und schaltet es auf Wunsch frei.
- **Verzögerte Rückmeldung.** Ohne `SetOption59` meldet Tasmota eine Änderung
  erst mit der nächsten Telemetrie — der Alias zeigt minutenlang den alten Wert.
  Die Werkbank fragt beim Gerät nach und schaltet die Einstellung ein.
- **Befehle abfragen.** Kennt sie die Befehlsliste eines Geräts nicht, fragt sie
  beim Gerät nach (Status 11). Eine reine Abfrage, die nichts schaltet und
  nichts ändert.

Wer seine Tasmota-Geräte so einbindet, braucht für die Gerätestruktur keinen
eigenen Adapter: MQTT liefert die Daten, die Werkbank macht daraus Geräte.

**Geräte mit mehreren Ausgängen.** Eine Steckdosenleiste oder Ventilinsel hat
`POWER1`, `POWER2`, … Da ein `socket`-Muster genau ein `SET` kennt, wird jeder
Ausgang ein eigener Kanal, alle unter einem Ordner. Die Nummern der Ausgänge
werden aus dem gelesen, was tatsächlich da ist — Lücken sind erlaubt.

**Verlegen, umbenennen, Quelle tauschen.** Eine Kennung lässt sich im
Objektspeicher nicht ändern, deshalb ist Verlegen immer: neu anlegen,
Aufzählungen umtragen, alt löschen — in dieser Reihenfolge, damit ein Fehlschlag
dich mit zwei Aliasen zurücklässt statt mit keinem. Der Quellentausch lässt den
Alias unangetastet und biegt ihn nur um, was genau das ist, was man will, wenn
ein Gerät stirbt. Siehe [Quelle tauschen](#quelle-tauschen).

**Freie Plätze füllen.** Ein Gerät, auf das kein Muster passt, ist oft kein
unbekanntes Gerät — es fehlt schlicht eine Rolle. **Freie Plätze vorschlagen**
setzt Rollen im Entwurf und lässt den Detektor noch einmal entscheiden. Das
läuft nur auf diesen Knopf, nie während der normalen Erkennung, jede geratene
Zeile ist markiert, und solange eine Vermutung unentschieden ist, bleiben die
Schreibknöpfe gesperrt. Nicht zu entscheiden ist kein stillschweigendes Ja mehr.

![Der Trockenlauf](https://raw.githubusercontent.com/RicardoHipp/ioBroker.alias-workbench/main/docs/02-dry-run.png)

*Der Trockenlauf, bevor etwas geschrieben wird: elf Objekte, zehn neu, eines würde überschrieben — jedes mit Ziel und Quelle.*

**Ohne Trockenlauf wird nichts geschrieben.** Der Trockenlauf listet jedes
Objekt, das entstehen, sich ändern oder verschwinden würde, als vollständiges
JSON. Bei allem, was sich ändert, stellt er **vorher und nachher nebeneinander**,
Zeile gegen Zeile, damit du siehst, *was* sich ändert statt nur *dass* sich
etwas ändert. Feldreihenfolge und abschließende Kommas werden vorher
vereinheitlicht — sonst leuchtet die halbe Liste ohne Grund. Erst von dort aus
lässt sich schreiben. Existiert eine Quelle nicht, ist das Schreiben gesperrt:
Der js-controller merkt sich eine fehlende Quelle dauerhaft, und nur Löschen und
Neuanlegen des Objekts hilft.

## Stand

![Die Prüfungen](https://raw.githubusercontent.com/RicardoHipp/ioBroker.alias-workbench/main/docs/06-checks.png)

*Die Prüfungen laufen immer mit und fassen nichts an. Hier fällt eine durch: Der Alias sähe fertig aus, aber sein Schalter könnte nichts senden — am MQTT-Befehlspunkt ist das Senden abgeschaltet.*

Früh. Benutzbar, aber nicht fertig.

- Läuft als Tab im Admin; der Adapter selbst führt keinen Prozess aus
  (`mode: none`). Die Instanz gibt es nur, damit sie die Einstellungen trägt.
- Oberfläche auf Deutsch und Englisch, je 550 Schlüssel; die Einstellungsseite
  in elf Sprachen
- 16 mitgelieferte Vorlagen: elf Homematic, vier Tasmota, ein reiner Messpunkt
- **Es fehlt:** „wer benutzt diesen Alias" — vis-Ansichten sowie Alexa- und
  Google-Namen lassen sich von hier aus nicht durchsuchen, deshalb warnt ein
  Umbenennen, statt Vollständigkeit vorzutäuschen. Eine Vorlage in eine Datei
  auszugeben und wieder einzulesen funktioniert, ist aber der am wenigsten
  erprobte Weg.

## Installation

Im ioBroker-Admin auf **Adapter** gehen, nach **Alias Workbench** suchen und eine
Instanz anlegen. Danach den Admin neu laden und links im Menü **Alias-Werkbank**
wählen.

Der Adapter ist noch nicht ins ioBroker-Repository aufgenommen, taucht dort
also vorerst nicht auf. Bis dahin geht es über npm: Unter **Adapter** den Knopf
**aus eigener URL installieren** (Katzensymbol) drücken, Reiter **Von npm**, dort
`iobroker.alias-workbench` eintragen.

## Warum der Baum Geräte zeigt, die es nicht gibt

Bei MQTT legt ioBroker nur Objekte für die Datenpunkte selbst an. Ein Thema wie
`SmartHome/Bastelzimmer/Gartenpumpe/stat/POWER` ergibt ein Objekt für
`stat.POWER` — die Ebene `Gartenpumpe` ist bloß ein Namensteil, kein Objekt.

Der type-detector sucht aber nach einem `channel` oder `device`, unter dem er
Datenpunkte gruppieren kann. Er findet keinen, erkennt also kein Gerät, und
Alexa, Matter und Material haben nichts, woran sie andocken könnten.

Genau diese Lücke füllt der Alias: `alias.0.…Gartenpumpe` ist ein echter Kanal
mit ordentlichen Rollen darunter. Deshalb lässt die Werkbank einen solchen
nicht existierenden Knoten im Baum anwählen und ein Gerät daraus bauen.

## Was ein vorhandener Alias beisteuert

![Ein vorhandener Alias im Bearbeiten-Modus](https://raw.githubusercontent.com/RicardoHipp/ioBroker.alias-workbench/main/docs/05-alias.png)

*Ein Alias, den es schon gibt. Seine eigenen Rollen und Formeln gewinnen gegen die Vorlage, darunter stehen die freien Plätze des Licht-Musters, und die drei Verwaltungsknöpfe gibt es nur in diesem Modus.*

Wählst du eine Quelle, zu der es schon einen Alias gibt, gewinnt der Alias.
Rolle, Typ, Einheit, Werteliste, Beschriftung, Formeln, beide Quellen und die
Haken kommen aus dem, was gespeichert ist — in **beiden** Sichten, „Alias
anlegen" und „Alias bearbeiten".

Vorher trug dieselbe Zeile je nach Modus eine andere Rolle, und Aktualisieren
tat in jedem Modus etwas anderes. Jetzt ändert Aktualisieren von sich aus
nichts.

Wo die Vorlage etwas anderes will, sagt die Zeile das — *„Vorlage:
sensor.window"* — und ein Knopf über der Liste bietet an, es zu übernehmen. Das
ist ein Klick, nie eine Nebenwirkung. Die Beschriftung ist ausgenommen: Der
Anzeigename gehört dem, der ihn getippt hat.

## Quelle tauschen

Ein Gerät geht kaputt und wird ersetzt. Der Alias soll genau bleiben, wie er ist
— gleiche Kennung, gleiche Aufzeichnung, gleicher Raum, gleiche Funktion — und
nur woandershin zeigen. **Quelle tauschen …** macht das und ändert dabei nur
`common.alias.id` je Datenpunkt sowie `native.quelle` am Kanal.

Jeder Datenpunkt wird in drei Schritten zugeordnet, und der Dialog sagt, welcher
davon gegriffen hat:

1. **gleicher relativer Pfad** unter dem neuen Gerät — `…ABC.1.STATE` →
   `…XYZ.1.STATE`
2. **über die Vorlagenzeile** — findet `LOWBAT` an einem Gerät, das es `LOWBAT`
   schreibt, wo das alte `LOW_BAT` sagte
3. **geraten** aus Name oder Rolle — mit Absicht schwach und als **vermutet**
   markiert, damit du es prüfst

Zeilen ganz ohne Treffer werden rot und bieten ein Kästchen an: *diesen Punkt
beim Tauschen entfernen*. Lässt du es leer, bleibt der Punkt stehen und zeigt
weiter auf die alte Quelle — erlaubt, aber sichtbar.

Auf zwei Dinge achtet der Dialog besonders. Er nennt die alte Quelle auch dann,
wenn es das Gerät **nicht mehr gibt** — das ist ja der Normalfall bei „Gerät
kaputt". Und er warnt, wo die neue Quelle anders misst: *„Achtung: ACTUAL:
Wertebereich 0..100 → 0..255"*. Der Alias behält seine Formeln; zählt das neue
Gerät anders, sind die Zahlen danach falsch, und nichts sonst würde es dir sagen.

## Raum und Funktion

Beide stehen in `enum.rooms.*` / `enum.functions.*`, nicht am Objekt — das ist
also die einzige Stelle, an der die Werkbank außerhalb von `alias.` schreibt.
Sonst wird außerhalb dieses Namensraums nie etwas angefasst.

Der Vorschlag kommt der Reihe nach aus: dem Raum, der schon an der Quelle oder
an einem ihrer Kanäle steht, dem Gerätenamen (`FK_Max_Spielzimmer` →
`Max_Spielzimmer`), dem Zielordner. Die Funktion kommt aus dem Feld `funktion`
der Vorlage, oder aus dem erkannten Typ, wenn die Vorlage keines hat.

Der Admin bringt 62 Funktions- und 58 Raumvorlagen mit, jede mit einem Bild. Die
Werkbank kopiert sie nicht, sondern liest sie zur Laufzeit aus dem Bündel des
Admin — so altern nie zwei Listen auseinander. Misslingt das, zeigt das Feld
still nur, was es gibt, und sagt das in der letzten Zeile, statt ohne Grund leer
auszusehen.

**Das Bild wird gezeigt, bevor es geschrieben wird.** Neben jedem der beiden
Felder steht das Bild der gewählten Aufzählung: kräftig, wenn schon eines
hinterlegt ist, blass mit einer kleinen Ecke **neu**, wenn die Werkbank beim
Schreiben eines ergänzen würde, und gar nicht, wenn der Katalog den Namen nicht
kennt oder der Schalter aus ist. So ist die Einstellungsseite in der Zeile selbst
sichtbar, statt sich aus einem Trockenlauf erraten zu lassen.

## Einstellungen

Die Instanz hat keinen Prozess; ihre Einstellungen entscheiden nur, wie die
Werkbank schreibt. Vier Schalter, von Haus aus alle an — und fehlt `native` ganz,
gelten dieselben Vorgaben, statt dass alles als aus zählt:

| Schalter | Was er tut |
|---|---|
| `ikonRaeume` | ein fehlendes Bild an einem **Raum** ergänzen |
| `ikonFunktionen` | dasselbe für eine **Funktion** |
| `ikonErsetzen` | auch einen Eintrag ersetzen, der kein Bild ist. Die Vorgaberäume von ioBroker tragen `icon: "Bedroom"` — ein blankes Wort, das als kaputtes Kästchen erscheint |
| `vorlagenVomAdmin` | die Raum- und Funktionsvorlagen des Admin überhaupt anbieten |

Die Werkbank liest sie **einmal beim Laden**. Nach dem Speichern die Seite neu
laden.

## Was die mitgelieferten Vorlagen abdecken

Sechzehn Vorlagen liegen bei. Vier Tasmota, ein reiner Messpunkt — und elf für
Homematic, wo das Kunststück nicht ist, dass eine Vorlage greift, sondern dass
die **richtige** greift. In den Daten sehen die Geräte gleich aus; was sie
trennt, ist je ein Datenpunkt:

| Unterschieden an | Was was ist |
|---|---|
| `1.WORKING` | Schaltaktor, kein Fensterkontakt — beide haben `1.STATE` |
| `2.STATE` | Mehrkanalaktor; die Einkanalvorlage lehnt ab, wenn es ihn gibt |
| `1.LEVEL_REAL` gegen `1.STOP` | Dimmer gegen Rollladen — beide haben `1.LEVEL` |
| `1.ERROR` | klassischer Fensterkontakt gegen HmIP, das einen Wahrheitswert aus einer Zahl rechnet |
| `0.SABOTAGE` | Pflicht für den HmIP-Kontakt. Ohne ihn trafen `1.STATE` + `0.LOW_BAT` zwölf Geräte, acht davon Aktoren |
| `1.LEVEL` / `1.HUMIDITY` / `4.SECTION` | Heizkörperventil gegen Wandthermostat gegen Heizgruppe |
| `1.TEMPERATURE` gegen `1.ACTUAL_TEMPERATURE` | ein reiner Fühler gegen etwas, das auch einen Wert setzt |

Die Empfänger der CCU selbst — `HM-RCV-50`, `HmIP-RCV-50`, `RPI-RF-MOD` —
treffen mit Absicht nichts. Fünfzig blanke `LEVEL`-Kanäle sind kein Gerät.

Wird eine Vorlage abgelehnt, sagt die Auswahl warum: *„1.LEVEL fehlt"*, nicht
*„passt nicht"*. Ein Grund, mit dem man nichts anfangen kann, ist kein Grund.

### Rollenwissen neben den Zeilen

Eine Vorlage kann `weiterePunkte` mitbringen: Rollen für Datenpunkte, die keine
eigene Zeile bekommen. Ohne das zeigte „alle Datenpunkte des Geräts" bei den
meisten Zeilen *keine Rolle* an, weil hm-rpc das Feld schlicht leer lässt. Eine
`*.NAME`-Wildcard gilt je Kanal, sodass `2.LEVEL` und `3.RAMP_TIME` abgedeckt
sind, ohne jeden Kanal aufzuführen. An der Frage, welche Vorlage gewinnt, ändert
es nichts — angereichert werden nur Rohzeilen.

## Eigene Vorlagen sichern

Der Knopf **Als Vorlage speichern …** macht aus dem Gerät, das du vor dir hast,
wieder eine Vorlage. Pfade werden relativ zum Gerät, aus
`JSON.parse(val).ENERGY.Power` wird wieder `feld: "ENERGY.Power"`, und Rollen,
Einheiten und Formeln bleiben erhalten.

Was eine Vorlage von sich aus nicht wissen kann, ist, **welche Datenpunkte ein
Gerät zu dieser Art Gerät machen**. Das ist eine Aussage über alle künftigen
Geräte, also fragt der Dialog:

- **Pflichtpunkte** — vorgeschlagen (alles mit einem Schreibweg ist von Haus aus
  Pflicht), entschieden von dir mit einem Haken je Zeile. Jeder weitere
  Pflichtpunkt macht die Vorlage genauer und zugleich spröder.
- **Inhaltsprüfungen** — vorgeschlagen, wo ein JSON-Feld gelesen wird. Das ist,
  was „Steckdose" von „Steckdose mit Messung" trennt, deshalb wird es angeboten,
  aber nicht angehakt.
- **Namenshinweis** — wird nie abgeleitet. Er entscheidet nur zwischen Vorlagen,
  die gleich gut passen; MQTT kann eine Lampe nicht von einem PC unterscheiden.
- **mehrere Ausgänge** — ein Haken und die Nummer, die diesen Ausgang bezeichnet.
  Aus `stat.POWER1` wird dann `stat.POWER%N%`, ersetzt nur am Ende eines
  Pfadabschnitts, damit `ENERGY.Power` heil bleibt. Verweist der Entwurf noch auf
  die anderen Ausgänge, sagt der Dialog das: Eine solche Vorlage passte immer nur
  auf genau dieses eine Gerät.
- **darf es nicht geben** — Datenpunkte, deren Vorhandensein die Vorlage
  ausschließt.

Danach zeigt der Probelauf, was die Erkennung tatsächlich fängt, bevor
irgendetwas gespeichert wird.

### Sie verwalten

Die dritte Sicht neben **Alias anlegen** und **Alias bearbeiten** ist
**Vorlagen**: jede Vorlage mit ihrer Erkennung, ihren Datenpunkten, einem
ständigen Probelauf und dem rohen JSON. An einer eigenen Vorlage lässt sich dort
alles ändern: Name, Rang, Namenshinweis, die Pflicht- und die verbotenen
Datenpunkte, und jeder Datenpunkt selbst — eine Zeile anklicken öffnet Rolle,
Typ, Einheit, Pfade, Formeln und Merker. Datenpunkte lassen sich hinzufügen und
entfernen. Der Probelauf darunter reagiert auf jede Änderung, sodass man sieht,
was eine Änderung an der Erkennung bewirkt, bevor man speichert.

Mitgelieferte Vorlagen lassen sich nicht ändern — so bleiben sie immer der
Auslieferungszustand. *Eigene Kopie zum Bearbeiten* gibt dir eine Kopie unter
derselben Kennung, die das Original verdeckt; löschst du die Kopie, kommt die
mitgelieferte wieder zum Vorschein. *Duplizieren* gibt einer eigenen Vorlage eine
neue Kennung — für eine Abwandlung, die neben dem Original steht, statt es zu
ersetzen.

Das Einlesen nimmt eine Vorlage je Datei, in genau dem Format unter
`admin/vorlagen/`. Beim Einlesen wird nichts gespeichert: Die Datei erscheint
zuerst als Vorschau, mit einer Zeile, die sagt, was ein Speichern täte — neu
anlegen, deine eigene Fassung ersetzen oder eine mitgelieferte verdecken.

Deine Vorlagen liegen in `native.vorlagen` des Instanzobjekts, überstehen also
`iobroker upload` und Adapter-Aktualisierungen und sind Teil einer
Backitup-Sicherung. Eine eigene Vorlage mit derselben `id` wie eine
mitgelieferte verdeckt diese. Ablage und Austauschformat sind dasselbe JSON,
sodass eine gut geratene Vorlage unverändert ins Paket wandern kann.

### Wie eine Vorlage ausgewählt wird

Passen mehrere Vorlagen, entscheidet diese Reihenfolge:

1. **wie viele Datenpunkte die Vorlage wirklich belegt hat** — Pflichtpunkte, bei
   Mehrfachgeräten je Ausgang, dazu Inhaltsprüfungen, die zutrafen
2. **der Namenshinweis**, falls er passt
3. **deine eigene Vorlage** vor einer mitgelieferten
4. **`rang`**, damit dasselbe Gerät immer gleich erkannt wird

Die Reihenfolge ist wichtig. Zuerst Belege zu zählen ist das, was eine mit
Absicht gebaute Vorlage davor bewahrt, gegen eine mitgelieferte zu verlieren,
deren Stichwort zufällig im Gerätenamen vorkommt.

Was Schritt 3 für Aktualisierungen bedeutet: Eine eigene Vorlage **kann von
einer mitgelieferten nicht über den `rang` ausgestochen werden** — dieser Schritt
steht über `rang`, also kann keine künftige Fassung dieses Adapters dir
stillschweigend ein Gerät wegnehmen. `rang` entscheidet immer nur zwischen
Vorlagen derselben Herkunft, weshalb eine neue eigene Vorlage auch aus deinen
eigenen Vorlagen heraus nummeriert wird und die mitgelieferten Nummern gar nicht
beachtet.

Eine mitgelieferte Vorlage kann trotzdem über Schritt 1 gewinnen, indem sie
strikt mehr Datenpunkte belegt. Das ist Absicht — mehr Belege sollen gewinnen —
und betrifft nur Geräte, die du noch nicht gebaut hast: Ein fertiger Alias merkt
sich die Vorlage, aus der er entstand, und behält sie.

## Was eine Vorlage von sich aus anhakt

Ob ein Datenpunkt einen Platz im Muster des type-detectors hat, ist **nicht** das
Kriterium. Das entscheidet nur, *wo* der Punkt landet — im Gerät selbst oder in
einem eigenen Info-Gerät. Über die Frage, ob ihn jemand braucht, sagt es nichts.
Das Muster `thermostat` hat 24 Plätze, `socket` hat 14; alles, was jemals in
einem solchen Gerät sitzen könnte, steht dort, bis hin zu Frequenz und
Scheinleistung.

Das Kriterium ist der Zweck: **angehakt wird, was man braucht, um das Gerät zu
bedienen und zu merken, dass etwas nicht stimmt.** Sollwert, Istwert und die
Meldungen, die einen Ausfall ankündigen — `LOWBAT`, `UNREACH`.

Nicht angehakt bleibt die Diagnose. Signalstärke, Laufzeit, Rampenzeiten,
Sperren. Die hakt man an, wenn man einem Problem nachgeht.

Die **Batteriespannung** sieht aus, als gehörte sie in die erste Gruppe — sie
fällt über Wochen sichtbar, während `LOW_BAT` erst umspringt, wenn der Wechsel
schon fällig ist. Sie bleibt trotzdem aus, weil der Detektor keinen Platz für
sie hat. Muster setzen sich aus zwei gemeinsamen Gruppen zusammen:

```
maintenance  WORKING UNREACH LOWBAT MAINTAIN ERROR DIRECTION
             CONNECTED RSSI ON_TIME BATTERY   value.battery   Einheit %
metering     ELECTRIC_POWER CURRENT VOLTAGE CONSUMPTION
             FREQUENCY SPEED POWER            value.voltage   Einheit V
```

`VOLTAGE` sitzt zwischen Strom und Verbrauch: Es ist die **Netzspannung eines
Messgeräts**, nicht die Zellspannung eines Sensors. Ein Fensterkontakt hat gar
keine metering-Gruppe, deshalb hat er auch keinen Spannungsplatz — und
`BATTERY`, den Platz, den er hat, meint einen Prozentwert. In beide Volt zu
schreiben wäre falsch, also wird der Punkt angeboten und bleibt aus.

Zwei Dinge stechen diese Regel:

- Ein Punkt, der **dieselbe Quelle** liest wie ein bereits angehakter, wird nie
  angehakt. Sonst steht derselbe Wert zweimal im Alias, und die siebte Prüfung
  meldet das zu Recht. Homematic-Schaltaktoren haben keinen eigenen
  Rückmeldewert — `1.STATE` ist beides —, deshalb bleibt ihr `ON_ACTUAL` aus.
- Wo der Zweck für Anhaken spricht, das Muster aber **keinen Platz** hat, wird
  abgewogen: Der Punkt landet in einem Info-Gerät neben dem eigentlichen. Für
  einen einzelnen Wert lohnt das selten, und der `hinweis` der Vorlage muss es
  sagen. Und prüfe, was ein Platz **bedeutet**, bevor du ihn benutzt — ein
  passender Name ist noch kein passender Zweck, wie der Spannungsfall oben zeigt.

## Vorlagenformat

![Ein Vorlagenblatt](https://raw.githubusercontent.com/RicardoHipp/ioBroker.alias-workbench/main/docs/04-template.png)

*Eine mitgelieferte Vorlage, nicht änderbar: Kopfdaten, was es geben und was es nicht geben darf, damit sie greift, und ihre Datenpunkte. „Eigene Kopie" macht sie bedienbar.*

Eine JSON-Datei je Vorlage unter `admin/vorlagen/`. Beispiel:

```jsonc
{
  "id": "tasmota-steckdose",
  "version": 1,
  "rang": 20,
  "name": { "en": "Tasmota socket", "de": "Tasmota-Steckdose" },
  "geraetetyp": "socket",

  "erkennung": {
    "erforderlich": ["stat.POWER", "cmnd.POWER"],
    "inhalt": { "tele.SENSOR": "ENERGY" },
    "namenshinweis": "steckdose|dose|plug|socket"
  },

  "zustaende": [
    { "name": "SET", "rolle": "switch", "typ": "boolean",
      "lesen": "stat.POWER", "schreiben": "cmnd.POWER",
      "schreibformel": "val ? \"ON\" : \"OFF\"" },

    { "name": "ELECTRIC_POWER", "rolle": "value.power", "einheit": "W",
      "lesen": "tele.SENSOR", "feld": "ENERGY.Power", "optional": true },

    { "name": "TODAY", "rolle": "value", "einheit": "kWh",
      "lesen": "tele.SENSOR", "feld": "ENERGY.Today",
      "optional": true, "vorgabeAus": true }
  ]
}
```

| Schlüssel | Bedeutung |
|---|---|
| `erkennung.erforderlich` | diese Datenpunkte muss es geben, sonst greift die Vorlage nicht |
| `erkennung.inhalt` | der genannte Datenpunkt muss dieses Feld in seinem JSON enthalten |
| `erkennung.verboten` | diese Datenpunkte darf es **nicht** geben, sonst greift die Vorlage nicht |
| `erkennung.namenshinweis` | entscheidet nur zwischen Vorlagen, die gleich gut passen |
| `rang` | letzter Stichentscheid, damit dasselbe Gerät immer gleich erkannt wird |
| `optional` | der Zustand entfällt, wenn seine Quelle oder das JSON-Feld fehlt |
| `vorgabeAus` | vorgeschlagen, aber nicht angehakt — siehe **Was eine Vorlage von sich aus anhakt** |
| `feld` | baut die Leseformel `JSON.parse(val).<Feld>` |
| `mehrfach` + `%N%` | ein Gerät je Ausgang; die Nummern werden aus dem Bestand gelesen |
| `werteliste` | Werteliste für den Datenpunkt — Plätze wie EFFECT werden ohne sie nicht erkannt |
| `absolut` | `lesen` ist eine vollständige Objektkennung, nicht relativ zum Gerät — dasselbe Objekt für jedes Gerät |
| `beschriftung` | der Anzeigename des Datenpunkts, wenn er vom Platznamen abweichen soll |
| `nachkommastellen` | Nachkommastellen für die Wertanzeige |

`verboten` ist das, was eine einfache Steckdose wirklich von einer mehrfachen
trennt: Die einfache hat kein `stat.POWER2`. Ein fehlender Datenpunkt zählt
bewusst **nicht** als Beleg — sonst ließe sich der Punktestand einer Vorlage mit
einer Liste erfundener Ausschlüsse aufblasen.

Datenpunktnamen werden ersatzweise ohne Rücksicht auf Groß- und Kleinschreibung
verglichen, weil MQTT die Schreibweise behält, die gesendet wurde — dieselbe
Gerätefamilie schickt am einen Gerät `cmnd.POWER` und am nächsten `cmnd.power`.

## Unter der Haube

```
Quelle (z. B. mqtt-client.0.…)
   ↓  eine Vorlage greift und wird angewendet
Entwurf im Speicher  →  Objektbild  →  type-detector  →  Bericht
   ↓  Trockenlauf
alias.0.<Ordner>.<Gerät>            Kanal + Zustände mit common.alias
```

Der Entwurf rührt die Objektdatenbank nie an. Der Detektor läuft gegen ein Abbild
des Entwurfs — deshalb reagiert der Bericht sofort, und deshalb kann beim
Ausprobieren nichts kaputtgehen.

Der type-detector ist eine echte npm-Abhängigkeit, mit esbuild für den Browser
gebündelt. Er wird nie in den Quellbaum kopiert — eine eingefrorene Kopie, die
von der Bibliothek abdriftet, war die Hauptschwäche des bestehenden
Alias-Managers.

## Entwicklung

```bash
npm install
npm run build      # bündelt @iobroker/type-detector nach admin/detector.js
```

`npm run build` fasst **nur** das Detektor-Bündel an. Die Module der Werkbank
werden ausgeliefert, wie sie sind; eines ändern und die Seite neu laden ist der
ganze Kreislauf. Auf einer laufenden Installation hält der Admin Adapterdateien
im Zwischenspeicher, deshalb ist `iobroker upload alias-workbench` nach dem
Kopieren das, was den Browser die Änderung sehen lässt.

Die Übersetzungen liegen in `admin/i18n/`. Eine neue Sprache ist eine neue Datei
dort und ein Eintrag in `SPRACHEN` in `admin/js/sprache.js` — sonst nichts. Achte
auf Zeichenketten, die direkt in `admin/tab.html` stehen: Sie werden zur
Laufzeit ersetzt, und eine, die niemand verdrahtet hat, bleibt für immer deutsch,
ohne dass es auffällt.

Die Werkbank besteht aus **29 ES-Modulen** unter `admin/js/`, die der Browser
direkt lädt — einen Bauschritt gibt es für sie nicht, und die Gestaltung liegt
in einer Datei, `admin/css/werkbank.css`. Weil eine falsch gesetzte Modulgrenze
erst zur Laufzeit auffällt, prüft `npm test` vor jedem Commit, ob sich noch
alles bündeln lässt, ob jeder Bezeichner deklariert oder importiert ist und ob
beide Sprachdateien dieselben Schlüssel tragen.

## Hintergrund

- [@iobroker/type-detector](https://github.com/ioBroker/ioBroker.type-detector) —
  entscheidet, was als Gerät zählt, über Rollen statt über Namen
- [Tasmota](https://tasmota.github.io/docs/) — die Gerätefamilie, die die
  mitgelieferten Vorlagen abdecken
- [ioBroker-Aliase](https://github.com/ioBroker/ioBroker.docs) — Aliase sind eine
  Kernfunktion des js-controllers, nicht die eines Adapters

## Änderungen

### 0.9.7
Diese Version ist am **Produktivsystem** gemessen — 24.786 Objekte, 140 Aliase. Am Testsystem mit 2.731 Objekten fällt nichts davon auf.

* Das Suchfeld blockiert nicht mehr. Der Baum wurde bei **jedem** Tastendruck komplett neu gebaut: gemessene **236 ms je Anschlag, acht Anschläge 1,9 Sekunden**. Jetzt wird 180 ms nach dem letzten Anschlag einmal gezeichnet — die Eingabe bleibt frei. Dazu drei Sparmaßnahmen im Baum selbst: zugeklappte Knoten werden gar nicht erst als DOM erzeugt (vorher entstand jeder Teilbaum und wurde gleich weggeworfen), die Frage „lässt sich das aufklappen?“ wird einmal je Zeile statt bei jedem Sortiervergleich beantwortet, und ein `Intl.Collator` ersetzt das `localeCompare` mit Optionsobjekt. **Der ganze Baum: 263 → 67 ms.**
* Ein Neuzeichnen kostet keine halbe Sekunde mehr. `kindZustaende`, `aliasFuer` und ihre Nachbarn gingen den sortierten Gesamtindex **linear** durch — 24.786 Vergleiche für zehn Treffer, rund zwanzigmal je Neuzeichnen, bei laufenden Werten alle 700 ms. Die Liste ist sortiert, der gesuchte Bereich liegt am Stück: eine Binärsuche findet ihn in fünfzehn Schritten. Dazu eine Rückwärtskarte Quelle → Alias, die einmal je Indexstand entsteht. **Zeichnen einer Quelle 15,8 → 1,6 ms, eines Alias mit 50 Punkten 51,9 → 14,2 ms.** Nachgewiesen gleich: 3.025 Geräte und alle 727 Aliaspunkte gegen die alten Fassungen geprüft, null Abweichungen
* Eine Leseformel kann den Reiter nicht mehr dauerhaft einfrieren. Formeln aus `common.alias.read` und aus Vorlagen laufen als JavaScript im Admin — bei jedem Zeichnen, je Zeile, ungefragt. Das ist keine neue Rechteausweitung (wer die Formel schreiben darf, hat sie schon im js-controller laufen), aber ein Ausführungsort ohne Grenzen: `try/catch` fängt keine Endlosschleife. Jetzt wird das Ergebnis je Formel und Rohwert gemerkt — 2000 Auswertungen in 0,6 ms —, und was einmal länger als 250 ms gebraucht hat, läuft nicht wieder; die Zeile sagt, warum
* Der Objektzähler in der Kopfzeile bleibt nicht mehr stehen. An vier Stellen wurde der Index direkt gesetzt statt über `indexNeu()` — dadurch behielt die Kurznamen-Karte gelöschte Kennungen, und `hatPunkt` lieferte Treffer auf Punkte, die es nicht mehr gab
* Ein voller Detektorlauf je Zeichnen ist weggefallen. Sein Ergebnis wurde über zwei Zwischenschritte in einen Parameter gereicht, den niemand liest. Ebenso gestrichen: `e.andere` und die toten Symbole `bestandsWert` und `anzeigeText`
* Die Schreibquellenregel steht an einer Stelle statt an fünf. Sie war wörtlich gleich dreimal in `entwurf.js` und zweimal in `zuordnung.js` ausprogrammiert — und die Kommentare an zwei dieser Stellen dokumentieren je einen Fehler, der genau daraus entstanden ist
* **Richtigstellung zu 0.9.6:** Dort sollten Adapter- und Instanzwurzeln unwählbar werden — geprüft wurde aber `_tiefe`, und das ist die Höhe des Teilbaums **unter** einem Knoten, nicht seine Stelle im Baum. Am Testsystem schloss das 131 Knoten aus, genau einen davon zu Recht: Die anderen 130 waren Sparten wie `…Decklenlicht_RGB.cmnd` und Ordner wie `iot.0.smart`, deren Datenpunkte direkt darunter liegen. Die wählbaren Knoten fielen von 449 auf 320. Jetzt wird die Stelle geprüft; `mqtt-client` und `mqtt-client.0` bleiben gesperrt, alles andere ist wieder da

### 0.9.6
**Anzeige und Ablauf**
* „Alle Datenpunkte“ hält Ausgang und Handwahl fest. An einer Mehrfachvorlage mit Ausgang 2 kamen die Zeilen von Ausgang 1 zurück, während das Ziel weiter `…Ausgang_2` hieß; und hatte die Automatik nichts gefunden und man die Vorlage von Hand gewählt, landete man nach dem Klick im Rohmodus — die Handwahl war weg
* „Weicht vom Alias ab“ erscheint jetzt auch im Aliasmodus. Die Marke bekam das Ziel, und das ist dort nie gesetzt: Man steht ja schon auf dem Alias. Sie erschien also ausgerechnet dort nie, wo sie am meisten sagt
* Ein schneller Quellenwechsel holt keinen fremden Wert mehr. Der Nachlade-Rückruf legte den Wert unter der Quelle ab, die beim Eintreffen eingestellt war — und da nur geholt wird, was noch fehlt, blieb es dabei
* Die Quellen-Sprungliste steht nie doppelt. Sie hängt am Seitenkörper, damit sie ein automatisches Neuzeichnen überlebt; der Knopf ist danach aber ein anderer, und der zweite Klick legte eine zweite Liste über die erste
* Ein Raum wird auch dann vorgeschlagen, wenn er das letzte Segment ist. Bei einem flachen Adapter wie `sonoff.0.Wohnzimmer` lief die Suche über den Quellenpfad kein einziges Mal
* Objektnamen folgen der Adminsprache. Es gab zwei Leser für dieselbe Frage, einer nahm fest Deutsch vor Englisch — auf einem englischen Admin standen Objekte, Räume und Funktionen deshalb deutsch da. Und der Namensabgleich sieht jetzt alle Sprachfassungen an: „Light“ im Bestand fand die Funktion „Licht“ nicht und legte einen Doppelgänger daneben

**MQTT und Tasmota**
* Ein leerer `custom`-Eintrag legt nichts mehr lahm. `common.custom` kann einen Eintrag mit dem Wert `null` tragen — ioBroker räumt ihn nicht weg, wenn eine Instanz verschwindet. Der Zugriff darauf riss die ganze Ergebnisansicht mit
* `enabled: false` gilt als abgeschaltet. Der Bezeichner kam im Leser gar nicht vor: Ein Eintrag `{ enabled: false, publish: true }` galt als sendefähig, obwohl die Instanz den Punkt nicht bedient
* Kein falsches „kann nicht senden“ mehr bei ioBroker.mqtt und sonoff. Deren Objekte tragen das Thema nur in `native`; dafür stand fest „nein“ statt „unbekannt“, der Chip war rot, und der Knopf „senden erlauben“ schrieb das Objekt unverändert zurück — eine Meldung, die sich nicht abstellen ließ
* „Antwort erhalten“ nur bei einer echten Antwort. Ein `stat.RESULT`, das retained von vorgestern dasteht, reichte für die grüne Rückmeldung, auch wenn das Gerät aus ist
* `Vcc` und `Command` sind keine Befehle. `{"Command":"Unknown"}` — die Antwort auf einen unbekannten Befehl — stand als fehlender Sendepunkt da, mit Anlegen-Knopf
* Befehlsnamen aus fremdem JSON kommen nicht mehr ungeprüft in Kennung und Thema. Ein Schlüssel mit `#` ergäbe ein Wildcard-Abo, einer mit `.` eine zusätzliche Ebene

**Vorlagen und Geräte**
* Der Rollladen bekommt seinen STOP. Ein Tastendruck hat keinen Zustand zum Lesen, und genau diesen Fall kannte das Anwenden nicht: Ohne Lesepfad fiel der Punkt heraus — kein einziger Rollladen-Alias hatte je einen STOP
* ON_TIME findet seinen Platz. Vier Vorlagen führten die Rolle `level.timer`, der Platz verlangt `level.timer.off`; der Punkt landete deshalb im info-Gerät statt am Schaltgerät
* Eine ausdrückliche Formel gewinnt gegen das Feld. Wo eine Vorlage beides angibt, wurde die Formel verworfen und aus dem Feld eine neue gebaut

**Abos und Baum**
* Abonniert wird, was gelesen wird — nicht der halbe Adapter. Die Muster kamen aus der Anzeige-Verteilung: Bei einem flachen MQTT-Gerät wurde daraus `mqtt-client.0.*` mit über dreihundert Objekten an einem einzigen Alias. Jetzt sind es die Kanäle der tatsächlichen Quellen, Sparten desselben Geräts zu einem Muster zusammengefasst, und wo auch das zu breit wäre, die Quellen einzeln
* Adapter- und Instanzwurzeln sind nicht mehr wählbar. `mqtt-client.0` ist kein Gerät; die Auswahl hätte den ganzen Namensraum abonniert
* Dunkle Admin-Themen werden erkannt. Die Erkennung kannte vier Namen; `blue` und `colored` fielen durch und landeten bei der Systemeinstellung
* Eine späte Antwort auf `system.config` gilt trotzdem. Nach 2,5 Sekunden geht es ohne weiter — die Antwort danach wurde ganz verworfen, und ohne sie fehlten alle Expertenobjekte im Baum

**Aufräumen**
* Die Prüfungen fassen wieder nichts an. Eine von ihnen schrieb aus dem Zeichenpfad heraus ein Objekt
* Der Löschdialog warnt vor eigenständigen Kanälen unterhalb des Ziels. Der Hinweistext sprach nur von „Datenpunkten darunter“
* Vier tote Sprachschlüssel entfernt — und der Test prüft jetzt beide Richtungen, nicht nur Code → JSON

### 0.9.5
* Ein kaputter Namenshinweis legt nicht mehr die ganze Quellenansicht lahm. Der Text wurde ungeprüft als regulärer Ausdruck ausgewertet, obwohl ihn weder das Vorlagenblatt noch der Speichern-Dialog prüft: Nach dem Speichern von `Lampe (Bad` warf die Vorlagenprüfung bei **jeder** Geräteauswahl, kein Aufrufer fing das, und die rechte Seite blieb leer — zu reparieren nur noch über die Instanzkonfiguration von Hand. Jetzt zählt ein unbrauchbarer Ausdruck als „trifft nicht“ und wird im Feld rot gemeldet. Dasselbe gilt für die verschachtelte Form `(a+)+`, an der die Ausdrucks-Maschine hängenbleibt: gemessene 3196 ms für einen Gerätenamen, jetzt keine
* Die Formel einer Ersatzquelle überlebt das Aktualisieren einer Vorlage. Sie wurde unter `formel` abgelegt, gelesen wird aber `leseformel` — beim Aktualisieren aus einem Gerät ging sie damit still verloren. Folge bei `tasmota-steckdose`: An Geräten ohne `stat.POWER` landete der boolesche Alias danach auf dem rohen JSON-Text von `tele.STATE` statt auf `POWER`
* Ein Gerätetyp, den dieser Detector nicht kennt, wirft nicht mehr. Die angebotene Musterliste war gefiltert, der **gewählte** Typ nicht — er kommt ungeprüft aus der Vorlage. Eine eingelesene Vorlage mit dem Musternamen eines neueren type-detector ließ die Musterwahl werfen, und der Entwurf wurde gar nicht erst gezeichnet
* Das Einlesen prüft jetzt mehr als Kennung und Zustände. `erkennung.erforderlich` als Text statt als Liste ließ die Vorlagenprüfung danach an **jedem** Gerät werfen; ein fehlendes `name` warf schon beim Öffnen im Blatt. Und „Einlesen und speichern“ stand zu diesem Zeitpunkt längst da — man konnte eine Vorlage speichern, die den Reiter danach unbrauchbar machte. Geprüft werden jetzt `erkennung`, `erforderlich`/`verboten`, `inhalt`, `name`, der Namenshinweis und der Gerätetyp; ein einzelner Text, der eindeutig eine Liste meint, wird zu einer gemacht statt abgewiesen
* Eine von Hand eingetippte Kennung ersetzt keine fremde Vorlage mehr. Auf freie Kennungen wurde nur beim Umschalten geprüft, nicht nach der Handeingabe — und gespeichert wird bei gleicher Kennung ohne Rückfrage, im Modus „neu“ sogar mit Version 1. Aus einer eigenen Vorlage v7 wurde so still eine ganz andere v1. Jetzt steht der Grund rot am Feld und das Speichern ist gesperrt
* Der Platzhalter `%N%` trifft nur noch die Ausgangsnummer. Ersetzt wurde rein nach Endziffer: An einem Mehrfachgerät mit Ausgang 2 wurde damit auch die IP-Zeile aus `tele.INFO2` zu `tele.INFO%N%` — und an Ausgang 1 meldete dieselbe Zeile einen fremden Ausgang, „Andere weglassen“ warf sie hinaus. Zum Platzhalter wird jetzt nur, was den Ausgang trägt: was die Vorlage im Original schon mit `%N%` führte, der Vorspann aus `kanalname` und was mit derselben Nummer mehrfach vorkommt

### 0.9.4
* Nach einem Verbindungsabbruch arbeitet der Reiter wieder. Er lädt nicht socket.io, sondern den WebSocket-Shim des Admin — und dort feuert `connect` genau einmal pro Seitenleben, danach nur noch `reconnect`. Das hörte niemand, und der Shim erneuert von sich aus kein einziges Abo. Nach jedem Aussetzer — Admin-Neustart, Netzwerkhänger, Standby — kamen weder Objekt- noch Wertänderungen an, und der Punkt in der Kopfzeile blieb auf „getrennt“ stehen, obwohl die Verbindung längst wieder stand. Jetzt wird `reconnect` gehört: die Anzeige geht auf „verbunden“, alle Abos werden erneuert und der Bestand neu gelesen — während der Trennung kann sich alles geändert haben, und mitbekommen hat es niemand
* Der Vorlagenmodus baut sich nicht mehr im Sekundentakt neu auf. Wer ein Gerät mit laufenden Werten gewählt hatte und in den Vorlagen-Tab wechselte, baute dort alle 700 ms das ganze Blatt neu, samt Probelauf über alle Kandidaten und alle Vorlagen — die Auswahl bleibt beim Moduswechsel absichtlich stehen, aber rechts steht dann gar keine Zustandsliste mehr
* Wo die Auswahl fällt, fallen jetzt auch ihre Abos. Abgemeldet wurde nur beim Auswählen des nächsten Knotens; die vier anderen Wege — Moduswechsel, Zweig zuklappen, Expertenmodus abschalten, Alias löschen — meldeten nichts ab. Danach lief ein Abo auf ein Gerät, das rechts gar nicht mehr stand, und der Zähler in der Kopfzeile behauptete weiter „ein Abo“
* Ein Knotenwechsel während des Ladens lässt den Aufrufer nicht mehr hängen. Der Rückruf kam in diesem Fall nie: „läuft“ blieb für immer am Knopf stehen, und der Trockenlauf, der nach dem Anlegen fehlender Sendepunkte aufgehen soll, ging nie auf. Zwölf Sekunden Wartezeit bei einer SetOption59-Abfrage sind reichlich Gelegenheit dafür

### 0.9.3
* Ein Fehler an den Aufzählungen hält das Verlegen jetzt auf. Der erste Schritt — das Neue anlegen — brach bei einem Fehler schon immer ab, „besser zwei als keiner“; der zweite nicht: Die Aufzählungs-Fehler wurden gesammelt und das Löschen des Alten lief trotzdem. Danach war der alte Alias weg und der neue stand in keiner Aufzählung mehr, denn beim Löschen trägt der js-controller selbst aus. Die Zuordnung war damit ganz verloren, nicht nur verwaist. Jetzt gilt derselbe Abbruch wie eine Stufe darüber, und der Knopf bietet „Noch einmal versuchen“ an
* Ein Teilfehler beim Löschen macht den Wiederholen-Knopf nicht mehr zur Attrappe. Schlug eins der Löschen fehl, fielen trotzdem **alle** Kennungen aus dem eigenen Bestand, leere Ordner und Aufzählungen wurden geräumt und das Löschziel auf null gesetzt — und genau damit begann `loescheAlias` und stieg sofort wieder aus. Was in der Datenbank stehenblieb, war über die Werkbank nicht mehr zu greifen: sie hielt es für gelöscht. Jetzt wird nur ausgetragen, was wirklich weg ist, das Aufräumen unterbleibt, das Ziel bleibt stehen — und der zweite Klick räumt tatsächlich auf
* Verwaiste Punkte werden auch beim zweiten Anlauf gelöscht. Ihre Liste wurde nach dem Schreiben **immer** geleert, auch nach einem Fehlschlag; der Wiederholen-Knopf schrieb dann zwar die Objekte, entfernte aber nichts mehr, und die Meldung zählte es auch nicht mehr mit
* Ein Ladefehler bei den eigenen Vorlagen wird gemeldet statt verschwiegen. Antwortete die Instanzkonfiguration mit einem Fehler, galt das als „keine eigenen Vorlagen“ — der Warnchip in der Kopfzeile blieb aus, obwohl der Timeout-Pfad eine Zeile darüber ihn richtig setzt. Gefährlich war die Folge: Die Werkbank hielt vergebene Kennungen für frei, und das nächste Speichern hätte eine vorhandene Vorlage mit Version 1 ersetzt. Der Hinweis am Chip sagt das jetzt auch

### 0.9.2
* Der Quellentausch schreibt nicht mehr auf die Lesequelle: Findet er für einen Punkt mit getrennten Quellen kein neues Schreibziel, blieb bisher eine blosse Zeichenkette in `alias.id` stehen — und die heisst für den js-controller „lesen und schreiben auf dieselbe Kennung“. Bei Tasmota ging der Befehl damit ins Status-Thema statt ins Befehls-Thema: das Gerät schaltet nicht, die Rückmeldung ist verfälscht. Verschärfend riet die Werkbank die Schreibquelle nach dem Namen und landete dabei auf `stat.POWER`, weil dort auch „POWER“ steht. Jetzt zählt ein geratenes Schreibziel nur, wenn es ein anderer Punkt ist als die Lesequelle, die Objektform bleibt erhalten, und die Zeile weist den fehlenden Treffer rot aus
* Verlegen erkennt zwei Ziele mehr als Kollision: eines, das nur als Baumknoten mit Datenpunkten besteht — dort wurden vorhandene Punkte gleichen Namens überschrieben —, und eines, das unter dem Alias selbst liegt: `alias.0.X` nach `alias.0.X.Sub` nahm beim abschliessenden Löschen den eigenen Elternknoten mit
* Ein abgelehntes Anlegen eines Sendepunkts gilt nicht mehr als Erfolg. Der stille Weg nahm den Fehler nicht einmal entgegen und trug das Objekt trotzdem in den eigenen Bestand ein; danach griff die Sperre nicht mehr, und „Jetzt anlegen“ schrieb `alias.id.write` auf eine Kennung, die es in der Datenbank nie gab — genau der Fehler, den der js-controller sich dauerhaft merkt
* Kanalnamen werden zur Kennung gesäubert, wenn „Alle erzeugen“ je Ausgang einen Kanal anlegt. „Licht Bar, oben“ ergab eine Kennung mit Leerzeichen und Komma, „Küche.Decke“ eine zusätzliche Ebene samt Zwischenordner. Und der js-controller lehnt so etwas nicht ab, er säubert still — das Objekt wäre also unter einer anderen Kennung entstanden als angezeigt. Der Anzeigename bleibt davon unberührt
* Die Vorlagenverknüpfung eines Kanals überlebt ein Aktualisieren, auch wenn die Vorlage gelöscht oder umbenannt wurde. `native` wurde bisher vollständig ersetzt; Vorlage, Version und Gerätetyp kamen nur zurück, wenn gerade eine Vorlage griff. Die Rolle wurde eine Zeile weiter unten längst gerettet, `native` nicht
* Gehärtet: die Bereinigung getrennter Quellen schaltet keinen Punkt mehr ab, der selbst im Alias steht. Ob das passierte, hing an der Reihenfolge von `Object.keys` — über die Oberfläche war es nicht auslösbar, weil keine der mitgelieferten Vorlagen eine Melderzeile vor die Stellzeile setzt, aber die Folge wäre ein gelöschter Datenpunkt gewesen

### 0.9.1
* Ein Ladefehler der Aufzählungen kann keine mehr überschreiben: Bisher setzte ein fehlgeschlagenes `getObjectView` den Vorrat auf leer und verschwieg es. Danach hielt die Werkbank jede Aufzählung für nicht vorhanden, der Katalog bot sie weiter an, weil der Dublettenfilter gegen nichts prüfte, und beim Schreiben ersetzte `setObject` das vorhandene Objekt durch ein frisches mit einem einzigen Mitglied — gemessen verlor ein Raum dabei drei von vier Mitgliedern und bekam obendrein die Herkunftsmarke, die ihn später löschbar macht. Jetzt bleibt der alte Stand stehen, es wird keine Aufzählung angefasst, und Feld wie Trockenlauf sagen, warum Raum und Funktion gerade nicht geschrieben werden. Der Alias selbst entsteht weiterhin, und ein Aussetzer heilt sich nach drei Versuchen selbst
* Eine von außen gelöschte Aufzählung wird nicht mehr wiederbelebt: Das Abo verglich gegen `objects`, wo Aufzählungen nie liegen — beim Löschen waren alter und neuer Wert deshalb beide leer, und der Zweig, der sie aus dem Vorrat nimmt, wurde nie erreicht. Der nächste Alias mit diesem Raum legte sie samt aller alten Mitglieder wieder an, auch der fremden
* „Alle erzeugen“ gibt jedem Kanal seinen Raum und seine Funktion. Die Teil-Entwürfe trugen keinen von beiden, also entstand für keinen einzigen Kanal ein Eintrag — der Einzelweg setzte ihn, der Sammelweg nicht. Ein zweites Objekt derselben Aufzählung wurde zudem verworfen, sodass selbst dann nur der erste Kanal hineingekommen wäre. Und für einen fremden Ausgang galt die Zuordnung als leer: Stand sein Alias schon in einem Raum, trug ihn der Sammelweg dort **aus**. Jetzt behält jeder Kanal, was er hat, alle übrigen bekommen das Eingestellte, und die Mitglieder werden vereinigt statt verworfen

### 0.9.0
* Die Rollenliste ist wieder vollständig: der Detektor liefert die Ausdrücke seiner Plätze als Text MIT Schrägstrichen (`/^indicator…$/`), nicht als regulären Ausdruck. Wer sie für Teil des Ausdrucks hält, findet danach weder Anfang noch Ende — 210 statt 232 Rollen, und ausgerechnet `indicator.lowbat` fehlte, die Rolle, die jedes Homematic-Gerät schreibt. In der Rollenwahl stand ohne Suchtext deshalb kein einziger Musterplatz mehr, sondern nur die Zeile „alle Rollen anzeigen"
* Aus derselben Ursache bekam BRIGHTNESS in sechs Farblicht-Mustern gar keine Rolle mehr — der Platz ließ sich beliebig oft zufügen und war auf keinem Weg zu befüllen. Es waren sieben Stellen im Code, die einen Platzausdruck lasen; sie gehen jetzt alle durch dieselbe Funktion, und ein Test prüft die Rollenliste gegen das, was der Detektor wirklich liefert, statt gegen selbstgeschriebene Ausdrücke
* Die Abweichungskarte sagt wieder die Wahrheit, wenn man einen Punkt abwählt: sie behauptete „hätte ohnehin nicht gezählt" auch über Punkte, die im Muster sehr wohl einen Platz haben (gleiche Ursache)
* Ein Punkt, den die Vorlage unter anderem Namen führt, behält an der Quelle seine Rolle und seine Beschriftung: die Werkbank hat zwei Funktionen für dieselbe Aufgabe, und die zweite stieg bei gesetzter Vorlage aus. Am Alias stand `state` und „Lavalampe ACTUAL", an der Quelle `sensor.light` und gar nichts — ein Aktualisieren hätte beides überschrieben. Was die Vorlage stattdessen wollte, steht jetzt wie überall sonst als Marke an der Zeile und lässt sich Feld für Feld übernehmen
* Beim Laden holt die Werkbank keine zwei Dateien mehr, die es nicht gibt: sie suchte im Verzeichnis des Admin nach Dateinamen und setzte `assets/` davor, obwohl dort ganze Pfade stehen — und zwei Einträge liegen ausdrücklich nicht in diesem Ordner (`"path": ""`). Das gab zwei 404 in der Browserkonsole. Gesucht werden jetzt Pfade statt Namen, und ein führendes `./` wird abgeschnitten: das Verzeichnis schreibt `assets/…`, die `index.html` `./assets/…`, und ohne diesen Schritt stünde dieselbe Datei zweimal in einer Liste, die nach 25 Einträgen endet
* Die Liesmich nennt zwei Dinge, die sie bisher verschwieg: dass die Werkbank aus einem erkannten JSON die Leseformel selbst vorschlägt — abgesichert gegen fehlende Felder, und in beide Richtungen lesbar —, und dass sie Rollen, Kanalrolle, Raum und Funktion samt deren Bildern gleich mitpflegt
* Im Alias laufen die Werte jetzt mit: die Werkbank abonnierte die Alias-Punkte, zeigt aber die Werte ihrer Quellen — die Zahlen wurden einmal geholt und standen dann still. Jetzt werden die Quellen mit abonniert. In der Kopfleiste steht, wie viele Abos laufen; ein Abo umfasst einen ganzen Zweig, und der Hinweis nennt sie einzeln, damit sofort auffällt, wenn eines hängen bleibt
* Die Beschriftung einer Zeile steht jetzt im Hinweis an ihrer Kennung statt daneben — mit den Marken, die eine Zeile tragen kann, wurde sie so voll, dass Rolle und Wert nach rechts wegrutschten. Ein gepunkteter Unterstrich zeigt, wo ein Hinweis wartet
* Ein Alias, dessen Punkte aus mehr als einem Knoten lesen, sagt es jetzt: neben „zur Quelle →" steht der Chip „n Quellen" und nennt im Hinweis jeden Knoten mit der Zahl seiner Punkte, der Sprungknopf fragt, wohin, statt stillschweigend zur Mehrheit zu gehen, und die einzelnen Zeilen, die woandershin zeigen, tragen eine Marke mit ihrem Adapter. Vorher fiel es nur auf, wenn man jede Zeile aufklappte. Der Rückweg gilt jetzt auch von einer Nebenquelle — „zum Alias →" stand dort vorher nicht. Sparten desselben Geräts (`stat` und `tele` eines Tasmota) zählen nicht als zweite Quelle. Die Auswahl erscheint nur unter „zur Quelle" — der Sprung zum Alias hat genau ein Ziel. Auch Sparten, die nebeneinander liegen, fallen jetzt zusammen und nicht nur die gegen die Hauptquelle — ein Tasmota über `stat` und `tele` zählte doppelt. Und Rückweg wie Zeilenmarken richten sich jetzt nach der Quelle, an der man steht: „zum Alias" gibt es an jeder Quelle eines Alias, auch am Gerät über einer Sparte, und markiert ist eine Zeile dann, wenn sie nicht von hier kommt. Am Alias selbst trägt jede Zeile ihren Tag — dort steht man nirgends, also ist keine Quelle die normale, und ein Gleichstand entscheidet nichts mehr. Der Tag nennt die Quelle statt des Adapters, und in der Auswahlliste ist keine Zeile hervorgehoben
* Knoten ohne Datenpunkte fallen nicht mehr aus dem Baum: ein Kanal, Gerät oder Ordner, den es gibt, der aber leer ist, steht jetzt ausgegraut da — ohne Zahl, nicht anklickbar, mit einem Hinweis im Tooltip. Weggelassen sah es aus, als gäbe es den Knoten gar nicht, während in Wahrheit der Adapter seine Datenpunkte nicht angelegt hatte. Beim Filtern zählen sie nicht als Treffer

### 0.8.3
* Der Trockenlauf zeigt jetzt auch Aufzählungen im Vergleich: die Spalte „bisher" blieb bei ihnen leer, weil Aufzählungen in einem eigenen Vorrat liegen und der Trockenlauf nur im Objektspeicher nachsah. Alles stand als neu da, und man konnte nicht sehen, dass elf von zwölf Mitgliedern längst drin waren
* …und die Oberfläche kündigt dort kein Anlegen mehr an, wo sie ändert: an so einem Alias sagte der Chip „wird neu angelegt", der Knopf bot „Alias erzeugen", der Trockenlauf hieß „das würde entstehen", Raum und Funktion wurden geraten statt gelesen, übrig gebliebene Punkte fielen nicht auf, und Verlegen, Quelle tauschen und Entfernen taten nichts. Alle fragten, ob der Kanal ein Objekt ist, statt ob es den Alias gibt
* Ein Alias, dessen Kanal nur als Kennung besteht und nicht als Objekt — der Normalfall, wenn man Punkte von Hand im Admin anlegt —, wird jetzt überhaupt gegen den Bestand gehalten. Vorher stieg der ganze Abgleich dort aus, und ein Aktualisieren hätte Beschriftungen durch die blossen Punktnamen ersetzt und Rollen, Formeln und Schreibrichtung gleich mit
* Dieselbe Regel fehlte ein drittes Mal, bei Aliasen, deren Punkte mehrfach auf **denselben** Quellpunkt zeigen — ein Rollladen, bei dem OPEN, CLOSE, SET und pct alle auf `level` gehen. Nur der erste behielt seine Schreibquelle, die übrigen verloren sie, und ein Aktualisieren hätte den Rollladen über seinen Alias unfahrbar gemacht
* Ein vorhandener Alias verliert beim Aktualisieren nicht mehr seine Beschriftung an den blossen Zeilennamen, und aus einem Nur-Lese-Alias wird kein schreibbarer mehr: der Übernahme aus dem Bestand fehlten beide Regeln, die ihr Gegenstück längst hatte. Die falsche Marke „weicht vom gespeicherten Alias ab", die daher rührte, ist damit ebenfalls weg
* Eine Zeile, die aus dem gespeicherten Alias stammt und aus einer Quelle außerhalb des angeklickten Knotens liest, bekommt jetzt ihren Wert: die Werte wurden geholt, bevor es die Zeile überhaupt gab, und so behauptete sie „Quelle liefert nichts", während der Alias einwandfrei arbeitete. Betraf nur Aliase aus mehreren Adaptern, und nur bis zum zweiten Klick auf den Knoten

### 0.8.2
* Hat eine Quelle schon einen Alias und zeigt das Ziel woandershin, sagt die Werkbank es jetzt: „Für diese Quelle gibt es schon alias.0.… — der bleibt stehen", daneben ein Knopf „stattdessen verlegen …", der den Verlege-Dialog vorbelegt öffnet. Verboten wird nichts — zwei Aliase auf eine Quelle bleiben möglich, nur nicht mehr lautlos
* Dieselbe Zeile steht im Trockenlauf, direkt über dem, was nicht geschrieben werden kann
* Das Angebot, den getippten Ordner als Raum zu übernehmen, erscheint jetzt auch an einem Gerät, das schon einen Alias hat — gerade dort, wo der Raum mitsoll
* Escape verwirft im Zielbalken jetzt auch im Ordner- und im Namensfeld das Getippte und stellt den alten Wert wieder her; vorher schloss das Ordnerfeld nur seine Liste, und beide behielten den getippten Text, der beim Verlassen übernommen wurde
* Werkzeug: Das Bezeichner-Prüfskript löst einen relativen acorn-Pfad jetzt gegen das Arbeitsverzeichnis auf
* Eine Zeile, deren Rolle die Werkbank beim Muster- oder Vorlagenwechsel angepasst hat, sagt es jetzt: „weicht vom gespeicherten Alias ab", darunter steht der gespeicherte Wert und ein Knopf holt ihn zurück
* Eine Zeile, die ihren Namen aus einem vorhandenen Alias übernimmt, trägt nicht mehr einen Zeichenlauf lang die falsche Marke „kein Platz im …-Muster"
* Der Wechsel auf eine Vorlage, die am Gerät gar keine Quelle findet, greift jetzt, statt still zu scheitern — und das Auswahlfeld zeigt keine Vorlage mehr an, die nicht benutzt wird
* Quelle tauschen: neben der Kennung der heutigen Quelle steht jetzt ihr Name
* Datenpunkte ohne Platz im Muster stehen in einer getönten Zeile; die Erklärung steht einmal über der Liste statt in jeder Zeile
* Wer die Auswahl wechselt, während Änderungen offen sind — im Baum, über „zur Quelle →" oder in der Ordnerübersicht —, wird jetzt gefragt; vorher waren sie kommentarlos weg
* Wo die Vorlage etwas anderes will, ist das betroffene Feld in der aufgeklappten Zeile getönt, der Wert der Vorlage steht darunter, und ein Knopf übernimmt genau diesen einen Wert
* Die Rollenliste bietet jetzt auch die weiteren Schreibweisen eines Platzes an (indicator.lowbat neben indicator.maintenance.lowbat) — ohne die veralteten
* Neues Adaptersymbol: zwei versetzte Karten — hinten die rohen Datenpunkte, vorn der fertige Alias, sortiert und benannt


### 0.8.1
* Veröffentlichung über npm Trusted Publishing (OIDC); Ausgaben sind mit Herkunftsnachweis signiert

### 0.8.0
* Einstellungsseite in elf Sprachen
* ESLint und eine CI-Werkstatt; Prüfungen laufen vor jedem Commit
* Die Knöpfe unten richten sich nach dem Modus
* Neue Beschreibung

## Lizenz

MIT-Lizenz

Copyright (c) 2026 Ricardo Hipp <ricardo.hipp@googlemail.com>

Hiermit wird unentgeltlich jeder Person, die eine Kopie der Software und der
zugehörigen Dokumentationen (die „Software") erhält, die Erlaubnis erteilt, sie
uneingeschränkt zu nutzen, inklusive und ohne Ausnahme mit dem Recht, sie zu
verwenden, zu kopieren, zu verändern, zusammenzufügen, zu veröffentlichen, zu
verbreiten, zu unterlizenzieren und/oder zu verkaufen, und Personen, denen diese
Software überlassen wird, diese Rechte zu verschaffen, unter den folgenden
Bedingungen:

Der obige Urheberrechtsvermerk und dieser Erlaubnisvermerk sind in allen Kopien
oder Teilkopien der Software beizulegen.

DIE SOFTWARE WIRD OHNE JEDE AUSDRÜCKLICHE ODER IMPLIZIERTE GARANTIE
BEREITGESTELLT, EINSCHLIESSLICH DER GARANTIE ZUR BENUTZUNG FÜR DEN VORGESEHENEN
ODER EINEM BESTIMMTEN ZWECK SOWIE JEGLICHER RECHTSVERLETZUNG, JEDOCH NICHT
DARAUF BESCHRÄNKT. IN KEINEM FALL SIND DIE AUTOREN ODER COPYRIGHTINHABER FÜR
JEGLICHEN SCHADEN ODER SONSTIGE ANSPRÜCHE HAFTBAR ZU MACHEN, OB INFOLGE DER
ERFÜLLUNG EINES VERTRAGES, EINES DELIKTES ODER ANDERS IM ZUSAMMENHANG MIT DER
SOFTWARE ODER SONSTIGER VERWENDUNG DER SOFTWARE ENTSTANDEN.
