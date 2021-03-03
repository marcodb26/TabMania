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
	this.addExpandedListener(this._containerExpandedCb.bind(this));
	this.addCollapsedListener(this._containerCollapsedCb.bind(this));

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

	// This will be initialized by the first call to _activateSearchBox()
	_currentSearchInput: null,
	// This is only for debugging, the actual processing depends on _searchCompareFn()
	_currentSearchMode: null,

	_queryAndRenderJob: null,
	// Delay before a full re-render happens. Use this to avoid causing too many re-renders
	// if there are too many events.
	_queryAndRenderDelay: 200, //2000,

	// Dictionary tracking all the tab tiles, in case we need to update their contents
	_tilesByTabId: null,
	_tilesAsyncQueue: null,

	// Object containing all current known tabs
	_normTabs: null,

	_bookmarksFinder: null,

_init: function(tabLabelHtml) {
	// Overriding the parent class' _init(), but calling that original function first
	Classes.SearchableTabViewer._init.apply(this, arguments);

	const logHead = "TabsTabViewer::_init(): ";
	this.debug();

	this._assert(this._expandedGroups != null,
				logHead + "subclasses must define _expandedGroups");

	this._queryAndRenderJob = Classes.ScheduledJob.create(this._queryAndRenderTabs.bind(this));
	this._queryAndRenderJob.debug();

	this._bookmarksFinder = Classes.BookmarksFinder.create();
	this._bookmarksFinder.addEventListener(Classes.EventManager.Events.UPDATED, this._bookmarkUpdatedCb.bind(this));

	this._groupsBuilder = Classes.GroupsBuilder.create();
	// Call this function before rendering, because it sets _renderTabs(), which
	// would otherwise be null
	this._TabsTabViewer_searchBoxInactiveInner();
	this._TabsTabViewer_render();

	this._bookmarkImportInProgress = false;
	this._registerChromeCallbacks();

	settingsStore.addEventListener(Classes.EventManager.Events.UPDATED, this._settingsStoreUpdatedCb.bind(this));
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

	// https://developer.chrome.com/docs/extensions/reference/sessions/#event-onChanged
	chrome.sessions.onChanged.addListener(this._recentlyClosedChangedCb.bind(this));
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
			this._tilesAsyncQueue.enqueue(tile.renderBody.bind(tile),
						"TabsTabViewer::_renderTileBodies(), tabId = " + tabId);
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
		this._log(logHead + "skipping processing, no tile for this tab");
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

	// Very crude... we re-render everything for every update. But at least we try
	// to reduce the frequency of the re-render in some cases.
	this._log(logHead + "entering");

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
				if(tabId in this._tilesByTabId) {
					// Note that only "Classes.TabsTabViewer.CbType.UPDATED" includes "tab".
					// All other types don't.
					// Anyway TabTileViewer.update() is protected against "tab == null".

					// First we want to normalize the updated tab (so there are no problems
					// rendering it in the tile), and replace it in the list, so that search can
					// find it with the right attributes
					this._normTabs.updateTab(tab);
					// Then update the shortcuts info, if needed
					settingsStore.getShortcutsManager().updateTabs(this._normTabs.getTabs());
					// Then we update the tile with the normalized info in place.
					// See also _setTabProp() for other considerations about calling
					// TabTileViewer.update().
					this._tilesByTabId[tabId].update(tab);
				} else {
					this._log(logHead + "skipping processing, no tile for this tab");
				}
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
	// In theory we could just call a removeEventListener() when we get out of search
	// mode, but this code seems harmless enough
	if(!this.isSearchActive()) {
		// All the bookmark events can be ignored when not in search mode
		return;
	}
	
	// The tabs have not changed, but it would be a bit more (code) trouble to try
	// to only update the info from the _bookmarksFinder, and merge it with the
	// existing tabs. Maybe one day we'll have time for that optimization, for
	// now we just pretend the search query has changed...
	this._updateSearchResults();
},

// This callback doesn't take any arguments
_recentlyClosedChangedCb: function() {
	if(!this.isSearchActive()) {
		// All recently closed tabs events can be ignored when not in search mode
		return;
	}
	this._updateSearchResults();
},

_TabsTabViewer_render: function() {
	this._containerViewer = Classes.ContainerViewer.create(this._emptyContainerString);
	this._queryAndRenderTabs().then(
		function() {
			perfProf.mark("attachContStart");
			//this._containerViewer.attachToElement(this.getBodyElement());
			this.append(this._containerViewer);
			perfProf.mark("attachContEnd");
			perfProf.measure("Attach tiles cont.", "attachContStart", "attachContEnd");
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

_resetAsyncQueue: function() {
	if(this._tilesAsyncQueue != null) {
		this._tilesAsyncQueue.discard();
	}
	this._tilesAsyncQueue = Classes.AsyncQueue.create();
},

_queryAndRenderTabs: function() {
	const logHead = "TabsTabViewer::_queryAndRenderTabs(): ";
	this._log(logHead + "entering");
	this.blink();
	perfProf.mark("queryStart");
	return this._tabsAsyncQuery().then(
		function(tabs) {
			perfProf.mark("queryEnd");
			this._log(logHead + "tabs received, processing");
			this._tilesByTabId = {};
			this._resetAsyncQueue();

			try {
				// Normalize the incoming tabs. Note that the normalization
				// and sorting happens in place in "tabs", so after create()
				// we can just ignore the "normTabs" object... but to be
				// good future-proof citizens, let's call the right interface...
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
				this._renderTabs(this._normTabs.getTabs());
				perfProf.mark("renderEnd");
				
				perfProf.measure("Query", "queryStart", "queryEnd");
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

_renderTile: function(containerViewer, tabGroup, tab) {
	//const logHead = "TabsTabViewer::_renderTile(): ";

	var tile = Classes.TabTileViewer.create(tab, tabGroup, this._tilesAsyncQueue);
	containerViewer.append(tile);
	this._tilesByTabId[tab.id] = tile;
},

_getAllTabGroups: function() {
	const logHead = "TabsTabViewer::_getAllTabGroups(): ";
	// This call is still failing on the default channel (only available in the dev channel)
	// as of Chrome v.88.0.4324.104 (date 21.01.24)
	return chromeUtils.wrap(chrome.tabGroups.query, logHead, {});
},

// TBD when Chrome tabGrops APIs become generally available
_processTabGroupsCb: function(tabGroups) {
	const logHead = "TabsTabViewer::_processTabGroupsCb(): ";
	this._log(logHead, tabGroups);
},

///// Search-related functionality

// See Classes.SearchableTabViewer._activateSearchBox() for details about why
// we separated out this sub-function, and call only this standalong at _init()
// time (instead of just calling _activateSearchBox(false)).
_TabsTabViewer_searchBoxInactiveInner: function() {
	this._currentSearchResults = null;
	this._currentSearchInput = "";
	this._currentSearchMode = "[ uninitialized ]";
	this._renderTabs = this._standardRenderTabs;
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
		this._currentSearchResults = null;
		this._setSearchBoxCount();
		this._renderTabs = this._searchRenderTabs;
		// We don't need to call this._queryAndRenderTabs() in this case, because
		// it's already being invoked as part of _searchBoxProcessData().
	}
},

_updateSearchResults: function() {
	perfProf.mark("searchStart");
	this._tilesByTabId = {};
	this._resetAsyncQueue();
	this._searchRenderTabs(this._normTabs.getTabs());
	perfProf.mark("searchEnd");
},

// Override this function from Classes.SearchableTabViewer
_searchBoxProcessData: function(value) {
	// If value.length == 0, this function doesn't get called...
	this._assert(value.length != 0);

	let searchMode = [];
	this._isTabInCurrentSearch = this._isTabInCurrentSearchPositive.bind(this);

	if(value[0] == "!") {
		searchMode.push("neg");
		this._isTabInCurrentSearch = this._isTabInCurrentSearchNegative.bind(this);
		// Move to the next character, the first character has been used
		value = value.substring(1);
	}

	if(value.length != 0 && value[0] == "^") {
		searchMode.push("startsWith");
		this._searchCompareFn = this._searchCompareFnInner.bind(this, "startsWith");
		value = value.substring(1);
	} else {
		searchMode.push("includes");
		this._searchCompareFn = this._searchCompareFnInner.bind(this, "includes");
	}

	this._currentSearchMode = searchMode.join("-");

	// Search is case insensitive
	this._currentSearchInput = value.toLowerCase();
	// Redraw the tab list.
	// We used to call "this._queryAndRenderTabs()" here, but there's no need
	// to query the tabs when this event happens, the tabs have not changed,
	// only the search box has changed.
	this._updateSearchResults();
},

// This is a static function, because we need it both in the "Enter" handler as
// well as in the "click" handler (see TabTileViewer), and there was no cleaner way
// to make this code available in both
activateTab: function(tab) {
	if(tab.tm.type == Classes.NormalizedTabs.type.TAB) {
		chromeUtils.activateTab(tab.id);
		return;
	}

	// The tile is a bookmark, not a tab, we need to find an existing tab already
	// loaded with the current shortcut, or open a new tab to handle the Enter/click
	chromeUtils.wrap(chrome.tabs.query, "Classes.TabsTabViewer.activateTab()", { url: tab.url }).then(
		function(tabList) {
			if(tabList.length == 0) {
				chromeUtils.loadUrl(tab.url);
			} else {
				// Activate the first tab in the list with a matching URL
				chromeUtils.activateTab(tabList[0].id);
			}
		}.bind(this)
	);
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

_searchCompareFnInner: function(fnName, targetString, searchString) {
	return targetString[fnName](searchString);
},

// Unlike _searchCompareFnInner(), _searchCompareFn has signature
// _searchCompareFn(targetString, searchString), that is, the "fnName"
// argument has been bound when the _searchCompareFn value has been assigned
_searchCompareFn: null,

_isTabInCurrentSearchPositive: function(tab) {
	const logHead = "TabsTabViewer::_isTabInCurrentSearchPositive(): ";
//	this._log(logHead + "entering for tab", tab);
	if(this._searchCompareFn(tab.tm.lowerCaseTitle, this._currentSearchInput)) {
		return true;
	}

	if(this._searchCompareFn(tab.tm.lowerCaseUrl, this._currentSearchInput)) {
		return true;
	}

	for(let i = 0; i < tab.tm.searchBadges.length; i++) {
		if(this._searchCompareFn(tab.tm.searchBadges[i], this._currentSearchInput)) {
			return true;
		}
	}

	return false;
},

_isTabInCurrentSearchNegative: function(tab) {
	if(tab.tm.type == Classes.NormalizedTabs.type.BOOKMARK) {
		// Bookmarks don't belong in negative searches, because we're not scanning the
		// entire set of bookmarks, only the set of results from a positive search, not
		// a negative one.
		return false;
	}
	return !this._isTabInCurrentSearchPositive(tab);
},

// Similar to _searchCompareFn(), this function gets selected (between _isTabInCurrentSearchPositive
// and _isTabInCurrentSearchNegative) as the user types the search input
_isTabInCurrentSearch: null,

_filterByCurrentSearch: function(inputTabs) {
	const logHead = "TabsTabViewer::_filterByCurrentSearch(value: \"" + this._currentSearchInput +
						"\", mode: " + this._currentSearchMode + "): ";
	this._log(logHead + "inputTabs = ", inputTabs);
	return inputTabs.reduce(
		function(result, tab) {
			//this._log(logHead + "inside tab ", tab);
			if(this._isTabInCurrentSearch(tab)) {
				result.push(tab);
				return result;
			}

			// Not added
			return result;
		}.bind(this),
		[] // Initial value for reducer
	);
},

_searchRenderTabsInner_Merged: function(tabs, bmNodes) {
	const logHead = "TabsTabViewer::_searchRenderTabsInner_Merged(): ";

	// Using Array.concat() instead of the spread operator [ ...tabs, ...bmNodes] because
	// it seems to be faster, and because we're potentially dealing with large arrays here
	let objects = tabs.concat(bmNodes);

	perfProf.mark("searchFilterStart");
	objects = this._filterByCurrentSearch(objects);
	perfProf.mark("searchSortStart");
	objects = objects.sort(Classes.NormalizedTabs.compareTabsFn);
	perfProf.mark("searchSortEnd");

	// This logic is very crude, ideally we should have a more seamless transition from
	// a set of tabs to a different set of tabs, but we're leaving that logic for later.
	this._containerViewer.clear();

	this._setSearchBoxCountBlinking(false);
	this._setSearchBoxCount(objects.length);

	if(objects.length == 0) {
		this._log(logHead + "no tabs in search results");
		this._currentSearchResults = null;
	} else {
		this._currentSearchResults = objects;
		perfProf.mark("searchRenderStart");
		this._renderTabsFlatInner(this._containerViewer, objects);
		perfProf.mark("searchRenderEnd");
	}
},

_searchRenderTabsInner_Separate: function(tabs, bmNodes) {
	const logHead = "TabsTabViewer::_searchRenderTabsInner_Separate(): ";

	tabs = this._filterByCurrentSearch(tabs);
	tabs = tabs.sort(Classes.NormalizedTabs.compareTabsFn);

	bmNodes = this._filterByCurrentSearch(bmNodes);
	bmNodes = bmNodes.sort(Classes.NormalizedTabs.compareTabsFn);

	// This logic is very crude, ideally we should have a more seamless transition from
	// a set of tabs to a different set of tabs, but we're leaving that logic for later.
	this._containerViewer.clear();

	this._setSearchBoxCountBlinking(false);
	this._setSearchBoxCount(tabs.length + bmNodes.length);

	if((tabs == null || tabs.length == 0) && bmNodes.length == 0) {
		this._log(logHead + "no tabs in search results");
		this._currentSearchResults = null;
	} else {
		if(tabs.length != 0) {
			// This assumes "tabs" are rendered first
			this._currentSearchResults = tabs;
		} else {
			// Since they're not both zero, "bmNodes" must be non-zero here.
			// this._currentSearchResults is used to trigger an action when the
			// user presses "Enter", so it makes sense to adapt it to allow users
			// to open bookmarks too
			this._currentSearchResults = bmNodes;
		}
		this._renderTabsFlatInner(this._containerViewer, tabs);
		this._renderTabsFlatInner(this._containerViewer, bmNodes);
	}
},

_recentlyClosedNormalizeInner: function(tab) {
	const logHead = "TabsTabViewer::_recentlyClosedNormalizeInner(): ";
	this._assert(!tab.active, logHead, tab);
	if(tab.active) {
		// I've seen recently closed tabs showing up as active, that's an odd inconsistency
		// (a closed tab can't be active), and definitely not something we want to show to
		// our end users
		tab.active = false;
	}
	// We want each recently closed tab to be as similar as possible to a tab object...
	// It seems to already include everything except for "id" and "status". Using
	// sessionId for tab.id is probably going to generate some duplicated tab IDs, but
	// for now let's go with that...
	tab.status = "unloaded";
	tab.id = tab.sessionId;
	if(tab.favIconUrl == null || tab.favIconUrl == "") {
		// See BookmarksFinder.js for details about the favicon cache
		tab.favIconUrl = "chrome://favicon/size/16@1x/" + tab.url;
	}
	Classes.NormalizedTabs.normalizeTab(tab, Classes.NormalizedTabs.type.RCTAB);
},

_recentlyClosedNormalize: function(sessions) {
	// Filter out windows and normalize recently closed tabs.
	// A few actions need to be taken:
	// - Flatten out the tabs array by extracting any tabs that might be under windows
	// - Normalize those flattened tabs
	// - Exclude any tab that represents a past incarnation of the TabMania undocked popup
	let tabs = [];

	for(let i = 0; i < sessions.length; i++) {
		let session = sessions[i];
		if(session.tab == null) {
			// UPDATE: actually, stay away from "session.window.tabs", the tabs in there don't
			// seem to behave consistently with the "session.tab"
			// - They include tabs that are currently open (at least if you reuse the tabs session
			//   on browser restart)
			//   * If they were tandard "session.tab" they would disappear when the tab gets
			//     opened
			// - When you try to call chrome.sessions.restore() on them, the call doesn't seem
			//   to restore anything, it just opens another tab
			//   * And when you click on the tile, chrome.sessions.restore() ends up creating
			//     the new tab in the same window where the TabMania popup is, that's just a
			//     lot of trouble...
			//     - When you close the unusable popup and open it again, the supposedly "recently
			//       closed tab" now it's in the chrome.sessions.search() results, but it claims
			//       that the session.window.tabs[x] is "active"
			//     - This looks like a bug, but the whole behavior looks like a big bug
			// - When you close the open tab corresponding to one of these bogus recently closed
			//   tabs now your recently closed tabs has two of the same tab, one that behaves
			//   normally, one that behaves erratically
			//   * It's impossible to tell apart one from the other
			//
			// The real trouble is that besides those erratic recently closed tabs, if you close
			// a window during normal operation (not as part of a Chrome full close and restart),
			// those sessions.window.tabs behave normally, and they should show up in TabMania...
			// but how do we tell them apart?
			//
			// Per https://developer.chrome.com/docs/extensions/reference/sessions/#type-Session
			// windows are identifiable by the absence of "tab". We don't want to track windows,
			// but they might contain tabs.
			let window = session.window;
			for(let j = 0; window.tabs != null && j < window.tabs.length; j++) {
				let tab = window.tabs[j];
				// Filter out all tabs in windows that have index == -1; index -1 is set for all
				// recently closed items that were closed before the current instance of Chrome
				// was started (e.g., before the last reboot, or before the last Chrome restart).
				// Given the trouble we have with tabs in windows, this is the easiest way to
				// keep them out of the way, though we're also sacrificing genuine windows closed
				// explicitly by the user before the last reboot.
				// At least we keep in play the windows closed by the user after the last Chrome
				// restart... better than having to shut them all out.
				// 
				// Also filter out any tab that identifies a previous instance of the TabMania popup.
				if(tab.url != popupDocker.getPopupUrl(true) && tab.index != -1) {
					this._recentlyClosedNormalizeInner(tab);
					// Let's remember which window this tab is coming from. As a minimum, this
					// can give us a hint that this tab might be trouble. We only know for sure
					// that recently closed tabs without a "tab.tm.windowSessionId" are not trouble,
					// we have a 50/50 chance those with "tab.tm.windowSessionId" might be trouble.
					tab.tm.windowSessionId = window.sessionId;
					tabs.push(tab);
				}
			}
		} else {
			// Filter out any tab that identifies a previous instance of the TabMania popup
			if(session.tab.url != popupDocker.getPopupUrl(true)) {
				this._recentlyClosedNormalizeInner(session.tab);
				tabs.push(session.tab);
			}
		}
	}

	return tabs;
},

// Returns a list of normalized tabs taken from the recently closed list (max of 25
// per the Chrome API limit).
_getRecentlyClosedTabs: function() {
	const logHead = "TabsTabViewer::_getRecentlyClosedTabs(): ";

	if(!settingsStore.getOptionRecentlyClosedInSearch()) {
		this._log(logHead + "recently closed tabs are disabled in search, nothing to do");
		// Pretend we searched and found no recently closed tabs (empty array)
		return Promise.resolve([]);
	}

	// This function returns a maximum of 25 recently closed tabs, not much
	// to worry about
	return chromeUtils.wrap(chrome.sessions.getRecentlyClosed, logHead, null).then(
		function(session) {
			this._log(logHead + "sessions.getRecentlyClosed() returned: ", session);
			return this._recentlyClosedNormalize(session);
		}.bind(this)
	);
},

_searchRenderTabs: function(tabs) {
	const logHead = "TabsTabViewer::_searchRenderTabs(): ";

	// Give some feedback to the user in case this search is going to take a while...
	this._setSearchBoxCountBlinking();

	// Temporary variable, eventually we might want to have a user-facing configuration
	// option to control this.
	let merge = true;

	Promise.all([
		this._getRecentlyClosedTabs(),
		this._bookmarksFinder.find(this._currentSearchInput)
	]).then(
		function([ rcTabs, bmNodes ]) {
			// We need to this._containerViewer.clear() in all cases, but we're trying to
			// keep this clear() call as close as possible to the time of the new rendering.
			// If there's too much processing to do between clear() and render, users will
			// see an empty screen with the "no tabs" text displayed in the popup for the
			// duration of the processing. No reason to leave them hanging.
			// For this reason, we've moved this this._containerViewer.clear() call from
			// here to inside the this._searchRenderTabsInner_Merged() or this._searchRenderTabsInner_Separate()
			// calls. A small duplication for a good UX cause.

			// concat() dosn't modify "tabs", so that's safe
			let mergedTabs = tabs.concat(rcTabs);
			if(merge) {
				this._searchRenderTabsInner_Merged(mergedTabs, bmNodes);
			} else {
				this._searchRenderTabsInner_Separate(mergedTabs, bmNodes);
			}
		}.bind(this)
	);
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

