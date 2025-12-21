import React, { useState } from 'react';
import { StyleProfile, StyleSnapshot } from '../types';
import { X, Save, RotateCcw, History, ArrowLeft, ArrowRight, Palette, Hash } from 'lucide-react';

interface StyleEditorProps {
  styleProfile: StyleProfile;
  onClose: () => void;
  onUpdate: (profile: StyleProfile) => void;
}

export const StyleEditor: React.FC<StyleEditorProps> = ({ styleProfile, onClose, onUpdate }) => {
  const [activeTab, setActiveTab] = useState<'edit' | 'history'>('edit');
  
  // Edit State
  const [name, setName] = useState(styleProfile.name);
  const [description, setDescription] = useState(styleProfile.description);
  const [technique, setTechnique] = useState(styleProfile.visualTechnique);
  const [palette, setPalette] = useState([...styleProfile.palette]);
  const [moods, setMoods] = useState([...styleProfile.moods]);
  const [moodInput, setMoodInput] = useState('');

  const handleSave = () => {
    const snapshot: StyleSnapshot = {
      version: styleProfile.version,
      timestamp: Date.now(),
      changeLog: `Updated parameters manually`,
      data: {
        name: styleProfile.name,
        description: styleProfile.description,
        visualTechnique: styleProfile.visualTechnique,
        palette: styleProfile.palette,
        moods: styleProfile.moods,
        referenceImages: styleProfile.referenceImages,
        embedding: styleProfile.embedding,
        reasoning: styleProfile.reasoning
      }
    };

    const updatedProfile: StyleProfile = {
      ...styleProfile,
      version: styleProfile.version + 1,
      history: [snapshot, ...styleProfile.history],
      name,
      description,
      visualTechnique: technique,
      palette,
      moods
    };

    onUpdate(updatedProfile);
    onClose();
  };

  const handleRevert = (snapshot: StyleSnapshot) => {
     // Create a snapshot of CURRENT state before reverting
     const currentSnapshot: StyleSnapshot = {
        version: styleProfile.version,
        timestamp: Date.now(),
        changeLog: `Reverted to v${snapshot.version}`,
        data: {
            name: styleProfile.name,
            description: styleProfile.description,
            visualTechnique: styleProfile.visualTechnique,
            palette: styleProfile.palette,
            moods: styleProfile.moods,
            referenceImages: styleProfile.referenceImages,
            embedding: styleProfile.embedding,
            reasoning: styleProfile.reasoning
        }
     };

     const revertedProfile: StyleProfile = {
         ...styleProfile,
         version: styleProfile.version + 1,
         history: [currentSnapshot, ...styleProfile.history],
         ...snapshot.data
     };
     
     onUpdate(revertedProfile);
     onClose();
  };

  const moveMood = (index: number, direction: 'left' | 'right') => {
    if ((direction === 'left' && index === 0) || (direction === 'right' && index === moods.length - 1)) return;
    const newMoods = [...moods];
    const swapIndex = direction === 'left' ? index - 1 : index + 1;
    [newMoods[index], newMoods[swapIndex]] = [newMoods[swapIndex], newMoods[index]];
    setMoods(newMoods);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
        <div className="bg-zinc-900 border border-zinc-700 w-full max-w-2xl rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-zinc-800 bg-zinc-900 z-10">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-purple-500/10 flex items-center justify-center border border-purple-500/20">
                        <Palette size={20} className="text-purple-400"/>
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-white">Tune Style Profile</h2>
                        <p className="text-xs text-zinc-500">v{styleProfile.version} • {styleProfile.id.slice(0, 8)}</p>
                    </div>
                </div>
                <button onClick={onClose} className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-white transition-colors"><X size={20}/></button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-zinc-800 px-6 bg-zinc-900/50">
                <button 
                    onClick={() => setActiveTab('edit')}
                    className={`py-3 px-4 text-sm font-medium border-b-2 transition-colors ${activeTab === 'edit' ? 'border-purple-500 text-purple-400' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}
                >
                    Edit Parameters
                </button>
                <button 
                    onClick={() => setActiveTab('history')}
                    className={`py-3 px-4 text-sm font-medium border-b-2 transition-colors ${activeTab === 'history' ? 'border-purple-500 text-purple-400' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}
                >
                    Version History ({styleProfile.history.length})
                </button>
            </div>

            {/* Content */}
            <div className="p-6 overflow-y-auto custom-scrollbar flex-1 bg-zinc-900/30">
                {activeTab === 'edit' ? (
                    <div className="space-y-8">
                        {/* Core Meta */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <label className="text-xs font-bold uppercase text-zinc-500 tracking-wider">Style Name</label>
                                <input 
                                    value={name} onChange={e => setName(e.target.value)}
                                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-white focus:border-purple-500 outline-none focus:ring-1 focus:ring-purple-500/50 transition-all placeholder:text-zinc-700"
                                    placeholder="e.g. Neo-Cyberpunk"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-bold uppercase text-zinc-500 tracking-wider">Visual Technique</label>
                                <input 
                                    value={technique} onChange={e => setTechnique(e.target.value)}
                                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-white focus:border-purple-500 outline-none focus:ring-1 focus:ring-purple-500/50 transition-all placeholder:text-zinc-700"
                                    placeholder="e.g. Impasto, Digital Glitch"
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-bold uppercase text-zinc-500 tracking-wider">Description</label>
                            <textarea 
                                value={description} onChange={e => setDescription(e.target.value)}
                                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-white focus:border-purple-500 outline-none h-24 resize-none focus:ring-1 focus:ring-purple-500/50 transition-all placeholder:text-zinc-700 text-sm leading-relaxed"
                                placeholder="Describe the artistic nuance..."
                            />
                        </div>

                        {/* Palette Editor */}
                        <div className="space-y-3">
                             <div className="flex items-center justify-between">
                                <label className="text-xs font-bold uppercase text-zinc-500 tracking-wider flex items-center gap-2"><Palette size={14}/> Color DNA</label>
                                <span className="text-[10px] text-zinc-600">Click swatch to pick, edit hex for precision</span>
                             </div>
                             <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                                {palette.map((color, idx) => (
                                    <div key={idx} className="flex items-center gap-2 bg-zinc-950 p-2 rounded-lg border border-zinc-800 hover:border-zinc-600 transition-colors">
                                        <div className="relative w-10 h-10 rounded-md overflow-hidden flex-shrink-0 border border-white/10 shadow-inner">
                                            <input 
                                                type="color" 
                                                value={color}
                                                onChange={(e) => {
                                                    const newPalette = [...palette];
                                                    newPalette[idx] = e.target.value;
                                                    setPalette(newPalette);
                                                }}
                                                className="absolute -inset-2 w-16 h-16 cursor-pointer p-0 border-none"
                                            />
                                        </div>
                                        <div className="flex items-center gap-1 flex-1 min-w-0">
                                            <Hash size={12} className="text-zinc-600"/>
                                            <input 
                                                type="text" 
                                                value={color.replace('#', '')}
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    const newPalette = [...palette];
                                                    newPalette[idx] = val.startsWith('#') ? val : `#${val}`;
                                                    setPalette(newPalette);
                                                }}
                                                className="bg-transparent text-sm font-mono text-zinc-300 w-full outline-none uppercase"
                                                maxLength={6}
                                            />
                                        </div>
                                    </div>
                                ))}
                             </div>
                        </div>

                        {/* Moods Editor */}
                         <div className="space-y-3">
                             <label className="text-xs font-bold uppercase text-zinc-500 tracking-wider">Semantic Mood Tags</label>
                             <div className="flex flex-wrap gap-2 bg-zinc-950 p-4 rounded-xl border border-zinc-800 min-h-[4rem]">
                                {moods.map((mood, idx) => (
                                    <div key={idx} className="bg-zinc-900 text-zinc-200 text-xs pl-3 pr-1 py-1 rounded-lg flex items-center gap-2 group border border-zinc-800 hover:border-purple-500/30 transition-all hover:bg-zinc-800 shadow-sm">
                                        <span className="font-medium">{mood}</span>
                                        <div className="flex items-center border-l border-zinc-700 ml-1 pl-1 gap-0.5">
                                            <button 
                                                onClick={() => moveMood(idx, 'left')} 
                                                disabled={idx === 0}
                                                className="p-1 hover:text-white text-zinc-500 disabled:opacity-20 transition-colors"
                                            >
                                                <ArrowLeft size={10}/>
                                            </button>
                                            <button 
                                                onClick={() => moveMood(idx, 'right')} 
                                                disabled={idx === moods.length - 1}
                                                className="p-1 hover:text-white text-zinc-500 disabled:opacity-20 transition-colors"
                                            >
                                                <ArrowRight size={10}/>
                                            </button>
                                            <button 
                                                onClick={() => setMoods(moods.filter((_, i) => i !== idx))} 
                                                className="p-1 hover:text-red-400 text-zinc-500 transition-colors"
                                            >
                                                <X size={12}/>
                                            </button>
                                        </div>
                                    </div>
                                ))}
                                <input 
                                    value={moodInput}
                                    onChange={e => setMoodInput(e.target.value)}
                                    onKeyDown={e => {
                                        if(e.key === 'Enter' && moodInput.trim()) {
                                            setMoods([...moods, moodInput.trim()]);
                                            setMoodInput('');
                                        }
                                    }}
                                    placeholder="+ type tag & enter"
                                    className="bg-transparent text-xs text-white outline-none min-w-[120px] placeholder:text-zinc-600 px-2"
                                />
                             </div>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {styleProfile.history.length === 0 ? (
                            <div className="text-center text-zinc-500 py-10 flex flex-col items-center">
                                <History className="w-12 h-12 mb-2 opacity-50"/>
                                <p>No history yet. Make some changes!</p>
                            </div>
                        ) : (
                            styleProfile.history.map((snapshot, idx) => (
                                <div key={idx} className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 flex items-center justify-between group hover:border-zinc-700 transition-colors">
                                    <div>
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="text-purple-400 font-bold font-mono text-sm bg-purple-500/10 px-1.5 rounded">v{snapshot.version}</span>
                                            <span className="text-zinc-600 text-xs">{new Date(snapshot.timestamp).toLocaleString()}</span>
                                        </div>
                                        <p className="text-zinc-400 text-sm">{snapshot.changeLog}</p>
                                    </div>
                                    <button 
                                        onClick={() => handleRevert(snapshot)}
                                        className="opacity-0 group-hover:opacity-100 flex items-center gap-2 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-xs font-medium transition-all text-zinc-300 hover:text-white shadow-md"
                                    >
                                        <RotateCcw size={14}/> Revert
                                    </button>
                                </div>
                            ))
                        )}
                    </div>
                )}
            </div>

            {/* Footer */}
            {activeTab === 'edit' && (
                <div className="p-6 border-t border-zinc-800 bg-zinc-900 z-10 flex items-center gap-4">
                     <div className="flex-1 text-xs text-zinc-500">
                        Changes will be saved as a new version automatically.
                     </div>
                    <button 
                        onClick={handleSave}
                        className="px-8 py-3 bg-white text-black font-bold rounded-xl hover:bg-zinc-200 transition-colors flex items-center justify-center gap-2 shadow-lg hover:shadow-white/10 active:scale-[0.99]"
                    >
                        <Save size={18}/> Save v{styleProfile.version + 1}
                    </button>
                </div>
            )}
        </div>
    </div>
  );
};