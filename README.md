<img src="admin/alias-workbench.png" width="80" align="right" alt="logo">

# ioBroker.alias-workbench

Build ioBroker aliases from templates — and see whether they actually work.

---

## Why

An alias is quickly created and always looks fine afterwards. Whether it is any
good is decided by things you **cannot see**:

- whether the **roles** are chosen so that the type-detector recognises a device
- whether the **source** exists at all and carries a value
- whether the **read function** returns a number or `undefined`
- whether the **write path** works

A tool that only links datapoints helps with none of that. This adapter shows
all four while you are building, not hours later in the log.

## What it does

**Live detector report.** The real `@iobroker/type-detector` runs against a
draft of your alias while you edit it. Change a role and the report changes with
it — you see immediately whether you built a device or a pile of loose values,
which pattern slots are filled and which are still free.

**Live value preview.** Every datapoint shows what its read function returns
*right now*, next to the raw value of the source. A formula that yields
`undefined` or throws is visible before anything is written.

**Templates.** A template describes how a device source becomes a finished alias
device. Templates are plain JSON files, one per template — see
[Template format](#template-format). Shipped with the adapter:
Tasmota socket, Tasmota light, Tasmota with multiple outputs, measurement point.

**Devices with several outputs.** A power strip or valve manifold has
`POWER1`, `POWER2`, … Since a `socket` pattern has exactly one `SET`, each
output becomes its own channel, grouped under one folder. The output numbers are
read from what actually exists — gaps are allowed.

**Nothing is written without a dry run.** The dry run lists every object that
would be created, changed or removed, as full JSON. Only from there can you
write. If a source does not exist, writing is blocked: the js-controller
remembers a missing source permanently, and only deleting and recreating the
object fixes it.

## Status

Early. Usable, but not finished.

- Works as an admin tab; the adapter itself runs no process (`mode: none`)
- German and English
- Not published on npm yet — install from GitHub
- Missing: creating and saving your own templates, mass creation,
  "who uses this alias", template versioning and re-applying

## How it works

```
source (e.g. mqtt-client.0.…)
   ↓  a template is matched and applied
draft in memory  →  object image  →  type-detector  →  report
   ↓  dry run
alias.0.<folder>.<device>          channel + states with common.alias
```

The draft never touches the object database. The detector runs against an image
of the draft, which is why the report reacts instantly and why nothing can break
while you experiment.

The type-detector is a real npm dependency, bundled for the browser with
esbuild. It is never copied into the source tree — a frozen copy that drifts
from the library was the main weakness of the existing alias manager.

## Template format

One JSON file per template under `admin/vorlagen/`. Example:

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

| Key | Meaning |
|---|---|
| `erkennung.erforderlich` | these datapoints must exist, otherwise the template does not match |
| `erkennung.inhalt` | the named datapoint must contain this field in its JSON |
| `erkennung.namenshinweis` | only breaks ties between templates that fit equally well |
| `rang` | last tie-breaker, so the same device is always detected the same way |
| `optional` | the state is skipped when its source or JSON field is missing |
| `vorgabeAus` | proposed but unchecked — used for values no pattern has a slot for |
| `feld` | builds the read function `JSON.parse(val).<field>` |
| `mehrfach` + `%N%` | one device per output; the numbers are read from what exists |

Datapoint names are matched case-insensitively as a fallback, because MQTT keeps
whatever casing was published — the same device family sends `cmnd.POWER` on one
unit and `cmnd.power` on the next.

## Installation

Not on npm yet. On the ioBroker host:

```bash
cd /opt/iobroker
npm install https://github.com/RicardoHipp/ioBroker.alias-workbench/tarball/main
iobroker add alias-workbench
```

Then open the admin and pick **Alias Workbench** in the left menu.

## Development

```bash
npm install
npm run build      # bundles @iobroker/type-detector into admin/detector.js
```

Translations live in `admin/i18n/`. A new language is a new file there and an
entry in `SPRACHEN` in `admin/tab.html` — nothing else.

## Background

- [@iobroker/type-detector](https://github.com/ioBroker/ioBroker.type-detector) —
  decides what counts as a device, by roles rather than names
- [Tasmota](https://tasmota.github.io/docs/) — the device family the shipped
  templates cover
- [ioBroker aliases](https://github.com/ioBroker/ioBroker.docs) — aliases are a
  core feature of the js-controller, not of any adapter

## Changelog

### 0.0.1

- First version. Detector report, live value preview, templates, devices with
  several outputs, dry run with write and removal, German and English.

## License

MIT — see [LICENSE](LICENSE).

---

## Kurzfassung auf Deutsch

Ein Alias ist schnell angelegt und sieht danach immer gut aus. Ob er etwas
taugt, entscheidet sich an Dingen, die man **nicht sieht**: ob die Rollen ein
Gerät ergeben, ob die Quelle überhaupt existiert und einen Wert hat, ob die
Leseformel eine Zahl liefert und ob der Schreibweg funktioniert.

Diese Werkbank zeigt alle vier, **während** du baust. Der echte type-detector
läuft gegen einen Entwurf im Speicher, die Werte werden live gerechnet, und
geschrieben wird ausschließlich über einen Trockenlauf, der jedes Objekt vorher
als JSON zeigt.

Gerätewissen steckt in Vorlagen — JSON-Dateien, keine Programmzeilen. Eine neue
Gerätefamilie ist eine neue Datei.
