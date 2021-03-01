// CLASS BookmarksFinder
//
// This class generates events Classes.EventManager.Events.UPDATED, with "detail"
// set to { target: <this object>, id: <id of the bookmakr that changed, or "undefined"> }.
Classes.BookmarksFinder = Classes.Base.subclass({
	_bookmarkImportInProgress: null,

	_eventManager: null,

_init: function(tabGroup, expandedGroups) {
	// Overriding the parent class' _init(), but calling that original function first
	Classes.Base._init.call(this);
	this.debug();

	this._eventManager = Classes.EventManager.create();
	this._eventManager.attachRegistrationFunctions(this);

	// https://developer.chrome.com/docs/extensions/reference/bookmarks/#event-onChanged
	chrome.bookmarks.onChanged.addListener(this._bookmarkUpdatedCb.bind(this));
	// https://developer.chrome.com/docs/extensions/reference/bookmarks/#event-onCreated
	chrome.bookmarks.onCreated.addListener(this._bookmarkCreatedCb.bind(this));
	// https://developer.chrome.com/docs/extensions/reference/bookmarks/#event-onRemoved
	chrome.bookmarks.onRemoved.addListener(this._bookmarkUpdatedCb.bind(this));
	// https://developer.chrome.com/docs/extensions/reference/bookmarks/#event-onImportBegan
	chrome.bookmarks.onImportBegan.addListener(this._bookmarkImportBeganCb.bind(this));
	// https://developer.chrome.com/docs/extensions/reference/bookmarks/#event-onImportEnded
	chrome.bookmarks.onImportEnded.addListener(this._bookmarkImportEndedCb.bind(this));
},

_bookmarkCreatedCb: function(id, bmNode) {
	if(this._bookmarkImportInProgress) {
		// Per the documentation, ignore chrome.bookmarks.onCreated events
		// while a bulk import is in progress.
		// See https://developer.chrome.com/docs/extensions/reference/bookmarks/#event-onImportBegan
		return;
	}

	this._eventManager.notifyListeners(Classes.EventManager.Events.UPDATED, { id: id });
},

_bookmarkUpdatedCb: function(id, changeRemoveInfo) {
	this._eventManager.notifyListeners(Classes.EventManager.Events.UPDATED, { id: id });
},

_bookmarkImportBeganCb: function() {
	// In theory we could just call a removeListener() for _bookmarkCreatedCb() when
	// we get out of search mode, but it's not even clear how well supported that
	// function is, since it's not well documented... see: https://stackoverflow.com/a/13522461/10791475
	// Anyway these events should not be very frequent, so no reason to optimize
	// too much. Using the flag to disable any expensive operation should be sufficient.
	this._bookmarkImportInProgress = true;
	// No other action needs to be taken in this case
},

_bookmarkImportEndedCb: function() {
	this._bookmarkImportInProgress = false;

	// Let's do a full refresh of the search results after a bulk import.
	// We can't include a single "id" in the event in this case, so let's just leave
	// the property missing.
	this._eventManager.notifyListeners(Classes.EventManager.Events.UPDATED, { });
},

_processBookmarkTreeNodes: function(nodes) {
	const logHead = "BookmarksFinder::_processBookmarkTreeNodes(): ";
	this._log(logHead + "received: ", nodes);
	nodes.forEach(
		function(node) {
			// We want each "node" to be as similar as possible to a "tab" object...
			// It already includes "title", "url" and "id" (though we have to be careful not
			// to mix up a bookmark ID and a tab ID (the former is a string, the latter is a
			// number, though the string encodes a number that looks like a tab ID)).
			// We want to add favIconUrl, a compatible "status" to render the bookmarks in
			// black and while like we render unloaded tabs, and some of the things we get from
			// NormalizedTabs.normalizeTab() (which we can safely call directly).

			// BookmarkTreeNode doesn't include a favIcon for the bookmark, but we could be
			// lucky and find one in the Chrome's favIcon cache...
			// See https://stackoverflow.com/questions/10665321/reliably-getting-favicons-in-chrome-extensions-chrome-favicon
			node.favIconUrl = "chrome://favicon/size/16@1x/" + node.url;
			node.status = "unloaded";
			Classes.NormalizedTabs.normalizeTab(node, Classes.NormalizedTabs.type.BOOKMARK);
		}
	);

	// Don't sort here. In the "merge with tabs" case, we'll need to re-sort anyway, so
	// let's just sort once in the caller
	//nodes = nodes.sort(Classes.NormalizedTabs.compareTabsFn);
	return nodes;
},

// Returns an unsorted list of bookmark nodes, normalized with NormalizedTabs.normalizeTabs()
find: function(searchString) {
	const logHead = "BookmarksFinder::find(" + searchString + "): ";
	if(!settingsStore.getOptionBookmarksInSearch()) {
		this._log(logHead + "bookmarks are disabled in search, nothing to do");
		// Pretend we searched and found no bookmarks (empty array)
		return Promise.resolve([]);
	}

	this._log(logHead + "processing bookmarks");
	return chromeUtils.wrap(chrome.bookmarks.search, logHead, searchString).then( this._processBookmarkTreeNodes.bind(this));
},

}); // Classes.BookmarksFinder
