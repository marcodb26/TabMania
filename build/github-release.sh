# Remove the comment to debug the script
#set -x

# For tools installed locally via NPM, you need to use specify the full path of
# the local version of the tool. We could call "npx [tool]", but calling "npx"
# every time seems to incur a large time penalty. Let's get that penalty only
# once and store the path instead.
declare -r NPMBIN=`npm bin`

# Find the absolute path of TabMania/node_modules
declare -r NPMROOT=`npm root`

declare -r SRC="src"
declare -r TEMPLATES="${SRC}/templates"


pressEnter() {
  # Pause the terminal before closing
  echo "Press RETURN to exit"
  read
}


if [ -z ${GITHUB_TOKEN+x} ]; then 
  echo "Environment variable GITHUB_TOKEN (GitHub OAuth access token) not set, add it to the environment to continue"
  ( pressEnter )
  exit 1
fi


# ${TEMPLATES}/sources-env.sh includes the definition of VERSION (among other things).
source "${TEMPLATES}/sources-env.sh"

declare -r PACKTGT="past-releases/v${VERSION}"

# Double check with the user
while true; do
  read -p "Create release v${VERSION} on GitHub? [Y/n] " rsp
  case $rsp in
    [Yy] ) break;; # Continue with the logic below
	"" ) break;; # Continue with the logic below (default case when the user presses just ENTER)
    * ) echo "No action taken"; ( pressEnter ); exit 0;;
  esac
done


# To list all releases:
# "${NPMBIN}/github-release" list --owner marcodb26 --repo TabMania
#
# See https://www.npmjs.com/package/github-release-cli for all the available commands

"${NPMBIN}/github-release" upload --owner marcodb26 --repo TabMania      \
					--tag "v${VERSION}" --release-name "v${VERSION}"     \
					--body "See the [documentation](https://github.com/marcodb26/TabMania/blob/v${VERSION}/README.md) and [changelog](https://github.com/marcodb26/TabMania/blob/v${VERSION}/CHANGELOG.md) for this release"  \
					"${PACKTGT}"/*

( pressEnter )
exit 0
