// It would be cleaner to encapsulate persistent state in the classes that
// own it (e.g. _expandedGroups are needed only by TabsTabViewer), but the
// problem is that these persistent pieces require async initial loading,
// and if we initialize them in other classes, using those classes will
// need to wait until this async initialization is done.
// Async initialization is not a problem, the problem is that by spreading
// these async initializers we're creating sequential chains of async initializers
// for things that could be done in parallel. For example: _expandedGroups
// initialization doesn't need to wait for the window to load, or for the
// "settingsStore" to load, but TabsTabViewer does. If we wait to initialize
// _expandedGroups in TabsTabViewer, we miss an opportunity to have it already
// reay by the time TabsTabViewer gets initialized.
// Since the popup gets rebuilt from scratch every time the user clicks the
// extension icon, we need to optimize startup performance to avoid too long
// a delay when that click happens.


// CLASS LocalStore
//
// All the settings are stored in chrome.storage.local.
//
// Current settings list
//
// - allTabsTab_expanded: list of expanded tabs for the "allTabs" tab
// - bootstrapTabs: persistent properties for Bootstrap tabs
//
Classes.LocalStore = Classes.AsyncBase.subclass({
	_storageKeyPrefix: "",

	// Giving a very specific name, because different Bootstrap tabs
	// might need to remember different sets of expanded groups.
	allTabsTabExpandedGroups: null,

	// _bootstrapTabs contains:
	// - "activeTabId": the name of the Boostrap tab that's currently active
	// - "docked": whether or not the popup is docked (default "true", docked)
	// - "popupSize": an object describing the size and position of the undocked popup
	_bootstrapTabs: null,

	_eventManager: null,

// We need to override _init() to support listeners' registration as soon as
// the object is created, even if the full initialization will need to be async
_init: function(storageKeyPrefix) {
	this.debug();

	this._eventManager = Classes.EventManager.create();
	this._eventManager.attachRegistrationFunctions(this);

	// Overriding the parent class' _init(), but calling that original function first
	Classes.AsyncBase._init.call(this);
},

_asyncInit: function() {
	// Overriding the parent class' _asyncInit(), but calling that original function first.
	// We know that AsyncBase doesn't need to take any action, but let's use the right
	// pattern and include the parent class' promise as part of the list of promises
	// to wait for.
	let promiseArray = [ Classes.AsyncBase._asyncInit() ];

	this.allTabsTabExpandedGroups = Classes.PersistentSet.createAs("allTabsTab_expanded");
	promiseArray.push(this.allTabsTabExpandedGroups.getInitPromise());
	// We currently don't want to have uniformity in expanded groups across all open
	// popups, so no need to listen to these events
//	this.allTabsTabExpandedGroups.addEventListener(Classes.EventManager.Events.UPDATED, this._onUpdatedCb.bind(this));

	this._bootstrapTabs = Classes.PersistentDict.createAs("bootstrapTabs");
	promiseArray.push(this._bootstrapTabs.getInitPromise());
	this._bootstrapTabs.addEventListener(Classes.EventManager.Events.UPDATED, this._onUpdatedCb.bind(this));

	return Promise.all(promiseArray).then(
		function() {
			perfProf.mark("localStoreLoaded");
		}
	);
},

_onUpdatedCb: function(ev) {
	let key = ev.detail.target.getId();
	this._eventManager.notifyListeners(Classes.EventManager.Events.UPDATED, { key: key });
},

getActiveBsTab: function() {
	return this._bootstrapTabs.get("activeTabId");
},

setActiveBsTab: function(bsTabName) {
	return this._bootstrapTabs.set("activeTabId", bsTabName);
},

// Same name as popupDocker.isPopupDocked(), but this function returns the stored value,
// while popupDocker.isPopupDocked() returns the current state for the current popup.
isPopupDocked: function() {
	// Undocked is the new default
	return optionalWithDefault(this._bootstrapTabs.get("docked"), false);
},

setPopupDocked: function(docked) {
	return this._bootstrapTabs.set("docked", docked);
},

getPopupSize: function() {
	return this._bootstrapTabs.get("popupSize");
},

setPopupSize: function(posX, posY, width, height) {
	size = {
		posX: posX,
		posY: posY,
		width: width,
		height: height,
	};

	return this._bootstrapTabs.set("popupSize", size);
},

}); // Classes.LocalStore

perfProf.mark("localStoreStarted");
// Create a global variable "localStore", but force it readonly, so it doesn't get
// overwritten by mistake.
// Remember to wait for the localStore init promise to be completed before starting
// to access the object.
Classes.Base.roDef(window, "localStore", Classes.LocalStore.create());
localStore.debug();
