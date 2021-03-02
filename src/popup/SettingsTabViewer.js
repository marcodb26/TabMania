// CLASS SettingsLosShortcutViewer
// "LOS": "Launch Or Search"
Classes.SettingsLosShortcutViewer = Classes.SettingsCardViewer.subclass({
	__idPrefix: "SettingsLosShortcutViewer",

_init: function(title) {
	this.debug();

	// Overriding the parent class' _init(), but calling that original function first
	Classes.SettingsCardViewer._init.call(this, title);

	this._renderShortcutSettings();
},

_renderShortcutSettings: function() {
	let searchUrl = Classes.SettingsTextItemViewer.create(
	{
		setFn: settingsStore.setOptionSearchUrl.bind(settingsStore),
		getFn: settingsStore.getOptionSearchUrl.bind(settingsStore),
		label: "Search URL for launch/search shortcut",
		placeholderText: "https://www.google.com/search?q=%s",
		helpHtml: this._safeText("Use %s to indicate where the text from the clipboard should get pasted"),
		updateKey: "options"
	});

	this.append(searchUrl);
},

}); // Classes.SettingsLosShortcutViewer


// CLASS SettingsCustomShortcutViewer
Classes.SettingsCustomShortcutViewer = Classes.SettingsCardViewer.subclass({
	__idPrefix: "SettingsCustomShortcutViewer",

	_shortcutKey: null,

_init: function(shortcutKey, title) {
	this.debug();

	// Overriding the parent class' _init(), but calling that original function first
	Classes.SettingsCardViewer._init.call(this, title);

	this._shortcutKey = shortcutKey;
	this._renderShortcutSettings();
},

_renderShortcutSettings: function() {
	let sm = settingsStore.getShortcutsManager();

	let hostnameOrUrl = Classes.SettingsTextItemViewer.create({
		setFn: sm.setShortcutHostnameOrUrl.bind(sm, this._shortcutKey),
		getFn: sm.getShortcutHostnameOrUrl.bind(sm, this._shortcutKey),
		label: "Hostname or URL",
		placeholderText: "e.g.: www.google.com",
		helpHtml: this._safeText("If enabling search, use %s to indicate where the text from the clipboard should get pasted"),
		updateKey: this._shortcutKey
	});

	this.append(hostnameOrUrl);

	let alwaysNewTab = Classes.SettingsCheckboxItemViewer.create({
		setFn: sm.setShortcutProp.bind(sm, this._shortcutKey, "alwaysNewTab"),
		getFn: sm.getShortcutProp.bind(sm, this._shortcutKey, "alwaysNewTab"),
		label: "Always open shortcut in new tab",
		updateKey: this._shortcutKey
	});

	this.append(alwaysNewTab);

	let useClipboard = Classes.SettingsCheckboxItemViewer.create({
		setFn: sm.setShortcutProp.bind(sm, this._shortcutKey, "useClipboard"),
		getFn: sm.getShortcutProp.bind(sm, this._shortcutKey, "useClipboard"),
		label: "Enable search of clipboard contents",
		updateKey: this._shortcutKey
	});

	this.append(useClipboard);
},

}); // Classes.SettingsCustomShortcutViewer


// CLASS SettingsTabViewer
//
Classes.SettingsTabViewer = Classes.TabViewer.subclass({

	// We need to add a _bodyElem, because the _rootElem needs to be set to
	// "height: 100%" to allow the scrollbar to stay inside the tab body...
	_bodyElem: null,

	_manifest: null,

	_generalSettingsContainer: null,
	_customGroupsContainer: null,
	_shortcutsContainer: null,

	// Track the current set of customGroup names and viewers across updates
	_customGroupsByName: null,

	_msgClient: null,

_init: function(tabLabelHtml) {
	// Overriding the parent class' _init(), but calling that original function first
	Classes.TabViewer._init.apply(this, arguments);

	const logHead = "SettingsTabViewer::_init(): ";
	this.debug();

	this._manifest = chrome.runtime.getManifest();
	this._log(logHead + "the manifest object:", this._manifest);

	this._msgClient = Classes.MsgClient.create();

	this._setBody();
	this._renderSettings();

	// Each Setting*ItemViewer listens to SettingsStore notifications, so we don't
	// need to monitor SettingsStore changes for them. The only reason why we need
	// a listener is because the name of a customGroup can be changed, and when that
	// happens, the existing Setting*ItemViewer won't see their own name, but they
	// won't be able to distinguish a delete from a rename. That needs to be tracked
	// in this container.
	settingsStore.addEventListener(Classes.EventManager.Events.UPDATED, this._updatedCb.bind(this));
},

_loadUrlThroughBackground: function(url) {
	this._msgClient.sendRequest("launchUrl", { url: url }).then(
		function(response) {
			const logHead = "SettingsTabViewer::_loadUrlThroughBackground().response(): ";
			if(response.status == "success") {
				this._log(logHead + "received ", response);
			} else {
				this._err(logHead + "response failed: ", response);
			}
		}.bind(this)
	);
},

_setBody: function() {
	let bodyId = this._id + "-settingsBody";
	let html = `
		<div id="${bodyId}" class="mx-auto px-2 py-3" style="max-width: 800px;">
		</div>
	`;

	this.setHtml(html);
	this._bodyElem = this.getElementById(bodyId);
},

_renderTitle: function() {
	// const logHead = "SettingsTabViewer::_renderTitle(): ";
	let version = this._safeText(this._manifest.version);
	if(!isProd()) {
		version += "-DEV";
	}

	const bodyHtml = `
	<div class="mb-3">
		<b>${this._safeText(this._manifest.name)}</b> <small>(v. ${version})</small>
	</div>
	`;

	this.setHtml(bodyHtml);
},

_renderExtensionShortcutsLink: function() {
	const buttonId = this._id + "-extShortcutsBtn";

	// I thought I could have a page for only the shortcuts of my extension, but
	// the page generated by this doesn't exist:
	// ${chrome.runtime.getURL("shortcuts")}
	const targetUrl = "chrome://extensions/shortcuts";

	// You could use "col-10 mx-auto" instead of "mx-2" to make the button a bit
	// smaller but still centered.
	//
	// We'll keep the HREF in the link, even though we won't be able to use that
	// HREF. We'll simulate a real link but instead redirect the request to the
	// background.js to open the URL. Chrome doesn't allow opening a chrome://
	// URL from within the popup.
	const bodyHtml = `
	<div class="d-grid gap-2 mx-2 mt-3">
		<a id=${buttonId} class="btn btn-primary" role="button" href="${targetUrl}" target="_blank">
			Edit extension shortcuts
		</a>
	</div>
	`;

	let viewer = Classes.HtmlViewer.create(bodyHtml);
	let buttonElem = viewer.getElementById(buttonId);
	buttonElem.addEventListener("click",
		function(ev) {
			this._loadUrlThroughBackground(targetUrl);
			ev.preventDefault();
		}.bind(this), false);

	this._shortcutsContainer.append(viewer);
},

_renderIncognitoInfo: function() {
	const logHead = "SettingsTabViewer::_renderIncognitoInfo(): ";
	const linkId = this._id + "-extSettingsLink";

	const extensionId = chromeUtils.getExtensionId();
	const targetUrl = `chrome://extensions/?id=${extensionId}`;

	// We'll keep the HREF in the link, even though we won't be able to use that
	// HREF. We'll simulate a real link but instead redirect the request to the
	// background.js to open the URL. Chrome doesn't allow opening a chrome://
	// URL from within the popup.
	const footnote = `
		<div class="small">You can enable/disable access to incognito tabs in
		the <a id="${linkId}" href="${targetUrl}" target="_blank">Chrome extension settings</a>
	`;

	// We'll set the contents when the chrome callback returns
	const bodyHtml = `
	<div class="mx-2 my-3">
		Loading...
	</div>
	`;

	let viewer = Classes.HtmlViewer.create(bodyHtml);
	this._generalSettingsContainer.append(viewer);

	// See https://developer.chrome.com/docs/extensions/reference/extension/#method-isAllowedIncognitoAccess
	chromeUtils.wrap(chrome.extension.isAllowedIncognitoAccess, logHead).then(
		function(isAllowedAccess) {
			if(isAllowedAccess) {
				viewer.setHtml("<div>Access to Incognito tabs is enabled<div>" + footnote);
			} else {
				viewer.setHtml("<div>Access to Incognito tabs is disabled<div>" + footnote);
			}
			let linkElem = viewer.getElementById(linkId);
			linkElem.addEventListener("click",
				function(ev) {
					this._loadUrlThroughBackground(targetUrl);
					ev.preventDefault();
				}.bind(this), false);
		}.bind(this)
	);
},

_renderSettings: function() {
	this._renderTitle();

	this._generalSettingsContainer = Classes.CollapsibleContainerViewer.create({
		startExpanded: true,
		border: false
	});
	this._generalSettingsContainer.setHeadingHtml(`<div class="fw-bold">General settings</div>`);
//	this._generalSettingsContainer.addExpandedListener(this._containerExpandedCb.bind(this));
//	this._generalSettingsContainer.addCollapsedListener(this._containerCollapsedCb.bind(this));
	this.append(this._generalSettingsContainer);

	let recentlyClosedInSearch = Classes.SettingsCheckboxItemViewer.create({
		setFn: settingsStore.setOptionRecentlyClosedInSearch.bind(settingsStore),
		getFn: settingsStore.getOptionRecentlyClosedInSearch.bind(settingsStore),
		label: "Include recently closed tabs in search results",
		updateKey: "options",
	});

	this._generalSettingsContainer.append(recentlyClosedInSearch);

	let bookmarksInSearch = Classes.SettingsCheckboxItemViewer.create({
		setFn: settingsStore.setOptionBookmarksInSearch.bind(settingsStore),
		getFn: settingsStore.getOptionBookmarksInSearch.bind(settingsStore),
		label: "Include bookmarks in search results",
		updateKey: "options",
	});

	this._generalSettingsContainer.append(bookmarksInSearch);

	if(settingsStore.getOptionDevMode()) {
		let showTabId = Classes.SettingsCheckboxItemViewer.create({
			setFn: settingsStore.setOptionShowTabId.bind(settingsStore),
			getFn: settingsStore.getOptionShowTabId.bind(settingsStore),
			label: "Display extended tab ID badge (dev-mode)",
			updateKey: "options",
		});

		this._generalSettingsContainer.append(showTabId);
	}

	let advancedMenu = Classes.SettingsCheckboxItemViewer.create({
		setFn: settingsStore.setOptionAdvancedMenu.bind(settingsStore),
		getFn: settingsStore.getOptionAdvancedMenu.bind(settingsStore),
		label: "Show advanced items in tab tiles menu",
		updateKey: "options",
	});

	this._generalSettingsContainer.append(advancedMenu);

	this._renderIncognitoInfo();

	// For custom groups, we need an outer container (collapsible), which
	// hosts an inner container with all the groups, followed by a button
	// to add new groups
	let outerCustomGroupsContainer = Classes.CollapsibleContainerViewer.create({ border: false });
	outerCustomGroupsContainer.setHeadingHtml(`<div class="fw-bold">Custom groups settings</div>`);
//	outerCustomGroupsContainer.addExpandedListener(this._containerExpandedCb.bind(this));
//	outerCustomGroupsContainer.addCollapsedListener(this._containerCollapsedCb.bind(this));
	outerCustomGroupsContainer.addClasses("mt-3");
	this.append(outerCustomGroupsContainer);

	this._customGroupsContainer = Classes.ContainerViewer.create("No custom groups defined");
	// "tm-min-empty-container" is needed in order to position properly the
	// "No custom groups defined" message
	this._customGroupsContainer.addClasses("tm-min-empty-container");
	outerCustomGroupsContainer.append(this._customGroupsContainer);
	this._customGroupsByName = [];
	this._addCustomGroups(settingsStore.getCustomGroupsManager().getCustomGroupNames());

	let addCustomGroupButton = Classes.SettingsAddCustomGroupViewer.create(this._customGroupsContainer);
	outerCustomGroupsContainer.append(addCustomGroupButton);

	this._shortcutsContainer = Classes.CollapsibleContainerViewer.create({ border: false });
	this._shortcutsContainer.setHeadingHtml(`<div class="fw-bold">Shortcuts settings</div>`);
//	this._shortcutsContainer.addExpandedListener(this._containerExpandedCb.bind(this));
//	this._shortcutsContainer.addCollapsedListener(this._containerCollapsedCb.bind(this));
	this._shortcutsContainer.addClasses("mt-3");
	this.append(this._shortcutsContainer);

	this._renderExtensionShortcutsLink();

	let losShortcut = Classes.SettingsLosShortcutViewer.create("Shortcut launch/search");

	this._shortcutsContainer.append(losShortcut);

	let sm = settingsStore.getShortcutsManager();
	sm.getShortcutKeys().forEach(
		function(key) {
			let shortcut = Classes.SettingsCustomShortcutViewer.create(key,
								"Custom shortcut " + sm.keyToUiString(key));
			this._shortcutsContainer.append(shortcut);
		}.bind(this)
	);
},

_addCustomGroups: function(namesList) {
	const logHead = "SettingsTabViewer::_addCustomGroups(): ";
	this._log(logHead, namesList);
	namesList.forEach(
		function(name) {
			let customGroup = Classes.SettingsCustomGroupViewer.create(name);
			this._customGroupsContainer.append(customGroup);
			this._customGroupsByName[name] = customGroup;
		}.bind(this)
	);
},

_delCustomGroups: function(namesList) {
	const logHead = "SettingsTabViewer::_delCustomGroups(): ";
	this._log(logHead, namesList);
	let promisesList = [];

	namesList.forEach(
		function(name) {
			promisesList.push(this._customGroupsByName[name].closeCard());
			delete this._customGroupsByName[name];
		}.bind(this)
	);

	// Take the action only if the _customGroupsByName is empty but the
	// namesList is not empty, meaning if we actually deleted something
	if(namesList.length != 0 && Object.keys(this._customGroupsByName).length == 0) {
		// No more cards, let's give a little help to the ContainerViewer
		// to force it to show the empty message. The problem is that the
		// ContainerViewer can't keep in sync when Viewers added with
		// .append() get removed via DOM functions instead (that's what
		// .detach() does). So in practice it can never be in sync except
		// when t starts empty... since we know it's now empty, he would
		// probably like to know that too...
		// We want to wait for the animations to have finished before
		// we replace the data with the empty string.
		Promise.all(promisesList).then(
			this._customGroupsContainer.clear.bind(this._customGroupsContainer)
		);
	}
},

_updatedCb: function(ev) {
	const logHead = "SettingsTabViewer::_updatedCb(" + ev.detail.key + "): ";

	if(ev.detail.key != "customGroups") {
		this._log(logHead + "ignoring key");
		return;
	}

	this._log(logHead + "processing change", ev.detail);

	// We need to do a diff of the names we know vs. the names in settingsStore
	let newNames = settingsStore.getCustomGroupsManager().getCustomGroupNames().sort();
	let oldNames = Object.keys(this._customGroupsByName).sort();

	let toBeDeleted = [];
	let toBeAdded = [];

	let nn = 0;
	let on = 0;
	while(nn < newNames.length && on < oldNames.length) {
		let cmp = newNames[nn].localeCompare(oldNames[on]);
		if(cmp == 0) {
			// They're the same
			nn++;
			on++;
		} else {
			if(cmp < 0) {
				// newNames[nn] is smaller than oldNames[on], new name to add
				toBeAdded.push(newNames[nn++]);
			} else {
				// newNames[nn] is larger than oldNames[on], old name to delete
				toBeDeleted.push(oldNames[on++]);
			}
		}
	}

	// If we get here, at least one of newNames or oldNames has been fully
	// scanned, but not necessarily both...
	while(nn < newNames.length) {
		// If we still need to finish scanning the new names, these must all
		// be new groups to be added
		toBeAdded.push(newNames[nn++]);
	}

	while(on < oldNames.length) {
		// If we still need to finish scanning the old names, these must all
		// be old groups to be deleted
		toBeDeleted.push(oldNames[on++]);
	}

	this._delCustomGroups(toBeDeleted);
	this._addCustomGroups(toBeAdded);
},

}); // Classes.SettingsTabViewer

