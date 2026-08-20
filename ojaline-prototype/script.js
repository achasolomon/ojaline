/**
 * OJALINE — Mobile Marketplace Prototype
 * Vanilla JS · Mock data · Full navigation & interactions
 */

/* ============================================================
   MOCK DATA
   ============================================================ */
const CATEGORIES = [
  { id: 'fruits', name: 'Fruits', count: 124, image: 'https://images.unsplash.com/photo-1619566636858-adf3ef46400b?w=300&q=80' },
  { id: 'vegetables', name: 'Vegetables', count: 189, image: 'https://images.unsplash.com/photo-1597362920023-844f4c841e80?w=300&q=80' },
  { id: 'grains', name: 'Grains', count: 86, image: 'https://images.unsplash.com/photo-1574323347407-f5e1ad6d020b?w=300&q=80' },
  { id: 'tubers', name: 'Tubers', count: 63, image: 'https://images.unsplash.com/photo-1518977676601-b53f82aba655?w=300&q=80' },
  { id: 'proteins', name: 'Proteins', count: 72, image: 'https://images.unsplash.com/photo-1604503468506-a8da13d82791?w=300&q=80' },
  { id: 'oils', name: 'Oils & Spices', count: 54, image: 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=300&q=80' },
  { id: 'dairy', name: 'Dairy', count: 31, image: 'https://images.unsplash.com/photo-1628088062854-d1870b4553da?w=300&q=80' },
  { id: 'other', name: 'Other Products', count: 44, image: 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=300&q=80' }
];

const HOME_CATEGORIES = CATEGORIES.slice(0, 5);

const PRODUCTS = [
  {
    id: 'tomatoes',
    name: 'Fresh Tomatoes',
    seller: 'Adebola Farms',
    sellerId: 'OJ-88321',
    category: 'vegetables',
    price: 1200,
    unit: 'basket (10kg)',
    unitShort: 'kg',
    qtyStep: 10,
    minOrder: 5,
    stock: 120,
    image: 'https://images.unsplash.com/photo-1546470427-e26264be0d40?w=600&q=80',
    type: 'RETAILER',
    desc: 'Fresh, locally grown tomatoes. Perfect for soups, stews and sauces.',
    delivery: ['instant', 'market'],
    shelf: '> 7 days'
  },
  {
    id: 'rice',
    name: 'Local Rice (Ofada)',
    seller: 'Iya Bisi Foods',
    sellerId: 'OJ-77102',
    category: 'grains',
    price: 1550,
    unit: 'bag (20kg)',
    unitShort: 'kg',
    qtyStep: 20,
    minOrder: 20,
    stock: 500,
    image: 'https://images.unsplash.com/photo-1586201375761-83865001e31c?w=600&q=80',
    type: 'WHOLESALER',
    desc: 'Premium Ofada rice, locally milled. Perfect for traditional Nigerian dishes.',
    delivery: ['instant', 'market'],
    shelf: '> 30 days'
  },
  {
    id: 'plantain',
    name: 'Ripe Plantain',
    seller: 'Adebola Farms',
    sellerId: 'OJ-88321',
    category: 'fruits',
    price: 800,
    unit: 'bunch (12pcs)',
    unitShort: 'bunch',
    qtyStep: 1,
    minOrder: 1,
    stock: 80,
    image: 'https://images.unsplash.com/photo-1603833665858-e61d17a86252?w=600&q=80',
    type: 'RETAILER',
    desc: 'Sweet ripe plantains, ready to fry or roast.',
    delivery: ['instant'],
    shelf: '3–5 days'
  },
  {
    id: 'yams',
    name: 'White Yam',
    seller: 'Adebola Farms',
    sellerId: 'OJ-88321',
    category: 'tubers',
    price: 2500,
    unit: 'tuber (5kg)',
    unitShort: 'kg',
    qtyStep: 5,
    minOrder: 5,
    stock: 200,
    image: 'https://images.unsplash.com/photo-1596040033229-a9821ebd058d?w=600&q=80',
    type: 'RETAILER',
    desc: 'Fresh white yam tubers from local farms. Great for pounding or boiling.',
    delivery: ['instant', 'market'],
    shelf: '> 14 days'
  },
  {
    id: 'vegetables',
    name: 'Mixed Vegetables',
    seller: 'Green Valley Farms',
    sellerId: 'OJ-55201',
    category: 'vegetables',
    price: 1500,
    unit: 'basket (3kg)',
    unitShort: 'kg',
    qtyStep: 3,
    minOrder: 3,
    stock: 60,
    image: 'https://images.unsplash.com/photo-1540420773420-3366772f4999?w=600&q=80',
    type: 'RETAILER',
    desc: 'Assorted fresh vegetables including spinach, ugu, and peppers.',
    delivery: ['instant'],
    shelf: '2–4 days'
  },
  {
    id: 'chicken',
    name: 'Live Chicken',
    seller: 'Iya Bisi Foods',
    sellerId: 'OJ-77102',
    category: 'proteins',
    price: 4500,
    unit: 'bird (~1.5kg)',
    unitShort: 'bird',
    qtyStep: 1,
    minOrder: 1,
    stock: 40,
    image: 'https://images.unsplash.com/photo-1548550023-2bdb3c5beed7?w=600&q=80',
    type: 'WHOLESALER',
    desc: 'Healthy free-range chickens, available live or dressed.',
    delivery: ['market'],
    shelf: 'Fresh'
  },
  {
    id: 'oil',
    name: 'Palm Oil',
    seller: 'Iya Bisi Foods',
    sellerId: 'OJ-77102',
    category: 'oils',
    price: 3200,
    unit: 'gallon (5L)',
    unitShort: 'L',
    qtyStep: 5,
    minOrder: 5,
    stock: 100,
    image: 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=600&q=80',
    type: 'WHOLESALER',
    desc: 'Pure red palm oil, traditionally extracted.',
    delivery: ['instant', 'market'],
    shelf: '> 60 days'
  },
  {
    id: 'fruits',
    name: 'Seasonal Fruit Box',
    seller: 'Adebola Farms',
    sellerId: 'OJ-88321',
    category: 'fruits',
    price: 3500,
    unit: 'box (5kg)',
    unitShort: 'kg',
    qtyStep: 5,
    minOrder: 5,
    stock: 30,
    image: 'https://images.unsplash.com/photo-1619566636858-adf3ef46400b?w=600&q=80',
    type: 'RETAILER',
    desc: 'Assorted seasonal fruits including oranges, pineapple, and watermelon.',
    delivery: ['instant'],
    shelf: '5–7 days'
  }
];

const ORDERS = [
  {
    id: 'OJ-2026-0813-0012',
    date: 'Today, 10:32 AM',
    status: 'in-progress',
    total: 44200,
    items: [
      { productId: 'tomatoes', qty: 10, price: 1200 },
      { productId: 'rice', qty: 20, price: 1550 }
    ]
  },
  {
    id: 'OJ-2026-0810-0009',
    date: 'Aug 10, 2026',
    status: 'delivered',
    total: 18500,
    items: [
      { productId: 'plantain', qty: 3, price: 800 },
      { productId: 'vegetables', qty: 3, price: 1500 },
      { productId: 'tomatoes', qty: 10, price: 1200 }
    ]
  },
  {
    id: 'OJ-2026-0808-0007',
    date: 'Aug 8, 2026',
    status: 'delivered',
    total: 27000,
    items: [
      { productId: 'yams', qty: 5, price: 2500 },
      { productId: 'oil', qty: 5, price: 3200 }
    ]
  },
  {
    id: 'OJ-2026-0805-0003',
    date: 'Aug 5, 2026',
    status: 'cancelled',
    total: 12000,
    items: [
      { productId: 'tomatoes', qty: 10, price: 1200 }
    ]
  }
];

/* ============================================================
   STATE
   ============================================================ */
const state = {
  currentScreen: 'splash',
  isAuthenticated: false,
  cart: [],
  currentProduct: null,
  productQty: 10,
  deliveryOption: 'instant',
  paymentMethod: 'paystack',
  stockTimerSeconds: 8 * 60,
  stockTimerInterval: null,
  otpCountdown: 60,
  otpInterval: null,
  editingCart: false,
  orderFilter: 'all'
};

/* ============================================================
   HELPERS
   ============================================================ */
function formatNaira(n) {
  return '₦' + n.toLocaleString('en-NG');
}

function showToast(msg, duration = 2500) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), duration);
}

function getProduct(id) {
  return PRODUCTS.find(p => p.id === id);
}

function saveAuth(val) {
  state.isAuthenticated = val;
  try { localStorage.setItem('ojaline_auth', val ? 'true' : 'false'); } catch (e) {}
}

function loadAuth() {
  try {
    return localStorage.getItem('ojaline_auth') === 'true';
  } catch (e) { return false; }
}

/* ============================================================
   NAVIGATION
   ============================================================ */
const AUTH_SCREENS = ['splash', 'welcome', 'login', 'register', 'otp', 'forgot', 'reset'];
const NO_BOTTOM_NAV = [...AUTH_SCREENS, 'product', 'cart', 'checkout', 'tracking', 'seller'];

function navigate(screenId, options = {}) {
  const prev = document.querySelector('.screen.active');
  const next = document.getElementById('screen-' + screenId);
  if (!next) {
    console.warn('Screen not found:', screenId);
    return;
  }

  if (prev) {
    prev.classList.remove('active');
    if (options.back) prev.classList.add('slide-back');
  }

  next.classList.remove('slide-back');
  next.classList.add('active');
  state.currentScreen = screenId;

  // Bottom nav visibility
  const bottomNav = document.getElementById('bottomNav');
  if (NO_BOTTOM_NAV.includes(screenId)) {
    bottomNav.style.display = 'none';
  } else {
    bottomNav.style.display = 'flex';
    // Update active nav item
    bottomNav.querySelectorAll('.nav-item').forEach(item => {
      item.classList.toggle('active', item.dataset.nav === screenId);
    });
  }

  // Screen-specific init
  if (screenId === 'home') renderHome();
  if (screenId === 'categories') renderCategories();
  if (screenId === 'cart') renderCart();
  if (screenId === 'checkout') renderCheckout();
  if (screenId === 'orders') renderOrders();
  if (screenId === 'tracking') renderTracking();
  if (screenId === 'product' && state.currentProduct) renderProductDetail();

  // Scroll to top
  const scrollEl = next.querySelector('.scroll-content');
  if (scrollEl) scrollEl.scrollTop = 0;
}

/* ============================================================
   RENDER FUNCTIONS
   ============================================================ */
function renderHome() {
  // Categories
  const catEl = document.getElementById('homeCategories');
  catEl.innerHTML = HOME_CATEGORIES.map(c => `
    <button class="cat-chip" data-category="${c.id}">
      <img class="cat-chip-img" src="${c.image}" alt="${c.name}" onerror="this.src='https://via.placeholder.com/56?text=${c.name[0]}'" />
      <span>${c.name}</span>
    </button>
  `).join('');

  catEl.querySelectorAll('.cat-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      navigate('categories');
    });
  });

  // Top picks
  const picksEl = document.getElementById('topPicks');
  const picks = PRODUCTS.slice(0, 6);
  picksEl.innerHTML = picks.map(p => `
    <div class="product-card" data-product="${p.id}">
      <img class="product-card-img" src="${p.image}" alt="${p.name}" onerror="this.src='https://via.placeholder.com/150?text=Product'" />
      <div class="product-card-body">
        <div class="product-card-name">${p.name}</div>
        <div class="product-card-seller">${p.seller}</div>
        <div class="product-card-price">${formatNaira(p.price)}</div>
      </div>
    </div>
  `).join('');

  picksEl.querySelectorAll('.product-card').forEach(card => {
    card.addEventListener('click', () => openProduct(card.dataset.product));
  });
}

function renderCategories() {
  const grid = document.getElementById('categoriesGrid');
  grid.innerHTML = CATEGORIES.map(c => `
    <div class="category-card" data-category="${c.id}">
      <img src="${c.image}" alt="${c.name}" onerror="this.src='https://via.placeholder.com/200x100?text=${c.name}'" />
      <div class="category-card-body">
        <div class="category-card-name">${c.name}</div>
        <div class="category-card-count">${c.count} items</div>
      </div>
    </div>
  `).join('');

  grid.querySelectorAll('.category-card').forEach(card => {
    card.addEventListener('click', () => {
      // Open first product of that category as demo
      const prod = PRODUCTS.find(p => p.category === card.dataset.category) || PRODUCTS[0];
      openProduct(prod.id);
    });
  });

  updateCartBadges();
}

function openProduct(productId) {
  const product = getProduct(productId);
  if (!product) return;
  state.currentProduct = product;
  state.productQty = product.qtyStep;
  navigate('product');
}

function renderProductDetail() {
  const p = state.currentProduct;
  if (!p) return;

  document.getElementById('productMainImg').src = p.image;
  document.getElementById('productMainImg').alt = p.name;
  document.getElementById('productName').textContent = p.name;
  document.getElementById('productSeller').textContent = p.seller;
  document.getElementById('productPrice').textContent = formatNaira(p.price);
  document.getElementById('productUnit').textContent = ' / ' + p.unit;
  document.getElementById('productType').textContent = p.type;
  document.getElementById('productType').className = 'badge ' + (p.type === 'WHOLESALER' ? 'badge-wholesale' : 'badge-retailer');
  document.getElementById('productMin').textContent = p.minOrder + p.unitShort;
  document.getElementById('productStock').textContent = p.stock + p.unitShort;
  document.getElementById('productDesc').textContent = p.desc;
  document.getElementById('qtyValue').textContent = state.productQty + ' ' + p.unitShort;
  document.getElementById('productTag').textContent = 'FRESH';
}

function updateProductQty(delta) {
  const p = state.currentProduct;
  if (!p) return;
  let next = state.productQty + (delta * p.qtyStep);
  if (next < p.qtyStep) next = p.qtyStep;
  if (next > p.stock) next = p.stock;
  state.productQty = next;
  document.getElementById('qtyValue').textContent = next + ' ' + p.unitShort;
}

function addToCart() {
  const p = state.currentProduct;
  if (!p) return;

  const existing = state.cart.find(item => item.productId === p.id);
  if (existing) {
    existing.qty += state.productQty;
  } else {
    state.cart.push({
      productId: p.id,
      qty: state.productQty,
      price: p.price
    });
  }

  updateCartBadges();
  showToast(`${p.name} added to cart`);
}

function updateCartBadges() {
  const count = state.cart.reduce((sum, i) => sum + 1, 0); // item types
  document.querySelectorAll('.cart-badge').forEach(el => {
    el.textContent = count;
    el.style.display = count > 0 ? 'flex' : 'none';
  });
}

function renderCart() {
  const container = document.getElementById('cartItems');
  const empty = document.getElementById('cartEmpty');
  const footer = document.getElementById('cartFooter');
  const action = document.getElementById('cartAction');
  const titleCount = document.getElementById('cartCountTitle');

  titleCount.textContent = `(${state.cart.length})`;

  if (state.cart.length === 0) {
    container.innerHTML = '';
    empty.style.display = 'flex';
    footer.style.display = 'none';
    action.style.display = 'none';
    return;
  }

  empty.style.display = 'none';
  footer.style.display = 'block';
  action.style.display = 'block';

  container.innerHTML = state.cart.map((item, idx) => {
    const p = getProduct(item.productId);
    if (!p) return '';
    const lineTotal = item.qty * (item.price / (p.qtyStep || 1)) * (p.qtyStep === item.qty ? 1 : item.qty / p.qtyStep);
    // Simpler: price is per unit display, compute properly
    const unitPrice = p.price;
    const units = item.qty / p.qtyStep;
    const total = units * unitPrice;

    return `
      <div class="cart-item" data-idx="${idx}">
        <img class="cart-item-img" src="${p.image}" alt="${p.name}" onerror="this.src='https://via.placeholder.com/72'" />
        <div class="cart-item-info">
          <div class="cart-item-name">${p.name}</div>
          <div class="cart-item-seller">by ${p.seller}</div>
          <div class="cart-item-meta">
            <span class="badge ${p.type === 'WHOLESALER' ? 'badge-wholesale' : 'badge-retailer'}">${p.type}</span>
          </div>
          <div class="cart-item-qty-price">${item.qty} ${p.unitShort} × ${formatNaira(p.price)}</div>
          <div class="cart-item-total">${formatNaira(Math.round(item.qty / p.qtyStep * p.price))}</div>
          <div class="cart-item-actions">
            <div class="cart-qty-mini">
              <button data-action="dec" data-idx="${idx}">−</button>
              <span>${item.qty} ${p.unitShort}</span>
              <button data-action="inc" data-idx="${idx}">+</button>
            </div>
            <button class="remove-btn" data-action="remove" data-idx="${idx}">Remove</button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  // Bind cart actions
  container.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.idx);
      const action = btn.dataset.action;
      const item = state.cart[idx];
      const p = getProduct(item.productId);
      if (!p) return;

      if (action === 'inc') {
        item.qty += p.qtyStep;
        if (item.qty > p.stock) item.qty = p.stock;
      } else if (action === 'dec') {
        item.qty -= p.qtyStep;
        if (item.qty < p.qtyStep) {
          state.cart.splice(idx, 1);
        }
      } else if (action === 'remove') {
        state.cart.splice(idx, 1);
      }
      updateCartBadges();
      renderCart();
    });
  });

  updateCartTotals();
}

function getCartSubtotal() {
  return state.cart.reduce((sum, item) => {
    const p = getProduct(item.productId);
    if (!p) return sum;
    return sum + Math.round((item.qty / p.qtyStep) * p.price);
  }, 0);
}

function updateCartTotals() {
  const subtotal = getCartSubtotal();
  const delivery = state.deliveryOption === 'instant' ? 1200 : 500;
  const total = subtotal + delivery;

  const subEl = document.getElementById('cartSubtotal');
  const delEl = document.getElementById('cartDelivery');
  const totEl = document.getElementById('cartTotal');
  if (subEl) subEl.textContent = formatNaira(subtotal);
  if (delEl) delEl.textContent = formatNaira(delivery);
  if (totEl) totEl.textContent = formatNaira(total);
}

function renderCheckout() {
  const subtotal = getCartSubtotal();
  const delivery = state.deliveryOption === 'instant' ? 1200 : 500;
  const total = subtotal + delivery;
  const itemCount = state.cart.length;

  document.getElementById('checkoutItemCount').textContent = itemCount + (itemCount === 1 ? ' item' : ' items');
  document.getElementById('checkoutSubtotal').textContent = formatNaira(subtotal);
  document.getElementById('checkoutTotal').textContent = formatNaira(total);
  document.getElementById('payBtn').textContent = 'Pay ' + formatNaira(total);

  // Start stock hold timer
  startStockTimer();
}

function startStockTimer() {
  if (state.stockTimerInterval) clearInterval(state.stockTimerInterval);
  state.stockTimerSeconds = 8 * 60;

  function tick() {
    const m = Math.floor(state.stockTimerSeconds / 60);
    const s = state.stockTimerSeconds % 60;
    const el = document.getElementById('stockTimer');
    if (el) el.textContent = String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
    if (state.stockTimerSeconds <= 0) {
      clearInterval(state.stockTimerInterval);
      return;
    }
    state.stockTimerSeconds--;
  }
  tick();
  state.stockTimerInterval = setInterval(tick, 1000);
}

function processPayment() {
  const overlay = document.getElementById('paymentOverlay');
  const text = document.getElementById('overlayText');
  overlay.hidden = false;
  text.textContent = 'Processing payment...';

  setTimeout(() => {
    text.textContent = 'Payment Successful!';
    setTimeout(() => {
      overlay.hidden = true;
      // Create order from cart
      const newOrder = {
        id: 'OJ-2026-0813-' + String(Math.floor(Math.random() * 9000) + 1000),
        date: 'Today, ' + new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        status: 'in-progress',
        total: getCartSubtotal() + (state.deliveryOption === 'instant' ? 1200 : 500),
        items: state.cart.map(i => ({ ...i }))
      };
      ORDERS.unshift(newOrder);
      state.cart = [];
      updateCartBadges();
      if (state.stockTimerInterval) clearInterval(state.stockTimerInterval);
      navigate('tracking');
      showToast('Order placed successfully!');
    }, 1200);
  }, 2000);
}

function renderTracking() {
  const order = ORDERS[0];
  if (!order) return;

  document.getElementById('trackOrderId').textContent = 'Order #' + order.id;

  const itemsEl = document.getElementById('trackOrderItems');
  itemsEl.innerHTML = order.items.map(item => {
    const p = getProduct(item.productId);
    if (!p) return '';
    const total = Math.round((item.qty / p.qtyStep) * p.price);
    return `
      <div class="track-item">
        <img src="${p.image}" alt="${p.name}" onerror="this.src='https://via.placeholder.com/48'" />
        <div class="track-item-info">
          <strong>${p.name}</strong>
          <span>${item.qty} ${p.unitShort} · ${p.seller}</span>
        </div>
        <div class="track-item-price">${formatNaira(total)}</div>
      </div>
    `;
  }).join('');
}

function renderOrders() {
  const list = document.getElementById('ordersList');
  let filtered = ORDERS;
  if (state.orderFilter !== 'all') {
    filtered = ORDERS.filter(o => o.status === state.orderFilter);
  }

  if (filtered.length === 0) {
    list.innerHTML = `<div class="empty-state"><h3>No orders found</h3><p>Your ${state.orderFilter} orders will appear here.</p></div>`;
    return;
  }

  list.innerHTML = filtered.map(order => {
    const thumbs = order.items.slice(0, 3).map(item => {
      const p = getProduct(item.productId);
      return p ? `<img src="${p.image}" alt="" onerror="this.src='https://via.placeholder.com/36'" />` : '';
    }).join('');

    const statusLabel = order.status === 'in-progress' ? 'In Progress' :
                        order.status === 'delivered' ? 'Delivered' : 'Cancelled';

    return `
      <div class="order-card" data-order="${order.id}">
        <div class="order-card-top">
          <div>
            <div class="order-card-id">${order.id}</div>
            <div class="order-card-date">${order.date}</div>
          </div>
          <span class="order-status ${order.status}">${statusLabel}</span>
        </div>
        <div class="order-card-bottom">
          <div class="order-card-thumbs">${thumbs}</div>
          <div class="order-card-meta">
            <div class="order-card-total">${formatNaira(order.total)}</div>
            <div class="order-card-count">${order.items.length} item${order.items.length > 1 ? 's' : ''}</div>
          </div>
        </div>
      </div>
    `;
  }).join('');

  list.querySelectorAll('.order-card').forEach(card => {
    card.addEventListener('click', () => {
      // Move this order to top for tracking view
      const idx = ORDERS.findIndex(o => o.id === card.dataset.order);
      if (idx > 0) {
        const [ord] = ORDERS.splice(idx, 1);
        ORDERS.unshift(ord);
      }
      navigate('tracking');
    });
  });
}

/* ============================================================
   AUTH LOGIC
   ============================================================ */
function initAuth() {
  // Login form
  document.getElementById('loginForm').addEventListener('submit', (e) => {
    e.preventDefault();
    saveAuth(true);
    showToast('Welcome back!');
    navigate('home');
  });

  // Register form
  document.getElementById('registerForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const pass = document.getElementById('regPassword').value;
    const confirm = document.getElementById('regConfirm').value;
    if (pass !== confirm) {
      showToast('Passwords do not match');
      return;
    }
    const phone = document.getElementById('regPhone').value;
    document.getElementById('otpPhoneDisplay').textContent = phone || 'your phone number';
    navigate('otp');
    startOtpCountdown();
  });

  // OTP form
  document.getElementById('otpForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const boxes = document.querySelectorAll('.otp-box');
    const code = Array.from(boxes).map(b => b.value).join('');
    if (code.length < 6) {
      showToast('Please enter the 6-digit code');
      return;
    }
    saveAuth(true);
    showToast('Account verified!');
    navigate('home');
  });

  // OTP input auto-advance
  const otpBoxes = document.querySelectorAll('.otp-box');
  otpBoxes.forEach((box, i) => {
    box.addEventListener('input', () => {
      if (box.value && i < otpBoxes.length - 1) otpBoxes[i + 1].focus();
    });
    box.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !box.value && i > 0) otpBoxes[i - 1].focus();
    });
  });

  // Resend OTP
  document.getElementById('resendOtp').addEventListener('click', (e) => {
    e.preventDefault();
    startOtpCountdown();
    showToast('Code resent!');
  });

  // Forgot form
  document.getElementById('forgotForm').addEventListener('submit', (e) => {
    e.preventDefault();
    showToast('Reset code sent!');
    navigate('reset');
  });

  // Reset form
  document.getElementById('resetForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const p1 = document.getElementById('newPassword').value;
    const p2 = document.getElementById('confirmNewPassword').value;
    if (p1 !== p2) {
      showToast('Passwords do not match');
      return;
    }
    showToast('Password reset successfully!');
    navigate('login');
  });

  // Google login (mock)
  document.getElementById('googleLogin').addEventListener('click', () => {
    saveAuth(true);
    showToast('Signed in with Google');
    navigate('home');
  });

  // Logout
  document.getElementById('logoutBtn').addEventListener('click', () => {
    saveAuth(false);
    state.cart = [];
    updateCartBadges();
    navigate('welcome');
    showToast('Logged out');
  });
}

function startOtpCountdown() {
  if (state.otpInterval) clearInterval(state.otpInterval);
  state.otpCountdown = 60;
  const el = document.getElementById('otpCountdown');
  const resend = document.getElementById('resendOtp');
  resend.style.pointerEvents = 'none';
  resend.style.opacity = '0.5';

  function tick() {
    el.textContent = `(${state.otpCountdown}s)`;
    if (state.otpCountdown <= 0) {
      clearInterval(state.otpInterval);
      el.textContent = '';
      resend.style.pointerEvents = '';
      resend.style.opacity = '';
      return;
    }
    state.otpCountdown--;
  }
  tick();
  state.otpInterval = setInterval(tick, 1000);
}

/* ============================================================
   EVENT BINDINGS
   ============================================================ */
function bindEvents() {
  // Global data-nav clicks
  document.addEventListener('click', (e) => {
    const navTarget = e.target.closest('[data-nav]');
    if (navTarget) {
      e.preventDefault();
      const screen = navTarget.dataset.nav;
      navigate(screen);
    }
  });

  // Bottom nav
  document.getElementById('bottomNav').addEventListener('click', (e) => {
    const item = e.target.closest('.nav-item');
    if (item && item.dataset.nav) {
      navigate(item.dataset.nav);
    }
  });

  // Product qty
  document.getElementById('qtyMinus').addEventListener('click', () => updateProductQty(-1));
  document.getElementById('qtyPlus').addEventListener('click', () => updateProductQty(1));
  document.getElementById('addToCartBtn').addEventListener('click', addToCart);

  // Delivery options
  document.querySelectorAll('input[name="delivery"]').forEach(radio => {
    radio.addEventListener('change', () => {
      state.deliveryOption = radio.value;
      document.querySelectorAll('.delivery-options .radio-option').forEach(opt => {
        opt.classList.toggle('selected', opt.querySelector('input').checked);
      });
      updateCartTotals();
    });
  });

  // Payment options
  document.querySelectorAll('input[name="payment"]').forEach(radio => {
    radio.addEventListener('change', () => {
      state.paymentMethod = radio.value;
      document.querySelectorAll('.payment-option').forEach(opt => {
        opt.classList.toggle('selected', opt.querySelector('input').checked);
      });
    });
  });

  // Pay button
  document.getElementById('payBtn').addEventListener('click', processPayment);

  // Order filter tabs
  document.querySelectorAll('.order-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.order-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      state.orderFilter = tab.dataset.filter;
      renderOrders();
    });
  });

  // PoD modal
  document.getElementById('viewPodBtn').addEventListener('click', () => {
    document.getElementById('podModal').hidden = false;
  });
  document.getElementById('closePodModal').addEventListener('click', () => {
    document.getElementById('podModal').hidden = true;
  });
  document.getElementById('podModal').addEventListener('click', (e) => {
    if (e.target.id === 'podModal') e.target.hidden = true;
  });

  // Seller dashboard link
  document.getElementById('goSellerDashboard').addEventListener('click', (e) => {
    e.preventDefault();
    navigate('seller');
  });

  // Home search (visual feedback)
  const searchInput = document.getElementById('homeSearch');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      // Simple visual response — could filter products
      if (searchInput.value.length > 2) {
        // Optional: show filtered results
      }
    });
  }

  // Favorite toggle
  document.getElementById('favoriteBtn')?.addEventListener('click', function () {
    this.classList.toggle('favorited');
    const svg = this.querySelector('svg');
    if (this.classList.contains('favorited')) {
      svg.setAttribute('fill', '#D92D20');
      svg.setAttribute('stroke', '#D92D20');
      showToast('Added to favorites');
    } else {
      svg.setAttribute('fill', 'none');
      svg.setAttribute('stroke', 'currentColor');
      showToast('Removed from favorites');
    }
  });

  // Password toggles
  document.querySelectorAll('.toggle-password').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = btn.parentElement.querySelector('input');
      input.type = input.type === 'password' ? 'text' : 'password';
    });
  });
}

/* ============================================================
   INIT
   ============================================================ */
function init() {
  bindEvents();
  initAuth();

  // Pre-seed cart with sample items matching the design
  state.cart = [
    { productId: 'tomatoes', qty: 10, price: 1200 },
    { productId: 'rice', qty: 20, price: 1550 }
  ];
  updateCartBadges();

  // Check auth state
  state.isAuthenticated = loadAuth();

  // Splash → next
  navigate('splash');
  setTimeout(() => {
    if (state.isAuthenticated) {
      navigate('home');
    } else {
      navigate('welcome');
    }
  }, 1800);
}

// Boot
document.addEventListener('DOMContentLoaded', init);
