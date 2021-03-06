// CLASS TabViewer
//
// To create an object, use TabViewer.createAs(), where:
// - the "id" argument is going to be used as prefix for all the DOM IDs
//   needed when creating this DOM tree
// The caller will need to attach the tab DOM somewhere
Classes.TabViewer = Classes.Viewer.subclass({

	_headingElem: null,
	// The heading of a tab is a <li><a></a></li>, so the heading element
	// is the <li> element, but the trigger element (where bootstrap javascript
	// actions can be taken) is the <a> element.
	_triggerElem: null,

	// A tab has two "peers", a heading and a body, but since Viewer assumes that
	// every viewer has a _rootElem, let's make the body the _rootElem, that seems
	// to make sense given that most operations on a TabViewer will be done to its
	// body, almost nothing should ever happen to its header after initialization.
	_rootElem: null,

_init: function(tabLabelHtml) {
	// Overriding the parent class' _init(), but calling that original function first
	Classes.Viewer._init.apply(this, arguments);

	this._createTab(tabLabelHtml);
},

_createTab: function(tabLabelHtml) {
//	const headingId = this._id + "-heading";
	const headingId = this._id;
	const bodyId = this._id + "-body";

	// Heading for an unselected tab, use show() to select it
	// Note that we need the background color (bg-light), because otherwise unselected
	// tabs have transparent backgrounds, and that doesn't work at all with "fixed-top",
	// all kind of stuff will show up under them.
	const headingHtml = `
		<li class="nav-item bg-light" role="presentation">
			<a class="nav-link tm-nav-link" id="${headingId}" data-bs-toggle="tab" href="#${bodyId}" role="tab" aria-controls="${bodyId}" aria-selected="false">${tabLabelHtml}</a>
		</li>
	`;

	// The style "height: 100%" is needed to let the inner vertical scrollbars activate (otherwise a
	// scrollbar on an outer <div> will activate)
	const bodyHtml = `
		<div class="tab-pane fade tm-scrollable-bstab-body" id="${bodyId}" role="tabpanel" aria-labelledby="${headingId}">
		</div>
	`;

	this._headingElem = this._elementGen(headingHtml);
	this._triggerElem = this._headingElem.querySelector("#" + headingId);
	this._rootElem = this._elementGen(bodyHtml);
},

// The signature of the callback is function(event).
// The activated tab is in "event.target", and the deactivated tab
// in "event.relatedTarget".
addBsTabActivationStartListener: function(fn) {
	// We're attaching to "show.bs.tab", which is the event generated at
	// tab switch, but before the new tab panel has been rendered
	// Ses https://getbootstrap.com/docs/5.0/components/navs-tabs/#events
	this._triggerElem.addEventListener("show.bs.tab", fn);
},

addBsTabActivationEndListener: function(fn) {
	// We're attaching to "shown.bs.tab", which is the event generated at
	// the end of the tab switch, after the new tab panel has been rendered
	// Ses https://getbootstrap.com/docs/5.0/components/navs-tabs/#events
	this._triggerElem.addEventListener("shown.bs.tab", fn);
},

// The signature of the callback is function(event).
// The deactivated tab is in "event.target", and the activated tab
// in "event.relatedTarget".
addBsTabDeactivationStartListener: function(fn) {
	// We're attaching to "hide.bs.tab", which is the event generated at
	// tab switch, but before the tab switch has happened.
	// Ses https://getbootstrap.com/docs/5.0/components/navs-tabs/#events
	this._triggerElem.addEventListener("hide.bs.tab", fn);
},

// The signature of the callback is function(event).
// The deactivated tab is in "event.target", and the activated tab
// in "event.relatedTarget".
addBsTabDeactivationEndListener: function(fn) {
	// We're attaching to "hidden.bs.tab", which is the event generated at
	// tab switch, after the tab switch has happened.
	// Ses https://getbootstrap.com/docs/5.0/components/navs-tabs/#events
	this._triggerElem.addEventListener("hidden.bs.tab", fn);
},

// Activate tab
activate: function() {
	const logHead = "TabViewer::activate(): ";
	this._log(logHead + "entering");
	// See https://getbootstrap.com/docs/5.0/components/navs-tabs/
	let tab = new bootstrap.Tab(this._triggerElem);
	tab.show();
},

isTabActive: function() {
	// bootstrap.Tab doesn't have this function, so we need to look at the
	// classes in the trigger element
	return this._triggerElem.classList.contains("active");
},

getHeadingElement: function() {
	return this._headingElem;
},

OLDblink: function() {
	this._triggerElem.classList.add("tm-blink");
	// The animation should last 300ms, so we can safely remove the class after 400ms
	setTimeout(this._removeBlinkCb.bind(this), 400);
},

blink: function() {
	// Hmmm... OLDblink() seems to be working more seamlessly than this one...
	// Maybe if the blink is very repetitive, the add/remove listener business
	// causes this one to be too slow? Or maybe multiple calls make the listener
	// disappear when there's a pending animation? (the remove of the previous
	// fires after the next has been started). Not sure...
	this.runAnimation("tm-blink", this._triggerElem);
//	// The animation should last 300ms, so we can safely remove the class after 400ms
//	setTimeout(this._removeBlinkCb.bind(this), 400);
},

_removeBlinkCb: function() {
	this._triggerElem.classList.remove("tm-blink");
},

}); // Classes.TabViewer

// CLASS SearchableTabViewer
//
// Subclasses must override:
// - _respondToEnterKey() to define their expected behavior for "Enter" when in search mode.
// - _searchBoxProcessData()
Classes.SearchableTabViewer = Classes.TabViewer.subclass({

	_searchBoxElem: null,
	_searchBoxCountElem: null,

	// Boolean tracking if we're in search mode or not
	_searchActive: null,

	// The this._bodyElem.scrollTop in standard view, stored when switching to search view
	// so we can put the user back where she was once she's done searching
	_standardViewScrollTop: null,

	// This class uses separate root and body elements (unlike TabViewer). See Classes.Viewer
	// for details.
	_bodyElem: null,

	// _activateSearchCb() needs to be added and removed as an event listener depending on whether
	// or not the searchable bstab is active (see _bsTabActivatedCb()/_bsTabDeactivatedCb()).
	// Since removeEventListener() relies on the call info to be the same as addEventListener(),
	// we can't call each with "this._activateSearchCb.bind(this)", because each call to bind()
	// generates a different function pointer. We need to store the same bound function pointer
	// to have it at all time.
	_activateSearchCbBoundFn: null,

_init: function(tabLabelHtml) {
	// Overriding the parent class' _init(), but calling that original function first
	Classes.TabViewer._init.apply(this, arguments);

	// See _activateSearchCbBoundFn above for details
	this._activateSearchCbBoundFn = this._activateSearchCb.bind(this);

	this._SearchableTabViewer_initBodyElem();

	// Call this after rendering because it expects the _bodyElem to exist.
	// Don't call _activateSearchBox() (see _activateSearchBox() for details).
	this._SearchableTabViewer_searchBoxInactiveInner();
	// Classes.TabViewer starts all Bootstrap tabs as inactive, so we don't need to
	// explicitly call _bsTabActivatedCb(), the event will fire when the tab gets
	// activated for the first time
},

_searchBoxProcessData: function(value) {
	// Subclass this function to get notified when the search box input value changes,
	// if your subclass cares.
	// We're not putting the standard this._errorMustSubclass() because it's possible
	// for a subclass to not care about individual changes. If they only want to act
	// on the final result, they should only override _respondToEnterKey().
},

_SearchableTabViewer_initBodyElem: function() {
	//const logHead = "SearchableTabViewer::_SearchableTabViewer_setBodyElem(): ";

	// Note that the DOM ID 'this._id + "-body"' has already been used in the parent
	// class TabViewer to create the outer <div> that's currently _rootElem, so we
	// need to use something else
	const bodyId = this._id + "-body-inner";
	const searchBoxId = this._id + "-searchbox";
	const searchBoxCountId = this._id + "-searchbox-count";

	// The search box is hidden by default, and becomes visible when the user presses
	// a keystroke.
	// Make sure to use input type "search", so you get the "x" to empty the text.
	// The "incremental" attribute causes triggering of "search" events as the user
	// types more in the search box. For more, see addSearchEventListener().
	// See https://developer.mozilla.org/en-US/docs/Web/HTML/Element/Input#attr-incremental
	//
	// Note that it would be nice to insert the search icon with a "::before" pseudo-element,
	// but apparently that can't be done for <input>. See https://stackoverflow.com/questions/4574912/css-content-generation-before-or-after-input-elements

	// Note that the element with bodyId takes "overflow: auto" to avoid the parent gets it instead
	const bodyHtml = `
		<div class="m-1 tm-stacked-below tm-hide">
			<input type="search" id="${searchBoxId}" incremental class="form-control tm-searchbox" placeholder="Type to start searching">
			<div class="tm-overlay tm-vertical-center tm-searchbox-icon">${icons.searchBox}</div>
			<div class="tm-overlay tm-vertical-center tm-searchbox-count">
				<span id="${searchBoxCountId}" class="tm-shaded badge tm-number-badge bg-secondary"></span>
			</div>
		</div>

		<div class="tm-fit-bottom" id="${bodyId}" style="overflow: auto;">
		</div>
	`;

	this.setHtml(bodyHtml);
	this._searchBoxElem = this.getElementById(searchBoxId);
	this._searchBoxCountElem = this.getElementById(searchBoxCountId);

	// "input" and "search" events are relatively equivalent with the "incremental" attribute
	// set for <input>. The main difference is that "search" triggers the event with some delay,
	// so you can potentially capture multiple characters in a single TabsTabViewer._queryAndRenderTabs()
	// cycle, reducing the amount of processing needed.
	// The delay is noticeable (about 500ms), but doesn't seem to interfere with UX, so for now
	// let's use the more efficient event. (but definitely never use both, otherwise you'll get
	// duplications).
//	this._searchBoxElem.addEventListener("input", this._searchBoxInputListenerCb.bind(this), true);
	this.addSearchEventListener(this._searchBoxInputListenerCb.bind(this));

	// Set the new body element
	this._bodyElem = this.getElementById(bodyId);

	// Note that we need to attach to the end of the tab activation, because the
	// _bsTabActivatedCb() call needs to set focus on the search box, and if you attach
	// to the start of the tab activation, that focus gets lost again as part of the
	// activation process
	this.addBsTabActivationEndListener(this._bsTabActivatedCb.bind(this));
	this.addBsTabDeactivationEndListener(this._bsTabDeactivatedCb.bind(this));
},

_bsTabActivatedCb: function(ev) {
	const logHead = "SearchableTabViewer::_bsTabActivatedCb(): ";
	this._log(logHead + "searchable tab activated");

	// We're setting the listener very broadly to "window" instead of putting a more
	// restricted scope, because we want the search to activate regardless of where
	// the focus might currently be.
	// Note the choice of "keydown" instead of "keyup" to get a chance to capture the
	// text from "CTRL+V". See _activateSearchCb() for details.
	//
	// See _activateSearchCbBoundFn above for details on this._activateSearchCbBoundFn here.
	window.addEventListener("keydown", this._activateSearchCbBoundFn, true);
	if(this._searchActive) {
		this._searchBoxElem.focus();
	}
},

_bsTabDeactivatedCb: function(ev) {
	const logHead = "SearchableTabViewer::_bsTabDeactivatedCb(): ";
	this._log(logHead + "searchable tab deactivated");

	// See _activateSearchCbBoundFn above for details on this._activateSearchCbBoundFn here.
	window.removeEventListener("keydown", this._activateSearchCbBoundFn, true);
},

// See _activateSearchBox() and _init() for why we split this call out of
// _activateSearchBox().
_SearchableTabViewer_searchBoxInactiveInner: function() {
	const logHead = "SearchableTabViewer::_SearchableTabViewer_searchBoxInactiveInner(): ";
	this._searchBoxElem.parentElement.classList.add("tm-hide");
	this._bodyElem.classList.remove("tm-fit-after-search");
	this._searchActive = false;

	// Restore the scrolling position as it was before the user started searching
	this._log(logHead + "about to call scrollTo(0, " + this._standardViewScrollTop + ")");
	this._bodyElem.scrollTo(0, this._standardViewScrollTop);
},

// DO NOT CALL THIS FUNCTION DURING _init() of this class. Use _SearchableTabViewer_searchBoxInactiveInner()
// instead, to avoid causing subclass overrides to be called before the subclass has
// even been initialized.
//
// "active" is optional, default "true". When "false", deactivate the search box.
// Override this function if you need to track activation, but make sure to call
// this class-specific method too.
_activateSearchBox: function(active) {
	active = optionalWithDefault(active, true);

	if(active) {
		// First, we want to store the scroll position of the standard view so we can
		// esume it after the search
		this._standardViewScrollTop = this._bodyElem.scrollTop;

		// When the searchbox appears, the "position:absolute;" (class .tm-fit-bottom)
		// body needs to be shifted down to make sure it doesn't end up under the
		// searchbox, that's what class .tm-fit-after-search is for.
		this._searchBoxElem.parentElement.classList.remove("tm-hide");
		this._bodyElem.classList.add("tm-fit-after-search");
		this._searchActive = true;
		this._searchBoxElem.focus();
	} else {
		this._SearchableTabViewer_searchBoxInactiveInner();
	}
},

_respondToEnterKey: function(searchBoxText) {
	this._errorMustSubclass("SearchableTabViewer::_respondToEnterKey(): ");
},

_modifierToString: function(ev) {
	if(ev.altKey) {
		return "Alt";
	}

	if(ev.ctrlKey) {
		return "Control";
	}

	if(ev.metaKey) {
		// See https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/metaKey
		return "Meta";
	}

	return null;
},

_isPasteKeyboardShortcut(ev, modifier) {
	// "Control" for Windows, "Meta" for Mac
	return ((modifier == "Control" || modifier == "Meta") && ev.key == "v");
},

// This function track keypresses in two cases
// - When search is not active, activate search with any key except "special keys" (Enter,
//   backspace, control, alt, etc.).
// - When search is active, use "Enter" to trigger a "click" on the first tile in the
//   search results.
_activateSearchCb: function(ev) {
	const logHead = "SearchableTabViewer::_activateSearchCb(key = " + ev.key + "): ";

	if (ev.defaultPrevented) {
		// See https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/key
		this._log(logHead + "defaultPrevented == true, event already processed");
		return; // Do nothing if the event was already processed
	}

	if(this._searchActive) {
		// We're already in search mode, we only need to monitor for "Enter".
		// _searchBoxInputListenerCb() is responsible to get out of search mode.
		if(ev.key == "Enter") {
			this._respondToEnterKey(this._searchBoxElem.value);
		}
		return;
	}

	// Use "key", not "code", if you want the keyboard layout and the modifiers
	// (SHIFT, CTRL, ALT, etc.) to be pre-processed into the event.

	// There are a lot of non-printable keys returned by browser. See here for
	// a likely complete sample: https://www.aarongreenlee.com/blog/list-of-non-printable-keys-for-keyboard-events-when-using-event-key/
	// On the other hand, it seems that all printable characters should be a single
	// character in length... let's see if we find exceptions to this rule.
	if(ev.key.length > 1) {
		this._log(logHead + "ignoring key");
		return;
	}

	let modifier = this._modifierToString(ev);
	if(modifier != null) {
		if(this._isPasteKeyboardShortcut(ev, modifier)) {
			this._log(logHead + "identified 'paste' shortcut");
			// The user pressed combo is CTRL+V. In this case we just continue processing, as
			// we want to capture the text being pasted into the searchbox input
		} else {
			// If one of these modifiers are pressed, the current keypress won't make
			// it to the searchbox
			this._log(logHead + "ignoring key with key modifier " + modifier + " active");
			return;
		}
	}

	this._log(logHead + "starting search");

	this._activateSearchBox();

	// Don't cancel the default action, we do want the character to land in the
	// search box too.
	//event.preventDefault();
},

_searchBoxInputListenerCb: function(ev) {
	const logHead = "SearchableTabViewer::_searchBoxInputListenerCb(value: \"" +
					ev.target.value + "\", " + "time: " + Date.now() + "): ";

	this._log(logHead + "searchbox changed");
	if(ev.target.value == "") {
		// The search box is now empty, need to get out of search mode.
		// When we enter search mode, the search box is always already populated
		// by at least one character, so there's no ambiguity here.
		this._activateSearchBox(false);
		return;
	}

	this._searchBoxProcessData(ev.target.value);
},

// If "cnt" is omitted, the function writes some basic text to provide feedback
_setSearchBoxCount: function(cnt) {
	if(cnt == null) {
		this._searchBoxCountElem.innerHTML = "Searching...";
	} else {
		this._searchBoxCountElem.textContent = (cnt < 10000) ? cnt : "9999+";
	}
},

// "flag" defaults "true" (start blinking)
_setSearchBoxCountBlinking: function(flag) {
	flag = optionalWithDefault(flag, true);
	const logHead = "SearchableTabViewer::_setSearchBoxCountBlinking(" + flag + "): ";
	this._log(logHead + "entering");
	if(flag) {
		// Leave the old count, but start blinking to indicate there's activity
		// in progress
		//this._searchBoxCountElem.innerHTML = "&nbsp;?&nbsp;";
		this._searchBoxCountElem.classList.add("tm-blink-loop");
	} else {
		this._searchBoxCountElem.classList.remove("tm-blink-loop");
	}
},

isSearchActive: function() {
	return this._searchActive;
},

getSearchQuery: function() {
	if(!this.isSearchActive()) {
		return null;
	}

	return this._searchBoxElem.value;
},

// You should not need to register explicitly for the "search" event, the
// overriding _searchBoxProcessData() should be sufficient.
addSearchEventListener: function(fn) {
	// See https://developer.mozilla.org/en-US/docs/Web/API/HTMLInputElement/search_event
	// Note that the search box <input> has the "incremental" attribute, and
	// therefore this callback will be invoked when the user presses "Enter",
	// when the user empties the search box with the "x" button, or when the
	// user incrementally types in more data.
	this._searchBoxElem.addEventListener("search", fn, true);
},

}); // Classes.SearchableTabViewer
