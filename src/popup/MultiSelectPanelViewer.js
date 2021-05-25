// CLASS MultiSelectPanelViewer

Classes.MultiSelectPanelViewer = Classes.Viewer.subclass({
	__idPrefix: "MultiSelectPanelViewer",

	_active: null,

	// ELW = EventListenersWrapper
	_elw: null,

	_eventManager: null,

	_cntElem: null,
	_closeElem: null,

_init: function(closeCb) {
	// Overriding the parent class' _init(), but calling that original function first
	Classes.Viewer._init.call(this);

	this.debug();

	this._tabsStore = Classes.TabsStoreBase.create();
	this._active = false;

	this._elw = Classes.EventListenersWrapper.create();

	this._eventManager = Classes.EventManager.createAs(this.getId() + ".eventManager");
	this._eventManager.attachRegistrationFunctions(this);

	this._renderPanel();
	this.activate(false);
},

_renderPanel: function() {
	const cntId = this._id + "-cnt";
	const closeId = this._id + "-close";

	const bodyHtml = `
		<div class="card tm-cursor-default">
			<span id="${cntId}">0</span> Empty multi-select panel
			<button type="button" id="${closeId}" class="tm-close-icon-button" aria-label="Close">
				<span aria-hidden="true" class="tm-close-icon"></span>
			</button>
		</div>
	`;

	this._rootElem = this._elementGen(bodyHtml);
	this._cntElem = this.getElementById(cntId);
	this._closeElem = this.getElementById(closeId);
	this._elw.listen(this._closeElem, "click", this._closeCb.bind(this), false);
},

_closeCb: function(ev) {
	const logHead = "MultiSelectPanelViewer._closeCb():";
	this._log(logHead, "entering", ev);
	this._eventManager.notifyListeners(Classes.MultiSelectPanelViewer.Events.CLOSED);
},

discard: function() {
	this._rootElem.remove();

	this._elw.discard();
	this._elw = null;

	this._eventManager.discard();
	this._eventManager = null;

	if(this.isActive()) {
		this.activate(false);
	}
	gcChecker.add(this._tabsStore);
	this._tabsStore = null;

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
		this._tabsStore.reset();
	}
},

isActive: function() {
	return this._active;
},

addTab: function(tab) {
	const logHead = "MultiSelectPanelViewer.addTab():";
	this._log(logHead, "adding tab", tab);
	this._tabsStore.update(tab);

	this._cntElem.textContent = this._tabsStore.getCount();
},

removeTab: function(tab) {
	const logHead = "MultiSelectPanelViewer.removeTab():";
	this._log(logHead, "removing tab", tab);
	this._tabsStore.removeById(tab.id);

	this._cntElem.textContent = this._tabsStore.getCount();
},

}); // Classes.MultiSelectPanelViewer

Classes.Base.roDef(Classes.MultiSelectPanelViewer, "Events", {});
Classes.Base.roDef(Classes.MultiSelectPanelViewer.Events, "CLOSED", "tmClosed");