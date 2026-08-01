"use client";

import Image from "next/image";
import { FormEvent, useEffect, useState } from "react";
import { ArrowRight, MailCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { publicBasePath } from "@/lib/supabase/config";
import { isSupabaseConfigured } from "@/lib/supabase/client";

function getAuthErrorMessage(error: string | null) {
  return error === "expired_link"
    ? "That sign-in link has expired. Request a new one."
    : error
      ? "That sign-in link could not be used. Request a new one."
      : "";
}

export default function LoginPage() {
  const router = useRouter();
  const { status, sendMagicLink } = useAuth();
  const [email, setEmail] = useState("");
  const [isSent, setIsSent] = useState(false);
  const [message, setMessage] = useState("");
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    if (status === "signed_in") {
      router.replace("/");
    }

    const timeoutId = window.setTimeout(() => {
      const error = new URLSearchParams(window.location.search).get("error");
      if (error) {
        setMessage(getAuthErrorMessage(error));
      }
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [router, status]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSending(true);
    setMessage("");

    try {
      const result = await sendMagicLink(email);

      if (!result.ok) {
        setMessage(result.message);
        return;
      }

      setIsSent(true);
    } catch {
      setMessage("We could not reach Supabase. Check your connection and try again.");
    } finally {
      setIsSending(false);
    }
  }

  return (
    <main className="hu-auth-page">
      <div className="hu-auth-orbit hu-auth-orbit-one" aria-hidden="true" />
      <div className="hu-auth-orbit hu-auth-orbit-two" aria-hidden="true" />
      <section className="hu-auth-card" aria-labelledby="auth-title">
        <div className="hu-auth-brand-line">
          <Image alt="HeavyUser" height={20} priority src={`${publicBasePath}/heavyuser-logo.png`} width={155} />
          <span>Private workspace</span>
        </div>

        {isSent ? (
          <div className="hu-auth-success">
            <span className="hu-auth-icon"><MailCheck aria-hidden="true" size={20} /></span>
            <span className="hu-auth-eyebrow">Check your email</span>
            <h1 id="auth-title">Your workspace is one click away.</h1>
            <p>We sent a sign-in link to <strong>{email}</strong>. It will open HeavyUser and keep your tasks synced.</p>
            <button className="hu-auth-secondary-button" type="button" onClick={() => { setIsSent(false); setMessage(""); }}>Use a different email</button>
          </div>
        ) : (
          <>
            <span className="hu-auth-eyebrow">A calmer way to start</span>
            <h1 id="auth-title">Make the next important task obvious.</h1>
            <p className="hu-auth-intro">Sign in to keep your tasks with you wherever the workday moves.</p>
            {isSupabaseConfigured() ? (
              <form className="hu-auth-page-form" onSubmit={handleSubmit}>
                <label className="hu-auth-page-label" htmlFor="login-email">Email address</label>
                <input autoComplete="email" autoFocus className="hu-auth-page-input" id="login-email" name="email" placeholder="you@example.com" required type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
                <button className="hu-auth-submit" disabled={isSending} type="submit">
                  {isSending ? "Sending link…" : "Continue with email"}
                  <ArrowRight aria-hidden="true" size={15} />
                </button>
                {message ? <p className="hu-auth-error" role="alert">{message}</p> : null}
                <p className="hu-auth-footnote">New here? Your account is created automatically when you confirm the link.</p>
              </form>
            ) : (
              <p className="hu-auth-error" role="alert">Authentication is not configured for this deployment.</p>
            )}
          </>
        )}

        <div className="hu-auth-footer"><span className="hu-auth-footer-line" />One focused screen for a crowded day<span className="hu-auth-footer-line" /></div>
      </section>
    </main>
  );
}
