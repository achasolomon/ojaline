import { useState } from "react";
import { useNavigate } from "react-router-dom";

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier.trim()) return;
    setSubmitting(true);
    // TODO: call API to send reset code
    navigate("/reset");
  };

  return (
    <div className="flex flex-col h-full bg-white">
      <header className="flex items-center px-4 py-3">
        <button
          onClick={() => navigate(-1)}
          className="p-2 -ml-2 rounded-full hover:bg-neutral-100 transition"
          aria-label="Go back"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-5 h-5"
          >
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
      </header>

      <main className="flex-1 overflow-y-auto px-6 pt-2">
        <h1 className="text-[24px] font-bold mb-1.5">Forgot Password?</h1>
        <p className="text-sm text-neutral-500 mb-6 leading-relaxed">
          Enter your phone number or email and we'll help you reset your
          password.
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-neutral-700">
              Phone Number or Email
            </span>
            <input
              type="text"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="Enter your phone or email"
              className="w-full px-3.5 py-3 border border-border rounded-lg text-base outline-none focus:border-primary transition"
            />
          </label>

          <button
            type="submit"
            disabled={submitting || !identifier.trim()}
            className="w-full py-3.5 bg-primary text-white rounded-xl font-semibold text-[15px] disabled:opacity-50 transition"
          >
            {submitting ? "Sending..." : "Send Reset Code"}
          </button>
        </form>
      </main>
    </div>
  );
}
