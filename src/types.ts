export interface Employee {
  id: string; // e.g. EMP-001
  phone: string; // e.g. +19876543210 or 9876543210
  name: string;
  department: string;
  role: 'employee' | 'admin' | 'supervisor';
  active: boolean;
  pin?: string;
  boundDeviceId?: string;
  boundDeviceName?: string;
  deviceBoundAt?: string;
  isBlocked?: boolean;
  blockReason?: string;
  blockedAt?: string;
  createdAt: string;
}

export interface OfficeLocationConfig {
  mapsUrl: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
  locationName: string;
  enforceLocation: boolean;
}

export interface PunchEvent {
  time: string; // ISO
  formatted: string; // 09:15:30 AM
  note?: string;
  ip?: string;
  device?: string;
  latitude?: number;
  longitude?: number;
  distanceMeters?: number;
  locationVerified?: boolean;
}

export interface AttendanceRecord {
  id: string;
  employeeId: string;
  phone: string;
  name: string;
  department: string;
  date: string; // YYYY-MM-DD
  clockIn: PunchEvent | null;
  clockOut: PunchEvent | null;
  durationMinutes: number;
  durationFormatted: string;
  status: 'clocked_in' | 'completed' | 'not_clocked_in' | 'late';
  syncedToGoogleSheet: boolean;
  syncedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AuthSession {
  token: string;
  employee: Employee;
  expiresAt: number;
}

export interface ClockMethodologyStatus {
  serverTime: string; // ISO
  currentTimeFormatted: string;
  currentHour: number;
  currentMinute: number;
  period: 'morning' | 'afternoon'; // 'morning' = 12:00 AM - 12:00 PM, 'afternoon' = 12:00 PM - 12:00 AM
  periodTitle: string;
  allowedAction: 'clock_in' | 'clock_out' | 'none';
  actionPrompt: string;
  canClockIn: boolean;
  canClockOut: boolean;
  simulationMode: boolean;
  simulatedHour?: number;
}

export interface SheetConfig {
  sheetId: string;
  appsScriptUrl?: string;
  lastSyncTime?: string | null;
  autoSyncEnabled: boolean;
  totalCapacity: number;
}
