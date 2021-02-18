function multiLog(msg) {
	if(isProd()) {
		return;
	}

	console.log("popup.js - " + msg);
	// In some cases it's convenient to show log messages all in the same place,
	// and the background page is a good place for that
	chrome.extension.getBackgroundPage().console.log("popup.js - " + msg);
}

window.addEventListener("error",
	function(e) {
		console.error("Unhandled exception: " + e.error.message, e);
		return false;
	}
);


// Do all the DOM event listeners initialization inside the "load" event handler
window.addEventListener("load", init);

var popupMsgServer = null;

function testSettings() {
	settingsStore.setOptionSearchUrl("https://duckduckgo.com/?q=%s");
	settingsStore.setOptionShowTabId(true);
	settingsStore.setOptionAdvancedMenu(true);
	settingsStore.pinGroup("Work");
	settingsStore.getShortcutsManager().setShortcut(window.ExtCommands.SHORTCUT01,
		{
			hostname: "mail.google.com",
		}
	);
	settingsStore.getShortcutsManager().setShortcut(window.ExtCommands.SHORTCUT02,
		{
			url: "https://lapl.overdrive.com/search?query=%s",
			useClipboard: true,
		}
	);

	settingsStore.getCustomGroupsManager().setCustomGroup("Microsoft", {
		favIconUrl: "https://azurecomcdn.azureedge.net/cvt-5a6d098bd41d86e10abc9c93a784dea7f4f9eccc980ab08c0ffe9f3c2412a6e8/images/icon/favicon.ico",
		color: "red",
//		regexList: ".*\\.microsoft\\.com"
		matchList: ".microsoft.com"
	});
	settingsStore.getCustomGroupsManager().setCustomGroup("Work", {
		favIconUrl: "https://community.atlassian.com/html/assets/favicon-16x16.png",
		color: "blue",
//		regexList: "jira\\.rvbdtechlabs\\.net\nwiki\\.rvbdtechlabs\\.net\nrvbdtech\\.sharepoint\\.com"
		matchList: "jira.rvbdtechlabs.net\n  wiki.rvbdtechlabs.net    \n rvbdtech.sharepoint.com"
	});
	settingsStore.getCustomGroupsManager().setCustomGroup("Companies", {
		color: "green",
//		regexList: "crunchbase\\.com\nowler\\.com"
		matchList: "crunchbase.com\nowler.com"
	});
}

function init() {
	//multiLog("Popup loaded");

	perfProf.mark("windowLoaded");

	// Waiting for the async initialization of the settingsStore before starting
	// the popup
	Promise.all([ settingsStore.getInitPromise(), localStore.getInitPromise() ]).then(
		function() {
			if(!isProd()) {
				testSettings();
			}

			popupMsgServer = Classes.PopupMsgServer.create();
		//	popupMsgServer.debug();
			popupMsgServer.start();

			let rootElem = document.getElementById("popup-tabs-div");

			perfProf.mark("popupViewerStart");
			let popupViewer = Classes.PopupViewer.createAs("popup-tabs", rootElem);

			perfProf.measure("Loading window", undefined, "windowLoaded");
			perfProf.measure("Loading settings", "settingsStarted", "settingsLoaded");
			perfProf.measure("Loading localStore", "localStoreStarted", "localStoreLoaded");
			perfProf.measure("Creating popupViewer", "popupViewerStart", "popupViewerEnd");
			perfProf.measure("Attaching popupViewer", "popupViewerEnd", "attachEnd");

			//perfProf.log();
		}
	);	
}




