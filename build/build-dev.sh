# Remove the comment to debug the script
set -x

# Setup the dev environment. This includes the follwing steps
# - Pull in the bootstrap files
# - Package the injection scripts as single files in src/content-gen/

# Bootstrap stuff

cp node_modules/bootstrap/dist/css/bootstrap.min.css src/popup
cp node_modules/bootstrap/dist/js/bootstrap.bundle.min.js src/popup 


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