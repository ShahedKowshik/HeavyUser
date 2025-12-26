import React, { useState, useEffect, useRef, useImperativeHandle, forwardRef, useCallback } from 'react';
import { Sparkles } from 'lucide-react';

export interface PetRef {
  celebrate: () => void;
}

const QUOTES = [
  "Great job!",
  "You're on fire!",
  "Keep it up!",
  "Productivity +1",
  "So efficient!",
  "Wahoo!",
  "Doing great!",
  "Unstoppable!",
  "Level up!"
];

const PetCompanion = forwardRef<PetRef, {}>((props, ref) => {
  // State
  // Position starts anchored to bottom-right, switches to absolute left/top on drag
  const [position, setPosition] = useState<{top?: number, left?: number, right?: number, bottom?: number}>({ right: 20, bottom: 160 });
  const [mood, setMood] = useState<'idle' | 'sleeping' | 'happy' | 'celebrating' | 'surprised'>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  
  // Refs
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragOffset = useRef({ x: 0, y: 0 });
  const petRef = useRef<HTMLDivElement>(null);
  const messageTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Helper functions
  const triggerReaction = (reaction: 'idle' | 'sleeping' | 'happy' | 'celebrating' | 'surprised') => {
    setMood(reaction);
    // Auto reset to idle unless sleeping
    if (reaction !== 'sleeping' && reaction !== 'idle') {
      setTimeout(() => {
        setMood(prev => prev === 'sleeping' ? 'sleeping' : 'idle');
      }, 2000);
    }
  };

  const showMessage = (text: string) => {
    setMessage(text);
    if (messageTimer.current) clearTimeout(messageTimer.current);
    messageTimer.current = setTimeout(() => {
      setMessage(null);
    }, 3000);
  };

  // Expose methods to parent
  useImperativeHandle(ref, () => ({
    celebrate: () => {
      triggerReaction('celebrating');
      const randomQuote = QUOTES[Math.floor(Math.random() * QUOTES.length)];
      showMessage(randomQuote);
    }
  }));

  // Idle Timer Logic
  const resetIdleTimer = useCallback(() => {
    if (mood === 'celebrating') return; // Don't interrupt celebration
    
    // Wake up if sleeping
    setMood(prev => (prev === 'sleeping' ? 'idle' : prev));
    
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => {
      setMood('sleeping');
    }, 30000); // 30s idle threshold
  }, [mood]);

  useEffect(() => {
    window.addEventListener('mousemove', resetIdleTimer);
    window.addEventListener('keydown', resetIdleTimer);
    window.addEventListener('click', resetIdleTimer);
    window.addEventListener('touchstart', resetIdleTimer);
    
    resetIdleTimer(); // Init

    return () => {
      window.removeEventListener('mousemove', resetIdleTimer);
      window.removeEventListener('keydown', resetIdleTimer);
      window.removeEventListener('click', resetIdleTimer);
      window.removeEventListener('touchstart', resetIdleTimer);
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
  }, [resetIdleTimer]);

  // Drag Logic
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        setPosition({
          left: e.clientX - dragOffset.current.x,
          top: e.clientY - dragOffset.current.y
        });
      }
    };
    
    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  const handleMouseDown = (e: React.MouseEvent) => {
    // Only allow left click drag
    if (e.button !== 0) return;

    if (petRef.current) {
        const rect = petRef.current.getBoundingClientRect();
        dragOffset.current = {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };
        setIsDragging(true);
        // Switch to explicit coordinates on first drag
        setPosition({
            left: rect.left,
            top: rect.top
        });
    }
  };

  const handlePetClick = () => {
    if (isDragging) return;
    triggerReaction('happy');
  };

  // Pet Rendering Logic
  const renderPetEmoji = () => {
      switch(mood) {
          case 'sleeping': return '💤 🐱';
          case 'happy': return '😸';
          case 'celebrating': return '🥳 🐱';
          case 'surprised': return '🙀';
          default: return '🐱';
      }
  };

  return (
    <div 
        ref={petRef}
        style={{ 
            position: 'fixed', 
            zIndex: 50,
            cursor: isDragging ? 'grabbing' : 'grab',
            ...position 
        }}
        onMouseDown={handleMouseDown}
        onClick={handlePetClick}
        className="select-none transition-transform active:scale-95 touch-none"
    >
        <div className="relative group">
            {message && (
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 whitespace-nowrap bg-white border border-slate-200 px-3 py-1.5 rounded-xl shadow-lg text-xs font-bold text-slate-800 animate-in zoom-in-95 slide-in-from-bottom-2">
                    {message}
                    <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-[1px] border-4 border-transparent border-t-white"></div>
                </div>
            )}
            
            <div className={`w-12 h-12 bg-white rounded-full shadow-xl border-2 border-slate-100 flex items-center justify-center text-2xl transition-all hover:scale-110 hover:shadow-2xl ${mood === 'celebrating' ? 'animate-bounce' : ''}`}>
                {renderPetEmoji()}
            </div>
            
            {/* Interaction Hints (Hover) */}
            <div className="absolute -right-1 -top-1 opacity-0 group-hover:opacity-100 transition-opacity">
               <div className="w-4 h-4 bg-blue-500 rounded-full flex items-center justify-center">
                  <Sparkles className="w-2 h-2 text-white" />
               </div>
            </div>
        </div>
    </div>
  );
});

export default PetCompanion;