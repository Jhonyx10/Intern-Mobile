import React, { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  Modal,
  ActivityIndicator,
  Alert,
  StyleSheet,
  Platform,
} from 'react-native';
import Animated, {
  FadeInDown,
  FadeInUp,
  FadeIn,
  FadeOut,
  LinearTransition,
} from 'react-native-reanimated';
import LinearGradient from 'react-native-linear-gradient';
import {
  CheckCircle2,
  FileText,
  UploadCloud,
  X,
  File,
  AlertCircle,
  CalendarClock,
  ChevronDown,
  ChevronUp,
} from 'lucide-react-native';
import { pick, types } from '@react-native-documents/picker';
import Pdf from 'react-native-pdf';
import { useUser } from '../util/queries/auth';
import {
  useUploadDocument,
  useDocuments,
  downloadDocumentFile,
} from '../util/queries/documents';

function withAlpha(hex: string, alpha: string) {
  return `${hex}${alpha}`;
}

export type DocStatus = 'pending' | 'uploaded' | 'approved' | 'rejected';
export type Recurrence = 'none' | 'daily' | 'weekly';

export type DocumentHistoryEntry = {
  period_start: string;
  status: DocStatus;
  uri: string;
};

export type DocumentItem = {
  id: string;
  title: string;
  status: DocStatus;
  uri?: string;
  recurrence?: Recurrence;
  period_start?: string | null;
  history?: DocumentHistoryEntry[];
};

function StatusBadge({ status }: { status: DocStatus }) {
  const badges = {
    pending: { bg: '#F1F5F9', text: '#64748B', label: 'Required' },
    uploaded: { bg: '#FEF3C7', text: '#D97706', label: 'Under Review' },
    approved: { bg: '#DCFCE7', text: '#16A34A', label: 'Approved' },
    rejected: { bg: '#FEE2E2', text: '#DC2626', label: 'Rejected' },
  };
  const { bg, text, label } = badges[status];

  return (
    <View
      style={{ backgroundColor: bg }}
      className="px-2.5 py-1 rounded-full flex-row items-center"
    >
      {status === 'approved' && (
        <CheckCircle2 color={text} size={12} className="mr-1" />
      )}
      {status === 'rejected' && (
        <AlertCircle color={text} size={12} className="mr-1" />
      )}
      <Text
        style={{ color: text }}
        className="text-[10px] font-bold uppercase tracking-wider"
      >
        {label}
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

export const Documents = () => {
  const { data: userData } = useUser();
  const themeColor = userData?.settings?.theme_color || '#1D4ED8';

  const { data: fetchedDocs } = useDocuments();
  const allDocs: DocumentItem[] = fetchedDocs || [];

  // Recurring requirements (weekly/daily reports) get their own featured
  // card with a "current period" upload slot and an expandable history of
  // past submissions. Everything else is a normal one-shot requirement.
  const recurringDocs = allDocs.filter(
    d => d.recurrence && d.recurrence !== 'none',
  );
  const docs = allDocs.filter(d => !d.recurrence || d.recurrence === 'none');

  const [selectedDoc, setSelectedDoc] = useState<{
    title: string;
    id: string;
  } | null>(null);
  const [localPdfPath, setLocalPdfPath] = useState<string | null>(null);
  const [isLoadingPdf, setIsLoadingPdf] = useState<boolean>(false);
  const [isUploading, setIsUploading] = useState<string | null>(null);
  const [expandedHistory, setExpandedHistory] = useState<
    Record<string, boolean>
  >({});
  const uploadDocMutation = useUploadDocument();

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
  // past period when `period` and `overrideUri` are supplied (from history).
  const handleViewDoc = async (
    doc: DocumentItem,
    opts?: { period?: string; title?: string },
  ) => {
    const title = opts?.title ?? doc.title;
    setSelectedDoc({ id: doc.id, title });
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
      setIsUploading(id);

      const [res] = await pick({
        mode: 'import',
        type: [types.pdf],
        allowMultiSelection: false,
      });

      if (res?.uri) {
        try {
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
      } else {
        setIsUploading(null);
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

  const toggleHistory = (id: string) => {
    setExpandedHistory(prev => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <>
      <ScrollView
        style={{ flex: 1, backgroundColor: '#F8FAFC' }}
        contentContainerStyle={{ paddingBottom: 110 }}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={FadeInDown.duration(400)}>
          <LinearGradient
            colors={[themeColor, withAlpha(themeColor, 'CC')]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{
              paddingTop: 52,
              paddingBottom: 56,
              paddingHorizontal: 24,
              borderBottomLeftRadius: 36,
              borderBottomRightRadius: 36,
            }}
          >
            <Text className="text-white text-[22px] font-bold">Documents</Text>
            <Text className="text-white/60 text-[13px] mt-1">
              Manage and upload your required files
            </Text>
          </LinearGradient>
        </Animated.View>

        <View className="px-5" style={{ marginTop: -28 }}>
          {recurringDocs.map((doc, index) => {
            const history = doc.history ?? [];
            const isExpanded = !!expandedHistory[doc.id];

            return (
              <Animated.View
                key={doc.id}
                entering={FadeInUp.duration(400)
                  .delay(index * 100 + 100)
                  .springify()}
                layout={LinearTransition.duration(200)}
                className="rounded-3xl bg-white mb-4 overflow-hidden border border-slate-100 shadow-sm"
                style={{
                  shadowColor: '#0F172A',
                  shadowOpacity: 0.04,
                  shadowRadius: 10,
                  shadowOffset: { width: 0, height: 4 },
                  elevation: 2,
                }}
              >
                <View className="p-5 flex-row items-center">
                  <View
                    className="rounded-2xl p-3 mr-4"
                    style={{
                      backgroundColor: withAlpha(
                        doc.status === 'approved' ? '#16A34A' : themeColor,
                        '12',
                      ),
                    }}
                  >
                    <CalendarClock
                      color={doc.status === 'approved' ? '#16A34A' : themeColor}
                      size={26}
                      strokeWidth={1.5}
                    />
                  </View>
                  <View className="flex-1">
                    <Text className="text-[15px] font-bold text-slate-800 mb-1">
                      {doc.title}
                    </Text>
                    <View className="flex-row items-center flex-wrap">
                      <StatusBadge status={doc.status} />
                      {doc.period_start && (
                        <Text className="ml-2 text-[11px] text-slate-400 font-medium">
                          {formatPeriodLabel(doc.period_start, doc.recurrence)}
                        </Text>
                      )}
                    </View>
                  </View>

                  <View className="ml-3">
                    {isUploading === doc.id ? (
                      <View
                        className="px-5 py-2.5 rounded-xl"
                        style={{ backgroundColor: withAlpha(themeColor, '15') }}
                      >
                        <ActivityIndicator size="small" color={themeColor} />
                      </View>
                    ) : (
                      <Pressable
                        onPress={() => handleUpload(doc.id)}
                        className="flex-row items-center px-4 py-2.5 rounded-xl shadow-sm"
                        style={{ backgroundColor: themeColor }}
                      >
                        <UploadCloud color="#fff" size={16} strokeWidth={2.5} />
                        <Text className="ml-1.5 text-white font-bold text-[12px]">
                          Upload
                        </Text>
                      </Pressable>
                    )}
                  </View>
                </View>

                {history.length > 0 && (
                  <>
                    <Pressable
                      onPress={() => toggleHistory(doc.id)}
                      className="flex-row items-center justify-center py-2.5 border-t border-slate-100 active:opacity-70"
                    >
                      <Text className="text-[12px] font-semibold text-slate-500 mr-1">
                        {isExpanded ? 'Hide' : 'Show'} past submissions (
                        {history.length})
                      </Text>
                      {isExpanded ? (
                        <ChevronUp color="#94A3B8" size={14} />
                      ) : (
                        <ChevronDown color="#94A3B8" size={14} />
                      )}
                    </Pressable>

                    {isExpanded && (
                      <Animated.View
                        entering={FadeIn.duration(150)}
                        exiting={FadeOut.duration(100)}
                        className="px-5 pb-4"
                      >
                        {history.map(entry => (
                          <View
                            key={entry.period_start}
                            className="flex-row items-center justify-between py-2.5 border-t border-slate-50"
                          >
                            <View className="flex-1">
                              <Text className="text-[12px] font-semibold text-slate-700">
                                {formatPeriodLabel(
                                  entry.period_start,
                                  doc.recurrence,
                                )}
                              </Text>
                              <View className="mt-1 flex-row">
                                <StatusBadge status={entry.status} />
                              </View>
                            </View>
                            <Pressable
                              onPress={() =>
                                handleViewDoc(doc, {
                                  period: entry.period_start,
                                  title: `${doc.title} — ${formatPeriodLabel(
                                    entry.period_start,
                                    doc.recurrence,
                                  )}`,
                                })
                              }
                              className="flex-row items-center px-3.5 py-2 rounded-xl border"
                              style={{ borderColor: themeColor }}
                            >
                              <File
                                color={themeColor}
                                size={13}
                                strokeWidth={2}
                              />
                              <Text
                                className="ml-1.5 font-bold text-[11px]"
                                style={{ color: themeColor }}
                              >
                                View
                              </Text>
                            </Pressable>
                          </View>
                        ))}
                      </Animated.View>
                    )}
                  </>
                )}
              </Animated.View>
            );
          })}

          {docs.map((doc: DocumentItem, index: number) => (
            <Animated.View
              key={doc.id}
              entering={FadeInUp.duration(500)
                .delay(index * 100 + 200)
                .springify()}
              className="rounded-3xl bg-white mb-4 p-5 flex-row items-center border border-slate-100 shadow-sm"
              style={{
                shadowColor: '#0F172A',
                shadowOpacity: 0.04,
                shadowRadius: 10,
                shadowOffset: { width: 0, height: 4 },
                elevation: 2,
              }}
            >
              <View
                className="rounded-2xl p-3 mr-4"
                style={{
                  backgroundColor: withAlpha(
                    doc.status === 'approved' ? '#16A34A' : themeColor,
                    '12',
                  ),
                }}
              >
                <FileText
                  color={doc.status === 'approved' ? '#16A34A' : themeColor}
                  size={26}
                  strokeWidth={1.5}
                />
              </View>
              <View className="flex-1">
                <Text className="text-[15px] font-bold text-slate-800 mb-1">
                  {doc.title}
                </Text>
                <View className="flex-row items-center">
                  <StatusBadge status={doc.status} />
                </View>
              </View>

              <View className="ml-3">
                {isUploading === doc.id ? (
                  <View
                    className="px-5 py-2.5 rounded-xl"
                    style={{ backgroundColor: withAlpha(themeColor, '15') }}
                  >
                    <ActivityIndicator size="small" color={themeColor} />
                  </View>
                ) : doc.status === 'pending' || doc.status === 'rejected' ? (
                  <Pressable
                    onPress={() => handleUpload(doc.id)}
                    className="flex-row items-center px-4 py-2.5 rounded-xl border shadow-sm"
                    style={{
                      borderColor: themeColor,
                      backgroundColor: withAlpha(themeColor, '05'),
                    }}
                  >
                    <UploadCloud
                      color={themeColor}
                      size={16}
                      strokeWidth={2.5}
                    />
                    <Text
                      className="ml-1.5 font-bold text-[12px]"
                      style={{ color: themeColor }}
                    >
                      Upload
                    </Text>
                  </Pressable>
                ) : (
                  <Pressable
                    onPress={() => handleViewDoc(doc)}
                    className="flex-row items-center px-4 py-2.5 rounded-xl shadow-sm"
                    style={{ backgroundColor: themeColor }}
                  >
                    <File color="#fff" size={15} strokeWidth={2} />
                    <Text className="ml-1.5 text-white font-bold text-[12px]">
                      View
                    </Text>
                  </Pressable>
                )}
              </View>
            </Animated.View>
          ))}
        </View>
      </ScrollView>

      <Modal
        visible={!!selectedDoc}
        presentationStyle="pageSheet"
        animationType="slide"
        onRequestClose={() => setSelectedDoc(null)}
      >
        <View className="flex-1 bg-white">
          <View className="flex-row items-center justify-between px-5 pt-12 pb-4 border-b border-slate-100 bg-white shadow-sm z-10">
            <View className="flex-1 pr-4">
              <Text
                className="text-lg font-bold text-slate-800"
                numberOfLines={1}
              >
                {selectedDoc?.title}
              </Text>
              <Text className="text-xs text-slate-500 mt-0.5">PDF Preview</Text>
            </View>
            <Pressable
              onPress={() => setSelectedDoc(null)}
              className="h-10 w-10 items-center justify-center rounded-full bg-slate-100"
            >
              <X color="#475569" size={20} />
            </Pressable>
          </View>

          <View className="flex-1 bg-slate-100">
            {isLoadingPdf ? (
              <View className="flex-1 items-center justify-center">
                <ActivityIndicator size="large" color={themeColor} />
                <Text className="mt-4 text-slate-500 font-medium">
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
                  Alert.alert(
                    'Preview Error',
                    `Could not render cached PDF: ` + (error?.message || error),
                  );
                }}
              />
            ) : (
              <View className="flex-1 items-center justify-center">
                <AlertCircle color="#94A3B8" size={40} />
                <Text className="mt-4 text-slate-400 font-medium">
                  No document source found.
                </Text>
              </View>
            )}
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

            <Text className="text-xl font-bold text-slate-800 text-center mb-2">
              {modalConfig.title}
            </Text>
            <Text className="text-sm text-slate-500 text-center mb-6 leading-5">
              {modalConfig.message}
            </Text>

            <Pressable
              onPress={() =>
                setModalConfig(prev => ({ ...prev, visible: false }))
              }
              className="w-full py-3.5 rounded-2xl items-center shadow-sm"
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
