/**
 * AudioRecorder - Manages audio recording lifecycle with MediaRecorder API
 * Handles permission, recording state, blob creation, and cleanup
 */
class AudioRecorder {
    constructor(config = {}) {
        this.maxDuration = config.maxDuration || 120; // 2 minutes default
        this.stream = null;
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.startTime = null;
        this.permissionGranted = false;
        this.isRecording = false;

        // Callbacks
        this.onStop = null;
        this.onDataAvailable = null;
        this.onMaxDuration = null;
        this.onError = null;

        // Tab visibility handler
        this.visibilityHandler = this.handleVisibilityChange.bind(this);
    }

    /**
     * Check if MediaRecorder is supported (feature detection, not UA sniffing)
     */
    static isSupported() {
        return typeof MediaRecorder !== 'undefined' &&
            navigator.mediaDevices &&
            navigator.mediaDevices.getUserMedia;
    }

    /**
     * Get supported MIME type for audio recording
     */
    static getSupportedMimeType() {
        const types = [
            'audio/webm',
            'audio/webm;codecs=opus',
            'audio/mp4',
            'audio/ogg;codecs=opus'
        ];

        for (const type of types) {
            if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(type)) {
                return type;
            }
        }

        // Fallback for browsers without isTypeSupported
        return 'audio/webm';
    }

    /**
     * Request microphone permission
     */
    async requestPermission() {
        if (this.permissionGranted) return true;

        try {
            this.stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    sampleRate: 44100
                }
            });
            this.permissionGranted = true;
            return true;
        } catch (error) {
            console.error('Microphone permission denied:', error);
            if (this.onError) {
                this.onError('permission', 'Microphone access is required to record audio');
            }
            return false;
        }
    }

    /**
     * Start recording audio
     */
    async startRecording(callbacks = {}) {
        if (!AudioRecorder.isSupported()) {
            if (callbacks.onError) {
                callbacks.onError('unsupported', 'Audio recording not supported in this browser');
            }
            return false;
        }

        // Always request new stream if we don't have an active one
        // This handles cases where stream was released after previous recording
        if (!this.stream || !this.stream.active) {
            const granted = await this.requestPermission();
            if (!granted) return false;
        }

        // Store callbacks
        this.onDataAvailable = callbacks.onDataAvailable;
        this.onStop = callbacks.onStop;
        this.onMaxDuration = callbacks.onMaxDuration;
        this.onError = callbacks.onError;

        try {
            // Determine MIME type
            const mimeType = AudioRecorder.getSupportedMimeType();

            // Create MediaRecorder
            this.mediaRecorder = new MediaRecorder(this.stream, { mimeType });
            this.audioChunks = [];
            this.startTime = Date.now();
            this.isRecording = true;

            // Handle data available
            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.audioChunks.push(event.data);
                    if (this.onDataAvailable) {
                        this.onDataAvailable(event.data);
                    }
                }
            };

            // Handle stop
            this.mediaRecorder.onstop = () => {
                const duration = this.getRecordingDuration();
                const blob = new Blob(this.audioChunks, { type: mimeType });

                if (this.onStop) {
                    this.onStop(blob, duration);
                }

                this.isRecording = false;

                // CRITICAL: Release microphone immediately after recording stops
                // This prevents the browser from holding onto the microphone indefinitely
                this.releaseMediaStream();
            };

            // Handle errors
            this.mediaRecorder.onerror = (event) => {
                console.error('MediaRecorder error:', event.error);
                if (this.onError) {
                    this.onError('recording', 'Recording failed: ' + event.error.message);
                }
                this.isRecording = false;
            };

            // Start recording
            this.mediaRecorder.start(100); // Collect data every 100ms

            // Set max duration timer
            this.maxDurationTimeout = setTimeout(() => {
                if (this.isRecording) {
                    console.log('Max recording duration reached');
                    this.stopRecording();
                    if (this.onMaxDuration) {
                        this.onMaxDuration();
                    }
                }
            }, this.maxDuration * 1000);

            // Listen for tab visibility change
            document.addEventListener('visibilitychange', this.visibilityHandler);

            return true;
        } catch (error) {
            console.error('Failed to start recording:', error);
            if (this.onError) {
                this.onError('recording', 'Failed to start recording: ' + error.message);
            }
            this.isRecording = false;
            return false;
        }
    }

    /**
     * Stop recording
     */
    stopRecording() {
        if (this.mediaRecorder && this.isRecording) {
            this.mediaRecorder.stop();

            // Clear max duration timeout
            if (this.maxDurationTimeout) {
                clearTimeout(this.maxDurationTimeout);
                this.maxDurationTimeout = null;
            }

            // Remove visibility listener
            document.removeEventListener('visibilitychange', this.visibilityHandler);
        }
    }

    /**
     * Pause recording
     */
    pauseRecording() {
        if (this.mediaRecorder && this.isRecording && this.mediaRecorder.state === 'recording') {
            this.mediaRecorder.pause();
            console.log('Recording paused');
        }
    }

    /**
     * Resume recording
     */
    resumeRecording() {
        if (this.mediaRecorder && this.isRecording && this.mediaRecorder.state === 'paused') {
            this.mediaRecorder.resume();
            console.log('Recording resumed');
        }
    }

    /**
     * Handle tab visibility change - auto-stop recording
     */
    handleVisibilityChange() {
        if (document.hidden && this.isRecording) {
            console.log('Tab hidden, auto-stopping recording');
            this.stopRecording();
        }
    }

    /**
     * Get current recording duration in seconds
     */
    getRecordingDuration() {
        if (!this.startTime) return 0;
        return Math.floor((Date.now() - this.startTime) / 1000);
    }

    /**
     * Release media stream (stop microphone)
     */
    releaseMediaStream() {
        if (this.stream) {
            this.stream.getTracks().forEach(track => {
                track.stop();
                console.log('Audio track stopped:', track.label);
            });
            this.stream = null;
            this.permissionGranted = false;
        }
    }

    /**
     * Cleanup resources
     */
    cleanup() {
        // Stop recording if active
        if (this.isRecording) {
            this.stopRecording();
        }

        // Release media stream
        this.releaseMediaStream();

        // Clear recorder
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.startTime = null;
        this.isRecording = false;

        // Clear timeout
        if (this.maxDurationTimeout) {
            clearTimeout(this.maxDurationTimeout);
            this.maxDurationTimeout = null;
        }

        // Remove listener
        document.removeEventListener('visibilitychange', this.visibilityHandler);
    }
}

// Export for use in script.js
window.AudioRecorder = AudioRecorder;
