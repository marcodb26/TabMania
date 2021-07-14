// CLASS SettingsItemViewer
//
Classes.SettingsItemsGroupViewer = Classes.CollapsibleContainerViewer.subclass({
	__idPrefix: "SettingsItemsGroupViewer",

	// Functions to read and write the persistent state. They only get set if
	// the class is initialized with "selectable = true".
	//
	// Signatures: _setFn(<value>), _getFn() returns <value>
	_setFn: null,
	_getFn: null,

	_label: null,
	_helpHtml: null,

	// Which key in storageSettings will trigger updates?
	// Subclasses leave it "null" if they want to trigger updates for any
	// storage key change.
	_trackedUpdateKey: null,

// Using ES6 destructuring syntax to help with the proliferation of optional parameters
// in the settings logic...
// "label" must be text, not HTML
_init: function({ startExpanded, selectable, setFn, getFn, label, helpHtml, updateKey }) {
	let options = {
		startExpanded,
		selectable,
		selectStyle: Classes.CollapsibleContainerViewer.Select.SWITCH,
		border: true,
	};

	// Overriding the parent class' _init(), but calling that original function first
	Classes.CollapsibleContainerViewer._init.call(this, options);
	this.debug();

	this._label = label ?? "";
	// We're currently ignoring "helpHtml" in this class, mostly because there's no
	// straightforward way to add help to the accordion button, maybe inside the accordion?
	this._helpHtml = helpHtml ?? "";

	this._trackedUpdateKey = updateKey;
	this._enabled = true;

	this.setHeadingHtml(`<div class="fw-bold tm-accordion-header-align">${this._label}</div>`);
	this.addClasses("ms-2", "tm-settings-container");
	this.addBodyClasses("pt-1", "pb-1");

	if(!this.isSelectable()) {
		return;
	}

	// Only actions about element selection after this point

	// Let's try to monitor for easy cut&paste errors... if you put a setFn()
	// where we should have a getFn(), you'll potentially cause loops of
	// notifications, with strange set(undefined).
	this._assert(setFn != getFn);
	this._setFn = setFn;
	this._getFn = getFn;

	this.setSelectMode(true);

	// Initialize the value of the checkbox
	this.setValue(this._getFn());

	// Make sure to call this after initializing the _selectElem (the _init() of the
	// parent class)
	this._startListeners();
},

_startListeners: function() {
	// We listen for updates to specific keys, as determined by the instance of the subclass
	settingsStore.addEventListener(Classes.EventManager.Events.UPDATED,
		function(ev) {
			if(this._trackedUpdateKey == null || this._trackedUpdateKey == ev.detail.key) {
				this.setValue(this._getFn());
			}
		}.bind(this)
	);

	this._selectElem.addEventListener("change", this._onInputChangedCb.bind(this), true);
},

_onInputChangedCb: function(ev) {
	const logHead = "SettingsItemsGroupViewer::_onInputChangedCb():";
	this._log(logHead, "change event", ev.target.checked, ev);

	this._setFn(ev.target.checked);
},

setEnabled: function(flag) {
	this._enabled = flag;
	this._assert(this._selectElem != null);

	if(flag) {
		this._selectElem.removeAttribute("disabled");
	} else {
		this._selectElem.setAttribute("disabled", "");
	}
},

// Use this to update the value if syncing from a remote update
setValue: function(value=false) {
	const logHead = "SettingsItemsGroupViewer::setValue():";

	this._log(logHead, "setting value", value);
	this._selectElem.checked = value;
},

}); // Classes.SettingsItemsGroupViewer
