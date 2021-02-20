// Include this file first, but only in production builds.
// Leave this file out for development builds.

function setProd(flag) {
	Object.defineProperty(window, "productionCode", {
		value: flag,
		// You must use "configurable: true" to be able to change a property again by
		// calling Object.defineProperty() multiple times on the same property (or to
		// delete the property).
		// See https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/defineProperty
		configurable: false,
		enumerable: false,
		writable: false
	});
}

setProd(true);
