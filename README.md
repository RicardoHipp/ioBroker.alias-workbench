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

### 0.0.40

Same question asked twice, answered two different ways — and the second
answer was wrong.

A Tasmota power strip with four outputs becomes four aliases. That was never
in doubt. A Homematic two-channel actuator with `Licht_Bar` on channel 1 and
`Licht_Esstisch` on channel 2 became **one** alias in 0.0.39, and channel 1
simply fell off the list. Same situation, opposite outcome.

What is right: **as many aliases as there are things you operate
separately.** Not as many as there are devices, not as many as there are
channels.

And the awkward part — the data does not say which is which:

```
Licht_Bar_Esstisch   channel 1  STATE (switch, writable)  "Licht_Bar"
                     channel 2  STATE (switch, writable)  "Licht_Esstisch"
                                                          → 2 things

Wohnzimmer_Dimmer    channel 1  LEVEL (level.dimmer, writable)  "Wohnzimmer_Dimmer:1"
                     channel 2  LEVEL (level.dimmer, writable)  "Wohnzimmer_Dimmer:2"
                     channel 3  LEVEL (level.dimmer, writable)  "Wohnzimmer_Dimmer:3"
                                                          → 1 thing
```

Two lamps in one case, three virtual channels of one output in the other,
and technically indistinguishable. The only difference is a name somebody
typed.

So the workbench stops guessing where it cannot know, and offers both ways —
exactly as it already does for a Tasmota with several outputs:

```
[ als ein Gerät erzeugen … ]     [ je Kanal ein Gerät, 2 Stück … ]
```

The tooltip on the second names what would appear: `alias.0.Licht_Bar
(socket)`, `alias.0.Licht_Esstisch (socket)`. A line above the list says why
there are two buttons.

Taken along, because the result is useless without it: **the target proposal
uses the object's name**. It used to be the last part of the ID, so a
Homematic device landed at `alias.0.NEQ1660737` and one of its channels at
`alias.0.1`. Now it is `alias.0.Licht_Bar_Esstisch` and `alias.0.Licht_Bar`.

Still open, and visible in the dry run: the points of a per-channel alias are
named after the source (`STATE`) rather than the pattern slot (`SET`), and the
maintenance data of the shared channel 0 — LOWBAT, UNREACH, RSSI — is not
offered when a single channel is edited.

### 0.0.39

Homematic. A thermostat there is a `device` with its data spread over two
channels — maintenance in `:0`, the actual heating in `:1`. The workbench
sent you to a folder overview and let you edit one channel at a time, so
whichever you picked, half the device was missing.

Ran the real detector over all 39 devices on the test system. The device
level wins every single time:

```
HK_Bastelzimmer      device: thermostat 7/13     best channel: info 8/12
Heizung_Badezimmer   device: thermostat 9/13     best channel: info 7/11
Licht_Küche          device: socket     4/12     best channel: info 7/11
Terassenrollladen    device: blind      5/18     best channel: info 6/11
Wohnzimmer_Dimmer    device: dimmer     5/16     best channel: info 6/11
FK_Terassentür       device: window     4/6      best channel: info 6/10
```

An alias is not a copy of the hardware tree — it is one flat, logical
device. That is the whole point of it, and the detector agrees: it collects
across channel boundaries.

- **An object of type `device` is a device**, not a place to look below. It
  no longer lands in the folder overview, whatever the point count, and
  `geraeteDarunter` no longer counts its channels as devices of their own
- **Roles from the source are kept.** They used to be dropped in source
  mode — written for Tasmota, where `cmnd.POWER` is called "text" and the
  real role comes from the template. Adapters that curate their roles were
  punished for it: hm-rpc ships `level.temperature` for
  SET_POINT_TEMPERATURE and `value.temperature` for ACTUAL_TEMPERATURE, and
  the workbench threw both away and then reported "nothing recognised".
  Type and unit were always taken over; excluding the role could not be
  justified

`HK_Bastelzimmer` now opens as **thermostat**, and "only what belongs to the
device" narrows its 42 points to the 10 that have a slot — SET, ACTUAL,
MODE, BOOST, PARTY, VALVE from channel 1, LOWBAT, VOLTAGE, RSSI, UNREACH
from channel 0. One alias, both channels.

No change for Tasmota: those points carry no roles at all. Verified across
14 devices — same template, same checks as before.

Two things that only became visible once Homematic devices opened at all:

- **A raw draft now ticks only what has a slot in the recognised pattern.**
  Everything was ticked before; that passed unnoticed with a Tasmota and its
  eight points, but a window contact brings 26 and a thermostat 42, most of
  them alarm mirrors and maintenance innards that appear in no pattern.
  Writing those into an alias is not modelling a device, it is copying one.
  Three cases stay untouched: an existing alias (every tick there is a
  decision already made — unticking means deleting), a template (it decides
  for itself), and the case where nothing has a slot. The three buttons above
  the list remain; "all" is one click away
- **Three of the 51 patterns are keyed differently from the type they
  report** — `blinds`→`blind`, `mediaPlayer`→`media`, `levelSlider`→`slider`.
  Using the reported type as a key hit nothing: at the roller shutter `blind`
  dropped out of the pattern list, the field showed `socket`, and switching
  patterns no longer adapted the roles. The maths had been right all along,
  the display and the offer were not. Everything now speaks types, including
  "all 51 patterns", which used to hand out keys the detector cannot match

### 0.0.38

The tree showed the last part of the ID and nothing else. Where an adapter
uses serial numbers as identifiers, that leaves you staring at this:

```
0000DBE9A2B8AF                 is  FK_Badezimmer
000A1D89902F6C                 is  HK_Bastelzimmer
AFDCMSTESFOHWVAXIDNBDQQROIYQ   is  Ricardo (Self)
amzn1~HH1IL5GNFYTV23J          is  Michael Sauters Zuhause
```

Counted over 2532 containers on the production system: for **1575 of them
the name says more than the ID**, for 569 it is the same word, and 388 have
none. So the name is added only where it adds something — the other 957 rows
stay exactly as short as before.

- **Tree**: the name follows the ID in a muted tone, and it is the name that
  gets truncated when the column runs out, never the ID. Tooltip carries both
- **Header on the right**: the name moved to the top line, where what you
  clicked belongs; the full ID stays in the small line below and no longer
  appears twice
- **Folder overview**: without this, the channels of a Homematic device were
  listed as `0` and `1`
- **The filter searches names too.** Typing "Badezimmer" now finds
  `FK_Badezimmer`. Before it only looked at the ID — the one thing nobody
  knows by heart
- **Sorted by what is displayed**, not by the ID underneath. At hm-rpc that
  finally puts FK_* and HK_* together instead of ordering them by serial
  number. `numeric` collation as well, so POWER2 comes before POWER10

Shipped broken and fixed the same hour: moving the name out of the sub-line
left one use of the old variable behind, four hundred lines further down in
the same function. `Uncaught ReferenceError: nm is not defined` — and with it
the whole right-hand pane for every node that has a device pattern. It went
unnoticed because I checked a single channel that has none. The mass click-
through that would have caught it on the first node now sits in the test plan
as a rule: run it after every change to `zeichneErgebnis`, never a spot check.

### 0.0.37

A device is a node with data points under it — not a node carrying a
particular `type`. The tree decided by type, and that made eight devices in a
grown installation untouchable: their alias objects are `folder`, not
`channel`.

Who is right? The object schema says `"state" - parent should be of channel,
device, instance or host` — but *should*, and by the same sentence every
`channel` would need a `device` above it, which no alias channel anywhere
has. The alias documentation says nothing at all about the container; it only
knows that `alias.0` holds states. And the type-detector the workbench is
built on is explicit, in its own source:

```js
// a state needs to be in a channel, device, folder or such
case 'channel':
case 'device':
case 'folder':
```

`folder` sits in the same branch as the other two. The workbench was stricter
than its own foundation.

- A **folder with data points directly under it is selectable** and gets the
  device dot. Folders holding only channels or further folders stay out —
  those are signposts, not devices. On the production system that is 8 of 46
- **Updating no longer changes the container type.** New devices are created
  as `channel`, the common form and the one closest to the schema; anything
  that already exists keeps what it has. Turning someone's folder into a
  channel to paper over a shortcoming of ours is not a fix

### 0.0.36

The tree follows the admin's expert mode. Without it, `system.*` and `enum.*`
are gone — 28 of 157 rows on the test system, and not one of them is anything
you would build a device alias from.

The admin keeps the setting in two stages, and we read it the same way:

```js
const f = sessionStorage.getItem("App.expertMode");
expertMode = f ? f === "true" : !!systemConfig.common.expertMode;
```

The switch in the toolbar is per browser session; underneath sits the lasting
default in `system.config`. The tab runs in an iframe of the same origin, so
it reads the same storage — and it receives a `storage` event when the switch
is flipped, so it follows without a reload. Measured both.

What gets hidden is the admin's own rule, word for word:

```
system, enum, _design/, *.admin, common.expert === true
```

The last one is the useful one: an adapter can mark a point as expert-only.
On the test system exactly one does — `backitup.0.info.dropboxTokens`, an
access token, which has no business in a list of alias sources.

Two deliberate differences:

- The filter sits in **building** the tree, not in drawing it. Otherwise a
  folder would count states nobody can see
- The **source list in the detail pane stays unfiltered**. An alias that
  reads from `system.adapter.mqtt-client.0.alive` has to remain editable —
  hiding it there would make someone's own wiring vanish under their hands

If the selected node is one that disappears, the selection is cleared with it.

### 0.0.35

A full test run over every function, and eleven things came back. The plan is
now a document of its own — `testplan.md`, one numbered check per line, so the
next run starts where this one left off instead of from memory.

**Recognition**

- A multi-output template found no outputs at all unless the `cmnd` objects
  already existed. `Garten-Ventilinsel`, `Wohnzimmer.Couch` and `NSPanel`
  report POWER1..n in `tele/STATE` and have no `cmnd` point yet — exactly the
  case 0.0.29 built the "possible commands" recognition for. The set taken
  from object names was empty and went into the intersection anyway, so the
  intersection was always empty. An empty set means "nothing known here", not
  "no outputs here", and is now dropped

**Templates**

- The **try-out never hit anything**. Every template reported "0 devices
  matched", including the one that recognises twenty devices in the sources
  tab. `pruefeVorlage` also checks `erkennung.inhalt` and needs the *value* of
  a point for that — and values are only loaded for the selected channel.
  In the templates tab nothing is selected. The missing values are now
  fetched once and the sheet redrawn
- Deriving a template from a device wrote the formula into the field name:
  `feld: "POWER === 'ON'"`. The pattern that pulls the field out of
  `JSON.parse(val).X` took everything to the end of the line. It now accepts
  only a real field path; anything else stays a formula
- Deriving still lost the fallback sources (`lesenSonst`, open since 0.0.23).
  The draft now carries every reading route it was given, not just the one
  that happened to work today

**Losing things**

- Updating an alias from the alias tab wrote `native: {}` over **every**
  data point — template, origin slot and the `vonHand` mark, all gone. The
  channel kept its origin, the points lost theirs
- "Create the missing send points" in the dry-run dialog discarded the target
  you had typed. The dialog then listed objects for a different folder than
  the one in the field, and "create now" would have written them there
- Typing a folder name and then clicking "create" in a row: the first click
  did nothing. Leaving the field redrew the pane and replaced the button
  before the click reached it

**Smaller**

- Choosing a JSON field forced the type to `number`. Picking `POWER` ("ON")
  or `Wifi.SSId` left the point as a number, and a slot the pattern holds as
  boolean lost its default — `switch.light` plus `number` is no device any
  more. The type is now derived from the actual value, and only when none is
  set
- In the alias tab the source list offered no `cmnd` points at all, so a
  hand-added point could never get a write target. The root was cut at the
  branch (`…RGB.tele`) instead of the device
- With nothing selected, the footer kept the buttons and the object count of
  whatever was there before — after deleting an alias, and after coming back
  from the templates tab

Two more came out of the second run, once the try-out worked at all:

- It found only one multi-output device instead of four. The candidate search
  looked for the first required point (`cmnd.POWER%N%`) and nothing else, so
  a device that has no `cmnd` object yet never became a candidate. It now
  also searches over the points named in `erkennung.inhalt`
- Every template was scored as if it were your own — and an own template gets
  a 1000 point head start. Socket claimed 18 wins, lamp 23, on 26 devices;
  only one template can win a device. Counted properly it is 18 and 5, and
  the wins across all five templates now add up to exactly the 30 devices

### 0.0.34

Four places fold open, and none of them looked like it. Measured before:

```
tree            11 px wide, --ink-3, the palest colour in the interface
state rows      11 px, at the very end of the row
MQTT card       11 px, at the very end of the header
why block        9 px
```

24 px is the usual minimum for a mouse target. We were at 9 to 11.

The symbol was the smaller half of the problem. A header that does not look
like a button is not recognised as one, whatever sits at its edge.

- **Sections** — MQTT card and the why block — now carry a **plus/minus**, on
  the left where reading starts, and their header is a surface that darkens
  when hovered. A section is not a tree node: "there is more here" is a
  different statement from "it continues over there". The admin bundle uses
  both shapes, so either is at home in ioBroker
- **The tree** keeps its triangle — that is what everyone expects there, from
  Explorer to the object browser. 18 px instead of 11, one shade stronger
- **State rows** keep the arrow at the end, at 14 px instead of 11

The paths for plus and minus are taken from the admin's own bundle, like the
folder icons in 0.0.26.

### 0.0.33

Two answers to the same question sat in two places, and neither was in a
good one. Why a template was chosen hid in the tooltip of a small **i**,
where nobody looks. What it left out stood open below it and filled the
screen — six lines on Solar_Balkon.

- Both now share **one foldable block**. Folded it is a single line that
  still carries the number: "Weggelassen, weil die Quelle fehlt: 6". Unfolded
  it lists the skipped points and, below them, why the template matched
- The **i** is gone, along with its styling
- The fold state survives redrawing and switching devices, like the MQTT card

Measured on Solar_Balkon: 226 px down to 21 px.

Worth noting what was hidden in that tooltip all along:

```
cmnd.POWER vorhanden
tele.STATE enthält POWER
Name gibt keinen Hinweis — „Tasmota-Steckdose" ist die Vorgabe,
aus MQTT sind sie nicht unterscheidbar
```

That is the actual reasoning behind a detection, and until now you had to
hover a 15-pixel circle to read it.

### 0.0.32

Changing the target folder and then creating a missing send datapoint threw
the change away. Measured — three edits, then one datapoint created:

```
                  before                    after
target folder     alias.0.MeinOrdner.…      alias.0.Bastelzimmer.…   reset
RSSI unticked     [ ] RSSI                  [x] RSSI                 back on
point added by hand   [x] !                 gone
```

So every edit was lost, not just the folder.

The obvious repair — save the edits and put them back after the rebuild —
would have been the wrong one. It adds a second place that maintains the same
state, and every new property would have to be remembered there or vanish
silently. Three of today's faults are of exactly that kind.

The better question was why anything is rebuilt at all. That came from before
0.0.29, when detection depended on which datapoints existed. Since detection
reads what the device **can do**, creating a datapoint changes nothing about
it — the template already matched.

What does change is one detail: the orange "send datapoint not created yet".
And that was my mistake from 0.0.29 — I stored it in the draft instead of
looking it up when drawing. A stored mark goes stale the moment the datapoint
appears, and forces the rebuild that costs everything else.

- The mark is now looked up while drawing, not remembered
- A draft you have edited is no longer rebuilt by any background reload. One
  flag, set where you make an edit, checked in one place — instead of a list
  of fields that can be forgotten
- Switching devices still starts fresh, as it should

### 0.0.31

Clicking into the target folder field showed the suggestion list for a
heartbeat and then lost it, with no chance to click anything.

The cause was not the list. Every incoming value rebuilt the whole right-hand
side:

```js
socket.on('stateChange', function (id, state) {
  werte[id] = state;
  if (current) { zeichneErgebnis(); }     // on every single value
});
```

Solar_Balkon reports about once a second. So once a second the page was
rebuilt from scratch — taking the open list, the focus, and anything half
typed with it. Anything that takes longer than a second to do was impossible
on such a device.

- Values are now collected for 700 ms and drawn once
- Nothing is redrawn while the focus sits in a field of the right-hand side —
  it waits until you are done. The same guard covers the delayed draws in
  `waehle` and the subscription's catch-up
- Values keep flowing: measured six redraws in six seconds when nothing has
  focus

Still worth doing later: a value arriving should update the one cell it
belongs to, not rebuild the panel. Once a second for a whole panel is a lot
of work for a new reading.

### 0.0.30

The heading answered the wrong question. It showed the alias id — the answer
to "what will be created" — while the obvious question when looking at the
right-hand side is "where am I?". You clicked a device on the left, and the
name of something else appeared on the right.

```
before   alias.0.Bastelzimmer.Bastelzimmer_Decklenlicht_RGB
         WIRD AKTUALISIERT · aus mqtt-client.0.… · kein Objekt · 11 Zustände

after    Bastelzimmer_Decklenlicht_RGB
         mqtt-client.0.SmartHome.Bastelzimmer.Bastelzimmer_Decklenlicht_RGB
         kein Objekt · 11 Zustände
```

- The heading now carries the **selected node**: its name, the full path
  below it in small type, then type and state count
- Where the alias goes, and whether it already exists, is said **once** — in
  the target row, next to the id it concerns, where it can also be changed.
  It now covers both cases, "already exists" and "will be created"; before,
  "will be updated" sat in the heading and "already exists" ten centimetres
  further down, two wordings for the same fact
- The device card below no longer repeats the path either
- With the source in the heading, `· kein Objekt ·` finally has a clear
  referent. It always described the source; above the target id it read as if
  the target were missing

### 0.0.29

The workbench reads from `tele.STATE` which commands a Tasmota knows — that is
where "11 send datapoints missing" comes from. Template detection did not use
that knowledge: it asked whether the **object** `cmnd.POWER` exists, not
whether the **device** can do POWER. So on a fresh device you had to create
datapoints first for detection to work, although the workbench already knew
what stood in front of it.

- A required `cmnd.X` now counts as met if the datapoint exists **or** the
  device demonstrably knows the command. Only for `cmnd` — `stat` and `tele`
  appear by themselves once the device sends, so "missing" means something
  there
- Where a send datapoint is still absent, the row says so and offers to create
  it, right where the problem shows
- Writing stays blocked until it exists. The dry run lists what is missing and
  offers one button that creates all of them and recalculates
- The check "publish on the cmnd datapoint" gained a third case: not there at
  all, there but mute, or sending

Detection changed for 16 of 32 devices on the test system, all of them
correctly: the RGB ceiling light becomes a colour lamp, Esstischlicht and
Stehlampe too (they report `Color`), and twelve metering points turn into
sockets — they really are switchable sockets that measure.

Two faults found while building this:

- The dry run could offer to write **outside `alias.`**. Opened from a
  callback, the draft had no target yet and `zuSchreiben` fell back to the
  source — so it listed objects under `mqtt-client`. A hard check now refuses
  any id that does not start with `alias.`
- `waehle(id, fertig)` never called back. Its local marker from 0.0.27 was
  also called `fertig` and shadowed the parameter

### 0.0.28

Creating a datapoint updated the right-hand side but left the tree on the old
count. Caused by the previous release: the subscription enters the object into
`objects` and leaves tidying up to its timer. The targeted reload then saw no
change any more, did not rebuild `keysSorted`, and cancelled that very timer.
The tree reads from `keysSorted`, so it could not know the point existed —
no matter how often it was drawn.

- Rebuilding the index is now its own step, and it runs whenever the number of
  keys no longer matches — regardless of who changed `objects`

Measured: `cmnd 1 → cmnd 2`, device `● 8 → ● 9`, in one redraw.

### 0.0.27

Four datapoints had been written to **`undefined.cmnd.POWER1…4`** — real
objects in the database, with the correct topic and role, just filed in a
place that does not exist.

Two stretches of code set the state of the MQTT card. The dialog set the
channel, redrawing the card did not:

```js
function zeigeMqttDialog(kanal) { mqttStand = l; mqttStand.kanal = kanal; }
function mqttKarte(host, kanal) { mqttStand = l; }          // channel lost
```

With the dialog open, any redraw dropped the channel, and the next click
built the id from `undefined`. The gap had always been there, but before
0.0.20 there was hardly ever a redraw while a dialog stood open — the object
subscription introduced then woke it up. A fix for one fault had armed
another.

- `mqttKarte` sets the channel too
- After its own writes the workbench now reloads **only what changed** — one
  object, or one device branch. `ladeObjekte()` re-read the entire database
  for a single datapoint: 332 objects here, some 24 500 on a grown
  installation
- The subscription compares `type`, `common` and `native` before redrawing.
  `ts` and `from` change on every write even when nothing else does
- Whoever reloads on their own cancels the subscription's pending redraw
- `waehle()` no longer paints the raw draft immediately. It waits 150 ms and
  only shows it if loading really takes that long

Measured on one click of "create", before and after:

```
before   tree 2×, right-hand side 4×    (52 ms, 114 ms, 614 ms, 644 ms)
after    tree 1×, right-hand side 1×    (12 ms, 78 ms)
```

Selecting a device went from two redraws to one.

### 0.0.26

- The two fold buttons now carry the **same folder icons the admin object
  browser uses** — the outlined folder for "expand all", the filled one for
  "collapse all". The paths are taken verbatim from the admin's own bundle, so
  the shapes match rather than merely resemble. Inline SVG, no icon font, no
  external request

### 0.0.25

The tree opened the first two levels every time and forgot anything you
folded yourself as soon as the tab was reloaded.

- What you fold open or closed is **remembered**, and it survives a reload
- Two buttons next to the filter: **all open** and **all closed**
- Stored in the browser's `localStorage`, not in the instance object — the
  fold state is a matter of view, and this way no click on a triangle writes
  to the database

Folding everything open or closed clears the individually remembered nodes.
Otherwise a branch you had deliberately closed would stay closed, and "all
open" would be a lie. Once you use either button, the old default of two
levels does not come back on its own — from then on the tree does what you
last told it.

### 0.0.24

Measured on the Lavalampe, before and after a firmware update — same device,
same wiring:

```
12.5.0   tele.STATE without IPAddress
15.5.0   tele.STATE with IPAddress, in every telemetry
```

Uptime 490 s, telemetry 6 s old: that is not the boot message. So the newer
firmware carries the address permanently, and the earlier explanation in
0.0.22 — "only in the first message after a boot" — was wrong. It is the
firmware, not the moment.

- IP now reads **`tele.STATE` first**, then `tele.INFO2`, then `stat.STATUS5`.
  STATE arrives every few minutes and follows a DHCP change; INFO2 is a still
  from the last boot and would keep showing the old address until the device
  restarts

### 0.0.23

`lesenSonst` survived copying and editing a template, but there was no field
for it — you could only change it by exporting the template, editing the file
and importing it again.

- The state detail in the template view now has an **Fallback sources** block:
  datapoint, JSON field and formula per entry, one line each, with add and
  remove
- A line that is still empty stays while you edit — otherwise it would vanish
  in the same breath and could never be filled in. It is dropped when the
  template is saved or exported, so nothing half-finished ends up in the file
- All three shapes are read: a plain datapoint name, one object, or a list

Not fixed yet, and worth knowing: deriving a template **from a device** still
loses the fallback sources. The template is rebuilt from the draft, and the
draft only remembers the source that happened to win on that one device.

### 0.0.22

All five templates carried an IP datapoint — it just never appeared. Measured
on the test system: **4 of 31 devices** had `IPAddress` in `tele.STATE`. For
the rest the point was dropped, and nothing said so.

Tasmota puts `IPAddress` into `tele/STATE` only in the first message after a
boot, never again. It lives permanently in `tele/INFO2`, which the device
publishes retained on start, and it can be asked for with `Status 5`.

- IP now reads from **`tele.INFO2` · `Info2.IPAddress`**, falls back to
  `tele.STATE` · `IPAddress`, and finally to `stat.STATUS5` ·
  `StatusNET.IPAddress`. `lesenSonst` accepts a list, not just one entry
- A fallback source is now taken when the **field** is missing too, not only
  when the whole object is. `tele.INFO2` without the IP inside used to drop
  the point although `tele.STATE` had it
- "Ask the device for its commands" sends `Status 5` alongside `Status 11`, so
  the IP arrives with it
- **What a template leaves out is now visible**, under the identification
  line, with the reason: "IP: neither in tele.INFO2 · Info2.IPAddress nor in
  tele.STATE · IPAddress". Before it sat in the tooltip of a small i, where
  nobody finds it — the template had the point, and there was no way to learn
  why it never showed

Measured after the change: Lavalampe 192.168.179.60 (from INFO2), Karbonator
192.168.179.225 (from STATE), power strip 192.168.179.71 (from STATUS5).

### 0.0.21

The multi-output template did not fit the printer power strip — and the reason
turned out to sit in all four Tasmota templates.

They required `stat.POWER`. That datapoint appears only after the device has
been switched once: Tasmota never publishes to `cmnd`, and `stat/POWER` is
sent on a change. On a freshly bound device neither exists, so the template
could never match — even though the switch state sits in `tele/STATE` the
whole time, as `POWER` or as `POWER1`, `POWER2` …

- `stat.POWER` is no longer required in any of the four. Templates now name a
  **fallback source**: `stat.POWER` if it exists, `tele.STATE` otherwise. The
  channel keeps the faster path where it is available
- The outputs of a multi-output device are found in the **JSON keys of
  `tele.STATE`**, not only in existing objects. The power strip reports
  POWER1…POWER4 there long before any `stat.POWER1` exists
- `cmnd.POWER` stays required, deliberately. It is the evidence that there is
  something to switch here at all — without it every measuring point that
  reports a relay would pass as a socket. Measured: Solar_Balkon has no
  `cmnd.POWER` and stays a measurement point, Solar_Garten has one and is
  correctly a socket
- Placeholders are now substituted in formulas too. A multi-output template
  with a formula would have looked for a field literally called `POWER%N%`
- `inhalt` in the detection block also gets the placeholder, so
  `{"tele.STATE": "POWER%N%"}` works
- **Energy per output is off by default.** Most power strips meter as a whole;
  ticked, each of four outputs would carry the same total, and the sum would
  appear four times over. The hint says so, and a strip that really meters per
  output can still have them

Also fixed while testing this: **"Remove alias" removed only one output** of a
multi-output device and left the rest orphaned. The dialog now offers to take
all outputs of the device — off by default, listing what else would go.

### 0.0.20

A systematic test of the whole adapter on the test system turned up 26
findings. All are fixed.

The heavy ones, all of the same family — the draft did not know the alias
that already existed:

- A datapoint you add by hand was written correctly but had vanished from the
  list the next time you opened the device. `uebernehmeBestand` could only
  tick what the draft already knew; anything that lived only in the alias was
  invisible. Now those points join the draft, with their own role, formula and
  source
- The change card was blind to exactly those points. Switching the template on
  a finished alias reported "1 open" while the dry run listed seven affected
  datapoints
- Updating from the alias view overwrote `native.quelle` with the alias itself
  and dropped `vorlage`, `vorlageVersion` and `geraetetyp` — the whole origin,
  without warning. A hand-given channel name was overwritten too
- `common.states` was lost when reading a finished alias, so every slot with
  `statesDefined` counted as empty. The workbench claimed a gap in an alias
  its own detector reads as complete
- Slots without a `defaultRole` — BRIGHTNESS in the rgbSingle pattern — got no
  role at all, never filled their slot, and could be added over and over. The
  role is now derived from the pattern's expression

Things the workbench could not do:

- **Remove an alias.** There was no button, and the obvious detour failed:
  untick everything and the dry run refuses to write. Now there is a dialog
  that lists what disappears, and empty parent folders go with it
- **Notice objects created elsewhere.** The usual path — create `cmnd.POWER`,
  switch once, and mqtt-client creates `stat.POWER` — left the display stuck
  on "stat.POWER missing" until you reloaded the tab. Object changes are now
  subscribed
- **Show the folder overview.** `zeichneOrdner` existed but was never called.
  Wiring it up exposed a second bug: `cmnd`, `stat` and `tele` were counted as
  devices of their own, turning one NSPanel into three

Wording and display:

- "übrig geblieben" in the dry run meant "will be deleted" — and the same red
  number also covered points that stay. Now counted separately, and the
  numbers follow the checkboxes
- The badge "will be created / will be updated" was missing wherever no
  template matched, and "no object" sat under the target id while describing
  the source
- German leftovers in the English interface, in the error messages of all
  places: "SET fehlt", "kein Objekt", "passt nicht"
- The detected pattern dropped out of the pattern list after one switch, so
  there was no way back except through "all 51 patterns"
- The SetOption59 answer lives in `stat.RESULT`, where the next command
  overwrites it — the finding fell back to "unknown" after a single switch.
  It is now remembered with its age
- Saving an own template did not raise its version, which would have left
  every device looking up to date forever
- A template could contradict itself, listing the same point as required and
  as forbidden; that is now refused with an explanation
- "Ask the device for its commands" gave no feedback at all
- The command list re-sorted itself by state, so the row you just worked on
  jumped away under the cursor
- The dialog badge counted the missing points while the button created only
  the preselected ones — "10 missing" above "Create (4)"
- The boolean formula hint appeared under every field, including voltages
- In template view the device buttons stayed visible, and the search filter
  survived the switch, leaving the tree at "nothing found"
- 18 unused i18n keys removed

New: a seventh check, **no duplicate point** — it catches two datapoints that
read and write exactly the same thing, which is what a template switch leaves
behind when the old one called the switch ON and the new one calls it SET.

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
