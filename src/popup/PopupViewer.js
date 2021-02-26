// CLASS ContainerViewer
//
// The problem with this class is that the container counts the number of .append() calls
// made, but nobody calls the container to update it when they detach from its DOM subtree
// Viewers calling .detach() interact directly with the DOM, and ContainerViewer is
// completely unaware. It's impossible to keep in sync if we allow Viewers to work
// directly with the DOM, but we want to allow that.
// So with the ContainerViewer going out of sync so easily, the only times the "Empty" message
// is really accurate is before the first .append(), and after .clear().
// That's good enough for the tiles view (given the continuous full re-query/re-render
// cycles), but doesn't work for something more dynamic like the custom group cards.
// Worked around the issue forcing calls to clear() in the container when it's supposed to be
// empty (the container doesn't know, but SettingsTabViewer does).
//
Classes.ContainerViewer = Classes.Viewer.subclass({
	__idPrefix: "ContainerViewer",

	// This is a raw container, using only the _rootElem, no need for a _bodyElem
	_rootElem: null,

	_htmlWhenEmpty: null,
	_appendedCnt: null,

// "textWhenEmpty" is the txt to display in the container if it contains no objects.
// If "null", the container will not show any text.
_init: function(htmlWhenEmpty) {
	// Overriding the parent class' _init(), but calling that original function first
	Classes.Viewer._init.apply(this, arguments);
	const logHead = "ContainerViewer::_init(): ";
	this._htmlWhenEmpty = htmlWhenEmpty;

	this._containerViewerRender();
},

_containerViewerRender: function() {
	const logHead = "ContainerViewer::_containerViewerRender(): ";

	const bodyHtml = `
	<div id="${this._id}">
	</div>
	`;

	this._rootElem = this._elementGen(bodyHtml);

	this._renderEmptyContainer();
},

_renderEmptyContainer: function() {
	//const html = `
	//<div class="tm-vertical-center tm-horizontal-center">
	//	<span>${this._htmlWhenEmpty}</span>
	//</div>
	//`;
	const html = `
	<div class="tm-all-center text-center">
		<span>${this._htmlWhenEmpty}</span>
	</div>
	`;

	this._appendedCnt = 0;
	this.setHtml(html);
},

// Override Viewer.append()
append: function(viewer) {
	if(this._appendedCnt == 0) {
		// The container is rendering the empty view, we need to first clear that
		this._getBodyElem().textContent = "";
	}
	this._appendedCnt++;
	Classes.Viewer.append.apply(this, arguments);
},

// Override Viewer.clear() as we need a different behavior here
clear: function() {
	// When we clear(), we don't really clear, we replace the contents with the empty view
	this._renderEmptyContainer();
}

}); // Classes.ContainerViewer


// CLASS CollapsibleContainerViewer
Classes.CollapsibleContainerViewer = Classes.ContainerViewer.subclass({
	__idPrefix: "CollapsibleContainerViewer",

	// A CollapsibleContainerViewer needs both the _rootElem, and the _bodyElem
	_rootElem: null,
	_bodyElem: null,

	_headingElem: null,

	_options: null,

// "options" is a set of rendering options, currently it includes:
// - "startExpanded", determines whether the container is created collapsed or expanded, default "false"
// - "htmlWhenEmpty", see ContainerViewer._init() for this, default ""
// - "border", a flag describing whether or not the container should have a border
//   and some margins (default "true")
_init: function(options) {
//	this.debug();
//	const logHead = "CollapsibleContainerViewer::_init(): ";
//	this._log(logHead, options);
	options = optionalWithDefault(options, {});
	options.startExpanded = optionalWithDefault(options.startExpanded, false);
	options.htmlWhenEmpty = optionalWithDefault(options.htmlWhenEmpty, "");
	options.border = optionalWithDefault(options.border, true);

	this._options = options;
//	this._log(logHead, this._options);

	// Overriding the parent class' _init(), but calling that original function first
	Classes.ContainerViewer._init.call(this, this._options.htmlWhenEmpty);

	this._renderHeadingAndBody();
},

_renderHeadingAndBody: function() {
	const logHead = "CollapsibleContainerViewer::_renderHeadingAndBody(): ";

	const headingId = this._id + "-heading";
	const headingInnerId = this._id + "-heading-inner";
	const bodyId = this._id + "-body";
	const bodyInnerId = this._id + "-body-inner";

	this._rootElem.classList.add("accordion");

	var headingExtraClasses = [];
	var bodyExtraClasses = [];
	var bodyInnerExtraClasses = [];

	if(this._options.border) {
		// This class just seems to add a border to the accordion body.
		// Strange name for that
		bodyExtraClasses.push("accordion-collapse");
		bodyInnerExtraClasses.push("tm-indent-right");
	}
	if(this._options.startExpanded) {
		bodyExtraClasses.push("show");
	} else {
		headingExtraClasses.push("collapsed");
	}

	const headingHtml = `
		<h2 class="accordion-header" id="${headingId}">
			<button id=${headingInnerId} class="accordion-button ${headingExtraClasses.join(" ")} p-2" type="button" data-bs-toggle="collapse"
						data-bs-target="#${bodyId}"	aria-expanded="true" aria-controls="${bodyId}">
			</button>
		</h2>
	`;

	// The inner body of an accordion should be:
	// <div id="${bodyInnerId}" class="tm-indent-right accordion-body">
	// However, "accordion-body" seems to just be indentation, and overrides my desired indentation,
	// so I got rid of it.
	// "tm-min-empty-container" is needed to center properly the "_htmlWhenEmpty" text.
	const bodyHtml = `
		<div id="${bodyId}" class="collapse tm-min-empty-container ${bodyExtraClasses.join(" ")}" aria-labelledby="${headingId}" data-bs-parent="#${this._id}">
			<div id="${bodyInnerId}" class="${bodyInnerExtraClasses.join(" ")}">
			</div>
		</div>
	`;

	const outerHtml = `
		<div class="accordion-item">
			${headingHtml}
			${bodyHtml}
		</div>
	`;

	// Note that starting from the end of this function, setHtml() will render
	// inside the _bodyElem of the container, but right now _bodyElem is still null.
	this.setHtml(outerHtml);
	this._headingElem = this.getElementById(headingInnerId);
	//this._log(logHead + "_headingElem = ", this._headingElem, this);
	this._bodyElem = this.getElementById(bodyInnerId);

	// Since we've overwritten the original DOM of our parent class, let's reset it
	// into the new _bodyElem.
	this._renderEmptyContainer();
},

setHeadingHtml: function(html) {
	this._headingElem.innerHTML = html;
},

addHeadingClasses: function(...args) {
	this._headingElem.classList.add(...args);
},

// The signature of the callback is function(event).
// Note that the event happens on the parent of _bodyElem, so watch out.
addCollapsedListener: function(fn) {
	// We're attaching to "hide.bs.collapse", which is the event generated at
	// the start of the container collapse action, but before the animations
	// have completed
	this._bodyElem.parentElement.addEventListener("hide.bs.collapse", fn);
},

// The signature of the callback is function(event).
// Note that the event happens on the parent of _bodyElem, so watch out.
addExpandedListener: function(fn) {
	// We're attaching to "show.bs.collapse", which is the event generated at
	// the start of the container expand action, but before the animations
	// have completed
	this._bodyElem.parentElement.addEventListener("show.bs.collapse", fn);
},

}); // Classes.CollapsibleContainerViewer


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

	const dockToggleBtnTxt = popupDocker.isPopupDocked() ? "Undock" : "Dock";

//	const headingHtml = `
//	<div class="d-flex">
//		<div class="flex-grow-1">
//			<!-- https://getbootstrap.com/docs/5.0/components/navs-tabs/ -->
//			<ul class="nav nav-tabs nav-fill" id="${headingId}" role="tablist">
//			</ul>
//		</div>
//		<div id="${menuId}">
//			<a href="#" id="${dockToggleBtnId}">${dockToggleBtnTxt}</a>
//		</div>
//	</div>
//	`;

	// The <div id="${menuId}"> should always be last after the button bar, that's why
	// we don't want it inside the button bar.
	// The right margin for the button bar is not needed, the menu button takes care of that.
	const headingHtml = `
	<div class="d-flex" style="cursor: default">
		<div class="flex-grow-1">
			<!-- https://getbootstrap.com/docs/5.0/components/navs-tabs/ -->
			<ul class="nav nav-tabs nav-fill" id="${headingId}" role="tablist">
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
	this.getTabViewerById(this._activeBsTabId).activate();
},

_bstabActivatedCb: function(ev) {
	const logHead = "PopupViewer::_bstabActivatedCb(" + ev.target.id + "): ";
	this._log(logHead + "tab activated", ev);

	this._activeBsTabId = ev.target.id;
	localStore.setActiveBsTab(ev.target.id);
},

_createTab: function(suffix, htmlLabel, tabViewerSubclass) {
	tabViewerSubclass = optionalWithDefault(tabViewerSubclass, Classes.TabViewer);
	const tabId = this._id + "-" + suffix;
	
	var retVal = this._tabViewersDict[tabId] = tabViewerSubclass.createAs(tabId, htmlLabel);

	this._tabViewersDict[tabId].addTabActivationStartListener(this._bstabActivatedCb.bind(this));
	this.append(this._tabViewersDict[tabId]);

	return retVal;
},

_populateTabs: function() {
	this._createTab("home", "Home", Classes.AllTabsTabViewer);
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

getTabViewerById: function(bsTabId) {
	return this._tabViewersDict[bsTabId];
},

}); // Classes.PopupViewer
