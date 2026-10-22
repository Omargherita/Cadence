import { FC, useState } from 'react';
import { Activity, CheckSquare, Music, ShieldCheck, Database } from 'lucide-react';
import { api } from '../services/api';

interface HeaderProps {
  activeView: 'organizer' | 'library';
  onSelectView: (view: 'organizer' | 'library') => void;
  isOnline: boolean;
}

export const Header: FC<HeaderProps> = ({ activeView, onSelectView, isOnline }) => {
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [backupMessage, setBackupMessage] = useState<string | null>(null);

  const handleBackup = async () => {
    try {
      setIsBackingUp(true);
      const res = await api.triggerBackup();
      const filename = res.backupPath.split('/').pop();
      setBackupMessage(`Saved: ${filename}`);
      setTimeout(() => setBackupMessage(null), 4000);
    } catch (err) {
      setBackupMessage('Backup failed');
      setTimeout(() => setBackupMessage(null), 3000);
    } finally {
      setIsBackingUp(false);
    }
  };

  return (
    <header className="sticky top-0 z-30 border-b border-[#1E2638] bg-[#0B0E14]/90 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Brand Logo & Connection Indicator */}
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-gradient-to-br from-blue-600 to-violet-600 text-white shadow-lg shadow-blue-500/10">
              <Activity className="w-5 h-5" />
            </div>
            <div className="flex flex-col">
              <span className="text-lg font-bold tracking-tight text-[#F0F4F8]">
                Cadence
              </span>
              <span className="text-[10px] tracking-wider uppercase font-semibold text-slate-400">
                Personal Monolith
              </span>
            </div>

            {/* Connection Indicator: Steel Blue for Online, Slate for Offline */}
            <div
              className={`ml-3 inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                isOnline
                  ? 'bg-blue-950/60 text-blue-400 border-blue-800/60'
                  : 'bg-slate-900 text-slate-400 border-slate-700/60'
              }`}
              title={isOnline ? 'Connected to local backend' : 'Backend offline'}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  isOnline ? 'bg-blue-400 animate-pulse' : 'bg-slate-500'
                }`}
              />
              <span className="text-[11px] font-mono tracking-tight">
                {isOnline ? 'Online' : 'Offline'}
              </span>
            </div>
          </div>

          {/* Navigation Tabs */}
          <nav className="flex items-center gap-1 bg-[#111622] p-1 rounded-xl border border-[#1E2638]">
            <button
              onClick={() => onSelectView('organizer')}
              className={`flex items-center gap-2 px-3 sm:px-4 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-all duration-150 cursor-pointer ${
                activeView === 'organizer'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                  : 'text-slate-400 hover:text-[#F0F4F8] hover:bg-[#1A202C]'
              }`}
            >
              <CheckSquare className="w-4 h-4" />
              <span>Organizer</span>
            </button>
            <button
              onClick={() => onSelectView('library')}
              className={`flex items-center gap-2 px-3 sm:px-4 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-all duration-150 cursor-pointer ${
                activeView === 'library'
                  ? 'bg-violet-600 text-white shadow-md shadow-violet-600/20'
                  : 'text-slate-400 hover:text-[#F0F4F8] hover:bg-[#1A202C]'
              }`}
            >
              <Music className="w-4 h-4" />
              <span>Musical Library</span>
            </button>
          </nav>

          {/* System Backup Action */}
          <div className="flex items-center gap-2">
            {backupMessage && (
              <span className="hidden md:inline-flex items-center gap-1 text-xs font-mono px-2 py-1 rounded bg-[#111622] text-amber-300 border border-amber-800/60">
                <ShieldCheck className="w-3.5 h-3.5" />
                {backupMessage}
              </span>
            )}
            <button
              onClick={handleBackup}
              disabled={isBackingUp || !isOnline}
              title="Trigger live SQLite backup (VACUUM INTO)"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#111622] hover:bg-[#1A202C] text-slate-300 hover:text-white border border-[#1E2638] transition-colors disabled:opacity-50 cursor-pointer"
            >
              <Database className="w-3.5 h-3.5 text-blue-400" />
              <span className="hidden sm:inline">Backup DB</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
