# Ältere Änderungen

Einträge, die aus [README_de.md](README_de.md) herausgewachsen sind, neueste zuerst.
In der README bleiben die sieben Fassungen stehen, die auch der ioBroker-Admin zeigt.

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
