// CLASS BookmarksManager
//
// Some issues with the chrome.bookmarks APIs as of 21.03.12:
// - chrome.bookmarks.getRecent() doesn't include folders (why not? But regardless, it
//   would be good if this was clearly stated in the documentation)
// - chrome.bookmarks.search() should accept a search string or an object of
//   { query:, url:, title: }, but if you opt for the object, only the key "query"
//   seems to have any effect (if you add the others, you get "undefined"). Not a
//   big deal because chrome.bookmarks.search() is unusable anyway, it seems to only
//   accept "strings of words" that need to all match in exact sequence (no options for
//   "and" or "or" operators)
// - chrome.bookmarks.onMoved: usual challenge: if you have [ A, B ] and you move "A" so
//   it becomes [ B, A ], can you really claim only A got an onMoved event? Both A and
//   B have changed their indices. So, can't really rely on the payload of the event,
//   just use it as a hint that "something" has changed, and rebuild the entire shadow
//   copy of the bookmarks/folders. For a bug of onMoved with moves of multi-selected
//   bookmarks via Chrome's Bookmark Manager, see _applyBookmarkMoveCb() below.
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
	// The bookmarksManager runtime doesn't really need "_folders", but we need it to
	// debug the folders logic
	_folders: null,

	_loadBookmarksJob: null,
	// Delay before a full bookmarks reload happens. Use this to rate-limit reloads if
	// there are too many chrome.bookmarks events. This is especially important if the
	// user uses Chrome's Bookmark Manager to move multi-selected bookmarks, because
	// the action triggers one event per bookmark in the selection.
	_loadBookmarksDelay: 500, //2000,

	_stats: null,

_init: function() {
	// Overriding the parent class' _init(), but calling that original function first
	Classes.Base._init.call(this);
	this.debug();

	this._eventManager = Classes.EventManager.create();
	this._eventManager.attachRegistrationFunctions(this);

	this._stats = {
		load: 0,
		find: 0,
		bookmarks: 0,
		folders: 0,

		// Counting events received
		onCreated: 0,
		// We ignore an "onCreated" event if there's an import in progress
		onCreatedIgnored: 0,
		onChanged: 0,
		onRemoved: 0,
		onMoved: 0,
		onImportBegan: 0,
		onImportEnded: 0,
	};

	this._loadBookmarksJob = Classes.ScheduledJob.create(this._loadBookmarks.bind(this));
	this._loadBookmarksJob.debug();

	this._loadBookmarks(false).then(
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

// "replace" is a flag indicating if the action is append or replace.
// "debugName" is only needed to provide more context for log messages.
_appendOrReplaceNode: function(nodeToAdd, replace, targetList, debugName) {
	const logHead = "BookmarksManager::_appendOrReplaceNode(" + nodeToAdd.id + "): ";

	if(!replace) {
		targetList.push(nodeToAdd);
		return;
	}

	let idx = targetList.findIndex(node => node.id === nodeToAdd.id);
	if(idx == -1) {
		this._err(logHead + "node should aready exist, but not found", debugName, nodeToAdd);
		targetList.push(nodeToAdd);
	} else {
		this._log(logHead + "replacing existing", debugName, nodeToAdd);
		targetList[idx] = nodeToAdd;
	}
},

_loadBookmarkTreeNode: function(node) {
	const logHead = "BookmarksManager::_loadBookmarkTreeNode(): ";

	// Make sure to do this before calling Classes.NormalizedTabs.normalizeTab(), we
	// want original chrome-API-style IDs as keys, since we use these keys to work
	// events from chrome APIs, or to create folder paths
	let bmAlreadyTracked = false;
	if(this._bookmarksDict[node.id] != null) {
		// The challenge with adding the same "node" twice is that the latest version of
		// the node replaces the previous version in this._bookmarksDict, but it appends
		// the new version after the existing version in this._bookmarks and this._folders.
		// So we need to assert that adding twice does not happen, or alternatively handle
		// it properly by replacing the existing node instead of adding a second copy.
		// The problem with replacing is that it requires a linear scan to find the node
		// we want to replace, so it's an expensive operation we'd rather avoid.
		// Asserting is fine to get a signal of the problem, but we still need to process
		// the insertion of the node correctly, and that is done by _appendOrReplaceNode().
		bmAlreadyTracked = true;
		this._assert(!bmAlreadyTracked, logHead + "unexpected, bookmark/folder node already tracked", node);
	}

	this._bookmarksDict[node.id] = node;

	if(node.url == null) {
		// Per https://developer.chrome.com/docs/extensions/reference/bookmarks/#type-BookmarkTreeNode
		// folder are identifiable by the absence of "url".
		
//		this._err(logHead + "added folder", node);
//		this._log.trace(logHead, node, stackTrace());
		this._stats.folders++;
		this._appendOrReplaceNode(node, bmAlreadyTracked, this._folders, "folder");
		return;
	}

	// The following actions are only for non-folders.

	this._stats.bookmarks++;
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

	this._appendOrReplaceNode(node, bmAlreadyTracked, this._bookmarks, "bookmark");
},

_loadBookmarkTreeNodeList: function(nodes) {
	perfProf.mark("bookmarksLoadEnd");

	const logHead = "BookmarksManager::_loadBookmarkTreeNodeList(): ";
	this._log(logHead + "received: ", nodes);

	this._bookmarksDict = {};
	this._bookmarks = [];
	this._folders = [];

	this._stats.folders = 0;
	this._stats.bookmarks = 0;

	perfProf.mark("bookmarksSetupStart");

	for(let i = 0; i < nodes.length; i++) {
		this._loadBookmarkTreeNode(nodes[i]);
	}
	perfProf.mark("bookmarksSetupEnd");
},

// "sendEvent" is an optional flag that controls whether or not this function should
// notify listeners once the processing of the (re)loaded bookmarks is completed.
// Defaults to "true".
_loadBookmarks: function(sendEvent) {
	sendEvent = optionalWithDefault(sendEvent, true);

	const logHead = "BookmarksManager::_loadBookmarks(" + sendEvent + "): ";
	perfProf.mark("bookmarksLoadStart");

	this._log(logHead + "loading bookmarks");
	this._stats.load++;
	this._bookmarksLoadingPromise = chromeUtils.wrap(chrome.bookmarks.getRecent, logHead, this._maxBookmarkNodesTracked).then(
		function(nodes) { // onFulfill
			try {
				this._loadBookmarkTreeNodeList(nodes);
			} catch(e) {
				this._err(logHead, e);
			}
			this._bookmarksLoadingPromise = null;
			if(sendEvent) {
				this._eventManager.notifyListeners(Classes.EventManager.Events.UPDATED, { });
			}
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
	this._stats.onCreated++;

	if(this._bookmarksImportInProgress) {
		// Per the documentation, ignore chrome.bookmarks.onCreated events
		// while a bulk import is in progress.
		// See https://developer.chrome.com/docs/extensions/reference/bookmarks/#event-onImportBegan
		this._stats.onCreatedIgnored++;
		return;
	}

	this._delayableEventCb(this._applyBookmarkCreateCb.bind(this), id, bmNode);
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

	this._log(logHead + "processing", bmNode);

	// A create event is problematic because we don't want our bookmark store to start
	// growing, we want to continue to have a maximum of this._maxBookmarkNodesTracked
	// bookmark nodes. Easier to just reload everything...
	this._loadBookmarksJob.run(this._loadBookmarksDelay);
},

_applyBookmarkChangeCb: function(id, changeInfo) {
	const logHead = "BookmarksManager::_applyBookmarkChangeCb(" + id + "): ";
	this._stats.onChanged++;

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
	this._stats.onRemoved++;

	this._log(logHead + "processing", removeInfo);

	// A remove event is tricky business, since per the documentation, you get a single
	// event for the top element being deleted, and if it's a folder, you don't get any
	// event for the rest of the subtree... probably less trouble to just reload the
	// entire structure. Also, we want to continue to have a maximum of this._maxBookmarkNodesTracked
	// bookmark nodes, and removing a node/subtree can make room for other nodes.
	this._loadBookmarksJob.run(this._loadBookmarksDelay);
},

_applyBookmarkMoveCb: function(id, moveInfo) {
	const logHead = "BookmarksManager::_applyBookmarkMoveCb(" + id + "): ";
	this._stats.onMoved++;

	let bm = this._bookmarksDict[id];
	if(bm != null) {
		this._log(logHead + "processing", moveInfo);

		this._assert(bm.parentId == moveInfo.oldParentId);
		bm.parentId = moveInfo.parentId;

		// We don't really care about the index of the bookmark within its parent folder, but
		// since we got the data, let's take it...
		// UPDATE: we can't make this assert, because the way indices are reported in onMoved
		// callbacks is kind of broken when you multi-select and move multiple bookmarks.
		// Specifically, say you select two adjacent bookmarks A and B with indices 1 and 2 and
		// move them below the bookmark that's currently at index 3. It looks like internally
		// the API moves the bookmark with lower index first (so A), and generates an event for
		// A, but it also updates all indices without generating events for B and C. Then the API
		// moves B, and generates an event for B, but claims that B was at index 1, not at index
		// 2, before its onMoved event... and of course no event is generated for C, but if A and
		// B changed index, C changed index too...
		// All right, let's drop this assert.
		//
		//this._assert(bm.index == moveInfo.oldIndex);
		bm.index = moveInfo.index;
	} else {
		this._log(logHead + "not tracked, ignoring", moveInfo);
	}

	this._eventManager.notifyListeners(Classes.EventManager.Events.UPDATED, { id: Classes.NormalizedTabs.normalizeBookmarkId(id) });
},

_bookmarkImportBeganCb: function() {
	const logHead = "BookmarksManager::_bookmarkImportBeganCb(): ";
	this._log(logHead + "import started");

	// In theory we could just call a removeListener() for _bookmarkCreatedCb() when
	// we get out of search mode, but it's not even clear how well supported that
	// function is, since it's not well documented... see: https://stackoverflow.com/a/13522461/10791475
	// Anyway these events should not be very frequent, so no reason to optimize
	// too much. Using the flag to disable any expensive operation should be sufficient.
	this._bookmarksImportInProgress = true;
	this._stats.onImportBegan++;
	// No other action needs to be taken in this case
},

_bookmarkImportEndedCb: function() {
	const logHead = "BookmarksManager::_bookmarkImportBeganCb(): ";
	this._log(logHead + "import ended");

	this._bookmarksImportInProgress = false;
	this._stats.onImportEnded++;

	// Let's do a full refresh of the search results after a bulk import.
	// We can't include a single "id" in the event in this case, so let's just leave
	// the property missing.
	this._loadBookmarksJob.run(this._loadBookmarksDelay);
},

// Returns an unsorted list of bookmark nodes (it's sorted by "dateAdded", not by title)
find: function(searchQuery) {
	perfProf.mark("bookmarksSearchStart");

	const logHead = "BookmarksManager::find(): ";
	this._stats.find++;
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
				// Since chrome.bookmarks.get() is async, there could be multiple calls to
				// getBmPathListAsync() pending, but we don't want to call _loadBookmarkTreeNode()
				// multiple times, because it's expensive to manage replacing an existing node
				// in that function. So once the "await" is over, let's check again if in the
				// meantime some other codepath got to this folder first...
				if(this.getBmNode(parentNode.id) == null) {
					this._loadBookmarkTreeNode(parentNode);
				}
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

getStats: function() {
	return this._stats;
}

}); // Classes.BookmarksManager