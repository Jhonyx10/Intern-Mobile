import React, { useState, useEffect } from 'react';
import {
  Text,
  View,
  FlatList,
  ScrollView,
  Modal,
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
  Sun,
  Sunset,
  AlertCircle,
  FileText,
  BarChart2,
  Calendar as CalendarIcon,
  List as ListIcon,
  Download,
  ChevronLeft,
  ChevronRight,
  X,
} from 'lucide-react-native';
import { Calendar } from 'react-native-calendars';
import { addWeeks, isSameWeek } from 'date-fns';

import ConfirmModal from '../components/modal/ConfirmModal';
import ExportDtrModal from '../components/modal/ExportDtrModal';

import { RootStackParamList } from '../components/Navigation';
import {
  useTimeLogsHistory,
  TimeLogEntry,
  TimeLogPreset,
} from '../util/queries/timelog';
import { useUser } from '../util/queries/auth';
import { useDashboard } from '../util/queries/dashboard';
import { withAlpha, formatLogTime } from '../util/timeLogHelpers';
import { parseTaskNote } from '../util/taskNote';

// Weekly report PDF (new format: Morning/Afternoon rows + supervisor signature)
import {
  exportTimeLogReportPdf,
  formatWeekLabel,
  getWeekStart,
  filterLogsToWeek,
  suggestWeekNo,
} from '../util/timeLogReportPdf';

// DTR export (PDF + CSV) used by the export modal
import { exportDtrPdf, exportDtrCsv, DtrStudent } from '../util/ExportDtr';
import { DateRange } from '../util/dtrRange';

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

// 'YYYY-MM-DD' -> "Fri, Oct 16, 2026" (no timezone shift)
function formatDayLabel(dateStr: string) {
  if (!dateStr) return '';
  return new Date(dateStr + 'T00:00:00').toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

const PRESETS: { key: TimeLogPreset; label: string }[] = [
  { key: 'daily', label: 'Daily' },
  { key: 'weekly', label: 'Weekly' },
  { key: 'monthly', label: 'Monthly' },
  { key: 'yearly', label: 'Yearly' },
];

// One half of the day (morning / afternoon) inside the compact card
function SessionColumn({
  icon: Icon,
  accent,
  label,
  range,
}: {
  icon: any;
  accent: string;
  label: string;
  range: string;
}) {
  return (
    <View className="flex-1 px-3">
      <View className="flex-row items-center mb-0.5">
        <Icon color={accent} size={11} strokeWidth={2.5} />
        <Text className="ml-1 text-[10px] font-bold text-slate-400">
          {label}
        </Text>
      </View>
      <Text
        className="text-[12px] font-semibold text-slate-800"
        numberOfLines={1}
      >
        {range}
      </Text>
    </View>
  );
}

// Compact card used by the list and by the calendar day sheet
function LogCard({
  log,
  themeColor,
}: {
  log: TimeLogEntry;
  themeColor: string;
}) {
  const isAutoClosed =
    log.verification_method === 'auto_closed_missed_punch_out';

  const note = parseTaskNote(log.task_note);
  const hasBreak = Boolean(log.break_out || log.break_in);

  const end = (iso: string | null) => (log.is_open ? '…' : formatLogTime(iso));
  const morningRange = `${formatLogTime(log.time_in)} – ${
    log.break_out ? formatLogTime(log.break_out) : end(log.time_out)
  }`;
  const afternoonRange = log.break_in
    ? `${formatLogTime(log.break_in)} – ${end(log.time_out)}`
    : '—';

  return (
    <View
      className="rounded-2xl bg-white mb-3"
      style={{
        shadowColor: '#0F172A',
        shadowOpacity: 0.05,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 3 },
        elevation: 1,
        borderWidth: 1,
        borderColor: '#F1F5F9',
      }}
    >
      {/* Date + status */}
      <View className="px-4 pt-3 pb-2 flex-row items-center justify-between">
        <Text className="text-[12px] font-bold text-slate-800">
          {formatLogDate(log.time_in)}
        </Text>
        {log.is_open ? (
          <View className="rounded-full px-2 py-0.5 bg-green-50">
            <Text className="text-[9px] font-bold uppercase tracking-wide text-green-700">
              In Progress
            </Text>
          </View>
        ) : isAutoClosed ? (
          <View className="rounded-full px-2 py-0.5 bg-amber-50">
            <Text className="text-[9px] font-bold uppercase tracking-wide text-amber-700">
              Auto-closed
            </Text>
          </View>
        ) : (
          <View className="rounded-full px-2 py-0.5 bg-slate-50">
            <Text className="text-[9px] font-bold uppercase tracking-wide text-slate-500">
              Completed
            </Text>
          </View>
        )}
      </View>

      <View className="px-4 pb-3">
        {/* Morning | Afternoon */}
        <View className="flex-row rounded-xl bg-slate-50 py-2">
          <SessionColumn
            icon={Sun}
            accent="#F59E0B"
            label={hasBreak ? 'Morning' : 'Shift'}
            range={morningRange}
          />
          {hasBreak && (
            <>
              <View style={{ width: 1, backgroundColor: '#E2E8F0' }} />
              <SessionColumn
                icon={Sunset}
                accent="#EA580C"
                label="Afternoon"
                range={afternoonRange}
              />
            </>
          )}
        </View>

        {/* Duration + photos */}
        <View className="flex-row items-center justify-between mt-2">
          <View className="flex-row items-center">
            <Clock color="#94A3B8" size={12} />
            <Text className="ml-1 text-[11px] font-semibold text-slate-500">
              {log.duration_hours != null ? `${log.duration_hours} hrs` : '—'}
            </Text>
          </View>
          {log.task_photos_count > 0 && (
            <View className="flex-row items-center">
              <FileText color="#94A3B8" size={12} />
              <Text className="ml-1 text-[11px] font-medium text-slate-500">
                {log.submitted_task_photos_count}/{log.task_photos_count} photo
                {log.task_photos_count === 1 ? '' : 's'}
              </Text>
            </View>
          )}
        </View>

        {/* Task notes: one short line per session */}
        {(note.morning || note.afternoon || note.general) && (
          <View className="mt-2 pt-2 border-t border-slate-100">
            {note.morning ? (
              <View className="flex-row items-center">
                <Sun color="#F59E0B" size={11} />
                <Text
                  className="ml-1.5 text-[11px] text-slate-500 flex-1"
                  numberOfLines={1}
                >
                  {note.morning}
                </Text>
              </View>
            ) : null}
            {note.afternoon ? (
              <View
                className="flex-row items-center"
                style={{ marginTop: note.morning ? 3 : 0 }}
              >
                <Sunset color="#EA580C" size={11} />
                <Text
                  className="ml-1.5 text-[11px] text-slate-500 flex-1"
                  numberOfLines={1}
                >
                  {note.afternoon}
                </Text>
              </View>
            ) : null}
            {note.general ? (
              <View className="flex-row items-center">
                <FileText color="#94A3B8" size={11} />
                <Text
                  className="ml-1.5 text-[11px] text-slate-500 flex-1"
                  numberOfLines={1}
                >
                  {note.general}
                </Text>
              </View>
            ) : null}
          </View>
        )}
      </View>
    </View>
  );
}

export default function Reports() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { data: userData } = useUser();
  const { data: dashboard } = useDashboard();
  const themeColor = userData?.settings?.theme_color || '#1D4ED8';
  const [preset, setPreset] = useState<TimeLogPreset>('daily');
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [dateModalOpen, setDateModalOpen] = useState(false);
  const [infoModal, setInfoModal] = useState<{
    visible: boolean;
    title: string;
    message: string;
  }>({ visible: false, title: '', message: '' });

  // Weekly PDF report state
  const [weekStart, setWeekStart] = useState<Date>(getWeekStart());
  const [exportingPdf, setExportingPdf] = useState(false);
  const isCurrentWeek = isSameWeek(weekStart, new Date(), { weekStartsOn: 1 });

  // DTR export modal state
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [isExportingDtr, setIsExportingDtr] = useState(false);

  const isCalendar = viewMode === 'calendar';

  // List view honours the Daily/Weekly/... filter. Calendar view needs every
  // log (so past days are marked), so it loads without a preset.
  const {
    data,
    isLoading,
    isError,
    refetch,
    isRefetching,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useTimeLogsHistory(isCalendar ? undefined : preset);

  // Unfiltered query used by both exports, so any week or date range is
  // complete no matter which list filter is selected.
  const exportQuery = useTimeLogsHistory(undefined);

  // In calendar mode, keep loading pages until every log is in
  useEffect(() => {
    if (isCalendar && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [isCalendar, hasNextPage, isFetchingNextPage, fetchNextPage]);

  const logs = data?.pages.flatMap(p => p.logs) ?? [];
  const totalCount = data?.pages[0]?.total_count ?? 0;
  const totalHours = logs.reduce((acc, l) => acc + (l.duration_hours ?? 0), 0);

  // Loads every page of the unfiltered history
  const loadAllLogs = async () => {
    let pages = exportQuery.data?.pages ?? [];
    let more = !!exportQuery.hasNextPage;
    while (more) {
      const res = await exportQuery.fetchNextPage();
      pages = res.data?.pages ?? pages;
      more = !!res.hasNextPage;
    }
    return pages.flatMap(p => p.logs);
  };

  // Button 2: weekly report PDF
  const handleExportWeeklyPDF = async () => {
    try {
      setExportingPdf(true);

      const allLogs = await loadAllLogs();
      const weekLogs = filterLogsToWeek(allLogs, weekStart);

      if (!weekLogs.length) {
        setInfoModal({
          visible: true,
          title: 'Empty',
          message: 'No time logs found for this week.',
        });
        return;
      }

      const studentName = userData?.user?.name ?? 'Student'; // adjust to your user field
      const supervisor = dashboard?.supervisor;

      await exportTimeLogReportPdf({
        studentName,
        logs: weekLogs,
        weekStart,
        // Week 1 = the week of the student's first time log
        weekNo: suggestWeekNo(allLogs, weekStart),
        // "Noted by" (left signature). Omitted when no supervisor is assigned.
        supervisorBy: supervisor?.name
          ? {
              name: supervisor.name,
              title: supervisor.position_title,
              organization: dashboard?.company?.name,
            }
          : undefined,
        // "Prepared by" (right signature)
        studentBy: { name: studentName },
      });
    } catch (e) {
      console.error('PDF Export Error:', e);
      setInfoModal({
        visible: true,
        title: 'Export Failed',
        message: 'There was an error generating the PDF.',
      });
    } finally {
      setExportingPdf(false);
    }
  };

  // Button 3: DTR export (PDF or CSV) for a chosen date range
  const handleExportDtr = async (
    type: 'pdf' | 'csv',
    range: DateRange | null,
  ) => {
    try {
      setIsExportingDtr(true);

      const allLogs = await loadAllLogs();

      const schedule = dashboard?.progress?.schedule;
      const student: DtrStudent = {
        name: userData?.user?.name ?? 'Student', // adjust to your user field
        company: dashboard?.company?.name ?? '',
        scheduleIn: schedule?.time_in,
        scheduleOut: schedule?.time_out,
        hoursPerDay: schedule?.hours_per_day,
      };

      if (type === 'pdf') await exportDtrPdf(allLogs, student, range);
      else await exportDtrCsv(allLogs, student, range);

      setExportModalOpen(false);
    } catch (e: any) {
      console.error('DTR Export Error:', e);
      setExportModalOpen(false);
      setInfoModal({
        visible: true,
        title: 'Export Failed',
        message: e?.message ?? 'There was an error generating the file.',
      });
    } finally {
      setIsExportingDtr(false);
    }
  };

  // Calendar marked dates
  const markedDates: any = {};
  if (isCalendar) {
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

  const selectedDayHours = logsForSelectedDate.reduce(
    (acc, l) => acc + (l.duration_hours ?? 0),
    0,
  );

  const closeDateModal = () => setDateModalOpen(false);

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
              <Text className="text-white text-[22px] font-bold ml-2">
                Reports
              </Text>
            </View>
            <View className="flex-row items-center gap-3">
              {/* 1. Toggle list / calendar */}
              <Pressable
                onPress={() =>
                  setViewMode(prev => (prev === 'list' ? 'calendar' : 'list'))
                }
                className="w-10 h-10 rounded-full bg-white/20 items-center justify-center"
              >
                {viewMode === 'list' ? (
                  <CalendarIcon color="#fff" size={18} strokeWidth={2} />
                ) : (
                  <ListIcon color="#fff" size={18} strokeWidth={2} />
                )}
              </Pressable>

              {/* 2. Export weekly report PDF */}
              <Pressable
                onPress={handleExportWeeklyPDF}
                disabled={exportingPdf}
                className="w-10 h-10 rounded-full bg-white/20 items-center justify-center"
              >
                {exportingPdf ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <FileText color="#fff" size={18} strokeWidth={2} />
                )}
              </Pressable>

              {/* 3. Export DTR (opens the modal) */}
              <Pressable
                onPress={() => setExportModalOpen(true)}
                className="w-10 h-10 rounded-full bg-white/20 items-center justify-center"
              >
                <Download color="#fff" size={18} strokeWidth={2} />
              </Pressable>
            </View>
          </View>

          <Text className="text-white/80 text-[13px] mb-4">
            {isCalendar
              ? 'Tap a date to see its time logs'
              : totalCount > 0
              ? `${totalCount} entries · ${totalHours.toFixed(
                  1,
                )} hrs total (Filtered by ${preset})`
              : `Viewing ${preset} DTR summary`}
          </Text>

          {/* Week selector for the weekly PDF report */}
          <View
            className="flex-row items-center justify-between rounded-2xl px-2 py-1.5 mb-3"
            style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}
          >
            <Pressable
              onPress={() => setWeekStart(w => addWeeks(w, -1))}
              className="p-2"
            >
              <ChevronLeft color="#fff" size={18} />
            </Pressable>
            <View className="items-center">
              <Text className="text-white/70 text-[10px] font-bold uppercase tracking-wide">
                PDF report week
              </Text>
              <Text className="text-white text-[13px] font-bold">
                {formatWeekLabel(weekStart)}
              </Text>
            </View>
            <Pressable
              onPress={() => setWeekStart(w => addWeeks(w, 1))}
              disabled={isCurrentWeek}
              className="p-2"
              style={{ opacity: isCurrentWeek ? 0.3 : 1 }}
            >
              <ChevronRight color="#fff" size={18} />
            </Pressable>
          </View>

          {/* Preset toggle (list view only) */}
          {!isCalendar && (
            <View
              className="flex-row rounded-2xl p-1"
              style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}
            >
              {PRESETS.map(({ key, label }) => (
                <Pressable
                  key={key}
                  onPress={() => setPreset(key)}
                  className="flex-1 items-center justify-center rounded-xl py-2"
                  style={
                    preset === key ? { backgroundColor: '#fff' } : undefined
                  }
                >
                  <Text
                    className="text-[13px] font-bold"
                    style={{
                      color:
                        preset === key ? themeColor : 'rgba(255,255,255,0.85)',
                    }}
                  >
                    {label}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
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
      ) : !isCalendar ? (
        // ---- LIST VIEW ----
        <FlatList
          data={logs}
          keyExtractor={item => String(item.id)}
          contentContainerStyle={{ padding: 16, paddingBottom: 106 }}
          renderItem={({ item, index }) => (
            <Animated.View
              entering={FadeInUp.duration(350).delay(Math.min(index, 6) * 40)}
            >
              <Pressable
                onPress={() =>
                  navigation.navigate('TimeLogDetails', { timeLogId: item.id })
                }
              >
                <LogCard log={item} themeColor={themeColor} />
              </Pressable>
            </Animated.View>
          )}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={() => {
                refetch();
              }}
              tintColor={themeColor}
              colors={[themeColor]}
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
              <BarChart2 color="#CBD5E1" size={48} />
              <Text className="text-slate-400 text-center text-sm mt-4">
                No entries for this period.
              </Text>
            </View>
          }
        />
      ) : (
        // ---- CALENDAR VIEW ----
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: 106 }}
          showsVerticalScrollIndicator={false}
        >
          <View className="rounded-3xl overflow-hidden border border-slate-200">
            <Calendar
              current={selectedDate || undefined}
              markedDates={markedDates}
              onDayPress={(day: any) => {
                setSelectedDate(day.dateString);
                setDateModalOpen(true);
              }}
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

          {(hasNextPage || isFetchingNextPage) && (
            <View className="flex-row items-center justify-center mt-4">
              <ActivityIndicator size="small" color={themeColor} />
              <Text className="ml-2 text-[12px] text-slate-400">
                Loading all your logs...
              </Text>
            </View>
          )}

          <View className="flex-row items-center justify-center mt-4">
            <View
              className="rounded-full mr-2"
              style={{ width: 8, height: 8, backgroundColor: themeColor }}
            />
            <Text className="text-[12px] text-slate-400">
              Dates with a dot have time logs
            </Text>
          </View>
        </ScrollView>
      )}

      {/* Day details modal */}
      <Modal
        visible={dateModalOpen}
        animationType="slide"
        transparent
        statusBarTranslucent
        onRequestClose={closeDateModal}
      >
        <View className="flex-1 justify-end">
          <Pressable
            className="absolute inset-0 bg-black/50"
            onPress={closeDateModal}
          />
          <View
            className="bg-white rounded-t-3xl p-6"
            style={{ maxHeight: '80%', minHeight: '40%' }}
          >
            <View className="flex-row justify-between items-center mb-1">
              <View className="flex-1 pr-3">
                <Text className="text-lg font-bold text-slate-900">
                  {formatDayLabel(selectedDate)}
                </Text>
                <Text className="text-xs text-slate-500 mt-0.5">
                  {logsForSelectedDate.length > 0
                    ? `${logsForSelectedDate.length} ${
                        logsForSelectedDate.length === 1 ? 'entry' : 'entries'
                      } · ${selectedDayHours.toFixed(2)} hrs`
                    : 'Time logs for this date'}
                </Text>
              </View>
              <Pressable onPress={closeDateModal} className="p-1">
                <X size={20} color="#64748B" />
              </Pressable>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingTop: 16, paddingBottom: 8 }}
            >
              {logsForSelectedDate.length === 0 ? (
                <View className="items-center justify-center py-10">
                  <Clock color="#CBD5E1" size={40} />
                  <Text className="text-slate-400 text-sm mt-3">
                    No time logs on this date.
                  </Text>
                </View>
              ) : (
                logsForSelectedDate.map(log => (
                  <Pressable
                    key={log.id}
                    onPress={() => {
                      closeDateModal();
                      navigation.navigate('TimeLogDetails', {
                        timeLogId: log.id,
                      });
                    }}
                  >
                    <LogCard log={log} themeColor={themeColor} />
                  </Pressable>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <ExportDtrModal
        visible={exportModalOpen}
        onClose={() => setExportModalOpen(false)}
        onExport={handleExportDtr}
        isExporting={isExportingDtr}
        themeColor={themeColor}
      />

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
