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

_actionCb: function(notifEventName, ev) {
	const logHead = "MultiSelectPanelMenuViewer._actionCb():";
	this._log(logHead, "entering", notifEventName, ev);
	this._eventManager.notifyListeners(notifEventName);
},

_actionPinCb: function(ev) {
},

_actionUnpinCb: function(ev) {
},

_actionPinBookmarksCb: function(ev) {
},

_addMenuItem: function(labelText, notifEventName) {
	let options = {
		labelText,
		actionFn: this._actionCb.bind(this, notifEventName),
	};
	let retVal = Classes.MenuItemViewer.create(options);
	this.append(retVal);
	return retVal;
},

_initMenuItems: function() {
	this._listMenuItem = this._addMenuItem("Show selection", Classes.MultiSelectPanelViewer.Events.LISTED);
	this._exitMenuItem = this._addMenuItem("Exit select mode", Classes.MultiSelectPanelViewer.Events.CLOSED);

	this.appendDivider();

	this._highlightMenuItem = this._addMenuItem("Toggle highlight",
								Classes.MultiSelectPanelMenuViewer.Events.TABSHIGHLIGHTED);
	this._closeMenuItem = this._addMenuItem("Close/delete selection",
								Classes.MultiSelectPanelMenuViewer.Events.TABSCLOSED);


	let options = {
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
},

setListSelectedMode: function(flag=true) {
	this._listMenuItem.selected(flag);
},

discard: function() {
	this._eventManager.discard();
	this._eventManager = null;

	Classes.MenuViewer.discard.call(this);
},

}); // Classes.MultiSelectPanelMenuViewer

Classes.Base.roDef(Classes.MultiSelectPanelMenuViewer, "Events", {});
Classes.Base.roDef(Classes.MultiSelectPanelMenuViewer.Events, "TABSHIGHLIGHTED", "tmTabsHighlighted");
Classes.Base.roDef(Classes.MultiSelectPanelMenuViewer.Events, "TABSCLOSED", "tmTabsClosed");
