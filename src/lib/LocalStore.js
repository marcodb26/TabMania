// It would be cleaner to encapsulate persistent state in the classes that
// own it (e.g. _expandedGroups are needed only by TabsBsTabViewer), but the
// problem is that these persistent pieces require async initial loading,
// and if we initialize them in other classes, using those classes will
// need to wait until this async initialization is done.
// Async initialization is not a problem, the problem is that by spreading
// these async initializers we're creating sequential chains of async initializers
// for things that could be done in parallel. For example: _expandedGroups
// initialization doesn't need to wait for the window to load, or for the
// "settingsStore" to load, but TabsBsTabViewer does. If we wait to initialize
// _expandedGroups in TabsBsTabViewer, we miss an opportunity to have it already
// reay by the time TabsBsTabViewer gets initialized.
// Since the popup gets rebuilt from scratch every time the user clicks the
// extension icon, we need to optimize startup performance to avoid too long
// a delay when that click happens.


// CLASS LocalStore
//
// All the settings are stored in chrome.storage.local.
//
// Current settings list
//
// - standardTabsBsTab_expanded: list of expanded tab groups for "standardTabsBsTab"
// - incognitoTabsBsTab_expanded: list of expanded tab groups for "incognitoTabsBsTab"
// - bootstrapTabs: persistent properties for Bootstrap tabs
//
Classes.LocalStore = Classes.AsyncBase.subclass({
	_storageKeyPrefix: "",

	// Giving a very specific name, because different Bootstrap tabs
	// might need to remember different sets of expanded groups.
	standardTabsBsTabExpandedGroups: null,
	incognitoTabsBsTabExpandedGroups: null,

	// _bootstrapTabs contains:
	// - "activeTabId": the name of the Boostrap tab that's currently active
	// - (obsolete) "docked": whether or not the popup is docked (default "false", undocked)
	// - "popupSize": an object describing the size and position of the undocked popup
	_bootstrapTabs: null,

	_eventManager: null,

	// Shadow flag tracking chrome.extension.isAllowedIncognitoAccess()
	_incognitoAccess: null,

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
	const logHead = "LocalStore::_asyncInit(): ";
	// Overriding the parent class' _asyncInit(), but calling that original function first.
	// We know that AsyncBase doesn't need to take any action, but let's use the right
	// pattern and include the parent class' promise as part of the list of promises
	// to wait for.
	let promiseArray = [ Classes.AsyncBase._asyncInit.call(this) ];

	this.standardTabsBsTabExpandedGroups = Classes.PersistentSet.createAs("standardTabsBsTab_expanded");
	promiseArray.push(this.standardTabsBsTabExpandedGroups.getInitPromise());
	// We currently don't want to have uniformity in expanded groups across all open
	// popups, so no need to listen to these events
//	this.standardTabsBsTabExpandedGroups.addEventListener(Classes.EventManager.Events.UPDATED, this._onUpdatedCb.bind(this));

	this.incognitoTabsBsTabExpandedGroups = Classes.PersistentSet.createAs("incognitoTabsBsTab_expanded");
	promiseArray.push(this.incognitoTabsBsTabExpandedGroups.getInitPromise());

	this._bootstrapTabs = Classes.PersistentDict.createAs("bootstrapTabs");
	promiseArray.push(this._bootstrapTabs.getInitPromise());
	this._bootstrapTabs.addEventListener(Classes.EventManager.Events.UPDATED, this._onUpdatedCb.bind(this));

	// This is not really our configuration (and not even sure if it's local or global, that
	// is if it belongs to the LocalStore or the SettingsStore class), but we know that:
	// 1. Whenever the extension "incognito" config changes, the extension is restarted
	// 2. There are no events to track changes for this flag (making (1) the only way to find out)
	// This means that we can read this flag asynchronously once, and store it forever at runtime.
	// We could do this anywhere, LocalStore is as good a place as any... and the whole TabMania
	// initialization waits for this class to complete _asyncInit() already anyway.
	promiseArray.push(chromeUtils.wrap(chrome.extension.isAllowedIncognitoAccess, logHead).then(
		function(isAllowedAccess) {
			this._incognitoAccess = isAllowedAccess;
		}.bind(this)
	));

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

getActiveBsTabId: function() {
	return this._bootstrapTabs.get("activeTabId");
},

setActiveBsTabId: function(bsTabId) {
	return this._bootstrapTabs.set("activeTabId", bsTabId);
},

// Same name as popupDocker.isPopupDocked(), but this function returns the stored value,
// while popupDocker.isPopupDocked() returns the current state for the current popup
isPopupDocked: function() {
	// Undocked is now the only valid value, as of v2.0
	return false; // this._bootstrapTabs.get("docked") ?? false;
},

setPopupDocked: function(docked) {
	// Undocked is now the only valid value, as of v2.0
	return Promise.resolve(); // this._bootstrapTabs.set("docked", docked);
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

isAllowedIncognitoAccess: function() {
	return this._incognitoAccess;
},

}); // Classes.LocalStore

perfProf.mark("localStoreStarted");
// Create a global variable "localStore", but force it readonly, so it doesn't get
// overwritten by mistake.
// Remember to wait for the localStore init promise to be completed before starting
// to access the object.
Classes.Base.roDef(window, "localStore", Classes.LocalStore.create());
localStore.debug();
