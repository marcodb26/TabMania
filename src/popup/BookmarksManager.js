// CLASS BookmarksManager
//
// Some issues with the chrome.bookmarks APIs as of 21.03.12:
// - chrome.bookmarks.getRecent() doesn't include folders (why not? But regardless, it
//   would be good if this was clearly stated in the documentation). Ok, we'll need to
//   use chrome.bookmarks.getTree() instead.
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
// set to:
// {
//   target: <this object>,
//   id: <id of the bookmark that changed, or "undefined">
//   pinned: { added: <bookmark ID list of new nodes pinned>, deleted: <bookmark ID list of nodes unpinned> }
// }.
// "pinned" will only be present for explicit pinning actions, but the list of pinned
// bookmarks will change also as a result of the other generic events.
Classes.BookmarksManager = Classes.Base.subclass({
	_bookmarksManagerActive: null,

	_bookmarksImportInProgress: null,
	// If we're loading bookmarks, wait for the promise to fulfill to make further updates.
	// _bookmarksLoadingPromise doubles as a "_bookmarksLoadingInProgress"
	_bookmarksLoadingPromise: null,

	_eventManager: null,

	// Put as many bookmarks as you think it might make sense to display in
	// the popup in the worst case... 500 already seems like a lot of scrolling
	// down the search results.
	_maxBookmarkNodesInSearch: 500,
	_maxBookmarkNodesTracked: 5000,

	// Note that _bookmarksDict contains everything, while _bookmarks excludes folders
	_bookmarksDict: null,
	// _bookmarks is an array of bookmarks, structured like the tabsList returned by
	// chromeUtils.queryTabs(), so that the SearchQuery can be applied to it as well
	_bookmarks: null,
	// The bookmarksManager runtime doesn't really need "_folders", but we need it to
	// debug the folders logic
	_folders: null,

	// _pinnedBookmarks is an array tracking which bookmarks are currently pinned.
	_pinnedBookmarks: null,
	// _pinnedBookmarkIds is an array tracking which bookmarks are currently pinned.
	// We need this structure because without it would not be easy to figure out
	// which bookmarks have been unpinned in settingsStore. Having to do this search
	// every time users unpin a tab is expensive, but it requires less code changes,
	// and in the assumption people won't have thousands of pinned bookmarks, this
	// inefficiency should be ok.
	_pinnedBookmarkIds: null,

	_loadBookmarksJob: null,
	// Delay before a full bookmarks reload happens. Use this to rate-limit reloads if
	// there are too many chrome.bookmarks events. This is especially important if the
	// user uses Chrome's Bookmark Manager to move multi-selected bookmarks, because
	// the action triggers one event per bookmark in the selection (per the documentation,
	// if instead you call chrome.bookmarks.removeTree() you'll get a single notification).
	_loadBookmarksDelay: 500, //2000,

	_applyOptionsChangeJob: null,
	// When the user enables inclusion of bookmarks in search results, bookmarksManager
	// needs to take an expensive action an re-initialize. We want to rate-limit this
	// expensive action to at most once a second (and we'll enable or disable depending
	// on what's the configuration at the time the job runs, not at the time the job got
	// scheduled). We need to coordinate this action with potential active calls to
	// _loadBookmarks(), so when the job runs, it will possibly still have to wait for
	// an active _loadBookmarks() to finish. While it waits for that promise, a second
	// job can get scheduled, because hte current job is considered "running", even though
	// it's still waiting for another condition. It would be ideal to incorporate the
	// "wait for another condition" into the ScheduledJob logic, but in the worst-ish case
	// the second job will be scheduled, and if the first job is not completed by the time
	// the second job runs, the second job will wait for the _loadBookmarks() of the first
	// job. The actual worst-worst case is that when the second job runs, the first job is
	// still waiting for that same previous _loadBookmarks(), because in that case, both
	// jobs will be queued behind the same promise, then run in parallel.
	_applyOptionsChangeDelay: 1000,

	_stats: null,

_init: function() {
	// Overriding the parent class' _init(), but calling that original function first
	Classes.Base._init.call(this);
	this.debug();

	this._eventManager = Classes.EventManager.create();
	this._eventManager.attachRegistrationFunctions(this);

	this.resetStats();

	this._loadBookmarksJob = Classes.ScheduledJob.create(this._loadBookmarks.bind(this), "BookmarksManager::loadBookmarks");
	this._loadBookmarksJob.debug();

	this._applyOptionsChangeJob = Classes.ScheduledJob.create(this._applyOptionsChange.bind(this),
									"BookmarksManager::applyOptionsChange");
	this._applyOptionsChangeJob.debug();

	settingsStore.getAllOptions().addEventListener(Classes.EventManager.Events.UPDATED, this._optionsUpdatedCb.bind(this));
	settingsStore.getPinnedBookmarks().addEventListener(Classes.EventManager.Events.UPDATED,
								this._delayableEventCb.bind(this, this._applyPinnedUpdateCb.bind(this), false));

	if(settingsStore.getOptionBookmarksInSearch()) {
		this._initBookmarks(false).then(this._initChromeListeners.bind(this));
	} else {
		this._bookmarksManagerActive = false;
		this._initChromeListeners();
	}
},

_initBookmarks: function(sendEvent) {
	this._bookmarksManagerActive = true;
	return this._loadBookmarks(sendEvent).then(
		function() {
			try {
				perfProf.measure("chrome.bookmarks.getTree()", "bookmarksLoadStart", "bookmarksLoadEnd");
			} catch(e) {}
			try {
				perfProf.measure("Bookmarks treeToList", "bookmarksTreeToListStart", "bookmarksTreeToListEnd");
			} catch(e) {}
			try {
				perfProf.measure("Setting up bookmarks", "bookmarksSetupStart", "bookmarksSetupEnd");
			} catch(e) {}
		}.bind(this)
	);
},

// Returns -1 if a > b, 0 if a == b and 1 if b > a.
// Causes sort from newer to older (bigger number is newer).
_compareDateAdded: function(a, b) {
	if(a.dateAdded > b.dateAdded) {
		return -1;
	}
	if(a.dateAdded < b.dateAdded) {
		return 1;
	}
	return 0;
},

// Move folders to the beginning of the list, then sort by dateAdded (newer to older)
_compareFolderThenDateAdded: function(a, b) {
	
	if(a.url == null && b.url != null) {
		return -1;
	}
	if(b.url == null && a.url != null) {
		return 1;
	}

	return this._compareDateAdded(a, b);
},

// This function assumes there's a single copy of "bmNodeToRemove" in this._pinnedBookmarks
_removePinnedBookmark: function(bmNodeToRemove) {
	const logHead = "BookmarksManager::_removePinnedBookmark(" + bmNodeToRemove.bookmarkId + "): ";
	let idx = this._pinnedBookmarks.findIndex(node => node.id === bmNodeToRemove.id);
	if(idx == -1) {
		this._err(logHead + "node should exist, but not found", bmNodeToRemove);
		return;
	}

	this._log(logHead + "removing node", bmNodeToRemove);
	this._pinnedBookmarks.splice(idx, 1);
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
		this._err(logHead + "node should exist, but not found", debugName, nodeToAdd);
		targetList.push(nodeToAdd);
	} else {
		this._log(logHead + "replacing existing", debugName, nodeToAdd);
		targetList[idx] = nodeToAdd;
	}
},

_loadBookmarkTreeNode: function(node) {
	const logHead = "BookmarksManager::_loadBookmarkTreeNode(): ";

	// Make sure to do this before calling tabNormalizer.normalize(), we want
	// original chrome-API-style IDs as keys, since we use these keys to work
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
		this._appendOrReplaceNode(node, bmAlreadyTracked, this._folders, "folder");
		return;
	}

	// The following actions are only for non-folders.

	// Check for pinned bookmarks before the "node.id" gets modified by tabNormalizer.normalize().
	node.pinned = settingsStore.isBookmarkPinned(node.id);
	if(!bmAlreadyTracked && node.pinned) {
		// If a bookmark is already tracked, its pinned state is already accurate in _pinnedBookmarkIds,
		// but it will not be accurate in "node", because the new "node" is replacing the old node.
		// If we didn't make this check, we'd run the risk of having duplicates in _pinnedBookmarkIds.
		this._pinnedBookmarkIds.push(node.id);
	}

	tabNormalizer.normalize(node, Classes.TabNormalizer.type.BOOKMARK);

	this._appendOrReplaceNode(node, bmAlreadyTracked, this._bookmarks, "bookmark");
	if(node.pinned) {
		// If a node is already tracked and we're pushing a replacement, the replacement
		// doesn't decide on its own whether or not it's pinned, so we can simply rely on
		// settingsStore.isBookmarkPinned(node.id) to understand if a pinned node needs
		// to be replaced
		this._appendOrReplaceNode(node, bmAlreadyTracked, this._pinnedBookmarks, "pinnedBookmark");
	}
},

_resetShadowCopy: function() {
	this._bookmarksDict = {};
	this._bookmarks = [];
	this._folders = [];
	this._pinnedBookmarks = [];
	this._pinnedBookmarkIds = [];

	this._stats.folders = 0;
	this._stats.bookmarks = 0;
	this._stats.pinnedBookmarks = 0;
	this._stats.bookmarksOverCap = 0;
	// Don't reset the other stats, they're not supposed to be reset by the callers of
	// this function. Call BookmarksManager.resetStats() if you want to reset all other
	// statistics
},

resetStats: function() {
	this._stats = {
		load: 0,
		find: 0,
		folders: 0,
		bookmarks: 0,
		pinnedBookmarks: 0,
		// How many bookmarks+folders we had to drop because they exceeded this._maxBookmarkNodesTracked
		bookmarksOverCap: 0,

		// Folder path building
		asyncPathQueries: 0,
		syncPathQueries: 0,

		// Counting events received
		onCreated: 0,
		// We ignore an "onCreated" event if there's an import in progress
		onCreatedIgnored: 0,
		onChanged: 0,
		onChangedUntracked: 0,
		onRemoved: 0,
		onMoved: 0,
		onMovedUntracked: 0,
		onImportBegan: 0,
		onImportEnded: 0,
	};
},

_loadBookmarkTreeNodeList: function(nodes) {
	const logHead = "BookmarksManager::_loadBookmarkTreeNodeList(): ";
	this._log(logHead + "received: ", nodes);

	this._resetShadowCopy();

	perfProf.mark("bookmarksSetupStart");

	// "i < this._maxBookmarkNodesTracked" is used to cap the maximum number of
	// bookmarks+folders used by TabMania. Given the "nodes" list is sorted by
	// "dateAdded" (most recently added first), the capping filters out the oldest
	// bookmarks and folders in the list.
	for(let i = 0; i < nodes.length && i < this._maxBookmarkNodesTracked; i++) {
		this._loadBookmarkTreeNode(nodes[i]);
	}

	if(nodes.length > this._maxBookmarkNodesTracked) {
		this._stats.bookmarksOverCap = nodes.length - this._maxBookmarkNodesTracked;
	}
	perfProf.mark("bookmarksSetupEnd");
},

// The old _loadBookmarks() is based on chrome.bookmarks.getRecent().
// It has the advantage that it natively accepts this._maxBookmarkNodesTracked and
// it will only return a maximum of the nodes you asked.
// On the other hand, it has the disadvantage that it returns only bookmarks, no folders.
// We use folders to populate bookmark paths in menu dropdowns, and having to load each
// folder one by one while exploring paths one parentId at a time makes the rendering of
// the dropdown menus much slower (idle waiting for next event cycles, but still slower)
//
// The new _loadBookmarks() is based on chrome.bookmarks.getTree().
// It has the advantage that it returns both bookmarks and folders, but it has the
// disadvantage that the amount of nodes returned can't be natively capped to
// this._maxBookmarkNodesTracked, so we'll always need to get all the bookmarks, then
// cap them ourselves to this._maxBookmarkNodesTracked. Right now this doesn't seem to
// be a very big deal, since _treeToList() + sort() happen very quickly. Our testing
// environment doesn't have a lot of bookmarks and folders (only 456 bookmarks and 32
// folders), but it takes only 2ms for those, so extrapolating linearly, we're talking
// about 200ms for the creation of the full list that will be capped by _loadBookmarkTreeNodeList(),
// to process 100 times more bookmarks. We don't know if it's common to have 45,600
// bookmarks, but it sounds like a very large improbable number.
//
// "sendEvent" is an optional flag that controls whether or not this function should
// notify listeners once the processing of the (re)loaded bookmarks is completed.
// Defaults to "true".
OLD_loadBookmarks: function(sendEvent) {
	sendEvent = optionalWithDefault(sendEvent, true);

	const logHead = "BookmarksManager::_loadBookmarks(" + sendEvent + "): ";
	perfProf.mark("bookmarksLoadStart");

	this._log(logHead + "loading bookmarks");
	this._stats.load++;
	this._bookmarksLoadingPromise = chromeUtils.wrap(chrome.bookmarks.getRecent, logHead, this._maxBookmarkNodesTracked).then(
		function(nodes) { // onFulfill
			perfProf.mark("bookmarksLoadEnd");
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

_treeToList: function(rootNode) {
	let rootNodeId = "none";
	let children = null;

	if(Array.isArray(rootNode)) {
		// Case of the outermost call to _treeToList() from _loadBookmarks()
		children = rootNode;
	} else {
		rootNodeId = rootNode.id;
		children = rootNode.children;
	}

//	const logHead = "BookmarksManager::_treeToList(" + rootNodeId + "): ";
//	this._log(logHead + "processing", rootNode);

	if(children == null || children.length == 0) {
		return [];
	}

	let subNodes = Array(children.length);
	for(let i = 0; i < children.length; i++) {
		subNodes[i] = this._treeToList(children[i]);
	}

	// Flatten the array of arrays into concat() arguments (one argument per inner array)
	return children.concat.apply(children, subNodes);
},

// "sendEvent" is an optional flag that controls whether or not this function should
// notify listeners once the processing of the (re)loaded bookmarks is completed.
// Defaults to "true".
//
// Timing (with 456 bookmarks and 32 folders, measured on 21.03.12):
// - With getTree()
//   * chrome.bookmarks.getTree():		171.8ms		148.1ms		100.0ms		103.6ms		 95.9ms
//   * treeToList() + sort():			 13.7ms		  1.3ms		  2.9ms		  2.0ms		  1.2ms
//   * setting up:						 80.3ms		 24.0ms		 46.2ms		 28.0ms		 26.9ms
// - With getRecent()
//   * chrome.bookmarks.getRecent():	 99.7ms		167.1ms		124.2ms		115.3ms		116.5ms
//   * treeToList() + sort():			  N/A		  N/A		  N/A		  N/A		  N/A
//   * setting up:						 34.9ms		 26.2ms		 36.5ms		 36.3ms		 32.9ms
_loadBookmarks: function(sendEvent) {
	sendEvent = optionalWithDefault(sendEvent, true);

	const logHead = "BookmarksManager::_loadBookmarks(" + sendEvent + "): ";
	perfProf.mark("bookmarksLoadStart");

	this._log(logHead + "loading bookmarks");
	this._stats.load++;
	this._bookmarksLoadingPromise = chromeUtils.wrap(chrome.bookmarks.getTree, logHead).then(
		function(rootNodes) { // onFulfill
			perfProf.mark("bookmarksLoadEnd");
			this._log(logHead + "chrome.bookmarks.getTree() returned", rootNodes);
			try {
				perfProf.mark("bookmarksTreeToListStart");
				let nodes = this._treeToList(rootNodes);
				// We need to move the folders to the beginning of the list so they can
				// get processed first, otherwise TabsStore can't assign a folder to
				// the bookmarks when their folders have not been processed yet. By choosing
				// this logic we'll still be unable to assign folders to folders, but that
				// should not be a big problem.
				// An added advantage of this choice is that by front-loading all folders,
				// we never risk to lose folders behind bookmarks when we reach the maximum
				// cut-over point of _maxBookmarkNodesTracked.
				nodes.sort(this._compareFolderThenDateAdded.bind(this));
				perfProf.mark("bookmarksTreeToListEnd");
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

_initChromeListeners: function() {
	// https://developer.chrome.com/docs/extensions/reference/bookmarks/#event-onCreated
	chrome.bookmarks.onCreated.addListener(this._bookmarkCreatedCb.bind(this));
	// https://developer.chrome.com/docs/extensions/reference/bookmarks/#event-onChanged
	chrome.bookmarks.onChanged.addListener(this._delayableEventCb.bind(this, this._applyBookmarkChangeCb.bind(this), false));
	// https://developer.chrome.com/docs/extensions/reference/bookmarks/#event-onRemoved
	chrome.bookmarks.onRemoved.addListener(this._delayableEventCb.bind(this, this._applyBookmarkRemoveCb.bind(this), false));
	// https://developer.chrome.com/docs/extensions/reference/bookmarks/#event-onMoved
	chrome.bookmarks.onMoved.addListener(this._delayableEventCb.bind(this, this._applyBookmarkMoveCb.bind(this), false));
	// https://developer.chrome.com/docs/extensions/reference/bookmarks/#event-onImportBegan
	chrome.bookmarks.onImportBegan.addListener(this._bookmarkImportBeganCb.bind(this));
	// https://developer.chrome.com/docs/extensions/reference/bookmarks/#event-onImportEnded
	chrome.bookmarks.onImportEnded.addListener(this._bookmarkImportEndedCb.bind(this));
},

// We need an event entry point _bookmarkCreatedCb() (instead of using the generic _delayableEventCb())
// because for bookmark creation we must track "_bookmarksImportInProgress".
_bookmarkCreatedCb: function(id, bmNode) {
	const logHead = "BookmarksManager::_bookmarkCreatedCb(" + id + "): ";
	if(!this.isActive()) {
		this._log(logHead + "ignoring event while bookmarksManager is not active");
		return;
	}

	this._stats.onCreated++;

	if(this._bookmarksImportInProgress) {
		// Per the documentation, ignore chrome.bookmarks.onCreated events
		// while a bulk import is in progress.
		// See https://developer.chrome.com/docs/extensions/reference/bookmarks/#event-onImportBegan
		this._stats.onCreatedIgnored++;
		return;
	}

	this._delayableEventCb(this._applyBookmarkCreateCb.bind(this), false, id, bmNode);
},

// "eventCb" is assumed to be a function in this class. If you need to pass it functions from
// other classes, change the two calls ".apply(this, args)" below to ".apply(null, args)"
// "runAlways" is intended to bypass the check for whether or not bookmarksManager is active.
_delayableEventCb: function(eventCb, runAlways, ...args) {
	// _delayableEventCb is called for Chrome events (args[0] is normally the ID of the
	// bookmark) and for settingsStore events (args[0] is "ev")
	const logHead = "BookmarksManager::_delayableEventCb(" + args[0] + "): ";
	if(!this.isActive() && !runAlways) {
		this._log(logHead + "ignoring event while bookmarksManager is not active");
		return;
	}

	if(this._bookmarksLoadingPromise != null) {
		// For Chrome events, args[1] is "eventInfo", for settingsStore events it's "undefined"
		// (assuming out-of-bound index for arrays returns "undefined" instead of triggering
		// an "out-of-bounds exception".
		this._log(logHead + "loading in progress, delaying event processing", args[1]);
		this._bookmarksLoadingPromise.then(
			function() {
				eventCb.apply(this, args)
			}.bind(this)
		);
	} else {
		// If not waiting for a promise, take the action immediately
		eventCb.apply(this, args);
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

	let bm = this._bookmarksDict[id];
	if(bm == null) {
		this._log(logHead + "not tracked, ignoring", changeInfo);
		this._stats.onChangedUntracked++;
		return;
	}

	this._log(logHead + "processing", changeInfo);
	this._stats.onChanged++;

	bm.title = changeInfo.title;
	bm.url = changeInfo.url;

	// updateTitle() requires updateUrl() to be called first
	tabNormalizer.updateUrl(bm);
	tabNormalizer.updateTitle(bm);

	this._eventManager.notifyListeners(Classes.EventManager.Events.UPDATED, { id: tabNormalizer.normalizeBookmarkId(id) });
},

_applyBookmarkRemoveCb: function(id, removeInfo) {
	const logHead = "BookmarksManager::_applyBookmarkRemoveCb(" + id + "): ";

	// In the case of removal, we might not be tracking a bookmark in bookmarkManager,
	// but it might still be configured pinned, in which case we still need to remove it
	this._stats.onRemoved++;

	this._log(logHead + "processing", removeInfo);

	// Per the comment below, this action on settingsStore doesn't really help when a full
	// subtree is deleted, but we have other ways to keep the pinned bookmarks from growing
	// forever, we clear the stale ones when you add a new pinned bookmark.
	if(settingsStore.isBookmarkPinned(id)) {
		settingsStore.unpinBookmark(id);
	}
	// A remove event is tricky business, since per the documentation, you get a single
	// event for the top element being deleted, and if it's a folder, you don't get any
	// event for the rest of the subtree... probably less trouble to just reload the
	// entire structure. Also, we want to continue to have a maximum of this._maxBookmarkNodesTracked
	// bookmark nodes, and removing a node/subtree can make room for other nodes.
	this._loadBookmarksJob.run(this._loadBookmarksDelay);
},

_applyBookmarkMoveCb: function(id, moveInfo) {
	const logHead = "BookmarksManager::_applyBookmarkMoveCb(" + id + "): ";

	let bm = this._bookmarksDict[id];
	if(bm != null) {
		this._log(logHead + "not tracked, ignoring", moveInfo);
		this._stats.onMovedUntracked++;
		return;
	}

	this._log(logHead + "processing", moveInfo);
	this._stats.onMoved++;

	this._assert(bm.parentId == moveInfo.oldParentId);
	bm.parentId = moveInfo.parentId;
	// Once we update the parentId, we also need to update the searchable folder info
	tabNormalizer.updateBookmarkFolder(bm);

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

	this._eventManager.notifyListeners(Classes.EventManager.Events.UPDATED, { id: tabNormalizer.normalizeBookmarkId(id) });
},

_bookmarkImportBeganCb: function() {
	const logHead = "BookmarksManager::_bookmarkImportBeganCb(): ";
	this._log(logHead + "import started");

	// Note that we're not checking "this._isActive()" here, because if we get enabled while
	// an import is underway, we want to know that it's underway...

	// In theory we could just call a removeListener() for _bookmarkCreatedCb() when
	// we get out of search mode, but it's always a pain to manage these removeListener()
	// functions that expect you to pass as handle the exact function you used when you
	// called addListener() (we're currently not tracking those "this.<fn>/bind(this)"
	// function pointers).
	// Anyway these events should not be very frequent, so no reason to optimize
	// too much. Using the flag to disable any expensive operation should be sufficient.
	//
	// See https://developer.chrome.com/docs/extensions/reference/events/#type-Event for
	// the definition of removeListener().
	this._bookmarksImportInProgress = true;
	this._stats.onImportBegan++;
	// No other action needs to be taken in this case
},

_bookmarkImportEndedCb: function() {
	const logHead = "BookmarksManager::_bookmarkImportBeganCb(): ";
	this._log(logHead + "import ended");

	this._bookmarksImportInProgress = false;
	this._stats.onImportEnded++;

	// See _bookmarkImportBeganCb() for why we put this check so late in this function
	if(!this.isActive()) {
		this._log(logHead + "ignoring event while bookmarksManager is not active");
		return;
	}
	// Let's do a full refresh of the search results after a bulk import.
	// We can't include a single "id" in the event in this case, so let's just leave
	// the property missing.
	this._loadBookmarksJob.run(this._loadBookmarksDelay);
},

_optionsUpdatedCb: function(ev) {
//	const logHead = "BookmarksManager::_optionsUpdatedCb(" + ev.detail.key + "): ";
//
//	if(ev.detail.key != "options") {
//		this._log(logHead + "ignoring key");
//		return;
//	}

	this._applyOptionsChangeJob.run(this._applyOptionsChangeDelay);
},

_applyOptionsChange: function() {
	// The job has been started, but we now need to make sure there are no active
	// _loadBookmarks(), otherwise we have to continue to wait for it to finish.
	// Note that we must set the function argument "runAlways = true" because the
	// correct isActive() state is set in _applyOptionsUpdateCb(), so that
	// function must always run.
	this._delayableEventCb(this._applyOptionsUpdateCb.bind(this), true, "applyOptionsChange");
},

_applyOptionsUpdateCb: function() {
	const logHead = "BookmarksManager::_applyOptionsUpdateCb(): ";

	let bookmarksInSearch = settingsStore.getOptionBookmarksInSearch();
	if(this.isActive() && !bookmarksInSearch) {
		this._log(logHead + "property \"bookmarksInSearch\" set to \"false\", stopping bookmarksManager");
		// Need to disable
		this._bookmarksManagerActive = false;
		this._resetShadowCopy();
		this._eventManager.notifyListeners(Classes.EventManager.Events.UPDATED, { });
		return;
	}

	if(!this.isActive() && bookmarksInSearch) {
		this._log(logHead + "property \"bookmarksInSearch\" set to \"true\", starting bookmarksManager");
		// Need to enable
		this._initBookmarks();
		// No need to dispatch an event, one will be dispatched by _loadBookmarks()
		// when it's finished loading all the bookmarks in its shadow copy
		// this._eventManager.notifyListeners(Classes.EventManager.Events.UPDATED, { });
		return;
	}

	this._log(logHead + "property \"bookmarksInSearch\" unchanged, nothing to do");
},

_applyPinnedUpdateCb: function() {
	const logHead = "BookmarksManager::_applyPinnedUpdateCb(): ";

	let pinnedBmIdList = settingsStore.getPinnedBookmarks().getAll();
	let found = [];

	// Loop to discard stale pinned bookamrs from settingsStore, and to add new
	// pinned bookmarks to this._pinnedBookmarks. We also need to set the "pinned"
	// property on the corresponding nodes.
	for(let i = 0; i < pinnedBmIdList.length; i++) {
		let bm = this._bookmarksDict[pinnedBmIdList[i]];
		if(bm == null) {
			this._log(logHead + "discarding pinned bookmark ID " + pinnedBmIdList[i]);
			// Assuming the number of stale pinned bookmarks is small (that is, not a lot
			// of pinned bookmarks have been deleted via Chrome while the TabMania popup
			// was not running), calling settingsStore.unpinBookmark() individually should
			// not be a huge performance drain
			settingsStore.unpinBookmark(pinnedBmIdList[i]);
		} else {
			found.push(pinnedBmIdList[i]);
			if(!bm.pinned) {
				bm.pinned = true;
				// If "bm" was not pinned, it was not in this._pinnedBookmarks, no need
				// to worry about duplicating it there
				this._pinnedBookmarks.push(bm);
				// this._pinnedBookmarkIds will be updated at the end of the two loops
				this._log(logHead + "pinning bookmark ID " + pinnedBmIdList[i], bm);
			}
		}
	}

	// this._pinnedBookmarkIds has remained untouched since the beginning of this
	// function, so we can safely use it to build a diff of what's happened.
	// We'll use "deleted" to unpin nodes in bookmarkManager, but we'll use
	// both "added" and "deleted" for the event generated to our listeners,
	// so both need to be accurate, and to be accurate, this._pinnedBookmarkIds
	// must remain unchanged in this function until this point.
	// Note that "changed" should be an empty array given we're not passing specialized
	// comparison functions to tmUtils.arrayDiff(), we'll just ignore it.
	let [ added, deleted, changed ] = tmUtils.arrayDiff(this._pinnedBookmarkIds, found);

	// Loop to remove from this._pinnedBookmarks any bookmark that is no longer pinned.
	// That's what's in the "deleted" array. We also need to unset the "pinned" property
	// on the corresponding nodes.
	for(let i = 0; i < deleted.length; i++) {
		let bm = this._bookmarksDict[deleted[i]];
		if(bm == null) {
			this._err(logHead + "unexpected, bookmark ID " + deleted[i] + " not found");
		} else {
			if(bm.pinned) {
				bm.pinned = false;
				this._removePinnedBookmark(bm);
				// this._pinnedBookmarkIds will be updated at the end of the two loops
				this._log(logHead + "unpinning bookmark ID " + deleted[i], bm);
			} else {
				// The reason this is unexpected is because this._pinnedBookmarkIds thinks
				// it's pinned, while the bookmark node itself thinks it isn't, which is
				// an inconsistency that should not happen.
				// If this inconsistency exists, probably this._pinnedBookmarks is also
				// inconsistent, let's try to fix it by removing it from there too...
				this._err(logHead + "unexpected, bookmark ID " + deleted[i] + " already unpinned", bm);
				this._removePinnedBookmark(bm);
			}
		}
	}

	this._pinnedBookmarkIds = found;

	this._eventManager.notifyListeners(Classes.EventManager.Events.UPDATED, { pinned : { added: added, deleted: deleted } });
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

// This function uses the "Chrome bookmark ID" (not the modified ID defined in TabsStore),
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
	this._stats.asyncPathQueries++;

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
	this._stats.syncPathQueries++;

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

getBmFolderSync: function(bmNode) {
	let pathList = bookmarksManager.getBmPathListSync(bmNode);
	if(pathList == null) {
		return null;
	}

	// bookmarksManager.getBmPathListSync()() returns an array that starts with an empty
	// string (the root element of the bookmarks tree has no title), and that's
	// perfect to have .join("/") add a leading "/".
	return pathList.join("/");
},

getBmFolderAsync: async function(bmNode) {
	let pathList = await bookmarksManager.getBmPathListAsync(bmNode);

	// bookmarksManager.getBmPathListSync()() returns an array that starts with an empty
	// string (the root element of the bookmarks tree has no title), and that's
	// perfect to have .join("/") add a leading "/".
	return pathList.join("/");
},

getPinnedBookmarks: function(filterOutIds) {
	if(!this.isActive()) {
		return [];
	}

	if(filterOutIds == null) {
		return this._pinnedBookmarks;
	}

	// Need to filter out some bookmark IDs
	let retVal = [];
	for(let i = 0; i < this._pinnedBookmarks.length; i++) {
		let bmNode = this._pinnedBookmarks[i];
		if(!filterOutIds.includes(bmNode.bookmarkId)) {
			retVal.push(bmNode);
		}
	}
	return retVal;
},

getStats: function() {
	this._stats.folders = this._folders.length;
	this._stats.bookmarks = this._bookmarks.length;
	this._stats.pinnedBookmarks = this._pinnedBookmarks.length;
	return this._stats;
},

isActive: function() {
	return this._bookmarksManagerActive;
},

}); // Classes.BookmarksManager
