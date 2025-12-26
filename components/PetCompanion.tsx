
import React, { useState, useEffect, useRef, useImperativeHandle, forwardRef, useCallback } from 'react';
import { Sparkles, Cookie, MessageCircle } from 'lucide-react';

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
    const handleMouseUp = () => setIsDragging(false);

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  // Touch Drag Support
  useEffect(() => {
     const handleTouchMove = (e: TouchEvent) => {
        if(isDragging) {
           const touch = e.touches[0];
           setPosition({
               left: touch.clientX - dragOffset.current.x,
               top: touch.clientY - dragOffset.current.y
           });
        }
     };
     const handleTouchEnd = () => setIsDragging(false);
     
     if (isDragging) {
         window.addEventListener('touchmove', handleTouchMove, { passive: false });
         window.addEventListener('touchend', handleTouchEnd);
     }
     return () => {
         window.removeEventListener('touchmove', handleTouchMove);
         window.removeEventListener('touchend', handleTouchEnd);
     }
  }, [isDragging]);


  const startDrag = (e: React.MouseEvent | React.TouchEvent) => {
    // Prevent dragging if clicking button
    if ((e.target as HTMLElement).closest('button')) return;

    // Convert to left/top positioning if not already
    const rect = petRef.current!.getBoundingClientRect();
    
    let clientX, clientY;
    if ('touches' in e) {
       clientX = e.touches[0].clientX;
       clientY = e.touches[0].clientY;
    } else {
       clientX = (e as React.MouseEvent).clientX;
       clientY = (e as React.MouseEvent).clientY;
    }
    
    // Switch state to absolute left/top to allow free movement
    setPosition({
        left: rect.left,
        top: rect.top
    });

    dragOffset.current = {
      x: clientX - rect.left,
      y: clientY - rect.top
    };
    setIsDragging(true);
  };

  const triggerReaction = (newMood: typeof mood) => {
    setMood(newMood);
    if (newMood === 'celebrating') {
        setTimeout(() => setMood('idle'), 3000);
    } else if (newMood === 'surprised' || newMood === 'happy') {
        setTimeout(() => setMood('idle'), 1500);
    }
  };

  const showMessage = (text: string) => {
      setMessage(text);
      if (messageTimer.current) clearTimeout(messageTimer.current);
      messageTimer.current = setTimeout(() => setMessage(null), 3000);
  };

  const handleTap = () => {
    if (mood === 'sleeping') {
        setMood('idle');
        showMessage("Yawn... I'm up!");
    } else {
        triggerReaction('surprised');
    }
  };

  const feedPet = (e: React.MouseEvent) => {
      e.stopPropagation();
      triggerReaction('happy');
      showMessage("Yum! 🍪");
  };

  // Animation classes
  const getBodyClass = () => {
      switch(mood) {
          case 'celebrating': return 'animate-bounce';
          case 'happy': return 'animate-pulse';
          case 'surprised': return 'scale-110';
          case 'sleeping': return 'opacity-80 translate-y-2';
          default: return 'animate-float'; // Custom float defined below
      }
  };

  return (
    <>
        <div 
        ref={petRef}
        style={{ 
            left: position.left, 
            top: position.top, 
            right: position.right, 
            bottom: position.bottom,
            touchAction: 'none' 
        }}
        className="fixed z-[60] cursor-move select-none transition-transform duration-75 group"
        onMouseDown={startDrag}
        onTouchStart={startDrag}
        onClick={handleTap}
        >
            {/* Message Bubble */}
            {message && (
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 bg-white px-3 py-2 rounded-xl shadow-lg border border-slate-200 text-xs font-bold whitespace-nowrap animate-in zoom-in-95 origin-bottom z-10">
                    {message}
                    <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-white"></div>
                </div>
            )}

            {/* Pet Container */}
            <div className={`relative w-16 h-16 transition-all duration-300 ${getBodyClass()}`}>
                
                {/* Context Actions (Feed) - Only show on hover/idle */}
                <div className="absolute -right-8 top-0 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button 
                    onClick={feedPet}
                    className="p-1.5 bg-white rounded-full shadow-md text-amber-600 border border-amber-100 hover:scale-110 transition-transform"
                    title="Feed me!"
                    >
                    <Cookie className="w-4 h-4" />
                </button>
                </div>

                {/* SVG Pet Body */}
                <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow-xl filter">
                    {/* Body */}
                    <path 
                    d="M50 10 C 80 10, 95 40, 95 65 C 95 90, 75 95, 50 95 C 25 95, 5 90, 5 65 C 5 40, 20 10, 50 10 Z" 
                    fill="#0078d4" 
                    />
                    
                    {/* Highlight/Shine */}
                    <ellipse cx="35" cy="30" rx="10" ry="5" fill="rgba(255,255,255,0.3)" transform="rotate(-45 35 30)" />

                    {/* Eyes */}
                    {mood === 'sleeping' ? (
                    <g stroke="white" strokeWidth="3" fill="none">
                        <path d="M 30 50 Q 35 55 40 50" />
                        <path d="M 60 50 Q 65 55 70 50" />
                    </g>
                    ) : (
                    <g fill="white">
                        <circle cx="35" cy="45" r={mood === 'surprised' ? 10 : 8} />
                        <circle cx="65" cy="45" r={mood === 'surprised' ? 10 : 8} />
                        <circle cx="35" cy="45" r="3" fill="#1e293b" />
                        <circle cx="65" cy="45" r="3" fill="#1e293b" />
                    </g>
                    )}

                    {/* Mouth */}
                    <g stroke="white" strokeWidth="3" fill="none" strokeLinecap="round">
                    {mood === 'happy' || mood === 'celebrating' ? (
                        <path d="M 35 65 Q 50 75 65 65" /> // Smile
                    ) : mood === 'surprised' ? (
                        <circle cx="50" cy="70" r="5" /> // O mouth
                    ) : mood === 'sleeping' ? (
                        <path d="M 45 70 Q 50 65 55 70" /> // Small mouth
                    ) : (
                        <path d="M 40 70 Q 50 75 60 70" /> // Neutral smile
                    )}
                    </g>
                    
                    {/* Cheeks */}
                    {(mood === 'happy' || mood === 'celebrating') && (
                        <g fill="#ff90b3" opacity="0.6">
                        <circle cx="25" cy="55" r="5" />
                        <circle cx="75" cy="55" r="5" />
                        </g>
                    )}
                </svg>

                {/* Sleep Zzz */}
                {mood === 'sleeping' && (
                    <div className="absolute -top-4 -right-2 flex flex-col items-center">
                        <span className="text-slate-400 font-bold text-xs animate-bounce" style={{animationDelay: '0s'}}>z</span>
                        <span className="text-slate-400 font-bold text-xs animate-bounce" style={{animationDelay: '0.2s'}}>z</span>
                        <span className="text-slate-400 font-bold text-xs animate-bounce" style={{animationDelay: '0.4s'}}>Z</span>
                    </div>
                )}
                
                {/* Celebration Particles */}
                {mood === 'celebrating' && (
                    <div className="absolute inset-0 pointer-events-none">
                        <Sparkles className="absolute -top-4 -left-4 w-6 h-6 text-yellow-400 animate-ping" />
                        <Sparkles className="absolute -top-2 -right-4 w-5 h-5 text-blue-300 animate-pulse" />
                        <Sparkles className="absolute bottom-0 -right-4 w-4 h-4 text-pink-400 animate-bounce" />
                    </div>
                )}
            </div>
        </div>
        <style>{`
          @keyframes float {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-5px); }
          }
          .animate-float {
            animation: float 3s ease-in-out infinite;
          }
        `}</style>
    </>
  );
});

export default PetCompanion;
