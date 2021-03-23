# Remove the comment to debug the script
set -x

# Setup the dev environment. This includes the follwing steps
# - Pull in the bootstrap files
# - Create the "popup/popup.html" from templates/popup.ejs
# - Package the injection scripts as single files in src/content-gen/

# For tools installed locally via NPM, you need to use specify the full path of
# the local version of the tool. We could call "npx [tool]", but calling "npx"
# every time seems to incur a large time penalty. Let's get that penalty only
# once and store the path instead.
declare -r NPMBIN=`npm bin`


# Bootstrap stuff

# We need to remove the sourcemap at the bottom of the files because we don't care to
# be able to debug the internals of Bootstrap. If we don't remove the last line, the
# browser complains: "DevTools failed to load SourceMap: Could not load content for ..."
# We could have chosen to copy the sourcemaps too instead, but no point in polluting
# the sources (in /dist we don't want to copy sourcemaps because they make the package
# larger).
#
# See https://stackoverflow.com/questions/4881930/remove-the-last-line-from-a-file-in-bash
# for how to edit out the last line of a file in bash. This doesn't seem to be portable,
# but we'll worry about that if someone with a Mac needs this.

# cp node_modules/bootstrap/dist/css/bootstrap.min.css src/popup
head -n -1 node_modules/bootstrap/dist/css/bootstrap.min.css > src/popup/bootstrap.min.css

# cp node_modules/bootstrap/dist/js/bootstrap.bundle.min.js src/popup 
head -n -1 node_modules/bootstrap/dist/js/bootstrap.bundle.min.js > src/popup/bootstrap.bundle.min.js


# Creation of popup/popup.html

# "$1" is the output file where we want JSON to be dumped
createJsonList() {
	source src/templates/popup-sources-dev.sh

	# Take the last file out of the list, since the last file can't be followed by ","
	# to be syntactically correct JSON
	declare LASTFILE="${POPUP_SOURCES[-1]}"
	unset POPUP_SOURCES[-1]

	# Very hard to get quotes to stick around filenames with just "echo" and array prefix/suffix
	# function (like $ARRAY[@]/#/<prefix> or $ARRAY[@]/%/<suffix>). Lucklily "printf" works around
	# all issues and lets you format the output the way you want, including with quotes...
	#
	# The format we need is:
	#
	# {
	#    "sources": [
	#         "file1.js",
	#         "file2.js",
	#         ...
	#         "fileN.js"
	#    ]
	# }

	echo "{ \"sources\": [ " $( printf "\"%s\", " "${POPUP_SOURCES[@]}" ) "\"${LASTFILE}\" ] } " > "$1"
}

declare TMPJSON="src/templates/popup-sources-dev-nocomments.json"
( createJsonList "${TMPJSON}" )
"${NPMBIN}/ejs" src/templates/popup.ejs -f "${TMPJSON}" -o src/popup/popup.html
rm "${TMPJSON}"


# Packaging of injection scripts

declare -r SRC="src/content-src"
declare -r TGT="src/content-gen"

mkdir -p "${TGT}"

declare -r PREAMBLE="// AUTO-GENERATED FILE, do not edit, use \'npm run build-dev\' to build\n"


runUglifyJs() {
# uglifyjs --warn --toplevel --beautify preamble="'${PREAMBLE}'" --source-map --wrap "testName" --output "${TGT}/${FILE}" -- "${SRC}/utilsDev.js" "${SRC}/${FILE}"

# Using "--wrap" to encapsulate everything into a single function
# The ${FILE} must be added last, as it should call "return [value];" to interface
# back with the script injector popup. By default uglifyjs fails if you put a "return"
# statement like that, you need to add "--parse bare_returns" for uglifyjs to let
# this happen. See also: https://github.com/mishoo/UglifyJS/issues/288
"${NPMBIN}/uglifyjs" --warn --toplevel --parse bare_returns --beautify preamble="'${PREAMBLE}'" --source-map --wrap "tmExp" \
			--output "${TGT}/${MAINFILE}" -- "${SRC}/utilsDev.js" "${SRC}/${MAINFILE}"
}

declare MAINFILE="inject-togglePlay.js"
( runUglifyJs )

declare MAINFILE="inject-getMeta.js"
( runUglifyJs )

# Pause the terminal before closing
read
exit 0