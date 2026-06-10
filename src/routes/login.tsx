import { createFileRoute, useNavigate, Navigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQA } from "@/lib/qa/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const { currentUser, login, signup, users } = useQA();
  const navigate = useNavigate();
  const [email, setEmail] = useState("saisrija@zenwork.com");
  const [password, setPassword] = useState("demo1234");
  const [name, setName] = useState("");
  const [sEmail, setSEmail] = useState("");
  const [sPwd, setSPwd] = useState("");

  if (currentUser) return <Navigate to="/dashboard" replace />;

  const onLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = await login(email, password);
    if (!r.ok) return toast.error(r.error);
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
                  <p className="text-center text-xs text-muted-foreground">
                    No account yet? Use <span className="font-medium">Create account</span> — the first signup becomes Admin.
                  </p>
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
