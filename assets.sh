#!/bin/bash
ffmpeg -y -i "$1" tmp.mp3

sox tmp.mp3 tmp.wav remix 1,2 rate 50000
rm tmp.mp3

for sample in 1 2 20 200 2000
do
    audiowaveform -i tmp.wav -o waveform_$sample.json --pixels-per-second $sample --bits 8
done

sox tmp.wav -m -n spectrogram -c 1 -y 100 -x 50000 -r -o spectrogram.png
rm tmp.wav
