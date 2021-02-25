// CLASS PopupDocker
//
Classes.PopupDocker = Classes.PopupDockerBase.subclass({


_init: function() {
	// Overriding the parent class' _init(), but calling that original function first
	Classes.PopupDockerBase._init.call(this);

	this.debug();

// There's really no reason to force the window to stay slim and allow it to grow
// only vertically. "Settings" are not going to look great, but so be it...

//	this._setWindowSize();
//	window.addEventListener("resize", this._setWindowSize.bind(this));

// Dumb, this is also not needed, you can set these when calling chrome.windows.create()
//	this._initWindowSize();
},

isPopupDocked: function() {
	if(window.location.search == "") {
		// The undocked popup URL has a search "?undocked", while the docked popup has no search
		return true;
	}
	return false;
},

_initWindowSize() {
	const logHead = "PopupDocker::_setWindowSize(): ";
	if(this.isPopupDocked()) {
		// We need to take this action only for the undocked popup.
		return;
	}

	window.resizeTo(this._undockedInitWidth, this._undockedInitHeight);
},

// We must wait for the "load" event for this function to be safe (but we've decided we're
// not going to use this function anymore, so we're ok without the "load" listener).
//
// "ev": let the "resize" listener leave alone height changes. Height must be
// forced only for the first call initializing the popup. In that case, the
// caller doesn't pass an "ev".
_setWindowSize: function(ev) {
	const logHead = "PopupDocker::_setWindowSize(): ";

	let forceHeight = ev == null ? true : false;

	if(this.isPopupDocked()) {
		// We need to take this action only for the undocked popup.
		return;
	}

	this._log(logHead + "the window dimensions are: " + window.innerWidth + "x" + window.innerHeight);
	this._log(logHead + "the body dimensions are: " + document.body.clientWidth + "x" + document.body.clientHeight);

	// We want the width of the window to match the width of the <body> without scrollbars,
	// so we just resizeBy() the delta between the two.
	// Note that "document.body" might still not exist if this function is called too early.
	// We must wait for the "load" event for this function to be safe (but we've decided we're
	// not going to use this function anymore, so we're ok without the "load" listener).
	let widthDelta = document.body.clientWidth - window.innerWidth;

	// We want to allow users to change the height of the window freely, but this function
	// plays double duty as an event handler and as an initialization function, and during
	// initialization we need to set a consistent height.
	let heightDelta = 0;
	if(forceHeight) {
		heightDelta = 542 - window.innerHeight;
	}

	// Call resizeBy() only if there's a real change. Calling resizeBy() inside a "resize" event
	// handler smells of trouble, given the risk of infinite loops. resizeBy() should be "safe"
	// and avoid triggering a "resize" event if the size has not changed, but you never know, let's
	// make this redundant check here.
	if(widthDelta != 0 || heightDelta != 0) {
		this._log(logHead + "applying changes: " + widthDelta + ", " + heightDelta);
		window.resizeBy(widthDelta, heightDelta);
	} else {
		console.log(logHead + "no changes");
	}
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


