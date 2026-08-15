import { colors, type } from '@ojaline/design';
import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import { Landing } from './pages/Landing';
import { Login } from './pages/Login';
import { Offers } from './pages/Offers';

const navStyle = { display: 'flex', gap: '1rem', padding: '1rem 2rem' } as const;
const linkStyle = { color: colors.text, textDecoration: 'none', fontWeight: type.weight.medium } as const;

export function App() {
  return (
    <BrowserRouter>
      <div
        style={{
          minHeight: '100vh',
          backgroundColor: colors.bg,
          color: colors.text,
          fontFamily: type.family,
        }}
      >
        <nav style={navStyle}>
          <Link to="/" style={linkStyle}>Ojaline</Link>
          <Link to="/offers" style={linkStyle}>Offers</Link>
          <Link to="/login" style={linkStyle}>Sign in</Link>
        </nav>
        <main style={{ padding: '2rem' }}>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/offers" element={<Offers />} />
            <Route path="/login" element={<Login />} />
            <Route path="*" element={<p>Page not found</p>} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
