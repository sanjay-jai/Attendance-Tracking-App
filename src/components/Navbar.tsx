import React, { useState, useEffect } from 'react';
import { Employee, ClockMethodologyStatus } from '../types';
import { 
  ShieldCheck, 
  LogOut, 
  Clock, 
  Sun, 
  Moon, 
  History, 
  SlidersHorizontal
} from 'lucide-react';

interface NavbarProps {
  employee: Employee;
  methodology: ClockMethodologyStatus | null;
  activeTab: 'terminal' | 'history';
  setActiveTab: (tab: 'terminal' | 'history') => void;
  simulatedHour: number | undefined;
  setSimulatedHour: (hour: number | undefined) => void;
  onLogout: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  employee,
  methodology,
  activeTab,
  setActiveTab,
  simulatedHour,
  setSimulatedHour,
  onLogout,
}) => {
  const [liveTime, setLiveTime] = useState<string>('');
  const [liveDate, setLiveDate] = useState<string>('');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setLiveTime(
        now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      );
      setLiveDate(
        now.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
      );
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const isMorning = methodology ? methodology.period === 'morning' : (simulatedHour !== undefined ? simulatedHour < 12 : new Date().getHours() < 12);

  return (
    <header className="sticky top-0 z-40 bg-slate-900/95 backdrop-blur-md border-b border-slate-800">
      {/* Simulation / Time Testing Strip */}
      <div className="bg-slate-950 border-b border-slate-800/80 px-4 py-1.5 text-xs">
        <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span className="text-slate-400 font-medium">Shift Window:</span>
            <span className={`font-semibold px-2 py-0.5 rounded ${isMorning ? 'bg-amber-500/15 text-amber-300' : 'bg-blue-500/15 text-blue-300'}`}>
              {isMorning ? '☀️ 12:00 AM – 12:00 PM: Clock In Active' : '🌙 After 12:00 PM: Clock Out Active'}
            </span>
          </div>

          {/* Time Testing switcher */}
          <div className="flex items-center gap-1.5 bg-slate-900 px-2 py-1 rounded-lg border border-slate-800">
            <SlidersHorizontal className="w-3 h-3 text-slate-400" />
            <span className="text-slate-400 font-medium mr-1">Time Test:</span>
            <button
              onClick={() => setSimulatedHour(undefined)}
              className={`px-2 py-0.5 rounded text-xs transition-colors cursor-pointer ${
                simulatedHour === undefined
                  ? 'bg-blue-600 text-white font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Real Clock
            </button>
            <button
              onClick={() => setSimulatedHour(9)}
              className={`px-2 py-0.5 rounded text-xs transition-colors cursor-pointer ${
                simulatedHour === 9
                  ? 'bg-amber-500 text-slate-950 font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Test 09:00 AM Morning Clock In"
            >
              09:00 AM (Clock In)
            </button>
            <button
              onClick={() => setSimulatedHour(14)}
              className={`px-2 py-0.5 rounded text-xs transition-colors cursor-pointer ${
                simulatedHour === 14
                  ? 'bg-indigo-600 text-white font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Test 02:00 PM Afternoon Clock Out"
            >
              02:00 PM (Clock Out)
            </button>
          </div>
        </div>
      </div>

      {/* Main Bar */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-16">
          {/* Brand Logo & Sheet Link */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-emerald-500 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <span className="text-base font-bold text-white tracking-tight">
                  Employee Attendance
                </span>
                <span className="text-xs text-slate-400 block font-mono">
                  {liveDate} • {liveTime}
                </span>
              </div>
            </div>
          </div>

          {/* Navigation Tabs for Employee */}
          <nav className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => setActiveTab('terminal')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                activeTab === 'terminal'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Attendance Punch</span>
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                activeTab === 'history'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span>My History</span>
            </button>
          </nav>

          {/* Employee Identity & Logout */}
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex flex-col text-right">
              <span className="text-xs font-semibold text-white flex items-center justify-end gap-1.5">
                {employee.name}
                <span className="px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 font-mono text-[10px]">
                  {employee.id}
                </span>
              </span>
              <span className="text-[11px] text-emerald-400 font-mono">
                {employee.phone}
              </span>
            </div>

            <button
              onClick={onLogout}
              title="Log Out"
              className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 border border-slate-700/60 transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
