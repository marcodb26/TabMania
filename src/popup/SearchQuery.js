// CLASS SearchTokenizer
//
Classes.SearchTokenizer = Classes.Base.subclass({

	// _parserDebug is an alias for _log() to be turned on/off as needed, since
	// debugging messages for the parser can be very verbose
	_parserDebug: null,

	_validUnaryOpList: [
		"-", // The negation operator
		"site",   // Check only the hostname of the URL
		"intitle",
		"inurl",
		"inbadge",
		"ingroup",
	],

	_escapedCharsList: [ "\"", "\'", "\\", ":", "-"	],

// "value" is optional
_init: function(value) {
	const logHead = "SearchTokenizer::_init(): ";
	// Overriding the parent class' _init(), but calling that original function first
	Classes.Base._init.call(this);
	this.debug();

	// this._parserDebug = this._log;
	this._parserDebug = emptyFn;
},

_consumeEscapedCharacter: function(queryString) {
	let currChar = queryString[0];
	// Shift one character to the left
	queryString = queryString.substring(1);

	if(this._escapedCharsList.includes(currChar)) {
		return [ queryString, currChar ];
	}

	// Not escaping anything meaningful, put back the "\" in the output
	return [ queryString, "\\" + currChar ];
},

_consumeQuotedString: function(queryString, matchingQuoteChar) {
	const logHead = "SearchTokenizer::_consumeQuotedString(\"" + queryString + "\", matchingQuoteChar: \"" + matchingQuoteChar + "\"): ";

	let token = "";

	while(queryString.length > 0) {
		let currChar = queryString[0];
		// Shift one character to the left
		queryString = queryString.substring(1);

		switch(currChar) {
			case "\\":
				let escapedString = "";
				[ queryString, escapedString ] = this._consumeEscapedCharacter(queryString);
				token += escapedString;
				break;

			case matchingQuoteChar:
				return [ queryString, token ];

			default:
				token += currChar;
				break;
		}
	}

	// We get here if there's no closing quote
	this._log(logHead + "no matching closing quote");
	return [ queryString, token ];
},

_setTextOrBinaryOp: function(token) {
	switch(token) {
		case "and":
		case "or":
			return { type: Classes.SearchTokenizer.type.BINARYOP, value: token };
	}
	return { type: Classes.SearchTokenizer.type.TEXT, value: token };
},

tokenize: function(queryString, tokenList, topLevel) {
	topLevel = optionalWithDefault(topLevel, true);
	const logHead = "SearchTokenizer::tokenize(\"" + queryString + "\", topLevel: " + topLevel + "): ";

	let token = "";
	let tokenType = Classes.SearchTokenizer.type.TEXT;

	while(queryString.length > 0) {
		let currChar = queryString[0];
		// Shift one character to the left
		queryString = queryString.substring(1);

		this._parserDebug(logHead + "processing: \"" + currChar + "\"");

		switch(currChar) {
			case " ":
			case "\t":
			case "\"":
			case "\'":
				if(token.length > 0) {
					tokenList.push(this._setTextOrBinaryOp(token.toLowerCase()));
					token = "";
				}
				if(currChar == "\"" || currChar == "\'") {
					[ queryString, token ] = this._consumeQuotedString(queryString, currChar);
					if(token.length != 0) {
						// No need to call _setTextOrBinaryOp(), a quoted "and" or "or" is just text
						tokenList.push({ type: Classes.SearchTokenizer.type.QUOTEDTEXT, value: token.toLowerCase() });
						token = "";
					}
				}
				break;

			case "\\":
				let escapedString = "";
				[ queryString, escapedString ] = this._consumeEscapedCharacter(queryString);
				token += escapedString;
				break;

			case ":":
			case "-":
				// First line of the "if" block:
				// - Look ahead to see if this candidate operator is followed by a space (or
				//   it's at the end of the queryString), in which case we'll treat this as
				//   regular text, not as an operator.
				// Second line of the "if" block:
				// - As an extra condition, if the candidate operator is "-", it's a valid
				//   operator only if no token has been accumulated so far, otherwise we should
				//   treat it as regular text (that is, in "a -b" the "-" is an operator, while
				//   in "a-b" we have a single token "a-b" and no operator.
				if((queryString.length > 0 && ![ " ", "\t" ].includes(queryString[0])) &&
					!(currChar == "-" && token.length != 0)) {
					// This is a real operator
					if(currChar == "-") {
						// There's no accumulated token for "-", let's make one up
						token = "-";
					}
					let lowerCaseToken = token.toLowerCase();
					if(this._validUnaryOpList.includes(lowerCaseToken)) {
						tokenList.push({ type: Classes.SearchTokenizer.type.UNARYOP, value: lowerCaseToken });
					} else {
						this._log(logHead + "discarding unknown unary operator \"" + token + "\"");
					}
					token = "";
				} else {
					// This is regular text, not an operator. The processing of the
					// next character (or of the end of the string) will deal with it,
					// so nothing to do in this block, except accumulating.
					token += currChar;
				}
				break;

			case "(":
				let subTokenList = [];
				queryString = this.tokenize(queryString, subTokenList, false);
				if(subTokenList.length != 0) {
					tokenList.push({ type: Classes.SearchTokenizer.type.SUBTREE, value: subTokenList });
				}
				break;

			case ")":
				if(!topLevel) {
					if(token.length > 0) {
						// In theory, no need to call _setTextOrBinaryOp(), as an "and" or "or" at the end of
						// the parentheses block can't be a binary operator. On the other hand, we'd like to
						// catch this case in a log (see the push() outside of the while() loop for more details.
						tokenList.push(this._setTextOrBinaryOp(token.toLowerCase()));
					}
					return queryString;
				}
				// If this is the outermost tokenize(), we just found an unbalanced right parenthesis,
				// let's simply ignore it
				this._log(logHead + "found unbalanced \")\"");
				break;

			default:
				token += currChar;
				break;
		}
	}

	// There could be a last token to add
	if(token.length > 0) {
		// In theory, no need to call _setTextOrBinaryOp(), as an "and" or "or" at the end of
		// the queryString can't be a binary operator. On the other hand, we'd like this condition
		// to be identifiable in a log, and not just silently ignored, so we'll call _setTextOrBinaryOp()
		// to let the following logic flag this case.
		tokenList.push(this._setTextOrBinaryOp(token.toLowerCase()));
	}

	if(!topLevel) {
		// We get here if there's no closing quote
		this._log(logHead + "no matching closing \")\"");
		return "";
	}
},

}); // Classes.SearchTokenizer

Classes.Base.roDef(Classes.SearchTokenizer, "type", {} );
Classes.Base.roDef(Classes.SearchTokenizer.type, "BINARYOP", "binaryOp" );
Classes.Base.roDef(Classes.SearchTokenizer.type, "UNARYOP", "unaryOp" );
Classes.Base.roDef(Classes.SearchTokenizer.type, "SUBTREE", "subtree" );
Classes.Base.roDef(Classes.SearchTokenizer.type, "TEXT", "text" );
Classes.Base.roDef(Classes.SearchTokenizer.type, "QUOTEDTEXT", "quotedText" );

// CLASS SearchParser
//
Classes.SearchParser = Classes.Base.subclass({

	// _parserDebug is an alias for _log() to be turned on/off as needed, since
	// debugging messages for the parser can be very verbose
	_parserDebug: null,

// "value" is optional
_init: function(value) {
	const logHead = "SearchParser::_init(): ";
	// Overriding the parent class' _init(), but calling that original function first
	Classes.Base._init.call(this);
	this.debug();

	// this._parserDebug = this._log;
	this._parserDebug = emptyFn;
},

_updateUnaryOps: function(tokenList) {
	const logHead = "SearchParser::_updateUnaryOps(): ";
	
	let newTokenList = [];

	let i = 0;

	while(i < tokenList.length) {
		let node = tokenList[i];
		newTokenList.push(node);

		// Process a unary operator and consume its operand. Consider that a unary operator
		// could be followed by another unary operator (e.g "inbadge:-active" to indicate take
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
				this._err(logHead + "unary operator without operand (end of tokenList), demoting to text")
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

_getPrecedence: function(binaryOp) {
	const opPrecedenceList = {
		"and": 2,
		"or": 1
	};

	return opPrecedenceList[binaryOp];
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
			this._getPrecedence(lookahead.value) >= minPrecedence) {
		let op = tokenList.shift(); // same as "lookahead", but now we must update tokenList
		let rightOperand = tokenList.shift();

		this._assert(rightOperand.type != Classes.SearchTokenizer.type.BINARYOP);

		// Peek next token
		lookahead = tokenList[0];
		this._parserDebug(logHead + "inner lookahead: ", JSON.stringify(lookahead));

		while(lookahead != null && lookahead.type == Classes.SearchTokenizer.type.BINARYOP &&
				this._getPrecedence(lookahead.value) > this._getPrecedence(op.value)) {

			rightOperand = this._parseInner(rightOperand, minPrecedence + 1, tokenList);
			this._parserDebug(logHead + "innermost right operand: ", JSON.stringify(rightOperand));

			lookahead = tokenList[0];
			this._parserDebug(logHead + "innermost lookahead: ", JSON.stringify(lookahead));
		}

		op.leftOperand = this._parseSubtree(leftOperand);
		op.rightOperand = this._parseSubtree(rightOperand);

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

_escapeText: function(text) {
	let retVal = "";

	for(i = 0; i < text.length; i++) {
		if(Classes.SearchTokenizer._escapedCharsList.includes(text[i])) {
			retVal += ( "\\" + text[i] );
		} else {
			retVal += text[i];
		}
	}
	return retVal;
},

// Debugging function to validate what the parser has done
rebuildQueryString: function(node) {
	let retVal = [];

	switch(node.type) {
		case Classes.SearchTokenizer.type.BINARYOP:			
			retVal.push("(");
			retVal.push(this.rebuildQueryString(node.leftOperand));
			retVal.push(node.value.toUpperCase());
			retVal.push(this.rebuildQueryString(node.rightOperand));
			retVal.push(")");
			return retVal.join(" ");

		case Classes.SearchTokenizer.type.UNARYOP:
			retVal.push(node.value);
			if(node.value != "-") {
				retVal.push(":");
			}
			retVal.push(this.rebuildQueryString(node.operand));
			// No spaces between tokens for unary operators
			return retVal.join("");

		case Classes.SearchTokenizer.type.TEXT:
			return this._escapeText(node.value);

		case Classes.SearchTokenizer.type.QUOTEDTEXT:
			// Unfortunately we don't track which type of quotes were used in the original text...
			return "\"" + this._escapeText(node.value) + "\"";
	}
},

}); // Classes.SearchParser


// CLASS SearchQuery
//
Classes.SearchQuery = Classes.Base.subclass({

	// _parserDebug is an alias for _log() to be turned on/off as needed, since
	// debugging messages for the parser can be very verbose
	_parserDebug: null,

	_tokenizer: null,
	_parser: null,

	// This will be initialized by the first call to update()
	_searchQuery: null,
	_parsedQuery: null,

	// Statistics
	_cntParsedNodes: null,
	// Text nodes are the only expensive nodes to process...
	_cntParsedTextNodes: null,
	_totalEvaluated: null,
	_totalEvaluatedText: null,
	_totalTabsEvaluated: null,

// "value" is optional
_init: function(value) {
	const logHead = "SearchQuery::_init(): ";
	// Overriding the parent class' _init(), but calling that original function first
	Classes.Base._init.call(this);
	this.debug();
	// this._parserDebug = this._log;
	this._parserDebug = emptyFn;

	this._tokenizer = Classes.SearchTokenizer.create();
	this._parser = Classes.SearchParser.create();

	this.reset();
	if(value != null) {
		this.update(value);
	}
},

isInitialized: function() {
	// Don;t use "this._parsedQuery != null" here, because if the user types a string
	// of only whitespaces, no tokens can be generated, so _parsedQuery must remain
	// "null", but the search is "active", and we can use _searchQuery to find out.
	return this._searchQuery.length != 0;
},

_countParsedNodes: function(node) {
	const logHead = "SearchQuery::_countParsedNodes(): ";

	this._log(logHead + "incrementing count to track node", node);
	this._cntParsedNodes++;
	
	switch(node.type) {
		case Classes.SearchTokenizer.type.BINARYOP:
			this._countParsedNodes(node.leftOperand);
			this._countParsedNodes(node.rightOperand);
			return;

		case Classes.SearchTokenizer.type.UNARYOP:
			this._countParsedNodes(node.operand);
			return;

		case Classes.SearchTokenizer.type.TEXT:
		case Classes.SearchTokenizer.type.QUOTEDTEXT:
			this._cntParsedTextNodes++;
			return;
	};

	this._err(logHead + "unknown operator type \"" + node.type + "\":", node);
},

_parse: function(queryString) {
	const logHead = "SearchQuery::_parse(\"" + queryString + "\"): ";

	let tokenList = [];
	this._tokenizer.tokenize(queryString, tokenList);
	this._log(logHead + "tokenize() returned", tokenList);

	if(tokenList.length != 0) {
		this._parsedQuery = this._parser.parse(tokenList);
		this._cntParsedNodes = 0;
		this._cntParsedTextNodes = 0;
		this._countParsedNodes(this._parsedQuery);
	} else {
		this._log(logHead + "no tokens, nothing to parse");
	}
},

// "rightOperand" can be set to "null" to inquire on whether or not "leftOperand" alone
// is sufficient for a conclusive result.
// The function returns "null" if the partial inputs provided are insufficient to reach
// a conclusive decision.
_computeBinaryOp: function(binaryOpNode, leftOperand, rightOperand) {
	let logHead = "SearchQuery::_computeBinaryOp(" + binaryOpNode.value + ", " + leftOperand + ", " + rightOperand + "): ";
	switch(binaryOpNode.value) {
		case "and":
			if(rightOperand === null) {
				if(!leftOperand) {
					// If "leftOperand" is "false", it doesn't matter the value of "rightOperand",
					// the result will be "false" anyway
					return false;
				} else {
					return null;
				}
			}
			return leftOperand && rightOperand;
		case "or":
			if(rightOperand === null) {
				if(leftOperand) {
					// If "leftOperand" is "true", it doesn't matter the value of "rightOperand",
					// the result will be "true" anyway
					return true;
				} else {
					return null;
				}
			}
			return leftOperand || rightOperand;
	}

	this._err(logHead + "unknown binary operator \"" + binaryOpNode.value + "\":", binaryOpNode);
	return false;
},

_evaluateTextNode: function(tab, text, modifier) {
	const logHead = "SearchQuery::_evaluateTextNode(text: \"" + text + "\"): ";

	if(text == "") {
		// Dealing with a dummy text node added to fix a syntax error. We arbitrarily
		// always return "true" for dummy nodes.
		return true;
	}

	if(modifier == null) {
		// If there's no modifier, the default behavior is to search title,
		// url and badges for "text"
		if(tab.tm.lowerCaseTitle.includes(text)) {
			return true;
		}

		if(tab.tm.lowerCaseUrl.includes(text)) {
			return true;
		}

		for(let i = 0; i < tab.tm.searchBadges.length; i++) {
			if(tab.tm.searchBadges[i].includes(text)) {
				return true;
			}
		}
		return false;
	}

	switch(modifier) {
		case "site":
			return tab.tm.hostname.includes(text);
		case "intitle":
			return tab.tm.lowerCaseTitle.includes(text);
		case "inurl":
			return tab.tm.lowerCaseUrl.includes(text);
		case "inbadge":
			for(let i = 0; i < tab.tm.searchBadges.length; i++) {
				if(tab.tm.searchBadges[i].includes(text)) {
					//this._log(logHead + "badge found in ", tab.tm.searchBadges[i]);
					return true;
				}
			}
			return false;
		case "ingroup":
			for(let i = 0; i < tab.tm.customGroupBadges.length; i++) {
				if(tab.tm.customGroupBadges[i].includes(text)) {
					return true;
				}
			}
			return false;
		default:
			// Remember to update SearchTokenizer._validUnaryOpList when you want to
			// allocate a new modifier, otherwise SearchTokenizer.tokenize() will discard
			// the unknown operator and it will never show up here.
			// This check is only for things that have been added to SearchTokenizer._validUnaryOpList
			// but have not been correspondingly added here.
			this._err(logHead + "unknown modifier", modifier);
			break;
	}
	return false;
},

// "stats" is an output parameter
_evaluate: function(tab, queryNode, stats, modifier) {
	const logHead = "SearchQuery::_evaluate(): ";

	stats.cntEvaluated++;

	switch(queryNode.type) {
		case Classes.SearchTokenizer.type.BINARYOP:
			let leftResult = this._evaluate(tab, queryNode.leftOperand, stats);

			// Sometimes you don't need to evaluate both operands to reach a conclusive
			// result. Evaluating only one operand can save significant processing time.
			let partialResult = this._computeBinaryOp(queryNode, leftResult, null);
			if(partialResult !== null) {
				return partialResult;
			}

			let rightResult = this._evaluate(tab, queryNode.rightOperand, stats);

			return this._computeBinaryOp(queryNode, leftResult, rightResult);

		case Classes.SearchTokenizer.type.UNARYOP:
			// "-" is a boolean unary operator, while "<modif>:" are unary "behavior modifiers"
			// for the subtree rooted into them
			if(queryNode.value == "-") {
				return !this._evaluate(tab, queryNode.operand, stats, modifier);
			}
			// "Behavior modifier" case.
			// Note that in case there are nested unary modifiers, only the last one will
			// remain active (unless the last one is the negation "-", which acts on the
			// results and doesn't need to be propagated down).
			return this._evaluate(tab, queryNode.operand, stats, queryNode.value);

		case Classes.SearchTokenizer.type.TEXT:
		case Classes.SearchTokenizer.type.QUOTEDTEXT:
			stats.cntEvaluatedText++;
			return this._evaluateTextNode(tab, queryNode.value, modifier);

		// Note that type "subtree" disappears during parsing (in the SearchParser._parseInner() call)
	};

	this._err(logHead + "unknown node type \"" + queryNode.type + "\":", queryNode);
	return false;
},

isTabInSearch: function(tab, stats) {
	if(this._parsedQuery == null) {
		// The user typed a string of only whitespaces, with no tokens. Arbitrarily,
		// let's say that matches nothing (?), just because "matches everything" is a
		// very expensive proposition, and we want to minimize those cases.
		return false;
	}
	tab.tm.searchStats = { cntEvaluated: 0, cntEvaluatedText: 0 };
	return this._evaluate(tab, this._parsedQuery, tab.tm.searchStats);
},

aggregateStats: function(tabs) {
	const logHead = " SearchQuery::aggregateStats(): ";
	this._totalEvaluated = 0;
	this._totalEvaluatedText = 0;

	this._totalTabsEvaluated = tabs.length;

	for(let i = 0; i < tabs.length; i++) {
		this._totalEvaluated += tabs[i].tm.searchStats.cntEvaluated;
		this._totalEvaluatedText += tabs[i].tm.searchStats.cntEvaluatedText;
	}

	this._log(logHead, this.getStats());
},

update: function(value) {
	const logHead = "SearchQuery::update(\"" + value + "\"): ";

	if(value.length == 0) {
		return;
	}

	this._searchQuery = value;
	this._parse(value);
	this._log(logHead + "_parse() returned", this._parsedQuery);
},

reset: function() {
	this._searchQuery = "";
	this._parsedQuery = null;
	this._cntParsedNodes = null;
},

getParsedQuery: function() {
	return this._parser.rebuildQueryString(this._parsedQuery);
},

getStats: function() {
	try {
		return `Total nodes evaluated: ${this._totalEvaluated}, for ${this._totalTabsEvaluated}` +
			` tabs (average of ${(this._totalEvaluated / this._totalTabsEvaluated).toFixed(1)} nodes per tab (of ${this._cntParsedNodes}))\n` +
			`Total text nodes evaluated: ${this._totalEvaluatedText}, for ${this._totalTabsEvaluated}` +
			` tabs (average of ${(this._totalEvaluatedText / this._totalTabsEvaluated).toFixed(1)} nodes per tab (of ${this._cntParsedTextNodes}))`;
	} catch(e) {
		return e;
	}
},

getQuery: function() {
	return this._searchQuery;
},

getState: function() {
	return "value: \"" + this._searchQuery + "\"";
},

}); // Classes.SearchQuery