import React, { useState } from 'react';
import { View, Text, Pressable, ScrollView, Modal, ActivityIndicator, Alert, StyleSheet } from 'react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import LinearGradient from 'react-native-linear-gradient';
import { CheckCircle2, FileText, UploadCloud, X, File, AlertCircle } from 'lucide-react-native';
import DocumentPicker, { types } from 'react-native-document-picker';
import Pdf from 'react-native-pdf';
import { useUser } from '../util/queries/auth';

function withAlpha(hex: string, alpha: string) {
    return `${hex}${alpha}`;
}

export type DocumentItem = {
    id: string;
    title: string;
    status: 'pending' | 'uploaded' | 'approved' | 'rejected';
    uri?: string;
};

const initialDocs: DocumentItem[] = [
    { id: '1', title: 'Resume (CV)', status: 'approved', uri: 'https://pdfobject.com/pdf/sample.pdf' }, // Mock URI for layout test
    { id: '2', title: 'Medical Certificate', status: 'pending' },
    { id: '3', title: 'Internship Waiver', status: 'pending' },
    { id: '4', title: 'Endorsement Letter', status: 'uploaded', uri: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf' },
];

function StatusBadge({ status }: { status: DocumentItem['status'] }) {
    const badges = {
        pending: { bg: '#F1F5F9', text: '#64748B', label: 'Required' },
        uploaded: { bg: '#FEF3C7', text: '#D97706', label: 'Under Review' },
        approved: { bg: '#DCFCE7', text: '#16A34A', label: 'Approved' },
        rejected: { bg: '#FEE2E2', text: '#DC2626', label: 'Rejected' },
    };
    const { bg, text, label } = badges[status];

    return (
        <View style={{ backgroundColor: bg }} className="px-2.5 py-1 rounded-full flex-row items-center">
            {status === 'approved' && <CheckCircle2 color={text} size={12} className="mr-1" />}
            {status === 'rejected' && <AlertCircle color={text} size={12} className="mr-1" />}
            <Text style={{ color: text }} className="text-[10px] font-bold uppercase tracking-wider">{label}</Text>
        </View>
    );
}

export const Documents = () => {
    const { data: userData } = useUser();
    const themeColor = userData?.settings?.theme_color || '#1D4ED8';
    const [docs, setDocs] = useState<DocumentItem[]>(initialDocs);
    const [selectedDoc, setSelectedDoc] = useState<DocumentItem | null>(null);
    const [isUploading, setIsUploading] = useState<string | null>(null);

    const handleUpload = async (id: string) => {
        try {
            setIsUploading(id);
            const res = await DocumentPicker.pickSingle({
                presentationStyle: 'fullScreen',
                type: [types.pdf],
            });

            if (res.uri) {
                // Simulate an upload delay
                setTimeout(() => {
                    setDocs((prev) => prev.map(d => d.id === id ? { ...d, status: 'uploaded', uri: res.uri } : d));
                    Alert.alert('Success', 'Document uploaded successfully and is under review.');
                    setIsUploading(null);
                }, 1200);
            } else {
                setIsUploading(null);
            }
        } catch (err) {
            setIsUploading(null);
            if (!DocumentPicker.isCancel(err)) {
                Alert.alert('Error', 'An unknown error occurred while selecting the file.');
            }
        }
    };

    return (
        <>
            <ScrollView style={{ flex: 1, backgroundColor: '#F8FAFC' }} contentContainerStyle={{ paddingBottom: 110 }} showsVerticalScrollIndicator={false}>
                <Animated.View entering={FadeInDown.duration(400)}>
                    <LinearGradient
                        colors={[themeColor, withAlpha(themeColor, 'CC')]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={{ paddingTop: 52, paddingBottom: 56, paddingHorizontal: 24, borderBottomLeftRadius: 36, borderBottomRightRadius: 36 }}
                    >
                        <Text className="text-white text-[22px] font-bold">Documents</Text>
                        <Text className="text-white/60 text-[13px] mt-1">Manage and upload your required files</Text>
                    </LinearGradient>
                </Animated.View>

                <View className="px-5" style={{ marginTop: -28 }}>
                    {docs.map((doc, index) => (
                        <Animated.View
                            key={doc.id}
                            entering={FadeInUp.duration(500).delay(index * 100 + 150).springify()}
                            className="rounded-3xl bg-white mb-4 p-5 flex-row items-center border border-slate-100 shadow-sm"
                            style={{
                                shadowColor: '#0F172A', shadowOpacity: 0.04, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 2
                            }}
                        >
                            <View className="rounded-2xl p-3 mr-4" style={{ backgroundColor: withAlpha(doc.status === 'approved' ? '#16A34A' : themeColor, '12') }}>
                                <FileText color={doc.status === 'approved' ? '#16A34A' : themeColor} size={26} strokeWidth={1.5} />
                            </View>
                            <View className="flex-1">
                                <Text className="text-[15px] font-bold text-slate-800 mb-1">{doc.title}</Text>
                                <View className="flex-row items-center">
                                    <StatusBadge status={doc.status} />
                                </View>
                            </View>

                            <View className="ml-3">
                                {isUploading === doc.id ? (
                                    <View className="px-5 py-2.5 rounded-xl" style={{ backgroundColor: withAlpha(themeColor, '15') }}>
                                        <ActivityIndicator size="small" color={themeColor} />
                                    </View>
                                ) : (doc.status === 'pending' || doc.status === 'rejected' ? (
                                    <Pressable onPress={() => handleUpload(doc.id)} className="flex-row items-center px-4 py-2.5 rounded-xl border" style={{ borderColor: themeColor, backgroundColor: withAlpha(themeColor, '05') }}>
                                        <UploadCloud color={themeColor} size={16} strokeWidth={2.5} />
                                        <Text className="ml-1.5 font-bold text-[12px]" style={{ color: themeColor }}>Upload</Text>
                                    </Pressable>
                                ) : (
                                    <Pressable onPress={() => setSelectedDoc(doc)} className="flex-row items-center px-4 py-2.5 rounded-xl shadow-sm" style={{ backgroundColor: themeColor }}>
                                        <File color="#fff" size={15} strokeWidth={2} />
                                        <Text className="ml-1.5 text-white font-bold text-[12px]">View</Text>
                                    </Pressable>
                                ))}
                            </View>
                        </Animated.View>
                    ))}
                </View>
            </ScrollView>

            <Modal visible={!!selectedDoc} presentationStyle="pageSheet" animationType="slide" onRequestClose={() => setSelectedDoc(null)}>
                <View className="flex-1 bg-white">
                    <View className="flex-row items-center justify-between px-5 pt-12 pb-4 border-b border-slate-100 bg-white shadow-sm z-10">
                        <View className="flex-1 pr-4">
                            <Text className="text-lg font-bold text-slate-800" numberOfLines={1}>{selectedDoc?.title}</Text>
                            <Text className="text-xs text-slate-500 mt-0.5">PDF Preview</Text>
                        </View>
                        <Pressable onPress={() => setSelectedDoc(null)} className="h-10 w-10 items-center justify-center rounded-full bg-slate-100">
                            <X color="#475569" size={20} />
                        </Pressable>
                    </View>

                    <View className="flex-1 bg-slate-100">
                        {selectedDoc?.uri ? (
                            <Pdf
                                source={{ uri: selectedDoc.uri, cache: true }}
                                style={styles.pdf}
                                onLoadComplete={(numberOfPages, filePath) => {
                                    console.log(`Number of pages: ${numberOfPages}`);
                                }}
                                onPageChanged={(page, numberOfPages) => {
                                    console.log(`Current page: ${page}`);
                                }}
                                onError={(error) => {
                                    console.log(error);
                                }}
                                onPressLink={(uri) => {
                                    console.log(`Link pressed: ${uri}`);
                                }}
                            />
                        ) : (
                            <View className="flex-1 items-center justify-center">
                                <AlertCircle color="#94A3B8" size={40} />
                                <Text className="mt-4 text-slate-400 font-medium">No document source found.</Text>
                            </View>
                        )}
                    </View>
                </View>
            </Modal>
        </>
    );
};

const styles = StyleSheet.create({
    pdf: {
        flex: 1,
        width: '100%',
    }
});