import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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

  useEffect(() => {
    // Supabase puts the recovery session in the URL hash; getSession picks it up.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
      else {
        const hash = typeof window !== "undefined" ? window.location.hash : "";
        if (!hash.includes("type=recovery")) {
          toast.error("Invalid or expired reset link. Request a new one from the sign-in page.");
        }
        setReady(true);
      }
    });
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
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
          <form onSubmit={submit} className="space-y-4">
            <div>
              <Label htmlFor="np">New password</Label>
              <Input id="np" type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} required minLength={8} />
            </div>
            <div>
              <Label htmlFor="cp">Confirm password</Label>
              <Input id="cp" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={8} />
            </div>
            <Button type="submit" className="w-full" disabled={!ready || busy}>
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