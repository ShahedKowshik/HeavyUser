
import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getContrastColor(hexColor: string) {
  if (!hexColor || !hexColor.startsWith('#')) return '#000000';
  
  const r = parseInt(hexColor.substring(1, 3), 16);
  const g = parseInt(hexColor.substring(3, 5), 16);
  const b = parseInt(hexColor.substring(5, 7), 16);
  const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
  
  // Adjusted threshold to 150 to prefer black text on mid-tone backgrounds for better readability
  return yiq >= 150 ? '#000000' : '#FFFFFF';
}
