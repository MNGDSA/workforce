import DashboardLayout from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { 
  Bell, 
  MessageSquare, 
  Settings, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle,
  Smartphone,
  Mail,
  Zap
} from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

export default function NotificationsPage() {
  const { toast } = useToast();
  const [msegatConfig, setMsegatConfig] = useState({
    username: "",
    apiKey: "",
    senderName: "",
    enabled: false
  });

  const handleMsegatSave = () => {
    // Mock saving
    toast({
      title: "Settings Saved",
      description: "Msegat integration settings have been updated.",
    });
  };

  const handleTestConnection = () => {
    if (!msegatConfig.username || !msegatConfig.apiKey) {
      toast({
        title: "Connection Failed",
        description: "Please enter Username and API Key first.",
        variant: "destructive"
      });
      return;
    }
    
    toast({
      title: "Connection Successful",
      description: "Successfully connected to Msegat API.",
      variant: "default" // success
    });
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-5xl mx-auto">
        <div>
          <h1 className="text-3xl font-display font-bold text-white tracking-tight">Notification Center</h1>
          <p className="text-muted-foreground mt-1">Manage system alerts and communication integrations.</p>
        </div>

        <Tabs defaultValue="integrations" className="space-y-6">
          <TabsList className="grid w-full grid-cols-2 max-w-[400px] bg-muted/20">
            <TabsTrigger value="notifications">Alerts & History</TabsTrigger>
            <TabsTrigger value="integrations">Integrations</TabsTrigger>
          </TabsList>

          <TabsContent value="notifications" className="space-y-4">
            <Card className="bg-card border-border">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg font-display text-white">Recent Alerts</CardTitle>
                  <Button variant="outline" size="sm">Mark all as read</Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="flex gap-4 items-start p-4 rounded-md bg-muted/30 border border-border/50">
                      <div className="h-8 w-8 rounded-full bg-blue-500/20 text-blue-500 flex items-center justify-center shrink-0">
                        <Bell className="h-4 w-4" />
                      </div>
                      <div className="flex-1">
                        <div className="flex justify-between items-start">
                          <h4 className="font-medium text-white text-sm">Shift Coverage Alert</h4>
                          <span className="text-xs text-muted-foreground">2 hours ago</span>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          Warehouse Zone B is below minimum coverage for the upcoming night shift.
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="integrations" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Integration Sidebar / List */}
              <div className="space-y-4">
                <Card className="bg-card border-border cursor-pointer ring-2 ring-primary">
                  <CardHeader className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-md bg-white flex items-center justify-center">
                        {/* Placeholder for Msegat Logo or Icon */}
                        <MessageSquare className="h-6 w-6 text-emerald-600" />
                      </div>
                      <div>
                        <CardTitle className="text-base text-white">Msegat SMS</CardTitle>
                        <CardDescription className="text-xs">Active</CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                </Card>

                <Card className="bg-card border-border opacity-60 cursor-not-allowed hover:opacity-100 transition-opacity">
                  <CardHeader className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-md bg-blue-500 flex items-center justify-center text-white">
                        <Mail className="h-5 w-5" />
                      </div>
                      <div>
                        <CardTitle className="text-base text-white">SMTP Email</CardTitle>
                        <CardDescription className="text-xs">Not Configured</CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                </Card>

                 <Card className="bg-card border-border opacity-60 cursor-not-allowed hover:opacity-100 transition-opacity">
                  <CardHeader className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-md bg-indigo-500 flex items-center justify-center text-white">
                        <Zap className="h-5 w-5" />
                      </div>
                      <div>
                        <CardTitle className="text-base text-white">Slack Webhook</CardTitle>
                        <CardDescription className="text-xs">Not Configured</CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                </Card>
              </div>

              {/* Configuration Panel */}
              <div className="md:col-span-2">
                <Card className="bg-card border-border">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <CardTitle className="text-xl text-white">Msegat SMS Gateway</CardTitle>
                        <CardDescription>
                          Configure your Msegat credentials to enable SMS notifications for workforce alerts.
                          <br />
                          <a href="https://msegat.docs.apiary.io/#" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline text-xs">
                            View API Documentation
                          </a>
                        </CardDescription>
                      </div>
                      <Switch 
                        checked={msegatConfig.enabled}
                        onCheckedChange={(c) => setMsegatConfig({...msegatConfig, enabled: c})}
                      />
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="grid gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="username" className="text-white">Msegat Username <span className="text-destructive">*</span></Label>
                        <Input 
                          id="username" 
                          placeholder="Enter your Msegat username" 
                          value={msegatConfig.username}
                          onChange={(e) => setMsegatConfig({...msegatConfig, username: e.target.value})}
                          className="bg-muted/30 border-border font-mono"
                        />
                      </div>
                      
                      <div className="space-y-2">
                        <Label htmlFor="apiKey" className="text-white">API Key <span className="text-destructive">*</span></Label>
                        <div className="relative">
                          <Input 
                            id="apiKey" 
                            type="password"
                            placeholder="Msegat API Key" 
                            value={msegatConfig.apiKey}
                            onChange={(e) => setMsegatConfig({...msegatConfig, apiKey: e.target.value})}
                            className="bg-muted/30 border-border font-mono pr-20"
                          />
                        </div>
                        <p className="text-xs text-muted-foreground">Found in your Msegat dashboard settings.</p>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="senderName" className="text-white">Sender Name (UserSender) <span className="text-destructive">*</span></Label>
                        <Input 
                          id="senderName" 
                          placeholder="e.g. WORKFORCE" 
                          value={msegatConfig.senderName}
                          onChange={(e) => setMsegatConfig({...msegatConfig, senderName: e.target.value})}
                          className="bg-muted/30 border-border"
                        />
                        <p className="text-xs text-muted-foreground">Must be activated in your Msegat account. Max 11 characters.</p>
                      </div>

                      <div className="space-y-2">
                        <Label className="text-white">Encoding</Label>
                        <div className="flex items-center gap-4">
                           <Badge variant="outline" className="bg-primary/10 text-primary border-primary">UTF-8</Badge>
                           <span className="text-xs text-muted-foreground">Default encoding for Arabic/English support</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-4 border-t border-border">
                      <Button variant="outline" onClick={handleTestConnection} className="border-border text-muted-foreground hover:text-white">
                        <CheckCircle2 className="mr-2 h-4 w-4" />
                        Test Connection
                      </Button>
                      <Button onClick={handleMsegatSave} className="bg-primary text-primary-foreground font-bold">
                        Save Configuration
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
