import React, { useState, useEffect } from 'react';
import { Employee, AttendanceRecord } from '../types';
import { api, setStoredToken } from '../api';
import { 
  Users, 
  UserPlus, 
  Upload, 
  FileSpreadsheet, 
  Download, 
  Search, 
  CheckCircle2, 
  Clock, 
  LogIn, 
  ExternalLink,
  ShieldCheck,
  RefreshCw,
  AlertCircle
} from 'lucide-react';

interface AdminRosterProps {
  onSwitchUser: (employee: Employee) => void;
  onOpenSheetModal: () => void;
}

export const AdminRoster: React.FC<AdminRosterProps> = ({
  onSwitchUser,
  onOpenSheetModal,
}) => {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [masterLogs, setMasterLogs] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeSubTab, setActiveSubTab] = useState<'employees' | 'logs'>('employees');

  // Add Employee Form State
  const [showAddModal, setShowAddModal] = useState(false);
  const [newPhone, setNewPhone] = useState('');
  const [newName, setNewName] = useState('');
  const [newDept, setNewDept] = useState('Operations');
  const [newId, setNewId] = useState('');

  // Bulk Import State
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [bulkStatus, setBulkStatus] = useState<string | null>(null);

  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [empRes, logsRes] = await Promise.all([
        api.getEmployees(),
        api.getMasterLogs(),
      ]);
      setEmployees(empRes.employees);
      setMasterLogs(logsRes.records);
    } catch (err: any) {
      console.error('Failed to load roster:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleAddEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPhone.trim()) return;

    try {
      await api.addEmployee({
        phone: newPhone.trim(),
        name: newName.trim() || undefined,
        department: newDept.trim() || undefined,
        id: newId.trim() || undefined,
      });

      setFeedback({ type: 'success', msg: `Employee with phone ${newPhone} added successfully!` });
      setShowAddModal(false);
      setNewPhone('');
      setNewName('');
      setNewId('');
      loadData();
    } catch (err: any) {
      setFeedback({ type: 'error', msg: err.message || 'Failed to add employee.' });
    }
  };

  const handleBulkImport = async () => {
    if (!bulkText.trim()) return;

    try {
      // Parse lines: phone, name, department, id
      const lines = bulkText.split('\n');
      const list: { phone: string; name?: string; department?: string; id?: string }[] = [];

      for (const line of lines) {
        const cleanLine = line.trim();
        if (!cleanLine) continue;
        const parts = cleanLine.split(/[,;\t]/).map((p) => p.trim());
        if (parts[0]) {
          list.push({
            phone: parts[0],
            name: parts[1] || undefined,
            department: parts[2] || undefined,
            id: parts[3] || undefined,
          });
        }
      }

      if (list.length === 0) {
        setBulkStatus('No valid phone numbers found in input.');
        return;
      }

      const res = await api.bulkImportEmployees(list);
      setFeedback({ type: 'success', msg: `Successfully imported ${res.count} employees into directory!` });
      setShowBulkModal(false);
      setBulkText('');
      loadData();
    } catch (err: any) {
      setBulkStatus(err.message || 'Bulk import failed.');
    }
  };

  const simulateLogin = async (emp: Employee) => {
    try {
      // Generate OTP and verify for this employee to switch session
      const otpRes = await api.sendOtp(emp.phone);
      if (otpRes.simulatedOtp) {
        const verifyRes = await api.verifyOtp(emp.phone, otpRes.simulatedOtp);
        setStoredToken(verifyRes.token);
        onSwitchUser(verifyRes.employee);
      }
    } catch (err: any) {
      alert(`Could not switch user: ${err.message}`);
    }
  };

  const filteredEmployees = employees.filter(
    (e) =>
      e.phone.toLowerCase().includes(search.toLowerCase()) ||
      e.id.toLowerCase().includes(search.toLowerCase()) ||
      e.name.toLowerCase().includes(search.toLowerCase()) ||
      e.department.toLowerCase().includes(search.toLowerCase())
  );

  const capacity = 250;
  const capacityPercent = Math.min(100, Math.round((employees.length / capacity) * 100));

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Feedback Banner */}
      {feedback && (
        <div
          className={`p-4 rounded-2xl border text-sm flex items-center justify-between shadow-lg ${
            feedback.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
          }`}
        >
          <span>{feedback.msg}</span>
          <button onClick={() => setFeedback(null)} className="text-xs underline ml-4">
            Dismiss
          </button>
        </div>
      )}

      {/* Directory & Google Sheet Integration Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-6">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-2 bg-blue-500/10 text-blue-400 rounded-xl">
                <Users className="w-5 h-5" />
              </span>
              <h2 className="text-xl font-bold text-white">250 Users Directory & Sheet Control</h2>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Reflects distinct Employee IDs for each individual phone number. Linked with Google Sheet ID <strong className="text-emerald-400 font-mono">17_NObNlnC-AB2QDM8XGWe9B-Sg3HhZMySNuW5el3nOk</strong>.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={() => setShowAddModal(true)}
              className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm"
            >
              <UserPlus className="w-4 h-4" />
              <span>+ Add Phone Number</span>
            </button>

            <button
              onClick={() => setShowBulkModal(true)}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors"
            >
              <Upload className="w-4 h-4" />
              <span>Bulk Import (250)</span>
            </button>

            <a
              href="/api/admin/export-csv"
              download
              className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm"
            >
              <Download className="w-4 h-4" />
              <span>Export Sheet CSV</span>
            </a>

            <button
              onClick={onOpenSheetModal}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-emerald-500/40 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
              <span>Sheet Sync Info</span>
            </button>
          </div>
        </div>

        {/* Capacity Bar */}
        <div className="mt-6 pt-1">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
            <span>
              Directory Capacity: <strong className="text-white font-mono">{employees.length}</strong> / {capacity} Users Enrolled
            </span>
            <span className="font-mono text-blue-400">{capacityPercent}% full</span>
          </div>
          <div className="w-full h-2.5 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
            <div
              className="h-full bg-gradient-to-r from-blue-500 to-emerald-400 rounded-full transition-all duration-500"
              style={{ width: `${Math.max(2, capacityPercent)}%` }}
            />
          </div>
        </div>
      </div>

      {/* Sub-Tabs: Employees Directory vs Master Logs */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveSubTab('employees')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                activeSubTab === 'employees'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white bg-slate-800/60'
              }`}
            >
              Registered Users ({employees.length})
            </button>
            <button
              onClick={() => setActiveSubTab('logs')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                activeSubTab === 'logs'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white bg-slate-800/60'
              }`}
            >
              Master Attendance Logs ({masterLogs.length})
            </button>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                placeholder="Search ID, phone, name..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 pr-4 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500 w-52 sm:w-64"
              />
            </div>
            <button
              onClick={loadData}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300"
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Content based on sub-tab */}
        {activeSubTab === 'employees' ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 uppercase font-semibold tracking-wider">
                  <th className="py-3 px-4">Employee ID</th>
                  <th className="py-3 px-4">Phone Number</th>
                  <th className="py-3 px-4">Full Name</th>
                  <th className="py-3 px-4">Department</th>
                  <th className="py-3 px-4">Role</th>
                  <th className="py-3 px-4 text-right">Switch / Test Punch</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-200">
                {filteredEmployees.map((emp) => (
                  <tr key={emp.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-3.5 px-4">
                      <span className="font-mono font-bold text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20">
                        {emp.id}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 font-mono font-medium text-white">
                      {emp.phone}
                    </td>
                    <td className="py-3.5 px-4 font-medium">{emp.name}</td>
                    <td className="py-3.5 px-4 text-slate-400">{emp.department}</td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                          emp.role === 'admin'
                            ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                            : 'bg-slate-800 text-slate-300'
                        }`}
                      >
                        {emp.role}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => simulateLogin(emp)}
                        className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-blue-600 hover:text-white text-slate-300 border border-slate-700 text-xs transition-colors"
                        title="Simulate login for this employee to punch attendance"
                      >
                        Punch as this user
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 uppercase font-semibold tracking-wider">
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Employee ID</th>
                  <th className="py-3 px-4">Phone</th>
                  <th className="py-3 px-4">Clock In (Morning)</th>
                  <th className="py-3 px-4">Clock Out (Afternoon)</th>
                  <th className="py-3 px-4">Total Time</th>
                  <th className="py-3 px-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-200">
                {masterLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-3.5 px-4 font-mono">{log.date}</td>
                    <td className="py-3.5 px-4 font-mono font-bold text-blue-400">
                      {log.employeeId}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-slate-300">{log.phone}</td>
                    <td className="py-3.5 px-4 font-mono text-emerald-400">
                      {log.clockIn ? log.clockIn.formatted : '—'}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-rose-400">
                      {log.clockOut ? log.clockOut.formatted : '—'}
                    </td>
                    <td className="py-3.5 px-4 font-mono font-semibold">
                      {log.durationFormatted || 'Active'}
                    </td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                          log.status === 'completed'
                            ? 'bg-blue-500/10 border-blue-500/30 text-blue-300'
                            : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                        }`}
                      >
                        {log.status === 'completed' ? 'Completed' : 'Clocked In'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Employee Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-blue-400" />
                <span>Add Employee Phone Number</span>
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddEmployee} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  Mobile Phone Number *
                </label>
                <input
                  type="text"
                  placeholder="e.g. 9876543210 or +1234567890"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  Full Name (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Alex Johnson"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">
                    Department
                  </label>
                  <input
                    type="text"
                    value={newDept}
                    onChange={(e) => setNewDept(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">
                    Employee ID
                  </label>
                  <input
                    type="text"
                    placeholder="Auto-assigned if empty"
                    value={newId}
                    onChange={(e) => setNewId(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-xl text-xs text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold shadow-md shadow-blue-600/30"
                >
                  Save Employee
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bulk Import Modal */}
      {showBulkModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-lg w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Upload className="w-5 h-5 text-blue-400" />
                <span>Bulk Import 250 Employee Numbers</span>
              </h3>
              <button
                onClick={() => setShowBulkModal(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-400">
              Paste your list of phone numbers (one per line, or comma-separated with Name and Department):
            </p>

            <textarea
              rows={6}
              placeholder={`9876543210, John Doe, Operations\n9876543211, Sarah Lee, Engineering\n9876543212, David Kim, Support`}
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white font-mono text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
            />

            {bulkStatus && (
              <p className="text-xs text-amber-400 bg-amber-500/10 p-2.5 rounded-lg border border-amber-500/20">
                {bulkStatus}
              </p>
            )}

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowBulkModal(false)}
                className="px-4 py-2 rounded-xl text-xs text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleBulkImport}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold shadow-md shadow-blue-600/30"
              >
                Import All
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
