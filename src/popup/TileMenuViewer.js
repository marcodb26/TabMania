// CLASS MenuViewer
//
Classes.MenuViewer = Classes.Viewer.subclass({
	__idPrefix: "MenuViewer",

	_rootElem: null,
	// This class uses a body element different from the _rootElem
	_bodyElem: null,

	_options: null,

// "options" includes:
// - "label", if not specified (default), the dropdown will just show the caret. The label
//   can contain HTML, not only text
// - "btnExtraClasses", you can use it for example for the CSS class to use for the button coloring,
//   and it default to "btn-secondary"
_init: function(options) {
	options = optionalWithDefault(options, {});
	options.label = optionalWithDefault(options.label, "");
	options.showToggle = optionalWithDefault(options.showToggle, true);
	options.btnExtraClasses = optionalWithDefault(options.btnExtraClasses, [ "btn-secondary" ]);

	this._options = options;

	// Overriding the parent class' _init(), but calling that original function first
	Classes.Viewer._init.call(this);
	this._MenuViewer_render();
},

_MenuViewer_render: function() {
	const menuId = this._id + "-menu";
	const menuItemsContainerId = this._id + "-menuitems";

	let dropdownExtraClasses = [];
	if(this._options.showToggle) {
		if(this._options.label == "") {
			dropdownExtraClasses.push("tm-dropdown-toggle");
		}
		dropdownExtraClasses.push("dropdown-toggle");
	}
	if(this._options.btnExtraClasses.length > 0) {
		// push() can take multiple arguments
		dropdownExtraClasses.push(...this._options.btnExtraClasses);
	}

	// See https://stackoverflow.com/questions/43233421/changing-dropdown-icon-on-bootstrap-4
	// if you want to replace the default caret symbol of the dropdown toggle with some other
	// visual element. All you need is to remove class "dropdown-toggle" (which has a pseudo
	// class "::after" that draws the caret), and put your gliph in the <a></a>.
	// Since we're adding "tm-dropdown-toggle::after" to fix some visual issues of the default
	// Bootstrap caret, you might need to remove "tm-dropdown-toggle" too if you want to
	// customize the icon. See the CSS definition of "tm-dropdown-toggle::after" for more details.
	//
	// "tm-full-height" is needed only for the dropdown for the bstab main menu, but since
	// it's not hurting other uses of the menuButton, we'll use it everywhere...
	let menuButtonHtml = `
	<div class="dropdown tm-full-height">
		<a class="btn ${dropdownExtraClasses.join(" ")}" role="button"
				id="${menuId}" data-bs-toggle="dropdown" aria-expanded="false">
			${this._options.label}
		</a>
		<ul id=${menuItemsContainerId} class="dropdown-menu tm-dropdown-menu" aria-labelledby="${menuId}">
		</ul>
	</div>
	`;

	this._rootElem = this._elementGen(menuButtonHtml);
	this._bodyElem = this.getElementById(menuItemsContainerId);

	let menuElem = this.getElementById(menuId);
	let bootstrapObj = new bootstrap.Dropdown(menuElem);
	// Prevent clicks on the menu items from propagating all the way
	// down to the page owning the menu
	this._rootElem.addEventListener("click",
		function(ev) {
			ev.stopPropagation();
			// Since the click doesn't propagate, the menu won't close by itself when
			// clicked (?). Actually not sure this is the real root cause, but calling
			// the next function fixes the problem.
			bootstrapObj.hide();
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
	// Update: the menu doesn't close automatically when you click an item.
	// Tried to switch back to <a>, but the link causes the popup to move to status
	// "loading" and then "complete" every time you click a menu item. That causes
	// the menu to close, but only because we re-render, when you hover the menu
	// is actually still open.
	// Fixed the problem of menu staying open in MenuViewer._MenuViewer_render().
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

// CLASS TileTabMenuViewer
//
Classes.TileTabMenuViewer = Classes.MenuViewer.subclass({
	__idPrefix: "TileTabMenuViewer",

	_tab: null,

	// Track here all the menu item viewers
	_titleMenuItem: null,
	_pinMenuItem: null,
	_muteMenuItem: null,
	_highlightMenuItem: null,
	_playMenuItem: null,
	_suspendMenuItem: null,
	_closeMenuItem: null,
	// An array of menu items associated to custom shortcuts
	_shortcutMenuItems: null,

_init: function(tab) {
	// Overriding the parent class' _init(), but calling that original function first
	Classes.MenuViewer._init.call(this, {
		btnExtraClasses: [ tab.incognito ? "btn-light" : "btn-secondary" ],
	});

	this.debug();
	this._tab = tab;

	this._assert(this._tab.tm.type == Classes.NormalizedTabs.type.TAB);
	
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
	const logHead = "TileTabMenuViewer::_updateShortcutMenuItems(" + this._tab.id + "): ";
	// Here we need to unlink the existing shortcut menu items from the menu,
	// then we can overwrite this._shortcutMenuItems and re-run _setShortcutMenuItems().
	// Inefficient, but easy to implement.
	for(let i = 0; i < this._shortcutMenuItems.length; i++) {
		this._shortcutMenuItems[i].detach();
	}
	this._shortcutMenuItems = [];

	this._setShortcutMenuItems();
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

//	this._playMenuItem = Classes.MenuItemViewer.create("Toggle play",
//									this._actionPlayToggleCb.bind(this));
//	this.append(this._playMenuItem);

	this._moveToLeastTabbedMenuItem = Classes.MenuItemViewer.create("Move to least tabbed window",
								this._actionMoveToLeastTabbedCb.bind(this));
	this.append(this._moveToLeastTabbedMenuItem);

	this._suspendMenuItem = Classes.MenuItemViewer.create("Suspend (discard from memory)",
								this._actionSuspendCb.bind(this));
//	if(!settingsStore.getOptionAdvancedMenu()) {
//		this._suspendMenuItem.hide();
//	}
	this.append(this._suspendMenuItem);

	this._closeMenuItem = Classes.MenuItemViewer.create("Close", this._actionCloseCb.bind(this));
	this.append(this._closeMenuItem);

	this._setShortcutMenuItems();
},

_updateMenuItems: function() {
	this._titleMenuItem.setHtml("<b>" + this._safeText(this._tab.title) + "</b>");
	this._pinMenuItem.setText(this._tab.pinned ? "Unpin" : "Pin");
	this._muteMenuItem.setText(this._tab.mutedInfo.muted ? "Unmute" : "Mute");
	this._highlightMenuItem.setText(this._tab.highlighted ? "Remove highlight" : "Highlight");
	// Nothing to update for _suspendMenuItem and _closeMenuItem
	this._updateShortcutMenuItems();
},

_actionActivateCb: function(ev) {
	chromeUtils.activateTab(this._tab.id);
},

_actionPinToggleCb: function(ev) {
	const logHead = "TileTabMenuViewer::_actionPinToggleCb(" + this._tab.id + "): ";
	chromeUtils.wrap(chrome.tabs.update, logHead,
					this._tab.id, { pinned: !this._tab.pinned } ).then(
		function() {
			this._log(logHead + "completed");
		}.bind(this)
	);
},

_actionMuteToggleCb: function(ev) {
	const logHead = "TileTabMenuViewer::_actionMuteToggleCb(" + this._tab.id + "): ";
	chromeUtils.wrap(chrome.tabs.update, logHead,
					this._tab.id, { muted: !this._tab.mutedInfo.muted } ).then(
		function() {
			this._log(logHead + "completed");
		}.bind(this)
	);
},

_actionHighlightToggleCb: function(ev) {
	const logHead = "TileTabMenuViewer::_actionHighlightToggleCb(" + this._tab.id + "): ";
	chromeUtils.wrap(chrome.tabs.update, logHead,
					this._tab.id, { highlighted: !this._tab.highlighted } ).then(
		function() {
			this._log(logHead + "completed");
		}.bind(this)
	);
},

_actionPlayToggleCb: function(ev) {
	const logHead = "TileTabMenuViewer::_actionPlayToggleCb(" + this._tab.id + "): ";
	chromeUtils.inject(this._tab.id, "content-gen/inject-togglePlay.js").then(
		function(result) { // onFulfilled
			if(result == null) {
				// Some known error has already been handled, we'll just
				// consider the results empty.
				return null;
			}
			this._log(logHead, result);
			if(result.length == 1) {
				if(result[0] == null) {
					this._err(logHead + "the injected script failed to generate a return value", result);
					return null;
				}
				return result[0];
			}
			this._err(logHead + "unknown format for result = ", result);
			return null;
		}.bind(this),
		function(chromeLastError) { // onRejected
			this._err(logHead + "unknown error: " + chromeLastError.message, this._tab);
			return chromeLastError;
		}.bind(this)
	);
},

_actionMoveToLeastTabbedCb: function(ev) {
	const logHead = "TileTabMenuViewer::_actionMoveToLeastTabbedCb(" + this._tab.id + "): ";
	// We're moving it in the background, no reason to activate it
	chromeUtils.moveTabToLeastTabbedWindow(this._tab, false).then(
		function(result) {
			if(result != null) {
				this._log(logHead + "completed");
			} else {
				this._log(logHead + "no action taken");
			}
		}.bind(this)
	);
},

_actionSuspendCb: function(ev) {
	const logHead = "TileTabMenuViewer::_actionSuspendCb(" + this._tab.id + "): ";
	chromeUtils.wrap(chrome.tabs.discard, logHead, this._tab.id).then(
		function() {
			this._log(logHead + "completed");
		}.bind(this)
	);
},

_actionCloseCb: function(ev) {
	const logHead = "TileTabMenuViewer::_actionCloseCb(" + this._tab.id + "): ";
	chromeUtils.wrap(chrome.tabs.remove, logHead, this._tab.id).then(
		function() {
			this._log(logHead + "completed");
		}.bind(this)
	);
},

_actionSetCandidateCb: function(key, ev) {
	const logHead = "TileTabMenuViewer::_actionSetCandidateCb(" + this._tab.id + ", " + key + "): ";

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

}); // Classes.TileTabMenuViewer


// CLASS TileBookmarkMenuViewer
//
Classes.TileBookmarkMenuViewer = Classes.MenuViewer.subclass({
	__idPrefix: "TileBookmarkMenuViewer",

	_bm: null,

	// Track here all the menu item viewers
	_titleMenuItem: null,
	_titleElem: null,
	_subtitleElem: null,

	_openBookmarkManagerMenuItem: null,
//	_pinMenuItem: null,
	_deleteMenuItem: null,

_init: function(bm) {
	// Overriding the parent class' _init(), but calling that original function first
	Classes.MenuViewer._init.call(this);

	this.debug();
	this._bm = bm;

	this._assert(this._bm.tm.type == Classes.NormalizedTabs.type.BOOKMARK);
	
	this._initMenuItems();
},

_renderSubtitleHtml: function(pathList) {
	let createdText = (new Date(this._bm.dateAdded)).toString();

	// bookmarksManager.getBmPathListSync()() returns an array that starts with an empty
	// string (the root element of the bookmarks tree has no title), and that's
	// perfect to have .join("/") add a leading "/".
	return `
	Bookmark at <i>${pathList.join("/")}</i>, created on ${createdText}
	`;
},

_renderTitle: function() {
	const titleId = this._id + "-title";
	const subtitleId = this._id + "-subtitle";

	let titleHtml = `
		<div id="${titleId}"></div>
		<div id="${subtitleId}"></div>
	`;

	this._titleMenuItem = Classes.MenuItemViewer.create("", this._actionActivateCb.bind(this));
	this._titleMenuItem.setHtml(titleHtml);
	this.append(this._titleMenuItem);

	this._titleElem = this.getElementById(titleId);
	this._subtitleElem = this.getElementById(subtitleId);

	this._updateTitleMenuItem();
},

_updateTitleMenuItem: function() {
	this._titleElem.innerHTML = `<b>${this._safeText(this._bm.title)}</b>`;

	let pathList = bookmarksManager.getBmPathListSync(this._bm);
	if(pathList != null) {
		this._subtitleElem.innerHTML = this._renderSubtitleHtml(pathList);
		return;
	}

	// If we get here, the sync version of getBmPathList didn't have all the data
	// to provide the full folder set, we need to rely on the async version instead
	bookmarksManager.getBmPathListAsync(this._bm).then(
		function(pathList) {
			this._subtitleElem.innerHTML = this._renderSubtitleHtml(pathList);
		}.bind(this)
	);
},

_initMenuItems: function() {
	this._renderTitle();

	if(this._bm.parentId != null) {
		this._openBookmarkManagerMenuItem = Classes.MenuItemViewer.create("Open folder in Chrome Bookmark manager",
						this._actionBookmarkManagerCb.bind(this));
		this.append(this._openBookmarkManagerMenuItem);
	}

//	// Placeholder for later
//	this._pinMenuItem = Classes.MenuItemViewer.create(this._bm.pinned ? "Unpin" : "Pin",
//								this._actionPinToggleCb.bind(this));
//	this.append(this._pinMenuItem);

	this._deleteMenuItem = Classes.MenuItemViewer.create("Delete", this._actionDeleteCb.bind(this));
	this.append(this._deleteMenuItem);
},

_updateMenuItems: function() {
	this._updateTitleMenuItem();
//	this._pinMenuItem.setText(this._bm.pinned ? "Unpin" : "Pin");
	// Nothing to update for _deleteMenuItem
},

_actionActivateCb: function(ev) {
	Classes.TabsTabViewer.activateTab(this._bm);
},

_actionBookmarkManagerCb: function(ev) {
	let url = "chrome://bookmarks/?id=" + this._bm.parentId;
	chromeUtils.loadUrl(url);
},

_actionPinToggleCb: function(ev) {
	const logHead = "TileBookmarkMenuViewer::_actionPinToggleCb(" + this._bm.id + "): ";

	// PLACEHOLDER - TBD

//	chromeUtils.wrap(chrome.tabs.update, logHead,
//					this._bm.id, { pinned: !this._bm.pinned } ).then(
//		function() {
//			this._log(logHead + "completed");
//		}.bind(this)
//	);
},

_actionDeleteCb: function(ev) {
	const logHead = "TileBookmarkMenuViewer::_actionDeleteCb(" + this._bm.id + "): ";
	// Note that we need to use "_bm.bookmarkId", not "_bm.id", because we've modified
	// "_bm.id", and if we used it, Chrome would respond with:
	// ChromeUtils::wrap().cb: TileBookmarkMenuViewer::_actionDeleteCb(b945): chrome.runtime.lastError = Bookmark id is invalid.
	chromeUtils.wrap(chrome.bookmarks.remove, logHead, this._bm.bookmarkId).then(
		function() {
			this._log(logHead + "completed");
		}.bind(this)
	);
},

update: function(bm) {
	this._bm = bm;
	this._updateMenuItems();
},

}); // Classes.TileBookmarkMenuViewer


// CLASS TileHistoryMenuViewer
//
Classes.TileHistoryMenuViewer = Classes.MenuViewer.subclass({
	__idPrefix: "TileHistoryMenuViewer",

	_item: null,

	// Track here all the menu item viewers
	_titleMenuItem: null,
	_titleElem: null,
	_subtitleElem: null,
	_deleteMenuItem: null,

_init: function(item) {
	// Overriding the parent class' _init(), but calling that original function first
	Classes.MenuViewer._init.call(this);

	this.debug();
	this._item = item;

	this._assert(this._item.tm.type == Classes.NormalizedTabs.type.HISTORY);
	
	this._initMenuItems();
},

_renderTitle: function() {
	const titleId = this._id + "-title";
	const subtitleId = this._id + "-subtitle";

	let titleHtml = `
		<div id="${titleId}"></div>
		<div id="${subtitleId}"></div>
	`;

	this._titleMenuItem = Classes.MenuItemViewer.create("", this._actionActivateCb.bind(this));
	this._titleMenuItem.setHtml(titleHtml);
	this.append(this._titleMenuItem);

	this._titleElem = this.getElementById(titleId);
	this._subtitleElem = this.getElementById(subtitleId);

	this._updateTitleMenuItem();
},

_updateTitleMenuItem: function() {
	this._titleElem.innerHTML = `<b>${this._safeText(this._item.title)}</b>`;
	let visitsCnt = this._item.visitCount + this._item.typedCount;
	let lastVisited = (new Date(this._item.lastVisitTime)).toString();

	let midString = `${visitsCnt} times, last`;
	if(visitsCnt == 1) {
		midString = "once";
	}
	this._subtitleElem.innerHTML = `History item, visited ${midString} on ${lastVisited}`;
},

_initMenuItems: function() {
	this._renderTitle();

	this._deleteMenuItem = Classes.MenuItemViewer.create("Delete", this._actionDeleteCb.bind(this));
	this.append(this._deleteMenuItem);
},

_updateMenuItems: function() {
	this._updateTitleMenuItem();
	// Nothing to update for _deleteMenuItem
},

_actionActivateCb: function(ev) {
	Classes.TabsTabViewer.activateTab(this._item);
},

_actionDeleteCb: function(ev) {
	const logHead = "TileHistoryMenuViewer::_actionDeleteCb(" + this._item.url + "): ";
	chromeUtils.wrap(chrome.history.deleteUrl, logHead, { url: this._item.url }).then(
		function() {
			this._log(logHead + "completed");
		}.bind(this)
	);
},

update: function(item) {
	this._item = item;
	this._updateMenuItems();
},

}); // Classes.TileHistoryMenuViewer
