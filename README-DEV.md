# TabMania for developers
Here are a few commands you can call from the dev tool console (some work only on the background
page, some only on the popups) to monitor the state of the extension, or make changes.

* Call `settingsStore.setOptionDevMode(true)` to enable extra options and menus for developers
  - For now this only adds the _Extended tabId_ configuration checkbox
  - You might want to reload the popup for the changes to take effect

* Call `tmConsole.showTabInfo(<tabId>)` to get tab and tile information about a tab that's currently
  being displayed in TabMania's popup
  - The <tabId> must be a normalized tab ID (not an extended tab ID, see below) to be able to
    retrieve any class of tiles (open tabs, recently closed tabs, bookmarks, or browsing history
	items)
	* Tab info are sometimes taken from TabsTabViewer._normTabs, and sometimes from the tile
	  info, depending on what's available (we have _normTabs only for standard open tabs, not
	  for the other classes)
  - Remember that most normalized tab IDs are strings (only tab IDs of standard tabs are numbers),
    so enclose the normalized tab ID in quotes

* Call `tmConsole.showSearchParserInfo()` on the popup console to see how the search parser interpreted
  the active query
  - Works only while the TabMania popup is in search mode

* Call `tmConsole.showBookmarksStats()` on the popup console to see counters from bookmarksManager.

* Performance statistics (only for the popup console)
  - Call `perfProf.showAsyncQueues()` to see the performance of AsyncQueues.
  - Call `perfProf.showStats()` to see some general popup performance statistics.
  - Call `perfProf.showSearch()` to see performance statistics related to the search functionality.

* Call `tmConsole.showStorage()` to get a full view of all chrome.storage variables currently set.
* Call `tmConsole.clearStorage()` in the background page console to reset all persisted state to default
  - Optional permissions might get reset, but Chrome keeps his cache of what was already granted and
    won't request permission to the user again

* Call `popupDockerBg.showState()` in the background page console to find the state of the popup (docked or undocked)

* Use `monitorEvents(document, "pointercancel")` (standard Chrome dev tool) to monitor events for touch displays

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

# Adding Javascript source files to `manifest.json` and `popup.html`
`src/manifest.json` and `src/popup/popup.html` are auto-generated files from `src/templates/manifest.json.ejs`
and `src/templates/popup.html.ejs` respectively. If you need to add or change Javascript source files,
the "single source of truth" is `src/templates/sources-env.sh`. Edit that file, then apply the changes
by running `npm run build-dev` from the top folder of the project.

# Adding third party libraries
All 3rd party libraries need to first be installed with `npm install`, then imported in the project by
editing `build/build-dev.sh` and `build/build-dist.sh` to copy the files needed into the source and dist
trees. The import logic for all 3rd party code should copy all relevant files in `src/lib/npm` and
in `dist/lib`. Then `src/templates/popup.html.ejs` needs to be updated to make sure these 3rd party
files are loaded (unless you want them to get built into `dist/popup.js`).

# Release process
* Delete /dist
  - Unlikely, but in case /past-releases already includes a folder `vX.Y` of the version you're
    trying to create, delete that as well
  - `npm run dist` (see below) checks for both and refuses to proceed if one of them already exists

* Run `npm run dist`
  * This creates the ZIP file `past-releases/vX.Y/TabMania vX.Y.zip`, where `X.Y` is the current
    version (same as the version showing in `manifest.json`)
  * Note that the script makes sure the files inside the zip file don't start with a top level
    "/dist" directory

* Create `/dist/content`
  * Or not, wait until we actually need it...
  * If you do this, you'll have to recreate the ZIP file generated by the previous step

* Run `npm run uglifyInject` to minify `dist/content/inject-getMeta.js`
  * Or not, if you have not created `/dist/content` (see above)
  * If you do this, you'll have to recreate the ZIP file generated by the previous step

* Test the created `/dist` files
  * Call `tmConsole.clearStorage()` before you start testing

* Update and commit CHANGELOG.md
  - Change title `# [Unreleased]` to `# [X.Y.0] - YYYY-MM-DD`
    * There should be no `# [Unreleased]` in the file until after the tag has been created

* Commit `/dist` to github
  * Use commit message `Pushing /dist for vX.Y`
  * Then don't touch `/dist` until the next release cycle

* Tag commit by creating a release in github
  * https://docs.github.com/en/github/administering-a-repository/managing-releases-in-a-repository
    - Click on the "Releases" block on the right
  * Create a tag as part of the release creation process
    - The tag must have format `vX.Y`, where X.Y is the same version as the version in the `manifest.json` file
  * Use same _title_ as the tag name (`vX.Y`)
  * Don't add any _description_ yet, we'll need tagged files to be linked in the description.
  * Add `TabMania.v[X.Y].distribution.zip` to the release assets
  * Ideally also add new screenshots (those you use in the Chrome Web Store developer console) to the
    assets as well

* Once the tag is available, navigate to the tagged sources and get a link to README.md in that tag
  * `https://github.com/marcodb26/TabMania/tree/**<tag label>**`
	- E.g. https://github.com/marcodb26/TabMania/tree/v1.2
    - Before, used to do: https://github.com/marcodb26/TabMania/commits then click the `< >` button (_Browse the repository
    at this point in the history_)
	  * But the link would be too long
  * Note down the link of README.md and CHANGELOG.md
    - Readme: https://github.com/marcodb26/TabMania/blob/v1.2/README.md
	- Changelog: https://github.com/marcodb26/TabMania/blob/v1.2/CHANGELOG.md
  * Then edit the release object just created, and add:
	 `See the documentation and changelog for this release.` with appropriate hyperlinks

* Post the new version on the Google developer console at https://chrome.google.com/webstore/devconsole
  * Use the same tagged link to the README.md

* Use `git fetch` to get the new tag to your clone repo

* Edit `/src/templates/sources-dev.sh` and update `VERSION` variable to the next expected release version

* Edit `package.json` and update `version` to the next expected release version

* Update CHANGELOG.md again, by adding a new `# [Unreleased]` section at the top

* Add `DONE X.Y` for the new expected release version to `src/roadmap-done.txt`

* Replace the version number in `TODO X.Y` at the top of `src/roadmap-todo.txt`

* Commit these changes with message `First commit for vX.Y`, where X.Y is the same version as the new
  version you've just edited in the `manifest.json`, `package.json` and `CHANGELOG.md` files

* Run `npm run build-dev` to pick the version changes into the dev environment (manifest.json)

* Find out if any NPM packages need updates using `npm outdated`
  - Then update them with `npm update` and update `CHANGELOG.md` accordingly
  - List current versions in the __Environment__ sectoin below

# Environment
- Google developer console: https://chrome.google.com/webstore/devconsole

- Upgraded GIT to v.2.31.1.windows.1 (was v.2.30.1.windows.1)
  * To upgrade:
    > `git update-git-for-windows`
  * Repo at: https://github.com/marcodb26/TabMania.git
  * To clone
    > `git clone https://github.com/marcodb26/TabMania.git`
  * To see commits history
	- https://github.com/marcodb26/TabMania/commits

- Upgraded NPM to v.7.7.5
  * To upgrade:
    - Run PowerShell as Administrator
      > `Set-ExecutionPolicy Unrestricted -Scope CurrentUser -Force`
      > `npm install -g npm-windows-upgrade`
      > `npm-windows-upgrade`
  * Created project with `npm init`
    - Edited package.json to make project private
	  * Add line after `description`:
		> `"private": true,`

- Node is at v15.12.2 (was v10.8.0) (on old PC)
  * Updated to latest version from https://nodejs.org/en/download/current/
    - Picked 64-bit .msi for Windows

- Changed shell for NPM
  * Original: `"C:\\WINDOWS\\system32\\cmd.exe"`
  * New: `"C:\\Program Files\\Git\\git-bash.exe"`
  > `npm config set shell "C:\\Program Files\\Git\\git-bash.exe"`
  > `npm config set script-shell "C:\\Program Files\\Git\\git-bash.exe"`
  * Use `npm config list` to check
  * UPDATE: this makes `npx` fail on Windows...

- Installed Bootstrap
  > `npm install bootstrap@5.0.0-beta1`
  * To update use `npm update bootstrap`
  * Call `npm run build-dev` when upgrading bootstrap again

- Installed uglify-js v.3.13.2 (was v.3.13.0)
  > `npm install uglify-js --save-dev`
  > `npm update uglify-js --save-dev`

- Installed csso-cli v.3.0.0 (https://www.npmjs.com/package/csso-cli)
  > `npm install csso-cli --save-dev`
  * Really liked the [documentation of cssnano](https://cssnano.co/docs/getting-started), but
    decided to go with csso because it seemed to be more "independent" of other modules

- Installed ejs v.3.1.6 (HTML templating)
  > `npm install ejs --save-dev`

- Added `C:\Program Files\7-Zip` to `PATH` environment variable to have `7z.exe`
  available
  * Needed by `npm run dist`

- Installed day.js v1.10.4 (replacement for moment.js)
  > `npm install dayjs --save`

- Installed [Windows 10 Power Toys](https://github.com/microsoft/PowerToys) v.0.35.0
  * Find installer on the [GitHub releases page](https://github.com/microsoft/PowerToys/releases/)
  * Not necessary to run the project, just mentioning it because of the Color Picker tool,
    which should be useful to manage some of the CSS colors