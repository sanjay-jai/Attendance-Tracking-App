import React, { useState } from 'react';
import { FileSpreadsheet, ExternalLink, Copy, Check, Download, Send, Sparkles } from 'lucide-react';
import { api } from '../api';

interface GoogleSheetModalProps {
  sheetId: string;
  isOpen: boolean;
  onClose: () => void;
}

export const GoogleSheetModal: React.FC<GoogleSheetModalProps> = ({
  sheetId,
  isOpen,
  onClose,
}) => {
  const [webhookUrl, setWebhookUrl] = useState('');
  const [copiedScript, setCopiedScript] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  if (!isOpen) return null;

  const sheetUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/edit`;

  const appsScriptCode = `function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    
    // Check if headers exist
    if (sheet.getLastRow() === 0) {
      sheet.appendRow([
        "Employee ID", "Phone Number", "Name", "Department", 
        "Date", "Clock In", "Clock Out", "Duration", "Status", "Timestamp"
      ]);
    }
    
    sheet.appendRow([
      data.employeeId,
      data.phone,
      data.name,
      data.department,
      data.date,
      data.clockInTime,
      data.clockOutTime,
      data.durationHours,
      data.status,
      data.timestamp
    ]);
    
    return ContentService.createTextOutput(JSON.stringify({status: "success"}))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({error: err.toString()}))
      .setMimeType(ContentService.MimeType.JSON);
  }
}`;

  const copyScript = () => {
    navigator.clipboard.writeText(appsScriptCode);
    setCopiedScript(true);
    setTimeout(() => setCopiedScript(false), 2000);
  };

  const handleSaveWebhook = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.updateConfig({ appsScriptUrl: webhookUrl });
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-2xl w-full p-6 sm:p-8 shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">Google Sheet File Integration</h3>
              <p className="text-xs text-slate-400 font-mono">
                Spreadsheet ID: <strong className="text-emerald-300">{sheetId}</strong>
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-lg">
            ✕
          </button>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <a
            href={sheetUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="p-4 rounded-2xl bg-slate-800/80 hover:bg-slate-800 border border-slate-700/80 text-white flex items-center justify-between transition-colors group"
          >
            <div>
              <div className="text-sm font-semibold flex items-center gap-1.5">
                <span>Open Google Sheet</span>
                <ExternalLink className="w-3.5 h-3.5 text-blue-400 group-hover:translate-x-0.5 transition-transform" />
              </div>
              <p className="text-xs text-slate-400 mt-0.5">View live sheet document</p>
            </div>
            <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
          </a>

          <a
            href="/api/admin/export-csv"
            download
            className="p-4 rounded-2xl bg-slate-800/80 hover:bg-slate-800 border border-slate-700/80 text-white flex items-center justify-between transition-colors"
          >
            <div>
              <div className="text-sm font-semibold flex items-center gap-1.5">
                <span>Download Formatted CSV</span>
                <Download className="w-3.5 h-3.5 text-emerald-400" />
              </div>
              <p className="text-xs text-slate-400 mt-0.5">Matched for this Sheet</p>
            </div>
            <Download className="w-5 h-5 text-emerald-400" />
          </a>
        </div>

        {/* Real-time Webhook sync section */}
        <div className="space-y-4 pt-2">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-bold text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-emerald-400" />
              <span>Real-Time Apps Script Webhook (Optional Auto-Append)</span>
            </h4>
            <button
              onClick={copyScript}
              className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1 font-semibold"
            >
              {copiedScript ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedScript ? 'Copied Script!' : 'Copy Script'}</span>
            </button>
          </div>

          <p className="text-xs text-slate-400">
            To automatically append every employee punch directly into Google Sheet <strong className="text-white font-mono">{sheetId}</strong> without requiring individual Google Logins:
          </p>

          <ol className="text-xs text-slate-300 space-y-1.5 list-decimal list-inside bg-slate-950 p-4 rounded-xl border border-slate-800">
            <li>Open your Google Sheet and click <strong>Extensions &gt; Apps Script</strong>.</li>
            <li>Copy the snippet below and paste it into the code editor.</li>
            <li>Click <strong>Deploy &gt; New deployment &gt; Select type: Web app</strong>.</li>
            <li>Set "Who has access" to <strong>Anyone</strong>, click Deploy, and copy the Web App URL.</li>
            <li>Paste your Web App URL below:</li>
          </ol>

          <pre className="text-[11px] font-mono bg-slate-950 text-emerald-300 p-3.5 rounded-xl border border-slate-800 overflow-x-auto max-h-36">
            {appsScriptCode}
          </pre>

          <form onSubmit={handleSaveWebhook} className="space-y-2">
            <label className="block text-xs font-semibold text-slate-400">
              Apps Script Web App URL:
            </label>
            <div className="flex gap-2">
              <input
                type="url"
                placeholder="https://script.google.com/macros/s/.../exec"
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                className="flex-1 px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono"
              />
              <button
                type="submit"
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold"
              >
                Save URL
              </button>
            </div>
            {savedSuccess && (
              <p className="text-xs text-emerald-400">✓ Webhook URL saved successfully!</p>
            )}
          </form>
        </div>

        <div className="pt-2 text-right">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white text-xs font-semibold"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
