// CLASS PersistentDict
//
// A PersistentDict is a Javascript Set backed by chrome.storage.
// Since we're using chrome.storage, the initialization of PersistentDict is async.
// Wait for getInitPromise() before starting to use the PersistentDict.
//
// Use PersistentDict.createAs() to initialize the object, the "_id" of the object is
// used as key in the storage object.
//
// This class generates events Classes.EventManager.Events.UPDATED, with "detail"
// set to { target: <this object> }.
Classes.PersistentDict = Classes.AsyncBase.subclass({

	// We're using the object "_id" as "_keyInStorage", so now "_keyInStorage"
	// is obsolete. Note that because of this choice, we can now see the storage
	// property name in the logs, but the same "_id" could be assigned to different
	// objects targeting the same storage key in different storage objects.
//	_keyInStorage: null,
	_storageObj: null,

	_dict: null,

	_eventManager: null,

	_initPromise: null,
	_initialized: null,

// "storageObj" is either chrome.storage.local (default) or chrome.storage.sync
_init: function(storageObj) {
	this.debug();

	// Set these properties before calling the parent _init(), because the
	// parent _init() will trigger _asyncInit(), and when _asyncInit() runs,
	// it needs to have these values available
//	this._keyInStorage = keyInStorage;
	this._storageObj = optionalWithDefault(storageObj, chrome.storage.local);

	this._eventManager = Classes.EventManager.create();
	this._eventManager.attachRegistrationFunctions(this);

	chrome.storage.onChanged.addListener(this._onStorageChangedCb.bind(this));

	// Overriding the parent class' _init(), but calling that original function first
	Classes.AsyncBase._init.apply(this, arguments);
},

_asyncInit: function() {
	// Overriding the parent class' _asyncInit(), but calling that original function first
	let parentPromise = Classes.AsyncBase._asyncInit();

	let thisPromise = chromeUtils.storageGet(this._id, this._storageObj).then(
		function(results) {
			const logHead = "PersistentDict::_initDict().cb: ";

			// Start empty
			this._dict = {};

			if(this._id in results) {
				this._dict = results[this._id];
				this._log(logHead + "initializing this._dict to ", this._dict);
			} else {
				this._log(logHead + "key " + this._id + " not found, initializing empty");
			}
		}.bind(this)
	);

	return Promise.all([ parentPromise, thisPromise ]);
},

// The following function is now replaced by:
//    	this._eventManager.notifyListeners(Classes.EventManager.Events.UPDATED);
//
// "extraData" is any extra properties you want in the "detail" section
// of the generated event
//_notifyListeners: function(extraData) {
//	extraData = optionalWithDefault(extraData, {});
//
//	let detail = Object.assign({ target: this }, extraData);
//	this._eventManager.dispatchEvent(Classes.EventManager.Events.UPDATED, detail);
//},

_onStorageChangedCb: function(changes, areaName) {
	const logHead = "PersistentDict::_onStorageChangedCb(" + areaName + "): ";

	if(!this.isInitialized()) {
		this._log(logHead + "still initializing, ignoring event");
		return;
	}

	if(chromeUtils.storageObjByAreaName(areaName) != this._storageObj) {
		this._log(logHead + "not my storage object, ignoring event");
		return;
	}

	if(!(this._id in changes)) {
		this._log(logHead + "not my storage key, ignoring event", changes);
		return;
	}

	if(tmUtils.isEqual(this._dict, changes[this._id].newValue)) {
		// We need to make this check because when we change a value, we receive
		// a notification locally anyway (and we don't want to).
		this._log(logHead + "the object has not changed, ignoring event", changes);
		return;
	}

	this._log(logHead + "setting to ", changes[this._id]);
	// If the key has been removed, we want to reinitialize _dict to {}
	this._dict = optionalWithDefault(changes[this._id].newValue, {});

	// Since we don't call _persist() in this case, we need to explicitly
	// dispatch the notification
	//this._notifyListeners();
	this._eventManager.notifyListeners(Classes.EventManager.Events.UPDATED);
},

// You can't store a Set object directly in chrome.storage, you need to convert it
// to an array for storage (so much for "chrome.storage is better than standard local
// storage because you don't need to serialize your data...").
// See: https://stackoverflow.com/questions/37850661/how-to-store-set-object-in-chrome-local-storage
// Switched back to Object because of that.
_persist: function() {
	var items = {};
	items[this._id] = this._dict;
	//this._notifyListeners();
	this._eventManager.notifyListeners(Classes.EventManager.Events.UPDATED);

	return chromeUtils.storageSet(items, this._storageObj);
},

// If "value" is "undefined", it gets turned to "null" for storage
set: function(key, value) {
	value = optionalWithDefault(value, null);

	let logHead = "PersistentDict::set(" + key + ", \"" + value + "\"): ";
	// Let's assert this for safety, just in case
	this._assert(this.isInitialized(), logHead + "still waiting for initialization");

	// We first need to check if the value has changed, because if a listener to our
	// _eventManager decides to set the value back here after listening to our own
	// event, we might end up in an infinite loop, and we definitely don't want that...
	if(tmUtils.isEqual(this._dict[key], value)) {
		// No change
		this._log(logHead + "the key has not changed, ignoring call");
//		this._log.trace(stackTrace());
		return Promise.resolve();
	}

	// A "key" in the _dict can be set to another dictionary (e.g., SettingsStore._customGroups),
	// so the problems described in setAll() and getAll() exist also in set() and get().
	this._dict[key] = tmUtils.deepCopy(value);
	return this._persist();
},

// Since set() turns "undefined" to "null", you can use "undefined" here
// to test for a "key" that's not in the dictionary. Alternatively you
// can use has() below.
get: function(key) {
	let logHead = "PersistentDict::get(): ";
	// Let's assert this for safety, just in case
	this._assert(this.isInitialized(), logHead + "still waiting for initialization");

	return tmUtils.deepCopy(this._dict[key]);
},

// "ignoreCase" (default "false") is used to check if the "key" exists in
// any upper/lower case combination. This doesn't mean you can call get()
// and set() in any combination (they're strictly case sensitive), but at
// least you can restrict the keys that can be added (useful for the titles
// of custom groups)
has: function(key, ignoreCase) {
	ignoreCase = optionalWithDefault(ignoreCase, false);

	let logHead = "PersistentDict::has(): ";
	// Let's assert this for safety, just in case
	this._assert(this.isInitialized(), logHead + "still waiting for initialization");

	if(!ignoreCase) {
		return (key in this._dict);
	}

	// ignoreCase == true
	let allKeys = Object.keys(this._dict);
	let searchKey = key.toLowerCase();
	let result = allKeys.findIndex(function(currKey) {
		return currKey.toLowerCase() == searchKey;
	});

	return result != -1;
},

// Rename by moving the object under a new key and deleting the old key.
// "key" must exist, and "newKey" must not exist.
rename: function(key, newKey) {
	let logHead = "PersistentDict::rename(" + key + ", " + newKey + "): ";
	// Let's assert this for safety, just in case
	this._assert(this.isInitialized(), logHead + "still waiting for initialization");

	if(!(key in this._dict)) {
		// No change
		this._log(logHead + "original key not in _dict, nothing to do");
		return Promise.resolve();
	}

	if(newKey in this._dict) {
		// Can't overwrite an existing key
		this._err(logHead + "new key already in _dict, can't overwrite");
		return Promise.reject();
	}

	this._dict[newKey] = this._dict[key];
	delete this._dict[key];

	this._log(logHead + "completed", this._dict);

	return this._persist();
},

del: function(key) {
	let logHead = "PersistentDict::del(): ";
	// Let's assert this for safety, just in case
	this._assert(this.isInitialized(), logHead + "still waiting for initialization");

	if(!(key in this._dict)) {
		// No change
		return Promise.resolve();
	}

	delete this._dict[key];
	return this._persist();
},

setAll: function(dict) {
	let logHead = "PersistentDict::setAll(): ";
	// Let's assert this for safety, just in case
	this._assert(this.isInitialized(), logHead + "still waiting for initialization");

	if(tmUtils.isEqual(this._dict, dict)) {
		// See set() for why we make this check
		this._log(logHead + "the object has not changed, ignoring call", dict, this._dict);
		return Promise.resolve();
	}

	// We need to always deep-clone in setAll() and getAll() if we always
	// want to be able to detect changes with the tmUtils.isEqual() above).
	// See getAll() for more details.
	this._dict = tmUtils.deepCopy(dict);
	return this._persist();
},

getAll: function() {
	let logHead = "PersistentDict::getAll(): ";
	// Let's assert this for safety, just in case
	this._assert(this.isInitialized(), logHead + "still waiting for initialization");

	//this._err("getAll(): this._dict = ", this._dict);

	// One problem here is that if we return "our" this._dict, the caller
	// might make changes to it, and since it's our dict, those changes will
	// be undetectable in setAll().
	// One option is to do a deep clone both before returning from getAll(),
	// as well as before setting in setAll() (otherwise the caller of setAll()
	// could make changes to the "their" object that we've set as ours, same
	// issue). We could do a shallow clone like "Object.assign({}, this._dict)",
	// but that would work now that we don't have complex structures, and might
	// break later when we add them down the road (and we forgot about this
	// comment (too brittle).
	// The other option is to assume that a caller of setAll() won't be so stupid
	// to trigger a notification loop, and call this._persist() unconditionally.
	// The real issue with the first option is only that we don't have a deep
	// copy function at our disposal, but that would be the right thing to do,
	// so we created one.
	return tmUtils.deepCopy(this._dict);
},

// Override parent class, in case of a Set, we just want to return an array of keys
getAllKeys: function() {
	let logHead = "PersistentSet::getAllKeys(): ";
	// Let's assert this for safety, just in case
	this._assert(this.isInitialized(), logHead + "still waiting for initialization");

	return Object.keys(this._dict);
},

}); // Classes.PersistentDict

// CLASS PersistentSet
//
// Initially this class was implemented via Javascript Set(), but then I discovered
// chrome.storage doesn't support Javascript Set() natively (see https://stackoverflow.com/questions/37850661/how-to-store-set-object-in-chrome-local-storage )
// Since we need to write the set every time it changes, I'd rather pay the serialization
// price inside the async call than in the synchronous call where it gets invoked.
// For this reason I switched back from Set() to Object keys.
// This class is a very simple wrapper of PersistentDict.
Classes.PersistentSet = Classes.PersistentDict.subclass({

// No need to override the parent class' _init()
//_init: function(keyInStorage, storageObj) {
//	// Overriding the parent class' _init(), but calling that original function first
//	Classes.PersistentDict._init.apply(this, arguments);
//},

// Replaces PersistentDict.set() by removing the "value" parameter.
// Probably a very dumb idea, what's the point? It's just that "adding" to a
// PersistentSet seems more accurate than "setting" to a set.
add: function(key) {
	return this.set(key);
},

// Override parent class, in case of a Set, we just want to return an array of keys
getAll: function() {
	return this.getAllKeys();
},

setAll: function(keys) {
	let logHead = "PersistentSet::setAll(): ";

	// Internally, PersistentDict.setAll() checks if the dictionary has changed. It's
	// a bit expensive to have to create the whole "dict" just to let PersistentDict.setAll()
	// find it's not changed, but it's better than having to check twice (once here, once
	// inside PersistentDict.setAll() if there are changes.
	// Also, tmUtils.isEqual() can validate two dictionaries are same even if the keys are
	// out of order, but can't do the same for arrays out of order, so let's just make this
	// check there...
	let dict = {};
	for(let i = 0; i < keys.length; i++) {
		dict[keys[i]] = null;
	}
	return Classes.PersistentDict.setAll.call(this, dict);
},

}); // Classes.PersistentSet
