# Changelog
The format of this Changelog is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

# [Unreleased]
## Added
- This Changelog file
- Moved release process to [README-DEV.md](https://github.com/marcodb26/TabMania/blob/main/README-DEV.md)

## Changed
- Updated Bootstrap to v.5.0.0-beta2
- Shortcuts try to recycle leftover "new tabs" created in the past and never used
- Shortcuts open new tabs in the "least tabbed window", to keep balancing tabs across
  all your open windows

## Fixed
- Discard settings events if they arrive before the TabsTabViewer chrome query has completed (while
  _normTabs is still uninitialized)
- Shortcut05 (SC5) can't be invoked

# [1.0.0] - 2021-02-20
## Added
- First release