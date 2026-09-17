import { BrowserRouter, Route, Routes, Navigate, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { BottomNav } from './components/BottomNav';
import { MobileHeader } from './components/MobileHeader';
import { RequireAuth } from './components/RequireAuth';
import { DesktopLayout } from './components/desktop/DesktopLayout';
import { useMediaQuery, DESKTOP_BREAKPOINT } from './lib/useMediaQuery';
import { PageTransition } from './components/PageTransition';
import { SplashScreen } from './components/Loading';
import { WelcomeModal, hasSeenWelcome, markWelcomeSeen } from './components/WelcomeModal';
import { CookieConsent } from './components/CookieConsent';
import { MarketActivityFeed } from './components/MarketActivityFeed';
import { NegotiationCallbacks } from './components/NegotiationCallbacks';
import Home from './pages/Home';
import Login from './pages/Login';
import Register from './pages/Register';
import Otp from './pages/Otp';
import ForgotPassword from './pages/ForgotPassword';
import { ResetPassword } from './pages/ResetPassword';
import OAuthCallback from './pages/OAuthCallback';
import Offers from './pages/Offers';
import OfferDetail from './pages/OfferDetail';
import CreateOffer from './pages/CreateOffer';
import MarketDays from './pages/MarketDays';
import MarketDetail from './pages/MarketDetail';
import SellerDetail from './pages/SellerDetail';
import ChatPage from './pages/ChatPage';
import ConversationsPage from './pages/ConversationsPage';
import Help from './pages/Help';
import NotificationsPage from './pages/NotificationsPage';
import CartPage from './pages/CartPage';
import CheckoutPage from './pages/CheckoutPage';
import Account from './pages/Account';
import AdStudio from './pages/AdStudio';
import { CrowdMarketPage } from './pages/CrowdMarketPage';
import NegotiationPage from './pages/NegotiationPage';
import NegotiationsPage from './pages/NegotiationsPage';
import CategoriesPage from './pages/CategoriesPage';
import OrdersPage from './pages/OrdersPage';
import OrderDetailPage from './pages/OrderDetailPage';
import PayoutsPage from './pages/PayoutsPage';
import ReturnsPage from './pages/ReturnsPage';
import OpsConsolePage from './pages/OpsConsolePage';
import SellerAnalyticsPage from './pages/SellerAnalyticsPage';
import WishlistPage from './pages/WishlistPage';
import SellerOrdersPage from './pages/SellerOrdersPage';
import SellerInventoryPage from './pages/SellerInventoryPage';
import SellerProductDetailPage from './pages/SellerProductDetailPage';
import SellerCrowdPage from './pages/SellerCrowdPage';
import SellerDashboardPage from './pages/SellerDashboardPage';
import SellerStorefrontPage from './pages/SellerStorefrontPage';
import SellerAccountPage from './pages/SellerAccountPage';
import SellerHelpPage from './pages/SellerHelpPage';
import SellerAppearancePage from './pages/SellerAppearancePage';
import { SellerPortalLayout } from './components/seller/SellerPortalLayout';

const AUTH_PATHS = ['/login', '/register', '/otp', '/forgot', '/reset', '/oauth/callback'];

/** True when the current route belongs to the private Seller Centre portal. */
function isPortalPath(pathname: string): boolean {
  return pathname === '/home' || pathname === '/seller' || pathname.startsWith('/seller/');
}

/**
 * Seller Centre routes. All of them get the portal chrome (sidebar + mobile
 * tab bar) from SellerPortalLayout and NO marketplace header/footer. The
 * buyer-facing twins (/chat, /negotiations, /returns, /ads, /payouts,
 * /analytics) live under their own paths in the marketplace route tree.
 */
const PORTAL_ROUTES = (
  <Route path="/seller" element={<RequireAuth><SellerPortalLayout /></RequireAuth>}>
    <Route index element={<Navigate to="/seller/dashboard" replace />} />
    <Route path="dashboard" element={<SellerDashboardPage />} />
    <Route path="orders" element={<SellerOrdersPage />} />
    <Route path="products" element={<SellerInventoryPage />} />
    <Route path="products/new" element={<CreateOffer />} />
    <Route path="products/:offerId" element={<SellerProductDetailPage />} />
    <Route path="crowd" element={<SellerCrowdPage />} />
    <Route path="payouts" element={<PayoutsPage />} />
    <Route path="analytics" element={<SellerAnalyticsPage />} />
    <Route path="returns" element={<ReturnsPage />} />
    <Route path="ads" element={<AdStudio />} />
    <Route path="negotiations" element={<NegotiationsPage base="/seller/negotiations" />} />
    <Route path="negotiations/:id" element={<NegotiationPage />} />
    <Route path="messages" element={<ConversationsPage base="/seller/messages" />} />
    <Route path="messages/:id" element={<ChatPage />} />
    <Route path="notifications" element={<NotificationsPage />} />
    <Route path="storefront" element={<SellerStorefrontPage />} />
    <Route path="account" element={<SellerAccountPage />} />
    <Route path="appearance" element={<SellerAppearancePage />} />
    <Route path="help" element={<SellerHelpPage />} />
  </Route>
);

/** Legacy dashboard alias — redirects into the portal early so no chrome flashes. */
const HOME_REDIRECT = <Route path="/home" element={<Navigate to="/seller/dashboard" replace />} />;

function AppShell() {
  const location = useLocation();
  const isDesktop = useMediaQuery(DESKTOP_BREAKPOINT);
  const isAuth = AUTH_PATHS.includes(location.pathname);
  const portalScreen = isPortalPath(location.pathname);
  const appScreen =
    location.pathname === '/cart' ||
    location.pathname === '/checkout' ||
    location.pathname === '/ops-console' ||
    portalScreen ||
    /^\/orders(?:\/|$)/.test(location.pathname) ||
    /^\/offers\/[^/]+$/.test(location.pathname);
  const checkoutScreen = location.pathname === '/checkout';
  const transitionKey = location.pathname;

  /** Seller Centre tree (desktop) — rendered WITHOUT DesktopLayout chrome. */
  const portalRoutes = (
    <Routes>
      {PORTAL_ROUTES}
      {HOME_REDIRECT}
    </Routes>
  );

  /** Marketplace tree — full buyer chrome (DesktopLayout on desktop). */
  const marketRoutes = (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/offers" element={<Offers />} />
      <Route path="/categories" element={<CategoriesPage />} />
      <Route path="/orders" element={<OrdersPage />} />
      <Route path="/orders/:id" element={<OrderDetailPage />} />
      <Route path="/offers/new" element={<Navigate to="/seller/products/new" replace />} />
      <Route path="/offers/:id" element={<OfferDetail />} />
      <Route path="/market-days" element={<MarketDays />} />
      <Route path="/market-days/:id" element={<MarketDetail />} />
      <Route path="/sellers/:id" element={<SellerDetail />} />
      <Route path="/chat/:id" element={<RequireAuth><ChatPage /></RequireAuth>} />
      <Route path="/chat" element={<RequireAuth><ConversationsPage /></RequireAuth>} />
      <Route path="/help" element={<Help />} />
      <Route path="/notifications" element={<NotificationsPage />} />
      <Route path="/cart" element={<CartPage />} />
      <Route path="/checkout" element={<RequireAuth><CheckoutPage /></RequireAuth>} />
      <Route path="/account" element={<RequireAuth><Account /></RequireAuth>} />
      <Route path="/returns" element={<RequireAuth><ReturnsPage /></RequireAuth>} />
      <Route path="/ops-console" element={<RequireAuth><OpsConsolePage /></RequireAuth>} />
      <Route path="/wishlist" element={<WishlistPage />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/otp" element={<Otp />} />
      <Route path="/forgot" element={<ForgotPassword />} />
      <Route path="/reset" element={<ResetPassword />} />
      <Route path="/oauth/callback" element={<OAuthCallback />} />
      <Route path="/crowd-market" element={<CrowdMarketPage />} />
      <Route path="/negotiations/:id" element={<NegotiationPage />} />
      <Route path="/negotiations" element={<NegotiationsPage />} />
      <Route path="/payouts" element={<Navigate to="/seller/payouts" replace />} />
      <Route path="/analytics" element={<Navigate to="/seller/analytics" replace />} />
      <Route path="/ads" element={<Navigate to="/seller/ads" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );

  const desktop = portalScreen ? (
    <PageTransition locationKey={transitionKey}>{portalRoutes}</PageTransition>
  ) : (
    <DesktopLayout>
      <main className="flex-1 overflow-y-auto">
        <PageTransition locationKey={transitionKey}>{marketRoutes}</PageTransition>
      </main>
    </DesktopLayout>
  );

  const mobile = (
    <div className="flex h-dvh flex-col bg-white">
      {!isAuth && !appScreen && <MobileHeader minimal={false} />}
      <main className="flex-1 overflow-y-auto">
        <PageTransition locationKey={transitionKey}>
          <Routes>
            {PORTAL_ROUTES}
            <Route path="/" element={<Home />} />
            <Route path="/offers" element={<Offers />} />
            <Route path="/categories" element={<CategoriesPage />} />
            <Route path="/orders" element={<OrdersPage />} />
            <Route path="/orders/:id" element={<OrderDetailPage />} />
            <Route path="/offers/new" element={<Navigate to="/seller/products/new" replace />} />
            <Route path="/offers/:id" element={<OfferDetail />} />
            <Route path="/market-days" element={<MarketDays />} />
            <Route path="/market-days/:id" element={<MarketDetail />} />
            <Route path="/sellers/:id" element={<SellerDetail />} />
            <Route path="/chat/:id" element={<RequireAuth><ChatPage /></RequireAuth>} />
            <Route path="/chat" element={<RequireAuth><ConversationsPage /></RequireAuth>} />
            <Route path="/help" element={<Help />} />
            <Route path="/notifications" element={<NotificationsPage />} />
            <Route path="/cart" element={<CartPage />} />
            <Route path="/checkout" element={<RequireAuth><CheckoutPage /></RequireAuth>} />
            <Route path="/account" element={<RequireAuth><Account /></RequireAuth>} />
            <Route path="/returns" element={<RequireAuth><ReturnsPage /></RequireAuth>} />
            <Route path="/ops-console" element={<RequireAuth><OpsConsolePage /></RequireAuth>} />
            <Route path="/wishlist" element={<WishlistPage />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/otp" element={<Otp />} />
            <Route path="/forgot" element={<ForgotPassword />} />
            <Route path="/reset" element={<ResetPassword />} />
            <Route path="/oauth/callback" element={<OAuthCallback />} />
            <Route path="/crowd-market" element={<CrowdMarketPage />} />
            <Route path="/negotiations/:id" element={<NegotiationPage />} />
            <Route path="/negotiations" element={<NegotiationsPage />} />
            {HOME_REDIRECT}
            <Route path="/payouts" element={<Navigate to="/seller/payouts" replace />} />
            <Route path="/analytics" element={<Navigate to="/seller/analytics" replace />} />
            <Route path="/ads" element={<Navigate to="/seller/ads" replace />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </PageTransition>
      </main>
      {!isAuth && !checkoutScreen && !portalScreen && <BottomNav />}
    </div>
  );

  return isDesktop ? desktop : mobile;
}

export function App() {
  const [showSplash, setShowSplash] = useState(true);
  const [showWelcome, setShowWelcome] = useState(() => !hasSeenWelcome());

  const closeWelcome = () => {
    markWelcomeSeen();
    setShowWelcome(false);
  };

  useEffect(() => {
    const t = setTimeout(() => setShowSplash(false), 1400);
    return () => clearTimeout(t);
  }, []);

  return (
    <BrowserRouter>
      {showSplash && <SplashScreen />}
      <AppShell />
      {showWelcome && !showSplash && <WelcomeModal onClose={closeWelcome} />}
      <CookieConsent />
      <MarketActivityFeed />
      <NegotiationCallbacks />
    </BrowserRouter>
  );
}