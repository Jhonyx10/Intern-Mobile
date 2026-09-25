import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { getApp } from '@react-native-firebase/app';
import {
  getMessaging,
  onMessage,
  onNotificationOpenedApp,
  getInitialNotification,
} from '@react-native-firebase/messaging';
import type { RemoteMessage } from '@react-native-firebase/messaging';

const REFETCH_TYPES = new Set(['schedule_status_update', 'company_status_update']);

export function useFcmListener() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const messaging = getMessaging(getApp());

    const invalidateForType = (type?: string) => {
      if (!type || !REFETCH_TYPES.has(type)) return;
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    };

    const unsubscribeForeground = onMessage(
      messaging,
      (remoteMessage: RemoteMessage) => {
        invalidateForType(remoteMessage.data?.type as string | undefined);
      }
    );

    const unsubscribeOpened = onNotificationOpenedApp(
      messaging,
      (remoteMessage: RemoteMessage) => {
        invalidateForType(remoteMessage.data?.type as string | undefined);
      }
    );

    getInitialNotification(messaging).then((remoteMessage) => {
      if (remoteMessage) invalidateForType(remoteMessage.data?.type as string | undefined);
    });

    const appStateSub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      }
    });

    return () => {
      unsubscribeForeground();
      unsubscribeOpened();
      appStateSub.remove();
    };
  }, [queryClient]);
}