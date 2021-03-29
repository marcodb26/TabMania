// CLASS SerialPromises
//
// This class serializes a Promise-based function call to avoid having multiple copies
// running at the same time. Only the latest waiting call is actually executed, any other
// waiting call enqueued earlier gets suppressed.
//
Classes.SerialPromises = Classes.Base.subclass({

	_currPromise: null,
	_nextPromise: null,

_init: function() {
	// Overriding the parent class' _init(), but calling that original function first
	Classes.Base._init.call(this);

	this.debug();

	this._currPromise = null;
	this._nextPromise = null;
},

_resetCurrPromise: function() {
	this._currPromise = null;
},

_runNext: function(nextPromise, nextFn, debugInfo) {
	const logHead = "SerialPromises::_runNext(" + debugInfo + "): ";
	if(nextPromise != null && nextPromise != this._nextPromise) {
		this._log(logHead + "suppressing old call");
		return null;
	}

	this._log(logHead + "running new call");
	this._currPromise = nextFn();
	// Call this._resetCurrPromise() regardless of whether this._currPromise resolves
	// or rejects (that's why it shows up twice below)
	return this._currPromise.then(this._resetCurrPromise.bind(this), this._resetCurrPromise.bind(this));
},

// "nextFn" must return a Promise, and have all its arguments bound
next: function(nextFn, debugInfo) {
	if(this._currPromise == null) {
		return this._runNext(null, nextFn, debugInfo);
	}

	this._nextPromise = new Promise(
		function(resolve, reject) {
			this._currPromise.then(resolve, resolve);
		}.bind(this)
	)

	return this._nextPromise.then(this._runNext.bind(this, this._nextPromise, nextFn, debugInfo));
},

}); // Classes.SerialPromises