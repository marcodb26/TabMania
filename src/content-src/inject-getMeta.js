//console.error("Perf measures: ", performance.getEntries());

// Returns "null" if "attrs" can't be parsed as a key/value pair
// of "name|property -> value"
function parseStructured(attrs) {
	if(attrs.length != 2) {
		return null;
	}

	let key = null;
	let value = null;

	for(let i = 0; i < attrs.length; i++) {
		switch(attrs[i].name) {
			case "name":
			case "property":
				key = attrs[i].value;
				break;
			case "content":
				value = attrs[i].value;
				break;
			default:
				return null;
		}
	}

	if(key == null || value == null) {
		return null;
	}

	return [ key, value ];
}

function parseUnstructured(attrs) {
	let retVal = [];

	// Note that "elem.attributes" is not an array, it's a NameNodeMap,
	// See https://developer.mozilla.org/en-US/docs/Web/API/Element/attributes
	for(let i = 0; i < attrs.length; i++) {
		retVal.push(attrs[i].name + " => " + attrs[i].value);
	}
	return retVal;
}

function getMetaTags() {
	const metaElems = document.getElementsByTagName("meta");
	
	let retVal = {
		parsed: {},
		unparsed: []
	};

	// "metaElems" is not an array, and doesn't have forEach()
	for(let i = 0; i < metaElems.length; i++) {
		if(!metaElems[i].hasAttributes()) {
			continue;
		}
		
		let keyVal = parseStructured(metaElems[i].attributes);
		if(keyVal != null) {
			retVal.parsed[keyVal[0]] = keyVal[1];
		} else {
			retVal.unparsed.push(parseUnstructured(metaElems[i].attributes));
		}
	}

	return retVal;
}

let retVal = getMetaTags();
//console.log("TabManager - getMetaTags(): ", retVal);

return retVal;
