chrome.runtime.onInstalled.addListener(
	function() {
		console.log("onInstalled.addListener() called");
		//alert("background.js: onInstalled.addListener() called");
	}
);

window.addEventListener("error",
	function(e) {
		console.log("Unhandled exception: " + e.error.message);
		return false;
	}
);

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

function init() {
	// Waiting for the async initialization of the settingsStore before starting
	// the background tasks
	settingsStore.getInitPromise().then(
		function() {
			inBrowserMsgServer = Classes.InBrowserMsgServer.createAs("inBrowserMsgServer");
			inBrowserMsgServer.start();
			
			////// Interacting with tabs
			tabsManager = Classes.TabsManager.createAs("tabsManager");
			tabsManager.debug();

			bgInitPromiseResolveFn();
		}
	);
}

