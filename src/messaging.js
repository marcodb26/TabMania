// The message format is the same for the local (intra-browser) messaging (InBrowserMsgServer) and
// for the native messaging host messaging (NmhClient).
//
// The request message format is:
//
// { cmd: "[cmd]", [ other properties are command-dependent ] }
//
// The response messages format is:
//
// { status: "success"|"error", debug: "[...]", [ other properties are status-dependent ] }
//
// "debug" can be anything the sender wishes to provide to aid troubleshooting.
//
// If status == "error", then the message format is:
//
// { status: "error", debug: "[...]", message: "err msg", details: "more details about err msg" }




// CLASS InBrowserMsgServer
//
// Current commands list
//
// - "getWifiSignalHistory"
// - "getRequestsHistory"
// - "testNative": receives a request from the popup to invoke a "test" command to NMH.
Classes.InBrowserMsgServer = Classes.MsgServer.subclass({

_init: function() {
	// Overriding the parent class' _init(), but calling that original function first
	Classes.MsgServer._init.apply(this, arguments);

	this.addCmd("testNative", this._cmdTestNative.bind(this));
},

// This is just an example of what we would need to do if we wanted to proxy requests
// from the popup to the NMH, since only background.js can use native messaging to NMH
_cmdTestNative: function(request, sender, sendResponse) {
	chrome.runtime.sendNativeMessage(nativeExtensionId,
		request,
		function(sendLocalResponse, response) {
			this._log("MsgServer::_cmdTestNative().cb(): received from native " + JSON.stringify(response));
			sendLocalResponse(response);
		}.bind(this, sendResponse)
	);

	// See comment at MsgServer.addCmd()
	return null;
},
}); // CLASS InBrowserMsgServer

// CLASS NmhServer
// Use the ID of the Native Extension as ID for the class instance (in NmhServer.createAs())
//
// Current commands list
//
// - [none]
Classes.NmhServer = Classes.MsgServer.subclass({

	// You need to call NmhServer.start() to initialize "_nativePort"
	_nativePort: null,

_init: function() {
	// Overriding the parent class' _init(), but calling that original function first
	Classes.MsgServer._init.apply(this, arguments);
	this.roDef(this, "_nmhExtensionId", this._id);
},

// Override MsgServer.start()
start: function() {
		// See https://developer.chrome.com/docs/apps/nativeMessaging/
	this._nativePort = chrome.runtime.connectNative(this._nmhExtensionId);

	// The listener for "onDisconnect" must be bound immediately after connectNative(), because
	// that's the only way to find out that connectNative() failed
	this._nativePort.onDisconnect.addListener(this._onDisconnectCb.bind(this));

	this._nativePort.onMessage.addListener(this._processMsgCb.bind(this));
	//this._nativePort.postMessage({ text: "ping" });
},

_onDisconnectCb: function() {
	const logHead = "NmhServer::_onDisconnectCb(): ";
	if (chrome.runtime.lastError) {
		this._err(logHead + "disconnected due to: " + chrome.runtime.lastError.message);
	} else {
		this._log(logHead + "disconnected");
	}
},

// Override MsgServer._processMsgCb()
_processMsgCb: function(request) {
	const logHead = "NmhServer::_processMsgCb(args count = " + arguments.length + "): ";

	this._log(logHead + JSON.stringify(request));

	var response = this._processMsgInner(request);
	this._nativePort.postMessage(response);
},

}); // CLASS NmhServer

// CLASS NmhClient
// Use the ID of the Native Extension as ID for the class instance (in NmhClient.createAs())
//
// Current commands list
//
// - "getWifiData"
// - "poll"
// - "test"
//
Classes.NmhClient = Classes.MsgClient.subclass({
_init: function() {
	// Overriding the parent class' _init(), but calling that original function first
	Classes.MsgClient._init.apply(this, arguments);
	this.roDef(this, "_nmhExtensionId", this._id);
},

// Override MsgClient._requestInner()
_requestInner: function(request) {
	const logHead = "NmhClient::_requestInner(): ";
	return chromeUtils.wrap(chrome.runtime.sendNativeMessage, logHead, this._nmhExtensionId, request);
},

isNmhInstalled: function() {
	return this.sendRequest("poll").then(
		// onFulfilled
		function() {
			return true;
		},
		// onRejected
		function(chromeLastError) {
			const logHead = "NmhClient::isNmhInstalled().onRejected(): ";
			// So far we've seen errors:
			// - "Error when communicating with the native messaging host.": when the service was
			//   exiting due to a parse error caught at service startup
			// - "Native host has exited.": when the service was exiting at runtime due to an error
			// - "Specified native messaging host not found." (NMH_NOTFOUND): when the this._nmhExtensionId is not
			//   installed on this system
//			if(chromeLastError.message == "Specified native messaging host not found.") {
			if(chromeLastError.message == chromeUtils.Error.NMH_NOTFOUND) {
				this._log(logHead + chromeLastError.message);
				return Promise.resolve(false);
			}
			// If we get here, we've hit another chromeLastError.message, but since that's signaling
			// a non-functioning native extension (not an uninstalled one), we should let the caller
			// know the extension is installed. If the error repeats, we'll find it elsewhere too...
			this._err(logHead + chromeLastError.message);
			return Promise.resolve(true);
		}.bind(this)
	);
},

});
