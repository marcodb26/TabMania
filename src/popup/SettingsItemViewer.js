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

	_label: null,
	_helpHtml: null,

	_rootHtml: `
		<div class="mx-2 mt-3">
		</div>
	`,

	// Which key in storageSettings will trigger updates?
	// Subclasses leave it "null" if they want to trigger updates for any
	// storage key change.
	_trackedUpdateKey: null,

// Using ES6 destructuring syntax to help with the proliferation of optional parameters
// in the settings logic...
_init: function({ setFn, getFn, label, helpHtml, updateKey }) {
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
	this._helpHtml = optionalWithDefault(helpHtml, "");

	this._trackedUpdateKey = updateKey;
	this._enabled = true;

	this._startListeners();
},

// This function can be called in the _init() of the this class, because setValue()
// is robust in case _inputElem has not yet been initialized.
// The worst case is receiving an event before the _init() of the subclass has been
// completed, and therefore _inputElem is still null.
_startListeners: function() {
	// We listen for updates to specific keys, as determined by the instance of the subclass
	settingsStore.addEventListener(Classes.EventManager.Events.UPDATED,
		function(ev) {
			if(this._trackedUpdateKey == null || this._trackedUpdateKey == ev.detail.key) {
				this.setValue(this._getFn());
			}
		}.bind(this)
	);
},

_setAttributesHtml: function(extraAttrs) {
	if(!this._enabled) {
		extraAttrs.push(`disabled`);
	}
},

_getHelpId: function() {
	return this._id + "help";
},

_getHelpHtml: function() {
	return `<div id="${this._getHelpId()}" class="form-text ms-2">${this._helpHtml}</div>`;
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

_init: function({ setFn, getFn, label, placeholderText, helpHtml, updateKey }) {
	// Overriding the parent class' _init(), but calling that original function first
	Classes.SettingsItemViewer._init.apply(this, arguments);
	this.debug();

	if(placeholderText == null || placeholderText == "") {
		// Note the need to leave the placeholderText non-empty, Bootstrap
		// requires it for the ".form-floating" (floating labels) class
		// https://getbootstrap.com/docs/5.0/forms/floating-labels/#example
		// The placeholderText will never show up, but let's continue to
		// behave as if it did, in case we decide to remove ".form-floating"
		// later.
		this._placeholderText = " ";
	} else {
		this._placeholderText = this._safeText(placeholderText);
	}

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
	const helpId = this._getHelpId();

	let extraAttrs = [];
	this._setAttributesHtml(extraAttrs);

	// We're using type search just because we want to get the "x" to erase
	// the current text

	// Note that for "form-floating" to work, the <label> must be below the <input>
	// Also the documentation shows how the label should show up bigger if there's no
	// text, but that doesn't happen in this code (and we're ok with it anyway).
	// See https://getbootstrap.com/docs/5.0/forms/floating-labels/
	const bodyHtml = `
	<div class="form-floating">
		<input type="search" id="${inputId}" class="form-control text-truncate" ${extraAttrs.join(" ")}
				aria-describedby="${helpId}">
		<label for="${inputId}" class="form-label pt-2 text-truncate w-100">${this._label}</label>
	</div>
	${this._getHelpHtml()}
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

	_placeholderText: null,

_init: function({ setFn, getFn, label, placeholderText, helpHtml, updateKey }) {
	// Overriding the parent class' _init(), but calling that original function first
	Classes.SettingsItemViewer._init.apply(this, arguments);
	this.debug();

	if(placeholderText == null || placeholderText == "") {
		// Note the need to leave the placeholderText non-empty, Bootstrap
		// requires it for the ".form-floating" (floating labels) class
		// https://getbootstrap.com/docs/5.0/forms/floating-labels/#example
		// The placeholderText will never show up, but let's continue to
		// behave as if it did, in case we decide to remove ".form-floating"
		// later.
		this._placeholderText = " ";
	} else {
		this._placeholderText = this._safeText(placeholderText);
	}

	this._renderTextAreaItem();
},

// Override parent class
_setAttributesHtml: function(extraAttrs) {

	if(this._placeholderText != null && this._placeholderText != "") {
		extraAttrs.push(`placeholder="${this._placeholderText}"`);
	}

	// Finally call the parent class to make sure no extra attributes are lost
	Classes.SettingsItemViewer._setAttributesHtml.call(this, extraAttrs);
},

_renderTextAreaItem: function() {
	const inputId = this._id + "input";

	let currentText = this._getFn();
	if(currentText == null) {
		currentText = "";
	}

	let extraAttrs = [];
	this._setAttributesHtml(extraAttrs);

	// From Chris Coyier's codepen: https://codepen.io/chriscoyier/pen/XWKEVLy
	// Codepen license is MIT: https://blog.codepen.io/documentation/licensing/

	// The explicit style "height: auto;" is needed to override the calculated height
	// added by Bootstrap "form-floating". If you don't use "form-floating", you can
	// get rid of this "height".
	const bodyHtml = `
	<div class="tm-autosize form-floating" data-replicated-value="${this._safeText(currentText)}">
		<textarea id="${inputId}" class="form-control" ${extraAttrs.join(" ")} style="height: auto;"
				aria-describedby="${this._getHelpId()}">${this._safeText(currentText)}</textarea>
		<label for="${inputId}" class="form-label pt-2 text-truncate w-100">${this._label}</label>
	</div>
	${this._getHelpHtml()}
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

_init: function({ setFn, getFn, label, helpHtml, updateKey }) {
	// Overriding the parent class' _init(), but calling that original function first
	Classes.SettingsItemViewer._init.apply(this, arguments);
	this.debug();

	this._renderCheckboxItem();
},

// Override parent class
_setAttributesHtml: function(extraAttrs) {
	const currentlyChecked = this._getFn();
	if(currentlyChecked != null && currentlyChecked) {
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
	  <input class="form-check-input tm-align-checkbox" type="checkbox" id="${checkboxId}" ${extraAttrs}
	  aria-describedby="${this._getHelpId()}">
	  <label class="form-check-label" for="${checkboxId}">${this._label}</label>
	</div>
	${this._getHelpHtml()}
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

// CLASS SettingsCheckboxPermViewer
// This class should be called "SettingsCheckboxItemWithPermissionViewer", but that's really
// a mouthful...
Classes.SettingsCheckboxPermViewer = Classes.SettingsCheckboxItemViewer.subclass({
	__idPrefix: "SettingsCheckboxPermViewer",

	_permission: null,

_init: function({ permission }) {
	this._permission = permission;

	// Overriding the parent class' _init(), but calling that original function first
	Classes.SettingsCheckboxItemViewer._init.apply(this, arguments);
	this.debug();
},

_requestPermission: function(ev) {
	const logHead = "SettingsCheckboxPermViewer::_requestPermission(): ";

	chromeUtils.wrap(chrome.permissions.request, logHead, { permissions: [ this._permission ] }).then(
		function(granted) {
			if(granted) {
				this._log(logHead + "permission granted");
				Classes.SettingsCheckboxItemViewer._onInputChangedCb.call(this, ev);
			} else {
				this._log(logHead + "permission refused");
				this._inputElem.checked = false;
			}
		}.bind(this)
	);
},

_removePermission: function(ev) {
	const logHead = "SettingsCheckboxPermViewer::_removePermission(): ";

	chromeUtils.wrap(chrome.permissions.remove, logHead, { permissions: [ this._permission ] }).then(
		function(removed) {
			if(removed) {
				this._log(logHead + "permission removed");
			} else {
				this._err(logHead + "failed");
			}
		}.bind(this)
	);
},

// Override from parent class
_onInputChangedCb: function(ev) {
	const logHead = "SettingsCheckboxPermViewer::_onInputChangedCb(value: \"" + ev.target.checked + "\"): ";
	this._log(logHead + "change event", ev);

	if(ev.target.checked) {
		this._requestPermission(ev);
	} else {
		// For _requestPermission we must call the parent class _onInputChangedCb() in
		// the Chrome API callback, so we do it inside _requestPermission().
		// Here instead we can call the parent class _onInputChangedCb() regardless of
		// the result of _removePermission(), so it doesn't make sense to put the parent
		// call inside _removePermission().
		this._removePermission(ev);
		Classes.SettingsCheckboxItemViewer._onInputChangedCb.call(this, ev);
	}
},

}); // Classes.SettingsCheckboxPermViewer

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

	_eventManager: null,

	_radioElemByColor: null,

_init: function({ setFn, getFn, updateKey }) {
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
	if(currentlyChecked != null && currentlyChecked) {
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
