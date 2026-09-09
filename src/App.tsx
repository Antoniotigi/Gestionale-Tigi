import React, { useState, useEffect } from 'react';
import { Calendar, MapPin, Plus, ChevronRight, BookOpen, Clock, Users, LogIn, LogOut, FileSpreadsheet, ArrowLeft, RefreshCw, BarChart3, Activity, Trash2, Edit2 } from 'lucide-react';
import { Event, Participant, AttendanceLog, EventWithStats } from './types';
import NewEventModal from './components/NewEventModal';
import EditEventModal from './components/EditEventModal';
import ControlPanel from './components/ControlPanel';
import ReportSection from './components/ReportSection';

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
  const [events, setEvents] = useState<Event[]>([]);
  const [participantsMap, setParticipantsMap] = useState<Record<string, Participant[]>>({});
  const [logsMap, setLogsMap] = useState<Record<string, AttendanceLog[]>>({});
  
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'control' | 'reports'>('control');
  const [isNewEventModalOpen, setIsNewEventModalOpen] = useState(false);
  const [isEditEventModalOpen, setIsEditEventModalOpen] = useState(false);

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

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans flex flex-col">
      
      {/* Global Navigation Header Bar */}
      <header className="sticky top-0 z-30 bg-white border-b border-slate-100 px-6 py-4 flex items-center justify-between shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-700 flex items-center justify-center text-white font-bold text-lg shadow-sm">
            C
          </div>
          <div>
            <h1 className="text-base font-black text-slate-800 tracking-tight leading-none">SmartGate</h1>
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Controllo Presenze Congressi</span>
          </div>
        </div>

        {selectedEventId && selectedEvent && (
          <div className="hidden md:flex items-center gap-2 bg-slate-50 border border-slate-100 rounded-lg px-3 py-1 text-xs">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-slate-500 font-semibold">Stazione attiva:</span>
            <span className="text-slate-800 font-black truncate max-w-xs">{selectedEvent.title}</span>
          </div>
        )}
      </header>

      {/* Main Container Workspace */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 md:px-6 py-8">
        
        {!selectedEventId ? (
          
          /* VIEW 1: CONGRESS LIST DASHBOARD */
          <div className="space-y-6">
            
            {/* Dashboard Header banner */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h2 className="text-2xl font-black text-slate-800 tracking-tight">Pannello di Controllo Congressi</h2>
                <p className="text-sm text-slate-500">Seleziona un evento attivo per registrare le presenze con penna laser o creane uno nuovo.</p>
              </div>
              <button
                onClick={() => setIsNewEventModalOpen(true)}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white font-semibold text-sm rounded-xl shadow-sm hover:shadow-md transition-all cursor-pointer"
              >
                <Plus size={18} />
                <span>Nuovo Congresso</span>
              </button>
            </div>

            {/* List of Registered Congresses */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {events.map(event => {
                const stats = getEventWithStats(event);
                const start = formatToItalianDisplay(event.startDate);
                const end = formatToItalianDisplay(event.endDate);
                
                return (
                  <div 
                    key={event.id}
                    onClick={() => { setSelectedEventId(event.id); setActiveTab('control'); }}
                    className="bg-white border border-slate-150/80 rounded-xl overflow-hidden hover:shadow-md hover:border-slate-300 transition-all cursor-pointer group flex flex-col justify-between"
                  >
                    {/* Event Cover Image / Pattern */}
                    <div className="w-full aspect-[16/11] relative bg-slate-100 overflow-hidden shrink-0">
                      {event.image ? (
                        <img 
                          src={event.image} 
                          alt={event.title}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                        />
                      ) : (
                        <div className="w-full h-full bg-linear-to-br from-emerald-600 to-teal-800 flex items-center justify-center relative p-4 text-center">
                          <BookOpen className="text-white/10 absolute -right-4 -bottom-4 rotate-12" size={80} />
                          <span className="text-white/60 text-[10px] font-black tracking-widest uppercase">SmartGate Congressi</span>
                        </div>
                      )}
                      
                      {/* Event Status and Delete/Edit Button overlays */}
                      <div className="absolute top-3 left-3 right-3 flex items-center justify-between z-10">
                        <span className="inline-flex items-center gap-1 text-[9px] bg-slate-900/85 text-white font-black px-2.5 py-1 rounded-full uppercase backdrop-blur-xs">
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
                            className="p-1.5 bg-white text-slate-500 hover:text-emerald-700 rounded-lg shadow-sm hover:scale-105 transition-all cursor-pointer border border-slate-100 flex items-center justify-center"
                            title="Modifica questo congresso"
                          >
                            <Edit2 size={11} />
                          </button>
                          
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeletingEventId(event.id);
                            }}
                            className="p-1.5 bg-white text-slate-400 hover:text-red-600 rounded-lg shadow-sm hover:scale-105 transition-all cursor-pointer border border-slate-100 flex items-center justify-center"
                            title="Elimina questo congresso"
                          >
                            <Trash2 size={11} />
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-slate-400 text-[10px] font-black uppercase tracking-wider">
                          <span className="truncate flex items-center gap-1 max-w-[50%] font-semibold">
                            <MapPin size={11} className="shrink-0 text-slate-350" />
                            <span className="truncate">{event.location || 'Sede da definire'}</span>
                          </span>
                          <span className="flex items-center gap-1 shrink-0 font-semibold">
                            <Calendar size={11} className="shrink-0 text-slate-350" />
                            <span>{start === end ? start : `${start} - ${end}`}</span>
                          </span>
                        </div>

                        <h3 className="text-base font-black text-slate-800 group-hover:text-emerald-700 transition-colors line-clamp-2 leading-snug">
                          {event.title}
                        </h3>
                      </div>

                      {/* Quick Analytics footer */}
                      <div className="border-t border-slate-100 pt-3 flex items-center justify-between text-xs shrink-0">
                        <div className="flex items-center gap-4">
                          <div>
                            <span className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider">Iscritti</span>
                            <span className="font-extrabold text-slate-700">{stats.totalParticipants}</span>
                          </div>
                          <div>
                            <span className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider">Presenti</span>
                            <span className="font-extrabold text-emerald-700">{stats.currentlyInside}</span>
                          </div>
                          <div>
                            <span className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider">Scansioni</span>
                            <span className="font-extrabold text-slate-500">{stats.totalLogsCount}</span>
                          </div>
                        </div>

                        <div className="w-7 h-7 rounded-lg bg-slate-50 group-hover:bg-emerald-50 text-slate-400 group-hover:text-emerald-700 flex items-center justify-center transition-all shrink-0">
                          <ChevronRight size={14} />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}

              {events.length === 0 && (
                <div className="col-span-1 md:col-span-2 bg-white border border-dashed border-slate-200 rounded-xl py-16 text-center space-y-3">
                  <BookOpen className="mx-auto text-slate-350" size={40} />
                  <p className="text-sm text-slate-500 font-semibold">Nessun congresso in memoria. Creane uno per iniziare!</p>
                  <button
                    onClick={() => setIsNewEventModalOpen(true)}
                    className="inline-flex items-center gap-1.5 text-xs text-emerald-700 font-black hover:text-emerald-800"
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
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-150 pb-5">
              <div className="flex items-start gap-4">
                <button
                  onClick={() => setSelectedEventId(null)}
                  className="w-10 h-10 rounded-xl bg-white border border-slate-200 hover:border-slate-300 text-slate-500 hover:text-slate-800 flex items-center justify-center shadow-xs transition-colors cursor-pointer"
                  title="Torna all'elenco eventi"
                >
                  <ArrowLeft size={18} />
                </button>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] bg-emerald-50 text-emerald-700 font-bold px-2 py-0.5 rounded-full border border-emerald-150 uppercase">
                      Gate Registrazione Presenze
                    </span>
                    <span className="text-xs text-slate-400 font-semibold">ID: {selectedEvent?.id}</span>
                  </div>
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <h2 className="text-xl font-black text-slate-800 truncate max-w-md md:max-w-xl leading-snug">{selectedEvent?.title}</h2>
                    <button
                      onClick={() => setIsEditEventModalOpen(true)}
                      className="inline-flex items-center gap-1 text-[10px] bg-white hover:bg-slate-50 text-slate-600 hover:text-slate-800 font-black px-2.5 py-1 rounded-md transition-all border border-slate-200 shadow-3xs hover:shadow-2xs shrink-0 cursor-pointer"
                      title="Modifica dati del congresso e lista iscritti"
                    >
                      <Edit2 size={10} />
                      <span>Modifica</span>
                    </button>
                  </div>
                  {selectedEvent?.location && (
                    <div className="flex items-center gap-1 text-slate-400 text-xs mt-0.5">
                      <MapPin size={12} />
                      <span className="truncate font-semibold">{selectedEvent.location}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Action tabs selectors */}
              <div className="flex bg-slate-100 rounded-lg p-0.5 border border-slate-200 self-start md:self-center text-xs">
                <button
                  onClick={() => setActiveTab('control')}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-md font-semibold transition-all ${
                    activeTab === 'control' ? 'bg-white text-slate-800 shadow-xs' : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <Activity size={14} />
                  <span>Pannello Controllo & Scanner ({activeParticipants.length})</span>
                </button>
                <button
                  onClick={() => setActiveTab('reports')}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-md font-semibold transition-all ${
                    activeTab === 'reports' ? 'bg-white text-slate-800 shadow-xs' : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <BarChart3 size={14} />
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-sm bg-white rounded-xl shadow-xl overflow-hidden border border-slate-100 p-6 space-y-4">
            <div className="text-center space-y-2">
              <div className="w-12 h-12 rounded-full bg-red-50 text-red-600 flex items-center justify-center mx-auto">
                <Trash2 size={24} />
              </div>
              <h3 className="text-base font-black text-slate-800">Cancellazione Protetta</h3>
              <p className="text-xs text-slate-500">Inserisci la password di amministratore per eliminare definitivamente questo evento e tutto il suo storico.</p>
            </div>
            
            <div className="space-y-2">
              <input
                type="password"
                placeholder="Password Amministratore"
                value={passwordInput}
                onChange={e => { setPasswordInput(e.target.value); setPasswordError(''); }}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-center text-slate-800 focus:outline-hidden focus:border-slate-400 font-mono"
              />
              {passwordError && (
                <p className="text-[10px] text-red-600 font-bold text-center">{passwordError}</p>
              )}
            </div>
            
            <div className="flex gap-2 text-xs font-semibold">
              <button
                type="button"
                onClick={() => { setDeletingEventId(null); setPasswordInput(''); setPasswordError(''); }}
                className="flex-1 py-2 text-slate-500 hover:text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-250 rounded-lg transition-colors cursor-pointer"
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
                className="flex-1 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors cursor-pointer"
              >
                Conferma Elimina
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
