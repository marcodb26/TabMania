// CLASS ChromeUtils
Classes.ChromeUtils = Classes.Base.subclass({

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

//// Utils to work with tabs (chrome.tabs)

// Focus the current window of a tabId. Since tabs can be moved from window to window,
// it's useless to try to store the windowId of the tabId in TabsManager._backTabs.
// Best to just query Chrome, though that requires some async gymnastics.
// This also allows us to generalize this function for both background.js and popup.
focusWindow: function(tabId) {
	// https://developer.chrome.com/docs/extensions/reference/tabs/#method-get
	return this.wrap(chrome.tabs.get, "ChromeUtils::focusWindow(): ", tabId).then(
		function(tab) {
			const logHead = "ChromeUtils::focusWindow().then(): ";
			this._log(logHead + tab.windowId, tab);
			// https://developer.chrome.com/docs/extensions/reference/windows/#method-update
			this.wrap(chrome.windows.update, logHead, tab.windowId, { focused: true });
		}.bind(this)
	);
},

activateTab: function(tabId) {
	// https://developer.chrome.com/docs/extensions/reference/tabs/#method-update
	let promiseA = this.wrap(chrome.tabs.update, "ChromeUtils::activateTab(): ", tabId, { active: true });
	let promiseB = this.focusWindow(tabId);
	return Promise.all([ promiseA, promiseB ]);
},

// tabId is optional, if specified, load in the tab, otherwise create a new tab.
// Also takes the window with the new tab to the foreground.
// Use "tabId = -1" to open in a new window.
loadUrl: function(url, tabId) {
	const logHead = "ChromeUtils::loadUrl(): ";

	tabId = optionalWithDefault(tabId, null);

	let promiseA = null;
	let promiseB = null;

	if(tabId != null) {
		if(tabId != -1) {
			promiseA = chromeUtils.activateTab(tabId);
			promiseB = this.wrap(chrome.tabs.update, logHead, tabId, { url: url });
		} else {
			// Open in a new window, only one command, return the single promise immediately
			return this.wrap(chrome.windows.create, logHead, { focused: true, url: url });
		}
	} else {
		promiseA = this.wrap(chrome.tabs.create, logHead, { url: url });
		// Assume the tab will be opened in the current window, and avoid the
		// extra cost of waiting for the first promise to return (as it would
		// include the tab, and therefore the tabId) before calling activateTab()
		promiseB = this.wrap(chrome.windows.update, logHead, chrome.windows.WINDOW_ID_CURRENT, { focused: true });
	}
	return Promise.all([ promiseA, promiseB ]);
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
				default:
					this._err(logHead + "unknown error: " + chromeLastError.message);
					return Promise.reject(chromeLastError);
			}
		}.bind(this)
	);
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


// Create a global variable "chromeUtils", but force it readonly, so it doesn't get
// overwritten by mistake.
// The advantage of defining an instance of Classes.ChromeUtils instead of just using
// the methods as static in Classes.ChromeUtils is that we can use the logging capabilities
// of Classes.Base, instead of having an all or nothing with "console.log".
Classes.Base.roDef(window, "chromeUtils", Classes.ChromeUtils.create());
chromeUtils.debug();