import { configureStore, createSlice } from '@reduxjs/toolkit';

const authSlice = createSlice({
  name: 'auth',
  initialState: { user: JSON.parse(localStorage.getItem('rk_user') || 'null'), token: localStorage.getItem('rk_token') || null },
  reducers: {
    setAuth(state, { payload }) {
      state.user = payload.user; state.token = payload.token;
      localStorage.setItem('rk_token', payload.token); localStorage.setItem('rk_user', JSON.stringify(payload.user));
    },
    logout(state) {
      state.user = null; state.token = null;
      localStorage.removeItem('rk_token'); localStorage.removeItem('rk_user'); sessionStorage.removeItem('rk_price_token');
    },
  },
});

const uiSlice = createSlice({
  name: 'ui',
  initialState: {
    theme: localStorage.getItem('rk_theme') || 'light',
    lang: localStorage.getItem('rk_lang') || 'en',
    storeId: localStorage.getItem('rk_store') || 'main',
    sound: localStorage.getItem('rk_sound') !== 'off',
    toasts: [],
  },
  reducers: {
    toggleTheme(s) { s.theme = s.theme === 'light' ? 'dark' : 'light'; localStorage.setItem('rk_theme', s.theme); },
    setLang(s, { payload }) { s.lang = payload; localStorage.setItem('rk_lang', payload); },
    setStore(s, { payload }) { s.storeId = payload; localStorage.setItem('rk_store', payload); },
    toggleSound(s) { s.sound = !s.sound; localStorage.setItem('rk_sound', s.sound ? 'on' : 'off'); },
    toast(s, { payload }) {
      const id = Date.now() + Math.random();
      s.toasts.push({ id, ...payload });
      setTimeout(() => { s.toasts = s.toasts.filter((t) => t.id !== id); }, 4200);
    },
  },
});

const cartSlice = createSlice({
  name: 'cart',
  initialState: { items: [], customerId: null, customerName: '', coupon: '', billDiscountPct: 0, heldBillId: null, note: '' },
  reducers: {
    addScan(state, { payload }) {
      const { product, price } = payload;
      const ex = state.items.find((i) => i.productId === product._id);
      if (ex) ex.qty = Math.round((ex.qty + 1) * 1000) / 1000;
      else state.items.push({ productId: product._id, name: product.name, barcode: product.barcode, unit: product.unit, qty: 1, price, mrp: product.mrp, gstRate: product.gstRate, stock: product.quantity, discountPct: 0, image: product.image });
    },
    setQty(state, { payload }) {
      const it = state.items.find((i) => i.productId === payload.productId);
      if (it) it.qty = Math.max(0, Math.round(Number(payload.qty) * 1000) / 1000);
      state.items = state.items.filter((i) => i.qty > 0);
    },
    setLineDiscount(state, { payload }) {
      const it = state.items.find((i) => i.productId === payload.productId);
      if (it) it.discountPct = Math.min(90, Math.max(0, Number(payload.discountPct) || 0));
    },
    removeLine(state, { payload }) { state.items = state.items.filter((i) => i.productId !== payload); },
    setCustomer(state, { payload }) { state.customerId = payload?.id || null; state.customerName = payload?.name || ''; },
    setCoupon(state, { payload }) { state.coupon = payload; },
    setBillDiscount(state, { payload }) { state.billDiscountPct = Number(payload) || 0; },
    setNote(state, { payload }) { state.note = payload; },
    loadHeld(state, { payload }) {
      state.items = payload.items || []; state.customerId = payload.customerId || null;
      state.customerName = payload.customerName || ''; state.heldBillId = payload._id; state.coupon = ''; state.billDiscountPct = 0;
    },
    clearCart(state) { Object.assign(state, { items: [], customerId: null, customerName: '', coupon: '', billDiscountPct: 0, heldBillId: null, note: '' }); },
  },
});

export const store = configureStore({ reducer: { auth: authSlice.reducer, ui: uiSlice.reducer, cart: cartSlice.reducer } });
export const { setAuth, logout } = authSlice.actions;
export const { toggleTheme, setLang, setStore, toggleSound, toast } = uiSlice.actions;
export const { addScan, setQty, setLineDiscount, removeLine, setCustomer, setCoupon, setBillDiscount, setNote, loadHeld, clearCart } = cartSlice.actions;
