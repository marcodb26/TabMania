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
	const logHead = "TmConsole::showSearchParserInfo(): ";

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

}); // Classes.TmConsole

Classes.Base.roDef(window, "tmConsole", Classes.TmConsole.create());
tmConsole.debug();