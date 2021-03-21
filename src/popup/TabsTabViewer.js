// CLASS TilesGroupViewer
Classes.TilesGroupViewer = Classes.CollapsibleContainerViewer.subclass({
	__idPrefix: "TilesGroupViewer",

	_tabGroup: null,
	groupName: null,
	_expandedGroups: null,

_init: function(tabGroup, expandedGroups) {
	this._tabGroup = tabGroup;
	this._groupName = tabGroup.title;
	this._expandedGroups = expandedGroups;

	let options = {
		startExpanded: this._expandedGroups.has(this._groupName),
		htmlWhenEmpty: `<i class="text-muted small">No tabs</i>`,
		border: true,
	};

	// Overriding the parent class' _init(), but calling that original function first
	Classes.CollapsibleContainerViewer._init.call(this, options);
	const logHead = "TilesGroupViewer::_init(): ";

	this._TilesGroupViewer_render();

	// Note that we don't set a listener for this._expandedGroups, because we don't care
	// to auto-open the accordion if it gets open in the popup of another window...
},

_groupHeadingHtml: function() {
	let iconBadgeHtml = `
		<div class="tm-overlay tm-full-size">
			<div class="tm-icon-badge-pos small">
				<span class="badge tm-icon-badge bg-dark">${this._tabGroup.tabs.length}</span>
			</div>
		</div>
	`;

	// No icon badge for empty groups (pinned groups can show up empty)
	if(this._tabGroup.tabs.length == 0) {
		iconBadgeHtml = "";
	}

	let pinnedIconHtml = "";
	// If the group is pinned, add a thumbtack icon
	if(this._tabGroup.tm.pinned) {
		let extraClasses = [];
		if(!settingsStore.isGroupPinned(this._groupName)) {
			// If the group is not itself pinned, then it must be pinned due
			// to some of its inner tabs...
			extraClasses.push("text-secondary");
		}
		pinnedIconHtml = `
		<p class="m-0 pe-2">
			<span>${icons.thumbtack("tm-fa-thumbtack-group", ...extraClasses)}</span>
		</p>`;
	}

	// Do we need the attribute "width='16px'" in the <img> below, or are the min-width
	// and max-width settings of "tm-favicon-16" enough?
	// "width: 95%" because we don't want to push the caret on the right too far out
	// when the group title is long.
	// "text-align: left;" is required because we're inside a button (the accordion button),
	// and that sets center alignment.
	let retVal = `
		<div class="tm-stacked-below" style="width: 95%;">
			<div class="d-flex">
				<p class="flex-grow-1 m-0 text-nowrap text-truncate" style="text-align: left;">
					<span class="pe-2"><img class="tm-favicon-16" src="${this._tabGroup.favIconUrl}"></span>
					<span>${this._groupName}</span>
				</p>
				${pinnedIconHtml}
			</div>
			${iconBadgeHtml}
		</div>
	`;
	return retVal;
},

_TilesGroupViewer_render: function() {
	this.setHeadingHtml(this._groupHeadingHtml());
	this.addExpandedStartListener(this._containerExpandedCb.bind(this));
	this.addCollapsedStartListener(this._containerCollapsedCb.bind(this));

	if(this._tabGroup.type == Classes.GroupsBuilder.Type.CUSTOM) {
		let cgm = settingsStore.getCustomGroupsManager();
		this.addHeadingClasses("tm-customgroup-header", "tm-callout", cgm.getCustomGroupCss(this._groupName));
	} else {
		this.addHeadingClasses("tm-customgroup-header");
	}
},

// This function tracks whether a specific group key is currently expanded or collapsed.
// This info must be stored in chrome.storage.local because we want to remember which
// tabs are collapsed/expanded across opening and closing the popup.
// Note that the current storage strategy might cause old group keys to persist in
// chrome.storage.local even if the group disappears. This is the main reason why we
// only store "expanded" state, and delete when the state goes back to "collapsed".
// This way at least only the groups that disappeared expanded stay stored.
// Once we implement expand/collapse all will be able to clear completely the persistent
// state when "collapse all" is done.
_storeExpandedGroup: function(expanded) {
	expanded = optionalWithDefault(expanded, true);
	//const logHead = "TilesGroupViewer::_storeExpandedGroup(" + this._groupName + ", " + expanded + "): ";

	if(expanded) {
		this._expandedGroups.add(this._groupName);
	} else {
		this._expandedGroups.del(this._groupName);
	}
},

_containerExpandedCb: function(ev) {
	const logHead = "TilesGroupViewer::_containerExpandedCb(" + this._groupName + ", " + ev.target.id + "): ";
	this._log(logHead + "container expanded", ev);

	// The animation and visualization is done by Bootstrap, we just need to remember
	// whether it's collapsed or expanded
	this._storeExpandedGroup();
},

_containerCollapsedCb: function(ev) {
	const logHead = "TilesGroupViewer::_containerCollapsedCb(" + this._groupName + ", " + ev.target.id + "): ";
	this._log(logHead + "container collapsed", ev);

	// The animation and visualization is done by Bootstrap, we just need to remember
	// whether it's collapsed or expanded
	this._storeExpandedGroup(false);
},

}); // Classes.TilesGroupViewer


// CLASS TabsTabViewer
//
// Abstract class, parent of all Viewers of tab lists
Classes.TabsTabViewer = Classes.SearchableTabViewer.subclass({

	_containerViewer: null,
	_groupsBuilder: null,

	// If grouping is displaying, we need to track which groups are collapsed (default)
	// and which groups are expanded, otherwise every redraw (happening at every tab
	// event) will re-collapse all groups.
	// We also want to store these expanded groups in storage, so we can remember which
	// groups are expanded when the popup is closed and then reopened.
	// _expandedGroups is a PersistentSet, and it needs to be set by the subclass,
	// since different subclasses might need to track a different set of groups.
	_expandedGroups: null,

	// This is a sorted list of tabs, as they appear in the search results
	_currentSearchResults: null,

	// String to show when the container is empty
	_emptyContainerString: null,

	_searchQuery: null,

	// This is a recurring job. We start it when we do a full refresh, and we stop it when
	// we get to zero tabs in status "loading"
	_issue01WorkaroundJob: null,
	_issue01WorkaroundInterval: 5000,

	_queryAndRenderJob: null,
	// Delay before a full re-render happens. Use this to avoid causing too many re-renders
	// if there are too many events.
	_queryAndRenderDelay: 200, //2000,

	_updateSearchResultsJob: null,
	// Delay before a full re-render happens (search case). Use this to avoid causing too many
	// re-renders if there are too many bookmarks/history events during search.
	// Query changes are already rate-limited by the "search" input box, no need to add an
	// extra rate-limiting, worst case you'll have one _updateSearchResults() running because
	// of a query change and one running because of a rate-limited bookmarks/history event.
	_updateSearchResultsDelay: 200, //2000,

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

	_tilesAsyncQueue: null,

	// Object containing all current known tabs
	_normTabs: null,

	_historyFinder: null,

	_stats: null,

_init: function(tabLabelHtml) {
	// Overriding the parent class' _init(), but calling that original function first
	Classes.SearchableTabViewer._init.apply(this, arguments);

	const logHead = "TabsTabViewer::_init(): ";
	this.debug();

	this._assert(this._expandedGroups != null,
				logHead + "subclasses must define _expandedGroups");

	this._resetStats();

	this._issue01WorkaroundJob = Classes.ScheduledJob.create(this._issue01Workaround.bind(this), "issue01Workaround");
	this._issue01WorkaroundJob.debug();

	this._queryAndRenderJob = Classes.ScheduledJob.create(this._queryAndRenderTabs.bind(this), "queryAndRender");
	this._queryAndRenderJob.debug();

	this._updateSearchResultsJob = Classes.ScheduledJob.create(this._updateSearchResults.bind(this), "updateSearchResults");
	this._updateSearchResultsJob.debug();

	bookmarksManager.addEventListener(Classes.EventManager.Events.UPDATED, this._bookmarkUpdatedCb.bind(this));

	this._historyFinder = Classes.HistoryFinder.create();
	this._historyFinder.addEventListener(Classes.EventManager.Events.UPDATED, this._historyUpdatedCb.bind(this));

	this._groupsBuilder = Classes.GroupsBuilder.create();
	// Call this function before rendering, because it sets _renderTabs(), which
	// would otherwise be null
	this._TabsTabViewer_searchBoxInactiveInner();
	this._TabsTabViewer_render();

	this._registerChromeCallbacks();

	settingsStore.addEventListener(Classes.EventManager.Events.UPDATED, this._settingsStoreUpdatedCb.bind(this));
},

_resetStats: function() {
	this._stats = {
		issue01Hit: 0,
	};
},

// These Chrome callbacks are very incomplete, and the only reasonable action to take
// on receiving them is to re-query/re-render everything. We tried to be smarter about
// it, but the lack of information is too much:
// - When you get onActivated for tab1, you don't know which tab2 has been deactivated
// - When you get onHighlighted, you only know when a tab gained highlighted, not when
//   it lost it
// - When you get onMoved, you know the new index of the tab that was moved, but not the
//   shifted indices of all the other tabs that have been pushed around because of the move
// - Similarly, when you get onRemoved, all the indices of the tabs to the right of the
//   removed tab change, but you don't get notified about it
// - When you get onCreated, the tab is not completely ready, and you need to wait for
//   onUpdated anyway.
_registerChromeCallbacks: function() {
	// https://developer.chrome.com/docs/extensions/reference/tabs/#event-onCreated
	chrome.tabs.onCreated.addListener(this._tabCreatedCb.bind(this));

	// https://developer.chrome.com/docs/extensions/reference/tabs/#event-onUpdated
	// Note that chrome.tabs.onUpdated does NOT include updated to the "active" and
	// "highlighted" property of a tab. For that you need to listen to chrome.tabs.onActivated
	// and onHighlighted, though you'll only be able to learn which tabs are gaining
	// "active" and "highlighted", not which tabs are losing them.
	chrome.tabs.onUpdated.addListener(this._tabUpdatedCb.bind(this, Classes.TabsTabViewer.CbType.UPDATED));
	// https://developer.chrome.com/docs/extensions/reference/tabs/#event-onActivated
	chrome.tabs.onActivated.addListener(this._tabActivatedHighlightedCb.bind(this, Classes.TabsTabViewer.CbType.ACTIVATED));
	// https://developer.chrome.com/docs/extensions/reference/tabs/#event-onHighlighted
	chrome.tabs.onHighlighted.addListener(this._tabActivatedHighlightedCb.bind(this, Classes.TabsTabViewer.CbType.HIGHLIGHTED));
	// Unfortunately closing a tab doesn't get considered an update to the tab, so we must
	// register for this other event too...
	// https://developer.chrome.com/docs/extensions/reference/tabs/#event-onRemoved
	chrome.tabs.onRemoved.addListener(this._tabUpdatedCb.bind(this, Classes.TabsTabViewer.CbType.REMOVED));
	// https://developer.chrome.com/docs/extensions/reference/tabs/#event-onAttached
	chrome.tabs.onAttached.addListener(this._tabUpdatedCb.bind(this, Classes.TabsTabViewer.CbType.ATTACHED));
	// https://developer.chrome.com/docs/extensions/reference/tabs/#event-onMoved
	chrome.tabs.onMoved.addListener(this._tabUpdatedCb.bind(this, Classes.TabsTabViewer.CbType.MOVED));
},

_tabCreatedCb: function(tab) {
	const logHead = "TabsTabViewer::_tabCreatedCb(tabId = " + tab.id + "): ";

	// This check probably doesn't make sense, the _tabCreatedCb() for our own popup
	// window should have already expired by the time we started running our logic...
	// anyway, just in case...
	if(tab.id == popupDocker.getOwnTabId()) {
		this._log(logHead + "suppressing notification for our own tab ID");
		return;
	}

	this._log(logHead + "entering");
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
	//
	// No reason to update the _normTabs and the shortcutsManager if we don't
	// have any delay before a full query/re-render.
	this._queryAndRenderJob.run();
},

_tabActivatedHighlightedCb: function(cbType, activeHighlightInfo) {
	// We want to reintroduce the initial "tabId" to make the callbacks of this class
	// more uniform. Note that only "onActivated" has "activeHighlightInfo.tabId", while
	// "onHighlighted" will set the field to "undefined" (which is ok).
	this._tabUpdatedCb(cbType, activeHighlightInfo.tabId, activeHighlightInfo);
},

_renderTileBodies: function() {
	// Object iteration, ECMAScript 2017 style
	// See https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/entries
	try {
		for(const [ tabId, tile ] of Object.entries(this._tilesByTabId)) {
			let tab = this._normTabs.getTabByTabId(tabId);
			if(tab != null) {
				tile.update(tab);
			} else {
				const logHead = "TabsTabViewer::_renderTileBodies(): ";
				this._err(logHead + "unexpected, tile tracks non-existing tabId = " + tabId);
			}
//			this._tilesAsyncQueue.enqueue(tile.renderBody.bind(tile),
//						"TabsTabViewer::_renderTileBodies(), tabId = " + tabId);
		}
	} catch(e) {
		this._err(e, "this._tilesByTabId: ", this._tilesByTabId);
	}
},

_settingsStoreUpdatedCb: function(ev) {
	const logHead = "TabsTabViewer::_settingsStoreUpdatedCb(" + ev.detail.key + "): ";
	if(this._normTabs == null) {
		this._log(logHead + "_normTabs not initialized ye, skipping event");
		return;
	}

	this._log(logHead + "entering");

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
	// So it's incorrect to say "group membership has not changed"
	if(this.isSearchActive() || ev.detail.key == "customGroups" || ev.detail.key == "pinnedGroups") {
		this._queryAndRenderJob.run(this._queryAndRenderDelay);		
		return;
	}
	// Not a search case, just normalize the search badges (configuration changes
	// can cause changes to the visible badges) and then render the tiles
	this._normTabs.normalizeAll()
	this._renderTileBodies();
},

_setTabProp: function(prop, tabId) {
	const logHead = "TabsTabViewer::_setTabProp(" + tabId + "): ";
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
	// Note that internally TabTileViewer.update() enqueues the heavy processing
	// inside this._tilesAsyncQueue, so the tile re-rendering is sequenced
	// correctly against other calls on the same tile (though if there was
	// another queued call for the same tile, having multiple calls queued
	// would be a waste of cycles).
	this._tilesByTabId[tabId].update(tab);
},

// Sometimes opening a new tab or reloading a tab causes the tab to stay in "loading"
// status until some other event in the future triggers a full refresh.
// During pinned bookmark testing we saw this sequence pretty consistently:
// - UPDATE1: changeInfo: status = complete (and indeed the tab data shows that)
// - UPDATE2: changeInfo: title = xyz (but the tab data show status = "loading",
//   though status is not listed in changeInfo)
// - chrome.tabs.get() triggered by UPDATE2: if done too soon after UPDATE2,
//   the query says that status = "loading", while if you wait a little longer,
//   it says that status = "complete"
//   * Not clear what's the right amount of time we should wait, for some websites
//     0.5s was enough, during a reload of Yahoo Mail 5s was not enough
//     - But in both cases, you'd see a transition to "complete", then back to "loading"
// The timing and sequencing is not fixed, most of the time the "complete" event
// arrived before the "title" event, sometimes (not very often, and only when adding
// code and chaing the timing of the sequence) we've seen them arrive in reverse order,
// making "loading" go away appropriately.
//
// Decided to implement an ugly workaround: whenever we start a new full refresh cycle
// we start a monitoring job running the function below. NormalizedTabs tracks which
// tabs are in status "loading" when they get normalized, then this function calls
// chrome.tabs.get() on each one of the loading tabs, and if at least one of them has
// changed status, it triggers a full refresh again. We don't try to update the tab
// and tile directly from this function, because who knows what has changed overall,
// the function just monitors status. Note that the function is not guaranteed to be
// catching only the bad case we're working around: in some cases it might just see
// a status change before we had time to process the event that carried that information.
// So don't take this._stats.issue01Hit too literally...
_issue01Workaround: function() {
	const logHead = "TabsTabViewer::_issue01Workaround(): ";

	if(this._normTabs == null) {
		this._log(logHead + "no _normTabs");
		return;
	}

	let tabsLoading = this._normTabs.getTabsLoading();
	let tabIdList = Object.keys(tabsLoading);

	if(tabIdList.length == 0) {
		this._log(logHead + "no tabs in \"loading\" status, nothing to do, stopping job");
		this._issue01WorkaroundJob.stop();
		return;
	}

	this._log(logHead + "checking " + tabIdList.length + " tabs in \"loading\" status", tabsLoading);

	let tabPromises = new Array(tabIdList.length);
	for(let i = 0; i < tabIdList.length; i++) {
		// Note that we need to turn "tabIdList[i]" (a string) into an integer
		tabPromises[i] = chromeUtils.wrap(chrome.tabs.get, logHead, +tabIdList[i]);
	}

	Promise.all(tabPromises).then(
		function(tabs) {
			this._log(logHead + "got these results:", tabs);
			for(let i = 0; i < tabs.length; i++) {
				let tab = tabs[i];
				if(tab == null) {
					this._log(logHead + "at least one tab disappeared, refreshing all", tab);
					this._stats.issue01Hit++;
					this._queryAndRenderJob.run(this._queryAndRenderDelay);
					return;
				}
				if(tab.status != "loading") {
					this._log(logHead + "at least one tab has changed status, refreshing all", tab);
					this._stats.issue01Hit++;
					this._queryAndRenderJob.run(this._queryAndRenderDelay);
					return;
				}
				this._log(logHead + "all tabs are still in \"loading\" status");
			}
		}.bind(this)
	);
},

_immediateTabUpdate: function(tabId, tab) {
	const logHead = "TabsTabViewer::_immediateTabUpdate(" + tabId + "): ";

	if(tabId in this._tilesByTabId) {
		// Note that only "Classes.TabsTabViewer.CbType.UPDATED" includes "tab".
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
		this._tilesByTabId[tabId].update(tab);
	} else {
		this._log(logHead + "skipping immediate processing, no tile for this tab");
	}
},

_tabUpdatedCb: function(cbType, tabId, activeChangeRemoveInfo, tab) {
	const logHead = "TabsTabViewer::_tabUpdatedCb(" + cbType + ", " + tabId + "): ";

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
		// case because we loop through all the results of chrome.tabs.query() without
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
		case Classes.TabsTabViewer.CbType.REMOVED:
			// Like in the case of onCreated, when a tab is removed we want to run the
			// full re-render immediately.
			//
			// No reason to update the _normTabs and the shortcutsManager if we don't
			// have any delay before a full re-query/re-render
			this._queryAndRenderJob.run();
			break;
		case Classes.TabsTabViewer.CbType.UPDATED:
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
			break;
		case Classes.TabsTabViewer.CbType.ACTIVATED:
			if(this._queryAndRenderDelay != null && this._queryAndRenderDelay != 0) {
				this._setTabProp("active", tabId);
			}
			this._queryAndRenderJob.run(this._queryAndRenderDelay);
			break;
		case Classes.TabsTabViewer.CbType.HIGHLIGHTED:
			if(this._queryAndRenderDelay != null && this._queryAndRenderDelay != 0) {
				activeChangeRemoveInfo.tabIds.forEach(this._setTabProp.bind(this, "highlighted"));
			}
			this._queryAndRenderJob.run(this._queryAndRenderDelay);
			break;
		case Classes.TabsTabViewer.CbType.MOVED:
		case Classes.TabsTabViewer.CbType.ATTACHED:
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
					if(cbType == Classes.TabsTabViewer.CbType.ATTACHED) {
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

_bookmarkUpdatedCb: function(ev) {
	// Most bookmarksManager updates are needed only during searches, but if there
	// is at least one pinned bookmark, all bookmark updates need to monitored
	// also during non-search tile rendering...
	this._queryAndRenderJob.run(this._queryAndRenderDelay);
},

_historyUpdatedCb: function(ev) {
	// In theory we could just call a removeEventListener() when we get out of search
	// mode, but this code seems harmless enough
	if(!this.isSearchActive()) {
		// All the history events can be ignored when not in search mode
		return;
	}
	
	// The tabs have not changed, but it would be a bit more (code) trouble to try
	// to only update the info from the _historyFinder, and merge it with the
	// existing tabs. Maybe one day we'll have time for that optimization, for
	// now we just pretend the search query has changed...
	this._updateSearchResultsJob.run(this._updateSearchResultsDelay);
},

_TabsTabViewer_render: function() {
	this._containerViewer = Classes.ContainerViewer.create(this._emptyContainerString);
	this._queryAndRenderTabs().then(
		function() {
			perfProf.mark("attachContainerStart");
			//this._containerViewer.attachToElement(this.getBodyElement());
			this.append(this._containerViewer);
			perfProf.mark("attachContainerEnd");
			perfProf.measure("Attach tiles cont.", "attachContainerStart", "attachContainerEnd");
		}.bind(this)
	);
},

// Subclasses must override this function. This function is expected to return
// a Promise that resolves to a function(tabs){}.
_tabsAsyncQuery: function() {
	// e.g. for pinned tabs:
	// return chromeUtils.wrap(chrome.tabs.query, logHead, { pinned: true })
	this._errorMustSubclass("TabsTabViewer::_tabsAsyncQuery()");
	throw(new Error("must subclass"));
},

// Add pinInheritance information to tabs that are mapped to pinned bookmarks,
// and possibly clean up the title of the tab when necessary (see inside the
// function for details).
// Optionally (controlled by "returnBookmarks"), also return pinned bookmarks,
// filtering out those that have a corresponding tab present. For pinned bookmarks
// mapped to one or more tabs (by URL match), we hide the bookmark and show only
// the tab(s).
//
// As of right now, the two cases when "returnBookmarks" can be "false" are when
// this.isSearchActive() is true and when we're calling this function from the
// Chrome.tabs "onUpdate" event handler.
//
// Note that "returnBookmarks" is not an optional parameter, but if you set it
// to false, the function always returns an empty array.
//
// "returnBookmarks" might be a very silly optimization, it only saves a bunch
// of push() calls...
_processPinnedBookmarks: function(tabs, returnBookmarks) {
	const logHead = "TabsTabViewer::_processPinnedBookmarks(" + returnBookmarks + "): ";

	let pinnedBookmarks = bookmarksManager.getPinnedBookmarks();
	let filteredPinnedBookmarks = [];

	if(pinnedBookmarks.length == 0) {
		this._log(logHead + "no pinned bookmarks");
		return [];
	}

	this._log(logHead + "processing pinned bookmarks", pinnedBookmarks);

	// Note that we need to go through this loop in both standard and search mode,
	// because in both cases we want to show the "inherited pin" on the regular tab.
	// On the other hand, in search mode we never want to add the bookmark to the
	// "tabs", otherwise the bookmark will show up twice (once through here, then
	// through the standard search mechanism of bookmarksManager.find().
	for(let i = 0; i < pinnedBookmarks.length; i++) {
		let bmNode = pinnedBookmarks[i];
		let tabIdx = tabs.findIndex((tab) => (tab.url == bmNode.url) || (tab.pendingUrl == bmNode.url));
		if(tabIdx != -1) {
			let tab = tabs[tabIdx];
			// Unfortunately we can't add "pinInherited" to tabs[tabIdx].tm, because
			// ".tm" has yet to be assigned by NormalizedTabs, but we can't wait to
			// call this function after the call to NormalizedTabs (it would break
			// at least staging if we added pinned bookmarks later).
			// It's ok to add "pinInherited" at the top level within "tabs[tabIdx]".
			tab.pinInherited = {
				type: "bookmark",
				id: bmNode.bookmarkId,
			};
			// We found a matching tab, skip the bookmark.
			if(returnBookmarks) {
				// No need to print a message in search mode, in search mode we always
				// skip all the bmNodes
				this._log(logHead + "found tab, skipping bookmark", tab, bmNode);
			}
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

			continue;
		}
		if(returnBookmarks) {
			// No matching tab and not in search mode, add the bookmark
			filteredPinnedBookmarks.push(bmNode);
		}
	}

	if(returnBookmarks) {
		this._log(logHead + "pinned bookmarks added:", filteredPinnedBookmarks);
	}
	return filteredPinnedBookmarks;
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

_resetAsyncQueue: function() {
	if(this._tilesAsyncQueue != null) {
		this._tilesAsyncQueue.discard();
	}
	this._tilesAsyncQueue = Classes.AsyncQueue.create();
},

_prepareForNewCycle: function() {
	this._recycledTilesCnt = 0;
	this._cachedTilesUpdateNeededCnt = 0;
	this._cachedTilesByTabId = this._tilesByTabId;
	this._tilesByTabId = {};
	this._resetAsyncQueue();
},

_queryAndRenderTabs: function() {
	const logHead = "TabsTabViewer::_queryAndRenderTabs(): ";
	this._log(logHead + "entering");
	this.blink();
	perfProf.mark("queryStart");
	return this._tabsAsyncQuery().then(
		function(tabs) {
			perfProf.mark("queryEnd");

			let pinnedBookmarks = this._processPinnedBookmarks(tabs, !this.isSearchActive());
			perfProf.mark("pinnedBookmarksEnd");

			if(window.tmStaging !== undefined) {
				// This code path should only be entered when staging TabMania to take
				// screenshots for publishing on the Chrome Web Store. Let's generate
				// an error so it's clear/obvious we've entered this path.
				this._err(logHead + "entering staging path");
				// Ignore actual response from chrome.tabs.query() and replace it with
				// a fictictious set of tabs. Edit the tabs as much as you'd like, just
				// make sure the tab IDs remain unique.
				tabs = tmStaging.tabList;
			}
//			this._log(logHead + "tabs received, processing", JSON.stringify(tabs));
			this._log(logHead + "tabs received, processing");
			this._prepareForNewCycle();

			this._issue01WorkaroundJob.start(this._issue01WorkaroundInterval, false);
			try {
				// Normalize the incoming tabs. Note that the normalization
				// and sorting happens in place in "tabs", so after create()
				// we can just ignore the "normTabs" object... but to be
				// good future-proof citizens, let's call the right interface...
				//
				// "pinnedBookmarks" are already fully normalized by bookmarksManager,
				// no reason for them to be normalized again.
				this._normTabs = Classes.NormalizedTabs.create(tabs);

				perfProf.mark("shortcutsStart");
				// Note that we need to make this call only when the tabs change,
				// not when the settingsStore configuration changes (in that case
				// updateTabs() is done automatically inside the shortcutManager)
				settingsStore.getShortcutsManager().updateTabs(this._normTabs.getTabs());
				// Classes.NormalizedTabs.create() automatically normalizes the tabs,
				// but when it's done, the ShortcutsManager is not configured, so
				// the tabs are normalized without accurate shortcut badges. This
				// means that we update ShortcutsManager, we must update the normalization
				// to make sure it reflets the potentially updated shortcut badges.
				// Note that we can't normalize only once, because ShortcutManager
				// needs some elements of normalization in order to prepare the
				// shortcut information correctly. Calling normalization twice is
				// unavoidable, though if this was really a performance problem
				// (it doesn't seem to be) we could add a flag to normalizeAll()
				// to instruct it to skip shortcut badges, or to only do shortcut
				// badges, and that way, each normalizeAll() would actually normalize
				// disjoint subsets of information, and we'd have no duplication.
				// Given the profiling results, this optimization doesn't seem to
				// be worth the effort... though it's tempting, as it would be
				// a cleaner solution. The real effort would be in the fact that
				// when we update the shortcut badges we also need to update the
				// hidden search badges, and to keep them "clean" (no duplications)
				// we'd always need to refresh all search badges from scratch (or
				// do some proper diffs of the hidden search badges)... too much
				// work.
				this._normTabs.normalizeAll();

				perfProf.mark("renderStart");
				// Never merge "pinnedBookmarks within the tabs managed by this._normTabs,
				// because if you do, when search starts the pinned bookmarks might show
				// up twice. "pinnedBookmarks" are an empty array in search mode, but when
				// starting a search we blindly take whatever is in ths._normTabs from when
				// we were in standard mode (because we assume that starting a search doesn't
				// change the tabs, so no need to trigger another full query). By concatenating
				// the "pinnedBookmarks" only when calling _renderTabs() we're safe from
				// that potential problem.
				this._renderTabs(this._normTabs.getTabs().concat(pinnedBookmarks));
				perfProf.mark("renderEnd");
				
				perfProf.measure("Query", "queryStart", "queryEnd");
				perfProf.measure("Pinned bookmarks", "queryEnd", "pinnedBookmarksEnd");
				perfProf.measure("Shortcuts", "shortcutsStart", "renderStart");
				perfProf.measure("Rendering", "renderStart", "renderEnd");

				// This piece of logic will need to be added when "chrome tab groups"
				// APIs become available.
				//this._getAllTabGroups().then(this._processTabGroupsCb.bind(this));
				
			} catch(e) {
				this._err(e);
			}
		}.bind(this)
	);
},

// This function gets assigned to either _standardRenderTabs() or _searchRenderTabs()
// at runtime by _activateSearchBox()
_renderTabs: null,

_standardRenderTabs: function(tabs) {
	const logHead = "TabsTabViewer::_standardRenderTabs(): ";

	// We need to clear() in all cases. This logic is very crude, ideally we should have
	// a more seamless transition from a set of tabs to a different set of tabs, but
	// we're leaving that logic for later.
	this._containerViewer.clear();

	perfProf.mark("groupStart");
	let [ pinnedGroups, unpinnedGroups ] = this._groupsBuilder.groupByHostname(tabs);
	perfProf.mark("groupEnd");
	this._log(logHead + "pinnedGroups = ", pinnedGroups);
	this._log(logHead + "unpinnedGroups = ", unpinnedGroups);

	perfProf.mark("tilesStart");
	if(tabs == null || tabs.length == 0) {
		this._log(logHead + "no tabs");
	} else {
		// Pinned first, then unpinned
		this._renderTabsByGroup(pinnedGroups);
		this._renderTabsByGroup(unpinnedGroups);
	}
	this._logCachedTilesStats(logHead);
	perfProf.mark("tilesEnd");
				
	perfProf.measure("Create groups", "groupStart", "groupEnd");
	perfProf.measure("Render tiles", "tilesStart", "tilesEnd");
},

// This function assumes "tabs" is not empty
// "tabGroup" is optional. If specified, it will be used by the tile to pick a
// default tile favicon if the tab itself doesn't have one.
_renderTabsFlatInner: function(containerViewer, tabs, tabGroup) {
	const logHead = "TabsTabViewer::_renderTabsFlatInner(): ";

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
	const logHead = "TabsTabViewer::_renderTabsByGroup(): ";

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
	// if it happens, we need to make sure they don't both try to use the same tile...
	delete this._cachedTilesByTabId[tab.id];

	// Update the tile fo this new cycle

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
	//const logHead = "TabsTabViewer::_renderTile(): ";
	let tile = this._getCachedTile(tab, tabGroup);

	if(tile == null) {
		// No cache, or not found in cache
		tile = Classes.TabTileViewer.create(tab, tabGroup, this._tilesAsyncQueue);
	}

	containerViewer.append(tile);
	this._tilesByTabId[tab.id] = tile;
},

_getAllTabGroups: function() {
	const logHead = "TabsTabViewer::_getAllTabGroups(): ";
	// This call is still failing on the default channel (only available in the dev channel)
	// as of Chrome v.88.0.4324.104 (date 21.01.24)
	return chromeUtils.wrap(chrome.tabGroups.query, logHead, {});
},

// Used for debugging by tmUtils.showTabInfo()
getTabInfo: function(tabId) {
	return [ this._normTabs.getTabByTabId(tabId), this._tilesByTabId[tabId] ];
},

// TBD when Chrome tabGrops APIs become generally available
_processTabGroupsCb: function(tabGroups) {
	const logHead = "TabsTabViewer::_processTabGroupsCb(): ";
	this._log(logHead, tabGroups);
},

// This is a static function, because we need it both in the "Enter" handler as
// well as in the "click" handler (see TabTileViewer), and there was no cleaner way
// to make this code available in both
activateTab: function(tab) {
	const logHead = "Classes.TabsTabViewer.activateTab(): ";
	if(tab.tm.type == Classes.NormalizedTabs.type.TAB) {
		chromeUtils.activateTab(tab.id);
		return;
	}

	if(tab.tm.type == Classes.NormalizedTabs.type.RCTAB) {
		// Use "tab.sessionId", not "tab.id", because "tab.id" has been modified by
		// NormalizedTabs.normalizeTab(), and it would not be recognized by chrome.sessions
		// anymore
		chromeUtils.wrap(chrome.sessions.restore, logHead, tab.sessionId);
		return;
	}

	// The tile is a bookmark or history item, not a tab/rcTab, we need to find an existing
	// tab already loaded with the current url, or open a new tab to handle the Enter/click
	chromeUtils.wrap(chrome.tabs.query, logHead, { url: tab.url }).then(
		function(tabList) {
			if(tabList.length == 0) {
				chromeUtils.loadUrl(tab.url);
			} else {
				// Activate the first tab in the list with a matching URL
				chromeUtils.activateTab(tabList[0].id);
			}
		} // Static function, don't "bind(this)"
	);
},


///// Search-related functionality

// See Classes.SearchableTabViewer._activateSearchBox() for details about why
// we separated out this sub-function, and call only this standalong at _init()
// time (instead of just calling _activateSearchBox(false)).
_TabsTabViewer_searchBoxInactiveInner: function() {
	this._currentSearchResults = null;
	this._searchQuery = null;
	this._renderTabs = this._standardRenderTabs;
	// Reset any message that might have been displaying...
	this.setMessage();
},

// Override this function from Classes.SearchableTabViewer
_activateSearchBox: function(active) {
	// Call the original function first
	Classes.SearchableTabViewer._activateSearchBox.apply(this, arguments);

	active = optionalWithDefault(active, true);

	const logHead = "TabsTabViewer::_activateSearchBox(" + active + "): ";
	// When search mode gets activated, we need to switch from a standard view of
	// tabs and tabgroups to a view of only tabs. And viceversa when the search
	// mode gets deactivated.
	if(!active) {
		this._log(logHead, "switching to standard render");
		// Switch back to the standard view
		this._TabsTabViewer_searchBoxInactiveInner();
		// Since we're exiting the search, we need to re-render the standard view:
		// since we didn't have tiles for some of the tabs, some updates have not
		// been processed in the _normTabs info, and we can't rely on what we have
		// there to be updated.
		this._queryAndRenderTabs();
	} else {
		this._log(logHead, "switching to search render");
		this._searchQuery = Classes.SearchQuery.create();
		this._currentSearchResults = null;
		this._setSearchBoxCount();
		this._renderTabs = this._searchRenderTabs;
		// We don't need to call this._queryAndRenderTabs() in this case, because
		// it's already being invoked as part of _searchBoxProcessData().
	}
},

// "newSearch" is an optional parameter that should be set to "true" only when the
// update is triggered by a change in the searchbox input, and left to "false" for
// all other cases (typically, updates triggered by tab/bookmark/history events where
// the searchbox input remains the same). The flag is needed to make sure we reset
// the scrolling position of the popup only when the new search results start to
// display (that is, at the same time the search count stop blinking). Doing it
// before that (in this function or in the caller, since searches are async) would
// result in an odd visual effect.
_updateSearchResults: function(newSearch) {
	newSearch = optionalWithDefault(newSearch, false);

	perfProf.mark("searchStart");
	this._prepareForNewCycle();
	this._searchRenderTabs(this._normTabs.getTabs(), newSearch);
	perfProf.mark("searchEnd");
},

_reportSearchParseErrors: function(errors) {
	let htmlMsgs = [];
	for(let i = 0; i < errors.length; i++) {
		htmlMsgs.push(`<p class="m-0">${this._safeText(errors[i])}</p>`);		
	}

	this.setMessage(htmlMsgs.join("\n"), true);
},

// Override this function from Classes.SearchableTabViewer
_searchBoxProcessData: function(value) {
	// If value.length == 0, this function doesn't get called...
	this._assert(value.length != 0);

	perfProf.mark("parseQueryStart");
	this._searchQuery.update(value);
	perfProf.mark("parseQueryEnd");

	let errors = this._searchQuery.getErrors();
	if(errors == null) {
		// Reset any message that might have potentially been displayed before
		this.setMessage();
	} else {
		this._reportSearchParseErrors(errors);
	}

	// Redraw the tab list.
	// We used to call "this._queryAndRenderTabs()" here, but there's no need
	// to query the tabs when this event happens, the tabs have not changed,
	// only the search box has changed.
	this._updateSearchResults(true);
	// Also, whenever the search input changes, scroll back to the top of the
	// new set of results
},

_respondToEnterKey: function(searchBoxText) {
	const logHead = "TabsTabViewer::_respondToEnterKey(" + searchBoxText + "): ";

	if(this._currentSearchResults == null) {
		this._log(logHead + "no search results, nothing to do");
		return;
	}

	this._log(logHead + "activating tab Id " + this._currentSearchResults[0].id +
					" (" + this._currentSearchResults[0].tm.type + ")");
	Classes.TabsTabViewer.activateTab(this._currentSearchResults[0]);
},

_searchRenderTabsInner: function(tabs, bmNodes, newSearch) {
	const logHead = "TabsTabViewer::_searchRenderTabsInner(): ";

	perfProf.mark("searchFilterStart");
	let searchResult = this._searchQuery.search(tabs, logHead);

	perfProf.mark("searchSortStart");
	// Using Array.concat() instead of the spread operator [ ...tabs, ...bmNodes] because
	// it seems to be faster, and because we're potentially dealing with large arrays here
	searchResult = searchResult.concat(bmNodes);
	searchResult = searchResult.sort(Classes.NormalizedTabs.compareTabsFn);
	perfProf.mark("searchSortEnd");

	// This logic is very crude, ideally we should have a more seamless transition from
	// a set of tabs to a different set of tabs, but we're leaving that logic for later.
	this._containerViewer.clear();

	this._setSearchBoxCountBlinking(false);
	this._setSearchBoxCount(searchResult.length);
	if(newSearch) {
		this._bodyElem.scrollTo(0, 0);
	}

	if(searchResult.length == 0) {
		this._log(logHead + "no tabs in search results");
		this._currentSearchResults = null;
	} else {
		this._currentSearchResults = searchResult;
		perfProf.mark("searchRenderStart");
		this._renderTabsFlatInner(this._containerViewer, searchResult);
		perfProf.mark("searchRenderEnd");
		this._logCachedTilesStats(logHead);
	}
},

_searchRenderTabs: function(tabs, newSearch) {
	const logHead = "TabsTabViewer::_searchRenderTabs(newSearch: " + newSearch + "): ";

	if(!this._searchQuery.isInitialized()) {
		// Sometimes users can enter search mode while this class is going through a
		// TabsTabViewer::_queryAndRenderTabs() for standard tabs. If that happens
		// while _queryAndRenderTabs() is waiting for the response from
		// chrome.tabs.query(), the transition to search mode will "hijack" the
		// _queryAndRenderTabs() cycle, by switching the pointer this._renderTabs to
		// this._searchRenderTabs() instead of this._standardRenderTabs().
		// Normally, when in search mode, this._searchRenderTabs() would be called
		// by _updateSearchResults() via _searchBoxProcessData() when the "input"
		// listener callback is invoked, and the input listener callback (which is
		// _searchBoxProcessData()) sets the _searchQuery to the value in the input
		// box before calling this._searchRenderTabs(). Since instead we have hijacked
		// a standart rendering cycle, this._searchRenderTabs() will be called when
		// chrome.tabs.query() (which was invoked for a standard render, not a search)
		// returns, and that can be before the input callback has time to run.
		// In that case the sequence is:
		// - Start _queryAndRenderTabs() for standard mode
		// - _activateSearchBox() gets called as part of the processing of the "keydown"
		//   event (which runs before the "input" event)
		// - this._renderTabs is switched to this._searchRenderTabs() inside _activateSearchBox()
		// - chrome.tabs.query() returns inside _queryAndRenderTabs()
		// - this._renderTabs() (and therefore this._searchRenderTabs()) is invoked to
		//   process the data from chrome.tabs.query()
		//   **** This check protects at this point in the sequence
		// - Finally the "input" event is triggered, and _searchBoxProcessData()
		//   sets the searchbox input value to the _searchQuery
		//   * this._searchRenderTabs() can only do processing correctly after this point
		//
		// Note that we can't anticipate the initialization of _searchQuery to the "keydown"
		// event (in _activateSearchBox()), because the "keydown" event knows the raw key
		// that was pressed, but can't know what that means for the input box (e.g., if
		// the raw key is "v" and the CTRL modifier is pressed, the "input" event will
		// report a bunch of text pasted from the clipboard, which the "keydown" event
		// had no idea of). So the only option is to discard any attempts to call this
		// function (this._searchRenderTabs()) until the "input" event has taken its sweet
		// time to get _searchQuery initialized.
		this._log(logHead + "_searchQuery still pending initialization, nothing to do");
		return;
	}

	// Give some feedback to the user in case this search is going to take a while...
	this._setSearchBoxCountBlinking();

	Promise.all([
		// Unlike bookmarks and history items that support search, recently closed tabs
		// don't support search, but there's only a maximum of 25 of them, so we can just
		// scoop them all up and pretend they were always together with the standard tabs
		this._historyFinder._getRecentlyClosedTabs(),
		bookmarksManager.find(this._searchQuery),
		this._historyFinder.find(this._searchQuery),
	]).then(
		function([ rcTabs, bmNodes, hItems ]) {
			// We need to this._containerViewer.clear() in all cases, but we're trying to
			// keep this clear() call as close as possible to the time of the new rendering.
			// If there's too much processing to do between clear() and render, users will
			// see an empty screen with the "no tabs" text displayed in the popup for the
			// duration of the processing. No reason to leave them hanging.
			// For this reason, we've moved this this._containerViewer.clear() call from
			// here to inside the this._searchRenderTabsInner() calls. A small duplication
			// for a good UX cause.

			// We're merging all tabs that still need to be searched. We're not including
			// bmNodes because bookmarks have already been searched via this._searchQuery.search(),
			// while history items have only been searched via chrome.history.search() (with
			// the simplified query string to boot), so it needs a second pass.
			// concat() dosn't modify "tabs", so this call is safe.
			let mergedTabs = tabs.concat(rcTabs, hItems);

			this._searchRenderTabsInner(mergedTabs, bmNodes, newSearch);
		}.bind(this)
	);
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

}); // Classes.TabsTabViewer

Classes.Base.roDef(Classes.TabsTabViewer, "CbType", {});
Classes.Base.roDef(Classes.TabsTabViewer.CbType, "ACTIVATED", "activated");
Classes.Base.roDef(Classes.TabsTabViewer.CbType, "HIGHLIGHTED", "highlighted");
Classes.Base.roDef(Classes.TabsTabViewer.CbType, "UPDATED", "updated");
Classes.Base.roDef(Classes.TabsTabViewer.CbType, "REMOVED", "removed");
Classes.Base.roDef(Classes.TabsTabViewer.CbType, "ATTACHED", "attached");
Classes.Base.roDef(Classes.TabsTabViewer.CbType, "MOVED", "moved");

// CLASS AllTabsTabViewer
//
Classes.AllTabsTabViewer = Classes.TabsTabViewer.subclass({

	_emptyContainerString: "No tabs",

_init: function(tabLabelHtml) {
	// Define _expandedGroups before calling the parent's _init(), as it might
	// need to do some rendering, which requires _expandedGroups to be known
	this._expandedGroups = localStore.allTabsTabExpandedGroups;
	// Overriding the parent class' _init(), but calling that original function first
	Classes.TabsTabViewer._init.apply(this, arguments);
},

// Override TabsTabViewer._tabsAsyncQuery()
_tabsAsyncQuery: function() {
	const logHead = "AllTabsTabViewer::_tabsAsyncQuery(): ";
	// Use an empty dictionary to query for all tabs
	return chromeUtils.wrap(chrome.tabs.query, logHead, {})
},

}); // Classes.AllTabsTabViewer

