document.addEventListener("DOMContentLoaded", () => {
    lucide.createIcons();

    const overlay = document.getElementById("entry-overlay");
    const mainPanel = document.getElementById("main-panel");
    const bgVideo = document.getElementById("bg-video");

    const fonts = ["'Patrick Hand', cursive", "'Caveat', cursive", "'Kalam', cursive", "'Shadows Into Light', cursive", "'Permanent Marker', cursive", "'Outfit', sans-serif"];
    const charSpans = ["char-1","char-2","char-3","char-4"].map(id => document.getElementById(id)).filter(Boolean);
    if(charSpans.length > 0) {
        setInterval(() => {
            charSpans.forEach(el => { el.style.fontFamily = fonts[Math.floor(Math.random() * fonts.length)]; });
        }, 350);
    }

    const phrases = ["yo", "FullStack Devin", "i <3 claude", "gurt"];
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

    let audioInstance = null;
    let isMuted = false;

    let tracks = window.siteFiles && window.siteFiles.tracks ? window.siteFiles.tracks.map(f => 'music/' + f) : [];
    if (tracks.length > 0) {
        tracks = tracks.sort(() => Math.random() - 0.5);
    }
    let currentTrackIndex = 0;
    
    const pfp = document.getElementById("pfp");
    if (window.siteFiles && window.siteFiles.images && window.siteFiles.images.length > 0) {
        const rImg = window.siteFiles.images[Math.floor(Math.random() * window.siteFiles.images.length)];
        pfp.src = 'images/' + rImg;
    }
    
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

        let sum = 0;
        const bassBins = 5;
        for (let i = 0; i < bassBins; i++) {
            sum += dataArray[i];
        }
        const avgBass = sum / bassBins;

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

    async function updateDiscordStatus() {
        try {
            const res  = await fetch("https://presence.perc.life/presence");
            const data = await res.json();

            if (data.avatarUrl) document.getElementById("dc-avatar").src = data.avatarUrl;
            document.getElementById("dc-status").className = `status-dot status-${data.status}`;
            document.getElementById("dc-display-name").textContent = data.displayName || "dxv3";
            document.getElementById("dc-username").textContent = "@" + (data.username || "dxv3");

            const actContainer = document.getElementById("dc-activity");
            if (data.activity) {
                actContainer.style.display = "block";
                const labelMap = { 0: "Playing a game", 1: "Streaming", 3: "Watching", 5: "Competing in" };
                document.getElementById("dc-activity-label").textContent = labelMap[data.activity.type] || "Playing a game";
                document.getElementById("dc-activity-name").textContent    = data.activity.name    || "";
                document.getElementById("dc-activity-details").textContent = data.activity.details || "";
                document.getElementById("dc-activity-state").textContent   = data.activity.state   || "";
                document.getElementById("dc-activity-img").src = data.activity.imageUrl
                    || `https://ui-avatars.com/api/?name=${encodeURIComponent(data.activity.name)}&background=0d0d0d&color=fff`;
            } else {
                actContainer.style.display = "none";
            }

            const spotifyContainer = document.getElementById("dc-spotify");
            if (data.spotify) {
                spotifyContainer.style.display = "block";
                document.getElementById("dc-spotify-img").src    = data.spotify.albumArtUrl || "";
                document.getElementById("dc-spotify-song").textContent   = data.spotify.song   || "";
                document.getElementById("dc-spotify-artist").textContent = data.spotify.artist || "";
            } else {
                spotifyContainer.style.display = "none";
            }

        } catch (err) {
            console.warn("Presence API unreachable — showing offline");
            document.getElementById("dc-status").className = "status-dot status-offline";
        }
    }
    
    updateDiscordStatus();
    setInterval(updateDiscordStatus, 5000);

});
