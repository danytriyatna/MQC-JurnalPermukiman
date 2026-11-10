"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createClient } from "@/lib/supabase/client";
import { loginSchema, type LoginInput } from "@/lib/validations/auth";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export default function LoginForm() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
    mode: "onBlur",
  });

  const onSubmit = async (values: LoginInput) => {
    setServerError(null);

    try {
      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: values.email,
        password: values.password,
      });

      if (signInError) {
        setServerError("Email atau kata sandi salah.");
        toast.error("Email atau kata sandi salah.");
        return;
      }

      toast.success("Berhasil masuk ke akun staf. Mengalihkan ke dasbor...");
      router.push("/dashboard");
      router.refresh();
    } catch {
      setServerError("Email atau kata sandi salah.");
      toast.error("Email atau kata sandi salah.");
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3.5" noValidate>
      <div>
        <label htmlFor="email" className="sr-only">
          Email
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          aria-invalid={errors.email ? "true" : "false"}
          aria-describedby={errors.email ? "email-error" : undefined}
          {...register("email")}
          className={`w-full rounded-full bg-orange-50 px-5 py-3 text-sm text-slate-900 placeholder:text-slate-400 transition-all focus:outline-none focus:ring-2 ${
            errors.email
              ? "border border-rose-300 ring-2 ring-rose-400/50"
              : "focus:ring-orange-400"
          }`}
          placeholder="Email"
        />
        {errors.email && (
          <p id="email-error" role="alert" className="mt-1 px-3 text-xs text-rose-600">
            {errors.email.message}
          </p>
        )}
      </div>

      <div>
        <label htmlFor="password" className="sr-only">
          Kata Sandi
        </label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          aria-invalid={errors.password ? "true" : "false"}
          aria-describedby={errors.password ? "password-error" : undefined}
          {...register("password")}
          className={`w-full rounded-full bg-orange-50 px-5 py-3 text-sm text-slate-900 placeholder:text-slate-400 transition-all focus:outline-none focus:ring-2 ${
            errors.password
              ? "border border-rose-300 ring-2 ring-rose-400/50"
              : "focus:ring-orange-400"
          }`}
          placeholder="Kata Sandi"
        />
        {errors.password && (
          <p id="password-error" role="alert" className="mt-1 px-3 text-xs text-rose-600">
            {errors.password.message}
          </p>
        )}
      </div>

      {serverError && (
        <div
          role="alert"
          className="alert-anim rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-center text-xs font-medium text-rose-700"
        >
          {serverError}
        </div>
      )}

      <Button
        type="submit"
        disabled={isSubmitting}
        className="mt-1 h-auto rounded-full bg-gradient-to-r from-orange-500 to-rose-500 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-orange-500/30 transition-[filter,transform] duration-150 hover:brightness-105 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isSubmitting ? (
          <span className="flex items-center gap-2">
            <svg
              className="h-4 w-4 animate-spin text-white"
              fill="none"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
              />
            </svg>
            <span>Memproses...</span>
          </span>
        ) : (
          "Masuk"
        )}
      </Button>

      <p className="mt-1 text-center text-xs text-slate-400">
        Lupa kata sandi? Hubungi admin sekretariat.
      </p>
    </form>
  );
}
