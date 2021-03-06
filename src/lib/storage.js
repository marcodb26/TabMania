// Properties stored in chrome.storage.local by this extension:
//
// - See lib/LocalStore.js
//
// Properties stored in chrome.storage.sync by this extension:
//
// pinnedGroups: the set of pinned groups
// pinnedBookmarks: the set of pinned bookmarks
// options: a dictionary of options
// customGroups: the definition of the custom groups
// shortcut0[1-5]: the definition of the behavior for the 5 custom
//    keyboard shortcuts



// Note that debugging chrome.storage usage is a pain, because the storage doesn't
// show up in dev tools. The easiest way to look at the contents of the storage is
// to go to the background page console and type:
//
//    chrome.storage.local.get(function(result){console.log(result)})
//
//	  chrome.storage.sync.get(function(result){console.log(result)})
//
// From https://stackoverflow.com/questions/11922964/how-do-i-view-the-storage-of-a-chrome-extension-ive-installed/27434046#:~:text=16-,Open%20the%20Chrome%20Devtool%20by%20clicking%20on%20the%20background%20page,local%20storage%20on%20the%20left.
//
// If you need to clear the storage, on the console run:
//
//    chrome.storage.local.clear()
//
// To manually add a pinned group called "Work"
//
//    chrome.storage.sync.set({ pinnedGroups: { Work: null }} )