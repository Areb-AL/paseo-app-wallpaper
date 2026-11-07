import { defineRpc, defineSettings } from "@getpaseo/plugin";
import { z } from "zod";

/** Niveaux proposés dans les réglages pour les voiles et les dégradés. */
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
    /** Langue de l'écran de réglages : auto (celle de Paseo), français ou anglais. */
    language: z.enum(["auto", "fr", "en"]).default("auto"),
    /** Chemin de l'image sur la machine du daemon (absolu ou avec ~). Vide : l'image fournie avec le plugin. */
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
    /** Mouvement lent de l'image (zoom et glissement doux). */
    motion: z.enum(["off", "slow", "medium"]).default("off"),
    /** Retouches appliquées à l'affichage (le fichier n'est pas modifié). */
    brightness: z.number().min(0.3).max(1.6).default(1),
    saturation: z.number().min(0).max(2).default(1),
    imageBlur: z.number().min(0).max(30).default(0),
    /** Point de cadrage : quelle partie de l'image garder quand elle est rognée. */
    focal: z.enum(["center", "top", "bottom", "left", "right"]).default("center"),
    /** Galerie d'images et changement automatique (minutes ; "off" : image fixe). */
    gallery: z.array(z.string()).max(50).default([]),
    rotation: z.enum(["off", "5", "15", "60", "1440"]).default("off"),
    /** Décalage ajouté par le bouton « Image suivante ». */
    rotationOffset: z.number().int().min(0).default(0),
    /** Image utilisée quand la fenêtre est plus haute que large (téléphone en version web, écran tourné). Vide : la même. */
    portraitImagePath: z.string().default(""),
    /** Écrans sans conversation (réglages, pages de plugins) : fond flouté, assombri, ou inchangé. */
    focus: z.enum(["blur", "dim", "off"]).default("blur"),
    /** Vitre dépolie derrière la colonne des messages : intensité du voile (0 = pas de vitre). */
    glass: level.default(0.45),
    /** Voile noir sur les panneaux qui ne sont pas une conversation : terminal, fichiers… */
    panelShade: level.default(0.85),
  }),
});

export const backgroundView = z.object({
  enabled: z.boolean(),
  /**
   * Le fichier à afficher (image ou vidéo), téléchargé ensuite par morceaux avec mediaChunk ;
   * null s'il n'a pas pu être lu. key identifie le fichier (chemin, date, taille).
   */
  media: z
    .object({
      key: z.string(),
      mime: z.string(),
      size: z.number(),
      kind: z.enum(["image", "video"]),
      chunks: z.number(),
    })
    .nullable(),
  error: z.string().nullable(),
  fit,
  dim: level,
  leftShade: level,
  rightShade: level,
  bottomShade: level,
  panelShade: level,
  focus: z.enum(["blur", "dim", "off"]),
  glass: level,
  /** Vrai si l'image envoyée est celle pour écran vertical. */
  portrait: z.boolean(),
  motion: z.enum(["off", "slow", "medium"]),
  brightness: z.number(),
  saturation: z.number(),
  imageBlur: z.number(),
  focal: z.enum(["center", "top", "bottom", "left", "right"]),
  /** Rotation : position dans la galerie et moment du prochain changement (ms, null si fixe). */
  galleryIndex: z.number().nullable(),
  nextChangeAt: z.number().nullable(),
});
export type BackgroundView = z.infer<typeof backgroundView>;

export const getBackground = defineRpc({
  name: "background.get",
  input: z.object({ portrait: z.boolean().default(false) }),
  output: backgroundView,
});

/** Outil de mise au point : le client envoie la structure de l'écran, le serveur l'écrit dans les logs. */
export const probeLayout = defineRpc({
  name: "debug.probe",
  input: z.object({ report: z.string().max(200_000) }),
  output: z.object({ ok: z.boolean() }),
});

/** Taille maximale d'une image ou d'une vidéo, partagée par la lecture et l'envoi. */
export const MAX_IMAGE_BYTES = 200 * 1024 * 1024;
/**
 * Taille d'un morceau envoyé (avant base64, soit environ 4 Mo une fois encodé) : bien sous la limite
 * d'Android (16 Mo par envoi). Les morceaux voyagent en base64 dans du JSON, car l'envoi binaire
 * (Uint8Array) demande une version de Paseo plus récente que 0.15.2.
 */
export const UPLOAD_CHUNK_BYTES = 3 * 1024 * 1024;

/** Envoi d'une image choisie dans l'appli : début (nom et taille), morceaux binaires, fin. */
export const uploadStart = defineRpc({
  name: "upload.start",
  input: z.object({
    name: z.string().min(1).max(255),
    size: z.number().int().positive().max(MAX_IMAGE_BYTES),
    /** Image principale ou image pour écran vertical. */
    slot: z.enum(["landscape", "portrait", "gallery"]).default("landscape"),
  }),
  output: z.object({ ok: z.boolean() }),
});

export const uploadChunk = defineRpc({
  name: "upload.chunk",
  input: z.object({ data: z.string().max(6 * 1024 * 1024) }),
  output: z.object({ received: z.number() }),
});

export const uploadFinish = defineRpc({
  name: "upload.finish",
  input: z.object({}),
  output: z.object({ path: z.string() }),
});

/** Retire une image de la galerie : supprime le fichier s'il a été envoyé avec Parcourir… */
export const galleryRemove = defineRpc({
  name: "gallery.remove",
  input: z.object({ path: z.string() }),
  output: z.object({ deleted: z.boolean() }),
});

/** Un morceau du fichier à afficher, en base64 (l'envoi binaire demande un Paseo plus récent que 0.15.2). */
export const mediaChunk = defineRpc({
  name: "media.chunk",
  input: z.object({ key: z.string(), index: z.number().int().min(0) }),
  output: z.object({ data: z.string() }),
});
