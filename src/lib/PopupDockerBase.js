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

// This function is public interface because it's also used to filter out TabMania
// popups from history and recently closed tabs.
// "undocked" is optional, default "false"
getPopupUrl: function(undocked) {
	undocked = optionalWithDefault(undocked, false);

	let urlSearch = "";
	if(undocked) {
		urlSearch = "?undocked";
	}
		
	return chrome.runtime.getURL(isProd() ? ("popup.html" + urlSearch) : ("popup/popup.html" + urlSearch));
},

_launchUndocked: function() {
	const logHead = "PopupDockerBase::_launchUndocked(): ";

	let storedSize = optionalWithDefault(localStore.getPopupSize(), {});

	let createData = {
		url: this.getPopupUrl(true),
		focused: true,
		type: "popup",
		left: optionalWithDefault(storedSize.posX, 0),
		top: optionalWithDefault(storedSize.posY, 0),
		width: optionalWithDefault(storedSize.width , this._undockedInitWidth),
		height: optionalWithDefault(storedSize.height, this._undockedInitHeight),
	};

	chromeUtils.wrap(chrome.windows.create, logHead, createData).then(
		function() {
			this._log(logHead + "launched", createData);
		}.bind(this)
	);
},

_openUndocked: function() {
	const logHead = "PopupDockerBase::_openUndocked(): ";
	this._log(logHead + "entering");

	chromeUtils.queryTabs({ url: this.getPopupUrl(true) }, logHead).then(
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

			chromeUtils.activateTab(tabs[0]).then(
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
		popupUrl = this.getPopupUrl();
	}

	chromeUtils.wrap(chromeUtils.bAction.setPopup, logHead, { popup: popupUrl }).then(
		function() {
			this._log(logHead + "chromeUtils.bAction.setPopup() succeeded");
		}.bind(this)
	);
},

// This function is only for console debugging, not to be called from the rest of the code
showState: function() {
	const logHead = "PopupDockerBase::showState(): ";

	chromeUtils.wrap(chromeUtils.bAction.getPopup, logHead, {} ).then(
		function(result) {
			this._log(logHead + "chromeUtils.bAction.getPopup() returned \"" + result +
					"\" (empty means \"undocked\")");
		}.bind(this)
	);
},

}); // Classes.PopupDockerBase

Classes.Base.roDef(Classes.PopupDockerBase, "cmd", {} );
Classes.Base.roDef(Classes.PopupDockerBase.cmd, "SEARCH", "search" );
