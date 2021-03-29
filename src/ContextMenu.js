// CLASS ContextMenu
//
Classes.ContextMenu = Classes.Base.subclass({

	_allMenuItems: null,

	_updateAllSerialPromises: null,

_init: function() {
	// Overriding the parent class' _init(), but calling that original function first
	Classes.Base._init.call(this);

// This callback is not needed, we can manage with just the "onclick" within each menu item
//	// https://developer.chrome.com/docs/extensions/reference/contextMenus/#event-onClicked
//	chrome.contextMenus.onClicked.addListener(this._onClickedCb.bind(this));

	this._updateAllSerialPromises = Classes.SerialPromises.createAs("ContextMenu::_updateAllSerialPromises");
	this._updateAllSerialPromises.next(this._updateAllMenuItems.bind(this, "init"), "init");

	settingsStore.getShortcutsManager().addEventListener(Classes.EventManager.Events.UPDATED, this._onShortcutUpdatedCb.bind(this));
},

_blinkPopupIconBadge: async function(tabId) {
	const logHead = "ContextMenu::_blinkPopupIconBadge(" + tabId + ")";

	let origColorArray = await chromeUtils.wrap(chrome.browserAction.getBadgeBackgroundColor, logHead, { tabId: tabId });
	let setBadgeBgColor = chrome.browserAction.setBadgeBackgroundColor;
	for(let i = 0; i < 3; i++) {
		await chromeUtils.wrap(setBadgeBgColor, logHead, { tabId: tabId, color: "#FF0000" });
		await delay(150);
		await chromeUtils.wrap(setBadgeBgColor, logHead, { tabId: tabId, color: origColorArray });
		await delay(150);
	}
},

_moveToLeastTabbedCb: function(itemData, tab) {
	const logHead = "ContextMenu::_moveToLeastTabbedCb(): ";

	this._log(logHead + "entering", itemData, tab);
	chromeUtils.moveTabToLeastTabbedWindow(tab, true);

	// This is the only action that can decide to do nothing, so we need some
	// extra visual feedback to let the user know we heard the click, but there
	// was nothing to do
	this._blinkPopupIconBadge(tab.id);
},

_openInLeastTabbedCb: function(itemData, tab) {
	const logHead = "ContextMenu::_openInLeastTabbedCb(): ";

	if(itemData.linkUrl == null) {
		this._err(logHead + "no link URL, nothing to do", itemData, tab);
		return;
	}

	this._log(logHead + "entering", itemData, tab);

	chromeUtils.loadUrl(itemData.linkUrl);
},

_searchPopupCb: function(itemData, tab) {
	const logHead = "ContextMenu::_searchPopupCb(): ";
	this._log(logHead + "entering", itemData, tab);
	popupDockerBg.runPopupSearch(itemData.selectionText);
},

_searchCb: function(shortcutKey, itemData, tab) {
	const logHead = "ContextMenu::_searchCb(shortcutKey: " + shortcutKey + "): ";

	if(itemData.selectionText == null || itemData.selectionText == "") {
		this._log(logHead + "no text selected, nothing to do", itemData, tab);
		return;
	}

	this._log(logHead + "entering", itemData, tab);

	if(shortcutKey == null) {
		// Launch/search case
		keyboardShortcuts.launchOrSearch(itemData.selectionText);
		return;
	}

	let scInfo = settingsStore.getShortcutsManager().getShortcutInfo(shortcutKey);
	keyboardShortcuts.runCustomShortcutSearch(scInfo, itemData.selectionText);
},

_addAllMenuItems: function(allMenuItems) {
	let promisesList = [];

	allMenuItems.forEach(
		function(menuItem) {
			const logHead = "ContextMenu::_addAllMenuItems().iter(" + menuItem.id + "): ";
			promisesList.push(chromeUtils.wrap(chrome.contextMenus.create, logHead, menuItem));
		}.bind(this)
	);

	return Promise.all(promisesList);
},

_defineSelectionMenuItems: function() {
	let allSelectionMenuItems = [
		{
			id: "launchOrSearch",
			title: "Launch or search",
			contexts: [ "selection" ],
			onclick: this._searchCb.bind(this, null)
		}
	];

	let sm = settingsStore.getShortcutsManager();
	let searchKeys = sm.getSearchShortcutKeys();

	// "searchKeys" includes only "real URL-based search" shortcuts, not the
	// TabMania search case. We need to add the TabMania search separately at
	// the bottom of the list of menu items below
	searchKeys.forEach(
		function(key) {
			let shortcutTitle = sm.getShortcutTitle(key);
			let title = "";

			if(shortcutTitle != "") {
				title = "Search with " + shortcutTitle + " (" + sm.keyToUiString(key) + ")";
			} else {
				title = "Search with sm.keyToUiString(key) (no title assigned)";
			}

			allSelectionMenuItems.push({
				id: key,
				title: title,
				contexts: [ "selection" ],
				onclick: this._searchCb.bind(this, key)
			});
		}.bind(this)
	);

	allSelectionMenuItems.push({
		id: "tabManiaSearch",
		title: "Search tabs in TabMania",
		contexts: [ "selection" ],
		onclick: this._searchPopupCb.bind(this)
	});

	return allSelectionMenuItems;
},

_defineAllMenuItems: function() {
	const logHead = "ContextMenu::_defineAllMenuItems(): ";

	let allMenuItems = [ 
		{
			id: "moveToLeastTabbed",
			title: "Move this tab to least tabbed window",
			contexts: [ "page" ],
			onclick: this._moveToLeastTabbedCb.bind(this)
		},
		{
			id: "openInLeastTabbed",
			title: "Open in least tabbed window",
			contexts: [ "link" ],
			onclick: this._openInLeastTabbedCb.bind(this)
		},
	]

	return allMenuItems.concat(this._defineSelectionMenuItems());
},

// Note that the documentation seems to be wrong, it claims the event doesn't take any
// input parameter, but that's not possible, and in fact the samples show a parameter:
// https://github.com/GoogleChrome/chrome-extensions-samples/blob/main/apps/samples/context-menu/main.js
// Update: discovered it takes two parameters (itemData and tab, like the "onclick" callback
// used in chrome.contextMenus.create()).
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

//_onClickedCb: function(itemData, tab) {
//	const logHead = "ContextMenu::_onClickedCb(): ";
//	this._log(logHead + "entering", arguments);
//},

_updateAllMenuItems: function(debugInfo) {
	const logHead = "ContextMenu::_updateAllMenuItems(" + debugInfo + "): ";

	return chromeUtils.wrap(chrome.contextMenus.removeAll, logHead).then(
		function() {
			this._log(logHead + "menus cleared, building them again");

			this._allMenuItems = this._defineAllMenuItems();
			return this._addAllMenuItems(this._allMenuItems);
		}.bind(this)
	);
},

_onShortcutUpdatedCb: function(ev) {
	let key = ev.detail.key;
	const logHead = "ContextMenu::_onShortcutUpdatedCb(" + key + "): ";

	this._log(logHead + "entering");

	// We don't have a lot of menu items, rather than going through the trouble of
	// figuring out which items have been removed (shortcut deleted or removed search
	// option), or have been modified (title changed), let's just delete all and add
	// all again...
	this._updateAllSerialPromises.next(this._updateAllMenuItems.bind(this, key), key);
},


}); // Classes.ContextMenu
