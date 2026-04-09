import { useState, useEffect } from 'react';
import axios from 'axios';
import { ChevronLeft, ChevronRight, RotateCcw, Link2 } from 'lucide-react';

export default function SyncTool() {
  const [currentFrame, setCurrentFrame] = useState("11_shot1_normal_normal_00005073_fisheye_00002448.jpg");
  const [dataset, setDataset] = useState("normal");
  const [split, setSplit] = useState("train");

  const [syncData, setSyncData] = useState<any>(null);
  
  const [leftBoxes, setLeftBoxes] = useState<any>([]);
  const [rightBoxes, setRightBoxes] = useState<any>([]);

  useEffect(() => {
    // Load sync pair
    axios.get(`http://localhost:8000/api/sync_pair?ds=${dataset}&split=${split}&img_name=${currentFrame}`)
      .then(res => {
        setSyncData(res.data);
        
        // Fetch frame info for left (current)
        axios.get(`http://localhost:8000/api/frame_info/${dataset}/${split}/${currentFrame}`)
          .then(res2 => setLeftBoxes(res2.data.boxes)).catch(console.error);

        // Fetch frame info for right (counterpart)
        if (res.data.counterpart) {
          axios.get(`http://localhost:8000/api/frame_info/${res.data.other_ds}/${split}/${res.data.counterpart}`)
            .then(res3 => setRightBoxes(res3.data.boxes)).catch(console.error);
        } else {
          setRightBoxes([]);
        }
      }).catch(console.error);
  }, [currentFrame, dataset, split]);

  const handleCopyLabel = async (sourceBox: any, targetBox: any, sourceDs: string) => {
    const text = prompt("Confirm copying label to target track:", sourceBox.track_id);
    if (!text) return;
    
    const targetDs = sourceDs === "normal" ? "fisheye" : "normal";
    
    // Call annotate endpoint to update the target track with this text
    try {
      // Note: We need all frames for the target track. This is simplified. 
      // For a robust system, we would fetch the target track's metadata to get all frames.
      // But we can apply it to just the current frame for now, or alert that we need full track info.
      alert(`Annotating Target Track #${targetBox.track_id} with label: ${text}`);
      // In a real app, GET /api/meta/tracks to find targetBox.track_id, then POST /api/annotate
    } catch(err) {
      console.error(err);
    }
  };

  const renderFrameView = (imgUrl: string, boxes: any[], sideDs: string, oppositeDs: string, oppositeBoxes: any[]) => {
    return (
      <div className="relative flex-1 bg-black flex items-center justify-center overflow-hidden border border-slate-700">
        <div className="relative max-w-full max-h-full">
          <img src={imgUrl} className="max-w-full max-h-[80vh] object-contain" />
          {/* Overlay OBBs using absolute positioning over the image */}
          {boxes.map((b, i) => {
             // Calculate bounding rect relative to 0-1 coords
             const xs = [b.obb[0], b.obb[2], b.obb[4], b.obb[6]];
             const ys = [b.obb[1], b.obb[3], b.obb[5], b.obb[7]];
             const left = Math.min(...xs) * 100;
             const top = Math.min(...ys) * 100;
             const width = (Math.max(...xs) - Math.min(...xs)) * 100;
             const height = (Math.max(...ys) - Math.min(...ys)) * 100;
             
             return (
              <div 
                key={i}
                className="absolute border-2 border-indigo-500 bg-indigo-500/20 group hover:z-50"
                style={{ left: `${left}%`, top: `${top}%`, width: `${width}%`, height: `${height}%` }}
              >
                <div className="absolute -top-6 left-0 bg-indigo-600 text-white text-xs px-2 py-1 rounded whitespace-nowrap hidden group-hover:flex gap-2 items-center">
                  Track: {b.track_id}
                  {oppositeBoxes.length > 0 && (
                    <button 
                      onClick={() => handleCopyLabel(b, oppositeBoxes[0], sideDs)}
                      className="bg-white/20 hover:bg-white/30 px-2 py-0.5 rounded flex items-center gap-1"
                    >
                      <Link2 className="w-3 h-3" /> Infer to {oppositeDs}
                    </button>
                  )}
                </div>
              </div>
             )
          })}
        </div>
      </div>
    );
  };

  if (!syncData) return <div className="p-8 text-white">Loading Sync Tool...</div>;

  return (
    <div className="flex-1 flex flex-col relative overflow-hidden">
      <header className="glass-panel border-b border-white/5 p-5 flex items-center justify-between z-10">
        <div>
          <h2 className="text-xl font-bold bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent flex items-center gap-3">
            Cross-Camera Synchronization
          </h2>
          <p className="text-sm text-slate-400 font-mono mt-1">{currentFrame}</p>
        </div>
        
        <div className="flex items-center gap-3">
          <button 
            disabled={!syncData.prev}
            onClick={() => setCurrentFrame(syncData.prev)}
            className="flex items-center gap-2 glass-panel hover:bg-white/5 disabled:opacity-30 disabled:hover:bg-transparent text-white px-5 py-2.5 rounded-xl font-medium transition-all"
          >
            <ChevronLeft className="w-4 h-4" /> Prev Frame
          </button>
          
          <button 
            onClick={() => console.log("Reset logic")}
            className="flex items-center gap-2 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 hover:text-indigo-300 border border-indigo-500/20 px-5 py-2.5 rounded-xl font-medium transition-all"
          >
            <RotateCcw className="w-4 h-4" /> Reset
          </button>
          
          <button 
            disabled={!syncData.next}
            onClick={() => setCurrentFrame(syncData.next)}
            className="flex items-center gap-2 glass-panel hover:bg-white/5 disabled:opacity-30 disabled:hover:bg-transparent text-white px-5 py-2.5 rounded-xl font-medium transition-all"
          >
            Next Frame <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </header>

      <div className="flex-1 flex flex-col md:flex-row p-6 gap-6 overflow-hidden relative z-0">
        
        {/* Left Side (Current DS) */}
        <div className="flex-1 flex flex-col overflow-hidden glass-panel rounded-3xl p-1 relative group">
          <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity rounded-3xl"></div>
          <h3 className="text-center font-bold text-indigo-300 py-3 uppercase tracking-widest text-sm bg-black/40 border-b border-white/5 rounded-t-3xl relative z-10 flex items-center justify-center gap-2">
            {dataset} Camera
          </h3>
          <div className="flex-1 relative z-10 p-2">
            {renderFrameView(`http://localhost:8000/api/image/${dataset}/${split}/${currentFrame}`, leftBoxes, dataset, syncData.other_ds, rightBoxes)}
          </div>
        </div>

        {/* Right Side (Other DS) */}
        <div className="flex-1 flex flex-col overflow-hidden glass-panel rounded-3xl p-1 relative group">
          <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 to-pink-500/5 opacity-0 group-hover:opacity-100 transition-opacity rounded-3xl"></div>
          <h3 className="text-center font-bold text-purple-300 py-3 uppercase tracking-widest text-sm bg-black/40 border-b border-white/5 rounded-t-3xl relative z-10 flex items-center justify-center gap-2">
            {syncData.other_ds} Camera
          </h3>
          <div className="flex-1 relative z-10 p-2">
          {syncData.counterpart ? (
            renderFrameView(`http://localhost:8000/api/image/${syncData.other_ds}/${split}/${syncData.counterpart}`, rightBoxes, syncData.other_ds, dataset, leftBoxes)
          ) : (
            <div className="flex-1 h-full bg-black/40 flex items-center justify-center rounded-2xl border border-white/5 text-slate-500 backdrop-blur-md">
              <div className="flex flex-col items-center gap-3">
                <Link2 className="w-8 h-8 opacity-20" />
                <span>No synced counterpart found for this timestamp.</span>
              </div>
            </div>
          )}
          </div>
        </div>

      </div>
    </div>
  );
}
