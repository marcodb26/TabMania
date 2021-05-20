// CLASS ChromeUtils
Classes.ChromeUtils = Classes.Base.subclass({
	// Switch between "chromeUtils.bAction" and "chrome.action" depending on whether
	// you're using manifest v2 or manifest v3.
	// Note that we're not using "chrome.pageAction", but if we did, we'd want to 
	// have a "pAction: chrome.action" here as well...

	bAction: chrome.browserAction,  // manifest v2
	// bAction: chrome.action,  // manifest v3

_init: function() {
	// Overriding the parent class' _init(), but calling that original function first
	Classes.Base._init.apply(this, arguments);
},

// Returns a Promise wrapping the Chrome API call, and tracking chrome.runtime.lastError
// with a Promise.reject(). Include all arguments of the chrome function except the last
// callback argument.
//
// Use "debugCtx" to better visualize where the problem is happening, because this error
// path tends to have no stack at all.
//
// For the "rest parameter" (...args) see:
// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Functions/rest_parameters
_wrapInner: function(verbose, chromeFn, debugCtx, ...args) {
	return new Promise(
		function(resolve, reject) {
			chromeFn(...args,
				// No point in specifying the variable arguments, we'll just use "arguments" below
				function() {
					const logHead = "ChromeUtils::wrap().cb: " + (debugCtx != null ? debugCtx : "");
					if(chrome.runtime.lastError) {
						if(verbose) {
							this._err(logHead + "chrome.runtime.lastError = " + chrome.runtime.lastError.message);
						}
						reject(chrome.runtime.lastError);
					} else {
						resolve(...arguments);
					}
				}.bind(this)
			);
		}.bind(this)
	);
},

// Just a couple of simple wrappers for "_wrapInner". The point is that we want
// to write error handling code only when absolutely necessary, so by default
// we want to call wrap(), which will complain when there's an error. When instead
// we manage the errors with catch(), then there's no point in _wrapInner()
// whining about errors we're seeing in the caller, and that's what wrapQuiet()
// is for.
wrap: function(chromeFn, debugCtx, ...args) {
	return this._wrapInner(true, ...arguments);
},

wrapQuiet: function() {
	return this._wrapInner(false, ...arguments);
},

getExtensionId: function() {
	const logHead = "chromeUtils::getExtensionId(): ";

	// There must be a better way to do this...
	// chrome.runtime.getURL("") returns "chrome-extension://olalecillcaoojlgobjbjpkpkjokjlmf/",
	// and we need to extract the path
	let retVal = chrome.runtime.getURL("");
	this._log(logHead, retVal);

	// Remove the extra stuff
	// The next call leaves us with "olalecillcaoojlgobjbjpkpkjokjlmf/"
	retVal = retVal.replace("chrome-extension://", "");
	retVal = retVal.replace("/", "");
	return retVal;
},

//// Utils to work with tabs (chrome.tabs)

// _queryWithFilter() is a utility to add extra filtering capabilities to chrome.tabs.query()
// or chrome.windows.getAll(), since both can't filter in/out incognito tabs/windows.
// The filter applies only if the extra flag (queryInfo.incognito) is set, otherwise this
// function behaves like chrome.tabs.query() or chrome.windows.getAll().
//
// Note that this function must modify "queryInfo" (to remove "incognito"), because the Chrome
// function don't allow for intruders in their query data structures.
_queryWithFilter: async function(queryFn, callerLogHead, queryInfo) {
	// "queryInfo" is optional, so we need to use optional chaining to deal with it
	const incognitoFlag = queryInfo?.incognito;
	// We must delete the extra intruder flag "incognito", otherwise chrome.tabs.query() fails.
	// Optional chaining works for delete too.
	delete queryInfo?.incognito;

	let objs = await this.wrap(queryFn, callerLogHead, queryInfo);

	if(incognitoFlag !== undefined) {
		return objs.filter(obj => obj.incognito == incognitoFlag);
	}
	return objs;
},

// "queryInfo" is the same as defined in https://developer.chrome.com/docs/extensions/reference/tabs/#method-query,
// but we're overloading "queryInfo" to include "incognito", which is not supported by chrome.tabs.query().
// This wrapper is needed to:
// 1. Search only among incognito or non-incognito tabs (queryInfo.incognito).
//    Note that if you don't specify "incognito", this function returns both non-incognito and
//    incognito tabs, like chrome.tabs.query().
//    Note also that you can't use both "windowId" and "incognito", so if you use "windowId", then
//    "incognito" will automatically be removed.
// 2. About queryInfo.url, there's some special handling to be done to search with fragments ("#").
//
// NOTE: this function can modify "queryInfo", so don't use the same "queryInfo" twice, rebuild it
// at every call.
queryTabs: async function(queryInfo, callerLogHead) {
	const logHead = "ChromeUtils::queryTabs(): ";
	callerLogHead = optionalWithDefault(callerLogHead, logHead);

	if(queryInfo.windowId != null && queryInfo.incognito !== undefined) {
		// If the caller specified a "windowId", "incognito" doesn't make sense, because
		// we must pick that "windowId" regardless. "incognito" is actually in the way, because
		// if the window exists but it's not in the right incognito state, we might discard it
		// from the search results. Best to just drop "incognito" if "windowId" is defined.
		delete queryInfo.incognito;
	}

	if(queryInfo.url == null) {
		// No url, no special handling needed
		return await this._queryWithFilter(chrome.tabs.query, callerLogHead, queryInfo);
	}

	// https://developer.chrome.com/docs/extensions/reference/tabs/#method-query
	// As of 21.04.23, the documentation for the "url" field says "Fragment identifiers are not matched.",
	// but based on my testing, that seems to mean "if you pass in a URL with a fragment, we'll return
	// nothing" (I initially interpreted that text as "we'll ignore the fragment and match just the URL",
	// but that's not the case). So we need to proactively remove fragments.
	// Through testing, we also discovered that the field "url" in chrome.tabs.query() will match
	// both "url" and "pendingUrl", so we need to make sure to track both below.
	let fragmentOffset = queryInfo.url.indexOf("#");
	if(fragmentOffset == -1) {
		// No fragment in url, no special handling needed
		return await this._queryWithFilter(chrome.tabs.query, callerLogHead, queryInfo);
	}

	let origUrl = queryInfo.url;
	queryInfo.url = queryInfo.url.substring(0, fragmentOffset);

	let tabListNoFragment = await this._queryWithFilter(chrome.tabs.query, callerLogHead, queryInfo);
	this._log(logHead + "chrome.tabs.query() for " + queryInfo.url + " returned:", tabListNoFragment);

	// Now we have a list of tabs matching the URL without fragment, which subset matches the URL
	// with fragment? (includes the "tabListNoFragment.length == 0" case)
	let tabList = [];
	for(let i = 0; i < tabListNoFragment.length; i++) {
		let currTab = tabListNoFragment[i];
		if(currTab.url == origUrl || currTab.pendingUrl == origUrl) {
			tabList.push(currTab);
		}
	}

	return tabList;
},

// "incognito" is an optional argument, default "false". There's no use case to search for
// LTW across both incognito and non-incognito windows, because creating tabs or moving tabs
// must happen in only one of these two contexts (incognito or non-incognito).
// "preferredWinId" is an optional argument. It's possible multiple windows are all equally
// least tabbed windows (LTWs).
// There are two use cases for getLeastTabbedWindowId():
// - To create a new tab, any of those window at random will be ok (leave "preferredWinId"
//   undefined)
// - To move an existing tab. In this case, if the current window of the tab is a contender
//   for least tabbed, then it makes no sense to pick a different window and move the tab
//   there, we should instead let the tab stay where it is. That's what we call "preferredWinId"
//   * Note that if "preferredWinId" refers to a window of type "popup", this function ignores
//     "preferredWinId", as it only deals with windows of type "normal".
getLeastTabbedWindowId: function(incognito=false, preferredWinId) {
	const logHead = "ChromeUtils::getLeastTabbedWindowId(): ";
	let options = {
		populate: true,
		incognito,
		// We only care about "normal", "popup" windows don't have tabs
		windowTypes: [ "normal" ]
	};

	// Pick a big number as "invalid" marker, can a real window have these many tabs?
	let preferredWinTabsCount = 999999;

	function leastTabbedReducer(currentMinWin, winInfo) {
		let tabsCount = winInfo.tabs.length;

		// Too tired to mess with the original logic (before I added "preferredWinId").
		// Let's just have the reducer take its course, but note down the number of
		// tabs of the preferred window, and we can decide later to replace the winner
		// with the preferred window ID.
		// "preferredWinId" might be undefined, but if it is, it's definitely different
		// from winInfo.id, so we're covered in that case too.
		if(winInfo.id == preferredWinId) {
			preferredWinTabsCount = tabsCount;
		}
		 // currentMinWin == 0 means the accumulator is not initialized
		if(currentMinWin == 0 || currentMinWin.tabsCount > tabsCount) {
			return { winInfo: winInfo, tabsCount: tabsCount };
		}
		return currentMinWin;
	};

	return this._queryWithFilter(chrome.windows.getAll, logHead, options).then(
		function(winList) {
			if(winList.length == 0) {
				// Can this really happen??? If all open windows are of type "popup" maybe?
				return null;
			}
			let minWin = winList.reduce(leastTabbedReducer, 0);
			// "preferredWinTabsCount - 1", because if we move the tab there, we don't want
			// to turn preferredWinId to "leastTabbed". The goal of rebalancing is to keep
			// things balanced: if leastTabbed has 6 tabs and preferred has 7, there's no
			// value in swapping their roles...
			if(minWin.tabsCount < (preferredWinTabsCount - 1)) {
				this._log(logHead + "Found: ", minWin);
				return minWin.winInfo.id;
			}

			// minWin could be one less or same as preferredWinTabsCount, but not more
			this._assert(minWin.tabsCount <= preferredWinTabsCount, logHead + "unexpected");
			this._log(logHead + "Found multiple matches, returning preferredWinId", preferredWinId, minWin);
			return preferredWinId;
		}.bind(this)
	);
},

// "windowId" is optional, if specified, only search for empty tabs in that specific window.
// If "windowId" is specified, queryTabs() will ignore "incognito".
getEmptyTabsList: function(incognito=false, windowId) {
	const logHead = "ChromeUtils::getEmptyTabsList(): ";
	return this.queryTabs({ url: "chrome://newtab/", incognito, windowId }, logHead);
},

discardTab: async function(tab) {
	const logHead = "ChromeUtils::discardTab(" + tab.id + "): ";

	// Discarding (a.k.a. "suspending") a tab requires special handling if the tab is
	// currently active. Before you can discard, you must explicitly activate a different
	// tab in the window (if another tab exists in the window). The problem is that Chrome
	// has the bad habit of reloading a discarded (but active) tab when the user manually
	// switches to a different tab, so leaving the tab active defeats the original purpose.
	if(tab.active) {
		// Pick the tab before "tab", unless "tab" is the first tab, in which case we
		// pick the first tab after "tab".
		let activateIndex = tab.index - 1;
		if(tab.index == 0) {
			activateIndex = 1;
		}

		let neighborTabs = await this.queryTabs({ index: activateIndex, windowId: tab.windowId }, logHead);
		this._log(logHead + "tabs.query for index " + activateIndex + " returned: ", neighborTabs);

		// If neighborTabs.length == 0, that means the tab is alone in the window, so we
		// can't activate any other tab
		if(neighborTabs.length != 0) {
			await this.activateTab(neighborTabs[0]);
		}
	}

	this.wrap(chrome.tabs.discard, logHead, tab.id);
	this._log(logHead + "completed");
},

// Focus the current window of a tabId. Since tabs can be moved from window to window,
// it's useless to try to store the windowId of the tabId in TabsManager._backTabs.
// Best to just query Chrome, though that requires some async gymnastics.
// This also allows us to generalize this function for both background.js and popup.
focusWindowByTabId: function(tabId) {
	const logHead = "ChromeUtils::focusWindowByTabId(" + tabId + "): ";
	// https://developer.chrome.com/docs/extensions/reference/tabs/#method-get
	return this.wrap(chrome.tabs.get, logHead, tabId).then(
		function(tab) {
			this._log(logHead + tab.windowId, tab);
			return this.focusWindow(tab);
		}.bind(this)
	);
},

focusWindow: function(tab) {
	const logHead = "ChromeUtils::focusWindow():";
	// https://developer.chrome.com/docs/extensions/reference/windows/#method-update
	return this.wrap(chrome.windows.update, logHead, tab.windowId, { focused: true });
},

createWindow: function(createData) {
	const logHead = "ChromeUtils::createWindow():";
	return this.wrap(chrome.windows.create, logHead, createData);
},

activateTabByTabId: function(tabId) {
	// https://developer.chrome.com/docs/extensions/reference/tabs/#method-update
	let activatePromise = this.wrap(chrome.tabs.update, "ChromeUtils::activateTabByTabId(): ", tabId, { active: true });
	let focusPromise = this.focusWindowByTabId(tabId);
	return Promise.all([ activatePromise, focusPromise ]);
},

activateTab: function(tab) {
	const logHead = "ChromeUtils::activateTab(): ";

	// https://developer.chrome.com/docs/extensions/reference/tabs/#method-update
	let activatePromise = this.wrap(chrome.tabs.update, logHead, tab.id, { active: true });
	let focusPromise = this.wrap(chrome.windows.update, logHead, tab.windowId, { focused: true });
	return Promise.all([ activatePromise, focusPromise ]);
},

// Create a new tab in the "winId" window.
// "url" is optional, if not specified, Chrome will open a New Tab page
// "winId" is optional, if not specified defaults to chrome.windows.WINDOW_ID_CURRENT. 
_createTabInner: function(url, winId=chrome.windows.WINDOW_ID_CURRENT) {
	const logHead = "ChromeUtils::_createTabInner(" + url + "): ";

	let promiseA = this.wrap(chrome.tabs.create, logHead, { url: url, windowId: winId });
	// Assume the tab will be opened in a known window, and avoid the
	// extra cost of waiting for the first promise to return (as it would
	// include the tab, and therefore the tabId) before calling activateTab()
	let promiseB = this.wrap(chrome.windows.update, logHead, winId, { focused: true });

	return Promise.all([ promiseA, promiseB ]);
},

// "options" includes the following:
// - "url", if not specified, Chrome will open a New Tab page.
// - "incognito", default "false" (reuse or create by only considering non-incognito
//   tabs). One context (incognito or non-incognito) must be defined.
// - "winId", only use that window ID to create the new tab
// - "reuse", default "true", reuse existing empty tabs (either on all windows or on "winId")
createTab: async function(options) {
	let incognito = options?.incognito ?? false;
	let reuse = options?.reuse ?? true;
	let url = options?.url ?? null;
	let winId = options?.winId ?? null;

	let tabs = [];

	if(reuse) {
		// First, check if we have an empty tab and reuse that, then, if not
		// found, pick the least tabbed window and use that to create a new tab.
		let tabs = await this.getEmptyTabsList(incognito, winId);
	}

	if(tabs.length != 0) {
		// Reusing an empty tab, pick the first one in the list
		return this.loadUrl(url, { tabId: tabs[0].id });
	}

	if(winId == null) {
		// Need to find the least tabbed window
		winId = await this.getLeastTabbedWindowId(incognito);
	}

	// "winId" can be null because:
	// 1. You want to open an incognito tab and there are only non-incognito windows
	// 2. You want to open a non-incognito tab and there are only incognito windows
	// 3. There are only popup windows open, no "normal" window
	if(winId == null) {
		// It's ok to pass "url: null"
		return this.createWindow({ incognito, url, focused: true });
	}

	// If we get here, "winId" is not "null", so we don't need to worry about overriding
	// the default value for the _createTabInner() "winId" argument
	return this._createTabInner(url, winId);
},

// tabId is optional, if specified, load in the tab, otherwise create a new tab.
// Also takes the window with the new tab to the foreground.
//
// "options" includes:
// - "incognito", optional, ignored if "tabId" is defined
// - "tabId"
// - "winId" is optional, if not specified, the current window will be used. Note that
//   "winId" is relevant only if a new tab needs to be opened, an existing tab won't
//   be moved to a different window. Use chrome.windows.WINDOW_ID_NONE to open the
//   tab in a new window.
loadUrl: function(url, options) {
	const logHead = "ChromeUtils::loadUrl(" + url + "):";

	let incognito = options?.incognito ?? false;
	let tabId = options?.tabId ?? null;
	let winId = options?.winId ?? null;

	this._log(logHead, "entering", incognito, tabId, winId);
	// If you want to open in an existing tabId, you should not specify a winId, and viceversa
	this._assert(!(tabId != null && winId != null), logHead);

	if(winId == chrome.windows.WINDOW_ID_NONE) {
		// Open in a new window, only one command, return the single promise immediately.
		// If this function was called asking for a new window, the tabId should be "null"...
		this._assert(tabId == null);
		return this.createWindow({ focused: true, url: url, incognito });
	}

	if(tabId == null) {
		// Not a new window, but we need a new tab to be added to an existing window
		// or a new one
		return this.createTab({ incognito, url, winId });
	}

	// Existing tab (therefore, existing window)
	let promiseA = null;
	let promiseB = null;

	promiseA = this.activateTabByTabId(tabId);
	// Note that "url" could be undefined here (when we reuse an existing "new tab", recursive
	// call coming from createTab()), but that's ok
	promiseB = this.wrap(chrome.tabs.update, logHead, tabId, { url: url });

	return Promise.all([ promiseA, promiseB ]);
},

// "activate" is optional (default "false"), if "true", activate the tab in the new
// window and focus it, otherwise stay where you are.
// "oldWindowActiveTabId" is optional (default "null"). When specified, set that tabId
// as the new active tabId in the window "tab" is moving from. No action is taken if
// "tab" was not active in that old window.
// Returns a Promise that resolves to an array of values.
moveTab: function(tab, newWindowId, activate, oldWindowActiveTabId) {
	activate = optionalWithDefault(activate, false);
	const logHead = "chromeUtils::moveTab(activate: " + activate + "): ";

	if(oldWindowActiveTabId != null && tab.active) {
		// Take this action first, so the following actions don't look too clunky.
		//
		// No reason to include this promise in the return value.
		this.wrap(chrome.tabs.update, logHead, oldWindowActiveTabId, { active: true });
	}

	let moveProperties = {
		index: -1,
		windowId: newWindowId,
	};

	let movePromise = this.wrap(chrome.tabs.move, logHead, tab.id, moveProperties);
	let focusPromise = null;
	let activatePromise = null;
	if(activate) {
		// Can't call ChromeUtils.activateTab() because we need the focus to go to
		// a different window than the windowId currently stored in "tab"
		focusPromise = this.wrap(chrome.windows.update, logHead, newWindowId, { focused: true });
		activatePromise = this.wrap(chrome.tabs.update, logHead, tab.id, { active: true });
	} else {
		focusPromise = Promise.resolve();
		activatePromise = Promise.resolve();
	}
	return Promise.all([ movePromise, focusPromise, activatePromise ]);
},

// See moveTab() for the "activate" and "oldWindowActiveTabId" parameters.
// Returns a Promise that resolves to an array of values if we've taken an action,
// and "null" if we didn't need to take any action.
moveTabToLeastTabbedWindow: function(tab, activate, oldWindowActiveTabId) {
	activate = optionalWithDefault(activate, false);
	const logHead = "chromeUtils::moveTabToLeastTabbedWindow(activate: " + activate + "): ";

	return this.getLeastTabbedWindowId(tab.incognito, tab.windowId).then(
		function(winId) {
			if(tab.windowId == winId) {
				this._log(logHead + "tab " + tab.id + " is already in the least tabbed window " + winId);
				return null;
			}

			return this.moveTab(tab, winId, activate, oldWindowActiveTabId);
		}.bind(this)
	);
},

closeTab: function(tabId) {
	return this.wrap(chrome.tabs.remove, "ChromeUtils::closeTab(): ", tabId);
},

// In order for this function to work, manifest.json must have permission "*://*/*"
// (or whatever subset of URLs you want to allow injection into).
inject: function(tabId, jsFile) {
	const logHead = "ChomeUtils::inject(" + tabId + "): ";
	// See https://developer.chrome.com/docs/extensions/reference/extensionTypes/#type-InjectDetails
	// for all the options
	return this.wrapQuiet(chrome.tabs.executeScript, logHead, tabId, { file: jsFile }).catch(
		function(chromeLastError) {
			switch(chromeLastError.message) {
				case Classes.ChromeUtils.Error.INJECT_NOFRAME:
					//this._log(logHead + "tab not loaded");
					return Promise.resolve(null);
				case Classes.ChromeUtils.Error.INJECT_ERRORPAGE:
					this._log(logHead + "tab has an error (network down?)");
					return Promise.resolve(null);
				case Classes.ChromeUtils.Error.INJECT_EXTGALLERY:
					this._log(logHead + "can't inject in the extensions gallery");
					return Promise.resolve(null);
				default:
					this._err(logHead + "unknown error: " + chromeLastError.message);
					return Promise.reject(chromeLastError);
			}
		}.bind(this)
	);
},

//// Utils to work with bookmarks (chrome.bookmarks)

// This function is obsolete, use bookmarksManager.getBmPathListSync() or
// bookmarksManager.getBmPathListAsync() instead
//
// Easier to use async functions to manage a sequential loop of promises...
getBookmarkPathList: async function(bmNode) {
	const logHead = "ChomeUtils::getBookmarkPathList(" + bmNode.id + "): ";

	let pathList = [];

//	this._log(logHead + "entering");

	while(bmNode != null && bmNode.parentId != null) {
		//this._log(logHead + "current round: " + bmNode.title);
		let result = await this.wrap(chrome.bookmarks.get, logHead, bmNode.parentId);
		if(result.length > 0) {
			bmNode = result[0];
			// The root ID "0" should have an empty title, but you never know...
			pathList.push(bmNode.title != null ? bmNode.title : "");
			//this._log(logHead + "next round: ", bmNode);
		} else {
			// It should never get here, but just in case
			bmNode = null;
			this._err(logHead + "unexpected, it should not get here");
		}
	}

	pathList.reverse();
//	this._log(logHead + "full pathList = ", pathList);
	return pathList;
},

// This function does not return an accurate count, as it includes also folders, which
// are not really bookmarks. Let's keep it this way for now...
getBookmarksCount: function() {
	const logHead = "ChomeUtils::getBookmarksCount(" + bmNode.id + "): ";

	// This sounds crazy inefficient, no better way to just get a count of nodes?
	// Get the entire tree, then count? Hmmm...
	return this.wrap(chrome.bookmarks.getTree, logHead).then(
		function(nodesList) {
			return nodesList.length;
		}.bind(this)
	);
},

//// Utils to work with storage (chrome.storage)

// Note that debugging chrome.storage usage is a pain, because the storage doesn't
// show up in dev tools. The easiest way to look at the contents of the storage is
// to go to the background page console and type:
//
//    chrome.storage.local.get(function(result){console.log(result)})
//
// From https://stackoverflow.com/questions/11922964/how-do-i-view-the-storage-of-a-chrome-extension-ive-installed/27434046#:~:text=16-,Open%20the%20Chrome%20Devtool%20by%20clicking%20on%20the%20background%20page,local%20storage%20on%20the%20left.
//
// If you need to clear the storage, on the console run:
//
//    chrome.storage.local.clear()

storageGet: function(keys, storageObj) {
	storageObj = optionalWithDefault(storageObj, chrome.storage.local);
	const logHead = "ChromeUtils::storageGet(): ";

	// chrome.storage.local fails if called through chromeWrapper(), with reason
	// "TypeError: Illegal invocation: Function must be called on an object of type StorageArea".
	// The problem is that chromeWrapper() has no way to bind correctly the chrome call.
	// It's surprising this issue is happening only with the chrome.storage functions.
	// Doing the binding explicitly here seems to be the only solution, though clearly
	// not elegant at all.
	return this.wrap(storageObj.get.bind(storageObj), logHead, keys);
},

storageSet: function(items, storageObj) {
	storageObj = optionalWithDefault(storageObj, chrome.storage.local);
	const logHead = "ChromeUtils::storageSet(): ";

	// See ChromeUtils.storageGet() for the reasons for bind() here.
	return this.wrap(storageObj.set.bind(storageObj), logHead, items);
},

_areaNamesDict: {
	sync: chrome.storage.sync,
	local: chrome.storage.local,
	managed: chrome.storage.managed,
},

storageObjByAreaName: function(areaName) {
	const logHead = "ChromeUtils.storageObjByAreaName(" + areaName + "): ";
	let retVal = this._areaNamesDict[areaName];
	this._assert(retVal != null, logHead + "assertion failed");

	return retVal;
},

}); // Classes.ChromeUtils

Classes.Base.roDef(Classes.ChromeUtils, "Error", {});

Classes.Base.roDef(Classes.ChromeUtils.Error, "NMH_COMMUNICATION",
					"Error when communicating with the native messaging host.");
Classes.Base.roDef(Classes.ChromeUtils.Error, "NMH_EXITED", "Native host has exited.");
Classes.Base.roDef(Classes.ChromeUtils.Error, "NMH_NOTFOUND", "Specified native messaging host not found.");
// When calling chrome.tabs.executeScript() on a tab that's not loaded, you get
// Classes.ChromeUtils.Error.INJECT_NOFRAME. Note that this can be returned even
// if "tab.discarded == false" and "tab.status == 'complete'". Not sure what's
// going on, but clearly the page is reloading when clicking on the tile, so it
// must not be loaded
Classes.Base.roDef(Classes.ChromeUtils.Error, "INJECT_NOFRAME", "The frame was removed.");
// When calling chrome.tabs.executeScript() on a tab that's failed to load (e.g.
// no network), you get Classes.ChromeUtils.Error.INJECT_ERRORPAGE. Note that
// the "url" field in the tab does not show this URL, it shows the URL that should
// be loaded if there had not been an error.
Classes.Base.roDef(Classes.ChromeUtils.Error, "INJECT_ERRORPAGE", 
"Cannot access contents of url \"chrome-error://chromewebdata/\". Extension manifest must request permission to access this host.");
// Started getting the following error for the tab with URL
// https://chrome.google.com/webstore/search/tabmania?hl=en&_category=extensions
Classes.Base.roDef(Classes.ChromeUtils.Error, "INJECT_EXTGALLERY", "The extensions gallery cannot be scripted.");

// Create a global variable "chromeUtils", but force it readonly, so it doesn't get
// overwritten by mistake.
// The advantage of defining an instance of Classes.ChromeUtils instead of just using
// the methods as static in Classes.ChromeUtils is that we can use the logging capabilities
// of Classes.Base, instead of having an all or nothing with "console.log".
Classes.Base.roDef(window, "chromeUtils", Classes.ChromeUtils.create());
chromeUtils.debug();
