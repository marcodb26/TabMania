// CLASS PopupMenuViewer
//
Classes.PopupMenuViewer = Classes.MenuViewer.subclass({
	__idPrefix: "PopupMenuViewer",

	_tab: null,

	// Track here all the menu item viewers
	_dockToggleMenuItem: null,

_init: function() {
	// Overriding the parent class' _init(), but calling that original function first
	Classes.MenuViewer._init.call(this, {
		// Note that with this definition of "btnExtraClasses" we're overriding the
		// default "btn-secondary" color class for the dropdown button
		btnExtraClasses: [ "tm-menu-icon" ],
		showToggle: false,
	});

	this.addClasses("mx-2");
	this.debug();

	this._initMenuItems();
},

_setDockToggleText: function() {
	const dockToggleText = (popupDocker.isPopupDocked() ? "Undock" : "Dock") + " popup";
	this._dockToggleMenuItem.setHtml(dockToggleText);
},

_initMenuItems: function() {
	this._dockToggleMenuItem = Classes.MenuItemViewer.create("", this._actionDockToggleCb.bind(this));
	this._setDockToggleText();
	this.append(this._dockToggleMenuItem);
},

// We'll probably never need to call this function, no popup survives a change in docking state...
_updateMenuItems: function() {
	this._setDockToggleText();
},

_actionDockToggleCb: function(ev) {
	popupDocker.dockToggle();
},

update: function() {
	this._updateMenuItems();
},

}); // Classes.TileMenuViewer
