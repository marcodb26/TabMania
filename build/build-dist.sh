# Remove the comment to debug the script
set -x

# For tools installed locally via NPM, you need to use specify the full path of
# the local version of the tool. We could call "npx [tool]", but calling "npx"
# every time seems to incur a large time penalty. Let's get that penalty only
# once and store the path instead.
declare -r NPMBIN=`npm bin`



# Prepare the dist folder. This includes the follwing steps
# - Copy `/src/manifest.json` to `/dist/manifest.json` (and remove comments)
# - Create prod version of popup.html
# - Pull in the bootstrap files
# - Minify `src/popup/popup.css` to `dist/popup.css`
# - Run uglifyJs to generate `dist/background.js` and `dist/popup.js`


declare -r SRC="src"
declare -r TGT="dist"
declare -r TEMPLATES="${SRC}/templates"

# We need to prepend "lib/prod.js" for both background.js and popup.js to deactivate logs
# and enable the isProd() function (see lib/Base.js) to return "true"
declare COMMON_PROD_SOURCES=("lib/prod.js")


# List source files in BG_SOURCES relative to src/ (the same way they're listed in src/manifest.json)
declare BG_SOURCES=("lib/Base.js" "lib/TmUtils.js" "lib/PersistentDict.js" "lib/utils.js" "lib/PerfProfiler.js"	\
					"lib/AsyncQueue.js" "lib/chromeUtils.js" "lib/NormalizedTabs.js" "lib/ShortcutsManager.js"	\
					"lib/SettingsStore.js" "lib/LocalStore.js" "lib/ScheduledJob.js" "lib/PopupDockerBase.js"	\
					"PopupDockerBg.js" "TabsManager.js" "KeyboardShortcuts.js" "ContextMenu.js" "messaging.js"	\
					"background.js")

# List source files in POPUP_SOURCES relative to src/popup/ (the same way they're listed in
# the auto-generated src/popup/popup.html)
source src/templates/popup-sources-dev.sh
#declare POPUP_SOURCES=("../lib/Base.js" "../lib/TmUtils.js" "../lib/PersistentDict.js" "../lib/utils.js"		\
#					"../lib/PerfProfiler.js" "../lib/AsyncQueue.js" "../lib/chromeUtils.js"						\
#					"../lib/NormalizedTabs.js" "../lib/ShortcutsManager.js" "../lib/SettingsStore.js"			\
#					"../lib/ScheduledJob.js" "../lib/PopupDockerBase.js" "../lib/LocalStore.js"					\
#					"BookmarksFinder.js" "HistoryFinder.js" "PopupDocker.js" "PopupMsgServer.js" "icons.js"		\
#					"Viewer.js" "TabViewer.js" "GroupsBuilder.js" "ContainerViewer.js" "SettingsItemViewer.js"	\
#					"SettingsCustomGroupViewer.js" "SettingsTabViewer.js" "PopupViewer.js" "TabsTabViewer.js"	\
#					"TabTileViewer.js" "TileMenuViewer.js" "PopupMenuViewer.js" "NewTabAction.js" "popup.js")


mkdir -p "${TGT}"
mkdir -p "${TGT}/images"


# Strip comments from manifest.json. Since uglifyJs doesn't support JSON, we need to
# use a different tool for this.
"${NPMBIN}/strip-json-comments" --no-whitespace "${SRC}/manifest.json" > "${TGT}/manifest.json" 

# Create dist/popup.html
declare TMPJSON="${TGT}/popup-sources-prod-nocomments.json"
"${NPMBIN}/strip-json-comments" "${TEMPLATES}/popup-sources-prod.json" > "${TMPJSON}"
"${NPMBIN}/ejs" "${TEMPLATES}/popup.html.ejs" -f "${TMPJSON}" -o "${TGT}/popup.html"
rm "${TMPJSON}"

# Copy only the png files, not any other files that might be in the src/images folder
cp "${SRC}"/images/*.png "${TGT}/images"


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

# cp node_modules/bootstrap/dist/css/bootstrap.min.css dist/
head -n -1 "node_modules/bootstrap/dist/css/bootstrap.min.css" > "${TGT}/bootstrap.min.css"
# cp node_modules/bootstrap/dist/js/bootstrap.bundle.min.js dist/
head -n -1 "node_modules/bootstrap/dist/js/bootstrap.bundle.min.js" > "${TGT}/bootstrap.bundle.min.js"

# Minify CSS
"${NPMBIN}/csso" "${SRC}/popup/popup.css" --output "${TGT}/popup.css"


# uglifyJs business starts here


# Tried "heredoc", but had problems with the resulting variable. UglifyJs responded
# with "not a supported option":
#
# ERROR: `beautify=false,preamble='// AUTO-GENERATED FILE, do not edit, use npm run dist to build
# // Copyright and licensing information at https://github.com/marcodb26/TabMania/blob/main/LICENSE'` is not a supported option
#
# Not sure how to make uglifyJs take that multi-line text with heredoc.
# Noticed that the problem goes away if the first line of the text terminates with
# a "\n\", but the last "\" just merges the two lines onto one, and if that's the
# case I might just as well use "\" to break a regular string assignment...
#
# # "Here document" (heredoc) syntax.
# # The "-" after "<<" (in "<<-") means "ignore leading tabs on each line.
# # See https://stackoverflow.com/a/2500451/10791475
# declare -r PREAMBLE=$(cat <<-EOM
# 	// AUTO-GENERATED FILE, do not edit, use npm run dist to build
# 	// Copyright and licensing information at https://github.com/marcodb26/TabMania/blob/main/LICENSE
# EOM
# )

# Note the "\" at the end of each line to join the lines back
declare -r PREAMBLE="\
// AUTO-GENERATED FILE, do not edit, use \'npm run dist\' to build\n\
// Copyright and licensing information at https://github.com/marcodb26/TabMania/blob/main/LICENSE\n\
"

# $1 is the destination file
# $2 ... $n is the list of source files
runUglifyJs() {
	local outFile=$1

	# Make sure the positional arguments include only source files by shifting
	# out the destination file
	shift

	# uglifyJs here should include the option "--compress", but that option triggers strange
    # warnings (it reshuffles uses of variables and starts finding "Dropping duplicated definition
	# of variable [xyz]"), plus it discards the unused "tmStats()" (which we'd like not to discard)
	#
	# We should regularly try "--compress" anyway to see if uglifyJs comes up with useful warnings.
	#
	# Note that for the v.1.0 of background.js, "--compress" was causing a gain of just 2KB (from 52KB
	# to 50KB, without "--mangle"), not worth it.
	# We also tried "--mangle", without "--compress" it takes the code down from 52KB to 45KB, but
	# again you lose "tmStats()".
	# For the v.1.0 of popup.js, without "--compress" the code amounts to 113KB, with it (but no
	# "--mangle"), it's 109KB. No difference at all...
	# With "--mangle --compress" we're down to 95KB.
	#
	# In v.1.1 background.js is 73KB with "--compress" and 76KB without, while popup.js is
	# 162KB with "--compress" and 169KB without.
	#
	# We'll need to clean this up later and possibly add back "--compress" and "--mangle"
	# We should also add back "--source-map" once we understand if we really need it

	# "$@" means "take all the arguments, and quote them individually as separate strings
	# like "$1" "$2" ... "$n" (unlike "$*" which puts them all in a single string "$1 $2 ... $n")

	"${NPMBIN}/uglifyjs" --warn --toplevel --beautify beautify=false,preamble="'${PREAMBLE}'" \
				--output "${outFile}" -- "$@"
}

# The syntax "<array>[@]/#/<prefix>" prefixes all elements of the array (<array>[@]) with
# the specified prefix (the last "/" below is part of the prefix).
# Similarly, to add a suffix you need to replace "#" with "%".
( runUglifyJs dist/background.js "${COMMON_PROD_SOURCES[@]/#/${SRC}/}" "${BG_SOURCES[@]/#/${SRC}/}" )

# Note that BG_SOURCES and POPUP_SOURCES are relative to two different starting paths,
# while obviously COMMON_PROD_SOURCES is the same for both
( runUglifyJs dist/popup.js "${COMMON_PROD_SOURCES[@]/#/${SRC}/}" "${POPUP_SOURCES[@]/#/${SRC}/popup/}" )


# Pause the terminal before closing
echo "Press RETURN to exit"
read
exit 0