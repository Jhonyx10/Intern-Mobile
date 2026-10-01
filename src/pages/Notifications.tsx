import React, { useEffect } from 'react';
import {
    View,
    Text,
    FlatList,
    Pressable,
    ActivityIndicator,
} from 'react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import LinearGradient from 'react-native-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Bell, ArrowLeft, CheckCheck, Info } from 'lucide-react-native';
import { RootStackParamList } from '../components/Navigation';
import {
    useInAppNotifications,
    useMarkInAppNotificationsRead,
    InAppNotification,
} from '../util/queries/notifications';
import { useUser } from '../util/queries/auth';
import { withAlpha } from '../util/timeLogHelpers';

function timeAgo(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60_000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
}

function NotifCard({ item, themeColor }: { item: InAppNotification; themeColor: string }) {
    return (
        <Animated.View
            entering={FadeInUp.duration(300)}
            className="mx-4 mb-3 rounded-2xl bg-white px-4 py-4"
            style={{
                shadowColor: '#0F172A',
                shadowOpacity: 0.06,
                shadowRadius: 10,
                shadowOffset: { width: 0, height: 4 },
                elevation: 2,
                borderWidth: 1,
                borderColor: '#F1F5F9',
            }}
        >
            <View className="flex-row items-start gap-3">
                <View
                    className="items-center justify-center rounded-full"
                    style={{
                        width: 36,
                        height: 36,
                        backgroundColor: withAlpha(themeColor, '18'),
                        marginRight: 10,
                    }}
                >
                    <Info color={themeColor} size={16} strokeWidth={2.25} />
                </View>
                <View className="flex-1">
                    <Text className="text-[13px] font-bold text-slate-800">{item.data.title}</Text>
                    <Text className="mt-0.5 text-[12px] text-slate-500">{item.data.body}</Text>
                    <Text className="mt-2 text-[10px] font-medium text-slate-400">{timeAgo(item.created_at)}</Text>
                </View>
            </View>
        </Animated.View>
    );
}

export default function Notifications() {
    const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
    const { data: userData } = useUser();
    const themeColor = userData?.settings?.theme_color || '#1D4ED8';

    const { data: notifications = [], isLoading, refetch } = useInAppNotifications();
    const markRead = useMarkInAppNotificationsRead();

    // Mark all as read as soon as the screen is opened
    useEffect(() => {
        if (notifications.length > 0) {
            markRead.mutate();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [notifications.length]);

    return (
        <View style={{ flex: 1, backgroundColor: '#F8FAFC' }}>
            {/* Header */}
            <Animated.View entering={FadeInDown.duration(400)}>
                <LinearGradient
                    colors={[themeColor, withAlpha(themeColor, 'CC')]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={{
                        paddingTop: 52,
                        paddingBottom: 24,
                        paddingHorizontal: 24,
                        borderBottomLeftRadius: 36,
                        borderBottomRightRadius: 36,
                    }}
                >
                    <View className="flex-row items-center justify-between mb-1">
                        <View className="flex-row items-center">
                            <Pressable
                                onPress={() => navigation.goBack()}
                                className="w-9 h-9 rounded-full bg-white/20 items-center justify-center mr-3"
                            >
                                <ArrowLeft color="#fff" size={18} strokeWidth={2} />
                            </Pressable>
                            <Bell color="#fff" size={22} strokeWidth={2} />
                            <Text className="text-white text-[22px] font-bold ml-2">Notifications</Text>
                        </View>
                        {notifications.length > 0 && (
                            <Pressable
                                onPress={() => markRead.mutate()}
                                className="flex-row items-center gap-1 bg-white/20 px-3 py-1.5 rounded-full"
                            >
                                <CheckCheck color="#fff" size={14} strokeWidth={2} />
                                <Text className="text-white text-[11px] font-semibold ml-1">Mark all read</Text>
                            </Pressable>
                        )}
                    </View>
                    <Text className="text-white/70 text-[13px] mt-2">
                        {notifications.length > 0 ? `${notifications.length} unread` : 'All caught up!'}
                    </Text>
                </LinearGradient>
            </Animated.View>

            {/* Body */}
            {isLoading ? (
                <View className="flex-1 items-center justify-center">
                    <ActivityIndicator size="large" color={themeColor} />
                </View>
            ) : (
                <FlatList
                    data={notifications}
                    keyExtractor={item => item.id}
                    contentContainerStyle={{ paddingTop: 20, paddingBottom: 40 }}
                    renderItem={({ item }) => <NotifCard item={item} themeColor={themeColor} />}
                    onRefresh={refetch}
                    refreshing={false}
                    ListEmptyComponent={
                        <View className="items-center justify-center py-20">
                            <Bell color="#CBD5E1" size={48} />
                            <Text className="text-slate-400 text-center text-sm mt-4">
                                No unread notifications.
                            </Text>
                        </View>
                    }
                />
            )}
        </View>
    );
}
