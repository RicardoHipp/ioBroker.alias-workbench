<img src="admin/alias-workbench.png" width="80" align="right" alt="logo">

# ioBroker.alias-workbench

Creates aliases the comfortable way — devices that vis, Alexa and the device
adapter understand. Templates do the work: shipped ones for HomeMatic and
Tasmota, your own for everything else.

*(Eine Kurzfassung auf Deutsch steht in [README_de.md](README_de.md).)*

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
[Template format](#template-format). Sixteen ship with the adapter: four for
Tasmota, one plain measuring point, and eleven for Homematic — see
[What the shipped templates cover](#what-the-shipped-templates-cover).

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

**Move, rename, swap the source.** An id cannot be changed in the object store,
so moving is always: create new, move the enum memberships, delete old — in that
order, so a failure leaves you with two aliases rather than none. Swapping the
source keeps the alias untouched and only re-points it, which is what you want
when a device dies. See [Swapping a source](#swapping-a-source).

**Filling free slots.** A device that matches no pattern is often not an unknown
device — a role is simply missing. **Suggest free slots** sets roles in the
draft and lets the detector decide again. It only ever runs on that button, never
during normal detection, every guessed row is marked, and while any guess is
undecided the write buttons stay locked. Not deciding is no longer a silent yes.

**Nothing is written without a dry run.** The dry run lists every object that
would be created, changed or removed, as full JSON. For anything that changes it
puts **before and after side by side**, line against line, so you can see *what*
changes instead of only *that* it changes. Field order and trailing commas are
normalised first — otherwise half the lines light up for no reason. Only from
there can you write. If a source does not exist, writing is blocked: the js-controller
remembers a missing source permanently, and only deleting and recreating the
object fixes it.

## Status

Early. Usable, but not finished.

- Works as an admin tab; the adapter itself runs no process (`mode: none`).
  The instance exists only to carry the settings.
- German and English, 550 keys each
- Not published on npm yet — install from GitHub
- 16 bundled templates: eleven Homematic, four Tasmota, one plain measuring point
- **Missing:** "who uses this alias" — vis views, Alexa and Google names cannot
  be searched from here, so a rename warns you instead of pretending to be
  complete. Exporting a template to a file and reading it back works but is
  the least tested path.

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

### How the tab itself is built

The tab is **29 ES modules** under `admin/js/`, loaded by the browser as
modules. There is no build step for them: what stands in the file is what runs.
Styling lives in one file, `admin/css/werkbank.css`.

That has a price. A module boundary can be crossed wrongly in ways the browser
only notices while running, so three checks run before any clicking — they need
no browser and take two minutes:

```bash
#1. does it still bundle? finds missing or misspelled exports
npx esbuild --bundle admin/js/start.js --outfile=/dev/null --format=esm

#2. free names — identifiers that are neither declared nor imported
npm install --no-save acorn@8
node ../werkzeug/freie-namen.js admin/js node_modules/acorn/dist/acorn.js

#3. translations: both files carry the same keys, every tr() has one
```

The second one earns its keep. `socket` was used in `detail.js` without being
imported — valid JavaScript, and it would only have thrown when someone picked
a source whose value was not loaded yet.

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
| `vorgabeAus` | proposed but unchecked — see **What a template ticks by default** below |
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

## What a template ticks by default

Whether a datapoint has a slot in the type-detector pattern is **not** the
criterion. That only decides *where* the point ends up — inside the device or
in a separate info device. It says nothing about whether anyone needs it. The
`thermostat` pattern has 24 slots, `socket` has 14; everything that could ever
sit in such a device is listed there, down to frequency and apparent power.

The criterion is purpose: **tick what you need to operate the device and to
notice when something is wrong.** Setpoint, actual value, and the signals that
announce a failure — `LOWBAT`, `UNREACH`.

Left unticked: diagnostics. Signal strength, uptime, ramp times, inhibit
flags. You tick those when you are chasing a problem.

Battery **voltage** looks like it belongs in the first group — it falls
visibly over weeks while `LOW_BAT` only flips once the change is already due.
It stays unticked anyway, because the detector has nowhere to put it. Patterns
are assembled from two shared groups:

```
maintenance  WORKING UNREACH LOWBAT MAINTAIN ERROR DIRECTION
             CONNECTED RSSI ON_TIME BATTERY   value.battery   unit %
metering     ELECTRIC_POWER CURRENT VOLTAGE CONSUMPTION
             FREQUENCY SPEED POWER            value.voltage   unit V
```

`VOLTAGE` sits between current and consumption: it is the **mains voltage of a
metering device**, not a sensor's cell voltage. A window contact has no
metering group at all, which is why it has no voltage slot — and `BATTERY`,
the slot it does have, means a percentage. Writing volts into either is
wrong, so the point is offered and left off.

Two things override that:

- A point that reads the **same source** as an already-ticked one is never
  ticked. Otherwise the same value sits in the alias twice and the seventh
  check reports it, rightly. Homematic switch actuators have no separate
  feedback value — `1.STATE` is both — so their `ON_ACTUAL` stays off.
- Where the purpose says tick but the pattern has **no slot**, weigh it: the
  point lands in an info device next to the real one. For a single value that
  is rarely worth it, and the template's `hinweis` has to say so. And check
  what a slot **means** before using it — a matching name is not a matching
  purpose, as the voltage case above shows.

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

## What the shipped templates cover

Sixteen templates come with the adapter. Four Tasmota, one plain measuring
point — and eleven for Homematic, where the interesting part is not that a
template matches but that the **right** one does. The devices look alike in the
data; what separates them is one datapoint each:

| Told apart by | Which is which |
|---|---|
| `1.WORKING` | switch actuator, not a window contact — both have `1.STATE` |
| `2.STATE` | multi-channel actuator; the single-channel template refuses when it is present |
| `1.LEVEL_REAL` vs `1.STOP` | dimmer vs shutter — both have `1.LEVEL` |
| `1.ERROR` | classic window contact vs HmIP, which computes a boolean from a number |
| `0.SABOTAGE` | required for the HmIP contact. Without it, `1.STATE` + `0.LOW_BAT` matched twelve devices, eight of them actuators |
| `1.LEVEL` / `1.HUMIDITY` / `4.SECTION` | radiator valve vs wall thermostat vs heating group |
| `1.TEMPERATURE` vs `1.ACTUAL_TEMPERATURE` | a plain sensor vs something that also sets a value |

The CCU's own receivers — `HM-RCV-50`, `HmIP-RCV-50`, `RPI-RF-MOD` — match
nothing on purpose. Fifty bare `LEVEL` channels are not a device.

When a template is rejected, the picker says why: *"1.LEVEL missing"*, not
*"does not fit"*. A reason you cannot act on is not a reason.

### Role knowledge beside the rows

A template can carry `weiterePunkte`: roles for datapoints that get no row of
their own. Without it, "all datapoints of the device" showed *no role* on most
lines, because hm-rpc simply leaves the field empty. A `*.NAME` wildcard applies
per channel, so `2.LEVEL` and `3.RAMP_TIME` are covered without listing every
channel. It changes nothing about which template wins — only raw rows are
enriched.

## What an existing alias contributes

Pick a source that already has an alias, and the alias wins. Role, type, unit,
value list, caption, formulas, both sources and the ticks come from what is
stored — in **both** views, "create alias" and "edit alias".

Before that, the same row carried a different role depending on which tab you
were in, and refreshing did something different in each. Now refreshing changes
nothing by itself.

Where the template wants something else, the row says so — *"Template:
sensor.window"* — and a button above the list offers to apply it. That is a
click, never a side effect. The caption is exempt: the display name belongs to
whoever typed it.

## Swapping a source

A device breaks and gets replaced. The alias should stay exactly as it is —
same id, same recording, same room and function — and only point somewhere
else. **Swap source…** does that, and it changes only `common.alias.id` per
datapoint plus `native.quelle` on the channel.

Each datapoint is matched in three steps, and the dialog says which one was
used:

1. **same relative path** below the new device — `…ABC.1.STATE` → `…XYZ.1.STATE`
2. **through the template row** — finds `LOWBAT` on a device that spells it
   `LOWBAT` where the old one said `LOW_BAT`
3. **guessed** from name or role — deliberately weak, and marked **guessed** so
   you check it

Rows with no match at all turn red and offer a checkbox: *remove this point
when swapping*. Leave it unticked and the point stays, still pointing at the
old source — allowed, but visible.

Two things the dialog is careful about. It names the old source even when the
device is **gone** — that is the normal case for "device broken". And it warns
where the new source measures differently: *"Watch out: ACTUAL: value range
0..100 → 0..255"*. The alias keeps its formulas; if the new device counts
differently, the numbers are wrong afterwards and nothing else would tell you.

## Room and function

Both live in `enum.rooms.*` / `enum.functions.*`, not on the object — so this
is the one place where the workbench writes outside `alias.`. Nothing else
outside that namespace is ever touched.

The proposal comes from, in order: the room already on the source or one of its
channels, the device name (`FK_Max_Spielzimmer` → `Max_Spielzimmer`), the
target folder. The function comes from the template's `funktion` field, or from
the detected type when the template has none.

The admin ships 62 function and 58 room templates, each with a picture. The
workbench does not copy them; it reads them out of the admin's own bundle at
runtime, so there are never two lists ageing apart. If that fails, the field
quietly shows only what exists — and says so in the last row, rather than
looking empty for no reason.

**The picture is shown before it is written.** Next to each of the two fields
stands the picture of the chosen enum: solid when one is already stored, faded
with a small **new** corner when the workbench would add one on writing, and
nothing at all when the catalogue does not know the name or the switch is off.
So the settings page is visible in the row itself, instead of having to be
guessed from a dry run.

## Settings

The instance has no process; its settings only decide how the workbench writes.
Four switches, all on by default — and if `native` is missing entirely, the same
defaults apply rather than everything counting as off:

| Switch | What it does |
|---|---|
| `ikonRaeume` | add a missing picture to a **room** |
| `ikonFunktionen` | the same for a **function** |
| `ikonErsetzen` | also replace an entry that is not a picture. ioBroker's default rooms carry `icon: "Bedroom"` — a bare word that renders as a broken box |
| `vorlagenVomAdmin` | offer the admin's room and function templates at all |

The tab reads them **once on load**. After saving, reload the tab.

## Installation

Open the ioBroker admin, go to **Adapters**, look for **Alias Workbench** and
create an instance. Then reload the admin and pick **Alias Workbench** in the
left menu.

The adapter has not been accepted into the ioBroker repository yet, so it does
not show up there for the moment. Until it does, [README_de.md](README_de.md)
describes the interim route.

## Development

```bash
npm install
npm run build      # bundles @iobroker/type-detector into admin/detector.js
```

`npm run build` touches **only** the detector bundle. The tab's own modules are
served as they are; editing one and reloading the tab is the whole cycle. On a
running installation the admin caches adapter files, so `iobroker upload
alias-workbench` after copying is what makes the browser see the change.

Translations live in `admin/i18n/`. A new language is a new file there and an
entry in `SPRACHEN` in `admin/js/sprache.js` — nothing else. Watch for strings
written straight into `admin/tab.html`: they are replaced at runtime, and one
that nobody wired up stays German forever without anyone noticing.

## Background

- [@iobroker/type-detector](https://github.com/ioBroker/ioBroker.type-detector) —
  decides what counts as a device, by roles rather than names
- [Tasmota](https://tasmota.github.io/docs/) — the device family the shipped
  templates cover
- [ioBroker aliases](https://github.com/ioBroker/ioBroker.docs) — aliases are a
  core feature of the js-controller, not of any adapter

## Changelog

### 0.8.0
* Settings page in eleven languages
* ESLint and a CI workshop; checks run before every commit
* The buttons at the bottom follow the mode
* New description

## License

MIT License

Copyright (c) 2026 Ricardo Hipp <ricardo.hipp@googlemail.com>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
