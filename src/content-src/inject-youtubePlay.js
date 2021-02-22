//console.error("Perf measures: ", performance.getEntries());

let playLabel = "Play (k)";
let pauseLabel = "Pause (k)";

function getPlayButton(ariaLabel) {
	const logHead = "getPlayButton(): ";

	let nodeList = document.querySelectorAll("[aria-label='" + ariaLabel + "']");

	if(nodeList.length == 0) {
		return null;
	}

	if(nodeList.length > 1) {
		tmUtils._log(logHead + "unexpected, more than one node");
		// We're going to ignore the others and just return the first...
	}

	return nodeList[0];
}

// If there's a playLabel, that means the player is not playing
let playButtonElem = getPlayButton(playLabel);

if(playButtonElem != null) {
	// We can start the playback
	playButtonElem.click();
	tmUtils._log("Returning 'started'");
	return "started";
}

// Now let's see if there's a pauseLabel, meaning the player is playing
playButtonElem = getPlayButton(pauseLabel);

if(playButtonElem != null) {
	// We can stop the playback
	playButtonElem.click();
	tmUtils._log("Returning 'stopped'");
	return "stopped";
}

tmUtils._log("Returning 'not found'");
return "not found";
