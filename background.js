// background.js
let sessions = {};

chrome.runtime.onInstalled.addListener(() => {
  console.log("TabZen installed! 🧘‍♂️");
  chrome.storage.local.get("sessions", (data) => {
    sessions = data.sessions || {};
  });
});

// Update sessions cache when storage changes
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === "local" && changes.sessions) {
    sessions = changes.sessions.newValue;
  }
});

// Keyboard Commands Listening
chrome.commands.onCommand.addListener((command) => {
  if (command === "zen-this-tab") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length > 0) zenThisTab(tabs[0]);
    });
  } else if (command === "save-session") {
    saveCurrentSession("Auto-saved Session - " + new Date().toLocaleTimeString());
  }
});

// Auto-grouping logic
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // Only auto-group when the page is fully loaded and has a URL
  if (changeInfo.status === "complete" && tab.url && !tab.url.startsWith("chrome://")) {
    autoGroupTab(tab);
  }
});

async function autoGroupTab(tab) {
  const url = tab.url.toLowerCase();
  const title = (tab.title || "").toLowerCase();
  let groupName = null;
  let groupColor = "grey";

  if (url.includes("github.com") || url.includes("stackoverflow.com") || title.includes("docs") || url.includes("developer")) {
    groupName = "Dev Work";
    groupColor = "blue";
  } else if (url.includes("amazon.") || url.includes("daraz.") || url.includes("ebay.") || title.includes("shopping") || title.includes("buy")) {
    groupName = "Shopping";
    groupColor = "yellow";
  } else if (title.includes("research") || url.includes(".pdf") || url.includes("wikipedia.org")) {
    groupName = "Research";
    groupColor = "purple";
  } else if (url.includes("youtube.com") || url.includes("netflix.com") || url.includes("twitch.tv") || url.includes("spotify.com")) {
    groupName = "Entertainment";
    groupColor = "red";
  } else if (url.includes("gmail.com") || url.includes("outlook.live.com") || url.includes("slack.com") || url.includes("discord.com")) {
    groupName = "Comms";
    groupColor = "green";
  }

  if (groupName) {
    try {
      // Find if this group already exists in the current window
      const groups = await chrome.tabGroups.query({ windowId: tab.windowId, title: groupName });
      
      let groupId;
      if (groups.length > 0) {
        groupId = groups[0].id;
      } else {
        // We'll let chrome.tabs.group create a new group if we don't pass an existing groupId
      }

      const groupedId = await chrome.tabs.group({
        tabIds: tab.id,
        groupId: groupId,
      });

      // Update the group's title and color
      await chrome.tabGroups.update(groupedId, {
        title: groupName,
        color: groupColor
      });
      console.log(`Auto-grouped tab "${tab.title}" into ${groupName}`);
    } catch (error) {
      console.error("Error auto-grouping tab:", error);
    }
  }
}

async function zenThisTab(tab) {
  console.log("Zen this tab manually:", tab.id);
  // Re-run the auto-group logic even if we normally wouldn't (e.g. if we add custom rules later)
  await autoGroupTab(tab);
}

// Session Management
async function saveCurrentSession(name) {
  const tabs = await chrome.tabs.query({ currentWindow: true });
  const sessionTabs = tabs.map(t => ({ url: t.url, title: t.title }));
  
  sessions[name] = {
    tabs: sessionTabs,
    timestamp: Date.now()
  };
  
  await chrome.storage.local.set({ sessions });
  console.log(`Session "${name}" saved!`);
}

// Messaging from Popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "saveSession") {
    saveCurrentSession(request.name).then(() => {
      sendResponse({ success: true });
    }).catch(err => {
      sendResponse({ success: false, error: err.message });
    });
    return true; // Indicates async response
  } else if (request.action === "getSessions") {
    sendResponse({ sessions });
  } else if (request.action === "restoreSession") {
    const sessionToRestore = sessions[request.name];
    if (sessionToRestore) {
      chrome.windows.create({}, (newWindow) => {
        sessionToRestore.tabs.forEach(tabData => {
          chrome.tabs.create({ windowId: newWindow.id, url: tabData.url });
        });
      });
      sendResponse({ success: true });
    } else {
      sendResponse({ success: false, error: "Session not found" });
    }
  } else if (request.action === "cleanDuplicates") {
    cleanDuplicateTabs().then(cleanedCount => {
        sendResponse({ success: true, count: cleanedCount });
    });
    return true;
  }
});


async function cleanDuplicateTabs() {
    const tabs = await chrome.tabs.query({currentWindow: true});
    const seenUrls = new Set();
    const duplicateTabIds = [];

    for (const tab of tabs) {
        if (seenUrls.has(tab.url)) {
            duplicateTabIds.push(tab.id);
        } else {
            seenUrls.add(tab.url);
        }
    }

    if (duplicateTabIds.length > 0) {
        await chrome.tabs.remove(duplicateTabIds);
    }
    return duplicateTabIds.length;
}
