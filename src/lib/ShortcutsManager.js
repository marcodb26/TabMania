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


// CLASS ShortcutsManager
//
// This class generates events Classes.EventManager.Events.UPDATED, with "detail" set
// to { target: <this object>, key: <key> }, where "key" is the key of a custom shortcut
Classes.ShortcutsManager = Classes.AsyncBase.subclass({
	_storageKeyPrefix: null,

	// A shortcut includes the following properties:
	// - title: the name of the shortcut, to be used when displaying a context menu item
	//   for the custom shortcut
	// - hostname: the hostname associated to this shortcut
	// - url: the URL associated to this shortcut
	// - tabMania: if set, this overrides "hostname" and "url" to indicate the action should
	//   be taken with the TabMania popup ("alwaysNewTab" is ignored)
	//   * Note that we need this as a boolean, but we're storing it as a string so we
	//     can exactly remember in what case (lower, upper, mixed) the user typed it.
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
	let promiseArray = [ Classes.AsyncBase._asyncInit.call(this) ];

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
	return retVal.sort(Classes.TabNormalizer.comparePositionFn);
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
	let [ protocol, hostname ] = tabNormalizer.getProtocolHostname(retVal.searchUrl);
	let tabs = this._propertySearch("hostname", hostname);
	if(tabs.length != 0) {
		retVal.candidateTabs = tabs;
	}

	return retVal;
},

_computeInfo: function(shortcutKey) {
	// Shortcut in store is: { hostname: , url: , alwaysNewTab: , useClipboard: }
	// shortcusInfo[key]:
	// - TabMania-mode: { tabMania: true } (take action in TabMania popup)
	// - No search: { url: } (open in new tab), or { tab: } (open in existing tab),
	// - Search: { searchUrl: } (open in new tab), or { searchUrl: , candidateTabs: } (open in existing tab),
	// - No data: { empty: true } 
	let sc = this._shortcutsStore[shortcutKey];

	if(sc.get("tabMania") != null) {
		this._shortcutsInfo[shortcutKey] = { tabMania: true };
		return;
	}

	if(sc.get("hostname") != null) {
		// Replace any info that might already be there
		this._shortcutsInfo[shortcutKey] = this._computeByHostname(sc.get("hostname"));
		return;
	}

	if(sc.get("url") == null) {
		// The shortcut doesn't have either hostname or URL, the shortcut is not set.
		// Use an empty object, not "null", to simplify the rest of the logic.
		this._shortcutsInfo[shortcutKey] = { empty: true };
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

// This function returns the list of shortcut keys that are associated to
// searches, to be used by ContextMenu. To build the resulting set of keys,
// we ignore both the "hostname" case and the "tabMania" case, we only
// return real URL searches.
getSearchShortcutKeys: function() {
	let retVal = [];

	this._shortcutKeys.forEach(
		function(key) {
			// See _computeInfo() for the details about this check
			if(this._shortcutsInfo[key].searchUrl != null) {
				retVal.push(key);
			}
		}.bind(this)
	);

	return retVal;
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

setShortcutTitle: function(shortcutKey, value) {
	return this.setShortcutProp(shortcutKey, "title", value);
},

getShortcutTitle: function(shortcutKey) {
	return optionalWithDefault(this.getShortcutProp(shortcutKey, "title"), "");
},

// "value" will be selected between URL and hostname. If "value" is the empty string,
// both URL and hostname will be removed. If "value" is the reserved keyword "tabmania"
// (case insensitive), URL and hostname will be unset, and "tabMania" will be set to
// true, indicating the shortcut is about interacting with the TabMania popup.
setShortcutHostnameOrUrl: function(shortcutKey, value) {
	const logHead = "ShortcutsManager::setShortcutHostnameOrUrl(" + shortcutKey + ", \"" + value + "\"): ";

	// Remove leading and trailing whitespaces
	value = value.trim();

	let currDict = this._shortcutsStore[shortcutKey].getAll();

	if(value == "" || value.toLowerCase() == "tabmania") {
		// Special case, we need to delete both...
		this._log(logHead + "clearing both hostname and URL");
		delete currDict["hostname"];
		delete currDict["url"];

		if(value.toLowerCase() == "tabmania") {
			currDict["tabMania"] = value; // Remember the way the user typed it...
		} else {
			// Just in case it was set...
			delete currDict["tabMania"];
		}
		return this.setShortcut(shortcutKey, currDict);
	}

	// Just in case it was set...
	delete currDict["tabMania"];

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
	let tabMania = this.getShortcutProp(shortcutKey, "tabMania");
	if(tabMania != null) {
		return tabMania;
	}

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
