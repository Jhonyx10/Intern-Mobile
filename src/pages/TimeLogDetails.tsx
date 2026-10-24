import React, { useState } from 'react';
import {
  Text,
  View,
  ScrollView,
  ActivityIndicator,
  Pressable,
  Image,
  Modal,
  Dimensions,
} from 'react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import LinearGradient from 'react-native-linear-gradient';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  Clock,
  Sun,
  Sunset,
  AlertCircle,
  FileText,
  ChevronLeft,
  ChevronRight,
  X,
  ImageOff,
} from 'lucide-react-native';

import { RootStackParamList } from '../components/Navigation';
import { useTimeLogDetail } from '../util/queries/timelog';
import { useUser } from '../util/queries/auth';
import { withAlpha, formatLogTime } from '../util/timeLogHelpers';
import {
  parseTaskNote,
  photoSession,
  minutesBetween,
  formatMinutes,
} from '../util/taskNote';

const SCREEN_WIDTH = Dimensions.get('window').width;

const CARD_STYLE = {
  shadowColor: '#0F172A',
  shadowOpacity: 0.06,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 5 },
  elevation: 2,
  borderWidth: 1,
  borderColor: '#F1F5F9',
} as const;

function formatLogDate(iso: string | null) {
  if (!iso) return 'Unknown date';
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

type IndexedPhoto = { photo: any; index: number };

function PhotoGrid({
  items,
  onPress,
}: {
  items: IndexedPhoto[];
  onPress: (index: number) => void;
}) {
  return (
    <View className="flex-row flex-wrap" style={{ marginHorizontal: -4 }}>
      {items.map(({ photo, index }) => (
        <Pressable
          key={photo.id}
          onPress={() => onPress(index)}
          style={{ width: '33.333%', padding: 4 }}
        >
          {photo.url ? (
            <Image
              source={{ uri: photo.url }}
              style={{
                width: '100%',
                aspectRatio: 1,
                borderRadius: 12,
                backgroundColor: '#F1F5F9',
              }}
              resizeMode="cover"
            />
          ) : (
            <View
              style={{
                width: '100%',
                aspectRatio: 1,
                borderRadius: 12,
                backgroundColor: '#F1F5F9',
              }}
              className="items-center justify-center"
            >
              <ImageOff color="#CBD5E1" size={20} />
            </View>
          )}
        </Pressable>
      ))}
    </View>
  );
}

function SessionCard({
  title,
  icon: Icon,
  accent,
  timeIn,
  timeOut,
  minutes,
  note,
  photos,
  onPhotoPress,
  delay,
}: {
  title: string;
  icon: any;
  accent: string;
  timeIn: string;
  timeOut: string;
  minutes: number | null;
  note: string;
  /** null = photos are shown in their own card instead */
  photos: IndexedPhoto[] | null;
  onPhotoPress: (index: number) => void;
  delay: number;
}) {
  return (
    <Animated.View
      entering={FadeInUp.duration(400).delay(delay)}
      className="rounded-3xl bg-white mb-4"
      style={CARD_STYLE}
    >
      {/* Session header */}
      <View className="px-5 pt-5 pb-3 flex-row items-center justify-between">
        <View className="flex-row items-center">
          <View
            className="items-center justify-center rounded-full mr-2.5"
            style={{
              width: 32,
              height: 32,
              backgroundColor: withAlpha(accent, '1F'),
            }}
          >
            <Icon color={accent} size={16} strokeWidth={2.25} />
          </View>
          <Text className="text-[15px] font-bold text-slate-800">{title}</Text>
        </View>
        {minutes !== null && (
          <View className="rounded-full px-3 py-1 bg-slate-50">
            <Text className="text-[11px] font-bold text-slate-500">
              {formatMinutes(minutes)}
            </Text>
          </View>
        )}
      </View>

      {/* Times */}
      <View className="mx-5 flex-row rounded-2xl bg-slate-50 py-2.5">
        <View className="flex-1 items-center">
          <Text className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
            Time In
          </Text>
          <Text className="text-[13px] font-semibold text-slate-800 mt-0.5">
            {timeIn}
          </Text>
        </View>
        <View style={{ width: 1, backgroundColor: '#E2E8F0' }} />
        <View className="flex-1 items-center">
          <Text className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
            Time Out
          </Text>
          <Text className="text-[13px] font-semibold text-slate-800 mt-0.5">
            {timeOut}
          </Text>
        </View>
      </View>

      {/* Task note */}
      <View className="px-5 pt-4">
        <View className="flex-row items-center mb-1.5">
          <FileText color="#94A3B8" size={13} />
          <Text className="ml-1.5 text-[11px] font-bold uppercase tracking-[1.5px] text-slate-400">
            Task Note
          </Text>
        </View>
        {note ? (
          <Text className="text-[13px] text-slate-700 leading-5">{note}</Text>
        ) : (
          <Text className="text-[13px] text-slate-400 italic">
            No task note for this session.
          </Text>
        )}
      </View>

      {/* Photos for this session */}
      {photos !== null && (
        <View className="px-5 pt-4">
          <Text className="text-[11px] font-bold uppercase tracking-[1.5px] text-slate-400 mb-2">
            Photos ({photos.length})
          </Text>
          {photos.length === 0 ? (
            <Text className="text-[13px] text-slate-400 italic">
              No photos for this session.
            </Text>
          ) : (
            <PhotoGrid items={photos} onPress={onPhotoPress} />
          )}
        </View>
      )}

      <View style={{ height: 20 }} />
    </Animated.View>
  );
}

export default function TimeLogDetails() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'TimeLogDetails'>>();
  const { timeLogId } = route.params;

  const { data: userData } = useUser();
  const themeColor = userData?.settings?.theme_color || '#1D4ED8';

  const {
    data: log,
    isLoading,
    isError,
    refetch,
  } = useTimeLogDetail(timeLogId);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  const photos: any[] = log?.task_photos ?? [];
  const isAutoClosed =
    log?.verification_method === 'auto_closed_missed_punch_out';

  const notes = parseTaskNote(log?.task_note);
  const indexed: IndexedPhoto[] = photos.map((photo, index) => ({
    photo,
    index,
  }));
  // Only split photos per session if every photo says which session it's from
  const canGroupPhotos =
    photos.length > 0 && photos.every(p => photoSession(p) !== null);
  const morningPhotos = indexed.filter(
    i => photoSession(i.photo) === 'morning',
  );
  const afternoonPhotos = indexed.filter(
    i => photoSession(i.photo) === 'afternoon',
  );

  // Morning: time in → break out (or time out when there was no break).
  const morningEnd = log?.break_out ?? log?.time_out ?? null;
  const morningOut = log?.break_out
    ? formatLogTime(log.break_out)
    : log?.is_open
    ? '—'
    : formatLogTime(log?.time_out ?? null);
  // Afternoon: break in → time out.
  const showAfternoon = Boolean(
    log?.break_in || notes.afternoon || afternoonPhotos.length > 0,
  );
  const afternoonOut = log?.is_open
    ? '—'
    : formatLogTime(log?.time_out ?? null);

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
              style={{
                width: 34,
                height: 34,
                backgroundColor: 'rgba(255,255,255,0.15)',
              }}
              hitSlop={8}
            >
              <ChevronLeft color="#fff" size={20} />
            </Pressable>
            <View className="flex-1">
              <Text className="text-white text-[18px] font-bold">
                Shift Details
              </Text>
              <Text
                className="text-white/60 text-[12px] mt-0.5"
                numberOfLines={1}
              >
                {log ? formatLogDate(log.time_in) : '—'}
              </Text>
            </View>
          </View>
        </LinearGradient>
      </Animated.View>

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={themeColor} />
        </View>
      ) : isError || !log ? (
        <View className="flex-1 items-center justify-center px-8">
          <AlertCircle color="#94A3B8" size={48} />
          <Text className="text-slate-500 text-center text-base mt-4">
            Unable to load this time log.
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
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60 }}>
          {/* Summary */}
          <Animated.View
            entering={FadeInUp.duration(400)}
            className="rounded-3xl bg-white mb-4"
            style={CARD_STYLE}
          >
            <View className="px-5 py-4 flex-row items-center justify-between">
              <View className="flex-row items-center">
                <Clock color="#94A3B8" size={15} />
                <Text className="ml-2 text-[14px] font-bold text-slate-700">
                  {log.duration_hours != null
                    ? `${log.duration_hours} hrs total`
                    : 'Still running'}
                </Text>
              </View>
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

            {isAutoClosed && (
              <View className="mx-5 mb-4 flex-row items-start rounded-2xl bg-amber-50 px-3 py-2.5">
                <AlertCircle
                  color="#D97706"
                  size={14}
                  style={{ marginTop: 1 }}
                />
                <Text className="ml-2 text-[11px] text-amber-700 flex-1 leading-4">
                  This shift was automatically timed out because a punch-out was
                  missed.
                </Text>
              </View>
            )}
          </Animated.View>

          {/* A note that isn't tagged to a session */}
          {notes.general ? (
            <Animated.View
              entering={FadeInUp.duration(400).delay(40)}
              className="rounded-3xl bg-white mb-4 px-5 py-4"
              style={CARD_STYLE}
            >
              <View className="flex-row items-center mb-1.5">
                <FileText color="#94A3B8" size={13} />
                <Text className="ml-1.5 text-[11px] font-bold uppercase tracking-[1.5px] text-slate-400">
                  Task Note
                </Text>
              </View>
              <Text className="text-[13px] text-slate-700 leading-5">
                {notes.general}
              </Text>
            </Animated.View>
          ) : null}

          {/* Morning */}
          <SessionCard
            title="Morning"
            icon={Sun}
            accent="#F59E0B"
            timeIn={formatLogTime(log.time_in)}
            timeOut={morningOut}
            minutes={minutesBetween(log.time_in, morningEnd)}
            note={notes.morning}
            photos={canGroupPhotos ? morningPhotos : null}
            onPhotoPress={setViewerIndex}
            delay={80}
          />

          {/* Afternoon */}
          {showAfternoon && (
            <SessionCard
              title="Afternoon"
              icon={Sunset}
              accent="#EA580C"
              timeIn={formatLogTime(log.break_in ?? null)}
              timeOut={afternoonOut}
              minutes={minutesBetween(log.break_in, log.time_out)}
              note={notes.afternoon}
              photos={canGroupPhotos ? afternoonPhotos : null}
              onPhotoPress={setViewerIndex}
              delay={140}
            />
          )}

          {/* Photos that aren't tagged to a session */}
          {!canGroupPhotos && (
            <Animated.View
              entering={FadeInUp.duration(400).delay(200)}
              className="rounded-3xl bg-white mb-4"
              style={CARD_STYLE}
            >
              <View className="px-5 pt-5 pb-3 flex-row items-center justify-between">
                <Text className="text-[11px] font-bold uppercase tracking-[1.5px] text-slate-400">
                  Photos
                </Text>
                {photos.length > 0 && (
                  <Text className="text-[11px] font-medium text-slate-400">
                    {log.submitted_task_photos_count}/{log.task_photos_count}{' '}
                    submitted
                  </Text>
                )}
              </View>
              <View className="px-5 pb-5">
                {photos.length === 0 ? (
                  <View className="items-center py-8">
                    <ImageOff color="#CBD5E1" size={36} />
                    <Text className="text-[13px] text-slate-400 mt-3">
                      No photos were attached to this shift.
                    </Text>
                  </View>
                ) : (
                  <PhotoGrid items={indexed} onPress={setViewerIndex} />
                )}
              </View>
            </Animated.View>
          )}
        </ScrollView>
      )}

      {/* Full-screen photo viewer */}
      <Modal
        visible={viewerIndex !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setViewerIndex(null)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.92)' }}>
          <Pressable
            onPress={() => setViewerIndex(null)}
            style={{
              position: 'absolute',
              top: 52,
              right: 20,
              zIndex: 10,
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: 'rgba(255,255,255,0.15)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X color="#fff" size={20} />
          </Pressable>

          <View
            style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
          >
            {viewerIndex !== null && photos[viewerIndex]?.url && (
              <Image
                source={{ uri: photos[viewerIndex].url as string }}
                style={{ width: SCREEN_WIDTH, height: '80%' }}
                resizeMode="contain"
              />
            )}
          </View>

          {photos.length > 1 && viewerIndex !== null && (
            <>
              {viewerIndex > 0 && (
                <Pressable
                  onPress={() => setViewerIndex(i => (i !== null ? i - 1 : i))}
                  style={{
                    position: 'absolute',
                    left: 12,
                    top: '50%',
                    marginTop: -20,
                    width: 40,
                    height: 40,
                    borderRadius: 20,
                    backgroundColor: 'rgba(255,255,255,0.12)',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <ChevronLeft color="#fff" size={22} />
                </Pressable>
              )}
              {viewerIndex < photos.length - 1 && (
                <Pressable
                  onPress={() => setViewerIndex(i => (i !== null ? i + 1 : i))}
                  style={{
                    position: 'absolute',
                    right: 12,
                    top: '50%',
                    marginTop: -20,
                    width: 40,
                    height: 40,
                    borderRadius: 20,
                    backgroundColor: 'rgba(255,255,255,0.12)',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <ChevronRight color="#fff" size={22} />
                </Pressable>
              )}
              <View
                style={{
                  position: 'absolute',
                  bottom: 40,
                  alignSelf: 'center',
                }}
              >
                <Text
                  style={{
                    color: 'rgba(255,255,255,0.7)',
                    fontSize: 12,
                    fontWeight: '600',
                  }}
                >
                  {viewerIndex + 1} / {photos.length}
                </Text>
              </View>
            </>
          )}
        </View>
      </Modal>
    </View>
  );
}
