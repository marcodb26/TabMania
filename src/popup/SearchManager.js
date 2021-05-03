// CLASS SearchManager
//
Classes.SearchManager = Classes.AsyncBase.subclass({

	_tabsManager: null,
	_historyFinder: null,

	_searchQuery: null,

	_searchResults: null,

_init: function({ tabsManager, historyFinder }) {
	// Set these properties before calling the parent _init(), because the
	// parent _init() will trigger _asyncInit(), and when _asyncInit() runs,
	// it needs to have these values available
	this.debug();

	this._tabsManager = tabsManager;
	this._historyFinder = historyFinder;

	this._eventManager = Classes.EventManager.create();
	this._eventManager.attachRegistrationFunctions(this);

	// Overriding the parent class' _init(), but calling that original function too
	Classes.AsyncBase._init.apply(this, arguments);
},

_asyncInit: function() {
	// Overriding the parent class' _asyncInit(), but calling that original function first
	let promiseArray = [ Classes.AsyncBase._asyncInit.call(this) ];
	promiseArray.push(this._tabsManager.getInitPromise());

	// bookmarksManager and this._historyFinder are both not async (though probably they should be)

	return Promise.all(promiseArray);
},

queryTabs: async function() {
	const logHead = "SearchManager::_queryTabs(): ";
	[ rcTabs, bmNodes, hItems ] = await Promise.all([
		// Unlike bookmarks and history items that support search, recently closed tabs
		// don't support search, but there's only a maximum of 25 of them, so we can just
		// scoop them all up and pretend they were always together with the standard tabs
		this._historyFinder._getRecentlyClosedTabs(),
		bookmarksManager.find(this._searchQuery),
		this._historyFinder.find(this._searchQuery),
	]);

	if(!this.isSearchActive()) {
		// While waiting for the Promise.all(), the user can close the search and go
		// back to standard mode. If that happens, the call to this._activateSearchBox(false)
		// sets this._searchQuery to "null", so this function will eventually fail if
		// we let it continue. Let's just get out...
		this._log(logHead + "got out of search mode, discarding results");
		return;
	}

	// We're merging all tabs that still need to be searched. We're not including
	// bmNodes because bookmarks have already been searched via this._searchQuery.search(),
	// while history items have only been searched via chrome.history.search() (with
	// the simplified query string to boot), so it needs a second pass.
	// concat() dosn't modify the return value of _tabsManager.getTabs(), so this call
	// is safe.
	let tabs = this._tabsManager.getTabs().concat(rcTabs, hItems);

	perfProf.mark("searchFilterStart");
	let searchResults = this._searchQuery.search(tabs, logHead);
	perfProf.mark("searchFilterEnd");

	// Using Array.concat() instead of the spread operator [ ...tabs, ...bmNodes] because
	// it seems to be faster, and because we're potentially dealing with large arrays here
	return this._searchResults = searchResults.concat(bmNodes);
},

isSearchActive: function() {
	return (this.isInitialized() && this._searchQuery != null);
},

updateQuery: function(value) {
	if(this._searchQuery == null) {
		this._searchQuery = Classes.SearchQuery.create();
	}

	perfProf.mark("parseQueryStart");
	this._searchQuery.update(value);
	perfProf.mark("parseQueryEnd");
},

getTabs: function() {
	return this._searchResults;
},

getErrors: function() {
	return this._searchQuery.getErrors();
},

reset: function() {
	this._searchQuery = null;
	this._searchResults = null;
},

}); // Classes.SearchManager