// Freezer Inventory PWA
// Manages freezer items with name, category, expiration date

const ITEMS_KEY = 'freezer-inventory-items';
const CATEGORIES_KEY = 'freezer-inventory-categories';
const EXPIRY_DURATION_MS = 30 * 24 * 60 * 60 * 1000;
const UNCATEGORIZED_ID = 'uncategorized';
const OWNERS = {
    hers: 'Hers',
    his: 'His',
    shared: 'Shared'
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
let currentFilter = 'all';
let currentOwnerFilter = 'all';
let currentSort = 'name';

// DOM Elements
const itemsList = document.getElementById('items-list');
const addItemForm = document.getElementById('add-item-form');
const itemName = document.getElementById('item-name');
const itemOwner = document.getElementById('item-owner');
const itemCategory = document.getElementById('item-category');
const itemSellBy = document.getElementById('item-sellby');
const tabAll = document.getElementById('tab-all');
const tabExpired = document.getElementById('tab-expired');
const sortSelect = document.getElementById('sort-select');
const quickAddList = document.getElementById('quick-add-list');
const quickAddSearch = document.getElementById('quick-add-search');
const exportButton = document.getElementById('export-button');
const importButton = document.getElementById('import-button');
const importFileInput = document.getElementById('import-file-input');
const ownerTabs = document.querySelectorAll('.owner-tab');
const categoryList = document.getElementById('category-list');
const addCategoryForm = document.getElementById('add-category-form');
const newCategoryName = document.getElementById('new-category-name');
const navButtons = document.querySelectorAll('.nav-btn');
const installButton = document.getElementById('install-app-button');
let deferredInstallPrompt = null;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    renderCategories();
    renderItems();
    renderQuickAdd();
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

function loadItems() {
    const storedItems = localStorage.getItem(ITEMS_KEY);
    if (!storedItems) return [];

    try {
        const parsedItems = JSON.parse(storedItems);
        if (!Array.isArray(parsedItems)) throw new TypeError('Stored inventory is not an array.');
        return parsedItems.filter(item => item && typeof item === 'object').map(item => {
            const added = new Date(item.added);
            const addedAt = Number.isNaN(added.getTime()) ? new Date() : added;
            const sellBy = item.sellBy ? new Date(item.sellBy) : null;
            return {
                ...item,
                owner: isKnownOwner(item.owner) ? item.owner : 'shared',
                category: categories.some(category => category.id === item.category)
                    ? item.category
                    : UNCATEGORIZED_ID,
                added: addedAt,
                sellBy: sellBy && !Number.isNaN(sellBy.getTime()) ? sellBy : null,
                date: new Date(addedAt.getTime() + EXPIRY_DURATION_MS)
            };
        });
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

// Event Listeners
function setupEventListeners() {
    addItemForm.addEventListener('submit', e => {
        e.preventDefault();
        addItem();
    });
    tabAll.addEventListener('click', () => switchTab('all'));
    tabExpired.addEventListener('click', () => switchTab('expired'));
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
            quickAddPrevious(parseInt(card.dataset.quickAddId));
        });
    }
    if (quickAddSearch) {
        quickAddSearch.addEventListener('input', () => renderQuickAdd(quickAddSearch.value));
    }
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
            navButtons.forEach(b => {
                b.classList.toggle('active', b.dataset.screen === screenId);
            });
            document.querySelectorAll('.screen-view').forEach(s => s.classList.remove('active'));
            const screen = document.getElementById(`${screenId}-screen`);
            if (screen) screen.classList.add('active');
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
                if (confirm('Importing will add items to your current inventory. Continue?')) {
                    importItems(file);
                }
                importFileInput.value = '';
            }
        });
    }
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
        ? { ...item, owner: 'shared', category: UNCATEGORIZED_ID }
        : item
    );
    saveCategories();
    saveItems();
    renderCategories();
    renderItems();
    renderQuickAdd();
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
    const sellByDate = sellByValue ? new Date(sellByValue) : null;
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
    if (currentOwnerFilter !== 'all') {
        filtered = filtered.filter(item => item.owner === currentOwnerFilter);
    }

    // Sort items
    filtered = sortItems(filtered, currentSort);

    if (!filtered.length) {
        itemsList.innerHTML = '<p class="empty-state">No items yet. Click "Add Item" to get started.</p>';
        return;
    }
    itemsList.innerHTML = filtered.map(item => {
        const color = CATEGORY_COLORS[item.category] || '#333';
        const category = categories.find(entry => entry.id === item.category);
        const expired = isExpired(item.date, now);
        const percentage = Math.max(0, Math.min(100,
            Math.ceil((item.date.getTime() - now.getTime()) / EXPIRY_DURATION_MS * 100)
        ));
        const dateStr = item.date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
        const sellByStr = item.sellBy ? item.sellBy.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
        return `
            <div class="item-tile ${expired ? 'expired' : ''}" style="--category-color: ${color}" data-id="${item.id}">
                <span class="item-name">${escapeHtml(item.name)}</span>
                <div class="item-meta">
                    <span class="item-date ${expired ? 'expired' : ''}">Expires: ${dateStr}</span>
                    ${item.sellBy ? `<span class="item-sellby">Sell by: ${sellByStr}</span>` : ''}
                    <span>${escapeHtml(OWNERS[item.owner] || OWNERS.shared)} · ${escapeHtml(category?.name || 'Uncategorized')}</span>
                </div>
                <div class="time-remaining" role="progressbar" aria-label="Time remaining" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percentage}">
                    <div class="time-remaining-bar" style="width: ${percentage}%"></div>
                </div>
                <span class="time-remaining-label">Time left: ${percentage}%</span>
                <button class="item-delete" data-id="${item.id}" aria-label="Remove ${escapeHtml(item.name)}">✕</button>
            </div>
        `;
    }).join('');
    document.querySelectorAll('.item-delete').forEach(btn => {
        btn.addEventListener('click', e => {
            const id = parseInt(e.target.dataset.id);
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
    items = items.filter(item => item.id !== id);
    saveItems();
    renderItems();
    renderQuickAdd();
}

// Switch Tab
function switchTab(filter) {
    currentFilter = filter;
    tabAll.classList.toggle('active', filter === 'all');
    tabExpired.classList.toggle('active', filter === 'expired');
    renderItems(filter);
}

function switchOwnerFilter(owner) {
    currentOwnerFilter = owner;
    ownerTabs.forEach(button => {
        button.classList.toggle('active', button.dataset.owner === owner);
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

    // Group by owner in fixed order: hers, his, shared
    const ownerOrder = ['hers', 'his', 'shared'];
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
                <div class="quick-add-group-header">${OWNERS[owner]}</div>
                ${groups[owner].map(item => {
                    const category = categories.find(c => c.id === item.category);
                    const color = CATEGORY_COLORS[item.category] || '#333';
                    return `
                        <div class="quick-add-item" data-quick-add-id="${item.id}" style="border-left: 6px solid ${color};">
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
    const templateItem = items.find(i => i.id === templateId);
    if (!templateItem) return;

    itemName.value = templateItem.name;
    itemOwner.value = templateItem.owner;
    itemCategory.value = templateItem.category;
    if (itemSellBy) itemSellBy.value = '';

    // Switch to add screen so the user can enter a sell-by date
    navButtons.forEach(btn => {
        if (btn.dataset.screen === 'add') {
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
    const data = JSON.stringify(items, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `freezer-inventory-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

// Import from JSON
function importItems(file) {
    const reader = new FileReader();
    reader.onload = e => {
        try {
            const imported = JSON.parse(e.target.result);
            if (Array.isArray(imported)) {
                const importedAt = Date.now();
                const importedItems = imported.map((item, index) => {
                    const addedDate = new Date(item.added);
                    const added = Number.isNaN(addedDate.getTime()) ? new Date(importedAt + index) : addedDate;
                    const sellBy = item.sellBy ? new Date(item.sellBy) : null;
                    return {
                        ...item,
                        id: item.id ?? importedAt + index,
                        owner: isKnownOwner(item.owner) ? item.owner : 'shared',
                        category: categories.some(category => category.id === item.category)
                            ? item.category
                            : UNCATEGORIZED_ID,
                        added,
                        sellBy: sellBy && !Number.isNaN(sellBy.getTime()) ? sellBy : null,
                        date: new Date(added.getTime() + EXPIRY_DURATION_MS)
                    };
                });
                items = [...items, ...importedItems];
                saveItems();
                renderItems();
                renderQuickAdd();
                alert('Items imported successfully!');
            } else {
                alert('Invalid data format.');
            }
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
