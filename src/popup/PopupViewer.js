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

	const bodyHtml = `
	<div class="tab-content tm-fit-bottom tm-fit-after-bstabs" id="${bodyId}">
	</div>
	`;

	this._rootElem = this._elementGen(`<div id=${this._id}>` + headingHtml + bodyHtml + "</div>");

	this._headingElem = this.getElementById(headingId);
	this._buttonBarElem = this.getElementById(buttonBarId);
	this._menuElem = this.getElementById(menuId);
	this._bodyElem = this.getElementById(bodyId);

	this._menuElem = this.getElementById(menuId);
	this._menuViewer = null;
},

_attachMenu: function(menuViewer) {
	this._menuViewer = menuViewer;
	this._menuViewer.attachToElement(this._menuElem);
},

// Override Viewer.append()
append: function(bsTabViewer) {
	// Append the heading
	this._headingElem.append(bsTabViewer.getHeadingElement());

	// Append the body
	Classes.Viewer.append.apply(this, arguments);
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

// Unfortunately "parentElem" is necessary here, see comment inside _init()
_init: function(parentElem) {
	// Overriding the parent class' _init(), but calling that original function first
	Classes.BootstrapTabsViewer._init.apply(this, arguments);

	this._bsTabViewersDict = {};

	this._populateTabs();
	perfProf.mark("popupViewerEnd");

	// _initActiveTabId() eventually calls BsTabViewer.activate(), which calls
	// a Bootstrap function. The Bootstrap function seems to take no action
	// if the DOM is not attached to "document", and the tab doesn't get
	// activated. So we need to make sure we attach this class to the DOM
	// before we start the tab activation chain with _initActiveTabId().
	this.attachToElement(parentElem);
	perfProf.mark("attachEnd");

	this._initActiveTabId();

	this._attachMenu(Classes.PopupMenuViewer.create(this));

	// "tabsList" is a notification, we don't need to respond to it (last argument set to "false")
	popupMsgServer.addCmd("tabsList", this._tabsListNotificationCb.bind(this), false);
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

	activeBsTabId = this.getBsTabId("home");
	this._log(logHead + "initializing Bootstrap tabId to default:", activeBsTabId);
	this.activateBsTabById(activeBsTabId)
},

_bsTabActivatedCb: function(ev) {
	const logHead = "PopupViewer::_bsTabActivatedCb(" + ev.target.id + "): ";
	this._log(logHead + "tab activated", ev);

	this._activeBsTabId = ev.target.id;
	localStore.setActiveBsTabId(ev.target.id);
},

getBsTabId: function(bsTabLabel) {
	return this._id + "-" + bsTabLabel;
},

// "initOptions" is an dict of options passed to the createAs() function.
// It's not an optional argument, because you must at least pass "labelHtml".
_createBsTab: function(bsTabLabel, bsTabViewerSubclass, initOptions) {
	bsTabViewerSubclass = optionalWithDefault(bsTabViewerSubclass, Classes.BsTabViewer);
	const bsTabId = this.getBsTabId(bsTabLabel);

	this._bsTabViewersDict[bsTabId] = bsTabViewerSubclass.createAs(bsTabId, initOptions);

	this._bsTabViewersDict[bsTabId].addBsTabActivationStartListener(this._bsTabActivatedCb.bind(this));
	this.append(this._bsTabViewersDict[bsTabId]);

	return this._bsTabViewersDict[bsTabId];
},

_populateTabs: function() {
	let splitIncognito = settingsStore.getOptionIncognitoBsTab() && localStore.isAllowedIncognitoAccess();

	this._createBsTab("home", Classes.TabsBsTabViewer,
					{ labelHtml: "Home", standardTabs: true, incognitoTabs: !splitIncognito });

	if(splitIncognito) {
		this._createBsTab("incognito", Classes.TabsBsTabViewer,
						{ labelHtml: "Incognito", standardTabs: false, incognitoTabs: true });
	}

	this._createBsTab("settings", Classes.SettingsBsTabViewer, { labelHtml: "Settings" });
},

_tabsListNotificationCb: function(notification, sender) {
	const logHead = "PopupViewer::_tabsListNotificationCb(): ";
	// Currently the message format is still dirty and doesn't include "data"
	// TO DO TO DO TBD TBD
	this._log(logHead, notification.data);
},

// Override Classes.Viewer's behavior
attachToElement: function() {
	Classes.Viewer.attachToElement.apply(this, arguments);
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
	this.getBsTabViewerById(this._activeBsTabId).activate();
	return true;
},

activateBsTab: function(bsTabLabel) {
	return this.activateBsTabById(this.getBsTabId(bsTabLabel));
},

getBsTabViewerById: function(bsTabId) {
	return this._bsTabViewersDict[bsTabId];
},

getActiveBsTabId: function() {
	return this._activeBsTabId;
},

getBsTabByBsTabLabel: function(bsTabLabel) {
	let bsTabId = this.getBsTabId(bsTabLabel);
	return this.getBsTabViewerById(bsTabId);
},

getHomeBsTab: function() {
	return this.getBsTabByBsTabLabel("home");
},

// This function returns "true" only if the home tab is visible, besides being
// in search mode. If the settings tab is visible, this function returns false
// regardless of the SearchableBsTabViewer.isSearchActive() response.
isSearchActive: function() {
	let homeBsTabId = this.getBsTabId("home");
	if(this.getHomeBsTab().isSearchActive() && this.getActiveBsTabId() == homeBsTabId) {
		return true;
	}
	return false;		
},

getSearchQuery: function() {
	if(!this.isSearchActive()) {
		return null;
	}

	return this.getHomeBsTab().getSearchQuery();
},

}); // Classes.PopupViewer
