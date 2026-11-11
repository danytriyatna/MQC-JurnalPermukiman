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

    if (process.env.NEXT_PUBLIC_DEV_MODE === "true") {
      if (email.trim().toLowerCase() === "dany@puskim.pu.go.id" && password === "puskim2026") {
        router.push("/dashboard");
        router.refresh();
        return;
      }
      setError("Email atau kata sandi salah.");
      setIsSubmitting(false);
      return;
    }

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
    <form onSubmit={handleSubmit} className="flex flex-col gap-3.5" noValidate>
      <div className="flex flex-col gap-1">
        <label htmlFor="email" className="text-xs font-semibold text-stone-600">
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
          className="w-full rounded-xl border border-[#DFD9D2] bg-[#FAF8F5] px-4 py-2.5 text-sm text-stone-900 placeholder:text-stone-400 transition-colors focus:border-[#C13D0D] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#C13D0D]"
          placeholder="nama@pu.go.id"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="password" className="text-xs font-semibold text-stone-600">
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
          className="w-full rounded-xl border border-[#DFD9D2] bg-[#FAF8F5] px-4 py-2.5 text-sm text-stone-900 placeholder:text-stone-400 transition-colors focus:border-[#C13D0D] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#C13D0D]"
          placeholder="••••••••"
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
        className="mt-2 rounded-xl bg-gradient-to-r from-[#D14715] to-[#A0320A] px-4 py-3 text-sm font-bold text-white shadow-sm transition-[filter,transform] duration-150 hover:brightness-105 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100"
      >
        {isSubmitting ? "Masuk..." : "Masuk"}
      </button>

      <p className="mt-1 text-center text-xs text-stone-400">
        Lupa kata sandi? Hubungi admin sekretariat.
      </p>
    </form>
  );
}
