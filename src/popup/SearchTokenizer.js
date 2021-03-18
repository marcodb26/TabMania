// CLASS SearchTokenizer
//
Classes.SearchTokenizer = Classes.Base.subclass({

	// _parserDebug is an alias for _log() to be turned on/off as needed, since
	// debugging messages for the parser can be very verbose
	_parserDebug: null,

	// Don't include "r" here, "r:" is not an operator, it's a tokenization symbol
	// like a quote or a parenthesis
	_validUnaryOpList: [
		"-", // The negation operator
		"site",   // Check only the hostname of the URL
		"intitle",
		"inurl",
		"inbadge",
		"ingroup",
	],

	// List here all the token delimiters that need to be escaped. This list
	// applies only for "standard" tokenization, not for quoted strings or
	// unquoted regex strings tokenization, see _consumeEscapedCharacter().
	// Don't include "\\" in this list, it requires special treatment and it's
	// handled by _consumeEscapedCharacter().
	_escapedCharsList: [ "\"", "\'", ":", " ", "\t", "(", ")" ],

// "value" is optional
_init: function(value) {
	const logHead = "SearchTokenizer::_init(): ";
	// Overriding the parent class' _init(), but calling that original function first
	Classes.Base._init.call(this);
	this.debug();

	// this._parserDebug = this._log;
	this._parserDebug = emptyFn;
},

_nextCharIsEscapable: function(queryString, escapedCharsList) {
	// This function assumes the caller has already checked "queryString.length > 0"

	// Look ahead what follows the escape character that triggered the caller to
	// call this function
	let nextChar = queryString[0];

	if(escapedCharsList.includes(nextChar)) {
		return true;
	}

	if(nextChar == "\\" && queryString.length > 1 && escapedCharsList.includes(queryString[1])) {
		// The escape character "\" is escapable only if it's followed by a delimiter, to
		// allow delimiters to behave as delimiters when a quoted string or an unquoted
		// regex string needs to end with a "\" (e.g. "\\ " or "\\'").
		// This means that if you need to represent a "\" followed by a " ", you can't
		// do it with an unquoted regex string, you must use a quoted string (where the
		// space doesn't behave as delimiter and doesn't require to be escaped), and
		// viceversa you can't represent a "\" followed by a "'" in a quoted string,
		// you must use an alternate quote (you can't use an unquoted string because
		// the quoted character is still a delimited in an unquoted string).
		// If you need to represent both "\" followed by "'" and "\" followed by """
		// you just can't, sorry about that... let's see if this limitation becomes
		// a problem...
		return true;
	}

	return false;
},

// "escapedCharsList" is optional. By default, we escape all the characters that can
// represent token delimiters. Specify a non-default "escapedCharsList" if you need
// to escape a different set of token delimiters (e.g. for quoted strings or unquoted
// regex strings).
_consumeEscapedCharacter: function(queryString, escapedCharsList) {
	escapedCharsList = optionalWithDefault(escapedCharsList, this._escapedCharsList);

	if(queryString.length == 0 || !this._nextCharIsEscapable(queryString, escapedCharsList)) {
		// "\" at the end of the string or not escaping a delimiter, consume as-is
		return [ queryString, "\\" ];
	}

	// Consume the escaped delimiter/escape
	let currChar = queryString[0];
	// Shift one character to the left
	queryString = queryString.substring(1);
	return [ queryString, currChar ];
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
				let escapedCharsList = this.getEscapedCharsList(Classes.SearchTokenizer.type.QUOTEDTEXT, matchingQuoteChar);
				[ queryString, escapedString ] = this._consumeEscapedCharacter(queryString, escapedCharsList);
				token += escapedString;
				break;

			case matchingQuoteChar:
				// End of a quoted string
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

_consumeRegexString: function(queryString) {
	const logHead = "SearchTokenizer::_consumeRegexString(\"" + queryString + "\"): ";

	let token = "";

	while(queryString.length > 0) {
		let currChar = queryString[0];
		// Shift one character to the left
		queryString = queryString.substring(1);

		switch(currChar) {
			case "\\":
				let escapedString = "";
				let escapedCharsList = this.getEscapedCharsList(Classes.SearchTokenizer.type.REGEX);
				[ queryString, escapedString ] = this._consumeEscapedCharacter(queryString, escapedCharsList);
				token += escapedString;
				break;

			case " ":
			case "\t":
				// Whitespaces mark the end of an unquoted regex string
				return [ queryString, token ];

			case "\"":
			case "\'":
				if(token.length > 0) {
					// A quote in the middle of a regex is just part of that regex
					token += currChar;
				} else {
					// Consume a quoted regex string
					return this._consumeQuotedString(queryString, currChar);
				}
				break;

			default:
				token += currChar;
				break;
		}
	}

	// We get here if the regex consume the entire queryString, which is fine
	return [ queryString, token ];
},

_setRegexToken: function(token) {
	if(token.length == 0) {
		// If the token is "", the consumed queryString likely was r:"", so we need to drop/ignore.
		return null;
	}

	let regex = null;
	let regexErr = null;

	let retVal = {
		type: Classes.SearchTokenizer.type.REGEX,
		sources: [ tmUtils.freeze({ type: Classes.SearchTokenizer.type.REGEX, value: token }) ],
	};

	try {
		// The flag "i" means "ignoreCase"
		retVal.value = new RegExp(token, "i");
	} catch(e) {
		const logHead = "SearchTokenizer::_setRegexToken(): ";
		this._log(logHead + "unable to parse regex for token /" + token + "/: ", e);
		// In production, RegExp syntax errors will be very hard to catch, best to at least
		// show the raw parse error message on the console.
		// We choose to avoid dumping the entire stack with "this._err(e)", and instead
		// selectively report only the error message (though the stack can still be seen
		// by expandind the error message on the console, at least it won't be vomited
		// right on the console).
		console.error("RegExp parser: " + e.name + ": " + e.message);
		retVal.error = e;
	}
	return retVal;
},

_setTextOrBinaryOpToken: function(token) {
	switch(token) {
		case "and":
		case "or":
			return { type: Classes.SearchTokenizer.type.BINARYOP, value: token };
	}
	return { type: Classes.SearchTokenizer.type.TEXT, value: token };
},

_setUnaryOpToken: function(token) {
	if(this._validUnaryOpList.includes(token)) {
		return { type: Classes.SearchTokenizer.type.UNARYOP, value: token };
	} else {
		const logHead = "SearchTokenizer::_setUnaryOpToken(): ";
		this._log(logHead + "discarding unknown unary operator \"" + token + "\"");
		return null;
	}
},

// Returns a token object, or "null" if the token should be discarded
_genTokenByType: function(token, tokenType) {
	// Note that we can't always "token.toLowerCase()", because the REGEX type must
	// preserve the case of the token text
	switch(tokenType) {
		case Classes.SearchTokenizer.type.TEXT:
			return this._setTextOrBinaryOpToken(token.toLowerCase());

		case Classes.SearchTokenizer.type.REGEX:
			// Don't toLowerCase() the token for regex, since things like "\w" and "\W"
			// mean two different things. We'll need to make the regex case insensitive
			// in other ways (see _setRegexToken()).
			return this._setRegexToken(token);

		case Classes.SearchTokenizer.type.UNARYOP:
			return this._setUnaryOpToken(token.toLowerCase());

		case Classes.SearchTokenizer.type.QUOTEDTEXT:
			// No need to call _setTextOrBinaryOp(), a quoted "and" or "or" is just text
			return { type: Classes.SearchTokenizer.type.TEXT, value: token.toLowerCase() };

		case Classes.SearchTokenizer.type.SUBTREE:
		case Classes.SearchTokenizer.type.BINARYOP:
		default:
			// Note that _genTokenByType() should not be called for tokenType
			// Classes.SearchTokenizer.type.SUBTREE and Classes.SearchTokenizer.type.BINARYOP.
			// Classes.SearchTokenizer.type.BINARYOP is determined under Classes.SearchTokenizer.type.TEXT,
			// while Classes.SearchTokenizer.type.SUBTREE is a special case handled in tokenize().
			const logHead = "SearchTokenizer::_genTokenByType(): ";
			this._err(logHead + "invalid or unknown tokenType \"" + tokenType + "\"");
	}

	// Discard unknown tokenType
	return null;
},

tokenize: function(queryString, tokenList, topLevel) {
	topLevel = optionalWithDefault(topLevel, true);
	const logHead = "SearchTokenizer::tokenize(\"" + queryString + "\", topLevel: " + topLevel + "): ";

	let token = "";
	
	let generateToken = function(tokenType) {
		if(token.length > 0) {
			let tokenObj = this._genTokenByType(token, tokenType);
			if(tokenObj != null) {
				tokenList.push(tokenObj);
			}
			token = "";
		}
		// We just drop empty tokens, nothing to do
	}.bind(this);

	while(queryString.length > 0) {
		let currChar = queryString[0];
		// Shift one character to the left
		queryString = queryString.substring(1);

		this._parserDebug(logHead + "processing: \"" + currChar + "\"");

		switch(currChar) {
			case " ":
			case "\t":
				generateToken(Classes.SearchTokenizer.type.TEXT);
				break;

			case "\"":
			case "\'":
				generateToken(Classes.SearchTokenizer.type.TEXT);
				[ queryString, token ] = this._consumeQuotedString(queryString, currChar);
				generateToken(Classes.SearchTokenizer.type.QUOTEDTEXT);
				break;

			case "\\":
				let escapedString = "";
				[ queryString, escapedString ] = this._consumeEscapedCharacter(queryString);
				token += escapedString;
				break;

			case "-":
				token += "-";
				// No break here, we just needed to normalize the "-" operator with the "<token>:"
				// operator: in the latter case <token> is already in "token" (since we're now
				// processing ":", while in case of "-" we need to add "-" to "token" here
			case ":":
				// First line of the "if" block:
				// - Look ahead to see if this candidate operator is followed by a space (or
				//   it's at the end of the queryString), in which case we'll treat this as
				//   regular text, not as an operator.
				//   "r:" is not an operator, but for tokenization purposes here it behaves
				//   like one: if "r:" is at the end of the queryString, or it's followed by a
				//   whitespaces (which is the delimiter of a non-quoted regex), then we treat
				//   "r:" as regular text.
				// Second line of the "if" block:
				// - As an extra condition, if the candidate operator is not a known unary
				//   operator or "r:", then again treat it as regular text
				//   * Note also that if the candidate operator is "-", it's a valid operator
				//     only if no token has been accumulated before "-", otherwise we should
				//     treat it as regular text: that is, in "a -b" the "-" is an operator, while
				//     in "a-b" we have a single token "a-b" and no operator. This is covered
				//     within the second line check, because if we have "a-b", then "token"
				//     right now contains "a-", which is not a valid unary operator.
				if(queryString.length == 0 || [ " ", "\t" ].includes(queryString[0]) ||
					!(this._validUnaryOpList.includes(token) || token == "r" )) {
					// The processing of the next character (or of the end of the string) will
					// deal with it, so nothing to do in this block, except accumulating in the
					// case of ":" ("-" has already been added to "token").
					if(currChar == ":") {
						token += currChar;
					}
					break;
				}
				if(token == "r") {
					// Regex case, not a unary operator
					[ queryString, token ] = this._consumeRegexString(queryString);
					generateToken(Classes.SearchTokenizer.type.REGEX);
					break;
				}
				// This is a real operator
				generateToken(Classes.SearchTokenizer.type.UNARYOP);
				break;

			case "(":
				// "(", """ and "'" are all token delimiters, any token text accumulated so far
				// must be considered a full token.
				generateToken(Classes.SearchTokenizer.type.TEXT);
				let subTokenList = [];
				queryString = this.tokenize(queryString, subTokenList, false);
				// Can't call generateToken() for subtrees, as generateToken() assumes it needs
				// to use "token", while here we need to use "subTokenList", not "token"
				if(subTokenList.length != 0) {
					tokenList.push({ type: Classes.SearchTokenizer.type.SUBTREE, value: subTokenList });
				}
				break;

			case ")":
				if(!topLevel) {
					generateToken(Classes.SearchTokenizer.type.TEXT);
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
	generateToken(Classes.SearchTokenizer.type.TEXT);

	if(!topLevel) {
		// We get here if there's no closing parenthesis
		this._log(logHead + "no matching closing \")\"");
		return "";
	}
},

// "quoteChar" is optional, and only used when tokenType = Classes.SearchTokenizer.type.QUOTEDTEXT
getEscapedCharsList: function(tokenType, quoteChar) {
	switch(tokenType) {
		case Classes.SearchTokenizer.type.TEXT:
			return this._escapedCharsList;

		case Classes.SearchTokenizer.type.REGEX:
			return [ " " ];

		case Classes.SearchTokenizer.type.QUOTEDTEXT:
			return [ optionalWithDefault(quoteChar, "\"") ];

		case Classes.SearchTokenizer.type.SUBTREE:
		case Classes.SearchTokenizer.type.BINARYOP:
		case Classes.SearchTokenizer.type.UNARYOP:
		default:
			// Note that getEscapedCharsList() should not be called for tokenType
			// Classes.SearchTokenizer.type.SUBTREE/BINARYOP/UNARYOP
			const logHead = "SearchTokenizer::getEscapedCharsList(): ";
			this._err(logHead + "invalid or unknown tokenType \"" + tokenType + "\"");
	}
},

}); // Classes.SearchTokenizer

Classes.Base.roDef(Classes.SearchTokenizer, "type", {} );
Classes.Base.roDef(Classes.SearchTokenizer.type, "BINARYOP", "binaryOp" );
Classes.Base.roDef(Classes.SearchTokenizer.type, "UNARYOP", "unaryOp" );
Classes.Base.roDef(Classes.SearchTokenizer.type, "SUBTREE", "subtree" );
Classes.Base.roDef(Classes.SearchTokenizer.type, "TEXT", "text" );
Classes.Base.roDef(Classes.SearchTokenizer.type, "QUOTEDTEXT", "quotedText" );
Classes.Base.roDef(Classes.SearchTokenizer.type, "REGEX", "regex" );
// "TRUTH" is not used by SearchTokenizer, but it's needed by SearchOptimizer
Classes.Base.roDef(Classes.SearchTokenizer.type, "TRUTH", "truth" );
