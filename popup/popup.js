document.addEventListener("DOMContentLoaded", async () => {
  // --- Theme Management ---
  const themeToggle = document.getElementById('theme-toggle');
  
  // Load saved theme or system preference
  chrome.storage.local.get("theme", (data) => {
    let theme = data.theme;
    if (!theme) {
      theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    document.documentElement.setAttribute('data-theme', theme);
  });

  themeToggle.addEventListener('click', () => {
    let currentTheme = document.documentElement.getAttribute('data-theme');
    let newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    chrome.storage.local.set({ theme: newTheme });
  });

  // --- Core Elements ---
  const tabsList = document.getElementById("tabs-list");
  const tabCount = document.getElementById("tab-count");
  const sessionsList = document.getElementById("sessions-list");
  const searchInput = document.getElementById("search");
  
  let currentTabs = [];

  // --- Initial Load ---
  await refreshTabs();
  await refreshSessions();

  // --- Search functionality ---
  searchInput.addEventListener("input", (e) => {
    const term = e.target.value.toLowerCase();
    renderTabs(currentTabs.filter(tab => 
      (tab.title && tab.title.toLowerCase().includes(term)) || 
      (tab.url && tab.url.toLowerCase().includes(term))
    ));
  });

  // --- Actions ---
  document.getElementById("clean-duplicates").addEventListener("click", () => {
    chrome.runtime.sendMessage({ action: "cleanDuplicates" }, (response) => {
      if(response && response.success) {
        // Small feedback delay then refresh
        setTimeout(() => refreshTabs(), 500);
      }
    });
  });

  document.getElementById("zen-all").addEventListener("click", async () => {
    // A simple trigger to run auto-group on all loose tabs in the window
    for (const tab of currentTabs) {
       if (tab.groupId === chrome.tabGroups.TAB_GROUP_ID_NONE) {
           // We can't directly call background functions easily in MV3 without sending a message
           // or doing it here. Let's do a simple message loop.
           await new Promise(r => setTimeout(r, 50)); // stagger slightly
       }
    }
    // Alternatively just hint the user to right click or use keyboard shortcut
    alert("Zen All coming soon! For now, use Ctrl+Shift+Z on individual tabs.");
  });

  document.getElementById("save-session").addEventListener("click", () => {
    const defaultName = "Session - " + new Date().toLocaleDateString();
    const name = prompt("Name this session:", defaultName);
    if (name) {
      chrome.runtime.sendMessage({ action: "saveSession", name: name }, (response) => {
        if(response && response.success) {
           refreshSessions();
        }
      });
    }
  });


  // --- Helper Functions ---
  
  async function refreshTabs() {
    currentTabs = await chrome.tabs.query({ currentWindow: true });
    tabCount.textContent = currentTabs.length;
    renderTabs(currentTabs);
  }

  function renderTabs(tabsToRender) {
    tabsList.innerHTML = '';
    
    if (tabsToRender.length === 0) {
      tabsList.innerHTML = '<div class="empty-state">No tabs found</div>';
      return;
    }

    tabsToRender.forEach(tab => {
      const div = document.createElement('div');
      div.className = 'list-item';
      
      // Fallback for favicon
      const faviconUrl = tab.favIconUrl || 'chrome://favicon/' + tab.url;
      
      div.innerHTML = `
        <img class="item-favicon" src="${faviconUrl}" onerror="this.src='../icons/icon-16.png'">
        <div class="item-info">
          <span class="item-title">${escapeHTML(tab.title || tab.url)}</span>
          <span class="item-url">${escapeHTML(tab.url)}</span>
        </div>
        <button class="item-action" title="Close Tab">✕</button>
      `;

      // Click to go to tab
      div.querySelector('.item-info').addEventListener('click', () => {
        chrome.tabs.update(tab.id, { active: true });
      });

      // Close tab button
      div.querySelector('.item-action').addEventListener('click', (e) => {
        e.stopPropagation();
        chrome.tabs.remove(tab.id, () => {
            div.remove();
            // Update actual count visually
            const currentCount = parseInt(tabCount.textContent);
            tabCount.textContent = Math.max(0, currentCount - 1);
        });
      });

      tabsList.appendChild(div);
    });
  }

  async function refreshSessions() {
    chrome.runtime.sendMessage({ action: "getSessions" }, (response) => {
      if (response && response.sessions) {
        renderSessions(response.sessions);
      }
    });
  }

  function renderSessions(sessionsObj) {
    sessionsList.innerHTML = '';
    
    const sessionNames = Object.keys(sessionsObj);
    if (sessionNames.length === 0) {
      sessionsList.innerHTML = '<div class="empty-state">No saved sessions</div>';
      return;
    }

    sessionNames.forEach(name => {
      const session = sessionsObj[name];
      const div = document.createElement('div');
      div.className = 'list-item';
      
      div.innerHTML = `
        <div class="item-info">
          <span class="item-title">${escapeHTML(name)}</span>
          <span class="item-url">${session.tabs.length} tabs • Saved ${new Date(session.timestamp).toLocaleDateString()}</span>
        </div>
        <button class="item-action restore" title="Restore Session in New Window">↗</button>
        <button class="item-action delete" title="Delete Session">✕</button>
      `;

      // Restore session
      div.querySelector('.restore').addEventListener('click', (e) => {
        e.stopPropagation();
        chrome.runtime.sendMessage({ action: "restoreSession", name: name });
      });
      
      // Delete session
      div.querySelector('.delete').addEventListener('click', (e) => {
        e.stopPropagation();
        if(confirm(`Delete session "${name}"?`)) {
           chrome.storage.local.get("sessions", (data) => {
              const sessions = data.sessions || {};
              delete sessions[name];
              chrome.storage.local.set({ sessions }, () => {
                 refreshSessions();
              });
           });
        }
      });

      sessionsList.appendChild(div);
    });
  }

  function escapeHTML(str) {
    if(!str) return '';
    return str.replace(/[&<>'"]/g, 
      tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
      }[tag] || tag)
    );
  }
});
