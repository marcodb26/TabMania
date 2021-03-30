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

	// The <div id="${menuId}"> should always be last after the button bar, that's why
	// we don't want it inside the button bar.
	// The right margin for the button bar is not needed, the menu button takes care of that.
	const headingHtml = `
	<div class="d-flex" style="cursor: default">
		<div class="flex-grow-1">
			<!-- https://getbootstrap.com/docs/5.0/components/navs-tabs/ -->
			<ul class="nav nav-tabs nav-justified" id="${headingId}" role="tablist">
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
	this._menuViewer = Classes.PopupMenuViewer.create();
	this._menuViewer.attachToElement(this._menuElem);
},

// Override Viewer.append()
append: function(tabViewer) {
	// Append the heading
	this._headingElem.append(tabViewer.getHeadingElement());

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

	_tabViewersDict: null,

	_activeBsTabId: null,

// Unfortunately "parentElem" is necessary here, see comment inside _init()
_init: function(parentElem) {
	// Overriding the parent class' _init(), but calling that original function first
	Classes.BootstrapTabsViewer._init.apply(this, arguments);

	this._tabViewersDict = {};

	this._populateTabs();
	perfProf.mark("popupViewerEnd");

	// _initActiveTabId() eventually calls TabViewer.activate(), which calls
	// a Bootstrap function. The Bootstrap function seems to take no action
	// if the DOM is not attached to "document", and the tab doesn't get
	// activated. So we need to make sure we attach this class to the DOM
	// before we start the tab activation chain with _initActiveTabId().
	this.attachToElement(parentElem);
	perfProf.mark("attachEnd");

	this._initActiveTabId();

	// "tabsList" is a notification, we don't need to respond to it (last argument set to "false")
	popupMsgServer.addCmd("tabsList", this._tabsListNotificationCb.bind(this), false);
},

_initActiveTabId: function(results) {
	const logHead = "PopupViewer::_initActiveTabId(): ";
	let activeTabId = localStore.getActiveBsTab()

	this._activeBsTabId = this._id + "-home";

	if(activeTabId != null) {
		this._log(logHead + "initializing active Bootstrap tabId to stored " + activeTabId);
		if(activeTabId in this._tabViewersDict) {
			this._activeBsTabId = activeTabId;
		} else {
			this._log(logHead + "Bootstrap tabId not found, initializing to default: " + this._activeBsTabId);
		}
	}

	this._log(logHead + "_activeBsTabId = " + this._activeBsTabId);
	this.getBsTabViewerById(this._activeBsTabId).activate();
},

_bsTabActivatedCb: function(ev) {
	const logHead = "PopupViewer::_bsTabActivatedCb(" + ev.target.id + "): ";
	this._log(logHead + "tab activated", ev);

	this._activeBsTabId = ev.target.id;
	localStore.setActiveBsTab(ev.target.id);
},

_createTab: function(suffix, htmlLabel, tabViewerSubclass) {
	tabViewerSubclass = optionalWithDefault(tabViewerSubclass, Classes.TabViewer);
	const bsTabId = this._id + "-" + suffix;
	
	this._tabViewersDict[bsTabId] = tabViewerSubclass.createAs(bsTabId, htmlLabel);

	this._tabViewersDict[bsTabId].addBsTabActivationStartListener(this._bsTabActivatedCb.bind(this));
	this.append(this._tabViewersDict[bsTabId]);

	return this._tabViewersDict[bsTabId];
},

_populateTabs: function() {
	this._createTab("home", "Home", Classes.AllTabsBsTabViewer);
	this._createTab("settings", "Settings", Classes.SettingsTabViewer);
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

getBsTabViewerById: function(bsTabId) {
	return this._tabViewersDict[bsTabId];
},

getActiveBsTabId: function() {
	return this._activeBsTabId;
},

getHomeBsTabId: function() {
	return this._id + "-home";
},

getHomeBsTab: function() {
	let homeBsTabId = this.getHomeBsTabId();
	return this.getBsTabViewerById(homeBsTabId);
},

// This function returns "true" only if the home tab is visible, besides being
// in search mode. If the settings tab is visible, this function returns false
// regardless of the SearchableBsTabViewer.isSearchActive() response.
isSearchActive: function() {
	let homeBsTabId = this.getHomeBsTabId();
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
