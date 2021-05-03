// CLASS SearchQuery
//
Classes.SearchQuery = Classes.Base.subclass({

	// _parserDebug is an alias for _log() to be turned on/off as needed, since
	// debugging messages for the parser can be very verbose
	_parserDebug: null,

	_tokenizer: null,
	_parser: null,
	_optimizer: null,

	// This will be initialized by the first call to update()
	_searchQuery: null,
	_parsedQuery: null,
	_unoptimizedParsedQuery: null,

	// Statistics about the parsed tree
	_unoptimizedParsedQueryStats: null,
	_optimizedParsedQueryStats: null,

	// Statistics about the tabs searched
	_optimizedTabsStats: null,
	_unoptimizedTabsStats: null,

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
	this._optimizer = Classes.SearchOptimizer.create(this._parser);

	this.reset();
	if(value != null) {
		this.update(value);
	}
},

isInitialized: function() {
	// Don't use "this._parsedQuery != null" here, because if the user types a string
	// of only whitespaces, no tokens can be generated, so _parsedQuery must remain
	// "null", but the search is "active", and we can use _searchQuery to find out.
	return this._searchQuery.length != 0;
},

// "stats" is an output parameter, initialize it as shown in _parse() below
_countParsedNodes: function(node, stats) {
	const logHead = "SearchQuery::_countParsedNodes(): ";

	stats.parsedNodes++;
	
	switch(node.type) {
		case Classes.SearchTokenizer.type.BINARYOP:
			for(let i = 0; i < node.operands.length; i++) {
				this._countParsedNodes(node.operands[i], stats);
			}
			return;

		case Classes.SearchTokenizer.type.UNARYOP:
			this._countParsedNodes(node.operand, stats);
			return;

		case Classes.SearchTokenizer.type.TEXT:
		case Classes.SearchTokenizer.type.QUOTEDTEXT:
		case Classes.SearchTokenizer.type.REGEX:
			stats.parsedTextNodes++;
			return;

		case Classes.SearchTokenizer.type.TRUTH:
			return;
	};

	this._err(logHead + "unknown operator type \"" + node.type + "\":", node);
},

_parse: function(queryString) {
	const logHead = "SearchQuery::_parse(\"" + queryString + "\"): ";

	this._unoptimizedParsedQueryStats = {
		parsedNodes: 0,
		// Text nodes are the only expensive nodes to process...
		parsedTextNodes: 0,
	};

	this._optimizedParsedQueryStats = {
		parsedNodes: 0,
		// Text nodes are the only expensive nodes to process...
		parsedTextNodes: 0,
	};

	this._unoptimizedParsedQuery = null;
	this._parsedQuery = null;

	let tokenList = [];
	this._tokenizer.tokenize(queryString, tokenList);
	this._log(logHead + "tokenize() returned", tokenList);

	if(tokenList.length != 0) {
		this._unoptimizedParsedQuery = this._parser.parse(tokenList);
		this._countParsedNodes(this._unoptimizedParsedQuery, this._unoptimizedParsedQueryStats);
		this._parsedQuery = this._optimizer.optimize(this._unoptimizedParsedQuery);
		this._countParsedNodes(this._parsedQuery, this._optimizedParsedQueryStats);
	} else {
		this._log(logHead + "no tokens, nothing to parse");
	}
},

_evaluateBinaryNode: function(tab, node, stats, modifier) {
	// "fullResult" needs to be initialized to "true" for "and" and to "false" for "or"
	let fullResult = (node.value == "and");

	for(let i = 0; i < node.operands.length; i++) {
		let result = this._evaluate(tab, node.operands[i], stats, modifier);
		if(node.value == "and") {
			fullResult = fullResult && result;
			if(fullResult === false) {
				// No need to continue evaluating, the fullResult will remain false from now on
				return fullResult;
			}
		} else {
			fullResult = fullResult || result;
			if(fullResult === true) {
				// No need to continue evaluating, the fullResult will remain true from now on
				return fullResult;
			}
		}
	}

	return fullResult;
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
		case "badge":
			for(let i = 0; i < tab.tm.searchBadges.length; i++) {
				if(regex.test(tab.tm.searchBadges[i])) {
					//this._log(logHead + "badge found in ", tab.tm.searchBadges[i]);
					return true;
				}
			}
			return false;
		case "group":
			for(let i = 0; i < tab.tm.customGroupBadges.length; i++) {
				if(regex.test(tab.tm.customGroupBadges[i])) {
					return true;
				}
			}
			return false;
		case "folder":
			return regex.test(tab.tm.lowerCaseFolder);
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
		case "badge":
			for(let i = 0; i < tab.tm.searchBadges.length; i++) {
				if(tab.tm.searchBadges[i].includes(text)) {
					//this._log(logHead + "badge found in ", tab.tm.searchBadges[i]);
					return true;
				}
			}
			return false;
		case "group":
			for(let i = 0; i < tab.tm.customGroupBadges.length; i++) {
				if(tab.tm.customGroupBadges[i].includes(text)) {
					return true;
				}
			}
			return false;
		case "folder":
			return tab.tm.lowerCaseFolder.includes(text);
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

	stats.evaluated++;

	switch(queryNode.type) {
		case Classes.SearchTokenizer.type.BINARYOP:
			return this._evaluateBinaryNode(tab, queryNode, stats, modifier);

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
			stats.evaluatedText++;
			return this._evaluateTextNode(tab, queryNode.value, modifier);

		case Classes.SearchTokenizer.type.REGEX:
			if(queryNode.error == null) {
				stats.evaluatedText++;
				return this._evaluateRegexNode(tab, queryNode.value, modifier);
			}
			// If we failed to parse a regex, let's assume it's evaluation is "false"
			return false;

		case Classes.SearchTokenizer.type.TRUTH:
			// Nothing to evaluate for a tautology/contradiction
			return queryNode.value == "true";

		// Note that type "subtree" disappears during parsing (in the SearchParser._parseInner() call)
	};

	this._err(logHead + "unknown node type \"" + queryNode.type + "\":", queryNode);
	return false;
},

isTabInSearch: function(tab, tabsStats) {
	const logHead = "SearchQuery::isTabInSearch(): ";
	if(this._parsedQuery == null) {
		// The user typed a string of only whitespaces, with no tokens. Arbitrarily,
		// let's say that matches nothing (?), just because "matches everything" is a
		// very expensive proposition, and we want to minimize those cases.
		return false;
	}

	let stats = {};
	tabsStats.push(stats);

	stats.searchStats = { evaluated: 0, evaluatedText: 0 };
	let optimizedResult = this._evaluate(tab, this._parsedQuery, stats.searchStats);

	if(!isProd()) {
		// Only in dev, we run the query twice, once optimized and once unoptimized
		// to validate that the optimizations keey the two queries equivalent
		stats.unoptimizedSearchStats = { evaluated: 0, evaluatedText: 0 }
		let unoptimizedResult = this._evaluate(tab, this._unoptimizedParsedQuery, stats.unoptimizedSearchStats);
		this._assert(optimizedResult === unoptimizedResult,
					logHead + "inconsistent results between unoptimized (" + unoptimizedResult +
					") and optimized (" + optimizedResult + ") evaluation", tab);
	}
	return optimizedResult;
},

// "maxResults" is an optional parameter. If specified, the search will stop after
// "maxResults" have been accumulated
search: function(inputTabs, statsSource, maxResults) {
	const logHead = "SearchQuery::search(\"" + this._searchQuery + "\"): ";
	this._log(logHead + "inputTabs", inputTabs);

	function maxReached(results) {
		if(maxResults == null) {
			return false;
		}
		return results.length >= maxResults;
	}

	let tabsStats = [];
	let filteredTabs = [];
	let i = 0; // Initializing here because we need it after the for() loop
	for(let i = 0; i < inputTabs.length && !maxReached(filteredTabs); i++) {
		let tab = inputTabs[i];
		if(this.isTabInSearch(tab, tabsStats)) {
			filteredTabs.push(tab);
		}
	}

	let interrupted = false;
	if(maxReached(filteredTabs) && i < inputTabs.length) {
		this._log(logHead + "max (" + maxResults + ") reached, interrupting search for " + statsSource);
		interrupted = true;
	}

	this._aggregateStats(tabsStats, statsSource, maxResults, interrupted);

	return filteredTabs;
},

_aggregateStats: function(tabsStats, statsSource, maxResults, maxReached) {
	const logHead = " SearchQuery::_aggregateStats(): ";

	let optimizedStats = {
		source: statsSource,
		totalEvaluated: 0,
		totalEvaluatedText: 0,
		totalTabsEvaluated: maxReached ? maxResults : tabsStats.length,
		maxResults: maxResults,
		maxReached: maxReached
	};

	let unoptimizedStats = null;

	if(!isProd()) {
		unoptimizedStats = {
			source: statsSource,
			totalEvaluated: 0,
			totalEvaluatedText: 0,
			totalTabsEvaluated: maxReached ? maxResults : tabsStats.length,
			maxResults: maxResults,
			maxReached: maxReached
		};
	}

	// Note that tabsStats.length might be shorter than the original tabs.length,
	// in case the search was interrupted due to reaching "maxResults" (see SearchQuery.search())
	for(let i = 0; i < tabsStats.length; i++) {
		optimizedStats.totalEvaluated += tabsStats[i].searchStats.evaluated;
		optimizedStats.totalEvaluatedText += tabsStats[i].searchStats.evaluatedText;

		if(!isProd()) {
			unoptimizedStats.totalEvaluated += tabsStats[i].unoptimizedSearchStats.evaluated;
			unoptimizedStats.totalEvaluatedText += tabsStats[i].unoptimizedSearchStats.evaluatedText;
		}
	}

	this._optimizedTabsStats[statsSource] = optimizedStats;
	this._log(logHead, this.getStats(statsSource, this._optimizedParsedQueryStats, this._optimizedTabsStats));

	if(!isProd()) {
		this._unoptimizedTabsStats[statsSource] = unoptimizedStats;
		this._log(logHead, this.getStats(statsSource, this._unoptimizedParsedQueryStats, this._unoptimizedTabsStats));
	}
},

update: function(value) {
	const logHead = "SearchQuery::update(\"" + value + "\"): ";

	if(value.length == 0) {
		return;
	}

	this._searchQuery = value;
	this._parse(value);
	this._log(logHead + "_parse() returned", this._parsedQuery);

	if(this._unoptimizedParsedQuery != null) {
		this._simplifiedSearchQuery =
				this._parser.rebuildQueryString(this._unoptimizedParsedQuery, null, Classes.SearchParser.rebuildMode.SIMPLE);
	} else {
		this._simplifiedSearchQuery = "";
	}
},

reset: function() {
	this._searchQuery = "";
	this._simplifiedSearchQuery = "";
	this._unoptimizedParsedQuery = null;
	this._parsedQuery = null;
	this._unoptimizedParsedQueryStats = null;
	this._optimizedParsedQueryStats = null;
	this._optimizedTabsStats = {};
	this._unoptimizedTabsStats = {};
},

// "source" is optional. If not provided, we dump all the stats, if provided we dump
// only the stats from that source.
// "stats" should be either this._unoptimizedParsedQueryStats or this._optimizedParsedQueryStats.
getStats: function(source, queryStats, tabsStats) {
	queryStats = optionalWithDefault(queryStats, this._optimizedParsedQueryStats);
	tabsStats = optionalWithDefault(tabsStats, this._optimizedTabsStats);
	let retVal = "";

	let keys = Object.keys(tabsStats);
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
			s = tabsStats[keys[i]];
			retVal +=
				`For source "${s.source}":\n` +
				`\tTotal nodes evaluated: ${s.totalEvaluated}, for ${s.totalTabsEvaluated} ` +
				`tabs (average of ${(s.totalEvaluated / s.totalTabsEvaluated).toFixed(1)} nodes per tab ` +
				`(of ${queryStats.parsedNodes}))\n` +
				`\tTotal text nodes evaluated: ${s.totalEvaluatedText}, for ${s.totalTabsEvaluated} ` +
				`tabs (average of ${(s.totalEvaluatedText / s.totalTabsEvaluated).toFixed(1)} nodes per tab ` +
				`(of ${queryStats.parsedTextNodes}))\n`;
			if(s.maxResults != null) {
				retVal += `\tResults limited to a max of ${s.maxResults} (limit ${s.maxReached ? "" : "not "}reached)\n`;
			}
		}
		return retVal;
	} catch(e) {
		return e;
	}
},

getOptimizedStats: function() {
	return this.getStats();
},

getUnoptimizedStats: function() {
	if(isProd()) {
		return "";
	}
	return this.getStats(null, this._unoptimizedParsedQueryStats, this._unoptimizedTabsStats);
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

// Returns a rebuild of the text query starting from the unoptimized parsed nodes
getUnoptimizedParsedQuery: function(rebuildMode) {
	if(this._unoptimizedParsedQuery == null) {
		return "";
	}

	return this._parser.rebuildQueryString(this._unoptimizedParsedQuery, null, rebuildMode);
},

// Returns a rebuild of the text query starting from the optimized parsed nodes
getParsedQuery: function(rebuildMode) {
	if(this._parsedQuery == null) {
		return "";
	}

	this._log(this._parsedQuery, this._optimizer.getInfo());
	return this._parser.rebuildQueryString(this._parsedQuery, null, rebuildMode);
},

getOptimizerInfo: function() {
	let optInfo = this._optimizer.getInfo();
	optInfo.unoptimizedStats = this._unoptimizedParsedQueryStats;
	optInfo.optimizedStats = this._optimizedParsedQueryStats;
	return optInfo;
},

getErrors: function() {
	errors = this._tokenizer.getErrors();

	if(errors == null || errors.length == 0) {
		return null;
	}

	let retVal = [];

	for(let i = 0; i < errors.length; i++) {
		retVal.push(tmUtils.splitCamelCase(errors[i].name) + ": " + tmUtils.toLowerCaseInitial(errors[i].message));
	}

	return retVal;
},

}); // Classes.SearchQuery
