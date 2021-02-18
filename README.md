# tab-manager
## Tile badges and icons
Tab tiles show badges describing the state of the tile. The visible badges include: "active", "discarded",
"loading", "pinned", plus the "SC1", "SC2", "SC3", "SC4" and "SC5" shortcuts.

If a tab is muted and is not currently attempting to play any sound, the mute icon will be in gray,
while it will be in black if the tab is muted but it's intending to currently play sound ("audible").
If the tab is not muted, the audible icon will be displayed instead.

## Search
Start typing to enter search mode. The search string is case insensitive. It will be matched against
title, URL and search badges.
Search badges are a combination of the badges you see on the tile, plus hidden badges added for search
convenience. The hidden badges include "audible", "muted", "highlighted", "incognito", "unloaded", "loaded".

Example: a tab is playing sounds and you want to mute it; type "audible" to get a list of tabs that
are currently playing sounds, and mute it by clicking the "mute" menu option in the search results tile.

Search results are sorted alphabetically by title.

Once you've typed enough characters to easily find what you were looking for, you can click on the
tab tile to open it. Alternatively, you can press Enter to open the first tab in the list of results.

A couple of search modifiers are available to change the search behavior. They must be specified at
the very beginning of the search string:
* "!" (exclamation mark) inverts the search to match all tabs without the search string
* "^" (caret) searches for tabs that match the search string at the beginning of title, URL or
  search badges
* "!^" combines the two

For example, if you search for "loaded", you'll match both the "loaded" search badge, as well as the
"unloaded" search badge (since "loaded" is contained in "unloaded"). This will likely leave you with
all the tabs you have (unless some are "loading"). If you only want to find the "loaded" tabs, type
"^loaded", and the "unloaded" tabs won't be selected.

## Geek notes
Call "tmStats()" on the dev tools console of the popup to see some popup performance statistics.