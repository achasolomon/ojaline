import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../icons';
import { getCartCount, subscribeCart } from '../../lib/cart';
import { getUnreadCount, subscribeNotifications } from '../../lib/notifications';
import { isLoggedIn, AUTH_EVENT, getUser } from '../../lib/session';

export function DesktopHeader() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [cartCount, setCartCount] = useState(() => getCartCount());
  const [unreadCount, setUnreadCount] = useState(() => getUnreadCount());
  const [authed, setAuthed] = useState(() => isLoggedIn());
  const [userName, setUserName] = useState(() => getUser()?.full_name?.split(' ')[0] ?? '');

  useEffect(() => {
    const unsubCart = subscribeCart((items) => setCartCount(items.reduce((s, i) => s + i.qty, 0)));
    const unsubNotif = subscribeNotifications((list) => setUnreadCount(list.filter((n) => !n.read).length));
    const onAuth = () => {
      setAuthed(isLoggedIn());
      setUserName(getUser()?.full_name?.split(' ')[0] ?? '');
    };
    window.addEventListener(AUTH_EVENT, onAuth);
    return () => {
      unsubCart();
      unsubNotif();
      window.removeEventListener(AUTH_EVENT, onAuth);
    };
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) navigate(`/offers?q=${encodeURIComponent(searchQuery.trim())}`);
  };

  return (
    <header>
      <div className="h-1 bg-primary" />
      <div className="bg-white border-b border-border">
        <div className="max-w-[1200px] mx-auto h-[74px] grid items-center px-[30px]" style={{ gridTemplateColumns: '205px 190px minmax(300px,1fr) auto', gap: '18px' }}>
          {/* Logo */}
          <a href="/" className="flex items-center no-underline">
            <img src="/images/logo_green.png" alt="Kika" className="h-[38px] w-auto object-contain" />
          </a>

          {/* Location */}
          <div className="text-[11px] text-text-secondary flex items-center gap-1.5">
            <Icon name="pin" size={17} className="text-primary shrink-0" />
            <div>
              Deliver to
              <b className="block text-[13px] text-text mt-0.5 font-semibold">Sabo, Yaba, Lagos</b>
            </div>
          </div>

          {/* Search */}
          <form onSubmit={handleSearch} className="h-[46px] border border-[#dfe5e1] rounded-[9px] flex overflow-hidden bg-[#fafbfa]">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search for produce, sellers, categories..."
              className="flex-1 border-none outline-none px-4 bg-transparent text-[13px] text-text"
            />
            <button type="submit" className="border-none bg-primary text-white px-[23px] font-extrabold text-[13px] cursor-pointer hover:bg-primary-dark transition">
              Search
            </button>
          </form>

          {/* Actions */}
          <div className="flex gap-4 items-center">
            <button type="button" onClick={() => navigate('/offers/new')} className="text-[11px] whitespace-nowrap bg-transparent border-none cursor-pointer text-text hover:text-primary transition flex items-center">
              <Icon name="store" size={16} className="mr-1" />Sell
            </button>
            <button type="button" onClick={() => navigate('/help')} className="text-[11px] whitespace-nowrap bg-transparent border-none cursor-pointer text-text hover:text-primary transition flex items-center">
              <Icon name="help" size={16} className="mr-1" />Help
            </button>
            {authed && (
              <button type="button" onClick={() => navigate('/notifications')} className="relative px-4 py-1.5 text-[11px] whitespace-nowrap bg-transparent border-none cursor-pointer text-text hover:text-primary transition flex items-center">
                <Icon name="bell" size={16} className="mr-1" />Notifications
                {unreadCount > 0 && <sup className="absolute top-0 -right-0.5 bg-[#df3535] text-white rounded-full px-1.5 py-px text-[8px] leading-none not-italic">{unreadCount}</sup>}
              </button>
            )}
            {authed && (
              <button type="button" onClick={() => navigate('/chat')} className="text-[11px] whitespace-nowrap bg-transparent border-none cursor-pointer text-text hover:text-primary transition flex items-center">
                <Icon name="message" size={16} className="mr-1" />Messages
              </button>
            )}
            <button type="button" onClick={() => navigate('/cart')} className="relative px-4 py-1.5 text-[11px] whitespace-nowrap bg-transparent border-none cursor-pointer text-text hover:text-primary transition flex items-center">
              <Icon name="cart" size={16} className="mr-1" />Cart
              {cartCount > 0 && <sup className="absolute top-0 -right-0.5 bg-[#df3535] text-white rounded-full px-1.5 py-px text-[8px] leading-none not-italic">{cartCount}</sup>}
            </button>
            <button
              type="button"
              onClick={() => navigate(authed ? '/account' : '/login')}
              className="text-[11px] whitespace-nowrap bg-transparent border-none cursor-pointer text-text hover:text-primary transition flex items-center"
            >
              <Icon name="user" size={16} className="mr-1" />{authed && userName ? userName : 'Sign in'}
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
