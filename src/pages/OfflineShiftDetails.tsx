import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Image,
  ActivityIndicator,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import NetInfo from '@react-native-community/netinfo';
import { ChevronLeft, UploadCloud, Trash2 } from 'lucide-react-native';
import { RootStackParamList } from '../components/Navigation';
import { useUser } from '../util/queries/auth';
import { useToast } from '../components/ToastProvider';
import { formatLogTime } from '../util/timeLogHelpers';
import {
  useOfflineShifts,
  uploadOfflineShift,
  deleteOfflineShift,
  OfflineTask,
} from '../util/offlineShift';

function Session({
  title,
  from,
  to,
  task,
}: {
  title: string;
  from: string;
  to: string;
  task: OfflineTask | null;
}) {
  return (
    <View
      className="rounded-3xl bg-white mb-4 p-5"
      style={{ borderWidth: 1, borderColor: '#F1F5F9' }}
    >
      <Text className="text-[15px] font-bold text-slate-800">{title}</Text>
      <Text className="text-[13px] text-slate-500 mt-1">
        {from} – {to}
      </Text>
      <Text className="text-[11px] font-bold uppercase text-slate-400 mt-4 mb-1">
        Task note
      </Text>
      {task?.note ? (
        <Text className="text-[13px] text-slate-700">{task.note}</Text>
      ) : (
        <Text className="text-[13px] italic text-slate-400">No task note.</Text>
      )}
      {task && task.photos.length > 0 && (
        <View className="flex-row flex-wrap mt-3" style={{ gap: 8 }}>
          {task.photos.map((p, i) => (
            <Image
              key={i}
              source={{ uri: p.uri }}
              style={{ width: 80, height: 80, borderRadius: 10 }}
            />
          ))}
        </View>
      )}
    </View>
  );
}

export default function OfflineShiftDetails() {
  const navigation = useNavigation();
  const { shiftId } =
    useRoute<RouteProp<RootStackParamList, 'OfflineShiftDetails'>>().params;
  const { data: userData } = useUser();
  const themeColor = userData?.settings?.theme_color || '#1D4ED8';
  const { showToast } = useToast();
  const qc = useQueryClient();
  const { done } = useOfflineShifts();
  const shift = done.find(s => s.id === shiftId);
  const [saving, setSaving] = useState(false);

  const saveOnline = async () => {
    if (!shift) return;
    const net = await NetInfo.fetch();
    if (!net.isConnected) {
      showToast('You need an internet connection to save online.', 'info');
      return;
    }
    setSaving(true);
    try {
      const res = await uploadOfflineShift(shift);
      qc.invalidateQueries();
      showToast(res?.message ?? 'Saved online.', 'success');
      navigation.goBack();
    } catch (e: any) {
      showToast(
        e?.response?.data?.message ??
          'Could not save online. Check your connection.',
        'error',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#F8FAFC' }}>
      <View
        style={{
          paddingTop: 52,
          paddingBottom: 20,
          paddingHorizontal: 20,
          backgroundColor: themeColor,
        }}
      >
        <View className="flex-row items-center">
          <Pressable
            onPress={() => navigation.goBack()}
            className="mr-3"
            hitSlop={8}
          >
            <ChevronLeft color="#fff" size={22} />
          </Pressable>
          <View>
            <Text className="text-white text-[18px] font-bold">
              Offline Shift
            </Text>
            <Text className="text-white/70 text-[12px]">
              {shift
                ? new Date(shift.time_in).toLocaleDateString(undefined, {
                    weekday: 'long',
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric',
                  })
                : '—'}
            </Text>
          </View>
        </View>
      </View>

      {!shift ? (
        <View className="flex-1 items-center justify-center">
          <Text className="text-slate-400">
            This shift is no longer on the device.
          </Text>
        </View>
      ) : (
        <>
          <ScrollView contentContainerStyle={{ padding: 20 }}>
            <Session
              title="Morning"
              from={formatLogTime(shift.time_in)}
              to={formatLogTime(shift.break_out ?? shift.time_out)}
              task={shift.morning}
            />
            {shift.break_in && (
              <Session
                title="Afternoon"
                from={formatLogTime(shift.break_in)}
                to={formatLogTime(shift.time_out)}
                task={shift.afternoon}
              />
            )}
          </ScrollView>

          <View
            className="p-5 bg-white"
            style={{ borderTopWidth: 1, borderTopColor: '#F1F5F9' }}
          >
            <Pressable
              onPress={saveOnline}
              disabled={saving}
              className="flex-row items-center justify-center rounded-2xl py-4"
              style={{ backgroundColor: themeColor, opacity: saving ? 0.7 : 1 }}
            >
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <UploadCloud color="#fff" size={20} />
              )}
              <Text className="text-white font-bold text-[16px] ml-2">
                {saving ? 'Saving online...' : 'Save online'}
              </Text>
            </Pressable>
            <Pressable
              onPress={async () => {
                await deleteOfflineShift(shift.id);
                navigation.goBack();
              }}
              disabled={saving}
              className="flex-row items-center justify-center mt-3 py-2"
            >
              <Trash2 color="#DC2626" size={16} />
              <Text className="ml-2 font-semibold" style={{ color: '#DC2626' }}>
                Discard this offline shift
              </Text>
            </Pressable>
          </View>
        </>
      )}
    </View>
  );
}
