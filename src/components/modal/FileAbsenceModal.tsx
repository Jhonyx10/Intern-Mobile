import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  pick,
  types,
  isErrorWithCode,
  errorCodes,
} from '@react-native-documents/picker';
import {
  CalendarX,
  ChevronLeft,
  ChevronRight,
  FileText,
  Paperclip,
  X,
} from 'lucide-react-native';
import { useFileAbsence } from '../../util/queries/timelog';
import { useToast } from '../ToastProvider';
import { INK, LINE, MUTED } from '../ScreenKit';

type Props = {
  visible: boolean;
  onClose: () => void;
  themeColor: string;
};

type Proof = { uri: string; name: string; type: string };

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];
const MAX_PROOF_BYTES = 10 * 1024 * 1024; // matches the API's max:10240 (KB)

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

const addDays = (d: Date, n: number) => {
  const c = new Date(d);
  c.setDate(c.getDate() + n);
  return c;
};

// Local calendar date as YYYY-MM-DD (toISOString would shift it by timezone)
const toYMD = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;

const formatDate = (d: Date) =>
  `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;

export default function FileAbsenceModal({
  visible,
  onClose,
  themeColor,
}: Props) {
  const { showToast } = useToast();
  const { mutateAsync: fileAbsence, isPending } = useFileAbsence();

  const [date, setDate] = useState<Date>(startOfToday());
  const [reason, setReason] = useState('');
  const [proof, setProof] = useState<Proof | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Start fresh every time the modal opens
  useEffect(() => {
    if (visible) {
      setDate(startOfToday());
      setReason('');
      setProof(null);
      setError(null);
    }
  }, [visible]);

  const today = startOfToday();
  const isToday = toYMD(date) === toYMD(today);
  const isYesterday = toYMD(date) === toYMD(addDays(today, -1));
  const dateTag = isToday ? 'Today' : isYesterday ? 'Yesterday' : null;

  const reasonLength = reason.trim().length;
  const canSubmit = reasonLength >= 5 && !isPending;

const pickProof = async () => {
  setError(null);
  try {
    const [file] = await pick({
      type: [types.images, types.pdf],
      allowMultiSelection: false,
    });
    if (!file) return;
    if (file.size && file.size > MAX_PROOF_BYTES) {
      setError('Proof must be 10 MB or smaller.');
      return;
    }
    setProof({
      uri: file.uri,
      name: file.name ?? `proof_${Date.now()}`,
      type: file.type ?? 'image/jpeg',
    });
  } catch (e) {
    // Closing the picker without choosing anything isn't an error
    if (isErrorWithCode(e) && e.code === errorCodes.OPERATION_CANCELED) return;
    setError('Could not open the file picker.');
  }
};

  const submit = async () => {
    if (!canSubmit) return;
    setError(null);
    try {
      const res = await fileAbsence({
        absence_date: toYMD(date),
        reason,
        proof,
      });
      showToast(res?.message ?? 'Absence filed successfully.', 'success');
      onClose();
    } catch (e: any) {
      if (!e?.response) {
        setError('No connection. Please check your internet and try again.');
        return;
      }
      // Laravel validation errors come back as { errors: { field: [msg] } }
      const errors = e.response?.data?.errors;
      const firstValidation = errors
        ? (Object.values(errors)[0] as string[] | undefined)?.[0]
        : undefined;
      setError(
        firstValidation ??
          e.response?.data?.message ??
          'Could not file your absence. Please try again.',
      );
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <Pressable
          onPress={onClose}
          style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.45)' }}
        />

        <View
          style={{
            backgroundColor: '#FFFFFF',
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            maxHeight: '88%',
          }}
        >
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ padding: 20, paddingBottom: 32 }}
            showsVerticalScrollIndicator={false}
          >
            {/* Header */}
            <View className="flex-row items-center">
              <View
                className="items-center justify-center rounded-full"
                style={{
                  width: 40,
                  height: 40,
                  backgroundColor: themeColor + '1A',
                }}
              >
                <CalendarX color={themeColor} size={20} />
              </View>
              <View className="flex-1 ml-3">
                <Text className="text-[17px] font-bold" style={{ color: INK }}>
                  File an absence
                </Text>
                <Text className="text-[12px] mt-0.5" style={{ color: MUTED }}>
                  Tell your coordinator why you were absent.
                </Text>
              </View>
              <Pressable onPress={onClose} hitSlop={10}>
                <X color={MUTED} size={20} />
              </Pressable>
            </View>

            {/* Date */}
            <Text
              className="text-[12px] font-semibold mt-5 mb-2"
              style={{ color: MUTED }}
            >
              DATE OF ABSENCE
            </Text>
            <View
              className="flex-row items-center justify-between rounded-2xl px-2 py-2"
              style={{ borderWidth: 1, borderColor: LINE }}
            >
              <Pressable
                onPress={() => setDate(d => addDays(d, -1))}
                hitSlop={8}
                className="p-2"
              >
                <ChevronLeft color={INK} size={20} />
              </Pressable>
              <View className="items-center">
                <Text
                  className="text-[15px] font-semibold"
                  style={{ color: INK }}
                >
                  {formatDate(date)}
                </Text>
                {dateTag && (
                  <Text
                    className="text-[11px] mt-0.5"
                    style={{ color: themeColor }}
                  >
                    {dateTag}
                  </Text>
                )}
              </View>
              {/* Can't file an absence for a future date */}
              <Pressable
                onPress={() => !isToday && setDate(d => addDays(d, 1))}
                disabled={isToday}
                hitSlop={8}
                className="p-2"
                style={{ opacity: isToday ? 0.25 : 1 }}
              >
                <ChevronRight color={INK} size={20} />
              </Pressable>
            </View>

            {/* Reason */}
            <View className="flex-row items-center justify-between mt-5 mb-2">
              <Text
                className="text-[12px] font-semibold"
                style={{ color: MUTED }}
              >
                REASON
              </Text>
              <Text className="text-[11px]" style={{ color: MUTED }}>
                {reason.length}/1000
              </Text>
            </View>
            <TextInput
              value={reason}
              onChangeText={setReason}
              placeholder="e.g. I was sick and could not report to work."
              placeholderTextColor="#94A3B8"
              multiline
              maxLength={1000}
              textAlignVertical="top"
              className="rounded-2xl px-4 py-3 text-[14px]"
              style={{
                borderWidth: 1,
                borderColor: LINE,
                minHeight: 110,
                color: INK,
              }}
            />
            {reason.length > 0 && reasonLength < 5 && (
              <Text className="text-[12px] mt-1.5" style={{ color: '#B45309' }}>
                Please write at least 5 characters.
              </Text>
            )}

            {/* Proof */}
            <Text
              className="text-[12px] font-semibold mt-5 mb-2"
              style={{ color: MUTED }}
            >
              PROOF (OPTIONAL)
            </Text>
            {proof ? (
              <View
                className="flex-row items-center rounded-2xl p-3"
                style={{ borderWidth: 1, borderColor: LINE }}
              >
                {proof.type.startsWith('image/') ? (
                  <Image
                    source={{ uri: proof.uri }}
                    style={{ width: 48, height: 48, borderRadius: 10 }}
                  />
                ) : (
                  <View
                    className="items-center justify-center"
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: 10,
                      backgroundColor: '#F1F5F9',
                    }}
                  >
                    <FileText color={MUTED} size={22} />
                  </View>
                )}
                <Text
                  className="flex-1 mx-3 text-[13px]"
                  style={{ color: INK }}
                  numberOfLines={1}
                >
                  {proof.name}
                </Text>
                <Pressable onPress={() => setProof(null)} hitSlop={10}>
                  <X color={MUTED} size={18} />
                </Pressable>
              </View>
            ) : (
              <Pressable
                onPress={pickProof}
                className="flex-row items-center justify-center rounded-2xl py-4"
                style={{
                  borderWidth: 1,
                  borderColor: LINE,
                  borderStyle: 'dashed',
                }}
              >
                <Paperclip color={themeColor} size={18} />
                <Text
                  className="ml-2 text-[14px] font-semibold"
                  style={{ color: themeColor }}
                >
                  Attach a photo or PDF
                </Text>
              </Pressable>
            )}

            {error && (
              <Text
                className="text-[13px] mt-4 leading-5"
                style={{ color: '#B91C1C' }}
              >
                {error}
              </Text>
            )}

            {/* Actions */}
            <View className="flex-row mt-6">
              <Pressable
                onPress={onClose}
                disabled={isPending}
                className="flex-1 items-center justify-center rounded-full py-3.5 mr-3"
                style={{ borderWidth: 1, borderColor: LINE }}
              >
                <Text
                  className="text-[15px] font-semibold"
                  style={{ color: INK }}
                >
                  Cancel
                </Text>
              </Pressable>
              <Pressable
                onPress={submit}
                disabled={!canSubmit}
                className="flex-1 items-center justify-center rounded-full py-3.5"
                style={{
                  backgroundColor: themeColor,
                  opacity: canSubmit ? 1 : 0.5,
                }}
              >
                {isPending ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text className="text-[15px] font-semibold text-white">
                    Submit
                  </Text>
                )}
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
