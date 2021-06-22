// This file is loaded by both background.js and popup.js, so let's be careful
// about what we put in here to avoid polluting one or the other with stuff
// that doesn't belong there

// CLASS CustomGroupsManager
//
// This class generates events Classes.EventManager.Events.UPDATED, with "detail" set
// to { target: <this object>, key: "customGroups" }
Classes.CustomGroupsManager = Classes.AsyncBase.subclass({
	_storageKeyPrefix: null,
	_customGroupsStore: null,
	_parsedCustomGroups: null,

	_eventManager: null,

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
	let promiseArray = [ Classes.AsyncBase._asyncInit.call(this) ];

	this._customGroupsStore = Classes.PersistentDict.createAs(this._storageKeyPrefix + "customGroups", chrome.storage.sync);

	promiseArray.push(this._customGroupsStore.getInitPromise());
	this._customGroupsStore.addEventListener(Classes.EventManager.Events.UPDATED, this._onUpdatedCb.bind(this));

	return Promise.all(promiseArray).then(this._buildCustomGroups.bind(this));
},

_onUpdatedCb: function(ev) {
	let key = ev.detail.target.getId();
	const logHead = "CustomGroupsManager._onUpdatedCb():";
	this._log(logHead, "processing update", key);

	this._buildCustomGroups();

	this._eventManager.notifyListeners(Classes.EventManager.Events.UPDATED, { key: key });
},

// Each line of the string "matchList" is a simplified-regex (or an empty line)
_parseRegex: function(matchList) {
	const logHead = "CustomGroupsManager._parseRegex():";

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
				trimmedList.push("(" + tmUtils.regexEscape(trimmedRegex) + ")");
			}
		}.bind(this)
	)

	if(trimmedList.length == 0) {
		// No content
		return null;
	}

	let fullExpr = trimmedList.join("|")
	this._log(logHead, "after split:", matchList, fullExpr);

	try {
		return new RegExp(fullExpr);
	} catch(e) {
		this._err(logHead, "unable to parse regex", e, matchList);
		return null;
	}
},

_buildCustomGroups: function() {
	const logHead = "CustomGroupsManager._buildCustomGroups():";
	this._parsedCustomGroups = {};

	let groupTitles = this.getCustomGroupNames();
	groupTitles.forEach(
		function(title) {
			this._parsedCustomGroups[title] = this.getCustomGroup(title);
			this._log(logHead, "processing group \"" + title + "\":", this._parsedCustomGroups[title]);
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
	const logHead = "CustomGroupsManager.setCustomGroupProp():";
	if(!this._customGroupsStore.has(name)) {
		this._err(logHead, "custom group not found", name);
		return Promise.reject();
	}

	this._log(logHead, "setting value:", name, prop, value);
	let groupInfo = this.getCustomGroup(name);
	groupInfo[prop] = value;
	return this.setCustomGroup(name, groupInfo);
},

_colorToCalloutCss: {
	// "none" is the color we'll show when no color is set
	none: "",
	gray: "tm-callout-gray",
	blue: "tm-callout-blue",
	red: "tm-callout-red",
	yellow: "tm-callout-yellow",
	green: "tm-callout-green",
	pink: "tm-callout-pink",
	purple: "tm-callout-purple",
	cyan: "tm-callout-cyan",
},

getCustomGroupCssByColor: function(color) {
	return this._colorToCalloutCss[color];
},

getCustomGroupColor: function(groupName) {
	let color = this.getCustomGroupProp(groupName, "color") ?? "none";
	if(color == "grey") {
		// Some basic backward compatibility logic since we switched from "grey" to "gray".
		// This change happened before we released v2.0, and we had maybe 8 users at that
		// time, so we can probably remove this logic soon after v2.0.
		color = "gray";
		this.setCustomGroupProp(groupName, "color", color);
	}
	return color;
},

getCustomGroupCss: function(groupName) {
	let color = this.getCustomGroupColor(groupName);
	return this.getCustomGroupCssByColor(color);
},

}); // Classes.CustomGroupsManager


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
	// - "recentlyClosedInSearch": whether or not "recently closed tabs" should be included
	//   in search results
	// - "bookmarksInSearch": whether or not bookmarks should be included in search results
	// - "historyInSearch": whether or not history should be included in search results
	// - "bookmarksInIncognitoSearch": whether or not bookmarks should be included in incognito
	//   search results (requires "bookmarksInSearch" and "incognitoBsTab" to be active)
	// - "searchUrl": the custom search URL to use with "Clipboard launch/search".
	//   * Make sure this URL includes "%s"
	// - "devMode": enable/disable developer options (like the UI for "showTabId")
	// - "showTabId": show the extended tab ID in the tiles
	// - "advancedMenu": include advanced options in the tile dropdown menu
	// - "newTabNoOpenerInLTW": (LTW = Least Tabbed Window)
	// - "newTabWithOpenerInLTW": (LTW = Least Tabbed Window)
	// - "newEmptyTabInLTW": tabs created with Chrome's "+" move to least tabbed window
	// - "newTabNoOpenerDedup": attempt to reuse existing tab instead of creating a new tab
	//   if the full URL (including fragment) matches
	// - "newTabWithOpenerDedup"
	// - "newEmptyTabDedup"
	// - "startupOpenPopup": auto-open popup at Chrome startup (only if popup undocked)
	// - "incognitoBsTab": use a separate bsTab for incognito tabs (requires incognito to
	//   be enabled for the TabMania extension)
	_options: null,
	_customGroups: null,

	// _pinnedGroups can include labels from custom groupNames or from hostnames
	_pinnedGroups: null,

	// _pinnedBookmarks includes bookmark IDs. If a bookmark gets deleted, bookmarkManager
	// should cleanup the stale bookmark IDs the next time the popup runs.
	// Use the original bookmark ID, not the modified ID with "b" in front.
	_pinnedBookmarks: null,

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
	let promiseArray = [ Classes.AsyncBase._asyncInit.call(this) ];

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

	this._pinnedBookmarks = Classes.PersistentSet.createAs(this._storageKeyPrefix + "pinnedBookmarks", chrome.storage.sync);
	promiseArray.push(this._pinnedBookmarks.getInitPromise());
	this._pinnedBookmarks.addEventListener(Classes.EventManager.Events.UPDATED, this._onUpdatedCb.bind(this));

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

// "defaultValue" is optional, defaults to "false"
_getBooleanOption: function(prop, defaultValue=false) {
	// When a PersistentDict is empty, it returns "undefined" for every key you
	// ask. We must turn that "undefined" to "false" here, since this is the lowest
	// layer that understands "showTabId" should be a boolean (PersistentDict doesn't
	// know what type of values are stored for each key, and this._getOption() must
	// remain generic too).
	// The real reason why we need this conversion is because in some cases we use
	// default values in the argument list of a function, and default values turn
	// "undefined" to a default, but they don't turn "false" to a default.
	let retVal = this._getOption(prop);
	if(retVal == null) {
		return defaultValue;
	}
	return retVal;
},

_setOption: function(prop, value) {
	this._assert(this.isInitialized());
	return this._options.set(prop, value);
},

// I support the point made here against using setters and getters:
// https://nemisj.com/why-getterssetters-is-a-bad-idea-in-javascript/
// It's easy enough to have a typo, it's nice to have a syntax check against that...
getOptionRecentlyClosedInSearch: function() {
	// We want the default for this option to be "true"
	return this._getBooleanOption("recentlyClosedInSearch", true);
},

setOptionRecentlyClosedInSearch: function(value) {
	return this._setOption("recentlyClosedInSearch", value);
},

getOptionBookmarksInSearch: function() {
	// We want the default for this option to be "true"
	return this._getBooleanOption("bookmarksInSearch", true);
},

setOptionBookmarksInSearch: function(value) {
	return this._setOption("bookmarksInSearch", value);
},

getOptionHistoryInSearch: function() {
	// We want the default for this option to be "false"
	return this._getBooleanOption("historyInSearch");
},

setOptionHistoryInSearch: function(value) {
	return this._setOption("historyInSearch", value);
},

getOptionBookmarksInIncognitoSearch: function() {
	// We want the default for this option to be "true"
	return this._getBooleanOption("bookmarksInIncognitoSearch", true);
},

setOptionBookmarksInIncognitoSearch: function(value) {
	return this._setOption("bookmarksInIncognitoSearch", value);
},

getOptionShowTabId: function() {
	if(!this._getBooleanOption("devMode")) {
		return false;
	}
	return this._getBooleanOption("showTabId");
},

setOptionShowTabId: function(value) {
	return this._setOption("showTabId", value);
},

getOptionDevMode: function() {
	return this._getBooleanOption("devMode");
},

setOptionDevMode: function(value) {
	return this._setOption("devMode", value);
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

getOptionNewTabNoOpenerInLTW: function() {
	// Default "false"
	return this._getBooleanOption("newTabNoOpenerInLTW", false);
},

setOptionNewTabNoOpenerInLTW: function(value) {
	return this._setOption("newTabNoOpenerInLTW", value);
},

getOptionNewTabWithOpenerInLTW: function() {
	// Default "false"
	return this._getBooleanOption("newTabWithOpenerInLTW");
},

setOptionNewTabWithOpenerInLTW: function(value) {
	return this._setOption("newTabWithOpenerInLTW", value);
},

getOptionNewEmptyTabInLTW: function() {
	// Default "false"
	return this._getBooleanOption("newEmptyTabInLTW", false);
},

setOptionNewEmptyTabInLTW: function(value) {
	return this._setOption("newEmptyTabInLTW", value);
},

getOptionNewTabNoOpenerDedup: function() {
	// Default "false"
	return this._getBooleanOption("newTabNoOpenerDedup", false);
},

setOptionNewTabNoOpenerDedup: function(value) {
	return this._setOption("newTabNoOpenerDedup", value);
},

getOptionNewTabWithOpenerDedup: function() {
	// Default "false"
	return this._getBooleanOption("newTabWithOpenerDedup", false);
},

setOptionNewTabWithOpenerDedup: function(value) {
	return this._setOption("newTabWithOpenerDedup", value);
},

getOptionNewEmptyTabDedup: function() {
	// Default "false"
	return this._getBooleanOption("newEmptyTabDedup", false);
},

setOptionNewEmptyTabDedup: function(value) {
	return this._setOption("newEmptyTabDedup", value);
},

getOptionStartupOpenPopup: function() {
	// Default "false"
	return this._getBooleanOption("startupOpenPopup", false);
},

setOptionStartupOpenPopup: function(value) {
	return this._setOption("startupOpenPopup", value);
},

getOptionIncognitoBsTab: function() {
	// Default "false"
	return this._getBooleanOption("incognitoBsTab", false);
},

setOptionIncognitoBsTab: function(value) {
	return this._setOption("incognitoBsTab", value);
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

getPinnedBookmarks: function() {
	this._assert(this.isInitialized());
	return this._pinnedBookmarks;
},

// Use the original bookmark ID, not the modified ID with "b" in front
isBookmarkPinned: function(bmId) {
	return this._pinnedBookmarks.has(bmId);
},

pinBookmark: function(bmId) {
	return this._pinnedBookmarks.add(bmId);
},

pinManyBookmarks: function(bmIdList) {
	return this._pinnedBookmarks.addMany(bmIdList);
},

unpinBookmark: function(bmId) {
	return this._pinnedBookmarks.del(bmId);
},

unpinManyBookmarks: function(bmIdList) {
	return this._pinnedBookmarks.delMany(bmIdList);
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
