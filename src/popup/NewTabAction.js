Classes.NewTabAction = Classes.Base.subclass({

	_newTabButtonViewer: null,

_init: function() {
	// Overriding the parent class' _init(), but calling that original function first
	Classes.Base._init.call(this);

	let btnOptions = {
		btnExtraClasses: [ "tm-plus-icon" ],
	};

	this._newTabButtonViewer = Classes.ButtonViewer.create(btnOptions);
	this._newTabButtonViewer.onButtonClickCb = this._createNewTab.bind(this);
	popupViewer.appendButton(this._newTabButtonViewer);
},

// This is 90% similar to TabsManager._launchOrSearch(), but that code is only
// available in the background page, not here. Very minor duplication, little sin...
_launchOrSearch: function(urlOrSearch, incognito) {
	const logHead = "NewTabAction::_launchOrSearch(): ";

	let searchUrl = optionalWithDefault(settingsStore.getOptionSearchUrl(),
										"https://www.google.com/search?q=%s");

	// First check if this is really a URL

	// Note that unfortunately something like "www.google.com" is not a valid URL because
	// it's missing the protocol ("https://"). For now let's live with this, even though
	// rom a UX perspective people will be surprised by the resulting search...
	if(!isUrl(urlOrSearch)) {
		this._log(logHead + "not a URL, opening a search page instead: " + urlOrSearch);
		// This is not a URL, let's consider it text for a Google (or whatever other
		// engine is configured) search.
		urlOrSearch = searchUrl.replace("%s", urlOrSearch);
	}

	chromeUtils.loadUrl(urlOrSearch, { incognito });
},

_createNewTab: function(ev) {
	const logHead = "NewTabAction::_createNewTab(): ";

	let searchQuery = popupViewer.getSearchQuery();
	let incognito = popupViewer.isIncognitoBsTabActive();

	//this._log(logHead + "the search query is: " + searchQuery);
	if(searchQuery == null) {
		// Normal behavior
		chromeUtils.createTab({ incognito });
		return;
	}

	// The searchQuery is not "null", let's behave like a launch/Search shortcut using
	// the content of the searchbox.
	this._launchOrSearch(searchQuery, incognito);
},

}); // Classes.NewTabAction