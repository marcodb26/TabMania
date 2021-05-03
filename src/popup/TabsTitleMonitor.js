// CLASS TabsTitleMonitor
//
// Use test/pageWantsAttention.html to test this logic
Classes.TabsTitleMonitor = Classes.Base.subclass({

	// Tracks titles history by tab ID
	_titlesDict: null,

	// "_timeSensitivity" describes how far apart changes can be to be considered
	// by this class's algorithm
	_timeSensitivity: 10000, // in ms

	// Don't make this _minTransitionsCountForAttention too small, "2" is probably
	// the minimum valid value. The problem is that when a new page is loaded,
	// there's at least one transition (from title same as URL to title as defined
	// on page).
	// When you navigate from one page to another you'll have one extra title transition
	// from the previous page title to the new page URL, but that doesn't count because
	// we're not tracking transitions if the URL changes.
	// "2" is the minimum, but "2" likely cutting it too close, it doesn't leave room
	// for a single "real" (Javascript-driven) page title change from the logic of the
	// site that's been loaded.
	// So let's start with "4", and if this is also too small, we can make it bigger
	// later as needed.
	_minTransitionsCountForAttention: 4,

_init: function() {
	// Overriding the parent class' _init(), but calling that original function first
	Classes.Base._init.call(this);
	this.debug();

	this._titlesDict = {};
},

remove: function(tabId) {
	// "delete" should not complain if "tabId" doesn't exist in _titlesDict
	delete this._titlesDict[tabId];
},

_timeoutCb: function(ctxTitleObj) {
	let tabTitles = this._titlesDict[ctxTitleObj.tabId];

	if(tabTitles == null) {
		// Things have changed while we were waiting, and this callback is not needed anymore
		return;
	}

	let mostRecentTitleObj = tabTitles[tabTitles.length - 1];
	if(mostRecentTitleObj.timerHandle != ctxTitleObj.timerHandle) {
		// Things have changed while we were waiting, and this callback is not needed anymore,
		// there's another title object at the top of the queue, possibly with another timer
		// callback waiting.
		return;
	}

	// If we get here, the timer associated to the ctxTitleObj is active, and
	// since the timeout has elapsed, we now need to call stopFn(), and clean
	// the _titlesDict entry that has timed out
	delete this._titlesDict[ctxTitleObj.tabId];

	ctxTitleObj.stopFn(ctxTitleObj.tabId);
},

// This function can be called for any tab updates, but it only tracks title
// changes. If there are no title changes, nothing happens.
// "stopFn" is a callback stopFn(tabId) that will be called if "wantsAttention"
// expires (of course it will be active only in case this function returns "true").
// Returns "true" if the tab is changing title frequently, "false" otherwise.
// As a side effect, it sets the "tab.tm.wantsAttention" flag in "tab" when it
// returns "true".
update: function(tab, stopFn) {
	let newTitleObj = {
		tabId: tab.id,
		timestamp: performance.now(),
		timerHandle: null,
		stopFn: null,
		title: tab.title,
		url: tab.url,
	};

	let tabTitles = this._titlesDict[tab.id];

	if(tabTitles == null) {
		this._titlesDict[tab.id] = [ newTitleObj ];
		tab.tm.wantsAttention = false;
		return false;
	}

	let lastTitleObj = tabTitles[tabTitles.length - 1];
	if((newTitleObj.timestamp - lastTitleObj.timestamp > this._timeSensitivity) ||
		(newTitleObj.url != lastTitleObj.url)) {
		// If the existing data is older than what we care about, just drop all the old
		// data and only keep the latest.
		// Alternatively, if the URL has changed, also drop everything and start tracking
		// again from scratch.
		this._titlesDict[tab.id] = [ newTitleObj ];
		tab.tm.wantsAttention = false;
		return false;
	}

	if(newTitleObj.title != lastTitleObj.title) {
		// If they're the same title, drop "newTitleObj", we only want to track the
		// earliest time the title has had a certain value, until it gets out of our
		// _timeSensitivity zone, then the new value can replace it.
		tabTitles.push(newTitleObj);
	} else {
		newTitleObj = null;
	}

	tab.tm.wantsAttention = this._wantsAttention(tab.id);

	if(tab.tm.wantsAttention && newTitleObj != null) {
		newTitleObj.stopFn = stopFn;
		newTitleObj.timerHandle = setTimeout(this._timeoutCb.bind(this, newTitleObj), this._timeSensitivity);
	}
	return tab.tm.wantsAttention;
},

// Returns "true" if the tab is changing title frequently, "false" otherwise 
_wantsAttention: function(tabId) {
	let tabTitles = this._titlesDict[tabId];

	if(tabTitles == null) {
		return false;
	}

	if(tabTitles.length <= this._minTransitionsCountForAttention) {
		// The first transition requires two tabTitles array elements, the second transition
		// requires the second and third element, the third requires the third and fourth, etc...
		// That's why we check for "<=", not just "<", as we always need an array of length
		// N+1 to indicate N transitions.
		return false;
	}

	if(performance.now() - tabTitles[tabTitles.length - 1].timestamp > this._timeSensitivity) {
		// Delete the entry so the next time this function gets called, it will get out
		// immediately without ending up here again
		delete this._titlesDict[tabId];
		return false;
	}

	return true;
},

}); // Classes.TabsTitleMonitor

Classes.Base.roDef(window, "tabsTitleMonitor", Classes.TabsTitleMonitor.create());