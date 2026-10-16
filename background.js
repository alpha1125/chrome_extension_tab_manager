const multiLabelPublicSuffixes = new Set([
    'ac.in', 'ac.jp', 'ac.kr', 'ac.nz', 'ac.uk', 'ac.za',
    'appspot.com', 'asn.au', 'azurewebsites.net', 'blogspot.com', 'cloudfront.net', 'co.in', 'co.jp', 'co.kr',
    'co.nz', 'co.uk', 'co.za',
    'com.ar', 'com.au', 'com.br', 'com.cn', 'com.hk', 'com.mx', 'com.my', 'com.sg', 'com.tr', 'com.tw',
    'edu.au', 'edu.br', 'edu.cn', 'edu.hk', 'edu.in', 'edu.my', 'edu.sg', 'edu.tw', 'edu.uk',
    'firebaseapp.com', 'firebaseio.com', 'firm.in', 'gen.in', 'github.io', 'gitlab.io', 'glitch.me', 'go.jp',
    'go.kr', 'gob.mx', 'gov.au', 'gov.br', 'gov.cn', 'gov.in', 'gov.kr', 'gov.my', 'gov.nz', 'gov.sg',
    'gov.uk', 'gov.za', 'herokuapp.com',
    'id.au', 'idv.hk', 'idv.tw', 'ind.in', 'lg.jp', 'mil.in', 'mil.kr', 'mil.my',
    'net.au', 'net.br', 'net.cn', 'net.hk', 'net.in', 'net.jp', 'net.kr', 'net.my', 'net.nz', 'net.sg',
    'net.tw', 'net.uk', 'net.za', 'netlify.app', 'ne.jp', 'ne.kr', 'nhs.uk', 'nom.br', 'onrender.com',
    'or.jp', 'or.kr', 'org.au', 'org.br', 'org.cn', 'org.hk', 'org.in', 'org.jp', 'org.kr', 'org.my',
    'org.nz', 'org.sg', 'org.tw', 'org.uk', 'org.za', 'pages.dev', 'pe.kr', 'plc.uk', 'police.uk',
    'readthedocs.io', 'res.in', 'sch.uk', 'school.nz', 'vercel.app', 'web.app', 'workers.dev'
]);

/**
 * Merges all windows into the current window.
 *
 * @returns {Promise<void>}
 */
async function mergeAllWindows() {
    const currentWindow = await new Promise((resolve, reject) => {
        chrome.windows.getCurrent({populate: true}, window => {
            if (chrome.runtime.lastError) {
                return reject(chrome.runtime.lastError);
            }
            resolve(window);
        });
    });
    const windows = await new Promise((resolve, reject) => {
        chrome.windows.getAll({populate: true}, result => {
            if (chrome.runtime.lastError) {
                return reject(chrome.runtime.lastError);
            }
            resolve(result);
        });
    });

    for (const window of windows) {
        if (window.id === currentWindow.id) {
            continue;
        }
        for (const tab of window.tabs) {
            await new Promise((resolve, reject) => {
                chrome.tabs.move(tab.id, {windowId: currentWindow.id, index: -1}, result => {
                    if (chrome.runtime.lastError) {
                        return reject(chrome.runtime.lastError);
                    }
                    resolve(result);
                });
            });
        }
    }
}

/**
 * Removes duplicate URLs and New Tab pages from the current window.
 * If every tab is a New Tab page, one is kept so the window remains open.
 *
 * @returns {Promise<void>}
 */
async function removeDuplicateTabs() {
    const windows = await new Promise((resolve, reject) => {
        chrome.windows.getAll({populate: true}, result => {
            if (chrome.runtime.lastError) {
                return reject(chrome.runtime.lastError);
            }
            resolve(result);
        });
    });

    const allTabs = windows.flatMap(window => window.tabs);
    const newTabTabs = allTabs.filter(tab => tab.url === 'chrome://newtab/');

    async function removeTabs(tabIds) {
        if (tabIds.length === 0) {
            return;
        }
        await new Promise((resolve, reject) => {
            chrome.tabs.remove(tabIds, () => {
                if (chrome.runtime.lastError) {
                    return reject(chrome.runtime.lastError);
                }
                resolve();
            });
        });
    }

    // Chrome must keep a tab open in the only window.
    if (allTabs.length === newTabTabs.length && windows.length === 1) {
        await removeTabs(newTabTabs.slice(1).map(tab => tab.id));
        return;
    }

    const window = await new Promise((resolve, reject) => {
        chrome.windows.getCurrent({populate: true}, result => {
            if (chrome.runtime.lastError) {
                return reject(chrome.runtime.lastError);
            }
            resolve(result);
        });
    });

    const uniqueUrls = new Set();
    const duplicateTabs = [];
    window.tabs.forEach(tab => {
        if (typeof tab.url !== 'string') {
            return;
        }
        if (uniqueUrls.has(tab.url) || (tab.url === 'chrome://newtab/' && window.tabs.length > 1)) {
            duplicateTabs.push(tab.id);
        } else {
            uniqueUrls.add(tab.url);
        }
    });
    await removeTabs(duplicateTabs);
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
 * @returns {string|null}
 */
function getDomainName(url) {
    if (typeof url !== 'string') {
        return null;
    }
    let parsedUrl;
    try {
        parsedUrl = new URL(url);
    } catch {
        return null;
    }
    if (parsedUrl.protocol === 'chrome:') {
        return 'Chrome';
    }
    const hostname = parsedUrl.hostname;
    if (!hostname) {
        return null;
    }
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname) || /^\[.*\]$/.test(hostname)) {
        return 'IP Address';
    }

    const parts = hostname.split('.');
    const suffix = parts.slice(-2).join('.');
    const labelIndex = parts.length > 2 && multiLabelPublicSuffixes.has(suffix)
        ? parts.length - 3
        : parts.length - 2;
    return capitalizeFirstLetter(parts[labelIndex] || hostname);
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
        let tabsByDomain = new Map();
        windows.tabs.forEach(tab => {
            let domain = getDomainName(tab.url);
            if (!domain) {
                return;
            }
            if (!tabsByDomain.has(domain)) {
                tabsByDomain.set(domain, []);
            }
            tabsByDomain.get(domain).push(tab.id);
        });
        for (let [domain, tabIds] of tabsByDomain) {
            if (tabIds.length > 1) {
                // Create a new group for this domain and move the tabs to this group
                let groupId = await new Promise((resolve, reject) => {
                    chrome.tabs.group({
                        tabIds,
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
                    chrome.tabs.ungroup(tabIds, function () {
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
        throw error;
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
        console.error('Could not complete the window merge, duplicate removal, or tab grouping:', error);
    }
});
