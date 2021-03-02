// CLASS AsyncQueue
//
Classes.AsyncQueue = Classes.Base.subclass({

	_eventManager: null,

	_queue: null,

	// This class batches the processing based on entries count, not based on elapsed
	// time. Using elapsed time would give us a more accurate balancing of the processing
	// time regardless of the cost of processing each entry. We might decide to switch
	// to that later, but for now we're using this only for tiles rendering, and that
	// cost is kind of well known, and not an issue.
	_batchSize: 50,

	// The _runQueue() can release control to other code before resuming processing
	// other entries in the queue, so we need an explicit flag tracking whether or
	// not it's active
	_running: null,
	_discarded: null,

_init: function() {
	const logHead = "AsyncQueue::_init(): ";

	// Overriding the parent class' _init(), but calling that original function first
	Classes.Base._init.call(this);
	this.debug();
	//this._log.trace(logHead + stackTrace());

	// Do we need this?
	this._eventManager = Classes.EventManager.create();
	this._eventManager.attachRegistrationFunctions(this);

	this._queue = [];
	this._running = false;
	this._discarded = false;
},

_isRunning: function() {
	return this._running;
},

_isDiscarded: function() {
	return this._discarded;
},

// "processFn" cannot be async, and it's mandatory.
// "resumeFn" cannot be async, and it's optional. It's expected to return "true" if we
// can continue processing, or "false" if there's a need to interrupt processing and exit.
// "cleanupFn" must be async, and it's optional.
//
// This function returns "true" if we're in an active state, and "false" if the AsyncQueue
// was discarded while we were waiting for the next event cycle during our processing.
_processQueue: async function(perfLabel, processFn, resumeFn, cleanupFn) {
	const logHead = "AsyncQueue::_processQueue(): ";

	// We want to immediately check if we can't resume (that is, this AsyncQueue
	// has been discarded). The reason is that _processQueue() is called in a
	// while() loop, and the caller gets interrupted between each iteration
	// (due to the "await" in the caller), so anything can happen during that
	// interruption, where "anything" is:
	// 1. More stuff has been enqueued (that's covered by the loop outside _processQueue()
	// 2. This AsyncQueue has been discarded (covered here by checking immediately
	//    for that specific condition.
	// As a side effect of this sequence of "starting as if a batch had just ended",
	// we'll also call "delay(0)" immediately, and that will slow down the starting
	// of the processing by one full event cycle. Good or bad? If bad, we can always
	// use the same "firstRound" correction (see below) to capture "no delay(0) in
	// the first round" too.
	let processedCnt = this._batchSize;

	// In order for the perfProf data to be accurate, we want to enter the loop
	// with a "BatchStart" mark, not with a "BatchEnd" mark. Given the explanation
	// above, we're starting as if we were ending an iteration, but we want to
	// correct that for the purposes of perfProf.
	let firstRound = true;

	while(this._queue.length > 0) {
		if(processedCnt >= this._batchSize) {
			if(!firstRound) {
				perfProf.mark(perfLabel + "AsyncQueueBatchEnd" + this._id);
				// By putting the "delay(0)" here, we avoid it getting called
				// during the first iteration of _processQueue(), making it
				// a bit more responsive... except that this way it won't have
				// had time to get much enqueued, and it will do very little
				// the first time.
				await delay(0);
			} else {
				firstRound = false;
			}

//			this._log(logHead + "pausing, queue length = " + this._queue.length);
			// Wait for the next event cycle to resume processing
			//await delay(0);
//			this._log(logHead + "resuming, queue length = " + this._queue.length);

			processedCnt = 0;
			// Since we waited for the next event cycle, anything might have happened
			// while we were waiting, did this AsyncQueue get discarded?
			if(resumeFn != null && !resumeFn()) {
				// We got discarded, so we've decided we need to stop iterating
				if(cleanupFn != null) {
					await cleanupFn();
				}
				// Signal the caller that we don't want to be called back again from
				// the outer loop (in case cleanupFn() did not empty the queue...)
				return false;
			}
			perfProf.mark(perfLabel + "AsyncQueueBatchStart" + this._id);
		}

		let entry = this._queue.shift();
		processFn(entry);
		processedCnt++;
	}

	perfProf.mark(perfLabel + "AsyncQueueBatchEnd" + this._id);
	return true;
},

_discardProcessFn: function(entry) {
	if(entry.discardFn != null) {
		entry.discardFn();
		// Note that the entry.resolveFn/rejectFn won't be called when we're discarding entries
	}
},

_runResumeFn: function() {
	return !this._isDiscarded();
},

_runProcessFn: function(entry) {
	let retVal = entry.fn();
	entry.resolveFn(retVal);
},

_runCleanupFn: async function() {
	const logHead = "AsyncQueue::_runCleanupFn(): ";
	this._log(logHead + "entering, queue length = " + this._queue.length);

	await this._processQueue("discard", this._discardProcessFn.bind(this));
},

_runQueue: async function() {
	const logHead = "AsyncQueue::_runQueue(): ";
	if(this._isRunning()) {
		// If there's already an active _runQueue(), nothing to do
		return;
	}

	this._log(logHead + "entering");

	this._running = true;

	perfProf.mark("runAsyncQueueStart" + this._id);

	let normalState = true;
	// Try at all costs to avoid this outer _runQueue() from leaving
	// without resetting _running back to "false"... if it goes out of
	// sync, it will remain "true" forever, and no more processing will
	// be done (it will be "stuck").
	try {
		// See the comment inside _processQueue() for the reasons for this
		// while loop. _processQueue() can decide that there's nothing left
		// to do and return, but the "await" here will cause this function
		// to get back control only one event cycle later, not immediately.
		// During that event cycle, anything can happen, so we can't rely on
		// the decision of _processQueue() to come back in "normalState", we
		// must revalidate if the queue is empty or not.
		// _processQueue() at least once more
		while(this._queue.length > 0 && normalState) {
			normalState = await this._processQueue("run", this._runProcessFn.bind(this),
												this._runResumeFn.bind(this), this._runCleanupFn.bind(this));
		}
	} catch(e) {
		this._err(logHead, e);
	}

	perfProf.mark("runAsyncQueueEnd" + this._id);
	
	// No more work, make sure to unset the _running flag
	this._running = false;
},

_enqueueInner: function(queueEntry) {
	this._queue.push(queueEntry);
	this._runQueue();
},

// "fnSignature" is for debugging
enqueue: function(fn, fnSignature) {
//	const logHead = "AsyncQueue::enqueue(" + fnSignature + "): ";

	return new Promise(
		function(resolveFn, rejectFn) {
//			this._log(logHead + "enqueueing");
			let queueEntry = {
				// For now we assume "fn" is not async (Promise-based) on its own. If it's async,
				// we need to take some other actions that are not currently captured in the code
				// (mostly, call it with "await").
				fn: safeFnWrapper(fn, fnSignature, rejectFn),
				resolveFn: resolveFn,
				rejectFn: rejectFn,
				// When discard() is called on this class, discardFn() is called on all the entries
				// of the queue (if they have one).
				discardFn: null,
			};
			this._enqueueInner(queueEntry);
		}.bind(this)
	);
},

// Discard anything that might still be in the queue. "discard()" moves the AsyncQueue to an
// unusable terminal state.
discard: async function() {
	const logHead = "AsyncQueue::discard(): ";
	//this._log.trace(logHead + stackTrace());

	this._discarded = true;

	if(!this._isRunning()) {
		// Unlikely there's anything to cleanup if it's not running...
		this._assert(this._queue.length == 0);
		// But anyway, just in case, perform the cleanup
		if(this._queue.length > 0) {
			await this._runCleanupFn();
		}
	}
}

}); // Classes.AsyncQueue
