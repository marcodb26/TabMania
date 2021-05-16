// This file should be included first, given the basic stuff that's defined here.

// OOP model used in this code
//
// All classes are objects defined under the "Classes" namespace.
// To subclass, use:
//        Classes.subClass = Classes.parentClass.subclass({ ... new definitions });
// or alternatively:
//        Classes.subClass = Object.assign({}, Classes.parentClass, { ... new definitions });
//
// To instantiate an object of a class, use:
//        obj = Classes.class.create();
//
// All classes should subclass Classes.Base, as it defines some common properties and the
// create() behavior.
// Classes.class.create() creates an instance of a Classes.class, and by default it assigns
// it an internal identifier. The internal identifier can be overridden by passing a different
// identifier to create(). The internal identifier gets allocated anyway, even if you override
// the _id of the instance, but it won't be visible.
// The identifier is automatically prepended to all calls to console.log() and console.err()
// if you use the local wrappers _log() and _err().
//
// When you subclass Classes.Base, never override create(), constructor capabilities are
// offered by the _init() function.
//
// Other conventions
// - Public interfaces of a class have names starting with letters, "private" methods have
//   names starting with "_". This is just a visual convention, convenient for code inspection,
//   but with no enforcing at runtime.
// - Function with the "Cb" postfix are "callbacks".
// - If a class defined an abstract function (which must be overridden), use the function
//   _errorMustSubclass() to track potential calls of the function in a subclass that didn't
//   properly override.


// See lib/prod.js for the source of "window.productionCode"
function isProd() {
	// Using the "nullish coalescing operator" of ES2020.
	// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Nullish_coalescing_operator
	return window.productionCode ?? false;
}

// Note that this function sets a default value even if value is "null", not
// only if it's "undefined". Don't use this function if you care about the
// "null" value.
//
// OBSOLETE, replaced by the "nullish coalescing operator" of ES2020.
//
function optionalWithDefault(value, defaultValue) {
	if(typeof(value) === "undefined" || value == null) {
		return defaultValue;
	}
	return value;
}

// In a number of places we need to use empty functions as markers. They work
// better than "null" because they don't require extra checks before calling
// a function returned by another function, and have no side effects.
// Creating a single empty function here and reusing it everywhere else should
// make the minimized code a little more compact ("return emptyFn" is shorter
// than "return function(){}" even without minimization).
function emptyFn() {}


Classes = {};

// CLASS Base
// This class is "abstract", it's intended to only be subclassed.
Classes.Base = {

	// The _id property will be defined at create() time
	// _id: null,
	
	// Using _Base_ to avoid polluting the main namespace. In the old days you could
	// do this with an anonymous function.
	_Base_: {
		// Static property
		lastId: 0,
		_idGen: function() {
			return ++(this.lastId);
		}
	},

	// Subclasses that want to modify the default behavior of _formatId() should override
	// __idPrefix during class definition. Initialize here, to use this as a static, overridable
	// property.
	// See _formatId() for details, and Classes.TileViewer for an example use.
	__idPrefix: null,

// Static function (here meaning, it doesn't use "this", though that's not always true,
// it could use the "this" of the class (like _Base_._idGen(), not the "this" of the instance,
// and still be static).
roDef: function(obj, propName, propValue) {
	Object.defineProperty(obj, propName, {
		value: propValue,
		// You must use "configurable: true" to be able to change a property again by
		// calling Object.defineProperty() multiple times on the same property (or to
		// delete the property).
		// See https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/defineProperty
		configurable: true,
		enumerable: false,
		writable: false
	});
},

// "setPrefix" (default "false") is a flag that controls whether or not the returned log
// function should have a standard prefix attached.
// Note that the standard prefix (or any prefix) must actually consume the "msg" argument
// of the log(), so it can be a problem if you want to use formatting characters and
// substitution in your log message, as that can only happen in the first argument "msg".
// See https://developer.mozilla.org/en-US/docs/Web/API/Console/log and
// https://developer.mozilla.org/en-US/docs/Web/API/console#outputting_text_to_the_console 
// "setPrefix = false" allow you to keep the "msg" argument available to be used by callers
// of the generated log function.
// "consoleObj" is a special case to handle this._log.bg(), see the definition of _log.bg()
// in debug() for more details. Defaults to the standard "console" object.
_genLogFn: function(consoleFn, setPrefix=false, consoleObj=console) {
	if(!setPrefix) {
		// Leave "msg" alone
		return Function.prototype.bind.call(consoleFn, consoleObj);
	}

	// https://stackoverflow.com/questions/9559725/extending-console-log-without-affecting-log-line
// With highlight:
//	const context = "%c[" + this._id + "]";
//	return Function.prototype.bind.call(consoleFn, consoleObj, context, "font-weight:bold;");

	return Function.prototype.bind.call(consoleFn, consoleObj, "[" + this._id + "]");
},

//_activeAssert: function(conditionToBeTrue, errMsg) {
//	errMsg = optionalWithDefault(errMsg, "assertion failed");
//	if(!conditionToBeTrue) {
//		this._err(errMsg);
//	}
//},

// create() functions as a constructor. You should not need to subclass the create() function,
// only change _init() to alter the constructor's behavior. create() passes all its arguments
// to _init().
// If you need to override the standard ID assigned by create(), use createAs() instead.
create: function(/* ... */) {
	return this.createAs(null, ...arguments);
},

// Similar to create(), except that it allows you to override the ID of the instance.
// Use "rest arguments" to collect all arguments after "id" as an array.
createAs: function(id, ...restArgs) {
	// See https://stackoverflow.com/questions/10430279/extending-an-object-in-javascript
	// Why did I follow that convention, it's crazy... there's no constructor, which means
	// we need to manually initialize this._data somehow (don't initialize it in this
	// object, otherwise all instances will share the same array (!)), but we need to
	// call Object.create() with an object, and we can't use PollerC, otherwise all the
	// subclasses will instantiate PollerC instead of the subclass...
	// Luckily Object.create() using "this" works fine...
	// There must be a better way, the old fashioned messing around with function().prototype
	// sounded a lot better than this crap...

	var retVal = Object.create(this);
	// Assign a read-only ID to the object
	this.roDef(retVal, "_hiddenId", this._Base_._idGen());
	//console.log("retVal._hiddenId = " + retVal._hiddenId);
	// Calling _formatId() gives an opportunity for subclasses to format IDs differently
	// since all of this happens before _init() is invoked.
	this.roDef(retVal, "_id", (id == null) ? this._formatId(retVal._hiddenId) : id);

	// We need to define these methods this way because they need to use the _id of
	// the instance, and this is the only way to inject that value in the wrappers.
	// The advantage of using these wrappers is that the Chrome console will show the
	// right line numbers (of the callers), not the line numbers inside the wrapper
	// functions.

	// this.debug() can be used to initialize everything except retVal._err()
	// We're calling _genLogFn() in the context of retVal, since we need to create
	// the log prefix using the _id of retVal
	this.debug.call(retVal, false);
	this.roDef(retVal, "_err", this._genLogFn.call(retVal, console.error, true));

// No more chrome.extension.getBackgroundPage() with manifest v3
//	let bgConsoleObj = chrome.extension.getBackgroundPage().console;
//	// See debug() for details about _log.bg() and _err.bg().
//	this.roDef(retVal._err, "bg", this._genLogFn.call(retVal, bgConsoleObj.error, true, bgConsoleObj));

	// We want the option to replace _assert() with an empty function in production.
	// Don't use "setPrefix" (set it to "false" or omit it) for _genLogFn() of _assert(),
	// otherwise the prefix takes the place of the boolean assertion(!)
	this.roDef(retVal, "_assert", this._genLogFn.call(retVal, console.assert));

	// Complete initialization of the class, pass all arguments received by createAs()
	// to _init(), except the "id", which is available as this._id inside _init()
	retVal._init.apply(retVal, restArgs);
	return retVal;
},

// Turn on (flag = true, default) or off (flag = false) logging to console.
// Note that logging errors (_err()) can't be disabled right now.
debug: function(flag=true) {
	if(flag && !isProd()) {
		this.roDef(this, "_log", this._genLogFn(console.log, true));
		this.roDef(this._log, "raw", this._genLogFn(console.log, false));
		this.roDef(this._log, "trace", this._genLogFn(console.trace, true));
		// console.log() and console.info() are identical in Chrome.
		// See https://developers.google.com/web/tools/chrome-devtools/console/api#info
		// Maybe we should use console.debug and console.info to differentiate,
		// something to consider later...
	//	this.roDef(this._log, "info", this._genLogFn(console.info, true));

// No more chrome.extension.getBackgroundPage() with manifest v3
//		// _log.bg() sends the messages to the console of the background page.
//		// It should only be called from inside the popup (getBackgroundPage()
//		// doesn't seem to work from injected scripts).
//		let bgConsoleObj = chrome.extension.getBackgroundPage().console;
//		this.roDef(this._log, "bg", this._genLogFn(bgConsoleObj.log, true, bgConsoleObj));
	} else {
		this.roDef(this, "_log", emptyFn);
		this.roDef(this._log, "raw", emptyFn);
		this.roDef(this._log, "trace", emptyFn);
	//	this.roDef(this._log, "info", emptyFn);
//		this.roDef(this._log, "bg", emptyFn);
	}
},

subclass: function(extension) {
	return Object.assign({}, this, extension);
},

getId: function() {
	return this._id;
},

// Use _init() to perform initialization in your constructor.
_init: function() {
	// Nothing extra to do for Classes.Base, just including this function here for completeness
},

// Override this function to trigger a different behavior for the default ID.
// This function doesn't get invoked if createAs() was called with an "id" argument.
// By default this function adds the __idPrefix to create unique IDs that are also
// a bit more readable as DOM IDs.
// "hiddenId" is the this._hiddenId.
_formatId: function(hiddenId) {
	if(this.__idPrefix == null) {
		// Default behavior, identity function
		return hiddenId;
	}

	return this.__idPrefix + "-" + hiddenId;
},

// Any argument you pass to this function will go directly to console.error()
_errorMustSubclass: function() {
    return Function.prototype.bind.call(console.error, console, "This method must be subclassed: ");
}(),

}; // Classes.Base

// CLASS AsyncBase
Classes.AsyncBase = Classes.Base.subclass({
	_initPromise: null,
	_initialized: null,

_init: function() {
	// Overriding the parent class' _init(), but calling that original function first
	Classes.Base._init.call(this);

	this._initialized = false;
	this._initPromise = this._asyncInit().then(
		function() {
			this._initialized = true;
		}.bind(this)
	);
},

_asyncInit: function() {
	return Promise.resolve();
},

isInitialized: function() {
	return this._initialized;
},

getInitPromise: function() {
	return this._initPromise;
},

}); // Classes.AsyncBase

// CLASS EventManager
// A simple wrapper to the DOM event functions.
// Note that the element created by this class should never be attached
// to the DOM.
//
// Only one instance of a class should own an instance of EventManager
// if you want to use the notifyListeners() interface. If you need to
// share, use the underlying dispatchEvent() instead.
Classes.EventManager = Classes.Base.subclass({
	_elem: null,

	_ownerObj: null,

// If "domId" is "undefined", the element will not be appended to the DOM.
// See Classes.PopupDockerBg for use cases of appending these DOM elements
// to the real DOM.
_init: function(domId) {
	// Overriding the parent class' _init(), but calling that original function first
	Classes.Base._init.call(this);

	this._elem = document.createElement("div");

	if(domId != null) {
		this._elem.setAttribute("id", domId);
		document.body.append(this._elem);
	}

	this.addEventListener = this._elem.addEventListener.bind(this._elem);
	this.removeEventListener = this._elem.removeEventListener.bind(this._elem);
},

dispatchEvent: function(eventName, detailObj) {
	// See https://developer.mozilla.org/en-US/docs/Web/Guide/Events/Creating_and_triggering_events
	// and https://developer.mozilla.org/en-US/docs/Web/API/CustomEvent
	// Note that "detail" is the preferred key to be used, per the documents above
	this._elem.dispatchEvent(new CustomEvent(eventName, { detail: detailObj }));
},

// This function generates a standard event, including a "detail.target" with
// the current objec owning the EventManager.
// "extraData" is any extra properties you want in the "detail" section
// of the generated event
notifyListeners: function(eventId, extraData={}) {
	let detail = Object.assign({ target: this._ownerObj }, extraData);
	this.dispatchEvent(eventId, detail);
},

// Attaches addEventListener() and removeEventListener() to "obj", so that
// it can behave as if it "owned" the events in its interface
attachRegistrationFunctions: function(obj) {
	// Note, no need to add .bind() here, it's already bound by _init()
	// to the this._elem context.
	obj.addEventListener = this.addEventListener;
	obj.removeEventListener = this.removeEventListener;

	// We assume a single instance of a class owns an instance of EventManager,
	// so that instance should call attachRegistrationFunctions() only once...
	this._assert(this._ownerObj == null);
	this._ownerObj = obj;
},

addEventListener: function() {
	// Empty placeholder, replaced during _init(), don't write code here
},

removeEventListener: function() {
	// Empty placeholder, replaced during _init(), don't write code here
},

}); // Classes.EventManager

Classes.Base.roDef(Classes.EventManager, "Events", {});
Classes.Base.roDef(Classes.EventManager.Events, "UPDATED", "tmUpdated");


// CLASS EventListenersWrapper
//
// This wrapper is intended to simplify the discard() action of instances of other
// classes, by storing all the historical event listeners registered by those instances.
// The problem is that addEventListener() store a "strong reference" to objects, making
// it impossible to garbage-collect the objects that performed registrations, unless
// those same registrations are removed explicitly. On the other hand, removing a
// registration can be very verbose in the code, because you first need to store the
// exact callback (with bind()) for every registration to be removed, then make all
// those removeEventListener() calls.
//
// This wrappers allows you to perform all those removeEventListener() in one go without
// all that extra boilerplate.
Classes.EventListenersWrapper = Classes.Base.subclass({

	_weakRefListeners: null,
	_listenFnName: null,
	_unlistenFnName: null,

// Chrome uses "addListener" and "removeListener" instead of "addEventListener" and
// "removeEventListener". The call arguments are also slightly different, but this
// class doesn't care what arguments are taken by these functions, it just stores
// whatever arguments are passed to listen(), then play them back (though it tries
// to play nice by using WeakRef() whenever possible).
_init: function(listenFnName="addEventListener", unlistenFnName="removeEventListener") {
	Classes.Base._init.call(this);

	this.debug();

	this._weakRefListeners = [];
	this._listenFnName = listenFnName;
	this._unlistenFnName = unlistenFnName;
},

// "listenerArgs" is the same sequence of arguments you'd pass to the addEventListener function
listen: function(obj, ...listenerArgs) {
	const logHead = "EventListenersWrapper.listen():";

	if(obj == null) {
		this._err(logHead, "event target can't be null", obj);
		return;
	}

	let weakRefArgs = [];
	for(let i = 0; i < arguments.length; i++) {
		// See https://v8.dev/features/weak-references for a good primer on WeakRef
		if([ "function", "object" ].includes(typeof arguments[i])) {
			try {
				weakRefArgs[i] = {
					weakRef: new WeakRef(arguments[i]),
					type: "weakRef",
				};
			} catch(e) {
				this._err(logHead, "building new WeakRef(), on argument ", i, arguments[i]);
				throw e;
			}
		} else {
			weakRefArgs[i] = { 
				arg: arguments[i],
				type: "standard",
			};
		}
	}

	this._weakRefListeners.push(weakRefArgs);
	obj[this._listenFnName].apply(obj, listenerArgs);
},

// Make sure unlisten() has the same arguments list of listen().
//
// Note that this function does not update "this._weakRefListeners", which continues
// to accumulate new registrations from this.listen(). Given we're using weakMap()
// for objects stored, this should not be a big problem. Besides, none of the existing
// classes perform sequences of add/remove listener, they tend to just add all listeners
// during initialization, then take no further actions.
unlisten: function(obj, ...listenerArgs) {
	obj[this._unlistenFnName].apply(obj, listenerArgs);
},

_unlistenWrapper: function(weakRefObj, ...listenerWeakRefArgs) {
	let allArgs = [];
	for(let i = 0; i < arguments.length; i++) {
		switch(arguments[i].type) {
			case "weakRef":
				allArgs[i] = arguments[i].weakRef.deref();
				break;
			case "standard":
				allArgs[i] = arguments[i].arg;
				break;
		}
		if(allArgs[i] === undefined) {
			// Event target (obj) or listener already garbage collected, nothing to do
			return;
		}
	}

	this.unlisten.apply(this, allArgs);
},

discard: function() {
	for(let i = 0; i < this._weakRefListeners.length; i++) {
		this._unlistenWrapper.apply(this, this._weakRefListeners[i]);
	}
	this._weakRefListeners = [];
}

}); // Classes.EventListenersWrapper


// CLASS Error
Classes.Error = Classes.Base.subclass({
_init: function() {
	// Overriding the parent class' _init(), but calling that original function first
	Classes.Base._init.apply(this, arguments);
},

}); // Classes.Error

Classes.Base.roDef(Classes.Error, "NOTRUNNING", "Not running");
