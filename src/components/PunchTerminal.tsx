import React, { useState, useEffect } from 'react';
import { AttendanceRecord, ClockMethodologyStatus, Employee, OfficeLocationConfig } from '../types';
import { api } from '../api';
import { 
  LogIn, 
  LogOut, 
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  Sun, 
  Moon, 
  MapPin, 
  Navigation, 
  Timer,
  AlertTriangle
} from 'lucide-react';

interface PunchTerminalProps {
  employee: Employee;
  methodology: ClockMethodologyStatus | null;
  todayRecord: AttendanceRecord | null;
  locationConfig: OfficeLocationConfig | null;
  simulatedHour: number | undefined;
  onRefresh: () => void;
  onLocationUpdated: (newLoc: OfficeLocationConfig) => void;
}

// Haversine distance in meters
function computeDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

export const PunchTerminal: React.FC<PunchTerminalProps> = ({
  employee,
  methodology,
  todayRecord,
  locationConfig,
  simulatedHour,
  onRefresh,
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [elapsedString, setElapsedString] = useState('00:00:00');

  // GPS tracking state
  const [userGps, setUserGps] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsPermissionDenied, setGpsPermissionDenied] = useState(false);
  const [distanceMeters, setDistanceMeters] = useState<number | null>(null);

  // Request or refresh device location
  const requestLocation = (showSpinner = true): Promise<{ lat: number; lng: number } | null> => {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        setGpsPermissionDenied(true);
        resolve(null);
        return;
      }

      if (showSpinner) setGpsLoading(true);
      setError(null);

      navigator.geolocation.getCurrentPosition(
        (position) => {
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;

          setUserGps({ lat, lng });
          setGpsLoading(false);
          setGpsPermissionDenied(false);

          if (locationConfig?.latitude && locationConfig?.longitude) {
            const dist = computeDistanceMeters(lat, lng, locationConfig.latitude, locationConfig.longitude);
            setDistanceMeters(dist);
          }

          resolve({ lat, lng });
        },
        () => {
          setGpsLoading(false);
          setGpsPermissionDenied(true);
          resolve(null);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 4000 }
      );
    });
  };

  // Attempt to read location on mount
  useEffect(() => {
    requestLocation(false);
  }, [locationConfig]);

  // Live timer for elapsed work duration if currently clocked in
  useEffect(() => {
    if (!todayRecord?.clockIn || todayRecord?.clockOut) {
      return;
    }

    const updateElapsed = () => {
      const inTime = new Date(todayRecord.clockIn!.time).getTime();
      const now = new Date().getTime();
      const diffMs = Math.max(0, now - inTime);

      const totalSecs = Math.floor(diffMs / 1000);
      const hrs = Math.floor(totalSecs / 3600);
      const mins = Math.floor((totalSecs % 3600) / 60);
      const secs = totalSecs % 60;

      setElapsedString(
        `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
      );
    };

    updateElapsed();
    const interval = setInterval(updateElapsed, 1000);
    return () => clearInterval(interval);
  }, [todayRecord]);

  // Time window rules:
  // After Night 12 (12:00 AM to 12:00 PM): Morning Shift -> Clock In active
  // After Afternoon 12 (12:00 PM onwards): Afternoon Shift -> Clock Out active
  const isMorning = methodology?.period === 'morning';
  const hasClockedIn = Boolean(todayRecord?.clockIn);
  const hasClockedOut = Boolean(todayRecord?.clockOut);

  // Check if connected & at the workplace
  const isAtWorkplace = 
    userGps && locationConfig 
      ? (distanceMeters !== null && distanceMeters <= locationConfig.radiusMeters)
      : false;

  const handlePunch = async (action: 'clock_in' | 'clock_out') => {
    setLoading(true);
    setError(null);
    setSuccessMsg(null);

    try {
      // Re-verify current location
      const latestGps = await requestLocation(true);

      if (!latestGps) {
        throw new Error('Please turn on device location to mark attendance.');
      }

      if (locationConfig?.enforceLocation) {
        const dist = computeDistanceMeters(
          latestGps.lat,
          latestGps.lng,
          locationConfig.latitude,
          locationConfig.longitude
        );
        setDistanceMeters(dist);

        if (dist > locationConfig.radiusMeters) {
          throw new Error('You must be at the workplace to mark attendance.');
        }
      }

      const res = await api.punch(action, note.trim() || undefined, simulatedHour, latestGps.lat, latestGps.lng);
      setSuccessMsg(res.message);
      setNote('');
      onRefresh();
    } catch (err: any) {
      setError(err.message || `Failed to record attendance.`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Success Notification */}
      {successMsg && (
        <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-sm flex items-center justify-between shadow-lg shadow-emerald-950/20">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button
            onClick={() => setSuccessMsg(null)}
            className="text-xs text-emerald-400 hover:text-emerald-200 cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Error Notification */}
      {error && (
        <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm flex items-center justify-between shadow-lg shadow-rose-950/20">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            onClick={() => setError(null)}
            className="text-xs text-rose-400 hover:text-rose-200 cursor-pointer ml-3"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main Attendance Card */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl relative overflow-hidden space-y-6">
        
        {/* Header: Employee Name & Shift Period */}
        <div className="flex items-center justify-between pb-6 border-b border-slate-800">
          <div>
            <span className="text-xs text-slate-400 block">Welcome,</span>
            <h2 className="text-xl font-bold text-white">{employee.name}</h2>
          </div>

          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-800 border border-slate-700 text-xs">
            {isMorning ? (
              <>
                <Sun className="w-4 h-4 text-amber-400" />
                <span className="font-medium text-slate-200">Morning Shift (Clock In)</span>
              </>
            ) : (
              <>
                <Moon className="w-4 h-4 text-blue-400" />
                <span className="font-medium text-slate-200">Afternoon Shift (Clock Out)</span>
              </>
            )}
          </div>
        </div>

        {/* LOCATION CONNECTION STATUS */}
        <div>
          {!userGps ? (
            /* Prompt user to turn on location */
            <div className="p-5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-200 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3 text-center sm:text-left">
                <div className="p-2.5 rounded-xl bg-amber-500/20 text-amber-400 shrink-0">
                  <MapPin className="w-6 h-6 animate-bounce" />
                </div>
                <div>
                  <h4 className="font-bold text-sm text-white">Location Required</h4>
                  <p className="text-xs text-amber-300/80">
                    {gpsPermissionDenied 
                      ? 'Location permission is off. Please enable device location.' 
                      : 'Checking your device location...'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                disabled={gpsLoading}
                onClick={() => requestLocation(true)}
                className="w-full sm:w-auto px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-xs flex items-center justify-center gap-2 cursor-pointer transition-colors shadow-md"
              >
                <Navigation className={`w-4 h-4 ${gpsLoading ? 'animate-spin' : ''}`} />
                <span>{gpsLoading ? 'Connecting...' : 'Turn On Location'}</span>
              </button>
            </div>
          ) : isAtWorkplace ? (
            /* Location Connected and Approved */
            <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="font-semibold text-white">Location Connected ✓ Approved for attendance</span>
              </div>
              <button
                type="button"
                onClick={() => requestLocation(true)}
                className="text-[11px] text-emerald-400 hover:text-emerald-200 underline cursor-pointer"
              >
                Refresh
              </button>
            </div>
          ) : (
            /* Outside Workplace Warning */
            <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2.5">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>Outside workplace. Please be at the workplace to mark attendance.</span>
              </div>
              <button
                type="button"
                onClick={() => requestLocation(true)}
                className="text-[11px] text-rose-300 hover:text-white underline cursor-pointer"
              >
                Retry
              </button>
            </div>
          )}
        </div>

        {/* SHIFT STATUS & ACTIVE TIMER */}
        {hasClockedIn && !hasClockedOut && (
          <div className="p-6 rounded-2xl bg-gradient-to-br from-emerald-950/40 via-slate-950 to-slate-950 border border-emerald-500/30 text-center space-y-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400 flex items-center justify-center gap-1.5">
              <Timer className="w-4 h-4 animate-spin" />
              Active Shift Elapsed Time
            </span>
            <div className="text-4xl sm:text-5xl font-black font-mono tracking-widest text-white drop-shadow-md">
              {elapsedString}
            </div>
            <p className="text-xs text-slate-400">
              Clocked In at: <strong className="text-slate-200">{todayRecord?.clockIn?.formatted}</strong>
            </p>
          </div>
        )}

        {/* ATTENDANCE COMPLETED FOR TODAY */}
        {hasClockedOut && (
          <div className="p-6 rounded-2xl bg-slate-950 border border-slate-800 text-center space-y-3">
            <div className="inline-flex p-3 rounded-full bg-blue-500/10 text-blue-400 mb-1">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-bold text-white">Daily Attendance Completed</h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              Total duration: <strong className="text-white font-mono">{todayRecord?.durationFormatted}</strong>
            </p>
            <div className="flex justify-center gap-6 pt-2 text-xs">
              <div>
                <span className="text-slate-500 block">Clock In</span>
                <span className="font-mono text-emerald-400 font-semibold">{todayRecord?.clockIn?.formatted}</span>
              </div>
              <div className="border-l border-slate-800 pl-6">
                <span className="text-slate-500 block">Clock Out</span>
                <span className="font-mono text-rose-400 font-semibold">{todayRecord?.clockOut?.formatted}</span>
              </div>
            </div>
          </div>
        )}

        {/* ACTIONS: CLOCK IN (Morning) vs CLOCK OUT (Afternoon) */}
        {!hasClockedOut && (
          <div className="space-y-4 pt-2">
            {/* 1. MORNING SHIFT (After Night 12: 12:00 AM – 12:00 PM) */}
            {isMorning ? (
              !hasClockedIn ? (
                /* SHOW CLOCK IN OPTION */
                <div className="space-y-3">
                  <button
                    type="button"
                    disabled={loading || !userGps || !isAtWorkplace}
                    onClick={() => handlePunch('clock_in')}
                    className={`w-full py-5 px-6 rounded-2xl font-bold text-lg shadow-xl transition-all flex items-center justify-center gap-3 cursor-pointer disabled:opacity-50 ${
                      userGps && isAtWorkplace
                        ? 'bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white shadow-emerald-900/40'
                        : 'bg-slate-800 text-slate-400 border border-slate-700 cursor-not-allowed'
                    }`}
                  >
                    <LogIn className="w-6 h-6" />
                    <span>
                      {loading 
                        ? 'RECORDING CLOCK IN...' 
                        : userGps && isAtWorkplace 
                          ? 'CLOCK IN (APPROVED)' 
                          : 'CONNECT LOCATION TO CLOCK IN'}
                    </span>
                  </button>
                  <p className="text-center text-xs text-slate-500">
                    Morning Shift: Clock In active until 12:00 PM afternoon.
                  </p>
                </div>
              ) : (
                /* ALREADY CLOCKED IN - LOCKED UNTIL 12:00 PM AFTERNOON */
                <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 text-center space-y-2">
                  <div className="flex items-center justify-center gap-2 text-xs font-semibold text-amber-400">
                    <Clock className="w-4 h-4" />
                    <span>Clock Out Opens at 12:00 PM Afternoon</span>
                  </div>
                  <p className="text-xs text-slate-400">
                    You are clocked in. Clock out option will appear after 12:00 PM afternoon.
                  </p>
                </div>
              )
            ) : (
              /* 2. AFTERNOON SHIFT (After 12:00 PM Afternoon) */
              hasClockedIn ? (
                /* SHOW CLOCK OUT OPTION */
                <div className="space-y-3">
                  <input
                    type="text"
                    placeholder="Optional note before clocking out..."
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-rose-500"
                  />

                  <button
                    type="button"
                    disabled={loading || !userGps || !isAtWorkplace}
                    onClick={() => handlePunch('clock_out')}
                    className={`w-full py-5 px-6 rounded-2xl font-bold text-lg shadow-xl transition-all flex items-center justify-center gap-3 cursor-pointer disabled:opacity-50 ${
                      userGps && isAtWorkplace
                        ? 'bg-gradient-to-r from-rose-600 via-rose-500 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white shadow-rose-900/40'
                        : 'bg-slate-800 text-slate-400 border border-slate-700 cursor-not-allowed'
                    }`}
                  >
                    <LogOut className="w-6 h-6" />
                    <span>
                      {loading 
                        ? 'RECORDING CLOCK OUT...' 
                        : userGps && isAtWorkplace 
                          ? 'CLOCK OUT (APPROVED)' 
                          : 'CONNECT LOCATION TO CLOCK OUT'}
                    </span>
                  </button>
                  <p className="text-center text-xs text-slate-500">
                    Afternoon Shift: Clock Out active to complete your shift.
                  </p>
                </div>
              ) : (
                /* Haven't clocked in yet even in afternoon */
                <div className="space-y-3">
                  <button
                    type="button"
                    disabled={loading || !userGps || !isAtWorkplace}
                    onClick={() => handlePunch('clock_in')}
                    className={`w-full py-5 px-6 rounded-2xl font-bold text-lg shadow-xl transition-all flex items-center justify-center gap-3 cursor-pointer disabled:opacity-50 ${
                      userGps && isAtWorkplace
                        ? 'bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white shadow-emerald-900/40'
                        : 'bg-slate-800 text-slate-400 border border-slate-700 cursor-not-allowed'
                    }`}
                  >
                    <LogIn className="w-6 h-6" />
                    <span>CLOCK IN (START AFTERNOON SHIFT)</span>
                  </button>
                </div>
              )
            )}
          </div>
        )}

        {/* Footer Summary */}
        <div className="pt-4 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
          <span>Employee ID: <strong className="text-slate-200 font-mono">{employee.id}</strong></span>
          <span>Phone: <strong className="text-slate-200 font-mono">{employee.phone}</strong></span>
        </div>
      </div>
    </div>
  );
};
