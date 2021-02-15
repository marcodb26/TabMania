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
	// - "activeTabId": the name of the Boostratp tab that's currently active
	_bootstrapTabs: null,

// No need to override _init(), we just need to override _asyncInit()

_asyncInit: function() {
	// Overriding the parent class' _asyncInit(), but calling that original function first.
	// We know that AsyncBase doesn't need to take any action, but let's use the right
	// pattern and include the parent class' promise as part of the list of promises
	// to wait for.
	let promiseArray = [ Classes.AsyncBase._asyncInit() ];

	this.allTabsTabExpandedGroups = Classes.PersistentSet.createAs("allTabsTab_expanded");
	promiseArray.push(this.allTabsTabExpandedGroups.getInitPromise());

	this._bootstrapTabs = Classes.PersistentDict.createAs("bootstrapTabs");
	promiseArray.push(this._bootstrapTabs.getInitPromise());

	return Promise.all(promiseArray).then(
		function() {
			perfProf.mark("localStoreLoaded");
		}
	);
},

getActiveBsTab: function() {
	return this._bootstrapTabs.get("activeTabId");
},

setActiveBsTab: function(bsTabName) {
	return this._bootstrapTabs.set("activeTabId", bsTabName);
},

}); // Classes.LocalStore

perfProf.mark("localStoreStarted");
// Create a global variable "localStore", but force it readonly, so it doesn't get
// overwritten by mistake.
// Remember to wait for the localStore init promise to be completed before starting
// to access the object.
Classes.Base.roDef(window, "localStore", Classes.LocalStore.create());
localStore.debug();
