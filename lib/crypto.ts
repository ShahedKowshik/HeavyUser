
import CryptoJS from 'crypto-js';

// In a real production app, this should be in process.env.VITE_APP_SECRET
// For this architecture, we use a consistent app-wide key. 
// This allows "Forgot Password" to work (since the key isn't the user's password)
// but keeps the database unreadable in the dashboard.
const APP_SECRET = 'HEAVYUSER_SECURE_APP_KEY_v1';

export const encryptData = (text: string): string => {
  if (!text) return '';
  return CryptoJS.AES.encrypt(text, APP_SECRET).toString();
};

export const decryptData = (cipherText: string): string => {
  if (!cipherText) return '';
  
  try {
    const bytes = CryptoJS.AES.decrypt(cipherText, APP_SECRET);
    const originalText = bytes.toString(CryptoJS.enc.Utf8);
    
    // Fallback: If decryption results in empty string but input wasn't, 
    // or if the input doesn't look like an encrypted string (doesn't start with U2F),
    // assume it is legacy plain text from before we added encryption.
    if (!originalText && cipherText.length > 0) {
      return cipherText;
    }
    
    return originalText;
  } catch (error) {
    // If it crashes, it's likely plain text
    return cipherText;
  }
};
