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

	_selectMode: null,
	_listSelectedMode: null,

	_multiSelectPanel: null,

_init: function({ labelHtml, standardTabs, incognitoTabs }) {
	this._options = {};
	this._options.labelHtml = labelHtml
	this._options.standardTabs = optionalWithDefault(standardTabs, true);
	this._options.incognitoTabs = optionalWithDefault(incognitoTabs, true);

	// Overriding the parent class' _init(), but calling that original function first
	Classes.SearchableBsTabViewer._init.call(this, { labelHtml: this._options.labelHtml });

	const logHead = "TabsBsTabViewer::_init():";
	this.debug();

	this._queryCycleNo = 0;

	this._selectMode = false;
	this._listSelectedMode = false;

	// "this._expandedGroups" is initialized to only one localStore persistent set.
	// If this instance manages standard tabs, it gets initialized to "localStore.standardTabsBsTabExpandedGroups",
	// and "localStore.incognitoTabsBsTabExpandedGroups" is ignored, even if the instance also
	// manages incognito tabs.
	// "localStore.incognitoTabsBsTabExpandedGroups" is used only if the instance manages
	// only incognito tabs.
	if(!this._isIncognito()) {
		this._expandedGroups = localStore.standardTabsBsTabExpandedGroups;
	} else {
		if(this._options.incognitoTabs) {
			// Change the _emptyContainerString in case this instance is managing
			// only incognito tabs
			this._emptyContainerString = "No incognito tabs"
			this._expandedGroups = localStore.incognitoTabsBsTabExpandedGroups;
		} else {
			this._log(logHead, "neither standard nor incognito tabs to render, going idle");
			// With this configuration, the instance is just a placeholder with no tracking
			// needed, so we don't need to continue the initialization below
			return;
		}
	}

	let tabsManagerOptions = {
		standardTabs: this._options.standardTabs,
		incognitoTabs: this._options.incognitoTabs
	};
	this._tabsManager = Classes.TabsManager.createAs(this._id + ".tabsManager", tabsManagerOptions);

	// History and recently closed tabs can only be searched in the "Home" bsTab
	this._historyFinder = this._isIncognito() ? null : Classes.HistoryFinder.create();

	let searchManagerOptions = {
		tabsManager: this._tabsManager,
		historyFinder: this._historyFinder,
		incognitoBsTab: this._isIncognito(),
	};
	this._searchManager = Classes.SearchManager.createAs(this._id + ".searchManager", searchManagerOptions);

	this._queryAndRenderJob = Classes.ScheduledJob.createAs(this._id +  ".queryAndRenderJob",
															this._queryAndRenderTabs.bind(this));
	this._queryAndRenderJob.debug();

	this._groupsBuilder = Classes.GroupsBuilder.create();
	// Call this function before rendering, because it sets _renderTabs(), which
	// would otherwise be null
	this._TabsBsTabViewer_searchBoxInactiveInner();

	this._tabsManager.getInitPromise().then(this._asyncInitCb.bind(this));
},

_asyncInitCb: function() {
	const logHead = "TabsBsTabViewer::_asyncInitCb():";
	if(this._queryCycleNo != 0) {
		if(this._elw == null) {
			this._log(logHead, "discard() called before initialization completed, giving up");
			return;
		}
		// Unexpected, _queryCycleNo has been updated, but we're not in a discard() case
		this._err(logHead, "unexpected, _queryCycleNo updated before initialization completed", this._queryCycleNo);
	}

	this._registerTabsManagerCallbacks();
//	bookmarksManager.addEventListener(Classes.EventManager.Events.UPDATED, this._bookmarkUpdatedCb.bind(this));
	this._elw.listen(bookmarksManager, Classes.EventManager.Events.UPDATED, this._bookmarkUpdatedCb.bind(this));

	if(this._historyFinder != null) {
//		this._historyFinder.addEventListener(Classes.EventManager.Events.UPDATED, this._historyUpdatedCb.bind(this));
		this._elw.listen(this._historyFinder, Classes.EventManager.Events.UPDATED, this._historyUpdatedCb.bind(this));
	}

//	settingsStore.addEventListener(Classes.EventManager.Events.UPDATED, this._settingsStoreUpdatedCb.bind(this));
	this._elw.listen(settingsStore, Classes.EventManager.Events.UPDATED, this._settingsStoreUpdatedCb.bind(this));

	this._TabsBsTabViewer_render();
},

_registerTabsManagerCallbacks: function() {
//	this._tabsManager.addEventListener(Classes.TabsManager.Events.CREATED, this._tabCreatedCb.bind(this));
	this._elw.listen(this._tabsManager, Classes.TabsManager.Events.CREATED, this._tabCreatedCb.bind(this));

//	this._tabsManager.addEventListener(Classes.TabsManager.Events.REMOVED, this._tabRemovedCb.bind(this));
	this._elw.listen(this._tabsManager, Classes.TabsManager.Events.REMOVED, this._tabRemovedCb.bind(this));

//	this._tabsManager.addEventListener(Classes.TabsManager.Events.UPDATED, this._tabUpdatedCb.bind(this));
	this._elw.listen(this._tabsManager, Classes.TabsManager.Events.UPDATED, this._tabUpdatedCb.bind(this));
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
	const logHead = "TabsBsTabViewer::_tabRemovedCb(tabId = " + ev.detail.tab.id + "): ";

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
		// If we're in search mode or "list selected" mode, this._tilesByTabId[] includes
		// only tiles for the tabs that are in the search results (or selected), while
		// _tabUpdatedCb() receives events for all tabs known to this._tabsManager.
		if(!(this.isSearchActive() || this.isListSelectedMode())) {
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

	// Case 2: sortTitle change. sortTitle changes always require re-sorting the tile in the
	// list, and we deal with that via full re-rendering.
	if(oldRenderState.sortTitle != renderState.sortTitle) {
		this._queryAndRenderJob.run(this._queryAndRenderDelay);
		return true;
	}
	// Case 2.5: title change. when we show all tabs, we only care about sortTitle changes,
	// but when we're in search mode, we also care about title changes, because a title change
	// could trigger a tab to stop being part of a search results set
	if(this.isSearchActive()) {
		if(oldRenderState.title != renderState.title) {
			this._queryAndRenderJob.run(this._queryAndRenderDelay);
			return true;
		}
	}

	// Case 3: url change: URL changes are a problem only if the URL is used for grouping,
	// or if we're in search mode.
	// The tile's renderState doesn't have explicit data about grouping, but we know that
	// hostname-based grouping kicks in only if the tab is not part of a custom group.
	if(oldRenderState.url != renderState.url) {
		if(this.isSearchActive() || (renderState.tabGroupTitle != null && renderState.customGroupName == null)) {
			this._queryAndRenderJob.run(this._queryAndRenderDelay);
			return true;
		}
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
	const logHead = "TabsBsTabViewer::_settingsStoreUpdatedCb(" + ev.detail.key + "):";

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
		// converted to UPDATED events.
		this._log(logHead, "ignoring key", ev.detail);
		return;
	}

	// We should filter out "options.incognitoBsTab", which is managed by popupViewer,
	// and popupViewer causes the spawn of a new instance, so no point in taking any action
	// in the old instance. On the other hand, "ev.detail" is set broadly to "options", and
	// we don't know which option has changed, so we can't easily interrupt the flow. We
	// could check explicitly if "options.incognitoBsTab" has changed, but it could be one
	// change of many...
	this._log(logHead, "entering", ev.detail);
	this._queryAndRenderJob.run(this._queryAndRenderDelay);
},

_historyUpdatedCb: function(ev) {
	const logHead = "TabsBsTabViewer._historyUpdatedCb():";

	// In theory we could just call a removeEventListener() when we get out of search
	// mode, but this code seems harmless enough
	if(!this.isSearchActive()) {
		// All the history events can be ignored when not in search mode
		return;
	}

	this._log(logHead, "entering", ev.detail);
	this._queryAndRenderJob.run(this._queryAndRenderDelay);
},

_isIncognito: function() {
	// The reason for "!standardTabs" to determine "_isIncognito" is because
	// we only have 3 cases:
	// 1. standardTabs == true, incognitoTabs == true (single bsTab in popup)
	// 2. standardTabs == true, incognitoTabs == false ("home" bsTab with separate "incognito" bsTab)
	// 3. standardTabs == false, incognitoTabs == true ("incognito" bsTab with separate "home" bsTab)
	//
	// The can't both be "false", but only (3) maps to "only incognito tabs", and
	// that's the only case when "standardTabs" is "false".
	return !this._options.standardTabs;
},

isSelectMode: function() {
	return this._selectMode;
},

setSelectMode: function(flag=true) {
	if(this._selectMode === flag) {
		// Nothing to do
		return;
	}

	this._selectMode = flag;
	this._multiSelectPanel.activate(flag);

	// Always reset _listSelectedMode when entering/exiting "select mode".
	// The second argument set to "true" forces the function to take all the actions
	// regardless of the value of "_selectMode".
	this.setListSelectedMode(false, true);

	popupViewer.updateMultiSelectMenuItem();

	for(const [tabId, tile] of Object.entries(this._tilesByTabId)) {
		tile.setSelectMode(flag);
	}
},

toggleSelectMode: function() {
	this.setSelectMode(!this.isSelectMode());
},

_tileSelectedCb: function(tab, flag) {
	if(flag) {
		this._multiSelectPanel.addTab(tab);
	} else {
		this._multiSelectPanel.removeTab(tab);
	}

	this._computeMultiSelectState(flag);
},

_multiSelectSelectedCb: function(ev) {
	const logHead = "TabsBsTabViewer::_multiSelectSelectedCb():";

	if(ev.detail.selected) {
		this._log(logHead, "all selected", ev);
	} else {
		this._log(logHead, "all unselected", ev);
	}

	for(let tabId in this._tilesByTabId) {
		this._tilesByTabId[tabId].setSelected(ev.detail.selected);
	}
},

_multiSelectClosedCb: function(ev) {
	this.setSelectMode(false);
},

_multiSelectListedCb: function(ev) {
	this.toggleListSelectedMode();
},

// If "hint" is "undefined", it won't contribute to the determination of the panel
// checkbox state
_computeMultiSelectState: function(hint) {
	let atLeastOneSelected = false;

	for(const [tabId, tile] of Object.entries(this._tilesByTabId)) {
		if(tile.isSelected()) {
			atLeastOneSelected = true;
			if(hint === false) {
				// We're finding that at least one is selected, and we know from the "hint"
				// that at least one has just been unselected, no need to continue with the
				// loop, the multiSelect state is "partially selected" (indetermined)
				this._multiSelectPanel.setSelected(true, true);
				return;
			}
		} else {
			if(atLeastOneSelected || hint === true) {
				// At least one is selected (either because we found it, or because the "hint"
				// told us that), and now we're finding out that at least one is unselected,
				// no need to continue with the loop, the multiSelect state is "partially
				// selected" (indetermined)
				this._multiSelectPanel.setSelected(true, true);
				return;
			}
		}
	}

	// If we get here, we didn't hit the "partially selected" case, so the tiles are
	// either all selected, or all unselected
	this._multiSelectPanel.setSelected(atLeastOneSelected);
},

setListSelectedMode: function(flag=true, force=false) {
	const logHead = "TabsBsTabViewer.setListSelectedMode():";

	if(this._listSelectedMode == flag) {
		// Nothing to do
		this._log(logHead, "nothing to do");
		return;
	}

	this._log(logHead, "entering");

	this._listSelectedMode = flag;
	this._multiSelectPanel.setListSelectedMode(this._listSelectedMode);

	if(!this.isSelectMode() && !force) {
		// Take no further action
		this._log(logHead, "skipping further actions");
		return;
	}

	if(this.isSearchActive()) {
		if(this._listSelectedMode) {
			// _listSelectedMode and search mode are mutually exclusive, so we need to disable
			// search when we enter _listSelectedMode. Note that _activateSearchBox(false) performs
			// this._queryAndRenderJob.run() internally, and we don't want to render twice.
			this._activateSearchBox(false);
		}
		// If search is active and _listSelectedMode is becoming inactive, this should mean
		// search mode has just been activated. Per _activateSearchBox() below, in that case
		// we should not explicitly call this._queryAndRenderJob.run(), as it would be a duplicate.
	} else {
		// Whenever we switch in or out of "list selected" mode we need to trigger a re-render,
		// but only when we're not dealing with search mode transitions...
		this._queryAndRenderJob.run();
	}
},

toggleListSelectedMode: function() {
	this.setListSelectedMode(!this.isListSelectedMode());
},

isListSelectedMode: function() {
	if(!this.isSelectMode()) {
		return false;
	}

	return this._listSelectedMode;
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
//	rootElem.addEventListener("touchend", monitorTouchEndCb, false);
	this._elw.listen(rootElem, "touchend", monitorTouchEndCb, false);
//	rootElem.addEventListener("contextmenu", monitorContextMenuCb, false);
	this._elw.listen(rootElem, "contextmenu", monitorContextMenuCb, false);
},

_TabsBsTabViewer_render: function() {
	// Make the TabsBsTabViewer content unselectable
	this.addClasses("tm-select-none");

	this._disableContextMenuOnTouchEnd();

	if(this._isIncognito()) {
		this.addClasses("bg-secondary", "text-light", "border-dark");
	}

	let multiSelectOptions = {
		tabsManager: this._tabsManager,
		historyFinder: this._historyFinder,
		incognitoBsTab: this._isIncognito(),
	};
	this._multiSelectPanel = Classes.MultiSelectPanelViewer.create(multiSelectOptions);
	// Add the _multiSelectPanel before the TabsBsTabViewer's body, so the scrollbar of the
	// TabsBsTabViewer doesn't include the _multiSelectPanel
	this.addBefore(this._multiSelectPanel);
	this._elw.listen(this._multiSelectPanel, Classes.MultiSelectPanelViewer.Events.SELECTED,
					this._multiSelectSelectedCb.bind(this));
	this._elw.listen(this._multiSelectPanel, Classes.MultiSelectPanelViewer.Events.CLOSED,
					this._multiSelectClosedCb.bind(this));
	this._elw.listen(this._multiSelectPanel, Classes.MultiSelectPanelViewer.Events.LISTED,
					this._multiSelectListedCb.bind(this));

	this._containerViewer = Classes.ContainerViewer.create(this._emptyContainerString);

	this._queryAndRenderTabs();

	perfProf.mark("attachContainerStart");
	//this._containerViewer.attachInParentElement(this.getBodyElement());
	this.append(this._containerViewer);
	perfProf.mark("attachContainerEnd");
	perfProf.measure("Attach tiles cont.", "attachContainerStart", "attachContainerEnd");
},

_resetAsyncQueue: function(respawn=true) {
	if(this._tilesAsyncQueue != null) {
		this._tilesAsyncQueue.discard();
	}

	if(respawn) {
		this._tilesAsyncQueue = Classes.AsyncQueue.create();
	} else {
		this._tilesAsyncQueue = null;
	}
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
// with the _queryTabsSearchMode() function.
//
// "query" is a bit of a misnomer in this case, because we don't really trigger any
// expensive query in this case, we just get the data that is being managed over time
// by this._tabsManager.
_queryTabsFullMode: async function() {
	let tabs = this._tabsManager.getTabs();
	let pinnedBookmarksIdsFromTabs = this._tabsManager.getPinnedBookmarkIdsFromTabs();
	// Get only the pinned bookmarks that are not already marked as pinInherited by a tab
	let pinnedBookmarks = bookmarksManager.getPinnedBookmarks(pinnedBookmarksIdsFromTabs);

	return tabs.concat(pinnedBookmarks);
},

_queryTabsSearchMode: async function() {
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
_queryAndRenderTabs: function(newSearch=false) {
	const logHead = "TabsBsTabViewer::_queryAndRenderTabs(" + newSearch + "):";
	this._log(logHead, "entering");
	this.blink();

	this._prepareForNewCycle();
	let savedQueryCycleNo = this._queryCycleNo;

	let queryPromise = null;
	if(this.isSearchActive()) {
		queryPromise = this._queryTabsSearchMode();
	} else {
		queryPromise = this._queryTabsFullMode();
	}

	queryPromise.then(
		function(tabs) {
			if(savedQueryCycleNo != this._queryCycleNo) {
				// The world has moved on while we were waiting, interrupt this operation
				this._log(logHead, "old query cycle now obsolete, giving up");
				return;
			}

			if(this.isSelectMode()) {
				// When we render below, we re-add tabs to the _multiSelectPanel view, so
				// we must reset before we render
				this._multiSelectPanel.resetView();
			}

			perfProf.mark("renderStart");
			if(this.isSearchActive()) {
				this._renderTabsSearchMode(tabs, newSearch);
			} else {
				if(this.isListSelectedMode()) {
					this._renderTabsListSelectedMode(this._multiSelectPanel.getTabs());
				} else {
					this._renderTabsFullMode(tabs);
				}
			}
			perfProf.mark("renderEnd");
			perfProf.measure("Rendering", "renderStart", "renderEnd");

			if(this.isSelectMode()) {
				perfProf.mark("multiSelectStart");
				// _computeMultiSelectState() uses the tiles info to determine select state
				// for the multiSelect panel, so it must be called after rendering
				this._computeMultiSelectState();
				perfProf.mark("multiSelectEnd");
				perfProf.measure("multiSelect", "multiSelectStart", "multiSelectEnd");
			}

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
		tile = Classes.TabTileViewer.create(tab, tabGroup, this._tilesAsyncQueue, this._isIncognito());
		tile.initSelectMode(this._tileSelectedCb.bind(this), this.setSelectMode.bind(this, true));
	}

	tile.setSelectMode(this.isSelectMode());
	if(this.isSelectMode()) {
		if(tile.isSelected()) {
			// Since the tile is already selected, calling tile.setSelected() results in a
			// no-op, which is fine in general, except for the missing side effect that we
			// end up not updating the _multiSelectPanel._tabsStoreInView, so we need to
			// explicitly do that here. Don't call this._tileSelectedCb() here, because it
			// also tries to recompute the _multiSelectPanel's select state, which is an
			// expensive operation that will anyway be performed once at the end of this
			// loop of tiles re-rendering.
			this._multiSelectPanel.addTab(tab);
		} else {
			tile.setSelected(this._multiSelectPanel.hasTab(tab));
		}
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
				let tilesGroupViewer = Classes.TilesGroupViewer.create(tabGroup, this._expandedGroups,
																		this._isIncognito());
				this._containerViewer.append(tilesGroupViewer);
				this._renderTabsFlatInner(tilesGroupViewer, tabs, tabGroup);
			}
		}.bind(this)
	);
},

_logCachedTilesStats: function(logHead) {
	if(this._cachedTilesByTabId == null) {
		this._log(logHead, "no cache, no stats");
		return;
	}
	this._log(logHead, "reused", this._recycledTilesCnt, "tiles,",
				Object.keys(this._cachedTilesByTabId).length, "tiles still in cache");
	this._log(logHead, this._cachedTilesUpdateNeededCnt, "cached tiles needed a re-render");
},

_renderTabsFullMode: function(tabs) {
	const logHead = "TabsBsTabViewer::_renderTabsFullMode():";

	if(tabs.length == 0) {
		this._log(logHead, "no tabs");
		this._containerViewer.clear();
		return;
	}

	perfProf.mark("groupStart");
	let [ pinnedGroups, unpinnedGroups ] = this._groupsBuilder.groupByHostname(tabs);
	perfProf.mark("groupEnd");
	this._log(logHead, "pinnedGroups =", pinnedGroups, "unpinnedGroups =", unpinnedGroups);

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

_renderTabsSearchMode: function(tabs, newSearch) {
	const logHead = "TabsBsTabViewer::_renderTabsSearchMode():";

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

	if(tabs.length == 0) {
		this._log(logHead, "no results");
		return;
	}

	this._currentSearchResults = tabs;
	perfProf.mark("searchRenderStart");
	this._renderTabsFlatInner(this._containerViewer, tabs);
	perfProf.mark("searchRenderEnd");
	this._logCachedTilesStats(logHead);
},

// In theory, the only difference between this function and _renderTabsFullMode() is
// that _renderTabsFullMode() groups tabs, while this function doesn't. Eventually we
// should get to a point where "full mode" can pick whether or not tabs should be
// grouped (and how), and at that point there should be no reason for this separate
// function to exist.
// Do not add any "list selected" mode specific action here, any specific calculations
// or filtering on the "tabs" should be done outside of this function, this function
// should only do rendering.
_renderTabsListSelectedMode: function(tabs) {
	const logHead = "TabsBsTabViewer::_renderTabsListSelectedMode():";

	perfProf.mark("listSelectedSortStart");
	tabs = tabs.sort(Classes.TabNormalizer.compareTabsFn);
	perfProf.mark("listSelectedSortEnd");

	// This logic is very crude, ideally we should have a more seamless transition from
	// a set of tabs to a different set of tabs, but we're leaving that logic for later.
	this._containerViewer.clear();

	this._bodyElem.scrollTo(0, 0);

	if(tabs.length == 0) {
		this._log(logHead, "no tabs");
		return;
	}

	perfProf.mark("listSelectedRenderStart");
	this._renderTabsFlatInner(this._containerViewer, tabs);
	perfProf.mark("listSelectedRenderEnd");
	this._logCachedTilesStats(logHead);
},

// Used for debugging by tmUtils.showTabInfo()
getTabInfo: function(tabId) {
	return [ this._tabsManager.getTabByTabId(tabId), this._tilesByTabId[tabId] ];
},

// This is a static function, because we need it both in the "Enter" handler as
// well as in the "click" handler (see TabTileViewer), and there was no cleaner way
// to make this code available in both
activateTab: function(tab, incognito=false) {
	const logHead = "Classes.TabsBsTabViewer.activateTab(): ";
	if(tab.tm.type == Classes.TabNormalizer.type.TAB) {
		chromeUtils.activateTab(tab);
		return;
	}

	if(tab.tm.type == Classes.TabNormalizer.type.RCTAB) {
		// Use "tab.sessionId", not "tab.id", because "tab.id" has been modified by
		// tabNormalizer.normalize(), and it would not be recognized by chrome.sessions
		// anymore
		chromeUtils.wrap(chrome.sessions.restore, logHead, tab.sessionId);
		return;
	}

	// The tile is a bookmark or history item, not a tab/rcTab, we need to find an existing
	// tab already loaded with the current url, or open a new tab to handle the Enter/click
	chromeUtils.queryTabs({ url: tab.url, incognito }, logHead).then(
		function(tabList) {
			if(tabList.length == 0) {
				chromeUtils.loadUrl(tab.url, { incognito });
			} else {
				// Activate the first tab in the list with a matching URL
				chromeUtils.activateTab(tabList[0]);
			}
		} // Static function, don't "bind(this)"
	);
},

// Overrides BsTabViewer.discard()
discard: function() {
	if(!this._options.standardTabs && !this._options.incognitoTabs) {
		// This instance was a placeholder if both standardTabs and incognitoBsTab were disabled,
		// so there's nothing to discard in that case. Just don't forget to call the parent class...
		Classes.BsTabViewer.discard.call(this);
		return;
	}

	this._resetAsyncQueue(false);
	this._queryCycleNo++;

	this._queryAndRenderJob.discard();
	this._queryAndRenderJob = null;

	// Note that discarding the _multiSelectPanel before calling the parent's discard(), causes
	// some listener functions to be missing during the EventListenersWrapper.discard(), but that's
	// ok, EventListenersWrapper.unlisten() is protected against this case.
	if(this._multiSelectPanel != null) {
		this._multiSelectPanel.discard();
		this._multiSelectPanel = null;
	}

	Classes.BsTabViewer.discard.call(this);

	this._tabsManager.discard();
	this._tabsManager = null;
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
_activateSearchBox: function(active=true) {
	// Call the original function first
	Classes.SearchableBsTabViewer._activateSearchBox.apply(this, arguments);

	const logHead = "TabsBsTabViewer::_activateSearchBox(" + active + "):";
	// When search mode gets activated, we need to switch from a full view of
	// tabs and tabgroups to a view of only tabs. And viceversa when the search
	// mode gets deactivated.
	if(!active) {
		this._log(logHead, "switching to full render");
		// Switch back to the full view
		this._TabsBsTabViewer_searchBoxInactiveInner();
		// Since we're exiting the search, we need to re-render the full view
		this._queryAndRenderTabs();
	} else {
		this._log(logHead, "switching to search render");
		this._currentSearchResults = null;
		this._setSearchBoxCount();
		// Search mode and "list selected" mode are mutually exclusive, when you
		// enter one, you must exit the other
		this.setListSelectedMode(false);

		// We don't need to call this._queryAndRenderTabs() in this case, because
		// it's already being invoked as part of _searchBoxProcessData()
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
	Classes.TabsBsTabViewer.activateTab(this._currentSearchResults[0], this._isIncognito());
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
