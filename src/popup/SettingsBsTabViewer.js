// CLASS SettingsContainerViewer
//
Classes.SettingsContainerViewer = Classes.CollapsibleContainerViewer.subclass({

// "containerTitle" must not be HTML.
// "startExpanded" is optional, defaults to "true".
_init: function(containerTitle, startExpanded=true) {
	let containerOptions = {
		startExpanded: startExpanded,
		border: false
	};

	// Overriding the parent class' _init(), but calling that original function first
	Classes.CollapsibleContainerViewer._init.call(this, containerOptions);
	this.debug();

	this.setHeadingHtml(`<div class="fw-bold tm-accordion-header-align">${containerTitle}</div>`);
	this.addClasses("tm-settings-container");
	this.addBodyClasses("pt-1", "pb-1");
},

}); // Classes.SettingsContainerViewer


// CLASS SettingsShortcutCardViewer
Classes.SettingsShortcutCardViewer = Classes.SettingsCardViewer.subclass({
	__idPrefix: "SettingsShortcutCardViewer",

	_shortcutKeyViewer: null,
	_shortcutUnsetText: "Not set",

	_settingsTabViewerObj: null,

_init: function(title, settingsTabViewerObj) {
	this.debug();

	// Overriding the parent class' _init(), but calling that original function first
	Classes.SettingsCardViewer._init.call(this, title);

	this._settingsTabViewerObj = settingsTabViewerObj;


	this._shortcutKeyViewer = Classes.HtmlViewer.create(`<div></div>`);
	this.append(this._shortcutKeyViewer);
},

setShortcutText: function(text) {
	const buttonId = this._id + "scTextBtn";
	let bgColorClass = "bg-dark";

	if(text == null || text == "") {
		bgColorClass = "bg-secondary";
		text = this._shortcutUnsetText;
	}

	const targetUrl = "chrome://extensions/shortcuts";

	// We'll keep the HREF in the link, even though we won't be able to use that
	// HREF. We'll simulate a real link but instead redirect the request to the
	// background.js to open the URL. Chrome doesn't allow opening a chrome://
	// URL from within the popup.

	// WAS: <a id=${buttonId} class="btn ${btnColorClass} btn-sm" role="button" href="${targetUrl}" target="_blank">${text}</a>
	// We want a button, but we don't really want a bootstrap button, they're too big
	// even when using ".btn-sm". Let's force a button behavior on our <span>
	let html = `
	<div class="ms-2">
		<span id=${buttonId} class="badge tm-text-badge ${bgColorClass}" style="cursor: pointer">${text}</span>
	</div>
	`;

	this._shortcutKeyViewer.setHtml(html);

	let buttonElem = this._shortcutKeyViewer.getElementById(buttonId);
	buttonElem.addEventListener("click",
		function(ev) {
			this._settingsTabViewerObj.loadUrlThroughBackground(targetUrl);
			ev.preventDefault();
		}.bind(this), false);
},

}); // Classes.SettingsShortcutCardViewer


// CLASS SettingsLosShortcutViewer
// "LOS": "Launch Or Search"
Classes.SettingsLosShortcutViewer = Classes.SettingsShortcutCardViewer.subclass({
	__idPrefix: "SettingsLosShortcutViewer",

_init: function(title) {
	this.debug();

	// Overriding the parent class' _init(), but calling that original function first
	Classes.SettingsShortcutCardViewer._init.call(this, title);

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
Classes.SettingsCustomShortcutViewer = Classes.SettingsShortcutCardViewer.subclass({
	__idPrefix: "SettingsCustomShortcutViewer",

	_shortcutKey: null,

_init: function(shortcutKey, title, settingsTabViewerObj) {
	this.debug();

	// Overriding the parent class' _init(), but calling that original function first
	Classes.SettingsShortcutCardViewer._init.call(this, title, settingsTabViewerObj);

	this._shortcutKey = shortcutKey;
	this._renderShortcutSettings();
},

_renderShortcutSettings: function() {
	let sm = settingsStore.getShortcutsManager();

	let shortcutTitle = Classes.SettingsTextItemViewer.create({
		setFn: sm.setShortcutTitle.bind(sm, this._shortcutKey),
		getFn: sm.getShortcutTitle.bind(sm, this._shortcutKey),
		label: "Title",
		helpHtml: this._safeText("If you enable search, this title will be used for the context menu item associated to this shortcut"),
		updateKey: this._shortcutKey
	});

	this.append(shortcutTitle);

	let hostnameOrUrl = Classes.SettingsTextItemViewer.create({
		setFn: sm.setShortcutHostnameOrUrl.bind(sm, this._shortcutKey),
		getFn: sm.getShortcutHostnameOrUrl.bind(sm, this._shortcutKey),
		label: "Hostname or URL",
		placeholderText: "e.g.: www.google.com",
		helpHtml: this._safeText("If you enable search, use %s to indicate where the text from the clipboard should get pasted"),
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


// CLASS SettingsCustomShortcutsContainerViewer
//
Classes.SettingsCustomShortcutsContainerViewer = Classes.SettingsContainerViewer.subclass({

	_shortcutViewers: null,

_init: function(settingsTabViewerObj) {
	// Overriding the parent class' _init(), but calling that original function first
	Classes.SettingsContainerViewer._init.call(this, "Shortcuts settings", false);
	this.debug();

	this._shortcutViewers = [];

	this.addExpandedStartListener(this._containerExpandedCb.bind(this));
//	this.addCollapsedStartListener(this._containerCollapsedCb.bind(this));

	let losShortcut = Classes.SettingsLosShortcutViewer.create("Shortcut launch/search");
	this._shortcutViewers[window.ExtCommands.LAUNCHORSEARCH] = losShortcut;
	this.append(losShortcut);

	let sm = settingsStore.getShortcutsManager();
	sm.getShortcutKeys().forEach(
		function(key) {
			this._shortcutViewers[key] = Classes.SettingsCustomShortcutViewer.create(key,
								"Custom shortcut " + sm.keyToUiString(key), settingsTabViewerObj);
			this.append(this._shortcutViewers[key]);
		}.bind(this)
	);

	this.updateShortcutText();
},

updateShortcutText: function() {
	const logHead = "SettingsCustomShortcutViewer::updateShortcutText():";
	chromeUtils.wrap(chrome.commands.getAll, logHead).then(
		function(commands) {
			this._log(logHead, "received", commands);
			commands.forEach(
				function(cmd) {
					if(this._shortcutViewers[cmd.name] != null) {
						this._shortcutViewers[cmd.name].setShortcutText(cmd.shortcut);
					} else {
						this._log(logHead, "ignoring command \"", cmd.name, "\"");
					}
				}.bind(this)
			);
		}.bind(this)
	);
},

_containerExpandedCb: function(ev) {
	const logHead = "SettingsCustomShortcutViewer::_containerExpandedCb():";
	this._log(logHead, "container expanded:", ev.target.id, ev);

	this.updateShortcutText();
},

}); // Classes.SettingsCustomShortcutsContainerViewer


// CLASS SettingsBsTabViewer
//
Classes.SettingsBsTabViewer = Classes.BsTabViewer.subclass({

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

_init: function({ labelHtml }) {
	// Overriding the parent class' _init(), but calling that original function first
	Classes.BsTabViewer._init.apply(this, arguments);

	const logHead = "SettingsBsTabViewer::_init():";
	this.debug();

	this._manifest = chrome.runtime.getManifest();
	this._log(logHead, "the manifest object:", this._manifest);

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

	this.addBsTabActivationStartListener(this._bsTabActivatedCb.bind(this));
},

// This is not a private function because it needs to be called by other classes
// contained in SettingsBsTabViewer
loadUrlThroughBackground: function(url) {
	this._msgClient.sendRequest("launchUrl", { url: url }).then(
		function(response) {
			const logHead = "SettingsBsTabViewer::loadUrlThroughBackground().response():";
			if(response.status == "success") {
				this._log(logHead, "received", response);
			} else {
				this._err(logHead, "response failed:", response);
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

	// The settings pane is the only one that can have the "tm-overflow-auto" at the top,
	// no other inner component needs to remain visible on top
	this.addClasses("tm-overflow-auto");
	this.setHtml(html);
	this._bodyElem = this.getElementById(bodyId);
},

_renderTitle: function() {
	// const logHead = "SettingsBsTabViewer::_renderTitle():";
	let version = this._safeText(this._manifest.version);
	if(!isProd()) {
		version += "-DEV";
	}

	const bodyHtml = `
	<div>
		<b>${this._safeText(this._manifest.name)}</b> <small>(v. ${version})</small>
	</div>
	`;

	this.setHtml(bodyHtml);
},

_renderIncognitoInfo: function(container) {
	// const logHead = "SettingsBsTabViewer::_renderIncognitoInfo():";
	const linkId = this._id + "-extSettingsLink";

	const extensionId = chromeUtils.getExtensionId();
	const targetUrl = `chrome://extensions/?id=${extensionId}`;

	let incognitoAccessEnabled = "enabled";
	let extraFootnote = "";
	if(!localStore.isAllowedIncognitoAccess()) {
		incognitoAccessEnabled = "disabled";
		extraFootnote = "Changes will apply only when access gets enabled. ";
	}

	// We'll keep the HREF in the link, even though we won't be able to use that
	// HREF. We'll simulate a real link but instead redirect the request to the
	// background.js to open the URL. Chrome doesn't allow opening a chrome://
	// URL from within the popup.
	const footnote = `
		<div class="small">${extraFootnote}You can enable/disable access to Incognito tabs in
		the <a id="${linkId}" href="${targetUrl}" target="_blank">Chrome extension settings</a>
	`;

	const bodyHtml = `
	<div class="tm-settings-item">
		<div>Access to Incognito tabs is <b>${incognitoAccessEnabled}</b><div> 
		${footnote}
	</div>
	`;

	let viewer = Classes.HtmlViewer.create(bodyHtml);

	let linkElem = viewer.getElementById(linkId);
	linkElem.addEventListener("click",
		function(ev) {
			this.loadUrlThroughBackground(targetUrl);
			ev.preventDefault();
		}.bind(this), false);

	container.append(viewer);
},

// Returns a container for the group of options, already attached to the
// main settings container.
// "label" must not be HTML.
// "startExpanded" is optional, defaults to "true".
// "selectOptions" is the getFn, setFn and updateKey in case select mode is needed.
_createOptionsGroup: function(label, startExpanded=true, selectOptions={}) {
	let group = Classes.SettingsItemsGroupViewer.create({
		label,
		startExpanded,
		selectable: (selectOptions.getFn != null),
		getFn: selectOptions.getFn,
		setFn: selectOptions.setFn,
		updateKey: selectOptions.updateKey,
	});

	this._generalSettingsContainer.append(group);

	return group;
},

_renderDedupOptions: function() {
	let dedupGroup = this._createOptionsGroup("Deduplicate new tabs", false, {
		setFn: settingsStore.setOptionNewTabDedup.bind(settingsStore),
		getFn: settingsStore.getOptionNewTabDedup.bind(settingsStore),
		updateKey: "options",
	});

	let newTabDedupEmpty = Classes.SettingsCheckboxItemViewer.create({
		setFn: settingsStore.setOptionNewTabDedupEmpty.bind(settingsStore),
		getFn: settingsStore.getOptionNewTabDedupEmpty.bind(settingsStore),
		label: "Chrome new tabs",
		updateKey: "options",
	});
	dedupGroup.append(newTabDedupEmpty);

	let newTabDedupWithOpener = Classes.SettingsCheckboxItemViewer.create({
		setFn: settingsStore.setOptionNewTabDedupWithOpener.bind(settingsStore),
		getFn: settingsStore.getOptionNewTabDedupWithOpener.bind(settingsStore),
		label: "Links from other tabs",
		updateKey: "options",
	});
	dedupGroup.append(newTabDedupWithOpener);

	let newTabDedupNoOpener = Classes.SettingsCheckboxItemViewer.create({
		setFn: settingsStore.setOptionNewTabDedupNoOpener.bind(settingsStore),
		getFn: settingsStore.getOptionNewTabDedupNoOpener.bind(settingsStore),
		label: "Links from other applications",
		updateKey: "options",
	});
	dedupGroup.append(newTabDedupNoOpener);
},

// LTW = Least Tabbed Window
_renderLTWOptions: function() {
	let ltwGroup = this._createOptionsGroup("Move new tabs to least tabbed window", false, {
		setFn: settingsStore.setOptionNewTabToLtw.bind(settingsStore),
		getFn: settingsStore.getOptionNewTabToLtw.bind(settingsStore),
		updateKey: "options",
	});

	let newEmptyTabInLTW = Classes.SettingsCheckboxItemViewer.create({
		setFn: settingsStore.setOptionNewTabToLtwEmpty.bind(settingsStore),
		getFn: settingsStore.getOptionNewTabToLtwEmpty.bind(settingsStore),
		label: "Chrome new tabs",
		updateKey: "options",
	});
	ltwGroup.append(newEmptyTabInLTW);

	let newTabToLtwWithOpener = Classes.SettingsCheckboxItemViewer.create({
		setFn: settingsStore.setOptionNewTabToLtwWithOpener.bind(settingsStore),
		getFn: settingsStore.getOptionNewTabToLtwWithOpener.bind(settingsStore),
		label: "Links from other tabs",
		updateKey: "options",
	});
	ltwGroup.append(newTabToLtwWithOpener);

	let newTabToLtwNoOpener = Classes.SettingsCheckboxItemViewer.create({
		setFn: settingsStore.setOptionNewTabToLtwNoOpener.bind(settingsStore),
		getFn: settingsStore.getOptionNewTabToLtwNoOpener.bind(settingsStore),
		label: "Links from other applications",
		updateKey: "options",
	});
	ltwGroup.append(newTabToLtwNoOpener);
},

_renderSearchOptions: function() {
	let searchGroup = this._createOptionsGroup("Search");

	let bookmarksInSearch = Classes.SettingsCheckboxItemViewer.create({
		setFn: settingsStore.setOptionBookmarksInSearch.bind(settingsStore),
		getFn: settingsStore.getOptionBookmarksInSearch.bind(settingsStore),
		label: "Include bookmarks",
		updateKey: "options",
	});
	searchGroup.append(bookmarksInSearch);

	let recentlyClosedInSearch = Classes.SettingsCheckboxItemViewer.create({
		setFn: settingsStore.setOptionRecentlyClosedInSearch.bind(settingsStore),
		getFn: settingsStore.getOptionRecentlyClosedInSearch.bind(settingsStore),
		label: "Include recently closed tabs",
		updateKey: "options",
	});
	searchGroup.append(recentlyClosedInSearch);

	let historyInSearch = Classes.SettingsCheckboxPermViewer.create({
		setFn: settingsStore.setOptionHistoryInSearch.bind(settingsStore),
		getFn: settingsStore.getOptionHistoryInSearch.bind(settingsStore),
		label: "Include browsing history",
		updateKey: "options",
		permission: "history"
	});
	searchGroup.append(historyInSearch);
},

_renderIncognitoOptions: function() {
	let incognitoGroup = this._createOptionsGroup("Incognito");

	this._renderIncognitoInfo(incognitoGroup);

	let splitIncognitoBsTab = Classes.SettingsCheckboxItemViewer.create({
		setFn: settingsStore.setOptionIncognitoBsTab.bind(settingsStore),
		getFn: settingsStore.getOptionIncognitoBsTab.bind(settingsStore),
		label: "Track Incognito tabs separately",
		updateKey: "options",
	});
	incognitoGroup.append(splitIncognitoBsTab);

	let bookmarksInIncognitoSearch = Classes.SettingsCheckboxItemViewer.create({
		setFn: settingsStore.setOptionBookmarksInIncognitoSearch.bind(settingsStore),
		getFn: settingsStore.getOptionBookmarksInIncognitoSearch.bind(settingsStore),
		label: "Include bookmarks in Incognito search",
		helpHtml: "<i>Include bookmarks</i> in the <i>Search</i> options must be enabled; applies to the <i>Incognito</i> tab",
		updateKey: "options",
	});
	incognitoGroup.append(bookmarksInIncognitoSearch);
},

_renderSettings: function() {
	this._renderTitle();

	this._generalSettingsContainer = Classes.SettingsContainerViewer.create("General settings");
	this.append(this._generalSettingsContainer);

	this._renderSearchOptions();
	this._renderDedupOptions();
	this._renderLTWOptions();
	this._renderIncognitoOptions();

	if(settingsStore.getOptionDevMode()) {
		let showTabId = Classes.SettingsCheckboxItemViewer.create({
			setFn: settingsStore.setOptionShowTabId.bind(settingsStore),
			getFn: settingsStore.getOptionShowTabId.bind(settingsStore),
			label: "Display extended tab ID badge (dev-mode)",
			updateKey: "options",
		});

		this._generalSettingsContainer.append(showTabId);
	}

	let startupOpenPopup = Classes.SettingsCheckboxItemViewer.create({
		setFn: settingsStore.setOptionStartupOpenPopup.bind(settingsStore),
		getFn: settingsStore.getOptionStartupOpenPopup.bind(settingsStore),
		label: "Open TabMania on Chrome startup",
		updateKey: "options",
	});
	this._generalSettingsContainer.append(startupOpenPopup);

//	let advancedMenu = Classes.SettingsCheckboxItemViewer.create({
//		setFn: settingsStore.setOptionAdvancedMenu.bind(settingsStore),
//		getFn: settingsStore.getOptionAdvancedMenu.bind(settingsStore),
//		label: "Show advanced items in tab tiles menu",
//		updateKey: "options",
//	});
//	this._generalSettingsContainer.append(advancedMenu);

	// For custom groups, we need an outer container (collapsible), which
	// hosts an inner container with all the groups, followed by a button
	// to add new groups
	let outerCustomGroupsContainer = Classes.SettingsContainerViewer.create("Custom groups settings", false);
	this.append(outerCustomGroupsContainer);
//	outerCustomGroupsContainer.addExpandedStartListener(this._containerExpandedCb.bind(this));
//	outerCustomGroupsContainer.addCollapsedStartListener(this._containerCollapsedCb.bind(this));

	this._customGroupsContainer = Classes.ContainerViewer.create("No custom groups defined");
	// "tm-min-empty-container" is needed in order to position properly the
	// "No custom groups defined" message
	this._customGroupsContainer.addClasses("tm-min-empty-container");
	outerCustomGroupsContainer.append(this._customGroupsContainer);
	this._customGroupsByName = [];
	this._addCustomGroups(settingsStore.getCustomGroupsManager().getCustomGroupNames());

	let addCustomGroupButton = Classes.SettingsAddCustomGroupViewer.create(this._customGroupsContainer);
	outerCustomGroupsContainer.append(addCustomGroupButton);

	this._shortcutsContainer = Classes.SettingsCustomShortcutsContainerViewer.create(this);
	this.append(this._shortcutsContainer);
},

_addCustomGroups: function(namesList) {
	const logHead = "SettingsBsTabViewer::_addCustomGroups():";
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
	const logHead = "SettingsBsTabViewer::_delCustomGroups():";
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
	const logHead = "SettingsBsTabViewer::_updatedCb():";

	if(ev.detail.key != "customGroups") {
		this._log(logHead, "ignoring key", ev.detail.key);
		return;
	}

	this._log(logHead, "key", ev.detail.key, "processing change", ev.detail);

	// We can't use tmUtils.arrayDiff() because we need a specialized comparison function
	// below (newNames[nn].localeCompare(oldNames[on])), which can't be configured when
	// running tmUtils.arrayDiff()

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

_bsTabActivatedCb: function(ev) {
	const logHead = "SettingsBsTabViewer::_bsTabActivatedCb():";
	this._log(logHead, "tab activated", ev.target.id, ev);

	this._shortcutsContainer.updateShortcutText();
},

}); // Classes.SettingsBsTabViewer

