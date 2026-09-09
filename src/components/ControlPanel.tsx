import React, { useState, useEffect, useRef } from 'react';
import { Search, UserCheck, UserX, Printer, Users, LogIn, LogOut, Download, Award, ChevronRight, Edit2, Trash2, Scan, ArrowRight, CornerDownLeft, AlertCircle, Volume2, VolumeX, HelpCircle, Activity } from 'lucide-react';
import { Participant, AttendanceLog } from '../types';
import { getCode39Pattern, playBeep } from '../utils/barcode';

// Barcode Renderer helper component using getCode39Pattern
export function BarcodeSVG({ value }: { value: string }) {
  try {
    const pattern = getCode39Pattern(value);
    
    // We want to calculate the X position for each bar/space
    let currentX = 0;
    const elements: React.ReactNode[] = [];
    
    pattern.forEach((element, idx) => {
      if (element.type === 'bar') {
        elements.push(
          <rect
            key={`bar-${idx}`}
            x={currentX}
            y={0}
            width={element.width}
            height={50}
            fill="#000000"
          />
        );
      }
      currentX += element.width;
    });

    return (
      <div className="flex flex-col items-center justify-center p-2 bg-white rounded-md border border-slate-100 shadow-xs">
        <svg 
          viewBox={`0 0 ${currentX} 50`} 
          className="h-12 max-w-full"
          preserveAspectRatio="none"
        >
          {elements}
        </svg>
        <span className="font-mono text-[9px] tracking-widest text-slate-500 mt-1 font-semibold">
          *{value.toUpperCase()}*
        </span>
      </div>
    );
  } catch (err) {
    return (
      <div className="text-xs text-red-500 font-mono">
        Errore Barcode ({value})
      </div>
    );
  }
}

interface ControlPanelProps {
  eventId: string;
  eventTitle?: string;
  eventDate?: string;
  participants: Participant[];
  logs: AttendanceLog[];
  minEcmHours?: number;
  durationHours?: number;
  onManualCheckIn: (participantId: string) => void;
  onManualCheckOut: (participantId: string) => void;
  onEditParticipant: (oldBarcodeId: string, updatedParticipant: Participant) => void;
  onDeleteLog: (logId: string) => void;
  onUpdateLogs: (updatedLogs: AttendanceLog[]) => void;
  onScan: (barcodeId: string) => { success: boolean; message: string; log?: AttendanceLog; isCheckOut?: boolean };
}

export default function ControlPanel({ eventId, eventTitle, eventDate, participants, logs, minEcmHours, durationHours, onManualCheckIn, onManualCheckOut, onEditParticipant, onDeleteLog, onUpdateLogs, onScan }: ControlPanelProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'inside' | 'outside' | 'absent'>('all');
  const [selectedBadgeParticipant, setSelectedBadgeParticipant] = useState<Participant | null>(null);

  // Fused Scanner States & Refs
  const [isScannerConsoleOpen, setIsScannerConsoleOpen] = useState(true);
  const [manualCode, setManualCode] = useState('');
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' | null }>({ text: '', type: null });
  const [scannedParticipant, setScannedParticipant] = useState<Participant | null>(null);
  const [scannedLog, setScannedLog] = useState<AttendanceLog | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [isKeyboardListenerActive, setIsKeyboardListenerActive] = useState(true);
  const [recentActivities, setRecentActivities] = useState<Array<{
    id: string;
    time: string;
    participantName: string;
    company: string;
    type: 'check_in' | 'check_out';
    duration?: string;
    barcode: string;
  }>>([]);
  
  const inputRef = useRef<HTMLInputElement>(null);
  const bufferRef = useRef<string>('');
  const lastKeyTimeRef = useRef<number>(0);

  // Auto-focus scanner on mount
  useEffect(() => {
    if (isScannerConsoleOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isScannerConsoleOpen]);

  // Sync recent activities from existing logs
  useEffect(() => {
    const sortedLogs = [...logs].sort((a, b) => {
      const aTime = a.checkOutTime || a.checkInTime;
      const bTime = b.checkOutTime || b.checkInTime;
      return new Date(bTime).getTime() - new Date(aTime).getTime();
    }).slice(0, 5);

    const activities = sortedLogs.map(log => {
      const p = participants.find(part => part.id === log.participantId);
      const name = p ? `${p.lastName} ${p.firstName}` : `ID: ${log.participantId}`;
      const company = p?.company || '-';
      
      if (log.checkOutTime) {
        const checkIn = new Date(log.checkInTime);
        const checkOut = new Date(log.checkOutTime);
        const diffMs = checkOut.getTime() - checkIn.getTime();
        const diffMins = Math.round(diffMs / 60000);
        const durationText = diffMins < 60 
          ? `${diffMins} min` 
          : `${Math.floor(diffMins / 60)}h ${diffMins % 60}m`;

        return {
          id: `${log.id}-out`,
          time: new Date(log.checkOutTime).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          participantName: name,
          company,
          type: 'check_out' as const,
          duration: durationText,
          barcode: log.participantId
        };
      } else {
        return {
          id: `${log.id}-in`,
          time: new Date(log.checkInTime).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          participantName: name,
          company,
          type: 'check_in' as const,
          barcode: log.participantId
        };
      }
    });

    setRecentActivities(activities);
  }, [logs, participants]);

  // Keyboard emulation listener for laser pen
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (!isKeyboardListenerActive || !isScannerConsoleOpen) return;
      
      if (document.activeElement?.tagName === 'INPUT' && document.activeElement !== inputRef.current) {
        return;
      }

      const now = Date.now();
      const diff = now - lastKeyTimeRef.current;
      lastKeyTimeRef.current = now;

      if (e.key === 'Enter') {
        if (bufferRef.current.trim().length > 0) {
          e.preventDefault();
          processBarcode(bufferRef.current.trim());
          bufferRef.current = '';
        }
      } else if (e.key.length === 1) {
        const char = e.key.toUpperCase();
        if (/[A-Z0-9\-]/.test(char)) {
          bufferRef.current += char;
        }
      }

      if (diff > 1500) {
        bufferRef.current = e.key.length === 1 ? e.key.toUpperCase() : '';
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown);
    };
  }, [isKeyboardListenerActive, isScannerConsoleOpen, participants, logs]);

  const processBarcode = (code: string) => {
    const cleanCode = code.trim().toUpperCase().replace(/[^A-Z0-9\-]/g, '');
    if (!cleanCode) return;

    let matchedParticipant = participants.find(p => p.id === cleanCode);
    if (cleanCode === '0101' && !matchedParticipant && participants.length > 0) {
      matchedParticipant = participants[0];
    }

    if (soundEnabled) {
      playBeep(matchedParticipant ? 'success' : 'error');
    }

    if (!matchedParticipant) {
      setStatusMessage({
        text: `Codice "${cleanCode}" non associato ad alcun partecipante.`,
        type: 'error'
      });
      setScannedParticipant(null);
      setScannedLog(null);
      
      setTimeout(() => {
        setStatusMessage(prev => prev.text?.includes(cleanCode) ? { text: '', type: null } : prev);
      }, 5000);
      return;
    }

    const scanResult = onScan(cleanCode);

    if (scanResult.success && scanResult.log) {
      setScannedParticipant(matchedParticipant);
      setScannedLog(scanResult.log);
      
      setStatusMessage({
        text: scanResult.isCheckOut 
          ? `Uscita registrata correttamente per ${matchedParticipant.lastName} ${matchedParticipant.firstName}!`
          : `Ingresso registrato correttamente per ${matchedParticipant.lastName} ${matchedParticipant.firstName}!`,
        type: 'success'
      });
    } else {
      setStatusMessage({
        text: scanResult.message,
        type: 'error'
      });
    }

    setManualCode('');
    
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualCode.trim()) {
      processBarcode(manualCode.trim());
    }
  };

  const forceFocus = () => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  // States for Participant Data Modification
  const [editingParticipant, setEditingParticipant] = useState<Participant | null>(null);
  const [editForm, setEditForm] = useState<Participant>({ id: '', firstName: '', lastName: '', email: '', company: '', notes: '' });
  const [editingLogs, setEditingLogs] = useState<AttendanceLog[]>([]);
  const [editError, setEditError] = useState('');

  // Utility helpers to convert timestamps for <input type="datetime-local">
  const toLocalDatetimeString = (isoString: string | null | undefined): string => {
    if (!isoString) return '';
    try {
      const date = new Date(isoString);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      return `${year}-${month}-${day}T${hours}:${minutes}`;
    } catch {
      return '';
    }
  };

  const fromLocalDatetimeString = (localString: string): string => {
    if (!localString) return new Date().toISOString();
    try {
      return new Date(localString).toISOString();
    } catch {
      return new Date().toISOString();
    }
  };

  const handleStartEdit = (p: Participant) => {
    setEditingParticipant(p);
    setEditForm({ ...p });
    setEditingLogs(logs.filter(l => l.participantId === p.id));
    setEditError('');
  };

  const handleSaveEdit = () => {
    if (!editForm.id.trim()) {
      setEditError('Il codice ID Barcode è obbligatorio.');
      return;
    }
    if (!editForm.firstName.trim() || !editForm.lastName.trim()) {
      setEditError('Nome e Cognome sono obbligatori.');
      return;
    }

    const isDuplicate = participants.some(p => p.id === editForm.id.trim() && p.id !== editingParticipant?.id);
    if (isDuplicate) {
      setEditError(`Il codice ID "${editForm.id}" è già assegnato ad un altro partecipante.`);
      return;
    }

    // 1. Save participant details
    onEditParticipant(editingParticipant!.id, {
      ...editForm,
      id: editForm.id.trim()
    });

    // 2. Update participant's check-in/out logs
    const restLogs = logs.filter(l => l.participantId !== editingParticipant!.id);
    const updatedUserLogs = editingLogs.map(l => ({
      ...l,
      participantId: editForm.id.trim()
    }));

    onUpdateLogs([...restLogs, ...updatedUserLogs]);
    setEditingParticipant(null);
  };

  const getParticipantTotalPermanence = (pId: string): string => {
    const pLogs = logs.filter(l => l.participantId === pId);
    let totalMins = 0;
    pLogs.forEach(l => {
      if (l.totalMinutes) {
        totalMins += l.totalMinutes;
      } else if (l.status === 'inside' && l.checkInTime) {
        // Active session: compute up to current time
        const diffMs = new Date().getTime() - new Date(l.checkInTime).getTime();
        totalMins += Math.max(0, diffMs / 60000);
      }
    });

    if (totalMins === 0) return '0 m';
    const hours = Math.floor(totalMins / 60);
    const mins = Math.round(totalMins % 60);
    return hours > 0 ? `${hours}h ${mins}m` : `${mins} m`;
  };

  const getParticipantTotalHours = (pId: string): number => {
    const pLogs = logs.filter(l => l.participantId === pId);
    let totalMins = 0;
    pLogs.forEach(l => {
      if (l.totalMinutes) {
        totalMins += l.totalMinutes;
      } else if (l.status === 'inside' && l.checkInTime) {
        const diffMs = new Date().getTime() - new Date(l.checkInTime).getTime();
        totalMins += Math.max(0, diffMs / 60000);
      }
    });
    return totalMins / 60;
  };

  // 1. Calculate Statistics
  const totalRegistered = participants.length;
  
  const currentInside = participants.filter(p => {
    const pLogs = logs.filter(l => l.participantId === p.id);
    return pLogs.some(l => l.status === 'inside');
  }).length;

  const totalCheckedOut = participants.filter(p => {
    const pLogs = logs.filter(l => l.participantId === p.id);
    // Checked out means they have logs, but are not inside currently
    return pLogs.length > 0 && !pLogs.some(l => l.status === 'inside');
  }).length;

  const averagePermanence = (() => {
    const completedLogs = logs.filter(l => l.status === 'outside' && l.totalMinutes !== null);
    if (completedLogs.length === 0) return 0;
    const totalMins = completedLogs.reduce((sum, l) => sum + (l.totalMinutes || 0), 0);
    return Math.round(totalMins / completedLogs.length);
  })();

  // 2. Filter & Search participants
  const filteredParticipants = participants.filter(p => {
    const pLogs = logs.filter(l => l.participantId === p.id);
    const isInside = pLogs.some(l => l.status === 'inside');
    const hasLogs = pLogs.length > 0;
    
    // Search filter
    const matchesSearch = 
      p.firstName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.lastName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.company || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.id.toLowerCase().includes(searchTerm.toLowerCase());

    if (!matchesSearch) return false;

    // Status filter
    if (filterStatus === 'inside') return isInside;
    if (filterStatus === 'outside') return hasLogs && !isInside;
    if (filterStatus === 'absent') return !hasLogs;
    return true; // 'all'
  });

  const getParticipantStatus = (pId: string): { status: 'inside' | 'outside' | 'absent'; label: string; class: string; latestLog?: AttendanceLog } => {
    const pLogs = logs.filter(l => l.participantId === pId);
    if (pLogs.length === 0) {
      return { 
        status: 'absent', 
        label: 'Non Rilevato', 
        class: 'bg-slate-100 text-slate-600 border-slate-200' 
      };
    }
    const insideLog = pLogs.find(l => l.status === 'inside');
    if (insideLog) {
      return { 
        status: 'inside', 
        label: 'In Aula', 
        class: 'bg-emerald-50 text-emerald-700 border-emerald-150',
        latestLog: insideLog
      };
    }
    
    // Sort completed logs to find the most recent checkout
    const sortedCompleted = [...pLogs].filter(l => l.status === 'outside').sort((a, b) => {
      const bTime = b.checkOutTime ? new Date(b.checkOutTime).getTime() : 0;
      const aTime = a.checkOutTime ? new Date(a.checkOutTime).getTime() : 0;
      return bTime - aTime;
    });

    return { 
      status: 'outside', 
      label: 'Uscito', 
      class: 'bg-amber-50 text-amber-700 border-amber-150',
      latestLog: sortedCompleted[0]
    };
  };

  const handlePrintBadge = (p: Participant) => {
    setSelectedBadgeParticipant(p);
  };

  const triggerSystemPrint = () => {
    const printContent = document.getElementById('printable-badge-area');
    if (!printContent) return;

    const originalContent = document.body.innerHTML;
    const badgeHTML = printContent.innerHTML;

    // Simple iframe-based printing to avoid breaking standard browser tabs in AI Studio environment
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(`
        <html>
          <head>
            <title>Stampa Badge - ${selectedBadgeParticipant?.lastName}</title>
            <style>
              body { font-family: system-ui, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background-color: #f8fafc; }
              .badge-card { background: white; border: 1px solid #e2e8f0; border-radius: 12px; padding: 32px; width: 340px; text-align: center; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); }
              .badge-header { font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: #10b981; font-weight: 700; margin-bottom: 20px; }
              .badge-name { font-size: 22px; font-weight: 800; color: #1e293b; margin: 0 0 4px 0; }
              .badge-company { font-size: 13px; color: #64748b; margin-bottom: 24px; }
              .barcode-container { margin: 24px 0; display: flex; flex-direction: column; align-items: center; }
              .footer { font-size: 10px; color: #94a3b8; margin-top: 20px; border-t: 1px solid #f1f5f9; padding-top: 16px; }
              @media print {
                body { background: white; }
                .badge-card { border: none; box-shadow: none; width: 100%; height: 100%; padding: 0; margin: 0; display: flex; flex-direction: column; justify-content: center; }
              }
            </style>
          </head>
          <body>
            <div class="badge-card">
              ${badgeHTML}
            </div>
            <script>
              window.onload = function() {
                window.print();
                setTimeout(function() { window.close(); }, 500);
              };
            </script>
          </body>
        </html>
      `);
      printWindow.document.close();
    }
  };

  const handleExportPDF = () => {
    const totalCount = participants.length;
    const insideCount = participants.filter(p => {
      const pLogs = logs.filter(l => l.participantId === p.id);
      return pLogs.some(l => l.status === 'inside');
    }).length;

    const rowsHTML = participants.map((p, index) => {
      const pLogs = logs.filter(l => l.participantId === p.id);
      const isInside = pLogs.some(l => l.status === 'inside');
      const hasLogs = pLogs.length > 0;
      const statusText = isInside ? 'IN AULA' : (hasLogs ? 'USCITO' : 'ASSENTE');
      const statusClass = isInside ? 'status-inside' : (hasLogs ? 'status-outside' : 'status-absent');
      const totalPerm = getParticipantTotalPermanence(p.id);
      const totalHours = getParticipantTotalHours(p.id);

      let ecmBadge = '';
      if (minEcmHours !== undefined && minEcmHours > 0) {
        const isEligible = totalHours >= minEcmHours;
        const badgeClass = isEligible ? 'status-inside' : 'status-absent';
        const badgeText = isEligible ? 'IDONEO' : 'NON IDONEO';
        ecmBadge = `<br/><span class="status-badge ${badgeClass}" style="margin-top: 4px; display: inline-block;">${badgeText} (${minEcmHours}h req.)</span>`;
      }

      const scanDetails = pLogs.map(l => {
        const inStr = new Date(l.checkInTime).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
        const outStr = l.checkOutTime 
          ? new Date(l.checkOutTime).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) 
          : '--:--';
        return `${inStr} ➔ ${outStr} (${l.totalMinutes ? Math.round(l.totalMinutes) + 'm' : 'attivo'})`;
      }).join(', ');

      return `
        <tr>
          <td style="text-align: center;">${index + 1}</td>
          <td style="font-family: monospace; font-weight: bold; font-size: 11px; color: #475569;">${p.id}</td>
          <td>
            <div style="font-weight: bold; color: #0f172a; font-size: 13px;">${p.lastName} ${p.firstName}</div>
            ${p.email ? `<div style="font-size: 10px; color: #64748b; margin-top: 1px;">${p.email}</div>` : ''}
          </td>
          <td>
            <div style="font-weight: 500; color: #334155;">${p.company || 'Libero professionista'}</div>
            ${p.notes ? `<div style="font-size: 9px; color: #64748b; font-style: italic; margin-top: 1px;">${p.notes}</div>` : ''}
          </td>
          <td style="text-align: center;"><span class="status-badge ${statusClass}">${statusText}</span></td>
          <td style="text-align: center; font-weight: 800; font-size: 12px; color: #0f172a;">${totalPerm}${ecmBadge}</td>
          <td style="font-size: 10px; color: #475569; font-family: monospace;">${scanDetails || '<span style="color: #cbd5e1; font-style: italic;">Nessuna</span>'}</td>
        </tr>
      `;
    }).join('');

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(`
        <html>
          <head>
            <title>Report Presenze - ${eventTitle || 'Congresso'}</title>
            <style>
              @page {
                size: A4 landscape;
                margin: 12mm;
              }
              body {
                font-family: system-ui, -apple-system, sans-serif;
                color: #1e293b;
                margin: 0;
                padding: 0;
                background: white;
                font-size: 11px;
                line-height: 1.4;
              }
              .header {
                border-bottom: 2px solid #e2e8f0;
                padding-bottom: 12px;
                margin-bottom: 20px;
                display: flex;
                justify-content: space-between;
                align-items: flex-start;
              }
              .title-area h1 {
                font-size: 20px;
                font-weight: 900;
                margin: 0 0 4px 0;
                color: #0f172a;
                letter-spacing: -0.02em;
              }
              .title-area p {
                margin: 0;
                font-size: 11px;
                color: #64748b;
                font-weight: 600;
              }
              .logo-area {
                text-align: right;
              }
              .logo-brand {
                font-size: 13px;
                font-weight: 900;
                color: #047857;
                letter-spacing: -0.01em;
              }
              .logo-sub {
                font-size: 8px;
                font-weight: bold;
                color: #94a3b8;
                text-transform: uppercase;
                margin-top: 2px;
              }
              .stats-grid {
                display: grid;
                grid-template-columns: repeat(4, 1fr);
                gap: 12px;
                margin-bottom: 20px;
              }
              .stat-card {
                background: #f8fafc;
                border: 1px solid #f1f5f9;
                border-radius: 8px;
                padding: 10px 14px;
              }
              .stat-label {
                font-size: 9px;
                font-weight: 800;
                color: #64748b;
                text-transform: uppercase;
                letter-spacing: 0.05em;
                margin-bottom: 2px;
              }
              .stat-value {
                font-size: 16px;
                font-weight: 900;
                color: #0f172a;
              }
              table {
                width: 100%;
                border-collapse: collapse;
                margin-bottom: 24px;
              }
              th {
                background: #f1f5f9;
                color: #475569;
                font-weight: 800;
                font-size: 9px;
                text-transform: uppercase;
                letter-spacing: 0.03em;
                padding: 8px 10px;
                border: 1px solid #e2e8f0;
                text-align: left;
              }
              td {
                padding: 8px 10px;
                border: 1px solid #e2e8f0;
                vertical-align: middle;
              }
              tr:nth-child(even) {
                background: #f8fafc;
              }
              .status-badge {
                display: inline-block;
                padding: 2px 6px;
                border-radius: 9999px;
                font-size: 8px;
                font-weight: 800;
                letter-spacing: 0.02em;
              }
              .status-inside {
                background: #d1fae5;
                color: #065f46;
                border: 1px solid #a7f3d0;
              }
              .status-outside {
                background: #fef3c7;
                color: #92400e;
                border: 1px solid #fde68a;
              }
              .status-absent {
                background: #f1f5f9;
                color: #475569;
                border: 1px solid #cbd5e1;
              }
              .footer-print {
                position: fixed;
                bottom: 0;
                left: 0;
                right: 0;
                display: flex;
                justify-content: space-between;
                font-size: 8px;
                color: #94a3b8;
                border-top: 1px solid #f1f5f9;
                padding-top: 6px;
              }
              @media print {
                body {
                  margin: 0;
                }
                .no-print {
                  display: none;
                }
              }
            </style>
          </head>
          <body>
            <div class="header">
              <div class="title-area">
                <h1>REPORT PRESENZE & PERMANENZA</h1>
                <p>Congresso: <strong>${eventTitle || 'Forum Nuove Tecnologie'}</strong></p>
                <p>Periodo: ${eventDate || 'Settembre 2026'}</p>
              </div>
              <div class="logo-area">
                <div class="logo-brand">SMART GATE ENTRY</div>
                <div class="logo-sub">Rilevazione Codici a Barre</div>
              </div>
            </div>

            <div class="stats-grid">
              <div class="stat-card">
                <div class="stat-label">Iscritti Totali</div>
                <div class="stat-value">${totalCount}</div>
              </div>
              <div class="stat-card">
                <div class="stat-label">In Aula (Presenti)</div>
                <div class="stat-value" style="color: #059669;">${insideCount}</div>
              </div>
              <div class="stat-card">
                <div class="stat-label">Rilevazioni Scansioni</div>
                <div class="stat-value" style="color: #4f46e5;">${logs.length}</div>
              </div>
              <div class="stat-card">
                <div class="stat-label">Data Generazione</div>
                <div class="stat-value">${new Date().toLocaleDateString('it-IT')} ${new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}</div>
              </div>
            </div>

            <table>
              <thead>
                <tr>
                  <th style="width: 4%; text-align: center;">#</th>
                  <th style="width: 12%;">ID Barcode</th>
                  <th style="width: 25%;">Nominativo</th>
                  <th style="width: 22%;">Azienda / Società</th>
                  <th style="width: 10%; text-align: center;">Stato</th>
                  <th style="width: 12%; text-align: center;">Permanenza Totale</th>
                  <th style="width: 15%;">Dettaglio Rilevazioni</th>
                </tr>
              </thead>
              <tbody>
                ${rowsHTML}
              </tbody>
            </table>

            <div class="footer-print">
              <span>Smart Gate Entry - Software Controllo Presenze Congressi</span>
              <span>Generato il ${new Date().toLocaleDateString('it-IT')}</span>
            </div>

            <script>
              window.onload = function() {
                window.print();
                setTimeout(function() { window.close(); }, 800);
              };
            </script>
          </body>
        </html>
      `);
      printWindow.document.close();
    }
  };

  return (
    <div className="space-y-6">

      {/* 0. Unified Barcode Laser Scanning Console & Simulator */}
      <div className="bg-white border border-slate-100 rounded-xl shadow-xs overflow-hidden">
        {/* Console Accordion Header */}
        <button
          onClick={() => setIsScannerConsoleOpen(!isScannerConsoleOpen)}
          className="w-full px-5 py-4 flex items-center justify-between bg-slate-50/50 hover:bg-slate-50 transition-colors border-b border-slate-100 cursor-pointer text-left"
        >
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-emerald-750 flex items-center justify-center text-white shrink-0 shadow-sm">
              <Scan size={14} />
            </div>
            <div>
              <span className="text-xs font-black text-slate-800 uppercase tracking-wider block">Stazione Scanner Laser & Simulatore</span>
              <span className="text-[10px] text-slate-400 font-semibold">
                {isScannerConsoleOpen ? 'Clicca per nascondere la console' : 'Clicca per espandere la console scanner'}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[10px] text-emerald-700 font-bold bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-full uppercase">Laser Pronto</span>
            </div>
            <ChevronRight 
              size={16} 
              className={`text-slate-400 transition-transform duration-300 ${isScannerConsoleOpen ? 'rotate-90' : 'rotate-0'}`} 
            />
          </div>
        </button>

        {isScannerConsoleOpen && (
          <div className="p-6 border-b border-slate-100 bg-white/50">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              
              {/* Left Column: The Main Laser Input Block */}
              <div className="lg:col-span-7 space-y-5">
                {/* Laser Receiver Box */}
                <div 
                  onClick={forceFocus}
                  className="bg-slate-900 border border-slate-850 rounded-xl p-6 flex flex-col items-center justify-center text-center relative overflow-hidden min-h-[300px] shadow-sm cursor-pointer group"
                >
                  {/* Laser Beam Animation */}
                  <div className="absolute top-0 left-0 w-full h-1 bg-red-500 opacity-60 animate-bounce shadow-[0_0_6px_rgba(239,68,68,0.7)] z-10" />

                  {/* Laser Status Indicators & Audio Control */}
                  <div className="absolute top-4 right-4 flex items-center gap-2 z-20">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsKeyboardListenerActive(!isKeyboardListenerActive);
                      }}
                      className={`text-[10px] font-bold px-2 py-1 rounded border transition-all flex items-center gap-1 ${
                        isKeyboardListenerActive 
                          ? 'bg-emerald-950 text-emerald-400 border-emerald-800' 
                          : 'bg-slate-800 text-slate-400 border-slate-700'
                      }`}
                      title={isKeyboardListenerActive ? "Lettore laser automatico attivo" : "Lettore in pausa"}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${isKeyboardListenerActive ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
                      <span>{isKeyboardListenerActive ? 'Laser Attivo' : 'Laser Pausa'}</span>
                    </button>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSoundEnabled(!soundEnabled);
                      }}
                      className="text-slate-400 hover:text-white transition-colors bg-slate-800 p-1.5 rounded border border-slate-700"
                      title={soundEnabled ? "Disattiva beep acustico" : "Attiva beep acustico"}
                    >
                      {soundEnabled ? <Volume2 size={13} /> : <VolumeX size={13} />}
                    </button>
                  </div>

                  <div className="relative mb-4">
                    <div className="w-16 h-16 rounded-xl border border-emerald-500/20 flex items-center justify-center relative animate-pulse bg-emerald-950/20">
                      <Scan className="text-emerald-400" size={32} strokeWidth={1.5} />
                      <div className="absolute top-0 left-0 w-3 h-3 border-t border-l border-emerald-400 -mt-[1px] -ml-[1px]" />
                      <div className="absolute top-0 right-0 w-3 h-3 border-t border-r border-emerald-400 -mt-[1px] -mr-[1px]" />
                      <div className="absolute bottom-0 left-0 w-3 h-3 border-b border-l border-emerald-400 -mb-[1px] -ml-[1px]" />
                      <div className="absolute bottom-0 right-0 w-3 h-3 border-b border-r border-emerald-400 -mb-[1px] -mr-[1px]" />
                    </div>
                  </div>

                  <h3 className="text-white font-black text-xs uppercase tracking-wider mb-1">STAZIONE LETTORE LASER ATTIVA</h3>
                  <p className="text-slate-400 text-[11px] max-w-sm mb-4 leading-relaxed font-medium">
                    Inquadra il codice a barre o premi il grilletto della penna ottica. Il sistema rileva automaticamente il partecipante in tempo reale.
                  </p>

                  <input
                    ref={inputRef}
                    type="text"
                    value={manualCode}
                    onChange={e => setManualCode(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        processBarcode(manualCode);
                      }
                    }}
                    placeholder="Attesa scansione..."
                    className="opacity-0 absolute pointer-events-none"
                  />

                  <div className="text-[9px] bg-slate-800 text-slate-400 font-mono px-2.5 py-1 rounded border border-slate-700">
                    {isKeyboardListenerActive 
                      ? "Pronto a catturare la scansione (non serve cliccare sul testo)" 
                      : "Ascolto laser in pausa. Usa l'inserimento manuale o il simulatore"}
                  </div>
                </div>

                {/* Status Alert Panels */}
                {statusMessage.type && (
                  <div className={`p-4 rounded-xl flex items-start gap-3 border text-xs transition-all ${
                    statusMessage.type === 'success' 
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-150 shadow-xs' 
                      : 'bg-red-50 text-red-800 border-red-150 shadow-xs'
                  }`}>
                    {statusMessage.type === 'success' ? (
                      <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center shrink-0 text-white font-bold text-[10px]">✓</div>
                    ) : (
                      <AlertCircle className="text-red-500 shrink-0 mt-0.5" size={16} />
                    )}
                    
                    <div className="space-y-1 flex-1 min-w-0">
                      <p className="font-bold text-sm leading-tight">{statusMessage.text}</p>
                      {statusMessage.type === 'success' && scannedParticipant && (
                        <div className="text-xs text-emerald-700/90 font-medium space-y-1 mt-2">
                          <div className="flex gap-2">
                            <span className="text-emerald-600/70">Utente:</span>
                            <strong>{scannedParticipant.lastName} {scannedParticipant.firstName}</strong>
                            {scannedParticipant.company && (
                              <span className="text-emerald-600/60 font-normal">({scannedParticipant.company})</span>
                            )}
                          </div>
                          {scannedLog && (
                            <div className="flex items-center gap-2 mt-1">
                              <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-black uppercase ${
                                scannedLog.status === 'inside' ? 'bg-emerald-200 text-emerald-800' : 'bg-amber-200 text-amber-800'
                              }`}>
                                {scannedLog.status === 'inside' ? 'Entrato' : 'Uscito'}
                              </span>
                              <span className="font-mono text-[10px] text-slate-500">
                                {scannedLog.status === 'inside' 
                                  ? `Registrato alle: ${new Date(scannedLog.checkInTime).toLocaleTimeString('it-IT')}` 
                                  : `Registrato alle: ${new Date(scannedLog.checkOutTime!).toLocaleTimeString('it-IT')} (Soggiorno: ${Math.round(scannedLog.totalMinutes || 0)} min)`}
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Right Column: Testing simulation buttons & real-time scanner log feed */}
              <div className="lg:col-span-5 space-y-5">
                {/* Manual Barcode entry */}
                <div className="bg-slate-50/50 border border-slate-150 rounded-xl p-4 space-y-3 shadow-2xs">
                  <span className="block text-[10px] font-black text-slate-400 uppercase tracking-wider">Inserimento Manuale Alternativo</span>
                  <form onSubmit={handleManualSubmit} className="flex gap-1.5">
                    <input
                      type="text"
                      placeholder="Codice ID (es. CONF-002 o 0101)"
                      value={manualCode}
                      onChange={e => setManualCode(e.target.value)}
                      className="flex-1 px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs font-mono focus:outline-hidden focus:border-slate-450 bg-white"
                    />
                    <button
                      type="submit"
                      className="px-3 bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs rounded-lg flex items-center justify-center gap-1 cursor-pointer transition-colors"
                    >
                      <span>Invia</span>
                      <CornerDownLeft size={12} />
                    </button>
                  </form>
                </div>

                {/* Laser Gun Simulator for Testing */}
                <div className="bg-slate-50/50 border border-slate-150 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="block text-[10px] font-black text-slate-400 uppercase tracking-wider">Simulatore Laser (Click per scansionare)</span>
                    <span className="bg-amber-100 text-amber-800 text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-full">Test</span>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5 max-h-36 overflow-y-auto pr-1">
                    {participants.map(p => {
                      const pLogs = logs.filter(l => l.participantId === p.id);
                      const inside = pLogs.some(l => l.status === 'inside');
                      return (
                        <button
                          key={p.id}
                          onClick={() => processBarcode(p.id)}
                          className={`p-2 rounded-lg border text-left transition-all hover:border-slate-355 flex justify-between items-center cursor-pointer ${
                            inside 
                              ? 'bg-emerald-50/40 border-emerald-200 hover:bg-emerald-50' 
                              : 'bg-white border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          <div className="min-w-0 flex-1 pr-1">
                            <div className="text-xs font-bold text-slate-700 truncate">{p.lastName} {p.firstName}</div>
                            <div className="text-[9px] text-slate-400 font-mono truncate">{p.id}</div>
                          </div>
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${inside ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`} />
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Real-time scan log timeline */}
                <div className="bg-slate-50/30 border border-slate-150 rounded-xl p-4 space-y-3">
                  <span className="block text-[10px] font-black text-slate-400 uppercase tracking-wider">Timeline Ultime Scansioni</span>
                  <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                    {recentActivities.map(act => (
                      <div 
                        key={act.id} 
                        className="flex items-center justify-between p-2 rounded-lg border border-slate-100 bg-white text-[11px] shadow-2xs"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <div className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 ${
                            act.type === 'check_in' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                          }`}>
                            <ArrowRight size={10} className={act.type === 'check_in' ? 'rotate-45' : '-rotate-135'} />
                          </div>
                          <div className="min-w-0">
                            <div className="font-bold text-slate-800 truncate leading-tight">{act.participantName}</div>
                            <div className="text-[9px] text-slate-400 font-mono">{act.barcode}</div>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="font-mono text-[10px] text-slate-600 font-bold">{act.time}</div>
                          <span className={`text-[8px] font-extrabold px-1.5 py-0.2 rounded-full ${
                            act.type === 'check_in' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                          }`}>
                            {act.type === 'check_in' ? 'Ingresso' : `Uscito (${act.duration})`}
                          </span>
                        </div>
                      </div>
                    ))}
                    {recentActivities.length === 0 && (
                      <div className="py-6 text-center text-[11px] text-slate-400 italic">Nessuna scansione registrata.</div>
                    )}
                  </div>
                </div>

              </div>

            </div>
          </div>
        )}
      </div>

      {/* 1. Statistics Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Total Registered */}
        <div className="bg-white border border-slate-100 rounded-xl p-5 shadow-xs flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center shrink-0 text-slate-600">
            <Users size={20} />
          </div>
          <div>
            <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Iscritti Totali</span>
            <span className="text-2xl font-extrabold text-slate-800">{totalRegistered}</span>
          </div>
        </div>

        {/* Present Inside */}
        <div className="bg-white border border-slate-100 rounded-xl p-5 shadow-xs flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center shrink-0 text-emerald-700">
            <UserCheck size={20} />
          </div>
          <div>
            <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">In Aula (Presenti)</span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-extrabold text-slate-800">{currentInside}</span>
              {totalRegistered > 0 && (
                <span className="text-[10px] text-slate-400 font-semibold">
                  ({Math.round((currentInside / totalRegistered) * 100)}%)
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Checked Out */}
        <div className="bg-white border border-slate-100 rounded-xl p-5 shadow-xs flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-amber-50 border border-amber-100 flex items-center justify-center shrink-0 text-amber-700">
            <UserX size={20} />
          </div>
          <div>
            <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Usciti</span>
            <span className="text-2xl font-extrabold text-slate-800">{totalCheckedOut}</span>
          </div>
        </div>

        {/* Average Permanence */}
        <div className="bg-white border border-slate-100 rounded-xl p-5 shadow-xs flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0 text-blue-700">
            <Award size={20} />
          </div>
          <div>
            <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Permanenza Media</span>
            <span className="text-2xl font-extrabold text-slate-800">
              {averagePermanence > 0 ? `${averagePermanence} min` : 'N/D'}
            </span>
          </div>
        </div>

      </div>

      {/* 2. Controls & List View */}
      <div className="bg-white border border-slate-100 rounded-xl shadow-xs overflow-hidden">
        
        {/* Table Filters/Search Area */}
        <div className="p-4 border-b border-slate-100 flex flex-col md:flex-row gap-3 md:items-center md:justify-between bg-slate-50/30">
          
          {/* Status Tabs */}
          <div className="flex rounded-lg border border-slate-150 p-0.5 bg-slate-100/50 text-xs">
            <button
              onClick={() => setFilterStatus('all')}
              className={`px-3 py-1.5 rounded-md font-semibold transition-all ${
                filterStatus === 'all' ? 'bg-white text-slate-800 shadow-xs' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Tutti ({totalRegistered})
            </button>
            <button
              onClick={() => setFilterStatus('inside')}
              className={`px-3 py-1.5 rounded-md font-semibold transition-all ${
                filterStatus === 'inside' ? 'bg-white text-emerald-700 shadow-xs' : 'text-slate-500 hover:text-emerald-700'
              }`}
            >
              In Aula ({currentInside})
            </button>
            <button
              onClick={() => setFilterStatus('outside')}
              className={`px-3 py-1.5 rounded-md font-semibold transition-all ${
                filterStatus === 'outside' ? 'bg-white text-amber-700 shadow-xs' : 'text-slate-500 hover:text-amber-700'
              }`}
            >
              Usciti ({totalCheckedOut})
            </button>
            <button
              onClick={() => setFilterStatus('absent')}
              className={`px-3 py-1.5 rounded-md font-semibold transition-all ${
                filterStatus === 'absent' ? 'bg-white text-slate-600 shadow-xs' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Assenti ({totalRegistered - currentInside - totalCheckedOut})
            </button>
          </div>

          {/* Search & Export Actions */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full md:w-auto">
            {/* Search Box */}
            <div className="relative flex-1 sm:flex-none">
              <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
              <input
                type="text"
                placeholder="Cerca per nome, azienda, ID..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full md:w-64 pl-9 pr-3 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-hidden focus:border-slate-400 text-slate-800 bg-white"
              />
            </div>

            {/* Export PDF Button */}
            <button
              onClick={handleExportPDF}
              className="px-3.5 py-1.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-xs transition-all whitespace-nowrap shrink-0"
              title="Esporta l'elenco presenze in formato PDF"
            >
              <Download size={13} />
              <span>Esporta PDF</span>
            </button>
          </div>

        </div>

        {/* Real Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs divide-y divide-slate-150">
            <thead className="bg-slate-50/50 text-slate-500 font-bold uppercase tracking-wider">
              <tr>
                <th className="px-6 py-3.5">ID Codice</th>
                <th className="px-6 py-3.5">Nominativo</th>
                <th className="px-6 py-3.5">Azienda / Società</th>
                <th className="px-6 py-3.5">Stato Presenza</th>
                <th className="px-6 py-3.5">Ora Entrata / Uscita</th>
                <th className="px-6 py-3.5">Permanenza Totale</th>
                <th className="px-6 py-3.5 text-right">Azioni Operatore</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {filteredParticipants.map(p => {
                const stateInfo = getParticipantStatus(p.id);
                
                return (
                  <tr key={p.id} className="hover:bg-slate-50/40 transition-colors">
                    
                    {/* ID Column */}
                    <td className="px-6 py-3.5 font-mono font-semibold text-slate-500">
                      {p.id}
                    </td>

                    {/* Name/Email Column */}
                    <td className="px-6 py-3.5">
                      <div>
                        <div className="font-bold text-slate-800 text-sm">{p.lastName} {p.firstName}</div>
                        {p.email && <div className="text-slate-400 text-[10px] mt-0.5">{p.email}</div>}
                      </div>
                    </td>

                    {/* Company Column */}
                    <td className="px-6 py-3.5 text-slate-600">
                      {p.company || <span className="text-slate-350 italic">Libero professionista</span>}
                    </td>

                    {/* Badge Status */}
                    <td className="px-6 py-3.5">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${stateInfo.class}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${
                          stateInfo.status === 'inside' ? 'bg-emerald-500 animate-pulse' : (stateInfo.status === 'outside' ? 'bg-amber-500' : 'bg-slate-400')
                        }`} />
                        {stateInfo.label}
                      </span>
                    </td>

                    {/* Logs Timestamps Column */}
                    <td className="px-6 py-3.5 text-slate-500 font-mono">
                      {stateInfo.status === 'inside' && stateInfo.latestLog && (
                        <div className="flex items-center gap-1">
                          <LogIn size={12} className="text-emerald-500" />
                          <span>Entrato: {new Date(stateInfo.latestLog.checkInTime).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                      )}
                      {stateInfo.status === 'outside' && stateInfo.latestLog && (
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1">
                            <LogOut size={12} className="text-amber-500" />
                            <span>Uscito: {new Date(stateInfo.latestLog.checkOutTime!).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}</span>
                          </div>
                          <div className="text-[10px] text-slate-400 font-semibold pl-4">Permanenza: {Math.round(stateInfo.latestLog.totalMinutes || 0)}m</div>
                        </div>
                      )}
                      {stateInfo.status === 'absent' && (
                        <span className="text-slate-300 italic">-</span>
                      )}
                    </td>

                    {/* Total Permanence Column */}
                    <td className="px-6 py-3.5 font-mono">
                      <div className="font-bold text-slate-700">{getParticipantTotalPermanence(p.id)}</div>
                      {minEcmHours !== undefined && minEcmHours > 0 && (
                        <div className="mt-1">
                          {getParticipantTotalHours(p.id) >= minEcmHours ? (
                            <span className="inline-flex items-center gap-0.5 bg-emerald-50 text-emerald-800 text-[8px] font-black px-1.5 py-0.2 rounded-full border border-emerald-150 uppercase" title="Presenza minima ECM raggiunta">
                              Idoneo ECM
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-0.5 bg-slate-50 text-slate-400 text-[8px] font-bold px-1.5 py-0.2 rounded-full border border-slate-200 uppercase" title={`Presenza inferiore a ${minEcmHours} ore`}>
                              No ECM
                            </span>
                          )}
                        </div>
                      )}
                    </td>

                    {/* Override Operator Actions */}
                    <td className="px-6 py-3.5 text-right space-x-1 whitespace-nowrap">
                      {/* Manual Check-in or Check-out */}
                      {stateInfo.status === 'inside' ? (
                        <button
                          onClick={() => onManualCheckOut(p.id)}
                          className="px-2 py-1 text-[10px] font-bold bg-amber-50 text-amber-700 hover:bg-amber-100 rounded border border-amber-200 transition-colors cursor-pointer"
                          title="Registra uscita manuale"
                        >
                          Uscita Manuale
                        </button>
                      ) : (
                        <button
                          onClick={() => onManualCheckIn(p.id)}
                          className="px-2 py-1 text-[10px] font-bold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded border border-emerald-200 transition-colors cursor-pointer"
                          title="Registra ingresso manuale"
                        >
                          Entrata Manuale
                        </button>
                      )}

                      {/* Edit Participant Details Action */}
                      <button
                        onClick={() => handleStartEdit(p)}
                        className="p-1.5 text-slate-400 hover:text-emerald-700 hover:bg-emerald-50 rounded border border-transparent transition-all cursor-pointer inline-flex items-center"
                        title="Modifica Dati Partecipante"
                      >
                        <Edit2 size={13} />
                      </button>

                      {/* Print Badge Action */}
                      <button
                        onClick={() => handlePrintBadge(p)}
                        className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded border border-transparent transition-all cursor-pointer inline-flex items-center"
                        title="Stampa Badge d'Accesso"
                      >
                        <Printer size={13} />
                      </button>
                    </td>

                  </tr>
                );
              })}

              {filteredParticipants.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-400 italic">
                    Nessun partecipante corrisponde ai criteri di ricerca.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

      </div>

      {/* 3. Badge Printing Modal (Beautiful, High Contrast, Vector sharp Barcode!) */}
      {selectedBadgeParticipant && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-sm bg-white rounded-xl shadow-xl overflow-hidden border border-slate-100 flex flex-col">
            
            {/* Modal Header */}
            <div className="px-5 py-3 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Anteprima Badge</span>
              <button 
                onClick={() => setSelectedBadgeParticipant(null)}
                className="text-slate-400 hover:text-slate-600 transition-colors rounded p-1 hover:bg-slate-100 text-xs font-semibold"
              >
                Chiudi
              </button>
            </div>

            {/* Badge Layout Area */}
            <div className="p-6 bg-slate-100 flex justify-center">
              
              <div 
                id="printable-badge-area"
                className="bg-white border border-slate-200 shadow-sm rounded-lg p-6 w-full max-w-xs text-center space-y-4"
              >
                {/* Visual Header */}
                <div className="space-y-1">
                  <div className="text-[9px] font-extrabold tracking-widest text-emerald-600 uppercase">
                    Badge Congresso Accreditato
                  </div>
                  <div className="w-8 h-1 bg-emerald-500 mx-auto rounded" />
                </div>

                {/* Participant Details */}
                <div className="py-2">
                  <h3 className="text-lg font-black text-slate-800 tracking-tight leading-tight">
                    {selectedBadgeParticipant.lastName} {selectedBadgeParticipant.firstName}
                  </h3>
                  <p className="text-xs text-slate-400 font-semibold mt-1">
                    {selectedBadgeParticipant.company || 'Partecipante Indipendente'}
                  </p>
                  {selectedBadgeParticipant.notes && (
                    <span className="inline-block mt-2 px-2 py-0.5 bg-slate-50 text-[10px] text-slate-500 font-bold border border-slate-150 rounded">
                      {selectedBadgeParticipant.notes}
                    </span>
                  )}
                </div>

                {/* Barcode Vector rendering */}
                <div className="barcode-container">
                  <BarcodeSVG value={selectedBadgeParticipant.id} />
                </div>

                {/* Footer brand info */}
                <div className="border-t border-slate-100 pt-3 flex items-center justify-center gap-1 text-[8px] text-slate-350 uppercase tracking-wider font-semibold">
                  <span>Smart Gate Entry</span>
                  <span>•</span>
                  <span>Controllo Presenze</span>
                </div>

              </div>
              
            </div>

            {/* Action buttons */}
            <div className="p-4 border-t border-slate-100 bg-slate-50/30 flex gap-3">
              <button
                onClick={() => setSelectedBadgeParticipant(null)}
                className="flex-1 py-2 text-xs font-semibold text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-all border border-slate-200"
              >
                Annulla
              </button>
              <button
                onClick={triggerSystemPrint}
                className="flex-1 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-semibold text-xs rounded-lg flex items-center justify-center gap-2 shadow-xs transition-all cursor-pointer"
              >
                <Printer size={14} />
                <span>Stampa Badge</span>
              </button>
            </div>

          </div>
        </div>
      )}

      {/* 4. Edit Participant Details Modal Overlay */}
      {editingParticipant && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-xl bg-white rounded-xl shadow-xl overflow-hidden border border-slate-100 flex flex-col max-h-[90vh]">
            
            {/* Modal Header */}
            <div className="px-5 py-4 border-b border-slate-150 flex justify-between items-center bg-slate-50/50 shrink-0">
              <div className="flex items-center gap-2">
                <Edit2 size={16} className="text-emerald-700" />
                <span className="text-xs font-black text-slate-800 uppercase tracking-wider">Modifica Partecipante e Timbrature</span>
              </div>
              <button 
                onClick={() => setEditingParticipant(null)}
                className="text-slate-400 hover:text-slate-600 transition-colors rounded p-1 hover:bg-slate-100 text-xs font-bold cursor-pointer"
              >
                Chiudi
              </button>
            </div>

            {/* Modal Body / Scrollable Content */}
            <div className="p-6 space-y-6 text-xs font-semibold text-slate-600 overflow-y-auto">
              {editError && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-600 rounded-lg text-center font-bold text-[11px]">
                  {editError}
                </div>
              )}

              {/* Anagrafica Fields */}
              <div className="space-y-4">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-wider border-b border-slate-100 pb-1">Dati Anagrafici</h4>
                
                <div className="grid grid-cols-2 gap-4">
                  {/* Nome */}
                  <div className="space-y-1.5">
                    <label className="block text-slate-500">Nome *</label>
                    <input
                      type="text"
                      value={editForm.firstName}
                      onChange={e => setEditForm({ ...editForm, firstName: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-250 rounded-lg text-xs text-slate-800 focus:outline-hidden focus:border-slate-400 font-medium"
                      placeholder="Esempio: Alessandro"
                    />
                  </div>

                  {/* Cognome */}
                  <div className="space-y-1.5">
                    <label className="block text-slate-500">Cognome *</label>
                    <input
                      type="text"
                      value={editForm.lastName}
                      onChange={e => setEditForm({ ...editForm, lastName: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-250 rounded-lg text-xs text-slate-800 focus:outline-hidden focus:border-slate-400 font-medium"
                      placeholder="Esempio: Rossi"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {/* Barcode ID / Codice */}
                  <div className="space-y-1.5">
                    <label className="block text-slate-500">Codice ID Barcode *</label>
                    <input
                      type="text"
                      value={editForm.id}
                      onChange={e => setEditForm({ ...editForm, id: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-250 rounded-lg text-xs text-slate-800 focus:outline-hidden focus:border-slate-400 font-mono font-bold uppercase"
                      placeholder="Esempio: CONF-1234"
                    />
                  </div>

                  {/* Azienda / Società */}
                  <div className="space-y-1.5">
                    <label className="block text-slate-500">Azienda / Società</label>
                    <input
                      type="text"
                      value={editForm.company || ''}
                      onChange={e => setEditForm({ ...editForm, company: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-250 rounded-lg text-xs text-slate-800 focus:outline-hidden focus:border-slate-400 font-medium"
                      placeholder="Esempio: Azienda Tech S.r.l."
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {/* Email */}
                  <div className="space-y-1.5">
                    <label className="block text-slate-500">Indirizzo Email</label>
                    <input
                      type="email"
                      value={editForm.email || ''}
                      onChange={e => setEditForm({ ...editForm, email: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-250 rounded-lg text-xs text-slate-800 focus:outline-hidden focus:border-slate-400 font-medium"
                      placeholder="Esempio: alessandro.rossi@email.it"
                    />
                  </div>

                  {/* Note / Ruolo */}
                  <div className="space-y-1.5">
                    <label className="block text-slate-500">Note / Ruolo (Relatore, VIP, ecc.)</label>
                    <input
                      type="text"
                      value={editForm.notes || ''}
                      onChange={e => setEditForm({ ...editForm, notes: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-250 rounded-lg text-xs text-slate-800 focus:outline-hidden focus:border-slate-400 font-medium"
                      placeholder="Esempio: Relatore"
                    />
                  </div>
                </div>
              </div>

              {/* TIMBRATURE / SCAN LOGS MODIFICATION SECTION */}
              <div className="border-t border-slate-150 pt-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Storico Scansioni / Timbrature</h4>
                  <button
                    type="button"
                    onClick={() => {
                      const newLog: AttendanceLog = {
                        id: `LOG-MANUAL-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
                        eventId,
                        participantId: editForm.id,
                        checkInTime: new Date().toISOString(),
                        checkOutTime: null,
                        totalMinutes: null,
                        status: 'inside'
                      };
                      setEditingLogs([...editingLogs, newLog]);
                    }}
                    className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded text-[10px] font-bold text-emerald-700 flex items-center gap-1 cursor-pointer transition-colors"
                  >
                    + Aggiungi Timbratura
                  </button>
                </div>

                {editingLogs.length === 0 ? (
                  <div className="p-4 bg-slate-50 border border-slate-150 rounded-xl text-center">
                    <p className="text-slate-400 italic text-xs">Nessuna timbratura registrata per questo utente.</p>
                    <p className="text-[10px] text-slate-350 mt-1 font-medium">Usa il pulsante in alto per aggiungere un ingresso/uscita manuale.</p>
                  </div>
                ) : (
                  <div className="space-y-3 max-h-56 overflow-y-auto pr-1">
                    {editingLogs.map((log, index) => {
                      return (
                        <div key={log.id} className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-3 relative transition-all hover:border-slate-300">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingLogs(editingLogs.filter(l => l.id !== log.id));
                            }}
                            className="absolute top-2 right-2 text-slate-400 hover:text-red-600 p-1 hover:bg-red-50 rounded transition-colors cursor-pointer"
                            title="Elimina timbratura"
                          >
                            <Trash2 size={13} />
                          </button>

                          <div className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Rilevazione #{index + 1}</div>

                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-[10px] text-slate-400 mb-1">Orario Ingresso</label>
                              <input
                                type="datetime-local"
                                value={toLocalDatetimeString(log.checkInTime)}
                                onChange={e => {
                                  const updated = [...editingLogs];
                                  const newVal = e.target.value;
                                  updated[index] = {
                                    ...log,
                                    checkInTime: fromLocalDatetimeString(newVal)
                                  };
                                  if (log.checkOutTime) {
                                    const diffMs = new Date(log.checkOutTime).getTime() - new Date(updated[index].checkInTime).getTime();
                                    updated[index].totalMinutes = Math.max(0, diffMs / 60000);
                                  }
                                  setEditingLogs(updated);
                                }}
                                className="w-full px-2 py-1.5 border border-slate-200 rounded-md text-[10px] font-mono text-slate-800 focus:outline-hidden focus:border-slate-400 bg-white"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] text-slate-400 mb-1">Orario Uscita</label>
                              <input
                                type="datetime-local"
                                value={toLocalDatetimeString(log.checkOutTime)}
                                placeholder="Non ancora uscito"
                                onChange={e => {
                                  const updated = [...editingLogs];
                                  const val = e.target.value;
                                  if (val) {
                                    const checkOutTime = fromLocalDatetimeString(val);
                                    const diffMs = new Date(checkOutTime).getTime() - new Date(log.checkInTime).getTime();
                                    updated[index] = {
                                      ...log,
                                      checkOutTime,
                                      totalMinutes: Math.max(0, diffMs / 60000),
                                      status: 'outside'
                                    };
                                  } else {
                                    updated[index] = {
                                      ...log,
                                      checkOutTime: null,
                                      totalMinutes: null,
                                      status: 'inside'
                                    };
                                  }
                                  setEditingLogs(updated);
                                }}
                                className="w-full px-2 py-1.5 border border-slate-200 rounded-md text-[10px] font-mono text-slate-800 focus:outline-hidden focus:border-slate-400 bg-white"
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

            </div>

            {/* Modal Actions */}
            <div className="p-4 border-t border-slate-150 bg-slate-50/50 flex gap-3 text-xs font-semibold shrink-0">
              <button
                type="button"
                onClick={() => setEditingParticipant(null)}
                className="flex-1 py-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-all border border-slate-200 cursor-pointer"
              >
                Annulla
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                className="flex-1 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg shadow-xs transition-all cursor-pointer text-center"
              >
                Salva Modifiche
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
