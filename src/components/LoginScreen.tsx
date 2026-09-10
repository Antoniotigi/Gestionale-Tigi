import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Shield, Lock, User, AlertCircle, RefreshCw, CheckCircle, ExternalLink } from 'lucide-react';

interface LoginScreenProps {
  onLoginSuccess: () => void;
}

export default function LoginScreen({ onLoginSuccess }: LoginScreenProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const handleCredentialsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError('Inserisci sia lo username che la password.');
      return;
    }

    setError('');
    setLoading(true);

    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      const contentType = response.headers.get('content-type');
      let data: any = {};
      
      if (contentType && contentType.includes('application/json')) {
        data = await response.json();
      } else {
        const text = await response.text();
        console.error('Non-JSON response from server:', text);
        throw new Error('Il servizio non è disponibile o la configurazione del server è errata (Cookie di terze parti bloccati nell\'iframe di anteprima). Riprova caricando l\'applicazione in una nuova scheda.');
      }

      if (!response.ok) {
        throw new Error(data.error || 'Errore durante l\'autenticazione.');
      }

      if (data.status === 'authenticated') {
        if (data.token) {
          localStorage.setItem('token', data.token);
        }
        setSuccessMessage('Accesso consentito! Caricamento in corso...');
        setTimeout(() => {
          onLoginSuccess();
        }, 800);
      }
    } catch (err: any) {
      setError(err.message || 'Errore del server.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F4F7FB] p-4 relative overflow-hidden font-sans">
      
      {/* Delicate organic blur highlights matching the soft light glassmorphism feel */}
      <div className="absolute top-[-10%] right-[-10%] w-[500px] h-[500px] bg-[#E8F3FF] rounded-full blur-[120px] pointer-events-none opacity-60" />
      <div className="absolute bottom-[-10%] left-[-10%] w-[500px] h-[500px] bg-[#E8F3FF] rounded-full blur-[120px] pointer-events-none opacity-60" />

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="w-full max-w-md bg-white border border-slate-100 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.03)] p-8 md:p-10 relative z-10"
      >
        {/* Header Title with brand design */}
        <div className="text-center space-y-3 mb-8">
          <div className="w-14 h-14 rounded-full bg-[#E8F3FF] text-[#2589F5] flex items-center justify-center mx-auto shadow-inner">
            <Shield size={28} />
          </div>
          <div className="space-y-1">
            <h2 className="text-2xl font-black text-[#1E293B] tracking-tight">SmartGate</h2>
            <p className="text-xs text-[#64748B] font-medium uppercase tracking-wider">Controllo Presenze Enterprise</p>
          </div>
        </div>

        <form onSubmit={handleCredentialsSubmit} className="space-y-5">
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-[#1E293B]">Nome Utente</label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-[#64748B]">
                <User size={18} />
              </span>
              <input
                type="text"
                required
                disabled={loading}
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="Es. tigicongress"
                className="w-full pl-11 pr-4 py-3 bg-[#F4F7FB] border border-[#E8F3FF] rounded-xl text-sm font-semibold text-[#1E293B] placeholder-slate-400 focus:outline-hidden focus:border-[#2589F5] focus:ring-4 focus:ring-[#2589F5]/10 transition-all"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-[#1E293B]">Password di Accesso</label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-[#64748B]">
                <Lock size={18} />
              </span>
              <input
                type="password"
                required
                disabled={loading}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••••••••"
                className="w-full pl-11 pr-4 py-3 bg-[#F4F7FB] border border-[#E8F3FF] rounded-xl text-sm font-semibold text-[#1E293B] placeholder-slate-400 focus:outline-hidden focus:border-[#2589F5] focus:ring-4 focus:ring-[#2589F5]/10 transition-all font-mono"
              />
            </div>
          </div>

          {error && (
            <motion.div 
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-4 bg-red-50/90 border border-red-100 rounded-xl flex flex-col gap-2 text-xs text-red-700 font-semibold shadow-xs"
            >
              <div className="flex items-start gap-2.5">
                <AlertCircle size={16} className="shrink-0 mt-0.5 text-red-500" />
                <span>{error}</span>
              </div>
              {error.includes('iframe') && (
                <div className="mt-2 pt-2 border-t border-red-100 text-[11px] text-slate-600 font-normal leading-relaxed flex flex-col">
                  <div>
                    💡 <strong className="font-bold text-red-800">Suggerimento per l'Anteprima:</strong> I browser moderni bloccano di default i cookie di terze parti dentro i pannelli incorporati (iframe). Per risolvere subito:
                  </div>
                  <ul className="list-disc list-inside mt-1.5 space-y-1 font-medium text-slate-700 pl-1">
                    <li>Fai clic sul pulsante azzurro qui sotto per aprire l'applicazione in una nuova scheda.</li>
                    <li>Oppure abilita i cookie di terze parti nelle impostazioni del tuo browser per questo sito.</li>
                  </ul>
                  <a 
                    href={window.location.href} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="mt-3.5 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 bg-[#2589F5] hover:bg-[#1a73e8] text-white font-bold rounded-xl shadow-xs transition-all text-center text-xs"
                  >
                    <ExternalLink size={13} className="shrink-0" />
                    Apri in una Nuova Scheda
                  </a>
                </div>
              )}
            </motion.div>
          )}

          {successMessage && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="p-3.5 bg-emerald-50/80 border border-emerald-100 rounded-xl flex items-center gap-2.5 text-xs text-emerald-700 font-semibold shadow-xs"
            >
              <CheckCircle size={16} className="text-emerald-500 animate-bounce shrink-0" />
              <span>{successMessage}</span>
            </motion.div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full h-12 bg-gradient-to-r from-[#36D1DC] to-[#5B86E5] text-white font-bold text-sm uppercase tracking-wider rounded-full cursor-pointer hover:opacity-95 transition-all shadow-[0_4px_15px_rgba(91,134,229,0.3)] disabled:opacity-50 flex items-center justify-center gap-2 mt-2"
          >
            {loading ? (
              <RefreshCw size={18} className="animate-spin" />
            ) : (
              <span>Accedi al Portale</span>
            )}
          </button>
        </form>

        <div className="text-center mt-6">
          <p className="text-[10px] text-[#64748B] font-semibold uppercase tracking-widest">Enterprise Security Shield Active</p>
        </div>
      </motion.div>
    </div>
  );
}
