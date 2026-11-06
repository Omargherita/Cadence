import { useEffect, useRef, useState } from 'react';
import { Header, Horizon } from './components/Header';
import { OrganizerView } from './features/organizer/OrganizerView';
import { MusicalLibraryView } from './features/music/MusicalLibraryView';
import {
  CreatePieceRequest,
  CreatePracticeSessionRequest,
  CreateTaskRequest,
  DayArchetype,
  Piece,
  TaskItem,
} from './types/cadence';
import { api } from './services/api';
import { cadenceRepository } from './services/cadenceRepository';
import { syncEngine, SyncEngineStatus } from './services/syncEngine';

export function App() {
  const [activeView, setActiveView] = useState<'organizer' | 'library'>('organizer');
  const [horizon, setHorizon] = useState<Horizon>('today');
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [pendingOutboxCount, setPendingOutboxCount] = useState<number>(0);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const wasOffline = useRef(false);

  // Life Organizer State
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [isLoadingTasks, setIsLoadingTasks] = useState(false);
  const [selectedArchetype, setSelectedArchetype] = useState<DayArchetype>(() => {
    const saved = localStorage.getItem('cadence_archetype');
    return (saved as DayArchetype) || 'UniversityDay';
  });

  // Musical Library State
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [selectedPieceId, setSelectedPieceId] = useState<string | null>(null);
  const [isLoadingPieces, setIsLoadingPieces] = useState(false);

  // 1. Request persistent storage on app initialization
  useEffect(() => {
    if (typeof navigator !== 'undefined' && 'storage' in navigator && 'persist' in navigator.storage) {
      navigator.storage.persist().then((granted) => {
        if (granted) {
          console.log('[Cadence] Persistent storage granted by browser.');
        }
      }).catch((e) => console.debug('[Cadence] Storage persist error:', e));
    }
  }, []);

  // 2. Subscribe to Sync Engine Status
  useEffect(() => {
    const unsubscribe = syncEngine.subscribe((status: SyncEngineStatus) => {
      setPendingOutboxCount(status.pendingCount);
      setIsSyncing(status.isSyncing);
    });
    return unsubscribe;
  }, []);

  // 3. Health & Auto-Replay Loop
  useEffect(() => {
    const checkConnectionAndReplay = async () => {
      try {
        await api.getHealth();
        setIsOnline(true);

        // If transitioning from offline to online (or if there are pending items), process outbox
        const pending = await syncEngine.getPendingCount();
        if (wasOffline.current || pending > 0) {
          wasOffline.current = false;
          const result = await syncEngine.processOutbox();
          if (result.processed > 0) {
            await loadTasks();
            await loadPieces();
          }
        }
      } catch {
        setIsOnline(false);
        wasOffline.current = true;
      }
    };

    checkConnectionAndReplay();
    const interval = setInterval(checkConnectionAndReplay, 6000);

    const handleWindowOnline = () => checkConnectionAndReplay();
    const handleWindowOffline = () => setIsOnline(false);

    window.addEventListener('online', handleWindowOnline);
    window.addEventListener('offline', handleWindowOffline);

    return () => {
      clearInterval(interval);
      window.removeEventListener('online', handleWindowOnline);
      window.removeEventListener('offline', handleWindowOffline);
    };
  }, []);

  // Persist archetype changes
  const handleSelectArchetype = (archetype: DayArchetype) => {
    setSelectedArchetype(archetype);
    localStorage.setItem('cadence_archetype', archetype);
  };

  // Load Tasks via Repository (Online or Offline Dexie Read-Through)
  const loadTasks = async () => {
    try {
      setIsLoadingTasks(true);
      const data = await cadenceRepository.getTasks();
      setTasks(data);
    } catch (err) {
      console.error('Failed to load tasks', err);
    } finally {
      setIsLoadingTasks(false);
    }
  };

  // Load Pieces via Repository (Online or Offline Dexie Read-Through)
  const loadPieces = async () => {
    try {
      setIsLoadingPieces(true);
      const data = await cadenceRepository.getPieces();
      setPieces(data);
    } catch (err) {
      console.error('Failed to load pieces', err);
    } finally {
      setIsLoadingPieces(false);
    }
  };

  useEffect(() => {
    loadTasks();
    loadPieces();
  }, []);

  // Manual Trigger for Outbox Synchronization
  const handleSyncNow = async () => {
    const result = await syncEngine.processOutbox();
    if (result.processed > 0) {
      await loadTasks();
      await loadPieces();
    }
  };

  // Task Actions
  const handleAddTask = async (req: CreateTaskRequest) => {
    const task = await cadenceRepository.createTask(req);
    setTasks((prev) => [task, ...prev]);
    await loadTasks();
  };

  const handleToggleTask = async (id: string) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, isCompleted: !t.isCompleted } : t))
    );
    try {
      const updated = await cadenceRepository.toggleTask(id);
      setTasks((prev) => prev.map((t) => (t.id === id ? updated : t)));
      await loadTasks();
    } catch (err) {
      await loadTasks();
      throw err;
    }
  };

  const handleDeleteTask = async (id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
    try {
      await cadenceRepository.deleteTask(id);
      await loadTasks();
    } catch (err) {
      await loadTasks();
      throw err;
    }
  };

  // Musical Piece Actions
  const handleCreatePiece = async (req: CreatePieceRequest) => {
    const created = await cadenceRepository.createPiece(req);
    setPieces((prev) => [created, ...prev]);
    await loadPieces();
  };

  const handleLogSession = async (
    pieceId: string,
    req: CreatePracticeSessionRequest
  ) => {
    await cadenceRepository.logPracticeSession(pieceId, req);
    await loadPieces();
  };

  // Bridge action: Switching directly to Piano Workspace
  const handleSwitchToPiano = () => {
    setActiveView('library');
    const mainPiece = pieces.find((p) => p.bucket === 'MainChallenge');
    if (mainPiece) {
      setSelectedPieceId(mainPiece.id);
    } else if (pieces.length > 0) {
      setSelectedPieceId(pieces[0].id);
    }
  };

  return (
    <div className="cadence-app min-h-screen bg-[#0B0E14] text-[#F0F4F8] flex flex-col font-sans selection:bg-blue-600/30 selection:text-white">
      {/* Top Application Header */}
      <Header
        horizon={horizon} onHorizon={setHorizon} pieces={pieces} selectedPieceId={selectedPieceId}
        onPiece={id => { setActiveView('library'); setSelectedPieceId(id); }}
        archetype={selectedArchetype} onArchetype={handleSelectArchetype}
        activeView={activeView}
        onSelectView={(v) => {
          setActiveView(v);
          if (v === 'library') setSelectedPieceId(null);
        }}
        isOnline={isOnline}
        pendingOutboxCount={pendingOutboxCount}
        isSyncing={isSyncing}
        onSyncNow={handleSyncNow}
      />

      {/* Main Content Workspace */}
      <main className="app-canvas">
        {activeView === 'organizer' ? (
          <OrganizerView horizon={horizon}
            tasks={tasks}
            selectedArchetype={selectedArchetype}
            onSelectArchetype={handleSelectArchetype}
            onAddTask={handleAddTask}
            onToggleTask={handleToggleTask}
            onDeleteTask={handleDeleteTask}
            onRefreshTasks={loadTasks}
            onSwitchToPiano={handleSwitchToPiano}
            isLoading={isLoadingTasks}
          />
        ) : (
          <MusicalLibraryView
            pieces={pieces}
            selectedPieceId={selectedPieceId}
            onSelectPiece={setSelectedPieceId}
            onCreatePiece={handleCreatePiece}
            onLogSession={handleLogSession}
            onRefreshPieces={loadPieces}
            isLoading={isLoadingPieces}
          />
        )}
      </main>
    </div>
  );
}

export default App;
