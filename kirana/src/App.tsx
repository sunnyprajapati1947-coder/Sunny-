import { lazy, Suspense, type ReactNode } from "react";
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import { AppProvider, useApp } from "./context/AppContext";
import { CartProvider } from "./context/CartContext";
import { ConfirmProvider } from "./components/ui/feedback";
import { ToastHost } from "./components/ui/feedback";
import { AppShell } from "./components/layout/AppShell";
import { Spinner } from "./components/ui/button";
import { ErrorBoundary } from "./components/ErrorBoundary";

const HomePage = lazy(() => import("./pages/HomePage"));
const BillingPage = lazy(() => import("./pages/BillingPage"));
const ProductsPage = lazy(() => import("./pages/ProductsPage"));
const ProductFormPage = lazy(() => import("./pages/ProductFormPage"));
const KhataPage = lazy(() => import("./pages/KhataPage"));
const CustomerDetailPage = lazy(() => import("./pages/CustomerDetailPage"));
const ReportsPage = lazy(() => import("./pages/ReportsPage"));
const GstReportPage = lazy(() => import("./pages/GstReportPage"));
const PnlPage = lazy(() => import("./pages/PnlPage"));
const DayClosePage = lazy(() => import("./pages/DayClosePage"));
const InventoryPage = lazy(() => import("./pages/InventoryPage"));
const StockAuditPage = lazy(() => import("./pages/StockAuditPage"));
const OrderListPage = lazy(() => import("./pages/OrderListPage"));
const PurchasesPage = lazy(() => import("./pages/PurchasesPage"));
const PurchaseFormPage = lazy(() => import("./pages/PurchaseFormPage"));
const BillsPage = lazy(() => import("./pages/BillsPage"));
const BillDetailPage = lazy(() => import("./pages/BillDetailPage"));
const SettingsPage = lazy(() => import("./pages/ShopSettingsPage"));
const AuditLogPage = lazy(() => import("./pages/AuditLogPage"));
const MorePage = lazy(() => import("./pages/MorePage"));
const LoginPage = lazy(() => import("./pages/LoginPage"));

export default function App() {
  return (
    <AppProvider>
      <ConfirmProvider>
        <CartProvider>
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
          <ToastHost />
        </CartProvider>
      </ConfirmProvider>
    </AppProvider>
  );
}

function AppRoutes() {
  const { ready, needsAuth, bootError } = useApp();
  const location = useLocation();

  if (!ready) {
    return (
      <div className="flex min-h-full items-center justify-center bg-[#f6f4ee] dark:bg-ink-950">
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-brand-700 font-display text-2xl font-extrabold text-white">
            दो
          </div>
          <Spinner className="text-brand-700" />
          <p className="text-sm font-semibold text-ink-500">
            Dukaan khul rahi hai…
          </p>
        </div>
      </div>
    );
  }

  if (needsAuth && location.pathname !== "/login") {
    return <Navigate to="/login" replace />;
  }

  if (bootError) {
    return (
      <div className="mx-auto max-w-md px-5 py-12 text-center">
        <p className="text-lg font-bold text-red-600">App start nahi hui</p>
        <p className="mt-2 text-sm text-ink-600">{bootError}</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-4 rounded-2xl bg-brand-700 px-5 py-3 font-semibold text-white"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#f6f4ee] dark:bg-ink-950">
          <Spinner className="text-brand-700" />
        </div>
      }
    >
      <Routes>
        <Route
          path="/login"
          element={
            <ErrorBoundary context="Login">
              <LoginPage />
            </ErrorBoundary>
          }
        />
        <Route
          path="/*"
          element={
            <AppShell>
              <ScreenBoundary>
                <Routes>
                  <Route path="/" element={<HomePage />} />
                  <Route path="/billing" element={<BillingPage />} />
                  <Route path="/products" element={<ProductsPage />} />
                  <Route path="/products/new" element={<ProductFormPage />} />
                  <Route path="/products/:id" element={<ProductFormPage />} />
                  <Route path="/khata" element={<KhataPage />} />
                  <Route path="/khata/:id" element={<CustomerDetailPage />} />
                  <Route path="/reports" element={<ReportsPage />} />
                  <Route path="/reports/gst" element={<GstReportPage />} />
                  <Route path="/reports/pnl" element={<PnlPage />} />
                  <Route path="/reports/day-close" element={<DayClosePage />} />
                  <Route path="/inventory" element={<InventoryPage />} />
                  <Route path="/inventory/audit" element={<StockAuditPage />} />
                  <Route path="/order-list" element={<OrderListPage />} />
                  <Route path="/purchases" element={<PurchasesPage />} />
                  <Route path="/purchases/new" element={<PurchaseFormPage />} />
                  <Route path="/bills" element={<BillsPage />} />
                  <Route path="/bills/:id" element={<BillDetailPage />} />
                  <Route path="/settings" element={<SettingsPage />} />
                  <Route path="/settings/audit" element={<AuditLogPage />} />
                  <Route path="/more" element={<MorePage />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </ScreenBoundary>
            </AppShell>
          }
        />
      </Routes>
    </Suspense>
  );
}

/**
 * Resets the error boundary when the shopkeeper navigates away, so a broken
 * report does not trap them on the crash screen.
 */
function ScreenBoundary({ children }: { children: ReactNode }) {
  const location = useLocation();
  return (
    <ErrorBoundary key={location.pathname} context={location.pathname}>
      {children}
    </ErrorBoundary>
  );
}
