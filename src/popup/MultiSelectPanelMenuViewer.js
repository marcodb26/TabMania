// CLASS MultiSelectPanelMenuViewer
//
Classes.MultiSelectPanelMenuViewer = Classes.MenuViewer.subclass({
	__idPrefix: "MultiSelectPanelMenuViewer",

	_useIncognitoStyle: null,

	_selectCb: null,
	_selectMenuItem: null,

_init: function(useIncognitoStyle=false) {
	this._useIncognitoStyle = useIncognitoStyle;

	// Overriding the parent class' _init(), but calling that original function first
	Classes.MenuViewer._init.call(this, {
		btnClasses: [ "mx-2", "text-dark" ], // Remove the [ "btn", "btn-secondary" ] default
		menuExtraClasses: [ "tm-dropdown-tile-menu" ],
	});

	this.debug();

	this._initSelectMenuItem();
},

_actionSelectCb: function(ev) {
	if(this._selectCb != null) {
		this._selectCb(ev);
	}
},

_initSelectMenuItem: function() {
	options = {
		labelText: "Select",
		actionFn: this._actionSelectCb.bind(this),
	};
	this._selectMenuItem = Classes.MenuItemViewer.create(options);
	this.append(this._selectMenuItem);
},

// Callback signature: fn(ev)
setSelectCb: function(fn) {
	this._selectCb = fn;
},

}); // Classes.MultiSelectPanelMenuViewer
