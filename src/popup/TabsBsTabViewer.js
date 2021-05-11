// CLASS TabsBsTabViewer
//
Classes.TabsBsTabViewer = Classes.SearchableBsTabViewer.subclass({

	// String to show when the container is empty
	_emptyContainerString: "No tabs",

	_containerViewer: null,
	_groupsBuilder: null,

	// If grouping is displaying, we need to track which groups are collapsed (default)
	// and which groups are expanded, otherwise every redraw (happening at every tab
	// event) will re-collapse all groups.
	// We also want to store these expanded groups in storage, so we can remember which
	// groups are expanded when the popup is closed and then reopened.
	// _expandedGroups is a PersistentSet.
	_expandedGroups: null,

	_queryAndRenderJob: null,
	// Delay before a full re-render happens. Use this to avoid causing too many re-renders
	// if there are too many events.
	_queryAndRenderDelay: 200, //2000,

	// If there are more than "_maxUpdatedTabs" in a single UPDATED event, don't even perform
	// the updates one-by-one, just trigger a full refresh
	_maxUpdatedTabs: 50,

	_tabsManager: null,
	_historyFinder: null,
	_searchManager: null,

	// "_queryCycleNo" tracks changes in context. When a query starts, there's a specific
	// _queryCycleNo. The query is async, so it waits for some results, and when the results
	// arrive, we check if the _queryCycleNo has changed, in which case we drop everything.
	_queryCycleNo: null,

	_tilesAsyncQueue: null,

	// Dictionary tracking all the tab tiles, in case we need to update their contents.
	// Also used to track if a first rendering cycle has been completed...
	_tilesByTabId: null,

	// When we go through a refresh cycle, we want to reset _tilesByTabId so that we refill
	// it with only tiles that still exist after the refresh. However, we try to aggressively
	// reuse the tiles we've created in previous iterations, and for that we want to store
	// the tiles from the last iteration in _cachedTilesByTabId.
	_cachedTilesByTabId: null,
	_recycledTilesCnt: null,
	_cachedTilesUpdateNeededCnt: null,

	// This is a sorted list of tabs, as they appear in the search results
	_currentSearchResults: null,

_init: function({ labelHtml, standardTabs, incognitoTabs }) {
	this._options = {};
	this._options.labelHtml = labelHtml
	this._options.standardTabs = optionalWithDefault(standardTabs, true);
	this._options.incognitoTabs = optionalWithDefault(incognitoTabs, true);

	// Overriding the parent class' _init(), but calling that original function first
	Classes.SearchableBsTabViewer._init.call(this, { labelHtml: this._options.labelHtml });

	const logHead = "TabsBsTabViewer::_init(): ";
	this.debug();

	this._queryCycleNo = 0;

	// "this._expandedGroups" is initialized to only one localStore persistent set.
	// If this instance manages standard tabs, it gets initialized to "localStore.standardTabsBsTabExpandedGroups",
	// and "localStore.incognitoTabsBsTabExpandedGroups" is ignored, even if the instance also
	// manages incognito tabs.
	// "localStore.incognitoTabsBsTabExpandedGroups" is used only if the instance manages
	// only incognito tabs.
	if(this._options.standardTabs) {
		this._expandedGroups = localStore.standardTabsBsTabExpandedGroups;
	} else {
		if(this._options.incognitoTabs) {
			// Change the _emptyContainerString in case this instance is managing
			// only incognito tabs
			this._emptyContainerString = "No incognito tabs"
			this._expandedGroups = localStore.incognitoTabsBsTabExpandedGroups;
		} else {
			this._err(logHead + "neither standard nor incognito tabs to render, invalid configuration");
		}
	}

	let tabsManagerOptions = {
		standardTabs: this._options.standardTabs,
		incognitoTabs: this._options.incognitoTabs
	};
	this._tabsManager = Classes.TabsManager.createAs(this._id + "-tabsManager", tabsManagerOptions);

	this._historyFinder = Classes.HistoryFinder.create();

	let searchManagerOptions = {
		tabsManager: this._tabsManager,
		historyFinder: this._historyFinder
	};
	this._searchManager = Classes.SearchManager.createAs(this._id + "-searchManager", searchManagerOptions);

	this._queryAndRenderJob = Classes.ScheduledJob.create(this._queryAndRenderTabs.bind(this), "queryAndRender");
	this._queryAndRenderJob.debug();

	this._groupsBuilder = Classes.GroupsBuilder.create();
	// Call this function before rendering, because it sets _renderTabs(), which
	// would otherwise be null
	this._TabsBsTabViewer_searchBoxInactiveInner();

	this._tabsManager.getInitPromise().then(this._asyncInitCb.bind(this));
},

_asyncInitCb: function() {
	this._registerTabsManagerCallbacks();
	bookmarksManager.addEventListener(Classes.EventManager.Events.UPDATED, this._bookmarkUpdatedCb.bind(this));
	this._historyFinder.addEventListener(Classes.EventManager.Events.UPDATED, this._historyUpdatedCb.bind(this));

	settingsStore.addEventListener(Classes.EventManager.Events.UPDATED, this._settingsStoreUpdatedCb.bind(this));

	this._TabsBsTabViewer_render();
},

_registerTabsManagerCallbacks: function() {
	this._tabsManager.addEventListener(Classes.TabsManager.Events.CREATED, this._tabCreatedCb.bind(this));
	this._tabsManager.addEventListener(Classes.TabsManager.Events.REMOVED, this._tabRemovedCb.bind(this));
	this._tabsManager.addEventListener(Classes.TabsManager.Events.UPDATED, this._tabUpdatedCb.bind(this));
},

_tabCreatedCb: function(ev) {
	let tab = ev.detail.tab;
	const logHead = "TabsBsTabViewer::_tabCreatedCb(tabId = " + tab.id + "): ";

	this._log(logHead + "entering", ev.detail);
	// Since there's a new tab, we need to do a full query again, and potentially trigger
	// an update to the list of tabs we're tracking (since this tab ID could not possibly
	// already be in that list).

	// In case of a search, we know we can't possibly match our search criteria
	// when the tab has just been created, we'll want to rely on the update to
	// the tab "status". No point in running a query/re-render cycle in this case.
	if(this.isSearchActive()) {
		return;
	}

	// Very crude...
	// Unlike _tabUpdatedByTabCb(), we want this action to run immediately.
	this._queryAndRenderJob.run();
},

_tabRemovedCb: function(ev) {
	const logHead = "TabsBsTabViewer::_tabRemovedCb(tabId = " + ev.detail.tabId + "): ";

	this._log(logHead + "entering", ev.detail);
	this._queryAndRenderJob.run(this._queryAndRenderDelay);
},

// Returns "true" if the processing decided to schedule a full re-render, "false"
// if instead the update could be completed without the full re-render.
_processTabUpdate: function(tab, scheduledFullRender) {
	const logHead = "TabsBsTabViewer::_processTabUpdate(tabId = " + tab.id + "): ";
	this._log(logHead + "entering", tab);

	let tile = this._tilesByTabId[tab.id];
	if(tile == null) {
		// If we're in search mode, this._tilesByTabId[] includes only tiles for the
		// tabs that are in the search results, while _tabUpdatedCb() receives events
		// for all tabs known to this._tabsManager. If we don't find a tile, it just
		// means the tab is not in the search results. On the other hand, if we're
		// not in search mode, all tabs should have a corresponding tile.
		if(!this.isSearchActive()) {
			this._err(logHead + "tile not found and not in search mode", tab, this._tilesByTabId[tab.id]);
		}
		return false;
	}
	let oldRenderState = tile.getRenderState();

	// Note that internally TabTileViewer.update() enqueues the heavy processing
	// inside this._tilesAsyncQueue, so the tile re-rendering is sequenced
	// correctly against other calls on the same tile (though if there was
	// another queued call for the same tile, having multiple calls queued
	// would be a waste of cycles).
	tile.update(tab);

	// The contents of the tile have been updated. However, the relative posision
	// of the tile within the container might also have changed, and tile.update()
	// can't deal with that. For now, any change that could affect a change in tile
	// position within the list (tile moving in the sorted list, or tile moving from
	// a group to another group) will be handled by a full re-render. Ideally later
	// we'll have time to be a bit less wasteful when we identify these cases.

	// Note that as soon as we discover a reason for full re-render, this function
	// returns and doesn't try to find out if there are other reasons. So beware if
	// you need to add any unconditional logic, add it before this point.
	if(scheduledFullRender) {
		// If a previous tab has scheduled a full re-render, no need to go through
		// the rest of this logic. But we need to make sure we propagate back the
		// flag we got in input, and avoid resetting it.
		return true;
	}

	let renderState = tile.getRenderState();

	// Case 1: wantsAttention change. When wantsAttention is turned on, we know the
	// tile needs to move to the top. On the other hand, when wantsAttention is turned
	// off, we don't know where the tile used to be, and we need a full re-render.
	if(renderState.wantsAttention) {
		if(!oldRenderState.wantsAttention) {
			this._log(logHead + "wantsAttention transitioned to on");
			this._containerViewer.moveToTop(tile);
		}
	} else {
		if(oldRenderState.wantsAttention) {
			this._log(logHead + "wantsAttention transitioned to off");
			// Schedule a full re-render.
			// We need a full re-render because we don't know how to place the tile
			// back in its original place. If we did, we could save some cycles here
			// and avoid the full re-render.
			this._queryAndRenderJob.run(this._queryAndRenderDelay);
			// Since we've used the nuclear option, there's no reason to continue
			// with any of the checks the follow
			return true;
		}
	}

	// Case 2: title change. Title changes always require re-sorting the tile in the
	// list, and we deal with that via full re-rendering.
	if(oldRenderState.title != renderState.title) {
		this._queryAndRenderJob.run(this._queryAndRenderDelay);
		return true;
	}

	// Case 3: url change: URL changes are a problem only if the URL is used for grouping.
	// The tile's renderState doesn't have explicit data about grouping, but we know that
	// hostname-based grouping kicks in only if the tab is not part of a custom group.
	if(oldRenderState.url != renderState.url && renderState.tabGroupTitle != null && renderState.customGroupName == null) {
		this._queryAndRenderJob.run(this._queryAndRenderDelay);
		return true;
	}

	// Case 4: custom group change
	if(oldRenderState.customGroupName != renderState.customGroupName) {
		this._queryAndRenderJob.run(this._queryAndRenderDelay);
		return true;
	}

	return false;
},

_tabUpdatedCb: function(ev) {
	let tabId = "[multi]";
	if(ev.detail.tabs.length == 1) {
		tabId = ev.detail.tabs[0].id;
	}

	const logHead = "TabsBsTabViewer::_tabUpdatedCb(tabId = " + tabId + "): ";

	if(ev.detail.tabs.length > this._maxUpdatedTabs) {
		this._log(logHead + "many changes, just doing full refresh", ev.detail);
		this._queryAndRenderJob.run(this._queryAndRenderDelay);
		return;
	}

	this._log(logHead + "entering", ev.detail);

	let scheduledFullRender = false;

	for(let i = 0; i < ev.detail.tabs.length; i++) {
		// In case "scheduledFullRender" is already true, we don't want it to go back to "false",
		// that's why we alway "OR" with its previous value
		scheduledFullRender = this._processTabUpdate(ev.detail.tabs[i], scheduledFullRender) || scheduledFullRender;
	}

	// In the case of updates, we don't always schedule a full re-render (see inside
	// _processTabUpdate()), so we might need to blink explicitly here.
	if(!scheduledFullRender) {
		this.blink();
	}
},

_bookmarkUpdatedCb: function(ev) {
	const logHead = "TabsBsTabViewer::_bookmarkUpdatedCb(): ";

	this._log(logHead + "entering", ev.detail);
	// Most bookmarksManager updates are needed only during searches, but if there
	// is at least one pinned bookmark, all bookmark updates need to monitored
	// also during non-search tile rendering...
	this._queryAndRenderJob.run(this._queryAndRenderDelay);
},

_settingsStoreUpdatedCb: function(ev) {
	const logHead = "TabsBsTabViewer::_settingsStoreUpdatedCb(" + ev.detail.key + "): ";

	// The answer to all events is always the same, re-render everything.
	// In this case though, we can skip the re-query, since there's no
	// indication that the tabs have changed. We just need to trigger
	// a re-render of the tiles bodies (their titles have not changed, so
	// their sorting order or group membership has not changed). The only
	// exception is search mode, because an update to configuration can
	// change the composition of the search results.
	//
	// UPDATE: the previous comment is incorrect. When a change happens
	// to the settings, it could be a change in the definition of custom
	// group, and that definitely can have an impact on group membership.
	// So it's incorrect to say "group membership has not changed".
	//
	// We need to track "customGroups" changes because they could be about
	// custom group colors.
	if(!this.isSearchActive() && !([ "pinnedGroups", "customGroups" ].includes(ev.detail.key))) {
		// Nothing to do, all other cases are managed by TabsManager and
		// converted to UPDATED events
		this._log(logHead + "ignoring key", ev.detail);
		return;
	}

	this._log(logHead + "entering", ev.detail);
	this._queryAndRenderJob.run(this._queryAndRenderDelay);
},

_historyUpdatedCb: function(ev) {
	const logHead = "TabsBsTabViewer::_historyUpdatedCb(): ";

	// In theory we could just call a removeEventListener() when we get out of search
	// mode, but this code seems harmless enough
	if(!this.isSearchActive()) {
		// All the history events can be ignored when not in search mode
		return;
	}

	this._log(logHead + "entering", ev.detail);
	this._queryAndRenderJob.run(this._queryAndRenderDelay);
},

// When users use touch screens, a long hold (without moving) triggers the context
// menu of the browser page. We don't care that users can see the context menu in
// general (except that we don't want the TabMania context menu items there), but
// we need the long hold on touch to trigger the simulated "mouseover" (which Chrome
// does automatically) to display the tile dropdown menu and close button, so we
// can't have the context menu also show up in that case.
//
// UPDATE: unfortunately preventDefault() on "touchend" breaks all the "click" actions
// (dropdown can't be pressed, close button can't be pressed), so we are forced to
// disable "contextmenu" in general. Note that we're disabling it only in the tiles
// container, so it's still possible to get the context menu by clicking on the bsTabs.
//
// UPDATE2: working without [ right-click then "Inspect" ] is really hard... decided to
// go for this hack to try to restrict context menu only for contextmenu events triggered
// by touchend events. The hack is not foolproof, but in the worst case you'll miss
// a contextmenu you wanted to get, or you'll get a context menu you wanted to miss
// (every once in a while, not always). In a nutshell, the hack monitors for "touchend"
// events (which trigger "contextmenu" events), and sets a flag for 100ms (then automatically
// unsets it). If the contextmenu event fires while the flag is set, we assume the contextmenu
// event was triggered by the touchend event... it's an educated guess, not hard science.
_disableContextMenuOnTouchEnd: function() {
	let touchEndRecentlyFired = false;
	let monitorTouchEndCb = function(ev) {
		touchEndRecentlyFired = true;
		delay(100).then(function() { touchEndRecentlyFired = false; } );
	};

	let monitorContextMenuCb = function(ev) {
		if(touchEndRecentlyFired) {
			const logHead = "TabsBsTabViewer::monitorContextMenuCb(): ";
			this._log(logHead + "suppressing 'contextmenu' event after 'touchend' event");
			ev.preventDefault();
		}
	}.bind(this);

	let rootElem = this.getRootElement();
	rootElem.addEventListener("touchend", monitorTouchEndCb, false);
	rootElem.addEventListener("contextmenu", monitorContextMenuCb, false);
},

_TabsBsTabViewer_render: function() {
	// Make the TabsBsTabViewer content unselectable
	this.getRootElement().classList.add("tm-select-none");

	this._disableContextMenuOnTouchEnd();

	this._containerViewer = Classes.ContainerViewer.create(this._emptyContainerString);
	this._queryAndRenderTabs();

	perfProf.mark("attachContainerStart");
	//this._containerViewer.attachToElement(this.getBodyElement());
	this.append(this._containerViewer);
	perfProf.mark("attachContainerEnd");
	perfProf.measure("Attach tiles cont.", "attachContainerStart", "attachContainerEnd");
},

_resetAsyncQueue: function() {
	if(this._tilesAsyncQueue != null) {
		this._tilesAsyncQueue.discard();
	}
	this._tilesAsyncQueue = Classes.AsyncQueue.create();
},

_prepareForNewCycle: function() {
	this._queryCycleNo++;

	this._recycledTilesCnt = 0;
	this._cachedTilesUpdateNeededCnt = 0;
	this._cachedTilesByTabId = this._tilesByTabId;
	this._tilesByTabId = {};
	this._resetAsyncQueue();

	this._currentSearchResults = null;
},

// TBD, Chrome tabGrops APIs are generally available, but only for manifest v3
_getAllTabGroups: function() {
	const logHead = "TabsBsTabViewer::_getAllTabGroups(): ";
	return chromeUtils.wrap(chrome.tabGroups.query, logHead, {});
},

// TBD, Chrome tabGrops APIs are generally available, but only for manifest v3
_processTabGroupsCb: function(tabGroups) {
	const logHead = "TabsBsTabViewer::_processTabGroupsCb(): ";
	this._log(logHead, tabGroups);
},

// This function is not really async, but we're making it async for uniformity
// with the _querySearchTabs() function.
//
// "query" is a bit of a msnomer in this case, because we don't really trigger any
// expensive query in this case, we just get the data that is being managed over time
// by this._tabsManager.
_queryStandardTabs: async function() {
	let tabs = this._tabsManager.getTabs();
	let pinnedBookmarksIdsFromTabs = this._tabsManager.getPinnedBookmarkIdsFromTabs();
	// Get only the pinned bookmarks that are not already marked as pinInherited by a
	// standard tab
	let pinnedBookmarks = bookmarksManager.getPinnedBookmarks(pinnedBookmarksIdsFromTabs);

	return tabs.concat(pinnedBookmarks);
},

_querySearchTabs: async function() {
	// Give some feedback to the user in case this search is going to take a while...
	this._setSearchBoxCountBlinking();

	return await this._searchManager.queryTabs();
},

// "newSearch" is an optional parameter that should be set to "true" only when the
// update is triggered by a change in the searchbox input, and left to "false" for
// all other cases (typically, updates triggered by tab/bookmark/history events where
// the searchbox input remains the same). The flag is needed to make sure we reset
// the scrolling position of the popup only when the new search results start to
// display (that is, at the same time the search count stop blinking). Doing it
// before that (in this function or in the caller, since searches are async) would
// result in an odd visual effect.
_queryAndRenderTabs: function(newSearch) {
	newSearch = optionalWithDefault(newSearch, false);
	const logHead = "TabsBsTabViewer::_queryAndRenderTabs(" + newSearch + "): ";
	this._log(logHead + "entering");
	this.blink();

	this._prepareForNewCycle();
	let savedQueryCycleNo = this._queryCycleNo;

	let queryPromise = null;
	if(this.isSearchActive()) {
		queryPromise = this._querySearchTabs();
	} else {
		queryPromise = this._queryStandardTabs();
	}

	queryPromise.then(
		function(tabs) {
			if(savedQueryCycleNo != this._queryCycleNo) {
				// The world has moved on while we were waiting, interrupt this operation
				this._log(logHead + "old query cycle now obsolete, giving up");
				return;
			}

			if(tabs.length == 0) {
				this._log(logHead + "no tabs");
				this._containerViewer.clear();
				return;
			}

			perfProf.mark("renderStart");
			if(this.isSearchActive()) {
				this._renderSearchTabs(tabs, newSearch);
			} else {
				this._renderStandardTabs(tabs);
			}
			perfProf.mark("renderEnd");

			perfProf.measure("Rendering", "renderStart", "renderEnd");

			// This piece of logic will need to be added when "chrome tab groups"
			// APIs become available.
			//this._getAllTabGroups().then(this._processTabGroupsCb.bind(this));
		}.bind(this)
	);
},

_getCachedTile: function(tab, tabGroup) {
	if(this._cachedTilesByTabId == null) {
		return null;
	}

	// Let's see if we already have the tile, or if we need to create a new one
	let tile = this._cachedTilesByTabId[tab.id];

	// No cache, or not found in cache
	if(tile == null) {
		return null;
	}

	// The tile was in the cache!
	this._recycledTilesCnt++;

	// let's clear it from the cache (no two tabs should have the same tab.id, but
	// if it happens, we need to make sure they don't both try to use the same tile...)
	delete this._cachedTilesByTabId[tab.id];

	// Update the tile for this new cycle

	// We've discarded the old _tilesAsyncQueues, so now the cached tile needs a new
	// one to proceed with her async actions.
	tile.updateAsyncQueue(this._tilesAsyncQueue);
	// Using low priority to let the new tiles get the full rendering before the cached
	// tiles get their re-rendering
	if(tile.update(tab, tabGroup, Classes.AsyncQueue.priority.LOW)) {
		this._cachedTilesUpdateNeededCnt++;
	}

	return tile;
},

_renderTile: function(containerViewer, tabGroup, tab) {
	//const logHead = "TabsBsTabViewer::_renderTile(): ";
	let tile = this._getCachedTile(tab, tabGroup);

	if(tile == null) {
		// No cache, or not found in cache
		tile = Classes.TabTileViewer.create(tab, tabGroup, this._tilesAsyncQueue);
	}

	if(tab.tm.wantsAttention) {
		// Push tab to the top of the tiles list.
		// Note that in this case we must use "this._containerViewer", not "containerViewer",
		// because we need to move the tile to the top of the outermost container.
		this._containerViewer.moveToTop(tile);
	} else {
		containerViewer.append(tile);
	}
	this._tilesByTabId[tab.id] = tile;
},

// This function assumes "tabs" is not empty
// "tabGroup" is optional. If specified, it will be used by the tile to pick a
// default tile favicon if the tab itself doesn't have one.
_renderTabsFlatInner: function(containerViewer, tabs, tabGroup) {
	const logHead = "TabsBsTabViewer::_renderTabsFlatInner(): ";

	tabs.forEach(
		safeFnWrapper(this._renderTile.bind(this, containerViewer, tabGroup), null,
			function(e, tab) {
				this._err(logHead + "iterating through tabs, at tabId " + 
							(tab != null ? tab.tm.extId : "undefined obj"), tab, e);
			}.bind(this)
		)
	);
},

_renderTabsByGroup: function(tabGroups) {
	const logHead = "TabsBsTabViewer::_renderTabsByGroup(): ";

	tabGroups.forEach(
		function(tabGroup) {
			let tabs = tabGroup.tabs;
			if(tabGroup.type == Classes.GroupsBuilder.Type.TAB) {
				// Don't create an extra container for type TAB
				this._renderTabsFlatInner(this._containerViewer, tabs);
			} else {
				// Multiple tabs under a title, or required container (pinned).
				// Generate an inner container to attach to "this._containerViewer", then call
				// this._renderTabsFlatInner(<newContainerViewer>, tabs, tabGroup);
				let tilesGroupViewer = Classes.TilesGroupViewer.create(tabGroup, this._expandedGroups);
				this._containerViewer.append(tilesGroupViewer);
				this._renderTabsFlatInner(tilesGroupViewer, tabs, tabGroup);
			}
		}.bind(this)
	);
},

_logCachedTilesStats: function(logHead) {
	if(this._cachedTilesByTabId == null) {
		this._log(logHead + "no cache, no stats");
		return;
	}
	this._log(logHead + "reused " + this._recycledTilesCnt + " tiles, " +
				Object.keys(this._cachedTilesByTabId).length + " tiles still in cache");
	this._log(logHead + this._cachedTilesUpdateNeededCnt + " cached tiles needed a re-render");
},

_renderStandardTabs: function(tabs) {
	const logHead = "TabsBsTabViewer::_renderStandardTabs(): ";

	perfProf.mark("groupStart");
	let [ pinnedGroups, unpinnedGroups ] = this._groupsBuilder.groupByHostname(tabs);
	perfProf.mark("groupEnd");
	this._log(logHead + "pinnedGroups = ", pinnedGroups, "unpinnedGroups = ", unpinnedGroups);

	// We need to clear() in all cases. This logic is very crude, ideally we should have
	// a more seamless transition from a set of tabs to a different set of tabs, but
	// we're leaving that logic for later.
	// At least let's try to take this action as late as possible, right before we start
	// re-rendering.
	this._containerViewer.clear();

	perfProf.mark("tilesStart");
	// Pinned first, then unpinned
	this._renderTabsByGroup(pinnedGroups);
	this._renderTabsByGroup(unpinnedGroups);
	this._logCachedTilesStats(logHead);
	perfProf.mark("tilesEnd");

	perfProf.measure("Create groups", "groupStart", "groupEnd");
	perfProf.measure("Render tiles", "tilesStart", "tilesEnd");
},

_renderSearchTabs: function(tabs, newSearch) {
	const logHead = "TabsBsTabViewer::_renderSearchTabs(): ";

	perfProf.mark("searchSortStart");
	tabs = tabs.sort(Classes.TabNormalizer.compareTabsFn);
	perfProf.mark("searchSortEnd");

	// This logic is very crude, ideally we should have a more seamless transition from
	// a set of tabs to a different set of tabs, but we're leaving that logic for later.
	this._containerViewer.clear();

	this._setSearchBoxCountBlinking(false);
	this._setSearchBoxCount(tabs.length);
	if(newSearch) {
		this._bodyElem.scrollTo(0, 0);
	}

	this._currentSearchResults = tabs;
	perfProf.mark("searchRenderStart");
	this._renderTabsFlatInner(this._containerViewer, tabs);
	perfProf.mark("searchRenderEnd");
	this._logCachedTilesStats(logHead);
},

// Used for debugging by tmUtils.showTabInfo()
getTabInfo: function(tabId) {
	return [ this._tabsManager.getTabByTabId(tabId), this._tilesByTabId[tabId] ];
},

// This is a static function, because we need it both in the "Enter" handler as
// well as in the "click" handler (see TabTileViewer), and there was no cleaner way
// to make this code available in both
activateTab: function(tab) {
	const logHead = "Classes.TabsBsTabViewer.activateTab(): ";
	if(tab.tm.type == Classes.TabNormalizer.type.TAB) {
		chromeUtils.activateTab(tab);
		return;
	}

	if(tab.tm.type == Classes.TabNormalizer.type.RCTAB) {
		// Use "tab.sessionId", not "tab.id", because "tab.id" has been modified by
		// tabNormalizer.normalizeTab(), and it would not be recognized by chrome.sessions
		// anymore
		chromeUtils.wrap(chrome.sessions.restore, logHead, tab.sessionId);
		return;
	}

	// The tile is a bookmark or history item, not a tab/rcTab, we need to find an existing
	// tab already loaded with the current url, or open a new tab to handle the Enter/click
	chromeUtils.queryTabs({ url: tab.url }, logHead).then(
		function(tabList) {
			if(tabList.length == 0) {
				chromeUtils.loadUrl(tab.url);
			} else {
				// Activate the first tab in the list with a matching URL
				chromeUtils.activateTab(tabList[0]);
			}
		} // Static function, don't "bind(this)"
	);
},

///// Search-related functionality

// See Classes.SearchableBsTabViewer._activateSearchBox() for details about why
// we separated out this sub-function, and call only this standalong at _init()
// time (instead of just calling _activateSearchBox(false)).
_TabsBsTabViewer_searchBoxInactiveInner: function() {
	this._currentSearchResults = null;
	this._searchManager.reset();

	// Reset any message that might have been displaying...
	this.setMessage();
},

// Override this function from Classes.SearchableBsTabViewer
_activateSearchBox: function(active) {
	// Call the original function first
	Classes.SearchableBsTabViewer._activateSearchBox.apply(this, arguments);

	active = optionalWithDefault(active, true);

	const logHead = "TabsBsTabViewer::_activateSearchBox(" + active + "): ";
	// When search mode gets activated, we need to switch from a standard view of
	// tabs and tabgroups to a view of only tabs. And viceversa when the search
	// mode gets deactivated.
	if(!active) {
		this._log(logHead, "switching to standard render");
		// Switch back to the standard view
		this._TabsBsTabViewer_searchBoxInactiveInner();
		// Since we're exiting the search, we need to re-render the standard view
		this._queryAndRenderTabs();
	} else {
		this._log(logHead, "switching to search render");
		this._currentSearchResults = null;
		this._setSearchBoxCount();

		// We don't need to call this._queryAndRenderTabs() in this case, because
		// it's already being invoked as part of _searchBoxProcessData().
	}
},

_reportSearchParseErrors: function(errors) {
	let htmlMsgs = [];
	for(let i = 0; i < errors.length; i++) {
		htmlMsgs.push(`<p class="m-0">${this._safeText(errors[i])}</p>`);
	}

	this.setMessage(htmlMsgs.join("\n"), true);
},

// Override this function from Classes.SearchableBsTabViewer
_searchBoxProcessData: function(value) {
	// If value.length == 0, this function doesn't get called...
	this._assert(value.length != 0);

	this._searchManager.updateQuery(value);

	let errors = this._searchManager.getErrors();
	if(errors == null) {
		// Reset any message that might have potentially been displayed before
		this.setMessage();
	} else {
		this._reportSearchParseErrors(errors);
	}

	// Redraw the tab list.
	perfProf.mark("searchStart");
	// Query changes are already rate-limited by the "search" input box, no need to add an
	// extra rate-limiting (by calling _queryAndRenderJob.run() instead of the direct call
	// to _queryAndRenderTabs()), worst case you'll have one _updateSearchResults() running
	// because of a query change and one running because of a rate-limited bookmarks/history
	// event.
	this._queryAndRenderTabs(true);
	perfProf.mark("searchEnd");
	// Also, whenever the search input changes, scroll back to the top of the
	// new set of results
},

_respondToEnterKey: function(searchBoxText) {
	const logHead = "TabsBsTabViewer::_respondToEnterKey(" + searchBoxText + "): ";

	if(this._currentSearchResults == null) {
		this._log(logHead + "no search results, nothing to do");
		return;
	}

	this._log(logHead + "activating tab Id " + this._currentSearchResults[0].id +
					" (" + this._currentSearchResults[0].tm.type + ")");
	Classes.TabsBsTabViewer.activateTab(this._currentSearchResults[0]);
},

getSearchParserInfo: function() {
	if(this._searchQuery == null || !this._searchQuery.isInitialized()) {
		return null;
	}

	let unoptimizedStats = "";
	if(!isProd()) {
		unoptimizedStats = "\nUnoptimized stats:\n" + this._searchQuery.getUnoptimizedStats();
	}

	return "Optimized parsed query: " + this._searchQuery.getParsedQuery(Classes.SearchParser.rebuildMode.MIN) + "\n" +
			"Unoptimized parsed query: " + this._searchQuery.getUnoptimizedParsedQuery(Classes.SearchParser.rebuildMode.MIN) + "\n" +
			"Unoptimized parsed query (verbose): " + this._searchQuery.getUnoptimizedParsedQuery(Classes.SearchParser.rebuildMode.MAX) + "\n" +
			"Simplified parsed query: " + this._searchQuery.getSimplifiedQuery() + "\n" +
			"Optimizer info: " + JSON.stringify(this._searchQuery.getOptimizerInfo(), null, 2) + "\n" +
			"Optimized stats:\n" + this._searchQuery.getOptimizedStats() + unoptimizedStats;
},

}); // Classes.TabsBsTabViewer


// CLASS TabsBsTabViewerOld
//
Classes.TabsBsTabViewerOld = Classes.SearchableBsTabViewer.subclass({

_renderTileBodies: function() {
	// Object iteration, ECMAScript 2017 style
	// See https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/entries
	try {
		for(const [ tabId, tile ] of Object.entries(this._tilesByTabId)) {
			let tab = this._normTabs.getTabByTabId(tabId);
			if(tab != null) {
				tile.update(tab);
			} else {
				const logHead = "TabsBsTabViewer::_renderTileBodies(): ";
				this._err(logHead + "unexpected, tile tracks non-existing tabId = " + tabId);
			}
//			this._tilesAsyncQueue.enqueue(tile.renderBody.bind(tile),
//						"TabsBsTabViewer::_renderTileBodies(), tabId = " + tabId);
		}
	} catch(e) {
		this._err(e, "this._tilesByTabId: ", this._tilesByTabId);
	}
},


_setTabProp: function(prop, tabId) {
	const logHead = "TabsBsTabViewer::_setTabProp(" + tabId + "): ";
	if(!(tabId in this._tilesByTabId)) {
		this._log(logHead + "skipping immediate processing, no tile for this tab");
		return;
	}

	let tabIdx = this._normTabs.getTabIndexByTabId(tabId);
	let tab = this._normTabs.getTabByTabIndex(tabIdx);
	this._assert(tab != null);

	tab[prop] = true;
	// We need to call this._normTabs.updateTab(tab), because even though the
	// tab object we just updated is already in there, since we changed
	// a property that affects the search badges, we need to re-normalize
	// the tab to get the change reflected in the search badges
	this._normTabs.updateTab(tab, tabIdx);

},

_immediateTabUpdate: function(tabId, tab) {
	const logHead = "TabsBsTabViewer::_immediateTabUpdate(" + tabId + "): ";

	if(!(tabId in this._tilesByTabId)) {
		this._log(logHead + "skipping immediate processing, no tile for this tab");
		return;
	}

	this.blink();

	// Note that only "Classes.TabsManager.Events.UPDATED" includes "tab".
	// All other types don't.
	// Anyway TabTileViewer.update() is protected against "tab == null".

	// First we want to normalize the updated tab (so there are no problems
	// rendering it in the tile), and replace it in the list, so that search can
	// find it with the right attributes.
	// The normalization includes two steps:
	// - First we extend the tab with pinned bookmark info, if needed
	// - Then we run the standard NormalizedTabs logic
	this._processPinnedBookmarks([ tab ], false);
	this._normTabs.updateTab(tab);
	// Then update the shortcuts info, if needed
	settingsStore.getShortcutsManager().updateTabs(this._normTabs.getTabs());
	// Then we update the tile with the normalized info in place.
	// See also _setTabProp() for other considerations about calling
	// TabTileViewer.update().
	let tile = this._tilesByTabId[tabId];
	if(tab.wantsAttention) {
		// Push tab to the top of the tiles list
		this._containerViewer.moveToTop(tile);
	}
	tile.update(tab);
},

OLD_tabUpdatedCb: function(cbType, tabId, activeChangeRemoveInfo, tab) {
	const logHead = "TabsBsTabViewer::_tabUpdatedCb(" + cbType + ", " + tabId + "): ";

	// Terrible idea: our popup always shows as "loading" unless some other event
	// happens to clear it. It's not great that we're guaranteed to have to render
	// the tiles twice every time we open our undocked popup, but if we can't find
	// another way to deal with the "loading" badge, we have to allow the double
	// rendering.
	//if(tabId == popupDocker.getOwnTabId()) {
	//	this._log(logHead + "suppressing notification for our own tab ID");
	//	return;
	//}

	if(this._tilesByTabId == null) {
		// We're receiving events before we've completed our first rendering cycle
		// (otherwise we would have some _tilesByTabId).
		// We can't continue the processing below until after the first rendering
		// cycle has been completed.
		// Note that this event might get lost, or might be included in the query
		// response we get from the Chrome API... potential race condition that we're
		// going to ignore for now. The reason we're ignoring it is that we've observed
		// this case only because the undocked popup itself triggers these events as
		// it loads. We get one "updated" event because its status moves to "complete",
		// then one because it gets a favIconUrl. Sometimes the sequence starts with
		// a first event about the "title" being added to the tab. These are all
		// events we can probably ignore (?)
		//
		// Note that this check is also possibly inaccurate unless all tiles get populated
		// in _tilesByTabId without any event cycle interfering, which is currently the
		// case because we loop through all the results of chromeUtils.queryTabs() without
		// any interruption, but might not be the case in general later, if that loop
		// becomes too expensive. It would be better to track this with some other
		// dedicated flag, but if we land in that case, the race condition described above
		// might become real...
		this._log(logHead + "ignoring while running first rendering cycle", activeChangeRemoveInfo, tab);
		return;
	}

	// Very crude... we re-render everything for every update. But at least we try
	// to reduce the frequency of the re-render in some cases.
	this._log(logHead + "entering", activeChangeRemoveInfo, tab);

	switch(cbType) {
		case Classes.TabsManager.Events.REMOVED:
			// Like in the case of onCreated, when a tab is removed we want to run the
			// full re-render immediately.
			//
			// No reason to update the _normTabs and the shortcutsManager if we don't
			// have any delay before a full re-query/re-render. However, we want to at
			// least clear the "_loadingTabs" in "_normTabs" to avoid unnecessary errors
			// ("chrome.runtime.lastError = No tab with id: [xyz].") when the _issue01Workaround()
			// runs.
			this._normTabs.removeTabsLoadingTab(tabId);
			tabsTitleMonitor.remove(tabId);
			this._queryAndRenderJob.run();
			break;
		case Classes.TabsManager.Events.UPDATED:
			// tabsTitleMonitor.update() sets the "tab.wantsAttention" flag in "tab"
			// when it returns "true". Can't put it in "tab.tm" because "tab.tm" will
			// be added later.
			if(tabsTitleMonitor.update(tab, this._stopAttentionCb.bind(this))) {
				this._immediateTabUpdate(tabId, tab);
			} else {
				// Only in case of a real update we can afford to delay the full re-render,
				// provided we at least re-render the affected tile... we can only re-render
				// the affected tile if we already have the affected tile, not if it's new.
				// See _tabCreatedCb() for search cases where we ignore the creation event
				// and just wait for the follwing update to arrive (that's a case where we
				// won't have the tile in place when the update arrives).
				if(this._queryAndRenderDelay != null && this._queryAndRenderDelay != 0) {
					this._immediateTabUpdate(tabId, tab);
				}
				this._queryAndRenderJob.run(this._queryAndRenderDelay);
			}
			break;
		case Classes.TabsManager.Events.ACTIVATED:
			if(this._queryAndRenderDelay != null && this._queryAndRenderDelay != 0) {
				this._setTabProp("active", tabId);
			}
			this._queryAndRenderJob.run(this._queryAndRenderDelay);
			break;
		case Classes.TabsManager.Events.HIGHLIGHTED:
			if(this._queryAndRenderDelay != null && this._queryAndRenderDelay != 0) {
				activeChangeRemoveInfo.tabIds.forEach(this._setTabProp.bind(this, "highlighted"));
			}
			this._queryAndRenderJob.run(this._queryAndRenderDelay);
			break;
		case Classes.TabsManager.Events.MOVED:
		case Classes.TabsManager.Events.ATTACHED:
			// Adding a parenthesis to handle the "tab" redefinition (as it's also a function input
			// parameter) inside without incurring in the error: 
			//   Error in event handler: ReferenceError: Cannot access 'tab' before initialization
			//   at Object._tabUpdatedCb (<URL>)
			{
				let tabIdx = this._normTabs.getTabIndexByTabId(tabId);
				let tab = this._normTabs.getTabByTabIndex(tabIdx);
				// "tab != null" is needed because of the PopupDocker._popupDefenderCb() logic.
				// When a chrome.sessions.restore() attempts (mistakenly) to open a tab in the
				// TabMania popup window, we relocate the tab. That relocation triggers this
				// event, but in this case we won't have a tab for that window yet, because it's
				// new, and we're still in the onCreated event...
				if(tab != null && this._queryAndRenderDelay != null && this._queryAndRenderDelay != 0) {
					if(cbType == Classes.TabsManager.Events.ATTACHED) {
						tab.index = activeChangeRemoveInfo.newPosition;
						tab.windowId = activeChangeRemoveInfo.newWindowId;
					} else { // MOVED
						tab.index = activeChangeRemoveInfo.toIndex;
						tab.windowId = activeChangeRemoveInfo.windowId;
					}
					// We need to call this._normTabs.updateTab(tab), same reasons as
					// for the previous case
					this._normTabs.updateTab(tab, tabIdx);

					// Since a tab has moved, we need to update the shortcutsManager
					settingsStore.getShortcutsManager().updateTabs(this._normTabs.getTabs());
					if(tabId in this._tilesByTabId) {
						// This check can only be done this late in this case, because
						// when a tab moves, all the shortcuts candidates can be impacted
						// and need to be refreshed... the refresh of all relevant tiles
						// will be triggered by the event generated by the ShortcutManager.
						//
						// See also _setTabProp() for other considerations about calling
						// TabTileViewer.update().
						this._tilesByTabId[tabId].update(tab);
					}
				}
				this._queryAndRenderJob.run(this._queryAndRenderDelay);
			}
			break;
		default:
			this._err(logHead + "unknown callback type");
			break;
	}
},



_searchRenderTabs: function(tabs, newSearch) {
	const logHead = "TabsBsTabViewer::_searchRenderTabs(newSearch: " + newSearch + "): ";

	if(!this._searchManager.isSearchActive()) {
		// Sometimes users can enter search mode while this class is going through a
		// TabsBsTabViewer::_queryAndRenderTabs() for standard tabs. If that happens
		// while _queryAndRenderTabs() is waiting for the response from
		// chromeUtils.queryTabs(), the transition to search mode will "hijack" the
		// _queryAndRenderTabs() cycle, by switching the pointer this._renderTabs to
		// this._searchRenderTabs() instead of this._standardRenderTabs().
		// Normally, when in search mode, this._searchRenderTabs() would be called
		// by _updateSearchResults() via _searchBoxProcessData() when the "input"
		// listener callback is invoked, and the input listener callback (which is
		// _searchBoxProcessData()) calls _searchManager.update() to the value in the input
		// box before calling this._searchRenderTabs(). Since instead we have hijacked
		// a standart rendering cycle, this._searchRenderTabs() will be called when
		// chromeUtils.queryTabs() (which was invoked for a standard render, not a search)
		// returns, and that can be before the input callback has time to run.
		// In that case the sequence is:
		// - Start _queryAndRenderTabs() for standard mode
		// - _activateSearchBox() gets called as part of the processing of the "keydown"
		//   event (which runs before the "input" event)
		// - this._renderTabs is switched to this._searchRenderTabs() inside _activateSearchBox()
		// - chromeUtils.queryTabs() returns inside _queryAndRenderTabs()
		// - this._renderTabs() (and therefore this._searchRenderTabs()) is invoked to
		//   process the data from chromeUtils.queryTabs()
		//   **** This check protects at this point in the sequence
		// - Finally the "input" event is triggered, and _searchBoxProcessData()
		//   sets the searchbox input value by calling _searchManager.update()
		//   * this._searchRenderTabs() can only do processing correctly after this point
		//
		// Note that we can't anticipate the _searchManager.update() call to the "keydown"
		// event (in _activateSearchBox()), because the "keydown" event knows the raw key
		// that was pressed, but can't know what that means for the input box (e.g., if
		// the raw key is "v" and the CTRL modifier is pressed, the "input" event will
		// report a bunch of text pasted from the clipboard, which the "keydown" event
		// had no idea of). So the only option is to discard any attempts to call this
		// function (this._searchRenderTabs()) until the "input" event has taken its sweet
		// time to call _searchManager.update().
		this._log(logHead + "_searchManager still pending update, nothing to do");
		return;
	}

	if(!this.isSearchActive()) {
		// While waiting for the Promise.all(), the user can close the search and go
		// back to standard mode. If that happens, the call to this._activateSearchBox(false)
		// sets this._searchQuery to "null", so this function will eventually fail if
		// we let it continue. Let's just get out...
		this._log(logHead + "got out of search mode, discarding results");
		return;
	}
	// We need to this._containerViewer.clear() in all cases, but we're trying to
	// keep this clear() call as close as possible to the time of the new rendering.
	// If there's too much processing to do between clear() and render, users will
	// see an empty screen with the "no tabs" text displayed in the popup for the
	// duration of the processing. No reason to leave them hanging.
	// For this reason, we've moved this this._containerViewer.clear() call from
	// here to inside the this._searchRenderTabsInner() calls. A small duplication
	// for a good UX cause.
	this._searchRenderTabsInner(tabs, newSearch);
},

}); // Classes.TabsBsTabViewerOld
