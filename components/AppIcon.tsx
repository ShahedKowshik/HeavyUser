
import React from 'react';

export const AppIcon = ({ className = "w-6 h-6" }: { className?: string }) => (
  <svg viewBox="0 0 100 100" className={className} xmlns="http://www.w3.org/2000/svg">
    <rect width="100" height="100" fill="#0055FF" />
    <path d="M25 52 L42 69" stroke="white" strokeWidth="14" strokeLinecap="square" fill="none" />
    <path d="M42 69 L75 28" stroke="#FF8844" strokeWidth="14" strokeLinecap="square" fill="none" />
  </svg>
);
