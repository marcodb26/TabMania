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

	_menuViewer: null,

// "tabGroup" is optional, if specified it can be used to provide a default favIconUrl
_init: function(tab, tabGroup) {
	// Overriding the parent class' _init(), but calling that original function first
	Classes.Viewer._init.apply(this, arguments);

	this.debug();

	this._tab = tab;
	this._renderEmptyTile();
	this.update(tab, tabGroup);
},

_renderEmptyTile: function() {
	const bodyId = this._id + "-body";
	const menuId = this._id + "-menu";
	const closeId = this._id + "-close";

	const btnColor = this._tab.incognito ? "btn-light" : "btn-secondary";

	const closeIcon = `<span aria-hidden="true">&times;</span>`;
//	const closeIcon = `<span aria-hidden="true" class="tm-close-icon-icon"></span>`;
//	const closeIcon = `<svg role="img" viewBox="0 0 448 300" xmlns="http://www.w3.org/2000/svg"><rect rx="50" height="300" width="448" y="0" x="0" fill="currentColor"/><rect transform="rotate(-45 224,145) " rx="10" height="56" width="248" y="122" x="100" fill="#fff"/><rect transform="rotate(45 224,150) " rx="10" height="56" width="248" y="122" x="100" fill="#fff"/></svg>`;

	const rootHtml = `
	<div style="cursor: default" class="card tm-hover">
		<div id="${bodyId}" class="card-body px-2 py-1 text-nowrap tm-stacked-below">
		</div>
		<div class="tm-overlay tm-full-size tm-hover-target">
			<div id="${menuId}" class="tm-tile-toggle-center">
			</div>
			<div class="tm-float-right">
				<button type="button" id="${closeId}" class="${btnColor} tm-rounded-btn tm-close-icon close" aria-label="Close">
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

	this.setClickHandler(this._onTileClickCb.bind(this));
	this.setClickCloseHandler(this._onTileCloseCb.bind(this));
},

// "secondary" is a flag (default "false") that determines the color
// of te badge
_badgeHtml: function(txt, secondary) {
	secondary = optionalWithDefault(secondary, false);
	let bgColor = "bg-dark";
	if(secondary) {
		bgColor = "bg-secondary";
	}

	// Important to normalize the badge to lower case for search...
	this._tab.tm.searchBadges.push(txt.toLowerCase());
	return `<span class="badge tm-text-badge ${bgColor}">${txt}</span>`;
},

_addShortcutBadgesInner: function(properties, scKeys, secondary) {
	let sm = settingsStore.getShortcutsManager();
	scKeys.forEach(
		function(key) {
			properties.push(this._badgeHtml(sm.keyToUiString(key), secondary));
		}.bind(this)
	);
},

_addShortcutBadges: function(properties) {
	//const logHead = "TabTileViewer::_addShortcutBadges(" + this._tab.tm.hostname + "): ";
	let sm = settingsStore.getShortcutsManager();

	// First candidate first
	let scKeys = sm.getShortcutKeysForTab(this._tab);
	this._addShortcutBadgesInner(properties, scKeys);

	// Not first candidate next
	scKeys = sm.getShortcutKeysForTab(this._tab, false);
	this._addShortcutBadgesInner(properties, scKeys, true);
},

renderBody: function() {
	let properties = [];
	let titleExtraClasses = "";
	let textMuted = "text-muted";
	let imgExtraClasses = "";

	// Reinitialize the tab searchBadges in case they've changed (?)
	// We're setting them inside _badgeHtml().
	this._tab.tm.searchBadges = [];

	this._addShortcutBadges(properties);

	if(this._tab.discarded) {
		properties.push(this._badgeHtml("discarded"));
	}

	if(this._tab.highlighted) {
		properties.push(this._badgeHtml("highlighted"));
	}

	if(this._tab.incognito) {
		properties.push(this._badgeHtml("incognito"));
		this.addClasses("bg-secondary", "text-light", "border-dark");
		// Bootstrap "text-muted" only works for light backgrounds
		textMuted = "";
	}

	if(this._tab.status != null) {
		switch(this._tab.status) {
			case "unloaded":
				titleExtraClasses = "fst-italic";
				imgExtraClasses = "tm-favicon-bw";
				break;
			case "complete":
				// Don't add any visual clue if the tab is fully loaded
				break;
			default:
				properties.push(this._badgeHtml(this._tab.status));
				break;
		}
	}

	if(this._tab.pinned) {
		properties.push(this._badgeHtml("pinned"));
	}

	if(settingsStore.getOptionShowTabId()) {
		properties.push(this._badgeHtml(this._tab.tm.extId));
	}

	// See https://getbootstrap.com/docs/5.0/components/card/
	// Do we need the attribute "width='16px'" in the <img> below, or are the min-width
	// and max-width settings of tm-favicon-16 enough?
	const bodyHtml = `
		<p class="card-title text-truncate tm-tile-title mb-0">
			<span class="pe-2"><img class="tm-favicon-16 ${imgExtraClasses}" src="${this._imgUrl}"></span>
			<span class="${textMuted} ${titleExtraClasses}">${this._safeText(this._title)}</span>
		</p>
		<div class="d-flex">
			<p class="flex-grow-1 align-self-center text-truncate tm-tile-url">
				<small class="${textMuted}">${this._safeText(this._url)}</small>
			</p>
			<p> </p>
			<p class="align-self-center card-text small" style="text-align: right;">
				${properties.join(" ")}
			</p>
		</div>
	`;

	this.setHtml(bodyHtml);

	// The menu viewer is not in the body of the tile, but its destiny is parallel
	// to that of the body of the tile...
	this._menuViewer = Classes.TileMenuViewer.create(this._tab);
	this._menuViewer.attachToElement(this._menuElem);
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
	return chromeUtils.inject(this._tab.id, "content/inject-getMeta.js").then(
		function(result) { // onFulfilled
			if(result == null) {
				// Some known error has already been handled, we'll just
				// consider the results empty.
				return null;
			}
			//this._log(logHead, result);
			if(result.length == 1) {
				return result[0].parsed;
			}
			this._err(logHead + "unknown format for result = ", result);
		}.bind(this),
		function(chromeLastError) { // onRejected
			this._err(logHead + "unknown error: " + chromeLastError.message, this._tab);
			return chromeLastError;
		}.bind(this)
	);
},

_onTileClickCb: function(ev) {
	chromeUtils.activateTab(this._tab.id).then(
		function() {
		}.bind(this)
	);
},

_onTileCloseCb: function(ev) {
	const logHead = "TabTileViewer::_onTileCloseCb(" + this._tab.id + "): ";
	chromeUtils.wrap(chrome.tabs.remove, logHead, this._tab.id).then(
		function() {
			this._log(logHead + "completed");
		}.bind(this)
	);

	ev.stopPropagation();
},

// "tabGroup" is optional
update: function(tab, tabGroup) {
	if(tab == null) {
		// Events like Classes.TabUpdatesTracker.CbType.ACTIVATED trigger a tile
		// update, but there's no "tab" info to perform the actual update... what
		// this means is that the tab has been highlighted, so let's simulate
		// the availability of that update here...
		//
		// We're making an assumption here that if update() is called with "tab == null",
		// there's already a value in this._tab (otherwise the initialization of
		// the tile would have failed.
		this._tab.highlighted = true;
		tab = this._tab;
	} else {
		this._tab = tab;
	}

	if(tabGroup != null) {
		this._tabGroup = tabGroup;
	} // Otherwise keep whatever tabGroup was already there

	this._title = tab.title;
	if(tab.url != "chrome://newtab/") {
		this._url = tab.url;
	} else {
		this._url = "[new tab]";
	}

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
	asyncFn(
		function() {
			this.renderBody();

			this._getTabMetaTags().then(
				function(metaTags) {
					tab.tm.metaTags = metaTags;
				}
			);
		}.bind(this)
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
