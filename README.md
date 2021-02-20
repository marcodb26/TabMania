# TabMania

TabMania organizes all your browser tabs across all your windows. TabMania makes windows disappear,
so you can focus on just your tabs, wherever they might be on your system. Find a lost tab; group
tabs in ways that are meaningful to you, not by window; use keyboard shortcuts to navigate back to
a previous tab from anywhere in the system; attach specific tabs to keyboard shortcuts so they're
always one keypress away from view, regardless of how many tabs in how many windows you might have
open.

## Home view
The home view is where most of the action is. The home view is where all your browser tabs are listed
alphabetically by title. Browser tabs loaded with URLs from the same location (hostname) will be
automatically grouped together. You can change this default grouping behavior by configuring _custom groups_
(see _Custom groups_ below for more details).

Pinned tabs and groups are listed first, before all other unpinned tabs (see __Pinned tabs and groups__
below for more details).

## Understanding browser tab tiles
TabMania lists Chrome tabs as tiles within the _Home_ (ehm...) tab of the extension. Each tile includes
a few visible bits of information about the state of a browser tab:
* The first line of the tile includes the title of the page associated with the browser tab,
  and its favicon, if the page has one.
* The second line of the tile includes the URL of the page associated to the browser tab, and
  some icons and badges providing some more info about the browser tab
* If the URL starts with `https://`, TabMania omits the obvious to leave a tad more room to see
  the URL. Note that only `https://` is omitted, any other protocol will be displayed (including `http://`).
* Browser tabs with an active audio source show an `audible` (search keyword) icon.
* Muted tabs show a `muted` (search keyword) icon. The icon is in black if the browser tab has an
  actively muted audio source, that is, if it would become `audible` if unmuted. Muted tabs without
  an active audio source show the `muted` icon in grey. You can mute a tab using the menu action _Mute_.
* The `active` (search keyword) badge indicates the browser tab is the tab currently visible in its window
* A `pinned` (search keyword) tab displays a thumbtack icon. You can pin a browser tab using the
  menu action _Pin_ (see __Pinned tabs and groups__ below for more details).
* If you grant TabMania access to your incognito tabs, `incognito` (search keyword) tabs will show
  alongside other tabs. Incognito tabs are easily identifiable for their reversed color scheme (dark
  background)
* The `SC1`, `SC2`, `SC3`, `SC4` and `SC5` (search keywords) badges indicate that a browser tab is
  associated to a custom keyboard shortcut. If the badge is in black, the keyboard shortcut targets
  that browser tab, while if the badge is in grey, the browser tab is a backup target for the keyboard
  shortcut (see __Keyboard shortcuts__ below for more details)
* If you hover your pointer over a browser tab tile, the menu dropdown button and the close button
  appear. You can use the close button to close the tab without bringing it to the foreground.
* If a tile displays in black&white and its title is italicized, then the browser tab is in state
  `unloaded` (search keyword). The tab exists, but Chrome has not fully loaded it yet. Note that
  you can also explicitly unload a browser tab by using the advanced menu action _Discard from memory_;
  you can search for all tabs you've discarded this way with the search keyword `discarded`.
* A browser tab displays the `loading` (search keyword) badge while it's loading a page, then the badge disappears,
  indicating the tab is fully `loaded` (search keyword)

## Custom groups
[ Work in progress - section missing ]

If you don't specify a favicon for a custom group, it will pick one from one of the matching tabs
listed inside.

## Search
Start typing to enter search mode. The search string is case insensitive. It will match against
title, URL and search keywords attached to browser tab tiles.
Search results are sorted alphabetically by title, and they auto-update as browser tabs change:
a tab that's in the search results might go away if its state changes in such a way that it doesn't
match the search anymore (e.g. if you load a new URL).

Once you've typed enough characters to easily find what you were looking for, you can click on the
browser tab tile to bring the tab to the foreground. Alternatively, you can press Enter to open the
first tab in the list of results.

Search keywords are a combination of the badges you can find on the tile, plus hidden badges added
for search convenience.
The hidden badges include `audible`, `muted`, `highlighted`, `incognito`, `pinned`, `discarded`,
`unloaded` and `loaded`.

__Example__: a tab is playing sounds and you want to mute it; type "audible" to get a list of tabs that
are currently playing sounds, and mute it by clicking the "mute" menu action in the tile.

A couple of search modifiers are available to change the standard search behavior ("match anywhere").
They must be specified at the very beginning of the search string:
* `!` (exclamation mark) inverts the search to match all browser tab tiles _not_ matching the search string
* `^` (caret) matches title, URL or search keywords starting with the search string
* `!^` combines the two

__Example__: if your search string is _loaded_, you'll match both the `loaded` search keyword, as well
as the `unloaded` search keyword (since "loaded" is contained in `unloaded`). This will likely generate
a list of search results including all the browser tabs you have (unless some are `loading`). If you only
want to find the `loaded` tabs, type _^loaded_, and the `unloaded` tabs won't be included.

## Pinned tabs and groups
You can pin tabs (either via the Chrome tab menu or the extension tile menu action), and you can pin
custom groups. Pinned tabs and custom groups are listed on top, before all other tabs and custom
groups. A group (hostname-based or custom) will be considered pinned if it's explicitly pinned, or
if it includes at least one pinned tab. If it's explicitly pinned, its thumbtack icon will be black,
while if it's inheriting pinning from one of its contained tiles, its thumbtack icon will be grey.
Normally custom groups don't show up in the list if they're empty, but pinned custom groups will
be included even if empty. An empty custom group can be easily identified by the fact that it doesn't
have a counting badge on top of its icon.

## Keyboard shortcuts
TabMania includes a number of useful shortcuts, described below. You can configure the shortcuts
by visiting the TabMania's shortcuts box inside chrome://extensions/shortcuts. The same location
can be reached via the _Settings_ menu, in the _Shortcuts settings_ section.

Most of the shortcuts defined by TabMania are designed to be "Global", but you can decide whether
you want to set them as `Chrome` (available only when a Chrome window is in focus) or `Global`
(available from anywhere in the system). We're suggesting a few keyboard combinations below, but
every system, application and personal preference is different, you should decide which combinations
make more sense for you.

### Shortcut to activate TabMania
It can be useful to add a shortcut to open TabMania without the need to click on TabMania's icon.

__Suggested keyboard shortcuts__: `CTRL+SHIFT+ArrowUp`

### Navigation shortcuts ("tabs history")
TabMania remembers the sequence of browser tabs you're visiting, and offers shortcuts to move back
and forward within your tab navigation history. Navigation is not restricted to a single Chrome window.
If you choose to assign these shortcuts in `Global` mode, you can even jump right back to the last
browser tab you were reading, after your little detour to other applications (regardless of how
many applications you've visited in the meantime, unlike, say, ALT+Tab).

__Suggested keyboard shortcuts__: `CTRL+SHIFT+ArrowLeft` (for "back") and `CTRL+SHIFT+ArrowRight` (for "forward")

TabMania also offers a variation to the navigation shortcuts that allows you to automatically close
the current tab before jumping back/forward to another browser tab. Why is this useful?
* Chrome natively goes back to the previous tab if you open another tab then close it, however, this
  behavior applies only to tabs within a single window. If you are on a tab X on window A and open
  a tab Y in another window B, when you close tab Y (provided other tabs still exist in window B),
  Chrome will go back to another tab in window B, and not go back to tab X on window A.
* If you really really want to nitpick, there's also the case of opening a URL from another application.
  Say you're on tab X on window A, and let's assume tab X is not the right-most tab on window A. You
  double click a shortcut/link from Windows Explorer, and a new tab Y opens as the right-most tab on
  window A. When you close tab Y, you'll find yourself on the new right-most tab on window A, not on
  tab X. 

### "Clipboard launch/search" shortcut
TabMania includes a keyboard shortcut to quickly open a new tab, and load the contents of your current
clipboard data in it. The exact behavior depends on what's in the clipboard:
* If the clipboard contains a full URL, that URL will be loaded
  * Note that a string like `www.google.com` is not a valid URL per the standard specification,
    while `https://www.google.com` is
* If the clipboard contains text that doesn't match the specification of a URL, the text will be
  used to launch a web search. The default search engine is google.com, but you can configure a
  different search engine in the _Shortcuts settings_ section of TabMania's  _Settings_ tab.

__Suggested keyboard shortcuts__: `CTRL+SHIFT+ArrowDown`

### Custom shortcuts
TabMania includes up to 5 custom shortcuts. These shortcuts can be used to jump to a specific tab
from any other application, regardless of whether the tab is active. For example, you can set a
shortcut to bring to the front the browser tab running your email client. Alternatively, you can
configure these shortcuts to offer you more clipboard-based search, if you are the type who searches
for different things at different times (web searches with different search engines, product searches
on different eCommerce platforms, Wikipedia searches, book searches at your library's website).

Because of this, they're particularly useful when set to `Global` mode instead of `Chrome`.

__Configuring custom shortcuts__
Custom shortcuts can be configured in the _Shortcuts settings_ section of TabMania's _Settings_
tab. However, be sure to have enabled the actual shortcuts in chrome://extensions/shortcuts first.
For each custom shortcut:
* You can set a shortcut to target either a hostname or a URL (not both)
* Unless you select _Always open shortcut in new tab_, the browser tab targeted by the shortcut
  is the left-most tab among all the tabs that match the configured hostname or the complete URL.
  All other matching tabs are considered "backups" in case you close the targeted tab.
  If no tabs match the hostname or URL, the shortcut will open a new tab
  * If the shortcut targets a URL, you can change this behavior by selecting the _Always open
    shortcut in new tab_ option, which will cause the shortcut to always open a new tab, and
	never reuse existing tabs
* When using a target URL, you can select the _Enable search of clipbord contents_ option to enable
  the shortcut to replace the first occurrence of the string `%s` in the configured URL with the
  contents of the clipboard (shortcut "search mode")
  * `%s` must be lowercase, `%S` won't match
  * `%s` can't be part of the hostname
  * This behavior is similar to the behavior of the custom search engines in the Chrome omnibar,
    except that it uses the clipboard contents as input
* After the `%s` replacement, if _Always open shortcut in new tab_ is not selected, the shortcut
  will try to match the exact URL of an existing tab, and if a match is found, activate that tab.
  If a match is not found, the positionally left-most tab matching the hostname of the search URL
  (the target tab) will be opened
* When you configure a custom shortcut, the target tab of the shortcut displays a badge with a
  shorthand for the shortcut name (e.g. `SC2` for the second shortcut)
  * In search mode, if multiple tabs match the shortcut, the target tab will show the badge in
    black, while all other backup (candidate) tabs will show the badge in grey
  * You can move tabs in the windows to change the left-most tab, or use the corresponding
    menu action in the tile dropdown menu to reassign the target tab
* You can search for tabs targeted by custom shortcuts by typing the shortcut shorthand
  in the searchbox

__Suggested keyboard shortcuts__: `CTRL+SHIFT+1`, ..., `CTRL+SHIFT+5`


## Geek notes
* Call `tmStats()` on the dev tools console of the popup to see some popup performance statistics.

* Why should I not just use `chrome://inspect/#pages` to make sense of my tabs?
  * Chrome inspect pages is a DevTool, and shows info for developers, so for each page you'll also
  see iFrames or other embedded things

### Extended tab ID
You're likely never going to need this unless you're an extension developer working with Chrome APIs,
but in case you are... Chrome assigns a tab ID to every tab you have opened. The tab ID is a unique
number. It may come in handy to also know the window ID where the tab is located. Then there's the
tab index, which is the relative position of the tab among the tabs in a window (0-based). This last
one is used to determine the target tab for a custom shortcut. We combine these three identifiers
into a string of the form `[windowId]:[tabId]/[tabIndex]`, the extended tab ID.

If you enable the _Display extended tab ID badge_ option, the extended tab ID badge will be visible in
every tile. Note that you can search by extended tab ID even if this option is disabled.
