import React, { useState, useEffect } from 'react';
import { AttendanceRecord } from '../types';
import { api } from '../api';
import { Calendar, Clock, CheckCircle2, AlertCircle, RefreshCw, Filter, Download } from 'lucide-react';

export const HistoryView: React.FC = () => {
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterDate, setFilterDate] = useState('');

  const loadHistory = async () => {
    setLoading(true);
    try {
      const res = await api.getHistory();
      setRecords(res.records);
    } catch (err) {
      console.error('Failed to load history:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHistory();
  }, []);

  const filteredRecords = filterDate
    ? records.filter((r) => r.date === filterDate)
    : records;

  const totalMinutes = records.reduce((acc, curr) => acc + (curr.durationMinutes || 0), 0);
  const totalHours = (totalMinutes / 60).toFixed(1);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg">
          <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider block">
            Recorded Shifts
          </span>
          <span className="text-3xl font-extrabold text-white mt-1 block">
            {records.length}
          </span>
          <span className="text-xs text-slate-500 mt-1 block">Total attendance days</span>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg">
          <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider block">
            Total Work Hours
          </span>
          <span className="text-3xl font-extrabold text-emerald-400 font-mono mt-1 block">
            {totalHours} hrs
          </span>
          <span className="text-xs text-slate-500 mt-1 block">Cumulative verified time</span>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg">
          <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider block">
            Completion Rate
          </span>
          <span className="text-3xl font-extrabold text-blue-400 mt-1 block">
            {records.length > 0
              ? `${Math.round(
                  (records.filter((r) => r.status === 'completed').length / records.length) * 100
                )}%`
              : '100%'}
          </span>
          <span className="text-xs text-slate-500 mt-1 block">Clocked in & out</span>
        </div>
      </div>

      {/* Filter and Table Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-blue-400" />
            <h3 className="text-base font-bold text-white">My Attendance History</h3>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800 text-xs text-slate-300">
              <Filter className="w-3.5 h-3.5 text-slate-500" />
              <input
                type="date"
                value={filterDate}
                onChange={(e) => setFilterDate(e.target.value)}
                className="bg-transparent text-white focus:outline-none"
              />
              {filterDate && (
                <button
                  onClick={() => setFilterDate('')}
                  className="text-slate-400 hover:text-white text-xs ml-1"
                >
                  Clear
                </button>
              )}
            </div>

            <button
              onClick={loadHistory}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 uppercase font-semibold tracking-wider">
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Clock In (Morning)</th>
                <th className="py-3 px-4">Clock Out (Afternoon)</th>
                <th className="py-3 px-4">Duration</th>
                <th className="py-3 px-4">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-200">
              {filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-500">
                    No attendance records found. Clock in at the terminal to begin!
                  </td>
                </tr>
              ) : (
                filteredRecords.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-3.5 px-4 font-mono font-medium">{r.date}</td>
                    <td className="py-3.5 px-4 font-mono text-emerald-400">
                      {r.clockIn ? r.clockIn.formatted : '—'}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-rose-400">
                      {r.clockOut ? r.clockOut.formatted : '—'}
                    </td>
                    <td className="py-3.5 px-4 font-mono font-semibold">
                      {r.durationFormatted || 'In Progress'}
                    </td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
                          r.status === 'completed'
                            ? 'bg-blue-500/10 border-blue-500/30 text-blue-300'
                            : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                        }`}
                      >
                        {r.status === 'completed' ? 'Completed' : 'Shift Active'}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
