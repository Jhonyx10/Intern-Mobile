import React, { useMemo, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  Text,
  View,
  ActivityIndicator,
} from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import DateTimePicker, {
  DateTimePickerAndroid,
} from '@react-native-community/datetimepicker';
import {
  ChevronLeft,
  ChevronRight,
  FileDown,
  Download,
  X,
} from 'lucide-react-native';
import {
  addMonths,
  endOfMonth,
  endOfWeek,
  endOfYear,
  format,
  startOfMonth,
  startOfWeek,
  startOfYear,
  subMonths,
  subWeeks,
} from 'date-fns';
import { DateRange } from '../../util/dtrRange';
import { withAlpha } from '../../util/timeLogHelpers';

type Mode =
  | 'this_week'
  | 'last_week'
  | 'this_month'
  | 'last_month'
  | 'months'
  | 'year'
  | 'custom'
  | 'all';

const WEEK = { weekStartsOn: 1 as const }; // Monday; use 0 for Sunday

const PRESETS: { key: Mode; label: string }[] = [
  { key: 'this_week', label: 'This week' },
  { key: 'last_week', label: 'Last week' },
  { key: 'this_month', label: 'This month' },
  { key: 'last_month', label: 'Last month' },
  { key: 'months', label: 'Month range' },
  { key: 'year', label: 'Whole year' },
  { key: 'custom', label: 'Custom' },
  { key: 'all', label: 'All' },
];

interface Props {
  visible: boolean;
  onClose: () => void;
  onExport: (type: 'pdf' | 'csv', range: DateRange | null) => void;
  isExporting: boolean;
  themeColor: string;
}

function DateField({
  value,
  onChange,
}: {
  value: Date;
  onChange: (d: Date) => void;
}) {
  if (Platform.OS === 'ios') {
    return (
      <DateTimePicker
        value={value}
        mode="date"
        display="compact"
        onChange={(_, d) => d && onChange(d)}
      />
    );
  }
  return (
    <Pressable
      onPress={() =>
        DateTimePickerAndroid.open({
          value,
          mode: 'date',
          onChange: (_, d) => d && onChange(d),
        })
      }
      className="rounded-xl border border-slate-200 px-3 py-2"
    >
      <Text className="text-[12px] font-semibold text-slate-700">
        {format(value, 'MMM d, yyyy')}
      </Text>
    </Pressable>
  );
}

function Stepper({
  label,
  onPrev,
  onNext,
}: {
  label: string;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <View className="flex-row items-center rounded-xl border border-slate-200">
      <Pressable onPress={onPrev} hitSlop={6} className="px-2 py-2">
        <ChevronLeft size={16} color="#64748B" />
      </Pressable>
      <Text className="w-[84px] text-center text-[12px] font-semibold text-slate-700">
        {label}
      </Text>
      <Pressable onPress={onNext} hitSlop={6} className="px-2 py-2">
        <ChevronRight size={16} color="#64748B" />
      </Pressable>
    </View>
  );
}

export default function ExportDtrModal({
  visible,
  onClose,
  onExport,
  isExporting,
  themeColor,
}: Props) {
  const [mode, setMode] = useState<Mode>('this_month');
  const [from, setFrom] = useState(new Date());
  const [to, setTo] = useState(new Date());
  const [fromMonth, setFromMonth] = useState(startOfMonth(new Date()));
  const [toMonth, setToMonth] = useState(startOfMonth(new Date()));
  const [year, setYear] = useState(new Date().getFullYear());

  const range: DateRange | null | 'invalid' = useMemo(() => {
    const now = new Date();
    let r: DateRange | null = null;
    switch (mode) {
      case 'all':
        return null;
      case 'this_week':
        r = { from: startOfWeek(now, WEEK), to: endOfWeek(now, WEEK) };
        break;
      case 'last_week': {
        const d = subWeeks(now, 1);
        r = { from: startOfWeek(d, WEEK), to: endOfWeek(d, WEEK) };
        break;
      }
      case 'this_month':
        r = { from: startOfMonth(now), to: endOfMonth(now) };
        break;
      case 'last_month': {
        const d = subMonths(now, 1);
        r = { from: startOfMonth(d), to: endOfMonth(d) };
        break;
      }
      case 'months':
        r = { from: startOfMonth(fromMonth), to: endOfMonth(toMonth) };
        break;
      case 'year': {
        const d = new Date(year, 0, 1);
        r = { from: startOfYear(d), to: endOfYear(d) };
        break;
      }
      case 'custom':
        r = { from, to };
        break;
    }
    return r && r.from <= r.to ? r : 'invalid';
  }, [mode, from, to, fromMonth, toMonth, year]);

  const invalid = range === 'invalid';
  const safeRange = invalid ? null : (range as DateRange | null);
  const summary = invalid
    ? 'Start must be before end.'
    : safeRange
    ? `${format(safeRange.from, 'MMM d, yyyy')} – ${format(
        safeRange.to,
        'MMM d, yyyy',
      )}`
    : 'Every log on record';

  const disabled = invalid || isExporting;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
    >
      <Animated.View
        entering={FadeIn.duration(150)}
        className="flex-1 items-center justify-center px-5"
        style={{ backgroundColor: 'rgba(15,23,42,0.5)' }}
      >
        <Pressable className="absolute inset-0" onPress={onClose} />
        <Animated.View
          entering={FadeInDown.duration(220)}
          className="w-full rounded-3xl bg-white p-5"
        >
          <View className="flex-row items-center justify-between mb-4">
            <Text className="text-[16px] font-bold text-slate-900">
              Export DTR
            </Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <X size={18} color="#64748B" />
            </Pressable>
          </View>

          <View className="flex-row flex-wrap" style={{ gap: 8 }}>
            {PRESETS.map(p => {
              const active = mode === p.key;
              return (
                <Pressable
                  key={p.key}
                  onPress={() => setMode(p.key)}
                  className="rounded-full px-3.5 py-2 border"
                  style={{
                    borderColor: active ? themeColor : '#E2E8F0',
                    backgroundColor: active
                      ? withAlpha(themeColor, '12')
                      : '#fff',
                  }}
                >
                  <Text
                    className="text-[12px] font-semibold"
                    style={{ color: active ? themeColor : '#64748B' }}
                  >
                    {p.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {mode === 'months' && (
            <Animated.View
              entering={FadeIn.duration(150)}
              className="mt-4 flex-row items-center justify-between"
            >
              <Stepper
                label={format(fromMonth, 'MMM yyyy')}
                onPrev={() => setFromMonth(m => subMonths(m, 1))}
                onNext={() => setFromMonth(m => addMonths(m, 1))}
              />
              <Text className="text-[12px] text-slate-400">to</Text>
              <Stepper
                label={format(toMonth, 'MMM yyyy')}
                onPrev={() => setToMonth(m => subMonths(m, 1))}
                onNext={() => setToMonth(m => addMonths(m, 1))}
              />
            </Animated.View>
          )}

          {mode === 'custom' && (
            <Animated.View
              entering={FadeIn.duration(150)}
              className="mt-4 flex-row items-center justify-between"
            >
              <DateField value={from} onChange={setFrom} />
              <Text className="text-[12px] text-slate-400">to</Text>
              <DateField value={to} onChange={setTo} />
            </Animated.View>
          )}

          {mode === 'year' && (
            <Animated.View
              entering={FadeIn.duration(150)}
              className="mt-4 flex-row"
            >
              <Stepper
                label={String(year)}
                onPrev={() => setYear(y => y - 1)}
                onNext={() => setYear(y => y + 1)}
              />
            </Animated.View>
          )}

          <Text
            className="mt-4 text-[12px]"
            style={{ color: invalid ? '#DC2626' : '#94A3B8' }}
          >
            {summary}
          </Text>

          <View className="mt-4 flex-row" style={{ gap: 10 }}>
            <Pressable
              disabled={disabled}
              onPress={() => onExport('csv', safeRange)}
              className="flex-1 flex-row items-center justify-center rounded-2xl border border-slate-200 py-3"
              style={{ opacity: disabled ? 0.4 : 1 }}
            >
              <FileDown size={16} color="#16A34A" />
              <Text className="ml-2 text-[13px] font-bold text-slate-700">
                CSV
              </Text>
            </Pressable>
            <Pressable
              disabled={disabled}
              onPress={() => onExport('pdf', safeRange)}
              className="flex-1 flex-row items-center justify-center rounded-2xl py-3"
              style={{
                backgroundColor: themeColor,
                opacity: disabled ? 0.4 : 1,
              }}
            >
              {isExporting ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Download size={16} color="#fff" />
                  <Text className="ml-2 text-[13px] font-bold text-white">
                    PDF
                  </Text>
                </>
              )}
            </Pressable>
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}
