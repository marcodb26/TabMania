// CLASS TilesGroupViewer
Classes.TilesGroupViewer = Classes.CollapsibleContainerViewer.subclass({
	__idPrefix: "TilesGroupViewer",

	_tabGroup: null,
	groupName: null,
	_expandedGroups: null,

// "incognitoStyle" is optional (default "false")
_init: function(tabGroup, expandedGroups, incognitoStyle=false) {
	this._tabGroup = tabGroup;
	this._groupName = tabGroup.title;
	this._expandedGroups = expandedGroups;
	this._incognitoStyle = incognitoStyle;

	this.debug();

	let emptyExtraClasses = [];
	if(incognitoStyle) {
		emptyExtraClasses.push("text-white-50");
	} else {
		emptyExtraClasses.push("text-muted");
	}

	let options = {
		startExpanded: this._expandedGroups.has(this._groupName),
		htmlWhenEmpty: `<i class="small ${emptyExtraClasses.join(" ")}">No tabs</i>`,
		border: false,
		bodyExtraClasses: [ "tm-indent-right" ],
		incognitoStyle: this._incognitoStyle,
		// Don't show the checkbox if the group is empty, it's only confusing if selecting
		// something (the group) doesn't change the count of selected objects. Plus, given
		// the current logic, if a group is empty, it won't get checked on "select all" from
		// the multi-select panel, because for the group to be selected, a call to computeMultiSelectState()
		// must be triggered from a tile, and if there are no tiles, it doesn't get triggered.
		selectable: this._tabGroup.tabs.length != 0,
	};

	// Overriding the parent class' _init(), but calling that original function first
	Classes.CollapsibleContainerViewer._init.call(this, options);
//	const logHead = "TilesGroupViewer::_init(): ";

	this._TilesGroupViewer_render();

	// Note that we don't set a listener for this._expandedGroups, because we don't care
	// to auto-open the accordion if it gets opened in the popup of another window...
},

_TilesGroupViewer_renderHeading: function() {
	let lightIconClass = "text-secondary";
	let badgeBgClass = "bg-dark";
	let badgeTextClass = ""; // Use the default from class .badge

	if(this._incognitoStyle) {
		lightIconClass = "text-white-50";
		badgeBgClass = "tm-bg-incognito-white";
		badgeTextClass = "tm-text-incognito-dark";
	}

	let iconBadgeHtml = `
		<div class="tm-overlay tm-full-size">
			<div class="tm-icon-badge-pos small">
				<span class="badge tm-icon-badge ${badgeTextClass} ${badgeBgClass}">${this._tabGroup.tabs.length}</span>
			</div>
		</div>
	`;

	// No icon badge for empty groups (pinned groups can show up empty)
	if(this._tabGroup.tabs.length == 0) {
		iconBadgeHtml = "";
	}

	let pinnedIconHtml = "";
	// If the group is pinned, add a thumbtack icon
	if(this._tabGroup.tm.pinned) {
		let extraClasses = [];
		if(!settingsStore.isGroupPinned(this._groupName)) {
			// If the group is not itself pinned, then it must be pinned due
			// to some of its inner tabs...
			extraClasses.push(lightIconClass);
		}
		pinnedIconHtml = `
		<p class="m-0 pe-2">
			<span>${icons.thumbtack("tm-fa-thumbtack-group", ...extraClasses)}</span>
		</p>`;
	}

	const favIconContainerId = this._id + "-favIcon";

	// Do we need the attribute "width='16px'" in the <img> below, or are the min-width
	// and max-width settings of "tm-favicon-16" enough?
	// "width: 95%" because we don't want to push the caret on the right too far out
	// when the group title is long.
	// "text-align: left;" is required because we're inside a button (the accordion button),
	// and that sets center alignment.
	let groupHeadingHtml = `
		<div class="tm-stacked-below" style="width: 95%;">
			<div class="d-flex align-items-center">
				<div class="flex-grow-1 m-0 ps-2 text-nowrap text-truncate" style="text-align: left;">
					<span id="${favIconContainerId}" class="pe-2"><!-- The favicon goes here --></span>
					<span>${this._groupName}</span>
					${iconBadgeHtml}
				</div>
				${pinnedIconHtml}
			</div>
		</div>
	`;

	this.setHeadingHtml(groupHeadingHtml);

	// this._selectElem is "null" if the tab group is empty, so we need to use
	// the optional chaining operator
	this._selectElem?.addEventListener("click", this._selectClickedCb.bind(this), false);

	let favIconContainerElem = this.getElementById(favIconContainerId);

	let favIconOptions = {
		src: this._tabGroup.favIconUrl,
		srcBackup: this._tabGroup.cachedFavIconUrl,
		extraClasses: [ "tm-favicon-16" ],
	};
	let favIconViewer = Classes.ImageViewer.create(favIconOptions);
	favIconViewer.attachInParentElement(favIconContainerElem);
},

_TilesGroupViewer_render: function() {
	if(this._incognitoStyle) {
		this.addClasses("tm-bg-incognito", "tm-text-incognito", "border-dark");
	}

	this._TilesGroupViewer_renderHeading();
	this.addExpandedStartListener(this._containerExpandedCb.bind(this));
	this.addCollapsedStartListener(this._containerCollapsedCb.bind(this));

	let headingOuterClasses = [ "tm-customgroup-header" ];

	if(this._tabGroup.type == Classes.GroupsBuilder.Type.CUSTOM) {
		let cgm = settingsStore.getCustomGroupsManager();
		let colorCss = cgm.getCustomGroupCss(this._groupName);
		// When "color" is "none", "colorCss" is an empty string. Unfortunately
		// when an argument is an empty string, Element.classList.add() returns a
		// "DOMException: Failed to execute 'add' on 'DOMTokenList': The token
		// provided must not be empty.".
		// So we must explicitly avoid that case
		if(colorCss != "") {
			headingOuterClasses.push("tm-callout", colorCss);
		}
	}
	this.addHeadingOuterClasses(...headingOuterClasses);
},

// This function tracks whether a specific group key is currently expanded or collapsed.
// This info must be stored in chrome.storage.local because we want to remember which
// tabs are collapsed/expanded across opening and closing the popup.
// Note that the current storage strategy might cause old group keys to persist in
// chrome.storage.local even if the group disappears. This is the main reason why we
// only store "expanded" state, and delete when the state goes back to "collapsed".
// This way at least only the groups that disappeared expanded stay stored.
// Once we implement expand/collapse all will be able to clear completely the persistent
// state when "collapse all" is done.
_storeExpandedGroup: function(expanded) {
	expanded = optionalWithDefault(expanded, true);
	//const logHead = "TilesGroupViewer._storeExpandedGroup(" + this._groupName + ", " + expanded + "):";

	if(expanded) {
		this._expandedGroups.add(this._groupName);
	} else {
		this._expandedGroups.del(this._groupName);
	}
},

_containerExpandedCb: function(ev) {
	const logHead = "TilesGroupViewer._containerExpandedCb(" + this._groupName + ", " + ev.target.id + "):";
	this._log(logHead, "container expanded", ev);

	// The animation and visualization is done by Bootstrap, we just need to remember
	// whether it's collapsed or expanded
	this._storeExpandedGroup();
},

_containerCollapsedCb: function(ev) {
	const logHead = "TilesGroupViewer._containerCollapsedCb(" + this._groupName + ", " + ev.target.id + "):";
	this._log(logHead, "container collapsed", ev);

	// The animation and visualization is done by Bootstrap, we just need to remember
	// whether it's collapsed or expanded
	this._storeExpandedGroup(false);
},

_selectClickedCb: function(ev) {
	if(!this.isSelectMode()) {
		// Probably a useless check, when not in select mode, the select checkbox is hidden
		return;
	}

	const logHead = "TilesGroupViewer._selectClickedCb():";

	if(this._selectElem.checked) {
		this._log(logHead, "all selected", ev);
	} else {
		this._log(logHead, "all unselected", ev);
	}

	this.setSelected(this._selectElem.checked);
},

setSelected: function(flag=true, options={}) {
	const logHead = "TilesGroupViewer.setSelected():";
	this._log(logHead, "working with children", this._bodyElem.children);

	// "notifyParent: false" makes sure every tile doesn't try to call back
	// computeMultiSelectState(), too expensive
	options.notifyParent = false;

	for(let i = 0; i < this._bodyElem.children.length; i++) {
		let tile = Classes.Viewer.getViewerByElement(this._bodyElem.children[i]);
		if(tile == null) {
			this._log(logHead, "no tile found at index", i);
			continue;
		}

		this._log(logHead, "processing index", i, tile);
		tile.setSelected(flag, options);
	}

	// Since the tiles have not each called computeMultiSelectState(), let's call
	// it once here, though we should already know what the result is going to be
	this.computeMultiSelectState();
},

isSelectMode: function() {
	return this.isSelectable() && this._selectMode;
},

_setSelectedInner: function(flag=true, indeterminate=false) {
	if(!this.isSelectable()) {
		// If there are no tiles, the TilesGroupViewer is not selectable
		return;
	}

	this._selectElem.checked = flag;
	this._selectElem.indeterminate = indeterminate;
},

// If "hint" is "undefined", it won't contribute to the determination of the group's
// checkbox state.
// Very similar to TabsBsTabViewer._computeMultiSelectState(), we might want to find a way
// to consolidate the two.
computeMultiSelectState: function(hint) {
	if(!this.isSelectable()) {
		// If there are no tiles, the TilesGroupViewer is not selectable
		return;
	}

	const logHead = "TilesGroupViewer.computeMultiSelectState():";
	let atLeastOneSelected = false;

	this._log(logHead, "working with children", this._bodyElem.children);

	for(let i = 0; i < this._bodyElem.children.length; i++) {
		let tile = Classes.Viewer.getViewerByElement(this._bodyElem.children[i]);
		if(tile == null) {
			this._log(logHead, "no tile found at index", i);
			continue;
		}
		this._log(logHead, "processing index", i, tile);

		if(tile.isSelected()) {
			atLeastOneSelected = true;
			if(hint === false) {
				// We're finding that at least one is selected, and we know from the "hint"
				// that at least one has just been unselected, no need to continue with the
				// loop, the multiSelect state is "partially selected" (indetermined)
				this._setSelectedInner(true, true);
				return;
			}
		} else {
			if(atLeastOneSelected || hint === true) {
				// At least one is selected (either because we found it, or because the "hint"
				// told us that), and now we're finding out that at least one is unselected,
				// no need to continue with the loop, the multiSelect state is "partially
				// selected" (indetermined)
				this._setSelectedInner(true, true);
				return;
			}
		}
	}

	// If we get here, we didn't hit the "partially selected" case, so the tiles are
	// either all selected, or all unselected
	this._setSelectedInner(atLeastOneSelected);
},

}); // Classes.TilesGroupViewer
