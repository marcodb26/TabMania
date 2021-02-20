// This file is loaded by both background.js and popup.js, so let's be careful
// about what we put in here to avoid polluting one or the other with stuff
// that doesn't belong there

// Create a global variable "ExtCommands" ("Extension Commands"), but force it readonly,
// so it doesn't get overwritten by mistake.
// Note that the values here must match the "commands" keys in manifest.json.
Classes.Base.roDef(window, "ExtCommands", {} );
Classes.Base.roDef(window.ExtCommands, "BACK", "00back" );
Classes.Base.roDef(window.ExtCommands, "FWD", "01fwd" );
Classes.Base.roDef(window.ExtCommands, "LAUNCHORSEARCH", "02los" );
Classes.Base.roDef(window.ExtCommands, "CLOSEBACK", "03closeback" );
Classes.Base.roDef(window.ExtCommands, "CLOSEFWD", "04closefwd" );
Classes.Base.roDef(window.ExtCommands, "SHORTCUT01", "90shortcut" );
Classes.Base.roDef(window.ExtCommands, "SHORTCUT02", "91shortcut" );
Classes.Base.roDef(window.ExtCommands, "SHORTCUT03", "92shortcut" );
Classes.Base.roDef(window.ExtCommands, "SHORTCUT04", "93shortcut" );
Classes.Base.roDef(window.ExtCommands, "SHORTCUT05", "94shortcut" );


// CLASS NormalizedTabs
//
// Chrome "tabs" is an array of "tab". Each "tab" includes properties:
// https://developer.chrome.com/docs/extensions/reference/tabs/#type-Tab
// active, audible, autoDiscardable, discarded, favIconUrl, groupId, height, highlighted,
// id, incognito, index, mutedInfo, openerTabId, pendingUrl, pinned, selected, sessionId,
// status, title, url, width, windowId.
//
// To properly process the tabs, in a number of places we need to have access to hostname,
// normalized title, and extended tab ID (which includes the window ID)
// This class adds those extra properties once, making them available to all uses later.
// They're added to a "tm" dictionary, to avoid polluting too much the original object.
// tm = { hostname: , lowerCaseUrl: , lowerCaseTitle: , normTitle: , extId: }
Classes.NormalizedTabs = Classes.Base.subclass({

	_tabs: null,

_init: function(tabs) {
	// Overriding the parent class' _init(), but calling that original function first
	Classes.Base._init.call(this);
	this._tabs = optionalWithDefault(tabs, []);
	this.debug();

	this.normalizeAll();
},

// Static function
//
// See https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/sort
// Return -1 if a < b, 0 if a == b and 1 if b < a
// Titles are compared case insensitive.
compareTitlesFn: function(a, b) {
	// See https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/localeCompare
	// Eventually we should also specify the locale configured for the browser, but not now...
	return a.tm.normTitle.localeCompare(b.tm.normTitle);
},

// Static function
compareTabsFn: function(a, b) {
	// Pinned tabs are always before unpinned tabs.
	// By construction, a group is pinned if the group is explicitly pinned or if
	// at least one of its tabs is pinned. So not all tabs in a group have to be
	// pinned, but pinned tabs should always show first. See _tabGroupsToArrays()
	if(a.pinned && !b.pinned) {
		return -1;
	}

	if(b.pinned && !a.pinned) {
		return 1;
	}

	// If we get here, both groups are pinned or unpinned
	// Assuming this is going to be invoked as a static function, we want
	// to avoid using "this".
	return Classes.NormalizedTabs.compareTitlesFn(a, b);
},

// Static function
//
// Compares two tabs based on their position in a window and across window.
// Allows sorting of all tabs by ascending order of window ID, then ascending
// order of index (not tab ID).
comparePositionFn: function(a, b) {
	// Pinned tabs are always before unpinned tabs.
	// By construction, a group is pinned if the group is explicitly pinned or if
	// at least one of its tabs is pinned. So not all tabs in a group have to be
	// pinned, but pinned tabs should always show first. See _tabGroupsToArrays()
	if(a.windowId < b.windowId) {
		return -1;
	}

	if(a.windowId > b.windowId) {
		return 1;
	}

	// a.windowId == b.windowId
	if(a.index < b.index) {
		return -1;
	}

	if(a.index > b.index) {
		return 1;
	}

	// a.index == b.index
	return 0;
},

// Static function
//
// Returns [ null, null ] if the "url" could not be parsed.
// The hostname should already be lowercase, though the Mozilla documentation
// doesn't mention that: https://developer.mozilla.org/en-US/docs/Web/API/URL
// Trying to avoid slowing things down by adding an unnecessary toLowerCase().
getProtocolHostname: function(url) {
	try {
		var urlObj = new URL(url);
		return [ urlObj.protocol, urlObj.hostname ];
	} catch(e) {
		// Should check if it's a TypeError, but let's assume it's always a TypeError
		return [ null, null ];
	}
},

// Static function
//
// To normalize, move everything to upper case, then drop "www." at the beginning
// of each title, since that makes sorting very ugly to watch. Eventually we could
// get more sophisticated with this function (remove articles like "the "), and possibly
// do that in a locale dependent way... but not now.
// "lowerCaseTitle" in input is assumed to already be lower case.
normalizeLowerCaseTitle: function(lowerCaseTitle) {
	// We could use lowerCaseTitle.replace() here, but it seems silly to use regex logic when
	// you just want to drop a fixed size substring occurring at the beginning of the string.
	// It should be less expensive to do surgery on the string knowing the constraints
	// (but we should validate this).
	if(lowerCaseTitle.startsWith("www.")) {
		return lowerCaseTitle.substring(4);
	}

	return lowerCaseTitle;
},

// Static function
formatExtendedId: function(tab) {
	return tab.windowId + ":" + tab.id + "/" + tab.index;
},

_addNormalizedShortcutBadges: function(tab, secondary) {
	//const logHead = "NormalizedTabs::_addNormalizedShortcutBadges(" + tab.tm.hostname + "): ";

	let sm = settingsStore.getShortcutsManager();
	let scKeys = sm.getShortcutKeysForTab(tab, !secondary);

	let array = tab.tm.primaryShortcutBadges;
	if(secondary) {
		array = tab.tm.secondaryShortcutBadges;
	}

	scKeys.forEach(
		function(key) {
			let keyAsString = sm.keyToUiString(key);
			// See description in normalizeTab() for why we add these badges
			// in two places
			array.push(keyAsString);
			tab.tm.searchBadges.push(keyAsString.toLowerCase());
		}.bind(this)
	);
},

updateShortcutBadges: function(tab) {
	// First candidates
	this._addNormalizedShortcutBadges(tab, false);
	// Not first candidate next
	this._addNormalizedShortcutBadges(tab, true);
},

// The badges need to be normalized to lower case to properly support
// case insensitive search.
// "visible" determines whether the search badge will be visible or hidden,
// see normalizeTab() for details.
_addNormalizedVisualBadge: function(tab, badge, visible) {
	visible = optionalWithDefault(visible, true);

	if(visible) {
		tab.tm.visualBadges.push(badge);
	}

	tab.tm.searchBadges.push(badge.toLowerCase());
},

updateSearchBadges: function(tab) {
	if(tab.active) {
		this._addNormalizedVisualBadge(tab, "active");
	}

	if(tab.audible) {
		this._addNormalizedVisualBadge(tab, "audible", false);
	}

	if(tab.discarded) {
		this._addNormalizedVisualBadge(tab, "discarded", false);
	}

	if(tab.highlighted) {
		// The difference between "active" and "highlighted" is that the "active"
		// tab is the tab that's currently visible in a window, while the set of
		// "highlighted" tabs are those selected by holding SHIFT and clicking on
		// multiple tabs. The "active" tab is always "highlighted, so we choose
		// here to only show the "active" badge, and keep the "highlighted" badge
		// hidden, to avoid what seems like redundancy (unless you press the SHIFT
		// key to multi-select tabs in a window).
		this._addNormalizedVisualBadge(tab, "highlighted", false);
	}

	if(tab.incognito) {
		this._addNormalizedVisualBadge(tab, "incognito", false);
	}

	if(tab.mutedInfo.muted) {
		this._addNormalizedVisualBadge(tab, "muted", false);
	}

	if(tab.status != null) {
		switch(tab.status) {
			// "unloaded" and "complete" are hidden search badges, all other
			// states are visible badges
			case "unloaded":
				this._addNormalizedVisualBadge(tab, tab.status, false);
				break;

			case "complete":
				// We're making an exception here, we're translating "complete"
				// to "loaded", because the symmetry unloaded/loaded seems to
				// make more sense from a search perspective
				this._addNormalizedVisualBadge(tab, "loaded", false);
				break;

			default:
				// Right now this only means the "loading" status
				this._addNormalizedVisualBadge(tab, tab.status);
				break;
		}
	}

	if(tab.pinned) {
		this._addNormalizedVisualBadge(tab, "pinned", false);
	}

	if(tab.tm.customGroupName != null) {
		this._addNormalizedVisualBadge(tab, tab.tm.customGroupName, false);
	}

	// We always want this to appear last, if the user configured it to be visible
	this._addNormalizedVisualBadge(tab, tab.tm.extId, settingsStore.getOptionShowTabId());
},

// This can be used as a static function of the class, it doesn't
// need any state from "this".
normalizeTab: function(tab) {
	// Sometimes "tab.url" is empty, because "tab.pendingUrl" is still loading.
	// But in some cases, tab.url is empty, and tab.pendingUrl doesn't even exist,
	// so we use optionalWithDefault() to cover that last corner case.
	let url = optionalWithDefault((tab.url != "") ? tab.url : tab.pendingUrl, "");
	let lowerCaseTitle = tab.title.toLowerCase();
	let [ protocol, hostname ] = Classes.NormalizedTabs.getProtocolHostname(url);
	tab.tm = {
		// We could use "this" here, but since we decided these
		// we're invoking are static functions, let's follow through
		// with that
		protocol: protocol,
		hostname: hostname,
		customGroupName: settingsStore.getCustomGroupsManager().getCustomGroupByHostname(hostname),
		lowerCaseUrl: url.toLowerCase(),
		lowerCaseTitle: lowerCaseTitle,
		normTitle: Classes.NormalizedTabs.normalizeLowerCaseTitle(lowerCaseTitle),
		extId: Classes.NormalizedTabs.formatExtendedId(tab),

		// "visualBadges" are the badges displayed by the tiles, and are case
		// sensitive. "searchBadges" can repeat the "visualBadges" as case
		// insensitive to support searches, and add extra "hidden" badges in search.
		visualBadges: [],
		// Listing the badges explicitly is needed to support search
		// by badge label. Some badges could be added here, but some badges
		// depend on shortcutManager (which is going to be out of sync
		// until after this function has completed execution), and some
		// badges depend on logic in the tile rendering (Classes.TabTileViewer).
		// For this reason, we're just allocating the key here (with an empty
		// array as placeholder, it will be overwritten by the tile), and
		// letting the tile itself decide how to populate it to support
		// search. Search won't (or at least, should not) happen anyway until
		// after the tiles are rendered.
		searchBadges: [],

		// The following two are shortcut badges for visualization, not for search,
		// and as such the text should show up in the case (upper/lower) combination
		// determined for the UI. These badges will also appear in the "hidden"
		// search badges with their normalized lower case representation.
		// See _addNormalizedShortcutBadges().
		primaryShortcutBadges: [],
		secondaryShortcutBadges: [],
	};
	this.updateShortcutBadges(tab);
	this.updateSearchBadges(tab);
},

// Call this function if you need a full refresh of all search/shortcut badges due
// to a configuration change
normalizeAll: function() {
	perfProf.mark("normalizeStart");
	this._tabs.forEach(this.normalizeTab.bind(this));
	perfProf.mark("normalizeEnd");
	perfProf.measure("Normalize", "normalizeStart", "normalizeEnd");
},

// Since the tabs are normalized at initialization, this function always
// returns the normalized tabs
getTabs: function() {
	return this._tabs;
},

// Returns -1 if the "searchTabId" can't be found, an index otherwise
getTabIndexByTabId: function(searchTabId) {
	return this._tabs.findIndex(
		function(tab) {
			if(tab.id == searchTabId) {
				return true;
			}
			return false;
		}.bind(this)
	);
},

// Returns "null" if the "searchTabId" can't be found, a tab otherwise
getTabByTabId: function(searchTabId) {
	let tabIdx = this.getTabIndexByTabId(searchTabId);
	if(tabIdx == -1) {
		return null;
	}

	return this._tabs[tabIdx];
},

// Returns "null" if the "tabIdx" is invalid, a tab otherwise
getTabByTabIndex: function(tabIdx) {
	if(tabIdx == null || tabIdx < 0 || tabIdx > this._tabs.length) {
		return null;
	}

	return this._tabs[tabIdx];
},

// tabIdx is optional, defaults to "search it". Use it to pass in the tabIdx
// if you already know it because you called getTabIndexByTabId() before,
// and avoid another linear search again in this function.
updateTab: function(newTab, tabIdx) {
	this.normalizeTab(newTab);

	tabIdx = optionalWithDefault(tabIdx, this.getTabIndexByTabId(newTab.id));

	if(tabIdx == -1) {
		// Add new tab at the end
		this._tabs.push(newTab);
	} else {
		// Replace current entry with new info
		this._tabs[tabIdx] = newTab;
	}
},

}); // Classes.NormalizedTabs


// CLASS CustomGroupsManager
//
// This class generates events Classes.EventManager.Events.UPDATED, with "detail" set
// to { target: <this object>, key: "customGroups" }
Classes.CustomGroupsManager = Classes.AsyncBase.subclass({
	_storageKeyPrefix: null,
	_customGroupsStore: null,
	_parsedCustomGroups: null,

	_eventManager: null,

	// See https://stackoverflow.com/questions/3561493/is-there-a-regexp-escape-function-in-javascript
	_regexEscapePatternObj: /[-\/\\^$*+?.()|[\]{}]/g,

// We need to override _init() to capture the constructor parameters
_init: function(storageKeyPrefix) {
	// Do this initialization before calling the parent's _init(), because
	// that's where _asyncInit() gets invoked (and we might end up overriding
	// the initialization done there).
	this._storageKeyPrefix = storageKeyPrefix;

	this.debug();

	this._eventManager = Classes.EventManager.create();
	this._eventManager.attachRegistrationFunctions(this);

	// Overriding the parent class' _init(), but calling that original function first
	Classes.AsyncBase._init.call(this);
},

_asyncInit: function() {
	// Overriding the parent class' _asyncInit(), but calling that original function first.
	// We know that AsyncBase doesn't need to take any action, but let's use the right
	// pattern and include the parent class' promise as part of the list of promises
	// to wait for.
	let promiseArray = [ Classes.AsyncBase._asyncInit() ];

	this._customGroupsStore = Classes.PersistentDict.createAs(this._storageKeyPrefix + "customGroups", chrome.storage.sync);

	promiseArray.push(this._customGroupsStore.getInitPromise());
	this._customGroupsStore.addEventListener(Classes.EventManager.Events.UPDATED, this._onUpdatedCb.bind(this));

	return Promise.all(promiseArray).then(this._buildCustomGroups.bind(this));
},

_onUpdatedCb: function(ev) {
	let key = ev.detail.target.getId();
	const logHead = "CustomGroupsManager::_onUpdatedCb(" + key + "): ";
	this._log(logHead + "processing update");

	this._buildCustomGroups();

	this._eventManager.notifyListeners(Classes.EventManager.Events.UPDATED, { key: key });
},

_regexEscape: function(simpleRegEx) {
	// See https://stackoverflow.com/questions/3561493/is-there-a-regexp-escape-function-in-javascript
	return simpleRegEx.replace(this._regexEscapePatternObj, '\\$&');
},

// Each line of the string "matchList" is a simplified-regex (or an empty line)
_parseRegex: function(matchList) {
	const logHead = "CustomGroupsManager::_parseRegex(" + matchList + "): ";

	if(matchList == null) {
		return null;
	}

	let list = matchList.split("\n");

	let trimmedList = [];
	list.forEach(
		function(regex) {
			let trimmedRegex = regex.trim();
			if(trimmedRegex != "") {
				// Skip empty strings
				trimmedList.push("(" + this._regexEscape(trimmedRegex) + ")");
			}
		}.bind(this)
	)

	let fullExpr = trimmedList.join("|")
	this._log(logHead + "after split: " , fullExpr);

	try {
		return new RegExp(fullExpr);
	} catch(e) {
		this._err(logHead + "unable to parse regex", e);
		return null;
	}
},

_buildCustomGroups: function() {
	const logHead = "CustomGroupsManager::_buildCustomGroups(): ";
	this._parsedCustomGroups = {};

	let groupTitles = this.getCustomGroupNames();
	groupTitles.forEach(
		function(title) {
			this._parsedCustomGroups[title] = this.getCustomGroup(title);
			this._log(logHead + "processing group \"" + title + "\": ", this._parsedCustomGroups[title]);
			// We could have done this in the variable initialization itself, but let's start
			// behaving as if we're parsing this from a file...
			this._parsedCustomGroups[title].parsedRegex = this._parseRegex(this._parsedCustomGroups[title].matchList);
		}.bind(this)
	);
},

// Returns "null" if no custom group is defined for "hostname", otherwise returns the
// "title" of the custom group
getCustomGroupByHostname: function(hostname) {
	let titles = this.getCustomGroupNames()

	for(let i = 0; i < titles.length; i++) {
		if(this._parsedCustomGroups[titles[i]].parsedRegex != null &&
			this._parsedCustomGroups[titles[i]].parsedRegex.test(hostname)) {
			return titles[i];
		}
	}

	return null;
},

hasCustomGroup: function(name, ignoreCase) {
	return this._customGroupsStore.has(name, ignoreCase);
},

getCustomGroupNames: function() {
	return this._customGroupsStore.getAllKeys();
},

getCustomGroup: function(name) {
	return this._customGroupsStore.get(name);
},

setCustomGroup: function(name, obj) {
	return this._customGroupsStore.set(name, obj);
},

renameCustomGroup: function(name, newName) {
	return this._customGroupsStore.rename(name, newName);
},

delCustomGroup: function(name) {
	return this._customGroupsStore.del(name);
},

getCustomGroupProp: function(name, prop) {
	if(!this._customGroupsStore.has(name)) {
		return null;
	}

	return this._customGroupsStore.get(name)[prop];
},

setCustomGroupProp: function(name, prop, value) {
	const logHead = "CustomGroupsManager::setCustomGroupProp(" + name + ", " + prop + "): ";
	if(!this._customGroupsStore.has(name)) {
		this._err(logHead + "custom group not found");
		return Promise.reject();
	}

	this._log(logHead + "setting value: ", value);
	let groupInfo = this.getCustomGroup(name);
	groupInfo[prop] = value;
	return this.setCustomGroup(name, groupInfo);
},

_colorToCalloutCss: {
	// "none" is the color we'll show when no color is set
	none: "tm-callout-none",
	grey: "tm-callout-grey",
	blue: "tm-callout-blue",
	red: "tm-callout-red",
	yellow: "tm-callout-yellow",
	green: "tm-callout-green",
	cyan: "tm-callout-cyan"
},

getCustomGroupCssByColor: function(color) {
	return this._colorToCalloutCss[color];
},

getCustomGroupCss: function(groupName) {
	let color = optionalWithDefault(this.getCustomGroupProp(groupName, "color"), "none");
	return this.getCustomGroupCssByColor(color);
},

}); // Classes.CustomGroupsManager


// CLASS ShortcutsManager
//
// This class generates events Classes.EventManager.Events.UPDATED, with "detail" set
// to { target: <this object>, key: <key> }, where "key" is the key of a custom shortcut
Classes.ShortcutsManager = Classes.AsyncBase.subclass({
	_storageKeyPrefix: null,

	// A shortcut includes the following properties:
	// - hostname: the hostname associated to this shortcut
	// - url: the URL associated to this shortcut
	// - alwaysNewTab: whether or not the shortcut should always trigger opening a new tab
	// - useClipboard: "useClipboard" should be set to "true" if "url" includes a "%s"
	//   that should be replaced by the data in the clipboard
	//   * We don't want to guess, some URLs might have "%s" by chance
	//   * Note that "%s" MUST BE lowercase, "%S" won't be recognized
	//
	// Behavior:
	// - "hostname" and "url" are mutually exclusive, if both are specified, "hostname"
	//   wins and "url" is ignored
	// - "alwaysNewTab" and "useClipboard" are applicable only if "url" is specified,
	//   they're ignored if "hostname" is specified
	// - If "hostname" is specified, we pick the left-most tab with that hostname and
	//   activate it
	//   * "Left-most tab" is the left-most tab of the Window with smallest Window ID
	//     This info should be guaranteed to be persisted across Chrome restarts, and
	//     can be manually controlled by the user
	//   * We need to do this because Chrome Tab IDs don't persist across restart
	// - If "hostname" is specified and there are no matching tabs, we open a new tab
	//   with a URL generated from the hostname (URL = https://[hostname])
	// - If "url" is specified and "alwaysNewTab" and "useClipboard" are "false",
	//   same behavior as hostname, except matching full URL
	// - If "url" is specified and "useClipboard" is "true" ("search mode"), we take data
	//   from the clipboard and replace "%s" in "url" with it (if found, otherwise we
	//   ignore and take the URL as is). Restriction: "%s" can't be part of the hostname.
	// - If "url" is specified and "alwaysNewTab" is "true", we unconditionally open
	//   a new tab with "url" (search mode or not)
	// - If in search mode, but "alwaysNewTab" is "false", we try to find a tab that
	//   already has the crafted URL and activate it. Since it's very unlikely the crafted
	//   URL can match an existing URL, we then take the hostname of the crafted URL
	//   and use the "hostname" behavior, except that upon activation of the tab (or
	//   creation of a new tab), we also change the URL of the tab to the crafted URL

	_shortcutsStore: null,
	_tabs: null,

	_eventManager: null,

	// _shortcutsInfo is a cache of information about shortcuts, computed
	// from the tabs information available. One entry per shortcut, keyed
	// using "window.ExtCommands.SHORTCUT0x", each entry contains:
	//
	// In non-search mode:
	// - tab: the tab information if we need to activate an existing tab. This
	//   will be present together with "url" if the URL is intended to target
	//   that tab. If "tab" is missing, then "url" is expected to be used with
	//   a new tab
	// - url: the fixed URL to load (if "tab" is specified, load in that tab,
	//   otherwise load in a new tab)
	//
	// In search mode:
	// - candidateTabs: if "searchUrl" is present, "candidateTabs" includes all
	//   tabs matching the hostname of the search pattern. If "candidateTabs"
	//   is listed, the expectation is that once the search pattern is replaced
	//   with the clipboard content, the new search will be activated on a tab
	//   with the same exact URL from this list, or on the first tab of the list
	//   if there's no match. When "candidateTabs" exists, don't create a new tab.
	// - searchUrl: the URL pattern with the "%s" to be replaced by the clipboard
	//   when the shortcut is invoked. If "candidateTabs" is included, one of those
	//   tabs will be used, otherwise the search will load in a new tab.
	_shortcutsInfo: null,

	_shortcutKeys: [
		window.ExtCommands.SHORTCUT01,
		window.ExtCommands.SHORTCUT02,
		window.ExtCommands.SHORTCUT03,
		window.ExtCommands.SHORTCUT04,
		window.ExtCommands.SHORTCUT05,
	],

// We need to override _init() to capture the constructor parameters
_init: function(storageKeyPrefix) {
	// Do this initialization before calling the parent's _init(), because
	// that's where _asyncInit() gets invoked (and we might end up overriding
	// the initialization done there).
	this._storageKeyPrefix = storageKeyPrefix;
	this._shortcutsStore = null;
	this._shortcutsInfo = null;
	this._tabs = [];

	this.debug();

	this._eventManager = Classes.EventManager.create();
	this._eventManager.attachRegistrationFunctions(this);

	// Overriding the parent class' _init(), but calling that original function first
	Classes.AsyncBase._init.call(this);
},

_asyncInit: function() {
	// Overriding the parent class' _asyncInit(), but calling that original function first.
	// We know that AsyncBase doesn't need to take any action, but let's use the right
	// pattern and include the parent class' promise as part of the list of promises
	// to wait for.
	let promiseArray = [ Classes.AsyncBase._asyncInit() ];

	// Chose to keep the 5 shortcuts in 5 separate variables to allow faster syncing at
	// runtime. Will it cause slower boot up???
	this._shortcutsStore = {};
	for(let i = 0; i < this._shortcutKeys.length; i++) {
		// We don't want to use the manifest.json command keys/labels as storage keys for the
		// shortcuts in chrome.storage.sync, because we might need to change those command labels,
		// and we don't want that to impact our ability to retrieve the settings.
		// The storage is positional, 1-based to match the way the shortcuts are described
		// in the settings UI.
		let persDict = this._shortcutsStore[this._shortcutKeys[i]] =
			Classes.PersistentDict.createAs(this._storageKeyPrefix + "shortcut0" + (i+1), chrome.storage.sync);
		promiseArray.push(persDict.getInitPromise());
		persDict.addEventListener(Classes.EventManager.Events.UPDATED,
									this._onUpdatedCb.bind(this, this._shortcutKeys[i]));
	}

	// It's actually pretty useless to call _computeShortcutsInfo() here, given we're
	// not passing "tabs" in the constructor anymore...
	return Promise.all(promiseArray).then(this._computeShortcutsInfo.bind(this));
},

_onUpdatedCb: function(key, ev) {
	// Since there's been an update, we need to run through updateTabs(),
	// we call here the function corresponding to one key for updateTabs()
	this._computeInfo(key);
	//this._notifyListeners(key);
	this._eventManager.notifyListeners(Classes.EventManager.Events.UPDATED, { key: key });
},

// Now replaced by:
//     	this._eventManager.notifyListeners(Classes.EventManager.Events.UPDATED);
//
//_notifyListeners: function(key) {
//	this._eventManager.dispatchEvent(Classes.EventManager.Events.UPDATED, {
//		target: this,
//		key: key
//	});
//},

// Search all tabs matching "hostname", and return them sorted
// by window position
_propertySearch: function(key, value) {
	// We should validate if using a reducer is faster than just looping
	// the array...
	let retVal = this._tabs.reduce(
		function(res, tab) {
			if(tab.tm[key] == value) {
				res.push(tab);
			}
			return res;
		},
		[] // The initial value of "res"
	);
	return retVal.sort(Classes.NormalizedTabs.comparePositionFn);
},

// "hostname" is assumed to be already normalized to lower case
_computeByHostname: function(hostname) {
	const logHead = "ShortcutsManager::_computeByHostname(" + hostname + "): ";

	let tabs = this._propertySearch("hostname", hostname);
	if(tabs.length == 0) {
		this._log(logHead + "setting as URL");
		// Behave like a URL to be opened in a new tab
		return { url: "https://" + hostname };
	}

	//this._log(logHead, tabs);
	return { tab: tabs[0] };
},

_computeByUrlNoSearch: function(sc, forceNewTab) {
	if(forceNewTab) {
		return { url: sc.get("url") }
	}

	let tabs = this._propertySearch("lowerCaseUrl", sc.get("url").toLowerCase());
	if(tabs.length == 0) {
		// Open URL in new tab
		return { url: sc.get("url") };
	}

	return { tab: tabs[0] };
},

_computeByUrl: function(sc) {
	let forceNewTab = optionalWithDefault(sc.get("alwaysNewTab"), false);
	let useClipboard = optionalWithDefault(sc.get("useClipboard"), false);
	
	if(!useClipboard) {
		return this._computeByUrlNoSearch(sc, forceNewTab);
	}

	// Search case
	// If there's no "%s" in the URL, we're back to the previous case.
	// Note that we're not changing the URL to lower case, because the path
	// can be case sensitive, only the hostname is not.
	// This means "%s" will need to be specified as lowercase in the
	// configuration.
	if(!sc.get("url").includes("%s")) {
		return this._computeByUrlNoSearch(sc, forceNewTab);
	}

	if(forceNewTab) {
		return { searchUrl: sc.get("url") }
	}

	// The goal of this pre-computation is to find out a candidate tab,
	// so we can highlight that in the tab properties list. Since it's
	// likely that the "search URL" won't match any existing URL (but
	// we won't know for sure until the shortcut is actually invoked
	// and the clipboard pasted into the search URL), then we want to
	// at least hint which tab we'll use by hostname from the search URL.
	let retVal = { searchUrl: sc.get("url") };
	let [ protocol, hostname ] = Classes.NormalizedTabs.getProtocolHostname(retVal.searchUrl);
	let tabs = this._propertySearch("hostname", hostname);
	if(tabs.length != 0) {
		retVal.candidateTabs = tabs;
	}

	return retVal;
},

_computeInfo: function(shortcutKey) {
	// Shortcut in store is: { hostname: , url: , alwaysNewTab: , useClipboard: }
	let sc = this._shortcutsStore[shortcutKey];

	if(sc.get("hostname") != null) {
		// Replace any info that might already be there
		this._shortcutsInfo[shortcutKey] = this._computeByHostname(sc.get("hostname"));
		return;
	}

	if(sc.get("url") == null) {
		// The shortcut doesn't have either hostname or URL, the shortcut is not set.
		// Use an empty object, not "null", to simplify the rest of the logic.
		this._shortcutsInfo[shortcutKey] = {};
		return;
	}
	this._shortcutsInfo[shortcutKey] = this._computeByUrl(sc);
},

_computeShortcutsInfo: function() {
	// Reset all shortcuts info and recompute it.
	this._shortcutsInfo = {};

	this._shortcutKeys.forEach(this._computeInfo.bind(this));
},

updateTabs: function(tabs) {
	//const logHead = "ShortcutsManager::getShortcutInfo(): ";

	// Tabs should only be updated after initialization completed.
	// _computeShortcutsInfo() will run once during initialization for the
	// tabs specified in the constructor.
	this._assert(this.isInitialized());

	this._tabs = optionalWithDefault(tabs, []);
	// Since we have new tabs, we need to recompute the shortcut mappings
	this._computeShortcutsInfo();
},

_isTabInCandidateTabs: function(tabId, candidateTabs, firstCandidate) {
	if(candidateTabs == null) {
		return false;
	}

	if(firstCandidate) {
		return (candidateTabs[0].id == tabId);
	}

	// Not first candidate, any position other than first will do
	let idx = candidateTabs.findIndex(
		function(elem, index) {
			if(index == 0) {
				// Not looking for first candidate
				return false;
			}
			if(elem.id == tabId) {
				return true;
			}
			return false;
		}
	);

	return (idx != -1);
},

getShortcutKeys: function() {
	return this._shortcutKeys;
},

// Given a tab, returns the list of shortcut keys associated to it, or an
// empty list (never returns "null")
// "firstCandidate" is optional (default "true"), and determines if we want
// to return data only if "tab" is the first candidate, or only if it's
// not the first candidate of candidateTabs.
getShortcutKeysForTab: function(tab, firstCandidate) {
	firstCandidate = optionalWithDefault(firstCandidate, true);
	let retVal = [];

	this._shortcutKeys.forEach(
		function(key) {
			if(this._shortcutsInfo[key].tab != null &&
				this._shortcutsInfo[key].tab.id == tab.id && firstCandidate) {
				retVal.push(key);
			}
			// This should be an "else", but since these conditions are mutually
			// exclusive by construction, no need to add the "else"
			if(this._isTabInCandidateTabs(tab.id, this._shortcutsInfo[key].candidateTabs, firstCandidate)) {
				// Remember that in case of "candidateTabs", we only want to enlist
				// the first tab in the list, not all of them
				retVal.push(key);
			}			
		}.bind(this)
	);

	return retVal;
},

// Remember the difference between "shurtcuts settings" (the settings in the store) and
// "shortcutInfo" (computed values merging shortcut store data and tabs data)

// Returns the actions to take when a shortcut has been pressed
getShortcutInfo: function(shortcutKey) {
	const logHead = "ShortcutsManager::getShortcutInfo(" + shortcutKey + "): ";
	this._log(logHead + "entering ", this._shortcutsInfo);
	return this._shortcutsInfo[shortcutKey];
},

// Returns a promise waiting for the data to be synced
setShortcut: function(shortcutKey, shortcutStoreDict) {
	return this._shortcutsStore[shortcutKey].setAll(shortcutStoreDict);
},

setShortcutProp: function(shortcutKey, prop, value) {
	return this._shortcutsStore[shortcutKey].set(prop, value);
},

delShortcutProp: function(shortcutKey, prop) {
	return this._shortcutsStore[shortcutKey].del(prop);
},

getShortcutProp: function(shortcutKey, prop) {
	return this._shortcutsStore[shortcutKey].get(prop);
},

setShortcutHostnameOrUrl: function(shortcutKey, value) {
	const logHead = "ShortcutsManager::setShortcutHostnameOrUrl(" + shortcutKey + ", \"" + value + "\"): ";
	let currDict = this._shortcutsStore[shortcutKey].getAll();
	let toSet = "hostname";
	let toDel = "url";

	if(isUrl(value)) {
		toSet = "url";
		toDel = "hostname";
		this._log(logHead + "setting as URL");
	} else {
		this._log(logHead + "setting as hostname");
	}

	currDict[toSet] = value;
	delete currDict[toDel];

	return this.setShortcut(shortcutKey, currDict);
},

getShortcutHostnameOrUrl: function(shortcutKey) {
	// Remember that the logic in the background page will prioritize the hostname
	// over the URL, if both are present, so we want to do the same here.
	// "hostname" can be an empty string as a result of being set that way by the
	// user, since isUrl("") is false.
	let hostname = this.getShortcutProp(shortcutKey, "hostname");
	if(hostname == null || hostname == "") {
		return this.getShortcutProp(shortcutKey, "url");
	}
	return hostname;
},

// Test if "key" is a valid shortcut key. Use this function with the SettingsStore
// callback to identify remote changes originated by ShortcutManager from
// remote changes originated by another PersistentDict/PersistentSet.
isShortcutKey: function(key) {
	return this._shortcutKeys.includes(key);
},

// Returns a string to identify the shortcutKey in the UI
keyToUiString: function(shortcutKey) {
	let idx = this._shortcutKeys.indexOf(shortcutKey);
	if(idx == -1) {
		return "SC-err";
	}

	return "SC" + (idx + 1);
},

}); // Classes.ShortcutsManager


// CLASS SettingsStore
//
// All the settings are stored in chrome.storage.sync. Eventually we should implement
// "live sync" of chrome.storage.sync from all devices, but not now
//
// Current settings list
//
// - "???"
//
// This class generates events Classes.EventManager.Events.UPDATED, with "detail"
// set to { target: <this object>, key: <key> }, where "key" is either the key of a
// custom shortcut, or the ID of a PersistentDict.
Classes.SettingsStore = Classes.AsyncBase.subclass({
	// Maybe it was a bad idea to think we needed a prefix... everything in chrome.storage.sync
	// comes from here, we don't need another prefix
	_storageKeyPrefix: "",

	// Current options:
	// - "showTabId": show the extended tab ID in the tiles
	// - "advancedMenu": include advanced options in the tile dropdown menu
	// - "searchUrl": the custom search URL to use with "Clipboard launch/search".
	//   Make sure this URL includes "%s"
	_options: null,
	_customGroups: null,

	// _pinnedGroups can include labels from custom groupNames or from hostnames
	_pinnedGroups: null,

	_shortcutsManager: null,

	_eventManager: null,

// We need to override _init() to support listeners' registration as soon as
// the object is created, even if the full initialization will need to be async
_init: function(storageKeyPrefix) {
	this.debug();

	this._eventManager = Classes.EventManager.create();
	this._eventManager.attachRegistrationFunctions(this);

	// Overriding the parent class' _init(), but calling that original function first
	Classes.AsyncBase._init.call(this);
},

_asyncInit: function() {
	// Overriding the parent class' _asyncInit(), but calling that original function first.
	// We know that AsyncBase doesn't need to take any action, but let's use the right
	// pattern and include the parent class' promise as part of the list of promises
	// to wait for.
	let promiseArray = [ Classes.AsyncBase._asyncInit() ];

	this._options = Classes.PersistentDict.createAs(this._storageKeyPrefix + "options", chrome.storage.sync);
	promiseArray.push(this._options.getInitPromise());
	this._options.addEventListener(Classes.EventManager.Events.UPDATED, this._onUpdatedCb.bind(this));

	// Each custom group is indexed by "title", and includes properties:
	// { favIconUrl, color, matchList }
	// Note that "matchList" is actually a string made of match strings separated
	// by newlines
	this._customGroupsManager = Classes.CustomGroupsManager.create(this._storageKeyPrefix);
	promiseArray.push(this._customGroupsManager.getInitPromise());
	this._customGroupsManager.addEventListener(Classes.EventManager.Events.UPDATED, this._onUpdatedCb.bind(this));

	this._pinnedGroups = Classes.PersistentSet.createAs(this._storageKeyPrefix + "pinnedGroups", chrome.storage.sync);
	promiseArray.push(this._pinnedGroups.getInitPromise());
	this._pinnedGroups.addEventListener(Classes.EventManager.Events.UPDATED, this._onUpdatedCb.bind(this));

	this._shortcutsManager = Classes.ShortcutsManager.create(this._storageKeyPrefix);
	promiseArray.push(this._shortcutsManager.getInitPromise());
	this._shortcutsManager.addEventListener(Classes.EventManager.Events.UPDATED, this._onUpdatedCb.bind(this));

	return Promise.all(promiseArray).then(
		function() {
			perfProf.mark("settingsLoaded");
		}
	);
},

_onUpdatedCb: function(ev) {
	let key = ev.detail.key;
	// "ev.detail.key" is set only for events from "this._shortcutsManager" or "this._customGroupsManager"
	if(key == null) {
		// The notification did not originate from shortcutsManager/customGroupsManager
		key = ev.detail.target.getId();
	}

	this._eventManager.notifyListeners(Classes.EventManager.Events.UPDATED, { key: key });
},

// Returns a PersistentDict() with all the options. Typically you shouldn't call
// this function, we should have a wrapper for each value in the options
getAllOptions: function() {
	this._assert(this.isInitialized());
	return this._options;
},

_getOption: function(prop) {
	this._assert(this.isInitialized());
	return this._options.get(prop);
},

_getBooleanOption: function(prop) {
	// When a PersistentDict is empty, it returns "undefined" for every key you
	// ask. We must turn that "undefined" to "false" here, since this is the lowest
	// layer that understands "showTabId" should be a boolean (PersistentDict doesn't
	// know what type of values are stored for each key, and this._getOption() must
	// remain generic too).
	// The real reason why we need this conversion is because in some cases we use
	// optionalWithDefault() and optionalWithDefault() turns "undefined" to a default,
	// while it doesn't turn "false" to a default.
	let retVal = this._getOption(prop);
	if(retVal == null) {
		this._err("returning false for " + prop);
		return false;
	}
	this._err("for " + prop + " returning: ", retVal);
	return retVal;
},

_setOption: function(prop, value) {
	this._assert(this.isInitialized());
	return this._options.set(prop, value);
},

// I support the point made here against using setters and getters:
// https://nemisj.com/why-getterssetters-is-a-bad-idea-in-javascript/
// It's easy enough to have a typo, it's nice to have a syntax check against that...
getOptionShowTabId: function() {
	return this._getBooleanOption("showTabId");
},

setOptionShowTabId: function(value) {
	return this._setOption("showTabId", value);
},

getOptionAdvancedMenu: function() {
	return this._getBooleanOption("advancedMenu");
},

setOptionAdvancedMenu: function(value) {
	return this._setOption("advancedMenu", value);
},

getOptionSearchUrl: function() {
	return this._getOption("searchUrl");
},

setOptionSearchUrl: function(value) {
	return this._setOption("searchUrl", value);
},

getPinnedGroups: function() {
	this._assert(this.isInitialized());
	return this._pinnedGroups;
},

isGroupPinned: function(groupName) {
	return this._pinnedGroups.has(groupName);
},

pinGroup: function(groupName) {
	return this._pinnedGroups.add(groupName);
},

unpinGroup: function(groupName) {
	return this._pinnedGroups.del(groupName);
},

getCustomGroupsManager: function() {
	this._assert(this.isInitialized());
	return this._customGroupsManager;
},

getShortcutsManager: function() {
	this._assert(this.isInitialized());
	return this._shortcutsManager;
},

}); // Classes.SettingsStore

perfProf.mark("settingsStarted");
// Create a global variable "settingsStore", but force it readonly, so it doesn't get
// overwritten by mistake.
// Remember to wait for the settingsStore init promise to be completed before starting
// to access the object.
Classes.Base.roDef(window, "settingsStore", Classes.SettingsStore.create());
settingsStore.debug();
