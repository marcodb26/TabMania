// This is the common code that's needed both in the background page and in the popup.
// The popup extends this basic class with more functionality at Classes.PopupDocker

// CLASS PopupDockerBase
//
Classes.PopupDockerBase = Classes.Base.subclass({
	// The initial "innerWidth" has to be at least 400px to avoid horizontal scroll bars,
	// but chrome.windows.create() can only initialize the "outerWidth", so let's add 20px
	// to account for the likely vertical scroll bar.
	_undockedInitWidth: 420, // in px
	_undockedInitHeight: 800, // in px

_init: function() {
	// Overriding the parent class' _init(), but calling that original function first
	Classes.Base._init.call(this);

	this.debug();
},

// "undocked" is optional, default "false"
_getPopupUrl: function(undocked) {
	undocked = optionalWithDefault(undocked, false);

	let urlSearch = "";
	if(undocked) {
		urlSearch = "?undocked";
	}
		
	return chrome.runtime.getURL(isProd() ? ("popup.html" + urlSearch) : ("popup/popup.html" + urlSearch));
},

_launchUndocked: function() {
	const logHead = "PopupDockerBase::_launchUndocked(): ";

	let createData = {
		url: this._getPopupUrl(true),
		focused: true,
		type: "popup",
		width: this._undockedInitWidth,
		height: this._undockedInitHeight
	};

	chromeUtils.wrap(chrome.windows.create, logHead, createData).then(
		function() {
			this._log(logHead + "launched");
		}.bind(this)
	);
},

_openUndocked: function() {
	const logHead = "PopupDockerBase::_openUndocked(): ";
	this._log(logHead + "entering");

	chromeUtils.wrap(chrome.tabs.query, logHead, { url: this._getPopupUrl(true) }).then(
		function(tabs) {
			if(tabs.length == 0) {
				this._log(logHead + "undocked tab not found, launching it");
				this._launchUndocked();
				return;
			}

			if(tabs.length > 1) {
				this._log(logHead + "unexpected, multiple undocked popups found");
				// This is just a warning message, but then we'll pick the first one in the list
			}

			chromeUtils.activateTab(tabs[0].id).then(
				function() {
					const extTabId = Classes.NormalizedTabs.formatExtendedId(tabs[0]);
					this._log(logHead + "activated tab " + extTabId);
				}.bind(this)
			);
		}.bind(this)
	);
},

// "docked" defaults to "true"
_setDocked: function(docked) {
	docked = optionalWithDefault(docked, true);
	const logHead = "PopupDockerBase::_setDocked(" + docked + "): ";

	localStore.setPopupDocked(docked);

	let popupUrl = "";
	if(docked) {
		popupUrl = this._getPopupUrl();
	}

	chromeUtils.wrap(chrome.browserAction.setPopup, logHead, { popup: popupUrl }).then(
		function() {
			this._log(logHead + "chrome.browserAction.setPopup() succeeded");
		}.bind(this)
	);
},

// This function is only for console debugging, not to be called from the rest of the code
showState: function() {
	const logHead = "PopupDockerBase::showState(): ";

	chromeUtils.wrap(chrome.browserAction.getPopup, logHead, {} ).then(
		function(result) {
			this._log(logHead + "chrome.browserAction.getPopup() returned \"" + result +
					"\" (empty means \"undocked\")");
		}.bind(this)
	);
},

}); // Classes.PopupDockerBase
