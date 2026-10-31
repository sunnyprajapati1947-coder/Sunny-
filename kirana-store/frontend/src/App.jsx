import React, { useEffect, Suspense, lazy } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { toggleTheme } from './store.js';
import Layout from './components/Layout.jsx';

const Login = lazy(() => import('./pages/Login.jsx'));
const Dashboard = lazy(() => import('./pages/Dashboard.jsx'));
const POS = lazy(() => import('./pages/POS.jsx'));
const Products = lazy(() => import('./pages/Products.jsx'));
const Inventory = lazy(() => import('./pages/Inventory.jsx'));
const PriceEditor = lazy(() => import('./pages/PriceEditor.jsx'));
const Customers = lazy(() => import('./pages/Customers.jsx'));
const Credit = lazy(() => import('./pages/Credit.jsx'));
const Suppliers = lazy(() => import('./pages/Suppliers.jsx'));
const Reports = lazy(() => import('./pages/Reports.jsx'));
const Offers = lazy(() => import('./pages/Offers.jsx'));
const Labels = lazy(() => import('./pages/Labels.jsx'));
const Admin = lazy(() => import('./pages/Admin.jsx'));
const Settings = lazy(() => import('./pages/Settings.jsx'));
const Notifications = lazy(() => import('./pages/Notifications.jsx'));
const More = lazy(() => import('./pages/More.jsx'));
const Orders = lazy(() => import('./pages/Orders.jsx'));
const Stores = lazy(() => import('./pages/Stores.jsx'));
const Shop = lazy(() => import('./pages/Shop.jsx'));

const Guard = ({ children, roles }) => {
  const user = useSelector((s) => s.auth.user);
  const loc = useLocation();
  if (!user) return <Navigate to="/login" state={{ from: loc.pathname }} replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return children;
};

export default function App() {
  const theme = useSelector((s) => s.ui.theme);
  const dispatch = useDispatch();
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);
  useEffect(() => {
    const h = (e) => { if (e.key === 'F9') { e.preventDefault(); dispatch(toggleTheme()); } };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [dispatch]);

  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center text-slate-500">Loading…</div>}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/shop" element={<Shop />} />
        <Route path="/" element={<Guard><Layout /></Guard>}>
          <Route index element={<Dashboard />} />
          <Route path="pos" element={<POS />} />
          <Route path="products" element={<Guard roles={['admin', 'manager']}><Products /></Guard>} />
          <Route path="inventory" element={<Guard roles={['admin', 'manager']}><Inventory /></Guard>} />
          <Route path="prices" element={<Guard roles={['admin']}><PriceEditor /></Guard>} />
          <Route path="customers" element={<Customers />} />
          <Route path="credit" element={<Credit />} />
          <Route path="suppliers" element={<Guard roles={['admin', 'manager']}><Suppliers /></Guard>} />
          <Route path="reports" element={<Guard roles={['admin', 'manager']}><Reports /></Guard>} />
          <Route path="offers" element={<Guard roles={['admin', 'manager']}><Offers /></Guard>} />
          <Route path="labels" element={<Guard roles={['admin', 'manager']}><Labels /></Guard>} />
          <Route path="admin" element={<Guard roles={['admin']}><Admin /></Guard>} />
          <Route path="orders" element={<Guard roles={['admin', 'manager']}><Orders /></Guard>} />
          <Route path="stores" element={<Guard roles={['admin', 'manager']}><Stores /></Guard>} />
          <Route path="notifications" element={<Notifications />} />
          <Route path="more" element={<More />} />
          <Route path="settings" element={<Settings />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
