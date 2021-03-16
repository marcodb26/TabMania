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

	_escapedCharsList: [ "\"", "\'", "\\", ":", "-", " ", "(", ")" ],

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

_consumeRegex: function(queryString) {
	const logHead = "SearchTokenizer::_consumeRegex(\"" + queryString + "\"): ";

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

			case " ":
			case "\t":
				// Whitespaces mark the end of a regex
				return [ queryString, token ];

			case "\"":
			case "\'":
				if(token.length > 0) {
					// A quote in the middle of a regex is just part of that regex
					token += currChar;
				} else {
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
	let regex = null;
	let regexErr = null;

	let retVal = {
		type: Classes.SearchTokenizer.type.REGEX,
	};

	try {
		// The flag "i" means "ignoreCase"
		retVal.value = new RegExp(token, "i");
		retVal.textValue = token;
	} catch(e) {
		this._log(logHead + "unable to parse regex", e);
		retVal.error = e;
	}
	return retVal;
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
				if(token.length > 0) {
					tokenList.push(this._setTextOrBinaryOp(token.toLowerCase()));
					token = "";
				}
				break;

			case "\"":
			case "\'":
				if(token.length > 0) {
					// A quote in the middle of a token is just part of that token, we recognize
					// a quoted string only if the leading quote is preceded by any token
					// delimiter (space, ":", "-"), which consumes the previous token and
					// resets token to "".
					// Note that we play by different rules for the closing quote, so while
					// a"bc is a single token, "ab"c will be two tokens ab and c
					token += currChar;
				} else {
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
				if(token == "r") {
					// Regex case
					if(queryString.length == 0 || [ " ", "\t" ].includes(queryString[0])) {
						// "r:" is at the end of the queryString, or it's followed by a whitespaces
						// (which is the delimiter of a non-quoted regex): in this case, we treat
						// "r: as regular text.
						// The processing of the next character (or of the end of the string) will
						// deal with it, so nothing to do in this block, except accumulating.
						token += currChar;
						break;
					}
					[ queryString, token ] = this._consumeRegex(queryString);
					if(token.length != 0) {
						// Don't toLowerCase() the token for regex, since things like "\w" and "\W"
						// mean two different things. We'll need to make the regex case insensitive
						// in other ways (see _setRegexToken()).
						tokenList.push(this._setRegexToken(token));
					} else {
						// This is different from the first if() above. If the token is "",
						// the consumed queryString likely was r:"", so we need to drop/ignore.
					}
					token = "";
					break;
				}
				// Don't use "break;" here, if "token" was not "r", then ":" is the unary operator and
				// behaves like "-" below
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
		// We get here if there's no closing parenthesis
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
Classes.Base.roDef(Classes.SearchTokenizer.type, "REGEX", "regex" );
