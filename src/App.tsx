import React, { useState, useEffect } from 'react';
import { Calendar, MapPin, Plus, ChevronRight, BookOpen, Clock, Users, LogIn, LogOut, FileSpreadsheet, ArrowLeft, RefreshCw, BarChart3, Activity, Trash2, Edit2 } from 'lucide-react';
import { Event, Participant, AttendanceLog, EventWithStats } from './types';
import NewEventModal from './components/NewEventModal';
import EditEventModal from './components/EditEventModal';
import ControlPanel from './components/ControlPanel';
import ReportSection from './components/ReportSection';
import LoginScreen from './components/LoginScreen';

// Firebase Imports
import { collection, doc, setDoc, deleteDoc, getDocs, onSnapshot } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';

// Initial Seed Data to ensure the application starts fully loaded and gorgeous!
const SEED_EVENT: Event = {
  id: 'EVT-2026-01',
  title: 'Forum delle Nuove Tecnologie ed Intelligenza Artificiale',
  startDate: '2026-09-08',
  endDate: '2026-09-10',
  description: 'Evento nazionale dedicato alle frontiere della trasformazione digitale, intelligenza artificiale ed automazione nei processi aziendali.',
  location: 'Fiera di Milano, Padiglione 4',
  status: 'active',
  createdAt: '2026-09-08T08:00:00Z'
};

const SEED_PARTICIPANTS: Participant[] = [
  { id: '0101', firstName: 'Alessandro', lastName: 'Rossi', email: 'alessandro.rossi@email.it', company: 'Tech Innovation S.r.l.', notes: 'Relatore' },
  { id: 'CONF-002', firstName: 'Sofia', lastName: 'Bianchi', email: 'sofia.bianchi@email.it', company: 'Digital Solutions', notes: 'Partecipante' },
  { id: 'CONF-003', firstName: 'Matteo', lastName: 'Ferrari', email: 'm.ferrari@enterprise.com', company: 'Ferrari Consulting', notes: 'Sponsor' },
  { id: 'CONF-004', firstName: 'Giulia', lastName: 'Russo', email: 'giulia.russo@academia.it', company: 'Università di Roma', notes: 'Studente' },
  { id: 'CONF-005', firstName: 'Lorenzo', lastName: 'Marino', email: 'lorenzo.marino@designhub.io', company: 'Design Hub Studio', notes: 'VIP' },
  { id: 'CONF-006', firstName: 'Emma', lastName: 'Gallo', email: 'emma.gallo@futurelab.org', company: 'Future Lab S.p.A.', notes: 'Partecipante' },
  { id: 'CONF-007', firstName: 'Davide', lastName: 'Greco', email: 'd.greco@cybersec.it', company: 'CyberSec S.r.l.', notes: 'Partecipante' },
  { id: 'CONF-008', firstName: 'Chiara', lastName: 'Rizzo', email: 'chiara.rizzo@hrgroup.com', company: 'HR Group International', notes: 'Stampa' }
];

// Initial seeded check-ins and check-outs
const SEED_LOGS: AttendanceLog[] = [
  {
    id: 'LOG-001',
    eventId: 'EVT-2026-01',
    participantId: '0101',
    checkInTime: new Date(new Date().setHours(8, 30, 0)).toISOString(),
    checkOutTime: new Date(new Date().setHours(11, 45, 0)).toISOString(),
    totalMinutes: 195,
    status: 'outside'
  },
  {
    id: 'LOG-002',
    eventId: 'EVT-2026-01',
    participantId: 'CONF-002',
    checkInTime: new Date(new Date().setHours(8, 45, 0)).toISOString(),
    checkOutTime: null,
    totalMinutes: null,
    status: 'inside'
  },
  {
    id: 'LOG-003',
    eventId: 'EVT-2026-01',
    participantId: 'CONF-003',
    checkInTime: new Date(new Date().setHours(9, 15, 0)).toISOString(),
    checkOutTime: new Date(new Date().setHours(12, 0, 0)).toISOString(),
    totalMinutes: 165,
    status: 'outside'
  },
  {
    id: 'LOG-004',
    eventId: 'EVT-2026-01',
    participantId: 'CONF-005',
    checkInTime: new Date(new Date().setHours(9, 0, 0)).toISOString(),
    checkOutTime: null,
    totalMinutes: null,
    status: 'inside'
  }
];

const parseSafeDate = (dateStr: string) => {
  if (!dateStr) return new Date();
  const trimmed = dateStr.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return new Date(trimmed);
  }
  const match = trimmed.match(/^(\d{1,2})[\.\/\-](\d{1,2})[\.\/\-](\d{4})$/);
  if (match) {
    return new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
  }
  return new Date(trimmed);
};

const formatToItalianDisplay = (dateStr: string) => {
  if (!dateStr) return '';
  const d = parseSafeDate(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' });
};

function cleanFirestoreData<T extends object>(obj: T): T {
  const result = { ...obj } as any;
  Object.keys(result).forEach(key => {
    if (result[key] === undefined) {
      delete result[key];
    } else if (result[key] !== null && typeof result[key] === 'object' && !Array.isArray(result[key]) && !(result[key] instanceof Date)) {
      result[key] = cleanFirestoreData(result[key]);
    }
  });
  return result;
}

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [participantsMap, setParticipantsMap] = useState<Record<string, Participant[]>>({});
  const [logsMap, setLogsMap] = useState<Record<string, AttendanceLog[]>>({});
  
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'control' | 'reports'>('control');
  const [isNewEventModalOpen, setIsNewEventModalOpen] = useState(false);
  const [isEditEventModalOpen, setIsEditEventModalOpen] = useState(false);

  // Check active JWT session on application boot
  useEffect(() => {
    const localToken = localStorage.getItem('token');
    const headers: Record<string, string> = {};
    if (localToken) {
      headers['Authorization'] = `Bearer ${localToken}`;
    }

    fetch('/api/check-session', { headers })
      .then(res => {
        if (res.ok) {
          return res.json();
        }
        throw new Error();
      })
      .then(data => {
        if (data.authenticated) {
          setIsAuthenticated(true);
        } else {
          setIsAuthenticated(false);
        }
      })
      .catch(() => {
        setIsAuthenticated(false);
      });
  }, []);

  const handleLogout = async () => {
    try {
      const localToken = localStorage.getItem('token');
      const headers: Record<string, string> = {};
      if (localToken) {
        headers['Authorization'] = `Bearer ${localToken}`;
      }
      await fetch('/api/logout', { method: 'POST', headers });
    } catch (e) {
      console.error('Logout error', e);
    }
    localStorage.removeItem('token');
    setIsAuthenticated(false);
  };

  // Admin deletion security state
  const [deletingEventId, setDeletingEventId] = useState<string | null>(null);
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState('');

  // Real-time synchronization of Events with Firestore (automatic offline sync)
  useEffect(() => {
    const eventsCollection = collection(db, 'events');
    const unsubscribeEvents = onSnapshot(eventsCollection, async (snapshot) => {
      const fetchedEvents: Event[] = [];
      snapshot.forEach(docSnap => {
        fetchedEvents.push(docSnap.data() as Event);
      });

      // Sort events by date / created
      fetchedEvents.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      // If database is completely empty (e.g. first time boot), seed Firestore
      if (fetchedEvents.length === 0) {
        try {
          const firstEvent = SEED_EVENT;
          const firstParticipants = SEED_PARTICIPANTS;
          const firstLogs = SEED_LOGS;

          console.log("Starting DB seeding: writing main event document...", firstEvent.id);
          // Write Event to Firestore
          await setDoc(doc(db, 'events', firstEvent.id), firstEvent);
          console.log("Main event document seeded successfully.");
          
          // Write Participants
          console.log(`Starting seeding of ${firstParticipants.length} participants...`);
          for (const p of firstParticipants) {
            try {
              await setDoc(doc(db, 'events', firstEvent.id, 'participants', p.id), p);
            } catch (pErr) {
              console.error(`Failed to seed participant: id=${p.id}, data:`, p, pErr);
              throw pErr;
            }
          }
          console.log("All participants seeded successfully.");

          // Write Logs
          console.log(`Starting seeding of ${firstLogs.length} logs...`);
          for (const l of firstLogs) {
            try {
              await setDoc(doc(db, 'events', firstEvent.id, 'logs', l.id), l);
            } catch (lErr) {
              console.error(`Failed to seed log: id=${l.id}, data:`, l, lErr);
              throw lErr;
            }
          }
          console.log("All logs seeded successfully. DB Seeding completed.");
        } catch (err) {
          console.error("Errore durante il seeding iniziale su Firestore: ", err);
        }
        return;
      }

      setEvents(fetchedEvents);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'events');
    });

    return () => unsubscribeEvents();
  }, []);

  // Listen for active/selected event's participants & logs dynamically (automatic offline caching)
  useEffect(() => {
    if (events.length === 0) return;

    const unsubs: (() => void)[] = [];

    events.forEach(event => {
      const pCollection = collection(db, 'events', event.id, 'participants');
      const unsubP = onSnapshot(pCollection, (snapshot) => {
        const list: Participant[] = [];
        snapshot.forEach(docSnap => {
          list.push(docSnap.data() as Participant);
        });
        setParticipantsMap(prev => ({
          ...prev,
          [event.id]: list
        }));
      }, (error) => {
        handleFirestoreError(error, OperationType.GET, `events/${event.id}/participants`);
      });

      const lCollection = collection(db, 'events', event.id, 'logs');
      const unsubL = onSnapshot(lCollection, (snapshot) => {
        const list: AttendanceLog[] = [];
        snapshot.forEach(docSnap => {
          list.push(docSnap.data() as AttendanceLog);
        });
        setLogsMap(prev => ({
          ...prev,
          [event.id]: list
        }));
      }, (error) => {
        handleFirestoreError(error, OperationType.GET, `events/${event.id}/logs`);
      });

      unsubs.push(unsubP, unsubL);
    });

    return () => {
      unsubs.forEach(unsub => unsub());
    };
  }, [events]);

  // Add a new event to Firestore
  const handleCreateEvent = async (
    eventData: Omit<Event, 'id' | 'createdAt'>, 
    participantsList: Participant[]
  ) => {
    const newId = `EVT-${Date.now()}`;
    const newEvent: Event = {
      ...eventData,
      id: newId,
      createdAt: new Date().toISOString()
    };

    try {
      // 1. Write event document
      await setDoc(doc(db, 'events', newId), cleanFirestoreData(newEvent));

      // 2. Write participants subcollection
      for (const p of participantsList) {
        await setDoc(doc(db, 'events', newId, 'participants', p.id), cleanFirestoreData(p));
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `events/${newId}`);
    }
    
    // Auto-select the newly created event and jump to scanner tab
    setSelectedEventId(newId);
    setActiveTab('scan');
  };

  // Update existing event details and participant list on Firestore
  const handleUpdateEvent = async (
    updatedEvent: Event,
    updatedParticipantsList: Participant[]
  ) => {
    try {
      // 1. Update event details
      await setDoc(doc(db, 'events', updatedEvent.id), cleanFirestoreData(updatedEvent));

      // 2. Fetch current participants to do a differential update/sync
      const currentParticipantsRef = collection(db, 'events', updatedEvent.id, 'participants');
      const querySnapshot = await getDocs(currentParticipantsRef);
      const existingIds = new Set<string>();
      querySnapshot.forEach(docSnap => {
        existingIds.add(docSnap.id);
      });

      const updatedIds = new Set(updatedParticipantsList.map(p => p.id));

      // Delete participants that were removed
      for (const oldId of existingIds) {
        if (!updatedIds.has(oldId)) {
          await deleteDoc(doc(db, 'events', updatedEvent.id, 'participants', oldId));
        }
      }

      // Add or update current participants
      for (const p of updatedParticipantsList) {
        await setDoc(doc(db, 'events', updatedEvent.id, 'participants', p.id), cleanFirestoreData(p));
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `events/${updatedEvent.id}`);
    }
  };

  // Core scan processing logic (Check-in/out toggler)
  const handleScanBarcode = (barcodeId: string) => {
    if (!selectedEventId) return { success: false, message: 'Nessun evento selezionato.' };

    let lookupId = barcodeId.trim().toUpperCase().replace(/[^A-Z0-9\-]/g, '');
    
    // Auto-translation: code "1" maps to "0101"
    if (lookupId === '1') {
      lookupId = '0101';
    }

    const eventParticipants = participantsMap[selectedEventId] || [];
    let matchedParticipant = eventParticipants.find(p => p.id === lookupId);

    // Dynamic fallback if "0101" is requested but doesn't exist: use first participant
    if (lookupId === '0101' && !matchedParticipant && eventParticipants.length > 0) {
      matchedParticipant = eventParticipants[0];
      lookupId = matchedParticipant.id;
    }

    if (!matchedParticipant) {
      return { 
        success: false, 
        message: `Codice ${barcodeId} non presente nell'elenco partecipanti.` 
      };
    }

    const currentLogs = logsMap[selectedEventId] || [];
    const openLogIndex = currentLogs.findIndex(l => l.participantId === lookupId && l.status === 'inside');
    
    const now = new Date();
    let isCheckOut = false;
    let targetLog: AttendanceLog;

    if (openLogIndex !== -1) {
      // User is already marked as INSIDE -> Perform CHECK-OUT
      const openLog = currentLogs[openLogIndex];
      const checkInTime = new Date(openLog.checkInTime);
      const diffMs = now.getTime() - checkInTime.getTime();
      const diffMins = Math.max(1, diffMs / 60000); // minimum 1 minute

      targetLog = {
        ...openLog,
        checkOutTime: now.toISOString(),
        totalMinutes: diffMins,
        status: 'outside'
      };

      isCheckOut = true;
    } else {
      // User has no open sessions -> Perform CHECK-IN
      targetLog = {
        id: `LOG-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        eventId: selectedEventId,
        participantId: lookupId,
        checkInTime: now.toISOString(),
        checkOutTime: null,
        totalMinutes: null,
        status: 'inside'
      };
    }

    // Write to Firestore asynchronously (automatic local persistence + background sync)
    try {
      setDoc(doc(db, 'events', selectedEventId, 'logs', targetLog.id), cleanFirestoreData(targetLog));
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `events/${selectedEventId}/logs/${targetLog.id}`);
    }

    return {
      success: true,
      message: isCheckOut ? 'Uscita registrata con successo!' : 'Ingresso registrato con successo!',
      log: targetLog,
      isCheckOut
    };
  };

  // Manual Override: Check-In from control panel
  const handleManualCheckIn = async (participantId: string) => {
    if (!selectedEventId) return;

    const currentLogs = logsMap[selectedEventId] || [];
    // Verify not already inside
    if (currentLogs.some(l => l.participantId === participantId && l.status === 'inside')) return;

    const newLog: AttendanceLog = {
      id: `LOG-${Date.now()}`,
      eventId: selectedEventId,
      participantId,
      checkInTime: new Date().toISOString(),
      checkOutTime: null,
      totalMinutes: null,
      status: 'inside'
    };

    try {
      await setDoc(doc(db, 'events', selectedEventId, 'logs', newLog.id), cleanFirestoreData(newLog));
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `events/${selectedEventId}/logs/${newLog.id}`);
    }
  };

  // Manual Override: Check-Out from control panel
  const handleManualCheckOut = async (participantId: string) => {
    if (!selectedEventId) return;

    const currentLogs = logsMap[selectedEventId] || [];
    const openLogIndex = currentLogs.findIndex(l => l.participantId === participantId && l.status === 'inside');
    if (openLogIndex === -1) return;

    const now = new Date();
    const openLog = currentLogs[openLogIndex];
    const checkInTime = new Date(openLog.checkInTime);
    const diffMs = now.getTime() - checkInTime.getTime();
    
    const updatedLog: AttendanceLog = {
      ...openLog,
      checkOutTime: now.toISOString(),
      totalMinutes: Math.max(1, diffMs / 60000),
      status: 'outside'
    };

    try {
      await setDoc(doc(db, 'events', selectedEventId, 'logs', updatedLog.id), cleanFirestoreData(updatedLog));
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `events/${selectedEventId}/logs/${updatedLog.id}`);
    }
  };

  // Remove individual attendance log (timbratura)
  const handleDeleteLog = async (logId: string) => {
    if (!selectedEventId) return;
    try {
      await deleteDoc(doc(db, 'events', selectedEventId, 'logs', logId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `events/${selectedEventId}/logs/${logId}`);
    }
  };

  // Edit participant details and sync logs
  const handleEditParticipant = async (oldBarcodeId: string, updatedParticipant: Participant) => {
    if (!selectedEventId) return;

    try {
      if (oldBarcodeId !== updatedParticipant.id) {
        // ID has changed. Delete old document and write new document
        await deleteDoc(doc(db, 'events', selectedEventId, 'participants', oldBarcodeId));
        await setDoc(doc(db, 'events', selectedEventId, 'participants', updatedParticipant.id), cleanFirestoreData(updatedParticipant));

        // Update all attendance logs referencing the old barcode ID
        const currentLogs = logsMap[selectedEventId] || [];
        const logsToUpdate = currentLogs.filter(l => l.participantId === oldBarcodeId);
        for (const log of logsToUpdate) {
          const updatedLog = { ...log, participantId: updatedParticipant.id };
          await setDoc(doc(db, 'events', selectedEventId, 'logs', log.id), cleanFirestoreData(updatedLog));
        }
      } else {
        // Simple update of details
        await setDoc(doc(db, 'events', selectedEventId, 'participants', updatedParticipant.id), cleanFirestoreData(updatedParticipant));
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `events/${selectedEventId}/participants/${updatedParticipant.id}`);
    }
  };

  // Update all logs of the active event (e.g. for bulk modification of check-in/out times)
  const handleUpdateLogs = async (updatedLogs: AttendanceLog[]) => {
    if (!selectedEventId) return;
    try {
      for (const log of updatedLogs) {
        await setDoc(doc(db, 'events', selectedEventId, 'logs', log.id), cleanFirestoreData(log));
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `events/${selectedEventId}/logs`);
    }
  };

  // Delete event with administrator password check
  const handleDeleteEvent = async (eventId: string, passwordInput: string): Promise<boolean> => {
    if (passwordInput !== 'Mappescio') {
      return false;
    }

    try {
      // 1. Delete all participants
      const participantsSnapshot = await getDocs(collection(db, 'events', eventId, 'participants'));
      for (const docSnap of participantsSnapshot.docs) {
        await deleteDoc(docSnap.ref);
      }

      // 2. Delete all logs
      const logsSnapshot = await getDocs(collection(db, 'events', eventId, 'logs'));
      for (const docSnap of logsSnapshot.docs) {
        await deleteDoc(docSnap.ref);
      }

      // 3. Delete event
      await deleteDoc(doc(db, 'events', eventId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `events/${eventId}`);
    }

    if (selectedEventId === eventId) {
      setSelectedEventId(null);
    }
    return true;
  };

  // Clear scans for specific event
  const handleClearLogs = async () => {
    if (!selectedEventId) return;
    try {
      const logsSnapshot = await getDocs(collection(db, 'events', selectedEventId, 'logs'));
      for (const docSnap of logsSnapshot.docs) {
        await deleteDoc(docSnap.ref);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `events/${selectedEventId}/logs`);
    }
  };

  // Quick stats calculation for Event List Dashboard cards
  const getEventWithStats = (event: Event): EventWithStats => {
    const eventParticipants = participantsMap[event.id] || [];
    const eventLogs = logsMap[event.id] || [];
    
    const currentlyInside = eventParticipants.filter(p => {
      const pLogs = eventLogs.filter(l => l.participantId === p.id);
      return pLogs.some(l => l.status === 'inside');
    }).length;

    return {
      ...event,
      totalParticipants: eventParticipants.length,
      currentlyInside,
      totalLogsCount: eventLogs.length
    };
  };

  // Selected event object lookup
  const selectedEvent = events.find(e => e.id === selectedEventId);
  const activeParticipants = selectedEventId ? (participantsMap[selectedEventId] || []) : [];
  const activeLogs = selectedEventId ? (logsMap[selectedEventId] || []) : [];

  if (isAuthenticated === null) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center font-sans">
        <div className="relative flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-600/20 text-emerald-500 flex items-center justify-center border border-emerald-500/20 animate-spin">
            <RefreshCw size={24} />
          </div>
          <span className="text-[10px] text-slate-500 font-black uppercase tracking-widest animate-pulse">SmartGate Sicurezza...</span>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginScreen onLoginSuccess={() => setIsAuthenticated(true)} />;
  }

  return (
    <div className="min-h-screen bg-[#F4F7FB] text-[#1E293B] font-sans flex flex-col">
      
      {/* Global Navigation Header Bar with Soft UI Shadow */}
      <header className="sticky top-0 z-30 bg-white border-b border-slate-100 px-6 py-4 flex items-center justify-between shadow-[0_2px_15px_rgba(0,0,0,0.015)]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-r from-[#36D1DC] to-[#5B86E5] flex items-center justify-center text-white font-black text-lg shadow-[0_4px_12px_rgba(91,134,229,0.25)]">
            SG
          </div>
          <div>
            <h1 className="text-base font-black text-[#1E293B] tracking-tight leading-none">SmartGate</h1>
            <span className="text-[10px] text-[#64748B] font-bold uppercase tracking-wider">Controllo Presenze Congressi</span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {selectedEventId && selectedEvent && (
            <div className="hidden md:flex items-center gap-2 bg-[#E8F3FF] border border-[#E8F3FF] rounded-xl px-3 py-1.5 text-xs">
              <span className="w-2 h-2 rounded-full bg-[#2589F5] animate-pulse" />
              <span className="text-[#2589F5] font-bold">Stazione attiva:</span>
              <span className="text-[#1E293B] font-black truncate max-w-xs">{selectedEvent.title}</span>
            </div>
          )}

          <button
            onClick={handleLogout}
            className="inline-flex items-center gap-1.5 px-4.5 py-2 border border-slate-200/80 hover:border-[#2589F5] hover:bg-[#E8F3FF]/40 rounded-full text-xs font-semibold text-[#64748B] hover:text-[#2589F5] cursor-pointer transition-all"
            title="Disconnetti in modo sicuro"
          >
            <LogOut size={14} />
            <span className="hidden sm:inline">Esci</span>
          </button>
        </div>
      </header>

      {/* Main Container Workspace */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 md:px-6 py-8">
        
        {!selectedEventId ? (
          
          /* VIEW 1: CONGRESS LIST DASHBOARD */
          <div className="space-y-6">
            
            {/* Dashboard Header banner with Pill action */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="space-y-1">
                <h2 className="text-2xl font-black text-[#1E293B] tracking-tight">Pannello di Controllo Congressi</h2>
                <p className="text-sm text-[#64748B] font-medium">Seleziona un evento attivo per registrare le presenze con penna laser o creane uno nuovo.</p>
              </div>
              <button
                onClick={() => setIsNewEventModalOpen(true)}
                className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-[#36D1DC] to-[#5B86E5] text-white font-bold text-xs uppercase tracking-wider rounded-full shadow-[0_4px_15px_rgba(91,134,229,0.3)] hover:opacity-95 transition-all cursor-pointer"
              >
                <Plus size={16} />
                <span>Nuovo Congresso</span>
              </button>
            </div>

            {/* List of Registered Congresses with Soft Rounded 2xl Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {events.map(event => {
                const stats = getEventWithStats(event);
                const start = formatToItalianDisplay(event.startDate);
                const end = formatToItalianDisplay(event.endDate);
                
                return (
                  <div 
                    key={event.id}
                    onClick={() => { setSelectedEventId(event.id); setActiveTab('control'); }}
                    className="bg-white border border-slate-100 rounded-2xl overflow-hidden hover:shadow-[0_12px_40px_rgba(0,0,0,0.035)] hover:border-[#E8F3FF] transition-all cursor-pointer group flex flex-col justify-between shadow-xs"
                  >
                    {/* Event Cover Image / Pattern */}
                    <div className="w-full aspect-[16/11] relative bg-[#F4F7FB] overflow-hidden shrink-0">
                      {event.image ? (
                        <img 
                           src={event.image} 
                           alt={event.title}
                           referrerPolicy="no-referrer"
                           className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-103"
                        />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-[#36D1DC] to-[#5B86E5] flex items-center justify-center relative p-4 text-center">
                          <BookOpen className="text-white/10 absolute -right-4 -bottom-4 rotate-12" size={80} />
                          <span className="text-white/60 text-[10px] font-black tracking-widest uppercase">SmartGate Congressi</span>
                        </div>
                      )}
                      
                      {/* Event Status and Delete/Edit Button overlays */}
                      <div className="absolute top-4 left-4 right-4 flex items-center justify-between z-10">
                        <span className="inline-flex items-center gap-1.5 text-[9px] bg-[#1E293B]/90 text-white font-black px-3 py-1.5 rounded-full uppercase backdrop-blur-xs">
                          {event.status === 'active' ? '● In Corso' : 'Archiviato'}
                        </span>
                        
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedEventId(event.id);
                              setIsEditEventModalOpen(true);
                            }}
                            className="p-2 bg-white text-[#64748B] hover:text-[#2589F5] rounded-xl shadow-xs hover:scale-105 transition-all cursor-pointer border border-slate-100 flex items-center justify-center"
                            title="Modifica questo congresso"
                          >
                            <Edit2 size={12} />
                          </button>
                          
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeletingEventId(event.id);
                            }}
                            className="p-2 bg-white text-[#64748B] hover:text-red-600 rounded-xl shadow-xs hover:scale-105 transition-all cursor-pointer border border-slate-100 flex items-center justify-center"
                            title="Elimina questo congresso"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="p-6 flex-1 flex flex-col justify-between space-y-4">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-[#64748B] text-[10px] font-bold uppercase tracking-wider">
                          <span className="truncate flex items-center gap-1 max-w-[50%]">
                            <MapPin size={12} className="shrink-0 text-[#2589F5]" />
                            <span className="truncate text-[#1E293B]">{event.location || 'Sede da definire'}</span>
                          </span>
                          <span className="flex items-center gap-1 shrink-0">
                            <Calendar size={12} className="shrink-0 text-[#2589F5]" />
                            <span className="text-[#1E293B]">{start === end ? start : `${start} - ${end}`}</span>
                          </span>
                        </div>

                        <h3 className="text-base font-black text-[#1E293B] group-hover:text-[#2589F5] transition-colors line-clamp-2 leading-snug">
                          {event.title}
                        </h3>
                      </div>

                      {/* Quick Analytics footer with soft styling */}
                      <div className="border-t border-slate-50 pt-4 flex items-center justify-between text-xs shrink-0">
                        <div className="flex items-center gap-5">
                          <div>
                            <span className="block text-[9px] font-bold text-[#64748B] uppercase tracking-wider">Iscritti</span>
                            <span className="font-extrabold text-slate-800 text-sm">{stats.totalParticipants}</span>
                          </div>
                          <div>
                            <span className="block text-[9px] font-bold text-[#64748B] uppercase tracking-wider">Presenti</span>
                            <span className="font-extrabold text-[#2589F5] text-sm">{stats.currentlyInside}</span>
                          </div>
                          <div>
                            <span className="block text-[9px] font-bold text-[#64748B] uppercase tracking-wider">Scansioni</span>
                            <span className="font-extrabold text-slate-600 text-sm">{stats.totalLogsCount}</span>
                          </div>
                        </div>

                        <div className="w-8 h-8 rounded-xl bg-[#F4F7FB] group-hover:bg-[#E8F3FF] text-[#64748B] group-hover:text-[#2589F5] flex items-center justify-center transition-all shrink-0">
                          <ChevronRight size={16} />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}

              {events.length === 0 && (
                <div className="col-span-1 md:col-span-2 bg-white border border-dashed border-slate-200 rounded-2xl py-20 text-center space-y-4 shadow-3xs">
                  <BookOpen className="mx-auto text-slate-300" size={48} />
                  <p className="text-sm text-[#64748B] font-semibold">Nessun congresso in memoria. Creane uno per iniziare!</p>
                  <button
                    onClick={() => setIsNewEventModalOpen(true)}
                    className="inline-flex items-center gap-1.5 text-xs text-[#2589F5] font-black hover:text-[#5B86E5] uppercase tracking-wider"
                  >
                    <span>Crea ora il tuo primo evento</span>
                    <ChevronRight size={14} />
                  </button>
                </div>
              )}
            </div>

          </div>
          
        ) : (
          
          /* VIEW 2: ACTIVE CONGRESS GATE CONTROL WORKSPACE */
          <div className="space-y-6">
            
            {/* Workspace Header breadcrumb */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5 border-b border-slate-100 pb-5">
              <div className="flex items-start gap-4">
                <button
                  onClick={() => setSelectedEventId(null)}
                  className="w-10 h-10 rounded-xl bg-white border border-slate-150 hover:border-[#2589F5] text-[#64748B] hover:text-[#2589F5] flex items-center justify-center shadow-xs transition-all cursor-pointer"
                  title="Torna all'elenco eventi"
                >
                  <ArrowLeft size={18} />
                </button>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] bg-[#E8F3FF] text-[#2589F5] font-bold px-2.5 py-1 rounded-full border border-[#E8F3FF] uppercase tracking-wider">
                      Gate Registrazione Presenze
                    </span>
                    <span className="text-xs text-[#64748B] font-semibold">ID: {selectedEvent?.id}</span>
                  </div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <h2 className="text-xl font-black text-[#1E293B] truncate max-w-md md:max-w-xl leading-snug">{selectedEvent?.title}</h2>
                    <button
                      onClick={() => setIsEditEventModalOpen(true)}
                      className="inline-flex items-center gap-1.5 text-[10px] bg-white hover:bg-[#E8F3FF]/40 text-[#64748B] hover:text-[#2589F5] font-bold px-3.5 py-1.5 rounded-full transition-all border border-slate-200 shadow-3xs shrink-0 cursor-pointer"
                      title="Modifica dati del congresso e lista iscritti"
                    >
                      <Edit2 size={11} />
                      <span>Modifica</span>
                    </button>
                  </div>
                  {selectedEvent?.location && (
                    <div className="flex items-center gap-1 text-[#64748B] text-xs mt-1.5">
                      <MapPin size={13} className="text-[#2589F5]" />
                      <span className="truncate font-semibold">{selectedEvent.location}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Action tabs selectors with Pill Style */}
              <div className="flex bg-[#E8F3FF] rounded-full p-1 border border-[#E8F3FF] self-start lg:self-center text-xs">
                <button
                  onClick={() => setActiveTab('control')}
                  className={`flex items-center gap-1.5 px-5 py-2.5 rounded-full font-bold uppercase tracking-wider text-[10px] transition-all ${
                    activeTab === 'control' ? 'bg-white text-[#2589F5] shadow-xs' : 'text-[#64748B] hover:text-[#1E293B]'
                  }`}
                >
                  <Activity size={13} />
                  <span>Scanner Laser & Console ({activeParticipants.length})</span>
                </button>
                <button
                  onClick={() => setActiveTab('reports')}
                  className={`flex items-center gap-1.5 px-5 py-2.5 rounded-full font-bold uppercase tracking-wider text-[10px] transition-all ${
                    activeTab === 'reports' ? 'bg-white text-[#2589F5] shadow-xs' : 'text-[#64748B] hover:text-[#1E293B]'
                  }`}
                >
                  <BarChart3 size={13} />
                  <span>Report & Storico</span>
                </button>
              </div>
            </div>

            {/* TAB CONTENTS */}
            <div className="transition-all duration-300">
              {activeTab === 'control' && (
                <ControlPanel
                  eventId={selectedEventId}
                  eventTitle={selectedEvent?.title}
                  eventDate={selectedEvent ? `${formatToItalianDisplay(selectedEvent.startDate)}${selectedEvent.endDate && selectedEvent.endDate !== selectedEvent.startDate ? ` - ${formatToItalianDisplay(selectedEvent.endDate)}` : ''}` : ''}
                  participants={activeParticipants}
                  logs={activeLogs}
                  minEcmHours={selectedEvent?.minEcmHours}
                  durationHours={selectedEvent?.durationHours}
                  onManualCheckIn={handleManualCheckIn}
                  onManualCheckOut={handleManualCheckOut}
                  onEditParticipant={handleEditParticipant}
                  onDeleteLog={handleDeleteLog}
                  onUpdateLogs={handleUpdateLogs}
                  onScan={handleScanBarcode}
                />
              )}

              {activeTab === 'reports' && (
                <ReportSection
                  eventId={selectedEventId}
                  eventTitle={selectedEvent?.title || ''}
                  participants={activeParticipants}
                  logs={activeLogs}
                  minEcmHours={selectedEvent?.minEcmHours}
                  durationHours={selectedEvent?.durationHours}
                  onClearLogs={handleClearLogs}
                  onDeleteLog={handleDeleteLog}
                />
              )}
            </div>

          </div>
        )}

      </main>

      {/* New Event Creation Modal Overlay */}
      <NewEventModal
        isOpen={isNewEventModalOpen}
        onClose={() => setIsNewEventModalOpen(false)}
        onSave={handleCreateEvent}
      />

      {/* Edit Event and Guest List Modal Overlay */}
      {selectedEvent && (
        <EditEventModal
          isOpen={isEditEventModalOpen}
          onClose={() => setIsEditEventModalOpen(false)}
          event={selectedEvent}
          participants={activeParticipants}
          onSave={handleUpdateEvent}
        />
      )}

      {/* Administrator Password Confirmation Dialog Modal */}
      {deletingEventId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 backdrop-blur-xs p-4">
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl overflow-hidden border border-slate-100 p-6 space-y-4">
            <div className="text-center space-y-2">
              <div className="w-12 h-12 rounded-full bg-red-50 text-red-600 flex items-center justify-center mx-auto">
                <Trash2 size={24} />
              </div>
              <h3 className="text-base font-black text-[#1E293B]">Cancellazione Protetta</h3>
              <p className="text-xs text-[#64748B] font-medium">Inserisci la password di amministratore per eliminare definitivamente questo evento e tutto il suo storico.</p>
            </div>
            
            <div className="space-y-2">
              <input
                type="password"
                placeholder="Password Amministratore"
                value={passwordInput}
                onChange={e => { setPasswordInput(e.target.value); setPasswordError(''); }}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-center text-slate-800 focus:outline-hidden focus:border-[#2589F5] focus:ring-4 focus:ring-[#2589F5]/10 transition-all font-mono"
              />
              {passwordError && (
                <p className="text-[10px] text-red-600 font-bold text-center">{passwordError}</p>
              )}
            </div>
            
            <div className="flex gap-2 text-xs font-bold uppercase tracking-wider">
              <button
                type="button"
                onClick={() => { setDeletingEventId(null); setPasswordInput(''); setPasswordError(''); }}
                className="flex-1 py-2.5 text-[#64748B] hover:text-[#1E293B] bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-full transition-colors cursor-pointer"
              >
                Annulla
              </button>
              <button
                type="button"
                onClick={() => {
                  const success = handleDeleteEvent(deletingEventId, passwordInput);
                  if (success) {
                    setDeletingEventId(null);
                    setPasswordInput('');
                    setPasswordError('');
                  } else {
                    setPasswordError('Password amministratore errata!');
                  }
                }}
                className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-full transition-colors cursor-pointer"
              >
                Conferma
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
