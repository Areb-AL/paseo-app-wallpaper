import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import { useRpc, useSettings } from "@getpaseo/plugin/client";
import {
  SettingsAction,
  SettingsCard,
  SettingsInput,
  SettingsRow,
  SettingsSection,
  SettingsSelect,
  SettingsSwitch,
} from "@getpaseo/plugin/client/ui";
import { useEffect, useRef, useState } from "react";
import { Text } from "react-native";
import { backgroundSettings, LEVELS, MAX_IMAGE_BYTES, UPLOAD_CHUNK_BYTES, uploadChunk, uploadFinish, uploadStart } from "../shared/background";
import { resolveLang, TEXTS, translateError, type LanguageSetting } from "./i18n";
import { getAppLocale, getLastError, refreshBackground } from "./state";
import { isWeb, pickImageFile, sharpness, toBase64, type Sharpness } from "./web";

type Values = {
  enabled: boolean;
  language: LanguageSetting;
  imagePath: string;
  fit: "cover" | "contain" | "blur";
  dim: number;
  leftShade: number;
  rightShade: number;
  bottomShade: number;
  panelShade: number;
};

export function BackgroundSettings({ theme }: PluginSurfaceProps) {
  const settings = useSettings(backgroundSettings);
  const pathInput = useRef<{ getText(): string; replaceText(text: string): void } | null>(null);
  const start = useRpc(uploadStart);
  const sendChunk = useRpc(uploadChunk);
  const finish = useRpc(uploadFinish);
  const [upload, setUpload] = useState<{ text: string; error?: string } | null>(null);
  const [info, setInfo] = useState<Sharpness | undefined>(() => sharpness());
  const [imageError, setImageError] = useState<string | null>(() => getLastError());
  // L'image se charge et la fenêtre change de taille : on relit la netteté et l'erreur chaque seconde.
  useEffect(() => {
    const timer = setInterval(() => {
      setInfo(sharpness());
      setImageError(getLastError());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  if (settings.status !== "ready") {
    const t = TEXTS[resolveLang("auto", getAppLocale())];
    const message = settings.status === "loading" ? t.loading : t.settingsInvalid + String((settings as { error?: unknown }).error ?? "");
    return <Text style={{ color: theme.colors.foregroundMuted }}>{message}</Text>;
  }

  const values = settings.values as Values;
  const lang = resolveLang(values.language ?? "auto", getAppLocale());
  const t = TEXTS[lang];
  const save = async (next: Partial<Values>) => {
    if (await settings.save({ ...values, ...next }, settings.revision)) refreshBackground();
  };

  const levelOptions = LEVELS.map((value) => ({ label: value === 0 ? t.none : Math.round(value * 100) + " %", value: String(value) }));
  const fitOptions = [
    { label: t.fitCover, value: "cover" },
    { label: t.fitBlur, value: "blur" },
    { label: t.fitContain, value: "contain" },
  ];
  const languageOptions = [
    { label: t.auto, value: "auto" },
    { label: "Français", value: "fr" },
    { label: "English", value: "en" },
  ];

  const sharpnessText = (): { text: string; error?: string } => {
    if (!info) return { text: t.sharpnessNone };
    const sizes = t.sizes(info.imageWidth, info.imageHeight, info.windowWidth, info.windowHeight);
    if (info.scale <= 1.02) return { text: sizes + t.sharp };
    const factor = lang === "fr" ? info.scale.toFixed(1).replace(".", ",") : info.scale.toFixed(1);
    return { text: sizes, error: t.blurry(factor, `${info.windowWidth} × ${info.windowHeight}`) };
  };
  const sharp = sharpnessText();

  // Choisir une image sur l'appareil : elle est envoyée au daemon par morceaux, puis utilisée.
  const chooseImage = async () => {
    const file = await pickImageFile();
    if (!file) return;
    if (file.size > MAX_IMAGE_BYTES) return setUpload({ text: file.name, error: t.errors.too_large });
    try {
      setUpload({ text: t.uploading(file.name, 0) });
      await start({ name: file.name, size: file.size });
      for (let offset = 0; offset < file.size; offset += UPLOAD_CHUNK_BYTES) {
        await sendChunk({ data: toBase64(file.bytes.subarray(offset, offset + UPLOAD_CHUNK_BYTES)) });
        const done = Math.min(100, Math.round(((offset + UPLOAD_CHUNK_BYTES) / file.size) * 100));
        setUpload({ text: t.uploading(file.name, done) });
      }
      const { path } = await finish({});
      pathInput.current?.replaceText(path);
      await save({ imagePath: path });
      setUpload({ text: t.uploaded(file.name) });
    } catch (error) {
      setUpload({ text: file.name, error: translateError(error instanceof Error ? error.message : String(error), lang) });
    }
  };

  return (
    <>
      <SettingsSection title={t.language}>
        <SettingsCard>
          <SettingsSelect
            label={t.language}
            hint={t.languageHint}
            value={values.language ?? "auto"}
            options={languageOptions}
            onValueChange={(language) => save({ language: language as LanguageSetting })}
          />
        </SettingsCard>
      </SettingsSection>
      <SettingsSection title={t.sectionWallpaper}>
        <SettingsCard>
          <SettingsSwitch label={t.show} hint={t.showHint} value={values.enabled} onValueChange={(enabled) => save({ enabled })} />
          {isWeb() ? <SettingsAction label={t.choose} hint={t.chooseHint} actionLabel={t.browse} onPress={chooseImage} /> : null}
          {upload ? <SettingsRow label={t.upload} hint={upload.text} error={upload.error} /> : null}
          <SettingsInput
            ref={pathInput as never}
            label={t.image}
            hint={t.imageHint}
            placeholder="~/Pictures/wallpaper.jpg"
            initialValue={values.imagePath}
            onChangeText={() => {}}
          />
          {imageError ? <SettingsRow label={t.imageError} error={translateError(imageError, lang)} /> : null}
          <SettingsAction label={t.change} actionLabel={t.apply} onPress={() => save({ imagePath: pathInput.current?.getText().trim() ?? "" })} />
          <SettingsSelect label={t.fit} hint={t.fitHint} value={values.fit} options={fitOptions} onValueChange={(fit) => save({ fit: fit as Values["fit"] })} />
          <SettingsRow label={t.sharpness} hint={sharp.text} error={sharp.error} />
        </SettingsCard>
      </SettingsSection>
      <SettingsSection title={t.sectionReadability}>
        <SettingsCard>
          <SettingsSelect label={t.left} hint={t.leftHint} value={String(values.leftShade)} options={levelOptions} onValueChange={(v) => save({ leftShade: Number(v) })} />
          <SettingsSelect label={t.right} hint={t.rightHint} value={String(values.rightShade)} options={levelOptions} onValueChange={(v) => save({ rightShade: Number(v) })} />
          <SettingsSelect label={t.bottom} hint={t.bottomHint} value={String(values.bottomShade)} options={levelOptions} onValueChange={(v) => save({ bottomShade: Number(v) })} />
          <SettingsSelect label={t.panels} hint={t.panelsHint} value={String(values.panelShade)} options={levelOptions} onValueChange={(v) => save({ panelShade: Number(v) })} />
          <SettingsSelect label={t.dim} hint={t.dimHint} value={String(values.dim)} options={levelOptions} onValueChange={(v) => save({ dim: Number(v) })} />
          {settings.saveError ? <SettingsRow label={t.error} error={String(settings.saveError)} /> : null}
        </SettingsCard>
      </SettingsSection>
    </>
  );
}
