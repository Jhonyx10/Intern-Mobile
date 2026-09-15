import React, { createContext, useContext, useEffect, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { syncOfflineQueue, getOfflineQueue } from '../util/offlineQueue';
import { useTimePunch } from '../util/queries/timelog';
import { View, Text, ActivityIndicator } from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';

interface OfflineSyncContextProps {
    isSyncing: boolean;
}

const OfflineSyncContext = createContext<OfflineSyncContextProps>({ isSyncing: false });

export const useOfflineSync = () => useContext(OfflineSyncContext);

export const OfflineSyncProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [isSyncing, setIsSyncing] = useState(false);
    const { mutateAsync: timePunch } = useTimePunch();

    useEffect(() => {
        const unsubscribe = NetInfo.addEventListener(state => {
            if (state.isConnected) {
                runSync();
            }
        });

        // Run once on mount in case it missed the initial connection
        NetInfo.fetch().then(state => {
            if (state.isConnected) {
                runSync();
            }
        });

        return () => unsubscribe();
    }, []);

    const runSync = async () => {
        if (isSyncing) return;
        const queue = await getOfflineQueue();
        if (queue.length === 0) return;

        setIsSyncing(true);
        try {
            await syncOfflineQueue(timePunch);
        } finally {
            setIsSyncing(false);
        }
    };

    return (
        <OfflineSyncContext.Provider value={{ isSyncing }}>
            {children}
            {isSyncing && (
                <Animated.View
                    entering={FadeInUp}
                    exiting={FadeOutUp}
                    className="absolute top-12 left-5 right-5 bg-blue-700 px-4 py-3 rounded-2xl flex-row items-center z-50 shadow-xl"
                    style={{ elevation: 15 }}
                >
                    <ActivityIndicator color="white" />
                    <Text className="ml-3 text-white font-bold text-sm tracking-wide">Syncing offline attendance logs...</Text>
                </Animated.View>
            )}
        </OfflineSyncContext.Provider>
    );
};
