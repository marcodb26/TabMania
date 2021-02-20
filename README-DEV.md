# TabMania for developers

* Call `tmStats()` on the dev tools console of the popup to see some popup performance statistics.

* Call `tmStorage()` to get a full view of all chrome.storage variables currently set

* Why should I not just use `chrome://inspect/#pages` to make sense of my tabs?
  * Chrome inspect pages is a DevTool, and shows info for developers, so for each page you'll also
  see iFrames or other embedded things

## Extended tab ID
If you're an extension developer working with Chrome APIs, you know that Chrome assigns a tab ID to
every tab you have opened. The tab ID is a unique number. It may come in handy to also know the
window ID where the tab is located. Then there's the tab index, which is the relative position of
the tab among the tabs in a window (0-based). This last one is used to determine the target tab for
a custom shortcut. We combine these three identifiers into a string of the form
`[windowId]:[tabId]/[tabIndex]`, the extended tab ID.

If you enable the _Display extended tab ID badge_ option, the extended tab ID badge will be visible in
every tile. Note that you can search by extended tab ID even if this option is disabled.
