import { useEffect, useRef, useState } from 'react';
import { Camera, Check, Trash2, Upload, User } from 'lucide-react';
import type { UserProfile } from '../types/foco';
import { getProfileInitials } from '../utils/focoStorage';
import { formatXp, getLevelProgress } from '../utils/xp';
import { AccountSection } from '../cloud/AccountSection';

interface ProfileViewProps {
  profile: UserProfile;
  totalXp: number;
  tasksCompletedCount: number;
  journalDaysCount: number;
  vicesCount: number;
  onSaveProfile: (nextProfile: UserProfile, toastMessage?: string) => void;
}

const AVATAR_SIZE = 320;
const MAX_DIRECT_DATA_URL_LENGTH = 180_000;

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Invalid file result'));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

async function processProfileImage(file: File): Promise<string> {
  const rawDataUrl = await readFileAsDataUrl(file);

  if (typeof document === 'undefined' || typeof Image === 'undefined') {
    return rawDataUrl;
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = AVATAR_SIZE;
        canvas.height = AVATAR_SIZE;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(rawDataUrl);
          return;
        }

        const minSide = Math.min(img.width, img.height);
        const sx = Math.max(0, (img.width - minSide) / 2);
        const sy = Math.max(0, (img.height - minSide) / 2);

        ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
        const compressed = canvas.toDataURL('image/jpeg', 0.85);
        resolve(compressed.startsWith('data:image/') ? compressed : rawDataUrl);
      } catch {
        resolve(rawDataUrl.length <= MAX_DIRECT_DATA_URL_LENGTH ? rawDataUrl : rawDataUrl);
      }
    };
    img.onerror = () => resolve(rawDataUrl);
    img.src = rawDataUrl;
  });
}

export function ProfileView({
  profile,
  totalXp,
  tasksCompletedCount,
  journalDaysCount,
  vicesCount,
  onSaveProfile,
}: ProfileViewProps) {
  const [nameDraft, setNameDraft] = useState(profile.name);
  const [photoDraft, setPhotoDraft] = useState<string | null>(profile.photoDataUrl);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [imgBroken, setImgBroken] = useState(false);
  const [isProcessingPhoto, setIsProcessingPhoto] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setNameDraft(profile.name);
    setPhotoDraft(profile.photoDataUrl);
    setImgBroken(false);
  }, [profile.name, profile.photoDataUrl]);

  const levelSummary = getLevelProgress(totalXp);
  const displayName = nameDraft.trim() || 'Seu nome';
  const initials = getProfileInitials(nameDraft);
  const hasUnsavedName = nameDraft.trim() !== profile.name;
  const hasPhoto = Boolean(photoDraft && !imgBroken);

  async function handleFileSelected(file: File | undefined) {
    if (!file) return;
    setPhotoError(null);

    if (!file.type.startsWith('image/')) {
      setPhotoError('Selecione um arquivo de imagem válido (JPG, PNG ou WEBP).');
      return;
    }

    setIsProcessingPhoto(true);
    try {
      const processedUrl = await processProfileImage(file);
      if (!processedUrl.startsWith('data:image/')) {
        setPhotoError('Não foi possível processar essa imagem.');
        return;
      }
      setImgBroken(false);
      setPhotoDraft(processedUrl);
      onSaveProfile(
        {
          name: nameDraft.trim().slice(0, 60),
          photoDataUrl: processedUrl,
          updatedAt: Date.now(),
        },
        'Foto de perfil atualizada!'
      );
    } catch {
      setPhotoError('Não foi possível carregar essa imagem. Tente outro arquivo.');
    } finally {
      setIsProcessingPhoto(false);
    }
  }

  function handleRemovePhoto() {
    setPhotoError(null);
    setImgBroken(false);
    setPhotoDraft(null);
    onSaveProfile(
      {
        name: nameDraft.trim().slice(0, 60),
        photoDataUrl: null,
        updatedAt: Date.now(),
      },
      'Foto de perfil removida'
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const cleanName = nameDraft.trim().slice(0, 60);
    setNameDraft(cleanName);
    onSaveProfile(
      {
        name: cleanName,
        photoDataUrl: photoDraft,
        updatedAt: Date.now(),
      },
      cleanName ? `Perfil salvo para ${cleanName}!` : 'Perfil salvo!'
    );
  }

  return (
    <main className="flex-1 w-full max-w-[1280px] mx-auto px-4 sm:px-6 py-6 sm:py-8">
      <div className="mb-6">
        <p className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">
          Identidade e progresso pessoal
        </p>
        <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white mt-0.5">
          Seu Perfil
        </h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Live Profile Preview */}
        <section
          aria-label="Pré-visualização do perfil"
          className="lg:col-span-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs p-6 space-y-6"
        >
          <div className="flex flex-col items-center text-center space-y-4">
            <div className="relative">
              <div className="w-32 h-32 rounded-full overflow-hidden bg-slate-100 dark:bg-slate-800 border-2 border-indigo-500/40 flex items-center justify-center shadow-sm">
                {hasPhoto && photoDraft ? (
                  <img
                    src={photoDraft}
                    alt={nameDraft.trim() ? `Foto de ${nameDraft.trim()}` : 'Foto do perfil'}
                    referrerPolicy="no-referrer"
                    onError={() => setImgBroken(true)}
                    className="w-full h-full object-cover"
                  />
                ) : initials ? (
                  <span className="text-3xl font-extrabold tracking-tight text-indigo-600 dark:text-indigo-300 select-none">
                    {initials}
                  </span>
                ) : (
                  <User className="w-12 h-12 text-slate-400 dark:text-slate-500" />
                )}
              </div>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                aria-label="Alterar foto do perfil"
                title="Escolher foto do perfil"
                className="absolute bottom-0 right-0 w-10 h-10 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white border-2 border-white dark:border-slate-900 shadow-md flex items-center justify-center transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
              >
                <Camera className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-1 max-w-full">
              <h3
                className={`text-xl font-bold tracking-tight truncate ${
                  nameDraft.trim()
                    ? 'text-slate-900 dark:text-white'
                    : 'text-slate-400 dark:text-slate-500'
                }`}
              >
                {displayName}
              </h3>
              <p className="text-xs font-medium text-indigo-600 dark:text-indigo-400">
                Nível {levelSummary.currentLevel.level} · {levelSummary.currentLevel.title}
              </p>
            </div>
          </div>

          <div className="pt-5 border-t border-slate-200/80 dark:border-slate-800 grid grid-cols-2 gap-4 text-left">
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">XP acumulado</p>
              <p className="text-lg font-bold text-slate-900 dark:text-white tabular-nums mt-0.5">
                {formatXp(totalXp)} XP
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">Conclusões totais</p>
              <p className="text-lg font-bold text-slate-900 dark:text-white tabular-nums mt-0.5">
                {tasksCompletedCount}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">Dias no diário</p>
              <p className="text-lg font-bold text-slate-900 dark:text-white tabular-nums mt-0.5">
                {journalDaysCount}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">Vícios monitorados</p>
              <p className="text-lg font-bold text-slate-900 dark:text-white tabular-nums mt-0.5">
                {vicesCount}
              </p>
            </div>
          </div>
        </section>

        {/* Right: Edit Form */}
        <section
          aria-label="Editar foto e nome"
          className="lg:col-span-7 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs p-6"
        >
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                Foto e Nome
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Suas informações ficam salvas localmente neste navegador.
              </p>
            </div>

            {/* Photo uploader */}
            <div className="space-y-2.5">
              <span className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Foto de perfil
              </span>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  void handleFileSelected(file);
                  e.target.value = '';
                }}
              />

              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                  const file = e.dataTransfer.files?.[0];
                  void handleFileSelected(file);
                }}
                className={`rounded-xl border border-dashed p-4 transition-colors flex flex-wrap items-center justify-between gap-4 ${
                  isDragging
                    ? 'border-indigo-500 bg-indigo-50/70 dark:bg-indigo-950/40'
                    : 'border-slate-300 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-950/50'
                }`}
              >
                <div className="space-y-0.5 min-w-0">
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                    {isProcessingPhoto
                      ? 'Processando imagem...'
                      : hasPhoto
                        ? 'Foto configurada'
                        : 'Envie ou arraste uma imagem aqui'}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    JPG, PNG ou WEBP · ajustada automaticamente para caber com nitidez
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={isProcessingPhoto}
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <Upload className="w-3.5 h-3.5 shrink-0" />
                    <span>{hasPhoto ? 'Trocar foto' : 'Escolher foto'}</span>
                  </button>

                  {hasPhoto && (
                    <button
                      type="button"
                      onClick={handleRemovePhoto}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 border border-rose-500/20 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5 shrink-0" />
                      <span>Remover</span>
                    </button>
                  )}
                </div>
              </div>

              {photoError && (
                <p role="alert" className="text-xs font-medium text-rose-600 dark:text-rose-400">
                  {photoError}
                </p>
              )}
            </div>

            {/* Name field */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <label
                  htmlFor="profile-name-input"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  Seu nome
                </label>
                <span className="text-[11px] text-slate-400 dark:text-slate-500 tabular-nums">
                  {nameDraft.length}/60
                </span>
              </div>
              <input
                id="profile-name-input"
                type="text"
                maxLength={60}
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                placeholder="Digite como você quer ser chamado..."
                className="w-full rounded-xl bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 border border-slate-200 dark:border-slate-800 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500"
              />
            </div>

            <div className="pt-3 border-t border-slate-200/80 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {hasUnsavedName
                  ? 'Clique em Salvar perfil para confirmar o novo nome.'
                  : 'Tudo sincronizado.'}
              </span>

              <button
                type="submit"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <Check className="w-4 h-4 shrink-0" />
                <span>Salvar perfil</span>
              </button>
            </div>
          </form>
        </section>
      </div>

      <AccountSection />
    </main>
  );
}
