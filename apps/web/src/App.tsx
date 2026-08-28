import { BrowserRouter, Route, Routes, Navigate, useLocation } from 'react-router-dom';
import { BottomNav } from './components/BottomNav';
import { DesktopLayout } from './components/desktop/DesktopLayout';
import { useMediaQuery, DESKTOP_BREAKPOINT } from './lib/useMediaQuery';
import Home from './pages/Home';
import Login from './pages/Login';
import Register from './pages/Register';
import Otp from './pages/Otp';
import ForgotPassword from './pages/ForgotPassword';
import { ResetPassword } from './pages/ResetPassword';
import Offers from './pages/Offers';
import OfferDetail from './pages/OfferDetail';
import CreateOffer from './pages/CreateOffer';
import MarketDays from './pages/MarketDays';
import MarketDetail from './pages/MarketDetail';
import SellerDetail from './pages/SellerDetail';
import ChatPage from './pages/ChatPage';
import ConversationsPage from './pages/ConversationsPage';

const AUTH_PATHS = ['/login', '/register', '/otp', '/forgot', '/reset'];

function AppShell() {
  const location = useLocation();
  const isDesktop = useMediaQuery(DESKTOP_BREAKPOINT);
  const isAuth = AUTH_PATHS.includes(location.pathname);

  if (isDesktop) {
    return (
      <DesktopLayout>
        <main className="flex-1 overflow-y-auto">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/offers" element={<Offers />} />
            <Route path="/offers/new" element={<CreateOffer />} />
            <Route path="/offers/:id" element={<OfferDetail />} />
            <Route path="/market-days" element={<MarketDays />} />
            <Route path="/market-days/:id" element={<MarketDetail />} />
            <Route path="/sellers/:id" element={<SellerDetail />} />
            <Route path="/chat/:id" element={<ChatPage />} />
            <Route path="/chat" element={<ConversationsPage />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/otp" element={<Otp />} />
            <Route path="/forgot" element={<ForgotPassword />} />
            <Route path="/reset" element={<ResetPassword />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </DesktopLayout>
    );
  }

  return (
    <div className="flex h-dvh flex-col bg-white">
      <main className="flex-1 overflow-y-auto">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/offers" element={<Offers />} />
          <Route path="/offers/new" element={<CreateOffer />} />
          <Route path="/offers/:id" element={<OfferDetail />} />
          <Route path="/market-days" element={<MarketDays />} />
          <Route path="/market-days/:id" element={<MarketDetail />} />
          <Route path="/sellers/:id" element={<SellerDetail />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/otp" element={<Otp />} />
          <Route path="/forgot" element={<ForgotPassword />} />
          <Route path="/reset" element={<ResetPassword />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      {!isAuth && <BottomNav />}
    </div>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <AppShell />
    </BrowserRouter>
  );
}
