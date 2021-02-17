// Auto-grouping syntax
//
// "matchList" is a string of simplified-regex, one per line.
// They're not standard Javascript regular expressions. For now they're just strings,
// support for "*" will be added later.
//
// In the current implementation, it gets matched only against the hostname of the URL
// of each tab. In future we might want to etend this to match other elements of the
// tab information we have.
//
// "favIconUrl" is optional.
// "color" is optional. Use it like you use colors in Chrome tabGroups, specifying the color
// by name ("black", "green", etc.)

Classes.GroupsBuilder = Classes.Base.subclass({

	_groups: null,

	// See https://stackoverflow.com/questions/3561493/is-there-a-regexp-escape-function-in-javascript
	_regexEscapePatternObj: /[-\/\\^$*+?.()|[\]{}]/g,

_init: function() {
	// Overriding the parent class' _init(), but calling that original function first
	Classes.Base._init.call(this);

	this.debug();

	this._buildCustomGroups();

	settingsStore.addEventListener(Classes.EventManager.Events.UPDATED, this._settingStoreUpdatedCb.bind(this));
},

_settingStoreUpdatedCb: function(ev) {
	const logHead = "GroupsBuilder::_settingStoreUpdatedCb(" + ev.detail.key + "): ";
	this._log(logHead + "entering");

	// Since rebuilding the groups database can be a bit expensive, let's only
	// take this action if it's actually changed
	if(ev.detail.key != "customGroups") {
		this._log(logHead + "ignoring key");
		return;
	}

	this._log(logHead + "processing update");
	this._buildCustomGroups();
},

_regexEscape: function(simpleRegEx) {
	// See https://stackoverflow.com/questions/3561493/is-there-a-regexp-escape-function-in-javascript
	return simpleRegEx.replace(this._regexEscapePatternObj, '\\$&');
},

// Each line of the string "matchList" is a simplified-regex (or an empty line)
_parseRegex: function(matchList) {
	const logHead = "GroupsBuilder::_parseRegex(" + matchList + "): ";

	if(matchList == null) {
		return null;
	}

	let list = matchList.split("\n");

	let trimmedList = [];
	list.forEach(
		function(regex) {
			let trimmedRegex = regex.trim();
			if(trimmedRegex != "") {
				// Skip empty strings
				trimmedList.push("(" + this._regexEscape(trimmedRegex) + ")");
			}
		}.bind(this)
	)

	let fullExpr = trimmedList.join("|")
	this._log(logHead + "after split: " , fullExpr);

	try {
		return new RegExp(fullExpr);
	} catch(e) {
		this._err(logHead + "unable to parse regex", e);
		return null;
	}
},

_buildCustomGroups: function() {
	const logHead = "GroupsBuilder::_buildCustomGroups(): ";
	this._groups = {};

	let groupTitles = settingsStore.getCustomGroupNames();
	groupTitles.forEach(
		function(title) {
			this._groups[title] = settingsStore.getCustomGroup(title);
			this._log(logHead + "processing group \"" + title + "\": ", this._groups[title]);
			// We could have done this in the variable initialization itself, but let's start
			// behaving as if we're parsing this from a file...
			this._groups[title].parsedRegex = this._parseRegex(this._groups[title].matchList);
		}.bind(this)
	);
},

// Returns "null" if no custom group is defined for "hostname", otherwise returns the
// "title" of the custom group
_getCustomGroupByHostname: function(hostname) {
	let titles = Object.keys(this._groups);

	for(let i = 0; i < titles.length; i++) {
		if(this._groups[titles[i]].parsedRegex != null &&
			this._groups[titles[i]].parsedRegex.test(hostname)) {
			return titles[i];
		}
	}

	return null;
},

// Returns null if a hostname could not be parsed
_getHostname: function(tab) {
	return tab.tm.hostname;
// This is now done in Classes.NormalizedTabs
//	try {
//		var urlObj = new URL(tab.url);
//		return urlObj.hostname;
//	} catch(e) {
//		// Should check if it's a TypeError, but let's assume it's always a TypeError
//		return null;
//	}
},

_getWindowId: function(tab) {
	return tab.windowId;
},

_findFavIconUrl: function(groupName, tabs) {
	let groupProps = this.getGroupProperties(groupName);

	if(groupProps != null && groupProps.favIconUrl != null) {
		return groupProps.favIconUrl;
	}

	// Default case, grab the first favicon you find in the list of tabs
	for(var i = 0; i < tabs.length; i++) {
		if(tabs[i].favIconUrl != null) {
			return tabs[i].favIconUrl;
		}
	}
	return "";
},

// Now done in Classes.NormalizedTabs
//
// To normalize, move everything to upper case, then drop "WWW." at the beginning
// of each title, since that makes sorting very ugly to watch. Eventually we could
// get more sophisticated with this function (remove articles like "the "), and possibly
// do that in a locale dependent way... but not now.
//_normalizeTitle: function(title) {
//	let upperTitle = title.toUpperCase();
//
//	// We could use upperTitle.replace() here, but it seems silly to use regex logic when
//	// you just want to drop a fixed size substring occurring at the beginning of the string.
//	// It should be less expensive to do surgery on the string knowing the constraints
//	// (but we should validate this).
//	if(upperTitle.startsWith("WWW.")) {
//		return upperTitle.substring(4);
//	}
//
//	return upperTitle;
//},

_tabGroupEntryToObj: function(groupName, data) {
	let retVal = {
		// Sort the tabs array as you store it
		tabs: data.tabs.sort(Classes.NormalizedTabs.compareTabsFn),
		// "tm" is for the normalized data (see Classes.NormalizedTabs)
		tm: {},
	};

	if(data.type == Classes.GroupsBuilder.Type.HOSTNAME && data.tabs.length == 1 &&
		!settingsStore.isGroupPinned(groupName)) {
		// HOSTNAME groups with only one tab can be turned into type TAB, if they're
		// not pinned (if they're pinned they always need to show up).
		// All other types of groups can't be turned into TAB even if they carry
		// a single TAB (or no tabs at all)
		retVal.type = Classes.GroupsBuilder.Type.TAB;
		retVal.title = data.tabs[0].title;
		retVal.favIconUrl = data.tabs[0].favIconUrl;
	} else {
		retVal.type = data.type;
		retVal.title = groupName;
		retVal.favIconUrl = this._findFavIconUrl(groupName, data.tabs);
	}

	// The normalized title is what we'll use for sorting. We've already added
	// the tm.normTitle to the tabs, now we need to add it to the tabGroup
	// objects we're about to return
	retVal.tm.lowerCaseTitle = retVal.title.toLowerCase();
	retVal.tm.normTitle = Classes.NormalizedTabs.normalizeLowerCaseTitle(retVal.tm.lowerCaseTitle);

	return retVal;
},

// Moved to Classes.NormalizedTabs
//
//// See https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/sort
//// Return -1 if a < b, 0 if a == b and 1 if b < a
//// Used to sort the arrays with elements created by _tabGroupEntryToObj(), or to sort tabs
//// in the tabs array (since both have the "title" property).
//// Titles are compared case insensitive.
//_compareGroupsFn: function(a, b) {
//	// See https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/localeCompare
//	// Eventually we should also specify the locale configured for the browser, but not now...
//	return a.normalizedTitle.localeCompare(b.normalizedTitle);
//},
//
//_compareTabsFn: function(a, b) {
//	// Pinned tabs are always before unpinned tabs.
//	// By construction, a group is pinned if the group is explicitly pinned or if
//	// at least one of its tabs is pinned. So not all tabs in a group have to be
//	// pinned, but pinned tabs should always show first. See _tabGroupsToArrays()
//	if(a.pinned && !b.pinned) {
//		return -1;
//	}
//
//	if(b.pinned && !a.pinned) {
//		return 1;
//	}
//
//	// If we get here, both groups are pinned or unpinned
//	return this._compareGroupsFn(a, b);
//},

_tabsHasPinnedTab: function(tabs) {
	for(let i = 0; i < tabs.length; i++) {
		if(tabs[i].pinned) {
			return true;
		}
	}

	return false;
},

// Turn the dictionary into an array of group info (or individual tabs), then sort
// it alphabetically by title.
//
// Split "tabGroups" into two sets of groups, one pinned, one not pinned.
// A HOSTNAME group must be considered pinned if at least one of the tabs in it is pinned.
// For the pinned set, add also empty pinned groups (pinned groups must show up even
// if they're empty).
_tabGroupsToArrays: function(tabGroups) {
	const logHead = "GroupsBuilder::_tabGroupsToArrays(): ";

	let pinned = [];
	let unpinned = [];

	// Remember that "tabGroups" includes even single tabs as groups-of-one.
	for (const [groupName, data] of Object.entries(tabGroups)) {
		switch(data.type) {
			case Classes.GroupsBuilder.Type.HOSTNAME:
				if(settingsStore.isGroupPinned(groupName) || this._tabsHasPinnedTab(data.tabs)) {
					pinned.push(this._tabGroupEntryToObj(groupName, data));
				} else {
					unpinned.push(this._tabGroupEntryToObj(groupName, data));
				}
				break;

			case Classes.GroupsBuilder.Type.CUSTOM:
				if(settingsStore.isGroupPinned(groupName)) {
					pinned.push(this._tabGroupEntryToObj(groupName, data));
				} else {
					unpinned.push(this._tabGroupEntryToObj(groupName, data));
				}
				break;

			case Classes.GroupsBuilder.Type.PINNEDEMPTY:
				// This should be in the pinned array by definition
				pinned.push(this._tabGroupEntryToObj(groupName, data));
				break;

			default:
				// Classes.GroupsBuilder.Type.TAB is never used by the grouping function,
				// so it should never be found here.
				// We still need to work on the Classes.GroupsBuilder.Type.WINDOWID.
				log._err(logHead + "unknown type " + data.type);
				break;
		}
	}

	this._log(logHead + "unpinned = ", unpinned);
	return [ pinned.sort(Classes.NormalizedTabs.compareTitlesFn),
			unpinned.sort(Classes.NormalizedTabs.compareTitlesFn) ];
},

// Not needed anymore, see TabsTabViewer
//
//// This function is a bit odd, it doesn't really belong to the rest of the flow, it's
//// used in the search case, when no grouping is required. Since all the normalization
//// and sorting logic is in this class, we'll just adopt this function here...
//_normalizeAndSort: function(tabs) {
//	tabs.forEach(
//		function(tab) {
//			// The normalized title is what we'll use for sorting.
//			// A bit uncomfortable modifying tabs coming from chrome.tabs, but
//			// it would take more work (and more time at runtime) to have to
//			// deep copy every tab... let's hope this doesn't break anything...
//			tab.normalizedTitle = this._normalizeTitle(tab.title);
//		}.bind(this)
//	);
//
//	return tabs.sort(this._compareTabsFn.bind(this));
//},

// criterionFn(tab) {} is a function that returns a key to use for grouping the current
// tab, or "null" if a key can't be generated (in which case the tab will be dropped
// and not displayed). Note that at this point every tab can get grouped, even if most
// groups will be groups of one tab. The rendering logic will take care of that.
//
// This function returns an Object with each criterionFn() returned key as key, and
// value set to { type: <string>, tabs: [array] }
_groupByCriterion: function(tabs, criterionFn, type) {
	const logHead = "GroupsBuilder::_groupByCriterion(): ";

	let tabGroups = {};
	
	tabs.forEach(
		function(tab) {
			var key = criterionFn(tab);
			if(key == null) {
				// criterionFn() could not generate a key, drop the tab
				this._err(logHead + "unable to generate key for tab ", tab);
				return;
			}

// This is now done by Classes.NormalizedTabs
//			// The normalized title is what we'll use for sorting.
//			// A bit uncomfortable modifying tabs coming from chrome.tabs, but
//			// it would take more work (and more time at runtime) to have to
//			// deep copy every tab... let's hope this doesn't break anything...
//			tab.normalizedTitle = this._normalizeTitle(tab.title);

			if(key in tabGroups) {
				tabGroups[key].tabs.push(tab);
			} else {
				tabGroups[key] = {
					type: type,
					tabs: [ tab ]
				};
			}
		}.bind(this)
	);

	return tabGroups;
},

_addCustomGroups: function(inputTabGroups) {
	const logHead = "GroupsBuilder::_addCustomGroups(): ";
	let retVal = {};

	// Merge hostnames based on custom groups, when applicable.
	// We chose this route because it allows us to avoid calling _getCustomGroupByHostname() in
	// every _getHostname() call. _getCustomGroupByHostname() is expensive, as it needs to
	// iterate through all the custom regex, so if we can call it once per hostname group
	// (as created by _groupByCriterion()), instead of once per hostname, we should be more
	// efficient (as long as the user has at least two tabs with the same hostname, which
	// should be a very common occurrence).
	// The "disadvantage" is that we need to loop through the hostname groups after they've
	// been created by _groupByCriterion().

	// "key" is a hostname.
	for (const [key, data] of Object.entries(inputTabGroups)) {
		let tabs = data.tabs;

		let title = this._getCustomGroupByHostname(key);
		let type = Classes.GroupsBuilder.Type.CUSTOM;

		if(title == null) {
			// No custom group found, let's just continue to use "key"
			title = key;
			type = data.type; // Classes.GroupsBuilder.Type.HOSTNAME;
		} 

		if(title in retVal) {
			// Append tabs to existing entry.
			// Note that a custom group could use a hostname as title, so let's not
			// forget to take care of that mix-in too. It's automatic in the current
			// logic.
			retVal[title].tabs.push(...tabs);
			if(retVal[title].type == Classes.GroupsBuilder.Type.HOSTNAME &&
				type == Classes.GroupsBuilder.Type.CUSTOM) {
				// If an existing group is currently of type HOSTNAME but we're
				// adding to it tabs of type CUSTOM, the group must become of
				// type CUSTOM. This is covering the case described just above
				// of a custom group using a hostname as title, occurring after
				// the corresponding group has already been populated by the
				// tabs from the original hostname.
				retVal[title].type = Classes.GroupsBuilder.Type.CUSTOM;
			}
		} else {
			// Create new entry
			retVal[title] = {
				type: type,
				tabs: tabs
			};
		}
	}

	return retVal;
},

_addEmptyPinnedGroups: function(tabGroups) {
	// Add empty pinned groups
	settingsStore.getPinnedGroups().getAll().forEach(
		function(groupName) {
			if(groupName in tabGroups) {
				// The group is already populated, nothing to do
				return;
			}
			// The group is not in the object, add it as empty
			tabGroups[groupName] = {
				type: Classes.GroupsBuilder.Type.PINNEDEMPTY,
				// Let's make our life easier by always having "tabs" even if empty...
				tabs: []
			};
		}
	);

	return tabGroups;
},

// Returns a two-elements array, array[0] with an array of pinned tabGroups and tabs,
// array[1] with an array of unpinned tabGroups and tabs.
// The tabs are assumed to have been normalized with Classes.NormalizedTabs.
groupByHostname: function(tabs) {
	let tabGroups = this._groupByCriterion(tabs, this._getHostname.bind(this), Classes.GroupsBuilder.Type.HOSTNAME);

	return this._tabGroupsToArrays(this._addEmptyPinnedGroups(this._addCustomGroups(tabGroups)));
},

groupByWindowId: function(tabs) {
	return this._tabGroupsToArrays(this._groupByCriterion(tabs, this._getWindowId.bind(this), Classes.GroupsBuilder.Type.WINDOWID));
},

// For now only "favIconUrl" is in the group properties
getGroupProperties: function(title) {
	return this._groups[title];
},

}); // Classes.GroupsBuilder

Classes.Base.roDef(Classes.GroupsBuilder, "Type", {});

// Type "HOSTNAME" is a group with title based on hostname
Classes.Base.roDef(Classes.GroupsBuilder.Type, "HOSTNAME", "hostname");
// Type "WINDOWID" is a group with title based on windowId
Classes.Base.roDef(Classes.GroupsBuilder.Type, "WINDOWID", "windowid");
// Type "CUSTOM" is a group with title based on a custom group properties
Classes.Base.roDef(Classes.GroupsBuilder.Type, "CUSTOM", "custom");
// Type "PINNEDEMPTY" is a group with title based on a pinned group, but no data
Classes.Base.roDef(Classes.GroupsBuilder.Type, "PINNEDEMPTY", "pinnedempty");
// Type "TAB" is not a group, it's an individual tab with title based on the tab's title
Classes.Base.roDef(Classes.GroupsBuilder.Type, "TAB", "tab");
