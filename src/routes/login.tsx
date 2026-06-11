import { createFileRoute, useNavigate, Navigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQA } from "@/lib/qa/store";
import { useEnvironment } from "@/lib/qa/environment";
import { useServerFn } from "@tanstack/react-start";
import { accountStatus } from "@/lib/qa/admin.functions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { HelpCircle, Eye, EyeOff, ShieldCheck, Loader2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";

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
          <Button onClick={reset} className="bg-white text-slate-900 hover:bg-white/90">Try again</Button>
          <Button variant="outline" className="border-white/30 bg-transparent text-white hover:bg-white/10" onClick={() => window.location.reload()}>Reload</Button>
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
  const { currentUser, login, signup, users } = useQA();
  const { env, ready } = useEnvironment();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [sEmail, setSEmail] = useState("");
  const [sPwd, setSPwd] = useState("");
  const checkAccount = useServerFn(accountStatus);
  const [hint, setHint] = useState<{ tone: "info" | "warn" | "error"; title: string; body: string } | null>(null);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotBusy, setForgotBusy] = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  const [remember, setRemember] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const pwdRef = useRef<HTMLInputElement>(null);
  const hintRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("zenwork.rememberEmail");
      if (saved) { setEmail(saved); setRemember(true); }
    } catch {}
  }, []);

  if (currentUser && ready) return <Navigate to={env ? "/dashboard" : "/select-environment"} replace />;

  const onLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setHint(null);
    if (!email.trim()) { emailRef.current?.focus(); return; }
    if (!password) { pwdRef.current?.focus(); return; }
    setSubmitting(true);
    const r = await login(email, password);
    setSubmitting(false);
    if (!r.ok) {
      toast.error(r.error);
      try {
        const s = await checkAccount({ data: { email: email.trim().toLowerCase() } });
        if (!s.exists) {
          setHint({
            tone: "warn",
            title: "No account found for that email",
            body: "Use the Create account tab, or ask an admin to invite you from Settings → Team & Roles.",
          });
        } else if (!s.active) {
          setHint({
            tone: "error",
            title: "This account is inactive",
            body: `${s.name ?? "This user"} was deactivated by an admin. Ask an admin to reactivate it from Settings → Team & Roles.`,
          });
        } else if (!s.hasRole) {
          setHint({
            tone: "warn",
            title: "Account has no role assigned",
            body: "An admin must assign Admin or QA Agent role before sign-in works. Settings → Team & Roles.",
          });
        } else {
          setHint({
            tone: "info",
            title: `Wrong password for a ${s.isAdmin ? "Admin" : "QA Agent"} account`,
            body: "Double-check the password, or use Forgot password? to email yourself a reset link.",
          });
        }
      } catch {
        /* ignore — generic toast already shown */
      }
      // Move focus to hint banner (announces via role=alert) then to invalid field
      setTimeout(() => {
        if (hintRef.current) hintRef.current.focus();
        else pwdRef.current?.focus();
      }, 30);
      return;
    }
    try {
      if (remember) localStorage.setItem("zenwork.rememberEmail", email.trim().toLowerCase());
      else localStorage.removeItem("zenwork.rememberEmail");
    } catch {}
    toast.success("Welcome back");
    navigate({ to: env ? "/dashboard" : "/select-environment" });
  };
  const onSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = await signup(name, sEmail, sPwd);
    if (!r.ok) return toast.error(r.error);
    toast.success(users.length === 0 ? "Admin account created — signing you in" : "Account created — signing you in");
    navigate({ to: env ? "/dashboard" : "/select-environment" });
  };

  const sendReset = async () => {
    if (!forgotEmail) return;
    setForgotBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail.trim().toLowerCase(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setForgotBusy(false);
    if (error) return toast.error(error.message);
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
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-white/10 text-lg font-black backdrop-blur ring-1 ring-white/20">
              Z
            </div>
            <span className="text-xl font-semibold tracking-tight">Zenwork Testing</span>
          </div>
          <div className="space-y-6">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium ring-1 ring-white/15 backdrop-blur">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-300" /> Secure QA workspace
            </div>
            <h1 className="text-4xl font-bold leading-tight md:text-5xl">
              Ship higher-quality<br />tax forms, faster.
            </h1>
            <p className="max-w-md text-base text-white/70">
              Track 1099, 990, integrations, and online portal testing in one clean workspace built for QA teams.
            </p>
            <div className="flex gap-3 text-xs text-white/60">
              <span className="rounded-full bg-white/5 px-3 py-1 ring-1 ring-white/10">Real-time sync</span>
              <span className="rounded-full bg-white/5 px-3 py-1 ring-1 ring-white/10">Role-based access</span>
              <span className="rounded-full bg-white/5 px-3 py-1 ring-1 ring-white/10">Audit trail</span>
            </div>
          </div>
          <p className="text-sm text-white/50">© Zenwork — QA Engineering</p>
        </div>

        {/* Glass login card */}
        <div className="flex items-center justify-center animate-scale-in">
          <Card className="w-full max-w-md border-white/15 bg-white/10 text-white shadow-2xl shadow-indigo-900/40 backdrop-blur-xl">
          <CardHeader>
              <div className="mb-2 flex items-center gap-2 lg:hidden">
                <div className="grid h-9 w-9 place-items-center rounded-xl bg-white/15 text-sm font-black ring-1 ring-white/20">Z</div>
                <span className="text-base font-semibold">Zenwork Testing</span>
              </div>
              <CardTitle className="text-2xl text-white">Welcome back</CardTitle>
              <CardDescription className="text-white/70">Sign in to access the Zenwork Testing dashboard</CardDescription>
          </CardHeader>
          <CardContent>
              <Tabs defaultValue="login">
                <TabsList className="grid w-full grid-cols-2 bg-white/10">
                  <TabsTrigger value="login" className="data-[state=active]:bg-white data-[state=active]:text-slate-900">Sign in</TabsTrigger>
                  <TabsTrigger value="signup" className="data-[state=active]:bg-white data-[state=active]:text-slate-900">Create account</TabsTrigger>
              </TabsList>
              <TabsContent value="login">
                <form onSubmit={onLogin} className="space-y-4 pt-4">
                  <div>
                    <Label htmlFor="email" className="text-white/80">Email</Label>
                    <Input ref={emailRef} id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="border-white/20 bg-white/10 text-white placeholder:text-white/40 focus-visible:ring-white/40" placeholder="you@company.com" />
                  </div>
                  <div>
                    <Label htmlFor="pwd" className="text-white/80">Password</Label>
                    <div className="relative">
                      <Input ref={pwdRef} id="pwd" type={showPwd ? "text" : "password"} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required className="border-white/20 bg-white/10 pr-10 text-white placeholder:text-white/40 focus-visible:ring-white/40" placeholder="••••••••" />
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
                      <Checkbox checked={remember} onCheckedChange={(v) => setRemember(!!v)} className="border-white/40 data-[state=checked]:bg-white data-[state=checked]:text-slate-900" />
                      Remember me
                    </label>
                    <button
                      type="button"
                      className="text-xs font-medium text-white hover:underline"
                      onClick={() => { if (!forgotEmail) setForgotEmail(email); setForgotOpen((v) => !v); }}
                    >
                      Forgot password?
                    </button>
                  </div>
                  <Button type="submit" disabled={submitting} className="w-full bg-gradient-to-r from-indigo-500 to-fuchsia-500 text-white hover:opacity-95 hover:from-indigo-400 hover:to-fuchsia-400">
                    {submitting ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />Signing in…</>) : "Sign in"}
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
                        We'll email a secure link to set a new password. Works for both Admin and QA Agent accounts.
                      </p>
                      <div className="flex gap-2">
                        <Input
                          type="email"
                          placeholder="you@company.com"
                          value={forgotEmail}
                          onChange={(e) => setForgotEmail(e.target.value)}
                          className="h-9 border-white/20 bg-white/10 text-white placeholder:text-white/40"
                        />
                        <Button type="button" size="sm" onClick={sendReset} disabled={forgotBusy || !forgotEmail}>
                          {forgotBusy ? "Sending…" : "Send link"}
                        </Button>
                      </div>
                    </div>
                  )}
                  <p className="text-center text-xs text-white/60">
                    No account yet? Use <span className="font-medium">Create account</span> — the first signup becomes Admin.
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
                          <p>The sample admin hasn't been created yet, or the password was changed. Click <span className="font-medium">Create / reset sample admin &amp; sign in</span> above to mint <span className="font-mono">admin@qaportal.app</span> / <span className="font-mono">Admin@12345</span> and sign in.</p>
                        </div>
                        <div>
                          <p className="font-medium text-white">"Your account is inactive"</p>
                          <p>An admin has deactivated your account from <span className="font-medium">Settings → Team &amp; Roles</span>. Ask an admin to flip your status back to Active.</p>
                        </div>
                        <div>
                          <p className="font-medium text-white">Signed in but can't see admin tools</p>
                          <p>Your account is a QA Agent, not Admin. Only the <span className="font-medium">first</span> account becomes Admin automatically. Ask an existing admin to promote you from <span className="font-medium">Settings → Team &amp; Roles</span>.</p>
                        </div>
                        <div>
                          <p className="font-medium text-white">No account at all yet</p>
                          <p>Use the <span className="font-medium">Create account</span> tab — the first signup is auto-promoted to Admin.</p>
                        </div>
                        <div>
                          <p className="font-medium text-white">Forgot your password</p>
                          <p>Ask an admin to invite you again from <span className="font-medium">Settings → Team &amp; Roles → Invite agent</span> with a fresh password, or use <span className="font-medium">Create / reset sample admin</span> if you're using the sample account.</p>
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                </form>
              </TabsContent>
              <TabsContent value="signup">
                <form onSubmit={onSignup} className="space-y-4 pt-4">
                  <div>
                    <Label htmlFor="n" className="text-white/80">Full name</Label>
                    <Input id="n" value={name} onChange={(e) => setName(e.target.value)} required className="border-white/20 bg-white/10 text-white placeholder:text-white/40" />
                  </div>
                  <div>
                    <Label htmlFor="se" className="text-white/80">Email</Label>
                    <Input id="se" type="email" value={sEmail} onChange={(e) => setSEmail(e.target.value)} required className="border-white/20 bg-white/10 text-white placeholder:text-white/40" />
                  </div>
                  <div>
                    <Label htmlFor="sp" className="text-white/80">Password</Label>
                    <Input id="sp" type="password" value={sPwd} onChange={(e) => setSPwd(e.target.value)} required minLength={6} className="border-white/20 bg-white/10 text-white placeholder:text-white/40" />
                  </div>
                  <Button type="submit" className="w-full bg-gradient-to-r from-indigo-500 to-fuchsia-500 text-white hover:from-indigo-400 hover:to-fuchsia-400">Create account</Button>
                  <p className="text-center text-xs text-white/60">
                    First signup becomes Admin. Subsequent accounts are QA Agents.
                  </p>
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
