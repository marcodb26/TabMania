chrome.runtime.onInstalled.addListener(
	function() {
		if(!isProd()) {
			console.log("onInstalled.addListener() called");
		}
	}
);

if(!isProd()) {
	window.addEventListener("error",
		function(e) {
			console.log("Unhandled exception: " + e.error.message);
			return false;
		}
	);
}

window.addEventListener("load", init);

var inBrowserMsgServer = null;
var tabsManager = null;

var bgInitPromiseResolveFn = null;

// Attach a then() to this promise to wait for background.js to be ready
var backgroundInitPromise = new Promise(
	function(resolve, reject) {
		bgInitPromiseResolveFn = resolve;
	}
);

function openUrlCb(request, sender, sendResponse) {
	// Open URL in a new window ("chrome.windows.WINDOW_ID_NONE"). If we try to open the
	// URL in the current window, it will cause the popup to close. If the popup closes,
	// when we send the response it will trigger an error on the console ("Receiving end
	// does not exist").
	// Using notifications instead of request/response doesn't change anything, because
	// internally Chrome only understands request/response, and so we need to send a
	// dummy response which triggers the same error on console. Opening in a new window
	// allows us to keep the popup open, which is also goodness from a troubleshooting
	// standpoint, given that if the popup closes, the console of the popup closes too,
	// and all its logs are lost.
	// Opening in a new window doesn't seem to be too bad either from a UX perspective,
	// but just beware of the consequences of thinking of changing that back to opening
	// a tab in the current window (which is by necessity the window where you had the
	// popup running).
	chromeUtils.loadUrl(request.url, null, chrome.windows.WINDOW_ID_NONE).then(
		function() {
			sendResponse({ status: "success"});
		}
	);

	// Signal we'll send an async response
	return null;
}

function init() {
	// Waiting for the async initialization of the localStore/settingsStore before starting
	// the background tasks
	Promise.all([ settingsStore.getInitPromise(), localStore.getInitPromise() ]).then(
		function() {
			Classes.Base.roDef(window, "popupDockerBg", Classes.PopupDockerBg.create());

			inBrowserMsgServer = Classes.InBrowserMsgServer.createAs("inBrowserMsgServer");
			inBrowserMsgServer.start();
			inBrowserMsgServer.debug();
			inBrowserMsgServer.addCmd("launchUrl", openUrlCb);
			
			////// Interacting with tabs
			tabsManager = Classes.TabsManager.createAs("tabsManager");
			tabsManager.debug();

			let keyboardShortcuts = Classes.KeyboardShortcuts.createAs("keyboardShortcuts");
			keyboardShortcuts.debug();

			bgInitPromiseResolveFn();
		}
	);
	
	// test
//	let myImage = new Image();
//	myImage.onerror = function(e) {
//		console.error("Got here: ", e);
//	}
//	myImage.src = "chrome://favicon/size/16@1x/https://example.com/doesntexist";
//	myImage.src = "https://example.com/doesntexist";
//	document.body.appendChild(myImage);
}

