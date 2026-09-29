# Older changelog entries

Entries that have scrolled out of [README.md](README.md), newest first.
The README keeps the seven versions that the ioBroker admin shows as well.

### 0.9.0
* The role list is complete again: the detector hands out the expressions of its slots as text WITH slashes (`/^indicator…$/`), not as a regular expression. Take the slashes for part of the expression and you find neither start nor end afterwards — 210 roles instead of 232, and `indicator.lowbat` of all things was missing, the role every Homematic device writes. In the role picker, no slot of the pattern was offered at all any more, only the line "show all roles"
* From the same cause, BRIGHTNESS lost its role in six colour-light patterns — the slot could be added over and over and could not be filled by any route. Seven places in the code read a slot expression; they all go through one function now, and a test checks the role list against what the detector actually delivers instead of against hand-written expressions
* The deviation card tells the truth again when a point is deselected: it claimed "would not have counted anyway" even for points that do have a slot in the pattern (same cause)
* A point the template lists under a different name now keeps its role and its caption at the source: the workbench has two functions for the same job, and the second one bailed out when a template had matched. At the alias it said `state` and "Lavalampe ACTUAL", at the source `sensor.light` and nothing at all — updating would have overwritten both. What the template wanted instead now shows as a mark on the row, as everywhere else, and can be taken over field by field
* On load, the workbench no longer fetches two files that do not exist: it searched the admin's directory for file names and put `assets/` in front, although whole paths are listed there — and two entries expressly do not live in that folder (`"path": ""`). That produced two 404s in the browser console. It now looks for paths instead of names and strips a leading `./`: the manifest writes `assets/…`, the `index.html` `./assets/…`, and without that step the same file would sit twice in a list that ends after 25 entries
* The readme now mentions two things it used to keep quiet about: that the workbench proposes the read formula itself from recognised JSON — guarded against missing fields, and readable in both directions — and that it maintains roles, the channel role, room and function along with their pictures
* Values now keep running in the alias view: the workbench subscribed to the alias points but displays the values of their sources, so the numbers were fetched once and then stood still. It now subscribes to the sources as well. The header shows how many subscriptions are running — a subscription covers a whole branch, and its tooltip lists them, so it is visible right away if one is ever left behind
* The caption of a row now lives in a tooltip on its id instead of standing next to it — with the marks a row can carry, it had become so crowded that role and value were pushed off to the right. A dotted underline shows where a tooltip waits
* An alias whose points read from more than one node now says so: a chip "n sources" next to "to the source", listing every node with its number of points; the jump button asks where to go instead of silently taking the majority; and the individual rows that read from elsewhere carry a mark naming their adapter. Before, the only way to notice was to open every row. The way back holds too: from a secondary source, "to the alias" is there again — it used to require being at the majority source. Spartas of one and the same device (a Tasmota `stat` and `tele`) do not count as a second source. The choice appears only under "to the source" — jumping to the alias has exactly one destination. Spartas next to each other are merged as well now, not just against the main source — a Tasmota read through `stat` and `tele` counted as two. And both the way back and the row marks now go by the source you are standing at: "to the alias" is there at every source of an alias, including the device above a sparte, and a row is marked when it does not come from here. At the alias itself every row carries its tag — there is no place you are standing, so no source is the normal one; a tie no longer decides anything. The tag names the source, not the adapter, and no entry in the list is highlighted
* Nodes without datapoints are no longer left out of the tree: a channel, device or folder that exists but is empty now stands there greyed out, without a count and not clickable, with a tooltip saying so. Left out, it looked like the node did not exist at all — while in truth the adapter had not created its datapoints. They do not count as hits when filtering

### 0.8.3
* The dry run now shows enumerations as a comparison as well: the "before" column stayed empty for them, because enumerations live in their own store and the dry run only looked in the object store. Everything appeared as new, so it was impossible to see that eleven of twelve members were already there
* …and the interface no longer announces a creation where it changes: on such an alias the chip said "will be newly created", the button offered "create alias", the dry run was titled "what would come into being", the room and function were guessed instead of read, orphaned points went unnoticed and move/swap/remove did nothing. All of them asked whether the channel is an object instead of whether the alias exists
* An alias whose channel exists only as an id, not as an object — the usual result of adding points by hand in the admin — is now compared against the stored state at all. Before, the whole comparison bailed out there, and updating would have replaced captions with the bare point names and dropped roles, formulas and write direction along with them
* The same rule was missing a third time, for aliases where several points read from one and the same source datapoint — a blind, where OPEN, CLOSE, SET and pct all go to `level`. Only the first of them kept its write source; the others lost it, and updating would have made the blind unreachable through its alias
* Updating an existing alias no longer overwrites its caption with the bare row name, and no longer turns a read-only alias into a writable one: the function that takes the stored alias over into the draft was missing both rules its twin already had. The false "differs from the stored alias" mark that came with it is gone too
* A line that comes from the stored alias and reads from a source outside the selected node now gets its value: the values were fetched before that line even existed, so it claimed "source delivers nothing" while the alias was working fine. Only showed on aliases assembled from several adapters, and only until the node was clicked a second time

### 0.8.2
* A source that already has an alias now says so when the target points elsewhere: "This source already has alias.0.… — that one stays where it is", with a button "move it instead …" that opens the move dialog prefilled. Nothing is forbidden — two aliases on one source remain possible, they are no longer silent
* The same line appears in the dry run, right above what cannot be written
* The offer to take the typed folder as the room now also appears on a device that already has an alias — the very case where the room is meant to come along
* Escape in the target bar's folder and name fields now discards what was typed and puts the old value back; before, the folder field only closed its list and both kept the typed text, which was then taken over on leaving the field
* Tooling: the identifier check script now resolves a relative acorn path against the working directory
* A line whose role the workbench adapted on a pattern or template switch now says so: "differs from the stored alias", with the stored value spelled out below the field and a button to take it back
* A line that takes its name from an existing alias no longer shows a false "no place in the … pattern" mark for one draw
* Switching to a template that finds no source at all now works instead of failing silently — the field no longer shows a template that is not in use
* Swap source: the name of the current source is shown next to its id
* Datapoints without a slot in the pattern get a tinted row; the explanation stands once above the list instead of in every row
* Switching the selection while changes are pending — in the tree, through "to the source →", or in the folder overview — now asks first instead of discarding them silently
* Where the template wants something else, the affected field is tinted in the opened row, the template value is spelled out below it, and a button takes over that one value
* The role list now also offers the other spellings a slot accepts (indicator.lowbat next to indicator.maintenance.lowbat), minus the deprecated ones
* New adapter icon: two offset cards — behind the raw datapoints, in front the finished alias, sorted and named


### 0.8.1
* Published through npm trusted publishing (OIDC); releases are signed with provenance

### 0.8.0
* Settings page in eleven languages
* ESLint and a CI workshop; checks run before every commit
* The buttons at the bottom follow the mode
* New description
