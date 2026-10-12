import React, { useState, useEffect } from 'react';
import { api, clearStoredToken, getStoredToken } from './api';
import { AttendanceRecord, ClockMethodologyStatus, Employee, OfficeLocationConfig } from './types';
import { LoginModal } from './components/LoginModal';
import { Navbar } from './components/Navbar';
import { PunchTerminal } from './components/PunchTerminal';
import { HistoryView } from './components/HistoryView';
import { RefreshCw } from 'lucide-react';

export default function App() {
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [activeTab, setActiveTab] = useState<'terminal' | 'history'>('terminal');

  // Attendance state
  const [methodology, setMethodology] = useState<ClockMethodologyStatus | null>(null);
  const [todayRecord, setTodayRecord] = useState<AttendanceRecord | null>(null);
  const [locationConfig, setLocationConfig] = useState<OfficeLocationConfig | null>(null);
  const [simulatedHour, setSimulatedHour] = useState<number | undefined>(undefined);

  // Load user session on startup
  const checkAuth = async () => {
    const token = getStoredToken();
    if (!token) {
      setLoadingAuth(false);
      return;
    }

    try {
      const res = await api.getMe();
      setEmployee(res.employee);
      await loadAttendanceStatus(res.employee, simulatedHour);
    } catch (err) {
      clearStoredToken();
      setEmployee(null);
    } finally {
      setLoadingAuth(false);
    }
  };

  const loadAttendanceStatus = async (user?: Employee, simH?: number) => {
    try {
      const res = await api.getStatus(simH);
      setMethodology(res.methodology);
      setTodayRecord(res.todayRecord);
      if (res.locationConfig) {
        setLocationConfig(res.locationConfig);
      }
      if (res.employee) {
        setEmployee(res.employee);
      }
    } catch (err) {
      console.error('Failed to load status:', err);
    }
  };

  useEffect(() => {
    checkAuth();
  }, []);

  // When simulation hour changes, update attendance status
  useEffect(() => {
    if (employee) {
      loadAttendanceStatus(employee, simulatedHour);
    }
  }, [simulatedHour]);

  const handleLoginSuccess = async (emp: Employee) => {
    setEmployee(emp);
    await loadAttendanceStatus(emp, simulatedHour);
  };

  const handleLogout = async () => {
    try {
      await api.logout();
    } catch (e) {
      // ignore
    }
    clearStoredToken();
    setEmployee(null);
    setTodayRecord(null);
    setMethodology(null);
  };

  if (loadingAuth) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-400 gap-3">
        <RefreshCw className="w-8 h-8 animate-spin text-blue-500" />
        <span className="text-sm font-medium">Loading Chronos Attendance...</span>
      </div>
    );
  }

  // Not logged in -> Show phone OTP login
  if (!employee) {
    return <LoginModal onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-blue-500 selection:text-white">
      {/* Top Header Navbar */}
      <Navbar
        employee={employee}
        methodology={methodology}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        simulatedHour={simulatedHour}
        setSimulatedHour={setSimulatedHour}
        onLogout={handleLogout}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
        {activeTab === 'terminal' && (
          <PunchTerminal
            employee={employee}
            methodology={methodology}
            todayRecord={todayRecord}
            locationConfig={locationConfig}
            simulatedHour={simulatedHour}
            onRefresh={() => loadAttendanceStatus(employee, simulatedHour)}
            onLocationUpdated={(newLoc) => setLocationConfig(newLoc)}
          />
        )}

        {activeTab === 'history' && <HistoryView />}
      </main>
    </div>
  );
}
