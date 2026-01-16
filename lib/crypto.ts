import CryptoJS from 'crypto-js';

// Legacy secret used for decrypting existing data. 
// New data will be stored in plain text to rely on transport security (HTTPS) 
// and database access controls (RLS), rather than insecure client-side key storage.
const LEGACY_APP_SECRET = 'HEAVYUSER_SECURE_APP_KEY_v1';

export const encryptData = (text: string): string => {
  // PASSTHROUGH: Do not encrypt new data client-side.
  return text || '';
};

export const decryptData = (cipherText: string): string => {
  if (!cipherText) return '';
  
  try {
    // Attempt legacy decryption if it looks like a Crypto-JS AES string (starts with Salted__)
    // This allows users to still read their old data while migrating to plain text.
    if (cipherText.startsWith('U2FsdGVk')) {
        const bytes = CryptoJS.AES.decrypt(cipherText, LEGACY_APP_SECRET);
        const originalText = bytes.toString(CryptoJS.enc.Utf8);
        
        // If decryption produced valid text, return it
        if (originalText) return originalText;
    }
  } catch (error) {
    // If decryption fails, assume it's plain text
  }
  
  // Fallback: Return the input (treat as plain text)
  return cipherText;
};