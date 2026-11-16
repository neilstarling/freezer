// Freezer Inventory PWA
// Manages freezer items with name, category, expiration date

const ITEMS_KEY = 'freezer-inventory-items';
const CATEGORIES = ['meat', 'vegetables', 'ice-cream', 'bread', 'dessert', 'other'];
const CATEGORY_COLORS = {
    meat: '#dc2626',
    vegetables: '#059669',
    'ice-cream': '#3b82f6',
    bread: '#f59e0b',
    dessert: '#d946ef',
    other: '#6b7280'
};

let items = JSON.parse(localStorage.getItem(ITEMS_KEY)) || [];

// DOM Elements
const itemsList = document.getElementById('items-list');
const expiryStatus = document.getElementById('expiry-status');
const addItemForm = document.getElementById('add-item-form');
const itemName = document.getElementById('item-name');
const itemCategory = document.getElementById('item-category');
const itemDate = document.getElementById('item-date');
const tabAll = document.getElementById('tab-all');
const tabExpired = document.getElementById('tab-expired');
const tabUpcoming = document.getElementById('tab-upcoming');
const navButtons = document.querySelectorAll('.nav-btn');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    renderItems();
    setupEventListeners();
    updateExpiryStatus();
});

// Event Listeners
function setupEventListeners() {
    addItemForm.addEventListener('submit', e => {
        e.preventDefault();
        addItem();
    });
    tabAll.addEventListener('click', () => switchTab('all'));
    tabExpired.addEventListener('click', () => switchTab('expired'));
    tabUpcoming.addEventListener('click', () => switchTab('upcoming'));
    navButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            navButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });
}

// Add Item
function addItem() {
    const name = itemName.value.trim();
    const category = itemCategory.value;
    const date = itemDate.value;
    if (!name || !category || !date) return;

    const item = {
        id: Date.now(),
        name,
        category,
        date: new Date(date),
        added: new Date()
    };
    items.unshift(item);
    saveItems();
    renderItems();
    updateExpiryStatus();
    itemName.value = '';
    itemDate.value = new Date().toISOString().split('T')[0];
}

// Render Items
function renderItems(filter = 'all') {
    const now = new Date();
    let filtered = items;
    if (filter === 'expired') filtered = items.filter(item => item.date < now);
    else if (filter === 'upcoming') filtered = items.filter(item => item.date >= now);

    if (!filtered.length) {
        itemsList.innerHTML = '<p class="empty-state">No items yet. Click "Add Item" to get started.</p>';
        return;
    }
    itemsList.innerHTML = filtered.map(item => {
        const color = CATEGORY_COLORS[item.category] || '#333';
        const isExpired = item.date < now;
        const dateStr = item.date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
        return `
            <div class="item-tile ${isExpired ? 'expired' : ''}" style="--category-color: ${color}" data-id="${item.id}">
                <span class="item-name">${escapeHtml(item.name)}</span>
                <div class="item-meta">
                    <span class="item-date ${isExpired ? 'expired' : ''}">Expires: ${dateStr}</span>
                    <span class="item-date">(${item.category.charAt(0).toUpperCase() + item.category.slice(1)})</span>
                </div>
                <button class="item-delete" data-id="${item.id}" aria-label="Remove ${item.name}">✕</button>
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

// Delete Item
function deleteItem(id) {
    items = items.filter(item => item.id !== id);
    saveItems();
    renderItems();
    updateExpiryStatus();
}

// Switch Tab
function switchTab(filter) {
    tabAll.classList.toggle('active', filter === 'all');
    tabExpired.classList.toggle('active', filter === 'expired');
    tabUpcoming.classList.toggle('active', filter === 'upcoming');
    renderItems(filter);
}

// Update Expiry Status
function updateExpiryStatus() {
    const now = new Date();
    const expired = items.filter(i => i.date < now).length;
    const upcoming = items.filter(i => i.date >= now).length;
    const total = items.length;
    if (total === 0) {
        expiryStatus.innerHTML = '<p class="expiry-empty">No items tracked yet.</p>';
        return;
    }
    expiryStatus.innerHTML = `
        <div class="expiry-section">
            <h3>📅 Expiration Summary</h3>
            <p>Total items: <strong>${total}</strong></p>
            <p>Expired: <strong style="color: #dc2626;">${expired}</strong></p>
            <p>Still good: <strong style="color: #059669;">${upcoming}</strong></p>
        </div>
        ${expired > 0 ? '<p style="color: #dc2626; font-size: 0.9rem; margin: 10px 0;">⚠️ These items have expired! Check them immediately.</p>' : ''}
        ${upcoming <= 3 ? '<p style="color: #f59e0b; font-size: 0.9rem; margin: 10px 0;">⏰ Only ${upcoming} item(s) expiring soon! Use them up.</p>' : ''}
    `;
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
                items = [...new Set([...items, ...imported.map(i => ({ ...i, id: i.id || Date.now() })))];
                saveItems();
                renderItems();
                updateExpiryStatus();
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