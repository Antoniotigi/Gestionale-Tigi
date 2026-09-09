import React, { useState } from 'react';
import { Download, Trash2, Calendar, Clock, BarChart2, Search, User, LogIn, LogOut, FileSpreadsheet } from 'lucide-react';
import { Participant, AttendanceLog } from '../types';
import { exportAttendanceToCSV } from '../utils/csv';

interface ReportSectionProps {
  eventId: string;
  eventTitle: string;
  participants: Participant[];
  logs: AttendanceLog[];
  minEcmHours?: number;
  durationHours?: number;
  onClearLogs: () => void;
  onDeleteLog: (logId: string) => void;
}

export default function ReportSection({ eventId, eventTitle, participants, logs, minEcmHours, durationHours, onClearLogs, onDeleteLog }: ReportSectionProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);

  // 1. Prepare data for hourly entry distribution (Custom SVG Chart)
  const hourlyData = (() => {
    const hoursCount: Record<number, number> = {};
    
    // Initialize standard event hours (e.g. from 8:00 to 18:00)
    for (let h = 8; h <= 18; h++) {
      hoursCount[h] = 0;
    }

    logs.forEach(log => {
      if (log.checkInTime) {
        const date = new Date(log.checkInTime);
        const hour = date.getHours();
        if (hour >= 0 && hour <= 23) {
          hoursCount[hour] = (hoursCount[hour] || 0) + 1;
        }
      }
    });

    // Convert to list format
    return Object.entries(hoursCount)
      .map(([hourStr, count]) => ({
        hour: parseInt(hourStr),
        label: `${hourStr.padStart(2, '0')}:00`,
        count
      }))
      .sort((a, b) => a.hour - b.hour);
  })();

  const maxCount = Math.max(...hourlyData.map(d => d.count), 4); // minimum ceiling of 4 for better proportions

  // 2. Prepare chronological logs table
  const chronologicalLogs = [...logs].sort((a, b) => {
    const aTime = a.checkOutTime || a.checkInTime;
    const bTime = b.checkOutTime || b.checkInTime;
    return new Date(bTime).getTime() - new Date(aTime).getTime();
  });

  const filteredLogs = chronologicalLogs.filter(log => {
    const p = participants.find(part => part.id === log.participantId);
    if (!p) return false;
    
    const searchStr = `${p.firstName} ${p.lastName} ${p.company || ''} ${p.id}`.toLowerCase();
    return searchStr.includes(searchTerm.toLowerCase());
  });

  const handleDownloadCSV = () => {
    const csvContent = exportAttendanceToCSV(participants, logs, minEcmHours);
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    
    const sanitizedTitle = eventTitle.toLowerCase().replace(/[^a-z0-9]/g, '_');
    link.href = url;
    link.setAttribute('download', `report_presenze_${sanitizedTitle}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      
      {/* 1. Analytics & Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Peak Check-In Hours Chart (Custom SVG!) */}
        <div className="lg:col-span-2 bg-white border border-slate-100 rounded-xl p-5 shadow-xs flex flex-col justify-between">
          <div>
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
              <BarChart2 size={14} className="text-emerald-600" />
              <span>Frequenza Oraria Ingressi</span>
            </h4>
            <p className="text-[11px] text-slate-400 mb-4">Grafico degli accessi in aula registrati per fascia oraria.</p>
          </div>

          {/* Interactive Responsive SVG Bar Chart */}
          <div className="h-44 w-full relative flex items-end pt-4">
            <div className="absolute left-0 top-0 text-[9px] text-slate-400 font-bold border-l border-b border-dashed border-slate-200 pl-1 py-0.5">
              N. Ingressi
            </div>
            
            <div className="flex-1 h-full flex items-end justify-between gap-1.5 border-b border-slate-150 pb-1">
              {hourlyData.map(data => {
                const heightPercent = `${(data.count / maxCount) * 100}%`;
                
                return (
                  <div key={data.hour} className="flex-1 flex flex-col items-center group relative h-full justify-end">
                    
                    {/* Hover Tooltip tooltip bubble */}
                    <div className="absolute bottom-full mb-1 bg-slate-800 text-white text-[9px] font-bold px-1.5 py-0.5 rounded shadow-xs opacity-0 group-hover:opacity-100 transition-opacity z-10 pointer-events-none whitespace-nowrap">
                      {data.count} ingress{data.count === 1 ? 'o' : 'i'} ({data.label})
                    </div>

                    {/* The Bar */}
                    <div 
                      style={{ height: heightPercent }}
                      className={`w-full max-w-[24px] rounded-t-xs transition-all duration-500 hover:bg-emerald-600 cursor-pointer ${
                        data.count > 0 ? 'bg-emerald-500' : 'bg-slate-100'
                      }`}
                    />

                    {/* Label */}
                    <span className="text-[9px] font-semibold text-slate-400 mt-1 scale-90">
                      {data.hour}h
                    </span>

                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Quick Report Download / Reset */}
        <div className="bg-white border border-slate-100 rounded-xl p-5 shadow-xs flex flex-col justify-between">
          <div className="space-y-3">
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <FileSpreadsheet size={14} className="text-emerald-600" />
              <span>Esportazione & Manutenzione</span>
            </h4>
            <p className="text-xs text-slate-500 leading-relaxed">
              Scarica il foglio di calcolo excel con la matrice completa delle presenze e delle tempistiche di permanenza dei congressisti.
            </p>
          </div>

          <div className="space-y-3 mt-6">
            {/* CSV Download Trigger */}
            <button
              onClick={handleDownloadCSV}
              disabled={logs.length === 0}
              className="w-full py-2.5 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white font-semibold text-xs rounded-lg flex items-center justify-center gap-2 shadow-xs transition-all cursor-pointer"
            >
              <Download size={14} />
              <span>Esporta Report Presenze (.CSV)</span>
            </button>

            {/* Clear database table logs */}
            {confirmClear ? (
              <div className="bg-red-50 border border-red-150 rounded-lg p-3 space-y-2">
                <p className="text-[11px] text-red-800 font-semibold leading-snug">
                  Sei sicuro di voler cancellare tutto lo storico delle scansioni? Questa azione non è reversibile.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => { onClearLogs(); setConfirmClear(false); }}
                    className="flex-1 py-1.5 bg-red-600 hover:bg-red-700 text-white font-bold text-[10px] rounded"
                  >
                    Sì, Cancella Tutto
                  </button>
                  <button
                    onClick={() => setConfirmClear(false)}
                    className="flex-1 py-1.5 bg-slate-200 hover:bg-slate-350 text-slate-700 font-bold text-[10px] rounded"
                  >
                    Annulla
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setConfirmClear(true)}
                className="w-full py-2 text-slate-400 hover:text-red-700 hover:bg-red-50 hover:border-red-150 border border-transparent rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Trash2 size={13} />
                <span>Cancella Storico Scansioni</span>
              </button>
            )}
          </div>
        </div>

      </div>

      {/* 2. Log History list */}
      <div className="bg-white border border-slate-100 rounded-xl shadow-xs overflow-hidden">
        
        {/* Table Header Filter Search */}
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between bg-slate-50/30">
          <div>
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Cronologia Completa Scansioni</h3>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
            <input
              type="text"
              placeholder="Cerca per partecipante..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full sm:w-64 pl-9 pr-3 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-hidden focus:border-slate-400 text-slate-800 bg-white"
            />
          </div>
        </div>

        {/* Transaction History Logs */}
        <div className="max-h-[350px] overflow-y-auto">
          <table className="w-full text-left text-xs divide-y divide-slate-150">
            <thead className="bg-slate-50/50 text-slate-500 font-bold uppercase tracking-wider sticky top-0 z-10 shadow-xs">
              <tr>
                <th className="px-6 py-3">Orario Rilevato</th>
                <th className="px-6 py-3">ID Codice</th>
                <th className="px-6 py-3">Partecipante</th>
                <th className="px-6 py-3">Tipo Rilevazione</th>
                <th className="px-6 py-3 text-right">Durata Sessione</th>
                <th className="px-6 py-3 text-center">Elimina</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {filteredLogs.map(log => {
                const p = participants.find(part => part.id === log.participantId);
                if (!p) return null;

                const checkInDate = new Date(log.checkInTime);
                const checkOutDate = log.checkOutTime ? new Date(log.checkOutTime) : null;

                // Render checking log row
                // Each log represents a physical check-in + optional checkout. We render BOTH phases as sequential events
                const eventsToRender = [];
                
                // Check-in entry
                eventsToRender.push({
                  key: `${log.id}-in-row`,
                  time: checkInDate,
                  type: 'check_in',
                  duration: null
                });

                // Check-out entry (if present)
                if (checkOutDate) {
                  eventsToRender.push({
                    key: `${log.id}-out-row`,
                    time: checkOutDate,
                    type: 'check_out',
                    duration: log.totalMinutes ? `${Math.round(log.totalMinutes)} min` : '-'
                  });
                }

                return eventsToRender.map(evt => (
                  <tr key={evt.key} className="hover:bg-slate-50/40 transition-colors">
                    
                    {/* Timestamp */}
                    <td className="px-6 py-3 font-mono text-slate-500">
                      <div className="flex items-center gap-1.5">
                        <Clock size={12} className="text-slate-400" />
                        <span>{evt.time.toLocaleString('it-IT')}</span>
                      </div>
                    </td>

                    {/* Barcode ID */}
                    <td className="px-6 py-3 font-mono font-semibold text-slate-500">
                      {p.id}
                    </td>

                    {/* Participant Details */}
                    <td className="px-6 py-3">
                      <div>
                        <span className="font-bold text-slate-800">{p.lastName} {p.firstName}</span>
                        {p.company && <span className="text-slate-400 ml-2">({p.company})</span>}
                      </div>
                    </td>

                    {/* Direction label */}
                    <td className="px-6 py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${
                        evt.type === 'check_in' 
                          ? 'bg-emerald-50 text-emerald-800 border border-emerald-100' 
                          : 'bg-amber-50 text-amber-800 border border-amber-100'
                      }`}>
                        {evt.type === 'check_in' ? 'Ingresso (In)' : 'Uscita (Out)'}
                      </span>
                    </td>

                    {/* Calculated Stay */}
                    <td className="px-6 py-3 text-right font-mono text-slate-600">
                      {evt.type === 'check_out' ? (
                        <span className="font-semibold">{evt.duration}</span>
                      ) : (
                        <span className="text-slate-300">-</span>
                      )}
                    </td>

                    {/* Removal of timbratura */}
                    <td className="px-6 py-3 text-center">
                      <button
                        type="button"
                        onClick={() => onDeleteLog(log.id)}
                        className="p-1 text-slate-350 hover:text-red-600 hover:bg-red-50 rounded transition-all cursor-pointer inline-flex items-center justify-center"
                        title="Rimuovi questa timbratura completamente"
                      >
                        <Trash2 size={13} />
                      </button>
                    </td>

                  </tr>
                ));
              }).flat()}

              {filteredLogs.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-400 italic font-medium">
                    Nessun log registrato corrisponde ai filtri impostati.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

      </div>

    </div>
  );
}
