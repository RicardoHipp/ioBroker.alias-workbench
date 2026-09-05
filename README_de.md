# Alias Workbench — Kurzfassung auf Deutsch

Die vollständige Beschreibung steht auf Englisch im [README](README.md).

Ein Alias ist schnell angelegt und sieht danach immer gut aus. Ob er etwas
taugt, entscheidet sich an Dingen, die man **nicht sieht**: ob die Rollen ein
Gerät ergeben, ob die Quelle überhaupt existiert und einen Wert hat, ob die
Leseformel eine Zahl liefert und ob der Schreibweg funktioniert.

Diese Werkbank zeigt alle vier, **während** du baust. Der echte type-detector
läuft gegen einen Entwurf im Speicher, die Werte werden live gerechnet, und
geschrieben wird ausschließlich über einen Trockenlauf, der jedes Objekt vorher
als JSON zeigt.

Gerätewissen steckt in Vorlagen — JSON-Dateien, keine Programmzeilen. Eine neue
Gerätefamilie ist eine neue Datei. Sechzehn sind dabei: vier für Tasmota, ein
reiner Messpunkt und elf für Homematic, wo das Kunststück nicht ist, dass eine
Vorlage greift, sondern dass die **richtige** greift. Ein fertig gebautes Gerät
lässt sich als eigene Vorlage sichern; was sich ableiten lässt, wird abgeleitet,
der Rest wird gefragt — und ein Probelauf zeigt vorher, welche Geräte die neue
Vorlage fängt. Die dritte Sicht **Vorlagen** verwaltet sie: ansehen, ändern,
duplizieren, löschen, aus- und einlesen.

Gibt es den Alias schon, gewinnt sein Bestand — in beiden Ansichten dasselbe
Bild. Wo die Vorlage etwas anderes will, steht das an der Zeile, und ein Knopf
übernimmt es. Auf Klick, nie nebenbei.

Geht ein Gerät kaputt, biegt **Quelle tauschen** den Alias auf das Ersatzgerät
um, ohne ihn anzufassen: gleiche Kennung, gleiche Aufzeichnung, gleiche
Zuordnung. Zugeordnet wird über den Pfad, über die Vorlagenzeile oder — sichtbar
als „vermutet" — geraten.

Raum und Funktion stehen nicht am Objekt, sondern in Aufzählungen. Neben beiden
Feldern steht das Bild, das dort hinterlegt ist oder beim Schreiben dazukäme —
letzteres blass und mit einem kleinen **neu**. Damit sieht man vorher, was
passiert, statt es im Trockenlauf zu suchen.
