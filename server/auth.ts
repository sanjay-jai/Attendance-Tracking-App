import crypto from 'crypto';
import { storage } from './storage';
import { Employee, AuthSession } from '../src/types';
import { findEmployeeInSheet, cleanPhoneNumber, fetchSheetEmployees } from './googleSheet';
import { sendSmsOtp } from './sms';

interface OtpEntry {
  phone: string;
  code: string;
  expiresAt: number;
  attempts: number;
  createdAt: number;
}

const otpStore = new Map<string, OtpEntry>();
const sessionStore = new Map<string, AuthSession>();

// Clean up expired OTPs and sessions every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [phone, entry] of otpStore.entries()) {
    if (now > entry.expiresAt) {
      otpStore.delete(phone);
    }
  }
  for (const [token, session] of sessionStore.entries()) {
    if (now > session.expiresAt) {
      sessionStore.delete(token);
    }
  }
}, 5 * 60 * 1000);

export async function generateOtp(phoneInput: string): Promise<{
  success: boolean;
  phone: string;
  expiresInSeconds: number;
  employee: Employee;
  message: string;
  carrierNotice?: string;
  backupCode?: string;
}> {
  const cleanPhone = cleanPhoneNumber(phoneInput);
  if (!cleanPhone || cleanPhone.length < 5) {
    throw new Error('Please enter a valid phone number.');
  }

  // 1. Strictly verify if the phone number exists in the Google Sheet
  const sheetEmp = await findEmployeeInSheet(cleanPhone);
  if (!sheetEmp) {
    // User requested: "see the google sheet number if the number is there send otp otherwise don't send otp show number not added"
    throw new Error('Number not added');
  }

  // 2. Fetch or update local employee profile matched from the Google Sheet
  let employee = storage.findEmployeeByPhone(cleanPhone);
  if (!employee) {
    employee = storage.addOrUpdateEmployee({
      phone: sheetEmp.phone,
      name: sheetEmp.name,
      department: sheetEmp.department || 'Staff',
      id: sheetEmp.id,
      role: 'employee',
      active: true,
    });
  } else {
    if (sheetEmp.name && employee.name !== sheetEmp.name) {
      employee.name = sheetEmp.name;
    }
  }

  // 3. Generate secure 6-digit OTP
  const randomInt = crypto.randomInt(100000, 999999);
  const code = randomInt.toString();
  const expiresInSeconds = 300; // 5 minutes

  otpStore.set(cleanPhone, {
    phone: cleanPhone,
    code,
    expiresAt: Date.now() + expiresInSeconds * 1000,
    attempts: 0,
    createdAt: Date.now(),
  });

  // Dispatch SMS to user's physical phone
  const smsResult = await sendSmsOtp(sheetEmp.phone, code, sheetEmp.name);

  return {
    success: true,
    phone: cleanPhone,
    expiresInSeconds,
    employee,
    message: smsResult.liveCellularDelivered
      ? `OTP sent via SMS to ${cleanPhone}. Please check your phone.`
      : `OTP generated for ${cleanPhone}.`,
    carrierNotice: smsResult.liveCellularDelivered ? undefined : smsResult.error,
    backupCode: smsResult.liveCellularDelivered ? undefined : code,
  };
}

export function verifyOtp(phoneInput: string, codeInput: string): {
  success: boolean;
  token: string;
  employee: Employee;
} {
  const cleanPhone = cleanPhoneNumber(phoneInput);
  const entry = otpStore.get(cleanPhone);

  if (!entry) {
    throw new Error('No active OTP found. Please request a new OTP code.');
  }

  if (Date.now() > entry.expiresAt) {
    otpStore.delete(cleanPhone);
    throw new Error('OTP has expired. Please request a fresh one.');
  }

  if (entry.attempts >= 4) {
    otpStore.delete(cleanPhone);
    throw new Error('Too many invalid attempts. Please generate a new OTP.');
  }

  if (entry.code !== codeInput.trim()) {
    entry.attempts += 1;
    throw new Error(`Incorrect OTP code. ${4 - entry.attempts} attempt(s) remaining.`);
  }

  // OTP verified! Invalidate OTP
  otpStore.delete(cleanPhone);

  // Retrieve employee
  let employee = storage.findEmployeeByPhone(cleanPhone);
  if (!employee) {
    employee = storage.addOrUpdateEmployee({
      phone: cleanPhone,
      name: 'Employee',
      department: 'Staff',
      role: 'employee',
      active: true,
    });
  }

  // Create session
  const token = crypto.randomBytes(32).toString('hex');
  const session: AuthSession = {
    token,
    employee,
    expiresAt: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
  };

  sessionStore.set(token, session);

  return {
    success: true,
    token,
    employee,
  };
}

export async function verifyPinLogin(
  phoneInput: string,
  pinInput: string,
  deviceIdInput: string,
  deviceNameInput?: string
): Promise<{
  success: boolean;
  token: string;
  employee: Employee;
}> {
  const cleanPhone = cleanPhoneNumber(phoneInput);
  if (!cleanPhone || cleanPhone.length < 5) {
    throw new Error('Please enter a valid phone number.');
  }

  // 1. Verify phone in Google Sheet
  const sheetEmp = await findEmployeeInSheet(cleanPhone);
  if (!sheetEmp) {
    throw new Error('Number not added');
  }

  // 2. Fetch or initialize employee
  let employee = storage.findEmployeeByPhone(cleanPhone);
  if (!employee) {
    employee = storage.addOrUpdateEmployee({
      phone: sheetEmp.phone,
      name: sheetEmp.name,
      department: sheetEmp.department || 'Staff',
      id: sheetEmp.id,
      pin: sheetEmp.pin,
      role: 'employee',
      active: true,
    });
  } else {
    if (sheetEmp.name && employee.name !== sheetEmp.name) employee.name = sheetEmp.name;
    if (sheetEmp.pin && employee.pin !== sheetEmp.pin) employee.pin = sheetEmp.pin;
  }

  // 3. Check if account is blocked
  if (employee.isBlocked) {
    const reason = employee.blockReason || 'Multi-device access detected';
    throw new Error(`Account Blocked: ${reason}. Please contact administrator.`);
  }

  // 4. Verify PIN
  const expectedPin = (employee.pin || sheetEmp.pin || cleanPhone.slice(-4)).trim();
  if (pinInput.trim() !== expectedPin) {
    throw new Error('Incorrect PIN. Please enter your valid 4-digit PIN.');
  }

  // 5. Device Binding & Fraud Auto-Locking
  const deviceId = (deviceIdInput || '').trim();
  const deviceName = (deviceNameInput || 'Mobile Device').trim();

  if (!deviceId) {
    throw new Error('Device identifier missing. Please refresh and try again.');
  }

  if (!employee.boundDeviceId) {
    // First-time login: bind strictly to this phone!
    employee.boundDeviceId = deviceId;
    employee.boundDeviceName = deviceName;
    employee.deviceBoundAt = new Date().toISOString();
    storage.addOrUpdateEmployee(employee);
    console.log(`[DEVICE-BIND] Employee ${employee.id} (${employee.name}) bound to device: ${deviceName} (${deviceId})`);
  } else if (employee.boundDeviceId !== deviceId) {
    // FRAUD DETECTED: Tried logging in from a second phone!
    employee.isBlocked = true;
    employee.blockReason = `Attempted login from a second device (${deviceName}). Registered device: ${employee.boundDeviceName || 'Phone 1'}`;
    employee.blockedAt = new Date().toISOString();
    storage.addOrUpdateEmployee(employee);

    console.warn(`[DEVICE-FRAUD-BLOCKED] Employee ${employee.id} (${employee.phone}) BLOCKED! Registered: ${employee.boundDeviceId}, Attempted: ${deviceId}`);
    throw new Error(`Account Blocked: Multi-device access detected. This account was logged in on another device and is now locked to prevent proxy attendance.`);
  }

  // 6. Create session (persists 30 days on bound phone)
  const token = crypto.randomBytes(32).toString('hex');
  const session: AuthSession = {
    token,
    employee,
    expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
  };

  sessionStore.set(token, session);

  return {
    success: true,
    token,
    employee,
  };
}

export function unblockEmployee(phoneOrId: string, resetDevice = true): Employee | undefined {
  const cleanPhone = cleanPhoneNumber(phoneOrId);
  let employee = storage.findEmployeeByPhone(cleanPhone) || storage.findEmployeeById(phoneOrId);
  if (!employee) return undefined;

  employee.isBlocked = false;
  employee.blockReason = undefined;
  employee.blockedAt = undefined;
  if (resetDevice) {
    employee.boundDeviceId = undefined;
    employee.boundDeviceName = undefined;
    employee.deviceBoundAt = undefined;
  }
  storage.addOrUpdateEmployee(employee);
  return employee;
}

export function getSession(token?: string): AuthSession | null {
  if (!token) return null;
  const session = sessionStore.get(token);
  if (!session) return null;
  if (Date.now() > session.expiresAt) {
    sessionStore.delete(token);
    return null;
  }
  // Keep employee reference updated
  const freshEmployee = storage.findEmployeeById(session.employee.id);
  if (freshEmployee) {
    session.employee = freshEmployee;
  }
  return session;
}

export function removeSession(token?: string) {
  if (token) {
    sessionStore.delete(token);
  }
}
