package com.freekiosk

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.rementia.openwakeword.lib.WakeWordEngine
import com.rementia.openwakeword.lib.model.WakeWordModel
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.launch

/**
 * Native voice bridge. Wake-word detection and speech-to-text intentionally have
 * separate lifecycles so only one component owns the microphone at a time.
 *
 * Wake-word detection is local openWakeWord ONNX inference. STT uses Android's
 * SpeechRecognizer with EXTRA_PREFER_OFFLINE as a best-effort offline hint.
 */
class VoiceAssistantModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext), RecognitionListener {

    override fun getName(): String = "VoiceAssistantModule"

    private val mainHandler = Handler(Looper.getMainLooper())
    private val detectorScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private var speechRecognizer: SpeechRecognizer? = null
    private var wakeWordDetector: WakeWordDetector = OpenWakeWordDetector(reactContext, detectorScope)
    @Volatile private var wakeWordDetectionActive = false
    @Volatile private var listening = false

    override fun initialize() {
        super.initialize()
        if (SpeechRecognizer.isRecognitionAvailable(reactContext)) {
            speechRecognizer = SpeechRecognizer.createSpeechRecognizer(reactContext).also {
                it.setRecognitionListener(this)
            }
        }
    }

    @ReactMethod
    fun startWakeWordDetection(promise: Promise) {
        mainHandler.post {
            if (reactContext.checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
                promise.reject("MIC_PERMISSION_REQUIRED", "RECORD_AUDIO permission has not been granted")
                return@post
            }
            try {
                if (!wakeWordDetectionActive) {
                    wakeWordDetector.start { name, score, timestamp ->
                        emitWakeWordDetected(name, score, timestamp)
                    }
                    wakeWordDetectionActive = true
                    emitStatus("wake_word_detection")
                }
                promise.resolve(true)
            } catch (error: Exception) {
                wakeWordDetectionActive = false
                promise.reject("WAKE_WORD_ERROR", error.message, error)
            }
        }
    }

    @ReactMethod
    fun stopWakeWordDetection(promise: Promise) {
        mainHandler.post {
            try {
                wakeWordDetector.stop()
                wakeWordDetectionActive = false
                emitStatus(if (listening) "listening" else "idle")
                promise.resolve(true)
            } catch (error: Exception) {
                promise.reject("WAKE_WORD_ERROR", error.message, error)
            }
        }
    }

    @ReactMethod
    fun startListening(language: String, promise: Promise) {
        mainHandler.post {
            if (reactContext.checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
                promise.reject("MIC_PERMISSION_REQUIRED", "RECORD_AUDIO permission has not been granted")
                return@post
            }
            val recognizer = speechRecognizer
            if (recognizer == null) {
                promise.reject("STT_UNAVAILABLE", "Speech recognition is not available on this device")
                return@post
            }
            try {
                val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                    putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                    putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
                    putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true)
                    if (language.isNotBlank()) putExtra(RecognizerIntent.EXTRA_LANGUAGE, language)
                    putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, reactContext.packageName)
                }
                listening = true
                emitStatus("listening")
                recognizer.startListening(intent)
                promise.resolve(true)
            } catch (error: Exception) {
                listening = false
                emitStatus(if (wakeWordDetectionActive) "wake_word_detection" else "idle")
                promise.reject("STT_START_ERROR", error.message, error)
            }
        }
    }

    @ReactMethod
    fun stopListening(promise: Promise) {
        mainHandler.post {
            try {
                speechRecognizer?.stopListening()
                listening = false
                emitStatus(if (wakeWordDetectionActive) "wake_word_detection" else "idle")
                promise.resolve(true)
            } catch (error: Exception) {
                promise.reject("STT_STOP_ERROR", error.message, error)
            }
        }
    }

    @ReactMethod
    fun getStatus(promise: Promise) {
        val result = Arguments.createMap().apply {
            putBoolean("wakeWordDetectionActive", wakeWordDetectionActive)
            putBoolean("listening", listening)
            putBoolean("speechRecognizerAvailable", speechRecognizer != null)
            putString("wakeWordModel", "Hey Jarvis")
            putString("state", when {
                listening -> "listening"
                wakeWordDetectionActive -> "wake_word_detection"
                else -> "idle"
            })
        }
        promise.resolve(result)
    }

    /** Development/integration-test trigger; real operation uses microphone inference. */
    @ReactMethod
    fun triggerWakeWord() {
        mainHandler.post {
            if (wakeWordDetectionActive) emitWakeWordDetected("Hey Jarvis", 1.0f, System.currentTimeMillis(), "manual")
        }
    }

    private fun emitWakeWordDetected(
        model: String,
        score: Float,
        timestamp: Long,
        source: String = "openwakeword"
    ) {
        val event = Arguments.createMap().apply {
            putString("source", source)
            putString("model", model)
            putDouble("score", score.toDouble())
            putDouble("timestamp", timestamp.toDouble())
        }
        sendEvent("voiceAssistantWakeWord", event)
    }

    private fun emitStatus(state: String) {
        val event = Arguments.createMap().apply {
            putString("state", state)
            putBoolean("wakeWordDetectionActive", wakeWordDetectionActive)
            putBoolean("listening", listening)
        }
        sendEvent("voiceAssistantStatus", event)
    }

    private fun emitText(eventName: String, text: String, isFinal: Boolean) {
        val event = Arguments.createMap().apply {
            putString("text", text)
            putBoolean("isFinal", isFinal)
        }
        sendEvent(eventName, event)
    }

    private fun sendEvent(name: String, payload: WritableMap) {
        try {
            reactContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit(name, payload)
        } catch (_: Exception) {
            // The React context may be tearing down while a recognizer callback arrives.
        }
    }

    override fun onReadyForSpeech(params: Bundle?) = sendEvent("voiceAssistantReady", Arguments.createMap())
    override fun onBeginningOfSpeech() = sendEvent("voiceAssistantSpeechStarted", Arguments.createMap())
    override fun onRmsChanged(rmsdB: Float) = Unit
    override fun onBufferReceived(buffer: ByteArray?) = Unit
    override fun onEndOfSpeech() {
        listening = false
        emitStatus(if (wakeWordDetectionActive) "wake_word_detection" else "idle")
    }

    override fun onError(error: Int) {
        listening = false
        val event = Arguments.createMap().apply { putInt("code", error) }
        sendEvent("voiceAssistantError", event)
        emitStatus(if (wakeWordDetectionActive) "wake_word_detection" else "idle")
    }

    override fun onResults(results: Bundle?) {
        val text = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull()
        if (!text.isNullOrBlank()) emitText("voiceAssistantResult", text, true)
        listening = false
        emitStatus(if (wakeWordDetectionActive) "wake_word_detection" else "idle")
    }

    override fun onPartialResults(partialResults: Bundle?) {
        val text = partialResults?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull()
        if (!text.isNullOrBlank()) emitText("voiceAssistantPartialResult", text, false)
    }

    override fun onEvent(eventType: Int, params: Bundle?) = Unit
    @ReactMethod fun addListener(eventName: String) = Unit
    @ReactMethod fun removeListeners(count: Int) = Unit

    override fun onCatalystInstanceDestroy() {
        mainHandler.post {
            wakeWordDetector.stop()
            speechRecognizer?.destroy()
            speechRecognizer = null
            listening = false
            wakeWordDetectionActive = false
            detectorScope.cancel()
        }
        super.onCatalystInstanceDestroy()
    }
}

private interface WakeWordDetector {
    fun start(onDetected: (model: String, score: Float, timestamp: Long) -> Unit)
    fun stop()
}

/** Local continuous microphone inference using the openWakeWord ONNX runtime. */
private class OpenWakeWordDetector(
    private val context: ReactApplicationContext,
    private val scope: CoroutineScope,
) : WakeWordDetector {
    private var engine: WakeWordEngine? = null
    private var detectionJob: Job? = null

    override fun start(onDetected: (String, Float, Long) -> Unit) {
        if (engine != null) return
        val wakeWordEngine = WakeWordEngine(
            context = context,
            models = listOf(
                WakeWordModel(
                    name = "Hey Jarvis",
                    modelPath = "hey_jarvis.onnx",
                    threshold = 0.5f,
                ),
            ),
            detectionCooldownMs = 2_000L,
            scope = scope,
        )
        engine = wakeWordEngine
        detectionJob = scope.launch {
            wakeWordEngine.detections.collect { detection ->
                onDetected(detection.model.name, detection.score, detection.timestamp)
            }
        }
        try {
            wakeWordEngine.start()
        } catch (error: Exception) {
            detectionJob?.cancel()
            detectionJob = null
            wakeWordEngine.release()
            engine = null
            throw error
        }
    }

    override fun stop() {
        detectionJob?.cancel()
        detectionJob = null
        engine?.release()
        engine = null
    }
}
