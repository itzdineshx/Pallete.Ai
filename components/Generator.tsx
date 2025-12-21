import React, { useState, useRef, useEffect } from 'react';
import { StyleProfile, GeneratedImage } from '../types';
import { generateFromGraph, performReasoning } from '../services/fluxService';
import { Loader2, Download, Sparkles, Wand2, Paperclip, X, Upload, Layers, Sliders, Image as ImageIcon, Trash2, Plus, Split, ChevronDown, ChevronUp, AlertCircle } from 'lucide-react';
import { StyleEditor } from './StyleEditor';

interface GeneratorProps {
  styleProfile: StyleProfile;
  onImageGenerated: (img: GeneratedImage) => void;
  onReset: () => void;
  onProfileUpdate?: (updated: StyleProfile) => void;
}

type Mode = 'GENERATE' | 'EDIT';

export const Generator: React.FC<GeneratorProps> = ({ styleProfile, onImageGenerated, onReset, onProfileUpdate }) => {
  const [mode, setMode] = useState<Mode>('GENERATE');
  const [prompt, setPrompt] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentImage, setCurrentImage] = useState<GeneratedImage | null>(null);
  const [aspectRatio, setAspectRatio] = useState<"1:1" | "3:4" | "4:3" | "16:9">("1:1");
  const [resolution, setResolution] = useState<"1K" | "2K" | "4K">("1K");
  const [showSettings, setShowSettings] = useState(false);
  const [isComparing, setIsComparing] = useState(false);
  
  // Refiners
  const [intensity, setIntensity] = useState(0.8);
  const [negativePrompt, setNegativePrompt] = useState('');
  const [transformCreativity, setTransformCreativity] = useState(0.5); // 0 = Strict, 1 = Free
  
  // Attachments (Maps to "User Insert Photo" node in diagram)
  const [attachments, setAttachments] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Editor Modal
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  
  // Comparison State
  const [compareImage, setCompareImage] = useState<GeneratedImage | null>(null);
  
  // Variations Panel
  const [isGeneratingVariations, setIsGeneratingVariations] = useState(false);
  const [variations, setVariations] = useState<GeneratedImage[]>([]);

  // Auto-switch mode based on attachments
  useEffect(() => {
    if (attachments.length > 0 && mode === 'GENERATE') {
      setMode('EDIT');
    } else if (attachments.length === 0 && mode === 'EDIT' && !currentImage) {
      setMode('GENERATE');
    }
  }, [attachments.length]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    setUploadError(null);

    const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
    const maxSize = 5 * 1024 * 1024; // 5MB

    const newAttachments: string[] = [];
    let errorMsg = null;

    const processFile = (file: File): Promise<void> => {
      return new Promise((resolve) => {
        if (!validTypes.includes(file.type)) {
          errorMsg = "Unsupported file type. Use JPG, PNG, or WebP.";
          resolve();
          return;
        }
        if (file.size > maxSize) {
          errorMsg = "File too large. Max 5MB.";
          resolve();
          return;
        }

        const reader = new FileReader();
        reader.onload = (ev) => {
          if (ev.target?.result) {
            newAttachments.push(ev.target.result as string);
          }
          resolve();
        };
        reader.readAsDataURL(file);
      });
    };

    Promise.all(Array.from(files).map(processFile)).then(() => {
      if (errorMsg && newAttachments.length === 0) {
        setUploadError(errorMsg);
      } else {
        setAttachments(prev => [...prev, ...newAttachments]);
        setMode('EDIT');
      }
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    });
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const clearAttachments = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setAttachments([]);
  };

  const handleAction = async () => {
    if (!prompt.trim()) return;
    setIsProcessing(true);
    setCompareImage(null);
    setVariations([]);

    try {
        // Node: Reason-fusion
        // Mix in refiners
        let augmentedPrompt = prompt;
        if (negativePrompt) {
            augmentedPrompt += ` (Exclude: ${negativePrompt})`;
        }
        if (mode === 'EDIT') {
            const creativityLabel = transformCreativity < 0.3 ? "Keep strict adherence to structure." : transformCreativity > 0.7 ? "Allow significant creative freedom." : "Balanced transformation.";
            augmentedPrompt += ` [Instruction: ${creativityLabel}]`;
        }
        
        const fused = await performReasoning(augmentedPrompt, styleProfile, intensity);
        
        // Node: Generation
        const base64 = await generateFromGraph(
          prompt, 
          fused, 
          styleProfile.referenceImages, 
          attachments, 
          aspectRatio,
          resolution
        );

        const newImage: GeneratedImage = {
          id: crypto.randomUUID(),
          url: base64,
          prompt: prompt,
          fusedPrompt: fused,
          styleId: styleProfile.id,
          timestamp: Date.now(),
          aspectRatio,
          resolution
        };
        
        setCurrentImage(newImage);
        onImageGenerated(newImage);
        
        // Handle Comparison (Split Test)
        if (isComparing) {
            // Raw generation usually follows default settings, but we keep aspect ratio
            const rawBase64 = await generateFromGraph(prompt, prompt, [], attachments, aspectRatio, resolution);
             const rawImage: GeneratedImage = {
                id: crypto.randomUUID(),
                url: rawBase64,
                prompt: prompt,
                fusedPrompt: "Raw Generation",
                styleId: "raw",
                timestamp: Date.now(),
                aspectRatio,
                resolution
            };
            setCompareImage(rawImage);
        }
        
        // Chain Output for Editing
        if (attachments.length > 0) {
             setAttachments([base64]);
        }

    } catch (e) {
      console.error(e);
      alert("Graph execution failed.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleVariations = async () => {
      if (!currentImage) return;
      setIsGeneratingVariations(true);
      try {
          const variants = await Promise.all([1, 2, 3].map(async () => {
              const base64 = await generateFromGraph(
                  currentImage.prompt + " (variation)",
                  currentImage.fusedPrompt,
                  styleProfile.referenceImages,
                  attachments,
                  currentImage.aspectRatio,
                  currentImage.resolution
              );
              return {
                  id: crypto.randomUUID(),
                  url: base64,
                  prompt: currentImage.prompt,
                  fusedPrompt: currentImage.fusedPrompt,
                  styleId: styleProfile.id,
                  timestamp: Date.now(),
                  aspectRatio: currentImage.aspectRatio,
                  resolution: currentImage.resolution
              } as GeneratedImage;
          }));
          setVariations(variants);
      } catch (e) {
          console.error(e);
      } finally {
          setIsGeneratingVariations(false);
      }
  };

  return (
    <div className="w-full h-full flex flex-col md:flex-row gap-6 p-4 md:p-6 animate-fade-in overflow-hidden relative">
      
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleFileUpload} 
        accept="image/png, image/jpeg, image/webp" 
        multiple
        className="hidden" 
      />

      {isEditorOpen && onProfileUpdate && (
          <StyleEditor 
             styleProfile={styleProfile} 
             onClose={() => setIsEditorOpen(false)}
             onUpdate={onProfileUpdate}
          />
      )}

      {/* Left Panel: Controls */}
      <div className="w-full md:w-[400px] flex-shrink-0 flex flex-col gap-6 overflow-y-auto scrollbar-hide pr-2">
        
        {/* Header */}
        <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-white tracking-tight">Style Graph</h2>
                <div className="flex gap-2 items-center mt-1">
                   <div className="text-xs text-zinc-400 font-medium bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800">
                     {styleProfile.name}
                   </div>
                   <button onClick={onReset} className="text-[10px] text-zinc-500 hover:text-purple-400 transition-colors uppercase tracking-wider font-semibold">Change Node</button>
                </div>
              </div>
              
              <button 
                onClick={() => setIsEditorOpen(true)}
                className="p-2 bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-all"
                title="Edit Style DB"
              >
                <Sliders size={16} />
              </button>
            </div>

            <div className="bg-zinc-900/80 p-1 rounded-xl flex gap-1 border border-zinc-800 shadow-inner">
                <button 
                    onClick={() => { setMode('GENERATE'); if(attachments.length > 0) clearAttachments(); }}
                    className={`flex-1 py-2.5 text-xs font-bold uppercase tracking-wider rounded-lg flex items-center justify-center gap-2 transition-all duration-300 ${mode === 'GENERATE' ? 'bg-zinc-800 text-white shadow-md ring-1 ring-white/5' : 'text-zinc-500 hover:text-zinc-300'}`}
                >
                    <Sparkles size={14} /> Generate
                </button>
                <button 
                    onClick={() => setMode('EDIT')}
                    className={`flex-1 py-2.5 text-xs font-bold uppercase tracking-wider rounded-lg flex items-center justify-center gap-2 transition-all duration-300 ${mode === 'EDIT' ? 'bg-zinc-800 text-white shadow-md ring-1 ring-white/5' : 'text-zinc-500 hover:text-zinc-300'}`}
                >
                    <Wand2 size={14} /> Transform
                </button>
            </div>
        </div>

        {/* Dynamic Controls */}
        <div className="flex-1 flex flex-col gap-5">
          
          {mode === 'GENERATE' ? (
             <div className="animate-in fade-in slide-in-from-left-4 duration-300 space-y-5">
               {/* Primary Slider */}
               <div className="space-y-3 bg-zinc-900/40 rounded-2xl p-5 border border-zinc-800/50 hover:border-zinc-700/50 transition-colors">
                 <div className="flex justify-between items-end">
                    <label className="text-sm font-semibold text-zinc-200">Fusion Weight</label>
                    <span className="text-xs font-mono text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded">{Math.round(intensity * 100)}%</span>
                 </div>
                 <div className="relative h-6 flex items-center">
                    <div className="absolute inset-x-0 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-300" style={{width: `${intensity * 100}%`}} />
                    </div>
                    <input 
                    type="range" min="0" max="1" step="0.1" 
                    value={intensity} 
                    onChange={(e) => setIntensity(parseFloat(e.target.value))}
                    className="absolute inset-0 w-full opacity-0 cursor-pointer"
                    />
                    <div 
                        className="w-4 h-4 bg-white rounded-full shadow-lg absolute pointer-events-none transition-all duration-75 border-2 border-purple-500"
                        style={{left: `calc(${intensity * 100}% - 8px)`}}
                    />
                 </div>
               </div>

               {/* Advanced Refiners */}
               <div className="border border-zinc-800 rounded-xl overflow-hidden">
                   <button 
                      onClick={() => setShowSettings(!showSettings)} 
                      className="w-full flex items-center justify-between p-3 bg-zinc-900/50 text-xs font-bold uppercase tracking-wider text-zinc-400 hover:bg-zinc-900 hover:text-white transition-colors"
                   >
                       Advanced Refiners
                       {showSettings ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}
                   </button>
                   {showSettings && (
                       <div className="p-4 bg-zinc-900/30 space-y-5 animate-in slide-in-from-top-2">
                           {/* Aspect Ratio */}
                           <div className="space-y-2">
                               <label className="text-xs font-semibold text-zinc-500">Aspect Ratio</label>
                               <div className="grid grid-cols-4 gap-2">
                                   {["1:1", "3:4", "4:3", "16:9"].map((r) => (
                                       <button 
                                           key={r}
                                           onClick={() => setAspectRatio(r as any)}
                                           title={r === "1:1" ? "Square" : r === "3:4" ? "Portrait" : r === "4:3" ? "Landscape" : "Wide"}
                                           className={`group relative flex flex-col items-center justify-center py-3 rounded-lg border transition-all duration-200 ${
                                               aspectRatio === r 
                                               ? 'bg-zinc-800 border-purple-500 text-purple-400 shadow-lg shadow-purple-900/20' 
                                               : 'bg-zinc-900/50 border-zinc-700 text-zinc-400 hover:border-zinc-600 hover:bg-zinc-800'
                                           }`}
                                       >
                                           <div 
                                                className={`border-2 rounded-sm mb-1.5 transition-colors ${aspectRatio === r ? 'border-purple-400 bg-purple-400/20' : 'border-zinc-500 group-hover:border-zinc-400'}`}
                                                style={{
                                                    width: r === '1:1' ? '18px' : r === '16:9' ? '24px' : r === '4:3' ? '22px' : '14px',
                                                    height: r === '1:1' ? '18px' : r === '16:9' ? '14px' : r === '4:3' ? '16px' : '20px'
                                                }}
                                           />
                                           <span className="text-[10px] font-medium">{r}</span>
                                       </button>
                                   ))}
                               </div>
                           </div>

                           {/* Resolution */}
                           <div className="space-y-2 pt-2 border-t border-zinc-800/50">
                               <div className="flex justify-between items-center">
                                   <label className="text-xs font-semibold text-zinc-500">Resolution</label>
                                   <span className="text-[9px] text-zinc-600 font-mono uppercase">{resolution === '1K' ? 'Standard' : 'HD'}</span>
                               </div>
                               <div className="flex gap-2">
                                   {["1K", "2K", "4K"].map((res) => (
                                       <button
                                           key={res}
                                           onClick={() => setResolution(res as any)}
                                           className={`flex-1 py-2 rounded-lg text-[10px] font-bold border transition-all duration-200 ${
                                               resolution === res 
                                               ? 'bg-zinc-800 border-purple-500 text-purple-400 shadow-lg shadow-purple-900/20' 
                                               : 'bg-zinc-900/50 border-zinc-700 text-zinc-400 hover:border-zinc-600 hover:bg-zinc-800'
                                           }`}
                                       >
                                           {res}
                                       </button>
                                   ))}
                               </div>
                           </div>
                           
                           {/* Negative Prompt */}
                           <div className="space-y-2 pt-2 border-t border-zinc-800/50">
                               <label className="text-xs font-semibold text-zinc-500">Negative Prompt</label>
                               <input 
                                  value={negativePrompt}
                                  onChange={(e) => setNegativePrompt(e.target.value)}
                                  placeholder="e.g. text, blur, watermark"
                                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-xs text-white placeholder:text-zinc-700 focus:border-purple-500/50 outline-none transition-colors"
                               />
                           </div>
                       </div>
                   )}
               </div>

                {/* Compare Toggle */}
                <button 
                    onClick={() => setIsComparing(!isComparing)}
                    className={`w-full py-3 px-4 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center justify-between border transition-all ${isComparing ? 'bg-purple-500/10 border-purple-500/50 text-purple-200' : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700'}`}
                >
                    <div className="flex items-center gap-2"><Split size={14}/> Compare (Split Test)</div>
                    <div className={`w-8 h-4 rounded-full p-0.5 transition-colors ${isComparing ? 'bg-purple-500' : 'bg-zinc-700'}`}>
                        <div className={`w-3 h-3 bg-white rounded-full shadow-sm transition-transform ${isComparing ? 'translate-x-4' : 'translate-x-0'}`} />
                    </div>
                </button>
             </div>
          ) : (
             <div className="animate-in fade-in slide-in-from-right-4 duration-300 space-y-4">
               {attachments.length === 0 && (
                    <div 
                        onClick={() => fileInputRef.current?.click()}
                        className="aspect-video rounded-2xl border-2 border-dashed border-zinc-800 bg-zinc-900/30 hover:bg-zinc-900/50 hover:border-zinc-600 transition-all cursor-pointer flex flex-col items-center justify-center gap-3 group"
                    >
                        <div className="w-12 h-12 bg-zinc-800 rounded-full flex items-center justify-center group-hover:bg-zinc-700 group-hover:scale-110 transition-all">
                            <ImageIcon className="text-zinc-500 group-hover:text-zinc-300" size={24} />
                        </div>
                        <div className="text-center">
                            <p className="text-sm font-medium text-zinc-300 group-hover:text-white">Upload User Photo</p>
                            <p className="text-xs text-zinc-500 mt-1">Select image to transform</p>
                        </div>
                    </div>
                )}
                
                {attachments.length > 0 && (
                    <div className="bg-zinc-900/40 border border-zinc-800 p-4 rounded-2xl">
                         <div className="flex justify-between items-center mb-3">
                             <label className="text-xs font-bold uppercase text-zinc-500 tracking-wider">Creativity</label>
                             <span className="text-[10px] text-zinc-400">
                                 {transformCreativity < 0.3 ? "Strict" : transformCreativity > 0.7 ? "Free" : "Balanced"}
                             </span>
                         </div>
                         <div className="flex items-center gap-3">
                             <span className="text-[10px] font-mono text-zinc-600">Structure</span>
                             <div className="relative flex-1 h-1.5 bg-zinc-800 rounded-full">
                                 <div 
                                    className="absolute inset-y-0 left-0 bg-indigo-500 rounded-full" 
                                    style={{width: `${transformCreativity * 100}%`}}
                                 />
                                 <input 
                                    type="range" min="0" max="1" step="0.1"
                                    value={transformCreativity}
                                    onChange={(e) => setTransformCreativity(parseFloat(e.target.value))}
                                    className="absolute inset-0 opacity-0 cursor-pointer"
                                 />
                             </div>
                             <span className="text-[10px] font-mono text-zinc-600">Freedom</span>
                         </div>
                    </div>
                )}
             </div>
          )}

          {/* Prompt Area */}
          <div className="mt-auto space-y-3">
             <div className="flex justify-between items-end">
                <label className="text-sm font-semibold text-zinc-200">
                    {mode === 'GENERATE' ? 'Prompt' : 'Instructions'}
                </label>
                
                {attachments.length > 0 && (
                    <button 
                        onClick={clearAttachments}
                        className="text-[10px] text-red-400 hover:text-red-300 font-medium flex items-center gap-1"
                    >
                        <Trash2 size={12} /> Clear User Input
                    </button>
                )}
             </div>
             
             <div className="relative group">
                 <div className="absolute -inset-0.5 bg-gradient-to-r from-purple-500 to-indigo-500 rounded-xl opacity-0 group-focus-within:opacity-100 transition-opacity blur opacity-20"></div>
                 <div className="relative bg-zinc-950 border border-zinc-800 rounded-xl shadow-sm flex flex-col">
                    
                    {/* Attachment Rail */}
                    {attachments.length > 0 && (
                        <div className="p-3 pb-0 flex gap-2 overflow-x-auto scrollbar-hide">
                            {attachments.map((src, i) => (
                                <div key={i} className="relative flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border border-zinc-700 group/thumb">
                                    <img src={src} alt="attachment" className="w-full h-full object-cover" />
                                    <button 
                                        onClick={() => removeAttachment(i)}
                                        className="absolute top-0.5 right-0.5 p-0.5 bg-black/60 rounded-full text-white opacity-0 group-hover/thumb:opacity-100 transition-opacity hover:bg-red-500"
                                    >
                                        <X size={10} />
                                    </button>
                                </div>
                            ))}
                            <button 
                                onClick={() => fileInputRef.current?.click()}
                                className="flex-shrink-0 w-16 h-16 rounded-lg border border-dashed border-zinc-700 flex items-center justify-center text-zinc-600 hover:text-zinc-400 hover:border-zinc-500 transition-colors"
                            >
                                <Plus size={16} />
                            </button>
                        </div>
                    )}
                    
                    <textarea 
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleAction();
                            }
                        }}
                        placeholder={mode === 'GENERATE' ? "Describe your vision..." : "E.g. Transform this photo into the style..."}
                        className={`w-full bg-transparent p-4 text-sm text-white focus:outline-none resize-none placeholder:text-zinc-600 font-medium leading-relaxed ${attachments.length > 0 ? 'h-24' : 'h-32'}`}
                    />
                    
                    {/* Toolbar */}
                    <div className="bg-zinc-900/50 px-3 py-2 border-t border-zinc-800/50 flex justify-between items-center">
                        <div className="flex items-center gap-2">
                            <button 
                                onClick={() => fileInputRef.current?.click()}
                                className="p-2 text-zinc-500 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
                                title="Attach User Photo"
                            >
                                <Paperclip size={16} />
                            </button>
                            {isUploading && <Loader2 size={16} className="text-zinc-500 animate-spin" />}
                        </div>
                        <span className="text-[10px] text-zinc-600 font-mono">
                             {prompt.length} / 500
                         </span>
                    </div>
                 </div>
             </div>
          </div>

          <button
            onClick={handleAction}
            disabled={isProcessing || !prompt}
            className={`w-full py-4 rounded-xl font-bold text-sm uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg transition-all duration-200
              ${isProcessing || !prompt
                ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed' 
                : 'bg-white text-black hover:bg-zinc-200 hover:scale-[1.01] active:scale-[0.99] shadow-white/5'}`}
          >
            {isProcessing ? <Loader2 className="animate-spin" size={18} /> : mode === 'GENERATE' ? <Sparkles size={18} /> : <Wand2 size={18} />}
            {isProcessing ? "Processing Graph..." : "Run Workflow"}
          </button>
        </div>
      </div>

      {/* Right Panel: Canvas (Maps to Output) */}
      <div className="flex-1 bg-zinc-900/30 rounded-3xl border border-zinc-800/50 flex flex-col items-center justify-center relative overflow-hidden group/canvas backdrop-blur-sm">
        
        {isComparing && currentImage && compareImage ? (
             <div className="grid grid-cols-2 gap-4 w-full h-full p-4">
                 <div className="flex flex-col h-full relative group/a">
                    <img src={currentImage.url} className="flex-1 object-contain rounded-xl border border-purple-500/50" />
                    <span className="absolute top-4 left-4 bg-purple-600 text-white text-xs px-2 py-1 rounded-md font-bold z-10">Fused Style</span>
                 </div>
                 <div className="flex flex-col h-full relative group/b">
                    <img src={compareImage.url} className="flex-1 object-contain rounded-xl border border-zinc-700" />
                    <span className="absolute top-4 left-4 bg-zinc-700 text-zinc-300 text-xs px-2 py-1 rounded-md font-bold z-10">Raw Prompt</span>
                 </div>
             </div>
        ) : currentImage ? (
          <>
            <div className="flex-1 w-full flex items-center justify-center p-6 relative">
                 <img 
                  src={currentImage.url} 
                  alt="Generated" 
                  className="max-w-full max-h-full object-contain shadow-2xl animate-in fade-in zoom-in duration-500 rounded-lg" 
                />
            </div>
            
            {/* Variations Panel */}
            {isGeneratingVariations || variations.length > 0 ? (
                <div className="w-full bg-zinc-900/80 border-t border-zinc-800 p-4 animate-in slide-in-from-bottom-10">
                    <h3 className="text-xs font-bold uppercase text-zinc-500 mb-3 tracking-wider">Variations</h3>
                    <div className="flex gap-4 overflow-x-auto scrollbar-hide pb-2">
                        {isGeneratingVariations ? (
                             [1,2,3].map(i => (
                                 <div key={i} className="w-32 h-32 flex-shrink-0 rounded-lg bg-zinc-800 animate-pulse border border-zinc-700"></div>
                             ))
                        ) : (
                            variations.map(v => (
                                <div key={v.id} className="w-32 h-32 flex-shrink-0 rounded-lg relative group cursor-pointer border border-zinc-800 hover:border-white transition-colors">
                                    <img src={v.url} className="w-full h-full object-cover rounded-lg" />
                                    <button 
                                        onClick={() => setCurrentImage(v)}
                                        className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white font-medium text-xs transition-opacity"
                                    >
                                        Promote
                                    </button>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            ) : (
                <div className="absolute bottom-6 right-6 flex gap-3 opacity-0 group-hover/canvas:opacity-100 transition-all translate-y-4 group-hover/canvas:translate-y-0 duration-300 z-20">
                    <button 
                        onClick={handleVariations}
                        className="flex items-center gap-2 px-4 py-3 bg-zinc-800 text-white border border-zinc-700 rounded-full hover:bg-zinc-700 shadow-xl font-medium text-xs transition-transform hover:scale-105"
                    >
                        <Layers size={16} /> Variant
                    </button>
                    <button 
                        onClick={() => {
                            setAttachments([currentImage.url]);
                            setMode('EDIT');
                        }} 
                        className="flex items-center gap-2 px-4 py-3 bg-zinc-800 text-white border border-zinc-700 rounded-full hover:bg-zinc-700 shadow-xl font-medium text-xs transition-transform hover:scale-105"
                    >
                        <Wand2 size={16} /> Transform
                    </button>
                    <a 
                        href={currentImage.url} 
                        download={`palette-ai-${currentImage.id}.png`}
                        className="flex items-center gap-2 px-4 py-3 bg-white text-black rounded-full hover:bg-zinc-200 shadow-xl font-medium text-xs transition-transform hover:scale-105"
                    >
                        <Download size={16} /> Save
                    </a>
                </div>
            )}
          </>
        ) : (
          <div className="text-center p-10 max-w-sm mx-auto">
             <div className="w-20 h-20 bg-zinc-800/30 rounded-full mx-auto mb-6 border border-zinc-700/50 flex items-center justify-center animate-pulse relative">
                <div className="absolute inset-0 bg-purple-500/10 rounded-full blur-xl"></div>
                <Sparkles className="text-zinc-500 relative z-10" size={32} />
             </div>
             <h3 className="text-zinc-300 font-medium text-lg mb-2">Workflow Ready</h3>
             <p className="text-zinc-500 text-sm leading-relaxed">
                 Graph initialized. Upload user photo or enter prompt to begin fusion.
             </p>
          </div>
        )}
      </div>
    </div>
  );
}