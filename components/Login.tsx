import React, { useState } from 'react';
import { AppLanguage, i18n, User } from '../types';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

interface LoginProps {
  language: AppLanguage;
  onLogin: (user: User, token: string) => void;
  onLanguageChange: (lang: AppLanguage) => void;
}

const Login: React.FC<LoginProps> = ({ language, onLogin, onLanguageChange }) => {
  const [isRegister, setIsRegister] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const t = (key: string) => i18n[language][key] || key;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const endpoint = isRegister ? '/api/auth/register' : '/api/auth/login';
      const body = isRegister 
        ? { username, password, displayName: displayName || username }
        : { username, password };

      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Authentication failed');
      }

      // App.tsx will handle storing token in localStorage
      onLogin(data.user, data.token);
    } catch (err: any) {
      setError(err.message || 'Authentication failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-wonbiz-black flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="w-12 h-12 bg-wonbiz-accent rounded-xl flex items-center justify-center">
            <span className="text-wonbiz-black font-bold text-2xl">W</span>
          </div>
          <h1 className="text-2xl font-bold text-white">WonBiz AI</h1>
        </div>

        {/* Card */}
        <div className="bg-wonbiz-dark border border-wonbiz-gray/30 rounded-2xl p-8">
          <h2 className="text-xl font-semibold text-white text-center mb-2">
            {isRegister ? t('registerTitle') : t('loginTitle')}
          </h2>
          <p className="text-wonbiz-gray text-center text-sm mb-6">
            {isRegister ? t('registerSubtitle') : t('loginSubtitle')}
          </p>

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 mb-4">
              <p className="text-red-400 text-sm text-center">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm text-wonbiz-gray mb-2">{t('username')}</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-wonbiz-black border border-wonbiz-gray/50 rounded-lg px-4 py-3 text-white placeholder-wonbiz-gray/50 focus:outline-none focus:border-wonbiz-accent transition-colors"
                placeholder={t('username')}
                required
                minLength={3}
                disabled={isLoading}
              />
            </div>

            {isRegister && (
              <div>
                <label className="block text-sm text-wonbiz-gray mb-2">{t('displayName')}</label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full bg-wonbiz-black border border-wonbiz-gray/50 rounded-lg px-4 py-3 text-white placeholder-wonbiz-gray/50 focus:outline-none focus:border-wonbiz-accent transition-colors"
                  placeholder={t('displayName')}
                  disabled={isLoading}
                />
              </div>
            )}

            <div>
              <label className="block text-sm text-wonbiz-gray mb-2">{t('password')}</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-wonbiz-black border border-wonbiz-gray/50 rounded-lg px-4 py-3 text-white placeholder-wonbiz-gray/50 focus:outline-none focus:border-wonbiz-accent transition-colors"
                placeholder="••••••••"
                required
                minLength={6}
                disabled={isLoading}
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-wonbiz-accent text-wonbiz-black font-medium py-3 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading 
                ? (isRegister ? t('registering') : t('loggingIn'))
                : (isRegister ? t('register') : t('login'))
              }
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-wonbiz-gray text-sm">
              {isRegister ? t('hasAccount') : t('noAccount')}{' '}
              <button
                onClick={() => {
                  setIsRegister(!isRegister);
                  setError('');
                }}
                className="text-wonbiz-accent hover:underline font-medium"
                disabled={isLoading}
              >
                {isRegister ? t('signIn') : t('signUp')}
              </button>
            </p>
          </div>
        </div>

        {/* Language toggle */}
        <div className="flex justify-center gap-4 mt-6">
          <button
            onClick={() => onLanguageChange('en')}
            className={`text-sm ${language === 'en' ? 'text-wonbiz-accent' : 'text-wonbiz-gray hover:text-white'}`}
          >
            English
          </button>
          <span className="text-wonbiz-gray">|</span>
          <button
            onClick={() => onLanguageChange('zh')}
            className={`text-sm ${language === 'zh' ? 'text-wonbiz-accent' : 'text-wonbiz-gray hover:text-white'}`}
          >
            中文
          </button>
        </div>
      </div>
    </div>
  );
};

export default Login;
