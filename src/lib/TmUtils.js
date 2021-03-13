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
		// Apparently initializing the array to the size it needs is faster than growing
		// the array one element by one
		let retVal = Array(obj.length);
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
// Use console.log() instead of this._log() here, otherwise the output won't
// be available with the dist vesion of TabMania

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
		console.log("tabInfo (through tile):", tileInfo.getTabInfo());
	} else {
		console.log("tabInfo:", tabInfo);
	}
	console.log("tileInfo:", tileInfo);
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

showBookmarksStats: function() {
	if(!bookmarksManager.isActive()) {
		console.log("bookmarksManager is not active");
		return;
	}
	console.log("bookmarksManager statistics:", bookmarksManager.getStats());
},

// Trying to validate results from https://dev.to/uilicious/javascript-array-push-is-945x-faster-than-array-concat-1oki
// Outcome on 21.03.12: nope, concat() is faster, though when you have:
// - 15,000 arrays of 5 elements (as indicated on that blog):
//   * concat(): 183.3ms (only 1.5x faster than push() )
//   * push(): 269.1ms
//   * appendArray(): 457.6ms
// - 1,000 arrays of 100 elements:
//   * concat(): 76.9ms (2.9x faster than push() )
//   * push(): 225.4ms
//   * appendArray(): 206.7ms
testConcatPush: function() {
	// From https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/random
	function getRandomInt(max) {
		return Math.floor(Math.random() * Math.floor(max));
	}

	function createArrays(arrayCnt, arraySize) {
		let retVal = Array(arrayCnt);
		for(let i = 0; i < arrayCnt; i++) {
			retVal[i] = Array(arraySize);
			for(let j = 0; j < arraySize; j++) {
				retVal[i][j] = getRandomInt(100);
			}
		}
		return retVal;
	}

	function appendArray(dst, src) {
		let dstLength = dst.length;
		let srcLength = src.length;
		dst.length = dstLength + srcLength;

		for(let i = 0; i < srcLength; i++) {
			dst[dstLength + i] = src[i];
		}
	}

	let maxRepeat = 100;
	let origArray = createArrays(1000, 100);

	perfProf.mark("testConcatPush_concatStart");
	let concatResult = null;
	for(let r = 0; r < maxRepeat; r++) {
		concatResult = [].concat.apply([], origArray);
	}
	perfProf.mark("testConcatPush_concatEnd");

	perfProf.mark("testConcatPush_pushStart");
	let pushResult = null;
	for(let r = 0; r < maxRepeat; r++) {
		pushResult = [];
		for(let i = 0; i < origArray.length; i++) {
			pushResult.push.apply(pushResult, origArray[i]);
		}
	}
	perfProf.mark("testConcatPush_pushEnd");

	perfProf.mark("testConcatPush_appendStart");
	let appendResult = null;
	for(let r = 0; r < maxRepeat; r++) {
		appendResult = [];
		for(let i = 0; i < origArray.length; i++) {
			appendArray(appendResult, origArray[i]);
		}
	}
	perfProf.mark("testConcatPush_appendEnd");

	if(!this.isEqual(concatResult, pushResult)) {
		this._err("Invalid result, concat() and push() generated different output arrays");
		return;
	}
	if(!this.isEqual(concatResult, appendResult)) {
		this._err("Invalid result, concat() and appendArray() generated different output arrays");
		return;
	}

	console.log("Valid result, concat(), push() and appendArray() generated the same output");
	let toMeasure = {
		"concat": [ "testConcatPush_concatStart", "testConcatPush_concatEnd" ],
		"push": [ "testConcatPush_pushStart", "testConcatPush_pushEnd" ],
		"append": [ "testConcatPush_appendStart", "testConcatPush_appendEnd" ],
	};

	perfProf.showMeasures(toMeasure);
},

}); // Classes.TmUtils

Classes.Base.roDef(window, "tmUtils", Classes.TmUtils.create());
tmUtils.debug();