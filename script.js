document.addEventListener("DOMContentLoaded", () => {
    // Initialize Lucide icons
    lucide.createIcons();

    const overlay = document.getElementById("entry-overlay");
    const mainPanel = document.getElementById("main-panel");
    const bgVideo = document.getElementById("bg-video");
    
    // Font cycler for dxv3
    const fonts = ["'Patrick Hand', cursive", "'Caveat', cursive", "'Kalam', cursive", "'Shadows Into Light', cursive", "'Permanent Marker', cursive", "'Outfit', sans-serif"];
    const charSpans = ["char-1","char-2","char-3","char-4"].map(id => document.getElementById(id)).filter(Boolean);
    if(charSpans.length > 0) {
        setInterval(() => {
            charSpans.forEach(el => { el.style.fontFamily = fonts[Math.floor(Math.random() * fonts.length)]; });
        }, 350);
    }

    // Typewriter
    const phrases = ["yo", "FullStack Devin", "i <3 wireshark", "gurt"];
    const typewriterEl = document.getElementById("typewriter");
    let phraseIndex = 0;
    let charIndex = 0;
    let isDeleting = false;
    let isWaiting = false;

    function renderTypewriter() {
        const currentPhrase = phrases[phraseIndex];
        let delay = isDeleting ? 30 : 50;
        delay += Math.random() * 20 - 10;

        if (!isWaiting) {
            if (isDeleting) {
                typewriterEl.textContent = currentPhrase.substring(0, charIndex - 1);
                charIndex--;
            } else {
                typewriterEl.textContent = currentPhrase.substring(0, charIndex + 1);
                charIndex++;
            }

            if (!isDeleting && charIndex === currentPhrase.length) {
                isWaiting = true;
                setTimeout(() => {
                    isDeleting = true;
                    isWaiting = false;
                    renderTypewriter();
                }, 1800);
                return;
            } else if (isDeleting && charIndex === 0) {
                isDeleting = false;
                phraseIndex = (phraseIndex + 1) % phrases.length;
            }
        }
        setTimeout(renderTypewriter, delay);
    }

    // Audio Player
    let audioInstance = null;
    let isMuted = false;
    
    // dynamically load tracks and shuffle them to start on a random song
    let tracks = window.siteFiles && window.siteFiles.tracks ? window.siteFiles.tracks.map(f => 'music/' + f) : [];
    if (tracks.length > 0) {
        tracks = tracks.sort(() => Math.random() - 0.5);
    }
    let currentTrackIndex = 0;
    
    // Setup random profile picture early so it loads fast
    const pfp = document.getElementById("pfp");
    if (window.siteFiles && window.siteFiles.images && window.siteFiles.images.length > 0) {
        const rImg = window.siteFiles.images[Math.floor(Math.random() * window.siteFiles.images.length)];
        pfp.src = 'images/' + rImg;
    }
    
    // Setup random character gif
    const charGif = document.getElementById("character-gif");
    if (window.siteFiles && window.siteFiles.characters && window.siteFiles.characters.length > 0) {
        const rChar = window.siteFiles.characters[Math.floor(Math.random() * window.siteFiles.characters.length)];
        charGif.src = 'characters/' + rChar;
    }
    
    const trackNameEl = document.getElementById("track-name");
    const muteBtn = document.getElementById("mute-toggle");
    const nextBtn = document.getElementById("next-track");
    const prevBtn = document.getElementById("prev-track");
    const volIcon = document.getElementById("vol-icon");
    const visualizer = document.getElementById("visualizer");
    const spinDisc = document.querySelector(".spin-slow");

    let audioCtx;
    let analyser;
    let dataArray;
    let source;
    let bassVisualsActive = false;
    let animationFrameId;

    function initAudioContext() {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (!analyser) {
            analyser = audioCtx.createAnalyser();
            analyser.fftSize = 256;
            dataArray = new Uint8Array(analyser.frequencyBinCount);
        }
        if (!source && audioInstance) {
            source = audioCtx.createMediaElementSource(audioInstance);
            source.connect(analyser);
            analyser.connect(audioCtx.destination);
        }
    }

    function renderBass() {
        if (!bassVisualsActive) return;
        animationFrameId = requestAnimationFrame(renderBass);
        
        analyser.getByteFrequencyData(dataArray);
        
        // Sum the absolute lowest frequencies (bass is typically in first 5 bins here)
        let sum = 0;
        const bassBins = 5;
        for (let i = 0; i < bassBins; i++) {
            sum += dataArray[i];
        }
        const avgBass = sum / bassBins;
        
        // Threshold for bass hit (max is 255)
        const pfpContainer = document.querySelector(".pfp-container");
        const panel = document.getElementById("main-panel");
        
        if (avgBass > 180) {
            document.body.classList.add("bass-flash-bg");
            pfpContainer.style.boxShadow = "0 0 60px var(--accent)";
            pfpContainer.style.transform = "scale(1.08)";
            panel.style.boxShadow = "0 0 80px var(--accent-glow), inset 0 1px 0 rgba(255,255,255,0.08)";
        } else {
            document.body.classList.remove("bass-flash-bg");
            pfpContainer.style.boxShadow = "0 0 20px var(--accent-glow)";
            pfpContainer.style.transform = "scale(1)";
            panel.style.boxShadow = "0 0 40px var(--accent-glow), inset 0 1px 0 rgba(255,255,255,0.08)";
        }
    }

    function initAudio() {
        if (!audioInstance) {
            audioInstance = new Audio();
            audioInstance.crossOrigin = "anonymous";
            audioInstance.volume = 0;
            audioInstance.addEventListener('ended', () => handleTrackChange(1));
            audioInstance.addEventListener('error', () => {
                trackNameEl.textContent = "error loading local files";
                stopVisuals();
            });
        }
    }

    function playTrack() {
        if (!audioInstance) initAudio();
        if (tracks.length === 0) {
            trackNameEl.textContent = "folder empty";
            return;
        }

        audioInstance.src = tracks[currentTrackIndex];
        let p = audioInstance.play();
        if (p !== undefined) {
            p.then(() => {
                if(audioCtx && audioCtx.state === 'suspended') {
                    audioCtx.resume();
                }
                let rawName = tracks[currentTrackIndex].split('/').pop();
                // cleanup the messy string names
                const cleanName = rawName.replace('_spotdown.org', '').replace('.mp3', '');
                trackNameEl.textContent = cleanName;
                
                if (!isMuted) startVisuals();
                fadeInAudio();
            }).catch((err) => {
                console.log(err);
                trackNameEl.textContent = "playback ready";
                stopVisuals();
            });
        }
    }

    function fadeInAudio() {
        let vol = 0;
        audioInstance.volume = vol;
        const fadeInt = setInterval(() => {
            if (vol < 0.3) {
                vol += 0.02;
                audioInstance.volume = Math.min(vol, 0.3);
            } else {
                clearInterval(fadeInt);
            }
        }, 150);
    }

    function handleTrackChange(dir) {
        if (tracks.length === 0) return;
        currentTrackIndex = (currentTrackIndex + dir + tracks.length) % tracks.length;
        playTrack();
    }

    function toggleMute() {
        if (!audioInstance) return;
        isMuted = !isMuted;
        audioInstance.muted = isMuted;
        
        if (isMuted) {
            stopVisuals();
            volIcon.setAttribute("data-lucide", "volume-x");
        } else {
            startVisuals();
            volIcon.setAttribute("data-lucide", "volume-2");
        }
        lucide.createIcons();
    }

    function startVisuals() {
        visualizer.classList.remove("inactive");
        spinDisc.classList.add("active");
        if (analyser) {
            bassVisualsActive = true;
            renderBass();
        }
    }

    function stopVisuals() {
        visualizer.classList.add("inactive");
        spinDisc.classList.remove("active");
        bassVisualsActive = false;
        if (animationFrameId) cancelAnimationFrame(animationFrameId);
        
        // Reset styles properly when stopping
        document.body.classList.remove("bass-flash-bg");
        const pfp = document.querySelector(".pfp-container");
        if(pfp) {
            pfp.style.boxShadow = "0 0 20px var(--accent-glow)";
            pfp.style.transform = "scale(1)";
        }
    }

    nextBtn.addEventListener("click", () => handleTrackChange(1));
    prevBtn.addEventListener("click", () => handleTrackChange(-1));
    muteBtn.addEventListener("click", toggleMute);

    function initVideoBg() {
        const bgImg = document.getElementById("bg-img");
        if (window.siteFiles && window.siteFiles.backgrounds && window.siteFiles.backgrounds.length > 0) {
            const rBg = window.siteFiles.backgrounds[Math.floor(Math.random() * window.siteFiles.backgrounds.length)];
            const bgPath = "backgrounds/" + rBg;
            
            if (rBg.endsWith('.mp4')) {
                bgImg.style.display = "none";
                bgVideo.style.display = "block";
                bgVideo.src = bgPath;
                bgVideo.volume = 0;
                let p = bgVideo.play();
                if (p !== undefined) {
                    p.then(() => {
                        bgVideo.classList.add("active");
                    }).catch(() => {});
                }
            } else if (rBg.endsWith('.gif')) {
                bgVideo.style.display = "none";
                bgImg.style.display = "block";
                bgImg.src = bgPath;
                // Minor trick to make sure browser pulls from cache correctly as active
                bgImg.onload = () => bgImg.classList.add("active");
            }
        }
    }

    function handleEntry() {
        overlay.classList.add("hidden");
        setTimeout(() => overlay.style.display = "none", 1000);
        mainPanel.classList.add("show");
        const discordPanel = document.getElementById("discord-panel");
        if(discordPanel) discordPanel.classList.add("show");
        const charContainer = document.getElementById("character-container");
        if(charContainer) charContainer.classList.add("show");
        
        initAudioContext();
        if(audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
        
        playTrack();
        initVideoBg();
        renderTypewriter();
        
        document.removeEventListener("click", handleEntry);
    }

    document.addEventListener("click", handleEntry);

    // Lanyard Discord Modal API Integration
    async function updateDiscordStatus() {
        try {
            const res = await fetch("https://api.lanyard.rest/v1/users/541388135712423936");
            const payload = await res.json();
            if (!payload || !payload.data) return;
            const data = payload.data;

            // set avatar and status
            const avatarId = data.discord_user.avatar;
            const userId = data.discord_user.id;
            const avatarUrl = `https://cdn.discordapp.com/avatars/${userId}/${avatarId}.webp?size=256`;
            document.getElementById("dc-avatar").src = avatarUrl;
            document.getElementById("dc-status").className = `status-dot status-${data.discord_status}`;

            // set names
            document.getElementById("dc-display-name").textContent = data.discord_user.display_name || data.discord_user.username;
            document.getElementById("dc-username").textContent = "@" + data.discord_user.username;

            // --- Game / Rich Presence activity (type 0, 1, 2, 3 — NOT type 4 custom status) ---
            const actContainer = document.getElementById("dc-activity");
            const playAct = data.activities && data.activities.find(a => a.type !== 4 && a.type !== 2);

            if (playAct) {
                actContainer.style.display = "block";
                let labelStr = "Playing a game";
                if (playAct.type === 3) labelStr = "Watching";

                document.getElementById("dc-activity-label").textContent = labelStr;
                document.getElementById("dc-activity-name").textContent = playAct.name;
                document.getElementById("dc-activity-details").textContent = playAct.details || "";
                document.getElementById("dc-activity-state").textContent = playAct.state || "";

                let imgSrc = `https://ui-avatars.com/api/?name=${encodeURIComponent(playAct.name)}&background=0d0d0d&color=fff`;
                if (playAct.assets && playAct.assets.large_image) {
                    let lImage = playAct.assets.large_image;
                    if (lImage.startsWith("mp:external/")) {
                        imgSrc = "https://media.discordapp.net/external/" + lImage.replace("mp:external/", "");
                    } else {
                        imgSrc = `https://cdn.discordapp.com/app-assets/${playAct.application_id}/${lImage}.webp`;
                    }
                }
                document.getElementById("dc-activity-img").src = imgSrc;
            } else {
                actContainer.style.display = "none";
            }

            // --- Spotify — shown independently, can coexist with game ---
            const spotifyContainer = document.getElementById("dc-spotify");
            if (data.listening_to_spotify && data.spotify) {
                spotifyContainer.style.display = "block";
                document.getElementById("dc-spotify-img").src = data.spotify.album_art_url;
                document.getElementById("dc-spotify-song").textContent = data.spotify.song;
                document.getElementById("dc-spotify-artist").textContent = data.spotify.artist;
            } else {
                spotifyContainer.style.display = "none";
            }

        } catch (err) {
            console.warn("Failed fetching Lanyard API");
        }
    }
    
    updateDiscordStatus();
    setInterval(updateDiscordStatus, 5000); // 5 sec interval

});
