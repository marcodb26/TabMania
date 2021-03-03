// CLASS TabTileViewer
//
Classes.TabTileViewer = Classes.Viewer.subclass({
	__idPrefix: "TabTileViewer",

	_rootElem: null,
	_bodyElem: null,
	_menuElem: null,
	_closeElem: null,

	_title: null,
	_url: null,
	_imgUrl: null,

	_tab: null,
	_tabGroup: null,
	// An object of type Classes.AsyncQueue
	_asyncQueue: null,

	_menuViewer: null,

// "tabGroup" is optional, if specified it can be used to provide a default favIconUrl
// "asyncQueue" is mandatory, and it's the queue where the tile needs to enqueue all heavy
// rendering of itself.
_init: function(tab, tabGroup, asyncQueue) {
	// Overriding the parent class' _init(), but calling that original function first
	Classes.Viewer._init.apply(this, arguments);

	this.debug();

	this._tab = tab;
	this._asyncQueue = asyncQueue;
	this._renderEmptyTile();
	this.update(tab, tabGroup);
},

_renderEmptyTile: function() {
	const bodyId = this._id + "-body";
	const menuId = this._id + "-menu";
	const closeId = this._id + "-close";

	const closeIconClass = this._tab.incognito ? "tm-close-icon-light" : "tm-close-icon";

	const closeIcon = `<span aria-hidden="true" class="${closeIconClass}"></span>`;

	// We want to set min-height because when there are a lot of tiles and you're
	// scrolled to the bottom, it might take a while to get to render the body of
	// of those tiles. While you wait, it's better to see a full-sized empty tile
	// than a bunch of super-thin tiles that later disappear.
	const rootHtml = `
	<div style="cursor: default; min-height: 3em;" class="card tm-hover">
		<div id="${bodyId}" class="card-body px-2 py-1 text-nowrap tm-stacked-below">
		</div>
		<div class="tm-overlay tm-full-size tm-hover-target">
			<div id="${menuId}" class="tm-tile-toggle-center">
			</div>
			<div class="tm-float-right">
				<button type="button" id="${closeId}" class="tm-close-icon-button" aria-label="Close">
					${closeIcon}
				</button>
			</div>
		</div>
	</div>
	`;

	this._rootElem = this._elementGen(rootHtml);
	this._bodyElem = this.getElementById(bodyId);
	this._menuElem = this.getElementById(menuId);
	this._closeElem = this.getElementById(closeId);

	if(this._tab.tm.type == Classes.NormalizedTabs.type.RCTAB) {
		// You can't close or delete a recently closed tab, so no reason to show
		// a "close" button, let's just hide it
		this._closeElem.classList.add("tm-hide");
	}

	this.setClickHandler(this._onTileClickCb.bind(this));
	this.setClickCloseHandler(this._onTileCloseCb.bind(this));
},

_colorToBgCss: {
	// "none" is the color we'll show when no color is set
	none: "bg-light",
	grey: "bg-secondary",
	blue: "bg-primary",
	red: "bg-danger",
	yellow: "bg-warning",
	green: "bg-success",
	cyan: "bg-info",
},

// "secondary" is a flag (default "false") that determines the color
// of the badge
_badgeHtml: function(txt, bgColor) {
	let extraClasses = [];
	// "bg-dark" is not in the list of _colorToBgCss, so when the input parameter
	// "bgColor" is set to "null", we'll pick "bg-dark".
	extraClasses.push(optionalWithDefault(this._colorToBgCss[bgColor], "bg-dark"))

	if(txt.length > 20) {
		// If a badge is too long, the rendering of the tile gets very messed up.
		// Tried adding "text-truncate" and changing the max-width at various levels,
		// but never got to a satisfactory rendering (some badges get cutoff because
		// an earlier badge is too long, the URL doesn't display at all even though
		// the badges take a limited amount of the line, etc.)
		// Let's just trim long badges here, and hope for the best.
		// "Lon badges": the name of the custom groups have no length limits, and
		// they show up in badges.
		txt = txt.substring(0, 20) + "...";
	}

	return `<span class="badge tm-text-badge ${extraClasses.join(" ")}">${txt}</span>`;
},

_addBadgesHtml: function(visibleBadgesHtml, badgesList, secondary) {
//	const logHead = "TabTileViewer::_addBadgesHtml(" + this._tab.id + "): ";
//	this._log(logHead, badgesList);
	badgesList.forEach(
		function(badge) {
			visibleBadgesHtml.push(this._badgeHtml(badge, secondary ? "grey" : null));
		}.bind(this)
	);
},

_renderMenu: function() {
	switch(this._tab.tm.type) {
		case Classes.NormalizedTabs.type.TAB:
			this._menuViewer = Classes.TileTabMenuViewer.create(this._tab);
			this._menuViewer.attachToElement(this._menuElem);
			break;
		case Classes.NormalizedTabs.type.BOOKMARK:
			this._menuViewer = Classes.TileBookmarkMenuViewer.create(this._tab);
			this._menuViewer.attachToElement(this._menuElem);
			break;
		default:
			// No reason to have a dropdown menu for a recently closed tab...
			this._menuViewer = null;
			break;
	}
},

renderBody: function() {
	let visibleBadgesHtml = [];
	let titleExtraClasses = [];
	let textMuted = "text-muted";
	let imgExtraClasses = [];

	// "audible" and "muted" are not mutually exclusive, but we want to show a
	// single icon, so we're using the arbitrary convention of making the muted
	// icon gray if there's no current audio (meaning "if there was audio, it
	// would be muted"), and black if there's current audio (meaning "your audio
	// is currently muted").
	// We follow the same convention for incognito tabs, but in reverse (lighter
	// means active audio, darker means no audio).
	if(this._tab.audible) {
		if(this._tab.mutedInfo.muted) {
			visibleBadgesHtml.push(icons.volumeMuted());
		} else {
			visibleBadgesHtml.push(icons.volumeAudible);
		}
	} else {
		// We need to add the check "this._tab.mutedInfo != null" because this._tab
		// could actually be a this._tab.tm.type == Classes.NormalizedTabs.type.BOOKMARK,
		// which doesn't have "mutedInfo". The cleaner thing would be to check for type,
		// but the current check seems to be a bit less verbose.
		if(this._tab.mutedInfo != null && this._tab.mutedInfo.muted) {
			if(!this._tab.incognito) {
				visibleBadgesHtml.push(icons.volumeMuted("text-secondary"));
			} else {
				visibleBadgesHtml.push(icons.volumeMuted("text-white-50"));
			}
		}
	}

	if(this._tab.tm.customGroupName != null) {
		let cgm = settingsStore.getCustomGroupsManager();
		this.addClasses("tm-callout", cgm.getCustomGroupCss(this._tab.tm.customGroupName));
		let bgColor = cgm.getCustomGroupProp(this._tab.tm.customGroupName, "color");
		visibleBadgesHtml.push(this._badgeHtml(this._tab.tm.customGroupName, bgColor));
	}

	this._addBadgesHtml(visibleBadgesHtml, this._tab.tm.primaryShortcutBadges);
	this._addBadgesHtml(visibleBadgesHtml, this._tab.tm.secondaryShortcutBadges, true);
	this._addBadgesHtml(visibleBadgesHtml, this._tab.tm.visualBadges);

	// The pinned thumbtack is always the rightmost badge/icon
	if(this._tab.pinned) {
		visibleBadgesHtml.push(icons.thumbtack());
	}

	if(this._tab.incognito) {
		this.addClasses("bg-secondary", "text-light", "border-dark");
		// Bootstrap "text-muted" only works for light backgrounds
		textMuted = "";
	}

	if(this._tab.status != null) {
		switch(this._tab.status) {
			case "unloaded":
				titleExtraClasses.push("fst-italic");
				imgExtraClasses.push("tm-favicon-bw");
				break;
			case "complete":
				// Don't add any visual clue if the tab is fully loaded
				break;
			default:
				// Don't add any visual clue if the tab is fully loaded
				break;
		}
	}

	let specialIcon = "";
	switch(this._tab.tm.type) {
		case Classes.NormalizedTabs.type.BOOKMARK:
			specialIcon = icons.bookmark;
			break;
		case Classes.NormalizedTabs.type.RCTAB:
			specialIcon = icons.history;
			break;
	}

	let imgHtml = "";
	if(this._imgUrl != "") {
		imgHtml = `
			<span class="pe-1"><img class="tm-favicon-16 ${imgExtraClasses.join(" ")}" src="${this._imgUrl}"></span>
		`;
	}

	// See https://getbootstrap.com/docs/5.0/components/card/
	// Do we need the attribute "width='16px'" in the <img> below, or are the min-width
	// and max-width settings of tm-favicon-16 enough?
//	const bodyHtml = `
//		<p class="card-title text-truncate tm-tile-title mb-0">
//			${imgHtml}
//			<span class="${textMuted} ${titleExtraClasses.join(" ")}">${this._safeText(this._title)}</span>
//		</p>
//		<div class="d-flex">
//			<p class="flex-grow-1 align-self-center text-truncate tm-tile-url">
//				<small class="${textMuted}">${specialIcon}${this._safeText(this._url)}</small>
//			</p>
//			<p> </p>
//			<p class="align-self-center card-text small" style="text-align: right;">
//				${visibleBadgesHtml.join(" ")}
//			</p>
//		</div>
//	`;
	const bodyHtml = `
		<p class="card-title text-truncate tm-tile-title mb-0">
			${imgHtml}
			${specialIcon}
			<span class="align-middle ${textMuted} ${titleExtraClasses.join(" ")}">${this._safeText(this._title)}</span>
		</p>
		<div class="d-flex">
			<p class="flex-grow-1 align-self-center text-truncate tm-tile-url">
				<small class="${textMuted}">${this._safeText(this._url)}</small>
			</p>
			<p> </p>
			<p class="align-self-center card-text small" style="text-align: right;">
				${visibleBadgesHtml.join(" ")}
			</p>
		</div>
	`;

	this.setHtml(bodyHtml);

	// The menu viewer is not in the body of the tile, but its destiny is parallel
	// to that of the body of the tile...

	
	this._asyncQueue.enqueue(this._renderMenu.bind(this),
				"TabTileViewer._renderMenu(tile " + this._id + ")",
				// Use low priority queue for the menu, it's not immediately visible
				Classes.AsyncQueue.priority.LOW); 
},

// Returns a Promise that can be then() with a function(metaTags), where
// "metaTags" is a dictionary of "name|property => value".
_getTabMetaTags: function() {
	const logHead = "TabTileViewer::_getTabMetaTags(" + this._tab.id + "): ";

	// The following check is slightly inaccurate, we don't have restrictions
	// accessing "chrome-extension://[this-extension]", only other extensions,
	// but since we have no use for injecting into ourselves, just avoiding
	// trying to track this detail.
	// About "chrome-error:", we can use extra permissions to access it, but
	// not sure why we should.
	if(["chrome:", "chrome-extension:", "chrome-error:"].includes(this._tab.tm.protocol)) {
		this._log(logHead + "can't access URL with protocol \"" +
						this._tab.tm.protocol + "\"", this._tab.url);
		return Promise.resolve(null);
	}

	if(this._tab.status == "unloaded" || this._tab.discarded) {
		//this._log(logHead + "can't access URL of unloaded tab");
		return Promise.resolve(null);
	}

	// Note that the file path must be relative to the top folder of the extension,
	// not to the folder where popup.js is.
	// If you try "../inject-getMeta.js" while the file in the parent folder of
	// the popup, you get an error "No source code or file specified.".
	// If you try "inject-getMeta.js" while the file is in the same folder as
	// the popup.html, you get "Failed to load file: "inject-getMeta.js"".
	// It only work with the path from the top folder...
	return chromeUtils.inject(this._tab.id, "content-gen/inject-getMeta.js").then(
		function(result) { // onFulfilled
			if(result == null) {
				// Some known error has already been handled, we'll just
				// consider the results empty.
				return null;
			}
			//this._log(logHead, result);
			if(result.length == 1) {
				if(result[0] == null) {
					this._err(logHead + "the injected script failed to generate a return value", result);
					return null;
				}
				return result[0].parsed;
			}
			this._err(logHead + "unknown format for result = ", result);
			return null;
		}.bind(this),
		function(chromeLastError) { // onRejected
			this._err(logHead + "unknown error: " + chromeLastError.message, this._tab);
			return chromeLastError;
		}.bind(this)
	);
},

_onTileClickCb: function(ev) {
	const logHead = "TabsTabViewer::_onTileClickCb(): ";
	if(this._tab.tm.type == Classes.NormalizedTabs.type.RCTAB) {
		chromeUtils.wrap(chrome.sessions.restore, logHead, this._tab.sessionId);
	} else {
		Classes.TabsTabViewer.activateTab(this._tab);
	}
},

_onTileCloseCb: function(ev) {
	const logHead = "TabTileViewer::_onTileCloseCb(" + this._tab.id + "): ";

	let removeFn = chrome.tabs.remove;
	let completionMsg = "completed";
	if(this._tab.tm.type == Classes.NormalizedTabs.type.BOOKMARK) {
		removeFn = chrome.bookmarks.remove;
		completionMsg = "bookmark deleted";
	}

	chromeUtils.wrap(removeFn, logHead, this._tab.id).then(
		function() {
			this._log(logHead + completionMsg);
		}.bind(this)
	);

	ev.stopPropagation();
},

_cleanupUrl: function(url) {
	if(url == "chrome://newtab/") {
		return "New tab";
	}

	// There should only be one undocked popup, but just in case, let's validate
	// this using two pieces of information
	if(url == popupDocker.getPopupUrl(true) && this._tab.id == popupDocker.getOwnTabId()) {
		// Hide our ugly URL...
		return "This popup window";
	}

	if(url.startsWith("https://")) {
		return url.substring(8); // "https://".length == 8
	}

	return url;
},

updateAsyncQueue: function(asyncQueue) {
	this._asyncQueue = asyncQueue;
},

// "tabGroup" is optional
// "queuePriority" is optional
update: function(tab, tabGroup, queuePriority) {
	const logHead = "TabTileViewer::update(): ";
	if(tab == null) {
		// Events like Classes.TabUpdatesTracker.CbType.ACTIVATED trigger a tile
		// update, but there's no "tab" info to perform the actual update... what
		// this means is that the tab has been activated, so let's simulate
		// the availability of that update here...
		//
		// We're making an assumption here that if update() is called with "tab == null",
		// there's already a value in this._tab (otherwise the initialization of
		// the tile would have failed).
		this._tab.activated = true;
		tab = this._tab;
	} else {
		// We're using this check to validate that the tab.id field remains unique across
		// all different types of tabs (tabs, rctabs, bmnodes). Since we always reuse a
		// tile only to represent the same tab.id, the tab's type should remain constant,
		// as no tab.id ever changes its type
		this._assert(this._tab.id == tab.id, logHead + `tab.id changed from ${this._tab.id} to ${tab.id}`);
		this._assert(this._tab.tm.type == tab.tm.type, logHead +
						`type changed from ${this._tab.tm.type} to ${tab.tm.type} for tab ${this._tab.tm.extId}`);
		this._tab = tab;
	}

	if(tabGroup != null) {
		this._tabGroup = tabGroup;
	} // Otherwise keep whatever tabGroup was already there

	this._title = tab.title;
	this._url = this._cleanupUrl(tab.url);

	if(tab.favIconUrl != null) {
		this._imgUrl = tab.favIconUrl;
	} else {
		if(tabGroup != null && tabGroup.favIconUrl != null) {
			this._imgUrl = tabGroup.favIconUrl;
		} else {
			this._imgUrl = "";
		}
	}

	// Trying to speed up the general rendering of the whole list by detaching
	// the rendering of the tiles body.
	// We used to have asyncFn() here, but that was insufficient, because it was creating
	// a swarm of pending updates, and the Javascript engine was queuing them all at the
	// same time, meaning that they would all have to run to completion before any other
	// event could be processed. Pushing all the tile updates that way was worse than just
	// processing to completion, because at least when you process to completion you can
	// measure how long it's taking, while these scattered/headless pieces of functions
	// were just running in no-mans land only known to the Javascript engine, with no way
	// to see them, except for their detrimental effect to everything else (changing a class
	// of an element could take seconds to take effect because of this swarm).
	this._asyncQueue.enqueue(
		function() {
			this.renderBody();

			this._getTabMetaTags().then(
				function(metaTags) {
					tab.tm.metaTags = metaTags;
				}
			);
		}.bind(this),
		"tile " + this._id,
		queuePriority
		// Tried to play with the priority based on this._isInViewport(), but when we are
		// here during tile creation, the tile has yet to be attached to the DOM, because
		// we're still in _init(), and the attachment to the DOM needs to be done by the
		// caller.
		// We also tried to take the first this.update() outside of _init(), and done by
		// the caller after attaching to the DOM, but that seems to have the side effect
		// of scrolling back all the way to the top.
		// Decided to use the priority to set a low priority when reusing a tile from
		// TabsTabViewer._renderTile()
	);
},

getTabId: function() {
	return this._tab.id;
},

setClickCloseHandler: function(fn) {
	this._closeElem.addEventListener("click", fn, false);
},

setClickHandler: function(fn) {
	// Since update() doesn't change the root element, this handler remains valid
	// across multiple update() calls
	this._rootElem.addEventListener("click", fn, false);
},

}); // Classes.TabTileViewer
