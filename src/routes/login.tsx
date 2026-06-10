import { createFileRoute, useNavigate, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQA } from "@/lib/qa/store";
import { useServerFn } from "@tanstack/react-start";
import { resetSampleAdmin, sampleAdminStatus, accountStatus } from "@/lib/qa/admin.functions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { HelpCircle, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const { currentUser, login, signup, users } = useQA();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [sEmail, setSEmail] = useState("");
  const [sPwd, setSPwd] = useState("");
  const [seeding, setSeeding] = useState(false);
  const reset = useServerFn(resetSampleAdmin);
  const checkSample = useServerFn(sampleAdminStatus);
  const checkAccount = useServerFn(accountStatus);
  const [hint, setHint] = useState<{ tone: "info" | "warn" | "error"; title: string; body: string } | null>(null);
  const [sample, setSample] = useState<{ loading: boolean; exists?: boolean; isAdmin?: boolean; active?: boolean }>({ loading: true });
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotBusy, setForgotBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    checkSample()
      .then((r) => { if (!cancelled) setSample({ loading: false, ...r }); })
      .catch(() => { if (!cancelled) setSample({ loading: false }); });
    return () => { cancelled = true; };
  }, [checkSample]);

  if (currentUser) return <Navigate to="/dashboard" replace />;

  const onLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setHint(null);
    const r = await login(email, password);
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
      return;
    }
    toast.success("Welcome back");
    navigate({ to: "/dashboard" });
  };
  const onSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = await signup(name, sEmail, sPwd);
    if (!r.ok) return toast.error(r.error);
    toast.success(users.length === 0 ? "Admin account created — signing you in" : "Account created — signing you in");
    navigate({ to: "/dashboard" });
  };

  const seedAdmin = async () => {
    setSeeding(true);
    try {
      const r = await reset();
      setEmail(r.email);
      setPassword(r.password);
      const li = await login(r.email, r.password);
      if (!li.ok) {
        toast.success(`Sample admin ready — email: ${r.email}, password: ${r.password}`);
      } else {
        toast.success("Signed in as sample admin");
        navigate({ to: "/dashboard" });
      }
      setSample({ loading: false, exists: true, isAdmin: true, active: true });
    } catch (e: any) {
      toast.error(e?.message ?? "Could not create sample admin");
    } finally {
      setSeeding(false);
    }
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

  const renderSampleStatus = () => {
    if (sample.loading) {
      return (
        <Badge variant="secondary" className="gap-1">
          <Loader2 className="h-3 w-3 animate-spin" /> Checking…
        </Badge>
      );
    }
    if (!sample.exists) {
      return (
        <Badge variant="outline" className="gap-1 border-amber-500/40 text-amber-700 dark:text-amber-400">
          <AlertCircle className="h-3 w-3" /> Not created
        </Badge>
      );
    }
    if (sample.isAdmin && sample.active) {
      return (
        <Badge variant="outline" className="gap-1 border-emerald-500/40 text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 className="h-3 w-3" /> Ready
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="gap-1 border-amber-500/40 text-amber-700 dark:text-amber-400">
        <AlertCircle className="h-3 w-3" /> Needs reset
      </Badge>
    );
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div
        className="hidden flex-col justify-between p-12 text-primary-foreground lg:flex"
        style={{ background: "var(--gradient-primary)" }}
      >
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-white/15 font-bold backdrop-blur">Z</div>
          <span className="text-xl font-semibold">Zenwork QA Portal</span>
        </div>
        <div>
          <h2 className="text-4xl font-bold leading-tight">Ship higher-quality tax forms, faster.</h2>
          <p className="mt-4 max-w-md text-primary-foreground/80">
            Track 1099, 990, integrations, and online portal testing in one clean workspace built for QA teams.
          </p>
        </div>
        <p className="text-sm text-primary-foreground/70">© Zenwork — QA Engineering</p>
      </div>
      <div className="flex items-center justify-center p-6">
        <Card className="w-full max-w-md border-border shadow-[var(--shadow-card)]">
          <CardHeader>
            <CardTitle className="text-2xl">Sign in</CardTitle>
            <CardDescription>Access the Zenwork QA dashboard</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="login">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="login">Sign in</TabsTrigger>
                <TabsTrigger value="signup">Create account</TabsTrigger>
              </TabsList>
              <TabsContent value="login">
                <form onSubmit={onLogin} className="space-y-4 pt-4">
                  <div>
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                  </div>
                  <div>
                    <Label htmlFor="pwd">Password</Label>
                    <Input id="pwd" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                  </div>
                  <Button type="submit" className="w-full">Sign in</Button>
                  {hint && (
                    <div
                      role="status"
                      className={
                        "rounded-md border p-3 text-xs " +
                        (hint.tone === "error"
                          ? "border-destructive/40 bg-destructive/10 text-destructive"
                          : hint.tone === "warn"
                          ? "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300"
                          : "border-primary/30 bg-primary/5 text-foreground")
                      }
                    >
                      <p className="font-medium">{hint.title}</p>
                      <p className="mt-1 opacity-90">{hint.body}</p>
                    </div>
                  )}
                  <div className="flex justify-end">
                    <button
                      type="button"
                      className="text-xs font-medium text-primary hover:underline"
                      onClick={() => { if (!forgotEmail) setForgotEmail(email); setForgotOpen((v) => !v); }}
                    >
                      Forgot password?
                    </button>
                  </div>
                  {forgotOpen && (
                    <div className="rounded-md border border-border bg-muted/30 p-3 text-xs space-y-2">
                      <p className="font-medium text-foreground">Reset by email</p>
                      <p className="text-muted-foreground">
                        We'll email a secure link to set a new password. Works for both Admin and QA Agent accounts.
                      </p>
                      <div className="flex gap-2">
                        <Input
                          type="email"
                          placeholder="you@company.com"
                          value={forgotEmail}
                          onChange={(e) => setForgotEmail(e.target.value)}
                          className="h-9"
                        />
                        <Button type="button" size="sm" onClick={sendReset} disabled={forgotBusy || !forgotEmail}>
                          {forgotBusy ? "Sending…" : "Send link"}
                        </Button>
                      </div>
                    </div>
                  )}
                  <p className="text-center text-xs text-muted-foreground">
                    No account yet? Use <span className="font-medium">Create account</span> — the first signup becomes Admin.
                  </p>
                  <div className="rounded-md border border-dashed border-border bg-muted/40 p-3 text-xs">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <p className="font-medium">Try the sample admin</p>
                      {renderSampleStatus()}
                    </div>
                    <p className="mb-2 text-muted-foreground">
                      Email: <span className="font-mono">admin@qaportal.app</span><br />
                      Password: <span className="font-mono">Admin@12345</span>
                    </p>
                    {!sample.loading && sample.exists && sample.isAdmin && sample.active ? (
                      <Button
                        type="button"
                        size="sm"
                        className="w-full"
                        onClick={async () => {
                          setEmail("admin@qaportal.app");
                          setPassword("Admin@12345");
                          const r = await login("admin@qaportal.app", "Admin@12345");
                          if (!r.ok) return toast.error(`${r.error} — click Reset to re-mint the password.`);
                          toast.success("Signed in as sample admin");
                          navigate({ to: "/dashboard" });
                        }}
                      >
                        Sign in as sample admin
                      </Button>
                    ) : (
                      <Button type="button" variant="outline" size="sm" className="w-full" onClick={seedAdmin} disabled={seeding}>
                        {seeding ? "Setting up…" : sample.exists ? "Reset sample admin & sign in" : "Create sample admin & sign in"}
                      </Button>
                    )}
                  </div>
                  <Accordion type="single" collapsible className="w-full">
                    <AccordionItem value="trouble" className="border-border">
                      <AccordionTrigger className="py-2 text-xs hover:no-underline">
                        <span className="flex items-center gap-2">
                          <HelpCircle className="h-3.5 w-3.5" />
                          Can't sign in? Troubleshoot
                        </span>
                      </AccordionTrigger>
                      <AccordionContent className="space-y-3 text-xs text-muted-foreground">
                        <div>
                          <p className="font-medium text-foreground">"Invalid login credentials"</p>
                          <p>The sample admin hasn't been created yet, or the password was changed. Click <span className="font-medium">Create / reset sample admin &amp; sign in</span> above to mint <span className="font-mono">admin@qaportal.app</span> / <span className="font-mono">Admin@12345</span> and sign in.</p>
                        </div>
                        <div>
                          <p className="font-medium text-foreground">"Your account is inactive"</p>
                          <p>An admin has deactivated your account from <span className="font-medium">Settings → Team &amp; Roles</span>. Ask an admin to flip your status back to Active.</p>
                        </div>
                        <div>
                          <p className="font-medium text-foreground">Signed in but can't see admin tools</p>
                          <p>Your account is a QA Agent, not Admin. Only the <span className="font-medium">first</span> account becomes Admin automatically. Ask an existing admin to promote you from <span className="font-medium">Settings → Team &amp; Roles</span>.</p>
                        </div>
                        <div>
                          <p className="font-medium text-foreground">No account at all yet</p>
                          <p>Use the <span className="font-medium">Create account</span> tab — the first signup is auto-promoted to Admin.</p>
                        </div>
                        <div>
                          <p className="font-medium text-foreground">Forgot your password</p>
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
                    <Label htmlFor="n">Full name</Label>
                    <Input id="n" value={name} onChange={(e) => setName(e.target.value)} required />
                  </div>
                  <div>
                    <Label htmlFor="se">Email</Label>
                    <Input id="se" type="email" value={sEmail} onChange={(e) => setSEmail(e.target.value)} required />
                  </div>
                  <div>
                    <Label htmlFor="sp">Password</Label>
                    <Input id="sp" type="password" value={sPwd} onChange={(e) => setSPwd(e.target.value)} required minLength={6} />
                  </div>
                  <Button type="submit" className="w-full">Create account</Button>
                  <p className="text-center text-xs text-muted-foreground">
                    First signup becomes Admin. Subsequent accounts are QA Agents.
                  </p>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
