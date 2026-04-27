import { User, RegistrationData } from '../types';

export class AuthService {
    /**
     * Validates if a string is a properly formatted email.
     * Uses a standard regex pattern for email validation.
     */
    public static validateEmail(email: string): { isValid: boolean; error?: string } {
        if (!email.includes('@')) return { isValid: false, error: 'O e-mail deve conter "@".' };

        const parts = email.split('@');
        if (parts.length > 2) return { isValid: false, error: 'O e-mail deve conter apenas um "@".' };

        const [username, domain] = parts;

        if (!domain.includes('.')) return { isValid: false, error: 'O domínio do e-mail deve conter um ponto (".").' };

        if (username.length === 0) return { isValid: false, error: 'O nome de usuário não pode ser vazio.' };
        if (username.length > 64) return { isValid: false, error: 'O nome de usuário pode ter no máximo 64 caracteres.' };

        if (domain.length === 0) return { isValid: false, error: 'O domínio não pode ser vazio.' };
        if (domain.length > 255) return { isValid: false, error: 'O domínio pode ter no máximo 255 caracteres.' };

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) return { isValid: false, error: 'Formato de e-mail inválido.' };

        return { isValid: true };
    }

    /**
     * Validates if a string is a properly formatted phone number.
     * Example allows formats like (11) 99999-9999, 11999999999, +55 11 99999-9999
     */
    public static validatePhone(phone: string): boolean {
        const digitsOnly = phone.replace(/\D/g, '');
        return digitsOnly.length === 11;
    }

    /**
     * Validates password strength:
     * - At least 8 characters
     * - Contains at least one uppercase letter
     * - Contains at least one number
     * - Contains at least one special character
     */
    public static validatePasswordStrength(password: string): { isValid: boolean; error?: string } {
        if (password.length < 8) return { isValid: false, error: 'A senha deve ter no mínimo 8 caracteres.' };
        if (!/[A-Z]/.test(password)) return { isValid: false, error: 'A senha deve conter ao menos uma letra maiúscula.' };
        if (!/[0-9]/.test(password)) return { isValid: false, error: 'A senha deve conter ao menos um número.' };
        if (!/[!@#$%^&*]/.test(password)) return { isValid: false, error: 'A senha deve conter ao menos um caractere especial.' };
        return { isValid: true };
    }

    private static readonly API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

    public static setTokens(accessToken: string, refreshToken: string) {
        localStorage.setItem('access_token', accessToken);
        localStorage.setItem('refresh_token', refreshToken);
    }

    public static getAccessToken() {
        return localStorage.getItem('access_token');
    }

    public static getRefreshToken() {
        return localStorage.getItem('refresh_token');
    }

    public static clearTokens() {
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
    }

    private static decodeJwtPayload(token: string): Record<string, unknown> | null {
        try {
            const parts = token.split('.');
            if (parts.length < 2) return null;

            const base64Url = parts[1];
            const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
            const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
            const decoded = atob(padded);
            return JSON.parse(decoded);
        } catch {
            return null;
        }
    }

    private static getStringClaim(
        payload: Record<string, unknown>,
        claimKeys: string[]
    ): string | undefined {
        for (const key of claimKeys) {
            const value = payload[key];
            if (typeof value === 'string' && value.trim()) {
                return value.trim();
            }
        }
        return undefined;
    }

    private static buildUserFromPayload(payload: Record<string, unknown>): User | null {
        const subject = payload.sub;
        if (typeof subject !== 'string' || !subject.trim()) {
            return null;
        }

        const firstName = AuthService.getStringClaim(payload, ['first_name', 'firstName', 'given_name']);
        const lastName = AuthService.getStringClaim(payload, ['last_name', 'lastName', 'family_name']);
        const fullName = [firstName, lastName].filter(Boolean).join(' ').trim();
        const emailFromClaim = AuthService.getStringClaim(payload, ['email']);
        const email = emailFromClaim || (subject.includes('@') ? subject : undefined);

        return {
            id: subject,
            username: fullName || email || subject,
            firstName,
            lastName,
            email
        };
    }

    public static getUserFromAccessToken(): User | null {
        const token = AuthService.getAccessToken();
        if (!token) return null;

        const payload = AuthService.decodeJwtPayload(token);
        if (!payload) return null;
        return AuthService.buildUserFromPayload(payload);
    }

    public static async restoreSession(): Promise<User | null> {
        const accessToken = AuthService.getAccessToken();

        if (accessToken) {
            const payload = AuthService.decodeJwtPayload(accessToken);
            const exp = typeof payload?.exp === 'number' ? payload.exp : null;
            const isExpired = exp !== null && Date.now() >= exp * 1000;

            if (!isExpired) {
                const user = AuthService.getUserFromAccessToken();
                if (user) return user;
            }
        }

        if (!AuthService.getRefreshToken()) return null;

        const refreshed = await AuthService.refreshTokens();
        if (!refreshed) return null;

        return AuthService.getUserFromAccessToken();
    }

    /**
     * Fetch wraper to automatically inject the access token and try refreshing if a 401 is received.
     */
    public static async fetchWithAuth(endpoint: string, options: RequestInit = {}): Promise<Response> {
        let token = AuthService.getAccessToken();
        let headers = { ...options.headers } as any;

        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        let response = await fetch(`${AuthService.API_URL}${endpoint}`, { ...options, headers });

        if (response.status === 401) {
            if (AuthService.getRefreshToken()) {
                const refreshed = await AuthService.refreshTokens();
                if (refreshed) {
                    token = AuthService.getAccessToken();
                    headers['Authorization'] = `Bearer ${token}`;
                    response = await fetch(`${AuthService.API_URL}${endpoint}`, { ...options, headers });
                } else {
                    AuthService.clearTokens();
                    window.dispatchEvent(new Event('auth:unauthorized'));
                }
            } else {
                AuthService.clearTokens();
                window.dispatchEvent(new Event('auth:unauthorized'));
            }
        }
        return response;
    }

    public static async refreshTokens(): Promise<boolean> {
        const refreshToken = AuthService.getRefreshToken();
        if (!refreshToken) return false;

        try {
            const response = await fetch(`${AuthService.API_URL}/auth/refresh?refresh_token=${encodeURIComponent(refreshToken)}`, {
                method: 'POST',
            });
            if (response.ok) {
                const data = await response.json();
                AuthService.setTokens(data.access_token, data.refresh_token);
                return true;
            }
        } catch (e) {
            console.error('Failed to refresh tokens', e);
        }
        return false;
    }

    public static async logout(): Promise<void> {
        try {
            await AuthService.fetchWithAuth('/auth/logout', { method: 'POST' });
        } catch (e) {
            console.error('Logout error', e);
        } finally {
            AuthService.clearTokens();
        }
    }

    /**
     * Executes registration with the backend API.
     */
    public static async register(data: RegistrationData): Promise<{ success: boolean; user?: User; error?: string }> {
        try {
            const payload = {
                first_name: data.firstName,
                last_name: data.lastName,
                email: data.email,
                password: data.password
            };

            const response = await fetch(`${this.API_URL}/auth/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const responseData = await response.json();

            if (response.ok) {
                const newUser: User = {
                    id: String(responseData.id),
                    username: `${responseData.first_name} ${responseData.last_name}`,
                    firstName: responseData.first_name,
                    lastName: responseData.last_name,
                    email: responseData.email,
                    phone: data.phone,
                    createdAt: new Date().toISOString()
                };
                return { success: true, user: newUser };
            } else {
                if (response.status === 429) {
                    return { success: false, error: 'Muitas tentativas. Tente novamente mais tarde.' };
                }
                return { success: false, error: responseData.detail || 'Erro ao registrar usuário.' };
            }
        } catch (error) {
            return { success: false, error: 'Erro de conexão com o servidor.' };
        }
    }

    /**
     * Executes login to receive JWT tokens.
     */
    public static async login(username: string, password?: string): Promise<{ success: boolean; user?: User; error?: string }> {
        if (!password) {
            return { success: false, error: 'A senha é obrigatória.' };
        }

        try {
            const formData = new URLSearchParams();
            formData.append('username', username);
            formData.append('password', password);

            const response = await fetch(`${this.API_URL}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: formData
            });

            const responseData = await response.json();

            if (response.ok) {
                AuthService.setTokens(responseData.access_token, responseData.refresh_token);

                const user = AuthService.getUserFromAccessToken() || {
                    id: username, // fallback if token payload is unavailable
                    username: username,
                    email: username
                };
                return { success: true, user };
            } else {
                if (response.status === 429) {
                    return { success: false, error: 'Muitas tentativas. Tente novamente mais tarde.' };
                }
                return { success: false, error: responseData.detail || 'Credenciais inválidas.' };
            }
        } catch (error) {
            return { success: false, error: 'Erro de conexão com o servidor.' };
        }
    }
}
