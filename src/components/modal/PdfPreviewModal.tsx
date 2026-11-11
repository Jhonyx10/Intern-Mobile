import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  Text,
  View,
} from 'react-native';
import Pdf from 'react-native-pdf';
import { Share2, X } from 'lucide-react-native';

type Props = {
  visible: boolean;
  /** Absolute path of the generated PDF (no `file://` prefix) */
  path: string | null;
  fileName: string;
  themeColor: string;
  onClose: () => void;
  /** Called when the user is happy with the preview and wants to save / share it */
  onConfirm: () => void;
  isConfirming?: boolean;
};

export default function PdfPreviewModal({
  visible,
  path,
  fileName,
  themeColor,
  onClose,
  onConfirm,
  isConfirming = false,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  // Reset the loading state each time a new PDF is shown
  useEffect(() => {
    if (visible) {
      setLoading(true);
      setFailed(false);
    }
  }, [visible, path]);

  return (
    <Modal
      visible={visible && !!path}
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={{ flex: 1, backgroundColor: '#F1F5F9' }}>
        {/* Header */}
        <View
          className="flex-row items-center justify-between bg-white px-5 pb-3"
          style={{
            paddingTop: Platform.OS === 'ios' ? 56 : 44,
            borderBottomWidth: 1,
            borderBottomColor: '#E2E8F0',
          }}
        >
          <View className="flex-1 pr-3">
            <Text className="text-[16px] font-bold text-slate-900">
              Preview weekly report
            </Text>
            <Text
              className="text-[11px] text-slate-500 mt-0.5"
              numberOfLines={1}
            >
              {fileName}
            </Text>
          </View>
          <Pressable onPress={onClose} hitSlop={10} className="p-1">
            <X size={22} color="#64748B" />
          </Pressable>
        </View>

        {/* PDF */}
        <View style={{ flex: 1 }}>
          {path && !failed && (
            <Pdf
              source={{ uri: `file://${path}` }}
              style={{ flex: 1, backgroundColor: '#F1F5F9' }}
              trustAllCerts={false}
              onLoadComplete={() => setLoading(false)}
              onError={() => {
                setLoading(false);
                setFailed(true);
              }}
            />
          )}

          {loading && !failed && (
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <ActivityIndicator size="large" color={themeColor} />
            </View>
          )}

          {failed && (
            <View className="flex-1 items-center justify-center px-8">
              <Text className="text-center text-sm text-slate-500">
                The preview couldn't be displayed. You can still open or share
                the PDF.
              </Text>
            </View>
          )}
        </View>

        {/* Footer */}
        <View
          className="flex-row items-center bg-white px-5 pt-3"
          style={{
            paddingBottom: Platform.OS === 'ios' ? 32 : 16,
            borderTopWidth: 1,
            borderTopColor: '#E2E8F0',
            gap: 12,
          }}
        >
          <Pressable
            onPress={onClose}
            disabled={isConfirming}
            className="flex-1 items-center justify-center rounded-2xl py-3.5"
            style={{ borderWidth: 1, borderColor: '#E2E8F0' }}
          >
            <Text className="text-[14px] font-bold text-slate-700">Cancel</Text>
          </Pressable>
          <Pressable
            onPress={onConfirm}
            disabled={isConfirming}
            className="flex-[1.6] flex-row items-center justify-center rounded-2xl py-3.5"
            style={{
              backgroundColor: themeColor,
              opacity: isConfirming ? 0.7 : 1,
            }}
          >
            {isConfirming ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Share2 size={16} color="#fff" strokeWidth={2.2} />
                <Text className="ml-2 text-[14px] font-bold text-white">
                  {Platform.OS === 'ios' ? 'Save or share' : 'Open / share PDF'}
                </Text>
              </>
            )}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
