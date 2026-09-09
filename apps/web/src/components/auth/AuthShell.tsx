import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { oauthAuthorizeUrl } from '../../lib/api';
import type { IconName } from '../icons';
import { Icon } from '../icons';

interface AuthShellProps {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}

export function AuthShell({ title, subtitle, children, footer }: AuthShellProps) {
  const navigate = useNavigate();
  return (
    <div className="flex min-h-dvh flex-col bg-surface lg:min-h-0">
      <div className="px-2 pt-2 lg:hidden">
        <button
          type="button"
          onClick={() => navigate(-1)}
          aria-label="Go back"
          className="flex h-10 w-10 items-center justify-center rounded-full text-text transition hover:bg-black/5"
        >
          <Icon name="chevronRight" size={20} className="rotate-180" />
        </button>
      </div>

      <div className="mx-auto flex w-full max-w-[400px] flex-1 flex-col justify-center px-6 py-8 lg:py-10">
        <div className="mb-7 flex justify-center">
          <img src="/images/logo_green.png" alt="Kika" className="h-10 w-auto object-contain lg:h-11" />
        </div>

        <h1 className="text-center text-[24px] font-extrabold tracking-tight text-text">{title}</h1>
        {subtitle && (
          <p className="mt-1.5 mb-7 text-center text-sm leading-relaxed text-textSecondary">{subtitle}</p>
        )}

        <div className="flex flex-col gap-4">{children}</div>

        {footer && <div className="mt-6 text-center text-sm text-textSecondary">{footer}</div>}
      </div>
    </div>
  );
}

export function AuthDivider() {
  return (
    <div className="my-4 flex items-center gap-3 text-[11px] font-medium uppercase tracking-wider text-textSecondary">
      <span className="h-px flex-1 bg-border" />
      or
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

export function GoogleAuthButton() {
  return (
    <AuthButton type="button" variant="outline" onClick={() => window.location.assign(oauthAuthorizeUrl('google'))}>
      <GoogleGlyph />
      Continue with Google
    </AuthButton>
  );
}

export function FacebookAuthButton() {
  return (
    <AuthButton type="button" variant="outline" onClick={() => window.location.assign(oauthAuthorizeUrl('facebook'))}>
      <FacebookGlyph />
      Continue with Facebook
    </AuthButton>
  );
}

function GoogleGlyph() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}

function FacebookGlyph() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24">
      <path
        d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047v-2.66c0-3.026 1.791-4.697 4.532-4.697 1.313 0 2.687.236 2.687.236v2.97H15.83c-1.491 0-1.957.932-1.957 1.887v2.264h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"
        fill="#1877F2"
      />
    </svg>
  );
}

interface AuthFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  id?: string;
  label: string;
  leading?: IconName;
  trailing?: ReactNode;
}

export function AuthField({ id, label, leading, trailing, className = '', ...rest }: AuthFieldProps) {
  const baseLeft = leading ? 'left-11' : 'left-4';
  return (
    <div className="relative">
      {leading && (
        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-textSecondary">
          <Icon name={leading} size={18} />
        </span>
      )}
      <input
        id={id}
        placeholder=" "
        className={`peer h-[52px] w-full border border-primary/40 bg-white px-4 text-sm font-medium text-text outline-none transition hover:border-primary/60 focus:border-primary ${
          leading ? 'pl-11' : 'pl-4'
        } ${trailing ? 'pr-12' : 'pr-4'} ${className}`}
        {...rest}
      />
      <label
        htmlFor={id}
        className={`pointer-events-none absolute top-1/2 -translate-y-1/2 text-sm font-medium text-textSecondary transition-all duration-150 peer-focus:top-0 peer-focus:-translate-y-1/2 peer-focus:bg-white peer-focus:px-1.5 peer-focus:text-[11px] peer-focus:font-semibold peer-focus:text-primary peer-[:not(:placeholder-shown)]:top-0 peer-[:not(:placeholder-shown)]:-translate-y-1/2 peer-[:not(:placeholder-shown)]:bg-white peer-[:not(:placeholder-shown)]:px-1.5 peer-[:not(:placeholder-shown)]:text-[11px] peer-[:not(:placeholder-shown)]:font-semibold peer-[:not(:placeholder-shown)]:text-primary ${baseLeft}`}
      >
        {label}
      </label>
      {trailing && <span className="absolute right-2 top-1/2 -translate-y-1/2">{trailing}</span>}
    </div>
  );
}

interface AuthButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'outline';
}

export function AuthButton({ variant = 'primary', className = '', children, ...rest }: AuthButtonProps) {
  const base =
    'flex h-[52px] w-full cursor-pointer items-center justify-center gap-2.5 rounded-2xl text-[15px] font-bold transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60';
  const styles =
    variant === 'primary'
      ? 'bg-primary text-white hover:bg-primary-dark'
      : 'border border-border bg-white text-text hover:bg-surface';
  return (
    <button className={`${base} ${styles} ${className}`} {...rest}>
      {children}
    </button>
  );
}