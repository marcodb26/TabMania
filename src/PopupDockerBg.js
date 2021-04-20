// This is the popupDockerBg for background (to initialize based on stored state)

// CLASS PopupDockerBg
//
// This class generates events Classes.EventManager.Events.UPDATED, with "detail" set
// to { target: <this object>, cmd: "", data: "" }. These events are intended for the
// TabMania popup, and serve as notifications to the popup
Classes.PopupDockerBg = Classes.PopupDockerBase.subclass({
	_eventManager: null,

_init: function() {
	// Overriding the parent class' _init(), but calling that original function first
	Classes.PopupDockerBase._init.call(this);
	this.debug();

	// We append a few DOM elements to the _generated_background_page.html,
	// one here (by using the "domId" argument of EventManager.create()),
	// one in the PopupDockerBg class. The assumption is that each one of
	// these classes is intended to have a single instance running.
	this._eventManager = Classes.EventManager.create("popupDockerBg");
	this._eventManager.attachRegistrationFunctions(this);

	chromeUtils.bAction.onClicked.addListener(this._onClickedCb.bind(this));

	// Initialize state for the chromeUtils.bAction APIs
	this._setDocked(localStore.isPopupDocked());
},

runPopupSearch: function(searchQuery) {
	this.sendEvent(Classes.PopupDockerBase.cmd.SEARCH, searchQuery);
},

sendEvent: function(cmd, data) {
	let extraData = { cmd: cmd, data: data };

	this._eventManager.notifyListeners(Classes.EventManager.Events.UPDATED, extraData);
},

_onClickedCb: function() {
	// Per https://developer.chrome.com/docs/extensions/reference/browserAction/#event-onClicked
	// this callback will be called only if you used chromeUtils.bAction.setPopup({ popup: "" }),
	// which is true only for undocked popups
	this._openUndocked();
},

}); // Classes.PopupDockerBg
