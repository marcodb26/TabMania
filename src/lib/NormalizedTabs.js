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

_init: function(tabs) {
	// Overriding the parent class' _init(), but calling that original function first
	Classes.Base._init.call(this);
	this._tabs = optionalWithDefault(tabs, []);
	this._tabsLoading = {};

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
	if(tmUtils.isTabPinned(a) && !tmUtils.isTabPinned(b)) {
		return -1;
	}

	if(tmUtils.isTabPinned(b) && !tmUtils.isTabPinned(a)) {
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

// Find any non alphanumeric character at the beginning of the string, or "www.".
_titleNormalizationPattern: /^(([^a-z0-9]+)|(www\.))/i,
// Static function
//
// To normalize, move everything to upper case, then drop "www." at the beginning
// of each title, since that makes sorting very ugly to watch. Eventually we could
// get more sophisticated with this function (remove articles like "the "), and possibly
// do that in a locale dependent way... but not now.
// "lowerCaseTitle" in input is assumed to already be lower case.
normalizeLowerCaseTitle: function(lowerCaseTitle) {
	return lowerCaseTitle.replace(Classes.NormalizedTabs._titleNormalizationPattern, "");
},

// Static function
cleanupTitle: function(title, url) {
	const logHead = "NormalizedTabs.cleanupTitle(" + url + "): ";

	if(url == null || !url.startsWith("chrome://bookmarks/?id=")) {
		return title;
	}

	// "chrome://bookmarks/?id=123" is the URL that displays a bookmarks (or
	// bookmark folder), which has title "Bookmarks", not very informative.
	// We want to add the name of the bookmark/folder to it.

	if(title != "Bookmarks") {
		// We expected the original title to be "Bookmarks", if it's not, we don't
		// necessarily know what's going on (though typically this means we've
		// already called this function on this tab in a previous iteration), so
		// let's not touch anything
		return title;
	}

	let split = url.split("=");
	if(split.length < 2) {
		// Not able to parse...
		return title;
	}

	// "+split[1]" means convert the string to a number. Since in the general case
	// that's not guaranteed to work (in case the url is messed up and "split[1]"
	// is not actually a number), then we want to protect this code with a try/catch.
	let bmNode = null;
	try {
		bmNode = bookmarksManager.getBmNode(+split[1]);
	} catch(e) {
		return title;
	}

	if(bmNode == null) {
		// If this is a folder, it might eventually get loaded, we don't want
		// to bother trying loading it here, this cleanup is just best effort
		return title;
	}

	let type = "Folder";
	if(bmNode.url != null) {
		// Note that thees URLs right now seem to exist only for folders, if you try
		// to craft the same URL with a non-folder bookmark ID in it, Chrome immediately
		// redirects you to "chrome://bookmarks". But just in case this behavior
		// changes later...
		type = "Bookmark";
	}

	return `${title} - ${type} "${bmNode.title}"`;
},

// Static function
formatExtendedId: function(tab, objType) {
	if(tab.tm != null) {
		objType = optionalWithDefault(objType, tab.tm.type);
	}
	// Even if "tab.tm != null", tab.tm.type could still be undefined, and the next
	// iteration of optionalWithDefault() will correct that
	objType = optionalWithDefault(objType, Classes.NormalizedTabs.type.TAB);

	switch(objType) {
		case Classes.NormalizedTabs.type.TAB:
			return tab.windowId + ":" + tab.id + "/" + tab.index;

		case Classes.NormalizedTabs.type.RCTAB:
			// Can use "tab.id", as it's already been prefixed for uniqueness by the
			// time this function gets called
			return "rc[" + tab.sessionId + "]";

		case Classes.NormalizedTabs.type.BOOKMARK:
			// Extended ID for bookmark: "bm[10.36]" (or "bm[.36]" for bookmarks with
			// no parent).
			// Note that we've explicitly chosen a different format from that of tab extended
			// IDs because we want to make it easier to search specifically for just bookmark
			// IDs, or just for tab IDs (e.g., the text ".36" will only target a bookmark with
			// ID "36" (though you can't search it as a standalone keyword) while the text ":36"
			// will only target a tab with ID 36).
			return "bm[" + ((tab.parentId != null) ? tab.parentId : "") + "." + tab.bookmarkId + "]";

		case Classes.NormalizedTabs.type.HISTORY:
			return "h[" + tab.historyId + "]";

		default:
			const logHead = "NormalizedTabs::formatExtendedId(): ";
			tmUtils.err(logHead + "unknown objType", objType, tab);
			break;
	}

	return "[none]";
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
		// Another discrepancy besides "loaded" instead of "complete", it seems
		// like "discard" is a well known term than "suspend" for this action,
		// even though "suspend" doesn't seem that accurate... anyway let's
		// go with the flow
		this._addNormalizedVisualBadge(tab, "suspended", false);
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

	if(tmUtils.isTabPinned(tab)) {
		this._addNormalizedVisualBadge(tab, "pinned", false);
	}

	if(tab.tm.customGroupName != null) {
		// We're adding the badge as a search-only badge (not visible) because
		// the TileViewer has special logic to render this badge in the color
		// of the custom group, based on tab.tm.customGroupName
		this._addNormalizedVisualBadge(tab, tab.tm.customGroupName, false);
		tab.tm.customGroupBadges.push(tab.tm.customGroupName.toLowerCase());
	}

	// We always want this to appear last, if the user configured it to be visible
	this._addNormalizedVisualBadge(tab, tab.tm.extId, settingsStore.getOptionShowTabId());
},

updateBookmarkBadges: function(tab) {
	// Now that we have BookmarksManager we don't need to rely on chrome.bookmarks.search(),
	// and that means we can also allow users to search the "bookmark" keyword in badges
	tab.tm.searchBadges.push("bookmark");

	if(tab.tm.customGroupName != null) {
		// We're adding the badge as a search-only badge (not visible) because
		// the TileViewer has special logic to render this badge in the color
		// of the custom group, based on tab.tm.customGroupName
		this._addNormalizedVisualBadge(tab, tab.tm.customGroupName, false);
		tab.tm.customGroupBadges.push(tab.tm.customGroupName.toLowerCase());
	}

	if(tmUtils.isTabPinned(tab)) {
		this._addNormalizedVisualBadge(tab, "pinned", false);
	}

	// We always want this to appear last, if the user configured it to be visible
	this._addNormalizedVisualBadge(tab, tab.tm.extId, settingsStore.getOptionShowTabId());
},

updateHistoryBadges: function(tab) {
//	// Don't add "visited" to the search badges, users can't search with the
//	// "visited" keyword, we don't start with the full list of history items
//	this._addNormalizedVisualBadge(tab, "visited", false);

	if(tab.tm.customGroupName != null) {
		// We're adding the badge as a search-only badge (not visible) because
		// the TileViewer has special logic to render this badge in the color
		// of the custom group, based on tab.tm.customGroupName
		this._addNormalizedVisualBadge(tab, tab.tm.customGroupName, false);
		tab.tm.customGroupBadges.push(tab.tm.customGroupName.toLowerCase());
	}

	// We always want this to appear last, if the user configured it to be visible
	this._addNormalizedVisualBadge(tab, tab.tm.extId, settingsStore.getOptionShowTabId());
},

// Static function
buildCachedFavIconUrl: function(url) {
	// See https://stackoverflow.com/questions/10665321/reliably-getting-favicons-in-chrome-extensions-chrome-favicon
	return "chrome://favicon/size/16@1x/" + url;
},

isCachedFavIconUrl: function(favIconUrl) {
	return favIconUrl.startsWith("chrome://favicon/size/16@1x/");
},

// Static function
normalizeBookmarkId : function(id) {
	return "b" + id;
},

// This is a static function called by normalizeTab(). Don't use "this" here.
_initBookmarkAsTab: function(tab) {
	// We want each "BookmarkTreeNode" to be as similar as possible to a "tab" object...
	// It already includes "title" and "url".
	// It also includes an "id", but the numeric space for that ID seems to overlap with
	// the space used by tabs, so we need to add a prefix (technically the BookmarkTreeNode
	// "id" is a string, while the tab "id" is a number, but they both get turned to the same
	// type (either string or number) anyway during processing...).
	// We want to add favIconUrl, a compatible "status" to render the bookmarks in
	// black&while like we render unloaded tabs, and some of the other things we get
	// from NormalizedTabs.normalizeTab().

	// Add a prefix to the id. This is safe because we never need to map this id back to
	// its original value to work with chrome.bookmarks events. We also want to save the
	// original ID in case we need it for some of the chrome.history functions.
	tab.bookmarkId = tab.id;
	tab.id = Classes.NormalizedTabs.normalizeBookmarkId(tab.id);

	tab.status = "unloaded";
},

// Static function
normalizeHistoryItemId : function(id) {
	return "h" + id;
},

// This is a static function called by normalizeTab(). Don't use "this" here.
_initHistoryItemAsTab: function(tab) {
	// We want each "HistoryItem" to be as similar as possible to a "tab" object...
	// It already includes "title" and "url".
	// It also includes an "id", but the numeric space for that ID overlaps with
	// the space used by tabs.
	// We want to add favIconUrl, a compatible "status" to render the history item in
	// black&while like we render unloaded tabs, and some of the other things we get
	// from NormalizedTabs.normalizeTab().

	// Add a prefix to the id. This is safe because we never need to map this id back to
	// its original value to work with chrome.history events. We also want to save the
	// original ID in case we need it for some of the chrome.history functions.
	tab.historyId = tab.id;
	tab.id = Classes.NormalizedTabs.normalizeHistoryItemId(tab.id);

	tab.status = "unloaded";
},

// Static function
normalizeRecentlyClosedId : function(id) {
	return "c" + id;
},

// This is a static function called by normalizeTab(). Don't use "this" here.
_initRecentlyClosedAsTab: function(tab) {
	// We want each recently closed tab to be as similar as possible to a tab object...
	// It seems to already include everything except for "id" and "status".

	// See _assert() in TabsBsTabViewer._recentlyClosedNormalize() for why we're taking this action
	tab.active = false;

	// Using sessionId for tab.id is probably going to generate some duplicated tab IDs, so
	// we're adding a prefix to the id. This is safe because we never need to map this id back to
	// its original value to work with chrome.sessions events.
	// Note that in this case we don't need to save the original ID, "sessionId" is already
	// a different property from "id".
	tab.id = Classes.NormalizedTabs.normalizeRecentlyClosedId(tab.sessionId);

	tab.status = "unloaded";
},

// This function can be used as a static function of the class, it doesn't need any state
// from "this".
//
// "tab" can be either a tab object or a bookmark node object, determined by "objType".
// "objType" is one of Classes.NormalizedTabs.type, default to Classes.NormalizedTabs.type.TAB
//
// For historical reasons, standard tabs can call normalizeTab() on tabs that have already been
// normalized once before (see TabsBsTabViewer._queryAndRenderTabs()). It's not clear to me whether
// that's really necessary, or a separate function "update badges for shortcuts"() would be
// sufficient instead. Anyway the problem is that we definitely CANNOT call this function more
// than once for any other "objType", if nothing else because this function changes the "id" field,
// and changing the id field using an id that's already been changed is not going to work. Plus,
// there might be other things that break, who knows.
// Ideally we'd want to fix the issue with standard tabs and always claim this function is
// "once only" for all "objType", but for lack of time, let's just differentiate by "objType"
// for now and apply separate rules to standard tabs and other classes of nodes.
normalizeTab: function(tab, objType) {
	// If the "tab" already has its objType, then it's already initialized and
	// we must not call this function for it, except for standard tabs (see comment
	// just above).
	if(tab.tm != null && tab.tm.type != null && tab.tm.type != Classes.NormalizedTabs.type.TAB) {
		return;
	}

	objType = optionalWithDefault(objType, Classes.NormalizedTabs.type.TAB);

	const logHead = "NormalizedTabs::normalizeTab(): ";

	// Technically we can use "this" for a static function, to bring up the context
	// of the static function, but using a slightly different mnemonic can be a useful
	// reminder that the context is the class, not an instance of the class.
	let thisObj = Classes.NormalizedTabs;

	// We need a "switch()" both at the beginning and at the end of this function.
	// At the beginning, we need to make sure all fields used by the logic in the
	// center are properly initialized, at the end, we run all pieces that depend
	// on "tab.tm" having been created in the central logic.
	switch(objType) {
		case Classes.NormalizedTabs.type.TAB:
			// Standard tabs are the main stars of this show, and they're already
			// initialized correctly. Everything else needs to be initialized to
			// look as much as possible like standard tabs
			break;
		case Classes.NormalizedTabs.type.RCTAB:
			thisObj._initRecentlyClosedAsTab(tab);
			break;
		case Classes.NormalizedTabs.type.BOOKMARK:
			thisObj._initBookmarkAsTab(tab);
			break;
		case Classes.NormalizedTabs.type.HISTORY:
			thisObj._initHistoryItemAsTab(tab);
			break;
		default:
			// "tmUtils.err()" is the version of "this._err()" to be used in
			// static functions
			tmUtils.err(logHead + "unknown objType", objType);
			break;
	}

	// Sometimes "tab.url" is empty, because "tab.pendingUrl" is still loading.
	// But in some cases, tab.url is empty, and tab.pendingUrl doesn't even exist,
	// so we use optionalWithDefault() to cover that last corner case.
	let url = optionalWithDefault((tab.url != "") ? tab.url : tab.pendingUrl, "");

	tab.title = thisObj.cleanupTitle(tab.title, url);

	let lowerCaseTitle = tab.title.toLowerCase();
	let [ protocol, hostname ] = thisObj.getProtocolHostname(url);

	// Bookmarks and history have no favIconUrl, but sometimes recently closed and
	// standard tabs also don't have favIconUrl, so let's just try the cache here
	// for all these cases...
	let useCachedFavIcon = false;
	const cachedFavIconUrl = Classes.NormalizedTabs.buildCachedFavIconUrl(url);
	if(tab.favIconUrl == null || tab.favIconUrl == "") {
		tab.favIconUrl = cachedFavIconUrl;
		useCachedFavIcon = true;
	}

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
		normTitle: thisObj.normalizeLowerCaseTitle(lowerCaseTitle),
		useCachedFavIcon: useCachedFavIcon,
		cachedFavIconUrl: cachedFavIconUrl,
		// "folder" is non empty only for bookmarks, but to make the search
		// logic easier, we want to make it non-null for all tabs
		folder: "",
		lowerCaseFolder: "",
		// Bookmarks have extended IDs too
		extId: thisObj.formatExtendedId(tab, objType),

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
		// We track custom group names both in searchBadges and customGroupBadges.
		// The duplication is required to support the "group:" unaryOp modifier
		// in search (see SearchQuery._evaluateTextNode()).
		customGroupBadges: [],

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
			thisObj.updateShortcutBadges(tab);
			thisObj.updateSearchBadges(tab);
			break;
		case Classes.NormalizedTabs.type.RCTAB:
			// No shortcut badges for Recently Closed Tabs
			thisObj.updateSearchBadges(tab);
			break;
		case Classes.NormalizedTabs.type.BOOKMARK:
			let folder = bookmarksManager.getBmFolderSync(tab);
			if(folder != null) {
				// Best effort, we only try the sync version, we don't want to wait for
				// the async version to fill this out
				tab.tm.folder = folder;
				tab.tm.lowerCaseFolder = folder.toLowerCase();
			} else {
				tmUtils.log(logHead + "folder not available for", tab);
			}
			thisObj.updateBookmarkBadges(tab);
			break;
		case Classes.NormalizedTabs.type.HISTORY:
			thisObj.updateHistoryBadges(tab);
			break;
		default:
			tmUtils.err(logHead + "unknown objType", objType);
			break;
	}
},

// Call this function if you need a full refresh of all search/shortcut badges due
// to a configuration change
normalizeAll: function() {
	const logHead = "NormalizedTabs::normalizeAll(): ";
	perfProf.mark("normalizeStart");

	this._tabsLoading = {};

	for(let i = 0; i < this._tabs.length; i++) {
		let tab = this._tabs[i];
		this.normalizeTab(tab);
		if(tab.status == "loading") {
			this._log(logHead + "found tab in loading status", tab);
			this._tabsLoading[tab.id] = tab;
		}
	}
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
	const logHead = "NormalizedTabs:: updatetab(): ";
	this.normalizeTab(newTab);

	if(newTab.status == "loading") {
		this._log(logHead + "found tab in loading status", newTab);
		this._tabsLoading[newTab.id] = newTab;
	} else {
		if(newTab.id in this._tabsLoading) {
			delete this._tabsLoading[newTab.id];
		}
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

// Returns a dictionary of tabs with status == "loading", keyed by tab ID
getTabsLoading: function() {
	return this._tabsLoading;
},

}); // Classes.NormalizedTabs

Classes.Base.roDef(Classes.NormalizedTabs, "type", {} );
Classes.Base.roDef(Classes.NormalizedTabs.type, "TAB", "tab" );
// RCTAB == "Recently Closed TAB"
Classes.Base.roDef(Classes.NormalizedTabs.type, "RCTAB", "rctab" );
Classes.Base.roDef(Classes.NormalizedTabs.type, "BOOKMARK", "bookmark" );
Classes.Base.roDef(Classes.NormalizedTabs.type, "HISTORY", "history" );