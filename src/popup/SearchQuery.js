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

	// Just used for debugging the optimizer
	_changeHistory: null,

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
				newNode.value = this._buildRegexValue(node);
				// If the original had no error, this should not cause an error...
				this._assert(newNode.value != null, logHead + "copied node has null regex");
			}
			break;

		default:
			this._err(logHead + "unknown node type \"" + node.type + "\"");
	}

	return newNode;
},


// QUERY OPTIMIZATION FUNCTIONS

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

_buildRegexValue: function(node) {
	return this._parseRegex(this._mergeNodeSources(node));
},

_isRegexParsable: function(node) {
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

// Returns "null" if the node can't be converted
_convertNodeToRegexSource: function(node) {
	const logHead = "SearchParser::_convertNodeToRegexSource(): ";

	let convertibleTypes = [
		Classes.SearchTokenizer.type.TEXT,
		Classes.SearchTokenizer.type.QUOTEDTEXT,
		Classes.SearchTokenizer.type.REGEX,
	];

	if(!convertibleTypes.includes(node.type)) {
		return null;
	}

	if(!this._isRegexParsable(node)) {
		return null;
	}

	let sources = [];

	if(node.type == Classes.SearchTokenizer.type.REGEX) {
		// This is a shallow copy of the array (each source is shared between original and
		// copy), so it's faster than tmUtils.deepCopy(), but we can use it only because we
		// now that a source is read-only once created.
		sources = sources.concat(node.sources);
		this._log(logHead + "regex sources: ", sources);
	} else {
		sources = [ tmUtils.freeze({ type: node.type, value: tmUtils.regexEscape(node.value) }) ];
		this._log(logHead + "sources: ", sources);
	}

	return sources;
},

_convertOrToRegex: function(node, changed) {
	let regexNode = {
		type: Classes.SearchTokenizer.type.REGEX,
		sources: [],
	};

	let operandsLeft = [];
	// "convertedSources" is an array of arrays of sources, since this._convertNodeToRegexSource()
	// returns an array of sources
	let convertedSources = [];
	let countRegex = 0;
	let countNonRegex = 0;

	for(let i = 0; i < node.operands.length; i++) {
		let newSources = this._convertNodeToRegexSource(node.operands[i]);
		if(newSources == null) {
			operandsLeft.push(node.operands[i]);
		} else {
			convertedSources.push(newSources);
			if(node.operands[i].type == Classes.SearchTokenizer.type.REGEX) {
				countRegex++;
			} else {
				countNonRegex++;
			}
		}
	}

	if(countRegex < 2 && countNonRegex == 0) {
		// We couldn't convert anything, just return the original node with no changes made.
		// "countRegex < 2" because if there's one regex converted to one regex, there's
		// really no progress to speak of.
		return null;
	}

	regexNode.sources = regexNode.sources.concat.apply(regexNode.sources, convertedSources);
	regexNode.value = this._buildRegexValue(regexNode);

	if(regexNode.value == null) {
		// Failed to create the regex, no deal, stay with what we have
		const logHead = "SearchParser::_convertOrToRegex(): ";
		this._log(logHead + "unable to parse regex for sources:", regexNode.sources);
		return null;
	}

	// Nothing until now can be considered a change...
	changed.changed = true;
	// We have a new, functional regexNode, but do we still need an "OR" parent node?
	if(operandsLeft.length > 0) {
		// Since we've not been able to convert all the operands, the top "OR" must stay,
		// and the regex becomes its last operand
		changed.what.push("kept OR node, consolidated some operands");
		operandsLeft.push(regexNode);
		// Never reuse a "node", always create a new one...
		return {
			type: Classes.SearchTokenizer.type.BINARYOP,
			value: node.value,
			operands: operandsLeft,
		};
	}

	// The "OR" node can be completely replaced by the new regexNode
	changed.what.push("consolidated all operands, OR replaced");
	return regexNode;
},

// Returns a dictionary of operands, grouped by operator value for unary operators,
// or grouped together under the "_ungrouped" group for non-unary operators (any
// other Classes.SearchTokenizer.type)
_groupByUnaryModifier: function(node) {
	const logHead = "SearchParser::_groupByUnaryModifier(): ";
	let groups = {};
	let ungrouped = [];

	this._log(logHead + "node: ", node);

	for(let i = 0; i < node.operands.length; i++) {
		let operand = node.operands[i];
		// The "-" boolean operator cannot be simply extracted out of an OR/AND
		if(operand.type == Classes.SearchTokenizer.type.UNARYOP && operand.value != "-") {
			if(groups[operand.value] != null) {
				groups[operand.value].push(operand);
			} else {
				groups[operand.value] = [ operand ];
			}
		} else {
			ungrouped.push(operand);
		}
	}

	this._log(logHead + "groups: ", groups);
	// If we've formed groups with only one operand in it, let's move them back to
	// the _ungrouped group, there's nothing useful we can do with groups of one.
	let groupKeys = Object.keys(groups);
	for(let i = 0; i < groupKeys.length; i++) {
		let group = groups[groupKeys[i]];
		if(group.length == 1) {
			ungrouped.push(group[0]);
			delete groups[groupKeys[i]];
		}
	}

	groups["_ungrouped"] = ungrouped;
	return groups;
},

_createUnaryGroupNode: function(group, refBinaryOpNode) {
	let newBinaryOperand = {
		type: refBinaryOpNode.type,
		value: refBinaryOpNode.value,
		operands: [],
	};

	for(let i = 0; i < group.length; i++) {
		// group[i] is the unary operator we're promoting out, so we need to
		// pass its operands to the new OR/AND operator
		newBinaryOperand.operands.push(group[i].operand);
	}

	return {
		type: group[0].type,
		value: group[0].value,
		operand: newBinaryOperand,
	};
},

_promoteUnaryModifierOverBinaryOp: function(node, changed) {
	const logHead = "SearchParser::_promoteUnaryModifierOverBinaryOp(): ";

	// this._groupByUnaryModifier() makes sure to avoid trying this action for
	// the "-" boolean unary operator. This action can't be taken for boolean
	// unary operators, only for unary modifiers.
	let groups = this._groupByUnaryModifier(node);
	let groupKeys = Object.keys(groups);

	this._log(logHead + "groups: ", groups);

	if(groupKeys.length == 1) {
		// "groups" contains only the "_ungrouped" group, nothing to do
		return node;
	}

	changed.changed = true;

	let groupNodes = [];
	let ungrouped = null;
	for(let i = 0; i < groupKeys.length; i++) {
		if(groupKeys[i] != "_ungrouped") {
			groupNodes.push(this._createUnaryGroupNode(groups[groupKeys[i]], node));
		} else {
			ungrouped = groups[groupKeys[i]];
		}
	}

	if(ungrouped.length == 0 && groupNodes.length == 1) {
		// All operands of the root OR/AND were the same unary modifier, and that modifier
		// got promoted up
		changed.what.push("swapped '" + node.value + "' and '" + groupNodes[0].value + ":'");
		return groupNodes[0];
	}

	// Either "ungrouped" is not empty, or there are more than one groupNodes, in both
	// cases we still need a root OR/AND
	changed.what.push("partial swap of '" + node.value + "' and unary groups");
	return {
		type: node.type,
		value: node.value,
		operands: [].concat(groupNodes, ungrouped),
	};
},

_orOptimizer: function(node, changed) {
	newNode = this._convertOrToRegex(node, changed);
	if(newNode != null) {
		return newNode;
	}

	return node;
},	  

_mergeBinaryOperands: function(node, changed) {
	let inclusionTypes = [
		Classes.SearchTokenizer.type.TEXT,
		Classes.SearchTokenizer.type.QUOTEDTEXT,
	];
	let equalityTypes = [
	// "inclusionTypes" is checked first, and it checks for equality too, so
	// no need to include those types here too
		//Classes.SearchTokenizer.type.TEXT,
		//Classes.SearchTokenizer.type.QUOTEDTEXT,
		Classes.SearchTokenizer.type.REGEX,
	];

	// Copy the original operands array
	let operandsKept = [].concat(node.operands);
	let somethingDropped = false;

	function innerLoop(refOperand, refOperandIdx) {
		for(let j = refOperandIdx + 1; j < operandsKept.length; j++) {
			let cmpOperand = operandsKept[j];
			if(cmpOperand == null) {
				continue;
			}
			if(inclusionTypes.includes(cmpOperand.type)) {
				// Check if cmpOperand includes operand or viceversa
				if(node.value == "and") {
					if(cmpOperand.value.includes(refOperand.value)) {
						// For "and", we need to keep the longest match and can drop
						// the shorter included match.
						// "cmpOperand" (j) is longer, drop "refOperand" (i).
						operandsKept[refOperandIdx] = null;
						somethingDropped = true;
						// The reference operand has been dropped, no reason to continue
						// with the inner loop for "operand"
						return;
					}
					// Now the viceversa
					if(refOperand.value.includes(cmpOperand.value)) {
						// "refOperand" (i) is longer, drop "cmpOperand" (j).
						operandsKept[j] = null;
						somethingDropped = true;
						continue;
					}
				}
				if(node.value == "or") {
					if(cmpOperand.value.includes(refOperand.value)) {
						// For "or", we need to keep the shorter match and can drop
						// the longer including match.
						// "cmpOperand" (j) is longer, drop "cmpOperand" (i).
						operandsKept[j] = null;
						somethingDropped = true;
						continue;
					}
					// Now the viceversa
					if(refOperand.value.includes(cmpOperand.value)) {
						// "refOperand" (i) is longer, drop "refOperand" (j).
						operandsKept[refOperandIdx] = null;
						somethingDropped = true;
						// The reference operand has been dropped, no reason to continue
						// with the inner loop for "operand"
						return;
					}
				}
			}
			// If we get here, inclusion didn't drop either refOperand or cmpOperand
			if(equalityTypes.includes(cmpOperand.type)) {
				// Note that here we have more
				if(cmpOperand.value == refOperand.value) {
					// Drop cmpOperand (we could drop either one...)
					operandsKept[j] = null;
					somethingDropped = true;
				}
			}
		}
	}

	for(let i = 0; i < operandsKept.length; i++) {
		let operand = operandsKept[i];
		if(operand == null) {
			continue;
		}
		if(!inclusionTypes.includes(operand.type)) {
			continue;
		}
		// Lookahead to see if some other operand matches, and start pruning
		// operandsKept by changing some array elements to "null"
		innerLoop(operand, i);
	}

	if(!somethingDropped) {
		// Nothing happened
		return node;
	}

	// Something has changed
	changed.changed = true;
	let newNode = {
		type: node.type,
		value: node.value,
		operands: [],
	}
	for(let i = 0; i < operandsKept.length; i++) {
		if(operandsKept[i] == null) {
			changed.what.push("dropped redundant operand " + i + " for '" + node.value + "'");
		} else {
			newNode.operands.push(operandsKept[i]);
		}
	}

	if(newNode.operands.length == 1) {
		// A binary operator needs to have at least two operands. If there's only one
		// operand left, let's also dropped the operator.
			changed.what.push("single operand left, dropped redundant operator '" + node.value + "'");
		return newNode.operands[0];
	}

	return newNode;
},

_mergeBinaryOperators: function(node, changed) {
	switch(node.type) {
		case Classes.SearchTokenizer.type.BINARYOP:
			for(let i = 0; i < node.operands.length; i++) {
				node.operands[i] = this._mergeBinaryOperators(node.operands[i], changed);
			}
			// Only this case needs more work later, all other cases return immediately
			break;

		case Classes.SearchTokenizer.type.UNARYOP:
			node.operand = this._mergeBinaryOperators(node.operand, changed);
			return node;

		default:
			return node;
	}

	// If we get here, the current node is a binary operator
	let newOperands = [];
	for(let i = 0; i < node.operands.length; i++) {
		if(node.operands[i].type == node.type && node.operands[i].value == node.value) {
			// Merge up...
			changed.changed = true;
			changed.what.push("merged parent and child '" + node.value + "'");
			newOperands = newOperands.concat(node.operands[i].operands);
		} else {
			// If we merge, we need to lose node.operands[i], if we don't, we need to keep it
			newOperands.push(node.operands[i]);
		}
	}

	return {
		type: node.type,
		value: node.value,
		operands: newOperands,
	};
},

_mergeUnaryOperators: function(node, changed) {
	switch(node.type) {
		case Classes.SearchTokenizer.type.BINARYOP:
			for(let i = 0; i < node.operands.length; i++) {
				node.operands[i] = this._mergeUnaryOperators(node.operands[i], changed);
			}
			return node;

		case Classes.SearchTokenizer.type.UNARYOP:
			node.operand = this._mergeUnaryOperators(node.operand, changed);
			// Only this case needs more work later, all other cases return immediately
			break;

		default:
			return node;
	}

	// If we get here, the current node is a unary operator. 
	if(node.operand.type != node.type) {
		// First off, if the inner node is not a unary operator, nothing to merge
		return node;
	}

	// As usual, "-" behaves differently from the other unay operators: "-" can only
	// be merged with another "-" (actually not "merged", two negations must be turned
	// into a no-op), while unary modifiers use the "inner wins" rule.
	if(node.value == "-") {
		if(node.operand.value != "-") {
			// No action to take
			return node;
		}
		// Both this node and its operand are a "-", they both need to disappear in order to
		// turn this into a no-op. There might be more "-" down the chain, but we only consume
		// two at a time...
		changed.changed = true;
		changed.what.push("eliminated a consecutive pair of '-'");
		return node.operand.operand;
	}

	// Unary modifier case. We already know node.operand is also a unary modifier, let's just
	// make sure it's not a "-".
	if(node.operand.value == "-") {
		// No action to take
		return node;
	}

	// Chain of two unary modifiers, drop the parent. There might be more, but we only drop
	// one at a time
	changed.changed = true;
	changed.what.push("eliminated a '" + node.value + ":', since it was followed by a '" + node.operand.value + ":'");
	return node.operand;
},

// Returns "true" if some optimization was applied, "false" if not
_optimizeInner: function(node, changed) {
	switch(node.type) {
		case Classes.SearchTokenizer.type.BINARYOP:
			for(let i = 0; i < node.operands.length; i++) {
				node.operands[i] = this._optimizeInner(node.operands[i], changed);
			}

			node = this._promoteUnaryModifierOverBinaryOp(node, changed);
			if(node.type != Classes.SearchTokenizer.type.BINARYOP) {
				// These actions can change the type of the current node being processed,
				// and when that happens, the current switch/case block can't continue
				// to proceed. We return the new node to the caller, and expect that
				// there's going to be a future iteration to run through the other
				// optimization functions below.
				return node;
			}

			node = this._mergeBinaryOperands(node, changed);
			if(node.type != Classes.SearchTokenizer.type.BINARYOP) {
				return node;
			}

			if(node.value == "or") {
				return this._orOptimizer(node, changed);
			}
			return node;

		case Classes.SearchTokenizer.type.UNARYOP:
			node.operand = this._optimizeInner(node.operand, changed);
			return node;

		case Classes.SearchTokenizer.type.TEXT:
		case Classes.SearchTokenizer.type.QUOTEDTEXT:
		case Classes.SearchTokenizer.type.REGEX:
		default:
			return node;
	}
},

_sortOptimized: function(node) {
	function typeSort(a, b) {
		if(a.type == b.type) {
			return 0;
		}

		let aType = a.type;
		let bType = b.type;

		if(aType == Classes.SearchTokenizer.type.QUOTEDTEXT) {
			aType = Classes.SearchTokenizer.type.TEXT;
		}
		if(bType == Classes.SearchTokenizer.type.QUOTEDTEXT) {
			bType = Classes.SearchTokenizer.type.TEXT;
		}
		return (aType < bType) ? -1 : 1;
	}

	function operandSort(a, b) {
		let typeSorted = typeSort(a, b);
		if(typeSorted != 0) {
			return typeSorted;
		}

		return a.value.localeCompare(b.value);
	}

	function sourcesSort(a, b) {
		return a.value.localeCompare(b.value);
	}

	switch(node.type) {
		case Classes.SearchTokenizer.type.BINARYOP:
			for(let i = 0; i < node.operands.length; i++) {
				this._sortOptimized(node.operands[i]);
			}
			node.operands.sort(operandSort);
			break;

		case Classes.SearchTokenizer.type.UNARYOP:
			this._sortOptimized(node.operand);
			break;

		case Classes.SearchTokenizer.type.REGEX:
			node.sources.sort(sourcesSort);

		case Classes.SearchTokenizer.type.TEXT:
		case Classes.SearchTokenizer.type.QUOTEDTEXT:
		default:
			break;
	}
},

optimize: function(rootNode) {
	const logHead = "SearchParser::optimize(): ";

	let targetTree = this.cloneTree(rootNode);

	let changed = {
		changed: true,
		what: [],
	};

	while(changed.changed) {
		changed.changed = false;
		targetTree = this._mergeBinaryOperators(targetTree, changed);
		targetTree = this._mergeUnaryOperators(targetTree, changed);
		targetTree = this._optimizeInner(targetTree, changed);
		this._sortOptimized(targetTree);
	}

	this._changeHistory = changed.what;

	this._log(logHead + "what changed:", changed.what);
	return targetTree;
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

// When "fullRebuild" is set to "true", this function behaves as a debugging function
// to validate what the parser has done.
// When it's set to false, it generates a simplified version of the query string with
// all operators omitted, to be used with the chrome.history.search() and
// chrome.bookmarks.search() APIs.
rebuildQueryString: function(node, parentNode, rebuildMode) {
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
	}
},

}); // Classes.SearchParser

Classes.Base.roDef(Classes.SearchParser, "rebuildMode", {} );
Classes.Base.roDef(Classes.SearchParser.rebuildMode, "MIN", "min" );
Classes.Base.roDef(Classes.SearchParser.rebuildMode, "MAX", "max" );
Classes.Base.roDef(Classes.SearchParser.rebuildMode, "SIMPLE", "simple" );


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
	_unoptimizedParsedQuery: null,

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
			for(let i = 0; i < node.operands.length; i++) {
				this._countParsedNodes(node.operands[i]);
			}
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
	this._unoptimizedParsedQuery = null;
	this._parsedQuery = null;

	let tokenList = [];
	this._tokenizer.tokenize(queryString, tokenList);
	this._log(logHead + "tokenize() returned", tokenList);

	if(tokenList.length != 0) {
		this._unoptimizedParsedQuery = this._parser.parse(tokenList);
		this._parsedQuery = this._parser.optimize(this._unoptimizedParsedQuery);
		this._countParsedNodes(this._parsedQuery);
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
			stats.cntEvaluatedText++;
			return this._evaluateTextNode(tab, queryNode.value, modifier);

		case Classes.SearchTokenizer.type.REGEX:
			if(queryNode.error == null) {
				stats.cntEvaluatedText++;
				return this._evaluateRegexNode(tab, queryNode.value, modifier);
			}
			// If we failed to parse a regex, let's assume it's evaluation is "false"
			return false;

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

	this._log(this._parsedQuery, this._parser._changeHistory);
	return this._parser.rebuildQueryString(this._parsedQuery, null, rebuildMode);
},

getState: function() {
	return "value: \"" + this._searchQuery + "\"";
},

}); // Classes.SearchQuery
