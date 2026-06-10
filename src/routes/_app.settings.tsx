import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQA } from "@/lib/qa/store";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";

export const Route = createFileRoute("/_app/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const { currentUser, users, addUser, updateUser, removeUser } = useQA();
  const isAdmin = currentUser?.role === "admin";

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "agent">("agent");

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Settings</h2>
        <p className="text-sm text-muted-foreground">Profile, team management and portal preferences.</p>
      </div>

      <Tabs defaultValue="profile">
        <TabsList>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="team" disabled={!isAdmin}>Team</TabsTrigger>
          <TabsTrigger value="preferences">Preferences</TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Your Profile</CardTitle>
              <CardDescription>Account details for the signed-in user.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div><Label>Name</Label><Input value={currentUser?.name ?? ""} disabled /></div>
              <div><Label>Email</Label><Input value={currentUser?.email ?? ""} disabled /></div>
              <div><Label>Role</Label><Input value={currentUser?.role ?? ""} disabled className="capitalize" /></div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="team" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Add Team Member</CardTitle>
              <CardDescription>New QA agents can sign in with the temporary password <span className="font-mono">demo1234</span>.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 md:grid-cols-4">
                <Input placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} />
                <Input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
                <Select value={role} onValueChange={(v) => setRole(v as "admin" | "agent")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="agent">QA Agent</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  onClick={() => {
                    if (!name || !email) return toast.error("Name and email required");
                    addUser({ name, email, role, active: true });
                    setName(""); setEmail(""); setRole("agent");
                    toast.success("Team member added");
                  }}
                >Add Member</Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Active</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell className="font-medium">{u.name}</TableCell>
                      <TableCell>{u.email}</TableCell>
                      <TableCell>
                        <Select value={u.role} onValueChange={(v) => updateUser(u.id, { role: v as "admin" | "agent" })}>
                          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="agent">QA Agent</SelectItem>
                            <SelectItem value="admin">Admin</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Switch checked={u.active} onCheckedChange={(c) => updateUser(u.id, { active: c })} />
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="icon" variant="ghost"
                          disabled={u.id === currentUser?.id}
                          onClick={() => { if (confirm(`Remove ${u.name}?`)) { removeUser(u.id); toast.success("Member removed"); } }}
                        ><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="preferences" className="mt-4">
          <Card>
            <CardHeader><CardTitle>Notifications</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between"><Label>Email me when a defect is assigned</Label><Switch defaultChecked /></div>
              <div className="flex items-center justify-between"><Label>Slack alerts for Critical defects</Label><Switch defaultChecked /></div>
              <div className="flex items-center justify-between"><Label>Weekly QA digest</Label><Switch /></div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
