// Photos keep a copy on the phone (the browser's IndexedDB) from the moment they are taken until they
// upload, so no signal, a closed tab or a restarted phone loses none. The visit page picks them up again
// when it opens. Without IndexedDB (a private window) each call quietly does nothing.

export type KeptPhoto = { key: string; visitId: string; blob: Blob; name: string; type: string; at: number }

const DB = 'clinic-offline'
const STORE = 'photos'

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'key' })
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function withStore<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  try {
    const db = await open()
    return await new Promise<T>((resolve, reject) => {
      const request = work(db.transaction(STORE, mode).objectStore(STORE))
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    }).finally(() => db.close())
  } catch {
    return undefined
  }
}

export async function keepPhoto(photo: KeptPhoto): Promise<void> {
  await withStore('readwrite', (store) => store.put(photo))
}

export async function forgetPhoto(key: string): Promise<void> {
  await withStore('readwrite', (store) => store.delete(key))
}

export async function keptPhotos(visitId: string): Promise<KeptPhoto[]> {
  const all = (await withStore<KeptPhoto[]>('readonly', (store) => store.getAll())) ?? []
  return all.filter((p) => p.visitId === visitId).sort((a, b) => a.at - b.at)
}
