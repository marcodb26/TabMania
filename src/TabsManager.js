// Interacting with tabs

// CLASS PopupClient
Classes.PopupClient = Classes.MsgClient.subclass({
_init: function() {
	// Overriding the parent class' _init(), but calling that original function first
	Classes.MsgClient._init.apply(this, arguments);
},

}); // Classes.PopupClient

// CLASS TabsManager
//
Classes.TabsManager = Classes.Base.subclass({
	_backTabs: null,
	_fwdTabs: null,

	// A message client to be used to send notifications to the popup
	_popupClient: null,

	_activeTabId: null,
	// We need to know if the current windowId is chrome.windows.WINDOW_ID_NONE only
	// because of the special case in _goBack()
	_isActiveWindowIdNone: null,

	// Keep track of the tabs count as tabs are opened and closed, and visualize it
	// in a badge on the popup icon in the extensions toolbar
	_tabsCount: null,

	// Object containing all current known tabs
	_normTabs: null,

	// Since _updateShortcutsAllTabs is expensive, we don't want to run it more often
	// than once a second
	_updateScAllTabsJob: null,
	_updateScAllTabsDelay: 1000,

	_windowFocusLossPoller: null,
	_windowFocusLossInterval: 1000,

	// _tabsCountPoller is a recurring job that monitors the tabsCount to make sure
	// no discrepancies are introduced vie the tabs events. It's only for debugging,
	// and should probably be disabled for production
	_tabsCountAssertPoller: null,

_init: function() {
	// Overriding the parent class' _init(), but calling that original function first
	Classes.Base._init.apply(this, arguments);

	this._popupClient = Classes.PopupClient.create();
	this._popupClient.debug();

	this._backTabs = Classes.BoundArray.create(1000);
	this._fwdTabs = Classes.BoundArray.create(1000);
	this._isActiveWindowIdNone = false;

	this._updateScAllTabsJob = Classes.ScheduledJob.create(this._updateShortcutsAllTabs.bind(this),
								this._id + ".updateScAllTabs");
	this._updateScAllTabsJob.debug();

	// Run job once now to initialize this._normTabs
	this._updateScAllTabsJob.run();

	this._windowFocusLossPoller = Classes.ScheduledJob.create(this._windowFocusLossCb.bind(this),
								this._id + ".windowFocusLossPoller");
	this._windowFocusLossPoller.debug();

	// Note that _setActiveTabId() is asynchronous, so it's possible (though unlikely) that this
	// call might complete after the rest of the logic has started operating and we started
	// reading this._activeTabId. The real issue is that in that case _setActiveTabId() could
	// corrupt the value of _activeTabId. To prevent that, we're serializing the execution of
	// the rest of the logic, by attaching the listeners only after _activeTabId is initialized
	// (though it could still get initialized to null!)
	this._setActiveTabId().then(
		function(activeTabId) {
			const logHead = "TabsManager::_init().then(): ";
			this._log(logHead + "entering");
			this._addAllListeners();
			this._windowFocusLossPoller.start(this._windowFocusLossInterval);
		}.bind(this)
	);

	// Initialize _tabsCount and the popup icon badge.
	this._setTabsCount().then(
		// Run periodically a debugging assertion that the count is accurate
		function() {
			this._tabsCountAssertPoller = Classes.ScheduledJob.create(this._tabsCountAssertCb.bind(this),
											"tabsCountAssertPoller");
			// Let it run every 30 seconds
			this._tabsCountAssertPoller.start(30*1000);
		}.bind(this)
	);
},

_addAllListeners: function() {
	// https://developer.chrome.com/docs/extensions/reference/tabs/#event-onCreated
	chrome.tabs.onCreated.addListener(this._onTabCreatedCb.bind(this));
	// https://developer.chrome.com/docs/extensions/reference/tabs/#event-onUpdated
	chrome.tabs.onUpdated.addListener(this._onTabUpdatedCb.bind(this));
	// https://developer.chrome.com/docs/extensions/reference/tabs/#event-onActivated
	chrome.tabs.onActivated.addListener(this._onTabActivatedCb.bind(this));
	https://developer.chrome.com/docs/extensions/reference/tabs/#event-onRemoved
	chrome.tabs.onRemoved.addListener(this._onTabRemovedCb.bind(this));
	// https://developer.chrome.com/docs/extensions/reference/tabs/#event-onAttached
	chrome.tabs.onAttached.addListener(this._onTabAttachedCb.bind(this));
	// https://developer.chrome.com/docs/extensions/reference/tabs/#event-onMoved
	chrome.tabs.onMoved.addListener(this._onTabMovedCb.bind(this));
	// https://developer.chrome.com/docs/extensions/reference/windows/#event-onFocusChanged
	chrome.windows.onFocusChanged.addListener(this._onWindowFocusChangeCb.bind(this));

	settingsStore.addEventListener(Classes.EventManager.Events.UPDATED, this._settingStoreUpdatedCb.bind(this));
},

_tabsCountAssertCb: function() {
	// Leaving the "incognito" argument of _queryTabs() "undefined", to count across all tabs,
	// both incognito and non-incognito
	this._queryTabs().then(
		function(tabs) {
			logHead = "TabsManager::_tabsCountAssertCb().cb: ";
			let tabsCount = tabs.length;
			if(tabsCount != this._tabsCount) {
				this._err(logHead + "found discrepancy: " + tabsCount + " " + this._tabsCount);
				// Fix the discrepancy
				this._tabsCount = tabsCount;
				this._setPopupBadge(tabsCount);
			}
		}.bind(this)
	);
},

// Don't assign a default value, because we need to offer the option to leave it
// "undefined" to search across both incognito and non-incognito tabs
_queryTabs: function(incognito) {
	return chromeUtils.queryTabs({ incognito }, "TabsManager::_queryTabs(): ");
},

_updateShortcutsAllTabs: function() {
	const logHead = "TabsManager::_updateShortcutsAllTabs():";

	// Shortcuts are only applied to non-incognito tabs
	return this._queryTabs(false).then(
		function(tabs) {
			this._log(logHead, "query completed, updating shortcuts");
			this._normTabs = Classes.TabsStore.create(tabs);
			settingsStore.getShortcutsManager().updateTabs(this._normTabs.get());
			this._normTabs.addShortcutBadges();
		}.bind(this)
	);
},

_updateShortcutsOneTab: function(tab) {
	const logHead = "TabsManager::_updateShortcutsOneTab(" + tab.id + "):";

	this._normTabs.update(tab);

	if(tab.incognito) {
		this._log(logHead, "ignoring incognito tab for shortcuts");
		return;
	}

	this._log(logHead, "updating shortcuts with ", tab);
	settingsStore.getShortcutsManager().updateTabs(this._normTabs.get());
},

// Returns a Promise that resolves to the tabs count. Also store the tabs count in "_tabsCount".
_setTabsCount: function() {
	// Leaving the "incognito" argument of _queryTabs() "undefined", to count across all tabs,
	// both incognito and non-incognito
	return this._queryTabs().then(
		function(tabs) {
			let tabsCount = tabs.length;
			this._tabsCount = tabsCount;
			this._setPopupBadge(tabsCount);
			return tabsCount;
		}.bind(this)
	);
},

_incrementTabsCount: function() {
	this._setPopupBadge(++this._tabsCount);
},

_decrementTabsCount: function() {
	this._tabsCount--;

	// Just being paranoid that we might miss some tab removed/activated notifications
	// and end up out of sync...
	if(this._tabsCount < 0) {
		this._tabsCount = 0;
	}

	this._setPopupBadge(this._tabsCount);
},

_setPopupBadge: function(tabsCount) {
	const logHead = "TabsManager::_setPopupBadge(" + tabsCount + "): ";
	this._log(logHead + "entering");

	// Limit the maximum number of digits to 3, to comply with the 4 characters
	// restrictions of the badge
	// See https://developer.chrome.com/docs/extensions/reference/browserAction/#method-setBadgeText
	if(tabsCount > 999) {
		// Turn it into a string
		tabsCount = "999+"
	}

	// Note that if you specify an integer for "text", the function fails, we need to cast
	// the number to string explicitly.
	return chromeUtils.wrap(chromeUtils.bAction.setBadgeText, logHead, { text: tabsCount.toString() });
},

// There seems to be a bug in Chrome that causes the event "onFocusChanged" to only fire
// when switching between Chrome windows, not when switching from Chrome windows to the
// windows of other applications. On the other hand, if you poll chrome.windows.getCurrent(),
// when the focus goes to another application "window.focused" correctly switches to "false"
// for the current Chrome window (never mind that the current Chrome window also changes
// to a different window ID when that happens (not sure why, but it always goes to the window
// with the highest ID in the few tests I ran).
// You simulate a loss of focus, but since Chrome doesn't know the focus was lost, it won't
// generate a focus change also when you go back to the Chrome window (which is odd because
// the window ID changes again in getCurrent(), so it should generate a focus change just for
// the switch from Chrome window to Chrome window). So you also need to simulate a recovery
// of focus by doing the reverse check. And when you move to a DevTools window you could end
// up with a little duplication, see _onWindowFocusChangeCb() for details.
_windowFocusLossCb: function() {
	const logHead = "TabsManager::_windowFocusLossCb(): ";

	chromeUtils.wrap(chrome.windows.getCurrent, logHead, null).then(
		function(window) {
			if(this._isActiveWindowIdNone && window.focused) {
				// We think we don't have focus, but we actually do, let's simulate a
				// focus restored event
				this._log(logHead + "focus restored, simulate focus change event: ", window);
				this._onWindowFocusChangeCb(window.id, "simulated");
				return;
			}
			if(!this._isActiveWindowIdNone && !window.focused) {
				// We've lost focus and we didn't receive an event, let's simulate one
				this._log(logHead + "lost focus, simulate focus change event: ", window);
				this._onWindowFocusChangeCb(chrome.windows.WINDOW_ID_NONE, "simulated");
				return;
			}
			//this._log(logHead + "current state: ", this._isActiveWindowIdNone, window.focused);
		}.bind(this)
	);
},

_isTabDedupActive: function(tab) {
	if(tab.openerTabId == null) {
		if(!settingsStore.getOptionNewTabNoOpenerDedup()) {
			// Configured to not dedup new tabs opened with no opener
			return false;
		}
	} else {
		if(tab.pendingUrl == "chrome://newtab/") {
			if(!settingsStore.getOptionNewEmptyTabDedup()) {
				// Configured to not dedup new empty tabs
				return false;
			}
		} else {
			if(!settingsStore.getOptionNewTabWithOpenerDedup()) {
				// Configured to not dedup new tabs opened with an opener (that is, opened from
				// another tab).
				// Note that this check happens after the check for tab.active, so we won't
				// dedup new tabs starting inactive (e.g. CTRL + link-click).
				return false;
			}
		}
	}

	return true;
},

_findExistingUrlMatchTab: async function(tab) {
	const logHead = "TabsManager::_findExistingUrlMatchTab(): ";

	if(!this._isTabDedupActive(tab)) {
		this._log(logHead + "new tab deduplication configured off");
		return null;
	}

	// Since the tab has already been normalized, we can rely on "tab.tm.url" to contain
	// either tab.url or tab.pendingUrl.
	if(tab.tm.url == "") {
		// Can't deduplicate if there's no URL
		this._log(logHead + "no URL", tab);
		return null;
	}

	let tabList = await chromeUtils.queryTabs({ url: tab.tm.url, incognito: tab.incognito }, logHead);

	if(tabList.length == 0) {
		return null;
	}

	let thisTabIdx = -1;
	// Prefer returning a tab in the same window
	for(let i = 0; i < tabList.length; i++) {
		// Note that we also need to filter out "tab" (this function's input), which should match by
		// definition. We also want to remember which index it has, in case we can't find a match
		// in this loop.
		if(tabList[i].id == tab.id) {
			if(thisTabIdx == -1) {
				// There should only be one index matching "tab.id", but in case there's more
				// than one, we want to pick the first, not the last (to support the logic
				// after this loop)
				thisTabIdx = i;
			} else {
				this._err(logHead + "more than one tab with same ID", tab.id, thisTabIdx, i, tabList);
			}
			continue;
		}
		if(tabList[i].windowId == tab.windowId) {
			return tabList[i];
		}
	}

	// Not found in the same window, return the first found that's not also "tab.id"
	if(thisTabIdx != 0) {
		// We only reach this point if tabList.length > 0
		return tabList[0];
	}

	// tabList[0] is "tab.id", so we need to get to the next index, but we first need to
	// check there's a next index. This check assumes that only one node in "tabList"
	// matches "tab.id" (and it's at index 0).
	if(tabList.length > 1) {
		return tabList[1];
	}
	return null;
},

// Returns "null" if there's any condition preventing the move (configuration, or the
// tab is already in the least tabbed window). Otherwise returns the window ID of the
// window this tab should be moved to.
_getLtwIdForMove: async function(tab) {
	if(tab.openerTabId == null) {
		if(!settingsStore.getOptionNewTabNoOpenerInLTW()) {
			// Configured to not move new tabs opened with no opener
			return null;
		}
	} else {
		if(tab.pendingUrl == "chrome://newtab/") {
			if(!settingsStore.getOptionNewEmptyTabInLTW()) {
				// Configured to not move new empty tabs
				return null;
			}
		} else {
			if(!settingsStore.getOptionNewTabWithOpenerInLTW()) {
				// Configured to not move new tabs opened with an opener (that is, opened from
				// another tab).
				// Note that this check happens after the check for tab.active, so we won't
				// move new tabs starting inactive (e.g. CTRL + link-click).
				return null;
			}
		}
	}

	// If the tab was non-incognito, move only to a non-incognito window, while if it was
	// incognito, move only to an incognito window
	let moveWinId = await chromeUtils.getLeastTabbedWindowId(tab.incognito, tab.windowId);

	if(moveWinId == tab.windowId) {
		return null;
	}

	return moveWinId;
},

// This function manages two potential actions:
// - Avoid creating a new tab if there's already an existing tab for the same URL
// - If the previous condition is not true, move the new tab to the least tabbed window (LTW)
//
// This two actions could be built as separate functions and called in the sequence listed
// above. The problem is that if you do that, you'll have to wait for a lot of async functions
// with serialized execution. This can make the transition appear very clunky. Instead, we
// choose to run the initial precondition checks in parallel, then we take the most appropriate
// branch and run to completion.
_createdTabSpecialActions: async function(tab) {
	const logHead = "TabsManager::_createdTabSpecialActions(): ";

	if(tab.tm.protocol == "chrome-extension:") {
		// Don't take any action for any Chrome extension popup (especially TabMania's own!)
		return;
	}

	if(!tab.active) {
		// Move/deduplicate only tabs that are created in the foreground
		return;
	}

	// Right now this._activeTabId is still pointing to the tab that was active before the
	// new tab was created in that same window. It will change when the new tab gets activated,
	// but "onCreated" happens before "onActivated". We just need to store the value before
	// we start the async dance, because it might change while we're waiting.
	let refActiveTabId = this._activeTabId;

	// Launching 3 parallel checks:
	// - Are we configured for dedup and is there an existing URL matching the new tab's URL?
	// - Are we configured to move to least tabbed window, and what's the LTW?
	// - Is the new tab in a popup window?
	//
	// The last check should be done first, but we don't want to delay the other two checks by
	// an extra event cycle, so running all of them in the same event cycle with Promise.all()
	let existingTabPromise = this._findExistingUrlMatchTab(tab);
	let ltwIdPromise = this._getLtwIdForMove(tab);
	let winInfoPromise = chromeUtils.wrap(chrome.windows.get, logHead, tab.windowId);

	let [ existingTab, ltwId, winInfo ] = await Promise.all([ existingTabPromise, ltwIdPromise, winInfoPromise ]);

	if(winInfo != null && winInfo.type == "popup") {
		// No special actions are taken for popup windows
		this._log(logHead + "popup window, ignoring", winInfo);
		return;
	}

	if(existingTab == null && ltwId == null) {
		// None of the special actions apply: no existing tab, and the new tab is already
		// on the least tabbed window (or TabMania is configured to not move). Nothing to do.
		this._log(logHead + "nothing to do");
		return;
	}

	if(existingTab != null) {
		this._log(logHead + "found existing tab (new, existing):", tab, existingTab);
		if(existingTab.windowId != tab.windowId) {
			// If we close the newly created tab to replace it with an existing tab in a different
			// window, the old window needs to put back the active tab where it was before the new
			// tab got created. Chrome doesn't do that, it will set as active the rightmost tab in
			// the old window (the tab right before the new tab we moved). Let's fix it by activating
			// again "refActiveTabId".
			// The only exception is the case in which we found an existing tab and it's located
			// in the same window as the tab that was just created.
			// Note that it's important to take this action first, to avoid some clunkiness with the
			// UX of the other dedup actions.
			//
			// No reason to include this promise in the return value.
			chromeUtils.wrap(chrome.tabs.update, logHead, refActiveTabId, { active: true });
		}
		return Promise.all([ chromeUtils.activateTab(existingTab), chromeUtils.closeTab(tab.id) ]);
	}

	// If we get here, we need to move the tab to the least tabbed window. Note that the action
	// with "refActiveTabId" is taken inside chromeUtils.moveTab() in this case, no need to make
	// that extra call explicitly.
	this._log(logHead + "moving tab to least tabbed window", ltwId, tab);
	return chromeUtils.moveTab(tab, ltwId, true, refActiveTabId);
},

_onTabCreatedCb: function(tab) {
	const logHead = "TabsManager::_onTabCreatedCb(tabId: " + tab.id + ", time: " + Date.now() + "): ";
	this._log(logHead + "tab: ", tab);

	// Let's try to minimize calls to _updateShortcutsAllTabs(), it's expensive.
	// Note that it's probably irrelevant to take actions on the onCreated event,
	// because the tab is still missing title and URL, and there will be onUpdated
	// as it loads and becomes available.
	this._updateShortcutsOneTab(tab);

	// Keep track of the count for the popup icon badge
	this._incrementTabsCount();

	this._createdTabSpecialActions(tab);
},

_onTabRemovedCb: function(tabId, removeInfo) {
	const logHead = "TabsManager::_onTabRemovedCb(tabId: " + tabId + ", time: " + Date.now() + "): ";
	this._log(logHead + "removeInfo: ", removeInfo);

	// When a tab is removed, many other tabs in the same window have their "index" affected,
	// though from a shortcuts perspective the relative position of each tab remains the same,
	// so possibly we could just introduce a function to remove a tab from _normTabs...
	this._updateScAllTabsJob.run(this._updateScAllTabsDelay);

	// Keep track of the count for the popup icon badge
	this._decrementTabsCount();

	// Remove tabId from _backTabs and _fwdTabs.

	// If this tab was active, _activeTabId must be cleaned up, otherwise _onTabActivatedCb()
	// will push() the now non-existing tab to _backTabs after this function has finished.
	if(this._activeTabId == tabId) {
		this._activeTabId = null;
	}

	// I suspect this choice is suboptimal, we should just ignore the tabIds in _backTabs and
	// continue to pop() down the stack as they show up. The problem is that that strategy is
	// harder to implement, since Chrome doesn't have an explicit API to query if a tab exists.
	// Per https://stackoverflow.com/questions/16571393/the-best-way-to-check-if-tab-with-exact-id-exists-in-chrome
	// the best way is to call chrome.tabs.get() and just deal with chrome.runtime.lastError
	// from inside the callback of that function. This makes the logic a bit hellish to write,
	// with all the async stuff involved. Also concerning that it might take a long time to
	// get to a valid tab, if lots of tabs have been closed.
	// This choice has the advantage that the _backTabs and _fwdTabs will be updated in the
	// background while the user is not trying to invoke this extension, so when the user invokes
	// the extension all tabIds are very likely to exist. Very likely, but not certain, we'll see...
	this._printBackTabs(logHead);
	// If you had [ 1, 2, 1, 2 ] and removed "2", you'd end up with [ 1, 1 ]. We don't want the
	// same tabId in consecutive places in the history stack, but we'll let _onTabActivatedCb()
	// take care of that clean up as needed.
	this._backTabs.removeValue(tabId);
	this._printBackTabs(logHead);
	this._fwdTabs.removeValue(tabId);
},

_onTabUpdatedCb: function(tabId, changeInfo, tab) {
	const logHead = "TabsManager::_onTabUpdatedCb(tabId: " + tabId + ", time: " + Date.now() + "): ";
	this._log(logHead + "changeInfo: ", changeInfo);
	if(tab.pendingUrl != null && tab.url != tab.pendingUrl) {
		this._log(logHead + "URL changing from " + tab.url + " to " + tab.pendingUrl);
	}

	// Let's try to minimize calls to _updateShortcutsAllTabs(), it's expensive.
	this._updateShortcutsOneTab(tab);
},

// Tab attached to a new window
_onTabAttachedCb: function(tabId, attachInfo) {
	const logHead = "TabsManager::onTabAttachedCb(tabId " + tabId + ", time: " + Date.now() + "): ";
	this._log(logHead + "attachInfo: ", attachInfo);

	// Attaching or moving a tab triggers "index" changes in many tabs. The only
	// way to be back in sync is to do a full query again
	this._updateScAllTabsJob.run(this._updateScAllTabsDelay);
},

// Tab moved within the same window
_onTabMovedCb: function(tabId, moveInfo) {
	const logHead = "TabsManager::onTabMovedCb(tabId " + tabId + ", time: " + Date.now() + "): ";
	this._log(logHead + "moveInfo: ", moveInfo);

	// Attaching or moving a tab triggers "index" changes in many tabs. The only
	// way to be back in sync is to do a full query again
	this._updateScAllTabsJob.run(this._updateScAllTabsDelay);
},

_settingStoreUpdatedCb: function(ev) {
	const logHead = "TabsManager::_settingStoreUpdatedCb(" + ev.detail.key + "): ";
	this._log(logHead + "entering");

	// There's actually nothing to do here: the shortcutManager has already updated
	// its database before generating this notification, and we care about that data
	// only when a shortcut command is received.

//	// We only care about changes in shortcutManager, all other configuration
//	// changes are popup-only and irrelevant in the background
//	if(!settingsStore.getShortcutsManager().isShortcutKey(key)) {
//		return;
//	}
},

_cleanUpStacks: function(tabId) {
	while(this._backTabs.peek() == tabId) {
		this._backTabs.pop();
	}
	while(this._fwdTabs.peek() == tabId) {
		this._fwdTabs.pop();
	}
},

_onTabActivatedCb: function(activeInfo) {
	const logHead = "TabsManager::_onTabActivatedCb(time: " + Date.now() + "): ";
	this._log(logHead + "activeInfo: ", activeInfo);
	this._printBackTabs(logHead);

	// No actions to take on behalf of shortcutsManager when a tab is activated

	let oldActiveTabId = this._activeTabId;
	this._activeTabId = activeInfo.tabId;

	// _activeTabId can be null upon initialization, but also upon calls to
	// _goBack() (see comments inside that function).
	if(oldActiveTabId != null) {
		if(this._backTabs.peek() != oldActiveTabId) {
			this._backTabs.push(oldActiveTabId);
			this._notifyPopup();
		} else {
			// See _onWindowFocusChangeCb() for why we need this check
			this._log(logHead + "tabId " + oldActiveTabId + " already at the top of _backTabs, nothing to do");
		}
	}

	// When you close a tab or a window, another tab will get activated. If that
	// tab was already at the top of the stack, we don't want the user going back
	// ending up where she was already.
	// Things are even trickier when a tab gets closed, because _onTabRemovedCb()
	// removes a value from an array, causing other values to become adjacent.
	// So if you had [ 1, 2, 1, 2 ] and removed "2", you'd end up with [ 1, 1 ].
	// Again, as tab "1" gets activated, you want that mess to be cleaned up...
	this._cleanUpStacks(activeInfo.tabId);

	// We get bad _onWindowFocusChangeCb() events from Chrome when clicking a new
	// window to focus it, and also clicking a different tab to open it:
	//
	// 17:35:25:649 [tabsManager] TabsManager::_onWindowFocusChangeCb(real): windowId: 713
	// 17:35:25.649 [tabsManager] TabsManager::_onWindowFocusChangeCb(real): backTabs is: (10) [697, 719, 697, 698]
	// 17:35:25.698 [tabsManager] TabsManager::_onWindowFocusChangeCb(real): windowId: -1
	// 17:35:25.698 [tabsManager] TabsManager::_onWindowFocusChangeCb(real): all Chrome windows have lost focus
	// 17:35:25.703 [tabsManager] TabsManager::_onTabActivatedCb(time: 1614821725703): activeInfo:  {tabId: 718, windowId: 713}
	//
	// The second event at time 17:35:25.698 is bogus, but it consistently gets generated by Chrome.
	// Since we have an _onTabActivatedCb() right after it, we can take advantage of that to restore
	// the correct state for _isActiveWindowIdNone, without having to wait for _windowFocusLossCb()
	// to clean up up to one second later.
	this._isActiveWindowIdNone = false;

	this._printBackTabs(logHead);
},

// "simulated" is just a debugging paameter to recognize a real invocation from
// the event, vs. a simulated invocation from _windowFocusLossCb()
_onWindowFocusChangeCb: function(windowId, simulated) {
	simulated = optionalWithDefault(simulated, "real");
	const logHead = "TabsManager::_onWindowFocusChangeCb(" + simulated + "): ";
	this._log(logHead + "windowId: " + windowId);

	// No actions to take on behalf of shortcutsManager when the window's focus changes

	if(windowId == chrome.windows.WINDOW_ID_NONE) {
		// Note that natively this case seems to happen only when going from a
		// standard window to a DevTools window (still Chrome), not about going
		// to the window of a different application. That's why we're simulating
		// the event in _windowFocusLossCb().
		if(this._isActiveWindowIdNone) {
			// The duplication occurs when the simulated event identifies the loss
			// of focus correctly, then you put in focus a DevTools window, and
			// Chrome thinks it's lost focus at that point (but in a way, it actually
			// got it back from a different application)
			this._log(logHead + "duplicated event");
		} else {
			this._log(logHead + "all Chrome windows have lost focus");
			this._isActiveWindowIdNone = true;
		}
		return;
	}

	this._isActiveWindowIdNone = false;

	this._printBackTabs(logHead);

	this._setActiveTabId().then(
		function(oldActiveTabId, newActiveTabId) {
			const logHead = "TabsManager::_onWindowFocusChangeCb().then(" + oldActiveTabId + ", " + newActiveTabId + "): ";
			this._log(logHead + "entering");
			// If the _activeTabId has not changed, don't push anything to _backTabs().
			// This can happen when transitioning through a chrome.windows.WINDOW_ID_NONE,
			// then going back to the same previous window/tab again
			if(oldActiveTabId != null && oldActiveTabId != newActiveTabId) {
				if(this._backTabs.peek() != oldActiveTabId) {
					this._backTabs.push(oldActiveTabId);
					this._notifyPopup();
				} else {
					// If you are focused on a window (Chrome or not) and click on a new window
					// (to focus it) and your click targets also a new tab, you'll get two events:
					// _onWindowFocusChangeCb() and _onTabActivatedCb(), and both will want to push
					// the previous tab to _backTabs, but only one should.
					// In our current tests we've seen _onTabActivatedCb() setting it first, but
					// the race could be won by either one, so we need to put this defensive check
					// in both places.
					this._log(logHead + "tabId " + oldActiveTabId + " already at the top of _backTabs, nothing to do");
				}
			}
			// See _onTabActivatedCb() for an explanation about _cleanUpStacks().
			// We need to call here too, because when closing a window, Chrome will move
			// to another window, but it won't change the active tab on that other window,
			// and therefore _onTabActivatedCb() won't be called, leaving the same potential
			// mess at the top of the stack
			this._cleanUpStacks(newActiveTabId);
			this._printBackTabs(logHead);
		}.bind(this, this._activeTabId)
	);
},

_getChromeActiveTab: function() {
	// No need to use the "incognito" option, since we're locking that down by
	// selecting the current window
	return chromeUtils.queryTabs({ active: true, currentWindow: true }, "TabsManager::_getChromeActiveTab(): ");
},

// Sets the _activeTabId to the current Chrome active tab
_setActiveTabId: function() {
	return this._getChromeActiveTab().then(
		function(tabs) {
			const logHead = "TabsManager::_setActiveTabId().cb: "
			if(tabs.length == 0) {
				this._log(logHead + "info not available");
				this._activeTabId = null;
			} else {
				// The log below will display the entire tabs[0] object, just in case
				// we can learn something interesting from it
				this._log(logHead + "setting this._activeTabId to " + tabs[0].id, tabs[0]);
				this._activeTabId = tabs[0].id;
			}
			return this._activeTabId;
		}.bind(this)
	);
},

_printBackTabs: function(logHead) {
	logHead = optionalWithDefault(logHead, "TabsManager::_printBackTabs(): ");
	this._log(logHead + "backTabs is:", this._backTabs.get());
},

// This call is just a wrapper of chromeUtils.closeTab() with some validation, but the validation
// assumes this call is made right after chromeUtils.activateTab() of a new tab
_closeOldActiveTab: function(oldActiveTabId) {
	const logHead = "TabsManager::_closeOldActiveTab(" + oldActiveTabId + "): ";

	this._log(logHead + "closing tab ID");

	// This call cannot make the assumption that one can't switch from a tab back to the same tab.
	// The only case when that can happen is when you're going back and there are no more tabs
	// to go back to. See comment in _goFwd().
	if(this._activeTabId == oldActiveTabId) {
		this._log(logHead + "previous and current tab ID are the same");
	}
	chromeUtils.closeTab(oldActiveTabId);
},

_notifyPopup: function() {
	// To be implemented
	//
	//this._popupClient.sendNotification("tabsList",
	//					{ activeTabId: this._activeTabId, recent: this._backTabs.peek(10) });
},

goBack: function(closeCurrentTab) {
	closeCurrentTab = optionalWithDefault(closeCurrentTab, false);

	const logHead = "TabsManager::_goBack(" + closeCurrentTab + "): ";
	this._printBackTabs(logHead);

	//this._log(logHead + "before the change, this._activeTabId = " + this._activeTabId);

	if(this._isActiveWindowIdNone) {
		// If we were currently in chrome.windows.WINDOW_ID_NONE, the user expects _goBack()
		// to actually go back to what we know as the current active tab (since transitions
		// to chrome.windows.WINDOW_ID_NONE don't update _activeTabId).
		//
		// In this case we'll ignore the "closeCurrentTab" flag (consider it "false").
		this._log(logHead + "special case: back from chrome.windows.WINDOW_ID_NONE");
		this._isActiveWindowIdNone = false;
		chromeUtils.activateTabByTabId(this._activeTabId);
		return;
	}

	const oldActiveTabId = this._activeTabId;
	const nextTabId = this._backTabs.pop();

	if(nextTabId != null) {
		if(this._activeTabId != null) {
			this._fwdTabs.push(this._activeTabId);
			// When we go back to a previous tab, "chrome.tabs.update(nextTabId, { selected: true })"
			// triggers _onTabActivatedCb(), which in turn would push() _activeTabId in _backTabs.
			// Since we're going back, we want to push _activeTabIds in _fwdTabs, and not in _backTabs,
			// so we need to make _activeTabId null to make sure _onTabActivatedCb() doesn't pick
			// it up.
			this._activeTabId = null;
		}
		this._log(logHead + "switching back to tab " + nextTabId);
		chromeUtils.activateTabByTabId(nextTabId);
	} else {
		this._log(logHead + "no previous tabs to go back to");
	}

	if(closeCurrentTab && oldActiveTabId != null) {
		this._closeOldActiveTab(oldActiveTabId);
	}

	this._printBackTabs(logHead);
},

goFwd: function(closeCurrentTab) {
	closeCurrentTab = optionalWithDefault(closeCurrentTab, false);

	const logHead = "TabsManager::_goFwd(" + closeCurrentTab + "): ";
	//this._printBackTabs();
	// This function doesn't need a special case for chrome.windows.WINDOW_ID_NONE

	const oldActiveTabId = this._activeTabId;
	const nextTabId = this._fwdTabs.pop();

	if(nextTabId != null) {
		// Unike in _goBack(), here we don't want to erase _activeTabId, because the normal
		// logic will store it in _backTabs, which is what we want
		this._log(logHead + "switching forward to tab " + nextTabId);
		chromeUtils.activateTabByTabId(nextTabId);

		// Note that this behavior is different from the behavior of _goBack().
		// In _goBack() we close the old active tab even if there's no older tab
		// to go back too (possibly closing Chrome completely this way), while
		// instead here we close the old active tab only if there is a new tab
		// to go to, because it would look odd to close the tab and end up in
		// a back tab instead of a fwd tab.
		if(closeCurrentTab && oldActiveTabId != null) {
			this._closeOldActiveTab(oldActiveTabId);
		}
	} else {
		this._log(logHead + "no forward tabs to go back to");
	}
},

}); // Classes.TabsManager
