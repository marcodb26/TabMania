// CLASS MultiSelectPanelMenuViewer
//
Classes.MultiSelectPanelMenuViewer = Classes.MenuViewer.subclass({
	__idPrefix: "MultiSelectPanelMenuViewer",

	_eventManager: null,

	_useIncognitoStyle: null,

	_exitMenuItem: null,
	_listMenuItem: null,

	_pinMenuItem: null,
	_unpinMenuItem: null,

_init: function(useIncognitoStyle=false) {
	this._useIncognitoStyle = useIncognitoStyle;

	// Overriding the parent class' _init(), but calling that original function first
	Classes.MenuViewer._init.call(this, {
		btnClasses: [ "mx-2", "text-dark" ], // Remove the [ "btn", "btn-secondary" ] default
		menuExtraClasses: [ "tm-dropdown-tile-menu" ],
	});

	this.debug();

	this._eventManager = Classes.EventManager.createAs(this.getId() + ".eventManager");
	this._eventManager.attachRegistrationFunctions(this);

	this._initMenuItems();
},

_actionExitCb: function(ev) {
	const logHead = "MultiSelectPanelMenuViewer._actionExitCb():";
	this._log(logHead, "entering", ev);
	this._eventManager.notifyListeners(Classes.MultiSelectPanelMenuViewer.Events.CLOSED);
},

_actionListCb: function(ev) {
},

_actionPinCb: function(ev) {
},

_actionUnpinCb: function(ev) {
},

_actionPinBookmarksCb: function(ev) {
},

_actionHighlightToggleCb: function(ev) {
},

_actionCloseTabsCb: function(ev) {
	const logHead = "MultiSelectPanelMenuViewer._actionCloseTabsCb():";
	this._log(logHead, "entering", ev);
	this._eventManager.notifyListeners(Classes.MultiSelectPanelMenuViewer.Events.TABSCLOSED);
},

_initMenuItems: function() {
	let options = {
		labelText: "Exit select mode",
		actionFn: this._actionExitCb.bind(this),
	};
	this._exitMenuItem = Classes.MenuItemViewer.create(options);
	this.append(this._exitMenuItem);

	options = {
		labelText: "List selection",
		actionFn: this._actionListCb.bind(this),
	};
	this._listMenuItem = Classes.MenuItemViewer.create(options);
	this.append(this._listMenuItem);

	this.appendDivider();

	options = {
		labelText: "Pin selection",
		actionFn: this._actionPinCb.bind(this),
	};
	this._pinMenuItem = Classes.MenuItemViewer.create(options);
	this.append(this._pinMenuItem);

	options = {
		labelText: "Unpin selection",
		actionFn: this._actionUnpinCb.bind(this),
	};
	this._unpinMenuItem = Classes.MenuItemViewer.create(options);
	this.append(this._unpinMenuItem);

	options = {
		labelText: "Pin bookmarks",
		actionFn: this._actionPinBookmarksCb.bind(this),
	};
	this._pinBookmarksMenuItem = Classes.MenuItemViewer.create(options);
//	if(this._tab.tm.pinInherited == null) {
//		this._unpinByBookmarkMenuItem.hide();
//	}
	this.append(this._pinBookmarksMenuItem);

	options = {
		labelText: "Toggle highlight",
		actionFn: this._actionHighlightToggleCb.bind(this),
	};
	this._highlightMenuItem = Classes.MenuItemViewer.create(options);
	this.append(this._highlightMenuItem);

	options = {
		labelText: "Close/remove selection",
		actionFn: this._actionCloseTabsCb.bind(this),
	};
	this._closeMenuItem = Classes.MenuItemViewer.create(options);
	this.append(this._closeMenuItem);
},

discard: function() {
	this._eventManager.discard();
	this._eventManager = null;

	Classes.MenuViewer.discard.call(this);
},

}); // Classes.MultiSelectPanelMenuViewer

Classes.Base.roDef(Classes.MultiSelectPanelMenuViewer, "Events", {});
Classes.Base.roDef(Classes.MultiSelectPanelMenuViewer.Events, "CLOSED", "tmClosed");
Classes.Base.roDef(Classes.MultiSelectPanelMenuViewer.Events, "TABSCLOSED", "tmTabsClosed");