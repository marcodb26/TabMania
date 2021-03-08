# TabMania for developers
Here are a few commands you can call from the dev tool console (some work only on the background
page, some only on the popups) to monitor the state of the extension, or make changes.

* Call `settingsStore.setOptionDevMode(true)` to enable extra options and menus for developers
  - For now this only adds the _Extended tabId_ configuration checkbox
  - You might want to reload the popup for the changes to take effect

* Performance statistics (only for the popup console)
  - Call `perfProf.showAsyncQueues()` to see the performance of AsyncQueues
  - Call `perfProf.showStats()` to see some general popup performance statistics.
  - Call `perfProf.showSearch()` to see performance statistics related to the search functionality.

* Call `tmUtils.showStorage()` to get a full view of all chrome.storage variables currently set.
* Call `tmUtils.clearStorage()` in the background page console to reset all persisted state to default
  - Optional permissions might get reset, but Chrome keeps his cache of what was already granted and
    won't request permission to the user again

* Call `popupDockerBg.showState()` in the background page console to find the state of the popup (docked or undocked)

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

### Extended tab ID for _Recently closed_ tabs
Chrome does not keep a `windowId` and an `index` associated to recently closed tabs, so the extended
tab ID of a recently closed tab is simply its `sessionId`. We just format it in a way that makes it
easily recognizable: `rc[[sessionId]]`

### Extended _Bookmarks_ item ID
Bookmarks that land in search results have an extended ID attached. The extended ID of a bookmark is
a string of the form `bm[[parentId].[bookmarkId]]`. For root objects, the `[parentId]` could be missing.
Extended bookmark IDs are not searchable (bookmarks can only be searched for title and URL matches),
but when visualized they can still provide a hint of context about the bookmark.

### Extended _Browsing history_ item ID
Browsing history items that land in search results have an extended ID attached. The extended ID of a
browsing history item is a string of the form `h[[historyItemId]]`.
Extended browsing history item IDs are not searchable (browsing history items can only be searched
for title and URL matches), but when visualized they can still provide a hint of context about the
browsing history item.

# Environment
TabMania's package.json `scripts` section assumes bash as the shell. If you're on Windows, take the
path of your git-bash from git and run `npm config set script-shell "C:\\Program Files\\Git\\git-bash.exe"`
to use git-bash as the default NPM shell for the "scripts" section. Use `npm config list` to check
how your shell is configured.

When you get the source code, or when you update Bootstrap, run `npm run build-dev` to set up the
development environment correctly.

## Cloning the repository
First `git clone https://github.com/marcodb26/TabMania.git`
Then run `npm install` (with no other arguments) to set up `node_modules` based on the dependencies
defined in `package.json`, and optionally `npm list` to see what was installed.

# Dev version vs. dist version
The __Release process__ is described below for the dist version of TabMania. To make things easier
while developing, we'd try to avoid as much as possible to have to run build scripts for the dev
version of TabMania. Just point Chrome to `src/` and let it open the `manifest.json` there.
Unfortunately we can't do that for everything. If you're modifying "injection scripts", the Chrome
APIs limit injection to a single file, so the source files in `src/content-src` must be preprocessed
before they can be used in the popup. Run `npm run build-dev` to create `src/content-gen` before
you point Chrome to `src/` for `manifest.json`, or any time you edit a file in `src/content-src`.

# Release process
Very manual until I have some time to focus on automation

* Make sure BG_SOURCES in build/build-dist.sh includes all the files listed in manifest.json
  background.scripts
  - Copy the list from manifest.json background.scripts, but make sure to remove the commas
    between files

* Make sure POPUP_SOURCES in build/build-dist.sh includes all scripts listed in popup.html
  - Exactly as listed (and in the same order) in popup.html, all relative to the src/popup folder

* Delete /dist

* Run `npm run dist`

* With `/dist/manifest.json`
  * Replace all background.scripts with just `background.js`
  * Rename `default_popup` from `popup/popup.html` to `popup.html`
  * Remove all the empty lines
  * Ideally take the following two steps by commenting out these permissions in the source manifest.json:
    * Remove permissions `tabGroups` (until they become available in the stable channel)
    * Remove permissions `*://*/*` (only needed for the script injection testing)

* With `/dist/popup.html`
  * Remove all local `<script>` tags (including all "inject" tags) from `<head>`, leaving only `popup.js`
    - Also leave the script for `bootstrap.bundle.min.js` in the body
  * Remove "../" from the HREF of the favicon, from `<link rel="icon" href="../images/icon-16.png" [...]`
    to `<link rel="icon" href="images/icon-16.png" [...]`
  * Remove all comments

* Create `/dist/content`
  * Or not, wait until we actually need it...

* Run `npm run uglifyInject` to minify `dist/content/inject-getMeta.js`
  * Or not, if you have not created `/dist/content` (see above)

* Bundle `/dist` in a zip file of form `TabMania vX.Y.zip`, where `X.Y` is the same version as the version
  in the `manifest.json` file
  - Make sure the files inside the zip file don't start with a top level "/dist" directory

* Test the created `/dist` files
  * Call `tmUtils.clearStorage()` before you start testing

* Post the new version on the Google developer console at https://chrome.google.com/webstore/devconsole

* Commit `/dist` to github
  * Then don't touch `/dist` until the next release cycle

* Tag commit by creating a release in github
  * https://docs.github.com/en/github/administering-a-repository/managing-releases-in-a-repository
  * Create a tag as part of the release creation process
    * The tag must have format `vX.Y`, where X.Y is the same version as the version in the `manifest.json` file
  * Add `TabMania.v[X.Y].distribution.zip` to the release assets
  * Ideally also add new screenshots (those you use in the Chrome Web Store developer console) to the
    assets as well

* Once the tag is available, navigate to the tagged sources and get a link to README.md in that tag
  * Then edit the release object just created, and add the "Documentation here" hyperlink to the
    README.md in the release tag

* Use `git fetch` to get the new tag to your clone repo

* Edit `/src/manifest.json` and update `version` to the next expected release version

* Edit `package.json` and update `version` to the next expected release version

* Commit this change alone with message `First commit for vX.Y`, where X.Y is the same version as the new
  version you've just edited in the `manifest.json` and `package.json` files