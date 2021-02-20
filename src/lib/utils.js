// This file should be included first, given the basic stuff that's defined here.

// OOP model used in this code
//
// All classes are objects defined under the "Classes" namespace.
// To subclass, use:
//        Classes.subClass = Classes.parentClass.subclass({ ... new definitions });
// or alternatively:
//        Classes.subClass = Object.assign({}, Classes.parentClass, { ... new definitions });
//
// To instantiate an object of a class, use:
//        obj = Classes.class.create();
//
// All classes should subclass Classes.Base, as it defines some common properties and the
// create() behavior.
// Classes.class.create() creates an instance of a Classes.class, and by default it assigns
// it an internal identifier. The internal identifier can be overridden by passing a different
// identifier to create(). The internal identifier gets allocated anyway, even if you override
// the _id of the instance, but it won't be visible.
// The identifier is automatically prepended to all calls to console.log() and console.err()
// if you use the local wrappers _log() and _err().
//
// When you subclass Classes.Base, never override create(), constructor capabilities are
// offered by the _init() function.
//
// Other conventions
// - Public interfaces of a class have names starting with letters, "private" methods have
//   names starting with "_". This is just a visual convention, convenient for code inspection,
//   but with no enforcing at runtime.
// - Function with the "Cb" postfix are "callbacks".
// - If a class defined an abstract function (which must be overridden), use the function
//   _errorMustSubclass() to track potential calls of the function in a subclass that didn't
//   properly override.

function setProd(flag) {
	Object.defineProperty(window, "productionCode", {
		value: flag,
		// You must use "configurable: true" to be able to change a property again by
		// calling Object.defineProperty() multiple times on the same property (or to
		// delete the property).
		// See https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/defineProperty
		configurable: false,
		enumerable: false,
		writable: false
	});
}

function isProd() {
	return window.productionCode;
}

setProd(false);


Classes = {};

// CLASS Base
// This class is "abstract", it's intended to only be subclassed.
Classes.Base = {

	// The _id property will be defined at create() time
	// _id: null,
	
	// Using _Base_ to avoid polluting the main namespace. In the old days you could
	// do this with an anonymous function.
	_Base_: {
		// Static property
		lastId: 0,
		_idGen: function() {
			return ++(this.lastId);
		}
	},

	// Subclasses that want to modify the default behavior of _formatId() should override
	// __idPrefix during class definition. Initialize here, to use this as a static, overridable
	// property.
	// See _formatId() for details, and Classes.TileViewer for an example use.
	__idPrefix: null,

// Static function (here meaning, it doesn't use "this", though that's not always true,
// it could use the "this" of the class (like _Base_._idGen(), not the "this" of the instance,
// and still be static).
roDef: function(obj, propName, propValue) {
	Object.defineProperty(obj, propName, {
		value: propValue,
		// You must use "configurable: true" to be able to change a property again by
		// calling Object.defineProperty() multiple times on the same property (or to
		// delete the property).
		// See https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/defineProperty
		configurable: true,
		enumerable: false,
		writable: false
	});
},

// "setPrefix" (default "false") is a flag that controls whether or not the returned log
// function should have a standard prefix attached.
// Note that the standard prefix (or any prefix) must actually consume the "msg" argument
// of the log(), so it can be a problem if you want to use formatting characters and
// substitution in your log message, as that can only happen in the first argument "msg".
// See https://developer.mozilla.org/en-US/docs/Web/API/Console/log and
// https://developer.mozilla.org/en-US/docs/Web/API/console#outputting_text_to_the_console 
// "setPrefix = false" allow you to keep the "msg" argument available to be used by callers
// of the generated log function
_genLogFn: function(consoleFn, setPrefix) {
	setPrefix = optionalWithDefault(setPrefix, false)
	if(!setPrefix) {
		// Leave "msg" alone
		return Function.prototype.bind.call(consoleFn, console);
	}

	// https://stackoverflow.com/questions/9559725/extending-console-log-without-affecting-log-line
// With highlight:
//	const context = "%c[" + this._id + "]";
//	return Function.prototype.bind.call(consoleFn, console, context, "font-weight:bold;");
	const context = "[" + this._id + "]";
	return Function.prototype.bind.call(consoleFn, console, context);
},

//_activeAssert: function(conditionToBeTrue, errMsg) {
//	errMsg = optionalWithDefault(errMsg, "assertion failed");
//	if(!conditionToBeTrue) {
//		this._err(errMsg);
//	}
//},

// create() functions as a constructor. You should not need to subclass the create() function,
// only change _init() to alter the constructor's behavior. create() passes all its arguments
// to _init().
// If you need to override the standard ID assigned by create(), use createAs() instead.
create: function(/* ... */) {
	return this.createAs(null, ...arguments);
},

// Similar to create(), except that it allows you to override the ID of the instance.
// Use "rest arguments" to collect all arguments after "id" as an array.
createAs: function(id, ...restArgs) {
	// See https://stackoverflow.com/questions/10430279/extending-an-object-in-javascript
	// Why did I follow that convention, it's crazy... there's no constructor, which means
	// we need to manually initialize this._data somehow (don't initialize it in this
	// object, otherwise all instances will share the same array (!)), but we need to
	// call Object.create() with an object, and we can't use PollerC, otherwise all the
	// subclasses will instantiate PollerC instead of the subclass...
	// Luckily Object.create() using "this" works fine...
	// There must be a better way, the old fashioned messing around with function().prototype
	// sounded a lot better than this crap...

	var retVal = Object.create(this);
	// Assign a read-only ID to the object
	this.roDef(retVal, "_hiddenId", this._Base_._idGen());
	//console.log("retVal._hiddenId = " + retVal._hiddenId);
	// Calling _formatId() gives an opportunity for subclasses to format IDs differently
	// since all of this happens before _init() is invoked.
	this.roDef(retVal, "_id", (id == null) ? this._formatId(retVal._hiddenId) : id);

	// We need to define these methods this way because they need to use the _id of
	// the instance, and this is the only way to inject that value in the wrappers.
	// The advantage of using these wrappers is that the Chrome console will show the
	// right line numbers (of the callers), not the line numbers inside the wrapper
	// functions.

	// this.debug() can be used to initialize everything except retVal._err()
	// We're calling _genLogFn() in the context of retVal, since we need to create
	// the log prefix using the _id of retVal
//	this.roDef(retVal, "_log", this._genLogFn.call(retVal, console.log));
//	this.roDef(retVal, "_log", emptyFn);
	this.debug.call(retVal, false);
	this.roDef(retVal, "_err", this._genLogFn.call(retVal, console.error, true));
	// We want the option to replace _assert() with an empty function in production.
	// Don't use "setPrefix" (set it to "false" or omit it) for _genLogFn() of _assert(),
	// otherwise the prefix takes the place of the boolean assertion(!)
	this.roDef(retVal, "_assert", this._genLogFn.call(retVal, console.assert));

	// Complete initialization of the class, pass all arguments received by createAs()
	// to _init(), except the "id", which is available as this._id inside _init()
	retVal._init.apply(retVal, restArgs);
	return retVal;
},

// Turn on (flag = true, default) or off (flag = false) logging to console.
// Note that logging errors (_err()) can't be disabled right now.
debug: function(flag) {
	flag = optionalWithDefault(flag, true);
	if(flag && !isProd()) {
		this.roDef(this, "_log", this._genLogFn(console.log, true));
		this.roDef(this._log, "raw", this._genLogFn(console.log, false));
		this.roDef(this._log, "trace", this._genLogFn(console.trace, true));
		// console.log() and console.info() are identical in Chrome.
		// See https://developers.google.com/web/tools/chrome-devtools/console/api#info
		// Maybe we should use console.debug and console.info to differentiate,
		// something to consider later...
	//	this.roDef(this._log, "info", this._genLogFn(console.info, true));
	} else {
		this.roDef(this, "_log", emptyFn);
		this.roDef(this._log, "raw", emptyFn);
		this.roDef(this._log, "trace", emptyFn);
	//	this.roDef(this._log, "info", emptyFn);
	}
},

subclass: function(extension) {
	return Object.assign({}, this, extension);
},

getId: function() {
	return this._id;
},

// Use _init() to perform initialization in your constructor.
_init: function() {
	// Nothing extra to do for Classes.Base, just including this function here for completeness
},

// Override this function to trigger a different behavior for the default ID.
// This function doesn't get invoked if createAs() was called with an "id" argument.
// By default this function adds the __idPrefix to create unique IDs that are also
// a bit more readable as DOM IDs.
// "hiddenId" is the this._hiddenId.
_formatId: function(hiddenId) {
	if(this.__idPrefix == null) {
		// Default behavior, identity function
		return hiddenId;
	}

	return this.__idPrefix + "-" + hiddenId;
},

_errorMustSubclass: function(signature) {
    return Function.prototype.bind.call(console.error, console, "This method must be subclassed: " + signature);
}(),

}; // Classes.Base

// CLASS AsyncBase
// This class defines a version of Array that automatically forces its size to a
// max of "maxElements"
Classes.AsyncBase = Classes.Base.subclass({
	_initPromise: null,
	_initialized: null,

_init: function(maxElements) {
	// Overriding the parent class' _init(), but calling that original function first
	Classes.Base._init.apply(this, arguments);

	this._initialized = false;
	this._initPromise = this._asyncInit().then(
		function() {
			this._initialized = true;
		}.bind(this)
	);
},

_asyncInit: function() {
	return Promise.resolve();
},

isInitialized: function() {
	return this._initialized;
},

getInitPromise: function() {
	return this._initPromise;
},

});

// CLASS BoundArray
// This class defines a version of Array that automatically forces its size to a
// max of "maxElements"
Classes.BoundArray = Classes.Base.subclass({
	_array: null,
	_maxElements: null,

_init: function(maxElements) {
	// Overriding the parent class' _init(), but calling that original function first
	Classes.Base._init.apply(this, arguments);
	this._maxElements = maxElements;
	this._array = [];
},

resize: function() {
	if(this._array.length >= this._maxElements) {
		this._array.splice(0, this._maxElements - this._array.length);
	}
	return this._array.length;
},

// This function behaves like Array.push(), as it returns the new length of the array,
// except that the length of the array will not change if the array has "maxElements"
// elements in it.
push: function(value) {
	this._array.push(value);
	return this.resize();
},

pop: function() {
	return this._array.pop();
},

isEmpty: function() {
	return this._array.length == 0;
},

// Look at the top of the stack, that is, the next element that would be popped.
// This function returns "null" if the array is empty. If "null" is a valid value
// for the data in _array, make sure to call isEmpty() before calling this function,
// otherwise the return value will be ambiguous.
// The optional parameter "cnt" allows to query for up to "cnt" array elements starting
// from the top. Note that if "cnt" is omitted, the single value is returned as a value,
// while if "cnt" is set (even if "cnt == 1"), the return value is an array of values.
peek: function(cnt) {
	if(this.isEmpty()) {
		return null;
	}

	if(cnt == null) {
		return this._array[this._array.length - 1];
	}

	if(cnt > this._array.length) {
		cnt = this._array.length;
	}
	// Slice from the end of the array.
	return this._array.slice(-cnt);
},

// Unlike Array.concat(), this function pushes multiple value to the existing array
// (concat() pushes the value in a new array).
// "value" is an array of values.
append: function(value) {
	// Using spread operator to add values
	this._array.splice(-1, 0, ...value);
	return this.resize();
},

// Scan the array, and remove all occurrences of a specific value.
// This function uses Array.indexOf() and can only test for equality. If you need
// a more complex test, you should use Array.findIndex() instead.
removeValue: function(value) {
	var nextIndex = 0;

	// Continue searching from where you left off. Since we delete one element
	// at a time, nextIndex is always looking at a new starting point even if
	// the actual index looks the same.
	while((nextIndex = this._array.indexOf(value, nextIndex)) != -1) {
		// Delete one element from the array
		this._array.splice(nextIndex, 1);
	}
},

// "pos" is optional. If specified, returns that value, if not, returns the whole
// array. A couple of things to notice:
// - This function is provided to read the array, not to write it. If you write to
//   the array through this function, you're kind of defeating the purpose of this
//   class, but if you know what you're doing, go for it, and possibly call resize()
//   explicitly if you grow the size of the array.
// - The array indices will change when resize() is called, so it's best to iterate
//   the array with one of the Array iterators, rather than a for loop.
get: function(pos) {
	if(pos != undefined) {
		return this._array[pos];
	}
	return this._array;
},

}); // Classes.BoundArray


// CLASS EventManager
// A simple wrapper to the DOM event functions.
// Note that the element created by this class should never be attached
// to the DOM.
//
// Only one instance of a class should own an instance of EventManager
// if you want to use the notifyListeners() interface. If you need to
// share, use the underlying dispatchEvent() instead.
Classes.EventManager = Classes.Base.subclass({
	_elem: null,

	_ownerObj: null,

_init: function() {
	// Overriding the parent class' _init(), but calling that original function first
	Classes.Base._init.call(this);
	this._elem = document.createElement("div");

	this.addEventListener = this._elem.addEventListener.bind(this._elem);
	this.removeEventListener = this._elem.removeEventListener.bind(this._elem);
},

dispatchEvent: function(eventName, detailObj) {
	// See https://developer.mozilla.org/en-US/docs/Web/Guide/Events/Creating_and_triggering_events
	// and https://developer.mozilla.org/en-US/docs/Web/API/CustomEvent
	// Note that "detail" is the preferred key to be used, per the documents above
	this._elem.dispatchEvent(new CustomEvent(eventName, { detail: detailObj }));
},

// This function generates a standard event, including a "detail.target" with
// the current objec owning the EventManager.
// "extraData" is any extra properties you want in the "detail" section
// of the generated event
notifyListeners: function(eventId, extraData) {
	extraData = optionalWithDefault(extraData, {});

	let detail = Object.assign({ target: this._ownerObj }, extraData);
	this.dispatchEvent(eventId, detail);
},

// Attaches addEventListener() and removeEventListener() to "obj", so that
// it can behave as if it "owned" the events in its interface
attachRegistrationFunctions: function(obj) {
	// Note, no need to add .bind() here, it's already bound by _init()
	// to the this._elem context.
	obj.addEventListener = this.addEventListener;
	obj.removeEventListener = this.removeEventListener;

	// We assume a single instance of a class owns an instance of EventManager,
	// so that instance should call attachRegistrationFunctions() only once...
	this._assert(this._ownerObj == null);
	this._ownerObj = obj;
},

addEventListener: function() {
	// Empty placeholder, replaced during _init(), don't write code here
},

removeEventListener: function() {
	// Empty placeholder, replaced during _init(), don't write code here
},

}); // Classes.EventManager

Classes.Base.roDef(Classes.EventManager, "Events", {});
Classes.Base.roDef(Classes.EventManager.Events, "UPDATED", "tmUpdated");


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

// This is not a general purpose version of objects equality comparison, it's
// simplified based on the fact that we expect to store in chrome storage only
// simple values, not functions, or complex objects.
// It doesn't even check arrays... (which is something we might need to implement
// later if we happen to have arrays to store).
_isEqual: function(objA, objB) {
	const logHead = "PersistentDict::_isEqual(): ";
	if(typeof objA != typeof objB) {
		return false;
	}

	if(typeof objA != "object") {
		// arrays return "object", so we're in scalar-land
		// Use exact equality, we don't want "undefined" and "false" to be
		// matching, or things like that
		this._assert(![ "function", "symbol" ].includes(typeof objA),
					logHead + "\"" + typeof objA + "\" is not supported");
		return objA === objB;
	}

	// objA and objB are objects...
	this._assert(!Array.isArray(objA), logHead + "arrays are not supported");

	// "null" is of typeof "object"
	if(objA == null || objB == null) {
		return objA === objB;
	}

	let keysA = Object.keys(objA).sort();
	let keysB = Object.keys(objB).sort();

	if(keysA.length != keysB.length) {
		return false;
	}

	for(let i = 0; i < keysA.length; i++) {
		if(keysA[i] != keysB[i]) {
			return false;
		}
		if(!this._isEqual(objA[keysA[i]], objB[keysB[i]])) {
			return false;
		}
	}
	return true;
},

// Not general purpose, no support for Arrays, functions or symbols
_deepClone: function(obj) {
	const logHead = "PersistentDict::_deepClone(): ";

	// See https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/typeof
	// "undefined" is of type "undefined", but "null" and Array are of type "object"
	if(obj === undefined) {
		return undefined;
	}

	if(typeof obj != "object") {
		// arrays return "object", so we're in scalar-land
		// Use exact equality, we don't want "undefined" and "false" to be
		// matching, or things like that
		this._assert(![ "function", "symbol" ].includes(typeof objA),
					logHead + "\"" + typeof objA + "\" is not supported");
		return obj;
	}

	// "null" is of typeof "object"
	if(obj == null) {
		return null;
	}

	// obj is a non-null objects...
	this._assert(!Array.isArray(obj), logHead + "arrays are not supported");

	let retVal = {};

	let keys = Object.keys(obj);
	for(let i = 0; i < keys.length; i++) {
		retVal[keys[i]] = this._deepClone(obj[keys[i]]);
	}
	return retVal;
},

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

	if(this._isEqual(this._dict, changes[this._id].newValue)) {
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
	// vent, we might end up in an infinite loop, and we definitely dont want that...
	if(this._isEqual(this._dict[key], value)) {
		// No change
		this._log(logHead + "the key has not changed, ignoring call");
//		this._log.trace(stackTrace());
		return Promise.resolve();
	}

	// A "key" in the _dict can be set to another dictionary (e.g., SettingsStore._customGroups),
	// so the problems described in setAll() and getAll() exist also in set() and get().
	this._dict[key] = this._deepClone(value);
	return this._persist();
},

// Since set() turns "undefined" to "null", you can use "undefined" here
// to test for a "key" that's not in the dictionary. Alternatively you
// can use has() below.
get: function(key) {
	let logHead = "PersistentDict::get(): ";
	// Let's assert this for safety, just in case
	this._assert(this.isInitialized(), logHead + "still waiting for initialization");

	return this._deepClone(this._dict[key]);
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

	if(this._isEqual(this._dict, dict)) {
		// See set() for why we make this check
		this._log(logHead + "the object has not changed, ignoring call", dict, this._dict);
		return Promise.resolve();
	}

	// We need to always deep-clone in setAll() and getAll() if we always
	// want to be able to detect changes with the _isEqual() above).
	// See getAll() for more details.
	this._dict = this._deepClone(dict);
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
	return this._deepClone(this._dict);
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

}); // Classes.PersistentSet

// CLASS MsgServer
//
// After instantiating a MsgServer, use addCmd() to add protocol actions to be taken. After you've
// added all the commands, call start() to start listening for incoming requests. You can continue
// to add commands after start(), but until you do, the server will send a generic "unknown command"
// error if those commands are requested.

// See the definition of addCmd() for details.
Classes.MsgServer = Classes.Base.subclass({
	_cmdMap: null,

_init: function() {
	// Overriding the parent class' _init(), but calling that original function first
	Classes.Base._init.apply(this, arguments);

	this._cmdMap = {};
},

start: function() {
	// See https://developer.chrome.com/docs/extensions/mv2/messaging/#simple
	chrome.runtime.onMessage.addListener(this._processMsgCb.bind(this));
},

_printTabInfo: function(tab) {
	if(tab) {
		return tab.id;
		//return tab.url;
	}
	
	return "[extension]";
},

_processMsgInner: function(request, sender, sendResponse) {
	// Note that there are some assumptions about this function's behavior made in
	// _processMsgCb(), so if you make changes here, make sure you don't break them,
	// or go change that code too.
	// The assumption is that this function can return "null" only if "request.cmd in this._cmdMap",
	// so the caller doesn't need to check "request.cmd in this._cmdMap" again there.
	if(request.cmd in this._cmdMap) {
		return this._cmdMap[request.cmd].fn.apply(this, arguments);
	} else {
		return this.formatErrMsg("unknown command: " + request.cmd);
	}
},

// Process incoming request. This function is designed for intra-browser messaging.
// This function can have an override if you need native messaging or other messaging,
// and _processMsgInner() is provided in case the override wants to use that basic
// protocol processing functionality.
_processMsgCb: function(request, sender, sendResponse) {
	const logHead = "MsgServer::_processMsgCb(from tab " + this._printTabInfo(sender.tab) + "): ";
	this._log(logHead + JSON.stringify(request), sender);

	var response = this._processMsgInner.apply(this, arguments);

	if(response == null) {
		// Note that given the way _processMsgInner() behaves, "response == null" can be
		// true only if "request.cmd in this._cmdMap"
		if(this._cmdMap[request.cmd].needResponse) {
			// You must return "true", otherwise the sendResponse won't work, Chrome will
			// close the message port when this function returns. Returning "true" tells
			// Chrome the response will be sent asynchronously.
			// See https://stackoverflow.com/questions/44056271/chrome-runtime-onmessage-response-with-async-await
			return true;
		}
		// This is the case of processing a notification that doesn't require a response.
		// I've searched a lot, but couldn't find any documentation describing how to handle
		// proper "notifications", it looks like the Chrome messaging APIs always need a
		// response, so let's send a dummy one here...
		sendResponse("");
		return false;
	}

	// this._log(logHead + "the response is: ", response);
	sendResponse(response);
	return false;
},

// "fn" has signature fn(request, sender, sendResponse).
// "fn" must return a response object if "fn" is synchronous, or "null" to signal
// that the function is async, and therefore it will respond later by itself.
// "fn" should call "sendResponse" only in the async case, not in the sync case.
// Set "needResponse" to "false" if this command is a notification, not a request/response.
// When "needResponse" is "false", this class doesn't try to call sendResponse()
// (see _processMsgCb())
addCmd: function(cmd, fn, needResponse) {
	needResponse = optionalWithDefault(needResponse, true);

	var cmdWrapper = safeFnWrapper(fn, null,
		function(e) {
			this._err("cmd \"" + cmd + "\" generated an exception: ", e);
			return this.formatErrMsg(e.message, e.toString());
		}.bind(this)
	);

	this._cmdMap[cmd] = { fn: cmdWrapper, needResponse: needResponse };
},

// This function can be used as a static function (Classes.MsgServer.formatErrMsg())
formatErrMsg: function(msg, details) {
	var retVal = { status: "error", message: msg };
	if(details != null) {
		retVal.details = details;
	}
	return retVal;
},

}); // CLASS MsgServer


// CLASS MsgClient
//
// This is a simple Promise-based wrapper of chrome.runtime.sendMessage() that tracks
// chrome.runtime.lastError as a Promise.reject().
// Note that only "transport level errors" (that is, chrome.runtime.lastError) trigger a
// onRejected() callback from the Promise. "Protocol level errors" (that is, response.status = "error")
// should be handled as part of the onFulfilled() callback.

Classes.MsgClient = Classes.Base.subclass({

_init: function() {
	// Overriding the parent class' _init(), but calling that original function first
	Classes.Base._init.apply(this, arguments);
},

// This implementation of _requestInner() is intended for intra-browser messaging.
// For native messaging, you need to override it.
_requestInner: function(request) {
	const logHead = "MsgClient::_requestInner(" + JSON.stringify(request) + "): ";
	this._log(logHead + "entering")
	return chromeUtils.wrap(chrome.runtime.sendMessage, logHead, request);
},

_formatRequest: function(cmd, otherOptions) {
	return { cmd: cmd, ...otherOptions };
},

sendRequest: function(cmd, otherOptions) {
	const request = this._formatRequest.apply(this, arguments);

	return this._requestInner(request).then(
		function(response) {
			this._debugResponse(cmd, response);
			return response;
		}.bind(this)
	);
},

sendNotification: function(cmd, otherOptions) {
	const notification = this._formatRequest.apply(this, arguments);

	// The only difference between sendRequest() and sendNotification() is that
	// sendNotification() doesn't expect a response, so there's no point in having
	// a then().
	return this._requestInner(notification);
},

_debugResponse: function(cmd, response) {
	const logHead = "MsgClient::_debugResponse(" + cmd + "): ";
	if(response.status != "success") {
		this._err(logHead + "response failed: " + JSON.stringify(response));
	}
},

}); // Classes.MsgClient

// CLASS Error
Classes.Error = Classes.Base.subclass({
_init: function() {
	// Overriding the parent class' _init(), but calling that original function first
	Classes.Base._init.apply(this, arguments);
},

}); // Classes.Error

Classes.Base.roDef(Classes.Error, "NOTRUNNING", "Not running");


// CLASS PerfProfiler
//
Classes.PerfProfiler = Classes.Base.subclass({

_init: function() {
	// Overriding the parent class' _init(), but calling that original function first
	Classes.Base._init.call(this);
	this.debug();
},

mark: function(mark) {
	performance.mark(mark);
},

measure: function(name, startMark, endMark) {
	performance.measure(...arguments);
},

log: function() {
	const logHead = "PerfProfiler::log(): ";
	this._log.raw("%c" + logHead + "type measure: %o", "background-color: powderblue;",
				performance.getEntriesByType("measure"));
	// I wish this was working, but it doesn't here, it seems to be working
	// only if used from the console prompt... you can use it there, so leaving
	// the exact syntax here.
	//console.table(performance.getEntriesByType("measure"), ["name", "startTime", "duration"]);
},

logAll: function() {
	const logHead = "PerfProfiler::log(): ";
	this._log(logHead + "all types: ", performance.getEntries());
	//console.table(performance.getEntries(), ["duration", "name", "entryType", "startTime"]);
}

}); // Classes.PerfProfiler

Classes.Base.roDef(window, "perfProf", Classes.PerfProfiler.create());


// This function is intended to be called from the Chrome dev tools console
function tmStats() {
	chromeUtils.wrap(chrome.tabs.query, "tmStats(): ", {}).then(
		function(tabs) {
			console.log("Total tabs count: " + tabs.length);
			// This works if invoked directly from the console by calling "tmStats()", it
			// only doesn't work if used in the runtime code
			console.table(performance.getEntriesByType("measure"), ["name", "duration", "startTime" ]);
		}
	);
}

// Note that this function sets a default value even if value is "null", not
// only if it's "undefined". Don't use this function if you care about the
// "null" value
function optionalWithDefault(value, defaultValue) {
	if(typeof(value) === "undefined" || value == null) {
		return defaultValue;
	}
	return value;
}

function optArrayWithDefault(value, defaultValue) {
	if(typeof(value) === "undefined" || value == null || value.length == 0) {
		return defaultValue;
	}
	return value;
}

// In a number of places we need to use empty functions as markers. They work
// better than "null" because they don't require extra checks before calling
// a function returned by another function, and have no side effects.
// Creating a single empty function here and reusing it everywhere else should
// make the minimized code a little more compact ("return emptyFn" is shorter
// than "return function(){}" even without minimization).
function emptyFn() {}

function delay(delayTime) {
	return new Promise(function(resolve) { 
		setTimeout(resolve, delayTime);
	});
}

// Capture exceptions from callback, and don't let them propagate.
// Useful in logic that needs to be resilient to failures.
// "errMsgPrefix" is optional, but if it's "null", the error will be suppressed
// with no logging. If you don't have a prefix but want the error to be emitted,
// pass in errMsgPrefix = "" instead of "null".
// "errFn" is an optional function to be called if the callback is supposed to
// return a value even in case of failures (or if you want to do something else
// when a failure occurs). If you don't specify one, the wrapper returns "undefined"
// in case of errors.
function safeFnWrapper(fn, errMsgPrefix, errFn) {
	return function() {
		try {
			// apply(null) should leave the context set by the bind() used when
			// passing the function "fn" in.
			// Or at least that's the claim here: https://stackoverflow.com/a/40277458
			// Anyway we can use the spread operator and avoid the entire problem...
			return fn(...arguments);
		} catch(e) {
			if(errMsgPrefix != null) {
				log.error(errMsgPrefix + e.message, e);
			}
			if(errFn != null) {
				return errFn(e, ...arguments);
			}
		}
	}
}

function isUrl(url) {
	try {
		let urlObj = new URL(url);
		// If the constructor doesn't throw an exception, this is a URL
		return true;
	} catch(e) {
		// Should check if it's a TypeError, but let's assume it's always a TypeError
		return false;
	}
}

function stackTrace() {
	return new Error().stack;
}

function asyncFn(fn) {
	// Per the text right before section https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise#incumbent_settings_object_tracking
	// the .then() of a Promise is always asynchronous, even if the promise
	// has already "settled":
	//      [...] an action for an already "settled" promise will occur only after
	//      the stack has cleared and a clock-tick has passed. The effect is much
	//      like that of setTimeout(action,10).
	return Promise.resolve().then(fn);
}