import * as React from "react";
import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";

type View = "days" | "months" | "years";

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
const MONTH_FULL = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const DAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}
function startDay(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

interface DatePickerFieldProps {
  value?: string;
  onChange?: (val: string) => void;
  placeholder?: string;
  className?: string;
  min?: string;
  max?: string;
  "data-testid"?: string;
}

export function DatePickerField({
  value,
  onChange,
  placeholder = "Select date",
  className,
  min,
  max,
  "data-testid": testId,
}: DatePickerFieldProps) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>("days");
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number } | null>(null);

  const parsed = value ? new Date(value + "T00:00:00") : null;
  const [viewYear, setViewYear] = useState(parsed?.getFullYear() ?? new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(parsed?.getMonth() ?? new Date().getMonth());
  const [yearRangeStart, setYearRangeStart] = useState(
    Math.floor((parsed?.getFullYear() ?? new Date().getFullYear()) / 12) * 12
  );

  const updatePosition = useCallback(() => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const dropdownH = 320;
    const spaceBelow = window.innerHeight - rect.bottom;
    const top = spaceBelow >= dropdownH ? rect.bottom + 4 : rect.top - dropdownH - 4;
    const left = Math.min(rect.left, window.innerWidth - 290);
    setDropdownPos({ top: Math.max(4, top), left: Math.max(4, left) });
  }, []);

  useEffect(() => {
    if (open && parsed) {
      setViewYear(parsed.getFullYear());
      setViewMonth(parsed.getMonth());
      setYearRangeStart(Math.floor(parsed.getFullYear() / 12) * 12);
      setView("days");
    }
    if (open) updatePosition();
  }, [open]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const target = e.target as Node;
      if (
        containerRef.current && !containerRef.current.contains(target) &&
        dropdownRef.current && !dropdownRef.current.contains(target)
      ) {
        setOpen(false);
      }
    }
    function handleScroll() {
      if (open) updatePosition();
    }
    if (open) {
      document.addEventListener("mousedown", handleClick);
      window.addEventListener("scroll", handleScroll, true);
      window.addEventListener("resize", updatePosition);
    }
    return () => {
      document.removeEventListener("mousedown", handleClick);
      window.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [open, updatePosition]);

  const displayText = parsed
    ? `${parsed.getDate()} ${MONTH_NAMES[parsed.getMonth()]} ${parsed.getFullYear()}`
    : "";

  function selectDay(day: number) {
    const m = String(viewMonth + 1).padStart(2, "0");
    const d = String(day).padStart(2, "0");
    onChange?.(`${viewYear}-${m}-${d}`);
    setOpen(false);
  }

  function selectMonth(m: number) {
    setViewMonth(m);
    setView("days");
  }

  function selectYear(y: number) {
    setViewYear(y);
    setView("months");
  }

  function prevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(viewYear - 1); }
    else setViewMonth(viewMonth - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(viewYear + 1); }
    else setViewMonth(viewMonth + 1);
  }

  const totalDays = daysInMonth(viewYear, viewMonth);
  const firstDay = startDay(viewYear, viewMonth);

  const calendarDropdown = open && dropdownPos ? createPortal(
    <div
      ref={dropdownRef}
      data-datepicker-portal
      className="fixed z-[9999] w-[280px] rounded-md border border-border bg-card shadow-xl p-3 animate-in fade-in-0 zoom-in-95"
      style={{ top: dropdownPos.top, left: dropdownPos.left, pointerEvents: "auto" }}
    >
          {view === "days" && (
            <>
              <div className="flex items-center justify-between mb-2">
                <button type="button" onClick={prevMonth} className="p-1 rounded hover:bg-muted/50 text-muted-foreground hover:text-white transition-colors">
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setView("months")}
                  className="text-sm font-medium text-white hover:text-primary transition-colors px-2 py-1 rounded hover:bg-muted/30"
                >
                  {MONTH_FULL[viewMonth]} {viewYear}
                </button>
                <button type="button" onClick={nextMonth} className="p-1 rounded hover:bg-muted/50 text-muted-foreground hover:text-white transition-colors">
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
              <div className="grid grid-cols-7 gap-0 mb-1">
                {DAY_LABELS.map((d) => (
                  <div key={d} className="text-center text-[11px] text-muted-foreground font-medium py-1">{d}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-0">
                {Array.from({ length: firstDay }).map((_, i) => (
                  <div key={`e-${i}`} />
                ))}
                {Array.from({ length: totalDays }).map((_, i) => {
                  const day = i + 1;
                  const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                  const isSelected = value === dateStr;
                  const isToday = (() => {
                    const t = new Date();
                    return day === t.getDate() && viewMonth === t.getMonth() && viewYear === t.getFullYear();
                  })();
                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() => selectDay(day)}
                      className={cn(
                        "h-8 w-full rounded text-sm transition-colors",
                        isSelected
                          ? "bg-primary text-primary-foreground font-semibold"
                          : isToday
                            ? "bg-muted/50 text-white font-medium"
                            : "text-white/80 hover:bg-muted/40 hover:text-white"
                      )}
                    >
                      {day}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {view === "months" && (
            <>
              <div className="flex items-center justify-between mb-3">
                <button type="button" onClick={() => setViewYear(viewYear - 1)} className="p-1 rounded hover:bg-muted/50 text-muted-foreground hover:text-white transition-colors">
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => { setYearRangeStart(Math.floor(viewYear / 12) * 12); setView("years"); }}
                  className="text-sm font-medium text-white hover:text-primary transition-colors px-2 py-1 rounded hover:bg-muted/30"
                >
                  {viewYear}
                </button>
                <button type="button" onClick={() => setViewYear(viewYear + 1)} className="p-1 rounded hover:bg-muted/50 text-muted-foreground hover:text-white transition-colors">
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {MONTH_NAMES.map((m, i) => {
                  const isCurrent = i === viewMonth && viewYear === (parsed?.getFullYear() ?? -1) && i === (parsed?.getMonth() ?? -1);
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => selectMonth(i)}
                      className={cn(
                        "py-2.5 rounded text-sm transition-colors",
                        isCurrent
                          ? "bg-primary text-primary-foreground font-semibold"
                          : "text-white/80 hover:bg-muted/40 hover:text-white"
                      )}
                    >
                      {m}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {view === "years" && (
            <>
              <div className="flex items-center justify-between mb-3">
                <button type="button" onClick={() => setYearRangeStart(yearRangeStart - 12)} className="p-1 rounded hover:bg-muted/50 text-muted-foreground hover:text-white transition-colors">
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="text-sm font-medium text-white">
                  {yearRangeStart} – {yearRangeStart + 11}
                </span>
                <button type="button" onClick={() => setYearRangeStart(yearRangeStart + 12)} className="p-1 rounded hover:bg-muted/50 text-muted-foreground hover:text-white transition-colors">
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {Array.from({ length: 12 }).map((_, i) => {
                  const y = yearRangeStart + i;
                  const isSelected = y === (parsed?.getFullYear() ?? -1);
                  return (
                    <button
                      key={y}
                      type="button"
                      onClick={() => selectYear(y)}
                      className={cn(
                        "py-2.5 rounded text-sm transition-colors",
                        isSelected
                          ? "bg-primary text-primary-foreground font-semibold"
                          : "text-white/80 hover:bg-muted/40 hover:text-white"
                      )}
                    >
                      {y}
                    </button>
                  );
                })}
              </div>
            </>
          )}
    </div>,
    document.body
  ) : null;

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen(!open)}
        data-testid={testId}
        className={cn(
          "flex h-10 w-full items-center gap-2 rounded-sm border border-border bg-muted/30 px-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary",
          !displayText && "text-muted-foreground",
          className
        )}
      >
        <CalendarDays className="h-4 w-4 text-muted-foreground shrink-0" />
        <span className="flex-1 text-start truncate">{displayText || placeholder}</span>
      </button>
      {calendarDropdown}
    </div>
  );
}
