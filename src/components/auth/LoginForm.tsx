"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      setError("Email atau kata sandi salah.");
      setIsSubmitting(false);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3" noValidate>
      <div>
        <label htmlFor="email" className="sr-only">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-full bg-orange-50 px-5 py-3 text-sm text-slate-900 placeholder:text-slate-400 transition-shadow duration-150 focus:outline-none focus:ring-2 focus:ring-orange-400"
          placeholder="Email"
        />
      </div>

      <div>
        <label htmlFor="password" className="sr-only">
          Kata Sandi
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-full bg-orange-50 px-5 py-3 text-sm text-slate-900 placeholder:text-slate-400 transition-shadow duration-150 focus:outline-none focus:ring-2 focus:ring-orange-400"
          placeholder="Kata Sandi"
        />
      </div>

      {error && (
        <p role="alert" className="alert-anim px-1 text-sm text-rose-600">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={isSubmitting}
        className="mt-2 rounded-full bg-gradient-to-r from-orange-500 to-rose-500 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-orange-500/30 transition-[filter,transform] duration-150 hover:brightness-105 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100"
      >
        {isSubmitting ? "Masuk..." : "Masuk"}
      </button>

      <p className="mt-1 text-center text-xs text-slate-400">
        Lupa kata sandi? Hubungi admin sekretariat.
      </p>
    </form>
  );
}
