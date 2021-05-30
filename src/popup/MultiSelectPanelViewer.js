// CLASS MultiSelectPanelViewer

Classes.MultiSelectPanelViewer = Classes.Viewer.subclass({
	__idPrefix: "MultiSelectPanelViewer",

	_active: null,

	// ELW = EventListenersWrapper
	_elw: null,

	_eventManager: null,

	_tabsStoreAll: null,
	_tabsStoreInView: null,

	_cntAllElem: null,
	_cntInViewElem: null,
	_selectElem: null,
	_menuElem: null,
	_closeElem: null,

	_menuViewer: null,

_init: function(closeCb) {
	// Overriding the parent class' _init(), but calling that original function first
	Classes.Viewer._init.call(this);

	this.debug();

	this._tabsStoreAll = Classes.TabsStoreBase.createAs(this.getId() + ".tabsStoreAll");
	this._tabsStoreInView = Classes.TabsStoreBase.createAs(this.getId() + ".tabsStoreInView");
	this._active = false;

	this._elw = Classes.EventListenersWrapper.create();

	this._eventManager = Classes.EventManager.createAs(this.getId() + ".eventManager");
	this._eventManager.attachRegistrationFunctions(this);

	this._renderPanel();
	this.activate(false);
},

_renderPanel: function() {
	const cntInViewId = this._id + "-cnt-view";
	const cntAllId = this._id + "-cnt-all";
	const selectId = this._id + "-select";
	const menuId = this._id + "-menu";
	const closeId = this._id + "-close";

	const bodyHtml = `
	<div class="card tm-cursor-default">
		<div class="d-flex align-items-center">
			<input id="${selectId}" class="form-check-input mt-0 mx-1" type="checkbox" value="" style="min-width: 1em;">
			<div id="${menuId}" class=""></div>
			<div class="flex-fill mx-2 fst-italic fw-light"><span id="${cntInViewId}">0</span> in view (<span id="${cntAllId}">0</span> total)</div>
			<div>
				${icons.closeHtml(closeId, [], [ "tm-close-icon", "align-middle" ])}
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
	this._elw.listen(this._menuViewer, Classes.MultiSelectPanelMenuViewer.Events.TABSCLOSED, this._closeTabsCb.bind(this), false);

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

_closeCb: function(ev) {
	const logHead = "MultiSelectPanelViewer._closeCb():";
	this._log(logHead, "entering", ev);
	this._eventManager.notifyListeners(Classes.MultiSelectPanelViewer.Events.CLOSED);
},

_closeTabsCb: function(ev) {
	const logHead = "MultiSelectPanelViewer._closeTabsCb():";
	this._log(logHead, "not implemented", ev);
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

removeTab: function(tab) {
	const logHead = "MultiSelectPanelViewer.removeTab():";
	this._log(logHead, "removing tab", tab);
	this._tabsStoreAll.removeById(tab.id);
	this._tabsStoreInView.removeById(tab.id);

	this._updateCounts();
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
	this._menuViewer.setListSelectedMode(flag);
},

}); // Classes.MultiSelectPanelViewer

Classes.Base.roDef(Classes.MultiSelectPanelViewer, "Events", {});
Classes.Base.roDef(Classes.MultiSelectPanelViewer.Events, "SELECTED", "tmSelected");
Classes.Base.roDef(Classes.MultiSelectPanelViewer.Events, "CLOSED", "tmClosed");
Classes.Base.roDef(Classes.MultiSelectPanelViewer.Events, "LISTED", "tmListed");