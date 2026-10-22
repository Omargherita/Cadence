import { useEffect, useState } from 'react';
import { Header } from './components/Header';
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

export function App() {
  const [activeView, setActiveView] = useState<'organizer' | 'library'>('organizer');
  const [isOnline, setIsOnline] = useState<boolean>(true);

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

  // Health check on mount and interval
  useEffect(() => {
    const checkConnection = async () => {
      try {
        await api.getHealth();
        setIsOnline(true);
      } catch {
        setIsOnline(false);
      }
    };

    checkConnection();
    const interval = setInterval(checkConnection, 15000);
    return () => clearInterval(interval);
  }, []);

  // Persist archetype changes
  const handleSelectArchetype = (archetype: DayArchetype) => {
    setSelectedArchetype(archetype);
    localStorage.setItem('cadence_archetype', archetype);
  };

  // Load Tasks
  const loadTasks = async () => {
    try {
      setIsLoadingTasks(true);
      const data = await api.getTasks();
      setTasks(data);
    } catch (err) {
      console.error('Failed to load tasks', err);
    } finally {
      setIsLoadingTasks(false);
    }
  };

  // Load Pieces
  const loadPieces = async () => {
    try {
      setIsLoadingPieces(true);
      const data = await api.getPieces();
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

  // Task Actions
  const handleAddTask = async (req: CreateTaskRequest) => {
    const created = await api.createTask(req);
    setTasks((prev) => [created, ...prev]);
    // Refresh to get server-enforced sort order
    await loadTasks();
  };

  const handleToggleTask = async (id: string) => {
    // Optimistic toggle
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, isCompleted: !t.isCompleted } : t))
    );
    try {
      const updated = await api.toggleTask(id);
      setTasks((prev) =>
        prev.map((t) => (t.id === id ? updated : t))
      );
      await loadTasks();
    } catch (err) {
      // Revert if error
      await loadTasks();
      throw err;
    }
  };

  const handleDeleteTask = async (id: string) => {
    // Optimistic delete
    setTasks((prev) => prev.filter((t) => t.id !== id));
    try {
      await api.deleteTask(id);
    } catch (err) {
      await loadTasks();
      throw err;
    }
  };

  // Musical Piece Actions
  const handleCreatePiece = async (req: CreatePieceRequest) => {
    const created = await api.createPiece(req);
    setPieces((prev) => [created, ...prev]);
    await loadPieces();
  };

  const handleLogSession = async (
    pieceId: string,
    req: CreatePracticeSessionRequest
  ) => {
    await api.logPracticeSession(pieceId, req);
    // Reload pieces to get updated LastPracticedAtUtc and new session in history
    await loadPieces();
  };

  // Bridge action: Switching directly to Piano Workspace
  const handleSwitchToPiano = () => {
    setActiveView('library');
    // If pieces exist in MainChallenge, optionally pre-select the primary one
    const mainPiece = pieces.find((p) => p.bucket === 'MainChallenge');
    if (mainPiece) {
      setSelectedPieceId(mainPiece.id);
    } else if (pieces.length > 0) {
      setSelectedPieceId(pieces[0].id);
    }
  };

  return (
    <div className="min-h-screen bg-[#0B0E14] text-[#F0F4F8] flex flex-col font-sans selection:bg-blue-600/30 selection:text-white">
      {/* Top Application Header */}
      <Header
        activeView={activeView}
        onSelectView={(v) => {
          setActiveView(v);
          // If switching to library view via tab, show board
          if (v === 'library') setSelectedPieceId(null);
        }}
        isOnline={isOnline}
      />

      {/* Main Content Workspace */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {activeView === 'organizer' ? (
          <OrganizerView
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
