// Interacting with tabs

// CLASS PopupClient
Classes.PopupClient = Classes.MsgClient.subclass({
_init: function() {
	// Overriding the parent class' _init(), but calling that original function first
	Classes.MsgClient._init.apply(this, arguments);
},

}); // Classes.PopupClient

// CLASS TabsManager
// This class is "abstract" in the sense that it requires a _job() function to
// be defined by its subclasses. It assumes such function exists.

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

	this._updateScAllTabsJob = Classes.ScheduledJob.create(this._updateShortcutsAllTabs.bind(this));
	this._updateScAllTabsJob.debug();

	// Run job once now to initialize this._normTabs
	this._updateScAllTabsJob.run();

	this._windowFocusLossPoller = Classes.ScheduledJob.create(this._windowFocusLossCb.bind(this));
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
			this._tabsCountAssertPoller = Classes.ScheduledJob.create(this._tabsCountAssertCb.bind(this));
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

	// https://developer.chrome.com/docs/extensions/reference/commands/
	chrome.commands.onCommand.addListener(this._onCommandCb.bind(this));

	settingsStore.addEventListener(Classes.EventManager.Events.UPDATED, this._settingStoreUpdatedCb.bind(this));
},

_tabsCountAssertCb: function() {
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

_queryTabs: function() {
	return chromeUtils.wrap(chrome.tabs.query, "TabsManager::_queryTabs(): ", {});
},

_updateShortcutsAllTabs: function() {
	const logHead = "TabsManager::_updateShortcutsAllTabs(): "
	return this._queryTabs().then(
		function(tabs) {
			this._log(logHead + "query completed, updating shortcuts");
			this._normTabs = Classes.NormalizedTabs.create(tabs);
			settingsStore.getShortcutsManager().updateTabs(this._normTabs.getTabs());
		}.bind(this)
	);
},

_updateShortcutsOneTab: function(tab) {
	const logHead = "TabsManager::_updateShortcutsOneTab(" + tab.id + "): "
	this._log(logHead + "updating shortcuts with ", tab);
	this._normTabs.updateTab(tab);
	settingsStore.getShortcutsManager().updateTabs(this._normTabs.getTabs());
},

// Returns a Promise that resolves to the tabs count. Also store the tabs count in "_tabsCount".
_setTabsCount: function() {
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
	return chromeUtils.wrap(chrome.browserAction.setBadgeText, logHead, { text: tabsCount.toString() });
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
				this._onWindowFocusChangeCb(window.id);
				return;
			}
			if(!this._isActiveWindowIdNone && !window.focused) {
				// We've lost focus and we didn't receive an event, let's simulate one
				this._log(logHead + "lost focus, simulate focus change event: ", window);
				this._onWindowFocusChangeCb(chrome.windows.WINDOW_ID_NONE);
				return;
			}
			//this._log(logHead + "current state: ", this._isActiveWindowIdNone, window.focused);
		}.bind(this)
	);
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
	this._printBackTabs();
	// If you had [ 1, 2, 1, 2 ] and removed "2", you'd end up with [ 1, 1 ]. We don't want the
	// same tabId in consecutive places in the history stack, but we'll let _onTabActivatedCb()
	// take care of that clean up as needed.
	this._backTabs.removeValue(tabId);
	this._printBackTabs();
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
	this._printBackTabs();

	// No actions to take on behalf of shortcutsManager when a tab is activated

	// _activeTabId can be null upon initialization, but also upon calls to
	// _goBack() (see comments inside that function).
	if(this._activeTabId != null) {
		this._backTabs.push(this._activeTabId);
		// We don't want to call _notifyPopup() here because we need to wait
		// for this._activeTabId to be updated too
		//this._notifyPopup();
	}
	this._activeTabId = activeInfo.tabId;
	// When you close a tab or a window, another tab will get activated. If that
	// tab was already at the top of the stack, we don't want the user going back
	// ending up where she was already.
	// Things are even trickier when a tab gets closed, because _onTabRemovedCb()
	// removes a value from an array, causing other values to become adjacent.
	// So if you had [ 1, 2, 1, 2 ] and removed "2", you'd end up with [ 1, 1 ].
	// Again, as tab "1" gets activated, you want that mess to be cleaned up...
	this._cleanUpStacks(activeInfo.tabId);

	this._isActiveWindowIdNone = false;

	this._printBackTabs();

	// We call this here and not right after this._backTabs.push() because we need
	// to wait for this._activeTabId to be updated too
	this._notifyPopup();
},

_onWindowFocusChangeCb: function(windowId) {
	const logHead = "TabsManager::_onWindowFocusChangeCb(): ";
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

	this._printBackTabs();

	this._setActiveTabId().then(
		function(oldActiveTabId, newActiveTabId) {
			const logHead = "TabsManager::_onWindowFocusChangeCb().then(" + oldActiveTabId + ", " + newActiveTabId + "): ";
			this._log(logHead + "entering");
			// If the _activeTabId has not changed, don't push anything to _backTabs().
			// This can happen when transitioning through a chrome.windows.WINDOW_ID_NONE,
			// then going back to the same previous window/tab again
			if(oldActiveTabId != null && oldActiveTabId != newActiveTabId) {
				this._backTabs.push(oldActiveTabId);
				this._notifyPopup();
			}
			// See _onTabActivatedCb() for an explanation about _cleanUpStacks().
			// We need to call here too, because when closing a window, Chrome will move
			// to another window, but it won't change the active tab on that other window,
			// and therefore _onTabActivatedCb() won't be called, leaving the same potential
			// mess at the top of the stack
			this._cleanUpStacks(newActiveTabId);
			this._printBackTabs();
		}.bind(this, this._activeTabId)
	);
},

_getChromeActiveTab: function() {
	return chromeUtils.wrap(chrome.tabs.query, "TabsManager::_getChromeActiveTab(): ", {active: true, currentWindow: true});
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

_printBackTabs: function() {
	const logHead = "TabsManager::_printBackTabs(): ";
	this._log(logHead + JSON.stringify(this._backTabs.get()));
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

_goBack: function(closeCurrentTab) {
	closeCurrentTab = optionalWithDefault(closeCurrentTab, false);

	const logHead = "TabsManager::_goBack(" + closeCurrentTab + "): ";
	this._printBackTabs();

	//this._log(logHead + "before the change, this._activeTabId = " + this._activeTabId);

	if(this._isActiveWindowIdNone) {
		// If we were currently in chrome.windows.WINDOW_ID_NONE, the user expects _goBack()
		// to actually go back to what we know as the current active tab (since transitions
		// to chrome.windows.WINDOW_ID_NONE don't update _activeTabId).
		//
		// In this case we'll ignore the "closeCurrentTab" flag (consider it "false").
		this._log(logHead + "special case: back from chrome.windows.WINDOW_ID_NONE");
		this._isActiveWindowIdNone = false;
		chromeUtils.activateTab(this._activeTabId);
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
		chromeUtils.activateTab(nextTabId);
	} else {
		this._log(logHead + "no previous tabs to go back to");
	}

	if(closeCurrentTab && oldActiveTabId != null) {
		this._closeOldActiveTab(oldActiveTabId);
	}

	this._printBackTabs();
},

_goFwd: function(closeCurrentTab) {
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
		chromeUtils.activateTab(nextTabId);

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

// Returns "null" if the function could not access the clipboard
_getClipboardAsText: function() {
	const logHead = "TabsManager::_getClipboardAsText(): ";
	const textAreaId = "clipboard";
	const textAreaHtml = `
		<textarea id="${textAreaId}" name="clipboard"></textarea>
	`;

	// See https://developer.chrome.com/docs/extensions/reference/extension/#method-getBackgroundPage
	let backgroundPage = chrome.extension.getBackgroundPage();

	if(backgroundPage == null) {
		this._err(logHead + "unable to load DOM from background page");
		return null;
	}

	backgroundPage.document.body.innerHTML = textAreaHtml;
	let textAreaElem = backgroundPage.document.getElementById(textAreaId);

	if(textAreaElem == null) {
		this._err(logHead + "unable to get textarea element");
		return null;
	}

	textAreaElem.focus();
	// See https://developer.mozilla.org/en-US/docs/Web/API/Document/execCommand
	// It says execCommand() is deprecated, let's see...
	if(!backgroundPage.document.execCommand("paste")) {
		this._err(logHead + "paste command not supported");
		return null;
	}

	let retVal = textAreaElem.value;

	// Clean up
	backgroundPage.document.body.textContent = "";

	return retVal;
},

_launchOrSearch: function(url) {
	const logHead = "TabsManager::_launchOrSearch(): ";

	if(url == null) {
		// Nothing to do, an error log should already have been generated by _getClipboardAsText()
		return;
	}

	let searchUrl = optionalWithDefault(settingsStore.getOptionSearchUrl(),
										"https://www.google.com/search?q=%s");

	// First check if this is really a URL

	// Note that unfortunately something like "www.google.com" is not a valid URL because
	// it's missing the protocol ("https://"). For now let's live with this, even though
	// rom a UX perspective people will be surprised by the resulting search...
	if(!isUrl(url)) {
		this._log(logHead + "the clipboard doesn't contain a URL, opening a search page instead: " + url);
		// This is not a URL, let's consider it text for a Google (or whatever other
		// engine is configured) search.
		url = searchUrl.replace("%s", url);
//		url = "https://www.google.com/search?q=" + url;
	}

	chromeUtils.loadUrl(url);
},

_runCustomShortcutSearch: function(scInfo) {
	const logHead = "TabsManager::_runCustomShortcutSearch(): ";
	let text = this._getClipboardAsText();

	let url = scInfo.searchUrl.replace("%s", text);
	this._log(logHead + "converted searchUrl to: " + url, scInfo);

	// If there are no candidateTabs, open "url" in new tab
	if(scInfo.candidateTabs == null) {
		this._log(logHead + "no candidateTabs, opening in new tab");
		// We pick the "least tabbed window" to open the new tab
		chromeUtils.loadUrl(url);
		return;
	}

	// If we get here, there are candidateTabs. Search for an exact match of
	// "url" among them, and if you can't find it, just open "url" in candidateTabs[0].

	// We can't open the lower case URL, but we can try to search using it...
	let lowerCaseUrl = url.toLowerCase();
	let tabIdx = scInfo.candidateTabs.findIndex(
		function(elem) {
			if(elem.tm.lowerCaseUrl == lowerCaseUrl) {
				return true;
			}
			return false;
		}.bind(this)
	);

	// If we found an exact match, open that tab, otherwise open tab 0.
	tabIdx = (tabIdx != -1) ? tabIdx : 0;
	this._log(logHead + "opening in candidateTabs[" + tabIdx + "]", scInfo.candidateTabs[tabIdx]);
	chromeUtils.loadUrl(url, scInfo.candidateTabs[tabIdx].id);
},

_manageCustomShortcut: function(shortcut) {
	const logHead = "TabsManager::_manageCustomShortcut(" + shortcut + "): ";
	this._log(logHead + "entering");
	let scInfo = settingsStore.getShortcutsManager().getShortcutInfo(shortcut);

	if(scInfo == null) {
		this._err(logHead + "unknown shortcut key");
		return;
	}

	if(scInfo.empty) {
		// The shortcut has not been configured. For unconfigured shortcuts we want to
		// default to the "open new tab" behavior
		chromeUtils.reuseOrCreateTab();
		return;
	}

	let tabId = (scInfo.tab != null) ? scInfo.tab.id : null;

	if(scInfo.url != null) {
		this._log(logHead + "loading URL " + scInfo.url);
		// Pick the "least tabbed window" to open the new tab if we need a new
		// tab, or the existing tab if there is one
		chromeUtils.loadUrl(scInfo.url, tabId);
		return;
	}

	// A "url" is not set (hostname case), but if there's a tab, we need to activate it.
	if(tabId != null) {
		// Need to open a tab
		this._log(logHead + "opening tabId " + tabId + ", no URL change");
		chromeUtils.activateTab(tabId);
		return;
	}
	
	// If we get here, we need to deal with a search
	this._log(logHead + "tabId = " + tabId + ", search case: ", scInfo);
	this._runCustomShortcutSearch(scInfo);
},

//_testUndocking: function() {
//	const logHead = "TabsManager::_testUndocking(): ";
//	const url = chrome.runtime.getURL(isProd() ? "popup.html?undocked" : "popup/popup.html?undocked");
//	chromeUtils.wrap(chrome.windows.create, logHead, {
//			focused: true,
//			type: "popup",
//			url: url,
//	}).then(
//		function() {
//			this._log(logHead + "created");
//		}.bind(this)
//	);
//},

_onCommandCb: function(cmd) {
	const logHead = "TabsManager::_onCommandCb(" + cmd + "): ";
	this._log(logHead + "entering");

	switch(cmd) {
		case window.ExtCommands.BACK:
			this._goBack();
			break;
		case window.ExtCommands.FWD:
			this._goFwd();
			break;
		case window.ExtCommands.CLOSEBACK:
			this._goBack(true);
			break;
		case window.ExtCommands.CLOSEFWD:
			this._goFwd(true);
			break;
		case window.ExtCommands.LAUNCHORSEARCH:
			let url = this._getClipboardAsText();
			//this._log(logHead + "The URL is " + url);
			this._launchOrSearch(url);
			break;
		case window.ExtCommands.SHORTCUT01:
		case window.ExtCommands.SHORTCUT02:
		case window.ExtCommands.SHORTCUT03:
		case window.ExtCommands.SHORTCUT04:
		case window.ExtCommands.SHORTCUT05:
			this._manageCustomShortcut(cmd);
			break;
//		case window.ExtCommands.SHORTCUT05:
//			this._testUndocking();
//			break;
		default:
			this._err(logHead + "unknown command");
			break;
	}
},

}); // Classes.TabsManager
