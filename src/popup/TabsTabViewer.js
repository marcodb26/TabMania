// CLASS TabsTabViewer
//
// Abstract class, parent of all Viewers of tab lists
Classes.TabsTabViewer = Classes.SearchableTabViewer.subclass({

	_containerViewer: null,
	_groupsBuilder: null,

	_updatesTrackerHandleIdByTab: null,
	_updatesTrackerHandleIdByProp: null,

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

	// Subclasses set here what tab properties they want to track
	_trackingPropList: null,

	// String to show when the container is empty
	_emptyContainerString: null,

	// This will be initialized by the first call to _activateSearchBox()
	_currentSearchInput: null,

	_queryAndRenderJob: null,
	// Delay before a full re-render happens. Use this to avoid causing too many re-renders
	// if there are too many events.
	_queryAndRenderDelay: 0, //2000,

	// Dictionary tracking all the tab tiles, in case we need to update their contents
	_tilesByTabId: null,

	// Object containing all current known tabs
	_normTabs: null,

_init: function(tabLabelHtml) {
	// Overriding the parent class' _init(), but calling that original function first
	Classes.SearchableTabViewer._init.apply(this, arguments);

	const logHead = "TabsTabViewer::_init(): ";
	this.debug();

	this._assert((this._trackingPropList != null && this._expandedGroups != null),
				logHead + "subclasses must define _trackingPropList and _expandedGroups");

	this._queryAndRenderJob = Classes.ScheduledJob.create(this._queryAndRenderTabs.bind(this));
	this._queryAndRenderJob.debug();

	this._groupsBuilder = Classes.GroupsBuilder.create();
	// Call this function before rendering, because it sets _renderTabs(), which
	// would otherwise be null
	this._TabsTabViewer_searchBoxInactiveInner();
	this._TabsTabViewer_render();

	this._updatesTrackerHandleIdByProp =
			tabUpdatesTracker.registerByPropList(this._trackingPropList,
												this._tabUpdatedByPropCb.bind(this));

	// See TabUpdatesTracker._init() for why we don't go through that class
	// for this event
	chrome.tabs.onCreated.addListener(this._tabCreatedCb.bind(this));

	settingsStore.addEventListener(Classes.EventManager.Events.UPDATED, this._settingsStoreUpdatedCb.bind(this));
},

_tabCreatedCb: function(tab) {
	const logHead = "TabsTabViewer::_tabCreatedCb(tabId = " + tab.id + "): ";
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

_renderTileBodies: function() {
	// Object iteration, ECMAScript 2017 style
	// See https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/entries
	try {
	for(const [ tabId, tile ] of Object.entries(this._tilesByTabId)) {
		tile.renderBody();
	}
	} catch(e) {
		this._err(e, "this._tilesByTabId: ", this._tilesByTabId);
	}
},

_settingsStoreUpdatedCb: function(ev) {
	const logHead = "TabsTabViewer::_settingsStoreUpdatedCb(" + ev.detail.key + "): ";
	this._log(logHead + "entering");

	// The answer to all events is always the same, re-render everything.
	// In this case though, we can skip the re-query, since there's no
	// indication that the tabs have changed. We just need to trigger
	// a re-render of the tiles bodies (their titles have not changed, so
	// their sorting order or group membership has not changed). The only
	// exception is search mode, because an update to configuration can
	// change the composition of the search results.
	if(this.isSearchActive()) {
		this._queryAndRenderJob.run(this._queryAndRenderDelay);
		return;
	}
	// Not a search case, just normalize the search badges (configuration changes
	// can cause changes to the visible badges) and then render the tiles
	this._normTabs.normalizeAll()
	this._renderTileBodies();
},

_tabUpdatedByTabCb: function(cbType, tabId, activeChangeRemoveInfo, tab) {
	const logHead = "TabsTabViewer::_tabUpdatedByTabCb(" + tabId + ", " + cbType + "): ";
	// Very crude... we re-render everything for every update. But at least we try
	// to reduce the frequency of the re-render in some cases.
	this._log(logHead + "entering");

	switch(cbType) {
		case Classes.TabUpdatesTracker.CbType.REMOVED:
			// Like in the case of onCreated, when a tab is removed we want to run the
			// full re-render immediately.
			//
			// No reason to update the _normTabs and the shortcutsManager if we don't
			// have any delay before a full re-query/re-render
			this._queryAndRenderJob.run();
			break;
		case Classes.TabUpdatesTracker.CbType.UPDATED:
			// Only in case of a real update we can afford to delay the full re-render,
			// provided we at least re-render the affected tile...
			this._assert(tabId in this._tilesByTabId);
			if(this._queryAndRenderDelay != null && this._queryAndRenderDelay != 0) {
				// Note that only "Classes.TabUpdatesTracker.CbType.UPDATED" includes "tab".
				// All other types don't.
				// Anyway TileViewer.update() is protected against "tab == null".

				// First we want to normalize the updated tab (so there are no problems
				// rendering it in the tile), and replace it in the list, so that search can
				// find it with the right attributes
				this._normTabs.updateTab(tab);
				// Then update the shortcuts info, if needed
				settingsStore.getShortcutsManager().updateTabs(this._normTabs.getTabs());
				// Then we update the tile with the normalized info in place
				this._tilesByTabId[tabId].update(tab);
			}
			this._queryAndRenderJob.run(this._queryAndRenderDelay);
			break;
		case Classes.TabUpdatesTracker.CbType.ACTIVATED:
			if(this._queryAndRenderDelay != null && this._queryAndRenderDelay != 0) {
				let tabIdx = this._normTabs.getTabIndexByTabId(tabId);
				let tab = this._normTabs.getTabByTabIndex(tabIdx);
				this._assert(tab != null);
				tab.highlighted = true;
				// We need to call this._normTabs.updateTab(tab), because even though the
				// tab object we just updated is already in there, since we changed
				// a property that affects the search badges, we need to re-normalize
				// the tab to get the change reflected in the search badges
				this._normTabs.updateTab(tab, tabIdx);
				this._tilesByTabId[tabId].update(tab);
			}
			this._queryAndRenderJob.run(this._queryAndRenderDelay);
			break;
		case Classes.TabUpdatesTracker.CbType.MOVED:
		case Classes.TabUpdatesTracker.CbType.ATTACHED:
			if(this._queryAndRenderDelay != null && this._queryAndRenderDelay != 0) {
				let tabIdx = this._normTabs.getTabIndexByTabId(tabId);
				let tab = this._normTabs.getTabByTabIndex(tabIdx);
				this._assert(tab != null);

				if(cbType == Classes.TabUpdatesTracker.CbType.ATTACHED) {
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
				this._tilesByTabId[tabId].update(tab);
			}
			this._queryAndRenderJob.run(this._queryAndRenderDelay);
			break;
		default:
			this._err(logHead + "unknown callback type");
			break;
	}
},

_tabUpdatedByPropCb: function(cbType, tabId, activeChangeRemoveInfo, tab) {
	const logHead = "TabsTabViewer::_tabUpdatedByPropCb(tabId = " + tabId + "): ";

	// We use the "prop" notifications for the specific purpose to allow
	// insertion of new tabs in the notifications tabList in search mode.
	// See top of AllTabsTabViewer for more details about the problem.
	if(!this.isSearchActive()) {
		this._log(logHead + "ignoring - not in search mode");
		return;
	}
	// We only need to track UPDATED, for all other cases, we can drop
	// the notification here, because we've also received one in the
	// _tabUpdatedByTabCb() callback.
	if(cbType != Classes.TabUpdatesTracker.CbType.UPDATED) {
		this._log(logHead + "ignoring - not an update event");
		return;
	}
	if(tabId in this._tilesByTabId) {
		// We only care to monitor tabs that we're not already tracking.
		// If we have a tile for a tabId, then we're already tracking it.
		this._log(logHead + "ignoring - _tabUpdatedByTabCb() has handled");
		return;
	}

	// If we get here, we're receiving an UPDATED notification for a tab
	// we're not monitoring via the tabList (_tabUpdatedByTabCb()).
	// The goal is to find out if the tab should become part of the search
	// results based on the update that just happened.
	// This tracks new tabs just opened, or tabs that have navigated to a
	// new URL, or tabs that had their title changed for whatever reason.
	//
	// This is a new "tab" (and "tab" is non-null for UPDATED), so we need
	// to run the normalization logic on it, before we can call 
	// _isTabInCurrentSearch().
	this._normTabs.normalizeTab(tab);
	if(this._isTabInCurrentSearch(tab)) {
		// The tab should become part of the search results, let's trigger
		// the crude full re-render (otherwise we need to write code to compute
		// the sorting order for this tab, and where to insert the corresponding
		// tile (right now we just append() after a full tabs query.
		this._log(logHead + "processing");
		this._queryAndRenderJob.run();
	} else {
		this._log(logHead + "ignoring - not candidate for search results");
	}
},

// Add or change the listener to be notified only about the tabs that are
// currently of interest.
_enableNotificationsForTabs: function(tabs) {
	var list = [];

	tabs.forEach(
		function(tab) {
			list.push(tab.id);
		}
	);

	// Update tabUpdatesTracker registration, or unregister
	if(list.length > 0) {
		if(this._updatesTrackerHandleIdByTab == null) {
			this._updatesTrackerHandleIdByTab =
				tabUpdatesTracker.registerByTabList(list, this._tabUpdatedByTabCb.bind(this));
		} else {
			tabUpdatesTracker.updateRegisterByTabList(this._updatesTrackerHandleIdByTab, list);
		}
	} else {
		tabUpdatesTracker.unregisterByTabList(this._updatesTrackerHandleIdByTab);
		this._updatesTrackerHandleIdByTab = null;
	}
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

_queryAndRenderTabs: function() {
	const logHead = "TabsTabViewer::_queryAndRenderTabs(): ";
	this._log(logHead + "entering");
	this.blink();
	perfProf.mark("queryStart");
	return this._tabsAsyncQuery().then(
		function(tabs) {
			perfProf.mark("queryEnd");
			this._tilesByTabId = {};

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

				//perfProf.log();

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

	this._enableNotificationsForTabs(tabs);

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
				this._err(logHead + "iterating through tabs, at tabId " + (tab != null ? tab.id : "undefined obj"), e);
			}.bind(this)
		)
	);
},

_groupHeadingHtml: function(tabGroup) {
	let iconBadgeHtml = `
		<div class="tm-overlay tm-full-size">
			<div class="tm-icon-badge-pos small">
				<span class="badge tm-icon-badge bg-dark">${tabGroup.tabs.length}</span>
			</div>
		</div>
	`;

	// No icon badge for empty groups (pinned groups can show up empty)
	if(tabGroup.tabs.length == 0) {
		iconBadgeHtml = "";
	}

	// Do we need the attribute "width='16px'" in the <img> below, or are the min-width
	// and max-width settings of "tm-favicon-16" enough?
	let retVal = `
		<div class="tm-stacked-below">
			<p class="m-0 text-nowrap text-truncate">
				<span class="pe-2"><img class="tm-favicon-16" src="${tabGroup.favIconUrl}"></span>
				<span>${tabGroup.title}</span>
			</p>
			${iconBadgeHtml}
		</div>
	`;
	return retVal;
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

				// Not providing a value for "textWhenEmpty". If the container is empty,
				// we just don't want to show anything
				var innerContainer = Classes.CollapsibleContainerViewer.create({
					startExpanded: this._expandedGroups.has(tabGroup.title)
				});
				innerContainer.setHeadingHtml(this._groupHeadingHtml(tabGroup));
				innerContainer.addExpandedListener(this._containerExpandedCb.bind(this, tabGroup.title));
				innerContainer.addCollapsedListener(this._containerCollapsedCb.bind(this, tabGroup.title));
				this._containerViewer.append(innerContainer);
				this._renderTabsFlatInner(innerContainer, tabs, tabGroup);
			}
		}.bind(this)
	);
},

_renderTile: function(containerViewer, tabGroup, tab) {
	//const logHead = "TabsTabViewer::_renderTile(): ";

	var tile = Classes.TabTileViewer.create(tab, tabGroup);
	containerViewer.append(tile);
	this._tilesByTabId[tab.id] = tile;
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
_storeExpandedGroup: function(groupName, expanded) {
	expanded = optionalWithDefault(expanded, true);
	//const logHead = "TabsTabViewer::_storeExpandedGroup(" + groupName + ", " + expanded + "): ";

	if(expanded) {
		this._expandedGroups.add(groupName);
	} else {
		this._expandedGroups.del(groupName);
	}
},

_containerExpandedCb: function(key, ev) {
	const logHead = "TabsTabViewer::_containerExpandedCb(" + key + ", " + ev.target.id + "): ";
	this._log(logHead + "container expanded", ev);

	// The animation and visualization is done by Bootstrap, we just need to remember
	// whether it's collapsed or expanded
	this._storeExpandedGroup(key);
},

_containerCollapsedCb: function(key, ev) {
	const logHead = "TabsTabViewer::_containerCollapsedCb(" + key + ", " + ev.target.id + "): ";
	this._log(logHead + "container collapsed", ev);

	// The animation and visualization is done by Bootstrap, we just need to remember
	// whether it's collapsed or expanded
	this._storeExpandedGroup(key, false);
},

_getAllTabGroups: function() {
	const logHead = "TabsTabViewer::_getAllTabGroups(): ";
	// This call is still failing on the default channel (only available in the dev channel)
	// as of Chrome v.88.0.4324.104 (date 21.01.24)
	return chromeUtils.wrap(chrome.tabGroups.query, logHead, {});
},

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
		// Since we're exiting the search, we need to re-render the standard view
		this._queryAndRenderTabs();
	} else {
		this._log(logHead, "switching to search render");
		this._currentSearchResults = null;
		this._renderTabs = this._searchRenderTabs;
		// We don't need to call this._queryAndRenderTabs() in this case, because
		// it's already being invoked as part of _searchBoxProcessData().
	}
},

// Override this function from Classes.SearchableTabViewer
_searchBoxProcessData: function(value) {
	// Search is case insensitive
	this._currentSearchInput = value.toLowerCase();
	// Redraw the tab list.
	// We used to call "this._queryAndRenderTabs()" here, but there's no need
	// to query the tabs when this event happens, the tabs have not changed,
	// only the search box has changed.
	this._searchRenderTabs(this._normTabs.getTabs());
},

_respondToEnterKey: function(searchBoxText) {
	const logHead = "TabsTabViewer::_respondToEnterKey(" + searchBoxText + "): ";

	if(this._currentSearchResults == null) {
		this._log(logHead + "no search results, nothing to do");
		return;
	}

	this._log(logHead + "activating tab Id " + this._currentSearchResults[0].id);
	chromeUtils.activateTab(this._currentSearchResults[0].id);
},

_isTabInCurrentSearch: function(tab) {
	if(tab.tm.lowerCaseTitle.includes(this._currentSearchInput)) {
		return true;
	}

	if(tab.tm.lowerCaseUrl.includes(this._currentSearchInput)) {
		return true;
	}

// Now "tab.tm.extId" is always either in searchBadges or in hiddenSearchBadges,
// (depending on whether it's configured visible), so there's no more need to
// special-case it
//
//	// Note that "extId" could also be in a search badge, but that depends
//	// on user configuration, and we want to be able to search by extended ID
//	// regardless of whether or not the badge is visually there, so we need
//	// to search here explicitly.
//	// No need for ".toLowerCase()" here.
//	if(tab.tm.extId.includes(this._currentSearchInput)) {
//		return true;
//	}

	for(let i = 0; i < tab.tm.searchBadges.length; i++) {
		if(tab.tm.searchBadges[i].includes(this._currentSearchInput)) {
			return true;
		}
	}

	for(let i = 0; i < tab.tm.hiddenSearchBadges.length; i++) {
		if(tab.tm.hiddenSearchBadges[i].includes(this._currentSearchInput)) {
			return true;
		}
	}

	return false;
},

_filterByCurrentSearch: function(inputTabs) {
	const logHead = "TabsTabViewer::_filterByCurrentSearch(): ";
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

_searchRenderTabs: function(tabs) {
	const logHead = "TabsTabViewer::_searchRenderTabs(): ";

	// We need to clear() in all cases. This logic is very crude, ideally we should have
	// a more seamless transition from a set of tabs to a different set of tabs, but
	// we're leaving that logic for later.
	this._containerViewer.clear();

	tabs = this._filterByCurrentSearch(tabs);
	// Tabs are already normalized with the "tm" data we need to sort them
	tabs = tabs.sort(Classes.NormalizedTabs.compareTabsFn); // this._groupsBuilder._normalizeAndSort(tabs);

	this._enableNotificationsForTabs(tabs);

	this._setSearchBoxCount(tabs.length);

	if(tabs == null || tabs.length == 0) {
		this._log(logHead + "no tabs in search results");
		this._currentSearchResults = null;
	} else {
		this._currentSearchResults = tabs;
		this._renderTabsFlatInner(this._containerViewer, tabs);
	}
},

}); // Classes.TabsTabViewer


// CLASS AllTabsTabViewer
//
Classes.AllTabsTabViewer = Classes.TabsTabViewer.subclass({

	// We must specify the "status" property, otherwise in search mode search
	// results won't get updated when a new tab is created (that matches the
	// search query). The problem is that we register to receive updates only
	// for tabs that are part of the search result. We also do a full query
	// and re-render when a new tab is created, but that happens too early,
	// before the tab has been loaded (so the title is not populated yet, and
	// maybe not even the URL, per the documentation of onCreated). We run
	// through the full query, and the new tab doesn't match (yet). At that
	// point the tab doesn't make it to the tabList for further notifications,
	// and the tab won't show up regardless of how many updates happen to it.
	// The new tab will show up only when an update occurs to one of the tabs
	// that are part of the search result, and a new full query/re-render cycle
	// is initiated.
	// "status" is guaranteed to generate updates because the tab is loading.
	//
	// A similar problem should be happening (without this fix) when an existing
	// tab has navigation to a new URL that matches the search query. As the tab
	// loads, it falls out of the tabList during search, and can't get back on.
	_trackingPropList: [ "status" ],
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

