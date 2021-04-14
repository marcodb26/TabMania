// CLASS MenuViewer
//
Classes.MenuViewer = Classes.Viewer.subclass({
	__idPrefix: "MenuViewer",

	_rootElem: null,
	// This class uses a body element different from the _rootElem
	_bodyElem: null,

	_menuElem: null,

	_options: null,

	_dropdownBsObj: null,

// "options" includes:
// - "label", if not specified (default), the dropdown will just show the caret. The label
//   can contain HTML, not only text
// - "btnExtraClasses", you can use it for example for the CSS class to use for the button coloring,
//   and it default to "btn-secondary"
_init: function(options) {
	// Don't store "options" as-is, create a copy (and while you're doing it, initialize all
	// the fields you need)
	this._options = {};
	this._options.label = optionalWithDefault(options.label, "");
	this._options.showToggle = optionalWithDefault(options.showToggle, true);
	this._options.btnExtraClasses = optionalWithDefault(options.btnExtraClasses, [ "btn-secondary" ]);
	this._options.menuExtraClasses = optionalWithDefault(options.menuExtraClasses, []);

	// Overriding the parent class' _init(), but calling that original function first
	Classes.Viewer._init.call(this);
	this._MenuViewer_render();
},

_MenuViewer_render: function() {
	const menuId = this._id + "-menu";
	const menuItemsContainerId = this._id + "-menuitems";

	let dropdownClasses = [ "btn" ];
	let menuClasses = [ "dropdown-menu" ];

	if(this._options.showToggle) {
		if(this._options.label == "") {
			dropdownClasses.push("tm-dropdown-toggle");
		}
		dropdownClasses.push("dropdown-toggle");
	}

	// push() can take multiple arguments
	dropdownClasses.push(...this._options.btnExtraClasses);
	menuClasses.push(...this._options.menuExtraClasses);

	// See https://stackoverflow.com/questions/43233421/changing-dropdown-icon-on-bootstrap-4
	// if you want to replace the default caret symbol of the dropdown toggle with some other
	// visual element. All you need is to remove class "dropdown-toggle" (which has a pseudo
	// class "::after" that draws the caret), and put your gliph in the <a></a>.
	// Since we're adding "tm-dropdown-toggle::after" to fix some visual issues of the default
	// Bootstrap caret, you might need to remove "tm-dropdown-toggle" too if you want to
	// customize the icon. See the CSS definition of "tm-dropdown-toggle::after" for more details.
	//
	// "h-100" is needed only for the dropdown for the bstab main menu, but since
	// it's not hurting other uses of the menuButton, we'll use it everywhere...
	let menuButtonHtml = `
	<div class="dropdown h-100">
		<a class="${dropdownClasses.join(" ")}" role="button"
				id="${menuId}" data-bs-toggle="dropdown" aria-expanded="false">
			${this._options.label}
		</a>
		<ul id=${menuItemsContainerId} class="${menuClasses.join(" ")}" aria-labelledby="${menuId}">
		</ul>
	</div>
	`;

	this._rootElem = this._elementGen(menuButtonHtml);
	this._bodyElem = this.getElementById(menuItemsContainerId);

	this._menuElem = this.getElementById(menuId);
	this._dropdownBsObj = new bootstrap.Dropdown(this._menuElem);
	// Prevent clicks on the menu items from propagating all the way
	// down to the page owning the menu
	this._rootElem.addEventListener("click",
		function(ev) {
			ev.stopPropagation();
			// Since the click doesn't propagate, the menu won't close by itself when
			// clicked (?). Actually not sure this is the real root cause, but calling
			// the next function fixes the problem.
			this._dropdownBsObj.hide();
		}.bind(this),
		false);
},

// Pass as "dateData" any format accepted by dayjs(dateData)
_formatDate: function(dateData) {
	let dateObj = dayjs(dateData);
	return dateObj.fromNow() + " (" +
				// "Fri, Jun 9 2017 at 3:45PM" (in local time)
				dateObj.format("ddd, MMM D YYYY [at] h:mmA") + ")";
},

appendDivider: function() {
	this.append(Classes.HtmlViewer.create(`<li><hr class="dropdown-divider"></li>`));
},

// hide() and show() are already taken to implement a different function in Viewer, so let's
// use other verbs
close: function() {
	this._dropdownBsObj.hide();
},

open: function() {
	this._dropdownBsObj.show();
},

}); // Classes.MenuViewer


// CLASS MenuItemViewer
//
Classes.MenuItemViewer = Classes.Viewer.subclass({
	__idPrefix: "MenuItemViewer",

	_rootElem: null,
	// This class uses a body element different from the _rootElem
	_bodyElem: null,

	_options: null,
	_actionFn: null,

// "options.label" accepts HTML, while "options.labelText" expects only text (and will escape
// it using setText()). They should be mutually exclusive, if both are non-null/non-empty the
// logic below prioritizes "options.label".
// "options.actionFn" is optional, you can set it later with setAction().
_init: function(options) {
	// Overriding the parent class' _init(), but calling that original function first
	Classes.Viewer._init.call(this);

	this.debug();

	// Don't store "options" as-is, create a copy (and while you're doing it, initialize all
	// the fields you need)
	this._options = {};
	this._options.label = optionalWithDefault(options.label, "");
	this._options.labelText = optionalWithDefault(options.labelText, "");
	this._options.actionFn = optionalWithDefault(options.actionFn, null);
	this._options.extraClasses = optionalWithDefault(options.extraClasses, []);

	this._renderMenuItem();

	this._actionFn = null;
	if(this._options.actionFn != null) {
		// Internally setAction() changes _actionFn
		this.setAction(this._options.actionFn);
	}
},

_renderMenuItem: function() {
	const bodyId = this._id;

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
	let itemClasses = [ "dropdown-item", "tm-dropdown-item" ];
	itemClasses.push(...this._options.extraClasses);

	// "position-relative" is needed to support the checkmark of .tm-dropdown-item.tm-selected::before,
	// which uses "position: absolute".
	const rootHtml = `
		<li class="position-relative">
			<div id="${bodyId}" class="${itemClasses.join(" ")}"></div>
		</li>
	`;

	this._rootElem = this._elementGen(rootHtml);
	this._bodyElem = this.getElementById(bodyId);

	if(this._options.label != "") {
		this.setHtml(this._options.label);
	} else {
		if(this._options.labelText != "") {
			// Use setText() instead of inserting the label directly in the menu, to avoid the
			// risk of HTML injection
			this.setText(this._options.labelText);
		}
	}
},

setAction: function(fn) {
	if(this._actionFn != null) {
		this._bodyElem.removeEventListener("click", this._actionFn, false);
	}
	this._actionFn = fn;
	this._bodyElem.addEventListener("click", this._actionFn, false);
},

selected: function(flag) {
	flag = optionalWithDefault(flag, true);
	if(flag) {
		this._bodyElem.classList.add("tm-selected");
		this._bodyElem.setAttribute("aria-current", "true");
	} else {
		this._bodyElem.classList.remove("tm-selected");
		this._bodyElem.removeAttribute("aria-current");
	}
},

// Enable/disable the menu item, as controlled by "flag" (optional, default "enable")
enable: function(flag) {
	flag = optionalWithDefault(flag, true);
	if(flag) {
		this._bodyElem.classList.remove("disabled");
	} else {
		this._bodyElem.classList.add("disabled");
	}
}

}); // Classes.MenuItemViewer


// CLASS TileTabMenuViewer
//
Classes.TileTabMenuViewer = Classes.MenuViewer.subclass({
	__idPrefix: "TileTabMenuViewer",

	_tab: null,

	// Track here all the menu item viewers
	_titleMenuItem: null,
	_pinMenuItem: null,
	_unpinByBookmarkMenuItem: null,
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
		menuExtraClasses: [ "tm-dropdown-tile-menu" ],
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
			let options = {
				labelText: "Move tab to match shortcut " + sm.keyToUiString(key),
				actionFn: this._actionSetCandidateCb.bind(this, key),
			};
			let item = Classes.MenuItemViewer.create(options);
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
	let options = {
		actionFn: this._actionActivateCb.bind(this),
		// Override Bootstrap's "dropdown-item", which has "white-space: nowrap;" (i.e. "text-nowrap").
		extraClasses: [ "text-wrap" ],
	};
	this._titleMenuItem = Classes.MenuItemViewer.create(options);
	this._titleMenuItem.setHtml("<b>" + this._safeText(this._tab.title) + "</b>");
	this.append(this._titleMenuItem);

	options = {
		labelText: this._tab.pinned ? "Unpin" : "Pin",
		actionFn: this._actionPinToggleCb.bind(this),
	};
	this._pinMenuItem = Classes.MenuItemViewer.create(options);
	this.append(this._pinMenuItem);

	options = {
		labelText: "Unpin bookmark",
		actionFn: this._actionUnpinByBookmarkCb.bind(this),
	};
	this._unpinByBookmarkMenuItem = Classes.MenuItemViewer.create(options);
	if(this._tab.pinInherited == null) {
		this._unpinByBookmarkMenuItem.hide();
	}
	this.append(this._unpinByBookmarkMenuItem);

	options = {
		labelText: this._tab.mutedInfo.muted ? "Unmute" : "Mute",
		actionFn: this._actionMuteToggleCb.bind(this),
	};
	this._muteMenuItem = Classes.MenuItemViewer.create(options);
	this.append(this._muteMenuItem);

	options = {
		labelText: this._tab.highlighted ? "Remove highlight" : "Highlight",
		actionFn: this._actionHighlightToggleCb.bind(this),
	};
	this._highlightMenuItem = Classes.MenuItemViewer.create(options);
	// The next check is commented out because actually you can remove highlight for
	// an active tab. It only seems to take no action when there's only one highlighted
	// tab, but if there are multiple highlighted tabs, then taking the action on the
	// active+highlighted tab will switch the active tab to another tab in the remaining
	// set of highlighted tabs. So disabling the menu item here would only make sense
	// if we knew that there's only one highlighted tab in the current window, but that's
	// a bit expensive to calculate for every tile, if we wanted to have that info we would
	// need to store it per window, and track it separately from the menu rendering logic.
//	if(this._tab.active) {
//		// When a tab is "active", the "highlighted" property is automatically set and
//		// it can't be unset
//		this._highlightMenuItem.enable(false);
//	}
	this.append(this._highlightMenuItem);

//	options = {
//		labelText: "Toggle play",
//		actionFn: this._actionPlayToggleCb.bind(this),
//	};
//	this._playMenuItem = Classes.MenuItemViewer.create(options);
//	this.append(this._playMenuItem);

	options = {
		labelText: "Move to least tabbed window",
		actionFn: this._actionMoveToLeastTabbedCb.bind(this),
	};
	this._moveToLeastTabbedMenuItem = Classes.MenuItemViewer.create(options);
	this.append(this._moveToLeastTabbedMenuItem);

	options = {
		labelText: "Suspend (discard from memory)",
		actionFn: this._actionSuspendCb.bind(this),
	};
	this._suspendMenuItem = Classes.MenuItemViewer.create(options);
	if(this._tab.discarded || this._tab.status == "unloaded") {
		// No point in offering an option to suspend a tab that's already suspended or unloaded.
		// Note that we hide() this._unpinByBookmarkMenuItem, but we only disable this menu
		// item instead. The difference is that this._unpinByBookmarkMenuItem is a lot more
		// "stable" than this menu item, this menu item can change back and forth, so it's
		// good to let users always be aware it exists, it's just not available right now.
		this._suspendMenuItem.enable(false);
	}
	this.append(this._suspendMenuItem);

	options = {
		labelText: "Close",
		actionFn: this._actionCloseCb.bind(this),
	};
	this._closeMenuItem = Classes.MenuItemViewer.create(options);
	this.append(this._closeMenuItem);

	this._setShortcutMenuItems();
},

_updateMenuItems: function() {
	this._titleMenuItem.setHtml("<b>" + this._safeText(this._tab.title) + "</b>");
	this._pinMenuItem.setText(this._tab.pinned ? "Unpin" : "Pin");

	if(this._tab.pinInherited != null) {
		this._unpinByBookmarkMenuItem.show();
	} else {
		this._unpinByBookmarkMenuItem.hide();
	}

	if(this._tab.discarded || this._tab.status == "unloaded") {
		// No point in offering an option to suspend a tab that's already suspended or unloaded
		this._suspendMenuItem.enable(false);
	} else {
		this._suspendMenuItem.enable();
	}

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

_actionUnpinByBookmarkCb: function(ev) {
	const logHead = "TileTabMenuViewer::_actionUnpinByBookmarkCb(" + this._tab.id + "): ";
	settingsStore.unpinBookmark(this._tab.pinInherited.id);
	this._log(logHead + "completed");
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
	chromeUtils.discardTab(this._tab);
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
	_pinMenuItem: null,
	_deleteMenuItem: null,

_init: function(bm) {
	// Overriding the parent class' _init(), but calling that original function first
	Classes.MenuViewer._init.call(this);

	this.debug();
	this._bm = bm;

	this._assert(this._bm.tm.type == Classes.NormalizedTabs.type.BOOKMARK);
	
	this._initMenuItems();
},

_renderSubtitleHtml: function(folder) {
	let createdText = this._formatDate(this._bm.dateAdded);

	let typeHtml = "Bookmark";
	if(this._bm.unmodifiable != null) {
		typeHtml = `Read-only bookmark (reason: "${this._safeText(this._bm.unmodifiable)}")`;
	}

	return `
	${typeHtml} at <i>${folder}</i><br>Created ${createdText}
	`;
},

_renderTitle: function() {
	const titleId = this._id + "-title";
	const subtitleId = this._id + "-subtitle";

	let titleHtml = `
		<div id="${titleId}"></div>
		<div id="${subtitleId}"></div>
	`;

	this._titleMenuItem = Classes.MenuItemViewer.create({ actionFn: this._actionActivateCb.bind(this) });
	this._titleMenuItem.setHtml(titleHtml);
	this.append(this._titleMenuItem);

	this._titleElem = this.getElementById(titleId);
	this._subtitleElem = this.getElementById(subtitleId);

	this._updateTitleMenuItem();
},

_updateTitleMenuItem: function() {
	this._titleElem.innerHTML = `<b>${this._safeText(this._bm.title)}</b>`;

	let folder = this._bm.tm.folder;
	if(folder != "") {
		this._subtitleElem.innerHTML = this._renderSubtitleHtml(folder);
		return;
	}

	folder = bookmarksManager.getBmFolderSync(this._bm);
	if(folder != null) {
		this._subtitleElem.innerHTML = this._renderSubtitleHtml(folder);
		return;
	}

	// If we get here, the sync version of getBmPathList didn't have all the data
	// to provide the full folder set, we need to rely on the async version instead
	bookmarksManager.getBmFolderAsync(this._bm).then(
		function(folder) {
			this._subtitleElem.innerHTML = this._renderSubtitleHtml(folder);
		}.bind(this)
	);
},

_initMenuItems: function() {
	this._renderTitle();

	let options = null;

	if(this._bm.parentId != null) {
		options = {
			labelText: "Open folder in Chrome Bookmark manager",
			actionFn: this._actionBookmarkManagerCb.bind(this),
		};
		this._openBookmarkManagerMenuItem = Classes.MenuItemViewer.create(options);
		this.append(this._openBookmarkManagerMenuItem);
	}

	options = {
		labelText: this._bm.pinned ? "Unpin" : "Pin",
		actionFn: this._actionPinToggleCb.bind(this),
	};
	this._pinMenuItem = Classes.MenuItemViewer.create(options);
	this.append(this._pinMenuItem);

	// Can't delete an unmodifiable bookmark
	if(this._bm.unmodifiable == null) {
		options = {
			labelText: "Delete",
			actionFn: this._actionDeleteCb.bind(this),
		};
		this._deleteMenuItem = Classes.MenuItemViewer.create(options);
		this.append(this._deleteMenuItem);
	}
},

_updateMenuItems: function() {
	this._updateTitleMenuItem();
	this._pinMenuItem.setText(this._bm.pinned ? "Unpin" : "Pin");
	// Nothing to update for _deleteMenuItem
},

_actionActivateCb: function(ev) {
	Classes.TabsBsTabViewer.activateTab(this._bm);
},

_actionBookmarkManagerCb: function(ev) {
	let url = "chrome://bookmarks/?id=" + this._bm.parentId;
	chromeUtils.loadUrl(url);
},

_actionPinToggleCb: function(ev) {
	const logHead = "TileBookmarkMenuViewer::_actionPinToggleCb(" + this._bm.id + "): ";

	if(this._bm.pinned) {
		this._log(logHead + "unpinning");
		// Note that we need to use the "bookmarkId" field, not the "id" field, to
		// call settingsStore.pinBookmark()
		settingsStore.unpinBookmark(this._bm.bookmarkId);
	} else {
		this._log(logHead + "pinning");
		settingsStore.pinBookmark(this._bm.bookmarkId);
	}
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

	this._titleMenuItem = Classes.MenuItemViewer.create({ actionFn: this._actionActivateCb.bind(this) });
	this._titleMenuItem.setHtml(titleHtml);
	this.append(this._titleMenuItem);

	this._titleElem = this.getElementById(titleId);
	this._subtitleElem = this.getElementById(subtitleId);

	this._updateTitleMenuItem();
},

_updateTitleMenuItem: function() {
	this._titleElem.innerHTML = `<b>${this._safeText(this._item.title)}</b>`;
	let visitsCnt = this._item.visitCount + this._item.typedCount;
	let lastVisited = this._formatDate(this._item.lastVisitTime);

	let midString = `${visitsCnt} times, last`;
	if(visitsCnt == 1) {
		midString = "once";
	}
	this._subtitleElem.innerHTML = `History item, visited ${midString} ${lastVisited}`;
},

_initMenuItems: function() {
	this._renderTitle();

	let options = {
		labelText: "Delete",
		actionFn: this._actionDeleteCb.bind(this),
	};
	this._deleteMenuItem = Classes.MenuItemViewer.create(options);
	this.append(this._deleteMenuItem);
},

_updateMenuItems: function() {
	this._updateTitleMenuItem();
	// Nothing to update for _deleteMenuItem
},

_actionActivateCb: function(ev) {
	Classes.TabsBsTabViewer.activateTab(this._item);
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
