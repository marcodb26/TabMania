// CLASS MenuViewer
//
Classes.MenuViewer = Classes.Viewer.subclass({
	__idPrefix: "MenuViewer",

	_rootElem: null,
	// This class uses a body element different from the _rootElem
	_bodyElem: null,

	_menuElem: null,

	_options: null,

	_dropdownBsObj: null,

// "options" includes:
// - "label", if not specified (default), the dropdown will just show the caret. The label
//   can contain HTML, not only text
// - "btnExtraClasses", you can use it for example for the CSS class to use for the button coloring,
//   and it default to "btn-secondary"
_init: function(options) {
	// Don't store "options" as-is, create a copy (and while you're doing it, initialize all
	// the fields you need)
	this._options = {};
	this._options.label = optionalWithDefault(options.label, "");
	this._options.showToggle = optionalWithDefault(options.showToggle, true);
	this._options.btnExtraClasses = optionalWithDefault(options.btnExtraClasses, [ "btn-secondary" ]);
	this._options.menuExtraClasses = optionalWithDefault(options.menuExtraClasses, []);

	// Overriding the parent class' _init(), but calling that original function first
	Classes.Viewer._init.call(this);
	this._MenuViewer_render();
},

_MenuViewer_render: function() {
	const menuId = this._id + "-menu";
	const menuItemsContainerId = this._id + "-menuitems";

	let dropdownClasses = [ "btn" ];
	let menuClasses = [ "dropdown-menu" ];

	if(this._options.showToggle) {
		if(this._options.label == "") {
			dropdownClasses.push("tm-dropdown-toggle");
		}
		dropdownClasses.push("dropdown-toggle");
	}

	// push() can take multiple arguments
	dropdownClasses.push(...this._options.btnExtraClasses);
	menuClasses.push(...this._options.menuExtraClasses);

	// See https://stackoverflow.com/questions/43233421/changing-dropdown-icon-on-bootstrap-4
	// if you want to replace the default caret symbol of the dropdown toggle with some other
	// visual element. All you need is to remove class "dropdown-toggle" (which has a pseudo
	// class "::after" that draws the caret), and put your gliph in the <a></a>.
	// Since we're adding "tm-dropdown-toggle::after" to fix some visual issues of the default
	// Bootstrap caret, you might need to remove "tm-dropdown-toggle" too if you want to
	// customize the icon. See the CSS definition of "tm-dropdown-toggle::after" for more details.
	//
	// "h-100" is needed only for the dropdown for the bstab main menu, but since
	// it's not hurting other uses of the menuButton, we'll use it everywhere...
	let menuButtonHtml = `
	<div class="dropdown h-100">
		<a class="${dropdownClasses.join(" ")}" role="button"
				id="${menuId}" data-bs-toggle="dropdown" aria-expanded="false">
			${this._options.label}
		</a>
		<ul id=${menuItemsContainerId} class="${menuClasses.join(" ")}" aria-labelledby="${menuId}">
		</ul>
	</div>
	`;

	this._rootElem = this._elementGen(menuButtonHtml);
	this._bodyElem = this.getElementById(menuItemsContainerId);

	this._menuElem = this.getElementById(menuId);
	this._dropdownBsObj = new bootstrap.Dropdown(this._menuElem);
	// Prevent clicks on the menu items from propagating all the way
	// down to the page owning the menu
	this._rootElem.addEventListener("click",
		function(ev) {
			ev.stopPropagation();
			// Since the click doesn't propagate, the menu won't close by itself when
			// clicked (?). Actually not sure this is the real root cause, but calling
			// the next function fixes the problem.
			this._dropdownBsObj.hide();
		}.bind(this),
		false);
},

// Pass as "dateData" any format accepted by dayjs(dateData)
_formatDate: function(dateData) {
	let dateObj = dayjs(dateData);
	return dateObj.fromNow() + " (" +
				// "Fri, Jun 9 2017 at 3:45PM" (in local time)
				dateObj.format("ddd, MMM D YYYY [at] h:mmA") + ")";
},

appendDivider: function() {
	this.append(Classes.HtmlViewer.create(`<li><hr class="dropdown-divider"></li>`));
},

// hide() and show() are already taken to implement a different function in Viewer, so let's
// use other verbs
close: function() {
	this._dropdownBsObj.hide();
},

open: function() {
	this._dropdownBsObj.show();
},

}); // Classes.MenuViewer


// CLASS MenuItemViewer
//
Classes.MenuItemViewer = Classes.Viewer.subclass({
	__idPrefix: "MenuItemViewer",

	_rootElem: null,
	// This class uses a body element different from the _rootElem
	_bodyElem: null,

	_options: null,
	_actionFn: null,

// "options.label" accepts HTML, while "options.labelText" expects only text (and will escape
// it using setText()). They should be mutually exclusive, if both are non-null/non-empty the
// logic below prioritizes "options.label".
// "options.actionFn" is optional, you can set it later with setAction().
_init: function(options) {
	// Overriding the parent class' _init(), but calling that original function first
	Classes.Viewer._init.call(this);

	this.debug();

	// Don't store "options" as-is, create a copy (and while you're doing it, initialize all
	// the fields you need)
	this._options = {};
	this._options.label = optionalWithDefault(options.label, "");
	this._options.labelText = optionalWithDefault(options.labelText, "");
	this._options.actionFn = optionalWithDefault(options.actionFn, null);
	this._options.extraClasses = optionalWithDefault(options.extraClasses, []);

	this._renderMenuItem();

	this._actionFn = null;
	if(this._options.actionFn != null) {
		// Internally setAction() changes _actionFn
		this.setAction(this._options.actionFn);
	}
},

_renderMenuItem: function() {
	const bodyId = this._id;

	// Bootstrap says the menu item should look like:
	// <li><a class="dropdown-item" href="#">Action</a></li>
	// However, we have some actionable and some non-actionable menu items, so we're
	// consolidating them all to look like:
	// <li><div class="dropdown-item">Action</div></li>
	// Then we can add callbacks to the click handler anyway...
	// Update: the menu doesn't close automatically when you click an item.
	// Tried to switch back to <a>, but the link causes the popup to move to status
	// "loading" and then "complete" every time you click a menu item. That causes
	// the menu to close, but only because we re-render, when you hover the menu
	// is actually still open.
	// Fixed the problem of menu staying open in MenuViewer._MenuViewer_render().
	let itemClasses = [ "dropdown-item", "tm-dropdown-item" ];
	itemClasses.push(...this._options.extraClasses);

	// "position-relative" is needed to support the checkmark of .tm-dropdown-item.tm-selected::before,
	// which uses "position: absolute".
	const rootHtml = `
		<li class="position-relative">
			<div id="${bodyId}" class="${itemClasses.join(" ")}"></div>
		</li>
	`;

	this._rootElem = this._elementGen(rootHtml);
	this._bodyElem = this.getElementById(bodyId);

	if(this._options.label != "") {
		this.setHtml(this._options.label);
	} else {
		if(this._options.labelText != "") {
			// Use setText() instead of inserting the label directly in the menu, to avoid the
			// risk of HTML injection
			this.setText(this._options.labelText);
		}
	}
},

setAction: function(fn) {
	if(this._actionFn != null) {
		this._bodyElem.removeEventListener("click", this._actionFn, false);
	}
	this._actionFn = fn;
	this._bodyElem.addEventListener("click", this._actionFn, false);
},

selected: function(flag) {
	flag = optionalWithDefault(flag, true);
	if(flag) {
		this._bodyElem.classList.add("tm-selected");
		this._bodyElem.setAttribute("aria-current", "true");
	} else {
		this._bodyElem.classList.remove("tm-selected");
		this._bodyElem.removeAttribute("aria-current");
	}
},

// Enable/disable the menu item, as controlled by "flag" (optional, default "enable")
enable: function(flag) {
	flag = optionalWithDefault(flag, true);
	if(flag) {
		this._bodyElem.classList.remove("disabled");
	} else {
		this._bodyElem.classList.add("disabled");
	}
}

}); // Classes.MenuItemViewer
