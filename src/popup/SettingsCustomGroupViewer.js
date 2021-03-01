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
				<button type="button" id="${closeId}" class="tm-pointer-all tm-close-icon-button mt-1" aria-label="Close">
					<span aria-hidden="true" class="tm-close-icon"></span>
				</button>
			</div>
		</div>
		`;
	}

	const rootHtml = `
	<div class="tm-callout tm-callout-settings-card tm-hover tm-stacked-below">
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

setCardColor: function(color) {
	const logHead = "SettingsCardViewer::setCardColor(" + color + "): ";
	if(this._cardColor == color) {
		// Nothing to do
		this._log(logHead + "nothing to do");
		return;
	}

	let cgm = settingsStore.getCustomGroupsManager();
	if(this._cardColor != null) {
		this._log(logHead + "removing old color " + this._cardColor);
		this.removeClasses(cgm.getCustomGroupCssByColor(this._cardColor));
	}

	if(color != null) {
		this._log(logHead + "adding color");
		this.addClasses(cgm.getCustomGroupCssByColor(color));
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
		this.setCardColor(settingsStore.getCustomGroupsManager().getCustomGroupProp(groupName, "color"));
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
		// Need to unpin the group explicitly, otherwise it will survive as
		// a ghost (unfortunately pinnedGroups is separate from the custom
		// groups definitions, so this could become a problem also if we
		// allow pinning of hostname-based groups...).
		settingsStore.unpinGroup(this._groupName);
		settingsStore.getCustomGroupsManager().delCustomGroup(this._groupName);
	}
},

_applyColorChange: function(color) {
	if(this._groupName == "") {
		// No action can be taken until a group name is set
		return;
	}
	settingsStore.getCustomGroupsManager().setCustomGroupProp(this._groupName, "color", color);
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
		this._log(logHead + "user error: the title is an empty string");
		return;
	}

	newName = newName.trim();
	if(newName == "") {
		this._showGroupNameError(`A group name can't be only made of whitespaces`);
		this._log(logHead + "user error: the title is a string of whitespaces");
		return;
	}

	let cgm = settingsStore.getCustomGroupsManager()
	// Check hasCustomGroup() with ignoreCase = true
	if(cgm.hasCustomGroup(newName, true)) {
		this._showGroupNameError(`A group named <i>${newName}</i> already exists`);
		this._log(logHead + "user error: the title already exists");
		return;
	}

	// Now we can start the name change. Remember that we also need to transfer
	// the pinnedGroup information to the new name. We need to take these actions
	// before we switch name, otherwise we can't use these functions...
	// Note that we don't check 'if(this._groupName != "")' because these pin
	// functions are robust for that case.
	let isPinned = this._isCustomGroupPinned();
	// To keep things clean, we unpin the old name, so it doesn't take any storage
	this._pinCustomGroup(false);

	// Set _groupName to the new name first, because the calls to settingsStore
	// trigger events that cause setValue() to be invoked, and setValue() for
	// the group name uses a _getFn() that's actually reading _groupName...
	let oldName = this._groupName;
	this._groupName = newName;

	if(oldName != "") {
		cgm.renameCustomGroup(oldName, newName);
	} else {
		// We need to create the new object in settingsStore
		cgm.setCustomGroup(newName, {});
		// Once settingsStore generates its notification, SettingsTabViewer
		// will do its diffs and discover it needs to add a new card with
		// the newName we just set. It so happens the card already exists
		// (it's this card), but SettingsTabViewer doesn't know it, so it
		// will create a new one... let's just close this one here then...
		//this._enableSettings();
		this.closeCard(false);
	}
	// Let's set the pinnedGroup only after the new group has actually been
	// created to make sure if it fails, we don't end up with some non-existing
	// group name pinned
	this._pinCustomGroup(isPinned);

	this.setTitle(this._formatDefaultTitle(newName));
},

// We need these small wrappers because groups can change names, so we can't
// bind a fixed name in the event callbacks
_getProp: function(prop) {
	return settingsStore.getCustomGroupsManager().getCustomGroupProp(this._groupName, prop);
},

_setProp: function(prop, value) {
	return settingsStore.getCustomGroupsManager().setCustomGroupProp(this._groupName, prop, value);
},

_colorUpdatedCb: function(ev) {
	this.setCardColor(ev.detail.color);
},

_pinCustomGroup: function(flag) {
	if(this._groupName == "") {
		// This should not happen because the checkbox is disabled while the name
		// is unset, but we call this function also inside _renameCustomGroup(),
		// and there this check is relevant
		return;
	}
	if(flag) {
		settingsStore.pinGroup(this._groupName);
	} else {
		settingsStore.unpinGroup(this._groupName);
	}
},

_isCustomGroupPinned: function() {
	if(this._groupName == "") {
		return false;
	}
	return settingsStore.isGroupPinned(this._groupName);
},

_renderCustomGroupSettings: function() {
	this._allInputsCanDisable = [];

	let color = Classes.SettingsColorsItemViewer.create({
		setFn: this._applyColorChange.bind(this),
		getFn: this._getProp.bind(this, "color"),
		updateKey: "customGroups"
	});
	this.append(color);
	this._allInputsCanDisable.push(color);
	color.addEventListener(Classes.EventManager.Events.UPDATED, this._colorUpdatedCb.bind(this));

	let help = "";
	if(this._groupName == "") {
		// Special help message for the new custom group placeholder
		help = "Assign a unique name and press <i>Enter</i> to start using this custom group";
	}

	this._groupNameInput = Classes.SettingsTextItemViewer.create({
		setFn: this._renameCustomGroup.bind(this),
		getFn: this._getGroupName.bind(this),
		label: "Group name",
		placeholderText: "",
		helpHtml: help,
		updateKey: "customGroups"
	});
	this.append(this._groupNameInput);

	let pinnedInput = Classes.SettingsCheckboxItemViewer.create({
		setFn: this._pinCustomGroup.bind(this),
		getFn: this._isCustomGroupPinned.bind(this),
		label: "Pin group",
		updateKey: "pinnedGroups",
	});
	this.append(pinnedInput);
	this._allInputsCanDisable.push(pinnedInput);

	let favIconUrl = Classes.SettingsTextItemViewer.create({
		setFn: this._setProp.bind(this, "favIconUrl"),
		getFn: this._getProp.bind(this, "favIconUrl"),
		label: "Icon URL for this group",
		placeholderText: "",
		helpHtml: "Optional, if not specified, one will be taken from tabs in the custom group",
		updateKey: "customGroups"
	});

	this.append(favIconUrl);
	this._allInputsCanDisable.push(favIconUrl);

	let matchList = Classes.SettingsTextAreaItemViewer.create({
		setFn: this._setProp.bind(this, "matchList"),
		getFn: this._getProp.bind(this, "matchList"),
		label: "List of hostnames to match the group",
		placeholderText: "",
		helpHtml: "One hostname match expression per line",
		updateKey: "customGroups"
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
