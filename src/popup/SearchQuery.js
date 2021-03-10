// CLASS SearchTokenizer
//
Classes.SearchTokenizer = Classes.Base.subclass({

	// _parserDebug is an alias for _log() to be turned on/off as needed, since
	// debugging messages for the parser can be very verbose
	_parserDebug: null,

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

	if([ "\"", "\'", "\\", ":", "-" ].includes(currChar)) {
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
			return { type: "binaryOp", value: token };
	}
	return { type: "text", value: token };
},

tokenize: function(queryString, tokenList, topLevel) {
	topLevel = optionalWithDefault(topLevel, true);
	const logHead = "SearchTokenizer::tokenize(\"" + queryString + "\", topLevel: " + topLevel + "): ";

	let token = "";
	let tokenType = "text";

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
						tokenList.push({ type: "quotedText", value: token.toLowerCase() });
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
						token = "negate";
					}
					tokenList.push({ type: "unaryOp", value: token.toLowerCase() });
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
					tokenList.push({ type: "subtree", value: subTokenList });
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

		if(node.type != "unaryOp") {
			i++;
		} else {
			// Process a unary operator and consume its operand
			if(tokenList.length == i + 1) {
				// Unary operator at the end of the tokenList, no operand, the operator needs to be
				// demoted to standard text. Note that we demote unary operators, but we don't demote
				// binary operators (we add dummy nodes instead).
				// Marking as _err() instead of _log() because this should never happen by construction,
				// so if it happens, the SearchTokenizer.tokenize() logic is broken.
				this._err(logHead + "unary operator without operand (end of tokenList), demoting to text")
				node.type = "text";
				i++;
			} else {
				node.operand = tokenList[i + 1];
				// The next node has been consumed, we need to move ahead by two nodes
				i += 2;
			}
		}

		newTokenList.push(node);
	}

	return newTokenList;
},

_addImplicitNodes: function(tokenList) {
	const logHead = "SearchParser::_addImplicitNodes(): ";
	
	let newTokenList = [];

	let i = 0;

	if(tokenList[0].type == "binaryOp") {
		// A binaryOp at the beginning of the tokenList means we're missing a
		// left operand. This is a special case of the more general "two consecutive
		// binaryOps" tracked in the "while" loop, let's do the same thing, add
		// a dummy text node before it.
		this._log(logHead + "invalid syntax, binary operator at beginning of query string, adding dummy node");
		newTokenList.push({ type: "text", value: "" });
	}

	while(i < tokenList.length) {
		let node = tokenList[i];

		newTokenList.push(node);

		// Check if there are two consecutive text strings, that means an implicit
		// "and" needs to be added in between
		if(node.type != "binaryOp") {
			// Lookahead...
			if(tokenList.length > i + 1) {
				if(tokenList[i + 1].type != "binaryOp") {
					// Two consecutive non-binaryOp, we need to insert a binaryOp
					// in between, the implicit binaryOp is "and"
					newTokenList.push({ type: "binaryOp", value: "and" });
				}
			}
		}

		// Check if there are two consecutive binaryOps. That is illegal syntax, but
		// to be gentle, we insert a dummy string and move on...
		if(node.type == "binaryOp") {
			// Lookahead...
			if(tokenList.length > i + 1) {
				if(tokenList[i + 1].type == "binaryOp") {
					// Two consecutive binaryOp, we need to insert dummy text
					// in between, and let's also report the syntax error
					this._log(logHead + "invalid syntax, two consecutive binary operators, adding dummy node");
					newTokenList.push({ type: "text", value: "" });
				}
			} else {
				// We reached the last tokem, but a binaryOp can't be a last token,
				// it needs to be followed by a right operand, let's add a dummy text one
				this._log(logHead + "invalid syntax, binary operator at end of query string, adding dummy node");
				newTokenList.push({ type: "text", value: "" });
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

// From https://en.wikipedia.org/wiki/Operator-precedence_parser
//
// test query: a a or (site:b -c)
_parseInner: function(leftOperand, minPrecedence, tokenList) {
	const logHead = "SearchParser::_parseInner(): ";
	this._parserDebug(logHead + "entering, minPrecedence: " + minPrecedence + ", leftOperand: ", JSON.stringify(leftOperand));

	// Peek next token
	let lookahead = tokenList[0];
	this._parserDebug(logHead + "outer lookahead: ", JSON.stringify(lookahead));

	while(lookahead != null && lookahead.type == "binaryOp" && this._getPrecedence(lookahead.value) >= minPrecedence) {
		let op = tokenList.shift(); // same as "lookahead", but now we must update tokenList
		let rightOperand = tokenList.shift();

		this._assert(rightOperand.type != "binaryOp");

		// Peek next token
		lookahead = tokenList[0];
		this._parserDebug(logHead + "inner lookahead: ", JSON.stringify(lookahead));

		while(lookahead != null && lookahead.type == "binaryOp" &&
				this._getPrecedence(lookahead.value) > this._getPrecedence(op.value)) {

			rightOperand = this._parseInner(rightOperand, minPrecedence + 1, tokenList);
			this._parserDebug(logHead + "innermost right operand: ", JSON.stringify(rightOperand));

			lookahead = tokenList[0];
			this._parserDebug(logHead + "innermost lookahead: ", JSON.stringify(lookahead));
		}

		if(leftOperand.type == "subtree") {
			op.leftOperand = this.parse(leftOperand.value);
		} else {
			op.leftOperand = leftOperand;
		}

		if(rightOperand.type == "subtree") {
			op.rightOperand = this.parse(rightOperand.value);
		} else {
			op.rightOperand = rightOperand;
		}

		this._parserDebug(logHead + "op assigned operands: ", JSON.stringify(op));
		
		leftOperand = op;
	}

	// If the entire search is emcapsulated in parantheses, the top level tokenList has
	// a single token of type "subtree". When that happens, we don't enter the "while"
	// loop at all, and therefore the subtree remains unprocessed. We need to take care
	// of it now, if that's the case.
	if(leftOperand.type == "subtree") {
		return this.parse(leftOperand.value);
	}

	return leftOperand;
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

}); // Classes.SearchParser


// CLASS SearchQuery
//
Classes.SearchQuery = Classes.Base.subclass({

	_tokenizer: null,
	_parser: null,

	// This will be initialized by the first call to update()
	_searchQuery: null,
	_parsedQuery: null,

	// _parserDebug is an alias for _log() to be turned on/off as needed, since
	// debugging messages for the parser can be very verbose
	_parserDebug: null,

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

_parse: function(queryString) {
	const logHead = "SearchQuery::_parse(\"" + queryString + "\"): ";

	let tokenList = [];
	this._tokenizer.tokenize(queryString, tokenList);
	this._log(logHead + "tokenize() returned", tokenList);

	if(tokenList.length != 0) {
		this._parsedQuery = this._parser.parse(tokenList);
	} else {
		this._log(logHead + "no tokens, nothing to parse");
	}
},

_computeBinaryOp: function(binaryOpNode, leftOperand, rightOperand) {
	let logHead = "SearchQuery::_computeBinaryOp(" + binaryOpNode.value + ", " + leftOperand + ", " + rightOperand + "): ";
	switch(binaryOpNode.value) {
		case "and":
			return leftOperand && rightOperand;
		case "or":
			return leftOperand || rightOperand;
	}

	this._err(logHead + "unknown binary operator \"" + binaryOpNode.value + "\":", binaryOpNode);
	return false;
},

_isTabInSearchInnerText: function(tab, text) {
	// Similar to _isTabInSearchInnerPositive(), but using "text" instead
	// of this._currentSearchInput
	const logHead = "SearchQuery::_isTabInSearchInnerText(text: \"" + text + "\"): ";

	if(text == "") {
		// Dealing with a dummy text node added to fix a syntax error. We arbitrarily
		// always return "true" for dummy nodes.
		return true;
	}

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
},

_isTabInSearchInner: function(tab, queryNode) {
	const logHead = "SearchQuery::_isTabInSearchInner(): ";

	switch(queryNode.type) {
		case "binaryOp":
			let leftResult = this._isTabInSearchInner(tab, queryNode.leftOperand);
			let rightResult = this._isTabInSearchInner(tab, queryNode.rightOperand);

			return this._computeBinaryOp(queryNode, leftResult, rightResult);

		case "unaryOp":
			// TO DO TO DO
			return true;

		case "text":
		case "quotedText":
			return this._isTabInSearchInnerText(tab, queryNode.value);

		// Note that type "subtree" disappears during parsing (in the SearchParser._parseInner() call)
	};

	this._err(logHead + "unknown node type \"" + queryNode.type + "\":", queryNode);
	return false;
},

isTabInSearch: function(tab) {
	if(this._parsedQuery == null) {
		// The user typed a string of only whitespaces, with no tokens. Arbitrarily,
		// let's say that matches nothing (?), just because "matches everything" is a
		// very expensive proposition, and we want to minimize those cases.
		return false;
	}
	return this._isTabInSearchInner(tab, this._parsedQuery);
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
},

getQuery: function() {
	return this._searchQuery;
},

getState: function() {
	return "value: \"" + this._searchQuery + "\"";
},

}); // Classes.SearchQuery