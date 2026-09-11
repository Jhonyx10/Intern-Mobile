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

export const syncOfflineQueue = async (timePunchMutation: Function) => {
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
                });
            } catch (e) {
                // If an individual record fails, keep it in the queue
                remainingQueue.push(record);
            }
        }

        // Update queue: empty if all succeeded, or keep remaining failures
        if (remainingQueue.length === 0) {
            await AsyncStorage.removeItem(QUEUE_STORAGE_KEY);
            console.log('All offline attendance records synced successfully!');
        } else {
            await AsyncStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(remainingQueue));
        }
    } catch (e) {
        console.log('Sync postponed, server error or offline.');
    }
};