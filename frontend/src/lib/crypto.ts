// SHA-256：使用 crypto-js，相容 HTTP 環境（crypto.subtle 僅在 HTTPS 可用）
import CryptoJS from 'crypto-js';

export async function sha256(message: string): Promise<string> {
    return CryptoJS.SHA256(message).toString(CryptoJS.enc.Hex);
}
