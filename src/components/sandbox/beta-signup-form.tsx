"use client";

import { useState } from "react";
import { CheckCircle, Loader2 } from "lucide-react";

interface Props {
  heading?: string;
  description?: string;
  className?: string;
}

export function BetaSignupForm({ heading, description, className = "" }: Props) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [hp, setHp] = useState(""); // honeypot — real visitors never fill this
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (status === "loading") return;
    setStatus("loading");
    setError("");
    try {
      const res = await fetch("/api/media-plan-builder/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, hp }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Something went wrong — please try again");
      setStatus("success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong — please try again");
      setStatus("error");
    }
  };

  if (status === "success") {
    return (
      <div className={`rounded-2xl border border-green-200 bg-green-50 p-6 text-center ${className}`}>
        <CheckCircle className="w-8 h-8 text-green-500 mx-auto mb-2" />
        <p className="text-sm font-medium text-green-800">You&apos;re on the list — we&apos;ll be in touch.</p>
      </div>
    );
  }

  return (
    <div className={`rounded-2xl border border-gray-200 bg-white p-6 ${className}`}>
      {heading && <h3 className="text-base font-semibold text-gray-900 mb-1">{heading}</h3>}
      {description && <p className="text-sm text-gray-500 mb-4">{description}</p>}
      <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2">
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Name"
          className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
        <input
          type="email"
          required
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="Email address"
          className="flex-[1.3] border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
        {/* Honeypot field — hidden from real users via CSS, bots that fill every field trip it */}
        <input
          type="text"
          value={hp}
          onChange={e => setHp(e.target.value)}
          tabIndex={-1}
          autoComplete="off"
          className="absolute opacity-0 pointer-events-none w-0 h-0"
          aria-hidden="true"
        />
        <button
          type="submit"
          disabled={status === "loading"}
          className="flex items-center justify-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-60 transition-colors"
        >
          {status === "loading" && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          Join the free beta
        </button>
      </form>
      {status === "error" && <p className="text-xs text-red-600 mt-2">{error}</p>}
    </div>
  );
}
