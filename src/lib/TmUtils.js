// Note that this function sets a default value even if value is "null", not
// only if it's "undefined". Don't use this function if you care about the
// "null" value
function optionalWithDefault(value, defaultValue) {
	if(typeof(value) === "undefined" || value == null) {
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


// CLASS TmUtils
Classes.TmUtils = Classes.Base.subclass({

_init: function() {
	// Overriding the parent class' _init(), but calling that original function first
	Classes.Base._init.call(this);

	// Expose an "err()" function (_err() should never be called directly from outside
	// of this class, per our "_" naming convention), to be used by static functions
	// instead of console.error() (this gives us more control than console.error()).
	this.err = this._err;
},

// Initialized in _init() to allow us to present the right line number
err: null,

// This is not a general purpose version of objects equality comparison, no support
// for functions or symbols. Support for Arrays assumes the array is not sparse
// (it might work, but very inefficient, if the array is sparse).
isEqual: function(objA, objB) {
	const logHead = "TmUtils::isEqual(): ";
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

	if(Array.isArray(objA)) {
		// Process equality between two arrays
		if(Array.isArray(objB)) {
			if(objA.length != objB.length) {
				return false;
			}
			for(let i = 0; i < objA.length; i++) {
				if(!this.isEqual(objA[i], objB[i])) {
					return false;
				}
			}
			return true;
		} else {
			return false;
		}
	}

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
		if(!this.isEqual(objA[keysA[i]], objB[keysB[i]])) {
			return false;
		}
	}
	return true;
},

// Not general purpose, limited support for Arrays (no sparse arrays), no support
// for functions or symbols
deepClone: function(obj) {
	const logHead = "TmUtils::deepClone(): ";

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

	// obj is a non-null object...

	if(Array.isArray(obj)) {
		let retVal = [];
		for(let i = 0; i < obj.length; i++) {
			retVal[i] = this.deepClone(obj[i]);
		}
		return retVal;
	}

	let retVal = {};

	let keys = Object.keys(obj);
	for(let i = 0; i < keys.length; i++) {
		retVal[keys[i]] = this.deepClone(obj[keys[i]]);
	}
	return retVal;
},

// FUNCTIONS FOR CHROME DEV TOOLS CONSOLE

// Debugging-only function, do not call in the code
clearStorage: function() {
	chrome.storage.local.clear();
	chrome.storage.sync.clear();
},

// This function is intended to be called from the Chrome dev tools console
showStorage: function() {
	chrome.storage.local.get(function(result){console.log(result)});
	chrome.storage.sync.get(function(result){console.log(result)});
},

showTabInfo: function(tabId) {
	const homeBsTabId = popupViewer.getHomeBsTabId();
	let allTabsBsTabViewer = popupViewer.getBsTabViewerById(homeBsTabId);

	let [ tabInfo, tileInfo ] = allTabsBsTabViewer.getTabInfo(tabId);

	if(tileInfo != null && tabInfo == null) {
		this._log("tabInfo (through tile):", tileInfo.getTabInfo());
	} else {
		this._log("tabInfo:", tabInfo);
	}
	this._log("tileInfo:", tileInfo);
},

showSearchParserInfo: function() {
	const logHead = "TmUtils::showSearchParserInfo(): ";

	const homeBsTabId = popupViewer.getHomeBsTabId();
	let allTabsBsTabViewer = popupViewer.getBsTabViewerById(homeBsTabId);

	let searchParserText = allTabsBsTabViewer.getSearchParserInfo();

	if(searchParserText == null) {
		console.log(logHead + "no active search, nothing to show");
		return;
	}

	console.log(logHead + searchParserText);
},

}); // Classes.TmUtils

Classes.Base.roDef(window, "tmUtils", Classes.TmUtils.create());
tmUtils.debug();