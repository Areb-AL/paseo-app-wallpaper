#!/bin/bash
set -euo pipefail
# Usage : upscale.sh entree sortie.png modele decalage_vertical
# Le decalage est mesure apres rotation et redimensionnement, en pixels.
if [ "$#" -ne 4 ]; then
  echo "Usage: $0 input output.png model crop_offset" >&2
  exit 2
fi
python3 - "$@" <<'PY'
import math
from pathlib import Path
import struct
import shutil
import subprocess
import sys
import tempfile
import time

source, destination, model, offset = sys.argv[1:]
models = ('realesrgan-x4plus', 'realesrgan-x4plus-anime')
if model not in models:
    sys.exit('Modele attendu : ' + ' ou '.join(models))
try:
    offset = int(offset)
    if offset < 0:
        raise ValueError
except ValueError:
    sys.exit('Le decalage doit etre un entier positif ou nul.')
source = Path(source).resolve()
destination = Path(destination).resolve()
if not source.is_file() or destination.suffix.lower() != '.png':
    sys.exit('Entree introuvable ou sortie non PNG.')
if source == destination:
    sys.exit('La sortie doit etre differente de la source.')
base = Path.home() / '.local/opt/realesrgan-20220424'
ffmpeg = '/opt/homebrew/bin/ffmpeg'
started = time.monotonic()
# Limite globale : aucun sous-processus ne reste actif apres 80 secondes.
def run(arguments):
    remaining = 80 - (time.monotonic() - started)
    if remaining <= 0:
        raise TimeoutError('Limite globale de 80 secondes atteinte.')
    subprocess.run(arguments, check=True, timeout=remaining)

def png_size(path):
    with open(path, 'rb') as handle:
        header = handle.read(24)
    if header[:8] != b'\x89PNG\r\n\x1a\n':
        raise ValueError('Intermediaire PNG invalide.')
    return struct.unpack('>II', header[16:24])

try:
    with tempfile.TemporaryDirectory(prefix='holo-upscale-', dir='/tmp') as temp:
        upscaled = str(Path(temp) / 'x4.png')
        result = str(Path(temp) / 'wallpaper.png')
        # Agrandissement neuronal x4, tuiles de 256 pixels sur le GPU.
        run([str(base / 'realesrgan-ncnn-vulkan'), '-i', str(source),
             '-o', upscaled, '-n', model, '-m', str(base / 'models'),
             '-s', '4', '-t', '256'])
        upscale_seconds = time.monotonic() - started
        width, height = png_size(upscaled)
        scaled_height = math.floor(5120 * width / height + 0.5)
        if scaled_height < 1440 or offset > scaled_height - 1440:
            raise ValueError(f'Decalage hors limites : hauteur {scaled_height}, '
                             f'maximum {scaled_height - 1440}.')
        # Rotation antihoraire, Lanczos puis recadrage ; aucune accentuation.
        run([ffmpeg, '-hide_banner', '-loglevel', 'error', '-nostdin', '-y',
             '-i', upscaled, '-vf',
             f'transpose=2,scale=5120:{scaled_height}:flags=lanczos,'
             f'format=rgb24,crop=5120:1440:0:{offset}',
             '-frames:v', '1', result])
        if png_size(result) != (5120, 1440):
            raise ValueError('Dimensions finales incorrectes.')
        # Publier seulement le fichier termine ; conserver toute sortie en cas d'echec.
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(result, destination)
        print(f'{destination}\nModele={model} crop_y={offset} '
              f'upscale={upscale_seconds:.2f}s total={time.monotonic()-started:.2f}s')
except (subprocess.SubprocessError, OSError, ValueError, TimeoutError) as error:
    sys.exit(f'Echec du traitement : {error}')
PY
