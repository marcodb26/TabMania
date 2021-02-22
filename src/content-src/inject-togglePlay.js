// buttonWithInnerClass() must select the button, not the inner class...
function OLDbuttonWithInnerClass(info) {
	// If there's a "pausedAria", that means the player is not playing
	let playButtonElem = getPlayButtonByClass(info.buttonClass);

	if(playButtonElem == null) {
		tmUtils._log("Main button not found. Returning 'not found'");
		return "not found";
	}

	// We can toggle the playback
	playButtonElem.click();

	if(playButtonElem.getElementsByClassName(info.playingClass).length != 0) {
		tmUtils._log("Returning 'started'");
		return "started";
	}

	if(playButtonElem.getElementsByClassName(info.pausedClass).length != 0) {
		tmUtils._log("Returning 'stopped'");
		return "stopped";
	}

	tmUtils._log("Main button found, but no icon class. Returning 'not found'");
	return "not found";
}


// "subquery" is optional, if specified, we search for the first node in the nodeList
// that satisfies the subquery on its descendents. This is a way to overcome the problem
// with CSS descendant combinator selectors [ class + descendant class ] returning the
// descendant, not the ancestor, and we need the ancestor.
// 
// See https://developer.mozilla.org/en-US/docs/Web/CSS/Descendant_combinator and
// https://stackoverflow.com/questions/1014861/is-there-a-css-parent-selector
function getFirstElementByQuery(query, logHead, subquery) {
	let nodeList = document.querySelectorAll(query);

	if(nodeList.length == 0) {
		tmUtils._log(logHead + "not found (before subquery)");
		return null;
	}

	if(subquery != null) {
		let filteredNodeList = [];
		// Try to find the first node satisfying the subquery
		for(let i = 0; i < nodeList.length; i++) {
			let subqueryNodeList = nodeList[i].querySelectorAll(subquery);
			if(subqueryNodeList.length > 0) {
				filteredNodeList.push(nodeList[i]);
			}
		}
		nodeList = filteredNodeList;

		if(nodeList.length == 0) {
			tmUtils._log(logHead + "not found (after subquery)");
			return null;
		}
	}

	if(nodeList.length > 1) {
		tmUtils._log(logHead + "unexpected, more than one match: " + nodeList.length);
		// We're going to ignore the others and just return the first...
	}

	tmUtils._log(logHead + "found one match");
	return nodeList[0];
}

// In this case "buttonClassName" is mandatory
function getPlayButtonByClass(buttonClassName, innerClassName) {
	// CSS descendant combinator selector of class + descendant class
	// See https://developer.mozilla.org/en-US/docs/Web/CSS/Descendant_combinator
	// No good, it returns the descendant, not the ancestor (that is, the button)
	//
	//let query = `.${buttonClassName} .${innerClassName}`;
	let query = `.${buttonClassName}`;
	let subquery = `.${innerClassName}`;

	const logHead = "getPlayButtonByClass(\"" + query + "\", \"" + subquery + "\"): ";
	// Note that people recommend avoiding using getElementsByClassName():
	// https://stackoverflow.com/questions/54952088/how-to-modify-style-to-html-elements-styled-externally-with-css-using-js/54952474#54952474
	// That's why here we're also using querySelectorAll().
	return getFirstElementByQuery(query, logHead, subquery);
}

// "buttonClassName" is optional, but it's good to have in case more than one element
// in the DOM includes the same "aria-label"
function getPlayButtonByAria(buttonClassName, ariaLabel) {
	// CSS selector of class + attribute
	let query = `[aria-label="${ariaLabel}"]`;
	if(buttonClassName != null) {
		query = "." + buttonClassName + query;
	}
	const logHead = "getPlayButtonByAria(" + query + "): ";
	return getFirstElementByQuery(query, logHead);
}

function buttonToggleInner(getPlayButtonFn, buttonClassName, pausedQualifier, playingQualifier) {
	// If there's a "pausedAria", that means the player is not playing
	let playButtonElem = getPlayButtonFn(buttonClassName, pausedQualifier);

	if(playButtonElem != null) {
		// We can start the playback
		playButtonElem.click();
		tmUtils._log("Returning 'started'");
		return "started";
	}

	// Now let's see if there's a "playingAria", meaning the player is playing
	playButtonElem = getPlayButtonFn(buttonClassName, playingQualifier);

	if(playButtonElem != null) {
		// We can stop the playback
		playButtonElem.click();
		tmUtils._log("Returning 'stopped'");
		return "stopped";
	}

	tmUtils._log("Returning 'not found'");
	return "not found";
}

function buttonWithInnerClass(info) {
	return buttonToggleInner(getPlayButtonByClass, info.buttonClass, info.pausedClass, info.playingClass);
}

function buttonWithAria(info) {
	return buttonToggleInner(getPlayButtonByAria, info.buttonClass, info.pausedAria, info.playingAria);
}


const sites = {
	"99percentinvisible.org/": {
		//toggleFn: ???
		//
		// Two separate buttons:
		// <button class="jp-play" role="button" tabindex="0" style="display: inline-block;"><i class="fa fa-play"></i></button>
		// <button class="jp-pause" role="button" tabindex="0" style="display: none;"><i class="fa fa-pause"></i></button>
		//
		// Only one button is active, and that has style "display: inline-block"

		// <div class="jp-detail">
        //   <div class="jp-title" aria-label="title">12 Heads from the Garden of Perfect Brightness</div>
        //   <div class="jp-counter">
        //     <div class="jp-current-time" role="timer" aria-label="time">01:08</div> | 
		//     <div class="jp-duration" role="timer" aria-label="duration">41:39</div>
        //   </div>
        // </div>
		// Interesting also the "jp-title", with the embedded player, the title of what's playing
		// has nothing to do with the title of the website...
	},

	"www.cnn.com": {
		toggleFn: buttonWithInnerClass,
		buttonClass: "pui_center-controls_big-play-toggle",
		playingClass: "pause-icon",
		pausedClass: "play-icon",
		
		// <div class="sc-gzVnrw pui_control-bar_playback-time sc-jqCOkK eOIrQv">
		//   <span>00:57</span>
		//   <span> / </span>
		//   <span>01:48</span>
		// </div>
		// The first span is the current time, the last one is the total duration
	},
	
	"www.youtube.com": {
		toggleFn: buttonWithAria,
		buttonClass: "ytp-play-button",
		playingAria: "Pause (k)",
		pausedAria: "Play (k)",
		// <div class="ytp-time-display notranslate">
		//   <span class="ytp-time-current">1:20:26</span>
		//   <span class="ytp-time-separator"> / </span>
		//   <span class="ytp-time-duration">3:35:14</span>
		// </div>
		// The problem is that <span class="ytp-time-current"> only updates when the
		// progress bar is visible in the video
	},

	"zoom.us": {
		toggleFn: buttonWithAria,
		buttonClass: "vjs-play-control",
		playingAria: "Pause",
		pausedAria: "Play",

		// Current time in <span class="vjs-time-range-current"> under <div class="vjs-time-range">
		// Total duration in <span class="vjs-time-range-duration"> under <div class="vjs-time-range">
	}
};


// MAIN

// Search the full hostname first, then start peeling off subdomains to see if
// there's a more generic match. e.g. start with "www.youtube.com", then "youtube.com".
// We stop when we only have two elements in a domain name.
let hostnameSplit = window.location.hostname.split(".");

while(hostnameSplit.length > 1) {
	let hostname = hostnameSplit.join(".");

	if(hostname in sites) {
		tmUtils._log(hostname + " in sites DB");
		let siteInfo = sites[hostname];
		return siteInfo.toggleFn(siteInfo);
	}

	hostnameSplit.shift();
}

tmUtils._log("no known info about " + window.location.hostname);
return null;