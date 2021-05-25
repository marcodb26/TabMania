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

// Just useful for debugging
getClasses: function() {
	return Array.from(this._rootElem.classList);
},

addBodyClasses: function(...args) {
	if(this._bodyElem != null) {
		this._bodyElem.classList.add(...args);
	}
},

removeBodyClasses: function(...args) {
	if(this._bodyElem != null) {
		this._bodyElem.classList.remove(...args);
	}
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

// This is "append inside me", and expects a viewer, not a DOM element
append: function(viewer) {
	this._getBodyElem().append(viewer.getRootElement());
},

// This is "prepend inside me", and expects a viewer, not a DOM element
prepend: function(viewer) {
	this._getBodyElem().prepend(viewer.getRootElement());
},

// This is "add to my parent before me". Add current viewer as sibling before "viewer"
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
attachInParentElement: function(parentDomElem) {
	parentDomElem.textContent = "";
	this.appendInParentElement(parentDomElem);
},

// This function is needed to interact with the non-Viewer world of raw elements.
// "append" leaves whatever other children the parent element might already have.
appendInParentElement: function(parentDomElem) {
	parentDomElem.append(this._rootElem);
},

// This function is needed to interact with the non-Viewer world of raw elements.
// "prepend" leaves whatever other children the parent element might already have.
prependInParentElement: function(parentDomElem) {
	parentDomElem.prepend(this._rootElem);
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
	this._rootElem.classList.remove("d-none");
},

hide: function() {
	this._rootElem.classList.add("d-none");
},

isInDocumentDom: function() {
	if(this._rootElem.id == null) {
		// If we don't have an ID, we can't check
		return null;
	}
	return (document.getElementById(this._rootElem.id) != null);
},

// Is the element currently at least partially visible on the screen, or is it scrolled
// out of view?
isInViewport: function() {
//	const logHead = "Viewer::isInViewport(" + window.innerHeight + "): ";
    let clientRect = this._rootElem.getBoundingClientRect();
//	this._log(logHead + "in DOM: " + this.isInDocumentDom() + ", clientRect = ", clientRect.top, clientRect.bottom);

    // Return "true" if the element is at least partially in the viewport
    return (clientRect.top < window.innerHeight && clientRect.bottom >= 0);
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
// element will be added to the DOM when calling append() or attach/appendInParentElement().
_init: function(html) {
	// Overriding the parent class' _init(), but calling that original function first
	Classes.Viewer._init.call(this);

	this._rootElem = this._elementGen(html);
},

}); // Classes.HtmlViewer


// CLASS ButtonViewer
//
// This class is not abstract. Subclasses need to override onButtonClickCb(), but
// callers of Classes.ButtonViewer.create() might as well just assign a function
// value to onButtonClickCb.
Classes.ButtonViewer = Classes.HtmlViewer.subclass({
	__idPrefix: "btn",

	_buttonElem: null,
	_options: null,

_init: function(options) {
	// Don't store "options" as-is, create a copy (and while you're doing it, initialize all
	// the fields you need)
	options = optionalWithDefault(options, {});
	this._options = {};
	this._options.labelHtml = optionalWithDefault(options.labelHtml, "");
	this._options.fullWidth = optionalWithDefault(options.fullWidth, false);
	this._options.btnExtraClasses = optionalWithDefault(options.btnExtraClasses, []);

	const logHead = "ButtonViewer::_init(): ";

	const buttonId = this._id + "-button";

	let fullWidthHtmlBefore = "";
	let fullWidthHtmlAfter = "";
	if(this._options.fullWidth) {
		fullWidthHtmlBefore = `<div class="d-grid gap-2">`;
		fullWidthHtmlAfter = `</div>`
	}

	// You could use "col-10 mx-auto" in the inner <div> or horiz margins in the outer <div>
	// to make the button a bit smaller but still centered.
	// Note that we must have the outer <div> because if we want to call .hide(), it tries to
	// set "display: none;", but fails on the inner <div> because "d-grid" is defined as
	// "display: grid!important;" and the "!important" would overrides "display: none;"
	const buttonHtml = `
	<div class="tm-btnbar-btn h-100">
		${fullWidthHtmlBefore}
			<a class="btn ${this._options.btnExtraClasses.join(" ")}" role="button"	id="${buttonId}">
				${this._options.labelHtml}
			</a>
		${fullWidthHtmlAfter}
	</div>
	`;

	// Overriding the parent class' _init(), but calling that original function first
	Classes.HtmlViewer._init.call(this, buttonHtml);
	this.debug();

	this._log(logHead, this);
	this._buttonElem = this.getElementById(buttonId);
	this._buttonElem.addEventListener("click", this._onButtonClickCbWrapper.bind(this), false);
},

_onButtonClickCbWrapper: function(ev) {
	this.onButtonClickCb(ev);
},

onButtonClickCb: function(ev) {
	// You can either subclass or assign a value to this function pointer
	// from the caller of the Classes.ButtonViewer.create()
	this._errorMustSubclass("ButtonViewer::onButtonClickCb()");
},

}); // Classes.ButtonViewer

// CLASS ImageViewer
//
Classes.ImageViewer = Classes.HtmlViewer.subclass({
	__idPrefix: "img",

	_options: null,

_init: function(options) {
	// Don't store "options" as-is, create a copy (and while you're doing it, initialize all
	// the fields you need)
	options = optionalWithDefault(options, {});
	this._options = {};
	this._options.src = optionalWithDefault(options.src, "");
	this._options.srcBackup = optionalWithDefault(options.srcBackup, "");
	this._options.extraClasses = optionalWithDefault(options.extraClasses, []);

	// If the network is known to be offline, let's not even bother using options.src,
	// and just use options.srcBackup instead, without waiting for a network error to
	// make the switch.
	// See https://developer.mozilla.org/en-US/docs/Web/API/NavigatorOnLine/onLine
	let imgSrc = window.navigator.onLine ? this._options.src : this._options.srcBackup;

	let imgHtml = `
	<img id="${this._id}" class="${this._options.extraClasses.join(" ")}" src="${imgSrc}">
	`;

	// Overriding the parent class' _init(), but calling that original function first
	Classes.HtmlViewer._init.call(this, imgHtml);
	this.debug();

	this.getRootElement().addEventListener("error", this._loadErrorCb.bind(this));
},

_loadErrorCb: function(ev) {
	const logHead = "ImageViewer::_loadErrorCb(): ";
	this._log(logHead, ev);

	if(ev.target.src != this._options.srcBackup) {
		this._log(logHead, "setting favIcon URL to " + this._options.srcBackup);
		ev.target.src = this._options.srcBackup;
	} else {
		// We need this check to avoid entering an infinite loop of failure / recovery / failure...
		this._log(logHead + "failure with backup URL, no other action to take");
	}
},

}); // Classes.ImageViewer