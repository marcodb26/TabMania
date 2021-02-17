// CLASS SettingsItemViewer
//
Classes.SettingsItemViewer = Classes.HtmlViewer.subclass({
	__idPrefix: "SettingsItemViewer",

	_rootElem: null,
	// This class doesn't use a body element different from the _rootElem

	// _inputElem is the element that can receive the "disabled" attribute.
	// It needs to be set by the subclass
	_inputElem: null,

	// Functions to read and write the persistent state
	// _setFn(<value>), _getFn() returns <value>
	_setFn: null,
	_getFn: null,

	_rootHtml: `
		<div class="mx-2 mt-3">
		</div>
	`,

// Using ES6 destructuring syntax to help with the proliferation of optional parameters
// in the settings logic...
_init: function({ setFn, getFn, label }) {
	// Overriding the parent class' _init(), but calling that original function first
	Classes.HtmlViewer._init.call(this, this._rootHtml);
	this.debug();

	// Let's try to monitor for easy cut&paste errors... if you put a setFn()
	// where we should have a getFn(), you'll potentially cause loops of
	// notifications, with strange set(undefined).
	this._assert(setFn != getFn);
	this._setFn = setFn;
	this._getFn = getFn;

	this._label = label;
	this._enabled = true;

	this._startListeners();
},

// This function can be called in the _init() of the this class, because setValue()
// is robust in case _inputElem has not yet been initialized.
// The worst case is receiving an event before the _init() of the subclass has been
// completed, and therefore _inputElem is still null.
_startListeners: function() {
	// We listen for all updates, and trigger a refresh, even if the update
	// did not affect the exact property we're tracking. A bit crude, but
	// Settings updates should be rare, so being efficient is not a real
	// priority here.
	// The event should include "details.key" to identify at least the object
	// that was modified, so if needed, we could add logic to make this class
	// aware of the "key" we care about, but for now it seems ok to go broad.
	settingsStore.addEventListener(Classes.EventManager.Events.UPDATED, function(ev) {
		this.setValue(this._getFn());
	}.bind(this));
},

_setAttributesHtml: function(extraAttrs) {
	if(!this._enabled) {
		extraAttrs.push(`disabled`);
	}
},

setEnabled: function(flag) {
	this._enabled = flag;
	this._assert(this._inputElem != null);

	if(flag) {
		this._inputElem.removeAttribute("disabled");
	} else {
		this._inputElem.setAttribute("disabled", "");
	}
},

// Use this to update the value if syncing from a remote update
setValue: function(value) {
	value = optionalWithDefault(value, "");
	const logHead = "SettingsItemViewer::setValue(\"" + value + "\"): ";
	if(this._inputElem == null) {
		// See comment above _startListeners()
		this._log(logHead + "_inputElem not ready, nothing to do");
		return;
	}

	this._log(logHead + "setting value");
	this._inputElem.value = value;
},

setFocus: function() {
	this._inputElem.focus();
},

}); // Classes.SettingsItemViewer


// CLASS SettingsTextItemViewer
Classes.SettingsTextItemViewer = Classes.SettingsItemViewer.subclass({
	__idPrefix: "SettingsTextItemViewer",

	_placeholderText: null,
	_helpHtml: null,

	_inputElem: null,
	_helpElem: null,

	// Functions to read and write the persistent state
	// _setFn(<value>), _getFn() returns <value>
	_setFn: null,
	_getFn: null,

_init: function({ setFn, getFn, label, placeholderText, helpHtml }) {
	// Overriding the parent class' _init(), but calling that original function first
	Classes.SettingsItemViewer._init.apply(this, arguments);
	this.debug();

	this._placeholderText = this._safeText(placeholderText);
	this._helpHtml = helpHtml;

	this._renderTextItem();
},

// Override parent class
_setAttributesHtml: function(extraAttrs) {
	const currentText = this._getFn();
	if(currentText != null && currentText != "") {
		extraAttrs.push(`value="${this._safeText(currentText)}"`);
	}
	if(this._placeholderText != null && this._placeholderText != "") {
		extraAttrs.push(`placeholder="${this._placeholderText}"`);
	}

	// Finally call the parent class to make sure no extra attributes are lost
	Classes.SettingsItemViewer._setAttributesHtml.call(this, extraAttrs);
},

_renderTextItem: function() {
	const inputId = this._id + "input";
	const helpId = this._id + "help";

	let extraAttrs = [];
	this._setAttributesHtml(extraAttrs);

	// We're using type search just because we want to get the "x" to erase
	// the current text

//	const bodyHtml = `
//	<label for="${inputId}" class="form-label">${this._label}</label>
//  <input type="search" id="${inputId}" class="form-control text-truncate" ${extraAttrs.join(" ")}
//			aria-describedby="${helpId}">
//  <div id="${helpId}" class="form-text">${this._help}</div>
//	`;

	// Note that for "form-floating" to work, the <label> must be below the <input>
	// Also the documentation shows how the label should show up bigger if there's no
	// text, but that doesn't happen in this code (and we're ok with it anyway).
	// See https://getbootstrap.com/docs/5.0/forms/floating-labels/
	const bodyHtml = `
	<div class="form-floating">
		<input type="search" id="${inputId}" class="form-control text-truncate" ${extraAttrs.join(" ")}
				aria-describedby="${helpId}">
		<label for="${inputId}" class="form-label pt-2">${this._label}</label>
	</div>
    <div id="${helpId}" class="form-text ms-2">${this._helpHtml}</div>
	`;

	this.setHtml(bodyHtml);
	this._inputElem = this.getElementById(inputId);
	this._helpElem = this.getElementById(helpId);

	// Tried lots of combinations of these events, and found the combo that works
	// for the behavior I want.
	// The behavior I want is: you make changes, when you press Enter or lose focus,
	// the changes get saved; when you click the "x" to empty the text, nothing happens.
	// If you press Enter, the input should lose focus.
	//
	// - "search": search fires when you press "Enter", but also when you press the "x" button,
	//   but not when the input loses focus.
	//   This leaves you in an ambiguous situation if the input.value is empty: is it empty
	//   because you clicked "x", or because you pressed Enter while the box was empty?
	//   Besides that ambiguity, you get all you need in combination with the "blur" event.
	//   Another problem is that when you press Enter you should call blur() to lose focus,
	//   but that also triggers the "blur" event, so you have another ambiguity: am I getting
	//   "blur" due to a user action (that is, I need to save the data), or because of a
	//   blur() call inside the "search" handler (that is, I should not save the data again)?
	// - "input": input mostly behaves like search, except it fires for every character typed,
	//   which is not useful in my use case
	// - "change" fires when you press Enter or lose focus, but only if a change happened.
	//   On the one hand, this means the input is left alone when you press the "x" (until
	//   you either press Enter or lose focus. On the other hand, it means that if you
	//   press Enter but there's no change, you won't get an event, and therefore you can't
	//   blur() the element. "No event when there are no changes" is valuable, because it
	//   prevents you from generating unnecessary updates, but no event when you press Enter
	//   if there's no change, not good. Luckily you can combine this with a "keydown" event
	//   to monitor "Enter", and unconditionally trigger blur() when that happens (no blur()
	//   needed inside the "change" handler). This way when you press Enter you trigger a
	//   blur() which in turn triggers the "change" handler. This combo covers all the cases
	//   I needed to handle.
	//
	// For more madness, see here:
	// https://stackoverflow.com/questions/2977023/how-do-you-detect-the-clearing-of-a-search-html5-input
	// And specifically my own answer to the question describing this logic:
	// https://stackoverflow.com/questions/2977023/how-do-you-detect-the-clearing-of-a-search-html5-input/66079456#66079456
//	this._inputElem.addEventListener("input", this._onInputEventCb.bind(this), true);
//	this._inputElem.addEventListener("search", this._onSearchChangedCb.bind(this), true);
	// With "search", when the <input> loses focus, we want to save the value, and we need "blur"
//	this._inputElem.addEventListener("blur", this._onBlurCb.bind(this), true);
	this._inputElem.addEventListener("change", this._onInputChangedCb.bind(this), true);
	this._inputElem.addEventListener("keydown", this._onKeydownCb.bind(this), true);
},

// Note that the "change" event fires when the <input> loses focus, and this is enough for
// all cases, as it includes:
// - Switching from the "Settings" tab to the "Home" tab
// - Setting focus on a different window
// - Closing the popup by clicking the popup button
// All of these actions trigger a loss of focus for the <input>
// To that list, we add the "keydown" handler triggering a "blur" when the user presses
// Enter, and we have everything covered ("change" fires when the user presses Enter, but
// only if the input has changed, instead we need the blur() to happen on Enter unconditionally,
// even if it doesn't trigger "change" because there's nothing changed, so we need "keydown"
// because of the special case of "need to lose focus on Enter with no changes")
_onInputChangedCb: function(ev) {
	const logHead = "SettingsTextItemViewer::_onInputChangedCb(value: \"" + ev.target.value + "\"): ";
	this._log(logHead + "change event");

	this._setFn(ev.target.value);
},

_onKeydownCb: function(ev) {
	const logHead = "SettingsTextItemViewer::_onKeydownCb(value: \"" + ev.target.value + "\"): ";

	if(ev.key == "Enter") {
		this._log(logHead + "Enter pressed");
		this._inputElem.blur();
		ev.preventDefault();
	}
},

//_onSearchChangedCb: function(ev) {
//	const logHead = "SettingsTextItemViewer::_onSearchChangedCb(value: \"" + ev.target.value + "\"): ";
//	this._log(logHead + "search event");
//},

setInvalid: function(msgHtml) {
	msgHtml = optionalWithDefault(msgHtml, null);
	this._inputElem.classList.add("is-invalid");

	if(msgHtml != null) {
		this._helpElem.classList.add("tm-invalid-feedback");
		this._helpElem.innerHTML = msgHtml;
	}

	return delay(3000).then(
		function() {
			// Clean up
			this._inputElem.classList.remove("is-invalid");
			this._helpElem.classList.remove("tm-invalid-feedback");
			this._helpElem.innerHTML = this._helpHtml;
		}.bind(this)
	);
},

}); // Classes.SettingsTextItemViewer


// CLASS SettingsTextAreaItemViewer
Classes.SettingsTextAreaItemViewer = Classes.SettingsItemViewer.subclass({
	__idPrefix: "SettingsTextAreaItemViewer",

	_inputElem: null,

	// Functions to read and write the persistent state
	// _setFn(<value>), _getFn() returns <value>
	_setFn: null,
	_getFn: null,

_init: function({ setFn, getFn, label, placeholderText, helpHtml }) {
	// Overriding the parent class' _init(), but calling that original function first
	Classes.SettingsItemViewer._init.apply(this, arguments);
	this.debug();

	this._placeholderText = this._safeText(placeholderText);
	this._helpHtml = helpHtml;

	this._renderTextAreaItem();
},

// Override parent class
_setAttributesHtml: function(extraAttrs) {

	if(this._placeholder != null && this._placeholder != "") {
		extraAttrs.push(`placeholder="${this._placeholder}"`);
	}

	// Finally call the parent class to make sure no extra attributes are lost
	Classes.SettingsItemViewer._setAttributesHtml.call(this, extraAttrs);
},

_renderTextAreaItem: function() {
	const inputId = this._id + "input";
	const helpId = this._id + "help";

	let currentText = this._getFn();
	if(currentText == null) {
		currentText = "";
	}

	let extraAttrs = [];
	this._setAttributesHtml(extraAttrs);

	// From Chris Coyier's codepen: https://codepen.io/chriscoyier/pen/XWKEVLy
	// Codepen license is MIT: https://blog.codepen.io/documentation/licensing/
//	const bodyHtml = `
//	<label for="${inputId}" class="form-label">${this._label}</label>
//	<div class="tm-autosize" data-replicated-value="${this._safeText(currentText)}">
//		<textarea id="${inputId}" class="form-control" ${extraAttrs.join(" ")}
//				aria-describedby="${helpId}">${this._safeText(currentText)}</textarea>
//	</div>
//	<div id="${helpId}" class="form-text">${this._helpHtml}</div>
//	`;

	// The explicit style "height: auto;" is needed to override the calculated height
	// added by Bootstrap "form-floating". If you don't use "form-floating", you can
	// get rid of this "height".
	const bodyHtml = `
	<div class="tm-autosize form-floating" data-replicated-value="${this._safeText(currentText)}">
		<textarea id="${inputId}" class="form-control" ${extraAttrs.join(" ")} style="height: auto;"
				aria-describedby="${helpId}">${this._safeText(currentText)}</textarea>
		<label for="${inputId}" class="form-label pt-2">${this._label}</label>
	</div>
	<div id="${helpId}" class="form-text ms-2">${this._helpHtml}</div>
	`;

	this.setHtml(bodyHtml);
	this._inputElem = this.getElementById(inputId);

	this._inputElem.addEventListener("change", this._onInputChangedCb.bind(this), true);
	this._inputElem.addEventListener("input", this._onInputCb.bind(this), true);
},

// Note that the "change" event fires when the <input> loses focus, and this is enough for
// all cases, as it includes:
// - Switching from the "Settings" tab to the "Home" tab
// - Setting focus on a different window
// - Closing the popup by clicking the popup button
// All of these actions trigger a loss of focus for the <input>
_onInputChangedCb: function(ev) {
	const logHead = "SettingsTextAreaItemViewer::_onInputChangedCb(value: \"" + ev.target.value + "\"): ";
	this._log(logHead + "change event");

	this._setFn(ev.target.value);
},

_onInputCb: function(ev) {
	// From Chris Coyier's codepen: https://codepen.io/chriscoyier/pen/XWKEVLy
	// Codepen license is MIT: https://blog.codepen.io/documentation/licensing/
	ev.target.parentNode.dataset.replicatedValue = ev.target.value;
},

}); // Classes.SettingsTextAreaItemViewer


// CLASS SettingsCheckboxItemViewer
Classes.SettingsCheckboxItemViewer = Classes.SettingsItemViewer.subclass({
	__idPrefix: "SettingsCheckboxItemViewer",

	_inputElem: null,

	// Functions to read and write the persistent state
	// _setFn(<value>), _getFn() returns <value>
	_setFn: null,
	_getFn: null,

_init: function({ setFn, getFn, label }) {
	// Overriding the parent class' _init(), but calling that original function first
	Classes.SettingsItemViewer._init.apply(this, arguments);
	this.debug();

	this._renderCheckboxItem();
},

// Override parent class
_setAttributesHtml: function(extraAttrs) {
	const currentlyChecked = this._getFn();
	if(currentlyChecked != null && currentlyChecked == true) {
		extraAttrs.push(`checked`);
	}

	// Finally call the parent class to make sure no extra attributes are lost
	Classes.SettingsItemViewer._setAttributesHtml.call(this, extraAttrs);
},

_renderCheckboxItem: function() {
	const checkboxId = this._id + "checkbox";

	let extraAttrs = [];
	this._setAttributesHtml(extraAttrs);

	const bodyHtml = `
	<div class="form-check form-switch">
	  <input class="form-check-input" type="checkbox" id="${checkboxId}" ${extraAttrs}>
	  <label class="form-check-label" for="${checkboxId}">${this._label}</label>
	</div>
	`;

	this.setHtml(bodyHtml);
	this._inputElem = this.getElementById(checkboxId);

	this._inputElem.addEventListener("change", this._onInputChangedCb.bind(this), true);
},

_onInputChangedCb: function(ev) {
	const logHead = "SettingsCheckboxItemViewer::_onInputChangedCb(value: \"" + ev.target.checked + "\"): ";
	this._log(logHead + "change event", ev);

	this._setFn(ev.target.checked);
},

// Override from parent class
setValue: function(value) {
	if(this._inputElem == null) {
		// See comment above SettingsItemViewer::_startListeners()
		return;
	}

	value = optionalWithDefault(value, false);
	this._inputElem.checked = value;
},

}); // Classes.SettingsCheckboxItemViewer


// CLASS SettingsColorsItemViewer
//
// For now this class only generates a string of colored radio buttons, doesn't
// support any label or help string. We'll need to add label/help if we decide
// they're useful for the UI.
//
// This class generates events Classes.EventManager.Events.UPDATED, with "detail"
// set to { target: <this object>, color: <color name or "null"> }.
Classes.SettingsColorsItemViewer = Classes.SettingsItemViewer.subclass({
	__idPrefix: "SettingsColorsItemViewer",

	// Functions to read and write the persistent state
	// _setFn(<value>), _getFn() returns <value>
	_setFn: null,
	_getFn: null,

	_eventManager: null,

	_radioElemByColor: null,

_init: function({ setFn, getFn }) {
	// Overriding the parent class' _init(), but calling that original function first
	Classes.SettingsItemViewer._init.apply(this, arguments);
	this.debug();
	this.removeClasses("mt-3");

	this._eventManager = Classes.EventManager.create();
	this._eventManager.attachRegistrationFunctions(this);

	this._renderColorsItem();
},

// Override parent class
_setAttributesHtml: function(extraAttrs) {
	const currentlyChecked = this._getFn();
	if(currentlyChecked != null && currentlyChecked == true) {
		extraAttrs.push(`checked`);
	}

	// Finally call the parent class to make sure no extra attributes are lost
	Classes.SettingsItemViewer._setAttributesHtml.call(this, extraAttrs);
},

// An array of extra classes to be added to a radio button:
// index 0 is a class for background colot, index 1 is a class
// for color of the dot when a radio is checked (when not specified,
// the default from "form-check-input" will be used).
_colorData: {
	// "none" is the color we'll show when no color is set
	none: [ "bg-light", "tm-check-reversed" ],
	grey: [ "bg-secondary", "" ],
	blue: [ "bg-primary", "" ],
	red: [ "bg-danger", "" ],
	yellow: [ "bg-warning", "" ],
	green: [ "bg-success", "" ],
	cyan: [ "bg-info", "" ]
},

_colorNameToCss: function(colorName) {
	colorName = optionalWithDefault(colorName, "none");
	if(!(colorName in this._colorData)) {
		return null;
	}
	return this._colorData[colorName];
},

// "radioHtmlList" is an output parameter with the rendered HTML for the radio button.
// "radioIdList" is an output parameter, pass in an array, the function will push a
// color-to-ID mapping for this "color"
_colorToHtml: function(radioHtmlList, radioIdList, colorChecked, color) {
	const radioGroupId = this._id + "-radio";
	const id = this._id + "-" + color;

	const bgColor = this._colorNameToCss(color).join(" ");

	let extraAttrs = "";
	if(color == colorChecked) {
		extraAttrs = "checked";
	}
	if(color == "none" && colorChecked == null) {
		extraAttrs = "checked";
	}

	radioIdList.push([ id, color ]);

	radioHtmlList.push(
		`<input class="form-check-input ${bgColor}" type="radio" name="${radioGroupId}" id="${id}" value="" aria-label="${color}" ${extraAttrs}>`
	);
},

_renderColorsItem: function() {
	const colorChecked = this._getFn();

	this._radioElemByColor = [];

	let extraAttrs = [];
	this._setAttributesHtml(extraAttrs);

	let radioHtmlList = [];
	let radioIdList = [];
	let colorList = Object.keys(this._colorData);
	// Make sure the attribute "name" is the same for all, otherwise the selection
	// won't be mutually exclusive
	colorList.forEach(this._colorToHtml.bind(this, radioHtmlList, radioIdList, colorChecked));
	
	// Remove class "form-check" to use radio buttons without labels
	const bodyHtml = `
	<div class="form-check-inline">
		${radioHtmlList.join("\n")}
	</div>
	`;

	this.setHtml(bodyHtml);
	radioIdList.forEach(
		function([id, color]) {
			let elem = this.getElementById(id);
			elem.addEventListener("change", this._onInputChangedCb.bind(this, color), true);
			this._radioElemByColor[color] = elem;
		}.bind(this)
	);
},

_onInputChangedCb: function(color, ev) {
	const logHead = "SettingsColorsItemViewer::_onInputChangedCb(" + color +
					", value: \"" + ev.target.checked + "\"): ";
	this._log(logHead + "change event", ev);

	if(color == "none") {
		// We need to convert the input before passing this to others
		color = null;
	}

	if(ev.target.checked) {
		this._setFn(color);
		this._eventManager.notifyListeners(Classes.EventManager.Events.UPDATED, { color: color });
	}
},

// Override from parent class
setEnabled: function(flag) {
	this._enabled = flag;

	if(this._radioElemByColor == null) {
		// See comment above SettingsItemViewer::_startListeners()
		return;
	}

	let colorList = Object.keys(this._radioElemByColor);

	colorList.forEach(
		function(color) {
			if(flag) {
				this._radioElemByColor[color].removeAttribute("disabled");
			} else {
				this._radioElemByColor[color].setAttribute("disabled", "");
			}
		}.bind(this)
	);
},

// Override from parent class
setValue: function(color) {
	if(this._radioElemByColor == null) {
		// See comment above SettingsItemViewer::_startListeners()
		return;
	}

	let mappedColor = optionalWithDefault(color, "none");
	// By taking the following action, any other radio button checked should
	// automatically get unchecked
	this._radioElemByColor[mappedColor].checked = true;
	this._eventManager.notifyListeners(Classes.EventManager.Events.UPDATED, { color: color });
},

}); // Classes.SettingsColorsItemViewer


// CLASS SettingsCardViewer
//
Classes.SettingsCardViewer = Classes.HtmlViewer.subclass({
	__idPrefix: "SettingsCardViewer",

	_bodyElem: null,
	_titleElem: null,

	_cardColor: null,

// "canClose" is optional, default "false". If set to "true", a close button is added.
_init: function(titleHtml, canClose) {
	this.debug();

	this._canClose = optionalWithDefault(canClose, false);

	const bodyId = this._id + "-body";
	const titleId = this._id + "-title";
	const closeId = this._id + "-close";

	let closeHtml = "";
	if(this._canClose) {
		// See https://stackoverflow.com/a/26799910/10791475 for the reasons here
		// for "tm-pointer-no" in the parent, and "tm-pointer-all" in the child.
		// Without it, the full screen overlay captures the mouse, and we can't
		// click on the text boxes and checkboxes when the "x" shows up. With
		// properly placed tm-pointer-*, the full overlay let's the mouse pass
		// through the layer below, but the button can still capture clicks.
		closeHtml = `
		<div class="tm-overlay tm-full-size tm-hover-target tm-pointer-no">
			<div class="tm-float-right">
				<button type="button" id="${closeId}" class="tm-pointer-all btn-secondary tm-rounded-btn mt-1 tm-close-icon close" aria-label="Close">
					<span aria-hidden="true">&times;</span>
				</button>
			</div>
		</div>
		`;
	}

	const rootHtml = `
	<div class="tm-callout tm-hover tm-stacked-below">
		<div id="${titleId}" class="ms-2 fw-bold">${titleHtml}</div>
		<div id="${bodyId}"></div>
		${closeHtml}
	</div>
	`;

	// Overriding the parent class' _init(), but calling that original function too
	Classes.HtmlViewer._init.call(this, rootHtml);
	this._bodyElem = this.getElementById(bodyId);
	this._titleElem = this.getElementById(titleId);
	if(this._canClose) {
		this._closeElem = this.getElementById(closeId);
	} else {
		this._closeElem = null;
	}
},

_colorData: {
	// "none" is the color we'll show when no color is set
	none: "tm-callout-none",
	grey: "tm-callout-grey",
	blue: "tm-callout-blue",
	red: "tm-callout-red",
	yellow: "tm-callout-yellow",
	green: "tm-callout-green",
	cyan: "tm-callout-cyan"
},

setCardColor: function(color) {
	const logHead = "SettingsCardViewer::setCardColor(" + color + "): ";
	if(this._cardColor == color) {
		// Nothing to do
		this._log(logHead + "nothing to do");
		return;
	}

	if(this._cardColor != null) {
		this._log(logHead + "removing old color " + this._cardColor);
		this.removeClasses(this._colorData[this._cardColor]);
	}

	if(color != null) {
		this._log(logHead + "adding color");
		this.addClasses(this._colorData[color]);
	}

	this._cardColor = color;
},

setTitle: function(titleHtml) {
	this._titleElem.innerHTML = titleHtml;
},

// "useAnimation" is a flag controlling whether we want a smooth transition
// or a hard removal. Default is "true".
closeCard: function(useAnimation) {
	useAnimation = optionalWithDefault(useAnimation, true);

	const logHead = "SettingsCardViewer::closeCard(" + useAnimation + "): ";

	if(!useAnimation) {
		this._log(logHead + "closing without animation");
		this.detach();
		return Promise.resolve();
	}

	return this.runAnimation("tm-shrink").then(
		function() {
			this._log(logHead + "animation ended, removing self from DOM");
			this.detach();
		}.bind(this)
	);
},

}); // Classes.SettingsCardViewer


// CLASS SettingsAddCustomGroupViewer
Classes.OLDSettingsAddCustomGroupViewer = Classes.HtmlViewer.subclass({
	__idPrefix: "SettingsAddCustomGroupViewer",

	_buttonViewer: null,
	_inputViewer: null,

	_rootHtml: `
		<div>
		</div>
	`,

_init: function() {
	// Overriding the parent class' _init(), but calling that original function first
	Classes.HtmlViewer._init.call(this, this._rootHtml);
	this.debug();

	this._renderAddItem();
},

_renderAddItem: function() {
	const buttonId = this._id + "-button";

	// You could use "col-10 mx-auto" in the inner <div> instead of "mx-2" in the outer <div>
	// to make the button a bit smaller but still centered.
	// Note that we must have the outer <div> because we want to call .hide(), which tries to
	// set "display: none;", but fails on the inner <div> because "d-grid" is defined as
	// "display: grid!important;" and the "!important" would overrides "display: none;"
	const buttonHtml = `
	<div class="mx-2 mt-3">
		<div class="d-grid gap-2">
			<button id="${buttonId}" type="button" class="btn btn-primary">+ add custom group</button>
		</div>
	</div>
	`;

	this._buttonViewer = Classes.HtmlViewer.create(buttonHtml);
	let buttonElem = this._buttonViewer.getElementById(buttonId);
	buttonElem.addEventListener("click", this._onButtonClickCb.bind(this), false);

	this._inputViewer = Classes.SettingsTextItemViewer.create({
		setFn: this._inputSet.bind(this),
		getFn: emptyFn,
		label: "Group name",
		placeholderText: "",
		helpHtml: ""
	});

	this._buttonViewer.show();
	this._inputViewer.hide();

	this.append(this._buttonViewer);
	this.append(this._inputViewer);
},

_inputSet: function(groupName) {
	const logHead = "SettingsAddCustomGroupViewer::_inputSet(" + groupName + "): ";
	if(settingsStore.hasCustomGroup(groupName)) {
		// Error, the group already exists
		this._err(logHead + "the grout title already exists");
		return;
	}

	settingsStore.setCustomGroup(groupName, {});
	let newCustomGroup = Classes.SettingsCustomGroupViewer.create(groupName,
								"Custom group \"" + groupName + "\" (new)");
	newCustomGroup.addBefore(this);

	this._buttonViewer.show();
	this._inputViewer.hide();
},

_onButtonClickCb: function(ev) {
	// When the user clicks on the button, we need to show the input
	this._buttonViewer.hide();
	this._inputViewer.show();	
},

}); // Classes.OLDSettingsAddCustomGroupViewer





// CLASS SettingsButtonViewer
//
// This class is abstract. Subclasses need to override _onButtonClickCb().
Classes.SettingsButtonViewer = Classes.HtmlViewer.subclass({
	__idPrefix: "SettingsButtonViewer",

	_buttonElem: null,

_init: function(labelHtml) {
	labelHtml = optionalWithDefault(labelHtml, "");
	const logHead = "SettingsButtonViewer::_init(): ";

	const buttonId = this._id + "-button";

	// You could use "col-10 mx-auto" in the inner <div> instead of "mx-2" in the outer <div>
	// to make the button a bit smaller but still centered.
	// Note that we must have the outer <div> because if we want to call .hide(), it tries to
	// set "display: none;", but fails on the inner <div> because "d-grid" is defined as
	// "display: grid!important;" and the "!important" would overrides "display: none;"
	const buttonHtml = `
	<div class="mx-2 mt-3">
		<div class="d-grid gap-2">
			<button id="${buttonId}" type="button" class="btn btn-primary">${labelHtml}</button>
		</div>
	</div>
	`;

	// Overriding the parent class' _init(), but calling that original function first
	Classes.HtmlViewer._init.call(this, buttonHtml);
	this.debug();

	this._log(logHead, this);
	this._buttonElem = this.getElementById(buttonId);
	this._buttonElem.addEventListener("click", this._onButtonClickCb.bind(this), false);
},

_onButtonClickCb: function(ev) {
	this._errorMustSubclass("SettingsButtonViewer::_onButtonClickCb(): ");
},

}); // Classes.SettingsButtonViewer


// CLASS SettingsAddCustomGroupViewer
Classes.SettingsAddCustomGroupViewer = Classes.SettingsButtonViewer.subclass({
	__idPrefix: "SettingsAddCustomGroupViewer",

	_customGroupsContainer: null,

_init: function(customGroupsContainer) {
	// Overriding the parent class' _init(), but calling that original function first
	Classes.SettingsButtonViewer._init.call(this, "+ add custom group");
	this.debug();

	this._customGroupsContainer = customGroupsContainer;
},

_onButtonClickCb: function(ev) {
	// When the user clicks on the button, we need to create a new CustomGroups card.
	// Since we still don't have a group name for it, it won't be committed until
	// one is provided.
	let newCustomGroup = Classes.SettingsCustomGroupViewer.create();
	this._customGroupsContainer.append(newCustomGroup);
	newCustomGroup.focusOnName();
//	delay(500).then(
//		function() {
//			newCustomGroup.focusOnName();
//		}.bind(this)
//	);
},

}); // Classes.SettingsAddCustomGroupViewer


// CLASS SettingsCustomGroupViewer
Classes.SettingsCustomGroupViewer = Classes.SettingsCardViewer.subclass({
	__idPrefix: "SettingsCustomGroupViewer",

	_groupName: null,

	_groupNameInput: null,

	// Put here all the inputs that should be disabled if the
	// name of the group is empty.
	_allInputsCanDisable: null,

// "groupName" is optional. If one is not specified, the class assumes
// there's no group in settingsStore backing it, but one will be created
// when the user types a group name in the corresponding input box.
// "htmlTitle" is optional, and defaults to a standard format for "groupName".
_init: function(groupName, htmlTitle) {
	groupName = optionalWithDefault(groupName, "");
	htmlTitle = optionalWithDefault(htmlTitle, this._formatDefaultTitle(groupName));
	this.debug();

	// Overriding the parent class' _init(), but calling that original function first
	Classes.SettingsCardViewer._init.call(this, htmlTitle, true);

	this._groupName = groupName;
	if(groupName != "") {
		this.setCardColor(settingsStore.getCustomGroupProp(groupName, "color"));
	}
	this._renderCustomGroupSettings();

	this._closeElem.addEventListener("click", this._onCloseClickCb.bind(this), false);
},

_formatDefaultTitle: function(groupName) {
	if(groupName != "") {
		return `Custom group "${groupName}"`;
	}

	return "*New custom group";
},

_onCloseClickCb: function(ev) {
	const logHead = "SettingsCustomGroupViewer::_onCloseClickCb(\"" + this._groupName + "\"): ";

	this._log(logHead + "closing");

	this.closeCard();

	if(this._groupName != "") {
		settingsStore.delCustomGroup(this._groupName);
	}
},

_applyColorChange: function(color) {
	if(this._groupName == "") {
		// No action can be taken until a group name is set
		return;
	}
	settingsStore.setCustomGroupProp(this._groupName, "color", color);
},

_getGroupName: function() {
	return this._groupName;
},

_showGroupNameError: function(msgHtml) {
	this._groupNameInput.setInvalid(msgHtml);
	// Revert the change (this works also if there's no group name yet)
	this._groupNameInput.setValue(this._groupName);
},

// "flag" is "true" when enabling (default), "false" when disabling
_enableSettings: function(flag) {
	const logHead = "SettingsCustomGroupViewer::_enableSettings(): ";
	flag = optionalWithDefault(flag, true);
	this._allInputsCanDisable.forEach(
		function(inputViewer) {
			this._log(logHead, inputViewer);
			inputViewer.setEnabled(flag);
		}.bind(this)
	);
},

_renameCustomGroup: function(newName) {
	const logHead = "SettingsCustomGroupViewer::_renameCustomGroup(" + newName + "): ";

	if(newName == "") {
		this._showGroupNameError(`A group must have a non-empty name`);
		this._err(logHead + "the title is an empty string");
		return;
	}

	newName = newName.trim();
	if(newName == "") {
		this._showGroupNameError(`A group name can't be only made of whitespaces`);
		this._err(logHead + "the title is a string of whitespaces");
		return;
	}
	
	// Check hasCustomGroup() with ignoreCase = true
	if(settingsStore.hasCustomGroup(newName, true)) {
		this._showGroupNameError(`A group named <i>${newName}</i> already exists`);
		this._err(logHead + "the title already exists");
		return;
	}

	// Set _groupName to the new name first, because the calls to settingsStore
	// trigger events that cause setValue() to be invoked, and setValue() for
	// the group name uses a _getFn() that's actually reading _groupName...
	let oldName = this._groupName;
	this._groupName = newName;

	if(oldName != "") {
		settingsStore.renameCustomGroup(oldName, newName);
	} else {
		// We need to create the new object in settingsStore
		settingsStore.setCustomGroup(newName, {});
		// Once settingsStore generates its notification, SettingsTabViewer
		// will do its diffs and discover it needs to add a new card with
		// the newName we just set. It so happens the card already exists
		// (it's this card), but SettingsTabViewer doesn't know it, so it
		// will create a new one... let's just close this one here then...
		//this._enableSettings();
		this.closeCard(false);
	}

	this.setTitle(this._formatDefaultTitle(newName));
},

// We need these small wrappers because groups can change names, so we can't
// bind a fixed name in the event callbacks
_getProp: function(prop) {
	return settingsStore.getCustomGroupProp(this._groupName, prop);
},

_setProp: function(prop, value) {
	return settingsStore.setCustomGroupProp(this._groupName, prop, value);
},

_colorUpdatedCb: function(ev) {
	this.setCardColor(ev.detail.color);
},

_renderCustomGroupSettings: function() {
	this._allInputsCanDisable = [];

	let ss = settingsStore;

	let color = Classes.SettingsColorsItemViewer.create({
		setFn: this._applyColorChange.bind(this),
		getFn: this._getProp.bind(this, "color"),
	});
	this.append(color);
	this._allInputsCanDisable.push(color);
	color.addEventListener(Classes.EventManager.Events.UPDATED, this._colorUpdatedCb.bind(this));

	let help = "";
	if(this._groupName == "") {
		// Special help message for the new custom group placeholder
		help = "Assign a unique name to start using this custom group";
	}

	this._groupNameInput = Classes.SettingsTextItemViewer.create({
		setFn: this._renameCustomGroup.bind(this),
		getFn: this._getGroupName.bind(this),
		label: "Group name",
		placeholderText: "",
		helpHtml: help
	});

	this.append(this._groupNameInput);

	let favIconUrl = Classes.SettingsTextItemViewer.create({
		setFn: this._setProp.bind(this, "favIconUrl"),
		getFn: this._getProp.bind(this, "favIconUrl"),
		label: "Icon URL for this group",
		placeholderText: "",
		helpHtml: "Optional, if not specified, one will be taken from tabs in the custom group"
	});

	this.append(favIconUrl);
	this._allInputsCanDisable.push(favIconUrl);

	let matchList = Classes.SettingsTextAreaItemViewer.create({
		setFn: this._setProp.bind(this, "matchList"),
		getFn: this._getProp.bind(this, "matchList"),
		label: "List of hostnames to match the group",
		placeholderText: "",
		helpHtml: this._safeText("One hostname match expression per line")
	});

	this.append(matchList);
	this._allInputsCanDisable.push(matchList);

	if(this._groupName == "") {
		this._enableSettings(false);
	}
},

focusOnName: function() {
	this._groupNameInput.setFocus();
},

}); // Classes.SettingsCustomGroupViewer


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
		helpHtml: this._safeText("Use %s to indicate where the text from the clipboard should get pasted")
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
		helpHtml: this._safeText("Use %s to indicate where the text from the clipboard should get pasted")
	});

	this.append(hostnameOrUrl);

	let alwaysNewTab = Classes.SettingsCheckboxItemViewer.create({
		setFn: sm.setShortcutProp.bind(sm, this._shortcutKey, "alwaysNewTab"),
		getFn: sm.getShortcutProp.bind(sm, this._shortcutKey, "alwaysNewTab"),
		label: "Always open shortcut in new tab",
	});

	this.append(alwaysNewTab);

	let useClipboard = Classes.SettingsCheckboxItemViewer.create({
		setFn: sm.setShortcutProp.bind(sm, this._shortcutKey, "useClipboard"),
		getFn: sm.getShortcutProp.bind(sm, this._shortcutKey, "useClipboard"),
		label: "Enable search of clipboard contents",
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

_init: function(tabLabelHtml) {
	// Overriding the parent class' _init(), but calling that original function first
	Classes.TabViewer._init.apply(this, arguments);

	const logHead = "SettingsTabViewer::_init(): ";
	this.debug();

	this._manifest = chrome.runtime.getManifest();
	this._log(logHead + "the manifest object:", this._manifest, chrome.runtime.getURL("aa"));

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

_setBody: function() {
	let bodyId = this._id + "-settingsBody";
	let html = `
		<div id="${bodyId}" class="tm-scrollable-tab-body px-2 py-3">
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
	// I thought I could have a page for only the shortcuts of my extension, but
	// the page generated by this doesn't exist:
	// ${chrome.runtime.getURL("shortcuts")}

	// You could use "col-10 mx-auto" instead of "mx-2" to make the button a bit
	// smaller but still centered
	const bodyHtml = `
	<div class="d-grid gap-2 mx-2 mt-3">
		<a class="btn btn-primary" role="button" href="chrome://extensions/shortcuts" target="_blank">
			Edit extension shortcuts
		</a>
	</div>
	`;

	let viewer = Classes.HtmlViewer.create(bodyHtml);
	this._shortcutsContainer.append(viewer);
},

_renderIncognitoInfo: function() {
	const logHead = "SettingsTabViewer::_renderIncognitoInfo(): ";

	const extensionId = chromeUtils.getExtensionId();

	const footprint = `
		<div class="small">You can enable/disable access to incognito tabs in
		the <a href="chrome://extensions/?id=${extensionId}" target="_blank">Chrome extension settings</a>
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
				viewer.setHtml("<div>Access to Incognito tabs is enabled<div>" + footprint);
			} else {
				viewer.setHtml("<div>Access to Incognito tabs is disabled<div>" + footprint);
			}
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

	let showTabId = Classes.SettingsCheckboxItemViewer.create({
		setFn: settingsStore.setOptionShowTabId.bind(settingsStore),
		getFn: settingsStore.getOptionShowTabId.bind(settingsStore),
		label: "Display extended tab ID badge",
	});

	this._generalSettingsContainer.append(showTabId);
	
	let advancedMenu = Classes.SettingsCheckboxItemViewer.create({
		setFn: settingsStore.setOptionAdvancedMenu.bind(settingsStore),
		getFn: settingsStore.getOptionAdvancedMenu.bind(settingsStore),
		label: "Show advanced items in tab tiles menu",
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
	this._addCustomGroups(settingsStore.getCustomGroupNames());

	let addCustomGroupButton = Classes.SettingsAddCustomGroupViewer.create(this._customGroupsContainer);
	outerCustomGroupsContainer.append(addCustomGroupButton);

	this._shortcutsContainer = Classes.CollapsibleContainerViewer.create({ border: false });
	this._shortcutsContainer.setHeadingHtml(`<div class="fw-bold">Shortcuts settings</div>`);
//	this._shortcutsContainer.addExpandedListener(this._containerExpandedCb.bind(this));
//	this._shortcutsContainer.addCollapsedListener(this._containerCollapsedCb.bind(this));
	this._shortcutsContainer.addClasses("mt-3");
	this.append(this._shortcutsContainer);

	this._renderExtensionShortcutsLink();

	let lostShortcut = Classes.SettingsLosShortcutViewer.create("Shortcut launch/search");

	this._shortcutsContainer.append(lostShortcut);

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
	const logHead = "SettingsTabViewer::_updatedCb(): ";
	this._log(logHead + "entering", ev.detail);

	// We need to do a diff of the names we know vs. the names in settingsStore
	let newNames = settingsStore.getCustomGroupNames().sort();
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

