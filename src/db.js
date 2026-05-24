const DB_NAME = 'NTSApp';
const DB_VERSION = 4;
const STORE_TESTS = 'tests';
const STORE_ROOMS = 'rooms';
const STORE_ATTENDANCE = 'attendance';

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_TESTS)) {
        db.createObjectStore(STORE_TESTS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_ROOMS)) {
        const roomStore = db.createObjectStore(STORE_ROOMS, { keyPath: 'id' });
        roomStore.createIndex('testId', 'testId', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_ATTENDANCE)) {
        const attStore = db.createObjectStore(STORE_ATTENDANCE, { keyPath: 'id' });
        attStore.createIndex('testId', 'testId', { unique: false });
      }
    };
  });
}

async function getAllTests() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_TESTS, 'readonly');
    const store = tx.objectStore(STORE_TESTS);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function addTest(test) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_TESTS, 'readwrite');
    const store = tx.objectStore(STORE_TESTS);
    const req = store.add(test);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function updateTest(test) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_TESTS, 'readwrite');
    const store = tx.objectStore(STORE_TESTS);
    const req = store.get(test.id);
    req.onsuccess = () => {
      const existing = req.result;
      if (!existing) return reject(new Error('Test not found'));
      const updated = { ...existing, ...test };
      const putReq = store.put(updated);
      putReq.onsuccess = () => resolve(putReq.result);
      putReq.onerror = () => reject(putReq.error);
    };
    req.onerror = () => reject(req.error);
  });
}

async function removeTest(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_TESTS, 'readwrite');
    const store = tx.objectStore(STORE_TESTS);
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// ===== Room CRUD =====

async function getRoomsByTest(testId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_ROOMS, 'readonly');
    const store = tx.objectStore(STORE_ROOMS);
    const idx = store.index('testId');
    const req = idx.getAll(testId);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function addRoom(room) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_ROOMS, 'readwrite');
    const store = tx.objectStore(STORE_ROOMS);
    const req = store.add(room);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function updateRoom(room) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_ROOMS, 'readwrite');
    const store = tx.objectStore(STORE_ROOMS);
    const req = store.get(room.id);
    req.onsuccess = () => {
      const existing = req.result;
      if (!existing) return reject(new Error('Room not found'));
      const updated = { ...existing, ...room };
      const putReq = store.put(updated);
      putReq.onsuccess = () => resolve(putReq.result);
      putReq.onerror = () => reject(putReq.error);
    };
    req.onerror = () => reject(req.error);
  });
}

async function removeRoom(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_ROOMS, 'readwrite');
    const store = tx.objectStore(STORE_ROOMS);
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// ===== Attendance CRUD =====

async function getAttendanceByTest(testId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_ATTENDANCE, 'readonly');
    const store = tx.objectStore(STORE_ATTENDANCE);
    const idx = store.index('testId');
    const req = idx.getAll(testId);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getAttendanceByRoom(roomId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_ATTENDANCE, 'readonly');
    const store = tx.objectStore(STORE_ATTENDANCE);
    const req = store.get(roomId);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

async function saveAttendance(attendance) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_ATTENDANCE, 'readwrite');
    const store = tx.objectStore(STORE_ATTENDANCE);
    const req = store.put(attendance);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}