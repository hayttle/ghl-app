;(function () {
  const N8N_URL = "https://webhooks.posicionamentodigital.com/webhook/audio"

  function injectEvoMic() {
    const sthubBtn = document.getElementById("sthub-btn")
    if (!sthubBtn || document.getElementById("evo-mic-wrapper")) return

    const toolbar = document.getElementById("conv-composer-toolbar")

    // 1. Botão do Microfone (Estilo 36px idêntico ao nativo que você enviou)
    const micWrapper = document.createElement("button")
    micWrapper.id = "evo-mic-wrapper"
    micWrapper.type = "button"
    micWrapper.style.cssText = `
            background-color: transparent !important;
            color: #6b7280 !important;
            border: none !important;
            border-radius: 6px !important;
            width: 36px !important;
            height: 36px !important;
            cursor: pointer !important;
            display: inline-flex !important;
            align-items: center !important;
            justify-content: center !important;
            margin: 0 2px !important;
            transition: all 0.15s ease !important;
            flex-shrink: 0 !important;
            padding: 0 !important;
        `

    micWrapper.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" style="width: 20px; height: 20px;">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z" />
            </svg>`

    // 2. Interface de Gravação/Revisão (Versão original funcionando)
    const recordingUI = document.createElement("div")
    recordingUI.id = "evo-recording-ui"
    recordingUI.style =
      "display:none; align-items:center; background:#f4f4f5; border-radius:30px; padding:2px 8px 2px 12px; margin-right:8px; flex:1; height:42px; border:1px solid #e4e4e7; justify-content: space-between; gap:8px;"

    recordingUI.innerHTML = `
            <div id="evo-state-recording" style="display:flex; align-items:center; gap:10px; flex:1; padding-left:10px;">
                <div style="width:8px; height:8px; background:#ef4444; border-radius:50%; animation: pulse 1s infinite;"></div>
                <span id="evo-timer" style="font-family:monospace; font-size:14px; font-weight:600; color:#374151;">00:00</span>
                <div id="evo-wave-container" style="display:flex; gap:3px; flex:1; justify-content:center; align-items:center;">
                    ${Array(12)
                      .fill(
                        '<div class="evo-wave-bar" style="width:2px; height:8px; background:#ef4444; border-radius:2px;"></div>'
                      )
                      .join("")}
                </div>
            </div>

            <div id="evo-state-review" style="display:none; align-items:center; gap:8px; flex:1; width:100%;">
                <audio id="evo-native-player" controls style="height: 32px; flex: 1; filter: grayscale(1);"></audio>
                <div style="display:flex; align-items:center; gap:2px;">
                    <button id="evo-del-btn" title="Excluir" style="background:none; border:none; cursor:pointer; display:flex; padding:8px; color:#9ca3af;">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" style="width:20px; height:20px;"><path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" /></svg>
                    </button>
                    <button id="evo-send-btn" title="Enviar" style="background:#25d366; border:none; border-radius:50%; width:34px; height:34px; cursor:pointer; display:flex; align-items:center; justify-content:center; color:white;">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" style="width:20px; height:20px; transform: rotate(-45deg); transform-origin: center;">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                        </svg>
                    </button>
                </div>
            </div>
        `

    if (!document.getElementById("evo-styles")) {
      const style = document.createElement("style")
      style.id = "evo-styles"
      style.innerHTML = `
                @keyframes pulse { 0% { opacity: 1; } 50% { opacity: 0.3; } 100% { opacity: 1; } }
                .evo-wave-anim { animation: evo-wave-move 0.6s infinite alternate; }
                @keyframes evo-wave-move { from { height: 6px; } to { height: 18px; } }
            `
      document.head.appendChild(style)
    }

    let mediaRecorder,
      chunks = [],
      timerInterval,
      seconds = 0,
      audioBlob = null
    const nativePlayer = recordingUI.querySelector("#evo-native-player")

    const resetAll = () => {
      clearInterval(timerInterval)
      if (mediaRecorder && mediaRecorder.state !== "inactive") mediaRecorder.stop()
      recordingUI.style.display = "none"
      micWrapper.style.display = "inline-flex"
      micWrapper.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" style="width: 20px; height: 20px;"><path stroke-linecap="round" stroke-linejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z" /></svg>`
      micWrapper.style.color = "#6b7280"
      Array.from(toolbar.children).forEach((el) => {
        if (el !== micWrapper && el !== recordingUI) el.style.display = ""
      })
      chunks = []
      audioBlob = null
      nativePlayer.src = ""
    }

    const startRecording = async () => {
      const stream = await navigator.mediaDevices.getUserMedia({audio: true})
      mediaRecorder = new MediaRecorder(stream)
      chunks = []
      seconds = 0
      Array.from(toolbar.children).forEach((el) => {
        if (el !== micWrapper && el !== recordingUI) el.style.setProperty("display", "none", "important")
      })

      recordingUI.style.display = "flex"
      document.getElementById("evo-state-recording").style.display = "flex"
      document.getElementById("evo-state-review").style.display = "none"
      micWrapper.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" style="width: 20px; height: 20px;"><rect x="6" y="6" width="12" height="12" rx="1.5" /></svg>`
      micWrapper.style.color = "#ef4444"

      recordingUI.querySelectorAll(".evo-wave-bar").forEach((b, i) => {
        b.classList.add("evo-wave-anim")
        b.style.animationDelay = i * 0.05 + "s"
      })

      timerInterval = setInterval(() => {
        seconds++
        const mins = Math.floor(seconds / 60)
          .toString()
          .padStart(2, "0")
        const secs = (seconds % 60).toString().padStart(2, "0")
        document.getElementById("evo-timer").innerText = `${mins}:${secs}`
      }, 1000)

      mediaRecorder.ondataavailable = (e) => chunks.push(e.data)
      mediaRecorder.onstop = () => {
        audioBlob = new Blob(chunks, {type: "audio/ogg; codecs=opus"})
        nativePlayer.src = URL.createObjectURL(audioBlob)
        document.getElementById("evo-state-recording").style.display = "none"
        document.getElementById("evo-state-review").style.display = "flex"
        micWrapper.style.display = "none"
        clearInterval(timerInterval)
      }
      mediaRecorder.start()
    }

    micWrapper.onclick = () => {
      if (!mediaRecorder || mediaRecorder.state === "inactive") startRecording()
      else mediaRecorder.stop()
    }
    recordingUI.querySelector("#evo-del-btn").onclick = resetAll

    recordingUI.querySelector("#evo-send-btn").onclick = () => {
      const btn = recordingUI.querySelector("#evo-send-btn")
      btn.style.opacity = "0.3"
      const reader = new FileReader()
      reader.readAsDataURL(audioBlob)
      reader.onloadend = async () => {
        const base64Audio = reader.result.split(",")[1]
        const path = window.location.pathname.split("/")
        const payload = {
          audio: base64Audio,
          conversationId: path.filter((s) => s.length > 5).pop(),
          locationId: path[path.indexOf("location") + 1],
          fileName: "audio.ogg"
        }
        try {
          await fetch(N8N_URL, {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify(payload)
          })
          resetAll()
        } catch (e) {
          alert("Erro n8n")
          btn.style.opacity = "1"
        }
      }
    }

    sthubBtn.insertAdjacentElement("afterend", micWrapper)
    sthubBtn.insertAdjacentElement("afterend", recordingUI)
  }

  setInterval(injectEvoMic, 2000)
})()
