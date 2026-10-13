"use client";

import { useState } from "react";
import { Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { SupportedLanguage } from "@/lib/i18n";
import { dictionaries } from "@/lib/i18n";

export function Login({
  language,
  setLanguage,
  onLogin,
  isLoading,
}: {
  language: SupportedLanguage;
  setLanguage: (language: SupportedLanguage) => void;
  onLogin: (email: string, password: string) => Promise<void>;
  isLoading: boolean;
}) {
  const t = dictionaries[language];
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (!email || !password) {
        setError("Please enter both email and password.");
        setLoading(false);
        return;
      }
      await onLogin(email, password);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Login failed. Please try again."
      );
      setLoading(false);
    }
  }

  if (isLoading) {
    return (
      <main className="grid min-h-dvh place-items-center bg-bg p-4 text-text">
        <p className="text-sm text-muted">Loading...</p>
      </main>
    );
  }

  return (
    <main
      dir={language === "ur" ? "rtl" : "ltr"}
      className="grid min-h-dvh bg-bg p-4 lg:grid-cols-[1fr_520px] lg:p-8"
    >
      <section className="hidden overflow-hidden rounded-[28px] bg-ink p-10 text-white lg:flex lg:flex-col lg:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10">
              <Building2 />
            </span>
            <div>
              <p className="text-sm text-white/70">{t.appName}</p>
              <h1 className="text-3xl font-semibold">{t.role}</h1>
            </div>
          </div>
          <p className="mt-8 max-w-xl text-4xl font-semibold leading-tight">
            {t.loginCopy}
          </p>
        </div>
      </section>
      <section className="flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="space-y-4 p-5 sm:p-7">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted">{t.appName}</p>
                <h2 className="text-2xl font-semibold text-ink">
                  {t.loginTitle}
                </h2>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setLanguage(language === "en" ? "ur" : "en")
                }
              >
                {language === "en" ? t.urdu : "EN"}
              </Button>
            </div>

            <form onSubmit={handleLogin} className="space-y-4">
              <label className="block text-sm font-medium text-text">
                Email
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-2 h-12 w-full rounded-xl border border-border bg-bg px-3 outline-none focus:ring-2 focus:ring-primary/30"
                  placeholder="your@email.com"
                  required
                />
              </label>

              <label className="block text-sm font-medium text-text">
                {t.password}
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-2 h-12 w-full rounded-xl border border-border bg-bg px-3 outline-none focus:ring-2 focus:ring-primary/30"
                  placeholder="••••••••"
                  required
                />
              </label>

              {error && (
                <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                  {error}
                </p>
              )}

              <Button
                type="submit"
                className="h-12 w-full"
                disabled={loading}
              >
                {loading ? "Logging in..." : t.login}
              </Button>
            </form>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
