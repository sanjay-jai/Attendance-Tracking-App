import fs from 'fs';
import path from 'path';
import { Employee, AttendanceRecord, SheetConfig, OfficeLocationConfig } from '../src/types';
import seedStoreData from '../data/attendance-store.json';

export interface SmsGatewaySettings {
  fast2SmsApiKey?: string;
  twilioSid?: string;
  twilioAuthToken?: string;
  twilioPhoneNumber?: string;
  lastDispatched?: {
    phone: string;
    code: string;
    time: string;
    provider: string;
    status: string;
  };
}

interface DatabaseData {
  employees: Employee[];
  attendance: AttendanceRecord[];
  config: SheetConfig;
  smsGateway: SmsGatewaySettings;
  locationConfig: OfficeLocationConfig;
}

const isVercel = Boolean(process.env.VERCEL);
const DATA_DIR = isVercel ? path.resolve('/tmp', 'data') : path.resolve(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'attendance-store.json');

const DEFAULT_INITIAL_DATA: DatabaseData = {
  config: (seedStoreData as any).config || {
    sheetId: '17_NObNlnC-AB2QDM8XGWe9B-Sg3HhZMySNuW5el3nOk',
    appsScriptUrl: '',
    lastSyncTime: null,
    autoSyncEnabled: true,
    totalCapacity: 250,
  },
  smsGateway: (seedStoreData as any).smsGateway || {},
  locationConfig: (seedStoreData as any).locationConfig || {
    mapsUrl: 'https://maps.app.goo.gl/uYd8xLuEXXurUwwB7?g_st=aw',
    latitude: 8.816194,
    longitude: 78.154972,
    radiusMeters: 150,
    locationName: 'Designated Workplace (8.816194, 78.154972)',
    enforceLocation: true,
  },
  employees: (seedStoreData as any).employees || [
    {
      id: 'EMP-001',
      phone: '8056799104',
      name: 'Sanjai',
      department: 'Operations',
      role: 'employee',
      active: true,
      createdAt: new Date().toISOString(),
    },
  ],
  attendance: (seedStoreData as any).attendance || [],
};

class Storage {
  private data: DatabaseData;

  constructor() {
    this.data = this.load();
  }

  private load(): DatabaseData {
    try {
      if (fs.existsSync(DATA_FILE)) {
        const raw = fs.readFileSync(DATA_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        return {
          employees: parsed.employees || DEFAULT_INITIAL_DATA.employees,
          attendance: parsed.attendance || [],
          config: {
            ...DEFAULT_INITIAL_DATA.config,
            ...(parsed.config || {}),
            sheetId: '17_NObNlnC-AB2QDM8XGWe9B-Sg3HhZMySNuW5el3nOk',
          },
          smsGateway: parsed.smsGateway || {},
          locationConfig: parsed.locationConfig || DEFAULT_INITIAL_DATA.locationConfig,
        };
      }
    } catch (err) {
      console.warn('Notice: Reading from seed database state', err);
    }
    return DEFAULT_INITIAL_DATA;
  }

  private saveData(dataToSave: DatabaseData) {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      fs.writeFileSync(DATA_FILE, JSON.stringify(dataToSave, null, 2), 'utf-8');
    } catch (err) {
      // In serverless environments, file write failure is non-fatal because memory holds current state
      console.warn('Storage write warning:', (err as any)?.message || err);
    }
  }

  public normalizePhone(input: string): string {
    return input.replace(/[\s\-\(\)\.]/g, '');
  }

  public getEmployees(): Employee[] {
    return this.data.employees;
  }

  public findEmployeeByPhone(phone: string): Employee | undefined {
    const clean = this.normalizePhone(phone);
    return this.data.employees.find((emp) => {
      const empClean = this.normalizePhone(emp.phone);
      return empClean === clean || empClean.endsWith(clean) || clean.endsWith(empClean);
    });
  }

  public findEmployeeById(id: string): Employee | undefined {
    return this.data.employees.find((emp) => emp.id.toLowerCase() === id.toLowerCase());
  }

  public addOrUpdateEmployee(emp: Partial<Employee> & { phone: string }): Employee {
    const cleanPhone = this.normalizePhone(emp.phone);
    const existing = this.findEmployeeByPhone(cleanPhone);

    if (existing) {
      existing.name = emp.name || existing.name;
      existing.department = emp.department || existing.department;
      if (emp.role) existing.role = emp.role;
      if (typeof emp.active === 'boolean') existing.active = emp.active;
      this.saveData(this.data);
      return existing;
    }

    const count = this.data.employees.length + 1;
    const nextId = emp.id || `EMP-${String(count).padStart(3, '0')}`;
    const newEmp: Employee = {
      id: nextId,
      phone: cleanPhone,
      name: emp.name || `Employee ${count}`,
      department: emp.department || 'General Staff',
      role: emp.role || 'employee',
      active: true,
      createdAt: new Date().toISOString(),
    };

    this.data.employees.push(newEmp);
    this.saveData(this.data);
    return newEmp;
  }

  public bulkImportEmployees(list: { phone: string; name?: string; department?: string; id?: string }[]): Employee[] {
    const results: Employee[] = [];
    for (const item of list) {
      if (!item.phone || item.phone.trim().length < 6) continue;
      const emp = this.addOrUpdateEmployee({
        phone: item.phone.trim(),
        name: item.name?.trim(),
        department: item.department?.trim(),
        id: item.id?.trim(),
      });
      results.push(emp);
    }
    return results;
  }

  public getAttendanceRecords(filter?: { date?: string; employeeId?: string }): AttendanceRecord[] {
    let list = this.data.attendance;
    if (filter?.date) {
      list = list.filter((r) => r.date === filter.date);
    }
    if (filter?.employeeId) {
      list = list.filter((r) => r.employeeId === filter.employeeId);
    }
    return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  public getTodayRecord(employeeId: string, dateStr: string): AttendanceRecord | undefined {
    return this.data.attendance.find((r) => r.employeeId === employeeId && r.date === dateStr);
  }

  public saveAttendanceRecord(record: AttendanceRecord): AttendanceRecord {
    const idx = this.data.attendance.findIndex((r) => r.id === record.id);
    record.updatedAt = new Date().toISOString();
    if (idx >= 0) {
      this.data.attendance[idx] = record;
    } else {
      this.data.attendance.unshift(record);
    }
    this.saveData(this.data);
    return record;
  }

  public getConfig(): SheetConfig {
    return this.data.config;
  }

  public updateConfig(newConfig: Partial<SheetConfig>): SheetConfig {
    this.data.config = {
      ...this.data.config,
      ...newConfig,
      sheetId: '17_NObNlnC-AB2QDM8XGWe9B-Sg3HhZMySNuW5el3nOk',
    };
    this.saveData(this.data);
    return this.data.config;
  }

  // SMS Gateway Settings
  public getSmsGatewaySettings(): SmsGatewaySettings {
    return this.data.smsGateway || {};
  }

  public updateSmsGatewaySettings(settings: Partial<SmsGatewaySettings>): SmsGatewaySettings {
    this.data.smsGateway = {
      ...this.data.smsGateway,
      ...settings,
    };
    this.saveData(this.data);
    return this.data.smsGateway;
  }

  public setLastDispatchedSms(entry: { phone: string; code: string; provider: string; status: string }) {
    if (!this.data.smsGateway) {
      this.data.smsGateway = {};
    }
    this.data.smsGateway.lastDispatched = {
      ...entry,
      time: new Date().toISOString(),
    };
    this.saveData(this.data);
  }

  // Location / Geofence Settings
  public getLocationConfig(): OfficeLocationConfig {
    return this.data.locationConfig || DEFAULT_INITIAL_DATA.locationConfig;
  }

  public updateLocationConfig(newLoc: Partial<OfficeLocationConfig>): OfficeLocationConfig {
    this.data.locationConfig = {
      ...this.getLocationConfig(),
      ...newLoc,
    };
    this.saveData(this.data);
    return this.data.locationConfig;
  }
}

export const storage = new Storage();
