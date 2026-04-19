import React, { useState } from "react";
import { 
  Check, 
  X, 
  Clock, 
  Camera, 
  FileSignature, 
  MessageSquare, 
  MoreHorizontal,
  ChevronRight,
  AlertCircle,
  CheckCircle2,
  TrendingDown,
  User,
  MapPin
} from "lucide-react";
const cn = (...args: (string | false | null | undefined)[]) => args.filter(Boolean).join(" ");
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";

// Accent color theme: Electric Indigo (hsl(245, 82%, 65%)) for calm focus
// Dark base: #0a0a0b

const MOCK_DATA = {
  late: [
    {
      id: "l1",
      type: "late",
      time: "05:42 ص",
      person: {
        name: "محمد العتيبي",
        role: "مشرف ميداني",
        site: "جسر الجمرات",
        initials: "مع"
      },
      details: "متأخر 38 دقيقة - ازدحام شديد في نقطة التفتيش رقم 4",
    },
    {
      id: "l2",
      type: "late",
      time: "06:15 ص",
      person: {
        name: "عبدالله القرني",
        role: "منسق موقع",
        site: "محطة قطار الحرمين",
        initials: "عق"
      },
      details: "متأخر 15 دقيقة - عطل في حافلة النقل",
    },
    {
      id: "l3",
      type: "late",
      time: "06:30 ص",
      person: {
        name: "فاطمة الزهراني",
        role: "مرشدة حجاج",
        site: "الحرم المكي - باب الملك فهد",
        initials: "فز"
      },
      details: "متأخرة 45 دقيقة - ظرف صحي طارئ",
    }
  ],
  selfie: [
    {
      id: "s1",
      type: "selfie",
      time: "05:55 ص",
      person: {
        name: "سعد الدوسري",
        role: "حارس أمن",
        site: "مشعر منى - مخيم 82",
        initials: "سد"
      },
      details: "إضاءة منخفضة جداً، يتعذر تطابق الوجه مع النظام",
    },
    {
      id: "s2",
      type: "selfie",
      time: "06:02 ص",
      person: {
        name: "نورة الشمري",
        role: "مراقبة جودة",
        site: "مطار الملك عبدالعزيز",
        initials: "نش"
      },
      details: "لم يتم التعرف على الزي الرسمي في الصورة",
    }
  ],
  contract: [
    {
      id: "c1",
      type: "contract",
      time: "أمس",
      person: {
        name: "خالد المطيري",
        role: "فني تكييف",
        site: "مجمع الخيام بمنى",
        initials: "خم"
      },
      details: "تم توقيع العقد من قبل المرشح، بانتظار الاعتماد النهائي",
    },
    {
      id: "c2",
      type: "contract",
      time: "أمس",
      person: {
        name: "أحمد الحربي",
        role: "سائق رافعة",
        site: "المستودع المركزي",
        initials: "أح"
      },
      details: "تم توقيع العقد، اكتمال الفحص الطبي",
    }
  ],
  broadcast: [
    {
      id: "b1",
      type: "broadcast",
      time: "مجدول: 08:00 ص",
      title: "تنبيه تغيير مسار الحافلات",
      details: "إلى جميع العاملين في مشعر عرفات: تم تحويل مسار الحافلات إلى الطريق الدائري الشمالي.",
      count: 1450,
    }
  ]
};

export function Queue() {
  const [items, setItems] = useState(() => ({ ...MOCK_DATA }));
  const [clearing, setClearing] = useState<string | null>(null);

  const totalItems = items.late.length + items.selfie.length + items.contract.length + items.broadcast.length;
  const initialTotal = 8; // Based on mock data
  const progress = Math.max(0, ((initialTotal - totalItems) / initialTotal) * 100);

  const handleAction = (category: keyof typeof MOCK_DATA, id: string) => {
    setClearing(id);
    setTimeout(() => {
      setItems(prev => ({
        ...prev,
        [category]: prev[category].filter((item: any) => item.id !== id)
      }));
      setClearing(null);
    }, 300); // match transition duration
  };

  return (
    <div dir="rtl" className="font-['Cairo'] min-h-screen bg-[#0a0a0b] text-zinc-100 flex overflow-hidden selection:bg-indigo-500/30">
      {/* Pulse Rail (Sidebar) */}
      <aside className="w-80 border-l border-zinc-800/50 bg-[#0f0f11] flex flex-col hidden lg:flex shrink-0">
        <div className="p-6 border-b border-zinc-800/50">
          <h1 className="text-xl font-bold tracking-tight text-white mb-1">البريد الوارد</h1>
          <p className="text-sm text-zinc-400">ملخص عمليات اليوم</p>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-6 space-y-8">
            {/* Progress / Inbox Zero Target */}
            <div className="space-y-3">
              <div className="flex justify-between items-end">
                <span className="text-sm font-medium text-zinc-300">المهام المتبقية</span>
                <span className="text-2xl font-bold text-white leading-none">{totalItems}</span>
              </div>
              <Progress value={progress} className="h-2 bg-zinc-800 [&>div]:bg-indigo-500" />
              <p className="text-xs text-zinc-500">تم إنجاز {initialTotal - totalItems} من أصل {initialTotal} مهام</p>
            </div>

            {/* Quick Stats */}
            <div className="space-y-4">
              <h3 className="text-xs uppercase tracking-wider text-zinc-500 font-semibold mb-3">حالة القوة العاملة (الفجر)</h3>
              
              <div className="bg-zinc-900/50 rounded-lg p-4 border border-zinc-800/50">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm text-zinc-400">تسجيل الدخول</span>
                  <span className="text-sm font-bold text-emerald-400">4,281</span>
                </div>
                <Progress value={85} className="h-1.5 bg-zinc-800 [&>div]:bg-emerald-500" />
                <p className="text-[10px] text-zinc-500 mt-2 text-left" dir="ltr">85% of target 5,000</p>
              </div>

              <div className="bg-zinc-900/50 rounded-lg p-4 border border-zinc-800/50">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm text-zinc-400">غياب / تأخير</span>
                  <div className="flex items-center gap-1.5 text-amber-400">
                    <TrendingDown className="w-3.5 h-3.5" />
                    <span className="text-sm font-bold">142</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Shift Context */}
            <div className="space-y-4">
              <h3 className="text-xs uppercase tracking-wider text-zinc-500 font-semibold mb-3">الورديات النشطة</h3>
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 rounded-full bg-indigo-500 mt-1.5" />
                  <div>
                    <p className="text-sm text-zinc-200">الفجر - مكة المكرمة</p>
                    <p className="text-xs text-zinc-500 mt-0.5">04:30 ص - 12:30 م</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 opacity-50">
                  <div className="w-2 h-2 rounded-full bg-zinc-700 mt-1.5" />
                  <div>
                    <p className="text-sm text-zinc-400">الصباح - المدينة المنورة</p>
                    <p className="text-xs text-zinc-500 mt-0.5">08:00 ص - 04:00 م</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </ScrollArea>
      </aside>

      {/* Main Queue Column */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Mobile Header */}
        <div className="lg:hidden p-4 border-b border-zinc-800/50 bg-[#0f0f11] flex justify-between items-center">
          <h1 className="text-lg font-bold text-white">البريد الوارد</h1>
          <Badge variant="secondary" className="bg-indigo-500/20 text-indigo-400 hover:bg-indigo-500/20 border-0">
            {totalItems} مهام
          </Badge>
        </div>

        <ScrollArea className="flex-1">
          <div className="max-w-3xl mx-auto w-full p-4 lg:p-8 space-y-12">
            
            {totalItems === 0 && (
              <div className="flex flex-col items-center justify-center py-32 text-center animate-in fade-in zoom-in duration-500">
                <div className="w-20 h-20 rounded-full bg-emerald-500/10 flex items-center justify-center mb-6">
                  <CheckCircle2 className="w-10 h-10 text-emerald-500" />
                </div>
                <h2 className="text-2xl font-bold text-white mb-2">تم إنجاز كافة المهام</h2>
                <p className="text-zinc-400 max-w-sm">لا توجد أي طلبات معلقة بانتظار المراجعة. يمكنك التركيز على متابعة العمليات الميدانية.</p>
              </div>
            )}

            {/* Late Arrivals */}
            {items.late.length > 0 && (
              <QueueSection 
                title="أعذار التأخير" 
                icon={<Clock className="w-5 h-5 text-amber-500" />}
                count={items.late.length}
                colorClass="text-amber-500"
              >
                {items.late.map(item => (
                  <QueueCard 
                    key={item.id}
                    isClearing={clearing === item.id}
                    item={item}
                    onApprove={() => handleAction('late', item.id)}
                    onReject={() => handleAction('late', item.id)}
                    approveLabel="قبول العذر"
                    rejectLabel="رفض (خصم)"
                  />
                ))}
              </QueueSection>
            )}

            {/* Selfie Verification */}
            {items.selfie.length > 0 && (
              <QueueSection 
                title="مراجعة الصور" 
                icon={<Camera className="w-5 h-5 text-rose-400" />}
                count={items.selfie.length}
                colorClass="text-rose-400"
              >
                {items.selfie.map(item => (
                  <QueueCard 
                    key={item.id}
                    isClearing={clearing === item.id}
                    item={item}
                    onApprove={() => handleAction('selfie', item.id)}
                    onReject={() => handleAction('selfie', item.id)}
                    approveLabel="مطابق"
                    rejectLabel="غير مطابق"
                  />
                ))}
              </QueueSection>
            )}

            {/* Contracts */}
            {items.contract.length > 0 && (
              <QueueSection 
                title="عقود جاهزة للاعتماد" 
                icon={<FileSignature className="w-5 h-5 text-indigo-400" />}
                count={items.contract.length}
                colorClass="text-indigo-400"
              >
                {items.contract.map(item => (
                  <QueueCard 
                    key={item.id}
                    isClearing={clearing === item.id}
                    item={item}
                    onApprove={() => handleAction('contract', item.id)}
                    onReject={() => handleAction('contract', item.id)}
                    approveLabel="اعتماد مبدئي"
                    rejectLabel="إعادة للمراجعة"
                  />
                ))}
              </QueueSection>
            )}

            {/* Broadcasts */}
            {items.broadcast.length > 0 && (
              <QueueSection 
                title="رسائل جماعية (للمراجعة)" 
                icon={<MessageSquare className="w-5 h-5 text-cyan-400" />}
                count={items.broadcast.length}
                colorClass="text-cyan-400"
              >
                {items.broadcast.map(item => (
                  <div 
                    key={item.id} 
                    className={cn(
                      "bg-[#151518] border border-zinc-800/60 rounded-xl p-5 transition-all duration-300 flex flex-col sm:flex-row gap-5",
                      clearing === item.id && "opacity-0 scale-95 translate-x-4 pointer-events-none"
                    )}
                  >
                    <div className="flex-1 space-y-3">
                      <div className="flex justify-between items-start">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="border-cyan-500/30 text-cyan-400 bg-cyan-500/10 font-normal">
                            {item.time}
                          </Badge>
                          <span className="text-xs text-zinc-500 flex items-center gap-1">
                            <UsersIcon className="w-3 h-3" /> {item.count} مستلم
                          </span>
                        </div>
                      </div>
                      
                      <div>
                        <h4 className="text-base font-medium text-white mb-1">{item.title}</h4>
                        <p className="text-sm text-zinc-400 leading-relaxed bg-black/40 p-3 rounded-lg border border-zinc-800/50 mt-2">
                          {item.details}
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex sm:flex-col gap-2 shrink-0 justify-end">
                      <Button 
                        onClick={() => handleAction('broadcast', item.id)}
                        className="flex-1 sm:flex-none bg-indigo-500 hover:bg-indigo-600 text-white border-0 shadow-[0_0_15px_rgba(99,102,241,0.2)]"
                      >
                        <Check className="w-4 h-4 ms-2" /> اعتماد للإرسال
                      </Button>
                      <Button 
                        onClick={() => handleAction('broadcast', item.id)}
                        variant="outline" 
                        className="flex-1 sm:flex-none border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-white"
                      >
                        <X className="w-4 h-4 ms-2" /> إلغاء
                      </Button>
                    </div>
                  </div>
                ))}
              </QueueSection>
            )}
            
            {/* Spacer for bottom scrolling */}
            <div className="h-12" />
          </div>
        </ScrollArea>
      </main>
    </div>
  );
}

function QueueSection({ title, icon, count, children, colorClass }: any) {
  return (
    <section className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center gap-3 pb-2 border-b border-zinc-800/50">
        {icon}
        <h2 className="text-lg font-semibold text-white flex-1">{title}</h2>
        <Badge variant="outline" className={cn("font-medium px-2 py-0.5 bg-black/50 border-zinc-700", colorClass)}>
          {count}
        </Badge>
      </div>
      <div className="space-y-3">
        {children}
      </div>
    </section>
  );
}

function QueueCard({ item, isClearing, onApprove, onReject, approveLabel, rejectLabel }: any) {
  return (
    <div 
      className={cn(
        "group bg-[#151518] hover:bg-[#1a1a1f] border border-zinc-800/60 hover:border-zinc-700/80 rounded-xl p-4 transition-all duration-300",
        isClearing && "opacity-0 scale-95 translate-x-4 pointer-events-none"
      )}
    >
      <div className="flex flex-col sm:flex-row gap-4">
        {/* Context / Person Info */}
        <div className="flex flex-1 gap-4">
          {item.person && (
            <Avatar className="w-12 h-12 border border-zinc-800 shrink-0">
              <AvatarFallback className="bg-zinc-800 text-zinc-300 font-medium">
                {item.person.initials}
              </AvatarFallback>
            </Avatar>
          )}
          
          <div className="space-y-1.5 flex-1 min-w-0">
            <div className="flex justify-between items-start gap-2">
              <h3 className="text-base font-medium text-zinc-100 truncate">{item.person?.name}</h3>
              <span className="text-xs text-zinc-500 whitespace-nowrap">{item.time}</span>
            </div>
            
            <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400">
              <span className="flex items-center gap-1.5 bg-zinc-900 px-2 py-1 rounded-md border border-zinc-800">
                <User className="w-3 h-3 text-zinc-500" />
                {item.person?.role}
              </span>
              <span className="flex items-center gap-1.5 bg-zinc-900 px-2 py-1 rounded-md border border-zinc-800">
                <MapPin className="w-3 h-3 text-zinc-500" />
                {item.person?.site}
              </span>
            </div>
            
            <p className="text-sm text-zinc-300 mt-2 p-2.5 bg-black/30 rounded-lg border border-zinc-800/50 leading-relaxed">
              {item.details}
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex sm:flex-col justify-end gap-2 shrink-0 border-t sm:border-t-0 sm:border-r border-zinc-800/50 pt-3 sm:pt-0 sm:pr-4">
          <Button 
            onClick={onApprove}
            className="flex-1 sm:flex-none bg-zinc-800 text-white hover:bg-emerald-500/20 hover:text-emerald-400 hover:border-emerald-500/50 border border-transparent transition-colors justify-start h-9 px-3"
          >
            <Check className="w-4 h-4 ms-2" /> {approveLabel}
          </Button>
          <Button 
            onClick={onReject}
            variant="ghost" 
            className="flex-1 sm:flex-none text-zinc-400 hover:text-rose-400 hover:bg-rose-500/10 justify-start h-9 px-3"
          >
            <X className="w-4 h-4 ms-2" /> {rejectLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

function UsersIcon(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}
