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
formatExtendedId: function(tab, objType) {
	if(tab.tm != null) {
		objType = optionalWithDefault(objType, tab.tm.type);
	}
	// Even if "tab.tm != null", tab.tm.type could still be undefined, and the next
	// iteration of optionalWithDefault() will correct that
	objType = optionalWithDefault(objType, Classes.NormalizedTabs.type.TAB);

	if(objType == Classes.NormalizedTabs.type.TAB) {
		return tab.windowId + ":" + tab.id + "/" + tab.index;
	}

	if(objType == Classes.NormalizedTabs.type.RCTAB) {
		return "rc[" + tab.id + "]";
	}

	// Extended ID for bookmark: "bm[10.36]" (or "bm[.36]" for bookmarks with
	// no parent).
	// Note that we've explicitly chosen a different format from that of tab extended
	// IDs because we want to make it easier to search specifically for just bookmark
	// IDs, or just for tab IDs (e.g., the text ".36" will only target a bookmark with
	// ID "36" (though you can't search it as a standalone keyword) while the text ":36"
	// will only target a tab with ID 36).
	return "bm[" + ((tab.parentId != null) ? tab.parentId : "") + "." + tab.id + "]";
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

	if(tab.tm.type == Classes.NormalizedTabs.type.RCTAB) {
		this._addNormalizedVisualBadge(tab, "closed", false);
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

	if(tab.mutedInfo != null && tab.mutedInfo.muted) {
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
		// We're adding the badge as a search-only badge (not visible) because
		// the TileViewer has special logic to render this badge in the color
		// of the custom group, based on tab.tm.customGroupName
		this._addNormalizedVisualBadge(tab, tab.tm.customGroupName, false);
	}

	// We always want this to appear last, if the user configured it to be visible
	this._addNormalizedVisualBadge(tab, tab.tm.extId, settingsStore.getOptionShowTabId());
},

updateBookmarkBadges: function(tab) {
//	// Don't add "bookmark" to the search badges, users can't search with the
//	// "bookmark" keyword, we don't start with the full list of bookmarks
//	tab.tm.visualBadges.push("bookmark");

	if(tab.tm.customGroupName != null) {
		// We're adding the badge as a search-only badge (not visible) because
		// the TileViewer has special logic to render this badge in the color
		// of the custom group, based on tab.tm.customGroupName
		this._addNormalizedVisualBadge(tab, tab.tm.customGroupName, false);
	}

	// We always want this to appear last, if the user configured it to be visible
	this._addNormalizedVisualBadge(tab, tab.tm.extId, settingsStore.getOptionShowTabId());
},
	
// This function can be used as a static function of the class, it doesn't need any state
// from "this".
//
// "tab" can be either a tab object or a bookmark node object, determined by "objType".
// "objType" is one of Classes.NormalizedTabs.type, default to Classes.NormalizedTabs.type.TAB
normalizeTab: function(tab, objType) {
	objType = optionalWithDefault(objType, Classes.NormalizedTabs.type.TAB);

	const logHead = "NormalizedTabs::normalizeTab(): ";

	// Sometimes "tab.url" is empty, because "tab.pendingUrl" is still loading.
	// But in some cases, tab.url is empty, and tab.pendingUrl doesn't even exist,
	// so we use optionalWithDefault() to cover that last corner case.
	let url = optionalWithDefault((tab.url != "") ? tab.url : tab.pendingUrl, "");
	let lowerCaseTitle = tab.title.toLowerCase();
	let [ protocol, hostname ] = Classes.NormalizedTabs.getProtocolHostname(url);

	tab.tm = {
		type: objType,

		// We could use "this" here, but since we decided these
		// we're invoking are static functions, let's follow through
		// with that
		protocol: protocol,
		hostname: hostname,
		// Bookmarks can be part of a custom group, why not?
		customGroupName: settingsStore.getCustomGroupsManager().getCustomGroupByHostname(hostname),
		lowerCaseUrl: url.toLowerCase(),
		lowerCaseTitle: lowerCaseTitle,
		normTitle: Classes.NormalizedTabs.normalizeLowerCaseTitle(lowerCaseTitle),
		// Bookmarks have extended IDs too
		extId: Classes.NormalizedTabs.formatExtendedId(tab, objType),

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

	switch(objType) {
		case Classes.NormalizedTabs.type.TAB:
			// Bookmarks don't need search badges, because they're inserted in the flow
			// through chrome.bookmarks.search() (that is, post search).
			// Bookmarks also don't need shortcut badges because they can't be invoked
			// via custom shortcuts (though the URL in a custom shortcut could match
			// the URL of a bookmark, they're slightly different things, let's not mix
			// them up).
			this.updateShortcutBadges(tab);
			this.updateSearchBadges(tab);
			break;
		case Classes.NormalizedTabs.type.RCTAB:
			// No shortcut badges for Recently Closed Tabs
			this.updateSearchBadges(tab);
			break;
		case Classes.NormalizedTabs.type.BOOKMARK:
			this.updateBookmarkBadges(tab);
			break;
		default:
			this._err(logHead + "unknown objType", objType);
			break;
	}
},

// Call this function if you need a full refresh of all search/shortcut badges due
// to a configuration change
normalizeAll: function() {
	perfProf.mark("normalizeStart");
	this._tabs.forEach(
		// Don't just pass "this.normalizeTab.bind(this)", because forEach adds extra
		// arguments after the "tab" argument, and they conflict with the "objType"
		// of normalizeTab.
		function(tab) {
			this.normalizeTab(tab);
		}.bind(this)
	);
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

Classes.Base.roDef(Classes.NormalizedTabs, "type", {} );
Classes.Base.roDef(Classes.NormalizedTabs.type, "TAB", "tab" );
// RCTAB == "Recently Closed TAB"
Classes.Base.roDef(Classes.NormalizedTabs.type, "RCTAB", "rctab" );
Classes.Base.roDef(Classes.NormalizedTabs.type, "BOOKMARK", "bookmark" );