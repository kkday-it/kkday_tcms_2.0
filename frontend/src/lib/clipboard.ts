/**
 * Copy plain text to the clipboard with a fallback path that works on HTTP.
 *
 * `navigator.clipboard.writeText` only works in a secure context (HTTPS or
 * localhost). TCMS' SIT deploy is served over plain HTTP, so the modern API
 * is `undefined` there and the user just sees "nothing happened" when they
 * click the copy-link icon (the bug behind KQT-15399).
 *
 * The fallback is the legacy `document.execCommand('copy')` against a
 * temporarily-inserted hidden <textarea>. It's deprecated but still works in
 * every browser that ships TCMS, and unlike the Async Clipboard API it has
 * no secure-context requirement.
 *
 * Returns `true` on success so the caller can show feedback only when the
 * copy actually landed (no more silent successes that confuse users).
 */
export async function copyToClipboard(text: string): Promise<boolean> {
    // Modern path: only when both the API and a secure context are present.
    // We don't rely on the API throwing in HTTP — some browsers leave it
    // available but reject the call, others omit it entirely; checking
    // isSecureContext is the cheap up-front gate.
    if (
        typeof navigator !== 'undefined'
        && navigator.clipboard
        && typeof window !== 'undefined'
        && window.isSecureContext
    ) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch {
            // fall through to the execCommand fallback
        }
    }

    // Fallback: hidden textarea + document.execCommand('copy'). Works on HTTP.
    if (typeof document === 'undefined') return false;
    const ta = document.createElement('textarea');
    ta.value = text;
    // Keep the element off-screen-ish but still focusable; some browsers
    // require it to be inside the viewport to honour the copy command.
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '0';
    ta.style.left = '0';
    ta.style.width = '2em';
    ta.style.height = '2em';
    ta.style.padding = '0';
    ta.style.border = 'none';
    ta.style.outline = 'none';
    ta.style.boxShadow = 'none';
    ta.style.background = 'transparent';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    try {
        ta.focus({ preventScroll: true });
        ta.select();
        ta.setSelectionRange(0, text.length);
        return document.execCommand('copy');
    } catch {
        return false;
    } finally {
        document.body.removeChild(ta);
    }
}
