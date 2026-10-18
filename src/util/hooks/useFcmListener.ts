import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { displayRemoteNotification } from '../fcmNotifications';
import { getApp } from '@react-native-firebase/app';
import {
  getMessaging,
  onMessage,
  onNotificationOpenedApp,
  getInitialNotification,
} from '@react-native-firebase/messaging';

export function useFcmListener() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const messaging = getMessaging(getApp());

    const invalidateAll = () => {
      const keys = [
        ['dashboard'],
        ['documents'],
        ['evaluations'],
        ['pendingExcursions'],
        ['notifications'],
        ['intern_profile'],
        ['in_app_notifications'], // bell badge (unread)
        ['all_notifications'],   
        ['time_status'],
        ['company_requests'],
      ];
      keys.forEach((queryKey) => queryClient.invalidateQueries({ queryKey }));
    };

    const unsubscribeForeground = onMessage(messaging, async (remoteMessage) => {
      invalidateAll();
      await displayRemoteNotification(remoteMessage);
    });

    const unsubscribeOpened = onNotificationOpenedApp(messaging, () => {
      invalidateAll();
    });

    getInitialNotification(messaging).then((remoteMessage) => {
      if (remoteMessage) invalidateAll();
    });

    const appStateSub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        invalidateAll();
      }
    });

    return () => {
      unsubscribeForeground();
      unsubscribeOpened();
      appStateSub.remove();
    };
  }, [queryClient]);
}