import { createFileRoute, useNavigate, Navigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQA } from "@/lib/qa/store";
import { useEnvironment } from "@/lib/qa/environment";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { HelpCircle, Eye, EyeOff, ShieldCheck, Loader2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { BrandLogo } from "@/components/qa/BrandLogo";

export function LoginErrorFallback({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="grid min-h-dvh place-items-center bg-slate-950 p-6 text-white">
      <div className="w-full max-w-md rounded-xl border border-white/15 bg-white/5 p-6 shadow-xl">
        <h1 className="text-xl font-semibold">Sign in is temporarily unavailable</h1>
        <p className="mt-2 text-sm text-white/70">
          We hit a problem rendering the login page. Your account and data are safe.
        </p>
        <pre className="mt-3 max-h-32 overflow-auto rounded bg-black/40 p-2 text-xs text-white/60">
          {error?.message ?? "Unknown error"}
        </pre>
        <div className="mt-4 flex gap-2">
          <Button onClick={reset} className="bg-white text-slate-900 hover:bg-white/90">
            Try again
          </Button>
          <Button
            variant="outline"
            className="border-white/30 bg-transparent text-white hover:bg-white/10"
            onClick={() => window.location.reload()}
          >
            Reload
          </Button>
        </div>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/login")({
  component: LoginPage,
  errorComponent: LoginErrorFallback,
});

export function LoginPage() {
  const { currentUser, login, signup } = useQA();
  const { env, ready } = useEnvironment();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [sEmail, setSEmail] = useState("");
  const [sPwd, setSPwd] = useState("");
  const [sPwd2, setSPwd2] = useState("");
  const [showSPwd, setShowSPwd] = useState(false);
  const [showSPwd2, setShowSPwd2] = useState(false);
  const [hint, setHint] = useState<{
    tone: "info" | "warn" | "error";
    title: string;
    body: string;
  } | null>(null);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotBusy, setForgotBusy] = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  const [remember, setRemember] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [signingUp, setSigningUp] = useState(false);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [cooldownUntil, setCooldownUntil] = useState<number>(0);
  const emailRef = useRef<HTMLInputElement>(null);
  const pwdRef = useRef<HTMLInputElement>(null);
  const hintRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("zenwork.rememberEmail");
      if (saved) {
        setEmail(saved);
        setRemember(true);
      }
    } catch {}
  }, []);

  if (currentUser && ready)
    return <Navigate to={env ? "/dashboard" : "/select-environment"} replace />;

  const onLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setHint(null);
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      setHint({ tone: "warn", title: "Enter your email", body: "Email is required to sign in." });
      emailRef.current?.focus();
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setHint({
        tone: "warn",
        title: "Invalid email format",
        body: "Please enter a valid email address.",
      });
      emailRef.current?.focus();
      return;
    }
    if (!password) {
      setHint({
        tone: "warn",
        title: "Enter your password",
        body: "Password is required to sign in.",
      });
      pwdRef.current?.focus();
      return;
    }
    if (password.length > 128) {
      setHint({
        tone: "warn",
        title: "Password too long",
        body: "Passwords are limited to 128 characters.",
      });
      return;
    }
    if (cooldownUntil > Date.now()) {
      const secs = Math.ceil((cooldownUntil - Date.now()) / 1000);
      setHint({
        tone: "error",
        title: "Too many attempts",
        body: `Please wait ${secs}s before trying again.`,
      });
      return;
    }
    setSubmitting(true);
    const r = await login(cleanEmail, password);
    setSubmitting(false);
    if (!r.ok) {
      // Generic message — never disclose whether email or password was wrong (prevents user enumeration)
      const next = failedAttempts + 1;
      setFailedAttempts(next);
      if (next >= 5) {
        setCooldownUntil(Date.now() + 30_000);
        setFailedAttempts(0);
      }
      setHint({
        tone: "error",
        title: "Invalid email or password",
        body:
          next >= 5
            ? "Too many failed attempts. Please wait 30 seconds before trying again or use Forgot password?"
            : "Please try again, or use Forgot password? to email yourself a reset link.",
      });
      toast.error("Invalid email or password. Please try again.");
      // Move focus to hint banner (announces via role=alert) then to invalid field
      setTimeout(() => {
        if (hintRef.current) hintRef.current.focus();
        else pwdRef.current?.focus();
      }, 30);
      return;
    }
    setFailedAttempts(0);
    try {
      if (remember) localStorage.setItem("zenwork.rememberEmail", cleanEmail);
      else localStorage.removeItem("zenwork.rememberEmail");
    } catch {}
    toast.success("Welcome back");
    navigate({ to: env ? "/dashboard" : "/select-environment" });
  };
  const onSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = name.trim();
    const cleanEmail = sEmail.trim().toLowerCase();
    if (!cleanName) return toast.error("Please enter your full name.");
    if (cleanName.length > 100) return toast.error("Name must be 100 characters or fewer.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail))
      return toast.error("Please enter a valid email address.");
    if (sPwd.length < 8) return toast.error("Password must be at least 8 characters.");
    if (sPwd.length > 128) return toast.error("Password must be 128 characters or fewer.");
    if (/\s/.test(sPwd)) return toast.error("Password cannot contain spaces.");
    if (!/[A-Z]/.test(sPwd))
      return toast.error("Password must include at least one uppercase letter.");
    if (!/[a-z]/.test(sPwd))
      return toast.error("Password must include at least one lowercase letter.");
    if (!/[0-9]/.test(sPwd)) return toast.error("Password must include at least one number.");
    if (!/[^A-Za-z0-9]/.test(sPwd))
      return toast.error("Password must include at least one special character.");
    if (sPwd !== sPwd2) return toast.error("Passwords do not match.");
    setSigningUp(true);
    const r = await signup(cleanName, cleanEmail, sPwd);
    setSigningUp(false);
    if (!r.ok) {
      const err = r.error ?? "Could not create account.";
      // Generic message — don't disclose whether the email is already registered
      const msg = /already|registered|exists/i.test(err)
        ? "If that email is available, your account has been created. Otherwise, try signing in or resetting your password."
        : err;
      return toast.error(msg);
    }
    toast.success("Account created — signing you in");
    navigate({ to: env ? "/dashboard" : "/select-environment" });
  };

  const sendReset = async () => {
    const cleanEmail = forgotEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return toast.error("Please enter a valid email address.");
    }
    setForgotBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setForgotBusy(false);
    // Always show generic success — do not leak whether the email exists
    if (error) console.warn("[reset] non-fatal:", error.message);
    toast.success("If an account exists for that email, a reset link is on its way.");
    setForgotOpen(false);
    setForgotEmail("");
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0b0a1f] text-white">
      {/* Animated gradient background */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-32 -left-32 h-[28rem] w-[28rem] rounded-full bg-indigo-500/40 blur-3xl animate-blob" />
        <div className="absolute top-1/3 -right-32 h-[32rem] w-[32rem] rounded-full bg-fuchsia-500/30 blur-3xl animate-blob [animation-delay:2s]" />
        <div className="absolute -bottom-40 left-1/3 h-[30rem] w-[30rem] rounded-full bg-cyan-400/25 blur-3xl animate-blob [animation-delay:4s]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(99,102,241,0.25),transparent_60%)]" />
        <div className="absolute inset-0 opacity-[0.07] [background-image:linear-gradient(rgba(255,255,255,.6)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.6)_1px,transparent_1px)] [background-size:42px_42px]" />
      </div>

      <div className="mx-auto grid min-h-screen w-full max-w-7xl items-center gap-10 px-6 py-10 lg:grid-cols-2 lg:px-12">
        {/* Brand / hero panel */}
        <div className="hidden flex-col justify-between lg:flex animate-fade-in">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-white/10 backdrop-blur ring-1 ring-white/20">
              <BrandLogo className="h-7 w-7" />
            </div>
            <span className="text-xl font-semibold tracking-tight">Zenwork Testing</span>
          </div>
          <div className="space-y-6">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium ring-1 ring-white/15 backdrop-blur">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-300" /> Secure QA workspace
            </div>
            <h1 className="text-4xl font-bold leading-tight md:text-5xl">
              Ship higher-quality
              <br />
              tax forms, faster.
            </h1>
            <p className="max-w-md text-base text-white/70">
              Track 1099, 990, integrations, and online portal testing in one clean workspace built
              for QA teams.
            </p>
            <div className="flex gap-3 text-xs text-white/60">
              <span className="rounded-full bg-white/5 px-3 py-1 ring-1 ring-white/10">
                Real-time sync
              </span>
              <span className="rounded-full bg-white/5 px-3 py-1 ring-1 ring-white/10">
                Role-based access
              </span>
              <span className="rounded-full bg-white/5 px-3 py-1 ring-1 ring-white/10">
                Audit trail
              </span>
            </div>
          </div>
          <p className="text-sm text-white/50">© Zenwork — QA Engineering</p>
        </div>

        {/* Glass login card */}
        <div className="flex items-center justify-center animate-scale-in">
          <Card className="w-full max-w-md border-white/15 bg-white/10 text-white shadow-2xl shadow-indigo-900/40 backdrop-blur-xl">
            <CardHeader>
              <div className="mb-2 flex items-center gap-2 lg:hidden">
                <div className="grid h-9 w-9 place-items-center rounded-xl bg-white/15 ring-1 ring-white/20">
                  <BrandLogo className="h-6 w-6" />
                </div>
                <span className="text-base font-semibold">Zenwork Testing</span>
              </div>
              <CardTitle className="text-2xl text-white">Welcome back</CardTitle>
              <CardDescription className="text-white/70">
                Sign in to access the Zenwork Testing dashboard
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="login">
                <TabsList className="grid w-full grid-cols-2 bg-white/10">
                  <TabsTrigger
                    value="login"
                    className="data-[state=active]:bg-white data-[state=active]:text-slate-900"
                  >
                    Sign in
                  </TabsTrigger>
                  <TabsTrigger
                    value="signup"
                    className="data-[state=active]:bg-white data-[state=active]:text-slate-900"
                  >
                    Create account
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="login">
                  <form onSubmit={onLogin} className="space-y-4 pt-4">
                    <div>
                      <Label htmlFor="email" className="text-white/80">
                        Email
                      </Label>
                      <Input
                        ref={emailRef}
                        id="email"
                        type="email"
                        autoComplete="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        className="border-white/20 bg-white/10 text-white placeholder:text-white/40 focus-visible:ring-white/40"
                        placeholder="you@company.com"
                      />
                    </div>
                    <div>
                      <Label htmlFor="pwd" className="text-white/80">
                        Password
                      </Label>
                      <div className="relative">
                        <Input
                          ref={pwdRef}
                          id="pwd"
                          type={showPwd ? "text" : "password"}
                          autoComplete="current-password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          required
                          className="border-white/20 bg-white/10 pr-10 text-white placeholder:text-white/40 focus-visible:ring-white/40"
                          placeholder="••••••••"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPwd((v) => !v)}
                          aria-label={showPwd ? "Hide password" : "Show password"}
                          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-white/60 hover:bg-white/10 hover:text-white"
                        >
                          {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <label className="flex cursor-pointer items-center gap-2 text-xs text-white/80">
                        <Checkbox
                          checked={remember}
                          onCheckedChange={(v) => setRemember(!!v)}
                          className="border-white/40 data-[state=checked]:bg-white data-[state=checked]:text-slate-900"
                        />
                        Remember me
                      </label>
                      <button
                        type="button"
                        className="text-xs font-medium text-white hover:underline"
                        onClick={() => {
                          if (!forgotEmail) setForgotEmail(email);
                          setForgotOpen((v) => !v);
                        }}
                      >
                        Forgot password?
                      </button>
                    </div>
                    <Button
                      type="submit"
                      disabled={submitting}
                      className="w-full bg-gradient-to-r from-indigo-500 to-fuchsia-500 text-white hover:opacity-95 hover:from-indigo-400 hover:to-fuchsia-400"
                    >
                      {submitting ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Signing in…
                        </>
                      ) : (
                        "Sign in"
                      )}
                    </Button>
                    {hint && (
                      <div
                        ref={hintRef}
                        role="alert"
                        aria-live="assertive"
                        tabIndex={-1}
                        className={
                          "rounded-md border p-3 text-xs " +
                          (hint.tone === "error"
                            ? "border-red-300/40 bg-red-500/15 text-red-100"
                            : hint.tone === "warn"
                              ? "border-amber-300/40 bg-amber-400/15 text-amber-100"
                              : "border-white/30 bg-white/10 text-white")
                        }
                      >
                        <p className="font-medium">{hint.title}</p>
                        <p className="mt-1 opacity-90">{hint.body}</p>
                      </div>
                    )}
                    {forgotOpen && (
                      <div className="rounded-md border border-white/20 bg-white/10 p-3 text-xs space-y-2">
                        <p className="font-medium text-white">Reset by email</p>
                        <p className="text-white/70">
                          We'll email a secure link to set a new password. Works for both Admin and
                          QA Agent accounts.
                        </p>
                        <div className="flex gap-2">
                          <Input
                            type="email"
                            placeholder="you@company.com"
                            value={forgotEmail}
                            onChange={(e) => setForgotEmail(e.target.value)}
                            className="h-9 border-white/20 bg-white/10 text-white placeholder:text-white/40"
                          />
                          <Button
                            type="button"
                            size="sm"
                            onClick={sendReset}
                            disabled={forgotBusy || !forgotEmail}
                          >
                            {forgotBusy ? "Sending…" : "Send link"}
                          </Button>
                        </div>
                      </div>
                    )}
                    <p className="text-center text-xs text-white/60">
                      No account yet? Use <span className="font-medium">Create account</span>.
                    </p>
                    <Accordion type="single" collapsible className="w-full">
                      <AccordionItem value="trouble" className="border-white/15">
                        <AccordionTrigger className="py-2 text-xs text-white/80 hover:no-underline">
                          <span className="flex items-center gap-2">
                            <HelpCircle className="h-3.5 w-3.5" />
                            Can't sign in? Troubleshoot
                          </span>
                        </AccordionTrigger>
                        <AccordionContent className="space-y-3 text-xs text-white/70">
                          <div>
                            <p className="font-medium text-white">"Invalid login credentials"</p>
                            <p>
                              Double-check the email and password. If you're a new user, ask an
                              admin to invite you from{" "}
                              <span className="font-medium">Settings → Team &amp; Roles</span>.
                              Sample-admin credentials, when used, are generated in{" "}
                              <span className="font-medium">Settings → Sample admin</span> and shown
                              only to the signed-in admin.
                            </p>
                          </div>
                          <div>
                            <p className="font-medium text-white">"Your account is inactive"</p>
                            <p>
                              An admin has deactivated your account from{" "}
                              <span className="font-medium">Settings → Team &amp; Roles</span>. Ask
                              an admin to flip your status back to Active.
                            </p>
                          </div>
                          <div>
                            <p className="font-medium text-white">
                              Signed in but can't see admin tools
                            </p>
                            <p>
                              Your account is a QA Agent, not Admin. Ask an existing admin to
                              promote you from{" "}
                              <span className="font-medium">Settings → Team &amp; Roles</span>.
                            </p>
                          </div>
                          <div>
                            <p className="font-medium text-white">No account at all yet</p>
                            <p>
                              Use the <span className="font-medium">Create account</span> tab to
                              register, then ask an admin to grant you access.
                            </p>
                          </div>
                          <div>
                            <p className="font-medium text-white">Forgot your password</p>
                            <p>
                              Use <span className="font-medium">Forgot password?</span> above to
                              email yourself a reset link, or ask an admin to re-invite you from{" "}
                              <span className="font-medium">
                                Settings → Team &amp; Roles → Invite agent
                              </span>{" "}
                              with a fresh password.
                            </p>
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>
                  </form>
                </TabsContent>
                <TabsContent value="signup">
                  <form onSubmit={onSignup} className="space-y-4 pt-4">
                    <div>
                      <Label htmlFor="n" className="text-white/80">
                        Full name
                      </Label>
                      <Input
                        id="n"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        required
                        className="border-white/20 bg-white/10 text-white placeholder:text-white/40"
                      />
                    </div>
                    <div>
                      <Label htmlFor="se" className="text-white/80">
                        Email
                      </Label>
                      <Input
                        id="se"
                        type="email"
                        value={sEmail}
                        onChange={(e) => setSEmail(e.target.value)}
                        required
                        className="border-white/20 bg-white/10 text-white placeholder:text-white/40"
                      />
                    </div>
                    <div>
                      <Label htmlFor="sp" className="text-white/80">
                        Password
                      </Label>
                      <div className="relative">
                        <Input
                          id="sp"
                          type={showSPwd ? "text" : "password"}
                          autoComplete="new-password"
                          value={sPwd}
                          onChange={(e) => setSPwd(e.target.value)}
                          required
                          minLength={8}
                          maxLength={128}
                          className="border-white/20 bg-white/10 pr-10 text-white placeholder:text-white/40"
                        />
                        <button
                          type="button"
                          onClick={() => setShowSPwd((v) => !v)}
                          aria-label={showSPwd ? "Hide password" : "Show password"}
                          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-white/60 hover:bg-white/10 hover:text-white"
                        >
                          {showSPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                      <p className="mt-1 text-[10px] text-white/50">
                        Min 8 chars with uppercase, lowercase, number, and special character. No
                        spaces.
                      </p>
                    </div>
                    <div>
                      <Label htmlFor="sp2" className="text-white/80">
                        Confirm password
                      </Label>
                      <div className="relative">
                        <Input
                          id="sp2"
                          type={showSPwd2 ? "text" : "password"}
                          autoComplete="new-password"
                          value={sPwd2}
                          onChange={(e) => setSPwd2(e.target.value)}
                          required
                          minLength={8}
                          maxLength={128}
                          className="border-white/20 bg-white/10 pr-10 text-white placeholder:text-white/40"
                        />
                        <button
                          type="button"
                          onClick={() => setShowSPwd2((v) => !v)}
                          aria-label={showSPwd2 ? "Hide password" : "Show password"}
                          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-white/60 hover:bg-white/10 hover:text-white"
                        >
                          {showSPwd2 ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                      {sPwd2.length > 0 && sPwd !== sPwd2 && (
                        <p className="mt-1 text-[11px] text-red-200">Passwords do not match.</p>
                      )}
                    </div>
                    {(() => {
                      const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
                        sEmail.trim().toLowerCase(),
                      );
                      const pwdStrong =
                        sPwd.length >= 8 &&
                        !/\s/.test(sPwd) &&
                        /[A-Z]/.test(sPwd) &&
                        /[a-z]/.test(sPwd) &&
                        /[0-9]/.test(sPwd) &&
                        /[^A-Za-z0-9]/.test(sPwd);
                      const canSubmit =
                        !!name.trim() && emailOk && pwdStrong && sPwd2.length > 0 && sPwd === sPwd2;
                      return (
                        <Button
                          type="submit"
                          disabled={signingUp || !canSubmit}
                          className="w-full bg-gradient-to-r from-indigo-500 to-fuchsia-500 text-white hover:from-indigo-400 hover:to-fuchsia-400"
                        >
                          {signingUp ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Creating account…
                            </>
                          ) : (
                            "Create account"
                          )}
                        </Button>
                      );
                    })()}
                  </form>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
