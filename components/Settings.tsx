import React, { useState } from 'react';
import { LLMConfig } from '../types';
import { llmOptions } from '../services/assistantService';

interface SettingsProps {
  llmConfig: LLMConfig;
  onConfigChange: (config: LLMConfig) => void;
  onClose: () => void;
}

const Settings: React.FC<SettingsProps> = ({ llmConfig, onConfigChange, onClose }) => {
  const [localConfig, setLocalConfig] = useState<LLMConfig>(llmConfig);
  const [showApiKeys, setShowApiKeys] = useState(false);

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
    onClose();
  };

  const apiKeyStatus = {
    openai: !!import.meta.env.VITE_OPENAI_API_KEY,
    grok: !!import.meta.env.VITE_GROK_API_KEY,
    gemini: !!import.meta.env.VITE_GEMINI_API_KEY,
    assemblyai: !!import.meta.env.VITE_ASSEMBLYAI_API_KEY,
    llamacloud: !!import.meta.env.VITE_LLAMA_CLOUD_API_KEY,
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-plaud-dark border border-plaud-gray rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-plaud-gray">
          <h2 className="text-xl font-semibold text-white">Settings</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-plaud-gray rounded-lg transition-colors"
          >
            <svg className="w-5 h-5 text-plaud-gray" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* LLM Provider Selection */}
          <div>
            <h3 className="text-sm font-mono uppercase text-plaud-gray mb-3">LLM Provider</h3>
            <div className="space-y-2">
              {Object.entries(llmOptions).map(([key, value]) => (
                <button
                  key={key}
                  onClick={() => handleProviderChange(key as LLMConfig['provider'])}
                  className={`w-full p-4 rounded-xl border text-left transition-all ${
                    localConfig.provider === key
                      ? 'border-plaud-accent bg-plaud-accent/10'
                      : 'border-plaud-gray hover:border-plaud-gray/80 hover:bg-plaud-gray/20'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className={`font-medium ${localConfig.provider === key ? 'text-plaud-accent' : 'text-white'}`}>
                        {value.label}
                      </p>
                      <p className="text-xs text-plaud-gray mt-1">
                        {value.models.length} model{value.models.length > 1 ? 's' : ''} available
                      </p>
                    </div>
                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                      localConfig.provider === key ? 'border-plaud-accent' : 'border-plaud-gray'
                    }`}>
                      {localConfig.provider === key && (
                        <div className="w-2 h-2 rounded-full bg-plaud-accent" />
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Model Selection */}
          <div>
            <h3 className="text-sm font-mono uppercase text-plaud-gray mb-3">Model</h3>
            <select
              value={localConfig.model}
              onChange={(e) => handleModelChange(e.target.value)}
              className="w-full bg-plaud-black border border-plaud-gray rounded-xl px-4 py-3 text-white focus:outline-none focus:border-plaud-accent transition-colors"
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
              <h3 className="text-sm font-mono uppercase text-plaud-gray">API Key Status</h3>
              <button
                onClick={() => setShowApiKeys(!showApiKeys)}
                className="text-xs text-plaud-accent hover:underline"
              >
                {showApiKeys ? 'Hide' : 'Show'}
              </button>
            </div>
            
            {showApiKeys && (
              <div className="space-y-2 bg-plaud-black rounded-xl p-4 border border-plaud-gray">
                <ApiKeyRow label="OpenAI" configured={apiKeyStatus.openai} envVar="VITE_OPENAI_API_KEY" />
                <ApiKeyRow label="Grok (xAI)" configured={apiKeyStatus.grok} envVar="VITE_GROK_API_KEY" />
                <ApiKeyRow label="Gemini" configured={apiKeyStatus.gemini} envVar="VITE_GEMINI_API_KEY" />
                <div className="border-t border-plaud-gray my-2 pt-2">
                  <ApiKeyRow label="AssemblyAI" configured={apiKeyStatus.assemblyai} envVar="VITE_ASSEMBLYAI_API_KEY" />
                  <ApiKeyRow label="LlamaCloud" configured={apiKeyStatus.llamacloud} envVar="VITE_LLAMA_CLOUD_API_KEY" />
                </div>
                <p className="text-xs text-plaud-gray mt-3">
                  API keys are configured via environment variables in your <code className="bg-plaud-gray/50 px-1 rounded">.env</code> file.
                </p>
              </div>
            )}
          </div>

          {/* Current Configuration Summary */}
          <div className="bg-plaud-black rounded-xl p-4 border border-plaud-gray">
            <h3 className="text-sm font-mono uppercase text-plaud-gray mb-2">Current Configuration</h3>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-white">Provider:</span>
              <span className="text-plaud-accent">{llmOptions[localConfig.provider].label}</span>
            </div>
            <div className="flex items-center gap-2 text-sm mt-1">
              <span className="text-white">Model:</span>
              <span className="text-plaud-accent font-mono">{localConfig.model}</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-plaud-gray">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-plaud-gray text-white hover:bg-plaud-gray/30 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 rounded-lg bg-plaud-accent text-plaud-black font-medium hover:bg-plaud-accent/90 transition-colors"
          >
            Save Changes
          </button>
        </div>
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
    <code className="text-xs text-plaud-gray">{envVar}</code>
  </div>
);

export default Settings;
