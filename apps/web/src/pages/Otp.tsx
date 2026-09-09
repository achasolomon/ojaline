import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthShell, AuthButton } from '../components/auth/AuthShell';

export default function Otp() {
  const navigate = useNavigate();
  const [digits, setDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [countdown, setCountdown] = useState(60);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const handleChange = (index: number, value: string) => {
    if (!/^\d?$/.test(value)) return;
    const next = [...digits];
    next[index] = value;
    setDigits(next);
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleVerify = () => {
    navigate('/');
  };

  const handleResend = () => {
    setCountdown(60);
  };

  return (
    <AuthShell
      title="Verify Your Number"
      subtitle={
        <>
          Enter the 6-digit code sent to <b className="font-semibold text-text">+1 234 567 8900</b>
        </>
      }
    >
      <div className="flex justify-center gap-2">
        {digits.map((digit, i) => (
          <input
            key={i}
            ref={(el) => { inputRefs.current[i] = el; }}
            type="text"
            inputMode="numeric"
            maxLength={1}
            value={digit}
            onChange={(e) => handleChange(i, e.target.value)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            className="h-[52px] w-11 border border-border bg-white text-center text-xl font-bold text-text outline-none transition focus:border-primary"
          />
        ))}
      </div>

      <AuthButton type="button" onClick={handleVerify}>Verify</AuthButton>

      <p className="text-center text-sm text-textSecondary">
        Didn&apos;t receive the code?{' '}
        <button
          type="button"
          onClick={handleResend}
          className="cursor-pointer border-none bg-transparent font-semibold text-primary"
        >
          Resend
        </button>
        {countdown > 0 && <span className="ml-1">({countdown}s)</span>}
      </p>
    </AuthShell>
  );
}