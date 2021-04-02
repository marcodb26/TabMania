// CLASS TabTileViewer
//
Classes.TabTileViewer = Classes.Viewer.subclass({
	__idPrefix: "TabTileViewer",

	_rootElem: null,
	_bodyElem: null,
	_menuElem: null,
	_closeElem: null,

	// "_renderState" includes: title, url, imgUrl, etc.
	_renderState: null,

	// Since we take some async rendering actions, and in some cases these actions can be
	// cancelled, we need to track if the actions have completed, otherwise when caching
	// we might be caching an unrendered icon that thinks it's rendered...
	_renderBodyCompleted: null,

	_tab: null,
	_tabGroup: null,
	// An object of type Classes.AsyncQueue
	_asyncQueue: null,

	_menuViewer: null,

	// The tile has an underlay with tab icon, title and website, and an overlay (higher z-index)
	// with dropdown menu and tile-close button. The overlay is normally hidden until the pointer
	// hovers over the tile, at which points it becomes visible with a short delay. The overlay
	// stays visible until the pointer hovers away. With touch gestures, the hover is simulated, and
	// that's a problem because a moouse is always hovering over something, causing the hover state
	// to always be accurate, while a touch applied to an element triggers a hover state that can't
	// be removed until it's triggered somewhere else by another gesture (you can't "cancel" the hover
	// state simulated on a tile).
	// In general we need to know when the overlay is visible because we need that information to
	// decide whether or not we should auto-open dropdown menus.
	_overlayVisible: false,

	_touchHoverSerialPromises: null,

	// _pointerUpCancelRecentlyFired is a flag, but we store a timestamp in it to get a bit
	// more debug information, so assume that non-zero values mean "true" and 0 means "false"
	_pointerUpCancelRecentlyFired: 0,

// "tabGroup" is optional, if specified it can be used to provide a default favIconUrl
// "asyncQueue" is mandatory, and it's the queue where the tile needs to enqueue all heavy
// rendering of itself.
_init: function(tab, tabGroup, asyncQueue) {
	// Overriding the parent class' _init(), but calling that original function first
	Classes.Viewer._init.apply(this, arguments);

	this.debug();

	this._renderBodyCompleted = false;
	this._touchHoverSerialPromises = Classes.SerialPromises.createAs(this._id + "::_touchHoverSerialPromises");
	this._tab = tab;
	this._asyncQueue = asyncQueue;

	this._renderEmptyTile();
	this.update(tab, tabGroup);
},

_pointerOverCb: function(ev) {
	// See https://developer.mozilla.org/en-US/docs/Web/API/PointerEvent/pointerType
	if(ev.pointerType == "mouse") {
		return;
	}

	// For hover events generated by devices other than "mouse" (that is, pointerType
	// "pen" or "touch"), automatically open the dropdown menu without waiting for the
	// user to click on it. Hover with a mouse can be by chance, but the simulated
	// "mouseover" attached to a touch screen or a pen is triggered by a very deliberate
	// action that implies an interest to see the menu.
	const logHead = "TabTileViewer::_pointerOverCb(): ";

	if(this._menuViewer == null) {
		this._log(logHead + "no _menuViewer, can't proceed", ev);
		return;
	}

	// Remember that SerialPromises.next() needs a function that returns a Promise.
	let openFn = function() {
		if(this._pointerUpCancelRecentlyFired != 0) {
			// Note that while you would expect the next log to only show intervals of
			// less than 500ms (the time it takes to reset _pointerUpCancelRecentlyFired),
			// you'll actually see longer intervals when the user does a short tap (click),
			// because the cascade of actions triggered by moving to foreground a new tab
			// (including the likely full re-query/re-render triggered by it) will delay
			// all other async actions. It's good that this async action (this function)
			// gets invoked in order, before the async action that should reset the value
			// of _pointerUpCancelRecentlyFired, because this async function is also getting
			// delayed, and it would have fired within those 500ms if it wasn't delayed
			// (otherwise it would get called in order after the reset of _pointerUpCancelRecentlyFired).
			// This is why it's best to work with the reset, rather than try to compute the
			// time delta here.
			this._log(logHead + "suppressing auto-opening dropdown " +
								(performance.now() - this._pointerUpCancelRecentlyFired) +
								"ms after 'pointerup'/'pointercancel' event");
			this._pointerUpCancelRecentlyFired = 0;
			return Promise.resolve();
		}

		this._log(logHead + "opening menu", ev);
		this._menuViewer.open();
		return Promise.resolve();
	}.bind(this);

	// If there was a past instance of this event still waiting to take action, cancel it
	this._touchHoverSerialPromises.reset();
	// The problem with the "pointerover" event is that it arrives immediately (before
	// the "pointerdown" event), before the menu is actually visible, and before we can
	// have clues as to whether this hover is legitimate (the user is tap-holding a tile
	// because she wants to see the menu, or the user is tap-holding a tile because she's
	// trying to scroll through tiles, or even the user is just clicking). Before we can
	// take any action, we need to first wait a bit, to understand under what conditions
	// this event fired.
	//
	// Wait 700ms, then call openFn() (unless it gets cancelled).
	this._touchHoverSerialPromises.next(delay.bind(null, 700), "delay");
	this._touchHoverSerialPromises.next(openFn, "openFn");
},

// Trying to manage the "hover" state for touch devices is a bit crazy, and doesn't really
// work very well, but the laternative is more difficult. If we didn't want to use "hover",
// we would need to manage these 3 sequences:
// - pointerdown -> pointercancel (move/scroll gesture)
// - pointerdown -> pointerup (click: short interval)
// - pointerdown -> pointerup (tap-hold: long interval)
// This looks deceptively simple, and the complexity is in the fact that "tap-hold" should
// trigger a state change in the tile (and make the overlay visible), but there's no "reverse
// event" to change the state back to "overlay not visible". How do you go back to "overlay
// not visible" after you've detected a "tap-hold"? The answer is "you wait for the tap-hold
// to show up on another tile" (besides offering a way to reverse it within the tile itself).
// Having to monitor all tiles is the problem, the detection of the reverse event can't be
// self-contained within the tile, it's a collaborative effort across tiles (and possibly
// other elements of the DOM). And it needs to be a collaborative effort between touch
// gestures and mouse events (because a mouse hover on another tile must also change the
// state of the tile that had been tab-held).
// The reverse event and the intermixing with mouse events are automatically available with
// the simulated "hover" state, so it's less work to keep hacking around it for touch, even
// though the "hover" state can't be reversed by taking explicit actions on the same tile.
//
// If touch gestures represented a more promininent use case for TabMania, maybe we'd need
// to invest the effort. But TabMania is only for desktop/laptop computers (because Chrome
// extensions are, mostly), not mobile devices. Touch on desktops/laptops is not as necessary,
// so we can leave with these hacks.
_pointerUpCancelCb: function(ev) {
	// See https://developer.mozilla.org/en-US/docs/Web/API/PointerEvent/pointerType
	if(ev.pointerType == "mouse") {
		return;
	}

	const logHead = "TabTileViewer::_pointerUpCancelCb(): ";
	this._log(logHead + "entering");
	this._pointerUpCancelRecentlyFired = performance.now();
	delay(500).then(function() { this._pointerUpCancelRecentlyFired = 0; } );
},

// When the dropdown menu of a tile becomes invisible (cursor hovered away from tile),
// we want to force the dropdown menu to get automatically closed, so that when the user
// hovers back on the tile, it finds the dropdown in the same state (closed) every time.
// Since there's no explicit event for CSS style changes, we're emulating that by attaching
// an animation to the "hover start/stop" transitions (see CSS for ".tm-hover .tm-hover-target").
// This function gets invoked when the animation ends, tries to establish what happened to
// the CSS "visibility" style, and determines that if visibility has transitioned to "hidden",
// then this._menuViewer.close() must be called.
_hoverTransitionEndCb: function(ev) {
	const logHead = "TabTileViewer::_hoverTransitionEndCb(): ";

	if(ev.propertyName != "visibility") {
		// Bootstrap has other animations on the dropdown toggle, let's make sure
		// we only work with the "visibility" animation
		return;
	}

//	perfProf.mark("getComputedStyleStart");
	// After a few experiments, this seems to be taking less than 1 millisecond (0.7ms on average),
	// so it's not a huge performance drain
	this._overlayVisible = window.getComputedStyle(ev.target).visibility !== "hidden";
//	perfProf.mark("getComputedStyleEnd");
//	perfProf.measure("TabTileViewer::getComputedStyle", "getComputedStyleStart", "getComputedStyleEnd");

	this._log(logHead + "entering, this._overlayVisible:", this._overlayVisible, ev);

	if(!this._overlayVisible) {
		// If there was a past instance of "pointerover" still waiting to take action, cancel it.
		// It's almost certain this is not needed when _menuViewer == null, but it doesn't do
		// any harm to leave this action outside of the following check.
		this._touchHoverSerialPromises.reset();
		if(this._menuViewer == null) {
			this._log(logHead + "no _menuViewer, can't proceed");
		} else {
			this._menuViewer.close();
		}
	}
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
	<div style="min-height: 3em;" class="card tm-hover tm-cursor-default">
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

	// We always start with menu and close button visible, but _renderBodyInner() can decide
	// to hide them depending on _renderState
	this._menuElem = this.getElementById(menuId);
	this._closeElem = this.getElementById(closeId);

	this.setClickHandler(this._onTileClickCb.bind(this));
	this.setClickCloseHandler(this._onTileCloseCb.bind(this));

	// We're tracking the following events to manage touch screens:
	// "pointerover" + "pointercancel"/"pointerup" are used together to figure out whether or
	// not we can auto-open the dropdown menu for touch-hold gestures.
	// "transitionend" is used to track _overlayVisible and to auto-close open dropdown menus
	// (for any kind of pointer, mouse or touch).
	this._rootElem.addEventListener("pointerover", this._pointerOverCb.bind(this));
	this._rootElem.addEventListener("pointerup", this._pointerUpCancelCb.bind(this));
	this._rootElem.addEventListener("pointercancel", this._pointerUpCancelCb.bind(this));
	this._menuElem.parentElement.addEventListener("transitionend", this._hoverTransitionEndCb.bind(this));
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

_renderMenuInner: function() {
	switch(this._renderState.tmType) {
		case Classes.NormalizedTabs.type.TAB:
			this._menuViewer = Classes.TileTabMenuViewer.create(this._tab);
			this._menuViewer.attachToElement(this._menuElem);
			break;
		case Classes.NormalizedTabs.type.BOOKMARK:
			this._menuViewer = Classes.TileBookmarkMenuViewer.create(this._tab);
			this._menuViewer.attachToElement(this._menuElem);
			break;
		case Classes.NormalizedTabs.type.HISTORY:
			this._menuViewer = Classes.TileHistoryMenuViewer.create(this._tab);
			this._menuViewer.attachToElement(this._menuElem);
			break;
		default:
			// A recently closed tab should not get here...
			const logHead = "TabTileViewer::_renderMenuInner(tile " + this._id + "): ";
			this._err(logHead + "unknown tmType", this._renderState.tmType);
			break;
	}
},

_renderMenu: function() {
	const logHead = "TabTileViewer::_renderMenu(tile " + this._id + "): ";
	this._asyncQueue.enqueue(this._renderMenuInner.bind(this), logHead,
			// Use low priority queue for the menu, as it's not immediately visible
			Classes.AsyncQueue.priority.LOW); 
},

_updateMenu: function() {
	if(this._menuViewer == null) {
		return;
	}
	this._asyncQueue.enqueue(this._menuViewer.update.bind(this._menuViewer, this._tab),
			"TabTileViewer::_updateMenu(tile " + this._id + ")",
			// Use low priority queue for the menu, as it's not immediately visible
			Classes.AsyncQueue.priority.LOW); 
},

_processMenuViewer: function() {
	if(this._menuViewer == null) {
		// The menu doesn't exist, create it
		this._renderMenu();
	} else {
		// The menu already exists, update it
		this._updateMenu();
	}
},

_renderBodyInner: function() {
	const logHead = "TabTileViewer::_renderBodyInner(): ";
	let visibleBadgesHtml = [];
	let titleExtraClasses = [];
	let textMuted = "text-muted";
	const favIconContainerId = this._id + "-favicon";
	let favIconClasses = [ "tm-favicon-16" ];

	switch(this._renderState.audio) {
		case "audible-muted":
			visibleBadgesHtml.push(icons.volumeMuted());
			break;
		case "audible":
			visibleBadgesHtml.push(icons.volumeAudible);
			break;
		case "muted":
			if(!this._renderState.incognito) {
				visibleBadgesHtml.push(icons.volumeMuted("text-secondary"));
			} else {
				visibleBadgesHtml.push(icons.volumeMuted("text-white-50"));
			}
			break;
		default:
			if(this._renderState.audio != null) {
				this._err(logHead + "unknown this._renderState.audio = ", this._renderState.audio);
			}
			break;
	}

	if(this._renderState.customGroupName != null) {
		let cgm = settingsStore.getCustomGroupsManager();
		this.addClasses("tm-callout", cgm.getCustomGroupCssByColor(this._renderState.customGroupColor));
		visibleBadgesHtml.push(this._badgeHtml(this._renderState.customGroupName,
												this._renderState.customGroupColor));
	}

	this._addBadgesHtml(visibleBadgesHtml, this._renderState.primaryShortcutBadges);
	this._addBadgesHtml(visibleBadgesHtml, this._renderState.secondaryShortcutBadges, true);
	this._addBadgesHtml(visibleBadgesHtml, this._renderState.visualBadges);

	// The pinned thumbtack is always the rightmost badge/icon
	if(this._renderState.pinned) {
		visibleBadgesHtml.push(icons.thumbtack());
	} else {
		if(this._renderState.pinInherited) {
			visibleBadgesHtml.push(icons.thumbtack("tm-fa-thumbtack-tile", "text-secondary"));
		}
	}

	if(this._renderState.incognito) {
		this.addClasses("bg-secondary", "text-light", "border-dark");
		// Bootstrap "text-muted" only works for light backgrounds
		textMuted = "";
	}

	if(this._renderState.status != null) {
		switch(this._renderState.status) {
			case "unloaded":
				titleExtraClasses.push("fst-italic");
				favIconClasses.push("tm-favicon-bw");
				break;
			case "loading":
			case "complete":
				// Don't add any visual clue if the tab is fully loaded
				break;
			default:
				this._err(logHead + "unknown this._renderState.status = ", this._renderState.status);
				break;
		}
	}

	let specialIcon = "";
	switch(this._renderState.tmType) {
		case Classes.NormalizedTabs.type.BOOKMARK:
			specialIcon = icons.bookmark;
			break;
		case Classes.NormalizedTabs.type.RCTAB:
			specialIcon = icons.history("tm-fa-recently-closed");
			break;
		case Classes.NormalizedTabs.type.HISTORY:
			specialIcon = icons.history("tm-fa-history");
			break;
		case Classes.NormalizedTabs.type.TAB:
			// No extra visual clue for standard tabs
			break;
		default:
			this._err(logHead + "unknown this._renderState.tmType = ", this._renderState.tmType);
			break;
	}

	// See https://getbootstrap.com/docs/5.0/components/card/
	// Do we need the attribute "width='16px'" in the <img> below, or are the min-width
	// and max-width settings of tm-favicon-16 enough?
	const bodyHtml = `
		<p class="card-title text-truncate tm-tile-title mb-0">
			<span id="${favIconContainerId}" class="pe-1"><!-- The favicon goes here --></span>
			${specialIcon}
			<span class="align-middle ${textMuted} ${titleExtraClasses.join(" ")}">${this._safeText(this._renderState.title)}</span>
		</p>
		<div class="d-flex">
			<p class="flex-grow-1 align-self-center text-truncate tm-tile-url">
				<small class="${textMuted}">${this._safeText(this._renderState.url)}</small>
			</p>
			<p> </p>
			<p class="align-self-center card-text small" style="text-align: right;">
				${visibleBadgesHtml.join(" ")}
			</p>
		</div>
	`;

	this.setHtml(bodyHtml);

	let favIconContainerElem = this.getElementById(favIconContainerId);

	let favIconOptions = {
		src: this._renderState.imgUrl,
		srcBackup: this._renderState.imgUrlBackup,
		extraClasses: favIconClasses,
	};
	let favIconViewer = Classes.ImageViewer.create(favIconOptions);
	favIconViewer.attachToElement(favIconContainerElem);

	if(this._renderState.showCloseButton) {
		this._closeElem.classList.remove("tm-hide");
	} else {
		this._closeElem.classList.add("tm-hide");
	}
	if(this._renderState.showMenu) {
		this._menuElem.classList.remove("tm-hide");
		// The _menuViewer is not in the body of the tile, but its destiny is parallel
		// to that of the body of the tile...
		this._processMenuViewer();
	} else {
		this._menuElem.classList.add("tm-hide");
	}
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

_renderBody: function(queuePriority) {
	this._renderBodyCompleted = false;

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
			this._renderBodyInner();

//			this._getTabMetaTags().then(
//				function(metaTags) {
//					this._tab.tm.metaTags = metaTags;
//				}.bind(this)
//			);

			this._renderBodyCompleted = true;
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
		// TabsBsTabViewer._renderTile()
	);
},

_onTileClickCb: function(ev) {
	Classes.TabsBsTabViewer.activateTab(this._tab);
},

_onTileCloseCb: function(ev) {
	const logHead = "TabTileViewer::_onTileCloseCb(" + this._tab.id + "): ";

	let removeFn = chrome.tabs.remove;
	let fnParam = this._tab.id;
	let completionMsg = "completed";

	switch(this._tab.tm.type) {
		case Classes.NormalizedTabs.type.BOOKMARK:
			removeFn = chrome.bookmarks.remove;
			// Remember, "this._tab.id" would be incorrect for bookmarks
			fnParam = this._tab.bookmarkId;
			completionMsg = "bookmark deleted";
			break;
		case Classes.NormalizedTabs.type.HISTORY:
			removeFn = chrome.history.deleteUrl;
			fnParam = { url: this._tab.url };
			completionMsg = "history item deleted";
			break;
		case Classes.NormalizedTabs.type.TAB:
			// All the variables have already been initialized correctly
			break;
		default:
			// Note that we don't have a "close" button for rcTabs, so
			// we don't need to check for Classes.NormalizedTabs.type.RCTAB
			this._err(logHead + "unknown tab type", this_tab.tm.type);
			break;
	}

	chromeUtils.wrap(removeFn, logHead, fnParam).then(
		function() {
			this._log(logHead + completionMsg, fnParam);
		}.bind(this)
	);

	ev.stopPropagation();
},

_isThisPopupTab: function(tab) {
	return (tab.id == popupDocker.getOwnTabId());
},

_cleanupUrl: function(tab) {
	let url = tab.url;
	if(url == "chrome://newtab/") {
		return "New tab";
	}

	if(this._isThisPopupTab(tab)) {
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

_createRenderState: function(tab, tabGroup) {
	let renderState = {};

	// We never render the naked "id", but it doesn't hurt to store it here
	renderState.id = tab.id;
	renderState.tmType = tab.tm.type;
	renderState.title = tab.title;
	renderState.url = this._cleanupUrl(tab);

	if(tab.favIconUrl != null) {
		renderState.imgUrl = tab.favIconUrl;
		renderState.imgUrlBackup = tab.tm.cachedFavIconUrl;
	} else {
		if(tabGroup != null && tabGroup.favIconUrl != null) {
			renderState.imgUrl = tabGroup.favIconUrl;
			renderState.imgUrlBackup = tab.tm.cachedFavIconUrl;
		} else {
			// See GroupBuilder._findFavIconUrl() for an explanation for this
			// "last resort URL"
			renderState.imgUrl = Classes.NormalizedTabs.buildCachedFavIconUrl("");
			renderState.imgUrlBackup = renderState.imgUrl;
		}
	}

	renderState.incognito = tab.incognito;

	// "audible" and "muted" are not mutually exclusive, but we want to show a
	// single icon, so we're using the arbitrary convention of making the muted
	// icon gray if there's no current audio (meaning "if there was audio, it
	// would be muted"), and black if there's current audio (meaning "your audio
	// is currently muted").
	// We follow the same convention for incognito tabs, but in reverse (lighter
	// means active audio, darker means no audio).
	if(tab.audible) {
		if(tab.mutedInfo != null && tab.mutedInfo.muted) {
			renderState.audio = "audible-muted";
		} else {
			renderState.audio = "audible";
		}
	} else {
		// We need to add the check "tab.mutedInfo != null" because "tab" could
		// actually be a tab.tm.type == Classes.NormalizedTabs.type.BOOKMARK/HISTORY/RCTAB,
		// which doesn't have "mutedInfo". The cleaner thing would be to check for
		// type, but the current check seems to be a bit less verbose.
		if(tab.mutedInfo != null && tab.mutedInfo.muted) {
			renderState.audio = "muted";
		} else {
			renderState.audio = null;
		}
	}

	if(tab.tm.customGroupName != null) {
		renderState.customGroupName = tab.tm.customGroupName;
		let cgm = settingsStore.getCustomGroupsManager();
		renderState.customGroupColor = cgm.getCustomGroupColor(tab.tm.customGroupName);
	} else {
		renderState.customGroupName = null;
		renderState.customGroupColor = null;
	}

	renderState.primaryShortcutBadges = tmUtils.deepCopy(tab.tm.primaryShortcutBadges);
	renderState.secondaryShortcutBadges = tmUtils.deepCopy(tab.tm.secondaryShortcutBadges);
	renderState.visualBadges = tmUtils.deepCopy(tab.tm.visualBadges);

	renderState.pinned = tab.pinned;
	renderState.pinInherited = (tab.pinInherited != null);
	renderState.status = tab.status;

	renderState.showMenu = true;
	renderState.showCloseButton = true;

	if(this._isThisPopupTab(tab) || tab.tm.type == Classes.NormalizedTabs.type.RCTAB) {
		// We're disabling all actions on the tile representing this TabMania popup because none
		// of them make sense on the popup. We could leave the close action, but you can close it
		// with the standard close button of the popup window you're on.
		// You can't close or delete a recently closed tab, so no reason to show a "close" button,
		// and no action in the menu: the only action (restore) is taken when clicking on the tile.
		renderState.showMenu = false;
		renderState.showCloseButton = false;
	}

	if(tab.tm.type == Classes.NormalizedTabs.type.BOOKMARK && tab.unmodifiable != null) {
		// You also can't delete a bookmark if it's marked "unmodifiable".
		// Let's just hide the "close" button in this case.
		renderState.showCloseButton = false;
	}

	return renderState;
},

_isRenderCompleted: function() {
	if(this._menuViewer == null) {
		return false;
	}
},

// "tabGroup" is optional, if not specified, we'll continue to use the one we
// already have.
// "queuePriority" is optional
// Returns "true" if an update is needed (and currently being performed asynchronously),
// "false" if the tab has not changed from a tile-rendering perspective (it might have
// changed for properties that are not visualized in the tile). Note that returning "false"
// described only the state of the tile, not the state of its menu. Its menu might have
// changed, but we'd still return "false" because we can't easily track that.
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
		// all different types of tabs (tabs, rctabs, bmnodes, hitems). Since we always reuse
		// a tile only to represent the same tab.id, the tab's type should remain constant,
		// as no tab.id ever changes its type
		this._assert(this._tab.id == tab.id, logHead + `tab.id changed from ${this._tab.id} to ${tab.id}`);
		this._assert(this._tab.tm.type == tab.tm.type, logHead +
						`type changed from ${this._tab.tm.type} to ${tab.tm.type} for tab ${this._tab.tm.extId}`);
		this._tab = tab;
	}

	if(tabGroup != null) {
		this._tabGroup = tabGroup;
	} // Otherwise keep whatever tabGroup was already there

	let pastRenderState = this._renderState;
	this._renderState = this._createRenderState(tab, this._tabGroup);

// The log below is useful when testing chrome.tabs events updates
//	if(this._tab.id > 1952) {
//		this._log(logHead + "rendering state:", this._renderState);
//	}

	if(!this._renderBodyCompleted) {
		// The render could be incomplete because it never happened, or because it was
		// scheduled to happen, but the AsyncQueue got discarded before it could be done
		this._renderBody();
		return true;
	}

	// The tile needs to run 3 chuncks of code:
	// - This code (sync with the caller)
	// - The _renderBody() of the tile (async 1)
	// - The _renderMenu() for the tile (async 2)
	// "async 1" and "async 2" are sequential (the first triggers the second), but
	// completion of "async 1" (that is "this._renderBodyCompleted") doesn't mean
	// completion of "async 2" (they're even scheduled at different priorities).
	// By the time we get here in the code, we know "this._renderBodyCompleted == true",
	// but we don't know if "async 2" was completed. "this._menuViewer != null" gives
	// us that information. If it was completed, we need to call the update() function
	// of the menu, to let it process the change that triggered this update() call.
	//
	// Below in the function we might discover this update() is no update for the tile
	// rendering, but we can't assume it's not update for the menu. Some menu viewers
	// (specifically the bookmark one) can't easily tell if an update is needed or not
	// (if you move a bookmark to a different subtree of folders, you need to rebuild
	// (asynchronously) the folder path to tell), so we must just call their update()
	// function regardless of the need to re-render the tile, and how it's efficient.
	// Since _renderBody() internally calls _menuViewer.update(), the only case left
	// out is the case when we decide to not call _renderBody().

	// pastRenderedState should not be null since "this._renderBodyCompleted == true" (you
	// won't get here if it's "false")
	this._assert(pastRenderState != null);
	if(tmUtils.isEqual(pastRenderState, this._renderState)) {
		if(this._renderState.showMenu) {
			this._processMenuViewer();
		}
		// Returning "false" here tells the caller only about the state of the tile
		// being unchanged, not about the state of the menu being unchanged.
		return false;
	}

	// The tile state has changed, and we had processed to completion the previous change
	this._renderBody();

	return true;
},

getTabId: function() {
	return this._tab.id;
},

getTabInfo: function() {
	return this._tab;
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
