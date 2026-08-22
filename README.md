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
Tasmota socket, Tasmota light, Tasmota colour light, Tasmota with multiple
outputs, measurement point.

**Your own templates.** Build a device — by hand or by adapting a shipped
template — and save it as a template of your own. What can be derived is
derived; what cannot be derived is asked. Before anything is stored, a try-out
runs the new template against every device in the system and shows which ones it
matches, which template wins there, and which devices would change hands. See
[Saving your own templates](#saving-your-own-templates).

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
- Missing: mass creation, "who uses this alias", re-applying a changed template
  to the devices built from it

## Why the tree shows devices that do not exist

With MQTT, ioBroker only creates objects for the datapoints themselves. A topic
like `SmartHome/Bastelzimmer/Gartenpumpe/stat/POWER` produces one object for
`stat.POWER` — the level `Gartenpumpe` is only part of a name, not an object.

The type-detector, however, looks for a `channel` or `device` to group
datapoints under. It finds none, so it recognises no device, and Alexa, Matter
and Material have nothing to attach to.

That gap is what the alias fills: `alias.0.…Gartenpumpe` is a real channel with
proper roles beneath it. The workbench therefore lets you pick such a
non-existent node in the tree and build a device out of it.

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
| `erkennung.verboten` | these datapoints must **not** exist, otherwise the template does not match |
| `erkennung.namenshinweis` | only breaks ties between templates that fit equally well |
| `rang` | last tie-breaker, so the same device is always detected the same way |
| `optional` | the state is skipped when its source or JSON field is missing |
| `vorgabeAus` | proposed but unchecked — used for values no pattern has a slot for |
| `feld` | builds the read function `JSON.parse(val).<field>` |
| `mehrfach` + `%N%` | one device per output; the numbers are read from what exists |
| `werteliste` | value list for the datapoint — slots like EFFECT are not detected without one |
| `absolut` | `lesen` is a full object id, not relative to the device — the same object for every device |
| `beschriftung` | the datapoint's display name, if it should differ from its slot name |
| `nachkommastellen` | decimals for the value display |

`verboten` is what genuinely separates a single socket from a multi-output one:
the single one has no `stat.POWER2`. An absent datapoint deliberately does **not**
count as evidence — otherwise a list of invented exclusions could inflate a
template's score.

Datapoint names are matched case-insensitively as a fallback, because MQTT keeps
whatever casing was published — the same device family sends `cmnd.POWER` on one
unit and `cmnd.power` on the next.

## Saving your own templates

The **Save as template …** button turns the device you are looking at back into
a template. Paths become relative to the device, `JSON.parse(val).ENERGY.Power`
becomes `feld: "ENERGY.Power"` again, and roles, units and formulas are kept.

What a template cannot know by itself is **which datapoints make a device this
kind of device**. That is a statement about all future devices, so the dialog
asks:

- **required datapoints** — proposed (anything with a write path is required by
  default), decided by you with a tick per row. Every extra required point makes
  the template more precise and more brittle at the same time.
- **content checks** — proposed wherever a JSON field is read. This is what
  separates "socket" from "socket with metering", so it is offered but not
  ticked.
- **name hint** — never derived. It only breaks ties between templates that fit
  equally well; MQTT cannot tell a lamp from a PC.
- **several outputs** — a tick plus the number that identifies this output.
  `stat.POWER1` then becomes `stat.POWER%N%`, replaced only at the end of a path
  segment so `ENERGY.Power` stays intact. If the draft still refers to the other
  outputs, the dialog says so: such a template would only ever fit this one
  device.
- **must not exist** — datapoints whose presence rules the template out.

Then the try-out shows what the detection actually catches, before anything is
saved.

### Managing them

The third view next to **Sources** and **Aliases** is **Templates**: every
template with its detection, its datapoints, a permanent try-out and the raw
JSON. Everything about a template of yours can be changed there: name, rank,
name hint, the required and forbidden datapoints, and every datapoint itself —
click a row to open its role, type, unit, paths, formulas and flags. Datapoints
can be added and removed. The try-out below reacts to every change, so you see
what an edit does to the detection before you save.

Shipped templates cannot be edited — that way they always stay the state they
were delivered in. *Make an editable copy* gives you a copy under the same id
that shadows the original; delete that copy and the shipped one reappears.
*Duplicate* on a template of your own gives it a new id, for a variant that
stands next to the original rather than replacing it.

Import accepts one template per file, in exactly the format under
`admin/vorlagen/`. Nothing is stored on import: the file appears as a preview
first, with a line saying what saving would do — create, replace your own
version, or shadow a shipped one.

Your templates live in `native.vorlagen` of the instance object, so they survive
`iobroker upload` and adapter updates and are part of a Backitup backup. A
template of yours with the same `id` as a shipped one shadows it. Storage and
exchange format are the same JSON, so a template that turned out well can move
into the package unchanged.

### How a template is picked

When several templates fit, the winner is decided in this order:

1. **how many datapoints the template actually verified** — required points, per
   output for multi-output devices, plus content checks that came out true
2. **the name hint**, if it matches
3. **your own template** over a shipped one
4. **`rang`**, so the same device is always detected the same way

Order matters. Counting evidence first is what keeps a template you built on
purpose from losing to a shipped one whose word happens to appear in the device
name.

Note what step 3 means for updates: a template of yours **cannot be outranked by
a shipped one on `rang`** — that step sits above `rang` in the order, so no
future version of this adapter can quietly take a device away from a template
you built. `rang` only ever breaks ties between templates of the same origin,
which is also why a new template of yours is numbered from your own templates
and ignores the shipped numbers entirely.

A shipped template can still win on step 1 by verifying strictly more
datapoints. That is deliberate — more evidence should win — and it only affects
devices you have not built yet: a finished alias records the template it came
from and keeps it.

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

### 0.0.19

- Opening a source whose alias already exists now targets that alias, wherever
  it lives, and ticks the datapoints it already contains. Before, the workbench
  proposed a fresh location and unticked boxes — one click could have created a
  duplicate or dropped points
- An existing alias is found through the sources of its datapoints, not only
  through the marker the workbench writes, so hand-built aliases count too

### 0.0.18

- The changes card reports both directions, and finds role, unit, formula and
  source changes on a draft built from the source as well

### 0.0.17

- The changes card only reports real deviations, in both directions: a point
  deselected against the baseline, and one ticked on against it. Points the
  template proposes unticked are no longer listed as if someone had
  deselected them
- Role, unit, formula and source changes are now also found on a draft built
  from the source, not only on one built from an existing alias

### 0.0.16

- Removed the note about missing MQTT objects — it contradicted the
  identification right above it and helped nobody

### 0.0.15

- The MQTT section sits under the identification and is collapsed by default;
  the warning stays visible in its header

### 0.0.14

- Every command in the MQTT card carries its own state and its own action —
  create the point, or allow it to send
- After such a change detection runs again, because it depends on which points
  exist

### 0.0.13

- New check: feedback that only arrives with the next telemetry. A point that
  writes to `cmnd` but reads from `tele` shows the old value for minutes —
  unless `SetOption59` is on, which the adapter asks the device about and can
  switch on

### 0.0.12

- New template: Tasmota colour light, on the `rgbSingle` pattern
- Templates can carry a `werteliste` for their datapoints

### 0.0.11

- MQTT devices: reads the command set from what the device already publishes,
  creates the missing `cmnd` points with publishing enabled, and can request
  `Status 11` when nothing is there to read
- The write-path check is no longer a placeholder: it reports a `cmnd` point
  that is not allowed to publish, which makes an alias look fine and switch
  nothing

### 0.0.10

- Tasmota templates also carry the diagnostic values from tele/STATE — uptime,
  free heap, WiFi quality, SSID, link count, downtime, IP — all proposed
  unticked

### 0.0.9

- Tasmota templates cover apparent power, reactive power and power factor,
  proposed but unticked

### 0.0.8

- Slots that require a value list (EFFECT) can be filled again; slots whose
  type is given as a list no longer produce an invalid `common.type`

### 0.0.7

- Editing a datapoint looks and works the same on a device and on a template

### 0.0.6

- Templates of your own are fully editable in the Templates view, datapoints
  included

### 0.0.5

- Saving and deleting touch one template at a time, so a failed load can no
  longer wipe the others
- Three separate columns per datapoint; all ticks aligned left

### 0.0.4

- `erkennung.verboten`: datapoints that must not exist
- Multi-output templates can be built from a device assembled by hand

### 0.0.3

- Templates view: list, edit, duplicate, delete, import and export
- Shipped templates are read-only; an editable copy shadows them
- `rang` for a new template of yours is numbered from your own templates only,
  so shipped ranks can never shift it

### 0.0.2

- Save your own templates, stored in the instance configuration
- Templates are picked by verified evidence first, name hint only as a tie-break
- A device remembers the template it was built from
- New template keys: `absolut`, `beschriftung`, `nachkommastellen`

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
Gerätefamilie ist eine neue Datei. Ein fertig gebautes Gerät lässt sich als
eigene Vorlage sichern; was sich ableiten lässt, wird abgeleitet, der Rest wird
gefragt — und ein Probelauf zeigt vorher, welche Geräte die neue Vorlage fängt.
Die dritte Sicht **Vorlagen** verwaltet sie: ansehen, ändern, duplizieren,
löschen, aus- und einlesen.
