import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { api } from '../api';
import { Platform } from 'react-native';
import ReactNativeBlobUtil from 'react-native-blob-util';

export const useDocuments = () => {
    return useQuery({
        queryKey: ['documents'],
        queryFn: async () => {
            const { data } = await api.get('/intern/documents');
            return data;
        },
    });
};

export const useUploadDocument = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ documentId, file }: { documentId: string, file: any }) => {
            const formData = new FormData();
            formData.append('document_id', documentId);

            // Adjust the URI for mobile platforms if needed
            formData.append('file', {
                uri: Platform.OS === 'ios' ? file.uri.replace('file://', '') : file.uri,
                name: file.name || 'document.pdf',
                type: file.type || 'application/pdf',
            } as any);

            const { data } = await api.post('/intern/documents/upload', formData, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                },
            });
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['documents'] });
        },
    });
};

export const downloadDocumentFile = async (documentId: string) => {
    const response = await api.get(`/intern/documents/download/${documentId}`, {
        responseType: 'arraybuffer',
    });

    const bytes = new Uint8Array(response.data);
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }

    const base64Data = ReactNativeBlobUtil.base64.encode(binary);

    const { fs } = ReactNativeBlobUtil;
    const path = `${fs.dirs.CacheDir}/doc_${documentId}_${Date.now()}.pdf`;

    await fs.writeFile(path, base64Data, 'base64');

    return Platform.OS === 'android' ? `file://${path}` : path;
};
