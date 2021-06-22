// CLASS PopupMenuViewer
//
Classes.PopupMenuViewer = Classes.MenuViewer.subclass({
	__idPrefix: "PopupMenuViewer",

	_popupViewer: null,

	_activeBsTabId: null,

	_bsTabMenuContainer: null,

	// Track here all the menu item viewers
	_bsTabMenuItems: null,
	_multiSelectMenuItem: null,

	_enterMultiSelectText: "Enter select mode",
	_exitMultiSelectText: "Exit select mode",

_init: function(popupViewer) {
	// Overriding the parent class' _init(), but calling that original function first
	Classes.MenuViewer._init.call(this, {
		// Note that with this definition of "btnClasses" we're overriding the default
		// "btn-secondary" color class for the dropdown button
		btnClasses: [ "btn", "tm-menu-icon" ],
		showToggle: false,
	});

	this.addClasses("mx-2");
	this.debug();

	this._popupViewer = popupViewer;

	this._activeBsTabId = localStore.getActiveBsTabId();

	this._initMenuItems();
	localStore.addEventListener(Classes.EventManager.Events.UPDATED, this._localStoreUpdatedCb.bind(this));
},

_localStoreUpdatedCb: function(ev) {
	const logHead = "PopupMenuViewer._localStoreUpdatedCb():";

	let activeBsTabId = localStore.getActiveBsTabId();

	if(this._activeBsTabId == activeBsTabId) {
		this._log(logHead, "activeBsTabId unchanged, ignoring key", ev.detail.key);
		return;
	}

	this._activeBsTabId = activeBsTabId;
	this._selectBsTabMenuItem(activeBsTabId);
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

updateMultiSelectMenuItem: function(activeBsTabId) {
	const logHead = "PopupMenuViewer.updateMultiSelectMenuItem():";

	let activeBsTab = this._popupViewer.getBsTabById(activeBsTabId);

	if(activeBsTabId == this._popupViewer.getBsTabIdByLabel("settings") || activeBsTab == null) {
		if(activeBsTab == null) {
			this._log(logHead, "this._popupViewer not ready", activeBsTabId)
		} else {
			this._log(logHead, "disabling menu item for settings tab", activeBsTabId);
		}
		this._multiSelectMenuItem.enable(false);
		this._multiSelectMenuItem.setHtml(this._enterMultiSelectText);
		return;
	}

	this._log(logHead, "entering, activeBsTabId =", activeBsTabId);

	this._multiSelectMenuItem.enable();
	this._multiSelectMenuItem.setHtml(activeBsTab.isSelectMode() ? this._exitMultiSelectText : this._enterMultiSelectText);
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

	this.updateMultiSelectMenuItem(highlightBsTabId);
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

	this._multiSelectMenuItem = Classes.MenuItemViewer.create({ actionFn: this._actionToggleSelectModeCb.bind(this) });
	this.updateMultiSelectMenuItem(this._activeBsTabId);
	this.append(this._multiSelectMenuItem);
},

_actionActivateBsTab: function(bsTabId, ev) {
	this._popupViewer.activateBsTabById(bsTabId);
},

_actionToggleSelectModeCb: function(ev) {
	// No need to check if the current active bsTab is the "settings" tab, because
	// when that happens this menu gets disabled and can't be clicked
	this._popupViewer.getBsTabById(this._activeBsTabId).toggleSelectMode();
},

update: function() {
	// Nothing to do for this class
},

}); // Classes.PopupMenuViewer
