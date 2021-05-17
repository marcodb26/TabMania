// The GarbageCollectionChecker class uses WeakRef() to track objects, and allows
// you to validate when a specific object is getting garbage collected (its weakRef
// can't be dereferenced anymore, deref() returns "undefined"). Simply call add()
// to add objects, then call check() from the Chrome DevTools console to check if
// any of the objects is still dereference-able.
//
// Instances of this class (specifically, the default instance "gcChecker") are intended
// only for use in development, not in production.
Classes.GarbageCollectionChecker = Classes.Base.subclass({

	_weakRefs: null,

	_cnt: null,

_init: function() {
	Classes.Base._init.call(this);

	this.debug();

	this._weakRefs = [];
	this._cnt = 0;

	// Activate this class only in development environments, deactivate it in
	// production by switching "add()" to "emptyFn()"
	if(isProd()) {
		this.add = emptyFn;
	} else {
		this.add({ txt: "a test object" }, "test-obj");
	}
},

// Default value for "label" built with "optional chaining" and "nullish coalescing operator":
// "if obj has a getId() method use that, otherwise say 'undefined' and trigger '??' to return
// an empty string".
add: function(obj, label=obj.getId?.() ?? "") {
	this._weakRefs.push({
		weakRef: new WeakRef(obj),
		label,
		timestamp: performance.now(),
		pos: this._cnt++,
	});
},

// If "clear" is "true", delete the entries that have been garbage collected, until
// the first entry that has not been garbage collected.
// If called with "clear = false", "collected.length" should be equal to "weakRefs.length"
// when things are working correctly (no leaks), while when called with "clear = true",
// "weakRefs.length" should be zero when things are working correctly.
// Offering both options ("clear" true or false) because if things are not working correctly
// it can be useful to find out which objects are being garbage collected, but those are
// gone when the function clears them.
check: function(clear=false) {
	let cleared = [];
	let collected = [];
	let more = true;

	// Remove all the old entries that have been garbage collected until the first
	// entry that has not been
	while(this._weakRefs.length > 0 && clear && more) {
		if(this._weakRefs[0].weakRef.deref() === undefined) {
			let item = this._weakRefs.shift();
			cleared.push(item);
			collected.push(item);
		} else {
			more = false;
		}
	}

	// Now let's browse all the remaining _weakRefs to see if anything else has been
	// garbage collected (but don't clean them up)
	for(let i = 0; i < this._weakRefs.length; i++) {
		if(this._weakRefs[0].weakRef.deref() === undefined) {
			collected.push(this._weakRefs[i]);
		}
	}

	return {
		cleared,
		collected,
		weakRefs: this._weakRefs,
	};
},

}); // Classes.GarbageCollectionChecker

Classes.Base.roDef(window, "gcChecker", Classes.GarbageCollectionChecker.createAs("gcChecker"));


// CLASS BoundArray
// This class defines a version of Array that automatically forces its size to a
// max of "maxElements"
Classes.BoundArray = Classes.Base.subclass({
	_array: null,
	_maxElements: null,

_init: function(maxElements) {
	// Overriding the parent class' _init(), but calling that original function first
	Classes.Base._init.apply(this, arguments);
	this._maxElements = maxElements;
	this._array = [];
	this.debug();
},

resize: function() {
	if(this._array.length >= this._maxElements) {
		this._array.splice(0, this._maxElements - this._array.length);
	}
	return this._array.length;
},

// This function behaves like Array.push(), as it returns the new length of the array,
// except that the length of the array will not change if the array has "maxElements"
// elements in it.
push: function(value) {
	this._array.push(value);
	return this.resize();
},

pop: function() {
	return this._array.pop();
},

isEmpty: function() {
	return this._array.length == 0;
},

// Look at the top of the stack, that is, the next element that would be popped.
// This function returns "null" if the array is empty. If "null" is a valid value
// for the data in _array, make sure to call isEmpty() before calling this function,
// otherwise the return value will be ambiguous.
// The optional parameter "cnt" allows to query for up to "cnt" array elements starting
// from the top. Note that if "cnt" is omitted, the single value is returned as a value,
// while if "cnt" is set (even if "cnt == 1"), the return value is an array of values.
peek: function(cnt) {
	if(this.isEmpty()) {
		return null;
	}

	if(cnt == null) {
		return this._array[this._array.length - 1];
	}

	if(cnt > this._array.length) {
		cnt = this._array.length;
	}
	// Slice from the end of the array.
	return this._array.slice(-cnt);
},

// Unlike Array.concat(), this function pushes multiple value to the existing array
// (concat() pushes the value in a new array).
// "value" is an array of values.
append: function(value) {
	// Using spread operator to add values
	this._array.splice(-1, 0, ...value);
	return this.resize();
},

// Scan the array, and remove all occurrences of a specific value.
// This function uses Array.indexOf() and can only test for equality of simple types.
// If you need a more complex test (e.g. for objects), you should use Array.findIndex()
// instead.
removeValueOLD: function(value) {
	var nextIndex = 0;

	// Continue searching from where you left off. Since we delete one element
	// at a time, nextIndex is always looking at a new starting point even if
	// the actual index looks the same.
	while((nextIndex = this._array.indexOf(value, nextIndex)) != -1) {
		// Delete one element from the array
		this._array.splice(nextIndex, 1);
	}
},

// Scan the array, and remove all occurrences of a specific value.
removeValue: function(value, matchFn) {
	matchFn = optionalWithDefault(matchFn, function(a, b) { return a == b })

	const logHead = "BoundArray::removeValue(" + value + "): ";

	let foundIdx = [];
	for(let i = 0; i < this._array.length; i++) {
		if(matchFn(value, this._array[i])) {
			foundIdx.push(i);
		}
	}

	this._log(logHead + "need to remove these indices:", foundIdx);

	// Now splice all the found values, start from the end to avoid indices shifting
	for(let i = foundIdx.length - 1; i >= 0; i--) {
		this._log(logHead + "now removing index " + foundIdx[i] + " (value = " + this._array[foundIdx[i]] + ")");
		this._array.splice(foundIdx[i], 1);
	}
},

// "pos" is optional. If specified, returns that value, if not, returns the whole
// array. A couple of things to notice:
// - This function is provided to read the array, not to write it. If you write to
//   the array through this function, you're kind of defeating the purpose of this
//   class, but if you know what you're doing, go for it, and possibly call resize()
//   explicitly if you grow the size of the array.
// - The array indices will change when resize() is called, so it's best to iterate
//   the array with one of the Array iterators, rather than a for loop.
get: function(pos) {
	if(pos != undefined) {
		return this._array[pos];
	}
	return this._array;
},

}); // Classes.BoundArray


// CLASS MsgServer
//
// After instantiating a MsgServer, use addCmd() to add protocol actions to be taken. After you've
// added all the commands, call start() to start listening for incoming requests. You can continue
// to add commands after start(), but until you do, the server will send a generic "unknown command"
// error if those commands are requested.

// See the definition of addCmd() for details.
Classes.MsgServer = Classes.Base.subclass({
	_cmdMap: null,

_init: function() {
	// Overriding the parent class' _init(), but calling that original function first
	Classes.Base._init.apply(this, arguments);

	this._cmdMap = {};
},

start: function() {
	// See https://developer.chrome.com/docs/extensions/mv2/messaging/#simple
	chrome.runtime.onMessage.addListener(this._processMsgCb.bind(this));
},

_printTabInfo: function(tab) {
	if(tab) {
		return tab.id;
		//return tab.url;
	}
	
	return "[extension]";
},

_processMsgInner: function(request, sender, sendResponse) {
	// Note that there are some assumptions about this function's behavior made in
	// _processMsgCb(), so if you make changes here, make sure you don't break them,
	// or go change that code too.
	// The assumption is that this function can return "null" only if "request.cmd in this._cmdMap",
	// so the caller doesn't need to check "request.cmd in this._cmdMap" again there.
	if(request.cmd in this._cmdMap) {
		return this._cmdMap[request.cmd].fn.apply(this, arguments);
	} else {
		return this.formatErrMsg("unknown command: " + request.cmd);
	}
},

// Process incoming request. This function is designed for intra-browser messaging.
// This function can have an override if you need native messaging or other messaging,
// and _processMsgInner() is provided in case the override wants to use that basic
// protocol processing functionality.
_processMsgCb: function(request, sender, sendResponse) {
	const logHead = "MsgServer::_processMsgCb(from tab " + this._printTabInfo(sender.tab) + "): ";
	this._log(logHead + JSON.stringify(request), sender);

	var response = this._processMsgInner.apply(this, arguments);

	if(response == null) {
		// Note that given the way _processMsgInner() behaves, "response == null" can be
		// true only if "request.cmd in this._cmdMap"
		if(this._cmdMap[request.cmd].needResponse) {
			// You must return "true", otherwise the sendResponse won't work, Chrome will
			// close the message port when this function returns. Returning "true" tells
			// Chrome the response will be sent asynchronously.
			// See https://stackoverflow.com/questions/44056271/chrome-runtime-onmessage-response-with-async-await
			return true;
		}
		// This is the case of processing a notification that doesn't require a response.
		// I've searched a lot, but couldn't find any documentation describing how to handle
		// proper "notifications", it looks like the Chrome messaging APIs always need a
		// response, so let's send a dummy one here...
		sendResponse("");
		return false;
	}

	// this._log(logHead + "the response is: ", response);
	sendResponse(response);
	return false;
},

// "fn" has signature fn(request, sender, sendResponse).
// "fn" must return a response object if "fn" is synchronous, or "null" to signal
// that the function is async, and therefore it will respond later by itself.
// "fn" should call "sendResponse" only in the async case, not in the sync case.
// Set "needResponse" to "false" if this command is a notification, not a request/response.
// When "needResponse" is "false", this class doesn't try to call sendResponse()
// (see _processMsgCb())
addCmd: function(cmd, fn, needResponse) {
	needResponse = optionalWithDefault(needResponse, true);

	var cmdWrapper = safeFnWrapper(fn, null,
		function(e) {
			this._err("cmd \"" + cmd + "\" generated an exception: ", e);
			return this.formatErrMsg(e.message, e.toString());
		}.bind(this)
	);

	this._cmdMap[cmd] = { fn: cmdWrapper, needResponse: needResponse };
},

// This function can be used as a static function (Classes.MsgServer.formatErrMsg())
formatErrMsg: function(msg, details) {
	var retVal = { status: "error", message: msg };
	if(details != null) {
		retVal.details = details;
	}
	return retVal;
},

}); // CLASS MsgServer


// CLASS MsgClient
//
// This is a simple Promise-based wrapper of chrome.runtime.sendMessage() that tracks
// chrome.runtime.lastError as a Promise.reject().
// Note that only "transport level errors" (that is, chrome.runtime.lastError) trigger a
// onRejected() callback from the Promise. "Protocol level errors" (that is, response.status = "error")
// should be handled as part of the onFulfilled() callback.

Classes.MsgClient = Classes.Base.subclass({

_init: function() {
	// Overriding the parent class' _init(), but calling that original function first
	Classes.Base._init.apply(this, arguments);
},

// This implementation of _requestInner() is intended for intra-browser messaging.
// For native messaging, you need to override it.
_requestInner: function(request) {
	const logHead = "MsgClient::_requestInner(" + JSON.stringify(request) + "): ";
	this._log(logHead + "entering")
	return chromeUtils.wrap(chrome.runtime.sendMessage, logHead, request);
},

_formatRequest: function(cmd, otherOptions) {
	return { cmd: cmd, ...otherOptions };
},

sendRequest: function(cmd, otherOptions) {
	const request = this._formatRequest.apply(this, arguments);

	return this._requestInner(request).then(
		function(response) {
			this._debugResponse(cmd, response);
			return response;
		}.bind(this)
	);
},

sendNotification: function(cmd, otherOptions) {
	const notification = this._formatRequest.apply(this, arguments);

	// The only difference between sendRequest() and sendNotification() is that
	// sendNotification() doesn't expect a response, so there's no point in having
	// a then().
	return this._requestInner(notification);
},

_debugResponse: function(cmd, response) {
	const logHead = "MsgClient::_debugResponse(" + cmd + "): ";
	if(response.status != "success") {
		this._err(logHead + "response failed: " + JSON.stringify(response));
	}
},

}); // Classes.MsgClient



function optArrayWithDefault(value, defaultValue) {
	if(typeof(value) === "undefined" || value == null || value.length == 0) {
		return defaultValue;
	}
	return value;
}

function delay(delayTime) {
	return new Promise(function(resolve) { 
		setTimeout(resolve, delayTime);
	});
}

// Capture exceptions from callback, and don't let them propagate.
// Useful in logic that needs to be resilient to failures.
// "errMsgPrefix" is optional, but if it's "null", the error will be suppressed
// with no logging. If you don't have a prefix but want the error to be emitted,
// pass in errMsgPrefix = "" instead of "null".
// "errFn" is an optional function to be called if the callback is supposed to
// return a value even in case of failures (or if you want to do something else
// when a failure occurs). If you don't specify one, the wrapper returns "undefined"
// in case of errors.
//
// Note that uglifyjs tends t inline this function, and it will complain about
// duplicated definitions of variables if you call "fnToWrap" as "fn" and the caller
// uses "fn" too... best to give "fn" here a unique name...
function safeFnWrapper(fnToWrap, errMsgPrefix, errFn) {
	return function() {
		try {
			// apply(null) should leave the context set by the bind() used when
			// passing the function "fnToWrap" in.
			// Or at least that's the claim here: https://stackoverflow.com/a/40277458
			// Anyway we can use the spread operator and avoid the entire problem...
			return fnToWrap(...arguments);
		} catch(e) {
			if(errMsgPrefix != null) {
				tmUtils.err(errMsgPrefix + e.message + " |", e);
			}
			if(errFn != null) {
				return errFn(e, ...arguments);
			}
		}
	}
}

function isUrl(url) {
	try {
		let urlObj = new URL(url);
		// If the constructor doesn't throw an exception, this is a URL
		return true;
	} catch(e) {
		// Should check if it's a TypeError, but let's assume it's always a TypeError
		return false;
	}
}

function stackTrace() {
	return new Error().stack;
}

function asyncFn(fn) {
	// Per the text right before section https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise#incumbent_settings_object_tracking
	// the .then() of a Promise is always asynchronous, even if the promise
	// has already "settled":
	//      [...] an action for an already "settled" promise will occur only after
	//      the stack has cleared and a clock-tick has passed. The effect is much
	//      like that of setTimeout(action,10).
	return Promise.resolve().then(fn);
}