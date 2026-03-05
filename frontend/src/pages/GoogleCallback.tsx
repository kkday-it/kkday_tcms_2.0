import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2, AlertCircle } from 'lucide-react';

/**
 * GoogleCallback page
 *
 * The backend redirects here after Google OAuth completes, passing session
 * information as query parameters:
 *   ?token=...&user_id=...&role=...&full_name=...
 *
 * This page stores them in localStorage and redirects to the app root,
 * mirroring the behavior of the normal login flow.
 */
export default function GoogleCallback() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const [error, setError] = useState('');

    useEffect(() => {
        const token = searchParams.get('token');
        const userId = searchParams.get('user_id');
        const role = searchParams.get('role');
        const fullName = searchParams.get('full_name');
        const err = searchParams.get('error');

        if (err === 'account_disabled') {
            setError('Your account is disabled. Please contact an administrator.');
            return;
        }

        if (err || !token || !userId || !role) {
            setError('Google login failed. Please try again or use your email/password.');
            return;
        }

        // Store session — same shape as normal login
        localStorage.setItem('tcms_token', token);
        localStorage.setItem('tcms_user', JSON.stringify({
            id: Number(userId),
            role,
            full_name: fullName || '',
        }));

        // Navigate to dashboard
        navigate('/', { replace: true });
    }, [searchParams, navigate]);

    if (error) {
        return (
            <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-4">
                <div className="flex items-center gap-3 text-red-600 bg-red-50 border border-red-200 rounded-xl px-6 py-4 shadow-sm">
                    <AlertCircle className="w-5 h-5 shrink-0" />
                    <p className="text-sm font-medium">{error}</p>
                </div>
                <button
                    onClick={() => navigate('/login')}
                    className="text-sm text-primary-600 hover:underline font-medium"
                >
                    ← Back to login
                </button>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
            <p className="text-sm text-slate-500 font-medium">Completing Google sign-in…</p>
        </div>
    );
}
