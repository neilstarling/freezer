// FIDO PWA
// Manages freezer items with name, category, expiration date

const ITEMS_KEY = 'freezer-inventory-items';
const CATEGORIES_KEY = 'freezer-inventory-categories';
const OWNER_LABELS_KEY = 'freezer-inventory-owner-labels';
const BUY_LIST_KEY = 'freezer-inventory-buy-list';
const EXPIRY_DURATION_MS = 30 * 24 * 60 * 60 * 1000;
const UNCATEGORIZED_ID = 'uncategorized';
const OWNERS = {
    hers: 'Hers',
    his: 'His',
    shared: 'Shared',
    misc: 'Misc',
    cakes: 'Cakes'
};
const DEFAULT_CATEGORIES = [
    { id: 'meat', name: 'Meat' },
    { id: 'vegetables', name: 'Vegetables' },
    { id: 'ice-cream', name: 'Ice Cream' },
    { id: 'bread', name: 'Bread' },
    { id: 'dessert', name: 'Dessert' },
    { id: 'other', name: 'Other' },
    { id: UNCATEGORIZED_ID, name: 'Uncategorized' }
];
const CATEGORY_COLORS = {
    meat: '#dc2626',
    vegetables: '#059669',
    'ice-cream': '#3b82f6',
    bread: '#f59e0b',
    dessert: '#d946ef',
    other: '#6b7280'
};

let categories = loadCategories();
let items = loadItems();
let ownerLabels = loadOwnerLabels();
let buyList = loadBuyList();
let currentFilter = 'fresh';
let currentOwnerFilter = 'all';
let currentSort = 'name';

// DOM Elements
const itemsList = document.getElementById('items-list');
const addItemForm = document.getElementById('add-item-form');
const itemName = document.getElementById('item-name');
const itemOwner = document.getElementById('item-owner');
const itemCategory = document.getElementById('item-category');
const itemSellBy = document.getElementById('item-sellby');
const tabFresh = document.getElementById('tab-fresh');
const tabExpired = document.getElementById('tab-expired');
const sortSelect = document.getElementById('sort-select');
const quickAddList = document.getElementById('quick-add-list');
const quickAddSearch = document.getElementById('quick-add-search');
const exportButton = document.getElementById('export-button');
const importButton = document.getElementById('import-button');
const importFileInput = document.getElementById('import-file-input');
const ownerTabs = document.querySelectorAll('.owner-tab');
const buyListElement = document.getElementById('buy-list');
const categoryList = document.getElementById('category-list');
const addCategoryForm = document.getElementById('add-category-form');
const newCategoryName = document.getElementById('new-category-name');
const ownerLabelForm = document.getElementById('owner-label-form');
const settingsTabButtons = document.querySelectorAll('.settings-tab-btn');
const settingsPanels = document.querySelectorAll('.settings-panel');
const navButtons = document.querySelectorAll('.nav-btn');
const installButton = document.getElementById('install-app-button');
let deferredInstallPrompt = null;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    renderCategories();
    renderOwnerLabels();
    renderItems();
    renderQuickAdd();
    renderBuyList();
    setupEventListeners();
    setupInstallPrompt();
    setInterval(() => {
        renderItems();
    }, 60 * 60 * 1000);
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            renderItems();
        }
    });
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./service-worker.js')
            .catch(error => console.error('Service worker registration failed:', error));
    }
});

function loadCategories() {
    const storedCategories = localStorage.getItem(CATEGORIES_KEY);
    if (!storedCategories) return [...DEFAULT_CATEGORIES];

    try {
        const parsed = JSON.parse(storedCategories);
        if (!Array.isArray(parsed)) throw new TypeError('Stored categories are not an array.');
        const valid = parsed.filter(category =>
            category && typeof category.id === 'string' &&
            typeof category.name === 'string' && category.name.trim()
        );
        if (!valid.some(category => category.id === UNCATEGORIZED_ID)) {
            valid.push({ id: UNCATEGORIZED_ID, name: 'Uncategorized' });
        }
        return valid;
    } catch (error) {
        console.error('Unable to load saved categories:', error);
        return [...DEFAULT_CATEGORIES];
    }
}

function loadOwnerLabels() {
    const storedLabels = localStorage.getItem(OWNER_LABELS_KEY);
    if (!storedLabels) return { ...OWNERS };

    try {
        const parsed = JSON.parse(storedLabels);
        const labels = Object.fromEntries(Object.keys(OWNERS).map(owner => [
            owner,
            typeof parsed?.[owner] === 'string' && parsed[owner].trim()
                ? parsed[owner].trim()
                : OWNERS[owner]
        ]));
        const savedLabels = Object.keys(OWNERS)
            .filter(owner => typeof parsed?.[owner] === 'string' && parsed[owner].trim())
            .map(owner => labels[owner].toLowerCase());
        if (new Set(savedLabels).size !== savedLabels.length) {
            throw new TypeError('Saved owner labels are not unique.');
        }
        return labels;
    } catch (error) {
        console.error('Unable to load saved owner labels:', error);
        return { ...OWNERS };
    }
}

function loadBuyList() {
    const storedBuyList = localStorage.getItem(BUY_LIST_KEY);
    if (!storedBuyList) return [];

    try {
        return normalizeBuyList(JSON.parse(storedBuyList), categories);
    } catch (error) {
        console.error('Unable to load saved Buy list:', error);
        return [];
    }
}

function normalizeBuyList(entries, availableCategories, timestamp = Date.now()) {
    if (!Array.isArray(entries)) throw new TypeError('Buy list must be an array.');

    return entries.map((entry, index) => {
        if (!entry || typeof entry !== 'object' || typeof entry.name !== 'string' || !entry.name.trim()) {
            throw new TypeError(`Buy list item ${index + 1} is invalid.`);
        }
        const id = (typeof entry.id === 'number' && Number.isFinite(entry.id))
            || (typeof entry.id === 'string' && entry.id.trim())
            ? entry.id
            : `buy-${timestamp}-${index}`;
        return {
            id,
            name: entry.name.trim(),
            owner: isKnownOwner(entry.owner) ? entry.owner : 'shared',
            category: availableCategories.some(category => category.id === entry.category)
                ? entry.category
                : UNCATEGORIZED_ID
        };
    });
}

function loadItems() {
    const storedItems = localStorage.getItem(ITEMS_KEY);
    if (!storedItems) return [];

    try {
        const parsedItems = JSON.parse(storedItems);
        if (!Array.isArray(parsedItems)) throw new TypeError('Stored inventory is not an array.');
        const normalizedItems = parsedItems.filter(item => item && typeof item === 'object').map(item => {
            const name = typeof item.name === 'string' ? item.name.trim() : '';
            if (!name) return null;
            const added = new Date(item.added);
            const addedAt = Number.isNaN(added.getTime()) ? new Date() : added;
            const sellBy = parseSellByDate(item.sellBy);
            const id = (typeof item.id === 'number' && Number.isFinite(item.id))
                || (typeof item.id === 'string' && item.id.trim())
                ? item.id
                : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
            return {
                ...item,
                id,
                name,
                owner: isKnownOwner(item.owner) ? item.owner : 'shared',
                category: categories.some(category => category.id === item.category)
                    ? item.category
                    : UNCATEGORIZED_ID,
                added: addedAt,
                sellBy: sellBy && !Number.isNaN(sellBy.getTime()) ? sellBy : null,
                date: new Date(addedAt.getTime() + EXPIRY_DURATION_MS)
            };
        });
        return normalizedItems.filter(item => item !== null);
    } catch (error) {
        console.error('Unable to load saved freezer items:', error);
        return [];
    }
}

function isExpired(date, today = new Date()) {
    return date <= today;
}

function isKnownOwner(owner) {
    return Object.prototype.hasOwnProperty.call(OWNERS, owner);
}

function parseSellByDate(value) {
    if (!value) return null;

    const dateString = typeof value === 'string' ? value : '';
    const dateParts = dateString.match(/^(\d{4})-(\d{2})-(\d{2})(?:T00:00:00(?:\.000)?Z)?$/);
    const date = dateParts
        ? new Date(Number(dateParts[1]), Number(dateParts[2]) - 1, Number(dateParts[3]))
        : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

function daysBetweenLocalDates(from, to) {
    const fromDay = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
    const toDay = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
    return Math.round((toDay - fromDay) / 86400000);
}

function normalizeOwnerLabels(labels) {
    if (!labels || typeof labels !== 'object') {
        throw new TypeError('Owner names must be an object.');
    }

    const normalized = Object.fromEntries(Object.keys(OWNERS).map(owner => {
        const label = labels[owner] === undefined
            ? OWNERS[owner]
            : typeof labels[owner] === 'string' ? labels[owner].trim() : '';
        if (!label) throw new TypeError('Owner names cannot be empty.');
        return [owner, label];
    }));
    const providedLabels = Object.keys(OWNERS)
        .filter(owner => labels[owner] !== undefined)
        .map(owner => normalized[owner].toLowerCase());
    if (new Set(providedLabels).size !== providedLabels.length) {
        throw new TypeError('Owner names must be unique.');
    }
    return normalized;
}

// Event Listeners
function setupEventListeners() {
    addItemForm.addEventListener('submit', e => {
        e.preventDefault();
        addItem();
    });
    tabFresh.addEventListener('click', () => switchTab('fresh'));
    tabExpired.addEventListener('click', () => switchTab('expired'));
    [tabFresh, tabExpired].forEach(button => {
        button.addEventListener('click', () => navigateToScreen('inventory'));
    });
    ownerTabs.forEach(button => {
        button.addEventListener('click', () => switchOwnerFilter(button.dataset.owner));
    });
    if (sortSelect) {
        sortSelect.addEventListener('change', () => {
            currentSort = sortSelect.value;
            renderItems();
        });
    }

    if (quickAddList) {
        quickAddList.addEventListener('click', event => {
            const card = event.target.closest('[data-quick-add-id]');
            if (!card) return;
            quickAddPrevious(card.dataset.quickAddId);
        });
    }
    if (quickAddSearch) {
        quickAddSearch.addEventListener('input', () => renderQuickAdd(quickAddSearch.value));
    }
    if (buyListElement) {
        buyListElement.addEventListener('click', event => {
            const button = event.target.closest('[data-remove-buy-id]');
            if (button) removeFromBuyList(button.dataset.removeBuyId);
        });
    }
    if (ownerLabelForm) {
        ownerLabelForm.addEventListener('submit', event => {
            event.preventDefault();
            saveOwnerLabelEdits();
        });
        ownerLabelForm.addEventListener('input', event => {
            event.target.setCustomValidity('');
        });
    }
    settingsTabButtons.forEach(button => {
        button.addEventListener('click', () => switchSettingsTab(button.dataset.settingsTab));
    });
    addCategoryForm.addEventListener('submit', event => {
        event.preventDefault();
        addCategory(newCategoryName.value);
    });
    addCategoryForm.addEventListener('input', event => {
        event.target.setCustomValidity('');
    });
    categoryList.addEventListener('submit', event => {
        if (!event.target.matches('.category-edit-form')) return;
        event.preventDefault();
        const nameInput = event.target.elements.categoryName;
        renameCategory(event.target.dataset.categoryId, nameInput.value, nameInput);
    });
    categoryList.addEventListener('input', event => {
        if (event.target.name === 'categoryName') event.target.setCustomValidity('');
    });
    categoryList.addEventListener('click', event => {
        const button = event.target.closest('[data-action="delete-category"]');
        if (button) deleteCategory(button.dataset.categoryId);
    });
    navButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const screenId = btn.dataset.screen;
            navigateToScreen(screenId);
        });
    });
    if (installButton) {
        installButton.addEventListener('click', installPwa);
    }
    if (exportButton) {
        exportButton.addEventListener('click', exportItems);
    }
    if (importButton && importFileInput) {
        importButton.addEventListener('click', () => importFileInput.click());
        importFileInput.addEventListener('change', e => {
            const file = e.target.files[0];
            if (file) {
                if (confirm('Importing this file will REPLACE your current inventory. Continue?')) {
                    importItems(file);
                }
                importFileInput.value = '';
            }
        });
    }
}

function navigateToScreen(screenId) {
    navButtons.forEach(button => {
        button.classList.toggle('active', button.dataset.screen === screenId);
    });
    document.querySelectorAll('.screen-view').forEach(screen => screen.classList.remove('active'));
    const screen = document.getElementById(`${screenId}-screen`);
    if (screen) screen.classList.add('active');
    if (screenId === 'settings') switchSettingsTab('settings');
}

function renderCategories() {
    itemCategory.innerHTML = categories.map(category =>
        `<option value="${escapeHtml(category.id)}">${escapeHtml(category.name)}</option>`
    ).join('');
    categoryList.innerHTML = categories.map(category => {
        if (category.id === UNCATEGORIZED_ID) {
            return `<div class="category-row"><span>${escapeHtml(category.name)}</span><span class="category-note">Fallback category</span></div>`;
        }
        return `
            <form class="category-row category-edit-form" data-category-id="${escapeHtml(category.id)}">
                <input type="text" name="categoryName" value="${escapeHtml(category.name)}" maxlength="40" required aria-label="Category name">
                <button type="submit">Save</button>
                <button type="button" class="category-delete" data-action="delete-category" data-category-id="${escapeHtml(category.id)}">Delete</button>
            </form>
        `;
    }).join('');
}

function renderOwnerLabels() {
    ownerTabs.forEach(button => {
        const owner = button.dataset.owner;
        button.textContent = owner === 'all' ? 'All' : ownerLabels[owner];
    });
    Array.from(itemOwner.options).forEach(option => {
        if (isKnownOwner(option.value)) option.textContent = ownerLabels[option.value];
    });
    Object.keys(OWNERS).forEach(owner => {
        ownerLabelForm.elements[owner].value = ownerLabels[owner];
    });
}

function saveOwnerLabelEdits() {
    const labels = Object.fromEntries(Object.keys(OWNERS).map(owner => [
        owner,
        ownerLabelForm.elements[owner].value.trim()
    ]));
    const emptyOwner = Object.keys(labels).find(owner => !labels[owner]);
    const duplicateOwner = Object.keys(labels).find((owner, index) =>
        Object.values(labels).some((label, labelIndex) =>
            labelIndex !== index && label.toLowerCase() === labels[owner].toLowerCase()
        )
    );
    const invalidOwner = emptyOwner || duplicateOwner;
    if (invalidOwner) {
        const input = ownerLabelForm.elements[invalidOwner];
        input.setCustomValidity(emptyOwner ? 'Enter a name for each owner.' : 'Owner names must be unique.');
        input.reportValidity();
        return;
    }

    ownerLabels = normalizeOwnerLabels(labels);
    localStorage.setItem(OWNER_LABELS_KEY, JSON.stringify(ownerLabels));
    renderOwnerLabels();
    renderItems();
    renderQuickAdd();
    renderBuyList();
}

function switchSettingsTab(tab) {
    settingsTabButtons.forEach(button => {
        const active = button.dataset.settingsTab === tab;
        button.classList.toggle('active', active);
        button.setAttribute('aria-selected', String(active));
    });
    settingsPanels.forEach(panel => {
        panel.hidden = panel.dataset.settingsPanel !== tab;
    });
}

function saveCategories() {
    localStorage.setItem(CATEGORIES_KEY, JSON.stringify(categories));
}

function addCategory(name) {
    const normalizedName = name.trim();
    if (!normalizedName || categories.some(category => category.name.toLowerCase() === normalizedName.toLowerCase())) {
        newCategoryName.setCustomValidity('Enter a unique category name.');
        newCategoryName.reportValidity();
        return;
    }

    newCategoryName.setCustomValidity('');
    categories.push({
        id: `category-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: normalizedName
    });
    saveCategories();
    renderCategories();
    newCategoryName.value = '';
}

function renameCategory(id, name, input) {
    const category = categories.find(entry => entry.id === id);
    if (!category || category.id === UNCATEGORIZED_ID) return;

    const normalizedName = name.trim();
    if (!normalizedName || categories.some(entry =>
        entry.id !== id && entry.name.toLowerCase() === normalizedName.toLowerCase()
    )) {
        input.setCustomValidity('Enter a unique category name.');
        input.reportValidity();
        return;
    }

    input.setCustomValidity('');
    category.name = normalizedName;
    saveCategories();
    renderCategories();
}

function deleteCategory(id) {
    if (id === UNCATEGORIZED_ID) return;
    const exists = categories.some(category => category.id === id);
    if (!exists) return;

    categories = categories.filter(category => category.id !== id);
    items = items.map(item => item.category === id
        ? { ...item, category: UNCATEGORIZED_ID }
        : item
    );
    buyList = buyList.map(item => item.category === id
        ? { ...item, category: UNCATEGORIZED_ID }
        : item
    );
    saveCategories();
    saveItems();
    saveBuyList();
    renderCategories();
    renderItems();
    renderQuickAdd();
    renderBuyList();
}

// PWA Install Prompt
function setupInstallPrompt() {
    window.addEventListener('beforeinstallprompt', e => {
        e.preventDefault();
        deferredInstallPrompt = e;
        if (installButton) installButton.hidden = false;
    });
}

async function installPwa() {
    if (!deferredInstallPrompt) {
        if (installButton) installButton.hidden = true;
        return;
    }
    const prompt = deferredInstallPrompt;
    deferredInstallPrompt = null;
    if (installButton) installButton.hidden = true;
    try {
        await prompt.prompt();
        await prompt.userChoice;
    } catch (error) {
        console.error('PWA installation prompt failed:', error);
    }
}

// Add Item
function addItem() {
    const name = itemName.value.trim();
    const owner = itemOwner.value;
    const category = itemCategory.value;
    const sellByValue = itemSellBy ? itemSellBy.value.trim() : '';
    const sellByDate = parseSellByDate(sellByValue);
    if (!name || !isKnownOwner(owner) || !categories.some(entry => entry.id === category)) return;

    const added = new Date();
    const item = {
        id: Date.now(),
        name,
        owner,
        category,
        sellBy: sellByDate && !Number.isNaN(sellByDate.getTime()) ? sellByDate : null,
        date: new Date(added.getTime() + EXPIRY_DURATION_MS),
        added
    };
    items.unshift(item);
    saveItems();
    renderItems();
    renderQuickAdd();
    itemName.value = '';
    if (itemSellBy) itemSellBy.value = '';
}

// Render Items
function renderItems(filter = currentFilter) {
    const now = new Date();
    let filtered = items;
    if (filter === 'expired') filtered = items.filter(item => isExpired(item.date, now));
    if (filter === 'fresh') filtered = items.filter(item => !isExpired(item.date, now));
    if (currentOwnerFilter !== 'all') {
        filtered = filtered.filter(item => item.owner === currentOwnerFilter);
    }

    // Sort items
    filtered = sortItems(filtered, currentSort);

    if (!filtered.length) {
        const emptyMessage = items.length === 0
            ? 'No items yet. Open Settings to add your first item.'
            : filter === 'fresh'
                ? 'No fresh items.'
                : filter === 'expired'
                    ? 'No expired items.'
                    : 'No items match this filter.';
        itemsList.innerHTML = `<p class="empty-state">${emptyMessage}</p>`;
        return;
    }
    itemsList.innerHTML = filtered.map(item => {
        const color = CATEGORY_COLORS[item.category] || '#333';
        const category = categories.find(entry => entry.id === item.category);
        const expired = isExpired(item.date, now);
        const itemId = escapeHtml(String(item.id));
        const percentage = Math.max(0, Math.min(100,
            Math.ceil((item.date.getTime() - now.getTime()) / EXPIRY_DURATION_MS * 100)
        ));
        const daysInFreezer = Math.max(0, Math.floor((now.getTime() - item.added.getTime()) / 86400000));
        const daysUntilSellBy = item.sellBy ? daysBetweenLocalDates(now, item.sellBy) : null;
        const dateStr = item.date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
        const sellByStr = item.sellBy ? item.sellBy.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
        return `
            <div class="item-tile ${expired ? 'expired' : ''}" style="--category-color: ${color}" data-id="${itemId}">
                <span class="item-name">${escapeHtml(item.name)}</span>
                <div class="item-meta">
                    <span class="item-date ${expired ? 'expired' : ''}">Expires: ${dateStr}</span>
                    <span>In freezer: ${daysInFreezer} ${daysInFreezer === 1 ? 'day' : 'days'}</span>
                    ${item.sellBy ? `<span class="item-sellby">Sell by: ${sellByStr} · ${daysUntilSellBy >= 0 ? `${daysUntilSellBy} ${daysUntilSellBy === 1 ? 'day' : 'days'} to go` : `${Math.abs(daysUntilSellBy)} ${Math.abs(daysUntilSellBy) === 1 ? 'day' : 'days'} past`}</span>` : '<span class="item-date">No sell-by date</span>'}
                    <span>${escapeHtml(ownerLabels[item.owner] || ownerLabels.shared)} · ${escapeHtml(category?.name || 'Uncategorized')}</span>
                </div>
                <div class="time-remaining" role="progressbar" aria-label="Time remaining" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percentage}">
                    <div class="time-remaining-bar" style="width: ${percentage}%"></div>
                </div>
                <span class="time-remaining-label">Time left: ${percentage}%</span>
                <button class="item-delete" data-id="${itemId}" aria-label="Remove ${escapeHtml(item.name)}">✕</button>
            </div>
        `;
    }).join('');
    document.querySelectorAll('.item-delete').forEach(btn => {
        btn.addEventListener('click', e => {
            const id = e.target.dataset.id;
            deleteItem(id);
        });
    });
}

// Sort items based on current sort option
function sortItems(arr, sortField) {
    const sorted = [...arr];
    switch (sortField) {
        case 'name':
            sorted.sort((a, b) => a.name.localeCompare(b.name));
            break;
        case 'expiry':
            sorted.sort((a, b) => a.date.getTime() - b.date.getTime());
            break;
        case 'sellby':
            sorted.sort((a, b) => {
                if (!a.sellBy && !b.sellBy) return 0;
                if (!a.sellBy) return 1;
                if (!b.sellBy) return -1;
                return a.sellBy.getTime() - b.sellBy.getTime();
            });
            break;
    }
    return sorted;
}

// Delete Item
function deleteItem(id) {
    const item = items.find(entry => String(entry.id) === String(id));
    if (!item) return;

    const addToBuyList = confirm(`Add "${item.name}" to your Buy list? The inventory item will be removed either way.`);
    if (addToBuyList) {
        buyList.push({
            id: `buy-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            name: item.name,
            owner: item.owner,
            category: item.category
        });
        saveBuyList();
        renderBuyList();
    }

    items = items.filter(entry => String(entry.id) !== String(id));
    saveItems();
    renderItems();
    renderQuickAdd();
}

function renderBuyList() {
    if (!buyListElement) return;
    if (buyList.length === 0) {
        buyListElement.innerHTML = '<p class="buy-list-empty">Your Buy list is empty. Remove an inventory item and choose to add it here.</p>';
        return;
    }

    buyListElement.innerHTML = buyList.map(item => {
        const category = categories.find(entry => entry.id === item.category);
        const itemId = escapeHtml(String(item.id));
        return `
            <div class="buy-list-item">
                <div>
                    <div class="buy-list-item-name">${escapeHtml(item.name)}</div>
                    <div class="buy-list-item-meta">${escapeHtml(ownerLabels[item.owner] || ownerLabels.shared)} · ${escapeHtml(category?.name || 'Uncategorized')}</div>
                </div>
                <button type="button" class="buy-list-done" data-remove-buy-id="${itemId}" aria-label="Remove ${escapeHtml(item.name)} from Buy list">Done</button>
            </div>
        `;
    }).join('');
}

function saveBuyList() {
    localStorage.setItem(BUY_LIST_KEY, JSON.stringify(buyList));
}

function removeFromBuyList(id) {
    buyList = buyList.filter(item => String(item.id) !== String(id));
    saveBuyList();
    renderBuyList();
}

// Switch Tab
function switchTab(filter) {
    currentFilter = filter;
    tabFresh.classList.toggle('active', filter === 'fresh');
    tabExpired.classList.toggle('active', filter === 'expired');
    tabFresh.setAttribute('aria-pressed', String(filter === 'fresh'));
    tabExpired.setAttribute('aria-pressed', String(filter === 'expired'));
    renderItems(filter);
}

function switchOwnerFilter(owner) {
    currentOwnerFilter = currentOwnerFilter === owner ? 'all' : owner;
    ownerTabs.forEach(button => {
        const active = button.dataset.owner === currentOwnerFilter;
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', String(active));
    });
    renderItems();
}

// Render Quick Add list - deduplicated by name
function renderQuickAdd(query = '') {
    if (!quickAddList) return;

    // Build a map of unique items by name, keeping the most recent one
    const uniqueItems = new Map();
    items.forEach(item => {
        const key = item.name.toLowerCase();
        if (!uniqueItems.has(key) || item.added > uniqueItems.get(key).added) {
            uniqueItems.set(key, item);
        }
    });

    let list = Array.from(uniqueItems.values());

    // Filter by search query
    const q = query.trim().toLowerCase();
    if (q) list = list.filter(item => item.name.toLowerCase().includes(q));

    if (list.length === 0) {
        quickAddList.innerHTML = '<p style="color: #64748b; text-align: center; padding: 40px;">' + (items.length === 0 ? 'No previous items yet. Add items to build your quick-add list.' : 'No items match your search.') + '</p>';
        return;
    }

    // Keep owner groups in a stable display order.
    const ownerOrder = Object.keys(OWNERS);
    const groups = {};
    ownerOrder.forEach(o => groups[o] = []);
    list.forEach(item => {
        const owner = ownerOrder.includes(item.owner) ? item.owner : 'shared';
        groups[owner].push(item);
    });

    // Sort each group alphabetically by name
    ownerOrder.forEach(o => groups[o].sort((a, b) => a.name.localeCompare(b.name)));

    // Render groups with headers
    quickAddList.innerHTML = ownerOrder.map(owner => {
        if (groups[owner].length === 0) return '';
        return `
            <div class="quick-add-group">
                <div class="quick-add-group-header">${escapeHtml(ownerLabels[owner])}</div>
                ${groups[owner].map(item => {
                    const category = categories.find(c => c.id === item.category);
                    const color = CATEGORY_COLORS[item.category] || '#333';
                    const itemId = escapeHtml(String(item.id));
                    return `
                        <div class="quick-add-item" data-quick-add-id="${itemId}" style="border-left: 6px solid ${color};">
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <div>
                                    <div style="font-weight: bold; font-size: 1.1rem;">${escapeHtml(item.name)}</div>
                                    <div style="font-size: 0.85rem; color: #64748b; margin-top: 4px;">
                                        ${escapeHtml(category?.name || 'Uncategorized')}
                                    </div>
                                </div>
                                <span style="font-size: 0.8rem; color: #10b981; font-weight: bold;">Select</span>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    }).join('');
}

// Quick Add - pre-fill the Add Item form from a previous item template
function quickAddPrevious(templateId) {
    const templateItem = items.find(i => String(i.id) === String(templateId));
    if (!templateItem) return;

    itemName.value = templateItem.name;
    itemOwner.value = templateItem.owner;
    itemCategory.value = templateItem.category;
    if (itemSellBy) itemSellBy.value = '';

    // Switch to settings so the user can enter a sell-by date.
    navButtons.forEach(btn => {
        if (btn.dataset.screen === 'settings') {
            btn.click();
        }
    });
    itemName.focus();
}

// Save to LocalStorage
function saveItems() {
    localStorage.setItem(ITEMS_KEY, JSON.stringify(items));
}

// Export as JSON
function exportItems() {
    const data = JSON.stringify({ items, categories, ownerLabels, buyList }, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `freezer-inventory-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
}

// Import from JSON
function importItems(file) {
    const reader = new FileReader();
    reader.onload = e => {
        try {
            const imported = JSON.parse(e.target.result);
            // Support the current backup format and legacy array format.
            const importedItems = Array.isArray(imported) ? imported : imported.items;
            const importedCategories = Array.isArray(imported) ? null : imported.categories;
            const importedOwnerLabels = Array.isArray(imported) ? undefined : imported.ownerLabels;
            const importedBuyList = Array.isArray(imported) ? undefined : imported.buyList;
            if (!Array.isArray(importedItems)) {
                alert('Invalid data format.');
                return;
            }

            const importedAt = Date.now();
            let nextCategories = categories;
            let nextOwnerLabels = ownerLabels;
            let nextBuyList = buyList;

            if (Array.isArray(importedCategories)) {
                nextCategories = normalizeImportedCategories(importedCategories);
            }
            if (importedOwnerLabels !== undefined) {
                nextOwnerLabels = normalizeOwnerLabels(importedOwnerLabels);
            }
            if (importedBuyList !== undefined) {
                nextBuyList = normalizeBuyList(importedBuyList, nextCategories, importedAt);
            }

            const normalizedItems = importedItems.map((item, index) => {
                if (!item || typeof item !== 'object') {
                    throw new TypeError(`Item ${index + 1} is invalid.`);
                }
                if (typeof item.name !== 'string' || !item.name.trim()) {
                    throw new TypeError(`Item ${index + 1} needs a name.`);
                }

                const addedDate = new Date(item.added);
                const added = Number.isNaN(addedDate.getTime()) ? new Date(importedAt + index) : addedDate;
                const sellBy = parseSellByDate(item.sellBy);
                const id = (typeof item.id === 'number' && Number.isFinite(item.id))
                    || (typeof item.id === 'string' && item.id.trim())
                    ? item.id
                    : `${importedAt}-${index}`;

                return {
                    ...item,
                    id,
                    name: item.name.trim(),
                    owner: isKnownOwner(item.owner) ? item.owner : 'shared',
                    category: nextCategories.some(category => category.id === item.category)
                        ? item.category
                        : UNCATEGORIZED_ID,
                    added,
                    sellBy: sellBy && !Number.isNaN(sellBy.getTime()) ? sellBy : null,
                    date: new Date(added.getTime() + EXPIRY_DURATION_MS)
                };
            });

            categories = nextCategories;
            items = normalizedItems;
            ownerLabels = nextOwnerLabels;
            buyList = nextBuyList;
            saveCategories();
            saveItems();
            localStorage.setItem(OWNER_LABELS_KEY, JSON.stringify(ownerLabels));
            saveBuyList();
            renderCategories();
            renderOwnerLabels();
            renderItems();
            renderQuickAdd();
            renderBuyList();
            alert('Inventory imported successfully!');
        } catch (err) {
            alert('Error parsing JSON: ' + err.message);
        }
    };
    reader.readAsText(file);
}

// Helper
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function normalizeImportedCategories(importedCategories) {
    if (importedCategories.length === 0) {
        throw new TypeError('The categories list cannot be empty.');
    }

    const normalized = [];
    const seenIds = new Set();
    const seenNames = new Set();

    for (const [index, category] of importedCategories.entries()) {
        if (!category || typeof category !== 'object'
            || typeof category.id !== 'string' || !category.id.trim()
            || typeof category.name !== 'string' || !category.name.trim()) {
            throw new TypeError(`Category ${index + 1} is invalid.`);
        }

        const id = category.id.trim();
        const name = category.name.trim();
        const normalizedName = name.toLowerCase();
        if (seenIds.has(id) || seenNames.has(normalizedName)) {
            throw new TypeError('Category IDs and names must be unique.');
        }

        seenIds.add(id);
        seenNames.add(normalizedName);
        normalized.push({ id, name });
    }

    if (!normalized.some(category => category.id === UNCATEGORIZED_ID)) {
        normalized.push({ id: UNCATEGORIZED_ID, name: 'Uncategorized' });
    }
    return normalized;
}
