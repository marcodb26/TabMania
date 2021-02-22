# Remove the comment to debug the script
set -x

# Setup the dev environment. This includes the follwing steps
# - Pull in the bootstrap files
# - Package the injection scripts as single files in src/content-gen/

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

# Packaging of injection scripts

declare -r SRC="src/content-src"
declare -r TGT="src/content-gen"

mkdir -p ${TGT}

declare -r PREAMBLE="// AUTO-GENERATED FILE, do not edit, use \'npm run buildinject\' to build\n"

declare FILE="inject-youtubePlay.js"

runUglifyJs() {
# uglifyjs --warn --toplevel --beautify preamble="'${PREAMBLE}'" --source-map --wrap "testName" --output "${TGT}/${FILE}" -- "${SRC}/utilsDev.js" "${SRC}/${FILE}"

# Using "--wrap" to encapsulate everything into a single function
# The ${FILE} must be added last, as it should call "return [value];" to interface
# back with the script injector popup. By default uglifyjs fails if you put a "return"
# statement like that, you need to add "--parse bare_returns" for uglifyjs to let
# this happen. See also: https://github.com/mishoo/UglifyJS/issues/288
uglifyjs --warn --toplevel --parse bare_returns --beautify preamble="'${PREAMBLE}'" --source-map --wrap "base" \
			--output "${TGT}/${MAINFILE}" -- "${SRC}/utilsDev.js" "${SRC}/${MAINFILE}"
}

declare MAINFILE="inject-youtubePlay.js"
( runUglifyJs )

declare MAINFILE="inject-getMeta.js"
( runUglifyJs )

# Pause the terminal before closing
read
exit 0