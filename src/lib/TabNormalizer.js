// CLASS TabNormalizer
//
// A "tab" includes all properties listed here:
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
Classes.TabNormalizer = Classes.Base.subclass({

_init: function() {
	// Overriding the parent class' _init(), but calling that original function first
	Classes.Base._init.call(this);

	this.debug();
},

// Static function
//
// See https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/sort
// Return -1 if a < b, 0 if a == b and 1 if b < a
// Titles are compared case insensitive.
compareTitlesFn: function(a, b) {
	// See https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/localeCompare
	// Eventually we should also specify the locale configured for the browser, but not now...
	return a.tm.sortTitle.localeCompare(b.tm.sortTitle);
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
	return Classes.TabNormalizer.compareTitlesFn(a, b);
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

// To normalize, move everything to lower case, then drop "www." at the beginning
// of each title, since that makes sorting very ugly to watch. Eventually we could
// get more sophisticated with this function (remove articles like "the "), and possibly
// do that in a locale dependent way... but not now.
// "lowerCaseTitle" in input is assumed to already be lower case.
normalizeLowerCaseTitle: function(lowerCaseTitle) {
	return lowerCaseTitle.replace(this._titleNormalizationPattern, "");
},

_cleanupChromeBookmarksManagerTitle: function(title, url) {
	if(!url.startsWith("chrome://bookmarks/?id=")) {
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

_cleanupTitle: function(title, url) {
	const logHead = "TabNormalizer._cleanupTitle(" + url + "): ";

	if(url == null) {
		return title;
	}

	if(title == "") {
		// Some browsing history items seem to have no title. When that happens, let's
		// just set the URL as title.
		return url;
	}

	return this._cleanupChromeBookmarksManagerTitle(title, url);
},

updateUrl: function(tab) {
	// Sometimes "tab.url" is empty, because "tab.pendingUrl" is still loading.
	// But in some cases, tab.url is empty, and tab.pendingUrl doesn't even exist,
	// so we use optionalWithDefault() to cover that last corner case.
	let url = optionalWithDefault((tab.url != "") ? tab.url : tab.pendingUrl, "");

	let [ protocol, hostname ] = this.getProtocolHostname(url);

	// We want to leave the tab.url as it's been originally given to us, but since we're
	// potentially working on tab.pendingUrl instead of tab.url, let's store in "tab.tm.url"
	// the URL we've actually used, wherever it was from
	tab.tm.url = url;
	tab.tm.protocol = protocol;
	tab.tm.hostname = hostname;
	// Bookmarks can be part of a custom group, why not?
	tab.tm.customGroupName = settingsStore.getCustomGroupsManager().getCustomGroupByHostname(hostname);
	tab.tm.lowerCaseUrl = url.toLowerCase();
},

// If you're updating both title and URL, make sure to call updateUrl() first, as this
// function depends on the right URL being in place.
updateTitle: function(tab, oldTab) {
	tab.title = this._cleanupTitle(tab.title, tab.tm.url);
	let lowerCaseTitle = tab.title.toLowerCase();

	tab.tm.lowerCaseTitle = lowerCaseTitle;

	// Note we're not putting the extra check for "tm.url": if a tab is loading a new URL,
	// we want the sorting to change only at the end of the loading cycle, so the user watching
	// the tile can be informed of what the new title is before the tile moves (and can search
	// for it again).
	// Change the check (uncomment the commented check) to let new pages move immediately to
	// their new location in the tile list.
//	if(oldTab != null && tab.status == "loading" && tab.tm.url == oldTab.tm.url) {
	if(oldTab != null && tab.status == "loading") {
		// As long as tab.status == "loading", let's keep tm.sortTitle set to the last
		// title before we entered "loading" status.
		tab.tm.sortTitle = oldTab.tm.sortTitle;
	} else {
		tab.tm.sortTitle = this.normalizeLowerCaseTitle(lowerCaseTitle);
	}
},

// If you're updating both favIcon and URL, make sure to call updateUrl() first, as this
// function depends on the right URL being in place.
_updateFavIcon: function(tab) {
	let useCachedFavIcon = false;
	const cachedFavIconUrl = this.buildCachedFavIconUrl(tab.tm.url);
	if(tab.favIconUrl == null || tab.favIconUrl == "") {
		tab.favIconUrl = cachedFavIconUrl;
		useCachedFavIcon = true;
	}

	tab.tm.useCachedFavIcon = useCachedFavIcon;
	tab.tm.cachedFavIconUrl = cachedFavIconUrl;
},

formatExtendedId: function(tab, type) {
	if(tab.tm != null) {
		type = optionalWithDefault(type, tab.tm.type);
	}
	// Even if "tab.tm != null", tab.tm.type could still be undefined, and the next
	// iteration of optionalWithDefault() will correct that
	type = optionalWithDefault(type, Classes.TabNormalizer.type.TAB);

	switch(type) {
		case Classes.TabNormalizer.type.TAB:
			return tab.windowId + ":" + tab.id + "/" + tab.index;

		case Classes.TabNormalizer.type.RCTAB:
			// Can use "tab.id", as it's already been prefixed for uniqueness by the
			// time this function gets called
			return "rc[" + tab.sessionId + "]";

		case Classes.TabNormalizer.type.BOOKMARK:
			// Extended ID for bookmark: "bm[10.36]" (or "bm[.36]" for bookmarks with
			// no parent).
			// Note that we've explicitly chosen a different format from that of tab extended
			// IDs because we want to make it easier to search specifically for just bookmark
			// IDs, or just for tab IDs (e.g., the text ".36" will only target a bookmark with
			// ID "36" (though you can't search it as a standalone keyword) while the text ":36"
			// will only target a tab with ID 36).
			return "bm[" + ((tab.parentId != null) ? tab.parentId : "") + "." + tab.bookmarkId + "]";

		case Classes.TabNormalizer.type.HISTORY:
			return "h[" + tab.historyId + "]";

		default:
			const logHead = "TabNormalizer::formatExtendedId(): ";
			this._err(logHead + "unknown type", type, tab);
			break;
	}

	return "[none]";
},

_addNormalizedShortcutBadges: function(tab, secondary) {
	//const logHead = "TabNormalizer::_addNormalizedShortcutBadges(" + tab.tm.hostname + "): ";

	let sm = settingsStore.getShortcutsManager();
	let scKeys = sm.getShortcutKeysForTab(tab, !secondary);

	let array = tab.tm.primaryShortcutBadges;
	if(secondary) {
		array = tab.tm.secondaryShortcutBadges;
	}

	scKeys.forEach(
		function(key) {
			let keyAsString = sm.keyToUiString(key);
			// See description in normalize() for why we add these badges
			// in two places
			array.push(keyAsString);
			tab.tm.searchBadges.push(keyAsString.toLowerCase());
		}.bind(this)
	);
},

addShortcutBadges: function(tab) {
	const logHead = "TabNormalizer::addShortcutBadges(): ";

	if(tab.tm.type != Classes.TabNormalizer.type.TAB) {
		this._err(logHead + "this function can only be called for standard tabs");
		// Bookmarks don't need shortcut badges because they can't be invoked
		// via custom shortcuts (though the URL in a custom shortcut could match
		// the URL of a bookmark, they're slightly different things, let's not mix
		// them up).
		return;
	}

	if(tab.tm.primaryShortcutBadges.length != 0 || tab.tm.secondaryShortcutBadges.length != 0) {
		this._err(logHead + "this function can only be called once after normalize()");
		// Shortcut badges need to be updated visually in "tab.tm.primary/secondaryShortcutBadges",
		// and lowercase to aid search in "searchBadges". The current logic could easily replace
		// "tab.tm.primary/secondaryShortcutBadges", but it can't easily replace pieces of
		// "searchBadges". The assumption should be ok, as long as every shortcuts update is
		// forced to trigger a full re-render.
		return;
	}

	// First candidates
	this._addNormalizedShortcutBadges(tab, false);
	// Not first candidate next
	this._addNormalizedShortcutBadges(tab, true);
},

// The badges need to be normalized to lower case to properly support
// case insensitive search.
// "visible" determines whether the search badge will be visible or hidden,
// see normalize() for details.
_addNormalizedVisualBadge: function(tab, badge, visible) {
	visible = optionalWithDefault(visible, true);

	if(visible) {
		tab.tm.visualBadges.push(badge);
	}

	tab.tm.searchBadges.push(badge.toLowerCase());
},

_updateSearchBadges: function(tab) {
	if(tab.active) {
		this._addNormalizedVisualBadge(tab, "active");
	}

	if(tab.audible) {
		this._addNormalizedVisualBadge(tab, "audible", false);
	}

	if(tab.discarded) {
		// Another discrepancy besides "loaded" instead of "complete", it seems
		// like "discard" is not as well known a term as "suspend" for this action,
		// even though "suspend" doesn't seem that accurate... anyway let's
		// go with the flow
		this._addNormalizedVisualBadge(tab, "suspended", false);
	}

	if(tab.tm.type == Classes.TabNormalizer.type.RCTAB) {
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

	// All statuses are only hidden search badges, and visual clues are provided in the
	// tile rendering logic:
	// - "unloaded": tile in black&white
	// - "loaded": no special clue, standard rendering
	// - "loading": the favIcon is shrunk and surrounded by the throbber/spinner
	this._addNormalizedVisualBadge(tab, tab.status, false);

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

_updateBookmarkBadges: function(tab) {
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

_updateHistoryBadges: function(tab) {
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

// Note that you can use this function with "url" as an empty string to get a last resort
// URL that renders to the default Chrome favIcon for sites without a favIcon.
// See GroupBuilder._findFavIconUrl() for an explanation for this "last resort URL".
buildCachedFavIconUrl: function(url) {
	// See https://stackoverflow.com/questions/10665321/reliably-getting-favicons-in-chrome-extensions-chrome-favicon
	return "chrome://favicon/size/16@1x/" + url;
},

isCachedFavIconUrl: function(favIconUrl) {
	return favIconUrl.startsWith("chrome://favicon/size/16@1x/");
},

_isTabMatchingBookmark: function(tab, bmNode) {
	// By construction (see updateUrl()), "tab.tm.url" is always the best URL (either
	// tab.url or tab.pendingUrl), and worst case it's an empty string, but never null.
	if(tab.tm.url != "") {
		return tab.tm.url.startsWith(bmNode.url);
	}
	return false;
},

_setPinInheritance: function(tab, bmNode) {
	tab.tm.pinInherited = {
		type: "bookmark",
		id: bmNode.bookmarkId,
	};

	// A little trick here. When a tab loads, initially its title its set to
	// its URL. Unfortunately that means that from a tile perspective, the tile
	// of the tab will be sorted to a different location when the user clicks
	// on the pinned bookmark to activate the tab. So it looks like the tile
	// disappears for a while, then it comes back, and that is visually ugly.
	// This little trick forces the "title" of a tab to be the same as the title
	// of the pinned bookmark while the tab is loading and its title has not been
	// settled yet. Once the title of the tab settles, we stop overwriting it with
	// the title of the pinned bookmark. Note that there's no guarantee the tile
	// will stick in place once you load the tab from the pinned bookmark, because
	// the title of the pinned bookmark could have been edited by the user, or the
	// title of the website could have changed since the time the bookmark was saved.
	//
	// Note the choice of "tab.url.includes(tab.title)" instead of "tab.url == tab.title",
	// because when the tab is loading, if the URL is "https://www.google.com/", the
	// title gets set to "https://www.google.com" without the trailing "/", just
	// to make life a little more interesting...
	// Note also that we tried to restrict this logic to 'tab.status == "loading"',
	// but as it turns out when "tab.status" switches to "complete" the title is
	// still bogus for a while...
	if(tab.title == "" || tab.url.includes(tab.title) || tab.title == tab.pendingUrl) {
		tab.title = bmNode.title;
	}
},

// Add pin inheritance information to tabs that are mapped to pinned bookmarks,
// and possibly clean up the title of the tab when necessary (see _setPinInheritance()
// for details).
_updatePinInheritance: function(tab) {
	if(window.bookmarksManager == null) {
		// The background page doesn't have a bookmarksManager, and can't call
		// this function
		return;
	}

	let pinnedBookmarks = bookmarksManager.getPinnedBookmarks();

	if(pinnedBookmarks.length == 0) {
		// No pinned bookmarks
		return;
	}

	// Note that we need to go through this loop in both standard and search mode,
	// because in both cases we want to show the "inherited pin" on the regular tab.
	// On the other hand, in search mode we never want to add the bookmark to the
	// "tabs", otherwise the bookmark will show up twice (once through here, then
	// through the standard search mechanism of bookmarksManager.find().
	for(let i = 0; i < pinnedBookmarks.length; i++) {
		let bmNode = pinnedBookmarks[i];

		if(!this._isTabMatchingBookmark(tab, bmNode)) {
			continue;
		}
		this._setPinInheritance(tab, bmNode);
		// A tab might match multiple (pinned) bookmarks, but we stop this loop
		// at the first match, and ignore the others. Keeping single inheritance
		// makes the rest of the code a bit easier.
		return;
	}
},

normalizeBookmarkId : function(id) {
	return "b" + id;
},

_initBookmarkAsTab: function(tab) {
	// We want each "BookmarkTreeNode" to be as similar as possible to a "tab" object...
	// It already includes "title" and "url".
	// It also includes an "id", but the numeric space for that ID seems to overlap with
	// the space used by tabs, so we need to add a prefix (technically the BookmarkTreeNode
	// "id" is a string, while the tab "id" is a number, but they both get turned to the same
	// type (either string or number) anyway during processing...).
	// We want to add favIconUrl, a compatible "status" to render the bookmarks in
	// black&while like we render unloaded tabs, and some of the other things we get
	// from TabNormalizer.normalize().

	// Add a prefix to the id. This is safe because we never need to map this id back to
	// its original value to work with chrome.bookmarks events. We also want to save the
	// original ID in case we need it for some of the chrome.history functions.
	tab.bookmarkId = tab.id;
	tab.id = this.normalizeBookmarkId(tab.id);

	tab.status = "unloaded";
},

updateBookmarkFolder: function(tab) {
	let folder = bookmarksManager.getBmFolderSync(tab);
	if(folder != null) {
		// Best effort, we only try the sync version, we don't want to wait for
		// the async version to fill this out
		tab.tm.folder = folder;
		tab.tm.lowerCaseFolder = folder.toLowerCase();
	} else {
		this._log(logHead + "folder not available for", tab);
		tab.tm.folder = "";
		tab.tm.lowerCaseFolder = "";
	}
},

normalizeHistoryItemId : function(id) {
	return "h" + id;
},

_initHistoryItemAsTab: function(tab) {
	// We want each "HistoryItem" to be as similar as possible to a "tab" object...
	// It already includes "title" and "url".
	// It also includes an "id", but the numeric space for that ID overlaps with
	// the space used by tabs.
	// We want to add favIconUrl, a compatible "status" to render the history item in
	// black&while like we render unloaded tabs, and some of the other things we get
	// from TabNormalizer.normalize().

	// Add a prefix to the id. This is safe because we never need to map this id back to
	// its original value to work with chrome.history events. We also want to save the
	// original ID in case we need it for some of the chrome.history functions.
	tab.historyId = tab.id;
	tab.id = this.normalizeHistoryItemId(tab.id);

	tab.status = "unloaded";
},

normalizeRecentlyClosedId : function(id) {
	return "c" + id;
},

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
	tab.id = this.normalizeRecentlyClosedId(tab.sessionId);

	tab.status = "unloaded";
},

// "tab" can be either a tab object or a bookmark node object, determined by "options.type".
// "options.type" is one of Classes.TabNormalizer.type, default to Classes.TabNormalizer.type.TAB.
//
// Changes the contents of "tab" as an output parameter. Call this function as many times
// as needed, but the first time can be a bit "special" and initialization actions are taken
// only once.
//
// By default, this function sets all that's needed about a tab, including shortcut badges.
// You can choose to leave shortcut badges out by setting "options.addShortcutBadges" to "false"
// (default "true"). See TabsManager::_queryTabs() for a use case for that.
//
// "options.oldTab" allows the normalization to take into account a past state of the
// tab, which can be used in one case (setting tm.sortingTitle)
normalize: function(tab, options) {
	options = optionalWithDefault(options, {});
	let addShortcutBadges = optionalWithDefault(options.addShortcutBadges, true);
	let type = optionalWithDefault(options.type, Classes.TabNormalizer.type.TAB);
	let oldTab = options.oldTab;

	const logHead = "TabNormalizer::normalize(): ";

	// We need a "switch()" both at the beginning and at the end of this function.
	// At the beginning, we need to make sure all fields used by the logic in the
	// center are properly initialized, at the end, we run all pieces that depend
	// on "tab.tm" having been created in the central logic.

	// The initialization must run only once per "tab", while the rest of the logic
	// can be executed multiple times, as needed. "tab.tm == null" is only true the
	// first time a "tab" goes through this function.
	if(tab.tm == null) {
		switch(type) {
			case Classes.TabNormalizer.type.TAB:
				// Standard tabs are the main stars of this show, and they're already
				// initialized correctly. Everything else needs to be initialized to
				// look as much as possible like standard tabs
				break;
			case Classes.TabNormalizer.type.RCTAB:
				this._initRecentlyClosedAsTab(tab);
				break;
			case Classes.TabNormalizer.type.BOOKMARK:
				this._initBookmarkAsTab(tab);
				break;
			case Classes.TabNormalizer.type.HISTORY:
				this._initHistoryItemAsTab(tab);
				break;
			default:
				this._err(logHead + "unknown type", type);
				break;
		}
	} else {
		// We don't support type changes, every call to normalize() must use
		// the same consistent type
		this._assert(tab.tm.type == type, tab, type);
	}

	tab.tm = {
		type: type,

		// All the properties initialized to "null", empty strings or empty arrays are just
		// listed for completeness, and are actually initialized later in this function via
		// custom initialization logic
		url: null,
		protocol: null,
		hostname: null,
		pinInherited: null,
		customGroupName: null,
		lowerCaseUrl: null,
		lowerCaseTitle: null,
		sortTitle: null,
		useCachedFavIcon: null,
		cachedFavIconUrl: null,
		// "folder" is non empty only for bookmarks, but to make the search
		// logic easier, we want to make it non-null for all tabs
		folder: "",
		lowerCaseFolder: "",
		wantsAttention: false,
		// Bookmarks have extended IDs too
		extId: this.formatExtendedId(tab, type),

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

	// _updatePinInheritance(), updateTitle() and _updateFavIcon() require updateUrl() to
	// be called first
	this.updateUrl(tab);

	if(type == Classes.TabNormalizer.type.TAB) {
		// Call _updatePinInheritance() before updateTitle(), because in some cases
		// _updatePinInheritance can change the title
		this._updatePinInheritance(tab);
	}

	this.updateTitle(tab, oldTab);
	// Bookmarks and history have no favIconUrl, but sometimes recently closed and
	// standard tabs also don't have favIconUrl, so let's just try the cache here
	// for all these cases...
	this._updateFavIcon(tab);

	switch(type) {
		case Classes.TabNormalizer.type.TAB:
			// Bookmarks don't need shortcut badges because they can't be invoked
			// via custom shortcuts (though the URL in a custom shortcut could match
			// the URL of a bookmark, they're slightly different things, let's not mix
			// them up).
			if(addShortcutBadges) {
				this.addShortcutBadges(tab);
			}
			this._updateSearchBadges(tab);
			break;
		case Classes.TabNormalizer.type.RCTAB:
			// No shortcut badges for Recently Closed Tabs
			this._updateSearchBadges(tab);
			break;
		case Classes.TabNormalizer.type.BOOKMARK:
			this.updateBookmarkFolder(tab);
			this._updateBookmarkBadges(tab);
			break;
		case Classes.TabNormalizer.type.HISTORY:
			this._updateHistoryBadges(tab);
			break;
		default:
			this._err(logHead + "unknown type", type);
			break;
	}
},

}); // Classes.TabNormalizer

Classes.Base.roDef(Classes.TabNormalizer, "type", {} );
Classes.Base.roDef(Classes.TabNormalizer.type, "TAB", "tab" );
// RCTAB == "Recently Closed TAB"
Classes.Base.roDef(Classes.TabNormalizer.type, "RCTAB", "rctab" );
Classes.Base.roDef(Classes.TabNormalizer.type, "BOOKMARK", "bookmark" );
Classes.Base.roDef(Classes.TabNormalizer.type, "HISTORY", "history" );

Classes.Base.roDef(window, "tabNormalizer", Classes.TabNormalizer.createAs("tabNormalizer"));