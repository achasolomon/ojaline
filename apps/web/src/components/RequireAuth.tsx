import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { isLoggedIn } from '../lib/session';

export function RequireAuth({ children }: { children: ReactNode }) {
  const location = useLocation();
  if (!isLoggedIn()) {
    return <Navigate to="/login" state={{ from: location.pathname + location.search }} replace />;
  }
  return <>{children}</>;
}