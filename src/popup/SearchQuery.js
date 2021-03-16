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

// When "fullRebuild" is set to "true", this function behaves as a debugging function
// to validate what the parser has done.
// When it's set to false, it generates a simplified version of the query string with
// all operators omitted, to be used with the chrome.history.search() and
// chrome.bookmarks.search() APIs.
rebuildQueryString: function(node, fullRebuild) {
	let retVal = [];

	switch(node.type) {
		case Classes.SearchTokenizer.type.BINARYOP:
			if(fullRebuild) {
				retVal.push("(");
			}
			retVal.push(this.rebuildQueryString(node.leftOperand, fullRebuild));
			if(fullRebuild) {
				retVal.push(node.value.toUpperCase());
			}
			retVal.push(this.rebuildQueryString(node.rightOperand, fullRebuild));
			if(fullRebuild) {
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
			retVal.push(this.rebuildQueryString(node.operand, fullRebuild));
			// No spaces between tokens for unary operators
			return retVal.join("");

		case Classes.SearchTokenizer.type.TEXT:
		case Classes.SearchTokenizer.type.QUOTEDTEXT:
			// Like we always add extra "(" and ")" to clearly delineate precedence,
			// let's also always add quotes even for unquoted text
			if(fullRebuild) {
				return "\"" + this._escapeText(node.value) + "\"";
			} else {
				return node.value;
			}

		case Classes.SearchTokenizer.type.REGEX:
			if(!fullRebuild) {
				// Skip regex for the simplified case
				return "";
			}
			
			if(node.error != null) {
				this._err("regex parse error", node.error);
				return "r:<error>";
			}
			return "r:\"" + this._escapeText(node.textValue) + "\"";
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

	// Statistics about the parser
	_cntParsedNodes: null,
	// Text nodes are the only expensive nodes to process...
	_cntParsedTextNodes: null,

	// Statistics about the tabs searched
	_stats: null,

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
		case Classes.SearchTokenizer.type.REGEX:
			this._cntParsedTextNodes++;
			return;
	};

	this._err(logHead + "unknown operator type \"" + node.type + "\":", node);
},

_parse: function(queryString) {
	const logHead = "SearchQuery::_parse(\"" + queryString + "\"): ";

	this._cntParsedNodes = 0;
	this._cntParsedTextNodes = 0;
	this._parsedQuery = null;

	let tokenList = [];
	this._tokenizer.tokenize(queryString, tokenList);
	this._log(logHead + "tokenize() returned", tokenList);

	if(tokenList.length != 0) {
		this._parsedQuery = this._parser.parse(tokenList);
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

_evaluateRegexNode: function(tab, regex, modifier) {
	const logHead = "SearchQuery::_evaluateRegexNode(): ";

	if(modifier == null) {
		// If there's no modifier, the default behavior is to search title,
		// url and badges for "text"
		if(regex.test(tab.tm.lowerCaseTitle)) {
			return true;
		}

		if(regex.test(tab.tm.lowerCaseUrl)) {
			return true;
		}

		for(let i = 0; i < tab.tm.searchBadges.length; i++) {
			if(regex.test(tab.tm.searchBadges[i])) {
				return true;
			}
		}
		return false;
	}

	switch(modifier) {
		case "site":
			return regex.test(tab.tm.hostname);
		case "intitle":
			return regex.test(tab.tm.lowerCaseTitle);
		case "inurl":
			return regex.test(tab.tm.lowerCaseUrl);
		case "inbadge":
			for(let i = 0; i < tab.tm.searchBadges.length; i++) {
				if(regex.test(tab.tm.searchBadges[i])) {
					//this._log(logHead + "badge found in ", tab.tm.searchBadges[i]);
					return true;
				}
			}
			return false;
		case "ingroup":
			for(let i = 0; i < tab.tm.customGroupBadges.length; i++) {
				if(regex.test(tab.tm.customGroupBadges[i])) {
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

		case Classes.SearchTokenizer.type.REGEX:
			return this._evaluateRegexNode(tab, queryNode.value, modifier);

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

// "maxResults" is an optional parameter. If specified, the search will stop after
// "maxResults" have been accumulated
search: function(inputTabs, statsSource, maxResults) {
	const logHead = "SearchQuery::search(" + this.getState() + "): ";
	this._log(logHead + "inputTabs", inputTabs);

	function maxReached(results) {
		if(maxResults == null) {
			return false;
		}
		return results.length >= maxResults;
	}
		
	let filteredTabs = [];
	let i = 0; // Initializing here because we need it after the for() loop
	for(let i = 0; i < inputTabs.length && !maxReached(filteredTabs); i++) {
		let tab = inputTabs[i];
		if(this.isTabInSearch(tab)) {
			filteredTabs.push(tab);
		}
	}

// Reduce is overrated, this is simple enough for a classic for() loop...
//
//	let filteredTabs = inputTabs.reduce(
//		function(result, tab) {
//			//this._log(logHead + "inside tab ", tab);
//			if(this.isTabInSearch(tab)) {
//				result.push(tab);
//				return result;
//			}
//
//			// Not added
//			return result;
//		}.bind(this),
//		[] // Initial value for reducer
//	);

	let interrupted = false;
	if(maxReached(filteredTabs) && i < inputTabs.length) {
		this._log(logHead + "max (" + maxResults + ") reached, interrupting search for " + statsSource);
		interrupted = true;
	}

	this._aggregateStats(inputTabs, statsSource, maxResults, interrupted);

	return filteredTabs;
},

_aggregateStats: function(tabs, statsSource, maxResults, maxReached) {
	const logHead = " SearchQuery::_aggregateStats(): ";

	let stats = {
		source: statsSource,
		totalEvaluated: 0,
		totalEvaluatedText: 0,
		totalTabsEvaluated: maxReached ? maxResults : tabs.length,
		maxResults: maxResults,
		maxReached: maxReached
	};

	for(let i = 0; i < tabs.length; i++) {
		// "tabs[i].tm.searchStats" could be "null" if the search was interrupted
		// due to reaching "maxResults" (see SearchQuery.search())
		if(tabs[i].tm.searchStats != null) {
			stats.totalEvaluated += tabs[i].tm.searchStats.cntEvaluated;
			stats.totalEvaluatedText += tabs[i].tm.searchStats.cntEvaluatedText;
		}
	}

	this._stats[statsSource] = stats;

	this._log(logHead, this.getStats(statsSource));
},

update: function(value) {
	const logHead = "SearchQuery::update(\"" + value + "\"): ";

	if(value.length == 0) {
		return;
	}

	this._searchQuery = value;
	this._parse(value);
	this._log(logHead + "_parse() returned", this._parsedQuery);

	if(this._parsedQuery != null) {
		this._simplifiedSearchQuery = this._parser.rebuildQueryString(this._parsedQuery, false);
	} else {
		this._simplifiedSearchQuery = "";
	}
},

reset: function() {
	this._searchQuery = "";
	this._simplifiedSearchQuery = "";
	this._parsedQuery = null;
	this._cntParsedNodes = null;
	this._cntParsedTextNodes = null;
	this._stats = {};
},

// "source" is optional. If not provided, we dump all the stats, if provided we dump
// only the stats from that source
getStats: function(source) {
	let retVal = "";

	let keys = Object.keys(this._stats);
	let i = 0;
	let max = keys.length;

	try {
		if(source != null) {
			// Simulate a loop of only one index
			i = keys.indexOf(source);
			if(i == -1) {
				return `Source "${source}" not found`;
			}
			max = i + 1;
		}

		for(; i < max; i++) {
			s = this._stats[keys[i]];
			retVal +=
				`For source "${s.source}":\n` +
				`\tTotal nodes evaluated: ${s.totalEvaluated}, for ${s.totalTabsEvaluated} ` +
				`tabs (average of ${(s.totalEvaluated / s.totalTabsEvaluated).toFixed(1)} nodes per tab ` +
				`(of ${this._cntParsedNodes}))\n` +
				`\tTotal text nodes evaluated: ${s.totalEvaluatedText}, for ${s.totalTabsEvaluated} ` +
				`tabs (average of ${(s.totalEvaluatedText / s.totalTabsEvaluated).toFixed(1)} nodes per tab ` +
				`(of ${this._cntParsedTextNodes}))\n`;
			if(s.maxResults != null) {
				retVal += `\tResults limited to a max of ${s.maxResults} (limit ${s.maxReached ? "" : "not "}reached)\n`;
			}
		}
		return retVal;
	} catch(e) {
		return e;
	}
},

// Returns the original query as typed by the user
getQuery: function() {
	return this._searchQuery;
},

// Returns a filtered version of the original query, dropping all operators, to
// be used with the chrome.history and chrome.bookmarks search() API
getSimplifiedQuery: function() {
	return this._simplifiedSearchQuery;
},

// Returns a rebuild of the text query starting from the parsed nodes
getParsedQuery: function() {
	if(this._parsedQuery == null) {
		return "";
	}

	return this._parser.rebuildQueryString(this._parsedQuery, true);
},

getState: function() {
	return "value: \"" + this._searchQuery + "\"";
},

}); // Classes.SearchQuery