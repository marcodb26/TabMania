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
	try {
		performance.measure(...arguments);
	} catch(e) {
		this._log("Measure failed for", name, [ startMark, endMark ], e);
	}
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
},

// Sorts by startTime
_sortEntries: function(a, b) {
	if(a.startTime > b.startTime) {
		return 1;
	}
	if(a.startTime < b.startTime) {
		return -1;
	}
	return 0;
},

// Returns a performance table as generated by performance.getEntriesByName/getEntriesByType
_getMeasures: function(measuresTable) {
	for(const [ measureName, marks ] of Object.entries(measuresTable)) {
		this.measure(measureName, marks[0], marks[1]);
	}

	let p = [];
	for(const measureName of Object.keys(measuresTable)) {
		p = p.concat(performance.getEntriesByName(measureName, "measure"));
		// We need to clear the measure because next time we call this function
		// we'll measure again, and we don't want duplicates
		performance.clearMeasures(measureName);
	}

	p.sort(this._sortEntries);
	return p
},

_getMarks: function(measuresTable) {
	let p = [];
	for(const [ measureName, marks ] of Object.entries(measuresTable)) {
		p = p.concat(performance.getEntriesByName(marks[0], "mark"));
		p = p.concat(performance.getEntriesByName(marks[1], "mark"));
	}

	p.sort(this._sortEntries);
	return p;
},

_getMarksByPrefix: function(measuresTable) {
	let allMarks = performance.getEntriesByType("mark");
	let markPrefixes = [];
	for(const [ measureName, marks ] of Object.entries(measuresTable)) {
		markPrefixes.push(marks[0], marks[1]);
	}

	let p = [];
	for(const [ index, entry ] of Object.entries(allMarks)) {
//	for(let i = 0; i < allMarks.length; i++) {
//		let entry = allMarks[i];
//		console.log(entry);
		for(const [ index, prefix ] of Object.entries(markPrefixes)) {
			if(entry.name.startsWith(prefix)) {
				p.push(entry);
			}
		}
	}

	p.sort(this._sortEntries);
	return p;
},

clearMarksByPrefix: function(measuresTable) {
	let allMarks = performance.getEntriesByType("mark");
	let markPrefixes = [];
	for(const [ measureName, marks ] of Object.entries(measuresTable)) {
		markPrefixes.push(marks[0], marks[1]);
	}

	for(const [ index, entry ] of Object.entries(allMarks)) {
		for(const [ index, prefix ] of Object.entries(markPrefixes)) {
			if(entry.name.startsWith(prefix)) {
				performance.clearMarks(entry.name);
			}
		}
	}
},

clearMeasures: function(measuresTable) {
	for(const [ measureName, marks ] of Object.entries(measuresTable)) {
		performance.clearMeasures(measureName);
	}
},

showMeasures: function(measuresTable) {
	console.table(this._getMarksByPrefix(measuresTable), [ "name", "startTime" ] );
	console.table(this._getMeasures(measuresTable), [ "name", "duration", "startTime" ]);
},

// FUNCTIONS FOR CHROME DEV TOOLS CONSOLE
// Use console.log() instead of this._log() here, otherwise the output won't
// be available with the dist vesion of TabMania

showAllMarks: function() {
	console.table(performance.getEntriesByType("mark"), [ "name", "startTime" ]);
},

showAllEntries: function() {
	//console.log(performance.getEntries());
	console.table(performance.getEntries(), [ "entryType", "name", "duration", "startTime" ]);
},

// This function is for use by developers in the Chrome console, not to be called
// in TabMania's runtime
showSearch: function() {
	let toMeasure = {
		"parse query": [ "parseQueryStart", "parseQueryEnd" ],
		"full search": [ "searchStart", "searchEnd" ],
		"chrome.history.search()": [ "historySearchStart", "historySearchEnd" ],
		"history reduce": [ "historyReduceStart", "historyReduceEnd" ],
		"filter bookmarks": [ "bookmarksSearchStart", "bookmarksSearchEnd" ],
		"filter tabs + rcTabs + hItems": [ "searchFilterStart", "searchFilterEnd" ],
		"sort search results": [ "searchSortStart", "searchSortEnd" ],
		"render": [ "searchRenderStart", "searchRenderEnd" ],
	}

	this.showMeasures(toMeasure);
},

showAsyncQueues: function() {
	let toMeasure = {
		"discard batch": [ "discardAsyncQueueBatchStart", "discardAsyncQueueBatchEnd" ],
		"run batch": [ "runAsyncQueueBatchStart", "runAsyncQueueBatchEnd" ],
		"full run": [ "runAsyncQueueStart", "runAsyncQueueEnd" ],
	}

	console.table(this._getMarksByPrefix(toMeasure), [ "name", "startTime" ] );
},

// This function is intended to be called from the Chrome dev tools console
showStats: function() {
	chromeUtils.queryTabs({}, "PerfProfiler::tmStats(): ").then(
		function(tabs) {
			console.log("Total tabs count: " + tabs.length);
			// This works if invoked directly from the console by calling "tmStats()", it
			// only doesn't work if used in the runtime code
			console.table(performance.getEntriesByType("measure"), ["name", "duration", "startTime" ]);
		}
	);
},

}); // Classes.PerfProfiler

Classes.Base.roDef(window, "perfProf", Classes.PerfProfiler.create());
