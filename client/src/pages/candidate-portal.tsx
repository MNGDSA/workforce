import { useState } from "react";
import { Link, useLocation } from "wouter";
import { 
  Building2, 
  LogOut, 
  Briefcase, 
  MapPin, 
  Clock, 
  CheckCircle2, 
  UploadCloud, 
  Calendar as CalendarIcon, 
  ChevronRight,
  User,
  Settings,
  Bell,
  Search,
  FileText
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar } from "@/components/ui/calendar";

export default function CandidatePortal() {
  const [date, setDate] = useState<Date | undefined>(new Date());
  const [, setLocation] = useLocation();

  const handleSignOut = () => {
    setLocation("/auth");
  };

  const recommendedJobs = [
    {
      id: 1,
      title: "Warehouse Associate",
      location: "Chicago, IL (Zone A)",
      type: "Seasonal Full-time",
      pay: "$18.50/hr",
      posted: "2 days ago",
      match: 95
    },
    {
      id: 2,
      title: "Logistics Coordinator",
      location: "Remote / Hybrid",
      type: "Contract",
      pay: "$24.00/hr",
      posted: "5 hours ago",
      match: 82
    },
    {
      id: 3,
      title: "Inventory Clerk",
      location: "Chicago, IL (Zone B)",
      type: "Part-time",
      pay: "$16.75/hr",
      posted: "1 week ago",
      match: 70
    }
  ];

  return (
    <div className="min-h-screen bg-background font-sans text-foreground flex flex-col">
      {/* Navbar */}
      <header className="h-16 border-b border-border bg-background/80 backdrop-blur-md sticky top-0 z-50 px-4 lg:px-8 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 bg-primary rounded-sm flex items-center justify-center text-primary-foreground">
            <Building2 className="h-5 w-5" />
          </div>
          <span className="font-display font-bold text-xl tracking-tight text-white hidden sm:inline-block">
            WORKFORCE<span className="text-primary">.IO</span>
          </span>
        </div>

        <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
          <a href="#" className="text-primary hover:text-primary transition-colors">Dashboard</a>
          <a href="#" className="text-muted-foreground hover:text-white transition-colors">My Jobs</a>
          <a href="#" className="text-muted-foreground hover:text-white transition-colors">Documents</a>
          <a href="#" className="text-muted-foreground hover:text-white transition-colors">Schedule</a>
        </nav>

        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-white relative">
            <Bell className="h-5 w-5" />
            <span className="absolute top-2 right-2 h-2 w-2 bg-destructive rounded-full" />
          </Button>
          
          <div className="flex items-center gap-3 pl-4 border-l border-border/50">
            <div className="text-right hidden sm:block">
              <div className="text-sm font-medium text-white">Alex Candidate</div>
              <div className="text-xs text-muted-foreground">ID: C-1024</div>
            </div>
            <Avatar className="h-9 w-9 border border-border">
              <AvatarImage src="/avatar-candidate.png" />
              <AvatarFallback className="bg-primary/20 text-primary font-bold">AC</AvatarFallback>
            </Avatar>
            <Button variant="ghost" size="icon" onClick={handleSignOut} className="text-muted-foreground hover:text-destructive">
              <LogOut className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 p-4 lg:p-8 max-w-7xl mx-auto w-full space-y-8 animate-in fade-in duration-500">
        
        {/* Welcome Section */}
        <div className="flex flex-col md:flex-row gap-6 md:items-center justify-between">
          <div>
            <h1 className="text-3xl font-display font-bold text-white tracking-tight">Candidate Portal</h1>
            <p className="text-muted-foreground mt-1">Manage your profile, applications, and availability.</p>
          </div>
          <div className="flex gap-3">
             <Button variant="outline" className="border-border">
                <User className="mr-2 h-4 w-4" />
                Edit Profile
             </Button>
             <Button className="bg-primary text-primary-foreground font-bold">
                <Search className="mr-2 h-4 w-4" />
                Find Jobs
             </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Left Column: Profile & Stats */}
          <div className="space-y-6">
            <Card className="bg-card border-border overflow-hidden">
              <div className="h-24 bg-gradient-to-r from-primary/20 to-primary/5"></div>
              <CardContent className="pt-0 -mt-12 text-center relative z-10">
                <Avatar className="h-24 w-24 border-4 border-card mx-auto">
                   <AvatarFallback className="text-2xl bg-muted text-muted-foreground">AC</AvatarFallback>
                </Avatar>
                <div className="mt-4">
                  <h3 className="font-bold text-xl text-white">Alex Candidate</h3>
                  <p className="text-muted-foreground text-sm">Warehouse Specialist</p>
                </div>
                
                <div className="mt-6 flex justify-center gap-2">
                   <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">Active</Badge>
                   <Badge variant="outline" className="bg-blue-500/10 text-blue-500 border-blue-500/20">Available</Badge>
                </div>

                <div className="mt-8 grid grid-cols-2 gap-4 border-t border-border pt-6">
                  <div>
                    <div className="text-2xl font-bold text-white">4</div>
                    <div className="text-xs text-muted-foreground uppercase tracking-wider">Applied</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-white">1</div>
                    <div className="text-xs text-muted-foreground uppercase tracking-wider">Interviews</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="text-lg font-display text-white">Profile Completion</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-muted-foreground">Overall Strength</span>
                  <span className="text-primary font-bold">75%</span>
                </div>
                <Progress value={75} className="h-2" />
                
                <div className="space-y-2 mt-4">
                   <div className="flex items-center gap-3 text-sm p-2 rounded-md bg-muted/20">
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      <span className="text-muted-foreground line-through">Basic Information</span>
                   </div>
                   <div className="flex items-center justify-between text-sm p-2 rounded-md bg-muted/20 border border-primary/20">
                      <div className="flex items-center gap-3">
                        <div className="h-4 w-4 rounded-full border-2 border-primary" />
                        <span className="text-white">Upload Resume</span>
                      </div>
                      <Button size="icon" variant="ghost" className="h-6 w-6">
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                   </div>
                   <div className="flex items-center gap-3 text-sm p-2 rounded-md bg-muted/20 opacity-60">
                      <div className="h-4 w-4 rounded-full border-2 border-muted-foreground" />
                      <span className="text-muted-foreground">National/Resident ID</span>
                   </div>
                   <div className="flex items-center gap-3 text-sm p-2 rounded-md bg-muted/20 opacity-60">
                      <div className="h-4 w-4 rounded-full border-2 border-muted-foreground" />
                      <span className="text-muted-foreground">Personal Photo</span>
                   </div>
                   <div className="flex items-center gap-3 text-sm p-2 rounded-md bg-muted/20 opacity-60">
                      <div className="h-4 w-4 rounded-full border-2 border-muted-foreground" />
                      <span className="text-muted-foreground">IBAN Certificate</span>
                   </div>
                   <div className="flex items-center gap-3 text-sm p-2 rounded-md bg-muted/20 opacity-60">
                      <div className="h-4 w-4 rounded-full border-2 border-muted-foreground" />
                      <span className="text-muted-foreground">Background Certificate</span>
                   </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="text-lg font-display text-white">My Documents</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                 <div className="flex items-center justify-between p-3 rounded-md bg-muted/20 hover:bg-muted/30 transition-colors cursor-pointer border border-transparent hover:border-border/50">
                    <div className="flex items-center gap-3">
                       <FileText className="h-8 w-8 text-blue-400" />
                       <div>
                          <div className="text-sm font-medium text-white">Resume_v4.pdf</div>
                          <div className="text-xs text-muted-foreground">Uploaded Oct 24</div>
                       </div>
                    </div>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                       <Settings className="h-4 w-4" />
                    </Button>
                 </div>
                 
                 <Button variant="outline" className="w-full border-dashed border-border text-muted-foreground hover:text-white hover:border-primary/50 hover:bg-primary/5">
                    <UploadCloud className="mr-2 h-4 w-4" />
                    Upload New Document
                 </Button>
              </CardContent>
            </Card>
          </div>

          {/* Middle & Right: Main Content */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* Availability Calendar (Simplified) */}
            <Card className="bg-card border-border">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div>
                   <CardTitle className="text-lg font-display text-white">Availability</CardTitle>
                   <CardDescription>Mark your available dates for shifts</CardDescription>
                </div>
                <Badge variant="secondary" className="bg-primary/20 text-primary hover:bg-primary/30">
                   Open for Shifts
                </Badge>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col md:flex-row gap-6">
                  <Calendar
                    mode="single"
                    selected={date}
                    onSelect={setDate}
                    className="rounded-md border border-border"
                  />
                  <div className="flex-1 space-y-4">
                     <h4 className="font-medium text-white text-sm uppercase tracking-wider mb-2">Shift Preferences</h4>
                     <div className="grid grid-cols-2 gap-3">
                        <Button variant="outline" className="justify-start border-primary bg-primary/10 text-white">
                           <Clock className="mr-2 h-4 w-4 text-primary" />
                           Morning (6AM - 2PM)
                        </Button>
                        <Button variant="outline" className="justify-start border-border text-muted-foreground">
                           <Clock className="mr-2 h-4 w-4" />
                           Afternoon (2PM - 10PM)
                        </Button>
                        <Button variant="outline" className="justify-start border-border text-muted-foreground">
                           <Clock className="mr-2 h-4 w-4" />
                           Night (10PM - 6AM)
                        </Button>
                        <Button variant="outline" className="justify-start border-primary bg-primary/10 text-white">
                           <CalendarIcon className="mr-2 h-4 w-4 text-primary" />
                           Weekends
                        </Button>
                     </div>
                     
                     <div className="pt-4 mt-4 border-t border-border">
                        <Button className="w-full bg-white text-black font-bold hover:bg-white/90">
                           Update Availability
                        </Button>
                     </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Tabs defaultValue="recommended">
              <div className="flex items-center justify-between mb-4">
                 <h3 className="text-xl font-display font-bold text-white">Job Opportunities</h3>
                 <TabsList className="bg-muted/20">
                    <TabsTrigger value="recommended">Recommended</TabsTrigger>
                    <TabsTrigger value="applied">Applied (4)</TabsTrigger>
                    <TabsTrigger value="saved">Saved</TabsTrigger>
                 </TabsList>
              </div>

              <TabsContent value="recommended" className="space-y-4">
                 {recommendedJobs.map((job) => (
                    <Card key={job.id} className="bg-card border-border hover:border-primary/50 transition-all cursor-pointer group">
                       <CardContent className="p-6">
                          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                             <div className="flex-1">
                                <div className="flex items-center gap-3 mb-1">
                                   <h4 className="font-bold text-lg text-white group-hover:text-primary transition-colors">{job.title}</h4>
                                   <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 border-0">
                                      {job.match}% Match
                                   </Badge>
                                </div>
                                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
                                   <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {job.location}</span>
                                   <span className="flex items-center gap-1"><Briefcase className="h-3 w-3" /> {job.type}</span>
                                   <span className="flex items-center gap-1 text-white font-medium"><span className="text-muted-foreground font-normal">Pay:</span> {job.pay}</span>
                                   <span className="text-xs opacity-60">• {job.posted}</span>
                                </div>
                             </div>
                             <div className="flex items-center gap-3">
                                <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-white">
                                   <div className="h-5 w-5 border-2 border-current rounded-sm" />
                                </Button>
                                <Button className="bg-white text-black font-bold hover:bg-white/90">
                                   Apply Now
                                </Button>
                             </div>
                          </div>
                       </CardContent>
                    </Card>
                 ))}
              </TabsContent>
              
              <TabsContent value="applied">
                 <div className="p-8 text-center text-muted-foreground bg-card border border-border border-dashed rounded-md">
                    No active applications found for this filter.
                 </div>
              </TabsContent>
            </Tabs>

          </div>
        </div>
      </main>
    </div>
  );
}
