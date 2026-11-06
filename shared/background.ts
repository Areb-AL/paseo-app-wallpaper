import { defineRpc, defineSettings } from "@getpaseo/plugin";
import { z } from "zod";

/** Niveaux proposés dans les réglages pour l'assombrissement et les deux dégradés. */
export const LEVELS = [0, 0.25, 0.45, 0.65, 0.85, 1] as const;

/** cover : remplit (rogne) ; contain : image entière (bandes noires) ; blur : image entière, bandes floutées. */
const fit = z.enum(["cover", "contain", "blur"]);
const level = z.number().min(0).max(1);

export const backgroundSettings = defineSettings({
  id: "background",
  scope: "host",
  version: 1,
  schema: z.object({
    enabled: z.boolean().default(true),
    /** Chemin de l'image sur le Mac (absolu ou avec ~). Vide : l'image fournie avec le plugin. */
    imagePath: z.string().default(""),
    fit: fit.default("cover"),
    /** Voile noir sur toute l'image, pour garder le texte lisible. */
    dim: level.default(0.45),
    /** Dégradé noir à gauche, derrière la barre latérale. */
    leftShade: level.default(0.85),
    /** Dégradé noir à droite, derrière le panneau de droite (fichiers…). */
    rightShade: level.default(0.85),
    /** Dégradé noir en bas, derrière la zone d'écriture. */
    bottomShade: level.default(0.85),
    /** Voile noir (et léger flou) sur les panneaux qui ne sont pas une conversation : terminal, fichiers… */
    panelShade: level.default(0.85),
  }),
});

export const backgroundView = z.object({
  enabled: z.boolean(),
  /** Image encodée en data URL ; null si elle n'a pas pu être lue. */
  dataUrl: z.string().nullable(),
  /** Identifie l'image (chemin + date de modification) pour éviter de la reposer pour rien. */
  imageKey: z.string(),
  error: z.string().nullable(),
  fit,
  dim: level,
  leftShade: level,
  rightShade: level,
  bottomShade: level,
  panelShade: level,
});
export type BackgroundView = z.infer<typeof backgroundView>;

export const getBackground = defineRpc({
  name: "background.get",
  input: z.object({}),
  output: backgroundView,
});

/** Outil de mise au point : le client envoie la structure de l'écran, le serveur l'écrit dans les logs. */
export const probeLayout = defineRpc({
  name: "debug.probe",
  input: z.object({ report: z.string().max(200_000) }),
  output: z.object({ ok: z.boolean() }),
});
