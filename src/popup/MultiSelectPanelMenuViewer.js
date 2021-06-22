// CLASS MultiSelectPanelMenuViewer
//
Classes.MultiSelectPanelMenuViewer = Classes.MenuViewer.subclass({
	__idPrefix: "MultiSelectPanelMenuViewer",

	_eventManager: null,

	_useIncognitoStyle: null,

	_listMenuItem: null,
	_exitMenuItem: null,

	_pinMenuItem: null,
	_moveMenuItem: null,
	_highlightMenuItem: null,
	_closeMenuItem: null,

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

	this._pinMenuItem = this._addMenuItem("Pin selection",
								Classes.MultiSelectPanelMenuViewer.Events.TABSPINNED);
	this._moveMenuItem = this._addMenuItem("Move/open selection in new window",
								Classes.MultiSelectPanelMenuViewer.Events.TABSMOVED);
	this._highlightMenuItem = this._addMenuItem("Toggle highlight",
								Classes.MultiSelectPanelMenuViewer.Events.TABSHIGHLIGHTED);
	this._closeMenuItem = this._addMenuItem("Close/delete selection",
								Classes.MultiSelectPanelMenuViewer.Events.TABSCLOSED);
},

setListSelectedMode: function(flag=true) {
	this._listMenuItem.selected(flag);
},

discard: function() {
	this._eventManager.discard();
	this._eventManager = null;

	Classes.MenuViewer.discard.call(this);
},

enableActions: function(flag=true) {
	this._pinMenuItem.enable(flag);
	this._moveMenuItem.enable(flag);
	this._highlightMenuItem.enable(flag);
	this._closeMenuItem.enable(flag);
},

}); // Classes.MultiSelectPanelMenuViewer

Classes.Base.roDef(Classes.MultiSelectPanelMenuViewer, "Events", {});
Classes.Base.roDef(Classes.MultiSelectPanelMenuViewer.Events, "TABSHIGHLIGHTED", "tmTabsHighlighted");
Classes.Base.roDef(Classes.MultiSelectPanelMenuViewer.Events, "TABSCLOSED", "tmTabsClosed");
Classes.Base.roDef(Classes.MultiSelectPanelMenuViewer.Events, "TABSMOVED", "tmTabsMoved");
Classes.Base.roDef(Classes.MultiSelectPanelMenuViewer.Events, "TABSPINNED", "tmTabsPinned");
