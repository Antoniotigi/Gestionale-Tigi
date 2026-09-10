import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import cookieParser from 'cookie-parser';
import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import fs from 'fs';

dotenv.config();

const app = express();
const PORT = 3000;

// Enable cookie parser and JSON requests limit
app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));

// Secure credentials and MFA configuration storage (persisted at root)
const AUTH_STORE_PATH = path.join(process.cwd(), 'auth-store.json');
const JWT_SECRET = process.env.JWT_SECRET || 'tigicongress-super-secret-key-production-ready-2026';

// In-memory fallback in case of read-only filesystem
let inMemoryStore: any = null;

function initAuthStore() {
  const salt = bcrypt.genSaltSync(10);
  const passwordHash = bcrypt.hashSync('Mappescio2026@', salt);
  const defaultStore = {
    username: 'tigicongress',
    passwordHash,
    mfaSecret: null,
    mfaEnabled: false
  };

  try {
    if (!fs.existsSync(AUTH_STORE_PATH)) {
      fs.writeFileSync(AUTH_STORE_PATH, JSON.stringify(defaultStore, null, 2), 'utf-8');
      console.log('[Auth Store] Inizializzato credenziali predefinite su file.');
    }
  } catch (err) {
    console.warn('[Auth Store] File system non scrivibile. Utilizzo in-memory fallback.', err);
    inMemoryStore = defaultStore;
  }
}
initAuthStore();

function getAuthStore() {
  if (inMemoryStore) return inMemoryStore;
  try {
    return JSON.parse(fs.readFileSync(AUTH_STORE_PATH, 'utf-8'));
  } catch (err) {
    console.warn('[Auth Store] Errore di lettura file. Uso in-memory fallback.', err);
    if (!inMemoryStore) {
      const salt = bcrypt.genSaltSync(10);
      const passwordHash = bcrypt.hashSync('Mappescio2026@', salt);
      inMemoryStore = {
        username: 'tigicongress',
        passwordHash,
        mfaSecret: null,
        mfaEnabled: false
      };
    }
    return inMemoryStore;
  }
}

function updateAuthStore(data: any) {
  if (inMemoryStore) {
    inMemoryStore = data;
    return;
  }
  try {
    fs.writeFileSync(AUTH_STORE_PATH, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.warn('[Auth Store] Errore di scrittura file durante aggiornamento. Uso in-memory fallback.', err);
    inMemoryStore = data;
  }
}

// ----------------- SECURITY & RATE LIMITING MIDDLEWARE -----------------
const loginAttempts = new Map<string, { count: number; lockUntil?: number }>();

function rateLimiter(req: any, res: any, next: any) {
  const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
  const attempt = loginAttempts.get(ip);
  if (attempt && attempt.lockUntil && attempt.lockUntil > Date.now()) {
    const minutesLeft = Math.ceil((attempt.lockUntil - Date.now()) / 60000);
    return res.status(429).json({ error: `Troppi tentativi falliti. Riprova tra ${minutesLeft} minuti.` });
  }
  next();
}

function recordFailure(ip: string) {
  const attempt = loginAttempts.get(ip) || { count: 0 };
  attempt.count += 1;
  if (attempt.count >= 5) {
    attempt.lockUntil = Date.now() + 15 * 60 * 1000; // Lock for 15 minutes
  }
  loginAttempts.set(ip, attempt);
}

function recordSuccess(ip: string) {
  loginAttempts.delete(ip);
}

// Session authentication gate for all analytical / protected backend endpoints
function authenticateToken(req: any, res: any, next: any) {
  let token = req.cookies.token;
  if (!token && req.headers.authorization) {
    const parts = req.headers.authorization.split(' ');
    if (parts.length === 2 && parts[0] === 'Bearer') {
      token = parts[1];
    }
  }

  if (!token) {
    return res.status(401).json({ error: 'Accesso negato. Sessione scaduta o non autorizzata.' });
  }
  try {
    const verified = jwt.verify(token, JWT_SECRET);
    req.user = verified;
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Sessione non valida.' });
  }
}

// Shared Gemini Client
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

// Heuristic fallback mapping for Excel headers when Gemini API is rate-limited or unavailable
function heuristicAnalyzeExcel(headers: string[], sampleData: any[]) {
  const cleanHeaders = headers.map(h => h.trim());
  const lowerHeaders = cleanHeaders.map(h => h.toLowerCase());

  let idColumn = 'GENERATE';
  let firstNameColumn = '';
  let lastNameColumn = '';
  let emailColumn = '';
  let companyColumn = '';

  // 1. Detect ID/Barcode
  const idKeys = ['id', 'barcode', 'codice', 'barcode id', 'tessera', 'badge', 'key', 'uuid', 'cf', 'codice fiscale', 'codice_fiscale'];
  const idIdx = lowerHeaders.findIndex(lh => idKeys.some(k => lh === k || lh.startsWith(k + '_') || lh.startsWith(k + ' ') || lh.endsWith(' ' + k) || lh.endsWith('_' + k) || lh === 'codicefiscale'));
  if (idIdx !== -1) {
    idColumn = cleanHeaders[idIdx];
  }

  // 2. Detect First Name
  const firstNamesKeys = ['nome', 'first name', 'firstname', 'first_name', 'name'];
  const firstIdx = lowerHeaders.findIndex(lh => firstNamesKeys.some(k => lh.includes(k)));
  if (firstIdx !== -1) {
    firstNameColumn = cleanHeaders[firstIdx];
  }

  // 3. Detect Last Name
  const lastNamesKeys = ['cognome', 'last name', 'lastname', 'last_name', 'surname'];
  const lastIdx = lowerHeaders.findIndex(lh => lastNamesKeys.some(k => lh.includes(k)));
  if (lastIdx !== -1) {
    lastNameColumn = cleanHeaders[lastIdx];
  }

  // If both standard names are missing, fallback to full name/nominativo
  if (!firstNameColumn && !lastNameColumn) {
    const nameIdx = lowerHeaders.findIndex(lh => lh.includes('nominativo') || lh.includes('completo') || lh.includes('full name') || lh.includes('fullname') || lh.includes('membro'));
    if (nameIdx !== -1) {
      firstNameColumn = cleanHeaders[nameIdx];
      lastNameColumn = '';
    }
  }

  // Basic defaults if still missing
  if (!firstNameColumn) {
    const candidateIdx = lowerHeaders.findIndex(lh => !lh.includes('id') && !lh.includes('codice') && !lh.includes('mail') && !lh.includes('azienda') && !lh.includes('ente') && !lh.includes('società'));
    firstNameColumn = candidateIdx !== -1 ? cleanHeaders[candidateIdx] : (cleanHeaders[0] || 'Nome');
  }
  if (!lastNameColumn) {
    const candidateIdx = lowerHeaders.findIndex(lh => lh !== firstNameColumn && !lh.includes('id') && !lh.includes('codice') && !lh.includes('mail') && !lh.includes('azienda') && !lh.includes('ente') && !lh.includes('società'));
    lastNameColumn = candidateIdx !== -1 ? cleanHeaders[candidateIdx] : 'Cognome';
  }

  // 4. Detect Email
  const emailKeys = ['email', 'e-mail', 'mail', 'indirizzo email', 'contatto'];
  const emailIdx = lowerHeaders.findIndex(lh => emailKeys.some(k => lh.includes(k)));
  if (emailIdx !== -1) {
    emailColumn = cleanHeaders[emailIdx];
  }

  // 5. Detect Company
  const companyKeys = ['azienda', 'ente', 'società', 'company', 'istituto', 'ospedale', 'affiliazione', 'università', 'organization', 'org'];
  const companyIdx = lowerHeaders.findIndex(lh => companyKeys.some(k => lh.includes(k)));
  if (companyIdx !== -1) {
    companyColumn = cleanHeaders[companyIdx];
  }

  // Map other fields to dynamic fields
  const standardColumns = new Set([idColumn, firstNameColumn, lastNameColumn, emailColumn, companyColumn].filter(c => c !== 'GENERATE' && c !== ''));
  const dynamicFields: { key: string; label: string }[] = [];

  cleanHeaders.forEach(h => {
    if (!standardColumns.has(h)) {
      const key = h.toLowerCase()
        .replace(/[^a-z0-9\s-_]/g, '')
        .trim()
        .replace(/[\s-_]+/g, '_');
      if (key) {
        dynamicFields.push({ key, label: h });
      }
    }
  });

  return {
    columnMapping: {
      idColumn,
      firstNameColumn,
      lastNameColumn,
      emailColumn: emailColumn || undefined,
      companyColumn: companyColumn || undefined
    },
    dynamicFields,
    optimizations: [
      "⚠️ Modalità di riserva attivata (Quota Limite AI superata o non disponibile).",
      "✅ Le colonne Excel sono state mappate tramite l'algoritmo euristico locale.",
      `ID Barcode: ${idColumn === 'GENERATE' ? 'Autogenerato sequenzialmente' : idColumn}`,
      `Campi extra: ${dynamicFields.length > 0 ? dynamicFields.map(d => d.label).join(', ') : 'Nessuno'}`
    ]
  };
}

// API endpoint for AI-powered Excel analysis
app.post('/api/analyze-excel', authenticateToken, async (req, res) => {
  const { headers, sampleData } = req.body;
  
  if (!headers || !Array.isArray(headers) || headers.length === 0) {
    return res.status(400).json({ error: 'La richiesta deve includere un array di intestazioni.' });
  }

  // Define the common schema used for validation
  const responseSchema = {
    type: Type.OBJECT,
    properties: {
      columnMapping: {
        type: Type.OBJECT,
        properties: {
          idColumn: { 
            type: Type.STRING, 
            description: "Nome esatto dell'intestazione di colonna usata come ID Barcode o codice identificativo. Se manca o non è univoca, rispondi con 'GENERATE'." 
          },
          firstNameColumn: { 
            type: Type.STRING, 
            description: "Nome esatto dell'intestazione di colonna per il Nome." 
          },
          lastNameColumn: { 
            type: Type.STRING, 
            description: "Nome esatto dell'intestazione di colonna per il Cognome." 
          },
          emailColumn: { 
            type: Type.STRING, 
            description: "Nome esatto dell'intestazione di colonna per l'Email (se presente, altrimenti lasciare stringa vuota)." 
          },
          companyColumn: { 
            type: Type.STRING, 
            description: "Nome esatto dell'intestazione di colonna per l'Azienda/Ente (se presente, altrimenti lasciare stringa vuota)." 
          }
        },
        required: ["idColumn", "firstNameColumn", "lastNameColumn"]
      },
      dynamicFields: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            key: { 
              type: Type.STRING, 
              description: "Chiave camelCase/snake_case pulita e unica, es. 'codice_fiscale'." 
            },
            label: { 
              type: Type.STRING, 
              description: "L'intestazione originale della colonna, es. 'Codice Fiscale'." 
            }
          },
          required: ["key", "label"]
        },
        description: "Tutte le altre colonne non mappate nei campi standard, che contengono dati rilevanti per l'anagrafica."
      },
      optimizations: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
        description: "Consigli, avvisi o suggerimenti dell'agente AI (es. 'Identificati 3 campi aggiuntivi', 'Formattazione e-mail convalidata', 'Trovati possibili duplicati', ecc.)."
      }
    },
    required: ["columnMapping", "dynamicFields", "optimizations"]
  };

  const prompt = `Analizza le seguenti intestazioni di colonna di un file Excel contenente i partecipanti di un congresso e una selezione di dati d'esempio (massimo 5 righe).
Identifica le colonne principali (ID Barcode, Nome, Cognome, Email, Azienda) e mappa tutte le restanti come campi dinamici aggiuntivi (ad es. Specializzazione, Ruolo, Codice Fiscale, Telefono, ecc.).
Se non trovi una colonna adatta all'ID Barcode, consiglia "GENERATE" per la colonna ID, in modo che l'applicazione generi codici a barre sequenziali unici.

Intestazioni di colonna del file Excel:
${JSON.stringify(headers)}

Dati d'esempio (massimo 5 righe):
${JSON.stringify(sampleData)}

Rispondi rigorosamente in formato JSON conformemente allo schema richiesto.`;

  // Helper to attempt model execution
  const attemptModel = async (modelName: string) => {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema
      }
    });
    return response.text;
  };

  try {
    if (!process.env.GEMINI_API_KEY) {
      console.warn('[AI Mapping] GEMINI_API_KEY non configurata. Utilizzo immediato del fallback locale.');
      const fallbackResult = heuristicAnalyzeExcel(headers, sampleData || []);
      return res.json(fallbackResult);
    }

    // Stage 1: Try Primary model (gemini-3.8-flash)
    try {
      console.log('[AI Mapping] Tentativo con modello primario gemini-3.8-flash...');
      const resultText = await attemptModel('gemini-3.8-flash');
      if (resultText) {
        const analysis = JSON.parse(resultText);
        return res.json(analysis);
      }
    } catch (e: any) {
      console.warn('[AI Mapping] Modello primario non disponibile o occupato. Tentativo con modello secondario.', e?.message || e);
    }

    // Stage 2: Try Secondary model (gemini-3.1-flash-lite)
    try {
      console.log('[AI Mapping] Tentativo con modello secondario gemini-3.1-flash-lite...');
      const resultText = await attemptModel('gemini-3.1-flash-lite');
      if (resultText) {
        const analysis = JSON.parse(resultText);
        return res.json(analysis);
      }
    } catch (e: any) {
      console.warn('[AI Mapping] Modello secondario non disponibile. Attivazione fallback locale.', e?.message || e);
    }

    // Stage 3: Deterministic Fallback if both models fail
    const fallbackResult = heuristicAnalyzeExcel(headers, sampleData || []);
    return res.json(fallbackResult);

  } catch (error: any) {
    console.warn('[AI Mapping] Gestore di eccezione attivato. Utilizzo del fallback locale.', error?.message || error);
    const fallbackResult = heuristicAnalyzeExcel(headers, sampleData || []);
    res.json(fallbackResult);
  }
});

// ----------------- AUTHENTICATION & MFA ENDPOINTS -----------------

// 1. POST /api/login (Username and Password credentials check - MFA Removed)
app.post('/api/login', rateLimiter, async (req, res) => {
  const { username, password } = req.body;
  const ipHeader = req.headers['x-forwarded-for'];
  const ip = req.ip || (Array.isArray(ipHeader) ? ipHeader[0] : ipHeader) || 'unknown';

  if (!username || !password) {
    return res.status(400).json({ error: 'Username e password richiesti.' });
  }

  try {
    const store = getAuthStore();

    if (username !== store.username || !bcrypt.compareSync(password, store.passwordHash)) {
      recordFailure(ip);
      return res.status(401).json({ error: 'Credenziali di accesso non valide.' });
    }

    // Reset brute force counter on successful credentials check
    recordSuccess(ip);

    // Issue authenticating JWT cookie directly (Secure, HttpOnly)
    const finalToken = jwt.sign(
      { username: store.username, role: 'admin' },
      JWT_SECRET,
      { expiresIn: '1d' }
    );

    res.cookie('token', finalToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'none', // Required for AI Studio iframe preview environment
      maxAge: 24 * 60 * 60 * 1000 // 1 day
    });

    return res.json({
      status: 'authenticated',
      username: store.username,
      token: finalToken
    });

  } catch (err: any) {
    return res.status(500).json({ error: 'Errore interno del server durante il login.' });
  }
});

// 4. GET /api/check-session (Checks active login state on boot)
app.get('/api/check-session', (req, res) => {
  let token = req.cookies.token;
  if (!token && req.headers.authorization) {
    const parts = req.headers.authorization.split(' ');
    if (parts.length === 2 && parts[0] === 'Bearer') {
      token = parts[1];
    }
  }

  if (!token) {
    return res.status(401).json({ authenticated: false });
  }

  try {
    const verified = jwt.verify(token, JWT_SECRET);
    return res.json({ authenticated: true, user: verified });
  } catch (err) {
    return res.status(401).json({ authenticated: false });
  }
});

// 5. POST /api/logout (Destroys the session cookie securely)
app.post('/api/logout', (req, res) => {
  res.clearCookie('token', {
    httpOnly: true,
    secure: true,
    sameSite: 'none'
  });
  return res.json({ success: true });
});

// Serve Vite static/assets
async function startServer() {
  const isProduction = process.env.NODE_ENV === 'production' || (typeof __filename !== 'undefined' && __filename.endsWith('.cjs')) || !fs.existsSync(path.join(process.cwd(), 'server.ts'));
  
  if (!isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
