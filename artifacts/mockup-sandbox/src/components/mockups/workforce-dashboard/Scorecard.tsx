import React, { useMemo } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Users,
  UserCheck,
  FileCheck,
  Briefcase,
  TrendingUp,
  TrendingDown,
  Activity,
  CalendarDays,
  CreditCard,
  CheckCircle2,
  Clock,
  MapPin,
  ChevronLeft,
  CalendarRange,
  UsersRound,
  ShieldCheck,
  ArrowUpRight,
  ArrowDownRight,
  Banknote,
  Minus
} from "lucide-react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
} from "recharts";

const FUNNEL_STAGES = [
  { id: 'talent', label: 'قاعدة المواهب', count: 1847, icon: Users, prev: null, trend: '+12%', trendDir: 'up', color: 'text-zinc-400' },
  { id: 'interviewed', label: 'تمت المقابلة', count: 1210, icon: UserCheck, prev: 1847, trend: '+5%', trendDir: 'up', color: 'text-zinc-300' },
  { id: 'hired', label: 'تم العرض', count: 894, icon: FileCheck, prev: 1210, trend: '-2%', trendDir: 'down', color: 'text-emerald-400' },
  { id: 'onboarded', label: 'مكتمل المسوغات', count: 812, icon: ShieldCheck, prev: 894, trend: '+1%', trendDir: 'up', color: 'text-emerald-500' },
  { id: 'active', label: 'عقود نشطة', count: 798, icon: Briefcase, prev: 812, trend: '0%', trendDir: 'flat', color: 'text-amber-400' },
  { id: 'shift', label: 'في الميدان حالياً', count: 612, icon: Activity, prev: 798, trend: '+18%', trendDir: 'up', color: 'text-amber-500' },
];

const ATTENDANCE_DATA = [
  { day: 'السبت', rate: 92, target: 95 },
  { day: 'الأحد', rate: 94, target: 95 },
  { day: 'الإثنين', rate: 91, target: 95 },
  { day: 'الثلاثاء', rate: 88, target: 95 },
  { day: 'الأربعاء', rate: 95, target: 95 },
  { day: 'الخميس', rate: 97, target: 95 },
  { day: 'الجمعة', rate: 96, target: 95 },
];

const EVENTS_PERFORMANCE = [
  { id: 1, name: 'موسم رمضان 1446', location: 'مكة المكرمة', staff: 4200, attendance: 96, budgetBurn: 45, status: 'good' },
  { id: 2, name: 'إسناد الحرم المكي', location: 'الحرم المكي', staff: 1850, attendance: 92, budgetBurn: 22, status: 'watching' },
  { id: 3, name: 'قطار الحرمين - رمضان', location: 'محطة مكة / جدة', staff: 650, attendance: 88, budgetBurn: 68, status: 'intervene' },
  { id: 4, name: 'مشروع الإعاشة المركزي', location: 'المشاعر المقدسة', staff: 400, attendance: 98, budgetBurn: 15, status: 'good' },
];

const PAYROLL_CYCLES = [
  { name: 'دورة مارس 2025', status: 'processing', amount: '2,450,000', progress: 85, expectedDate: '28 مارس' },
  { name: 'دورة فبراير 2025', status: 'completed', amount: '2,310,000', progress: 100, expectedDate: '28 فبراير' },
];

export function Scorecard() {
  return (
    <div dir="rtl" className="font-['Cairo'] min-h-screen bg-[#0a0a0b] text-zinc-100 p-6 selection:bg-amber-500/30">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-zinc-50 tracking-tight flex items-center gap-3">
            <Activity className="h-8 w-8 text-amber-500" />
            مؤشرات الأداء الرئيسية
          </h1>
          <p className="text-zinc-400 mt-2 flex items-center gap-2 text-sm">
            <CalendarDays className="h-4 w-4" />
            <span>موسم رمضان 1446</span>
            <span className="text-zinc-600">|</span>
            <span>تحديث: قبل دقيقتين</span>
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" className="border-zinc-800 bg-[#0f0f11] hover:bg-zinc-800 text-zinc-300">
            <CalendarRange className="h-4 w-4 ms-2" />
            تصفية بالمدة
          </Button>
          <Button className="bg-amber-600 hover:bg-amber-700 text-zinc-50 border-0">
            تصدير التقرير
          </Button>
        </div>
      </div>

      {/* The Funnel */}
      <div className="bg-[#0f0f11] border border-zinc-800/60 rounded-xl p-6 mb-8 shadow-2xl shadow-black/50 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-amber-600 via-emerald-500 to-zinc-600 opacity-20"></div>
        
        <h2 className="text-base font-semibold text-zinc-300 mb-6 flex items-center gap-2">
          <UsersRound className="h-5 w-5 text-zinc-500" />
          قمع الاستقطاب والتشغيل
          <Badge variant="outline" className="border-zinc-700 text-zinc-400 text-xs font-normal ms-2">آخر 7 أيام</Badge>
        </h2>

        <div className="flex flex-col lg:flex-row items-stretch justify-between gap-4 relative">
          
          {FUNNEL_STAGES.map((stage, idx) => {
            const isLast = idx === FUNNEL_STAGES.length - 1;
            const conversion = stage.prev ? Math.round((stage.count / stage.prev) * 100) : null;
            
            return (
              <React.Fragment key={stage.id}>
                {/* Stage Card */}
                <div className="flex-1 relative group">
                  <div className="p-4 rounded-lg border border-zinc-800 bg-[#141417] hover:bg-[#1a1a1e] transition-colors h-full">
                    <div className="flex justify-between items-start mb-4">
                      <div className={`p-2 rounded-md bg-[#1a1a1e] border border-zinc-800 ${stage.color}`}>
                        <stage.icon className="h-5 w-5" />
                      </div>
                      <div className="flex items-center gap-1 text-xs font-medium">
                        {stage.trendDir === 'up' && <ArrowUpRight className="h-3 w-3 text-emerald-500" />}
                        {stage.trendDir === 'down' && <ArrowDownRight className="h-3 w-3 text-rose-500" />}
                        {stage.trendDir === 'flat' && <Minus className="h-3 w-3 text-zinc-500" />}
                        <span className={
                          stage.trendDir === 'up' ? 'text-emerald-500' :
                          stage.trendDir === 'down' ? 'text-rose-500' : 'text-zinc-500'
                        }>{stage.trend}</span>
                      </div>
                    </div>
                    
                    <div className="text-3xl font-bold tracking-tight text-zinc-100 mb-1 font-mono">
                      {stage.count.toLocaleString('en-US')}
                    </div>
                    <div className="text-sm font-medium text-zinc-400">
                      {stage.label}
                    </div>

                    {/* Sparkline approximation */}
                    <div className="h-8 w-full mt-4 flex items-end gap-1 opacity-50 group-hover:opacity-100 transition-opacity">
                      {[...Array(7)].map((_, i) => (
                        <div 
                          key={i} 
                          className="flex-1 bg-zinc-700/50 rounded-t-sm" 
                          style={{ height: `${20 + Math.random() * 80}%` }}
                        ></div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Conversion Arrow */}
                {!isLast && (
                  <div className="hidden lg:flex flex-col items-center justify-center px-1 shrink-0 z-10 -mx-3">
                    <div className="bg-[#141417] border border-zinc-800 text-zinc-400 text-[10px] font-bold px-2 py-1 rounded-full z-10 font-mono">
                      {conversion}%
                    </div>
                    <div className="h-px w-8 bg-zinc-800 my-1"></div>
                    <ChevronLeft className="h-4 w-4 text-zinc-600" />
                  </div>
                )}
              </React.Fragment>
            );
          })}

        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column: Charts (takes 2 cols) */}
        <div className="lg:col-span-2 space-y-8">
          
          {/* Attendance Trend */}
          <Card className="bg-[#0f0f11] border-zinc-800 shadow-xl">
            <CardHeader className="pb-2">
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle className="text-lg text-zinc-200">معدل الحضور والانصراف</CardTitle>
                  <CardDescription className="text-zinc-500">متوسط الالتزام بالوقت في جميع المواقع</CardDescription>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold text-emerald-500 font-mono">94.2%</div>
                  <div className="text-xs text-zinc-500">متوسط 7 أيام</div>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="h-[260px] mt-4 w-full" dir="ltr">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={ATTENDANCE_DATA} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                    <XAxis 
                      dataKey="day" 
                      stroke="#52525b" 
                      fontSize={12}
                      tickLine={false}
                      axisLine={false}
                      dy={10}
                    />
                    <YAxis 
                      domain={[80, 100]} 
                      stroke="#52525b" 
                      fontSize={12}
                      tickLine={false}
                      axisLine={false}
                      dx={-10}
                      tickFormatter={(value) => `${value}%`}
                    />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', borderRadius: '8px' }}
                      itemStyle={{ color: '#e4e4e7' }}
                      formatter={(value) => [`${value}%`, 'معدل الحضور']}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="target" 
                      stroke="#52525b" 
                      strokeWidth={2}
                      strokeDasharray="5 5" 
                      dot={false}
                      name="المستهدف"
                    />
                    <Line 
                      type="monotone" 
                      dataKey="rate" 
                      stroke="#10b981" 
                      strokeWidth={3}
                      dot={{ r: 4, fill: '#10b981', strokeWidth: 2, stroke: '#0f0f11' }}
                      activeDot={{ r: 6, strokeWidth: 0 }}
                      name="معدل الحضور"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Event Performance Table */}
          <Card className="bg-[#0f0f11] border-zinc-800 shadow-xl overflow-hidden">
            <CardHeader className="border-b border-zinc-800/60 pb-4">
              <CardTitle className="text-lg text-zinc-200">أداء المواقع والمشاريع</CardTitle>
            </CardHeader>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-right">
                <thead className="bg-[#141417] text-zinc-400 border-b border-zinc-800 text-xs uppercase">
                  <tr>
                    <th className="px-6 py-4 font-semibold">المشروع</th>
                    <th className="px-6 py-4 font-semibold">الموقع</th>
                    <th className="px-6 py-4 font-semibold text-center">القوة العاملة</th>
                    <th className="px-6 py-4 font-semibold text-center">معدل الحضور</th>
                    <th className="px-6 py-4 font-semibold w-48">استهلاك الميزانية</th>
                    <th className="px-6 py-4 font-semibold text-center">الحالة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
                  {EVENTS_PERFORMANCE.map((event) => (
                    <tr key={event.id} className="hover:bg-[#141417]/50 transition-colors">
                      <td className="px-6 py-4 font-medium text-zinc-200">{event.name}</td>
                      <td className="px-6 py-4 text-zinc-400">
                        <div className="flex items-center gap-1.5">
                          <MapPin className="h-3 w-3" />
                          {event.location}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center font-mono">{event.staff.toLocaleString('en-US')}</td>
                      <td className="px-6 py-4 text-center">
                        <span className={`font-mono font-bold ${
                          event.attendance >= 95 ? 'text-emerald-500' : 
                          event.attendance >= 90 ? 'text-amber-500' : 'text-rose-500'
                        }`}>
                          {event.attendance}%
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <Progress 
                            value={event.budgetBurn} 
                            className="h-1.5 bg-zinc-800" 
                            indicatorColor={
                              event.budgetBurn > 85 ? 'bg-rose-500' :
                              event.budgetBurn > 60 ? 'bg-amber-500' : 'bg-emerald-500'
                            }
                          />
                          <span className="text-xs font-mono w-8 text-zinc-500">{event.budgetBurn}%</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        {event.status === 'good' && <Badge className="bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 border-emerald-500/20">منتظم</Badge>}
                        {event.status === 'watching' && <Badge className="bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 border-amber-500/20">مراقبة</Badge>}
                        {event.status === 'intervene' && <Badge className="bg-rose-500/10 text-rose-500 hover:bg-rose-500/20 border-rose-500/20">تدخل مطلوب</Badge>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

        </div>

        {/* Right Column */}
        <div className="space-y-8">
          
          {/* Active Operations Card */}
          <Card className="bg-gradient-to-br from-amber-600/10 to-[#0f0f11] border-amber-500/20 shadow-xl">
            <CardHeader>
              <CardTitle className="text-lg text-amber-500 flex items-center gap-2">
                <Clock className="h-5 w-5" />
                حالة التشغيل الآن
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <div className="flex justify-between items-end mb-2">
                  <span className="text-sm font-medium text-zinc-300">مناوبون في المواقع</span>
                  <span className="text-2xl font-bold text-zinc-100 font-mono">612</span>
                </div>
                <Progress value={76} className="h-2 bg-zinc-800" indicatorColor="bg-amber-500" />
                <div className="mt-2 flex justify-between text-xs text-zinc-500">
                  <span>المستهدف: 800</span>
                  <span>76% من السعة</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-4 border-t border-zinc-800/60">
                <div>
                  <div className="text-xs text-zinc-500 mb-1">الغياب المحتمل</div>
                  <div className="text-xl font-bold text-rose-500 font-mono">24</div>
                </div>
                <div>
                  <div className="text-xs text-zinc-500 mb-1">تجاوز ساعات العمل</div>
                  <div className="text-xl font-bold text-amber-500 font-mono">18</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Payroll Cycles */}
          <Card className="bg-[#0f0f11] border-zinc-800 shadow-xl">
            <CardHeader className="pb-4 border-b border-zinc-800/60">
              <CardTitle className="text-lg text-zinc-200 flex items-center gap-2">
                <Banknote className="h-5 w-5 text-zinc-400" />
                دورات المسيرات (WPS)
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6 space-y-6">
              {PAYROLL_CYCLES.map((cycle, idx) => (
                <div key={idx} className="space-y-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="font-semibold text-zinc-200">{cycle.name}</div>
                      <div className="text-xs text-zinc-500 flex items-center gap-1 mt-1">
                        <CalendarDays className="h-3 w-3" />
                        تاريخ الصرف المتوقع: {cycle.expectedDate}
                      </div>
                    </div>
                    <div className="text-left">
                      <div className="font-mono text-zinc-300">SAR {cycle.amount}</div>
                      {cycle.status === 'completed' 
                        ? <span className="text-xs text-emerald-500 font-medium">مكتمل ومدفوع</span>
                        : <span className="text-xs text-amber-500 font-medium">قيد المعالجة</span>
                      }
                    </div>
                  </div>
                  
                  {cycle.status === 'processing' && (
                    <div className="space-y-1">
                      <div className="flex justify-between text-[10px] text-zinc-400">
                        <span>مراجعة الحضور (85%)</span>
                        <span>اعتماد البنك</span>
                      </div>
                      <Progress value={cycle.progress} className="h-1.5 bg-zinc-800" indicatorColor="bg-emerald-500" />
                    </div>
                  )}
                  {cycle.status === 'completed' && (
                    <div className="h-1.5 w-full rounded-full bg-emerald-500/20 overflow-hidden flex">
                      <div className="h-full bg-emerald-500 w-full"></div>
                    </div>
                  )}
                </div>
              ))}

              <Button variant="outline" className="w-full border-zinc-800 bg-zinc-900/50 hover:bg-zinc-800 text-zinc-300 mt-2">
                إدارة المسيرات
              </Button>
            </CardContent>
          </Card>

        </div>
      </div>
    </div>
  );
}
