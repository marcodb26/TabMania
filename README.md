# TabMania

TabMania organizes all your browser tabs across all your windows, and offers an integrated search
experience across tabs, bookmarks and browsing history. TabMania makes windows disappear, so you can
focus on just your tabs, wherever they might be on your system. Find a lost tab; group tabs in ways
that are meaningful to you, not by window; pin your most important bookmarks so if the tab is not
already open, you can open it in no time; search and cleanup your browsing history; use keyboard
shortcuts to navigate back to a previous tab from anywhere in the system; attach specific tabs to
keyboard shortcuts so they're always one keypress away from view, regardless of how many tabs in
how many windows you might have open.

## Home view
The home view is where most of the action is. The home view is where all your browser tabs are listed
alphabetically by title. Browser tabs loaded with URLs from the same location (hostname) are automatically
grouped together. You can change this default grouping behavior by configuring _custom groups_
(see _Custom groups_ below for more details).

Pinned tabs, bookmarks and groups are listed first, before all other unpinned tabs (see __Pinned tabs,
bookmarks and groups__ below for more details).
The tab of the home view blinks red every time there's a change in the list of tiles for your browser
tabs (new tab, new URL, new title, settings change impacting tiles grouping, etc.).

## Understanding browser tab tiles
TabMania lists Chrome tabs as tiles within the _Home_ view of the extension. Each tile includes
a few visible bits of information about the state of a browser tab:
* The first line of the tile includes the title of the page associated with the browser tab,
  and its favicon.
  - If the tile represents a bookmark, a recently closed tab or a browsing history item, then
    a second icon is displayed next to the favicon, to indicate the type of tile. Only standard
	browser tabs don't have this second icon next to the favicon.
* The second line of the tile includes the URL of the page associated with the browser tab (bookmarks
  also list the bookmark folder here) and some icons and badges providing some more info about
  the browser tab
* If the URL starts with `https://`, TabMania omits the obvious to leave a tad more room to see
  the URL. Note that only `https://` is omitted, any other protocol will be displayed (including `http://`).
* Browser tabs with an active audio source show an `audible` (search badge) icon.
* Muted tabs show a `muted` (search badge) icon. The icon is in black if the browser tab has an
  actively muted audio source, that is, if it would become `audible` if unmuted. Muted tabs without
  an active audio source show the `muted` icon in grey. You can mute a tab using the menu action _Mute_.
* The `active` (search badge) badge indicates the browser tab is the tab currently visible in its window
* A `pinned` (search badge) tab displays a thumbtack icon. You can pin a browser tab using the
  menu action _Pin_ (see __Pinned tabs, bookmarks and groups__ below for more details).
* If you grant TabMania access to your incognito tabs, `incognito` (search badge) tabs will show
  alongside other tabs. Incognito tabs are easily identifiable for their reversed color scheme (dark
  background)
* The `SC1`, `SC2`, `SC3`, `SC4` and `SC5` (search badges) badges indicate that a browser tab is
  associated with a custom keyboard shortcut. If the badge is in black, the keyboard shortcut targets
  that browser tab, while if the badge is in grey, the browser tab is a backup target for the keyboard
  shortcut (see __Keyboard shortcuts__ below for more details)
* If you hover your pointer over a browser tab tile, the menu dropdown button and the close button
  appear. You can use the close button to close the tab without bringing it to the foreground.
* The loading status of a tab is encoded with visual clues
  - The tile of an `unloaded` (search badge) tab is rendered in black&white with italicized title. The tab
    exists, but Chrome has not fully loaded it yet.
	* You can also explicitly unload a browser tab by using the menu action _Suspend_, and
      you can search for all tabs you've suspended this way by searching for the search badge `suspended`.
	* Bookmarks, recently closed tabs and browsing history items are not loaded by definition,
	  and will display like an `unloaded` tab.
  - If a tab is `loading` (search badge), its tile displays a throbber around the favicon.
  - When the tab is fully `loaded` (search badge), the tile displays normally without any of
    the visual clues listed above.
* A tab in _Wants attention_ state has its tile's favicon pulsing, and gets temporarily pushed
  to the top of the tiles list (see __The _Wants attention_ state__ below for more details).

### The _Wants attention_ state
Sometimes websites alternate their titles among a few different strings to get the user's attention.
_Linkedin.com_ for example switches between its normal title and a title indicating new messages when a
new message is received on the site. Unfortunately these indications are completely lost when you have
too many tabs on a window and their titles are all but invisible, or when the window is hidden from view.
TabMania monitors changes in tab titles, and when it notices this pattern on a tab, it pushes its tile
to the top of the TabMania popup, and pulses its favicon. The title change also naturally triggers blinking
of the TabMania popup _Home_ tab. Never again miss one of these title-based notifications!

## Custom groups
Custom groups are a convenient way to keep related tabs grouped together. In the _Custom groups setting_
under the _Settings_ tab you can associate a list of hostnames (or substrings of hostnames) to a custom
group, and TabMania will display all matching tabs grouped together. Use this functionality to
automatically group all your favorite news site, or all the websites you visit for work, so they
always show up together. You can assign a color to a custom group, and that allows members of the
custom group to stand out, useful especially during searches. Each custom group name is attached as a
search badge of each group member, for search convenience.
Custom groups can be explicitly pinned, giving you a convenient alternative to having to pin each individual
tab in the group (for more details, see __Pinned tabs, bookmarks and groups__ below).

You can optionally assign a favicon to a custom group, but if you don't specify one, TabMania will pick
one from the member tabs listed inside.

## Search
Start typing to enter search mode. Search mode allows you to search for _open_ tabs, _recently closed_ tabs,
_bookmarks_ and _browsing history_ items. The search string is case insensitive, and it will be matched against
title, URL and search badges attached to tabs, bookmarks or history items.
Search results are sorted alphabetically by title, and they auto-update as browser tabs change:
a tab that's in the search results might go away if its state changes in such a way that it doesn't
match the search anymore (e.g. if you load a new URL).

Once you've typed enough characters to easily find what you were looking for, you can click on the
browser tab tile to bring the tab to the foreground. Alternatively, you can press Enter to open the
first tab in the list of results.

Search badges are a combination of visible badges you can see on the tab tile, plus hidden badges added
for search convenience.
The hidden badges include `audible`, `muted`, `highlighted`, `incognito`, `pinned`, `suspended`,
`unloaded` and `loaded`. For _recently closed tabs_ (see __Searching beyond open tabs__ below),
the extra search badge `closed` is also available. For _bookmarks_ (see  __Searching beyond open
tabs__ below), the extra search badge `bookmark` is also available.

__Example__: a tab is playing sounds and you want to mute it; type "audible" to get a list of tabs that
are currently playing sounds, and mute it by clicking the "mute" menu action in the tile.

Each keyword you type in the searchbox gets searched through the tabs information, and TabMania includes
in the results only tabs that match all the keywords. If you're a power user, TabMania includes a number
of operators to influence the way search happens. You can read all the details at
[Advanced topics: search](docs/README-search.md).

### Searching beyond open tabs
TabMania supports searching among _bookmarks_, _recently closed_ tabs and _browsing history_ items.
Go to the _Settings_ page, and under _General settings_ choose which class you want included and
which excluded. Do it at any time, even mid-search, to filter in or out extra pages. TabMania restricts
_bookmarks_ and _browsing history_ to a maximum of 500 items each during a search. _Recently closed_
tabs are capped by Chrome at a maximum of 25 top level items (either closed tabs or closed windows).

Since all these classes represent pages that are not currently loaded, TabMania's convention is
to show their tiles in black&white, similar to `unloaded` and `suspended` tabs.
The tiles for each one of these classes of objects adds a little icon right before the page title, so you
can easily identify which class they belong to. _Bookmarks_ and _browsing history_ tiles also have their
own dropdown menus, with specific actions you can take on them (for example, _browsing history_ tiles
will tell you how many times you've visited that page in the past, and when was the last time you've
seen it). _Recently closed_ tabs on the other hand don't offer any action besides restoring the tab.

Clicking on a _recently closed_ tab will simply restore the tab, exactly like the corresponding action
on the Chrome menu. Chrome removes tabs from the _recently closed_ list once they're restored.
When clicking on _bookmarks_ or _browsing history_ items, TabMania will instead first try to locate an
open tab matching the same URL. If it finds one, it simply activates that tab and bring its window into
focus, as if you had clicked the tile of that open tab. If TabMania can't find an open tab matching
the URL of the _bookmarks_ or _browsing history_ item, it will open the corresponding URL in a new tab,
either recycling an unused new tab you already have open, or opening a fresh new tab in the least
tabbed window.

Clicking the _Close_ button of _bookmarks_ and _browsing history_ items deletes the items from the
_bookmarks_ or _browsing history_ (no undo).

_Recently closed_ tabs and _bookmarks_ support search by search badges, and offer the additional
`closed` search badge (_recently closed_ tabs) and `bookmark` (_bookmarks_) to identify them.
_Browsing history_ items don't support search badges, and can only be matched on title and URL.

## Pinned tabs, bookmarks and groups
You can pin tabs (either via the Chrome tab menu or the TabMania tile menu action), you can pin
bookmarks (via the TabMania tile menu action), and you can pin custom groups (through the _Custom
groups_ configuration).
Pinned tiles are always listed on top, before all other tiles.
Bookmarks are normally displayed only in search mode, but pinned bookmarks are an exception, and
they're visible in standard view when there's no open tab matching their URL. Similarly, empty
custom groups are hidden from standard view, but pinned custom groups are always present in standard
view, even if empty. An empty custom group can be easily identified by the fact that it doesn't have
a counting badge on top of its icon.

### Pinning inheritance
Open tabs and groups can be explicitly pinned, or can inherit pinning from other objects. Bookmarks
never inherit pinning, and can only be explicitly pinned.
An unpinned open tab inherits pinning from a pinned bookmark with a matching URL, while a group (either
hostname-based or custom) inherits pinning if at least one of its members is a pinned tab or bookmark. 
Objects that are explicitly pinned show their thumbtuck icon in black, while objects that inherit
pinning show their thumbtuck icon in grey.

## The button toolbar
### The "open new tab" button
Why would I want to open a new tab from TabMania when I can so easily create a new tab on Chrome
itself (`CTRL+T`, or the "+" button on Chrome)? Here are a few reasons:
- TabMania tries to recycle lost and forgotten "new tabs" you might have opened in the past and
  then forgot there without using them
- When the previous trick fails (congratulations, you never waste a new tab!), TabMania opens the
  new tab in the least tabbed window, to balance how many new tabs you open in your windows. You
  know when you have a window with a hundred tiny claustrophobic tabs, and another window with
  just two... well, you're likely going to be on the busy window, but TabMania will open your
  new tab in the empty one
- If you're on the undocked TabMania popup searching for a tab you thought you had opened, your
  standard Chrome windows will be far, just use the "+" button on the TabMania popup!
  * To make things easier, if you have an active search, pressing the "+" button will activate
    a _launch/search_ response, similar to the behavior of the "Clipboard launch/search" shortcut,
	and based on its configured search engine (See __"Clipboard launch/search" shortcut__ below
	for more information). Of course it will use the text from the searchbox instead of the data
	from your clipboard for the _launch/search_ action.
- Also, if you have an unconfigured custom shurtcut (see __Custom shortcuts__ below), it will default
  to "Open new tab", making it very easy to create a new tab from anywhere in the system
  - But, no, you can't override the default `CTRL+T`, the original Chrome shortcut will win

## Keyboard shortcuts
TabMania includes a number of useful shortcuts, described below. You can configure the shortcuts
by visiting the TabMania's shortcuts box inside chrome://extensions/shortcuts. The same location
can be reached via the _Settings_ menu, in the _Shortcuts settings_ section, by clicking on the
shortcut key combination badge under a shortcut title. Note that if you update your shortcuts in
the chrome://extensions/shortcuts page, you might need to close and reopen the _Shortcuts settings_
section of the _Settings_ page for the changes to be updated (unfortunately Chrome APIs don't
offer notifications back to extensions for changes you make to chrome://extensions/shortcuts).

Most of the shortcuts defined by TabMania are designed to be used in `Global` scope. You can decide
whether you want to set them as `Chrome` scope (available only when a Chrome window is in focus) or
 `Global` scope (available from anywhere in the system). We're suggesting a few keyboard combinations
below, but every system, application and personal preference is different, you should decide which
combinations make more sense to you.

### Shortcut to activate TabMania
It can be useful to add a shortcut to open TabMania without the need to click on TabMania's icon.

__Suggested keyboard shortcuts__: `CTRL+SHIFT+ArrowUp`

### Navigation shortcuts ("tabs history")
TabMania remembers the sequence of browser tabs you're visiting, and offers shortcuts to move back
and forward within your tab navigation history. Navigation is not restricted to a single Chrome window.
If you choose to assign these shortcuts in `Global` scope, you can even jump right back to the last
browser tab you were reading, after your little detour to other applications (regardless of how
many applications you've visited in the meantime, unlike, say, `ALT+Tab`).

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
configure these shortcuts to offer you more search engine options, if you are the type who searches
for different things at different times (web searches with different search engines, product searches
on different eCommerce platforms, Wikipedia searches, book searches at your library's website).
When set to _Search mode_, these shortcuts attempt to use the contents of your clipboard to determine
the search query. The same shortcut configuration is also available in context menus on the pages
you visit, but in that case TabMania will use the text selected on the page as search query, not
the contents of the clipboard (see __Context menus__ below for more details).

Because of their search via clipboard capabilities, these shortcuts particularly useful when set
to `Global` scope instead of `Chrome` scope.

__Configuring custom shortcuts__
Custom shortcuts can be configured in the _Shortcuts settings_ section of TabMania's _Settings_
tab. First though, be sure to have enabled the actual shortcuts in
[chrome://extensions/shortcuts](chrome://extensions/shortcuts).
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
* Any time the shortcut logic decides to open the content in a new tab (either because you have
  configured _Always open shortcut in new tab_, or the content is not already available in
  any of the existing tabs), TabMania will try to find an existing "New tab". If none exists,
  it will open the new tab in the least tabbed window, like the "Open new tab" logic (see _The
  "open new tab" button_ section for more details)
* Last, if you don't configure a custom shortcut (or clear the _Hostname or URL_ input), the
  custom shortcut will default to an "Open new tab" behavior.

__Suggested keyboard shortcuts__: `CTRL+SHIFT+1`, ..., `CTRL+SHIFT+5`

## Context menus
TabMania adds context menus to the pages you visit. The main role of these context menus is to
activate search-based keyboard shortcuts like _Launch/search_ or _custom shortcuts_ (see __Keyboard
shortcuts__ above) using the text selected on the current page instead of the clipboard contents.
Other context menu items activate when right-clicking the background of a page or a link, and
they're mostly about rebalancing tabs among your open windows (_Move to least tabbed window_
and _Open in least tabbed window_). Note that _Move to least tabbed window_ will take action
only if the current tab is in a window that has at least two more tabs than the least tabbed
window (no point in moving a tab if it doesn't rebalance anything). If TabMania decides the
tab is ok in the window where it's currently hosted, it will blink its popup's badge to indicate
that.

## Docking/undocking popup
By default the TabMania popup opens in its own undocked window. This allows you to change its size
and to put it in a place on your desktop where it can be always available for you. There's also an
option to dock the popup, though the docked popup has certain disadvantages over the undocked popup,
as Chrome tends to close it off under certain conditions, plus it's always covering your tab contents.
The docking state is local to one device, so you can keep TabMania docked on just one device, while
it remains undocked on all other devices.

Unfortunately the standard Chrome shortcut to open the popup works only in `Chrome` scope (can't be
configured for `Global` scope), so a Chrome window must be in focus.
