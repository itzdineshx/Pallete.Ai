
import React, { useState, useEffect } from 'react';
import { StyleUploader } from './components/StyleUploader';
import { Generator } from './components/Generator';
import { VoiceConsultant } from './components/VoiceConsultant';
import { StyleProfile, GeneratedImage, StyleAnalysisResponse } from './types';
import { LayoutGrid, Plus, Trash2, ArrowRight, Palette, ChevronLeft, Mic } from 'lucide-react';

export default function App() {
  const [activeProfile, setActiveProfile] = useState<StyleProfile | null>(null);
  const [generatedImages, setGeneratedImages] = useState<GeneratedImage[]>([]);
  const [showGallery, setShowGallery] = useState(false);
  const [showVoiceChat, setShowVoiceChat] = useState(false);
  
  // Persistence State
  const [savedProfiles, setSavedProfiles] = useState<StyleProfile[]>([]);
  const [viewMode, setViewMode] = useState<'LIBRARY' | 'CREATE'>('CREATE');

  // Load profiles on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem('palette_ai_profiles');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setSavedProfiles(parsed);
          setViewMode('LIBRARY');
        }
      }
    } catch (e) {
      console.error("Failed to load profiles", e);
    }
  }, []);

  // Save helper
  const saveProfilesToStorage = (profiles: StyleProfile[]) => {
    try {
      localStorage.setItem('palette_ai_profiles', JSON.stringify(profiles));
    } catch (e) {
      console.error("Storage quota exceeded or error", e);
      alert("Storage limit reached. Delete old styles to save new ones.");
    }
  };

  const handleStyleAnalyzed = (analysis: StyleAnalysisResponse, images: string[]) => {
    const newProfile: StyleProfile = {
      id: crypto.randomUUID(),
      name: analysis.suggestedName,
      description: analysis.artisticStyle,
      visualTechnique: analysis.visualTechnique,
      palette: analysis.colorPalette,
      moods: analysis.moodKeywords,
      referenceImages: images,
      createdAt: Date.now(),
      embedding: analysis.embedding,
      reasoning: analysis.reasoning,
      version: 1,
      history: []
    };
    
    const updatedProfiles = [newProfile, ...savedProfiles];
    setSavedProfiles(updatedProfiles);
    saveProfilesToStorage(updatedProfiles);
    
    setActiveProfile(newProfile);
    setShowGallery(false);
  };

  const handleImageGenerated = (img: GeneratedImage) => {
    setGeneratedImages(prev => [img, ...prev]);
  };

  const handleProfileUpdate = (updatedProfile: StyleProfile) => {
    setActiveProfile(updatedProfile);
    
    // Update in storage
    const updatedList = savedProfiles.map(p => p.id === updatedProfile.id ? updatedProfile : p);
    setSavedProfiles(updatedList);
    saveProfilesToStorage(updatedList);
  };

  const deleteProfile = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (confirm("Are you sure you want to delete this style profile?")) {
      const updatedList = savedProfiles.filter(p => p.id !== id);
      setSavedProfiles(updatedList);
      saveProfilesToStorage(updatedList);
      if (updatedList.length === 0) {
        setViewMode('CREATE');
      }
    }
  };

  const returnToDashboard = () => {
      setActiveProfile(null);
      setShowGallery(false);
      setViewMode(savedProfiles.length > 0 ? 'LIBRARY' : 'CREATE');
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans selection:bg-purple-500/30">
      
      {showVoiceChat && <VoiceConsultant activeProfile={activeProfile} onClose={() => setShowVoiceChat(false)} />}

      {/* Header */}
      <header className="h-16 border-b border-zinc-800 flex items-center justify-between px-6 bg-zinc-950/80 backdrop-blur z-40 fixed top-0 w-full">
        <div className="flex items-center gap-2 cursor-pointer" onClick={returnToDashboard}>
          <div className="w-6 h-6 bg-gradient-to-tr from-purple-500 to-indigo-500 rounded-md shadow-lg shadow-purple-500/20"></div>
          <span className="font-bold text-lg tracking-tight font-display bg-clip-text text-transparent bg-gradient-to-r from-white to-zinc-400">PaletteAI</span>
        </div>
        
        <div className="flex items-center gap-4">
          <button
             onClick={() => setShowVoiceChat(true)}
             className="flex items-center gap-2 text-sm bg-gradient-to-r from-indigo-500/10 to-purple-500/10 text-purple-200 hover:text-white px-3 py-1.5 rounded-full border border-purple-500/20 hover:border-purple-500/50 transition-all shadow-[0_0_10px_rgba(168,85,247,0.1)] hover:shadow-[0_0_15px_rgba(168,85,247,0.3)]"
           >
             <Mic size={14} className="animate-pulse" /> AI Consultant
           </button>

          {activeProfile && (
            <button 
              onClick={() => setShowGallery(!showGallery)}
              className={`p-2 rounded-lg transition-colors ${showGallery ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white'}`}
              title="Toggle Gallery"
            >
              <LayoutGrid size={20} />
            </button>
          )}
          {activeProfile && (
             <button
               onClick={returnToDashboard}
               className="flex items-center gap-1 text-sm bg-zinc-800 hover:bg-zinc-700 px-3 py-1.5 rounded-full transition-colors border border-zinc-700/50"
             >
               <Plus size={14} /> New Style
             </button>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 pt-16 flex overflow-hidden h-screen">
        {activeProfile ? (
          showGallery ? (
             <div className="w-full p-6 overflow-y-auto animate-fade-in">
               <div className="flex items-center justify-between mb-6">
                  <h2 className="text-2xl font-bold">Gallery</h2>
                  <span className="text-zinc-500 text-sm">{generatedImages.length} creations</span>
               </div>
               <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  {generatedImages.length === 0 ? (
                    <div className="col-span-full py-20 text-center">
                      <div className="inline-block p-4 rounded-full bg-zinc-900 mb-4">
                          <LayoutGrid className="text-zinc-600" size={32} />
                      </div>
                      <p className="text-zinc-500">No masterpieces yet.</p>
                    </div>
                  ) : (
                    generatedImages.map(img => (
                      <div key={img.id} className="group relative rounded-xl overflow-hidden bg-zinc-900 border border-zinc-800 aspect-square cursor-pointer hover:border-purple-500/50 transition-colors">
                        <img src={img.url} alt={img.prompt} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-4">
                          <p className="text-xs text-white line-clamp-2 font-medium">{img.prompt}</p>
                          <p className="text-[10px] text-zinc-400 mt-1 uppercase tracking-wider">{img.aspectRatio} • {new Date(img.timestamp).toLocaleDateString()}</p>
                        </div>
                      </div>
                    ))
                  )}
               </div>
             </div>
          ) : (
            <div className="w-full h-full relative">
               <Generator 
                  styleProfile={activeProfile} 
                  onImageGenerated={handleImageGenerated}
                  onReset={returnToDashboard}
                  onProfileUpdate={handleProfileUpdate}
                />
            </div>
          )
        ) : (
          // Landing / Dashboard
          <div className="w-full h-full overflow-y-auto bg-zinc-950">
            {viewMode === 'LIBRARY' && savedProfiles.length > 0 ? (
              <div className="max-w-6xl mx-auto p-6 md:p-12 animate-fade-in">
                <div className="flex items-end justify-between mb-10">
                   <div>
                     <h2 className="text-3xl font-bold text-white mb-2 font-display">Style Library</h2>
                     <p className="text-zinc-400">Select a style node to begin generation or edit parameters.</p>
                   </div>
                   <button 
                      onClick={() => setViewMode('CREATE')}
                      className="px-6 py-3 bg-white text-black font-bold rounded-xl hover:bg-zinc-200 transition-colors flex items-center gap-2 shadow-lg shadow-white/5"
                   >
                     <Plus size={18} /> New Style Node
                   </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {savedProfiles.map(profile => (
                    <div 
                      key={profile.id}
                      onClick={() => setActiveProfile(profile)}
                      className="group bg-zinc-900 border border-zinc-800 rounded-3xl overflow-hidden cursor-pointer hover:border-purple-500/50 transition-all hover:-translate-y-1 hover:shadow-2xl hover:shadow-purple-900/10 flex flex-col"
                    >
                      {/* Preview Strip */}
                      <div className="h-32 grid grid-cols-5 gap-0.5 bg-zinc-950">
                         {profile.referenceImages.slice(0, 5).map((img, i) => (
                           <img key={i} src={img} className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-opacity" />
                         ))}
                      </div>
                      
                      <div className="p-6 flex-1 flex flex-col">
                        <div className="flex justify-between items-start mb-2">
                           <div>
                              <h3 className="text-xl font-bold text-white group-hover:text-purple-400 transition-colors">{profile.name}</h3>
                              <p className="text-xs text-zinc-500 font-mono mt-1">v{profile.version} • {new Date(profile.createdAt).toLocaleDateString()}</p>
                           </div>
                           <button 
                             onClick={(e) => deleteProfile(e, profile.id)}
                             className="p-2 text-zinc-600 hover:text-red-400 hover:bg-zinc-800 rounded-lg transition-colors"
                           >
                             <Trash2 size={16} />
                           </button>
                        </div>
                        
                        <p className="text-sm text-zinc-400 line-clamp-2 mb-4 flex-1">{profile.description}</p>
                        
                        <div className="flex gap-2 flex-wrap mb-6">
                           {profile.palette.slice(0, 5).map((color, i) => (
                             <div key={i} className="w-4 h-4 rounded-full border border-white/10" style={{backgroundColor: color}} title={color} />
                           ))}
                        </div>

                        <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-zinc-500 group-hover:text-white transition-colors mt-auto pt-4 border-t border-zinc-800/50">
                          <span className="flex items-center gap-2"><Palette size={14}/> {profile.visualTechnique}</span>
                          <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform text-purple-500"/>
                        </div>
                      </div>
                    </div>
                  ))}
                  
                  {/* Create New Card (Inline) */}
                  <div 
                    onClick={() => setViewMode('CREATE')}
                    className="border-2 border-dashed border-zinc-800 rounded-3xl flex flex-col items-center justify-center p-10 cursor-pointer hover:bg-zinc-900/50 hover:border-zinc-700 transition-all text-zinc-500 hover:text-white group"
                  >
                     <div className="w-16 h-16 rounded-full bg-zinc-900 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                        <Plus size={32} />
                     </div>
                     <span className="font-bold">Create New Style</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="max-w-4xl mx-auto h-full flex flex-col justify-center px-6 relative">
                 {savedProfiles.length > 0 && (
                   <button 
                     onClick={() => setViewMode('LIBRARY')}
                     className="absolute top-6 left-6 flex items-center gap-2 text-zinc-400 hover:text-white transition-colors px-4 py-2 rounded-lg hover:bg-zinc-900"
                   >
                     <ChevronLeft size={16} /> Back to Library
                   </button>
                 )}
                 <StyleUploader onStyleAnalyzed={handleStyleAnalyzed} />
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
