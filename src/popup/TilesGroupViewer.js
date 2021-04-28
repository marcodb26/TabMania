// CLASS TilesGroupViewer
Classes.TilesGroupViewer = Classes.CollapsibleContainerViewer.subclass({
	__idPrefix: "TilesGroupViewer",

	_tabGroup: null,
	groupName: null,
	_expandedGroups: null,

_init: function(tabGroup, expandedGroups) {
	this._tabGroup = tabGroup;
	this._groupName = tabGroup.title;
	this._expandedGroups = expandedGroups;

	let options = {
		startExpanded: this._expandedGroups.has(this._groupName),
		htmlWhenEmpty: `<i class="text-muted small">No tabs</i>`,
		border: false,
		bodyExtraClasses: [ "tm-indent-right" ],
	};

	// Overriding the parent class' _init(), but calling that original function first
	Classes.CollapsibleContainerViewer._init.call(this, options);
//	const logHead = "TilesGroupViewer::_init(): ";

	this._TilesGroupViewer_render();

	// Note that we don't set a listener for this._expandedGroups, because we don't care
	// to auto-open the accordion if it gets open in the popup of another window...
},

_TilesGroupViewer_renderHeading: function() {
	let iconBadgeHtml = `
		<div class="tm-overlay tm-full-size">
			<div class="tm-icon-badge-pos small">
				<span class="badge tm-icon-badge bg-dark">${this._tabGroup.tabs.length}</span>
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
			extraClasses.push("text-secondary");
		}
		pinnedIconHtml = `
		<p class="m-0 pe-2">
			<span>${icons.thumbtack("tm-fa-thumbtack-group", ...extraClasses)}</span>
		</p>`;
	}

	let favIconContainerId = this._id + "-favIcon";

	// Do we need the attribute "width='16px'" in the <img> below, or are the min-width
	// and max-width settings of "tm-favicon-16" enough?
	// "width: 95%" because we don't want to push the caret on the right too far out
	// when the group title is long.
	// "text-align: left;" is required because we're inside a button (the accordion button),
	// and that sets center alignment.
	let groupHeadingHtml = `
		<div class="tm-stacked-below" style="width: 95%;">
			<div class="d-flex">
				<p class="flex-grow-1 m-0 text-nowrap text-truncate" style="text-align: left;">
					<span id="${favIconContainerId}" class="pe-2"><!-- The favicon goes here --></span>
					<span>${this._groupName}</span>
				</p>
				${pinnedIconHtml}
			</div>
			${iconBadgeHtml}
		</div>
	`;

	this.setHeadingHtml(groupHeadingHtml);

	let favIconContainerElem = this.getElementById(favIconContainerId);

	let favIconOptions = {
		src: this._tabGroup.favIconUrl,
		srcBackup: this._tabGroup.cachedFavIconUrl,
		extraClasses: [ "tm-favicon-16" ],
	};
	let favIconViewer = Classes.ImageViewer.create(favIconOptions);
	favIconViewer.attachToElement(favIconContainerElem);
},

_TilesGroupViewer_render: function() {
	this._TilesGroupViewer_renderHeading();
	this.addExpandedStartListener(this._containerExpandedCb.bind(this));
	this.addCollapsedStartListener(this._containerCollapsedCb.bind(this));

	if(this._tabGroup.type == Classes.GroupsBuilder.Type.CUSTOM) {
		let cgm = settingsStore.getCustomGroupsManager();
		this.addHeadingClasses("tm-customgroup-header", "tm-callout", cgm.getCustomGroupCss(this._groupName));
	} else {
		this.addHeadingClasses("tm-customgroup-header");
	}
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
	//const logHead = "TilesGroupViewer::_storeExpandedGroup(" + this._groupName + ", " + expanded + "): ";

	if(expanded) {
		this._expandedGroups.add(this._groupName);
	} else {
		this._expandedGroups.del(this._groupName);
	}
},

_containerExpandedCb: function(ev) {
	const logHead = "TilesGroupViewer::_containerExpandedCb(" + this._groupName + ", " + ev.target.id + "): ";
	this._log(logHead + "container expanded", ev);

	// The animation and visualization is done by Bootstrap, we just need to remember
	// whether it's collapsed or expanded
	this._storeExpandedGroup();
},

_containerCollapsedCb: function(ev) {
	const logHead = "TilesGroupViewer::_containerCollapsedCb(" + this._groupName + ", " + ev.target.id + "): ";
	this._log(logHead + "container collapsed", ev);

	// The animation and visualization is done by Bootstrap, we just need to remember
	// whether it's collapsed or expanded
	this._storeExpandedGroup(false);
},

}); // Classes.TilesGroupViewer
