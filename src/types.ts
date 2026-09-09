export interface Event {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  description?: string;
  location?: string;
  status: 'active' | 'completed' | 'draft';
  createdAt: string;
  image?: string; // Base64 or URL for cover preview photo
  durationHours?: number; // Event total duration in hours (ECM calculation)
  minEcmHours?: number; // Minimum hours of presence required for ECM credits
  dynamicFieldsConfig?: { key: string; label: string }[]; // Dynamic columns mapped from Excel
}

export interface Participant {
  id: string; // The barcode ID (from "n.")
  firstName: string;
  lastName: string;
  email?: string;
  company?: string; // Maps to "Ente di appartenenza"
  notes?: string;
  phone?: string; // Maps to "Telefono"
  city?: string; // Maps to "Città Lavoro"
  profession?: string; // Maps to "Professione"
  discipline?: string; // Maps to "Disciplina"
  dynamicFields?: Record<string, string>; // Dynamic extra data fields
}

export interface AttendanceLog {
  id: string;
  eventId: string;
  participantId: string;
  checkInTime: string;
  checkOutTime: string | null;
  totalMinutes: number | null;
  status: 'inside' | 'outside';
}

export interface EventWithStats extends Event {
  totalParticipants: number;
  currentlyInside: number;
  totalLogsCount: number;
}
