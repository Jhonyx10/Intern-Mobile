import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  Modal,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import Animated, {
  FadeInDown,
  FadeInUp,
  LinearTransition,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import LinearGradient from 'react-native-linear-gradient';
import {
  CheckCircle2,
  FileText,
  UploadCloud,
  X,
  File,
  AlertCircle,
  Clock,
} from 'lucide-react-native';
import { pick, types } from '@react-native-documents/picker';
import Pdf from 'react-native-pdf';
import { useUser } from '../util/queries/auth';
import {
  useUploadDocument,
  useDocuments,
  downloadDocumentFile,
} from '../util/queries/documents';
import { useToast } from '../components/ToastProvider';
import { PAGE_BG, LINE, INK, MUTED, Panel } from '../components/ScreenKit';

function withAlpha(hex: string, alpha: string) {
  return `${hex}${alpha}`;
}

export type DocStatus = 'pending' | 'uploaded' | 'approved' | 'rejected';
export type Recurrence = 'none' | 'daily' | 'weekly';
export type DueState = 'rejected' | 'due_today' | 'upcoming' | 'required';

export type DocumentHistoryEntry = {
  period_start: string;
  status: DocStatus;
  uri: string;
  rejection_reason?: string | null;
};

export type DocumentItem = {
  id: string;
  title: string;
  status: DocStatus;
  uri?: string;
  recurrence?: Recurrence;
  period_start?: string | null;
  history?: DocumentHistoryEntry[];
  rejection_reason?: string | null;
  can_upload?: boolean;
  needs_action?: boolean;
  due_state?: DueState | null;
  due_date?: string | null;
};

type SelectedDoc = {
  title: string;
  id: string;
  rejected?: boolean;
  reason?: string | null;
};

type ViewOptions = {
  period?: string;
  title?: string;
  rejected?: boolean;
  reason?: string | null;
};

// One row in the "Submitted files" list of a recurring requirement
type Submission = {
  key: string;
  periodStart?: string | null;
  status: DocStatus;
  reason?: string | null;
  // true = the current period's file (fetched without a period param)
  isCurrent: boolean;
};

const STATUS_META: Record<DocStatus, { color: string; label: string }> = {
  pending: { color: MUTED, label: 'Required' },
  uploaded: { color: '#D97706', label: 'Under review' },
  approved: { color: '#059669', label: 'Approved' },
  rejected: { color: '#DC2626', label: 'Rejected' },
};

const ACTION_META: Record<
  DueState,
  { color: string; bg: string; border: string; label: string }
> = {
  rejected: {
    color: '#DC2626',
    bg: '#FEF2F2',
    border: '#FECACA',
    label: 'Rejected · Re-upload',
  },
  due_today: {
    color: '#EA580C',
    bg: '#FFF7ED',
    border: '#FED7AA',
    label: 'Due today',
  },
  upcoming: {
    color: '#D97706',
    bg: '#FFFBEB',
    border: '#FDE68A',
    label: 'Due Friday',
  },
  required: {
    color: '#D97706',
    bg: '#FFFBEB',
    border: '#FDE68A',
    label: 'Required',
  },
};

// Returns null when nothing is needed from the intern.
// Uses the server's due_state, with a local fallback for older API responses.
export function getActionMeta(doc: DocumentItem) {
  const needs =
    doc.needs_action ?? (doc.status === 'pending' || doc.status === 'rejected');
  if (!needs) return null;

  let state: DueState | null | undefined = doc.due_state;
  if (!state) {
    if (doc.status === 'rejected') state = 'rejected';
    else if (doc.recurrence === 'daily') state = 'due_today';
    else if (doc.recurrence === 'weekly')
      state = new Date().getDay() === 5 ? 'due_today' : 'upcoming';
    else state = 'required';
  }
  return { state, ...ACTION_META[state] };
}

// Shared by the tab bar / Home so the count is always consistent
export const usePendingDocsCount = () => {
  const { data } = useDocuments();
  return ((data as DocumentItem[]) ?? []).filter(d => getActionMeta(d)).length;
};

// Coloured dot + text, same pattern as the status on Home and Reports
function StatusBadge({ status }: { status: DocStatus }) {
  const { color, label } = STATUS_META[status];

  return (
    <View className="flex-row items-center">
      <View
        className="rounded-full mr-1.5"
        style={{ width: 7, height: 7, backgroundColor: color }}
      />
      <Text className="text-[12px] font-medium" style={{ color }}>
        {label}
      </Text>
    </View>
  );
}

function PulseDot({ color }: { color: string }) {
  const opacity = useSharedValue(1);

  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.25, { duration: 700 }),
        withTiming(1, { duration: 700 }),
      ),
      -1,
      false,
    );
  }, [opacity]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      style={[
        { width: 8, height: 8, borderRadius: 4, backgroundColor: color },
        style,
      ]}
    />
  );
}

function ActionPill({ doc }: { doc: DocumentItem }) {
  const meta = getActionMeta(doc);
  if (!meta) return null;

  return (
    <View
      className="flex-row items-center self-start px-2.5 py-1 rounded-full mt-2"
      style={{
        backgroundColor: meta.bg,
        borderWidth: 1,
        borderColor: meta.border,
      }}
    >
      {meta.state === 'due_today' || meta.state === 'rejected' ? (
        <PulseDot color={meta.color} />
      ) : (
        <Clock color={meta.color} size={11} strokeWidth={2.5} />
      )}
      <Text
        className="ml-1.5 text-[11px] font-semibold"
        style={{ color: meta.color }}
      >
        {meta.label}
      </Text>
    </View>
  );
}

function ActionBanner({ docs }: { docs: DocumentItem[] }) {
  const todo = docs.filter(d => getActionMeta(d));
  if (todo.length === 0) return null;

  const rejected = todo.filter(d => d.status === 'rejected').length;
  const dueToday = todo.filter(
    d => getActionMeta(d)?.state === 'due_today',
  ).length;
  const urgent = rejected > 0 || dueToday > 0;
  const color = urgent ? '#DC2626' : '#D97706';

  const parts: string[] = [];
  if (dueToday) parts.push(`${dueToday} due today`);
  if (rejected) parts.push(`${rejected} rejected`);

  return (
    <Animated.View
      entering={FadeInUp.duration(400).springify()}
      className="mb-3"
    >
      <View
        className="flex-row items-center rounded-2xl px-4 py-3.5"
        style={{
          backgroundColor: urgent ? '#FEF2F2' : '#FFFBEB',
          borderWidth: 1,
          borderColor: urgent ? '#FECACA' : '#FDE68A',
        }}
      >
        <View
          className="h-9 w-9 rounded-full items-center justify-center mr-3"
          style={{ backgroundColor: color + '20' }}
        >
          <AlertCircle color={color} size={20} />
        </View>
        <View className="flex-1">
          <Text className="text-[14px] font-bold" style={{ color }}>
            {todo.length}{' '}
            {todo.length === 1 ? 'document needs' : 'documents need'} your
            attention
          </Text>
          <Text className="text-[12px] mt-0.5" style={{ color }}>
            {parts.length
              ? parts.join(' · ')
              : 'Submit them before the deadline'}
          </Text>
        </View>
      </View>
    </Animated.View>
  );
}

function RejectionNote({ reason }: { reason?: string | null }) {
  return (
    <View
      className="mt-3 rounded-xl px-3.5 py-3"
      style={{
        backgroundColor: '#FEF2F2',
        borderWidth: 1,
        borderColor: '#FECACA',
      }}
    >
      <View className="flex-row items-center mb-1">
        <AlertCircle color="#DC2626" size={14} />
        <Text
          className="ml-1.5 text-[12px] font-semibold"
          style={{ color: '#B91C1C' }}
        >
          Reason for rejection
        </Text>
      </View>
      <Text className="text-[13px] leading-5" style={{ color: '#B91C1C' }}>
        {reason?.trim() ||
          'No reason was provided. Please contact your coordinator.'}
      </Text>
    </View>
  );
}

function formatPeriodLabel(periodStart: string, recurrence?: Recurrence) {
  try {
    const date = new Date(periodStart + 'T00:00:00');
    const label = date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    return recurrence === 'weekly' ? `Week of ${label}` : label;
  } catch {
    return periodStart;
  }
}

// Builds the full list of submitted files for a recurring requirement:
// the current period's file first (if one was uploaded), then every past
// period, newest first. A past entry for the current period is skipped so
// the same file never shows up twice.
function buildSubmissions(doc: DocumentItem): Submission[] {
  const list: Submission[] = [];

  if (doc.uri) {
    list.push({
      key: `current-${doc.period_start ?? 'now'}`,
      periodStart: doc.period_start,
      status: doc.status,
      reason: doc.rejection_reason,
      isCurrent: true,
    });
  }

  const past = [...(doc.history ?? [])]
    .filter(h => !(doc.uri && h.period_start === doc.period_start))
    .sort((a, b) => b.period_start.localeCompare(a.period_start));

  past.forEach(h =>
    list.push({
      key: `past-${h.period_start}`,
      periodStart: h.period_start,
      status: h.status,
      reason: h.rejection_reason,
      isCurrent: false,
    }),
  );

  return list;
}

// Documents that still need action float to the top
const urgencyFirst = (a: DocumentItem, b: DocumentItem) =>
  Number(!!getActionMeta(b)) - Number(!!getActionMeta(a));

export const Documents = () => {
  const { data: userData } = useUser();
  const themeColor = userData?.settings?.theme_color || '#1D4ED8';
  const { showToast } = useToast();
  const { data: fetchedDocs } = useDocuments();
  const allDocs: DocumentItem[] = fetchedDocs || [];

  // Recurring requirements (weekly/daily reports) get their own featured
  // card with a "current period" upload slot and a Files button that opens
  // every file submitted so far. Everything else is a normal one-shot
  // requirement.
  const recurringDocs = allDocs
    .filter(d => d.recurrence && d.recurrence !== 'none')
    .sort(urgencyFirst);
  const docs = allDocs
    .filter(d => !d.recurrence || d.recurrence === 'none')
    .sort(urgencyFirst);

  const [selectedDoc, setSelectedDoc] = useState<SelectedDoc | null>(null);
  const [localPdfPath, setLocalPdfPath] = useState<string | null>(null);
  const [isLoadingPdf, setIsLoadingPdf] = useState<boolean>(false);
  const [isUploading, setIsUploading] = useState<string | null>(null);
  const uploadDocMutation = useUploadDocument();

  // Submitted-files modal (recurring requirements)
  const [filesDocId, setFilesDocId] = useState<string | null>(null);
  const [reopenFilesId, setReopenFilesId] = useState<string | null>(null);

  // Derived from live data, so the list stays current after an upload
  const filesDoc = recurringDocs.find(d => d.id === filesDocId) ?? null;
  const filesSubmissions = filesDoc ? buildSubmissions(filesDoc) : [];

  // Custom Feedback Modal state
  const [modalConfig, setModalConfig] = useState<{
    visible: boolean;
    type: 'success' | 'error';
    title: string;
    message: string;
  }>({
    visible: false,
    type: 'success',
    title: '',
    message: '',
  });

  const showFeedback = (
    type: 'success' | 'error',
    title: string,
    message: string,
  ) => {
    setModalConfig({
      visible: true,
      type,
      title,
      message,
    });
  };

  // Opens the preview modal for a document's current file, or a specific
  // past period when `period` is supplied (from the submitted list). For
  // rejected files, `rejected` + `reason` show the rejection note above the PDF.
  const handleViewDoc = async (doc: DocumentItem, opts?: ViewOptions) => {
    const title = opts?.title ?? doc.title;
    setSelectedDoc({
      id: doc.id,
      title,
      rejected: opts?.rejected,
      reason: opts?.reason,
    });
    setLocalPdfPath(null);

    if (!doc.uri && !opts?.period) return;

    try {
      setIsLoadingPdf(true);
      const cachedPath = await downloadDocumentFile(doc.id, opts?.period);
      setLocalPdfPath(cachedPath);
    } catch (err: any) {
      console.log('Failed to download PDF:', err);
      showFeedback(
        'error',
        'Download Error',
        'Failed to cache PDF for preview: ' +
          (err?.response?.data?.message || err?.message || err),
      );
    } finally {
      setIsLoadingPdf(false);
    }
  };

  // Generic upload handler — the backend determines the period (current
  // week/day) automatically from the requirement's recurrence, so this is
  // the same call for one-shot requirements and recurring ones alike.
  const handleUpload = async (id: string) => {
    try {
      const [res] = await pick({
        mode: 'import',
        type: [types.pdf],
        allowMultiSelection: false,
      });

      if (res?.uri) {
        try {
          setIsUploading(id);
          await uploadDocMutation.mutateAsync({ documentId: id, file: res });
          setIsUploading(null);
          showFeedback(
            'success',
            'Upload Successful!',
            'Your document has been submitted successfully and is now pending review.',
          );
        } catch (uploadErr: any) {
          setIsUploading(null);
          showFeedback(
            'error',
            'Upload Failed',
            uploadErr?.response?.data?.message ||
              uploadErr?.message ||
              'Failed to upload document to server.',
          );
        }
      }
    } catch (err: any) {
      setIsUploading(null);
      if (
        err?.code !== 'OPERATION_CANCELED' &&
        !err?.message?.includes('cancel')
      ) {
        showFeedback(
          'error',
          'Selection Error',
          err?.message || 'An unknown error occurred while selecting the file.',
        );
      }
    }
  };

  // Closing the PDF preview brings the files list back if it was opened
  // from there.
  const closePreview = () => {
    setSelectedDoc(null);
    if (reopenFilesId) {
      setFilesDocId(reopenFilesId);
      setReopenFilesId(null);
    }
  };

  // View a file from the files list: close the list, open the PDF, and
  // remember to reopen the list when the PDF is closed.
  const viewFromFiles = (
    doc: DocumentItem,
    entry: Submission,
    label: string,
  ) => {
    setReopenFilesId(doc.id);
    setFilesDocId(null);
    handleViewDoc(doc, {
      // current file is fetched without a period
      period: entry.isCurrent ? undefined : entry.periodStart ?? undefined,
      title: `${doc.title} — ${label}`,
      rejected: entry.status === 'rejected',
      reason: entry.reason,
    });
  };

  // ── Shared buttons ──────────────────────────────────────────
  const UploadingIndicator = () => (
    <View
      className="px-5 py-2.5 rounded-xl"
      style={{ backgroundColor: withAlpha(themeColor, '15') }}
    >
      <ActivityIndicator size="small" color={themeColor} />
    </View>
  );

  return (
    <>
      <ScrollView
        style={{ flex: 1, backgroundColor: PAGE_BG }}
        contentContainerStyle={{ paddingBottom: 110 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header: same gradient as the other screens */}
        <Animated.View entering={FadeInDown.duration(400)}>
          <LinearGradient
            colors={[themeColor, withAlpha(themeColor, 'CC')]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{
              paddingTop: 56,
              paddingBottom: 84,
              paddingHorizontal: 20,
              borderBottomLeftRadius: 32,
              borderBottomRightRadius: 32,
            }}
          >
            <Text className="text-[26px] font-bold text-white">Documents</Text>
            <Text
              className="text-[13px] mt-1.5"
              style={{ color: 'rgba(255,255,255,0.8)' }}
            >
              Manage and upload your required files
            </Text>
          </LinearGradient>
        </Animated.View>

        <View className="px-5" style={{ marginTop: -56 }}>
          <ActionBanner docs={allDocs} />

          {allDocs.length === 0 && (
            <Animated.View
              entering={FadeInUp.duration(500).delay(200).springify()}
            >
              <Panel>
                <View className="items-center px-6 py-10">
                  <FileText color="#CBD5E1" size={36} />
                  <Text
                    className="text-[14px] font-semibold mt-3"
                    style={{ color: INK }}
                  >
                    No required documents yet
                  </Text>
                  <Text
                    className="text-[13px] mt-1 text-center"
                    style={{ color: MUTED }}
                  >
                    Documents your coordinator requires will show up here.
                  </Text>
                </View>
              </Panel>
            </Animated.View>
          )}

          {recurringDocs.map((doc, index) => {
            const submissions = buildSubmissions(doc);

            return (
              <Animated.View
                key={doc.id}
                entering={FadeInUp.duration(400)
                  .delay(index * 100 + 100)
                  .springify()}
                layout={LinearTransition.duration(200)}
                className="mb-3"
              >
                <Panel>
                  <View className="p-4 flex-row items-center">
                    <View className="flex-1 pr-3">
                      <Text
                        className="text-[15px] font-semibold"
                        style={{ color: INK }}
                      >
                        {doc.title}
                      </Text>
                      <View className="flex-row items-center flex-wrap mt-1.5">
                        <StatusBadge status={doc.status} />
                        {doc.period_start && (
                          <Text
                            className="ml-3 text-[12px]"
                            style={{ color: MUTED }}
                          >
                            {formatPeriodLabel(
                              doc.period_start,
                              doc.recurrence,
                            )}
                          </Text>
                        )}
                      </View>
                      <ActionPill doc={doc} />
                    </View>

                    {isUploading === doc.id ? (
                      <UploadingIndicator />
                    ) : (
                      <Pressable
                        onPress={() => handleUpload(doc.id)}
                        disabled={doc.can_upload === false}
                        className="flex-row items-center px-4 py-2.5 rounded-xl"
                        style={{
                          backgroundColor:
                            doc.can_upload === false ? '#CBD5E1' : themeColor,
                        }}
                      >
                        <UploadCloud
                          color="#fff"
                          size={16}
                          strokeWidth={2.25}
                        />
                        <Text className="ml-1.5 text-white font-semibold text-[13px]">
                          {doc.can_upload === false
                            ? 'Fridays only'
                            : doc.status === 'rejected'
                            ? 'Re-upload'
                            : 'Upload'}
                        </Text>
                      </Pressable>
                    )}
                  </View>

                  {/* Submitted files summary + button that opens the full list */}
                  <View
                    className="px-4 py-3 flex-row items-center justify-between"
                    style={{ borderTopWidth: 1, borderTopColor: LINE }}
                  >
                    <Text className="text-[13px]" style={{ color: MUTED }}>
                      Submitted files ({submissions.length})
                    </Text>
                    <Pressable
                      onPress={() => setFilesDocId(doc.id)}
                      className="flex-row items-center px-3.5 py-2 rounded-xl"
                      style={{ borderWidth: 1, borderColor: themeColor }}
                    >
                      <FileText color={themeColor} size={14} strokeWidth={2} />
                      <Text
                        className="ml-1.5 font-semibold text-[12px]"
                        style={{ color: themeColor }}
                      >
                        View files
                      </Text>
                    </Pressable>
                  </View>
                </Panel>
              </Animated.View>
            );
          })}

          {docs.map((doc: DocumentItem, index: number) => {
            const isRejected = doc.status === 'rejected';

            return (
              <Animated.View
                key={doc.id}
                entering={FadeInUp.duration(500)
                  .delay((recurringDocs.length + index) * 100 + 200)
                  .springify()}
                className="mb-3"
              >
                <Panel>
                  <View className="p-4">
                    <View className="flex-row items-center">
                      <View className="flex-1 pr-3">
                        <Text
                          className="text-[15px] font-semibold"
                          style={{ color: INK }}
                        >
                          {doc.title}
                        </Text>
                        <View className="flex-row items-center mt-1.5">
                          <StatusBadge status={doc.status} />
                        </View>
                        <ActionPill doc={doc} />
                      </View>

                      {/* Right-side action. Rejected cards use the action row below. */}
                      {!isRejected &&
                        (isUploading === doc.id ? (
                          <UploadingIndicator />
                        ) : doc.status === 'pending' ? (
                          <Pressable
                            onPress={() => handleUpload(doc.id)}
                            className="flex-row items-center px-4 py-2.5 rounded-xl"
                            style={{ backgroundColor: themeColor }}
                          >
                            <UploadCloud
                              color="#fff"
                              size={16}
                              strokeWidth={2.25}
                            />
                            <Text className="ml-1.5 text-white font-semibold text-[13px]">
                              Upload
                            </Text>
                          </Pressable>
                        ) : (
                          <Pressable
                            onPress={() => handleViewDoc(doc)}
                            className="flex-row items-center px-4 py-2.5 rounded-xl"
                            style={{ borderWidth: 1, borderColor: themeColor }}
                          >
                            <File
                              color={themeColor}
                              size={15}
                              strokeWidth={2}
                            />
                            <Text
                              className="ml-1.5 font-semibold text-[13px]"
                              style={{ color: themeColor }}
                            >
                              View
                            </Text>
                          </Pressable>
                        ))}
                    </View>

                    {isRejected && (
                      <>
                        <RejectionNote reason={doc.rejection_reason} />
                        <View className="flex-row mt-3 gap-2">
                          <Pressable
                            onPress={() =>
                              handleViewDoc(doc, {
                                rejected: true,
                                reason: doc.rejection_reason,
                              })
                            }
                            className="flex-1 flex-row items-center justify-center py-2.5 rounded-xl"
                            style={{ borderWidth: 1, borderColor: themeColor }}
                          >
                            <File
                              color={themeColor}
                              size={15}
                              strokeWidth={2}
                            />
                            <Text
                              className="ml-1.5 font-semibold text-[13px]"
                              style={{ color: themeColor }}
                            >
                              View
                            </Text>
                          </Pressable>

                          {isUploading === doc.id ? (
                            <View
                              className="flex-1 items-center justify-center py-2.5 rounded-xl"
                              style={{
                                backgroundColor: withAlpha(themeColor, '15'),
                              }}
                            >
                              <ActivityIndicator
                                size="small"
                                color={themeColor}
                              />
                            </View>
                          ) : (
                            <Pressable
                              onPress={() => handleUpload(doc.id)}
                              className="flex-1 flex-row items-center justify-center py-2.5 rounded-xl"
                              style={{ backgroundColor: themeColor }}
                            >
                              <UploadCloud
                                color="#fff"
                                size={15}
                                strokeWidth={2.25}
                              />
                              <Text className="ml-1.5 text-white font-semibold text-[13px]">
                                Re-upload
                              </Text>
                            </Pressable>
                          )}
                        </View>
                      </>
                    )}
                  </View>
                </Panel>
              </Animated.View>
            );
          })}
        </View>
      </ScrollView>

      {/* PDF preview modal */}
      <Modal
        visible={!!selectedDoc}
        presentationStyle="pageSheet"
        animationType="slide"
        onRequestClose={closePreview}
      >
        <View className="flex-1 bg-white">
          <View
            className="flex-row items-center justify-between px-5 pt-12 pb-4 bg-white"
            style={{ borderBottomWidth: 1, borderBottomColor: LINE }}
          >
            <View className="flex-1 pr-4">
              <Text
                className="text-[17px] font-bold"
                style={{ color: INK }}
                numberOfLines={1}
              >
                {selectedDoc?.title}
              </Text>
              <Text className="text-[12px] mt-0.5" style={{ color: MUTED }}>
                PDF preview
              </Text>
            </View>
            <Pressable
              onPress={closePreview}
              accessibilityLabel="Close preview"
              className="h-10 w-10 items-center justify-center rounded-full"
              style={{ backgroundColor: PAGE_BG }}
            >
              <X color="#475569" size={20} />
            </Pressable>
          </View>

          {selectedDoc?.rejected && (
            <View
              className="px-5 pb-3 bg-white"
              style={{ borderBottomWidth: 1, borderBottomColor: LINE }}
            >
              <RejectionNote reason={selectedDoc.reason} />
            </View>
          )}

          <View className="flex-1" style={{ backgroundColor: PAGE_BG }}>
            {isLoadingPdf ? (
              <View className="flex-1 items-center justify-center">
                <ActivityIndicator size="large" color={themeColor} />
                <Text className="mt-4 font-medium" style={{ color: MUTED }}>
                  Downloading document preview...
                </Text>
              </View>
            ) : localPdfPath ? (
              <Pdf
                source={{ uri: localPdfPath }}
                style={styles.pdf}
                onLoadComplete={numberOfPages => {
                  console.log(`Number of pages: ${numberOfPages}`);
                }}
                onError={(error: any) => {
                  console.log('PDF Error:', error);
                  showToast(
                    `Could not render cached PDF: ${error?.message || error}`,
                    'error',
                  );
                }}
              />
            ) : (
              <View className="flex-1 items-center justify-center">
                <AlertCircle color="#94A3B8" size={40} />
                <Text className="mt-4 font-medium" style={{ color: MUTED }}>
                  No document source found.
                </Text>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* Submitted files modal (recurring requirements) */}
      <Modal
        visible={!!filesDoc}
        animationType="slide"
        transparent
        statusBarTranslucent
        onRequestClose={() => setFilesDocId(null)}
      >
        <View className="flex-1 justify-end">
          <Pressable
            className="absolute inset-0 bg-black/50"
            onPress={() => setFilesDocId(null)}
          />
          <View
            className="bg-white rounded-t-3xl p-6"
            style={{ maxHeight: '85%', minHeight: '40%' }}
          >
            <View className="flex-row justify-between items-center mb-1">
              <View className="flex-1 pr-3">
                <Text
                  className="text-lg font-bold"
                  style={{ color: INK }}
                  numberOfLines={1}
                >
                  {filesDoc?.title}
                </Text>
                <Text className="text-[12px] mt-0.5" style={{ color: MUTED }}>
                  {filesSubmissions.length}{' '}
                  {filesSubmissions.length === 1 ? 'file' : 'files'} submitted
                </Text>
              </View>
              <Pressable
                onPress={() => setFilesDocId(null)}
                accessibilityLabel="Close"
                className="p-1"
              >
                <X size={20} color="#64748B" />
              </Pressable>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingTop: 8, paddingBottom: 8 }}
            >
              {filesSubmissions.length === 0 ? (
                <View className="items-center justify-center py-10">
                  <FileText color="#CBD5E1" size={40} />
                  <Text className="text-sm mt-3" style={{ color: MUTED }}>
                    No files submitted yet.
                  </Text>
                </View>
              ) : (
                filesSubmissions.map((entry, i) => {
                  const label = entry.periodStart
                    ? formatPeriodLabel(entry.periodStart, filesDoc?.recurrence)
                    : 'Current submission';
                  const isRejectedEntry = entry.status === 'rejected';

                  return (
                    <View
                      key={entry.key}
                      className="py-3"
                      style={
                        i > 0
                          ? { borderTopWidth: 1, borderTopColor: LINE }
                          : undefined
                      }
                    >
                      <View className="flex-row items-center justify-between">
                        <View className="flex-1 pr-3">
                          <View className="flex-row items-center">
                            <Text
                              className="text-[14px] font-semibold"
                              style={{ color: INK }}
                            >
                              {label}
                            </Text>
                            {entry.isCurrent && (
                              <View
                                className="ml-2 px-2 py-0.5 rounded-full"
                                style={{
                                  backgroundColor: withAlpha(themeColor, '18'),
                                }}
                              >
                                <Text
                                  className="text-[11px] font-semibold"
                                  style={{ color: themeColor }}
                                >
                                  Current
                                </Text>
                              </View>
                            )}
                          </View>
                          <View className="mt-1.5 flex-row">
                            <StatusBadge status={entry.status} />
                          </View>
                        </View>

                        <Pressable
                          onPress={() =>
                            filesDoc && viewFromFiles(filesDoc, entry, label)
                          }
                          className="flex-row items-center px-3.5 py-2 rounded-xl"
                          style={{ borderWidth: 1, borderColor: themeColor }}
                        >
                          <File color={themeColor} size={14} strokeWidth={2} />
                          <Text
                            className="ml-1.5 font-semibold text-[12px]"
                            style={{ color: themeColor }}
                          >
                            View
                          </Text>
                        </Pressable>
                      </View>

                      {isRejectedEntry && (
                        <RejectionNote reason={entry.reason} />
                      )}
                    </View>
                  );
                })
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Custom Feedback Modal (Success / Error) */}
      <Modal
        visible={modalConfig.visible}
        transparent
        animationType="fade"
        onRequestClose={() =>
          setModalConfig(prev => ({ ...prev, visible: false }))
        }
      >
        <View className="flex-1 bg-black/50 items-center justify-center px-6">
          <Animated.View
            entering={FadeInUp.duration(300).springify()}
            className="bg-white rounded-3xl p-6 w-full max-w-sm items-center shadow-xl"
          >
            <View
              className="h-16 w-16 rounded-full items-center justify-center mb-4"
              style={{
                backgroundColor:
                  modalConfig.type === 'success' ? '#DCFCE7' : '#FEE2E2',
              }}
            >
              {modalConfig.type === 'success' ? (
                <CheckCircle2 color="#16A34A" size={36} strokeWidth={2.5} />
              ) : (
                <AlertCircle color="#DC2626" size={36} strokeWidth={2.5} />
              )}
            </View>

            <Text
              className="text-xl font-bold text-center mb-2"
              style={{ color: INK }}
            >
              {modalConfig.title}
            </Text>
            <Text
              className="text-sm text-center mb-6 leading-5"
              style={{ color: MUTED }}
            >
              {modalConfig.message}
            </Text>

            <Pressable
              onPress={() =>
                setModalConfig(prev => ({ ...prev, visible: false }))
              }
              className="w-full py-3.5 rounded-2xl items-center"
              style={{
                backgroundColor:
                  modalConfig.type === 'success' ? themeColor : '#DC2626',
              }}
            >
              <Text className="text-white font-bold text-base">Continue</Text>
            </Pressable>
          </Animated.View>
        </View>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  pdf: {
    flex: 1,
    width: '100%',
  },
});
