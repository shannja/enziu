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
 */

const DB_NAME = 'enziu-vault';
const DB_VERSION = 2;
const STORE_NAME = 'vault';

interface VaultRecord {
  sessionId: string;
  pdfBlob?: Blob;
  extractedText?: string;
  factSheet?: any;  // Master Policy Fact Sheet from Map-Reduce
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
 * Retrieve extracted text from IndexedDB
 * 
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
      resolve(result?.extractedText || null);
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
