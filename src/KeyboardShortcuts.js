// CLASS KeyboardShortcuts
//
Classes.KeyboardShortcuts = Classes.Base.subclass({

	_clipboardTextAreaElem: null,

_init: function() {
	// Overriding the parent class' _init(), but calling that original function first
	Classes.Base._init.call(this);

	this._initClipboardDomTextArea();

	// https://developer.chrome.com/docs/extensions/reference/commands/
	chrome.commands.onCommand.addListener(this._onCommandCb.bind(this));
},

_initClipboardDomTextArea: function() {
	const logHead = "KeyboardShortcuts::_initClipboardDomTextArea(): ";
	const textAreaId = "KeyboardShortcutsClipboard";
	const textAreaHtml = `
		<textarea id="${textAreaId}" name="clipboard"></textarea>
	`;

	let elem = document.createElement("div");
	elem.innerHTML = textAreaHtml;

	// We append a few DOM elements to the _generated_background_page.html,
	// one here, one in the PopupDockerBg class. The assumption is that each
	// one of these classes is intended to have a single instance running.
	document.body.append(elem);

	this._clipboardTextAreaElem = document.getElementById(textAreaId);

	if(this._clipboardTextAreaElem == null) {
		this._err(logHead + "unable to get textarea element");
	}
},

_getClipboardAsText: function() {
	const logHead = "KeyboardShortcuts::_getClipboardAsText(): ";

	this._clipboardTextAreaElem.focus();
	// See https://developer.mozilla.org/en-US/docs/Web/API/Document/execCommand
	// It says execCommand() is deprecated, let's see...
	if(!document.execCommand("paste")) {
		this._err(logHead + "paste command not supported");
		return null;
	}

	let retVal = this._clipboardTextAreaElem.value;

	// Clean up
	this._clipboardTextAreaElem.value = "";

	return retVal;
},

launchOrSearch: function(url, incognito=false) {
	const logHead = "KeyboardShortcuts::launchOrSearch(): ";

	if(url == null) {
		// Nothing to do, an error log should already have been generated by _getClipboardAsText()
		return;
	}

	let searchUrl = optionalWithDefault(settingsStore.getOptionSearchUrl(),
										"https://www.google.com/search?q=%s");

	// First check if this is really a URL

	// Note that unfortunately something like "www.google.com" is not a valid URL because
	// it's missing the protocol ("https://"). For now let's live with this, even though
	// rom a UX perspective people will be surprised by the resulting search...
	if(!isUrl(url)) {
		this._log(logHead + "the clipboard doesn't contain a URL, opening a search page instead: " + url);
		// This is not a URL, let's consider it text for a Google (or whatever other
		// engine is configured) search.
		url = searchUrl.replace("%s", url);
//		url = "https://www.google.com/search?q=" + url;
	}

	chromeUtils.loadUrl(url, { incognito });
},

runCustomShortcutSearch: function(scInfo, searchText, incognito=false) {
	const logHead = "KeyboardShortcuts::runCustomShortcutSearch(searchText: " + searchText + "): ";

	if(searchText == null || searchText == "") {
		this._log(logHead + "no search text, nothing to do");
		return;
	}

	// Special case, we need to search in the TabMania popup
	if(scInfo.tabMania) {
		this._log(logHead + "running search query in the the TabMania popup");
		popupDockerBg.runPopupSearch(searchText);
		return;
	}

	let url = scInfo.searchUrl.replace("%s", searchText);
	this._log(logHead + "converted searchUrl to: " + url, scInfo);

	// If there are no candidateTabs, open "url" in new tab
	if(scInfo.candidateTabs == null) {
		this._log(logHead + "no candidateTabs, opening in new tab");
		// We pick the "least tabbed window" to open the new tab
		chromeUtils.loadUrl(url, { incognito });
		return;
	}

	// If we get here, there are candidateTabs. Search for an exact match of
	// "url" among them, and if you can't find it, just open "url" in candidateTabs[0].

	// We can't open the lower case URL, but we can try to search using it...
	let lowerCaseUrl = url.toLowerCase();
	let tabIdx = scInfo.candidateTabs.findIndex(
		function(elem) {
			if(elem.tm.lowerCaseUrl == lowerCaseUrl) {
				return true;
			}
			return false;
		}.bind(this)
	);

	// If we found an exact match, open that tab, otherwise open tab 0.
	tabIdx = (tabIdx != -1) ? tabIdx : 0;
	this._log(logHead + "opening in candidateTabs[" + tabIdx + "]", scInfo.candidateTabs[tabIdx]);
	chromeUtils.loadUrl(url, { tabId: scInfo.candidateTabs[tabIdx].id });
},

_manageCustomShortcut: function(shortcutKey) {
	const logHead = "KeyboardShortcuts::_manageCustomShortcut(" + shortcutKey + "): ";
	this._log(logHead + "entering");
	let scInfo = settingsStore.getShortcutsManager().getShortcutInfo(shortcutKey);

	if(scInfo == null) {
		this._err(logHead + "unknown shortcut key");
		return;
	}

	if(scInfo.empty) {
		// The shortcut has not been configured. For unconfigured shortcuts we want to
		// default to the "open new tab" behavior.
		// The shortcuts never create incognito windows/tabs, always non-incognito.
		chromeUtils.createTab();
		return;
	}

	let tabId = (scInfo.tab != null) ? scInfo.tab.id : null;

	if(scInfo.url != null) {
		this._log(logHead + "loading URL " + scInfo.url);
		// Pick the "least tabbed window" to open the new tab if we need a new
		// tab, or the existing tab if there is one
		chromeUtils.loadUrl(scInfo.url, { tabId });
		return;
	}

	// A "url" is not set (hostname case), but if there's a tab, we need to activate it.
	if(scInfo.tab != null) {
		// Need to open a tab
		this._log(logHead + "opening tabId " + tabId + ", no URL change");
		chromeUtils.activateTab(scInfo.tab);
		return;
	}
	
	// If we get here, we need to deal with a search
	this._log(logHead + "tabId = " + tabId + ", search case: ", scInfo);
	this.runCustomShortcutSearch(scInfo, this._getClipboardAsText());
},

_onCommandCb: function(cmd) {
	const logHead = "KeyboardShortcuts::_onCommandCb(" + cmd + "): ";
	this._log(logHead + "entering");

	switch(cmd) {
		case window.ExtCommands.BACK:
			tabsManager.goBack();
			break;
		case window.ExtCommands.FWD:
			tabsManager.goFwd();
			break;
		case window.ExtCommands.CLOSEBACK:
			tabsManager.goBack(true);
			break;
		case window.ExtCommands.CLOSEFWD:
			tabsManager.goFwd(true);
			break;
		case window.ExtCommands.LAUNCHORSEARCH:
			let url = this._getClipboardAsText();
			//this._log(logHead + "The URL is " + url);
			this.launchOrSearch(url);
			break;
		case window.ExtCommands.SHORTCUT01:
		case window.ExtCommands.SHORTCUT02:
		case window.ExtCommands.SHORTCUT03:
		case window.ExtCommands.SHORTCUT04:
		case window.ExtCommands.SHORTCUT05:
			this._manageCustomShortcut(cmd);
			break;
		default:
			this._err(logHead + "unknown command");
			break;
	}
},

}); // Classes.KeyboardShortcuts
