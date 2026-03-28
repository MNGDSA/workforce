import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import DashboardLayout from "@/components/layout";
import { RolesAccessContent } from "@/pages/roles-access";
import { NotificationSettingsContent } from "@/pages/notifications";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { 
  Building2, 
  Globe, 
  Shield, 
  Key, 
  Users, 
  Database, 
  Save,
  CreditCard,
  Bell,
  Loader2
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function SettingsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [supportEmail, setSupportEmail] = useState("");

  const { data: systemSettings } = useQuery<{ support_email: string }>({
    queryKey: ["/api/settings/system"],
    queryFn: () => apiRequest("GET", "/api/settings/system").then(r => r.json()),
  });

  useEffect(() => {
    if (systemSettings) {
      setSupportEmail(systemSettings.support_email ?? "");
    }
  }, [systemSettings]);

  const saveSettings = useMutation({
    mutationFn: (data: { support_email: string }) =>
      apiRequest("PATCH", "/api/settings/system", data).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/system"] });
      toast({ title: "Settings Saved", description: "Support email updated successfully." });
    },
    onError: () => toast({ title: "Save failed", variant: "destructive" }),
  });

  const handleSave = () => {
    saveSettings.mutate({ support_email: supportEmail });
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-6xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-display font-bold text-white tracking-tight">System & Settings</h1>
            <p className="text-muted-foreground mt-1">Manage your organization profile, roles, and global preferences.</p>
          </div>
          <Button onClick={handleSave} disabled={saveSettings.isPending} className="h-11 bg-primary text-primary-foreground font-bold uppercase tracking-wide text-xs">
            {saveSettings.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save Changes
          </Button>
        </div>

        <Tabs defaultValue="general" className="w-full">
          <TabsList className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 w-full h-auto gap-2 bg-transparent p-0 mb-6">
            <TabsTrigger 
              value="general" 
              className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary border border-transparent data-[state=active]:border-primary/20 bg-card rounded-md h-12"
            >
              General
            </TabsTrigger>
            <TabsTrigger 
              value="security" 
              className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary border border-transparent data-[state=active]:border-primary/20 bg-card rounded-md h-12"
            >
              Security
            </TabsTrigger>
            <TabsTrigger 
              value="roles" 
              className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary border border-transparent data-[state=active]:border-primary/20 bg-card rounded-md h-12"
            >
              Roles & Access
            </TabsTrigger>
            <TabsTrigger 
              value="notifications" 
              className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary border border-transparent data-[state=active]:border-primary/20 bg-card rounded-md h-12"
            >
              Notifications
            </TabsTrigger>
            <TabsTrigger 
              value="integrations" 
              className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary border border-transparent data-[state=active]:border-primary/20 bg-card rounded-md h-12"
            >
              APIs & Webhooks
            </TabsTrigger>
            <TabsTrigger 
              value="advanced" 
              className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary border border-transparent data-[state=active]:border-primary/20 bg-card rounded-md h-12"
            >
              Advanced
            </TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="space-y-6 m-0 animate-in fade-in-50 duration-500">
            <Card className="bg-card border-border">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-primary" />
                  <CardTitle className="text-xl text-white">Organization Profile</CardTitle>
                </div>
                <CardDescription>Update your company details and branding.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="orgName" className="text-white">Organization Name</Label>
                    <Input id="orgName" defaultValue="WORKFORCE Operations" className="bg-muted/30 border-border" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="industry" className="text-white">Industry</Label>
                    <Input id="industry" defaultValue="Logistics & Warehousing" className="bg-muted/30 border-border" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="supportEmail" className="text-white">Support Email</Label>
                    <Input
                      id="supportEmail"
                      type="email"
                      placeholder="support@company.com"
                      value={supportEmail}
                      onChange={(e) => setSupportEmail(e.target.value)}
                      className="bg-muted/30 border-border"
                      data-testid="input-support-email"
                    />
                    <p className="text-xs text-muted-foreground">Shown on the login page as "Contact Support" link</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone" className="text-white">Phone Number</Label>
                    <Input id="phone" defaultValue="+1 (555) 000-0000" className="bg-muted/30 border-border" />
                  </div>
                </div>

                <Separator className="bg-border" />

                <div>
                  <h3 className="text-base font-medium text-white mb-4">Localization</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label className="text-white">Default Timezone</Label>
                      <Input defaultValue="Asia/Riyadh (AST)" className="bg-muted/30 border-border" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-white">Date Format</Label>
                      <Input defaultValue="DD/MM/YYYY" className="bg-muted/30 border-border" />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="security" className="space-y-6 m-0 animate-in fade-in-50 duration-500">
            <Card className="bg-card border-border">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Shield className="h-5 w-5 text-primary" />
                  <CardTitle className="text-xl text-white">Security Policies</CardTitle>
                </div>
                <CardDescription>Manage password requirements and authentication methods.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-muted/20 border border-border rounded-md">
                    <div className="space-y-0.5">
                      <Label className="text-base text-white">Two-Factor Authentication (2FA)</Label>
                      <p className="text-sm text-muted-foreground">Require all admin users to use 2FA to log in.</p>
                    </div>
                    <Switch defaultChecked />
                  </div>

                  <div className="flex items-center justify-between p-4 bg-muted/20 border border-border rounded-md">
                    <div className="space-y-0.5">
                      <Label className="text-base text-white">Strict Password Policy</Label>
                      <p className="text-sm text-muted-foreground">Require uppercase, numbers, and special characters.</p>
                    </div>
                    <Switch defaultChecked />
                  </div>

                  <div className="flex items-center justify-between p-4 bg-muted/20 border border-border rounded-md">
                    <div className="space-y-0.5">
                      <Label className="text-base text-white">Session Timeout</Label>
                      <p className="text-sm text-muted-foreground">Automatically log users out after 30 minutes of inactivity.</p>
                    </div>
                    <Switch />
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="roles" className="m-0 animate-in fade-in-50 duration-500">
            <RolesAccessContent />
          </TabsContent>

          <TabsContent value="notifications" className="m-0 animate-in fade-in-50 duration-500">
            <NotificationSettingsContent />
          </TabsContent>

          <TabsContent value="integrations" className="m-0 animate-in fade-in-50 duration-500">
            <div className="p-8 text-center text-muted-foreground bg-card border border-border border-dashed rounded-md">
               <Database className="h-10 w-10 mx-auto text-muted-foreground mb-4 opacity-50" />
               <h3 className="text-lg font-medium text-white mb-2">API Keys & Webhooks</h3>
               <p>Generate API tokens and configure webhooks to integrate with external systems.</p>
               <Button variant="outline" className="mt-4 border-border text-white">Manage Keys</Button>
            </div>
          </TabsContent>
          
          <TabsContent value="advanced" className="m-0 animate-in fade-in-50 duration-500">
            <div className="p-8 text-center text-muted-foreground bg-card border border-destructive/20 border-dashed rounded-md bg-destructive/5">
               <Shield className="h-10 w-10 mx-auto text-destructive mb-4 opacity-70" />
               <h3 className="text-lg font-medium text-white mb-2">Danger Zone</h3>
               <p className="mb-4">Irreversible actions that affect your entire organization workspace.</p>
               <Button variant="destructive" className="font-bold">Delete Organization</Button>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
