// CLASS MultiSelectPanelViewer

Classes.MultiSelectPanelViewer = Classes.Viewer.subclass({
	__idPrefix: "MultiSelectPanelViewer",

	_active: null,

	// ELW = EventListenersWrapper
	_elw: null,
	_tabsElw: null,

	_eventManager: null,

	_tabsManager: null,
	_historyFinder: null,
	_incognitoBsTab: null,

	_tabsStoreAll: null,
	_tabsStoreInView: null,

	_refreshBookmarksJob: null,
	// Delay before a full bookmarks update. Use this to avoid causing too many bookmark updates
	// when a multi-select action is taken
	_refreshBookmarksDelay: 200,

	_cntAllElem: null,
	_cntInViewElem: null,
	_selectElem: null,
	_menuElem: null,
	_listCheckboxElem: null,
	_closeElem: null,

	_menuViewer: null,

// We use the "tabsManager" to get up-to-date information about "real tabs" when deciding
// what actions to take. The problem is that the _tabsStore* of instances of this class
// don't always get refreshed as the status of the corresponding tabs changes. Some do
// (those that are currently "in view"), some don't (those that are not in view).
_init: function({ tabsManager, historyFinder, incognitoBsTab }) {
	// Overriding the parent class' _init(), but calling that original function first
	Classes.Viewer._init.call(this);

	this.debug();

	this._tabsStoreAll = Classes.TabsStoreBase.createAs(this.getId() + ".tabsStoreAll");
	this._tabsStoreInView = Classes.TabsStoreBase.createAs(this.getId() + ".tabsStoreInView");
	this._active = false;

	this._elw = Classes.EventListenersWrapper.create();
	this._tabsElw = Classes.EventListenersWrapper.create();

	this._eventManager = Classes.EventManager.createAs(this.getId() + ".eventManager");
	this._eventManager.attachRegistrationFunctions(this);

	this._refreshBookmarksJob = Classes.ScheduledJob.createAs(this._id +  ".refreshBookmarksJob",
															this._refreshBookmarks.bind(this));
	this._refreshBookmarksJob.debug();

	this._tabsManager = tabsManager;
	this._historyFinder = historyFinder;
	this._incognitoBsTab = incognitoBsTab;

	this._renderPanel();
	this.activate(false);
},

_setTabsListeners: function() {
	const logHead = "MultiSelectPanelViewer._setTabsListeners():";
	this._assert(this._tabsManager.isInitialized(), logHead);

	// Classes.TabsManager.Events.CREATED can't impact the selection
	this._tabsElw.listen(this._tabsManager, Classes.TabsManager.Events.REMOVED, this._tabRemovedCb.bind(this));
	this._tabsElw.listen(this._tabsManager, Classes.TabsManager.Events.UPDATED, this._tabUpdatedCb.bind(this));

	this._tabsElw.listen(bookmarksManager, Classes.EventManager.Events.UPDATED, this._bookmarkUpdatedCb.bind(this));

	if(this._historyFinder != null) {
		this._tabsElw.listen(this._historyFinder, Classes.EventManager.Events.UPDATED, this._historyUpdatedCb.bind(this));
	}

},

_tabRemovedCb: function(ev) {
	const logHead = "MultiSelectPanelViewer._tabRemovedCb():";
	this._log(logHead, "entering", ev.detail.tab.id, ev.detail);
	this.removeTab(ev.detail.tab);
},

_tabUpdatedCbInner: function(tab) {
	this._tabsStoreAll.update(tab);

	if(this._tabsStoreInView.hasById(tab.id)) {
		this._tabsStoreInView.update(tab);
	}
},

_tabUpdatedCb: function(ev) {
	const logHead = "MultiSelectPanelViewer._tabUpdatedCb():";

	let changed = 0;

	for(let i = 0; i < ev.detail.tabs.length; i++) {
		let tab = ev.detail.tabs[i];

		if(!this._tabsStoreAll.hasById(tab.id)) {
			// If it's not in _tabsStoreAll, it can't be in _tabsStoreInView
			continue;
		}

		this._tabUpdatedCbInner(tab);
		changed++;
	}

	this._log(logHead, "changed", changed, ev.detail);

	// No need to _updateCounts(), the count has not changed
},

_refreshBookmarks: function() {
	const logHead = "MultiSelectPanelViewer._refreshBookmarks():";

	let changed = 0;
	let removed = 0;

	let selectedTabs = this._tabsStoreAll.get();
	for(let i = 0; i < selectedTabs.length; i++) {
		let tab = selectedTabs[i];
		if(tab.tm.type != Classes.TabNormalizer.type.BOOKMARK) {
			continue;
		}
		let bm = bookmarksManager.getBmNode(tab.bookmarkId);

		if(bm == null) {
			this.removeTab(tab, false);
			removed++;
			continue;
		}

		this._tabUpdatedCbInner(bm);
		changed++;
	}

	this._log(logHead, "changed", changed, ", removed", removed);

	this._updateCounts();
},

_bookmarkUpdatedCb: function(ev) {
	const logHead = "MultiSelectPanelViewer._bookmarkUpdatedCb():";
	this._log(logHead, "entering", ev.detail);
	this._refreshBookmarksJob.run(this._refreshBookmarksDelay);
},

_refreshHistory: function(urls, removeAll) {
	const logHead = "MultiSelectPanelViewer._refreshHistory():";

	let removed = 0;

	// Create a shallow copy of the array, so we can edit the original array without
	// causing trouble to the iteration in this function
	let selectedTabs = [].concat(this._tabsStoreAll.get());

	this._log(logHead, "selectedTabs:", selectedTabs);

	for(let i = 0; i < selectedTabs.length; i++) {
		let tab = selectedTabs[i];
		// When a URL is removed from history, it's also removed from recent tabs.
		// If we didn't do this, a selected recent tab would remain active even
		// when it's been removed.
		if(![ Classes.TabNormalizer.type.HISTORY, Classes.TabNormalizer.type.RCTAB ].includes(tab.tm.type)) {
			//this._log(logHead, "skipping (other type)", tab);
			continue;
		}

		if(removeAll || urls.includes(tab.url)) {
			//this._log(logHead, "removing", tab);
			this.removeTab(tab, false);
			removed++;
		} else {
			//this._log(logHead, "keeping", tab);
		}
	}

	this._log(logHead, "removed", removed, "of", selectedTabs.length);

	this._updateCounts();
},

_historyUpdatedCb: function(ev) {
	const logHead = "MultiSelectPanelViewer._historyUpdatedCb():";

	if(ev.detail.event != Classes.HistoryFinder.event.REMOVED) {
		this._log(logHead, "ignoring event", ev.detail);
		return;
	}
	this._log(logHead, "entering", ev.detail.data.urls, ev.detail);

	// Unlike in the bookmarks case, we can't use a ScheduledJob here, because
	// ScheduledJob doesn't support accumulating parameters. We'd need to aggregate
	// the full list of "ev.detail.data.urls" across the multiple calls that are
	// getting rate-limited into a single call. We could implement that by tracking
	// the state in the MultiSelectPanelViewer itself, but that's not necessarily
	// very straightforward to do
	this._refreshHistory(ev.detail.data.urls, ev.detail.data.allHistory);
},

_renderPanel: function() {
	const cntInViewId = this._id + "-cnt-view";
	const cntAllId = this._id + "-cnt-all";
	const selectId = this._id + "-select";
	const menuId = this._id + "-menu";
	const listCheckboxId = this._id + "-list";
	const closeId = this._id + "-close";

	// Class .text-dark is needed explicitly because in the incognito BsTab that's not the default.
	// Note that we're initializing <span> of cntAllId to "-1" on purpose, to initialize properly
	// the state of the action menu items. See _updateCounts() for details.
	const bodyHtml = `
	<div class="card tm-cursor-default text-dark">
		<div class="d-flex align-items-center">
			<input id="${selectId}" class="form-check-input mt-0 ms-1" type="checkbox" value="" style="min-width: 1em;">
			<div id="${menuId}" class=""></div>
			<div>
				<input type="checkbox" class="btn-check" id="${listCheckboxId}" autocomplete="off">
				<label class="tm-btn tm-checkbox-btn me-2 tm-xxs-hide" for="${listCheckboxId}">${icons.list}</label>
			</div>
			<div class="flex-fill me-2 fst-italic fw-light"><span id="${cntAllId}">-1</span><span class="tm-xxs-hide"> total</span> (<span id="${cntInViewId}">-1</span><span class="tm-xxs-hide"> in view</span>)</div>
			<div>
				${icons.closeHtml(closeId, [ "ps-0" ], [ "tm-close-icon", "align-middle" ])}
			</div>
		</div>
	</div>
	`;

	this._rootElem = this._elementGen(bodyHtml);
	this._cntAllElem = this.getElementById(cntAllId);
	this._cntInViewElem = this.getElementById(cntInViewId);

	this._selectElem = this.getElementById(selectId);
	this._elw.listen(this._selectElem, "click", this._selectAllCb.bind(this), false);

	this._menuElem = this.getElementById(menuId);
	this._menuViewer = Classes.MultiSelectPanelMenuViewer.create();
	this._menuViewer.attachInParentElement(this._menuElem);
	this._elw.listen(this._menuViewer, Classes.MultiSelectPanelViewer.Events.CLOSED, this._forwardEventCb.bind(this), false);
	this._elw.listen(this._menuViewer, Classes.MultiSelectPanelViewer.Events.LISTED, this._forwardEventCb.bind(this), false);

	this._elw.listen(this._menuViewer, Classes.MultiSelectPanelMenuViewer.Events.TABSPINNED,
						this._tabsPinnedCb.bind(this), false);
	this._elw.listen(this._menuViewer, Classes.MultiSelectPanelMenuViewer.Events.TABSCLOSED,
						this._tabsClosedCb.bind(this), false);
	this._elw.listen(this._menuViewer, Classes.MultiSelectPanelMenuViewer.Events.TABSMOVED,
						this._tabsMovedCb.bind(this), false);

	this._listCheckboxElem = this.getElementById(listCheckboxId);
	this._elw.listen(this._listCheckboxElem, "click", this._listCb.bind(this), false);

	this._closeElem = this.getElementById(closeId);
	this._elw.listen(this._closeElem, "click", this._closeCb.bind(this), false);
},

_selectAllCb: function(ev) {
	const logHead = "MultiSelectPanelViewer._selectAllCb():";
	this._log(logHead, "entering", ev);
	this._eventManager.notifyListeners(Classes.MultiSelectPanelViewer.Events.SELECTED, { selected: this._selectElem.checked });
},

_forwardEventCb: function(ev) {
	const logHead = "MultiSelectPanelViewer._forwardEventCb():";
	this._log(logHead, "entering", ev);
	this._eventManager.notifyListeners(ev.type);
},

_listCb: function(ev) {
	const logHead = "MultiSelectPanelViewer._listCb():";
	this._log(logHead, "entering", ev);
	this._eventManager.notifyListeners(Classes.MultiSelectPanelViewer.Events.LISTED);
},

_closeCb: function(ev) {
	const logHead = "MultiSelectPanelViewer._closeCb():";
	this._log(logHead, "entering", ev);
	this._eventManager.notifyListeners(Classes.MultiSelectPanelViewer.Events.CLOSED);
},

_groupSelectedTabs: function() {
	let retVal = {};
	let selectedTabs = this._tabsStoreAll.get();

	if(selectedTabs == null) {
		// No tabs selected, nothing to do
		return retVal;
	}

	for(let i = 0; i < selectedTabs.length; i++) {
		let tab = selectedTabs[i];
		let tabList = retVal[tab.tm.type];
		if(tabList == null) {
			retVal[tab.tm.type] = tabList = [];
		}
		tabList.push(tab);
	}

	return retVal;
},

_tabsPinnedCb: function(ev) {
	const logHead = "MultiSelectPanelViewer._tabsPinnedCb():";

	let anyPinned = false;

	let tabGroups = this._groupSelectedTabs();
	let tabs = tabGroups[Classes.TabNormalizer.type.TAB] ?? [];
	let bookmarks = tabGroups[Classes.TabNormalizer.type.BOOKMARK] ?? [];

	// Exclude Classes.TabNormalizer.type.RCTAB and HISTORY, can't pin them
	if(tabs.length == 0 && bookmarks.length == 0) {
		this._log(logHead, "empty selection, nothing to do", tabGroups);
		return;
	}

	for(let i = 0; i < tabs.length && !anyPinned; i++) {
		if(tabs[i].pinned) {
			anyPinned = true;
		}
	}

	for(let i = 0; i < bookmarks.length && !anyPinned; i++) {
		if(bookmarks[i].pinned) {
			anyPinned = true;
		}
	}

	// Follow the same behavior of the multi-select checkbox: if any tabs/bookmarks
	// are already pinned, pick the "remove pin" action, while if they're all not
	// pinned, pick the "set pin" action
	this._log(logHead, anyPinned ? "unpinning" : "pinning", tabs, bookmarks);

	for(let i = 0; i < tabs.length; i++) {
		chromeUtils.wrap(chrome.tabs.update, logHead, tabs[i].id, { pinned: !anyPinned });
	}

	if(bookmarks.length == 0) {
		return;
	}

	let bmIds = bookmarks.map(bm => bm.bookmarkId);
	if(anyPinned) {
		settingsStore.unpinManyBookmarks(bmIds);
	} else {
		settingsStore.pinManyBookmarks(bmIds);
	}
},

_confirmClosing: function(tabGroups) {
	let tabCount = tabGroups[Classes.TabNormalizer.type.TAB]?.length;
	let bmCount = tabGroups[Classes.TabNormalizer.type.BOOKMARK]?.length;
	let historyCount = tabGroups[Classes.TabNormalizer.type.HISTORY]?.length;

	let outerList = [];

	if(tabCount != null) {
		outerList.push("close " + tabCount + " tab" + ( tabCount > 1 ? "s" : "" ));
	}

	let innerList = [];

	if(bmCount != null) {
		innerList.push(bmCount + " bookmark" + ( bmCount > 1 ? "s" : "" ))
	}
	if(historyCount != null) {
		innerList.push(historyCount + " history item" + ( historyCount > 1 ? "s" : "" ))
	}

	if(innerList.length > 0) {
		outerList.push("delete " + innerList.join(" and "));
	}

	let msg = "Are you sure you want to " + outerList.join(" and ") + "?";
	return window.confirm(msg);
},

_tabsClosedCb: function(ev) {
	const logHead = "MultiSelectPanelViewer._tabsClosedCb():";

	let tabGroups = this._groupSelectedTabs();

	// Exclude Classes.TabNormalizer.type.RCTAB, can't delete them
	if(tabGroups[Classes.TabNormalizer.type.TAB] == null &&
	   tabGroups[Classes.TabNormalizer.type.BOOKMARK] == null &&
	   tabGroups[Classes.TabNormalizer.type.HISTORY] == null) {
		this._log(logHead, "empty selection, nothing to do", tabGroups);
		return;
	}

	if(!this._confirmClosing(tabGroups)) {
		this._log(logHead, "the user cancelled the operation", tabGroups);
		return;
	}

	// Classes.TabNormalizer.type.TAB
	let tabs = tabGroups[Classes.TabNormalizer.type.TAB];

	if(tabs != null && tabs.length != 0) {
		let tabIds = tabs.map(tab => tab.id);
		this._log(logHead, "closing standard tabs", tabIds, tabs);
		chromeUtils.wrap(chrome.tabs.remove, logHead, tabIds);
	}

	// Classes.TabNormalizer.type.BOOKMARK
	tabs = tabGroups[Classes.TabNormalizer.type.BOOKMARK];

	if(tabs != null && tabs.length != 0) {
		this._log(logHead, "deleting bookmarks", tabs);
		for(let i = 0; i < tabs.length; i++) {
			chromeUtils.wrap(chrome.bookmarks.remove, logHead, tabs[i].bookmarkId);
			// In turn this loop will trigger bookmark events that will enqueue
			// a run of _refreshBookmarksJob. Hopefully this entire loop will end
			// before the _refreshBookmarksDelay has elapsed, so the refresh bookmarks
			// action will be taken only once
		}
	}

	// Classes.TabNormalizer.type.HISTORY
	tabs = tabGroups[Classes.TabNormalizer.type.HISTORY];

	if(tabs != null && tabs.length != 0) {
		this._log(logHead, "deleting history items", tabs);
		for(let i = 0; i < tabs.length; i++) {
			chromeUtils.wrap(chrome.history.deleteUrl, logHead, { url: tabs[i].url });
		}
	}

	// Skip Classes.TabNormalizer.type.RCTAB, as chrome.sessions doesn't have an
	// API to delete a recently closed tab
},

// This function moves standard tabs, or creates new tabs from bookmarks and history items
_tabsMovedCb: async function(ev) {
	const logHead = "MultiSelectPanelViewer._tabsMovedCb():";

	let window = null;
	let createData = {
		focused: true,
		incognito: this._incognitoBsTab,
	};

	let tabGroups = this._groupSelectedTabs();

	let tabs = tabGroups[Classes.TabNormalizer.type.TAB];
	if(tabs != null) {
		tabs.sort(Classes.TabNormalizer.compareTitlesFn);

		createData.tabId = tabs.shift().id,
		window = await chromeUtils.createWindow(createData);

		if(tabs.length != 0) {
			let moveProperties = { index: -1, windowId: window.id, };
			await chromeUtils.wrap(chrome.tabs.move, logHead, tabs.map(tab => tab.id), moveProperties);
		}
	}

	let urls = [];

	tabs = tabGroups[Classes.TabNormalizer.type.BOOKMARK];
	if(tabs != null) {
		tabs.sort(Classes.TabNormalizer.compareTitlesFn);
		urls = urls.concat(tabs.map(tab => tab.url));
	}
	tabs = tabGroups[Classes.TabNormalizer.type.HISTORY];
	if(tabs != null) {
		tabs.sort(Classes.TabNormalizer.compareTitlesFn);
		urls = urls.concat(tabs.map(tab => tab.url));
	}

	if(urls.length == 0) {
		return;
	}

	if(window == null) {
		createData.url = urls;
		window = await chromeUtils.createWindow(createData);
	} else {
		// We choose "active: false" to consistently activate the first tab in the
		// moved set of tabs, not the last one
		let createProperties = { active: false, windowId: window.id, };
		for(let i = 0; i < urls.length; i++) {
			createProperties.url = urls[i];
			chromeUtils.wrap(chrome.tabs.create, logHead, createProperties);
		}
	}
},

_updateCounts: function() {
	const logHead = "MultiSelectPanelViewer._updateCounts():";

	let oldCount = this._cntAllElem.textContent;
	let newCount = this._tabsStoreAll.getCount();

	this._cntAllElem.textContent = newCount;
	this._cntInViewElem.textContent = this._tabsStoreInView.getCount();

	// "oldCount != 0" includes the case of "oldCount == -1" as set in _renderPanel(),
	// that is, the case this function gets called as part of the _init sequence.
	// We need to initialize to "-1" otherwise the logic below won't apply at initialization.
	// We could use any number except "0". It would be cleaner to initialize the <span>
	// with empty strings (""), but the empty string turns into the number "0" when
	// converted in Javascript, so '"" != 0' is "false" in Javascript. See https://stackoverflow.com/questions/462663/implied-string-comparison-0-but-1-1
	// The article suggests strict comparison, but we need the string conversion for all
	// the other numbers...
	if(newCount == 0 && oldCount != 0) {
		this._log(logHead, "disabling actions");
		this._menuViewer.enableActions(false);
	}
	if(newCount != 0 && oldCount == 0) {
		this._log(logHead, "enabling actions");
		this._menuViewer.enableActions(true);
	}
},

discard: function() {
	if(this.isActive()) {
		this.activate(false);
	}

	this._elw.discard();
	this._elw = null;
	this._tabsElw.discard();
	this._tabsElw = null;

	this._menuViewer.discard();
	this._menuViewer = null;

	this._eventManager.discard();
	this._eventManager = null;

	this._refreshBookmarksJob.discard();
	this._refreshBookmarksJob = null;

	// Don't discard _tabsManager and _historyFinder, this class doesn't own them
	this._tabsManager = null;
	this._historyFinder = null;

	// Do this after deactivating, because "this.activate(false)" needs to still have
	// access to "this._rootElem"
	this._rootElem.remove();
	this._rootElem = null;

	this._tabsStoreAll.discard();
	this._tabsStoreAll = null;
	this._tabsStoreInView.discard();
	this._tabsStoreInView = null;

	gcChecker.add(this);
},

// Activate multi-select
activate: function(flag=true) {
	const logHead = "MultiSelectPanelViewer.activate():";
	this._log(logHead, "entering", flag);

	this._active = flag;

	if(flag) {
		this._setTabsListeners();
		this.show();
	} else {
		this.hide();
		this._tabsElw.clear();
		this._tabsStoreAll.reset();
		this._tabsStoreInView.reset();
		// Update the counts, so when we show the panel the next time, it won't start
		// with stale information
		this._updateCounts();
		this.setSelected(false);
	}
},

isActive: function() {
	return this._active;
},

// Returns "true" if a new tab was added to the "in view" list, "false" if an existing
// tab was updated in the "in view" list.
// That is, returns "true" if the count of tabs "in view" has changed.
addTab: function(tab) {
	const logHead = "MultiSelectPanelViewer.addTab():";
	this._log(logHead, "adding tab", tab);
	this._tabsStoreAll.update(tab);
	// If update() returns "null", it means the "tab" was not present (just added)
	let isNewTab = this._tabsStoreInView.update(tab) == null;

	this._updateCounts();

	return isNewTab;
},

// Returns "true" if the tab was present and was removed from the "in view" list, "false"
// if the tab was not present in the "in view" list.
// That is, returns "true" if the count of tabs "in view" has changed.
_removeTabById: function(tabId, updateCounts=true) {
	const logHead = "MultiSelectPanelViewer._removeTabById():";
	this._log(logHead, "removing tab", tabId);
	this._tabsStoreAll.removeById(tabId);
	let tabPresent = this._tabsStoreInView.removeById(tabId) != null;

	if(updateCounts) {
		this._updateCounts();
	}

	return tabPresent;
},

removeTab: function(tab, updateCounts) {
	return this._removeTabById(tab.id);
},

getTabs: function() {
	return this._tabsStoreAll.get();
},

hasTab: function(tab) {
	return this._tabsStoreAll.hasById(tab.id);
},

resetView: function() {
	const logHead = "MultiSelectPanelViewer.resetView():";
	this._log(logHead, "entering");

	this._tabsStoreInView.reset();
	this._cntInViewElem.textContent = this._tabsStoreInView.getCount();
},

setSelected: function(flag=true, indeterminate=false) {
	this._selectElem.checked = flag;
	this._selectElem.indeterminate = indeterminate;
},

setListSelectedMode: function(flag=true) {
	const logHead = "MultiSelectPanelViewer.setListSelectedMode():";
	this._log(logHead, "entering", flag);

	this._listCheckboxElem.checked = flag;
	this._menuViewer.setListSelectedMode(flag);
},

}); // Classes.MultiSelectPanelViewer

Classes.Base.roDef(Classes.MultiSelectPanelViewer, "Events", {});
Classes.Base.roDef(Classes.MultiSelectPanelViewer.Events, "SELECTED", "tmSelected");
Classes.Base.roDef(Classes.MultiSelectPanelViewer.Events, "CLOSED", "tmClosed");
Classes.Base.roDef(Classes.MultiSelectPanelViewer.Events, "LISTED", "tmListed");