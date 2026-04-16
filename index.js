const express = require('express');
const YTDlpWrap = require('yt-dlp-wrap').default;
const path = require('path');
const fs = require('fs');
const os = require('os');
const { randomUUID } = require('crypto');
const ffmpeg = require('fluent-ffmpeg');

const app = express();
const PORT = 3000;
const ytDlp = new YTDlpWrap();

app.use(express.static('public'));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- ROUTE 1: MP4 CLASSIQUE ---
app.get('/download', async (req, res) => {
    const videoURL = req.query.url;
    if (!videoURL) return res.status(400).send('URL manquante');
    const tmpFile = path.join(os.tmpdir(), `${randomUUID()}.mp4`);
    try {
        const metadata = await ytDlp.execPromise([videoURL, '--dump-json', '--no-playlist']);
        const title = JSON.parse(metadata).title.replace(/[^\w\s]/gi, '');
        await ytDlp.execPromise([
            videoURL, '-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
            '--merge-output-format', 'mp4', '-o', tmpFile, '--no-playlist'
        ]);
        res.header('Content-Disposition', `attachment; filename="${title}.mp4"`);
        res.sendFile(tmpFile, (err) => { fs.unlink(tmpFile, () => {}); });
    } catch (err) {
        if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
        res.status(500).send('Erreur : ' + err.message);
    }
});

// --- ROUTE 2: GIF ---
app.get('/gif', async (req, res) => {
    const videoURL = req.query.url;
    const start = req.query.start || "00:00:00";
    const duration = req.query.duration || 5;
    const tmpVideo = path.join(os.tmpdir(), `${randomUUID()}.mp4`);
    const tmpGif = path.join(os.tmpdir(), `${randomUUID()}.gif`);
    try {
        const metadata = await ytDlp.execPromise([videoURL, '--dump-json', '--no-playlist']);
        const title = JSON.parse(metadata).title.replace(/[^\w\s]/gi, '');
        await ytDlp.execPromise([videoURL, '-f', 'worst', '-o', tmpVideo, '--no-playlist']);
        ffmpeg(tmpVideo).setStartTime(start).setDuration(duration)
            .videoFilters(['fps=10', 'scale=480:-1:flags=lanczos'])
            .on('end', () => {
                res.header('Content-Disposition', `attachment; filename="${title}.gif"`);
                res.sendFile(tmpGif, (err) => {
                    if (fs.existsSync(tmpVideo)) fs.unlink(tmpVideo, () => {});
                    if (fs.existsSync(tmpGif)) fs.unlink(tmpGif, () => {});
                });
            })
            .save(tmpGif);
    } catch (err) {
        if (fs.existsSync(tmpVideo)) fs.unlinkSync(tmpVideo);
        res.status(500).send('Erreur GIF : ' + err.message);
    }
});

// --- ROUTE 3: ENLEVER LE SON (MUTE) ---
app.get('/mute', async (req, res) => {
    const videoURL = req.query.url;
    if (!videoURL) return res.status(400).send('URL manquante');

    const tmpOriginal = path.join(os.tmpdir(), `${randomUUID()}_raw.mp4`);
    const tmpMuted = path.join(os.tmpdir(), `${randomUUID()}_muted.mp4`);

    try {
        const metadata = await ytDlp.execPromise([videoURL, '--dump-json', '--no-playlist']);
        const title = JSON.parse(metadata).title.replace(/[^\w\s]/gi, '');

        console.log(`Suppression du son pour : ${title}`);

        // Télécharger la vidéo
        await ytDlp.execPromise([
            videoURL, '-f', 'bestvideo[ext=mp4]/best[ext=mp4]', 
            '-o', tmpOriginal, '--no-playlist'
        ]);

        // Retirer l'audio avec FFmpeg (-an = audio none)
        ffmpeg(tmpOriginal)
            .outputOptions('-an') 
            .on('end', () => {
                res.header('Content-Disposition', `attachment; filename="${title}_sans_son.mp4"`);
                res.sendFile(tmpMuted, (err) => {
                    if (fs.existsSync(tmpOriginal)) fs.unlink(tmpOriginal, () => {});
                    if (fs.existsSync(tmpMuted)) fs.unlink(tmpMuted, () => {});
                });
            })
            .on('error', (err) => { throw err; })
            .save(tmpMuted);

    } catch (err) {
        if (fs.existsSync(tmpOriginal)) fs.unlinkSync(tmpOriginal);
        res.status(500).send('Erreur Mute : ' + err.message);
    }
});


// --- ROUTE 4: MP3 ---
app.get('/mp3', async (req, res) => {
    const videoURL = req.query.url;
    if (!videoURL) return res.status(400).send('URL manquante');
    const tmpAudio = path.join(os.tmpdir(), `${randomUUID()}.mp3`);

    try {
        const metadata = await ytDlp.execPromise([videoURL, '--dump-json', '--no-playlist']);
        const title = JSON.parse(metadata).title.replace(/[^\w\s]/gi, '');

        await ytDlp.execPromise([
            videoURL,
            '-x', '--audio-format', 'mp3', // -x = extract audio
            '-o', tmpAudio,
            '--no-playlist'
        ]);

        res.header('Content-Disposition', `attachment; filename="${title}.mp3"`);
        res.sendFile(tmpAudio, () => fs.unlink(tmpAudio, () => {}));
    } catch (err) {
        res.status(500).send('Erreur MP3 : ' + err.message);
    }
});

app.listen(PORT, () => console.log(`Serveur prêt sur http://localhost:${PORT}`));