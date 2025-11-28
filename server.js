const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs').promises;
const mm = require('music-metadata');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// YENİ: Müzik klasörünü internete açıyoruz (Dosya indirmek/çalmak için)
// Artık 'siteadresi.com/music/sarki.mp3' diyerek müziğe erişilebilir.
app.use('/music', express.static(path.join(__dirname, 'muzik')));

const PORT = process.env.PORT || 3000;
const MUSIC_DIR = path.join(__dirname, 'muzik');

let nowPlaying = null;
let queue = [];
let isPlaying = false;
let allSongsCache = [];
let pendingCommand = null;

// --- DİĞER KODLAR AYNI KALIYOR ---
// (Hız sınırı, admin kontrolü vs. aynen devam)

const tableRequestTimes = {};
const COOLDOWN_MINUTES = 10;

async function scanAndCacheSongs() {
    try {
        const files = await fs.readdir(MUSIC_DIR);
        const mp3s = files.filter(f => f.toLowerCase().endsWith('.mp3'));
        const songs = [];
        for (const file of mp3s) {
            let title = file.replace('.mp3', ''), artist = 'Bilinmeyen Sanatçı';
            try {
                const metadata = await mm.parseFile(path.join(MUSIC_DIR, file));
                title = metadata.common.title || title;
                artist = metadata.common.artist || artist;
            } catch (e) {}
            // ÖNEMLİ: filename bilgisini de gönderiyoruz ki tarayıcı dosyayı bulabilsin
            songs.push({ id: file, title, artist, filename: file });
        }
        allSongsCache = songs;
        console.log(`${allSongsCache.length} şarkı tarandı.`);
    } catch (err) { throw err; }
}

function isRequestFromAdmin(req) {
    const tableNumber = req.body.tableNumber;
    return tableNumber && tableNumber.toLowerCase() === 'yonetici';
}

function checkRateLimit(tableNumber) {
    if (tableNumber.toLowerCase() === 'yonetici') return { allowed: true };
    const now = new Date();
    const lastRequestTime = tableRequestTimes[tableNumber];
    if (lastRequestTime) {
        const timeDiffMinutes = (now - lastRequestTime) / (1000 * 60);
        if (timeDiffMinutes < COOLDOWN_MINUTES) {
            const minutesToWait = Math.ceil(COOLDOWN_MINUTES - timeDiffMinutes);
            return { allowed: false, message: `Lütfen ${minutesToWait} dakika bekleyin.` };
        }
    }
    return { allowed: true };
}

app.get('/songs', (req, res) => res.json(allSongsCache));

app.post('/queue', (req, res) => {
    const { songId, tableNumber } = req.body;
    if (!songId || !tableNumber) return res.status(400).json({ error: 'Eksik bilgi.' });

    const rateLimit = checkRateLimit(tableNumber);
    if (!rateLimit.allowed) return res.status(429).json({ error: rateLimit.message });

    const songData = allSongsCache.find(s => s.id === songId);
    if (!songData) return res.status(404).json({ error: 'Şarkı bulunamadı' });
    
    const queueItem = { ...songData, requestedBy: tableNumber };
    queue.push(queueItem);
    
    if (tableNumber.toLowerCase() !== 'yonetici') {
        tableRequestTimes[tableNumber] = new Date();
    }

    if (!nowPlaying) {
        nowPlaying = queue.shift();
        isPlaying = true;
    }
    res.status(201).json(queueItem);
});

app.get('/status', (req, res) => {
    res.json({ nowPlaying, queue, isPlaying, command: pendingCommand });
    pendingCommand = null;
});

// --- Admin Kontrolleri ---
app.post('/player/next', (req, res) => {
    if (!isRequestFromAdmin(req)) return res.status(403).json({ error: 'Yetkiniz yok.' });
    if (queue.length > 0) { nowPlaying = queue.shift(); isPlaying = true; res.json(nowPlaying); }
    else { nowPlaying = null; isPlaying = false; res.status(404).json({ error: 'Sıra bitti.' }); }
});

app.post('/player/rewind', (req, res) => {
    if (!isRequestFromAdmin(req)) return res.status(403).json({ error: 'Yetkiniz yok.' });
    if (nowPlaying) { pendingCommand = 'rewind'; res.json({ message: 'Rewind' }); }
    else { res.status(404).json({ error: 'Yok' }); }
});

app.post('/player/playpause', (req, res) => {
    if (!isRequestFromAdmin(req)) return res.status(403).json({ error: 'Yetkiniz yok.' });
    if (nowPlaying) { isPlaying = !isPlaying; res.json({ isPlaying }); }
    else { res.status(404).json({ error: 'Yok' }); }
});

// Browser Player şarkı bittiğinde bunu çağıracak
app.post('/player/finished', (req, res) => {
    if (queue.length > 0) { nowPlaying = queue.shift(); isPlaying = true; res.json(nowPlaying); }
    else { nowPlaying = null; isPlaying = false; res.json({ message: 'Bitti' }); }
});

app.listen(PORT, async () => {
    console.log(`Server running on port ${PORT}`);
    try { await scanAndCacheSongs(); } catch (error) { console.error(error); }
});