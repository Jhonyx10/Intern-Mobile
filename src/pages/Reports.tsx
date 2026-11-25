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
import Animated, { FadeInUp } from 'react-native-reanimated';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  Clock,
  AlertCircle,
  FileText,
  BarChart2,
  Calendar as CalendarIcon,
  List as ListIcon,
  Download,
  ChevronLeft,
  ChevronRight,
  CloudOff,
  X,
} from 'lucide-react-native';
import { Calendar } from 'react-native-calendars';
import { addWeeks, addDays, format, isSameWeek } from 'date-fns';

import ConfirmModal from '../components/modal/ConfirmModal';
import ExportDtrModal from '../components/modal/ExportDtrModal';
import PdfPreviewModal from '../components/modal/PdfPreviewModal';
import ScreenHeader from '../components/ScreenHeader';
import HeaderIconButton from '../components/HeaderIconButton';
import OfflineShiftsView from '../components/OfflineShiftsView';

import { RootStackParamList } from '../components/Navigation';
import { useTimeLogsHistory, TimeLogEntry } from '../util/queries/timelog';
import { useUser } from '../util/queries/auth';
import { useDashboard } from '../util/queries/dashboard';
import { useOfflineShifts } from '../util/offlineShift';
import { formatLogTime } from '../util/timeLogHelpers';
import { parseTaskNote } from '../util/taskNote';
import { PAGE_BG, LINE, INK, MUTED, Panel } from '../components/ScreenKit';

// Weekly report PDF (new format: Morning/Afternoon rows + supervisor signature)
import {
  buildTimeLogReportPdf,
  openPdfFile,
  formatWeekLabel,
  getWeekStart,
  filterLogsToWeek,
  suggestWeekNo,
} from '../util/timeLogReportPdf';

// DTR export (PDF + CSV) used by the export modal
import { exportDtrPdf, exportDtrCsv, DtrStudent } from '../util/ExportDtr';
import { DateRange } from '../util/dtrRange';

type CustomRange = { start: string; end: string };

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

// ('2026-10-12', '2026-10-18') -> "Oct 12 – Oct 18, 2026"
function formatRangeLabel(start: string, end: string) {
  const s = new Date(start + 'T00:00:00');
  const e = new Date(end + 'T00:00:00');
  const endText = e.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  if (start === end) return endText;
  const sameYear = s.getFullYear() === e.getFullYear();
  const startText = s.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
  return `${startText} – ${endText}`;
}

// Every 'YYYY-MM-DD' from start to end, inclusive
function datesBetween(start: string, end: string): string[] {
  const out: string[] = [];
  let cur = new Date(start + 'T00:00:00');
  const last = new Date(end + 'T00:00:00');
  while (cur <= last) {
    out.push(format(cur, 'yyyy-MM-dd'));
    cur = addDays(cur, 1);
  }
  return out;
}

// One half of the day (morning / afternoon) inside the log card
function SessionColumn({ label, range }: { label: string; range: string }) {
  return (
    <View className="flex-1 px-3">
      <Text className="text-[11px]" style={{ color: MUTED }}>
        {label}
      </Text>
      <Text
        className="text-[13px] font-semibold mt-0.5"
        style={{ color: INK }}
        numberOfLines={1}
      >
        {range}
      </Text>
    </View>
  );
}

// Labeled button used in the header's action row
function HeaderPill({
  label,
  onPress,
  disabled,
  loading,
  style,
  children,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  style?: React.ComponentProps<typeof Pressable>['style'];
  children: React.ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={label}
      className="flex-1 flex-row items-center justify-center rounded-2xl py-3"
      style={[
        {
          backgroundColor: 'rgba(255,255,255,0.15)',
          opacity: disabled ? 0.5 : 1,
        },
        style as any,
      ]}
    >
      {loading ? <ActivityIndicator color="#fff" size="small" /> : children}
      <Text className="text-white text-[13px] font-semibold ml-2">{label}</Text>
    </Pressable>
  );
}

// Card used by the list and by the calendar day sheet
function LogCard({ log }: { log: TimeLogEntry; themeColor: string }) {
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

  const statusMeta = log.is_open
    ? { label: 'In progress', color: '#059669' }
    : isAutoClosed
    ? { label: 'Auto-closed', color: '#D97706' }
    : { label: 'Completed', color: MUTED };

  const hasNotes = Boolean(note.morning || note.afternoon || note.general);

  return (
    <View className="mb-3">
      <Panel>
        <View className="p-4">
          {/* Date + status */}
          <View className="flex-row items-center justify-between">
            <Text className="text-[14px] font-semibold" style={{ color: INK }}>
              {formatLogDate(log.time_in)}
            </Text>
            <View className="flex-row items-center">
              <View
                className="rounded-full mr-1.5"
                style={{
                  width: 7,
                  height: 7,
                  backgroundColor: statusMeta.color,
                }}
              />
              <Text
                className="text-[12px] font-medium"
                style={{ color: statusMeta.color }}
              >
                {statusMeta.label}
              </Text>
            </View>
          </View>

          {/* Morning | Afternoon */}
          <View
            className="flex-row rounded-xl py-2.5 mt-3"
            style={{ backgroundColor: PAGE_BG }}
          >
            <SessionColumn
              label={hasBreak ? 'Morning' : 'Shift'}
              range={morningRange}
            />
            {hasBreak && (
              <>
                <View style={{ width: 1, backgroundColor: LINE }} />
                <SessionColumn label="Afternoon" range={afternoonRange} />
              </>
            )}
          </View>

          {/* Duration + photos */}
          <View className="flex-row items-center justify-between mt-3">
            <Text className="text-[13px] font-semibold" style={{ color: INK }}>
              {log.duration_hours != null ? `${log.duration_hours} hrs` : '—'}
            </Text>
            {log.task_photos_count > 0 && (
              <Text className="text-[12px]" style={{ color: MUTED }}>
                {log.submitted_task_photos_count}/{log.task_photos_count} photo
                {log.task_photos_count === 1 ? '' : 's'}
              </Text>
            )}
          </View>

          {/* Task notes: one short line per session */}
          {hasNotes && (
            <View
              className="mt-3 pt-3"
              style={{ borderTopWidth: 1, borderTopColor: LINE }}
            >
              {note.morning ? (
                <Text
                  className="text-[12px]"
                  style={{ color: MUTED }}
                  numberOfLines={1}
                >
                  <Text style={{ color: INK, fontWeight: '600' }}>
                    Morning{' '}
                  </Text>
                  {note.morning}
                </Text>
              ) : null}
              {note.afternoon ? (
                <Text
                  className="text-[12px]"
                  style={{ color: MUTED, marginTop: note.morning ? 4 : 0 }}
                  numberOfLines={1}
                >
                  <Text style={{ color: INK, fontWeight: '600' }}>
                    Afternoon{' '}
                  </Text>
                  {note.afternoon}
                </Text>
              ) : null}
              {note.general ? (
                <Text
                  className="text-[12px]"
                  style={{
                    color: MUTED,
                    marginTop: note.morning || note.afternoon ? 4 : 0,
                  }}
                  numberOfLines={1}
                >
                  <Text style={{ color: INK, fontWeight: '600' }}>Note </Text>
                  {note.general}
                </Text>
              ) : null}
            </View>
          )}
        </View>
      </Panel>
    </View>
  );
}

export default function Reports() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { data: userData } = useUser();
  const { data: dashboard } = useDashboard();
  const themeColor = userData?.settings?.theme_color || '#1D4ED8';
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');

  // Offline shifts saved on this device (waiting to be uploaded)
  const [showOffline, setShowOffline] = useState(false);
  const { done: offlineShifts } = useOfflineShifts();

  const [selectedDate, setSelectedDate] = useState<string>('');
  const [dateModalOpen, setDateModalOpen] = useState(false);
  const [infoModal, setInfoModal] = useState<{
    visible: boolean;
    title: string;
    message: string;
  }>({ visible: false, title: '', message: '' });

  // Selected week (drives the list and the weekly PDF)
  const [weekStart, setWeekStart] = useState<Date>(getWeekStart());
  const isCurrentWeek = isSameWeek(weekStart, new Date(), { weekStartsOn: 1 });

  // Optional custom date range. When set it replaces the week for the list.
  const [customRange, setCustomRange] = useState<CustomRange | null>(null);
  const [rangeModalOpen, setRangeModalOpen] = useState(false);
  const [draftStart, setDraftStart] = useState<string | null>(null);
  const [draftEnd, setDraftEnd] = useState<string | null>(null);

  // Weekly PDF report state
  const [exportingPdf, setExportingPdf] = useState(false);
  // Generated PDF waiting in the preview modal (not shared/saved yet)
  const [pdfPreview, setPdfPreview] = useState<{
    path: string;
    fileName: string;
  } | null>(null);
  const [openingPdf, setOpeningPdf] = useState(false);

  // DTR export modal state
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [isExportingDtr, setIsExportingDtr] = useState(false);

  const isCalendar = viewMode === 'calendar';

  // Single unfiltered history query. Filtering by week / range happens on
  // the client, so every page is loaded.
  const {
    data,
    isLoading,
    isError,
    refetch,
    isRefetching,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useTimeLogsHistory(undefined);

  // Keep loading pages until every log is in
  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const allFetchedLogs = data?.pages.flatMap(p => p.logs) ?? [];

  // List: custom range if set, otherwise the selected week.
  // Calendar: everything, so every day with logs gets a dot.
  const periodLogs = customRange
    ? allFetchedLogs.filter(l => {
        const d = formatISODate(l.time_in);
        return d >= customRange.start && d <= customRange.end;
      })
    : filterLogsToWeek(allFetchedLogs, weekStart);

  const logs = isCalendar ? allFetchedLogs : periodLogs;
  const totalCount = logs.length;
  const totalHours = logs.reduce((acc, l) => acc + (l.duration_hours ?? 0), 0);
  const loadingAll = hasNextPage || isFetchingNextPage;

  // Loads every page of the history (used by both exports)
  const loadAllLogs = async () => {
    let pages = data?.pages ?? [];
    let more = !!hasNextPage;
    while (more) {
      const res = await fetchNextPage();
      pages = res.data?.pages ?? pages;
      more = !!res.hasNextPage;
    }
    return pages.flatMap(p => p.logs);
  };

  // ---- Week selector / date range ----

  const todayStr = format(new Date(), 'yyyy-MM-dd');

  const goToWeek = (delta: number) => {
    setCustomRange(null); // arrows always go back to week mode
    setWeekStart(w => addWeeks(w, delta));
  };

  const openRangePicker = () => {
    if (customRange) {
      setDraftStart(customRange.start);
      setDraftEnd(customRange.end);
    } else {
      // Start from the currently selected week (clamped to today)
      const weekEnd = format(addDays(weekStart, 6), 'yyyy-MM-dd');
      setDraftStart(format(weekStart, 'yyyy-MM-dd'));
      setDraftEnd(weekEnd > todayStr ? todayStr : weekEnd);
    }
    setRangeModalOpen(true);
  };

  const closeRangePicker = () => setRangeModalOpen(false);

  const handleRangeDayPress = (dateString: string) => {
    if (!draftStart || (draftStart && draftEnd)) {
      // Start a new range
      setDraftStart(dateString);
      setDraftEnd(null);
    } else if (dateString < draftStart) {
      // Tapped before the start: restart from this day
      setDraftStart(dateString);
    } else {
      setDraftEnd(dateString);
    }
  };

  const applyRange = () => {
    if (!draftStart) return;
    setCustomRange({ start: draftStart, end: draftEnd ?? draftStart });
    setRangeModalOpen(false);
  };

  const clearRange = () => {
    setCustomRange(null);
    setRangeModalOpen(false);
  };

  const rangeMarkedDates: any = {};
  if (draftStart) {
    const days = datesBetween(draftStart, draftEnd ?? draftStart);
    days.forEach((d, i) => {
      rangeMarkedDates[d] = {
        startingDay: i === 0,
        endingDay: i === days.length - 1,
        color: themeColor,
        textColor: '#ffffff',
      };
    });
  }

  // ---- Exports ----

  // Weekly PDF, step 1: build the weekly report PDF and show it in the preview
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

      const result = await buildTimeLogReportPdf({
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

      setPdfPreview(result);
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

  // Weekly PDF, step 2: the user approved the preview, so save / share it
  const handleOpenPreviewedPdf = async () => {
    if (!pdfPreview) return;
    try {
      setOpeningPdf(true);
      await openPdfFile(pdfPreview.path);
      setPdfPreview(null);
    } catch (e) {
      console.error('PDF Open Error:', e);
      setPdfPreview(null);
      setInfoModal({
        visible: true,
        title: 'Could not open PDF',
        message: 'There was an error opening the PDF.',
      });
    } finally {
      setOpeningPdf(false);
    }
  };

  // DTR export (PDF or CSV) for a chosen date range
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

  // ---- Calendar view ----

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

  const periodWord = customRange ? 'range' : 'week';

  // Kept short so it fits on one line next to the header buttons
  const headerSubtitle = showOffline
    ? `${offlineShifts.length} shift(s) on this device`
    : isCalendar
    ? 'Tap a date to see its logs'
    : totalCount > 0
    ? `${totalCount} ${
        totalCount === 1 ? 'entry' : 'entries'
      } · ${totalHours.toFixed(1)} hrs`
    : `No entries for this ${periodWord}`;

  const periodLabel = customRange
    ? formatRangeLabel(customRange.start, customRange.end)
    : formatWeekLabel(weekStart);

  return (
    <View style={{ flex: 1, backgroundColor: PAGE_BG }}>
      <ScreenHeader
        compact
        title="Reports"
        subtitle={headerSubtitle}
        actions={
          <>
            {/* Toggle list / calendar */}
            <HeaderIconButton
              onPress={() =>
                setViewMode(prev => (prev === 'list' ? 'calendar' : 'list'))
              }
              accessibilityLabel={
                viewMode === 'list' ? 'Show calendar' : 'Show list'
              }
            >
              {viewMode === 'list' ? (
                <CalendarIcon color="#fff" size={19} strokeWidth={2} />
              ) : (
                <ListIcon color="#fff" size={19} strokeWidth={2} />
              )}
            </HeaderIconButton>

            {/* Toggle offline saved shifts */}
            <HeaderIconButton
              onPress={() => setShowOffline(v => !v)}
              accessibilityLabel={
                showOffline ? 'Show online reports' : 'Show offline shifts'
              }
            >
              <CloudOff
                color={showOffline ? '#FDE68A' : '#fff'}
                size={19}
                strokeWidth={2}
              />
              {offlineShifts.length > 0 && (
                <View
                  style={{
                    position: 'absolute',
                    top: -2,
                    right: -2,
                    minWidth: 16,
                    height: 16,
                    borderRadius: 8,
                    backgroundColor: '#EF4444',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text
                    style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}
                  >
                    {offlineShifts.length}
                  </Text>
                </View>
              )}
            </HeaderIconButton>
          </>
        }
      >
        {!showOffline && (
          <>
            {/* Week selector. Tap the date to pick a custom range instead. */}
            <View
              className="flex-row items-center justify-between rounded-2xl px-2 py-2 mt-6"
              style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}
            >
              <Pressable
                onPress={() => goToWeek(-1)}
                accessibilityLabel="Previous week"
                className="p-2.5"
              >
                <ChevronLeft color="#fff" size={18} />
              </Pressable>

              <View className="items-center">
                <Text
                  className="text-[11px] font-medium"
                  style={{ color: 'rgba(255,255,255,0.75)' }}
                >
                  {customRange ? 'Custom range' : 'Selected week'}
                </Text>
                <View className="flex-row items-center mt-0.5">
                  <Pressable
                    onPress={openRangePicker}
                    accessibilityLabel="Choose a date range"
                    className="flex-row items-center"
                  >
                    <Text className="text-white text-[14px] font-bold">
                      {periodLabel}
                    </Text>
                    <View className="ml-1.5">
                      <CalendarIcon color="#fff" size={13} strokeWidth={2} />
                    </View>
                  </Pressable>
                  {customRange && (
                    <Pressable
                      onPress={clearRange}
                      accessibilityLabel="Clear custom range"
                      hitSlop={10}
                      className="ml-2 rounded-full p-0.5"
                      style={{ backgroundColor: 'rgba(255,255,255,0.25)' }}
                    >
                      <X color="#fff" size={12} strokeWidth={2.5} />
                    </Pressable>
                  )}
                </View>
              </View>

              <Pressable
                onPress={() => goToWeek(1)}
                disabled={isCurrentWeek}
                accessibilityLabel="Next week"
                className="p-2.5"
                style={{ opacity: isCurrentWeek ? 0.3 : 1 }}
              >
                <ChevronRight color="#fff" size={18} />
              </Pressable>
            </View>

            {/* Export actions. Weekly PDF is per-week, so it is off in range mode. */}
            <View className="flex-row mt-3">
              <HeaderPill
                label="Weekly PDF"
                onPress={handleExportWeeklyPDF}
                disabled={exportingPdf || customRange !== null}
                loading={exportingPdf}
              >
                <FileText color="#fff" size={17} strokeWidth={2} />
              </HeaderPill>
              <HeaderPill
                label="Export DTR"
                onPress={() => setExportModalOpen(true)}
                style={{ marginLeft: 10 }}
              >
                <Download color="#fff" size={17} strokeWidth={2} />
              </HeaderPill>
            </View>
          </>
        )}
      </ScreenHeader>

      {showOffline ? (
        // ---- OFFLINE SAVED SHIFTS ----
        <OfflineShiftsView themeColor={themeColor} />
      ) : isLoading ? (
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
        // ---- LIST VIEW (selected week or custom range) ----
        <FlatList
          data={logs}
          keyExtractor={item => String(item.id)}
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingTop: 16,
            paddingBottom: 106,
          }}
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
          ListFooterComponent={
            loadingAll ? (
              <View className="py-6">
                <ActivityIndicator color={themeColor} />
              </View>
            ) : undefined
          }
          ListEmptyComponent={
            loadingAll ? undefined : (
              <View className="items-center justify-center py-20">
                <BarChart2 color="#CBD5E1" size={48} />
                <Text className="text-slate-400 text-center text-sm mt-4">
                  No entries for this {periodWord}.
                </Text>
              </View>
            )
          }
        />
      ) : (
        // ---- CALENDAR VIEW (all logs) ----
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingTop: 16,
            paddingBottom: 106,
          }}
          showsVerticalScrollIndicator={false}
        >
          <Panel>
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
          </Panel>

          {loadingAll && (
            <View className="flex-row items-center justify-center mt-4">
              <ActivityIndicator size="small" color={themeColor} />
              <Text className="ml-2 text-[12px]" style={{ color: MUTED }}>
                Loading all your logs...
              </Text>
            </View>
          )}

          <View className="flex-row items-center justify-center mt-4">
            <View
              className="rounded-full mr-2"
              style={{ width: 8, height: 8, backgroundColor: themeColor }}
            />
            <Text className="text-[12px]" style={{ color: MUTED }}>
              Dates with a dot have time logs
            </Text>
          </View>
        </ScrollView>
      )}

      {/* Day details modal (calendar view) */}
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

      {/* Custom date range picker */}
      <Modal
        visible={rangeModalOpen}
        animationType="slide"
        transparent
        statusBarTranslucent
        onRequestClose={closeRangePicker}
      >
        <View className="flex-1 justify-end">
          <Pressable
            className="absolute inset-0 bg-black/50"
            onPress={closeRangePicker}
          />
          <View className="bg-white rounded-t-3xl p-6">
            <View className="flex-row justify-between items-center">
              <View className="flex-1 pr-3">
                <Text className="text-lg font-bold text-slate-900">
                  Select date range
                </Text>
                <Text className="text-xs text-slate-500 mt-0.5">
                  {!draftStart
                    ? 'Tap a start date, then an end date'
                    : !draftEnd
                    ? `${formatDayLabel(draftStart)} · tap an end date`
                    : formatRangeLabel(draftStart, draftEnd)}
                </Text>
              </View>
              <Pressable onPress={closeRangePicker} className="p-1">
                <X size={20} color="#64748B" />
              </Pressable>
            </View>

            <View className="mt-3">
              <Calendar
                current={draftStart ?? undefined}
                maxDate={todayStr}
                markingType="period"
                markedDates={rangeMarkedDates}
                onDayPress={(day: any) => handleRangeDayPress(day.dateString)}
                theme={{
                  calendarBackground: '#ffffff',
                  textSectionTitleColor: '#64748b',
                  todayTextColor: themeColor,
                  dayTextColor: '#0f172a',
                  textDisabledColor: '#cbd5e1',
                  arrowColor: themeColor,
                  monthTextColor: '#0f172a',
                  textMonthFontWeight: 'bold',
                }}
              />
            </View>

            <View className="flex-row mt-4">
              <Pressable
                onPress={clearRange}
                className="flex-1 items-center justify-center rounded-2xl py-3.5"
                style={{ backgroundColor: PAGE_BG }}
              >
                <Text
                  className="text-[14px] font-semibold"
                  style={{ color: INK }}
                >
                  Use weekly view
                </Text>
              </Pressable>
              <Pressable
                onPress={applyRange}
                disabled={!draftStart}
                className="flex-1 items-center justify-center rounded-2xl py-3.5"
                style={{
                  backgroundColor: themeColor,
                  marginLeft: 10,
                  opacity: draftStart ? 1 : 0.5,
                }}
              >
                <Text className="text-white text-[14px] font-semibold">
                  Apply
                </Text>
              </Pressable>
            </View>
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

      <PdfPreviewModal
        visible={pdfPreview !== null}
        path={pdfPreview?.path ?? null}
        fileName={pdfPreview?.fileName ?? ''}
        themeColor={themeColor}
        onClose={() => setPdfPreview(null)}
        onConfirm={handleOpenPreviewedPdf}
        isConfirming={openingPdf}
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
