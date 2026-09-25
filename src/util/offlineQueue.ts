import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';

const QUEUE_STORAGE_KEY = '@offline_attendance_queue';

export const saveToQueue = async (record: any) => {
    try {
        const existingQueueStr = await AsyncStorage.getItem(QUEUE_STORAGE_KEY);
        const queue = existingQueueStr ? JSON.parse(existingQueueStr) : [];
        queue.push(record);
        await AsyncStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queue));
    } catch (e) {
        console.error('Failed to save offline attendance', e);
    }
};

export const getOfflineQueue = async () => {
    try {
        const existingQueueStr = await AsyncStorage.getItem(QUEUE_STORAGE_KEY);
        return existingQueueStr ? JSON.parse(existingQueueStr) : [];
    } catch (e) {
        return [];
    }
};

/**
 * @param timePunchMutation The React Query mutation function.
 * @param onRecordDropped Optional callback fired for each record that the
 *        server permanently rejected (e.g. auto-closed shift, already open
 *        log, face mismatch) so the caller can inform the intern instead of
 *        the sync failing silently in the background.
 */
export const syncOfflineQueue = async (
    timePunchMutation: Function,
    onRecordDropped?: (record: any, message: string) => void,
) => {
    try {
        const netState = await NetInfo.fetch();
        if (!netState.isConnected) return;

        const existingQueueStr = await AsyncStorage.getItem(QUEUE_STORAGE_KEY);
        if (!existingQueueStr) return;

        const queue = JSON.parse(existingQueueStr);
        if (queue.length === 0) return;

        const remainingQueue = [];

        // Loop and send records using your React Query mutation
        for (const record of queue) {
            try {
                await timePunchMutation({
                    action: record.action,
                    image: record.image,
                    latitude: record.latitude,
                    longitude: record.longitude,
                    timestamp: record.timestamp,
                });
            } catch (e: any) {
                // A response means the server was reached and permanently
                // rejected this record (already open, auto-closed, face
                // mismatch, validation, etc.) — retrying won't change the
                // outcome, so drop it instead of retrying forever.
                if (e?.response?.status) {
                    const msg =
                        e.response?.data?.message ??
                        'A saved offline punch could not be synced and was discarded.';
                    console.warn(`Discarding offline record (server rejected): ${msg}`, record);
                    onRecordDropped?.(record, msg);
                    continue;
                }

                // No response at all — genuine network/server-unreachable
                // failure, worth retrying on the next sync attempt.
                remainingQueue.push(record);
            }
        }

        // Update queue: empty if all succeeded/were dropped, or keep remaining network failures
        if (remainingQueue.length === 0) {
            await AsyncStorage.removeItem(QUEUE_STORAGE_KEY);
            console.log('Offline attendance queue processed — nothing left to retry.');
        } else {
            await AsyncStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(remainingQueue));
        }
    } catch (e) {
        console.log('Sync postponed, server error or offline.');
    }
};