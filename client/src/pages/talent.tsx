import DashboardLayout from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { 
  Search, 
  Filter, 
  MoreHorizontal, 
  MapPin, 
  Briefcase, 
  Star,
  Download,
  Mail,
  Phone
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const candidates = [
  {
    id: "C-1024",
    name: "Sarah Williams",
    role: "Forklift Operator",
    location: "Chicago, IL",
    experience: "3 Years",
    rating: 4.8,
    status: "Active",
    email: "sarah.w@example.com",
    phone: "(555) 123-4567",
    avatar: "/avatar-1.png",
    skills: ["Forklift Certified", "Inventory Management", "Safety First"]
  },
  {
    id: "C-1025",
    name: "Michael Chen",
    role: "Warehouse Associate",
    location: "Austin, TX",
    experience: "1 Year",
    rating: 4.5,
    status: "Pending",
    email: "m.chen@example.com",
    phone: "(555) 987-6543",
    avatar: "/avatar-2.png",
    skills: ["Picking & Packing", "Scanning", "Fast Learner"]
  },
  {
    id: "C-1026",
    name: "David Rodriguez",
    role: "Logistics Coordinator",
    location: "Miami, FL",
    experience: "5 Years",
    rating: 5.0,
    status: "Active",
    email: "d.rodriguez@example.com",
    phone: "(555) 456-7890",
    avatar: "/avatar-3.png",
    skills: ["Supply Chain", "Team Leadership", "Bilingual"]
  },
  {
    id: "C-1027",
    name: "Emily Johnson",
    role: "Seasonal Associate",
    location: "Seattle, WA",
    experience: "Entry Level",
    rating: 4.2,
    status: "Inactive",
    email: "emily.j@example.com",
    phone: "(555) 234-5678",
    avatar: "/avatar-1.png",
    skills: ["Customer Service", "Retail", "Flexible"]
  },
  {
    id: "C-1028",
    name: "James Wilson",
    role: "Driver",
    location: "Denver, CO",
    experience: "2 Years",
    rating: 4.7,
    status: "Active",
    email: "j.wilson@example.com",
    phone: "(555) 876-5432",
    avatar: "/avatar-2.png",
    skills: ["CDL Class B", "Route Planning", "Punctual"]
  },
];

export default function TalentPage() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-display font-bold text-white tracking-tight">Talent Pool</h1>
          <p className="text-muted-foreground mt-1">Manage and search your candidate database.</p>
        </div>

        {/* Top Metric: Total Profiles */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="bg-card border-border shadow-sm border-l-4 border-l-primary">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                Total Profiles
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold font-display text-white">2,543</div>
              <p className="text-xs text-muted-foreground mt-1">
                <span className="text-green-500 font-medium">+124</span> new this week
              </p>
            </CardContent>
          </Card>
          
           <Card className="bg-card border-border shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                Active Candidates
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold font-display text-white">856</div>
              <p className="text-xs text-muted-foreground mt-1">
                Ready for placement
              </p>
            </CardContent>
          </Card>

           <Card className="bg-card border-border shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                Avg Rating
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold font-display text-white">4.7</div>
              <div className="flex items-center mt-1">
                <div className="flex text-yellow-500">
                  <Star className="h-3 w-3 fill-current" />
                  <Star className="h-3 w-3 fill-current" />
                  <Star className="h-3 w-3 fill-current" />
                  <Star className="h-3 w-3 fill-current" />
                  <Star className="h-3 w-3 fill-current" />
                </div>
                <span className="text-xs text-muted-foreground ml-2">Based on performance</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Search Bar Area */}
        <div className="flex flex-col md:flex-row gap-4 items-center bg-card p-4 rounded-sm border border-border">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input 
              placeholder="Search by name, role, skill, or ID..." 
              className="pl-10 h-12 bg-muted/30 border-border focus-visible:ring-primary/20 text-base" 
            />
          </div>
          <div className="flex gap-2 w-full md:w-auto">
            <Button variant="outline" className="h-12 border-border bg-background flex-1 md:flex-none">
              <Filter className="mr-2 h-4 w-4" />
              Filters
            </Button>
            <Button variant="outline" className="h-12 border-border bg-background flex-1 md:flex-none">
              <Download className="mr-2 h-4 w-4" />
              Export
            </Button>
          </div>
        </div>

        {/* Candidates List */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-lg font-display text-white">Candidate List</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="text-muted-foreground">Candidate</TableHead>
                  <TableHead className="text-muted-foreground hidden md:table-cell">Role & Skills</TableHead>
                  <TableHead className="text-muted-foreground hidden sm:table-cell">Status</TableHead>
                  <TableHead className="text-muted-foreground hidden lg:table-cell">Contact</TableHead>
                  <TableHead className="text-right text-muted-foreground">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {candidates.map((candidate) => (
                  <TableRow key={candidate.id} className="border-border hover:bg-muted/20">
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-10 w-10 border border-border">
                          <AvatarImage src={candidate.avatar} />
                          <AvatarFallback>{candidate.name.charAt(0)}</AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium text-white">{candidate.name}</p>
                          <div className="flex items-center text-xs text-muted-foreground gap-1">
                            <MapPin className="h-3 w-3" />
                            {candidate.location}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <div className="space-y-1">
                        <div className="flex items-center gap-1 text-sm font-medium text-white">
                          <Briefcase className="h-3 w-3 text-primary" />
                          {candidate.role}
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {candidate.skills.slice(0, 2).map((skill) => (
                            <Badge key={skill} variant="secondary" className="text-[10px] h-5 font-normal bg-muted/50 text-muted-foreground border-border/50">
                              {skill}
                            </Badge>
                          ))}
                          {candidate.skills.length > 2 && (
                            <Badge variant="secondary" className="text-[10px] h-5 font-normal bg-muted/50 text-muted-foreground border-border/50">
                              +{candidate.skills.length - 2}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <Badge 
                        variant="outline" 
                        className={`font-medium border-0 ${
                          candidate.status === "Active" ? "bg-green-500/10 text-green-500" :
                          candidate.status === "Pending" ? "bg-amber-500/10 text-amber-500" :
                          "bg-muted text-muted-foreground"
                        }`}
                      >
                        {candidate.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <div className="space-y-1 text-sm text-muted-foreground">
                        <div className="flex items-center gap-2">
                          <Mail className="h-3 w-3" />
                          {candidate.email}
                        </div>
                        <div className="flex items-center gap-2">
                          <Phone className="h-3 w-3" />
                          {candidate.phone}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-white">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
