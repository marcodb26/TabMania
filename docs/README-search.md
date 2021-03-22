# Advanced topics: search

Search in TabMania filters tabs, recently closed items, bookmarks and history items based on keywords
you specify in the search box on the TabMania popup's _Home_ tab. The keywords are matched against
a site's title, URL and badges.

Search in TabMania uses a syntax similar to the syntax of Google search. Individual keywords can be
combined with `AND` and `OR` operators to indicate whether all keywords must match (`AND` semantics)
or at least one keyword must match (`OR` semantics). If neither `AND` nor `OR` are specified, an
implicit `AND` among all keywords is assumed.
Using `AND` doesn't have any implication of the order in which words appear, so `a AND b` will match both
strings `a b` and `b a`. If you need a more exact match, surround your keywords in quotes, as in `"a b"`,
which will only match the string `a b` of the previous example.

## Regular expression matching
Keywords are searched as-is, but if you need more control over search results, you can specify each
keyword as a regular expression by prefixing the keyword with `r:`. This means that `a.b` represents
a keyword composed of the sequence of 3 characters `a`, `.`, and `b`, while `r:a.b` represents a
regular expression describing `a`, followed by a single occurrence of any character, followed by `b`.
The prefix `r:` captures any character until the first whitespace. Alternatively, if the first character
after `r:` is a single or double quote, the regular expression can be delimited as a quoted string
(in which case whitespaces can be made part of the regular expression as well). As an example, `r:a.b c`
describes two keywords, a first regular expression keyword `a.b`, and a second standard keyword `c`,
while `r:"a.b c"` describes a single regular expression keyword `a.b c`.

## Unary operators
TabMania search offers the exclusion operator `-` and a number of unary modifiers to focus the target
of your keywords. The exclusion operator `-` simply allows you to exclude search results based on specific
keywords. If you search for `a AND -b`, you're looking for all tabs that have `a` and don't have `b`.

Unary modifiers, on the other hand, specify more selective targets for the evaluation of search keywords.
For example, `site:google.com` limits the search to tabs that include `google.com` in the hostname, and
ignores tabs that might have `google.com` in the title or the rest of the URL. A unary modifier must be
prefixed to the keyword(s) you want it to focus on, with no whitespaces in between. If your search includes
a sequence of multiple unary modifiers applied to the same keyword(s), only the innermost unary modifier
will be applied. For example, `site:inurl:google.com` is equivalent to `inurl:google.com` and the `site:`
unary modifier is ignored. On the other hand, the exclusion operator `-` can be applied anywhere (before,
after, in between) unary modifiers, and its semantics remain the same, so `-site:-inurl:-google.com`
is equivalent to `-inurl:google.com` (as standard double exclusion rules apply, and three exclusions are
equivalent to one exclusion).
Note that `r:` is a regular expression marker, not a unary modifier, so unary modifier rules don't apply
to it. In a search expression like `site:r:goo.*\.com`, `site:` is the only unary modifier, and it's applied
to a regular expression `goo.*\.com`.

The full set of unary modifier is described next.

### `site:`
As already mentioned, prefixing a search with `site:` restricts the search to the hostname in the URL of
the site tracked by the tab, bookmark or history item.

### `intitle:` and `inurl:`
Prefixing a search with `intitle:` restricts the search to the title of the site tracked by a tab, bookmark
or history item, while prefixing a search with `inurl:` restricts it to the URL of the site. Why the
unfortunate `in` at the beginning of the unary modifiers `intitle:` and `inurl:`, instead of just `url:`
and `title:`, I don't know. `site:`, `intitle:` and `inurl:` match verbatim the equivalent modifiers of
Google search, so if you limit your searches to these three unary modifiers, `AND`, `OR`, `-` and quoted
text, the search is likely fully portable to a Google search. That is interesting because you can turn your
tabs search into a Google search immediately by pressing the `+` button at the top right of the TabMania popup.
Note that search in TabMania doesn't offer the `allintitle:` and `allinurl:` unary modifiers, because those
semantics can be obtained by placing multiple keywords in parentheses (see below __Operators precedence and
parentheses__). For example, `intitle:(a b)` means "search for tabs that have both `a` and `b` in the title".

### `badge:`
Prefixing a search with `badge:` restricts the search to all badges of a tab or bookmark (history items
can't be searched by badges as of TabMania v1.2). Badges can be visible (e.g. custom group names, shortcut
mnemonics or the `loading` tab status) or hidden. The hidden badges include `audible`, `muted`, `highlighted`,
`incognito`, `pinned`, `suspended`, `unloaded` and `loaded`. Only custom group names and the `pinned` hidden
badge are applicable to bookmarks, plus the extra `bookmark` hidden badge. For recently closed tabs the extra
search badge `closed` is also available.

### group:
`group:` is similar to `badge:`, except that it restricts the search to only custom group names.

### folder:
`folder:` is a special unary modifier that's only applicable to bookmarks, and allows search keywords to be
applied to bookmarks folders.

## Operators precedence and parentheses
Unary operators have precedence over `AND` and `OR`, and `AND` has precedence over `OR`. You can use
parentheses (`(` and `)`) to influence the operator precedence. So in `a AND b OR c` the `a AND b` is
evaluated first, then its boolean value is evaluated with `... OR c`, while in `a AND (b OR c)` the
`b OR c` is evaluated first, then its boolean value is evaluated with `a AND ...`.

Parentheses can also be used to group together keywords that need to be restricted by unary modifiers, like
in `site:(google.com OR wikipedia.org)`.

## Escaping
Search in TabMania uses a minimalist approach to escaping, and allows you to escape only keyword delimiters
for the context of your keyword. The escape character is backslash (`\`), and if you want to use a backslash
as part of your keyword, you need to escape it only if it's next to such delimiters. So if you are typing
some quoted text, you'll only need escaping for the type of quote you used to start the keyword (single or
double quote), and nothing else. For example, `"\"abc\""` generates the keyword `"abc"` (the double quotes
are part of the keyword), but `'\"abc\"'` generates the keyword `\"abc\"` because the quoted text is quoted
by single quotes, so the double quotes don't need escaping, and therefore neither does the backslash.
Similarly for regular expressions without quotes, since the delimiter is a whitespace, only whitespaces
within the regular expression must be escaped, so `r:a\ b\ c` is the regular expression `a b c`, which you
could alternatively write as `r:"a b c"`. In this way the only case you need to escape the escape character
is if the escape character is at the end of an unquoted regular expression, as in `r:ab\\` to describe
the (illegal) regular expression `ab\` (single slash at the end of the regular expression). The corresponding
(legal) regular expression `ab\\` (an `a` followed by a `b` followed by a (regular expression-escaped) `\`)
is typed as `r:ab\\\` (the first backslash doesn't require escaping in TabMania).

## Syntactic guesses
TabMania tries to avoid being picky about what you type, and will make simple guesses when the search string
is not completely syntactically perfect. So for example if your search is `"abc`, TabMania will add a closing
quote for you and not make a fuss. This can lead to unexpected results, since `"abc def` will be treated as
a single keyword `"abc def"`, but maybe you intended `"abc" def`.

## Examples
Putting all of this together, here are a few examples of interesting queries.

- `abc badge:bookmark`: search for `abc`, but restrict the search to only bookmarks.

- `abc site:(google.com -mail.google.com)`: search for `abc` on all tabs and bookmarks with hostname including
`google.com` but excluding `mail.google.com`.

- `abc "and"`: search for the keywords `abc` and `and` (`and` is an operator, so you need to quote it to
  treat it as a keyword).

- `badge:(audible -muted)`: search for all tabs that are currently emitting sounds.