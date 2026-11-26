const byId = (id) => document.getElementById(id);

const storage = {
  get(key, fallback) {
    try {
      const value = localStorage.getItem(key);
      return value ? JSON.parse(value) : fallback;
    } catch (error) {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      return;
    }
  }
};

const state = {
  shop: {},
  categories: [],
  products: [],
  favorites: new Set(storage.get('emilio.favorites', [])),
  cart: storage.get('emilio.cart', []),
  activeProduct: null,
  filters: {
    category: 'all',
    search: '',
    offers: false,
    available: false,
    favorites: false,
    sort: 'new'
  }
};

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[char]);
}

function money(value) {
  const symbol = state.shop.currency || 'S/';
  const number = Number(value || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${symbol} ${number}`;
}

function categoryName(id) {
  const category = state.categories.find((item) => item.id === id);
  return category ? category.name : 'Productos';
}

function placeholderImage(name) {
  const text = escapeHtml(String(name || 'EMILIO BAGS').slice(0, 22));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="750"><rect width="600" height="750" fill="#f3ebe4"/><rect x="120" y="210" width="360" height="300" rx="28" fill="#e3d1c5"/><path d="M205 260v-40a95 95 0 0 1 190 0v40" fill="none" stroke="#a8616e" stroke-width="18"/><text x="300" y="600" text-anchor="middle" font-family="Georgia,serif" font-size="34" fill="#1f1b18">${text}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function imageOf(product) {
  return product.images && product.images.length ? product.images[0] : placeholderImage(product.name);
}

function whatsappUrl(message) {
  const number = String(state.shop.whatsapp || '51900000000').replace(/\D/g, '');
  const text = encodeURIComponent(message || state.shop.whatsappMessage || `¡Hola ${state.shop.brand || 'EMILIO BAGS'}!`);
  return `https://wa.me/${number}?text=${text}`;
}

function applyShop() {
  const shop = state.shop;
  document.title = `${shop.brand || 'EMILIO BAGS'} | Bolsos y accesorios`;

  if (shop.logo) byId('brandLogo').src = shop.logo;
  if (shop.heroImage) byId('heroImage').src = shop.heroImage;
  if (shop.heroEyebrow) byId('heroEyebrow').textContent = shop.heroEyebrow;
  if (shop.heroTitle) byId('heroTitle').innerHTML = shop.heroTitle;
  if (shop.heroText) byId('heroText').textContent = shop.heroText;
  if (shop.topShipping) byId('topShipping').textContent = shop.topShipping;
  if (shop.topPayment) byId('topPayment').textContent = shop.topPayment;
  if (shop.topAttention) byId('topAttention').textContent = shop.topAttention;
  if (shop.footerNote) byId('footerNote').textContent = shop.footerNote;

  if (shop.benefits) {
    const benefits = [
      ['benefitShippingTitle', 'benefitShippingText', 'shipping'],
      ['benefitPaymentTitle', 'benefitPaymentText', 'payment'],
      ['benefitAttentionTitle', 'benefitAttentionText', 'attention']
    ];
    benefits.forEach(([titleId, textId, key]) => {
      if (!shop.benefits[key]) return;
      if (shop.benefits[key].title) byId(titleId).textContent = shop.benefits[key].title;
      if (shop.benefits[key].text) byId(textId).textContent = shop.benefits[key].text;
    });
  }

  if (shop.colors) {
    if (shop.colors.accent) document.documentElement.style.setProperty('--accent', shop.colors.accent);
    if (shop.colors.accentDark) document.documentElement.style.setProperty('--accent-dark', shop.colors.accentDark);
    if (shop.colors.cream) document.documentElement.style.setProperty('--cream', shop.colors.cream);
    if (shop.colors.ink) document.documentElement.style.setProperty('--ink', shop.colors.ink);
  }

  const heroMessage = shop.whatsappMessage || `¡Hola ${shop.brand || 'EMILIO BAGS'}! Quisiera más información.`;
  byId('heroWhatsapp').href = whatsappUrl(heroMessage);
  byId('helpWhatsapp').href = whatsappUrl(`¡Hola ${shop.brand || 'EMILIO BAGS'}! Necesito ayuda para elegir.`);
  byId('floatWhatsapp').href = whatsappUrl(`¡Hola ${shop.brand || 'EMILIO BAGS'}! Tengo una consulta.`);
  byId('cartNote').textContent = shop.cartNote || 'El envío se cotiza aparte según tu distrito.';
}

function readCategoryFromUrl() {
  const category = new URLSearchParams(location.search).get('cat');
  if (category && state.categories.some((item) => item.id === category)) {
    state.filters.category = category;
  }
}

function writeCategoryToUrl() {
  const url = new URL(location.href);
  if (state.filters.category === 'all') url.searchParams.delete('cat');
  else url.searchParams.set('cat', state.filters.category);
  history.replaceState(null, '', url);
}

function renderCategories() {
  const chip = (id, name, active) => `<button type="button" class="chip ${active ? 'active' : ''}" data-category="${escapeHtml(id)}">${escapeHtml(name)}</button>`;
  const chips = [chip('all', 'Todos', state.filters.category === 'all')];
  state.categories.forEach((category) => {
    chips.push(chip(category.id, category.name, state.filters.category === category.id));
  });
  byId('categoryChips').innerHTML = chips.join('');
}

function filteredProducts() {
  const filters = state.filters;
  const search = filters.search.trim().toLowerCase();

  const list = state.products.filter((product) => {
    if (product.active === false) return false;
    if (filters.category !== 'all' && product.category !== filters.category) return false;
    if (filters.offers && !(product.oldPrice && product.oldPrice > product.price)) return false;
    if (filters.available && product.stock === false) return false;
    if (filters.favorites && !state.favorites.has(product.id)) return false;
    if (search) {
      const haystack = `${product.name} ${product.description || ''} ${categoryName(product.category)}`.toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    return true;
  });

  return list.sort((a, b) => {
    if (filters.sort === 'low') return a.price - b.price;
    if (filters.sort === 'high') return b.price - a.price;
    if (filters.sort === 'name') return String(a.name).localeCompare(String(b.name), 'es');
    return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
  });
}

function renderProducts() {
  const products = filteredProducts();
  byId('resultCount').textContent = `${products.length} ${products.length === 1 ? 'producto' : 'productos'}`;
  byId('emptyState').hidden = products.length > 0;
  byId('productGrid').innerHTML = products.map(productCard).join('');
}

function productCard(product) {
  const image = imageOf(product);
  const hover = product.images && product.images[1] && product.images[1] !== image ? product.images[1] : '';
  const isFavorite = state.favorites.has(product.id);
  const inStock = product.stock !== false;
  const badge = product.badge || (product.oldPrice && product.oldPrice > product.price ? 'Oferta' : '');
  const price = `<strong>${money(product.price)}</strong>${product.oldPrice && product.oldPrice > product.price ? `<s>${money(product.oldPrice)}</s>` : ''}`;
  const variants = [...(product.colors || []), ...(product.sizes || [])].slice(0, 4)
    .map((variant) => `<span class="variant-pill">${escapeHtml(variant)}</span>`).join('');

  return `
    <article class="product-card" data-id="${escapeHtml(product.id)}">
      <div class="product-media">
        <img src="${escapeHtml(image)}" alt="${escapeHtml(product.name)}" loading="lazy" data-open="${escapeHtml(product.id)}" data-main="${escapeHtml(image)}" data-hover="${escapeHtml(hover)}" />
        ${badge ? `<span class="product-badge">${escapeHtml(badge)}</span>` : ''}
        <button type="button" class="fav-button ${isFavorite ? 'active' : ''}" data-fav="${escapeHtml(product.id)}" aria-label="Favorito">${isFavorite ? '♥' : '♡'}</button>
        ${inStock ? '' : '<span class="out-of-stock">Agotado</span>'}
      </div>
      <div class="product-body">
        <span class="product-category">${escapeHtml(categoryName(product.category))}</span>
        <h3 class="product-name">${escapeHtml(product.name)}</h3>
        <div class="product-price">${price}</div>
        ${variants ? `<div class="product-variants">${variants}</div>` : ''}
        <button type="button" class="add-button" data-add="${escapeHtml(product.id)}" ${inStock ? '' : 'disabled'}>${inStock ? 'Agregar a la bolsa' : 'Sin stock'}</button>
      </div>
    </article>`;
}

function toggleFavorite(id) {
  if (state.favorites.has(id)) state.favorites.delete(id);
  else state.favorites.add(id);
  storage.set('emilio.favorites', [...state.favorites]);
  renderProducts();
  renderCart();
}

function openModal(id) {
  const product = state.products.find((item) => item.id === id);
  if (!product) return;

  state.activeProduct = product;
  byId('modalCategory').textContent = categoryName(product.category);
  byId('modalName').textContent = product.name;
  byId('modalPrice').innerHTML = `<strong>${money(product.price)}</strong>${product.oldPrice && product.oldPrice > product.price ? `<s>${money(product.oldPrice)}</s>` : ''}`;
  byId('modalDescription').textContent = product.description || 'Bolso seleccionado por EMILIO BAGS.';

  const images = product.images && product.images.length ? product.images : [imageOf(product)];
  byId('modalGallery').innerHTML = images.map((image, index) => `<img src="${escapeHtml(image)}" alt="${escapeHtml(product.name)} ${index + 1}" />`).join('');

  const colors = product.colors && product.colors.length ? product.colors : ['Estándar'];
  const sizes = product.sizes && product.sizes.length ? product.sizes : ['Única'];
  byId('modalColor').innerHTML = colors.map((item) => `<option value="${escapeHtml(item)}">${escapeHtml(item)}</option>`).join('');
  byId('modalSize').innerHTML = sizes.map((item) => `<option value="${escapeHtml(item)}">${escapeHtml(item)}</option>`).join('');
  byId('modalAdd').disabled = product.stock === false;
  byId('modalAdd').textContent = product.stock === false ? 'Sin stock' : 'Agregar a la bolsa';
  byId('productModal').hidden = false;
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  byId('productModal').hidden = true;
  state.activeProduct = null;
  if (byId('cartDrawer').hidden) document.body.style.overflow = '';
}

function cartKey(item) {
  return `${item.id}::${item.color}::${item.size}`;
}

function addToCart(product, color, size) {
  const key = cartKey({ id: product.id, color, size });
  const existing = state.cart.find((item) => cartKey(item) === key);
  if (existing) existing.qty += 1;
  else {
    state.cart.push({
      id: product.id,
      name: product.name,
      image: imageOf(product),
      price: Number(product.price) || 0,
      color,
      size,
      qty: 1
    });
  }
  storage.set('emilio.cart', state.cart);
  renderCart();
  showToast(`${product.name} agregado a tu bolsa`);
}

function cartTotal() {
  return state.cart.reduce((total, item) => total + item.price * item.qty, 0);
}

function renderCart() {
  const count = state.cart.reduce((sum, item) => sum + item.qty, 0);
  byId('cartCount').textContent = count;
  byId('favoritesCount').textContent = state.favorites.size;
  byId('cartTotal').textContent = money(cartTotal());

  if (!state.cart.length) {
    byId('cartItems').innerHTML = '<p class="cart-empty">Tu bolsa está vacía.</p>';
    byId('checkoutButton').disabled = true;
    return;
  }

  byId('checkoutButton').disabled = false;
  byId('cartItems').innerHTML = state.cart.map((item) => {
    const key = cartKey(item);
    return `
      <div class="cart-item">
        <img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.name)}" />
        <div>
          <h4>${escapeHtml(item.name)}</h4>
          <p>${escapeHtml(item.color)} · ${escapeHtml(item.size)}</p>
          <div class="qty-control">
            <button type="button" data-dec="${escapeHtml(key)}" aria-label="Reducir">−</button>
            <span>${item.qty}</span>
            <button type="button" data-inc="${escapeHtml(key)}" aria-label="Aumentar">+</button>
          </div>
        </div>
        <div>
          <strong>${money(item.price * item.qty)}</strong><br />
          <button type="button" data-remove="${escapeHtml(key)}">Quitar</button>
        </div>
      </div>`;
  }).join('');
}

function openCart() {
  byId('cartDrawer').hidden = false;
  document.body.style.overflow = 'hidden';
}

function closeCart() {
  byId('cartDrawer').hidden = true;
  if (byId('productModal').hidden) document.body.style.overflow = '';
}

function checkout() {
  if (!state.cart.length) return;
  const brand = state.shop.brand || 'EMILIO BAGS';
  const lines = state.cart.map((item) => `• ${item.name} | ${item.color} | ${item.size} | x${item.qty} - ${money(item.price * item.qty)}`);
  const message = `¡Hola ${brand}! Quiero hacer este pedido:\n\n${lines.join('\n')}\n\nTotal: ${money(cartTotal())}\nEnvío a cotizar.`;
  window.open(whatsappUrl(message), '_blank', 'noopener');
}

let toastTimer;
function showToast(message) {
  const toast = byId('toast');
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 2600);
}

function clearFilters() {
  state.filters = { category: 'all', search: '', offers: false, available: false, favorites: false, sort: 'new' };
  byId('searchInput').value = '';
  byId('offersToggle').checked = false;
  byId('availableToggle').checked = false;
  byId('favoritesToggle').checked = false;
  byId('sortSelect').value = 'new';
  writeCategoryToUrl();
  renderCategories();
  renderProducts();
}

function bindEvents() {
  byId('categoryChips').addEventListener('click', (event) => {
    const button = event.target.closest('[data-category]');
    if (!button) return;
    state.filters.category = button.dataset.category;
    writeCategoryToUrl();
    renderCategories();
    renderProducts();
  });

  byId('searchInput').addEventListener('input', (event) => {
    state.filters.search = event.target.value;
    renderProducts();
  });

  byId('offersToggle').addEventListener('change', (event) => {
    state.filters.offers = event.target.checked;
    renderProducts();
  });

  byId('availableToggle').addEventListener('change', (event) => {
    state.filters.available = event.target.checked;
    renderProducts();
  });

  byId('favoritesToggle').addEventListener('change', (event) => {
    state.filters.favorites = event.target.checked;
    renderProducts();
  });

  byId('sortSelect').addEventListener('change', (event) => {
    state.filters.sort = event.target.value;
    renderProducts();
  });

  byId('clearFilters').addEventListener('click', clearFilters);
  byId('emptyClear').addEventListener('click', clearFilters);

  byId('productGrid').addEventListener('click', (event) => {
    const favoriteButton = event.target.closest('[data-fav]');
    if (favoriteButton) {
      toggleFavorite(favoriteButton.dataset.fav);
      return;
    }
    const addButton = event.target.closest('[data-add]');
    if (addButton) {
      const product = state.products.find((item) => item.id === addButton.dataset.add);
      if (product) addToCart(product, (product.colors || ['Estándar'])[0], (product.sizes || ['Única'])[0]);
      return;
    }
    const image = event.target.closest('[data-open]');
    if (image) openModal(image.dataset.open);
  });

  byId('productGrid').addEventListener('mouseover', (event) => {
    const image = event.target.closest('[data-hover]');
    if (image && image.dataset.hover) image.src = image.dataset.hover;
  });

  byId('productGrid').addEventListener('mouseout', (event) => {
    const image = event.target.closest('[data-main]');
    if (image && image.dataset.hover) image.src = image.dataset.main;
  });

  byId('modalAdd').addEventListener('click', () => {
    if (!state.activeProduct) return;
    addToCart(state.activeProduct, byId('modalColor').value || 'Estándar', byId('modalSize').value || 'Única');
    closeModal();
  });

  byId('favoritesNav').addEventListener('click', () => {
    state.filters.favorites = !state.filters.favorites;
    byId('favoritesToggle').checked = state.filters.favorites;
    renderProducts();
    byId('catalogo').scrollIntoView({ behavior: 'smooth' });
  });

  byId('cartNav').addEventListener('click', openCart);
  byId('checkoutButton').addEventListener('click', checkout);

  byId('cartItems').addEventListener('click', (event) => {
    const remove = event.target.closest('[data-remove]');
    if (remove) {
      state.cart = state.cart.filter((item) => cartKey(item) !== remove.dataset.remove);
      storage.set('emilio.cart', state.cart);
      renderCart();
      return;
    }
    const inc = event.target.closest('[data-inc]');
    if (inc) {
      const item = state.cart.find((entry) => cartKey(entry) === inc.dataset.inc);
      if (item) item.qty += 1;
      storage.set('emilio.cart', state.cart);
      renderCart();
      return;
    }
    const dec = event.target.closest('[data-dec]');
    if (dec) {
      const item = state.cart.find((entry) => cartKey(entry) === dec.dataset.dec);
      if (item) item.qty -= 1;
      state.cart = state.cart.filter((item) => item.qty > 0);
      storage.set('emilio.cart', state.cart);
      renderCart();
    }
  });

  document.querySelectorAll('[data-close-modal]').forEach((element) => element.addEventListener('click', closeModal));
  document.querySelectorAll('[data-close-cart]').forEach((element) => element.addEventListener('click', closeCart));

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (!byId('productModal').hidden) closeModal();
    else if (!byId('cartDrawer').hidden) closeCart();
  });

  window.addEventListener('popstate', () => {
    readCategoryFromUrl();
    renderCategories();
    renderProducts();
  });
}

async function init() {
  try {
    const [shopResponse, productsResponse, categoriesResponse] = await Promise.all([
      fetch('/api/shop'),
      fetch('/api/products'),
      fetch('/api/categories')
    ]);
    state.shop = await shopResponse.json();
    state.products = await productsResponse.json();
    state.categories = await categoriesResponse.json();
    readCategoryFromUrl();
    applyShop();
    bindEvents();
    renderCategories();
    renderProducts();
    renderCart();
  } catch (error) {
    byId('resultCount').textContent = 'No se pudo cargar el catálogo.';
    console.error(error);
  }
}

init();
