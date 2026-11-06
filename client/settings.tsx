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
import { backgroundSettings, galleryRemove, LEVELS, MAX_IMAGE_BYTES, UPLOAD_CHUNK_BYTES, uploadChunk, uploadFinish, uploadStart } from "../shared/background";
import { resolveLang, TEXTS, translateError, type LanguageSetting } from "./i18n";
import { getAppLocale, getLastError, refreshBackground } from "./state";
import { isWeb, pickImageFile, sharpness, toBase64, type Sharpness } from "./web";

type Values = {
  enabled: boolean;
  language: LanguageSetting;
  imagePath: string;
  portraitImagePath: string;
  focus: "blur" | "dim" | "off";
  glass: number;
  motion: "off" | "slow" | "medium";
  brightness: number;
  saturation: number;
  imageBlur: number;
  focal: "center" | "top" | "bottom" | "left" | "right";
  gallery: string[];
  rotation: "off" | "5" | "15" | "60" | "1440";
  rotationOffset: number;
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
  const portraitInput = useRef<{ getText(): string; replaceText(text: string): void } | null>(null);
  const start = useRpc(uploadStart);
  const sendChunk = useRpc(uploadChunk);
  const finish = useRpc(uploadFinish);
  const removeFile = useRpc(galleryRemove);
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
  const focusOptions = [
    { label: t.focusBlur, value: "blur" },
    { label: t.focusDim, value: "dim" },
    { label: t.focusOff, value: "off" },
  ];
  const pick = <T extends string>(entries: Array<[T, string]>) => entries.map(([value, label]) => ({ value, label }));
  const focalOptions = pick([["center", t.focalCenter], ["top", t.focalTop], ["bottom", t.focalBottom], ["left", t.focalLeft], ["right", t.focalRight]]);
  const motionOptions = pick([["off", t.motionOff], ["slow", t.motionSlow], ["medium", t.motionMedium]]);
  const rotationOptions = pick([["off", t.rotationOff], ["5", t.rotation5], ["15", t.rotation15], ["60", t.rotation60], ["1440", t.rotation1440]]);
  const percent = (values: number[]) => values.map((v) => ({ value: String(v), label: Math.round(v * 100) + " %" }));
  const brightnessOptions = percent([0.5, 0.7, 0.85, 1, 1.15, 1.3]);
  const saturationOptions = percent([0, 0.5, 0.8, 1, 1.2, 1.5]);
  const blurOptions = [0, 2, 4, 8, 16].map((v) => ({ value: String(v), label: v === 0 ? t.none : v + " px" }));
  const gallery = values.gallery ?? [];
  const fileName = (path: string) => path.split(/[\\/]/).pop() ?? path;
  const removeFromGallery = async (path: string) => {
    await save({ gallery: gallery.filter((p) => p !== path) });
    removeFile({ path }).catch(() => {});
  };

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
  const chooseImage = async (slot: "landscape" | "portrait" | "gallery") => {
    const file = await pickImageFile();
    if (!file) return;
    if (file.size > MAX_IMAGE_BYTES) return setUpload({ text: file.name, error: t.errors.too_large });
    try {
      setUpload({ text: t.uploading(file.name, 0) });
      await start({ name: file.name, size: file.size, slot });
      for (let offset = 0; offset < file.size; offset += UPLOAD_CHUNK_BYTES) {
        await sendChunk({ data: toBase64(file.bytes.subarray(offset, offset + UPLOAD_CHUNK_BYTES)) });
        const done = Math.min(100, Math.round(((offset + UPLOAD_CHUNK_BYTES) / file.size) * 100));
        setUpload({ text: t.uploading(file.name, done) });
      }
      const { path } = await finish({});
      if (slot === "gallery") {
        await save({ gallery: [...(values.gallery ?? []), path] });
      } else if (slot === "portrait") {
        portraitInput.current?.replaceText(path);
        await save({ portraitImagePath: path });
      } else {
        pathInput.current?.replaceText(path);
        await save({ imagePath: path });
      }
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
          {isWeb() ? <SettingsAction label={t.choose} hint={t.chooseHint} actionLabel={t.browse} onPress={() => chooseImage("landscape")} /> : null}
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
      <SettingsSection title={t.sectionLook}>
        <SettingsCard>
          <SettingsSelect label={t.motion} hint={t.motionHint} value={values.motion ?? "off"} options={motionOptions} onValueChange={(v) => save({ motion: v as Values["motion"] })} />
          <SettingsSelect label={t.focal} hint={t.focalHint} value={values.focal ?? "center"} options={focalOptions} onValueChange={(v) => save({ focal: v as Values["focal"] })} />
          <SettingsSelect label={t.brightness} value={String(values.brightness ?? 1)} options={brightnessOptions} onValueChange={(v) => save({ brightness: Number(v) })} />
          <SettingsSelect label={t.saturation} value={String(values.saturation ?? 1)} options={saturationOptions} onValueChange={(v) => save({ saturation: Number(v) })} />
          <SettingsSelect label={t.imageBlur} hint={t.imageBlurHint} value={String(values.imageBlur ?? 0)} options={blurOptions} onValueChange={(v) => save({ imageBlur: Number(v) })} />
        </SettingsCard>
      </SettingsSection>
      <SettingsSection title={t.sectionGallery}>
        <SettingsCard>
          <SettingsSelect label={t.rotation} hint={t.rotationHint} value={values.rotation ?? "off"} options={rotationOptions} onValueChange={(v) => save({ rotation: v as Values["rotation"] })} />
          {isWeb() ? <SettingsAction label={t.galleryAdd} hint={t.chooseHint} actionLabel={t.browse} onPress={() => chooseImage("gallery")} /> : null}
          {values.imagePath && !gallery.includes(values.imagePath) ? (
            <SettingsAction label={t.galleryAddCurrent} hint={t.galleryAddCurrentHint} actionLabel={t.add} onPress={() => save({ gallery: [...gallery, values.imagePath] })} />
          ) : null}
          {gallery.length > 1 ? (
            <SettingsAction label={t.next} actionLabel={t.nextAction} onPress={() => save({ rotationOffset: (values.rotationOffset ?? 0) + 1 })} />
          ) : null}
          {gallery.length === 0 ? <SettingsRow label={t.galleryEmpty} /> : null}
          {gallery.map((path, i) => (
            <SettingsAction key={path} label={`${i + 1}. ${fileName(path)}`} hint={path} actionLabel={t.remove} onPress={() => removeFromGallery(path)} />
          ))}
        </SettingsCard>
      </SettingsSection>
      <SettingsSection title={t.sectionPortrait}>
        <SettingsCard>
          {isWeb() ? <SettingsAction label={t.portraitImage} hint={t.chooseHint} actionLabel={t.browse} onPress={() => chooseImage("portrait")} /> : null}
          <SettingsInput
            ref={portraitInput as never}
            label={t.image}
            hint={t.portraitHint}
            placeholder="~/Pictures/wallpaper-portrait.jpg"
            initialValue={values.portraitImagePath}
            onChangeText={() => {}}
          />
          <SettingsAction label={t.change} actionLabel={t.apply} onPress={() => save({ portraitImagePath: portraitInput.current?.getText().trim() ?? "" })} />
        </SettingsCard>
      </SettingsSection>
      <SettingsSection title={t.sectionReadability}>
        <SettingsCard>
          <SettingsSelect label={t.left} hint={t.leftHint} value={String(values.leftShade)} options={levelOptions} onValueChange={(v) => save({ leftShade: Number(v) })} />
          <SettingsSelect label={t.right} hint={t.rightHint} value={String(values.rightShade)} options={levelOptions} onValueChange={(v) => save({ rightShade: Number(v) })} />
          <SettingsSelect label={t.bottom} hint={t.bottomHint} value={String(values.bottomShade)} options={levelOptions} onValueChange={(v) => save({ bottomShade: Number(v) })} />
          <SettingsSelect label={t.panels} hint={t.panelsHint} value={String(values.panelShade)} options={levelOptions} onValueChange={(v) => save({ panelShade: Number(v) })} />
          <SettingsSelect label={t.glass} hint={t.glassHint} value={String(values.glass)} options={levelOptions} onValueChange={(v) => save({ glass: Number(v) })} />
          <SettingsSelect label={t.focus} hint={t.focusHint} value={values.focus} options={focusOptions} onValueChange={(v) => save({ focus: v as Values["focus"] })} />
          <SettingsSelect label={t.dim} hint={t.dimHint} value={String(values.dim)} options={levelOptions} onValueChange={(v) => save({ dim: Number(v) })} />
          {settings.saveError ? <SettingsRow label={t.error} error={String(settings.saveError)} /> : null}
        </SettingsCard>
      </SettingsSection>
    </>
  );
}
