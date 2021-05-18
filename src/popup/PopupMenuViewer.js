// CLASS PopupMenuViewer
//
Classes.PopupMenuViewer = Classes.MenuViewer.subclass({
	__idPrefix: "PopupMenuViewer",

	_popupViewer: null,

	_activeBsTabId: null,

	_bsTabMenuContainer: null,

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

addBsTabMenuItem: function(bsTabLabel, menuText, startHidden=false) {
	let bsTabId = this._popupViewer.getBsTabIdByLabel(bsTabLabel);
	let options = {
		labelText: menuText,
		actionFn: this._actionActivateBsTab.bind(this, bsTabId),
	};
	let menuItem = Classes.MenuItemViewer.create(options);
	if(startHidden) {
		menuItem.hide();
	}
	this._bsTabMenuContainer.append(menuItem);
	this._bsTabMenuItems[bsTabId] = menuItem;

	// Since we've added a bsTab, we might need a new "selected" bsTab, let's rerun
	// that logic
	this._selectBsTabMenuItem(this._activeBsTabId);

	return menuItem;
},

// "bsTabLabel" is mandatory, and must already exist (use addBsTabMenuItem() first).
// "menuText" is optional, if not specified, the menu label is not changed
// "hide" is optional, if not specified the hidden/shown status of the menu item
// is not changed
updateBsTabMenuItem: function(bsTabLabel, menuText, hide) {
	const logHead = "PopupMenuViewer.updateBsTabMenuItem():";

	let bsTabId = this._popupViewer.getBsTabIdByLabel(bsTabLabel);
	let menuItem = this._bsTabMenuItems[bsTabId];

	if(menuItem == null) {
		this._err(logHead, "menu item not found:", bsTabId);
		return;
	}

	if(menuText != null) {
		menuItem.setText(menuText);
	}

	if(hide != null) {
		if(hide) {
			menuItem.hide();
		} else {
			menuItem.show();
		}
	}

	// Since we've modified a bsTab, we might need a new "selected" bsTab, let's rerun
	// that logic
	this._selectBsTabMenuItem(this._activeBsTabId);

	return menuItem;
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

	this._bsTabMenuContainer = Classes.ContainerViewer.create();
	this.append(this._bsTabMenuContainer);

	// Show the bsTabs options only if the popup is undocked. A docked popup can never be resized
	// to be too small to show the bsTab headings.
	if(localStore.isPopupDocked()) {
		this._bsTabMenuContainer.hide();
	} else {
		this.appendDivider();
	}

	this._activeBsTabId = localStore.getActiveBsTabId();

//	this.addBsTabMenuItem("home", "Home");
//	this.addBsTabMenuItem("settings", "Settings");

	this._dockToggleMenuItem = Classes.MenuItemViewer.create({ actionFn: this._actionDockToggleCb.bind(this) });
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
