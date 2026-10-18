import notifee, { AndroidImportance } from '@notifee/react-native';
import type { RemoteMessage } from '@react-native-firebase/messaging';

const CHANNEL_ID = 'default';

export async function displayRemoteNotification(remoteMessage: RemoteMessage) {
  const channelId = await notifee.createChannel({
    id: CHANNEL_ID,
    name: 'Default Channel',
    importance: AndroidImportance.HIGH,
  });

  // Some backends send a data-only payload (no `notification` key), and some
  // double-wrap the payload as a JSON string inside data.data. Try all three
  // sources so we never silently drop a notification.
  let extra: Record<string, string> = {};
  try {
    const raw = remoteMessage.data?.data;
    extra = typeof raw === 'string' ? JSON.parse(raw) : (raw ?? {});
  } catch { /* ignore malformed JSON */ }

  const title =
    remoteMessage.notification?.title ??
    (remoteMessage.data?.title as string | undefined) ??
    extra?.title;
  const body =
    remoteMessage.notification?.body ??
    (remoteMessage.data?.body as string | undefined) ??
    extra?.body;

  if (!title && !body) return;

  await notifee.displayNotification({
    title,
    body,
    data: remoteMessage.data as { [key: string]: string } | undefined,
    android: {
      channelId,
      pressAction: { id: 'default' },
    },
    ios: {
      foregroundPresentationOptions: {
        banner: true,
        list: true,
        sound: true,
        badge: true,
      },
    },
  });
}