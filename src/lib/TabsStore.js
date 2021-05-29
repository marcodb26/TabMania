// CLASS TabsStoreBase
Classes.TabsStoreBase = Classes.Base.subclass({

	_dict: null,
	_list: null,

	_useList: null,

// "tabs" is an optional list of initial tabs to add
// "useList" is optional, default to "true". Set it to "false" if you call update()
// with a "value" different from "tab" and can't override _findTabIndexById() easily.
_init: function(tabs, useList=true) {
	// Overriding the parent class' _init(), but calling that original function first
	Classes.Base._init.call(this);

	this._useList = useList;

	this.reset();

	if(tabs != null) {
		if(this._useList) {
			this._list = tabs;
		}
		for(let i = 0; i < tabs.length; i++) {
			this._dict[tabs[i].id] = tabs[i];
		}
	}
},

reset: function() {
	this._dict = {};

	if(this._useList) {
		this._list = [];
	}
},

// Find a list index for a tab. Returns -1 if the "searchTabId" can't be found, or
// if the instance was created with the _useList set to "false". Otherwise it returns
// an index in this._list.
// Override this function if you need update() to work with a "value" different
// from "tab".
_findTabIndexById: function(searchTabId) {
	if(!this._useList) {
		return -1;
	}

	return this._list.findIndex(
		function(tab) {
			if(tab.id == searchTabId) {
				return true;
			}
			return false;
		}.bind(this)
	);
},

// "value" defaults to "tab"
add: function(tab, value) {
	value = optionalWithDefault(value, tab);
	this._dict[tab.id] = value;

	if(this._useList) {
		this._list.push(value);
	}
},

// "value" defaults to "tab", but if you need to use a "value" different from
// "tab", you must override _findTabIndexById() to support searching the "_list"
// to replace the value (or disable use of _list by initializing with "useList = false").
// tabIdx is optional, defaults to "search it". Use it to pass in the tabIdx
// if you already know it because you called _findTabIndexById() before,
// and avoid another linear search again in this function.
//
// Returns the tab/value being replaced if "tab" is already in the TabsStore, "null" if not
update: function(tab, value, tabIdx) {
	value = optionalWithDefault(value, tab);

	if(!(tab.id in this._dict)) {
		// Add new tab at the end.
		// Explicitly calling the "add()" of this class, in case children classes
		// override both update() and add().
		Classes.TabsStoreBase.add.call(this, tab, value);
		return null;
	}

	if(tabIdx == null) {
		tabIdx = this._findTabIndexById(tab.id);
	}

	if(this._useList) {
		this._assert(tabIdx != -1);
	}

	// Replace current entry with new info
	let retVal = this._dict[tab.id];
	this._dict[tab.id] = value;

	if(tabIdx != -1) {
		this._list[tabIdx] = value;
	}

	return retVal;
},

// Returns the tab/value being removed if "tabId" was found and removed, "null" if not
removeById: function(tabId) {
	if(!(tabId in this._dict)) {
		return null;
	}

	let tabIdx = this._findTabIndexById(tabId);

	if(this._useList) {
		// "tabIdx" should exist, otherwise we would not have got here
		this._assert(tabIdx != -1, tabId, this._dict[tabId], this._list);
	}

	let retVal = this._dict[tabId];

	delete this._dict[tabId];

	// tabIdx should not be "-1", but if it is, we don't want that to cause .splice()
	// to mess up the data structure...
	if(tabIdx != -1) {
		this._list.splice(tabIdx, 1);
	}

	return retVal;
},

// Returns "undefined" if the "searchTabId" can't be found, a tab/value otherwise
getById: function(searchTabId) {
	return this._dict[searchTabId];
},

hasById: function(searchTabId) {
	return this.getById(searchTabId) !== undefined;
},

// get() returns the "_list", getDict() returns the "_dict"
get: function() {
	// We can use Object.values() instead of tracking a separate "_list", but if the instance
	// needs to perform more calls to get() (to iterate) than calls to update(), then using
	// the supporting "_list" data structure is useful.

	if(!this._useList) {
		return Object.values(this._dict);
	}

	return this._list;
},

getDict: function() {
	return this._dict;
},

getTabIdList: function() {
	return Object.keys(this._dict);
},

getCount: function() {
	return this._list.length;
},

discard: function() {
	this.reset();
	gcChecker.add(this);
},

}); // Classes.TabsStoreBase


// CLASS TabsStore
//
// Chrome "tabs" is an array of "tab". Each "tab" includes properties:
// https://developer.chrome.com/docs/extensions/reference/tabs/#type-Tab
// active, audible, autoDiscardable, discarded, favIconUrl, groupId, height, highlighted,
// id, incognito, index, mutedInfo, openerTabId, pendingUrl, pinned, selected, sessionId,
// status, title, url, width, windowId.
//
// To properly process the tabs, in a number of places we need to have access to hostname,
// normalized title, and extended tab ID (which includes the window ID).
// This class adds those extra properties once, making them available to all uses later.
// They're added to a "tm" dictionary, to avoid polluting too much the original object.
// tm = { hostname: , lowerCaseUrl: , lowerCaseTitle: , sortTitle: , extId: }
Classes.TabsStore = Classes.TabsStoreBase.subclass({

	// "_tabsLoading" is a dictionary of all tabs in status "loading", keyed by tab ID
	_tabsLoading: null,

	// "_tabsPinnedFromBookmarks" is a dictionary of all tabs that have inherited pinning from
	// a bookmark
	_tabsPinnedFromBookmarks: null,

// If you choose to initialize "tabs" at creation time, remember to also explicitly call
// TabsStore.addShortcutBadges() afterwards, as the initializer doesn't do that.
// See TabsManager._queryTabs() for the reasons why.
// "oldTabsDict" is optional, see normalizeAll() and TabNormalizer.normalize() for its rationale.
_init: function(tabs, oldTabsDict) {
	this._tabsLoading = Classes.TabsStoreBase.create();
	this._tabsPinnedFromBookmarks = Classes.TabsStoreBase.create(null, false);

	// Overriding the parent class' _init(), but calling that original function first.
	// We must allocate this._tabsLoading and this._tabsPinnedFromBookmarks first because
	// TabsStoreBase._init() internally calls reset(), which this class overrides.
	Classes.TabsStoreBase._init.call(this, tabs);

	this.debug();

	this.normalizeAll({ addShortcutBadges: false, oldTabsDict: oldTabsDict });
},

// Call this function if you need a full refresh of all search/shortcut badges due
// to a configuration change.
//
// "options.addShortcutBadges" defaults to "true", see TabNormalizer.normalize().
// If you explicitly set it to "false", use TabsStore.addShortcutBadges() to
// add the shortcut badges later.
normalizeAll: function(options) {
	options = optionalWithDefault(options, {});
	let oldTabsDict = optionalWithDefault(options.oldTabsDict, []);

	const logHead = "TabsStore::normalizeAll(): ";
	perfProf.mark("normalizeStart");

	let tabs = this.get();

	this._tabsLoading.reset();
	this._tabsPinnedFromBookmarks.reset();

	for(let i = 0; i < tabs.length; i++) {
		let tab = tabs[i];
		tabNormalizer.normalize(tab, { addShortcutBadges: options.addShortcutBadges, oldTab: oldTabsDict[tab.id] });

		if(tab.status == "loading") {
			this._log(logHead + "found tab in loading status", tab);
			this._tabsLoading.add(tab);
		}
		if(tab.tm.pinInherited != null) {
			this._tabsPinnedFromBookmarks.add(tab, tab.tm.pinInherited.id);
		}
	}
	perfProf.mark("normalizeEnd");
	perfProf.measure("Normalize", "normalizeStart", "normalizeEnd");
},

addShortcutBadges: function() {
	let tabs = this.get();

	for(let i = 0; i < tabs.length; i++) {
		tabNormalizer.addShortcutBadges(tabs[i]);
	}
},

// Overrides TabsStoreBase.reset()
reset: function() {
	this._tabsLoading.reset();
	this._tabsPinnedFromBookmarks.reset();
	Classes.TabsStoreBase.reset.call(this);
},

_addOrUpdateInner: function(newTab, oldTab) {
	const logHead = "TabsStore::_addOrUpdateInner(): ";
	tabNormalizer.normalize(newTab, { oldTab: oldTab });

	if(newTab.status == "loading") {
		this._log(logHead + "found tab in loading status", newTab);
		this._tabsLoading.add(newTab);
	} else {
		this._tabsLoading.removeById(newTab.id);
	}

	if(newTab.tm.pinInherited != null) {
		this._tabsPinnedFromBookmarks.add(newTab, newTab.tm.pinInherited.id);
	} else {
		this._tabsPinnedFromBookmarks.removeById(newTab.id);
	}
},

// Overrides TabsStoreBase.add()
add: function(newTab) {
	Classes.TabsStoreBase.add.call(this, newTab);
	this._addOrUpdateInner(newTab);
},

// tabIdx is optional, defaults to "search it". Use it to pass in the tabIdx
// if you already know it because you called _findTabIndexById() before,
// and avoid another linear search again in this function.
// Overrides TabsStoreBase.update()
update: function(newTab, tabIdx) {
	let oldTab = Classes.TabsStoreBase.update.call(this, newTab, null, tabIdx);
	this._addOrUpdateInner(newTab, oldTab);
	return oldTab;
},

// Returns the tab being removed if "tabId" was found and removed, "null" if not.
// Overrides Classes.TabsStoreBase.removeById().
removeById: function(tabId) {
	let retVal = Classes.TabsStoreBase.removeById.call(this, tabId);

	if(retVal == null) {
		// Not found, nothing to remove
		return null;
	}

	this._tabsLoading.removeById(tabId);
	this._tabsPinnedFromBookmarks.removeById(tabId);

	return retVal;
},

_tabsCmp: function(a, b) {
	// For now let's just use tmUtils.isEqual(), though we know that many of the properties
	// of a tab are actually just computed from other properties, and we could optimize the
	// comparison by including only properties that are not derived from other properties.
	// We start by having this separate function in case we want to add that optimization later.

	return tmUtils.isEqual(a, b, false);
//	let retVal = tmUtils.isEqual(a, b, true);
//	if(!retVal) {
//		this._log("TabsStore::_tabsCmp(): a and b are different", a, b);
//	}
//	return retVal;
},

cloneTabs: function() {
	return tmUtils.deepCopy(this.get());
},

diff: function(oldTabList) {
	let sortByIdFn = function(x, y) {
		if(x.id == y.id) {
			return 0;
		}
		if(x.id < y.id) {
			return -1;
		}
		// It must be "x.id > y.id"
		return 1;
	}

	return tmUtils.arrayDiff(oldTabList, this.get(), sortByIdFn, this._tabsCmp.bind(this));
},

// Returns a dictionary of tabs with status == "loading", keyed by tab ID
getTabsLoading: function() {
	return this._tabsLoading.getDict();
},

// The same bookmark ID could appear multiple times, this function doesn't try
// to guarantee uniqueness.
getPinnedBookmarkIdsFromTabs: function() {
	return this._tabsPinnedFromBookmarks.get();
},

}); // Classes.TabsStore
