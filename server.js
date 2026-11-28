const express = require('express');
const multer = require('multer');
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const PUBLIC_DIR = path.join(ROOT, 'public');
const SHOP_FILE = path.join(DATA_DIR, 'shop.json');
const PRODUCTS_FILE = path.join(DATA_DIR, 'products.json');
const ORDERS_FILE = path.join(DATA_DIR, 'orders.json');
const PORT = Number(process.env.PORT) || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'emilio2026';

const app = express();

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(PUBLIC_DIR, { extensions: ['html'], maxAge: 0 }));
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

let writeQueue = Promise.resolve();

async function readJson(file, fallback) {
  try {
    const raw = await fs.readFile(file, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === 'ENOENT') {
      await saveJson(file, fallback);
      return fallback;
    }
    throw error;
  }
}

function saveJson(file, data) {
  const operation = writeQueue.then(async () => {
    await fs.mkdir(path.dirname(file), { recursive: true });
    const temp = `${file}.${process.pid}.tmp`;
    await fs.writeFile(temp, JSON.stringify(data, null, 2), 'utf8');
    await fs.rename(temp, file);
  });
  writeQueue = operation.catch(() => {});
  return operation;
}

function slugify(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

function asArray(value) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  if (typeof value === 'string') {
    return value.split(',').map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

function normalizeQuantity(value, fallback) {
  const raw = value === undefined ? fallback : value;
  if (raw === '' || raw === null || raw === undefined) return null;
  const number = Number(raw);
  if (!Number.isFinite(number)) return null;
  return Math.max(0, Math.floor(number));
}

function normalizeProduct(body, existing = {}) {
  const quantity = normalizeQuantity(body.quantity, existing.quantity);
  return {
    id: existing.id || body.id || `p-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
    name: String(body.name || existing.name || '').trim(),
    category: String(body.category || existing.category || 'bolsos').trim(),
    price: Number(body.price) || 0,
    oldPrice: body.oldPrice === '' || body.oldPrice === null || body.oldPrice === undefined ? null : Number(body.oldPrice) || null,
    images: asArray(body.images !== undefined ? body.images : existing.images),
    colors: asArray(body.colors !== undefined ? body.colors : existing.colors),
    sizes: asArray(body.sizes !== undefined ? body.sizes : existing.sizes),
    description: String(body.description || existing.description || '').trim(),
    badge: String(body.badge || existing.badge || '').trim(),
    quantity,
    stock: quantity === null
      ? (body.stock === undefined ? existing.stock !== false : Boolean(body.stock))
      : quantity > 0,
    active: body.active === undefined ? existing.active !== false : Boolean(body.active),
    featured: body.featured === undefined ? Boolean(existing.featured) : Boolean(body.featured),
    createdAt: existing.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

function trackedQuantity(product) {
  return normalizeQuantity(product.quantity, undefined);
}

function httpError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

let orderQueue = Promise.resolve();
function withOrderLock(task) {
  const result = orderQueue.then(task);
  orderQueue = result.catch(() => {});
  return result;
}

function getPassword(req) {
  const headerPassword = req.get('x-admin-password');
  if (headerPassword) return headerPassword;
  const authorization = req.get('authorization') || '';
  if (authorization.startsWith('Basic ')) {
    try {
      const decoded = Buffer.from(authorization.slice(6), 'base64').toString('utf8');
      const separator = decoded.indexOf(':');
      return separator >= 0 ? decoded.slice(separator + 1) : '';
    } catch (error) {
      return '';
    }
  }
  return '';
}

function samePassword(candidate) {
  const left = Buffer.from(String(candidate));
  const right = Buffer.from(ADMIN_PASSWORD);
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function requireAdmin(req, res, next) {
  if (!samePassword(getPassword(req))) {
    return res.status(401).json({ error: 'Contraseña incorrecta' });
  }
  next();
}

const storage = multer.diskStorage({
  destination(req, file, callback) {
    const isLogo = req.query.kind === 'logo';
    const directory = path.join(PUBLIC_DIR, isLogo ? 'img/logo' : 'img_productos');
    fs.mkdir(directory, { recursive: true })
      .then(() => callback(null, directory))
      .catch(callback);
  },
  filename(req, file, callback) {
    const extension = path.extname(file.originalname).toLowerCase();
    const base = path.basename(file.originalname, extension)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9-_]/g, '-')
      .slice(0, 40);
    callback(null, `${Date.now()}-${crypto.randomBytes(4).toString('hex')}-${base}${extension}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024, files: 10 },
  fileFilter(req, file, callback) {
    if (/^image\/(png|jpe?g|webp|gif|svg\+xml)$/.test(file.mimetype)) {
      return callback(null, true);
    }
    callback(new Error('Solo se permiten imágenes'));
  }
});

app.get('/api/shop', async (req, res, next) => {
  try {
    res.json(await readJson(SHOP_FILE, {}));
  } catch (error) {
    next(error);
  }
});

app.get('/api/products', async (req, res, next) => {
  try {
    const products = await readJson(PRODUCTS_FILE, []);
    res.json(Array.isArray(products) ? products : []);
  } catch (error) {
    next(error);
  }
});

app.get('/api/categories', async (req, res, next) => {
  try {
    const shop = await readJson(SHOP_FILE, {});
    res.json(Array.isArray(shop.categories) ? shop.categories : []);
  } catch (error) {
    next(error);
  }
});

app.get('/api/admin/check', requireAdmin, (req, res) => {
  res.json({ ok: true });
});

app.put('/api/shop', requireAdmin, async (req, res, next) => {
  try {
    const shop = await readJson(SHOP_FILE, {});
    const updated = { ...shop, ...req.body };
    await saveJson(SHOP_FILE, updated);
    res.json(updated);
  } catch (error) {
    next(error);
  }
});

app.post('/api/categories', requireAdmin, async (req, res, next) => {
  try {
    const shop = await readJson(SHOP_FILE, {});
    const categories = Array.isArray(shop.categories) ? shop.categories : [];
    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'El nombre es obligatorio' });
    const category = {
      id: String(req.body.id || slugify(name) || `cat-${Date.now()}`),
      name,
      icon: String(req.body.icon || '').trim()
    };
    const index = categories.findIndex((item) => item.id === category.id);
    if (index >= 0) categories[index] = category;
    else categories.push(category);
    shop.categories = categories;
    await saveJson(SHOP_FILE, shop);
    res.status(index >= 0 ? 200 : 201).json(category);
  } catch (error) {
    next(error);
  }
});

app.put('/api/categories/:id', requireAdmin, async (req, res, next) => {
  try {
    const shop = await readJson(SHOP_FILE, {});
    const categories = Array.isArray(shop.categories) ? shop.categories : [];
    const index = categories.findIndex((item) => item.id === req.params.id);
    if (index < 0) return res.status(404).json({ error: 'Categoría no encontrada' });
    categories[index] = {
      ...categories[index],
      name: String(req.body.name || categories[index].name).trim(),
      icon: String(req.body.icon || categories[index].icon || '').trim()
    };
    await saveJson(SHOP_FILE, shop);
    res.json(categories[index]);
  } catch (error) {
    next(error);
  }
});

app.delete('/api/categories/:id', requireAdmin, async (req, res, next) => {
  try {
    const shop = await readJson(SHOP_FILE, {});
    shop.categories = (shop.categories || []).filter((item) => item.id !== req.params.id);
    await saveJson(SHOP_FILE, shop);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.post('/api/products', requireAdmin, async (req, res, next) => {
  try {
    const products = await readJson(PRODUCTS_FILE, []);
    const product = normalizeProduct(req.body);
    if (!product.name) return res.status(400).json({ error: 'El nombre es obligatorio' });
    products.unshift(product);
    await saveJson(PRODUCTS_FILE, products);
    res.status(201).json(product);
  } catch (error) {
    next(error);
  }
});

app.put('/api/products/:id', requireAdmin, async (req, res, next) => {
  try {
    const products = await readJson(PRODUCTS_FILE, []);
    const index = products.findIndex((item) => item.id === req.params.id);
    if (index < 0) return res.status(404).json({ error: 'Producto no encontrado' });
    const product = normalizeProduct(req.body, products[index]);
    products[index] = product;
    await saveJson(PRODUCTS_FILE, products);
    res.json(product);
  } catch (error) {
    next(error);
  }
});

app.delete('/api/products/:id', requireAdmin, async (req, res, next) => {
  try {
    const products = await readJson(PRODUCTS_FILE, []);
    const filtered = products.filter((item) => item.id !== req.params.id);
    if (filtered.length === products.length) return res.status(404).json({ error: 'Producto no encontrado' });
    await saveJson(PRODUCTS_FILE, filtered);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.get('/api/orders', requireAdmin, async (req, res, next) => {
  try {
    const orders = await readJson(ORDERS_FILE, []);
    res.json(Array.isArray(orders) ? orders : []);
  } catch (error) {
    next(error);
  }
});

app.post('/api/orders', async (req, res, next) => {
  try {
    const result = await withOrderLock(async () => {
      const orders = await readJson(ORDERS_FILE, []);
      const clientOrderId = String(req.body.clientOrderId || '').trim().slice(0, 100);
      if (clientOrderId) {
        const existing = orders.find((order) => order.clientOrderId === clientOrderId);
        if (existing) return { order: existing, duplicate: true };
      }

      const rawItems = Array.isArray(req.body.items) ? req.body.items : [];
      if (!rawItems.length) throw httpError('El carrito está vacío', 400);

      const products = await readJson(PRODUCTS_FILE, []);
      const items = rawItems.map((raw) => {
        const id = String(raw.id || '');
        const product = products.find((entry) => entry.id === id);
        if (!product) throw httpError(`Producto no encontrado: ${id}`, 400);
        const qty = normalizeQuantity(raw.qty, 0);
        if (qty === null || qty <= 0) throw httpError('Cantidad inválida', 400);
        const available = trackedQuantity(product);
        if (available === null && product.stock === false) {
          throw httpError(`${product.name} está agotado`, 409);
        }
        if (available !== null && available < qty) {
          throw httpError(`Solo quedan ${available} de ${product.name}`, 409);
        }
        if (available !== null) {
          product.quantity = available - qty;
          product.stock = product.quantity > 0;
          product.updatedAt = new Date().toISOString();
        }
        const price = Number(raw.price) || 0;
        return {
          id: product.id,
          name: product.name || String(raw.name || ''),
          color: String(raw.color || ''),
          size: String(raw.size || ''),
          qty,
          price,
          subtotal: Math.round(price * qty * 100) / 100,
          tracked: available !== null
        };
      });

      const order = {
        id: `o-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
        code: `#${String(Date.now()).slice(-6)}`,
        clientOrderId: clientOrderId || null,
        createdAt: new Date().toISOString(),
        items,
        total: Math.round(items.reduce((sum, item) => sum + item.subtotal, 0) * 100) / 100,
        status: 'confirmado',
        stockDeducted: items.some((item) => item.tracked)
      };

      await saveJson(PRODUCTS_FILE, products);
      orders.unshift(order);
      await saveJson(ORDERS_FILE, orders);
      return { order, duplicate: false };
    });
    res.status(result.duplicate ? 200 : 201).json(result);
  } catch (error) {
    next(error);
  }
});

app.post('/api/upload', requireAdmin, upload.array('images', 10), (req, res) => {
  const isLogo = req.query.kind === 'logo';
  const urls = req.files.map((file) => `${isLogo ? '/img/logo' : '/img_productos'}/${file.filename}`);
  res.json({ urls });
});

app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

app.use((error, req, res, next) => {
  if (error.statusCode && error.statusCode < 500) {
    return res.status(error.statusCode).json({ error: error.message });
  }
  console.error(error);
  if (error.statusCode) {
    return res.status(error.statusCode).json({ error: error.message });
  }
  if (error instanceof multer.MulterError) {
    return res.status(400).json({ error: error.message });
  }
  res.status(500).json({ error: 'Error interno del servidor' });
});

app.listen(PORT, () => {
  console.log(`EMILIO BAGS en http://localhost:${PORT}`);
  console.log(`Admin: http://localhost:${PORT}/admin`);
});
