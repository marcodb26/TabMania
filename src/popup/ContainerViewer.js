// CLASS ContainerViewer
//
// The problem with this class is that the container counts the number of .append() calls
// made, but nobody calls the container to update it when they detach from its DOM subtree
// Viewers calling .detach() interact directly with the DOM, and ContainerViewer is
// completely unaware. It's impossible to keep in sync if we allow Viewers to work
// directly with the DOM, but we want to allow that.
// So with the ContainerViewer going out of sync so easily, the only times the "Empty" message
// is really accurate is before the first .append(), and after .clear().
// That's good enough for the tiles view (given the continuous full re-query/re-render
// cycles), but doesn't work for something more dynamic like the custom group cards.
// Worked around the issue forcing calls to clear() in the container when it's supposed to be
// empty (the container doesn't know, but SettingsBsTabViewer does).
//
Classes.ContainerViewer = Classes.Viewer.subclass({
	__idPrefix: "ContainerViewer",

	// This is a raw container, using only the _rootElem, no need for a _bodyElem
	_rootElem: null,

	_htmlWhenEmpty: null,
	_appendedCnt: null,

// "htmlWhenEmpty" is the HTML to display in the container if it contains no objects.
// If "null", the container will not show any HTML.
_init: function(htmlWhenEmpty="") {
	// Overriding the parent class' _init(), but calling that original function first
	Classes.Viewer._init.apply(this, arguments);
	const logHead = "ContainerViewer::_init(): ";
	this._htmlWhenEmpty = htmlWhenEmpty;

	this._containerViewerRender();
},

_containerViewerRender: function() {
	const logHead = "ContainerViewer::_containerViewerRender(): ";

	const bodyHtml = `
	<div id="${this._id}">
	</div>
	`;

	this._setRootElem(this._elementGen(bodyHtml));

	this._renderEmptyContainer();
},

_renderEmptyContainer: function() {
	//const html = `
	//<div class="tm-vertical-center tm-horizontal-center">
	//	<span>${this._htmlWhenEmpty}</span>
	//</div>
	//`;
	const html = `
	<div class="tm-all-center text-center">
		<span>${this._htmlWhenEmpty}</span>
	</div>
	`;

	this._appendedCnt = 0;
	this.setHtml(html);
},

// Override Viewer.append()
append: function(viewer) {
	if(this._appendedCnt == 0) {
		// The container is rendering the empty view, we need to first clear that
		this._getBodyElem().textContent = "";
	}
	this._appendedCnt++;
	Classes.Viewer.append.apply(this, arguments);
},

// Moves viewer as first child of the container. This function assumes that "viewer"
// is already in the container, so the container is not empty, and the container's
// this._appendedCnt must not change. If these two conditions were not true, we'd
// need to take more actions...
moveToTop: function(viewer) {
	// I guess I created moveToTop() just because I needed a place for the comment above it...
	this.prepend(viewer);
},

// Override Viewer.clear() as we need a different behavior here
clear: function() {
	// When we clear(), we don't really clear, we replace the contents with the empty view
	this._renderEmptyContainer();
}

}); // Classes.ContainerViewer


// CLASS CollapsibleContainerViewer
Classes.CollapsibleContainerViewer = Classes.ContainerViewer.subclass({
	__idPrefix: "CollapsibleContainerViewer",

	// A CollapsibleContainerViewer needs both the _rootElem, and the _bodyElem
	_rootElem: null,
	_bodyElem: null,

	_headingElem: null,
	_headingOuterElem: null,

	_selectElem: null,
	_selectMode: null,

	_options: null,

// "options" is a set of rendering options, currently it includes:
// - "startExpanded", determines whether the container is created collapsed or expanded
//   (default "false")
// - "htmlWhenEmpty", see ContainerViewer._init() for this (default "")
// - "border", a flag describing whether or not the container should have a border
//   and some margins (default "true")
// - "incognitoStyle", standard rendering or incognito rendering (default "false")
// - "selectable", when "true", add a select checkbox to the left of the accordion button
//   (default "false")
_init: function(options) {
//	this.debug();

	// Don't store "options" as-is, create a copy (and while you're doing it, initialize all
	// the fields you need)
	options = optionalWithDefault(options, {});
	this._options = {};
	this._options.startExpanded = options.startExpanded ?? false;
	this._options.htmlWhenEmpty = options.htmlWhenEmpty ?? "";
	this._options.border = options.border ?? true;
	this._options.bodyExtraClasses = [].concat(options.bodyExtraClasses ?? []);
	this._options.incognitoStyle = options.incognitoStyle ?? false;
	this._options.selectable = options.selectable ?? false;

	// Overriding the parent class' _init(), but calling that original function first
	Classes.ContainerViewer._init.call(this, this._options.htmlWhenEmpty);

	this._renderHeadingAndBody();

	// Call setSelectMode() after _renderHeadingAndBody(), because setSelectMode() needs the
	// _selectElem to be initialized
	this.setSelectMode(false);
},

_renderHeadingAndBody: function() {
	const logHead = "CollapsibleContainerViewer::_renderHeadingAndBody(): ";

	const headingOuterId = this._id + "-heading-outer";
	const headingId = this._id + "-heading";
	const bodyOuterId = this._id + "-body-outer";
	const bodyId = this._id + "-body";
	const selectId = this._id + "-select";

	this._rootElem.classList.add("accordion");

	let headingExtraClasses = [];
	let headingOuterExtraClasses = [];
	let bodyOuterExtraClasses = [];

	if(this._options.border) {
		// This class just seems to add a border to the accordion body.
		// Strange name for that
		bodyOuterExtraClasses.push("accordion-collapse");
	}

	if(this._options.startExpanded) {
		bodyOuterExtraClasses.push("show");
	} else {
		headingExtraClasses.push("collapsed");
	}

	if(this._options.incognitoStyle) {
		headingExtraClasses.push("tm-accordion-button-incognito");
		headingOuterExtraClasses.push("border-dark");
	}

	// The select checkbox is currently needed only by TilesGroupViewer, but we are
	// forced to put it in the parent class because it can't be added inside the
	// accordion button. If you add inside the accordion button, the "click" event
	// triggered by the checkbox click will cause collapse/expand, which is undesirable.
	// For whatever reason, the collapse/expand event from the Bootstrap accordion
	// fires before the "click" event in direct listeners of the checkbox, so doing
	// event.stopPropagation() has no effect. We tried to register the event listener
	// in the checkbox (TilesGroupViewer._selectClickedCb()) as bubbling or capturing
	// (third parameter of addEventListener() set to "true"), but Bootstrap fires the
	// synthetic collapse/expand event 200ms before we get the "click". We tried to
	// register to "mouseup" and "pointerup", but event.stopPropagation() in those
	// has no effect (I wasn't sure Bootstrap listens to those events instead of the
	// "click" event, given the amount of time that passes between the collapse/expand
	// event, and when we get "click").
	// Anyway, rendering the checkbox outside the button makes more sense in general,
	// though the side effect is that the area above and below the checkbox is not
	// part of the accordion button, and so it won't trigger a collapse/expand.
	let selectHtml = "";
	if(this.isSelectable()) {
		// Without fixing the font-size to "1rem" (class .fs-6), the checkbox is
		// disproportionately larger than the checkboxes in each tile (that is,
		// "1em" is bigger than "1rem" unless forced to "1rem"(?))
		selectHtml = `<input id="${selectId}" class="form-check-input fs-6 mt-0 ms-1 d-none" type="checkbox" value="" style="min-width: 1em;">`
	}

	// See TabTileViewer._renderEmptyTile() for the reasons why we need to add "min-width: 0;"
	// to the <button> style (hint: fit .d-flex size)
	const headingHtml = `
		<h2 class="d-flex align-items-center accordion-header tm-accordion-header ${headingOuterExtraClasses.join(" ")}" id="${headingOuterId}">
			${selectHtml}
			<button id=${headingId} class="accordion-button tm-accordion-button ${headingExtraClasses.join(" ")} p-2"
						type="button" data-bs-toggle="collapse" data-bs-target="#${bodyOuterId}" aria-expanded="true" aria-controls="${bodyOuterId}" style="min-width: 0;">
			</button>
		</h2>
	`;

	// The body of an accordion should be:
	// <div id="${bodyId}" class="tm-indent-right accordion-body">
	// However, "accordion-body" seems to just be indentation, and overrides my desired indentation,
	// so I got rid of it.
	// "tm-min-empty-container" is needed to center properly the "_htmlWhenEmpty" text.
	// "this._id" is used as the HTML ID of the _rootElem, as initialized by the parent
	// class ContainerViewer.
	const bodyHtml = `
		<div id="${bodyOuterId}" class="collapse tm-min-empty-container ${bodyOuterExtraClasses.join(" ")}" aria-labelledby="${headingOuterId}" data-bs-parent="#${this._id}">
			<div id="${bodyId}" class="${this._options.bodyExtraClasses.join(" ")}">
			</div>
		</div>
	`;

	const outerHtml = `
		<div class="accordion-item">
			${headingHtml}
			${bodyHtml}
		</div>
	`;

	// Note that starting from the end of this function, setHtml() will render
	// inside the _bodyElem of the container, but right now _bodyElem is still null.
	this.setHtml(outerHtml);
	this._headingElem = this.getElementById(headingId);
	this._headingOuterElem = this.getElementById(headingOuterId);
	this._bodyElem = this.getElementById(bodyId);

	// For a container, we want the parent element of each contained object to allow
	// referencing back to the container itself. The _rootElem is already referencing back,
	// but the _rootElem is not the parent of the contained objects for this subclass.
	this._mapElement(this._bodyElem);

	if(this.isSelectable()) {
		this._selectElem = this.getElementById(selectId);
	} else {
		this._selectElem = null;
	}

	// Since we've overwritten the original DOM of our parent class, let's reset it
	// into the new _bodyElem.
	this._renderEmptyContainer();
},

setHeadingHtml: function(html) {
	this._headingElem.innerHTML = html;
},

removeHeadingClasses: function(...args) {
	this._headingElem.classList.remove(...args);
},

addHeadingClasses: function(...args) {
	this._headingElem.classList.add(...args);
},

addHeadingOuterClasses: function(...args) {
	this._headingOuterElem.classList.add(...args);
},

// The signature of the callback is function(event).
// Note that the event happens on the parent of _bodyElem, so watch out.
addCollapsedStartListener: function(fn) {
	// We're attaching to "hide.bs.collapse", which is the event generated at
	// the start of the container collapse action, but before the animations
	// have completed
	this._bodyElem.parentElement.addEventListener("hide.bs.collapse", fn);
},

// The signature of the callback is function(event).
// Note that the event happens on the parent of _bodyElem, so watch out.
addExpandedStartListener: function(fn) {
	// We're attaching to "show.bs.collapse", which is the event generated at
	// the start of the container expand action, but before the animations
	// have completed
	this._bodyElem.parentElement.addEventListener("show.bs.collapse", fn);
},

isSelectable: function() {
	return this._options.selectable;
},

setSelectMode: function(flag=true) {
	if(!this.isSelectable()) {
		return;
	}

	// Use "===" because during initialization this function gets called while this._selectMode = null
	if(this._selectMode === flag) {
		// Nothing to do
		return;
	}

	this._selectMode = flag;
	this._selectElem.classList[flag ? "remove" : "add"]("d-none");

	// Reset the select checked value to "unselected"
	this._selectElem.checked = false;
},

}); // Classes.CollapsibleContainerViewer
