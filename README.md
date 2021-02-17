# tab-manager
## Search
Start typing to enter search mode. The search string is case insensitive. It will be matched against
title, URL and search badges.
Search badges are a combination of the badges you see on the tile, plus hidden badges added for search
convenience. The visible badges include "active", "audible", "discarded", "muted", "loading", "pinned",
plus the "SC1", "SC2", "SC3", "SC4" and "SC5" shortcuts.
The hidden badges include "highlighted", "incognito", "unloaded", "loaded".

The results are sorted alphabetically by title.

Once you've typed enough characters to easily find what you were looking for, you can click on the
tab to open it. Alternatively, you can press Enter to open the first tab in the list of results.

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
