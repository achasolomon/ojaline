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

const AUTH_PATHS = ['/login', '/register', '/otp', '/forgot', '/reset', '/oauth/callback'];

function AppShell() {
  const location = useLocation();
  const isDesktop = useMediaQuery(DESKTOP_BREAKPOINT);
  const isAuth = AUTH_PATHS.includes(location.pathname);
  const transitionKey = location.pathname;

  const desktop = (
    <DesktopLayout>
      <main className="flex-1 overflow-y-auto">
        <PageTransition locationKey={transitionKey}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/offers" element={<Offers />} />
            <Route path="/categories" element={<CategoriesPage />} />
            <Route path="/orders" element={<OrdersPage />} />
            <Route path="/offers/new" element={<RequireAuth><CreateOffer /></RequireAuth>} />
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
            <Route path="/ads" element={<RequireAuth><AdStudio /></RequireAuth>} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/otp" element={<Otp />} />
            <Route path="/forgot" element={<ForgotPassword />} />
            <Route path="/reset" element={<ResetPassword />} />
            <Route path="/oauth/callback" element={<OAuthCallback />} />
            <Route path="/crowd-market" element={<CrowdMarketPage />} />
            <Route path="/negotiations/:id" element={<NegotiationPage />} />
            <Route path="/negotiations" element={<NegotiationsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </PageTransition>
      </main>
    </DesktopLayout>
  );

  const mobile = (
    <div className="flex h-dvh flex-col bg-white">
      {!isAuth && <MobileHeader minimal={false} />}
      <main className="flex-1 overflow-y-auto">
        <PageTransition locationKey={transitionKey}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/offers" element={<Offers />} />
            <Route path="/categories" element={<CategoriesPage />} />
            <Route path="/orders" element={<OrdersPage />} />
            <Route path="/offers/new" element={<RequireAuth><CreateOffer /></RequireAuth>} />
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
            <Route path="/ads" element={<RequireAuth><AdStudio /></RequireAuth>} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/otp" element={<Otp />} />
            <Route path="/forgot" element={<ForgotPassword />} />
            <Route path="/reset" element={<ResetPassword />} />
            <Route path="/oauth/callback" element={<OAuthCallback />} />
            <Route path="/crowd-market" element={<CrowdMarketPage />} />
            <Route path="/negotiations/:id" element={<NegotiationPage />} />
            <Route path="/negotiations" element={<NegotiationsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </PageTransition>
      </main>
      {!isAuth && <BottomNav />}
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
