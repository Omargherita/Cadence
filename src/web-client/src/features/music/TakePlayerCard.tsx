import { FC, useRef, useState } from 'react';
import {
  Camera,
  ChevronDown,
  ChevronUp,
  Clock,
  FileText,
  Headphones,
  MessageSquare,
  Sparkles,
  Video,
} from 'lucide-react';
import { PieceWeakness, PracticeTake } from '../../types/cadence';
import { api } from '../../services/api';
import { formatRelativeTime } from '../../utils/date';
import { MentorAssessmentCard } from './MentorAssessmentCard';

interface TakePlayerCardProps {
  take: PracticeTake;
  weaknesses?: PieceWeakness[];
  isLatest?: boolean;
}

export const TakePlayerCard: FC<TakePlayerCardProps> = ({
  take,
  weaknesses = [],
  isLatest = false,
}) => {
  const [isAssessmentOpen, setIsAssessmentOpen] = useState<boolean>(true);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  const isVideo = take.originalMediaType === 'VideoMp4';
  const mediaRelativePath = isVideo
    ? take.originalMediaRelativePath
    : take.extractedAudioRelativePath || take.originalMediaRelativePath;
  const mediaUrl = api.getMediaUrl(mediaRelativePath);

  const handleSeekTimestamp = (seconds: number) => {
    const player = isVideo ? videoRef.current : audioRef.current;
    if (player) {
      player.currentTime = Math.max(0, seconds);
      player.play().catch(() => {
        // Au could be blocked if un-interacted
      });
    }
  };

  const formatDuration = (totalSeconds: number | null) => {
    if (!totalSeconds) return null;
    const mins = Math.floor(totalSeconds / 60);
    const secs = Math.floor(totalSeconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className={`rounded-lg bg-[#111622] border transition-all   overflow-hidden ${
      isLatest ? 'border-violet-600/60 ring-1 ring-violet-500/20' : 'border-[#1E2638]'
    }`}>
      {/* Take Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 sm:p-5    border-b border-[#1E2638]">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-9 h-9 rounded-md bg-[#0B0E14] border border-[#1E2638] font-mono font-semibold text-sm text-white">
            #{take.takeNumber}
          </div>

          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`px-2 py-0.5 rounded-md text-xs font-mono font-semibold border ${
                take.scope === 'FullPerformance'
                  ? 'bg-blue-950/60 text-blue-300 border-blue-800/60'
                  : 'bg-violet-950/60 text-violet-300 border-violet-800/60'
              }`}>
                {take.scope === 'FullPerformance' ? 'Full Performance' : 'Passage Clip'}
              </span>

              {take.includeVideoPostureAnalysis && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-mono text-violet-300 bg-violet-950/40 border border-violet-800/50">
                  <Camera className="w-3 h-3 text-violet-400" />
                  <span>Posture Active</span>
                </span>
              )}

              {take.durationSeconds && (
                <span className="inline-flex items-center gap-1 text-xs font-mono text-slate-400">
                  <Clock className="w-3 h-3" />
                  {formatDuration(take.durationSeconds)}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs font-semibold text-[#F0F4F8]">
                {take.targetSection ? `Section: ${take.targetSection}` : 'Entire Work'}
              </span>
              <span className="text-xs font-mono text-slate-400">
                • {formatRelativeTime(take.createdAtUtc)}
              </span>
            </div>
          </div>
        </div>

        {/* Action Toggles */}
        <div className="flex items-center gap-2 self-end sm:self-auto">
          {take.assessment && (
            <button
              type="button"
              onClick={() => setIsAssessmentOpen((prev) => !prev)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-[#0B0E14] hover:bg-[#1A202C] text-slate-300 hover:text-white border border-[#1E2638] transition-colors cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5 text-violet-400" />
              <span>{isAssessmentOpen ? 'Hide Assessment' : 'Show Assessment'}</span>
              {isAssessmentOpen ? (
                <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              )}
            </button>
          )}
        </div>
      </div>

      <div className="p-4 sm:p-5 space-y-4">
        {/* Media Player Container */}
        <div className="document-section     p-3 sm:p-4 space-y-3">
          <div className="flex items-center justify-between text-xs font-mono text-slate-400 pb-2 border-b border-[#1E2638]/60">
            <div className="flex items-center gap-2">
              {isVideo ? (
                <Video className="w-4 h-4 text-violet-400" />
              ) : (
                <Headphones className="w-4 h-4 text-blue-400" />
              )}
              <span className="text-[#F0F4F8] font-semibold">
                {isVideo ? 'Master Video Stream' : 'Acoustic Audio Stream'}
              </span>
            </div>
            <span className="text-xs   text-slate-400">
              HTTP Range Streaming
            </span>
          </div>

          {isVideo ? (
            <video
              ref={videoRef}
              controls
              playsInline
              preload="metadata"
              src={mediaUrl}
              className="w-full rounded-lg bg-black max-h-[420px] object-contain "
            />
          ) : (
            <div className="pt-2">
              <audio
                ref={audioRef}
                controls
                preload="metadata"
                src={mediaUrl}
                className="w-full rounded-lg"
              />
            </div>
          )}

          {/* Metadata Badges & Notes */}
          <div className="flex flex-wrap items-center gap-3 pt-1 text-xs">
            {take.attachedPdfPages && (
              <span className="inline-flex items-center gap-1 text-xs font-mono text-blue-300 bg-blue-950/40 border border-blue-800/50 px-2 py-0.5 rounded">
                <FileText className="w-3 h-3 text-blue-400" />
                <span>Score: {take.attachedPdfPages}</span>
              </span>
            )}

            {take.userSelfReflection && (
              <div className="w-full text-xs text-slate-300 bg-[#111622] p-2.5 rounded-lg border border-[#1E2638] flex items-start gap-2">
                <MessageSquare className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                <p>
                  <strong className="text-slate-200">Self-Reflection: </strong>
                  {take.userSelfReflection}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* AI Mentor Assessment Section */}
        {take.assessment ? (
          isAssessmentOpen && (
            <div className="border-t border-[#1E2638] pt-2">
              <MentorAssessmentCard
                assessment={take.assessment}
                weaknesses={weaknesses}
                onSeekTimestamp={handleSeekTimestamp}
              />
            </div>
          )
        ) : (
          <div className="document-section     p-4 text-center text-xs text-slate-400 font-mono">
            AI Mentor Assessment was not attached to this take or backend analysis failed.
          </div>
        )}
      </div>
    </div>
  );
};
