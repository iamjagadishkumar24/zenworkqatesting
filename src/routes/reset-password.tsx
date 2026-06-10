import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { accountStatus } from "@/lib/qa/admin.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, CheckCircle2, ShieldAlert, UserX } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/reset-password")({
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [pwd, setPwd] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const checkAccount = useServerFn(accountStatus);
  const [account, setAccount] = useState<
    | { state: "loading" }
    | { state: "no-session" }
    | { state: "ok"; email: string; role: "Admin" | "QA Agent"; name: string | null }
    | { state: "inactive"; email: string; name: string | null }
    | { state: "no-role"; email: string; name: string | null }
    | { state: "missing"; email: string }
  >({ state: "loading" });

  useEffect(() => {
    // Supabase puts the recovery session in the URL hash; getSession picks it up.
    supabase.auth.getSession().then(async ({ data }) => {
      setReady(true);
      const email = data.session?.user.email ?? null;
      if (!email) {
        const hash = typeof window !== "undefined" ? window.location.hash : "";
        if (!hash.includes("type=recovery")) {
          toast.error("Invalid or expired reset link. Request a new one from the sign-in page.");
        }
        setAccount({ state: "no-session" });
        return;
      }
      try {
        const s = await checkAccount({ data: { email } });
        if (!s.exists) return setAccount({ state: "missing", email });
        if (!s.active) return setAccount({ state: "inactive", email, name: s.name });
        if (!s.hasRole) return setAccount({ state: "no-role", email, name: s.name });
        setAccount({
          state: "ok",
          email,
          name: s.name,
          role: s.isAdmin ? "Admin" : "QA Agent",
        });
      } catch {
        setAccount({ state: "no-session" });
      }
    });
  }, [checkAccount]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (account.state === "inactive") {
      return toast.error("This account is inactive. Ask an admin to reactivate it before resetting the password.");
    }
    if (account.state === "no-role") {
      return toast.error("This account has no role. Ask an admin to assign Admin or QA Agent before resetting.");
    }
    if (pwd.length < 8) return toast.error("Password must be at least 8 characters");
    if (pwd !== confirm) return toast.error("Passwords do not match");
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pwd });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Password updated — please sign in");
    await supabase.auth.signOut();
    navigate({ to: "/login" });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <Card className="w-full max-w-md border-border shadow-[var(--shadow-card)]">
        <CardHeader>
          <CardTitle className="text-2xl">Set a new password</CardTitle>
          <CardDescription>Choose a strong password for your QA Portal account.</CardDescription>
        </CardHeader>
        <CardContent>
          <AccountBanner account={account} />
          <form onSubmit={submit} className="space-y-4">
            <div>
              <Label htmlFor="np">New password</Label>
              <Input id="np" type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} required minLength={8} disabled={account.state === "inactive" || account.state === "no-role"} />
            </div>
            <div>
              <Label htmlFor="cp">Confirm password</Label>
              <Input id="cp" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={8} disabled={account.state === "inactive" || account.state === "no-role"} />
            </div>
            <Button type="submit" className="w-full" disabled={!ready || busy || account.state === "inactive" || account.state === "no-role" || account.state === "missing"}>
              {busy ? "Updating…" : "Update password"}
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              Reset links expire after a short time. Open this page from the email you received.
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function AccountBanner({ account }: { account:
  | { state: "loading" }
  | { state: "no-session" }
  | { state: "ok"; email: string; role: "Admin" | "QA Agent"; name: string | null }
  | { state: "inactive"; email: string; name: string | null }
  | { state: "no-role"; email: string; name: string | null }
  | { state: "missing"; email: string };
}) {
  if (account.state === "loading") return null;
  if (account.state === "no-session") {
    return (
      <div className="mb-4 flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-300">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <p className="font-medium">No active reset session</p>
          <p>Open this page from the link in your password-reset email, or request a new link from the sign-in page.</p>
        </div>
      </div>
    );
  }
  if (account.state === "missing") {
    return (
      <div className="mb-4 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
        <UserX className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <p className="font-medium">No portal account for {account.email}</p>
          <p>Ask an admin to invite this email from Settings → Team & Roles before resetting a password.</p>
        </div>
      </div>
    );
  }
  if (account.state === "inactive") {
    return (
      <div className="mb-4 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <p className="font-medium">Account inactive</p>
          <p>{account.name ?? account.email} is deactivated. Resetting the password won't restore access — ask an admin to reactivate the account first.</p>
        </div>
      </div>
    );
  }
  if (account.state === "no-role") {
    return (
      <div className="mb-4 flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-300">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <p className="font-medium">No role assigned</p>
          <p>{account.name ?? account.email} has no Admin or QA Agent role. Ask an admin to assign one from Settings → Team & Roles.</p>
        </div>
      </div>
    );
  }
  return (
    <div className="mb-4 flex items-start gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 p-3 text-xs text-emerald-800 dark:text-emerald-300">
      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <p className="font-medium">Resetting password for {account.name ?? account.email}</p>
          <Badge variant="outline" className="border-emerald-500/40 text-emerald-700 dark:text-emerald-300">{account.role}</Badge>
        </div>
        <p className="opacity-90">Choose a new password below — you'll be signed out and asked to sign back in.</p>
      </div>
    </div>
  );
}