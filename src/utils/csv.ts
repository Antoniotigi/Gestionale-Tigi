import { Participant, AttendanceLog } from '../types';

/**
 * Parses a CSV string containing participant details.
 * Supports comma (,), semicolon (;), and tab (\t) separators.
 * Automatically attempts to detect header names (ID, Nome, Cognome, Email, Azienda).
 */
export function parseParticipantsCSV(csvText: string): Participant[] {
  if (!csvText || !csvText.trim()) return [];

  const lines = csvText.split(/\r?\n/).map(line => line.trim()).filter(line => line.length > 0);
  if (lines.length === 0) return [];

  // Detect separator based on first line
  const firstLine = lines[0];
  let separator = ',';
  const commaCount = (firstLine.match(/,/g) || []).length;
  const semicolonCount = (firstLine.match(/;/g) || []).length;
  const tabCount = (firstLine.match(/\t/g) || []).length;

  if (semicolonCount > commaCount && semicolonCount > tabCount) {
    separator = ';';
  } else if (tabCount > commaCount && tabCount > semicolonCount) {
    separator = '\t';
  }

  // Parse fields safely (accounting for quoted fields)
  const parseLine = (line: string): string[] => {
    const fields: string[] = [];
    let currentField = '';
    let insideQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"') {
        insideQuotes = !insideQuotes;
      } else if (char === separator && !insideQuotes) {
        fields.push(currentField.trim().replace(/^"|"$/g, ''));
        currentField = '';
      } else {
        currentField += char;
      }
    }
    fields.push(currentField.trim().replace(/^"|"$/g, ''));
    return fields;
  };

  const headers = parseLine(lines[0]).map(h => h.toLowerCase().trim());
  const participants: Participant[] = [];

  // Helper to match headers
  const getIndex = (aliases: string[]): number => {
    return headers.findIndex(h => aliases.some(alias => h.includes(alias)));
  };

  const idIdx = getIndex(['id', 'codice', 'barcode', 'code']);
  const firstNameIdx = getIndex(['nome', 'first', 'fname', 'name']);
  const lastNameIdx = getIndex(['cognome', 'last', 'lname', 'surname']);
  const emailIdx = getIndex(['email', 'mail']);
  const companyIdx = getIndex(['azienda', 'company', 'società', 'societa', 'firm']);

  // If we can't find clear headers, we assume column order: 0=ID, 1=Nome, 2=Cognome, 3=Email, 4=Azienda
  const hasHeaders = idIdx !== -1 || firstNameIdx !== -1 || lastNameIdx !== -1;
  const startIdx = hasHeaders ? 1 : 0;

  for (let i = startIdx; i < lines.length; i++) {
    const fields = parseLine(lines[i]);
    if (fields.length === 0 || !fields[0]) continue;

    let id = '';
    let firstName = '';
    let lastName = '';
    let email = '';
    let company = '';

    if (hasHeaders) {
      id = idIdx !== -1 && fields[idIdx] ? fields[idIdx] : `P-${1000 + i}`;
      firstName = firstNameIdx !== -1 && fields[firstNameIdx] ? fields[firstNameIdx] : '';
      lastName = lastNameIdx !== -1 && fields[lastNameIdx] ? fields[lastNameIdx] : '';
      email = emailIdx !== -1 && fields[emailIdx] ? fields[emailIdx] : '';
      company = companyIdx !== -1 && fields[companyIdx] ? fields[companyIdx] : '';
    } else {
      // Direct positioning fallback
      id = fields[0] || `P-${1000 + i}`;
      firstName = fields[1] || '';
      lastName = fields[2] || '';
      email = fields[3] || '';
      company = fields[4] || '';
    }

    // Basic cleaning of ID (must be alphanumeric/dashes for Code39 compatibility)
    const cleanId = id.toUpperCase().replace(/[^0-9A-Z\-]/g, '');

    // Require at least a name to be valid
    if (firstName || lastName) {
      participants.push({
        id: cleanId || `PART-${1000 + i}`,
        firstName: firstName || 'Partecipante',
        lastName: lastName || String(i),
        email,
        company,
      });
    }
  }

  return participants;
}

/**
 * Generates a clean CSV string of the events check-in/out records.
 */
export function exportAttendanceToCSV(
  participants: Participant[],
  logs: AttendanceLog[],
  minEcmHours?: number
): string {
  const headers = [
    'ID Codice', 
    'Cognome', 
    'Nome', 
    'Email', 
    'Azienda', 
    'Stato Presenza Attuale', 
    'Orario Ingresso Rilevato', 
    'Orario Uscita Rilevato', 
    'Tempo Rilevazione Singola (Minuti)', 
    'Permanenza Totale Accumulata (Ore)',
    'Stato Accreditamento ECM'
  ];

  const rows = participants.map(p => {
    const pLogs = logs.filter(l => l.participantId === p.id);
    
    // Calculate total accumulated minutes
    let totalMins = 0;
    pLogs.forEach(l => {
      if (l.totalMinutes) {
        totalMins += l.totalMinutes;
      } else if (l.status === 'inside' && l.checkInTime) {
        const diffMs = Date.now() - new Date(l.checkInTime).getTime();
        totalMins += Math.max(0, diffMs / 60000);
      }
    });

    const totalHours = totalMins / 60;
    const totalAccumulatedText = `${totalHours.toFixed(2)} ore`;
    
    let ecmStatus = 'N/D';
    if (minEcmHours !== undefined && minEcmHours > 0) {
      ecmStatus = totalHours >= minEcmHours ? 'IDONEO' : 'NON IDONEO';
    }

    if (pLogs.length === 0) {
      return [[
        p.id, 
        p.lastName, 
        p.firstName, 
        p.email || '', 
        p.company || '', 
        'Assente', 
        '', 
        '', 
        '0', 
        '0.00 ore',
        ecmStatus
      ]];
    }

    // Return records for each interval
    return pLogs.map(l => [
      p.id,
      p.lastName,
      p.firstName,
      p.email || '',
      p.company || '',
      l.status === 'inside' ? 'In Aula' : 'Uscito',
      l.checkInTime ? new Date(l.checkInTime).toLocaleString('it-IT') : '',
      l.checkOutTime ? new Date(l.checkOutTime).toLocaleString('it-IT') : '',
      l.totalMinutes ? Math.round(l.totalMinutes).toString() : (l.status === 'inside' ? '-' : '0'),
      totalAccumulatedText,
      ecmStatus
    ]);
  }).flat();

  const csvRows = [
    headers.join(';'),
    ...rows.map(row => row.map(field => `"${String(field).replace(/"/g, '""')}"`).join(';'))
  ];

  return csvRows.join('\n');
}
