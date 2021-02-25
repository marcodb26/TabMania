// This is the popupDockerBg for background (to initialize based on stored state)

// CLASS PopupDockerBg
//
Classes.PopupDockerBg = Classes.PopupDockerBase.subclass({

_init: function() {
	// Overriding the parent class' _init(), but calling that original function first
	Classes.PopupDockerBase._init.call(this);

	this.debug();

	chrome.browserAction.onClicked.addListener(this._onClickedCb.bind(this));

	// Initialize state for the chrome.browserAction APIs
	this._setDocked(localStore.isPopupDocked());
},

_onClickedCb: function() {
	// Per https://developer.chrome.com/docs/extensions/reference/browserAction/#event-onClicked
	// this callback will be called only if you used chrome.browserAction.setPopup({ popup: "" }),
	// which is true only for undocked popups
	this._openUndocked();
},

}); // Classes.PopupDockerBg
