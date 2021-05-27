# This file sets a bunch of variables, and some of them are controlled by "PROD_BUILD"
# being set when this file is sourced

declare -r VERSION="2.0"

# List source files in UNPACKED_POPUP_SOURCES relative to src/popup/ (the same way you want them listed in
# the auto-generated src/popup/popup.html for DEV)
declare -r UNPACKED_POPUP_SOURCES=(						
	"../lib/Base.js" "../lib/TmUtils.js" "../lib/TmConsole.js" "../lib/PersistentDict.js"
	"../lib/utils.js" "../lib/PerfProfiler.js" "../lib/AsyncQueue.js" "../lib/SerialPromises.js"
	"../lib/chromeUtils.js" "../lib/TabNormalizer.js"
	"../lib/TabsStore.js" "../lib/ShortcutsManager.js" "../lib/SettingsStore.js"
	"../lib/ScheduledJob.js" "../lib/PopupDockerBase.js" "../lib/LocalStore.js"
	# Don't include staging/staging.js unless you'r taking screenshots of TabMania for publishing
	#	"../staging/TmStaging.js"																	
	"SearchTokenizer.js" "SearchParser.js" "SearchOptimizer.js" "SearchQuery.js" "BookmarksManager.js"
	"HistoryFinder.js" "PopupDocker.js" "PopupMsgServer.js" "icons.js" "Viewer.js" "BsTabViewer.js"
	"GroupsBuilder.js" "ContainerViewer.js" "SettingsItemViewer.js" "SettingsCustomGroupViewer.js"
	"SettingsBsTabViewer.js" "PopupViewer.js" "TabsTitleMonitor.js" "TilesGroupViewer.js"
	"TabsManager.js" "SearchManager.js" "TabsBsTabViewer.js" "MenuViewer.js"
	"MultiSelectPanelMenuViewer.js" "MultiSelectPanelViewer.js"
	"TabTileViewer.js" "TabTileMenuViewer.js" "PopupMenuViewer.js" "NewTabAction.js" "popup.js"
)

declare -r PACKED_POPUP_SOURCES=(
	"popup.js"
)


declare -r UNPACKED_POPUP_CSS=(
	"popup.css" "tm-accordion.css" "tm-throbber.css"
)

declare -r PACKED_POPUP_CSS=(
	"popup.css"
)


# List source files in DEV_BACKGROUND_SOURCES relative to src/ (the same way you want them listed in
# the auto-generated src/manifest.json)
declare -r UNPACKED_BACKGROUND_SOURCES=(
	"lib/Base.js" "lib/TmUtils.js" "lib/TmConsole.js" "lib/PersistentDict.js" "lib/utils.js" "lib/PerfProfiler.js"
	"lib/AsyncQueue.js"	"lib/SerialPromises.js" "lib/chromeUtils.js" "lib/TabNormalizer.js" "lib/TabsStore.js"
	"lib/ShortcutsManager.js"
	"lib/SettingsStore.js" "lib/LocalStore.js" "lib/ScheduledJob.js" "lib/PopupDockerBase.js"
	"PopupDockerBg.js" "TabsManager.js" "KeyboardShortcuts.js" "ContextMenu.js" "messaging.js"
	"background.js"
)

declare -r PACKED_BACKGROUND_SOURCES=(
	"background.js"
)

# We're checking if the variable PROD_BUILD is set.
# See https://stackoverflow.com/questions/3601515/how-to-check-if-a-variable-is-set-in-bash
if [ -z ${PROD_BUILD+x} ]; then
	# "-n" is a "nameref" variable (an alias to the original variable. We could have just
	# copied the array again instead of trying to be fancy, but since it works...
	# See https://unix.stackexchange.com/questions/390757/referencing-bash-array-variables-from-another-array
	declare -n POPUP_SOURCES=UNPACKED_POPUP_SOURCES
	declare -n POPUP_CSS=UNPACKED_POPUP_CSS
	declare -n BACKGROUND_SOURCES=UNPACKED_BACKGROUND_SOURCES
else
	declare -n POPUP_SOURCES=PACKED_POPUP_SOURCES
	declare -n POPUP_CSS=PACKED_POPUP_CSS
	declare -n BACKGROUND_SOURCES=PACKED_BACKGROUND_SOURCES
fi


# Functions to generate JSON syntax from the source files listed above

# Call createJsonFile() to generate the full JSON body. createOneJsonList() should be
# intended as a "private" function within this file, don't call it in other scripts.
createOneJsonList() {
	declare SOURCES_COPY=("$@")
	# Take the last file out of the list, since the last file can't be followed by ","
	# to be syntactically correct JSON
	declare SOURCES_LASTFILE="${SOURCES_COPY[-1]}"
	unset SOURCES_COPY[-1]

	# If SOURCES_COPY has zero elements, just return SOURCES_LASTFILE
	if [ ${#SOURCES_COPY[@]} -eq 0 ]; then
		echo "\"${SOURCES_LASTFILE}\""
	else
		# Very hard to get quotes to stick around filenames with just "echo" and array prefix/suffix
		# function (like $ARRAY[@]/#/<prefix> or $ARRAY[@]/%/<suffix>). Luckily "printf" works around
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
		echo "$(printf "\"%s\", " "${SOURCES_COPY[@]}")" "\"${SOURCES_LASTFILE}\""
	fi
}

# Call createJsonFile() to generate the full JSON body
createJsonFile() {
	declare VERSION_JSON="\"version\": \"${VERSION}\","
	if [ -z ${PROD_BUILD+x} ]; then
		declare IS_PROD_JSON="\"isProd\": false"
	else
		declare IS_PROD_JSON="\"isProd\": true"
	fi

	echo -e "{\n" \
		"${VERSION_JSON} \n" \
		"\"popupSources\": [ $(createOneJsonList "${POPUP_SOURCES[@]}") ], \n" \
		"\"popupCss\": [ $(createOneJsonList "${POPUP_CSS[@]}") ], \n" \
		"\"bgSources\": [ $(createOneJsonList "${BACKGROUND_SOURCES[@]}") ], \n" \
		"${IS_PROD_JSON} \n" \
	"}"
}
