/**
 * GHL Audio Player Injector
 */
(function() {
    'use strict';

    function injectAudioPlayers() {
        // Seleciona links de audio
        const audioLinks = document.querySelectorAll('a[href$=".mp3"], a[href$=".ogg"], a[href$=".wav"]');

        audioLinks.forEach(link => {
            if (link.getAttribute('data-audio-injected') === 'true') return;

            const audioPlayer = document.createElement('audio');
            audioPlayer.controls = true;
            audioPlayer.src = link.href;
            
            // --- ESTILOS VISUAIS ---
            // display: block garante que ele ocupe a linha toda
            audioPlayer.style.display = 'block'; 
            // width: 100% tenta ocupar o espaço, mas...
            audioPlayer.style.width = '100%';
            // ...minWidth: 260px impede o balão de encolher
            audioPlayer.style.minWidth = '260px'; 
            audioPlayer.style.marginTop = '5px';
            audioPlayer.style.height = '40px';
            
            audioPlayer.preload = 'metadata';

            link.parentNode.appendChild(audioPlayer);

            link.setAttribute('data-audio-injected', 'true');
            
            // Esconde o link
            link.style.display = 'none'; 
        });
    }

    const observer = new MutationObserver((mutations) => {
        injectAudioPlayers();
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
})();

