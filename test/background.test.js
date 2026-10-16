const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const backgroundSource = fs.readFileSync(path.join(__dirname, '..', 'background.js'), 'utf8');

function loadBackground({windows = [], currentWindow = windows[0], moveError, removeError} = {}) {
    const removedTabIds = [];
    const movedTabs = [];
    let lastError = null;
    const chrome = {
        runtime: {
            get lastError() {
                return lastError;
            }
        },
        action: {
            onClicked: {
                addListener() {}
            }
        },
        windows: {
            getAll(options, callback) {
                callback(windows);
            },
            getCurrent(options, callback) {
                callback(currentWindow);
            }
        },
        tabs: {
            move(tabId, properties, callback) {
                movedTabs.push([tabId, properties]);
                lastError = moveError ? {message: moveError} : null;
                callback();
                lastError = null;
            },
            remove(tabIds, callback) {
                removedTabIds.push(tabIds);
                lastError = removeError ? {message: removeError} : null;
                callback();
                lastError = null;
            },
            ungroup(tabIds, callback) {
                callback();
            },
            group(options, callback) {
                callback(1);
            }
        },
        tabGroups: {
            update(groupId, options, callback) {
                callback();
            }
        }
    };
    const context = vm.createContext({chrome, URL, console});
    vm.runInContext(backgroundSource, context);
    return {
        getDomainName: context.getDomainName,
        mergeAllWindows: context.mergeAllWindows,
        removeDuplicateTabs: context.removeDuplicateTabs,
        movedTabs,
        removedTabIds
    };
}

test('classifies common multi-label suffixes by registrable domain', () => {
    const {getDomainName} = loadBackground();
    assert.equal(getDomainName('https://news.example.co.uk/article'), 'Example');
    assert.equal(getDomainName('https://shop.example.com.au'), 'Example');
    assert.equal(getDomainName('https://example.com'), 'Example');
    assert.equal(getDomainName('https://alice.github.io'), 'Alice');
});

test('groups IP addresses consistently and recognizes Chrome pages', () => {
    const {getDomainName} = loadBackground();
    assert.equal(getDomainName('https://192.0.2.10/path'), 'IP Address');
    assert.equal(getDomainName('https://[2001:db8::1]/'), 'IP Address');
    assert.equal(getDomainName('chrome://settings/'), 'Chrome');
});

test('does not group URLs without a hostname or invalid URL values', () => {
    const {getDomainName} = loadBackground();
    assert.equal(getDomainName('about:blank'), null);
    assert.equal(getDomainName('file:///tmp/page.html'), null);
    assert.equal(getDomainName(undefined), null);
    assert.equal(getDomainName('not a URL'), null);
});

test('merges other windows into the current window', async () => {
    const windows = [
        {id: 20, tabs: [{id: 201, url: 'https://other.example/'}]},
        {id: 10, tabs: [{id: 101, url: 'https://current.example/'}]}
    ];
    const {mergeAllWindows, movedTabs} = loadBackground({
        windows,
        currentWindow: windows[1]
    });

    await mergeAllWindows();

    assert.deepEqual(
        movedTabs.map(([tabId, properties]) => [
            tabId,
            {windowId: properties.windowId, index: properties.index}
        ]),
        [[201, {windowId: 10, index: -1}]]
    );
});

test('surfaces tab move errors', async () => {
    const windows = [{id: 20, tabs: [{id: 201, url: 'https://other.example/'}]}];
    const {mergeAllWindows} = loadBackground({
        windows,
        currentWindow: {id: 10, tabs: []},
        moveError: 'Could not move tab'
    });

    await assert.rejects(mergeAllWindows(), error => error.message === 'Could not move tab');
});

test('removes New Tab pages when ordinary tabs are also open', async () => {
    const tabs = [
        {id: 1, url: 'https://example.com/'},
        {id: 2, url: 'chrome://newtab/'}
    ];
    const {removeDuplicateTabs, removedTabIds} = loadBackground({
        windows: [{id: 10, tabs}],
        currentWindow: {id: 10, tabs}
    });

    await removeDuplicateTabs();

    assert.deepEqual(removedTabIds.map(ids => Array.from(ids)), [[2]]);
});

test('keeps one tab when every open tab is New Tab', async () => {
    const tabs = [
        {id: 1, url: 'chrome://newtab/'},
        {id: 2, url: 'chrome://newtab/'}
    ];
    const {removeDuplicateTabs, removedTabIds} = loadBackground({
        windows: [{id: 10, tabs}],
        currentWindow: {id: 10, tabs}
    });

    await removeDuplicateTabs();

    assert.deepEqual(removedTabIds.map(ids => Array.from(ids)), [[2]]);
});

test('awaits duplicate tab removal and surfaces API errors', async () => {
    const tabs = [
        {id: 1, url: 'https://example.com/'},
        {id: 2, url: 'https://example.com/'}
    ];
    const {removeDuplicateTabs} = loadBackground({
        windows: [{id: 10, tabs}],
        currentWindow: {id: 10, tabs},
        removeError: 'Could not remove tab'
    });

    await assert.rejects(removeDuplicateTabs(), error => error.message === 'Could not remove tab');
});
