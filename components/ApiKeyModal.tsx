import React, { useEffect, useState } from 'react';
import { Key, ExternalLink } from 'lucide-react';

export const ApiKeyModal: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [checking, setChecking] = useState(true);

  const checkKey = async () => {
    try {
      const hasKey = await window.aistudio.hasSelectedApiKey();
      setIsOpen(!hasKey);
    } catch (e) {
      // If aistudio is not defined (dev environment), we might fallback or show error
      console.error("AI Studio bridge not found", e);
      // For standard usage without the specific embedding environment, we might hide this
      // But based on instructions we implement the logic.
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    if (window.aistudio) {
      checkKey();
    } else {
      setChecking(false);
    }
  }, []);

  const handleSelectKey = async () => {
    try {
      await window.aistudio.openSelectKey();
      // Assume success and close, the app will reload or re-render if state changes effectively
      // In a real scenario, we'd wait for a signal, but instructions say "Assume key selection was successful"
      setIsOpen(false);
      window.location.reload(); // Reload to pick up the injected key in env
    } catch (e) {
      console.error("Failed to select key", e);
    }
  };

  if (checking || !isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-zinc-900 border border-zinc-700 rounded-2xl max-w-md w-full p-6 shadow-2xl animate-float">
        <div className="flex items-center gap-3 mb-4 text-purple-400">
          <Key className="w-8 h-8" />
          <h2 className="text-2xl font-bold text-white">Access Required</h2>
        </div>
        
        <p className="text-zinc-300 mb-6 leading-relaxed">
          PaletteAI uses <strong>Hugging Face Inference</strong> (FLUX.2-dev for images, Qwen2.5-VL for style extraction).
          Provide a Hugging Face access token to continue.
        </p>

        <div className="bg-zinc-800/50 rounded-lg p-4 mb-6 text-sm text-zinc-400">
            Token help? <a href="https://huggingface.co/docs/hub/security-tokens" target="_blank" rel="noreferrer" className="text-purple-400 hover:text-purple-300 inline-flex items-center gap-1">View Documentation <ExternalLink size={12}/></a>
        </div>

        <button
          onClick={handleSelectKey}
          className="w-full py-3 px-4 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-semibold rounded-xl transition-all shadow-lg hover:shadow-purple-500/25 active:scale-95"
        >
          Select Token
        </button>
      </div>
    </div>
  );
};