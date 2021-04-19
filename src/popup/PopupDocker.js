// CLASS PopupDocker
//
Classes.PopupDocker = Classes.PopupDockerBase.subclass({

	_dockedInitBodyWidth: 400, // in px
	_dockedInitBodyHeight: 542, // in px

	_ownTabId: null,
	_ownWindowId: null,

	_savePopupSizeJob: null,
	_savePopupSizeDelay: 1000,

_init: function() {
	const logHead = "PopupDocker::_init(): ";

	// Overriding the parent class' _init(), but calling that original function first
	Classes.PopupDockerBase._init.call(this);

	this.debug();

	this._savePopupSizeJob = Classes.ScheduledJob.createAs(this._id + ".savePopupSize", this._savePopupSize.bind(this));
	this._savePopupSizeJob.debug();

	window.addEventListener("load", this._loadCb.bind(this));
	localStore.addEventListener(Classes.EventManager.Events.UPDATED, this._updatedCb.bind(this));

	this._addBackgroundCommandsListener();

	if(!this.isPopupDocked()) {
		chromeUtils.wrap(chrome.tabs.query, logHead, { currentWindow: true }).then(
			function(tabs) {
				this._assert(tabs.length == 1);
				this._log(logHead + "chrome.tabs.query() returned:", tabs);
				this._ownTabId = tabs[0].id;
				this._ownWindowId = tabs[0].windowId;
				// https://developer.chrome.com/docs/extensions/reference/tabs/#event-onCreated
				chrome.tabs.onCreated.addListener(this._popupDefenderCb.bind(this));

				window.addEventListener("resize", this._onResizeCb.bind(this));
				// Since there's a "resize" event, but no "move" event for when the window
				// moves, we use the unload event to capture the popup position right before
				// the popup got closed.
				window.addEventListener("unload", this._onUnloadCb.bind(this));
			}.bind(this)
		);
	}
},

_addBackgroundCommandsListener: function() {
	const logHead = "PopupDocker::_addBackgroundCommandListener(): ";

	let backgroundPage = chrome.extension.getBackgroundPage();
	if(backgroundPage == null) {
		this._err(logHead + "unable to load DOM from background page");
		return;
	}

	let popupDockerBgElem = backgroundPage.document.getElementById("popupDockerBg")
	if(popupDockerBgElem == null) {
		this._err(logHead + "unable to get element with ID \"popupDockerBg\"");
		return;
	}

	popupDockerBgElem.addEventListener(Classes.EventManager.Events.UPDATED, this._backgroundCommandCb.bind(this));
},

_loadCb: function(ev) {
	// For the undocked popup, we can control the initial outer window sizing in
	// the chrome.windows.create() API.
	// For the docked popup, short of having a different popup.html for the two cases,
	// we can only change the body properties after <body> has been injected in the DOM.
	if(this.isPopupDocked()) {
		document.body.style.width = this._dockedInitBodyWidth + "px";
		document.body.style.height = this._dockedInitBodyHeight + "px";
	}
},

_updatedCb: function(ev) {
	const logHead = "PopupDocker::_updatedCb(" + ev.detail.key + "): ";

	// Anything could have changed in localStore, but we only care about changes to the
	// localStore.isPopupDocked() state, let's poll it
	if(localStore.isPopupDocked() && !this.isPopupDocked()) {
		this._log(logHead + "the popup is now configured docked, need to close myself");
		// Send also to background, since we're about to close this popup
		this._log.bg(logHead + "the popup is now configured docked, need to close myself");
		window.close();
		return;
	}

	if(!localStore.isPopupDocked() && this.isPopupDocked()) {
		this._log(logHead + "the popup is now configured undocked, need to close myself");
		// Send also to background, since we're about to close this popup
		this._log.bg(logHead + "the popup is now configured undocked, need to close myself");
		window.close();
		return;
	}

	this._log(logHead + "docking state unchanged");
},

_backgroundCommandCb: function(ev) {
	const logHead = "PopupDocker::_backgroundCommandCb(" + ev.detail.cmd + "): ";
	if(ev.detail.cmd != Classes.PopupDockerBase.cmd.SEARCH) {
		this._log(logHead + "ignoring command");
		return;
	}

	this._log(logHead + "starting search", ev.detail);

	this.focus();
	let allTabsBsTabViewer = popupViewer.getHomeBsTab();
	allTabsBsTabViewer.activate();
	allTabsBsTabViewer.setSearchQuery(ev.detail.data);
},

// This function monitors if any other tab attempts to open in our window, and if that
// happens, evicts the ne tab and relocates it to a different (least tabbed) window.
// See TabsBsTabViewer._recentlyClosedNormalize() for why we need this.
_popupDefenderCb: function(tab) {
	const logHead = "PopupDocker::_popupDefenderCb(): ";
	if(tab.windowId != this._ownWindowId) {
		return;
	}

	this._err(logHead + "need to relocate invader", tab);
	chromeUtils.moveTabToLeastTabbedWindow(tab);
},

_onResizeCb: function(ev) {
	// Using _savePopupSizeJob to rate-limit the resize event, otherwise we'll get
	// too much data to the Chrome storage pipe...
	this._savePopupSizeJob.run(this._savePopupSizeDelay);
},

_onUnloadCb: function(ev) {
	// Since there's a "resize" event, but no "move" event for when the window
	// moves, we use the unload event to capture the popup position right before
	// the popup got closed.
	// Don't use the delayed _savePopupSizeJob, we need to take the action immediately.
	this._savePopupSize();
},

_savePopupSize: function() {
	const logHead = "PopupDocker::_savePopupSize(): ";
	this._log(logHead + "saving window size: ",
				window.screenLeft, window.screenTop, window.outerWidth, window.outerHeight);
	localStore.setPopupSize(window.screenLeft, window.screenTop, window.outerWidth, window.outerHeight);
},

isPopupDocked: function() {
	if(window.location.search == "") {
		// The undocked popup URL has a search "?undocked", while the docked popup has no search
		return true;
	}
	return false;
},

undock: function() {
	const logHead = "PopupDocker::undock(): ";
	if(!this.isPopupDocked()) {
		// Nothing to do, already undocked
		this._log(logHead + "already undocked");
		this._log.bg(logHead + "already undocked");
		return;
	}

	this._setDocked(false);

	// We could directly call _launchUndocked() here, but in case there's some leftover
	// undocked popup, let's reuse it
	this._openUndocked();
	// Close the current popup, since we'll now open the undocked popup
	window.close();
},

dock: function() {
	const logHead = "PopupDocker::dock(): ";
	if(this.isPopupDocked()) {
		// Nothing to do, already docked
		this._log(logHead + "already docked");
		this._log.bg(logHead + "already docked");
		return;
	}

	this._setDocked(true);

	// We can't try to open a docked window automatically, there are too many windows...

	// Close the current popup, since we'll now open the undocked popup
	window.close();
},

dockToggle: function() {
	if(this.isPopupDocked()) {
		this.undock();
		return;
	}

	this.dock();
},

getOwnTabId: function() {
	if(this.isPopupDocked()) {
		// We don't care about tab ID when we're docked, not even sure we have one...
		return -1;
	}

	if(this._ownTabId == null) {
		const logHead = "PopupDocker::getOwnTabId(): "
		this._err(logHead + "still waiting for initialization");
		return -2;
	}

	return this._ownTabId;
},

// Bring to foreground the window of the undocked popup
focus: function() {
	// This function is only applicable to the undocked popup, and getOwnTabId() takes
	// care of checking for that
	let tabId = this.getOwnTabId();
	if(tabId >= 0) {		
		chromeUtils.focusWindow(tabId);
	}
},

}); // Classes.PopupDocker

Classes.Base.roDef(window, "popupDocker", Classes.PopupDocker.createAs("popupDocker"));


