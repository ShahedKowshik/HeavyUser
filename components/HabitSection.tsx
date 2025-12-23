
import React from 'react';

const HabitSection: React.FC = () => {
  return (
    <div className="flex flex-col items-center justify-center h-[60vh] text-center space-y-4 animate-in fade-in duration-300">
      <div className="w-16 h-16 bg-[#fff4ce] rounded-lg flex items-center justify-center border border-[#ffeb3b]/20">
         <span className="text-2xl">✨</span>
      </div>
      <div>
        <h2 className="text-lg font-semibold text-[#323130]">Habit Tracker</h2>
        <p className="text-sm text-[#605e5c] max-w-xs">Building a modern tracking system to help you stay consistent.</p>
      </div>
    </div>
  );
};

export default HabitSection;
