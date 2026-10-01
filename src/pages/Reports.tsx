import React, { useState } from 'react';
import {
    Text,
    View,
    FlatList,
    ActivityIndicator,
    Pressable,
    RefreshControl,
    Share,
    Platform,
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
    BarChart2,
    Calendar as CalendarIcon,
    List as ListIcon,
    Download
} from 'lucide-react-native';
import { Calendar } from 'react-native-calendars';
import ReactNativeBlobUtil from 'react-native-blob-util';

import ConfirmModal from '../components/modal/ConfirmModal';

import { RootStackParamList } from '../components/Navigation';
import { useTimeLogsHistory, TimeLogEntry, TimeLogPreset } from '../util/queries/timelog';
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

function formatISODate(iso: string | null) {
    if (!iso) return '';
    return iso.split('T')[0];
}

const PRESETS: { key: TimeLogPreset; label: string }[] = [
    { key: 'daily', label: 'Daily' },
    { key: 'weekly', label: 'Weekly' },
    { key: 'monthly', label: 'Monthly' },
    { key: 'yearly', label: 'Yearly' },
];

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
                </View>
            </View>
        </View>
    );
}

export default function Reports() {
    const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
    const { data: userData } = useUser();
    const themeColor = userData?.settings?.theme_color || '#1D4ED8';
    const [preset, setPreset] = useState<TimeLogPreset>('daily');
    const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');
    const [selectedDate, setSelectedDate] = useState<string>('');
    const [infoModal, setInfoModal] = useState<{ visible: boolean; title: string; message: string }>({ visible: false, title: '', message: '' });

    const {
        data,
        isLoading,
        isError,
        refetch,
        isRefetching,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage,
    } = useTimeLogsHistory(preset);

    const logs = data?.pages.flatMap((p) => p.logs) ?? [];
    const totalCount = data?.pages[0]?.total_count ?? 0;
    const totalHours = logs.reduce((acc, l) => acc + (l.duration_hours ?? 0), 0);

    const handleExportCSV = async () => {
        if (!logs.length) {
            setInfoModal({ visible: true, title: 'Empty', message: 'No time logs available to export for this period.' });
            return;
        }

        const headers = ["Date", "Session", "Time In", "Time Out", "Hours"];
        const csvRows = logs.map(log => {
            return [
                formatISODate(log.time_in),
                log.session_period || 'Regular',
                formatLogTime(log.time_in).replace(/,/g, ''),
                formatLogTime(log.time_out).replace(/,/g, ''),
                log.duration_hours || '0'
            ].join(',');
        });

        const csvContent = [headers.join(','), ...csvRows].join('\n');
        const fileName = `DTR_Export_${preset}.csv`;
        const path = `${ReactNativeBlobUtil.fs.dirs.CacheDir}/${fileName}`;

        try {
            await ReactNativeBlobUtil.fs.writeFile(path, csvContent, 'utf8');
            if (Platform.OS === 'ios') {
                await ReactNativeBlobUtil.ios.presentOptionsMenu(path);
            } else {
                await Share.share({
                    url: `file://${path}`,
                    title: fileName,
                });
            }
        } catch (e: any) {
            console.error('Export Error:', e);
            setInfoModal({ visible: true, title: 'Export Failed', message: 'There was an error generating the export file.' });
        }
    };

    // Prepare Calendar marked dates
    const markedDates: any = {};
    if (viewMode === 'calendar') {
        logs.forEach(log => {
            const dateStr = formatISODate(log.time_in);
            if (dateStr) {
                markedDates[dateStr] = {
                    marked: true,
                    dotColor: themeColor,
                    selected: selectedDate === dateStr,
                    selectedColor: selectedDate === dateStr ? themeColor : undefined,
                };
            }
        });
        if (selectedDate && !markedDates[selectedDate]) {
            markedDates[selectedDate] = {
                selected: true,
                selectedColor: themeColor,
            };
        }
    }

    const logsForSelectedDate = selectedDate
        ? logs.filter(l => formatISODate(l.time_in) === selectedDate)
        : [];

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
                    <View className="flex-row items-center justify-between mb-4">
                        <View className="flex-row items-center">
                            <BarChart2 color="#fff" size={22} strokeWidth={2} />
                            <Text className="text-white text-[22px] font-bold ml-2">Reports</Text>
                        </View>
                        <View className="flex-row items-center gap-3">
                            <Pressable
                                onPress={() => setViewMode(prev => prev === 'list' ? 'calendar' : 'list')}
                                className="w-10 h-10 rounded-full bg-white/20 items-center justify-center"
                            >
                                {viewMode === 'list' ? (
                                    <CalendarIcon color="#fff" size={18} strokeWidth={2} />
                                ) : (
                                    <ListIcon color="#fff" size={18} strokeWidth={2} />
                                )}
                            </Pressable>
                            <Pressable
                                onPress={handleExportCSV}
                                className="w-10 h-10 rounded-full bg-white/20 items-center justify-center"
                            >
                                <Download color="#fff" size={18} strokeWidth={2} />
                            </Pressable>
                        </View>
                    </View>

                    <Text className="text-white/80 text-[13px] mb-4">
                        {totalCount > 0 ? `${totalCount} entries · ${totalHours.toFixed(1)} hrs total (Filtered by ${preset})` : `Viewing ${preset} DTR summary`}
                    </Text>

                    {/* Preset Toggle */}
                    <View
                        className="flex-row rounded-2xl p-1"
                        style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}
                    >
                        {PRESETS.map(({ key, label }) => (
                            <Pressable
                                key={key}
                                onPress={() => { setPreset(key); setSelectedDate(''); }}
                                className="flex-1 items-center justify-center rounded-xl py-2"
                                style={preset === key ? { backgroundColor: '#fff' } : undefined}
                            >
                                <Text
                                    className="text-[13px] font-bold"
                                    style={{ color: preset === key ? themeColor : 'rgba(255,255,255,0.85)' }}
                                >
                                    {label}
                                </Text>
                            </Pressable>
                        ))}
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
                        Unable to load report data.
                    </Text>
                    <Pressable
                        onPress={() => refetch()}
                        className="mt-4 px-6 py-3 rounded-full"
                        style={{ backgroundColor: themeColor }}
                    >
                        <Text className="text-white font-semibold">Retry</Text>
                    </Pressable>
                </View>
            ) : viewMode === 'list' ? (
                <FlatList
                    data={logs}
                    keyExtractor={(item) => String(item.id)}
                    contentContainerStyle={{ padding: 20, paddingBottom: 106 }}
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
                            colors={[themeColor]}
                        />
                    }
                    onEndReachedThreshold={0.4}
                    onEndReached={() => {
                        if (hasNextPage && !isFetchingNextPage) fetchNextPage();
                    }}
                    ListEmptyComponent={
                        <View className="items-center justify-center py-20">
                            <BarChart2 color="#CBD5E1" size={48} />
                            <Text className="text-slate-400 text-center text-sm mt-4">
                                No entries for this period.
                            </Text>
                        </View>
                    }
                />
            ) : (
                <View className="flex-1 px-4 pt-4">
                    <View className="rounded-3xl overflow-hidden mb-4 border border-slate-200">
                        <Calendar
                            current={selectedDate || undefined}
                            markedDates={markedDates}
                            onDayPress={(day: any) => setSelectedDate(day.dateString)}
                            theme={{
                                calendarBackground: '#ffffff',
                                textSectionTitleColor: '#64748b',
                                selectedDayBackgroundColor: themeColor,
                                selectedDayTextColor: '#ffffff',
                                todayTextColor: themeColor,
                                dayTextColor: '#0f172a',
                                textDisabledColor: '#cbd5e1',
                                arrowColor: themeColor,
                                monthTextColor: '#0f172a',
                                textMonthFontWeight: 'bold',
                            }}
                        />
                    </View>

                    <Text className="text-slate-800 font-bold mb-3 px-2">
                        {selectedDate ? `Logs for ${selectedDate}` : 'Select a date to view logs'}
                    </Text>

                    <FlatList
                        data={logsForSelectedDate}
                        keyExtractor={(item) => String(item.id)}
                        contentContainerStyle={{ paddingBottom: 80 }}
                        renderItem={({ item }) => (
                            <LogCard log={item} themeColor={themeColor} />
                        )}
                        ListEmptyComponent={
                            selectedDate ? (
                                <View className="py-8 items-center justify-center bg-white rounded-3xl border border-slate-200">
                                    <Clock color="#CBD5E1" size={32} />
                                    <Text className="text-slate-400 text-sm mt-2">
                                        No logs on this date.
                                    </Text>
                                </View>
                            ) : <View />
                        }
                    />
                </View>
            )}

            <ConfirmModal
                visible={infoModal.visible}
                title={infoModal.title}
                message={infoModal.message}
                confirmLabel="OK"
                cancelLabel="Dismiss"
                themeColor={themeColor}
                onCancel={() => setInfoModal({ ...infoModal, visible: false })}
                onConfirm={() => setInfoModal({ ...infoModal, visible: false })}
            />
        </View>
    );
}
