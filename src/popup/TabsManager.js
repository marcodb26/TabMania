// CLASS TabsManager
//
// This class generates 3 events:
// - TabsManager.Events.CREATED: event.detail = { target, tab }
//   Unlike chrome.tabs.onCreated, "tab" always has at least "pendingUrl" set when it gets generated
// - TabsManager.Events.REMOVED: event.detail = { target, tab, removeInfo (optional) }
//   "removeInfo" is optional because in some cases we might not have the removeInfo.isWindowClosing
//   information (though that should never really happen)
// - TabsManager.Events.UPDATED: event.detail = { target, tabs }
//   Note that the UPDATED event always includes an array of tabs, not a single tab
Classes.TabsManager = Classes.AsyncBase.subclass({

	_eventManager: null,

	_queryJob: null,
	// Delay before a full re-render happens. Use this to avoid causing too many re-renders
	// if there are too many events.
	_queryDelay: 200, //2000,

	// This is a recurring job. We start it when we do a full refresh, and we stop it when
	// we get to zero tabs in status "loading"
	_issue01WorkaroundJob: null,
	_issue01WorkaroundInterval: 5000,

	// Object containing all current known tabs
	_normTabs: null,

	_options: null,

	_stats: null,

_init: function({ standardTabs, incognitoTabs }) {
	// Set these properties before calling the parent _init(), because the
	// parent _init() will trigger _asyncInit(), and when _asyncInit() runs,
	// it needs to have these values available
	this.debug();

	this._options = {};
	this._options.standardTabs = optionalWithDefault(standardTabs, true);
	this._options.incognitoTabs = optionalWithDefault(incognitoTabs, true);

	this._resetStats();

	this._eventManager = Classes.EventManager.create();
	this._eventManager.attachRegistrationFunctions(this);

	this._queryJob = Classes.ScheduledJob.create(this._queryTabs.bind(this), this._id + ".queryTabs");
	this._queryJob.debug();

	this._issue01WorkaroundJob = Classes.ScheduledJob.create(this._issue01Workaround.bind(this),
																this._id + ".issue01Workaround");
	this._issue01WorkaroundJob.debug();

	// Overriding the parent class' _init(), but calling that original function too
	Classes.AsyncBase._init.apply(this, arguments);
},

_asyncInit: function() {
	// Overriding the parent class' _asyncInit(), but calling that original function first
	let parentPromise = Classes.AsyncBase._asyncInit.call(this);

	// Initialize the _normTabs data structure before registering
	// all the callbacks, since the callbacks need this data
	let thisPromise = this._queryTabs().then(
		function() {
			bookmarksManager.addEventListener(Classes.EventManager.Events.UPDATED, this._bookmarkUpdatedCb.bind(this));
			this._registerChromeCallbacks();
			settingsStore.addEventListener(Classes.EventManager.Events.UPDATED, this._settingsStoreUpdatedCb.bind(this));
		}.bind(this)
	);

	return Promise.all([ parentPromise, thisPromise ]);
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
	chrome.tabs.onUpdated.addListener(this._tabUpdatedCb.bind(this));
	// Unfortunately closing a tab doesn't get considered an update to the tab, so we must
	// register for this other event too...
	// https://developer.chrome.com/docs/extensions/reference/tabs/#event-onRemoved
	chrome.tabs.onRemoved.addListener(this._tabRemovedCb.bind(this));
	// https://developer.chrome.com/docs/extensions/reference/tabs/#event-onHighlighted
	chrome.tabs.onHighlighted.addListener(this._tabHighlightedCb.bind(this));
	// https://developer.chrome.com/docs/extensions/reference/tabs/#event-onActivated
	chrome.tabs.onActivated.addListener(this._tabActivatedCb.bind(this));
	// https://developer.chrome.com/docs/extensions/reference/tabs/#event-onMoved
	chrome.tabs.onMoved.addListener(this._tabActivatedHighlightedMovedAttachedCb.bind(this, Classes.TabsManager.Events.MOVED));
	// https://developer.chrome.com/docs/extensions/reference/tabs/#event-onAttached
	chrome.tabs.onAttached.addListener(
					this._tabActivatedHighlightedMovedAttachedCb.bind(this, Classes.TabsManager.Events.ATTACHED));
},

_ignoreTab: function(tab) {
	if(tab.incognito === undefined) {
		if(this._options.standardTabs) {
			return false;
		}
	} else {
		if(this._options.incognitoTabs) {
			return false;
		}
	}

	return true;
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
	const logHead = "TabsManager::_issue01Workaround(): ";

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
					this._queryJob.run(this._queryDelay);
					return;
				}
				if(tab.status != "loading") {
					this._log(logHead + "at least one tab has changed status, refreshing all", tab);
					this._stats.issue01Hit++;
					this._queryJob.run(this._queryDelay);
					return;
				}
				this._log(logHead + "all tabs are still in \"loading\" status");
			}
		}.bind(this)
	);
},

_processTabUpdateInner: function(tab) {
	this._normTabs.updateTab(tab);
	// Then update the shortcuts info, if needed
	if(this._options.standardTabs) {
		settingsStore.getShortcutsManager().updateTabs(this._normTabs.getTabs());
	}
},

_processTabCreation: function(tab) {
	const logHead = "TabsManager::_processTabCreation(" + tab.id + "): ";

	if(tab.url == "" && tab.pendingUrl == null) {
		this._log(logHead + "still no URL info in new tab, giving up");
		return;
	}

	if(this._normTabs.getTabIndexByTabId(tab.id) != -1) {
		// _processTabCreation() can be called by _tabCreatedCb() or by _tabUpdatedCb().
		// In _tabCreatedCb() it can be called synchronously or asynchronously, and in
		// the async case, there's a potential race between that call and the following
		// _tabUpdatedCb(). We've observed it takes about 50ms from the original onCreated
		// event for the async call from _tabCreatedCb(), and about 900ms to get the following
		// _tabUpdatedCb(). On the other hand, you never know, there might be cases where
		// the two arrive in reverse order, and we want to take the onUpdated info over the
		// async info from onCreated in that case.
		this._err(logHead + "tab already exists, suppressing call");
		return;
	}

	this._log(logHead + "entering", tab);
	this._processTabUpdateInner(tab);
	this._eventManager.notifyListeners(Classes.TabsManager.Events.CREATED, { tab: tab });
},

// This function is responsible for resetting the "wantsAttention" rendering, and
// gets called by tabsTitleMonitor when a "wantsAttention" situation expires
_stopAttentionCb: function(tabId) {
	const logHead = "TabsManager::_stopAttentionCb(" + tabId + "): ";

	let tabIdx = this._normTabs.getTabIndexByTabId(tabId);
	if(tabIdx == -1) {
		// This should never happen, but just in case...
		this._log(logHead + "tab not found, ignoring event");
		return;
	}

	this._log(logHead + "entering");

	let tab = this._normTabs.getTabByTabIndex(tabIdx);
	// The next action is probably redundant, it's already been taken by tabsTitleMonitor
	// before the callback was invoked. Anyway we need the "tab" for the event.
	tab.wantsAttention = false;

	// Single event for all the changes, unlike for CREATED and REMOVED above
	this._eventManager.notifyListeners(Classes.TabsManager.Events.UPDATED, { tabs: [ tab ] });
},

_processTabUpdate: function(tabId, tab) {
//	const logHead = "TabsManager::_processTabUpdate(" + tabId + "): ";

	// tabsTitleMonitor.update() sets the "tab.wantsAttention" flag in "tab"
	// when it returns "true". Can't put it in "tab.tm" because "tab.tm" will
	// be added later.
	// Note that we take this action only for updates, not for creation cases.
	tabsTitleMonitor.update(tab, this._stopAttentionCb.bind(this));

	this._processTabUpdateInner(tab);
	this._eventManager.notifyListeners(Classes.TabsManager.Events.UPDATED, { tabs: [ tab ] });
},

_tabCreatedCb: function(tab) {
	const logHead = "TabsManager::_tabCreatedCb(tabId = " + tab.id + "): ";

	if(this._ignoreTab(tab)) {
		this._log(logHead + "filtering out tab", tab);
		return;
	}

	// This check probably doesn't make sense, the _tabCreatedCb() for our own popup
	// window should have already expired by the time we started running our logic...
	// anyway, just in case...
	if(tab.id == popupDocker.getOwnTabId()) {
		this._log(logHead + "filtering out our own tab ID");
		return;
	}

	if(tab.url == "" && tab.pendingUrl == null) {
		this._log(logHead + "URL missing, delaying processing");
		// Not clear why Chrome would generate the "onCreated" event 50ms before it
		// has the pendingUrl set, but it happens for tabs loaded from other tabs
		// (it doesn't happen for "new tab" actions and for tabs created from other
		// applications).
		// You'll eventually get an "onUpdated" event too with the pendingUrl, but
		// you have to wait about 900ms for it. So, to try to be a bit more responsive
		// for new tabs (especially for the dedup use case), we immediately query
		// again, and hopefully we'll get a pendingUrl. If not, we'll give up on
		// this event and wait for the first "onUpdated" to be treated as an "onCreated".
		chromeUtils.wrap(chrome.tabs.get, logHead, tab.id).then(this._processTabCreation.bind(this));
		return;
	}

	this._processTabCreation(tab);
},

_tabUpdatedCb: function(tabId, changeInfo, tab) {
	const logHead = "TabsManager::_tabUpdatedCb(" + tabId + "): ";

	if(this._ignoreTab(tab)) {
		this._log(logHead + "filtering out tab", tab);
		return;
	}

	if(this._normTabs.getTabIndexByTabId(tabId) == -1) {
		this._log(logHead + "tab not found, simulating onCreated event", tab);
		this._processTabCreation(tab);
		return;
	}

	// Suppressing events for our own tab ID is a terrible idea: our popup always
	// shows as "loading" unless some other event happens to clear it. It's not great
	// that we're guaranteed to have to render the tiles twice every time we open our
	// undocked popup, but if we can't find another way to deal with the "loading" badge,
	// we have to allow the double rendering.
	//if(tabId == popupDocker.getOwnTabId()) {
	//	this._log(logHead + "suppressing notification for our own tab ID");
	//	return;
	//}

	// Very crude... we re-render everything for every update. But at least we try
	// to reduce the frequency of the re-render in some cases.
	this._log(logHead + "entering", changeInfo, tab);
	this._processTabUpdate(tabId, tab);
},

_tabRemovedCb: function(tabId, removeInfo) {
	const logHead = "TabsManager::_tabRemovedCb(" + tabId + "): ";

	let tabRemoved = this._normTabs.removeTabById(tabId);
	if(tabRemoved == null) {
		this._log(logHead + "tab not tracked")
		return;
	}

	this._log(logHead + "tab removed", tabRemoved);

	tabsTitleMonitor.remove(tabId);

	if(this._options.standardTabs) {
		settingsStore.getShortcutsManager().updateTabs(this._normTabs.getTabs());
	}

	this._eventManager.notifyListeners(Classes.TabsManager.Events.REMOVED, { tab: tabRemoved, removeInfo: removeInfo });

	// Removing a tab can cause other tabs to change their position in the window.
	// These changes don't trigger onUpdated from Chrome, but for completeness we
	// want to have the "index" of each tab to be accurate.
	// Note that if the tab being removed was "active", then the index of these
	// surviving tabs will be updated by the _queryJob.run() call made during the
	// onActivate event on the tab being activated as a result of the removal of
	// the active tab. Anyway, an extra call to _queryJob.run() doesn't hurt thanks
	// to the rate-limiting logic in place (only one actual run will happen).
	this._log(logHead + "triggering a full refresh");
	this._queryJob.run(this._queryDelay);
},

_tabHighlightedCb: function(highlightInfo) {
	// highlightInfo.tabIds includes the ID of all tabs that are highlighted, not only the
	// delta of tabs that have been highlighted now. We can't use the info this way, all we
	// can do is using this as a hint to trigger a full refresh and let that determine
	// what exactly has changed (and trigger the appropriate events downstream).
	// We can't even check if the tab should be ignored, we don't have a tabId, except in
	// one case...

	let tabId = null;
	if(highlightInfo.tabIds.length == 1) {
		// Only in this case we can track a tabId here...
		tabId = highlightInfo.tabIds[0];

		let tab = this._normTabs.getTabByTabId(tabId);
		if(tab != null && tab.highlighted) {
			const logHead = "TabsManager::_tabHighlightedCb(" + tabId + "): ";
			// For some reason, Chrome generates these bogus onHighlighted events as
			// you move a tab from one position to another in a window: the tab is
			// already highlighted, yet you get an event.
			this._log(logHead + "suppressing redundant event", highlightInfo);
			return;
		}
	}

	this._tabActivatedHighlightedMovedAttachedCb(Classes.TabsManager.Events.HIGHLIGHTED, tabId, highlightInfo);
},

_tabActivatedCb: function(activeInfo) {
	// We need a little translation because this event is slightly inconsistent, it includes the
	// tabId only inside "activeInfo", and this._tabActivatedHighlightedMovedAttachedCb() needs it as a
	// standalone argument.
	this._tabActivatedHighlightedMovedAttachedCb(Classes.TabsManager.Events.ACTIVATED, activeInfo.tabId, activeInfo);
},

_tabActivatedHighlightedMovedAttachedCb: function(eventId, tabId, activeHighlightMoveAttachInfo) {
	const logHead = "TabsManager::_tabActivatedHighlightedMovedAttachedCb(" + eventId + ", " + tabId + "): ";

	// For the onHighlighted event we might not have a "tabId"
	if(tabId != null) {
		let tabIdx = this._normTabs.getTabIndexByTabId(tabId);
		if(tabIdx == -1) {
			// When a tab moves, other tabs move in the same window, but no event is generated
			// by Chrome for them (similar problem for the onAttached event, as it affects many
			// tabs in the old and new window). This logic assumes that if we don't know about
			// a tab, we don't know about any other tab in the same window. This assumption is
			// ok as long as the only reason a tab is missing is because we're not tracking it,
			// since incognito tabs and standard tabs run in separate windows.
			this._log(logHead + "tab not found, ignoring event", activeHighlightMoveAttachInfo);
			return;
		}
	}

	// We're not generating an event, because we don't have the full picture.
	// We'll instead just run a full refresh and let generate an UPDATED event for all tabs
	// affected by the move.
	this._log(logHead + "scheduling a full refresh", activeHighlightMoveAttachInfo);
	this._queryJob.run(this._queryDelay);
},

_bookmarkUpdatedCb: function(ev) {
	// Most bookmarksManager updates are needed only during searches, but if there
	// is at least one pinned bookmark, all bookmark updates need to be monitored
	// also during non-search tile rendering...
	this._queryJob.run(this._queryDelay);
},

_generateDiffEvents: function(oldTabList) {
	const logHead = "TabsManager::_generateDiffEvents(): "
	let [ added, deleted, changed ] = this._normTabs.diff(oldTabList);

	this._log(logHead, added, deleted, changed);

	for(let i = 0 ; i < added.length; i++) {
		this._eventManager.notifyListeners(Classes.TabsManager.Events.CREATED, { tab: added[i] });
	}
	for(let i = 0 ; i < deleted.length; i++) {
		// No "removeInfo" in this case, since we don't know if "removeInfo.isWindowClosing" anymore,
		// and the rest of the info is in "tab" anyway
		this._eventManager.notifyListeners(Classes.TabsManager.Events.REMOVED, { tab: deleted[i] });
	}

	if(changed.length > 0) {
		// Single event for all the changes, unlike for CREATED and REMOVED above
		this._eventManager.notifyListeners(Classes.TabsManager.Events.UPDATED, { tabs: changed });
	}
},

_settingsStoreUpdatedCb: function(ev) {
	const logHead = "TabsManager::_settingsStoreUpdatedCb(" + ev.detail.key + "): ";


	if(ev.detail.key == "pinnedGroups") {
		// Changes to "pinnedGroups" don't impact badges of tabs, so they're not of
		// interest for this class
		this._log(logHead + "ignoring key");
		return;
	}

	this._log(logHead + "entering");

	// In this case we can skip the re-query, since the set of tabs has not
	// changed. We just need to trigger a rebuild of the search badges.
	let oldTabList = this._normTabs.cloneTabs();
	this._normTabs.normalizeAll();

	this._generateDiffEvents(oldTabList);
},

_tabsAsyncQuery: function() {
	const logHead = "TabsManager::_tabsAsyncQuery(): ";

	// Use an empty dictionary to query for all tabs
	return chromeUtils.queryTabs({}, logHead).then(
		function(tabs) {
			if(window.tmStaging !== undefined) {
				// This code path should only be entered when staging TabMania to take
				// screenshots for publishing on the Chrome Web Store. Let's generate
				// an error so it's clear/obvious we've entered this path.
				this._err(logHead + "entering staging path");
				// Ignore actual response from chromeUtils.queryTabs() and replace it with
				// a fictictious set of tabs. Edit the tabs as much as you'd like, just
				// make sure the tab IDs remain unique.
				tabs = tmStaging.tabList;
			}

			// Filter tabs based on this._options
			if(this._options.standardTabs && this._options.incognitoTabs) {
				// Nothing to filter, return them all
				return tabs;
			}

			// Either "standardTabs" or "incognitoTabs" is "false", filter the
			// right subset
			let retVal = [];
			for(let i = 0; i < tabs.length; i++) {
				if(!this._ignoreTab(tabs[i])) {
					retVal.push(tabs[i]);
				}
			}
			return retVal;
		}.bind(this)
	);
},

_queryTabs: function() {
	const logHead = "TabsManager::_queryTabs(): ";
	this._log(logHead + "entering");

	perfProf.mark("queryStart");
	return this._tabsAsyncQuery().then(
		function(tabs) {
			perfProf.mark("queryEnd");

			this._log(logHead + "tabs received, processing");

			this._issue01WorkaroundJob.start(this._issue01WorkaroundInterval, false);

			let oldTabList = null;
			if(this._normTabs != null) {
				oldTabList = this._normTabs.getTabs();
			}

			try {
				// Normalize the incoming tabs. Note that the normalization
				// and sorting happens in place in "tabs", so after create()
				// we can just ignore the "normTabs" object... but to be
				// good future-proof citizens, let's call the right interface...
				perfProf.mark("normalizeStart");
				this._normTabs = Classes.NormalizedTabs.create(tabs);

				perfProf.mark("shortcutsStart");
				// Note that we need to make this call only when the tabs change,
				// not when the settingsStore configuration changes (in that case
				// updateTabs() is done automatically inside the shortcutManager)
				if(this._options.standardTabs) {
					// We'll need to clean this up later: in theory we want to manage
					// shortcuts for both standard tabs and incognito tabs, but the
					// ShortcutsManager.updateTabs() function was built before we split
					// standard and incognito tabs, and each call replaces the previous
					// call, so we must allow only calls from the same set of tabs.
					// updateTabs() needs to be improved to support calls from two sets
					// of tabs (standard and incognito).
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
				}

				perfProf.mark("shortcutsEnd");

				if(oldTabList != null) {
					this._log(logHead + "comparing with oldTabList");
					this._generateDiffEvents(oldTabList);
				} else {
					this._log(logHead + "no oldTabList, nothing to compare (popup just bootstrapped?)");
				}
				perfProf.mark("diffEventsEnd");

				perfProf.measure("Query", "queryStart", "queryEnd");
				perfProf.measure("Normalize", "normalizeStart", "shortcutsStart");
				perfProf.measure("Shortcuts", "shortcutsStart", "shortcutsEnd");
				perfProf.measure("DiffEvents", "shortcutsEnd", "diffEventsEnd");

				// This piece of logic will need to be added when "chrome tab groups"
				// APIs become available.
				//this._getAllTabGroups().then(this._processTabGroupsCb.bind(this));
				
			} catch(e) {
				this._err(e);
			}
		}.bind(this)
	);
},

getTabs: function() {
	return this._normTabs.getTabs();
},

// The same bookmark ID could appear multiple times, this function doesn't try
// to guarantee uniqueness.
getPinnedBookmarkIdsFromTabs: function() {
	return this._normTabs.getPinnedBookmarkIdsFromTabs();
},

}); // Classes.TabsManager

Classes.Base.roDef(Classes.TabsManager, "Events", {});
Classes.Base.roDef(Classes.TabsManager.Events, "CREATED", "tmCreated");
Classes.Base.roDef(Classes.TabsManager.Events, "ACTIVATED", "tmActivated");
Classes.Base.roDef(Classes.TabsManager.Events, "HIGHLIGHTED", "tmHighlighted");
Classes.Base.roDef(Classes.TabsManager.Events, "UPDATED", "tmUpdated");
Classes.Base.roDef(Classes.TabsManager.Events, "REMOVED", "tmRemoved");
Classes.Base.roDef(Classes.TabsManager.Events, "ATTACHED", "tmAttached");
Classes.Base.roDef(Classes.TabsManager.Events, "MOVED", "tmMoved");
