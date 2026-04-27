import React, { useState } from 'react';
import Login from './Login';
import Register from './Register';

import { User } from '../types';

interface AuthScreenProps {
    onLogin: (user: User) => void;
}

const AuthScreen: React.FC<AuthScreenProps> = ({ onLogin }) => {
    // Determine which view to show: 'login' or 'register'
    const [view, setView] = useState<'login' | 'register'>('login');

    const handleGoToRegister = () => setView('register');
    const handleGoToLogin = () => setView('login');

    const handleRegisterSuccess = (_user: User) => {
        // Register does not return JWT tokens, so we safely redirect to login.
        setView('login');
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-background transition-colors duration-300 p-4">
            {view === 'login' && (
                <div className="w-full max-w-md animate-in fade-in zoom-in-95 duration-300">
                    <Login onLogin={onLogin} onGoToRegister={handleGoToRegister} />
                </div>
            )}
            {view === 'register' && (
                <div className="w-full max-w-md">
                    <Register onRegisterSuccess={handleRegisterSuccess} onGoToLogin={handleGoToLogin} />
                </div>
            )}
        </div>
    );
};

export default AuthScreen;
