import React, { useState, useEffect } from "react";
import { 
  Clock, 
  MapPin, 
  AlertTriangle, 
  CheckCircle2, 
  UserX, 
  Activity,
  ArrowUpRight,
  ArrowDownRight,
  MoreVertical,
  Camera,
  Signal,
  WifiOff,
  Crosshair,
  TrendingUp,
  Search,
  Filter
} from "lucide-react";
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle, 
  CardDescription 
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// Mock Data
const LIVE_STATS = {
  totalExpected: 4820,
  currentlyOnSite: 4247,
  late: 112,
  absent: 461,
  recentPunches: 312 // last 15 min
};

const SITES = [
  { id: 1, name: "مشعر منى", expected: 1200, actual: 1150, status: "healthy", trend: "+45" },
  { id: 2, name: "الحرم المكي - التوسعة", expected: 850, actual: 840, status: "healthy", trend: "+12" },
  { id: 3, name: "جسر الجمرات", expected: 950, actual: 780, status: "warning", trend: "+8" },
  { id: 4, name: "محطة قطار الحرمين", expected: 400, actual: 395, status: "healthy", trend: "+2" },
  { id: 5, name: "مطار الملك عبدالعزيز - صالة الحجاج", expected: 1420, actual: 1082, status: "alert", trend: "-5" },
];

const ALERTS = [
  { id: 1, type: "geofence", severity: "high", message: "رفض تسجيل حضور متكرر (14 محاولة) خارج النطاق", location: "مشعر منى", time: "منذ دقيقتين", target: "بوابة 4" },
  { id: 2, type: "selfie", severity: "medium", message: "فشل التحقق من الصورة 3 مرات متتالية", location: "مطار الملك عبدالعزيز", time: "منذ 5 دقائق", target: "محمد العتيبي" },
  { id: 3, type: "absence", severity: "high", message: "نقص حاد في القوة العاملة (أقل من 80%)", location: "جسر الجمرات", time: "منذ 10 دقائق", target: "وردية الصباح" },
  { id: 4, type: "offline", severity: "medium", message: "انقطاع الاتصال بجهاز البصمة الرئيسي", location: "الحرم المكي", time: "منذ 15 دقيقة", target: "نقطة تجمع أ" },
];

const RECENT_PUNCHES = [
  { id: 101, name: "فاطمة الزهراني", role: "مرشد حجاج", location: "الحرم المكي - التوسعة", time: "05:42 ص", status: "on-time", photo: "https://i.pravatar.cc/150?u=1" },
  { id: 102, name: "عبدالله القرني", role: "مشرف ميداني", location: "مشعر منى", time: "05:41 ص", status: "late", photo: "https://i.pravatar.cc/150?u=2" },
  { id: 103, name: "سعد الدوسري", role: "حارس أمن", location: "مطار الملك عبدالعزيز", time: "05:40 ص", status: "on-time", photo: "https://i.pravatar.cc/150?u=3" },
  { id: 104, name: "نورة الشمري", role: "منسق موقع", location: "جسر الجمرات", time: "05:38 ص", status: "on-time", photo: "https://i.pravatar.cc/150?u=4" },
  { id: 105, name: "خالد المطيري", role: "فني تكييف", location: "مشعر منى", time: "05:35 ص", status: "on-time", photo: "https://i.pravatar.cc/150?u=5" },
  { id: 106, name: "ريم العبدالله", role: "مرشد حجاج", location: "محطة قطار الحرمين", time: "05:31 ص", status: "late", photo: "https://i.pravatar.cc/150?u=6" },
];

export function Cockpit() {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString("ar-SA", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  const accentColor = "text-[#00e5ff]"; // Cyan/Teal for high-tech telemetry feel
  const accentBg = "bg-[#00e5ff]";

  return (
    <div dir="rtl" className="font-['Cairo'] min-h-screen bg-[#0a0a0b] text-slate-300 p-4 md:p-6 overflow-x-hidden selection:bg-[#00e5ff]/30">
      
      {/* Header / Top Bar */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 border-b border-white/5 pb-4 gap-4">
        <div className="flex items-center gap-4">
          <div className="h-10 w-10 rounded bg-[#00e5ff]/10 border border-[#00e5ff]/30 flex items-center justify-center">
            <Activity className={`h-6 w-6 ${accentColor}`} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight leading-none">غرفة العمليات المركزية</h1>
            <p className="text-sm text-slate-500 mt-1 flex items-center gap-2">
              <span className="flex h-2 w-2 relative">
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${accentBg} opacity-75`}></span>
                <span className={`relative inline-flex rounded-full h-2 w-2 ${accentBg}`}></span>
              </span>
              متصل بالشبكة الميدانية - تحديث حي
            </p>
          </div>
        </div>

        <div className="flex items-center gap-6 bg-white/5 px-4 py-2 rounded-lg border border-white/10">
          <div className="text-end">
            <div className="text-xs text-slate-400">بتوقيت مكة المكرمة</div>
            <div className="font-mono text-xl font-bold text-white tracking-wider" dir="ltr">{formatTime(time)}</div>
          </div>
          <div className="w-px h-8 bg-white/10"></div>
          <div className="text-end">
            <div className="text-xs text-slate-400">التاريخ</div>
            <div className="text-sm font-medium text-white">14 رمضان 1447</div>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: Live Stats & Sites (Takes up 8 cols) */}
        <div className="lg:col-span-8 flex flex-col gap-6">
          
          {/* Main Telemetry Strip */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="bg-white/5 border-white/10 border-l-[3px] border-l-[#00e5ff] rounded-sm">
              <CardContent className="p-4 flex flex-col justify-center">
                <p className="text-xs text-slate-400 font-medium mb-1">المتواجدون ميدانياً</p>
                <div className="flex items-baseline gap-2">
                  <span className={`text-3xl font-bold font-mono ${accentColor}`}>{LIVE_STATS.currentlyOnSite}</span>
                  <span className="text-sm text-slate-500 font-mono">/ {LIVE_STATS.totalExpected}</span>
                </div>
                <div className="mt-2 flex items-center text-[10px] text-[#00e5ff]/80">
                  <TrendingUp className="h-3 w-3 me-1" />
                  <span>+{LIVE_STATS.recentPunches} خلال 15 دقيقة</span>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-white/5 border-white/10 rounded-sm">
              <CardContent className="p-4 flex flex-col justify-center">
                <p className="text-xs text-slate-400 font-medium mb-1">الغياب</p>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-bold font-mono text-slate-200">{LIVE_STATS.absent}</span>
                </div>
                <Progress value={(LIVE_STATS.absent / LIVE_STATS.totalExpected) * 100} className="h-1 mt-3 bg-white/10" indicatorClassName="bg-slate-400" />
              </CardContent>
            </Card>

            <Card className="bg-white/5 border-white/10 border-l-[3px] border-l-amber-500 rounded-sm">
              <CardContent className="p-4 flex flex-col justify-center">
                <p className="text-xs text-slate-400 font-medium mb-1">المتأخرون</p>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-bold font-mono text-amber-500">{LIVE_STATS.late}</span>
                </div>
                <div className="mt-2 flex items-center text-[10px] text-amber-500/80">
                  <AlertTriangle className="h-3 w-3 me-1" />
                  <span>يتطلب اتخاذ إجراء</span>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-white/5 border-white/10 rounded-sm">
              <CardContent className="p-4 flex flex-col justify-center">
                <p className="text-xs text-slate-400 font-medium mb-1">نسبة التغطية الكلية</p>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-bold font-mono text-emerald-400">88%</span>
                </div>
                <Progress value={88} className="h-1 mt-3 bg-white/10" indicatorClassName="bg-emerald-400" />
              </CardContent>
            </Card>
          </div>

          {/* Sites Overview */}
          <Card className="bg-[#0f0f11] border-white/10 rounded-sm flex-1">
            <CardHeader className="pb-2 border-b border-white/5 px-4 py-3 flex flex-row items-center justify-between">
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-slate-400" />
                <CardTitle className="text-sm font-medium text-slate-200">حالة المواقع التشغيلية</CardTitle>
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" className="h-7 text-xs text-slate-400 hover:text-white hover:bg-white/10">الخريطة</Button>
                <Button variant="ghost" size="sm" className="h-7 text-xs text-slate-400 hover:text-white hover:bg-white/10">القائمة</Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-white/5">
                {SITES.map((site) => (
                  <div key={site.id} className="p-4 hover:bg-white/[0.02] transition-colors flex items-center justify-between group">
                    <div className="flex items-center gap-4 flex-1">
                      <div className={`h-2 w-2 rounded-full ${
                        site.status === 'healthy' ? 'bg-emerald-500' :
                        site.status === 'warning' ? 'bg-amber-500' : 'bg-rose-500'
                      } shadow-[0_0_8px_rgba(0,0,0,0.5)]`} />
                      <div className="w-1/3 min-w-[150px]">
                        <h4 className="text-sm font-medium text-slate-200">{site.name}</h4>
                        <div className="text-[10px] text-slate-500 mt-1 flex items-center gap-1">
                          <Signal className="h-3 w-3" /> استقرار النطاق الجغرافي
                        </div>
                      </div>
                      
                      <div className="flex-1 px-4 hidden sm:block">
                        <div className="flex justify-between text-xs mb-1">
                          <span className="font-mono text-slate-300">{site.actual} / {site.expected}</span>
                          <span className="font-mono text-slate-400">{Math.round((site.actual/site.expected)*100)}%</span>
                        </div>
                        <Progress 
                          value={(site.actual / site.expected) * 100} 
                          className="h-1.5 bg-white/5" 
                          indicatorClassName={
                            site.status === 'healthy' ? 'bg-[#00e5ff]' :
                            site.status === 'warning' ? 'bg-amber-500' : 'bg-rose-500'
                          } 
                        />
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-6">
                      <div className={`flex items-center gap-1 text-xs font-mono w-16 justify-end ${
                        site.trend.startsWith('+') ? 'text-emerald-400' : 'text-rose-400'
                      }`}>
                        {site.trend.startsWith('+') ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                        {site.trend}
                      </div>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity">
                        <ArrowUpRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
          
        </div>

        {/* Right Column: Live Feed & Alerts (Takes up 4 cols) */}
        <div className="lg:col-span-4 flex flex-col gap-6">
          
          {/* Actionable Alerts */}
          <Card className="bg-rose-500/5 border-rose-500/20 rounded-sm">
            <CardHeader className="pb-2 border-b border-rose-500/10 px-4 py-3 flex flex-row items-center justify-between">
              <div className="flex items-center gap-2 text-rose-500">
                <AlertTriangle className="h-4 w-4" />
                <CardTitle className="text-sm font-medium">تنبيهات حرجة</CardTitle>
                <Badge variant="outline" className="ms-2 bg-rose-500/10 text-rose-400 border-rose-500/30 text-[10px] h-5 px-1.5">
                  {ALERTS.length}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[220px]">
                <div className="divide-y divide-rose-500/10">
                  {ALERTS.map((alert) => (
                    <div key={alert.id} className="p-3 hover:bg-rose-500/10 transition-colors">
                      <div className="flex justify-between items-start mb-1">
                        <span className="text-xs font-bold text-rose-400">{alert.message}</span>
                        <span className="text-[10px] text-slate-500 font-mono">{alert.time}</span>
                      </div>
                      <div className="flex items-center justify-between mt-2">
                        <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
                          {alert.type === 'geofence' ? <Crosshair className="h-3 w-3" /> :
                           alert.type === 'selfie' ? <Camera className="h-3 w-3" /> :
                           alert.type === 'offline' ? <WifiOff className="h-3 w-3" /> :
                           <UserX className="h-3 w-3" />}
                          {alert.location} <span className="text-slate-600">•</span> {alert.target}
                        </div>
                        <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2 text-rose-300 hover:text-rose-100 hover:bg-rose-500/20">
                          تدخل
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Live Punch Feed */}
          <Card className="bg-[#0f0f11] border-white/10 rounded-sm flex-1 flex flex-col min-h-[300px]">
            <CardHeader className="pb-2 border-b border-white/5 px-4 py-3 flex flex-row items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-[#00e5ff]" />
                <CardTitle className="text-sm font-medium text-slate-200">سجل البصمات المباشر</CardTitle>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-1.5 w-1.5 rounded-full bg-[#00e5ff] animate-pulse"></div>
                <span className="text-[10px] text-slate-500">مباشر</span>
              </div>
            </CardHeader>
            <CardContent className="p-0 flex-1 relative overflow-hidden">
              {/* Fade out effect at bottom */}
              <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-[#0f0f11] to-transparent z-10 pointer-events-none"></div>
              
              <ScrollArea className="h-[380px]">
                <div className="p-2 space-y-1">
                  {RECENT_PUNCHES.map((punch, index) => (
                    <div 
                      key={punch.id} 
                      className={`flex items-center p-2 rounded border border-white/5 bg-white/[0.01] hover:bg-white/[0.03] transition-all
                        ${index === 0 ? 'animate-in fade-in slide-in-from-top-2 duration-500' : ''}
                      `}
                    >
                      <Avatar className="h-8 w-8 rounded border border-white/10 shrink-0">
                        <AvatarImage src={punch.photo} />
                        <AvatarFallback className="rounded bg-slate-800 text-xs">{punch.name.substring(0,2)}</AvatarFallback>
                      </Avatar>
                      
                      <div className="ms-3 flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium text-slate-200 truncate">{punch.name}</p>
                          <span className="text-[10px] font-mono text-slate-500">{punch.time}</span>
                        </div>
                        <div className="flex items-center justify-between mt-0.5">
                          <p className="text-[10px] text-slate-400 truncate">{punch.role} • {punch.location}</p>
                          {punch.status === 'on-time' ? (
                            <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0" />
                          ) : (
                            <AlertTriangle className="h-3 w-3 text-amber-500 shrink-0" />
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
          
        </div>
      </div>
    </div>
  );
}
