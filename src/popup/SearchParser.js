// CLASS SearchParser
//
Classes.SearchParser = Classes.Base.subclass({

	// _parserDebug is an alias for _log() to be turned on/off as needed, since
	// debugging messages for the parser can be very verbose
	_parserDebug: null,

	_binaryOpPrecedenceList: {
		"and": 2,
		"or": 1
	},

// "value" is optional
_init: function(value) {
	const logHead = "SearchParser::_init(): ";
	// Overriding the parent class' _init(), but calling that original function first
	Classes.Base._init.call(this);
	this.debug();

	// this._parserDebug = this._log;
	this._parserDebug = emptyFn;
},

// Unlike SearchTokenizer._setRegexToken(), this function does not set the "error" property
// in the node, because if a regex parse fails, the function attempting to create a regex
// should give up and not create the regex (mostly used by the optimization code: "if you
// can't convert to a regex, don't follow that optimization path").
_parseRegex: function(regexText) {
	let regex = null;

	try {
		// The flag "i" means "ignoreCase"
		regex = new RegExp(regexText, "i");
	} catch(e) {
		const logHead = "SearchParser::_parseRegex(): ";
		this._log(logHead + "unable to parse regex for text /" + regexText + "/: ", e);
		return null;
	}
	return regex;
},

buildRegexValue: function(node) {
	return this._parseRegex(this._mergeNodeSources(node));
},

isRegexParsable: function(node) {
	switch(node.type) {
		case Classes.SearchTokenizer.type.REGEX:
			if(node.error == null) {
				return true;
			}
			return false;

		default:
			return this._parseRegex(tmUtils.regexEscape(node.value)) != null;
	}
},

_updateUnaryOps: function(tokenList) {
	const logHead = "SearchParser::_updateUnaryOps(): ";
	
	let newTokenList = [];

	let i = 0;

	while(i < tokenList.length) {
		let node = tokenList[i];
		newTokenList.push(node);

		// Process a unary operator and consume its operand. Consider that a unary operator
		// could be followed by another unary operator (e.g "badge:-active" to indicate take
		// all tabs that are not active), or the maybe less useful "--active" to double negate
		// active (and pick active).
		while(node.type == Classes.SearchTokenizer.type.UNARYOP && i < tokenList.length) {
			// Evaluate the next token
			i++;
			if(i < tokenList.length) {
				// More nodes to process
				node.operand = tokenList[i];
				// The operand of the unary operator could be another unary operator, in which
				// case we need to continue to consume tokens and pass them down as operands of
				// the next unary operator in the chain
				node = node.operand;
			} else {
				// The last node was an unary operator, and there are no more nodes to process.
				// Unary operator at the end of the tokenList, no operand, the operator needs to be
				// demoted to standard text. Note that we demote unary operators, but we don't demote
				// binary operators (we add dummy nodes instead).
				// Marking as _err() instead of _log() because this should never happen by construction,
				// so if it happens, the SearchTokenizer.tokenize() logic is broken.
				this._log(logHead + "unary operator without operand (end of tokenList), demoting to text")
				node.type = Classes.SearchTokenizer.type.TEXT;
			}
		}
		// If we entered the inner while() then got out, "i" points to the last "node.operand",
		// which has been consumed by assigning it as node.operand. If we didn't enter the inner
		// while(), "i" points to the node we've just finished processing and added to newTokenList.
		// In either case, we need to increment "i" again.
		i++;
	}

	return newTokenList;
},

_addImplicitNodes: function(tokenList) {
	const logHead = "SearchParser::_addImplicitNodes(): ";
	
	let newTokenList = [];

	let i = 0;

	if(tokenList[0].type == Classes.SearchTokenizer.type.BINARYOP) {
		// A binaryOp at the beginning of the tokenList means we're missing a
		// left operand. This is a special case of the more general "two consecutive
		// binaryOps" tracked in the "while" loop, let's do the same thing, add
		// a dummy text node before it.
		this._log(logHead + "invalid syntax, binary operator at beginning of query string, adding dummy node");
		newTokenList.push({ type: Classes.SearchTokenizer.type.TEXT, value: "" });
	}

	while(i < tokenList.length) {
		let node = tokenList[i];

		newTokenList.push(node);

		// Check if there are two consecutive text strings, that means an implicit
		// "and" needs to be added in between
		if(node.type != Classes.SearchTokenizer.type.BINARYOP) {
			// Lookahead...
			if(tokenList.length > i + 1) {
				if(tokenList[i + 1].type != Classes.SearchTokenizer.type.BINARYOP) {
					// Two consecutive non-binaryOp, we need to insert a binaryOp
					// in between, the implicit binaryOp is "and"
					newTokenList.push({ type: Classes.SearchTokenizer.type.BINARYOP, value: "and" });
				}
			}
		}

		// Check if there are two consecutive binaryOps. That is illegal syntax, but
		// to be gentle, we insert a dummy string and move on...
		if(node.type == Classes.SearchTokenizer.type.BINARYOP) {
			// Lookahead...
			if(tokenList.length > i + 1) {
				if(tokenList[i + 1].type == Classes.SearchTokenizer.type.BINARYOP) {
					// Two consecutive binaryOp, we need to insert dummy text
					// in between, and let's also report the syntax error
					this._log(logHead + "invalid syntax, two consecutive binary operators, adding dummy node");
					newTokenList.push({ type: Classes.SearchTokenizer.type.TEXT, value: "" });
				}
			} else {
				// We reached the last tokem, but a binaryOp can't be a last token,
				// it needs to be followed by a right operand, let's add a dummy text one
				this._log(logHead + "invalid syntax, binary operator at end of query string, adding dummy node");
				newTokenList.push({ type: Classes.SearchTokenizer.type.TEXT, value: "" });
			}
		}

		i++;
	}

	return newTokenList;
},

getBinaryOpPrecedence: function(binaryOp) {
	return this._binaryOpPrecedenceList[binaryOp];
},

_parseSubtree: function(node) {
	if(node.type == Classes.SearchTokenizer.type.SUBTREE) {
		return this.parse(node.value);
	}

	// Not a subtree in itself, but we also still need to parse subtrees attached to unary operators
	if(node.type == Classes.SearchTokenizer.type.UNARYOP) {
		node.operand = this._parseSubtree(node.operand);
	}

	return node;
},

// From https://en.wikipedia.org/wiki/Operator-precedence_parser
//
// test query: a a or (site:b -c)
_parseInner: function(leftOperand, minPrecedence, tokenList) {
	const logHead = "SearchParser::_parseInner(): ";
	this._parserDebug(logHead + "entering, minPrecedence: " + minPrecedence + ", leftOperand: ", JSON.stringify(leftOperand));

	// Peek next token
	let lookahead = tokenList[0];
	this._parserDebug(logHead + "outer lookahead: ", JSON.stringify(lookahead));

	while(lookahead != null && lookahead.type == Classes.SearchTokenizer.type.BINARYOP &&
			this.getBinaryOpPrecedence(lookahead.value) >= minPrecedence) {
		let op = tokenList.shift(); // same as "lookahead", but now we must update tokenList
		let rightOperand = tokenList.shift();

		this._assert(rightOperand.type != Classes.SearchTokenizer.type.BINARYOP);

		// Peek next token
		lookahead = tokenList[0];
		this._parserDebug(logHead + "inner lookahead: ", JSON.stringify(lookahead));

		while(lookahead != null && lookahead.type == Classes.SearchTokenizer.type.BINARYOP &&
				this.getBinaryOpPrecedence(lookahead.value) > this.getBinaryOpPrecedence(op.value)) {

			rightOperand = this._parseInner(rightOperand, minPrecedence + 1, tokenList);
			this._parserDebug(logHead + "innermost right operand: ", JSON.stringify(rightOperand));

			lookahead = tokenList[0];
			this._parserDebug(logHead + "innermost lookahead: ", JSON.stringify(lookahead));
		}

		op.operands = [ this._parseSubtree(leftOperand), this._parseSubtree(rightOperand) ];

		this._parserDebug(logHead + "op assigned operands: ", JSON.stringify(op));
		
		leftOperand = op;
	}

	// If the entire search is emcapsulated in parantheses, the top level tokenList has
	// a single token of type "subtree". When that happens, we don't enter the "while"
	// loop at all, and therefore the subtree remains unprocessed. We need to take care
	// of it now, if that's the case.
	return this._parseSubtree(leftOperand);
},

parse: function(tokenList) {
	const logHead = "SearchParser::parse(): ";
	tokenList = this._updateUnaryOps(tokenList);
	tokenList = this._addImplicitNodes(tokenList);
	this._parserDebug(logHead + "after cleanup:", tokenList);

	let leftOperand = tokenList.shift();
	parsedTree = this._parseInner(leftOperand, 1, tokenList);
	this._parserDebug(logHead + "after parsing:", parsedTree);
	return parsedTree;
},

cloneTree: function(node) {
	// We're not using tmUtils.deepCopy() here because we have to deal with RegExp
	// objects, which seem to be a bit complicated in Chrome, and don't want to have
	// to deal with managing them in tmUtils.deepCopy()

	const logHead = "SearchParser::cloneTree(): ";

	let newNode = {
		type: node.type,
	};

	switch(node.type) {
		case Classes.SearchTokenizer.type.BINARYOP:
			newNode.operands = [];
			for(let i = 0; i < node.operands.length; i++) {
				newNode.operands.push(this.cloneTree(node.operands[i]));
			}
			// repeat() ceates a new string from the original string
			// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/repeat
			newNode.value = node.value.repeat(1);
			break;

		case Classes.SearchTokenizer.type.UNARYOP:
			newNode.operand = this.cloneTree(node.operand);
			newNode.value = node.value.repeat(1);
			break;

		case Classes.SearchTokenizer.type.TEXT:
		case Classes.SearchTokenizer.type.QUOTEDTEXT:
			newNode.value = node.value.repeat(1);
			break;

		case Classes.SearchTokenizer.type.REGEX:
			// No need for a deep copy of sources, since sources are read-only
			newNode.sources = [].concat(node.sources);
			if(node.error != null) {
				// No deep copy in this case, it seems harmless to stick with the
				// same error object, we never edit error objects
				newNode.error = node.error;
			} else {
				this._assert(node.value != null, logHead + "original node has null regex");
				newNode.value = this.buildRegexValue(node);
				// If the original had no error, this should not cause an error...
				this._assert(newNode.value != null, logHead + "copied node has null regex");
			}
			break;

		case Classes.SearchTokenizer.type.TRUTH:
			// We don't expect cloneTree() to be called for an optimized parsed tree,
			// and only optimized parsed trees can have nodes of type TRUTH
			this._assert(node.type != Classes.SearchTokenizer.type.TRUTH, logHead + "unexpected");
			newNode.value = node.value.repeat(1);
			break;

		default:
			this._err(logHead + "unknown node type \"" + node.type + "\"");
	}

	return newNode;
},

// LOGIC TO REBUILD TEXT QUERY FROM PARSED TREE

_escapeText: function(text, tokenType, quoteChar) {
	let retVal = "";
	let escapedCharsList = Classes.SearchTokenizer.getEscapedCharsList(tokenType, quoteChar);

	for(i = 0; i < text.length; i++) {
		if(escapedCharsList.includes(text[i])) {
			retVal += ( "\\" + text[i] );
		} else {
			retVal += text[i];
		}
	}

	// Special case, see SearchTokenizer._nextCharIsEscapable(): a "\" at the end of a token
	// needs to be escaped to make sure it doesn't escape the valid token delimiter that follows
	if(retVal[retVal.length - 1] == "\\") {
		retVal += "\\";
	}

	return retVal;
},

_hasHigherPrecedence: function(node, parentNode) {
	if(parentNode == null) {
		return true;
	}

	if(parentNode.type != Classes.SearchTokenizer.type.BINARYOP) {
		return false;
	}

	// If node and parentNode are of the same type (same precedence), return "false",
	// as we need to track strictly higher precedente of the inner node to determine
	// whether or not we need parentheses
	return this.getBinaryOpPrecedence(node.value) >= this.getBinaryOpPrecedence(parentNode.value);
},

_mergeNodeSources: function(node) {
	if(node.sources.length == 1) {
		return node.sources[0].value;
	}

	let values = [];
	for(let i = 0; i < node.sources.length; i++) {
		values.push(node.sources[i].value);
	}

	return "(" + values.join(")|(") + ")";
},

// When "rebuildMode" is set to Classes.SearchParser.rebuildMode.SIMPLE, this
// function generates a simplified version of the query string with all operators
// omitted, to be used with the chrome.history.search() API.
rebuildQueryString: function(node, parentNode, rebuildMode) {
	rebuildMode = optionalWithDefault(rebuildMode, Classes.SearchParser.rebuildMode.MIN);

	let retVal = [];

	let fullRebuild = (rebuildMode != Classes.SearchParser.rebuildMode.SIMPLE);

	switch(node.type) {
		case Classes.SearchTokenizer.type.BINARYOP:
			let needParantheses = false;
			if(!this._hasHigherPrecedence(node, parentNode) || rebuildMode == Classes.SearchParser.rebuildMode.MAX) {
				needParantheses = true;
			}

			if(fullRebuild && needParantheses) {
				retVal.push("(");
			}

			let innerRebuild = [];
			for(let i = 0; i < node.operands.length; i++) {
				innerRebuild.push(this.rebuildQueryString(node.operands[i], node, rebuildMode));
			}

			if(fullRebuild) {
				retVal.push(innerRebuild.join(" " + node.value.toUpperCase() + " "));
			} else {
				retVal = retVal.concat(innerRebuild);
			}

			if(fullRebuild && needParantheses) {
				retVal.push(")");
			}
			return retVal.join(" ");

		case Classes.SearchTokenizer.type.UNARYOP:
			if(fullRebuild) {
				retVal.push(node.value);
				if(node.value != "-") {
					retVal.push(":");
				}
			}
			retVal.push(this.rebuildQueryString(node.operand, node, rebuildMode));
			// No spaces between tokens for unary operators
			return retVal.join("");

		case Classes.SearchTokenizer.type.TEXT:
		case Classes.SearchTokenizer.type.QUOTEDTEXT:
			// Like we always add extra "(" and ")" to clearly delineate precedence,
			// let's also always add quotes even for unquoted text
			if(fullRebuild) {
				return "\"" + this._escapeText(node.value, Classes.SearchTokenizer.type.QUOTEDTEXT, "\"") + "\"";
			} else {
				return node.value;
			}

		case Classes.SearchTokenizer.type.REGEX:
			if(!fullRebuild) {
				// Skip regex for the simplified case
				return "";
			}

			let prefix = "r:";
			if(node.error != null) {
				console.error("RegExp parser: " + node.error.name + ": " + node.error.message);
				prefix = "r<error>:";
			}
			// Note that we're using Classes.SearchTokenizer.type.QUOTEDTEXT even though
			// this is a REGEX, below from an escaping perspective, we need to escape a
			// quoted string
			let rawRegex = this._mergeNodeSources(node);
			return prefix + "\"" + this._escapeText(rawRegex, Classes.SearchTokenizer.type.QUOTEDTEXT, "\"") + "\"";

		case Classes.SearchTokenizer.type.TRUTH:
			// If the entire search query is a tautology/contradiction, then the parse tree
			// is left with just a TRUTH node, and there's no way to make it disappear. So
			// we try to represent it in output, even though this is not going to be
			// syntactically correct/reparsable
			return "<" + node.value.toUpperCase() + ">";

		default:
			const logHead = "SearchParser::rebuildQueryString()";
			this._err(logHead + "unknown operator type \"" + node.type + "\":", node);
			return "";
	}
	return "";
},

}); // Classes.SearchParser

Classes.Base.roDef(Classes.SearchParser, "rebuildMode", {} );
Classes.Base.roDef(Classes.SearchParser.rebuildMode, "MIN", "min" );
Classes.Base.roDef(Classes.SearchParser.rebuildMode, "MAX", "max" );
Classes.Base.roDef(Classes.SearchParser.rebuildMode, "SIMPLE", "simple" );
