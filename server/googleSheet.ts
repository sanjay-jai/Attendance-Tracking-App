import { Employee } from '../src/types';

export const GOOGLE_SHEET_ID = '17_NObNlnC-AB2QDM8XGWe9B-Sg3HhZMySNuW5el3nOk';
const GVIZ_CSV_URL = `https://docs.google.com/spreadsheets/d/${GOOGLE_SHEET_ID}/gviz/tq?tqx=out:csv`;

export interface SheetEmployee {
  id: string;
  name: string;
  phone: string;
  rawPhone: string;
  department?: string;
  pin: string;
}

// In-memory cache to be fast and responsive, refreshed every 15 seconds or on demand
let cachedEmployees: SheetEmployee[] = [
  {
    id: 'EMP-001',
    name: 'Sanjai',
    phone: '8056799104',
    rawPhone: '8056799104',
    department: 'General Staff',
    pin: '9104',
  },
];
let lastFetchTime = 0;
const CACHE_TTL_MS = 15 * 1000; // 15 seconds

// Helper to normalize phone numbers for comparison
// E.g., "+91 8056799104", "08056799104", "8056799104" -> "8056799104"
export function cleanPhoneNumber(input: string): string {
  if (!input) return '';
  // Remove all non-digits
  let digits = input.replace(/\D/g, '');
  // If it starts with 91 (India country code) and has 12 digits, strip 91 for 10-digit match
  if (digits.length === 12 && digits.startsWith('91')) {
    digits = digits.slice(2);
  }
  // Strip leading 0
  if (digits.length === 11 && digits.startsWith('0')) {
    digits = digits.slice(1);
  }
  return digits;
}

// Robust CSV parser that handles quotes and line-breaks
function parseCsv(csvText: string): string[][] {
  const rows: string[][] = [];
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);

  // If Google Sheet output has concatenated rows without newlines, handle split by pattern
  for (const line of lines) {
    const cells: string[] = [];
    const regex = /(?:^|,|")(?:"([^"]*(?:""[^"]*)*)"|([^",]*))/g;
    let match;
    let lineCells: string[] = [];
    
    // Simpler quote-aware split
    const matches = line.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g);
    if (matches && matches.length > 0) {
      for (const m of matches) {
        lineCells.push(m.replace(/^"|"$/g, '').trim());
      }
      rows.push(lineCells);
    } else {
      // Fallback simple CSV split
      const parts = line.split(',').map((p) => p.replace(/^"|"$/g, '').trim());
      if (parts.length > 0) {
        rows.push(parts);
      }
    }
  }

  // Also check if multiple rows were joined together like `"Name","Phone No""Sanjai","8056799104"`
  if (rows.length === 1 && csvText.includes('""')) {
    // Split by `""`
    const subParts = csvText.split('""');
    const reconstructed: string[][] = [];
    for (const sub of subParts) {
      const tokens = sub.split(',').map((p) => p.replace(/^"|"$/g, '').trim()).filter(Boolean);
      if (tokens.length >= 2) {
        reconstructed.push(tokens);
      }
    }
    if (reconstructed.length > rows.length) {
      return reconstructed;
    }
  }

  return rows;
}

export async function fetchSheetEmployees(forceRefresh = false): Promise<SheetEmployee[]> {
  const now = Date.now();
  if (!forceRefresh && cachedEmployees.length > 0 && now - lastFetchTime < CACHE_TTL_MS) {
    return cachedEmployees;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000); // 6s timeout

    const res = await fetch(GVIZ_CSV_URL, {
      signal: controller.signal,
      headers: {
        'Accept': 'text/csv, text/plain, */*',
        'User-Agent': 'ChronosAttendance/1.0',
      },
    });
    clearTimeout(timeout);

    if (!res.ok) {
      console.warn(`Failed to fetch Google Sheet CSV: HTTP ${res.status}`);
      return cachedEmployees;
    }

    const csvText = await res.text();
    const parsedRows = parseCsv(csvText);

    if (parsedRows.length === 0) {
      return cachedEmployees;
    }

    // Identify header row
    let headerRowIndex = -1;
    let nameColIndex = 0;
    let phoneColIndex = 1;
    let pinColIndex = -1;

    for (let i = 0; i < Math.min(parsedRows.length, 3); i++) {
      const row = parsedRows[i].map((c) => c.toLowerCase());
      const hasPhone = row.some((c) => c.includes('phone') || c.includes('mobile') || c.includes('number') || c.includes('contact'));
      const hasName = row.some((c) => c.includes('name') || c.includes('employee'));
      if (hasPhone || hasName) {
        headerRowIndex = i;
        nameColIndex = row.findIndex((c) => c.includes('name') || c.includes('employee'));
        phoneColIndex = row.findIndex((c) => c.includes('phone') || c.includes('mobile') || c.includes('number'));
        pinColIndex = row.findIndex((c) => c.includes('pin') || c.includes('pass') || c.includes('code'));
        if (nameColIndex === -1) nameColIndex = 0;
        if (phoneColIndex === -1) phoneColIndex = 1;
        break;
      }
    }

    const employees: SheetEmployee[] = [];
    const startIndex = headerRowIndex >= 0 ? headerRowIndex + 1 : 0;

    for (let i = startIndex; i < parsedRows.length; i++) {
      const row = parsedRows[i];
      if (!row || row.length < 2) continue;

      const rawName = row[nameColIndex] || `Employee ${i}`;
      const rawPhone = row[phoneColIndex] || '';
      const cleanPhone = cleanPhoneNumber(rawPhone);

      if (!cleanPhone || cleanPhone.length < 5) continue;

      // Extract PIN from sheet if present, or default to last 4 digits of phone
      const rawPin = pinColIndex >= 0 && row[pinColIndex] ? String(row[pinColIndex]).trim() : '';
      const pin = rawPin || (cleanPhone.length >= 4 ? cleanPhone.slice(-4) : '1234');

      const empId = `EMP-${String(employees.length + 1).padStart(3, '0')}`;
      employees.push({
        id: empId,
        name: rawName,
        phone: cleanPhone,
        rawPhone: rawPhone,
        department: 'Staff',
        pin: pin,
      });
    }

    if (employees.length > 0) {
      cachedEmployees = employees;
      lastFetchTime = now;
    }
  } catch (err) {
    console.warn('Error fetching Google Sheet data, using cached list:', err);
  }

  return cachedEmployees;
}

// Find employee by phone number in the Google Sheet
export async function findEmployeeInSheet(phoneInput: string): Promise<SheetEmployee | null> {
  const employees = await fetchSheetEmployees();
  const cleanInput = cleanPhoneNumber(phoneInput);

  if (!cleanInput) return null;

  // Search exact or matching suffix (e.g. 10-digit number)
  const match = employees.find((emp) => {
    return (
      emp.phone === cleanInput ||
      emp.phone.endsWith(cleanInput) ||
      cleanInput.endsWith(emp.phone)
    );
  });

  return match || null;
}
