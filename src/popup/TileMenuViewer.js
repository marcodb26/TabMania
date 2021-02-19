// CLASS MenuViewer
//
Classes.MenuViewer = Classes.Viewer.subclass({
	__idPrefix: "MenuViewer",

	_rootElem: null,
	// This class uses a body element different from the _rootElem
	_bodyElem: null,

	_options: null,

// "options" includes:
// - "label", if not specified (default), the dropdown will just show the caret
// - "btnColorClass", the CSS class to use for the button coloring, default "btn-secondary"
_init: function(options) {
	options = optionalWithDefault(options, {});
	options.label = optionalWithDefault(options.label, "");
	options.btnColorClass = optionalWithDefault(options.btnColorClass, "btn-secondary");

	this._options = options;

	// Overriding the parent class' _init(), but calling that original function first
	Classes.Viewer._init.call(this);
	this._MenuViewer_render();
},

_MenuViewer_render: function() {
	const menuId = this._id + "-menu";
	const menuItemsContainerId = this._id + "-menuitems";

	let dropdownExtraClasses = "";
	if(this._options.label == "") {
		dropdownExtraClasses = "tm-dropdown-toggle";
	}

	// See https://stackoverflow.com/questions/43233421/changing-dropdown-icon-on-bootstrap-4
	// if you want to replace the default caret symbol of the dropdown toggle with some other
	// visual element. All you need is to remove class "dropdown-toggle" (which has a pseudo
	// class "::after" that draws the caret), and put your gliph in the <a></a>.
	// Since we're adding "tm-dropdown-toggle::after" to fix some visual issues of the default
	// Bootstrap caret, you might need to remove "tm-dropdown-toggle" too if you want to
	// customize the icon. See the CSS definition of "tm-dropdown-toggle::after" for more details.
	let menuButtonHtml = `
	<div class="dropdown">
		<a class="btn ${this._options.btnColorClass} dropdown-toggle ${dropdownExtraClasses}" role="button"
				id="${menuId}" data-bs-toggle="dropdown" aria-expanded="false">
			${this._options.label}
		</a>
		<ul id=${menuItemsContainerId} class="dropdown-menu tm-dropdown-menu" aria-labelledby="${menuId}">
		</ul>
	</div>
	`;

	this._rootElem = this._elementGen(menuButtonHtml);
	this._bodyElem = this.getElementById(menuItemsContainerId);

	// Prevent clicks on the menu items from propagating all the way
	// down to the page owning the menu
	this._rootElem.addEventListener("click",
		function(ev) {
			ev.stopPropagation();
		},
		false);
},

}); // Classes.MenuViewer


// CLASS MenuItemViewer
//
Classes.MenuItemViewer = Classes.Viewer.subclass({
	__idPrefix: "MenuItemViewer",

	_rootElem: null,
	// This class uses a body element different from the _rootElem
	_bodyElem: null,

	_actionFn: null,

// "text" is optional, you can always call setText()/setHtml() later. Note that
// the constructor will call setText() internally, so if you want to use HTML tags,
// you'll need to pass an empty string in the constructor, then call setHtml()
// later.
// "actionFn" is optional, you can set it later with setAction().
_init: function(text, actionFn) {
	// Overriding the parent class' _init(), but calling that original function first
	Classes.Viewer._init.call(this);

	this.debug();
	this._renderMenuItem(optionalWithDefault(text, ""));

	this._actionFn = null;
	if(actionFn != null) {
		// Internally setAction() changes _actionFn
		this.setAction(actionFn);
	}
},

_renderMenuItem: function(text) {
	const logHead = "MenuItemViewer::_renderMenuItem(): ";

	const bodyId = this._id + "-item";

	// Bootstrap says the menu item should look like:
	// <li><a class="dropdown-item" href="#">Action</a></li>
	// However, we have some actionable and some non-actionable menu items, so we're
	// consolidating them all to look like:
	// <li><div class="dropdown-item">Action</div></li>
	// Then we can add callbacks to the click handler anyway...
	const rootHtml = `
		<li id="${this._id}">
			<div id="${bodyId}" class="dropdown-item tm-dropdown-item"></div>
		</li>
	`;

	this._rootElem = this._elementGen(rootHtml);
	this._bodyElem = this.getElementById(bodyId);

	// Use setText() instead of inserting the text directly in the menu, to avoid the
	// risk of HTML injection
	this.setText(text);
	//this._log(logHead, this._rootElem, this._bodyElem);
},

setAction: function(fn) {
	if(this._actionFn != null) {
		this._bodyElem.removeEventListener("click", this._actionFn, false);
	}
	this._actionFn = fn;
	this._bodyElem.addEventListener("click", this._actionFn, false);
},

}); // Classes.MenuItemViewer

// CLASS TileMenuViewer
//
Classes.TileMenuViewer = Classes.MenuViewer.subclass({
	__idPrefix: "TileMenuViewer",

	_tab: null,

	// Track here all the menu item viewers
	_titleMenuItem: null,
	_pinMenuItem: null,
	_discardMenuItem: null,
	_closeMenuItem: null,
	// An array of menu items associated to custom shortcuts
	_shortcutMenuItems: null,

_init: function(tab) {
	// Overriding the parent class' _init(), but calling that original function first
	Classes.MenuViewer._init.call(this, {
		btnColorClass: tab.incognito ? "btn-light" : "btn-secondary",
	});

	this.debug();
	this._tab = tab;

	this._initMenuItems();
},

_setShortcutMenuItems: function() {
	let sm = settingsStore.getShortcutsManager();

	// We show menu items only for non-first candidates
	let scKeys = sm.getShortcutKeysForTab(this._tab, false);

	this._shortcutMenuItems = [];

	scKeys.forEach(
		function(key) {
			let item = Classes.MenuItemViewer.create("Move tab to match shortcut " +
						sm.keyToUiString(key), this._actionSetCandidateCb.bind(this, key));
			this._shortcutMenuItems.push(item);
			this.append(item);
		}.bind(this)
	);
},

_updateShortcutMenuItems: function() {
	const logHead = "TileMenuViewer::_updateShortcutMenuItems(" + this._tab.id + "): ";
	this._err(logHead + "to be implemented");
	// Here we need to unlink the existing shortcut menu items from the menu,
	// then we can overwrite this._shortcutMenuItems and re-run _setShortcutMenuItems().
	// Inefficient, but easy to implement.
},

_initMenuItems: function() {
	this._titleMenuItem = Classes.MenuItemViewer.create("", this._actionActivateCb.bind(this));
	this._titleMenuItem.setHtml("<b>" + this._safeText(this._tab.title) + "</b>");
	this.append(this._titleMenuItem);

	this._pinMenuItem = Classes.MenuItemViewer.create(this._tab.pinned ? "Unpin" : "Pin",
								this._actionPinToggleCb.bind(this));
	this.append(this._pinMenuItem);

	this._muteMenuItem = Classes.MenuItemViewer.create(this._tab.mutedInfo.muted ? "Unmute" : "Mute",
								this._actionMuteToggleCb.bind(this));
	this.append(this._muteMenuItem);

	this._highlightMenuItem = Classes.MenuItemViewer.create(this._tab.highlighted ? "Remove highlight" : "Highlight",
								this._actionHighlightToggleCb.bind(this));
	this.append(this._highlightMenuItem);

	this._discardMenuItem = Classes.MenuItemViewer.create("Discard from memory",
								this._actionDiscardCb.bind(this));
	if(!settingsStore.getOptionAdvancedMenu()) {
		this._discardMenuItem.hide();
	}
	this.append(this._discardMenuItem);

	this._closeMenuItem = Classes.MenuItemViewer.create("Close", this._actionCloseCb.bind(this));
	this.append(this._closeMenuItem);

	this._setShortcutMenuItems();
},

_updateMenuItems: function() {
	this._titleMenuItem.setHtml("<b>" + this._safeText(this._tab.title) + "</b>");
	this._pinMenuItem.setText(this._tab.pinned ? "Unpin" : "Pin");
	// Nothing to update for _discardMenuItem and _closeMenuItem
	this._updateShortcutMenuItems();
},

_actionActivateCb: function(ev) {
	chromeUtils.activateTab(this._tab.id);
},

_actionPinToggleCb: function(ev) {
	const logHead = "TileMenuViewer::_actionPinToggleCb(" + this._tab.id + "): ";
	chromeUtils.wrap(chrome.tabs.update, logHead,
					this._tab.id, { pinned: !this._tab.pinned } ).then(
		function() {
			this._log(logHead + "completed");
		}.bind(this)
	);
},

_actionMuteToggleCb: function(ev) {
	const logHead = "TileMenuViewer::_actionMuteToggleCb(" + this._tab.id + "): ";
	chromeUtils.wrap(chrome.tabs.update, logHead,
					this._tab.id, { muted: !this._tab.mutedInfo.muted } ).then(
		function() {
			this._log(logHead + "completed");
		}.bind(this)
	);
},

_actionHighlightToggleCb: function(ev) {
	const logHead = "TileMenuViewer::_actionHighlightToggleCb(" + this._tab.id + "): ";
	chromeUtils.wrap(chrome.tabs.update, logHead,
					this._tab.id, { highlighted: !this._tab.highlighted } ).then(
		function() {
			this._log(logHead + "completed");
		}.bind(this)
	);
},

_actionDiscardCb: function(ev) {
	const logHead = "TileMenuViewer::_actionDiscardCb(" + this._tab.id + "): ";
	chromeUtils.wrap(chrome.tabs.discard, logHead, this._tab.id).then(
		function() {
			this._log(logHead + "completed");
		}.bind(this)
	);
},

_actionCloseCb: function(ev) {
	const logHead = "TileMenuViewer::_actionCloseCb(" + this._tab.id + "): ";
	chromeUtils.wrap(chrome.tabs.remove, logHead, this._tab.id).then(
		function() {
			this._log(logHead + "completed");
		}.bind(this)
	);
},

_actionSetCandidateCb: function(key, ev) {
	const logHead = "TileMenuViewer::_actionSetCandidateCb(" + this._tab.id + ", " + key + "): ";

	// We should probably also get the "coordinates" the first candidate in
	// order to take its place
	let sm = settingsStore.getShortcutsManager();
	let candidateTabs = sm.getShortcutInfo(key).candidateTabs;
	this._assert(candidateTabs != null);

	this._log(logHead + "entering, first candidate is: ", candidateTabs[0]);
	chromeUtils.wrap(chrome.tabs.move, logHead, this._tab.id,
					{ index: candidateTabs[0].index, windowId: candidateTabs[0].windowId });
},

update: function(tab) {
	this._tab = tab;
	this._updateMenuItems();
},

}); // Classes.TileMenuViewer