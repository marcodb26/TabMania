// CLASS MultiSelectPanelViewer

Classes.MultiSelectPanelViewer = Classes.Viewer.subclass({
	__idPrefix: "MultiSelectPanelViewer",

	_active: null,

	// ELW = EventListenersWrapper
	_elw: null,

	_eventManager: null,

	_tabsManager: null,
	_tabsStoreAll: null,
	_tabsStoreInView: null,

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
_init: function(tabsManager) {
	// Overriding the parent class' _init(), but calling that original function first
	Classes.Viewer._init.call(this);

	this.debug();

	this._tabsStoreAll = Classes.TabsStoreBase.createAs(this.getId() + ".tabsStoreAll");
	this._tabsStoreInView = Classes.TabsStoreBase.createAs(this.getId() + ".tabsStoreInView");
	this._active = false;

	this._elw = Classes.EventListenersWrapper.create();

	this._eventManager = Classes.EventManager.createAs(this.getId() + ".eventManager");
	this._eventManager.attachRegistrationFunctions(this);

	this._tabsManager = tabsManager;
	this._tabsManager.getInitPromise().then(this._asyncInitCb.bind(this));

	this._renderPanel();
	this.activate(false);
},

_asyncInitCb: function() {
	const logHead = "MultiSelectPanelViewer::_asyncInitCb():";
	if(this._elw == null) {
		this._log(logHead, "discard() called before initialization completed, giving up");
		return;
	}

	// Classes.TabsManager.Events.CREATED can't impact the selection
	this._elw.listen(this._tabsManager, Classes.TabsManager.Events.REMOVED, this._tabRemovedCb.bind(this));
	this._elw.listen(this._tabsManager, Classes.TabsManager.Events.UPDATED, this._tabUpdatedCb.bind(this));

	this._elw.listen(bookmarksManager, Classes.EventManager.Events.UPDATED, this._bookmarkUpdatedCb.bind(this));
},

_tabRemovedCb: function(ev) {
	const logHead = "MultiSelectPanelViewer::_tabRemovedCb():";
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
	const logHead = "MultiSelectPanelViewer::_tabUpdatedCb():";

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

_bookmarkUpdatedCb: function(ev) {
	const logHead = "MultiSelectPanelViewer::_bookmarkUpdatedCb():";

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
			this.removeTab(tab);
			removed++;
			continue;
		}

		this._tabUpdatedCbInner(bm);
		changed++;
	}

	this._log(logHead, "changed", changed, ", removed", removed, ev.detail);
},

_renderPanel: function() {
	const cntInViewId = this._id + "-cnt-view";
	const cntAllId = this._id + "-cnt-all";
	const selectId = this._id + "-select";
	const menuId = this._id + "-menu";
	const listCheckboxId = this._id + "-list";
	const closeId = this._id + "-close";

	const bodyHtml = `
	<div class="card tm-cursor-default">
		<div class="d-flex align-items-center">
			<input id="${selectId}" class="form-check-input mt-0 ms-1" type="checkbox" value="" style="min-width: 1em;">
			<div id="${menuId}" class=""></div>
			<div>
				<input type="checkbox" class="btn-check" id="${listCheckboxId}" autocomplete="off">
				<label class="tm-btn tm-checkbox-btn me-2 tm-xxs-hide" for="${listCheckboxId}">${icons.list}</label>
			</div>
			<div class="flex-fill me-2 fst-italic fw-light"><span id="${cntAllId}">0</span><span class="tm-xxs-hide"> total</span> (<span id="${cntInViewId}">0</span><span class="tm-xxs-hide"> in view</span>)</div>
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
	this._elw.listen(this._menuViewer, Classes.MultiSelectPanelMenuViewer.Events.TABSHIGHLIGHTED,
						this._tabsHighlightedCb.bind(this), false);
	this._elw.listen(this._menuViewer, Classes.MultiSelectPanelMenuViewer.Events.TABSCLOSED,
						this._tabsClosedCb.bind(this), false);

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

_filterSelectedTabs: function(typeList) {
	const logHead = "MultiSelectPanelViewer._filterSelectedTabs():";
//	this._log(logHead, "entering", typeList);

	let selectedTabs = this._tabsStoreAll.get();
	let retVal = [];
	let deletedTabIds = [];
	for(let i = 0; i < selectedTabs.length; i++) {
		let tabInfo = selectedTabs[i];

		if(!typeList.includes(tabInfo.tm.type)) {
			// The tab is of a type that needs to be filtered out
			continue;
		}

//		if(tabInfo.tm.type == Classes.TabNormalizer.type.TAB) {
//			// The action might require up-to-date knowledge about the state of a tab,
//			// which might have changed since the time the tab was stored in the
//			// _tabsStoreAll. Remember this class doesn't track tab info updates,
//			// but _tabsManager does.
//			tabInfo = this._tabsManager.getTabByTabId(tabInfo.id);
//		}

//		if(tabInfo == null) {
//			// The tab has been deleted, don't use it. Since the tab doesn't exist anymore,
//			// we log the original info from "selectedTabs[i]"
//			this._log(logHead, "skipping deleted tab", selectedTabs[i]);
//			// As a side effect, let's get rid of this deleted tab, so it won't be in the way
//			// again later. We store the deleted IDs first, then delete them later, because
//			// we're looking the list of tabs from _tabsStoreAll, so we should not modify
//			// that list while we traverse it, we'll perform the actual deletes after the loop.
//			deletedTabIds.push(selectedTabs[i].id);
//			continue;
//		}

		retVal.push(tabInfo);
	}

//	for(let i = 0; i < deletedTabIds.length; i++) {
//		this._tabsStoreAll.removeById(deletedTabIds[i]);
//	}
//	this._updateCounts();

	return retVal;
},

_tabsHighlightedCb: function(ev) {
	const logHead = "MultiSelectPanelViewer._tabsHighlightedCb():";

	let anyHighlighted = false;
	let anyInactive = false;

	let tabs = this._filterSelectedTabs([ Classes.TabNormalizer.type.TAB ]);

	for(let i = 0; i < tabs.length; i++) {
		if(!tabs[i].active) {
			anyInactive = true;
			if(tabs[i].highlighted) {
				anyHighlighted = true;
			}
		}
	}

	let needHighlight = false;

	if(!anyInactive) {
		// The selection is made of only active tabs. Active tabs are always highlighted,
		// and removing highlight of an active tab will only work if there are other
		// highlighted tabs in the same window. We'll try...
		needHighlight = false;
	} else {
		// Follow the same behavior of the multi-select checkbox: if any of the non-active
		// tabs is already highlighted, pick the "remove highlight" action, while if they're
		// all not highlighted, pick the "set highlight" action
		needHighlight = !anyHighlighted;
	}
	this._log(logHead, "highlighting", needHighlight, tabs);

	for(let i = 0; i < tabs.length; i++) {
		// We chose to use chrome.tabs.update() instead of chrome.tabs.highlight() for a number
		// of reasons:
		// 1. chrome.tabs.highlight() can only add, not remove, highlight
		// 2. chrome.tabs.highlight() works with tab indices, not with tab IDs.
		//    That's unfortunate, because this._tabsStoreAll doesn't track tab index changes,
		//    so here we would need to get the latest tab index for each tab, otherwise we might end
		//    up highlighting the wrong tab...
		chromeUtils.wrap(chrome.tabs.update, logHead, tabs[i].id, { highlighted: needHighlight });
	}
},

_tabsClosedCb: function(ev) {
	const logHead = "MultiSelectPanelViewer._tabsClosedCb():";

	// Classes.TabNormalizer.type.TAB
	let tabs = this._filterSelectedTabs([ Classes.TabNormalizer.type.TAB ]);

	if(tabs.length != 0) {
		let tabIds = tabs.map(tab => tab.id);
		this._log(logHead, "closing standard tabs", tabIds, tabs);
		chromeUtils.wrap(chrome.tabs.remove, logHead, tabIds);
	}

	// Classes.TabNormalizer.type.BOOKMARK
	tabs = this._filterSelectedTabs([ Classes.TabNormalizer.type.BOOKMARK ]);

	if(tabs.length != 0) {
		this._log(logHead, "deleting bookmarks", tabs);
		for(let i = 0; i < tabs.length; i++) {
			chromeUtils.wrap(chrome.bookmarks.remove, logHead, tabs[i].bookmarkId);
			// TO DO, remove from our internal lists by calling removeTab(),
			// but change removeTab() to have an option to not refresh the counts
			// at every call...
		}
	}

	// Classes.TabNormalizer.type.HISTORY

	// Skip Classes.TabNormalizer.type.RCTAB, as chrome.sessions doesn't have an
	// API to delete a recently closed tab
},

_updateCounts: function() {
	this._cntAllElem.textContent = this._tabsStoreAll.getCount();
	this._cntInViewElem.textContent = this._tabsStoreInView.getCount();
},

discard: function() {
	this._elw.discard();
	this._elw = null;

	this._menuViewer.discard();
	this._menuViewer = null;

	this._eventManager.discard();
	this._eventManager = null;

	// Don't discard _tabsManager, this class doesn't own it
	this._tabsManager = null;

	if(this.isActive()) {
		this.activate(false);
	}

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
		this.show();
	} else {
		this.hide();
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

addTab: function(tab) {
	const logHead = "MultiSelectPanelViewer.addTab():";
	this._log(logHead, "adding tab", tab);
	this._tabsStoreAll.update(tab);
	this._tabsStoreInView.update(tab);

	this._updateCounts();
},

_removeTabById: function(tabId) {
	const logHead = "MultiSelectPanelViewer._removeTabById():";
	this._log(logHead, "removing tab", tabId);
	this._tabsStoreAll.removeById(tabId);
	this._tabsStoreInView.removeById(tabId);

	this._updateCounts();
},

removeTab: function(tab) {
	this._removeTabById(tab.id);
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