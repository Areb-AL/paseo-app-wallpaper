App Wallpaper met une image en fond de toute l'application Paseo et ajoute par-dessus des calques réglables pour que l'interface reste lisible : un dégradé derrière la barre latérale, un derrière le panneau ancré à droite, un derrière la zone d'écriture, un voile sur toute l'image et un voile sur les panneaux annexes comme le terminal ou l'explorateur de fichiers. L'image elle-même n'est jamais modifiée : vous pouvez la changer à tout moment.

## Fonctionnement

Les dégradés suivent la vraie mise en page. Le plugin mesure la barre latérale, le panneau de droite et la zone d'écriture, et ajuste les dégradés quand vous les redimensionnez. Les conversations restent dégagées pour laisser voir l'image ; les cartes de messages, la zone d'écriture, les fenêtres et les menus gardent leur propre fond. Les grands panneaux qui ne sont pas une conversation reçoivent le voile des panneaux annexes.

Trois modes de cadrage sont proposés : remplir la fenêtre (rogne un peu), image entière avec bords flous, ou image entière avec bandes noires. Un indicateur de netteté compare la taille de l'image à celle de la fenêtre et prévient quand l'image est agrandie.

## Mise en place

Nécessite Paseo 0.15.2 ou plus récent. Ouvrez App Wallpaper depuis la barre latérale ou depuis les réglages du plugin, puis indiquez le chemin d'une image sur la machine où tourne le daemon Paseo (par exemple `~/Pictures/fond.jpg`). Les formats JPG, PNG, WebP et GIF animé sont acceptés, jusqu'à 20 Mo. Sans chemin, une image fournie en 5120 × 1440 est utilisée. Pour un rendu net, choisissez une image au moins aussi grande que votre fenêtre, en paysage.

Le fond s'affiche dans l'application de bureau (testée sur macOS et Windows ; Linux utilise la même application mais n'a pas été testé) et dans l'application web. Les applications iOS et Android sont natives et n'ont pas de page à modifier : le plugin n'y a aucun effet. L'écran de réglages est en français.

## Données et autorisations

- Le daemon lit le fichier image au chemin indiqué, seulement s'il a une extension d'image et pèse 20 Mo au plus, puis l'envoie aux applications Paseo connectées à ce daemon. L'image n'est envoyée nulle part ailleurs.
- Le plugin lit le fichier de configuration de Paseo (`$PASEO_HOME/config.json`) pour trouver son dossier d'installation et l'image fournie.
- Les réglages sont enregistrés par Paseo sur la machine du daemon et partagés par toutes les applications qui y sont connectées.
- Le plugin ne fait aucune requête réseau, ne collecte aucune donnée et n'envoie rien aux fournisseurs d'agents.
- Dans les applications de bureau et web, il ajoute une feuille de style et quelques attributs à l'interface de Paseo. Il s'appuie sur des repères internes de l'interface de Paseo qui ne sont pas une API publique : une mise à jour de Paseo peut empêcher une partie de s'appliquer jusqu'à la mise à jour du plugin.
