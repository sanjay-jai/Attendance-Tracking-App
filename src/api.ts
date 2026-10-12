import { AttendanceRecord, ClockMethodologyStatus, Employee, SheetConfig, OfficeLocationConfig } from './types';

const TOKEN_KEY = 'chronos_auth_token';

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearStoredToken() {
  localStorage.removeItem(TOKEN_KEY);
}

async function request(path: string, options: RequestInit = {}) {
  const token = getStoredToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  let res: Response;
  try {
    res = await fetch(path, { ...options, headers });
  } catch (err: any) {
    throw new Error('Unable to connect to the server. Please check your internet connection.');
  }

  const contentType = res.headers.get('content-type') || '';

  // If server or cloud proxy returned HTML (e.g. during restart or 502 Bad Gateway)
  if (!contentType.includes('application/json')) {
    const text = await res.text();
    if (res.status === 502 || res.status === 503 || res.status === 504) {
      throw new Error('Server is currently connecting. Please try again in a few seconds.');
    }
    if (res.status === 401) {
      clearStoredToken();
      throw new Error('Session expired. Please log in again.');
    }
    if (res.status === 404) {
      throw new Error('Requested service endpoint was not found.');
    }
    try {
      const parsed = JSON.parse(text);
      if (!res.ok) throw new Error(parsed.error || 'Request failed');
      return parsed;
    } catch {
      throw new Error(`Server temporarily unavailable (${res.status}). Please try again.`);
    }
  }

  const data = await res.json();

  if (!res.ok) {
    if (res.status === 401) {
      clearStoredToken();
    }
    throw new Error(data.error || 'Request failed');
  }

  return data;
}

export const api = {
  // Auth
  sendOtp: (phone: string) => 
    request('/api/auth/send-otp', {
      method: 'POST',
      body: JSON.stringify({ phone }),
    }),

  verifyOtp: (phone: string, otp: string) => 
    request('/api/auth/verify-otp', {
      method: 'POST',
      body: JSON.stringify({ phone, otp }),
    }),

  loginWithPin: (phone: string, pin: string, deviceId: string, deviceName: string) => 
    request('/api/auth/login-pin', {
      method: 'POST',
      body: JSON.stringify({ phone, pin, deviceId, deviceName }),
    }),

  getMe: () => 
    request('/api/auth/me'),

  logout: () => 
    request('/api/auth/logout', { method: 'POST' }),

  getSmsStatus: (): Promise<{
    hasLiveCarrier: boolean;
    activeProvider: string;
    lastDispatched: { phone: string; code: string; time: string; provider: string; status: string } | null;
  }> => 
    request('/api/sms/status'),

  saveSmsConfig: (config: { fast2SmsApiKey?: string; twilioSid?: string; twilioAuthToken?: string; twilioPhoneNumber?: string }) => 
    request('/api/sms/config', {
      method: 'POST',
      body: JSON.stringify(config),
    }),

  // Attendance
  getStatus: (simHour?: number): Promise<{
    employee: Employee;
    methodology: ClockMethodologyStatus;
    todayRecord: AttendanceRecord | null;
    sheetId: string;
    locationConfig?: OfficeLocationConfig;
  }> => 
    request(`/api/attendance/status${typeof simHour === 'number' ? `?simHour=${simHour}` : ''}`),

  getLocationConfig: (): Promise<{ locationConfig: OfficeLocationConfig }> =>
    request('/api/location/config'),

  updateLocationConfig: (config: Partial<OfficeLocationConfig>) =>
    request('/api/location/config', {
      method: 'POST',
      body: JSON.stringify(config),
    }),

  punch: (action: 'clock_in' | 'clock_out', note?: string, simHour?: number, latitude?: number, longitude?: number) => 
    request('/api/attendance/punch', {
      method: 'POST',
      body: JSON.stringify({ action, note, simHour, latitude, longitude }),
    }),

  getHistory: (): Promise<{ records: AttendanceRecord[] }> => 
    request('/api/attendance/history'),

  // Admin & 250 Users Roster
  getEmployees: (): Promise<{
    employees: Employee[];
    stats: {
      totalRegistered: number;
      maxCapacity: number;
      clockedInToday: number;
      completedToday: number;
    };
    config: SheetConfig;
    sheetId: string;
  }> => 
    request('/api/admin/employees'),

  addEmployee: (employee: { phone: string; name?: string; department?: string; role?: string; id?: string }) => 
    request('/api/admin/employees', {
      method: 'POST',
      body: JSON.stringify(employee),
    }),

  bulkImportEmployees: (list: { phone: string; name?: string; department?: string; id?: string }[]) => 
    request('/api/admin/employees/bulk', {
      method: 'POST',
      body: JSON.stringify({ list }),
    }),

  getMasterLogs: (date?: string, employeeId?: string): Promise<{ records: AttendanceRecord[]; total: number }> => 
    request(`/api/admin/attendance-logs?${date ? `date=${date}&` : ''}${employeeId ? `employeeId=${employeeId}` : ''}`),

  updateConfig: (config: Partial<SheetConfig>) => 
    request('/api/admin/config', {
      method: 'POST',
      body: JSON.stringify(config),
    }),
};
