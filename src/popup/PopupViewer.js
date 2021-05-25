// CLASS BootstrapTabsViewer
Classes.BootstrapTabsViewer = Classes.Viewer.subclass({

	_headingElem: null,
	_buttonBarElem: null,
	_menuElem: null,

	// This is the same _bodyElem of class Viewer
	_bodyElem: null,

	_menuViewer: null,

_init: function() {
	// Overriding the parent class' _init(), but calling that original function first
	Classes.Viewer._init.apply(this, arguments);

	this._renderTabsContainer();
},

_dockToggleCb: function(ev) {
	popupDocker.dockToggle();
	ev.preventDefault();
},

_renderTabsContainer: function() {
	const logHead = "BootstrapTabsViewer::_renderTabsContainer(): ";

	const headingId = this._id + "-heading";
	const buttonBarId = this._id + "-buttonbar";
	const menuId = this._id + "-menu";
	const bodyId = this._id + "-body";

	// Using "overflow-hidden" in the heading becauseif the popup is very narrow and the
	// main menu starts disappearing, we don't want an extra horizontal scrollbar to
	// show up at the bottom of the window: there could then be two scrollbars there,
	// one for the heading, and one for the tiles container...
	//
	// The <div id="${menuId}"> should always be last after the button bar, that's why
	// we don't want it inside the button bar.
	// The right margin for the button bar is not needed, the menu button takes care of that.
	const headingHtml = `
	<div class="d-flex tm-cursor-default tm-select-none">
		<div class="flex-grow-1">
			<!-- https://getbootstrap.com/docs/5.0/components/navs-tabs/ -->
			<ul class="nav nav-tabs nav-justified tm-tiny-hide" id="${headingId}" role="tablist">
			</ul>
		</div>
		<div id="${buttonBarId}" class="ms-2">
		</div>
		<div id="${menuId}">
		</div>
	</div>
	`;

	// Usual quirkiness of CSS flex layout, need to specify "min-height: 0;".
	// Without setting a "min-height", the "min-height" is set to "auto", and that causes
	// the element to take all the space it needs, and ignore the constraints of the
	// parent's height. Similar to the problem described in TabTileViewer._renderEmptyTile()
	// and explained here: https://makandracards.com/makandra/66994-css-flex-and-min-width
	const bodyHtml = `
	<div class="tab-content h-100" id="${bodyId}" style="min-height: 0;">
	</div>
	`;

	const rootHtml = `
	<div class="d-flex flex-column h-100" id=${this._id}>
		${headingHtml}
		${bodyHtml}
	</div>
	`;

	this._rootElem = this._elementGen(rootHtml);

	this._headingElem = this.getElementById(headingId);
	this._buttonBarElem = this.getElementById(buttonBarId);
	this._menuElem = this.getElementById(menuId);
	this._bodyElem = this.getElementById(bodyId);

	this._menuElem = this.getElementById(menuId);
	this._menuViewer = null;
},

_attachMenu: function(menuViewer) {
	this._menuViewer = menuViewer;
	this._menuViewer.attachInParentElement(this._menuElem);
},

// Override Viewer.append()
append: function(bsTabViewer) {
	// Append the heading
	this._headingElem.append(bsTabViewer.getHeadingElement());

	// Append the body
	Classes.Viewer.append.apply(this, arguments);
},

// This function assumes that "oldBsTabViewer" is already attached to something
replace: function(oldBsTabViewer, newBsTabViewer) {
	let oldHeadingElem = oldBsTabViewer.getHeadingElement();
	// See https://developer.mozilla.org/en-US/docs/Web/API/ChildNode/replaceWith
	oldHeadingElem.replaceWith(newBsTabViewer.getHeadingElement());

	let oldRootElem = oldBsTabViewer.getRootElement();
	oldRootElem.replaceWith(newBsTabViewer.getRootElement());
},

// Append a button to the button bar
appendButton: function(viewer) {
	this._buttonBarElem.append(viewer.getRootElement());
},

}); // Classes.BootstrapTabsViewer

// CLASS PopupViewer
//
// To create an object, use PopupViewer.createAs(id), where:
// - the "id" argument is going to be used as prefix for all the DOM IDs
//   needed when creating this DOM tree
Classes.PopupViewer = Classes.BootstrapTabsViewer.subclass({

	_bsTabViewersDict: null,

	_activeBsTabId: null,

	_bsTabActivatedCbBound: null,

	_splitIncognito: null,

	// popupViewer can replace bsTabs when "_splitIncognito" changes. We want the IDs
	// of each instance of bsTabs to be distinguishable, and that's what _bsTabInstanceCnt
	// is for.
	_bsTabInstanceCnt: null,

	_popupMenuViewer: null,


// Unfortunately "parentElem" is necessary here, see comment inside _init()
_init: function(parentElem) {
	// Overriding the parent class' _init(), but calling that original function first
	Classes.BootstrapTabsViewer._init.apply(this, arguments);

	this._bsTabInstanceCnt = 0;
	this._bsTabViewersDict = {};
	this._bsTabActivatedCbBound = this._bsTabActivatedCb.bind(this);

	this._popupMenuViewer = Classes.PopupMenuViewer.create(this);
	this._attachMenu(this._popupMenuViewer);

	this._populateTabs();
	perfProf.mark("popupViewerEnd");

	// _initActiveTabId() eventually calls BsTabViewer.activate(), which calls
	// a Bootstrap function. The Bootstrap function seems to take no action
	// if the DOM is not attached to "document", and the tab doesn't get
	// activated. So we need to make sure we attach this class to the DOM
	// before we start the tab activation chain with _initActiveTabId().
	this.prependInParentElement(parentElem);
	perfProf.mark("attachEnd");

	this._initActiveTabId();

	// "tabsList" is a notification, we don't need to respond to it (last argument set to "false")
	popupMsgServer.addCmd("tabsList", this._tabsListNotificationCb.bind(this), false);

	settingsStore.addEventListener(Classes.EventManager.Events.UPDATED, this._settingsStoreUpdatedCb.bind(this));
},

_settingsStoreUpdatedCb: function(ev) {
	const logHead = "PopupViewer::_settingsStoreUpdatedCb(" + ev.detail.key + "):";

	if(ev.detail.key != "options") {
		// Nothing to do, we only need to monitor "options.incognitoBsTab", and only when TabMania
		// is allowed to manage incognito tabs
		this._log(logHead, "ignoring key", ev.detail);
		return;
	}

	let newSplitIncognito = settingsStore.getOptionIncognitoBsTab() && localStore.isAllowedIncognitoAccess();

	if(newSplitIncognito === this._splitIncognito) {
		// Nothing to do, we only need to monitor "options.incognitoBsTab", and only when TabMania
		// is allowed to manage incognito tabs
		this._log(logHead, "this._splitIncognito has not changed, nothing to do", this._splitIncognito);
		return;
	}

	this._log(logHead, "processing change in this._splitIncognito, now set to", this._splitIncognito);
	this._splitIncognito = newSplitIncognito;

	this._replaceBsTab("home", Classes.TabsBsTabViewer,
				{ labelHtml: "Home", standardTabs: true, incognitoTabs: !this._splitIncognito });

	this._replaceBsTab("incognito", Classes.TabsBsTabViewer,
				{ labelHtml: "Incognito", standardTabs: false, incognitoTabs: this._splitIncognito }, !this._splitIncognito);
},

_initActiveTabId: function(results) {
	const logHead = "PopupViewer::_initActiveTabId(): ";

	let activeBsTabId = localStore.getActiveBsTabId();

	if(activeBsTabId != null) {
		this._log(logHead + "initializing active Bootstrap tabId to stored value:", activeBsTabId);
		if(this.activateBsTabById(activeBsTabId)) {
			return;
		} else {
			this._log(logHead + "stored Bootstrap tabId not found:", activeBsTabId);
			// Proceed below as if "activeBsTabId == null"
		}
	}

	activeBsTabId = this.getBsTabIdByLabel("home");
	this._log(logHead + "initializing Bootstrap tabId to default:", activeBsTabId);
	this.activateBsTabById(activeBsTabId)
},

_bsTabActivatedCb: function(ev) {
	const bsTabId = this.getBsTabIdFromBsTabInstanceId(ev.target.id);

	const logHead = "PopupViewer::_bsTabActivatedCb(" + bsTabId + ", " + ev.target.id + "):";
	this._log(logHead, "tab activated", ev);

	this._activeBsTabId = bsTabId;
	localStore.setActiveBsTabId(bsTabId);
},


// "initOptions" is a dict of options passed to the createAs() function.
// It's not an optional argument, because you must at least pass "labelHtml".
_createBsTabInner: function(bsTabLabel, bsTabViewerSubclass, initOptions, startHidden=false) {
	const bsTabId = this.getBsTabIdByLabel(bsTabLabel);
	const bsTabInstanceId = bsTabId + this._bsTabInstanceCnt++;

	let newBsTab = bsTabViewerSubclass.createAs(bsTabInstanceId, initOptions);

	newBsTab.addBsTabActivationStartListener(this._bsTabActivatedCbBound);

	if(startHidden) {
		newBsTab.hide();
	}

	this._bsTabViewersDict[bsTabId] = newBsTab;
	return newBsTab;
},

// "initOptions" is a dict of options passed to the createAs() function.
// It's not an optional argument, because you must at least pass "labelHtml".
_createBsTab: function(bsTabLabel, bsTabViewerSubclass, initOptions, startHidden) {
	let newBsTab = this._createBsTabInner.apply(this, arguments);
	this.append(newBsTab);

	// There's a little mismatch here, _createBsTabInner() uses "labelHtml", while
	// addBsTabMenuItem() uses "labelText". For now they're the same, so we'll live
	// with this mismatch until we need to fix it (it will be obvious because the
	// menu labels will show raw HTML).
	this._popupMenuViewer.addBsTabMenuItem(bsTabLabel, initOptions.labelHtml, startHidden);
},

// "initOptions" is a dict of options passed to the createAs() function.
// It's not an optional argument, because you must at least pass "labelHtml".
_replaceBsTab: function(bsTabLabel, bsTabViewerSubclass, initOptions, startHidden) {
	let oldBsTabViewer = this.getBsTabByLabel(bsTabLabel);
	oldBsTabViewer.removeBsTabActivationStartListener(this._bsTabActivatedCbBound);

	let newBsTabViewer = this._createBsTabInner.apply(this, arguments);
	this.replace(oldBsTabViewer, newBsTabViewer);

	// Do this at the end, because internally BsTabViewer.discard() removes the viewer
	// from the DOM, and we need it to be in the DOM in order for this.replace() to
	// work correctly
	oldBsTabViewer.discard();

	// Note that updateBsTabMenuItem() must receive an explicit "hide" parameter, as its
	// behavior is slightly different from the behavior of "startHidden" in this function
	this._popupMenuViewer.updateBsTabMenuItem(bsTabLabel, initOptions.labelHtml, startHidden ?? false);
},

_populateTabs: function() {
	this._splitIncognito = settingsStore.getOptionIncognitoBsTab() && localStore.isAllowedIncognitoAccess();

	this._createBsTab("home", Classes.TabsBsTabViewer,
					{ labelHtml: "Home", standardTabs: true, incognitoTabs: !this._splitIncognito });

	this._createBsTab("incognito", Classes.TabsBsTabViewer,
					{ labelHtml: "Incognito", standardTabs: false, incognitoTabs: this._splitIncognito }, !this._splitIncognito);

	this._createBsTab("settings", Classes.SettingsBsTabViewer, { labelHtml: "Settings" });
},

_tabsListNotificationCb: function(notification, sender) {
	const logHead = "PopupViewer::_tabsListNotificationCb(): ";
	// Currently the message format is still dirty and doesn't include "data"
	// TO DO TO DO TBD TBD
	this._log(logHead, notification.data);
},

// Override Classes.Viewer's behavior
attachInParentElement: function() {
	Classes.Viewer.attachInParentElement.apply(this, arguments);
	// Perform here any initialization that requires the elements to be attached
	// to the document's DOM (e.g., hicharts charts can only be initialized after
	// we've been attached to the window.document DOM)
},

activateBsTabById: function(bsTabId) {
	if(!(bsTabId in this._bsTabViewersDict)) {
		const logHead = "PopupViewer::activateBsTabById(" + bsTabId + "): ";
		this._log(logHead + "Bootstrap tabId not found");
		return false;
	}

	this._activeBsTabId = bsTabId;
	this.getBsTabById(this._activeBsTabId).activate();
	return true;
},

activateBsTabByLabel: function(bsTabLabel) {
	return this.activateBsTabById(this.getBsTabIdByLabel(bsTabLabel));
},

getBsTabIdByLabel: function(bsTabLabel) {
	return this._id + "-" + bsTabLabel;
},

getBsTabById: function(bsTabId) {
	return this._bsTabViewersDict[bsTabId];
},

getActiveBsTabId: function() {
	return this._activeBsTabId;
},

getActiveBsTab: function() {
	return this.getBsTabById(this.getActiveBsTabId());
},

getBsTabIdFromBsTabInstanceId: function(bsTabInstanceId) {
	// The ID of the DOM node is not really the "bsTabId", because we're adding an extra
	// number to recognize subsequent instances of the bsTab. We need to extract the
	// "bsTabId" from the "bsTab instance ID". We do that by splitting the instance ID
	// at the first occurrence of a digit.
	// Using optional chaining in case split() returns an empty array...
	return bsTabInstanceId.split(/[0-9]/, 1)?.[0];
},

getBsTabByLabel: function(bsTabLabel) {
	let bsTabId = this.getBsTabIdByLabel(bsTabLabel);
	return this.getBsTabById(bsTabId);
},

getHomeBsTab: function() {
	return this.getBsTabByLabel("home");
},

isIncognitoBsTabActive: function() {
	return this.getActiveBsTabId() == this.getBsTabIdByLabel("incognito");
},

// This function returns "true" only if a searchable tab is visible, besides being
// in search mode. If the settings tab is visible, this function returns false
// regardless of the SearchableBsTabViewer.isSearchActive() response.
isSearchActive: function() {
	if(this.getActiveBsTabId() == this.getBsTabIdByLabel("settings")) {
		return false;
	}

	return this.getActiveBsTab().isSearchActive();
},

getSearchQuery: function() {
	if(!this.isSearchActive()) {
		return null;
	}

	return this.getActiveBsTab().getSearchQuery();
},

}); // Classes.PopupViewer
