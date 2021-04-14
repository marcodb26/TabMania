// CLASS PopupMenuViewer
//
Classes.PopupMenuViewer = Classes.MenuViewer.subclass({
	__idPrefix: "PopupMenuViewer",

	_popupViewer: null,

	_activeBsTabId: null,

	// Track here all the menu item viewers
	_bsTabMenuItems: null,
	_dockToggleMenuItem: null,

_init: function(popupViewer) {
	// Overriding the parent class' _init(), but calling that original function first
	Classes.MenuViewer._init.call(this, {
		// Note that with this definition of "btnExtraClasses" we're overriding the
		// default "btn-secondary" color class for the dropdown button
		btnExtraClasses: [ "tm-menu-icon" ],
		showToggle: false,
	});

	this.addClasses("mx-2");
	this.debug();

	this._popupViewer = popupViewer;

	this._initMenuItems();
	localStore.addEventListener(Classes.EventManager.Events.UPDATED, this._localStoreUpdatedCb.bind(this));
},

_localStoreUpdatedCb: function(ev) {
	const logHead = "PopupMenuViewer::_localStoreUpdatedCb(" + ev.detail.key + "): ";

	let activeBsTabId = localStore.getActiveBsTabId();

	if(this._activeBsTabId == activeBsTabId) {
		this._log(logHead + "activeBsTabId unchanged, ignoring");
		return;
	}

	this._activeBsTabId = activeBsTabId;
	this._selectBsTabMenuItem(activeBsTabId);
},

_setDockToggleText: function() {
	const dockToggleText = (popupDocker.isPopupDocked() ? "Undock" : "Dock") + " popup";
	this._dockToggleMenuItem.setHtml(dockToggleText);
},

_initBsTabMenuItem: function(menuText, bsTabLabel) {
	let bsTabId = this._popupViewer.getBsTabId(bsTabLabel);
	let menuItem = Classes.MenuItemViewer.create(menuText, this._actionActivateBsTab.bind(this, bsTabId));
	this.append(menuItem);
	this._bsTabMenuItems[bsTabId] = menuItem;
},

_selectBsTabMenuItem: function(highlightBsTabId) {
	// This is a low frequency event, let's just scan all the menu items.
	//
	// Note that if the popup is docked, this._bsTabMenuItems is an empty dictionary,
	// and nothing bad happens.
	for(let [ bsTabId, bsTabMenuItem ] of Object.entries(this._bsTabMenuItems)) {
		if(bsTabId == highlightBsTabId) {
			bsTabMenuItem.selected();
		} else {
			bsTabMenuItem.selected(false);
		}
	}
},

_initMenuItems: function() {
	this._bsTabMenuItems = [];

	// Show the bsTabs options only if the popup is undocked. A docked popup can never be resized
	// to be too small to show the bsTab headings.
	if(!localStore.isPopupDocked()) {
		this._initBsTabMenuItem("Home", "home");
		this._initBsTabMenuItem("Settings", "settings");

		this._activeBsTabId = localStore.getActiveBsTabId();
		this._selectBsTabMenuItem(this._activeBsTabId);

		this.appendDivider();
	}

	this._dockToggleMenuItem = Classes.MenuItemViewer.create("", this._actionDockToggleCb.bind(this));
	this._setDockToggleText();
	this.append(this._dockToggleMenuItem);
},

// We'll probably never need to call this function, no popup survives a change in docking state...
_updateMenuItems: function() {
	this._setDockToggleText();
},

_actionActivateBsTab: function(bsTabId, ev) {
	this._popupViewer.activateBsTabById(bsTabId);
},

_actionDockToggleCb: function(ev) {
	popupDocker.dockToggle();
},

update: function() {
	this._updateMenuItems();
},

}); // Classes.PopupMenuViewer
