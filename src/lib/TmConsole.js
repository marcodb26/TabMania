// CLASS TmConsole
Classes.TmConsole = Classes.Base.subclass({

_init: function() {
	// Overriding the parent class' _init(), but calling that original function first
	Classes.Base._init.call(this);
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

_showTabInfoInner: function(tabId, bsTabLabel) {
	let tabsBsTabViewer = popupViewer.getBsTabByBsTabLabel(bsTabLabel);

	let [ tabInfo, tileInfo ] = tabsBsTabViewer.getTabInfo(tabId);

	if(tileInfo == null && tabInfo == null) {
		console.log("Not found in bsTab \"" + bsTabLabel + "\"");
		return;
	}

	console.log("Found in bsTab \"" + bsTabLabel + "\"");
	if(tileInfo != null && tabInfo == null) {
		console.log("tabInfo (through tile):", tileInfo.getTabInfo());
	} else {
		console.log("tabInfo:", tabInfo);
	}
	console.log("tileInfo:", tileInfo);
},

showTabInfo: function(tabId) {
	this._showTabInfoInner(tabId, "home");
	this._showTabInfoInner(tabId, "incognito");
},

showSearchParserInfo: function() {
	let allTabsBsTabViewer = popupViewer.getHomeBsTab();

	let searchParserText = allTabsBsTabViewer.getSearchParserInfo();

	if(searchParserText == null) {
		console.log("No active search, nothing to show");
		return;
	}

	console.log(searchParserText);
},

showBookmarksStats: function() {
	if(!bookmarksManager.isActive()) {
		console.log("bookmarksManager is not active");
		return;
	}
	console.log("bookmarksManager statistics:", bookmarksManager.getStats());
},



// PERFORMANCE TEST CASES

// From https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/random
_getRandomInt: function(min, max) {
	return Math.floor(min) + Math.floor(Math.random() * Math.floor(max - min));
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
	let createArrays = function(arrayCnt, arraySize) {
		let retVal = Array(arrayCnt);
		for(let i = 0; i < arrayCnt; i++) {
			retVal[i] = Array(arraySize);
			for(let j = 0; j < arraySize; j++) {
				retVal[i][j] = this._getRandomInt(0, 100);
			}
		}
		return retVal;
	}.bind(this);

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

	if(!tmUtils.isEqual(concatResult, pushResult)) {
		this._err("Invalid result, concat() and push() generated different output arrays");
		return;
	}
	if(!tmUtils.isEqual(concatResult, appendResult)) {
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

	perfProf.clearMarksByPrefix(toMeasure);
	perfProf.clearMeasures(toMeasure);
},

// I made a mistake when running this test first, and in createStrings() called tmp.join(),
// which joins with commas, instead of tmp.join(""). With all the commas in query, RegExp
// is significantly slower than includes() to process 10,000 strings of 1,000 characters
// each (characters ranging between ASCII code 32 and ASCII code 126), and two OR-ed query
// strings of 100 characters each (includes() takes 1.6 seconds, RegExp.test() takes 5.6 seconds
// for 100 interations).
// Once you change the join to tmp.join(""), things change for the better, and RegExp.test()
// starts beating (barely) includes() (includes() takes 1.4 seconds, RegExp.test() 1.2 seconds).
// As long as you keep the ASCII character range 32-126, includes() and RegExp.test() perform
// more or less equal, with RegExp.test() always slightly faster. The problem is that the large
// set of characters in the query string means that with up to 50 OR-ed query strings, the
// probability of initial characters in different query strings to be the same is low (since
// you can have 94 different characters). A RegExp can't be better than includes() if each
// query string is completely different from the next in the OR.
// This is not a realistic test, in real life we'll need to compare hostnames, which often all
// start with "www." and which can only be randomized among 26 different characters (assuming
// they're case insensitive and ignoring other unicode options for domain names) plus ".".
// For a more realistic test we choose the character set to be only a-z, and we started seeing
// RegExp.test() be faster than includes(). Specifically, in the (also unrealistic) case of
// all query strings sharing a long common prefix (all the "a" below), RexExp.test() starts
// going 10x faster than includes().
// So, in the worst case (large randome set of characters in the query strings) RegExp.test()
// is not much worse than includes() (except when you add a lot of ",", not sure why), but as
// you start pulling in more correlation in the query strings (or in the sequence of characters
// of a single query string (*)), then RegExp.test() can only improve its performance over includes().
//
// (*): if you try to set a single query string and prepend the long sequence of "a", RegExp.test()
// is again much faster than includes() (about 3x), even though there's no defined parallelism
// between different query strings (since there's only one string).
testIncludesRegex: function() {
	let createStrings = function(stringCnt, stringLength) {
		let retVal = Array(stringCnt);
		for(let i = 0; i < stringCnt; i++) {
			let tmp = [];
			for(let j = 0; j < stringLength; j++) {
				// Character codes from 32 (" ") to 126 ("~") are all printable characters,
				// while 97-122 is a-z
				tmp.push(String.fromCharCode(this._getRandomInt(97, 122))); //32, 126)));
			}
			retVal[i] = tmp.join("");
		}
		return retVal;
	}.bind(this);

	let maxRepeat = 100;
	let strings = createStrings(10000, 1000);

	function runTest(testFn) {
		let found = null;
		for(let r = 0; r < maxRepeat; r++) {
			found = [];
			for(let i = 0; i < strings.length; i++) {
				if(testFn(strings[i])) {
					found.push(strings[i]);
				}
			}
		}
		return found;
	}

	let queries = createStrings(10, 50);
	let regex = null;
	let escapedQueries = [];
	for(let i = 0; i < queries.length; i++) {
		// All these initial "a" are designed to increase common subsets between
		// different queries, so the parallel nature of RegExp processing can really
		// show the difference
		queries[i] = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" + queries[i];
		escapedQueries[i] = tmUtils.regexEscape(queries[i]);
	}
	console.log("queries, escapedQueries", queries, escapedQueries);
	try {
		regex = new RegExp("(" + escapedQueries.join(")|(") + ")");
	} catch(e) {
		console.error("Unable to parse regex", e);
		return;
	}

	//console.log("regex.source = " + regex.source);
	perfProf.mark("testIncludesRegex_includesStart");
	let includesFound = runTest(
		function(string) {
			for(let i = 0; i < queries.length; i++) {
				if(string.includes(queries[i])) {
					return true;
				}
			}
			return false;
		}
	);
	perfProf.mark("testIncludesRegex_includesEnd");

	perfProf.mark("testIncludesRegex_regexStart");
	let regexFound = runTest(function(string) { return regex.test(string); });
	perfProf.mark("testIncludesRegex_regexEnd");

	if(!tmUtils.isEqual(includesFound, regexFound)) {
		this._err("Invalid result, includes() and RegExp.test() generated different output strings");
		return;
	}

	console.log("Valid result, includes() and RegExp.test() generated the same output:", regexFound);
	let toMeasure = {
		"includes()": [ "testIncludesRegex_includesStart", "testIncludesRegex_includesEnd" ],
		"RegExp.test()": [ "testIncludesRegex_regexStart", "testIncludesRegex_regexEnd" ],
	};

	perfProf.showMeasures(toMeasure);

	perfProf.clearMarksByPrefix(toMeasure);
	perfProf.clearMeasures(toMeasure);
},

}); // Classes.TmConsole

Classes.Base.roDef(window, "tmConsole", Classes.TmConsole.create());
tmConsole.debug();