import express, { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { storage } from './storage';
import { generateOtp, verifyOtp, verifyPinLogin, unblockEmployee, getSession, removeSession } from './auth';
import { ClockMethodologyStatus, AttendanceRecord, Employee, OfficeLocationConfig } from '../src/types';
import { verifyGeofence, getDistanceMeters, formatDistance } from './location';

const app = express();
app.use(express.json());

const GOOGLE_SHEET_ID = '17_NObNlnC-AB2QDM8XGWe9B-Sg3HhZMySNuW5el3nOk';

// Authentication Middleware
function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
  const session = getSession(token);

  if (!session) {
    return res.status(401).json({ error: 'Unauthorized. Please log in with your phone number.' });
  }

  (req as any).user = session.employee;
  (req as any).token = token;
  next();
}

// Calculate methodology status based on time (supports simulation)
function computeMethodology(dateInput?: Date, simulatedHour?: number): ClockMethodologyStatus {
  const now = dateInput || new Date();
  const hour = typeof simulatedHour === 'number' && simulatedHour >= 0 && simulatedHour <= 23 
    ? simulatedHour 
    : now.getHours();
  const minute = now.getMinutes();

  // 12:00 AM (00:00) to 11:59 AM (11:59) is Morning Continuation (Clock In)
  // 12:00 PM (12:00) to 11:59 PM (23:59) is Afternoon (Clock Out)
  const isMorning = hour < 12;

  const hours12 = hour % 12 || 12;
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const timeFormatted = `${String(hours12).padStart(2, '0')}:${String(minute).padStart(2, '0')} ${ampm}`;

  if (isMorning) {
    return {
      serverTime: now.toISOString(),
      currentTimeFormatted: timeFormatted,
      currentHour: hour,
      currentMinute: minute,
      period: 'morning',
      periodTitle: 'Morning Shift Period (12:00 AM – 12:00 PM)',
      allowedAction: 'clock_in',
      actionPrompt: 'Clock In is active until 12:00 PM. Clock out opens at 12:00 PM noon.',
      canClockIn: true,
      canClockOut: false,
      simulationMode: typeof simulatedHour === 'number',
      simulatedHour,
    };
  } else {
    return {
      serverTime: now.toISOString(),
      currentTimeFormatted: timeFormatted,
      currentHour: hour,
      currentMinute: minute,
      period: 'afternoon',
      periodTitle: 'Afternoon / Evening Period (After 12:00 PM)',
      allowedAction: 'clock_out',
      actionPrompt: 'Clock Out is active after 12:00 PM until 12:00 AM midnight.',
      canClockIn: true,
      canClockOut: true,
      simulationMode: typeof simulatedHour === 'number',
      simulatedHour,
    };
  }
}

// Forward to Google Apps Script webhook if configured
async function syncRecordToGoogleSheet(record: AttendanceRecord) {
  const config = storage.getConfig();
  if (!config.appsScriptUrl) return;

  try {
    const payload = {
      sheetId: GOOGLE_SHEET_ID,
      employeeId: record.employeeId,
      phone: record.phone,
      name: record.name,
      department: record.department,
      date: record.date,
      clockInTime: record.clockIn ? record.clockIn.formatted : '',
      clockOutTime: record.clockOut ? record.clockOut.formatted : '',
      durationHours: record.durationFormatted,
      status: record.status,
      timestamp: new Date().toISOString(),
    };

    const res = await fetch(config.appsScriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      record.syncedToGoogleSheet = true;
      record.syncedAt = new Date().toISOString();
      storage.saveAttendanceRecord(record);
      storage.updateConfig({ lastSyncTime: new Date().toISOString() });
    }
  } catch (err) {
    console.error('Failed to sync to Google Apps Script:', err);
  }
}

// ==================== AUTH ROUTES ====================

// 1. Send OTP
app.post('/api/auth/send-otp', async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) {
      return res.status(400).json({ error: 'Phone number is required.' });
    }

    const result = await generateOtp(phone);
    return res.json({
      success: true,
      message: result.message,
      phone: result.phone,
      employee: result.employee,
      expiresInSeconds: result.expiresInSeconds,
      carrierNotice: result.carrierNotice,
      backupCode: result.backupCode,
    });
  } catch (err: any) {
    return res.status(400).json({ error: err.message || 'Failed to send OTP.' });
  }
});

// 2. Verify OTP
app.post('/api/auth/verify-otp', (req, res) => {
  try {
    const { phone, otp } = req.body;
    if (!phone || !otp) {
      return res.status(400).json({ error: 'Phone number and OTP code are required.' });
    }

    const result = verifyOtp(phone, otp);
    return res.json({
      success: true,
      token: result.token,
      employee: result.employee,
    });
  } catch (err: any) {
    return res.status(400).json({ error: err.message || 'Invalid or expired OTP.' });
  }
});

// 2b. Zero-Cost Google Sheet PIN Login with Single-Device Binding & Auto-Block
app.post('/api/auth/login-pin', async (req, res) => {
  try {
    const { phone, pin, deviceId, deviceName } = req.body;
    if (!phone || !pin) {
      return res.status(400).json({ error: 'Phone number and PIN are required.' });
    }
    if (!deviceId) {
      return res.status(400).json({ error: 'Device security identifier is required.' });
    }

    const result = await verifyPinLogin(phone, pin, deviceId, deviceName);
    return res.json({
      success: true,
      token: result.token,
      employee: result.employee,
    });
  } catch (err: any) {
    const status = err.message?.toLowerCase().includes('account blocked') ? 403 : 400;
    return res.status(status).json({ error: err.message || 'Login failed.' });
  }
});

// Admin Unblock Employee
app.post('/api/auth/unblock', requireAuth, (req, res) => {
  try {
    const { phoneOrId, resetDevice } = req.body;
    if (!phoneOrId) {
      return res.status(400).json({ error: 'Employee phone or ID is required.' });
    }
    const emp = unblockEmployee(phoneOrId, resetDevice !== false);
    if (!emp) {
      return res.status(404).json({ error: 'Employee not found.' });
    }
    return res.json({ success: true, employee: emp, message: `Employee ${emp.name} unblocked successfully.` });
  } catch (err: any) {
    return res.status(400).json({ error: err.message || 'Failed to unblock employee.' });
  }
});

// 3. Current User Profile
app.get('/api/auth/me', requireAuth, (req, res) => {
  const user = (req as any).user as Employee;
  return res.json({ employee: user });
});

// 4. Logout
app.post('/api/auth/logout', requireAuth, (req, res) => {
  const token = (req as any).token;
  removeSession(token);
  return res.json({ success: true, message: 'Logged out successfully.' });
});

// 5. SMS Gateway Status & Diagnostics
app.get('/api/sms/status', (req, res) => {
  const settings = storage.getSmsGatewaySettings();
  const hasFast2Sms = Boolean(process.env.FAST2SMS_API_KEY || settings.fast2SmsApiKey);
  const hasTwilio = Boolean((process.env.TWILIO_ACCOUNT_SID || settings.twilioSid) && (process.env.TWILIO_AUTH_TOKEN || settings.twilioAuthToken));

  const hasLiveCarrier = hasFast2Sms || hasTwilio;
  const activeProvider = hasFast2Sms ? 'Fast2SMS' : hasTwilio ? 'Twilio' : 'None (Server Log)';

  return res.json({
    hasLiveCarrier,
    activeProvider,
    lastDispatched: settings.lastDispatched || null,
  });
});

app.post('/api/sms/config', (req, res) => {
  const { fast2SmsApiKey, twilioSid, twilioAuthToken, twilioPhoneNumber } = req.body;
  const updated = storage.updateSmsGatewaySettings({
    fast2SmsApiKey,
    twilioSid,
    twilioAuthToken,
    twilioPhoneNumber,
  });
  return res.json({ success: true, settings: updated });
});

// ==================== ATTENDANCE ROUTES ====================

// Status & Today Record
app.get('/api/attendance/status', requireAuth, (req, res) => {
  const user = (req as any).user as Employee;
  const simHour = req.query.simHour !== undefined ? Number(req.query.simHour) : undefined;
  
  const methodology = computeMethodology(undefined, simHour);
  const todayStr = new Date().toISOString().split('T')[0];
  const todayRecord = storage.getTodayRecord(user.id, todayStr);

  return res.json({
    employee: user,
    methodology,
    todayRecord: todayRecord || null,
    sheetId: GOOGLE_SHEET_ID,
    locationConfig: storage.getLocationConfig(),
  });
});

// Location / Geofence Configuration
app.get('/api/location/config', requireAuth, (req, res) => {
  return res.json({ locationConfig: storage.getLocationConfig() });
});

app.post('/api/location/config', requireAuth, (req, res) => {
  const { latitude, longitude, radiusMeters, locationName, enforceLocation, mapsUrl } = req.body;
  const updated = storage.updateLocationConfig({
    ...(latitude !== undefined ? { latitude: Number(latitude) } : {}),
    ...(longitude !== undefined ? { longitude: Number(longitude) } : {}),
    ...(radiusMeters !== undefined ? { radiusMeters: Number(radiusMeters) } : {}),
    ...(locationName ? { locationName } : {}),
    ...(typeof enforceLocation === 'boolean' ? { enforceLocation } : {}),
    ...(mapsUrl ? { mapsUrl } : {}),
  });
  return res.json({ success: true, locationConfig: updated });
});

// Punch Action (Clock In / Clock Out with Geofence Verification)
app.post('/api/attendance/punch', requireAuth, async (req, res) => {
  const user = (req as any).user as Employee;
  const { action, note, simHour, latitude, longitude } = req.body; // action: 'clock_in' | 'clock_out'

  if (action !== 'clock_in' && action !== 'clock_out') {
    return res.status(400).json({ error: 'Action must be clock_in or clock_out.' });
  }

  const methodology = computeMethodology(undefined, simHour);
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  let record = storage.getTodayRecord(user.id, todayStr);

  const hours12 = now.getHours() % 12 || 12;
  const ampm = now.getHours() >= 12 ? 'PM' : 'AM';
  const timeFormatted = `${String(hours12).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')} ${ampm}`;

  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
  const clientDevice = req.headers['user-agent']?.slice(0, 80) || 'Web Browser';

  if (action === 'clock_in') {
    if (record && record.clockIn) {
      return res.status(400).json({
        error: `You have already clocked in today at ${record.clockIn.formatted}.`,
        record,
      });
    }

    // Geofence Validation: Ensure employee is physically at the designated office location
    const locConfig = storage.getLocationConfig();
    let distanceMeters: number | undefined;
    let locationVerified = false;

    if (locConfig.enforceLocation) {
      const geoCheck = verifyGeofence(
        latitude !== undefined ? Number(latitude) : undefined,
        longitude !== undefined ? Number(longitude) : undefined,
        locConfig.latitude,
        locConfig.longitude,
        locConfig.radiusMeters
      );

      if (!geoCheck.valid) {
        return res.status(403).json({
          error: geoCheck.error,
          distanceMeters: geoCheck.distanceMeters,
          formattedDistance: geoCheck.formattedDistance,
          requiredRadius: locConfig.radiusMeters,
          officeName: locConfig.locationName,
          mapsUrl: locConfig.mapsUrl,
        });
      }

      distanceMeters = geoCheck.distanceMeters;
      locationVerified = true;
    }

    if (!record) {
      record = {
        id: crypto.randomUUID(),
        employeeId: user.id,
        phone: user.phone,
        name: user.name,
        department: user.department,
        date: todayStr,
        clockIn: null,
        clockOut: null,
        durationMinutes: 0,
        durationFormatted: '0h 0m',
        status: 'clocked_in',
        syncedToGoogleSheet: false,
        syncedAt: null,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      };
    }

    record.clockIn = {
      time: now.toISOString(),
      formatted: timeFormatted,
      note: note || '',
      ip: String(clientIp),
      device: clientDevice,
      latitude: latitude !== undefined ? Number(latitude) : undefined,
      longitude: longitude !== undefined ? Number(longitude) : undefined,
      distanceMeters,
      locationVerified,
    };
    record.status = 'clocked_in';
    storage.saveAttendanceRecord(record);

    // Sync in background to Google Sheet if configured
    syncRecordToGoogleSheet(record).catch(() => {});

    return res.json({
      success: true,
      message: `Successfully Clocked In at ${timeFormatted}. Clock out opens after 12:00 PM.`,
      record,
      methodology,
    });
  }

  if (action === 'clock_out') {
    if (!record || !record.clockIn) {
      return res.status(400).json({
        error: 'No active Clock In found for today. Please clock in first.',
      });
    }

    if (record.clockOut) {
      return res.status(400).json({
        error: `You have already clocked out today at ${record.clockOut.formatted}.`,
        record,
      });
    }

    // Verify time methodology: Must be after 12:00 PM noon
    if (methodology.period === 'morning' && !methodology.simulationMode) {
      return res.status(400).json({
        error: 'Clock Out is strictly available after 12:00 PM (noon) per attendance methodology.',
      });
    }

    // Geofence Validation for Clock Out: Ensure employee is physically at the office when ending shift
    const locConfig = storage.getLocationConfig();
    let distanceMeters: number | undefined;
    let locationVerified = false;

    if (locConfig.enforceLocation) {
      const geoCheck = verifyGeofence(
        latitude !== undefined ? Number(latitude) : undefined,
        longitude !== undefined ? Number(longitude) : undefined,
        locConfig.latitude,
        locConfig.longitude,
        locConfig.radiusMeters
      );

      if (!geoCheck.valid) {
        return res.status(403).json({
          error: geoCheck.error?.replace('Clock-in', 'Clock-out') || 'Clock-out blocked: You must be at the office location to end your shift.',
          distanceMeters: geoCheck.distanceMeters,
          formattedDistance: geoCheck.formattedDistance,
          requiredRadius: locConfig.radiusMeters,
          officeName: locConfig.locationName,
          mapsUrl: locConfig.mapsUrl,
        });
      }

      distanceMeters = geoCheck.distanceMeters;
      locationVerified = true;
    }

    record.clockOut = {
      time: now.toISOString(),
      formatted: timeFormatted,
      note: note || '',
      ip: String(clientIp),
      device: clientDevice,
      latitude: latitude !== undefined ? Number(latitude) : undefined,
      longitude: longitude !== undefined ? Number(longitude) : undefined,
      distanceMeters,
      locationVerified,
    };

    // Calculate duration
    const inTime = new Date(record.clockIn.time).getTime();
    const outTime = now.getTime();
    const diffMinutes = Math.max(1, Math.round((outTime - inTime) / (1000 * 60)));
    const hrs = Math.floor(diffMinutes / 60);
    const mins = diffMinutes % 60;

    record.durationMinutes = diffMinutes;
    record.durationFormatted = `${hrs}h ${mins}m`;
    record.status = 'completed';
    storage.saveAttendanceRecord(record);

    // Sync in background to Google Sheet if configured
    syncRecordToGoogleSheet(record).catch(() => {});

    return res.json({
      success: true,
      message: `Successfully Clocked Out at ${timeFormatted}. Total time: ${record.durationFormatted}.`,
      record,
      methodology,
    });
  }
});

// Personal History
app.get('/api/attendance/history', requireAuth, (req, res) => {
  const user = (req as any).user as Employee;
  const records = storage.getAttendanceRecords({ employeeId: user.id });
  return res.json({ records });
});

// ==================== ADMIN & ROSTER (250 USERS) ====================

// List Employees & Capacity
app.get('/api/admin/employees', requireAuth, (req, res) => {
  const employees = storage.getEmployees();
  const config = storage.getConfig();
  const todayStr = new Date().toISOString().split('T')[0];
  const todayRecords = storage.getAttendanceRecords({ date: todayStr });

  const stats = {
    totalRegistered: employees.length,
    maxCapacity: config.totalCapacity || 250,
    clockedInToday: todayRecords.filter((r) => r.status === 'clocked_in').length,
    completedToday: todayRecords.filter((r) => r.status === 'completed').length,
  };

  return res.json({
    employees,
    stats,
    config,
    sheetId: GOOGLE_SHEET_ID,
  });
});

// Add or Edit Employee
app.post('/api/admin/employees', requireAuth, (req, res) => {
  try {
    const { phone, name, department, role, id } = req.body;
    if (!phone) {
      return res.status(400).json({ error: 'Phone number is required.' });
    }

    const employee = storage.addOrUpdateEmployee({
      phone,
      name,
      department,
      role: role || 'employee',
      id,
    });

    return res.json({ success: true, employee });
  } catch (err: any) {
    return res.status(400).json({ error: err.message || 'Failed to save employee.' });
  }
});

// Bulk Upload Roster (up to 250 users)
app.post('/api/admin/employees/bulk', requireAuth, (req, res) => {
  try {
    const { list } = req.body;
    if (!Array.isArray(list)) {
      return res.status(400).json({ error: 'Invalid payload: list must be an array.' });
    }

    const employees = storage.bulkImportEmployees(list);
    return res.json({
      success: true,
      count: employees.length,
      employees,
      message: `Successfully imported ${employees.length} employees.`,
    });
  } catch (err: any) {
    return res.status(400).json({ error: err.message || 'Failed to bulk import.' });
  }
});

// Master Attendance Logs
app.get('/api/admin/attendance-logs', requireAuth, (req, res) => {
  const { date, employeeId } = req.query;
  const records = storage.getAttendanceRecords({
    date: date ? String(date) : undefined,
    employeeId: employeeId ? String(employeeId) : undefined,
  });

  return res.json({ records, total: records.length });
});

// Update Google Apps Script & Sheet Settings
app.post('/api/admin/config', requireAuth, (req, res) => {
  const { appsScriptUrl, autoSyncEnabled } = req.body;
  const updated = storage.updateConfig({
    appsScriptUrl: appsScriptUrl !== undefined ? appsScriptUrl : undefined,
    autoSyncEnabled: autoSyncEnabled !== undefined ? autoSyncEnabled : undefined,
  });
  return res.json({ success: true, config: updated });
});

// CSV Export formatted for Google Sheet ID 17_NObNlnC-AB2QDM8XGWe9B-Sg3HhZMySNuW5el3nOk
app.get('/api/admin/export-csv', requireAuth, (req, res) => {
  const records = storage.getAttendanceRecords();
  const headers = ['Employee ID', 'Phone Number', 'Name', 'Department', 'Date', 'Clock In', 'Clock Out', 'Duration', 'Status', 'Synced'];
  const rows = records.map((r) => [
    `"${r.employeeId}"`,
    `"${r.phone}"`,
    `"${r.name}"`,
    `"${r.department}"`,
    `"${r.date}"`,
    `"${r.clockIn?.formatted || ''}"`,
    `"${r.clockOut?.formatted || ''}"`,
    `"${r.durationFormatted || ''}"`,
    `"${r.status}"`,
    `"${r.syncedToGoogleSheet ? 'YES' : 'NO'}"`,
  ]);

  const csvContent = [headers.join(','), ...rows.map((row) => row.join(','))].join('\r\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename=attendance_sheet_${GOOGLE_SHEET_ID}.csv`);
  return res.send(csvContent);
});

// Explicit JSON 404 handler for all /api endpoints to prevent HTML fallbacks
app.all('/api/*', (_req, res) => {
  res.status(404).json({ error: 'API endpoint not found.' });
});

// Global JSON error handler
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Server error:', err);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error.' });
});

export { app };
export default app;
