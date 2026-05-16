import { useEffect, useState, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { ChevronLeft, Play, Pause, Save, ArrowLeft, ArrowRight, LayoutPanelLeft } from 'lucide-react';

interface Box {
  class: number;
  obb: number[];
  track_id: string;
  plate_text: string;
}

interface ShotMeta {
  shot_id: string;
  num_frames: number;
  first_frame: string;
  frames: string[];
}

export default function ShotAnnotator() {
  const { dataset, split, shotId } = useParams();
  const navigate = useNavigate();
  
  const [shotMeta, setShotMeta] = useState<ShotMeta | null>(null);
  const [annotations, setAnnotations] = useState<Record<string, Box[]>>({});
  
  const [bgFrameIndex, setBgFrameIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  
  const [selectedBox, setSelectedBox] = useState<{frame: string, oldTrackId: string, newTrackId: string, plateText: string} | null>(null);
  const [saving, setSaving] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Colors for different tracks
  const colors = [
    '#ef4444', '#f97316', '#f59e0b', '#84cc16', '#22c55e', 
    '#10b981', '#14b8a6', '#06b6d4', '#0ea5e9', '#3b82f6', 
    '#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899', '#f43f5e'
  ];

  const getTrackColor = (trackId: string) => {
    if (trackId === "CACHE" || trackId === "-1") return "#64748b"; // Slate for unassigned/cache
    let hash = 0;
    for (let i = 0; i < trackId.length; i++) {
      hash = trackId.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  };

  useEffect(() => {
    // Fetch all shots and find ours
    axios.get(`http://localhost:8000/api/meta/shots?ds=${dataset}&split=${split}`)
      .then(res => {
        const found = res.data.find((s: ShotMeta) => s.shot_id === shotId);
        if (found) {
          setShotMeta(found);
          fetchAnnotations(found.frames);
        }
      })
      .catch(console.error);
  }, [dataset, split, shotId]);

  const fetchAnnotations = (frames: string[]) => {
    axios.post('http://localhost:8000/api/shot_annotations', {
      ds: dataset,
      split,
      frames
    }).then(res => {
      setAnnotations(res.data);
    }).catch(console.error);
  };

  useEffect(() => {
    let interval: any;
    if (isPlaying && shotMeta && shotMeta.frames.length > 0) {
      interval = setInterval(() => {
        setBgFrameIndex(prev => (prev + 1) % shotMeta.frames.length);
      }, 200); // 5 FPS
    }
    return () => clearInterval(interval);
  }, [isPlaying, shotMeta]);

  const handleSaveBox = async () => {
    if (!selectedBox) return;
    setSaving(true);
    try {
      const res = await axios.post('http://localhost:8000/api/annotate_box', {
        ds: dataset,
        split,
        frame: selectedBox.frame,
        old_track_id: selectedBox.oldTrackId,
        new_track_id: selectedBox.newTrackId,
        plate_text: selectedBox.plateText.trim().toUpperCase()
      });
      
      if (res.data.status === 'success') {
        // Update local state without fetching all
        setAnnotations(prev => {
          const newAnns = { ...prev };
          const frameBoxes = [...(newAnns[selectedBox.frame] || [])];
          const boxIdx = frameBoxes.findIndex(b => b.track_id === selectedBox.oldTrackId);
          if (boxIdx >= 0) {
            frameBoxes[boxIdx] = {
              ...frameBoxes[boxIdx],
              track_id: selectedBox.newTrackId,
              plate_text: selectedBox.plateText.trim().toUpperCase()
            };
          }
          newAnns[selectedBox.frame] = frameBoxes;
          return newAnns;
        });
        
        setSelectedBox(prev => prev ? { ...prev, oldTrackId: prev.newTrackId } : null);
      }
    } catch (err) {
      console.error(err);
      alert('Failed to save box annotation');
    } finally {
      setSaving(false);
    }
  };

  const trajectories = useMemo(() => {
    const trajs: Record<string, {cx: number, cy: number, frameIdx: number}[]> = {};
    if (!shotMeta) return trajs;
    
    shotMeta.frames.forEach((frame, idx) => {
      const boxes = annotations[frame] || [];
      boxes.forEach(box => {
        const { obb, track_id } = box;
        const xs = [obb[0], obb[2], obb[4], obb[6]];
        const ys = [obb[1], obb[3], obb[5], obb[7]];
        const cx = xs.reduce((a, b) => a + b, 0) / 4;
        const cy = ys.reduce((a, b) => a + b, 0) / 4;
        if (!trajs[track_id]) trajs[track_id] = [];
        trajs[track_id].push({cx, cy, frameIdx: idx});
      });
    });
    return trajs;
  }, [annotations, shotMeta]);

  if (!shotMeta) return <div className="p-8 text-white">Loading shot...</div>;

  const currentFrame = shotMeta.frames[bgFrameIndex];
  const currentBoxes = annotations[currentFrame] || [];

  return (
    <div className="flex-1 flex flex-col relative overflow-hidden">
      <header className="glass-panel border-b border-white/5 p-5 flex items-center justify-between z-10">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => navigate(-1)} 
            className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <div>
            <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
              <LayoutPanelLeft className="w-5 h-5 text-indigo-400"/>
              Shot Annotator: {shotId}
            </h2>
            <p className="text-sm text-slate-400">{dataset} / {split} • {shotMeta.num_frames} frames</p>
          </div>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden relative z-0">
        {/* Left Side: Interactive Viewport */}
        <div className="flex-1 p-6 flex flex-col relative bg-slate-900/20">
          
          <div className="flex-1 glass-panel rounded-3xl overflow-hidden flex flex-col items-center justify-center p-4 relative group gap-4" ref={containerRef}>
            <div className="relative flex items-center justify-center w-full h-full overflow-hidden shadow-2xl drop-shadow-[0_0_30px_rgba(99,102,241,0.1)] rounded-2xl">
              
              <div className="relative inline-block max-w-full max-h-full">
                <img 
                  src={`http://localhost:8000/api/image/${dataset}/${split}/${currentFrame}`} 
                  alt="Current Frame"
                  className="max-w-full max-h-full block pointer-events-none"
                />

                {/* SVG Overlay */}
                <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute top-0 left-0 w-full h-full drop-shadow-[0_0_10px_rgba(255,255,255,0.2)]">
                
                {/* Trajectories */}
                {Object.entries(trajectories).map(([tid, pts]) => (
                  <polyline 
                    key={`traj-${tid}`}
                    points={pts.map(p => `${p.cx * 100},${p.cy * 100}`).join(' ')}
                    fill="none"
                    stroke={getTrackColor(tid)}
                    strokeWidth="0.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="opacity-50"
                  />
                ))}

                {/* Bounding Boxes */}
                {currentBoxes.map((box, i) => {
                  const { obb, track_id, plate_text } = box;
                  const pts = `${obb[0]*100},${obb[1]*100} ${obb[2]*100},${obb[3]*100} ${obb[4]*100},${obb[5]*100} ${obb[6]*100},${obb[7]*100}`;
                  const color = getTrackColor(track_id);
                  const isActuallySelected = selectedBox?.frame === currentFrame && selectedBox?.oldTrackId === track_id;

                  // Find min Y to draw label
                  const minY = Math.min(obb[1], obb[3], obb[5], obb[7]) * 100;
                  const minX = Math.min(obb[0], obb[2], obb[4], obb[6]) * 100;

                  return (
                    <g key={`box-${i}`} 
                       onClick={() => setSelectedBox({
                         frame: currentFrame,
                         oldTrackId: track_id,
                         newTrackId: track_id,
                         plateText: plate_text || ''
                       })}
                       className="cursor-pointer transition-all duration-200"
                    >
                      <polygon 
                        points={pts}
                        fill={color}
                        fillOpacity={isActuallySelected ? 0.4 : 0.1}
                        stroke={color}
                        strokeWidth={isActuallySelected ? 0.6 : 0.3}
                      />
                      <text x={minX} y={minY - 1} fontSize="1.5" fill={color} fontWeight="bold" className="drop-shadow-md pointer-events-none">
                        T:{track_id} {plate_text ? `[${plate_text}]` : ''}
                      </text>
                    </g>
                  );
                })}
              </svg>
              </div>
            </div>
            
            {/* Playback Controls */}
            <div className="absolute bottom-6 flex items-center gap-3 bg-slate-950/80 backdrop-blur-md px-6 py-2 rounded-full border border-white/10 z-20 shadow-xl pointer-events-auto">
              <button onClick={() => setBgFrameIndex(prev => prev > 0 ? prev - 1 : shotMeta.frames.length - 1)} className="p-2 hover:bg-white/10 rounded-full text-white transition">
                <ArrowLeft className="w-5 h-5" />
              </button>
              <button onClick={() => setIsPlaying(!isPlaying)} className="p-3 bg-indigo-500 hover:bg-indigo-400 rounded-full text-white transition transform hover:scale-110 shadow-[0_0_15px_rgba(99,102,241,0.5)] mx-2">
                {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-1" />}
              </button>
              <button onClick={() => setBgFrameIndex(prev => (prev + 1) % shotMeta.frames.length)} className="p-2 hover:bg-white/10 rounded-full text-white transition">
                <ArrowRight className="w-5 h-5" />
              </button>
              <div className="ml-4 px-3 py-1 bg-white/5 rounded-md text-sm font-mono text-white/90">
                {bgFrameIndex + 1} / {shotMeta.frames.length}
              </div>
            </div>
            
          </div>
        </div>

        {/* Right Side: Editor Sidebar */}
        <div className="w-96 border-l border-white/5 bg-slate-900/40 p-6 flex flex-col gap-6">
          <div className="glass-panel rounded-2xl p-5 border border-white/5 shadow-xl">
            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse"></div>
              Edit Bounding Box
            </h3>
            
            {!selectedBox ? (
              <p className="text-slate-400 text-sm">Click on any bounding box in the main view to reassign its track ID or edit its license plate text.</p>
            ) : (
              <div className="flex flex-col gap-4">
                <div className="bg-black/30 p-3 rounded-xl border border-white/5 font-mono text-xs text-slate-300 break-all">
                  Frame: {selectedBox.frame}
                </div>
                
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Track ID</label>
                  <input 
                    type="text"
                    className="bg-slate-950 border border-white/10 rounded-xl px-4 py-2.5 text-white outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all font-mono"
                    value={selectedBox.newTrackId}
                    onChange={e => setSelectedBox({...selectedBox, newTrackId: e.target.value})}
                  />
                  <span className="text-[10px] text-slate-500">Change this to merge or split tracks.</span>
                </div>

                <div className="flex flex-col gap-1.5 mt-2">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Plate Text</label>
                  <input 
                    type="text"
                    className="bg-slate-950 border border-indigo-500/30 rounded-xl px-4 py-2.5 text-white uppercase outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20 transition-all font-mono font-bold text-lg"
                    placeholder="e.g. ABC-1234"
                    value={selectedBox.plateText}
                    onChange={e => setSelectedBox({...selectedBox, plateText: e.target.value})}
                    onKeyDown={e => e.key === 'Enter' && handleSaveBox()}
                  />
                </div>

                <button 
                  onClick={handleSaveBox}
                  disabled={saving || !selectedBox.newTrackId}
                  className="mt-4 flex items-center justify-center gap-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:from-slate-800 disabled:to-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-white px-6 py-3 rounded-xl font-bold shadow-lg shadow-indigo-500/25 transition-all active:scale-95"
                >
                  <Save className="w-5 h-5" />
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
