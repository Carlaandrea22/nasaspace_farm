import type { PilotDraft } from "../../features/pilot/draft";

const databaseName = "field-shift";
const storeName = "drafts";
const key = "la-maica";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(storeName);
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => reject(request.error);
  });
}

function currentDraft(value: PilotDraft | undefined) {
  if (value && value.version !== 1) throw new Error("Versión de borrador incompatible");
  return value;
}

export async function readPilotDraft(): Promise<PilotDraft | undefined> {
  const database = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const request = database.transaction(storeName).objectStore(storeName).get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    }).then((value) => currentDraft(value as PilotDraft | undefined));
  } finally {
    database.close();
  }
}

export async function savePilotDraft(patch: Pick<PilotDraft, "parcel" | "cropWater">) {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(storeName, "readwrite");
      const store = transaction.objectStore(storeName);
      const request = store.get(key);
      let cause: unknown;

      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(cause ?? transaction.error);
      request.onsuccess = () => {
        try {
          const draft: PilotDraft = currentDraft(request.result) ?? { id: crypto.randomUUID(), version: 1 };
          const previous = draft.cropWater;
          const byParcel = draft.cropWaterByParcel ?? (previous?.parcelKey !== undefined ? { [previous.parcelKey]: previous } : {});
          const cropWater = patch.cropWater;
          const updatedByParcel = cropWater?.parcelKey !== undefined ? { ...byParcel, [cropWater.parcelKey]: cropWater } : byParcel;
          store.put({ ...draft, ...patch, cropWaterByParcel: updatedByParcel }, key);
        } catch (error) {
          cause = error;
          transaction.abort();
        }
      };
    });
  } finally {
    database.close();
  }
}
