// CLASS BookmarksManager
//
// This class generates events Classes.EventManager.Events.UPDATED, with "detail"
// set to { target: <this object>, id: <id of the bookmark that changed, or "undefined"> }.
Classes.BookmarksManager = Classes.Base.subclass({
	_bookmarksImportInProgress: null,
	// If we're loading bookmarks, wait for the promise to fulfill to make further updates.
	// _bookmarksLoadingPromise doubles as a "_bookmarksLoadingInProgress"
	_bookmarksLoadingPromise: null,

	_eventManager: null,

	// Put as many bookmarks as you think it might make sense to display in
	// the popup in the worst case... 500 already seems like a lot of scrolling
	// down the search results.
	_maxBookmarkNodesInSearch: 500,

	_maxBookmarkNodesTracked: 2000,

	// Note that _bookmarksDict contains everything, while _bookmarks excludes folders
	_bookmarksDict: null,
	_bookmarks: null,

_init: function() {
	// Overriding the parent class' _init(), but calling that original function first
	Classes.Base._init.call(this);
	this.debug();

	this._eventManager = Classes.EventManager.create();
	this._eventManager.attachRegistrationFunctions(this);

	this._loadBookmarks().then(
		function() {
			perfProf.measure("Loading bookmarks (chrome.bookmarks.getRecent())", "bookmarksLoadStart", "bookmarksLoadEnd");
			perfProf.measure("Setting up bookmarks", "bookmarksSetupStart", "bookmarksSetupEnd");
			this._initListeners();
		}.bind(this)
	);
},

// Return -1 if a < b, 0 if a == b and 1 if b < a
_compareDateAdded: function(a, b) {
	if(a.dateAdded < b.dateAdded) {
		return -1;
	}
	if(a.dateAdded > b.dateAdded) {
		return 1;
	}
	return 0;
},

_loadBookmarkTreeNode: function(node) {
	const logHead = "BookmarksManager::_loadBookmarkTreeNode(): ";

	// Make sure to do this before calling Classes.NormalizedTabs.normalizeTab(), we
	// want original chrome-API-style IDs as keys, since we use these keys to work
	// events from chrome APIs, or to create folder paths
	this._bookmarksDict[node.id] = node;

	if(node.url == null) {
		// Per https://developer.chrome.com/docs/extensions/reference/bookmarks/#type-BookmarkTreeNode
		// folder are identifiable by the absence of "url".
		// The following actions are only for non-folders.
//		this._err(logHead + "added folder", node);
		return;
	}

	Classes.NormalizedTabs.normalizeTab(node, Classes.NormalizedTabs.type.BOOKMARK);

	// We're assuming chrome.bookmarks.getRecent() returns the data sorted by "dateAdded",
	// and that's the sorting order we want to have too, because if we need to honor
	// "this._maxBookmarkNodesInSearch", we want to return the most recently added bookmarks
	// in the results set.
	// Let's just confirm that sorting assumption is true, rather than forcing a re-sort.
	// UPDATE: experimentally we found the data is sorted from newer to older, and some
	// bookmarks share the same "dateAdded" (probably from an import/sync?).
	if(this._bookmarks.length != 0) {
		let lastNode = this._bookmarks[this._bookmarks.length - 1];
		this._assert(this._compareDateAdded(lastNode, node) >= 0, logHead + "incoming data not sorted", lastNode, node);
	}

	this._bookmarks.push(node);
},

_loadBookmarkTreeNodeList: function(nodes) {
	perfProf.mark("bookmarksLoadEnd");

	const logHead = "BookmarksManager::_loadBookmarkTreeNodeList(): ";
	this._log(logHead + "received: ", nodes);

	this._bookmarksDict = {};
	this._bookmarks = [];

	perfProf.mark("bookmarksSetupStart");

	for(let i = 0; i < nodes.length; i++) {
		this._loadBookmarkTreeNode(nodes[i]);
	}
	perfProf.mark("bookmarksSetupEnd");
},

_loadBookmarks: function() {
	const logHead = "BookmarksManager::_loadBookmarks(): ";
	perfProf.mark("bookmarksLoadStart");

	this._log(logHead + "loading bookmarks");
	this._bookmarksLoadingPromise = chromeUtils.wrap(chrome.bookmarks.getRecent, logHead, this._maxBookmarkNodesTracked).then(
		function(nodes) { // onFulfill
			try {
				this._loadBookmarkTreeNodeList(nodes);
			} catch(e) {
				this._err(logHead, e);
			}
			this._bookmarksLoadingPromise = null;
		}.bind(this),
		function(e) { // onReject
			this._err(logHead, "rejected", e);
			this._bookmarksLoadingPromise = null;
		}.bind(this)
	);

	return this._bookmarksLoadingPromise;
},

_initListeners: function() {
	// https://developer.chrome.com/docs/extensions/reference/bookmarks/#event-onCreated
	chrome.bookmarks.onCreated.addListener(this._bookmarkCreatedCb.bind(this));
	// https://developer.chrome.com/docs/extensions/reference/bookmarks/#event-onChanged
	chrome.bookmarks.onChanged.addListener(this._delayableEventCb.bind(this, this._applyBookmarkChangeCb.bind(this)));
	// https://developer.chrome.com/docs/extensions/reference/bookmarks/#event-onRemoved
	chrome.bookmarks.onRemoved.addListener(this._delayableEventCb.bind(this, this._applyBookmarkRemoveCb.bind(this)));
	// https://developer.chrome.com/docs/extensions/reference/bookmarks/#event-onMoved
	chrome.bookmarks.onMoved.addListener(this._delayableEventCb.bind(this, this._applyBookmarkMoveCb.bind(this)));
	// https://developer.chrome.com/docs/extensions/reference/bookmarks/#event-onImportBegan
	chrome.bookmarks.onImportBegan.addListener(this._bookmarkImportBeganCb.bind(this));
	// https://developer.chrome.com/docs/extensions/reference/bookmarks/#event-onImportEnded
	chrome.bookmarks.onImportEnded.addListener(this._bookmarkImportEndedCb.bind(this));
},

// We need an event entry point _bookmarkCreatedCb() (instead of using the generic _delayableEventCb())
// because for bookmark creation we must track "_bookmarksImportInProgress".
_bookmarkCreatedCb: function(id, bmNode) {
	if(this._bookmarksImportInProgress) {
		// Per the documentation, ignore chrome.bookmarks.onCreated events
		// while a bulk import is in progress.
		// See https://developer.chrome.com/docs/extensions/reference/bookmarks/#event-onImportBegan
		return;
	}

	this._delayableEventCb(this._applyBookmarkCreateCb.bind(this), id, bmNode)
	this._eventManager.notifyListeners(Classes.EventManager.Events.UPDATED, { id: Classes.NormalizedTabs.normalizeBookmarkId(id) });
},

_delayableEventCb: function(eventCb, id, eventInfo) {
	const logHead = "BookmarksManager::_delayableEventCb(" + id + "): ";

	if(this._bookmarksLoadingPromise != null) {
		this._log(logHead + "loading in progress, delaying event processing", eventInfo);
		this._bookmarksLoadingPromise.then(eventCb.bind(this, id, eventInfo));
	} else {
		// If not waiting for a promise, take the action immediately
		eventCb(id, eventInfo);
	}
},

_applyBookmarkCreateCb: function(id, bmNode) {
	const logHead = "BookmarksManager::_applyBookmarkCreateCb(" + id + "): ";

	// A create event is problematic because we don't want our bookmark store to start
	// growing, we want to continue to have a maximum of this._maxBookmarkNodesTracked
	// bookmark nodes. Easier to just reload everything...
	this._loadBookmarks().then(
		function() {
			this._eventManager.notifyListeners(Classes.EventManager.Events.UPDATED, { id: Classes.NormalizedTabs.normalizeBookmarkId(id) });
		}.bind(this)
	);
},

_applyBookmarkChangeCb: function(id, changeInfo) {
	const logHead = "BookmarksManager::_applyBookmarkChangeCb(" + id + "): ";
	let bm = this._bookmarksDict[id];
	if(bm != null) {
		this._log(logHead + "processing", changeInfo);

		bm.title = changeInfo.title;
		bm.url = changeInfo.url;
	} else {
		this._log(logHead + "not tracked, ignoring", changeInfo);
	}
	this._eventManager.notifyListeners(Classes.EventManager.Events.UPDATED, { id: Classes.NormalizedTabs.normalizeBookmarkId(id) });
},

_applyBookmarkRemoveCb: function(id, removeInfo) {
	const logHead = "BookmarksManager::_applyBookmarkRemoveCb(" + id + "): ";

	// A remove event is tricky business, since per the documentation, you get a single
	// event for the top element being deleted, and if it's a folder, you don't get any
	// event for the rest of the subtree... probably less trouble to just reload the
	// entire structure. Also, we want to continue to have a maximum of this._maxBookmarkNodesTracked
	// bookmark nodes, and removing a node/subtree can make room for other nodes.
	this._loadBookmarks().then(
		function() {
			this._eventManager.notifyListeners(Classes.EventManager.Events.UPDATED, { id: Classes.NormalizedTabs.normalizeBookmarkId(id) });
		}.bind(this)
	);
},

_applyBookmarkMoveCb: function(id, moveInfo) {
	const logHead = "BookmarksManager::_applyBookmarkMoveCb(" + id + "): ";

	let bm = this._bookmarksDict[id];
	if(bm != null) {
		this._log(logHead + "processing", moveInfo);

		this._assert(bm.parentId == moveInfo.oldParentId);
		bm.parentId = moveInfo.parentId;

		// We don't really care about the index of the bookmark within its parent folder, but
		// since we got the data, let's take
		this._assert(bm.index == moveInfo.oldIndex);
		bm.index = moveInfo.index;
	} else {
		this._log(logHead + "not tracked, ignoring", moveInfo);
	}

	this._eventManager.notifyListeners(Classes.EventManager.Events.UPDATED, { id: Classes.NormalizedTabs.normalizeBookmarkId(id) });
},

_bookmarkImportBeganCb: function() {
	// In theory we could just call a removeListener() for _bookmarkCreatedCb() when
	// we get out of search mode, but it's not even clear how well supported that
	// function is, since it's not well documented... see: https://stackoverflow.com/a/13522461/10791475
	// Anyway these events should not be very frequent, so no reason to optimize
	// too much. Using the flag to disable any expensive operation should be sufficient.
	this._bookmarksImportInProgress = true;
	// No other action needs to be taken in this case
},

_bookmarkImportEndedCb: function() {
	this._bookmarksImportInProgress = false;

	// Let's do a full refresh of the search results after a bulk import.
	// We can't include a single "id" in the event in this case, so let's just leave
	// the property missing.
	this._loadBookmarks().then(
		function() {
			this._eventManager.notifyListeners(Classes.EventManager.Events.UPDATED, { });
		}.bind(this)
	);
},

// Returns an unsorted list of bookmark nodes (it's sorted by "dateAdded", not by title)
find: function(searchQuery) {
	perfProf.mark("bookmarksSearchStart");

	const logHead = "BookmarksManager::find(): ";
	let searchResults = [];

	if(!settingsStore.getOptionBookmarksInSearch()) {
		this._log(logHead + "bookmarks are disabled in search, nothing to do");
		// Pretend we searched and found no bookmarks (we have initialized "searchResults"
		// as an empty array)
	} else {
		this._log(logHead + "processing bookmarks");
		searchResults = searchQuery.search(this._bookmarks, logHead, this._maxBookmarkNodesInSearch);
	}

	perfProf.mark("bookmarksSearchEnd");
	return Promise.resolve(searchResults);
},

// This function uses the "Chrome bookmark ID" (not the modified ID defined in NormalizedTabs),
// since its main use case right now is to navigate through folders for getBmPathList()
getBmNode: function(bmNodeId) {
	let bmNode = this._bookmarksDict[bmNodeId];

	if(bmNode != null) {
		return bmNode;
	}
	return null;
},

// We have two separate versions of "getBmPathList", a sync and an async version.
// The async version is very expensive, because every time we call chrome.bookmarks.get()
// we end up giving up on the current event cycle and having to wait for the next cycle.
// The sync version instead doesn't give up the current execution context, so it can
// return very quickly, provided all the data is in _bookmarksDict.
// We could have a single function that picks sync or async, but if we mark such function
// "async" to support the async path, then we'll always have to give up the current event
// cycle at least once when returning to the caller, and that would be a waste.
getBmPathListAsync: async function(bmNode) {
	const logHead = "BookmarksManager::getBmPathListAsync(" + bmNode.id + "): ";

	let pathList = [];

//	this._log(logHead + "entering");

	while(bmNode != null && bmNode.parentId != null) {
		//this._log(logHead + "current round: " + bmNode.title);

		let parentNode = this.getBmNode(bmNode.parentId);
		if(parentNode == null) {
			let result = await chromeUtils.wrap(chrome.bookmarks.get, logHead, bmNode.parentId);
			if(result.length > 0) {
				parentNode = result[0];
				// Let's track this folder for next time...
				this._loadBookmarkTreeNode(parentNode);
			}
		}

		bmNode = parentNode;

		if(bmNode != null) {
			// The root ID "0" should have an empty title, but you never know...
			pathList.push(bmNode.title != null ? bmNode.title : "");
			//this._log(logHead + "next round: ", bmNode);
		} else {
			// It should never get here, but just in case
			this._err(logHead + "unexpected, it should not get here");
		}
	}

	pathList.reverse();
//	this._log(logHead + "full pathList = ", pathList);
	return pathList;
},

// Returns "null" if at least one parent in the folders path is missing from
// this._bookmarksDict, meaning the folder did not fit within our limit
// "this._maxBookmarkNodesTracked". When that happens, the caller must try
// the async version of this function instead: BookmarksManager.getBmPathListAsync()
getBmPathListSync: function(bmNode) {
	const logHead = "BookmarksManager::getBmPathListSync(" + bmNode.id + "): ";

	let pathList = [];

//	this._log(logHead + "entering");

	while(bmNode != null && bmNode.parentId != null) {
		//this._log(logHead + "current round: " + bmNode.title);

		bmNode = this.getBmNode(bmNode.parentId);
		if(bmNode == null) {
			// One folder in the path not found, use getBmPathListAsync() instead
			return null;
		}

		// The root ID "0" should have an empty title, but you never know...
		pathList.push(bmNode.title != null ? bmNode.title : "");
		//this._log(logHead + "next round: ", bmNode);
	}

	pathList.reverse();
//	this._log(logHead + "full pathList = ", pathList);
	return pathList;
},

}); // Classes.BookmarksManager
