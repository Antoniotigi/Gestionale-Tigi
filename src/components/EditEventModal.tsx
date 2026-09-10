import React, { useState, useRef, useEffect } from 'react';
import { X, Upload, FileText, CheckCircle, AlertCircle, HelpCircle, Trash2, Plus, Search, Image as ImageIcon, Sparkles, Edit3, Save, Award, Clock } from 'lucide-react';
import { Event, Participant } from '../types';
import * as XLSX from 'xlsx';

interface EditEventModalProps {
  isOpen: boolean;
  onClose: () => void;
  event: Event;
  participants: Participant[];
  onSave: (updatedEvent: Event, updatedParticipants: Participant[]) => void;
}

const PRESET_COVERS = [
  {
    name: 'Sanità & Scienza',
    url: 'https://images.unsplash.com/photo-1576091160550-2173dba999ef?auto=format&fit=crop&w=600&q=80',
  },
  {
    name: 'Tecnologia & AI',
    url: 'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=600&q=80',
  },
  {
    name: 'Business & Leadership',
    url: 'https://images.unsplash.com/photo-1475721027785-f74eccf877e2?auto=format&fit=crop&w=600&q=80',
  },
  {
    name: 'Abstract Smeraldo',
    url: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=600&q=80',
  }
];

const parseItalianDate = (dateStr: string): string => {
  if (!dateStr) return '';
  const trimmed = dateStr.trim();
  const match = trimmed.match(/^(\d{1,2})[\.\/\-](\d{1,2})[\.\/\-](\d{4})$/);
  if (match) {
    const day = match[1].padStart(2, '0');
    const month = match[2].padStart(2, '0');
    const year = match[3];
    return `${year}-${month}-${day}`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }
  return trimmed;
};

const formatItalianDate = (dateStr: string): string => {
  if (!dateStr) return '';
  const trimmed = dateStr.trim();
  const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    const year = match[1];
    const month = match[2];
    const day = match[3];
    return `${day}.${month}.${year}`;
  }
  return trimmed;
};

const isInvalidItalianDate = (str: string): boolean => {
  if (!str) return false;
  const trimmed = str.trim();
  return !/^(\d{1,2})[\.\/\-](\d{1,2})[\.\/\-](\d{4})$/.test(trimmed) && !/^\d{4}-\d{2}-\d{2}$/.test(trimmed);
};

const compressImage = (base64Str: string, maxWidth = 600, maxHeight = 450, quality = 0.75): Promise<string> => {
  return new Promise((resolve) => {
    if (!base64Str || !base64Str.startsWith('data:image/')) {
      resolve(base64Str);
      return;
    }
    const img = new Image();
    img.src = base64Str;
    img.onload = () => {
      let width = img.width;
      let height = img.height;
      
      if (width > height) {
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
      } else {
        if (height > maxHeight) {
          width = Math.round((width * maxHeight) / height);
          height = maxHeight;
        }
      }
      
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(base64Str);
        return;
      }
      
      ctx.drawImage(img, 0, 0, width, height);
      const compressed = canvas.toDataURL('image/jpeg', quality);
      resolve(compressed);
    };
    img.onerror = () => {
      resolve(base64Str);
    };
  });
};

export default function EditEventModal({ isOpen, onClose, event, participants: initialParticipants, onSave }: EditEventModalProps) {
  const [title, setTitle] = useState(event.title);
  const [startDate, setStartDate] = useState(formatItalianDate(event.startDate));
  const [endDate, setEndDate] = useState(formatItalianDate(event.endDate));
  const [description, setDescription] = useState(event.description || '');
  const [location, setLocation] = useState(event.location || '');
  const [coverImage, setCoverImage] = useState(event.image || '');
  const [durationHours, setDurationHours] = useState<string>(String(event.durationHours || ''));
  const [minEcmHours, setMinEcmHours] = useState<string>(String(event.minEcmHours || ''));
  
  // Dynamic fields parsed from Excel
  const [dynamicFieldsConfig, setDynamicFieldsConfig] = useState<{ key: string; label: string }[]>(event.dynamicFieldsConfig || []);
  
  // Participant management states
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddManual, setShowAddManual] = useState(false);
  
  // Add new participant form states
  const [newId, setNewId] = useState('');
  const [newFirstName, setNewFirstName] = useState('');
  const [newLastName, setNewLastName] = useState('');
  const [newCompany, setNewCompany] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newCity, setNewCity] = useState('');
  const [newProfession, setNewProfession] = useState('');
  const [newDiscipline, setNewDiscipline] = useState('');
  const [newDynamic, setNewDynamic] = useState<Record<string, string>>({});
  const [addError, setAddError] = useState<string | null>(null);

  // Edit individual participant card (anagrafica)
  const [editingParticipant, setEditingParticipant] = useState<Participant | null>(null);
  const [editId, setEditId] = useState('');
  const [editFirstName, setEditFirstName] = useState('');
  const [editLastName, setEditLastName] = useState('');
  const [editCompany, setEditCompany] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editCity, setEditCity] = useState('');
  const [editProfession, setEditProfession] = useState('');
  const [editDiscipline, setEditDiscipline] = useState('');
  const [editDynamic, setEditDynamic] = useState<Record<string, string>>({});
  const [editError, setEditError] = useState<string | null>(null);

  // Excel Import States
  const [isDragging, setIsDragging] = useState(false);
  const [excelError, setExcelError] = useState<string | null>(null);
  const [excelSuccess, setExcelSuccess] = useState<string | null>(null);
  const [isAiAnalyzing, setIsAiAnalyzing] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<string[]>([]);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  // Sync state with selected event
  useEffect(() => {
    setTitle(event.title);
    setStartDate(formatItalianDate(event.startDate));
    setEndDate(formatItalianDate(event.endDate));
    setDescription(event.description || '');
    setLocation(event.location || '');
    setCoverImage(event.image || '');
    setDurationHours(String(event.durationHours || ''));
    setMinEcmHours(String(event.minEcmHours || ''));
    setDynamicFieldsConfig(event.dynamicFieldsConfig || []);
    setParticipants(initialParticipants);
    setAiSuggestions([]);
    setExcelError(null);
    setExcelSuccess(null);
    setEditingParticipant(null);
  }, [event, initialParticipants, isOpen]);

  if (!isOpen) return null;

  // Handle cover image upload & conversion to Base64 with compression
  const handleImageUpload = (file: File) => {
    if (!file.type.startsWith('image/')) {
      alert('Carica un file immagine valido (PNG, JPG, WebP).');
      return;
    }
    const reader = new FileReader();
    reader.onload = async (e) => {
      if (e.target?.result) {
        const rawBase64 = e.target.result as string;
        try {
          const compressed = await compressImage(rawBase64);
          setCoverImage(compressed);
        } catch (err) {
          setCoverImage(rawBase64);
        }
      }
    };
    reader.readAsDataURL(file);
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleImageUpload(file);
    }
  };

  // Add individual participant
  const handleAddParticipant = (e: React.FormEvent) => {
    e.preventDefault();
    setAddError(null);

    let cleanId = newId.trim().toUpperCase().replace(/[^A-Z0-9\-]/g, '');
    if (/^[1-9]$/.test(cleanId)) {
      cleanId = `0${cleanId}`;
    }
    if (!cleanId) {
      setAddError("ID Barcode non valido.");
      return;
    }

    if (!newFirstName.trim() || !newLastName.trim()) {
      setAddError("Nome e Cognome sono richiesti.");
      return;
    }

    if (participants.some(p => p.id === cleanId)) {
      setAddError(`Il codice ID "${cleanId}" è già associato a un altro partecipante.`);
      return;
    }

    const newParticipant: Participant = {
      id: cleanId,
      firstName: newFirstName.trim(),
      lastName: newLastName.trim(),
      company: newCompany.trim() || undefined,
      email: newEmail.trim() || undefined,
      phone: newPhone.trim() || undefined,
      city: newCity.trim() || undefined,
      profession: newProfession.trim() || undefined,
      discipline: newDiscipline.trim() || undefined,
      dynamicFields: Object.keys(newDynamic).length > 0 ? newDynamic : undefined
    };

    const merged = [...participants, newParticipant];
    merged.sort((a, b) => {
      const aNum = parseInt(a.id, 10);
      const bNum = parseInt(b.id, 10);
      if (!isNaN(aNum) && !isNaN(bNum)) {
        return aNum - bNum;
      }
      return a.id.localeCompare(b.id, undefined, { numeric: true, sensitivity: 'base' });
    });
    setParticipants(merged);
    
    // Reset form
    setNewId('');
    setNewFirstName('');
    setNewLastName('');
    setNewCompany('');
    setNewEmail('');
    setNewPhone('');
    setNewCity('');
    setNewProfession('');
    setNewDiscipline('');
    setNewDynamic({});
  };

  // Setup editing participant
  const startEditingParticipant = (p: Participant) => {
    setEditingParticipant(p);
    setEditId(p.id);
    setEditFirstName(p.firstName);
    setEditLastName(p.lastName);
    setEditCompany(p.company || '');
    setEditEmail(p.email || '');
    setEditPhone(p.phone || '');
    setEditCity(p.city || '');
    setEditProfession(p.profession || '');
    setEditDiscipline(p.discipline || '');
    setEditDynamic(p.dynamicFields || {});
    setEditError(null);
  };

  // Save edited participant (anagrafica)
  const handleSaveParticipantEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingParticipant) return;
    setEditError(null);

    let cleanId = editId.trim().toUpperCase().replace(/[^A-Z0-9\-]/g, '');
    if (/^[1-9]$/.test(cleanId)) {
      cleanId = `0${cleanId}`;
    }
    if (!cleanId) {
      setEditError("ID Barcode non valido.");
      return;
    }

    if (!editFirstName.trim() || !editLastName.trim()) {
      setEditError("Nome e Cognome sono richiesti.");
      return;
    }

    // Ensure ID is not duplicate unless it's the same participant
    if (cleanId !== editingParticipant.id && participants.some(p => p.id === cleanId)) {
      setEditError(`L'ID "${cleanId}" è già utilizzato da un altro partecipante.`);
      return;
    }

    const updatedParticipants = participants.map(p => {
      if (p.id === editingParticipant.id) {
        return {
          id: cleanId,
          firstName: editFirstName.trim(),
          lastName: editLastName.trim(),
          company: editCompany.trim() || undefined,
          email: editEmail.trim() || undefined,
          phone: editPhone.trim() || undefined,
          city: editCity.trim() || undefined,
          profession: editProfession.trim() || undefined,
          discipline: editDiscipline.trim() || undefined,
          dynamicFields: Object.keys(editDynamic).length > 0 ? editDynamic : undefined
        };
      }
      return p;
    });

    setParticipants(updatedParticipants);
    setEditingParticipant(null);
  };

  // Remove participant
  const handleDeleteParticipant = (id: string) => {
    setParticipants(participants.filter(p => p.id !== id));
  };

  // Excel Drag and drop processing
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const processExcelFile = (file: File, replace: boolean = false) => {
    setExcelError(null);
    setExcelSuccess(null);
    setAiSuggestions([]);
    setIsAiAnalyzing(true);
    
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        
        if (workbook.SheetNames.length === 0) {
          throw new Error("Il file Excel non contiene fogli di lavoro validi.");
        }
        
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const rawRows = XLSX.utils.sheet_to_json<any>(worksheet, { defval: '' });
        
        if (rawRows.length === 0) {
          throw new Error("Il foglio di lavoro selezionato è vuoto.");
        }
        
        const parsed: Participant[] = rawRows.map((row: any, idx: number) => {
          const findValue = (synonyms: string[]): string => {
            const keys = Object.keys(row);
            const matchedKey = keys.find(k => {
              const lowerK = k.toLowerCase().trim().replace(/[àá]/g, 'a').replace(/[èé]/g, 'e').replace(/[ìí]/g, 'i').replace(/[òó]/g, 'o').replace(/[ùú]/g, 'u');
              return synonyms.some(syn => {
                const lowerSyn = syn.toLowerCase().trim().replace(/[àá]/g, 'a').replace(/[èé]/g, 'e').replace(/[ìí]/g, 'i').replace(/[òó]/g, 'o').replace(/[ùú]/g, 'u');
                return lowerK === lowerSyn || lowerK.includes(lowerSyn);
              });
            });
            return matchedKey ? String(row[matchedKey]).trim() : '';
          };

          // Columns requested: n., Nome, Cognome, Email, Telefono, Città Lavoro, Ente di appartenenza, Professione, Disciplina
          let idVal = findValue(['n.', 'n', 'numero', 'id', 'barcode', 'codice']);
          if (!idVal) {
            idVal = String(idx + 1);
          } else {
            // Keep clean uppercase alphanumeric
            idVal = idVal.toUpperCase().replace(/[^A-Z0-9\-]/g, '');
          }
          if (/^[1-9]$/.test(idVal)) {
            idVal = `0${idVal}`;
          }

          const firstName = findValue(['nome', 'first name', 'firstname']);
          const lastName = findValue(['cognome', 'last name', 'lastname', 'surname']);
          const email = findValue(['email', 'e-mail', 'mail']);
          const phone = findValue(['telefono', 'phone', 'tel', 'cellulare']);
          const city = findValue(['città lavoro', 'citta lavoro', 'città', 'citta', 'city']);
          const company = findValue(['ente di appartenenza', 'ente', 'azienda', 'company', 'società', 'societa']);
          const profession = findValue(['professione', 'profession']);
          const discipline = findValue(['disciplina', 'discipline']);

          return {
            id: idVal,
            firstName: firstName || 'Iscritto',
            lastName: lastName || String(idx + 1),
            email: email || undefined,
            phone: phone || undefined,
            city: city || undefined,
            company: company || undefined,
            profession: profession || undefined,
            discipline: discipline || undefined
          };
        });

        if (replace) {
          const seenIds = new Set<string>();
          const uniqueParsed: Participant[] = [];
          parsed.forEach(p => {
            let checkId = p.id;
            let counter = 1;
            while (seenIds.has(checkId)) {
              checkId = `${p.id}-${counter}`;
              counter++;
            }
            seenIds.add(checkId);
            uniqueParsed.push({ ...p, id: checkId });
          });

          uniqueParsed.sort((a, b) => {
            const aNum = parseInt(a.id, 10);
            const bNum = parseInt(b.id, 10);
            if (!isNaN(aNum) && !isNaN(bNum)) {
              return aNum - bNum;
            }
            return a.id.localeCompare(b.id, undefined, { numeric: true, sensitivity: 'base' });
          });

          setParticipants(uniqueParsed);
          setExcelSuccess(`Foglio elaborato! Lista sostituita con successo. Caricati ${uniqueParsed.length} iscritti.`);
        } else {
          // Append & prevent duplicated IDs
          const existingIds = new Set(participants.map(p => p.id));
          const toAdd = parsed.filter(p => !existingIds.has(p.id));
          const duplicatesCount = parsed.length - toAdd.length;

          const seenIds = new Set<string>();
          const uniqueToAdd: Participant[] = [];
          toAdd.forEach(p => {
            let checkId = p.id;
            let counter = 1;
            while (existingIds.has(checkId) || seenIds.has(checkId)) {
              checkId = `${p.id}-${counter}`;
              counter++;
            }
            seenIds.add(checkId);
            uniqueToAdd.push({ ...p, id: checkId });
          });

          const merged = [...participants, ...uniqueToAdd];
          merged.sort((a, b) => {
            const aNum = parseInt(a.id, 10);
            const bNum = parseInt(b.id, 10);
            if (!isNaN(aNum) && !isNaN(bNum)) {
              return aNum - bNum;
            }
            return a.id.localeCompare(b.id, undefined, { numeric: true, sensitivity: 'base' });
          });

          setParticipants(merged);
          setExcelSuccess(
            `Foglio elaborato! Aggiunti ${uniqueToAdd.length} iscritti. ` + 
            (duplicatesCount > 0 ? `Saltati ${duplicatesCount} duplicati.` : '')
          );
        }
      } catch (err: any) {
        setExcelError(`Errore di elaborazione: ${err.message || err}`);
      } finally {
        setIsAiAnalyzing(false);
      }
    };
    
    reader.readAsArrayBuffer(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && (file.name.endsWith('.xlsx') || file.name.endsWith('.xls') || file.type.includes('spreadsheet') || file.type.includes('excel'))) {
      processExcelFile(file, false);
    } else {
      setExcelError('Carica solo fogli di calcolo Excel (.xlsx, .xls)');
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, replace: boolean) => {
    const file = e.target.files?.[0];
    if (file) {
      processExcelFile(file, replace);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Allow saving empty fields ("se manca qualche dato lascialo vuoto")
    const parsedStart = parseItalianDate(startDate);
    const parsedEnd = endDate ? parseItalianDate(endDate) : '';

    onSave({
      ...event,
      title: title.trim(),
      startDate: parsedStart,
      endDate: parsedEnd,
      description: description.trim() || undefined,
      location: location.trim() || undefined,
      image: coverImage || undefined,
      durationHours: durationHours ? Number(durationHours) : undefined,
      minEcmHours: minEcmHours ? Number(minEcmHours) : undefined,
      dynamicFieldsConfig: dynamicFieldsConfig.length > 0 ? dynamicFieldsConfig : undefined
    }, participants);

    onClose();
  };

  // Sort participants by ID as explicitly requested: "gli iscritti sono ordinati per ID"
  const filteredParticipants = participants
    .filter(p => {
      const fullText = `${p.lastName} ${p.firstName} ${p.id} ${p.company || ''}`.toLowerCase();
      return fullText.includes(searchTerm.toLowerCase());
    })
    .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true, sensitivity: 'base' }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 backdrop-blur-xs p-4">
      <div className="w-full max-w-5xl bg-white rounded-2xl shadow-2xl overflow-hidden border border-slate-100 flex flex-col h-[90vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <div>
            <h2 className="text-base font-black text-[#1E293B] uppercase tracking-tight flex items-center gap-2">
              <Sparkles className="text-[#2589F5] animate-pulse" size={18} />
              <span>Modifica Congresso e Iscritti</span>
            </h2>
            <p className="text-xs text-[#64748B] font-semibold">Aggiorna le informazioni generali, imposta l'anteprima, configura l'ECM e gestisci i registrati</p>
          </div>
          <button 
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors p-1.5 rounded-full hover:bg-slate-100"
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal content body */}
        <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-0">
          
          {/* Left Column: General Info and Image (5/12 cols) */}
          <div className="lg:col-span-5 space-y-5">
            
            {/* Event Info Card */}
            <div className="bg-[#F4F7FB]/50 border border-[#E8F3FF]/50 rounded-2xl p-4 space-y-4">
              <h3 className="text-[10px] font-black text-[#64748B] uppercase tracking-wider flex items-center gap-1">
                <span>Informazioni Generali</span>
              </h3>
              
              <div className="space-y-3">
                <div>
                  <label className="block text-[10px] font-black text-[#64748B] uppercase tracking-wider mb-1">Titolo dell'Evento</label>
                  <input
                    type="text"
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    className="w-full px-3.5 py-2 border border-slate-200 bg-white rounded-xl text-xs font-semibold focus:outline-hidden focus:border-[#2589F5] focus:ring-4 focus:ring-[#2589F5]/10 text-[#1E293B]"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-black text-[#64748B] uppercase tracking-wider mb-1">Data Inizio</label>
                    <input
                      type="text"
                      placeholder="GG.MM.AAAA"
                      value={startDate}
                      onChange={e => setStartDate(e.target.value)}
                      className={`w-full px-3.5 py-2 border rounded-xl text-xs font-semibold focus:outline-hidden text-[#1E293B] bg-white transition-colors ${startDate && isInvalidItalianDate(startDate) ? 'border-red-400 focus:border-red-500' : 'border-slate-200 focus:border-[#2589F5]'}`}
                    />
                    {startDate && isInvalidItalianDate(startDate) && (
                      <span className="text-[9px] text-red-500 font-bold block mt-0.5">Formato: GG.MM.AAAA</span>
                    )}
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-[#64748B] uppercase tracking-wider mb-1">Data Fine</label>
                    <input
                      type="text"
                      placeholder="GG.MM.AAAA"
                      value={endDate}
                      onChange={e => setEndDate(e.target.value)}
                      className={`w-full px-3.5 py-2 border rounded-xl text-xs font-semibold focus:outline-hidden text-[#1E293B] bg-white transition-colors ${endDate && isInvalidItalianDate(endDate) ? 'border-red-400 focus:border-red-500' : 'border-slate-200 focus:border-[#2589F5]'}`}
                    />
                    {endDate && isInvalidItalianDate(endDate) && (
                      <span className="text-[9px] text-red-500 font-bold block mt-0.5">Formato: GG.MM.AAAA</span>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-black text-[#64748B] uppercase tracking-wider mb-1">Luogo / Sede</label>
                    <input
                      type="text"
                      value={location}
                      onChange={e => setLocation(e.target.value)}
                      className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-hidden focus:border-[#2589F5] text-[#1E293B] bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-[#64748B] uppercase tracking-wider mb-1">Descrizione Breve</label>
                    <input
                      type="text"
                      value={description}
                      onChange={e => setDescription(e.target.value)}
                      className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-hidden focus:border-[#2589F5] text-[#1E293B] bg-white"
                    />
                  </div>
                </div>

                {/* ECM and Duration details */}
                <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-150">
                  <div>
                    <label className="block text-[10px] font-black text-[#64748B] uppercase tracking-wider mb-1 flex items-center gap-1">
                      <Clock size={11} className="text-slate-400" />
                      <span>Durata Evento (Ore)</span>
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      placeholder="Es: 12"
                      value={durationHours}
                      onChange={e => setDurationHours(e.target.value)}
                      className="w-full px-3.5 py-2 border border-slate-200 bg-white rounded-xl text-xs font-semibold focus:outline-hidden focus:border-[#2589F5] text-[#1E293B]"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-[#64748B] uppercase tracking-wider mb-1 flex items-center gap-1">
                      <Award size={11} className="text-amber-600" />
                      <span>Presenza Minima ECM (Ore)</span>
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      placeholder="Es: 10"
                      value={minEcmHours}
                      onChange={e => setMinEcmHours(e.target.value)}
                      className="w-full px-3.5 py-2 border border-slate-200 bg-white rounded-xl text-xs font-semibold focus:outline-hidden focus:border-[#2589F5] text-[#1E293B]"
                    />
                  </div>
                </div>

              </div>
            </div>

            {/* Photo Preview & Selection */}
            <div className="bg-[#F4F7FB]/50 border border-[#E8F3FF]/50 rounded-2xl p-4 space-y-3">
              <label className="block text-[10px] font-black text-[#64748B] uppercase tracking-wider">Foto di Anteprima (Copertina 16:11)</label>
              
              {coverImage ? (
                <div className="relative aspect-[16/11] rounded-2xl overflow-hidden border border-slate-200 group">
                  <img 
                    src={coverImage} 
                    alt="Anteprima" 
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" 
                    referrerPolicy="no-referrer" 
                  />
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      type="button"
                      onClick={() => setCoverImage('')}
                      className="px-3.5 py-1.5 bg-red-500 hover:bg-red-600 text-white text-[10px] font-bold rounded-full cursor-pointer"
                    >
                      Rimuovi Foto
                    </button>
                  </div>
                </div>
              ) : (
                <div className="aspect-[16/11] border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50/50 flex flex-col items-center justify-center text-center p-4">
                  <ImageIcon className="text-slate-400 mb-1" size={24} />
                  <span className="text-[11px] font-bold text-slate-700">Nessuna foto impostata</span>
                  <span className="text-[9px] text-slate-400">Verrà mostrato il gradiente predefinito</span>
                </div>
              )}

              <div className="grid grid-cols-1 gap-2">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => imageInputRef.current?.click()}
                    className="flex-1 py-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold rounded-full text-[10px] text-center cursor-pointer transition-colors"
                  >
                    Carica Foto
                  </button>
                  <input
                    ref={imageInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleImageChange}
                    className="hidden"
                  />
                  
                  <input
                    type="text"
                    placeholder="Incolla URL immagine..."
                    onChange={e => setCoverImage(e.target.value)}
                    className="flex-1 px-3 py-2 border border-slate-200 bg-white rounded-xl text-[10px] focus:outline-hidden focus:border-[#2589F5]"
                  />
                </div>

                {/* Cover Presets */}
                <div className="space-y-1">
                  <span className="block text-[8px] font-bold text-slate-400 uppercase tracking-widest">Seleziona un'immagine predefinita</span>
                  <div className="grid grid-cols-4 gap-1.5">
                    {PRESET_COVERS.map(cover => (
                      <button
                        key={cover.name}
                        type="button"
                        onClick={() => setCoverImage(cover.url)}
                        title={cover.name}
                        className="h-9 rounded-xl overflow-hidden border border-slate-200 hover:border-[#2589F5] hover:scale-105 transition-all relative group cursor-pointer"
                      >
                        <img src={cover.url} alt={cover.name} className="w-full h-full object-cover" />
                        <span className="absolute inset-0 bg-black/20 group-hover:bg-transparent" />
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Participant Management & Excel Area (7/12 cols) */}
          <div className="lg:col-span-7 flex flex-col h-full min-h-0 space-y-4">
            
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-black text-[#1E293B] uppercase tracking-wider">
                Gestione Lista Iscritti ({participants.length})
              </h3>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setShowAddManual(!showAddManual)}
                  className={`text-[10px] font-bold px-3.5 py-1.5 border rounded-full flex items-center gap-1 cursor-pointer transition-colors ${
                    showAddManual 
                      ? 'bg-slate-100 text-slate-700 border-slate-300' 
                      : 'bg-[#E8F3FF] text-[#2589F5] border-[#E8F3FF] hover:bg-[#E8F3FF]/80'
                  }`}
                >
                  <Plus size={12} />
                  <span>{showAddManual ? 'Nascondi Form' : 'Aggiungi Singolo'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm("Sei sicuro di voler svuotare interamente l'elenco di tutti gli iscritti? Questa azione eliminerà anche tutte le informazioni associate.")) {
                      setParticipants([]);
                      setExcelSuccess("Elenco iscritti svuotato con successo! Fai clic su 'Salva Modifiche' per confermare.");
                    }
                  }}
                  className="text-[10px] font-bold text-red-600 hover:text-red-700 hover:bg-red-50 border border-red-200 rounded-full px-3.5 py-1.5 flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <Trash2 size={12} />
                  <span>Svuota Elenco</span>
                </button>
              </div>
            </div>

            {/* Sub-section 1: Add individual registered person */}
            {showAddManual && (
              <form onSubmit={handleAddParticipant} className="bg-[#F4F7FB]/50 border border-[#E8F3FF]/50 rounded-2xl p-4 space-y-2.5 shadow-2xs">
                <span className="block text-[9px] font-black text-[#64748B] uppercase tracking-wider">Aggiungi Singolo Nominativo</span>
                <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
                  <input
                    type="text"
                    placeholder="ID Barcode (es. 05 o CONF-099)"
                    required
                    value={newId}
                    onChange={e => setNewId(e.target.value)}
                    className="px-3 py-2 border border-slate-200 rounded-xl text-xs font-mono focus:outline-hidden focus:border-[#2589F5] md:col-span-2 uppercase bg-white text-[#1E293B]"
                  />
                  <input
                    type="text"
                    placeholder="Nome"
                    required
                    value={newFirstName}
                    onChange={e => setNewFirstName(e.target.value)}
                    className="px-3 py-2 border border-slate-200 rounded-xl text-xs focus:outline-hidden focus:border-[#2589F5] bg-white text-[#1E293B]"
                  />
                  <input
                    type="text"
                    placeholder="Cognome"
                    required
                    value={newLastName}
                    onChange={e => setNewLastName(e.target.value)}
                    className="px-3 py-2 border border-slate-200 rounded-xl text-xs focus:outline-hidden focus:border-[#2589F5] bg-white text-[#1E293B]"
                  />
                  <button
                    type="submit"
                    className="bg-gradient-to-r from-[#36D1DC] to-[#5B86E5] text-white font-bold text-xs rounded-full px-4 py-2 flex items-center justify-center gap-1 cursor-pointer transition-colors"
                  >
                    <Plus size={12} />
                    <span>Aggiungi</span>
                  </button>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  <input
                    type="text"
                    placeholder="Ente / Azienda"
                    value={newCompany}
                    onChange={e => setNewCompany(e.target.value)}
                    className="px-3 py-2 border border-slate-200 rounded-xl text-xs focus:outline-hidden focus:border-[#2589F5] bg-white text-[#1E293B]"
                  />
                  <input
                    type="email"
                    placeholder="Email"
                    value={newEmail}
                    onChange={e => setNewEmail(e.target.value)}
                    className="px-3 py-2 border border-slate-200 rounded-xl text-xs focus:outline-hidden focus:border-[#2589F5] bg-white text-[#1E293B]"
                  />
                  <input
                    type="text"
                    placeholder="Telefono"
                    value={newPhone}
                    onChange={e => setNewPhone(e.target.value)}
                    className="px-3 py-2 border border-slate-200 rounded-xl text-xs focus:outline-hidden focus:border-[#2589F5] bg-white text-[#1E293B]"
                  />
                  <input
                    type="text"
                    placeholder="Città Lavoro"
                    value={newCity}
                    onChange={e => setNewCity(e.target.value)}
                    className="px-3 py-2 border border-slate-200 rounded-xl text-xs focus:outline-hidden focus:border-[#2589F5] bg-white text-[#1E293B]"
                  />
                  <input
                    type="text"
                    placeholder="Professione"
                    value={newProfession}
                    onChange={e => setNewProfession(e.target.value)}
                    className="px-3 py-2 border border-slate-200 rounded-xl text-xs focus:outline-hidden focus:border-[#2589F5] bg-white text-[#1E293B]"
                  />
                  <input
                    type="text"
                    placeholder="Disciplina"
                    value={newDiscipline}
                    onChange={e => setNewDiscipline(e.target.value)}
                    className="px-3 py-2 border border-slate-200 rounded-xl text-xs focus:outline-hidden focus:border-[#2589F5] bg-white text-[#1E293B]"
                  />
                </div>

                {/* Dynamic field entry for single insertion if they already exist */}
                {dynamicFieldsConfig.length > 0 && (
                  <div className="pt-2 border-t border-slate-150 grid grid-cols-2 md:grid-cols-3 gap-2">
                    {dynamicFieldsConfig.map(field => (
                      <div key={field.key}>
                        <label className="block text-[8px] font-black text-slate-400 uppercase mb-0.5">{field.label}</label>
                        <input
                          type="text"
                          placeholder={`Inserisci ${field.label}`}
                          value={newDynamic[field.key] || ''}
                          onChange={e => setNewDynamic({ ...newDynamic, [field.key]: e.target.value })}
                          className="w-full px-2 py-1 border border-slate-200 bg-white rounded-md text-[10px] focus:outline-hidden"
                        />
                      </div>
                    ))}
                  </div>
                )}

                {addError && (
                  <p className="text-[10px] text-red-600 font-semibold">{addError}</p>
                )}
              </form>
            )}

            {/* Sub-section 2: Integrated Excel Bulk Import Area */}
            <div className="bg-[#E8F3FF]/50 border border-[#E8F3FF] rounded-2xl p-4 space-y-3 shadow-2xs">
              <div className="space-y-1 text-[10px]">
                <p className="font-black text-[#2589F5] uppercase tracking-wider">Carica Lista Iscritti tramite Excel</p>
                <p className="text-[#64748B] font-medium">L'importatore rileva automaticamente le seguenti colonne (l'ordine non importa):</p>
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {['n.', 'Nome', 'Cognome', 'Email', 'Telefono', 'Città Lavoro', 'Ente di appartenenza', 'Professione', 'Disciplina'].map((col) => (
                    <span key={col} className="bg-white border border-slate-200 px-1.5 py-0.5 rounded font-mono font-bold text-slate-700 shadow-3xs">{col}</span>
                  ))}
                </div>
                <p className="text-slate-400 text-[9px] mt-1 italic">La colonna "n." diventa l'ID del barcode. I numeri da 1 a 9 avranno uno "0" davanti (es: "01", "02").</p>
              </div>

              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all flex flex-col justify-center items-center ${
                  isDragging ? 'border-[#2589F5] bg-[#E8F3FF]/30' : 'border-slate-200 hover:border-[#2589F5]/30 bg-white hover:bg-slate-50/50'
                }`}
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={(e) => handleFileChange(e, false)}
                  accept=".xlsx, .xls"
                  className="hidden"
                />
                <Upload className="text-[#2589F5] mb-1.5" size={20} />
                <span className="text-[10px] font-bold text-slate-700">Trascina o Seleziona il file Excel (.xlsx, .xls)</span>
                <span className="text-[8px] text-slate-400 mt-0.5">La lista verrà unita a quella esistente preservando gli ID</span>
              </div>
            </div>

            {excelError && (
              <div className="p-2 bg-red-50 border border-red-100 text-red-700 text-[10px] rounded-xl font-semibold flex items-center gap-2">
                <AlertCircle size={12} />
                <span>{excelError}</span>
              </div>
            )}
            {excelSuccess && (
              <div className="p-2 bg-[#E8F3FF] border border-[#E8F3FF] text-[#2589F5] text-[10px] rounded-xl font-semibold flex items-center gap-2">
                <CheckCircle size={12} />
                <span>{excelSuccess}</span>
              </div>
            )}

            {/* Sub-section 3: Search and Registered List Table */}
            <div className="flex-1 flex flex-col min-h-0 border border-slate-150 rounded-2xl overflow-hidden bg-white shadow-2xs">
              
              {/* List Search Bar */}
              <div className="p-2 border-b border-slate-100 bg-slate-50/50 flex items-center gap-2">
                <Search size={14} className="text-slate-400" />
                <input
                  type="text"
                  placeholder="Cerca iscritto per Cognome, Nome, ID..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="flex-1 text-xs bg-transparent border-0 focus:outline-hidden focus:ring-0 text-slate-700 font-semibold placeholder-slate-400"
                />
                <span className="text-[9px] font-black text-slate-500 uppercase bg-slate-200/70 px-1.5 py-0.5 rounded-sm">
                  {filteredParticipants.length} di {participants.length}
                </span>
              </div>

              {/* Table list */}
              <div className="flex-1 overflow-y-auto divide-y divide-slate-100 max-h-48">
                {filteredParticipants.map(p => (
                  <div key={p.id} className="p-2.5 flex items-center justify-between hover:bg-slate-50/50 transition-colors group">
                    <div className="min-w-0 pr-2">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-black text-slate-800 leading-tight">
                          {p.lastName} {p.firstName}
                        </span>
                        {p.company && (
                          <span className="text-[9px] bg-slate-100 text-slate-600 font-bold px-1.5 py-0.2 rounded-sm truncate max-w-[120px]">
                            {p.company}
                          </span>
                        )}
                      </div>
                      
                      {/* Barcode & Email Row */}
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5 text-[9px] font-medium text-slate-400">
                        <span>Barcode: <strong className="font-mono text-slate-600 bg-slate-100 px-1 rounded-sm">{p.id}</strong></span>
                        {p.email && <span>• Email: {p.email}</span>}
                        
                        {/* Dynamic custom columns rendered nicely on index card list */}
                        {p.dynamicFields && Object.entries(p.dynamicFields).map(([key, val]) => {
                          const config = dynamicFieldsConfig.find(f => f.key === key);
                          if (!val) return null;
                          return (
                            <span key={key} className="text-[8px] bg-indigo-50/70 text-indigo-700 border border-indigo-100/50 px-1 rounded-sm">
                              {config?.label || key}: {val}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                    
                    {/* Action buttons (Edit & Delete) */}
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={() => startEditingParticipant(p)}
                        className="p-1.5 text-slate-400 hover:text-indigo-600 rounded-md hover:bg-indigo-50 transition-colors cursor-pointer"
                        title="Modifica anagrafica e campi personalizzati"
                      >
                        <Edit3 size={11} />
                      </button>
                      
                      <button
                        type="button"
                        onClick={() => handleDeleteParticipant(p.id)}
                        className="p-1.5 text-slate-350 hover:text-red-600 rounded-md hover:bg-red-50 transition-colors cursor-pointer"
                        title="Elimina questo partecipante dall'evento"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  </div>
                ))}

                {filteredParticipants.length === 0 && (
                  <div className="py-8 text-center text-xs text-slate-400 italic">Nessun iscritto trovato.</div>
                )}
              </div>

            </div>

          </div>

        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50/30">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 text-xs font-semibold text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-full transition-all border border-slate-200 cursor-pointer"
          >
            Chiudi ed Annulla
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            className="px-6 py-2.5 text-xs font-bold text-white bg-gradient-to-r from-[#36D1DC] to-[#5B86E5] rounded-full shadow-[0_4px_12px_rgba(91,134,229,0.25)] hover:shadow-md transition-all cursor-pointer flex items-center gap-1.5 uppercase tracking-wider"
          >
            <span>Salva Modifiche</span>
          </button>
        </div>

      </div>

      {/* SUB-MODAL: Modifica Anagrafica Partecipante (Standard & Dynamic Extra columns) */}
      {editingParticipant && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-150 overflow-hidden flex flex-col max-h-[90vh]">
            
            <div className="flex items-center justify-between px-5 py-3.5 bg-slate-50 border-b border-slate-150">
              <div className="flex items-center gap-2">
                <Edit3 size={14} className="text-[#2589F5]" />
                <h3 className="text-xs font-black text-[#1E293B] uppercase tracking-tight">Modifica Anagrafica Partecipante</h3>
              </div>
              <button 
                type="button"
                onClick={() => setEditingParticipant(null)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-full"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSaveParticipantEdit} className="p-5 space-y-4 overflow-y-auto text-xs font-semibold text-[#64748B]">
              
              <div className="space-y-3">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">Barcode ID (Univoco) *</label>
                  <input
                    type="text"
                    required
                    value={editId}
                    onChange={e => setEditId(e.target.value)}
                    className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-xs font-mono uppercase bg-slate-50 text-[#1E293B]"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">Nome *</label>
                    <input
                      type="text"
                      required
                      value={editFirstName}
                      onChange={e => setEditFirstName(e.target.value)}
                      className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-[#1E293B] bg-white focus:outline-hidden focus:border-[#2589F5]"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">Cognome *</label>
                    <input
                      type="text"
                      required
                      value={editLastName}
                      onChange={e => setEditLastName(e.target.value)}
                      className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-[#1E293B] bg-white focus:outline-hidden focus:border-[#2589F5]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">Ente / Azienda</label>
                    <input
                      type="text"
                      value={editCompany}
                      onChange={e => setEditCompany(e.target.value)}
                      className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-[#1E293B] bg-white focus:outline-hidden focus:border-[#2589F5]"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">Email</label>
                    <input
                      type="email"
                      value={editEmail}
                      onChange={e => setEditEmail(e.target.value)}
                      className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-[#1E293B] bg-white focus:outline-hidden focus:border-[#2589F5]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">Telefono</label>
                    <input
                      type="text"
                      value={editPhone}
                      onChange={e => setEditPhone(e.target.value)}
                      className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-[#1E293B] bg-white focus:outline-hidden focus:border-[#2589F5]"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">Città Lavoro</label>
                    <input
                      type="text"
                      value={editCity}
                      onChange={e => setEditCity(e.target.value)}
                      className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-[#1E293B] bg-white focus:outline-hidden focus:border-[#2589F5]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">Professione</label>
                    <input
                      type="text"
                      value={editProfession}
                      onChange={e => setEditProfession(e.target.value)}
                      className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-[#1E293B] bg-white focus:outline-hidden focus:border-[#2589F5]"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">Disciplina</label>
                    <input
                      type="text"
                      value={editDiscipline}
                      onChange={e => setEditDiscipline(e.target.value)}
                      className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-[#1E293B] bg-white focus:outline-hidden focus:border-[#2589F5]"
                    />
                  </div>
                </div>
              </div>

              {editError && (
                <p className="text-[10px] text-red-600 font-semibold">{editError}</p>
              )}

              <div className="pt-4 border-t border-slate-150 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingParticipant(null)}
                  className="px-4 py-2 text-xs text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-full border border-slate-200 transition-colors"
                >
                  Annulla
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs text-white bg-gradient-to-r from-[#36D1DC] to-[#5B86E5] rounded-full shadow-[0_4px_12px_rgba(91,134,229,0.25)] flex items-center gap-1 font-bold"
                >
                  <Save size={12} />
                  <span>Salva Scheda</span>
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

    </div>
  );
}
