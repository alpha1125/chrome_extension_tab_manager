/**
 * Merges all windows into the first window. The first window is the window that was created first.
 *
 * @returns {Promise<unknown>}
 */
function mergeAllWindows() {
    return new Promise((resolve, reject) => {
        chrome.windows.getCurrent({populate: true}, function (currentWindow) {
            if (chrome.runtime.lastError) {
                return reject(chrome.runtime.lastError);
            }
            chrome.windows.getAll({populate: true}, async function (windows) {
                if (chrome.runtime.lastError) {
                    return reject(chrome.runtime.lastError);
                }
                for (let window of windows) {
                    if (window.id !== currentWindow.id) {
                        for (let tab of window.tabs) {
                            await new Promise((resolve, reject) => {
                                chrome.tabs.move(tab.id, {windowId: currentWindow.id, index: -1}, function (result) {
                                    if (chrome.runtime.lastError) {
                                        return reject(chrome.runtime.lastError);
                                    }
                                    resolve(result);
                                });
                            });
                        }
                    }
                }
                resolve();
            });
        });
    });
}

/**
 * removes all duplicate tabs from the current window. A duplicate tab is a tab with the same URL as another tab in the window.
 * If there is more than one new tab in the window, all new tabs are considered duplicates and will be removed.
 * If there are multiple tabs with the same URL, only the first one will be kept.
 *
 * @returns {Promise<unknown>}
 */
function removeDuplicateTabs() {
    return new Promise((resolve, reject) => {
        chrome.windows.getAll({populate: true}, function (windows) {
            if (chrome.runtime.lastError) {
                return reject(chrome.runtime.lastError);
            }
            // Count total tabs and new tabs
            let allTabs = [];
            let newTabTabs = [];
            windows.forEach(window => {
                window.tabs.forEach(tab => {
                    allTabs.push(tab);
                    if (tab.url === 'chrome://newtab/') {
                        newTabTabs.push(tab);
                    }
                });
            });
            // If all tabs are new tabs and only one window, keep one tab open
            if (allTabs.length === newTabTabs.length && windows.length === 1) {
                // Remove all but one new tab
                let tabsToRemove = newTabTabs.slice(1).map(tab => tab.id);
                if (tabsToRemove.length > 0) {
                    chrome.tabs.remove(tabsToRemove);
                }
                return resolve();
            }
            // Otherwise, remove duplicate tabs in the current window as before
            chrome.windows.getCurrent({populate: true}, function (window) {
                if (chrome.runtime.lastError) {
                    return reject(chrome.runtime.lastError);
                }
                let uniqueUrls = new Set();
                let duplicateTabs = [];
                window.tabs.forEach(tab => {
                    if (uniqueUrls.has(tab.url) || (tab.url === 'chrome://newtab/' && window.tabs.length > 1)) {
                        duplicateTabs.push(tab.id);
                    } else {
                        uniqueUrls.add(tab.url);
                    }
                });
                if (duplicateTabs.length > 0) {
                    chrome.tabs.remove(duplicateTabs);
                }
                resolve();
            });
        });
    });
}

/**
 * Capitalizes the first letter of a string.
 * @param string
 * @returns {string}
 */
function capitalizeFirstLetter(string) {
    try {
        return string.charAt(0).toUpperCase() + string.slice(1);
    } catch {
        return string;
    }
}

/**
 * Returns the domain name of a URL.
 *
 * @param url
 * @returns {string}
 */
function getDomainName(url) {
    if (typeof url !== 'string') {
        throw new Error('Invalid URL');
    }
    if (url.startsWith('chrome://')) {
        return 'Chrome';
    }
    let hostname = new URL(url).hostname;
    // Check if hostname is an IP address
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) {
        return hostname; // or return 'IP Address'
    }
    const secondLevelDomains = ['co', 'com', 'gov', 'net', 'edu', 'org'];
    let parts = hostname.split('.');
    return capitalizeFirstLetter(
        secondLevelDomains.includes(parts[parts.length - 2]) ? parts[parts.length - 3] : parts[parts.length - 2]
    );
}

/**
 * Groups tabs by domain. Each tab is grouped with other tabs that share the same domain.
 * If there is only one tab for a domain, it is ungrouped.
 *
 * @returns {Promise<void>}
 */
async function groupTabsByDomain() {
    try {
        let windows = await new Promise((resolve, reject) => {
            chrome.windows.getCurrent({populate: true}, function (window) {
                if (chrome.runtime.lastError) {
                    return reject(chrome.runtime.lastError);
                }
                resolve(window);
            });
        });
        let tabsByDomain = {};
        windows.tabs.forEach(tab => {
            let domain = getDomainName(tab.url);
            if (!tabsByDomain[domain]) {
                tabsByDomain[domain] = [];
            }
            tabsByDomain[domain].push(tab.id);
        });
        for (let domain in tabsByDomain) {
            if (tabsByDomain[domain].length > 1) {
                // Create a new group for this domain and move the tabs to this group
                let groupId = await new Promise((resolve, reject) => {
                    chrome.tabs.group({
                        tabIds: tabsByDomain[domain],
                        createProperties: {windowId: windows.id}
                    }, function (groupId) {
                        if (chrome.runtime.lastError) {
                            return reject(chrome.runtime.lastError);
                        }
                        resolve(groupId);
                    });
                });
                await new Promise((resolve, reject) => {
                    chrome.tabGroups.update(groupId, {title: domain}, function () {
                        if (chrome.runtime.lastError) {
                            return reject(chrome.runtime.lastError);
                        }
                        resolve();
                    });
                });
            } else {
                // If it's a single tab for this domain, ungroup it
                await new Promise((resolve, reject) => {
                    chrome.tabs.ungroup(tabsByDomain[domain], function () {
                        if (chrome.runtime.lastError) {
                            return reject(chrome.runtime.lastError);
                        }
                        resolve();
                    });
                });
            }
        }
    } catch (error) {
        console.error('An error occurred in groupTabsByDomain:', error);
    }
}

/**
 * This following line  is called when the extension icon is clicked.
 */
chrome.action.onClicked.addListener(async function () {
    try {
        await mergeAllWindows();
        await removeDuplicateTabs();
        await groupTabsByDomain();
    } catch (error) {
        console.error(`An error occurred in groupTabsByDomain: ${JSON.stringify(error, null, 2)}`);
    }
});
