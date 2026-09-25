import React from 'react';
import {
    Text,
    View,
    FlatList,
    ActivityIndicator,
    Pressable,
    RefreshControl,
} from 'react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import LinearGradient from 'react-native-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
    Clock,
    Coffee,
    Sunrise,
    LogIn,
    LogOut,
    AlertCircle,
    FileText,
    ChevronLeft,
} from 'lucide-react-native';

import { RootStackParamList } from '../components/Navigation';
import { useTimeLogsHistory, TimeLogEntry } from '../util/queries/timelog';
import { useUser } from '../util/queries/auth';
import { withAlpha, formatLogTime } from '../util/timeLogHelpers';

function formatLogDate(iso: string | null) {
    if (!iso) return 'Unknown date';
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
    });
}

function LogCard({ log, themeColor }: { log: TimeLogEntry; themeColor: string }) {
    const isAutoClosed = log.verification_method === 'auto_closed_missed_punch_out';

    return (
        <View
            className="rounded-3xl bg-white mb-4"
            style={{
                shadowColor: '#0F172A',
                shadowOpacity: 0.06,
                shadowRadius: 14,
                shadowOffset: { width: 0, height: 5 },
                elevation: 2,
                borderWidth: 1,
                borderColor: '#F1F5F9',
            }}
        >
            <View className="px-5 pt-5 pb-2 flex-row items-center justify-between">
                <Text className="text-[13px] font-bold text-slate-800">
                    {formatLogDate(log.time_in)}
                </Text>
                {log.is_open ? (
                    <View className="rounded-full px-3 py-1 bg-green-50">
                        <Text className="text-[10px] font-bold uppercase tracking-wide text-green-700">
                            In Progress
                        </Text>
                    </View>
                ) : isAutoClosed ? (
                    <View className="rounded-full px-3 py-1 bg-amber-50">
                        <Text className="text-[10px] font-bold uppercase tracking-wide text-amber-700">
                            Auto-closed
                        </Text>
                    </View>
                ) : (
                    <View className="rounded-full px-3 py-1 bg-slate-50">
                        <Text className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                            Completed
                        </Text>
                    </View>
                )}
            </View>

            <View className="px-5 pb-4">
                <View className="flex-row items-center py-2">
                    <View
                        className="items-center justify-center rounded-full mr-3"
                        style={{ width: 30, height: 30, backgroundColor: withAlpha(themeColor, '12') }}
                    >
                        <LogIn color={themeColor} size={14} strokeWidth={2.25} />
                    </View>
                    <Text className="text-[12px] text-slate-400 flex-1">Time In</Text>
                    <Text className="text-[13px] font-semibold text-slate-800">
                        {formatLogTime(log.time_in)}
                    </Text>
                </View>

                {(log.break_out || log.break_in) && (
                    <>
                        <View className="flex-row items-center py-2">
                            <View
                                className="items-center justify-center rounded-full mr-3"
                                style={{ width: 30, height: 30, backgroundColor: withAlpha(themeColor, '12') }}
                            >
                                <Coffee color={themeColor} size={14} strokeWidth={2.25} />
                            </View>
                            <Text className="text-[12px] text-slate-400 flex-1">Break Out</Text>
                            <Text className="text-[13px] font-semibold text-slate-800">
                                {formatLogTime(log.break_out)}
                            </Text>
                        </View>
                        <View className="flex-row items-center py-2">
                            <View
                                className="items-center justify-center rounded-full mr-3"
                                style={{ width: 30, height: 30, backgroundColor: withAlpha(themeColor, '12') }}
                            >
                                <Sunrise color={themeColor} size={14} strokeWidth={2.25} />
                            </View>
                            <Text className="text-[12px] text-slate-400 flex-1">Break In</Text>
                            <Text className="text-[13px] font-semibold text-slate-800">
                                {formatLogTime(log.break_in)}
                            </Text>
                        </View>
                    </>
                )}

                <View className="flex-row items-center py-2">
                    <View
                        className="items-center justify-center rounded-full mr-3"
                        style={{ width: 30, height: 30, backgroundColor: withAlpha(themeColor, '12') }}
                    >
                        <LogOut color={themeColor} size={14} strokeWidth={2.25} />
                    </View>
                    <Text className="text-[12px] text-slate-400 flex-1">Time Out</Text>
                    <Text className="text-[13px] font-semibold text-slate-800">
                        {log.is_open ? '—' : formatLogTime(log.time_out)}
                    </Text>
                </View>

                <View className="flex-row items-center justify-between mt-2 pt-3 border-t border-slate-100">
                    <View className="flex-row items-center">
                        <Clock color="#94A3B8" size={13} />
                        <Text className="ml-1.5 text-[12px] font-semibold text-slate-500">
                            {log.duration_hours != null ? `${log.duration_hours} hrs` : '—'}
                        </Text>
                    </View>
                    {log.task_photos_count > 0 && (
                        <View className="flex-row items-center">
                            <FileText color="#94A3B8" size={13} />
                            <Text className="ml-1.5 text-[12px] font-medium text-slate-500">
                                {log.submitted_task_photos_count}/{log.task_photos_count} photo
                                {log.task_photos_count === 1 ? '' : 's'}
                            </Text>
                        </View>
                    )}
                </View>

                {log.task_note && (
                    <Text className="text-[12px] text-slate-500 mt-2 leading-5" numberOfLines={3}>
                        {log.task_note}
                    </Text>
                )}

                {isAutoClosed && (
                    <View className="flex-row items-start mt-3 rounded-2xl bg-amber-50 px-3 py-2.5">
                        <AlertCircle color="#D97706" size={14} style={{ marginTop: 1 }} />
                        <Text className="ml-2 text-[11px] text-amber-700 flex-1 leading-4">
                            This shift was automatically timed out because a punch-out was missed.
                        </Text>
                    </View>
                )}
            </View>
        </View>
    );
}

export const TimeLogHistory = () => {
    const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
    const { data: userData } = useUser();
    const themeColor = userData?.settings?.theme_color || '#1D4ED8';

    const {
        data,
        isLoading,
        isError,
        refetch,
        isRefetching,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage,
    } = useTimeLogsHistory();

    const logs = data?.pages.flatMap((p) => p.logs) ?? [];
    const totalCount = data?.pages[0]?.total_count ?? 0;

    return (
        <View style={{ flex: 1, backgroundColor: '#F8FAFC' }}>
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
                    <View className="flex-row items-center">
                        <Pressable
                            onPress={() => navigation.goBack()}
                            className="mr-3 items-center justify-center rounded-full"
                            style={{ width: 34, height: 34, backgroundColor: 'rgba(255,255,255,0.15)' }}
                            hitSlop={8}
                        >
                            <ChevronLeft color="#fff" size={20} />
                        </Pressable>
                        <View>
                            <Text className="text-white text-[20px] font-bold">Time Log History</Text>
                            <Text className="text-white/60 text-[12px] mt-0.5">
                                {totalCount > 0 ? `${totalCount} total ${totalCount === 1 ? 'entry' : 'entries'}` : 'All your past shifts'}
                            </Text>
                        </View>
                    </View>
                </LinearGradient>
            </Animated.View>

            {isLoading ? (
                <View className="flex-1 items-center justify-center">
                    <ActivityIndicator size="large" color={themeColor} />
                </View>
            ) : isError ? (
                <View className="flex-1 items-center justify-center px-8">
                    <AlertCircle color="#94A3B8" size={48} />
                    <Text className="text-slate-500 text-center text-base mt-4">
                        Unable to load your time log history.
                    </Text>
                    <Pressable
                        onPress={() => refetch()}
                        className="mt-4 px-6 py-3 rounded-full"
                        style={{ backgroundColor: themeColor }}
                    >
                        <Text className="text-white font-semibold">Retry</Text>
                    </Pressable>
                </View>
            ) : (
                <FlatList
                    data={logs}
                    keyExtractor={(item) => String(item.id)}
                    contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
                    renderItem={({ item, index }) => (
                        <Animated.View entering={FadeInUp.duration(350).delay(Math.min(index, 6) * 40)}>
                            <Pressable onPress={() => navigation.navigate('TimeLogDetails', { timeLogId: item.id })}>
                                <LogCard log={item} themeColor={themeColor} />
                            </Pressable>
                        </Animated.View>
                    )}
                    refreshControl={
                        <RefreshControl
                            refreshing={isRefetching}
                            onRefresh={() => { refetch(); }}
                            tintColor={themeColor}
                        />
                    }
                    onEndReachedThreshold={0.4}
                    onEndReached={() => {
                        if (hasNextPage && !isFetchingNextPage) fetchNextPage();
                    }}
                    ListFooterComponent={
                        isFetchingNextPage ? (
                            <View className="py-6">
                                <ActivityIndicator color={themeColor} />
                            </View>
                        ) : undefined
                    }
                    ListEmptyComponent={
                        <View className="items-center justify-center py-20">
                            <Clock color="#CBD5E1" size={48} />
                            <Text className="text-slate-400 text-center text-sm mt-4">
                                No time logs recorded yet.
                            </Text>
                        </View>
                    }
                />
            )}
        </View>
    );
};

export default TimeLogHistory;