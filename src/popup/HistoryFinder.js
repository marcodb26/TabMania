// CLASS HistoryFinder
//
// This class generates events Classes.EventManager.Events.UPDATED, with "detail"
// set to { target: <this object>, event: <one in "Classes.HistoryFinder.event">,
//			data: <data associated to the original chrome event> }.
Classes.HistoryFinder = Classes.Base.subclass({

	_eventManager: null,

	// Put as much history as you think it might make sense to display in
	// the popup in the worst case... 500 already seems like a lot of scrolling
	// down the search results.
	_maxHistoryItems: 500,

	// Don't try to check "_hasHistoryPermission", this variable stays "null" until
	// we asynchrnously find out we have (or not) permission, but this class is not
	// asyncBase, so the callers should not need to wait for this vairable to be
	// initialized. Since the history permission goes hand-in-hand with the
	// settingsStore.getOptionHistoryInSearch() option, it should be safe enough
	// to just rely on the value of that option, and ignore "_hasHistoryPermission",
	// which we put here just for debugging.
	_hasHistoryPermission: null,

	// ELW = EventListenersWrapper
	_chromeElw: null,
	_historyElw: null,

_init: function() {
	const logHead = "HistoryFinder::_init(): ";
	// Overriding the parent class' _init(), but calling that original function first
	Classes.Base._init.call(this);
	this.debug();

	this._eventManager = Classes.EventManager.create();
	this._eventManager.attachRegistrationFunctions(this);

	this._chromeElw = Classes.EventListenersWrapper.create("addListener", "removeListener");
	this._historyElw = Classes.EventListenersWrapper.create("addListener", "removeListener");

	// https://developer.chrome.com/docs/extensions/reference/permissions/#event-onAdded
	this._chromeElw.listen(chrome.permissions.onAdded, this._permissionAddedCb.bind(this));
	// https://developer.chrome.com/docs/extensions/reference/permissions/#event-onRemoved
	this._chromeElw.listen(chrome.permissions.onRemoved, this._permissionRemovedCb.bind(this));

	// Recently closed tabs depend on the "sessions" permission, which we set as mandatory,
	// not optional, so we can always listen to their events, unlike the "history" events
	//
	// https://developer.chrome.com/docs/extensions/reference/sessions/#event-onChanged
	this._chromeElw.listen(chrome.sessions.onChanged, this._recentlyClosedChangedCb.bind(this));

	chromeUtils.wrap(chrome.permissions.contains, logHead, { permissions: ["history"] }).then(
		function(hasPermission) {
			if(hasPermission) {
				this._hasHistoryPermission = true;
				this._addHistoryEventsListeners();
			} else {
				this._hasHistoryPermission = false;
				this._log(logHead + "permission not set, starting without event listeners");
			}
		}.bind(this)
	);
},

_addHistoryEventsListeners: function() {
	const logHead = "HistoryFinder::_addHistoryEventsListeners(): ";
	this._log(logHead + "initializing history event listeners");

	// https://developer.chrome.com/docs/extensions/reference/history/#event-onVisitRemoved
	this._historyElw.listen(chrome.history.onVisitRemoved, this._visitRemovedCb.bind(this));
	// https://developer.chrome.com/docs/extensions/reference/history/#event-onVisited
	this._historyElw.listen(chrome.history.onVisited, this._visitedCb.bind(this));
},

_removeHistoryEventsListeners: function() {
	const logHead = "HistoryFinder::_removeHistoryEventsListeners(): ";
	this._log(logHead + "removing history event listeners");

	this._historyElw.clear();
},

_permissionAddedCb: function(permissions) {
	const logHead = "HistoryFinder::_permissionAddedCb(): ";

	if(permissions.permissions.includes("history")) {
		this._log(logHead + "granted \"history\" permission", permissions);
		this._hasHistoryPermission = true;
		this._addHistoryEventsListeners();
	} else {
		this._log(logHead + "no \"history\" in permissions, ignoring", permissions);
	}
},

_permissionRemovedCb: function(permissions) {
	const logHead = "HistoryFinder::_permissionRemovedCb(): ";

	if(permissions.permissions.includes("history")) {
		this._hasHistoryPermission = false;
		this._log(logHead + "revoked \"history\" permission", permissions);
		this._removeHistoryEventsListeners();
	} else {
		this._log(logHead + "no \"history\" in permissions, ignoring", permissions);
	}
},

_visitRemovedCb: function(removed) {
	let extraDetail = {
		event: Classes.HistoryFinder.event.REMOVED,
		data: removed,
	};
	this._eventManager.notifyListeners(Classes.EventManager.Events.UPDATED, extraDetail);
},

_visitedCb: function(historyItem) {
	let extraDetail = {
		event: Classes.HistoryFinder.event.VISITED,
		data: historyItem,
	};
	this._eventManager.notifyListeners(Classes.EventManager.Events.UPDATED, extraDetail);
},

// This callback doesn't take any arguments
_recentlyClosedChangedCb: function() {
	let extraDetail = {
		event: Classes.HistoryFinder.event.RCTAB,
	};

	this._eventManager.notifyListeners(Classes.EventManager.Events.UPDATED, extraDetail);
},

_processHistoryItems: function(items) {
	perfProf.mark("historySearchEnd");

	const logHead = "HistoryFinder::_processHistoryItems(): ";
	this._log(logHead + "received: ", items);

	perfProf.mark("historyReduceStart");
	// Filter out the TabMania popup and normalize history items
	let popupUrl = popupDocker.getPopupUrl(true);
	let retVal = items.reduce(
		function(result, tab) {
			if(tab.url != popupUrl) {
				tabNormalizer.normalize(tab, { type: Classes.TabNormalizer.type.HISTORY });
				result.push(tab);
			}
			return result;
		}.bind(this),
		[] // Initial value for reducer
	);
	perfProf.mark("historyReduceEnd");

	// Don't sort here. In the "merge with tabs" case, we'll need to re-sort anyway, so
	// let's just sort once in the caller
	//retVal = retVal.sort(Classes.TabNormalizer.compareTabsFn);
	return retVal;
},

// Returns an unsorted list of history items, normalized with tabNormalizer.normalize()
find: function(searchQuery) {
	const logHead = "HistoryFinder::find(\"" + searchQuery.getSimplifiedQuery() + "\"): ";
	if(!settingsStore.getOptionHistoryInSearch()) {
		this._log(logHead + "history is disabled in search, nothing to do");
		// Pretend we searched and found no history (empty array)
		return Promise.resolve([]);
	}

	this._log(logHead + "processing history");
	perfProf.mark("historySearchStart");
	// See https://developer.chrome.com/docs/extensions/reference/history/#method-search
	let query = {
		maxResults: this._maxHistoryItems,
		startTime: 0,
		text: searchQuery.getSimplifiedQuery(),
	};
	return chromeUtils.wrap(chrome.history.search, logHead, query).then(this._processHistoryItems.bind(this));
},


// Functions for RECENTLY CLOSED TABS
//
// These don't necessarily belong to HistoryFinder, but it's only two functions, no reason to
// create a separate class for them

_processRecentlyClosedTabs: function(sessions) {
	const logHead = "HistoryFinder::_processRecentlyClosedTabs(): ";
	// Filter out windows and normalize recently closed tabs.
	// A few actions need to be taken:
	// - Flatten out the tabs array by extracting any tabs that might be under windows
	// - Normalize those flattened tabs
	// - Exclude any tab that represents a past incarnation of the TabMania undocked popup
	let tabs = [];
	let popupUrl = popupDocker.getPopupUrl(true);

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
				if(tab.url != popupUrl && tab.index != -1) {
					if(tab.active) {
						this._log(logHead + "recently closed tabs should not be active", tab);
						// But we know they sometimes are, not sure there's any value in reminding
						// ourselves of that with this log message...
					}
					tabNormalizer.normalize(tab, { type: Classes.TabNormalizer.type.RCTAB });
					// Let's remember which window this tab is coming from. As a minimum, this
					// can give us a hint that this tab might be trouble. We only know for sure
					// that recently closed tabs without a "tab.tm.windowSessionId" are not trouble,
					// we have a 50/50 chance those with "tab.tm.windowSessionId" might be trouble.
					tab.tm.windowSessionId = window.sessionId;
					tabs.push(tab);
				}
			}
		} else {
			let tab = session.tab;
			// Filter out any tab that identifies a previous instance of the TabMania popup
			if(tab.url != popupUrl) {
				// I've seen recently closed tabs showing up as active, that's an odd inconsistency
				// (a closed tab can't be active), and definitely not something we want to show to
				// our end users
				this._assert(!tab.active, logHead + "recently closed tabs can't be active", tab);
				tabNormalizer.normalize(tab, { type: Classes.TabNormalizer.type.RCTAB });
				tabs.push(tab);
			}
		}
	}

	return tabs;
},

// Returns a list of normalized tabs taken from the recently closed list (max of 25
// per the Chrome API limit).
_getRecentlyClosedTabs: function() {
	const logHead = "HistoryFinder::_getRecentlyClosedTabs(): ";

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
			return this._processRecentlyClosedTabs(session);
		}.bind(this)
	);
},

}); // Classes.HistoryFinder

Classes.Base.roDef(Classes.HistoryFinder, "event", {});
Classes.Base.roDef(Classes.HistoryFinder.event, "REMOVED", "removed");
Classes.Base.roDef(Classes.HistoryFinder.event, "VISITED", "visited");
Classes.Base.roDef(Classes.HistoryFinder.event, "RCTAB", "rctab");