// CLASS TabTileMenuViewer
//
Classes.TabTileMenuViewer = Classes.MenuViewer.subclass({
	__idPrefix: "TabTileMenuViewer",

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

	this._assert(this._tab.tm.type == Classes.TabNormalizer.type.TAB);
	
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
	const logHead = "TabTileMenuViewer::_updateShortcutMenuItems(" + this._tab.id + "): ";
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
	if(this._tab.tm.pinInherited == null) {
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

	if(this._tab.tm.pinInherited != null) {
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
	Classes.TabsBsTabViewer.activateTab(this._tab);
},

_actionPinToggleCb: function(ev) {
	const logHead = "TabTileMenuViewer::_actionPinToggleCb(" + this._tab.id + "): ";
	chromeUtils.wrap(chrome.tabs.update, logHead,
					this._tab.id, { pinned: !this._tab.pinned } ).then(
		function() {
			this._log(logHead + "completed");
		}.bind(this)
	);
},

_actionUnpinByBookmarkCb: function(ev) {
	const logHead = "TabTileMenuViewer::_actionUnpinByBookmarkCb(" + this._tab.id + "): ";
	settingsStore.unpinBookmark(this._tab.tm.pinInherited.id);
	this._log(logHead + "completed");
},

_actionMuteToggleCb: function(ev) {
	const logHead = "TabTileMenuViewer::_actionMuteToggleCb(" + this._tab.id + "): ";
	chromeUtils.wrap(chrome.tabs.update, logHead,
					this._tab.id, { muted: !this._tab.mutedInfo.muted } ).then(
		function() {
			this._log(logHead + "completed");
		}.bind(this)
	);
},

_actionHighlightToggleCb: function(ev) {
	const logHead = "TabTileMenuViewer::_actionHighlightToggleCb(" + this._tab.id + "): ";
	chromeUtils.wrap(chrome.tabs.update, logHead,
					this._tab.id, { highlighted: !this._tab.highlighted } ).then(
		function() {
			this._log(logHead + "completed");
		}.bind(this)
	);
},

_actionPlayToggleCb: function(ev) {
	const logHead = "TabTileMenuViewer::_actionPlayToggleCb(" + this._tab.id + "): ";
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
	const logHead = "TabTileMenuViewer::_actionMoveToLeastTabbedCb(" + this._tab.id + "): ";
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
	const logHead = "TabTileMenuViewer::_actionCloseCb(" + this._tab.id + "): ";
	chromeUtils.wrap(chrome.tabs.remove, logHead, this._tab.id).then(
		function() {
			this._log(logHead + "completed");
		}.bind(this)
	);
},

_actionSetCandidateCb: function(key, ev) {
	const logHead = "TabTileMenuViewer::_actionSetCandidateCb(" + this._tab.id + ", " + key + "): ";

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

}); // Classes.TabTileMenuViewer


// CLASS BookmarkTileMenuViewer
//
Classes.BookmarkTileMenuViewer = Classes.MenuViewer.subclass({
	__idPrefix: "BookmarkTileMenuViewer",

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

	this._assert(this._bm.tm.type == Classes.TabNormalizer.type.BOOKMARK);
	
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
	const logHead = "BookmarkTileMenuViewer::_actionPinToggleCb(" + this._bm.id + "): ";

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
	const logHead = "BookmarkTileMenuViewer::_actionDeleteCb(" + this._bm.id + "): ";
	// Note that we need to use "_bm.bookmarkId", not "_bm.id", because we've modified
	// "_bm.id", and if we used it, Chrome would respond with:
	// ChromeUtils::wrap().cb: BookmarkTileMenuViewer::_actionDeleteCb(b945): chrome.runtime.lastError = Bookmark id is invalid.
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

}); // Classes.BookmarkTileMenuViewer


// CLASS HistoryTileMenuViewer
//
Classes.HistoryTileMenuViewer = Classes.MenuViewer.subclass({
	__idPrefix: "HistoryTileMenuViewer",

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

	this._assert(this._item.tm.type == Classes.TabNormalizer.type.HISTORY);
	
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
	const logHead = "HistoryTileMenuViewer::_actionDeleteCb(" + this._item.url + "): ";
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

}); // Classes.HistoryTileMenuViewer
