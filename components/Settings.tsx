import React, { useState } from 'react';
import { LLMConfig, AppLanguage, i18n } from '../types';
import { llmOptions } from '../services/assistantService';
import { ChevronLeftIcon } from './Icons';

interface SettingsProps {
  llmConfig: LLMConfig;
  onConfigChange: (config: LLMConfig) => void;
  language: AppLanguage;
  onLanguageChange: (language: AppLanguage) => void;
  onBack: () => void;
}

const Settings: React.FC<SettingsProps> = ({ llmConfig, onConfigChange, language, onLanguageChange, onBack }) => {
  const [localConfig, setLocalConfig] = useState<LLMConfig>(llmConfig);
  const [localLanguage, setLocalLanguage] = useState<AppLanguage>(language);
  const [showApiKeys, setShowApiKeys] = useState(false);

  // Get translated text
  const t = (key: string) => i18n[localLanguage][key] || key;

  const handleProviderChange = (provider: LLMConfig['provider']) => {
    const newConfig = {
      provider,
      model: llmOptions[provider].models[0],
    };
    setLocalConfig(newConfig);
  };

  const handleModelChange = (model: string) => {
    setLocalConfig(prev => ({ ...prev, model }));
  };

  const handleSave = () => {
    onConfigChange(localConfig);
    onLanguageChange(localLanguage);
    onBack();
  };

  const apiKeyStatus = {
    openai: !!import.meta.env.VITE_OPENAI_API_KEY,
    grok: !!import.meta.env.VITE_GROK_API_KEY,
    gemini: !!import.meta.env.VITE_GEMINI_API_KEY,
    assemblyai: !!import.meta.env.VITE_ASSEMBLYAI_API_KEY,
    llamacloud: !!import.meta.env.VITE_LLAMA_CLOUD_API_KEY,
  };

  return (
    <div className="h-full bg-wonbiz-black animate-fade-in flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b border-wonbiz-gray/30">
        <button
          onClick={onBack}
          className="p-2 hover:bg-wonbiz-gray/20 rounded-lg transition-colors"
        >
          <ChevronLeftIcon className="w-5 h-5 text-wonbiz-gray" />
        </button>
        <h1 className="text-white font-medium">{t('settings')}</h1>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Language Selection */}
          <div>
            <h3 className="text-sm font-mono uppercase text-wonbiz-gray mb-3">{t('language')}</h3>
            <div className="flex gap-2">
              <button
                onClick={() => setLocalLanguage('en')}
                className={`flex-1 p-3 rounded-xl border text-center transition-all ${
                  localLanguage === 'en'
                    ? 'border-wonbiz-accent bg-wonbiz-accent/10 text-wonbiz-accent'
                    : 'border-wonbiz-gray hover:border-wonbiz-gray/80 hover:bg-wonbiz-gray/20 text-white'
                }`}
              >
                {t('english')}
              </button>
              <button
                onClick={() => setLocalLanguage('zh')}
                className={`flex-1 p-3 rounded-xl border text-center transition-all ${
                  localLanguage === 'zh'
                    ? 'border-wonbiz-accent bg-wonbiz-accent/10 text-wonbiz-accent'
                    : 'border-wonbiz-gray hover:border-wonbiz-gray/80 hover:bg-wonbiz-gray/20 text-white'
                }`}
              >
                {t('chinese')}
              </button>
            </div>
          </div>

          {/* LLM Provider Selection */}
          <div>
            <h3 className="text-sm font-mono uppercase text-wonbiz-gray mb-3">{t('llmProvider')}</h3>
            <div className="space-y-2">
              {Object.entries(llmOptions).map(([key, value]) => (
                <button
                  key={key}
                  onClick={() => handleProviderChange(key as LLMConfig['provider'])}
                  className={`w-full p-4 rounded-xl border text-left transition-all ${
                    localConfig.provider === key
                      ? 'border-wonbiz-accent bg-wonbiz-accent/10'
                      : 'border-wonbiz-gray hover:border-wonbiz-gray/80 hover:bg-wonbiz-gray/20'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className={`font-medium ${localConfig.provider === key ? 'text-wonbiz-accent' : 'text-white'}`}>
                        {value.label}
                      </p>
                      <p className="text-xs text-wonbiz-gray mt-1">
                        {value.models.length} {localLanguage === 'zh' ? '个模型可用' : `model${value.models.length > 1 ? 's' : ''} available`}
                      </p>
                    </div>
                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                      localConfig.provider === key ? 'border-wonbiz-accent' : 'border-wonbiz-gray'
                    }`}>
                      {localConfig.provider === key && (
                        <div className="w-2 h-2 rounded-full bg-wonbiz-accent" />
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Model Selection */}
          <div>
            <h3 className="text-sm font-mono uppercase text-wonbiz-gray mb-3">{t('model')}</h3>
            <select
              value={localConfig.model}
              onChange={(e) => handleModelChange(e.target.value)}
              className="w-full bg-wonbiz-black border border-wonbiz-gray rounded-xl px-4 py-3 text-white focus:outline-none focus:border-wonbiz-accent transition-colors"
            >
              {llmOptions[localConfig.provider].models.map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
          </div>

          {/* API Key Status */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-mono uppercase text-wonbiz-gray">{t('apiKeyStatus')}</h3>
              <button
                onClick={() => setShowApiKeys(!showApiKeys)}
                className="text-xs text-wonbiz-accent hover:underline"
              >
                {showApiKeys ? (localLanguage === 'zh' ? '隐藏' : 'Hide') : (localLanguage === 'zh' ? '显示' : 'Show')}
              </button>
            </div>
            
            {showApiKeys && (
              <div className="space-y-2 bg-wonbiz-black rounded-xl p-4 border border-wonbiz-gray">
                <ApiKeyRow label="OpenAI" configured={apiKeyStatus.openai} envVar="VITE_OPENAI_API_KEY" />
                <ApiKeyRow label="Grok (xAI)" configured={apiKeyStatus.grok} envVar="VITE_GROK_API_KEY" />
                <ApiKeyRow label="Gemini" configured={apiKeyStatus.gemini} envVar="VITE_GEMINI_API_KEY" />
                <div className="border-t border-wonbiz-gray my-2 pt-2">
                  <ApiKeyRow label="AssemblyAI" configured={apiKeyStatus.assemblyai} envVar="VITE_ASSEMBLYAI_API_KEY" />
                  <ApiKeyRow label="LlamaCloud" configured={apiKeyStatus.llamacloud} envVar="VITE_LLAMA_CLOUD_API_KEY" />
                </div>
                <p className="text-xs text-wonbiz-gray mt-3">
                  {localLanguage === 'zh' 
                    ? 'API 密钥通过 .env 文件中的环境变量配置。' 
                    : <>API keys are configured via environment variables in your <code className="bg-wonbiz-gray/50 px-1 rounded">.env</code> file.</>}
                </p>
              </div>
            )}
          </div>

          {/* Current Configuration Summary */}
          <div className="bg-wonbiz-black rounded-xl p-4 border border-wonbiz-gray">
            <h3 className="text-sm font-mono uppercase text-wonbiz-gray mb-2">{t('currentConfig')}</h3>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-white">{localLanguage === 'zh' ? '提供商:' : 'Provider:'}</span>
              <span className="text-wonbiz-accent">{llmOptions[localConfig.provider].label}</span>
            </div>
            <div className="flex items-center gap-2 text-sm mt-1">
              <span className="text-white">{localLanguage === 'zh' ? '模型:' : 'Model:'}</span>
              <span className="text-wonbiz-accent font-mono">{localConfig.model}</span>
            </div>
            <div className="flex items-center gap-2 text-sm mt-1">
              <span className="text-white">{localLanguage === 'zh' ? '语言:' : 'Language:'}</span>
              <span className="text-wonbiz-accent">{localLanguage === 'zh' ? '中文' : 'English'}</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end p-6 border-t border-wonbiz-gray/30">
          <button
            onClick={handleSave}
            className="px-6 py-3 rounded-lg bg-wonbiz-accent text-wonbiz-black font-medium hover:bg-wonbiz-accent/90 transition-colors"
          >
            {t('save')}
          </button>
        </div>
    </div>
  );
};

const ApiKeyRow: React.FC<{ label: string; configured: boolean; envVar: string }> = ({ label, configured, envVar }) => (
  <div className="flex items-center justify-between py-1">
    <div className="flex items-center gap-2">
      <div className={`w-2 h-2 rounded-full ${configured ? 'bg-green-500' : 'bg-red-500'}`} />
      <span className="text-sm text-white">{label}</span>
    </div>
    <code className="text-xs text-wonbiz-gray">{envVar}</code>
  </div>
);

export default Settings;
