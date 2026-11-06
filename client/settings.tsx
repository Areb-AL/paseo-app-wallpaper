import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import { useSettings } from "@getpaseo/plugin/client";
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
import { backgroundSettings, LEVELS } from "../shared/background";
import { getLastError, refreshBackground } from "./state";
import { sharpness, type Sharpness } from "./web";

function sharpnessText(info: Sharpness | undefined): { text: string; error?: string } {
  if (!info) return { text: "Disponible sur l'appli Mac une fois l'image affichée." };
  const sizes = `Image ${info.imageWidth} × ${info.imageHeight} · fenêtre ${info.windowWidth} × ${info.windowHeight}`;
  if (info.scale <= 1.02) return { text: sizes + " : nette (réduite ou à taille réelle)." };
  const factor = info.scale.toFixed(1).replace(".", ",");
  const need = `${info.windowWidth} × ${info.windowHeight}`;
  return { text: sizes, error: `Agrandie ×${factor} : elle sera floue. Prends une image d'au moins ${need}.` };
}

type Values = { enabled: boolean; imagePath: string; fit: "cover" | "contain" | "blur"; dim: number; leftShade: number; rightShade: number; bottomShade: number; panelShade: number };

const levelOptions = LEVELS.map((value) => ({ label: value === 0 ? "Aucun" : Math.round(value * 100) + " %", value: String(value) }));
const fitOptions = [
  { label: "Remplir la fenêtre", value: "cover" },
  { label: "Image entière, bords flous", value: "blur" },
  { label: "Image entière, bandes noires", value: "contain" },
];

export function BackgroundSettings({ theme }: PluginSurfaceProps) {
  const settings = useSettings(backgroundSettings);
  const pathInput = useRef<{ getText(): string } | null>(null);
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
    const message =
      settings.status === "loading" ? "Chargement…" : "Réglages illisibles : " + String((settings as { error?: unknown }).error ?? "");
    return <Text style={{ color: theme.colors.foregroundMuted }}>{message}</Text>;
  }

  const values = settings.values as Values;
  const save = async (next: Partial<Values>) => {
    if (await settings.save({ ...values, ...next }, settings.revision)) refreshBackground();
  };

  return (
    <>
      <SettingsSection title="Fond d'écran">
        <SettingsCard>
          <SettingsSwitch label="Afficher le fond" hint="Appli Mac et version web uniquement" value={values.enabled} onValueChange={(enabled) => save({ enabled })} />
          <SettingsInput
            ref={pathInput as never}
            label="Image"
            hint="Chemin sur le Mac (jpg, png, gif ou webp). Vide : l'image fournie avec le plugin."
            placeholder="~/Pictures/fond.jpg"
            initialValue={values.imagePath}
            onChangeText={() => {}}
          />
          {imageError ? <SettingsRow label="Image introuvable" error={imageError} /> : null}
          <SettingsAction label="Changer l'image" actionLabel="Appliquer" onPress={() => save({ imagePath: pathInput.current?.getText().trim() ?? "" })} />
          <SettingsSelect label="Cadrage" hint="Remplir rogne un peu l'image ; « bords flous » la montre entière sans bandes noires" value={values.fit} options={fitOptions} onValueChange={(fit) => save({ fit: fit as Values["fit"] })} />
          <SettingsRow label="Netteté" hint={sharpnessText(info).text} error={sharpnessText(info).error} />
        </SettingsCard>
      </SettingsSection>
      <SettingsSection title="Lisibilité">
        <SettingsCard>
          <SettingsSelect label="Dégradé à gauche" hint="Derrière la barre latérale et ses boutons" value={String(values.leftShade)} options={levelOptions} onValueChange={(v) => save({ leftShade: Number(v) })} />
          <SettingsSelect label="Dégradé à droite" hint="Derrière le panneau de droite (fichiers…)" value={String(values.rightShade)} options={levelOptions} onValueChange={(v) => save({ rightShade: Number(v) })} />
          <SettingsSelect label="Dégradé en bas" hint="Derrière la zone d'écriture" value={String(values.bottomShade)} options={levelOptions} onValueChange={(v) => save({ bottomShade: Number(v) })} />
          <SettingsSelect label="Panneaux annexes" hint="Terminal, fichiers et autres panneaux hors conversation" value={String(values.panelShade)} options={levelOptions} onValueChange={(v) => save({ panelShade: Number(v) })} />
          <SettingsSelect label="Voile sur l'image" hint="Assombrit toute l'image pour le texte du chat" value={String(values.dim)} options={levelOptions} onValueChange={(v) => save({ dim: Number(v) })} />
          {settings.saveError ? (
            <SettingsRow label="Erreur" error={String(settings.saveError)} />
          ) : null}
        </SettingsCard>
      </SettingsSection>
    </>
  );
}
