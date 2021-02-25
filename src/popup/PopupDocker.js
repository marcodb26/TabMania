// CLASS PopupDocker
//
Classes.PopupDocker = Classes.PopupDockerBase.subclass({


_init: function() {
	// Overriding the parent class' _init(), but calling that original function first
	Classes.PopupDockerBase._init.call(this);

	this.debug();

	localStore.addEventListener(Classes.EventManager.Events.UPDATED, this._updatedCb.bind(this));
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

}); // Classes.PopupDocker

Classes.Base.roDef(window, "popupDocker", Classes.PopupDocker.create());

