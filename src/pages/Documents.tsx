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
  FadeInUp,
  LinearTransition,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import {
  CheckCircle2,
  FileText,
  UploadCloud,
  X,
  File,
  AlertCircle,
  Clock,
  Trash2,
} from 'lucide-react-native';
import { pick, types, keepLocalCopy } from '@react-native-documents/picker';
import Pdf from 'react-native-pdf';
import { useUser } from '../util/queries/auth';
import {
  useUploadDocument,
  useDocuments,
  useCancelSubmission,
  downloadDocumentFile,
} from '../util/queries/documents';
import { useToast } from '../components/ToastProvider';
import { PAGE_BG, LINE, INK, MUTED, Panel } from '../components/ScreenKit';
import ScreenHeader from '../components/ScreenHeader';
import InternshipCompletedCard from '../components/InternshipCompletedCard';
import { useDashboard } from '../util/queries/dashboard';

const MAX_FILE_BYTES = 10 * 1024 * 1024; // matches the server's 10 MB limit

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
  // The current submission's id. Needed to cancel it while it is under review.
  submission_id?: number | null;
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

// A file the intern picked and is previewing before it is submitted.
// `uri` is a local copy in the app's cache, safe for both preview and upload.
type PendingUpload = {
  docId: string;
  title: string;
  file: {
    uri: string;
    name?: string | null;
    size?: number | null;
    type?: string;
  };
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

type DocFilter = 'all' | 'todo' | 'review' | 'approved' | 'rejected';

const FILTERS: { key: DocFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'todo', label: 'To do' },
  { key: 'review', label: 'Under review' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
];

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
  return ((data as DocumentItem[]) ?? []).filter(
    d => (!d.recurrence || d.recurrence === 'none') && getActionMeta(d),
  ).length;
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
  const todo = docs.filter(
    d => (!d.recurrence || d.recurrence === 'none') && getActionMeta(d),
  );
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

// Spinner shown in place of the upload button while a file is being sent.
// Defined at module level so it keeps a stable identity between renders.
function UploadingIndicator({ themeColor }: { themeColor: string }) {
  return (
    <View
      className="px-5 py-2.5 rounded-xl"
      style={{ backgroundColor: withAlpha(themeColor, '15') }}
    >
      <ActivityIndicator size="small" color={themeColor} />
    </View>
  );
}

// Lets the intern take back a file that is still under review
function CancelSubmissionButton({
  doc,
  isCompleted,
  onPress,
}: {
  doc: DocumentItem;
  isCompleted: boolean;
  onPress: (doc: DocumentItem) => void;
}) {
  if (isCompleted || doc.status !== 'uploaded' || !doc.submission_id) {
    return null;
  }
  return (
    <Pressable
      onPress={() => onPress(doc)}
      className="mt-3 flex-row items-center justify-center py-2.5 rounded-xl"
      style={{
        backgroundColor: '#FEF2F2',
        borderWidth: 1,
        borderColor: '#FECACA',
      }}
    >
      <Trash2 color="#DC2626" size={14} strokeWidth={2} />
      <Text
        className="ml-1.5 font-semibold text-[13px]"
        style={{ color: '#B91C1C' }}
      >
        Cancel submission
      </Text>
    </Pressable>
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

function formatFileSize(bytes?: number | null) {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
  const { data: dashboard } = useDashboard();
  const isCompleted = Boolean((dashboard as any)?.is_completed);
  const allDocs: DocumentItem[] = fetchedDocs || [];

  // ── Filter ──────────────────────────────────────────────────
  const [filter, setFilter] = useState<DocFilter>('all');

  const matchesFilter = (d: DocumentItem, f: DocFilter) => {
    switch (f) {
      case 'todo':
        return !isCompleted && Boolean(getActionMeta(d));
      case 'review':
        return d.status === 'uploaded';
      case 'approved':
        return d.status === 'approved';
      case 'rejected':
        return d.status === 'rejected';
      default:
        return true;
    }
  };

  const filterCounts = FILTERS.reduce((acc, f) => {
    acc[f.key] = allDocs.filter(d => matchesFilter(d, f.key)).length;
    return acc;
  }, {} as Record<DocFilter, number>);

  const visibleDocs = allDocs.filter(d => matchesFilter(d, filter));

  // Recurring requirements (weekly/daily reports) get their own featured
  // card with a "current period" upload slot and a Files button that opens
  // every file submitted so far. Everything else is a normal one-shot
  // requirement.
  const recurringDocs = visibleDocs
    .filter(d => d.recurrence && d.recurrence !== 'none')
    .sort(urgencyFirst);
  const docs = visibleDocs
    .filter(d => !d.recurrence || d.recurrence === 'none')
    .sort(urgencyFirst);

  const [selectedDoc, setSelectedDoc] = useState<SelectedDoc | null>(null);
  const [localPdfPath, setLocalPdfPath] = useState<string | null>(null);
  const [isLoadingPdf, setIsLoadingPdf] = useState<boolean>(false);
  const [isUploading, setIsUploading] = useState<string | null>(null);
  const uploadDocMutation = useUploadDocument();
  const cancelMutation = useCancelSubmission();

  // Preview-before-submit
  const [pendingUpload, setPendingUpload] = useState<PendingUpload | null>(
    null,
  );
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Cancel an under-review submission
  const [cancelTarget, setCancelTarget] = useState<DocumentItem | null>(null);

  // Submitted-files modal (recurring requirements)
  const [filesDocId, setFilesDocId] = useState<string | null>(null);
  const [reopenFilesId, setReopenFilesId] = useState<string | null>(null);

  // Derived from live data, so the list stays current after an upload
  const filesDoc =
    allDocs.find(d => d.id === filesDocId && d.recurrence !== 'none') ?? null;
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

  // Step 1: pick a file. Nothing is sent yet; it opens the preview.
  // The picked file is copied into the app's cache first, because the raw
  // picker URI (often content:// on Android) is not reliably readable by
  // react-native-pdf or FormData.
  const handleUpload = async (id: string, title: string) => {
    if (isCompleted) return;

    try {
      const [res] = await pick({
        type: [types.pdf],
        allowMultiSelection: false,
      });

      if (!res?.uri) return;

      if (res.size && res.size > MAX_FILE_BYTES) {
        showFeedback(
          'error',
          'File Too Large',
          'The file is larger than 10 MB. Please choose a smaller PDF.',
        );
        return;
      }

      const [copy] = await keepLocalCopy({
        files: [{ uri: res.uri, fileName: res.name ?? 'document.pdf' }],
        destination: 'cachesDirectory',
      });

      if (copy.status !== 'success') {
        showFeedback(
          'error',
          'Selection Error',
          'Could not read that file. Please try another PDF.',
        );
        return;
      }

      setUploadError(null);
      setPendingUpload({
        docId: id,
        title,
        file: {
          uri: copy.localUri,
          name: res.name,
          size: res.size,
          type: 'application/pdf',
        },
      });
    } catch (err: any) {
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

  // Step 2: the intern reviewed the preview and confirms. Now it is sent.
  // The backend determines the period (current week/day) from the
  // requirement's recurrence.
  const confirmUpload = async () => {
    if (!pendingUpload || isCompleted) return;
    const { docId, file } = pendingUpload;

    try {
      setUploadError(null);
      setIsUploading(docId);
      await uploadDocMutation.mutateAsync({
        documentId: docId,
        file: file as any,
      });
      setIsUploading(null);
      setPendingUpload(null);
      // Wait for the preview sheet to finish dismissing. Presenting a second
      // Modal while the first is still animating away can crash on iOS.
      setTimeout(() => {
        showFeedback(
          'success',
          'Upload Successful!',
          'Your document has been submitted and is now under review. You can cancel it until your coordinator reviews it.',
        );
      }, 500);
    } catch (uploadErr: any) {
      setIsUploading(null);
      // Stay on the preview so the intern can retry without picking again
      setUploadError(
        uploadErr?.response?.data?.message ||
          uploadErr?.message ||
          'Failed to upload document to server.',
      );
    }
  };

  const discardPendingUpload = () => {
    if (isUploading) return;
    setPendingUpload(null);
    setUploadError(null);
  };

  // Removes an under-review submission so a new one can be uploaded
  const confirmCancelSubmission = async () => {
    const target = cancelTarget;
    if (!target?.submission_id) return;

    try {
      await cancelMutation.mutateAsync(target.submission_id);
      setCancelTarget(null);
      // Same reason as above: let the confirm dialog finish closing first
      setTimeout(() => {
        showFeedback(
          'success',
          'Submission Removed',
          'Your file was removed. You can upload a new one when you are ready.',
        );
      }, 400);
    } catch (err: any) {
      setCancelTarget(null);
      setTimeout(() => {
        showFeedback(
          'error',
          'Could Not Remove File',
          err?.response?.data?.message ||
            err?.message ||
            'Something went wrong. Please try again.',
        );
      }, 400);
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

  const nothingMatches =
    allDocs.length > 0 && recurringDocs.length === 0 && docs.length === 0;

  return (
    <>
      <ScrollView
        style={{ flex: 1, backgroundColor: PAGE_BG }}
        contentContainerStyle={{ paddingBottom: 110 }}
        showsVerticalScrollIndicator={false}
      >
        <ScreenHeader
          title="Documents"
          subtitle="Manage and upload your required files"
        />

        <View className="px-5" style={{ marginTop: -56 }}>
          {isCompleted ? (
            <InternshipCompletedCard
              className="mb-3"
              message="Document uploads are now closed. You can still view your submitted files."
            />
          ) : (
            <ActionBanner docs={allDocs} />
          )}

          {/* Filter */}
          {allDocs.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              className="mb-3"
              contentContainerStyle={{ paddingRight: 8 }}
            >
              {FILTERS.filter(f => !(isCompleted && f.key === 'todo')).map(
                f => {
                  const active = filter === f.key;
                  return (
                    <Pressable
                      key={f.key}
                      onPress={() => setFilter(f.key)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      className="flex-row items-center mr-2 px-3.5 py-2 rounded-full"
                      style={{
                        backgroundColor: active ? themeColor : '#fff',
                        borderWidth: 1,
                        borderColor: active ? themeColor : LINE,
                      }}
                    >
                      <Text
                        className="text-[13px] font-semibold"
                        style={{ color: active ? '#fff' : INK }}
                      >
                        {f.label}
                      </Text>
                      <View
                        className="ml-1.5 px-1.5 rounded-full"
                        style={{
                          backgroundColor: active
                            ? 'rgba(255,255,255,0.25)'
                            : '#F1F5F9',
                        }}
                      >
                        <Text
                          className="text-[11px] font-bold"
                          style={{ color: active ? '#fff' : MUTED }}
                        >
                          {filterCounts[f.key]}
                        </Text>
                      </View>
                    </Pressable>
                  );
                },
              )}
            </ScrollView>
          )}

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

          {nothingMatches && (
            <Panel>
              <View className="items-center px-6 py-10">
                <FileText color="#CBD5E1" size={36} />
                <Text
                  className="text-[14px] font-semibold mt-3"
                  style={{ color: INK }}
                >
                  No documents match this filter
                </Text>
                <Pressable onPress={() => setFilter('all')} className="mt-2">
                  <Text
                    className="text-[13px] font-semibold"
                    style={{ color: themeColor }}
                  >
                    Show all documents
                  </Text>
                </Pressable>
              </View>
            </Panel>
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
                      {!isCompleted && <ActionPill doc={doc} />}
                    </View>

                    {isUploading === doc.id ? (
                      <UploadingIndicator themeColor={themeColor} />
                    ) : (
                      <Pressable
                        onPress={() => handleUpload(doc.id, doc.title)}
                        disabled={isCompleted || doc.can_upload === false}
                        className="flex-row items-center px-4 py-2.5 rounded-xl"
                        style={{
                          backgroundColor:
                            isCompleted || doc.can_upload === false
                              ? '#CBD5E1'
                              : themeColor,
                        }}
                      >
                        <UploadCloud
                          color="#fff"
                          size={16}
                          strokeWidth={2.25}
                        />
                        <Text className="ml-1.5 text-white font-semibold text-[13px]">
                          {isCompleted
                            ? 'Closed'
                            : doc.can_upload === false
                            ? 'Fridays only'
                            : doc.status === 'rejected'
                            ? 'Re-upload'
                            : 'Upload'}
                        </Text>
                      </Pressable>
                    )}
                  </View>

                  {doc.status === 'uploaded' && !isCompleted && (
                    <View className="px-4 pb-3">
                      <CancelSubmissionButton
                        doc={doc}
                        isCompleted={isCompleted}
                        onPress={setCancelTarget}
                      />
                    </View>
                  )}

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
                        {!isCompleted && <ActionPill doc={doc} />}
                      </View>

                      {/* Right-side action. Rejected cards use the action row below. */}
                      {!isRejected &&
                        (isUploading === doc.id ? (
                          <UploadingIndicator themeColor={themeColor} />
                        ) : doc.status === 'pending' ? (
                          <Pressable
                            onPress={() => handleUpload(doc.id, doc.title)}
                            disabled={isCompleted}
                            className="flex-row items-center px-4 py-2.5 rounded-xl"
                            style={{
                              backgroundColor: isCompleted
                                ? '#CBD5E1'
                                : themeColor,
                            }}
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

                    {/* Under review: the intern can still take it back */}
                    <CancelSubmissionButton
                      doc={doc}
                      isCompleted={isCompleted}
                      onPress={setCancelTarget}
                    />

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
                              onPress={() => handleUpload(doc.id, doc.title)}
                              disabled={isCompleted}
                              className="flex-1 flex-row items-center justify-center py-2.5 rounded-xl"
                              style={{
                                backgroundColor: isCompleted
                                  ? '#CBD5E1'
                                  : themeColor,
                              }}
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

      {/* Preview before submitting */}
      <Modal
        visible={!!pendingUpload}
        presentationStyle="pageSheet"
        animationType="slide"
        onRequestClose={discardPendingUpload}
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
                Review before submitting
              </Text>
              <Text
                className="text-[12px] mt-0.5"
                style={{ color: MUTED }}
                numberOfLines={1}
              >
                {pendingUpload?.title}
                {pendingUpload?.file.name
                  ? ` · ${pendingUpload.file.name}`
                  : ''}
                {pendingUpload?.file.size
                  ? ` · ${formatFileSize(pendingUpload.file.size)}`
                  : ''}
              </Text>
            </View>
            <Pressable
              onPress={discardPendingUpload}
              disabled={!!isUploading}
              accessibilityLabel="Cancel upload"
              className="h-10 w-10 items-center justify-center rounded-full"
              style={{
                backgroundColor: PAGE_BG,
                opacity: isUploading ? 0.5 : 1,
              }}
            >
              <X color="#475569" size={20} />
            </Pressable>
          </View>

          <View className="flex-1" style={{ backgroundColor: PAGE_BG }}>
            {pendingUpload && (
              <Pdf
                source={{ uri: pendingUpload.file.uri }}
                style={styles.pdf}
                onError={(error: any) => {
                  console.log('PDF Error:', error);
                  setUploadError(
                    'This file could not be opened. Choose a different PDF.',
                  );
                }}
              />
            )}
          </View>

          <View
            className="px-5 pt-4 pb-8 bg-white"
            style={{ borderTopWidth: 1, borderTopColor: LINE }}
          >
            {uploadError && (
              <Text
                className="text-[13px] mb-3 leading-5"
                style={{ color: '#B91C1C' }}
              >
                {uploadError}
              </Text>
            )}
            <View className="flex-row gap-3">
              <Pressable
                onPress={discardPendingUpload}
                disabled={!!isUploading}
                className="flex-1 items-center justify-center py-3.5 rounded-2xl"
                style={{
                  borderWidth: 1,
                  borderColor: LINE,
                  opacity: isUploading ? 0.5 : 1,
                }}
              >
                <Text className="font-bold text-[14px]" style={{ color: INK }}>
                  Cancel
                </Text>
              </Pressable>
              <Pressable
                onPress={confirmUpload}
                disabled={!!isUploading}
                className="flex-1 flex-row items-center justify-center py-3.5 rounded-2xl"
                style={{
                  backgroundColor: themeColor,
                  opacity: isUploading ? 0.7 : 1,
                }}
              >
                {isUploading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <UploadCloud color="#fff" size={16} strokeWidth={2.25} />
                    <Text className="ml-2 text-white font-bold text-[14px]">
                      {uploadError ? 'Try again' : 'Submit'}
                    </Text>
                  </>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

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

      {/* Confirm cancelling an under-review submission */}
      <Modal
        visible={!!cancelTarget}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => {
          if (!cancelMutation.isPending) {
            setCancelTarget(null);
          }
        }}
      >
        <View className="flex-1 bg-black/50 items-center justify-center px-6">
          <View className="bg-white rounded-3xl p-6 w-full max-w-sm items-center">
            <View
              className="h-14 w-14 rounded-full items-center justify-center mb-4"
              style={{ backgroundColor: '#FEE2E2' }}
            >
              <Trash2 color="#DC2626" size={26} strokeWidth={2.25} />
            </View>
            <Text
              className="text-lg font-bold text-center mb-2"
              style={{ color: INK }}
            >
              Cancel this submission?
            </Text>
            <Text
              className="text-sm text-center mb-6 leading-5"
              style={{ color: MUTED }}
            >
              {cancelTarget?.title} will be removed and will not be reviewed.
              You can upload a new file afterwards.
            </Text>
            <View className="flex-row gap-3 w-full">
              <Pressable
                onPress={() => setCancelTarget(null)}
                disabled={cancelMutation.isPending}
                className="flex-1 py-3.5 rounded-2xl items-center"
                style={{ borderWidth: 1, borderColor: LINE }}
              >
                <Text className="font-bold text-[14px]" style={{ color: INK }}>
                  Keep it
                </Text>
              </Pressable>
              <Pressable
                onPress={confirmCancelSubmission}
                disabled={cancelMutation.isPending}
                className="flex-1 py-3.5 rounded-2xl items-center justify-center"
                style={{
                  backgroundColor: '#DC2626',
                  opacity: cancelMutation.isPending ? 0.7 : 1,
                }}
              >
                {cancelMutation.isPending ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text className="text-white font-bold text-[14px]">
                    Remove file
                  </Text>
                )}
              </Pressable>
            </View>
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
