import { useState } from "react";
import { useNavigate } from "react-router-dom";

export default function Register() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      alert("Passwords do not match");
      return;
    }
    navigate("/otp");
  };

  return (
    <div className="flex flex-col h-screen bg-white">
      <header className="flex items-center px-4 py-3">
        <button onClick={() => navigate(-1)} className="p-1">
          <svg
            className="w-6 h-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-6 pt-2 pb-8">
        <h1 className="text-[24px] font-bold mb-1.5">Create Your Account</h1>
        <p className="text-sm text-neutral-500 mb-6">
          Join thousands shopping fresh from farms
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <input
            type="text"
            placeholder="Amaka Okafor"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3.5 py-3 border border-border rounded-lg text-base outline-none focus:border-primary transition"
          />
          <input
            type="tel"
            placeholder="+234 803 123 4567"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full px-3.5 py-3 border border-border rounded-lg text-base outline-none focus:border-primary transition"
          />
          <input
            type="email"
            placeholder="amaka@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-3.5 py-3 border border-border rounded-lg text-base outline-none focus:border-primary transition"
          />
          <input
            type="password"
            placeholder="Min. 8 characters"
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-3.5 py-3 border border-border rounded-lg text-base outline-none focus:border-primary transition"
          />
          <input
            type="password"
            placeholder="Re-enter password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="w-full px-3.5 py-3 border border-border rounded-lg text-base outline-none focus:border-primary transition"
          />

          <button
            type="submit"
            className="w-full py-3.5 bg-primary text-white rounded-xl font-semibold text-[15px]"
          >
            Create Account
          </button>
        </form>

        <p className="text-sm text-neutral-500 text-center mt-5">
          Already have an account?{" "}
          <a href="/login" className="text-primary font-medium">
            Log In
          </a>
        </p>
      </div>
    </div>
  );
}
