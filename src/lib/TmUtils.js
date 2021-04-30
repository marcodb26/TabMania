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

	this.debug();
	// Expose an "err()" function (_err() should never be called directly from outside
	// of this class, per our "_" naming convention), to be used by static functions
	// instead of console.error() (this gives us more control than console.error()).
	this.err = this._err;
	this.log = this._log;

	if(isProd()) {
		this.freeze = this._freezeProd;
	} else {
		this.freeze = this._freezeDev;
	}
},

// Initialized in _init() to allow us to present the right line number
err: null,
log: null,

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
deepCopy: function(obj) {
	const logHead = "TmUtils::deepCopy(): ";

	// See https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/typeof
	// "undefined" is of type "undefined", but "null" and Array are of type "object"
	if(obj === undefined) {
		return undefined;
	}

	if(typeof obj == "string") {
		// repeat() ceates a new string from the original string
		// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/repeat
		return obj.repeat(1);
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
		// Apparently initializing the array to the size it needs is faster than growing
		// the array one element by one
		let retVal = Array(obj.length);
		for(let i = 0; i < obj.length; i++) {
			retVal[i] = this.deepCopy(obj[i]);
		}
		return retVal;
	}

	let retVal = {};

	let keys = Object.keys(obj);
	for(let i = 0; i < keys.length; i++) {
		retVal[keys[i]] = this.deepCopy(obj[keys[i]]);
	}
	return retVal;
},

// Note that this function modifies "a" and "b" (it sorts them). If you don't
// want your original arrays to be modified, please set "inPlace = false" (default "true")
// to perform a shallow copy of the arrays before the logic starts.
// Returns two arrays [ added, deleted ], which represents the steps you need to take
// on "a" to make it become like "b".
//
// "sortCmpFn" is used to determine a sorting criterion based on a key known to "sortCmpFn".
// It should return the customary "0", "-1" or "1". Leave it empty to use the default Array.sort()
// behavior (convert to string, then compare).
// "nodeCmpFm" is used to determine if a node of "a" and the corresponding node of "b" (already
// marked as "same index" by "sortCmpFn") are identical or different. It should return "true" if
/// they're identical, and "false" if they're different. Leave it empty to use a basic "==" comparison.
arrayDiff: function(a, b, sortCmpFn, nodeCmpFn, inPlace) {
	inPlace = optionalWithDefault(inPlace, true);

	let basicSortCmpFn = function(x, y) {
		if(x == y) {
			return 0;
		}
		if(x < y) {
			return -1;
		}
		// It must be "x > y"
		return 1;
	}

	let basicNodeCmpFn = function(x, y) {
		return x == y;
	}

	sortCmpFn = optionalWithDefault(sortCmpFn, basicSortCmpFn);
	nodeCmpFn = optionalWithDefault(nodeCmpFn, basicNodeCmpFn);

	if(!inPlace) {
		// No need to call this.deepCopy(), we need to sort the array, we don't touch
		// the elements of the array
		a = [].concat(a);
		b = [].concat(b);
	}

	a.sort(sortCmpFn);
	b.sort(sortCmpFn);

	let added = [];
	let deleted = [];
	let changed = [];

	// I've seen while() loops being much slower than for() loops, but maybe this
	// while-like for() syntax is too much... :-)
	let aIdx = 0;
	let bIdx = 0;
	for(; aIdx < a.length && bIdx < b.length;) {
		let sortCmpResult = sortCmpFn(a[aIdx], b[bIdx]);
		if(sortCmpResult == 0) {
			// They've the same index
			aIdx++;
			bIdx++;
			// But are they also the same value?
			if(!nodeCmpFn(a[aIdx], b[bIdx])) {
				// Not the same value, the node has changed
				changed.push(b[bIdx]);
			}
		} else {
			if(sortCmpResult < 0) {
				// a[aIdx] is smaller than b[bIdx], means "a" contains something that's not in "b"
				deleted.push(a[aIdx]);
				aIdx++;
			} else {
				// b[bIdx] is smaller than a[aIdx], means "b" contains something that's not in "a"
				added.push(b[bIdx]);
				bIdx++;
			}
		}
	}

	// If we get here, at least one of "a" or "b" has been fully scanned, but
	// not necessarily both...
	for(; aIdx < a.length; aIdx++) {
		// If we still need to finish scanning "a", these must all be things not in "b"
		deleted.push(a[aIdx]);
	}

	for(; bIdx < b.length; bIdx++) {
		// If we still need to finish scanning "b", these must all be things not in "a"
		added.push(b[bIdx]);
	}

	return [ added, deleted, changed ];
},

// See https://stackoverflow.com/questions/3561493/is-there-a-regexp-escape-function-in-javascript
_regexEscapePatternObj: /[-\/\\^$*+?.()|[\]{}]/g,

regexEscape: function(string) {
	// See https://stackoverflow.com/questions/3561493/is-there-a-regexp-escape-function-in-javascript
	// The replacement string (last argument) uses the replacement pattern "$&", meaning "insert
	// the matched substring"
	// See https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/replace
	return string.replace(this._regexEscapePatternObj, "\\$&");
},

_freezeDev: function(obj) {
	return Object.freeze(obj);
},

_freezeProd: function(obj) {
	// No-op in production, though people seem to claim that nowadays there's no
	// performance penalty with Object.freeze():
	// https://stackoverflow.com/questions/8435080/any-performance-benefit-to-locking-down-javascript-objects
	return obj;
},

freeze: null,

// Not really a "split" in the sense that it doesn't return an array, it returns a new string
// with the concatenation of the split. All words are lowercase except the first letter of the
// first word.
splitCamelCase: function(str) {
	// Adjusted from https://stackoverflow.com/a/54112355/10791475
	let splits = str.split(/([A-Z][a-z]+)/);
	let lowerCaseSplits = []; 
	for(let i = 0; i < splits.length; i++) {
		if(splits[i] != "") {
			lowerCaseSplits.push(splits[i].toLowerCase());
		}
	}
	if(lowerCaseSplits.length == 0) {
		return "";
	}

	lowerCaseSplits[0] = this.toUpperCaseInitial(lowerCaseSplits[0]);

	return lowerCaseSplits.join(" ");
},

toLowerCaseInitial: function(str) {
	return str.charAt(0).toLowerCase() + str.substring(1);
},

toUpperCaseInitial: function(str) {
	return str.charAt(0).toUpperCase() + str.substring(1);
},

isTabPinned: function(tab) {
	// A tab can be pinned explicitly, or it can inherit it's pinning from
	// other sources. "pinInherited", when not undefined, describes the reason
	// why the tab inherited pinning.
	return tab.pinned || tab.pinInherited != null;
},

}); // Classes.TmUtils

Classes.Base.roDef(window, "tmUtils", Classes.TmUtils.create());
tmUtils.debug();