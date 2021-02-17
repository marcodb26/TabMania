function multiLog(msg) {
	if(isProd()) {
		return;
	}

	console.log("popup.js - " + msg);
	// In some cases it's convenient to show log messages all in the same place,
	// and the background page is a good place for that
	chrome.extension.getBackgroundPage().console.log("popup.js - " + msg);
}

window.addEventListener("error",
	function(e) {
		console.error("Unhandled exception: " + e.error.message, e);
		return false;
	}
);


// CLASS TabUpdatesTracker
//
// This class allows listeners to register for callback when a tab gets activated, updated or closed.
// This class merges chrome.tabs.onUpdated/onActivated/onRemoved.addListener().
Classes.TabUpdatesTracker = Classes.Base.subclass({
	// These are dictionaries of { handle: { tabList/propList: <>, fn: <> } }
	_propListFns: null,
	_tabListFns: null,

	_lastHandle: null,

_init: function() {
	// Overriding the parent class' _init(), but calling that original function first
	Classes.Base._init.call(this);

	this._tabListFns = [];
	this._propListFns = [];

	// The way _newHandle() behaves, "0" will not be assigned to any registration
	this._lastHandle = 0;

	// https://developer.chrome.com/docs/extensions/reference/tabs/#event-onCreated
	// We're not listening to the chrome.tabs.onCreated event because listeners are
	// registered only for a specific set of tab IDs, and a new tab can't have a
	// tab ID in that list. If a client of this class wants to find out about new
	// tabs (possibly to update their tabs list here), they should just register for
	// the chrome.tabs.onCreated event directly. Proxying it through this class
	// doesn't add any value.
//	chrome.tabs.onCreated.addListener(this._onTabCreatedCb.bind(this));
	// https://developer.chrome.com/docs/extensions/reference/tabs/#event-onUpdated
	// Note that chrome.tabs.onUpdated does NOT include updated to the "highlighted" property
	// of a tab. For that you need to listen to chrome.tabs.onActivated
	chrome.tabs.onUpdated.addListener(this._onTabUpdatedCb.bind(this));
	// https://developer.chrome.com/docs/extensions/reference/tabs/#event-onActivated
	chrome.tabs.onActivated.addListener(this._onTabActivatedCb.bind(this));
	// Unfortunately closing a tab doesn't get considered an update to the tab, so we must
	// register for this other event too...
	// https://developer.chrome.com/docs/extensions/reference/tabs/#event-onRemoved
	chrome.tabs.onRemoved.addListener(this._onTabRemovedCb.bind(this));
	// https://developer.chrome.com/docs/extensions/reference/tabs/#event-onAttached
	chrome.tabs.onAttached.addListener(this._onTabAttachedCb.bind(this));
	// https://developer.chrome.com/docs/extensions/reference/tabs/#event-onMoved
	chrome.tabs.onMoved.addListener(this._onTabMovedCb.bind(this));
},

_onTabUpdatedCb: function(tabId, changeInfo, tab) {
	const logHead = "TabUpdatesTracker::_onTabUpdatedCb(tabId " + tabId + ", time: " + Date.now() + "): ";
	this._log(logHead + "changeInfo: ", changeInfo);
	if(tab.pendingUrl != null && tab.url != tab.pendingUrl) {
		this._log(logHead + "URL changing from " + tab.url + " to " + tab.pendingUrl);
	}

	this._iterateRegisteredCb(Classes.TabUpdatesTracker.CbType.UPDATED, ...arguments);
},

// Note that the signature of this callback is different from the signature of
// _onTabUpdatedCb() and _onTabRemovedCb(), as it's missing the initial "tabId".
_onTabActivatedCb: function(activeInfo) {
	// We want to reintroduce the initial "tabId" to make the callbacks of this class
	// more uniform
	const tabId = activeInfo.tabId;
	const logHead = "TabUpdatesTracker::_onTabActivatedCb(tabId " + tabId + ", time: " + Date.now() + "): ";
	this._log(logHead + "activeInfo: ", activeInfo);

	// When a tab1 becomes active, a tab2 becomes inactive. Unfortunately Chrome only generates
	// an "onActivated" (and probably "onHighlighted") for tab1, but no "onUpdated" for tab2 (because
	// "onUpdated" doesn't include either "active" or "highlighted".
	// For this reason, short of figuring out which tab2 got updated, we let the listeners listen
	// by property for the "active" property, which is a "fake" property, as it never appears in
	// any of the events. We're injecting it here so the logic below can capture it.
	this._iterateRegisteredCb(Classes.TabUpdatesTracker.CbType.ACTIVATED, tabId, { ...activeInfo, active: true });
},

_onTabRemovedCb: function(tabId, removeInfo) {
	const logHead = "TabUpdatesTracker::_onTabRemovedCb(tabId " + tabId + ", time: " + Date.now() + "): ";
	this._log(logHead + "removeInfo: ", removeInfo);

	this._iterateRegisteredCb(Classes.TabUpdatesTracker.CbType.REMOVED, ...arguments);
},

// Tab attached to a new window
_onTabAttachedCb: function(tabId, attachInfo) {
	const logHead = "TabUpdatesTracker::onTabAttachedCb(tabId " + tabId + ", time: " + Date.now() + "): ";
	this._log(logHead + "attachInfo: ", attachInfo);

	this._iterateRegisteredCb(Classes.TabUpdatesTracker.CbType.ATTACHED, ...arguments);
},

// Tab moved within the same window
_onTabMovedCb: function(tabId, moveInfo) {
	const logHead = "TabUpdatesTracker::onTabMovedCb(tabId " + tabId + ", time: " + Date.now() + "): ";
	this._log(logHead + "moveInfo: ", moveInfo);

	this._iterateRegisteredCb(Classes.TabUpdatesTracker.CbType.MOVED, ...arguments);
},

_iterateRegisteredCb: function(cbType, tabId, activeChangeRemoveInfo, tab) {
	const logHead = "TabUpdatesTracker::_iterateRegisteredCb(tabId " + tabId + "): ";
	var inputArgs = arguments;

	this._tabListFns.forEach(
		function(elem) {
			if(!elem.tabList.includes(tabId)) {
				this._log(logHead + "not calling callback for tabList = ", elem.tabList);
				return;
			}
			this._log(logHead + "calling callback for tabList = ", elem.tabList);
			elem.fn(...inputArgs);
		}.bind(this)
	);

	this._propListFns.forEach(
		function(elem) {
			let idx = elem.propList.findIndex(
				function(prop) {
					if(prop in activeChangeRemoveInfo) {
						return true;
					}
					return false;
				}
			);
			
			if(idx != -1) {
				this._log(logHead + "calling callback for propList = ", elem.propList);
				elem.fn(...inputArgs);
			} else {
				this._log(logHead + "not calling callback for propList = ", elem.propList);
			}
		}.bind(this)
	);
},

_newHandle: function() {
	return ++(this._lastHandle);
},

_cbWrapper: function(fn) {
	return safeFnWrapper(fn, null,
		function(e) {
			this._err("TabUpdatesTracker: callback error: ", e);
		}.bind(this)
	);
},

// Returns a handle to be used later for changes or unregister.
// "fn" should expect the same arguments of the chrome.tabs.onUpdated.addListener()
// and the chrome.tabs.onRemoved.addListener() callbacks (this class merges them),
// that is fn(tabId, activeInfo/changeInfo/removeInfo, tab).
// You can tell apart onUpdated from onActivated/onRemoved, because only onUpdates has
// "tab != undefined", so if "tab != undefined", then "activeInfo/changeInfo/removeInfo"
// is "changeInfo". To tell onActivated from onRemoved, check the "isWindowClosing"
// property in activeInfo/removeInfo, which is present only in removeInfo (or check
// for "tabId", which is present only in activeInfo, because onRemove passes the tabId
// as a separate argument).
// If this becomes too complicated, we might need to add an actual "type" property
// in the callback signature, but for now we don't need it.
_registerBy: function(regDict, propName, list, fn) {
	const logHead = "TabUpdatesTracker::_registerBy(" + propName + "): ";
	this._log(logHead + "entering", list);

	var retVal = this._newHandle();
	regDict[retVal] = {};
	regDict[retVal][propName] = list;
	regDict[retVal].fn = this._cbWrapper(fn);
	this._log(logHead + "updated dict", regDict);
	return retVal;
},

_updateRegisterBy: function(regDict, propName, handle, list, fn) {
	const logHead = "TabUpdatesTracker::_updateRegisterBy(" + handle + ", " + propName + "): ";
	this._log(logHead + "entering", list);

	if(!(handle in regDict)) {
		this._err(logHead + "invalid handle " + handle);
		return;
	}

	if(list != null) {
		regDict[handle][propName] = list;
	}
	if(fn != null) {
		regDict[handle].fn = this._cbWrapper(fn);
	}

	this._log(logHead + "updated dict", regDict);
},

_unregisterBy: function(regDict, handle) {
	const logHead = "TabUpdatesTracker::_unregisterBy(" + handle + "): ";
	if(!(handle in regDict)) {
		this._err(logHead + "invalid handle " + handle);
		return;
	}
	this._log(logHead + "entering", regDict);

	delete regDict[handle];
},

// Note that "propList" can include properties that exist on "changeInfo", "activeInfo" or
// "removeInfo", and the callback will be called appropriately.
// "fn" has signature fn(tabId, activeChangeRemoveInfo, tab), with "tab" non-undefined only
// when "fn" is called as a result of a chrome.tabs.onUpdated event.
// For more details, see _registerBy()
registerByPropList: function(propList, fn) {
	return this._registerBy(this._propListFns, "propList", ...arguments);
},

updateRegisterByPropList: function(handle, propList, fn) {
//	const logHead = "TabUpdatesTracker::updateRegisterByPropList(" + handle + "): ";
//	this._err(logHead + "entering");
	return this._updateRegisterBy(this._propListFns, "propList", ...arguments);
},

unregisterByPropList: function(handle) {
	return this._unregisterBy(this._propListFns, ...arguments);
},

registerByTabList: function(tabList, fn) {
	return this._registerBy(this._tabListFns, "tabList", ...arguments);
},

updateRegisterByTabList: function(handle, tabList, fn) {
//	const logHead = "TabUpdatesTracker::updateRegisterByTabList(" + handle + "): ";
//	this._err(logHead + "entering");
	return this._updateRegisterBy(this._tabListFns, "tabList", ...arguments);
},

unregisterByTabList: function(handle) {
	return this._unregisterBy(this._tabListFns, ...arguments);
},

}); // Classes.TabUpdatesTracker

Classes.Base.roDef(Classes.TabUpdatesTracker, "CbType", {});
Classes.Base.roDef(Classes.TabUpdatesTracker.CbType, "ACTIVATED", "activated");
Classes.Base.roDef(Classes.TabUpdatesTracker.CbType, "UPDATED", "updated");
Classes.Base.roDef(Classes.TabUpdatesTracker.CbType, "REMOVED", "removed");
Classes.Base.roDef(Classes.TabUpdatesTracker.CbType, "ATTACHED", "attached");
Classes.Base.roDef(Classes.TabUpdatesTracker.CbType, "MOVED", "moved");

// Do all the DOM event listeners initialization inside the "load" event handler
window.addEventListener("load", init);

var popupMsgServer = null;
var tabUpdatesTracker = null;

function testSettings() {
	settingsStore.setOptionSearchUrl("https://duckduckgo.com/?q=%s");
	settingsStore.setOptionShowTabId(true);
	settingsStore.setOptionAdvancedMenu(true);
	settingsStore.pinGroup("Work");
	settingsStore.getShortcutsManager().setShortcut(window.ExtCommands.SHORTCUT01,
		{
			hostname: "mail.google.com",
		}
	);
	settingsStore.getShortcutsManager().setShortcut(window.ExtCommands.SHORTCUT02,
		{
			url: "https://lapl.overdrive.com/search?query=%s",
			useClipboard: true,
		}
	);

	settingsStore.setCustomGroup("Microsoft", {
		favIconUrl: "https://azurecomcdn.azureedge.net/cvt-5a6d098bd41d86e10abc9c93a784dea7f4f9eccc980ab08c0ffe9f3c2412a6e8/images/icon/favicon.ico",
		color: "red",
//		regexList: ".*\\.microsoft\\.com"
		matchList: ".microsoft.com"
	});
	settingsStore.setCustomGroup("Work", {
		favIconUrl: "https://community.atlassian.com/html/assets/favicon-16x16.png",
		color: "blue",
//		regexList: "jira\\.rvbdtechlabs\\.net\nwiki\\.rvbdtechlabs\\.net\nrvbdtech\\.sharepoint\\.com"
		matchList: "jira.rvbdtechlabs.net\n  wiki.rvbdtechlabs.net    \n rvbdtech.sharepoint.com"
	});
	settingsStore.setCustomGroup("Companies", {
		color: "green",
//		regexList: "crunchbase\\.com\nowler\\.com"
		matchList: "crunchbase.com\nowler.com"
	});
}

function init() {
	//multiLog("Popup loaded");

	perfProf.mark("windowLoaded");

	// Waiting for the async initialization of the settingsStore before starting
	// the popup
	Promise.all([ settingsStore.getInitPromise(), localStore.getInitPromise() ]).then(
		function() {
			if(!isProd()) {
				testSettings();
			}

			popupMsgServer = Classes.PopupMsgServer.create();
		//	popupMsgServer.debug();
			popupMsgServer.start();

			tabUpdatesTracker = Classes.TabUpdatesTracker.create();
			tabUpdatesTracker.debug();

			let rootElem = document.getElementById("popup-tabs-div");

			perfProf.mark("popupViewerStart");
			let popupViewer = Classes.PopupViewer.createAs("popup-tabs", rootElem);

			perfProf.measure("Loading window", undefined, "windowLoaded");
			perfProf.measure("Loading settings", "settingsStarted", "settingsLoaded");
			perfProf.measure("Loading localStore", "localStoreStarted", "localStoreLoaded");
			perfProf.measure("Creating popupViewer", "popupViewerStart", "popupViewerEnd");
			perfProf.measure("Attaching popupViewer", "popupViewerEnd", "attachEnd");

			//perfProf.log();
		}
	);	
}




