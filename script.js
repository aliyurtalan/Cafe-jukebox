document.addEventListener('DOMContentLoaded', () => {
    checkAdminStatus();
    loadSongs();
    
    // Eğer Yönetici ise müzik çalar sistemini başlat
    if (isAdmin) {
        initBrowserPlayer();
    }

    fetchStatus();
    setInterval(fetchStatus, 2000); 

    const searchInput = document.getElementById('search');
    searchInput.addEventListener('input', () => {
        filterSongs(searchInput.value.toLowerCase());
    });

    // Buton eventleri
    const prevBtn = document.getElementById('prevBtn');
    if(prevBtn) prevBtn.addEventListener('click', () => sendPlayerCommand('/player/rewind'));
    
    const nextBtn = document.getElementById('nextBtn');
    if(nextBtn) nextBtn.addEventListener('click', () => sendPlayerCommand('/player/next'));
    
    const playPauseBtn = document.getElementById('playPauseBtn');
    if(playPauseBtn) playPauseBtn.addEventListener('click', () => sendPlayerCommand('/player/playpause'));
});

let allSongs = [];
let isAdmin = false;
let browserAudio = null;
let currentSongId = null;

function getTableNumber() {
    const params = new URLSearchParams(window.location.search);
    return params.get('table') || 'Bilinmiyor';
}

function checkAdminStatus() {
    if (getTableNumber().toLowerCase() === 'yonetici') {
        document.body.classList.add('admin-view');
        isAdmin = true;
        console.log("Yönetici modu aktif. Müzik bu tarayıcıdan çalınacak.");
        
        const header = document.querySelector('.app-header');
        const startBtn = document.createElement('button');
        startBtn.textContent = "🔊 Hoparlörü Aktif Et (Tıkla)";
        startBtn.className = "add-to-queue-btn";
        startBtn.style.marginTop = "10px";
        startBtn.onclick = function() {
            const dummy = new Audio();
            dummy.play().then(() => {
                startBtn.textContent = "🔊 Hoparlör Aktif!";
                startBtn.style.backgroundColor = "var(--spotify-green)";
                startBtn.style.color = "black";
            }).catch(e => console.log("Oynatma izni bekleniyor..."));
        };
        header.appendChild(startBtn);
    }
}

// --- TARAYICI MÜZİK ÇALAR MANTIĞI ---
function initBrowserPlayer() {
    browserAudio = new Audio();
    
    browserAudio.addEventListener('ended', async () => {
        console.log("Şarkı bitti, sıradakine geçiliyor...");
        await fetch('/player/finished', { method: 'POST' });
        fetchStatus();
    });
}

async function handleAudioPlayback(song, isPlaying, command) {
    if (!browserAudio) return;

    // 1. Komutları İşle
    if (command === 'rewind') {
        browserAudio.currentTime = 0;
    }

    // 2. Yeni şarkı mı?
    if (song && song.id !== currentSongId) {
        console.log("Yeni şarkı yükleniyor:", song.title);
        currentSongId = song.id;
        browserAudio.src = `/music/${song.filename}`; 
        try {
            await browserAudio.play();
        } catch (e) {
            console.error("Otomatik oynatma engellendi.");
        }
    } else if (!song && currentSongId) {
        browserAudio.pause();
        currentSongId = null;
    }

    // 3. Oynat/Durdur Durumu
    if (song && currentSongId === song.id) {
        if (isPlaying && browserAudio.paused) {
            browserAudio.play().catch(e => console.error("Oynatma hatası:", e));
        } else if (!isPlaying && !browserAudio.paused) {
            browserAudio.pause();
        }
    }
}

async function fetchStatus() {
    try {
        const response = await fetch('/status');
        const status = await response.json();
        
        updateNowPlayingUI(status.nowPlaying, status.isPlaying);
        updateQueueUI(status.queue);

        if (isAdmin) {
            handleAudioPlayback(status.nowPlaying, status.isPlaying, status.command);
        }

    } catch (error) {}
}

async function sendPlayerCommand(endpoint) {
    const tableNumber = getTableNumber();
    try {
        await fetch(endpoint, { 
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tableNumber: tableNumber }) 
        });
        fetchStatus();
    } catch (error) { console.error(`Hata:`, error); }
}

function updateNowPlayingUI(song, isPlaying) {
    const titleEl = document.getElementById('nowPlayingTitle');
    const artistEl = document.getElementById('nowPlayingArtist');
    const playPauseBtn = document.getElementById('playPauseBtn');
    
    if (song) {
        titleEl.textContent = song.title;
        if (song.requestedBy) artistEl.innerHTML = `${song.artist} <span class="track-requester-np">(İstek: ${song.requestedBy})</span>`;
        else artistEl.textContent = song.artist;
        if(playPauseBtn) {
            playPauseBtn.innerHTML = isPlaying ? '⏸️' : '▶️';
            playPauseBtn.title = isPlaying ? 'Duraklat' : 'Oynat';
        }
    } else {
        titleEl.textContent = '--';
        artistEl.textContent = 'Jukebox Boşta';
        if(playPauseBtn) playPauseBtn.innerHTML = '▶️';
    }
}

async function loadSongs() {
    try {
        const response = await fetch('/songs');
        allSongs = await response.json();
        displaySongs(allSongs);
    } catch (error) {}
}

function filterSongs(searchText) {
    const filtered = allSongs.filter(s => s.title.toLowerCase().includes(searchText) || s.artist.toLowerCase().includes(searchText));
    displaySongs(filtered);
}

function displaySongs(songs) {
    const songList = document.getElementById('songList');
    songList.innerHTML = '';
    songs.forEach((song, index) => {
        const li = document.createElement('li');
        li.className = 'song-item';
        li.innerHTML = `<div class="track-details"><span class="track-index">${index + 1}</span><div class="track-info"><span class="track-title">${song.title}</span><span class="track-artist">${song.artist}</span></div></div><button class="add-to-queue-btn" onclick="addSong(this, '${song.id}')">➕ Ekle</button>`;
        songList.appendChild(li);
    });
}

function updateQueueUI(queue) {
    const queueList = document.getElementById('queueList');
    queueList.innerHTML = '';
    if (queue.length === 0) queueList.innerHTML = '<li class="song-item" style="color: var(--text-secondary);">Sırada şarkı yok...</li>';
    else {
        queue.forEach((song, index) => {
            const li = document.createElement('li');
            li.className = 'song-item';
            li.innerHTML = `<div class="track-details"><span class="track-index">${index + 1}</span><div class="track-info"><span class="track-title">${song.title}</span><span class="track-artist">${song.artist}</span>${song.requestedBy ? `<span class="track-requester">(İstek: ${song.requestedBy})</span>` : ''}</div></div>`;
            queueList.appendChild(li);
        });
    }
}

async function addSong(buttonElement, songId) {
    const tableNumber = getTableNumber();
    try {
        buttonElement.disabled = true;
        const response = await fetch('/queue', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ songId: songId, tableNumber: tableNumber })
        });
        const result = await response.json();
        if (response.ok) { buttonElement.textContent = '✅'; fetchStatus(); }
        else if (response.status === 429) { alert(result.error); buttonElement.textContent = '⏱️'; }
        else { throw new Error(result.error); }
    } catch (error) { console.error('Hata:', error); buttonElement.textContent = '❌'; } 
    finally { setTimeout(() => { buttonElement.textContent = '➕ Ekle'; buttonElement.disabled = false; }, 2000); }
}
