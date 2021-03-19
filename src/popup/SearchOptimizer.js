// CLASS SearchOptimizer
//
// QUERY OPTIMIZATION FUNCTIONS
//
Classes.SearchOptimizer = Classes.Base.subclass({

	// _parserDebug is an alias for _log() to be turned on/off as needed, since
	// debugging messages for the parser/optimizer can be very verbose
	_parserDebug: null,

	// The optimizer needs to call some utility functions from the parser. They could
	// be static functions, except that some must emit debug messages
	_parser: null,

	// Just used for debugging the optimizer
	_changeHistory: null,
	_iterationsCnt: null,

	_maxIterationCnt: 100,

_init: function(searchParser) {
	// Overriding the parent class' _init(), but calling that original function first
	Classes.Base._init.call(this);
	this.debug();

	// this._parserDebug = this._log;
	this._parserDebug = emptyFn;

	this._parser = searchParser;
},

_setChanged: function(changed, msg) {
	changed.changed = true;
	changed.what.push("[" + changed.iteration + "] " + msg);
},

// Returns "null" if the node can't be converted
_convertNodeToRegexSource: function(node) {
	const logHead = "SearchOptimizer::_convertNodeToRegexSource(): ";

	let convertibleTypes = [
		Classes.SearchTokenizer.type.TEXT,
		Classes.SearchTokenizer.type.QUOTEDTEXT,
		Classes.SearchTokenizer.type.REGEX,
	];

	if(!convertibleTypes.includes(node.type)) {
		return null;
	}

	if(!this._parser.isRegexParsable(node)) {
		return null;
	}

	let sources = [];

	if(node.type == Classes.SearchTokenizer.type.REGEX) {
		// This is a shallow copy of the array (each source is shared between original and
		// copy), so it's faster than tmUtils.deepCopy(), but we can use it only because we
		// now that a source is read-only once created.
		sources = sources.concat(node.sources);
		this._parserDebug(logHead + "regex sources: ", sources);
	} else {
		sources = [ tmUtils.freeze({ type: node.type, value: tmUtils.regexEscape(node.value) }) ];
		this._parserDebug(logHead + "sources: ", sources);
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
	regexNode.value = this._parser.buildRegexValue(regexNode);

	if(regexNode.value == null) {
		// Failed to create the regex, no deal, stay with what we have
		const logHead = "SearchOptimizer::_convertOrToRegex(): ";
		this._log(logHead + "unable to parse regex for sources:", regexNode.sources);
		return null;
	}

	// We have a new, functional regexNode, but do we still need an "OR" parent node?
	if(operandsLeft.length > 0) {
		// Since we've not been able to convert all the operands, the top "OR" must stay,
		// and the regex becomes its last operand
		this._setChanged(changed, "kept OR node, consolidated some operands");
		operandsLeft.push(regexNode);
		// Never reuse a "node", always create a new one...
		return {
			type: Classes.SearchTokenizer.type.BINARYOP,
			value: node.value,
			operands: operandsLeft,
		};
	}

	// The "OR" node can be completely replaced by the new regexNode
	this._setChanged(changed, "consolidated all operands, OR replaced");
	return regexNode;
},

// Returns a dictionary of operands, grouped by operator value for unary operators,
// or grouped together under the "_ungrouped" group for non-unary operators (any
// other Classes.SearchTokenizer.type)
_groupByUnaryModifier: function(node) {
	const logHead = "SearchOptimizer::_groupByUnaryModifier(): ";
	let groups = {};
	let ungrouped = [];

	this._parserDebug(logHead + "node: ", node);

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

	this._parserDebug(logHead + "groups: ", groups);
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

_promoteUnaryModifierOverUnaryBoolean: function(node, changed) {
	// "node" is expected to be a nuary boolean like "-", and we expect the
	// operand to be a unary modifier. Let's re-validate that, just in case...
	if(!(node.type == Classes.SearchTokenizer.type.UNARYOP && node.type == node.operand.type)) {
		// Nope, nothing to do
		return node;
	}

	// Next we want to re-validate that the current outer operator is a booleans, and the
	// inner is a modifier, that's the only legal swap
	if(!(node.value == "-" && node.operand.value != "-")) {
		return node;
	}

	this._setChanged(changed, "promoted '" + node.operand.value + ":' by swapping with unaryOp '-'");
	// We could simply swap the text in "node.value" and "node.operand.value", but we're trying
	// to get out of the habit of messing around with existing nodes (they should be read-only!)
	// and always create new nodes when changes are needed.
	return {
		type: node.type,
		value: node.operand.value,
		operand: {
			type: node.type,
			value: node.value,
			operand: node.operand.operand
		}
	};
},

_promoteUnaryModifierOverBinaryOp: function(node, changed) {
	const logHead = "SearchOptimizer::_promoteUnaryModifierOverBinaryOp(): ";

	// this._groupByUnaryModifier() makes sure to avoid trying this action for
	// the "-" boolean unary operator. This action can't be taken for boolean
	// unary operators, only for unary modifiers.
	let groups = this._groupByUnaryModifier(node);
	let groupKeys = Object.keys(groups);

	this._parserDebug(logHead + "groups: ", groups);

	if(groupKeys.length == 1) {
		// "groups" contains only the "_ungrouped" group, nothing to do
		return node;
	}

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
		this._setChanged(changed, "promoted '" + groupNodes[0].value + ":' by swapping with binaryOp '" + node.value + "'");
		return groupNodes[0];
	}

	// Either "ungrouped" is not empty, or there are more than one groupNodes, in both
	// cases we still need a root OR/AND
	this._setChanged(changed, "partial swap of '" + node.value + "' and unary groups");
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

_createOperandInfo: function(operand, operandIdx, operandDropped) {
	if(operand == null) {
		return null;
	}

	// "opd" is short for operand, with "operator" and "operand" it's hard to get to unambiguous shorthands 
	let opdInfo = {
		opd: operand,
		val: operand.value,
		idx: operandIdx,
		neg: false,
		dropped: operandDropped,
	}

	// Skip through the unary modifiers, then track unary negation separately, to maximize
	// chance of getting to a text/regex leaf for comparison
	while(opdInfo.opd.type == Classes.SearchTokenizer.type.UNARYOP && opdInfo.opd.value != "-") {
		// Skipped through all the unary modifiers, until the innermost unary modifier
		// is set as "opdInfo.pOpd" (parent opd)
		opdInfo.pOpd = opdInfo.opd;
		opdInfo.val = opdInfo.opd.operand.value;		
		opdInfo.opd = opdInfo.opd.operand;
	}

	if(opdInfo.opd.type == Classes.SearchTokenizer.type.UNARYOP && opdInfo.opd.value == "-") {
		opdInfo.neg = true;
		// Don't set the pOpd in this case, we know there's a "-" because of opdInfo.neg,
		// and we need to track a potential unary modifier with opdInfo.pOpd
		//opdInfo.pOpd = opdInfo.opd;
		opdInfo.val = opdInfo.opd.operand.value
		opdInfo.opd = opdInfo.opd.operand;
	}
	return opdInfo;
},

// This function assumes "longer" is strictly longer than "shorter", and doesn't
// account for the possibility that "longer" might be identical to "shorter", you
// need to exclude that case outside of this function
_dropWhatForIncludes: function(longer, shorter, longerName, shorterName, operator) {
	const logHead = "SearchOptimizer::_dropWhatForIncludes() ";
	// See commment at top of function
	this._assert(longer.val != shorter.val, logHead + "don't call this function for identical values", longer, shorter);

	if(!longer.dropped && !shorter.dropped) {
		// If we've already dropped one of these operands, there's no reason to try
		// to drop them again, so skip these two checks
		if((operator == "and" && (!longer.neg && !shorter.neg)) ||
			(operator == "or" && (longer.neg && shorter.neg))) {
			// For "and" (opd both non negated) or "or" (opd both negated), we need to
			// keep the longer match and can drop the shorter included match.
			// If they're both the same length (equality), we can drop either, so we
			// don't need to check for that explicitly.
			return shorterName;
		}
		if((operator == "and" && (longer.neg && shorter.neg)) ||
			(operator == "or" && (!longer.neg && !shorter.neg))) {
			// For "and" (opd both negated) or "or" (opd both non negated), we need to
			// keep the shorter included match and can drop the longer including match.
			// If they're both the same length (equality), we can drop either, so we
			// don't need to check for that explicitly.
			return longerName;
		}
	} else {
		// We want to get to the next set of checks when at least one of the operands
		// is already dropped, but only to check the higher priority tautology/contradiction
		// case. That case exists only if longer and shorter are one negated and the other
		// not negated, so if they're both negated or both not negated, no reason to continue.
		if((!longer.neg && !shorter.neg) || (longer.neg && shorter.neg)) {
			return "none";
		}
	}

	// If we get here, only longer is negated, or only shorter is negated.
	// Since equality has already been taken off the table, one is strictly
	// longer than the other.
	if((operator == "and" && longer.neg) ||
		(operator == "or" && shorter.neg)) {
		// "and" and longer negated: keep both
		// - "a AND NOT aa" matches "ab", "ac", etc.
		// "or" and shorter (refOpdInfo) negated: keep both
		// - "NOT a OR aa" => "NOT (a AND NOT aa)" matches everything except "ab", "ac", etc.
		return "none";
	}
	if(operator == "and" && shorter.neg) {
		// "and" and shorter negated: contradiction
		// - "NOT a AND aa" matches nothing, it's "FALSE"
		return "false";
	}
	if(operator == "or" && longer.neg) {
		// "or" and longer negated: tautology
		// - "a OR NOT aa" => "NOT (NOT a AND aa)" matches everything, it's "TRUE"
		return "true";
	}
},

_dropWhatForEquality: function(ref, cmp, operator) {
	if((!ref.neg && !cmp.neg) || (ref.neg && cmp.neg)) {
		// We could pick either one
		return "either";
	}

	// Only one of ref and cmp is negated
	if(operator == "and") {
		// "aa AND NOT aa" is a contradiction
		return "false";
	}
	if(operator == "or") {
		// "aa OR NOT aa" is a tautology
		return "true";
	}
},

_dropWhatForTruth: function(opdInfo, opdInfoName, operator) {
	const logHead = "SearchOptimizer::_dropWhatForTruth(): ";

	let truthVal = opdInfo.val;
	let negated = "";
	if(opdInfo.neg)	{
		truthVal = truthVal == "true" ? "false" : "true";
		negated = "(negated)"
	}

	if(opdInfo.opd.type == Classes.SearchTokenizer.type.TRUTH) {
		// Ooops, the operand is a tautology/contradiction (probably from an inner node
		// turned into tautology/contradiction).
		if((operator == "and" && truthVal == "false") ||
			(operator == "or" && truthVal == "true")) {
			// Since this._parser.rebuildQueryString() is expensive, we don't want it to
			// get called unnecessarily in production (when this._log() is an emptyFn()),
			// so we use the short-circuiting properties of "||" (the second operand doesn't
			// get executed if the first operand is "true"
			this._parserDebug(logHead + "returning '" + truthVal + "' for operator '" + operator +
						"' and", isProd() || this._parser.rebuildQueryString(opdInfo.opd), negated);
			return truthVal;
		}
		this._parserDebug(logHead + "returning '" + opdInfoName + "' for operator '" + operator +
						"' and", isProd() || this._parser.rebuildQueryString(opdInfo.opd), negated);
		return opdInfoName;
	}
	return null;
},

_dropWhat: function(refOpdInfo, cmpOpdInfo, operator) {
	// If both operators are under unary modifiers (that's the only case opdInfo.pOpd != null),
	// but the two unary modifiers are not the same, these two operands are incompatible
	// for the checks we're aboud to perform
	if(refOpdInfo.pOpd != null && cmpOpdInfo.pOpd != null &&
		refOpdInfo.pOpd.value != cmpOpdInfo.pOpd.value) {
		return "none";
	}

	let truthFound = this._dropWhatForTruth(refOpdInfo, "ref", operator);
	if(truthFound != null) {
		return truthFound;
	}
	truthFound = this._dropWhatForTruth(cmpOpdInfo, "cmp", operator);
	if(truthFound != null) {
		return truthFound;
	}

	// Note that this function does not process operands of type Classes.SearchTokenizer.type.TRUTH,
	// as they're getting dropped directly by the caller
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

	if(inclusionTypes.includes(refOpdInfo.opd.type) &&
		inclusionTypes.includes(cmpOpdInfo.opd.type)) {
		// We need to check for equality first, because equality is the only case in
		// which we can return "either", and "either" is more general, the _dropWhatForIncludes()
		// function would select the longer or shorter even when they're equal. less generic.
		// Returning the more generic is more important, because only the caller knows if
		// one of the two has a modifier and the other doesn't.
		if(refOpdInfo.val == cmpOpdInfo.val) {
			return this._dropWhatForEquality(refOpdInfo, cmpOpdInfo, operator);
		}

		if(cmpOpdInfo.val.includes(refOpdInfo.val)) {
			return this._dropWhatForIncludes(cmpOpdInfo, refOpdInfo, "cmp", "ref", operator);
		}

		if(refOpdInfo.val.includes(cmpOpdInfo.val)) {
			return this._dropWhatForIncludes(refOpdInfo, cmpOpdInfo, "ref", "cmp", operator);
		}
		// If we get here, there was no inclusion from either side. Since inclusion includes
		// also equality checks, nothing left to do
		return "none";
	}

	if(equalityTypes.includes(refOpdInfo.opd.type) &&
		equalityTypes.includes(cmpOpdInfo.opd.type)) {
		if(refOpdInfo.val == cmpOpdInfo.val) {
			return this._dropWhatForEquality(refOpdInfo, cmpOpdInfo, operator);
		}

		return "none";
	}

	// We get here if ref and cmp had mispatched types (e.g. one is a TEXT, the other a REGEX)
	return "none"
},

// _dropWhat() doesn't take into account unary modifiers as "pOpd" of the operands
// (except for the basic case of two different unary modifiers), so this function needs
// to make adjustments to the results of _dropWhat() to take the unary modifiers into account.
// The cases not covered by _dropWhat() are: one operand has a unary modifier, the other
// doesn't, or both have it and it's the same, or both don't have it (both have it but
// they're different is managed by _dropWhat())
_adjustDropWhat: function(dropWhat, refOpdInfo, cmpOpdInfo, operator) {
	if((refOpdInfo.pOpd == null && cmpOpdInfo.pOpd == null) ||
		(refOpdInfo.pOpd != null && cmpOpdInfo.pOpd != null)) {
		// If both operands have the same unary modifier, or both operands don't have
		// unary modifiers at all, the result from _dropWhat() is valid. The "either"
		// case is really either, so let's pick one...
		if(dropWhat == "either") {
			return "cmp";
		}
		return dropWhat;
	}

	// If we get here, only one of the two operands has a unary modifier.
	// The operand without modifier has a wider scope, while the operand with
	// a unary modifier has a narrower scope (the operand without the unary
	// modifier also matches the tab properties managed by all unary modifier,
	// but a specific unary modifier only matches its own tab property).
	// For "and" it's only legal to drop the operand with wider scope, while for
	// "or" it's only legal to drop the operand with narrower scope.
	switch(dropWhat) {
		case "none":
			return "none";

		case "either":
			// This is where "either" is not really "either", you must drop the
			// operand with the narrower scope (with the unary modifier)
			if(refOpdInfo.pOpd != null) {
				if(operator == "and") {
					return "cmp";
				}
				return "ref";
			}
			if(operator == "and") {
				return "ref";
			}
			return "cmp";

		case "ref":
			if((refOpdInfo.pOpd != null && operator == "or") ||
				(cmpOpdInfo.pOpd != null && operator == "and")) {
				return dropWhat;
			}
			return "none";
		case "cmp":
			if((cmpOpdInfo.pOpd != null && operator == "or") ||
				(refOpdInfo.pOpd != null && operator == "and")) {
				return dropWhat;
			}
			return "none";

		case "true":
			// Tautologies happen only with the "OR" operator, and if a tautology exists
			// for the "naked" operands, it remains true when one operand has no unary
			// modifier and the other has a unary modifier. To see the reasons, imagine
			// your operand with no unary modifier as expanded to an "OR" of all
			// unary modifiers:
			// "google.com" === "site:google.com or inurl:google.com or intitle:google.com or ..."
			// When you see it like that, then "google.com or site:-google.com" means
			// "site:google.com or site:-google.com or inurl:google.com or ..."
			// and clearly the first two operands create a tautology.
			return dropWhat;

		case "false":
			// Contradictions happen only with the "AND" operator.
			// When only one of the two operands has a unary modifier, the "dropWhat"
			// value of a contradiction is invalid. It's only valid if both have the
			// same unary modifier, or if both don't have a unary modifier.
			// To see that, make the same transformation as in the previous case:
			// "google.com" === "site:google.com or inurl:google.com or intitle:google.com or ...",
			// so "google.com and site:-google.com" means:
			// "(site:google.com or inurl:google.com or intitle:google.com or ...) and site:-google.com",
			// which can be turned (using "(a OR b) AND c" == "(a AND c) OR (b AND c)"):
			// "(site:google.com and site:-google.com) or (inurl:google.com and site:-google.com) ...",
			// and while "(site:google.com and site:-google.com)" is a contradiction (FALSE), putting
			// "FALSE" in an "OR" simply drops it, turning our statement to:
			// "(inurl:google.com and site:-google.com) or (intitle:google.com and site:-google.com) or ..."
			return "none";
	}
},

_mergeBinaryOperands: function(node, changed) {
	// Copy the original operands array. We prune by setting "null" for operands in
	// "operandsKept", but we iterate "node.operands". Pruning can lead to suboptimal
	// pruning, that's why we still need to iterate over pruned operands, in case we
	// find higher priority actions to take.
	// For example, if the operator is "and" and the operands are [ "aa", "aaa", "-aaa" ],
	// we'd first find an "includes" match for "aa" and "aaa", and that would lead us
	// to prune "aaa", leaving us with [ "aa", null, "-aaa" ]. That's suboptimal because
	// when we get to compare "aa" and "-aaa", _dropWhat("aa", "-aaa") says "none", but if
	// we still had "aaa", _dropWhat("aaa", "-aaa") would return "false" (that is, the
	// entire "and" is a contradiction, so it's always false).
	let operandsKept = [].concat(node.operands);
	let somethingDropped = false;

	let innerLoop = function(refOpdInfo) {
		const logHead = "SearchOptimizer::_mergeBinaryOperands.innerLoop(): ";

		for(let j = refOpdInfo.idx + 1; j < node.operands.length; j++) {
			let cmpOpdInfo = this._createOperandInfo(node.operands[j], j, operandsKept[j] == null);

			let dropWhat = this._dropWhat(refOpdInfo, cmpOpdInfo, node.value);
			this._parserDebug(logHead + "_dropWhat() returned '" + dropWhat + "' for ||| ref:",
						isProd() || this._parser.rebuildQueryString(node.operands[refOpdInfo.idx]), "||| cmp:",
						isProd() || this._parser.rebuildQueryString(node.operands[j]));
			// Filter "either" out
			dropWhat = this._adjustDropWhat(dropWhat, refOpdInfo, cmpOpdInfo, node.value);
			switch(dropWhat) {
				case "ref":
					operandsKept[refOpdInfo.idx] = null;
					refOpdInfo.dropped = true;
					somethingDropped = true;
					// Even though the reference operand has been dropped, we still want
					// to continue with this loop to find out if there might be a
					// tautology/contradiction to be found with one of the following
					// operands, because that would cause the entire operator to be
					// dropped, not just this operand.
					continue;
				case "cmp":
					operandsKept[j] = null;
					// No need to set cmpOpdInfo.dropped = true, we're about to move
					// on to the next operand
					somethingDropped = true;
					continue;
				case "none":
					continue;
				case "true":
					// This case should exist only if the operator is "or". For "or" this is
					// a nuclear option, because the entire "or" becomes a tautology...
					this._assert(node.value == "or", logHead + "unexpected operator");
					return "true";
				case "false":
					// This case should exist only if the operator is "and". For "and" this is
					// a nuclear option, because the entire "and" becomes a contradiction...
					this._assert(node.value == "and", logHead + "unexpected operator");
					return "false";
				default:
					this._err(logHead + "unknown dropWhat = \"" + dropWhat + "\"");
					continue;
			}
		}
	}.bind(this);

	for(let i = 0; i < node.operands.length; i++) {
		let refOpdInfo = this._createOperandInfo(node.operands[i], i, operandsKept[i] == null);

		// Lookahead to see if some other operand matches, and start pruning
		// operandsKept by changing some array elements to "null"
		let nuclear = innerLoop(refOpdInfo);
		if(nuclear != null) {
			this._setChanged(changed, "binary operator '" + node.value + "' is a tautology/contradiction");
			return {
				type: Classes.SearchTokenizer.type.TRUTH,
				value: nuclear,
			}
		}
	}

	if(!somethingDropped) {
		// Nothing happened
		return node;
	}

	// Something has changed
	let newNode = {
		type: node.type,
		value: node.value,
		operands: [],
	}
	for(let i = 0; i < operandsKept.length; i++) {
		if(operandsKept[i] == null) {
			this._setChanged(changed, "dropped redundant operand " + i + " (" +
							this._parser.rebuildQueryString(node.operands[i]) + ") for '" + node.value + "'");
		} else {
			newNode.operands.push(operandsKept[i]);
		}
	}

	if(newNode.operands.length == 1) {
		// A binary operator needs to have at least two operands. If there's only one
		// operand left, let's also drop the operator.
		this._setChanged(changed, "single operand left, dropped redundant operator '" + node.value + "'");
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
			this._setChanged(changed, "merged parent and child '" + node.value + "'");
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

	if(node.operand.type == Classes.SearchTokenizer.type.TRUTH) {
		// Tautologies and contradictions eat unary modifiers for breakfast, while negation
		// unary needs to be applied to them
		if(node.value != "-") {
			this._setChanged(changed, "eliminated unary modifier '" + node.value +
							":' as it's followed by <" + node.operand.value.toUpperCase() + ">");
			return node.operand;
		} else {
			this._setChanged(changed, "applied unary '-' to <" + node.operand.value.toUpperCase() + ">");
			return {
				type: Classes.SearchTokenizer.type.TRUTH,
				value: (node.operand.value == "true") ? "false" : "true",
			}
		}
	}

	// If we get here, the current node is a unary operator. 
	if(node.operand.type != node.type) {
		// First off, if the inner node is not a unary operator, nothing to merge
		return node;
	}

	// As usual, "-" behaves differently from the other unary operators: "-" can only
	// be merged with another "-" (actually not "merged", two negations must be turned
	// into a no-op), while unary modifiers use the "inner wins" rule.
	if(node.value == "-") {
		if(node.operand.value != "-") {
			// We want the "-" operator to be pushed down after any other unary operator.
			// That's because "site: a or -site:b" can't be further optimized, but instead
			// "site:a or site:-b" can be turned into "site:(a or -b)".
			// So we need to swap here...
			return this._promoteUnaryModifierOverUnaryBoolean(node, changed);
		}
		// Both this node and its operand are a "-", they both need to disappear in order to
		// turn this into a no-op. There might be more "-" down the chain, but we only consume
		// two at a time...
		this._setChanged(changed, "eliminated a consecutive pair of '-'");
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
	this._setChanged(changed, "eliminated a '" + node.value + ":', since it was followed by a '" + node.operand.value + ":'");
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
		case Classes.SearchTokenizer.type.TRUTH:
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

		// "value" is "null" for regex that failed to compile
		if(a.value != null && b.value != null) {
			return a.value.localeCompare(b.value);
		}

		// Put all the failed regex at the beginning of all other regex (at this point
		// we're sorting only within the same type (REGEX)
		if(a.value != null) {
			// b.value must be "null"
			return 1;
		}

		if(b.value != null) {
			// a.value must be "null"
			return -1;
		}
		// Both a.value and b.value are null
		return 0;
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
		case Classes.SearchTokenizer.type.TRUTH:
		default:
			break;
	}
},

optimize: function(rootNode) {
	const logHead = "SearchOptimizer::optimize(): ";

	let targetTree = this._parser.cloneTree(rootNode);

	let changed = {
		changed: true,
		what: [],
	};

	this._iterationsCnt = 0;

	// In case the optimizations logic starts to flip-flop between two states,
	// we need to have a maximum number of iterations to monitor that. Let's
	// say we'll stop after 100 iterations, done or not done.
	while(changed.changed && this._iterationsCnt++ < this._maxIterationCnt) {
		changed.changed = false;
		changed.iteration = this._iterationsCnt;
		targetTree = this._mergeBinaryOperators(targetTree, changed);
		targetTree = this._mergeUnaryOperators(targetTree, changed);
		targetTree = this._optimizeInner(targetTree, changed);
	}

	if(this._iterationsCnt >= this._maxIterationCnt) {
		this._err(logHead + "interrupted optimization loop");
		// Adjust back the _interationsCnt
		this._iterationsCnt--;
	}

	this._sortOptimized(targetTree);

	this._changeHistory = changed.what;

	return targetTree;
},

getInfo: function() {
	return {
		iterationsCnt: this._iterationsCnt,
		changeHistory: this._changeHistory,
	}
},

}); // Classes.SearchOptimizer
