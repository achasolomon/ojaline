import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";

export default function Otp() {
  const navigate = useNavigate();
  const [digits, setDigits] = useState<string[]>(["", "", "", "", "", ""]);
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
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleVerify = () => {
    navigate("/");
  };

  const handleResend = () => {
    setCountdown(60);
  };

  return (
    <div className="flex flex-col h-full bg-white">
      <button
        className="p-3 self-start"
        onClick={() => navigate(-1)}
      >
        <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
          <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
      </button>

      <div className="flex-1 flex flex-col items-center px-6 pt-2">
        <h1 className="text-[24px] font-bold mb-1.5 text-left w-full">
          Verify Your Number
        </h1>
        <p className="text-sm text-neutral-500 mb-6 text-left w-full">
          Enter the 6-digit code sent to <span className="font-bold">+1 234 567 8900</span>
        </p>

        <div className="flex justify-center gap-2 mb-4">
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
              className="w-11 h-[52px] border border-border rounded-lg text-center text-xl font-bold outline-none focus:border-primary"
            />
          ))}
        </div>

        <button
          onClick={handleVerify}
          className="w-full py-3.5 bg-primary text-white rounded-xl font-semibold text-[15px]"
        >
          Verify
        </button>

        <p className="text-sm text-neutral-500 text-center mt-5">
          Didn't receive the code?{" "}
          <button onClick={handleResend} className="font-semibold text-primary">
            Resend
          </button>
          {countdown > 0 && <span className="ml-1">({countdown}s)</span>}
        </p>
      </div>
    </div>
  );
}
