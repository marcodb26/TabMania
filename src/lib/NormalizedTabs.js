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

	// "_tabsLoading" is a dictionary of all tabs in status "loading", keyed by tab ID
	_tabsLoading: null,

	// "_tabsPinnedFromBookmarks" is a dictionary of all tabs that have inherited pinning from
	// a bookmark
	_tabsPinnedFromBookmarks: null,

// If you choose to initialize "tabs" at creation time, remember to also explicitly call
// NormalizedTabs.addShortcutBadges() afterwards, as the initializer doesn't do that.
// See TabsManager._queryTabs() for the reasons why.
_init: function(tabs) {
	// Overriding the parent class' _init(), but calling that original function first
	Classes.Base._init.call(this);
	this._tabs = optionalWithDefault(tabs, []);

	this._tabsLoading = Classes.TabsStore.create();
	this._tabsPinnedFromBookmarks = Classes.TabsStore.create();

	this.debug();

	this.normalizeAll(false);
},

// Call this function if you need a full refresh of all search/shortcut badges due
// to a configuration change.
//
// "addShortcutBadges" defaults to "true", see TabNormalizer::normalizeTab().
// If you explicitly set it to "false", use NormalizedTabs::addShortcutBadges() to
// add the shortcut badges later.
normalizeAll: function(addShortcutBadges) {
	const logHead = "NormalizedTabs::normalizeAll(): ";
	perfProf.mark("normalizeStart");

	this._tabsLoading.reset();
	this._tabsPinnedFromBookmarks.reset();

	for(let i = 0; i < this._tabs.length; i++) {
		let tab = this._tabs[i];
		tabNormalizer.normalizeTab(tab, null, addShortcutBadges);
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
	for(let i = 0; i < this._tabs.length; i++) {
		tabNormalizer.addShortcutBadges(this._tabs[i]);
	}
},

// Since the tabs are normalized at initialization, this function always
// returns the normalized tabs
getTabs: function() {
	return this._tabs;
},

cloneTabs: function() {
	return tmUtils.deepCopy(this.getTabs());
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
	const logHead = "NormalizedTabs:: updatetab(): ";
	tabNormalizer.normalizeTab(newTab);

	if(newTab.status == "loading") {
		this._log(logHead + "found tab in loading status", newTab);
		this._tabsLoading.add(newTab);
	} else {
		this.removeTabsLoadingTab(newTab.id);
	}

	if(newTab.tm.pinInherited != null) {
		this._tabsPinnedFromBookmarks.add(newTab, newTab.tm.pinInherited.id);
	} else {
		this._tabsPinnedFromBookmarks.removeById(newTab.id);
	}

	tabIdx = optionalWithDefault(tabIdx, this.getTabIndexByTabId(newTab.id));

	if(tabIdx == -1) {
		// Add new tab at the end
		this._tabs.push(newTab);
	} else {
		// Replace current entry with new info
		this._tabs[tabIdx] = newTab;
	}
},

// Returns the tab being removed if "tabId" was found and removed, "null" if not
removeTabById: function(tabId) {
	let tabIdx = this.getTabIndexByTabId(tabId);

	if(tabIdx == -1) {
		// Not found, nothing to remove
		return null;
	}

	this.removeTabsLoadingTab(tabId);
	this._tabsPinnedFromBookmarks.removeById(tabId);
	let retVal = this._tabs[tabIdx];
	this._tabs.splice(tabIdx, 1);

	return retVal;
},

_tabsCmp: function(a, b) {
	// For now let's just use tmUtils.isEqual(), though we know that many of the properties
	// of a tab are actually just computed from other properties, and we could optimize the
	// comparison by including only properties that are not derived from other properties.
	// We start by having this separate function in case we want to add that optimization later.

	return tmUtils.isEqual(a, b, true);
//	let retVal = tmUtils.isEqual(a, b);
//	if(!retVal) {
//		this._log("NormalizedTabs::_tabsCmp(): a and b are different", a, b);
//	}
//	return retVal;
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

	return tmUtils.arrayDiff(oldTabList, this.getTabs(), sortByIdFn, this._tabsCmp.bind(this));
},

// Returns a dictionary of tabs with status == "loading", keyed by tab ID
getTabsLoading: function() {
	return this._tabsLoading.get();
},

// The same bookmark ID could appear multiple times, this function doesn't try
// to guarantee uniqueness.
getPinnedBookmarkIdsFromTabs: function() {
	return this._tabsPinnedFromBookmarks.getTabValueList();
},

removeTabsLoadingTab: function(tabId) {
	this._tabsLoading.removeById(tabId);
}

}); // Classes.NormalizedTabs


// CLASS TabsStore
Classes.TabsStore = Classes.Base.subclass({

	_dict: null,

_init: function() {
	// Overriding the parent class' _init(), but calling that original function first
	Classes.Base._init.call(this);
	this.debug();

	this.reset();
},

reset: function() {
	this._dict = {};
},

// "value" defaults to "tab"
add: function(tab, value) {
	this._dict[tab.id] = optionalWithDefault(value, tab);
},

removeById: function(tabId) {
	if(tabId in this._dict) {
		delete this._dict[tabId];
	}
},

get: function() {
	return this._dict;
},

getTabIdList: function() {
	return Object.keys(this._dict);
},

getTabValueList: function() {
	return Object.values(this._dict);
},

}); // Classes.TabsStore