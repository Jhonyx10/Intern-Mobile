import React, {
    createContext,
    useContext,
    useEffect,
    useRef,
    useState,
} from 'react';
import ExcursionReasonModal from '../components/modal/ExcursionReasonModal';
import {
    usePendingExcursions,
    useUpdateExcursionReason,
} from './queries/excursions';
import { useUser } from './queries/auth';
import { useToast } from '../components/ToastProvider';

interface ExcursionContextValue {
    /** Number of excursions still awaiting a reason. */
    pendingCount: number;
    /** Open the reason modal for the first pending excursion. */
    openFirstPending: () => void;
}

const ExcursionContext = createContext<ExcursionContextValue>({
    pendingCount: 0,
    openFirstPending: () => { },
});

export function useExcursion() {
    return useContext(ExcursionContext);
}

/**
 * Mount this once at the app root (inside QueryClientProvider + ToastProvider).
 * It polls for pending excursions and floats the reason modal above every screen.
 */
export function ExcursionProvider({ children, isLoggedIn }: { children: React.ReactNode; isLoggedIn: boolean }) {
    const { showToast } = useToast();
    const { data: userData } = useUser();
    const themeColor = userData?.settings?.theme_color || '#1D4ED8';

    const { data: pendingExcursions } = usePendingExcursions(isLoggedIn);
    const { mutateAsync: updateExcursionReason, isPending: isSubmitting } =
        useUpdateExcursionReason();

    const [reasonModalVisible, setReasonModalVisible] = useState(false);
    const [selectedExcursionId, setSelectedExcursionId] = useState<number | null>(null);

    // Track which excursion IDs we have already auto-prompted for, so the
    // modal doesn't re-open after the user cancels or submits.
    const promptedIds = useRef<Set<number>>(new Set());

    // Auto-open the modal once per newly-detected pending excursion.
    useEffect(() => {
        if (reasonModalVisible || !pendingExcursions?.length) return;
        const next = pendingExcursions.find(
            (e: any) => !promptedIds.current.has(e.id),
        );
        if (next) {
            promptedIds.current.add(next.id);
            setSelectedExcursionId(next.id);
            setReasonModalVisible(true);
        }
    }, [pendingExcursions, reasonModalVisible]);

    const openFirstPending = () => {
        if (!pendingExcursions?.length) return;
        const first = pendingExcursions[0];
        if (first) {
            setSelectedExcursionId(first.id);
            setReasonModalVisible(true);
        }
    };

    const closeModal = () => {
        setReasonModalVisible(false);
        setSelectedExcursionId(null);
    };

    const handleSubmit = async (reason: string) => {
        if (!selectedExcursionId) return;
        try {
            await updateExcursionReason({ id: selectedExcursionId, reason });
            closeModal();
        } catch {
            showToast('Failed to submit reason.', 'error');
        }
    };

    return (
        <ExcursionContext.Provider
            value={{
                pendingCount: pendingExcursions?.length ?? 0,
                openFirstPending,
            }}
        >
            {children}

            {/* Floats above every screen in the app */}
            <ExcursionReasonModal
                visible={reasonModalVisible}
                onClose={closeModal}
                onSubmit={handleSubmit}
                isSubmitting={isSubmitting}
                themeColor={themeColor}
            />
        </ExcursionContext.Provider>
    );
}
