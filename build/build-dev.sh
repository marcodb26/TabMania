# Remove the comment to debug the script
#set -x

# Setup the dev environment. This includes the follwing steps
# - Pull in the bootstrap files
# - Pull in the day.js files
# - Create the "popup/popup.html" from templates/popup.html.ejs
# - Package the injection scripts as single files in src/content-gen/

# For tools installed locally via NPM, you need to use specify the full path of
# the local version of the tool. We could call "npx [tool]", but calling "npx"
# every time seems to incur a large time penalty. Let's get that penalty only
# once and store the path instead.
declare -r NPMBIN=`npm bin`

# Find the absolute path of TabMania/node_modules
declare -r NPMROOT=`npm root`

declare -r LIB="src/lib/npm"
mkdir -p "${LIB}"

# Bootstrap stuff

echo "Copying Bootstrap files"
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


echo "Copying day.js files"
cp "${NPMROOT}/dayjs/dayjs.min.js" "${LIB}/dayjs.min.js"
cp "${NPMROOT}/dayjs/plugin/relativeTime.js" "${LIB}/relativeTime.js"


# Create the JSON file we'll need to run against our templates to build manifest.json
# and popup.html
source src/templates/sources-env.sh

declare TMPJSON="src/templates/sources-dev.json"
(createJsonFile) > "${TMPJSON}"


# Create manifest.json
echo "Creating manifest.json"
"${NPMBIN}/ejs" src/templates/manifest.json.ejs -f "${TMPJSON}" -o src/manifest.json


# Create of popup/popup.html
echo "Creating popup.html"
"${NPMBIN}/ejs" src/templates/popup.html.ejs -f "${TMPJSON}" -o src/popup/popup.html


# Since we're done with both manifest.json and popup.html, we can now safely delete the JSON
# file we used to create them
rm "${TMPJSON}"


# Package injection scripts
echo "Packaging injection scripts"

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
echo "Press ENTER to close"
read
exit 0