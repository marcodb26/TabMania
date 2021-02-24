var tmUtils = (function() {

function genLogFn(consoleFn) {
	return Function.prototype.bind.call(consoleFn, console, "[TabMania] ");
};

return {

_log: genLogFn(console.log),
_err: genLogFn(console.error),

};

})();

// "tmExp" is the variable exported by the "--wrap" of uglifyjs, but uglifyjs
// wraps it so that inside it's called "exports".
// See /build/build-dev.sh for more details.
exports.test = function() {
	tmUtils._log("This is a test");
};