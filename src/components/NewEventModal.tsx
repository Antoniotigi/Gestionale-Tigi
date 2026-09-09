import React, { useState, useRef } from 'react';
import { X, Upload, FileText, CheckCircle, AlertCircle, HelpCircle, Image as ImageIcon, Sparkles, Clock, Award } from 'lucide-react';
import { Event, Participant } from '../types';
import * as XLSX from 'xlsx';

interface NewEventModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (eventData: Omit<Event, 'id' | 'createdAt'>, participants: Participant[]) => void;
}

const DEMO_PARTICIPANTS: Participant[] = [
  { id: 'CONF-001', firstName: 'Alessandro', lastName: 'Rossi', email: 'alessandro.rossi@email.it', company: 'Tech Innovation S.r.l.', notes: 'Relatore' },
  { id: 'CONF-002', firstName: 'Sofia', lastName: 'Bianchi', email: 'sofia.bianchi@email.it', company: 'Digital Solutions', notes: 'Partecipante' },
  { id: 'CONF-003', firstName: 'Matteo', lastName: 'Ferrari', email: 'm.ferrari@enterprise.com', company: 'Ferrari Consulting', notes: 'Sponsor' },
  { id: 'CONF-004', firstName: 'Giulia', lastName: 'Russo', email: 'giulia.rossi@unipr.it', company: 'Università degli Studi', notes: 'Partecipante' },
  { id: 'CONF-005', firstName: 'Lorenzo', lastName: 'Marino', email: 'lorenzo.marino@designhub.io', company: 'Design Hub Studio', notes: 'Relatore' },
  { id: 'CONF-006', firstName: 'Emma', lastName: 'Gallo', email: 'emma.gallo@futurelab.org', company: 'Future Lab S.p.A.', notes: 'Partecipante' }
];

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

export default function NewEventModal({ isOpen, onClose, onSave }: NewEventModalProps) {
  const [title, setTitle] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [image, setImage] = useState('');
  const [durationHours, setDurationHours] = useState('');
  const [minEcmHours, setMinEcmHours] = useState('');
  
  const [inputMode, setInputMode] = useState<'excel' | 'paste' | 'demo'>('excel');
  const [pastedList, setPastedList] = useState('');
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [dynamicFieldsConfig, setDynamicFieldsConfig] = useState<{ key: string; label: string }[]>([]);
  
  const [isDragging, setIsDragging] = useState(false);
  const [excelError, setExcelError] = useState<string | null>(null);
  const [excelSuccess, setExcelSuccess] = useState<string | null>(null);
  const [isAiAnalyzing, setIsAiAnalyzing] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<string[]>([]);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleImageUpload = (file: File) => {
    if (!file.type.startsWith('image/')) {
      alert('Carica un file immagine valido (PNG, JPG, WebP).');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      if (e.target?.result) {
        setImage(e.target.result as string);
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

  // Excel Drag and drop processing
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const processExcelFile = (file: File) => {
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

        // Deduplicate and sort by ID
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
        setExcelSuccess(`Foglio elaborato con successo! Caricati ${uniqueParsed.length} iscritti.`);
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
      processExcelFile(file);
    } else {
      setExcelError('Carica solo fogli di calcolo Excel (.xlsx, .xls)');
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processExcelFile(file);
    }
  };

  const handlePasteProcess = () => {
    if (!pastedList.trim()) return;
    const lines = pastedList.split('\n').map(l => l.trim()).filter(Boolean);
    const parsed: Participant[] = lines.map((line, idx) => {
      const isSemicolon = line.includes(';');
      const isTab = line.includes('\t');
      
      if (isSemicolon || isTab) {
        const parts = line.split(isSemicolon ? ';' : '\t').map(p => p.trim());
        const id = parts[0] ? parts[0].toUpperCase().replace(/[^0-9A-Z\-]/g, '') : `P-${2000 + idx}`;
        return {
          id,
          firstName: parts[1] || 'Partecipante',
          lastName: parts[2] || String(idx + 1),
          company: parts[3] || '',
          email: parts[4] || ''
        };
      } else {
        const parts = line.split(/\s+/);
        const firstName = parts[0] || 'Partecipante';
        const lastName = parts.slice(1).join(' ') || String(idx + 1);
        const cleanId = `${firstName.substring(0, 3).toUpperCase()}${lastName.substring(0, 3).toUpperCase()}-${100 + idx}`;
        return {
          id: cleanId.replace(/[^0-9A-Z\-]/g, ''),
          firstName,
          lastName
        };
      }
    });

    setParticipants(parsed);
    setExcelError(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !startDate) return;

    if (isInvalidItalianDate(startDate) || (endDate && isInvalidItalianDate(endDate))) {
      alert("Inserisci le date nel formato corretto: GG.MM.AAAA (es. 08.09.2026)");
      return;
    }

    const parsedStart = parseItalianDate(startDate);
    const parsedEnd = endDate ? parseItalianDate(endDate) : parsedStart;

    if (inputMode === 'paste') {
      handlePasteProcess();
    }

    onSave({
      title,
      startDate: parsedStart,
      endDate: parsedEnd,
      description,
      location,
      image: image || undefined,
      status: 'active',
      durationHours: durationHours ? Number(durationHours) : undefined,
      minEcmHours: minEcmHours ? Number(minEcmHours) : undefined,
      dynamicFieldsConfig: dynamicFieldsConfig.length > 0 ? dynamicFieldsConfig : undefined
    }, participants);

    // Reset state
    setTitle('');
    setStartDate('');
    setEndDate('');
    setDescription('');
    setLocation('');
    setImage('');
    setDurationHours('');
    setMinEcmHours('');
    setParticipants([]);
    setDynamicFieldsConfig([]);
    setAiSuggestions([]);
    setExcelError(null);
    setExcelSuccess(null);
    onClose();
  };

  // Sort participants by ID as explicitly requested
  const sortedParticipants = [...participants].sort((a, b) => 
    a.id.localeCompare(b.id, undefined, { numeric: true, sensitivity: 'base' })
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
      <div className="w-full max-w-2xl bg-white rounded-xl shadow-xl overflow-hidden border border-slate-100 flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <h2 className="text-sm font-black text-slate-800 uppercase tracking-tight flex items-center gap-1.5">
            <Sparkles className="text-emerald-700 animate-pulse" size={16} />
            <span>Crea Nuovo Congresso</span>
          </h2>
          <button 
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors p-1.5 rounded-lg hover:bg-slate-100"
          >
            <X size={20} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
          
          {/* Base Info Section */}
          <div className="space-y-3.5 bg-slate-50/40 border border-slate-150 p-4 rounded-xl">
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Informazioni Generali</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              <div className="md:col-span-2">
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1">Titolo dell'Evento *</label>
                <input
                  type="text"
                  required
                  placeholder="Es. 45° Congresso Nazionale di Cardiologia"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  className="w-full px-3 py-1.5 border border-slate-200 bg-white rounded-lg text-xs font-semibold focus:outline-hidden text-slate-800"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1">Data Inizio *</label>
                <input
                  type="text"
                  required
                  placeholder="GG.MM.AAAA"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                  className={`w-full px-3 py-1.5 border rounded-lg text-xs font-semibold focus:outline-hidden text-slate-800 bg-white transition-colors ${startDate && isInvalidItalianDate(startDate) ? 'border-red-400 focus:border-red-500' : 'border-slate-200'}`}
                />
                {startDate && isInvalidItalianDate(startDate) && (
                  <span className="text-[9px] text-red-500 font-bold block mt-0.5">Formato richiesto: GG.MM.AAAA (es. 08.09.2026)</span>
                )}
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1">Data Fine (Opzionale)</label>
                <input
                  type="text"
                  placeholder="GG.MM.AAAA"
                  value={endDate}
                  onChange={e => setEndDate(e.target.value)}
                  className={`w-full px-3 py-1.5 border rounded-lg text-xs font-semibold focus:outline-hidden text-slate-800 bg-white transition-colors ${endDate && isInvalidItalianDate(endDate) ? 'border-red-400 focus:border-red-500' : 'border-slate-200'}`}
                />
                {endDate && isInvalidItalianDate(endDate) && (
                  <span className="text-[9px] text-red-500 font-bold block mt-0.5">Formato richiesto: GG.MM.AAAA (es. 10.09.2026)</span>
                )}
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1">Luogo / Sede</label>
                <input
                  type="text"
                  placeholder="Es. Centro Congressi Stella, Roma"
                  value={location}
                  onChange={e => setLocation(e.target.value)}
                  className="w-full px-3 py-1.5 border border-slate-200 bg-white rounded-lg text-xs font-semibold focus:outline-hidden text-slate-800"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1">Descrizione Breve</label>
                <input
                  type="text"
                  placeholder="Es. Focus sulle nuove frontiere tecnologiche"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  className="w-full px-3 py-1.5 border border-slate-200 bg-white rounded-lg text-xs font-semibold focus:outline-hidden text-slate-800"
                />
              </div>

              {/* ECM Hours & Duration */}
              <div className="md:col-span-2 pt-2 border-t border-slate-150 grid grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1">
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
                    className="w-full px-3 py-1.5 border border-slate-200 bg-white rounded-lg text-xs font-semibold focus:outline-hidden text-slate-800"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1">
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
                    className="w-full px-3 py-1.5 border border-slate-200 bg-white rounded-lg text-xs font-semibold focus:outline-hidden text-slate-800"
                  />
                </div>
              </div>

              <div className="md:col-span-2 border-t border-slate-150 pt-3.5 space-y-3">
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider">Foto di Anteprima (Copertina 16:11)</label>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Photo Preview & Upload box */}
                  <div className="md:col-span-1 aspect-[16/11] border border-slate-200 rounded-xl bg-slate-50 overflow-hidden relative group flex items-center justify-center">
                    {image ? (
                      <>
                        <img src={image} alt="Preview" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            type="button"
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setImage(''); }}
                            className="px-2.5 py-1 bg-red-600 hover:bg-red-700 text-white text-[10px] font-bold rounded-lg cursor-pointer"
                          >
                            Rimuovi
                          </button>
                        </div>
                      </>
                    ) : (
                      <div 
                        onClick={(e) => { e.preventDefault(); coverInputRef.current?.click(); }}
                        className="flex flex-col items-center justify-center cursor-pointer p-4 text-center hover:bg-slate-100/50 w-full h-full transition-colors"
                      >
                        <ImageIcon className="text-slate-400 mb-1" size={20} />
                        <span className="text-[10px] font-bold text-slate-700">Carica Foto</span>
                        <span className="text-[8px] text-slate-400">Clicca o trascina</span>
                      </div>
                    )}
                    <input
                      ref={coverInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleImageChange}
                      className="hidden"
                    />
                  </div>

                  {/* Presets Grid */}
                  <div className="md:col-span-2 flex flex-col justify-between">
                    <div className="space-y-1">
                      <span className="block text-[8px] font-bold text-slate-400 uppercase tracking-widest">Scegli una copertina professionale predefinita</span>
                      <div className="grid grid-cols-4 gap-2">
                        {PRESET_COVERS.map(cover => (
                          <button
                            key={cover.name}
                            type="button"
                            onClick={() => setImage(cover.url)}
                            title={cover.name}
                            className="h-12 rounded-lg overflow-hidden border border-slate-200 hover:border-emerald-500 hover:scale-105 transition-all relative group cursor-pointer"
                          >
                            <img src={cover.url} alt={cover.name} className="w-full h-full object-cover" />
                            <span className="absolute inset-0 bg-black/10 group-hover:bg-transparent" />
                          </button>
                        ))}
                      </div>
                    </div>

                    <input
                      type="text"
                      placeholder="Incolla l'URL di un'immagine esterna..."
                      value={image.startsWith('data:') ? '' : image}
                      onChange={e => setImage(e.target.value)}
                      className="w-full px-3 py-1.5 border border-slate-200 bg-white rounded-lg text-xs font-semibold focus:outline-hidden"
                    />
                  </div>
                </div>
              </div>

            </div>
          </div>

          {/* Registrations Input Methods */}
          <div className="space-y-3.5 bg-slate-50/40 border border-slate-150 p-4 rounded-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Metodo Inserimento Iscritti</h3>
              
              <div className="flex gap-1.5 bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                <button
                  type="button"
                  onClick={() => setInputMode('demo')}
                  className={`px-2.5 py-1 text-[9px] font-black uppercase rounded-md transition-all cursor-pointer ${inputMode === 'demo' ? 'bg-white text-slate-800 shadow-xs' : 'text-slate-500 hover:text-slate-800'}`}
                >
                  Demo
                </button>
                <button
                  type="button"
                  onClick={() => setInputMode('excel')}
                  className={`px-2.5 py-1 text-[9px] font-black uppercase rounded-md transition-all cursor-pointer ${inputMode === 'excel' ? 'bg-white text-slate-800 shadow-xs' : 'text-slate-500 hover:text-slate-800'}`}
                >
                  Excel
                </button>
                <button
                  type="button"
                  onClick={() => setInputMode('paste')}
                  className={`px-2.5 py-1 text-[9px] font-black uppercase rounded-md transition-all cursor-pointer ${inputMode === 'paste' ? 'bg-white text-slate-800 shadow-xs' : 'text-slate-500 hover:text-slate-800'}`}
                >
                  Incolla
                </button>
              </div>
            </div>

            {/* DEMO mode info */}
            {inputMode === 'demo' && (
              <div className="p-3 bg-white border border-slate-150 rounded-xl space-y-1">
                <p className="text-xs font-bold text-slate-700">Utilizza i partecipanti Demo predefiniti</p>
                <p className="text-[10px] text-slate-400 font-semibold">Genera automaticamente una lista iniziale di 6 iscritti professionisti per testare subito il sistema scanner.</p>
              </div>
            )}

            {/* EXCEL import with deterministic processing */}
            {inputMode === 'excel' && (
              <div className="bg-emerald-50/40 border border-emerald-150 rounded-xl p-3.5 space-y-3 shadow-2xs">
                <div className="space-y-1 text-[10px]">
                  <p className="font-black text-emerald-855 uppercase tracking-wider">Carica Lista Iscritti tramite Excel</p>
                  <p className="text-slate-600 font-medium">L'importatore rileva automaticamente le seguenti colonne (l'ordine non importa):</p>
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
                  className={`border border-dashed rounded-xl p-4 text-center cursor-pointer transition-all flex flex-col justify-center items-center ${
                    isDragging ? 'border-emerald-500 bg-emerald-50/20' : 'border-slate-200 hover:border-slate-350 bg-white hover:bg-slate-50/50'
                  }`}
                >
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    accept=".xlsx, .xls"
                    className="hidden"
                  />
                  <Upload className="text-emerald-700 mb-1" size={18} />
                  <span className="text-[10px] font-bold text-slate-700">Trascina o Seleziona il file Excel (.xlsx, .xls)</span>
                  <span className="text-[8px] text-slate-400 mt-0.5">Verrà creata la lista iniziale degli iscritti</span>
                </div>

                {excelError && (
                  <div className="p-2 bg-red-50 border border-red-100 text-red-700 text-[10px] rounded-lg font-semibold flex items-center gap-2">
                    <AlertCircle size={12} />
                    <span>{excelError}</span>
                  </div>
                )}
                {excelSuccess && (
                  <div className="p-2 bg-emerald-50 border border-emerald-100 text-emerald-800 text-[10px] rounded-lg font-semibold flex items-center gap-2">
                    <CheckCircle size={12} />
                    <span>{excelSuccess}</span>
                  </div>
                )}
              </div>
            )}

            {/* PASTE list area */}
            {inputMode === 'paste' && (
              <div className="space-y-2">
                <label className="block text-[10px] font-black text-slate-400 uppercase">Incolla lista partecipanti</label>
                <textarea
                  rows={4}
                  placeholder={`Un partecipante per riga, esempio:&#10;BARCODE;Nome;Cognome;Azienda;Email&#10;CONF-099;Giacomo;Mazzini;G-Tech;giacomo@gtech.it`}
                  value={pastedList}
                  onChange={e => setPastedList(e.target.value)}
                  onBlur={handlePasteProcess}
                  className="w-full px-3 py-2 border border-slate-200 bg-white rounded-lg text-xs font-mono focus:outline-hidden"
                />
                <p className="text-[9px] text-slate-400 font-medium">Puoi incollare direttamente righe separate da punto e virgola (;) o tabulazioni.</p>
              </div>
            )}

            {/* Current loaded participants visual overview */}
            {participants.length > 0 && (
              <div className="border border-slate-150 rounded-xl overflow-hidden bg-white shadow-2xs">
                <div className="px-3 py-1.5 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                  <span className="text-[10px] font-black text-slate-500 uppercase">Iscritti Pronti per il Caricamento ({participants.length})</span>
                  <span className="text-[9px] font-semibold text-slate-400">Ordinati per ID</span>
                </div>
                <div className="max-h-28 overflow-y-auto divide-y divide-slate-100 p-1">
                  {sortedParticipants.slice(0, 20).map((p, idx) => (
                    <div key={idx} className="p-1.5 flex items-center justify-between text-[10px]">
                      <span className="font-bold text-slate-800">{p.lastName} {p.firstName}</span>
                      <span className="font-mono text-slate-500 bg-slate-100 px-1 rounded-sm">ID: {p.id}</span>
                    </div>
                  ))}
                  {participants.length > 20 && (
                    <div className="p-1.5 text-center text-[9px] text-slate-400 italic">E altri {participants.length - 20} partecipanti...</div>
                  )}
                </div>
              </div>
            )}

          </div>

          {/* Footer Action Buttons */}
          <div className="pt-4 border-t border-slate-150 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-all cursor-pointer"
            >
              Annulla
            </button>
            <button
              type="submit"
              disabled={!title.trim() || !startDate}
              className="px-5 py-2 text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 rounded-lg shadow-xs hover:shadow-sm transition-all cursor-pointer flex items-center gap-1.5"
            >
              <CheckCircle size={12} />
              <span>Crea Evento</span>
            </button>
          </div>

        </form>

      </div>
    </div>
  );
}
