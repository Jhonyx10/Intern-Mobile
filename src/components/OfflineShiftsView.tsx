import React, { useState } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQueryClient } from '@tanstack/react-query';
import NetInfo from '@react-native-community/netinfo';
import { CloudOff, UploadCloud } from 'lucide-react-native';
import { RootStackParamList } from './Navigation';
import { useToast } from './ToastProvider';
import { Panel, INK, MUTED } from './ScreenKit';
import { formatLogTime } from '../util/timeLogHelpers';
import { useOfflineShifts, uploadAllOfflineShifts } from '../util/offlineShift';

export default function OfflineShiftsView({
  themeColor,
}: {
  themeColor: string;
}) {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const qc = useQueryClient();
  const { showToast } = useToast();
  const { done: shifts } = useOfflineShifts();
  const [uploading, setUploading] = useState(false);

  const saveAll = async () => {
    const net = await NetInfo.fetch();
    if (!net.isConnected) {
      showToast('You need an internet connection to save online.', 'info');
      return;
    }
    setUploading(true);
    try {
      const { uploaded, failed } = await uploadAllOfflineShifts();
      qc.invalidateQueries();
      if (failed.length === 0) {
        showToast(`${uploaded} shift(s) saved online.`, 'success');
      } else {
        showToast(
          `${uploaded} saved, ${failed.length} failed: ${failed[0].message}`,
          'error',
        );
      }
    } finally {
      setUploading(false);
    }
  };

  return (
    <FlatList
      data={shifts}
      keyExtractor={s => s.id}
      contentContainerStyle={{
        paddingHorizontal: 20,
        paddingTop: 16,
        paddingBottom: 106,
      }}
      ListHeaderComponent={
        shifts.length > 0 ? (
          <Pressable
            onPress={saveAll}
            disabled={uploading}
            className="flex-row items-center justify-center rounded-2xl py-3.5 mb-4"
            style={{
              backgroundColor: themeColor,
              opacity: uploading ? 0.7 : 1,
            }}
          >
            {uploading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <UploadCloud color="#fff" size={18} />
            )}
            <Text className="text-white font-bold ml-2">
              {uploading
                ? 'Saving online...'
                : `Save all online (${shifts.length})`}
            </Text>
          </Pressable>
        ) : undefined
      }
      ListEmptyComponent={
        <View className="items-center py-20">
          <CloudOff color="#CBD5E1" size={48} />
          <Text className="text-slate-400 text-sm mt-4">
            No offline shifts waiting to upload.
          </Text>
        </View>
      }
      renderItem={({ item }) => (
        <Pressable
          onPress={() =>
            navigation.navigate('OfflineShiftDetails', { shiftId: item.id })
          }
        >
          <View className="mb-3">
            <Panel>
              <View className="p-4">
                <Text
                  className="text-[14px] font-semibold"
                  style={{ color: INK }}
                >
                  {new Date(item.time_in).toLocaleDateString(undefined, {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </Text>
                <Text className="text-[13px] mt-1" style={{ color: MUTED }}>
                  {formatLogTime(item.time_in)} – {formatLogTime(item.time_out)}
                  {item.break_out
                    ? `  ·  break ${formatLogTime(
                        item.break_out,
                      )}–${formatLogTime(item.break_in)}`
                    : ''}
                </Text>
                <Text className="text-[12px] mt-2" style={{ color: '#D97706' }}>
                  Not saved online yet
                  {item.morning ? ' · morning note' : ''}
                  {item.afternoon ? ' · afternoon note' : ''}
                </Text>
              </View>
            </Panel>
          </View>
        </Pressable>
      )}
    />
  );
}
