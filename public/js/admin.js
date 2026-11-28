const byId = (id) => document.getElementById(id);

let adminPassword = sessionStorage.getItem('emilio.admin') || '';
let categories = [];
let pendingImages = [];

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[char]);
}

function colorValue(value, fallback) {
  return /^#[0-9a-f]{6}$/i.test(String(value || '')) ? value : fallback;
}

async function api(path, options = {}) {
  const headers = { 'x-admin-password': adminPassword, ...(options.headers || {}) };
  if (options.body && typeof options.body === 'string') headers['Content-Type'] = 'application/json';
  const response = await fetch(path, { ...options, headers });
  if (response.status === 401) {
    showLogin();
    throw new Error('Contraseña incorrecta');
  }
  if (!response.ok) {
    let message = 'No se pudo completar la acción';
    try {
      message = (await response.json()).error || message;
    } catch (error) {
      message = 'No se pudo completar la acción';
    }
    throw new Error(message);
  }
  return response.status === 204 ? null : response.json();
}

function showLogin(message = '') {
  byId('loginView').hidden = false;
  byId('adminView').hidden = true;
  byId('loginError').textContent = message;
}

async function showAdmin() {
  byId('loginView').hidden = true;
  byId('adminView').hidden = false;
  await Promise.all([loadCategories(), loadProducts(), loadOrders(), loadShop()]);
}

function setMessage(id, message) {
  byId(id).textContent = message;
}

async function loadCategories() {
  const response = await fetch('/api/categories');
  categories = await response.json();
  byId('productCategory').innerHTML = categories.length
    ? categories.map((category) => `<option value="${escapeHtml(category.id)}">${escapeHtml(category.name)}</option>`).join('')
    : '<option value="productos">Productos</option>';

  byId('categoryTableBody').innerHTML = categories.length
    ? categories.map((category) => `
        <tr>
          <td>${escapeHtml(category.name)}</td>
          <td>${escapeHtml(category.id)}</td>
          <td><button type="button" data-edit-category="${escapeHtml(category.id)}">Editar</button><button class="danger" type="button" data-delete-category="${escapeHtml(category.id)}">Eliminar</button></td>
        </tr>`).join('')
    : '<tr><td colspan="3">Aún no hay categorías.</td></tr>';
}

async function loadProducts() {
  const products = await api('/api/products');
  byId('productTableBody').innerHTML = products.length
    ? products.map((product) => {
        const qty = product.quantity;
        const amount = qty === null || qty === undefined ? 'Sin límite' : qty;
        const status = product.active === false ? 'Oculto' : qty === 0 || product.stock === false ? 'Agotado' : qty === null || qty === undefined ? 'Visible' : `Stock: ${qty}`;
        return `
        <tr>
          <td><img src="${escapeHtml(product.images && product.images[0] ? product.images[0] : '')}" alt="" /></td>
          <td>${escapeHtml(product.name)}</td>
          <td>${escapeHtml(product.category)}</td>
          <td>S/ ${Number(product.price || 0).toFixed(2)}</td>
          <td>${amount}</td>
          <td>${status}</td>
          <td><button type="button" data-edit-product="${escapeHtml(product.id)}">Editar</button><button class="danger" type="button" data-delete-product="${escapeHtml(product.id)}">Eliminar</button></td>
        </tr>`;
      }).join('')
    : '<tr><td colspan="7">Aún no hay productos.</td></tr>';
}

async function loadOrders() {
  const orders = await api('/api/orders');
  byId('orderTableBody').innerHTML = orders.length
    ? orders.map((order) => {
        const products = (order.items || []).map((item) => `${escapeHtml(item.name)} x${item.qty}`).join(', ');
        const date = new Date(order.createdAt);
        const fecha = Number.isNaN(date.getTime()) ? '' : date.toLocaleString('es-PE');
        return `
        <tr>
          <td>${escapeHtml(order.code || order.id)}</td>
          <td>${escapeHtml(fecha)}</td>
          <td>${products || '-'}</td>
          <td>S/ ${Number(order.total || 0).toFixed(2)}</td>
          <td>${escapeHtml(order.status || 'confirmado')}${order.stockDeducted ? ' · stock descontado' : ''}</td>
        </tr>`;
      }).join('')
    : '<tr><td colspan="5">Aún no hay pedidos.</td></tr>';
}

async function loadShop() {
  const response = await fetch('/api/shop');
  const shop = await response.json();
  const form = byId('shopForm');
  const values = {
    brand: shop.brand || '',
    whatsapp: shop.whatsapp || '',
    currency: shop.currency || 'S/',
    whatsappMessage: shop.whatsappMessage || '',
    heroTitle: shop.heroTitle || '',
    heroText: shop.heroText || '',
    heroEyebrow: shop.heroEyebrow || '',
    heroImage: shop.heroImage || '',
    logo: shop.logo || '',
    topShipping: shop.topShipping || '',
    topPayment: shop.topPayment || '',
    topAttention: shop.topAttention || '',
    cartNote: shop.cartNote || '',
    footerNote: shop.footerNote || '',
    accent: colorValue(shop.colors && shop.colors.accent, '#a8616e'),
    accentDark: colorValue(shop.colors && shop.colors.accentDark, '#8b4a56'),
    cream: colorValue(shop.colors && shop.colors.cream, '#faf6f1'),
    ink: colorValue(shop.colors && shop.colors.ink, '#1f1b18'),
    shippingTitle: shop.benefits && shop.benefits.shipping ? shop.benefits.shipping.title || '' : '',
    shippingText: shop.benefits && shop.benefits.shipping ? shop.benefits.shipping.text || '' : '',
    paymentTitle: shop.benefits && shop.benefits.payment ? shop.benefits.payment.title || '' : '',
    paymentText: shop.benefits && shop.benefits.payment ? shop.benefits.payment.text || '' : '',
    attentionTitle: shop.benefits && shop.benefits.attention ? shop.benefits.attention.title || '' : '',
    attentionText: shop.benefits && shop.benefits.attention ? shop.benefits.attention.text || '' : ''
  };
  Object.entries(values).forEach(([name, value]) => {
    const field = form.elements[name];
    if (field) field.value = value;
  });
}

function renderPreview() {
  byId('imagePreview').innerHTML = pendingImages.map((image, index) => `
    <div><img src="${escapeHtml(image)}" alt="Vista previa ${index + 1}" /><button type="button" data-remove-image="${index}">Quitar</button></div>`).join('');
}

function resetProductForm() {
  const form = byId('productForm');
  form.reset();
  form.elements.id.value = '';
  pendingImages = [];
  byId('productFormTitle').textContent = 'Nuevo producto';
  setMessage('productMessage', '');
  renderPreview();
}

function resetCategoryForm() {
  const form = byId('categoryForm');
  form.reset();
  form.elements.id.value = '';
  byId('categoryFormTitle').textContent = 'Nueva categoría';
  setMessage('categoryMessage', '');
}

async function uploadFiles(files, kind) {
  const data = new FormData();
  Array.from(files).forEach((file) => data.append('images', file));
  const result = await api(`/api/upload?kind=${kind}`, { method: 'POST', body: data });
  return result.urls;
}

async function editProduct(id) {
  const products = await api('/api/products');
  const product = products.find((item) => item.id === id);
  if (!product) return;
  const form = byId('productForm');
  form.elements.id.value = product.id;
  form.elements.name.value = product.name || '';
  form.elements.category.value = product.category || '';
  form.elements.price.value = product.price || 0;
  form.elements.oldPrice.value = product.oldPrice || '';
  form.elements.colors.value = (product.colors || []).join(', ');
  form.elements.sizes.value = (product.sizes || []).join(', ');
  form.elements.badge.value = product.badge || '';
  form.elements.description.value = product.description || '';
  form.elements.quantity.value = product.quantity === null || product.quantity === undefined ? '' : product.quantity;
  form.elements.active.checked = product.active !== false;
  form.elements.featured.checked = Boolean(product.featured);
  pendingImages = [...(product.images || [])];
  byId('productFormTitle').textContent = `Editar: ${product.name}`;
  renderPreview();
  form.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function editCategory(id) {
  const category = categories.find((item) => item.id === id);
  if (!category) return;
  const form = byId('categoryForm');
  form.elements.id.value = category.id;
  form.elements.name.value = category.name;
  form.elements.icon.value = category.icon || '';
  byId('categoryFormTitle').textContent = `Editar: ${category.name}`;
  form.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function bindEvents() {
  byId('loginForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const candidate = byId('passwordInput').value.trim();
    try {
      const response = await fetch('/api/admin/check', { headers: { 'x-admin-password': candidate } });
      if (!response.ok) throw new Error('Contraseña incorrecta');
      adminPassword = candidate;
      sessionStorage.setItem('emilio.admin', candidate);
      byId('passwordInput').value = '';
      await showAdmin();
    } catch (error) {
      showLogin(error.message);
    }
  });

  byId('logoutButton').addEventListener('click', () => {
    adminPassword = '';
    sessionStorage.removeItem('emilio.admin');
    showLogin();
  });

  byId('backToShopButton').addEventListener('click', () => {
    adminPassword = '';
    sessionStorage.removeItem('emilio.admin');
    showLogin();
  });

  document.querySelectorAll('.admin-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.admin-tab').forEach((item) => item.classList.toggle('active', item === tab));
      ['products', 'orders', 'categories', 'shop'].forEach((name) => {
        byId(`tab-${name}`).hidden = name !== tab.dataset.tab;
      });
      if (tab.dataset.tab === 'orders') loadOrders().catch(() => {});
    });
  });

  byId('productImages').addEventListener('change', async (event) => {
    if (!event.target.files.length) return;
    try {
      setMessage('productMessage', 'Subiendo fotos...');
      const urls = await uploadFiles(event.target.files, 'productos');
      pendingImages.push(...urls);
      renderPreview();
      setMessage('productMessage', `${urls.length} foto(s) lista(s). Recuerda guardar el producto.`);
      event.target.value = '';
    } catch (error) {
      setMessage('productMessage', error.message);
    }
  });

  byId('imagePreview').addEventListener('click', (event) => {
    const button = event.target.closest('[data-remove-image]');
    if (!button) return;
    pendingImages.splice(Number(button.dataset.removeImage), 1);
    renderPreview();
  });

  byId('productForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const id = String(data.get('id') || '');
    const body = {
      name: String(data.get('name') || '').trim(),
      category: String(data.get('category') || 'productos'),
      price: data.get('price'),
      oldPrice: data.get('oldPrice'),
      colors: String(data.get('colors') || ''),
      sizes: String(data.get('sizes') || ''),
      badge: String(data.get('badge') || ''),
      description: String(data.get('description') || ''),
      quantity: data.get('quantity'),
      active: data.has('active'),
      featured: data.has('featured'),
      images: pendingImages
    };
    try {
      setMessage('productMessage', 'Guardando...');
      await api(id ? `/api/products/${encodeURIComponent(id)}` : '/api/products', {
        method: id ? 'PUT' : 'POST',
        body: JSON.stringify(body)
      });
      resetProductForm();
      await loadProducts();
      setMessage('productMessage', 'Producto guardado correctamente.');
    } catch (error) {
      setMessage('productMessage', error.message);
    }
  });

  byId('resetProductButton').addEventListener('click', resetProductForm);

  byId('productTableBody').addEventListener('click', async (event) => {
    const edit = event.target.closest('[data-edit-product]');
    if (edit) {
      await editProduct(edit.dataset.editProduct);
      return;
    }
    const remove = event.target.closest('[data-delete-product]');
    if (!remove || !window.confirm('¿Eliminar este producto?')) return;
    try {
      await api(`/api/products/${encodeURIComponent(remove.dataset.deleteProduct)}`, { method: 'DELETE' });
      await loadProducts();
    } catch (error) {
      setMessage('productMessage', error.message);
    }
  });

  byId('categoryForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      setMessage('categoryMessage', 'Guardando...');
      await api('/api/categories', {
        method: 'POST',
        body: JSON.stringify({
          id: String(data.get('id') || ''),
          name: String(data.get('name') || '').trim(),
          icon: String(data.get('icon') || '')
        })
      });
      resetCategoryForm();
      await loadCategories();
      setMessage('categoryMessage', 'Categoría guardada correctamente.');
    } catch (error) {
      setMessage('categoryMessage', error.message);
    }
  });

  byId('resetCategoryButton').addEventListener('click', resetCategoryForm);

  byId('categoryTableBody').addEventListener('click', async (event) => {
    const edit = event.target.closest('[data-edit-category]');
    if (edit) {
      await editCategory(edit.dataset.editCategory);
      return;
    }
    const remove = event.target.closest('[data-delete-category]');
    if (!remove || !window.confirm('¿Eliminar esta categoría?')) return;
    try {
      await api(`/api/categories/${encodeURIComponent(remove.dataset.deleteCategory)}`, { method: 'DELETE' });
      await loadCategories();
    } catch (error) {
      setMessage('categoryMessage', error.message);
    }
  });

  byId('logoUpload').addEventListener('change', async (event) => {
    if (!event.target.files.length) return;
    try {
      const urls = await uploadFiles(event.target.files, 'logo');
      byId('shopForm').elements.logo.value = urls[0];
      setMessage('shopMessage', 'Logo subido. Guarda la configuración.');
      event.target.value = '';
    } catch (error) {
      setMessage('shopMessage', error.message);
    }
  });

  byId('shopForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const value = (name) => String(data.get(name) || '').trim();
    const body = {
      brand: value('brand'),
      whatsapp: value('whatsapp'),
      currency: value('currency'),
      whatsappMessage: value('whatsappMessage'),
      heroTitle: value('heroTitle'),
      heroText: value('heroText'),
      heroEyebrow: value('heroEyebrow'),
      heroImage: value('heroImage'),
      logo: value('logo'),
      topShipping: value('topShipping'),
      topPayment: value('topPayment'),
      topAttention: value('topAttention'),
      cartNote: value('cartNote'),
      footerNote: value('footerNote'),
      colors: {
        accent: value('accent'),
        accentDark: value('accentDark'),
        cream: value('cream'),
        ink: value('ink')
      },
      benefits: {
        shipping: { title: value('shippingTitle'), text: value('shippingText') },
        payment: { title: value('paymentTitle'), text: value('paymentText') },
        attention: { title: value('attentionTitle'), text: value('attentionText') }
      }
    };
    try {
      setMessage('shopMessage', 'Guardando...');
      await api('/api/shop', { method: 'PUT', body: JSON.stringify(body) });
      setMessage('shopMessage', 'Configuración guardada. Recarga la tienda para ver los cambios.');
    } catch (error) {
      setMessage('shopMessage', error.message);
    }
  });
}

async function init() {
  bindEvents();
  if (!adminPassword) {
    showLogin();
    return;
  }
  try {
    await api('/api/admin/check');
    await showAdmin();
  } catch (error) {
    adminPassword = '';
    sessionStorage.removeItem('emilio.admin');
    showLogin();
  }
}

init();
