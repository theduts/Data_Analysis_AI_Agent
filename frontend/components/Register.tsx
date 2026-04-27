import React, { useState } from 'react';
import { User as UserIcon, Mail, Phone, KeyRound, AlertCircle, CheckCircle2, Eye, EyeOff } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Card, CardHeader, CardContent, CardFooter, CardTitle, CardDescription } from './ui/card';
import { Spinner } from './ui/spinner';
import { AuthService } from '../services/authService';

import { User } from '../types';

interface RegisterProps {
    onRegisterSuccess: (user: User) => void;
    onGoToLogin: () => void;
}

const Register: React.FC<RegisterProps> = ({ onRegisterSuccess, onGoToLogin }) => {
    // Form state
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [isCapsLockOn, setIsCapsLockOn] = useState(false);

    const checkCapsLock = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.getModifierState) {
            setIsCapsLockOn(e.getModifierState('CapsLock'));
        }
    };

    // Feedback state
    const [errors, setErrors] = useState<{ [key: string]: string }>({});
    const [isLoading, setIsLoading] = useState(false);
    const [generalError, setGeneralError] = useState('');

    const validateForm = () => {
        const newErrors: { [key: string]: string } = {};

        if (!firstName.trim()) newErrors.firstName = 'O nome é obrigatório.';
        if (!lastName.trim()) newErrors.lastName = 'O sobrenome é obrigatório.';

        if (!email.trim()) {
            newErrors.email = 'O e-mail é obrigatório.';
        } else {
            const emailValidation = AuthService.validateEmail(email);
            if (!emailValidation.isValid) {
                newErrors.email = emailValidation.error || 'Insira um e-mail válido.';
            }
        }

        if (!phone.trim()) {
            newErrors.phone = 'O telefone é obrigatório.';
        } else if (!AuthService.validatePhone(phone)) {
            newErrors.phone = 'Insira um telefone válido com 11 dígitos, incluindo o DDD.';
        }

        const passwordValidation = AuthService.validatePasswordStrength(password);
        if (!passwordValidation.isValid) {
            newErrors.password = passwordValidation.error || 'Senha fraca.';
        }

        if (password !== confirmPassword) {
            newErrors.confirmPassword = 'As senhas não coincidem.';
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (isLoading) return;
        setGeneralError('');

        if (validateForm()) {
            setIsLoading(true);
            try {
                const response = await AuthService.register({
                    firstName,
                    lastName,
                    email,
                    phone,
                    password
                });

                if (response.success && response.user) {
                    onRegisterSuccess(response.user);
                } else {
                    setGeneralError(response.error || 'Erro ao registrar usuário.');
                }
            } catch (error) {
                setGeneralError('Ocorreu um erro inesperado.');
            } finally {
                setIsLoading(false);
            }
        }
    };

    return (
        <Card className="w-full max-w-md shadow-xl animate-in fade-in zoom-in-95 duration-300">
            <CardHeader className="items-center text-center space-y-3 pb-4">
                <div className="flex justify-center">
                    <img src="components/image/logo2.png" alt="D'Artagnan Logo" className="w-14 h-14 object-contain" />
                </div>
                <CardTitle className="text-2xl">Criar Conta</CardTitle>
                <CardDescription>Junte-se ao D'Artagnan AI Chat</CardDescription>
            </CardHeader>

            <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                            <label className="text-sm font-medium leading-none">Nome</label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <UserIcon className="h-4 w-4 text-muted-foreground" />
                                </div>
                                <Input
                                    type="text"
                                    value={firstName}
                                    onChange={(e) => setFirstName(e.target.value)}
                                    className={`pl-10 ${errors.firstName ? 'border-destructive' : ''}`}
                                    placeholder="Nome"
                                    disabled={isLoading}
                                    maxLength={50}
                                />
                            </div>
                            {errors.firstName && <p className="text-xs text-destructive">{errors.firstName}</p>}
                        </div>

                        <div className="space-y-1">
                            <label className="text-sm font-medium leading-none">Sobrenome</label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <UserIcon className="h-4 w-4 text-muted-foreground" />
                                </div>
                                <Input
                                    type="text"
                                    value={lastName}
                                    onChange={(e) => setLastName(e.target.value)}
                                    className={`pl-10 ${errors.lastName ? 'border-destructive' : ''}`}
                                    placeholder="Sobrenome"
                                    disabled={isLoading}
                                    maxLength={50}
                                />
                            </div>
                            {errors.lastName && <p className="text-xs text-destructive">{errors.lastName}</p>}
                        </div>
                    </div>

                    <div className="space-y-1">
                        <label className="text-sm font-medium leading-none">E-mail</label>
                        <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <Mail className="h-4 w-4 text-muted-foreground" />
                            </div>
                            <Input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className={`pl-10 ${errors.email ? 'border-destructive' : ''}`}
                                placeholder="email@exemplo.com"
                                disabled={isLoading}
                                maxLength={320}
                            />
                        </div>
                        {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
                    </div>

                    <div className="space-y-1">
                        <label className="text-sm font-medium leading-none">Telefone</label>
                        <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <Phone className="h-4 w-4 text-muted-foreground" />
                            </div>
                            <Input
                                type="tel"
                                value={phone}
                                onChange={(e) => setPhone(e.target.value)}
                                className={`pl-10 ${errors.phone ? 'border-destructive' : ''}`}
                                placeholder="(11) 99999-9999"
                                disabled={isLoading}
                                maxLength={20}
                            />
                        </div>
                        {errors.phone && <p className="text-xs text-destructive">{errors.phone}</p>}
                    </div>

                    <div className="space-y-1">
                        <label className="text-sm font-medium leading-none">Senha</label>
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
                                className={`pl-10 pr-10 ${errors.password ? 'border-destructive' : ''}`}
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
                            <p className="text-xs text-amber-500 mt-0.5 flex items-center gap-1">
                                <AlertCircle className="h-3 w-3" />
                                Caps Lock está ativado
                            </p>
                        )}
                        {errors.password && <p className="text-xs text-destructive">{errors.password}</p>}
                    </div>

                    <div className="space-y-1">
                        <label className="text-sm font-medium leading-none">Confirmar Senha</label>
                        <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
                            </div>
                            <Input
                                type={showPassword ? "text" : "password"}
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                onKeyDown={checkCapsLock}
                                onKeyUp={checkCapsLock}
                                className={`pl-10 pr-10 ${errors.confirmPassword ? 'border-destructive' : ''}`}
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
                            <p className="text-xs text-amber-500 mt-0.5 flex items-center gap-1">
                                <AlertCircle className="h-3 w-3" />
                                Caps Lock está ativado
                            </p>
                        )}
                        {errors.confirmPassword && !errors.password && <p className="text-xs text-destructive">{errors.confirmPassword}</p>}
                    </div>

                    {generalError && (
                        <div className="text-destructive text-sm text-center flex items-center justify-center gap-2 bg-destructive/10 p-2.5 rounded-md">
                            <AlertCircle className="h-4 w-4" />
                            {generalError}
                        </div>
                    )}

                    <Button
                        type="submit"
                        className="w-full mt-2"
                        disabled={isLoading}
                        aria-busy={isLoading}
                        aria-label={isLoading ? 'Cadastrando' : 'Criar Conta'}
                    >
                        {isLoading ? (
                            <span className="relative inline-flex items-center justify-center">
                                <span className="invisible">Criar Conta</span>
                                <Spinner className="absolute" label="Cadastrando" />
                            </span>
                        ) : (
                            'Criar Conta'
                        )}
                    </Button>
                </form>
            </CardContent>

            <CardFooter className="justify-center border-t pt-4 text-sm text-muted-foreground">
                <p>
                    Já tem uma conta?{' '}
                    <button
                        onClick={onGoToLogin}
                        className="font-medium text-foreground/80 hover:text-foreground hover:underline focus:outline-none"
                    >
                        Entrar
                    </button>
                </p>
            </CardFooter>
        </Card>
    );
};

export default Register;
