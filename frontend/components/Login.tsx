import React, { useState } from 'react';
import { User as UserIcon, KeyRound, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Card, CardHeader, CardContent, CardFooter, CardTitle, CardDescription } from './ui/card';
import { Spinner } from './ui/spinner';
import { AuthService } from '../services/authService';

import { User } from '../types';

interface LoginProps {
    onLogin: (user: User) => void;
    onGoToRegister: () => void;
}

const Login: React.FC<LoginProps> = ({ onLogin, onGoToRegister }) => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [isCapsLockOn, setIsCapsLockOn] = useState(false);

    const checkCapsLock = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.getModifierState) {
            setIsCapsLockOn(e.getModifierState('CapsLock'));
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (isLoading) return;
        setError('');

        if (username.trim() && password.trim()) {
            const emailValidation = AuthService.validateEmail(username);
            if (!emailValidation.isValid) {
                setError(emailValidation.error || 'Insira um e-mail válido.');
                return;
            }

            setIsLoading(true);
            try {
                const result = await AuthService.login(username, password);
                if (result.success && result.user) {
                    onLogin(result.user);
                } else {
                    setError(result.error || 'Erro ao realizar login');
                }
            } catch (err) {
                setError('Ocorreu um erro no login.');
            } finally {
                setIsLoading(false);
            }
        } else {
            setError('Por favor, insira o usuário e a senha.');
        }
    };

    return (
        <Card className="w-full h-full shadow-none border-0 bg-transparent">
            <CardHeader className="items-center text-center space-y-3">
                <div className="flex justify-center">
                    <img src="components/image/logo2.png" alt="D'Artagnan Logo" className="w-16 h-16 object-contain" />
                </div>
                <CardTitle className="text-2xl">D'Artagnan AI Chat</CardTitle>
                <CardDescription>Login</CardDescription>
            </CardHeader>

            <CardContent>
                <form onSubmit={handleSubmit} className="space-y-5">
                    <div className="space-y-2">
                        <label className="text-sm font-medium leading-none">
                            Usuário
                        </label>
                        <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <UserIcon className="h-4 w-4 text-muted-foreground" />
                            </div>
                            <Input
                                type="text"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                className="pl-10"
                                placeholder="E-mail"
                                disabled={isLoading}
                                maxLength={320}
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium leading-none">
                            Senha
                        </label>
                        <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <KeyRound className="h-4 w-4 text-muted-foreground" />
                            </div>
                            <Input
                                type={showPassword ? "text" : "password"}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                onKeyDown={checkCapsLock}
                                onKeyUp={checkCapsLock}
                                className="pl-10 pr-10"
                                placeholder="Senha"
                                disabled={isLoading}
                                maxLength={32}
                            />
                            <button
                                type="button"
                                className="absolute inset-y-0 right-0 pr-3 flex items-center justify-center text-muted-foreground hover:text-foreground focus:outline-none"
                                onClick={() => setShowPassword(!showPassword)}
                            >
                                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                        </div>
                        {isCapsLockOn && (
                            <p className="text-xs text-amber-500 mt-1 flex items-center gap-1">
                                <AlertCircle className="h-3 w-3" />
                                Caps Lock está ativado
                            </p>
                        )}
                    </div>

                    {error && (
                        <div className="text-destructive text-sm text-center flex items-center justify-center gap-2 bg-destructive/10 p-2.5 rounded-md">
                            <AlertCircle className="h-4 w-4" />
                            {error}
                        </div>
                    )}

                    <Button
                        type="submit"
                        className="w-full mt-2"
                        disabled={isLoading}
                        aria-busy={isLoading}
                        aria-label={isLoading ? 'Entrando' : 'Entrar'}
                    >
                        {isLoading ? (
                            <span className="relative inline-flex items-center justify-center">
                                <span className="invisible">Entrar</span>
                                <Spinner className="absolute" label="Entrando" />
                            </span>
                        ) : (
                            'Entrar'
                        )}
                    </Button>
                </form>
            </CardContent>

            <CardFooter className="justify-center border-t pt-4 text-sm text-muted-foreground">
                <p>
                    Não tem uma conta?{' '}
                    <button
                        onClick={onGoToRegister}
                        type="button"
                        className="font-medium text-foreground/80 hover:text-foreground hover:underline focus:outline-none"
                    >
                        Cadastre-se
                    </button>
                </p>
            </CardFooter>
        </Card>
    );
};

export default Login;
