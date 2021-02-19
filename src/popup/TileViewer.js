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
	// "bg-dark" is not in the list of _colorToBgCss, so when the input parameter
	// "bgColor" is set to "null", we'll pick "bg-dark".
	let bgClass = optionalWithDefault(this._colorToBgCss[bgColor], "bg-dark");

	return `<span class="badge tm-text-badge ${bgClass}">${txt}</span>`;
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
		if(this._tab.mutedInfo.muted) {
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

	// The pinned thumbtack is always the rightmost badge
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

	let imgHtml = "";
	if(this._imgUrl != "") {
		imgHtml = `
			<span class="pe-1"><img class="tm-favicon-16 ${imgExtraClasses.join(" ")}" src="${this._imgUrl}"></span>
		`;
	}

	// See https://getbootstrap.com/docs/5.0/components/card/
	// Do we need the attribute "width='16px'" in the <img> below, or are the min-width
	// and max-width settings of tm-favicon-16 enough?
	const bodyHtml = `
		<p class="card-title text-truncate tm-tile-title mb-0">
			${imgHtml}
			<span class="${textMuted} ${titleExtraClasses.join(" ")}">${this._safeText(this._title)}</span>
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

_cleanupUrl: function(url) {
	if(url == "chrome://newtab/") {
		return "[new tab]";
	}

	if(url.startsWith("https://")) {
		return url.substring(8); // "https://".length == 8
	}

	return url;
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
