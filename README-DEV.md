# TabMania for developers

* Call `settingsStore.setOptionDevMode(true)` to enable extra options and menus for developers
  - For now this only adds the _Extended tabId_ configuration checkbox
  - You might want to reload the popup for the changes to take effect

* Call `tmStats()` on the dev tools console of the popup to see some popup performance statistics.

* Call `tmStorage()` to get a full view of all chrome.storage variables currently set.

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

* Copy `/src/manifest.json` to `/dist/manifest.json`

* With `/dist/manifest.json`
  * Replace all background.scripts with just `background.js`
  * Remove permissions `tabGroups` (until they become available in the stable channel)
  * Rename `default_popup` from `popup/popup.html` to `popup.html`
  * Remove all comments
  * Remove completely the `content_security_policy` line at the bottom
    * We used to need it because we were using Bootstrap online, but not anymore
	* We keep it for dev in case we want to experiment with new Font Awesome icons,
	  but we don't use remote icons in productions

* Copy `/src/popup/popup.html` to `/dist/popup.html`

* Copy `/src/bootstrap.min.css` to `/dist/bootstrap.min.css`
  * Why not copy from `/node_modules/bootstrap/dist/css`? Because the process is still
    very manual, and if we've tested from `/src`, better to include from `/src`, in case
	we forgot to update these files in `/src` when we (thought we) upgraded Bootstrap

* Copy `/src/bootstrap.bundle.min.js` to `/dist/bootstrap.bundle.min.js`
  * Why not copy from `/node_modules/bootstrap/dist/js`? Because the process is still
    very manual, and if we've tested from `/src`, better to include from `/src`, in case
	we forgot to update these files in `/src` when we (thought we) upgraded Bootstrap

* Remove sourcemap comment from the bottom of `/dist/bootstrap.min.css` and `/dist/bootstrap.bundle.min.js`

* With `/dist/popup.html`
  * Replace all local `<script>` tags (including all "inject" tags) with just `popup.js`
  * Remove Font Awesome stuff
	* `<link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.2/css/all.min.css" rel="stylesheet">`
	* `<script src="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.2/js/all.min.js"></script>`
  * Remove all comments

* Copy `/src/images` to `/dist/images`

* Create `/dist/content`
  * Or not, wait until we actually need it...

* Run `npm run uglifyBg` to minify `dist/background.js`
  * `uglifyBg` should include the option `--compress`, but that option triggers strange
    warnings (it reshuffles uses of variables and starts finding "Dropping duplicated definition
	of variable [xyz]"), plus it discards the unused `tmStats()` (which we'd like not to discard)
	* All of this for a gain of 2KB (from 52KB to 50KB, without `--mangle`), not worth it
	* We also tried `--mangle`, without `--compress` it takes the code down from 52KB to 45KB,
	  but again you lose `tmStats()`
	* We'll clean this up later and possibly add back `--compress` and `--mangle`
	  * And also add back `--source-map` once we understand if we really need it

* Run `npm run uglifyPopup` to minify `dist/popup.js`
  * Try to use `--compress` temporarily just to see if it comes up with any useful warnings...
  * Without `--compress` the code amounts to 113KB, with it (but no `--mangle`) it's 109KB
    * No difference at all...
	* With `--mangle --compress` we're down to 95KB (but again, for now let's build without these options)

* Run `npm run css` to minify `dist/popup.css`

* Run `npm run uglifyInject` to minify `dist/content/inject-getMeta.js`
  * Or not, if you have not created `/dist/content` (see above)

* Bundle `/dist` in a zip file of form `TabMania vX.Y.zip`, where `X.Y` is the same version as the version
  in the `manifest.json` file

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