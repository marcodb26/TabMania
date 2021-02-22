var tmUtils = (function() {

function genLogFn(consoleFn) {
	return Function.prototype.bind.call(consoleFn, console, "[TabMania] ");
};

return {

_log: function(){},
_err: genLogFn(console.error),

}

})();