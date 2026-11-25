import { useEffect, useState } from 'react';
import { DeviceEventEmitter } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ReactNativeBlobUtil from 'react-native-blob-util';
import { api } from './api';

const FS = ReactNativeBlobUtil.fs;

const ACTIVE_KEY = '@offline_active_shift'; // shift in progress
const DONE_KEY = '@offline_shifts'; // finished shifts waiting for upload
const CHANGED = 'offline_shift_changed';

export type TaskSession = 'morning' | 'afternoon';
export type OfflinePhoto = { uri: string; name: string; type: string };
export type OfflineTask = {
  note: string | null;
  photos: OfflinePhoto[];
  at: string;
};

export interface OfflineShift {
  id: string;
  time_in: string;
  time_in_image: string;
  break_out: string | null;
  break_in: string | null;
  time_out: string | null;
  time_out_image: string | null;
  morning: OfflineTask | null;
  afternoon: OfflineTask | null;
}

type Capture = { image: string | null; timestamp: string };

const emit = () => DeviceEventEmitter.emit(CHANGED);

const toPath = (uri: string) => decodeURI(uri.replace(/^file:\/\//, ''));

// Camera/picker files sit in the cache dir and can be wiped, so copy them somewhere permanent
export const persistFile = async (uri: string, ext = 'jpg') => {
  const dest = `${FS.dirs.DocumentDir}/offline_${Date.now()}_${Math.random()
    .toString(36)
    .slice(2, 8)}.${ext}`;
  await FS.cp(toPath(uri), dest);
  return `file://${dest}`;
};

const removeFile = (uri?: string | null) => {
  if (uri) FS.unlink(toPath(uri)).catch(() => {});
};

const read = async <T,>(key: string, fallback: T): Promise<T> => {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};

export const getActiveShift = () => read<OfflineShift | null>(ACTIVE_KEY, null);
export const getOfflineShifts = () => read<OfflineShift[]>(DONE_KEY, []);

// Same rule as the server: before break in = morning, after = afternoon
export const currentSession = (s: OfflineShift): TaskSession =>
  s.break_in ? 'afternoon' : 'morning';

export const startOfflineShift = async (c: Capture) => {
  if (await getActiveShift())
    throw new Error('You already have an offline shift in progress.');
  if (!c.image) throw new Error('A photo is required to time in.');
  const shift: OfflineShift = {
    id: `${Date.now()}`,
    time_in: c.timestamp,
    time_in_image: await persistFile(c.image),
    break_out: null,
    break_in: null,
    time_out: null,
    time_out_image: null,
    morning: null,
    afternoon: null,
  };
  await AsyncStorage.setItem(ACTIVE_KEY, JSON.stringify(shift));
  emit();
};

export const recordOfflineBreak = async (
  action: 'break_out' | 'break_in',
  timestamp: string,
) => {
  const s = await getActiveShift();
  if (!s) throw new Error('No offline shift in progress.');
  if (action === 'break_out') s.break_out = timestamp;
  else s.break_in = timestamp;
  await AsyncStorage.setItem(ACTIVE_KEY, JSON.stringify(s));
  emit();
};

export const saveOfflineTask = async (
  session: TaskSession,
  note: string | null,
  photos: OfflinePhoto[],
) => {
  const s = await getActiveShift();
  if (!s) throw new Error('No offline shift in progress.');
  if (s[session])
    throw new Error(`You've already saved your ${session} task note.`);
  const saved = await Promise.all(
    photos.map(async p => ({
      ...p,
      uri: await persistFile(p.uri, p.name?.split('.').pop() || 'jpg'),
    })),
  );
  s[session] = { note, photos: saved, at: new Date().toISOString() };
  await AsyncStorage.setItem(ACTIVE_KEY, JSON.stringify(s));
  emit();
};

// Time out: close the shift and move it into the "waiting for upload" array
export const finishOfflineShift = async (c: Capture) => {
  const s = await getActiveShift();
  if (!s) throw new Error('No offline shift in progress.');
  if (!c.image) throw new Error('A photo is required to time out.');
  s.time_out = c.timestamp;
  s.time_out_image = await persistFile(c.image);
  const done = await getOfflineShifts();
  done.push(s);
  await AsyncStorage.setItem(DONE_KEY, JSON.stringify(done));
  await AsyncStorage.removeItem(ACTIVE_KEY);
  emit();
};

export const deleteOfflineShift = async (id: string) => {
  const done = await getOfflineShifts();
  const target = done.find(s => s.id === id);
  await AsyncStorage.setItem(
    DONE_KEY,
    JSON.stringify(done.filter(s => s.id !== id)),
  );
  if (target) {
    removeFile(target.time_in_image);
    removeFile(target.time_out_image);
    [target.morning, target.afternoon].forEach(t =>
      t?.photos.forEach(p => removeFile(p.uri)),
    );
  }
  emit();
};

// Upload one shift. Resolves on success, throws the axios error otherwise.
export const uploadOfflineShift = async (s: OfflineShift) => {
  const f = new FormData();
  f.append('time_in', s.time_in);
  f.append('time_out', s.time_out as string);
  if (s.break_out) f.append('break_out', s.break_out);
  if (s.break_in) f.append('break_in', s.break_in);
  f.append('time_in_image', {
    uri: s.time_in_image,
    name: 'time_in.jpg',
    type: 'image/jpeg',
  } as any);
  f.append('time_out_image', {
    uri: s.time_out_image,
    name: 'time_out.jpg',
    type: 'image/jpeg',
  } as any);

  (['morning', 'afternoon'] as const).forEach(k => {
    const t = s[k];
    if (!t) return;
    if (t.note) f.append(`${k}_note`, t.note);
    f.append(`${k}_at`, t.at);
    t.photos.forEach(p => f.append(`${k}_files[]`, p as any));
  });

  try {
    const { data } = await api.post('/intern/time/offline-shift', f, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 90000, // two face checks plus photos can be slow
    });
    await deleteOfflineShift(s.id);
    return data;
  } catch (e: any) {
    if (e?.response?.status === 409) {
      // already on the server
      await deleteOfflineShift(s.id);
      return { message: 'Already uploaded.' };
    }
    throw e;
  }
};

// Upload the whole array, oldest first. Stops if the network drops.
export const uploadAllOfflineShifts = async () => {
  const shifts = await getOfflineShifts();
  let uploaded = 0;
  const failed: { shift: OfflineShift; message: string }[] = [];
  for (const s of shifts) {
    try {
      await uploadOfflineShift(s);
      uploaded++;
    } catch (e: any) {
      if (!e?.response) {
        failed.push({ shift: s, message: 'No connection to the server.' });
        break;
      }
      failed.push({
        shift: s,
        message: e.response?.data?.message ?? 'Upload failed.',
      });
    }
  }
  return { uploaded, failed };
};

// Merge local shifts into the status shown on the Time Logs screen
const seg = (s: OfflineShift) => ({
  id: null,
  session_period: null,
  task_note: null,
  time_in: s.time_in,
  break_out: s.break_out,
  break_in: s.break_in,
  time_out: s.time_out,
  is_open: !s.time_out,
});

export const applyOfflineShifts = (
  server: any,
  active: OfflineShift | null,
  done: OfflineShift[],
) => {
  if (!server) return server;
  const today = new Date().toDateString();
  const doneToday = done.filter(
    s => new Date(s.time_in).toDateString() === today,
  );
  if (!active && doneToday.length === 0) return server;
  const s = JSON.parse(JSON.stringify(server));
  s.today_segments = [...(s.today_segments ?? []), ...doneToday.map(seg)];
  if (active) s.open_log = seg(active);
  return s;
};

export const useOfflineShifts = () => {
  const [state, setState] = useState<{
    active: OfflineShift | null;
    done: OfflineShift[];
  }>({
    active: null,
    done: [],
  });
  useEffect(() => {
    const load = async () =>
      setState({
        active: await getActiveShift(),
        done: await getOfflineShifts(),
      });
    load();
    const sub = DeviceEventEmitter.addListener(CHANGED, load);
    return () => sub.remove();
  }, []);
  return state;
};