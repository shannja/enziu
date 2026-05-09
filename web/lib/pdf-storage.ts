/**
 * IndexedDB-based PDF storage utility
 * 
 * Provides persistent client-side storage for PDF files using IndexedDB.
 * Also stores extracted text alongside the PDF for the Gold-Handoff pattern.
 * 
 * Usage:
 *   await storePDF(sessionId, pdfBlob);
 *   await storeText(sessionId, extractedText);
 *   const blob = await getPDF(sessionId);
 *   const text = await getText(sessionId);
 *   await deleteSession(sessionId);
 * 
 * Recovery Vault (encrypted report storage):
 *   await storeRecoveryVault(voucherCode, { factSheet, extractedText, sessionId });
 *   const data = await getRecoveryVault(voucherCode);
 */

const DB_NAME = 'enziu-vault';
const DB_VERSION = 2;
const STORE_NAME = 'vault';

interface VaultRecord {
  sessionId: string;
  pdfBlob?: Blob;
  extractedText?: string | EncryptedPayload;  // plaintext or encrypted
  factSheet?: any | EncryptedPayload;  // Master Policy Fact Sheet from Map-Reduce
  createdAt: number;
}

/**
 * Open/create the IndexedDB database
 */
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      
      // Handle migration from v1 (pdfs store) to v2 (vault store)
      if (event.oldVersion < 1) {
        // Fresh install - create store
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'sessionId' });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
      
      if (event.oldVersion === 1) {
        // Migration: delete old store, create new
        if (db.objectStoreNames.contains('pdfs')) {
          db.deleteObjectStore('pdfs');
        }
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'sessionId' });
          store.createIndex('createdAt', 'createdAt', { unique: false });
        }
      }
    };
  });
}

// ── Crypto helpers ──────────────────────────────────────────────────────────

/**
 * SHA-256 hash of a string (for IndexedDB key derivation)
 */
async function sha256(message: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Derive an AES-GCM key from a voucher code using PBKDF2
 */
async function deriveKey(voucherCode: string, salt: Uint8Array): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(voucherCode),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt.buffer as ArrayBuffer,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Derive an AES-GCM key from a session ID for temporary encrypted caching.
 * Uses PBKDF2 with a random salt for each encryption operation.
 */
async function deriveSessionKey(sessionId: string, salt: Uint8Array): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  // Combine sessionId with a fixed domain separator to prevent key collision
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(`session:${sessionId}`),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt.buffer as ArrayBuffer,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

interface EncryptedPayload {
  salt: number[];
  iv: number[];
  ciphertext: number[];
  createdAt: number;
}

/**
 * Store an encrypted fact sheet in IndexedDB using session-based encryption.
 * The data is encrypted with AES-256-GCM using a key derived from the session ID.
 * This provides secure temporary storage that appears as random bytes in browser inspector.
 * 
 * @param sessionId - Unique session identifier (used as encryption key basis)
 * @param factSheet - The full audit report to encrypt and store
 */
export async function storeEncryptedFactSheet(sessionId: string, factSheet: any): Promise<void> {
  const db = await openDB();
  
  // Generate random salt and IV for this encryption operation
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  
  // Derive encryption key from session ID
  const key = await deriveSessionKey(sessionId, salt);
  
  // Encrypt the payload
  const encoder = new TextEncoder();
  const plaintext = encoder.encode(JSON.stringify(factSheet));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer },
    key,
    plaintext
  );
  
  // Prepare encrypted payload
  const encryptedPayload: EncryptedPayload = {
    salt: Array.from(salt),
    iv: Array.from(iv),
    ciphertext: Array.from(new Uint8Array(ciphertext)),
    createdAt: Date.now(),
  };
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    
    // First check if a record already exists
    const getRequest = store.get(sessionId);
    
    getRequest.onsuccess = () => {
      const existing = getRequest.result as VaultRecord | undefined;
      const record: VaultRecord = existing || { sessionId, createdAt: Date.now() };
      record.factSheet = encryptedPayload;  // Store as encrypted blob
      record.createdAt = Date.now();
      
      const putRequest = store.put(record);
      putRequest.onsuccess = () => resolve();
      putRequest.onerror = () => reject(putRequest.error);
    };
    
    getRequest.onerror = () => reject(getRequest.error);
    
    transaction.oncomplete = () => db.close();
  });
}

/**
 * Retrieve and decrypt a fact sheet from IndexedDB.
 * Returns null if no encrypted fact sheet found or decryption fails.
 * 
 * @param sessionId - Unique session identifier (used to derive decryption key)
 * @returns The decrypted fact sheet or null
 */
export async function getEncryptedFactSheet(sessionId: string): Promise<any | null> {
  const db = await openDB();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    
    const request = store.get(sessionId);
    
    request.onsuccess = async () => {
      const result = request.result as VaultRecord | undefined;
      if (!result || !result.factSheet) {
        resolve(null);
        return;
      }
      
      // Check if factSheet is an encrypted payload (has salt, iv, ciphertext)
      const maybeEncrypted = result.factSheet;
      if (!maybeEncrypted.salt || !maybeEncrypted.iv || !maybeEncrypted.ciphertext) {
        // Not encrypted, return as-is (fallback for unencrypted storage)
        resolve(maybeEncrypted);
        return;
      }
      
      try {
        const encrypted = maybeEncrypted as EncryptedPayload;
        const salt = new Uint8Array(encrypted.salt);
        const iv = new Uint8Array(encrypted.iv);
        const ciphertext = new Uint8Array(encrypted.ciphertext);
        
        // Derive decryption key from session ID
        const key = await deriveSessionKey(sessionId, salt);
        
        // Decrypt the payload
        const plaintext = await crypto.subtle.decrypt(
          { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer },
          key,
          ciphertext
        );
        
        const decoder = new TextDecoder();
        const data = JSON.parse(decoder.decode(plaintext));
        resolve(data);
      } catch (error) {
        // Decryption failed — corrupted data or wrong session
        console.error('[getEncryptedFactSheet] Decryption failed:', error);
        resolve(null);
      }
    };
    
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => db.close();
  });
}

// ── Encrypted text storage ────────────────────────────────────────────────────

/**
 * Store extracted text in IndexedDB with AES-256-GCM encryption.
 * The text is encrypted using a key derived from the session ID via PBKDF2.
 * This ensures the text appears as random bytes in browser inspector.
 * 
 * @param sessionId - Unique session identifier (used as encryption key basis)
 * @param extractedText - The extracted text from the PDF
 * @returns Promise that resolves when stored
 */
export async function storeEncryptedText(sessionId: string, extractedText: string): Promise<void> {
  const db = await openDB();

  // Generate random salt and IV for this encryption operation
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));

  // Derive encryption key from session ID
  const key = await deriveSessionKey(sessionId, salt);

  // Encrypt the payload
  const encoder = new TextEncoder();
  const plaintext = encoder.encode(extractedText);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer },
    key,
    plaintext
  );

  // Prepare encrypted payload
  const encryptedPayload: EncryptedPayload = {
    salt: Array.from(salt),
    iv: Array.from(iv),
    ciphertext: Array.from(new Uint8Array(ciphertext)),
    createdAt: Date.now(),
  };

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    // First check if a record already exists
    const getRequest = store.get(sessionId);

    getRequest.onsuccess = () => {
      const existing = getRequest.result as VaultRecord | undefined;
      const record: VaultRecord = existing || { sessionId, createdAt: Date.now() };
      record.extractedText = encryptedPayload;  // Store as encrypted blob
      record.createdAt = Date.now();

      const putRequest = store.put(record);
      putRequest.onsuccess = () => resolve();
      putRequest.onerror = () => reject(putRequest.error);
    };

    getRequest.onerror = () => reject(getRequest.error);

    transaction.oncomplete = () => db.close();
  });
}

/**
 * Retrieve and decrypt extracted text from IndexedDB.
 * Returns null if no encrypted text found or decryption fails.
 * 
 * @param sessionId - Unique session identifier (used to derive decryption key)
 * @returns Promise that resolves to the decrypted extracted text or null
 */
export async function getEncryptedText(sessionId: string): Promise<string | null> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);

    const request = store.get(sessionId);

    request.onsuccess = async () => {
      const result = request.result as VaultRecord | undefined;
      if (!result || !result.extractedText) {
        resolve(null);
        return;
      }

      const extractedText = result.extractedText;

      // If it's a string, it's plaintext (fallback for unencrypted storage)
      if (typeof extractedText === 'string') {
        resolve(extractedText);
        return;
      }

      // Check if it's an encrypted payload (has salt, iv, ciphertext)
      if (!extractedText.salt || !extractedText.iv || !extractedText.ciphertext) {
        resolve(null);
        return;
      }

      try {
        const salt = new Uint8Array(extractedText.salt);
        const iv = new Uint8Array(extractedText.iv);
        const ciphertext = new Uint8Array(extractedText.ciphertext);

        // Derive decryption key from session ID
        const key = await deriveSessionKey(sessionId, salt);

        // Decrypt the payload
        const plaintext = await crypto.subtle.decrypt(
          { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer },
          key,
          ciphertext
        );

        const decoder = new TextDecoder();
        resolve(decoder.decode(plaintext));
      } catch (error) {
        // Decryption failed — corrupted data or wrong session
        console.error('[getEncryptedText] Decryption failed:', error);
        resolve(null);
      }
    };

    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => db.close();
  });
}

// ── SessionStorage encryption helpers ─────────────────────────────────────────

/**
 * Interface for the encrypted payload stored in sessionStorage as a JSON string.
 */
interface SessionStorageEncryptedPayload {
  salt: number[];
  iv: number[];
  ciphertext: number[];
}

/**
 * Encrypt text for storage in sessionStorage.
 * Returns a JSON string containing the encrypted payload (salt, iv, ciphertext).
 * The encrypted data is base64-encoded within the JSON for string storage.
 * 
 * @param text - The plaintext to encrypt
 * @param sessionId - Session identifier used for key derivation
 * @returns JSON string containing the encrypted payload
 */
export async function encryptForSessionStorage(text: string, sessionId: string): Promise<string> {
  // Generate random salt and IV for this encryption operation
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));

  // Derive encryption key from session ID
  const key = await deriveSessionKey(sessionId, salt);

  // Encrypt the payload
  const encoder = new TextEncoder();
  const plaintext = encoder.encode(text);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer },
    key,
    plaintext
  );

  // Prepare encrypted payload as JSON string
  const encryptedPayload: SessionStorageEncryptedPayload = {
    salt: Array.from(salt),
    iv: Array.from(iv),
    ciphertext: Array.from(new Uint8Array(ciphertext)),
  };

  return JSON.stringify(encryptedPayload);
}

/**
 * Decrypt text from sessionStorage.
 * Accepts either an encrypted JSON payload or plaintext (for backward compatibility).
 * 
 * @param encryptedData - The JSON string from sessionStorage or plaintext
 * @param sessionId - Session identifier used for key derivation
 * @returns The decrypted plaintext, or the original string if not encrypted
 */
export async function decryptFromSessionStorage(
  encryptedData: string | null,
  sessionId: string
): Promise<string | null> {
  if (!encryptedData) return null;

  // Try to parse as encrypted payload
  try {
    const payload = JSON.parse(encryptedData) as SessionStorageEncryptedPayload;

    // Check if it looks like an encrypted payload
    if (!payload.salt || !payload.iv || !payload.ciphertext) {
      // Not an encrypted payload, return as-is (backward compatibility)
      return encryptedData;
    }

    const salt = new Uint8Array(payload.salt);
    const iv = new Uint8Array(payload.iv);
    const ciphertext = new Uint8Array(payload.ciphertext);

    // Derive decryption key from session ID
    const key = await deriveSessionKey(sessionId, salt);

    // Decrypt the payload
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer },
      key,
      ciphertext
    );

    const decoder = new TextDecoder();
    return decoder.decode(plaintext);
  } catch (error) {
    // If parsing fails, it's likely plaintext (backward compatibility)
    // Or decryption failed - return the original data
    console.error('[decryptFromSessionStorage] Decryption failed:', error);
    return encryptedData;
  }
}

interface RecoveryVaultData {
  factSheet: any;
  extractedText: string;
  sessionId: string;
  pdfData?: string;
}

/**
 * Store an encrypted recovery vault in IndexedDB.
 * The key is SHA256(voucherCode) — meaningless without the code.
 * The value is AES-GCM encrypted with key derived via PBKDF2(voucherCode, salt).
 */
export async function storeRecoveryVault(
  voucherCode: string,
  data: RecoveryVaultData
): Promise<void> {
  const db = await openDB();
  const vaultKey = await sha256(voucherCode);
  
  // Generate random salt and IV
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  
  // Derive encryption key
  const key = await deriveKey(voucherCode, salt);
  
  // Encrypt the payload
  const encoder = new TextEncoder();
  const plaintext = encoder.encode(JSON.stringify(data));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer },
    key,
    plaintext
  );
  
  // Store ciphertext + salt + IV
  const encryptedPayload = {
    salt: Array.from(salt),
    iv: Array.from(iv),
    ciphertext: Array.from(new Uint8Array(ciphertext)),
    createdAt: Date.now(),
  };
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    
    const record = {
      sessionId: vaultKey,  // SHA256(voucherCode) as key
      createdAt: Date.now(),
      factSheet: encryptedPayload,  // reuse factSheet field for encrypted blob
    };
    
    const request = store.put(record);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => db.close();
  });
}

/**
 * Retrieve and decrypt a recovery vault from IndexedDB.
 * Returns null if no vault found or decryption fails.
 */
export async function getRecoveryVault(
  voucherCode: string
): Promise<RecoveryVaultData | null> {
  const db = await openDB();
  const vaultKey = await sha256(voucherCode);
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    
    const request = store.get(vaultKey);
    
    request.onsuccess = async () => {
      const result = request.result as VaultRecord | undefined;
      if (!result || !result.factSheet) {
        resolve(null);
        return;
      }
      
      try {
        const encrypted = result.factSheet as {
          salt: number[];
          iv: number[];
          ciphertext: number[];
          createdAt: number;
        };
        
        if (!encrypted.salt || !encrypted.iv || !encrypted.ciphertext) {
          resolve(null);
          return;
        }
        
        const salt = new Uint8Array(encrypted.salt);
        const iv = new Uint8Array(encrypted.iv);
        const ciphertext = new Uint8Array(encrypted.ciphertext);
        
        const key = await deriveKey(voucherCode, salt);
        
        const plaintext = await crypto.subtle.decrypt(
          { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer },
          key,
          ciphertext
        );
        
        const decoder = new TextDecoder();
        const data = JSON.parse(decoder.decode(plaintext)) as RecoveryVaultData;
        resolve(data);
      } catch {
        // Decryption failed — wrong voucher code or corrupted data
        resolve(null);
      }
    };
    
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => db.close();
  });
}

// ── Standard storage (session-based) ────────────────────────────────────────

/**
 * Store a PDF blob in IndexedDB
 * 
 * @param sessionId - Unique session identifier
 * @param pdfBlob - The PDF file as a Blob
 * @returns Promise that resolves when stored
 */
export async function storePDF(sessionId: string, pdfBlob: Blob): Promise<void> {
  const db = await openDB();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    
    const record: VaultRecord = {
      sessionId,
      pdfBlob,
      createdAt: Date.now(),
    };
    
    const request = store.put(record);
    
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    
    transaction.oncomplete = () => db.close();
  });
}

/**
 * Store extracted text alongside the PDF in IndexedDB
 * 
 * @param sessionId - Unique session identifier
 * @param extractedText - The extracted text from the PDF
 * @returns Promise that resolves when stored
 */
export async function storeText(sessionId: string, extractedText: string): Promise<void> {
  const db = await openDB();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    
    // First check if a record already exists
    const getRequest = store.get(sessionId);
    
    getRequest.onsuccess = () => {
      const existing = getRequest.result as VaultRecord | undefined;
      const record: VaultRecord = existing || { sessionId, createdAt: Date.now() };
      record.extractedText = extractedText;
      record.createdAt = Date.now();
      
      const putRequest = store.put(record);
      putRequest.onsuccess = () => resolve();
      putRequest.onerror = () => reject(putRequest.error);
    };
    
    getRequest.onerror = () => reject(getRequest.error);
    
    transaction.oncomplete = () => db.close();
  });
}

/**
 * Retrieve a PDF blob from IndexedDB
 * 
 * @param sessionId - Unique session identifier
 * @returns Promise that resolves to the PDF Blob or null if not found
 */
export async function getPDF(sessionId: string): Promise<Blob | null> {
  const db = await openDB();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    
    const request = store.get(sessionId);
    
    request.onsuccess = () => {
      const result = request.result as VaultRecord | undefined;
      resolve(result?.pdfBlob || null);
    };
    request.onerror = () => reject(request.error);
    
    transaction.oncomplete = () => db.close();
  });
}

/**
 * Retrieve extracted text from IndexedDB (unencrypted)
 * 
 * @deprecated Use getEncryptedText for secure retrieval
 * @param sessionId - Unique session identifier
 * @returns Promise that resolves to the extracted text or null
 */
export async function getText(sessionId: string): Promise<string | null> {
  const db = await openDB();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    
    const request = store.get(sessionId);
    
    request.onsuccess = () => {
      const result = request.result as VaultRecord | undefined;
      const text = result?.extractedText;
      // Only return if it's a string (plaintext), not an encrypted payload
      if (typeof text === 'string') {
        resolve(text);
      } else {
        resolve(null);
      }
    };
    request.onerror = () => reject(request.error);
    
    transaction.oncomplete = () => db.close();
  });
}

/**
 * Store a fact sheet in IndexedDB
 * 
 * @param sessionId - Unique session identifier
 * @param factSheet - The Master Policy Fact Sheet from Map-Reduce
 * @returns Promise that resolves when stored
 */
export async function storeFactSheet(sessionId: string, factSheet: any): Promise<void> {
  const db = await openDB();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    
    // First check if a record already exists
    const getRequest = store.get(sessionId);
    
    getRequest.onsuccess = () => {
      const existing = getRequest.result as VaultRecord | undefined;
      const record: VaultRecord = existing || { sessionId, createdAt: Date.now() };
      record.factSheet = factSheet;
      record.createdAt = Date.now();
      
      const putRequest = store.put(record);
      putRequest.onsuccess = () => resolve();
      putRequest.onerror = () => reject(putRequest.error);
    };
    
    getRequest.onerror = () => reject(getRequest.error);
    
    transaction.oncomplete = () => db.close();
  });
}

/**
 * Retrieve a fact sheet from IndexedDB
 * 
 * @param sessionId - Unique session identifier
 * @returns Promise that resolves to the fact sheet or null
 */
export async function getFactSheet(sessionId: string): Promise<any | null> {
  const db = await openDB();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    
    const request = store.get(sessionId);
    
    request.onsuccess = () => {
      const result = request.result as VaultRecord | undefined;
      resolve(result?.factSheet || null);
    };
    request.onerror = () => reject(request.error);
    
    transaction.oncomplete = () => db.close();
  });
}

/**
 * Delete a session (PDF + text) from IndexedDB
 * 
 * @param sessionId - Unique session identifier
 * @returns Promise that resolves when deleted
 */
export async function deleteSession(sessionId: string): Promise<void> {
  const db = await openDB();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    
    const request = store.delete(sessionId);
    
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    
    transaction.oncomplete = () => db.close();
  });
}

/**
 * Convert a Blob to a base64 string (for PDF viewer compatibility)
 * 
 * @param blob - The PDF blob
 * @returns Promise that resolves to a data URL string
 */
export async function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Clean up expired PDFs (older than 24 hours)
 * Call this periodically or on app startup
 */
export async function cleanupExpiredSessions(maxAgeMs: number = 24 * 60 * 60 * 1000): Promise<void> {
  const db = await openDB();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index('createdAt');
    
    const cutoff = Date.now() - maxAgeMs;
    const request = index.openCursor();
    
    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
      if (cursor) {
        const record = cursor.value as VaultRecord;
        if (record.createdAt < cutoff) {
          cursor.delete();
        }
        cursor.continue();
      }
    };
    
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
  });
}

/**
 * Clean up orphaned records (keys starting with a prefix like "pending_")
 * Call this on app startup to remove stale pre-upload records.
 */
export async function cleanupOrphanedSessions(prefix: string = "pending_"): Promise<void> {
  const db = await openDB();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    
    const request = store.openCursor();
    let deleted = 0;
    
    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
      if (cursor) {
        const record = cursor.value as VaultRecord;
        if (record.sessionId.startsWith(prefix)) {
          cursor.delete();
          deleted++;
        }
        cursor.continue();
      }
    };
    
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => {
      db.close();
      if (deleted > 0) {
        console.log(`[IndexedDB] Cleaned ${deleted} orphaned "${prefix}" records`);
      }
      resolve();
    };
  });
}