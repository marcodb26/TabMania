// CLASS ScheduledJob
// This class is "abstract" in the sense that it requires a _job() function to
// be defined by its subclasses. It assumes such function exists.

Classes.ScheduledJob = Classes.Base.subclass({
	_handle: null,
	_jobName: null,
	_recurInterval: null,

// The argument "jobFn" is optional, use it only if you don't plan to subclass and
// override the _job() method
// "jobName" is optional, for debugging purposes only.
_init: function(jobFn, jobName) {
	// Overriding the parent class' _init(), but calling that original function first
	Classes.Base._init.call(this);

	this._jobName = optionalWithDefault(jobName, "");

	// We won't call _job() directly, we need to give an opportunity for subclasses to
	// "rename" the _job() function (Classes.Poller renames it to _poll()).
	// Don't try to override _jobFn, override _job

	if(jobFn != null) {
		// Override the local method _job()
		this._jobFn = jobFn;
	} else {
		this._jobFn = this._job;
	}
},

// run() runs the job once without recurrence, possibly with a delay before starting.
// start() starts a recurring execution of the job.
//
// run() called with a non-zero "delay" ignores the new call if there's already a job
// scheduled. That either means you're trying to run() with a scheduled recurring job
// in place, or you're trying to run() with delay a job that's already queued to be
// executed with some delay.
// If instead run() is called without a delay, run() overrides the current scheduled
// job. This means that:
//      (a) run(2000)  ---[1s]---> (b) run(0)
// in that sequence (b) will run and (a) won't run when the 2,000ms elapse.
// Since they're running the same job, we're just saying "(a) wanted the job to run
// after 2s, (b) wanted it to run immediately", we run it now, once and for both.
// Instead, in the case of:
//      (a) run(2000)  ---[1s]---> (b) run(2000)
// (a) will be executed after 2s, and (b) will be suppressed because it needed to run
// and it did run, though early as part of (a)'s request (1s after (b) tried to schedule
// (because (a) was already waiting), instead of 2s as requested).
// If you have a recurring job started with start(), run(0) will still run the job once
// now, and restart the regular recurrence automatically.
run: function(delay) {
	const logHead = "ScheduledJob::run(delay = " + delay + ", now: " + Date.now() +
				", job name: \"" + this._jobName + "\", handleId: " + this._handle + "): ";

	// Note that this code is not going to run as intended if the _jobFn() includes
	// asynchronous elements. In a more robust implementation we'd want the _jobFn()
	// to return a Promise, and we'd set a _handle until that Promise is resolved.
	// This is an improvement for later, when we'll need to support async calls here.

	// Preempt a delayed run, either one-shot or recurring.
	if(delay == null || delay == 0) {
		// Skip what's scheduled, and run now
		this.skip();
		this._jobFn();
		return;
	}

	if(this._handle != null) {
		this._log(logHead + "already scheduled");
		// To be more accurate (and more aligned to the "delay = 0" behavior), here
		// we should adjust the delay of the next invocation to the smaller between
		// "delay", and the amunt of time left from the scheduled invocation.
		// We can consider this enhancement later.
		return;
	}

	this._handle = setTimeout(
		function() {
			this._jobFn();
			this._handle = null;
		}.bind(this),
		delay
	);
},

// "runOnceNow" is optional (default "true") and determines whether the caller
// wants the job recurrence to start now, or after the first interval has elapsed.
start: function(interval, runOnceNow) {
	runOnceNow = optionalWithDefault(runOnceNow, true);
	const logHead = "ScheduledJob::start(" + interval + ", job name: \"" + this._jobName + "\", handleId: " + this._handle + "): ";

	if(this.isRunning()) {
		this._log(logHead + "already scheduled");
		return;
	}

	// The next two variables should be set "atomically", so don't put any unknown
	// code (that is, _jobFn()) in between, just in case...
	this._recurInterval = interval;
	this._handle = this._safeSetInterval(this._jobFn.bind(this), interval);

	this._log(logHead + "started");

	if(runOnceNow) {
		// Run the job once now, then start the interval-based execution
		this._jobFn();
	}
},

stop: function() {
	const logHead = "ScheduledJob::stop(job name: \"" + this._jobName + "\", handleId: " + this._handle + "): ";
	if(!this.isRunning()) {
		this._log(logHead + "not scheduled");
		return;
	}

	this._log(logHead + "stopping");
	if(this._recurInterval == null) {
		clearInterval(this._handle);
		this._recurInterval = null;
	} else {
		clearTimeout(this._handle);
	}
	this._handle = null;
},

// This function "skips" one recurrence of a recurring job, and sets
// the next recurrence one full "interval" later. In other words, the
// caller of skip() might accelerate a run() compared to what was scheduled,
// then restart business as usual.
skip: function() {
	const logHead = "ScheduledJob::skip(job name: \"" + this._jobName + "\", handleId: " + this._handle + "): ";
	if(this._handle == null) {
		this._log(logHead + "not scheduled");
		return;
	}

	this._log(logHead + "skipping");

	let savedRecurInterval = this._recurInterval;
	this.stop();

	if(savedRecurInterval != null) {
		this.start(savedRecurInterval, false);
	}
},

discard: function() {
	this.stop();
	this._jobFn = null;
	gcChecker.add(this);
},

isRunning: function() {
	return (this._handle != null);
},

_job: function() {
	this._errorMustSubclass("ScheduledJob::_job()");
},

// Javascript's native setInterval() is a pain. Apparently it doesn't check the value of "interval",
// and if it's undefined, setInterval() will happily start a tight loop of execusion. While writing
// new code, the chances of mistakenly passing the wrong "interval" argument are not negligible, and
// unfortunately it's happened to me twice so far to pass a string or no value at all.
// For some reason, when this happens, the whole system becomes unresponsive, and the only solution
// is to do a hard reset. I didn't expect Javascript to be capable to take down the entire OS, but
// I can see it's possible, so we have to be very careful with "interval" validation for setInterval().
_safeSetInterval: function(fn, interval) {
	const logHead = "ScheduledJob::_safeSetInterval(): ";
	if(typeof interval !== "number") {
		this._err(logHead + "interval is not a number (" + interval + "), bypassing setInterval() to avoid trouble");
		return;
	}
	if(interval < 1000) {
		this._err(logHead + "interval is too small (" + interval + "), bypassing setInterval() to avoid trouble");
		return;
	}
	
	return setInterval(fn, interval);
},

}); // Classes.ScheduledJob
