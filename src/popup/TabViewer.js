// CLASS Viewer
//
// This class should be considered abstract, because it leaves _rootElem null,
// so none of the actions defined here can be applied to an instance of this class.
// Use HtmlViewer for a non-abstract version of this basic class.
Classes.Viewer = Classes.Base.subclass({
	// Every viewer should have a root element, that can be used to attach the Viewer
	// as child of other Viewers to create a DOM (attached or not to the main
	// "window.document" DOM.
	_rootElem: null,

	// By default, the "_rootElem" is also the element used as parent for other Viewers
	// that should be attached to this Viewer. In many cases though that's not the
	// right structure, and between _rootElem and the attachment of child Viewers
	// there can be some elements that belong to this viewer's "frame"/structure.
	// When that's the case, "_bodyElem" should be non-null to identify the correct
	// attachment point for children. If a class has more than one attachment point,
	// pick one as the default (_bodyElem) or override all the methods that expect
	// to use a _bodyElem.
	// When a Viewer subclass gets instantiated, _bodYElem can remain null, and when
	// that's the case, _rootElem is assumed to play the role of attachment point
	// for children (see setHtml() and append() below).
	_bodyElem: null,

_init: function() {
	// Overriding the parent class' _init(), but calling that original function first
	Classes.Base._init.call(this);
},

// This function assumes the HTML has a single root element
_elementGen: function(html) {
	var tmpElem = document.createElement("div");
	tmpElem.innerHTML = html;
	return tmpElem.firstElementChild;
},

// Don't use this function as public interface. We have getBodyElement() for public interface.
_getBodyElem: function() {
	if(this._bodyElem != null) {
		return this._bodyElem;
	}

	if(this._rootElem != null) {
		return this._rootElem;
	}
	
	return null;
},

// Take "text" of unknown origin and clean it up to be used in HTML
_safeText: function(text) {
	var tmpElem = document.createElement("div");
	tmpElem.textContent = text;
	return tmpElem.innerHTML;
},

// Returns the element to be used by other Viewers to attach this Viewer as child.
// This is used by Classes.ContainerViewer to append a Classes.Viewer to a container.
getRootElement: function() {
	return this._rootElem;
},

// Returns the element to be used by this Viewer to attach another Viewer as child.
// This is used by Classes.ContainerViewer to append a Classes.Viewer to a container.
getBodyElement: function() {
	return this._getBodyElem();
},

// getElementById() is needed because sometimes the _rootElem might not be attached
// to the document DOM, so the corresponding document.getElementById() would not work.
getElementById: function(domId) {
	// "#" indicates a DOM ID in the query selector syntax
	// https://developer.mozilla.org/en-US/docs/Web/API/Document_object_model/Locating_DOM_elements_using_selectors
	return this._rootElem.querySelector("#" + domId);
},

addClasses: function(...args) {
	this._rootElem.classList.add(...args);
},

removeClasses: function(...args) {
	this._rootElem.classList.remove(...args);
},

// Overwrite the children of _bodyElem (or _rootElem if _bodyElem is null).
// If the "html" includes text you don't control, make sure to run that text
// through _safeText() to avoid HTML injections.
setHtml: function(html) {
	const logHead = "Viewer::setHtml(): ";

	var bodyElem = this._getBodyElem();

//	if(bodyElem == null) {
//		// If we get here, _rootElem is null (and _bodyElem too). That's an error
//		this._err(logHead + "no body or root element, can't take action");
//		return;
//	}

	try {
		bodyElem.innerHTML = html;
	} catch(e) {
		// In case bodyElem == null, just dump the error and continue
		this._err(logHead, e);
	}
},

// Call this function instead of setHtml() if you want to avoid HTML injection
// with unknown text.
setText: function(text) {
	const logHead = "Viewer::setText(): ";

	var bodyElem = this._getBodyElem();

	try {
		bodyElem.textContent = text;
	} catch(e) {
		// In case bodyElem == null, just dump the error and continue
		this._err(logHead, e);
	}
},

// This is "append to me", and expects a viewer, not a DOM element
append: function(viewer) {
	this._getBodyElem().append(viewer.getRootElement());
},

// Add current viewer as sibling before "viewer"
addBefore: function(viewer) {
	let parentNode = viewer.getRootElement().parentNode;
	this._assert(parentNode != null);

	// See https://developer.mozilla.org/en-US/docs/Web/API/Node/insertBefore
	parentNode.insertBefore(this._rootElem, viewer.getRootElement());
},

// Detaches the viewer from the DOM (if it was attached to it)
detach: function() {
	this.getRootElement().remove();
},

// This function is needed to interact with the non-Viewer world of raw elements.
// "attach" removes anything that might have been in the parent element.
attachToElement: function(parentDomElem) {
	parentDomElem.textContent = "";
	this.appendToElement(parentDomElem);
},

// This function is needed to interact with the non-Viewer world of raw elements.
// "append" leaves whatever other children the parent element might already have.
appendToElement: function(parentDomElem) {
	parentDomElem.append(this._rootElem);
},

// Remove all the children of _bodyElem (or _rootElem if _bodyElem is null)
clear: function() {
	const logHead = "Viewer::clear(): ";

	var bodyElem = this._getBodyElem();

	if(bodyElem == null) {
		// If we get here, _rootElem is null (and _bodyElem too). That's an error
		log._err(logHead + "no body or root element, can't take action");
		return;
	}

	bodyElem.textContent = "";	
},

show: function() {
	this._rootElem.classList.remove("tm-hide");
},

hide: function() {
	this._rootElem.classList.add("tm-hide");
},

// "elem" is optional, if not specified we use the root element
runAnimation: function(animClass, elem) {
	elem = optionalWithDefault(elem, this._rootElem);
	let resolveFn = null;

	let retVal = new Promise(
		function(resolve, reject) {
			resolveFn = resolve;
			// https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement/animationend_event
			elem.addEventListener("animationend", resolveFn);
		}.bind(this)
	).then(
		function() {
			// Clean up...
			elem.removeEventListener("animationend", resolveFn);
			elem.classList.remove(animClass);
		}.bind(this)
	);

	// Start the animation "animClass", the "animationend" callback will be
	// called when the animation ends
	elem.classList.add(animClass);

	return retVal;
},

}); // Classes.Viewer


// CLASS HtmlViewer
//
Classes.HtmlViewer = Classes.Viewer.subclass({
	_rootElem: null,

// "html" must have a single root element, otherwise only the first top level
// element will be added to the DOM when calling append() or attach/appendToElement().
_init: function(html) {
	// Overriding the parent class' _init(), but calling that original function first
	Classes.Viewer._init.call(this);

	this._rootElem = this._elementGen(html);
},

}); // Classes.HtmlViewer


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
		<div class="tab-pane fade" id="${bodyId}" style="height: 100%;" role="tabpanel" aria-labelledby="${headingId}">
		</div>
	`;

	this._headingElem = this._elementGen(headingHtml);
	this._triggerElem = this._headingElem.querySelector("#" + headingId);
	this._rootElem = this._elementGen(bodyHtml);
},

// The signature of the callback is function(event).
// The activated tab is in "event.target", and the deactivated tab
// in "event.relatedTarget".
addTabActivationStartListener: function(fn) {
	// We're attaching to "show.bs.tab", which is the event generated at
	// tab switch, but before the new tab panel has been rendered
	// Ses https://getbootstrap.com/docs/5.0/components/navs-tabs/#events
	this._triggerElem.addEventListener("show.bs.tab", fn);
},

addTabActivationEndListener: function(fn) {
	// We're attaching to "shown.bs.tab", which is the event generated at
	// the end of the tab switch, after the new tab panel has been rendered
	// Ses https://getbootstrap.com/docs/5.0/components/navs-tabs/#events
	this._triggerElem.addEventListener("shown.bs.tab", fn);
},

// The signature of the callback is function(event).
// The deactivated tab is in "event.target", and the activated tab
// in "event.relatedTarget".
addTabDeactivationStartListener: function(fn) {
	// We're attaching to "hide.bs.tab", which is the event generated at
	// tab switch, but before the tab switch has happened.
	// Ses https://getbootstrap.com/docs/5.0/components/navs-tabs/#events
	this._triggerElem.addEventListener("hide.bs.tab", fn);
},

// The signature of the callback is function(event).
// The deactivated tab is in "event.target", and the activated tab
// in "event.relatedTarget".
addTabDeactivationEndListener: function(fn) {
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

	// This class uses separate root and body elements (unlike TabViewer). See Classes.Viewer
	// for details.
	_bodyElem: null,

	// _activateSearchCb() needs to be added and removed as an event listener depending on whether
	// or not the searchable bstab is active (see _bstabActivatedCb()/_bstabDeactivatedCb()).
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
	// explicitly call _bstabActivatedCb(), the event will fire when the tab gets
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
//	const bodyHtml = `
//		<div class="tm-stacked-below tm-hide">
//			<input type="search" id="${searchBoxId}" incremental class="form-control tm-searchbox" placeholder="Type to start searching">
//			<div class="tm-overlay tm-vertical-center tm-searchbox-icon"><i class="fas fa-search"></i></div>
//			<div class="tm-overlay tm-vertical-center tm-searchbox-count">
//				<span id="${searchBoxCountId}" class="tm-shaded badge tm-number-badge bg-secondary"></span>
//			</div>
//		</div>
//
//		<div class="tm-scrollable-tab-body" id="${bodyId}">
//		</div>
//	`;

	const bodyHtml = `
		<div class="tm-stacked-below tm-hide">
			<input type="search" id="${searchBoxId}" incremental class="form-control tm-searchbox" placeholder="Type to start searching">
			<div class="tm-overlay tm-vertical-center tm-searchbox-icon">${icons.searchBox}</div>
			<div class="tm-overlay tm-vertical-center tm-searchbox-count">
				<span id="${searchBoxCountId}" class="tm-shaded badge tm-number-badge bg-secondary"></span>
			</div>
		</div>

		<div class="tm-scrollable-tab-body" id="${bodyId}">
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
	// _bstabActivatedCb() call needs to set focus on the search box, and if you attach
	// to the start of the tab activation, that focus gets lost again as part of the
	// activation process
	this.addTabActivationEndListener(this._bstabActivatedCb.bind(this));
	this.addTabDeactivationEndListener(this._bstabDeactivatedCb.bind(this));
},

_bstabActivatedCb: function(ev) {
	const logHead = "SearchableTabViewer::_bstabActivatedCb(): ";
	this._log(logHead + "searchable tab activated");

	// We're setting the listener very broadly to "window" instead of putting a more
	// restricted scope, because we want the search to activate regardless of where
	// the focus might currently be.
	// See _activateSearchCbBoundFn above for details on this._activateSearchCbBoundFn here.
	window.addEventListener("keydown", this._activateSearchCbBoundFn, true);
	if(this._searchActive) {
		this._searchBoxElem.focus();
	}
},

_bstabDeactivatedCb: function(ev) {
	const logHead = "SearchableTabViewer::_bstabDeactivatedCb(): ";
	this._log(logHead + "searchable tab deactivated");

	// See _activateSearchCbBoundFn above for details on this._activateSearchCbBoundFn here.
	window.removeEventListener("keydown", this._activateSearchCbBoundFn, true);
},

// See _activateSearchBox() and _init() for why we split this call out of
// _activateSearchBox().
_SearchableTabViewer_searchBoxInactiveInner: function() {
	this._searchBoxElem.parentElement.classList.add("tm-hide");
	this._searchActive = false;
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
		this._searchBoxElem.parentElement.classList.remove("tm-hide");
		this._searchActive = true;
		this._searchBoxElem.focus();
	} else {
		this._SearchableTabViewer_searchBoxInactiveInner();
	}
},

_respondToEnterKey: function(searchBoxText) {
	this._errorMustSubclass("SearchableTabViewer::_respondToEnterKey(): ");
},

// OLD, IGNORE (leaving it around in case I was wrong)
// Add here any keypresses you want to ignore when a search is not active.
// Note that you can't intercept "Escape", see https://www.zdnet.com/article/google-changes-how-the-escape-key-is-handled-in-chrome-to-fight-popup-ads/
_searchInactiveIgnoreKeys: new Set([
		"ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", "Backspace", "Enter"
]),

// This function track keypresses in two cases
// - When search is not active, activate search with any key except "this._searchInactiveIgnoreKeys".
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
//	if(this._searchInactiveIgnoreKeys.has(ev.key)) {

	// There are a lot of non-printable keys returned by browser. See here for
	// a likely complete sample: https://www.aarongreenlee.com/blog/list-of-non-printable-keys-for-keyboard-events-when-using-event-key/
	// On the other hand, it seems that all printable characters should be a single
	// character in length... let's see if we find exceptions to this rule.
	if(ev.key.length > 1) {
		this._log(logHead + "ignoring key");
		return;
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

_setSearchBoxCount: function(cnt) {
	this._searchBoxCountElem.textContent = (cnt < 1000) ? cnt : "999+";
},

isSearchActive: function() {
	return this._searchActive;
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
