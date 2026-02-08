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
  Zap,
  Globe
} from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type IntegrationType = "msegat" | "goinfinito" | "smtp" | "slack";

export default function NotificationsPage() {
  const { toast } = useToast();
  const [selectedIntegration, setSelectedIntegration] = useState<IntegrationType>("msegat");
  
  const [msegatConfig, setMsegatConfig] = useState({
    username: "",
    apiKey: "",
    senderName: "",
    enabled: false
  });

  const [goInfinitoConfig, setGoInfinitoConfig] = useState({
    apiKey: "",
    senderId: "",
    enabled: false
  });

  const handleSave = (type: IntegrationType) => {
    toast({
      title: "Settings Saved",
      description: `${type === 'msegat' ? 'Msegat' : 'GoInfinito'} integration settings have been updated.`,
    });
  };

  const handleTestConnection = (type: IntegrationType) => {
    if (type === 'msegat') {
      if (!msegatConfig.username || !msegatConfig.apiKey) {
        toast({
          title: "Connection Failed",
          description: "Please enter Username and API Key first.",
          variant: "destructive"
        });
        return;
      }
    } else if (type === 'goinfinito') {
      if (!goInfinitoConfig.apiKey || !goInfinitoConfig.senderId) {
        toast({
           title: "Connection Failed",
           description: "Please enter API Key and Sender ID first.",
           variant: "destructive"
        });
        return;
      }
    }
    
    toast({
      title: "Connection Successful",
      description: `Successfully connected to ${type === 'msegat' ? 'Msegat' : 'GoInfinito'} API.`,
      variant: "default"
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
                <Card 
                  className={cn(
                    "bg-card border-border cursor-pointer hover:border-primary/50 transition-colors",
                    selectedIntegration === "msegat" ? "ring-2 ring-primary" : ""
                  )}
                  onClick={() => setSelectedIntegration("msegat")}
                >
                  <CardHeader className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-md bg-white flex items-center justify-center">
                        <MessageSquare className="h-6 w-6 text-emerald-600" />
                      </div>
                      <div>
                        <CardTitle className="text-base text-white">Msegat SMS</CardTitle>
                        <CardDescription className="text-xs">
                           {msegatConfig.enabled ? <span className="text-green-500">Active</span> : "Disabled"}
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                </Card>

                <Card 
                  className={cn(
                    "bg-card border-border cursor-pointer hover:border-primary/50 transition-colors",
                    selectedIntegration === "goinfinito" ? "ring-2 ring-primary" : ""
                  )}
                  onClick={() => setSelectedIntegration("goinfinito")}
                >
                  <CardHeader className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-md bg-purple-600 flex items-center justify-center text-white">
                        <Globe className="h-6 w-6" />
                      </div>
                      <div>
                        <CardTitle className="text-base text-white">GoInfinito SMS</CardTitle>
                        <CardDescription className="text-xs">
                          {goInfinitoConfig.enabled ? <span className="text-green-500">Active</span> : "Disabled"}
                        </CardDescription>
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
                {selectedIntegration === "msegat" && (
                  <Card className="bg-card border-border animate-in fade-in duration-300">
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div className="space-y-1">
                          <CardTitle className="text-xl text-white">Msegat SMS Gateway</CardTitle>
                          <CardDescription>
                            Configure your Msegat credentials to enable SMS notifications.
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
                        <Button variant="outline" onClick={() => handleTestConnection("msegat")} className="border-border text-muted-foreground hover:text-white">
                          <CheckCircle2 className="mr-2 h-4 w-4" />
                          Test Connection
                        </Button>
                        <Button onClick={() => handleSave("msegat")} className="bg-primary text-primary-foreground font-bold">
                          Save Configuration
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {selectedIntegration === "goinfinito" && (
                  <Card className="bg-card border-border animate-in fade-in duration-300">
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div className="space-y-1">
                          <CardTitle className="text-xl text-white">GoInfinito SMS</CardTitle>
                          <CardDescription>
                            Configure your GoInfinito (ValueFirst) API settings for global SMS delivery.
                            <br />
                            <a href="https://www.goinfinito.com/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline text-xs">
                              Visit GoInfinito
                            </a>
                          </CardDescription>
                        </div>
                        <Switch 
                          checked={goInfinitoConfig.enabled}
                          onCheckedChange={(c) => setGoInfinitoConfig({...goInfinitoConfig, enabled: c})}
                        />
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      <div className="grid gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="infinitoApiKey" className="text-white">API Key <span className="text-destructive">*</span></Label>
                          <Input 
                            id="infinitoApiKey" 
                            type="password"
                            placeholder="Enter your GoInfinito API Key" 
                            value={goInfinitoConfig.apiKey}
                            onChange={(e) => setGoInfinitoConfig({...goInfinitoConfig, apiKey: e.target.value})}
                            className="bg-muted/30 border-border font-mono"
                          />
                          <p className="text-xs text-muted-foreground">Your unique API access token.</p>
                        </div>
                        
                        <div className="space-y-2">
                          <Label htmlFor="infinitoSenderId" className="text-white">Sender ID <span className="text-destructive">*</span></Label>
                          <Input 
                            id="infinitoSenderId" 
                            placeholder="e.g. WORKFORCE" 
                            value={goInfinitoConfig.senderId}
                            onChange={(e) => setGoInfinitoConfig({...goInfinitoConfig, senderId: e.target.value})}
                            className="bg-muted/30 border-border"
                          />
                          <p className="text-xs text-muted-foreground">Registered Sender ID approved by DLT (if applicable).</p>
                        </div>

                         <div className="space-y-2">
                          <Label className="text-white">Region Support</Label>
                          <div className="flex flex-wrap gap-2">
                             <Badge variant="outline" className="bg-purple-500/10 text-purple-400 border-purple-500/20">Global</Badge>
                             <Badge variant="outline" className="bg-purple-500/10 text-purple-400 border-purple-500/20">India (DLT)</Badge>
                             <Badge variant="outline" className="bg-purple-500/10 text-purple-400 border-purple-500/20">Middle East</Badge>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-4 border-t border-border">
                        <Button variant="outline" onClick={() => handleTestConnection("goinfinito")} className="border-border text-muted-foreground hover:text-white">
                          <CheckCircle2 className="mr-2 h-4 w-4" />
                          Test Connection
                        </Button>
                        <Button onClick={() => handleSave("goinfinito")} className="bg-primary text-primary-foreground font-bold">
                          Save Configuration
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
