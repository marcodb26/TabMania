// CLASS ContextMenu
//
Classes.ContextMenu = Classes.Base.subclass({

	// Dictionary of click handlers for all menu items, keyed by menu item ID
	_menuItemsClickFns: null,

_init: function() {
	// Overriding the parent class' _init(), but calling that original function first
	Classes.Base._init.call(this);

	this._menuItemsClickFns = [];

	// https://developer.chrome.com/docs/extensions/reference/contextMenus/#event-onClicked
	chrome.contextMenus.onClicked.addListener(this._onClickedCb.bind(this));

	this._addAll();
},

_addMenuItem: function(createProps, fnCb) {
	const logHead = "ContextMenu::_addMenuItem(): ";
	this._menuItemsClickFns[createProps.id] = {
		fn: fnCb
	}
	chromeUtils.wrap(chrome.contextMenus.create, logHead, createProps);
},

_moveToLeastTabbedCb: function(itemData) {
	const logHead = "ContextMenu::_moveToLeastTabbedCb(): ";

	if(itemData.pageUrl == null) {
		this._err(logHead + "no page URL, nothing to do", itemData);
		return;
	}

	this._log(logHead + "entering", itemData);

	// itemData gives you pageUrl, but what if you have 10 pages showing the same URL?
	// Search only in the current window, and find only the active tab...
	let queryInfo = {
		url: itemData.pageUrl,
		currentWindow: true,
		active: true,
	};

	chromeUtils.wrap(chrome.tabs.query, logHead, queryInfo).then(
		function(tabs) {
			if(tabs.length == 0) {
				chromeUtils.wrap(chrome.windows.getCurrent, logHead, null).then(
					function(window) {
						this._err(logHead + "tab not found in window " + window.id, itemData);
					}.bind(this)
				);
				return;
			}
			this._assert(tabs.length == 1, logHead + "more than one active tab in one window?");

			return chromeUtils.moveTabToLeastTabbedWindow(tabs[0]);
		}.bind(this)
	);
},

_openInLeastTabbedCb: function(itemData) {
	const logHead = "ContextMenu::_openInLeastTabbedCb(): ";

	if(itemData.linkUrl == null) {
		this._err(logHead + "no link URL, nothing to do", itemData);
		return;
	}

	this._log(logHead + "entering", itemData);

	chromeUtils.loadUrl(itemData.linkUrl);
},

_searchCb: function(shortcutKey, itemData) {
	const logHead = "ContextMenu::_searchCb(shortcutKey: " + shortcutKey + "): ";

	if(itemData.selectionText == null || itemData.selectionText == "") {
		this._log(logHead + "no text selected, nothing to do", itemData);
		return;
	}

	this._log(logHead + "entering", itemData);

	if(shortcutKey == null) {
		// Launch/search case
		keyboardShortcuts.launchOrSearch(itemData.selectionText);
		return;
	}

	let scInfo = settingsStore.getShortcutsManager().getShortcutInfo(shortcutKey);
	keyboardShortcuts.runCustomShortcutSearch(scInfo, itemData.selectionText);
},

_addAll: function() {
	const logHead = "ContextMenu::_addAll(): ";

	let createProps = {
		id: "moveToLeastTabbed",
		title: "Move this tab to least tabbed window",
		contexts: [ "page" ]
	};
	this._addMenuItem(createProps, this._moveToLeastTabbedCb.bind(this));

	createProps = {
		id: "openInLeastTabbed",
		title: "Open in least tabbed window",
		contexts: [ "link" ]
	};
	this._addMenuItem(createProps, this._openInLeastTabbedCb.bind(this));

	createProps = {
		id: "launchOrSearch",
		title: "Launch or search",
		contexts: [ "selection" ]
	};
	this._addMenuItem(createProps, this._searchCb.bind(this, null));

	let searchKeys = settingsStore.getShortcutsManager().getSearchShortcutKeys();

	searchKeys.forEach(
		function(key) {
			let createProps = {
				id: key,
				title: "Search with shortcut key " + key,
				contexts: [ "selection" ]
			};
			this._addMenuItem(createProps, this._searchCb.bind(this, key));
			
		}.bind(this)
	);
},

// Note that the documentation seems to be wrong, it claims the event doesn't take any
// input parameter, but that's not possible, and in fact the samples show a parameter:
// https://github.com/GoogleChrome/chrome-extensions-samples/blob/main/apps/samples/context-menu/main.js
// See also for explanation of the context types: https://stackoverflow.com/a/31379357/10791475
//
// "itemData" for selection (ContextType "selection") includes:
//   editable: false
//   frameId: 0
//   menuItemId: "test"
//   pageUrl: "https://github.com/GoogleChrome/chrome-extensions-samples/blob/main/apps/samples/context-menu/main.js"
//   selectionText: "enus used in the app"
//
// "itemData" for links (ContextType "link") includes:
//   editable: false
//   frameId: 0
//   linkUrl: "https://policies.google.com/technologies/cookies"
//   menuItemId: "test"
//   pageUrl: "https://developer.chrome.com/docs/extensions/reference/contextMenus/#type-ContextType"
//
// "itemData" for youtube videos (note that you need to right click twice to get to the right
// menu, the first time you get to a youtube menu) (ContextType "video") includes:
//   frameId: 0
//   mediaType: "video"
//   menuItemId: "test"
//   pageUrl: "https://www.youtube.com/watch?v=-7jjo8UICjQ"
//   srcUrl: "blob:https://www.youtube.com/9e338607-4bbd-48a1-8595-c9ab11d43f74"
//
// "itemData" for images (ContextType "image") includes:
//   editable: false
//   frameId: 0
//   linkUrl: "https://en.wikipedia.org/wiki/File:ESA_Headquarters_in_Paris,_France.JPG"
//   mediaType: "image"
//   menuItemId: "test"
//   pageUrl: "https://en.wikipedia.org/wiki/European_Space_Agency"
//   srcUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6d/ESA_Headquarters_in_Paris%2C_France.JPG/330px-ESA_Headquarters_in_Paris%2C_France.JPG"
//
// "itemData" for an input box (ContextType "editable") includes:
//   editable: true
//   frameId: 0
//   menuItemId: "test"
//   pageUrl: "https://stackoverflow.com/questions/31366938/chrome-contextmenus-api-contexttype"
// It doesn't seem very useful as it doesn't tell you which input was in focus, but you can
// probably search for the element with focus to find out. It also doesn't tell you what text
// is currently in that info, but probably same answer, find what's in focus and figure it out

_onClickedCb: function(itemData) {
	const logHead = "ContextMenu::_onClickedCb(): ";
	this._log(logHead + "entering", itemData);

	this._menuItemsClickFns[itemData.menuItemId].fn(itemData);
},

}); // Classes.ContextMenu